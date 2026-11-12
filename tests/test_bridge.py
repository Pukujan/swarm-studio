"""Pictures and clips go through Hermes's own tools, by way of the bridge (Nous catalog review, point 1).

No Hermes .env is loaded, no Hermes plugin is run by the studio, and the bridge only answers a loopback,
token-holding, non-browser caller."""
import base64
import importlib.util
import json
import os
import re
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def load_package():
    if "swarm_studio_t" in sys.modules:
        return sys.modules["swarm_studio_t"]
    spec = importlib.util.spec_from_file_location("swarm_studio_t", ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
    pkg = importlib.util.module_from_spec(spec)
    sys.modules["swarm_studio_t"] = pkg
    spec.loader.exec_module(pkg)
    return pkg


class FakeCtx:
    def __init__(self, answer):
        self.answer, self.calls = answer, []

    def dispatch_tool(self, name, args, **_):
        self.calls.append((name, args))
        return json.dumps(self.answer(name, args)) if callable(self.answer) else json.dumps(self.answer)


class Bridge(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp()
        os.environ["HERMES_HOME"] = self.home
        self.b = load_package().bridge
        self.b._missing.update(image=False, video=False)

    def test_no_hermes_env_and_no_hermes_plugins_are_loaded(self):
        for f in ROOT.glob("*.py"):
            src = f.read_text("utf-8")
            self.assertNotIn("load_hermes_dotenv", src, f.name)
            self.assertIsNone(re.search(r"plugins\W+(image_gen|video_gen)", src), f.name)
            self.assertNotIn("exec_module", src.replace("spec.loader.exec_module(pkg)", ""), f.name)
        for gone in ("imagegen.py", "videogen.py"):
            self.assertFalse((ROOT / gone).exists(), gone)
        server = (ROOT / "server" / "server.mjs").read_text("utf-8")
        self.assertNotIn("imagegen.py", server)
        self.assertNotIn("videogen.py", server)
        self.assertNotIn("FAL_KEY", server)
        launcher = (ROOT / "launcher.py").read_text("utf-8")
        self.assertNotIn('"FAL_KEY"', launcher)

    def test_a_picture_is_hermes_image_generate(self):
        src = Path(self.home) / "made.png"
        src.write_bytes(PNG)
        ctx = FakeCtx({"success": True, "image": str(src), "model": "m1"})
        self.b.CTX = ctx
        got = self.b.image({"prompt": "a fern", "aspect": "portrait", "refs": ["/a.png", "/b.png"], "edit": True})
        self.assertTrue(got["ok"], got)
        self.assertEqual(ctx.calls, [("image_generate", {"prompt": "a fern", "aspect_ratio": "portrait", "image_url": "/a.png", "reference_image_urls": ["/b.png"]})])
        self.assertTrue(Path(got["path"]).is_file())
        self.assertTrue(str(got["path"]).startswith(self.home), "the picture is a copy of our own")
        # references without --edit stay references; an unknown aspect is landscape
        self.b.image({"prompt": "x", "aspect": "21:9", "refs": ["/a.png"]})
        self.assertEqual(ctx.calls[-1][1], {"prompt": "x", "aspect_ratio": "landscape", "reference_image_urls": ["/a.png"]})

    def test_a_data_url_picture_is_saved(self):
        self.b.CTX = FakeCtx({"success": True, "image": "data:image/png;base64," + base64.b64encode(PNG).decode()})
        got = self.b.image({"prompt": "x"})
        self.assertTrue(got["ok"] and Path(got["path"]).is_file(), got)

    def test_a_failure_comes_back_as_an_error_and_a_missing_backend_turns_media_off(self):
        self.b.CTX = FakeCtx({"success": False, "error": "No image backend", "error_type": "no_provider_configured"})
        got = self.b.image({"prompt": "x"})
        self.assertEqual(got, {"ok": False, "error": "No image backend"})
        self.assertEqual(self.b.media(), {"image": {"available": False}, "video": {"available": True}})
        self.assertEqual(self.b.image({"prompt": ""})["ok"], False)

    def test_a_clip_is_hermes_video_generate_from_the_still(self):
        still = Path(self.home) / "still.png"
        still.write_bytes(PNG)
        made = Path(self.home) / "clip-src.mp4"
        made.write_bytes(b"mp4")
        ctx = FakeCtx({"success": True, "video": str(made), "model": "veo"})
        self.b.CTX = ctx
        got = self.b.video({"prompt": "slow push in", "image": str(still), "seconds": 6, "aspect": "9:16"})
        self.assertTrue(got["ok"], got)
        name, args = ctx.calls[0]
        self.assertEqual(name, "video_generate")
        self.assertTrue(args["image_url"].startswith("data:image/png;base64,"))
        self.assertEqual((args["duration"], args["aspect_ratio"]), (6, "9:16"))
        self.assertEqual(Path(got["path"]).read_bytes(), b"mp4")
        # not a picture: refused before Hermes is asked
        self.assertFalse(self.b.video({"prompt": "x", "image": str(made)})["ok"])
        self.assertEqual(len(ctx.calls), 1)

    def test_only_a_loopback_token_holder_that_is_not_a_web_page_gets_in(self):
        ok = {"Host": "127.0.0.1:5555", "Authorization": "Bearer s3cret-token-0123456789"}
        self.assertTrue(self.b.allowed(ok, "s3cret-token-0123456789"))
        self.assertFalse(self.b.allowed({**ok, "Authorization": "Bearer wrong"}, "s3cret-token-0123456789"))
        self.assertFalse(self.b.allowed({**ok, "Origin": "https://evil.example"}, "s3cret-token-0123456789"))
        self.assertFalse(self.b.allowed({**ok, "Host": "evil.example:5555"}, "s3cret-token-0123456789"))
        self.assertFalse(self.b.allowed({"Host": "127.0.0.1"}, ""))

    def test_the_server_end_to_end(self):
        src = Path(self.home) / "made.png"
        src.write_bytes(PNG)
        self.b.CTX = FakeCtx({"success": True, "image": str(src)})
        with mock.patch.object(self.b, "attach", return_value=False), mock.patch.object(self.b, "_attach_loop"):
            self.assertTrue(self.b.start())
        url, token = self.b.url(), self.b._token
        self.assertRegex(url, r"^http://127\.0\.0\.1:\d+$")

        def post(path, body, headers):
            req = urllib.request.Request(url + path, data=json.dumps(body).encode(), method="POST", headers={"content-type": "application/json", **headers})
            try:
                with urllib.request.urlopen(req, timeout=5) as res:
                    return res.status, json.loads(res.read())
            except urllib.error.HTTPError as err:
                return err.code, json.loads(err.read())

        code, got = post("/image", {"prompt": "x"}, {"authorization": f"Bearer {token}"})
        self.assertEqual(code, 200)
        self.assertTrue(got["ok"], got)
        self.assertEqual(post("/image", {"prompt": "x"}, {})[0], 403)
        self.assertEqual(post("/image", {"prompt": "x"}, {"authorization": f"Bearer {token}", "origin": "http://127.0.0.1:4319"})[0], 403)
        self.assertEqual(post("/nope", {}, {"authorization": f"Bearer {token}"})[0], 404)
        # the token is never written anywhere
        for f in Path(self.home).rglob("*"):
            if f.is_file():
                self.assertNotIn(token.encode(), f.read_bytes(), f)

    def test_register_wires_the_bridge(self):
        src = (ROOT / "__init__.py").read_text("utf-8")
        self.assertIn("bridge.CTX = ctx", src)
        self.assertIn("launcher.on_server = bridge.start", src)


if __name__ == "__main__":
    unittest.main()
