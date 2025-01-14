# WebSync - 网页文件同步工具

WebSync 是一个简单但功能强大的网页文件同步工具，用于在不同网络环境的计算机之间快速共享和同步文件。

## 功能特点

- 基于Web界面的文件上传和下载
- 实时文件同步
- 支持文件夹同步
- 简单易用的用户界面
- 支持断点续传
- 文件变更检测

## 技术栈

- 后端：Python Flask
- 前端：React
- 数据存储：SQLite

## 快速开始

### 后端设置

1. 进入后端目录：
```bash
cd backend
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 启动服务器：
```bash
python app.py
```

### 前端设置

1. 进入前端目录：
```bash
cd frontend
```

2. 安装依赖：
```bash
npm install
```

3. 启动开发服务器：
```bash
npm start
```

## 使用方法

1. 在浏览器中访问 http://localhost:3000
2. 选择要同步的文件夹
3. 设置同步目标
4. 开始同步

## 注意事项

- 确保两台计算机都能访问互联网
- 默认端口：前端 3000，后端 5000
- 首次使用需要设置同步目录

# WebSync 部署指南 (Windows)

## 环境要求
1. Python 3.8+ (https://www.python.org/downloads/)
2. Node.js 16+ (https://nodejs.org/)
3. Git (https://git-scm.com/download/win)

## 后端部署步骤
1. 进入后端目录：
```bash
cd backend
```

2. 创建并激活虚拟环境
```bash
python -m venv venv
.\venv\Scripts\activate
```

3. 安装依赖：
```bash
pip install -r requirements.txt
```

4. 启动服务器（会自动初始化数据库）：
```bash
python app.py
```
服务将在 http://localhost:5002 运行

初始管理员账号：
- 邮箱：admin@websync.com
- 密码：admin123

## 前端部署步骤
1. 进入前端目录
```bash
cd frontend
```

2. 安装依赖
```bash
npm install
```

3. 启动前端服务
```bash
npm start
```
服务将在 http://localhost:3000 运行

## 注意事项
1. 确保 Python 和 Node.js 已添加到系统环境变量
2. 如果遇到权限问题，请以管理员身份运行命令提示符
3. 确保 5002 和 3000 端口未被占用
4. 文件上传目录会自动创建在 backend/uploads 下

## 开机自启动设置
1. 创建批处理文件 `start_websync.bat`：
```batch
@echo off
cd /d %~dp0
start cmd /k "cd backend && .\venv\Scripts\activate && python app.py"
timeout /t 5
start cmd /k "cd frontend && npm start"
```

2. 创建快捷方式并放入启动文件夹：
- 按 Win+R，输入 `shell:startup`
- 将 `start_websync.bat` 的快捷方式复制到打开的文件夹中
