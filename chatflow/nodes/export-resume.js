// ============================================================
// Resume Export — DOCX + PDF
// ============================================================
const { Document, Packer, Paragraph, TextRun, HeadingLevel,
        AlignmentType, BorderStyle, ShadingType, PageBreak } = require('docx');
const os = require('os');

const CJK_FONT = os.platform() === 'darwin' ? 'PingFang SC' : 'Microsoft YaHei';
const BODY_FONT = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: CJK_FONT };
const BODY_SIZE = 22; // 11pt

function baseDoc(sections = []) {
  return new Document({
    styles: {
      default: { document: { run: { font: BODY_FONT, size: BODY_SIZE } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, color: '1a1a2e', font: BODY_FONT },
          paragraph: { spacing: { before: 320, after: 160 }, keepNext: false, keepLines: false } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 24, bold: true, color: '4F46E5', font: BODY_FONT },
          paragraph: { spacing: { before: 240, after: 120 }, keepNext: false, keepLines: false } },
      ]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 }
        }
      },
      children: sections,
    }]
  });
}

function sectionHr() {
  return new Paragraph({
    spacing: { before: 100, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E4E7F0' } },
    children: []
  });
}

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text, font: BODY_FONT })]
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: BODY_FONT })]
  });
}

function normalPara(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after !== undefined ? opts.after : 80 },
    indent: opts.indent ? { left: opts.indent } : undefined,
    children: [
      new TextRun({
        text: text || '',
        font: BODY_FONT,
        size: opts.size !== undefined ? opts.size : BODY_SIZE,
        color: opts.color || undefined,
        bold: opts.bold || false
      })
    ]
  });
}

function bulletPara(text) {
  return new Paragraph({
    spacing: { after: 40 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: '\u2022 ', font: BODY_FONT, size: BODY_SIZE }),
      new TextRun({ text, font: BODY_FONT, size: BODY_SIZE })
    ]
  });
}

// ============================================================
// DOCX Export
// ============================================================
async function generateResumeDocx(data) {
  const children = [];

  // ── Header: Name & Contact ──
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: data.name || '姓名', bold: true, size: 44, font: BODY_FONT })]
  }));

  const contactLine = [data.email, data.phone, data.location].filter(Boolean).join(' · ');
  if (contactLine) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: contactLine, size: 20, color: '666666', font: BODY_FONT })]
    }));
  }

  // ── Summary ──
  if (data.summary && data.summary.trim()) {
    children.push(heading2('个人简介'));
    children.push(normalPara(data.summary, { size: 22 }));
    children.push(sectionHr());
  }

  // ── Education ──
  if (data.educations && data.educations.some(e => e.school)) {
    children.push(heading2('教育经历'));
    const eduList = data.educations.filter(e => e.school);
    for (const e of eduList) {
      const line = [e.school, e.major, e.degree, e.years].filter(Boolean).join(' · ');
      children.push(bulletPara(line));
    }
    children.push(sectionHr());
  }

  // ── Experience ──
  if (data.experiences && data.experiences.some(e => e.company)) {
    children.push(heading2('工作经历'));
    const expList = data.experiences.filter(e => e.company);
    for (const e of expList) {
      children.push(new Paragraph({
        spacing: { before: 120, after: 40 },
        children: [
          new TextRun({ text: e.role || '', bold: true, font: BODY_FONT, size: 22 }),
          new TextRun({ text: ' @ ' + e.company + '  ' + (e.duration || ''), font: BODY_FONT, size: 20, color: '888888' })
        ]
      }));
      if (e.highlights) {
        const items = e.highlights.split('\n').filter(Boolean);
        for (const item of items) {
          children.push(bulletPara(item));
        }
      }
    }
    children.push(sectionHr());
  }

  // ── Projects ──
  if (data.projects && data.projects.some(p => p.name)) {
    children.push(heading2('项目经历'));
    const projList = data.projects.filter(p => p.name);
    for (const p of projList) {
      const title = [p.name, p.tech ? '(' + p.tech + ')' : ''].filter(Boolean).join(' ');
      children.push(new Paragraph({
        spacing: { before: 80, after: 40 },
        children: [
          new TextRun({ text: title, bold: true, font: BODY_FONT, size: 22 })
        ]
      }));
      if (p.desc) {
        children.push(normalPara(p.desc, { size: 22, indent: 360 }));
      }
    }
    children.push(sectionHr());
  }

  // ── Skills ──
  if (data.skills && data.skills.trim()) {
    children.push(heading2('技能'));
    children.push(normalPara(data.skills, { size: 22 }));
  }

  const doc = baseDoc(children);
  return Packer.toBuffer(doc);
}

