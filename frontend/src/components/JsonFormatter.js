import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Space, Switch, message, Typography, Row, Col, Tooltip } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  CompressOutlined,
  ExpandOutlined,
  SaveOutlined,
  FormatPainterOutlined
} from '@ant-design/icons';
import ReactJson from 'react-json-view';

const { TextArea } = Input;
const { Title } = Typography;

const JsonFormatter = () => {
  const [inputJson, setInputJson] = useState('');
  const [parsedJson, setParsedJson] = useState(null);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState('monokai');

  // 监听输入变化，尝试自动解析
  useEffect(() => {
    if (!inputJson.trim()) {
      setParsedJson(null);
      setError('');
      return;
    }

    try {
      // 尝试解析 JSON
      let parsed;
      try {
        parsed = JSON.parse(inputJson);
      } catch (e) {
        // 尝试解析可能包含转义字符的 JSON
        // 注意：eval 有安全风险，但在纯前端工具且用户明确输入的情况下通常可接受，或者可以用更安全的方式
        // 这里为了保持原有功能的兼容性，暂时保留，但建议后续改进
        parsed = JSON.parse(JSON.stringify(eval('(' + inputJson + ')')));
      }
      setParsedJson(parsed);
      setError('');
    } catch (err) {
      // 解析失败时不清除旧的 parsedJson，只显示错误，或者清除？
      // 这里选择不清除，但显示错误
      setError(err.message);
    }
  }, [inputJson]);

  // 格式化输入框中的 JSON
  const formatInput = (compress = false) => {
    if (!parsedJson) return;
    try {
      const formatted = compress
        ? JSON.stringify(parsedJson)
        : JSON.stringify(parsedJson, null, 2);
      setInputJson(formatted);
      message.success(compress ? '已压缩' : '已格式化');
    } catch (err) {
      message.error('格式化失败');
    }
  };

  // 复制到剪贴板
  const copyToClipboard = () => {
    if (inputJson) {
      navigator.clipboard.writeText(inputJson)
        .then(() => message.success('已复制到剪贴板'))
        .catch(() => message.error('复制失败'));
    }
  };

  // 清空内容
  const clearContent = () => {
    setInputJson('');
    setParsedJson(null);
    setError('');
  };

  // 保存为文件
  const saveAsFile = () => {
    if (!inputJson) return;
    const blob = new Blob([inputJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `json_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={4} style={{ margin: 0 }}>JSON 可视化编辑器</Title>
          <Space>
            <Tooltip title="格式化">
              <Button icon={<FormatPainterOutlined />} onClick={() => formatInput(false)} />
            </Tooltip>
            <Tooltip title="压缩">
              <Button icon={<CompressOutlined />} onClick={() => formatInput(true)} />
            </Tooltip>
            <Tooltip title="复制">
              <Button icon={<CopyOutlined />} onClick={copyToClipboard} />
            </Tooltip>
            <Tooltip title="保存为文件">
              <Button icon={<SaveOutlined />} onClick={saveAsFile} />
            </Tooltip>
            <Tooltip title="清空">
              <Button danger icon={<DeleteOutlined />} onClick={clearContent} />
            </Tooltip>
          </Space>
        </div>
      }
      bodyStyle={{ padding: 0 }}
    >
      <Row style={{ height: 'calc(100vh - 140px)', minHeight: '600px' }}>
        {/* 左侧输入区 */}
        <Col span={10} style={{ height: '100%', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
            <Typography.Text strong>JSON 源码</Typography.Text>
          </div>
          <TextArea
            value={inputJson}
            onChange={(e) => setInputJson(e.target.value)}
            placeholder="在此输入 JSON 字符串..."
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              borderRadius: 0,
              padding: '12px',
              fontFamily: 'Monaco, Consolas, monospace',
              fontSize: '14px',
              backgroundColor: '#fff'
            }}
            spellCheck={false}
          />
          {error && (
            <div style={{ padding: '8px 12px', background: '#fff1f0', borderTop: '1px solid #ffccc7', color: '#cf1322' }}>
              错误：{error}
            </div>
          )}
        </Col>

        {/* 右侧展示区 */}
        <Col span={14} style={{ height: '100%', overflow: 'auto', backgroundColor: '#272822' }}>
          <div style={{ padding: '8px', background: '#3e3d32', borderBottom: '1px solid #49483e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography.Text style={{ color: '#f8f8f2' }} strong>树形视图</Typography.Text>
            <Space>
              <Switch
                checkedChildren="展开"
                unCheckedChildren="折叠"
                checked={!collapsed}
                onChange={(checked) => setCollapsed(!checked)}
              />
            </Space>
          </div>
          <div style={{ padding: '12px' }}>
            {parsedJson ? (
              <ReactJson
                src={parsedJson}
                theme={theme}
                iconStyle="triangle"
                collapsed={collapsed}
                enableClipboard={true}
                displayDataTypes={true}
                displayObjectSize={true}
                onEdit={false}
                onAdd={false}
                onDelete={false}
                style={{ backgroundColor: 'transparent' }}
              />
            ) : (
              <div style={{ color: '#75715e', textAlign: 'center', marginTop: '100px' }}>
                等待输入有效的 JSON...
              </div>
            )}
          </div>
        </Col>
      </Row>
    </Card>
  );
};

export default JsonFormatter; 