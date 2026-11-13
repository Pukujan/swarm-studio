"""The Setup sheet's model picker (hermes_models.py), against fake Hermes modules.

It lists what Hermes lists, sets only the studio's two slots the way Hermes's own /api/model/set does, and
saves a key only for a provider whose sign-in is a key, through Hermes's own key store."""
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import hermes_models  # noqa: E402

PAYLOAD = {
    "provider": "inferhub", "model": "cb/flash",
    "providers": [
        {"slug": "inferhub", "name": "Inferhub", "authenticated": True, "is_current": True, "models": ["cb/flash", "cb/pro"], "featured_models": []},
        {"slug": "nous", "name": "Nous Portal", "authenticated": True, "auth_type": "oauth_device_code", "models": [{"id": "a"}, {"id": "b"}], "featured_models": [{"id": "b"}]},
        {"slug": "anthropic", "name": "Anthropic", "authenticated": False, "auth_type": "api_key", "models": []},
        {"slug": "minimax-oauth", "name": "MiniMax", "authenticated": False, "auth_type": "oauth_external", "models": []},
        {"slug": "vertex", "name": "Vertex", "authenticated": False, "auth_type": "vertex", "models": []},
        {"slug": "auto", "name": "Auto", "authenticated": True, "auth_type": "virtual", "models": ["x"]},
    ],
}


class Hermes:
    """hermes_cli.config / inventory / auth / credential_lifecycle, enough for the picker."""

    def __init__(self, cfg):
        self.cfg, self.saved, self.cleared, self.keys = cfg, None, [], []
        config = types.ModuleType("hermes_cli.config")
        config.load_config = lambda: self.cfg
        config.save_config = lambda c: setattr(self, "saved", json.loads(json.dumps(c)))
        config.clear_model_endpoint_credentials = lambda s: (self.cleared.append(dict(s)), s.pop("api_key", None))
        inventory = types.ModuleType("hermes_cli.inventory")
        inventory.load_picker_context = lambda: "ctx"
        inventory.build_model_options_payload = lambda ctx, include_unconfigured, refresh: PAYLOAD
        auth = types.ModuleType("hermes_cli.auth")
        auth.PROVIDER_REGISTRY = {
            "anthropic": types.SimpleNamespace(auth_type="api_key", api_key_env_vars=["ANTHROPIC_API_KEY"]),
            "nous": types.SimpleNamespace(auth_type="oauth_device_code", api_key_env_vars=[]),
        }
        cred = types.ModuleType("hermes_cli.credential_lifecycle")
        cred.save_provider_env_credential = lambda name, value: self.keys.append((name, value))
        self.modules = {"hermes_cli": types.ModuleType("hermes_cli"), "hermes_cli.config": config, "hermes_cli.inventory": inventory,
                        "hermes_cli.auth": auth, "hermes_cli.credential_lifecycle": cred}


class Picker(unittest.TestCase):
    def test_lists_what_hermes_lists(self):
        h = Hermes({"auxiliary": {"swarm_studio_planner": {"provider": "nous", "model": "b"}}})
        with mock.patch.dict(sys.modules, h.modules):
            o = hermes_models.options_json()
        self.assertEqual(o["main"], {"provider": "inferhub", "model": "cb/flash"})
        self.assertEqual(o["slots"]["planner"], {"provider": "nous", "model": "b"})
        self.assertEqual(o["slots"]["worker"], {"provider": "", "model": ""})
        rows = {r["slug"]: r for r in o["providers"]}
        # virtual rows and providers set up only in Hermes itself are left out
        self.assertEqual(sorted(rows), ["anthropic", "inferhub", "minimax-oauth", "nous"])
        self.assertEqual(rows["nous"]["models"], ["b", "a"])  # featured first
        self.assertEqual((rows["anthropic"]["sign"], rows["minimax-oauth"]["sign"], rows["inferhub"]["sign"]), ("key", "browser", ""))
        self.assertTrue(rows["inferhub"]["current"])

    def test_a_pick_sets_only_the_studio_slots(self):
        cfg = {"model": {"provider": "inferhub"}, "auxiliary": {"vision": {"provider": "x"},
               "swarm_studio_builder": {"provider": "custom", "model": "m", "base_url": "https://old", "api_key": "k"}}}
        h = Hermes(cfg)
        with mock.patch.dict(sys.modules, h.modules):
            r = hermes_models.pick_json("nous", "b")
        self.assertTrue(r["ok"])
        aux = h.saved["auxiliary"]
        self.assertEqual(aux["vision"], {"provider": "x"})
        self.assertEqual(h.saved["model"], {"provider": "inferhub"})
        for slot in ("swarm_studio_planner", "swarm_studio_builder"):
            self.assertEqual((aux[slot]["provider"], aux[slot]["model"]), ("nous", "b"))
        # a new provider drops the old endpoint and its key, as Hermes's own slot save does
        self.assertNotIn("base_url", aux["swarm_studio_builder"])
        self.assertNotIn("api_key", aux["swarm_studio_builder"])
        self.assertEqual(r["slots"]["worker"], {"provider": "nous", "model": "b"})
        self.assertFalse(hermes_models.pick_json("", "b")["ok"])

    def test_a_key_is_saved_only_where_a_key_is_the_sign_in(self):
        h = Hermes({})
        with mock.patch.dict(sys.modules, h.modules):
            with mock.patch.object(sys, "stdin", io.StringIO(json.dumps({"slug": "anthropic", "key": " sk-ant-x "}))):
                self.assertTrue(hermes_models.save_key_json()["ok"])
            with mock.patch.object(sys, "stdin", io.StringIO(json.dumps({"slug": "nous", "key": "x"}))):
                self.assertFalse(hermes_models.save_key_json()["ok"])
            with mock.patch.object(sys, "stdin", io.StringIO(json.dumps({"slug": "anthropic", "key": ""}))):
                self.assertFalse(hermes_models.save_key_json()["ok"])
        self.assertEqual(h.keys, [("ANTHROPIC_API_KEY", "sk-ant-x")])


if __name__ == "__main__":
    unittest.main()
