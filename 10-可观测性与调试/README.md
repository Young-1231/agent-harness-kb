> 状态：🟢 已校验

# 10 · 可观测性与调试（Observability & Debugging）

> **定位**：Agent 的"黑匣子记录仪 + 事故调查组"。一个 LLM Agent 在两次完全相同的输入下都可能走出不同轨迹——没有可观测性，你连"它为什么失败"都无从回答。本节讲透 trace/span/轨迹 的概念谱系、该埋什么（埋点设计）、OpenTelemetry GenAI 语义约定如何把埋点标准化、record-and-replay 与时间旅行调试、轨迹级失败归因（为什么这是 2025–2026 的硬骨头），以及生产监控里"监控 vs 评测"的分野。
>
> 上游接 [[02]]（trace 的钩子就埋在 harness 主循环的 emit→parse→execute→feedback 上）、[[04]]（每次工具/MCP 调用是一个 `execute_tool` span）；与 [[09]] 评估**深度耦合**（可观测性数据正是评测的输入单元，"observability powers evaluation"）；下游连 [[08]]（multi-agent 的失败归因）、[[11]]（生产监控/成本/告警）、[[12]]（内容捕获的 PII/隐私权衡、用 trace 检测 prompt 注入）、[[13]]（Claude Code/Cursor 的 trace 实践）。

---

## 1. TL;DR / 速览

本节地图：**为什么 Agent 难调（非确定性 + 多步）→ trace/span/轨迹是什么 → 该埋什么（gen_ai.* 埋点）→ 标准化之争（OTel vs OpenInference vs 私有）→ replay 与失败归因 → 监控 vs 评测 → 隐私/成本权衡 → 大厂实践**。

核心结论（先记住这 5 条）：

1. **一次 Agent 运行 = 一棵 trace，每次 LLM/工具/检索调用 = 一个 span，完整 trajectory 由父子 span 树构成，靠 trace id 串联因果**——这套心智模型直接继承自 Google **Dapper（2010）**，LLM 时代只是换了 span 的语义。
2. **纯 print/log 在 LLM 时代失效**：日志只看得到 HTTP 请求，看不到 prompt/completion、多步链路、token/成本，且 LLM 输出**非确定、难复现**。这个痛点直接催生了 2023 年的 "LLM tracing" 品类（LangSmith→Langfuse/Phoenix），脉络从"日志"转向"链路追踪"。
3. **OTel GenAI 语义约定**正在把埋点标准化为 `invoke_agent → chat → execute_tool` 的 span 树 + `gen_ai.*` 属性（model、input/output_tokens、finish_reasons、messages），让 trace 跨厂商可比、可迁移；但**截至 2026（v1.41.x）整套约定仍为 Development/experimental、多数 `gen_ai.*` 未 stable、无公开稳定化时间表**，需 `OTEL_SEMCONV_STABILITY_OPT_IN` 双发兼容。
4. **"捕获 trace"已基本解决，"对 trace 推理"远没解决**：TRAIL（2025）显示当时最强模型做轨迹调试只有 ~11% 准确率，Who&When（2025）的 step 级失败归因只有 14.2%——**让 LLM 读懂自己的 trace，是当前最大的开放问题**。
5. **监控（monitoring）≠ 评测（evaluation）**：APM 式的时延/成本/错误率告诉你"系统是否在跑、烧多少钱"，但只有 eval（LLM-as-judge + 人工）能告诉你"输出对不对、安不安全"。成熟团队把低分生产 trace 沉淀为**回归数据集**，让 trace→dataset→CI gating 闭环。

---

## 2. 定位与动机

**解决什么问题？** 传统软件是确定性的：同样的输入走同样的代码路径，出 bug 加一行日志、打个断点就能复现。LLM Agent 打破了这两个前提：

- **非确定性**：温度采样、模型版本漂移、工具返回变化，使得"同一个 prompt 两次运行走出不同轨迹"成为常态。Anthropic 在 multi-agent 研究系统的工程复盘里明确指出——正因为 agent 在相同输入下的行为都不一致，**全量生产 tracing 是唯一能回答"它为什么失败"的手段**：到底是搜索 query 写得烂、还是选源差、还是工具本身挂了。
- **多步 + 不可见的中间态**：一次任务可能是几十步 LLM 推理 + 工具调用 + 检索 + subagent 派生。HuggingFace smolagents 文档直白地说：multi-step runs **会瞬间淹没 console**，靠翻日志根本不可能理解发生了什么。而且关键信息——prompt 全文、模型挑了哪个工具、填了什么参数、token 烧了多少——HTTP 层日志一个都看不到。

**在 Agent 链路中的位置。** 回看根 README 的全景：用户输入 → Harness 组装上下文 → LLM 推理 → tool call → 执行 → 结果回灌 → 循环。可观测性是**横切（cross-cutting）**这整条回路的一层：它在 harness 主循环（[[02]]）的每个关键点埋钩子，把"组装了什么上下文 / 模型决定调什么工具 / 工具返回了什么 / 烧了多少 token / 哪一步抛了异常"全部记录成结构化 trace。

一句话定位：**如果 [[01]] 是 Agent 的"脑"、[[02]] 是"神经系统"、[[04]] 是"手"，那本节就是 Agent 的"黑匣子飞行记录仪 + 事故调查组"——它本身不参与决策，但没有它，非确定性系统就是个无法调试、无法改进的黑盒。** 而且它与 [[09]] 评估是一体两面：可观测性产出 trace，评测在 trace 上打分——"要评估行为，就得评估记录行为的可观测性数据"（LangChain 语）。

---

## 3. 历史发展脉络（时间线）

> 主线：**分布式追踪奠基（2010 Dapper / 2019 OTel）→ 纯日志在 LLM 时代失效 → LLM 专用 tracing 品类诞生（2023 LangSmith）→ 开源自托管路线（Langfuse/Phoenix）→ 标准化（2024 OTel GenAI SIG，gen_ai.\*）→ 可观测单元从"一次 LLM 调用"升级为"一条 agent 轨迹"→ 研究重心从"捕获 trace"转向"对 trace 推理"（2025 失败归因）→ 标准化持续推进与赛道整合（2026）**。

