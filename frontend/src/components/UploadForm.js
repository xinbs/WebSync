import React, { useState } from 'react';
import { Upload, Button, message, Typography } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;

const UploadForm = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ show: false, success: true, text: '' });

  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', file.name);

    try {
      setUploading(true);
      setUploadStatus({ show: true, success: true, text: '正在上传...' });
      
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:5002/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`
        },
        timeout: 30000, // 30秒超时
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadStatus({ 
            show: true, 
            success: true, 
            text: `上传中 ${percentCompleted}%` 
          });
        }
      });
      
      setUploadStatus({ show: true, success: true, text: '上传成功' });
      setTimeout(() => setUploadStatus({ show: false, success: true, text: '' }), 3000);
      return true;
    } catch (error) {
      console.error('Error uploading file:', error);
      let errorMessage = '上传失败';
      if (error.code === 'ECONNABORTED') {
        errorMessage = '上传超时，请检查网络连接';
      } else if (error.response) {
        errorMessage = `上传失败: ${error.response.data?.error || '服务器错误'}`;
      } else if (error.request) {
        errorMessage = '无法连接到服务器，请检查网络';
      }
      
      setUploadStatus({ show: true, success: false, text: errorMessage });
      setTimeout(() => setUploadStatus({ show: false, success: true, text: '' }), 5000);
      return false;
    } finally {
      setUploading(false);
    }
  };

  const uploadProps = {
    name: 'file',
    multiple: false,
    showUploadList: false,
    beforeUpload: (file) => {
      // 可以在这里添加文件类型、大小等检查
      return true;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      try {
        const success = await handleUpload(file);
        if (success) {
          onSuccess();
        } else {
          onError();
        }
      } catch (err) {
        onError();
      }
    },
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <Upload {...uploadProps}>
          <Button icon={<UploadOutlined />} loading={uploading}>
            选择文件上传
          </Button>
        </Upload>
      </div>
      {uploadStatus.show && (
        <Text
          type={uploadStatus.success ? 'secondary' : 'danger'}
          style={{ display: 'block', marginTop: 8 }}
        >
          {uploadStatus.text}
        </Text>
      )}
      <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
        支持单个文件上传，文件大小不限
      </Text>
    </div>
  );
};

export default UploadForm;
