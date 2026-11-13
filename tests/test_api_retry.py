"""A command asked just as the server stopped after its idle time (decision 0017, issue #450): commands._api starts it again and
asks once more, so the person never sees the gap."""
import email.message
import io
import os
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import commands  # noqa: E402

UP = {"running": True, "url": "http://127.0.0.1:4319/"}


class ApiRetry(unittest.TestCase):
    def test_refused_once_then_answered(self):
        refused = urllib.error.URLError(ConnectionRefusedError(61, "refused"))
        with mock.patch.object(commands.launcher, "ensure_server", return_value=UP) as up, \
                mock.patch.object(commands.launcher, "_request", side_effect=[refused, {"ok": True}]) as req:
            self.assertEqual(commands._api("/api/runs"), {"ok": True})
        self.assertEqual(up.call_count, 2)  # once before asking, once after the refusal
        self.assertEqual(req.call_count, 2)

    def test_refused_twice_is_an_error(self):
        refused = urllib.error.URLError(ConnectionRefusedError(61, "refused"))
        with mock.patch.object(commands.launcher, "ensure_server", return_value=UP), \
                mock.patch.object(commands.launcher, "_request", side_effect=[refused, refused]):
            with self.assertRaises(urllib.error.URLError):
                commands._api("/api/runs")

    def test_a_refusal_with_a_reason_is_not_retried(self):
        err = urllib.error.HTTPError("http://x", 404, "not found", email.message.Message(), io.BytesIO(b'{"error": "no such build"}'))
        with mock.patch.object(commands.launcher, "ensure_server", return_value=UP) as up, \
                mock.patch.object(commands.launcher, "_request", side_effect=err) as req:
            with self.assertRaises(RuntimeError) as got:
                commands._api("/api/runs/x")
        self.assertEqual(str(got.exception), "no such build")
        self.assertEqual(req.call_count, 1)
        self.assertEqual(up.call_count, 1)


if __name__ == "__main__":
    unittest.main()
