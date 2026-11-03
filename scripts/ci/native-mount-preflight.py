"""Fixed, test-only native mount prerequisites; never production authorization.

Called solely in the owned readonly Docker fixture. No CLI/env/path override,
policy installation, capability addition, or unconfined/privileged fallback.
"""
import ctypes
import errno
import hashlib
import json
import os
from pathlib import Path
import select
import shutil
import signal
import tempfile
import time

CAPS = sum(1 << n for n in [0, 1, 5, 6, 7, 21])


def _ci_record(path):
    """Fixed manager-mounted metadata, never an actor/env/upload authority."""
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
    try:
        parts = path.strip('/').split('/')
        for i, part in enumerate(parts):
            nxt = os.open(part, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC |
                          (os.O_DIRECTORY if i < len(parts)-1 else os.O_NONBLOCK), dir_fd=fd)
            os.close(fd); fd = nxt; st = os.fstat(fd)
            if st.st_uid or st.st_gid or st.st_mode & 0o022 or os.listxattr(fd):
                raise ValueError('ci_record_custody')
        import stat
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size > 16384 or not os.fstatvfs(fd).f_flag & os.ST_RDONLY:
            raise ValueError('ci_record_identity')
        raw = os.read(fd, 16385)
        keys = ['st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns']
        if len(raw) != st.st_size or any(getattr(os.fstat(fd), k) != getattr(st, k) for k in keys):
            raise ValueError('ci_record_changed')
        def unique(rows):
            out = {}
            for key, value in rows:
                if key in out: raise ValueError('duplicate_ci_record')
                out[key] = value
            return out
        return raw, json.loads(raw, object_pairs_hook=unique)
    finally:
        os.close(fd)


def _custom_identity(label):
    # CI-only receipt created after exact profile load on the Owner-authorized
    # standard GitHub VM. This is NOT production/root release authorization.
    import re
    try:
        raw, binding = _ci_record('/ci/native-mount-v1.binding.json')
        _, receipt = _ci_record('/run/aktau-ci-native-v1/authority.json')
        expected = binding['profileName']
        if not re.fullmatch(r'aktau-pr87-native-v1-[a-f0-9]{64}', expected): return False
        if label != expected+' (enforce)' or binding['expectedProcLabel'] != label: return False
        fields = {'version','contract','profileName','bindingSha256','profileSha256','compiledSha256',
                  'repository','event','runner','imageOS','runId','attempt','headSha','checkoutSha'}
        return (type(receipt) is dict and set(receipt) == fields and
                type(receipt['version']) is int and receipt['version'] == 1 and
                receipt['contract'] == 'aktau-ci-github-native-v1' and
                receipt['repository'] == 'kiratonine/AdilBaga' and receipt['runner'] == 'github-hosted' and
                receipt['imageOS'] == 'ubuntu24' and receipt['event'] in ['pull_request','push'] and
                receipt['profileName'] == expected and
                receipt['bindingSha256'] == hashlib.sha256(raw).hexdigest() and
                receipt['profileSha256'] == binding['renderedSHA256'] and
                type(receipt['compiledSha256']) is str and re.fullmatch(r'[a-f0-9]{64}',receipt['compiledSha256']) is not None and
                all(type(receipt[k]) is str and re.fullmatch(r'[1-9][0-9]{0,15}',receipt[k])
                    for k in ['runId','attempt']) and
                all(type(receipt[k]) is str and re.fullmatch(r'[a-f0-9]{40}',receipt[k])
                    for k in ['headSha','checkoutSha']))
    except (OSError, ValueError, KeyError, TypeError):
        return False


