// Linux-only: openState rejects Windows and root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateState, upgradeState, parseStateText, openState } from './monitor-state.mjs';

const A = 'a'.repeat(32), B = 'b'.repeat(32), C = 'c'.repeat(32);
const item = (id, type, atUTC, attempts = 0) => ({ id, type, atUTC, attempts });
const v2 = (phase, queue, lastUTC = 2000) => ({ version: 2, phase, failures: { OK: 0, DEGRADED: 1, INCIDENT: 2 }[phase], lastUTC, queue });
const v1Latched = { version: 1, phase: 'INCIDENT', failures: 2, lastUTC: 1792869347441,
  pending: { id: A, type: 'incident_opened', atUTC: 1792869347441, nextAttemptUTC: 1792869407441, attempts: 1, manualReconciliation: true } };

test('v1 latched pending upgrades to a one-item queue', () => assert.deepEqual(upgradeState(v1Latched),
  { version: 2, phase: 'INCIDENT', failures: 2, lastUTC: 1792869347441, queue: [item(A, 'incident_opened', 1792869347441, 1)] }));
test('v1 without pending upgrades to an empty queue', () => assert.deepEqual(
  upgradeState({ version: 1, phase: 'OK', failures: 0, lastUTC: null, pending: null }),
  { version: 2, phase: 'OK', failures: 0, lastUTC: null, queue: [] }));
test('upgradeState rejects an invalid v1 and passes a valid v2', () => {
  assert.throws(() => upgradeState({ ...v1Latched, failures: 0 }), /state_invalid/);
  const ok = v2('INCIDENT', [item(A, 'incident_opened', 1000)]);
  assert.deepEqual(upgradeState(ok), ok);
});
test('v2 accepts alternating queue ending consistently', () => {
  validateState(v2('INCIDENT', [item(A, 'incident_opened', 1000), item(B, 'incident_recovered', 1500), item(C, 'incident_opened', 2000, 3)]));
  validateState(v2('OK', [item(A, 'incident_recovered', 1000)]));
  validateState(v2('OK', []));
});
test('v2 rejects non-alternating queue', () => assert.throws(() => validateState(
  v2('INCIDENT', [item(A, 'incident_opened', 1000), item(B, 'incident_opened', 1500)])), /state_invalid/));
test('v2 rejects last opened with phase OK', () => assert.throws(() => validateState(
  v2('OK', [item(A, 'incident_opened', 1000)])), /state_invalid/));
test('v2 rejects last recovered with phase INCIDENT', () => assert.throws(() => validateState(
  v2('INCIDENT', [item(A, 'incident_recovered', 1000)])), /state_invalid/));
test('v2 rejects 11 items', () => {
  const q = Array.from({ length: 11 }, (_, i) => item(String(i).padStart(32, '0'), i % 2 ? 'incident_recovered' : 'incident_opened', 1000 + i));
  assert.throws(() => validateState(v2('INCIDENT', q)), /state_invalid/);
});
test('v2 accepts 10 items', () => {
  const q = Array.from({ length: 10 }, (_, i) => item(String(i).padStart(32, '0'), i % 2 ? 'incident_recovered' : 'incident_opened', 1000 + i));
  validateState(v2('OK', q));
});
test('v2 rejects atUTC above lastUTC and decreasing atUTC', () => {
  assert.throws(() => validateState(v2('INCIDENT', [item(A, 'incident_opened', 2001)])), /state_invalid/);
  assert.throws(() => validateState(v2('INCIDENT', [item(A, 'incident_opened', 1500), item(B, 'incident_recovered', 1400), item(C, 'incident_opened', 1600)])), /state_invalid/);
});
test('v2 rejects non-empty queue with lastUTC null', () => assert.throws(() => validateState(
  v2('OK', [item(A, 'incident_recovered', 0)], null)), /state_invalid/));
test('v2 rejects malformed items and v1 shape', () => {
  assert.throws(() => validateState(v2('INCIDENT', [item('x', 'incident_opened', 1000)])), /state_invalid/);
  assert.throws(() => validateState(v2('INCIDENT', [item(A, 'other', 1000)])), /state_invalid/);
  assert.throws(() => validateState(v2('INCIDENT', [item(A, 'incident_opened', 1000, -1)])), /state_invalid/);
  assert.throws(() => validateState(v2('INCIDENT', [item(A, 'incident_opened', 1000, 1000001)])), /state_invalid/);
  assert.throws(() => validateState(v2('INCIDENT', [{ ...item(A, 'incident_opened', 1000), extra: 1 }])), /state_invalid/);
  assert.throws(() => validateState({ version: 1, phase: 'OK', failures: 0, lastUTC: null, pending: null }), /state_invalid/);
});
test('parseStateText rejects noncanonical v2 (extra spaces)', () => assert.throws(
  () => parseStateText(JSON.stringify(v2('OK', []), null, 1) + '\n'), /state_noncanonical/));
test('parseStateText upgrades canonical v1 and rejects noncanonical v1', () => {
  assert.equal(parseStateText(JSON.stringify(v1Latched) + '\n').version, 2);
  assert.throws(() => parseStateText(JSON.stringify(v1Latched)), /state_noncanonical/);
});
test('openState reads a v1 file and saves canonical v2', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aktau-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.chmodSync(dir, 0o700);
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, JSON.stringify(v1Latched) + '\n', { mode: 0o600 });
  const s = openState(dir);
  const value = s.value;
  assert.equal(value.version, 2);
  s.save(value); s.close();
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text, JSON.stringify(value) + '\n');
  assert.ok(text.includes('"queue"') && !text.includes('pending'));
});
test('openState starts from an empty v2 state', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aktau-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.chmodSync(dir, 0o700);
  const s = openState(dir);
  assert.deepEqual(s.value, { version: 2, phase: 'OK', failures: 0, lastUTC: null, queue: [] });
  s.close();
});
