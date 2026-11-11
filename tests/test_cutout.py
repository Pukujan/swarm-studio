import os
import sys
import tempfile
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from cutout import cutout  # noqa: E402


class CutoutTest(unittest.TestCase):
    def test_flat_background_comes_away_and_pale_inner_parts_stay(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = os.path.join(d, "in.png"), os.path.join(d, "out.png")
            im = Image.new("RGB", (200, 200), (214, 214, 210))
            g = ImageDraw.Draw(im)
            g.ellipse((60, 30, 140, 190), fill=(140, 20, 60), outline=(20, 10, 30), width=4)
            g.ellipse((85, 50, 115, 80), fill=(214, 214, 210))  # a pale face inside the figure
            im.save(src)
            cutout(src, dst)
            out = Image.open(dst)
            self.assertEqual(out.mode, "RGBA")
            self.assertLess(out.size[0], 120, "trimmed to the figure")
            a = out.getchannel("A")
            self.assertEqual(a.getpixel((0, 0)), 0, "the background is clear")
            cx, cy = out.size[0] // 2, out.size[1] // 2
            self.assertEqual(a.getpixel((cx, cy)), 255, "the figure is solid")
            # the pale face is enclosed by the figure, so it is kept
            self.assertGreater(a.getpixel((cx, 50 - 30 + 6 + 15)), 200)

    def test_a_busy_picture_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = os.path.join(d, "in.png"), os.path.join(d, "out.png")
            im = Image.new("RGB", (100, 100))
            im.putdata([((x * 37) % 255, (y * 91) % 255, (x * y) % 255) for y in range(100) for x in range(100)])
            im.save(src)
            with self.assertRaises(SystemExit):
                cutout(src, dst)


if __name__ == "__main__":
    unittest.main()