| 年份 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **2010** | **Google Dapper** 论文（Sigelman et al.） | 确立 **trace / span / annotation** 三元语义与低开销采样，奠定分布式追踪范式。现代 LLM/Agent tracing 把"一次 agent 运行映射为 trace、每次调用为 span"全部继承自此。 |
| **2019-05** | **OpenTelemetry 成立**（OpenTracing + OpenCensus 合并入 CNCF） | LLM 出现前"日志/APM 时代"的收口：统一 trace/span 数据模型与 OTLP 协议。后来几乎所有 LLM tracing 都复用这套 span 树心智，也预演了本领域"先碎片化、再向 OTel 收敛"的剧本。 |
| **2022-11 → 2023** | ChatGPT 后 LLM 应用爆发，**调试仍靠 print/log，纯日志开始失效** | 日志看不到 prompt/completion、多步链路、token/成本，且输出非确定难复现。痛点直接催生专门的 "LLM tracing" 品类——脉络从"日志"转向"链路追踪"。 |
| **2023 年中** | **开源自托管路线起步**：Langfuse（YC W23）公开发布 + Arize 在 Observe 2023 开源 **Phoenix** | 把"可自托管的开源可观测性"确立为与 SaaS 并行的第一条路线（Langfuse MIT、Phoenix 本地/Notebook 跑、面向幻觉与 RAG 调试），奠定后来"自建 vs SaaS"之争。 |
| **2023-07/08** | **LangChain 推出 LangSmith（闭测）** | 首个成规模的托管 LLM 可观测平台，把链路追踪从微服务带进 LLM chain/agent，可视化每一步 prompt/response，定义了"追踪 + 评测 + prompt 优化"一体化的行业预期。标志"日志→LLM tracing"的转折点。 |
| **2023-09/10** | **Traceloop 发布 OpenLLMetry** | 与各家私有格式相反的思路——不另造协议，而是在 OTel 之上加 LLM 语义，使 trace 能直接送进 Datadog/New Relic/Sentry/Honeycomb。"标准应回归 OTel"主张的最早工程落地，为官方约定铺路。 |
| **2024-02-15** | **LangSmith 正式 GA**（$25M A 轮，Sequoia 领投，从 2023-07 闭测毕业） | 确认托管 SaaS 路线的商业可行性；后续累计处理超 10 亿条 trace（Klarna 客服案例：解决时长降约 80%），证明 LLM 可观测性已是生产级刚需而非实验工具。 |
| **2024-04** | **OpenTelemetry GenAI SIG 成立**，启动官方 `gen_ai.*` 语义约定 | 针对"各家 token/cost/prompt 字段命名互不兼容、造成厂商锁定"的碎片化问题，官方下场定义 vendor-neutral 属性。脉络由"各自为政的私有 trace"正式转入"标准化"。 |
| **2024-06-27** | **Datadog LLM Observability GA** | 传统 APM 大厂入场：把 LLM 追踪与既有 APM/日志/安全扫描整合，开启"LLM-native 初创 vs APM 大厂扩展"的竞争格局，也强化了对统一 OTel 语义的需求。 |
| **2024-11** | **AgentOps: Enabling Observability of LLM Agents**（Dong et al.） | 首篇学术化界定 agent 全生命周期"该埋什么"的分类法，把工程实践上升为研究问题（模型调用/工具/记忆读写/决策分支）。 |
| **2025-01** | **HuggingFace smolagents 采用 OpenTelemetry** | 框架方亲口承认：multi-step agent 用 console log 根本调不动；OTel + Phoenix/Langfuse 成默认检查路径。 |
| **2025-03** | **OpenAI Agents SDK 内建 tracing（默认开启）+ Traces dashboard** | 首个把 tracing 当**原语**而非附加项的一方框架：agent/generation/function/handoff/guardrail 五类 typed span。 |
| **2025** | **轨迹调试与失败归因研究爆发**：AgentRR（record&replay）、TRAIL、Who&When、MAST、AgentSight（eBPF） | 研究重心从"捕获 trace"转向"对 trace 推理"：replay 复现、错误分类、step 级失败定位、系统级边界追踪。 |
| **2025-06** | **Anthropic《How we built our multi-agent research system》** | 标杆性生产复盘：用全量 tracing 诊断非确定性 agent、隐私保护式监控（只看结构不看内容）、~20 query 评测集 + LLM-judge + 人工 eval。 |
| **2026-01** | **Langfuse 被 ClickHouse 收购**；**LangChain《Agent observability powers agent evaluation》** | 开源自托管赛道走向整合（需数据库/商业后盾）；同时把 runs/traces/threads 定为评测单元，论证"离线评测必要但不充分，需在线 reference-free 评测"。 |
| **2026** | **OTel GenAI 约定仍为 Development/experimental**（截至 v1.41.x，多数 `gen_ai.*` 未 stable、无公开稳定化时间表）；Datadog 原生支持 OTel GenAI semconv；约定外延到 coding agent（Copilot、Claude Code trace beta）；**多层可观测性综述**（Sisodia）出现 | 全栈标准化仍未成形、约定持续演进；学术开始系统梳理"从激活值/置信度到 GPU kernel"的多层监控与其断点；内容捕获对敏感 prompt/code 仍默认关闭。 |

---

## 4. 核心概念与原理

### 4.1 trace / span / 轨迹：一切的基本盘（源自 Dapper）

- **span**：一个有起止时间的工作单元，带名字、属性（attributes）、事件、状态。一次 LLM 调用、一次工具执行、一次检索，各是一个 span。
- **trace**：一棵由父子 span 组成的树，代表**一次完整的端到端请求**——对 Agent 而言就是"一次完整运行"。span 之间靠 `trace_id`（同属一次 trace）和 `parent_span_id`（父子关系）串联，因果关系由此重建。
- **trajectory（轨迹）**：Agent 语境里 trace 的别名，强调它是 Think→Act→Observe 的**有序步骤序列**。

LangChain 进一步把粒度分成三层原语，并**一一映射到评测粒度**（这是本节与 [[09]] 的接口）：

| 原语 | 含义 | 评测什么 |
|---|---|---|
| **run**（单 span/单步） | 一次 LLM 调用或一次工具调用 | 选对工具了吗？参数对吗？ |
| **trace**（整次运行） | 一整条 trajectory + 最终答案 | 轨迹合理吗？最终答案对吗？state 对吗？ |
| **thread**（多轮会话） | 跨多次 trace 的同一会话 | 跨轮上下文保持住了吗？ |

