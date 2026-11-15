#!/usr/bin/env node
// publish.mjs — 一条命令完成：体检 → 版本号 → 推送（REST API）→ 等 CI → 报告
// 用法：
//   GH_TOKEN=ghp_xxx node scripts/publish.mjs              # 用当前版本发布
//   GH_TOKEN=ghp_xxx node scripts/publish.mjs --bump patch # 先 +1 再发布
//   node scripts/publish.mjs --dry                          # 只体检，不推送（不需要令牌）
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const bumpIdx = args.indexOf('--bump');
const bump = bumpIdx >= 0 ? (args[bumpIdx + 1] || 'patch') : null;
const token = process.env.GH_TOKEN || '';
const REPO = process.env.PUBLISH_REPO || 'stardust-ovo/dsh-freechan';
const BRANCH = process.env.PUBLISH_BRANCH || 'main';

const say = (m) => console.log(m);
const fail = (m) => { console.error('✗ ' + m); process.exit(1); };

function sh(cmd, cliArgs) {
  const r = spawnSync(cmd, cliArgs, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// 1) 体检
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let version = pkg.version;
if (bump) {
  const [maj, min, pat] = version.split('.').map(Number);
  version = bump === 'major' ? (maj + 1) + '.0.0' : bump === 'minor' ? maj + '.' + (min + 1) + '.0' : maj + '.' + min + '.' + (pat + 1);
  pkg.version = version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  say('版本号 → ' + version);
}
say('目标 ' + REPO + ' @ ' + BRANCH + '，版本 ' + version);

const check = sh('node', ['--check', 'lib/index.js']);
if (check.code !== 0) fail('语法检查失败\n' + check.out);
say('✓ node --check lib/index.js');

// 先跑全量自测；若失败原因只是「本机没装工具链」，退回 --offline 并明确说明
let st = sh('node', ['selftest.mjs']);
let mode = 'full';
if (st.code !== 0 && /需要本机工具链|工具链.*未安装|ask\.py|FREECHAN_PYTHON/.test(st.out)) {
  say('! 全量自测因缺本机工具链失败，退回 --offline');
  st = sh('node', ['selftest.mjs', '--offline']);
  mode = 'offline';
}
const tail = st.out.trim().split('\n').slice(-3).join('\n');
if (st.code !== 0) fail('自测失败\n' + tail);
say('✓ selftest（' + mode + '）\n' + tail);

if (!fs.existsSync(path.join(ROOT, 'CHANGELOG.md'))) fail('缺 CHANGELOG.md');
if (!fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').includes(version)) {
  say('! CHANGELOG.md 里没有 ' + version + ' 的条目，记得补');
}

if (dry) { say('--dry：体检通过，不推送'); process.exit(0); }
if (!token) fail('缺 GH_TOKEN（GitHub → Settings → Tokens (classic)，勾 repo + workflow）');

// 2) 推送
const push = spawnSync('node', [path.join(ROOT, 'scripts', 'gh_push.mjs'), REPO, ROOT, BRANCH, 'chore: v' + version],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, GH_TOKEN: token } });
if (push.status !== 0) fail('推送失败');

// 3) 等 CI
const API = 'https://api.github.com';
const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-freechan-publish' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const r = await fetch(API + '/repos/' + REPO + '/actions/runs?per_page=1', { headers: H });
    if (!r.ok) continue;
    const j = await r.json();
    const run = (j.workflow_runs || [])[0];
    if (!run) continue;
    say('CI ' + run.name + ' #' + run.run_number + ' ' + run.status + '/' + (run.conclusion || '-'));
    if (run.status === 'completed') { process.exit(run.conclusion === 'success' ? 0 : 1); }
  }
  fail('CI 300 秒内没结束，稍后用 GitHub 网页看结果');
})();
