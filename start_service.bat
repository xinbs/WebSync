@echo off
chcp 65001
title WebSync 服务启动脚本

:: 设置工作目录
set BASE_DIR=%~dp0

:: 检查 Python 虚拟环境
if not exist "%BASE_DIR%backend\venv" (
    echo 正在创建 Python 虚拟环境...
    cd /d "%BASE_DIR%backend"
    python -m venv venv
    call venv\Scripts\activate
    pip install -r requirements.txt
) else (
    echo Python 虚拟环境已存在
)

:: 检查前端依赖
if not exist "%BASE_DIR%frontend\node_modules" (
    echo 正在安装前端依赖...
    cd /d "%BASE_DIR%frontend"
    npm install
) else (
    echo 前端依赖已存在
)

:: 构建前端项目
if not exist "%BASE_DIR%frontend\build" (
    echo 正在构建前端项目...
    cd /d "%BASE_DIR%frontend"
    call npm run build
) else (
    echo 前端构建产物已存在，跳过构建
    echo 如果需要更新前端，请删除 frontend\build 目录后重试
)

:: 启动后端服务
echo 正在启动后端服务...
cd /d "%BASE_DIR%backend"
start /min cmd /c "title WebSync Backend && call venv\Scripts\activate && python app.py"

:: 等待后端服务启动
timeout /t 5

:: 启动前端服务
echo 正在启动前端服务...
cd /d "%BASE_DIR%frontend"
start /min cmd /c "title WebSync Frontend && npm run serve"

:: 打开浏览器
timeout /t 3
start http://localhost:3000

echo WebSync 服务已启动：
echo 前端地址：http://localhost:3000
echo 后端地址：http://localhost:5002
echo.
echo 提示：服务正在后台运行，可以关闭此窗口
pause 