### 4.2 该埋什么：埋点的最小充分集

AgentOps（Dong et al., 2024）从 agent 生命周期角度系统回答了"该追踪什么工件"。落到具体字段，OTel GenAI 约定给出了行业通用清单：

- **内容**：`gen_ai.input.messages` / `gen_ai.output.messages`（prompt/response 全文，默认关闭，见 §4.4 隐私）
- **模型与参数**：`gen_ai.request.model`、temperature、top_p 等
- **token 用量**：`gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`（→ 成本估算的基础）
- **时延**：`gen_ai.client.operation.duration`（核心指标之一）
- **结束原因**：`gen_ai.response.finish_reasons`（stop / length / tool_calls / content_filter——定位截断、死循环的关键）
- **工具调用**：`execute_tool` span + 工具名/参数/返回
- **异常 / 重试 / 决策分支 / 记忆读写**：AgentOps 强调须**显式记录每步的内部认知状态**，否则无法真正重放与审计。

### 4.3 OTel GenAI span 树：invoke_agent → chat → execute_tool

OTel GenAI 约定把一次 agent 运行结构化成一棵标准 span 树（OTel 2026 官方博客《Inside the LLM Call》的范式）：

```
invoke_agent  (顶层：整次 agent 运行，gen_ai.agent.name)
├── chat       (一次 LLM 调用：model / input_tokens / output_tokens / finish_reasons)
│   └── execute_tool  (模型决定调用的工具：tool.name / arguments / result)
├── chat       (拿到工具结果后的下一次 LLM 调用)
│   └── execute_tool
└── chat       (生成最终答案)
```

两条**核心指标（metrics）**贯穿始终：`gen_ai.client.operation.duration`（时延）与 `token.usage`（成本估算）。这两个 + 错误率，构成生产仪表盘（[[11]]）的最小集。

**埋点哲学：baked-in vs external instrumentation（OTel 2025 博客点名的取舍）：**
- **内建插桩**（框架自带 OTel，如 OpenAI Agents SDK）：零配置、开箱即用，但带来版本锁定与体积膨胀。
- **外部插桩库**（解耦的 contrib 包，如 OpenLLMetry、`SmolagentsInstrumentor`）：精简、可按需，但有碎片化风险。

### 4.4 隐私/成本权衡：内容默认不捕获（off-by-default）

这是被写进标准本身的取舍：span 结构与元数据（model、tokens、finish_reason）**总是**捕获，但 **prompt 内容与工具参数默认不记录**，必须显式 opt-in：

- OTel：`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`（Google Vertex/ADK 也用同一开关）
- OpenAI Agents SDK：`RunConfig.trace_include_sensitive_data`
- 一致动机：prompt/输出/代码里常含 PII 与密钥；连 GitHub Copilot、Claude Code（trace beta）都遵循"内容默认关闭"。

代价是：**全量内容是 replay 与失败归因的前提**（TRAIL/Who&When 都依赖完整轨迹），关掉内容 = 牺牲可调试性。这正是 §6 争议二。

### 4.5 record-and-replay 与时间旅行调试

非确定性系统最痛的是"复现"。AgentRR（Feng et al., 2025）把经典的 record-and-replay 引入 agent：**记录环境交互轨迹 + 内部决策 → 汇总为结构化"经验" → 以 check function 重放**，从而支持确定性执行、轨迹验证与安全探索。

工程上更常见的轻量版是"**时间旅行 / 从失败步重放**"（Cresta 实践）：冻结失败 step 之前的所有输入，只换模型/prompt 重跑那一步，"秒级复现确切失败"而非"改完部署再等"。难点在于环境/工具本身也非确定（外部 API 会变），真正可信的确定性回放需要 checkpoint 内部认知状态——这仍是开放问题。

### 4.6 系统级可观测性：eBPF 边界追踪

应用层插桩有个软肋：框架可绕过、被篡改、且看不到真实系统副作用。AgentSight（Zheng et al., 2025）用 **eBPF** 在 **TLS 流量（intent，模型想干什么）与内核事件（effect，系统实际发生了什么）的边界**做关联追踪，跨越二者的"语义鸿沟"，可检测 prompt 注入、推理死循环、multi-agent 协调瓶颈，开销 <3%。它代表可观测性从应用层下沉到 OS/网络层的一条新路线。

---

## 5. 主流方法谱系（横向对比）

### 5.1 工具/平台谱系

| 方案 | 代表 | 路线 | 部署 | 标准 | 强项 | 取舍 |
|---|---|---|---|---|---|---|
| 托管 SaaS（LLM-native） | **LangSmith** (LangChain) | 商业、闭源 | SaaS（自托管需企业版） | 私有 + 桥接 OTel | 追踪+评测+prompt 一体、零运维 | 数据出域、厂商绑定 |
| 开源自托管 | **Langfuse** | 开源 MIT | 自托管一等公民 | OTel 兼容 | 数据主权、合规、框架无关 | 需自运维 DB/K8s |
| 开源 + 评测 | **Arize Phoenix** | 开源 | 本地/Notebook/集群 | OTel / **OpenInference** | 内建 LLM-judge eval、面向幻觉/RAG | 语义层与 OTel 并存之争 |
| 开放协议扩展 | **OpenLLMetry** (Traceloop) | 开源 Apache-2.0 | 任意 OTel 后端 | OTel | 非侵入式、可插任意后端 | 语义深度受标准约束 |
| APM 大厂扩展 | **Datadog** LLM Obs | 商业 | SaaS | 原生 OTel GenAI semconv | 与既有 APM/基建告警统一 | 偏监控、评测能力弱 |
| 一方框架内建 | **OpenAI Agents SDK** Traces | 商业 | 默认导出 OpenAI，后端可替换 | typed span | 默认开、agent-aware UX | 默认数据进 OpenAI |
| eval-first 平台 | **Braintrust** | 商业 | SaaS | — | evals-in-CI、PR 门禁 | 偏评测、非全栈监控 |
| 系统级 | **AgentSight** (eBPF) | 研究/开源 | 内核探针 | — | 框架无关、防篡改、抓真实 effect | 难还原高层语义 |

