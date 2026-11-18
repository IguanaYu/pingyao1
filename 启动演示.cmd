@echo off
chcp 65001 >nul
setlocal
title 平遥城隍庙 · 多人演示服务
cd /d "%~dp0server"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更新的稳定版本，然后重新打开本文件。
  echo https://nodejs.org/
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo 当前 Node.js 版本太旧，请安装 Node.js 22 或更新的稳定版本。
  pause
  exit /b 1
)
node -e "Promise.all(['@colyseus/core','@colyseus/schema','@colyseus/ws-transport','express'].map(n=>import(n))).catch(()=>process.exit(1))" >nul 2>nul
if errorlevel 1 (
  echo 首次运行，正在安装多人服务依赖，请稍候……
  call npm.cmd ci --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo 依赖安装未完成，请检查网络后重试。
    pause
    exit /b 1
  )
)
echo.
echo 启动后请打开 http://localhost:2567
echo 同一 Wi-Fi 的手机可使用本电脑的局域网 IP 加 :2567 访问。
echo 演示期间保持此窗口运行；Ctrl+C 结束，重启服务可清场。
echo.
call npm.cmd start
pause
