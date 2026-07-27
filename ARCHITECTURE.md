# 项目架构

> 最后更新：2026-07-26 | v1.6.0

---

## 一、技术栈总览

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron | 33.3 |
| 后端服务 | Express (Node.js) | 4.21 |
| 前端 | Vanilla JS + ECharts | — |
| 样式 | CSS 自定义属性（亮色/暗色双主题） | — |
| AI 网关 | ai-provider-kit (OpenAI-compatible) | — |
| 浏览器自动化 | opencli browser | 1.8.6 |
| 文档解析 | pdf-parse / mammoth / tesseract.js | — |
| 文档生成 | docx (Office Open XML) | 9.7 |
| 打包 | electron-builder | 25.1 |

---

## 二、页面结构

```mermaid
graph TD
    A[📊 仪表盘 Dashboard] --> B[分析 & 押题]
    A --> C[单题练习]
    A --> D[全真模拟面试]
    A --> E[简历优化]
    A --> F[📡 面经采集]
    A --> G[🎯 专项训练]
    A --> H[💡 通用题库]
    A --> I[公司调研]
    A --> J[📝 错题集]
    A --> K[👥 群面模拟]

    B --> B1[JD 解析]
    B --> B2[简历解析]
    B --> B3[差距分析]
    B --> B4[押题生成]
    B --> B5[押题清单展示]

    C --> C1[选题作答]
    C --> C2[AI 评估 + 逐句点评]
    C --> C3[AI 标准答案参考]
    C --> C4[话术库收藏]

    D --> D1[AI 面试官开场]
    D --> D2[多轮追问]
    D --> D3[面试评估报告]
    D --> D4[面试历史回顾]

    E --> E1[简历评分]
    E --> E2[逐段优化建议]
    E --> E3[全文化化]
    E --> E4[自我介绍生成]

    F --> F1[小红书搜索]
    F --> F2[文字提取 + OCR]
    F --> F3[面经结构化]
    F --> F4[面经整合分析]

    G --> G1[题型过滤]
    G --> G2[计时器]
    G --> G3[历史记录]
    G --> G4[趋势图]

    K --> K1[题目生成]
    K --> K2[AI 候选人对话]
    K --> K3[群面评估报告]
    K --> K4[知识库参考]
```

---

## 三、系统架构

```mermaid
graph TB
    subgraph Desktop["🖥️ Electron 桌面端"]
        Main["electron/main.js\n主进程"]
        Preload["electron/preload.js\n预加载脚本"]
        Window["BrowserWindow\n1280×860"]
    end

    subgraph Server["⚙️ Express 服务器 :3456"]
        Router["API 路由\n65 个端点"]
        Session["会话管理\n多岗位会话"]
        SSE["SSE 流式推送\n实时进度"]
        Upload["multer 文件上传\n简历 PDF/DOCX"]
    end

    subgraph Chatflow["🧠 Chatflow AI 引擎"]
        Engine["engine.js\n流水线编排"]
        Prompts["prompts.js\nPrompt 模板库"]
        Steps["steps.js\n步骤定义"]
        LLM["llm-client.js\nLLM 统一调用"]
        AIProvider["ai-provider.js\nAI 供应商管理"]
        Standalone["standalone-llm.js\n降级模式"]
    end

    subgraph Nodes["🔌 流程节点"]
        Mianjing["mianjing.js\n面经采集"]
        CompanyRes["company-research.js\n公司调研"]
        OpencliSetup["opencli-setup.js\nOpenCLI 配置"]
        Export["export-docx.js\nDOCX 导出"]
        ResumeParser["resume-parser.js\n简历解析"]
    end

    subgraph Knowledge["📚 知识库"]
        Behavioral["behavioral-questions.json\n20 道行为面试题"]
        Group["group-interview.json\n群面题库"]
        Star["star-framework.json\nSTAR 框架"]
        General["general-qa.json\n通用问答"]
    end

    subgraph Gateway["🌐 AI 网关 :8787"]
        APK["ai-provider-kit\nOpenAI-compatible API"]
        Models["DeepSeek / OpenAI\n阿里百炼 / 硅基流动\n豆包 / Ollama / 自定义"]
    end

    subgraph External["🌍 外部服务"]
        Opencli["opencli browser\n浏览器自动化\nJD扒取 / 面经搜索"]
        Feishu["飞书 Wiki\n群面知识库"]
        GitHub["GitHub\nRelease 发布"]
    end

    Main --> Window
    Main --> Server
    Server --> Router
    Router --> Chatflow
    Router --> Knowledge
    Chatflow --> LLM
    LLM --> Gateway
    Gateway --> Models
    Chatflow --> Nodes
    Nodes --> Opencli
    Nodes --> Export
    Window --> Feishu
    Main --> GitHub
```