> 三方标准之争（详见 §6 争议三）：**OTel `gen_ai.*`（中立）vs Arize OpenInference（更深、被 LlamaIndex 采用）vs 各家私有格式**——多数 OTel 约定到 2026 仍是 experimental。

### 5.2 失败诊断方法谱系（"对 trace 推理"这条线）

| 工作 | 机构/年份 | 解决什么 | 关键数据/结论 |
|---|---|---|---|
| **TRAIL** | Patronus AI, 2025 | trace 级**错误定位**基准（推理/执行/规划错误分类法） | 148 条标注轨迹 / 841 个错误；2025 年最强模型 Gemini-2.5-pro 仅 **~11%**——长上下文 LLM 不会读 trace |
| **Who&When** | Zhang et al., 2025 | **自动失败归因**：哪个 agent、哪一步导致失败 | Who&When 数据集 127 个 MAS 失败日志；最佳方法 agent 级 **53.5%**、step 级仅 **14.2%** |
| **MAST** | UC Berkeley (Cemri et al.), 2025 | multi-agent **失败分类法** | 14 种失败模式 / 3 大类（系统设计、智能体间错配、任务验证）；由约 150 条专家标注 trace（κ=0.88）归纳出 14 模式，1600+ 为其后 LLM-judge 扩展的 MAST-Data |
| **AgentRR** | Feng et al., 2025 | record-and-replay 确定性复现 | 结构化"经验" + check function 重放 |
| **AgentOps 综述** | Wang et al., 2025 | 运维框架 | 监控 → 异常检测 → 根因分析 → 修复 四阶段；强调须显式记录内部认知状态 |
| **多层可观测性综述** | Sisodia, 2026 | 五层分类法 | 从模型置信度校准 → 基础设施追踪；最大缺口是模型层信号与基建层异常未打通 |

---

## 6. 主流观点与争议

### 争议一：in-band（SDK/callback 插桩）还是 out-of-band（系统级 eBPF）？

- **in-band 派**（LangSmith / Langfuse / OTel SDK）：在应用层插桩能拿到 prompt、token、工具参数等**语义丰富**的信息，与框架天然集成，是绝大多数生产栈的默认。
- **out-of-band 派**（AgentSight, Zheng et al. 2025）：应用层可被绕过、篡改，且看不到真实副作用；在内核/TLS 边界做"边界追踪"是**框架无关、防篡改**的，能弥合 intent 与 effect 的语义鸿沟（开销 <3%），代价是难还原高层推理语义。
- 实质：两者互补而非互斥——应用层抓"模型想干什么"，系统层抓"系统实际发生了什么"，安全场景（prompt 注入检测，[[12]]）尤其需要后者。

### 争议二：该不该把完整 prompt/completion 写入 trace？

- **全量记录派**（调试 / 失败归因需求，TRAIL / Who&When）：不看实际 query、工具参数、输出，就**无法**对非确定性 agent 做轨迹级调试（Anthropic 语："找不到本该找到的信息"这类 bug 没有内容根本定位不了）。
- **仅记录元数据派**（OTel / OpenAI / Google 的 off-by-default 设计）：prompt/输出/代码含 PII 与密钥，全量内容带来隐私、存储、成本三重压力。标准把内容捕获设为 opt-in 即是此折中。
- **Anthropic 的第三条路**：监控 agent 决策模式与交互**结构**，而**不**记录对话**内容**——用结构换内容，兼顾可观测与隐私。

### 争议三：trace 该统一到哪个标准——OTel `gen_ai.*`、OpenInference 还是私有格式？

- **统一/中立派**（OTel GenAI SIG，含 Microsoft/Google/Datadog；Traceloop OpenLLMetry）：应收敛到 vendor-neutral 的 `gen_ai.*`，避免锁定、复用成熟 OTel 采集/导出/后端生态，让 token/cost/finish_reason 全行业同名。Datadog 原生支持 OTel GenAI semconv 是这条路线的资本背书。
- **深度/先发派**（Arize OpenInference，2025-02 完成 7000 万美元 C 轮，被 LlamaIndex 采用；LangSmith/Langfuse/Helicone）：官方约定**太浅、演进慢、2026 多数仍 experimental 不可靠**；与其等标准，不如自建更深的语义层、用上市速度抢生态。
- **中立观察者**多类比十年前 APM：**碎片化先于整合**。OTel 主干生态成熟 + Datadog 原生支持 OTel GenAI semconv，为"最终收敛到 OTel"提供背书（尽管 `gen_ai.*` 约定本身截至 2026 仍为 experimental、未 stable），Langfuse 被 ClickHouse 收购则印证赛道走向整合。

### 争议四：能用 LLM-as-judge 做生产在线质量监控吗？

- **可行派**（LLMs-as-Judges 综述，Li et al. 2024）：无需人工 ground truth 即可对 live 流量规模化打分，是**唯一**跟得上生产吞吐的评测方式。
- **存疑派**（TRAIL / Who&When 的负面证据）：judge 自身有偏置/可靠性问题；而且 TRAIL（2025）显示 LLM 在 trace 推理上仅 ~11%，直接拿来做失败定位远不可靠。
- 折中实践：judge 用于**粗筛 + 趋势监控**，关键 bug 仍需人工 eval 兜底（Anthropic 明确说人工 eval 抓到了自动化漏掉的"SEO 内容农场源"）。

### 争议五：监控（monitoring）够不够，还是必须做评测（evaluation）？

- **监控优先派**（Datadog，APM 路线）：时延/成本/错误率是必要的基建可见性（[[11]]）——先知道系统在跑、烧多少钱。
- **评测优先派**（Braintrust / LangChain / Langfuse）：日志/trace 只说"发生了什么"，只有 eval 说"输出对不对/安不安全"。应把 eval 跑成 GitHub Action 门禁（低于阈值阻断合并），把低分 trace 转成**永久回归数据集**。Braintrust 的口号：APM 无法在 PR 上跑 eval 套件、无法因质量阻断部署。
- 共识：二者是**必要但不充分**的关系——监控是地基，评测是验收。

### 争议六：自托管开源 vs 托管 SaaS？

