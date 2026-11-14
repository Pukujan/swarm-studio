"""plugin.yaml: nothing is required to install and run the plugin (Nous catalog review, point 8).

The crew's models come from Hermes, so SWARM_STUDIO_API_KEY is an optional fallback, never a requirement."""

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import launcher  # noqa: E402

MANIFEST = (Path(__file__).resolve().parent.parent / "plugin.yaml").read_text("utf-8")


def section(name: str) -> str:
    """The text of one top-level key's block (until the next top-level key)."""
    m = re.search(rf"^{name}:\n((?:[ \t].*\n|\n)*)", MANIFEST, re.M)
    return m.group(1) if m else ""


class ManifestTest(unittest.TestCase):
    def test_no_required_env(self):
        self.assertEqual(section("requires_env").strip(), "", "requires_env must be empty: every key is optional")

    def test_studio_key_is_optional(self):
        names = re.findall(r"^  - name: (\S+)", section("optional_env"), re.M)
        self.assertIn("SWARM_STUDIO_API_KEY", names)

    def test_every_key_the_launcher_passes_is_declared(self):
        """A key the server is handed is one the person can see in plugin.yaml (FISH_API_KEY was read but undeclared)."""
        names = re.findall(r"^  - name: (\S+)", section("optional_env"), re.M)
        self.assertEqual([k for k in launcher.PASSED_KEYS if k not in names], [])
        self.assertIn("FISH_API_KEY", launcher.PASSED_KEYS)
        self.assertRegex(section("optional_env"), r"- name: FISH_API_KEY\n    description: .*\n    secret: true")

    def test_the_server_keeps_both_names_for_godot(self):
        """engine/port.mjs godotBin reads SWARM_GODOT, then GODOT; the launcher dropped the second."""
        for name in ("SWARM_GODOT", "GODOT", "SWARM_IMAGE_SERVICE", "PATH", "HERMES_HOME"):
            self.assertIn(name, launcher.KEEP_ENV)


if __name__ == "__main__":
    unittest.main()
