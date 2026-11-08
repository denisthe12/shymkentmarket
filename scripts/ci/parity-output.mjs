// The Ephemeral Staging parity tests replay a recorded reference. go test exits 0
// when they skip, so Staging must prove from `-v` output that each one ran and passed.
export const parityTests = ['TestHTTPParity', 'TestLocalSecurityQueryParity', 'TestLocalContentTypeParity',
  'TestLocalCategoryVisibilityParity', 'TestLocalVoiceParity'];

export function assertParityPassed(output, names = parityTests) {
  for (const name of names) {
    if (new RegExp(`^--- SKIP: ${name} \\(`, 'm').test(output)) throw new Error(`parity test skipped: ${name}`);
    if (!new RegExp(`^--- PASS: ${name} \\(`, 'm').test(output)) throw new Error(`parity test did not pass: ${name}`);
  }
}
