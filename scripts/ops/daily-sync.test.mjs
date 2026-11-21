import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
test('actual scheduled shell preserves success/all-failed/dry-run/apply failure business outcomes',()=>{
  const script=fs.readFileSync('pipeline/scripts/daily-sync.sh','utf8');
  assert.doesNotMatch(script,/c2-ingest-launch/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-daily-scheduled-'));
  try{
    fs.writeFileSync(path.join(dir,'pnpm'),'#!/bin/sh\nprintf "%s\\n" "$1" >> "$TEST_PNPM_LOG"\ncase ",$TEST_FAILED," in *",$1,"*) exit 1;; esac\n',{mode:0o700});
    fs.writeFileSync(path.join(dir,'go'),'#!/bin/sh\nprintf "%s|%s\\n" "$*" "${GOTOOLCHAIN-unset}" >> "$TEST_GO_LOG"\ncase " $* " in *" ./cmd/prune "*) exit "$TEST_PRUNE_EXIT";; esac\ncase " $* " in *" -apply "*) exit "$TEST_APPLY_EXIT";; *) exit "$TEST_DRY_EXIT";; esac\n',{mode:0o700});
    const RET='postgres://retention.invalid/db';
    for(const [name,failed,dry,apply,expected,count,o={}] of [
      ['success','',0,0,0,2],
      ['all-failed','scrape:magnum',0,0,1,0],
      ['sync-failed','sync',0,0,1,0],['dry-failed','',23,0,1,1],['apply-failed','',0,17,1,2],
      ['prune-success','',0,0,0,3,{ret:RET,prune:0}],['prune-failed','',0,0,4,3,{ret:RET,prune:9}],
      ['prune-skipped-on-apply-failure','',0,17,1,2,{ret:RET,prune:0}],
      ['prune-keep-20','',0,0,0,3,{ret:RET,prune:0,keep:'20'}],
    ]){
      const log=path.join(dir,name),pnpmLog=log+'.pnpm',runDir=path.join(dir,name+'.runs');
      const r=spawnSync('bash',['pipeline/scripts/daily-sync.sh'],{encoding:'utf8',timeout:10000,
        env:{...process.env,PATH:dir+':'+process.env.PATH,TEST_PNPM_LOG:pnpmLog,TEST_GO_LOG:log,TEST_FAILED:failed,
          TEST_DRY_EXIT:String(dry),TEST_APPLY_EXIT:String(apply),TEST_PRUNE_EXIT:String(o.prune??0),
          RETENTION_DATABASE_URL:o.ret??'',RETENTION_KEEP_SNAPSHOTS:o.keep??'',RUN_STATUS_DIR:runDir}});
      assert.equal(r.status,expected,name);
      const steps=fs.readFileSync(pnpmLog,'utf8').trim().split('\n');
      for(const store of ['magnum']) assert.equal(steps.filter(x=>x==='scrape:'+store).length,1,name);
      assert.equal(steps.filter(x=>x==='sync').length,name==='all-failed'?0:1,name);
      const lines=fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n'):[];
      assert.equal(lines.length,count,name);assert.ok(lines.every(v=>v.endsWith('|local')),name);
      const bundle=path.resolve('data/sync/bundle.json');
      if(count) assert.equal(lines[0],`run ./cmd/ingest -bundle ${bundle}|local`);
      if(count===2) assert.equal(lines[1],`run ./cmd/ingest -bundle ${bundle} -apply|local`);
      const pruneRan=count===3;
      if(pruneRan) assert.equal(lines[2],`run ./cmd/prune -keep ${o.keep??14} -apply|local`,name);
      else assert.ok(!lines.some(v=>v.includes('cmd/prune')),name);
      if(!o.ret&&expected!==1) assert.match(r.stdout,/\[sync\] retention skipped/,name);
      if(pruneRan&&o.prune) assert.match(r.stderr,/\[sync\] retention failed/,name);
      if(pruneRan&&!o.prune) assert.doesNotMatch(r.stdout+r.stderr,/retention (skipped|failed)/,name);
      if(o.ret&&!pruneRan) assert.doesNotMatch(r.stdout+r.stderr,/retention (skipped|failed)/,name);
      if(count===2){assert.doesNotMatch(lines[0],/-apply/);assert.match(lines[1],/-apply/)}
      const files=fs.readdirSync(runDir);
      assert.equal(files.length,1,name+': single status file');
      assert.match(files[0],/^daily-\d{8}T\d{6}Z\.json$/,name);
      assert.equal(fs.statSync(path.join(runDir,files[0])).mode&0o777,0o644,name);
      const st=JSON.parse(fs.readFileSync(path.join(runDir,files[0]),'utf8'));
      assert.deepEqual(Object.keys(st),['version','kind','startedAt','finishedAt','status','exitCode','published','stores','stale','retention'],name);
      const ALL=['magnum'];
      const failedStores=failed.split(',').filter(x=>x.startsWith('scrape:')).map(x=>x.slice(7));
      const published=count>=2&&apply===0;
      const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
      assert.equal(st.version,1);assert.equal(st.kind,'daily');assert.equal(st.status,'finished',name);
      assert.match(st.startedAt,ISO);assert.match(st.finishedAt,ISO);
      assert.equal(st.exitCode,expected,name);assert.equal(st.published,published,name);
      assert.deepEqual(st.stores,Object.fromEntries(ALL.map(s=>[s,failedStores.includes(s)?1:0])),name);
      assert.deepEqual(st.stale,published?ALL.filter(s=>failedStores.includes(s)):[],name);
      assert.equal(st.retention,!published?null:!o.ret?'skipped':o.prune?'failed':'ok',name);
      if(name==='success') assert.deepEqual({...st,startedAt:0,finishedAt:0},{version:1,kind:'daily',startedAt:0,finishedAt:0,status:'finished',exitCode:0,published:true,stores:{magnum:0},stale:[],retention:'skipped'});
      if(name==='all-failed') assert.deepEqual([st.exitCode,st.published,st.stale,st.retention],[1,false,[],null]);
      if(name==='apply-failed') assert.deepEqual([st.exitCode,st.published,st.retention],[1,false,null]);
      if(name==='prune-failed') assert.deepEqual([st.exitCode,st.retention],[4,'failed']);
      if(name==='prune-success') assert.equal(st.retention,'ok');
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

function fakeBins(dir,pnpmBody){
  fs.writeFileSync(path.join(dir,'pnpm'),'#!/bin/sh\n'+pnpmBody,{mode:0o700});
  fs.writeFileSync(path.join(dir,'go'),'#!/bin/sh\nexit 0\n',{mode:0o700});
}

test('no RUN_STATUS_DIR writes no files',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-daily-nostatus-'));
  try{
    fakeBins(dir,'exit 0\n');
    const tmp=path.join(dir,'tmp');fs.mkdirSync(tmp);
    const env={...process.env,PATH:dir+':'+process.env.PATH,TMPDIR:tmp,RETENTION_DATABASE_URL:''};
    delete env.RUN_STATUS_DIR;
    const r=spawnSync('bash',['pipeline/scripts/daily-sync.sh'],{encoding:'utf8',timeout:10000,env});
    assert.equal(r.status,0);
    assert.deepEqual(fs.readdirSync(tmp),[]);
    assert.deepEqual(fs.readdirSync(dir).sort(),['go','pnpm','tmp']);
    const r2=spawnSync('bash',['pipeline/scripts/daily-sync.sh'],{encoding:'utf8',timeout:10000,env:{...env,RUN_STATUS_DIR:''}});
    assert.equal(r2.status,0);
    assert.deepEqual(fs.readdirSync(tmp),[]);
    assert.deepEqual(fs.readdirSync(dir).sort(),['go','pnpm','tmp']);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('keeps the newest 60 files',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-daily-retain-'));
  const runDir=path.join(dir,'runs');fs.mkdirSync(runDir);
  try{
    fakeBins(dir,'exit 0\n');
    const names=[];
    for(let i=0;i<65;i++){
      const n='daily-20260101T0000'+String(i).padStart(2,'0')+'Z.json';
      const p=path.join(runDir,n);fs.writeFileSync(p,'{}');
      const t=new Date(Date.UTC(2026,0,1,0,0,i));fs.utimesSync(p,t,t);names.push(n);
    }
    const r=spawnSync('bash',['pipeline/scripts/daily-sync.sh'],{encoding:'utf8',timeout:10000,
      env:{...process.env,PATH:dir+':'+process.env.PATH,RETENTION_DATABASE_URL:'',RUN_STATUS_DIR:runDir}});
    assert.equal(r.status,0);
    const left=fs.readdirSync(runDir);
    assert.equal(left.length,60);
    assert.ok(left.some(x=>/^daily-\d{8}T\d{6}Z\.json$/.test(x)&&!names.includes(x)),'new file kept');
    assert.ok(!left.includes(names[0])&&!left.includes(names[5]),'oldest removed');
    assert.ok(left.includes(names[64]));
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('killed run leaves status running',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-daily-killed-'));
  const runDir=path.join(dir,'runs');
  let child;
  try{
    fakeBins(dir,'sleep 5\n');
    child=spawn('bash',['pipeline/scripts/daily-sync.sh'],{detached:true,stdio:'ignore',
      env:{...process.env,PATH:dir+':'+process.env.PATH,RETENTION_DATABASE_URL:'',RUN_STATUS_DIR:runDir}});
    const read=()=>{try{const f=fs.readdirSync(runDir).filter(x=>x.endsWith('.json'));return f.length?fs.readFileSync(path.join(runDir,f[0]),'utf8'):''}catch{return ''}};
    const deadline=Date.now()+4000;
    while(!read().includes('"status":"running"')&&Date.now()<deadline) await new Promise(r=>setTimeout(r,50));
    assert.match(read(),/"status":"running"/);
    process.kill(-child.pid,'SIGKILL');
    await new Promise(r=>setTimeout(r,300));
    const st=JSON.parse(read());
    assert.equal(st.status,'running');assert.equal(st.finishedAt,null);assert.equal(st.exitCode,null);
    assert.deepEqual(st.stores,{magnum:null});
  }finally{try{process.kill(-child.pid,'SIGKILL')}catch{}fs.rmSync(dir,{recursive:true,force:true})}
});

for(const sig of ['SIGTERM','SIGINT','SIGHUP']) test(`${sig} to the process group leaves status running and dies by the signal`,async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-daily-sig-'));
  const runDir=path.join(dir,'runs');
  let child;
  try{
    fakeBins(dir,'sleep 30\n');
    child=spawn('bash',['pipeline/scripts/daily-sync.sh'],{detached:true,stdio:'ignore',
      env:{...process.env,PATH:dir+':'+process.env.PATH,RETENTION_DATABASE_URL:'',RUN_STATUS_DIR:runDir}});
    const exited=new Promise(r=>child.on('exit',(code,signal)=>r({code,signal})));
    const read=()=>{try{const f=fs.readdirSync(runDir).filter(x=>x.endsWith('.json'));return f.length?fs.readFileSync(path.join(runDir,f[0]),'utf8'):''}catch{return ''}};
    const deadline=Date.now()+4000;
    while(!read().includes('"status":"running"')&&Date.now()<deadline) await new Promise(r=>setTimeout(r,50));
    assert.match(read(),/"status":"running"/);
    await new Promise(r=>setTimeout(r,200));
    process.kill(-child.pid,sig);
    const res=await Promise.race([exited,new Promise(r=>setTimeout(()=>r('timeout'),5000))]);
    assert.notEqual(res,'timeout');
    const n={SIGTERM:15,SIGINT:2,SIGHUP:1}[sig];
    assert.ok(res.signal===sig||res.code===128+n,JSON.stringify(res));
    const st=JSON.parse(read());
    assert.equal(st.status,'running');assert.equal(st.finishedAt,null);assert.equal(st.exitCode,null);
  }finally{try{process.kill(-child.pid,'SIGKILL')}catch{}fs.rmSync(dir,{recursive:true,force:true})}
});
