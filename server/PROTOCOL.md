# 多人协议 v3

Colyseus SDK：`@colyseus/sdk` 0.18.10。客户端进入：

```js
const client = new Colyseus.Client(serverUrl);
const room = await client.joinOrCreate('temple', { nickname: '访客' });
room.reconnection.enabled = false; // 本演示断线后由玩家点击重新进入
```

浏览器 UMD 文件位于完整安装开发依赖后的 `node_modules/@colyseus/sdk/dist/colyseus.js`，导出全局 `Colyseus`；交付网页已包含其副本 `web/lib/colyseus.js`。正常生产部署只执行 `npm ci --omit=dev` 与 `npm start`，无需重新复制 SDK。服务端使用 core 0.18.28、schema 5.0.48、ws-transport 0.18.5；运行需要 Node.js 22+。

## 状态

`room.state.serverTime` 是服务器毫秒时间。`players` 和 `offerings` 为 Schema Map，可用 `forEach` 遍历。未收到第一份状态之前需等待。

`players` 以 `sessionId` 为键：

```text
id, nickname
x, y, z, yaw, moving
action: idle | incense | bow | offering | sit
actionStartedAt, actionEndsAt
stationId（v3 起恒为空字符串，仅为兼容保留）
offeringType: '' | flower | fruit
```

坐标遵循相邻 `shared/scene.json`：Y 向上、北为 -Z，yaw=0 时面向 +Z。`y` 由服务器根据地面、平台及坡面计算。

公共物件：

```text
id（`${offeringType}-${序号}`，v3 起支持同类型多件并存）
kind: offering
offeringType: '' | flower | fruit
ownerId, x, y, z, yaw, createdAt, expiresAt
```

`offerings` 以物件 id 为键，位置为案面摆物锚点（`scene.json` 的 `zones[].placements`，花、果各 4 点，同类型 4 点全满时替换最旧一件）。客户端按 `expiresAt` 和 `serverTime` 播放与显示，晚加入者会收到完整当前状态。

## 客户端消息

| 类型 | 数据 | 说明 |
|---|---|---|
| `move` | `{x, y, z, yaw, moving}` | 建议每秒 10—20 次，服务器验证速度、范围、碰撞与高度变化；`y` 会重新计算 |
| `act` | `{kind, x?, z?, stationId?(旧), offeringType?}` | `incense` 原地开始且无需位置；`bow`、`offering`、`sit` 需到达 `(x, z)` 所指的区域位置。旧客户端仍可发 `stationId`（`offering`/`bow`/`sit`/`sit-2`/`sit-3`），服务器映射为区域内坐标；`offeringType` 为 `flower` 或 `fruit` |
| `cancel` | `{}` | 取消当前动作 |
| `stand` | `{}` | 起身 |

动作期间服务器保持角色在最后确认的位置并忽略移动消息；客户端要移动时先发送 `cancel` 或 `stand`。区域动作开始时调整朝向。敬香 4800ms、礼敬 3400ms、献供 3500ms；静坐持续到起身或离开。敬香在客户端显示手持香和烟效。供物在献供成功结束时生成，提前取消不会生成。

仪式位置由 `scene.json` 的 `zones` 提供（v3 起为区域制）：

- `offering` 献供：献殿供案前矩形，多人各站一格；
- `bow` 礼敬：正殿栏杆前矩形；
- `sit` 静坐：西侧空地矩形，随身蒲团随处可坐。

**冲突挪位**：`act` 的声称点被他人占用（0.6m 内有其他玩家）时不再返回 `occupied`，服务器直接把该玩家对齐到区域内最近的空位（更新 `x/y/z/yaw`，schema 广播后客户端自动对齐），动作照常开始。

出生点在 `scene.json` 的 `spawnArea`（门内南侧空地）内随机选取，保证与在场玩家间距 ≥ 1.0m。

## 服务端消息

- `actionRejected: {reason,text}`：`invalid`（仪式或位置无效）、`notArrived`（未走到区域内）、`busy`（已有动作进行中）等；v3 起不再有 `occupied`。
- `correction: {x,y,z,yaw}`：位置被拒绝，客户端应修正本地预测。
- `event`：`joined`、`actionStarted`、`actionCompleted`、`actionCancelled`，可用于提示；画面恢复以持续状态为准。

此版本断线后重新加入，获得新 sessionId；此前角色会被移除。角色名可以沿用，未实现长期账号身份或无缝重连。
