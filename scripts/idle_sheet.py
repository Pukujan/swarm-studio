"""One painted frame to a looping idle sheet, through a video model (docs/specs/24-video-idle.md).

The way ARES's Oracle and Baker idles were made (games/ares/assets/skins/*/default/*-idle.json):

  start   the figure's first painted frame, cut out, put on one flat key colour
          (#00FF00, or #FF00FF for a green figure) at the size the video model draws
  sheet   the model's clip back to a sheet: a ~2.8 s loop span is picked where the last frame
          comes closest to the first, the seam is closed with RIFE frames made on the raw
          (still green) video frames, then every frame is keyed, despilled, cleared of stray
          specks, aligned on the feet, cropped to one square cell (<= 680 px, so 24 frames stay
          under WebP's 16383 px width) and packed side by side

    python3 idle_sheet.py start figure.webp start.png --cell 768 --key '#00FF00' --aspect 1:1
    python3 idle_sheet.py sheet clip.mp4 out.webp --rife /path/rife-ncnn-vulkan [--frames 24]

`sheet` writes out.webp, out.json (frames, cell, fps, anchor, qc, video), out-check.png (all
frames on dark, for the frame-by-frame check) and out-loop.webp (the loop, animated, for the chat).
RIFE is for characters only and only between neighbouring frames of one clip: never for FX, never
between separately painted frames (those ghost). Without --rife the loop is cut where it meets itself.
Heavy (ffmpeg, RIFE): run it on a machine that can take it (engine/heavy.mjs).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import scipy.ndimage as nd
from PIL import Image

HERE = Path(__file__).resolve().parent
# the ARES sheet keyer: next to this file when it was copied to a job folder, else in the repo
for p in (HERE, HERE.parent / "games" / "ares" / "tools" / "sheets"):
    if (p / "cut.py").exists():
        sys.path.insert(0, str(p))
        break
from cut import despill, key_alpha  # noqa: E402

WEBP_MAX = 16383


def hex_rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ---------- start: the first frame the video model animates


def figure_of(path: str, frame: int = 0, cell: int = 0) -> Image.Image:
    """The figure alone (RGBA, cropped to its alpha): frame n of a strip, or a whole sprite."""
    im = Image.open(path).convert("RGBA")
    if cell and im.width > cell:
        im = im.crop((frame * cell, 0, (frame + 1) * cell, im.height))
    box = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        raise SystemExit("the picture has no figure in it")
    return im.crop(box)


def start_frame(fig: Image.Image, key, aspect: str = "1:1", height: int = 720) -> Image.Image:
    """The figure on flat key colour, about 80% of the frame tall, centred, feet near the bottom
    with room under them, at the model's own frame shape (it draws 720p)."""
    aw, ah = (int(x) for x in aspect.split(":"))
    W, H = round(height * aw / ah), height
    s = min(H * 0.80 / fig.height, W * 0.86 / fig.width)
    f = fig.resize((max(1, round(fig.width * s)), max(1, round(fig.height * s))), Image.LANCZOS)
    out = Image.new("RGB", (W, H), key)
    out.paste(f, ((W - f.width) // 2, round(H * 0.93) - f.height), f)
    return out


# ---------- sheet: the clip back to a looping sheet


def read_frames(clip: str, tmp: str):
    subprocess.run(["ffmpeg", "-v", "error", "-i", clip, "-vsync", "0", os.path.join(tmp, "f%04d.png")], check=True)
    files = sorted(Path(tmp).glob("f*.png"))
    if len(files) < 24:
        raise SystemExit(f"the clip has only {len(files)} frames")
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                          "-of", "csv=p=0", clip], capture_output=True, text=True).stdout.strip()
    num, _, den = out.partition("/")
    fps = float(num) / float(den or 1) if num else 24.0
    return [np.asarray(Image.open(f).convert("RGB")) for f in files], fps


def figure_mask(a: np.ndarray, bg) -> np.ndarray:
    return np.sqrt(((a.astype(int) - np.array(bg)) ** 2).sum(2)) > 60


