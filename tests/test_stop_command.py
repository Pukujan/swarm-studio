"""`/swarm stop`, `hermes swarm --stop` and the tool's stop action (commands.stop)."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import commands  # noqa: E402


class StopCommand(unittest.TestCase):
    def test_stop_is_a_command_but_a_brief_about_stopping_is_not(self):
        self.assertTrue(commands.is_command("stop"))
        self.assertTrue(commands.is_command("stop 2"))
        self.assertTrue(commands.is_command("stop 2026-11-11T10-00-00-000Z"))
        self.assertFalse(commands.is_command("stop smoking coach"))
        self.assertFalse(commands.is_command("stop motion"))

    def test_says_what_was_stopped(self):
        with mock.patch.object(commands.launcher, "_request", return_value={"stopped": [{"run": "r", "what": ["build", "pictures"]}, {"run": "r", "what": ["auto"]}]}) as req:
            out = commands.stop()
        req.assert_called_once()
        self.assertEqual(req.call_args.args[0], "/api/stop")
        self.assertEqual(req.call_args.kwargs["body"], {})
        self.assertIn("the build, pictures, the auto run", out)
        self.assertIn("kept", out)

    def test_nothing_running(self):
        with mock.patch.object(commands.launcher, "_request", return_value={"stopped": []}):
            self.assertEqual(commands.stop(), "Nothing is running.")
        with mock.patch.object(commands.launcher, "_request", side_effect=OSError("refused")), \
                mock.patch.object(commands.launcher, "ensure_server") as up:
            self.assertIn("not up", commands.stop())
            up.assert_not_called()

    def test_tool_action(self):
        with mock.patch.object(commands, "stop", return_value="ok") as st:
            self.assertEqual(commands.tool({"action": "stop"}), "ok")
        st.assert_called_once_with("")


if __name__ == "__main__":
    unittest.main()
