# dsh-freechan

[![ci](https://github.com/stardust-ovo/dsh-freechan/actions/workflows/ci.yml/badge.svg)](https://github.com/stardust-ovo/dsh-freechan/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](package.json)

把「免费网页版 AI / 免费 API」变成一等工具：在 DeepSeek Harness（DSH）里直接调用，不用拼命令行。

> **English**: A DSH plugin that turns free web AI (Qwen, Kimi, ChatGPT, Claude, Gemini, Grok, Copilot, DeepSeek, Doubao, Zhipu) and free APIs (GLM, DeepSeek, Moonshot, any OpenAI-compatible endpoint) into native tools — with automatic fallback, image generation, long-doc condensation and a local-agent dispatcher.

## 它解决什么

- 网页版 AI 免费，但要用浏览器点、要处理登录墙/滑块、输出是富文本 —— 手工用起来很累。
- 这个插件把它们注册成 DSH 原生工具，**一次调用拿回纯文本答案**，失败自动换下一家。
- 吃量不吃脑的活（改写、摘要、抽取、出图、长文压缩）丢给免费端，贵模型只负责判断与拼接。

## 工具（9 个）

| 工具 | 作用 |
|---|---|
| `freedispatch` | 统一入口：`kind=ask/image/condense/teleagent` |
| `freeask` | 问一次，返回答案 + 通道 + 耗时 |
| `freechan_providers` | 列出全部 provider 与就绪状态 |
| `freechan_doctor` | 本机自检：脚本齐不齐、TeleAgent 在不在线 |
| `freechan_stats` | 各通道成功率 / 中位耗时 |
| `freeimage` | GLM 出图，落 `downloads/zhipu` 并登记 |
| `freecondense` | 长文压缩，落 `downloads/summaries` 并登记 |
| `teleagent` | 派活给本机 TeleAgent 并取回答案 |
| `freejob` | 免费任务队列（new/list/show/auto/stats） |

## Provider 目录（`providers.json`）

```jsonc
{
  "web": {
    "qwen": {
      "label": "通义千问",
      "url": "https://www.qianwen.com/",
      "input": "div[contenteditable='true'], textarea",   // 输入框选择器
      "reply": "div[class*='markdown'], div[class*='answer']", // 回复块选择器
      "submit": "newline",                                 // newline | enter
      "login_markers": ["扫码登录", "登录后可"],            // 命中即判「要登录」
      "note": "免登录可聊"
    }
  },
  "api": {
    "zhipu": {
      "label": "智谱 GLM",
      "base": "https://open.bigmodel.cn",
      "path": "/api/paas/v4/chat/completions",
      "key_env": "ZAI_API_KEY",
      "key_file": "~/.dsh/.credentials.yaml",
      "key_regex": "ZAI_API_KEY\\s*:\\s*(\\S+)",
      "model": "glm-5.3-flash"
    }
  },
  "order": ["zhipu", "qwen", "kimi"]   // 自动路由顺序；省略则 API 在前
}
```

**加一家新站点**：在 `web` 里加一段（url + 三个选择器 + 登录特征），不需要改代码。

## 安装（DSH）

```bash
# 1) 放进你的 DSH 插件目录
git clone <this-repo> "$DSH_HOME/profiles/desktop/node_modules/dsh-freechan"

# 2) 三处登记（缺一不加载）
#    a. profiles/desktop/package.json → dependencies 加 "dsh-freechan": "link:<路径>"
#    b. profiles/desktop/package.json → dsh.profile.bundles 数组加 "dsh-freechan"
#    c. profiles/desktop/cordis.patch.yml 末尾加：
#       - id: dsh-freechan
#         name: dsh-freechan

# 3) 重启 DSH
```

详见 `docs/INSTALL.md`。

## 两层：API 层（必备）与网页层（可选）

| 层 | 依赖 | 能力 |
|---|---|---|
| **API 层** | Node ≥18 + 一个 key | `freeask` / `freedispatch(kind=ask)`，走智谱、DeepSeek、Moonshot、任意 OpenAI 兼容端点 |
| **网页层** | 额外 Python + Playwright + 工具链 | 千问 / Kimi / 豆包 / ChatGPT / Claude / Gemini / Grok，以及出图、长文压缩、TeleAgent |

填空 key 就能用：

```bash
export ZAI_API_KEY=...          # 智谱（免费额度够日常）
node scripts/report.mjs         # 看哪家就绪
```

网页层的装法与开关见 [docs/WEB-CHANNELS.md](docs/WEB-CHANNELS.md)。

## 反馈与贡献

| 你想做什么 | 去哪 |
|---|---|
| 报缺陷（某工具报错/卡住） | [新建缺陷报告](../../issues/new?template=bug_report.yml)，先把 `node scripts/report.mjs` 的输出贴进去 |
| 想加一个新的免费网页端 | [新增网页通道](../../issues/new?template=provider_request.yml)，附上你试过的三个选择器 |
| 想加功能 / 改行为 | [功能建议](../../issues/new?template=feature_request.yml)，说场景不要说方案 |
| 想聊聊 / 投票 | [Discussions](../../discussions) |
| 直接交代码 | 看 [CONTRIBUTING.md](CONTRIBUTING.md)，PR 模板会提醒跑哪些检查 |

**报缺陷前先跑这个**（20 秒，自动脱敏，不含任何密钥）：

```bash
node scripts/report.mjs
```

## 日常维护

改完代码，一条命令走完「体检 → 版本号 → 推送 → 等 CI」：

```bash
node scripts/publish.mjs --dry            # 只体检，不推送，不需要令牌
GH_TOKEN=ghp_xxx node scripts/publish.mjs --bump patch   # 正式发版（0.2.1 → 0.2.2）
```

它会顺序做四件事，任一步失败即停：

1. `node --check lib/index.js`
2. `node selftest.mjs`（TeleAgent 没起时该项记 `SKIP`，不算失败）
3. 改 `package.json` 版本号后调 `scripts/gh_push.mjs` 走 REST API 推送
4. 轮询 Actions，等到 `completed` 并把结论作为退出码

发版前记得在 `CHANGELOG.md` 顶部加一条；脚本发现当前版本没有对应条目会提示但不阻断。

## 发布（git 走不通时）

有些网络里 `git push` 两条路都断：SSH 报 `Permission denied (publickey)`，HTTPS 报
`schannel: SEC_E_UNTRUSTED_ROOT`。只要 `api.github.com` 能访问，就用仓库自带的推送脚本：

```bash
# 令牌：GitHub → Settings → Developer settings → Tokens (classic)
#      勾 repo；要写 .github/workflows/ 还必须勾 workflow
GH_TOKEN=ghp_xxx node scripts/gh_push.mjs <owner>/<repo> . main "chore: ..."
```

它按 blob → tree → commit → ref 的顺序走 REST API，提交前会回读 `HEAD` 与根目录自证；
空仓库（`GET /git/ref/heads/main` 返回 409）会先放一个 README 造出首个提交再推。

两个已验证的坑：**只有 `repo` 没有 `workflow` 时，写 `.github/workflows/*` 返回 404 而不是 403**；
令牌过期后返回 401 `Bad credentials`。

## 配置

| 环境变量 | 作用 |
|---|---|
| `FREECHAN_ROOT` | 工作根目录（含 `_tools/ask.py` 与 `workbench/`） |
| `FREECHAN_PYTHON` | 带 Playwright 的 python 解释器 |
| `FREECHAN_PROVIDERS` | 自定义 providers.json 路径 |
| `ZAI_API_KEY` / `DEEPSEEK_API_KEY` / `MOONSHOT_API_KEY` | API 通道密钥 |

密钥只从环境变量或本机密钥文件读，**不写入仓库、不进日志**。

## 已知边界

- 网页通道依赖你自己的浏览器登录态（插件用持久化 profile），掉登录要人工扫一次码。
- 网页端打字注入超过约 1200 字会丢输入 —— 长提示词自动只走 API 通道。
- 单次网页调用 40–50 秒；API 通道通常 3–15 秒。
- DSH 服务端插件无热重载：改代码后必须重启。

## 开发

```bash
node --check lib/index.js
FREECHAN_SELFTEST=1 node selftest.mjs     # 假 ctx + identity defineTool，无需 DSH 宿主
```

## 许可

MIT
