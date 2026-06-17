> 状态：🟢 已校验

# 14 · 技术栈速查（Agent Tech Stack Cheat Sheet）

> **定位**：把 Agent 工程的"零件箱"一次性铺开——编排框架、向量库、MCP/互操作协议、评估与可观测工具——并给出**场景 → 选型**的可查表。
> 这是一节**横向汇总节**：纵向的机制讲解在各专题里，本节负责把它们装进同一张选型坐标系。
> 上承 [[02]] Harness 运行时（框架=harness 的不同实现）、[[04]] 工具与 MCP、[[07]] 检索与 RAG、[[08]] 多智能体编排、[[09]] 评估、[[10]] 可观测性；旁参 [[16]] 训练/Agentic RL（基准即奖励信号）、[[17]] 身份与发现（去中心化协议）；下接 [[13]] 大厂案例与 [[15]] 面试题库。

---

## 1. TL;DR / 速览

**本节地图**：编排框架谱系（链式→图式→官方 SDK→轻量/编译式）→ 三个概念辨析（framework / runtime / harness）→ 历史脉络 → 向量库选型 → eval/obs 工具 → MCP 与互操作协议 → 主流争议 → 大厂实践 → 我的研判 → 选型矩阵 → 面试。

**核心结论（先看这 5 条）**：

1. **一句话主线**：LangChain 链式起步（2022）→ 按场景专用化（LlamaIndex 做检索 / AutoGen·CrewAI 做 multi-agent）→ LangGraph 用图式补上状态/循环/分支（2024）→ 模型厂商官方 SDK（OpenAI Agents / Claude Agent）收编中间层（2025）→ smolagents / Pydantic AI / Mastra 走极简与类型安全；**DSPy 是一条平行的"编译式"独立支线**。
2. **驱动演进的只有三股力**：表达力不足（链 → 图）、场景分化（通用 → 专用）、抽象之痛（重型 → 极简 / 官方 SDK）。看懂这三股力，任何新框架都能在坐标里定位。
3. **没有"最好的框架"，只有"匹配复杂度的框架"**。Anthropic、OpenAI 的一手指南都主张**先最简、必要时才加复杂度**；框架的价值随任务复杂度上升而显现，简单任务直连 API 往往更好调试。
4. **选型的真正自变量是五维**：控制力/抽象层级、状态与持久化（checkpointing）、可观测性（tracing）、token 成本、生态与 model-agnostic。把候选放进这五维打分，比看 GitHub star 有用得多。
5. **注意时态**（速查表最易过期的地方）：**AutoGen 已进入维护模式**，企业级继任者为 Microsoft Agent Framework（MAF）；**OpenAI Swarm 是实验项目，已被 Agents SDK 取代**；**Claude Code SDK 已于 2025-09 更名 Claude Agent SDK**。别把退役项当现役。

---

## 2. 定位与动机：技术栈在 Agent 链路中的位置

一个生产级 Agent，本质是"**模型 + harness + 工具 + 知识 + 评估/可观测**"五层的拼装。本节要回答的不是"某层怎么实现"（那是 [[02]]/[[04]]/[[07]] 的事），而是"**每一层市面上有哪些现成件、各自适配什么场景**"。

先把三个最容易混淆的概念钉死（这是面试高频辨析）：

- **编排框架（framework）**：提供 chains / agents / tools / memory 这类**高层抽象**，帮你少写胶水代码。代表：LangChain、LlamaIndex、CrewAI、AutoGen。
- **运行时（runtime）**：更低层、更贴近"像写代码"的执行底座，内建 durable execution、checkpointing、人类介入（HITL）、streaming、tracing，**对未来少做假设**。代表：LangGraph、Claude Agent SDK。Harrison Chase 在《Building LangGraph》里明说，runtime 的"最大对手是 no framework"。
- **Harness**：驱动一次 Agent 任务的**循环本体**——收集上下文 → 行动 → 验证（见 [[02]]）。framework/runtime 是 harness 的不同封装程度；最薄的 harness 可以就是一段手写 while 循环。

再叠加一组贯穿全节的辨析：**workflow（预定义代码路径编排 LLM）vs agent（LLM 自主决定流程与工具）**。Anthropic《Building Effective Agents》正是用这条线把"该不该上复杂框架"的争论拉到台前——它发现最成功的实现往往是**简单可组合的模式**（Prompt Chaining / Routing / Parallelization / Orchestrator-Workers / Evaluator-Optimizer），而非重型 agent 框架。

为什么要专门有"速查"这一节？因为 2024–2026 是框架的**寒武纪大爆发**，选型信息高度碎片化且**充满厂商利益视角**——LangChain 说该用 LangGraph、Pinecone 说别用 pgvector、Cognition 说别建 multi-agent。本节的任务就是把这些立场连同**各自的证据与适用边界**摆在一张表上，让你按场景而非按声量决策。

---

## 3. 历史发展脉络（2020 → 2026）

> 两条暗线：①**抽象层级在"加厚→减薄"间反复横跳**（链式重型 → 图式低层 → 官方极简 SDK）；②**工具/知识层在走向标准化**（碎片化集成 → MCP → 互操作协议族）。

