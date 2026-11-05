import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
test('actual scheduled shell preserves success/stale/all-failed/dry-run/apply failure business outcomes',()=>{
  const script=fs.readFileSync('pipeline/scripts/daily-sync.sh','utf8');
  assert.doesNotMatch(script,/c2-ingest-launch/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aktau-c2-scheduled-'));
  try{
    fs.writeFileSync(path.join(dir,'pnpm'),'#!/bin/sh\nprintf "%s\\n" "$1" >> "$TEST_PNPM_LOG"\ncase ",$TEST_FAILED," in *",$1,"*) exit 1;; esac\n',{mode:0o700});
    fs.writeFileSync(path.join(dir,'go'),'#!/bin/sh\nprintf "%s|%s\\n" "$*" "${GOTOOLCHAIN-unset}" >> "$TEST_GO_LOG"\ncase " $* " in *" -apply "*) exit "$TEST_APPLY_EXIT";; *) exit "$TEST_DRY_EXIT";; esac\n',{mode:0o700});
    for(const [name,failed,dry,apply,expected,count] of [
      ['success','',0,0,0,2],['stale','scrape:dana',0,0,3,2],
      ['two-stale','scrape:dina,scrape:dana',0,0,3,2],
      ['all-failed','scrape:dina,scrape:dana,scrape:fixprice,scrape:anvar',0,0,1,0],
      ['sync-failed','sync',0,0,1,0],['dry-failed','',23,0,1,1],['apply-failed','',0,17,1,2],
    ]){
      const log=path.join(dir,name),pnpmLog=log+'.pnpm';
      const r=spawnSync('bash',['pipeline/scripts/daily-sync.sh'],{encoding:'utf8',timeout:10000,
        env:{...process.env,PATH:dir+':'+process.env.PATH,TEST_PNPM_LOG:pnpmLog,TEST_GO_LOG:log,TEST_FAILED:failed,
          TEST_DRY_EXIT:String(dry),TEST_APPLY_EXIT:String(apply)}});
      assert.equal(r.status,expected,name);
      const lines=fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n'):[];
      assert.equal(lines.length,count,name);assert.ok(lines.every(v=>v.endsWith('|local')),name);
      const bundle=path.resolve('data/sync/bundle.json');
      if(count) assert.equal(lines[0],`run ./cmd/ingest -bundle ${bundle}|local`);
      if(count===2) assert.equal(lines[1],`run ./cmd/ingest -bundle ${bundle} -apply|local`);
      if(count===2){assert.doesNotMatch(lines[0],/-apply/);assert.match(lines[1],/-apply/)}
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
