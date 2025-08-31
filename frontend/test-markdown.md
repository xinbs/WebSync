# Markdown转换工具测试

## 功能特点

这是一个**强大的Markdown转换工具**，支持以下功能：

- ✅ Markdown文本输入
- ✅ 文件上传支持
- ✅ 实时HTML预览
- ✅ 美化样式渲染
- ✅ HTML文件导出
- ✅ 高质量图片生成

## 表格示例

| 功能 | 状态 | 说明 |
|------|------|------|
| **文本输入** | ✅ 完成 | 支持直接输入Markdown文本 |
| **文件上传** | ✅ 完成 | 支持.md和.txt文件上传 |
| **HTML预览** | ✅ 完成 | 实时渲染预览效果 |
| **样式美化** | ✅ 完成 | 表格、标题、段落美化 |
| **文件导出** | ✅ 完成 | HTML和PNG格式导出 |

---

## 代码示例

```javascript
// 示例代码
const convertToHtml = () => {
  const html = marked(markdownText);
  const styledHtml = getStyledHtml(html);
  setHtmlContent(styledHtml);
};
```

## 引用块

> 这是一个引用块示例  
> 支持多行引用内容  
> 具有美化的样式效果

## 列表示例

### 有序列表
1. 第一步：输入或上传Markdown内容
2. 第二步：点击"转换为HTML"按钮
3. 第三步：预览渲染效果
4. 第四步：导出HTML或图片文件

### 无序列表
- 支持**粗体**文本
- 支持*斜体*文本
- 支持`行内代码`
- 支持[链接](https://example.com)

---

**测试完成！** 🎉