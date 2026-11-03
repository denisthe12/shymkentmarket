import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { preparePlan, reviewBundle, NODE_FILES, BUILD_RECIPE } from './c2-provisioning-plan.mjs';
test('offline plan never accepts an approval or probes environment', () => {
  assert.equal(preparePlan().status, 'C2_READY_FOR_APPROVAL');
  assert.throws(() => preparePlan({ approved: true }));
  const r = spawnSync(process.execPath, [path.join(import.meta.dirname, 'c2-provisioning-plan.mjs')], { env: {}, encoding: 'utf8' });
  assert.equal(r.status, 0); assert.equal(r.stdout, 'C2_READY_FOR_APPROVAL\n');
});
test('real installer sandbox negative/positive suite (no host root writes)', () => {
  // Bound each suite independently; adding the v2 crash matrix must not turn
  // one 60s subprocess into an unbounded process or omit historical coverage.
  const root = path.resolve(import.meta.dirname, '../..');
  const suites = fs.readdirSync(path.join(root, 'ops/c2')).filter(n => /^test_.*\.py$/.test(n)).sort();
  assert.ok(suites.length > 0);
  for (const suite of suites) {
    let cases = [null];
    if (suite === 'test_pipeline_release.py') {
      // The SIGKILL matrix and child deadline tests each retain their 60s cap.
      // Enumerate unittest itself so no newly added test silently disappears.
      const listing = spawnSync('python3', ['-B', '-c',
        'import json,unittest; s=unittest.TestLoader().discover("ops/c2",pattern="test_pipeline_release.py"); q=[s]; names=[]\nwhile q:\n t=q.pop()\n if isinstance(t,unittest.TestSuite):q.extend(t)\n else:names.append(t.id().rsplit(".",1)[1])\nprint(json.dumps(sorted(names)))'],
        { cwd: root, encoding: 'utf8', timeout: 10000 });
      assert.equal(listing.status, 0, listing.stderr);
      cases = JSON.parse(listing.stdout);
      assert.ok(cases.length > 0 && new Set(cases).size === cases.length);
      assert.ok(cases.every(n => /^test_[a-z0-9_]+$/.test(n)));
    }
    for (const name of cases) {
      const r = spawnSync('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'ops/c2', '-p', suite,
        ...(name ? ['-k', name] : [])], { cwd: root, encoding: 'utf8', timeout: 60000 });
      assert.equal(r.status, 0, `${suite}/${name ?? 'all'} failed: ${r.stderr}`);
      assert.match(r.stderr, /OK/);
      assert.doesNotMatch(r.stderr, /skipped=/);
    }
  }
});
test('bundle review binds exact immutable source and rejects drift, links and malformed ELF', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const sha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aktau-c2-review-'));
  try {
    const elf = Buffer.alloc(64); elf.set([0x7f, 69, 76, 70, 2, 1]); elf.writeUInt16LE(62, 18);
    for (const name of ['c2projection', 'relayprobe']) fs.writeFileSync(path.join(dir, name), elf, { mode: 0o600 });
    for (const name of NODE_FILES) {
      const source=spawnSync('git',['show',`${sha}:scripts/revalidation/${name}`],{cwd:root,maxBuffer:2<<20});
      assert.equal(source.status,0);
      fs.writeFileSync(path.join(dir,name),source.stdout);
    }
    fs.writeFileSync(path.join(dir, 'source-manifest.json'), JSON.stringify({ sourceSha: sha, recipe: BUILD_RECIPE, nodeMajor: 24 }) + '\n', { mode: 0o600 });
    assert.equal(reviewBundle(dir, sha).status, 'REVIEW_REQUIRED_NOT_APPROVAL');
    assert.throws(() => reviewBundle(dir, '0'.repeat(40)), /BLOCKED/);
    const module = path.join(dir, NODE_FILES[0]); const original = fs.readFileSync(module);
    fs.appendFileSync(module, '// drift\n'); assert.throws(() => reviewBundle(dir, sha), /BLOCKED/); fs.writeFileSync(module, original);
    const manifest = path.join(dir, 'source-manifest.json');
    fs.linkSync(manifest, path.join(dir, 'extra')); assert.throws(() => reviewBundle(dir, sha), /BLOCKED/); fs.unlinkSync(path.join(dir, 'extra'));
    const binary = path.join(dir, 'relayprobe'); fs.writeFileSync(binary, 'bad ELF'); assert.throws(() => reviewBundle(dir, sha));
  } finally { fs.rmSync(dir, { recursive: true }); }
});
