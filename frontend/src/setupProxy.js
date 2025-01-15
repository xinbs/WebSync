const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:5002',
      changeOrigin: true,
      secure: false,
      pathRewrite: {
        '^/api': '/api'  // 保持 /api 前缀
      },
      onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).json({ error: '代理服务器错误' });
      }
    })
  );
}; 