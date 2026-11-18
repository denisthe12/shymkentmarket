#!/usr/bin/env python3
"""Read-only status of the production VPS on one screen.

Run as root:  sudo python3 -I -B /usr/local/sbin/adilbaga-status

Reads only: /etc/adilbaga/release.env (the API_IMAGE tag), docker inspect/ps/images,
systemd unit properties, sync run files, the monitor state file, the last journal
lines of aktau-sync and aktau-go-monitor, GET http://127.0.0.1:8080/health/live,
/health/ready and /api/dashboard (snapshotAt only), df and /proc.
Never reads api.env, aktau-sync.env, telegram.env or any other secret; changes nothing.
Lines starting with "! " are warnings. Last line: RESULT=OK or RESULT=WARN n=<count>.
Exit 0 on OK, 1 on WARN, 2 on usage. Python stdlib only.
"""
import datetime as dt
import json
import os
import pwd
import re
import selectors
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

RELEASE_ENV = '/etc/adilbaga/release.env'
RUNS_DIR = '/var/lib/aktau-sync/runs'
MONITOR_STATE = '/var/lib/aktau-monitor/state/state.json'
SYNC_CHECKOUT = '/opt/aktau-sync'
GO_BIN = '/usr/local/go/bin/go'
GIT_BIN = '/usr/bin/git'
SYNC_USER = 'aktau-sync'
GIT_TIMEOUT = 15
GIT_STDOUT_LIMIT = 256 << 10
REBOOT_FLAG = '/var/run/reboot-required'
API = 'http://127.0.0.1:8080'
CONTAINER = 'adilbaga-api'
SERVICES = ('docker', 'cloudflared')
TIMERS = ('aktau-sync', 'aktau-sync-full', 'aktau-go-monitor', 'aktau-sync-report')
RUN_NAME = re.compile(r'^(daily|weekly)-\d{8}T\d{6}Z\.json$')
KEPT = re.compile(r'"?kept_count"?\s*[=:]\s*(\d+)')
DELETED = re.compile(r'"?deleted_count"?\s*[=:]\s*(\d+)')
INSPECT = ('{{.Config.Image}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}'
           '|{{.RestartCount}}|{{.State.StartedAt}}')

SNAPSHOT_MAX_AGE = 13 * 3600   # dailies at 01:00 and 13:00 UTC, about 3 min each
DAILY_MAX_AGE = 13 * 3600
RUN_STUCK = 25 * 60
MONITOR_MAX_AGE = 15 * 60      # timer every 5 min
DISK_WARN_PCT = 85
SHOWN_RUNS = 4
SYNC_EXIT = {1: 'not published', 3: 'published, some stores from the previous file',
             4: 'published, snapshot retention failed'}


class CheckoutUnavailable(Exception):
    """Bounded diagnostic for checkout inspection, without Git output."""


def checkout_git(args, uid, gid):
    deadline = time.monotonic() + GIT_TIMEOUT
    try:
        child = subprocess.Popen(
            [GIT_BIN, '--no-optional-locks', '-c', 'core.fsmonitor=false',
             '-c', 'core.hooksPath=/dev/null', '-C', SYNC_CHECKOUT, *args],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            cwd='/', user=uid, group=gid, extra_groups=(), start_new_session=True,
            close_fds=True, shell=False,
            env={'PATH': '/usr/bin:/bin', 'HOME': '/nonexistent', 'XDG_CONFIG_HOME': '/nonexistent',
                 'GIT_CONFIG_NOSYSTEM': '1', 'LC_ALL': 'C', 'TZ': 'UTC'},
        )
    except (OSError, ValueError, subprocess.SubprocessError):
        raise CheckoutUnavailable('could not start Git as aktau-sync') from None
    with child:
        complete = False
        try:
            data = bytearray()
            with selectors.DefaultSelector() as selector:
                selector.register(child.stdout, selectors.EVENT_READ)
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not selector.select(remaining):
                        raise CheckoutUnavailable('Git timed out')
                    chunk = os.read(child.stdout.fileno(), min(8192, GIT_STDOUT_LIMIT + 1 - len(data)))
                    if not chunk:
                        break
                    data.extend(chunk)
                    if len(data) > GIT_STDOUT_LIMIT:
                        raise CheckoutUnavailable('Git output exceeded limit')
            if child.wait(timeout=max(0, deadline - time.monotonic())) != 0:
                raise CheckoutUnavailable('Git failed as aktau-sync')
            complete = True
            return data.decode('utf-8', errors='replace')
        except subprocess.TimeoutExpired:
            raise CheckoutUnavailable('Git timed out') from None
        except OSError:
            raise CheckoutUnavailable('could not read Git result') from None
        finally:
            if not complete:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass


