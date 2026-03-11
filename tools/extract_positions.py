import json, os
from PIL import Image

ROOT = r"C:\Users\Administrator\clawd\go-tianhe-station"
BLANK_DIR = os.path.join(ROOT, "assets", "cards")
REF_DIR = os.path.join(ROOT, "named-samples", "_normalized")
OUT_JSON = os.path.join(ROOT, "configs", "cards.json")

os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)

def load_rgb(path):
    im = Image.open(path).convert('RGB')
    return im

def extract_boxes(blank_im, ref_im):
    # ensure same size
    if blank_im.size != ref_im.size:
        ref_im = ref_im.resize(blank_im.size)
    w, h = blank_im.size

    # downscale for speed
    scale = 0.25
    sw, sh = int(w*scale), int(h*scale)
    b = blank_im.resize((sw, sh))
    r = ref_im.resize((sw, sh))

    # diff grayscale
    import numpy as np
    bd = np.asarray(b, dtype=np.int16)
    rd = np.asarray(r, dtype=np.int16)
    diff = np.abs(rd - bd).sum(axis=2)  # 0..765

    # focus on bottom band where name/number are
    y0 = int(sh * 0.70)
    y1 = int(sh * 0.92)
    band = diff[y0:y1, :]

    # threshold
    thr = 60  # tuned
    mask = band > thr

    coords = np.argwhere(mask)
    if coords.size == 0:
        return None

    # coords are (y,x) within band
    xs = coords[:, 1]
    ys = coords[:, 0]

    # split into left/right via median x
    mid = int(np.median(xs))
    left = coords[xs <= mid]
    right = coords[xs > mid]

    def bbox(c):
        if c.size == 0:
            return None
        y = c[:, 0]
        x = c[:, 1]
        x0, x1 = int(x.min()), int(x.max())
        y0b, y1b = int(y.min()), int(y.max())
        # expand a bit
        pad = 2
        x0 = max(0, x0 - pad)
        y0b = max(0, y0b - pad)
        x1 = min(sw-1, x1 + pad)
        y1b = min((y1 - y0) - 1, y1b + pad)
        return (x0, y0b, x1, y1b)

    lb = bbox(left)
    rb = bbox(right)

    # convert bbox back to full-res coords and global y
    def up(b):
        if not b:
            return None
        x0, y0b, x1, y1b = b
        # y in band coords -> global scaled coords
        gy0 = y0 + y0b
        gy1 = y0 + y1b
        # upsample
        return {
            'x': int(x0/scale),
            'y': int(gy0/scale),
            'w': int((x1-x0)/scale),
            'h': int((gy1-gy0)/scale),
        }

    return up(lb), up(rb)

configs = {}

for i in range(1, 13):
    bpath = os.path.join(BLANK_DIR, f"{i}.jpg")
    rpath = os.path.join(REF_DIR, f"{i}.jpg")
    if not os.path.exists(bpath) or not os.path.exists(rpath):
        continue

    blank = load_rgb(bpath)
    ref = load_rgb(rpath)
    boxes = extract_boxes(blank, ref)
    if not boxes:
        continue
    left, right = boxes

    # assume left is name, right is number (based on layout)
    configs[str(i)] = {
        'nameBox': left,
        'noBox': right,
    }

with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(configs, f, ensure_ascii=False, indent=2)

print('wrote', OUT_JSON, 'cards', len(configs))
