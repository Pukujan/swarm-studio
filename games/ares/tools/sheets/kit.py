"""Cut painted stage sheets into an ARES stage art kit (see data/CONTENT.md section 1).

    python3 kit.py <stage> <raw dir> [--out assets/stages]

<raw dir> holds the paintings for that stage, all on flat magenta #FF00FF (chroma green #00FF00
for pink or purple subjects) except the sky; never grey or white:
    <stage>-sky.png      far background, 3072x1024 (its seam is blended so it tiles), or
                         1536 wide (mirrored to tile)
    <stage>-kitA.png     floating platforms: 1 long bridge, 2 ledges, 2 steps
    <stage>-kitB.png     ground pieces: stairs, column, wall, 2 props
    <stage>-far.png      3-5 distant islands / towers
    <stage>-ground.png   side view of the floor: key colour above, floor from its top edge down
    <stage>-fore.png     2-4 dark foreground silhouettes
Optional <stage>-roles.json overrides the guessed roles: {"kitB": ["stairs", "prop", ...]}
in left-to-right order of the cut pieces.

Writes assets/stages/<stage>/{sky,ground,far-*,fore-*}.webp, pieces/*.webp and kit.json,
and prints warnings (pieces touching the sheet edge, unexpected piece counts).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import scipy.ndimage as nd
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from cut import despill, key_alpha  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

# night 0..1: a dark layer over the scenery under the fighters (web/mood.js); moon: where the
# painted moon sits in the sky, as fractions of sky.webp (found from the pixels when "auto");
# storm: lightning; wet: puddle reflections; flicker: lantern / brazier light; heat: heat haze
LOOK = {
    "ember": {"tint": "#ffe2b8", "haze": ["rgba(255,246,226,0)", "rgba(222,214,196,0.22)"], "weather": "none", "flicker": 0.3},
    "gold": {"tint": "#e2f4ea", "haze": ["rgba(226,244,236,0)", "rgba(176,212,202,0.20)"], "weather": "none", "flicker": 0.15},
    "snow": {"tint": "#ffd8c4", "haze": ["rgba(255,236,226,0)", "rgba(226,196,190,0.26)"], "weather": "snow", "flicker": 0.2},
    "crimson": {"tint": "#ff9a70", "haze": ["rgba(60,50,60,0)", "rgba(20,12,16,0.40)"], "weather": "rain",
                "night": 0.3, "storm": True, "wet": True, "flicker": 0.6},
    "ruin": {"tint": "#ffe6c0", "haze": ["rgba(20,16,20,0)", "rgba(10,8,10,0.30)"], "weather": "petals",
             "night": 0.5, "moon": "auto", "flicker": 0.7},
    "inferno": {"tint": "#ff7a3c", "haze": ["rgba(255,120,60,0)", "rgba(90,10,10,0.40)"], "weather": "embers",
                "heat": 1.0, "flicker": 0.5},
}
WEBP = dict(quality=88, method=6)
# the kitB prompt asks for: stairs, column, wall, then two props
KITB_ORDER = ["stairs", "column", "wall", "prop", "prop"]
warnings: list[str] = []


def load(path: Path):
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    al = key_alpha(a)
    return despill(a, al).astype(np.uint8), al


def components(al: np.ndarray, want: int | None, name: str, join: int = 14):
    """Group painted shapes (a flame with its brazier, a chip under a ledge) into pieces."""
    H, W = al.shape
    solid = al > 40
    grouped = nd.binary_dilation(solid, iterations=join)
    lab, n = nd.label(grouped)
    lab = np.where(al > 8, lab, 0)
    boxes = []
    for i, sl in enumerate(nd.find_objects(lab), 1):
        if sl is None:
            continue
        area = int((lab[sl] == i).sum())
        boxes.append((area, i, sl))
    if not boxes:
        return lab, []
    big = max(b[0] for b in boxes)
    boxes = [b for b in boxes if b[0] > max(1500, big * 0.02)]
    if want and len(boxes) != want:
        warnings.append(f"{name}: found {len(boxes)} pieces, wanted {want}")
        if len(boxes) > want:
            boxes = sorted(boxes, reverse=True)[:want]
    for _, i, sl in boxes:
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if y0 <= 1 or x0 <= 1 or y1 >= H - 1 or x1 >= W - 1:
            warnings.append(f"{name}: piece at x={x0} y={y0} touches the sheet edge (may be cut off)")
    # reading order: rows, then left to right
    boxes.sort(key=lambda b: (round(b[2][0].start / (H / 4)), b[2][1].start))
    return lab, [(i, sl) for _, i, sl in boxes]


def crop(rgb, al, lab, i, sl, pad=6):
    H, W = al.shape
    y0, y1 = max(0, sl[0].start - pad), min(H, sl[0].stop + pad)
    x0, x1 = max(0, sl[1].start - pad), min(W, sl[1].stop + pad)
    m = np.where(lab[y0:y1, x0:x1] == i, al[y0:y1, x0:x1], 0).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb[y0:y1, x0:x1], m]), "RGBA")


def measure(im: Image.Image, role: str):
    """top: first row solid across the middle; l, r: the solid run there (image px)."""
    m = np.asarray(im)[..., 3] > 128
    h, w = m.shape
    if role == "stairs":
        cols = slice(int(w * 0.78), int(w * 0.92))  # the top step (stairs rise left to right)
    else:
        cols = slice(int(w * 0.4), int(w * 0.6))
    frac = m[:, cols].mean(1)
    rows = np.nonzero(frac > 0.85)[0]
    top = int(rows[0]) if len(rows) else 0
    # step a few rows down past the soft rim so l/r measure the real deck
    row = m[min(h - 1, top + 3)]
    c = (cols.start + cols.stop) // 2
    l = c
    while l > 0 and row[l - 1]:
        l -= 1
    r = c
    while r < w - 1 and row[r + 1]:
        r += 1
    if role == "stairs":
        l = int(np.nonzero(m.any(0))[0][0])  # the climb starts at the foot
    return {"w": w, "h": h, "top": top, "l": int(l), "r": int(r)}


def rises_left_to_right(im: Image.Image) -> bool:
    m = np.asarray(im)[..., 3] > 128
    w = m.shape[1]
    first = lambda cs: np.argmax(m[:, cs].any(1))
    return first(slice(int(w * 0.75), w)) <= first(slice(0, int(w * 0.25)))


def guess_kitA(ims):
    order = sorted(range(len(ims)), key=lambda k: -ims[k].width)
    roles = [""] * len(ims)
    for rank, k in enumerate(order):
        roles[k] = "bridge" if rank == 0 else "ledge" if rank <= 2 else "step"
    return roles


def guess_kitB(ims):
    n = len(ims)
    roles = [""] * n
    by_area = sorted(range(n), key=lambda k: ims[k].width * ims[k].height)
    for k in by_area[:2]:
        roles[k] = "prop"
    rest = by_area[2:]
    if rest:
        stairs = max(rest, key=lambda k: ims[k].width / ims[k].height)
        roles[stairs] = "stairs"
        tall = sorted([k for k in rest if k != stairs], key=lambda k: ims[k].width)
        for j, k in enumerate(tall):
            roles[k] = "column" if j == 0 else "wall"
    return roles


def tile_ground(rgb, al, name):
    H, W = al.shape
    solid = al > 128
    tops = np.array([np.argmax(solid[:, x]) if solid[:, x].any() else H for x in range(W)])
    line = int(np.median(tops))
    head = 22
    y0 = max(0, line - head)
    # keep it opaque from just under the walk line down
    al = al.copy()
    al[line + 6:] = 255
    a = np.dstack([rgb, al]).astype(float)[y0:]
    ov = W // 8
    core = a[:, : W - ov].copy()
    t = np.linspace(0, 1, ov)[None, :, None]
    core[:, :ov] = a[:, W - ov:] * (1 - t) + a[:, :ov] * t
    out = Image.fromarray(np.clip(core, 0, 255).astype(np.uint8), "RGBA")
    if abs(np.median(tops) - np.percentile(tops, 90)) > 30:
        warnings.append(f"{name}: ground top edge is uneven")
    # the walk line sits a little into the paved band, so feet stand on the floor, not its rim
    return out, line - y0 + int(out.height * 0.07)


def build(stage: str, raw: Path, out_root: Path):
    out = out_root / stage
    (out / "pieces").mkdir(parents=True, exist_ok=True)
    kit = {"stage": stage, **LOOK.get(stage, LOOK["ember"])}
    over = {}
    if (raw / f"{stage}-roles.json").exists():
        over = json.loads((raw / f"{stage}-roles.json").read_text())

    sky = Image.open(raw / f"{stage}-sky.png").convert("RGB")
    if sky.width >= 2 * sky.height:
        # a wide panorama: fold its right end over its left so it tiles without a seam
        a = np.asarray(sky).astype(float)
        W = a.shape[1]
        ov = W // 10
        t = np.linspace(0, 1, ov)[None, :, None]
        core = a[:, : W - ov].copy()
        core[:, :ov] = a[:, W - ov:] * (1 - t) + a[:, :ov] * t
        wide = Image.fromarray(core.astype(np.uint8)).resize((3072, 1024), Image.LANCZOS)
    else:
        # the sky plus its mirror image, so it tiles left-right without a seam
        wide = Image.new("RGB", (sky.width * 2, sky.height))
        wide.paste(sky, (0, 0))
        wide.paste(sky.transpose(Image.FLIP_LEFT_RIGHT), (sky.width, 0))
    wide.save(out / "sky.webp", **WEBP)
    if kit.get("moon") == "auto":
        lum = nd.gaussian_filter(np.asarray(wide.convert("L")).astype(float), 24)
        y, x = np.unravel_index(np.argmax(lum[: lum.shape[0] * 2 // 3]), lum.shape)
        kit["moon"] = {"x": round(x / wide.width, 3), "y": round(y / wide.height, 3)}

    rgb, al = load(raw / f"{stage}-ground.png")
    g, top = tile_ground(rgb, al, f"{stage}-ground")
    g.save(out / "ground.webp", **WEBP)
    kit["ground"] = {"file": "ground.webp", "top": int(top), "w": g.width, "h": g.height}

    rgb, al = load(raw / f"{stage}-far.png")
    lab, comps = components(al, None, f"{stage}-far")
    kit["far"] = []
    for n, (i, sl) in enumerate(comps):
        im = crop(rgb, al, lab, i, sl)
        # far scenery is cut flat at the bottom: fade its lower part so it sinks into the haze
        a = np.asarray(im).copy()
        h = a.shape[0]
        ramp = np.clip((h - np.arange(h)) / (h * 0.3), 0, 1) ** 1.5
        a[..., 3] = (a[..., 3] * ramp[:, None]).astype(np.uint8)
        im = Image.fromarray(a, "RGBA")
        im.save(out / f"far-{n}.webp", **WEBP)
        kit["far"].append({"file": f"far-{n}.webp", "w": im.width, "h": im.height})

    rgb, al = load(raw / f"{stage}-fore.png")
    lab, comps = components(al, None, f"{stage}-fore", join=20)
    kit["fore"] = []
    for n, (i, sl) in enumerate(comps):
        im = crop(rgb, al, lab, i, sl)
        im.save(out / f"fore-{n}.webp", **WEBP)
        at = over.get("fore", {}).get(str(n)) or ("top" if im.height > im.width else "bottom")
        kit["fore"].append({"file": f"fore-{n}.webp", "w": im.width, "h": im.height, "at": at})

    for old in (out / "pieces").glob("*.webp"):
        old.unlink()
    kit["pieces"] = {}
    count: dict[str, int] = {}
    for sheet, want, guess in (("kitA", 5, guess_kitA), ("kitB", 5, guess_kitB)):
        rgb, al = load(raw / f"{stage}-{sheet}.png")
        lab, comps = components(al, want, f"{stage}-{sheet}")
        if sheet == "kitB":
            # one shared baseline, painted in the asked order: left to right
            comps.sort(key=lambda c: c[1][1].start)
        ims = [crop(rgb, al, lab, i, sl) for i, sl in comps]
        roles = over.get(sheet) or (KITB_ORDER if sheet == "kitB" and len(ims) == 5 else guess(ims))
        for im, role in zip(ims, roles):
            if role == "skip":
                continue
            if role == "stairs" and not rises_left_to_right(im):
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
            k = count.get(role, 0)
            count[role] = k + 1
            pid = f"{role}-{k}"
            im.save(out / "pieces" / f"{pid}.webp", **WEBP)
            kit["pieces"][pid] = {"file": f"pieces/{pid}.webp", "role": role, **measure(im, role)}

    need = {"ledge": 2, "bridge": 1, "step": 2, "stairs": 1, "column": 1, "prop": 2, "wall": 1}
    for r, n in need.items():
        if count.get(r, 0) < n:
            warnings.append(f"{stage}: only {count.get(r, 0)} {r}, need {n}")
    (out / "kit.json").write_text(json.dumps(kit, indent=1))
    return kit


if __name__ == "__main__":
    args = sys.argv[1:]
    out_root = ROOT / "assets" / "stages"
    if "--out" in args:
        j = args.index("--out")
        out_root = Path(args[j + 1])
        del args[j : j + 2]
    if len(args) != 2:
        print(__doc__)
        sys.exit(2)
    kit = build(args[0], Path(args[1]), out_root)
    print(json.dumps({k: v["role"] for k, v in kit["pieces"].items()}))
    for w in warnings:
        print("WARN", w)
