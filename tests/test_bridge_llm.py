"""Model calls go through Hermes's ctx.llm, by way of the bridge (Nous catalog review, point 2).

No provider key reaches the Node server: not in its environment, not in a run's body. The one key that may
is the plugin's own SWARM_STUDIO_API_KEY."""
import json
import os
import re
import sys
import tempfile
import unittest
import urllib.request
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_bridge import ROOT, load_package  # noqa: E402

PROVIDER_KEYS = {"OPENAI_API_KEY": "sk-openai-xxxxxxxx", "OPENROUTER_API_KEY": "sk-or-xxxxxxxx", "HERMES_CUSTOM_INFERHUB_API_KEY": "ih-xxxxxxxx",
                 "ANTHROPIC_API_KEY": "sk-ant-xxxxxxxx", "NOUS_API_KEY": "nous-xxxxxxxx"}


class Llm:
    def __init__(self, text="ok", refuse_model=False):
        self.text, self.refuse_model, self.calls = text, refuse_model, []

    def complete(self, messages, **kw):
        self.calls.append((messages, kw))
        if self.refuse_model and kw.get("model"):
            raise PermissionError("allow_model_override is not granted")
        usage = SimpleNamespace(input_tokens=11, output_tokens=7, total_tokens=18)
        return SimpleNamespace(text=self.text, model=kw.get("model") or "cb/deepseek-v4.1-flash", usage=usage)


class Ctx:
    def __init__(self, llm):
        self.llm = llm