- **2020 · RAG 命名**（Lewis et al., NeurIPS）。把"参数化记忆 + 非参数化向量索引"统一，奠定后续所有"向量库 + 检索 + LLM"技术栈的学术原点。*为什么*：知识层从此可热插拔。
- **2022-10 · ReAct 论文**（Yao et al.）。推理与行动交错，确立工具调用型 Agent 的概念骨架，是 LangChain Agent 等编排循环的理论母体。
- **2022-10 · LangChain 开源**（Harrison Chase，约 9 天写出首版）。GPT-3/ChatGPT 前夜，LLM 应用工具碎片化、缺统一抽象；LangChain 用 Chains 把 prompt+LLM+tool+memory 串成可组合管线，成为**第一个大规模采用的 LLM 应用框架**，奠定话语基线。
- **2022-11 · LlamaIndex**（原 GPT Index，Jerry Liu）。通用 Chain 不擅长把 LLM 接到私有/海量数据，LlamaIndex 专注索引+检索这一垂直问题——框架生态从"大一统"走向"专用化"。
- **2022-12 · DSP 论文**（Khattab et al., 2212.14024）。用程序化管线在 LM 与检索器间传递自然语言，而非手搓 prompt——"编译式 / programming-not-prompting"路线的种子。
- **2023-02 · Toolformer**（Schick et al.）。自监督学会调用 API，论证工具使用可被模型内化，深化"Agent 用工具"的学术基础。
- **2023-03 · Reflexion**（Shinn et al., NeurIPS 2023）。语言化自我反思 + 情景记忆做"口头强化学习"，为 Agent 长程记忆与自我纠错提供范式（详见 [[01]]/[[06]]）。
- **2023-08 · AutoGen 开源**（Wu et al., Microsoft）。把 multi-agent 对话作为一等抽象（GroupChat、嵌套对话），开启编排范式分叉，催生 CrewAI 等同类。
- **2023-09 · CoALA 认知架构**（Sumers & Yao et al., TMLR）。用工作/情景/语义/程序记忆 + 决策循环统一"语言智能体"，给框架对比提供学术分类坐标。
- **2023-10 · DSPy 论文**（Stanford NLP, 2310.03714）。承接 DSP，把 LM 调用抽象成 Signatures / Modules / Optimizers，用"编译器"按指标自动优化 prompt 甚至权重。
- **2023-12 · CrewAI 开源**（João Moura）。AutoGen 偏研究，CrewAI 用"角色扮演的 crew"把 multi-agent 协作做得更易上手，推动 multi-agent 在应用层普及。
- **2024-01 · LangGraph 发布**。生产级 agent 需要状态/循环/条件分支/HITL/断点续跑，线性 Chain 表达不了。LangGraph 用有状态图（StateGraph + checkpointer）把 agent 建成状态机——从"链式"到"图式"的关键跃迁，也是 LangChain 对"抽象过重"批评的低层化回应。
- **2024-02 · CodeAct**（Wang et al., ICML 2024）。用可执行代码作为统一动作空间，胜过 JSON/文本调用，成为 smolagents"代码即行动"的学术依据。
- **2024-10 · OpenAI Swarm（实验）面世；Mastra（TS 框架）作为内部实验启动**（2025 初开源、2026-01 发 v1.0）。轻量化与 TypeScript 生态信号：编排从重型 Python 向轻量 SDK / 前端栈扩散。
- **2024-11 · Anthropic 发布 MCP**。把"模型 ↔ 工具/数据"连接标准化，取代碎片化定制集成，成为 Agent 工具层事实标准（详见 [[04]]）。
- **2024-12 · Anthropic《Building Effective Agents》**。在框架军备竞赛中泼冷水：最成功的实现往往不用复杂框架，而用简单可组合模式。把"框架 vs 手写"之争推到台前。
- **2024-12 / 2025-01 · Hugging Face 开源 smolagents**（约 1000 行，CodeAgent 用代码表达动作）。对"抽象过重"的极简反弹，可沙箱执行。
- **2025-03-11 · OpenAI Agents SDK**（Swarm 的生产化继任）+《A practical guide to building agents》。模型厂商亲自下场，刻意最小抽象（Agents / Handoffs / Guardrails / Sessions / Tracing），与 Responses API 绑定，开启"官方 SDK 时代"。
- **2025-04 · LangChain《How to think about agent frameworks》**（Harrison Chase）。直接回应 OpenAI 指南，把"上下文工程"而非 agent 抽象放在核心。
- **2025-04 · Google ADK 开源**（Cloud Next）。云厂商下场：code-first multi-agent 框架，针对 Gemini 优化、经 LiteLLM model-agnostic，Python v1.0 生产可用。
- **2025-05 · AWS Strands Agents 开源**。model-driven SDK（声明 model+tools+prompt，框架托管 agentic loop）；1.0 于 2026 落地（TS/Py）。
- **2025-06 · Anthropic multi-agent 研究系统 与 Cognition《Don't Build Multi-Agents》同月发布**。两大厂在 multi-agent 上公开分歧，成为选型讨论的核心锚点（见 §6 争议四、[[08]]）。
- **2025-09 · Anthropic《Effective context engineering》+ Claude Code SDK 更名 Claude Agent SDK + Pydantic AI v1 + LangChain Agent Middleware（1.0，09-08）**。上下文工程与"低层 runtime/harness"成为主流叙事；类型安全/可观测优先的轻量框架定版；LangChain 把 `before_model`/`after_model` 钩子做成可组合中间件。
- **2025-10 · OpenAI AgentKit（DevDay 2025-10-06）**。在 Agents SDK 之上叠"可视化搭建套件"——Agent Builder 画布（beta）+ ChatKit（GA）+ Evals（GA）+ Guardrails + Connector Registry，官方栈从 SDK 向低代码/嵌入式 UI 扩张。
- **2025-11 · Anthropic《Code execution with MCP》**。把工具目录从上下文搬进代码、按需加载，某工作流 token 从 ~150k 降到 ~2k（-98.7%），挑战标准 tool-calling。
- **2026-01 · Mastra v1.0**。JS/TS 全栈开发者也有了一线 Agent 框架，编排生态跨越语言边界。
- **2026-04 · Microsoft Agent Framework 1.0 GA**。AutoGen 与 Semantic Kernel 统一为 MAF，二者转维护态——早期 multi-agent/编排框架正向官方整合栈收敛（见 §5 框架表与 §7 时态注脚）。

---

## 4. 核心概念与原理

### 4.1 智能体范式脉络（框架的"内核"）

任何编排框架的主循环都建立在四块学术基石上，先把它们串起来（深入见 [[01]]）：

```text
ReAct (2022)        : Thought → Action → Observation 交错循环（tool-use 主循环的原型）
   └─ Toolformer (2023) : 工具使用可被模型内化（API 调用是可学习行为）
   └─ Reflexion (2023)  : 语言化反思 + 情景记忆 → 不更新权重的"口头 RL"
   └─ CodeAct (2024)    : 把"动作"从 JSON 升级为可执行代码（更可组合）
CoALA (2023)        : 用 工作/情景/语义/程序 记忆 + 决策循环 统一语言智能体（分类坐标）
```

CoALA 的价值在于给"框架对比"提供了**分类轴**：一个框架在工作记忆（上下文窗口）、情景记忆（历史/会话）、语义记忆（向量库/KB）、程序记忆（工具/技能）上分别提供了什么——这正是 [[06]] 记忆系统的坐标。

> Toolformer 这条"**工具使用可被模型内化（API 调用是可学习行为）**"的线，是框架之外的另一条路径：与其在编排层接线工具，不如把工具调用作为**训练目标**直接训进模型——这条"工具训练范式"（含 Agentic RL 把工具调用纳入奖励信号）展开见 [[16]]。

### 4.2 编排范式的四种形态

```text
① 链式 (Chain)    : 线性管线 step1 → step2 → step3，表达力强但跑不了循环/分支
② 图式 (Graph)    : StateGraph，节点=步骤，边=条件转移；支持循环/分支/checkpointing/HITL
③ 对话式 (Conversation): 多个 agent 互发消息（GroupChat / handoff），靠"谁说话"驱动
④ 代码行动式 (Code-as-action): agent 直接输出可执行代码当动作（smolagents）
```

四种形态没有绝对优劣，对应不同任务类别（这正是 §6 争议之一：缺乏原则性判据）。粗略经验：**线性 RAG → 链式；有状态长流程 → 图式；松耦合分工 → 对话式；强组合/嵌套调用 → 代码行动式**。

### 4.3 选型五维（把任何框架打分的坐标系）

