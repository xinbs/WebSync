import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Tag, Space, Typography } from 'antd';
import { DownloadOutlined, SyncOutlined, ShareAltOutlined, DeleteOutlined, GlobalOutlined, UserOutlined } from '@ant-design/icons';
import axios from '../utils/axios';
import io from 'socket.io-client';

const { Text } = Typography;
const { Option } = Select;

const FileList = ({ currentUser }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [shareForm] = Form.useForm();
  const [users, setUsers] = useState([]);
  const [socket, setSocket] = useState(null);

  const fetchUsers = async () => {
    try {
      const response = await axios.get('/api/users');
      setUsers(response.data.filter(user => user.id !== currentUser.id));
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  useEffect(() => {
    // 初始化 WebSocket 连接
    const newSocket = io('http://localhost:5002', {
      transports: ['websocket'],
      upgrade: false
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    newSocket.on('files_updated', (data) => {
      console.log('Files updated:', data);
      // 只在文件变更时才刷新列表
      if (data.message === '文件已更新' || data.message === '新文件已添加' || data.message === '文件已删除') {
        fetchFiles();  // 收到更新通知时重新获取文件列表
      }
    });

    setSocket(newSocket);

    // 组件卸载时清理
    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/files');
      setFiles(response.data);
    } catch (error) {
      console.error('Error fetching files:', error);
      message.error('获取文件列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
    fetchUsers();
  }, []);

  const handleDownload = async (path, owner) => {
    try {
      const response = await axios.get(`/api/download/${path}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', path.split('/').pop());
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  const handleShare = (file) => {
    setSelectedFile(file);
    shareForm.resetFields();
    setShareModalVisible(true);
  };

  const handleShareSubmit = async () => {
    try {
      const values = await shareForm.validateFields();
      await axios.post(`/api/files/${selectedFile.id}/share`, {
        type: values.shareType,
        user_email: values.shareType === 'user' ? values.userEmail : undefined
      });
      message.success('文件共享成功');
      setShareModalVisible(false);
      fetchFiles();
    } catch (error) {
      console.error('Error sharing file:', error);
    }
  };

  const handleUnshare = async (file, type, userEmail) => {
    try {
      await axios.delete(`/api/files/${file.id}/share`, {
        data: {
          type,
          user_email: userEmail
        }
      });
      message.success('已取消共享');
      fetchFiles();
    } catch (error) {
      console.error('Error unsharing file:', error);
    }
  };

  const handleDelete = async (file) => {
    try {
      await axios.delete(`/api/files/${file.id}`);
      message.success('文件删除成功');
      fetchFiles();
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  const getFileTypeTag = (type) => {
    switch (type) {
      case 'own':
        return <Tag color="blue">我的文件</Tag>;
      case 'shared':
        return <Tag color="green">共享文件</Tag>;
      case 'public':
        return <Tag color="orange">公开文件</Tag>;
      case 'admin_view':
        return <Tag color="purple">管理员查看</Tag>;
      default:
        return null;
    }
  };

  const columns = [
    {
      title: '文件名',
      dataIndex: 'path',
      key: 'path',
      render: (path, record) => (
        <Space>
          {path}
          {getFileTypeTag(record.type)}
          {record.is_public && <Tag color="orange"><GlobalOutlined /> 公开</Tag>}
        </Space>
      ),
    },
    {
      title: '所有者',
      dataIndex: 'owner',
      key: 'owner',
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      render: (size) => {
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let fileSize = size;
        while (fileSize >= 1024 && i < units.length - 1) {
          fileSize /= 1024;
          i++;
        }
        return `${fileSize.toFixed(2)} ${units[i]}`;
      },
    },
    {
      title: '修改时间',
      dataIndex: 'modified',
      key: 'modified',
      render: (date) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(record.path, record.owner)}
          >
            下载
          </Button>
          {(record.type === 'own' || currentUser.role === 'admin') && (
            <>
              <Button
                icon={<ShareAltOutlined />}
                onClick={() => handleShare(record)}
              >
                共享
              </Button>
              <Popconfirm
                title="确定要删除此文件吗？"
                onConfirm={() => handleDelete(record)}
                okText="确定"
                cancelText="取消"
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={fetchFiles}
            loading={loading}
            style={{ marginRight: 16 }}
          >
            刷新列表
          </Button>
          <Text type="secondary">
            共 {files.length} 个文件
          </Text>
        </div>
      </div>
      <Table
        columns={columns}
        dataSource={files}
        rowKey={(record) => `${record.path}-${record.owner}`}
        loading={loading}
      />
      <Modal
        title="共享文件"
        open={shareModalVisible}
        onOk={handleShareSubmit}
        onCancel={() => setShareModalVisible(false)}
      >
        <Form
          form={shareForm}
          layout="vertical"
        >
          <Form.Item
            name="shareType"
            label="共享类型"
            rules={[{ required: true, message: '请选择共享类型' }]}
          >
            <Select>
              <Option value="public">
                <GlobalOutlined /> 公开共享（所有人可见）
              </Option>
              <Option value="user">
                <UserOutlined /> 共享给指定用户
              </Option>
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.shareType !== currentValues.shareType}
          >
            {({ getFieldValue }) => 
              getFieldValue('shareType') === 'user' && (
                <Form.Item
                  name="userEmail"
                  label="选择用户"
                  rules={[{ required: true, message: '请选择用户' }]}
                >
                  <Select>
                    {users.map(user => (
                      <Option key={user.id} value={user.email}>
                        {user.email} ({
                          {
                            'admin': '管理员',
                            'manager': '管理者',
                            'user': '普通用户'
                          }[user.role]
                        })
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FileList;
