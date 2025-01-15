import React from 'react';
import { Form, Input, Button, message } from 'antd';
import axios from '../utils/axios';

const Login = ({ onLoginSuccess }) => {
  const handleLogin = async (values) => {
    try {
      const response = await axios.post('/api/login', values);
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      message.success('登录成功');
      onLoginSuccess(user);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  return (
    <Form onFinish={handleLogin}>
      <Form.Item
        name="email"
        rules={[{ required: true, message: '请输入邮箱' }]}
      >
        <Input placeholder="邮箱" />
      </Form.Item>
      <Form.Item
        name="password"
        rules={[{ required: true, message: '请输入密码' }]}
      >
        <Input.Password placeholder="密码" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block>
          登录
        </Button>
      </Form.Item>
    </Form>
  );
};

export default Login; 