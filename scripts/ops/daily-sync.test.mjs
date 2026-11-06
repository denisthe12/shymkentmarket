import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
test('actual scheduled shell preserves success/stale/all-failed/dry-run/apply failure business outcomes',()=>{
  const script=fs.readFileSync('pipeline/scripts/daily-sync.sh','utf8');
  assert.doesNotMatch(script,/c2-ingest-launch/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-daily-scheduled-'));
  try{
    fs.writeFileSync(path.join(dir,'pnpm'),'#!/bin/sh\nprintf "%s\\n" "$1" >> "$TEST_PNPM_LOG"\ncase ",$TEST_FAILED," in *",$1,"*) exit 1;; esac\n',{mode:0o700});
    fs.writeFileSync(path.join(dir,'go'),'#!/bin/sh\nprintf "%s|%s\\n" "$*" "${GOTOOLCHAIN-unset}" >> "$TEST_GO_LOG"\ncase " $* " in *" ./cmd/prune "*) exit "$TEST_PRUNE_EXIT";; esac\ncase " $* " in *" -apply "*) exit "$TEST_APPLY_EXIT";; *) exit "$TEST_DRY_EXIT";; esac\n',{mode:0o700});
    const RET='postgres://retention.invalid/db';
    for(const [name,failed,dry,apply,expected,count,o={}] of [
      ['success','',0,0,0,2],['stale','scrape:dana',0,0,3,2],
      ['two-stale','scrape:dina,scrape:dana',0,0,3,2],
      ['all-failed','scrape:dina,scrape:dana,scrape:fixprice,scrape:anvar',0,0,1,0],
      ['sync-failed','sync',0,0,1,0],['dry-failed','',23,0,1,1],['apply-failed','',0,17,1,2],
      ['prune-success','',0,0,0,3,{ret:RET,prune:0}],['prune-failed','',0,0,4,3,{ret:RET,prune:9}],
      ['prune-failed-stale','scrape:dana',0,0,3,3,{ret:RET,prune:9}],
      ['prune-skipped-on-apply-failure','',0,17,1,2,{ret:RET,prune:0}],
      ['prune-keep-20','',0,0,0,3,{ret:RET,prune:0,keep:'20'}],
    ]){
      const log=path.join(dir,name),pnpmLog=log+'.pnpm';
      const r=spawnSync('bash',['pipeline/scripts/daily-sync.sh'],{encoding:'utf8',timeout:10000,
        env:{...process.env,PATH:dir+':'+process.env.PATH,TEST_PNPM_LOG:pnpmLog,TEST_GO_LOG:log,TEST_FAILED:failed,
          TEST_DRY_EXIT:String(dry),TEST_APPLY_EXIT:String(apply),TEST_PRUNE_EXIT:String(o.prune??0),
          RETENTION_DATABASE_URL:o.ret??'',RETENTION_KEEP_SNAPSHOTS:o.keep??''}});
      assert.equal(r.status,expected,name);
      const steps=fs.readFileSync(pnpmLog,'utf8').trim().split('\n');
      for(const store of ['dina','dana','fixprice','anvar']) assert.equal(steps.filter(x=>x==='scrape:'+store).length,1,name);
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
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