def snapshot():
    rows = dict(x.split(':', 1) for x in Path('/proc/self/status').read_text().splitlines() if ':' in x)
    result = {'uid': os.getuid(), 'euid': os.geteuid(), 'container': Path('/.dockerenv').is_file(),
              'capEff': rows.get('CapEff', '').strip(), 'capPrm': rows.get('CapPrm', '').strip(),
              'capBnd': rows.get('CapBnd', '').strip(), 'seccomp': rows.get('Seccomp', '').strip(),
              'sourceReadOnly': bool(os.statvfs('/src').f_flag & os.ST_RDONLY),
              'sameManagerNamespace': os.stat('/proc/self/ns/mnt').st_ino == os.stat('/proc/1/ns/mnt').st_ino,
              'cgroupVersion': 2 if Path('/sys/fs/cgroup/cgroup.controllers').exists() else 'UNKNOWN'}
    # Before the first probe mount, the containing tmpfs/root must not propagate
    # child mounts outside this Docker namespace. Do not dump host mount paths.
    info = Path('/proc/self/mountinfo').read_text()
    if len(info) > 1 << 20:
        raise ValueError('mount_metadata_capacity')
    for target, key in [('/', 'rootPrivate'), ('/tmp', 'tmpPrivate')]:
        found = [x.split() for x in info.splitlines() if len(x.split()) > 6 and x.split()[4] == target]
        result[key] = len(found) == 1 and found[0][6:found[0].index('-')] == []
    result['mountNamespaceInode'] = os.stat('/proc/self/ns/mnt').st_ino
    result['userNamespaceMatchesPID1'] = os.stat('/proc/self/ns/user').st_ino == os.stat('/proc/1/ns/user').st_ino
    release = os.uname().release
    result['kernel'] = release if len(release) <= 100 and all(c.isalnum() or c in '._+-' for c in release) else 'UNKNOWN'
    try:
        label = Path('/proc/self/attr/current').read_bytes()[:256].decode('ascii').rstrip('\0\n')
        result['lsm'] = {'kernel': 'KERNEL', 'unconfined': 'NO_PROFILE',
                         'docker-default (enforce)': 'DOCKER_DEFAULT_ENFORCE'}.get(label, 'UNKNOWN')
        if result['lsm'] == 'UNKNOWN' and _custom_identity(label):
            result['lsm'] = 'HOSTED_NATIVE_V1'
    except (OSError, UnicodeError):
        result['lsm'] = 'UNKNOWN'
    try:
        value = Path('/sys/module/apparmor/parameters/enabled').read_text().strip()
        result['apparmor'] = value if value in ['Y', 'N'] else 'UNKNOWN'
    except OSError:
        result['apparmor'] = 'UNKNOWN'
    return result


def reject_reason(meta):
    if meta.get('container') is not True or type(meta.get('uid')) is not int or type(meta.get('euid')) is not int or (meta.get('uid'), meta.get('euid')) != (0, 0):
        return 'owned_root_container_required'
    try:
        values = [int(meta[x], 16) for x in ['capEff', 'capPrm', 'capBnd']]
    except (KeyError, ValueError, TypeError):
        return 'capabilities_unknown'
    if any(not n & (1 << 21) for n in values):
        return 'missing_sys_admin'
    if any(n != CAPS for n in values):
        return 'unexpected_capabilities'
    if meta.get('seccomp') != '2':
        return 'seccomp_unknown_or_unconfined'
    if any(meta.get(key) is not True for key in ['sourceReadOnly', 'sameManagerNamespace', 'rootPrivate', 'tmpPrivate', 'userNamespaceMatchesPID1']):
        return 'readonly_or_namespace_prerequisite'
    known = ((meta.get('apparmor') == 'N' and meta.get('lsm') in ['KERNEL', 'NO_PROFILE']) or
             (meta.get('apparmor') == 'Y' and meta.get('lsm') in ['DOCKER_DEFAULT_ENFORCE', 'HOSTED_NATIVE_V1']))
    return None if known else 'lsm_unknown_or_unapproved'