```text
维度1 控制力/抽象层级 : 高层抽象上手快(CrewAI/OpenAI handoffs) ←→ 低层可控(LangGraph/手写)
维度2 状态与持久化   : 是否内建 checkpointer / durable execution / 断点续跑
维度3 可观测性       : 原生 tracing(LangSmith/OTel) 还是要自己埋点
维度4 token 成本     : 多 agent ~15x / code-execution -98.7% / 全量工具 schema 的开销
维度5 生态/model-agnostic : 锁定单一模型厂商，还是跨模型可移植 + MCP 工具解耦
```

### 4.4 工具上下文效率：全量 schema vs 按需加载

经典 tool-calling 在启动时把**所有工具的 JSON schema** 声明进上下文，工具一多就吃光预算。Anthropic《Code execution with MCP》给出反范式：把 MCP server 暴露成文件系统上的代码 API，让 agent **写代码按需 import 工具定义**——一个原本 ~150k token 的工作流降到 ~2k（-98.7%）。这把"工具层"与"上下文层"解耦，是 [[03]]/[[04]] 的交叉点。

```text
经典 tool-calling           code-execution-with-MCP
启动即注入全部 tool schema    工具=文件系统上的代码 API
  → 上下文随工具数膨胀          agent 写代码 import 按需读取
  → 易校验、易审计、主流默认     → token 大降、可组合，但需沙箱与安全治理
```

---

## 5. 主流方法谱系（横向对比表）

### 5.1 编排框架 × 维度

| 框架 | 形态/层级 | 状态/持久化 | 原生可观测 | multi-agent | 语言 | 最佳场景 | 维护状态·继任者 |
|---|---|---|---|---|---|---|---|
| **LangChain** | 链式·高层 | 弱（链本身无状态） | LangSmith | 借 LangGraph | Py/JS | 线性 RAG、文档 QA、快速原型 | 现役（1.0） |
| **LangGraph** | 图式·低层 runtime | 强（checkpointer/durable） | LangSmith/OTel | 内建（supervisor 等） | Py/JS | 复杂有状态工作流、HITL、长流程 | 现役·官方主推 |
| **LlamaIndex** | 检索专用 | 中 | 自带 | Workflows | Py/TS | RAG / 数据 QA / agentic retrieval | 现役 |
| **AutoGen** | 对话式·multi-agent | 中 | 自带 | 一等抽象（GroupChat） | Py | multi-agent 研究/原型 | **已并入 MAF（1.0 GA 2026-04）转维护** |
| **CrewAI** | 角色·multi-agent | 中 | 自带 | crew/role | Py | 易上手的角色分工协作 | 现役 |
| **OpenAI Agents SDK** | 官方·极简 | Sessions | 内建 tracing | handoffs | Py/JS | OpenAI 生态、最小抽象 | 现役（Swarm 继任） |
| **Claude Agent SDK** | 官方·harness | 上下文管理/hooks | 复用 Claude Code | subagents | Py/TS | 通用 agent runtime、编码+非编码 | 现役（原 Claude Code SDK） |
| **smolagents** | 代码行动·极简 | 弱 | 自带 | 有限 | Py | 代码 Agent、千行可读、教学 | 现役 |
| **Pydantic AI** | 轻量·类型安全 | 中 | OpenTelemetry | 有限 | Py | 结构化输出、生产可靠、可观测 | 现役（v1） |
| **Mastra** | TS 全栈 | 内建 | 内建 | 有 | TS | JS/TS 全栈 agent + workflow + RAG | 现役（v1.0） |
| **DSPy** | 编译式·正交 | — | — | — | Py | 自动 prompt/权重优化、跨任务移植 | 现役（独立支线） |

> 速查口径：**线性 RAG/文档 QA → LangChain/LlamaIndex；复杂有状态工作流 → LangGraph；multi-agent 协作 → CrewAI（AutoGen 已转 MAF）；官方生态/可观测 → OpenAI/Claude Agent SDK；轻量/代码 Agent → smolagents/Pydantic AI；TS 全栈 → Mastra；需自动优化 → DSPy。**

#### 5.1.1 2025–2026 新成员速记（官方栈扩张 + LangChain 扩展层）

> 上表是"稳定主力"；下表收口最近一年涌入的官方栈与扩展层——印证 §8 的"中间层被两头挤压"：上方云厂商/模型厂官方框架（ADK / Strands / AgentKit）下场，旁侧 LangChain 用 Deep Agents / Middleware 把"规划+subagent+可插拔钩子"沉到 LangGraph 之上。

| 新成员 | 出处 · 时间 | 定位 / 是什么 | 维护状态·继任者 |
|---|---|---|---|
| **Google ADK**（Agent Development Kit） | Google · 2025-04-09（Cloud Next 开源） | code-first multi-agent 框架，针对 Gemini 优化、经 LiteLLM model-agnostic | 现役（Python v1.0 生产可用） |
| **AWS Strands Agents** | AWS · 2025-05-16 开源 | model-driven SDK：声明 model+tools+prompt，框架托管 agentic loop | 现役（1.0 于 2026：TS 04-30 / Py 05-21） |
| **OpenAI AgentKit** | OpenAI · DevDay 2025-10-06 | 可视化搭建套件：Agent Builder 画布 + ChatKit + Evals + Guardrails + Connector Registry | 现役（Agent Builder beta；ChatKit/Evals GA） |
| **LangChain Deep Agents** | LangChain · 开源 | 规划（`write_todos`）+ subagent（`task`，隔离上下文）+ 虚拟文件系统，model-neutral | 现役（开源） |
| **LangChain Agent Middleware** | LangChain · 2025-09-08（1.0） | 围绕 agent loop 的可插拔/可组合中间件，钩子 `before_model` / `after_model` / `modify_model_request` | 现役（随 LangChain 1.0） |

> 📦 结案框：**提出（2023）** AutoGen 把 multi-agent 对话立为一等抽象、开启编排范式分叉 → **2026 定论** AutoGen + Semantic Kernel 统一为 Microsoft Agent Framework（1.0 GA，2026-04）、二者转维护态，OpenAI Swarm 亦早被 Agents SDK 取代 → **现状** 选型默认收敛到官方/整合栈（MAF、OpenAI Agents SDK、Claude Agent SDK，外加 Google ADK / AWS Strands 等云厂官方框架），第三方重型框架退守"集成层 + 可观测层"。

### 5.2 向量库 × 维度（知识层）

底层算法两条主线：**HNSW**（图索引，对数级搜索 + 高召回，几乎所有现代库默认）与 **IVF + 量化**（倒排 + PQ/二值量化，省内存、规模友好，FAISS 奠基）。选型权衡见下表（深入见 [[07]]）。

