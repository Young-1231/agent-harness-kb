# Agent / Harness 工程知识库

> 把「一个 Agent 在真实生产系统里，从用户输入到产出结果的**完整工程链路**」以及背后的**知识体系与技术栈**，整理成一套可学习、可面试复用的知识库。
>
> 创建：2026-06-13 ｜ 维护：max（v2 检修 2026-06-14）｜ 定位：研究深度 × 工程实践 × 大厂对标

---

## 一、需求分析（对目标的理解）

要的不是论文清单，而是一套 **面向研究 + 面向实践 + 对标互联网大厂** 的 Agent 工程知识库，三个目标：

1. **吃透完整链路** —— Agent / Harness 在生产中如何端到端运转（不是玩具 demo）。
2. **配齐知识与技术栈** —— 每个环节「是什么 + 为什么 + 大厂用什么」。
3. **可直接用于面试** —— 概念题、系统设计题、手写题、项目深挖一站备齐。

设计原则：

- **链路驱动**：按「一个请求穿过 Agent 系统」的真实生命周期组织，而非按论文罗列。
- **概念 / 实现 双轨**：每个专题既讲原理（research），也讲落地（practice / 大厂案例）。
- **面试可复用**：每节单列「面试高频考点」。
- **中文讲解 + 英文术语保留**：术语用业界通行英文，避免翻译失真。

---

## 二、Agent 工程全景：完整链路

```
                          用户输入 / 意图
                               │
                               ▼
            ┌──────────────────────────────────────────┐
            │  Harness 组装上下文（Context Assembly）     │
            │  system prompt · 工具定义 · 对话历史 ·       │
            │  长期记忆 · 检索结果(RAG) · 当前文件/状态     │
            └──────────────────────────────────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │   LLM 推理（Think）         │
                 │   决定：输出文本 / 调用工具   │
                 └──────────────────────────┘
                       │                  │
              (文本 / 完成)            (tool call)
                       │                  │
                       ▼                  ▼
                 流式输出给用户   ┌──────────────────────────────┐
                                │ Harness：解析 → 权限校验 →       │
                                │ 沙箱执行工具 → 结果回灌上下文     │
                                └──────────────────────────────┘
                                              │
                                              └──► 回到「LLM 推理」循环
                                  （直到完成 / 触达停止条件 / 预算耗尽）

  ── 横切关注点（贯穿全程）──────────────────────────────────────────
   · 上下文增长 → Compaction / 摘要压缩      · KV / Prefix Cache 复用
   · Tracing 轨迹记录 → 可观测性             · Guardrails + Prompt 注入防御
   · 长期记忆写回                            · 评估（离线回归 + 在线监控）
```

### 技术栈分层速览

| 层 | 关注点 | 代表技术 / 工具 |
|---|---|---|
| 模型与推理 | 选型 · 结构化输出 · 缓存 | Claude(Opus/Sonnet/Haiku) · GPT · Gemini ｜ function calling · JSON mode · prompt caching |
| Harness 运行时 | 主循环 · 工具协议 · 停止条件 | Claude Agent SDK · OpenAI Agents SDK · LangGraph |
| 上下文工程 | 压缩 · 记忆 · 缓存布局 | compaction · prefix cache · 裁剪策略 |
| 工具 | 工具设计 · 标准化 | MCP · function calling |
| 规划 | 任务分解 · 反思 | ReAct · Reflexion · Plan-and-Execute · TODO |
| 记忆 | 长 / 短期 | 向量库 · 文件 · 知识图谱 |
| 检索 | RAG | embeddings · Pinecone/Qdrant/pgvector · rerank |
| multi-agent | 编排 | LangGraph · AutoGen · CrewAI · OpenAI Agents SDK |
| 评估 | 任务 / 轨迹 | SWE-bench · τ-bench · GAIA · LLM-as-judge · Braintrust |
| 可观测 | 追踪 | LangSmith · Langfuse · Phoenix · OTel GenAI |
| 生产 | 时延 · 成本 · 护栏 | 缓存 · HITL · rate limit · fallback |
| 安全 | 注入 · 沙箱 | 沙箱隔离 · 最小权限 · 注入检测 |

---

## 三、目录索引与进度

