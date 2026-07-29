import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Space, Switch, message, Typography, Row, Col, Tooltip } from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  CompressOutlined,
  ExpandOutlined,
  SaveOutlined,
  FormatPainterOutlined,
  SwapOutlined
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
      const parsed = JSON.parse(inputJson);
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

  // 去除转义字符并格式化
  // 处理类似 {\"key\":\"value\"} 这种格式的 JSON
  const unescapeAndFormat = () => {
    if (!inputJson.trim()) {
      message.warning('请先输入内容');
      return;
    }

    let text = inputJson.trim();
    
    // 清理可能存在的不可见字符（零宽字符、BOM等）
    text = text
      .replace(/^\uFEFF/, '')  // BOM
      .replace(/[\u200B-\u200D\uFEFF]/g, '')  // 零宽字符
      .replace(/[\u00A0]/g, ' ');  // 不间断空格转普通空格
    
    // 如果是被引号包裹的字符串，先去掉外层引号
    if ((text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))) {
      text = text.slice(1, -1);
    }

    // 尝试多种方法
    const tryParse = (str) => {
      const parsed = JSON.parse(str);
      const formatted = JSON.stringify(parsed, null, 2);
      setInputJson(formatted);
      setParsedJson(parsed);
      setError('');
      message.success('已去除转义并格式化');
    };

    // 方法0：先尝试直接解析（可能已经是有效JSON）
    try {
      tryParse(text);
      return;
    } catch (e0) {
      // 不是有效JSON，继续尝试去除转义
    }

    // 方法1：只替换 \" -> "
    try {
      const unescaped = text.replace(/\\"/g, '"');
      tryParse(unescaped);
      return;
    } catch (e1) {
      
      // 方法2：处理可能存在的实际换行符（JSON字符串中不允许的）
      try {
        let unescaped = text.replace(/\\"/g, '"');
        // 将实际的换行符、制表符替换为转义序列
        unescaped = unescaped
          .replace(/\r\n/g, '\\r\\n')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        tryParse(unescaped);
        return;
      } catch (e2) {
        // 方法3：更激进的清理
        try {
          let unescaped = text.replace(/\\"/g, '"');
          // 移除所有控制字符
          // eslint-disable-next-line no-control-regex
          unescaped = unescaped.replace(/[\x00-\x1F\x7F]/g, (match) => {
            // 保留常见的转义序列
            const code = match.charCodeAt(0);
            if (code === 9) return '\\t';  // Tab
            if (code === 10) return '\\n'; // LF
            if (code === 13) return '\\r'; // CR
            return ''; // 移除其他控制字符
          });
          tryParse(unescaped);
          return;
        } catch (e3) {
          message.error('去除转义失败: ' + e1.message);
        }
      }
    }
  };

  // 复制到剪贴板（兼容多种环境）
  const copyToClipboard = async () => {
    if (!inputJson) {
      message.warning('没有内容可复制');
      return;
    }

    try {
      // 优先使用现代 Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inputJson);
        message.success('已复制到剪贴板');
        return;
      }

      // 后备方案：使用 execCommand
      const textArea = document.createElement('textarea');
      textArea.value = inputJson;
      // 避免滚动到页面底部
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        message.success('已复制到剪贴板');
      } else {
        message.error('复制失败，请手动复制');
      }
    } catch (err) {
      console.error('复制失败:', err);
      message.error('复制失败: ' + err.message);
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
            <Tooltip title='去除转义并格式化（处理 \" 等转义字符）'>
              <Button icon={<SwapOutlined />} onClick={unescapeAndFormat} />
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
