const { chromium } = require('../client-tools/node_modules/playwright-core');
const { Client } = require('../server/node_modules/@colyseus/sdk');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const endpoint = process.env.DEMO_URL || 'http://localhost:2567';
let browser, observer, late;
async function until(test, label, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (test()) return; await pause(80); }
  throw new Error('Timed out: ' + label);
}
(async () => {
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
    args: ['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  await page.goto(endpoint, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.templeDemo?.world, { timeout: 120000 });
  await page.locator('#nickname').fill('仪式演示'); await page.locator('#enter').click();
  await page.waitForFunction(() => window.templeDemo?.initialized);
  const id = await page.evaluate(() => window.templeDemo.room.sessionId);
  observer = await new Client(endpoint).joinOrCreate('temple', { nickname: '同步观察' });
  observer.onMessage('event', () => {}); observer.onMessage('notice', () => {});
  await until(() => observer.state.players?.has(id), 'observer receives actor');
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
            resolve({ ok: length < .13, length, x:d.localPosition.x, y:d.localPosition.y, z:d.localPosition.z }); return;
          }
          stalled = Math.abs(previous-length)<.0001 ? stalled + 1 : 0; previous=length;
          d.ui.movement = { x: dx/length, y: -dz/length };
        }, 60);
      });
    }, { x, z });
    assert.ok(result.ok, 'Walk route blocked: ' + JSON.stringify(result));
    await page.waitForTimeout(350);
  }
  async function action(kind, screenshot, offeringType) {
    await page.locator('#action-' + kind).click();
    if (offeringType) await page.locator('#' + offeringType).click();
    await until(() => observer.state.players.get(id)?.action === kind, 'remote sees ' + kind);
    await page.waitForTimeout(kind === 'bow' ? 1400 : 1000);
    await page.screenshot({ path: path.join(__dirname, screenshot) });
    if (kind !== 'sit') await until(() => observer.state.players.get(id)?.action === 'idle', kind + ' completes');
  }
  await walk(0, .65);
  await action('incense', '05-敬香.png');
  assert.ok(observer.state.incenses.size > 0, 'remote receives placed incense');
  await walk(2.6, .65); await walk(2.6, -3); await walk(0, -3); await walk(0, -11.6);
  await action('offering', '06-献花.png', 'flower');
  await action('offering', '07-献果.png', 'fruit');
  assert.ok(observer.state.offerings.size === 2, 'remote receives flower and fruit');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, '08-供案结果.png') });
  await walk(3,-11.6); await walk(3,-14.1); await walk(0,-14.1); await walk(0,-18.8);
  await action('bow', '09-礼敬.png');
  await walk(0,-14.1); await walk(3,-14.1); await walk(3,-10.7); await walk(0,-10.7); await walk(0,-5.3); await walk(-11,-5.3);
  await action('sit', '10-静坐.png');
  late = await new Client(endpoint).joinOrCreate('temple', { nickname: '晚到访客' });
  late.onMessage('event', () => {}); late.onMessage('notice', () => {});
  await until(() => late.state.players?.get(id)?.action === 'sit' && late.state.offerings?.size === 2, 'late join sees sit and offerings');
  await page.locator('#cancel').click();
  await until(() => observer.state.players.get(id)?.action === 'idle', 'stand up');
  await action('sit', '11-再次静坐.png');
  await page.evaluate(() => window.templeDemo.room.leave());
  await page.waitForFunction(() => !window.templeDemo.room);
  await until(() => !observer.state.players.has(id), 'left player removed');
  await page.locator('#reconnect').click();
  await page.waitForFunction(() => window.templeDemo.room?.state?.players?.has(window.templeDemo.room.sessionId));
  const report = { testedAt:new Date().toISOString(), browser:'Chrome headless / software WebGL', actualPhones:false,
    walkedRoute:true, incense:true, flower:true, fruit:true, bow:true, sit:true, standUp:true, lateJoinState:true,
    remoteStateObserved:true, disconnectAndReenter:true, errors };
  fs.writeFileSync(path.join(__dirname,'ritual-report.json'), JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  assert.deepEqual(errors,[]);
})().catch(e => { console.error(e); process.exitCode=1; }).finally(async () => {
  if (late) await late.leave(); if (observer) await observer.leave(); if (browser) await browser.close();
});
