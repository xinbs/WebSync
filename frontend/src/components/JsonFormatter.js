import React, { useState } from 'react';
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
        <Row gutter={16}>
          <Col span={12}>
            <TextArea
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              placeholder="请输入要格式化的 JSON..."
              autoSize={{ minRows: 10, maxRows: 20 }}
              style={{ fontFamily: 'monospace' }}
            />
          </Col>
          <Col span={12}>
            <div style={{ height: '100%', minHeight: '200px' }}>
              {formattedJson && (
                <SyntaxHighlighter
                  language="json"
                  style={tomorrow}
                  customStyle={{ margin: 0 }}
                >
                  {formattedJson}
                </SyntaxHighlighter>
              )}
            </div>
          </Col>
        </Row>

        <Space>
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
        </Space>

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