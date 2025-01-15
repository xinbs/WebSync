# WebSync

WebSync 是一个基于 Flask 和 React 的文件同步和共享系统。

## 功能特性

- 文件上传、下载和管理
- 文件实时同步和更新
- 用户权限管理
- 文件共享功能
- 剪贴板同步
- WebSocket 实时通知

## 系统要求

- Python 3.8+
- Node.js 14+
- SQLite3

## 安装部署

### 后端部署

1. 安装依赖：
```bash
cd backend
pip install -r requirements.txt
```

2. 配置环境变量（可选）：
创建 `.env` 文件并设置以下配置：
```plaintext
UPLOAD_FOLDER=uploads
SYNC_FOLDER=sync
SQLALCHEMY_DATABASE_URI=sqlite:///websync.db
JWT_SECRET_KEY=your-secret-key
JWT_ACCESS_TOKEN_EXPIRES=86400
```

3. 启动后端服务：
```bash
python app.py
```
后端服务将在 http://127.0.0.1:5002 上运行

### 前端部署

1. 安装依赖：
```bash
cd frontend
npm install
```

2. 启动开发服务器：
```bash
npm start
```
或者构建并启动生产服务器：
```bash
npm run build
npm run serve
```

前端服务将在 http://localhost:3000 上运行

## Windows 快速启动

为了方便 Windows 用户使用，我们提供了一键启动和停止服务的脚本：

1. 启动服务：
   - 双击运行 `start_service.bat`
   - 脚本会自动检查并安装必要的依赖
   - 服务将在后台运行，可以关闭命令行窗口
   - 浏览器会自动打开应用页面

2. 停止服务：
   - 双击运行 `stop_service.bat`
   - 脚本会自动停止所有相关服务

注意事项：
- 首次运行时会自动安装依赖，可能需要较长时间
- 确保已安装 Python 3.8+ 和 Node.js 14+
- 如果遇到权限问题，请以管理员身份运行脚本

## 注意事项

1. WebSocket 配置：
   - 后端使用 Flask-SocketIO 提供 WebSocket 服务
   - 前端通过 socket.io-client 连接到 WebSocket 服务
   - 确保防火墙允许 WebSocket 连接（端口 5002）

2. 安全配置：
   - 生产环境中修改 JWT 密钥
   - 配置适当的 CORS 策略
   - 使用 HTTPS 进行安全通信

3. 文件存储：
   - 确保上传目录具有适当的写入权限
   - 定期备份数据库和上传的文件

## 默认账户

- 管理员账户：
  - 邮箱：admin@websync.com
  - 密码：admin123

## 更新日志

### v1.1.0
- 添加 WebSocket 支持，实现文件列表实时更新
- 优化文件上传和删除的通知机制
- 改进错误处理和日志记录

### v1.0.0
- 初始版本发布
- 基本的文件同步和共享功能
- 用户管理系统
