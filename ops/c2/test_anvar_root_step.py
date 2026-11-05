"""Contract 20.6 root step in an owned sandbox. Not root, systemd or production qualification."""
import datetime
import hashlib
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

R = Path(__file__).resolve().parents[2]
loader = importlib.machinery.SourceFileLoader('anvar_root_step', str(R / 'ops/c2/anvar-root-step.py'))
spec = importlib.util.spec_from_loader('anvar_root_step', loader)
m = importlib.util.module_from_spec(spec)
loader.exec_module(m)
NOW = datetime.datetime(2026, 11, 6, 12, 0, tzinfo=datetime.timezone.utc).timestamp() * 1000


class Killed(BaseException):
    pass


def iso(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


class Checks:
    def __init__(self):
        self.value = {'stable': {'selection': 'base'}}

    def validate_policy(self, value):
        pass

    def snapshot(self, policy):
        return json.loads(json.dumps(self.value))


class Fixture:
    OLD = {'pnpm': b'old_pnpm = 1\n', 'gate': b'old_gate = 1\n', 'executor': b'old_executor = 1\n', 'policy': b'{"p":"old"}\n'}
    NEW = {'pnpm': b'new_pnpm = 1\n', 'gate': b'new_gate = 1\n', 'executor': b'new_executor = 1\n', 'policy': b'{"p":"new"}\n'}

    def __init__(self, case):
        self.temp = tempfile.TemporaryDirectory(prefix='anvar-root-step-')
        case.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)
        targets = {k: (v[0], v[1], hashlib.sha256(self.OLD[k]).hexdigest(), hashlib.sha256(self.NEW[k]).hexdigest()) for k, v in m.TARGETS.items()}
        for ctx in [patch.object(m, 'TARGETS', targets), patch.object(m, 'candidate', lambda old, validate: self.NEW['policy']),
                    patch.object(m, 'NEW_EXECUTOR', targets['executor'][3]), patch.object(m, 'NEW_GATE', targets['gate'][3]),
                    patch.object(m, 'NEW_PNPM', targets['pnpm'][3]), patch.object(m, 'OLD_POLICY', targets['policy'][2]),
                    patch.object(m, 'NEW_POLICY', targets['policy'][3])]:
            ctx.start()
            case.addCleanup(ctx.stop)
        self.fs = m.Filesystem(self.root)
        self.checks = Checks()
        for path in [m.ROOT + '/bin', '/etc/aktau-sync-promotion', m.BASE + '/state', m.INPUT, '/var/backups', '/var/lib/aktau-c2-custodian']:
            self.fs.path(path).mkdir(parents=True, exist_ok=True, mode=0o700)
        for k, (path, mode, _, _) in targets.items():
            self.put(path, self.OLD[k], mode)
        for k, name in m.INPUTS.items():
            self.put(m.INPUT + '/' + name, self.NEW[k], 0o400)
        for path, mode in m.LOCKS:
            self.put(path, b'', mode)
        self.approve()

    def put(self, path, raw, mode):
        target = self.fs.path(path)
        target.unlink(missing_ok=True)
        target.write_bytes(raw)
        target.chmod(mode)

    def approve(self, **over):
        value = {'version': 1, 'purpose': 'anvar-root-step', 'id': m.ID, 'baseSourceSha': m.BASE_SOURCE, 'oldPolicySha256': m.OLD_POLICY,
                 'newPolicySha256': m.NEW_POLICY, 'newExecutorSha256': m.NEW_EXECUTOR, 'newGateSha256': m.NEW_GATE, 'newPnpmSha256': m.NEW_PNPM,
                 'approvalId': 'a' * 32, 'notBefore': iso(NOW - 60000), 'expiresAt': iso(NOW + 600000)}
        self.put(m.APPROVAL, m.canonical({**value, **over}), 0o400)

    def step(self, fault=None):
        return m.Step(self.fs, self.checks, clock=lambda: NOW, fault=fault)

    def contents(self):
        return {k: self.fs.path(v[0]).read_bytes() for k, v in m.TARGETS.items()}


