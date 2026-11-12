"""Model calls for the canvas server, through Hermes's own ``ctx.llm`` (Nous catalog review, point 2).

The bridge (bridge.py) answers ``POST /v1/chat/completions`` and ``GET /v1/models`` with this module, so
the studio's planner, builders and reviewer, and the app engine, speak plain OpenAI chat completions to a
loopback address while the provider, the model and the key stay inside Hermes
(docs/specs/33-hermes-bridge.md).

- ``model`` names the role: ``planner``, ``worker`` or ``reviewer`` (the plugin's auxiliary tasks). A
  model the person picked in the studio rides along as ``role:model`` and is passed to ``ctx.llm`` only
  when the operator granted ``plugins.entries.swarm-studio.llm.allow_model_override``; without the grant
  the slot's own model answers.
- ``ctx.llm`` does not stream: with ``stream: true`` the whole answer goes out as one SSE delta, then a
  usage chunk and ``[DONE]``.
- ``ctx.llm`` has no tool calls: the request's ``tools`` are described in the system prompt, the model
  answers with ``<tool_call>{"name": …, "arguments": {…}}</tool_call>`` blocks, and those come back as
  OpenAI ``tool_calls``. Earlier calls and their results go back to the model as the same text.
"""

from __future__ import annotations

import json
import re
import time
import uuid

TASKS = {"planner": "swarm_studio_planner", "worker": "swarm_studio_builder", "reviewer": "swarm_studio_reviewer"}
MODEL = re.compile(r"^[A-Za-z0-9_./@:+-]{1,128}$")
OPEN = "<tool_call>"

TOOLS_HEAD = """You can call tools. To call one, answer with a block like this, and nothing else on those lines:
<tool_call>{"name": "TOOL_NAME", "arguments": {...}}</tool_call>
The arguments are one JSON object that matches the tool's parameters. You may put several blocks in one
answer; they run in order. Text outside the blocks is shown to the person. When you need no tool, answer
in plain text. A tool's result comes back in a later message that starts with "Tool result".
Use exactly this <tool_call> JSON format, not any other tool-call syntax you may know.

The tools:"""


def split_model(name: str) -> tuple[str, str | None]:
    """"worker" -> ("worker", None); "worker:cb/deepseek" -> ("worker", "cb/deepseek")."""
    role, _, pick = str(name or "").partition(":")
    role = role if role in TASKS else "planner"
    return role, (pick if pick and MODEL.match(pick) else None)


def _text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") in ("text", "input_text"))
    return "" if content is None else str(content)


def _tools_prompt(tools: list) -> str:
    lines = [TOOLS_HEAD]
    for t in tools:
        fn = t.get("function") if isinstance(t, dict) and isinstance(t.get("function"), dict) else t
        if not isinstance(fn, dict) or not fn.get("name"):
            continue
        lines.append(f"- {fn['name']}: {fn.get('description') or ''}".rstrip())
        lines.append("  parameters: " + json.dumps(fn.get("parameters") or {"type": "object"}, separators=(",", ":")))
    return "\n".join(lines)


def to_hermes(body: dict) -> list:
    """OpenAI chat messages (with tools, tool calls and tool results) as plain messages for ctx.llm."""
    tools = body.get("tools") if isinstance(body.get("tools"), list) and body.get("tool_choice") != "none" else []
    names: dict = {}
    out: list = []
    for m in body.get("messages") or []:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        if role == "developer":
            role = "system"
        if role == "assistant" and m.get("tool_calls"):
            blocks = []
            for c in m["tool_calls"]:
                fn = c.get("function") or {}
                names[c.get("id")] = fn.get("name")
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except ValueError:
                    args = fn.get("arguments")
                blocks.append("<tool_call>" + json.dumps({"name": fn.get("name"), "arguments": args}) + "</tool_call>")
            out.append({"role": "assistant", "content": "\n".join([t for t in [_text(m.get("content")).strip()] if t] + blocks)})
        elif role == "tool":
            call = m.get("tool_call_id")
            out.append({"role": "user", "content": f"Tool result for {names.get(call) or m.get('name') or 'the tool'} (call {call}):\n{_text(m.get('content'))}"})
        elif role in ("system", "user", "assistant"):
            out.append({"role": role, "content": m.get("content") if role == "user" and isinstance(m.get("content"), list) else _text(m.get("content"))})
    if tools:
        prompt = _tools_prompt(tools)
        if out and out[0]["role"] == "system":
            out[0] = {"role": "system", "content": out[0]["content"] + "\n\n" + prompt}
        else:
            out.insert(0, {"role": "system", "content": prompt})
    return out


# Some models answer in their own native tool syntax however they are asked. DeepSeek's DSML:
#   <｜DSML｜invoke name="list_files"><｜DSML｜parameter name="recursive" string="false">true</｜DSML｜parameter></｜DSML｜invoke>
# inside a <｜DSML｜function_calls> (or "calls") wrapper; string="true" marks a raw string, anything else is JSON.
_DSML = r"[｜|]+\s*DSML\s*[｜|]+\s*"
_DSML_INVOKE = re.compile(rf'<\s*{_DSML}invoke\s+name="([^"]+)"\s*>(.*?)(?:</\s*{_DSML}invoke\s*>|\Z)', re.S)
_DSML_PARAM = re.compile(rf'<\s*{_DSML}parameter\s+name="([^"]+)"(?:\s+string="(true|false)")?\s*>(.*?)</\s*{_DSML}parameter\s*>', re.S)
_DSML_TAG = re.compile(rf'</?\s*{_DSML}\w+[^>]*>')  # a stray tag, left when the model mixes both formats


