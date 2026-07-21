<div align="center">

# 🎯 InterviewPrep

### AI 驱动的面试押题与模拟面试官

[![Release](https://img.shields.io/github/v/release/WXK2905821189/InterviewPrep?style=flat-square&color=6366f1)](https://github.com/WXK2905821189/InterviewPrep/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33.3-blue?style=flat-square&logo=electron)](https://electronjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org)

**输入 JD + 简历 → AI 精准押题、面经采集、差距分析、模拟面试、简历优化**

</div>

---

## 📥 下载

👉 **[下载最新版](https://github.com/WXK2905821189/InterviewPrep/releases/latest)** → 解压 → 双击 `InterviewPrep.exe`

> 💡 首次启动请在 ⚙️ 设置中配置 AI 供应商（OpenAI / DeepSeek API Key）

### 源码运行

```bash
git clone https://github.com/WXK2905821189/InterviewPrep.git
cd InterviewPrep
npm install
npm run electron
```

---

## ✨ 功能模块

### 🔍 分析 & 押题
粘贴 JD 和简历，AI 自动完成 JD 解析、简历解析、差距分析和五类题型生成（行为面试 / 专业能力 / 项目深挖 / 压力测试 / HR 面）。支持 Boss直聘 / 51job 链接一键扒取。快速模式下仅生成 3 类核心题型。

### 💪 单题练习
从押题清单选题作答，AI 五维深度评分（STAR 完整性、量化程度、岗位匹配、表达结构、亮点突出），逐句点评标注优缺点，给出改进版参考和关键改进点。高分回答可一键存入话术库。练习历史自动保存，含完整题目/回答/评估/改进。

### 📡 面经采集
独立搜索小红书面经，AI 提取真实面试题。双通道采集（文字提取 + 截图 OCR），三阶段 LLM 结构化（粗提取 → 分类标签 → 增强输出），SSE 实时进度。支持手动粘贴小红书链接批量抓取，结果可同步到押题清单。

### 🎤 全真模拟面试
AI 扮演面试官，从自我介绍开始多轮追问。智能追问不充分回答，多阶段面试（行为 → 专业 → 项目 → 压力）。结束后自动生成五维雷达图 + 逐题点评报告，面试历史回顾记录每次得分。

### 📄 简历优化
AI 逐段分析简历，对标 JD 给出逐句优化建议。原文 vs 优化后左右对照，自动生成 Elevator Pitch 和 1 分钟自我介绍脚本。

### 📚 真题库 + 话术库
面经采集题目自动归档，按公司 / 岗位 / 题型筛选。话术库收藏高分回答，标签分类。

### 📊 仪表盘
练习概览（总次数 / 面试次数 / 平均分）、五维雷达图、练习热力图一站式总览。

### 🌙 暗色模式
Navbar 一键切换，跟随系统偏好，偏好记忆本地。

### 📥 一键导出
押题清单 / 练习历史 / 面试报告 → Markdown + DOCX。

---

## 🔌 支持的 LLM

| 供应商 | 模型示例 |
|--------|---------|
| DeepSeek | deepseek-chat, deepseek-reasoner |
| OpenAI | gpt-4o, gpt-4o-mini |
| 阿里百炼 | qwen-turbo, qwen-plus, qwen-max |
| 硅基流动 | Qwen, DeepSeek, GLM 系列 |
| Doubao (豆包) | doubao-pro-32k |
| Ollama (本地) | llama3, qwen2.5, mistral |
| 自定义 | 任何 OpenAI-compatible API |

在 ⚙️ 设置中一键添加切换，支持测试连接。

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────┐
│          Electron 桌面客户端             │
├─────────────────────────────────────────┤
│          Express Server                  │
│    SSE 流式 · API 路由 · 会话管理        │
├──────────┬──────────────┬───────────────┤
│ Chatflow │  LLM Client   │   OpenCLI     │
│ 分析引擎 │  多后端切换    │  JD扒取/面经  │
│ Prompt   │  ai-provider  │  小红书/Web   │
│ 编排管理 │  / standalone │  浏览器控制   │
└──────────┴──────────────┴───────────────┘
```

---

## 📁 项目结构

```
InterviewPrep/
├── server.js              # Express 主服务器 + API 路由
├── electron/              # Electron 桌面客户端
├── chatflow/              # 分析引擎核心
│   ├── engine.js          # 流水线编排
│   ├── llm-client.js      # LLM 统一调用（ai-provider-kit / standalone 双后端）
│   ├── prompts.js         # 所有 Prompt 模板
│   ├── conn-store.js      # 独立连接存储（云端降级）
│   └── nodes/
│       └── mianjing.js    # 面经采集（搜索+OCR+LLM三阶段）
├── public/                # 前端 SPA
│   ├── index.html         # 主页面
│   ├── app.js             # 前端逻辑
│   ├── style.css          # 样式（亮色+暗色）
│   └── echarts.min.js     # ECharts 图表
├── knowledge/             # 知识库（高频题库）
└── package.json
```

---

## 📝 更新日志

### v1.5.0 (2026-07-21)
- ✨ 面试准备度评分（6 维度加权评分，直观了解面试准备程度）
- ✨ 键盘快捷键（Space 暂停 / 1-5 评分 / Enter 提交 / Esc 关闭）
- ✨ 智能 JD 缓存（MD5 哈希 + 24h TTL，避免重复解析）
- ✨ 对比视图（用户回答 vs AI 标准答案并排对比弹窗）
- ✨ 自动切换主题（6:00-18:00 浅色，其他时段深色，支持手动覆盖）
- ✨ JD 链接解析（Boss直聘 / 51job 链接一键扒取）
- ✨ 批量生成题目（5 种题型 × 3 题，并行生成）
- ✨ 错题回顾（分数 <60 自动标记，按题型筛选 + 重新练习）
- 🔧 修复 escapeHtml 未定义导致的 ReferenceError
- 🔧 修复 setJdCache 死代码及 CSS 重复样式

### v1.4.0 (2026-07-19)
- ✨ 自我介绍卡片暖色风格改版
- ✨ 简历优化阶段指示器（6 阶段轮播）
- ✨ 自定义 Prompt 输入框（自我介绍生成可追加个性化要求）

### v1.3.0 (2026-07-17)
- ✨ 暗色模式（跟随系统偏好 + 手动切换）
- ✨ 押题清单 / 练习历史 / 面试报告 → MD + DOCX 导出
- ✨ 单题练习历史记录（完整保存题目+回答+评估+改进+五维分数）
- ✨ 面经采集独立 Tab + 双通道 OCR + 三阶段 LLM
- ✨ 面试优雅收尾 + 面试历史回顾面板
- ✨ 新用户三步引导欢迎页
- ✨ 面经结果一键同步到押题清单
- ✨ 仪表盘练习概览卡片
- 🔧 全局 fetchRetry（40 处 API 调用）
- 🔧 押题→练习跳转链路加固
- 🔧 LLM JSON 解析增强（markdown 代码块 + 空对象防护 + 降级兜底）
- 🔧 简历优化原文完整展示
- 🔧 真题库题目一键跳转单题练习
- ⚡ script defer / 懒加载 / debounce / 雷达图延迟渲染
- 🏗️ LLM 客户端双后端架构（ai-provider-kit + standalone 降级）

### v1.2.0
- 📊 面试仪表盘（日历热力图、五维雷达图、题型饼图）
- 📝 简历评分 + 3 套简历模板 + DOCX/PDF 导出
- 🔧 opencli 一键配置
- 🔄 自动更新检查

### v1.1.0
- 全真模拟面试 + 单题练习评估 + 真题库

### v1.0.0
- JD 解析 + 简历解析 + 差距分析 + 五类题型生成 + 面经采集

---

## 📄 License

MIT © [WXK2905821189](https://github.com/WXK2905821189)

---

<div align="center">
<sub>Built with ❤️ for job seekers everywhere</sub>
</div>
