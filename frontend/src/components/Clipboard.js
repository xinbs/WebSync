import React, { useState, useEffect } from 'react';
import { List, Card, Button, message, Typography, Space, Image, Input } from 'antd';
import { DeleteOutlined, CopyOutlined, SendOutlined } from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import axios from 'axios';
import { format } from 'date-fns';

const { Text, Title } = Typography;
const { TextArea } = Input;

const Clipboard = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [imageUrls, setImageUrls] = useState({});

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/clipboard');
      setItems(response.data);
    } catch (error) {
      message.error('获取剪贴板内容失败');
      console.error('Error fetching clipboard items:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    items.forEach(item => {
      if (item.type === 'image') {
        const token = localStorage.getItem('token');
        axios.get(`/api/clipboard/image/${item.id}`, {
          responseType: 'blob',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }).then(response => {
          const url = URL.createObjectURL(response.data);
          setImageUrls(prev => ({ ...prev, [item.id]: url }));
        }).catch(error => {
          console.error('Error loading image:', error);
          message.error('加载图片失败');
        });
      }
    });

    return () => {
      // 清理已创建的URL
      Object.values(imageUrls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [items]);

  const handlePaste = async (e) => {
    e.preventDefault();
    const clipboardData = e.clipboardData || window.clipboardData;
    
    // 处理图片
    const items = clipboardData.items;
    let imageFile = null;

    // 遍历所有粘贴的内容
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log('Pasted item:', item.type);  // 调试日志
      
      // 检查是否是图片
      if (item.type.startsWith('image/')) {
        imageFile = item.getAsFile();
        console.log('Found image file:', imageFile);  // 调试日志
        break;
      }
    }

    if (imageFile) {
      console.log('Processing image file:', imageFile.name, imageFile.type);  // 调试日志
      const formData = new FormData();
      formData.append('file', imageFile);
      
      try {
        setLoading(true);
        const response = await axios.post('/api/clipboard', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        console.log('Upload response:', response.data);  // 调试日志
        message.success('图片已保存到剪贴板');
        fetchItems();
      } catch (error) {
        console.error('Error details:', error.response?.data || error.message);  // 调试日志
        message.error('保存图片失败');
      } finally {
        setLoading(false);
      }
      return;
    }
    
    // 处理文本
    const text = clipboardData.getData('text');
    if (text) {
      try {
        setLoading(true);
        const isCode = /[{}\[\]()=>;]|function|class|import|export|const|let|var/.test(text);
        await axios.post('/api/clipboard', {
          content: text,
          type: isCode ? 'code' : 'text'
        });
        message.success('内容已保存到剪贴板');
        fetchItems();
      } catch (error) {
        message.error('保存内容失败');
        console.error('Error saving clipboard item:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/clipboard/${id}`);
      message.success('删除成功');
      fetchItems();
    } catch (error) {
      message.error('删除失败');
      console.error('Error deleting clipboard item:', error);
    }
  };

  const handleCopy = async (content) => {
    try {
      // 主要复制方法
      await navigator.clipboard.writeText(content);
      message.success('已复制到剪贴板');
    } catch (error) {
      // 备用复制方法
      try {
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        message.success('已复制到剪贴板');
      } catch (fallbackError) {
        message.error('复制失败');
        console.error('Error copying to clipboard:', error, fallbackError);
      }
    }
  };

  const handleInputSubmit = async () => {
    if (!inputText.trim()) {
      message.warning('请输入内容');
      return;
    }

    try {
      // 检测是否为代码
      const isCode = /[{}\[\]()=>;]|function|class|import|export|const|let|var/.test(inputText);
      await axios.post('/api/clipboard', {
        content: inputText,
        type: isCode ? 'code' : 'text'
      });
      message.success('内容已保存到剪贴板');
      setInputText(''); // 清空输入框
      fetchItems();
    } catch (error) {
      message.error('保存内容失败');
      console.error('Error saving clipboard item:', error);
    }
  };

  const renderItem = (item) => {
    if (item.type === 'image') {
      return (
        <List.Item>
          <Card 
            style={{ 
              width: '100%',
              position: 'relative'
            }}
            bodyStyle={{
              padding: '16px',
              paddingRight: '100px' // 为右侧按钮留出空间
            }}
          >
            {/* 按钮组 */}
            <div style={{
              position: 'absolute',
              top: 12,
              right: 16,
              zIndex: 1
            }}>
              <Space>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(item.id)}
                />
              </Space>
            </div>

            <img
              src={imageUrls[item.id]}
              alt="剪贴板图片"
              style={{ 
                maxWidth: '100%',
                maxHeight: '500px',
                cursor: 'pointer',
                objectFit: 'contain'
              }}
              onClick={() => {
                const token = localStorage.getItem('token');
                const win = window.open('');
                win.document.write(`
                  <html>
                    <head>
                      <title>图片预览</title>
                      <style>
                        body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
                        img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                      </style>
                    </head>
                    <body>
                      <img id="preview" src="" />
                      <script>
                        fetch('/api/clipboard/image/${item.id}', {
                          headers: {
                            'Authorization': 'Bearer ${token}'
                          }
                        })
                        .then(response => response.blob())
                        .then(blob => {
                          document.getElementById('preview').src = URL.createObjectURL(blob);
                        })
                        .catch(error => {
                          console.error('Error loading image:', error);
                          document.body.innerHTML = '<div style="color: white; text-align: center;">加载图片失败</div>';
                        });
                      </script>
                    </body>
                  </html>
                `);
              }}
            />
            <Text type="secondary" style={{ display: 'block', marginTop: '8px' }}>
              {format(new Date(item.created_at), 'yyyy-MM-dd HH:mm:ss')}
            </Text>
          </Card>
        </List.Item>
      );
    }

    return (
      <List.Item>
        <Card 
          style={{ 
            width: '100%',
            position: 'relative'
          }}
          bodyStyle={{
            padding: '16px',
            paddingRight: '100px' // 为右侧按钮留出空间
          }}
        >
          {/* 按钮组 - 竖直排列 */}
          <div style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '4px',
            borderRadius: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(4px)'
          }}>
            <Button
              type="text"
              icon={<CopyOutlined />}
              onClick={() => handleCopy(item.content)}
              style={{
                color: '#000',
                transition: 'all 0.3s',
                padding: '4px 8px',
                height: 'auto',
                minHeight: '32px'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              复制
            </Button>
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(item.id)}
              style={{
                transition: 'all 0.3s',
                padding: '4px 8px',
                height: 'auto',
                minHeight: '32px'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 77, 79, 0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              删除
            </Button>
          </div>

          {/* 内容区域 */}
          <div style={{
            maxWidth: '100%',
            overflow: 'auto',
            wordBreak: 'break-all'
          }}>
            {item.type === 'code' ? (
              <div style={{
                maxHeight: '500px',
                overflow: 'auto'
              }}>
                <SyntaxHighlighter 
                  language="javascript" 
                  style={tomorrow}
                  customStyle={{ 
                    margin: 0,
                    maxWidth: '100%'
                  }}
                >
                  {item.content}
                </SyntaxHighlighter>
              </div>
            ) : (
              <div style={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                fontSize: '14px',
                backgroundColor: '#f5f5f5',
                padding: '8px',
                borderRadius: '4px',
                maxHeight: '500px',
                overflow: 'auto'
              }}>
                <Text>{item.content}</Text>
              </div>
            )}
            <Text type="secondary" style={{ display: 'block', marginTop: '8px' }}>
              {format(new Date(item.created_at), 'yyyy-MM-dd HH:mm:ss')}
            </Text>
          </div>
        </Card>
      </List.Item>
    );
  };

  return (
    <div style={{ 
      minHeight: '300px',
      padding: '16px',
      background: '#fff',
      borderRadius: '8px',
      outline: 'none'
    }}>
      <Space direction="vertical" style={{ width: '100%', marginBottom: '24px' }}>
        <Title level={5}>输入内容</Title>
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入要保存的内容..."
            autoSize={{ minRows: 2, maxRows: 6 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleInputSubmit();
              }
            }}
          />
          <Button 
            type="primary" 
            icon={<SendOutlined />}
            onClick={handleInputSubmit}
          >
            保存
          </Button>
        </Space.Compact>
      </Space>

      <TextArea
        placeholder="在此区域粘贴内容 (Ctrl+V 或 Command+V)"
        onPaste={handlePaste}
        style={{ 
          background: '#f5f5f5',
          marginBottom: '24px',
          minHeight: '100px',
          resize: 'none',
          textAlign: 'center',
          cursor: 'text'
        }}
        bordered={false}
        autoSize={{ minRows: 4 }}
      />

      <List
        loading={loading}
        dataSource={items}
        renderItem={renderItem}
        style={{ marginTop: '16px' }}
      />
    </div>
  );
};

export default Clipboard;