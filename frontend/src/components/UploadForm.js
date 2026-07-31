import React, { useState } from 'react';
import { Upload, Button, message, Typography } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import axios from '../utils/axios';

const { Text } = Typography;

const UploadForm = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ show: false, success: true, text: '' });

  const handleUpload = async (file) => {
    try {
      setUploading(true);
      setUploadStatus({ show: true, success: true, text: '正在上传...' });

      // 走剪贴板附件通道：裸二进制 body，绕开本地软件对 multipart 上传的拦截
      await axios.post(`/api/clipboard/attach?filename=${encodeURIComponent(file.name)}`, file, {
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        timeout: 0,
        onUploadProgress: (progressEvent) => {
          const percentCompleted = progressEvent.total
            ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
            : 0;
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
      setUploadStatus({ show: true, success: false, text: '上传失败' });
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

  // 支持从资源管理器复制文件后直接 Ctrl+V 粘贴上传
  const handlePaste = (e) => {
    const files = e.clipboardData && e.clipboardData.files;
    if (files && files.length > 0) {
      e.preventDefault();
      handleUpload(files[0]);
    }
  };

  return (
    <div style={{ marginBottom: 24 }} onPaste={handlePaste}>
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
        支持单个文件上传（也可复制文件后在此粘贴），文件大小不限
      </Text>
    </div>
  );
};

export default UploadForm;
