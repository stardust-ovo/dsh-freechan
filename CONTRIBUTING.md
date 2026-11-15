# 贡献指南

## 加一家新站点（最常见 PR，只改配置）

```jsonc
"newsite": {
  "label": "显示名",
  "url": "https://example.com/chat",
  "input": "输入框选择器",
  "reply": "回复块选择器",
  "submit": "newline",          // 或 "enter"
  "login_markers": ["登录", "Sign in"],
  "note": "要不要登录、有什么坑"
}
```

提交前自测：`freeask(prompt="只回复两个字：收到", channel="newsite")` 能拿到「收到」。
拿不到就调选择器，或在 PR 里写清卡在哪（登录墙 / 滑块 / 地区限制）。

## 改代码

- `lib/index.js` 是唯一入口（cordis 插件，`apply(ctx)` 里注册工具）。
- `parameters` 用「属性名 → 规格」字典，`required` 内联；注册失败要写 `apply.log`。
- 改完跑 `node --check lib/index.js` 与 `FREECHAN_SELFTEST=1 node selftest.mjs`。

## 分支与提交

- `main` 始终保持可发布：任何进 main 的改动都要让 `node selftest.mjs` 全绿。
- 一个 PR 一件事；改行为就同时改 `CHANGELOG.md`（顶部加一条，版本号由维护者发版时定）。
- 提交信息用 `feat:` / `fix:` / `docs:` / `chore:` 前缀，便于生成 release notes。

## Issue 处理节奏（维护者）

| 类型 | 动作 | 目标时限 |
|---|---|---|
| `bug` | 先要 `report.mjs` 输出 → 复现 → 打 `confirmed` 或 `cannot-reproduce` | 3 天内首次回复 |
| `provider` | 按对方给的选择器本地试一次；免登录的优先收 | 7 天内 |
| `enhancement` | 只讨论场景，攒够 3 个同向诉求再动手 | 不承诺 |
| 安全 / 密钥泄露 | 先让对方吊销密钥，再修代码，发布后写进 CHANGELOG | 当天 |

发版走语义化版本：修 bug → `patch`，加通道/加参数 → `minor`，破坏兼容 → `major`。

## 禁止

- 提交密钥、cookie、登录态。
- 提交 `tmp/`、`apply.log`、`ask_log.jsonl`。
