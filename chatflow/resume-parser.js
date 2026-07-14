// ============================================================
// 简历本地解析 — PDF / DOCX / TXT 文件上传提取纯文本
// 依赖: mammoth (.docx) | pdf-parse (.pdf) | node:fs (.txt)
// ============================================================
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');

/**
 * 解析上传的简历文件，返回纯文本
 * @param {string} filePath - 临时文件路径
 * @param {string} originalName - 原始文件名（判断扩展名）
 * @returns {{ text: string, sourceType: string, fileName: string }}
 */
async function parseResumeFile(filePath, originalName) {
  const ext = path.extname(originalName || 'file.txt').toLowerCase();
  let text = '';
  let sourceType = '未知';

  try {
    if (ext === '.txt' || ext === '.md') {
      text = fs.readFileSync(filePath, 'utf-8');
      sourceType = 'txt';

    } else if (ext === '.docx' || ext === '.doc') {
      // mammoth 只支持 .docx; Word 97 .doc 需先转 docx
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value || '';
      if (result.messages?.length) {
        console.warn('[简历解析] mammoth 警告:', result.messages.slice(0, 3).map(m => m.message).join('; '));
      }
      sourceType = 'docx';

    } else if (ext === '.pdf') {
      const buffer = fs.readFileSync(filePath);
      // pdf-parse@2.x 需要 Uint8Array 不是 Buffer
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const data = await parser.getText();
      text = data.text || '';
      await parser.destroy();
      sourceType = 'pdf';

    } else {
      // 尝试按 UTF-8 读取
      text = fs.readFileSync(filePath, 'utf-8');
      sourceType = 'unknown';
    }
  } catch (e) {
    throw new Error(`文件解析失败 (${sourceType}): ${e.message}`);
  }

  // 清理：去多余空行、去BOM
  text = text.replace(/^\uFEFF/, '').replace(/\n{3,}/g, '\n\n').trim();

  if (!text) throw new Error('文件解析后无文本内容，请检查文件是否加密或为扫描图片');

  return { text, sourceType, fileName: originalName || 'unknown' };
}

module.exports = { parseResumeFile };