def _call(name: str, args) -> dict:
    return {"id": "call_" + uuid.uuid4().hex[:24], "type": "function",
            "function": {"name": name, "arguments": args if isinstance(args, str) else json.dumps(args)}}


def _dsml_calls(text: str) -> tuple[str, list]:
    calls = []
    for m in _DSML_INVOKE.finditer(text):
        args = {}
        for p in _DSML_PARAM.finditer(m.group(2)):
            value = p.group(3)
            if p.group(2) != "true":
                try:
                    value = json.loads(value)
                except ValueError:
                    pass
            args[p.group(1)] = value
        calls.append(_call(m.group(1), args))
    return _DSML_INVOKE.sub("", text), calls


def tool_calls(text: str) -> tuple[str, list]:
    """The model's answer -> (its plain text, OpenAI tool_calls). Each block's JSON is read as JSON, so a
    "</tool_call>" inside an argument (a file that mentions it) does not end the block. A block that is not
    JSON stays text; a last block with no closing tag still counts. DeepSeek's native DSML calls count too."""
    text = text or ""
    calls, keep, at, pos = [], [], 0, 0
    decoder = json.JSONDecoder()
    while (start := text.find(OPEN, pos)) >= 0:
        body = start + len(OPEN)
        while body < len(text) and text[body].isspace():
            body += 1
        try:
            got, end = decoder.raw_decode(text, body)
        except ValueError:
            pos = body
            continue
        if not isinstance(got, dict) or not isinstance(got.get("name"), str):
            pos = end
            continue
        close = re.match(r"\s*</tool_call>", text[end:])
        end += close.end() if close else 0
        args = got.get("arguments", got.get("parameters", {}))
        keep.append(text[at:start])
        at = pos = end
        calls.append(_call(got["name"], args))
    keep.append(text[at:])
    rest, native = _dsml_calls("".join(keep))
    calls += native
    return (_DSML_TAG.sub("", rest).strip() if calls else text), calls


def complete(ctx, body: dict, timeout_s: float | None = None) -> dict:
    """One chat completion through ctx.llm, as an OpenAI chat.completion object."""
    role, pick = split_model(body.get("model"))
    kw = {"task": TASKS[role], "purpose": f"swarm-studio {role}"}
    for key, cast in (("max_tokens", int), ("temperature", float)):
        if body.get(key) is not None:
            try:
                kw[key] = cast(body[key])
            except (TypeError, ValueError):
                pass
    if timeout_s:
        kw["timeout"] = timeout_s
    messages = to_hermes(body)
    try:
        got = ctx.llm.complete(messages, model=pick, **kw) if pick else ctx.llm.complete(messages, **kw)
    except PermissionError:  # the pick needs the operator's allow_model_override: the slot's model answers
        got = ctx.llm.complete(messages, **kw)
    text, calls = tool_calls(got.text) if body.get("tools") else (got.text or "", [])
    usage = getattr(got, "usage", None)
    message = {"role": "assistant", "content": text if text or not calls else None}
    if calls:
        message["tool_calls"] = calls
    return {
        "id": "chatcmpl-" + uuid.uuid4().hex[:24], "object": "chat.completion", "created": int(time.time()),
        "model": getattr(got, "model", "") or role,
        "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if calls else "stop"}],
        "usage": {"prompt_tokens": int(getattr(usage, "input_tokens", 0) or 0),
                  "completion_tokens": int(getattr(usage, "output_tokens", 0) or 0),
                  "total_tokens": int(getattr(usage, "total_tokens", 0) or 0)},
    }


def sse(done: dict) -> list:
    """A finished chat.completion as the SSE lines a streaming client reads: one delta, usage, [DONE]."""
    base = {"id": done["id"], "object": "chat.completion.chunk", "created": done["created"], "model": done["model"]}
    msg, finish = done["choices"][0]["message"], done["choices"][0]["finish_reason"]
    delta = {"role": "assistant", "content": msg.get("content") or ""}
    if msg.get("tool_calls"):
        delta["tool_calls"] = [{"index": i, **c} for i, c in enumerate(msg["tool_calls"])]
    chunks = [{**base, "choices": [{"index": 0, "delta": delta, "finish_reason": None}]},
              {**base, "choices": [{"index": 0, "delta": {}, "finish_reason": finish}]},
              {**base, "choices": [], "usage": done["usage"]}]
    return [f"data: {json.dumps(c)}\n\n".encode() for c in chunks] + [b"data: [DONE]\n\n"]


def models(_body: dict | None = None) -> dict:
    return {"object": "list", "data": [{"id": role, "object": "model", "owned_by": "hermes"} for role in TASKS]}