---

## 四、核心数据流

```mermaid
sequenceDiagram
    participant U as 👤 用户
    participant FE as 🖥️ 前端 SPA
    participant API as ⚙️ Express API
    participant CF as 🧠 Chatflow 引擎
    participant LLM as 🤖 LLM
    participant KB as 📚 知识库
    participant OC as 🌐 opencli

    Note over U,OC: === 分析 & 押题流程 ===
    U->>FE: 粘贴 JD + 简历
    FE->>API: POST /api/analyze (SSE)
    API->>CF: 启动分析流水线
    CF->>LLM: 步骤1: JD 解析
    LLM-->>CF: JD 结构化数据
    CF->>LLM: 步骤2: 简历解析
    LLM-->>CF: 简历结构化数据
    CF->>LLM: 步骤3: 差距分析
    LLM-->>CF: 匹配度 + 优势/薄弱点
    CF->>LLM: 步骤4: 并行生成 5 类押题
    LLM-->>CF: 12-16 道面试题
    CF->>KB: 步骤5: 知识库增强
    KB-->>CF: 补充题目
    CF-->>API: 分析结果
    API-->>FE: SSE 流式推送
    FE-->>U: 差距分析 + 押题清单

    Note over U,OC: === 面经采集流程 ===
    U->>FE: 输入公司 + 岗位
    FE->>API: POST /api/mianjing-collect (SSE)
    API->>OC: 搜索小红书面经
    OC-->>API: 原始内容
    API->>LLM: 清洗 + 结构化
    LLM-->>API: 结构化面试题
    API-->>FE: SSE 流式推送
    FE-->>U: 面经题目列表

    Note over U,OC: === 模拟面试流程 ===
    U->>FE: 开始面试
    FE->>API: POST /api/interview/start
    API->>LLM: 生成开场 + 面试题
    LLM-->>API: 面试官开场白
    API-->>FE: 面试开始
    loop 每道题
        U->>FE: 输入回答
        FE->>API: POST /api/interview/answer
        API->>LLM: 判断是否追问
        LLM-->>API: 追问 or 下一题
        API-->>FE: 面试官回应
    end
    U->>FE: 结束面试
    FE->>API: POST /api/interview/evaluate
    API->>LLM: 五维评估
    LLM-->>API: 评估报告
    API-->>FE: 雷达图 + 点评
```

---

## 五、LLM 双后端架构

```mermaid
graph LR
    subgraph "llm-client.js"
        A[loadLlm 初始化]
        A --> B{ai-provider.js\n加载成功?}
        B -->|是| C[ai-provider-kit 模式]
        B -->|否| D{standalone-llm.js\n加载成功?}
        D -->|是| E[standalone 模式]
        D -->|否| F[unknown 模式\n返回错误]
    end

    subgraph "ai-provider-kit 模式"
        C --> G[网关 :8787]
        G --> H[OpenAI-compatible API]
        H --> I[DeepSeek]
        H --> J[OpenAI]
        H --> K[阿里百炼]
        H --> L[硅基流动]
        H --> M[豆包]
        H --> N[Ollama 本地]
        H --> O[自定义]
    end

    subgraph "standalone 模式"
        E --> P[直接调用 OpenAI SDK]
        P --> Q[单个供应商]
    end
```

