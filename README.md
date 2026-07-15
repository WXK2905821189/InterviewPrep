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

### 📊 仪表盘（v1.2 新增）
- **练习日历** — GitHub 贡献图风格，近 60 天练习频率一目了然
- **5 维雷达图** — STAR 完整度、量化程度、岗位匹配、结构逻辑、亮点突出
- **题型覆盖** — 环形饼图展示各题型练习分布
- **面试历史** — 所有模拟面试报告按时间线排列

### 📝 简历评分 & 模板（v1.2 新增）
- **5 维 AI 评分** — 格式规范 / 内容完整 / 量化程度 / STAR 结构 / 岗位对齐
- **简历优化** — AI 对标 JD 逐段改写，生成优化版简历 DOCX 一键下载
- **3 套简历模板** — 简洁版 / 商务版 / 设计版，实时预览，导出 DOCX / PDF
- **从分析导入** — 自动填充已解析的简历数据到模板

### 📋 JD × 简历智能分析
- **JD 一键扒取** — 粘贴 Boss 直聘 / 51job 链接，自动提取岗位描述
- **差距分析** — 对标 JD 标出匹配点、优势项、薄弱项，可视化匹配度
- **预测押题** — 5 类题型并行生成（行为面试 / 专业能力 / 项目深挖 / 压力测试 / HR 面）
- **面经采集** — 独立触发，搜索小红书面经，提取高频真题（v1.2 重构）
- **快速模式** — 跳过面经采集，3 类核心题型并行生成，约快 **5 倍**

### 🧠 单题练习 & 模拟面试
- **逐题精练** — 点击押题卡片进入练习，AI 按 STAR 框架评分
- **逐句点评** — 每句回答标注优缺点，给出优化版本
- **结合简历** — 评估时传入你的真实简历，回答紧扣个人经历
- **模拟面试** — AI 化身面试官 1v1 追问，生成完整评估报告

### 📚 更多能力
- **话术库** — 收藏高分回答，标签分类，一键导出 DOCX
- **真题库** — 面经采集的题目自动归档，按公司/岗位/类型筛选
- **公司调研** — 多维搜索 + AI 知识图谱，面试前建立全面认知
- **opencli 一键配置** — 自动检测环境、下载扩展、引导安装（v1.2）
- **自动更新** — 启动时检查 GitHub Release，一键下载安装（v1.2）
- **⚙️ 多模型** — 支持 DeepSeek / OpenAI / Qwen / Doubao / Ollama 等

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

> 💡 桌面版封装了 Express 后端，但面经抓取 / JD 扒取仍需 OpenCLI Chrome/Edge 扩展。

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

---

## 📁 项目结构

```
InterviewPrep/
├── server.js              # Express 主服务器 + API 路由
├── electron/              # Electron 桌面客户端
│   ├── main.js            # 主进程（窗口/菜单/IPC）
│   └── preload.js         # 预加载脚本
├── chatflow/              # 分析引擎核心
│   ├── engine.js          # 流水线编排
│   ├── llm-client.js      # LLM 统一调用
│   ├── prompts.js         # 所有 Prompt 模板
│   ├── export-docx.js     # DOCX 导出基础设施
│   └── nodes/
│       ├── mianjing.js    # 面经采集（搜索+解析+清洗）
│       ├── opencli-setup.js  # opencli 一键安装
│       └── export-resume.js  # 简历导出 (DOCX/PDF)
├── ai-provider-kit/       # AI 供应商管理子系统
├── public/                # 前端 (SPA)
│   ├── index.html         # 主页面
│   ├── app.js             # 前端逻辑
│   ├── style.css          # 样式
│   ├── resume-templates.css  # 简历模板样式
│   └── echarts.min.js     # ECharts 图表
├── knowledge/             # 知识库（高频题库）
└── package.json
```

---

## 📝 v1.2.0 更新日志

### 🆕 新功能
- **📊 面试仪表盘** — 练习日历热力图、5 维能力雷达图、题型覆盖饼图、练习历史
- **📝 简历评分** — 5 维 AI 评分 + 彩色进度条 + 改进建议
- **📄 简历模板** — 3 套专业模板（简洁/商务/设计），导入分析数据自动填充
- **📥 简历导出** — 模板支持导出 DOCX / PDF，优化版简历一键生成 DOCX
- **🔧 opencli 一键配置** — 自动检测环境、启动 daemon、下载扩展、引导安装
- **🔄 自动更新** — 启动检查 + 设置页手动检查，一键下载安装即重启

### 🔧 改进
- **面经采集** — 从分析流程中独立为单独功能，用户主动触发
- **opencli 环境** — 从页面底部移入设置弹窗，更清爽
- **默认浏览器** — 读取 Windows 注册表，Edge 用户优先使用 Edge
- **押题 Prompt** — 强化简历绑定，要求每道题必须基于候选人真实经历
- **select 美化** — 全局下拉框自定义箭头 / 圆角 / hover / focus 光环
- **ETA 修复** — 统计真实完成步骤数，不再被并行步骤误导
- **练习布局** — 答案框放大，题目列表始终可见，含知识库补充题

### 🐛 Bug 修复
- 全真模拟评估时简历上下文丢失
- Prompt 模板变量 `{{position}}` 无法正常替换
- `resizeAllCharts is not defined` 启动报错

---

## 📄 License

MIT © [WXK2905821189](https://github.com/WXK2905821189)

---

<div align="center">
<sub>Built with ❤️ for job seekers everywhere</sub>
</div>
