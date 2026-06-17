# 构建计划（PLAN）— Agent / Harness 工程知识库

> 📦 **历史存档**：本蓝图所述 16 节已全部完工落地；其后 16、17 两节为 v2 新增章节（详见 README 与 OVERVIEW）。本文件作为原始施工蓝图保留作历史存档，正文蓝图内容不再随工程演进而更新。
>
> 维护状态：v2 检修已于 2026-06 全量收口——18 节正文 + OVERVIEW + 元文档均已对齐到根 `_事实基线-2026-06.md`。

> 本文件 = ①给你的「验收标准」 + ②给 workflow 的「施工蓝图」。
> 本轮**不写知识正文**，只定义：统一文章结构、质量量化标准、16 节研究种子、workflow 执行架构。
> 内容生产由 workflow（多智能体编排）执行。

---

## 0. 目标与约束

- **目标**：把 16 节全部产出为「极详深度长文」，每节满足：历史脉络 + 论文支撑 + 博客/工程文支撑 + 主流观点与争议 + 我的独立分析 + 大厂实践 + 面试考点。
- **客观性红线**：所有引用必须**真实可核验**，零容忍编造文献（见 §4 Phase 3 对抗校验）。
- **语言**：中文讲解 + 英文术语保留（默认）。
- **不做**：本轮不生产知识正文；不臆造数据；不堆砌无来源断言。

---

## 1. 统一文章结构（每节产出物规格）

每节 `NN-xxx/README.md` 严格按以下 10 段产出：

| # | 段落 | 要求 |
|---|---|---|
| 1 | **TL;DR / 速览** | 本节地图 + 3–5 条核心结论 |
| 2 | **定位与动机** | 解决什么问题、在 Agent 链路中的位置 |
| 3 | **历史发展脉络** | 时间线：从早期 → 2026，逐个里程碑（论文/产品/事件）标注年份与「为什么这样演进」 |
| 4 | **核心概念与原理** | 把机制讲透，配图/伪代码/示例 |
| 5 | **主流方法谱系** | 横向对比表（方案 × 维度） |
| 6 | **主流观点与争议** | ≥2 组对立观点，给出各方代表人物/机构与论据 |
| 7 | **大厂工程实践** | ≥2 个真实案例，拆解工程取舍 |
| 8 | **我的分析与判断** | 独立成段：趋势研判 + 常见坑 + 最佳实践（标注「这是分析，非事实」） |
| 9 | **面试考点** | 概念题 / 系统设计题 / 手写题 / 陷阱题 |
| 10 | **参考文献** | 分类：📄论文 ／ ✍️博客与工程文 ／ 📚官方文档 ／ 🎥talk，每条带年份+一句话 |

---

## 2. 质量验收标准（「极其详细」的可量化定义）

每节须满足（核心节 03/04/08/13 上限可加倍）：

- **篇幅**：4,000–8,000 字
- **核心论文** ≥ 8 篇，逐篇标注 `作者 · 年份 · 一句话贡献`
- **博客/工程文** ≥ 5 篇，**优先一手**（大厂官方 / 作者本人）
- **历史时间线** ≥ 8 个里程碑节点，每个讲清演进动因
- **主流观点与争议** ≥ 2 组对立面，注明各方代表
- **大厂案例** ≥ 2 个，含工程取舍拆解
- **我的分析**：独立成段，含趋势研判 + 坑 + 最佳实践
- **面试题**：概念 ≥3 / 系统设计 ≥1 / 手写 ≥1 / 陷阱 ≥2
- **引用真实性**：每条引用经「存在性核验」，疑似编造一律删除或降级
- **交叉链接**：与相关节用 `[[NN]]` 互链

---

## 3. 16 节研究种子简报

> 以下是给 workflow 研究 agent 的**起点种子**（脉络锚点 + 种子文献 + 必答问题 + 争议 + 案例 + 面试重点）。
> Agent 须据此**联网检索扩展并核实**，不得仅凭种子作答。论文年份以核验为准。