class StepTests(unittest.TestCase):
    def setUp(self):
        self.f = Fixture(self)

    def test_verify_writes_nothing_and_apply_replaces_all_four(self):
        self.assertEqual(self.f.step().run('verify'), 'ANVAR_ROOT_STEP_READY')
        self.assertFalse(self.f.fs.path(m.JOURNAL).exists())
        self.assertEqual(self.f.contents(), self.f.OLD)
        self.assertEqual(self.f.step().run('apply'), 'ANVAR_ROOT_STEP_VERIFIED')
        self.assertEqual(self.f.contents(), self.f.NEW)
        record = json.loads(self.f.fs.path(m.SUCCESSION).read_bytes())
        self.assertEqual((record['enrolledPolicySha256'], record['policySha256']), (m.OLD_POLICY, m.NEW_POLICY))
        self.assertEqual(self.f.step().run('verify'), 'ANVAR_ROOT_STEP_VERIFIED')
        self.assertEqual(self.f.step().run('recover'), 'ANVAR_ROOT_STEP_VERIFIED')

    def test_staged_names_never_trip_the_pending_guard(self):
        step = self.f.step()
        step.j = {'approvalSha256': 'a' * 64}
        self.assertFalse(any(step.resource(k)[0].endswith('.pending') for k in step.keys()))

    def test_no_second_apply(self):
        self.f.step().run('apply')
        with self.assertRaisesRegex(m.Blocked, 'existing_step_no_retry'):
            self.f.step().run('apply')

    def test_kill_at_every_event_recovers_to_old_or_stays_verified(self):
        events = []
        self.f.step(events.append).run('apply')
        self.assertGreater(len(events), 15)
        for event in events:
            with self.subTest(event=event):
                f = Fixture(self)

                def fault(name):
                    if name == event:
                        raise Killed

                with self.assertRaises(Killed):
                    f.step(fault).run('apply')
                result = f.step().run('recover')
                if event == 'verified':
                    self.assertEqual(result, 'ANVAR_ROOT_STEP_VERIFIED')
                    self.assertEqual(f.contents(), f.NEW)
                else:
                    self.assertEqual(result, 'ANVAR_ROOT_STEP_ROLLED_BACK')
                    self.assertEqual(f.contents(), f.OLD)
                    self.assertEqual(f.step().run('recover'), 'ANVAR_ROOT_STEP_ROLLED_BACK')

    def test_kill_during_recovery_can_be_resumed(self):
        def apply_fault(name):
            if name == 'policy_replaced':
                raise Killed

        with self.assertRaises(Killed):
            self.f.step(apply_fault).run('apply')
        events = []
        probe = Fixture(self)
        with self.assertRaises(Killed):
            probe.step(apply_fault).run('apply')
        probe.step(events.append).run('recover')
        self.assertGreater(len(events), 6)
        for event in events:
            with self.subTest(event=event):
                f = Fixture(self)
                with self.assertRaises(Killed):
                    f.step(apply_fault).run('apply')

                def fault(name):
                    if name == event:
                        raise Killed

                with self.assertRaises(Killed):
                    f.step(fault).run('recover')
                self.assertEqual(f.step().run('recover'), 'ANVAR_ROOT_STEP_ROLLED_BACK')
                self.assertEqual(f.contents(), f.OLD)

    def test_recovery_refuses_a_torn_unregistered_file(self):
        def fault(name):
            if name == 'stage_gate_unregistered':
                raise Killed

        with self.assertRaises(Killed):
            self.f.step(fault).run('apply')
        self.f.put(m.ROOT + '/.promotion-runtime-gate.py.anvar-root-step.staged', b'torn', 0o755)
        with self.assertRaisesRegex(m.Blocked, 'unknown_unregistered_resource'):
            self.f.step().run('recover')

    def test_no_retry_after_rollback(self):
        self.f.step().run('apply')
        self.f.step().run('rollback')
        with self.assertRaisesRegex(m.Blocked, 'existing_step_no_retry'):
            self.f.step().run('apply')

    def test_rollback_restores_all_four_and_keeps_the_inert_record(self):
        self.f.step().run('apply')
        self.assertEqual(self.f.step().run('rollback'), 'ANVAR_ROOT_STEP_ROLLED_BACK')
        self.assertEqual(self.f.contents(), self.f.OLD)
        self.assertTrue(self.f.fs.path(m.SUCCESSION).exists())

    def test_rollback_is_refused_once_the_protected_state_moved(self):
        self.f.step().run('apply')
        self.f.checks.value = {'stable': {'selection': 'anvar'}}
        with self.assertRaisesRegex(m.Blocked, 'protected_window_changed'):
            self.f.step().run('rollback')
        self.assertEqual(self.f.contents(), self.f.NEW)

    def test_verified_step_still_reports_after_promotion_moved_the_state(self):
        self.f.step().run('apply')
        self.f.checks.value = {'stable': {'selection': 'anvar'}}
        self.assertEqual(self.f.step().run('verify'), 'ANVAR_ROOT_STEP_VERIFIED')

    def test_change_during_the_window_stops_before_any_replacement(self):
        def fault(name):
            if name == 'prepared':
                self.f.checks.value = {'stable': {'selection': 'moved'}}

        with self.assertRaisesRegex(m.Blocked, 'protected_window_changed'):
            self.f.step(fault).run('apply')
        self.assertEqual(self.f.contents(), self.f.OLD)

    def test_bad_approvals_write_nothing(self):
        for over in [{'expiresAt': iso(NOW - 1000)}, {'notBefore': iso(NOW + 1000)}, {'notBefore': iso(NOW - 1900000), 'expiresAt': iso(NOW + 1000)},
                     {'newPolicySha256': 'c' * 64}, {'approvalId': 'x'}, {'extra': 1}]:
            with self.subTest(over=over):
                self.f.approve(**over)
                for mode in ['verify', 'apply']:
                    with self.assertRaisesRegex(m.Blocked, 'root_step_approval'):
                        self.f.step().run(mode)
                self.assertFalse(self.f.fs.path(m.JOURNAL).exists())

    def test_missing_approval_writes_nothing(self):
        self.f.fs.path(m.APPROVAL).unlink()
        with self.assertRaises(FileNotFoundError):
            self.f.step().run('apply')
        self.assertFalse(self.f.fs.path(m.JOURNAL).exists())

    def test_wrong_input_or_drifted_target_writes_nothing(self):
        self.f.fs.path(m.INPUT + '/publisher-promotion.py').chmod(0o600)
        self.f.put(m.INPUT + '/publisher-promotion.py', b'tampered = 1\n', 0o400)
        with self.assertRaisesRegex(m.Blocked, 'reviewed_input_digest'):
            self.f.step().run('apply')
        self.f.put(m.INPUT + '/publisher-promotion.py', self.f.NEW['executor'], 0o400)
        self.f.put(m.GATE, b'drifted = 1\n', 0o755)
        with self.assertRaisesRegex(m.Blocked, 'old_target_digest'):
            self.f.step().run('apply')
        self.assertFalse(self.f.fs.path(m.JOURNAL).exists())

    def test_unknown_temp_or_orphan_record_blocks(self):
        self.f.put(m.ROOT + '/.publisher-promotion.py.anvar-root-step.staged', b'x', 0o755)
        with self.assertRaisesRegex(m.Blocked, 'unknown_target_temp'):
            self.f.step().run('verify')
        self.f.fs.path(m.ROOT + '/.publisher-promotion.py.anvar-root-step.staged').unlink()
        self.f.put(m.SUCCESSION, b'{}\n', 0o444)
        with self.assertRaisesRegex(m.Blocked, 'orphan_step_resource'):
            self.f.step().run('verify')

    def test_recovery_needs_a_journal(self):
        for mode in ['recover', 'rollback']:
            with self.assertRaisesRegex(m.Blocked, 'recovery_journal_missing'):
                self.f.step().run(mode)


