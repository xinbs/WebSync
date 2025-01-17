import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Input, Button, Space, Select, Typography, Row, Col, Table, Tooltip, Tag, message, AutoComplete } from 'antd';
import { CopyOutlined, DeleteOutlined, InfoCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import axios from 'axios';
import { debounce } from 'lodash';
import GrokCollection from './grok';

const { TextArea } = Input;
const { Title, Text } = Typography;

const GrokDebugger = () => {
  const [pattern, setPattern] = useState('');
  const [testText, setTestText] = useState('');
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState('');
  const [customPatterns, setCustomPatterns] = useState({});
  const [suggestions, setSuggestions] = useState([]);
  const [grokPatterns, setGrokPatterns] = useState({});
  const [patternFiles, setPatternFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState(['grok-patterns']);
  const textAreaRef = useRef(null);
  const grokInstance = useRef(new GrokCollection());

  // 加载 pattern 文件列表
  useEffect(() => {
    axios.get('/api/patterns/list')
      .then(response => {
        setPatternFiles(response.data);
      })
      .catch(error => {
        console.error('Failed to load pattern files:', error);
        message.error('加载模式文件列表失败');
      });
  }, []);

  // 修改模式文件加载逻辑
  const loadPatternFiles = useCallback(async () => {
    try {
      // 重置 grok 实例
      grokInstance.current = new GrokCollection();
      
      // 加载所有选中的模式文件
      for (const file of selectedFiles) {
        try {
          console.log(`Loading patterns from ${file}...`);
          const response = await axios.get(`/api/patterns/${file}`);
          const patternsData = response.data;
          
          // 添加调试日志
          console.log('Received patterns data:', {
            type: typeof patternsData,
            value: patternsData
          });
          
          // 处理 JSON 格式的模式数据
          if (typeof patternsData === 'object') {
            // 注册所有模式
            Object.entries(patternsData).forEach(([name, pattern]) => {
              try {
                grokInstance.current.createPattern(pattern, name);
              } catch (e) {
                console.error(`Failed to register pattern ${name}:`, e);
              }
            });
            
            // 更新建议列表
            setGrokPatterns(prev => ({
              ...prev,
              ...patternsData
            }));
          } else {
            // 如果是文本格式，使用原来的处理方式
            const textContent = String(patternsData);
            const ids = grokInstance.current.loadPatterns(textContent);
            console.log(`Loaded patterns: ${ids}`);
            
            const patterns = {};
            textContent.split('\n').forEach(line => {
              const match = line.match(/^([A-Z0-9_]+)\s+(.+)/);
              if (match) {
                patterns[match[1]] = match[2];
              }
            });
            
            setGrokPatterns(prev => ({
              ...prev,
              ...patterns
            }));
          }
        } catch (error) {
          console.error(`Failed to load pattern file ${file}:`, error);
          message.error(`加载模式文件 ${file} 失败`);
        }
      }
      
      // 注册自定义模式
      for (const [name, pattern] of Object.entries(customPatterns)) {
        try {
          grokInstance.current.createPattern(pattern, name);
        } catch (e) {
          console.error(`Failed to register custom pattern ${name}:`, e);
        }
      }

      console.log('Grok patterns registration completed');
      
    } catch (error) {
      console.error('Failed to initialize or load pattern files:', error);
      message.error('初始化 Grok 解析器失败');
    }
  }, [selectedFiles, customPatterns]);

  // 修改匹配逻辑
  const debouncedExecuteMatch = useCallback(
    debounce(() => {
      if (!pattern || !testText || !grokInstance.current) {
        setMatches([]);
        setError('');
        return;
      }

      try {
        console.log('Current pattern:', pattern);
        
        const lines = testText.split('\n');
        const maxLines = 1000;
        const results = [];

        if (lines.length > maxLines) {
          setError(`文本超过最大行数限制 (${maxLines} 行)`);
          return;
        }

        const compiledPattern = grokInstance.current.createPattern(pattern);
        if (!compiledPattern) {
          setError('Grok 模式编译失败');
          return;
        }

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;
          
          try {
            console.log(`Matching line ${i + 1}:`, line);
            const result = compiledPattern.parse(line);
            console.log('Match result:', result);

            if (result) {
              results.push({
                fullMatch: line,
                lineNumber: i + 1,
                groups: Object.entries(result)
                  .map(([key, value]) => ({
                    name: key,
                    value: value,
                    start: line.indexOf(value),
                    length: value?.length || 0
                  }))
              });
            }
          } catch (e) {
            console.error(`Line ${i + 1} match failed:`, e);
          }
        }

        setMatches(results);
        setError(results.length === 0 ? '无匹配结果' : '');
      } catch (err) {
        console.error('Matching error:', err);
        setError(err.message);
        setMatches([]);
      }
    }, 300),
    [pattern, testText]
  );

  // 优化建议列表获取
  const getSuggestions = useCallback((text) => {
    if (!text || text.length < 1) return [];
    
    return Object.entries(grokPatterns)
      .filter(([key]) => key.toLowerCase().includes(text.toLowerCase()))
      .slice(0, 10)
      .map(([key, value]) => ({
        value: key,
        label: (
          <div>
            <Text strong>{key}</Text>
            <Text type="secondary" style={{ marginLeft: 8, fontSize: '12px' }}>
              {value.length > 50 ? value.slice(0, 50) + '...' : value}
            </Text>
          </div>
        )
      }));
  }, [grokPatterns]);

  // 优化自动完成处理
  const handlePatternChange = useCallback((e) => {
    const newValue = e.target.value;
    setPattern(newValue);
    
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastPercentBrace = textBeforeCursor.lastIndexOf('%{');
    
    if (lastPercentBrace !== -1 && cursorPos > lastPercentBrace) {
      const word = textBeforeCursor.slice(lastPercentBrace + 2);
      if (word.length >= 1) {
        setSuggestions(getSuggestions(word));
      } else {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  }, [getSuggestions]);

  // 处理自动完成选择
  const handleSelect = useCallback((value) => {
    const cursorPos = textAreaRef.current?.resizableTextArea?.textArea?.selectionStart || 0;
    const textBeforeCursor = pattern.slice(0, cursorPos);
    const textAfterCursor = pattern.slice(cursorPos);
    const lastWordStart = textBeforeCursor.lastIndexOf('%{');
    
    if (lastWordStart !== -1) {
      const newPattern = textBeforeCursor.slice(0, lastWordStart) + 
        `%{${value}}` + 
        textAfterCursor;
      setPattern(newPattern);
    } else {
      setPattern(textBeforeCursor + `%{${value}}` + textAfterCursor);
    }
  }, [pattern]);

  useEffect(() => {
    loadPatternFiles();
  }, [loadPatternFiles]);

  useEffect(() => {
    debouncedExecuteMatch();
    return () => debouncedExecuteMatch.cancel();
  }, [debouncedExecuteMatch]);

  // 修改添加自定义模式的逻辑
  const addCustomPattern = async () => {
    const name = prompt('输入模式名称：');
    if (name) {
      const value = prompt('输入模式定义：');
      if (value) {
        try {
          const pattern = grokInstance.current.createPattern(value, name);
          if (pattern) {
            setCustomPatterns(prev => ({
              ...prev,
              [name]: value
            }));
          }
        } catch (e) {
          console.error(`Failed to register custom pattern ${name}:`, e);
          message.error('添加自定义模式失败');
        }
      }
    }
  };

  // 复制匹配结果
  const copyResults = () => {
    const resultsText = matches.map(m => 
      `Match: ${m.fullMatch}\n` +
      m.groups.map(g => `  ${g.name}: ${g.value}`).join('\n')
    ).join('\n\n');
    
    navigator.clipboard.writeText(resultsText)
      .then(() => message.success('已复制匹配结果'))
      .catch(() => message.error('复制失败'));
  };

  // 清空所有内容
  const clearAll = () => {
    setPattern('');
    setTestText('');
    setMatches([]);
    setError('');
  };

  // 复制 Grok 规则
  const copyPattern = () => {
    navigator.clipboard.writeText(pattern)
      .then(() => message.success('已复制 Grok 规则'))
      .catch(() => message.error('复制失败'));
  };

  // 清空 Grok 规则
  const clearPattern = () => {
    setPattern('');
    setMatches([]);
    setError('');
  };

  // 复制测试文本
  const copyTestText = () => {
    navigator.clipboard.writeText(testText)
      .then(() => message.success('已复制测试文本'))
      .catch(() => message.error('复制失败'));
  };

  // 清空测试文本
  const clearTestText = () => {
    setTestText('');
    setMatches([]);
    setError('');
  };

  return (
    <Card title={<Title level={4}>Grok 调试工具</Title>}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            value={selectedFiles}
            onChange={setSelectedFiles}
            placeholder="选择模式文件"
            options={patternFiles.map(file => ({
              label: file,
              value: file
            }))}
          />
          
          <div>
            <AutoComplete
              value={pattern}
              options={suggestions}
              style={{ width: '100%' }}
              onSelect={handleSelect}
              onChange={setPattern}
              dropdownMatchSelectWidth={500}
              open={suggestions.length > 0}
              onBlur={() => {
                setTimeout(() => setSuggestions([]), 200);
              }}
            >
              <TextArea
                ref={textAreaRef}
                onChange={handlePatternChange}
                placeholder="输入 Grok 模式，输入 %{ 开始选择变量..."
                autoSize={{ minRows: 3, maxRows: 6 }}
                style={{ 
                  fontFamily: 'monospace',
                  width: '100%'
                }}
              />
            </AutoComplete>
            <Space style={{ marginTop: 8 }}>
              <Button
                icon={<PlusOutlined />}
                onClick={addCustomPattern}
              >
                添加自定义模式
              </Button>
              <Button
                icon={<CopyOutlined />}
                onClick={copyPattern}
                disabled={!pattern}
              >
                复制规则
              </Button>
              <Button
                icon={<DeleteOutlined />}
                onClick={clearPattern}
                disabled={!pattern}
              >
                清空规则
              </Button>
            </Space>
          </div>

          {error && (
            <Text type="danger">
              错误：{error}
            </Text>
          )}
        </Space>

        <Row gutter={16}>
          <Col span={12}>
            <div>
              <TextArea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="输入要测试的文本..."
                autoSize={{ minRows: 8, maxRows: 12 }}
                style={{ fontFamily: 'monospace' }}
              />
              <Space style={{ marginTop: 8 }}>
                <Button
                  icon={<CopyOutlined />}
                  onClick={copyTestText}
                  disabled={!testText}
                >
                  复制文本
                </Button>
                <Button
                  icon={<DeleteOutlined />}
                  onClick={clearTestText}
                  disabled={!testText}
                >
                  清空文本
                </Button>
              </Space>
            </div>
          </Col>
          <Col span={12}>
            <div style={{ 
              minHeight: '200px',
              maxHeight: '400px',
              overflowY: 'auto',
              padding: '16px',
              border: '1px solid #d9d9d9',
              borderRadius: '2px',
              backgroundColor: '#fafafa'
            }}>
              {matches.map((match, index) => (
                <div key={index} style={{ marginBottom: '16px' }}>
                  <div>
                    <Tag color="blue">行 {match.lineNumber}</Tag>
                    <Text code>{match.fullMatch}</Text>
                  </div>
                  {match.groups.length > 0 && (
                    <div style={{ marginLeft: '24px', marginTop: '8px' }}>
                      {match.groups.map((group, gIndex) => (
                        <div key={gIndex}>
                          <Tag color="green">{group.name}</Tag>
                          <Text code>{group.value}</Text>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {matches.length === 0 && (
                <Text type="secondary">无匹配结果</Text>
              )}
            </div>
          </Col>
        </Row>

        <Space>
          <Button
            onClick={copyResults}
            icon={<CopyOutlined />}
            disabled={!matches.length}
          >
            复制匹配结果
          </Button>
          <Button
            danger
            onClick={clearAll}
            icon={<DeleteOutlined />}
          >
            全部清空
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default GrokDebugger; 