class Host:
    """All I/O in one place, so tests can replace it."""

    def run(self, cmd, timeout=15):
        # TZ=UTC: systemctl and journalctl print times in UTC like the rest of the report.
        env = dict(os.environ, TZ='UTC', LC_ALL='C')
        try:
            p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               universal_newlines=True, timeout=timeout, env=env)
            return p.returncode, p.stdout
        except FileNotFoundError:
            return 127, ''
        except subprocess.TimeoutExpired:
            return 124, ''

    def checkout(self):
        try:
            account = pwd.getpwnam(SYNC_USER)
        except (KeyError, OSError):
            raise CheckoutUnavailable('aktau-sync account unavailable') from None
        if account.pw_name != SYNC_USER or account.pw_uid <= 0 or account.pw_gid <= 0:
            raise CheckoutUnavailable('unsafe aktau-sync identity')
        if self.euid() != 0:
            raise CheckoutUnavailable('privileged launcher unavailable')
        head = checkout_git(('rev-parse', '--short', 'HEAD'), account.pw_uid, account.pw_gid).strip()
        if not re.fullmatch(r'[0-9a-f]{4,64}', head):
            raise CheckoutUnavailable('unexpected Git revision')
        dirty = checkout_git(('status', '--porcelain', '--untracked-files=no'),
                             account.pw_uid, account.pw_gid)
        return head, sum(bool(line.strip()) for line in dirty.splitlines())

    def read(self, path):
        with open(path, encoding='utf-8') as f:
            return f.read(1 << 20)

    def listdir(self, path):
        return os.listdir(path)

    def exists(self, path):
        return os.path.exists(path)

    def http(self, path, timeout=5):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        start = time.monotonic()
        try:
            with opener.open(urllib.request.Request(API + path, headers={'User-Agent': 'adilbaga-status'}),
                             timeout=timeout) as resp:
                body, status = resp.read(8 << 20), resp.status
        except urllib.error.HTTPError as e:
            body, status = b'', e.code
            e.close()
        except (urllib.error.URLError, OSError) as e:
            return None, type(getattr(e, 'reason', e)).__name__, 0
        return status, body, int((time.monotonic() - start) * 1000)

    def now(self):
        return time.time()

    def euid(self):
        return os.geteuid()

    def hostname(self):
        return socket.gethostname()


class Report:
    def __init__(self):
        self.lines, self.warns = [], []

    def head(self, title):
        self.lines.append('')
        self.lines.append('== ' + title)

    def line(self, text):
        self.lines.append(text)

    def warn(self, text):
        self.lines.append('! ' + text)
        self.warns.append(text)


def parse_time(value):
    """ISO UTC string (2026-11-15T13:03:12.000Z, nanoseconds allowed) -> epoch seconds or None."""
    if not isinstance(value, str) or len(value) < 19:
        return None
    try:
        t = dt.datetime.strptime(value[:19], '%Y-%m-%dT%H:%M:%S')
    except ValueError:
        return None
    return t.replace(tzinfo=dt.timezone.utc).timestamp()


def utc(ts):
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime('%Y-%m-%d %H:%MZ')


