#!/usr/bin/python3
"""One reviewed root step, contract 20.6. No promotion, no general CLI, no retry.

Replaces four pinned files and writes one policy succession record. The approval
is issued by the delegated administrator in the manual session of section 20.4.
Tests inject an owned filesystem and checks; production main() accepts neither.
"""
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import time
import types

ID = 'anvar-root-step-20261105-v1'
BASE_SOURCE = 'ea3cf04e7653bf6310f631fa8a6533122f128567'
BASE_TREE = 'cc2f3f1d32570ad7892abe433b37a7ca82ebefcd'
BASE_INVENTORY = '0671b096d799ac17d54ae7c1579f1d9d1af6b54888c5fc1b2812bb610703b6cc'
ROOT = '/usr/local/libexec/aktau-sync-promotion'
EXECUTOR = ROOT + '/publisher-promotion.py'
GATE = ROOT + '/promotion-runtime-gate.py'
PNPM = ROOT + '/bin/pnpm'
SELF = ROOT + '/anvar-root-step.py'
POLICY = '/etc/aktau-sync-promotion/policy.json'
APPROVAL = '/etc/aktau-sync-promotion/anvar-root-approval.json'
SUCCESSION = '/etc/aktau-sync-promotion/policy-succession.json'
SELECTION = '/etc/aktau-sync-promotion/pipeline.json'
BASE = '/var/lib/aktau-sync-promotion'
INPUT = BASE + '/anvar-root-input'
BACKUP = '/var/backups/aktau-anvar-root-step-20261105'
JOURNAL = BASE + '/state/anvar-root-step.json'
PENDING = JOURNAL + '.next'  # never '.pending': the executor refuses to run while such a name exists
EXECUTOR_SOURCE = 'ops/c2/publisher-promotion.py'
BUILDER_SOURCE = 'scripts/ops/build-sync-promotion.py'
OLD_EXECUTOR = 'ee29a676284994d081f830e4395dff41340ba3b7990842dbd9610ae712765d65'
OLD_GATE = '07abcb00d675eb1e1de387957302dc8ba626ef07589f272df596648610a40d6e'
OLD_PNPM = '41851591e276f54a019e61b74044352dac7dc61ad9bb0fb31227d9ac763f4dfe'
OLD_BUILDER = '10684efbc8df6a7e0b9503c2cf063f555d6a741e0007abec21ad8b7ab2970a52'
OLD_POLICY = '350b23639dc7faa69716ea22ee7b840ad99c719f219d8d18dcf9130b5b1ac8ec'
NEW_EXECUTOR = '34fd8846bd7d7d14b160a19c306f27e361e144f7b5054c9832f13d0c493aef61'
NEW_GATE = 'c4da815750f6470672b5dc3823c708a309b85f48650723f69786f98cf8754ecb'
NEW_PNPM = 'e734f1b95ba6ca512aa7c8f9d89b55f024dfa9b0733b2c718615fe3e49b0ab35'
NEW_BUILDER = '321cf18b879a3280dae36256ef563fdf22a59d9440b73b1e735fe0ce3a2ea2c5'
NEW_POLICY = '1b75ce79852cf079fd2a19804a1ef2520edbeab30a1c69cc9c651d3811847aaa'
# Order matters: the policy goes last, after the executor that can read the succession record.
TARGETS = {'pnpm': (PNPM, 0o755, OLD_PNPM, NEW_PNPM), 'gate': (GATE, 0o755, OLD_GATE, NEW_GATE),
           'executor': (EXECUTOR, 0o755, OLD_EXECUTOR, NEW_EXECUTOR), 'policy': (POLICY, 0o644, OLD_POLICY, NEW_POLICY)}
INPUTS = {'pnpm': 'pipeline-pnpm', 'gate': 'promotion-runtime-gate.py', 'executor': 'publisher-promotion.py'}
LOCKS = [(BASE + '/state/ingress.lock', 0o600), (BASE + '/runtime.lock', 0o644),
         ('/var/lib/aktau-c2-custodian/controller.lock', 0o600)]
PHASES = {'intent', 'backup_created', 'backed_up', 'staged', 'prepared', 'pnpm_replaced', 'gate_replaced',
          'executor_replaced', 'succession_written', 'policy_replaced', 'receipt_written', 'verified',
          'rollback_prepared', 'rollback_policy_replaced', 'rollback_executor_replaced', 'rollback_gate_replaced',
          'rollback_pnpm_replaced', 'rolled_back'}
