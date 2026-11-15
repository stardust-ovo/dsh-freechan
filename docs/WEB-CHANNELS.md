# 网页通道（可选，需要本机工具链）

插件分两层：

| 层 | 依赖 | 能做什么 |
|---|---|---|
| **API 通道** | 只要 Node ≥18 与一个 key | `freeask` / `freedispatch(kind=ask)`，走智谱 / DeepSeek / Moonshot / 任意 OpenAI 兼容端点 |
| **网页通道**（本文件） | 额外要 Python + 浏览器 | 通义千问 / Kimi / 豆包 / ChatGPT / Claude / Gemini / Grok 等**免费网页端**，以及出图、长文压缩、TeleAgent |

只装 API 层就能用，网页层是可选的加强包。

## 要开网页通道，需要三样东西

1. **Python 3.10+**，且装好 Playwright：`pip install playwright && playwright install chromium`
2. **本机工具链脚本**：`_tools/ask.py`、`_tools/freeask2.py`、`_tools/gen_image.py`、`_tools/condense.py`
   （来自插件作者的 DSH 工作区；尚未单独发布，可在 issue 里索要）
3. **浏览器登录态**：插件用持久化 profile 目录，掉登录要人工扫码一次

三样齐了以后设置两个环境变量，插件会自动走网页通道：

```bash
FREECHAN_ROOT=/path/to/toolbox      # 含 _tools/ask.py 的目录
FREECHAN_PYTHON=/path/to/python     # 装了 playwright 的解释器
```

反向开关：`FREECHAN_TOOLBOX=0` 强制只用 API 通道。

## 已知边界

- 网页端打字注入超过约 1200 字会丢输入 —— 长提示词自动只走 API 通道。
- 单次网页调用 40–50 秒；API 通道通常 3–15 秒。
- 反爬/滑块：千问偶发滑块，需要人工过一次。