def pick_loop(small: list, fps: float, span=(2.2, 3.0), lead=(0.15, 0.6), want=2.8):
    """(start, end) frame indices: a span of about 2.8 s whose end looks most like its start.
    The first moments are skipped (a model often settles there). Scored on small grey frames,
    the head (top third) counted twice, so the face comes back to where it started; a span far
    from 2.8 s costs a little more (a long one runs into the clip's bigger gestures)."""
    n = len(small)
    top = max(1, small[0].shape[0] // 3)
    best = None
    for s in range(max(0, round(lead[0] * fps)), min(n - 1, round(lead[1] * fps)) + 1):
        for e in range(s + round(span[0] * fps), min(n - 1, s + round(span[1] * fps)) + 1):
            diff = np.abs(small[e] - small[s])
            d = float(diff.mean() + diff[:top].mean()) * (1 + 0.15 * abs((e - s) / fps - want))
            if best is None or d < best[0]:
                best = (d, s, e)
    if best is None:  # a short clip: as long a span as it has
        s = min(n - 1, round(lead[0] * fps))
        best = (float(np.abs(small[-1] - small[s]).mean()), s, n - 1)
    return best[1], best[2], best[0]


def rife_between(binary: str, model: str, a: np.ndarray, b: np.ndarray, t: float, tmp: str) -> np.ndarray:
    pa, pb, po = (os.path.join(tmp, x) for x in ("ra.png", "rb.png", "ro.png"))
    Image.fromarray(a).save(pa)
    Image.fromarray(b).save(pb)
    m = model if os.path.isabs(model) else os.path.join(os.path.dirname(binary), model)
    r = subprocess.run([binary, "-0", pa, "-1", pb, "-o", po, "-s", f"{t:.4f}", "-m", m], capture_output=True, text=True)
    if r.returncode or not os.path.exists(po):
        raise SystemExit(f"rife failed: {r.stderr[-300:]}")
    out = np.asarray(Image.open(po).convert("RGB")).copy()
    os.remove(po)
    return out


def keep_figure(al: np.ndarray):
    """Specks and stray shapes the model added away from the figure are dropped: the largest
    shape stays, with anything touching it (a held orb, a ribbon) within a few pixels."""
    lab, n = nd.label(al > 40)
    if n <= 1:
        return al, 0
    sizes = nd.sum(np.ones_like(lab), lab, range(1, n + 1))
    main = lab == (int(np.argmax(sizes)) + 1)
    near = nd.binary_dilation(main, iterations=6)
    keep = np.isin(lab, [i for i in range(1, n + 1) if (near & (lab == i)).any()])
    soft = nd.binary_dilation(keep, iterations=2)
    dropped = int(sum(1 for i in range(1, n + 1) if sizes[i - 1] > 30 and not (near & (lab == i)).any()))
    return np.where(soft, al, 0).astype(np.uint8), dropped


def feet_of(al: np.ndarray):
    """(x, y) of the feet: the bottom row of the figure, and the middle of its lowest 6%."""
    rows = np.where((al > 128).sum(1) >= 3)[0]
    if not len(rows):
        return None
    top, bot = rows[0], rows[-1]
    band = al[max(top, bot - max(4, round((bot - top) * 0.06))):bot + 1] > 128
    xs = np.where(band.any(0))[0]
    return (float(xs.mean()) if len(xs) else al.shape[1] / 2, float(bot))


def shift(rgba: np.ndarray, dx: int, dy: int) -> np.ndarray:
    if not dx and not dy:
        return rgba
    out = np.zeros_like(rgba)
    H, W = rgba.shape[:2]
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    out[yd, xd] = rgba[ys, xs]
    return out


def smooth(v, k=5):
    v = np.asarray(v, float)
    pad = np.pad(v, k // 2, mode="edge")
    return np.array([np.median(pad[i:i + k]) for i in range(len(v))])


def key_green_left(rgba: np.ndarray, bg) -> int:
    """Pixels on the figure still the key colour's hue (a rim or a pool the key missed)."""
    a = rgba[..., :3].astype(int)
    vis = rgba[..., 3] > 60
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if bg[1] > 180 and bg[0] < 110:
        k = (g > 150) & (g > r + 60) & (g > b + 60)
    else:
        k = (r > 150) & (b > 150) & (g < 90)
    return int((k & vis).sum())


def make_sheet(clip: str, out: str, rife: str = "", model: str = "rife-v4.6", frames: int = 24, bridge: int = 3,
               cell_max: int = 680, start_png: str = "") -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        raw, fps = read_frames(clip, tmp)
        bg = tuple(int(x) for x in np.median(raw[0][:20, :20].reshape(-1, 3), 0))
        small = [np.asarray(Image.fromarray(f).convert("L").resize((160, round(160 * f.shape[0] / f.shape[1])))).astype(float) for f in raw]
        s, e, seam = pick_loop(small, fps)
        use_rife = bool(rife) and os.path.exists(rife)
        if use_rife:
            # sampled frames run from s to e; RIFE frames on the raw frames bridge e back to s
            idx = np.linspace(s, e, frames - bridge).round().astype(int)
            picked = [raw[i] for i in idx]
            picked += [rife_between(rife, model, raw[e], raw[s], (k + 1) / (bridge + 1), tmp) for k in range(bridge)]
            step = (e - s) / fps / (frames - bridge - 1)
        else:
            # no in-betweens: the span is cut just before it meets its start again
            idx = np.linspace(s, e, frames + 1).round().astype(int)[:-1]
            picked = [raw[i] for i in idx]
            step = (e - s) / fps / frames
    # key, despill, drop strays
    keyed, dropped = [], []
    for f in picked:
        al = key_alpha(f.astype(int))
        rgb = despill(f.astype(int), al)
        al, d = keep_figure(al)
        dropped.append(d)
        keyed.append(np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), al]))
    # feet: a locked camera hardly drifts; what drift there is (and a model's slow creep) is
    # taken out, smoothed so a swaying hem never makes the figure jitter
    feet = [feet_of(k[..., 3]) for k in keyed]
    ok = [f for f in feet if f]
    ref = (float(np.median([f[0] for f in ok])), float(np.median([f[1] for f in ok])))
    dx = smooth([(ref[0] - f[0]) if f else 0 for f in feet])
    dy = smooth([(ref[1] - f[1]) if f else 0 for f in feet])
    keyed = [shift(k, int(round(x)), int(round(y))) for k, x, y in zip(keyed, dx, dy)]
    # one square cell around every frame, the feet at the same place in each
    union = np.zeros(keyed[0].shape[:2], bool)
    for k in keyed:
        union |= k[..., 3] > 24
    ys, xs = np.where(union)
    top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    side = int(max(bot - top, right - left) * 1.08) + 8
    cx = (left + right) / 2
    x0, y0 = int(round(cx - side / 2)), int(bot + side * 0.04 + 4 - side)
    cell = min(cell_max, side, WEBP_MAX // frames)
    cells = []
    for k in keyed:
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(Image.fromarray(k), (-x0, -y0))
        cells.append(canvas.resize((cell, cell), Image.LANCZOS) if cell != side else canvas)
    strip = Image.new("RGBA", (cell * len(cells), cell))
    for i, c in enumerate(cells):
        strip.paste(c, (i * cell, 0))
    strip.save(out, quality=92, method=6) if out.endswith(".webp") else strip.save(out)
    # the numbers the check reads
    A = [np.asarray(c.getchannel("A")) for c in cells]
    area = [int((a > 128).sum()) for a in A]
    edge = [i for i, a in enumerate(A) if (a[0] > 40).any() or (a[-1] > 40).any() or (a[:, 0] > 40).any() or (a[:, -1] > 40).any()]
    px = [np.asarray(c).astype(float) for c in cells]
    steps = [float(np.abs(px[(i + 1) % len(px)] - px[i]).mean()) for i in range(len(px))]
    med = float(np.median(steps)) or 1.0
    # the head: the top fifth of the figure, against the first frame (a face that changes)
    fb = Image.fromarray(A[0]).point(lambda v: 255 if v > 128 else 0).getbbox() or (0, 0, cell, cell)
    hb = (fb[0], fb[1], fb[2], fb[1] + max(8, (fb[3] - fb[1]) // 5))
    head0 = px[0][hb[1]:hb[3], hb[0]:hb[2]]
    head = [float(np.abs(p[hb[1]:hb[3], hb[0]:hb[2]] - head0).mean()) for p in px]
    fa = [feet_of(a) for a in A]
    qc = {
        "frames": len(cells),
        "edge": edge,
        "area_spread": round(max(area) / max(1, min(area)), 3),
        "jumps": [i for i, v in enumerate(steps) if v > max(3 * med, 6)],
        "seam_vs_step": round(steps[-1] / med, 2),
        "head_drift": round(max(head), 2),
        "key_left_px": max(key_green_left(np.asarray(c), bg) for c in cells),
        "strays_dropped": int(sum(dropped)),
        "feet_x_spread_px": round(float(np.ptp([f[0] for f in fa if f])), 1),
        "feet_y_spread_px": round(float(np.ptp([f[1] for f in fa if f])), 1),
    }
    problems = []
    if edge:
        problems.append(f"frame {', '.join(str(i + 1) for i in edge)} touches the cell edge")
    if qc["area_spread"] > 1.25:
        problems.append("the figure changes size between frames")
    if qc["jumps"]:
        problems.append(f"a jump at frame {qc['jumps'][0] + 1}")
    if qc["key_left_px"] > cell * cell * 0.002:
        problems.append("key colour left on the figure")
    qc["ok"] = not problems
    qc["problems"] = problems
    loop_s = step * len(cells)
    fx, fy = fa[0] or (cell / 2, cell - 1)
    meta = {
        "frames": len(cells), "cell": [cell, cell], "fps": round(1 / step, 2), "loop": True, "blend": "mix",
        "anchor": {"feet": [round(fx), round(fy)]},
        "qc": qc,
        "video": {"clip": os.path.basename(clip), "source_fps": round(fps, 3), "span_s": [round(s / fps, 2), round(e / fps, 2)],
                  "loop_s": round(loop_s, 2), "sampled": len(idx), "rife": bridge if use_rife else 0, "seam": round(seam, 2),
                  "key": "#%02X%02X%02X" % bg},
    }
    base = out.rsplit(".", 1)[0]
    Path(f"{base}.json").write_text(json.dumps(meta, indent=1))
    check(cells, f"{base}-check.png")
    loop_preview(cells, f"{base}-loop.webp", 1000 / meta["fps"])
    return meta


def check(cells, path: str, cols: int = 6, size: int = 220):
    """All the frames in order on dark, numbered by place, for the frame-by-frame check."""
    rows = -(-len(cells) // cols)
    out = Image.new("RGB", (cols * size, rows * size), (28, 28, 32))
    for i, c in enumerate(cells):
        t = c.resize((size, size), Image.LANCZOS)
        out.paste(t, ((i % cols) * size, (i // cols) * size), t)
    out.save(path)


def loop_preview(cells, path: str, ms: float, size: int = 320):
    frames = []
    for c in cells:
        bgc = Image.new("RGBA", (size, size), (28, 28, 32, 255))
        t = c.resize((size, size), Image.LANCZOS)
        bgc.alpha_composite(t)
        frames.append(bgc.convert("RGB"))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=round(ms), loop=0, quality=80)


def main(argv):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    st = sub.add_parser("start")
    st.add_argument("src"); st.add_argument("out")
    st.add_argument("--cell", type=int, default=0, help="frame width when src is a strip")
    st.add_argument("--frame", type=int, default=0)
    st.add_argument("--key", default="#00FF00")
    st.add_argument("--aspect", default="1:1")
    sh = sub.add_parser("sheet")
    sh.add_argument("clip"); sh.add_argument("out")
    sh.add_argument("--rife", default=os.environ.get("SWARM_RIFE", ""))
    sh.add_argument("--model", default="rife-v4.6")
    sh.add_argument("--frames", type=int, default=24)
    sh.add_argument("--cell", type=int, default=680)
    o = ap.parse_args(argv)
    if o.cmd == "start":
        start_frame(figure_of(o.src, o.frame, o.cell), hex_rgb(o.key), o.aspect).save(o.out)
        print(json.dumps({"ok": True, "path": o.out}))
        return 0
    if not shutil.which("ffmpeg"):
        raise SystemExit("no ffmpeg")
    meta = make_sheet(o.clip, o.out, o.rife, o.model, o.frames, cell_max=o.cell)
    print(json.dumps(meta))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