MAX_FILE = 512 << 10
APPROVAL_TTL_MS = 1800000
TIMER_MARGIN_MS = 1800000


class Blocked(Exception): pass


def need(ok, code):
    if not ok: raise Blocked(code)


def digest(raw): return hashlib.sha256(raw).hexdigest()
def canonical(v): return (json.dumps(v, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode()
def stamp(s): return [s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_nlink, s.st_size, s.st_mtime_ns, s.st_ctime_ns]
def core(s): return s[:8]  # rename can change ctime; exact inode/bytes/mtime/mode remain required


def parse(raw):
    def pairs(items):
        out = {}
        for k, v in items:
            need(k not in out, 'duplicate_key'); out[k] = v
        return out
    try:
        value = json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False, 'invalid_json'))
        need(canonical(value) == raw, 'noncanonical_json'); return value
    except (ValueError, TypeError, UnicodeError): raise Blocked('invalid_json') from None


def candidate(old, validate):
    need(digest(old) == OLD_POLICY, 'old_policy_digest')
    a = parse(old); validate(a); b = json.loads(json.dumps(a))
    need(a['producerFiles'][EXECUTOR_SOURCE] == a['runtimeFiles'][EXECUTOR] == OLD_EXECUTOR
         and a['producerFiles'][BUILDER_SOURCE] == OLD_BUILDER and a['runtimeFiles'][GATE] == OLD_GATE
         and a['runtimeFiles'][PNPM] == OLD_PNPM, 'old_pins')
    b['producerFiles'][EXECUTOR_SOURCE] = NEW_EXECUTOR; b['runtimeFiles'][EXECUTOR] = NEW_EXECUTOR
    b['producerFiles'][BUILDER_SOURCE] = NEW_BUILDER; b['runtimeFiles'][GATE] = NEW_GATE; b['runtimeFiles'][PNPM] = NEW_PNPM
    validate(b); raw = canonical(b)
    need(digest(raw) == NEW_POLICY and {k: v for k, v in a.items() if k not in ['producerFiles', 'runtimeFiles']}
         == {k: v for k, v in b.items() if k not in ['producerFiles', 'runtimeFiles']}, 'policy_candidate')
    return raw


def succession(approval_sha):
    return canonical({'version': 1, 'purpose': 'anvar-next-transition', 'enrolledPolicySha256': OLD_POLICY,
                      'policySha256': NEW_POLICY, 'approvalSha256': approval_sha})


def receipt():
    return canonical({'version': 1, 'id': ID, 'executorSha256': NEW_EXECUTOR, 'gateSha256': NEW_GATE,
                      'pnpmSha256': NEW_PNPM, 'policySha256': NEW_POLICY, 'outcome': 'verified'})


