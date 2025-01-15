const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 从环境变量获取后端地址，默认使用本地地址
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:5002';

// 输出环境变量加载信息
console.log('环境变量配置:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: PORT,
  BACKEND_URL: BACKEND_URL
});

// 启用 CORS
app.use(cors({
  origin: true,
  credentials: true
}));

// 添加基本的请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// API 请求代理
const apiProxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  secure: false,
  ws: true,
  xfwd: true,
  pathRewrite: {
    '^/api': '/api'  // 保持 /api 前缀
  },
  onProxyReq: (proxyReq, req, res) => {
    // 添加必要的请求头
    proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
    proxyReq.setHeader('X-Forwarded-Proto', req.protocol);
    console.log('代理请求:', req.method, req.path, '->', proxyReq.path);
    console.log('目标服务器:', BACKEND_URL);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('代理响应:', req.method, req.path, '->', proxyRes.statusCode);
    if (proxyRes.statusCode === 404) {
      console.log('404错误 - 原始URL:', req.url, '代理URL:', proxyRes.req.path);
    }
  },
  onError: (err, req, res) => {
    console.error('代理错误:', err);
    res.status(500).json({ error: '代理服务器错误' });
  }
});

// 先处理 API 代理
app.use('/api', apiProxy);

// 然后处理静态文件
app.use(express.static(path.join(__dirname, 'build'), {
  maxAge: '1h',
  etag: true,
  lastModified: true
}));

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

// 最后处理所有其他请求
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// 启动服务器
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器启动于: http://localhost:${PORT}`);
  console.log(`后端服务器地址: ${BACKEND_URL}`);
  console.log(`当前时间: ${new Date().toISOString()}`);
  console.log(`Node.js 版本: ${process.version}`);
  console.log(`工作目录: ${process.cwd()}`);
});

// 处理服务器错误
server.on('error', (err) => {
  console.error('服务器错误:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用`);
  }
}); 