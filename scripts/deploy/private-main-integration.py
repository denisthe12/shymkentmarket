"""Explicit disposable Linux root qualification; never run on an existing host.

Run only inside the isolated test container described in AUTO_DEPLOY_SETUP.md.
Uses synthetic keys/repository, a loopback SSH server, no GitHub credentials.
"""
import os
import pathlib
import signal
import subprocess
import tempfile
import unittest

import auto_broker as broker


def run(*args):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL).strip()


class RealSSHTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.geteuid() != 0 or os.environ.get('DISPOSABLE_PRIVATE_MAIN_TEST') != '1':
            raise RuntimeError('requires explicitly selected disposable root container')
        for path in ('/home/deploy', '/repo', str(broker.GITHUB_HOSTS)):
            if pathlib.Path(path).exists(): raise RuntimeError('fixture collision')
        run('useradd', '-u', '1000', '-U', '-m', '-s', '/bin/sh', 'deploy')
        run('useradd', '-m', '-s', '/bin/sh', 'git')
        run('usermod', '-p', 'x', 'git')  # no usable password; public-key only server
        pathlib.Path('/run/sshd').mkdir(exist_ok=True)
        sshdir = pathlib.Path('/home/deploy/.ssh'); sshdir.mkdir(mode=0o700)
        run('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(broker.GITHUB_KEY))
        run('chown', '-R', '1000:1000', str(sshdir))
        cls.host = pathlib.Path('/tmp/synthetic-host')
        run('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(cls.host))
        cls.hosts = b'github.com ' + pathlib.Path(str(cls.host) + '.pub').read_bytes()
        broker.GITHUB_HOSTS.write_bytes(cls.hosts); broker.GITHUB_HOSTS.chmod(0o644)
        git_home = pathlib.Path('/home/git'); (git_home / '.ssh').mkdir(mode=0o700)
        cls.auth = git_home / '.ssh/authorized_keys'
        cls.auth_bytes = (b'restrict,command="/usr/bin/git-upload-pack /repo" ' +
                          pathlib.Path(str(broker.GITHUB_KEY) + '.pub').read_bytes())
        cls.auth.write_bytes(cls.auth_bytes); cls.auth.chmod(0o600)
        run('chown', '-R', 'git:git', str(git_home / '.ssh'))
        run('git', 'init', '--bare', '--initial-branch=main', '/repo')
        tree = subprocess.check_output(['git', '--git-dir=/repo', 'mktree'], input=b'').strip()
        env = dict(os.environ, GIT_AUTHOR_NAME='Fixture', GIT_AUTHOR_EMAIL='fixture@example.invalid',
                   GIT_COMMITTER_NAME='Fixture', GIT_COMMITTER_EMAIL='fixture@example.invalid')
        cls.sha = subprocess.check_output(['git', '--git-dir=/repo', 'commit-tree', tree.decode(), '-m', 'fixture'], env=env).strip().decode()
        run('git', '--git-dir=/repo', 'update-ref', 'refs/heads/main', cls.sha)
        run('chown', '-R', 'git:git', '/repo')
        with open('/etc/hosts', 'a') as f: f.write('\n127.0.0.1 github.com\n')
        cls.config = pathlib.Path('/tmp/sshd-config')
        cls.config.write_text('Port 22\nListenAddress 127.0.0.1\nHostKey /tmp/synthetic-host\n'
                              'PidFile /tmp/synthetic-sshd.pid\nPasswordAuthentication no\n'
                              'KbdInteractiveAuthentication no\nUsePAM no\nAllowUsers git\n'
                              'AllowTcpForwarding no\nAllowAgentForwarding no\nPermitTTY no\n')
        cls.server = subprocess.Popen(['/usr/sbin/sshd', '-D', '-e', '-f', str(cls.config)],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        import socket, time
        for _ in range(100):
            try:
                with socket.create_connection(('127.0.0.1', 22), timeout=.1): break
            except OSError: time.sleep(.05)
        else: raise RuntimeError('fixture server startup')

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate(); cls.server.wait(timeout=3)

    def tearDown(self):
        broker.GITHUB_HOSTS.unlink(missing_ok=True)
        broker.GITHUB_HOSTS.write_bytes(self.hosts); broker.GITHUB_HOSTS.chmod(0o644)
        self.auth.write_bytes(self.auth_bytes); self.auth.chmod(0o600)
        run('chown', 'git:git', str(self.auth))

    def test_real_git_ssh_private_main_and_dropped_identity(self):
        self.assertEqual(broker.private_main(), self.sha)
        self.assertTrue(broker.Host().fresh_main(self.sha))
        self.assertFalse(broker.Host().fresh_main('0' * 40))
        with tempfile.TemporaryDirectory() as d:
            trap = pathlib.Path(d) / 'injected'
            os.environ.update(GIT_SSH_COMMAND='touch ' + str(trap), GIT_CONFIG_COUNT='1',
                              GIT_CONFIG_KEY_0='url.file:///evil.insteadOf', GIT_CONFIG_VALUE_0='git@github.com:',
                              SSH_AUTH_SOCK='/untrusted', HOME='/root')
            self.assertEqual(broker.private_main(), self.sha)
            self.assertFalse(trap.exists())

    def test_nonroot_broker_and_host_trust_write_are_rejected(self):
        child = subprocess.run(['/usr/bin/python3', '-c',
            "import auto_broker; auto_broker.private_main()"], cwd='/fixture',
            user=1000, group=1000, extra_groups=[], capture_output=True)
        self.assertNotEqual(child.returncode, 0)
        self.assertIn(b'github_root_required', child.stderr)
        child = subprocess.run(['/usr/bin/python3', '-c',
            "open('/etc/ssh/adilbaga-github-known-hosts','wb')"],
            user=1000, group=1000, extra_groups=[], capture_output=True)
        self.assertNotEqual(child.returncode, 0)
        self.assertEqual(broker.GITHUB_HOSTS.read_bytes(), self.hosts)

    def test_key_symlink_and_mode_and_no_fd_leaks(self):
        saved = broker.GITHUB_KEY.with_name('saved-key')
        broker.GITHUB_KEY.rename(saved)
        try:
            broker.GITHUB_KEY.symlink_to(saved)
            with self.assertRaisesRegex(broker.Blocked, '^github_custody$'): broker.private_main()
            broker.GITHUB_KEY.unlink()
        finally: saved.rename(broker.GITHUB_KEY)
        broker.GITHUB_KEY.chmod(0o644)
        try:
            with self.assertRaisesRegex(broker.Blocked, '^github_custody$'): broker.private_main()
        finally: broker.GITHUB_KEY.chmod(0o600)
        before = len(list(pathlib.Path('/proc/self/fd').iterdir()))
        for _ in range(3): self.assertEqual(broker.private_main(), self.sha)
        self.assertEqual(len(list(pathlib.Path('/proc/self/fd').iterdir())), before)

    def test_missing_key(self):
        moved = broker.GITHUB_KEY.with_name('saved')
        broker.GITHUB_KEY.rename(moved)
        try:
            with self.assertRaisesRegex(broker.Blocked, '^github_identity_unavailable$'): broker.private_main()
        finally: moved.rename(broker.GITHUB_KEY)

    def test_denied_authorization(self):
        self.auth.write_bytes(b'')
        with self.assertRaisesRegex(broker.Blocked, '^github_lookup_failed$'): broker.private_main()

    def test_wrong_host_key(self):
        broker.GITHUB_HOSTS.write_text('github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE5HIVxAGhRDsXTXLU3PUbeA0GWdyQr3Q8COQSRSTY91\n')
        with self.assertRaisesRegex(broker.Blocked, '^github_lookup_failed$'): broker.private_main()

    def test_real_server_timeout(self):
        os.kill(self.server.pid, signal.SIGSTOP)
        try:
            with self.assertRaisesRegex(broker.Blocked, '^github_(lookup_failed|timeout)$'): broker.private_main()
        finally: os.kill(self.server.pid, signal.SIGCONT)

    def test_custody_symlink_mode_owner_and_hardlink(self):
        broker.GITHUB_HOSTS.chmod(0o666)
        with self.assertRaisesRegex(broker.Blocked, '^github_custody$'): broker.private_main()
        broker.GITHUB_HOSTS.chmod(0o644)
        run('chown', '1000:1000', str(broker.GITHUB_HOSTS))
        with self.assertRaisesRegex(broker.Blocked, '^github_custody$'): broker.private_main()
        run('chown', '0:0', str(broker.GITHUB_HOSTS))
        saved = broker.GITHUB_HOSTS.with_name('fixture-saved-hosts')
        broker.GITHUB_HOSTS.rename(saved)
        try:
            broker.GITHUB_HOSTS.symlink_to(saved)
            with self.assertRaisesRegex(broker.Blocked, '^github_custody$'): broker.private_main()
            broker.GITHUB_HOSTS.unlink()
            os.link(saved, broker.GITHUB_HOSTS)
            with self.assertRaisesRegex(broker.Blocked, '^github_custody$'): broker.private_main()
        finally:
            broker.GITHUB_HOSTS.unlink(missing_ok=True); saved.unlink(missing_ok=True)


if __name__ == '__main__':
    unittest.main()