def verify_approval(raw, now_ms):
    a = parse(raw)
    fixed = {'version': 1, 'purpose': 'anvar-root-step', 'id': ID, 'baseSourceSha': BASE_SOURCE, 'oldPolicySha256': OLD_POLICY,
             'newPolicySha256': NEW_POLICY, 'newExecutorSha256': NEW_EXECUTOR, 'newGateSha256': NEW_GATE, 'newPnpmSha256': NEW_PNPM}
    need(type(a) is dict and set(a) == set(fixed) | {'approvalId', 'notBefore', 'expiresAt'}
         and type(a['version']) is int and all(a[k] == v for k, v in fixed.items())
         and type(a['approvalId']) is str and re.fullmatch(r'[a-f0-9]{32}', a['approvalId']), 'root_step_approval')
    times = []
    for key in ['notBefore', 'expiresAt']:
        need(type(a[key]) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z', a[key]), 'root_step_approval_time')
        times.append(datetime.datetime.fromisoformat(a[key].replace('Z', '+00:00')).timestamp() * 1000)
    need(0 < times[1] - times[0] <= APPROVAL_TTL_MS and times[0] <= now_ms < times[1], 'root_step_approval_time')
    return digest(raw)


def timer_clear(now_ms):
    """Fixed schedule in UTC: aktau-sync 01:00 and 13:00, aktau-sync-full Sunday 22:00."""
    now = datetime.datetime.fromtimestamp(now_ms / 1000, datetime.timezone.utc)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    runs = []
    for offset in [0, 1]:
        date = day + datetime.timedelta(days=offset)
        runs += [date + datetime.timedelta(hours=1), date + datetime.timedelta(hours=13)]
        if date.weekday() == 6: runs.append(date + datetime.timedelta(hours=22))
    return not any(0 <= (run - now).total_seconds() * 1000 < TIMER_MARGIN_MS for run in runs)


class Filesystem:
    """Pinned root custody. No sandbox/path override is exposed by main()."""
    def __init__(self, sandbox=None):
        self.sandbox = Path(sandbox) if sandbox else None
        self.uid, self.gid = (os.geteuid(), os.getegid()) if sandbox else (0, 0)
        if sandbox:
            s = os.lstat(sandbox)
            need(stat.S_ISDIR(s.st_mode) and (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode)) == (self.uid, self.gid, 0o700), 'sandbox_custody')
        else: need(os.getuid() == os.geteuid() == 0, 'root_required')

    def path(self, path):
        need(type(path) is str and path.startswith('/') and '..' not in Path(path).parts and Path(path).as_posix() == path, 'fixed_path')
        return self.sandbox / path[1:] if self.sandbox else Path(path)

    @contextlib.contextmanager
    def directory(self, path):
        self.path(path)
        fd = os.open(self.sandbox or '/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            initial = os.fstat(fd)
            need((initial.st_uid, initial.st_gid) == (self.uid, self.gid) and not initial.st_mode & 0o022
                 and initial.st_mode & 0o700 == 0o700 and not os.listxattr(fd), 'root_directory_custody')
            for part in Path(path).parts[1:]:
                n = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=fd)
                os.close(fd); fd = n; s = os.fstat(fd)
                need((s.st_uid, s.st_gid) == (self.uid, self.gid) and not s.st_mode & 0o022 and s.st_mode & 0o700 == 0o700
                     and not os.listxattr(fd), 'root_directory_custody')
            s = os.fstat(fd)
            yield fd
            need(stamp(os.stat(self.path(path), follow_symlinks=False))[:5] == stamp(s)[:5], 'directory_changed')
        finally: os.close(fd)

    @contextlib.contextmanager
    def opened(self, path, mode, cap=1 << 20, empty=False):
        with self.directory(str(Path(path).parent.as_posix())) as parent:
            name = Path(path).name
            fd = os.open(name, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=parent)
            try:
                s = os.fstat(fd)
                need(stat.S_ISREG(s.st_mode) and (s.st_uid, s.st_gid, stat.S_IMODE(s.st_mode), s.st_nlink)
                     == (self.uid, self.gid, mode, 1) and (0 if empty else 1) <= s.st_size <= cap
                     and not os.listxattr(fd), 'root_file_custody')
                raw = bytearray()
                while b := os.read(fd, min(65536, cap + 1 - len(raw))):
                    raw.extend(b); need(len(raw) <= cap, 'read_capacity')
                need(len(raw) == s.st_size and stamp(os.fstat(fd)) == stamp(s)
                     == stamp(os.stat(name, dir_fd=parent, follow_symlinks=False)), 'file_changed')
                yield fd, parent, bytes(raw), stamp(s)
                # Caller may have renamed the file; its own CAS/readback handles that.
            finally: os.close(fd)

    def read(self, path, mode, cap=1 << 20):
        with self.opened(path, mode, cap) as (_, _, raw, s): return raw, s

    def exists(self, path):
        with self.directory(Path(path).parent.as_posix()) as d:
            try: os.stat(Path(path).name, dir_fd=d, follow_symlinks=False); return True
            except FileNotFoundError: return False

    def names(self, path):
        with self.directory(path) as d: return set(os.listdir(d))

    def create(self, path, raw, mode):
        """The final name appears only after a full fsynced write, so a kill never tears it."""
        need(type(raw) is bytes and 0 < len(raw) <= MAX_FILE, 'write_capacity')
        name = Path(path).name; part = name + '.part'
        with self.directory(Path(path).parent.as_posix()) as d:
            fd = os.open(part, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=d)
            try:
                os.fchown(fd, self.uid, self.gid); at = 0
                while at < len(raw):
                    n = os.write(fd, raw[at:]); need(n > 0, 'short_write'); at += n
                os.fchmod(fd, mode); os.fsync(fd); created = stamp(os.fstat(fd))
            finally: os.close(fd)
            need(name not in os.listdir(d), 'target_exists')
            os.rename(part, name, src_dir_fd=d, dst_dir_fd=d); os.fsync(d)
        actual, st = self.read(path, mode, MAX_FILE); need(actual == raw and core(st) == core(created), 'write_readback'); return st

    def discard(self, path):
        """Remove one pinned temporary name. It carries no state: targets are re-classified from disk."""
        with self.directory(Path(path).parent.as_posix()) as d:
            try: s = os.stat(Path(path).name, dir_fd=d, follow_symlinks=False)
            except FileNotFoundError: return
            need(stat.S_ISREG(s.st_mode) and (s.st_uid, s.st_gid) == (self.uid, self.gid), 'temp_custody')
            os.unlink(Path(path).name, dir_fd=d); os.fsync(d)

    def mkdir(self, path):
        with self.directory(Path(path).parent.as_posix()) as d:
            os.mkdir(Path(path).name, 0o700, dir_fd=d)
            fd = os.open(Path(path).name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=d)
            try:
                state = os.fstat(fd); need((state.st_uid, state.st_gid) == (self.uid, self.gid) and not os.listxattr(fd), 'backup_custody')
                os.fchmod(fd, 0o700); os.fsync(fd); os.fsync(d); created = stamp(os.fstat(fd))[:5]
            finally: os.close(fd)
        with self.directory(path) as d:
            s = os.fstat(d); need(stamp(s)[:5] == created and stat.S_IMODE(s.st_mode) == 0o700, 'backup_mode'); return created

    def rename(self, source, target, mode, expected_source, expected_target, wanted, old_hash):
        need(Path(source).parent == Path(target).parent, 'same_parent_required')
        with self.opened(source, mode) as (sf, sd, raw, ss), self.opened(target, mode, MAX_FILE) as (tf, td, target_raw, ts):
            need(ss == expected_source and ts == expected_target and digest(raw) == wanted and digest(target_raw) == old_hash, 'inode_hash_cas')
            # Recheck names/descriptors immediately before replacing, while both stay pinned.
            need(stamp(os.fstat(sf)) == ss == stamp(os.stat(Path(source).name, dir_fd=sd, follow_symlinks=False))
                 and stamp(os.fstat(tf)) == ts == stamp(os.stat(Path(target).name, dir_fd=td, follow_symlinks=False)), 'stale_inode')
            for path, held in [(source, sd), (target, td)]:
                with self.directory(Path(path).parent.as_posix()) as current:
                    need(stamp(os.fstat(current))[:5] == stamp(os.fstat(held))[:5], 'parent_cas')
            os.rename(Path(source).name, Path(target).name, src_dir_fd=sd, dst_dir_fd=td); os.fsync(td)
        result, state = self.read(target, mode); need(result == raw and core(state) == core(ss), 'rename_readback')
        return state

    def journal(self, value, previous, old_hash):
        raw = canonical(value); st = self.create(PENDING, raw, 0o600)
        if previous is None:
            need(not self.exists(JOURNAL), 'journal_exists')  # all locks are held
            with self.directory(Path(JOURNAL).parent.as_posix()) as d:
                os.rename(Path(PENDING).name, Path(JOURNAL).name, src_dir_fd=d, dst_dir_fd=d); os.fsync(d)
        else: self.rename(PENDING, JOURNAL, 0o600, st, previous, digest(raw), old_hash)
        actual, state = self.read(JOURNAL, 0o600, MAX_FILE); need(actual == raw, 'journal_readback'); return state

    @contextlib.contextmanager
    def locks(self):
        with contextlib.ExitStack() as stack:
            for path, mode in LOCKS:
                fd, parent, raw, s = stack.enter_context(self.opened(path, mode, 4096, empty=True))
                need(raw == b'', 'lock_contents')
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                need(stamp(os.fstat(fd)) == s == stamp(os.stat(Path(path).name, dir_fd=parent, follow_symlinks=False)), 'lock_changed')
            yield


