"""Real CI-only policy negatives in owned Docker namespaces, no host mutation.

Never run directly on a host; no mocked mount or SKIP. Existing eleven native
methods are executed unchanged after the enforcing-profile negatives pass.
"""
import ctypes
import errno
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('policy_preflight', ROOT/'scripts/ci/native-mount-preflight.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
libc = ctypes.CDLL(None, use_errno=True)
libc.mount.argtypes = [ctypes.c_char_p,ctypes.c_char_p,ctypes.c_char_p,ctypes.c_ulong,ctypes.c_void_p]
libc.umount2.argtypes = [ctypes.c_char_p,ctypes.c_int]


def mount(source, target, flags, kind=None):
    ctypes.set_errno(0)
    rc = libc.mount(os.fsencode(source) if source else None, os.fsencode(target),
                    kind.encode() if kind else None, flags, ctypes.c_char_p(b'size=16777216,mode=0700') if kind == 'tmpfs' else None)
    return rc, ctypes.get_errno() if rc else 0


def note(stage, **values):
    print('NATIVE_POLICY_NEGATIVE '+json.dumps(dict(stage=stage,**values)),flush=True)


def reject(stage, source, target, flags, kind=None):
    rc, number = mount(source,target,flags,kind)
    note(stage, errno=number, denied=rc != 0)
    # A successful unexpected mount is never silently detached/continued.
    # The known owned container is destroyed by the caller on this failure.
    if rc == 0 or number not in [errno.EACCES,errno.EPERM,errno.EROFS]:
        raise RuntimeError('mount_policy_negative_failed:'+stage)


def main():
    if not Path('/.dockerenv').is_file() or os.getuid() != 0:
        raise RuntimeError('owned_root_container_required')
    mode = sys.argv[1:] or ['--enforced']
    if mode == ['--default-denial']:
        result = p.qualify()
        note('default_profile_control',result=result)
        if result.get('reason') != 'kernel_prerequisite_denied' or result.get('metadata',{}).get('lsm') != 'DOCKER_DEFAULT_ENFORCE':
            raise RuntimeError('default_denial_not_proven')
        return
    if mode in [['--missing-sys-admin'],['--writable-source']]:
        result = p.qualify(); expected = 'missing_sys_admin' if mode[0] == '--missing-sys-admin' else 'readonly_or_namespace_prerequisite'
        note(mode[0][2:],reason=result.get('reason'))
        if result.get('status') != 'BLOCKED' or result.get('reason') != expected:
            raise RuntimeError('unsafe_metadata_admitted')
        if mode[0] == '--missing-sys-admin':
            target = tempfile.mkdtemp(prefix='aktau-native-prereq-')
            reject('actual_missing_cap_mount',None,target,6,'tmpfs')
        else:
            try:
                Path('/src/forbidden-write').write_bytes(b'must-be-denied')
            except OSError as error:
                if error.errno not in [errno.EACCES,errno.EPERM,errno.EROFS]:raise
                note('actual_source_write',errno=error.errno,denied=True)
            else:raise RuntimeError('source_write_allowed')
        return
    if mode != ['--enforced']:raise RuntimeError('fixed_test_mode')
    result = p.qualify()
    print('NATIVE_ENFORCED_PREREQUISITE '+json.dumps(result),flush=True)
    if result['status'] != 'PASS' or result['metadata']['lsm'] != 'HOSTED_NATIVE_V1':
        raise RuntimeError('enforced_policy_not_proven')
    root = Path(tempfile.mkdtemp(prefix='aktau-native-prereq-'))
    if mount(None,root,6,'tmpfs') != (0,0):raise RuntimeError('owned_scratch_mount')
    source,bound,outside = [root/x for x in ['source','bound','outside']]
    for path in [source,bound,outside]:path.mkdir()
    # Supported filesystems/paths; ENODEV/EINVAL would not prove policy denial.
    reject('wrong_filesystem',None,bound,6,'proc')
    reject('foreign_owned_target',None,outside,6,'tmpfs')
    reject('shared_propagation',None,root,1<<20)
    reject('wrong_remount_flags',None,root,32)
    fd = os.open(outside,os.O_RDONLY|os.O_DIRECTORY)
    try:reject('foreign_fd_target',source,'/proc/self/fd/'+str(fd),4096)
    finally:os.close(fd)
    for target in ['/proc','/sys','/dev','/src']:
        reject('denied_target_'+target[1:],None,target,6,'tmpfs')
        reject('denied_source_'+target[1:],target,bound,4096)
    try:
        sock = socket.socket(socket.AF_INET,socket.SOCK_STREAM)
    except OSError as error:
        if error.errno not in [errno.EACCES,errno.EPERM]:raise
        note('network_socket',errno=error.errno,denied=True)
    else:
        sock.close();raise RuntimeError('network_not_denied')
    if libc.umount2(os.fsencode(root),0) != 0:raise RuntimeError('owned_scratch_cleanup')
    note('enforced_policy_negatives',status='PASS')
    # Preserve every original assertion, test method and 23 crash phases.
    subprocess.run(['/usr/bin/python3','-B',str(ROOT/'ops/c2/pipeline_runtime_integration.py')],check=True)


if __name__ == '__main__':main()