class Pins(unittest.TestCase):
    """The tool's fixed hashes must describe exactly the files in this tree."""

    def test_new_hashes_match_the_tree(self):
        for name, value in [('ops/c2/publisher-promotion.py', m.NEW_EXECUTOR), ('ops/c2/promotion-runtime-gate.py', m.NEW_GATE),
                            ('ops/c2/pipeline-pnpm', m.NEW_PNPM), ('scripts/ops/build-sync-promotion.py', m.NEW_BUILDER)]:
            self.assertEqual(hashlib.sha256((R / name).read_bytes()).hexdigest(), value, name)

    def test_policy_candidate_changes_only_the_pins(self):
        old = (R / 'ops/c2/fixtures/anvar-root/policy-before.json').read_bytes()
        self.assertEqual(hashlib.sha256(old).hexdigest(), m.OLD_POLICY)
        new = m.candidate(old, lambda value: None)
        self.assertEqual(hashlib.sha256(new).hexdigest(), m.NEW_POLICY)
        a, b = json.loads(old), json.loads(new)
        self.assertEqual(a['pipelineContract'], b['pipelineContract'])
        changed = {k for k in a['runtimeFiles'] if a['runtimeFiles'][k] != b['runtimeFiles'][k]}
        self.assertEqual(changed, {m.EXECUTOR, m.GATE, m.PNPM})
        changed = {k for k in a['producerFiles'] if a['producerFiles'][k] != b['producerFiles'][k]}
        self.assertEqual(changed, {m.EXECUTOR_SOURCE, m.BUILDER_SOURCE})

    def test_succession_record_is_the_shape_the_executor_reads(self):
        loader = importlib.machinery.SourceFileLoader('anvar_step_protocol', str(R / 'ops/c2/publisher-promotion.py'))
        spec = importlib.util.spec_from_loader('anvar_step_protocol', loader)
        p = importlib.util.module_from_spec(spec)
        loader.exec_module(p)
        self.assertEqual(m.SUCCESSION, p.POLICY_SUCCESSION)
        self.assertEqual((m.BASE_SOURCE, m.BASE_TREE, m.BASE_INVENTORY), (p.PIPELINE_BASE_SOURCE, p.PIPELINE_NEW_TREE, p.PIPELINE_BASE_INVENTORY))
        self.assertEqual(m.SELECTION, p.PIPELINE_SELECTION)

        class Fs:
            def read(self, path, cap=None):
                return m.succession('a' * 64)

        p.policy_succession(p, Fs(), m.OLD_POLICY, m.NEW_POLICY)


if __name__ == '__main__':
    unittest.main()
