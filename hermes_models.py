"""The Setup sheet's model picker, run in Hermes's own Python (server/setup.mjs; docs/specs/06-onboarding.md).

Models stay in Hermes. The studio's planner and builders are Hermes auxiliary slots (launcher.py SLOTS), so
the picker shows what Hermes Desktop's own picker shows and a pick sets those slots in Hermes's config:

- ``options_json()``   every provider Hermes knows, whether it is signed in, its models, and the two slots
- ``pick_json(p, m)``  sets the planner and builder slots to provider ``p`` and model ``m``
- ``save_key_json()``  saves a provider's API key, read from stdin as JSON (never an argument)

Hermes has no public plugin API for its model list or for its slots yet, so this calls the same functions
its dashboard and Desktop picker call (hermes_cli/web_routers/models.py ``/api/model/options`` and
``/api/model/set``; tui_gateway/methods_complete.py ``model.save_key``). It runs as a short-lived process
under the profile's HERMES_HOME, not in the gateway. docs/engines/hermes-and-connections.md names it.
"""
from __future__ import annotations

import json
import sys

# role -> Hermes auxiliary slot (launcher.py SLOTS; registered in __init__.py)
SLOTS = {"planner": "swarm_studio_planner", "worker": "swarm_studio_builder"}
MAX_MODELS = 300


def _sign(auth_type) -> str:
    """How a provider signs in from the sheet: a pasted key, the browser, or only in Hermes itself."""
    kind = str(auth_type or "")
    if kind == "api_key":
        return "key"
    if kind.startswith("oauth"):
        return "browser"
    return ""


def _ids(models) -> list:
    out = []
    for m in models or []:
        mid = m if isinstance(m, str) else (m or {}).get("id")
        if mid and mid not in out:
            out.append(str(mid))
    return out


def _slots(cfg: dict) -> dict:
    aux = cfg.get("auxiliary") if isinstance(cfg.get("auxiliary"), dict) else {}
    out = {}
    for role, slot in SLOTS.items():
        s = aux.get(slot) if isinstance(aux.get(slot), dict) else {}
        out[role] = {"provider": str(s.get("provider") or ""), "model": str(s.get("model") or "")}
    return out


def options_json(refresh: bool = False) -> dict:
    from hermes_cli.config import load_config
    from hermes_cli.inventory import build_model_options_payload, load_picker_context

    payload = build_model_options_payload(load_picker_context(), include_unconfigured=True, refresh=bool(refresh))
    rows = []
    for r in payload.get("providers") or []:
        slug = str(r.get("slug") or "")
        if not slug or r.get("auth_type") == "virtual":
            continue
        signed = bool(r.get("authenticated"))
        sign = "" if signed else _sign(r.get("auth_type"))
        if not signed and not sign:
            continue  # set up only in Hermes itself (cloud consoles, local servers)
        featured = _ids(r.get("featured_models"))
        models = featured + [m for m in _ids(r.get("models")) if m not in featured]
        rows.append({"slug": slug, "name": str(r.get("name") or slug), "signedIn": signed, "sign": sign,
                     "current": bool(r.get("is_current")), "models": models[:MAX_MODELS]})
    return {"ok": True, "main": {"provider": str(payload.get("provider") or ""), "model": str(payload.get("model") or "")},
            "slots": _slots(load_config()), "providers": rows}


def pick_json(provider: str, model: str) -> dict:
    """The planner and builder slots -> provider/model, as Hermes's own /api/model/set saves a slot."""
    provider, model = str(provider or "").strip(), str(model or "").strip()
    if not provider or not model:
        return {"ok": False, "message": "Pick a model."}
    from hermes_cli.config import clear_model_endpoint_credentials, load_config, save_config

    cfg = load_config()
    aux = cfg.get("auxiliary") if isinstance(cfg.get("auxiliary"), dict) else {}
    for slot in SLOTS.values():
        s = aux.get(slot) if isinstance(aux.get(slot), dict) else {}
        prev = str(s.get("provider") or "").strip().lower()
        s["provider"], s["model"] = provider, model
        if provider.lower() != prev and provider.lower() != "custom":
            s.pop("base_url", None)
            clear_model_endpoint_credentials(s)
        aux[slot] = s
    cfg["auxiliary"] = aux
    save_config(cfg)
    return {"ok": True, "slots": _slots(cfg)}


def save_key_json() -> dict:
    """{slug, key} on stdin -> the key saved where Hermes keeps it (model.save_key's own path)."""
    from hermes_cli.auth import PROVIDER_REGISTRY
    from hermes_cli.credential_lifecycle import save_provider_env_credential

    try:
        body = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        body = {}
    slug, key = str(body.get("slug") or "").strip(), str(body.get("key") or "").strip()
    if not slug or not key:
        return {"ok": False, "message": "Paste the key."}
    pconfig = PROVIDER_REGISTRY.get(slug)
    if not pconfig or pconfig.auth_type != "api_key" or not pconfig.api_key_env_vars:
        return {"ok": False, "message": "This provider signs in another way."}
    save_provider_env_credential(pconfig.api_key_env_vars[0], key)
    return {"ok": True}
