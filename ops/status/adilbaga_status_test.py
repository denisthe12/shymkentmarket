import io
import json
import os
from pathlib import Path
import pwd
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from contextlib import redirect_stdout
from unittest.mock import patch

import adilbaga_status as s

NOW = s.parse_time('2026-11-15T14:00:00Z')
SHA = '0a7bf2ae24f8d580429ea3fecce5b946bbac00e8'
OLD = 'c7ba31f0000000000000000000000000000000aa'


def run_file(start, exit_code=0, status='finished', kind='daily'):
    return json.dumps({
        'version': 1, 'kind': kind, 'startedAt': start,
        'finishedAt': None if status == 'running' else start[:14] + '03:05Z',
        'status': status, 'exitCode': None if status == 'running' else exit_code, 'published': exit_code != 1,
        'stores': {'dina': 0, 'dana': 0, 'fixprice': 0, 'anvar': 0}, 'stale': [], 'retention': 'ok'})


class FakeHost:
    """A healthy VPS; tests change single fields to break one thing."""

    def __init__(self):
        self.files = {
            s.RELEASE_ENV: 'API_IMAGE=adilbaga-api:%s\n' % SHA,
            s.RUNS_DIR + '/daily-20261115T130004Z.json': run_file('2026-11-15T13:00:04Z'),
            s.RUNS_DIR + '/daily-20261115T010003Z.json': run_file('2026-11-15T01:00:03Z'),
            s.RUNS_DIR + '/weekly-20261109T220001Z.json': run_file('2026-11-09T22:00:01Z', kind='weekly'),
            s.RUNS_DIR + '/notes.txt': 'ignored',
            s.MONITOR_STATE: json.dumps({'version': 2, 'phase': 'OK', 'failures': 0,
                                         'lastUTC': int((NOW - 120) * 1000), 'queue': []}),
            '/proc/uptime': '864000.5 100.0\n',
            '/proc/loadavg': '0.12 0.20 0.18 1/200 999\n',
            '/proc/meminfo': 'MemTotal:        4028000 kB\nMemAvailable:    2014000 kB\n',
        }
        self.inspect = 'adilbaga-api:%s|running|healthy|0|2026-11-15T13:41:02.123456789Z\n' % SHA
        self.http_status = {'/health/live': 200, '/health/ready': 200, '/api/dashboard': 200}
        self.snapshot = '2026-11-15T13:03:12.000Z'
        self.df = ('Filesystem Size Used Avail Use% Mounted on\n'
                   '/dev/vda1 40G 18G 22G 45% /\n/dev/vda1 40G 18G 22G 45% /\n')
        self.journal_sync = ('[sync] stores ok\n'
                             'time=2026-11-15T01:03Z level=INFO msg=retention_complete kept_count=13 deleted_count=0\n'
                             '{"level":"INFO","msg":"retention_complete","outcome_class":"success",'
                             '"kept_count":14,"deleted_count":1}\n')
        self.timer_state = 'active'
        self.service_result = 'success'
        self.cloudflared = 'active'
        self.git_dirty = ''
        self.checkout_error = None
        self.root = True
        self.reboot = False
        self.commands = []

    def run(self, cmd, timeout=15):
        self.commands.append(cmd)
        key = ' '.join(cmd)
        if cmd[:2] == ['docker', 'inspect']:
            return (0, self.inspect) if self.inspect else (1, '')
        if cmd[:2] == ['docker', 'images']:
            return 0, '%s\n%s\n' % (SHA, OLD)
        if cmd[:2] == ['systemctl', 'is-active']:
            state = self.cloudflared if cmd[2] == 'cloudflared' else 'active'
            return (0 if state == 'active' else 3), state + '\n'
        if cmd[:2] == ['systemctl', 'show']:
            if cmd[2].endswith('.timer'):
                return 0, ('ActiveState=%s\nLastTriggerUSec=Sun 2026-11-15 13:00:00 UTC\n'
                           'NextElapseUSecRealtime=Mon 2026-11-16 01:00:00 UTC\n' % self.timer_state)
            return 0, 'ActiveState=inactive\nResult=%s\nExecMainStatus=0\n' % self.service_result
        if 'aktau-sync.service' in key and cmd[0] == 'journalctl':
            return 0, self.journal_sync
        if 'aktau-go-monitor.service' in key:
            return 0, ('Starting aktau-go-monitor.service - Aktau Market private one-shot Go API monitor...\n'
                       '{"outcome":"OK","reason":"probe_complete","queued":0}\n'
                       'aktau-go-monitor.service: Deactivated successfully.\n'
                       'Finished aktau-go-monitor.service - Aktau Market private one-shot Go API monitor.\n')
        if cmd[0] in ('git', s.GIT_BIN):
            raise AssertionError('Git reached the privileged runner')
        if cmd[0] == s.GO_BIN:
            return 0, 'go version go1.27.4 linux/amd64\n'
        if cmd[0] == 'df':
            return 0, self.df
        return 127, ''

    def checkout(self):
        if self.checkout_error:
            raise s.CheckoutUnavailable(self.checkout_error)
        return 'ae69e01', len(self.git_dirty.splitlines())

    def read(self, path):
        if path not in self.files:
            raise FileNotFoundError(path)
        return self.files[path]

    def listdir(self, path):
        prefix = path + '/'
        names = [p[len(prefix):] for p in self.files if p.startswith(prefix)]
        if not names:
            raise FileNotFoundError(path)
        return names

    def exists(self, path):
        return self.reboot and path == s.REBOOT_FLAG

    def http(self, path, timeout=5):
        status = self.http_status[path]
        if status is None:
            return None, 'ConnectionRefusedError', 0
        dashboard = {'summary': {'canonicalProducts': 9000, 'stores': 4, 'matchedAcrossStores': 800,
                                 'snapshotAt': self.snapshot}, 'priceSpreads': [], 'locations': [], 'baskets': []}
        body = json.dumps(dashboard).encode() if path == '/api/dashboard' else b'{"status":"ok"}'
        return status, body, 7

    def now(self):
        return NOW

    def euid(self):
        return 0 if self.root else 1000

    def hostname(self):
        return 'vds39262'


