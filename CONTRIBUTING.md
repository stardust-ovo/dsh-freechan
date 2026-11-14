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

## 禁止

- 提交密钥、cookie、登录态。
- 提交 `tmp/`、`apply.log`、`ask_log.jsonl`。
