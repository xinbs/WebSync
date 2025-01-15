import axios from 'axios';
import { message } from 'antd';

// 创建 axios 实例
const instance = axios.create({
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器
instance.interceptors.request.use(
  (config) => {
    // 从 localStorage 获取 token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Response error:', error);
    
    if (error.code === 'ERR_NETWORK') {
      message.error('网络错误，请检查网络连接');
    } else if (error.response) {
      switch (error.response.status) {
        case 401:
          message.error('登录已过期，请重新登录');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.reload();
          break;
        case 403:
          message.error('没有权限执行此操作');
          break;
        case 404:
          message.error('请求的资源不存在');
          break;
        case 422:
          message.error('请求参数错误');
          break;
        default:
          message.error(error.response.data?.error || '服务器错误');
      }
    } else if (error.request) {
      message.error('无法连接到服务器');
    }
    
    return Promise.reject(error);
  }
);

export default instance; 