class Step:
    def __init__(self, fs, checks, clock=None, fault=None):
        self.fs, self.checks = fs, checks
        self.clock = clock or (lambda: time.time() * 1000)
        self.fault = fault or (lambda _: None)
        self.j = None; self.js = None; self.jh = None

    def resource(self, key):
        """(path, mode, sha256). Only these names may exist for this step."""
        if key == 'receipt': return BACKUP + '/receipt.json', 0o600, digest(receipt())
        if key == 'succession': return SUCCESSION, 0o444, digest(succession(self.j['approvalSha256']))
        kind, name = key.split('_', 1); path, mode, old, new = TARGETS[name]
        if kind == 'old': return BACKUP + '/' + name + '.old', 0o600, old
        slot = str(Path(path).parent.as_posix()) + '/.' + Path(path).name + '.anvar-root-step.'
        return (slot + 'staged', mode, new) if kind == 'new' else (slot + 'restore', mode, old)

    def keys(self):
        return {'receipt', 'succession', *[k + '_' + n for k in ['old', 'new', 'restore'] for n in TARGETS]}

    def save(self, phase, event=None):
        need(phase in PHASES and self.j['seq'] < 63, 'journal_capacity')
        self.j['phase'] = phase; self.j['seq'] += 1
        self.js = self.fs.journal(self.j, self.js, self.jh); self.jh = digest(canonical(self.j)); self.fault(event or phase)

    def load(self):
        raw, self.js = self.fs.read(JOURNAL, 0o600, MAX_FILE); self.jh = digest(raw); self.j = parse(raw); j = self.j
        need(type(j) is dict and set(j) == {'version', 'id', 'phase', 'seq', 'approvalSha256', 'original', 'snapshot', 'backupDirectory', 'resources'}
             and type(j['version']) is int and j['version'] == 1 and j['id'] == ID and j['phase'] in PHASES
             and type(j['seq']) is int and 0 < j['seq'] <= 63 and type(j['approvalSha256']) is str
             and re.fullmatch('[a-f0-9]{64}', j['approvalSha256']) and type(j['resources']) is dict
             and set(j['resources']) <= self.keys() and type(j['original']) is dict and set(j['original']) == set(TARGETS), 'journal_schema')
        for k, rec in {**j['original'], **j['resources']}.items():
            need(type(rec) is dict and set(rec) == {'stamp', 'sha256'} and type(rec['stamp']) is list
                 and len(rec['stamp']) == 9 and all(type(x) is int and x >= 0 for x in rec['stamp']), 'journal_record')
            mode, expected = (TARGETS[k][1], TARGETS[k][2]) if k in TARGETS else self.resource(k)[1:]
            need(rec['sha256'] == expected and rec['stamp'][2] == stat.S_IFREG | mode
                 and rec['stamp'][3:6] == [self.fs.uid, self.fs.gid, 1], 'journal_hash_or_metadata')
        need(j['backupDirectory'] is None or (type(j['backupDirectory']) is list and len(j['backupDirectory']) == 5
             and all(type(x) is int and x >= 0 for x in j['backupDirectory'])), 'journal_directory')

    def classify(self):
        out = {}
        for k, (path, mode, old, new) in TARGETS.items():
            raw, s = self.fs.read(path, mode, MAX_FILE); h = digest(raw)
            if h == old and s == self.j['original'][k]['stamp']: out[k] = 'old'
            elif h == new and 'new_' + k in self.j['resources'] and core(s) == core(self.j['resources']['new_' + k]['stamp']): out[k] = 'new'
            elif h == old and 'restore_' + k in self.j['resources'] and core(s) == core(self.j['resources']['restore_' + k]['stamp']): out[k] = 'restored'
            else: raise Blocked('unknown_target_inode_or_hash')
        need(out['policy'] != 'new' or (out['executor'] == 'new' and 'succession' in self.j['resources']), 'unknown_mixed_step')
        return out

    def inventory(self, states=None):
        need(not self.fs.exists(PENDING), 'unresolved_journal_temp')
        family = {n for n in self.fs.names(Path(JOURNAL).parent.as_posix()) if n.startswith('anvar-root-step')}
        need(family <= {Path(JOURNAL).name}, 'unknown_step_journal')
        family = {n for n in self.fs.names(Path(BACKUP).parent.as_posix()) if n.startswith('aktau-anvar-root-step')}
        need(family <= {Path(BACKUP).name}, 'unknown_step_backup')
        registered = {self.resource(k)[0] for k in (self.j['resources'] if self.j else {})}
        for path in {v[0] for v in TARGETS.values()}:
            parent = Path(path).parent.as_posix(); stem = '.' + Path(path).name + '.anvar-root-step.'
            need({parent + '/' + n for n in self.fs.names(parent) if n.startswith(stem)} <= registered, 'unknown_target_temp')
        if self.j is None:
            need(not self.fs.exists(BACKUP) and not self.fs.exists(SUCCESSION), 'orphan_step_resource'); return
        if 'succession' not in self.j['resources']: need(not self.fs.exists(SUCCESSION), 'unregistered_succession')
        if self.j['backupDirectory'] is None:
            need(not self.fs.exists(BACKUP), 'unregistered_backup_directory')
        else:
            with self.fs.directory(BACKUP) as d:
                need(stamp(os.fstat(d))[:5] == self.j['backupDirectory'] and stat.S_IMODE(os.fstat(d).st_mode) == 0o700, 'backup_directory_changed')
            need(self.fs.names(BACKUP) == {Path(self.resource(k)[0]).name for k in self.j['resources']
                 if self.resource(k)[0].startswith(BACKUP + '/')}, 'unknown_backup_resource')
        for k, rec in self.j['resources'].items():
            path, mode, h = self.resource(k)
            if self.fs.exists(path):
                raw, s = self.fs.read(path, mode, MAX_FILE)
                need(s == rec['stamp'] and digest(raw) == h, 'resource_changed')
            else:
                name = k.split('_', 1)[-1]
                need(states and ((k.startswith('new_') and states[name] in ['new', 'restored'])
                                 or (k.startswith('restore_') and states[name] == 'restored')), 'registered_resource_missing')

    def store(self, key, raw, phase, event):
        path, mode, h = self.resource(key)
        need(digest(raw) == h, 'resource_digest')
        st = self.fs.create(path, raw, mode); self.fault(event + '_unregistered')
        self.j['resources'][key] = {'stamp': st, 'sha256': h}; self.save(phase, event); self.inventory(self.classify())

    def clean(self):
        for path in [PENDING, PENDING + '.part', SUCCESSION + '.part']: self.fs.discard(path)
        for key in self.keys() - {'succession'}:
            path = self.resource(key)[0]
            if not path.startswith(BACKUP + '/') or self.fs.exists(BACKUP): self.fs.discard(path + '.part')

    def adopt(self):
        """A kill between create and registration leaves an exact pinned file. Anything else stays unknown."""
        if self.j['backupDirectory'] is None and self.fs.exists(BACKUP):
            need(self.fs.names(BACKUP) == set(), 'unknown_backup_resource')
            with self.fs.directory(BACKUP) as d: self.j['backupDirectory'] = stamp(os.fstat(d))[:5]
            self.save(self.j['phase'], 'adopt_backup')
        for k in sorted(self.keys() - set(self.j['resources'])):
            path, mode, h = self.resource(k)
            if self.j['backupDirectory'] is None and path.startswith(BACKUP + '/'): continue
            if self.fs.exists(path):
                raw, st = self.fs.read(path, mode, MAX_FILE); need(digest(raw) == h, 'unknown_unregistered_resource')
                self.j['resources'][k] = {'stamp': st, 'sha256': h}; self.save(self.j['phase'], 'adopt_' + k)

    def unchanged(self, baseline, policy):
        need(self.checks.snapshot(policy) == baseline, 'protected_window_changed')

    def space(self):
        for parent in {Path(v[0]).parent.as_posix() for v in TARGETS.values()} | {Path(BACKUP).parent.as_posix(), Path(JOURNAL).parent.as_posix()}:
            with self.fs.directory(parent) as d:
                space = os.fstatvfs(d)
                need(not getattr(space, 'f_flag', 0) & os.ST_RDONLY and space.f_bavail * space.f_frsize >= 8 << 20, 'insufficient_space')

    def run(self, mode):
        need(mode in ['verify', 'apply', 'recover', 'rollback'], 'fixed_mode')
        with self.fs.locks():
            if mode != 'verify': self.clean()
            if self.fs.exists(JOURNAL):
                self.load()
                if mode == 'apply': raise Blocked('existing_step_no_retry')
                if mode in ['recover', 'rollback']: self.adopt()
                states = self.classify(); self.inventory(states)
                if self.j['phase'] == 'rolled_back':
                    need('new' not in states.values(), 'rollback_step_changed'); return 'ANVAR_ROOT_STEP_ROLLED_BACK'
                if self.j['phase'] == 'verified' and mode in ['verify', 'recover']:
                    need(set(states.values()) == {'new'}, 'verified_step_changed'); return 'ANVAR_ROOT_STEP_VERIFIED'
                need(mode != 'verify', 'step_incomplete')
                policy = parse(self.fs.read(POLICY, 0o644)[0])
                self.unchanged(self.j['snapshot'], policy)
                return self.rollback(self.j['snapshot'], policy, states)
            need(mode in ['verify', 'apply'], 'recovery_journal_missing'); self.inventory()
            need(timer_clear(self.clock()), 'timer_window'); self.checks.preflight()
            approval = verify_approval(self.fs.read(APPROVAL, 0o400, 16384)[0], self.clock())
            original = {}; data = {}
            for k, (path, perm, h, _) in TARGETS.items():
                raw, s = self.fs.read(path, perm, MAX_FILE)
                need(digest(raw) == h, 'old_target_digest')
                data[k] = raw; original[k] = {'stamp': s, 'sha256': h}
            staged = {}
            for k, name in INPUTS.items():
                raw, _ = self.fs.read(INPUT + '/' + name, 0o400, MAX_FILE)
                need(digest(raw) == TARGETS[k][3], 'reviewed_input_digest')
                compile(raw, TARGETS[k][0], 'exec')  # syntax only, never executed here
                staged[k] = raw
            staged['policy'] = candidate(data['policy'], self.checks.validate_policy)
            policy = parse(data['policy']); baseline = self.checks.snapshot(policy)
            self.space()
            if mode == 'verify': return 'ANVAR_ROOT_STEP_READY'
            self.j = {'version': 1, 'id': ID, 'phase': 'intent', 'seq': 0, 'approvalSha256': approval,
                      'original': original, 'snapshot': baseline, 'backupDirectory': None, 'resources': {}}
            self.save('intent'); self.j['backupDirectory'] = self.fs.mkdir(BACKUP)
            self.save('backup_created', 'backup_directory'); self.inventory(self.classify())
            for k in TARGETS: self.store('old_' + k, data[k], 'backed_up', 'backup_' + k)
            self.fault('backup_complete')
            for k in TARGETS: self.store('new_' + k, staged[k], 'staged', 'stage_' + k)
            self.save('prepared'); self.inventory(self.classify()); self.unchanged(baseline, policy)
            for k, phase in [('pnpm', 'pnpm_replaced'), ('gate', 'gate_replaced'), ('executor', 'executor_replaced')]:
                self.replace(k, phase)
            self.store('succession', succession(approval), 'succession_written', 'succession')
            self.replace('policy', 'policy_replaced')
            self.inventory(self.classify()); self.unchanged(baseline, parse(staged['policy']))
            self.store('receipt', receipt(), 'receipt_written', 'receipt')
            states = self.classify(); need(set(states.values()) == {'new'}, 'final_step'); self.inventory(states)
            self.save('verified'); need(set(self.classify().values()) == {'new'}, 'final_step')
            return 'ANVAR_ROOT_STEP_VERIFIED'

    def replace(self, k, phase):
        path, perm, old, new = TARGETS[k]; slot = 'new_' + k
        # Original full inode/stamp CAS and pinned descriptor hash, not just a digest.
        self.fs.rename(self.resource(slot)[0], path, perm, self.j['resources'][slot]['stamp'], self.j['original'][k]['stamp'], new, old)
        self.fault(k + '_renamed'); self.save(phase)

    def rollback(self, baseline, policy, states):
        self.space()
        # Never run publisher --rollback-* here. Only this step's known backup domain.
        for k in TARGETS:
            if states[k] == 'new':
                need('old_' + k in self.j['resources'], 'backup_missing_for_restore')
                if 'restore_' + k not in self.j['resources']:
                    raw, _ = self.fs.read(self.resource('old_' + k)[0], 0o600, MAX_FILE)
                    self.store('restore_' + k, raw, 'rollback_prepared', 'restore_' + k)
        for k in ['policy', 'executor', 'gate', 'pnpm']:
            if states[k] == 'new':
                slot = 'restore_' + k; path, perm, old, new = TARGETS[k]
                raw, current = self.fs.read(path, perm, MAX_FILE)
                need(digest(raw) == new and core(current) == core(self.j['resources']['new_' + k]['stamp']), 'restore_cas')
                self.fs.rename(self.resource(slot)[0], path, perm, self.j['resources'][slot]['stamp'], current, old, new)
                self.fault('rollback_' + k + '_renamed'); self.save('rollback_' + k + '_replaced')
        states = self.classify(); need('new' not in states.values(), 'rollback_readback')
        self.unchanged(baseline, parse(self.fs.read(POLICY, 0o644)[0])); self.inventory(states)
        # The succession record stays: it is inert unless the current policy hash matches it.
        self.save('rolled_back'); return 'ANVAR_ROOT_STEP_ROLLED_BACK'


