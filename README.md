# 🎯 InterviewPrep MVP

> AI 驱动的面试押题与模拟面试官 — 输入 JD + 简历，获得精准提分方案。

## ✨ 核心功能

### 📋 JD × 简历智能分析（分析 & 押题）

- **JD 解析**：提取公司、岗位、职责要求、关键词
- **差距分析**：对标 JD 标出匹配点、优势项、薄弱项，可视化匹配度评分
- **预测押题**：结合公司面经 + 知识库，生成高频预测题
- **公司调研**：自动搜索公司业务、文化、价值观
- **简历优化建议**：针对 JD 的个性化改进方案
- **JD 链接扒取**：一键扒取 Boss直聘 / 51job / LinkedIn 岗位链接

### 🧠 真题练习 & 💬 模拟面试

- 逐题练习，AI 以 STAR 框架评分 + 改进建议
- AI 扮演面试官沉浸式 1v1 追问
- 面试后生成完整评估报告

### 📚 话术库

- 收藏优质回答，支持标签分类，导出 DOCX

## 🚀 快速开始

### 前置要求
- **Node.js** ≥ 18
- **opencli**：`npm i -g opencli`

### 安装

```bash
git clone https://github.com/yourname/InterviewPrep.git
cd InterviewPrep
npm install
cd ai-provider-kit && npm install && cd ..
npm start
# → 浏览器打开 http://localhost:3456
```

## 🔌 支持的 LLM

DeepSeek / OpenAI / 硅基流动 / 阿里百炼(Qwen) / Doubao / Ollama

在 UI 中一键添加切换，支持自定义 Base URL。

## 🏗️ 技术架构

```
用户浏览器 (HTML/JS)
        │
  Express Server
        │
  ┌─────┼─────────────────┐
  │     │                 │
Chatflow  ai-provider-kit   opencli
引擎      (LLM供应商管理)    (JD扒取/面经)
```

## 📄 License

MIT