- **自托管派**（Langfuse/Phoenix/Helicone；Cresta、Canva 等有数据合规硬要求的医疗/金融/法律企业）：trace 数据永不出集群，自控留存/备份，满足数据主权（Langfuse 提供 SOC 2 + ISO 27001、可气隙部署）。
- **SaaS 派**（LangSmith / OpenAI Traces / Vertex Agent Engine）：零运维、原生集成、time-to-value 最快；自托管要懂 DB 性能、K8s 扩缩容与评测流水线编排，对多数团队是负担。

---

## 7. 大厂工程实践

### 案例 A：Anthropic——非确定性 multi-agent 的"隐私保护式全量追踪"

Anthropic 在《How we built our multi-agent research system》（2025）里给出了教科书级复盘：

- **为什么必须全量追踪**：agent 在相同输入下行为都不一致，没有 trace 工程师就分不清失败是"搜索 query 烂 / 选源差 / 工具挂了"中的哪一个。
- **刻意的隐私取舍**：监控 agent 决策模式与交互**结构**，但**不**记录单次对话**内容**——用结构换隐私。
- **评测务实主义**：早期 **~20 条真实使用 query 就够**，因为大改动的效应量（effect size）很大；用 LLM-as-judge 按 rubric 打分（事实/引用准确性、完整性、源质量、工具效率），但**人工 eval 不可替代**——它抓到了自动化漏掉的 SEO 内容农场源。

**工程取舍**：可调试性 vs 隐私——Anthropic 用"只看结构不看内容"绕开了二选一。

### 案例 B：Cresta——自托管 Langfuse + 跨语言 trace 传播 + 失败步重放

Cresta（客服 AI）的 Langfuse 自托管复盘（2026）暴露了生产级的硬约束：

- **数据主权是硬要求**：trace 携带客户对话内容，即便做了 PII 脱敏，trace 数据也**必须留在基建边界内**——所以每个 K8s 集群自托管一个 Langfuse 实例，4 周自动删除留存。
- **跨语言 trace context 传播**：一次交互横跨 Go agent → Python RAG → 工具函数，通过 **gRPC metadata 拦截器**传播 trace context，让一次交互成为**一棵跨语言的 trace 树**。
- **多租户隔离**：每个客户一个 Langfuse org。
- **调试 = 从失败步重放**：冻结此前输入，在 sandbox 里换模型/prompt 重跑失败那一步，"秒级复现"而非"部署后干等"。

**工程取舍**：数据合规 + 多语言一致性的复杂度，换来零数据出域与快速复现。

### 案例 C：OpenAI Agents SDK——把 tracing 当默认原语

- **默认开启**：自动捕获 agent/generation/function/handoff/guardrail（+语音转录）五类 typed span，把整个 `Runner.run()` 包成一条 trace。
- **取舍暴露为配置**：`trace_include_sensitive_data` 控制是否丢弃输入/输出/工具参数；`BatchTraceProcessor` 异步批量导出（低开销），但在 Celery/FastAPI worker 里必须调 `flush_traces()` 保证投递；默认导出到 OpenAI 后端，可用 `set_trace_processors()` 扇出到 W&B/Datadog/Langfuse/Phoenix。

**工程取舍**：开箱即用的 agent-aware UX，与异步导出的"可能丢数据"风险——后者靠 flush 兜底。

### 案例 D：Klarna × LangSmith / Langfuse 被收购——可观测性已是生产刚需

- **Klarna / LangSmith**：LangChain 称 LangSmith 已处理**超 10 亿条 trace**，Klarna 案例中客服解决时长下降约 **80%**——佐证 LLM 可观测性是生产级刚需而非实验玩具。
- **Langfuse 被 ClickHouse 收购（2026-01）**：开源自托管赛道走向整合，也说明开源路线需要数据库/商业后盾才能持续（trace 数据本质是海量时序/列存负载，ClickHouse 是天然底座）。

### 案例 E：Google Vertex AI Agent Engine / ADK——标准合规的托管可观测

ADK/Agent Engine 把符合 OTel GenAI semconv 的 trace 直接发到 Cloud Trace/Monitoring/Logging。托管平台范式：用部署期环境变量启用（`GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY`），消息内容捕获显式 opt-in（`OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`）——与 OTel/OpenAI 同样的"内容默认关闭"隐私姿态。

---

## 8. 我的分析与判断

> **以下为分析观点（非客观事实），是我基于上述材料的独立研判，仅供参考。**

**趋势研判一：可观测性的"难点"已经从"捕获"完全转移到"推理"。** 2023–2025 解决的是"怎么把 trace 抓全、抓标准"——这一仗基本打完了，OTel `gen_ai.*` + 一堆成熟平台已经够用。真正没解决、且 2026–2028 会持续是热点的，是 **"trace 太多、太长，人读不过来、模型也读不懂"**。TRAIL 的 11% 和 Who&When 的 14.2% 是两个刺眼的数字：我们能记录一切，却**定位不了决定性错误步**。我判断下一代可观测性平台的护城河不在"抓得全"，而在"**自动从海量 trace 里发现行为模式与系统性缺陷**"——即把失败归因（[[08]]）做成产品能力，而非让工程师逐条人肉排查。谁先把"trace 推理"做到可用，谁就吃下这一代红利。

**趋势研判二：标准会收敛到 OTel，但 OpenInference 会作为"深度层"长期共存。** 类比 APM 十年前的"碎片化先于整合"完全成立。OTel 主干生态成熟 + Datadog 原生支持，给了"最终收敛到 `gen_ai.*`"足够背书（尽管 `gen_ai.*` 约定截至 2026 仍为 experimental、未 stable）。但官方约定的演进速度跟不上 agent 语义的爆炸（MCP、subagent、记忆、内部认知状态），所以 Arize OpenInference 这类"更深但 OTel 兼容"的语义层短期不会消失——**底座统一到 OTel wire format，语义深度各家加料**，这是最可能的终局。生产团队现在就该埋 `gen_ai.*`，但用 `OTEL_SEMCONV_STABILITY_OPT_IN` 双发缓冲 experimental 字段的改名。

