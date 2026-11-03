"""Builder boundaries; public fixtures and unprivileged local filesystem only."""
import importlib.util
import io
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
R=Path(__file__).resolve().parents[2]
s=importlib.util.spec_from_file_location('pipeline_builder',R/'scripts/ops/build-sync-promotion.py')
b=importlib.util.module_from_spec(s);s.loader.exec_module(b)

class PipelineBuilderTests(unittest.TestCase):
    def archive(self, rows):
        out=io.BytesIO()
        with tarfile.open(fileobj=out,mode='w',format=tarfile.PAX_FORMAT) as t:
            for name,kind,mode in rows:
                m=tarfile.TarInfo(name);m.mode=mode;m.size=0
                if kind=='dir':m.type=tarfile.DIRTYPE
                elif kind=='link':m.type=tarfile.SYMTYPE;m.linkname='/outside'
                elif kind=='pax':m.pax_headers={'comment':'not approved'}
                t.addfile(m,io.BytesIO(b'') if m.isfile() else None)
        return out.getvalue()
    def test_real_git_archive_root_directory_is_accepted(self):
        raw=subprocess.check_output(['git','-c','tar.umask=0022','archive','--format=tar',
                                     '49f6823768817b0390f215de42439cce523bf5d3^{tree}','pipeline'],cwd=R)
        with b.source_archive(raw) as tar:
            self.assertEqual(tar.getmembers()[0].name,'pipeline');self.assertTrue(tar.getmembers()[0].isdir())
    def test_root_type_mode_duplicate_traversal_and_pax_fail_closed(self):
        valid=('pipeline','dir',0o755)
        cases=[[('pipeline','file',0o644)],[('pipeline','link',0o755)],[('pipeline2','dir',0o755)],
               [('pipeline','dir',0o777)],[valid,valid],[valid,('pipeline/../escape','file',0o644)],
               [valid,('/outside','file',0o644)],[valid,('pipeline/link','link',0o755)],
               [valid,('pipeline/file','pax',0o644)],[valid,('other','dir',0o755)]]
        for rows in cases:
            with self.subTest(rows=rows),self.assertRaises(b.p.Blocked):b.source_archive(self.archive(rows))
    def test_root_installer_is_rejected_before_any_command(self):
        with patch.object(b.os,'getuid',return_value=0),patch.object(b.os,'geteuid',return_value=0),patch.object(b,'call') as command:
            with self.assertRaisesRegex(b.p.Blocked,'build_root_forbidden'):b.build('a'*40,'/unused',{},'build-only')
            command.assert_not_called()
    def test_active_wrong_platform_node_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix='builder-native-') as temp:
            root=Path(temp);(root/'bad.node').write_bytes(b'MZ'+b'x'*60)
            with self.assertRaisesRegex(b.p.Blocked,'build_native_platform'):b.pack_pipeline(root)

    def test_command_capacity_is_streamed_and_group_is_reaped(self):
        with self.assertRaisesRegex(b.p.Blocked,'command_capacity'):
            b.call(['/usr/bin/python3','-c','import sys,time;sys.stdout.write("x"*8192);sys.stdout.flush();time.sleep(30)'],cap=32)
