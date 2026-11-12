"""An updated plugin replaces its idle background server; a busy one is left alone (launcher.stale)."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import launcher  # noqa: E402


class StaleServer(unittest.TestCase):
    def test_server_started_before_the_code_changed_is_stale(self):
        self.assertTrue(launcher.stale({"pid": 1, "booted": 1_000_000}, stamp=1_500))
        self.assertFalse(launcher.stale({"pid": 1, "booted": 2_000_000}, stamp=1_500))

    def test_an_old_server_that_cannot_say_when_it_started_is_left_alone(self):
        self.assertFalse(launcher.stale({"app": "swarm-studio"}, stamp=9e12))

    def test_a_busy_server_is_never_stopped(self):
        with mock.patch.object(launcher.os, "kill") as kill:
            self.assertFalse(launcher._retire({"pid": 4242, "busy": True}))
        kill.assert_not_called()

    def test_an_idle_stale_server_is_replaced(self):
        states = iter([{"app": "swarm-studio", "pid": 4242, "booted": 1_000, "busy": False}, None])
        with mock.patch.object(launcher, "state", side_effect=lambda: next(states, None)), \
                mock.patch.object(launcher, "code_stamp", return_value=9e9), \
                mock.patch.object(launcher.os, "kill") as kill, \
                mock.patch.object(launcher, "resolve_models", return_value={"planner": {"error": "none"}}):
            out = launcher.ensure_server()
        kill.assert_called_once()
        self.assertFalse(out["running"])  # stopped the old one, then went on to start a new one (no model here)

    def test_the_server_does_not_run_inside_the_plugin_folder(self):
        src = open(os.path.join(os.path.dirname(__file__), "..", "launcher.py"), encoding="utf-8").read()
        self.assertIn("cwd=str(data_dir())", src)
        self.assertNotIn("cwd=str(ROOT)", src)


if __name__ == "__main__":
    unittest.main()
