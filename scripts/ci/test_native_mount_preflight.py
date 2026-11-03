"""Pure metadata regressions; these never mount/unshare on the host."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import contextlib

spec = importlib.util.spec_from_file_location('preflight_tests', Path(__file__).with_name('native-mount-preflight.py'))
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class PrerequisiteTests(unittest.TestCase):
    def metadata(self):
        return {'uid': 0, 'euid': 0, 'container': True, 'capEff': hex(p.CAPS)[2:],
                'capPrm': hex(p.CAPS)[2:], 'capBnd': hex(p.CAPS)[2:], 'seccomp': '2',
                'sourceReadOnly': True, 'sameManagerNamespace': True, 'rootPrivate': True, 'tmpPrivate': True, 'userNamespaceMatchesPID1': True,
                'lsm': 'DOCKER_DEFAULT_ENFORCE', 'apparmor': 'Y'}

    def test_known_enforcing_profile_still_requires_real_smoke(self):
        self.assertIsNone(p.reject_reason(self.metadata()))

    def test_explicitly_disabled_apparmor_is_not_hosted_lsm_proof(self):
        meta = {**self.metadata(), 'lsm': 'KERNEL', 'apparmor': 'N'}
        self.assertIsNone(p.reject_reason(meta))

    def test_missing_sysadmin_in_any_cap_set(self):
        for key in ['capEff', 'capPrm', 'capBnd']:
            with self.subTest(key=key):
                meta = {**self.metadata(), key: hex(p.CAPS & ~(1 << 21))[2:]}
                self.assertEqual(p.reject_reason(meta), 'missing_sys_admin')

    def test_extra_capabilities_reject(self):
        self.assertEqual(p.reject_reason({**self.metadata(), 'capEff': hex(p.CAPS | 1 << 19)[2:]}), 'unexpected_capabilities')

    def test_missing_malformed_capability_metadata_reject(self):
        for value in [None, '', 'nothex']:
            self.assertEqual(p.reject_reason({**self.metadata(), 'capEff': value}), 'capabilities_unknown')

    def test_unknown_or_unconfined_lsm_reject(self):
        for label in ['UNKNOWN', None, 'NO_PROFILE', 'OTHER_CONFINED']:
            self.assertEqual(p.reject_reason({**self.metadata(), 'lsm': label}), 'lsm_unknown_or_unapproved')
        self.assertEqual(p.reject_reason({**self.metadata(), 'apparmor': 'UNKNOWN'}), 'lsm_unknown_or_unapproved')

    def test_unknown_or_disabled_seccomp_reject(self):
        for value in [None, '0', '1', 'other']:
            self.assertEqual(p.reject_reason({**self.metadata(), 'seccomp': value}), 'seccomp_unknown_or_unconfined')

    def test_host_root_and_unprivileged_caller_reject(self):
        for values in [{'container': False}, {'uid': 1000}, {'euid': 1000}, {'uid': False}]:
            self.assertEqual(p.reject_reason({**self.metadata(), **values}), 'owned_root_container_required')

    def test_writable_source_or_wrong_namespace_reject(self):
        for key in ['sourceReadOnly', 'sameManagerNamespace', 'rootPrivate', 'tmpPrivate', 'userNamespaceMatchesPID1']:
            self.assertEqual(p.reject_reason({**self.metadata(), key: False}), 'readonly_or_namespace_prerequisite')

    def simulated_parent(self, select_effect=None, wait_result=(1700000000, 0), clock=None):
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        for name, value in [('getuid', 0), ('geteuid', 0), ('fork', 1700000000)]:
            stack.enter_context(patch.object(p.os, name, return_value=value))
        stack.enter_context(patch.object(p.Path, 'is_file', return_value=True))
        stack.enter_context(patch.object(p, 'snapshot', return_value=self.metadata()))
        stack.enter_context(patch.object(p.os, 'stat', return_value=type('S', (), {'st_ino': 1})()))
        kill = stack.enter_context(patch.object(p.os, 'kill'))
        stack.enter_context(patch.object(p.os, 'waitpid', return_value=wait_result))
        stack.enter_context(patch.object(p.select, 'select', side_effect=select_effect, return_value=([], [], [])))
        stack.enter_context(patch.object(p.time, 'monotonic', side_effect=clock or [0, 1, 2, 16, 17, 17.1]))
        return kill

    def test_timeout_kills_and_reaps_only_own_child(self):
        kill = self.simulated_parent()
        result = p.qualify()
        self.assertEqual(result['reason'], 'probe_timeout_or_child_failure')
        kill.assert_called_once_with(1700000000, p.signal.SIGKILL)

    def test_cancellation_also_kills_and_reaps_own_child(self):
        kill = self.simulated_parent(select_effect=KeyboardInterrupt(), clock=[0, 1, 2, 3, 3.1])
        with self.assertRaises(KeyboardInterrupt):
            p.qualify()
        kill.assert_called_once_with(1700000000, p.signal.SIGKILL)

    def test_unreapable_child_is_explicit_cleanup_failure(self):
        kill = self.simulated_parent(wait_result=(0, 0), clock=[0, 1, 2, 16, 17, 17.1, 21])
        with self.assertRaisesRegex(RuntimeError, 'native_probe_cleanup_unverified'):
            p.qualify()
        kill.assert_called_once_with(1700000000, p.signal.SIGKILL)

    def test_missing_kernel_metadata_fails_closed(self):
        with patch.object(p.Path, 'is_file', return_value=True), patch.object(p.os, 'getuid', return_value=0), patch.object(p.os, 'geteuid', return_value=0), patch.object(p, 'snapshot', side_effect=PermissionError()):
            self.assertEqual(p.qualify()['reason'], 'metadata_unavailable')


if __name__ == '__main__':
    unittest.main()
