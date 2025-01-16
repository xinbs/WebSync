import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Input, Button, Space, Select, Typography, Row, Col, Table, Tooltip, Tag, message, AutoComplete } from 'antd';
import { CopyOutlined, DeleteOutlined, InfoCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import axios from 'axios';
import { debounce } from 'lodash';

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

  // 解析 Grok 模式
  const parseGrokPattern = useCallback((pattern) => {
    if (!pattern) return '';
    
    const allPatterns = { ...grokPatterns, ...customPatterns };
    let result = pattern;
    let changed = true;
    let iterations = 0;
    const maxIterations = 20; // 减少最大迭代次数

    try {
      while (changed && iterations < maxIterations) {
        changed = false;
        iterations++;
        
        // 一次性替换所有模式，减少循环次数
        const matches = [...result.matchAll(/%\{([^:}]+)(?::([^}]+))?\}/g)];
        if (matches.length === 0) break;

        for (const match of matches) {
          const [fullMatch, key, name] = match;
          const value = allPatterns[key];
          
          if (!value) continue;
          
          if (name) {
            result = result.replace(fullMatch, `(?<${name}>${value})`);
          } else {
            result = result.replace(fullMatch, `(?:${value})`);
          }
          changed = true;
        }
      }

      if (iterations >= maxIterations) {
        console.warn('达到最大迭代次数，可能存在循环引用');
      }

      return result;
    } catch (err) {
      console.error('解析 Grok 模式错误:', err);
      return pattern;
    }
  }, [grokPatterns, customPatterns]);

  // 优化执行匹配的逻辑
  const debouncedExecuteMatch = useCallback(
    debounce(() => {
      if (!pattern || !testText) {
        setMatches([]);
        setError('');
        return;
      }

      try {
        const parsedPattern = parseGrokPattern(pattern);
        console.log('Final parsed pattern:', parsedPattern);
        
        // 如果解析后的模式与原模式相同，说明没有匹配到任何 Grok 模式
        if (parsedPattern === pattern && pattern.includes('%{')) {
          setError('未找到匹配的 Grok 模式');
          setMatches([]);
          return;
        }

        const regex = new RegExp(parsedPattern);  // 移除 g 标志，每行只匹配一次
        const results = [];
        const lines = testText.split('\n');
        const maxLines = 1000; // 限制最大处理行数

        if (lines.length > maxLines) {
          setError(`文本超过最大行数限制 (${maxLines} 行)`);
          return;
        }

        // 按行处理文本
        lines.forEach((line, lineNumber) => {
          if (!line.trim()) return; // 跳过空行
          
          const match = line.match(regex);
          if (match) {
            if (match.groups) {
              results.push({
                fullMatch: match[0],
                lineNumber: lineNumber + 1,
                groups: Object.entries(match.groups)
                  .filter(([_, value]) => value !== undefined)
                  .map(([key, value]) => ({
                    name: key,
                    value: value,
                    start: match.index + match[0].indexOf(value),
                    length: value?.length || 0
                  }))
              });
            } else {
              results.push({
                fullMatch: match[0],
                lineNumber: lineNumber + 1,
                groups: []
              });
            }
          }
        });

        setMatches(results);
        setError(results.length === 0 ? '无匹配结果' : '');
      } catch (err) {
        console.error('Matching error:', err);
        setError(err.message);
        setMatches([]);
      }
    }, 300),
    [pattern, testText, parseGrokPattern]
  );

  // 优化模式文件加载
  const loadPatternFiles = useCallback(async () => {
    try {
      const patterns = {};
      const requests = selectedFiles.map(file => 
        axios.get(`/api/patterns/${file}`)
          .catch(error => {
            console.error(`Failed to load pattern file ${file}:`, error);
            return { data: {} };
          })
      );
      
      const responses = await Promise.all(requests);
      responses.forEach(response => {
        Object.assign(patterns, response.data);
      });
      
      setGrokPatterns(patterns);
    } catch (error) {
      console.error('Failed to load pattern files:', error);
      message.error('加载模式文件失败');
    }
  }, [selectedFiles]);

  // 优化建议列表获取
  const getSuggestions = useCallback((text) => {
    if (!text || text.length < 1) return [];
    
    // 限制搜索范围，只在有限的模式中搜索
    return Object.entries(grokPatterns)
      .filter(([key]) => key.toLowerCase().includes(text.toLowerCase()))
      .slice(0, 10) // 减少建议数量以提高性能
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
    
    // 只在输入 %{ 后的情况下才触发建议
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const lastPercentBrace = textBeforeCursor.lastIndexOf('%{');
    
    if (lastPercentBrace !== -1 && cursorPos > lastPercentBrace) {
      const word = textBeforeCursor.slice(lastPercentBrace + 2);
      // 只有当输入长度大于 1 时才显示建议
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

  // 添加自定义模式
  const addCustomPattern = () => {
    const name = prompt('输入模式名称：');
    if (name) {
      const value = prompt('输入模式定义：');
      if (value) {
        setCustomPatterns(prev => ({
          ...prev,
          [name]: value
        }));
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