# 演示检查记录

- `click-move-report.json`：当前版本。两个 Chrome 窗口验证点地走路、手机尺寸下的轻点与拖动、取消前往、原地敬香、定点仪式、鲜花和果盘、占用不同蒲团和起身。
- `server-report.json`：服务端 SDK 联机集成记录。
- `browser-report.json`、`ritual-report.json` 和同名脚本为旧操控版本的历史记录。

复查当前版本：启动演示服务，在 `client-tools/` 安装依赖后运行 `npm run check:demo`。默认使用 Windows 标准位置的 Chrome 和 `http://localhost:2567`，可通过 `DEMO_CHROME` 和 `DEMO_URL` 指定。

检查使用无界面 Chrome 与软件 WebGL，未进行真实手机、现场网络或人数压力测试。
