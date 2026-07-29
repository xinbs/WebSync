import React, { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, Upload, message, Space, Divider, Row, Col, Typography, Switch, Select } from 'antd';
import { UploadOutlined, DownloadOutlined, FileImageOutlined, FileTextOutlined, SettingOutlined } from '@ant-design/icons';
import { marked } from 'marked';
import { toPng } from 'html-to-image';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

const { TextArea } = Input;
const { Title, Text } = Typography;

const MarkdownConverter = () => {
  const [markdownText, setMarkdownText] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(false);
  const previewRef = useRef(null);
  
  // 水印相关状态
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.3);
  const [watermarkSize, setWatermarkSize] = useState('medium');
  
  // 从localStorage加载水印设置
  useEffect(() => {
    const savedSettings = localStorage.getItem('watermarkSettings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        setWatermarkEnabled(settings.enabled || false);
        setWatermarkText(settings.text || '');
        setWatermarkOpacity(settings.opacity || 0.3);
        setWatermarkSize(settings.size || 'medium');
      } catch (error) {
        console.error('Failed to load watermark settings:', error);
      }
    }
  }, []);
  
  // 保存水印设置到localStorage
  const saveWatermarkSettings = (enabled, text, opacity, size) => {
    const settings = {
      enabled,
      text,
      opacity,
      size
    };
    localStorage.setItem('watermarkSettings', JSON.stringify(settings));
  };
  
  // 生成水印样式
   const getWatermarkStyle = () => {
     if (!watermarkEnabled || !watermarkText.trim()) return '';
     
     const fontSizes = {
       small: '14px',
       medium: '16px', 
       large: '18px'
     };
     
     return `
       .watermark {
             position: absolute;
             bottom: 10px;
             right: 10px;
          display: inline-block;
          width: auto;
         font-family: 'STKaiti', '楷体', 'KaiTi', 'Brush Script MT', cursive, serif;
         font-size: ${fontSizes[watermarkSize]};
         font-weight: bold;
         color: rgba(255, 255, 255, 0.95);
         background: linear-gradient(135deg, 
           rgba(45, 55, 72, ${watermarkOpacity * 0.9}) 0%, 
           rgba(74, 85, 104, ${watermarkOpacity * 0.8}) 100%
         );
         padding: 4px 8px;
         border-radius: 6px;
         backdrop-filter: blur(8px) saturate(150%);
         -webkit-backdrop-filter: blur(8px) saturate(150%);
         border: 1px solid rgba(203, 213, 224, 0.6);
         box-shadow: 
           0 4px 12px rgba(0, 0, 0, 0.1),
           0 1px 3px rgba(0, 0, 0, 0.08);
         pointer-events: none;
         user-select: none;
         z-index: 1000;
         transition: all 0.3s ease;
         letter-spacing: 1px;
         text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
         font-style: italic;
         transform: translateZ(0);
       }
       
       .watermark::before {
         content: '';
         position: absolute;
         top: 0;
         left: 0;
         right: 0;
         bottom: 0;
         background: linear-gradient(135deg, 
           rgba(99, 179, 237, 0.08) 0%, 
           rgba(139, 195, 74, 0.06) 25%,
           rgba(255, 193, 7, 0.04) 50%,
           rgba(233, 30, 99, 0.06) 75%,
           rgba(156, 39, 176, 0.08) 100%
         );
         border-radius: 6px;
         opacity: 0.6;
         transition: opacity 0.4s ease;
       }
       
       .watermark::after {
         content: '';
         position: absolute;
         top: -2px;
         left: -2px;
         right: -2px;
         bottom: -2px;
         background: linear-gradient(135deg, 
           rgba(255, 255, 255, 0.3) 0%,
           rgba(255, 255, 255, 0.1) 50%,
           rgba(255, 255, 255, 0.2) 100%
         );
         border-radius: 8px;
         z-index: -1;
         opacity: 0.5;
       }
       
       .watermark:hover::before {
         opacity: 1;
       }
       
       .watermark:hover {
         transform: translateY(-2px) translateZ(0);
         box-shadow: 
           0 6px 20px rgba(0, 0, 0, 0.15),
           0 2px 6px rgba(0, 0, 0, 0.1);
       }
       
       @media print {
         .watermark {
           position: absolute;
           background: rgba(248, 250, 252, 0.8);
           backdrop-filter: none;
           border: 1px solid rgba(0, 0, 0, 0.1);
           box-shadow: none;
           transform: none;
         }
         
         .watermark::before {
           display: none;
         }
       }
     `;
   };
  
  // 生成水印HTML
  const getWatermarkHtml = () => {
    if (!watermarkEnabled || !watermarkText.trim()) return '';
    const safeText = DOMPurify.sanitize(watermarkText, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });
    return `<div class="watermark">${safeText}</div>`;
  };

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
    <script src="https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.min.js"></script>
    <style>
        body {
            font-family: 'Microsoft YaHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
            line-height: 1.6;
            box-sizing: border-box;
            min-height: 100vh;
        }
        
        .container {
            background: white;
            border-radius: 12px;
            padding: 20px;
            margin: 10px;
            width: calc(100% - 20px);
            max-width: 100%;
            box-sizing: border-box;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        
        /* 只在独立HTML文件中应用宽度限制，预览时不限制 */
        body:not([data-preview]) .container {
            max-width: 1000px;
            margin: 0 auto;
        }
        
        .container {
            position: relative;
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
        .mermaid {
            text-align: center;
            margin: 30px 0;
            background: #fafafa;
            border: 2px solid #e1e8ed;
            border-radius: 10px;
            padding: 25px;
        }
        ${getWatermarkStyle()}
    </style>
</head>
<body>
    <div class="container">
        ${content}
        ${getWatermarkHtml()}
    </div>
    <script>
        mermaid.initialize({
          startOnLoad: true,
          theme: 'default',
          securityLevel: 'sandbox'
        });
    </script>
</body>
</html>`;
  };

  // 处理HTML中的mermaid代码块
  const processMermaidInHtml = (html) => {
    console.log('Processing mermaid blocks in HTML...');
    // 匹配被marked转换后的mermaid代码块: <pre><code class="language-mermaid">...</code></pre>
    const result = html.replace(/<pre><code class="language-mermaid">(.*?)<\/code><\/pre>/gs, (match, code) => {
      console.log('Found mermaid block in HTML:', code.substring(0, 50) + '...');
      // 保留 HTML 实体，使图表源码始终作为文本进入 DOM。
      return `<div class="mermaid">${code.trim()}</div>`;
    });
    console.log('Mermaid HTML processing complete');
    return result;
  };

  // 处理原始markdown中的mermaid代码块（保留作为备用）
  const processMermaidBlocks = (text) => {
    console.log('Processing mermaid blocks in text...');
    const result = text.replace(/```mermaid\s*\n([\s\S]*?)\n```/g, (match, code) => {
      console.log('Found mermaid block:', code.substring(0, 50) + '...');
      return `<div class="mermaid">${code.trim()}</div>`;
    });
    console.log('Mermaid processing complete');
    return result;
  };

  // 转换markdown为HTML
  const convertToHtml = () => {
    if (!markdownText.trim()) {
      message.warning('请输入Markdown内容');
      return;
    }

    try {
      // 先用marked转换markdown
      const html = marked(markdownText);
      // 然后处理转换后HTML中的mermaid代码块
      const processedHtml = processMermaidInHtml(html);
      const cleanHtml = DOMPurify.sanitize(processedHtml, {
        USE_PROFILES: { html: true }
      });
      const styledHtml = getStyledHtml(cleanHtml);
      setHtmlContent(styledHtml);
      message.success('转换成功！');
    } catch (error) {
      message.error('转换失败：' + error.message);
    }
  };

  // 使用本地依赖并在隔离 iframe 中渲染 Mermaid，避免执行图表中的 HTML。
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'sandbox'
    });
  }, []);

  // 处理预览区域的mermaid渲染
  useEffect(() => {
    if (htmlContent) {
      // 延迟执行以确保DOM已更新
      setTimeout(() => {
        try {
          const mermaidElements = document.querySelectorAll('.mermaid');
          console.log('Found mermaid elements:', mermaidElements.length);
          if (mermaidElements.length > 0) {
            // 清除之前的渲染
            mermaidElements.forEach(element => {
              if (element.getAttribute('data-processed') !== 'true') {
                console.log('Processing mermaid element:', element.textContent.substring(0, 50));
              }
            });
            mermaid.run({ nodes: mermaidElements });
          }
        } catch (error) {
          console.error('Mermaid rendering error:', error);
        }
      }, 200);
    }
  }, [htmlContent]);

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
          
          {/* 水印设置面板 */}
          <Card 
            title={
              <Space>
                <SettingOutlined />
                水印设置
              </Space>
            } 
            size="small" 
            style={{ marginTop: '16px' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text>启用水印</Text>
                <Switch 
                  checked={watermarkEnabled}
                  onChange={(checked) => {
                    setWatermarkEnabled(checked);
                    saveWatermarkSettings(checked, watermarkText, watermarkOpacity, watermarkSize);
                  }}
                />
              </div>
              
              {watermarkEnabled && (
                <>
                  <div>
                    <Text style={{ display: 'block', marginBottom: '8px' }}>水印内容</Text>
                    <Input
                      value={watermarkText}
                      onChange={(e) => {
                        setWatermarkText(e.target.value);
                        saveWatermarkSettings(watermarkEnabled, e.target.value, watermarkOpacity, watermarkSize);
                      }}
                      placeholder="请输入水印文字"
                      maxLength={50}
                    />
                  </div>
                  
                  <div>
                    <Text style={{ display: 'block', marginBottom: '8px' }}>透明度: {Math.round(watermarkOpacity * 100)}%</Text>
                    <input
                       type="range"
                       min="0.2"
                       max="0.8"
                       step="0.1"
                       value={watermarkOpacity}
                       onChange={(e) => {
                         const opacity = parseFloat(e.target.value);
                         setWatermarkOpacity(opacity);
                         saveWatermarkSettings(watermarkEnabled, watermarkText, opacity, watermarkSize);
                       }}
                       style={{ 
                         width: '100%',
                         height: '6px',
                         borderRadius: '3px',
                         background: 'linear-gradient(to right, #e2e8f0, #3b82f6)',
                         outline: 'none',
                         cursor: 'pointer'
                       }}
                     />
                  </div>
                  
                  <div>
                    <Text style={{ display: 'block', marginBottom: '8px' }}>字体大小</Text>
                    <Select
                      value={watermarkSize}
                      onChange={(size) => {
                        setWatermarkSize(size);
                        saveWatermarkSettings(watermarkEnabled, watermarkText, watermarkOpacity, size);
                      }}
                      style={{ width: '100%' }}
                      options={[
                        { value: 'small', label: '小' },
                        { value: 'medium', label: '中' },
                        { value: 'large', label: '大' }
                      ]}
                    />
                  </div>
                  
                  <div style={{ padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      💡 水印将显示在预览区域右下角，不影响阅读体验
                    </Text>
                  </div>
                </>
              )}
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
                <div style={{ width: '100%', minHeight: '100%', backgroundColor: 'transparent', position: 'relative', padding: '20px' }}>
                  <style>
                    {`
                      .mermaid {
                        text-align: center;
                        margin: 30px 0;
                        background: #fafafa;
                        border: 2px solid #e1e8ed;
                        border-radius: 10px;
                        padding: 25px;
                      }
                      ${getWatermarkStyle()}
                    `}
                  </style>
                  <div 
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                    data-preview="true"
                    style={{ position: 'relative' }}
                  />
                  {watermarkEnabled && watermarkText.trim() && (
                     <div 
                       className="watermark"
                       style={{
                         position: 'absolute',
                         bottom: '10px',
                         right: '10px',
                       display: 'inline-block',
                       width: 'auto',
                       fontFamily: "'STKaiti', '楷体', 'KaiTi', 'Brush Script MT', cursive, serif",
                       fontSize: watermarkSize === 'small' ? '14px' : watermarkSize === 'large' ? '18px' : '16px',
                       fontWeight: 'bold',
                       fontStyle: 'italic',
                       color: 'rgba(255, 255, 255, 0.95)',
                       background: `linear-gradient(135deg, rgba(45, 55, 72, ${watermarkOpacity * 0.9}) 0%, rgba(74, 85, 104, ${watermarkOpacity * 0.8}) 100%)`,
                       padding: '4px 8px',
                       borderRadius: '6px',
                       backdropFilter: 'blur(8px) saturate(150%)',
                       WebkitBackdropFilter: 'blur(8px) saturate(150%)',
                       border: '1px solid rgba(203, 213, 224, 0.6)',
                       boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)',
                       pointerEvents: 'none',
                       userSelect: 'none',
                       zIndex: 1000,
                       transition: 'all 0.3s ease',
                       letterSpacing: '1px',
                       textShadow: '0 1px 2px rgba(255, 255, 255, 0.8)',
                       transform: 'translateZ(0)'
                     }}
                   >
                     {watermarkText}
                   </div>
                 )}
                </div>
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
