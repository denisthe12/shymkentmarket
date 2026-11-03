// CI-only data loader. Never executes uploaded code as sudo; only fixed system
// utilities consume the pinned profile bytes. No production/global profile edit.
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
export const hash = raw => createHash('sha256').update(raw).digest('hex');
export function context(env, event, checkout) {
  if (env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
      env.RUNNER_OS !== 'Linux' || env.RUNNER_ARCH !== 'X64' || env.ImageOS !== 'ubuntu24' ||
      env.GITHUB_REPOSITORY !== 'kiratonine/AdilBaga' || env.GITHUB_WORKFLOW !== 'CI' ||
      env.GITHUB_JOB !== 'go' || !/^[a-f0-9]{40}$/.test(checkout) || checkout !== env.GITHUB_SHA ||
      !/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID ?? '') ||
      !/^[1-9][0-9]{0,6}$/.test(env.GITHUB_RUN_ATTEMPT ?? '')) throw Error('hosted_vm_context');
  let head;
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    if (event.pull_request?.head?.repo?.full_name !== env.GITHUB_REPOSITORY ||
        event.pull_request?.base?.repo?.full_name !== env.GITHUB_REPOSITORY ||
        !['main', 'integrate/full-stack'].includes(event.pull_request?.base?.ref)) throw Error('untrusted_pr');
    head = event.pull_request.head.sha;
  } else if (env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main') head = checkout;
  else throw Error('untrusted_event');
  if (!/^[a-f0-9]{40}$/.test(head)) throw Error('head_identity');
  return { repository: env.GITHUB_REPOSITORY, event: env.GITHUB_EVENT_NAME, runner: 'github-hosted',
    imageOS: 'ubuntu24', runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, headSha: head, checkoutSha: checkout };
}
function execute(command, args, input, binary = false) {
  const result = spawnSync(command, args, { input, maxBuffer: 2 << 20, timeout: 30_000,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C.UTF-8', GIT_NO_REPLACE_OBJECTS:'1' } });
  if (result.error || result.status !== 0) {
    // Parser errors refer only to the fixed public CI profile, not credentials.
    process.stderr.write(result.stderr ?? '');
    throw Error(`hosted_profile_command_failed:${command}:${result.status ?? 'startup'}`);
  }
  return binary ? result.stdout : result.stdout.toString('utf8').trim();
}
const sudo = (args, input, binary = false) => execute('/usr/bin/sudo', ['-n', ...args], input, binary);
export function trustedGitFile(root, commit, path) {
  const object = (kind, oid) => {
    const raw = execute('/usr/bin/git',['-C',root,'cat-file',kind,oid],undefined,true);
    const actual = createHash('sha1').update(Buffer.from(`${kind} ${raw.length}\0`)).update(raw).digest('hex');
    if (actual !== oid) throw Error('git_object_changed');
    return raw;
  };
  const body = object('commit',commit).toString();
  let oid = /^tree ([a-f0-9]{40})$/m.exec(body)?.[1];
  const parts = path.split('/');
  for (const [index, name] of parts.entries()) {
    if (!name || name==='.' || name==='..' || !oid) throw Error('fixed_git_path');
    const tree=object('tree',oid); let at=0, found;
    while (at<tree.length) {
      const space=tree.indexOf(32,at), zero=tree.indexOf(0,space+1);
      if (space<0 || zero<0 || zero+21>tree.length) throw Error('git_tree_shape');
      const mode=tree.subarray(at,space).toString(), entry=tree.subarray(space+1,zero).toString();
      if (entry===name) found={mode,oid:tree.subarray(zero+1,zero+21).toString('hex')};
      at=zero+21;
    }
    if (!found || (index===parts.length-1 ? found.mode!=='100644' : found.mode!=='40000')) throw Error('fixed_git_member');
    oid=found.oid;
  }
  return object('blob',oid);
}
export function setupHostedPolicy(root) {
  if (existsSync('/.dockerenv') || !/^VERSION_ID="?24\.04"?$/m.test(readFileSync('/etc/os-release', 'utf8')))
    throw Error('not_standard_hosted_vm');
  const checkout = execute('/usr/bin/git', ['-C', root, 'rev-parse', 'HEAD']);
  const ctx = context(process.env, JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')), checkout);
  const virtualization = execute('/usr/bin/systemd-detect-virt', ['--vm']);
  if (!['microsoft', 'kvm'].includes(virtualization)) throw Error('hosted_vm_virtualization');
  console.log('NATIVE_HOSTED_VM '+JSON.stringify({ ...ctx, virtualization, imageVersion: process.env.ImageVersion ?? 'UNKNOWN' }));
  const profile = trustedGitFile(root,checkout,'scripts/ci/fixtures/native-mount-v1.apparmor');
  const rawBinding = trustedGitFile(root,checkout,'scripts/ci/fixtures/native-mount-v1.binding.json');
  const binding = JSON.parse(rawBinding);
  if (hash(profile) !== binding.renderedSHA256 ||
      !/^aktau-pr87-native-v1-[a-f0-9]{64}$/.test(binding.profileName) ||
      !profile.toString().includes(`profile ${binding.profileName} flags=(attach_disconnected,mediate_deleted)`))
    throw Error('profile_source_freeze');
  sudo(['/usr/sbin/aa-status', '--enabled']);
  const before = sudo(['/usr/bin/cat', '/sys/kernel/security/apparmor/profiles']);
  if (before.split('\n').some(line => line.startsWith(binding.profileName+' '))) throw Error('existing_profile');
  const directory = '/run/aktau-native-'+randomUUID();
  sudo(['/usr/bin/mkdir', '--mode=0700', '--', directory]);
  let loaded = false;
  function write(name, bytes) {
    const target = directory+'/'+name;
    sudo(['/usr/bin/tee', '--', target], bytes);
    sudo(['/usr/bin/chmod', '0444', '--', target]);
    if (sudo(['/usr/bin/sha256sum', '--', target]).split(/\s+/)[0] !== hash(bytes)) throw Error('root_copy_changed');
    return target;
  }
  try {
    const profileFile = write('profile.apparmor', profile);
    const compiled = sudo(['/usr/sbin/apparmor_parser', '--skip-kernel-load', '--skip-cache', '--stdout', '--jobs', '1', profileFile], undefined, true);
    const compiledFile = write('profile.policy', compiled);
    const bindingFile = write('binding.json', rawBinding);
    sudo(['/usr/sbin/apparmor_parser', '--add', '--binary', '--skip-cache', compiledFile]);
    loaded = true;
    const active = sudo(['/usr/bin/cat', '/sys/kernel/security/apparmor/profiles']);
    if (!active.split('\n').includes(binding.profileName+' (enforce)')) throw Error('profile_not_enforced');
    const receipt = { version: 1, contract: 'aktau-ci-github-native-v1', profileName: binding.profileName,
      bindingSha256: hash(rawBinding), profileSha256: hash(profile), compiledSha256: hash(compiled), ...ctx };
    const receiptFile = write('receipt.json', Buffer.from(JSON.stringify(receipt)+'\n'));
    const writableSource = directory+'/writable-source';
    sudo(['/usr/bin/mkdir', '--mode=0700', '--', writableSource]);
    const marker = write('writable-source/marker', Buffer.from('owned-negative-source\n'));
    console.log('NATIVE_HOSTED_PROFILE '+JSON.stringify(receipt));
    return { name: binding.profileName, directory, bindingFile, receiptFile, profileFile, compiledFile, writableSource,
      mounts: ['--security-opt', 'apparmor='+binding.profileName,
        '--mount', `type=bind,src=${bindingFile},dst=/ci/native-mount-v1.binding.json,readonly`,
        '--mount', `type=bind,src=${receiptFile},dst=/run/aktau-ci-native-v1/authority.json,readonly`],
      diagnostics() {
        const result = spawnSync('/usr/bin/sudo', ['-n','/usr/bin/dmesg','--notime'], { encoding:'utf8',maxBuffer:2<<20,timeout:15_000 });
        const lines=(result.stdout ?? '').split('\n').filter(line=>line.includes(binding.profileName));
        console.error('NATIVE_POLICY_AUDIT '+JSON.stringify({available:result.status===0,lines:lines.slice(-30)}));
      },
      cleanup() {
        // Containers must already be gone. No guessed cleanup after load error.
        sudo(['/usr/sbin/apparmor_parser', '--remove', '--skip-cache', profileFile]);
        const after = sudo(['/usr/bin/cat', '/sys/kernel/security/apparmor/profiles']);
        if (after.split('\n').some(line => line.startsWith(binding.profileName+' '))) throw Error('profile_cleanup_unverified');
        sudo(['/usr/bin/rm', '--', receiptFile, bindingFile, compiledFile, profileFile]);
        sudo(['/usr/bin/rm', '--', marker]);
        sudo(['/usr/bin/rmdir', '--', writableSource]);
        sudo(['/usr/bin/rmdir', '--', directory]);
        console.log('NATIVE_HOSTED_PROFILE_CLEANUP verified=true');
      } };
  } catch (error) {
    console.error('NATIVE_HOSTED_PROFILE_SETUP_BLOCKED '+JSON.stringify({ loaded, ownedDirectoryRetained: true }));
    throw error;
  }
}
