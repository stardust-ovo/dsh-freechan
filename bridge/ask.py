#!/usr/bin/env python
"""freechan — 配置驱动的统一提问入口。

用法:
  python ask.py "<提示词>"
  python ask.py --channel qwen "<提示词>"
  python ask.py --file 提示词.md [--channel X] [--json]
  python ask.py --list          # 列出全部 provider 与就绪状态
  python ask.py stats           # 调用统计

配置: 默认读 ./providers.json 或 ../plugins/dsh-freechan/providers.json，
可用环境变量 FREECHAN_PROVIDERS 指定。网页通道转发给 freeask2.py。
"""
import sys, os, json, time, re, subprocess, pathlib, urllib.request, urllib.error

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = pathlib.Path(__file__).resolve().parent
TMP = HERE / "tmp"; TMP.mkdir(parents=True, exist_ok=True)
LOG = HERE / "ask_log.jsonl"
FREE = HERE / "freeask2.py"
PY = sys.executable
MAX_WEB_CHARS = 1200

def cfg_candidates():
    out = []
    env = os.environ.get("FREECHAN_PROVIDERS")
    if env:
        out.append(pathlib.Path(env))
    out += [HERE / "providers.json",
            HERE.parent / "providers.json",                                  # bridge/ 同级（插件自带的完整仓库布局）
            HERE / "plugins" / "dsh-freechan" / "providers.json",
            HERE.parent / "plugins" / "dsh-freechan" / "providers.json"]
    return out

def load_cfg():
    for c in cfg_candidates():
        if c.is_file():
            return json.loads(c.read_text(encoding="utf-8")), str(c)
    raise SystemExit("找不到 providers.json（用 FREECHAN_PROVIDERS 指定）")

def secret(prov):
    env = prov.get("key_env")
    if env and os.environ.get(env):
        return os.environ[env].strip()
    kf = prov.get("key_file")
    if kf:
        p = pathlib.Path(os.path.expanduser(kf))
        if p.is_file():
            m = re.search(prov.get("key_regex", r"(\S+)"), p.read_text(encoding="utf-8", errors="ignore"))
            if m:
                return m.group(1).strip()
    return ""

def log(rec):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")

def run_api(prov, prompt):
    key = secret(prov)
    if not key:
        return False, "缺少密钥（%s 未设，密钥文件也未命中）" % prov.get("key_env"), {}
    body = json.dumps({"model": prov.get("model"), "messages": [{"role": "user", "content": prompt}],
                       "stream": False, "temperature": 0.3}, ensure_ascii=False).encode("utf-8")
    url = prov["base"].rstrip("/") + prov.get("path", "/v1/chat/completions")
    req = urllib.request.Request(url, data=body, method="POST",
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            j = json.loads(r.read().decode("utf-8"))
        return True, j["choices"][0]["message"]["content"].strip(), {"model": prov.get("model"), "usage": j.get("usage", {})}
    except urllib.error.HTTPError as e:
        return False, "HTTP %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:200]), {}
    except Exception as e:
        return False, "%s: %s" % (type(e).__name__, str(e)[:160]), {}

def run_web(name, prov, prompt):
    pf = TMP / ("ask_%s.md" % name); pf.write_text(prompt, encoding="utf-8")
    pref = TMP / ("ask_%s_out" % name)
    for stale in (pathlib.Path(str(pref) + ".reply.txt"), pathlib.Path(str(pref) + ".txt")):
        try:
            if stale.exists(): stale.unlink()
        except Exception: pass
    env = dict(os.environ, FREEASK_REPLY_SELECTOR=prov.get("reply", ""), PYTHONIOENCODING="utf-8",
               TEMP=str(TMP), TMP=str(TMP),
               FREEASK_INPUT_SELECTOR=prov.get("input", ""), FREEASK_SUBMIT=prov.get("submit", "newline"))
    try:
        r = subprocess.run([PY, str(FREE), prov["url"], str(pf), str(pref)], capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=420, env=env)
    except subprocess.TimeoutExpired:
        return False, "网页通道超时", {}
    rp = pathlib.Path(str(pref) + ".reply.txt"); blocks = []
    if rp.exists():
        blocks = [b.strip() for b in rp.read_text(encoding="utf-8", errors="ignore").split("<<<BLOCK>>>") if b.strip()]
    bt = pathlib.Path(str(pref) + ".txt")
    body = bt.read_text(encoding="utf-8", errors="ignore") if bt.exists() else ""
    # 页面级拦截（滑块/验证码）与整页文案污染：都算没拿到答案，要说清楚而不是把文案当回答
    CHROME = ("向千问提问", "内容由AI生成", "千问 - 阿里旗下", "快速\n工作助理")
    blocks = [b for b in blocks if not any(c in b for c in CHROME)]
    CAPTCHA = ("请拖动下方滑块", "完成验证", "验证失败", "请按住滑块")
    if any(c in body for c in CAPTCHA):
        return False, "触发滑块验证：需要在浏览器里人工拖一次，然后重试（登录态已保留）", {"hint": prov.get("note", "")}
    if not blocks and r.returncode != 0:
        tail = (r.stderr or "").strip().splitlines()
        return False, "桥接失败 exit=%s %s" % (r.returncode, tail[-1][:120] if tail else ""), {}
    for m in prov.get("login_markers", []):
        if m and (m in body[:800] or (blocks and m in blocks[-1][:200])):
            return False, "需要登录/验证：命中「%s」" % m, {"hint": prov.get("note", "")}
    def clean(s):
        s = (s or "").strip()
        for cut in ("<memor", "<mem", "\n向千问提问", "\n内容由AI生成", "\n千问 - "):
            i = s.find(cut)
            if i > 0:
                s = s[:i]
        return s.strip()

    if blocks:
        ans = clean(blocks[-1])
        if ans:
            return True, ans[:4000], {"chars": len(ans), "via": "selector"}
    if prompt[:12] in body:
        ans = clean(body.split(prompt[:12], 1)[1])
        if ans:
            return True, ans[:4000], {"chars": len(ans), "via": "body"}
    return False, "未取到回答", {"len": len(body)}

def call(name, cfg, prompt):
    t0 = time.time()
    if name in cfg.get("api", {}):
        ok, text, meta = run_api(cfg["api"][name], prompt)
    elif name in cfg.get("web", {}):
        ok, text, meta = run_web(name, cfg["web"][name], prompt)
    else:
        raise SystemExit("未知通道: %s（--list 看可用项）" % name)
    rec = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "channel": name, "ok": ok,
           "ms": int((time.time() - t0) * 1000), "prompt_chars": len(prompt),
           "answer_chars": len(text), "meta": meta}
    log(rec)
    return ok, text, rec

