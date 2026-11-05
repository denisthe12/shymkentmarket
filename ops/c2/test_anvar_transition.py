"""Next pipeline transition: committed ea3cf04 selection -> Anvar tree.

Each test states the behaviour the transition needs. They fail on ea3cf04 by design.
Model objects only: not Linux mount, systemd or production qualification.
"""
import datetime
import hashlib
import importlib.machinery
import importlib.util
import json
from pathlib import Path
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
        for key, value in [('sourceSha', 'c' * 40), ('inventorySha256', 'c' * 64), ('provenanceKind', 'legacy-installed-attested')]:
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
        self.policy = {'version': 2, 'runtimeFiles': {'/x': 'a' * 64}, 'pipelineContract': {
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
        store = patch.object(p, 'PipelineStore', return_value=SimpleNamespace(verify=lambda generation: {}))
        store.start()
        self.addCleanup(store.stop)

    def test_enrollment_holds_for_the_policy_it_was_issued_for(self):
        self.assertEqual(p.require_enrollment(p, self.fs, self.policy)['generation'], 'd' * 64)

    def changed(self):
        value = json.loads(json.dumps(self.policy))
        value['runtimeFiles']['/x'] = 'b' * 64
        return value

    def record(self, **over):
        value = {'version': 1, 'purpose': 'anvar-next-transition', 'enrolledPolicySha256': p.digest(p.canonical(self.policy)),
                 'policySha256': p.digest(p.canonical(self.changed())), 'approvalSha256': 'a' * 64}
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
        for over in [{'policySha256': 'c' * 64}, {'enrolledPolicySha256': 'c' * 64}, {'purpose': 'other'}, {'version': 2}]:
            self.fs.files[p.POLICY_SUCCESSION] = self.record(**over)
            with self.assertRaisesRegex(p.Blocked, 'pipeline_policy_succession'):
                p.require_enrollment(p, self.fs, self.changed())

    def test_record_with_an_extra_field_is_refused(self):
        self.fs.files[p.POLICY_SUCCESSION] = self.record(extra=1)
        with self.assertRaisesRegex(p.Blocked, 'pipeline_policy_succession'):
            p.require_enrollment(p, self.fs, self.changed())


if __name__ == '__main__':
    unittest.main()
