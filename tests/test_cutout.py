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

    def test_magenta_key_clears_pockets_and_keeps_white_cloth(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = os.path.join(d, "in.png"), os.path.join(d, "out.png")
            im = Image.new("RGB", (200, 200), (255, 0, 255))
            g = ImageDraw.Draw(im)
            g.ellipse((50, 20, 150, 190), fill=(250, 250, 248), outline=(60, 30, 20), width=5)  # a white dress
            g.ellipse((85, 60, 115, 90), fill=(255, 0, 255))   # a pocket of background between hair locks
            g.ellipse((90, 130, 110, 150), fill=(240, 240, 240))  # pale cloth inside
            im.save(src)
            cutout(src, dst, keep_size=True)
            out = Image.open(dst)
            a = out.getchannel("A")
            ox, oy = 50 - 6, 20 - 6   # the crop starts 6 px before the figure
            self.assertEqual(a.getpixel((100 - ox, 75 - oy)), 0, "the enclosed magenta pocket is cleared")
            self.assertEqual(a.getpixel((100 - ox, 140 - oy)), 255, "white cloth stays solid")
            self.assertEqual(a.getpixel((100 - ox, 110 - oy)), 255, "the dress stays solid")
            r, g_, b, _ = out.getpixel((100 - ox, 24 - oy))
            self.assertFalse(r > 200 and b > 200 and g_ < 120, "no magenta fringe on the edge")

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
