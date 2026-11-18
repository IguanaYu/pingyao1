# 演示游戏服务

此服务负责多人同场、角色状态与四项仪式，同时可托管相邻 `web/` 目录。网页与服务器可以部署在同一台机器，也可以分别部署。

## 环境与启动

需要 Node.js 22 或更新版本。源码使用 TypeScript，已编译文件在 `dist/`。

在本目录执行：

```powershell
npm.cmd ci --omit=dev
npm.cmd start
```

交付包已包含 `dist/` 和网页内的 `web/lib/colyseus.js`。正常部署不运行 TypeScript 编译或 `prepare-web.cjs`，也不需要安装客户端 SDK 的开发依赖。

默认监听 `0.0.0.0:2567`，本机打开 `http://localhost:2567/`。同一 Wi-Fi 的手机使用电脑的局域网地址，例如 `http://192.168.1.20:2567/`；实际地址以电脑网络配置为准。

从源码重新编译或运行基础检查：

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd test
```

`npm test` 是少量真实 SDK 连接的集成流程，覆盖同场移动、四项仪式、晚加入、起身、退出及重新进入，不是人数压测，也不能替代真实手机检查。

重新构建网页时，先在本 server 目录执行完整的 `npm ci`；客户端 SDK 为开发依赖，`npm ci --omit=dev` 不会安装它。构建 Cocos 网页后，从本目录执行 `node ../scripts/prepare-web.cjs`，或回到交付根目录执行 `node scripts/prepare-web.cjs`，将 SDK 复制进网页。网页部署完成后，无需在客户主机重复此步骤。

## 配置

| 环境变量 | 默认值 | 用途 |
|---|---|---|
| `PORT` | `2567` | HTTP 与 WebSocket 共用的服务端口 |
| `STATIC_DIR` | `../web` | 网页文件夹，相对本 server 目录解析，也支持绝对路径 |
| `NETWORK_URL` | `auto` | `/runtime-config.json` 返回的游戏服务地址；`auto` 表示客户端使用网页同源地址 |

由本服务托管网页时，可用 `NETWORK_URL=https://game.example.com` 设置公开连接地址。网页放在其他静态网站时，应修改那份网页目录里的 `runtime-config.json`，指定 `serverUrl`；仅修改服务环境变量不会更新其他网站上的静态文件。客户端也支持网页 `?server=` 参数临时指定服务。

公网建议将整个服务反向代理到 HTTPS 域名，包含 HTTP 匹配请求与 WebSocket 升级请求。不能只转发 WebSocket 而遗漏 `/matchmake/` 路径。Caddy 配置示例：

```caddyfile
game.example.com {
    reverse_proxy 127.0.0.1:2567
}
```

如果使用 Nginx，需传递 `Upgrade` 和 `Connection` 请求头。网站使用 HTTPS 时，游戏连接也使用 HTTPS/WSS。

## 目录依赖与接口

- `../shared/scene.json` 必须随服务交付，包含可走区域、坡面、碰撞、出生点及仪式位置。
- `GET /health`：服务就绪检查。
- `GET /runtime-config.json`：返回 `{serverUrl, roomName, protocolVersion}`，禁用缓存。
- `GET /scene.json`、`GET /api/scene`：演示场景交互配置。
- 其余路径由 `STATIC_DIR` 中的静态文件提供，Colyseus 匹配与 WebSocket 路径交给框架。

一个进程保留一个 `temple` 演示房间。普通玩家退出后移除角色和占位，已放置的香、供物在到期前保留。香最多保留 12 份、约 3 分钟；鲜花和果盘各有一个展示位置、约 10 分钟。同类型献供更新原位置。

演示清场：停止游戏服务后重新启动，再让各网页点击重新进入。房间状态仅存在内存中，重启即恢复空场。该版本没有数据库、正式账号或聊天服务。

客户端与服务器依赖版本已在 `package-lock.json` 锁定。部署 Linux 服务器时在目标机器运行 `npm ci` 安装相应依赖，不直接复用 Windows 的 `node_modules`。