| # | 专题 | 一句话 | 状态 |
|---|---|---|---|
| 00 | [导论与心智模型](./00-导论与心智模型/) | Agent 到底是什么，与 workflow 的边界 | 🟢 |
| 01 | [Agent 核心与推理范式](./01-Agent核心与推理范式/) | ReAct / Reflexion / 推理模型 | 🟢 |
| 02 | [Harness 运行时](./02-Harness运行时/) | 主循环 · 工具调用机制 · 停止条件 | 🟢 |
| 03 | [上下文工程](./03-上下文工程/) | context engineering · compaction · cache | 🟢 |
| 04 | [工具与 MCP](./04-工具与MCP/) | 工具设计 · function calling · MCP | 🟢 |
| 05 | [规划与任务分解](./05-规划与任务分解/) | 分解 · 反思 · TODO 模式 | 🟢 |
| 06 | [记忆系统](./06-记忆系统/) | 长短期记忆 · 存储 · 检索 | 🟢 |
| 07 | [检索与 RAG](./07-检索与RAG/) | embeddings · 向量库 · agentic RAG | 🟢 |
| 08 | [多智能体编排](./08-多智能体编排/) | supervisor · subagent · 何时 multi-agent | 🟢 |
| 09 | [评估](./09-评估/) | 轨迹评估 · benchmark · LLM-judge | 🟢 |
| 10 | [可观测性与调试](./10-可观测性与调试/) | tracing · 监控 · replay | 🟢 |
| 11 | [生产工程](./11-生产工程/) | 时延 · 成本 · 并发 · 护栏 | 🟢 |
| 12 | [安全与对抗](./12-安全与对抗/) | prompt 注入 · 沙箱 · 权限 | 🟢 |
| 13 | [大厂案例研究](./13-大厂案例研究/) | Claude Code · Cursor · Devin 拆解 | 🟢 |
| 14 | [技术栈速查](./14-技术栈速查/) | 框架 / 工具地图与选型 | 🟢 |
| 15 | [面试题库](./15-面试题库/) | 概念 · 系统设计 · 手写 · 项目深挖 | 🟢 |
| 16 | [Agent 训练与强化学习](./16-Agent训练与强化学习/) | RLHF/RLVR · GRPO · agentic RL · 轨迹蒸馏 | 🟢 |
| 17 | [互操作协议与 Agent 经济](./17-互操作协议与Agent经济/) | MCP · A2A · 身份发现 · AP2/ACP 支付 | 🟢 |

---

## 四、学习路线（三条 track）

- 🅰 **面试冲刺（~1–2 周）**：`00 → 02 → 03 → 04 → 05 → 08 → 09 → 13 → 15`
- 🅱 **系统精通（全量）**：`00 → 17` 顺序通读
- 🆎 **主题速查**：按需直达对应目录
- 🆕 **训练/前沿补充**：吃透链路后读 `16 训练与 RL`（护城河前移到轨迹数据 + RL）与 `17 协议与 Agent 经济`（MCP/A2A/支付的分层生态）

> 把 18 节历史主线缝成一条、并附三条路线的逐节索引与交叉依赖地图，见 **[OVERVIEW-发展总脉络.md](./OVERVIEW-发展总脉络.md)**。

---

## 五、约定

- 每个编号目录含 `README.md`：大纲 + 大厂实践 + 面试考点 + 参考。
- 状态：🔴 待填充 ／ 🟡 进行中 ／ 🟢 已完成。
- 图示、资料放各目录或根 `assets/`。

---

## 六、维护状态（v2 检修已收口）

> 维护状态：v2 检修已于 2026-06 全量收口——18 节正文 + OVERVIEW + 元文档均已对齐到根 `_事实基线-2026-06.md`。
>
> 增量（2026-06-17）：经小红书社媒情报采集（见 [`_小红书情报快照-2026-06.md`](./_小红书情报快照-2026-06.md)）+ 联网核实，补入两项新进展——**Loop Engineering**（harness 之上的调度循环层，2026-06）与 **OpenAI《Harness engineering》**（Codex, 2026-03，坐实 harness engineering 为行业通用词），已落到基线 / OVERVIEW / `02` / `15`。

18 节正文均由 **workflow（multi-agent）** 生产并校验完成（原 16 节施工蓝图见 **[PLAN.md](./PLAN.md)**，16/17 两节为 v2 新增），历史主线缝合见 **[OVERVIEW](./OVERVIEW-发展总脉络.md)**。

**v2 检修已于 2026-06 全量收口**：

- **已建事实基线**：以 9 路并行联网核验沉淀 `_事实基线-2026-06.md`，作为本轮（批次 A→D）**唯一事实来源**（零编造红线）。
- **批次 A · 时点刷新（全部各章正文已落地）**：按 2026-06 当代模型阵容校正旧旗舰、把已兑现的 2026 预测改写为「已落地」，并把已核验的 2026 H1 里程碑并入 OVERVIEW §5/§6/§7——METR Time Horizon 1.1、退役 SWE-bench Verified、2026 MCP Roadmap、Anthropic 长跑 harness / Managed Agents（brain-hands）、Microsoft Agent Framework 1.0 GA、A2A 一周年、OWASP Agentic 2026、Menlo 市场数字、EU AI Act 时点 nuance；同步修订基线 §4 标注的硬错。

- **批次 B · 新增两专节（已落地）**：`16 Agent 训练与强化学习`（RLHF/RLVR、GRPO、agentic RL（MDP→POMDP）、轨迹蒸馏、记忆即可学习操作、「RLVR 扩展 vs 锐化」之争）与 `17 互操作协议与 Agent 经济`（纵向 MCP / 横向 A2A·AGNTCY / 身份发现 NANDA / 支付电商 AP2·ACP·x402），均经对抗校验（引用联网抽检、零编造）。

**批次 C→D 已完成**：已为已结案争议加上「结案框」（RAG vs 长上下文、single-agent vs multi-agent、要不要 MCP）、完成 02/11 运行时原语升级（brain/hands/session、durable execution、HITL）、立起 03 四动词主脊、补齐 09 基准生命周期 + 不确定性量化、完成 12 阶段化 + OWASP Agentic 2026、14 现代化（维护状态/继任者列）、治理合规 / Agent FinOps / 市场附录、命名模式↔章节交叉索引，并已扩充此前未覆盖的大厂（微软 MAF/Copilot、谷歌 ADK、AWS Bedrock、国内 Qwen/GLM/Kimi）。
