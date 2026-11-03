import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {connection,validateCI,parseRootReply} from './sync-promotion.mjs';
const sha='a'.repeat(40);
const ci={id:1,run_attempt:1,repository:{full_name:'kiratonine/AdilBaga'},head_repository:{full_name:'kiratonine/AdilBaga'},
  head_sha:sha,head_branch:'main',event:'push',status:'completed',conclusion:'success',path:'.github/workflows/ci.yml'};
const jobs=['Contracts','Go Quality','Nest Reference','Frontend','Pipeline Quality','Security','PostgreSQL Integration','Ephemeral Staging','CI Gate'].map(name=>({name,status:'completed',conclusion:'success'}));
test('manual artifact gate: authenticated CI without CD flag, SSH secrets or remote call',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manual-promotion-test-'));
  try {
    const actual=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim();
    const event=path.join(dir,'event.json'),output=path.join(dir,'output');
    fs.writeFileSync(event,JSON.stringify({inputs:{mode:'manual-artifact',sha:actual,ci_run:'1'}}));
    const responses={'actions/runs/1':{...ci,head_sha:actual},'actions/runs/1/jobs?per_page=100':{jobs},'git/ref/heads/main':{object:{sha:actual}}};
    const preload=()=>'const v='+JSON.stringify(responses)+';globalThis.fetch=async u=>{const k=String(u).split("/repos/kiratonine/AdilBaga/")[1];if(!Object.hasOwn(v,k))throw Error("unexpected_network");return new Response(JSON.stringify(v[k]),{status:200})};';
    const invoke=()=>spawnSync(process.execPath,['--import','data:text/javascript;base64,'+Buffer.from(preload()).toString('base64'),'scripts/ops/sync-promotion.mjs','gate'],{
      env:{PATH:process.env.PATH,HOME:process.env.HOME,GITHUB_REPOSITORY:'kiratonine/AdilBaga',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_TOKEN:'synthetic',GITHUB_EVENT_PATH:event,GITHUB_OUTPUT:output},encoding:'utf8',timeout:10000});
    const good=invoke();assert.equal(good.status,0,good.stderr);assert.match(fs.readFileSync(output,'utf8'),/kind=promote/);
    assert.match(fs.readFileSync(output,'utf8'),/eligible=true/);
    for(const mode of ['unknown','promote']) {
      fs.writeFileSync(event,JSON.stringify({inputs:{mode,sha:actual,ci_run:'1'}}));
      assert.notEqual(invoke().status,0);
    }
    fs.writeFileSync(event,JSON.stringify({inputs:{mode:'manual-artifact',sha:actual,ci_run:'1'}}));
    responses['actions/runs/1'].conclusion='failure';assert.notEqual(invoke().status,0);
    responses['actions/runs/1'].conclusion='success';
    responses['git/ref/heads/main'].object.sha='b'.repeat(40);assert.notEqual(invoke().status,0);
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
test('exact main / nine successful current CI jobs only',()=>{
  assert.doesNotThrow(()=>validateCI(sha,ci,jobs,sha));
  for(const change of [{event:'pull_request'},{head_branch:'other'},{head_sha:'b'.repeat(40)},
    {conclusion:'skipped'},{status:'in_progress'},{path:'.github/workflows/other.yml'},{id:true},{run_attempt:true},
    {repository:{full_name:'other/repo'}}])assert.throws(()=>validateCI(sha,{...ci,...change},jobs,sha));
  assert.throws(()=>validateCI(sha,ci,jobs,'b'.repeat(40)));
  assert.throws(()=>validateCI(sha,ci,jobs.slice(1),sha));
  assert.throws(()=>validateCI(sha,ci,[...jobs.slice(1),jobs[1]],sha));
  assert.throws(()=>validateCI(sha,ci,[{...jobs[0],conclusion:'failure'},...jobs.slice(1)],sha));
});
test('fixed restricted SSH command, strict authenticated known_hosts, no root or injected target',()=>{
  const env={PROMOTE_HOST:'example.invalid',PROMOTE_PORT:'22',PROMOTE_USER:'aktau-promote'};
  const args=connection(env,'/private/identity','/private/hosts');
  assert.equal(args.at(-1),'sudo -n /usr/local/sbin/aktau-sync-promote');
  for(const option of ['BatchMode=yes','IdentitiesOnly=yes','StrictHostKeyChecking=yes','ForwardAgent=no'])assert.ok(args.includes(option));
  for(const change of [{PROMOTE_USER:'root'},{PROMOTE_USER:'user;id'},{PROMOTE_HOST:'host;id'},{PROMOTE_PORT:'0'},{PROMOTE_PORT:'22;id'}])assert.throws(()=>connection({...env,...change},'/key','/hosts'));
});
test('root protocol uses exactly compact JSON/LF and finite safe rejection classes',()=>{
  assert.deepEqual(parseRootReply(0,Buffer.from('{"status":"NO_OP"}\n')),{status:'NO_OP'});
  for(const raw of ['{"status": "NO_OP"}\n','{"status":"NO_OP"}\n{}\n','raw provider log','{"status":"NO_OP"}'])assert.throws(()=>parseRootReply(0,Buffer.from(raw)));
  assert.throws(()=>parseRootReply(1,Buffer.from('{"status":"BLOCKED","errorClass":"active_runtime"}\n')),e=>e.safeClass==='active_runtime');
  assert.throws(()=>parseRootReply(1,Buffer.from('{"status":"BLOCKED","errorClass":"private_provider_payload"}\n')),e=>e.safeClass==='root_rejection'&&!e.message.includes('private_provider_payload'));
});
test('separate workflows: immutable build has no production credential environment',()=>{
  const b=fs.readFileSync('.github/workflows/sync-publisher-build.yml','utf8');
  const p=fs.readFileSync('.github/workflows/sync-publisher-promote.yml','utf8');
  const builder=b.slice(b.indexOf('\n  build:'));
  assert.ok(!builder.includes('secrets.')&&!builder.includes('PROMOTE_SSH_KEY'));
  assert.ok(b.includes("mode:")&&b.includes('options: [build-only, promote, manual-artifact]'));
  assert.ok(p.includes('workflows: [Build sync publisher artifact]'));
  for(const text of [b,p]){
    assert.ok(!/AUTO_DEPLOY_ENABLED|pull_request_target|contents: write|actions: write/.test(text));
    assert.ok(text.includes('cancel-in-progress: false'));
    assert.ok(text.includes('environment: sync-publisher'));
    for(const ref of text.matchAll(/uses:\s+[^@\s]+@([^\s]+)/g))assert.match(ref[1],/^[a-f0-9]{40}$/);
  }
});

test('v2 root commit is acknowledged once; timeout and rollback status require reconciliation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-client-boundary-'));
  try {
    const event=path.join(dir,'event.json');fs.writeFileSync(event,JSON.stringify({inputs:{build_run:'9',artifact_id:'7'}}));
    const build={id:9,run_attempt:1,head_sha:sha,head_branch:'main',path:'.github/workflows/sync-publisher-build.yml',
      event:'workflow_dispatch',status:'completed',conclusion:'success',repository:{full_name:'kiratonine/AdilBaga'},head_repository:{full_name:'kiratonine/AdilBaga'}};
    const responses={'actions/runs/9':build,'actions/runs/9/jobs?per_page=100':{jobs:[{name:'Build immutable sync + C2',conclusion:'success'}]},
      'git/ref/heads/main':{object:{sha}},'actions/runs/9/artifacts?per_page=100':{artifacts:[{id:7,name:`aktau-sync-c2-${sha}-9-1`,expired:false,size_in_bytes:20}]},
      'actions/runs/1':ci,'actions/runs/1/jobs?per_page=100':{jobs}};
    for(const outcome of ['PIPELINE_V2_COMMITTED','PIPELINE_V2_ROLLED_BACK','timeout']) {
      const preload=`import cp from 'node:child_process';import{syncBuiltinESMExports}from'node:module';
        const responses=${JSON.stringify(responses)};let count=0;
        globalThis.fetch=async u=>{const k=String(u).split('/repos/kiratonine/AdilBaga/')[1];if(!Object.hasOwn(responses,k))throw Error('unexpected_network');return new Response(JSON.stringify(responses[k]),{status:200})};
        cp.spawnSync=(name,args,options)=>{
          if(name==='gh')return{status:0,stdout:Buffer.from('explicit synthetic ZIP')};
          if(name==='python3')return{status:0,stdout:Buffer.from('{"kind":"promote","ciRunId":1}')};
          if(name==='ssh'){if(++count!==1)throw Error('repeat_attempt');return ${outcome==='timeout'?"{status:null,error:Error('synthetic timeout')}" : `{status:0,stdout:Buffer.from(JSON.stringify({status:${JSON.stringify(outcome)}})+'\\n')}`}};
          throw Error('unexpected_process')
        };syncBuiltinESMExports();process.on('exit',()=>{if(count!==1)process.exitCode=99});`;
      const result=spawnSync(process.execPath,['--import','data:text/javascript;base64,'+Buffer.from(preload).toString('base64'),'scripts/ops/sync-promotion.mjs','promote'],{
        encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH,HOME:dir,GITHUB_REPOSITORY:'kiratonine/AdilBaga',GITHUB_REF:'refs/heads/main',
          GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_EVENT_PATH:event,GITHUB_TOKEN:'synthetic',SYNC_C2_PROMOTION_ENABLED:'true',
          PROMOTE_HOST:'example.invalid',PROMOTE_PORT:'22',PROMOTE_USER:'aktau-promote',PROMOTE_SSH_KEY:'synthetic',PROMOTE_KNOWN_HOSTS:'synthetic'}});
      assert.equal(result.status,outcome==='PIPELINE_V2_COMMITTED'?0:1,result.stderr);
      if(outcome==='PIPELINE_V2_COMMITTED')assert.match(result.stdout,/PIPELINE_V2_COMMITTED/);
      if(outcome==='timeout')assert.match(result.stderr,/remote_reconciliation_required/);
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
});
