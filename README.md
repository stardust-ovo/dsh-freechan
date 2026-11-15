# dsh-freechan

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
