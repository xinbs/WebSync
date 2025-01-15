const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// API 请求代理
app.use('/api', createProxyMiddleware({
  target: 'http://127.0.0.1:5002',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Proxy Error:', err);
    res.status(500).json({ error: '代理服务器错误' });
  }
}));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'build')));

// 所有其他请求返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
}); 