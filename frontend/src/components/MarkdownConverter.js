import React, { useState, useRef } from 'react';
import { Card, Input, Button, Upload, message, Space, Divider, Row, Col, Typography } from 'antd';
import { UploadOutlined, DownloadOutlined, FileImageOutlined, FileTextOutlined } from '@ant-design/icons';
import { marked } from 'marked';
import { toPng } from 'html-to-image';

const { TextArea } = Input;
const { Title, Text } = Typography;

const MarkdownConverter = () => {
  const [markdownText, setMarkdownText] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(false);
  const previewRef = useRef(null);

  // 配置marked选项
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });

  // 自定义CSS样式
  const getStyledHtml = (content) => {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown 渲染结果</title>
    <style>
        body {
            font-family: 'Microsoft YaHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 100%;
            margin: 0 auto;
            padding: 0;
            background-color: #f8f9fa;
            line-height: 1.6;
            box-sizing: border-box;
        }
        .container {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin: 10px;
            width: calc(100% - 20px);
            box-sizing: border-box;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #3498db;
            padding-bottom: 15px;
        }
        h2 {
            color: #34495e;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
            margin-top: 40px;
            margin-bottom: 20px;
        }
        h3 {
            color: #2980b9;
            margin-top: 25px;
            margin-bottom: 15px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            table-layout: fixed;
            word-wrap: break-word;
        }
        th, td {
            padding: 12px 15px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-weight: 600;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tr:hover {
            background-color: #e3f2fd;
            transition: background-color 0.3s ease;
        }
        ul, ol {
            margin: 15px 0;
            padding-left: 25px;
        }
        li {
            margin: 8px 0;
        }
        strong {
            color: #2c3e50;
            font-weight: 600;
        }
        hr {
            border: none;
            height: 2px;
            background: linear-gradient(90deg, transparent, #3498db, transparent);
            margin: 30px 0;
        }
        blockquote {
            background: #f8f9fa;
            border-left: 4px solid #3498db;
            margin: 20px 0;
            padding: 15px 20px;
            border-radius: 0 8px 8px 0;
        }
        code {
            background: #f1f2f6;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Consolas', 'Monaco', monospace;
            color: #e74c3c;
        }
        pre {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 20px 0;
        }
        pre code {
            background: none;
            color: inherit;
            padding: 0;
        }
        p {
            margin: 15px 0;
            text-align: justify;
        }
    </style>
</head>
<body>
    <div class="container">
        ${content}
    </div>
</body>
</html>`;
  };

  // 转换markdown为HTML
  const convertToHtml = () => {
    if (!markdownText.trim()) {
      message.warning('请输入Markdown内容');
      return;
    }

    try {
      const html = marked(markdownText);
      const styledHtml = getStyledHtml(html);
      setHtmlContent(styledHtml);
      message.success('转换成功！');
    } catch (error) {
      message.error('转换失败：' + error.message);
    }
  };

  // 转换为图片
  const convertToImage = async () => {
    if (!htmlContent) {
      message.warning('请先转换为HTML');
      return;
    }

    setLoading(true);
    try {
      // 创建一个临时的DOM元素来渲染完整的HTML内容
      const tempDiv = document.createElement('div');
      
      // 创建一个iframe来隔离样式
      const iframe = document.createElement('iframe');
      iframe.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        width: 1200px;
        height: auto;
        border: none;
      `;
      
      document.body.appendChild(iframe);
      
      // 写入完整的HTML内容到iframe
      iframe.contentDocument.open();
      iframe.contentDocument.write(htmlContent);
      iframe.contentDocument.close();
      
      // 等待iframe内容加载完成
      await new Promise(resolve => {
        iframe.onload = resolve;
        setTimeout(resolve, 500); // 备用超时
      });
      
      // 调整iframe高度以适应内容
      const iframeBody = iframe.contentDocument.body;
      const contentHeight = Math.max(
        iframeBody.scrollHeight,
        iframeBody.offsetHeight,
        iframe.contentDocument.documentElement.scrollHeight,
        iframe.contentDocument.documentElement.offsetHeight
      );
      iframe.style.height = contentHeight + 'px';
      
      // 使用iframe的body作为截图目标
      const targetElement = iframe.contentDocument.body;
      
      const dataUrl = await toPng(targetElement, {
        cacheBust: true,
        pixelRatio: 2,
        width: 1200,
        height: contentHeight,
        backgroundColor: '#ffffff',
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
          width: '1200px'
        }
      });
      
      // 清理临时元素
      document.body.removeChild(iframe);
      
      // 下载图片
      const link = document.createElement('a');
      link.download = 'markdown-render.png';
      link.href = dataUrl;
      link.click();
      
      message.success('图片生成并下载成功！');
    } catch (error) {
      message.error('图片生成失败：' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 下载HTML文件
  const downloadHtml = () => {
    if (!htmlContent) {
      message.warning('请先转换为HTML');
      return;
    }

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'markdown-render.html';
    link.click();
    URL.revokeObjectURL(url);
    message.success('HTML文件下载成功！');
  };

  // 处理文件上传
  const handleFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setMarkdownText(e.target.result);
      message.success('文件上传成功！');
    };
    reader.readAsText(file);
    return false; // 阻止默认上传行为
  };

  return (
    <div style={{ padding: '20px' }}>
      <Title level={2}>Markdown 转换工具</Title>
      <Text type="secondary">
        支持将Markdown文本转换为美化的HTML，并可导出为图片格式
      </Text>
      
      <Row gutter={[24, 24]} style={{ marginTop: '20px' }}>
        <Col xs={24} lg={12}>
          <Card title="输入区域" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Upload
                accept=".md,.txt"
                beforeUpload={handleFileUpload}
                showUploadList={false}
              >
                <Button icon={<UploadOutlined />}>上传MD文件</Button>
              </Upload>
              
              <TextArea
                value={markdownText}
                onChange={(e) => setMarkdownText(e.target.value)}
                placeholder="请输入Markdown内容或上传.md文件..."
                rows={20}
                style={{ fontFamily: 'Consolas, Monaco, monospace' }}
              />
              
              <Button 
                type="primary" 
                onClick={convertToHtml}
                block
              >
                转换为HTML
              </Button>
            </Space>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card 
            title="预览区域" 
            size="small"
            extra={
              <Space>
                <Button 
                  icon={<FileTextOutlined />}
                  onClick={downloadHtml}
                  disabled={!htmlContent}
                >
                  下载HTML
                </Button>
                <Button 
                  icon={<FileImageOutlined />}
                  onClick={convertToImage}
                  loading={loading}
                  disabled={!htmlContent}
                >
                  导出图片
                </Button>
              </Space>
            }
          >
            <div 
              ref={previewRef}
              style={{ 
                height: '500px', 
                overflow: 'auto',
                border: '1px solid #d9d9d9',
                borderRadius: '6px',
                backgroundColor: '#f8f9fa',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              {htmlContent ? (
                <div 
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                  style={{ 
                    width: '100%',
                    minHeight: '100%',
                    backgroundColor: 'transparent'
                  }}
                />
              ) : (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center', 
                  height: '100%',
                  width: '100%',
                  color: '#999'
                }}>
                  预览区域 - 请先输入Markdown内容并转换
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MarkdownConverter;