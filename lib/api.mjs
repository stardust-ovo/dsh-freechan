// api.mjs — 纯 Node 的 API 通道客户端（不依赖 Python）
// 目标：别人 clone 仓库、填一个 key 就能用，不需要本机那套 _tools 工具链。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATE_FILES = [
  process.env.FREECHAN_PROVIDERS,
  path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'providers.json'),
].filter(Boolean);

export function loadProviders(file) {
  const p = file || CANDIDATE_FILES.find((f) => f && fs.existsSync(f));
  if (!p) throw new Error('找不到 providers.json（可用 FREECHAN_PROVIDERS 指定路径）');
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { file: p, cfg };
}

/** 从环境变量或密钥文件解析出 API key；文件里用 key_regex 抽第一条 */
export function resolveKey(api) {
  if (!api) return null;
  if (api.key_env && process.env[api.key_env]) return process.env[api.key_env];
  const file = api.key_file && api.key_file.replace(/^~/, os.homedir());
  if (file && fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    if (api.key_regex) {
      const m = raw.match(new RegExp(api.key_regex));
      if (m) return m[1] || m[0];
    }
  }
  return null;
}

/** 列出 API 通道及就绪状态；不打印密钥本身 */
export function listApi(cfg) {
  return Object.entries(cfg.api || {}).map(([key, api]) => ({
    key,
    label: api.label || key,
    model: api.default_model || api.model || '',
    ready: Boolean(resolveKey(api)),
    key_env: api.key_env || '',
  }));
}

export function listWeb(cfg) {
  return Object.entries(cfg.web || {}).map(([key, w]) => ({
    key,
    label: w.label || key,
    note: w.note || '',
  }));
}

function joinUrl(base, p) {
  if (!p) return base;
  return base.replace(/\/$/, '') + '/' + String(p).replace(/^\//, '');
}

/** 调一家 OpenAI 兼容端点，返回纯文本 */
export async function askApi(api, prompt, opts = {}) {
  const key = resolveKey(api);
  if (!key) throw new Error((api.key_env || 'API key') + ' 未设置');
  const url = joinUrl(api.base, api.path);
  const body = {
    model: opts.model || api.model || api.default_model,
    messages: [{ role: 'user', content: String(prompt) }],
    temperature: opts.temperature ?? 0.3,
    stream: false,
  };
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs || 120000);
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
        ...(api.headers || {}),
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const raw = await resp.text();
  if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + raw.slice(0, 200));
  let j;
  try { j = JSON.parse(raw); } catch { throw new Error('返回不是 JSON：' + raw.slice(0, 160)); }
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  const txt = (msg && (msg.content || msg.reasoning_content)) || j.output_text || '';
  if (!txt) throw new Error('返回里没有文本：' + raw.slice(0, 160));
  return { text: String(txt).trim(), ms: Date.now() - t0 };
}

/** 按 order 找第一家就绪的 API 通道 */
export function pickReady(cfg, prefer) {
  const api = cfg.api || {};
  if (prefer) return api[prefer] ? { key: prefer, api: api[prefer] } : null;
  for (const key of (cfg.order || Object.keys(api))) {
    if (api[key] && resolveKey(api[key])) return { key, api: api[key] };
  }
  return null;
}
