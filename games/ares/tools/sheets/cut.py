"""Cut a painted 3x2 sprite sheet into a strip of frames the game plays, and check it.

    python cut.py sheet.png out.webp            # a character sheet on flat magenta (or green, or grey)
    python cut.py fx.png out.webp --fx          # an effect sheet on black (drawn additive)

Character sheets: the flat key colour (magenta #FF00FF by default) is keyed out from the
corner colour, its spill is pulled out of the outline, the inside of the
body is made solid (only the edges stay soft), and each painted shape belongs to
the cell holding its centre, so a long sword arc or a trailing sleeve that crosses
into the next cell stays with its own frame instead of being chopped. Frames keep
their place in the cell, so the feet stay on the painted baseline.

Effect sheets keep their black: the engine adds them as light.

Writes out.webp (frames side by side, each one cell wide) and out.json:
{"frames", "cell": [w, h], "blend", "qc": {"ok", "frames", "edge", "height_spread"}}.
qc.edge lists frames that touch their cell border (something may be cut off).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import scipy.ndimage as nd
from PIL import Image, ImageFilter

COLS, ROWS = 3, 2


def key_alpha(a: np.ndarray) -> np.ndarray:
    bg = np.median(a[:20, :20].reshape(-1, 3), 0)
    d = np.sqrt(((a - bg) ** 2).sum(2))
    al = np.asarray(Image.fromarray(np.clip((d - 10) * 12, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)))
    body = nd.binary_closing(al > 40, iterations=2)
    # fill holes inside the body (pale cloth close to the grey), but not gaps that show the
    # plain background, like the inside of a halo or the space under an arm
    holes = nd.binary_fill_holes(body) & ~body
    solid = body | (holes & (d > 6))
    core = nd.binary_erosion(solid, iterations=2)
    out = np.where(core, 255, al).astype(np.uint8)
    # a key colour (magenta or green) is never on the figure: wherever it shows, even in a
    # gap the closing filled (between fur, strands or robe tatters), it is background
    if is_key(bg):
        out = np.minimum(out, np.clip((d - 70) * 4.5, 0, 255)).astype(np.uint8)
    return out


def is_key(bg) -> bool:
    r, g, b = bg
    return (r > 180 and b > 180 and g < 90) or (g > 180 and r < 110 and b < 110)


def despill(a: np.ndarray, al: np.ndarray) -> np.ndarray:
    """Magenta or green from the key colour bleeds into the outline: in the band near the
    clear part only, pull the channels it lifts back down, so no coloured rim shows."""
    bg = np.median(a[:20, :20].reshape(-1, 3), 0)
    band = ~nd.binary_erosion(al >= 250, iterations=7) & (al > 0)
    out = a.copy()
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    if bg[0] > 180 and bg[2] > 180 and bg[1] < 90:
        k = np.clip(np.minimum(r, b) - g, 0, None) * band
        out[..., 0], out[..., 2] = r - k, b - k
    elif bg[1] > 180 and bg[0] < 110 and bg[2] < 110:
        out[..., 1] = np.where(band, np.minimum(g, np.maximum(r, b)), g)
    return out


def cut(path: str, fx: bool = False):
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    H, W = a.shape[:2]
    cw, ch = W // COLS, H // ROWS
    al = np.clip(a.max(2) * 2, 0, 255).astype(np.uint8) if fx else key_alpha(a)
    if not fx:
        a = despill(a, al)
    lab, n = nd.label(al > 8, structure=np.ones((3, 3)))
    idx = np.arange(1, n + 1)
    if n:
        cy, cx = np.array(nd.center_of_mass(al > 8, lab, idx)).reshape(-1, 2).T
        own = np.clip((cy // ch).astype(int), 0, ROWS - 1) * COLS + np.clip((cx // cw).astype(int), 0, COLS - 1)
    else:
        own = np.array([], int)
    frames = []
    for i in range(COLS * ROWS):
        mask = np.isin(lab, idx[own == i]) if n else np.zeros_like(al, bool)
        m = np.where(mask, al, 0).astype(np.uint8)
        r, c = divmod(i, COLS)
        x0, y0 = c * cw, r * ch
        # a shape owned by this cell may reach past it: take a window one cell wider on each side
        X0, Y0, X1, Y1 = max(0, x0 - cw // 4), max(0, y0 - ch // 4), min(W, x0 + cw + cw // 4), min(H, y0 + ch + ch // 4)
        rgb = a[Y0:Y1, X0:X1].astype(np.uint8)
        frame = np.dstack([rgb, m[Y0:Y1, X0:X1]])
        frames.append((frame, x0 - X0, y0 - Y0))
    return frames, (cw, ch)


def check(frames, cell):
    cw, ch = cell
    present, edge, heights = 0, [], []
    for i, (f, ox, oy) in enumerate(frames):
        m = f[..., 3] > 40
        if m.sum() < 500:
            continue
        present += 1
        ys, xs = np.nonzero(m)
        heights.append(ys.max() - ys.min())
        # outside its own cell window = it spilled over (fine), touching the wider window edge = cut off
        if xs.min() <= 1 or ys.min() <= 1 or xs.max() >= f.shape[1] - 2 or ys.max() >= f.shape[0] - 2:
            edge.append(i)
    spread = round(max(heights) / max(1, min(heights)), 2) if heights else 0
    return {"ok": present == len(frames) and not edge, "frames": present, "edge": edge, "height_spread": spread}


def write(frames, cell, out: str, fx: bool):
    cw, ch = cell
    pad_w, pad_h = cw + cw // 2, ch + ch // 2
    strip = Image.new("RGBA", (pad_w * len(frames), pad_h), (0, 0, 0, 255 if fx else 0))
    for i, (f, ox, oy) in enumerate(frames):
        if fx:  # effects stay light on black: keep only this frame's own shapes, fully opaque
            f = np.dstack([(f[..., :3] * (f[..., 3:] > 0)).astype(np.uint8), np.full(f.shape[:2], 255, np.uint8)])
        # every frame sits at the same place in its slot: cell origin at (cw/4, ch/4)
        strip.alpha_composite(Image.fromarray(f), (i * pad_w + cw // 4 - ox, ch // 4 - oy))
    strip.save(out, quality=90, method=6)
    return pad_w, pad_h


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    src, out, fx = argv[0], argv[1], "--fx" in argv
    frames, cell = cut(src, fx)
    qc = check(frames, cell)
    slot = write(frames, cell, out, fx)
    meta = {"frames": len(frames), "cell": list(slot), "blend": "add" if fx else "mix", "source": Path(src).name, "qc": qc}
    Path(out).with_suffix(".json").write_text(json.dumps(meta, indent=1))
    print(json.dumps(meta))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
