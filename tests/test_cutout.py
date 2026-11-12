import os
import sys
import tempfile
import unittest

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from cutout import cutout, despill, measure, pick  # noqa: E402


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


MAGENTA, GREEN, BLUE = (255, 0, 255), (0, 255, 0), (0, 0, 255)


def figure(bg, body, trim=None, size=200):
    """A synthetic sprite: an outlined body on a flat background, with an optional second colour."""
    im = Image.new("RGB", (size, size), bg)
    g = ImageDraw.Draw(im)
    g.ellipse((60, 30, 140, 190), fill=body, outline=(20, 10, 30), width=4)
    if trim:
        g.rectangle((75, 100, 125, 170), fill=trim)
    return im


class KeyPickTest(unittest.TestCase):
    def test_the_key_is_the_colour_furthest_from_the_figure(self):
        # yellow coat: magenta (the preferred key) is far from it
        self.assertEqual(measure(figure(MAGENTA, (230, 190, 40)))["pick"], "magenta")
        # a pink figure: magenta would eat it, green is furthest
        m = measure(figure(MAGENTA, (240, 120, 200)))
        self.assertEqual((m["key"], m["pick"]), ("magenta", "green"))
        self.assertGreater(m["clash"], 0.5)
        # a green figure painted on green: back to magenta
        m = measure(figure(GREEN, (60, 190, 70)))
        self.assertEqual((m["key"], m["pick"]), ("green", "magenta"))
        # pink hair and a green dress: neither magenta nor green, so blue
        m = measure(figure((30, 30, 30), (240, 120, 200), trim=(60, 190, 70)))
        self.assertEqual(m["pick"], "blue")
        self.assertIsNone(m["key"])

    def test_a_well_keyed_figure_reports_no_clash(self):
        m = measure(figure(MAGENTA, (230, 190, 40), trim=(40, 60, 160)))
        self.assertEqual(m["key"], "magenta")
        self.assertLess(m["clash"], 0.01)

    def test_a_cut_out_sprite_is_measured_by_its_alpha(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = os.path.join(d, "in.png"), os.path.join(d, "out.png")
            figure(GREEN, (150, 60, 200)).save(src)  # a purple figure, painted on green
            cutout(src, dst)
            m = pick(dst)
            self.assertIsNone(m["key"], "a cut-out stands on no key")
            self.assertEqual(m["pick"], "green", "purple is far from green, close to magenta and blue")
            self.assertGreater(m["scores"]["magenta"], 0.5)

    def test_the_cut_reports_the_key_the_clash_and_a_better_key(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = os.path.join(d, "in.png"), os.path.join(d, "out.png")
            figure(MAGENTA, (230, 190, 40), trim=(235, 130, 205)).save(src)  # a pink panel on magenta
            cutout(src, dst)
            r = cutout.report
            self.assertEqual(r["key"], "magenta")
            self.assertGreater(r["clash"], 0.03)
            self.assertEqual(r["best"], "green")


class DespillTest(unittest.TestCase):
    def rim(self, key, tint):
        """A grey disc with a ring of the key's tint around it, as a painted sprite's outline
        picks up, cut out and despilled → the pixels of the outer ring."""
        im = Image.new("RGBA", (120, 120), (0, 0, 0, 0))
        g = ImageDraw.Draw(im)
        g.ellipse((20, 20, 100, 100), fill=tint + (255,))
        g.ellipse((24, 24, 96, 96), fill=(128, 128, 128, 255))
        report = despill(im, key)
        return im, report

    def test_each_key_is_pulled_out_of_the_outline(self):
        for key, tint, hi in ((MAGENTA, (200, 110, 200), (0, 2)), (GREEN, (110, 200, 110), (1,)), (BLUE, (110, 110, 200), (2,))):
            im, report = self.rim(key, tint)
            r = im.getpixel((60, 22))
            self.assertLessEqual(max(r[:3]) - min(r[:3]), 2, f"the {key} tint is gone from the rim, with no opposite tint left")
            self.assertGreater(min(r[:3]), 150, "the rim is unmixed, not darkened")
            self.assertLess(r[3], 200, "and the share that was background is clear")
            self.assertEqual(im.getpixel((60, 60))[:3], (128, 128, 128))
            self.assertGreater(report["spill"], 0.1)

    def test_the_inside_of_the_figure_keeps_its_colour(self):
        im = Image.new("RGBA", (120, 120), (0, 0, 0, 0))
        g = ImageDraw.Draw(im)
        g.ellipse((10, 10, 110, 110), fill=(128, 128, 128, 255))
        g.ellipse((45, 45, 75, 75), fill=(220, 90, 200, 255))  # a pink gem deep inside
        report = despill(im, MAGENTA)
        self.assertEqual(im.getpixel((60, 60))[:3], (220, 90, 200))
        self.assertEqual(report["band"], 7)

    def test_spill_deeper_than_the_band_widens_it(self):
        im = Image.new("RGBA", (200, 200), (0, 0, 0, 0))
        g = ImageDraw.Draw(im)
        g.ellipse((10, 10, 190, 190), fill=(200, 120, 200, 255))  # a glow of the key, 12 px deep
        g.ellipse((22, 22, 178, 178), fill=(128, 128, 128, 255))
        report = despill(im, MAGENTA)
        self.assertEqual(report["band"], 14)
        r = im.getpixel((100, 20))
        self.assertLessEqual(max(r[:3]) - min(r[:3]), 2)

    def test_a_flat_colour_that_is_no_key_is_left_alone(self):
        im = Image.new("RGBA", (40, 40), (200, 110, 200, 255))
        self.assertEqual(despill(im, (214, 214, 210)), {"spill": 0.0, "band": 0})
        self.assertEqual(im.getpixel((2, 2))[:3], (200, 110, 200))

    def test_a_sprite_on_blue_cuts_clean(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = os.path.join(d, "in.png"), os.path.join(d, "out.png")
            from PIL import ImageFilter
            figure(BLUE, (240, 120, 200), trim=(60, 190, 70)).filter(ImageFilter.GaussianBlur(1.2)).save(src)
            cutout(src, dst)
            out = Image.open(dst)
            r = cutout.report
            self.assertEqual((r["key"], r["best"]), ("blue", "blue"))
            self.assertLess(r["clash"], 0.01)
            self.assertEqual(r["halo"], 0)
            # no blue rim: nowhere on the visible sprite does blue stand above the other channels by much
            worst = max((b - max(rr, g)) for rr, g, b, a in out.getdata() if a > 40)
            self.assertLessEqual(worst, 2)

    def test_the_soft_edge_gets_no_rim_of_the_opposite_colour(self):
        """A dark-outlined figure on green used to come out with a pink rim, and one on magenta
        with a green rim: the edge must lean neither way."""
        from PIL import ImageFilter
        for bg, lean in ((GREEN, lambda r, g, b: min(r, b) - g), (MAGENTA, lambda r, g, b: g - max(r, b))):
            with tempfile.TemporaryDirectory() as d:
                src, dst = os.path.join(d, "in.png"), os.path.join(d, "out.png")
                figure(bg, (230, 225, 215), trim=(70, 60, 75)).filter(ImageFilter.GaussianBlur(0.8)).save(src)
                cutout(src, dst)
                edge = [lean(r, g, b) for r, g, b, a in Image.open(dst).getdata() if 30 < a < 250]
                self.assertTrue(edge)
                # (the old cut scored 43 on green and 18 on magenta here; what is left is the figure's own purple)
                self.assertLess(sum(max(0, v) for v in edge) / len(edge), 8)


class KitSplitTest(unittest.TestCase):
    def test_a_strip_of_pieces_becomes_one_trimmed_file_each(self):
        from kit_split import split
        with tempfile.TemporaryDirectory() as d:
            strip = Image.new("RGBA", (600, 100), (0, 0, 0, 0))
            g = ImageDraw.Draw(strip)
            for i in range(6):
                if i != 4:  # the fifth cell came out empty
                    g.rectangle((i * 100 + 30, 20, i * 100 + 70 + i, 80), fill=(200, 150, 40, 255))
            src = os.path.join(d, "kit.png")
            strip.save(src)
            names = ["ui-panel", "ui-button", "ui-button-down", "ui-bar", "ui-bar-fill", "ui-slot"]
            r = split(src, d, names)
            self.assertEqual([p["name"] for p in r["pieces"]], [n for n in names if n != "ui-bar-fill"])
            self.assertEqual(r["empty"], ["ui-bar-fill"])
            out = Image.open(os.path.join(d, "ui-slot.png"))
            self.assertEqual(out.mode, "RGBA")
            self.assertEqual(out.size, (46 + 8, 61 + 8), "trimmed to the piece, with a small margin")
            self.assertEqual(out.getpixel((0, 0))[3], 0)


if __name__ == "__main__":
    unittest.main()
