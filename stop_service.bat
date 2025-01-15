@echo off
chcp 65001
title WebSync 服务停止脚本

echo 正在停止 WebSync 服务...

:: 查找并停止 WebSync 相关的进程
for /f "tokens=2" %%a in ('tasklist /fi "WINDOWTITLE eq WebSync Backend" /fo list ^| find "PID:"') do (
    echo 正在停止后端服务 (PID: %%a)
    taskkill /pid %%a /f
)

for /f "tokens=2" %%a in ('tasklist /fi "WINDOWTITLE eq WebSync Frontend" /fo list ^| find "PID:"') do (
    echo 正在停止前端服务 (PID: %%a)
    taskkill /pid %%a /f
)

:: 检查端口占用情况并释放
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5002" ^| find "LISTENING"') do (
    echo 正在释放后端端口 5002 (PID: %%a)
    taskkill /pid %%a /f
)

for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo 正在释放前端端口 3000 (PID: %%a)
    taskkill /pid %%a /f
)

echo.
echo WebSync 服务已停止
pause 