# 平遥城隍庙 · 多人同游演示

这是平遥城隍庙的 Cocos 网页演示。玩家进入同一座院子后，可以点击地面行走，原地敬香，或自动走到对应站位礼敬、献供和静坐。Windows 和手机浏览器都可通过同一个服务地址加入。

## 本地运行

安装 Node.js 22 或更新的稳定版本。Windows 可双击 `启动演示.cmd`，也可在仓库根目录执行：

```sh
npm --prefix server ci --omit=dev
npm --prefix server start
```

打开 [本机演示](http://localhost:2567/)。本仓库已包含网页和服务端的构建产物，试用时无需安装 Cocos Creator。打开第二个窗口并用另一个昵称入院，即可体验同步。

## 目录

| 目录 | 内容 |
|---|---|
| `client/` | Cocos Creator 3.8.8 客户端源工程与运行时模型 |
| `server/` | Node.js / Colyseus 多人服务源码、构建产物与集成检查 |
| `shared/` | 院落通行与仪式站位数据 |
| `web/` | 已构建、可托管的游戏网页 |
| `asset-work/` | Blender 可编辑模型、导出脚本与预览 |
| `deploy/` | Nginx 与 systemd 配置示例 |

部署和重新构建见 [部署说明](部署说明.md)，展示流程见 [交付说明](交付说明.md)。若网页另行托管，仍需运行多人服务。第三方许可见 [third-party](third-party/README.md)。