| 向量库 | 默认索引 | 部署形态 | 过滤/混合检索 | 量化 | 最佳规模/场景 |
|---|---|---|---|---|---|
| **pgvector** | HNSW/IVFFlat | Postgres 扩展 | 复用 SQL where | 有限 | ~5–50M 以下，复用既有 PG，省一套基建 |
| **Pinecone** | 专有(HNSW 系) | serverless 托管 | 强、低调参 | 有 | 水平扩展、零运维、目标延迟开箱即得 |
| **Qdrant** | HNSW | 自托管/云 | filter-first | 二值/标量/PQ | 高性能过滤检索、二值量化省内存 ~32x |
| **Weaviate** | HNSW | 自托管/云 | filter-first allow-list | 有 | 开箱 hybrid + rerank + filter |
| **Milvus** | HNSW/IVF/DiskANN | 分布式 | 强 | 丰富 | 十亿级、多索引、重型分布式 |
| **Chroma** | HNSW | 嵌入式/轻量 | 基础 | 有限 | 本地原型、小规模、快速起步 |
| **FAISS** | IVF/HNSW/PQ | 库（非服务） | 需自建 | 丰富（GPU/PQ） | 自建检索、研究、十亿级 GPU 搜索 |

> 量化是规模的杠杆：Qdrant 的二值量化约 32x 内存缩减、最高 40x 提速，生产模式 = 量化向量 + HNSW 常驻 RAM、原始向量落盘，检索时量化召回候选再用原始向量 **rescoring** 恢复 recall——速度/召回在查询时可调。

> 📦 结案框（RAG vs 长上下文，"还需不需要向量库？"）：该悬案已由 **Self-Route**（Google，**arXiv:2407.16833**）收敛——**资源充足时长上下文的质量略优，但 RAG 成本低得多**；Self-Route 按需在二者间路由，降本 **~65%（Gemini-1.5-Pro）/ ~39%（GPT-4o）** 且质量基本持平。结论：知识层不是"长上下文取代向量库"，而是按查询路由，向量库仍是成本下限。（机制展开见 [[07]]）

### 5.3 eval / obs 工具（评估与可观测层）

| 类别 | 代表 | 作用 | 关联 |
|---|---|---|---|
| 通用 agent 基准（经典） | AgentBench | 8 个真实环境评 LLM-as-Agent 推理/决策 | [[09]] |
| 通用助手 / 深研 agent | GAIA | 466 题、人易（92%）模型难（GPT-4+插件 15%）、答案唯一好评分；反向出题抗饱和，综合推理+多模态+浏览+工具 | [[09]] |
| 编码 agent（**已退役**） | SWE-bench Verified | 500 题真实 GitHub 修复；OpenAI 2026-02-23 退役——前沿模型可逐字复现 patch（污染）+ 约 60% 剩余失败题测试有缺陷 | [[09]] |
| 编码 agent（继任） | SWE-bench Pro | 1865 长程任务 / 41 仓库；抗污染三段式（公开 copyleft + held-out + 商业私有仅发结果） | [[09]] |
| 终端 / CLI agent | Terminal-Bench | NL 指令 + Docker + 测试 + oracle；v2.0 共 89 难任务，前沿 <65% | [[09]] |
| 工具 / 客服对话 agent | τ²-bench (tau2) | dual-control（agent 与 user 共改共享状态）+ telecom 域；τ-bench 继任 | [[09]] |
| 编码（时间窗口抗污染） | LiveCodeBench | 按竞赛平台发布日取题，规避训练污染 | [[09]] |
| 评判方法 | MT-Bench / LLM-as-a-judge | 强 LLM 当裁判，与人类偏好 >80% 一致 | [[09]] |
| 评测综述 | LLM-Agent Eval Survey(2025) | 能力/应用基准/成本-可靠性/可观测维度 | [[09]] |
| 可观测 SaaS | LangSmith / Braintrust | trace/span、回放调试、评测集 | [[10]] |
| 可观测开源 | Langfuse / Phoenix | 自托管 tracing + 评测 | [[10]] |
| 标准 | OpenTelemetry GenAI 语义约定 | 跨厂商 trace 标准化 | [[10]] |

> 基准更替趋势：饱和 + 污染的旧码基准（**SWE-bench Verified 已于 2026-02 退役**）正让位于**长程、抗污染、真实环境**的新一代（SWE-bench Pro / Terminal-Bench / τ²-bench / LiveCodeBench）；这些基准既是评估口径，也是 agentic RL 的训练 / 奖励信号来源（训练侧见 [[16]]，评估方法学见 [[09]]）。

### 5.4 MCP 与 Agent 互操作协议（连接层）

| 协议 | 解决什么 | 通信形态 | 阶段定位 |
|---|---|---|---|
| **MCP** (Anthropic, 2024-11) | 模型 ↔ 工具/数据 连接标准化 | JSON-RPC client-server | 工具访问层（事实标准） |
| **ACP** | 通用 agent 消息（多模态/会话） | RESTful HTTP + MIME 多部分 | 结构化多模态消息 |
| **A2A** | agent ↔ agent 协作任务 | Agent Card 发现 + HTTP（v1.0，2026） | 协作执行 |
| **ANP** | 去中心化 agent 发现/市场 | W3C DID + JSON-LD | 开放网络/市场 |
| **身份 / 支付层** | agent 身份验证、能力发现与机器对机器结账 | DID / Agent Card / 支付协议族 | 连接层之上的信任与交易（详见 [[17]]） |

> 注：此 **ACP** 指 IBM/BeeAI 的 Agent Communication Protocol（通用多模态消息），与 [[17]] 的 **Agentic Commerce Protocol**（OpenAI + Stripe 的结账协议）同名不同物。
>
> 互操作 survey（Ehtesham et al., **arXiv:2505.02279**, 2025）给的采用路线：**MCP 工具 → ACP 多模态消息 → A2A 协作 → ANP 去中心市场**；此路线出自该综述，**2026 已演进**（A2A 已发布 v1.0 稳定规范、走 Agent Card 发现）。其中 ANP 一档的去中心化**发现 / 身份 / 信任**专门机制（NANDA Index、Verified AgentFacts 等）详见 [[17]]。连接层完整四层栈（纵向 MCP / 横向 A2A / 身份 / 支付）与 2026 进展见 [[17]]。但治理仍开放：工具描述/第三方 server 可引发间接 prompt 注入，信任与权限模型尚无成熟方案（见 [[12]] 与 §8）。

---

## 6. 主流观点与争议（各方代表 + 论据）

**争议一 · LangChain 抽象是否过重？**
- *过重/漏抽象派*：Octomind（Fabian Both 等）在生产用 LangChain 12+ 个月后弃用，理由是"抽象叠抽象、被迫调试自己没写的框架代码、读巨大 stack trace、对'agent 派生 subagent'太僵硬"——结论是"只增加复杂度，看不到收益"。Hacker News 大量开发者附议。
- *辩护派*：Harrison Chase / LangChain 主张好抽象是降低上手门槛的心智模型；LangGraph 本就是兼具声明式 + 命令式的**低层**编排，需要细粒度控制时可下沉；1.0 用结构化 content blocks、agent loop、middleware 提升灵活性。

