"""The Swarm Feed client (feed.py) against a stand-in feed on localhost.

Run: python3 -m unittest discover -s tests
The stand-in answers like swarm-feed's /api/feed routes (see docs/data-model.md
there); the real contract is also checked by hand against a local swarm-feed.
"""

from __future__ import annotations

import base64
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import feed  # noqa: E402  (loaded by path, as the dashboard does)

ZIP = io.BytesIO()
with zipfile.ZipFile(ZIP, "w") as z:
    z.writestr("html/index.html", "<h1>hi</h1>")
ZIP = ZIP.getvalue()


class StandIn(BaseHTTPRequestHandler):
    state: dict = {}

    def log_message(self, *a):  # quiet
        pass

    def _send(self, code: int, body: dict | bytes, kind: str = "application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("content-type", kind)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self) -> bytes:
        return self.rfile.read(int(self.headers.get("content-length") or 0))

    def _authed(self) -> bool:
        return self.headers.get("authorization") == "Bearer sfp_test"

    def do_GET(self):
        s, base = self.state, f"http://127.0.0.1:{self.server.server_port}"
        if self.path == "/api/feed/me":
            return self._send(200, {"ok": True, "viewer": {"name": "Comet Otter", "handle": "comet-otter-42", "credits": 100}}) if self._authed() \
                else self._send(401, {"ok": False, "code": "UNAUTHORIZED", "message": "Sign in."})
        if self.path == "/api/feed/builds/b_original01/bundle":
            return self._send(200, {"ok": True, "id": "b_original01", "title": "Tidebreak", "prompt": "a tide game", "maker": "maya", "bundleUrl": f"{base}/zip"})
        if self.path == "/zip":
            return self._send(200, ZIP, "application/zip")
        return self._send(404, {"ok": False, "code": "NOT_FOUND", "message": "There is no such build."})

    def do_POST(self):
        s, base = self.state, f"http://127.0.0.1:{self.server.server_port}"
        body = json.loads(self._body() or b"{}")
        if self.path == "/api/feed/device":
            s["clientId"] = body["clientId"]
            return self._send(200, {"ok": True, "deviceCode": "sfd_x", "userCode": "WXYZ-2345", "verificationUriComplete": f"{base}/link?code=WXYZ-2345", "expiresIn": 600, "interval": 5})
        if self.path == "/api/feed/device/token":
            if not s.get("approved"):
                return self._send(200, {"ok": False, "status": "pending", "interval": 5})
            return self._send(200, {"ok": True, "status": "approved", "token": "sfp_test", "handle": "comet-otter-42", "name": "Comet Otter"})
        if self.path == "/api/feed/builds":
            if not self._authed():
                return self._send(401, {"ok": False, "code": "UNAUTHORIZED", "message": "Send your token."})
            s.setdefault("posts", []).append(body)
            n = len(s["posts"])
            return self._send(200, {"ok": True, "id": f"b_built0000{n}", "url": f"{base}/b/b_built0000{n}", "uploadUrl": f"{base}/upload/b_built0000{n}"})
        if self.path == "/api/feed/login-link":
            return self._send(200, {"ok": True, "url": f"{base}/link?login=sfl_x", "expiresIn": 600}) if self._authed() else self._send(401, {"ok": False, "code": "UNAUTHORIZED", "message": "no"})
        return self._send(404, {"ok": False, "code": "NOT_FOUND", "message": "no route"})

    def do_PUT(self):
        self.state.setdefault("uploads", []).append((self.path, self._body()))
        return self._send(200, {"ok": True})


class FeedClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), StandIn)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.home = tempfile.TemporaryDirectory()
        os.environ["HERMES_HOME"] = cls.home.name
        os.environ["SWARM_FEED_URL"] = f"http://127.0.0.1:{cls.server.server_port}"
        feed._open = lambda url: False  # never a real browser
        feed._start_poller = lambda interval: None  # the tests poll by hand

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.home.cleanup()

    def setUp(self):
        StandIn.state.clear()
        path = feed._settings_path()
        if path.exists():
            path.unlink()

    def _connect(self):
        feed.connect([])
        StandIn.state["approved"] = True
        return feed.connect(["status"])

    def test_connect_device_flow(self):
        first = feed.connect([])
        self.assertIn("WXYZ-2345", first)
        self.assertRegex(StandIn.state["clientId"], r"^[A-Za-z0-9_-]{8,120}$")
        self.assertIn("Waiting for you", feed.connect(["status"]))
        StandIn.state["approved"] = True
        self.assertIn("Connected to the Swarm Feed as Comet Otter (@comet-otter-42)", feed.connect(["status"]))
        cfg = feed.load()
        self.assertEqual(cfg["token"], "sfp_test")
        self.assertNotIn("pending", cfg)
        self.assertEqual(oct(feed._settings_path().stat().st_mode & 0o777), "0o600")
        self.assertIn("100 credits", feed.connect([]))
        self.assertNotIn("sfp_test", feed.connect([]))  # the token is never shown
        self.assertIn("Forgot", feed.connect(["forget"]))
        self.assertNotIn("token", feed.load())

    def test_post_needs_connect_and_a_public_link(self):
        run = {"id": "2026-11-09T10-00-00-000Z", "title": "Lantern", "brief": "a lantern festival", "sites": {}}
        with self.assertRaises(feed.FeedError):
            feed.post(run, [], lambda rid: None)
        self._connect()
        with self.assertRaisesRegex(feed.FeedError, "Publish it first"):
            feed.post(run, [], lambda rid: None)

    def test_post_sends_the_build_and_its_files(self):
        self._connect()
        zip_path = Path(self.home.name) / "export.zip"
        zip_path.write_bytes(ZIP)
        run = {"id": "2026-11-09T10-00-00-000Z", "title": "Lantern", "kind": "site", "brief": "a lantern festival", "ms": 1200, "agents": 8,
               "pageTitles": ["Home", "Tickets", "Tickets"], "sites": {"local": "http://127.0.0.1:4319/site/x", "github": "https://me.github.io/lantern/"},
               "theme": {"colors": ["#120a24", "#ff4fa3"]}}
        out = feed.post(run, ["1", "--jam", "c-hermes01", "two", "nights"], lambda rid: str(zip_path))
        self.assertIn("Posted “Lantern”", out)
        body = StandIn.state["posts"][0]
        self.assertEqual(body["liveUrl"], "https://me.github.io/lantern/")
        self.assertEqual(body["jamId"], "c-hermes01")
        self.assertEqual(body["caption"], "two nights")
        self.assertEqual([p["slug"] for p in body["pages"]], ["home", "tickets", "tickets-3"])
        self.assertEqual(body["crew"][0], {"name": "Hermia", "role": "commander"})
        self.assertTrue(body["poster"].startswith("data:image/png;base64,"))
        self.assertEqual(base64.b64decode(body["poster"].split(",", 1)[1])[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(StandIn.state["uploads"], [("/upload/b_built00001", ZIP)])
        self.assertIn("already in the feed", feed.post(run, ["1"], lambda rid: None))
        self.assertIn("Posted", feed.post(run, ["1", "--again"], lambda rid: None))
        self.assertNotIn("visibility", StandIn.state["posts"][0])
        got = feed.post_result(run, ["1", "--again", "--unlisted"], lambda rid: None)
        self.assertTrue(got["ok"] and got["unlisted"] and got["url"])
        self.assertEqual(StandIn.state["posts"][-1]["visibility"], "unlisted")
        self.assertNotIn("--unlisted", StandIn.state["posts"][-1].get("caption", ""))

    def test_remix_starts_a_run_and_links_the_post(self):
        self._connect()
        briefs = []
        out = feed.remix(["https://swarm.design-bakery.com/b/b_original01", "make", "it", "winter"],
                         lambda brief: briefs.append(brief) or {"run": "2026-11-10T00-00-00-000Z", "url": "http://127.0.0.1:4319/"})
        self.assertIn("Remixing “Tidebreak” by @maya", out)
        self.assertEqual(briefs, ["a tide game\n\nRemix: make it winter"])
        self.assertTrue(zipfile.is_zipfile(feed.launcher.data_dir() / "remix" / "b_original01" / "original.zip"))
        run = {"id": "2026-11-10T00-00-00-000Z", "title": "Winter tide", "brief": "x", "sites": {"vercel": "https://winter.vercel.app/"}}
        feed.post(run, [], lambda rid: None)
        self.assertEqual(StandIn.state["posts"][-1]["parentId"], "b_original01")
        self.assertIn("not a feed build id", feed.remix(["nope"], lambda b: {}))

    def test_login_link(self):
        with self.assertRaisesRegex(feed.FeedError, "/swarm connect"):
            feed.login()
        self._connect()
        self.assertIn("/link?login=sfl_x", feed.login())

    def test_parse_post_args(self):
        self.assertEqual(feed.parse_post_args(["3", "--jam", "c-abc123", "hello", "there"]), ("3", "c-abc123", "hello there", False))
        self.assertEqual(feed.parse_post_args(["--again"]), ("", "", "", True))
        with self.assertRaisesRegex(feed.FeedError, "not a jam id"):
            feed.build_payload({"id": "r", "title": "t", "sites": {"github": "https://x.io/"}}, jam="bad id")


if __name__ == "__main__":
    unittest.main()
