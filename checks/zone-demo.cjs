// 区域制改造验收：无头 Chrome 双客户端验证随机出生、并发献供、静坐冲突挪位。
const { chromium } = require('../client-tools/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = __dirname;
const SPAWN = { xMin: -3.5, xMax: 3.5, zMin: 15.5, zMax: 19.5 };
let browser;
(async () => {
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
  const errors = [];
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mkPage = async (ctx) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(String(e)));
    p.on('crash', () => errors.push('PAGE_CRASH'));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    return p;
  };
  const url = process.env.DEMO_URL || 'http://localhost:2567';
  const join = async (p, name) => {
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.templeDemo?.world, null, { timeout: 120000 });
    await p.locator('#nickname').fill(name);
    await p.locator('#enter').click();
    await p.waitForFunction(() => window.templeDemo?.room?.state?.players?.size >= 1, null, { timeout: 15000 });
    await p.waitForTimeout(800);
  };
  const state = p => p.evaluate(() => {
    const d = window.templeDemo, own = d.room.state.players.get(d.room.sessionId);
    return { x: own.x, z: own.z, action: own.action, n: d.room.state.players.size, offerings: [...d.room.state.offerings.values()].map(o => o.offeringType) };
  });

  const a = await mkPage(desktop), b = await mkPage(mobile);
  await join(a, '区域甲'); await join(b, '区域乙');
  await a.waitForFunction(() => window.templeDemo.room.state.players.size === 2, null, { timeout: 15000 });

  // 1) 随机出生：都在入口区域且保持间距
  const [sa, sb] = [await state(a), await state(b)];
  for (const s of [sa, sb]) assert.ok(s.x >= SPAWN.xMin && s.x <= SPAWN.xMax && s.z >= SPAWN.zMin && s.z <= SPAWN.zMax, `出生点应在入口区域内：(${s.x},${s.z})`);
  assert.ok(Math.hypot(sa.x - sb.x, sa.z - sb.z) >= 0.9, `出生点应错开：${Math.hypot(sa.x - sb.x, sa.z - sb.z)}`);
  console.log('✔ 随机出生：甲', sa.x.toFixed(2), sa.z.toFixed(2), '乙', sb.x.toFixed(2), sb.z.toFixed(2));
  await a.screenshot({ path: path.join(out, 'z1-随机出生.png') });

  // 2) 并发献花：两人各点一次，都应完成且案上出现两件
  for (const p of [a, b]) { await p.locator('#action-offering').click(); await p.locator('#flower').click(); }
  await a.waitForFunction(() => { const o = window.templeDemo.room.state.offerings; let f = 0; o.forEach(v => { if (v.offeringType === 'flower') f++; }); return f >= 2; }, null, { timeout: 60000 });
  const [fa, fb] = [await state(a), await state(b)];
  assert.equal(fa.action, 'idle', '甲应完成献供');
  assert.equal(fb.action, 'idle', '乙应完成献供');
  assert.equal(fa.offerings.filter(t => t === 'flower').length, 2, '案上应有两件花');
  assert.ok(Math.hypot(fa.x - fb.x, fa.z - fb.z) >= 0.6, '两人站位应错开');
  console.log('✔ 并发献花：两人站位', fa.x.toFixed(2), fa.z.toFixed(2), '/', fb.x.toFixed(2), fb.z.toFixed(2));
  await a.screenshot({ path: path.join(out, 'z2-并发献花.png') });

  // 3) 静坐：两人都点静坐，都应坐下且间距达标（含冲突挪位）
  for (const p of [a, b]) await p.locator('#action-sit').click();
  await a.waitForFunction(() => { const d = window.templeDemo; for (const p of d.room.state.players.values()) if (p.action !== 'sit') return false; return true; }, null, { timeout: 60000 });
  const [ta, tbb] = [await state(a), await state(b)];
  assert.ok(Math.hypot(ta.x - tbb.x, ta.z - tbb.z) >= 0.6, `静坐间距应 ≥0.6：${Math.hypot(ta.x - tbb.x, ta.z - tbb.z)}`);
  console.log('✔ 双人静坐：间距', Math.hypot(ta.x - tbb.x, ta.z - tbb.z).toFixed(2));
  await a.screenshot({ path: path.join(out, 'z3-双人静坐.png') });

  // 4) 甲起身、原地再敬香一次（回归：原地动作不受影响）
  await a.locator('#cancel').click();
  await a.waitForFunction(() => window.templeDemo.room.state.players.get(window.templeDemo.room.sessionId).action === 'idle', null, { timeout: 5000 });
  await a.locator('#action-incense').click();
  await a.waitForFunction(() => window.templeDemo.room.state.players.get(window.templeDemo.room.sessionId).action === 'incense', null, { timeout: 5000 });
  await a.waitForFunction(() => window.templeDemo.room.state.players.get(window.templeDemo.room.sessionId).action === 'idle', null, { timeout: 10000 });
  console.log('✔ 原地敬香回归正常');

  const report = { testedAt: new Date().toISOString(), protocol: 'v3 区域制', clients: 2, spawn: { a: [sa.x, sa.z], b: [sb.x, sb.z] }, concurrentFlowers: 2, sit: { a: [ta.x, ta.z], b: [tbb.x, tbb.z] }, errors };
  fs.writeFileSync(path.join(out, 'zone-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
