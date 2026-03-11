import json
from pathlib import Path
from PIL import Image

ROOT = Path(r"C:\Users\Administrator\clawd\go-tianhe-station")
INP = ROOT / "configs" / "cards.json"
OUT = ROOT / "configs" / "cards.v2.json"

CW, CH = 540, 1080  # exportCard CSS px

v1 = json.loads(INP.read_text(encoding="utf-8"))

v2 = {}
for k, cfg in v1.items():
    cid = int(k)
    img_path = ROOT / "assets" / "cards" / f"{cid}.jpg"
    if not img_path.exists():
        continue
    iw, ih = Image.open(img_path).size

    # If already v2, pass through
    if "name" in cfg and "no" in cfg:
        v2[k] = cfg
        continue

    nb = cfg.get("nameBox") or {}
    xb = cfg.get("noBox") or {}

    def inv_x(x):
        return x * CW / iw
    def inv_y(y):
        return y * CH / ih
    def inv_font(h):
        # v1 stored h ~= fontPx * 1.2 * (ih/CH)
        return (h * CH) / (1.2 * ih) if ih else 0

    name_left = round(inv_x(nb.get("x", 0)))
    name_top = round(inv_y(nb.get("y", 0)))
    name_font = round(inv_font(nb.get("h", 0)))

    no_left = round(inv_x(xb.get("x", 0)))
    no_top = round(inv_y(xb.get("y", 0)))
    no_font = round(inv_font(xb.get("h", 0)))

    # sane defaults
    if name_font <= 0:
        name_font = 54
    if no_font <= 0:
        no_font = 24

    v2[k] = {
        "name": {"left": name_left, "top": name_top, "font": name_font},
        "no": {"left": no_left, "top": no_top, "font": no_font},
    }

OUT.write_text(json.dumps(v2, ensure_ascii=False, indent=2), encoding="utf-8")
print("wrote", OUT)
print("cards", len(v2))
