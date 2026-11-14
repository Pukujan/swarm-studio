"""The sheet cutter's key handling (games/ares/tools/sheets/cut.py): the three key colours,
their despill, and the key measured from the painted sheet. Needs numpy and scipy, which the
build machine has and a bare CI runner may not: skipped without them."""
import os
import sys
import tempfile
import unittest

from PIL import Image, ImageDraw

try:
    import numpy as np
    import scipy  # noqa: F401
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "games", "ares", "tools", "sheets"))
    import cut as sheet
except ImportError:  # pragma: no cover
    sheet = None

MAGENTA, GREEN, BLUE = (255, 0, 255), (0, 255, 0), (0, 0, 255)


def sheet_on(bg, body, trim=None):
    """A 3x2 sheet of six outlined figures on a flat key colour."""
    im = Image.new("RGB", (600, 400), bg)
    g = ImageDraw.Draw(im)
    for i in range(6):
        x, y = (i % 3) * 200, (i // 3) * 200
        g.ellipse((x + 60, y + 30, x + 140, y + 180), fill=body, outline=(20, 10, 30), width=4)
        if trim:
            g.rectangle((x + 80, y + 90, x + 120, y + 150), fill=trim)
    return im


@unittest.skipIf(sheet is None, "numpy and scipy are not installed")
class SheetKeyTest(unittest.TestCase):
    def cut(self, im):
        with tempfile.TemporaryDirectory() as d:
            src = os.path.join(d, "sheet.png")
            im.save(src)
            frames, cell = sheet.cut(src)
            return frames, sheet.check(frames, cell), sheet.cut.key

    def test_a_sheet_on_each_key_cuts_into_six_frames(self):
        for bg in (MAGENTA, GREEN, BLUE):
            body = (230, 190, 40)
            frames, qc, key = self.cut(sheet_on(bg, body))
            self.assertEqual(qc["frames"], 6, bg)
            self.assertEqual(key["name"], sheet.key_name(bg))
            self.assertLess(key["clash"], 0.01)
            f = frames[0][0]
            self.assertEqual(int(f[2, 2, 3]), 0, "the key is clear")

    def test_the_sheet_names_a_better_key_when_the_figures_clash(self):
        _, _, key = self.cut(sheet_on(MAGENTA, (230, 190, 40), trim=(235, 130, 205)))
        self.assertGreater(key["clash"], 0.03)
        self.assertEqual(key["best"], "green")
        _, _, key = self.cut(sheet_on(BLUE, (230, 190, 40), trim=(60, 80, 190)))
        self.assertGreater(key["clash"], 0.03)
        self.assertEqual(key["best"], "magenta")

    def test_despill_pulls_each_key_out_of_the_outline_only(self):
        for bg, tint in ((MAGENTA, (200, 110, 200)), (GREEN, (110, 200, 110)), (BLUE, (110, 110, 200))):
            a = np.zeros((80, 80, 3), int)
            a[:, :] = bg
            a[20:60, 20:60] = tint
            al = np.zeros((80, 80), np.uint8)
            al[20:60, 20:60] = 255
            out = sheet.despill(a, al)
            self.assertEqual(tuple(out[21, 21]), (110, 110, 110), "the rim loses the tint")
            self.assertEqual(tuple(out[40, 40]), tint, "deep inside keeps its colour")


if __name__ == "__main__":
    unittest.main()
