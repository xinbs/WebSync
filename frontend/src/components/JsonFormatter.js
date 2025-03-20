import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Space, Switch, message, Typography, Row, Col } from 'antd';
import { CopyOutlined, DeleteOutlined, CompressOutlined, ExpandOutlined } from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

const { TextArea } = Input;
const { Title } = Typography;

const JsonFormatter = () => {
  const [inputJson, setInputJson] = useState('');
  const [formattedJson, setFormattedJson] = useState('');
  const [keepEscape, setKeepEscape] = useState(false);
  const [error, setError] = useState('');
  const [wrapLines, setWrapLines] = useState(true);
  const [formattedLines, setFormattedLines] = useState([]);

  // 格式化 JSON 并处理高亮
  useEffect(() => {
    if (formattedJson) {
      const lines = formattedJson.split('\n');
      const formattedResult = lines.map(line => {
        // 属性名
        let formattedLine = line.replace(/"([^"]+)":/g, (match, p1) => {
          return `<span class="property-name">"${p1}"</span>:`;
        });
        
        // 字符串值
        formattedLine = formattedLine.replace(/: "([^"]+)"/g, (match, p1) => {
          return `: <span class="string-value">"${p1}"</span>`;
        });
        
        // 数字
        formattedLine = formattedLine.replace(/: (\d+)/g, (match, p1) => {
          return `: <span class="number-value">${p1}</span>`;
        });
        
        // 布尔值和null
        formattedLine = formattedLine.replace(/: (true|false|null)/g, (match, p1) => {
          return `: <span class="keyword-value">${p1}</span>`;
        });
        
        return formattedLine;
      });
      
      setFormattedLines(formattedResult);
    } else {
      setFormattedLines([]);
    }
  }, [formattedJson]);

  // 格式化 JSON
  const formatJson = (compress = false) => {
    try {
      let parsed;
      // 如果输入是空的，直接返回
      if (!inputJson.trim()) {
        setFormattedJson('');
        setError('');
        return;
      }

      // 尝试解析 JSON
      try {
        parsed = JSON.parse(inputJson);
      } catch (e) {
        // 如果解析失败，尝试解析转义后的字符串
        try {
          parsed = JSON.parse(JSON.stringify(eval('(' + inputJson + ')')));
        } catch (e2) {
          throw new Error('无效的 JSON 格式');
        }
      }

      // 格式化 JSON
      let formatted;
      if (compress) {
        // 压缩模式
        formatted = JSON.stringify(parsed);
      } else {
        // 美化模式
        formatted = JSON.stringify(parsed, null, 2);
      }

      // 处理转义
      if (!keepEscape) {
        formatted = formatted.replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\');
      }

      setFormattedJson(formatted);
      setError('');
    } catch (err) {
      setError(err.message);
      message.error(err.message);
    }
  };

  // 复制到剪贴板
  const copyToClipboard = () => {
    if (formattedJson) {
      navigator.clipboard.writeText(formattedJson)
        .then(() => message.success('已复制到剪贴板'))
        .catch(() => message.error('复制失败'));
    }
  };

  // 清空内容
  const clearContent = () => {
    setInputJson('');
    setFormattedJson('');
    setError('');
  };

  return (
    <Card title={<Title level={4}>JSON 格式化工具</Title>}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Row gutter={20}>
          <Col span={9}>
            <TextArea
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              placeholder="请输入要格式化的 JSON..."
              autoSize={{ minRows: 15, maxRows: formattedJson && formattedJson.split('\n').length > 30 ? 40 : 30 }}
              style={{ 
                fontFamily: 'monospace',
                width: '100%',
                resize: 'vertical',
                minHeight: '300px',
              }}
            />
          </Col>
          <Col span={15}>
            <div 
              className={`json-output ${wrapLines ? 'wrap-enabled' : ''}`}
              style={{ 
                height: 'auto', 
                minHeight: '300px', 
                maxHeight: formattedJson && formattedJson.split('\n').length > 30 ? '800px' : '600px',
                overflow: 'auto',
                backgroundColor: '#1e1e1e',
                borderRadius: '4px',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {formattedJson && (
                wrapLines ? (
                  <div style={{
                    padding: '16px',
                    fontFamily: 'Monaco, Consolas, monospace',
                    fontSize: '14px',
                    color: '#fff',
                    lineHeight: '1.5',
                    flex: '1',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {formattedLines.map((line, index) => (
                      <div key={index} style={{ display: 'flex', minHeight: '22px' }}>
                        <span style={{ 
                          color: '#75715e', 
                          minWidth: '40px', 
                          marginRight: '8px', 
                          userSelect: 'none',
                          textAlign: 'right' 
                        }}>
                          {index + 1}
                        </span>
                        <span 
                          style={{ 
                            flex: 1, 
                            whiteSpace: 'pre-wrap', 
                            wordBreak: 'break-all'
                          }}
                          dangerouslySetInnerHTML={{ __html: line }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <SyntaxHighlighter
                    language="json"
                    style={tomorrow}
                    customStyle={{ 
                      margin: 0,
                      fontSize: '14px',
                      flex: '1',
                      height: '100%'
                    }}
                    showLineNumbers
                  >
                    {formattedJson}
                  </SyntaxHighlighter>
                )
              )}
            </div>

            <style>{`
              .json-output .property-name { color: #e6db74; }
              .json-output .string-value { color: #a6e22e; }
              .json-output .number-value { color: #ae81ff; }
              .json-output .keyword-value { color: #66d9ef; }
            `}</style>
          </Col>
        </Row>

        <Row>
          <Col span={24}>
            <Space wrap>
              <Button
                type="primary"
                onClick={() => formatJson(false)}
                icon={<ExpandOutlined />}
              >
                格式化
              </Button>
              <Button
                onClick={() => formatJson(true)}
                icon={<CompressOutlined />}
              >
                压缩
              </Button>
              <Button
                onClick={copyToClipboard}
                disabled={!formattedJson}
                icon={<CopyOutlined />}
              >
                复制结果
              </Button>
              <Button
                danger
                onClick={clearContent}
                icon={<DeleteOutlined />}
              >
                清空
              </Button>
              <Space>
                保留转义
                <Switch
                  checked={keepEscape}
                  onChange={setKeepEscape}
                  size="small"
                />
              </Space>
              <Space>
                自动换行
                <Switch
                  checked={wrapLines}
                  onChange={setWrapLines}
                  size="small"
                  defaultChecked
                />
              </Space>
            </Space>
          </Col>
        </Row>

        {error && (
          <Typography.Text type="danger">
            错误：{error}
          </Typography.Text>
        )}
      </Space>
    </Card>
  );
};

export default JsonFormatter; 