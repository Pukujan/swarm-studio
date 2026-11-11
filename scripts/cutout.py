"""Cut a painted sprite out of its flat background: flood-fill from the edges,
so the figure's own pale parts (a white mask, a collar) stay.

python3 scripts/cutout.py in.png out.png
"""
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
    # a soft edge, then trim to the figure
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    im.putalpha(mask)
    box = mask.point(lambda v: 255 if v > 24 else 0).getbbox()
    if not box:
        raise SystemExit("nothing left after the cut")
    kept = sum(1 for v in mask.getdata() if v > 24) / (w * h)
    if kept > 0.92:
        raise SystemExit("the background did not come away")
    pad = 6
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
    im.crop(box).save(dst, "PNG", optimize=True)
    return kept


if __name__ == "__main__":
    print(round(cutout(sys.argv[1], sys.argv[2]), 3))
