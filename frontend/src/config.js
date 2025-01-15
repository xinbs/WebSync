const isDevelopment = process.env.NODE_ENV === 'development';

const config = {
  // 如果是开发环境使用 localhost
  // 生产环境使用相同域名，只是端口不同
  apiBaseUrl: isDevelopment 
    ? 'http://localhost:5002'
    : `${window.location.protocol}//${window.location.hostname}:5002`
};

export default config; 