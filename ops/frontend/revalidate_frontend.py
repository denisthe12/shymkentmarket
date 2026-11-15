#!/usr/bin/env python3
"""Flush the frontend server data cache (Next.js tag catalog-data) after an API release.

Sends the same signed event as ingest after a snapshot publication
(backend-go/internal/revalidation/client.go): POST FRONTEND_REVALIDATE_URL with
X-Adilbaga-Timestamp and X-Adilbaga-Signature = v1=HMAC-SHA256(secret, "<ts>.<body>").
URL and secret come from the sync env file (default /etc/aktau-sync.env, readable by root).
Prints one line REVALIDATE_PASS or REVALIDATE_FAIL <reason>; never prints the secret,
headers or response body. Python stdlib only. Exit 0 on HTTP 204, 1 otherwise.
"""
import hashlib
import hmac
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BODY = b'{"event":"snapshot_published"}'
DEFAULT_ENV = '/etc/aktau-sync.env'
USER_AGENT = 'adilbaga-release-revalidate'
LOOPBACK = {'127.0.0.1', 'localhost', '::1'}


class Fail(Exception):
    pass


def signature(secret, timestamp):
    mac = hmac.new(secret.encode(), timestamp.encode() + b'.' + BODY, hashlib.sha256)
    return 'v1=' + mac.hexdigest()


def read_env(path):
    # Simple dotenv lines KEY=value only; nothing is evaluated.
    try:
        with open(path, encoding='utf-8') as f:
            raw = f.read()
    except OSError:
        raise Fail('env_unreadable')
    out = {}
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, sep, value = line.partition('=')
        if not sep or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
            raise Fail('env_syntax')
        out[key] = value.strip().strip('"\'')
    return out


def endpoint(env):
    url = env.get('FRONTEND_REVALIDATE_URL', '')
    secret = env.get('REVALIDATE_HMAC_SECRET', '')
    app_env = env.get('APP_ENV', '')
    u = urllib.parse.urlsplit(url)
    if app_env not in ('production', 'test', 'development'):
        raise Fail('app_env')
    loopback_http = app_env != 'production' and u.scheme == 'http' and u.hostname in LOOPBACK
    if (u.scheme != 'https' and not loopback_http) or not u.hostname or u.username or u.password \
            or u.query or u.fragment or u.path != '/internal/revalidate':
        raise Fail('url_invalid')
    if len(secret.encode()) < 32:
        raise Fail('secret_invalid')
    return url, secret


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def notify(url, secret, now=time.time, timeout=10):
    timestamp = str(int(now()))
    request = urllib.request.Request(url, data=BODY, method='POST', headers={
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Adilbaga-Timestamp': timestamp,
        'X-Adilbaga-Signature': signature(secret, timestamp),
    })
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(request, timeout=timeout) as response:
            response.read(1024)
            status = response.status
    except urllib.error.HTTPError as e:
        status = e.code
        e.close()
    except (urllib.error.URLError, OSError) as e:
        raise Fail('transport ' + type(getattr(e, 'reason', e)).__name__)
    if status != 204:
        raise Fail('status=%d' % status)
    return status


def main(argv):
    path = DEFAULT_ENV
    if len(argv) == 2 and argv[0] == '--env-file':
        path = argv[1]
    elif argv:
        print('usage: revalidate_frontend.py [--env-file PATH]', file=sys.stderr)
        return 2
    try:
        url, secret = endpoint(read_env(path))
        status = notify(url, secret)
    except Fail as e:
        print('REVALIDATE_FAIL', e)
        return 1
    print('REVALIDATE_PASS host=%s status=%d' % (urllib.parse.urlsplit(url).hostname, status))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
