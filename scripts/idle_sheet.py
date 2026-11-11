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
    python3 idle_sheet.py sheet clip.mp4 out.webp --interp "<in-betweener command>" [--frames 24]

  keys    no video model: close keyframes painted over the same base frame (a cut strip and its
          .json), put back on the key colour and aligned on the feet, the frames between them
          made by the in-betweener, then keyed and packed as above, with a ghost check on every
          made frame (a blend of two keys instead of a move between them)

    python3 idle_sheet.py keys keys.webp keys.json out.webp --interp "<command>" --key '#00FF00'

The in-betweener is a command with {a} {b} {out} {t} in it (two frames, the frame to write, the
time between them), RIFE by default:  rife-ncnn-vulkan -0 {a} -1 {b} -o {out} -s {t} -m <dir>/rife-v4.6

`sheet` writes out.webp, out.json (frames, cell, fps, anchor, qc, video), out-check.png (all
frames on dark, for the frame-by-frame check) and out-loop.webp (the loop, animated, for the chat).
The in-betweener is for characters only: never for FX, and between painted frames only when they
are close keyframes of one pose (big gaps ghost; the keys route checks every frame it makes).
Without one the clip's loop is cut where it meets itself.
Heavy (ffmpeg, RIFE): run it on a machine that can take it (engine/heavy.mjs).
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
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


def rife_cmd(binary: str, model: str = "rife-v4.6") -> str:
    """The RIFE command template for a rife-ncnn-vulkan binary (its models sit next to it)."""
    m = model if os.path.isabs(model) else os.path.join(os.path.dirname(binary), model)
    return f"{shlex.quote(binary)} -0 {{a}} -1 {{b}} -o {{out}} -s {{t}} -m {shlex.quote(m)}"


def interp_between(cmd: str, a: np.ndarray, b: np.ndarray, t: float, tmp: str) -> np.ndarray:
    """One frame at time t between a and b, by the in-betweener command (RIFE or another)."""
    pa, pb, po = (os.path.join(tmp, x) for x in ("ia.png", "ib.png", "io.png"))
    Image.fromarray(a).save(pa)
    Image.fromarray(b).save(pb)
    if os.path.exists(po):
        os.remove(po)
    argv = [x.format(a=pa, b=pb, out=po, t=f"{t:.4f}") for x in shlex.split(cmd)]
    r = subprocess.run(argv, capture_output=True, text=True)
    if r.returncode or not os.path.exists(po):
        raise SystemExit(f"the in-betweener failed: {(r.stderr or r.stdout)[-300:]}")
    out = np.asarray(Image.open(po).convert("RGB").resize((a.shape[1], a.shape[0]))).copy()
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


def make_sheet(clip: str, out: str, interp: str = "", frames: int = 24, bridge: int = 3, cell_max: int = 680) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        raw, fps = read_frames(clip, tmp)
        bg = tuple(int(x) for x in np.median(raw[0][:20, :20].reshape(-1, 3), 0))
        small = [np.asarray(Image.fromarray(f).convert("L").resize((160, round(160 * f.shape[0] / f.shape[1])))).astype(float) for f in raw]
        s, e, seam = pick_loop(small, fps)
        use_rife = bool(interp)
        if use_rife:
            # sampled frames run from s to e; in-between frames on the raw frames bridge e back to s
            idx = np.linspace(s, e, frames - bridge).round().astype(int)
            picked = [raw[i] for i in idx]
            picked += [interp_between(interp, raw[e], raw[s], (k + 1) / (bridge + 1), tmp) for k in range(bridge)]
            step = (e - s) / fps / (frames - bridge - 1)
        else:
            # no in-betweens: the span is cut just before it meets its start again
            idx = np.linspace(s, e, frames + 1).round().astype(int)[:-1]
            picked = [raw[i] for i in idx]
            step = (e - s) / fps / frames
    video = {"clip": os.path.basename(clip), "source_fps": round(fps, 3), "span_s": [round(s / fps, 2), round(e / fps, 2)],
             "sampled": len(idx), "rife": bridge if use_rife else 0, "seam": round(seam, 2), "key": "#%02X%02X%02X" % bg}
    return pack(picked, out, step, bg, cell_max, {"video": video})


