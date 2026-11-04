"""Root-only qualification inside an explicitly owned disposable container.

Never run on the host. Synthetic authority is NOT deployment authorization.
"""
import importlib.util
import json
import os
import signal
from unittest.mock import patch
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('local_release_fixture', ROOT/'ops/c2/test_pipeline_release.py')
t = importlib.util.module_from_spec(spec); spec.loader.exec_module(t)
p = t.p

def setUpModule():
    # Test-only fixed probe: preserve all eleven native methods below unchanged.
    spec = importlib.util.spec_from_file_location('native_mount_prerequisites', ROOT/'scripts/ci/native-mount-preflight.py')
    helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
    result = helper.qualify()
    print('NATIVE_MOUNT_PREFLIGHT '+json.dumps(result,sort_keys=True),flush=True)
    if result['status'] != 'PASS':
        raise RuntimeError('native_mount_prerequisite_failed:'+result['reason'])


class NativeMountSafetyTests(unittest.TestCase):
    def setUp(self):
        if not Path('/.dockerenv').exists() or os.getuid() != 0:
            raise RuntimeError('disposable_root_container_required')
        self.f = t.Fixture()
        # Container destruction, not recursive deletion of mounted paths, owns cleanup.
        self.f.temp._finalizer.detach()
        self.mounts = p.LinuxMounts(p, self.f.fs)

    def test_actual_target_tmpfs_low_capacity_blocks_before_intent(self):
        import subprocess
        f=self.f;parent=f.fs.path(p.KIT)
        before={q.name:q.read_bytes() for q in parent.iterdir() if q.is_file()}
        subprocess.run(['/bin/mount','-t','tmpfs','-o','size=1m,nosuid,nodev','capacity-fixture',str(parent)],check=True)
        try:
            parent.chmod(0o755)
            for name,raw in before.items():
                (parent/name).write_bytes(raw);(parent/name).chmod(0o444)
            self.assertNotEqual(os.stat(parent).st_dev,os.stat(f.fs.path(p.BASE)).st_dev)
            with patch.object(p,'pipeline_descriptor',side_effect=f.descriptor):
                with self.assertRaisesRegex(p.Blocked,'insufficient_disk_capacity'):
                    f.engine().promote(f.contents,f.manifest,'capacity')
            self.assertFalse(f.fs.path(p.INTERLOCK).exists())
            self.assertEqual({q.name:q.read_bytes() for q in parent.iterdir()},before)
        finally:subprocess.run(['/bin/umount',str(parent)],check=True)
        f.assert_old(self)

    def test_operator_symlink_cannot_redirect_root_mount(self):
        f = self.f
        target = f.fs.path(p.PUBLISHER+'/pipeline')
        target.rename(target.with_name('original-pipeline'))
        foreign = f.root/'foreign'; foreign.mkdir(); (foreign/'marker').write_text('foreign')
        identity = os.stat(foreign).st_ino
        target.symlink_to(foreign, target_is_directory=True)
        with self.assertRaises((p.Blocked, OSError)):
            self.mounts._mount(self.mounts._root(f.oldgen), p.PUBLISHER+'/pipeline', 4096)
        self.assertIsNone(self.mounts._record(str(foreign.relative_to(f.root)).join(['/',''])))
        self.assertEqual(os.stat(foreign).st_ino, identity)
        self.assertEqual((foreign/'marker').read_text(), 'foreign')
        self.assertTrue(target.is_symlink())

    def baseline(self):
        identity=self.mounts.underlying_identity()
        parent=self.mounts.parent_identity()
        self.mounts.attach(self.mounts.prepare(self.f.oldgen,'native-baseline'))
        return {'underlyingTargetIdentity':identity,'targetParentIdentity':parent}

    def test_stage_moves_when_the_host_mount_above_it_is_shared(self):
        # systemd makes / shared on a real host; MS_MOVE rejects a mount attached under a shared parent.
        import subprocess
        root=str(self.f.root)
        subprocess.run(['/bin/mount','--bind',root,root],check=True)
        subprocess.run(['/bin/mount','--make-shared',root],check=True)
        self.baseline();e=self.f.engine();e.mounts=self.mounts
        self.assertEqual(self.mounts.generation(),self.f.oldgen)
        with patch.object(p,'pipeline_descriptor',side_effect=self.f.descriptor):
            self.assertEqual(e.promote(self.f.contents,self.f.manifest,'native'),'PIPELINE_V2_COMMITTED')
        self.assertEqual(self.mounts.generation(),self.f.newgen)
        recovered=self.f.engine();recovered.mounts=self.mounts
        self.assertEqual(recovered.recover(e.j,deliberate=True),'PIPELINE_V2_ROLLED_BACK')
        self.assertEqual(self.mounts.generation(),self.f.oldgen)

    def test_real_mount_coupled_source_authority_roundtrip(self):
        self.baseline();e=self.f.engine();e.mounts=self.mounts
        with patch.object(p,'pipeline_descriptor',side_effect=self.f.descriptor):
            self.assertEqual(e.promote(self.f.contents,self.f.manifest,'native'),'PIPELINE_V2_COMMITTED')
        self.assertEqual(self.mounts.generation(),self.f.newgen)
        recovered=self.f.engine();recovered.mounts=self.mounts
        self.assertEqual(recovered.recover(e.j,deliberate=True),'PIPELINE_V2_ROLLED_BACK')
        self.f.assert_old(self);self.assertEqual(self.mounts.generation(),self.f.oldgen)

    def test_fresh_controller_pins_hidden_checkout_in_child_namespace(self):
        receipt=self.baseline();before=self.mounts.inspect();fresh=p.LinuxMounts(p,self.f.fs)
        with patch.object(p,'require_enrollment',return_value=receipt):
            self.assertEqual(fresh.underlying_identity(),receipt['underlyingTargetIdentity'])
        self.assertEqual(self.mounts.inspect(),before)

    def test_hidden_checkout_tamper_is_not_runtime_parity(self):
        target=self.f.fs.path(p.PUBLISHER+'/pipeline/package.json')
        fd=os.open(target,os.O_WRONLY)
        try:
            self.baseline();before=self.mounts.inspect();os.write(fd,b'HOSTILE')
            selected=p.parse(self.f.fs.read(p.PIPELINE_SELECTION))
            host=p.TrackedHost(p,self.f.fs)
            self.assertIs(p.private_underlying(p,self.f.fs,host,self.mounts,selected),False)
            self.assertEqual(self.mounts.inspect(),before)
        finally:os.close(fd)

    def test_hidden_untracked_source_is_not_parity(self):
        target=self.f.fs.path(p.PUBLISHER+'/pipeline')
        fd=os.open(target,os.O_RDONLY|os.O_DIRECTORY)
        try:
            self.baseline();before=self.mounts.inspect()
            extra=os.open('FOREIGN',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600,dir_fd=fd)
            os.write(extra,b'foreign');os.close(extra)
            selected=p.parse(self.f.fs.read(p.PIPELINE_SELECTION))
            self.assertIs(p.private_underlying(p,self.f.fs,p.TrackedHost(p,self.f.fs),self.mounts,selected),False)
            self.assertEqual(self.mounts.inspect(),before)
        finally:os.close(fd)

    def test_missing_namespace_authority_is_not_verified(self):
        self.baseline();before=self.mounts.inspect();selected=p.parse(self.f.fs.read(p.PIPELINE_SELECTION))
        with patch.object(p.os,'unshare',side_effect=PermissionError(1,'fixture')):
            self.assertIsNone(p.private_underlying(p,self.f.fs,p.TrackedHost(p,self.f.fs),self.mounts,selected))
        self.assertEqual(self.mounts.inspect(),before)

    def test_real_mount_sigkill_at_each_live_transition(self):
        phases=['backed_up','prepared','switching','old_mount_detached','publisher','new_mount_attached',
            *['file_'+str(i) for i in range(14)],'selection_written','tuple_verified','committed']
        for phase in phases:
            with self.subTest(phase=phase):
                f=t.Fixture();f.temp._finalizer.detach();mounts=p.LinuxMounts(p,f.fs)
                mounts.underlying_identity();mounts.attach(mounts.prepare(f.oldgen,'native-baseline'))
                with patch.object(p,'pipeline_descriptor',side_effect=f.descriptor):
                    pid=os.fork()
                    if pid==0:
                        def kill(name):
                            if name==phase:os.kill(os.getpid(),signal.SIGKILL)
                        engine=f.engine(kill);engine.mounts=mounts
                        engine.promote(f.contents,f.manifest,'native');os._exit(9)
                    _,status=os.waitpid(pid,0)
                    self.assertEqual(os.WTERMSIG(status),signal.SIGKILL)
                    j=p.parse(f.fs.read(p.INTERLOCK,65536))
                    engine=f.engine();engine.mounts=mounts
                    self.assertEqual(engine.recover(j),'PIPELINE_V2_ROLLED_BACK')
                    f.assert_old(self);self.assertEqual(mounts.generation(),f.oldgen)

    def test_actual_enospc_retains_unsealed_generation_without_selection(self):
        import ctypes,errno
        target=self.f.fs.path(p.BASE+'/capsules')
        opts=ctypes.c_char_p(b'size=8192,mode=0700')
        self.assertEqual(self.mounts.libc.mount(b'tmpfs',os.fsencode(target),b'tmpfs',2|4,ctypes.cast(opts,ctypes.c_void_p)),0)
        raw,generation=t.capsule(b'x'*32768)
        before=self.f.fs.read(p.PIPELINE_SELECTION)
        with self.assertRaises(OSError) as error:
            p.PipelineStore(self.f.fs).install(raw,generation,'enospc-fixture',lambda *a:None)
        self.assertEqual(error.exception.errno,errno.ENOSPC)
        self.assertEqual(self.f.fs.read(p.PIPELINE_SELECTION),before)
        self.assertTrue(self.f.fs.path(p.BASE+'/state/pipeline-enospc-fixture.intent.json').exists())
        self.assertTrue(self.f.fs.path(p.BASE+'/capsules/'+generation).is_dir())
        with self.assertRaises(p.Blocked):p.PipelineStore(self.f.fs).verify(generation)
        with self.assertRaisesRegex(p.Blocked,'pipeline_generation_exists'):
            p.PipelineStore(self.f.fs).install(raw,generation,'attempted-reuse',lambda *a:None)

    def test_bounded_process_uses_only_current_root_manager_attestation(self):
        self.baseline();raw=self.f.fs.read(p.PIPELINE_SELECTION)
        record=p.attestation(p,self.f.fs,self.mounts,raw)
        self.f.fs.write(p.PIPELINE_MOUNT_RECORD,p.canonical(record),0o444)
        original=os.readlink
        def restricted(path,*args,**kwargs):
            if os.fspath(path)=='/proc/1/ns/mnt':raise PermissionError(13,'bounded fixture')
            return original(path,*args,**kwargs)
        with patch.object(p.os,'readlink',side_effect=restricted):
            self.assertEqual(p.LinuxMounts(p,self.f.fs).namespace,self.mounts.namespace)
            bad={**record,'mountNamespaceInode':record['mountNamespaceInode']+1}
            self.f.fs.write(p.PIPELINE_MOUNT_RECORD,p.canonical(bad),0o444,replace=True)
            with self.assertRaisesRegex(p.Blocked,'pipeline_manager_attestation'):p.LinuxMounts(p,self.f.fs)
            bad={**record,'bootId':'old-boot'};self.f.fs.write(p.PIPELINE_MOUNT_RECORD,p.canonical(bad),0o444,replace=True)
            with self.assertRaisesRegex(p.Blocked,'pipeline_manager_attestation'):p.LinuxMounts(p,self.f.fs)

    def test_busy_mount_is_preserved_without_force_or_retry(self):
        self.baseline();before=self.mounts.inspect();rd,wr=os.pipe();pid=os.fork()
        if pid==0:
            os.close(rd);os.chdir(self.f.fs.path(p.PUBLISHER+'/pipeline'));os.write(wr,b'R');os.close(wr)
            signal.pause();os._exit(0)
        os.close(wr)
        try:
            self.assertEqual(os.read(rd,1),b'R')
            with self.assertRaisesRegex(p.Blocked,'pipeline_unmount_unknown_or_busy'):
                self.mounts._unmount(p.PUBLISHER+'/pipeline')
            self.assertEqual(self.mounts.inspect(),before)
        finally:
            os.close(rd);os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)

if __name__ == '__main__':
    unittest.main()