### 00 导论与心智模型
- **脉络**：符号/RL agent → LLM agent 范式（2022 ReAct 起）→ 产品化（2024–25）→「agent 元年」叙事
- **种子论文**：Wang《A Survey on LLM-based Autonomous Agents》(2023)；Xi《The Rise and Potential of LLM Based Agents》(2023)
- **种子博客**：Anthropic《Building Effective Agents》(2024.12)；Lilian Weng《LLM Powered Autonomous Agents》(2023)；OpenAI《A Practical Guide to Building Agents》(2025)
- **必答**：agent 最小定义？与 workflow/chain/copilot 边界？自主性光谱？为何 2023–2026 才可用？
- **争议**：是否过度炒作；该给多少自主权
- **案例**：Anthropic 的 agent/workflow 划分与五种 workflow 模式
- **面试**：定义 agent；何时不该用；「模型 vs harness」

### 01 Agent 核心与推理范式
- **脉络**：CoT(2022) → ReAct(2022) → Reflexion/Self-Refine(2023) → ToT/搜索(2023) → 训练出的推理模型 o1(2024)/R1(2025)
- **种子论文**：Wei《Chain-of-Thought》(2022)；Yao《ReAct》(2022)；Shinn《Reflexion》(2023)；Madaan《Self-Refine》(2023)；Yao《Tree of Thoughts》(2023)；Wang《Plan-and-Solve》(2023)；DeepSeek《R1》(2025)
- **种子博客**：Lilian Weng reasoning 系列；OpenAI o1 system card
- **必答**：ReAct 机制与失败模式；prompted vs trained reasoning；推理模型如何改变 agent 设计
- **争议**：推理模型时代 ReAct/手工 prompt 是否过时
- **案例**：o1/R1 对 agent 的影响
- **面试**：手写 ReAct；ReAct 失败模式与缓解

### 02 Harness 运行时
- **脉络**：手写 ReAct loop → 框架 LangChain(2022) → 图式 LangGraph → 官方 Agent SDK(2024–25) → code-as-action
- **种子论文**：Wang《Executable Code Actions / CodeAct》(2024)
- **种子博客/文档**：Claude Agent SDK 文档；OpenAI Agents SDK 文档；HuggingFace smolagents；《Building Effective Agents》实现要点
- **必答**：tool-call 全链路(emit→parse→execute→feed back)；停止条件；错误/重试；流式；system/developer/user 分层；harness 与模型解耦
- **争议**：code-as-action vs JSON tool calls；harness 该多薄
- **案例**：Claude Code、Cursor、OpenAI Agents SDK runner
- **面试**：描述 harness 核心组件；防死循环设计

### 03 上下文工程
- **脉络**：prompt engineering → 长上下文 → RAG →「context engineering」术语确立(2025) → context rot 研究
- **种子论文**：Liu《Lost in the Middle》(2023)；Xiao《StreamingLLM》(2023)；Packer《MemGPT》(2023)；KV cache 压缩(H2O 等)
- **种子博客**：Anthropic《Effective context engineering for AI agents》(2025)；Anthropic prompt caching 文档；Chroma《Context Rot》(2025)
- **必答**：上下文放什么；compaction 策略；prefix/KV cache 与成本；缓存友好布局；JIT 加载 vs 预加载
- **争议**：长上下文 vs RAG；「context engineering」是不是新瓶装旧酒
- **案例**：Claude Code compaction
- **面试**：长任务上下文爆了怎么办；prompt caching 收益与布局

### 04 工具与 MCP
- **脉络**：function calling(2023) → 工具学习论文 → MCP 标准化(2024.11) → MCP 生态爆发(2025)
- **种子论文**：Schick《Toolformer》(2023)；Qin《ToolLLM》(2023)；Patil《Gorilla》(2023)
- **种子博客**：Anthropic MCP 发布(2024.11)+规范；Anthropic《Writing tools for AI agents》；function calling 文档
- **必答**：工具 schema 设计；好工具原则(粒度/命名/错误信息/幂等)；MCP 架构(client/server/transport)；MCP vs 纯 function calling
- **争议**：MCP 是否必要；工具过多/选择困难
- **案例**：MCP 生态、Claude Code 工具集
- **面试**：MCP 解决什么；如何设计好用工具

### 05 规划与任务分解
- **脉络**：CoT → 显式规划 Plan-and-Solve/LLM+P(2023) → 分解框架 HuggingGPT/ReWOO(2023) → 自适应 ADaPT → 产品化 TODO/plan mode
- **种子论文**：Wang《Plan-and-Solve》(2023)；Shen《HuggingGPT》(2023)；Xu《ReWOO》(2023)；《ADaPT》(2023)
- **种子博客**：LangChain plan-and-execute；Claude Code plan mode / TODO
- **必答**：分解策略；plan-then-execute vs 交错；TODO 工程模式价值；反思纠错回路
- **争议**：显式规划 vs 反应式；规划僵化/过度规划
- **案例**：Claude Code TODO、Devin 计划机制
- **面试**：让 agent 可靠完成长任务；plan mode 设计

