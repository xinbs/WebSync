import React, { useState, useEffect } from 'react';
import { Layout, Typography, Button, Space, Spin, Tabs, message, Modal, Input, InputNumber, Alert } from 'antd';
import { LogoutOutlined, LinkOutlined, CopyOutlined } from '@ant-design/icons';
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
  const [magicLinkOpen, setMagicLinkOpen] = useState(false);
  const [magicLinkMinutes, setMagicLinkMinutes] = useState(2);
  const [magicLink, setMagicLink] = useState('');
  const [generatingMagicLink, setGeneratingMagicLink] = useState(false);

  useEffect(() => {
    const restoreSession = async () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const callbackToken = params.get('access_token');
      const magicCode = params.get('magic_code');
      const authError = params.get('auth_error');
      let token = callbackToken || localStorage.getItem('token');
      let completedLogin = Boolean(callbackToken);

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

      if (magicCode) {
        try {
          const response = await axios.post('/api/auth/magic-link/consume', {
            code: magicCode
          });
          token = response.data.access_token;
          completedLogin = true;
        } catch (error) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          delete axios.defaults.headers.common['Authorization'];
          message.error(error.response?.data?.error || '临时登录链接无效或已过期');
          setLoading(false);
          return;
        }
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
        if (completedLogin) {
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

  const copyMagicLink = async (link = magicLink) => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      message.success('临时登录链接已复制');
    } catch (error) {
      message.warning('自动复制失败，请手动复制链接');
    }
  };

  const handleGenerateMagicLink = async () => {
    setGeneratingMagicLink(true);
    try {
      const response = await axios.post('/api/auth/magic-link', {
        expires_in: magicLinkMinutes * 60
      });
      const link = response.data.magic_link;
      setMagicLink(link);
      await copyMagicLink(link);
    } catch (error) {
      message.error(error.response?.data?.error || '生成临时登录链接失败');
    } finally {
      setGeneratingMagicLink(false);
    }
  };

  const openMagicLinkDialog = () => {
    setMagicLink('');
    setMagicLinkMinutes(2);
    setMagicLinkOpen(true);
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
          icon={<LinkOutlined />}
          onClick={openMagicLinkDialog}
        >
          临时登录链接
        </Button>
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
      <Modal
        title="生成临时登录链接"
        open={magicLinkOpen}
        okText={magicLink ? '重新生成并复制' : '生成并复制'}
        cancelText="关闭"
        confirmLoading={generatingMagicLink}
        onOk={handleGenerateMagicLink}
        onCancel={() => setMagicLinkOpen(false)}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message="链接在有效期内等同于临时密码，只能使用一次，请通过可信渠道传递。"
          />
          <Space>
            <span>有效时间</span>
            <InputNumber
              min={1}
              max={10}
              value={magicLinkMinutes}
              onChange={(value) => setMagicLinkMinutes(value || 2)}
              disabled={generatingMagicLink}
            />
            <span>分钟</span>
          </Space>
          {magicLink && (
            <Space.Compact style={{ width: '100%' }}>
              <Input value={magicLink} readOnly />
              <Button
                icon={<CopyOutlined />}
                onClick={() => copyMagicLink()}
              >
                复制
              </Button>
            </Space.Compact>
          )}
        </Space>
      </Modal>
    </Layout>
  );
};

export default App;
