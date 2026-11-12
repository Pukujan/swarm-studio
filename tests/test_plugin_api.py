"""The Desktop Studio page's route attaches the Hermes bridge of the process serving it, at once."""

import importlib.util
import sys
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_api():
    if "fastapi" not in sys.modules:  # the route module only needs APIRouter's decorators
        try:
            import fastapi  # noqa: F401
        except ImportError:
            fake = types.ModuleType("fastapi")
            fake.APIRouter = lambda: types.SimpleNamespace(get=lambda path: (lambda f: f))
            sys.modules["fastapi"] = fake
    spec = importlib.util.spec_from_file_location("swarm_studio_plugin_api_test", ROOT / "dashboard" / "plugin_api.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class StudioPageAttaches(unittest.TestCase):
    def setUp(self):
        self.api = load_api()
        self.calls = []
        self.api.launcher.ensure_server = lambda: (self.calls.append("ensure"), self.api.launcher._bridged({"running": True}))[1]

    def tearDown(self):
        sys.modules.pop("swarm_studio_fake_bridge", None)

    def fake_bridge(self, ctx):
        b = types.ModuleType("swarm_studio_fake_bridge")
        b.__file__ = str(ROOT / "bridge.py")
        b.CTX = ctx
        b.start = lambda: self.calls.append("start")
        sys.modules[b.__name__] = b

    def test_loaded_plugin_bridge_starts_when_the_page_opens(self):
        self.fake_bridge(ctx=object())
        self.assertEqual(self.api.canvas(), {"running": True})
        self.assertEqual(self.calls, ["ensure", "start"])

    def test_no_plugin_context_here_no_bridge(self):
        self.fake_bridge(ctx=None)  # bridge.py imported, but Hermes did not load the plugin in this process
        self.api.canvas()
        self.assertEqual(self.calls, ["ensure"])


if __name__ == "__main__":
    unittest.main()
