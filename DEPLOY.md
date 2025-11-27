# WebSync 部署指南

本文档详细说明了 WebSync 项目的部署流程，特别是针对 Windows 环境的优化。

## 环境要求

- **Node.js**: v14+ (推荐 v16 或 v18)
- **Python**: 3.8+ (推荐 3.11)
- **Git**: 用于拉取代码

## Windows 环境部署

我们提供了自动化脚本来简化 Windows 环境下的部署。

### 1. 首次部署或更新

双击运行根目录下的 `start_service.bat`。该脚本会自动执行以下操作：

1.  **检查并创建 Python 虚拟环境**：如果 `backend\venv` 不存在，会自动创建并安装依赖。
2.  **检查前端依赖**：如果 `frontend\node_modules` 不存在，会自动运行 `npm install`。
3.  **构建前端项目**：如果 `frontend\build` 不存在，会自动运行 `npm run build` 生成生产环境代码。
    > **注意**：如果您更新了代码，请手动删除 `frontend\build` 目录，以便脚本重新构建。或者在 `frontend` 目录下手动运行 `npm run build`。
4.  **启动服务**：
    - 后端服务运行在 `http://localhost:5002`
    - 前端服务运行在 `http://localhost:3000`
5.  **自动打开浏览器**：脚本启动完成后会自动打开默认浏览器访问前端页面。

### 2. 停止服务

双击运行根目录下的 `stop_service.bat`。该脚本会：

1.  停止所有 WebSync 相关的 Python 和 Node.js 进程。
2.  强制释放端口 5002 和 3000，防止端口占用问题。

## Linux / Mac 环境部署

在终端中执行以下命令：

### 1. 后端部署

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### 2. 前端部署

```bash
cd frontend
npm install
npm run build
npm run serve  # 或使用 pm2 等进程管理工具
```

## 常见问题

### Q: 启动脚本闪退怎么办？
A: 右键点击 `start_service.bat`，选择"编辑"，在最后一行添加 `pause`，保存后再次运行，查看具体的错误信息。

### Q: 页面显示旧版本？
A: 请删除 `frontend\build` 目录，然后重新运行 `start_service.bat`，或者在 `frontend` 目录下手动执行 `npm run build`。

### Q: 端口被占用？
A: 运行 `stop_service.bat` 清理残留进程。如果仍然占用，请手动检查占用端口 3000 或 5002 的程序。
