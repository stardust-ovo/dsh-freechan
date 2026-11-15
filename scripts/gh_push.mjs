#!/usr/bin/env node
// gh_push.mjs — 用 GitHub REST API 推送一个本地目录（不需要可用的 git）
// 适用：git 的 SSH/HTTPS 都被墙或证书链不通，但 api.github.com 可访问。
// 用法：GH_TOKEN=ghp_xxx node scripts/gh_push.mjs <owner>/<repo> <dir> [branch] [message]
// 令牌需要 repo（写 .github/workflows/ 还要 workflow）。空仓库会自动先建首个提交。
import fs from 'node:fs';
import path from 'node:path';

const [repo, dir, branch = 'main', msg = 'feat: dsh-freechan 0.2.0'] = process.argv.slice(2);
const token = process.env.GH_TOKEN || '';
if (!repo || !dir) { console.error('用法: GH_TOKEN=xxx node gh_push.mjs owner/repo <dir> [branch] [msg]'); process.exit(2); }
if (!token) { console.error('缺 GH_TOKEN'); process.exit(2); }

const API = 'https://api.github.com';
const H = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-freechan-pusher', 'Content-Type': 'application/json' };

async function call(method, url, body) {
  const r = await fetch(API + url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  if (!r.ok) { const e = new Error(method + ' ' + url + ' -> ' + r.status + ' ' + txt.slice(0, 200)); e.status = r.status; throw e; }
  return j;
}

const SKIP = new Set(['.git', 'node_modules', 'tmp', 'dist']);
function walk(d, base = '') {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const fp = path.join(d, e.name);
    const rel = base ? base + '/' + e.name : e.name;
    if (process.env.SKIP_WORKFLOWS === '1' && rel.startsWith('.github/workflows/')) continue;
    if (e.isDirectory()) out.push(...walk(fp, rel));
    else if (!/\.(log|zip)$/.test(e.name)) out.push({ rel, fp });
  }
  return out;
}

(async () => {
  const files = walk(dir);
  console.log('FILES=' + files.length);
  const info = await call('GET', '/repos/' + repo);
  console.log('REPO_OK=' + info.full_name + ' default=' + info.default_branch + ' empty=' + (info.size === 0));

  // 0) 空仓库：先造首个提交（Contents API 在空仓库可用）
  let parent = null;
  try {
    const ref = await call('GET', '/repos/' + repo + '/git/ref/heads/' + branch);
    parent = ref.object.sha;
    console.log('PARENT=' + parent);
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;   // 空仓库返回 409
    const boot = await call('PUT', '/repos/' + repo + '/contents/README.md', {
      message: 'chore: initialize repository',
      content: Buffer.from('# dsh-freechan\n').toString('base64'),
    });
    parent = boot.commit.sha;
    console.log('BOOTSTRAP=' + parent + ' (空仓库已建首个提交)');
  }

  // 1) blobs
  const tree = [];
  for (const f of files) {
    const content = fs.readFileSync(f.fp).toString('base64');
    const b = await call('POST', '/repos/' + repo + '/git/blobs', { content, encoding: 'base64' });
    tree.push({ path: f.rel, mode: '100644', type: 'blob', sha: b.sha });
  }
  console.log('BLOBS=' + tree.length);

  // 2) tree / commit / ref
  const t = await call('POST', '/repos/' + repo + '/git/trees', { tree });
  const c = await call('POST', '/repos/' + repo + '/git/commits', { message: msg, tree: t.sha, parents: [parent] });
  console.log('COMMIT=' + c.sha);
  await call('PATCH', '/repos/' + repo + '/git/refs/heads/' + branch, { sha: c.sha, force: true });
  const head = await call('GET', '/repos/' + repo + '/git/ref/heads/' + branch);
  console.log('HEAD=' + head.object.sha);

  // 3) 回读校验
  const listing = await call('GET', '/repos/' + repo + '/contents/?ref=' + branch);
  console.log('ROOT_ENTRIES=' + listing.map(x => x.name).join(','));
})().catch(e => { console.error('FAIL ' + e.message); process.exit(1); });