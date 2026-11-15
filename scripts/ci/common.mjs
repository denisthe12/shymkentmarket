import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

export const root = resolve(import.meta.dirname, '../..');
export const temporary = mkdtempSync(join(tmpdir(), 'adilbaga-ci-'));
// Windows only: Node and Docker need these to start, none of them carries configuration.
export const platformEnvKeys = (platform = process.platform) => platform === 'win32'
  ? ['SystemRoot', 'SystemDrive', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
    'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432']
  : [];
// pnpm is a .cmd wrapper on Windows, and Node starts those only through a shell.
export const usesShell = (command, platform = process.platform) => platform === 'win32' && command === 'pnpm';
// -race needs cgo and a C compiler, which a Windows machine may lack. CI on Linux always keeps it.
export const goTestArgs = (args, platform = process.platform) => platform === 'win32' ? args.filter(a => a !== '-race') : args;
// Do not inherit runtime, backup, live-profile, provider or libpq configuration.
export const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI', 'CI_BASE_SHA',
  'GOCACHE', 'GOMODCACHE', 'PLAYWRIGHT_BROWSERS_PATH', 'PW_CHANNEL', ...platformEnvKeys()].filter(k => process.env[k])
  .map(k => [k, process.env[k]]));
Object.assign(env, { GOTOOLCHAIN: 'local', COREPACK_ENABLE_AUTO_PIN: '0',
  NEXT_TELEMETRY_DISABLED: '1', DATABASE_URL: 'postgres://ci:ci@127.0.0.1:1/unused',
  DIRECT_URL: 'postgres://ci:ci@127.0.0.1:1/unused' });
export const httpEnv = { NEXT_PUBLIC_API_MODE: 'http',
  NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:18080', API_BASE_URL: 'http://127.0.0.1:18080',
  NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100', NEXT_PUBLIC_ENABLE_TEST_MOCKS: '0' };
export function safe(text) {
  return text.replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '[REDACTED_DATABASE_URL]');
}
export function run(label, command, args = [], options = {}) {
  const r = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', shell: usesShell(command),
    timeout: 20 * 60_000, maxBuffer: 32 * 1024 * 1024, ...options });
  const output = safe((r.stdout ?? '') + (r.stderr ?? ''));
  if (r.status !== 0) {
    console.error(output.slice(-12000));
    throw new Error(`${label}: FAIL (exit ${r.status ?? 'timeout/startup'})`);
  }
  console.log(`${label}: PASS`);
  return output.trim();
}
export function localURL(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error('invalid local CI target'); }
  if (u.protocol !== 'postgres:' || !['127.0.0.1', '[::1]'].includes(u.hostname)
      || !u.port || !/^\/part(?:04_fixture|04_security|04_reader_rollback|08|10_security|11_recovery|13_retention|14_identities)$/.test(u.pathname)
      || u.username !== 'postgres' || u.password !== 'ci-local-only'
      || u.search !== '?sslmode=disable' || u.hash) throw new Error('refusing non-CI target');
  return u;
}
export async function wait(label, probe, budget = 60_000) {
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    if (await probe()) return console.log(`${label}: PASS`);
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`${label}: readiness deadline exceeded`);
}
// No --with-deps: its apt step hung for ~10 min or failed on Ubuntu mirror DNS errors. The hosted
// runner already has Chrome's system libraries; CI still uses the Chromium pinned by Playwright.
export function browserInstallArgs(settings) {
  if (settings.CI !== 'true' && settings.PW_CHANNEL === 'chrome') return null;
  return ['exec', 'playwright', 'install', 'chromium'];
}
export function prepareBrowser(attempts = 3) {
  const args = browserInstallArgs(env);
  if (!args) return console.log('Browser installer: SKIP (local existing Chrome; E2E must still pass)');
  for (let i = 1; ; i++) {
    try { return run('Chromium install', 'pnpm', args, { cwd: join(root, 'frontend'), timeout: 3 * 60_000 }); }
    catch (error) { if (i >= attempts) throw error; console.log(`Chromium install: retry ${i + 1}/${attempts}`); }
  }
}
