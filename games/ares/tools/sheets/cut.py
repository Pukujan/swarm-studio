"""Cut a painted 3x2 sprite sheet into a strip of frames the game plays, and check it.

    python cut.py sheet.png out.webp            # a character sheet on flat magenta (or green)
    python cut.py fx.png out.webp --fx          # an effect sheet on black (drawn additive)

Character sheets are painted on one flat key colour (magenta #FF00FF by default, chroma
green for pink or purple subjects: engine/keycolor.mjs). The alpha comes from the studio
keyer, scripts/cutout.py key_alpha(): a flood fill from the sheet edges takes the
background, enclosed pools of key colour (between hair locks, inside a wing guard) are
cleared too, the edge gets a soft alpha and the key colour is taken back out of it
(despill). The figure's own white cloth and dark hair are never keyed.

Each painted shape then belongs to the cell holding its centre of mass, so a long sword
arc or a trailing sleeve that crosses into the next cell stays with its own frame instead
of being chopped. Frames keep their place in the cell, so the feet stay on the painted
baseline.

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
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "scripts"))
import cutout  # noqa: E402  the studio keyer

COLS, ROWS = 3, 2


def key_cut(a: np.ndarray):
    """RGB array in; (despilled RGB, alpha) out, from the studio keyer."""
    im = cutout.key_alpha(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB"))
    out = np.asarray(im)
    rgb, al = out[..., :3].astype(int), out[..., 3].copy()
    bg = np.median(a[:20, :20].reshape(-1, 3), 0)
    if bg[0] > 180 and bg[2] > 180 and bg[1] < 90:
        rgb, al = unmix_key(rgb, al, "magenta")
    elif bg[1] > 180 and bg[0] < 90 and bg[2] < 90:
        rgb, al = unmix_key(rgb, al, "green")
    return rgb, al


def unmix_key(rgb: np.ndarray, al: np.ndarray, key) -> tuple[np.ndarray, np.ndarray]:
    """Second pass for chroma keys: paint that is the key colour blended into the figure
    (a soft pocket between hair locks, a glow over the backdrop) is unmixed: its alpha is
    how little key is in it and the key is taken out of its colour. Only pixels with the
    key's own hue count, so a crimson cape or a pink cheek is left alone."""
    r, g, b = (rgb[..., i].astype(float) for i in range(3))
    if key == "magenta":
        s = np.minimum(r, b) - g                          # magenta strength
        hue = (b >= 0.7 * r) & (r >= 0.7 * b)             # red and blue together, unlike a red cape
    else:
        s = g - np.maximum(r, b)
        hue = np.ones_like(s, bool)
    hit = hue & (s > 30) & (al > 0)
    k = np.clip(s / 255.0, 0, 1)                          # share of key in the pixel
    f = np.clip(1 - k, 0.05, 1)
    K = np.array([255.0, 0, 255.0]) if key == "magenta" else np.array([0, 255.0, 0])
    un = (rgb - K * k[..., None]) / f[..., None]
    rgb = np.where(hit[..., None], np.clip(un, 0, 255), rgb)
    if key == "magenta":
        # magenta light the painter spilled onto red cloth and hair: blue rises above where
        # crimson or chestnut would have it. Pull it back; skin, white and gold are untouched.
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        warm = (r > g + 30) & (b > g) & (al > 0)
        rgb = rgb.copy()
        rgb[..., 2] = np.where(warm, np.minimum(b, np.maximum(g, 0.4 * r)), b)
    a = np.where(hit, np.minimum(al, (255 * np.clip((f - 0.12) / 0.88, 0, 1))).astype(np.uint8), al)
    return rgb.astype(int), a


def key_alpha(a: np.ndarray) -> np.ndarray:
    """The studio keyer's alpha for an RGB array (kept for kit.py)."""
    return key_cut(a)[1]


def despill(a: np.ndarray, al: np.ndarray) -> np.ndarray:
    """Take the key colour back out of soft edge pixels, so strands carry no fringe."""
    bg = np.median(a[:20, :20].reshape(-1, 3), 0)
    soft = (al > 0) & (al < 250)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if bg[0] > 180 and bg[2] > 180 and bg[1] < 90:      # magenta
        s = np.clip(np.minimum(r, b) - g, 0, None) * soft
        return np.dstack([r - s, g, b - s])
    if bg[1] > 180 and bg[0] < 90 and bg[2] < 90:       # green
        return np.dstack([r, np.where(soft, np.minimum(g, np.maximum(r, b)), g), b])
    f = al[..., None] / 255.0                            # any other flat colour: unmix it
    un = (a - bg * (1 - f)) / np.maximum(f, 0.25)
    return np.where(soft[..., None], np.clip(un, 0, 255), a)


def cut(path: str, fx: bool = False):
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    H, W = a.shape[:2]
    cw, ch = W // COLS, H // ROWS
    if fx:
        al = np.clip(a.max(2) * 2, 0, 255).astype(np.uint8)
    else:
        a, al = key_cut(a)
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
