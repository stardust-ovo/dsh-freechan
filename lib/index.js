// dsh-freechan — 把免费产能通道注册成 DSH 原生工具
// 工具：freeask（单次提问）/ freejob（队列）/ freechan_stats（通道统计）/ freechan_doctor（自检）
//      freeimage（出图）/ freecondense（长文压缩）/ teleagent（本机 TeleAgent）/ freedispatch（统一派活）
import { spawnSync } from 'node:child_process';
import { loadProviders, listApi, listWeb, askApi, pickReady, resolveKey } from './api.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const name = 'dsh-freechan';
export const inject = ['tools'];

// 根目录：优先 FREECHAN_ROOT，其次按「插件位于 <root>/_tools/plugins/<pkg>/lib」反推
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const GUESS = path.resolve(HERE, '../../../..');
const ROOT = process.env.FREECHAN_ROOT
  || (fs.existsSync(path.join(GUESS, '_tools', 'ask.py')) ? GUESS.replace(/\\/g, '/') : 'D:/codex-project1');
const PY = process.env.FREECHAN_PYTHON || (ROOT + '/_tools/venv-web/Scripts/python.exe');
const ASK = ROOT + '/_tools/ask.py';
const FREEJOB = ROOT + '/workbench/lib/freejob.mjs';
const GENIMG = ROOT + '/_tools/gen_image.py';
const CONDENSE = ROOT + '/_tools/condense.py';
const TELEAGENT = ROOT + '/_tools/teleagent.ps1';
const PWSH = 'pwsh';
const TMP = path.join(os.tmpdir(), 'dsh-freechan');
const LOGF = ROOT + '/_tools/plugins/dsh-freechan/apply.log';

/** 本机工具链（python + _tools 脚本）是否可用；FREECHAN_TOOLBOX=0 可强制关掉 */
function toolboxReady() {
  if (process.env.FREECHAN_TOOLBOX === '0') return false;
  try { return fs.existsSync(ASK) && fs.existsSync(PY); } catch { return false; }
}

function noToolboxHint(want, cfg) {
  const ready = listApi(cfg).filter((x) => x.ready).map((x) => x.key);
  const webKeys = listWeb(cfg).map((x) => x.key);
  const lines = [];
  if (want) lines.push('通道 ' + want + ' 需要本机工具链（python + _tools/ask.py），当前不可用。');
  else lines.push('没有可用的 API 通道，且本机工具链不可用。');
  lines.push('可直接用的 API 通道：' + (ready.length ? ready.join(', ') : '（一个都没有，先设置 key 环境变量）'));
  if (want && webKeys.includes(want)) lines.push('网页通道（' + want + '）依赖 python 工具链与浏览器登录态，见 docs/WEB-CHANNELS.md。');
  return lines.join('\n');
}

function note(msg) {
  try {
    fs.mkdirSync(path.dirname(LOGF), { recursive: true });
    fs.appendFileSync(LOGF, new Date().toISOString() + ' ' + msg + '\n', 'utf8');
  } catch {}
}

/** 起子进程并把 stdout/stderr 落文件：DSH 沙箱里 pipe 会 EPERM */
function run(cmd, args, timeoutMs = 600000) {
  fs.mkdirSync(TMP, { recursive: true });
  const tag = process.pid + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const outF = path.join(TMP, tag + '.out');
  const errF = path.join(TMP, tag + '.err');
  const ofd = fs.openSync(outF, 'w');
  const efd = fs.openSync(errF, 'w');
  let status = 0;
  try {
    const r = spawnSync(cmd, args, {
      stdio: ['ignore', ofd, efd],
      timeout: timeoutMs,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', TEMP: TMP, TMP },
    });
    status = r.status === null ? -1 : r.status;
  } finally {
    fs.closeSync(ofd);
    fs.closeSync(efd);
  }
  const out = fs.readFileSync(outF, 'utf8');
  const err = fs.readFileSync(errF, 'utf8');
  try { fs.unlinkSync(outF); fs.unlinkSync(errF); } catch {}
  return { status, out, err };
}

const text = (s) => [{ type: 'text', text: String(s ?? '') }];
const renderText = (_a, v) => text(v && v.text ? v.text : '(空)');