// ============================================================
// PDF Export (via Puppeteer)
// ============================================================
function renderTemplateHtml(data, templateId) {
  // Generates the same HTML as the frontend renderResumePreview() but with
  // proper CSS links so it renders correctly in a standalone HTML page.
  const contactHtml = [data.email, data.phone, data.location].filter(Boolean).join(' · ');
  let html = '';

  if (templateId === 'clean') {
    html = '<div class="template-clean">' +
      '<h1>' + esc(data.name || '姓名') + '</h1>' +
      '<p class="contact-line">' + esc(contactHtml) + '</p>' +
      (data.summary ? '<div class="section-block"><h3>个人简介</h3><p>' + esc(data.summary) + '</p></div>' : '') +
      (data.educations && data.educations.some(e => e.school) ? '<div class="section-block"><h3>教育经历</h3>' + data.educations.filter(e => e.school).map(e => '<div class="entry-item"><p><b class="role">' + esc(e.school) + '</b> · ' + esc(e.major) + ' · ' + esc(e.degree) + ' <span class="duration">' + esc(e.years) + '</span></p></div>').join('') + '</div>' : '') +
      (data.experiences && data.experiences.some(e => e.company) ? '<div class="section-block"><h3>工作/实习经历</h3>' + data.experiences.filter(e => e.company).map(e => '<div class="entry-item"><p><b class="role">' + esc(e.role) + '</b> @ ' + esc(e.company) + ' <span class="duration">' + esc(e.duration) + '</span></p>' + (e.highlights ? '<ul>' + e.highlights.split('\n').filter(Boolean).map(h => '<li>' + esc(h) + '</li>').join('') + '</ul>' : '') + '</div>').join('') + '</div>' : '') +
      (data.projects && data.projects.some(p => p.name) ? '<div class="section-block"><h3>项目经历</h3>' + data.projects.filter(p => p.name).map(p => '<div class="entry-item"><p><b>' + esc(p.name) + '</b>' + (p.tech ? ' · ' + esc(p.tech) : '') + '</p><p>' + esc(p.desc || '') + '</p></div>').join('') + '</div>' : '') +
      (data.skills ? '<div class="section-block"><h3>技能</h3><p>' + esc(data.skills) + '</p></div>' : '') +
      '</div>';
  } else if (templateId === 'business') {
    html = '<div class="template-business">' +
      '<div class="sidebar">' +
      '<h2>' + esc(data.name || '姓名') + '</h2>' +
      '<p class="contact-info">' + [data.email, data.phone, data.location].filter(Boolean).map(esc).join('<br>') + '</p>' +
      (data.skills ? '<h4>技能</h4><p class="skill-list">' + data.skills.split(',').map(s => '· ' + esc(s.trim())).join('<br>') + '</p>' : '') +
      (data.educations && data.educations.some(e => e.school) ? '<h4>教育</h4>' + data.educations.filter(e => e.school).map(e => '<div class="edu-item"><p class="school-name">' + esc(e.school) + '</p><p>' + esc(e.major) + '</p><p>' + esc(e.years) + '</p></div>').join('') : '') +
      '</div>' +
      '<div class="main-content">' +
      (data.summary ? '<h4>个人简介</h4><p class="summary-text">' + esc(data.summary) + '</p>' : '') +
      (data.experiences && data.experiences.some(e => e.company) ? '<h4>工作经历</h4>' + data.experiences.filter(e => e.company).map(e => '<div class="exp-item"><p class="exp-title"><b>' + esc(e.role) + '</b> · ' + esc(e.company) + '</p><p class="exp-date">' + esc(e.duration) + '</p>' + (e.highlights ? '<ul>' + e.highlights.split('\n').filter(Boolean).map(h => '<li>' + esc(h) + '</li>').join('') + '</ul>' : '') + '</div>').join('') : '') +
      (data.projects && data.projects.some(p => p.name) ? '<h4>项目经历</h4>' + data.projects.filter(p => p.name).map(p => '<div class="proj-item"><p><b>' + esc(p.name) + '</b>' + (p.tech ? ' <span class="proj-tech">(' + esc(p.tech) + ')</span>' : '') + '</p><p class="proj-desc">' + esc(p.desc || '') + '</p></div>').join('') : '') +
      '</div></div>';
  } else {
    // creative
    html = '<div class="template-creative">' +
      '<div class="header-banner">' +
      '<h1>' + esc(data.name || '姓名') + '</h1>' +
      '<p class="contact-line">' + esc(contactHtml) + '</p></div>' +
      '<div class="body-area">' +
      (data.summary ? '<div class="card-block"><h3>关于我</h3><p class="card-desc">' + esc(data.summary) + '</p></div>' : '') +
      (data.experiences && data.experiences.some(e => e.company) ? '<div class="card-block"><h3>经历</h3>' + data.experiences.filter(e => e.company).map(e => '<div class="exp-item"><p class="exp-title"><b>' + esc(e.role) + '</b> @ ' + esc(e.company) + '</p><p class="exp-date">' + esc(e.duration) + '</p>' + (e.highlights ? '<p class="exp-detail">' + e.highlights.split('\n').filter(Boolean).map(h => '· ' + esc(h)).join('<br>') + '</p>' : '') + '</div>').join('') + '</div>' : '') +
      (data.educations && data.educations.some(e => e.school) ? '<div class="card-block"><h3>教育</h3>' + data.educations.filter(e => e.school).map(e => '<p class="edu-item">' + esc(e.school) + ' · ' + esc(e.major) + ' · ' + esc(e.years) + '</p>').join('') + '</div>' : '') +
      (data.skills ? '<div class="card-block"><h3>技能</h3><p>' + data.skills.split(',').map(s => '<span class="skill-tag">' + esc(s.trim()) + '</span>').join('') + '</p></div>' : '') +
      '</div></div>';
  }

  // Build the full HTML document with inlined CSS
  const css = getTemplateCss();
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>' + css + '</style></head><body style="background:#fff;padding:0;margin:0;">' + html + '</body></html>';
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getTemplateCss() {
  return `
    body { font-family: Arial, 'Microsoft YaHei', sans-serif; margin: 0; padding: 0; color: #1a1a2e; font-size: 12px; line-height: 1.7; }
    .template-clean { max-width: 750px; margin: 0 auto; color: #1a1a2e; font-size: 12px; }
    .template-clean h1 { text-align: center; font-size: 22px; margin: 0 0 4px; }
    .template-clean h3 { border-bottom: 1.5px solid #333; padding-bottom: 4px; font-size: 13px; font-weight: 600; margin: 0 0 8px; text-transform: uppercase; }
    .template-clean .contact-line { text-align: center; color: #666; font-size: 11px; margin: 0 0 16px; }
    .template-clean .section-block { margin-bottom: 14px; }
    .template-clean .entry-item { margin: 6px 0; }
    .template-clean .entry-item p { margin: 0; font-size: 12px; }
    .template-clean .entry-item .role { font-weight: 600; }
    .template-clean .entry-item .duration { color: #888; font-size: 11px; }
    .template-clean ul { margin: 2px 0; padding-left: 18px; font-size: 12px; color: #444; }
    .template-clean ul li { margin-bottom: 1px; }
    .template-business { display: flex; min-height: 500px; max-width: 800px; font-size: 12px; }
    .template-business .sidebar { width: 220px; background: #1e3a5f; color: #c8d6e5; padding: 24px 16px; font-size: 11px; flex-shrink: 0; }
    .template-business .sidebar h2 { color: #fff; font-size: 18px; margin: 0 0 4px; }
    .template-business .sidebar .contact-info { color: #a0b8d0; font-size: 11px; margin: 0 0 12px; line-height: 1.6; }
    .template-business .sidebar h4 { color: #fff; font-size: 11px; border-bottom: 1px solid #3a5a80; padding-bottom: 3px; margin: 12px 0 6px; text-transform: uppercase; }
    .template-business .sidebar .skill-list { line-height: 1.7; }
    .template-business .sidebar .edu-item { margin: 3px 0; line-height: 1.5; }
    .template-business .sidebar .edu-item .school-name { color: #e0e8f0; font-weight: 600; }
    .template-business .main-content { flex: 1; padding: 24px 20px; font-size: 12px; background: #fff; }
    .template-business .main-content h4 { color: #1e3a5f; font-size: 13px; border-bottom: 2px solid #1e3a5f; padding-bottom: 3px; margin: 0 0 8px; text-transform: uppercase; }
    .template-business .main-content .summary-text { color: #555; margin: 0 0 16px; }
    .template-business .main-content .exp-item { margin: 0 0 10px; }
    .template-business .main-content .exp-item .exp-title { margin: 0; font-weight: 600; }
    .template-business .main-content .exp-item .exp-date { color: #888; margin: 0; font-size: 10px; }
    .template-business .main-content .exp-item ul { margin: 3px 0; padding-left: 18px; color: #555; }
    .template-business .main-content .proj-item { margin: 0 0 6px; }
    .template-business .main-content .proj-item .proj-tech { color: #1e3a5f; font-size: 11px; }
    .template-business .main-content .proj-item .proj-desc { color: #555; }
    .template-creative { max-width: 700px; font-size: 12px; }
    .template-creative .header-banner { background: linear-gradient(135deg, #7c3aed, #6366f1); color: #fff; padding: 28px 24px; border-radius: 12px 12px 0 0; }
    .template-creative .header-banner h1 { margin: 0; font-size: 22px; }
    .template-creative .header-banner .contact-line { margin: 6px 0 0; opacity: 0.85; font-size: 12px; }
    .template-creative .body-area { padding: 20px; border: 2px solid #e8e0f0; border-top: 0; border-radius: 0 0 12px 12px; background: #faf8ff; }
    .template-creative .card-block { background: #fff; border: 1px solid #e8e0f0; border-radius: 8px; padding: 14px; margin-bottom: 14px; }
    .template-creative .card-block h3 { color: #7c3aed; font-size: 13px; margin: 0 0 8px; }
    .template-creative .card-block .card-desc { color: #555; margin: 4px 0 0; }
    .template-creative .exp-item { margin: 0 0 8px; }
    .template-creative .exp-item .exp-title { margin: 0; font-weight: 600; }
    .template-creative .exp-item .exp-date { color: #999; font-size: 10px; }
    .template-creative .exp-item .exp-detail { margin: 2px 0 0; color: #555; font-size: 11px; }
    .template-creative .edu-item { margin: 2px 0; color: #555; }
    .template-creative .skill-tag { display: inline-block; background: #ede9fe; color: #6d28d9; padding: 2px 10px; border-radius: 12px; margin: 2px; font-size: 11px; }
  `;
}

async function generateResumePdf(data, templateId) {
  const html = renderTemplateHtml(data, templateId || 'clean');

  // Try puppeteer
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const buf = await page.pdf({
        format: 'A4',
        margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
        printBackground: true
      });
      return Buffer.from(buf);
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.warn('[PDF] Puppeteer not available, generating a fallback HTML note. Error:', e.message?.slice(0, 100));
    // Fallback: generate an HTML page telling user to install puppeteer or use Print → Save as PDF
    const fallbackHtml = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>' +
      'body{font-family:"Microsoft YaHei",Arial,sans-serif;max-width:700px;margin:2rem auto;padding:0 1rem;line-height:2;color:#333;}' +
      '.note{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:1rem 1.5rem;margin-bottom:1.5rem;}' +
      '.note h2{color:#856404;margin:0 0 0.5rem;}' +
      '.btn{display:inline-block;background:#4F46E5;color:#fff;padding:0.5rem 1.5rem;border-radius:6px;text-decoration:none;margin-top:0.5rem;}' +
      '</style></head><body>' +
      '<div class="note"><h2>PDF 导出需要 Puppeteer</h2>' +
      '<p>当前环境未安装 Puppeteer，无法直接生成 PDF。</p>' +
      '<p><b>解决方案：</b></p>' +
      '<p>1. 在终端运行：<code>npm install puppeteer</code></p>' +
      '<p>2. 重启本应用后重试</p></div>' +
      '<p><b>替代方案：</b> 请使用浏览器导出 PDF：</p>' +
      '<p>点击下方链接在新标签页中打开简历预览，然后在浏览器菜单中选择 <b>文件 → 打印 → 另存为 PDF</b></p>' +
      '<p>或在下方预览窗口中直接使用 <b>Ctrl+P → 另存为 PDF</b></p>' +
      '<hr>' + html + '</body></html>';
    return Buffer.from(fallbackHtml, 'utf-8');
  }
}

module.exports = { generateResumeDocx, generateResumePdf, renderTemplateHtml };
