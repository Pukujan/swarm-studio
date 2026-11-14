"""The model's publish, deploy and post need a person's OK first (Nous catalog review, point 6)."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import commands  # noqa: E402


class PublishConfirm(unittest.TestCase):
    def test_outward_calls_go_to_the_approval_gate(self):
        for args in ({"action": "publish"}, {"action": "publish", "target": "github"}, {"action": "publish", "target": "vercel"},
                     {"action": "publish", "target": "cloudflare"}, {"action": "deploy", "build": "2"}, {"action": "post", "text": "hi"},
                     {"action": "github", "move": "push"}, {"action": "github", "move": "push", "public": True}, {"action": "github", "move": "push", "repo": "team/ares"}):
            got = commands.approval_hook(tool_name="swarm_studio", args=args)
            self.assertEqual(got and got["action"], "approve", args)
            self.assertTrue(got["message"] and got["rule_key"].startswith("swarm-studio:"))

    def test_local_and_everything_else_runs_without_asking(self):
        for args in ({"action": "publish", "target": "local"}, {"action": "files"}, {"action": "export"}, {"action": "app"}, {"action": "stop"},
                     {"action": "github"}, {"action": "github", "move": "status"}, {"action": "github", "move": "pull"}):
            self.assertIsNone(commands.approval_hook(tool_name="swarm_studio", args=args), args)
        self.assertIsNone(commands.approval_hook(tool_name="terminal", args={"action": "publish"}))

    def test_each_host_is_its_own_always(self):
        keys = {commands.approval_hook(tool_name="swarm_studio", args={"action": "publish", "target": t})["rule_key"] for t in ("github", "vercel", "cloudflare")}
        self.assertEqual(len(keys), 3)

    def test_a_private_push_a_public_one_and_a_named_repository_are_each_their_own_always(self):
        asks = ({"move": "push"}, {"move": "push", "public": True}, {"move": "push", "repo": "team/ares"}, {"move": "push", "repo": "team/ares", "public": True})
        got = [commands.approval_hook(tool_name="swarm_studio", args={"action": "github", **a}) for a in asks]
        self.assertEqual([g["rule_key"] for g in got], ["swarm-studio:github:push:private", "swarm-studio:github:push:public", "swarm-studio:github:push:named", "swarm-studio:github:push:named"])
        self.assertIn("PUBLIC", got[1]["message"])
        self.assertIn("team/ares", got[2]["message"])

    def test_register_installs_the_hook(self):
        src = open(os.path.join(os.path.dirname(__file__), "..", "__init__.py"), encoding="utf-8").read()
        self.assertIn('ctx.register_hook("pre_tool_call", commands.approval_hook)', src)

    def test_cron_refuses_without_touching_the_studio(self):
        ctx = mock.Mock()
        ctx.current_cron_execution.return_value = object()
        with mock.patch.object(commands, "CTX", ctx), mock.patch.object(commands, "_api", side_effect=AssertionError("called")), \
                mock.patch.object(commands, "_dispatch", side_effect=AssertionError("called")):
            for args in ({"action": "publish"}, {"action": "deploy"}, {"action": "post"}, {"action": "github", "move": "push"}):
                self.assertIn("nobody to give it", commands.tool(args))

    def test_cron_still_runs_local_work(self):
        ctx = mock.Mock()
        ctx.current_cron_execution.return_value = object()
        with mock.patch.object(commands, "CTX", ctx), mock.patch.object(commands, "_publish", return_value="local ok") as pub:
            self.assertEqual(commands.tool({"action": "publish", "target": "local"}), "local ok")
        pub.assert_called_once()


if __name__ == "__main__":
    unittest.main()
