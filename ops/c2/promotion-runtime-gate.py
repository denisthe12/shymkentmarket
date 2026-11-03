#!/usr/bin/python3
"""Fixed shared-lock wrapper for existing services. No scheduling/publication."""
import fcntl
import os
import pathlib
import pwd
import stat
import sys
import time

BASE = '/var/lib/aktau-sync-promotion'
COMMANDS = {
    'daily': ['/usr/bin/bash', 'pipeline/scripts/daily-sync.sh'],
    'weekly': ['/usr/bin/bash', 'pipeline/scripts/weekly-full-scrape.sh'],
    'c2': ['/usr/bin/python3', '-I', '-B', '/usr/local/libexec/aktau-c2-custodian.py'],
}


def acquire(kind):
    if kind not in COMMANDS:
        raise ValueError('fixed_role')
    uid = 0 if kind == 'c2' else pwd.getpwnam('aktau-sync').pw_uid
    if os.getuid() != uid or os.geteuid() != uid:
        raise ValueError('runtime_identity')
    for parent in [pathlib.Path(BASE), *pathlib.Path(BASE).parents]:
        s = parent.lstat()
        if not stat.S_ISDIR(s.st_mode) or s.st_uid != 0 or s.st_mode & 0o022:
            raise ValueError('runtime_custody')
    fd = os.open(BASE + '/runtime.lock', os.O_RDONLY | os.O_NOFOLLOW)
    s = os.fstat(fd)
    if not stat.S_ISREG(s.st_mode) or s.st_uid != 0 or s.st_nlink != 1 or stat.S_IMODE(s.st_mode) != 0o644:
        os.close(fd)
        raise ValueError('runtime_lock')
    end = time.monotonic() + (20 if kind == 'c2' else 120)
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_SH | fcntl.LOCK_NB)
            break
        except BlockingIOError:
            if time.monotonic() >= end:
                os.close(fd)
                raise ValueError('promotion_busy')
            time.sleep(.05)
    if os.path.lexists(BASE + '/interlock.json'):
        os.close(fd)
        raise ValueError('promotion_reconciliation_required')
    os.set_inheritable(fd, True)
    return fd


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in COMMANDS:
        raise ValueError('fixed_role')
    acquire(sys.argv[1])
    if sys.argv[1] in ['daily','weekly'] and os.path.lexists(SELECTION):
        verify_actor()
        os.environ['PATH']='/usr/local/lib/nodejs/node-v24.18.0-linux-x64/bin:/usr/local/libexec/aktau-sync-promotion/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin'
        os.environ['TSX_DISABLE_CACHE']='1'
    # Keep original service environment and business exit semantics. No fork:
    # actual custodian/notify PID and the shared lock survive exec unchanged.
    os.execv(COMMANDS[sys.argv[1]][0], COMMANDS[sys.argv[1]])

# V2 actor-only read guard. The C2 custodian retains its private namespace and
# never receives this actor package/mount requirement.
SELECTION='/etc/aktau-sync-promotion/pipeline.json'
ATTESTATION='/run/aktau-sync-promotion/pipeline-mount.json'
PUBLISHER='/opt/aktau-sync'

def read_control(path,mode):
    import json
    for parent in [pathlib.Path(path).parent,*pathlib.Path(path).parent.parents]:
        st=parent.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or st.st_mode&0o022:raise ValueError('pipeline_control_parent')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK|os.O_CLOEXEC)
    try:
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_gid!=0 or st.st_nlink!=1 or stat.S_IMODE(st.st_mode) not in (mode if type(mode) is tuple else (mode,)) or not 0<st.st_size<=16384 or os.listxattr(fd):raise ValueError('pipeline_control')
        raw=os.read(fd,16385)
        def stable(v):return (v.st_dev,v.st_ino,v.st_mode,v.st_uid,v.st_gid,v.st_nlink,v.st_size,v.st_mtime_ns,v.st_ctime_ns)
        if len(raw)!=st.st_size or stable(os.fstat(fd))!=stable(st) or stable(os.stat(path,follow_symlinks=False))!=stable(st):raise ValueError('pipeline_control_changed')
    finally:os.close(fd)
    def pairs(values):
        d={}
        for k,v in values:
            if k in d:raise ValueError('pipeline_duplicate')
            d[k]=v
        return d
    value=json.loads(raw,object_pairs_hook=pairs)
    if (json.dumps(value,separators=(',',':'),ensure_ascii=False,allow_nan=False)+'\n').encode()!=raw:raise ValueError('pipeline_control_json')
    return value,raw

