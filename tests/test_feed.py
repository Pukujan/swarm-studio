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
            return self._send(200, {"ok": True, "viewer": {"name": "Comet Otter", "handle": "comet-otter-42", "credits": 100, "kind": StandIn.state.get("kind", "member")}, "identities": StandIn.state.get("identities", [{"provider": "hermes"}])}) if self._authed() \
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
            if s.get("small_limit") and len(json.dumps(body)) > 400:
                return self._send(413, {"ok": False, "code": "PAYLOAD_TOO_LARGE", "message": "too big"})
            if s.get("no_shots") and ("posterTall" in body or any("shot" in p or "phoneShot" in p for p in body.get("pages") or [])):
                return self._send(400, {"ok": False, "code": "BAD_REQUEST", "message": "unknown field shot"})
            if s.get("old_feed") and any(k in body for k in ("project", "into", "piece")):
                return self._send(400, {"ok": False, "code": "BAD_REQUEST", "message": "unknown field"})
            s.setdefault("posts", []).append(body)
            if body.get("into"):
                into = body["into"]
                if into not in s.get("heads", []):
                    return self._send(404, {"ok": False, "code": "NOT_FOUND", "message": "There is no such build."})
                s.setdefault("pieces", {}).setdefault(into, []).append(body["piece"])
                return self._send(200, {"ok": True, "id": into, "url": f"{base}/b/{into}", "uploadUrl": f"{base}/upload/{into}/{body['piece']['kind']}"})
            n = len(s["posts"])
            s.setdefault("heads", []).append(f"b_built0000{n}")
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

    def test_connected_status_says_when_the_profile_has_no_sign_in_of_its_own(self):
        self._connect()
        self.assertIn("/swarm login", feed.connect(["status"]))
        StandIn.state["identities"] = [{"provider": "hermes"}, {"provider": "google"}]
        try:
            self.assertNotIn("/swarm login", feed.connect(["status"]))
        finally:
            StandIn.state.pop("identities", None)
        self.assertEqual(oct(feed._settings_path().stat().st_mode & 0o777), "0o600")
        self.assertIn("100 credits", feed.connect([]))
        self.assertNotIn("sfp_test", feed.connect([]))  # the token is never shown
        self.assertIn("Forgot", feed.connect(["forget"]))
        self.assertNotIn("token", feed.load())

    def test_sign_in_goes_through_the_provider_before_the_code(self):
        opened = []
        feed._open, was = (lambda url: opened.append(url) or True), feed._open
        try:
            self.assertEqual(feed.sign_in("google"), {"ok": True})
        finally:
            feed._open = was
        base = os.environ["SWARM_FEED_URL"]
        self.assertEqual(opened, [f"{base}/auth/google?next=%2Flink%3Fcode%3DWXYZ-2345"])
        self.assertEqual(feed.load()["pending"]["provider"], "google")
        self.assertFalse(feed.sign_in("myspace")["ok"])
        self.assertEqual(feed.sign_in_step("check"), {"ok": True})
        self.assertNotIn("token", feed.load())
        StandIn.state["approved"] = True
        feed.sign_in_step("check")
        cfg = feed.load()
        self.assertEqual(cfg["token"], "sfp_test")
        self.assertFalse(cfg["guest"])

    def test_a_guest_link_is_marked_and_a_sign_in_replaces_it(self):
        StandIn.state["kind"] = "guest"
        self._connect()
        self.assertTrue(feed.load()["guest"])
        StandIn.state.update(kind="member", approved=False)
        out = feed.sign_in("github")
        self.assertIn("/auth/github?next=", out["message"])  # no browser here: the link to open
        self.assertNotIn("token", feed.load())
        self.assertEqual(feed.sign_in_step("cancel"), {"ok": True})
        self.assertNotIn("pending", feed.load())

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

    def _ares(self, rid, title, piece, url):
        return {"id": rid, "title": title, "kind": "app", "piece": piece, "brief": f"{title} — x", "project": {"id": "p-ares", "name": "ARES"},
                "sites": {"vercel": url}, "theme": {"colors": ["#000000", "#ff0000"]}}

    def test_project_posts_once_and_pieces_join_it(self):
        self._connect()
        site = self._ares("2026-11-11T03-32-37-133Z", "ARES — Boss Rush", "site", "https://ares-site.vercel.app/")
        out = feed.post(site, [], lambda rid: None)
        self.assertIn("Posted", out)
        first = StandIn.state["posts"][0]
        self.assertEqual(first["title"], "ARES")
        self.assertEqual(first["project"], {"name": "ARES"})
        self.assertNotIn("into", first)
        self.assertEqual(first["piece"]["kind"], "site")
        self.assertEqual(first["piece"]["runId"], site["id"])
        self.assertEqual(feed.load()["projects"], {"p-ares": "b_built00001"})
        app = self._ares("2026-11-11T03-33-59-295Z", "ARES Player Hub", "app", "https://ares-app.vercel.app/")
        got = feed.post_result(app, [], lambda rid: None)
        self.assertTrue(got["joined"])
        self.assertIn("Added “ARES Player Hub” to “ARES”", got["message"])
        body = StandIn.state["posts"][1]
        self.assertEqual(body["into"], "b_built00001")
        self.assertNotIn("project", body)
        self.assertEqual({k: body["piece"][k] for k in ("kind", "title", "liveUrl", "runId")},
                         {"kind": "app", "title": "ARES Player Hub", "liveUrl": "https://ares-app.vercel.app/", "runId": app["id"]})
        self.assertTrue(body["piece"]["poster"].startswith("data:image/"))
        self.assertEqual(len(StandIn.state["heads"]), 1)  # one Feed post for the whole project
        self.assertEqual(feed.load()["posted"][app["id"]], "b_built00001")

    def test_old_feed_falls_back_to_a_single_post(self):
        self._connect()
        StandIn.state["old_feed"] = True
        site = self._ares("2026-11-11T03-32-37-133Z", "ARES — Boss Rush", "site", "https://ares-site.vercel.app/")
        self.assertIn("Posted", feed.post(site, [], lambda rid: None))
        app = self._ares("2026-11-11T03-33-59-295Z", "ARES Player Hub", "app", "https://ares-app.vercel.app/")
        self.assertIn("Posted", feed.post(app, [], lambda rid: None))
        posts = StandIn.state["posts"]
        self.assertEqual(len(posts), 2)
        for body in posts:
            self.assertFalse({"project", "into", "piece"} & set(body))
            self.assertEqual(body["title"], "ARES")

    SHOT = "data:image/webp;base64,UklGRg=="

    def _shots(self, zip_path):
        return lambda rid: {"zip": str(zip_path), "pages": [
            {"file": "index.html", "path": "/", "shot": self.SHOT, "phoneShot": self.SHOT + "p"},
            {"file": "tickets.html", "path": "/tickets.html", "phoneShot": "javascript:alert(1)"}]}

    def test_post_sends_page_shots_and_a_tall_poster(self):
        self._connect()
        zip_path = Path(self.home.name) / "shots.zip"
        zip_path.write_bytes(ZIP)
        run = {"id": "2026-11-12T10-00-00-000Z", "title": "Lantern", "brief": "x", "pageTitles": ["Home", "Tickets", "About"],
               "sites": {"github": "https://me.github.io/lantern/"}}
        exported = []
        feed.post(run, [], lambda rid: exported.append(rid), self._shots(zip_path))
        body = StandIn.state["posts"][-1]
        self.assertEqual(body["pages"][0], {"slug": "home", "title": "Home", "path": "/", "shot": self.SHOT, "phoneShot": self.SHOT + "p"})
        self.assertEqual(body["pages"][1], {"slug": "tickets", "title": "Tickets", "path": "/tickets.html"})  # not a picture: dropped
        self.assertEqual(body["pages"][2], {"slug": "about", "title": "About"})
        self.assertEqual(body["posterTall"], self.SHOT + "p")
        self.assertEqual(exported, [])  # the shots' export is the one uploaded
        self.assertEqual(StandIn.state["uploads"][-1][1], ZIP)

    def test_feed_without_shots_still_gets_the_post(self):
        self._connect()
        StandIn.state["no_shots"] = True
        zip_path = Path(self.home.name) / "shots.zip"
        zip_path.write_bytes(ZIP)
        run = {"id": "2026-11-12T10-00-01-000Z", "title": "Lantern", "brief": "x", "pageTitles": ["Home"], "sites": {"github": "https://me.github.io/l/"}}
        self.assertIn("Posted", feed.post(run, [], lambda rid: None, self._shots(zip_path)))
        body = StandIn.state["posts"][-1]
        self.assertNotIn("posterTall", body)
        self.assertEqual(body["pages"], [{"slug": "home", "title": "Home", "path": "/"}])
        self.assertEqual(body["project"], {"name": "Lantern"})  # the project fields stay

    def test_post_over_the_feeds_body_limit_goes_without_shots(self):
        self._connect()
        StandIn.state["small_limit"] = True
        zip_path = Path(self.home.name) / "shots.zip"
        zip_path.write_bytes(ZIP)
        run = {"id": "2026-11-12T10-00-03-000Z", "title": "L", "brief": "x", "pageTitles": ["Home"], "sites": {"github": "https://me.github.io/n/"}}
        big = lambda rid: {"zip": str(zip_path), "pages": [{"path": "/", "shot": "data:image/webp;base64," + "A" * 2000}]}
        orig = feed.poster_of
        feed.poster_of = lambda r, folder: "data:image/png;base64,AA"
        try:
            self.assertIn("Posted", feed.post(run, [], lambda rid: None, big))
        finally:
            feed.poster_of = orig
        self.assertNotIn("shot", StandIn.state["posts"][-1]["pages"][0])

    def test_shots_failing_never_stops_a_post(self):
        self._connect()
        def broken(rid):
            raise RuntimeError("no browser")
        run = {"id": "2026-11-12T10-00-02-000Z", "title": "Lantern", "brief": "x", "pageTitles": ["Home"], "sites": {"github": "https://me.github.io/m/"}}
        self.assertIn("Posted", feed.post(run, [], lambda rid: None, broken))
        self.assertEqual(StandIn.state["posts"][-1]["pages"], [{"slug": "home", "title": "Home"}])

    def test_gone_project_build_starts_a_new_post(self):
        self._connect()
        feed._update(lambda c: c.setdefault("projects", {}).__setitem__("p-ares", "b_gone000001"))
        app = self._ares("2026-11-11T03-33-59-295Z", "ARES Player Hub", "app", "https://ares-app.vercel.app/")
        self.assertIn("Posted", feed.post(app, [], lambda rid: None))
        self.assertEqual(StandIn.state["posts"][-1]["project"], {"name": "ARES"})
        self.assertEqual(feed.load()["projects"]["p-ares"], "b_built00002")

    def test_screen_titles_never_name_a_post(self):
        self.assertTrue(feed.is_screen_name("Sign In to ARES"))
        self.assertFalse(feed.is_screen_name("ARES"))
        run = {"id": "r1", "title": "Sign In to ARES", "sites": {"vercel": "https://x.vercel.app/"}}
        self.assertEqual(feed.project_of(run), ("r1", "Swarm build"))
        self.assertEqual(feed.project_of({**run, "project": {"id": "p", "name": "ARES"}}), ("p", "ARES"))

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