**争议二 · 该用框架还是直接手写（roll-your-own）？**
- *少用框架派*：Anthropic（Erik Schluntz、Barry Zhang《Building Effective Agents》）+ OpenAI 极简 SDK + 众多直连 API 实践者。论据：多数最成功实现用简单可组合模式，框架的层层抽象遮蔽底层 prompt/响应、增加调试难度；原则是"先最简，必要时才加复杂度"。
- *用框架派*：LangChain / CrewAI / LlamaIndex 等厂商。论据：框架自带集成、记忆、工具接线、可观测（LangSmith）与多模型标准化，避免重复造轮子，随复杂度上升收益更明显。

**争议三 · Prompt 手工工程 vs 编译式/声明式程序（DSPy）？**
- *编译式派*：Omar Khattab / Stanford NLP。手搓 prompt 脆弱难维护，应写"程序"并用优化器（MIPRO）按指标自动编译出最优 prompt/权重，"programming, not prompting"；据社区/文档报道有团队在生产中采用为佐证。
- *务实/怀疑派*：DSPy 自身又引入一层抽象与学习成本，优化过程不透明、可能费 token；新模型/分布外能否稳定泛化存疑，手工 prompt 在实践中仍占主流。

**争议四 · multi-agent vs 单线程智能体，谁更可靠？**（选型核心锚点）
- *multi-agent 派*：Anthropic《How we built our multi-agent research system》。lead(Opus 4) + subagent(Sonnet 4) 的 orchestrator-worker 在内部研究评测上比 single-agent 高 **90.2%**；但约耗 **15x token**（single-agent ~4x），据该文 token 用量单独即解释约 80% 性能方差——只适合高价值、可并行、超单上下文窗口的广度任务。
- *单线程派*：Cognition《Don't Build Multi-Agents》。两条原则：①共享完整上下文 ②每个 action 都隐含决策，不能让 subagent 各自冲突决策。曾给 Devin 接 MCP 去 spawn 子 Devin，结果"混乱"；主张单线程线性 agent，必要时用专门模型压缩历史。两文同在 2025-06 公开对立（详见 [[08]]）。

**争议五 · 代码即行动 vs JSON 工具调用？**
- *代码派*：CodeAct（Xingyao Wang et al., ICML 2024）/ smolagents / Anthropic code-execution-with-MCP。可执行代码表达力更强、可嵌套/可组合、步骤更少、对象传递更自然。
- *JSON 派*：主流 OpenAI / Pydantic AI 风格。结构化 function-calling 更易校验、更安全、易审计，官方 SDK 默认采用。

**争议六 · 重型一体化框架 vs 轻量 SDK + MCP 标准化？**
- *一体化派*：LangChain/LlamaIndex 开箱即用、生态全。
- *解耦派*：轻量 SDK + MCP 解耦工具层，避免锁定、可移植（Anthropic、互操作 survey 作者）。

**争议七 · 高层 agent 抽象 vs 低层可控 runtime？**
- *高层派*：OpenAI Agents SDK / CrewAI / AutoGen 的 handoffs/roles/crews 上手快。
- *低层派*：LangGraph / Claude Agent SDK（Harrison Chase）。抽象会掩盖上下文控制，应用低层 runtime + 显式上下文工程。

**争议八 · 向量检索用专用向量库还是 pgvector？（以及"长上下文是否取代向量库"）**
- *专用引擎派*：Pinecone/Qdrant/Weaviate/Milvus 在过滤延迟、量化、规模上更优。
- *pgvector 派*：复用既有 Postgres，~5–50M 向量以下最省钱最简单，避免多一套基建。Pinecone 自家博客反驳称 pgvector 大规模需大量应用层工程（分片/调参）——注意这是厂商视角，应与第三方基准对照看。
- *"长上下文取代检索"的更上位争论*已收敛：**Self-Route**（Google，arXiv:2407.16833）显示资源足时长上下文质量略优、RAG 成本低得多，按需路由降本 ~65%(Gemini-1.5-Pro)/~39%(GPT-4o)——向量库仍是成本下限，不被取代（详见 §5.2 结案框）。

---

## 7. 大厂工程实践（≥2 案例 + 取舍拆解）

**案例 A · LinkedIn agent 平台（框架 + 自研外壳的折中）**
LinkedIn 用 **LangGraph 定义控制流**，但外面包一层**无状态 agent-lifecycle service**，把会话记忆与经验记忆**外置**以水平扩展；用 gRPC 定义 agent、消息系统做 multi-agent 协同、OpenTelemetry/LangSmith 做可观测。取舍本质：**借框架的编排表达力，但不让框架托管状态**——状态外置才能在生产横向扩容。这是"框架 vs 手写"之争的现实第三条路（来源：LinkedIn Engineering《The LinkedIn Generative AI Application Tech Stack》，2025，见 §10 参考）。

**案例 B · Uber QueryGPT（从 naive RAG 迭代到 multi-agent 流水线）**
内部 NL2SQL：从简单 RAG 起步，经 **20+ 次迭代**演进成 multi-agent 流水线（意图 agent / 领域 agent / 表 agent / 列 agent 等），建表查询时间从 ~10min 降到 ~3min（约 -70%）。取舍：单轮 RAG 在真实业务的歧义/多业务域上不够，**把检索拆成职责单一的 agent 链**才稳——印证 agentic retrieval 取代 naive RAG 的趋势（来源：Uber Engineering《QueryGPT》，2024，见 §10 参考；该趋势的机制展开见 [[07]]）。

**案例 C · Anthropic multi-agent 研究系统（接受 15x token 换 90.2% 质量）**
选 lead + subagent 的 orchestrator-worker 做广度优先研究；明确把适用域**限定**在高价值、可并行、超单上下文窗口的任务，**不用于编码等强耦合场景**。工程取舍：用 token 成本换并行广度，且把"何时不该用 multi-agent"写进设计文档——是"multi-agent 有用，但有严格边界"的一手背书。

**案例 D · Cursor 代码库索引（自建可控 + 安全工程）**
服务端生成 embedding、用 **Merkle 树**只上传变更文件做增量同步（约每 5 分钟），按 chunk 哈希缓存（团队复用秒级）；为隐私**只存 embedding 不存明文、混淆路径**。取舍：保留向量检索的语义召回，用安全 + 缓存工程抵消其成本/延迟/隐私劣势——与"放弃向量库走 agentic grep"的 Claude Code 形成对照（见 [[13]]）。

> 时态注脚（速查表必须标）：**OpenAI 从 Swarm（2024-10 实验）→ Agents SDK（2025-03 生产）**，刻意最小抽象，挤压第三方框架中间层；**AutoGen 转社区维护，企业继任者为 Microsoft Agent Framework**——早期 multi-agent 框架正向官方/整合栈收敛。