class ModelCalls(unittest.TestCase):
    def setUp(self):
        os.environ["HERMES_HOME"] = tempfile.mkdtemp()
        self.pkg = load_package()
        self.m = self.pkg.bridge_llm

    def test_the_role_picks_the_plugins_slot_and_a_pick_needs_the_operators_grant(self):
        llm = Llm()
        got = self.m.complete(Ctx(llm), {"model": "worker", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 900, "temperature": 0.4}, 120)
        self.assertEqual(llm.calls[0][1], {"task": "swarm_studio_builder", "purpose": "swarm-studio worker", "max_tokens": 900, "temperature": 0.4, "timeout": 120})
        self.assertEqual(got["choices"][0]["message"], {"role": "assistant", "content": "ok"})
        self.assertEqual(got["usage"], {"prompt_tokens": 11, "completion_tokens": 7, "total_tokens": 18})
        self.m.complete(Ctx(llm), {"model": "reviewer:qwen/vl", "messages": []})
        self.assertEqual((llm.calls[-1][1]["task"], llm.calls[-1][1]["model"]), ("swarm_studio_reviewer", "qwen/vl"))
        # without allow_model_override the slot's own model answers
        refusing = Llm(refuse_model=True)
        got = self.m.complete(Ctx(refusing), {"model": "planner:x/y", "messages": []})
        self.assertEqual(len(refusing.calls), 2)
        self.assertNotIn("model", refusing.calls[1][1])
        self.assertEqual(got["model"], "cb/deepseek-v4.1-flash")
        self.assertEqual(self.m.split_model("nonsense"), ("planner", None))

    def test_tools_are_emulated_in_the_prompt_and_come_back_as_tool_calls(self):
        tools = [{"type": "function", "function": {"name": "write_file", "description": "Write a file", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}}}}]
        body = {"model": "worker", "tools": tools, "messages": [
            {"role": "system", "content": "You build apps."},
            {"role": "user", "content": [{"type": "text", "text": "make it"}]},
            {"role": "assistant", "content": "", "tool_calls": [{"id": "call_1", "type": "function", "function": {"name": "write_file", "arguments": "{\"path\": \"a.ts\"}"}}]},
            {"role": "tool", "tool_call_id": "call_1", "content": "written"},
        ]}
        sent = self.m.to_hermes(body)
        self.assertIn("You build apps.", sent[0]["content"])
        self.assertIn("<tool_call>", sent[0]["content"])
        self.assertIn('write_file: Write a file', sent[0]["content"])
        self.assertEqual(sent[2], {"role": "assistant", "content": '<tool_call>{"name": "write_file", "arguments": {"path": "a.ts"}}</tool_call>'})
        self.assertEqual(sent[3]["role"], "user")
        self.assertIn("Tool result for write_file (call call_1)", sent[3]["content"])
        self.assertTrue(all(m["role"] != "tool" for m in sent))
        answer = 'Writing it.\n<tool_call>{"name": "write_file", "arguments": {"path": "b.ts", "content": "x</tool_call>"}}</tool_call>\n<tool_call>{"name": "run", "arguments": {}}'
        got = self.m.complete(Ctx(Llm(answer)), body)
        msg, finish = got["choices"][0]["message"], got["choices"][0]["finish_reason"]
        self.assertEqual(finish, "tool_calls")
        self.assertEqual(msg["content"], "Writing it.")
        self.assertEqual([c["function"]["name"] for c in msg["tool_calls"]], ["write_file", "run"], "an unclosed last block still counts")
        self.assertEqual(json.loads(msg["tool_calls"][0]["function"]["arguments"])["content"], "x</tool_call>")
        # plain text with no blocks, and a broken block, stay text
        self.assertEqual(self.m.tool_calls("just text"), ("just text", []))
        self.assertEqual(self.m.tool_calls("<tool_call>{not json}</tool_call>")[1], [])

    def test_deepseeks_native_dsml_calls_count_as_tool_calls(self):
        # captured from cb/deepseek-v4.1-flash through ctx.llm: it ignored the <tool_call> format, and the
        # app engine stopped after one turn with nothing built
        answer = ("I'll start by exploring the project.\n\n<\uff5c\uff5cDSML\uff5c\uff5c calls>\n"
                  '<\uff5c\uff5cDSML\uff5c\uff5c invoke name="set_chat_summary">\n'
                  '<\uff5c\uff5cDSML\uff5c\uff5c parameter name="summary" string="true">Little Fern guestbook app</\uff5c\uff5cDSML\uff5c\uff5c parameter>\n'
                  "</\uff5c\uff5cDSML\uff5c\uff5c invoke>\n"
                  '<\uff5cDSML\uff5cinvoke name="list_files">\n'
                  '<\uff5cDSML\uff5cparameter name="recursive" string="false">true</\uff5cDSML\uff5cparameter>\n'
                  '<\uff5cDSML\uff5cparameter name="depth" string="false">not json</\uff5cDSML\uff5cparameter>\n'
                  "</\uff5cDSML\uff5cinvoke>\n</\uff5c\uff5cDSML\uff5c\uff5c calls>")
        got = self.m.complete(Ctx(Llm(answer)), {"model": "worker", "tools": [{"type": "function", "function": {"name": "list_files"}}], "messages": []})
        msg = got["choices"][0]["message"]
        self.assertEqual(got["choices"][0]["finish_reason"], "tool_calls")
        self.assertEqual(msg["content"], "I'll start by exploring the project.")
        self.assertEqual([(c["function"]["name"], json.loads(c["function"]["arguments"])) for c in msg["tool_calls"]],
                         [("set_chat_summary", {"summary": "Little Fern guestbook app"}), ("list_files", {"recursive": True, "depth": "not json"})])
        self.assertIn("not any other tool-call syntax", self.m.TOOLS_HEAD)
        # both formats in one answer (seen live): the call counts and no stray DSML tag is left as text
        mixed = '<tool_call>{"name": "read_file", "arguments": {"path": "a.tsx"}}</tool_call>\n</\uff5c\uff5cDSML\uff5c\uff5c parameter>\n</\uff5c\uff5cDSML\uff5c\uff5c calls>'
        self.assertEqual(self.m.tool_calls(mixed)[0], "")
        self.assertEqual(self.m.tool_calls("<\uff5cDSML\uff5c note> is just text"), ("<\uff5cDSML\uff5c note> is just text", []))

    def test_calls_wrapped_twice_or_in_both_formats_count_once_with_their_real_arguments(self):
        # seen live: read_file got {} or {"arguments": …} and failed dyad's schema, a wasted turn each
        args = lambda text: [(c["function"]["name"], json.loads(c["function"]["arguments"])) for c in self.m.tool_calls(text)[1]]
        nested = '<tool_call>{"name": "read_file", "arguments": {"name": "read_file", "arguments": {"path": "src/App.tsx"}}}</tool_call>'
        self.assertEqual(args(nested), [("read_file", {"path": "src/App.tsx"})])
        as_string = '<tool_call>{"name": "read_file", "arguments": {"arguments": "{\\"path\\": \\"a.tsx\\"}"}}</tool_call>'
        self.assertEqual(args(as_string), [("read_file", {"path": "a.tsx"})])
        dsml_param = '<\uff5cDSML\uff5cinvoke name="read_file"><\uff5cDSML\uff5cparameter name="arguments" string="true">{"path": "b.tsx"}</\uff5cDSML\uff5cparameter></\uff5cDSML\uff5cinvoke>'
        self.assertEqual(args(dsml_param), [("read_file", {"path": "b.tsx"})])
        both = ('<\uff5cDSML\uff5cinvoke name="read_file">\n<tool_call>{"name": "read_file", "arguments": {"path": "c.tsx"}}</tool_call>\n'
                '</\uff5cDSML\uff5cinvoke>\n<\uff5cDSML\uff5cinvoke name="restart_app"></\uff5cDSML\uff5cinvoke>')
        self.assertEqual(args(both), [("restart_app", {}), ("read_file", {"path": "c.tsx"})])
        self.assertEqual(self.m.tool_calls(both)[0], "")
        stray = '<tool_call>{"name": "write_file", "arguments": {"arguments": true, "path": "a.tsx", "content": "x"}}</tool_call>'
        self.assertEqual(args(stray), [("write_file", {"path": "a.tsx", "content": "x"})])
        # a real argument that happens to be called "name" is left alone
        self.assertEqual(args('<tool_call>{"name": "rename", "arguments": {"name": "x", "to": "y"}}</tool_call>'), [("rename", {"name": "x", "to": "y"})])

    def test_a_stream_is_one_delta_then_usage_then_done(self):
        done = self.m.complete(Ctx(Llm('<tool_call>{"name": "run", "arguments": {"a": 1}}</tool_call>')), {"model": "worker", "tools": [{"type": "function", "function": {"name": "run"}}], "messages": []})
        lines = [x.decode() for x in self.m.sse(done)]
        self.assertEqual(lines[-1], "data: [DONE]\n\n")
        chunks = [json.loads(x[6:]) for x in lines[:-1]]
        self.assertEqual(chunks[0]["object"], "chat.completion.chunk")
        call = chunks[0]["choices"][0]["delta"]["tool_calls"][0]
        self.assertEqual((call["index"], call["function"]["name"], json.loads(call["function"]["arguments"])), (0, "run", {"a": 1}))
        self.assertEqual(chunks[1]["choices"][0]["finish_reason"], "tool_calls")
        self.assertEqual(chunks[2]["usage"]["total_tokens"], 18)

    def test_the_bridge_answers_openai_shaped_with_its_token_only(self):
        b = self.pkg.bridge
        llm = Llm("hello")
        b.CTX = Ctx(llm)
        with mock.patch.object(b, "attach", return_value=False), mock.patch.object(b, "_attach_loop"):
            self.assertTrue(b.start())
        url, token = b.url(), b._token

        def post(body, headers):
            req = urllib.request.Request(url + "/v1/chat/completions", data=json.dumps(body).encode(), method="POST", headers={"content-type": "application/json", **headers})
            try:
                with urllib.request.urlopen(req, timeout=5) as res:
                    return res.status, res.headers.get("content-type"), res.read().decode()
            except urllib.error.HTTPError as err:
                return err.code, err.headers.get("content-type"), err.read().decode()

        auth = {"authorization": f"Bearer {token}"}
        code, kind, raw = post({"model": "planner", "messages": [{"role": "user", "content": "hi"}]}, {**auth, "x-swarm-timeout": "90000"})
        self.assertEqual((code, json.loads(raw)["choices"][0]["message"]["content"]), (200, "hello"))
        self.assertEqual(llm.calls[-1][1]["timeout"], 90.0)
        code, kind, raw = post({"model": "worker", "stream": True, "messages": []}, auth)
        self.assertEqual((code, kind), (200, "text/event-stream"))
        self.assertIn('"content": "hello"', raw)
        self.assertTrue(raw.endswith("data: [DONE]\n\n"))
        self.assertEqual(post({"model": "planner", "messages": []}, {})[0], 403)

        def boom(*_a, **_k):
            raise RuntimeError("HTTP 429 rate limited upstream")
        llm.complete = boom
        code, _, raw = post({"model": "planner", "messages": []}, auth)
        self.assertEqual(code, 429)
        self.assertIn("rate limited", json.loads(raw)["error"]["message"])
        with urllib.request.urlopen(urllib.request.Request(url + "/v1/models", headers=auth), timeout=5) as res:
            self.assertEqual([m["id"] for m in json.loads(res.read())["data"]], ["planner", "worker", "reviewer"])


