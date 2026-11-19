import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { scene, groundHeight, canStand, clearMove, zoneOf, zoneSlots } from '../dist/scene.js';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
async function until(check, title, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(25);
  }
  throw new Error(`等待超时：${title}`);
}

function planPath(start, target) {
  // Small scene-grid route only for exercising real movement in this integration check.
  const step = 0.45;
  const encode = (x, z) => `${x},${z}`;
  const snap = p => [Math.round(p[0] / step), Math.round(p[1] / step)];
  let begin = snap(start);
  // 起点吸附格可能落在碰撞外扩区（如紧贴供案的槽位）：仿照客户端就近找可站起点。
  const standable = (cell) => canStand(cell[0] * step, cell[1] * step);
  if (!standable(begin) || !clearMove(start[0], start[1], begin[0] * step, begin[1] * step)) {
    let found = null;
    search: for (let r = 1; r <= 4; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const cell = [begin[0] + dx, begin[1] + dz];
        if (standable(cell) && clearMove(start[0], start[1], cell[0] * step, cell[1] * step)) { found = cell; break search; }
      }
    }
    assert.ok(found, '起点附近应存在可站立网格');
    begin = found;
  }
  const finish = snap(target);
  const key = encode(...begin);
  const queue = [{ p: begin, g: 0, f: 0 }];
  const costs = new Map([[key, 0]]), parent = new Map();
  let end;
  while (queue.length) {
    queue.sort((a, b) => a.f - b.f);
    const current = queue.shift();
    const [cx, cz] = current.p, wx = cx * step, wz = cz * step;
    if (Math.hypot(wx - target[0], wz - target[1]) < 0.7 && clearMove(wx, wz, ...target) && groundHeight(...target) - groundHeight(wx, wz) <= 0.28) { end = current.p; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = cx + dx, nz = cz + dz, x = nx * step, z = nz * step;
      const nextKey = encode(nx, nz);
      if (!canStand(x, z) || !clearMove(wx, wz, x, z) || groundHeight(x, z) - groundHeight(wx, wz) > 0.28) continue;
      const g = current.g + Math.hypot(dx, dz);
      if (g >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, g); parent.set(nextKey, current.p);
      queue.push({ p: [nx, nz], g, f: g + Math.hypot(nx - finish[0], nz - finish[1]) });
    }
  }
  assert.ok(end, '演示点之间必须存在可行走路线');
  const result = [target];
  for (let at = end; at; at = parent.get(encode(...at))) result.push([at[0] * step, at[1] * step]);
  return result.reverse();
}

async function walk(room, x, z) {
  let player = room.state.players.get(room.sessionId);
  const path = planPath([player.x, player.z], [x, z]);
  for (const goal of path) {
    player = room.state.players.get(room.sessionId);
    let dx = goal[0] - player.x, dz = goal[1] - player.z;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.38));
    const startX = player.x, startZ = player.z;
    for (let i = 1; i <= n; i++) {
      const px = startX + dx * i / n, pz = startZ + dz * i / n;
      room.send('move', { x: px, y: groundHeight(px, pz), z: pz, yaw: Math.atan2(dx, dz), moving: true });
      await delay(85);
    }
    await until(() => Math.hypot(room.state.players.get(room.sessionId).x - goal[0], room.state.players.get(room.sessionId).z - goal[1]) < 0.04, '位置同步', 1500);
  }
  room.send('move', { x, y: groundHeight(x, z), z, yaw: Math.PI, moving: false });
  await delay(100);
}

const inSpawnArea = (x, z) => {
  const a = scene.spawnArea;
  assert.ok(a, 'scene.json 应含 spawnArea');
  assert.ok(x >= a.xMin && x <= a.xMax && z >= a.zMin && z <= a.zMax, `出生点 (${x.toFixed(2)}, ${z.toFixed(2)}) 应在入口区域内`);
};
const countOfferings = (state, type) => [...state.offerings.values()].filter(o => o.offeringType === type).length;

test('真实 SDK：随机出生、区域制多人仪式、冲突挪位、旧协议兼容', { timeout: 240_000 }, async t => {
  const port = 27863;
  const processHandle = spawn(process.execPath, ['dist/index.js'], {
    cwd: serverRoot, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  processHandle.stdout.on('data', b => { logs += b.toString(); });
  processHandle.stderr.on('data', b => { logs += b.toString(); });
  const rooms = [];
  t.after(async () => {
    for (const room of rooms) { try { await room.leave(); } catch {} }
    processHandle.kill();
  });
  await until(() => logs.includes('TEMPLE_DEMO_READY'), '测试服务启动');
  const endpoint = `http://127.0.0.1:${port}`;
  const health = await fetch(`${endpoint}/health`).then(r => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.protocolVersion, 3, '协议版本应为 3');
  const config = await fetch(`${endpoint}/runtime-config.json`).then(r => r.json());
  assert.equal(config.serverUrl, 'auto');
  const offerings = zoneOf('offering'), bow = zoneOf('bow'), sit = zoneOf('sit');
  assert.ok(offerings && bow && sit, 'scene.json 应提供三类仪式区域');
  const offeringSlots = zoneSlots(offerings), bowSlots = zoneSlots(bow), sitSlots = zoneSlots(sit);
  assert.ok(offeringSlots.length >= 8 && bowSlots.length >= 4 && sitSlots.length >= 8, '各区域应生成足量站位');
  async function join(nickname) {
    const room = await new Client(endpoint).joinOrCreate('temple', { nickname });
    for (const type of ['event', 'actionRejected', 'correction']) room.onMessage(type, () => {});
    rooms.push(room);
    await until(() => room.state?.players?.has(room.sessionId), '首次完整状态');
    return room;
  }
  const a = await join('演示甲'), b = await join('演示乙');
  assert.equal(a.roomId, b.roomId);
  await until(() => a.state.players.size === 2 && b.state.players.size === 2, '两人互见');
  assert.equal(a.state.players.get(b.sessionId).nickname, '演示乙');

  // 随机出生：都在入口区域内且互不重叠。
  const spawnA = a.state.players.get(a.sessionId), spawnB = b.state.players.get(b.sessionId);
  inSpawnArea(spawnA.x, spawnA.z);
  inSpawnArea(spawnB.x, spawnB.z);
  assert.ok(Math.hypot(spawnA.x - spawnB.x, spawnA.z - spawnB.z) >= 0.9, '两人出生点应保持间距');

  // 越界瞬移仍被拒绝。
  const origin = a.state.players.get(a.sessionId);
  const initialX = origin.x;
  a.send('move', { x: 9000, z: 9000, yaw: 0, moving: true });
  await delay(150);
  assert.equal(a.state.players.get(a.sessionId).x, initialX, '拒绝越界瞬移');

  // 未到达：旧格式（stationId）与新格式（x/z）都应被 notArrived 拦下。
  a.send('act', { kind: 'bow', stationId: 'bow' });
  await delay(150);
  assert.equal(a.state.players.get(a.sessionId).action, 'idle', '远离区域时不能行礼（旧格式）');
  a.send('act', { kind: 'bow', x: bowSlots[0][0], z: bowSlots[0][2] });
  await delay(150);
  assert.equal(a.state.players.get(a.sessionId).action, 'idle', '远离区域时不能行礼（新格式）');
  a.send('act', { kind: 'sit', x: 999, z: 999 });
  await delay(150);
  assert.equal(a.state.players.get(a.sessionId).action, 'idle', '区域外的坐标应被拒绝');

  // 原地敬香保持不变。
  const stand = { x: origin.x, z: origin.z, yaw: origin.yaw };
  a.send('act', { kind: 'incense' });
  await until(() => b.state.players.get(a.sessionId).action === 'incense', '旁人看到原地敬香');
  const incenseActor = b.state.players.get(a.sessionId);
  assert.deepEqual({ x: incenseActor.x, z: incenseActor.z, yaw: incenseActor.yaw }, stand);
  assert.equal(incenseActor.stationId, '');
  await until(() => b.state.players.get(a.sessionId).action === 'idle', '原地敬香结束', 7000);
  assert.equal(b.state.offerings.size, 0);

  // 两人各走一个供案空位，同时献花：并发进行、案上出现两件花。
  const slotA = offeringSlots[0], slotB = offeringSlots[1];
  await walk(a, slotA[0], slotA[2]);
  await walk(b, slotB[0], slotB[2]);
  a.send('act', { kind: 'offering', x: slotA[0], z: slotA[2], offeringType: 'flower' });
  b.send('act', { kind: 'offering', x: slotB[0], z: slotB[2], offeringType: 'flower' });
  await until(() => a.state.players.get(a.sessionId).action === 'offering' && b.state.players.get(b.sessionId).action === 'offering', '两人同时献供', 2000);
  await until(() => countOfferings(b.state, 'flower') === 2, '案上出现两件鲜花', 8000);
  assert.equal(a.state.players.get(a.sessionId).action, 'idle', '献供结束后回到空闲');

  // 同一人紧接着献果：多件并存（2 花 + 1 果）。
  a.send('act', { kind: 'offering', x: slotA[0], z: slotA[2], offeringType: 'fruit' });
  await until(() => countOfferings(a.state, 'fruit') === 1, '果盘放置完成', 8000);
  assert.equal(a.state.offerings.size, 3, '供物多件并存');

  // 晚加入者：出生在入口区域，能看到全部供物。
  const c = await join('晚到访客');
  await until(() => c.state.players.size === 3, '后来加入完整状态');
  inSpawnArea(c.state.players.get(c.sessionId).x, c.state.players.get(c.sessionId).z);
  assert.equal(c.state.offerings.size, 3);

  // 礼敬区域照常。
  const bowSlot = bowSlots[0];
  await walk(a, bowSlot[0], bowSlot[2]);
  a.send('act', { kind: 'bow', x: bowSlot[0], z: bowSlot[2] });
  await until(() => b.state.players.get(a.sessionId).action === 'bow', '旁人看到礼敬');
  await until(() => a.state.players.get(a.sessionId).action === 'idle', '礼敬完成', 6000);

  // 静坐冲突挪位：两人争同一点，后到者被挪到空位，不再被拒。
  const sitSpot = sitSlots[0];
  await walk(a, sitSpot[0], sitSpot[2]);
  a.send('act', { kind: 'sit', x: sitSpot[0], z: sitSpot[2] });
  await until(() => b.state.players.get(a.sessionId).action === 'sit', '甲先坐下');
  await walk(b, sitSpot[0], sitSpot[2]);
  b.send('act', { kind: 'sit', x: sitSpot[0], z: sitSpot[2] });
  await until(() => b.state.players.get(b.sessionId).action === 'sit', '乙同点静坐被挪位后照常开始', 2000);
  const seatedA = c.state.players.get(a.sessionId), seatedB = c.state.players.get(b.sessionId);
  assert.ok(Math.hypot(seatedA.x - seatedB.x, seatedA.z - seatedB.z) >= 0.6, '挪位后两人间距应 ≥ 0.6');
  assert.ok(Math.hypot(seatedB.x - sitSpot[0], seatedB.z - sitSpot[2]) > 0.1, '后到者不应停留在原声称点');
  assert.equal(seatedB.stationId, '', '区域制下 stationId 恒为空');
  b.send('stand', {});
  await until(() => a.state.players.get(b.sessionId).action === 'idle', '乙起身');
  a.send('stand', {});
  await until(() => a.state.players.get(a.sessionId).action === 'idle', '甲起身');

  // 旧协议兼容：stationId 仍可静坐。
  const legacySit = { x: -11, z: -5 };
  await walk(a, legacySit.x, legacySit.z);
  a.send('act', { kind: 'sit', stationId: 'sit' });
  await until(() => b.state.players.get(a.sessionId).action === 'sit', '旧格式 stationId 静坐成功');
  a.send('stand', {});
  await until(() => a.state.players.get(a.sessionId).action === 'idle', '旧格式起身心');

  // 退出清理与重新进入。
  await a.leave();
  await until(() => !b.state.players.has(a.sessionId) && !c.state.players.has(a.sessionId), '退出清理角色');
  const d = await join('重新进入');
  await until(() => b.state.players.size === 3, '新身份重新进入');
  assert.notEqual(d.sessionId, a.sessionId);
  inSpawnArea(d.state.players.get(d.sessionId).x, d.state.players.get(d.sessionId).z);
  assert.ok(Math.hypot(d.state.players.get(d.sessionId).x - c.state.players.get(c.sessionId).x,
    d.state.players.get(d.sessionId).z - c.state.players.get(c.sessionId).z) >= 0.9, '重进出生点与在院者错开');
  assert.equal(b.state.offerings.size, 3, '已放置供物在原玩家退出后仍留到有效期');
  console.log('已验证：随机出生、区域制并发献供、冲突挪位、旧协议兼容、晚加入、起身与退出清理。');
});