---

## 六、前端 Tab 组件关系

```mermaid
graph TD
    Nav[导航栏 Navbar] --> Tabs

    subgraph Tabs["11 个功能 Tab"]
        T0[📊 仪表盘]
        T1[分析 & 押题]
        T2[单题练习]
        T3[全真模拟]
        T4[简历优化]
        T5[📡 面经采集]
        T6[🎯 专项训练]
        T7[💡 通用题库]
        T8[公司调研]
        T9[📝 错题集]
        T10[👥 群面模拟]
    end

    T1 -->|分析完成后| T2
    T1 -->|分析完成后| T3
    T1 -->|分析完成后| T7
    T2 -->|高分回答| 话术库
    T3 -->|面试结束后| 评估报告
    T5 -->|采集结果| T1
    T5 -->|面经数据| 面经库
    T9 -->|重新练习| T2
    T1 -->|JD数据| T8
    T1 -->|JD数据| T10

    subgraph Storage["本地存储"]
        Sessions["sessions/\n多岗位会话"]
        Drill["drill/\n练习记录"]
        Phrases["phrases/\n话术库"]
        Bank["mianjing-bank/\n面经库"]
        Plan["study-plan/\n学习计划"]
    end

    Tabs --> Storage
```

---

## 七、文件职责速查

```
InterviewPrep/
├── server.js              # Express 主服务，65 个 API 路由，SSE 流式推送
├── electron/
│   ├── main.js            # Electron 主进程，窗口管理，延迟启动网关
│   └── preload.js         # 预加载脚本，暴露安全的 IPC 接口
├── chatflow/
│   ├── engine.js          # 分析流水线编排（JD解析→简历解析→差距分析→押题生成）
│   ├── prompts.js         # 所有 LLM Prompt 模板（20+ 个 System Prompt）
│   ├── llm-client.js      # LLM 统一调用（ai-provider-kit / standalone 双后端）
│   ├── ai-provider.js     # AI 供应商连接管理（CRUD + 测试）
│   ├── standalone-llm.js  # 独立 LLM 降级模式
│   ├── conn-store.js      # 连接状态本地存储
│   ├── resume-parser.js   # 简历文件解析（PDF/DOCX/TXT → 文本）
│   ├── export-docx.js     # DOCX 文档生成（话术库/面经库导出）
│   └── nodes/
│       ├── mianjing.js     # 面经采集节点（opencli 搜索 + OCR + LLM 结构化）
│       ├── company-research.js  # 公司调研节点
│       └── opencli-setup.js     # OpenCLI 一键配置
├── public/
│   ├── index.html         # 单页应用主 HTML（11 个 Tab 区域）
│   ├── app.js             # 前端逻辑（~5000 行，状态管理 + API 调用 + UI 渲染）
│   ├── style.css          # 样式（亮色/暗色双主题，CSS 自定义属性）
│   ├── echarts.min.js     # ECharts 图表库（雷达图/饼图/热力图）
│   └── group-kb-embed.html # 群面知识库飞书嵌入页
├── knowledge/
│   ├── index.js           # 知识库搜索入口
│   ├── behavioral-questions.json  # 20 道通用行为面试题
│   ├── group-interview.json       # 群面讨论题库
│   ├── star-framework.json        # STAR 法则框架
│   └── general-qa.json            # 通用问答
├── .data/                 # 本地数据存储（JSON 文件，无数据库）
├── logs/                  # 错误日志
├── scripts/
│   └── gen-icon.js        # 图标生成脚本
├── TODO.md                # 实时任务清单
├── ARCHITECTURE.md        # 本文件
└── README.md              # 产品说明 + 启动指南
```