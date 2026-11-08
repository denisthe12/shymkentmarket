import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parityTests, assertParityPassed } from './parity-output.mjs';

const passing = names => names.map(n => `=== RUN   ${n}\n--- PASS: ${n} (0.01s)\n`).join('') + 'PASS\nok  \tadilbaga/backend-go/tests/integration\t0.5s\n';

test('the five Staging parity tests are named once', () => {
  assert.deepEqual(parityTests, ['TestHTTPParity', 'TestLocalSecurityQueryParity', 'TestLocalContentTypeParity',
    'TestLocalCategoryVisibilityParity', 'TestLocalVoiceParity']);
});

test('all five top-level PASS lines are accepted', () => {
  assert.doesNotThrow(() => assertParityPassed(passing(parityTests)));
});

test('a skipped parity test fails even when go test exits 0', () => {
  const output = passing(parityTests.slice(1)) + '--- SKIP: TestHTTPParity (0.00s)\n';
  assert.throws(() => assertParityPassed(output), /parity test skipped: TestHTTPParity/);
});

test('a parity test that did not run at all fails', () => {
  assert.throws(() => assertParityPassed(passing(parityTests.slice(0, 4))), /parity test did not pass: TestLocalVoiceParity/);
});

test('a subtest PASS line does not count as the top-level test', () => {
  const output = passing(parityTests.slice(1)) + '    --- PASS: TestHTTPParity/price_asc (0.00s)\n';
  assert.throws(() => assertParityPassed(output), /did not pass: TestHTTPParity/);
});
