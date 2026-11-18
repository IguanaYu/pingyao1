# 多人协议 v2

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
stationId, offeringType: '' | flower | fruit
```

坐标遵循相邻 `shared/scene.json`：Y 向上、北为 -Z，yaw=0 时面向 +Z。`y` 由服务器根据地面、平台及坡面计算。

公共物件：

```text
id, kind: offering
offeringType: '' | flower | fruit
ownerId, x, y, z, yaw, createdAt, expiresAt
```

`offerings` 以 `flower`、`fruit` 为键。位置为模型摆放锚点。客户端按 `expiresAt` 和 `serverTime` 播放与显示，晚加入者会收到完整当前状态。

## 客户端消息

| 类型 | 数据 | 说明 |
|---|---|---|
| `move` | `{x, y, z, yaw, moving}` | 建议每秒 10—20 次，服务器验证速度、范围、碰撞与高度变化；`y` 会重新计算 |
| `act` | `{kind, stationId?, offeringType?}` | `incense` 原地开始且无需站位；`bow`、`offering`、`sit` 需到达所填站位；`offeringType` 为 `flower` 或 `fruit` |
| `cancel` | `{}` | 取消当前动作并释放站位 |
| `stand` | `{}` | 起身并释放坐位 |

动作期间服务器保持角色在最后确认的位置并忽略移动消息；客户端要移动时先发送 `cancel` 或 `stand`。定点动作开始时调整朝向，不会传送角色。敬香 4800ms、礼敬 3400ms、献供 3500ms；静坐持续到起身或离开。敬香在客户端显示手持香和烟效。供物在献供成功结束时生成，提前取消不会生成。

站位由 `scene.json` 提供：`offering`、`bow`、`sit`、`sit-2`、`sit-3`。

## 服务端消息

- `actionRejected: {reason,text}`：未到位、占用或操作不符等提示；`occupied` 表示站位已被占用。
- `correction: {x,y,z,yaw}`：位置被拒绝，客户端应修正本地预测。
- `event`：`joined`、`actionStarted`、`actionCompleted`、`actionCancelled`，可用于提示；画面恢复以持续状态为准。

此版本断线后重新加入，获得新 sessionId；此前角色会被移除。角色名可以沿用，未实现长期账号身份或无缝重连。
