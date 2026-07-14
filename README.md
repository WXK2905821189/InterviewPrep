<div align="center">

# 🎯 InterviewPrep

### AI 驱动的面试押题与模拟面试官

[![Release](https://img.shields.io/github/v/release/WXK2905821189/InterviewPrep?style=flat-square&color=6366f1)](https://github.com/WXK2905821189/InterviewPrep/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-33.3-blue?style=flat-square&logo=electron)](https://electronjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org)

**输入 JD + 简历 → 获得精准押题、面经数据、差距分析和 AI 面试模拟**

</div>

---

## ✨ 核心功能

<table>
<tr>
<td width="50%">

### 📋 JD × 简历智能分析

- **JD 一键扒取** — 粘贴 Boss 直聘 / 51job 链接，自动提取岗位描述
- **差距分析** — 对标 JD 标出匹配点、优势项、薄弱项，可视化匹配度
- **预测押题** — 5 类题型并行生成（行为面试 / 专业能力 / 项目深挖 / 压力测试 / HR 面）
- **面经增强** — 自动搜索小红书面经，提取高频真题加入押题清单
- **简历优化** — AI 对标 JD 逐项改写，生成面试话术

</td>
<td width="50%">

### 🧠 单题练习 & 模拟面试

- **逐题精练** — 点击押题卡片进入练习，AI 按 STAR 框架评分
- **逐句点评** — 每句回答标注优缺点，给出优化版本
- **结合简历** — 评估时传入你的真实简历，回答紧扣个人经历
- **模拟面试** — AI 化身面试官 1v1 追问，生成完整评估报告

</td>
</tr>
</table>

### 📚 更多能力

- **话术库** — 收藏高分回答，标签分类，一键导出 DOCX
- **🆕 快速模式** — 跳过面经采集，3 类核心题型并行生成，约快 **5 倍**
- **🔗 手动面经** — 关闭自动搜索后可粘贴小红书帖子链接，手动抓取
- **⚙️ 多模型** — 支持 DeepSeek / OpenAI / Qwen / Doubao / Ollama 等，随意切换

---

## 🚀 快速开始

### 前置要求
- **Node.js** ≥ 18
- **Git**
- **[OpenCLI](https://github.com/jackwener/OpenCLI)** 浏览器扩展（面经抓取 / JD 扒取需要）

### 安装 & 运行

```bash
git clone https://github.com/WXK2905821189/InterviewPrep.git
cd InterviewPrep
npm install
cd ai-provider-kit && npm install && cd ..
npm start
# → 浏览器打开 http://localhost:3456
```

### 📦 桌面客户端（Electron）

从 [Releases](https://github.com/WXK2905821189/InterviewPrep/releases) 下载 `InterviewPrep-vX.X.X-win-x64.zip`，解压后双击 `InterviewPrep.exe` 即可。

> 💡 桌面版封装了 Express 后端，但面经抓取 / JD 扒取仍需 OpenCLI Chrome 扩展。

---

## 🔌 支持的 LLM

| 供应商 | 模型示例 |
|--------|---------|
| DeepSeek | deepseek-chat, deepseek-reasoner |
| OpenAI | gpt-4o, gpt-4o-mini |
| 硅基流动 (SiliconFlow) | Qwen, DeepSeek, GLM 系列 |
| 阿里百炼 | qwen-turbo, qwen-plus, qwen-max |
| Doubao (豆包) | doubao-pro-32k |
| Ollama (本地) | llama3, qwen2.5, mistral 等 |

在 ⚙️ 设置中一键添加切换，支持自定义 Base URL。

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────┐
│          Electron 桌面客户端             │
│         (可选，也支持纯浏览器)            │
├─────────────────────────────────────────┤
│          Express Server (localhost)      │
│    SSE 流式进度 · API 路由 · 会话管理    │
├──────────┬──────────────┬───────────────┤
│ Chatflow │ ai-provider-kit│   opencli    │
│ 分析引擎 │  LLM供应商管理  │ JD扒取/面经  │
│ Prompt   │  多模型切换    │ 小红书/Web   │
│ 编排管理 │  连接安全存储  │ 浏览器控制   │
└──────────┴──────────────┴───────────────┘
```

### 分析流水线

```
JD文本 + 简历文本
    │
    ├─► ① JD 解析 (LLM)
    │       ↓ 公司/岗位/关键词
    ├─► ② 简历解析 (LLM)          ⚡ 面经采集并行启动
    │       ↓ 经历/技能            (opencli 小红书搜索)
    ├─► ③ 差距分析 (LLM)
    │       ↓ 匹配度 + 弱项
    ├─► ④ 等待面经结果 + 相关性过滤
    │       ↓ 面经真题
    ├─► ⑤ 押题生成 (5题型 Promise.all)
    │       ↓ 30+ 道高频题
    ├─► ⑥ 知识库增强
    │       ↓ 兜底题目
    └─► ✅ 完整押题清单 + 差距报告
```

---

## 📁 项目结构

```
InterviewPrep/
├── server.js              # Express 主服务器 + API 路由
├── electron/              # Electron 桌面客户端
│   ├── main.js            # 主进程（窗口/菜单/托盘）
│   └── preload.js         # 预加载脚本
├── chatflow/              # 分析引擎核心
│   ├── engine.js          # 流水线编排
│   ├── llm-client.js      # LLM 统一调用
│   ├── prompts.js         # 所有 Prompt 模板
│   └── nodes/
│       └── mianjing.js    # 面经采集（搜索+解析+清洗）
├── ai-provider-kit/       # AI 供应商管理子系统
├── public/                # 前端 (SPA)
│   ├── index.html         # 主页面
│   ├── app.js             # 前端逻辑
│   └── styles.css         # 样式
├── knowledge/             # 知识库（高频题库）
└── package.json
```

---

## 📄 License

MIT © [WXK2905821189](https://github.com/WXK2905821189)

---

<div align="center">
<sub>Built with ❤️ for job seekers everywhere</sub>
</div>
