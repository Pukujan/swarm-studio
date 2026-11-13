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
import time
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

    def fake_hermes(self, multiplex=True):
        """A stand-in for Hermes's secret scope: on a multiplexed gateway a key read with no scope fails
        closed (agent/secret_scope.py get_secret), as NousResearch/hermes-agent#132887 reports."""
        import contextvars
        import types
        bound = contextvars.ContextVar("bound", default=None)
        homes = contextvars.ContextVar("home", default=None)
        scope = types.ModuleType("agent.secret_scope")
        scope.is_multiplex_active = lambda: multiplex
        scope.current_secret_scope = bound.get
        scope.build_profile_secret_scope = lambda home: {"MODEL_KEY": f"key-of:{home}"}
        scope.set_secret_scope = lambda mapping, profile_home=None: bound.set(mapping)

        def get_secret(name):
            if bound.get() is None and multiplex:
                raise RuntimeError("Hermes could not read this profile's MODEL_KEY (an internal profile-scoping bug)")
            return (bound.get() or {}).get(name, "from-env")
        scope.get_secret = get_secret
        agent = types.ModuleType("agent")
        agent.secret_scope = scope
        consts = types.ModuleType("hermes_constants")
        consts.get_hermes_home = lambda: Path(self.home)
        consts.set_hermes_home_override = homes.set
        patch = mock.patch.dict(sys.modules, {"agent": agent, "agent.secret_scope": scope, "hermes_constants": consts})
        patch.start()
        self.addCleanup(patch.stop)
        self.addCleanup(setattr, self.b, "HOME", None)
        return scope, bound, homes

    def test_a_model_call_reads_its_key_on_a_multiplexed_gateway(self):
        # Hermes Desktop multiplexes profiles: the bridge's own threads must carry the profile's keys
        scope, bound, homes = self.fake_hermes()
        self.b.keep_profile()
        self.assertEqual(self.b.HOME, Path(self.home))
        with self.assertRaises(RuntimeError):
            scope.get_secret("MODEL_KEY")  # what every studio model call hit before
        got = self.b.in_profile(lambda: (scope.get_secret("MODEL_KEY"), homes.get()))
        self.assertEqual(got, (f"key-of:{self.home}", Path(self.home)))
        self.assertIsNone(bound.get())  # bound for that call only, never left on the thread
        # a scope Hermes already bound (its own fix, hermes-agent#132898) is kept as it is
        token = bound.set({"MODEL_KEY": "hermes-bound"})
        self.assertEqual(self.b.in_profile(scope.get_secret, "MODEL_KEY"), "hermes-bound")
        bound.reset(token)

    def test_a_single_profile_hermes_is_left_alone(self):
        scope, bound, _ = self.fake_hermes(multiplex=False)
        self.b.keep_profile()
        self.assertEqual(self.b.in_profile(lambda: (scope.get_secret("MODEL_KEY"), bound.get())), ("from-env", None))
        self.b.HOME = None  # no Hermes home known (an older Hermes): the call runs as it is
        self.assertEqual(self.b.in_profile(lambda x: x + 1, 1), 2)

    def test_the_server_binds_the_profile_for_model_calls(self):
        scope, _, _ = self.fake_hermes()
        self.b.keep_profile()

        class Llm:
            def complete(self, messages, **_):
                return {"text": scope.get_secret("MODEL_KEY")}

        class Ctx:
            llm = Llm()
        self.b.CTX = Ctx()
        with mock.patch.object(self.b, "attach", return_value=False), mock.patch.object(self.b, "_attach_loop"):
            self.assertTrue(self.b.start())
        req = urllib.request.Request(self.b.url() + "/v1/chat/completions", method="POST",
                                     data=json.dumps({"model": "worker", "messages": [{"role": "user", "content": "Say ok"}]}).encode(),
                                     headers={"content-type": "application/json", "authorization": f"Bearer {self.b._token}"})
        with mock.patch.object(self.b.bridge_llm, "complete", lambda ctx, body, timeout=None: ctx.llm.complete(body["messages"])):
            with urllib.request.urlopen(req, timeout=5) as res:
                self.assertEqual(json.loads(res.read()), {"text": f"key-of:{self.home}"})

    def test_mcp_calls_go_through_ctx_call_mcp_and_a_missing_grant_gives_the_command(self):
        class Ctx:
            calls = []

            def call_mcp(self, server, tool, args=None, timeout=30):
                self.calls.append((server, tool, args, timeout))
                if server != "supabase":
                    raise PermissionError("not in mcp_allowlist")
                return {"ok": True, "result": "[]"}
        self.b.CTX = Ctx()
        self.assertEqual(self.b.mcp({"server": "supabase", "tool": "list_projects", "args": {"a": 1}, "timeout": 60}), {"ok": True, "result": "[]"})
        self.assertEqual(Ctx.calls[-1], ("supabase", "list_projects", {"a": 1}, 60.0))
        got = self.b.mcp({"server": "elevenlabs", "tool": "x", "granted": ["supabase"]})
        self.assertEqual((got["ok"], got["allowed"]), (False, False))
        self.assertEqual(got["allow"], "hermes config set plugins.entries.swarm-studio.mcp_allowlist '[\"elevenlabs\", \"supabase\"]'")
        self.assertFalse(self.b.mcp({"server": "a b", "tool": "x"})["ok"])

    def test_no_hermes_internals_and_no_allowlist_writes(self):
        """Point 5: the plugin uses only Hermes's public plugin API and CLI."""
        self.assertFalse((ROOT / "engine" / "hermes_mcp.py").exists())
        private = re.compile(r"^\s*(from|import)\s+(tools|hermes_cli)\b", re.M)
        for f in [*ROOT.glob("*.py"), *(ROOT / "engine").glob("*.py")]:
            self.assertIsNone(private.search(f.read_text("utf-8")), f.name)
        for f in [*(ROOT / "engine").glob("*.mjs"), ROOT / "server" / "server.mjs", *ROOT.glob("*.py")]:
            src = f.read_text("utf-8")
            self.assertIsNone(re.search(r"\[\s*'config'\s*,\s*'set'", src), f.name)
            self.assertNotIn("_mcp_envelope", src, f.name)
            self.assertNotIn("discover_mcp_tools", src, f.name)

    def test_attach_sends_the_code_this_process_loaded(self):
        # the server tells a Hermes on an older copy of the plugin from a current one (engine/hermeshealth.mjs)
        newest = max(f.stat().st_mtime for f in ROOT.glob("*.py"))
        self.assertAlmostEqual(self.b.LOADED, newest, delta=1)
        sent = []
        with mock.patch.object(self.b, "_server", mock.Mock(server_address=("127.0.0.1", 5999))), \
                mock.patch.object(self.b.launcher, "_request", side_effect=lambda path, **kw: sent.append((path, kw["body"])) or {}):
            self.assertTrue(self.b.attach())
        self.assertEqual(sent[0][0], "/api/hermes/attach")
        self.assertEqual(sent[0][1]["code"], self.b.LOADED)
        self.assertEqual(sent[0][1]["pid"], os.getpid())

    def test_a_server_that_comes_up_later_is_still_found(self):
        # Desktop's gateway loads the plugin long before anyone opens the Studio, and a server can be
        # restarted by another process: the bridge keeps looking until one answers, then attaches
        up = {"n": 0}
        started = []

        def state():
            up["n"] += 1
            return {"app": "swarm-studio"} if up["n"] >= 3 else None

        with mock.patch.object(self.b, "CTX", object()), \
                mock.patch.object(self.b, "running", side_effect=lambda: bool(started)), \
                mock.patch.object(self.b, "start", side_effect=lambda: started.append(1) or True), \
                mock.patch.object(self.b.launcher, "state", side_effect=state):
            self.b.start_later(delay=0, poll=0.01)
            for _ in range(200):
                if started:
                    break
                time.sleep(0.01)
        self.assertEqual(started, [1])
        self.assertEqual(up["n"], 3, "it looked until the server answered, then stopped looking")

    def test_the_command_line_says_why_a_build_was_refused(self):
        import io
        launcher = load_package().launcher
        body = {"error": "Hermes isn't connected. Open Hermes Desktop…", "code": "hermes_closed", "message": "Hermes isn't connected.", "action": "Open Hermes Desktop, or run `hermes swarm`, then try again.", "hermes": True}
        refused = urllib.error.HTTPError("http://127.0.0.1:1/api/run", 503, "Service Unavailable", {}, io.BytesIO(json.dumps(body).encode()))
        with mock.patch.object(launcher, "ensure_server", return_value={"running": True, "url": "http://127.0.0.1:1/"}), \
                mock.patch.object(launcher, "talk_first", return_value=False), \
                mock.patch.object(launcher, "_request", side_effect=refused):
            got = launcher.start_run("a site for a plant shop")
        self.assertEqual(got["error"], "Hermes isn't connected.")
        self.assertEqual(got["code"], "hermes_closed")
        self.assertIn("hermes swarm", got["action"])

    def test_register_wires_the_bridge(self):
        src = (ROOT / "__init__.py").read_text("utf-8")
        self.assertIn("bridge.CTX = ctx", src)
        self.assertIn("launcher.on_server = bridge.start", src)


if __name__ == "__main__":
    unittest.main()
