"""The Setup sheet's model picker (hermes_models.py), against fake Hermes modules.

It lists what Hermes lists and reads the studio's two slots without their credentials. It changes nothing:
picks go through Hermes's CLI (server/setup.mjs; tests/setup.test.mjs) and keys never reach the studio."""
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
    """hermes_cli.config / inventory / credential_lifecycle, enough for the picker (no hermes_cli.auth: it is not read)."""

    def __init__(self, cfg):
        self.cfg, self.saved, self.cleared, self.keys = cfg, None, [], []
        config = types.ModuleType("hermes_cli.config")
        config.load_config = lambda: self.cfg
        config.save_config = lambda c: setattr(self, "saved", json.loads(json.dumps(c)))
        config.clear_model_endpoint_credentials = lambda s: (self.cleared.append(dict(s)), s.pop("api_key", None))
        inventory = types.ModuleType("hermes_cli.inventory")
        inventory.load_picker_context = lambda: "ctx"
        inventory.build_model_options_payload = lambda ctx, include_unconfigured, refresh: PAYLOAD
        cred = types.ModuleType("hermes_cli.credential_lifecycle")
        cred.save_provider_env_credential = lambda name, value: self.keys.append((name, value))
        self.modules = {"hermes_cli": types.ModuleType("hermes_cli"), "hermes_cli.config": config, "hermes_cli.inventory": inventory,
                        "hermes_cli.credential_lifecycle": cred}


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

    def test_slots_without_their_credentials(self):
        cfg = {"auxiliary": {"swarm_studio_builder": {"provider": "custom", "model": "m", "base_url": "https://own", "api_key": "SECRET-1",
                                                      "key_env": "X", "api_mode": "chat", "timeout": 45, "extra_body": {"a": 1}},
                             "swarm_studio_planner": {"provider": "nous", "model": "b", "base_url": "https://n", "api_key": "SECRET-2"}}}
        h = Hermes(cfg)
        with mock.patch.dict(sys.modules, h.modules):
            s = hermes_models.slots_json()["slots"]
        self.assertEqual(s["worker"], {"slot": "swarm_studio_builder", "provider": "custom", "model": "m", "keep": {"timeout": 45}, "base_url": "https://own"})
        # an endpoint is kept only for a custom provider, and no key ever comes out
        self.assertEqual(s["planner"], {"slot": "swarm_studio_planner", "provider": "nous", "model": "b", "keep": {}, "base_url": ""})
        self.assertNotIn("SECRET", json.dumps(s))

    def test_a_key_provider_is_only_named_never_given_a_key(self):
        # the sheet shows `hermes auth add <slug> --type api-key`; nothing here knows or keeps a key name
        h = Hermes({})
        with mock.patch.dict(sys.modules, h.modules):
            rows = {r["slug"]: r for r in hermes_models.options_json()["providers"]}
        self.assertEqual(rows["anthropic"]["sign"], "key")
        self.assertFalse(any("keyEnv" in r for r in rows.values()))
        self.assertIsNone(h.saved)


if __name__ == "__main__":
    unittest.main()
