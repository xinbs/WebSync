import React from 'react';
import { Form, Input, Button, message } from 'antd';
import axios from 'axios';
import config from '../config';

const Login = ({ onLoginSuccess }) => {
  const handleLogin = async (values) => {
    try {
      const response = await axios.post(`${config.apiBaseUrl}/api/login`, values);
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      message.success('登录成功');
      onLoginSuccess(user);
    } catch (error) {
      console.error('Login error:', error);
      message.error(error.response?.data?.error || '登录失败，请检查网络连接');
    }
  };

  // ... 其余代码保持不变 ...
};

export default Login; 