class ProductionChecks:
    def __init__(self, fs, p): self.fs, self.p = fs, p
    def validate_policy(self, v): self.p.validate_policy(v)

    def preflight(self):
        """Only before a new step: an administrator may stop timers during recovery."""
        for unit in ['aktau-sync.timer', 'aktau-sync-full.timer']:
            raw = self.p.command(['/usr/bin/systemctl', 'show', unit, '--property=ActiveState,UnitFileState', '--value'], timeout=5, cap=256)
            need(set(raw.decode().splitlines()) == {'active', 'enabled'}, 'timer_state')

    def snapshot(self, policy):
        """Everything this step must leave alone. The ledger may grow between runs, so it is excluded."""
        p = self.p; p.validate_policy(policy); pf = p.Filesystem(); host = p.Host(pf)
        host.idle()  # fixed status/pgrep, no service mutation
        publisher = host.publisher(); need(publisher['sha'] == BASE_SOURCE, 'publisher_baseline')
        need(host.verify_old_closure(policy), 'unaligned_old_closure')
        need(not os.path.lexists(p.INTERLOCK), 'promotion_interlock')
        raw = pf.read(SELECTION, 16384); selected = parse(raw)
        need(type(selected) is dict and selected.get('sourceSha') == BASE_SOURCE and selected.get('pipelineTreeSha1') == BASE_TREE
             and selected.get('inventorySha256') == BASE_INVENTORY and selected.get('provenanceKind') == 'github-artifact', 'selection_baseline')
        stable = {'publisher': publisher, 'selectionSha256': digest(raw), 'files': {}, 'units': {}}
        step = {TARGETS[k][0] for k in TARGETS}
        for target in [*[t for t in policy['runtimeFiles'] if t not in step], *p.FILES.values(), p.AUTH, p.AUTO, p.SITE]:
            stable['files'][target] = {'stamp': stamp(os.lstat(target)), 'sha256': digest(pf.read(target, 256 << 20))}
        stable['last'] = digest(pf.read(BASE + '/state/last.json', 16384))
        stable['releases'] = sorted(self.fs.names(BASE + '/releases'))
        for unit, role in [('aktau-sync.service', 'daily'), ('aktau-sync-full.service', 'weekly'), ('aktau-c2-custodian.service', 'c2')]:
            text = p.command(['/usr/bin/systemctl', 'show', unit, '--property=ExecStart', '--value'], timeout=5, cap=8192).decode()
            expected = '/usr/bin/python3 -I -B ' + ROOT + '/promotion-runtime-gate.py ' + role
            need(text.count('argv[]=') == 1 and 'argv[]=' + expected + ' ;' in text, 'loaded_wrapper')
            stable['units'][unit] = expected
        return {'stable': stable}


