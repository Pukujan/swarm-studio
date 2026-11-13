"""The Setup sheet's model picker, run in Hermes's own Python (server/setup.mjs; docs/specs/06-onboarding.md).

Models stay in Hermes. The studio's planner and builders are Hermes auxiliary slots (launcher.py SLOTS), so
the picker shows what Hermes Desktop's own picker shows and a pick sets those slots in Hermes's config:

- ``options_json()``  every provider Hermes knows, whether it is signed in, its models, and the two slots
- ``slots_json()``    the two slots as they are now, without their credentials

READ ONLY. Hermes has no public plugin API for its model list yet, so this reads it with the function its
dashboard and Desktop picker use (hermes_cli/web_routers/models.py ``/api/model/options``). Everything that
changes Hermes goes through its public CLI instead (server/setup.mjs: ``hermes config set``, ``hermes auth
add``). It runs as a short-lived process under the profile's HERMES_HOME, not in the gateway.
docs/engines/hermes-and-connections.md names it; tests/test_bridge.py keeps it read-only.
"""
from __future__ import annotations

import json
import sys

# role -> Hermes auxiliary slot (launcher.py SLOTS; registered in __init__.py)
SLOTS = {"planner": "swarm_studio_planner", "worker": "swarm_studio_builder"}
MAX_MODELS = 300
# what Hermes's own slot save drops when the provider changes (hermes_cli/config.py
# clear_model_endpoint_credentials, web_server_config.py _apply_aux_assignment_sync): never sent out of here
ENDPOINT = {"api_key", "api", "key_env", "api_key_env", "api_mode", "base_url"}


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


def _key_env(slug: str) -> str:
    """The environment name Hermes keeps this provider's key under (its provider registry)."""
    from hermes_cli.auth import PROVIDER_REGISTRY

    p = PROVIDER_REGISTRY.get(slug)
    names = list(getattr(p, "api_key_env_vars", None) or []) if p and getattr(p, "auth_type", "") == "api_key" else []
    return str(names[0]) if names else ""


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
        row = {"slug": slug, "name": str(r.get("name") or slug), "signedIn": signed, "sign": sign,
               "current": bool(r.get("is_current")), "models": models[:MAX_MODELS]}
        if sign == "key":
            row["keyEnv"] = _key_env(slug)
            if not row["keyEnv"]:
                continue  # no key name to save it under: Hermes's own setup covers it
        rows.append(row)
    return {"ok": True, "main": {"provider": str(payload.get("provider") or ""), "model": str(payload.get("model") or "")},
            "slots": _slots(load_config()), "providers": rows}


def slots_json() -> dict:
    """Each slot's provider and model, the settings a pick keeps (``keep``), and its endpoint only for a
    ``custom`` provider. Credentials never leave."""
    from hermes_cli.config import load_config

    cfg = load_config()
    aux = cfg.get("auxiliary") if isinstance(cfg.get("auxiliary"), dict) else {}
    out = {}
    for role, slot in SLOTS.items():
        s = aux.get(slot) if isinstance(aux.get(slot), dict) else {}
        keep = {k: v for k, v in s.items() if k not in ENDPOINT and k not in ("provider", "model") and isinstance(v, (str, int, float, bool))}
        out[role] = {"slot": slot, "provider": str(s.get("provider") or ""), "model": str(s.get("model") or ""), "keep": keep,
                     "base_url": str(s.get("base_url") or "") if str(s.get("provider") or "").lower() == "custom" else ""}
    return {"ok": True, "slots": out}
