## 这个 PR 做了什么

<!-- 一句话说清改了什么、为什么改 -->

## 检查项

- [ ] `node --check lib/index.js` 通过
- [ ] `node selftest.mjs` 通过（TeleAgent 未起时该项应显示 SKIP，不是 FAIL）
- [ ] 改了行为的话，`CHANGELOG.md` 顶部加了条目
- [ ] 没有提交密钥 / cookie / 登录态 / `tmp/` / `*.log`

## 如果是新增网页通道

- [ ] 在 `providers.json` 里加了一项，填了 `input` / `reply` / `submit` / `login_markers`
- [ ] 实测 `freeask(prompt="只回复两个字：收到", channel="<新键>")` 能拿到「收到」
- [ ] 在 PR 描述里写了登录要求与踩到的坑（滑块、地区限制、字数上限）

## 关联 issue

Closes #
