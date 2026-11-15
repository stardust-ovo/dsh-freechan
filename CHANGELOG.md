# Changelog

## 0.2.1 — 2026-11-15

- 新增 `scripts/gh_push.mjs`：git 的 SSH/HTTPS 都不通时，用 GitHub REST API 推送整份快照，
  自带空仓库首提交与 `HEAD` 回读校验。
- `selftest.mjs` 区分「环境缺省」与「真失败」：TeleAgent 守护进程没起时标 `SKIP` 而不是 `FAIL`，
  本机与 CI 不再因外设缺席变红。
- README 增加「发布（git 走不通时）」一节，记录 workflow scope 404、令牌过期 401 两个坑。
- `package.json` 增加 `scripts.check` / `scripts.selftest`。

## 0.2.0 — 2026-11-14

- 配置化：`providers.json` 驱动（10 个网页通道 + 4 个 API 通道），新增 `freechan_providers` 工具。
- 工具面 9 个：`freeask` / `freejob` / `freechan_stats` / `freechan_doctor` / `freeimage` /
  `freecondense` / `teleagent` / `freechan_providers` / `freedispatch`。
- 首次发布：README / LICENSE / CONTRIBUTING / docs/INSTALL / CI / 发布脚本。
