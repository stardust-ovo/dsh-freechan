#!/usr/bin/env node
// report.mjs — 收集报 issue 需要的环境信息，输出可直接粘贴的 Markdown（自动脱敏，不打印任何密钥）
// 用法： node scripts/report.mjs           贴到 issue 的「诊断信息」
//        node scripts/report.mjs --json   机器可读
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asJson = process.argv.includes('--json');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const prov = JSON.parse(fs.readFileSync(path.join(ROOT, 'providers.json'), 'utf8'));

const env = {
  pluginVersion: pkg.version,
  node: process.version,
  platform: os.platform() + ' ' + os.release(),
  root: process.env.FREECHAN_ROOT || '(未设置，自动探测)',
  python: process.env.FREECHAN_PYTHON || '(未设置，用默认 python)',
  askPy: null,
  pythonVersion: null,
  providers: { web: Object.keys(prov.web || {}), api: Object.keys(prov.api || {}) },
  apiKeysPresent: {},
  lastApplyLog: [],
};

const guess = process.env.FREECHAN_ROOT || 'D:/codex-project1';
const askPath = path.join(guess, '_tools', 'ask.py');
env.askPy = fs.existsSync(askPath) ? askPath : 'NOT_FOUND';

const py = process.env.FREECHAN_PYTHON || 'python';
try {
  const r = spawnSync(py, ['--version'], { encoding: 'utf8' });
  env.pythonVersion = ((r.stdout || '') + (r.stderr || '')).trim() || null;
} catch { env.pythonVersion = null; }

for (const [k, v] of Object.entries(prov.api || {})) {
  const name = v.key_env;
  env.apiKeysPresent[k] = name ? Boolean(process.env[name]) : null;
}

const logPath = path.join(ROOT, 'apply.log');
if (fs.existsSync(logPath)) {
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  env.lastApplyLog = lines.slice(-3);
}

// 脱敏：任何形如 ghp_xxx / sk-xxx / 32 位以上 hex/base64 的串都替换
const redact = (s) => String(s)
  .replace(/ghp_[A-Za-z0-9]{20,}/g, '[REDACTED]')
  .replace(/sk-[A-Za-z0-9._-]{16,}/g, '[REDACTED]')
  .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, '[REDACTED]');

if (asJson) {
  console.log(JSON.stringify(env, null, 2));
} else {
  console.log('### 环境诊断（scripts/report.mjs 自动生成）');
  console.log('');
  console.log('```');
  for (const [k, v] of Object.entries(env)) {
    console.log(k + ': ' + redact(Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v));
  }
  console.log('```');
}