def smoke():
    libc = ctypes.CDLL(None, use_errno=True)
    libc.mount.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_ulong, ctypes.c_void_p]
    libc.umount2.argtypes = [ctypes.c_char_p, ctypes.c_int]
    evidence = {'operations': [], 'privateNamespace': False, 'cleanup': 'KNOWN'}
    root = Path(tempfile.mkdtemp(prefix='aktau-native-prereq-'))
    mounted, bound = False, None

    def call(stage, function, *args):
        ctypes.set_errno(0)
        code = function(*args)
        number = ctypes.get_errno() if code else 0
        evidence['operations'].append({'stage': stage, 'errno': number,
                                       'class': errno.errorcode.get(number, 'OK' if not number else 'UNKNOWN')})
        if code:
            raise OSError(number, stage)

    def mount(stage, source, target, flags, kind=None, options=None):
        call(stage, libc.mount, os.fsencode(source) if source else None, os.fsencode(target),
             kind.encode() if kind else None, flags, options.encode() if options else None)

    try:
        # Dedicated scratch only, already inside the Docker-private namespace.
        # This first syscall captures the original denial before unshare can fail.
        mount('tmpfs_before_unshare', None, root, 2 | 4, 'tmpfs', 'size=16777216,mode=0700')
        mounted = True
        call('unmount_before_unshare', libc.umount2, os.fsencode(root), 0)
        mounted = False
        original = os.stat('/proc/self/ns/mnt').st_ino
        try:
            os.unshare(os.CLONE_NEWNS)
        except OSError as error:
            evidence['operations'].append({'stage': 'private_namespace', 'errno': error.errno,
                                           'class': errno.errorcode.get(error.errno, 'UNKNOWN')})
            raise
        evidence['privateNamespace'] = os.stat('/proc/self/ns/mnt').st_ino != original
        if not evidence['privateNamespace']:
            raise OSError(errno.EINVAL, 'private_namespace')
        mount('private_propagation', None, '/', 16384 | 262144)
        mount('tmpfs_private', None, root, 2 | 4, 'tmpfs', 'size=16777216,mode=0700')
        mounted = True
        source, target, moved = [root / n for n in ['source', 'bound', 'moved']]
        for path in [source, target, moved]:
            path.mkdir()
        (source / 'marker').write_bytes(b'owned-fixture')
        mount('bind', source, target, 4096)
        bound = target
        mount('remount_readonly', None, target, 4096 | 32 | 1 | 2 | 4)
        try:
            (target / 'denied').write_bytes(b'must-not-write')
        except OSError as error:
            if error.errno != errno.EROFS:
                raise
        else:
            raise OSError(errno.EINVAL, 'readonly_check')
        mount('move', target, moved, 8192)
        bound = moved
        if (moved / 'marker').read_bytes() != b'owned-fixture':
            raise OSError(errno.EINVAL, 'moved_marker')
        call('unbind', libc.umount2, os.fsencode(bound), 0)
        bound = None
        call('unmount_private', libc.umount2, os.fsencode(root), 0)
        mounted = False
        evidence.update({'status': 'PASS', 'reason': 'kernel_operations_verified'})
    except OSError as error:
        evidence.update({'status': 'BLOCKED', 'reason': 'kernel_prerequisite_denied', 'errno': error.errno})
    finally:
        try:
            if bound is not None:
                call('cleanup_bind', libc.umount2, os.fsencode(bound), 0)
                bound = None
            if mounted:
                call('cleanup_tmpfs', libc.umount2, os.fsencode(root), 0)
                mounted = False
            shutil.rmtree(root)
        except OSError:
            evidence.update({'status': 'BLOCKED', 'reason': 'cleanup_unverified', 'cleanup': 'UNKNOWN'})
    return evidence


def qualify():
    if not Path('/.dockerenv').is_file() or os.getuid() != 0 or os.geteuid() != 0:
        return {'status': 'BLOCKED', 'reason': 'owned_root_container_required', 'operations': []}
    try:
        meta = snapshot()
    except (OSError, ValueError):
        return {'status': 'BLOCKED', 'reason': 'metadata_unavailable', 'operations': []}
    reason = reject_reason(meta)
    if reason:
        return {'status': 'BLOCKED', 'reason': reason, 'metadata': meta, 'operations': []}
    before = os.stat('/proc/self/ns/mnt').st_ino
    rd, wr = os.pipe()
    pid = os.fork()
    if pid == 0:
        os.close(rd)
        try:
            result = smoke()
            raw = (json.dumps(result, separators=(',', ':')) + '\n').encode()
            if len(raw) > 16384:
                os._exit(2)
            os.write(wr, raw)
            os.close(wr)
            os._exit(0)
        except BaseException:
            os._exit(2)
    os.close(wr)
    data, status = bytearray(), None
    deadline = time.monotonic() + 15
    try:
        while time.monotonic() < deadline:
            ready, _, _ = select.select([rd], [], [], max(0, deadline - time.monotonic()))
            if not ready:
                break
            chunk = os.read(rd, 16385 - len(data))
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > 16384:
                break
        while time.monotonic() < deadline:
            found, value = os.waitpid(pid, os.WNOHANG)
            if found:
                status = value
                break
            time.sleep(.01)
        if status != 0:
            return {'status': 'BLOCKED', 'reason': 'probe_timeout_or_child_failure', 'metadata': meta}
        result = json.loads(data)
        if os.stat('/proc/self/ns/mnt').st_ino != before:
            return {'status': 'BLOCKED', 'reason': 'parent_namespace_changed', 'metadata': meta}
        result.update({'metadata': meta, 'parentNamespaceUnchanged': True,
                       'hostedLSMParity': 'NOT_VERIFIED'})
        return result
    finally:
        os.close(rd)
        if status is None:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            until = time.monotonic() + 2
            while time.monotonic() < until:
                found, _ = os.waitpid(pid, os.WNOHANG)
                if found:
                    break
                time.sleep(.01)
            else:
                raise RuntimeError('native_probe_cleanup_unverified')
