const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

const app = express();
app.disable('x-powered-by'); // Disable X-Powered-By header globally

// Force remove X-Powered-By header using middleware
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  next();
});

const PORT = process.env.PORT || 3000;

// 从环境变量获取后端地址，默认使用本地地址
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:5002';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

// 输出环境变量加载信息
console.log('环境变量配置:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: PORT,
  BACKEND_URL: BACKEND_URL,
  ALLOWED_ORIGINS: ALLOWED_ORIGINS
});

// 启用 CORS
const corsOptions = {
  origin: (origin, callback) => {
    // 允许没有 origin 的请求（如移动应用或 curl 请求）
    if (!origin) return callback(null, true);
    
    // 严格检查 origin
    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));

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
  ws: true,  // 启用 WebSocket 代理
  xfwd: true,
  pathRewrite: {
    '^/api': '/api',  // 保持 /api 前缀
    '^/socket.io': '/socket.io'  // 添加 WebSocket 路径重写
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

// 设置代理路由
app.use('/api', apiProxy);
app.use('/socket.io', apiProxy);  // 添加 WebSocket 代理路由

// 静态文件服务
app.use(express.static(path.join(__dirname, 'build'), {
  maxAge: '1h',        // 设置客户端缓存时间为1小时
  etag: true,          // 启用 ETag 支持
  lastModified: true   // 启用 Last-Modified 支持
}));

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Forbidden', message: 'CORS policy restriction' });
  }
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

// 最后处理所有其他请求
app.get('*', (req, res, next) => {
  // 如果请求的是静态资源（有扩展名），则返回 404
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|json|map)$/)) {
    return res.status(404).json({ error: 'Not Found' });
  }

  // 仅对 HTML 请求返回 index.html
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  } else {
    // 对于其他类型的请求（如 API 调用），返回 404
    res.status(404).json({ error: 'Not Found' });
  }
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