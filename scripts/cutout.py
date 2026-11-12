"""Cut a painted sprite out of its flat background: flood-fill from the edges,
so the figure's own pale parts (a white mask, a collar) stay. Small flat pockets of
the background caught inside the figure (between strands of hair, under an arm) are
cleared too, and the edge loses the background's tint.

python3 scripts/cutout.py in.png out.png [--preview check.png]
python3 scripts/cutout.py --preview-only strip.png check.png
python3 scripts/cutout.py --pick picture.png
  → prints {"kept", "pockets", "halo", "clipped", "key", "clash", "best", "spill", "band"};
    --preview writes the sprite on dark and on light grey side by side, for the sprite check.
    Figures are painted on a flat key colour (magenta #FF00FF, green #00FF00 or blue #0000FF);
    any flat colour works.

The key colour is chosen from a picture, not from words: --pick measures the figure's own
colours (a cut-out sprite, or a figure on a flat background) and prints the key furthest from
them, {"pick", "scores", "key", "clash"}. The cut reports the same for the picture it cut:
"clash" is the share of the figure that sits close to the key it was painted on, and "best" the
key that would have been further away, so the caller can paint it again on that one.
"""
import json
import sys
from collections import deque

from PIL import Image, ImageChops, ImageFilter


def cutout(src, dst, tol=34, size=512):
    im = Image.open(src).convert("RGBA")
    im.thumbnail((size, size))
    w, h = im.size
    measured = measure(im)
    px = im.load()
    # the background is the most common colour on the border
    border = [px[x, y][:3] for x in range(w) for y in (0, h - 1)] + [px[x, y][:3] for y in range(h) for x in (0, w - 1)]
    bg = max(set(border), key=border.count)
    near = lambda c: sum(abs(a - b) for a, b in zip(c[:3], bg)) <= tol * 3 and max(abs(a - b) for a, b in zip(c[:3], bg)) <= tol * 1.5
    seen = bytearray(w * h)
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    mask = Image.new("L", (w, h), 255)
    m = mask.load()
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not near(px[x, y]):
            continue
        m[x, y] = 0
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    # pockets: background-coloured patches the fill could not reach. Small, flat ones are
    # background seen through the figure; a big one (a pale face, a collar) stays.
    tight = lambda c: max(abs(a - b) for a, b in zip(c[:3], bg)) <= tol * 0.6
    small = max(40, int(w * h * 0.003))
    # a pocket sits just inside the outline (within 6 px of the cleared background); eyes and
    # teeth are deeper in, or tinted
    nearout = mask.filter(ImageFilter.MinFilter(13)).load()
    pockets = 0
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if seen[i0] == 2 or m[x0, y0] == 0 or not tight(px[x0, y0]):
                continue
            comp, q2 = [], deque([(x0, y0)])
            seen[i0] = 2
            while q2:
                x, y = q2.popleft()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    j = ny * w + nx
                    if 0 <= nx < w and 0 <= ny < h and seen[j] != 2 and m[nx, ny] and tight(px[nx, ny]):
                        seen[j] = 2
                        q2.append((nx, ny))
            if len(comp) > small or not any(nearout[x, y] == 0 for x, y in comp):
                continue
            cs = [px[x, y] for x, y in comp]
            mean = [sum(c[k] for c in cs) / len(cs) for k in range(3)]
            if max(abs(mean[k] - bg[k]) for k in range(3)) <= 8:
                for x, y in comp:
                    m[x, y] = 0
                pockets += len(comp)
    # a key colour (magenta, green or blue) is never on the figure: every patch of it is background,
    # however deep inside the outline (between hair strands, inside tatters)
    if is_key(bg):
        for y in range(h):
            for x in range(w):
                if m[x, y] and sum(abs(a - b) for a, b in zip(px[x, y][:3], bg)) <= 190:
                    m[x, y] = 0
                    pockets += 1
    # a soft edge, then trim to the figure
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(mask)
    # take the background's tint out of the half-clear edge: c = (c - (1 - a) * bg) / a
    # (a key colour is unmixed by its own tint in despill instead: the soft edge lies inside the
    # figure, so taking a full share of the key out of it left a rim of the opposite colour,
    # pink on green and green on magenta)
    px = im.load()
    if not is_key(bg):
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if 0 < a < 250:
                    f = a / 255
                    px[x, y] = tuple(max(0, min(255, round((c - (1 - f) * k) / f))) for c, k in zip((r, g, b), bg)) + (a,)
    spill = despill(im, bg)
    box = mask.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        raise SystemExit("nothing left after the cut")
    kept = sum(1 for v in mask.getdata() if v > 24) / (w * h)
    if kept > 0.92:
        raise SystemExit("the background did not come away")
    raw = box
    pad = 6
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
    out = im.crop(box)
    out.save(dst, "PNG", optimize=True)
    cutout.report = {"kept": round(kept, 3), "pockets": pockets, "halo": halo(out, bg), "clipped": clipped(raw, w, h),
                     "key": measured["key"], "clash": measured["clash"], "best": measured["pick"], **spill}
    return kept


