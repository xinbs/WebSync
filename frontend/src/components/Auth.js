import React from 'react';
import { Card, Button, Typography } from 'antd';
import { GoogleOutlined } from '@ant-design/icons';

const { Title } = Typography;

const Auth = () => {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#f0f2f5'
    }}>
      <Card style={{ width: 400, padding: '24px' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: 32 }}>
          WebSync 文件同步工具
        </Title>
        <Typography.Paragraph
          type="secondary"
          style={{ textAlign: 'center', marginBottom: 24 }}
        >
          仅允许指定的 Google 账号访问
        </Typography.Paragraph>
        <Button
          type="primary"
          icon={<GoogleOutlined />}
          href="/api/auth/google"
          block
          size="large"
        >
          使用 Google 登录
        </Button>
      </Card>
    </div>
  );
};

export default Auth;