def main():
    need(len(sys.argv) == 2 and sys.argv[1] in ['--verify', '--apply', '--recover', '--rollback'], 'fixed_entry')
    fs = Filesystem()
    need(sys.flags.isolated and sys.dont_write_bytecode, 'isolated_python_required')
    need(str(Path(__file__).absolute()) == SELF, 'installed_helper_path')
    fs.read(SELF, 0o755)  # externally reviewed root helper custody, not caller-selected source
    raw, _ = fs.read(EXECUTOR, 0o755, MAX_FILE)
    need(digest(raw) in [OLD_EXECUTOR, NEW_EXECUTOR], 'installed_executor_digest')
    p = types.ModuleType('independently_pinned_executor'); p.__file__ = EXECUTOR
    exec(compile(raw, EXECUTOR, 'exec'), p.__dict__)
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(Blocked('helper_deadline'))); signal.alarm(120)
    for sig in [signal.SIGTERM, signal.SIGINT, signal.SIGHUP]:
        signal.signal(sig, lambda *_: (_ for _ in ()).throw(Blocked('helper_cancelled')))
    result = Step(fs, ProductionChecks(fs, p)).run(sys.argv[1][2:])
    print(json.dumps({'status': result, 'id': ID, 'promotionExecuted': False}))


if __name__ == '__main__':
    try: main()
    except BaseException as error:
        safe = str(error) if isinstance(error, Blocked) else type(error).__name__
        if not re.fullmatch('[A-Za-z_]{1,80}', safe): safe = 'helper_rejected'
        print(json.dumps({'status': 'BLOCKED', 'errorClass': safe})); sys.exit(1)