### 06 记忆系统
- **脉络**：in-context → 记忆流 Generative Agents(2023) → MemGPT 分层(2023) → 记忆产品 mem0/Letta/LangMem(2024–25)
- **种子论文**：Park《Generative Agents》(2023)；Packer《MemGPT》(2023)
- **种子博客**：Letta/MemGPT 博客；mem0；LangMem
- **必答**：短/长期；情景/语义/程序记忆；存储(文件/向量/KG)；写入/检索/遗忘；记忆 vs RAG vs 长上下文
- **争议**：长上下文是否取代外部记忆；记什么/忘什么
- **案例**：Generative Agents(Smallville)；Claude 记忆文件机制
- **面试**：设计 agent 记忆；何时向量库 vs 文件

### 07 检索与 RAG
- **脉络**：RAG(2020) → ColBERT/稠密检索 → Self-RAG/FLARE(2023) → RAPTOR/GraphRAG(2024) → Contextual Retrieval(2024) → agentic RAG
- **种子论文**：Lewis《RAG》(2020)；Khattab《ColBERT》；Asai《Self-RAG》(2023)；Jiang《FLARE》(2023)；Sarthi《RAPTOR》(2024)；Microsoft《GraphRAG》(2024)；Gao《HyDE》
- **种子博客**：Anthropic《Contextual Retrieval》(2024)；Microsoft GraphRAG；LlamaIndex/Pinecone 指南
- **必答**：embedding/向量库/相似检索；chunking；混合检索+rerank；agentic/多跳 RAG；RAG 评估
- **争议**：RAG vs 长上下文；何时 GraphRAG
- **案例**：大厂检索栈
- **面试**：RAG pipeline；agentic vs 传统 RAG；chunking/rerank 取舍

### 08 多智能体编排
- **脉络**：单 agent → 角色协作 CAMEL/AutoGen/MetaGPT(2023) → 辩论 Multi-Agent Debate(2023) → 生产编排 LangGraph → 反思潮：Cognition「别建多 agent」vs Anthropic 多 agent research(2025)
- **种子论文**：Wu《AutoGen》(2023)；Li《CAMEL》(2023)；Hong《MetaGPT》(2023)；Du《Multi-Agent Debate》(2023)
- **种子博客**：Anthropic《How we built our multi-agent research system》(2025)；Cognition《Don't Build Multi-Agents》(2025)；OpenAI Swarm/Agents SDK；LangGraph 多 agent
- **必答**：单 vs 多取舍；编排模式(supervisor/层级/顺序/并行/辩论)；handoff/子 agent/上下文隔离；共享状态
- **★核心争议★**：多 agent 有用(Anthropic) vs 有害/脆弱(Cognition)——**双方都要讲透**
- **案例**：Anthropic research system；Claude Code 子 agent(Task)
- **面试**：多 agent 何时优于单 agent；supervisor 设计

### 09 评估
- **脉络**：静态 benchmark(HumanEval) → agent benchmark AgentBench/WebArena/GAIA(2023) → SWE-bench(2023)→Verified → τ-bench(2024) → BrowseComp(2025)
- **种子论文**：Jimenez《SWE-bench》(2023)；Mialon《GAIA》(2023)；Zhou《WebArena》(2023)；Liu《AgentBench》(2023)；τ-bench(Sierra 2024)；Zheng《MT-Bench / LLM-as-judge》(2023)
- **种子博客**：OpenAI SWE-bench Verified；BrowseComp；各厂 eval 实践
- **必答**：为何 agent 评估难(轨迹/非确定)；评估层级(端到端/轨迹/组件)；LLM-as-judge 及偏差；离线 vs 在线；污染防范
- **争议**：benchmark 污染/过拟合；LLM-judge 可信度；静态 vs 真实任务
- **案例**：SWE-bench 生态
- **面试**：评估 coding agent；LLM-judge 的坑