def order(cfg):
    return cfg.get("order") or (list(cfg.get("api", {})) + list(cfg.get("web", {})))

def cmd_list(cfg, path):
    print("配置文件:", path)
    print("\nAPI 通道:")
    for k, v in cfg.get("api", {}).items():
        print("  %-20s %-16s %-8s %s" % (k, v.get("label", ""), "就绪" if secret(v) else "缺密钥", v.get("model", "")))
    print("\n网页通道:")
    for k, v in cfg.get("web", {}).items():
        print("  %-20s %-16s %s" % (k, v.get("label", ""), v.get("note", "")))

def cmd_stats():
    if not LOG.exists():
        print("还没有调用记录"); return
    rows = [json.loads(l) for l in LOG.read_text(encoding="utf-8").splitlines() if l.strip()]
    by = {}
    for r in rows:
        d = by.setdefault(r.get("channel", "?"), {"n": 0, "ok": 0, "ms": [], "chars": []})
        d["n"] += 1
        if r.get("ok"):
            d["ok"] += 1; d["ms"].append(r.get("ms", 0)); d["chars"].append(r.get("answer_chars", 0))
    print("通道                  次数  成功  成功率   中位耗时   平均字符")
    for c, d in sorted(by.items(), key=lambda kv: -kv[1]["n"]):
        ms = sorted(d["ms"]); med = ms[len(ms) // 2] / 1000 if ms else 0
        avg = sum(d["chars"]) / len(d["chars"]) if d["chars"] else 0
        print("%-20s %5d %5d %6.0f%% %8.1fs %8.0f" % (c, d["n"], d["ok"], d["ok"] / d["n"] * 100, med, avg))

def main():
    args = sys.argv[1:]
    cfg, path = load_cfg()
    if args[:1] == ["--list"]:
        cmd_list(cfg, path); return
    if args[:1] == ["stats"]:
        cmd_stats(); return
    as_json = "--json" in args
    if as_json: args.remove("--json")
    use_fallback = "--fallback" in args
    if use_fallback: args.remove("--fallback")
    chan = None
    if "--channel" in args:
        i = args.index("--channel"); chan = args[i + 1]; del args[i:i + 2]
    if "--file" in args:
        i = args.index("--file"); prompt = open(args[i + 1], encoding="utf-8-sig").read().replace("\ufffd", ""); del args[i:i + 2]
    else:
        prompt = " ".join(args).strip()
    if not prompt:
        raise SystemExit("提示词为空")

    if chan:
        # 指定通道默认只打一发；加 --fallback 才在失败后按 order 继续降级
        names = [chan]
        if use_fallback:
            names += [n for n in order(cfg) if n != chan]
        last = None
        for i, name in enumerate(names):
            if i > 0 and name in cfg.get("web", {}) and len(prompt) > MAX_WEB_CHARS:
                print("[%s] 跳过：%d 字 > %d" % (name, len(prompt), MAX_WEB_CHARS), file=sys.stderr)
                continue
            ok, text, rec = call(name, cfg, prompt)
            last = (name, ok, text, rec)
            if not as_json:
                print("[%s] %s %sms" % (name, "OK" if ok else "FAIL", rec["ms"]), file=sys.stderr)
            if ok:
                print(json.dumps({"ok": True, "channel": name, "text": text, "rec": rec}, ensure_ascii=False)
                      if as_json else text)
                sys.exit(0)
        if last:
            name, _ok, text, rec = last
            print(json.dumps({"ok": False, "channel": name, "text": text, "rec": rec}, ensure_ascii=False)
                  if as_json else text)
        sys.exit(1 if last else 2)

    for name in order(cfg):
        if name in cfg.get("web", {}) and len(prompt) > MAX_WEB_CHARS:
            print("[%s] 跳过：%d 字 > %d" % (name, len(prompt), MAX_WEB_CHARS), file=sys.stderr)
            continue
        ok, text, rec = call(name, cfg, prompt)
        print("[%s] %s %sms" % (name, "OK" if ok else "FAIL", rec["ms"]), file=sys.stderr)
        if ok:
            print(json.dumps({"ok": True, "channel": name, "text": text, "rec": rec}, ensure_ascii=False) if as_json else text)
            return
    raise SystemExit("全部通道失败")

if __name__ == "__main__":
    main()
