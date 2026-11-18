const { chromium } = require('../client-tools/node_modules/playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const endpoint = process.env.DEMO_URL || 'http://localhost:2567';
const snap = (page, name) => page.screenshot({ path: path.join(__dirname, name) });
const own = page => page.evaluate(() => {
  const d = window.templeDemo, p = d.localPosition;
  return { x: p.x, z: p.z, yaw: d.cameraYaw, id: d.room.sessionId };
});
const check = (page, fn, arg, timeout = 55000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const waitNear = (page, target) => check(page, ({x,z}) => {
  const d = window.templeDemo, p = d.localPosition;
  return !d.moving && Math.hypot(p.x-x,p.z-z)<.3;
}, target);
async function screenGround(page, target) {
  const point = await page.evaluate(({x,z}) => {
    const d = window.templeDemo, pos = d.localPosition.clone();
    pos.set(x,d.data.groundY,z);
    const point = d.world.project(d.camera,pos);
    return { ...point, canvas: document.elementFromPoint(point.x,point.y)?.tagName === 'CANVAS' };
  }, target);
  assert.ok(point.visible && point.canvas, `测试目标应落在画布可点击处：${JSON.stringify(point)}`);
  return { x: point.x, y: point.y };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.DEMO_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'] });
  try {
    const errors = [];
    async function join(options, name) {
      const page = await (await browser.newContext(options)).newPage();
      page.on('pageerror', e => errors.push(String(e)));
      page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
      await page.goto(endpoint, { waitUntil: 'domcontentloaded' });
      await check(page, () => !!window.templeDemo?.world, null, 90000);
      await page.locator('#nickname').fill(name);
      await page.locator('#enter').click();
      await check(page, () => window.templeDemo?.initialized);
      await page.evaluate(() => {
        const ui=window.templeDemo.ui, show=ui.toast.bind(ui);
        window.demoNotices=[];
        ui.toast=text=>{window.demoNotices.push(text);show(text);};
      });
      return page;
    }
    const a = await join({ viewport: { width: 1280, height: 800 } }, '点击演示');
    const b = await join({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }, '手机同游');
    await check(a, () => window.templeDemo.room.state.players.size >= 2);
    const origin = await own(a);
    await a.keyboard.down('KeyW'); await a.waitForTimeout(320); await a.keyboard.up('KeyW');
    assert.deepEqual(await own(a), origin, 'WASD 已移除');
    assert.equal(await a.locator('#joystick').count(), 0);
    const dest = { x: origin.x + 1.25, z: origin.z - 2.1 };
    const p = await screenGround(a, dest);
    await a.mouse.click(p.x,p.y);
    await waitNear(a,dest);
    await check(b, ({id,x,z}) => {
      const p=window.templeDemo.room.state.players.get(id);return p&&!p.moving&&Math.hypot(p.x-x,p.z-z)<.3;
    }, { id: origin.id, ...dest });
    console.log('桌面点地走路，另一窗口收到位置');

    const mob = await own(b), touchGoal={x:mob.x,z:mob.z-2};
    const tap=await screenGround(b,touchGoal);
    const cdp=await b.context().newCDPSession(b);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[tap]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tap.x-46,y:tap.y+12}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await check(b, yaw => Math.abs(window.templeDemo.cameraYaw-yaw)>.1, mob.yaw);
    const turned=await own(b);
    assert.equal(Math.hypot(turned.x-mob.x,turned.z-mob.z),0,'滑动没有触发行走');
    await b.waitForTimeout(500);
    const mobileTap=await screenGround(b,touchGoal);
    await b.touchscreen.tap(mobileTap.x,mobileTap.y);
    await waitNear(b,touchGoal);
    await snap(a,'02-多人庙院.png'); await snap(b,'03-手机同游.png');
    console.log('手机滑动转向、轻点行走');

    const actor = await own(a), id=actor.id;
    const remote = () => b.evaluate(id => {
      const s=window.templeDemo.room.state.players.get(id);
      return {x:s.x,y:s.y,z:s.z,yaw:s.yaw,action:s.action,stationId:s.stationId};
    },id);
    const action = async kind => {
      try {
        await check(b, ({id,kind}) => window.templeDemo.room.state.players.get(id)?.action === kind, {id,kind});
      } catch (error) {
        console.error('等待仪式失败：',kind,await remote(),await a.evaluate(() => {
          const d=window.templeDemo,p=d.localPosition;
          return {local:[p.x,p.y,p.z],path:d.path,ritual:d.ritual?.station?.id,notices:window.demoNotices};
        }));
        throw error;
      }
    };
    const button = kind => a.locator('#action-'+kind).click();
    const exactStation = async kind => {
      const pose=await remote();
      const point=await a.evaluate(id=>window.templeDemo.data.stations.find(s=>s.id===id)?.position, pose.stationId);
      assert.ok(point && Math.hypot(point[0]-pose.x,point[2]-pose.z)<.15 && Math.abs(point[1]-pose.y)<.12,`${kind} 到位才开始`);
    };
    await button('bow');
    await check(a, () => window.templeDemo.moving && window.templeDemo.ritual?.kind==='bow');
    await a.locator('#cancel').click();
    await check(a, () => !window.templeDemo.ritual && !window.templeDemo.moving);
    await button('bow');
    await check(a, () => window.templeDemo.moving);
    await a.evaluate(() => document.getElementById('action-incense').addEventListener('click', () => {
      const {x,z}=window.templeDemo.localPosition;
      window.incenseClickPosition={x,z};
    }, { once:true,capture:true }));
    await button('incense'); await action('incense');
    const pause=await a.evaluate(() => window.incenseClickPosition);
    const pose=await remote();
    assert.equal(pose.stationId,'');
    assert.ok(Math.hypot(pose.x-pause.x,pose.z-pause.z)<.1,'行走中点敬香，原地停下动作');
    await check(b, id => window.templeDemo.visitors.get(id)?.heldType==='incense',id);
    await a.waitForTimeout(1300); await snap(a,'05-敬香.png'); await action('idle');
    console.log('取消自动前往；原地敬香动作和手持香同步');

    await button('offering'); await a.locator('#flower').click();
    await check(a, () => window.templeDemo.moving && window.templeDemo.ritual?.kind==='offering');
    assert.equal((await remote()).action,'idle');
    await action('offering'); await exactStation('献供');
    await a.waitForTimeout(850); await snap(a,'06-献花.png'); await action('idle');
    await check(b, () => window.templeDemo.room.state.offerings.has('flower'));
    await button('offering'); await a.locator('#fruit').click(); await action('offering');
    await a.waitForTimeout(850); await snap(a,'07-献果.png'); await action('idle');
    await check(b, () => window.templeDemo.room.state.offerings.size===2);
    await snap(a,'08-供案结果.png');
    await button('bow'); await action('bow'); await exactStation('礼敬');
    await a.waitForTimeout(1000); await snap(a,'09-礼敬.png'); await action('idle');
    await button('sit'); await action('sit'); await exactStation('静坐');
    await a.waitForTimeout(700); await snap(a,'10-静坐.png');
    const firstCushion=(await remote()).stationId;
    await b.locator('#action-sit').tap();
    await check(b, id => {
      const d=window.templeDemo,p=d.room.state.players.get(d.room.sessionId);
      return p.action==='sit'&&p.stationId!==id;
    }, firstCushion);
    await a.locator('#cancel').click(); await action('idle');
    await button('sit'); await action('sit'); await snap(a,'11-再次静坐.png');
    console.log('献花、果盘、礼敬、静坐到位同步；两人各坐一个蒲团');
    await a.locator('#overview').click(); await a.waitForTimeout(750); await snap(a,'04-院落全景.png');
    assert.deepEqual(errors,[]);
    const report={ testedAt:new Date().toISOString(), browser:'Chrome headless / software WebGL', clients:2,
      desktopClick:true,mobileTap:true,mobileDragTurnsOnly:true,keyboardRemoved:true,remoteMovement:true,
      cancelApproach:true,incenseInPlace:true,heldIncenseRemote:true,offeringAndBowOnArrival:true,
      flowersAndFruit:true,separateCushions:true,standingUp:true,actualPhones:false,errors };
    fs.writeFileSync(path.join(__dirname,'click-move-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
