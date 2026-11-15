# freeask2.py — 通用免费网页端提问 v2：回车不通就找发送按钮点
# 用法: python freeask2.py <url> <promptfile> <outprefix>
import sys, os, time, re, json
try:
    import sys as _s; _s.stdout.reconfigure(encoding="utf-8", errors="replace"); _s.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
from playwright.sync_api import sync_playwright

URL, PROMPT_FILE, PREFIX = sys.argv[1], sys.argv[2], sys.argv[3]
HEADLESS = os.environ.get("FREEASK_HEADED", "") != "1"
PROMPT = open(PROMPT_FILE, encoding="utf-8").read()
ONE = " ｜ ".join(x.strip() for x in PROMPT.splitlines() if x.strip())

def snap(pg, tag):
    try:
        pg.screenshot(path=f"{PREFIX}.{tag}.png", full_page=False)
    except Exception:
        pass

def body(pg):
    try:
        return pg.inner_text("body")
    except Exception:
        return ""

def box_text(pg):
    try:
        return pg.locator("div[contenteditable='true']").last.inner_text().strip()
    except Exception:
        try:
            return pg.locator("textarea").last.input_value().strip()
        except Exception:
            return ""

FIND_SEND = """() => {
  const out = [];
  document.querySelectorAll('button,[role=button],[aria-label],svg,div,span').forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.width > 160 || r.height > 160) return;
    const label = (e.getAttribute('aria-label') || e.getAttribute('title') || '').trim();
    const cls = (e.className && e.className.toString ? e.className.toString() : '');
    const hit = /发送|send|提交/i.test(label) || /send|submit/i.test(cls);
    if (hit) out.push({label, cls: cls.slice(0, 60), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)});
  });
  return out;
}"""

p = sync_playwright().start()
ctx = p.chromium.launch_persistent_context(
    user_data_dir=r"D:\codex-project1\_tools\web-profile",
    headless=HEADLESS, viewport={"width": 1440, "height": 980},
    args=["--disable-blink-features=AutomationControlled", "--no-first-run"])
ctx.set_default_timeout(25000)
pg = ctx.pages[0] if ctx.pages else ctx.new_page()
pg.goto(URL, wait_until="domcontentloaded", timeout=60000)
time.sleep(4)
# 关掉可能挡住输入框的弹窗（推广卡/登录提示）
for _ in range(3):
    try:
        pg.keyboard.press("Escape")
    except Exception:
        pass
    time.sleep(0.4)
try:
    pg.evaluate("""() => {
      const kill = [];
      document.querySelectorAll('[aria-label]').forEach(e => {
        const a = (e.getAttribute('aria-label')||'');
        if (/关闭|close|取消|跳过/i.test(a)) kill.push(e);
      });
      document.querySelectorAll('[role=dialog] button').forEach(b => {
        const t = (b.innerText||'').trim();
        if (t === '×' || t === 'X' || /关闭/.test(t)) kill.push(b);
      });
      kill.forEach(e => { try { e.click(); } catch {} });
    }""")
except Exception:
    pass
time.sleep(0.8)
snap(pg, "0load")

SELECTOR = os.environ.get("FREEASK_INPUT_SELECTOR") or "div[contenteditable='true'], textarea"
SUBMIT = os.environ.get("FREEASK_SUBMIT", "newline")
# 发送前先记下页面上已有的「回复块」：事后只取新增的那些，避免把首页欢迎语当答案
REPLY_SEL = os.environ.get("FREEASK_REPLY_SELECTOR", "")
base_blocks = []
if REPLY_SEL:
    try:
        base_blocks = pg.eval_on_selector_all(REPLY_SEL, "els => els.map(e => (e.innerText || '').trim())")
    except Exception:
        base_blocks = []
print("BASE_BLOCKS=" + str(len(base_blocks)), flush=True)
box = pg.locator(SELECTOR).last
box.click(force=True)
time.sleep(0.4)
box.type(ONE, delay=2)
time.sleep(0.6)
if SUBMIT == "enter":
    box.press("Enter")

submitted = False
box.press("Enter")
time.sleep(2.0)
if box_text(pg) == "":
    submitted = True
    print("SUBMIT=enter", flush=True)
else:
    cands = pg.evaluate(FIND_SEND)
    print("SEND_CANDS=" + json.dumps(cands[:6], ensure_ascii=False), flush=True)
    if cands:
        c = cands[-1]
        pg.mouse.click(c["x"], c["y"])
        time.sleep(2.0)
        submitted = box_text(pg) == ""
        print("SUBMIT=button " + str(submitted), flush=True)
    if not submitted:
        ir = box.bounding_box() or {"x": 0, "y": 0, "width": 0, "height": 0}
        pg.mouse.click(ir["x"] + ir["width"] - 22, ir["y"] + ir["height"] - 22)
        time.sleep(2.0)
        submitted = box_text(pg) == ""
        print("SUBMIT=corner " + str(submitted), flush=True)

time.sleep(10)          # 给生成留起步时间
# VERIFY_SENT: 确认提示词真的进了对话流，否则再点一次发送
def sent_ok():
    try:
        return ONE[:12] in body(pg)
    except Exception:
        return False

if not sent_ok():
    try:
        pg.evaluate("""() => {
          const cands = [];
          document.querySelectorAll('button,[role=button],[aria-label]').forEach(e => {
            const a = (e.getAttribute('aria-label')||'') + ' ' + ((e.className||'').toString());
            if (/发送|send/i.test(a)) cands.push(e);
          });
          if (cands.length) cands[cands.length-1].click();
        }""")
    except Exception:
        pass
    time.sleep(2.5)
    print("RESEND=" + str(sent_ok()), flush=True)

last, stable = -1, 0
for _ in range(120):
    time.sleep(3)
    t = body(pg)
    n = len(t)
    if n == last and n > 0:
        stable += 1
        if stable >= 6:
            break
    else:
        stable = 0
    last = n

t = body(pg)
open(f"{PREFIX}.txt", "w", encoding="utf-8").write(t)
# 按选择器抓“回复块”，只取发送后新增的；没有新增就退回最后几块
sel = os.environ.get("FREEASK_REPLY_SELECTOR", "") or REPLY_SEL
if sel:
    try:
        blocks = pg.eval_on_selector_all(sel, "els => els.map(e => (e.innerText || '').trim()).filter(Boolean)")
        fresh = [b for b in blocks if b not in base_blocks]
        chosen = fresh if fresh else blocks[-4:]
        open(f"{PREFIX}.reply.txt", "w", encoding="utf-8").write("\n\n<<<BLOCK>>>\n\n".join(chosen[-4:]))
        print("BLOCKS=" + str(len(blocks)) + " FRESH=" + str(len(fresh)), flush=True)
    except Exception as e:
        print("REPLY_SEL_ERR", str(e).split("\n")[0][:60], flush=True)
snap(pg, "final")
print("FINAL_LEN=" + str(len(t)), flush=True)
print("TAIL=" + t[-400:].replace("\n", " | "), flush=True)
ctx.close(); p.stop()