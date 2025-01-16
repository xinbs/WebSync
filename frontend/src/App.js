import React, { useState, useEffect } from 'react';
import { Layout, Typography, Button, Space, Spin, Tabs } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import axios from 'axios';
import Auth from './components/Auth';
import FileList from './components/FileList';
import UploadForm from './components/UploadForm';
import UserManagement from './components/UserManagement';
import Clipboard from './components/Clipboard';
import JsonFormatter from './components/JsonFormatter';

const { Header, Content } = Layout;
const { Title } = Typography;

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser(JSON.parse(savedUser));
      setIsAuthenticated(true);
    }
    
    setLoading(false);
  }, []);

  const handleAuthSuccess = (data) => {
    const { access_token, user } = data;
    localStorage.setItem('token', access_token);
    localStorage.setItem('user', JSON.stringify(user));
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setUser(user);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setIsAuthenticated(false);
    setUser(null);
  };

  const tabItems = [
    {
      key: 'files',
      label: '文件管理',
      children: (
        <>
          <UploadForm />
          <FileList currentUser={user} />
        </>
      )
    },
    {
      key: 'clipboard',
      label: '粘贴板',
      children: <Clipboard />
    },
    {
      key: 'json',
      label: 'JSON工具',
      children: <JsonFormatter />
    }
  ];

  if (user?.role === 'admin') {
    tabItems.push({
      key: 'users',
      label: '用户管理',
      children: <UserManagement currentUser={user} />
    });
  }

  if (loading) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center' 
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '0 24px',
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <Title level={3} style={{ margin: 0 }}>
          WebSync 文件同步工具
        </Title>
        <Space>
          <span>{user?.email}</span>
          <Button 
            type="text" 
            icon={<LogoutOutlined />} 
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: '24px', background: '#f0f2f5' }}>
        <Tabs items={tabItems} />
      </Content>
    </Layout>
  );
};

export default App;
