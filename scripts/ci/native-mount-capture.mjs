// CI-only bounded capture for the one owned Docker native qualification caller.
import { spawnSync } from 'node:child_process';
import { safe } from './common.mjs';
export const CAP = 2 * 1024 * 1024;
export function captureNative(args, options, spawn = spawnSync, write = s => process.stdout.write(s)) {
  const result = spawn('docker', args, { ...options, encoding: 'utf8', timeout: 180_000, maxBuffer: CAP });
  const output = safe((result.stdout ?? '') + (result.stderr ?? ''));
  const bytes = Buffer.byteLength(output);
  const complete = !result.error && bytes <= CAP;
  write(`NATIVE_CAPTURE ${JSON.stringify({ status: result.status, complete, bytes,
    error: result.error ? ['ETIMEDOUT', 'ENOBUFS'].includes(result.error.code) ? result.error.code : 'STARTUP' : null })}\n`);
  // Preserve FIRST failure and the remaining bounded transcript, not only its tail.
  write(complete ? output : Buffer.from(output).subarray(0, CAP).toString('utf8'));
  if (!complete || result.status !== 0) throw new Error('native_mount_qualification_failed');
}
