const isDevelopment = process.env.NODE_ENV === 'development';

const config = {
  // 开发环境使用 localhost
  // 生产环境使用当前域名
  apiBaseUrl: isDevelopment 
    ? 'http://localhost:5002'
    : `http://${window.location.hostname}:5002`
};

export default config; 