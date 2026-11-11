"""Cut a painted sprite out of its flat key background.

Studio rule: cut-out art is painted on one flat key colour, magenta (#FF00FF) by default,
or chroma green (#00FF00) when the subject itself is pink, magenta or purple (see
engine/keycolor.mjs). Never key on grey or white, which eats white dresses, and never on
darkness, which eats heads.

How the cut works:
1. the key is the most common colour on the border (any flat colour works, magenta best);
2. a flood fill from the edges takes the background, so the figure's own pale or dark
   parts stay;
3. enclosed pockets of the key colour (between hair locks, under an arm) go as well, since
   no figure is painted in pure key colour; small specks stay;
4. the edge gets a soft alpha from how close each pixel is to the key, and the key colour
   that bled into the edge is taken back out (despill).

python3 scripts/cutout.py in.png out.png [--size 512] [--keep-size]
"""
import sys
from collections import deque

from PIL import Image, ImageFilter


def _key_of(px, w, h):
    border = [px[x, y][:3] for x in range(w) for y in (0, h - 1)] + [px[x, y][:3] for y in range(h) for x in (0, w - 1)]
    q = [tuple(v // 8 * 8 for v in c) for c in border]
    top = max(set(q), key=q.count)
    near = [c for c, k in zip(border, q) if k == top]
    return tuple(sum(c[i] for c in near) // len(near) for i in range(3))


def _keyness(c, key):
    """0..1: how much a pixel looks like the key. Hue-aware for magenta and green keys."""
    r, g, b = c[:3]
    kr, kg, kb = key
    if kr > 180 and kb > 180 and kg < 90:      # magenta: red and blue both well above green
        v = (min(r, b) - g) / 255
    elif kg > 180 and kr < 90 and kb < 90:     # green: green well above red and blue
        v = (g - max(r, b)) / 255
    else:                                      # any other flat colour: plain distance
        d = max(abs(r - kr), abs(g - kg), abs(b - kb))
        return max(0.0, 1 - d / 60)
    return max(0.0, min(1.0, (v - 0.25) / 0.45))


def key_alpha(im, key=None, pocket=40):
    """RGBA in, RGBA out with the key removed. `pocket`: smallest enclosed key pool to clear."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    key = key or _key_of(px, w, h)
    kn = [[_keyness(px[x, y], key) for x in range(w)] for y in range(h)]
    bg = bytearray(w * h)
    # 1-2: flood from the edges through key-ish pixels
    q = deque((x, y) for x in range(w) for y in (0, h - 1))
    q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if bg[i] or kn[y][x] < 0.5:
            continue
        bg[i] = 1
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx]:
                q.append((nx, ny))
    # 3: enclosed pools of strong key colour (chroma keys only: on grey they could be a white dress)
    chroma = (key[0] > 180 and key[2] > 180 and key[1] < 90) or (key[1] > 180 and key[0] < 90 and key[2] < 90)
    seen = bytearray(w * h)
    for y0 in range(h if chroma else 0):
        for x0 in range(w):
            i0 = y0 * w + x0
            if seen[i0] or bg[i0] or kn[y0][x0] < 0.8:
                continue
            comp, q = [], deque([(x0, y0)])
            seen[i0] = 1
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    j = ny * w + nx
                    if 0 <= nx < w and 0 <= ny < h and not seen[j] and not bg[j] and kn[ny][nx] >= 0.5:
                        seen[j] = 1
                        q.append((nx, ny))
            if len(comp) >= pocket:
                for x, y in comp:
                    bg[y * w + x] = 1
    # 4: alpha and despill on the figure's edge
    mask = Image.new("L", (w, h), 255)
    m = mask.load()
    for y in range(h):
        for x in range(w):
            if bg[y * w + x]:
                m[x, y] = 0
    edge = mask.filter(ImageFilter.MinFilter(5))
    e = edge.load()
    magenta = key[0] > 180 and key[2] > 180 and key[1] < 90
    green = key[1] > 180 and key[0] < 90 and key[2] < 90
    for y in range(h):
        for x in range(w):
            if m[x, y] and not e[x, y]:   # a figure pixel next to the background
                k = kn[y][x]
                m[x, y] = int(255 * (1 - k))
                r, g, b, a = px[x, y]
                if magenta and min(r, b) > g:
                    s = min(r, b) - g
                    r, b = r - s, b - s
                elif green and g > max(r, b):
                    g = max(r, b)
                px[x, y] = (r, g, b, a)
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    im.putalpha(mask)
    return im


def cutout(src, dst, size=512, keep_size=False):
    im = Image.open(src).convert("RGBA")
    if not keep_size:
        im.thumbnail((size, size))
    im = key_alpha(im)
    w, h = im.size
    mask = im.getchannel("A")
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
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    size = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 512
    if "--size" in sys.argv:
        a = [x for x in a if x != str(size)]
    print(round(cutout(a[0], a[1], size=size, keep_size="--keep-size" in sys.argv), 3))
