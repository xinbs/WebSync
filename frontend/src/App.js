import React, { useState, useEffect } from 'react';
import { Layout, Typography, Button, Space, Spin, Tabs, message } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import axios from 'axios';
import Auth from './components/Auth';
import FileList from './components/FileList';
import UploadForm from './components/UploadForm';
import Clipboard from './components/Clipboard';
import JsonFormatter from './components/JsonFormatter';
import RegexTester from './components/RegexTester';
import GrokDebugger from './components/GrokDebugger';
import MarkdownConverter from './components/MarkdownConverter';

const { Header, Content } = Layout;
const { Title } = Typography;

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const callbackToken = params.get('access_token');
      const authError = params.get('auth_error');
      const token = callbackToken || localStorage.getItem('token');

      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      if (authError) {
        const errorMessages = {
          account_not_allowed: '此 Google 账号无权访问',
          google_denied: 'Google 登录已取消',
          invalid_state: '登录请求已失效，请重试',
          google_failed: 'Google 登录失败，请重试'
        };
        message.error(errorMessages[authError] || '登录失败');
      }

      if (!token) {
        setLoading(false);
        return;
      }

      try {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        const response = await axios.get('/api/auth/me');
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setUser(response.data.user);
        setIsAuthenticated(true);
        if (callbackToken) {
          message.success('登录成功');
        }
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete axios.defaults.headers.common['Authorization'];
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

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
    },
    {
      key: 'regex',
      label: '正则工具',
      children: <RegexTester />
    },
    {
      key: 'grok',
      label: 'Grok工具',
      children: <GrokDebugger />
    },
    {
      key: 'markdown',
      label: 'Markdown转换',
      children: <MarkdownConverter />
    }
  ];

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
    return <Auth />;
  }

  const renderTabBarExtraContent = {
    left: (
      <Title level={4} style={{ margin: '0 24px 0 0', lineHeight: '46px', minWidth: '200px' }}>
        WebSync 文件同步工具
      </Title>
    ),
    right: (
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
    )
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <div style={{ background: '#fff', padding: '0 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', zIndex: 1 }}>
        <Tabs
          items={tabItems}
          tabBarExtraContent={renderTabBarExtraContent}
          style={{ margin: 0 }}
        />
      </div>
    </Layout>
  );
};

export default App;
