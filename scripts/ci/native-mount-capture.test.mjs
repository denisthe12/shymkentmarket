import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureNative, CAP } from './native-mount-capture.mjs';

test('preserves first and last failure beyond legacy 12000 tail; fixed Docker limits', () => {
  const text = 'FIRST_ERRNO_EPERM\n' + 'x'.repeat(15000) + '\nLAST_FAILURE\n';
  let out = '';
  assert.throws(() => captureNative(['run'], { cwd: '/fixture', env: {} }, (cmd, args, options) => {
    assert.equal(cmd, 'docker'); assert.deepEqual(args, ['run']);
    assert.equal(options.maxBuffer, CAP); assert.equal(options.timeout, 180000);
    return { status: 1, stdout: text, stderr: '' };
  }, s => { out += s; }), /native_mount_qualification_failed/);
  assert.ok(out.includes('FIRST_ERRNO_EPERM')); assert.ok(out.includes('LAST_FAILURE'));
});

test('success is real child exit0, secret URI sanitization remains', () => {
  let out = '';
  captureNative([], {}, () => ({ status: 0, stdout: 'postgres://fixture:private@localhost/test\n', stderr: '' }), s => { out += s; });
  assert.ok(out.includes('[REDACTED_DATABASE_URL]')); assert.ok(!out.includes('private@'));
});

for (const code of ['ETIMEDOUT', 'ENOBUFS', 'ENOENT']) test(`capture ${code} is failure, never silent success`, () => {
  let out = '';
  assert.throws(() => captureNative([], {}, () => ({ status: null, error: { code }, stdout: 'FIRST', stderr: '' }), s => { out += s; }), /native_mount_qualification_failed/);
  assert.ok(out.includes('"complete":false')); assert.ok(out.includes('FIRST'));
});

test('oversized combined streams bounded and fail closed', () => {
  let out = '';
  assert.throws(() => captureNative([], {}, () => ({ status: 0, stdout: 'x'.repeat(CAP), stderr: 'EXTRA' }), s => { out += s; }), /native_mount_qualification_failed/);
  assert.ok(Buffer.byteLength(out) < CAP + 200); assert.ok(out.includes('"complete":false'));
});
