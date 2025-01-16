import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Space, Switch, message, Typography, Row, Col, Table, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

const { TextArea } = Input;
const { Title, Text } = Typography;

const RegexTester = () => {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [testText, setTestText] = useState('');
  const [matches, setMatches] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const [highlightedText, setHighlightedText] = useState('');

  // 更新高亮文本
  const updateHighlight = (text, matches) => {
    if (!matches.length) {
      setHighlightedText(text);
      return;
    }

    let lastIndex = 0;
    let highlighted = '';
    matches.forEach((match, index) => {
      // 添加匹配前的文本
      highlighted += text.slice(lastIndex, match.index);
      // 添加带高亮的匹配文本
      highlighted += `<span class="regex-match match-${index % 5}">${match[0]}</span>`;
      lastIndex = match.index + match[0].length;
    });
    // 添加剩余文本
    highlighted += text.slice(lastIndex);
    setHighlightedText(highlighted);
  };

  // 执行正则匹配
  const executeRegex = () => {
    if (!pattern || !testText) {
      setMatches([]);
      setGroups([]);
      setError('');
      updateHighlight(testText, []);
      return;
    }

    try {
      const regex = new RegExp(pattern, flags);
      const allMatches = [];
      const allGroups = [];
      let match;

      // 重置 lastIndex 以确保完整匹配
      regex.lastIndex = 0;

      while ((match = regex.exec(testText)) !== null) {
        // 防止零长度匹配导致的无限循环
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }

        allMatches.push({
          ...match,
          index: match.index,
          length: match[0].length
        });

        // 处理分组
        if (match.length > 1) {
          const groupInfo = {
            fullMatch: match[0],
            groups: match.slice(1).map((group, i) => ({
              index: i + 1,
              value: group,
              start: match.index + match[0].indexOf(group),
              length: group?.length || 0
            }))
          };
          allGroups.push(groupInfo);
        }
      }

      setMatches(allMatches);
      setGroups(allGroups);
      setError('');
      updateHighlight(testText, allMatches);
    } catch (err) {
      setError(err.message);
      setMatches([]);
      setGroups([]);
      updateHighlight(testText, []);
    }
  };

  // 当输入改变时自动执行匹配
  useEffect(() => {
    executeRegex();
  }, [pattern, flags, testText]);

  // 复制匹配结果
  const copyResults = () => {
    const resultsText = matches.map(m => m[0]).join('\n');
    navigator.clipboard.writeText(resultsText)
      .then(() => message.success('已复制匹配结果'))
      .catch(() => message.error('复制失败'));
  };

  // 清空所有内容
  const clearAll = () => {
    setPattern('');
    setFlags('g');
    setTestText('');
    setMatches([]);
    setGroups([]);
    setError('');
    setHighlightedText('');
  };

  // 匹配结果列
  const matchColumns = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 80,
      render: (_, __, index) => index + 1
    },
    {
      title: '匹配内容',
      dataIndex: '0',
      key: 'content'
    },
    {
      title: '位置',
      dataIndex: 'index',
      key: 'position',
      width: 120,
      render: (index, record) => `${index}-${index + record[0].length}`
    },
    {
      title: '长度',
      dataIndex: 'length',
      key: 'length',
      width: 80
    }
  ];

  // 分组结果列
  const groupColumns = [
    {
      title: '组号',
      dataIndex: 'index',
      key: 'groupIndex',
      width: 80
    },
    {
      title: '内容',
      dataIndex: 'value',
      key: 'groupContent'
    },
    {
      title: '位置',
      key: 'groupPosition',
      width: 120,
      render: (_, record) => `${record.start}-${record.start + record.length}`
    }
  ];

  return (
    <Card title={<Title level={4}>正则表达式测试工具</Title>}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="输入正则表达式..."
              style={{ width: 400 }}
              prefix="/^"
              suffix="$/"
            />
            <Input
              value={flags}
              onChange={(e) => setFlags(e.target.value)}
              placeholder="标志..."
              style={{ width: 100 }}
              suffix={
                <Tooltip title="g: 全局匹配&#10;i: 忽略大小写&#10;m: 多行匹配&#10;s: 点号匹配所有字符&#10;u: Unicode&#10;y: 粘性匹配">
                  <InfoCircleOutlined style={{ color: 'rgba(0,0,0,.45)' }} />
                </Tooltip>
              }
            />
            <Button
              type="primary"
              onClick={executeRegex}
            >
              测试
            </Button>
            <Button
              onClick={copyResults}
              icon={<CopyOutlined />}
              disabled={!matches.length}
            >
              复制结果
            </Button>
            <Button
              danger
              onClick={clearAll}
              icon={<DeleteOutlined />}
            >
              清空
            </Button>
          </Space>

          {error && (
            <Text type="danger">
              错误：{error}
            </Text>
          )}
        </Space>

        <Row gutter={16}>
          <Col span={12}>
            <TextArea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="输入要测试的文本..."
              autoSize={{ minRows: 8, maxRows: 12 }}
              style={{ fontFamily: 'monospace' }}
            />
          </Col>
          <Col span={12}>
            <div 
              style={{ 
                minHeight: '150px',
                padding: '10px',
                border: '1px solid #d9d9d9',
                borderRadius: '2px',
                backgroundColor: '#fafafa',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}
              dangerouslySetInnerHTML={{ __html: highlightedText }}
            />
          </Col>
        </Row>

        {matches.length > 0 && (
          <>
            <Title level={5}>匹配结果 ({matches.length})</Title>
            <Table
              dataSource={matches}
              columns={matchColumns}
              size="small"
              pagination={false}
              scroll={{ y: 200 }}
            />
          </>
        )}

        {groups.length > 0 && groups[0].groups.length > 0 && (
          <>
            <Title level={5}>分组结果</Title>
            <Table
              dataSource={groups.flatMap(g => g.groups)}
              columns={groupColumns}
              size="small"
              pagination={false}
              scroll={{ y: 200 }}
            />
          </>
        )}
      </Space>

      <style>
        {`
          .regex-match {
            border-radius: 2px;
            padding: 1px 0;
          }
          .match-0 { background-color: #ffeb3b50; }
          .match-1 { background-color: #4caf5050; }
          .match-2 { background-color: #2196f350; }
          .match-3 { background-color: #9c27b050; }
          .match-4 { background-color: #ff572250; }
        `}
      </style>
    </Card>
  );
};

export default RegexTester; 