# The key colours a sprite can be painted on, in the order they are preferred: flat, fully
# saturated, and readable from the corners. Magenta first (it is the furthest from skin, hair
# and most clothes), green for pink and purple figures, blue when a figure has both.
KEYS = {"magenta": (255, 0, 255), "green": (0, 255, 0), "blue": (0, 0, 255)}
HIGH = {"magenta": (0, 2), "green": (1,), "blue": (2,)}
CLOSE = 64  # a pixel this far into a key's colour is cut into, or greyed by the despill


def key_name(bg):
    """Which key colour a background is, or None for any other flat colour."""
    r, g, b = bg
    if r > 180 and b > 180 and g < 90:
        return "magenta"
    if g > 180 and r < 110 and b < 110:
        return "green"
    if b > 180 and r < 110 and g < 110:
        return "blue"
    return None


def is_key(bg):
    return key_name(bg) is not None


def keyness(im, name):
    """How far each pixel leans into a key colour, 0 to 255: the channels the key lifts,
    less the ones it leaves dark. Black, white, grey and the opposite colours score 0."""
    r, g, b = im.convert("RGB").split()
    if name == "magenta":
        return ImageChops.subtract(ImageChops.darker(r, b), g)
    if name == "green":
        return ImageChops.subtract(g, ImageChops.lighter(r, b))
    return ImageChops.subtract(b, ImageChops.lighter(r, g))


def flat_border(im, tol=40):
    """The flat colour a picture stands on (the most common one on its border), or None when
    the border is not one colour: a scene, not a figure on a key."""
    w, h = im.size
    px = im.convert("RGB").load()
    border = [px[x, y] for x in range(w) for y in (0, h - 1)] + [px[x, y] for y in range(h) for x in (0, w - 1)]
    bg = max(set(border), key=border.count)
    same = sum(1 for c in border if max(abs(a - b) for a, b in zip(c, bg)) <= tol)
    return bg if same >= len(border) * 0.6 else None


def figure_mask(im, tol=40):
    """The figure's own pixels, as an L mask, and the flat background they stand on (None for
    a cut-out). The outline is left out: it carries the old background's tint, not the figure's."""
    rgba = im.convert("RGBA")
    alpha = rgba.getchannel("A")
    if alpha.getextrema()[0] < 250:
        return alpha.point(lambda v: 255 if v >= 250 else 0).filter(ImageFilter.MinFilter(5)), None
    bg = flat_border(rgba, tol)
    if bg is None:
        return Image.new("L", rgba.size, 255), None
    r, g, b = ImageChops.difference(rgba.convert("RGB"), Image.new("RGB", rgba.size, bg)).split()
    far = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > tol else 0)
    return far.filter(ImageFilter.MinFilter(5)), bg


def measure(im, size=256):
    """Pick the key colour from the picture: for each key, the share of the figure that sits
    close to it (plus a little for how far the rest leans that way). The lowest wins; keys
    within one percent of it go by the preferred order. → {"pick", "scores", "key", "clash"},
    where "key" is the key the picture stands on now (or None) and "clash" its own score."""
    im = im.convert("RGBA")
    if max(im.size) > size:
        im = im.copy()
        im.thumbnail((size, size))
    mask, bg = figure_mask(im)
    n = mask.histogram()[255]
    scores = {}
    for name in KEYS:
        hist = keyness(im, name).histogram(mask) if n else [0] * 256
        close = sum(hist[CLOSE:])
        lean = sum(v * c for v, c in enumerate(hist))
        scores[name] = round(close / n + 0.05 * lean / (255 * n), 4) if n else 0.0
    low = min(scores.values())
    pick = next(name for name in KEYS if scores[name] <= low + 0.01)
    key = key_name(bg) if bg else None
    return {"pick": pick, "scores": scores, "key": key, "clash": scores[key] if key else 0.0}


def pick(path):
    return measure(Image.open(path))


