"""V2 coupled protocol: real disposable Git/files, explicit model mount backend.

These are NOT Linux mount/systemd qualification or production authorization.
"""
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
R=Path(__file__).resolve().parents[2]
def load(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
p=load('v2_protocol',R/'ops/c2/publisher-promotion.py');v=p

def capsule(value):
    inv=p.canonical({'version':1,'entries':[{'path':'package.json','type':'file','mode':0o444,'size':len(value),'sha256':p.digest(value)}]})
    raw=io.BytesIO()
    with tarfile.open(fileobj=raw,mode='w',format=tarfile.USTAR_FORMAT) as tar:
        for name,data in [('inventory.json',inv),('blob/0',value)]:
            m=tarfile.TarInfo(name);m.mode=0o444;m.size=len(data);tar.addfile(m,io.BytesIO(data))
    return raw.getvalue(),p.digest(inv)

class Fixture:
    def __init__(self):
        self.temp=tempfile.TemporaryDirectory(prefix='pipeline-v2-coupled-');self.root=Path(self.temp.name);self.root.chmod(0o700)
        self.fs=p.Filesystem(self.root)
        for path in [p.BASE+'/state',p.BASE+'/capsules',p.BASE+'/releases',p.BASE+'/mounts',str(Path(p.PIPELINE_SELECTION).parent)]:
            self.fs.path(path).mkdir(parents=True,exist_ok=True,mode=0o700)
        self.fs.path(p.BASE).chmod(0o700)
        self.fs.path(p.PIPELINE_MOUNT_RECORD).parent.mkdir(parents=True,exist_ok=True,mode=0o755)
        self.repo=self.fs.path(p.PUBLISHER);self.repo.mkdir(parents=True)
        self.git(['init','--quiet']);self.git(['config','user.name','Local fixture']);self.git(['config','user.email','fixture@example.invalid'])
        self.commits=[]
        for text in ['old source','new source']:
            (self.repo/'source.txt').write_text(text);(self.repo/'pipeline').mkdir(exist_ok=True)
            (self.repo/'pipeline/package.json').write_bytes(b'old graph' if text=='old source' else b'new graph')
            self.git(['add','source.txt','pipeline/package.json']);self.git(['commit','--quiet','-m','local synthetic fixture'])
            self.commits.append(self.git(['rev-parse','HEAD']).strip())
        self.git(['checkout','--detach',self.commits[0]])
        self.oldcaps,self.oldgen=capsule(b'old graph');self.newcaps,self.newgen=capsule(b'new graph')
        p.PipelineStore(self.fs).install(self.oldcaps,self.oldgen,'baseline',lambda *args:None)
        selected={'version':1,'contract':v.CONTRACT,'sourceSha':self.commits[0],'pipelineTreeSha1':p.PIPELINE_OLD_TREE,
                  'inventorySha256':self.oldgen,'descriptorSha256':'a'*64,'releaseIdentity':'baseline','provenanceKind':'legacy-installed-attested'}
        self.fs.write(p.PIPELINE_SELECTION,p.canonical(selected),0o644)
        self.contents={n:('new '+n).encode() for n in p.FILES}
        self.contents['source-manifest.json']=p.canonical({'sourceSha':self.commits[1],'recipe':p.RECIPE,'nodeMajor':24})
        self.contents.update({'pipeline-runtime.tar':self.newcaps,'pipeline-runtime.json':b'fixture descriptor'})
        self.manifest={'version':2,'sourceSha':self.commits[1],'files':{n:p.digest(self.contents[n]) for n in p.FILES}}
        self.contents['source.bundle']=b'explicit synthetic admission fixture'
        self.contents['promotion.json']=p.canonical(self.manifest)
        self.manifest['_rootProvenance']={'version':1,'repository':p.REPOSITORY,'sourceSha':self.commits[1],
            'artifactId':1,'zipSha256':'a'*64,'zipBytes':1,'buildRunId':2,'buildAttempt':1,'ciRunId':1,'ciAttempt':1}
        self.old={}
        for target in [*p.FILES.values(),*p.RECORDS]:
            self.fs.path(target).parent.mkdir(parents=True,exist_ok=True)
            self.old[target]=('old '+target).encode();self.fs.write(target,self.old[target],0o444)
        site=p.canonical({'version':2,'evidence':'site-content-verification','origin':'https://aktau.market',
            'representations':['product_ru','product_kk','sitemap','catalog','dashboard','category']})
        self.fs.write(p.SITE,site,0o644);self.fs.write(p.POLICY,b'{}\n')
        oldmanifest=p.canonical({'sourceSha':self.commits[0],'recipe':p.RECIPE,'nodeMajor':24})
        self.old[p.FILES['source-manifest.json']]=oldmanifest
        self.fs.write(p.FILES['source-manifest.json'],oldmanifest,0o444,replace=True)
        hashes={target:p.digest(self.old[target]) for target in p.FILES.values()}
        self.old[p.AUTH]=p.canonical({'version':1,'approved':True,'sourceSha':self.commits[0],
            'binarySha256':hashes[p.FILES['c2projection']],'clockSha256':hashes[p.FILES['relayprobe']],
            'buildId':'synthetic-baseline','platform':'linux/amd64'})
        self.old[p.AUTO]=p.canonical({'version':2,'enabled':True,'sourceSha':self.commits[0],
            'sitePolicySha256':p.digest(site),'files':hashes})
        for target in p.RECORDS:self.fs.write(target,self.old[target],0o444,replace=True)
        self.ledger=self.fs.path('/var/lib/aktau-sync/c2/ledger/attempts.json');self.ledger.parent.mkdir(parents=True);self.ledger.write_bytes(b'[]\n')
        self.mountpath=p.BASE+'/state/fixture-mount.json';self.fs.write(self.mountpath,p.canonical({'generation':self.oldgen,'mountId':1}))
    def git(self,args):
        return subprocess.check_output(['/usr/bin/git','-c','core.hooksPath=/dev/null','-C',str(self.repo),*args],stderr=subprocess.DEVNULL,text=True)
    def close(self):self.temp.cleanup()
    def engine(self,fault=lambda _:None):
        f=self
        class Host(v.TrackedHost):
            def idle(self):pass
            def verify_baseline(self):pass
            def import_release(self,*args):pass
            def validate_release_binaries(self,*args):pass
            def check_release(self,*args,**kwargs):pass
            def invariants(self):return {'reader':'stable fixture metadata',str(f.ledger.relative_to(f.root)).join(['/','']):p.digest(f.ledger.read_bytes())}
            def authority_updates(self,contents,m,identity):
                return v.TrackedHost.authority_updates(self,contents,m,identity)
        class Mounts:
            def parent_identity(self):return list(p.stamp(os.lstat(f.repo.parent)))[:6]
            def underlying_identity(self):return list(p.stamp(os.lstat(f.repo)))[:6]
            def inspect(self):
                record=p.parse(f.fs.read(f.mountpath));ns=os.readlink('/proc/self/ns/mnt')
                if record['generation'] is None:return {'state':'absent','namespace':ns}
                root=f.fs.path(p.BASE+'/capsules/'+record['generation']+'/pipeline')
                return {**record,'state':'mounted','namespace':ns,'rootIdentity':list(p.stamp(os.lstat(root)))[:6]}
            def generation(self):return self.inspect().get('generation')
            def write(self,g):f.fs.write(f.mountpath,p.canonical({'generation':g,'mountId':1}),replace=True)
            def prepare(self,g,identity,register=lambda _:None):
                path=p.BASE+'/mounts/'+identity;f.fs.mkdir(path)
                register(list(p.stamp(os.lstat(f.fs.path(path))))[:6])
                return {'generation':g,'mountId':1,'namespace':os.readlink('/proc/self/ns/mnt'),
                    'rootIdentity':list(p.stamp(os.lstat(f.fs.path(p.BASE+'/capsules/'+g+'/pipeline'))))[:6],'stage':path}
            def detach(self,expected):p.need(self.inspect()==expected,'fixture_unknown_mount');self.write(None)
            def attach(self,prepared):self.write(prepared['generation'])
            def classify(self,record,resources=None):p.need(self.generation() in [record['oldGeneration'],record['newGeneration'],None],'fixture_unknown_mount')
            def detach_known(self,record,resources=None):self.classify(record,resources);self.write(None)
            def restore(self,record,register=lambda _:None):
                self.prepare(record['oldGeneration'],'rollback-'+record['oldGeneration'][:16],register);self.write(record['oldGeneration'])
        return v.TransactionV2(p,self.fs,Host(p,self.fs),Mounts(),fault)
    def descriptor(self,*args):return {'inventorySha256':self.newgen}
    def assert_old(self,test):
        test.assertEqual(self.git(['rev-parse','HEAD']).strip(),self.commits[0])
        test.assertEqual(p.parse(self.fs.read(p.PIPELINE_SELECTION))['inventorySha256'],self.oldgen)
        for target,raw in self.old.items():test.assertEqual(self.fs.read(target),raw)

class CoupledReleaseTests(unittest.TestCase):
    def setUp(self):
        self.f=Fixture();self.addCleanup(self.f.close)
        self.mock=patch.object(p,'pipeline_descriptor',side_effect=self.f.descriptor);self.mock.start();self.addCleanup(self.mock.stop)
    def test_real_source_targets_selection_roundtrip_and_latest_ledger(self):
        e=self.f.engine();self.assertEqual(e.promote(self.f.contents,self.f.manifest,'fixture'),'PIPELINE_V2_COMMITTED')
        self.assertEqual(self.f.git(['rev-parse','HEAD']).strip(),self.f.commits[1]);self.assertFalse(self.f.fs.path(p.INTERLOCK).exists())
        self.f.ledger.write_bytes(b'[{"natural":"later fixture"}]\n');latest=self.f.ledger.read_bytes()
        self.assertEqual(self.f.engine().recover(e.j,deliberate=True),'PIPELINE_V2_ROLLED_BACK')
        self.f.assert_old(self);self.assertEqual(self.f.ledger.read_bytes(),latest)
    def test_sigkill_each_live_boundary_retains_interlock_then_recovers_tuple(self):
        phases=['backed_up','prepared','switching','old_mount_detached','publisher','new_mount_attached',
                *['file_'+str(i) for i in range(14)],'selection_written','tuple_verified','committed']
        for phase in phases:
            with self.subTest(phase=phase):
                f=Fixture()
                try:
                    with patch.object(p,'pipeline_descriptor',side_effect=f.descriptor):
                        pid=os.fork()
                        if pid==0:
                            def kill(name):
                                if name==phase:os.kill(os.getpid(),signal.SIGKILL)
                            f.engine(kill).promote(f.contents,f.manifest,'fixture');os._exit(9)
                        _,status=os.waitpid(pid,0);self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
                        j=p.parse(f.fs.read(p.INTERLOCK,65536));self.assertEqual(j['phase'],phase)
                        self.assertEqual(f.engine().recover(j),'PIPELINE_V2_ROLLED_BACK');f.assert_old(self)
                finally:f.close()
    def test_sigkill_during_rollback_keeps_registered_restored_inode(self):
        e=self.f.engine();e.promote(self.f.contents,self.f.manifest,'fixture')
        pid=os.fork()
        if pid==0:
            def kill(name):
                if name=='rollback_file_0':os.kill(os.getpid(),signal.SIGKILL)
            self.f.engine(kill).recover(e.j,deliberate=True);os._exit(9)
        _,status=os.waitpid(pid,0);self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
        j=p.parse(self.f.fs.read(p.INTERLOCK,65536))
        self.assertEqual(self.f.engine().recover(j),'PIPELINE_V2_ROLLED_BACK')
        self.f.assert_old(self)

    def test_closed_stdout_child_deadline_is_bounded_and_reaped(self):
        import time
        e=self.f.engine();e.promote(self.f.contents,self.f.manifest,'fixture')
        self.f.fs.write(p.INTERLOCK,p.canonical(e.j))
        real=time.monotonic;calls=[0]
        def clock():
            calls[0]+=1
            return real()+(21 if calls[0]>=3 else 0)
        with patch.object(time,'monotonic',side_effect=clock):
            with self.assertRaisesRegex(p.Blocked,'pipeline_child_timeout'):
                e.host._child(['/usr/bin/python3','-c','import os,time;os.close(1);time.sleep(30)'])
        self.assertIsNone(e.j['child'])
        self.assertIsNone(p.parse(self.f.fs.read(p.INTERLOCK,65536))['child'])

    def test_unknown_child_cleanup_retains_durable_child_identity(self):
        e=self.f.engine();e.promote(self.f.contents,self.f.manifest,'fixture')
        self.f.fs.write(p.INTERLOCK,p.canonical(e.j))
        with patch.object(p,'group_active',return_value=True):
            with self.assertRaisesRegex(p.Blocked,'pipeline_child_cleanup_unverified'):
                e.host._child(['/usr/bin/python3','-c','pass'])
        child=p.parse(self.f.fs.read(p.INTERLOCK,65536))['child']
        self.assertIsNotNone(child)
        self.assertTrue(e.host.child_absent(child))

    def test_read_only_parity_closed_results_with_explicit_component_fixtures(self):
        # Component proof only: authority, Node identity and child namespace
        # outcome are explicit fixtures. Native namespace and real Node graph
        # are qualified separately; this is never production parity evidence.
        tree=self.f.git(['rev-parse',self.f.commits[1]+':pipeline']).strip()
        self.assertEqual(p.verify_parity(p,self.f.fs,self.f.engine().host,self.f.engine().mounts)['status'],'NOT_VERIFIED')
        with patch.object(p,'PIPELINE_NEXT_TREE',tree):
            e=self.f.engine();e.promote(self.f.contents,self.f.manifest,'fixture')
            node=p.digest(self.f.fs.read(p.NODE))
            def snapshot():return {str(f.relative_to(self.f.root)):p.digest(f.read_bytes()) for f in self.f.root.rglob('*') if f.is_file() and not f.is_symlink()}
            before=snapshot()
            with patch.object(p,'PIPELINE_NODE',node),patch.object(p.Host,'verify_old_closure',return_value=True):
                for outcome,status in [(True,'PRODUCTION_SOURCE_RUNTIME_ALIGNED'),(False,'BLOCKED'),(None,'NOT_VERIFIED')]:
                    with self.subTest(outcome=outcome),patch.object(p,'private_underlying',return_value=outcome):
                        result=p.verify_parity(p,self.f.fs,e.host,e.mounts)
                        self.assertEqual(result['status'],status)
            self.assertEqual(snapshot(),before)

    def test_real_host_metadata_shape_survives_durable_json(self):
        host=p.TrackedHost(p,self.f.fs)
        metadata={'reader':(1,2,1999,1999,0o100600),'ledger':(3,4,0o100600,'a'*64)}
        with patch.object(host.base,'invariants',return_value=metadata):
            normalized=host.invariants()
        self.assertEqual(normalized,p.parse(p.canonical(metadata)))
        self.assertEqual(normalized,p.parse(p.canonical(normalized)))

    def test_eio_initial_journal_pending_blocks_another_promotion(self):
        import errno
        e=self.f.engine()
        with patch.object(p.os,'fsync',side_effect=OSError(errno.EIO,'injected fsync')):
            with self.assertRaises(OSError):e.promote(self.f.contents,self.f.manifest,'failed-intent')
        self.assertFalse(self.f.fs.path(p.INTERLOCK).exists())
        pending=list(self.f.fs.path(p.BASE).glob('.*.pending'))
        self.assertEqual(len(pending),1);original=pending[0].read_bytes()
        with self.assertRaisesRegex(p.Blocked,'pipeline_unknown_pending_write'):
            self.f.engine().promote(self.f.contents,self.f.manifest,'second-intent')
        self.assertEqual(pending[0].read_bytes(),original);self.f.assert_old(self)

    def test_retained_new_payload_tamper_blocks_before_any_rollback_write(self):
        e=self.f.engine();e.promote(self.f.contents,self.f.manifest,'fixture')
        retained=e.j['resources']['payloadFiles']['c2projection'];self.f.fs.write(retained,b'FOREIGN',replace=True)
        before={t:self.f.fs.read(t) for t in e.j['c2Targets']};source=self.f.git(['rev-parse','HEAD'])
        with self.assertRaisesRegex(p.Blocked,'pipeline_retained_payload'):
            self.f.engine().recover(e.j,deliberate=True)
        self.assertEqual({t:self.f.fs.read(t) for t in before},before)
        self.assertEqual(self.f.git(['rev-parse','HEAD']),source)

    def test_unknown_retained_resource_and_mount_boolean_are_rejected(self):
        e=self.f.engine();e.promote(self.f.contents,self.f.manifest,'fixture')
        changed=json.loads(p.canonical(e.j));changed['pipeline']['mountBefore']['mountId']=True
        with self.assertRaisesRegex(p.Blocked,'pipeline_mount_record'):e.validate(changed)
        foreign=e.j['directory']+'/FOREIGN';self.f.fs.write(foreign,b'foreign fixture')
        with self.assertRaisesRegex(p.Blocked,'pipeline_unknown_release_resource'):
            self.f.engine().recover(e.j,deliberate=True)
        self.assertEqual(self.f.fs.read(foreign),b'foreign fixture')

    def test_existing_v1_backup_history_remains_read_only(self):
        directory=p.BASE+'/releases/legacy-fixture';self.f.fs.mkdir(directory);self.f.fs.mkdir(directory+'/backup')
        targets={}
        for i,(target,raw) in enumerate(self.f.old.items()):
            backup=directory+'/backup/'+str(i);self.f.fs.write(backup,raw)
            targets[target]={'backup':backup,'oldHash':p.digest(raw),'newHash':p.digest(raw)}
        raw=p.canonical({'version':1,'identity':'legacy-fixture','directory':directory,'phase':'committed','targets':targets})
        self.f.fs.write(directory+'/receipt.json',raw)
        p.release_inventory_v2(p,self.f.fs)
        self.assertEqual(self.f.fs.read(directory+'/receipt.json'),raw)
        with self.assertRaisesRegex(p.Blocked,'dependency_history_unbound'):
            p.Transaction(self.f.fs,object()).rollback({})

    def test_sigkill_after_rollback_receipt_keeps_exact_no_clobber_recovery(self):
        e=self.f.engine();e.promote(self.f.contents,self.f.manifest,'fixture')
        pid=os.fork()
        if pid==0:
            def kill(name):
                if name=='rollback_receipt_durable':os.kill(os.getpid(),signal.SIGKILL)
            self.f.engine(kill).recover(e.j,deliberate=True);os._exit(9)
        _,status=os.waitpid(pid,0);self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
        terminal=e.j['directory']+'/rollback.json';original=self.f.fs.read(terminal,65536)
        j=p.parse(self.f.fs.read(p.INTERLOCK,65536))
        self.assertEqual(self.f.engine().recover(j),'PIPELINE_V2_ROLLED_BACK')
        self.assertEqual(self.f.fs.read(terminal,65536),original);self.f.assert_old(self)

    def test_foreign_target_blocks_before_any_recovery_write(self):
        e=self.f.engine();e.promote(self.f.contents,self.f.manifest,'fixture')
        target=next(iter(p.FILES.values()));self.f.fs.write(target,b'FOREIGN',replace=True)
        before={t:self.f.fs.read(t) for t in e.j['c2Targets']}
        with self.assertRaisesRegex(p.Blocked,'pipeline_unknown_target'):self.f.engine().recover(e.j,deliberate=True)
        self.assertEqual({t:self.f.fs.read(t) for t in before},before)
    def test_live_child_or_unknown_schema_blocks_recovery(self):
        e=self.f.engine();e.promote(self.f.contents,self.f.manifest,'fixture')
        changed=json.loads(p.canonical(e.j));changed['unexpected']=True
        with self.assertRaisesRegex(p.Blocked,'pipeline_journal_schema'):self.f.engine().recover(changed,deliberate=True)
        candidate=self.f.engine();candidate.host.child_absent=lambda _:False
        with self.assertRaisesRegex(p.Blocked,'pipeline_child_cleanup_unverified'):candidate.recover(e.j,deliberate=True)

class NamespaceFDTests(unittest.TestCase):
    def probe(self,kind,metadata='valid'):
        code=r'''
import importlib.util,os,fcntl,sys
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('ns_fixture',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
kind,metadata=sys.argv[2:]
fd=os.open('/proc/self/ns/'+('mnt' if kind=='mount' else 'net'),os.O_RDONLY|os.O_CLOEXEC)
if fd!=3:os.dup2(fd,3);os.close(fd)
os.environ.update(LISTEN_PID=str(os.getpid()),LISTEN_FDS='1',LISTEN_FDNAMES='host-mount')
if metadata=='pid':os.environ['LISTEN_PID']='0'
if metadata=='count':os.environ['LISTEN_FDS']='2'
if metadata=='name':os.environ['LISTEN_FDNAMES']='caller-controlled'
with patch.object(p.os,'getuid',return_value=0),patch.object(p.os,'geteuid',return_value=0):
 if kind!='mount' or metadata!='valid':
  try:p.systemd_host_namespace()
  except (p.Blocked,OSError):print('REJECTED');raise SystemExit(0)
  raise SystemExit(78)
 result=p.systemd_host_namespace()
 assert result>=16 and not os.get_inheritable(result)
 assert not any(k in os.environ for k in ['LISTEN_PID','LISTEN_FDS','LISTEN_FDNAMES'])
 try:os.fstat(3)
 except OSError:pass
 else:raise SystemExit(79)
 pid=os.fork()
 if pid==0:os.execve('/usr/bin/python3',['python3','-c','import os,sys\ntry:os.fstat('+str(result)+')\nexcept OSError:sys.exit(0)\nsys.exit(78)'],{})
 _,status=os.waitpid(pid,0);assert os.waitstatus_to_exitcode(status)==0
 os.close(result);print('PINNED_NO_LEAK')
'''
        result=subprocess.run(['/usr/bin/python3','-B','-c',code,str(R/'ops/c2/publisher-promotion.py'),kind,metadata],capture_output=True,text=True,timeout=10)
        self.assertEqual(result.returncode,0,result.stderr)
        return result.stdout.strip()
    def test_actual_kernel_mount_handle_is_pinned_and_not_exec_inherited(self):
        self.assertEqual(self.probe('mount'),'PINNED_NO_LEAK')
    def test_manager_metadata_is_closed_and_not_an_approval_flag(self):
        for bad in ['pid','count','name']:
            with self.subTest(bad=bad):self.assertEqual(self.probe('mount',bad),'REJECTED')
    def test_different_kernel_namespace_type_is_rejected(self):
        self.assertEqual(self.probe('network'),'REJECTED')

class CapacityAdmissionTests(unittest.TestCase):
    def test_low_cgroup_rejects_despite_large_host_memory(self):
        original=Path.read_text
        def read(path,*args,**kwargs):
            name=str(path)
            if name=='/proc/meminfo':return 'MemAvailable: 999999999 kB\n'
            if name=='/proc/self/cgroup':return '0::/fixture\n'
            if name=='/proc/self/mountinfo':return '1 0 0:1 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n'
            if name.endswith('/memory.max'):return str(256<<20)
            if name.endswith('/memory.current'):return str(220<<20)
            return original(path,*args,**kwargs)
        with patch.object(Path,'read_text',read):
            with self.assertRaisesRegex(p.Blocked,'insufficient_memory_capacity'):p.memory_guard(128<<20)
    def test_low_target_filesystem_rejects_before_intent(self):
        f=Fixture();self.addCleanup(f.close);real=os.fstatvfs
        def space(fd):
            value=real(fd)
            if '/usr/local/' in os.readlink('/proc/self/fd/'+str(fd)):
                return os.statvfs_result((value.f_bsize,value.f_frsize,value.f_blocks,0,0,value.f_files,0,0,value.f_flag,value.f_namemax))
            return value
        with patch.object(p,'pipeline_descriptor',side_effect=f.descriptor),patch.object(os,'fstatvfs',side_effect=space):
            with self.assertRaisesRegex(p.Blocked,'insufficient_disk_capacity'):f.engine().promote(f.contents,f.manifest,'capacity')
        self.assertFalse(f.fs.path(p.INTERLOCK).exists());f.assert_old(self)

    def memory_files(self,overrides=None):
        files={'/proc/meminfo':'MemAvailable: 999999999 kB\n','/proc/self/cgroup':'0::/parent/leaf\n',
            '/proc/self/mountinfo':'1 0 0:1 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n'}
        for name in ['/sys/fs/cgroup','/sys/fs/cgroup/parent','/sys/fs/cgroup/parent/leaf']:
            files[name+'/memory.max']='max\n';files[name+'/memory.current']='0\n'
        files.update(overrides or {});return files
    def memory_mock(self,files):
        original=Path.read_text
        return patch.object(Path,'read_text',lambda path,*a,**kw:files[str(path)] if str(path) in files else original(path,*a,**kw))
    def test_parent_cgroup_headroom_and_reserve(self):
        with self.memory_mock(self.memory_files({'/sys/fs/cgroup/parent/memory.max':str(512<<20),
                    '/sys/fs/cgroup/parent/memory.current':str(400<<20)})):
            with self.assertRaisesRegex(p.Blocked,'insufficient_memory_capacity'):p.memory_guard(64<<20)
        with self.memory_mock(self.memory_files({'/sys/fs/cgroup/parent/memory.max':str(512<<20)})):
            p.memory_guard(128<<20)
        with self.memory_mock(self.memory_files({'/proc/meminfo':'MemAvailable: 1024 kB\n'})):
            with self.assertRaisesRegex(p.Blocked,'insufficient_memory_capacity'):p.memory_guard(1<<20)
    def test_unknown_malformed_and_unsupported_cgroup_fail_closed(self):
        for key,value in [('/proc/self/cgroup','2:memory:/legacy\n'),('/proc/self/cgroup','0::/../../escape\n'),
            ('/proc/self/mountinfo',''),('/sys/fs/cgroup/parent/memory.max','-1'),
            ('/sys/fs/cgroup/parent/leaf/memory.current','garbage'),('/proc/meminfo','MemAvailable: unknown kB\n')]:
            with self.subTest(key=key,value=value),self.memory_mock(self.memory_files({key:value})):
                with self.assertRaisesRegex(p.Blocked,'memory_capacity_unverified'):p.memory_guard(1<<20)
        with self.memory_mock(self.memory_files()),patch.object(Path,'read_text',side_effect=OSError('unavailable')):
            with self.assertRaisesRegex(p.Blocked,'memory_capacity_unverified'):p.memory_guard(1<<20)
    def test_bad_memory_budget_and_peak_accounting(self):
        for value in [True,0,-1,1.5,9<<30]:
            with self.assertRaisesRegex(p.Blocked,'memory_budget_invalid'):p.memory_guard(value)
        peak=p.transfer_memory_budget(p.MAX_ARCHIVE)
        self.assertGreaterEqual(peak,2*p.MAX_ARCHIVE+4*p.MAX_TAR+4*p.PIPELINE_CAP+(128<<20))
        for args in [(True,),(-1,),(1,p.MAX_TAR+1)]:
            with self.assertRaisesRegex(p.Blocked,'memory_budget_invalid'):p.transfer_memory_budget(*args)
    def test_base_space_and_duplicate_generation_peak_before_intent(self):
        for free in [0,128<<20]:
            f=Fixture();self.addCleanup(f.close);real=os.fstatvfs
            def space(fd):
                v=real(fd)
                if p.BASE in os.readlink('/proc/self/fd/'+str(fd)):
                    return os.statvfs_result((v.f_bsize,v.f_frsize,v.f_blocks,free//v.f_frsize,free//v.f_frsize,v.f_files,v.f_ffree,v.f_favail,v.f_flag,v.f_namemax))
                return v
            with patch.object(p,'pipeline_descriptor',side_effect=f.descriptor),patch.object(os,'fstatvfs',side_effect=space):
                if free==0:
                    with self.assertRaisesRegex(p.Blocked,'insufficient_disk_capacity'):f.engine().promote(f.contents,f.manifest,'capacity')
                else:
                    # A large repeated payload must be budgeted for retained and staged copies,
                    # even though its old one-copy + arbitrary reserve formula could fit.
                    f.contents['node']=b'n'*(32<<20)
                    with self.assertRaisesRegex(p.Blocked,'insufficient_disk_capacity'):f.engine().promote(f.contents,f.manifest,'capacity')
            self.assertFalse(f.fs.path(p.INTERLOCK).exists());f.assert_old(self)
    def test_unknown_filesystem_and_malformed_budget(self):
        f=Fixture();self.addCleanup(f.close);updates={t:f.old[t] for t in f.old}
        old={t:len(x) for t,x in updates.items()}
        with patch.object(os,'fstatvfs',side_effect=OSError('unknown device')):
            with self.assertRaises((p.Blocked,OSError)):p.pipeline_disk_guard(f.fs,f.contents,updates,old,b'old',b'new')
        for bad in [{},dict(old,**{next(iter(old)):True})]:
            with self.assertRaisesRegex(p.Blocked,'disk_budget_invalid'):p.pipeline_disk_guard(f.fs,f.contents,updates,bad,b'old',b'new')
    def test_same_device_budget_aggregates_and_uses_strictest_mount(self):
        f=Fixture();self.addCleanup(f.close);updates={t:f.old[t] for t in f.old}
        result=p.pipeline_disk_guard(f.fs,f.contents,updates,{t:len(x) for t,x in updates.items()},b'old',b'new')
        self.assertEqual(len(result),1)
        total=next(iter(result.values()))
        self.assertGreater(total['bytes'],2*p.MAX_TAR)
        self.assertGreater(total['inodes'],8192)
    def test_unbudgeted_nested_mount_is_unknown_before_intent(self):
        f=Fixture();self.addCleanup(f.close);original=Path.read_text
        def text(path,*args,**kwargs):
            raw=original(path,*args,**kwargs)
            if str(path)=='/proc/self/mountinfo':
                raw+='\n1000 1 0:100 / '+str(f.fs.path(p.BASE+'/releases/unknown'))+' rw - tmpfs tmpfs rw\n'
            return raw
        with patch.object(p,'pipeline_descriptor',side_effect=f.descriptor),patch.object(Path,'read_text',text):
            with self.assertRaisesRegex(p.Blocked,'disk_capacity_unverified'):f.engine().promote(f.contents,f.manifest,'capacity')
        self.assertFalse(f.fs.path(p.INTERLOCK).exists());f.assert_old(self)
    def test_invalid_statvfs_cannot_authorize_capacity(self):
        f=Fixture();self.addCleanup(f.close);real=os.fstatvfs
        def malformed(fd):
            v=real(fd)
            return os.statvfs_result((v.f_bsize,0,v.f_blocks,v.f_bfree,v.f_bavail,v.f_files,v.f_ffree,v.f_favail,v.f_flag,v.f_namemax))
        with patch.object(p,'pipeline_descriptor',side_effect=f.descriptor),patch.object(os,'fstatvfs',side_effect=malformed):
            with self.assertRaisesRegex(p.Blocked,'disk_capacity_unverified'):f.engine().promote(f.contents,f.manifest,'capacity')
        self.assertFalse(f.fs.path(p.INTERLOCK).exists());f.assert_old(self)
    def test_source_pack_index_budget_rejects_before_git_or_temporary_writes(self):
        import struct
        for version,count in [(2,(1<<20)+1),(9,1),(2,0)]:
            bundle=b'# v2 git bundle\n\nPACK'+struct.pack('>II',version,count)
            with self.assertRaisesRegex(p.Blocked,'source_disk_capacity'):
                p.source_admission_v2({'source.bundle':bundle},{'version':2})
        with self.assertRaisesRegex(p.Blocked,'source_capacity_unverified'):
            p.source_admission_v2({'source.bundle':b'invalid bundle'},{'version':2})

    def test_kernel_hierarchy_root_missing_limits_is_not_missing_child_fallback(self):
        files=self.memory_files();files['/sys/fs/cgroup/cgroup.controllers']='cpu memory io\n'
        files['/sys/fs/cgroup/memory.stat']='anon 0\nfile 0\n'
        original=Path.read_text
        def text(path,*args,**kwargs):
            if str(path) in ['/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory.current']:raise FileNotFoundError()
            return files[str(path)] if str(path) in files else original(path,*args,**kwargs)
        with patch.object(Path,'read_text',text):p.memory_guard(128<<20)
        files['/sys/fs/cgroup/cgroup.controllers']='cpu io\n'
        with patch.object(Path,'read_text',text):
            with self.assertRaisesRegex(p.Blocked,'memory_capacity_unverified'):p.memory_guard(128<<20)
        def child_missing(path,*args,**kwargs):
            if str(path)=='/sys/fs/cgroup/parent/leaf/memory.max':raise FileNotFoundError()
            return text(path,*args,**kwargs)
        with patch.object(Path,'read_text',child_missing):
            with self.assertRaisesRegex(p.Blocked,'memory_capacity_unverified'):p.memory_guard(128<<20)
