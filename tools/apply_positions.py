import re, json, pathlib

ROOT = pathlib.Path(r"C:\Users\Administrator\clawd\go-tianhe-station")
text = (ROOT / "tmp_positions.txt").read_text(encoding='utf-8')

# capture minimal json blocks per card: { "n": { ... } }
blocks = re.findall(r'(\{\s*"\d+"\s*:\s*\{.*?\}\s*\}\s*\})', text, flags=re.S)

out = {}
for b in blocks:
    b = b.strip()
    try:
        d = json.loads(b)
    except Exception as e:
        # print snippet for debugging
        raise
    out.update(d)

final = {str(k): {'nameBox': v['nameBox'], 'noBox': v['noBox']} for k, v in out.items()}

p = ROOT / 'configs' / 'cards.json'
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps(final, ensure_ascii=False, indent=2), encoding='utf-8')
print('wrote', p, 'cards', len(final))