---

## 8. 我的分析与判断

> **以下为分析观点（非事实陈述），是我对证据的独立研判，可能与主流不同。**

**趋势研判**。第一，**中间层正在被两头挤压**。上方是模型厂商的官方 SDK（OpenAI Agents / Claude Agent），下方是 MCP + 轻量 runtime（LangGraph / 手写）。夹在中间"既不够薄又不够全"的重型一体化框架（典型是早期 LangChain Agent、AutoGen）会被迫**退守为"集成层 + 可观测层"**——它们的护城河不再是 agent 抽象，而是 LangSmith 这样的 tracing/eval 生意。AutoGen 并入 MAF、Swarm 被官方 SDK 取代，都是同一条收敛曲线上的点。第二，**框架与手写之争会随复杂度"钟摆回摆"，但回摆点在上移**：模型越强、工具越标准化（MCP），同等复杂度下手写的可行区间越大，所以"先最简"会越来越对——框架真正不可替代的是**状态持久化、HITL、断点续跑、跨团队可观测**这些"生产基建"，而非 prompt 拼接。第三，**编译式（DSPy）短期仍是利基而非主流**：它在"有明确指标 + 多阶段管线 + 愿意花 token 优化"的团队里赢，但对多数"prompt 改两行就上线"的场景属于过度工程；它的真正归宿可能是被**吸收进框架的一个可选优化器**，而非独立框架。

**常见坑**（按踩雷频率排序）：① **照搬厂商博客选型**——Pinecone 说别用 pgvector、LangChain 说该用 LangGraph，都带利益视角，必须与第三方基准/自身 A/B 对照。② **速查表用了过期项**——把 Swarm/旧 AutoGen 当现役写进架构文档。③ **过早上 multi-agent**——没量过"是否可并行、是否超单窗口、是否高价值"就拆，结果吃 15x token 还更不稳。④ **全量工具 schema 撑爆上下文**——工具一多不做按需加载/code-execution，token 预算被 schema 吃光。⑤ **向量库选型只看 recall 不看过滤延迟/量化/新鲜度**——生产瓶颈常在带过滤的 ANN 和增量更新，而非裸召回。⑥ **框架托管了状态却要横向扩展**——LinkedIn 的教训是状态必须外置。⑦ **没有可观测就上生产**——agent 高延迟、非确定、不可靠，没有 trace 等于盲飞（见 [[10]]）。

**最佳实践（我的默认配方）**：(1) **从最薄开始**——single-agent + 手写循环或官方 SDK，量到瓶颈再加层。(2) 选型走**五维打分**（控制/状态/可观测/成本/生态），不看 star。(3) **工具层用 MCP 解耦**，避免被单一框架锁定；工具多时上 code-execution。(4) 向量库**默认 pgvector 起步**，过 ~50M / 需重过滤 + 量化时再迁专用库。(5) **可观测第一天就接**（OTel/LangSmith/Langfuse），把成本/延迟/工具失败率埋进 trace。(6) multi-agent 只在"可并行 × 超窗 × 高价值"三条同时满足时上，且明确写下不适用边界。(7) 选型文档**标时态与厂商立场**，每季度复核——这一行业的"速查"半衰期以月计。

---

## 9. 面试考点

> 本节按概念/系统设计/手写/陷阱四类给本章高频考点；更系统的题库与答法见 [[15]]。

**概念题**
1. **framework / runtime / harness 三者怎么区分？** 要点：harness = 驱动一次任务的循环本体（收集上下文→行动→验证）；framework = 高层抽象（chains/agents/memory）；runtime = 低层执行底座（checkpointing/durable/HITL/streaming），"最大对手是 no framework"。LangChain 偏 framework、LangGraph/Claude Agent SDK 偏 runtime。
2. **workflow 与 agent 的边界？** 要点：workflow = 预定义代码路径编排 LLM；agent = LLM 自主决定流程与工具。Anthropic 主张能用 workflow 就别上 agent，五种可组合模式（chaining/routing/parallelization/orchestrator-workers/evaluator-optimizer）覆盖大量场景。
3. **HNSW 与 IVF+量化的取舍？** 要点：HNSW 图索引对数级搜索、高召回、内存占用大，几乎所有库默认；IVF+PQ/二值量化省内存、规模友好（FAISS 系），生产常用量化召回 + 原始向量 rescoring 找回 recall。
4. **MCP 解决什么？与纯 function calling 的关系？** 要点：MCP 把"模型↔工具/数据"连接标准化（JSON-RPC client-server），取代碎片化定制集成，是工具层事实标准；function calling 是模型侧能力，MCP 是连接/分发标准，二者互补。code-execution-with-MCP 进一步把工具按需加载（-98.7% token）。

**系统设计题**
- **为一家公司选型 Agent 技术栈（客服 + 内部知识问答 + 代码助手三条线）。** 要点：先按场景分治——客服走官方 SDK + guardrails + HITL；知识问答走 LlamaIndex/LangGraph + 向量库（pgvector 起步）+ hybrid/rerank；代码助手走 agentic grep + 语义混合。横向统一：MCP 解耦工具层、OTel/LangSmith 统一可观测、状态外置以横向扩展。给出"何时上 multi-agent / 何时上专用向量库 / 何时上 DSPy"的判据，并标注 AutoGen→MAF、Swarm→Agents SDK 的时态。

**手写题**
- **写出"按五维给框架打分 + 路由到推荐栈"的伪代码。**
```python
def pick_stack(task):
    score = {
        "control":   needs_loops_branches_HITL(task),   # 维度1
        "state":     needs_durable_checkpoint(task),     # 维度2
        "obs":       needs_native_tracing(task),         # 维度3
        "cost":      token_budget(task),                 # 维度4
        "ecosystem": model_lock_in_tolerance(task),      # 维度5
    }
    if task.kind == "linear_rag":      return "LangChain / LlamaIndex"
    if score["control"] and score["state"]: return "LangGraph"   # 有状态复杂流
    if task.multi_agent and parallelizable(task) and beyond_one_window(task):
        return "CrewAI / multi-agent (注意 ~15x token)"
    if task.ecosystem == "openai":     return "OpenAI Agents SDK"
    if task.ecosystem == "anthropic":  return "Claude Agent SDK"
    if task.lang == "ts":              return "Mastra"
    if task.needs_auto_opt:            return "DSPy (编译式)"
    return "手写循环 + 官方 SDK"   # 默认最薄
```

