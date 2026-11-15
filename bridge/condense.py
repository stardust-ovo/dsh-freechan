# condense.py — 长文档压缩：分块 -> 逐块要点 -> 合并 -> 落 downloads/summaries + 登记
# 用法: python condense.py <文件路径> [--points 10] [--model glm-5.3-flash] [--chunk 3000]
import re, sys, json, time, hashlib, urllib.request, urllib.error, pathlib

YAML = r"C:\Users\peter\.dsh\.credentials.yaml"
DL = pathlib.Path(r"D:\codex-project1\downloads")
IDX = DL / "INDEX.md"
OUT = DL / "summaries"

def token():
    txt = open(YAML, encoding="utf-8").read()
    return re.search(r"ZAI_API_KEY\s*:\s*(\S+)", txt).group(1).strip()

def ask(prompt, model, temp=0.3, retries=3, timeout=300):
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}],
                       "stream": False, "temperature": temp}, ensure_ascii=False).encode("utf-8")
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request("https://open.bigmodel.cn/api/paas/v4/chat/completions", data=body,
                method="POST", headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                j = json.loads(r.read().decode("utf-8"))
            return j["choices"][0]["message"]["content"].strip(), j.get("usage", {})
        except Exception as e:
            last = e
            print(f"  retry {attempt+1}/{retries}: {type(e).__name__}: {str(e)[:80]}", flush=True)
            time.sleep(3)
    raise last

args = sys.argv[1:]
src_path = args[0]
def opt(name, default):
    return args[args.index(name) + 1] if name in args else default
points = int(opt("--points", "10"))
model = opt("--model", "glm-5.3-flash")
chunk = int(opt("--chunk", "3000"))
# --preview：只跑第 1 块 + 合并，产出 3 条样张与整篇 ETA，不落盘、不写 INDEX
preview = "--preview" in args
prev_points = int(opt("--preview-points", "3"))

text = open(src_path, encoding="utf-8", errors="include").read()
n = len(text)
print(f"SRC {n} chars", flush=True)

chunks, i = [], 0
while i < n:
    chunks.append(text[i:i + chunk])
    i += chunk - 200
print(f"CHUNKS {len(chunks)}", flush=True)

CACHE = pathlib.Path("D:/codex-project1/_tools/tmp") / ("condense_" + hashlib.sha1(text.encode("utf-8")).hexdigest()[:8] + ".json")
cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
bullets, used = [], 0
work = chunks[:1] if preview else chunks
chunk_secs, chunk_done = 0.0, 0
for k, c in enumerate(work, 1):
    if str(k) in cache:
        bullets.append(cache[str(k)])
        print(f"  chunk {k}/{len(chunks)} cached", flush=True)
        continue
    p = ("你是文档压缩器。把下面这段压成不超过 5 条要点，每条一行、以 '- ' 开头；"
         "保留其中的数字、路径、命令、字段名；不要编造未出现的内容；不要解释过程。\n\n" + c)
    _t = time.time()
    out, u = ask(p, model)
    chunk_secs += time.time() - _t
    chunk_done += 1
    used += u.get("total_tokens", 0)
    bullets.append(out)
    cache[str(k)] = out
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    print(f"  chunk {k}/{len(chunks)} -> {len(out)} chars, tokens={u.get('total_tokens')}", flush=True)

merged = "\n".join(bullets)
p2 = (f"下面是从同一份文档各段抽出的一堆要点。合并成不超过 {prev_points if preview else points} 条，去重、按主题归并、"
      "保留关键数字与路径，不要新增原文没有的信息，只输出要点列表。\n\n" + merged[:4500])
merge_model = opt("--merge-model", "glm-4.5-air")
t_merge = time.time()
final, u2 = ask(p2, merge_model, timeout=240)
used += u2.get("total_tokens", 0)

if preview:
    if chunk_done:
        per = chunk_secs / chunk_done
        eta = per * len(chunks) + (time.time() - t_merge)
        print("PREVIEW %d/%d chunks | per_chunk=%.1fs | eta=%.1fmin | tokens=%d"
              % (len(work), len(chunks), per, eta / 60.0, used), flush=True)
    else:
        print("PREVIEW %d/%d chunks | 第 1 块命中缓存，无法估时（删掉 _tools/tmp/condense_*.json 可实测） | tokens=%d"
              % (len(work), len(chunks), used), flush=True)
    print("（预览模式：未落盘、未写 INDEX；确认后去掉 --preview 再跑一次）", flush=True)
    print("===SUMMARY===")
    print(final)
    sys.exit(0)

OUT.mkdir(parents=True, exist_ok=True)
slug = re.sub(r"[^\w]+", "-", pathlib.Path(src_path).stem)[:40]
stamp = time.strftime("%Y%m%d-%H%M%S")
dst = OUT / f"{slug}-summary-{stamp}.md"
hdr = (f"# {pathlib.Path(src_path).name} 摘要\n\n"
       f"- 源文件：{src_path}\n- 源字符数：{n}\n- 分块：{len(chunks)}\n"
       f"- 模型：{model}（合并：{merge_model}）\n- 生成时间：{time.strftime('%Y-%m-%d %H:%M:%S')}\n"
       f"- 用量：{used} tokens\n\n---\n\n")
dst.write_text(hdr + final + "\n", encoding="utf-8")
fp = hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]
with open(IDX, "a", encoding="utf-8") as fh:
    fh.write(f"| {time.strftime('%Y-%m-%d %H:%M:%S')} | zhipu | summaries/{dst.name} | {fp} | {model} {len(chunks)}块 {used}tok |\n")
print("SAVED", dst, flush=True)
print("TOKENS", used, flush=True)
print("===SUMMARY===")
print(final)
