// ============================================================
// 知识库管理器 - 5层结构：通用题库 / 行业题库 / 公司档案 / STAR框架 / 话术库
// ============================================================

const generalQA = require('./general-qa.json');
const starFramework = require('./star-framework.json');
const path = require('path');
const fs = require('fs');

// 加载行业题库
function loadIndustryKB() {
  const dir = path.join(__dirname, 'industry');
  const kb = {};
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.json')) {
        try {
          kb[file.replace('.json', '')] = JSON.parse(
            fs.readFileSync(path.join(dir, file), 'utf-8')
          );
        } catch (e) { /* skip corrupt files */ }
      }
    }
  }
  return kb;
}

const industryKB = loadIndustryKB();

/**
 * 多维度检索知识库
 * @param {object} context - { company, position, industry, keywords }
 * @returns {array} 匹配的题目
 */
function searchKnowledgeBase({ company, position, industry, keywords = [] } = {}) {
  const results = [];
  const allKeywords = [
    ...(keywords || []),
    ...(position ? position.split(/[\s\-·]/) : []),
    ...(industry ? [industry] : [])
  ].map(k => k.toLowerCase());

  // 1. 搜索通用题库
  for (const item of generalQA) {
    const itemText = (item.question + ' ' + (item.tags || []).join(' ')).toLowerCase();
    let score = 0;
    for (const kw of allKeywords) {
      if (itemText.includes(kw)) score += 2;
    }
    // 通识题（自我介绍、职业规划等）始终保留
    if (item.category === '通用') score += 1;
    if (score > 0) results.push({ ...item, kb_source: '通用题库', relevance: score });
  }

  // 2. 搜索行业题库
  if (industry) {
    const industryKey = Object.keys(industryKB).find(k =>
      k.toLowerCase().includes(industry.toLowerCase()) ||
      industry.toLowerCase().includes(k.toLowerCase())
    );
    if (industryKey && industryKB[industryKey]) {
      for (const item of industryKB[industryKey].questions || []) {
        const itemText = (item.question + ' ' + (item.tags || []).join(' ')).toLowerCase();
        let score = 1;
        for (const kw of allKeywords) {
          if (itemText.includes(kw)) score += 3;
        }
        if (score > 1) results.push({ ...item, kb_source: `行业题库-${industryKey}`, relevance: score });
      }
    }
  }

  // 3. 搜索公司档案（如果有）
  if (company) {
    const companyFile = path.join(__dirname, 'industry', `${company.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, '')}.json`);
    if (fs.existsSync(companyFile)) {
      try {
        const companyData = JSON.parse(fs.readFileSync(companyFile, 'utf-8'));
        for (const item of companyData.questions || []) {
          results.push({ ...item, kb_source: `公司档案-${company}`, relevance: 10 });
        }
      } catch (e) { /* skip */ }
    }
  }

  // 按相关度排序，去重
  const seen = new Set();
  const unique = results.filter(r => {
    const key = r.question;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => b.relevance - a.relevance);
}

/**
 * 获取STAR评估框架
 */
function getSTARFramework() {
  return starFramework;
}

module.exports = {
  searchKnowledgeBase,
  getSTARFramework
};
