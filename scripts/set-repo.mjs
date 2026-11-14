#!/usr/bin/env node
// scripts/set-repo.mjs — 一次填好 package.json 里的仓库三件套
// 用法：
//   node scripts/set-repo.mjs --check              只看现状
//   node scripts/set-repo.mjs <owner> [repo]       写入（repo 默认 dsh-freechan）
// 说明：只改 repository.url / repository.directory / bugs.url / homepage 四处，别的一律不动。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(here, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const argv = process.argv.slice(2);

const FIELDS = ['repository', 'bugs', 'homepage'];
const show = () => {
  console.log('package.json:', pkgPath);
  console.log('  repository:', JSON.stringify(pkg.repository));
  console.log('  bugs      :', JSON.stringify(pkg.bugs));
  console.log('  homepage  :', pkg.homepage);
  const bad = FIELDS.filter((f) => JSON.stringify(pkg[f] || '').includes('USER'));
  console.log(bad.length ? '  待填占位符: ' + bad.join(', ') : '  没有占位符了');
  return bad;
};

if (!argv.length || argv[0] === '--check') {
  const bad = show();
  process.exit(bad.length ? 1 : 0);
}

const owner = argv[0];
const repo = argv[1] || 'dsh-freechan';
if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) {
  console.error('owner/repo 只允许字母数字与 - _ .');
  process.exit(2);
}
const url = 'https://github.com/' + owner + '/' + repo;
pkg.repository = { type: 'git', url: url + '.git' };
pkg.bugs = { url: url + '/issues' };
pkg.homepage = url + '#readme';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('已写入:');
show();