**常见坑（我见过/可预见的）：**
1. **只埋监控、不做评测**，仪表盘绿油油、用户却在骂——时延/成本/错误率全正常，但答案是错的/有害的。监控是必要不充分，必须叠 LLM-judge + 人工 eval（[[09]]）。
2. **内容全量裸记**：把 prompt/completion 全文进 trace 又不脱敏，PII/密钥泄漏 + 存储成本爆炸。默认 off、按需开、记录前脱敏。
3. **跨语言/跨服务 trace 断链**：Go→Python→工具不传播 trace context，一次交互碎成 N 棵孤儿 trace，根本没法看因果。必须在 RPC 边界传 trace context（Cresta 的 gRPC metadata 拦截器）。
4. **异步导出丢数据**：用了 BatchProcessor 却不在短生命周期 worker 里 flush，trace 还没发完进程就退了。
5. **采样策略一刀切**：高吞吐下 100% 采样烧钱、1% 采样又抓不到罕见失败。该对"失败/高时延/高成本"的 trace 做**尾部采样（tail-based sampling）**，正常流量降采样。
6. **把 LLM-judge 当真理**：judge 自己会漂移、有偏置、也烧 token——judge 本身也要被观测（judge drift/bias/cost）。

**最佳实践（我的清单）：**
- **三层埋点 + 三层评测对齐**：run/trace/thread 分别对应单步/整轨/多轮评测（LangChain 框架），别只盯最终答案。
- **埋点标准化到 OTel `gen_ai.*`**，内容 off-by-default + 脱敏 + 尾部采样保留失败样本。
- **trace→dataset→回归测试闭环**：每个生产 bug 都转成永久 eval 用例，进 CI 门禁（Braintrust/LangChain 的 evals-in-CI）。
- **失败步重放优先于"改完部署再等"**：冻结前序输入、只换那一步（Cresta），把调试回路从分钟级压到秒级。
- **结构监控 + 内容脱敏的双轨**（Anthropic）：默认监控决策结构，敏感场景才在受控环境下捕获内容。
- **合规先行选型**：有数据主权硬要求 → 自托管 Langfuse/Phoenix；要 time-to-value → SaaS。别等出了合规事故再迁。

---

## 9. 面试考点

**概念题**

1. **为什么 LLM Agent 比传统软件更难调试？trace/span/轨迹各是什么？**
   要点：非确定性（相同输入走不同轨迹）+ 多步且中间态不可见 + 纯日志看不到 prompt/token/链路。trace = 一次完整运行（一棵 span 树）；span = 一个工作单元（一次 LLM/工具/检索调用）；trajectory = trace 的有序步骤序列。靠 trace_id + parent_span_id 重建因果（源自 Dapper 2010）。

2. **OTel GenAI 语义约定的核心 span 树和关键属性是什么？为什么"还不能完全信"？**
   要点：`invoke_agent → chat → execute_tool` 三层 span；属性 `gen_ai.request.model`、`gen_ai.usage.input/output_tokens`、`gen_ai.response.finish_reasons`、`gen_ai.input/output.messages`；指标 `operation.duration` + `token.usage`。坑：截至 2026 多数仍 experimental，会改名/重构，需 `OTEL_SEMCONV_STABILITY_OPT_IN` 双发兼容。

3. **监控（monitoring）和评测（evaluation）有什么区别？为什么不能只做监控？**
   要点：监控答"系统在跑吗、烧多少钱、错误率"（APM/Datadog 强项：时延/成本/错误）；评测答"输出对不对、安不安全"（需 LLM-judge + 人工）。日志说 what happened，eval 说 whether acceptable。最佳实践：低分 trace → dataset → CI 门禁回归测试。监控是必要不充分。

4. **内容捕获为什么默认关闭？这带来什么矛盾？**
   要点：prompt/输出/代码含 PII/密钥，全量内容有隐私/存储/成本压力，故 OTel/OpenAI/Google 都 off-by-default（opt-in 开关）。矛盾：replay 与失败归因（TRAIL/Who&When）依赖完整内容，关掉内容=牺牲可调试性。Anthropic 解法：监控结构不监控内容。

**系统设计题**

5. **为一个生产 multi-agent 客服系统设计可观测性方案（要求：可调试非确定性失败、满足数据合规、控成本）。**
   要点：(a) 埋点——OTel `gen_ai.*`，invoke_agent/chat/execute_tool span 树，记 model/token/duration/finish_reason，内容 off-by-default + PII 脱敏；(b) 跨语言传播——RPC 边界传 trace context（gRPC metadata），一次交互一棵 trace；(c) 部署——数据合规则自托管 Langfuse（每集群一实例、多租户每客户一 org、N 周自动删除）；(d) 采样——尾部采样保留失败/高时延/高成本 trace，正常流量降采样控成本；(e) 调试——失败步重放（冻结前序、换模型/prompt 重跑）；(f) 质量——LLM-judge 在线打分 + 人工抽检 + trace→回归数据集进 CI 门禁；(g) 监控面板——时延/token/成本/错误率 + 在线 eval 分数。讲清每层的隐私/成本/可调试性取舍。

**手写题**

6. **手写一个给 agent 主循环（[[02]]）加 OTel 风格 tracing 的伪代码（含 span 层级、token/finish_reason 记录、内容 opt-in、失败导出保障）。**

```python
def agent_run(user_msg, tools, capture_content=False):
    with tracer.start_span("invoke_agent") as root:          # 顶层 trace
        ctx = [system_prompt(), user_msg]
        for step in range(MAX_STEPS):
            with tracer.start_span("chat", parent=root) as s: # 每次 LLM 调用一个 span
                resp = llm(ctx, tools=tools)
                s.set("gen_ai.request.model", resp.model)
                s.set("gen_ai.usage.input_tokens",  resp.in_tok)
                s.set("gen_ai.usage.output_tokens", resp.out_tok)
                s.set("gen_ai.response.finish_reasons", resp.finish)
                if capture_content:                           # 内容默认关闭，opt-in
                    s.set("gen_ai.input.messages",  redact(ctx))
                    s.set("gen_ai.output.messages", redact(resp))
            if not resp.tool_calls:
                return resp.text                              # 停止条件
            ctx.append(resp)
            for call in resp.tool_calls:
                with tracer.start_span("execute_tool", parent=root) as t:
                    t.set("gen_ai.tool.name", call.name)
                    try:
                        out = execute(call)                   # 真实副作用 = effect
                        ctx.append(out)
                    except Exception as e:
                        t.record_exception(e); t.set_status("ERROR")
                        ctx.append(tool_error(call, str(e)))  # 可操作错误回灌，让 agent 自纠
        return ctx
    # 关键：短生命周期 worker（Celery/FastAPI）退出前必须 flush
    finally:
        tracer.flush_traces()                                 # 否则异步批量导出会丢数据
```

