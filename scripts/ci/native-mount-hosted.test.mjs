import test from 'node:test';
import assert from 'node:assert/strict';
import { context, hash, trustedGitFile } from './native-mount-hosted.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const base = { GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',
  RUNNER_ARCH:'X64',ImageOS:'ubuntu24',GITHUB_REPOSITORY:'kiratonine/AdilBaga',GITHUB_WORKFLOW:'CI',
  GITHUB_JOB:'go',GITHUB_SHA:'a'.repeat(40),GITHUB_EVENT_NAME:'pull_request',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1' };
const event = {pull_request:{head:{sha:'b'.repeat(40),repo:{full_name:base.GITHUB_REPOSITORY}},
  base:{ref:'main',repo:{full_name:base.GITHUB_REPOSITORY}}}};
test('exact hosted job binds source head and actual checkout',()=>{
  const c=context(base,event,base.GITHUB_SHA); assert.equal(c.headSha,'b'.repeat(40)); assert.equal(c.checkoutSha,base.GITHUB_SHA);
});
test('fork source is rejected before sudo',()=>{
  assert.throws(()=>context(base,{pull_request:{...event.pull_request,head:{sha:'b'.repeat(40),repo:{full_name:'fork/project'}}}},base.GITHUB_SHA));
});
test('local, slim, self-hosted, wrong job or platform cannot load policy',()=>{
  for (const delta of [{GITHUB_ACTIONS:'false'},{RUNNER_ENVIRONMENT:'self-hosted'},{ImageOS:'ubuntu-slim'},
    {RUNNER_OS:'Windows'},{RUNNER_ARCH:'ARM64'},{GITHUB_JOB:'security'},{GITHUB_WORKFLOW:'other'},
    {GITHUB_RUN_ID:'-1'},{GITHUB_RUN_ATTEMPT:'0'},{GITHUB_REPOSITORY:'other/repo'}])
    assert.throws(()=>context({...base,...delta},event,base.GITHUB_SHA));
});
test('checkout and head mismatch/malformed source reject',()=>{
  assert.throws(()=>context(base,event,'c'.repeat(40)));
  assert.throws(()=>context(base,{pull_request:{...event.pull_request,head:{...event.pull_request.head,sha:'bad'}}},base.GITHUB_SHA));
});
test('push main accepted; dispatch and non-main push rejected',()=>{
  assert.equal(context({...base,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main'},{},base.GITHUB_SHA).headSha,base.GITHUB_SHA);
  for (const delta of [{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/feature'}])
    assert.throws(()=>context({...base,...delta},{},base.GITHUB_SHA));
});
test('profile byte tamper changes exact digest',()=>{
  assert.notEqual(hash(Buffer.from('profile')),hash(Buffer.from('profile\n')));
});
test('immutable Git commit/tree/blob chain supplies exact public bytes',()=>{
  const head=execFileSync('/usr/bin/git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  assert.deepEqual(trustedGitFile(process.cwd(),head,'scripts/ci/common.mjs'),readFileSync('scripts/ci/common.mjs'));
  assert.throws(()=>trustedGitFile(process.cwd(),head,'../outside'));
});
