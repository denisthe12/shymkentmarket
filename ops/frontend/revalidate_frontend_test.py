import http.server
import io
import os
import tempfile
import threading
import unittest
from contextlib import redirect_stdout

import revalidate_frontend as r

# Same synthetic vector as backend-go/internal/revalidation/client_test.go and the frontend route test.
SECRET = 'part16-synthetic-test-secret-00000000'
VECTOR = 'v1=ce184df67d6068a4432905181f4a60b6365d1d8dc6e119cfdbc7a84892a31e4b'


class Handler(http.server.BaseHTTPRequestHandler):
    status = 204
    seen = []

    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length']))
        Handler.seen.append((self.path, dict(self.headers), body))
        self.send_response(Handler.status)
        if Handler.status in (301, 302, 307, 308):
            self.send_header('Location', 'https://example.invalid/internal/revalidate')
        self.send_header('Content-Length', '0')
        self.end_headers()

    def log_message(self, *args):
        pass


class RevalidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
        cls.url = 'http://127.0.0.1:%d/internal/revalidate' % cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Handler.status, Handler.seen = 204, []

    def env_file(self, text):
        f = tempfile.NamedTemporaryFile('w', suffix='.env', delete=False, encoding='utf-8')
        f.write(text)
        f.close()
        self.addCleanup(os.unlink, f.name)
        return f.name

    def run_main(self, text):
        out = io.StringIO()
        with redirect_stdout(out):
            code = r.main(['--env-file', self.env_file(text)])
        return code, out.getvalue()

    def test_signature_matches_go_and_frontend(self):
        self.assertEqual(r.signature(SECRET, '1700000000'), VECTOR)

    def test_signed_post_and_pass(self):
        code, out = self.run_main('# c\nAPP_ENV=test\nFRONTEND_REVALIDATE_URL=%s\nREVALIDATE_HMAC_SECRET="%s"\n'
                                  % (self.url, SECRET))
        self.assertEqual(code, 0)
        self.assertTrue(out.startswith('REVALIDATE_PASS host=127.0.0.1 status=204'))
        self.assertNotIn(SECRET, out)
        path, headers, body = Handler.seen[0]
        self.assertEqual((path, body), ('/internal/revalidate', r.BODY))
        ts = headers['X-Adilbaga-Timestamp']
        self.assertEqual(headers['X-Adilbaga-Signature'], r.signature(SECRET, ts))
        self.assertEqual(headers['User-Agent'], r.USER_AGENT)
        self.assertEqual(headers['Content-Type'], 'application/json')

    def test_rejected_and_redirect_fail(self):
        for status in (401, 400, 503, 200, 307):
            with self.subTest(status=status):
                Handler.status = status
                code, out = self.run_main('APP_ENV=test\nFRONTEND_REVALIDATE_URL=%s\nREVALIDATE_HMAC_SECRET=%s\n'
                                          % (self.url, SECRET))
                self.assertEqual(code, 1)
                self.assertEqual(out.strip(), 'REVALIDATE_FAIL status=%d' % status)

    def test_invalid_configuration_sends_nothing(self):
        cases = {
            'production http': 'APP_ENV=production\nFRONTEND_REVALIDATE_URL=%s\nREVALIDATE_HMAC_SECRET=%s\n' % (self.url, SECRET),
            'non-loopback http': 'APP_ENV=test\nFRONTEND_REVALIDATE_URL=http://example.com/internal/revalidate\nREVALIDATE_HMAC_SECRET=%s\n' % SECRET,
            'wrong path': 'APP_ENV=test\nFRONTEND_REVALIDATE_URL=%s/x\nREVALIDATE_HMAC_SECRET=%s\n' % (self.url, SECRET),
            'query': 'APP_ENV=test\nFRONTEND_REVALIDATE_URL=%s?a=1\nREVALIDATE_HMAC_SECRET=%s\n' % (self.url, SECRET),
            'short secret': 'APP_ENV=test\nFRONTEND_REVALIDATE_URL=%s\nREVALIDATE_HMAC_SECRET=short\n' % self.url,
            'no app env': 'FRONTEND_REVALIDATE_URL=%s\nREVALIDATE_HMAC_SECRET=%s\n' % (self.url, SECRET),
            'bad syntax': 'export APP_ENV=test\n',
        }
        for name, text in cases.items():
            with self.subTest(name=name):
                code, out = self.run_main(text)
                self.assertEqual(code, 1)
                self.assertTrue(out.startswith('REVALIDATE_FAIL'), out)
                self.assertNotIn(SECRET, out)
        self.assertEqual(Handler.seen, [])

    def test_missing_env_file(self):
        out = io.StringIO()
        with redirect_stdout(out):
            code = r.main(['--env-file', os.path.join(tempfile.gettempdir(), 'no-such-adilbaga.env')])
        self.assertEqual((code, out.getvalue().strip()), (1, 'REVALIDATE_FAIL env_unreadable'))


if __name__ == '__main__':
    unittest.main()
