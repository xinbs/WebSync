import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space, Tag, InputNumber, Progress } from 'antd';
import { UserAddOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

const UserManagement = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingUser, setEditingUser] = useState(null);
  const [resetPasswordModalVisible, setResetPasswordModalVisible] = useState(false);
  const [resetPasswordForm] = Form.useForm();
  const [resettingUser, setResettingUser] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/users');
      setUsers(response.data);
    } catch (error) {
      message.error('获取用户列表失败');
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({
      storage_limit: 1, // 默认1GB
    });
    setModalVisible(true);
  };

  const handleEditUser = (user) => {
    setEditingUser(user);
    form.setFieldsValue({
      email: user.email,
      role: user.role,
      storage_limit: user.storage_limit / (1024 * 1024 * 1024), // 转换为GB
    });
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      // 将GB转换为字节
      values.storage_limit = values.storage_limit * 1024 * 1024 * 1024;
      
      if (editingUser) {
        // 编辑用户
        await axios.put(`/api/users/${editingUser.id}`, values);
        message.success('用户更新成功');
      } else {
        // 创建新用户
        await axios.post('/api/register', values);
        message.success('用户创建成功');
      }
      setModalVisible(false);
      fetchUsers();
    } catch (error) {
      message.error(error.response?.data?.error || '操作失败');
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.id === currentUser.id) {
      message.error('不能删除自己的账号');
      return;
    }

    try {
      await axios.delete(`/api/users/${user.id}`);
      message.success('用户删除成功');
      fetchUsers();
    } catch (error) {
      message.error(error.response?.data?.error || '删除失败');
    }
  };

  const formatStorage = (bytes) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const handleResetPassword = (user) => {
    setResettingUser(user);
    resetPasswordForm.resetFields();
    setResetPasswordModalVisible(true);
  };

  const handleResetPasswordOk = async () => {
    try {
      const values = await resetPasswordForm.validateFields();
      await axios.post(`/api/users/${resettingUser.id}/reset-password`, {
        new_password: values.new_password
      });
      message.success('密码重置成功');
      setResetPasswordModalVisible(false);
    } catch (error) {
      message.error(error.response?.data?.error || '密码重置失败');
    }
  };

  const columns = [
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        const colors = {
          admin: 'red',
          manager: 'blue',
          user: 'green'
        };
        const labels = {
          admin: '管理员',
          manager: '管理者',
          user: '普通用户'
        };
        return <Tag color={colors[role]}>{labels[role]}</Tag>;
      },
    },
    {
      title: '存储空间',
      key: 'storage',
      render: (_, record) => {
        const usedPercent = (record.storage_used / record.storage_limit) * 100;
        const status = usedPercent >= 90 ? 'exception' : usedPercent >= 70 ? 'warning' : 'normal';
        
        return (
          <div style={{ width: 200 }}>
            <div style={{ marginBottom: 4 }}>
              {formatStorage(record.storage_used)} / {formatStorage(record.storage_limit)}
            </div>
            <Progress 
              percent={usedPercent.toFixed(1)} 
              size="small" 
              status={status}
              strokeColor={{
                '0%': '#108ee9',
                '100%': usedPercent >= 90 ? '#f50' : usedPercent >= 70 ? '#faad14' : '#108ee9',
              }}
            />
          </div>
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          {(currentUser.role === 'admin' || currentUser.id === record.id) && (
            <>
              <Button
                onClick={() => handleResetPassword(record)}
              >
                重置密码
              </Button>
            </>
          )}
          {currentUser.role === 'admin' && (
            <>
              <Button
                icon={<EditOutlined />}
                onClick={() => handleEditUser(record)}
              >
                编辑
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => handleDeleteUser(record)}
                disabled={record.id === currentUser.id}
              >
                删除
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      {currentUser.role === 'admin' && (
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={handleAddUser}
          style={{ marginBottom: 16 }}
        >
          添加用户
        </Button>
      )}
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
      />
      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input />
          </Form.Item>
          {!editingUser && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码长度至少为6位' }
              ]}
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select>
              <Option value="user">普通用户</Option>
              <Option value="manager">管理者</Option>
              {currentUser.role === 'admin' && (
                <Option value="admin">管理员</Option>
              )}
            </Select>
          </Form.Item>
          <Form.Item
            name="storage_limit"
            label="存储空间限制 (GB)"
            rules={[{ required: true, message: '请输入存储空间限制' }]}
          >
            <InputNumber
              min={1}
              max={1000}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="重置密码"
        open={resetPasswordModalVisible}
        onOk={handleResetPasswordOk}
        onCancel={() => setResetPasswordModalVisible(false)}
      >
        <Form
          form={resetPasswordForm}
          layout="vertical"
        >
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码长度至少为6位' }
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement; 