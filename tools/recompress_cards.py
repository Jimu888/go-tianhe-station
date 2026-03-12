from pathlib import Path
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / 'assets' / 'cards'
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'cards_opt'
OUT.mkdir(parents=True, exist_ok=True)

TARGET = (1080, 2160)
QUALITY = 82

for p in sorted(SRC.glob('*.jpg'), key=lambda x: int(x.stem)):
    img = Image.open(p).convert('RGB')
    if img.size != TARGET:
        img = img.resize(TARGET, Image.LANCZOS)
    outp = OUT / p.name
    img.save(outp, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    print(f"{p.name}: {p.stat().st_size} -> {outp.stat().st_size}")

print('done', OUT)