**陷阱题**
1. **"用 AutoGen 做 multi-agent 是当前最佳选择，对吗？"** 反驳点：AutoGen 已转**维护模式**，企业继任者是 Microsoft Agent Framework（MAF）；且 multi-agent 有严格适用边界（可并行 × 超窗 × 高价值），否则 15x token 不值。速查表勿把退役项当现役。
2. **"向量检索一定要上专用向量库（Pinecone/Milvus）？"** 反驳点：~5–50M 向量以下 pgvector 复用 Postgres 最省，专用库的过滤/量化/serverless 优势要到规模/重过滤场景才兑现；Pinecone 贬低 pgvector 的博客是厂商视角。
3. **（加问）"DSPy 能取代 prompt engineering 成为主流吗？"** 反驳点：编译式引入额外抽象/学习成本、优化不透明、跨模型泛化存疑，目前仍是研究/高级团队利基，可能被吸收为框架的可选优化器而非独立主流。

---

## 10. 参考文献

### 📄 论文
- Lewis et al. — **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks** (2020, NeurIPS) · https://arxiv.org/abs/2005.11401 · RAG 命名之作，统一参数化+非参数化记忆，向量库技术栈的学术原点。
- Yao et al. — **ReAct: Synergizing Reasoning and Acting in Language Models** (2022) · https://arxiv.org/abs/2210.03629 · 推理-行动交错，工具调用型 Agent 主循环的理论母体。
- Schick et al. — **Toolformer: LMs Can Teach Themselves to Use Tools** (2023) · https://arxiv.org/abs/2302.04761 · 自监督学会调用 API，论证工具使用可被模型内化。
- Shinn et al. — **Reflexion: Language Agents with Verbal Reinforcement Learning** (2023, NeurIPS) · https://arxiv.org/abs/2303.11366 · 语言化反思+情景记忆的"口头 RL"，奠定自我纠错/记忆。
- Wang et al. — **AutoGen: Multi-Agent Conversation Framework** (2023, Microsoft) · https://arxiv.org/abs/2308.08155 · 把 multi-agent 对话作为一等抽象，multi-agent 编排范式来源。
- Khattab et al. — **DSPy: Compiling Declarative LM Calls into Self-Improving Pipelines** (2023, Stanford) · https://arxiv.org/abs/2310.03714 · Signatures/Modules/Optimizers + 编译器，"programming, not prompting"。
- Khattab et al. — **Demonstrate-Search-Predict (DSP)** (2022) · https://arxiv.org/abs/2212.14024 · 程序化管线组合检索与 LM，DSPy 的直接前身。
- Opsahl-Ong et al. — **Optimizing Instructions and Demonstrations (MIPRO)** (2024) · https://arxiv.org/abs/2406.11695 · DSPy 核心优化器，联合优化多模块指令与少样本示例。
- Wang et al. — **Executable Code Actions Elicit Better LLM Agents (CodeAct)** (2024, ICML) · https://arxiv.org/abs/2402.01030 · 可执行代码统一动作空间，优于 JSON/文本调用，smolagents 学术依据。
- Sumers & Yao et al. — **Cognitive Architectures for Language Agents (CoALA)** (2023, TMLR) · https://arxiv.org/abs/2309.02427 · 工作/情景/语义/程序记忆+决策循环，框架对比的分类坐标。
- Wang et al. — **A Survey on LLM-based Autonomous Agents** (2023, RUC) · https://arxiv.org/abs/2308.11432 · profile/memory/planning/action 三维综述，技术栈统一框架。
- Xi et al. — **The Rise and Potential of LLM Based Agents: A Survey** (2023, Fudan) · https://arxiv.org/abs/2309.07864 · 86 页脑-感知-行动框架综述，被广泛引用的脉络图。
- Liu et al. — **AgentBench: Evaluating LLMs as Agents** (2023, Tsinghua) · https://arxiv.org/abs/2308.03688 · 首个系统化 Agent 基准，8 个真实环境评推理/决策。
- Mialon et al. — **GAIA: a benchmark for General AI Assistants** (2023, Meta/HF) · https://arxiv.org/abs/2311.12983 · 466 道"人易 92% / 模型难（GPT-4+插件 15%）、答案唯一好评分"的通用助手题，反向出题抗饱和。
- Zheng et al. — **Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena** (2023) · https://arxiv.org/abs/2306.05685 · 强 LLM 当裁判与人类偏好 >80% 一致，LLM-as-judge 奠基。
- Yehudai et al. — **A Survey on Evaluation of LLM-based Agents** (2025) · https://arxiv.org/abs/2503.16416 · 能力/应用基准/框架/成本-可靠性五视角，eval/obs 选型参照。
- Mohammadi et al. — **Evaluation and Benchmarking of LLM Agents: A Survey** (2025, KDD) · https://arxiv.org/abs/2507.21504 · 按交互/目标/方法学梳理 Agent 评测与基准。
- Scale AI — **SWE-bench Pro** (2025) · https://arxiv.org/abs/2509.16941 · 1865 长程任务/41 仓库，抗污染三段式（公开 copyleft + held-out + 商业私有仅发结果），SWE-bench Verified 退役后的编码继任基准。
- Stanford & Laude Institute — **Terminal-Bench** (2026) · https://arxiv.org/abs/2601.11868 · 终端/CLI agent 基准（NL 指令+Docker+测试+oracle）；v2.0 共 89 难任务、前沿 <65%（tbench.ai）。
- Sierra — **τ²-bench (tau2-bench)** (2025) · https://arxiv.org/abs/2506.07982 · dual-control 共享状态 + telecom 域，τ-bench(https://arxiv.org/abs/2406.12045) 继任。
- LiveCodeBench team — **LiveCodeBench** (2024) · https://arxiv.org/abs/2403.07974 · 按竞赛平台发布日取题的时间窗口抗污染编码基准。
- Malkov & Yashunin — **HNSW: Hierarchical Navigable Small World Graphs** (2016/2018, IEEE TPAMI) · https://arxiv.org/abs/1603.09320 · 对数级 ANN 搜索，几乎所有现代向量库默认索引。
- Johnson et al. — **Billion-scale Similarity Search with GPUs (FAISS)** (2017, Meta) · https://arxiv.org/abs/1702.08734 · GPU 十亿级相似度搜索 + 乘积量化，向量检索工程基石。
- Han et al. — **A Comprehensive Survey on Vector Database** (2023) · https://arxiv.org/abs/2310.11703 · 按 hash/tree/graph/quantization 分类 ANNS，向量库学术总览。
- Hou et al. — **Model Context Protocol (MCP): Landscape, Security Threats, and Future Research Directions** (2025) · https://arxiv.org/abs/2503.23278 · 首篇 MCP 生态学术分析：server 生命周期与各阶段安全风险。
- Ehtesham et al. — **A Survey of Agent Interoperability Protocols: MCP, ACP, A2A, ANP** (2025) · https://arxiv.org/abs/2505.02279 · 四协议对比 + 分阶段采用路线（MCP→ACP→A2A→ANP）。

