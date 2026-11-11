import importlib.util
import os
import sys
import unittest

HAVE = all(importlib.util.find_spec(m) for m in ("numpy", "scipy", "PIL"))
if HAVE:
    import numpy as np

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
    import idle_sheet  # noqa: E402


@unittest.skipUnless(HAVE, "numpy, scipy and Pillow are needed")
class IdleSheetTest(unittest.TestCase):
    def test_the_loop_ends_where_it_started(self):
        fps = 24.0
        # a sway with a 2.5 s period: the best span near 2.8 s is one full period
        frames = [np.full((30, 20), 100 + 80 * np.sin(2 * np.pi * i / (2.5 * fps)), dtype=float) for i in range(96)]
        s, e, _ = idle_sheet.pick_loop(frames, fps)
        self.assertAlmostEqual((e - s) / fps, 2.5, delta=0.1)
        self.assertGreaterEqual(s, round(0.15 * fps))

    def test_a_far_speck_is_dropped_and_a_held_thing_stays(self):
        al = np.zeros((100, 100), np.uint8)
        al[20:90, 40:60] = 255   # the figure
        al[30:40, 61:66] = 255   # a held orb, touching
        al[5:12, 5:12] = 255     # a speck far away
        out, dropped = idle_sheet.keep_figure(al)
        self.assertEqual(dropped, 1)
        self.assertEqual(out[8, 8], 0)
        self.assertEqual(out[35, 63], 255)


    def test_a_cross_fade_between_keys_is_a_ghost_and_a_move_is_not(self):
        def frame(x):
            a = np.zeros((80, 80), np.uint8)
            a[10:70, x:x + 16] = 255
            rgb = np.zeros((80, 80, 4), float)
            rgb[..., :3] = np.where(a[..., None] > 0, 200.0, 0.0)
            rgb[..., 3] = a
            return a, rgb
        a0, p0 = frame(20)
        a1, p1 = frame(30)
        am, pm = frame(25)  # half way: the figure in one place, solid
        mix = (p0 + p1) / 2  # a cross-fade: two see-through figures
        A, px = [a0, am, a1, mix[..., 3].astype(np.uint8)], [p0, pm, p1, mix]
        made = {1: (0, 2, 0.5), 3: (0, 2, 0.5)}
        self.assertEqual(idle_sheet.ghosts(A, px, made), [3])


if __name__ == "__main__":
    unittest.main()
