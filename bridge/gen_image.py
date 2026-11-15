# gen_image.py — 智谱开放平台出图 -> 直接落 downloads/zhipu/ -> 追加 INDEX
# 用法: python gen_image.py "<提示词>" [model] [size]
import re, sys, json, time, hashlib, urllib.request, urllib.error, os, pathlib
try:
    import sys as _s; _s.stdout.reconfigure(encoding="utf-8", errors="replace"); _s.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

YAML = r"C:\Users\peter\.dsh\.credentials.yaml"
DL = pathlib.Path(r"D:\codex-project1\downloads")
IDX = DL / "INDEX.md"

def token():
    txt = open(YAML, encoding="utf-8").read()
    m = re.search(r"ZAI_API_KEY\s*:\s*(\S+)", txt)
    if not m:
        raise SystemExit("no ZAI_API_KEY")
    return m.group(1).strip()

prompt = sys.argv[1] if len(sys.argv) > 1 else "一只橘猫，写实风格"
model = sys.argv[2] if len(sys.argv) > 2 else "cogview-3-flash"
size = sys.argv[3] if len(sys.argv) > 3 else "1024x1024"

body = json.dumps({"model": model, "prompt": prompt, "size": size}, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request("https://open.bigmodel.cn/api/paas/v4/images/generations", data=body,
    method="POST", headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=180) as r:
    j = json.loads(r.read().decode("utf-8"))
url = j["data"][0]["url"]
print("GOT_URL_LEN", len(url))

raw = urllib.request.urlopen(url, timeout=180).read()
magic = raw[:4]
ext = ".png" if magic[:4] == b"\x89PNG" else (".jpg" if magic[:3] == b"\xff\xd8\xff" else ".bin")
slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", prompt)[:24].strip("-") or "img"
ts = time.strftime("%Y%m%d-%H%M%S")
name = f"zhipu-{ts}-{slug}{ext}"
out = DL / "zhipu" / name
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(raw)
fp = hashlib.sha1(prompt.encode("utf-8")).hexdigest()[:8]
row = f"| {time.strftime('%Y-%m-%d %H:%M:%S')} | zhipu | zhipu/{name} | {fp} | {model} {size} |\n"
with open(IDX, "a", encoding="utf-8") as f:
    f.write(row)
print("SAVED", str(out), "BYTES", len(raw), "MAGIC", magic.hex())
print("INDEX_ROW", row.strip())