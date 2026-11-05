"""Next pipeline transition: committed ea3cf04 selection -> Anvar tree.

Each test states the behaviour the transition needs. They fail on ea3cf04 by design.
Model objects only: not Linux mount, systemd or production qualification.
"""
import datetime
import hashlib
import importlib.machinery
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

R = Path(__file__).resolve().parents[2]


def load(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


p = load('anvar_transition_protocol', R / 'ops/c2/publisher-promotion.py')
shim = load('anvar_transition_shim', R / 'ops/c2/pipeline-pnpm')
BASE_SOURCE = 'ea3cf04e7653bf6310f631fa8a6533122f128567'
USED_AT = int(datetime.datetime(2026, 11, 4, 17, 10, tzinfo=datetime.timezone.utc).timestamp() * 1000)
BASE_INVENTORY = '0671b096d799ac17d54ae7c1579f1d9d1af6b54888c5fc1b2812bb610703b6cc'


class FakeFs:
    def __init__(self, files):
        self.files = files

    def read(self, path, cap=None):
        if path not in self.files:
            raise FileNotFoundError(path)
        return self.files[path]


def committed_selection():
    return p.canonical({'version': 1, 'contract': 'pr86-pipeline-v2', 'sourceSha': BASE_SOURCE,
                        'pipelineTreeSha1': p.PIPELINE_NEW_TREE, 'inventorySha256': BASE_INVENTORY,
                        'descriptorSha256': 'a' * 64, 'releaseIdentity': 'build-41870535884-1',
                        'provenanceKind': 'github-artifact'})


class NextBaseline(unittest.TestCase):
    def test_committed_selection_is_a_valid_promotion_base(self):
        raw = committed_selection()
        fs = FakeFs({p.POLICY: b'{"version":2}\n', p.PIPELINE_SELECTION: raw, p.PIPELINE_MOUNT_RECORD: b'{"m":1}\n',
                     p.FILES['custodian.py']: b'custodian'})
        host = object.__new__(p.TrackedHost)
        host.p, host.fs = p, fs
        host.engine = SimpleNamespace(mounts=SimpleNamespace(generation=lambda: BASE_INVENTORY))
        host.publisher = lambda: {'sha': BASE_SOURCE, 'branch': 'HEAD'}
        with patch.object(p, 'validate_policy'), patch.object(p, 'require_enrollment', return_value={'generation': 'b' * 64}, create=True), \
                patch.object(p.Host, 'verify_old_closure'), patch.object(p, 'PIPELINE_CUSTODIAN', p.digest(b'custodian')), \
                patch.object(p, 'attestation', return_value={'m': 1}, create=True),                 patch.object(p, 'tuple_record', return_value=(raw, {}, {})) as receipt:
            host.verify_baseline()
            receipt.assert_called_once()

    def test_any_other_selection_is_refused(self):
        for key, value in [('sourceSha', 'c' * 40), ('inventorySha256', 'c' * 64), ('provenanceKind', 'legacy-installed-attested'),
                           ('pipelineTreeSha1', p.PIPELINE_NEXT_TREE), ('pipelineTreeSha1', p.PIPELINE_OLD_TREE)]:
            selected = p.parse(committed_selection())
            selected[key] = value
            fs = FakeFs({p.POLICY: b'{"version":2}\n', p.PIPELINE_SELECTION: p.canonical(selected)})
            host = object.__new__(p.TrackedHost)
            host.p, host.fs = p, fs
            host.engine = None
            host.publisher = lambda: {'sha': BASE_SOURCE, 'branch': 'HEAD'}
            with patch.object(p, 'validate_policy'), patch.object(p, 'require_enrollment', return_value={'generation': 'b' * 64}, create=True):
                with self.assertRaisesRegex(p.Blocked, 'pipeline_exact_old_baseline'):
                    host.verify_baseline()

    def test_target_tree_is_accepted_and_unknown_tree_is_not(self):
        selected = p.parse(committed_selection())
        selected['pipelineTreeSha1'] = p.PIPELINE_NEXT_TREE
        self.assertEqual(p.selection(p, p.canonical(selected))['pipelineTreeSha1'], p.PIPELINE_NEXT_TREE)
        selected['pipelineTreeSha1'] = 'c' * 40
        with self.assertRaisesRegex(p.Blocked, 'pipeline_selection'):
            p.selection(p, p.canonical(selected))


class RollbackFloor(unittest.TestCase):
    def test_base_release_is_never_rolled_below(self):
        with self.assertRaisesRegex(p.Blocked, 'rollback_below_base'):
            p.rollback_last_guard({'newPublisher': {'sha': BASE_SOURCE, 'branch': 'HEAD'}})
        p.rollback_last_guard({'newPublisher': {'sha': 'c' * 40, 'branch': 'HEAD'}})


class SourceAdmission(unittest.TestCase):
    """Positive path of source_admission_v2 on a real disposable repository."""

    def git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo), *args], check=True, capture_output=True, text=True).stdout.strip()

    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='anvar-admission-')
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Local fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.files = {path: b'public fixture\n' for path in [*p.source_paths().values(), 'backend/prisma/schema.prisma',
                                                             'contracts/openapi.yaml', 'pipeline/pnpm-lock.yaml']}
        self.files['pipeline/package.json'] = b'{}\n'
        self.write(self.files)
        self.base = self.commit('base')
        self.base_tree = self.git('rev-parse', 'HEAD:pipeline')

    def write(self, files):
        for path, raw in files.items():
            target = self.repo / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)

    def commit(self, text):
        self.git('add', '-A')
        self.git('commit', '-q', '-m', text)
        return self.git('rev-parse', 'HEAD')

    def blob(self, ref, path):
        return self.git('rev-parse', ref + ':' + path)

    def next_commit(self, extra=None):
        changed = {'pipeline/src/anvar.ts': b'export {}\n', 'backend/prisma/schema.prisma': b'changed\n', 'contracts/openapi.yaml': b'changed\n',
                   'backend/prisma/migrations/x/migration.sql': b'select 1;\n', **(extra or {})}
        self.write(changed)
        return self.commit('next')

    def admit(self, sha):
        pins = {path: ((self.blob(self.base, path) if path != 'backend/prisma/migrations/x/migration.sql' else None), self.blob(sha, path))
                for path in ['backend/prisma/schema.prisma', 'contracts/openapi.yaml', 'backend/prisma/migrations/x/migration.sql']}
        tree = self.git('rev-parse', sha + ':pipeline')
        names = self.git('ls-tree', '-r', '--name-only', sha, '--', 'pipeline').splitlines()
        rows, blobs = [], []
        for name in names:
            raw = (self.repo / name).read_bytes()
            rows.append({'path': name[9:], 'type': 'file', 'mode': 0o444, 'size': len(raw), 'sha256': p.digest(raw)})
            blobs.append(raw)
        for directory in sorted({str(Path(r['path']).parent.as_posix()) for r in rows} - {'.'}):
            rows.append({'path': directory, 'type': 'dir', 'mode': 0o555})
        rows.sort(key=lambda r: r['path'])
        inventory = p.canonical({'version': 1, 'entries': rows})
        out = io.BytesIO()
        by_path = dict(zip([n[9:] for n in names], blobs))
        with tarfile.open(fileobj=out, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            members = [('inventory.json', inventory)]
            members += [('blob/' + str(i), by_path[row['path']]) for i, row in enumerate(rows) if row['type'] == 'file']
            for name, raw in members:
                item = tarfile.TarInfo(name)
                item.mode = 0o444
                item.size = len(raw)
                tar.addfile(item, io.BytesIO(raw))
        bundle = self.root / 'source.bundle'
        self.git('bundle', 'create', '-q', str(bundle), 'HEAD')
        files = {name: p.digest(self.files[path]) for name, path in p.source_paths().items()}
        contents = {'source.bundle': bundle.read_bytes(), 'custodian.py': self.files[p.source_paths()['custodian.py']], 'pipeline-runtime.tar': out.getvalue()}
        manifest = {'version': 2, 'sourceSha': sha, 'sourceTree': self.git('rev-parse', sha + '^{tree}'), 'files': files}
        real_command = p.command

        def command(argv, **kw):
            return real_command(['git' if argv[0] == '/usr/bin/git' else argv[0], *argv[1:]], **kw)

        with patch.object(p, 'PIPELINE_BASE_SOURCE', self.base), patch.object(p, 'PIPELINE_NEW_TREE', self.base_tree), \
                patch.object(p, 'PIPELINE_NEXT_TREE', tree), patch.object(p, 'PIPELINE_NEXT_PROTECTED', pins), \
                patch.object(p, 'PIPELINE_NEW_PACKAGE', self.blob(self.base, 'pipeline/package.json')), \
                patch.object(p, 'PIPELINE_NEW_LOCK', self.blob(self.base, 'pipeline/pnpm-lock.yaml')), \
                patch.object(p, 'PIPELINE_CUSTODIAN', p.digest(contents['custodian.py'])), patch.object(p, 'command', command), \
                patch.object(p, 'pipeline_capsule', return_value=(p.parse(inventory), {i: raw for i, raw in enumerate(blobs)})), \
                patch.object(p, 'pipeline_blob', side_effect=lambda path, rows, data: by_path[path]):
            return p.source_admission_v2(contents, manifest)

    def test_exact_next_commit_is_admitted(self):
        result = self.admit(self.next_commit())
        self.assertEqual(result['status'], 'ARTIFACT_V2_SOURCE_VALIDATED_NOT_AUTHORIZATION')
        self.assertEqual(len(result['protectedPaths']), 3)

    def test_extra_protected_change_is_refused(self):
        with self.assertRaisesRegex(p.Blocked, 'protected_delta'):
            self.admit(self.next_commit({'deploy/compose.production.yml': b'x\n'}))


class ProtectedDelta(unittest.TestCase):
    SHA = 'c' * 40

    def blobs(self):
        out = {}
        for path, (old, new) in p.PIPELINE_NEXT_PROTECTED.items():
            out[(BASE_SOURCE, path)] = old
            out[(self.SHA, path)] = new
        return out

    def run_delta(self, paths, blobs):
        return p.pipeline_protected_delta(paths, self.SHA, lambda ref, path: blobs.get((ref, path)))

    def test_exact_anvar_delta_passes(self):
        self.assertTrue(self.run_delta(list(p.PIPELINE_NEXT_PROTECTED), self.blobs()))

    def test_no_delta_is_refused_as_the_release_must_carry_its_schema(self):
        with self.assertRaisesRegex(p.Blocked, 'protected_delta'):
            self.run_delta([], self.blobs())

    def test_extra_or_missing_path_is_refused(self):
        paths = list(p.PIPELINE_NEXT_PROTECTED)
        for changed in [paths + ['deploy/compose.production.yml'], paths[1:]]:
            with self.assertRaisesRegex(p.Blocked, 'protected_delta'):
                self.run_delta(changed, self.blobs())

    def test_changed_blob_is_refused(self):
        blobs = self.blobs()
        blobs[(self.SHA, 'contracts/openapi.yaml')] = 'd' * 40
        with self.assertRaisesRegex(p.Blocked, 'protected_delta'):
            self.run_delta(list(p.PIPELINE_NEXT_PROTECTED), blobs)

    def test_pins_match_the_tree(self):
        for path, (_, new) in p.PIPELINE_NEXT_PROTECTED.items():
            raw = (R / path).read_bytes()
            self.assertEqual(hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(), new, path)


class AnvarScript(unittest.TestCase):
    def test_shim_allows_exactly_one_new_script(self):
        self.assertEqual(shim.ALLOWED.get('scrape:anvar'), [])
        self.assertEqual(set(shim.ALLOWED), {'scrape:dina', 'scrape:dana', 'scrape:fixprice', 'scrape:anvar', 'sync',
                                             'scope:dina', 'scope:dana'})


class RuntimeGateTrees(unittest.TestCase):
    def test_gate_accepts_every_tree_the_executor_accepts(self):
        gate = (R / 'ops/c2/promotion-runtime-gate.py').read_text(encoding='utf8')
        for tree in [p.PIPELINE_OLD_TREE, p.PIPELINE_NEW_TREE, p.PIPELINE_NEXT_TREE]:
            self.assertIn(tree, gate)


class EnrollmentSuccession(unittest.TestCase):
    """policy.json pins executor/gate/pnpm, so the root step must change it without voiding enrollment."""

    def setUp(self):
        self.policy = {'version': 2, 'runtimeFiles': {'/x': 'a' * 64, p.ROOT + '/publisher-promotion.py': 'e' * 64},
                       'producerFiles': {'ops/c2/publisher-promotion.py': 'e' * 64}, 'pipelineContract': {
            'baselineInputInventorySha256': 'c' * 64, 'baselineRuntimeInventorySha256': 'd' * 64}}
        policy_hash = p.digest(p.canonical(self.policy))
        approval = p.canonical({
            'version': 1, 'purpose': 'pr86-baseline-enrollment', 'sourceSha': p.PIPELINE_OLD_SOURCE,
            'pipelineTreeSha1': p.PIPELINE_OLD_TREE, 'packageBlobSha1': p.PIPELINE_OLD_PACKAGE,
            'lockBlobSha1': p.PIPELINE_OLD_LOCK, 'legacyInputInventorySha256': 'c' * 64,
            'oldRuntimeInventorySha256': 'd' * 64, 'nodeSha256': p.PIPELINE_NODE, 'pnpmTarSha256': p.PIPELINE_PNPM,
            'oldExecutorSha256': 'd69c667212b2a6c8a25081ccdc90f798024e850784262976e06e45ce13f45118',
            'oldPolicySha256': '2bf672f1626252f107447552493ad982999d3d7f444f000394a7006d952ddb8b',
            'newPolicySha256': policy_hash, 'approvalId': 'e' * 32, 'reviewedRootBundleSha256': 'f' * 64,
            'notBefore': '2026-11-04T17:00:00.000Z', 'expiresAt': '2026-11-04T17:30:00.000Z'})
        prefix = p.BASE + '/state/pr86-baseline-'
        legacy_dir = p.BASE + '/releases/legacy'
        legacy = p.canonical({'version': 1, 'identity': 'legacy', 'directory': legacy_dir, 'phase': 'committed',
                              'newPublisher': {'sha': p.PIPELINE_OLD_SOURCE, 'branch': 'HEAD'},
                              'targets': {t: {} for t in [*p.FILES.values(), *p.RECORDS]}})
        self.fs = FakeFs({
            '/etc/aktau-sync-promotion/pr86-baseline-approval.json': approval,
            prefix + 'consumed-' + 'e' * 32 + '.json': p.canonical({'version': 1, 'approvalSha256': p.digest(approval), 'usedAt': USED_AT}),
            prefix + 'enrolled-' + 'e' * 32 + '.json': p.canonical({
                'version': 1, 'approvalSha256': p.digest(approval), 'policySha256': policy_hash,
                'outcome': 'BASELINE_ENROLLED', 'generation': 'd' * 64, 'targetParentIdentity': [1] * 6,
                'underlyingTargetIdentity': [2] * 6, 'legacyReleaseIdentity': 'legacy',
                'legacyReceiptName': 'receipt.json', 'legacyReceiptSha256': p.digest(legacy)}),
            legacy_dir + '/receipt.json': legacy})
        for ctx in [patch.object(p, 'PipelineStore', return_value=SimpleNamespace(verify=lambda generation: {})),
                    patch.object(p, 'PIPELINE_NEXT_POLICY_SHAPE', p.policy_shape(p, self.changed()))]:
            ctx.start()
            self.addCleanup(ctx.stop)

    def test_enrollment_holds_for_the_policy_it_was_issued_for(self):
        self.assertEqual(p.require_enrollment(p, self.fs, self.policy)['generation'], 'd' * 64)

    def changed(self):
        value = json.loads(json.dumps(self.policy))
        value['runtimeFiles']['/x'] = 'b' * 64
        return value

    def approval(self, **over):
        value = {'purpose': 'anvar-root-step', 'oldPolicySha256': p.digest(p.canonical(self.policy)),
                 'newPolicySha256': p.digest(p.canonical(self.changed()))}
        return p.canonical({**value, **over})

    def record(self, **over):
        self.fs.files[p.POLICY_APPROVAL] = self.approval()
        value = {'version': 1, 'purpose': 'anvar-next-transition', 'enrolledPolicySha256': p.digest(p.canonical(self.policy)),
                 'policySha256': p.digest(p.canonical(self.changed())), 'approvalSha256': p.digest(self.approval())}
        return p.canonical({**value, **over})

    def test_changed_policy_without_a_record_is_refused(self):
        with self.assertRaisesRegex(p.Blocked, 'pipeline_policy_succession'):
            p.require_enrollment(p, self.fs, self.changed())

    def test_exact_record_keeps_enrollment(self):
        self.fs.files[p.POLICY_SUCCESSION] = self.record()
        self.assertEqual(p.require_enrollment(p, self.fs, self.changed())['generation'], 'd' * 64)

    def test_enrolled_policy_still_works_with_a_retained_record(self):
        self.fs.files[p.POLICY_SUCCESSION] = self.record()
        self.assertEqual(p.require_enrollment(p, self.fs, self.policy)['generation'], 'd' * 64)

    def test_record_for_another_policy_is_refused(self):
        for over in [{'policySha256': 'c' * 64}, {'enrolledPolicySha256': 'c' * 64}, {'purpose': 'other'}, {'version': 2}, {'approvalSha256': 'a' * 64}]:
            self.fs.files[p.POLICY_SUCCESSION] = self.record(**over)
            with self.assertRaisesRegex(p.Blocked, 'pipeline_policy_succession'):
                p.require_enrollment(p, self.fs, self.changed())

    def test_a_third_policy_with_a_self_written_record_is_refused(self):
        third = self.changed()
        third['runtimeFiles']['/x'] = 'c' * 64
        third_hash = p.digest(p.canonical(third))
        self.fs.files[p.POLICY_SUCCESSION] = self.record(policySha256=third_hash)
        self.fs.files[p.POLICY_APPROVAL] = self.approval(newPolicySha256=third_hash)
        self.fs.files[p.POLICY_SUCCESSION] = self.record(policySha256=third_hash)
        with self.assertRaisesRegex(p.Blocked, 'pipeline_policy_succession'):
            p.require_enrollment(p, self.fs, third)

    def test_missing_retained_approval_is_refused(self):
        self.fs.files[p.POLICY_SUCCESSION] = self.record()
        del self.fs.files[p.POLICY_APPROVAL]
        with self.assertRaisesRegex(p.Blocked, 'pipeline_policy_succession'):
            p.require_enrollment(p, self.fs, self.changed())

    def test_record_with_an_extra_field_is_refused(self):
        self.fs.files[p.POLICY_SUCCESSION] = self.record(extra=1)
        with self.assertRaisesRegex(p.Blocked, 'pipeline_policy_succession'):
            p.require_enrollment(p, self.fs, self.changed())


if __name__ == '__main__':
    unittest.main()
