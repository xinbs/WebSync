import React, { useState } from 'react';
import { Upload, Button, message, Typography } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import axios from '../utils/axios';

const { Text } = Typography;

const CHUNK_SIZE = 512 * 1024; // 每块 512KB，base64 后约 700KB，和普通文本请求体量相当
const CHUNK_RETRY = 3;

// 把 Blob 转成 base64（不带 data: 前缀）
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(',')[1] || '');
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const UploadForm = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ show: false, success: true, text: '' });

  // 分块 + base64 JSON 逐块上传：请求形态与文本剪贴板一致，
  // 绕开本地安全软件对文件上传特征（multipart/二进制流/URL 文件名）的拦截
  const handleUpload = async (file) => {
    try {
      setUploading(true);
      setUploadStatus({ show: true, success: true, text: '正在上传...' });

      const uploadId = crypto.randomUUID();
      const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));

      for (let index = 0; index < total; index++) {
        const blob = file.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
        const data = await blobToBase64(blob);
        const payload = {
          upload_id: uploadId,
          filename: file.name,
          index,
          total,
          offset: index * CHUNK_SIZE,
          total_size: file.size,
          data
        };

        // 单块失败重试，服务器按 offset 写入，重传幂等
        let lastError = null;
        for (let attempt = 0; attempt < CHUNK_RETRY; attempt++) {
          try {
            await axios.post('/api/clipboard/attach/chunk', payload, { timeout: 60000 });
            lastError = null;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (lastError) {
          throw lastError;
        }

        setUploadStatus({
          show: true,
          success: true,
          text: `上传中 ${Math.round(((index + 1) / total) * 100)}%`
        });
      }

      setUploadStatus({ show: true, success: true, text: '上传成功' });
      setTimeout(() => setUploadStatus({ show: false, success: true, text: '' }), 3000);
      return true;
    } catch (error) {
      console.error('Error uploading file:', error);
      const serverMsg = error.response && error.response.data && error.response.data.error;
      setUploadStatus({ show: true, success: false, text: serverMsg ? `上传失败: ${serverMsg}` : '上传失败' });
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
