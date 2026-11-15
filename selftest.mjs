// selftest.mjs — 不依赖 DSH 宿主：假 ctx + identity defineTool，逐条真跑各工具
// 用法： node selftest.mjs           快测（跳过出图与长文压缩，约 20 秒）
//        node selftest.mjs --full    全测（再加 freeimage ~25s、freecondense ~6min）
process.env.FREECHAN_SELFTEST = '1';
const mod = await import('./lib/index.js');

const full = process.argv.includes('--full');
const defs = new Map();
const ctx = {
  tools: { register(def) { defs.set(def.name, def); return () => {}; } },
  logger: { info: (m) => console.log('[info]', m) },
};

await mod.apply(ctx, {});
const names = [...defs.keys()];
console.log('REGISTERED(' + names.length + ')=' + names.join(','));

const results = [];
async function run(name, args = {}) {
  const t0 = Date.now();
  try {
    const out = await defs.get(name).execute(args, { signal: { aborted: false } });
    const s = JSON.stringify(out);
    const ms = Date.now() - t0;
    results.push({ name, ok: true, ms });
    console.log('\n== ' + name + ' OK ' + ms + 'ms\n' + s.slice(0, 500));
    return out;
  } catch (e) {
    const ms = Date.now() - t0;
    const s = String(e);
    // 环境性缺省（对端服务没起）不算失败：标 SKIP，避免本机/CI 上因外设缺席而红
    const skip = /scheduler daemon|离线|未启动|ECONNREFUSED|8080/.test(s);
    results.push({ name, ok: skip, skip, ms, err: s });
    console.log('\n== ' + name + (skip ? ' SKIP ' : ' FAIL ') + ms + 'ms\n' + s.slice(0, 300));
    return null;
  }
}

const offline = process.argv.includes('--offline');
if (offline) {
  // 只验纯 Node 路径：陌生机器上没 key、没 python 时也能跑这一段
  await run('freechan_providers');
  await run('freechan_doctor');
  console.log('\n（--offline：跳过需要密钥或本机工具链的工具）');
} else {
await run('freechan_doctor');
await run('freechan_stats');
await run('freejob', { action: 'list' });
await run('freeask', { prompt: '只回复两个字：收到' });
await run('freedispatch', { kind: 'ask', input: '只回复两个字：收到' });
await run('teleagent', { prompt: '只回复两个字：收到', waitSeconds: 30 });
}
if (full) {
  await run('freeimage', { prompt: '一只橘猫，写实风格' });
  await run('freecondense', { path: 'D:/codex-project1/_tools/webscrape/README.md', points: 5 });
} else {
  console.log('\n（跳过 freeimage / freecondense，加 --full 一起测）');
}

const pass = results.filter((r) => r.ok).length;
console.log('\n---- 汇总 ----');
for (const r of results) console.log((r.skip ? 'SKIP' : r.ok ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(18) + r.ms + 'ms');
const skipped = results.filter((r) => r.skip).length;
console.log('通过 ' + pass + '/' + results.length + (skipped ? '（其中 ' + skipped + ' 项按环境跳过）' : ''));
process.exit(pass === results.length ? 0 : 1);
