// Mandatory Linux root sandbox; never silently replace distinct UID proof with mocks.
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, run, env } from './common.mjs';
import { captureNative } from './native-mount-capture.mjs';
import { setupHostedPolicy } from './native-mount-hosted.mjs';

if (process.platform !== 'linux') throw new Error('distinct-UID integration requires Linux + Docker');
const goRoot = realpathSync(run('Go SDK root', 'go', ['env', 'GOROOT']));
if (run('Go version', join(goRoot, 'bin/go'), ['version']) !== 'go version go1.27.3 linux/amd64') {
  throw new Error('root bundle qualification requires Go1.27.3 linux/amd64');
}
run('Native prerequisite metadata regressions (no host mounts)', 'python3', ['-B', '-m', 'unittest', 'discover', '-s', 'scripts/ci', '-p', 'test_native_mount_preflight.py']);
run('Bounded native capture regressions', process.execPath, ['--test', 'scripts/ci/native-mount-capture.test.mjs']);
run('Hosted native context regressions', process.execPath, ['--test', 'scripts/ci/native-mount-hosted.test.mjs']);
const id = `aktau-bundle-root-${randomUUID()}`;
let built = false;
let policy;
try {
  run('Docker prerequisite', 'docker', ['version', '--format', '{{.Server.Version}}']);
  run('Build owned isolated root fixture', 'docker', ['build', '--tag', id,
    dirname(join(root, 'ops/c2/fixtures/bundle-root/Dockerfile'))]);
  built = true;
  console.log(run('Real root/runuser/Git FD + executor pair crash/recovery qualification (0 SKIP)', 'docker', [
    'run', '--name', id, '--rm', '--network', 'none', '--cap-drop', 'ALL',
    ...['SETUID', 'SETGID', 'CHOWN', 'DAC_OVERRIDE', 'KILL'].flatMap(c => ['--cap-add', c]),
    '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=1073741824',
    '--memory', '2g', '--cpus', '2', '--pids-limit', '128',
    '--mount', `type=bind,src=${root},dst=/src,readonly`,
    '--mount', `type=bind,src=${goRoot},dst=/usr/local/go,readonly`, id,
    'python3', '-B', 'ops/c2/root_executor_pair_integration.py',
  ]));
  if (process.env.GITHUB_ACTIONS === 'true') policy = setupHostedPolicy(root);
  const nativeBase = [
    '--network', 'none', '--cap-drop', 'ALL',
    ...['SYS_ADMIN','SETUID','SETGID','CHOWN','DAC_OVERRIDE','KILL'].flatMap(c => ['--cap-add', c]),
    '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=1073741824',
    '--memory', '2g', '--cpus', '2', '--pids-limit', '128',
    '--mount', `type=bind,src=${root},dst=/src,readonly`,
  ];
  if (policy) {
    // Current default-policy control, same caps. Its expected denial is NOT a
    // native-suite PASS. Then exercise actual missing-cap rejection.
    captureNative(['run','--name',`${id}-default`,'--rm',...nativeBase,id,
      'python3','-B','scripts/ci/native-mount-policy-integration.py','--default-denial'],{cwd:root,env});
    const noCap = nativeBase.filter((value,index,all) => value !== 'SYS_ADMIN' && !(value === '--cap-add' && all[index+1] === 'SYS_ADMIN'));
    captureNative(['run','--name',`${id}-nocap`,'--rm',...noCap,...policy.mounts,id,
      'python3','-B','scripts/ci/native-mount-policy-integration.py','--missing-sys-admin'],{cwd:root,env});
    const writable = nativeBase.filter((value,index,all) => value !== `type=bind,src=${root},dst=/src,readonly` &&
      !(value === '--mount' && all[index+1] === `type=bind,src=${root},dst=/src,readonly`));
    captureNative(['run','--name',`${id}-writable`,'--rm',...writable,...policy.mounts,
      '--mount',`type=bind,src=${root},dst=/fixture-source,readonly`,
      '--mount',`type=bind,src=${policy.writableSource},dst=/src`,id,
      'python3','-B','/fixture-source/scripts/ci/native-mount-policy-integration.py','--writable-source'],{cwd:root,env});
  }
  captureNative([
    'run', '--name', `${id}-pipeline`, '--rm', '--network', 'none', '--cap-drop', 'ALL',
    ...['SYS_ADMIN','SETUID','SETGID','CHOWN','DAC_OVERRIDE','KILL'].flatMap(c => ['--cap-add', c]),
    '--security-opt', 'no-new-privileges', '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=1073741824',
    '--memory', '2g', '--cpus', '2', '--pids-limit', '128',
    '--mount', `type=bind,src=${root},dst=/src,readonly`, ...(policy?.mounts ?? []), id,
    'python3', '-B', policy ? 'scripts/ci/native-mount-policy-integration.py' : 'ops/c2/pipeline_runtime_integration.py',
  ], { cwd: root, env });
  console.log('Real Linux pipeline mount/custody/private namespace qualification (0 SKIP): PASS');
} catch (error) {
  if (policy) policy.diagnostics();
  throw error;
} finally {
  // Only this invocation's random, owned resources; never prune/reuse host containers.
  // rm may report not-found after --rm; an inspection distinguishes absence from failure.
  const { spawnSync } = await import('node:child_process');
  for (const owned of [id, `${id}-pipeline`, `${id}-default`, `${id}-nocap`, `${id}-writable`]) {
    const removed = spawnSync('docker', ['rm', '-f', owned], { encoding: 'utf8', timeout: 15_000 });
    if (removed.status !== 0) {
      const names = run('Root fixture cleanup inventory', 'docker', ['ps', '-aq', '--filter', `name=^/${owned}$`]);
      if (names) throw new Error('root fixture cleanup unverified');
    }
  }
  if (policy) policy.cleanup();
  if (built) run('Remove owned fixture image', 'docker', ['image', 'rm', id]);
}
