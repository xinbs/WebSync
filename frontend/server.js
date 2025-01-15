const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 启用 CORS
app.use(cors());

// 添加基本的请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// API 请求代理
const apiProxy = createProxyMiddleware({
  target: 'http://127.0.0.1:5002',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '/api'  // 保持 /api 前缀
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log(`代理请求: ${req.method} ${req.url} -> ${proxyReq.path}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`代理响应: ${req.method} ${req.url} -> ${proxyRes.statusCode}`);
  },
  onError: (err, req, res) => {
    console.error('代理错误:', err);
    console.error('请求详情:', {
      method: req.method,
      url: req.url,
      headers: req.headers
    });
    res.status(500).json({ 
      error: '代理服务器错误',
      message: err.message,
      code: err.code
    });
  }
});

app.use('/api', apiProxy);

// 静态文件服务
app.use(express.static(path.join(__dirname, 'build'), {
  maxAge: '1h',  // 缓存静态文件1小时
  etag: true,    // 启用 ETag
  lastModified: true  // 启用 Last-Modified
}));

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

// 所有其他请求返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// 启动服务器
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器启动于: http://localhost:${PORT}`);
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