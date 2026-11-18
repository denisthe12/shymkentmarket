import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, temporary, env, httpEnv, run, wait, prepareBrowser } from './common.mjs';
import { postgres } from './postgres.mjs';
import { parityTests, assertParityPassed } from './parity-output.mjs';

// REFERENCE_RECORD=1 rewrites backend-go/tests/integration/testdata/reference from the
// local reference API and stops after the parity run. Never in hosted CI.
const record = process.env.REFERENCE_RECORD === '1';
// Windows needs the .exe suffix to spawn the binary (local runs only).
const goAPI = join(temporary, process.platform === 'win32' ? 'api.exe' : 'api');
if (record && process.env.CI) throw new Error('reference recording is local only');

await postgres(async ({ name, url, sql, login, load, docker }) => {
  login('aktau_api_runtime', 'aktau_api_reader'); load('part04_fixture');
  sql('part04_fixture', readFileSync(join(root, 'scripts/ci/fixtures/voice-parity-overlay.sql')));
  console.log('CI-only Voice fixture overlay invariants: PASS');
  run('Go API build', 'go', ['build', '-o', goAPI, './cmd/api'], { cwd: join(root, 'backend-go') });
  for (const directory of ['contracts', 'frontend']) run(`${directory} frozen install`, 'pnpm', ['install', '--frozen-lockfile'], { cwd: join(root, directory) });
  const processes = [];
  const start = (command, args, cwd, extra) => {
    const child = spawn(command, args, { cwd, env: { ...env, ...extra }, stdio: 'ignore' });
    // Only direct binaries (not shell process groups) are backgrounded.
    processes.push(child); return child;
  };
  const available = async (origin, path, status) => {
    try { return (await fetch(origin + path, { signal: AbortSignal.timeout(2500) })).status === status; } catch { return false; }
  };
  let apiContainer;
  let network;
  try {
    start(goAPI, [], root, { APP_ENV: 'test', PORT: '18080',
      DATABASE_URL: url('part04_fixture', 'aktau_api_runtime'), CORS_ALLOWED_ORIGINS: 'http://localhost:3100,http://127.0.0.1:3100',
      RATE_LIMIT_RPS: '1000', RATE_LIMIT_BURST: '1000',
      VOICE_RATE_LIMIT_RPS: '1000', VOICE_RATE_LIMIT_BURST: '1000', LOG_LEVEL: 'error' });
    await wait('Go live', () => available('http://127.0.0.1:18080', '/health/live', 200));
    for (const path of ['/health/ready', '/api/categories', '/api/products', '/api/dashboard']) await wait(`Go ${path}`, () => available('http://127.0.0.1:18080', path, 200));
    if (!await available('http://127.0.0.1:18080', '/metrics', 404)) throw new Error('metrics must not be public');
    const origin = 'http://127.0.0.1:18080';
    // Expire the startup success so this burst exercises cold admission.
    await new Promise(resolve => setTimeout(resolve, 1100));
    const underReadinessTraffic = await Promise.all([
      ...Array.from({ length: 32 }, async () => {
        const response = await fetch(origin + '/health/ready', { signal: AbortSignal.timeout(8000) });
        const expected = response.status === 200 ? 'ready' : 'not_ready';
        return [200, 503].includes(response.status) &&
          response.headers.get('cache-control') === 'no-store' &&
          (await response.json()).status === expected;
      }),
      available(origin, '/api/products', 200),
      available(origin, '/api/dashboard', 200),
    ]);
    if (!underReadinessTraffic.every(Boolean)) throw new Error('readiness traffic disturbed catalog or dashboard');
    console.log('Concurrent readiness and catalog/dashboard on disposable PG17: PASS');
    // Small fixture GET/security parity against the recorded frozen v1 reference
    // (backend-go/tests/integration/testdata/reference).
    const parity = (label, extra) => {
      const output = run(label, 'go', ['test', '-count=1', '-tags=integration', './tests/integration',
        '-run', `^(${parityTests.join('|')})$`, '-v'], {
        cwd: join(root, 'backend-go'), env: { ...env, HTTP_PARITY_CONFIRM: '1', TEST_DATABASE_URL: url('part04_fixture'), SMOKE_DATABASE_URL: url('part04_fixture', 'part04_api_login'), GO_API_BASE_URL: 'http://127.0.0.1:18080', ...extra },
      });
      console.log(output);
      assertParityPassed(output); // go test exits 0 on SKIP; every parity test must actually pass
    };
    if (record) {
      // An intended wire change: re-record from Go and review the diff as a contract change.
      parity('record reference', { REFERENCE_API_BASE_URL: 'http://127.0.0.1:18080', REFERENCE_RECORD: '1' });
      return;
    }
    parity('recorded reference parity', {});
    console.log(run('frozen GET contracts (local only)', 'pnpm', ['test:live'], {
      cwd: join(root, 'contracts'), env: { ...env, CONTRACT_API_BASE_URL: 'http://127.0.0.1:18080' },
    }));
    prepareBrowser();
    console.log(run('Next HTTP E2E against Go', 'pnpm', ['test:e2e'], { cwd: join(root, 'frontend'), env: { ...env, ...httpEnv, E2E_API: 'http' } }));
    const image = 'adilbaga-part12-api:review';
    docker('Docker image build', ['build', '-t', image, join(root, 'backend-go')]);
    network = `${name}-network`; docker('owned Docker network', ['network', 'create', network]);
    docker('connect owned PG', ['network', 'connect', network, name]);
    apiContainer = `${name}-api`;
    docker('Docker read-only API', ['run', '-d', '--name', apiContainer, '--network', network,
      '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '-p', '127.0.0.1:18081:8080', '-e', 'APP_ENV=production', '-e', 'PORT=8080', '-e', 'CORS_ALLOWED_ORIGINS=https://app.example.invalid',
      '-e', `DATABASE_URL=postgres://aktau_api_runtime:ci-local-only@${name}:5432/part04_fixture?sslmode=disable`,
      '-e', 'GEMINI_API_KEY=local-placeholder', '-e', 'UPSTASH_REDIS_REST_URL=https://sessions.example.invalid',
      '-e', 'UPSTASH_REDIS_REST_TOKEN=local-placeholder', '-e', 'LOG_LEVEL=error', image]);
    await wait('Docker ready', () => available('http://127.0.0.1:18081', '/health/ready', 200));
    await wait('Docker healthy', () => docker('Docker health state', ['inspect', '--format', '{{.State.Health.Status}}', apiContainer]) === 'healthy');
    if (docker('runtime UID', ['exec', apiContainer, 'id', '-u']) !== '10001') throw new Error('runtime must be non-root');
    docker('compiler absent / CA present', ['exec', apiContainer, 'sh', '-c', 'test ! -e /usr/local/go && ! command -v go && ! command -v gcc && test -s /etc/ssl/certs/ca-certificates.crt']);
    if (docker('readonly rootfs', ['inspect', '--format', '{{.HostConfig.ReadonlyRootfs}}', apiContainer]) !== 'true') throw new Error('Docker rootfs writable');
    for (const path of ['/health/live', '/api/categories', '/api/products', '/api/dashboard']) if (!await available('http://127.0.0.1:18081', path, 200)) throw new Error('Docker GET smoke failed');
    docker('DB outage', ['stop', '--time', '10', name]);
    if (!await available('http://127.0.0.1:18081', '/health/live', 200)) throw new Error('Docker outage affected liveness');
    await wait('Docker detects outage after readiness cache expires', () => available('http://127.0.0.1:18081', '/health/ready', 503));
    docker('DB recovery', ['start', name]);
    await wait('Docker recovered without API restart', () => available('http://127.0.0.1:18081', '/health/ready', 200));
  } finally {
    for (const child of processes.reverse()) {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await wait('owned process cleanup', () => child.exitCode !== null || child.signalCode !== null, 12_000);
      }
    }
    if (apiContainer) docker('API container cleanup', ['rm', '-f', '-v', apiContainer]);
    if (network) {
      docker('disconnect PG', ['network', 'disconnect', network, name]);
      docker('network cleanup', ['network', 'rm', network]);
    }
  }
});
