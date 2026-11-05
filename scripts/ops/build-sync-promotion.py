#!/usr/bin/env python3
"""Build one public immutable sync/C2 artifact off-host; never authorizes it."""
import hashlib
import importlib.util
import io
import json
import os
import platform
import stat
import urllib.request
import zipfile
from pathlib import Path
import re
import shutil
import selectors
import signal
import time
import subprocess
import sys
import tarfile
import tempfile

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('promotion_build_protocol', REPO / 'ops/c2/publisher-promotion.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


# Closed diagnostics only. Never include subprocess output, exceptions or paths.
BUILD_STAGES = frozenset(['input','toolchain','source_archive','go_build','source_bundle','pnpm_integrity',
                         'graph_install','runtime_probe','capsule_pack','descriptor','source_admission','tar_pack','size_budget','publish'])
BUILD_REASONS = frozenset(['command_failed','command_timeout','command_capacity','command_cleanup_unverified','source_archive_invalid',
                          'integrity_rejected','validation_rejected','resource_failure','interrupted',
    'pipeline_path','pipeline_order','pipeline_private_file','pipeline_parent','pipeline_link_escape',
    'pipeline_link_dangling','pipeline_link_cycle','pipeline_link_parent','pipeline_link_root','pipeline_link',
    'pipeline_logical_capacity','pipeline_inventory_capacity','pipeline_inventory_schema','pipeline_file',
    'pipeline_dir','pipeline_entry_type','pipeline_capsule_capacity','pipeline_capsule_noncanonical',
    'build_native_platform','build_graph_xattr','build_graph_file','build_graph_changed'])
BUILD_STAGE = 'input'

def stage(name):
    global BUILD_STAGE
    p.need(name in BUILD_STAGES,'build_stage'); BUILD_STAGE = name

def source_archive(raw):
    # Git tree archives with controlled tar.umask contain no commit PAX header.
    tar = tarfile.open(fileobj=io.BytesIO(raw),mode='r:'); members = tar.getmembers()
    seen = {}; end = 0
    try:
        p.need(bool(members) and members[0].name == 'pipeline' and members[0].isdir(),'pipeline_source_archive')
        for member in members:
            name = member.name
            p.need(name not in seen and not member.pax_headers
                   and (name == 'pipeline' and member.isdir() or name.startswith('pipeline/'))
                   and all(part not in ['', '.', '..'] for part in name.split('/'))
                   and (member.isdir() and member.mode == 0o755 or member.isfile() and member.mode in [0o644,0o755]),
                   'pipeline_source_archive')
            parent=str(Path(name).parent)
            p.need((name=='pipeline' or seen.get(parent)=='dir') and member.offset==end
                and member.offset_data==member.offset+512 and raw[member.offset+156:member.offset+157]==member.type, 'pipeline_source_archive')
            seen[name]='dir' if member.isdir() else 'file'
            end=((member.offset_data+member.size+511)//512)*512
        return tar
    except BaseException:
        tar.close(); raise


def call(args, *, cwd=REPO, env=None, cap=256 << 20):
    child = subprocess.Popen(args, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, start_new_session=True)
    end=time.monotonic()+600;data=bytearray();complete=False
    try:
        with selectors.DefaultSelector() as selected:
            selected.register(child.stdout,selectors.EVENT_READ)
            while True:
                remaining=end-time.monotonic()
                p.need(remaining>0 and selected.select(remaining),'command_timeout')
                chunk=os.read(child.stdout.fileno(),min(65536,cap+1-len(data)))
                if not chunk:break
                data.extend(chunk);p.need(len(data)<=cap,'command_capacity')
        p.need(child.wait(timeout=max(.001,end-time.monotonic()))==0,'command_failed')
        p.need(not p.group_active(child.pid),'command_cleanup_unverified');complete=True
        return bytes(data)
    finally:
        try:
            if not complete:
                for sig,grace in [(signal.SIGTERM,1),(signal.SIGKILL,2)]:
                    try:os.killpg(child.pid,sig)
                    except ProcessLookupError:pass
                    until=time.monotonic()+grace
                    while time.monotonic()<until and p.group_active(child.pid):
                        child.poll();time.sleep(.01)
                    if not p.group_active(child.pid):break
                p.need(not p.group_active(child.pid),'command_cleanup_unverified')
                child.wait(timeout=1)
        finally:child.stdout.close()


def pack_pipeline(root):
    rows = []; blobs = []
    for path in sorted(root.rglob('*'), key=lambda v:v.relative_to(root).as_posix().encode()):
        name = path.relative_to(root).as_posix(); st = path.lstat()
        p.need(not os.listxattr(path, follow_symlinks=False), 'build_graph_xattr')
        if path.is_symlink(): row = {'path':name,'type':'symlink','target':os.readlink(path)}
        elif path.is_dir(): row = {'path':name,'type':'dir','mode':0o555}
        else:
            p.need(stat.S_ISREG(st.st_mode) and st.st_size <= 16 << 20, 'build_graph_file')
            raw = path.read_bytes(); p.need(len(raw) == st.st_size, 'build_graph_changed')
            # The exact SRI-verified pnpm distribution contains these four
            # inactive cross-OS reflink helpers. They are retained verbatim,
            # never loaded on Linux; this is not a generic native exemption.
            inactive_pnpm = {'node_modules/.aktau-pnpm/dist/'+v for v in [
                'reflink.win32-x64-msvc-J2TZHRQI.node','reflink.win32-arm64-msvc-Q6BARPPB.node',
                'reflink.darwin-x64-3G3H6IW4.node','reflink.darwin-arm64-2HJ4WGO6.node']}
            if (name.endswith('.node') and name not in inactive_pnpm) or '/@esbuild/linux-x64/bin/' in name:
                p.need(raw[:6] == b'\x7fELF\x02\x01' and raw[18:20] == b'\x3e\x00', 'build_native_platform')
            row = {'path':name,'type':'file','mode':0o555 if st.st_mode & 0o111 else 0o444,
                   'size':len(raw),'sha256':p.digest(raw)}
            blobs.append(('blob/'+str(len(rows)),raw))
        rows.append(row)
    inventory = p.canonical({'version':1,'entries':rows}); p.pipeline_inventory(inventory)
    output = io.BytesIO()
    with tarfile.open(fileobj=output,mode='w',format=tarfile.USTAR_FORMAT) as tar:
        for name,raw in [('inventory.json',inventory),*blobs]:
            item = tarfile.TarInfo(name); item.mode = 0o444; item.size = len(raw); tar.addfile(item,io.BytesIO(raw))
    raw = output.getvalue(); p.pipeline_capsule(raw)
    return raw, inventory, rows


def prepare_pipeline(sha, work, node, env):
    # Package manager and package/native code MUST NOT run as root, even in CI.
    p.need(os.getuid() == os.geteuid() != 0 and sys.platform == 'linux'
           and platform.machine() == 'x86_64' and platform.libc_ver()[0] == 'glibc', 'build_unprivileged_linux')
    p.need(p.digest(node.read_bytes()) == p.PIPELINE_NODE, 'build_node_digest')
    for path,expected in [('pipeline',p.PIPELINE_NEXT_TREE),('pipeline/package.json',p.PIPELINE_NEW_PACKAGE),
                          ('pipeline/pnpm-lock.yaml',p.PIPELINE_NEW_LOCK)]:
        p.need(call(['git','--no-replace-objects','rev-parse',sha+':'+path]).decode().strip() == expected,'build_pipeline_identity')
    stage('source_archive')
    archive = call(['git','-c','tar.umask=0022','archive','--format=tar',sha+'^{tree}','pipeline'])
    with source_archive(archive) as tar: tar.extractall(work,filter='data')
    # One fixed HTTPS distribution, no proxy/redirect; independently pinned TAR.
    stage('pnpm_integrity')
    url = 'https://registry.npmjs.org/pnpm/-/pnpm-10.32.1.tgz'
    request = urllib.request.Request(url,headers={'Accept-Encoding':'identity'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),p.NoRedirect())
    with opener.open(request,timeout=30) as response:
        p.need(response.status == 200, 'pnpm_distribution_status'); raw = response.read((32 << 20)+1)
    p.need(len(raw) <= 32 << 20 and p.digest(raw) == p.PIPELINE_PNPM, 'pnpm_distribution_digest')
    tool = work/'pnpm'; tool.mkdir(mode=0o700)
    with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tar:
        for member in tar.getmembers():
            p.need(member.name.startswith('package/') and '..' not in Path(member.name).parts
                   and (member.isfile() or member.isdir()), 'pnpm_distribution_member')
        tar.extractall(tool,filter='data')
    home = work/'home';home.mkdir(mode=0o700)
    clean = {'PATH':str(node.parent)+':/usr/bin:/bin','HOME':str(home),'LANG':'C.UTF-8','CI':'true',
             'TSX_DISABLE_CACHE':'1','COREPACK_ENABLE_AUTO_PIN':'0'}
    cli = tool/'package/bin/pnpm.cjs'; root = work/'pipeline'
    p.need(call([str(node),str(cli),'--version'],env=clean) == b'10.32.1\n','build_pnpm_version')
    stage('graph_install')
    call([str(node),str(cli),'install','--frozen-lockfile','--ignore-scripts','--ignore-pnpmfile',
          '--store-dir',str(work/'pnpm-store')],cwd=root,env=clean,cap=4 << 20)
    shutil.copytree(tool/'package',root/'node_modules/.aktau-pnpm',symlinks=False)
    stage('runtime_probe')
    call([str(node),str(cli),'exec','tsx','--version'],cwd=root,env=clean,cap=16384)
    probe = ('import{createRequire}from"node:module";import{realpathSync}from"node:fs";'
             'const r=createRequire(realpathSync("node_modules/tsx/package.json"));'
             'if(!r("esbuild").transformSync("const x:number=1",{loader:"ts"}).code)throw Error("native");'
             'const z=await import("zod");z.z.object({x:z.z.string()}).parse({x:"ok"});await import("cheerio");')
    call([str(node),'--input-type=module','-e',probe],cwd=root,env=clean,cap=16384)
    stage('capsule_pack')
    capsule, inventory, rows = pack_pipeline(root)
    stage('descriptor')
    descriptor = {'version':1,'contract':p.PIPELINE_CONTRACT,'sourceSha':sha,'pipelineTreeSha1':p.PIPELINE_NEXT_TREE,
        'packageBlobSha1':p.PIPELINE_NEW_PACKAGE,'lockBlobSha1':p.PIPELINE_NEW_LOCK,'nodeVersion':'v24.18.0',
        'nodeSha256':p.PIPELINE_NODE,'pnpmVersion':'10.32.1','pnpmTarSha256':p.PIPELINE_PNPM,
        'platform':'linux/amd64/glibc','capsuleSha256':p.digest(capsule),'inventorySha256':p.digest(inventory),
        'capsuleBytes':len(capsule),'logicalBytes':sum(r.get('size',0) for r in rows),'entryCount':len(rows)}
    p.pipeline_descriptor(p.canonical(descriptor),capsule,sha)
    return capsule,p.canonical(descriptor),descriptor


def build(sha, output, producer, kind):
    p.need(os.getuid() == os.geteuid() != 0, 'build_root_forbidden')
    p.need(type(sha) is str and p.SHA.fullmatch(sha), 'source_sha')
    target = Path(output)
    p.need(target.is_absolute() and not target.exists() and target.parent.is_dir(), 'output_no_clobber')
    p.need(call(['git', '--no-replace-objects', 'rev-parse', sha + '^{commit}']).decode().strip() == sha)
    stage('toolchain')
    env = {'PATH': os.environ['PATH'], 'HOME': os.environ['HOME'], 'LANG': 'C.UTF-8',
           'GOTOOLCHAIN': 'local', 'CGO_ENABLED': '0', 'GOOS': 'linux', 'GOARCH': 'amd64'}
    p.need(call(['go', 'version'], env=env) == b'go version go1.27.3 linux/amd64\n', 'build_go_version')
    node = Path(shutil.which('node')).resolve()
    p.need(call([str(node), '--version'], env=env) == b'v24.18.0\n', 'build_node_version')
    with tempfile.TemporaryDirectory(prefix='aktau-sync-build-') as temp:
        work = Path(temp)
        stage('source_archive')
        archive = call(['git', 'archive', '--format=tar', sha, 'backend-go'])
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as tar:
            for m in tar.getmembers():
                p.need(not m.name.startswith('/') and '..' not in Path(m.name).parts
                       and (m.isfile() or m.isdir()), 'source_archive')
            tar.extractall(work, filter='data')
        contents = {'node': node.read_bytes()}
        stage('go_build')
        for name, command in [('c2projection', './cmd/c2projection'), ('relayprobe', './internal/revalidation/testdata/relayprobe'), ('ingest', './cmd/ingest')]:
            args = ['go', 'build', '-trimpath']
            if name == 'c2projection': args += ['-ldflags', '-X main.sourceSHA=' + sha]
            args += ['-o', str(work / name), command]
            call(args, cwd=work / 'backend-go', env=env)
            contents[name] = (work / name).read_bytes()
        for name, source in p.source_paths().items():
            contents[name] = call(['git', '--no-replace-objects', 'show', sha + ':' + source])
        contents['source-manifest.json'] = p.canonical({'sourceSha': sha, 'recipe': p.RECIPE, 'nodeMajor': 24})
        # A new isolated object store prevents changing any source worktree ref.
        stage('source_bundle')
        bare = work / 'source.git'
        call(['git', 'init', '--bare', str(bare)])
        call(['git', '--git-dir=' + str(bare), 'fetch', '--no-tags', str(REPO), sha + ':refs/heads/publisher'])
        bundle = work / 'source.bundle'
        call(['git', '--git-dir=' + str(bare), 'bundle', 'create', str(bundle), 'refs/heads/publisher'])
        contents['source.bundle'] = bundle.read_bytes()
        p.need(kind in ['initial', 'build-only', 'promote'], 'build_kind')
        manifest = {'version': 1, 'kind': kind, 'sourceSha': sha,
                    'sourceTree': call(['git', 'rev-parse', sha + '^{tree}']).decode().strip(),
                    'goVersion': 'go1.27.3', 'nodeVersion': 'v24.18.0', 'recipe': p.RECIPE,
                    **producer, 'files': {n: p.digest(contents[n]) for n in p.FILES},
                    'sourceBundleSha256': p.digest(contents['source.bundle'])}
        tree = call(['git','rev-parse',sha+':pipeline']).decode().strip()
        if tree == p.PIPELINE_NEXT_TREE:
            capsule, descriptor, d = prepare_pipeline(sha,work,node,env)
            contents.update({'pipeline-runtime.tar':capsule,'pipeline-runtime.json':descriptor})
            manifest.update(version=2,pipelineRuntime={'descriptorSha256':p.digest(descriptor),
                'capsuleSha256':d['capsuleSha256'],'inventorySha256':d['inventorySha256']})
        contents['promotion.json'] = p.canonical(manifest)
        p.validate_package(contents, sha)
        if manifest['version'] == 2:
            stage('source_admission'); p.source_admission_v2(contents,manifest)
        # Tar metadata is deterministic; no source workspace, credential or env.
        stage('tar_pack')
        prepared = work/'promotion.tar'
        with prepared.open('xb') as f, tarfile.open(fileobj=f, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name in sorted(contents):
                raw = contents[name]; member = tarfile.TarInfo(name)
                member.mode = 0o555 if name in ['node', 'ingest', 'c2projection', 'relayprobe'] else 0o444
                member.size = len(raw); member.mtime = 0; member.uid = member.gid = 0
                tar.addfile(member, io.BytesIO(raw))
        stage('size_budget')
        p.need(prepared.stat().st_size <= p.MAX_TAR, 'package_size')
        qualification = work/'size-check.zip'
        with zipfile.ZipFile(qualification,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            z.write(prepared,'promotion.tar')
        p.need(qualification.stat().st_size <= p.MAX_ARCHIVE, 'zip_capacity')
        stage('publish')
        with prepared.open('rb') as src, target.open('xb') as dst:
            shutil.copyfileobj(src,dst); dst.flush(); os.fsync(dst.fileno())
        parent=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
        try:os.fsync(parent)
        finally:os.close(parent)
        return {'sourceSha': sha, 'archiveSha256': hashlib.file_digest(target.open('rb'), 'sha256').hexdigest(),
                'archiveSize': target.stat().st_size, 'qualificationZipSize':qualification.stat().st_size,
                'artifactVersion':manifest['version'],'files': manifest['files']}


if __name__ == '__main__':
    try:
        p.need(len(sys.argv) == 8, 'build_usage')
        producer = dict(zip(['ciRunId', 'ciAttempt', 'buildRunId', 'buildAttempt'], [int(v) for v in sys.argv[3:7]]))
        p.need(all(type(v) is int and v >= 0 for v in producer.values()), 'build_identity')
        print(json.dumps(build(sys.argv[1], sys.argv[2], producer, sys.argv[7])))
    except BaseException as error:
        reason = (str(error) if type(error) is p.Blocked and str(error) in BUILD_REASONS else
                  'command_timeout' if isinstance(error,subprocess.TimeoutExpired) else
                  'resource_failure' if isinstance(error,OSError) else
                  'interrupted' if isinstance(error,(KeyboardInterrupt,SystemExit)) else
                  'command_failed' if str(error) == 'command_failed' else
                  'command_capacity' if str(error) == 'command_capacity' else
                  'source_archive_invalid' if str(error) == 'pipeline_source_archive' else
                  'integrity_rejected' if str(error) == 'pnpm_distribution_digest' else 'validation_rejected')
        print(json.dumps({'status':'BLOCKED_BUILD','stage':BUILD_STAGE,'reason':reason}),file=sys.stderr)
        sys.exit(1)