def despill(im, bg, band=7):
    """A key colour bleeds into the outline. In the outer band only, each pixel is unmixed by
    the key it actually carries: its lean into the key says what share of it is background, that
    share of the key is taken out, the rest is scaled back up and the pixel is made that much
    clearer. A white edge stays white instead of going grey, and nothing is taken from a pixel
    that carries no key. The band is checked first: when the key's tint reaches deeper than it
    (a painted glow, a soft shadow) and the inside of the figure has none of that colour, the
    band is doubled. → {"spill", "band"}: the share of the outline that carried the key's tint
    before, and the band that was cleaned."""
    name = key_name(bg)
    if not name:
        return {"spill": 0.0, "band": 0}
    hi = HIGH[name]
    lo = tuple(i for i in range(3) if i not in hi)
    full = max(1, min(bg[i] for i in hi) - max(bg[i] for i in lo))
    w, h = im.size
    solid = im.getchannel("A").point(lambda v: 255 if v >= 250 else 0)
    shown = im.getchannel("A").point(lambda v: 255 if v > 0 else 0)
    deep = lambda n: solid.filter(ImageFilter.MinFilter(n * 2 + 1))
    tint = keyness(im, name).point(lambda v: 255 if v >= 24 else 0)
    share = lambda m: (ImageChops.multiply(tint, m).histogram()[255] / m.histogram()[255]) if m.histogram()[255] else 0.0
    inside1, inside2 = deep(band), deep(band * 2)
    rim = ImageChops.subtract(shown, inside1)
    ring = ImageChops.subtract(inside1, inside2)
    spill = share(rim)
    if inside2.histogram()[255] >= 200 and share(ring) > 0.05 and share(ring) > 3 * share(inside2) + 0.01:
        band *= 2
    edge = deep(band).load()
    px = im.load()
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] == 0 or edge[x, y]:
                continue
            k = min(c[i] for i in hi) - max(c[i] for i in lo)
            if k <= 0:
                continue
            t = min(0.95, k / full)
            px[x, y] = tuple(max(0, min(255, round((v - t * bg[i]) / (1 - t)))) for i, v in enumerate(c[:3])) + (min(c[3], round(255 * (1 - t))),)
    return {"spill": round(spill, 4), "band": band}


def halo(im, bg, tol=34):
    """Background left in the figure's outer band (within 6 px of the clear part), as a
    share of that band: 0 is clean, and anything over about 0.004 shows as white specks."""
    w, h = im.size
    px = im.load()
    near = im.getchannel("A").point(lambda v: 255 if v >= 40 else 0).filter(ImageFilter.MinFilter(13)).load()
    band = left = 0
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 200 or near[x, y]:
                continue
            band += 1
            if max(abs(a - b) for a, b in zip(px[x, y][:3], bg)) <= tol * 0.6:
                left += 1
    return round(left / band, 4) if band else 0.0


def clipped(box, w, h):
    """The figure runs off the painted picture: an arm or a foot cut by the frame."""
    return box[0] <= 1 or box[1] <= 1 or box[2] >= w - 1 or box[3] >= h - 1


def preview(src, dst, size=384):
    """The cut sprite twice, on dark and on light grey, so leftovers (a magenta or green
    rim, grey specks) show on either. A wide strip of frames is stacked (dark above grey);
    a single sprite sits side by side."""
    im = Image.open(src).convert("RGBA")
    wide = im.width > im.height * 1.6
    im.thumbnail((size * 4, size) if wide else (size, size))
    w, h = im.size
    if wide:
        out = Image.new("RGBA", (w + 16, h * 2 + 24), (17, 17, 17, 255))
        out.paste((222, 222, 222, 255), (0, h + 16, w + 16, h * 2 + 24))
        out.alpha_composite(im, (8, 8))
        out.alpha_composite(im, (8, h + 16))
    else:
        out = Image.new("RGBA", (w * 2 + 24, h + 16), (17, 17, 17, 255))
        out.paste((222, 222, 222, 255), (w + 16, 0, w * 2 + 24, h + 16))
        out.alpha_composite(im, (8, 8))
        out.alpha_composite(im, (w + 16, 8))
    out.convert("RGB").save(dst, "PNG")


if __name__ == "__main__":
    if sys.argv[1] == "--pick":  # cutout.py --pick picture.png
        print(json.dumps(pick(sys.argv[2])))
        sys.exit(0)
    if sys.argv[1] == "--preview-only":  # cutout.py --preview-only cut.png check.png
        preview(sys.argv[2], sys.argv[3])
        sys.exit(0)
    cutout(sys.argv[1], sys.argv[2])
    if "--preview" in sys.argv:
        preview(sys.argv[2], sys.argv[sys.argv.index("--preview") + 1])
    print(json.dumps(cutout.report))
