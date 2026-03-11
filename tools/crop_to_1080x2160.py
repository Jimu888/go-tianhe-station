from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\Administrator\clawd\go-tianhe-station\assets\cards")
OUT = Path(r"C:\Users\Administrator\Desktop\cards_1080x2160")
OUT.mkdir(parents=True, exist_ok=True)

TARGET_W, TARGET_H = 1080, 2160

def cover_crop(im: Image.Image, tw: int, th: int) -> Image.Image:
    im = im.convert('RGB')
    w, h = im.size
    scale = max(tw / w, th / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    im2 = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im2.crop((left, top, left + tw, top + th))

for i in range(1, 13):
    p = SRC / f"{i}.jpg"
    if not p.exists():
        print('missing', p)
        continue
    im = Image.open(p)
    out = cover_crop(im, TARGET_W, TARGET_H)
    out_path = OUT / f"{i}.jpg"
    out.save(out_path, quality=95, optimize=True)
    print('wrote', out_path.name, out.size)

print('done ->', OUT)