**陷阱题**

7. **"我们 100% 采样所有 trace、全量记录 prompt 内容，这样最安全可调试"——哪里错了？**
   要点：(a) 成本——生产 agent 规模下全量内容 = 存储/带宽爆炸；(b) 隐私合规——prompt/输出含 PII/密钥，全量裸记可能违规；(c) 采样——高吞吐 100% 烧钱，应尾部采样保留失败样本而非一刀切。正解：内容 off-by-default + 脱敏 + 尾部采样。

8. **"LLM-as-judge 能自动给生产 trace 打分，所以失败归因也交给它自动定位决定性错误步即可"——哪里过于乐观？**
   要点：judge 打分（粗筛趋势）和 trace 推理/step 级失败定位是**两码事**。TRAIL（2025）显示当时最强模型轨迹调试仅 ~11%，Who&When step 级归因仅 14.2%——长上下文能力 ≠ trace 推理能力。judge 还有自身偏置/漂移/成本，judge 本身也要被观测。失败定位目前仍需人工兜底。

9. **（延伸）"接了 LangSmith/Datadog 就等于有可观测性了"——哪里是误区？**
   要点：装了平台 ≠ 埋点合理。常见断链：跨语言/跨服务不传 trace context（碎成孤儿 trace）、异步导出不 flush 丢数据、只埋监控不接评测、内容不脱敏。可观测性是**设计**出来的，不是装个 SDK 就有。

---

## 10. 参考文献

### 📄 论文

- **Dapper, a Large-Scale Distributed Systems Tracing Infrastructure** — Sigelman, Barroso, Burrows, Stephenson, et al. (Google), 2010. <https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/> — 提出 trace/span/annotation 与低开销采样，是 LLM/Agent tracing 概念的直接源头。
- **AgentOps: Enabling Observability of LLM Agents** — Liming Dong, Qinghua Lu, Liming Zhu, 2024. <https://arxiv.org/abs/2411.05285> — 首篇系统映射 agent 生命周期"该埋什么"的可观测性分类法。
- **A Survey on AgentOps: Categorization, Challenges, and Future Directions** — Zexin Wang, Jingjing Li, …, Dan Pei, Changhua Pei, 2025. <https://arxiv.org/abs/2508.02121> — 提出监控→异常检测→根因分析→修复四阶段运维框架，强调显式记录内部认知状态。
- **Get Experience from Practice: LLM Agents with Record & Replay (AgentRR)** — Erhu Feng, Wenbo Zhou, …, Yubin Xia, Haibo Chen, 2025. <https://arxiv.org/abs/2505.17716> — 把 record-and-replay 引入 agent，用结构化"经验"+check function 实现确定性复现。
- **TRAIL: Trace Reasoning and Agentic Issue Localization** — Darshan Deshpande, …, Rebecca Qian (Patronus AI), 2025. <https://arxiv.org/abs/2505.08638> — 148 条标注轨迹/841 错误的 trace 调试基准；最强模型仅 ~11%，揭示 LLM 不会读 trace。
- **Which Agent Causes Task Failures and When? (Who&When)** — Shaokun Zhang, Ming Yin, …, Qingyun Wu, 2025. <https://arxiv.org/abs/2505.00212> — 提出自动失败归因问题与数据集；agent 级 53.5%、step 级仅 14.2%。
- **Why Do Multi-Agent LLM Systems Fail? (MAST)** — Mert Cemri, Melissa Z. Pan, …, Matei Zaharia, Ion Stoica (UC Berkeley), 2025. <https://arxiv.org/abs/2503.13657> — 首个 multi-agent 失败分类法（14 模式/3 类）：由约 150 条专家标注 trace（κ=0.88）归纳出 14 模式，1600+ 为其后 LLM-judge 扩展的 MAST-Data。
- **AgentSight: System-Level Observability for AI Agents Using eBPF** — Yusheng Zheng, Yanpeng Hu, Tong Yu, Andi Quinn, 2025. <https://arxiv.org/abs/2508.02736> — 用 eBPF 在 TLS（intent）与内核事件（effect）边界做边界追踪，开销 <3%。
- **LLMs-as-Judges: A Comprehensive Survey on LLM-based Evaluation Methods** — Haitao Li, Qian Dong, …, Qingyao Ai, Yiqun Liu, 2024. <https://arxiv.org/abs/2412.05579> — 系统综述 LLM-as-judge，是对生产 trace 做规模化语义质量监控的方法学基础。
- **AI Observability for Large Language Model Systems: A Multi-Layer Analysis…** — Twinkll Sisodia, 2026. <https://arxiv.org/abs/2604.26152> — 提出五层可观测性分类法（置信度校准→基础设施追踪），指出最大缺口是模型层信号与基建层异常未打通。

### ✍️ 博客与工程文