class Slots(unittest.TestCase):
    def test_the_three_slots_register_with_reasoning_off_so_builds_keep_their_pace(self):
        """Through ctx.llm the studio can send no "no reasoning" hint, and a thinking builder makes a build
        about twice as slow; the slot's own default turns it off (the person's auxiliary config still wins)."""
        pkg = load_package()
        seen = {}

        class Ctx:
            def register_auxiliary_task(self, key, **kw):
                seen[key] = kw
        pkg.register_model_slots(Ctx())
        self.assertEqual(set(seen), set(pkg.bridge_llm.TASKS.values()))
        for key, kw in seen.items():
            self.assertEqual(kw["defaults"], {"reasoning_effort": "none"}, key)
        self.assertEqual(seen["swarm_studio_builder"]["inherit_from"], "compression")
        self.assertEqual(seen["swarm_studio_reviewer"]["inherit_from"], "vision")
        self.assertNotIn("inherit_from", seen["swarm_studio_planner"])


class NoProviderKeyReachesNode(unittest.TestCase):
    def setUp(self):
        os.environ["HERMES_HOME"] = tempfile.mkdtemp()
        self.launcher = load_package().launcher

    def started_env(self, extra):
        l = self.launcher
        seen = {}

        def popen(args, **kw):
            seen.update(kw["env"])
            return SimpleNamespace(pid=1)
        states = iter([None])
        with mock.patch.dict(os.environ, {**PROVIDER_KEYS, **extra}), \
                mock.patch.object(l, "state", side_effect=lambda: next(states, {"app": "swarm-studio"})), \
                mock.patch.object(l.subprocess, "Popen", side_effect=popen), \
                mock.patch.object(l.shutil, "which", return_value="/usr/bin/node"):
            self.assertTrue(l._ensure_server()["running"])
        return seen

    def test_the_server_gets_no_provider_key(self):
        env = self.started_env({})
        for name, value in PROVIDER_KEYS.items():
            self.assertNotIn(name, env)
            self.assertNotIn(value, json.dumps(env))
        self.assertFalse([k for k in env if re.search(r"API_KEY", k)], "no model key at all without SWARM_STUDIO_API_KEY")

    def test_only_the_plugins_own_key_may_go(self):
        env = self.started_env({"SWARM_STUDIO_API_KEY": "own-key-0123456789", "SWARM_STUDIO_BASE_URL": "https://example.test/v1"})
        self.assertEqual(env["SWARM_STUDIO_API_KEY"], "own-key-0123456789")
        self.assertEqual(env["SWARM_STUDIO_BASE_URL"], "https://example.test/v1")
        self.assertEqual([k for k in env if "API_KEY" in k], ["SWARM_STUDIO_API_KEY"])

    def test_a_run_body_carries_no_models_or_keys(self):
        l = self.launcher
        sent = {}

        def request(path, method="GET", body=None, timeout=2.0):
            if path == "/api/run":
                sent.update(body)
            return {"run": "r1"} if path == "/api/run" else {}
        with mock.patch.dict(os.environ, PROVIDER_KEYS), mock.patch.object(l, "ensure_server", return_value={"running": True, "url": "u"}), \
                mock.patch.object(l, "talk_first", return_value=False), mock.patch.object(l, "_request", side_effect=request):
            l.start_run("a bakery")
        self.assertEqual(sent, {"brief": "a bakery"})

    def test_no_module_reads_hermes_provider_clients(self):
        for f in [*ROOT.glob("*.py"), *(ROOT / "engine").glob("*.py"), *(ROOT / "dashboard").glob("*.py")]:
            src = f.read_text("utf-8")
            self.assertNotIn("auxiliary_client", src, f.name)
            self.assertNotIn("get_text_auxiliary_client", src, f.name)
            for mod in re.findall(r"^\s*from\s+(agent\.\w+)\s+import", src, re.M):
                self.assertEqual(mod, "agent.secret_scope", f.name)
        server = (ROOT / "server" / "server.mjs").read_text("utf-8")
        self.assertNotIn("HERMES_CUSTOM_INFERHUB_API_KEY", server)
        self.assertNotIn("setModels", server)

    def test_no_code_reads_hermes_own_env_file_or_provider_keys(self):
        # scripts too: a person may run them, and they ship with the plugin
        for d in ["engine", "server", "scripts", "web"]:
            for f in (ROOT / d).rglob("*.mjs"):
                src = f.read_text("utf-8")
                # the check scripts only delete the name from a child's environment
                for line in src.splitlines():
                    if "HERMES_CUSTOM_" in line:
                        self.assertIn("delete env[k]", line, f"{f.name} reads a Hermes provider key")
                self.assertNotRegex(src, r"['\"]\.hermes['\"]\s*,\s*['\"]\.env['\"]", f"{f.name} reads ~/.hermes/.env")


if __name__ == "__main__":
    unittest.main()
