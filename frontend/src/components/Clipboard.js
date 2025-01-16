import React from 'react';
import { Card, Typography, Button, Space, Tooltip } from 'antd';
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

const Clipboard = ({ items, onCopy, onDelete }) => {
  return (
    <div style={{ width: '100%' }}>
      {items.map((item, index) => (
        <Card 
          key={index}
          style={{ 
            marginBottom: 16,
            position: 'relative',
            width: '100%'
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
              <Tooltip title="复制">
                <Button
                  type="text"
                  icon={<CopyOutlined />}
                  onClick={() => onCopy(item)}
                />
              </Tooltip>
              <Tooltip title="删除">
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => onDelete(index)}
                />
              </Tooltip>
            </Space>
          </div>

          {/* 文本内容 */}
          <div style={{
            maxWidth: '100%',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            fontFamily: 'monospace',
            fontSize: '14px',
            backgroundColor: '#f5f5f5',
            padding: '8px',
            borderRadius: '4px',
            maxHeight: '300px' // 限制最大高度
          }}>
            <Text>{item}</Text>
          </div>
        </Card>
      ))}
      {items.length === 0 && (
        <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
          暂无内容
        </Text>
      )}
    </div>
  );
};

export default Clipboard;