- **How we built our multi-agent research system** — Anthropic Engineering, 2025. <https://www.anthropic.com/engineering/multi-agent-research-system> — 非确定性 agent 需全量追踪；只监控结构不记录内容；~20 query 评测 + LLM-judge + 人工 eval。
- **AI Agent Observability — Evolving Standards and Best Practices** — OpenTelemetry Blog, 2025. <https://opentelemetry.io/blog/2025/ai-agent-observability/> — 把 semconv 分应用层/框架层，点名 baked-in vs external instrumentation 取舍。
- **Inside the LLM Call: GenAI Observability with OpenTelemetry** — OpenTelemetry Blog, 2026. <https://opentelemetry.io/blog/2026/genai-observability/> — invoke_agent→chat→execute_tool span 树实操；内容默认不捕获，需显式 opt-in。
- **Introducing OpenLLMetry — Extending OpenTelemetry to LLMs** — Nir Gazit (Traceloop), 2023. <https://www.traceloop.com/blog/openllmetry> — 主张回归 OTel 开放协议而非私有格式，避免厂商锁定（Apache-2.0）。
- **AI Agent Observability, Tracing & Evaluation with Langfuse** — Langfuse Blog, 2024. <https://langfuse.com/blog/2024-07-ai-agent-observability-with-langfuse> — agent 为何难调；推荐三阶段成熟度路径，主张结构化 trace 优于无结构日志。
- **Observability for AI Agents: Tracing Multi-Service LLM Pipelines with Langfuse** — Cresta Engineering Blog, 2026. <https://cresta.com/blog/observability-for-ai-agents-tracing-multi-service-llm-pipelines-with-langfuse>（另见 Langfuse 案例页 <https://langfuse.com/users/cresta>）— 案例 B 一手出处：每 K8s 集群自托管一个 Langfuse、跨语言 trace context 传播、多租户隔离、失败步重放。
- **How observability powers agent evaluation** — LangChain Blog, 2026. <https://www.langchain.com/blog/agent-observability-powers-agent-evaluation> — runs/traces/threads 映射单步/整轮/多轮评测；离线评测必要但不充分，需在线 reference-free。
- **Braintrust vs. Datadog for LLM observability: Logging vs. evals** — Braintrust, 2026. <https://www.braintrust.dev/articles/braintrust-vs-datadog-llm-observability> — 监控 vs 评测两件事；evals-in-CI 门禁、trace→回归数据集闭环。
- **Tracing — OpenAI Agents SDK（文档）** — OpenAI, 2025. <https://openai.github.io/openai-agents-python/tracing/> — tracing 默认开启；typed span；`trace_include_sensitive_data`、`flush_traces()`、`set_trace_processors()`。
- **Inspecting runs with OpenTelemetry（smolagents 文档）** — HuggingFace, 2025. <https://huggingface.co/docs/smolagents/en/tutorials/inspect_runs> — multi-step 运行淹没 console，故生产必须插桩；经 `SmolagentsInstrumentor` 发 OTel。
- **Datadog LLM Observability natively supports OpenTelemetry GenAI Semantic Conventions** — Datadog Blog, 2026. <https://www.datadoghq.com/blog/llm-otel-semantic-convention/> — APM 大厂原生对接 OTel GenAI 约定，标志行业向 `gen_ai.*` 收敛。
- **Arize launches Phoenix, an open-source library to monitor LLM hallucinations** — VentureBeat, 2023. <https://venturebeat.com/ai/arize-launches-phoenix-an-open-source-library-to-monitor-llm-hallucinations> — Phoenix 在 Observe 2023 开源，本地/Notebook 跑、面向幻觉与 RAG。
- **Open-source LLM Observability: Langfuse Acquired by ClickHouse** — Orrick News, 2026. <https://www.orrick.com/en/News/2026/01/Open-source-LLM-Observability-Langfuse-Acquired-by-ClickHouse-Inc> — 2026-01 收购事件，标志开源自托管赛道走向整合。
- **ClickHouse welcomes Langfuse: The future of open-source LLM observability** — ClickHouse Blog, 2026-01-16. <https://clickhouse.com/blog/clickhouse-acquires-langfuse-open-source-llm-observability> — 收购方一手公告：ClickHouse 收购 Langfuse，承诺 Langfuse 继续开源、可自托管、Cloud 照常运行。

### 📚 官方文档与规范

- **OpenTelemetry GenAI Semantic Conventions** — OpenTelemetry GenAI SIG, 2024–2026. <https://opentelemetry.io/docs/specs/semconv/gen-ai/> — vendor-neutral 的 `gen_ai.*` span/metrics 约定；截至 2026 多数仍 experimental，需 `OTEL_SEMCONV_STABILITY_OPT_IN`。
- **Semantic conventions for generative AI / LLM spans** — OpenTelemetry Docs, 2024–2026. <https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/> — `gen_ai.*` span 属性定义（model、input/output_tokens、finish_reasons 等）。
- **Semantic conventions for Model Context Protocol (MCP)** — OpenTelemetry Docs, 2025–2026. <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/> — 约定从单次 LLM 调用扩展到 agent 编排与 MCP 工具调用。
- **OpenTelemetry: the merger of OpenCensus and OpenTracing** — Google/Microsoft/CNCF, 2019. <https://opensource.googleblog.com/2019/05/opentelemetry-merger-of-opencensus-and.html> — 奠定 LLM tracing 复用的 trace/span 数据模型与 OTLP 协议。
- **Announcing the General Availability of LangSmith** — LangChain Blog, 2024. <https://www.langchain.com/blog/langsmith-ga> — LangSmith 从闭测到 GA，对 LLM 链路每一步给出可视化追踪与根因定位。
- **LLM Observability & Application Tracing（文档）** — Langfuse Docs, 2024–2026. <https://langfuse.com/docs/observability/overview> — 开源代表：trace + prompt 管理 + 评测 + 人工标注一体，tracing 定义为保留因果关系的首要手段。
- **Phoenix — open-source AI observability & evaluation（GitHub）** — Arize AI, 2025. <https://github.com/Arize-ai/phoenix> — 自托管、OTel/OpenInference、内建 LLM-judge eval，开箱支持 OpenAI/Claude Agent SDK/LangGraph/CrewAI 等。
- **Agent observability / Instrument generative AI applications** — Google Cloud Docs, 2026. <https://docs.cloud.google.com/stackdriver/docs/observability/agent-observability> — Vertex AI Agent Engine + ADK 发 OTel GenAI 合规 trace；内容捕获 opt-in。
- **RFC: Vendor-neutral gen_ai.* semantic convention — Phoenix/Arize feedback** — GitHub Arize-ai/phoenix Discussion #13041, 2025. <https://github.com/Arize-ai/phoenix/discussions/13041> — OpenInference 与 OTel `gen_ai.*` 之争的一手讨论（"中立 vs 深度"）。
- **LangSmith Alternative? Langfuse vs. LangSmith** — Langfuse Docs/FAQ, 2024–2026. <https://langfuse.com/faq/all/langsmith-alternative> — 自托管开源（数据主权）vs 托管 SaaS（零运维）之争的代表对比。

---

> **交叉链接**：[[02]] Harness 运行时（tracing 钩子埋点位置）· [[04]] 工具与 MCP（execute_tool span / MCP semconv）· [[08]] 多智能体编排（失败归因 Who&When/MAST）· [[09]] 评估（observability powers evaluation，trace→dataset）· [[11]] 生产工程（监控/成本/采样/告警）· [[12]] 安全与对抗（内容捕获 PII、用 trace 检测 prompt 注入）· [[13]] 大厂案例（Claude Code/Cursor 的 trace 实践）。
