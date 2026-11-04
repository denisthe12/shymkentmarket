import fcntl
import importlib.util
import os
import pathlib
import stat
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('runtime_gate', pathlib.Path(__file__).with_name('promotion-runtime-gate.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class RuntimeGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='promotion-runtime-fixture-'); self.addCleanup(self.temp.cleanup)
        self.base = pathlib.Path(self.temp.name); (self.base/'runtime.lock').touch(mode=0o644)
        real_lstat, real_fstat = os.lstat, os.fstat
        def trusted_parent(p):
            s = real_lstat(p)
            return SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0) if stat.S_ISDIR(s.st_mode) else s
        def trusted_lock(fd):
            s = real_fstat(fd)
            return SimpleNamespace(st_mode=s.st_mode, st_uid=0, st_nlink=s.st_nlink)
        for ctx in [patch.object(m,'BASE',str(self.base)), patch.object(m.pathlib.Path,'lstat',trusted_parent),
                    patch.object(m.os,'fstat',side_effect=trusted_lock),
                    patch.object(m.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=os.geteuid()))]:
            ctx.start(); self.addCleanup(ctx.stop)

    def test_real_kernel_shared_lock_excludes_exclusive_promotion(self):
        fd = m.acquire('daily')
        other = os.open(self.base/'runtime.lock',os.O_RDWR)
        try:
            with self.assertRaises(BlockingIOError): fcntl.flock(other,fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertTrue(os.get_inheritable(fd))
        finally: os.close(fd)
        fcntl.flock(other,fcntl.LOCK_EX | fcntl.LOCK_NB); os.close(other)

    def test_busy_promotion_wait_is_bounded_without_starting_business(self):
        held = os.open(self.base/'runtime.lock',os.O_RDWR)
        fcntl.flock(held,fcntl.LOCK_EX)
        try:
            with patch.object(m.time,'monotonic',side_effect=[0,121]), patch.object(m.os,'execv',side_effect=AssertionError('no execution')):
                with self.assertRaisesRegex(ValueError,'promotion_busy'): m.acquire('daily')
        finally: os.close(held)

    def test_crash_interlock_blocks_source_execution(self):
        (self.base/'interlock.json').write_bytes(b'root-controlled pending promotion fixture')
        with patch.object(m.os,'execv',side_effect=AssertionError('must not exec')):
            with self.assertRaisesRegex(ValueError,'reconciliation_required'): m.acquire('weekly')

    def test_foreign_role_identity_symlink_hardlink_and_mode_rejected(self):
        with self.assertRaises(ValueError): m.acquire('shell')
        with patch.object(m.pwd,'getpwnam',return_value=SimpleNamespace(pw_uid=os.geteuid()+1)):
            with self.assertRaisesRegex(ValueError,'identity'): m.acquire('daily')
        (self.base/'runtime.lock').chmod(0o666)
        with self.assertRaisesRegex(ValueError,'runtime_lock'): m.acquire('daily')
        (self.base/'runtime.lock').chmod(0o644)
        os.link(self.base/'runtime.lock',self.base/'alias')
        with self.assertRaisesRegex(ValueError,'runtime_lock'): m.acquire('daily')
        (self.base/'alias').unlink()
        (self.base/'runtime.lock').rename(self.base/'saved')
        (self.base/'runtime.lock').symlink_to(self.base/'saved')
        with self.assertRaises(OSError): m.acquire('daily')

    def test_unsafe_ancestor_denied_before_open(self):
        with patch.object(m.pathlib.Path,'lstat',return_value=SimpleNamespace(st_mode=stat.S_IFDIR|0o777,st_uid=0)),patch.object(m.os,'open',side_effect=AssertionError('must not open')):
            with self.assertRaisesRegex(ValueError,'custody'): m.acquire('daily')

    def test_fixed_commands_preserve_existing_scripts_notify_and_no_publish(self):
        self.assertEqual(m.COMMANDS, {'daily':['/usr/bin/bash','pipeline/scripts/daily-sync.sh'],
                                    'weekly':['/usr/bin/bash','pipeline/scripts/weekly-full-scrape.sh'],
                                    'c2':['/usr/bin/python3','-I','-B','/usr/local/libexec/aktau-c2-custodian.py']})
        for name in ['promotion-daily.conf','promotion-weekly.conf','promotion-custodian.conf']:
            data = pathlib.Path(__file__).with_name(name).read_text()
            self.assertNotIn('OnCalendar',data); self.assertNotIn('EnvironmentFile',data)
            self.assertIn('ExecStart=\nExecStart=/usr/bin/python3 -I -B',data)


    def test_boot_unit_has_only_capabilities_for_fixed_mount_and_reaped_actor_git(self):
        data=pathlib.Path(__file__).with_name('aktau-sync-dependencies.service').read_text()
        self.assertIn('CapabilityBoundingSet=CAP_SYS_ADMIN CAP_DAC_READ_SEARCH CAP_SETUID CAP_SETGID CAP_KILL\n',data)
        self.assertIn('ExecStart=/usr/bin/python3 -I -B /usr/local/libexec/aktau-sync-promotion/publisher-promotion.py --mount-committed-pipeline\n',data)
        self.assertIn('OpenFile=/proc/1/ns/mnt:host-mount:read-only\n',data)
        self.assertIn('AmbientCapabilities=CAP_SETUID CAP_SETGID\n',data)
        self.assertNotIn('CAP_SYS_PTRACE',data)
        for forbidden in ['PrivateMounts=','PrivateTmp=','ProtectSystem=','EnvironmentFile=','OnCalendar=']:
            self.assertNotIn(forbidden,data)
        for name in ['promotion-daily.conf','promotion-weekly.conf']:
            dropin=pathlib.Path(__file__).with_name(name).read_text()
            self.assertIn('Requires=aktau-sync-dependencies.service',dropin)
            self.assertIn('After=aktau-sync-dependencies.service',dropin)
        self.assertNotIn('aktau-sync-dependencies.service',pathlib.Path(__file__).with_name('promotion-custodian.conf').read_text())


class ActorSelectionTests(unittest.TestCase):
    def fixture(self):
        import json,hashlib
        selected={'version':1,'contract':'pr86-pipeline-v2','sourceSha':'a'*40,
            'pipelineTreeSha1':'cc2f3f1d32570ad7892abe433b37a7ca82ebefcd','inventorySha256':'b'*64,
            'descriptorSha256':'c'*64,'releaseIdentity':'fixture','provenanceKind':'github-artifact'}
        raw=(json.dumps(selected,separators=(',',':'))+'\n').encode()
        att={'version':1,'bootId':pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
            'mountNamespaceInode':os.stat('/proc/self/ns/mnt').st_ino,'mountId':77,
            'selectionSha256':hashlib.sha256(raw).hexdigest(),'mountedRootDev':11,'mountedRootInode':12,'inventorySha256':'b'*64}
        return selected,raw,att
    def verify(self,selected,raw,att,flags='ro,nosuid,nodev',extra=''):
        original_stat=os.stat;original_read=pathlib.Path.read_text
        def read(path,*args,**kwargs):
            if str(path)=='/proc/self/mountinfo':return '77 1 0:1 / /opt/aktau-sync/pipeline '+flags+' - tmpfs tmpfs rw\n'+extra
            return original_read(path,*args,**kwargs)
        def stat_target(path,*args,**kwargs):
            if str(path)=='/opt/aktau-sync/pipeline':return SimpleNamespace(st_mode=stat.S_IFDIR|0o555,st_uid=0,st_dev=11,st_ino=12)
            return original_stat(path,*args,**kwargs)
        authority={'version':1,'approved':True,'sourceSha':selected['sourceSha'],'binarySha256':'d'*64,'clockSha256':'e'*64,'buildId':'fixture','platform':'linux/amd64'}
        files={'fixture'+str(i):'f'*64 for i in range(10)}
        files.update({'/usr/local/libexec/aktau-c2/c2projection':'d'*64,'/usr/local/libexec/aktau-c2/relayprobe':'e'*64})
        automatic={'version':2,'enabled':True,'sourceSha':selected['sourceSha'],'sitePolicySha256':'f'*64,'files':files}
        manifest={'sourceSha':selected['sourceSha'],'recipe':'explicit test fixture','nodeMajor':24}
        with patch.object(m,'read_control',side_effect=[(selected,raw),(att,b'fixture'),(authority,b'fixture'),(automatic,b'fixture'),(manifest,b'fixture')]),patch.object(m.os,'stat',side_effect=stat_target),patch.object(m.pathlib.Path,'read_text',read),patch('subprocess.run',side_effect=[SimpleNamespace(returncode=0,stdout=selected['sourceSha'].encode()+b'\n'),SimpleNamespace(returncode=0,stdout=selected['pipelineTreeSha1'].encode()+b'\n')]):
            return m.verify_actor()
    def test_stable_committed_attestation(self):
        selected,raw,att=self.fixture();self.assertEqual(self.verify(selected,raw,att),selected)
    def test_stale_boot_namespace_binding_and_mount_flags_are_rejected(self):
        for key,value in [('bootId','stale'),('mountNamespaceInode',0),('mountId',True),('selectionSha256','0'*64),('inventorySha256','d'*64)]:
            selected,raw,att=self.fixture();att[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):self.verify(selected,raw,att)
        selected,raw,att=self.fixture()
        with self.assertRaisesRegex(ValueError,'pipeline_mount_flags'):self.verify(selected,raw,att,flags='rw,nosuid,nodev')
        with self.assertRaisesRegex(ValueError,'pipeline_nested_mount'):self.verify(selected,raw,att,extra='78 77 0:2 / /opt/aktau-sync/pipeline/nested ro - tmpfs tmpfs rw\n')
    def test_missing_control_proof_is_not_optional(self):
        with patch.object(m,'read_control',side_effect=FileNotFoundError):
            with self.assertRaises(FileNotFoundError):m.verify_actor()
    def test_custodian_does_not_inherit_actor_mount_requirement(self):
        with patch.object(m.sys,'argv',['gate','c2']),patch.object(m,'acquire') as acquire,patch.object(m,'verify_actor',side_effect=AssertionError('actor-only')),patch.object(m.os,'execv') as execute:
            m.main();acquire.assert_called_once_with('c2');execute.assert_called_once_with(m.COMMANDS['c2'][0],m.COMMANDS['c2'])


if __name__ == '__main__': unittest.main()
