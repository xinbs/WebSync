// 基于 grok-js-web 的简化版本
class GrokPattern {
  constructor(expression, id) {
    if (!expression) {
      throw new Error('Expression is required');
    }
    this.id = id || 'anonymous';
    this.expression = String(expression);
    this.fields = [null]; // 第一个位置用于完整匹配
    this.resolved = null;
    this.regexp = null;
  }

  parse(str) {
    if (!str) return null;
    
    try {
      if (!this.regexp) {
        if (!this.resolved) {
          throw new Error('Pattern not resolved');
        }
        this.regexp = new RegExp(this.resolved);
      }

      const match = str.match(this.regexp);
      if (!match) return null;

      const result = {};
      if (match.groups) {
        Object.entries(match.groups).forEach(([key, value]) => {
          if (value !== undefined) {
            result[key] = value;
          }
        });
      }

      return result;
    } catch (error) {
      console.error('Parse error:', error);
      return null;
    }
  }
}

class GrokCollection {
  constructor() {
    this.patterns = new Map();
  }

  // 解析子模式
  resolveSubPatterns(pattern) {
    if (!pattern) return;

    let expression = pattern.expression;
    const subPatternsRegex = /%\{[A-Z0-9_]+(?::[A-Za-z0-9_]+)?(?::[A-Za-z]+)?\}/g;
    const subPatterns = expression.match(subPatternsRegex) || [];

    let changed = false;
    subPatterns.forEach(matched => {
      let subPatternName = matched.substr(2, matched.length - 3);
      const elements = subPatternName.split(':');

      subPatternName = elements[0];
      const fieldName = elements[1];
      const subPattern = this.patterns.get(subPatternName);

      if (!subPattern) {
        console.error(`Error: pattern "${subPatternName}" not found!`);
        return;
      }

      if (!subPattern.resolved) {
        this.resolvePattern(subPattern);
      }

      if (fieldName) {
        expression = expression.replace(matched, `(?<${fieldName}>${subPattern.resolved})`);
      } else {
        expression = expression.replace(matched, subPattern.resolved);
      }
      changed = true;
    });

    if (changed) {
      pattern.resolved = expression;
    }
    return pattern;
  }

  // 解析字段名
  resolveFieldNames(pattern) {
    if (!pattern) return;

    const nestedFieldNamesRegex = /(\(\?<([A-Za-z0-9_]+)>)|\(\?:|\(\?>|\(\?!|\(\?<!|\(|\\\(|\\\)|\)|\[|\\\[|\\\]|\]/g;
    let nestLevel = 0;
    let inRangeDef = 0;
    let matched;

    while ((matched = nestedFieldNamesRegex.exec(pattern.resolved)) !== null) {
      switch (matched[0]) {
        case '(':
          if (!inRangeDef) {
            nestLevel++;
            pattern.fields.push(null);
          }
          break;
        case ')':
          if (!inRangeDef) {
            nestLevel--;
          }
          break;
        case '[':
          inRangeDef++;
          break;
        case ']':
          inRangeDef--;
          break;
        case '(?:':
        case '(?>':
        case '(?!':
        case '(?<!':
          if (!inRangeDef) {
            nestLevel++;
          }
          break;
        default:
          if (matched[2]) {
            nestLevel++;
            pattern.fields.push(matched[2]);
          }
          break;
      }
    }

    return pattern;
  }

  // 解析模式
  resolvePattern(pattern) {
    if (!pattern) return;
    
    // 如果已经解析过，直接返回
    if (pattern.resolved) return pattern;
    
    pattern = this.resolveSubPatterns(pattern);
    if (!pattern.resolved) {
      // 如果没有子模式，直接使用原始表达式
      pattern.resolved = pattern.expression;
    }
    pattern = this.resolveFieldNames(pattern);
    return pattern;
  }

  // 创建新模式
  createPattern(expression, id) {
    if (!expression) {
      console.error('Expression is required');
      return null;
    }

    id = id || `pattern-${this.patterns.size}`;
    
    // 如果模式已存在，直接返回
    if (this.patterns.has(id)) {
      return this.patterns.get(id);
    }

    try {
      const pattern = new GrokPattern(expression, id);
      this.resolvePattern(pattern);
      
      // 如果是临时模式（用于匹配），不保存到模式集合中
      if (!id.startsWith('pattern-')) {
        this.patterns.set(id, pattern);
      }
      
      return pattern;
    } catch (error) {
      console.error(`Failed to create pattern ${id}:`, error);
      return null;
    }
  }

  // 获取模式
  getPattern(id) {
    return this.resolvePattern(this.patterns.get(id));
  }

  // 加载模式文本
  loadPatterns(text) {
    if (!text) return [];
    
    // 如果是对象格式
    if (typeof text === 'object') {
      const ids = [];
      Object.entries(text).forEach(([name, pattern]) => {
        if (this.createPattern(pattern, name)) {
          ids.push(name);
        }
      });
      return ids;
    }
    
    // 如果是文本格式
    const content = String(text);
    const patternLineRegex = /^([A-Z0-9_]+)\s+(.+)/;
    const lines = content.split(/\r?\n/);
    const ids = [];

    // 第一遍：收集所有模式
    const patterns = new Map();
    lines.forEach(line => {
      if (!line.trim() || line.startsWith('#')) return;
      
      const elements = patternLineRegex.exec(line);
      if (elements && elements.length > 2) {
        patterns.set(elements[1], elements[2]);
      }
    });

    // 第二遍：按顺序创建模式
    patterns.forEach((expression, name) => {
      try {
        if (this.createPattern(expression, name)) {
          ids.push(name);
        }
      } catch (error) {
        console.error(`Failed to create pattern ${name}:`, error);
      }
    });

    return ids;
  }

  // 获取模式数量
  count() {
    return this.patterns.size;
  }
}

export default GrokCollection; 