def report(host):
    out = io.StringIO()
    with redirect_stdout(out):
        code = s.main([], host)
    return code, out.getvalue()


class StatusTests(unittest.TestCase):
    def test_healthy_host_is_ok(self):
        code, out = report(FakeHost())
        self.assertEqual(code, 0, out)
        self.assertTrue(out.rstrip().endswith('RESULT=OK'), out)
        self.assertNotIn('\n! ', out)
        self.assertIn('release=0a7bf2a container=0a7bf2a state=running health=healthy restarts=0', out)
        self.assertIn('images kept=2', out)
        self.assertIn('snapshot=2026-11-15 13:03Z age=56m', out)
        self.assertIn('daily 2026-11-15 13:00Z finished exit=0 published=true took=3m '
                      'anvar=0 dana=0 dina=0 fixprice=0 retention=ok', out)
        order = [out.index(x) for x in ('daily 2026-11-15 13:00Z', 'daily 2026-11-15 01:00Z', 'weekly 2026-11-09')]
        self.assertEqual(order, sorted(order), 'runs newest first by start time, not by file name')
        self.assertIn('snapshots kept=14 deleted_last=1', out)
        self.assertIn('checkout=ae69e01 changed_files=0', out)
        self.assertIn('go=go1.27.4', out)
        self.assertIn('phase=OK failures=0 last=2026-11-15 13:58Z (2m ago) queued=0', out)
        self.assertIn('last output: {"outcome":"OK","reason":"probe_complete","queued":0}', out)
        self.assertIn('aktau-sync timer=active', out)
        self.assertEqual(out.count('disk / used=45%'), 1, 'same filesystem printed once')

    def warns(self, host):
        code, out = report(host)
        self.assertEqual(code, 1, out)
        inline = [l[2:] for l in out.splitlines() if l.startswith('! ')]
        summary = [l[2:] for l in out.splitlines() if l.startswith('- ')]
        self.assertEqual(inline, summary, 'every warning is repeated in the summary')
        self.assertTrue(out.rstrip().endswith('RESULT=WARN n=%d' % len(inline)), out)
        return inline

    def test_image_mismatch_and_restarts(self):
        h = FakeHost()
        h.inspect = 'adilbaga-api:%s|running|unhealthy|3|2026-11-15T13:41:02Z\n' % OLD
        w = self.warns(h)
        self.assertIn('running image c7ba31f differs from release.env 0a7bf2a', w)
        self.assertIn('api container health=unhealthy', w)
        self.assertIn('api container restarted 3 times', w)

    def test_missing_container_and_api_down(self):
        h = FakeHost()
        h.inspect = ''
        h.http_status = {'/health/live': None, '/health/ready': 503, '/api/dashboard': None}
        w = self.warns(h)
        self.assertIn('container adilbaga-api not found (docker rc=1)', w)
        self.assertIn('/health/live answered no connection', w)
        self.assertIn('/health/ready answered 503', w)
        self.assertIn('snapshotAt not available from /api/dashboard (status None)', w)

    def test_stale_snapshot(self):
        h = FakeHost()
        h.snapshot = '2026-11-14T13:03:00.000Z'
        self.assertIn('published snapshot is 1d00h old', self.warns(h))

    def test_failed_and_stuck_and_missed_runs(self):
        h = FakeHost()
        h.files[s.RUNS_DIR + '/daily-20261115T130004Z.json'] = run_file('2026-11-15T13:00:04Z', exit_code=3)
        self.assertIn('last daily exit=3 (published, some stores from the previous file)', self.warns(h))
        h.files[s.RUNS_DIR + '/daily-20261115T130004Z.json'] = run_file('2026-11-15T13:00:04Z', status='running')
        self.assertIn('daily run started 2026-11-15 13:00Z is still running after 59m', self.warns(h))
        del h.files[s.RUNS_DIR + '/daily-20261115T130004Z.json']
        h.files[s.RUNS_DIR + '/daily-20261115T010003Z.json'] = run_file('2026-11-14T13:00:00Z')
        self.assertIn('no daily run for 1d01h', self.warns(h))

    def test_bad_run_file_is_skipped(self):
        h = FakeHost()
        h.files[s.RUNS_DIR + '/daily-20261115T140000Z.json'] = '{not json'
        code, out = report(h)
        self.assertEqual(code, 0, out)

    def test_retention_missing_and_dirty_checkout(self):
        h = FakeHost()
        h.journal_sync = '[sync] retention skipped\n'
        h.git_dirty = ' M pipeline/scripts/daily-sync.sh\n'
        w = self.warns(h)
        self.assertIn('no retention_complete line in the aktau-sync journal for 3 days', w)
        self.assertIn('sync checkout has 1 changed tracked files', w)
        h.journal_sync = ('{"level":"ERROR","msg":"retention_complete","outcome_class":"failure",'
                          '"error_code":"retention_apply_failed","kept_count":0,"deleted_count":0}\n')
        self.assertIn('last snapshot retention failed (see journalctl -u aktau-sync)', self.warns(h))

    def test_units(self):
        h = FakeHost()
        h.cloudflared = 'inactive'
        h.timer_state = 'inactive'
        h.service_result = 'exit-code'
        w = self.warns(h)
        self.assertIn('cloudflared is inactive', w)
        self.assertIn('aktau-sync.timer is inactive', w)
        self.assertIn('aktau-sync-report.service result=exit-code', w)

    def test_monitor(self):
        h = FakeHost()
        h.files[s.MONITOR_STATE] = json.dumps({'version': 2, 'phase': 'INCIDENT', 'failures': 2,
                                               'lastUTC': int((NOW - 3600) * 1000), 'queue': [{'id': 'a'}]})
        w = self.warns(h)
        self.assertIn('monitor phase=INCIDENT', w)
        self.assertIn('monitor has 1 undelivered alert(s)', w)
        self.assertIn('monitor has not run for 1h00m', w)
        h.files[s.MONITOR_STATE] = 'garbage'
        self.assertIn('monitor state unreadable (%s)' % s.MONITOR_STATE, self.warns(h))

    def test_host_disk_reboot_and_not_root(self):
        h = FakeHost()
        h.df = 'Filesystem Size Used Avail Use% Mounted on\n/dev/vda1 40G 36G 4G 90% /\n'
        h.reboot = True
        h.root = False
        w = self.warns(h)
        self.assertIn('disk / is 90% full', w)
        self.assertIn('reboot required', w)
        h.files[s.REBOOT_FLAG + '.pkgs'] = 'linux-image-6.8.0-90-generic\nlibc6\nlinux-base\nlibc6\n'
        self.assertIn('reboot required by libc6, linux-base, linux-image-6.8.0-90-generic', self.warns(h))
        self.assertIn('not root: run with sudo, some sections will be incomplete', w)

    def test_section_crash_is_contained(self):
        h = FakeHost()
        h.listdir = lambda path: 1 / 0
        code, out = report(h)
        self.assertEqual(code, 1)
        self.assertIn('! section_sync crashed: ZeroDivisionError', out)
        self.assertIn('== Monitor', out, 'later sections still run')

    def test_reads_no_secret_files(self):
        h = FakeHost()
        seen = []
        read = h.read
        h.read = lambda p: (seen.append(p), read(p))[1]
        report(h)
        for p in seen:
            self.assertNotRegex(p, r'\.env$|telegram|secret|key', p) if p != s.RELEASE_ENV else None
        flat = ' '.join(' '.join(c) for c in h.commands)
        self.assertNotRegex(flat, r'api\.env|aktau-sync\.env|telegram\.env|docker (run|exec|rm|compose)|systemctl (start|stop|restart)')

    def test_checkout_failure_preserves_other_sections_and_has_no_root_fallback(self):
        h = FakeHost()
        h.checkout_error = 'could not start Git as aktau-sync'
        code, out = report(h)
        self.assertEqual(code, 1)
        self.assertIn('! sync checkout /opt/aktau-sync: could not start Git as aktau-sync', out)
        self.assertNotIn('checkout=', out)
        self.assertIn('== Monitor', out)
        self.assertIn('== Host', out)
        self.assertIn('go=go1.27.4', out)
        self.assertTrue(out.rstrip().endswith('RESULT=WARN n=1'))
        self.assertFalse(any(c[0] in ('git', s.GIT_BIN) for c in h.commands))

    def test_usage(self):
        self.assertEqual(s.main(['--run'], FakeHost()), 2)