def pack(picked, out: str, step: float, bg, cell_max: int = 680, extra: dict = None, made=None) -> dict:
    """Frames on the key colour to the sheet: keyed, despilled, cleared of strays, aligned on the
    feet, one square cell each, with the numbers the check reads. made: {index: (a, b, t)} for
    frames the in-betweener made between keyed neighbours, checked for ghost blends."""
    extra = extra or {}
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
    cell = min(cell_max, side, WEBP_MAX // len(keyed))
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
    if made:
        qc["ghost"] = ghosts(A, px, made)
    problems = []
    if edge:
        problems.append(f"frame {', '.join(str(i + 1) for i in edge)} touches the cell edge")
    if qc["area_spread"] > 1.25:
        problems.append("the figure changes size between frames")
    if qc["jumps"]:
        problems.append(f"a jump at frame {qc['jumps'][0] + 1}")
    if qc["key_left_px"] > cell * cell * 0.002:
        problems.append("key colour left on the figure")
    if qc.get("ghost"):
        problems.append(f"ghost blend at frame {', '.join(str(i + 1) for i in qc['ghost'][:4])}")
    qc["ok"] = not problems
    qc["problems"] = problems
    loop_s = step * len(cells)
    fx, fy = fa[0] or (cell / 2, cell - 1)
    meta = {
        "frames": len(cells), "cell": [cell, cell], "fps": round(1 / step, 2), "loop": True, "blend": "mix",
        "anchor": {"feet": [round(fx), round(fy)]},
        "qc": qc,
        **{k: {**v, "loop_s": round(loop_s, 2)} for k, v in extra.items()},
    }
    base = out.rsplit(".", 1)[0]
    Path(f"{base}.json").write_text(json.dumps(meta, indent=1))
    check(cells, f"{base}-check.png")
    loop_preview(cells, f"{base}-loop.webp", 1000 / meta["fps"])
    return meta


def ghosts(A, px, made) -> list:
    """Frames the in-betweener made that look like two frames blended instead of one move: in
    the places where the two keys differ, a ghost sits at their cross-fade (the made frame is
    close to the mix of the two) and leaves see-through figure behind (much more half-alpha
    edge than the keys have). A real move puts each part in one place, solid."""
    out = []
    half = lambda a: float(((a > 30) & (a < 220)).sum()) / max(1, int((a > 128).sum()))
    for i, (ia, ib, t) in sorted(made.items()):
        a, b, f = px[ia], px[ib], px[i]
        if not (0.25 <= t <= 0.75):
            continue
        diff = np.abs(a - b).mean(2) > 40
        area = max(1, int((A[ia] > 128).sum()))
        if diff.sum() < 0.01 * area:
            continue  # the keys hardly differ here: nothing to ghost
        mix = (1 - t) * a + t * b
        r = float(np.abs(f - mix).mean(2)[diff].mean() / max(1.0, np.abs(a - b).mean(2)[diff].mean()))
        soft = half(A[i]) > 1.6 * max(half(A[ia]), half(A[ib])) + 0.01
        if r < 0.12 or soft:
            out.append(i)
    return out


# The loop the keys make: 0 is the base pose, 1 breathing in, 2 the sway, 3 the blink. Each
# leg is (from, to, frames): breathe in and out, sway out and back, a quick blink; 24 frames.
KEY_LOOP = [(0, 1, 6), (1, 0, 6), (0, 2, 4), (2, 0, 4), (0, 3, 2), (3, 0, 2)]


def make_keys(strip: str, strip_json: str, out: str, interp: str, key, cell_max: int = 680, fps: float = 10.0) -> dict:
    """Close painted keyframes to a looping idle: the keys back on the key colour, aligned on the
    feet, the frames between them made by the in-betweener (on the flat-colour frames, before
    keying, as for a clip's seam), then packed and checked like a clip's sheet."""
    meta_in = json.loads(Path(strip_json).read_text())
    cw, ch = meta_in["cell"]
    im = Image.open(strip).convert("RGBA")
    n = min(4, meta_in.get("frames", 6))
    cells = [np.asarray(im.crop((i * cw, 0, (i + 1) * cw, ch))) for i in range(n)]
    if n < 4:
        raise SystemExit("fewer than four keyframes")
    # on one canvas with room around, the feet of every key where the first one's are
    pad = max(cw, ch) // 6
    canv = []
    for c in cells:
        big = np.zeros((ch + 2 * pad, cw + 2 * pad, 4), np.uint8)
        big[pad:pad + ch, pad:pad + cw] = c
        canv.append(big)
    feet = [feet_of(c[..., 3]) for c in canv]
    if not all(feet):
        raise SystemExit("a keyframe has no figure")
    canv = [shift(c, int(round(feet[0][0] - f[0])), int(round(feet[0][1] - f[1]))) for c, f in zip(canv, feet)]
    # keys that are not one pose (the figure moved or changed size) would ghost: refused here
    m0 = canv[0][..., 3] > 128
    for i, c in enumerate(canv[1:], 1):
        m = c[..., 3] > 128
        iou = (m & m0).sum() / max(1, (m | m0).sum())
        if iou < 0.75:
            raise SystemExit(f"keyframe {i + 1} is too far from the first (overlap {iou:.2f}): it would ghost")
    flat = []
    for c in canv:
        rgb = c[..., :3].astype(float)
        al = c[..., 3:4].astype(float) / 255
        flat.append((rgb * al + np.array(key, float) * (1 - al)).round().astype(np.uint8))
    picked, made = [], {}
    with tempfile.TemporaryDirectory() as tmp:
        for a, b, steps in KEY_LOOP:
            picked.append(flat[a])
            start = len(picked) - 1
            for k in range(1, steps):
                t = k / steps
                picked.append(interp_between(interp, flat[a], flat[b], t, tmp))
                made[len(picked) - 1] = (start, (start + steps) % sum(x[2] for x in KEY_LOOP), t)
    keys_at = {i for i in range(len(picked)) if i not in made}
    return pack(picked, out, 1 / fps, tuple(key), cell_max,
                {"keys": {"strip": os.path.basename(strip), "keys": n, "made": len(made), "at": sorted(keys_at)}}, made=made)


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
    sh.add_argument("--frames", type=int, default=24)
    ky = sub.add_parser("keys")
    ky.add_argument("strip"); ky.add_argument("strip_json"); ky.add_argument("out")
    ky.add_argument("--key", default="#00FF00")
    ky.add_argument("--fps", type=float, default=10.0)
    for p in (sh, ky):
        p.add_argument("--interp", default=os.environ.get("SWARM_INTERP", ""), help="in-betweener command with {a} {b} {out} {t}")
        p.add_argument("--rife", default=os.environ.get("SWARM_RIFE", ""), help="a rife-ncnn-vulkan binary (the default in-betweener)")
        p.add_argument("--model", default="rife-v4.6")
        p.add_argument("--cell", type=int, default=680)
    o = ap.parse_args(argv)
    if o.cmd == "start":
        start_frame(figure_of(o.src, o.frame, o.cell), hex_rgb(o.key), o.aspect).save(o.out)
        print(json.dumps({"ok": True, "path": o.out}))
        return 0
    interp = o.interp or (rife_cmd(o.rife, o.model) if o.rife and os.path.exists(o.rife) else "")
    if o.cmd == "keys":
        if not interp:
            raise SystemExit("no in-betweener")
        print(json.dumps(make_keys(o.strip, o.strip_json, o.out, interp, hex_rgb(o.key), o.cell, o.fps)))
        return 0
    if not shutil.which("ffmpeg"):
        raise SystemExit("no ffmpeg")
    meta = make_sheet(o.clip, o.out, interp, o.frames, cell_max=o.cell)
    print(json.dumps(meta))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
