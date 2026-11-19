// 验证 v03 简化圆脸主像已进入演示版：节点就位、无主像萌化头残留、礼敬视角截图。
const { chromium } = require('../client-tools/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const endpoint = process.env.DEMO_URL || 'http://localhost:2567';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(endpoint, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.templeDemo?.world, { timeout: 120000 });
  await page.locator('#nickname').fill('主像核验'); await page.locator('#enter').click();
  await page.waitForFunction(() => window.templeDemo?.initialized);
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
  console.log(JSON.stringify(info));
  assert.ok(info.statue, 'Statue_Chenghuang node missing');
  const [sx, sy, sz] = info.statue.pos;
  assert.ok(Math.abs(sx) < .05 && Math.abs(sy - .94) < .05 && Math.abs(sz + 23.06) < .1, 'statue position off: ' + JSON.stringify(info.statue.pos));
  assert.ok(!info.cuteHeads.some(([x, , z]) => Math.abs(x) < .5 && z < -22.5), 'cute head still overlays the main statue: ' + JSON.stringify(info.cuteHeads));
  async function walk(x, z) {
    console.log('Walk to', x, z);
    const result = await page.evaluate(async target => {
      const d = window.templeDemo; d.cameraYaw = 0; d.overview = false; d.ui.overview(false);
      return await new Promise(resolve => {
        let previous = 999, stalled = 0;
        const started = Date.now();
        const timer = setInterval(() => {
          const dx = target.x - d.localPosition.x, dz = target.z - d.localPosition.z;
          const length = Math.hypot(dx, dz);
          if (length < .13 || Date.now() - started > 45000 || stalled > 100) {
            clearInterval(timer); d.ui.movement = {x:0,y:0};
            resolve({ ok: length < .13, length }); return;
          }
          stalled = Math.abs(previous-length)<.0001 ? stalled + 1 : 0; previous=length;
          d.ui.movement = { x: dx/length, y: -dz/length };
        }, 60);
      });
    }, { x, z });
    assert.ok(result.ok, 'Walk route blocked: ' + JSON.stringify(result));
    await page.waitForTimeout(350);
  }
  await walk(0, .65);
  await walk(2.6, .65); await walk(2.6, -3); await walk(0, -3); await walk(0, -11.6);
  await walk(3, -11.6); await walk(3, -14.1); await walk(0, -14.1); await walk(0, -18.8);
  await page.locator('#action-bow').click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(__dirname, '12-新主像礼敬.png') });
  // 近景：镜头拉近偏一点角度，看主像圆脸与官帽。
  await page.evaluate(() => { const d = window.templeDemo; d.cameraDistance = 2.4; d.cameraYaw = .35; d.updateCamera(1); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, '13-新主像近景.png') });
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
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { });
