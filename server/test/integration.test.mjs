import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { scene, groundHeight, canStand, clearMove } from '../dist/scene.js';

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
  const begin = snap(start), finish = snap(target);
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

test('真实 SDK：同院移动、四项仪式、晚加入及离开清理', { timeout: 100_000 }, async t => {
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
  const config = await fetch(`${endpoint}/runtime-config.json`).then(r => r.json());
  assert.equal(config.serverUrl, 'auto');
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
  const origin = a.state.players.get(a.sessionId);
  const initialX = origin.x;
  a.send('move', { x: 9000, z: 9000, yaw: 0, moving: true });
  await delay(150);
  assert.equal(a.state.players.get(a.sessionId).x, initialX, '拒绝越界瞬移');
  a.send('act', { kind: 'bow', stationId: 'bow' });
  await delay(150);
  assert.equal(a.state.players.get(a.sessionId).action, 'idle', '远离互动点不能行礼');
  const stand = { x: origin.x, z: origin.z, yaw: origin.yaw };
  a.send('act', { kind: 'incense' });
  await until(() => b.state.players.get(a.sessionId).action === 'incense', '旁人看到原地敬香');
  const incenseActor = b.state.players.get(a.sessionId);
  assert.deepEqual({ x: incenseActor.x, z: incenseActor.z, yaw: incenseActor.yaw }, stand);
  assert.equal(incenseActor.stationId, '');
  await until(() => b.state.players.get(a.sessionId).action === 'idle', '原地敬香结束', 7000);
  assert.equal(b.state.offerings.size, 0);
  const offering = scene.stations.find(s => s.id === 'offering');
  await walk(a, offering.position[0], offering.position[2]);
  await until(() => Math.hypot(b.state.players.get(a.sessionId).x-offering.position[0], b.state.players.get(a.sessionId).z-offering.position[2]) < .04, '另一客户端看到自动前往路线的终点');
  a.send('act', { kind: 'offering', stationId: 'offering', offeringType: 'flower' });
  await until(() => b.state.offerings.has('flower'), '鲜花放置完成', 6000);
  a.send('act', { kind: 'offering', stationId: 'offering', offeringType: 'fruit' });
  await until(() => b.state.offerings.has('fruit'), '果盘放置完成', 6000);
  const bow = scene.stations.find(s => s.id === 'bow');
  await walk(a, bow.position[0], bow.position[2]);
  a.send('act', { kind: 'bow', stationId: 'bow' });
  await until(() => b.state.players.get(a.sessionId).action === 'bow', '旁人看到礼敬');
  await until(() => a.state.players.get(a.sessionId).action === 'idle', '礼敬完成', 6000);
  const sit = scene.stations.find(s => s.id === 'sit');
  await walk(a, sit.position[0], sit.position[2]);
  a.send('act', { kind: 'sit', stationId: 'sit' });
  await until(() => b.state.players.get(a.sessionId).action === 'sit', '旁人看到静坐');
  const c = await join('晚到访客');
  await until(() => c.state.players.size === 3, '后来加入完整状态');
  assert.equal(c.state.players.get(a.sessionId).action, 'sit');

  assert.equal(c.state.offerings.size, 2);
  assert.equal(c.state.offerings.get('flower').kind, 'offering');
  a.send('stand', {});
  await until(() => b.state.players.get(a.sessionId).action === 'idle', '起身同步');
  a.send('act', { kind: 'sit', stationId: 'sit' });
  await until(() => b.state.players.get(a.sessionId).action === 'sit', '再次静坐');
  await a.leave();
  await until(() => !b.state.players.has(a.sessionId) && !c.state.players.has(a.sessionId), '退出清理角色及坐位');
  const d = await join('重新进入');
  await until(() => b.state.players.size === 3, '新身份重新进入');
  assert.notEqual(d.sessionId, a.sessionId);
  assert.equal(b.state.offerings.size, 2, '已放置供物在原玩家退出后仍留到有效期');
  console.log('已验证：两设备等价SDK互见移动、四仪式、鲜花果盘、晚加入、起身、退出与重新进入。');
});