class CheckoutTests(unittest.TestCase):
    account = SimpleNamespace(pw_name='aktau-sync', pw_uid=999, pw_gid=987)

    def test_both_commands_use_fixed_argv_and_sanitized_child(self):
        real_popen = subprocess.Popen
        # A harmless pipe producer tests the real bounded reader under ordinary CI,
        # while the spy observes the arguments before privileged process creation.
        def producer(_argv, **kw):
            code = 'print("ae69e01")' if 'rev-parse' in _argv else 'print(" M file")'
            return real_popen([sys.executable, '-I', '-B', '-c', code],
                              **{k: v for k, v in kw.items() if k not in ('user', 'group', 'extra_groups')})

        with patch.object(s.pwd, 'getpwnam', return_value=self.account), \
                patch.object(s.os, 'geteuid', return_value=0), \
                patch.dict(os.environ, {'HOME': '/root', 'GIT_CONFIG_COUNT': '1',
                                        'GIT_DIR': '/untrusted', 'SECRET_FIXTURE': 'ignored'}), \
                patch.object(s.Host, 'run', side_effect=AssertionError('privileged path')), \
                patch.object(s.subprocess, 'Popen', side_effect=producer) as popen:
            self.assertEqual(s.Host().checkout(), ('ae69e01', 1))
        prefix = [s.GIT_BIN, '--no-optional-locks', '-c', 'core.fsmonitor=false',
                  '-c', 'core.hooksPath=/dev/null', '-C', s.SYNC_CHECKOUT]
        for call, suffix in zip(popen.call_args_list, [
            ['rev-parse', '--short', 'HEAD'],
            ['status', '--porcelain', '--untracked-files=no'],
        ], strict=True):
            self.assertEqual(call.args, (prefix + suffix,))
            self.assertEqual(call.kwargs['user'], 999)
            self.assertEqual(call.kwargs['group'], 987)
            self.assertEqual(call.kwargs['extra_groups'], ())
            self.assertEqual(call.kwargs['cwd'], '/')
            self.assertFalse(call.kwargs['shell'])
            self.assertTrue(call.kwargs['close_fds'])
            self.assertEqual(call.kwargs['stdin'], subprocess.DEVNULL)
            self.assertEqual(call.kwargs['env'], {
                'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent', 'XDG_CONFIG_HOME': '/nonexistent',
                'GIT_CONFIG_NOSYSTEM': '1', 'LC_ALL': 'C', 'TZ': 'UTC',
            })

    def test_missing_or_unsafe_account_and_nonroot_never_launch(self):
        with patch.object(s.subprocess, 'Popen') as popen:
            for uid, gid in [(0, 987), (999, 0), (-1, 987), (999, -1)]:
                account = SimpleNamespace(pw_name=s.SYNC_USER, pw_uid=uid, pw_gid=gid)
                with patch.object(s.pwd, 'getpwnam', return_value=account):
                    with self.assertRaisesRegex(s.CheckoutUnavailable, 'unsafe'):
                        s.Host().checkout()
            with patch.object(s.pwd, 'getpwnam', side_effect=KeyError):
                with self.assertRaisesRegex(s.CheckoutUnavailable, 'unavailable'):
                    s.Host().checkout()
            with patch.object(s.pwd, 'getpwnam', return_value=self.account), \
                    patch.object(s.os, 'geteuid', return_value=999):
                with self.assertRaisesRegex(s.CheckoutUnavailable, 'launcher unavailable'):
                    s.Host().checkout()
            popen.assert_not_called()

    def test_launch_failure_never_retries(self):
        for exc in (PermissionError, FileNotFoundError, subprocess.SubprocessError):
            with self.subTest(error=exc.__name__), \
                    patch.object(s.pwd, 'getpwnam', return_value=self.account), \
                    patch.object(s.os, 'geteuid', return_value=0), \
                    patch.object(s.subprocess, 'Popen', side_effect=exc) as popen:
                with self.assertRaisesRegex(s.CheckoutUnavailable, 'could not start'):
                    s.Host().checkout()
                popen.assert_called_once()

    def test_output_and_time_limits_and_nonzero_exit(self):
        real_popen = subprocess.Popen
        for code, reason in [('print("a" * 8192)', 'output exceeded limit'),
                             ('import time; time.sleep(30)', 'timed out'),
                             ('import sys; sys.exit(9)', 'Git failed')]:
            with self.subTest(reason=reason):
                children = []
                def producer(_argv, **kw):
                    child = real_popen([sys.executable, '-I', '-B', '-c', code],
                                       **{k: v for k, v in kw.items() if k not in ('user', 'group', 'extra_groups')})
                    children.append(child)
                    return child
                with patch.object(s, 'GIT_STDOUT_LIMIT', 64), patch.object(s, 'GIT_TIMEOUT', 0.5), \
                        patch.object(s.subprocess, 'Popen', side_effect=producer):
                    with self.assertRaisesRegex(s.CheckoutUnavailable, reason):
                        s.checkout_git(('status',), 999, 987)
                self.assertIsNotNone(children[0].poll())

    @unittest.skipUnless(os.environ.get('ADILBAGA_DISPOSABLE_ROOT_FIXTURE') == '1' and os.geteuid() == 0,
                         'real UID/GID requires explicit disposable root fixture')
    def test_real_linux_child_identity_and_checkout(self):
        nobody = pwd.getpwnam('nobody')
        account = SimpleNamespace(pw_name=s.SYNC_USER, pw_uid=nobody.pw_uid, pw_gid=nobody.pw_gid)
        ids = dict(user=account.pw_uid, group=account.pw_gid, extra_groups=())
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            root.chmod(0o755)
            repo = root / 'checkout'
            repo.mkdir()
            os.chown(repo, account.pw_uid, account.pw_gid)
            probe = root / 'identity-probe'
            probe.write_text('#!/usr/bin/python3 -I\nimport json,os\n'
                             'print(json.dumps([os.getuid(),os.geteuid(),os.getgid(),os.getegid(),os.getgroups(),os.getenv("ROOT_FIXTURE")]))\n')
            probe.chmod(0o755)
            with patch.object(s, 'GIT_BIN', str(probe)), patch.dict(os.environ, {'ROOT_FIXTURE': 'ignored'}):
                actual = json.loads(s.checkout_git(('rev-parse', '--short', 'HEAD'), account.pw_uid, account.pw_gid))
            self.assertEqual(actual, [account.pw_uid]*2 + [account.pw_gid]*2 + [[], None])
            def git(*args):
                subprocess.run([s.GIT_BIN, '-C', str(repo), *args], check=True,
                               env={'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent'},
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **ids)
            git('init')
            tracked = repo / 'file'
            tracked.write_text('initial')
            git('add', 'file')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture')
            tracked.write_text('changed')
            index = repo / '.git/index'
            before = index.read_bytes(), index.stat().st_mtime_ns
            with patch.object(s, 'SYNC_CHECKOUT', str(repo)), patch.object(s.pwd, 'getpwnam', return_value=account):
                head, count = s.Host().checkout()
            self.assertRegex(head, r'^[0-9a-f]+$')
            self.assertEqual(count, 1)
            self.assertEqual((index.read_bytes(), index.stat().st_mtime_ns), before)


if __name__ == '__main__':
    unittest.main()
