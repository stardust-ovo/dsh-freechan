# glm_api.py — 用 .dsh 凭据里的 ZAI_API_KEY 调智谱开放平台 chat/completions
# 用法: python glm_api.py <promptfile> [model] [--base=https://open.bigmodel.cn]
import re, sys, json, urllib.request, urllib.error
try:
    import sys as _s; _s.stdout.reconfigure(encoding="utf-8", errors="replace"); _s.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

YAML = r"C:\Users\peter\.dsh\.credentials.yaml"
def token():
    txt = open(YAML, encoding="utf-8").read()
    m = re.search(r"ZAI_API_KEY\s*:\s*(\S+)", txt)
    if not m:
        raise SystemExit("no ZAI_API_KEY in credentials")
    return m.group(1).strip()

args = [a for a in sys.argv[1:] if not a.startswith("--")]
base = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--base=")), "https://open.bigmodel.cn")
model = args[1] if len(args) > 1 else "glm-4-flash"
prompt = open(args[0], encoding="utf-8").read() if args else "只回复两个字：收到"

body = json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}],
                   "stream": False, "temperature": 0.6}, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(base + "/api/paas/v4/chat/completions", data=body, method="POST",
    headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=90) as r:
        j = json.loads(r.read().decode("utf-8"))
    print("STATUS=200")
    print("MODEL_OUT=", j.get("model"))
    print("ANSWER<<<")
    print(j["choices"][0]["message"]["content"])
    print(">>>")
    print("USAGE=", json.dumps(j.get("usage", {}), ensure_ascii=False))
except urllib.error.HTTPError as e:
    print("HTTP_ERR", e.code, e.read().decode("utf-8")[:300])
except Exception as e:
    print("ERR", str(e)[:200])