### ✍️ 博客与工程文（优先一手）
- Anthropic — **Building Effective Agents** (2024) · https://www.anthropic.com/research/building-effective-agents · workflow vs agent + 五种可组合模式，"最简优先"纲领文。
- Anthropic — **How we built our multi-agent research system** (2025) · https://www.anthropic.com/engineering/multi-agent-research-system · orchestrator-worker +90.2% 但 ~15x token，multi-agent 适用边界。
- Cognition — **Don't Build Multi-Agents** (2025) · https://cognition.ai/blog/dont-build-multi-agents · 共享上下文 + 单线程线性 agent，multi-agent 反方代表。
- Anthropic — **Effective context engineering for AI agents** (2025) · https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents · just-in-time 检索/compaction/subagent 隔离上下文。
- Anthropic — **Code execution with MCP** (2025) · https://www.anthropic.com/engineering/code-execution-with-mcp · 工具暴露为代码 API 按需加载，token -98.7%。
- Anthropic — **Building agents with the Claude Agent SDK** (2025) · https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk · Claude Code harness 通用化，循环=收集上下文→行动→验证。
- Anthropic — **Introducing the Model Context Protocol** (2024) · https://www.anthropic.com/news/model-context-protocol · MCP 官方发布，工具层开放标准。
- OpenAI — **A practical guide to building agents** (2025) · https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/ · agent=model+tools+instructions，handoffs/guardrails 一手原语。
- LangChain (Harrison Chase) — **How to think about agent frameworks** (2025) · https://blog.langchain.com/how-to-think-about-agent-frameworks/ · 反驳 OpenAI 极简主义，上下文工程才是核心难点。
- LangChain — **Building LangGraph: Designing an Agent Runtime from first principles** (2025) · https://blog.langchain.com/building-langgraph/ · 低层 runtime 设计哲学，"最大对手是 no framework"。
- LangChain — **The best AI agent frameworks** (2025) · https://www.langchain.com/resources/ai-agent-frameworks · 官方横评与"做 Agent 用 LangGraph"选型口径。
- Octomind (Fabian Both) — **Why we no longer use LangChain** (2024) · https://www.octomind.dev/blog/why-we-no-longer-use-langchain-for-building-our-ai-agents · "抽象过重"阵营最常被引用的实战檄文。
- Hugging Face — **Introducing smolagents** (2024) · https://huggingface.co/blog/smolagents · 约千行核心、默认代码 Agent，极简编排路线。
- Hugging Face — **smolagents: agents that think in code** (docs, 2025) · https://huggingface.co/docs/smolagents/en/index · CodeAgent 输出可执行 Python，安全靠受限 import + 沙箱。
- Pydantic — **Pydantic AI v1: A Predictable & Robust GenAI Framework** (2025) · https://pydantic.dev/articles/pydantic-ai-v1 · 类型安全 + OpenTelemetry + 内建评测的轻量框架。
- LlamaIndex — **RAG is Dead, Long Live Agentic Retrieval** (2025) · https://www.llamaindex.ai/blog/rag-is-dead-long-live-agentic-retrieval · naive 单轮 RAG 不足，agentic 多轮迭代检索。
- Qdrant — **Binary Quantization: Vector Search, 40x Faster** (2024) · https://qdrant.tech/articles/binary-quantization/ · 二值量化 ~32x 内存缩减、最高 40x 提速 + rescoring 恢复 recall。
- Pinecone — **Pinecone vs. Postgres pgvector** (2024) · https://www.pinecone.io/blog/pinecone-vs-pgvector/ · 厂商视角选型对比（应与第三方基准对照看）。
- Uber Engineering — **QueryGPT: NL to SQL using Generative AI** (2024) · https://www.uber.com/us/en/blog/query-gpt/ · 从简单 RAG 迭代 20+ 版到 multi-agent 流水线，建查询时间 -70%。
- LinkedIn Engineering — **The LinkedIn Generative AI Application Tech Stack** (2025) · https://www.linkedin.com/blog/engineering/generative-ai/the-linkedin-generative-ai-application-tech-stack-extending-to-build-ai-agents · LangGraph + 无状态 lifecycle service + 记忆外置。
- Cursor — **Securely indexing large codebases** (2026) · https://cursor.com/blog/secure-codebase-indexing · Merkle 增量同步、chunk 哈希缓存、只存 embedding 的安全工程。
- OpenAI — **Why we no longer evaluate SWE-bench Verified** (2026) · https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ · 退役理由：可逐字复现 patch 的污染 + 约 60% 剩余失败题测试有缺陷。
- Google — **Agent Development Kit: easy to build multi-agent applications** (2025) · https://developers.googleblog.com/en/agent-development-kit-easy-to-build-multi-agent-applications/ · code-first multi-agent 框架，针对 Gemini 优化、经 LiteLLM model-agnostic。
- AWS — **Introducing Strands Agents, an Open Source AI Agents SDK** (2025) · https://aws.amazon.com/blogs/opensource/introducing-strands-agents-an-open-source-ai-agents-sdk/ · model-driven SDK，框架托管 agentic loop。
- OpenAI — **Introducing AgentKit** (2025) · https://openai.com/index/introducing-agentkit/ · Agent Builder + ChatKit + Evals + Guardrails + Connector Registry。
- LangChain — **Deep Agents** · https://langchain.com/deep-agents · 规划 + subagent（隔离上下文）+ 虚拟文件系统，建于 LangGraph 之上。
- LangChain — **Agent Middleware** (1.0, 2025) · https://langchain.com/blog/agent-middleware · agent loop 可插拔中间件，before/after_model 钩子。

### 📚 官方文档
- OpenAI — **OpenAI Agents SDK (Python)** · https://openai.github.io/openai-agents-python/ · 官方轻量编排 SDK，内建 handoffs/guardrails/tracing。
- Mastra — **TypeScript AI Agent Framework & Platform** (v1.0, 2026) · https://mastra.ai/ · JS/TS 全栈 agent + workflows + RAG + 可观测。

### 🗂️ 精选开源仓库（持续跟踪，半衰期以月计）
- Gloriaameng — **Awesome-Agent-Harness** (GitHub, 持续更新) · https://github.com/Gloriaameng/Awesome-Agent-Harness · 把 harness 形式化为 H=(E,T,C,S,L,V) 六元组，汇集 110+ 论文 / 23 系统 / 9 挑战的社区索引。
- NirDiamant — **agents-towards-production** (GitHub) · https://github.com/NirDiamant/agents-towards-production · 端到端生产级 agent 教程，28 个 tutorial（部署/记忆/安全/GPU/multi-agent）。
- VoltAgent — **awesome-ai-agent-papers** (GitHub, 周更) · https://github.com/VoltAgent/awesome-ai-agent-papers · 2026 论文集，五分类（Multi-Agent / Memory & RAG / Eval & Obs / Tooling / Security）周更跟踪。

> （smolagents 仓库见 §5 框架表与上文博客，不再重列。）
> 本节为速查/工具节，未单列 🎥 talk；相关产品工程 talk 见 [[13]] 大厂案例研究。