### 10 可观测性与调试
- **脉络**：日志 → LLM tracing(LangSmith 2023) → 开源 Langfuse/Phoenix → 标准化 OpenTelemetry GenAI 语义约定(2024–25)
- **种子文档**：LangSmith、Langfuse、Arize Phoenix、Braintrust、OpenLLMetry；OTel GenAI 语义约定
- **必答**：trace/span/轨迹；该埋什么(tool call/token/时延/成本)；replay 调试；生产监控指标
- **争议**：trace 标准统一；自建 vs SaaS
- **案例**：LangSmith/Langfuse 实战
- **面试**：debug 表现差的 agent；埋点设计

### 11 生产工程
- **脉络**：demo → 上线挑战(时延/成本/可靠) →「AI engineering」成体系(2025)
- **种子书/文**：Chip Huyen《AI Engineering》(2025)；各厂时延/成本优化文
- **必答**：服务架构；时延优化(流式/并行工具/投机)；并发异步；成本与 token 预算；rate limit/降级/fallback；缓存；HITL；guardrails
- **争议**：build vs buy 框架；何时上多模型路由
- **案例**：大厂生产实践
- **面试**：降时延手段；成本失控治理；HITL 设计

### 12 安全与对抗
- **脉络**：jailbreak/GCG(2023) → 间接 prompt 注入(Greshake 2023) → agent 安全 benchmark AgentDojo(2024) →「lethal trifecta」框架(2025)
- **种子论文**：Zou《Universal and Transferable Adversarial Attacks / GCG》(2023)；Greshake《Not what you've signed up for（间接注入）》(2023)；《AgentDojo》(2024)
- **种子博客**：Simon Willison prompt injection /「lethal trifecta」系列；OWASP LLM Top 10；Anthropic/Google agent 安全
- **必答**：直接 vs 间接注入；沙箱/隔离；最小权限；数据外泄/confused deputy；越狱与防御；lethal trifecta(私有数据+不可信内容+对外通道)
- **争议**：prompt 注入是否可根治
- **案例**：真实注入事件、computer-use 安全
- **面试**：间接注入是什么怎么防；安全地跑代码/上网

### 13 大厂案例研究
- **脉络**：SWE-agent/OpenDevin(2024 学术) → 产品 Devin/Cursor/Claude Code(2024–25) → computer use/deep research(2024–25)
- **种子论文**：Yang《SWE-agent》(2024)；Wang《OpenHands/OpenDevin》(2024)
- **种子博客**：Anthropic《Computer Use》(2024)；各产品工程博客；Cognition/Devin；Cursor；Claude Code；Deep Research(OpenAI/Google/Perplexity)
- **必答**：逐个拆 harness 设计/上下文策略/工具集/eval；横向对比
- **争议**：通用 agent vs 垂直 agent；computer-use 成熟度
- **案例**：Claude Code / Cursor / Devin / SWE-agent / Deep Research / Computer Use / Manus
- **面试**：你欣赏哪个 agent 产品、工程亮点；Cursor vs Claude Code 架构对比

### 14 技术栈速查
- **脉络**：LangChain(2022) → 专用化(LlamaIndex/AutoGen) → 图式 LangGraph → 官方 SDK(OpenAI Agents/Claude Agent) → 轻量 smolagents/Pydantic AI/Mastra；编译式 DSPy
- **种子文档**：各框架官方文档；向量库文档
- **必答**：编排框架对比；向量库对比；eval/obs 工具；MCP；选型矩阵(场景→推荐)
- **争议**：LangChain 抽象是否过重；框架 vs 手写
- **案例**：选型对比表
- **面试**：LangGraph vs OpenAI Agents SDK 取舍

### 15 面试题库
- **来源**：汇总 00–14 + 系统设计经典 + AI 工程师面试指南
- **产出**：概念题(带答案要点)；系统设计(设计 coding/客服/deep research agent)；手写(ReAct loop / tool 调度 / compaction)；项目深挖(用 STAR 讲你的 maquant/gewu/SearchAgent)；行为题；高频陷阱清单
- **面试**：本身即面试库

---

## 4. Workflow 执行架构

### 总体形态
`pipeline(16 节，每节独立流水线)` + 末端 `barrier 综合`。每节走「研究 → 撰写 → 校验」三阶段，节与节之间无屏障；全部完成后做一次全局综合。