def verify_actor():
    import hashlib,re,subprocess
    selected,raw=read_control(SELECTION,0o644);att,_=read_control(ATTESTATION,0o444)
    keys={'version','contract','sourceSha','pipelineTreeSha1','inventorySha256','descriptorSha256','releaseIdentity','provenanceKind'}
    if type(selected) is not dict or set(selected)!=keys or type(selected['version']) is not int or selected['version']!=1 or selected['contract']!='pr86-pipeline-v2':raise ValueError('pipeline_selection')
    if not all(type(selected[k]) is str and re.fullmatch(r'[a-f0-9]{'+str(n)+'}',selected[k]) for k,n in [('sourceSha',40),('pipelineTreeSha1',40),('inventorySha256',64),('descriptorSha256',64)]):raise ValueError('pipeline_selection_hash')
    if selected['pipelineTreeSha1'] not in ['2ed1c1c6d6fef504b08829f4193a0b60681bd3a7','4f1294e3ec73fd477d85825588b8f382125fc1c6'] or selected['provenanceKind'] not in ['github-artifact','legacy-installed-attested'] or type(selected['releaseIdentity']) is not str or not re.fullmatch(r'[a-z0-9_-]{1,80}',selected['releaseIdentity']):raise ValueError('pipeline_selection_identity')
    expected={'version','bootId','mountNamespaceInode','mountId','selectionSha256','mountedRootDev','mountedRootInode','inventorySha256'}
    if type(att) is not dict or set(att)!=expected or type(att['version']) is not int or att['version']!=1:raise ValueError('pipeline_attestation')
    if any(type(att[k]) is not int or att[k]<0 for k in ['mountNamespaceInode','mountId','mountedRootDev','mountedRootInode']):raise ValueError('pipeline_attestation_number')
    if att['bootId']!=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip() or att['mountNamespaceInode']!=os.stat('/proc/self/ns/mnt').st_ino:raise ValueError('pipeline_boot_namespace')
    if att['selectionSha256']!=hashlib.sha256(raw).hexdigest() or att['inventorySha256']!=selected['inventorySha256']:raise ValueError('pipeline_attestation_binding')
    target=PUBLISHER+'/pipeline';st=os.stat(target,follow_symlinks=False)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid!=0 or stat.S_IMODE(st.st_mode)!=0o555 or (st.st_dev,st.st_ino)!=(att['mountedRootDev'],att['mountedRootInode']):raise ValueError('pipeline_mount_root')
    matches=[]
    for line in pathlib.Path('/proc/self/mountinfo').read_text().splitlines():
        fields=line.split()
        if fields[4]==target:matches.append(fields)
        elif fields[4].startswith(target+'/'):raise ValueError('pipeline_nested_mount')
    if len(matches)!=1 or int(matches[0][0])!=att['mountId'] or not {'ro','nosuid','nodev'}<=set(matches[0][5].split(',')):raise ValueError('pipeline_mount_flags')
    r=subprocess.run(['/usr/bin/git','--no-optional-locks','--no-replace-objects','-c','core.fsmonitor=false',
        '-c','core.hooksPath=/dev/null','-C',PUBLISHER,'rev-parse','--verify','HEAD'],stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=3,env={'PATH':'/usr/bin:/bin','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null'})
    if r.returncode or r.stdout!=selected['sourceSha'].encode()+b'\n':raise ValueError('pipeline_source_alignment')
    tree=subprocess.run(['/usr/bin/git','--no-optional-locks','--no-replace-objects','-c','core.fsmonitor=false',
        '-c','core.hooksPath=/dev/null','-C',PUBLISHER,'rev-parse','--verify','HEAD:pipeline'],stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=3,env={'PATH':'/usr/bin:/bin','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null'})
    if tree.returncode or tree.stdout!=selected['pipelineTreeSha1'].encode()+b'\n':raise ValueError('pipeline_source_tree')
    authority,_=read_control('/etc/aktau-c2/authorization.json',(0o444,0o644))
    automatic,_=read_control('/etc/aktau-c2/automatic.json',(0o444,0o644))
    manifest,_=read_control('/usr/local/libexec/aktau-c2/source-manifest.json',0o444)
    if type(authority) is not dict or set(authority)!={'version','approved','sourceSha','binarySha256','clockSha256','buildId','platform'} or type(authority['version']) is not int or authority['version']!=1 or authority['approved'] is not True or authority['platform']!='linux/amd64':raise ValueError('pipeline_c2_authority')
    if type(automatic) is not dict or set(automatic)!={'version','enabled','sourceSha','sitePolicySha256','files'} or type(automatic['version']) is not int or automatic['version']!=2 or automatic['enabled'] is not True or type(automatic['files']) is not dict or len(automatic['files'])!=12:raise ValueError('pipeline_c2_automatic')
    if any(v.get('sourceSha')!=selected['sourceSha'] for v in [authority,automatic]) or type(manifest) is not dict or set(manifest)!={'sourceSha','recipe','nodeMajor'} or manifest['sourceSha']!=selected['sourceSha'] or type(manifest['nodeMajor']) is not int or manifest['nodeMajor']!=24:raise ValueError('pipeline_c2_source')
    if authority['binarySha256']!=automatic['files'].get('/usr/local/libexec/aktau-c2/c2projection') or authority['clockSha256']!=automatic['files'].get('/usr/local/libexec/aktau-c2/relayprobe'):raise ValueError('pipeline_c2_binding')
    return selected


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        print('BLOCKED_PROMOTION_RUNTIME_GATE', file=sys.stderr)
        sys.exit(78)
