// 验证 v03 简化圆脸主像已进入演示版：节点就位、无主像萌化头残留、礼敬视角截图。
const { chromium } = require('../client-tools/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const url = process.env.DEMO_URL || 'http://localhost:2567';
let browser;
(async () => {
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('crash', () => errors.push('PAGE_CRASH'));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.templeDemo?.world, null, { timeout: 180000 });
  console.log('场景已加载，进入房间…');
  await page.locator('#nickname').fill('主像核验'); await page.locator('#enter').click();
  await page.waitForFunction(() => window.templeDemo?.room?.state?.players?.size >= 1, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const out = { statue: null, cuteHeads: [] };
    const visit = node => {
      if (node.name === 'Statue_Chenghuang') {
        const p = node.worldPosition;
        const r = node.getComponent('cc.MeshRenderer') || node.getComponent('MeshRenderer');
        out.statue = { pos: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)], subMeshes: r ? r.sharedMaterials.filter(Boolean).length : 0 };
      }
      if (node.name.startsWith('CuteStatue')) {
        const p = node.worldPosition;
        out.cuteHeads.push([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
      }
      node.children.forEach(visit);
    };
    visit(window.templeDemo.world.root);
    return out;
  });
  console.log('节点核验', JSON.stringify(info));
  assert.ok(info.statue, 'Statue_Chenghuang 节点缺失');
  const [sx, sy, sz] = info.statue.pos;
  assert.ok(Math.abs(sx) < .05 && Math.abs(sy - .94) < .05 && Math.abs(sz + 23.06) < .1, '主像位置异常: ' + JSON.stringify(info.statue.pos));
  assert.ok(!info.cuteHeads.some(([x, , z]) => Math.abs(x) < .5 && z < -22.5), '主像位置仍有萌化头: ' + JSON.stringify(info.cuteHeads));
  console.log('✔ 主像节点在位，萌化头已移除');
  // 点击礼敬，游戏会自动寻路到正殿礼敬区并面向主像。
  await page.locator('#action-bow').click();
  await page.waitForFunction(() => {
    const d = window.templeDemo, own = d.room?.state?.players?.get(d.room.sessionId);
    return own && own.action === 'bow';
  }, null, { timeout: 180000 });
  console.log('✔ 已自动走到礼敬位并开始行礼');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, '12-新主像礼敬.png') });
  console.log('✔ 礼敬截图 12-新主像礼敬.png');
  // 近景：镜头拉近偏一点角度，看主像圆脸与官帽。
  await page.evaluate(() => { const d = window.templeDemo; d.cameraDistance = 2.6; d.cameraYaw = .45; d.updateCamera(1); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, '13-新主像近景.png') });
  console.log('✔ 近景截图 13-新主像近景.png');
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(+(n / 2).toFixed(1)); };
    requestAnimationFrame(loop);
  }));
  const report = { testedAt: new Date().toISOString(), browser: 'Chrome headless / software WebGL', actualPhones: false,
    statueNode: info.statue, cuteHeads: info.cuteHeads, headlessFps: fps, errors };
  fs.writeFileSync(path.join(__dirname, 'statue-swap-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  assert.deepEqual(errors, []);
})().catch(e => { console.error('FAIL', e && e.stack || e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