### Phase 1 · 深度研究（多模态扫描，每节并行 3–4 lens）
每节并行多路 agent，各自联网检索后产出结构化 dossier，再合并：
- **lens A 学术**：核心论文 / survey（标注 作者·年份·贡献）
- **lens B 工程·大厂**：官方博客 / 产品 / 工程实践案例
- **lens C 脉络·争议**：历史时间线 + 对立观点各方
- **lens D 小红书实战（可选，需接入小红书 MCP）**：搜社区一手经验贴 / 踩坑细节 / 国内视角，补足论文与官方博客覆盖不到的实操盲区；经 ToolSearch 调用 session 内的 `xiaohongshu-mcp` 工具

> dossier schema：`{lens, timeline[{year,milestone,why}], papers[{title,authors,year,contribution,url}], posts[{title,source,year,url,takeaway}], debates[{question,sideA,sideB,who}], cases[{name,org,point}], mustCover[], openQuestions[]}`

### Phase 2 · 撰写
输入：合并后的 dossier + §1 文章结构 + §2 质量标准。撰写 agent **直接写入** `NN-xxx/README.md`（agent 持有 Write）。

### Phase 3 · 对抗校验（关键）
- **引用存在性核验**：逐条 web 核实论文/博客是否真实存在，疑似编造 → 删除/降级
- **覆盖度核验**：是否满足 §2 各项量化指标（篇幅/论文数/争议/案例/面试题）
- **事实/日期核验**：抽查关键断言与年份
- 产出 `{citationChecks[], coverageGaps[], factIssues[], verdict: pass|needs-revision, patchesApplied[]}`；不达标即回写修订

### Phase 4 · 综合（barrier，需全节完成）
- 写「**Agent 工程发展总脉络**」总览，串联 16 节历史主线
- 全库**交叉链接** + 一致性 + 去重
- 更新根 `README.md` 索引状态 🔴→🟢
- **完整性批判**：列出仍缺的 modality / 未核验断言 / 未覆盖争议

### 伪代码骨架（最终脚本据此生成）
```js
const SECTIONS = [/* 16 项，字段取自 §3 */]
await pipeline(
  SECTIONS,
  async (s) => {                                   // Phase 1 研究
    const lenses = await parallel([
      () => agent(researchAcademic(s), {phase:'研究', schema: DOSSIER}),
      () => agent(researchEngineering(s),{phase:'研究', schema: DOSSIER}),
      () => agent(researchHistoryDebate(s),{phase:'研究',schema: DOSSIER}),
      // 可选 lens D（接入小红书 MCP 后启用）：搜社区实战贴
      // () => agent(researchXiaohongshu(s),{phase:'研究',schema: DOSSIER}),
    ])
    return { s, dossier: merge(lenses.filter(Boolean)) }
  },
  ({s, dossier}) => agent(write(s, dossier, SCHEMA, BAR), {phase:'撰写'}),   // Phase 2
  (_, s) => agent(verifyAndPatch(s, BAR), {phase:'校验', schema: VERIFY}),   // Phase 3
)
await agent(synthesizeOverview_crossLink_index_critic(SECTIONS), {phase:'综合'})  // Phase 4
```

### 规模与成本（预估）
- agent 数：研究 16×3 ≈ 48 + 撰写 16 + 校验 16 + 综合 1 ≈ **~80 agents**（含返工或更多）
- **token 重档**。建议**先试跑 1–2 节**校准质量/篇幅/引用真实性，达标后再全量。

---

## 5. 执行方式

1. 你 review 本计划 → 微调 §2 标准 / §3 种子 / lens 数量。
2. 确认后，我把本计划**落成可运行的 Workflow 脚本**（嵌入 §3 的 16 节数据）。
3. 你说「执行」/「用 workflow 跑」，即触发多智能体编排（workflow 需你显式 opt-in 才会运行）。
4. 先试跑 → 校准 → 全量。

---

## 6. 可调参数（你来拍板）

| 参数 | 默认 | 备选 |
|---|---|---|
| 文章语言 | 中文讲解 + 英文术语 | 全中文 / 中英对照 |
| 每节篇幅 | 4k–8k 字 | 更短速览 / 更长万字 |
| 研究 lens | 3（学术/工程/脉络争议） | +小红书实战（需接 MCP）/ +反方专搜 / +最新动态专搜 |
| 节奏 | 先试跑 1–2 节再全量 | 直接全量 16 节 |
| 引用核验 | 逐条存在性核验（强） | 抽样核验（快但弱） |