def age(seconds):
    s = max(0, int(seconds))
    if s < 3600:
        return '%dm' % (s // 60)
    if s < 86400:
        return '%dh%02dm' % (s // 3600, s % 3600 // 60)
    return '%dd%02dh' % (s // 86400, s % 86400 // 3600)


def tag(image):
    t = image.rpartition(':')[2] if ':' in image else image
    return t[:7] if re.fullmatch(r'[0-9a-f]{40}', t) else t


def systemd_props(h, unit, *props):
    cmd = ['systemctl', 'show', unit]
    for p in props:
        cmd += ['-p', p]
    rc, out = h.run(cmd)
    if rc != 0:
        return None
    vals = {}
    for line in out.splitlines():
        k, sep, v = line.partition('=')
        if sep:
            vals[k] = v.strip()
    return vals


def section_api(h, r):
    r.head('API')
    want = ''
    try:
        for line in h.read(RELEASE_ENV).splitlines():
            if line.startswith('API_IMAGE='):
                want = line.split('=', 1)[1].strip().strip('"\'')
    except OSError:
        r.warn('release.env unreadable (run with sudo)')
    rc, out = h.run(['docker', 'inspect', CONTAINER, '--format', INSPECT])
    if rc != 0 or not out.strip():
        r.warn('container %s not found (docker rc=%d)' % (CONTAINER, rc))
    else:
        image, state, health, restarts, started = (out.strip().split('|') + [''] * 5)[:5]
        r.line('release=%s container=%s state=%s health=%s restarts=%s started=%s' % (
            tag(want) or '?', tag(image), state, health or '-', restarts, started[:16].replace('T', ' ') + 'Z'))
        if want and image != want:
            r.warn('running image %s differs from release.env %s' % (tag(image), tag(want)))
        if state != 'running':
            r.warn('api container state=%s' % state)
        if health and health != 'healthy':
            r.warn('api container health=%s' % health)
        if restarts not in ('0', ''):
            r.warn('api container restarted %s times' % restarts)
    rc, out = h.run(['docker', 'images', 'adilbaga-api', '--format', '{{.Tag}}'])
    if rc == 0:
        tags = [t for t in out.split() if t]
        r.line('images kept=%d' % len(tags))
    for path in ('/health/live', '/health/ready'):
        status, _, ms = h.http(path)
        r.line('%s %s %dms' % (path, status if status is not None else 'error', ms))
        if status != 200:
            r.warn('%s answered %s' % (path, status if status is not None else 'no connection'))
    status, body, _ = h.http('/api/dashboard')
    snap = None
    if status == 200:
        try:
            snap = parse_time(json.loads(body)['summary']['snapshotAt'])
        except (ValueError, KeyError, TypeError):
            snap = None
    if snap is None:
        r.warn('snapshotAt not available from /api/dashboard (status %s)' % status)
    else:
        a = h.now() - snap
        r.line('snapshot=%s age=%s' % (utc(snap), age(a)))
        if a > SNAPSHOT_MAX_AGE:
            r.warn('published snapshot is %s old' % age(a))


def section_units(h, r):
    r.head('Services and timers')
    for svc in SERVICES:
        rc, out = h.run(['systemctl', 'is-active', svc])
        state = out.strip() or 'unknown'
        r.line('%s %s' % (svc, state))
        if state != 'active':
            r.warn('%s is %s' % (svc, state))
    for name in TIMERS:
        t = systemd_props(h, name + '.timer', 'ActiveState', 'LastTriggerUSec', 'NextElapseUSecRealtime')
        s = systemd_props(h, name + '.service', 'ActiveState', 'Result', 'ExecMainStatus')
        if t is None or s is None:
            r.warn('%s: systemctl show failed' % name)
            continue
        r.line('%s timer=%s last=%s next=%s service=%s result=%s exit=%s' % (
            name, t.get('ActiveState', '?'), t.get('LastTriggerUSec') or '-', t.get('NextElapseUSecRealtime') or '-',
            s.get('ActiveState', '?'), s.get('Result', '?'), s.get('ExecMainStatus', '?')))
        if t.get('ActiveState') != 'active':
            r.warn('%s.timer is %s' % (name, t.get('ActiveState', 'unknown')))
        if s.get('Result') not in ('success', None):
            r.warn('%s.service result=%s' % (name, s.get('Result')))


def read_runs(h):
    try:
        names = [n for n in h.listdir(RUNS_DIR) if RUN_NAME.match(n)]
    except OSError:
        return None
    runs = []
    for n in names:
        try:
            v = json.loads(h.read(RUNS_DIR + '/' + n))
        except (OSError, ValueError):
            continue
        if isinstance(v, dict) and v.get('kind') in ('daily', 'weekly') and parse_time(v.get('startedAt')):
            runs.append(v)
    # Newest first by start time: file names sort daily-* before weekly-* regardless of time.
    return sorted(runs, key=lambda v: parse_time(v['startedAt']), reverse=True)


def run_line(v):
    start, fin = parse_time(v.get('startedAt')), parse_time(v.get('finishedAt'))
    took = age(fin - start) if start and fin else '-'
    stores = v.get('stores') if isinstance(v.get('stores'), dict) else {}
    parts = ['%s %s %s exit=%s' % (v.get('kind'), utc(start), v.get('status'), v.get('exitCode'))]
    if 'published' in v:
        parts.append('published=%s' % str(v.get('published')).lower())
    parts.append('took=%s' % took)
    parts.append(' '.join('%s=%s' % (k, stores[k]) for k in sorted(stores)))
    if v.get('stale'):
        parts.append('stale=%s' % ','.join(v['stale']))
    if v.get('retention') is not None:
        parts.append('retention=%s' % v.get('retention'))
    return ' '.join(p for p in parts if p)


def section_sync(h, r):
    r.head('Sync')
    runs = read_runs(h)
    if runs is None:
        r.warn('run files unreadable in %s' % RUNS_DIR)
    else:
        for v in runs[:SHOWN_RUNS]:
            r.line(run_line(v))
        dailies = [v for v in runs if v.get('kind') == 'daily']
        if not dailies:
            r.warn('no daily run file')
        else:
            last = dailies[0]
            started = parse_time(last.get('startedAt'))
            code = last.get('exitCode')
            if last.get('status') == 'running':
                if h.now() - started > RUN_STUCK:
                    r.warn('daily run started %s is still running after %s' % (utc(started), age(h.now() - started)))
            elif code != 0:
                r.warn('last daily exit=%s (%s)' % (code, SYNC_EXIT.get(code, 'failed')))
            if h.now() - started > DAILY_MAX_AGE:
                r.warn('no daily run for %s' % age(h.now() - started))
    rc, out = h.run(['journalctl', '-u', 'aktau-sync.service', '--since', '-3d', '-o', 'cat', '--no-pager'], timeout=30)
    # cmd/prune logs one retention_complete line (JSON or key=value) with kept_count/deleted_count.
    kept = deleted = None
    failed = False
    if rc == 0:
        for line in out.splitlines():
            m = KEPT.search(line)
            if 'retention_complete' in line and m:
                kept = m.group(1)
                d = DELETED.search(line)
                deleted = d.group(1) if d else '?'
                failed = 'failure' in line
    if kept is None:
        r.warn('no retention_complete line in the aktau-sync journal for 3 days')
    elif failed:
        r.warn('last snapshot retention failed (see journalctl -u aktau-sync)')
    else:
        r.line('snapshots kept=%s deleted_last=%s' % (kept, deleted))
    try:
        head, changed = h.checkout()
    except CheckoutUnavailable as e:
        r.warn('sync checkout %s: %s' % (SYNC_CHECKOUT, e))
    else:
        r.line('checkout=%s changed_files=%s' % (head, changed))
        if changed:
            r.warn('sync checkout has %s changed tracked files' % changed)
    rc, out = h.run([GO_BIN, 'version'])
    r.line('go=%s' % (out.split()[2] if rc == 0 and len(out.split()) > 2 else 'unavailable'))


def section_monitor(h, r):
    r.head('Monitor')
    try:
        s = json.loads(h.read(MONITOR_STATE))
        phase, failures, last, queue = s['phase'], s.get('failures'), s.get('lastUTC'), s.get('queue', [])
        if not isinstance(queue, list):
            raise ValueError
    except (OSError, ValueError, KeyError, TypeError):
        r.warn('monitor state unreadable (%s)' % MONITOR_STATE)
    else:
        when = '-' if last is None else '%s (%s ago)' % (utc(last / 1000), age(h.now() - last / 1000))
        r.line('phase=%s failures=%s last=%s queued=%d' % (phase, failures, when, len(queue)))
        if phase != 'OK':
            r.warn('monitor phase=%s' % phase)
        if queue:
            r.warn('monitor has %d undelivered alert(s)' % len(queue))
        if last is None or h.now() - last / 1000 > MONITOR_MAX_AGE:
            r.warn('monitor has not run for %s' % ('ever' if last is None else age(h.now() - last / 1000)))
    # The monitor prints one JSON line per run; systemd adds Started/Finished lines around it.
    rc, out = h.run(['journalctl', '-u', 'aktau-go-monitor.service', '-n', '20', '-o', 'cat', '--no-pager'])
    lines = [l.strip() for l in out.splitlines() if l.strip().startswith('{')] if rc == 0 else []
    if lines:
        r.line('last output: ' + lines[-1][:200])


def section_host(h, r):
    r.head('Host')
    try:
        up = float(h.read('/proc/uptime').split()[0])
        load = ' '.join(h.read('/proc/loadavg').split()[:3])
        mem = {}
        for line in h.read('/proc/meminfo').splitlines():
            k, _, v = line.partition(':')
            mem[k] = int(v.split()[0]) if v.split() else 0
        r.line('uptime=%s load=%s mem_available=%dM/%dM' % (
            age(up), load, mem.get('MemAvailable', 0) // 1024, mem.get('MemTotal', 0) // 1024))
    except (OSError, ValueError, IndexError):
        r.warn('/proc unreadable')
    rc, out = h.run(['df', '-P', '-h', '/', '/var/lib/docker'])
    seen = set()
    for line in out.splitlines()[1:] if rc in (0, 1) else []:
        f = line.split()
        if len(f) < 6 or f[0] in seen:
            continue
        seen.add(f[0])
        r.line('disk %s used=%s size=%s avail=%s' % (f[5], f[4], f[1], f[3]))
        try:
            if int(f[4].rstrip('%')) >= DISK_WARN_PCT:
                r.warn('disk %s is %s full' % (f[5], f[4]))
        except ValueError:
            pass
    if not seen:
        r.warn('df failed')
    if h.exists(REBOOT_FLAG):
        try:
            pkgs = sorted(set(h.read(REBOOT_FLAG + '.pkgs').split()))
        except OSError:
            pkgs = []
        shown = ', '.join(pkgs[:6]) + (' +%d more' % (len(pkgs) - 6) if len(pkgs) > 6 else '')
        r.warn('reboot required%s' % (' by ' + shown if pkgs else ''))


SECTIONS = (section_api, section_units, section_sync, section_monitor, section_host)


def build(h):
    r = Report()
    r.line('ADILBAGA_STATUS host=%s at=%s' % (h.hostname(), utc(h.now())))
    if h.euid() != 0:
        r.warn('not root: run with sudo, some sections will be incomplete')
    for section in SECTIONS:
        try:
            section(h, r)
        except Exception as e:  # one broken section must not hide the others
            r.warn('%s crashed: %s' % (section.__name__, type(e).__name__))
    r.line('')
    if r.warns:
        r.line('== Warnings')
        for w in list(r.warns):
            r.line('- ' + w)
        r.line('RESULT=WARN n=%d' % len(r.warns))
    else:
        r.line('RESULT=OK')
    return r


def main(argv, host=None):
    if argv:
        print('usage: sudo python3 -I -B /usr/local/sbin/adilbaga-status', file=sys.stderr)
        return 2
    r = build(host or Host())
    print('\n'.join(r.lines))
    return 1 if r.warns else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