export async function apply(ctx, config) {
  note('apply() entered');
  let defineTool;
  try {
    ({ defineTool } = await import('@deepseek-ai/dsh-tools'));
  } catch (err) {
    if (process.env.FREECHAN_SELFTEST === '1') {
      defineTool = (def) => def;           // 只在自测模式下走这里
      note('selftest mode: identity defineTool');
    } else {
      note('defineTool import FAILED: ' + (err && err.message ? err.message : err));
      throw new Error('无法加载 @deepseek-ai/dsh-tools（需在 DSH 宿主内运行）：' + (err && err.message ? err.message : err));
    }
  }

  const disposers = [];
  const ctxTools = {};
  const reg = (def) => {
    ctxTools[def.name] = def;
    try {
      const d = ctx.tools.register(defineTool(def));
      note('registered ' + def.name);
      return d;
    } catch (e) {
      note('register FAILED ' + def.name + ': ' + (e && e.message ? e.message : e));
      return () => {};
    }
  };

  disposers.push(reg({
    name: 'freeask',
    description: '把"吃量不吃脑"的问题交给免费通道（GLM 优先，失败自动降级千问/Kimi），返回纯文本答案、通道名与用时。指定 channel 时默认钉死该通道，加 fallback=true 才会失败后继续降级。适合改写、摘要、抽取、简单问答；不适合需要本机上下文的长任务。',
    parameters: {
      prompt: { type: 'string', required: true, description: '要问的内容' },
      channel: { type: 'string', description: '指定 provider 键（freechan_providers 可列全部）；省略则自动路由' },
      fallback: { type: 'boolean', description: '指定的 channel 失败后按 provider 顺序继续降级（默认否，指定通道即钉死）' },
    },
    output: { schema: { type: 'json' }, render: renderText },
    timeoutMs: 600000,
    isConcurrencySafe: () => false,
    async execute(args) {
      if (!args || !args.prompt) throw new Error('prompt 不能为空');
      const { cfg } = loadProviders();
      const want = args.channel;
      const apiHit = want
        ? (cfg.api && cfg.api[want] ? { key: want, api: cfg.api[want] } : null)
        : pickReady(cfg);

      // 1) 优先纯 Node 的 API 通道：不依赖 python，别人装完就能用
      if (apiHit) {
        try {
          const r = await askApi(apiHit.api, args.prompt, {});
          return { channel: apiHit.key, ms: String(r.ms), via: 'api', text: r.text };
        } catch (e) {
          if (!args.fallback) throw new Error('API 通道 ' + apiHit.key + ' 失败：' + (e && e.message ? e.message : e));
          note('api ' + apiHit.key + ' failed, fallback to toolbox: ' + (e && e.message ? e.message : e));
        }
      }

      // 2) 回落到本机工具链（网页通道 / 特殊通道）
      if (!toolboxReady()) throw new Error(noToolboxHint(want, cfg));

      const cli = [ASK];
      if (want) cli.push('--channel', want);
      if (want && args.fallback) cli.push('--fallback');
      cli.push(String(args.prompt));
      const r = run(PY, cli, 600000);
      if (r.status !== 0 && !r.out.trim()) {
        throw new Error('免费通道全部失败：' + (r.err || '').split('\n').slice(-3).join(' | '));
      }
      const chan = (r.err.match(/\[([a-z]+)\]\s+OK/) || [])[1] || (want || 'auto');
      const ms = (r.err.match(/OK\s+(\d+)ms/) || [])[1] || '';
      return { channel: chan, ms, via: 'toolbox', text: r.out.trim() };
    },
  }));

  disposers.push(reg({
    name: 'freejob',
    description: '操作 workbench 的免费任务队列：new 建任务（需 ask）、list 列最近任务、show 看提示词、auto 自动执行待办（自动路由免费通道）、stats 统计。',
    parameters: {
      action: { type: 'string', required: true, enum: ['new', 'list', 'show', 'auto', 'stats'], description: '动作' },
      ask: { type: 'string', description: 'new 时的任务描述' },
      format: { type: 'string', description: 'new 时的输出格式要求' },
      id: { type: 'string', description: 'show / auto 单条时的任务 id' },
      channel: { type: 'string', enum: ['zhipu', 'qwen', 'kimi'], description: 'auto 时指定通道' },
    },
    output: { schema: { type: 'json' }, render: renderText },
    timeoutMs: 900000,
    isConcurrencySafe: () => false,
    async execute(args) {
      if (!args || !args.action) throw new Error('action 不能为空');
      const cli = [FREEJOB, args.action];
      if (args.action === 'new') {
        if (!args.ask) throw new Error('new 需要 ask');
        cli.push('--ask', String(args.ask));
        if (args.format) cli.push('--format', String(args.format));
      } else {
        if (args.id) cli.push(String(args.id));
        if (args.action === 'auto') {
          if (!args.id) cli.push('--all');
          if (args.channel) cli.push('--channel', String(args.channel));
        }
      }
      const r = run(process.execPath, cli, 900000);
      const body = (r.out || '').trim() || (r.err || '').trim();
      if (r.status !== 0) throw new Error('freejob ' + args.action + ' 失败：' + body.slice(0, 300));
      return { action: args.action, text: body };
    },
  }));

  disposers.push(reg({
    name: 'freechan_stats',
    description: '汇总免费通道调用记录：每个通道的次数、成功率、中位耗时、平均回答字符数。',
    parameters: {},
    output: { schema: { type: 'json' }, render: renderText },
    timeoutMs: 120000,
    isConcurrencySafe: () => true,
    async execute() {
      const r = run(PY, [ASK, 'stats'], 120000);
      return { text: (r.out || r.err || '').trim() };
    },
  }));

  // 3b) freechan_doctor —— 本地化新增：一条命令看清本机能不能用
  disposers.push(reg({
    name: 'freechan_doctor',
    description: '自检：API 通道与密钥是否就绪、可选工具链（python 脚本）是否装了、TeleAgent 8080 是否在线、通道统计与队列条数。跑不通时先看它。',
    parameters: {},
    output: { schema: { type: 'json' }, render: renderText },
    timeoutMs: 120000,
    isConcurrencySafe: () => true,
    async execute() {
      const lines = [];
      const { cfg } = loadProviders();
      lines.push('== API 通道（纯 Node）==');
      for (const a of listApi(cfg)) {
        lines.push((a.ready ? '[ok] ' : '[缺] ') + a.key + '（' + a.model + '）' + (a.ready ? '' : ' 缺 ' + (a.key_env || 'key')));
      }
      lines.push('', '== 可选工具链（网页通道/出图/压缩/TeleAgent 才需要）==');
      const items = [
        ['python', PY], ['ask.py', ASK], ['freejob.mjs', FREEJOB],
        ['gen_image.py', GENIMG], ['condense.py', CONDENSE], ['teleagent.ps1', TELEAGENT],
      ];
      for (const [label, file] of items) {
        lines.push((fs.existsSync(file) ? '[ok] ' : '[缺] ') + label + '：' + file);
      }
      lines.push('工具链状态：' + (toolboxReady() ? '可用（网页通道可走）' : '未安装（只有 API 通道可用，不影响 freeask）'));
      // profile 声明的 link 与 node_modules 实际指向是否一致：搬目录/改路径后最容易静默失联
      try {
        const prof = 'C:/Users/peter/.dsh/profiles/desktop';
        const pkg = JSON.parse(fs.readFileSync(path.join(prof, 'package.json'), 'utf8'));
        const declared = (pkg.dependencies || {})['dsh-freechan'] || '';
        let real = '';
        try { real = fs.realpathSync(path.join(prof, 'node_modules', 'dsh-freechan')); } catch {}
        lines.push('link 声明：' + (declared || '(未声明)'));
        lines.push('实体路径：' + (real || '(缺失)'));
        const norm = (s) => String(s || '').replace(/^link:/i, '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
        const want = norm(declared), got = norm(real);
        if (!want || !got) lines.push('[警告] 声明或实体缺失，重启后可能整片工具消失');
        else if (want !== got) lines.push('[警告] 声明与实体不一致：下次 pnpm install 会指向不存在的目录（按上面两条路径核对）');
        else lines.push('[ok] link 声明与实体一致');
      } catch (e) {
        lines.push('link 检查跳过：' + (e && e.message ? e.message : e));
      }
      const pv = run(PY, ['-V'], 30000);
      lines.push('python：' + ((pv.out || pv.err || '').trim() || '(读不到)') + '　node：' + process.version);
      let tele = '离线（8080 无响应）';
      try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 1200);
        const resp = await fetch('http://127.0.0.1:8080/', { signal: ac.signal });
        clearTimeout(timer);
        tele = resp.status === 401 ? '在线（HTTP 401，需鉴权但服务活着）' : '在线（HTTP ' + resp.status + '）';
      } catch {}
      lines.push('TeleAgent：' + tele);
      const st = run(PY, [ASK, 'stats'], 60000);
      lines.push('通道统计：' + ((st.out || st.err || '').trim().split('\n').slice(0, 2).join(' / ') || '(空)'));
      const lj = run(process.execPath, [FREEJOB, 'list'], 60000);
      lines.push('队列：' + (lj.out || '').trim().split('\n').filter(Boolean).length + ' 条');
      lines.push('已注册工具：' + Object.keys(ctxTools).join(', '));
      return { text: lines.join('\n') };
    },
  }));

  // 4) freeimage —— GLM 出图，落 downloads/zhipu 并登记
  disposers.push(reg({
    name: 'freeimage',
    description: '用智谱 GLM 出图并存到 downloads/zhipu（自动写 INDEX 登记）。返回落盘路径、字节数与模型。默认 cogview-3-flash（免费、带水印），glm-image 更贵但可关水印。',
    parameters: {
      prompt: { type: 'string', required: true, description: '画面描述' },
      model: { type: 'string', enum: ['cogview-3-flash', 'cogview-4', 'glm-image'], description: '默认 cogview-3-flash' },
      size: { type: 'string', description: '如 1024x1024' },
    },
    output: { schema: { type: 'json' }, render: renderText },
    timeoutMs: 300000,
    isConcurrencySafe: () => false,
    async execute(args) {
      if (!args || !args.prompt) throw new Error('prompt 不能为空');
      const cli = [GENIMG, String(args.prompt)];
      if (args.model) cli.push(String(args.model));
      if (args.size) cli.push(String(args.size));
      const r = run(PY, cli, 300000);
      if (r.status !== 0) throw new Error('出图失败（exit ' + r.status + '）：' + (((r.err || '').trim() || (r.out || '').trim()).slice(-300)));
      const saved = (r.out.match(/SAVED (\S+)/) || [])[1] || '';
      const bytes = (r.out.match(/BYTES (\d+)/) || [])[1] || '';
      return { path: saved, bytes, text: saved ? ('已保存：' + saved + '（' + bytes + ' 字节）') : r.out.trim() };
    },
  }));

  // 5) freecondense —— 长文档压缩成要点，落 downloads/summaries
  disposers.push(reg({
    name: 'freecondense',
    description: '把本地长文档压成要点：分块逐段抽要点再合并，产物落 downloads/summaries 并登记。适合 1 万字以上的 md/txt。',
    parameters: {
      path: { type: 'string', required: true, description: '本地文件绝对路径' },
      points: { type: 'integer', description: '最终要点条数，默认 8' },
      model: { type: 'string', description: '默认 glm-5.3-flash（分块）/ glm-4.5-air（合并）' },
      preview: { type: 'boolean', description: '先看样张：只压第 1 块并给整篇 ETA，不落盘、不写 INDEX（默认否）' },
    },
    output: { schema: { type: 'json' }, render: renderText },
    timeoutMs: 1800000,
    isConcurrencySafe: () => false,
    async execute(args) {
      if (!args || !args.path) throw new Error('path 不能为空');
      const cli = [CONDENSE, String(args.path)];
      if (args.points) cli.push('--points', String(args.points));
      if (args.model) cli.push('--model', String(args.model));
      if (args.preview) cli.push('--preview');
      const r = run(PY, cli, 1800000);
      if (r.status !== 0) {
        // 失败原因几乎总在 stderr（SDK 报错、重试记录），别只回 stdout 的进度行
        const tail = ((r.err || '').trim() || (r.out || '').trim()).slice(-400);
        throw new Error('压缩失败（exit ' + r.status + '）：' + tail);
      }
      const summary = (r.out.split('===SUMMARY===')[1] || '').trim();
      if (args.preview) {
        // 预览模式必须早于"取目录里最新文件"的兜底，否则会把旧产物当成这次的结果
        const meta = (r.out.match(/PREVIEW ([^\n]+)/) || [])[1] || '';
        return { path: '', preview: true, eta: meta, text: '预览（未落盘）：' + meta + '\n\n' + summary.slice(0, 4000) };
      }
      let saved = (r.out.match(/SAVED (\S+)/) || [])[1] || '';
      if (!saved) {
        // 回退：summaries 目录里最新产出的那份
        try {
          const dir = ROOT + '/downloads/summaries';
          const files = fs.readdirSync(dir).map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }))
            .sort((a, b) => b.t - a.t);
          if (files.length && Date.now() - files[0].t < 600000) saved = path.join(dir, files[0].n);
        } catch {}
      }
      return { path: saved, text: (saved ? '已保存：' + saved + '\n\n' : '') + summary.slice(0, 4000) };
    },
  }));

  // 6) teleagent —— 派活给本机 TeleAgent 并取回会话答案
  disposers.push(reg({
    name: 'teleagent',
    description: '把任务派给本机 TeleAgent（调度 API 8080）并取回它的回答。TeleAgent 未启动时返回明确失败。适合需要"另一台 agent 独立跑"的活。',
    parameters: {
      prompt: { type: 'string', required: true, description: '交给 TeleAgent 的任务' },
      waitSeconds: { type: 'integer', description: '等结果的最长秒数，默认 150' },
    },
    output: { schema: { type: 'json' }, render: renderText },
    timeoutMs: 600000,
    isConcurrencySafe: () => false,
    async execute(args) {
      if (!args || !args.prompt) throw new Error('prompt 不能为空');
      const wait = String(args.waitSeconds || 150);
      const r = run(PWSH, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', TELEAGENT,
        'ask', '-Prompt', String(args.prompt), '-WaitSeconds', wait], 600000);
      const body = (r.out || r.err || '').trim();
      if (r.status !== 0) throw new Error('TeleAgent 派活失败：' + body.slice(-300));
      const session = (body.match(/SESSION=(\S+)/) || [])[1] || '';
      const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !/^(JOB|SESSION|JOB_DELETED)=/.test(l));
      const filtered = lines.filter((l) => l !== String(args.prompt));
      const ans = (filtered.length ? filtered[filtered.length - 1] : (lines[lines.length - 1] || body));
      return { session, text: ans.trim() };
    },
  }));

  // 8) freechan_providers —— 列出全部 provider 与就绪状态
  disposers.push(reg({
    name: 'freechan_providers',
    description: '列出所有已配置的 provider（API 与网页两类）及其就绪状态：API 看密钥是否命中，网页看登录/验证提示。换通道、排查"为什么某家不可用"时先跑它。',
    parameters: { json: { type: 'boolean', description: 'true 时返回结构化 JSON（默认返回可读表格）' } },
    output: { schema: { type: 'json' }, render: renderText },
    timeoutMs: 60000,
    isConcurrencySafe: () => true,
    async execute(args) {
      // 纯 Node 实现：不依赖 python，装完就能查
      const { cfg, file } = loadProviders();
      const api = listApi(cfg);
      const web = listWeb(cfg);
      const toolbox = toolboxReady();
      if (args && args.json) {
        return { text: JSON.stringify({ file, toolbox, api, web }, null, 2) };
      }
      const lines = ['配置文件: ' + file, '', 'API 通道（纯 Node，无需 python）:'];
      for (const a of api) {
        lines.push('  ' + a.key.padEnd(20) + (a.ready ? '就绪' : '缺密钥 ' + (a.key_env || '')).padEnd(10) + ' ' + a.model);
      }
      lines.push('', '网页通道（需要本机工具链 python + _tools）:');
      for (const w of web) {
        lines.push('  ' + w.key.padEnd(20) + (toolbox ? '可用' : '不可用（未装工具链）') + '　' + w.note);
      }
      if (!toolbox) {
        lines.push('', '本机工具链：未安装（只影响网页通道；API 通道照常可用）。');
        lines.push('要开网页通道见 docs/WEB-CHANNELS.md。');
      }
      return { text: lines.join('\n') };
    },
  }));

  // 7) freedispatch —— 按类型把活分派到上面四条通道
  disposers.push(reg({
    name: 'freedispatch',
    description: '统一派活入口：按 kind 自动选通道。kind=ask（免费文本模型，GLM 优先）、image（GLM 出图）、condense（长文压缩）、teleagent（本机 TeleAgent）。想"一句话把活丢出去"时用这个。',
    parameters: {
      kind: { type: 'string', required: true, enum: ['ask', 'image', 'condense', 'teleagent'], description: '活儿的类型' },
      input: { type: 'string', required: true, description: 'ask/teleagent 传提示词；image 传画面描述；condense 传本地文件路径' },
      channel: { type: 'string', description: '仅 ask 时生效；见 freechan_providers' },
      points: { type: 'integer', description: '仅 condense 时生效，默认 8' },
    },
    output: { schema: { type: 'json' }, render: renderText },
    timeoutMs: 1800000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (!args || !args.kind || !args.input) throw new Error('kind 与 input 必填');
      const pick = (n) => ctxTools[n];
      const k = String(args.kind);
      if (k === 'ask') return pick('freeask').execute({ prompt: args.input, channel: args.channel }, exec);
      if (k === 'image') return pick('freeimage').execute({ prompt: args.input }, exec);
      if (k === 'condense') return pick('freecondense').execute({ path: args.input, points: args.points }, exec);
      if (k === 'teleagent') return pick('teleagent').execute({ prompt: args.input }, exec);
      throw new Error('未知 kind: ' + k);
    },
  }));

  note('apply() done, registered=' + disposers.length);
  return () => { for (const d of disposers) { try { d(); } catch {} } };
}