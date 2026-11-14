"""plugin.yaml: nothing is required to install and run the plugin (Nous catalog review, point 8).

The crew's models come from Hermes, so SWARM_STUDIO_API_KEY is an optional fallback, never a requirement."""

import re
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
