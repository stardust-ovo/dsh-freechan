# Changelog

## 0.3.0 — 2026-11-15

**可以被别人装了。** 此前所有工具都 spawn 本机 Python，陌生人 clone 下来跑不通。

- 新增 `lib/api.mjs`：纯 Node 的 API 客户端（OpenAI 兼容），从环境变量或密钥文件读 key。
- `freeask` 改为 **API 优先**：指定 `channel` 是 API 家就走 fetch；否则自动挑第一家就绪的；失败且 `fallback=true` 才回落本机工具链。
- `freechan_providers` / `freechan_doctor` 改为纯 Node 实现，没装 Python 也能查状态。
- 新增 `FREECHAN_TOOLBOX=0` 强制只用 API 层；未装工具链时给出可执行的提示而非堆栈。
- 新增 `docs/WEB-CHANNELS.md`：网页层是可选的加强包，写清三样依赖与开关。

## 0.2.2 — 2026-11-15

- 新增 `scripts/publish.mjs`：一条命令完成体检（语法 + 自测）、版本号自增、REST 推送、等 CI 结论。
- README 增加「日常维护」一节，写清 `--dry` 与 `--bump patch|minor|major` 的用法。

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
