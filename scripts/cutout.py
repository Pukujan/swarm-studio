"""Cut a painted sprite out of its flat background: flood-fill from the edges,
so the figure's own pale parts (a white mask, a collar) stay. Small flat pockets of
the background caught inside the figure (between strands of hair, under an arm) are
cleared too, and the edge loses the background's tint.

python3 scripts/cutout.py in.png out.png [--preview check.png]
python3 scripts/cutout.py --preview-only strip.png check.png
  → prints {"kept", "pockets", "halo", "clipped"}; --preview writes the sprite on dark and
    on light grey side by side, for the sprite check. Figures are painted on a flat key
    colour (magenta #FF00FF by default, chroma green for pink figures); any flat colour works
"""
import json
import sys
from collections import deque

from PIL import Image, ImageFilter


def cutout(src, dst, tol=34, size=512):
    im = Image.open(src).convert("RGBA")
    im.thumbnail((size, size))
    w, h = im.size
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
    # a key colour (magenta or green) is never on the figure: every patch of it is background,
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
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if 0 < a < 250:
                f = a / 255
                px[x, y] = tuple(max(0, min(255, round((c - (1 - f) * k) / f))) for c, k in zip((r, g, b), bg)) + (a,)
    despill(im, bg)
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
    cutout.report = {"kept": round(kept, 3), "pockets": pockets, "halo": halo(out, bg), "clipped": clipped(raw, w, h)}
    return kept


def is_key(bg):
    r, g, b = bg
    return (r > 180 and b > 180 and g < 90) or (g > 180 and r < 110 and b < 110)


def despill(im, bg, band=7):
    """A key colour (magenta or green) bleeds into the outline: in the outer band only,
    pull the channels the key lifts back down to the others, so no pink or green rim shows."""
    r0, g0, b0 = bg
    magenta = r0 > 180 and b0 > 180 and g0 < 90
    green = g0 > 180 and r0 < 110 and b0 < 110
    if not (magenta or green):
        return
    px = im.load()
    w, h = im.size
    edge = im.getchannel("A").point(lambda v: 255 if v >= 250 else 0).filter(ImageFilter.MinFilter(band * 2 + 1)).load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or edge[x, y]:
                continue
            if magenta:
                m = min(r, b)
                if m > g:
                    k = m - g
                    px[x, y] = (r - k, g, b - k, a)
            elif g > max(r, b):
                px[x, y] = (r, max(r, b), b, a)


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
    if sys.argv[1] == "--preview-only":  # cutout.py --preview-only cut.png check.png
        preview(sys.argv[2], sys.argv[3])
        sys.exit(0)
    cutout(sys.argv[1], sys.argv[2])
    if "--preview" in sys.argv:
        preview(sys.argv[2], sys.argv[sys.argv.index("--preview") + 1])
    print(json.dumps(cutout.report))
