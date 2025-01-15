const isDevelopment = process.env.NODE_ENV === 'development';

const config = {
  // 使用相对路径，请求会被开发服务器代理到后端
  apiBaseUrl: '/api'
};

export default config; 