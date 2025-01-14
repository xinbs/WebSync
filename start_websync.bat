@echo off
echo 正在启动 WebSync 服务...

:: 设置工作目录为批处理文件所在目录
cd /d %~dp0

:: 启动后端服务
echo 正在启动后端服务...
start cmd /k "cd backend && python -m venv venv && .\venv\Scripts\activate && pip install -r requirements.txt && python init_db.py && python app.py"

:: 等待后端服务启动
timeout /t 10

:: 启动前端服务
echo 正在启动前端服务...
start cmd /k "cd frontend && npm install && npm start"

echo WebSync 服务已启动！
echo 后端服务运行在 http://localhost:5002
echo 前端服务运行在 http://localhost:3000
echo.
echo 请在浏览器中访问 http://localhost:3000 使用 WebSync
pause 