# Agent 工程发展总脉络（OVERVIEW）

> **定位**：把 [[00]]–[[17]] 十八节各自的「历史发展脉络」抽出来，缝成**一条**从底座到产品的主线。这一篇不讲机制（机制在各节里），只回答两个问题：**这十年是怎么一步步走到今天的**、**该按什么顺序读这套库**。
>
> 一句话主线：**架构地基（2017 Transformer）→ 会想 + 会用工具（2022 CoT/ReAct/function calling）→ 范式爆发与认知架构（2023 长上下文/RAG/反思/multi-agent）→ 产品化 + 推理模型 + 标准化（2024 Devin/o1/MCP/Computer Use）→「Agent 元年」与三大工程纪律之争（2025 context engineering / single-agent vs multi-agent / lethal trifecta）→ 收敛、退役与训练侧前移（2026）。**

---

## 0. 怎么读这张图

把整条脉络压成**一个驱动逻辑**：每一步演进都是被下面三股力中的一股逼出来的——

1. **能力外溢**：基座一变强，上一代的「难点」就贬值（如推理内化让外部 ToT/Reflexion 脚手架变薄）。
2. **生产踩坑**：demo 跑通 ≠ 产品可用，token 爆炸 / 上下文腐烂 / 提示注入 / 评测污染，每一个坑都催生一节工程纪律。
3. **标准与经济学**：M×N 集成爆炸催生 MCP，token 经济学催生 context engineering 与缓存工程，可复现催生评测与可观测。

读 timeline 时，对每个里程碑都问一句「它是被哪股力逼出来的」，就能把零散事件串成因果链。下面按六个时代展开，**加粗**的是该时代的枢纽拐点。

---

## 1. 史前与底座（1995–2021）：从符号 agent 到「能被提示指挥的模型」

agent 概念远早于 LLM。1995 年《AIMA》确立「理性 agent＝感知→决策→行动以最大化目标」，1997 年 Franklin & Graesser 给出前 LLM 时代的 agent 四要件（反应性/自主性/目标导向/持续性）——这是 [[00]] 的学术锚点。2013–2016 的 DQN/AlphaGo 证明「从奖励学策略」能碾压手写规则，但被锁死在封闭仿真器、无语言无常识，凸显对「通用可迁移底座」的渴求。

底座的两次「换引擎」在这一段完成：手写规则 → RL 策略 → **有语言和世界知识的 LLM**。

- **2017 · Transformer（《Attention Is All You Need》）** — 全部后续基座的架构母体。self-attention 的 O(n²) 既给了长上下文能力，也埋下 [[03]] context rot 与 [[11]] KV-cache 经济学的根。**这是整张脉络真正的地基**（各节 timeline 多从 2020 起步，但它们脚下都是这块砖）。
- **2020 · GPT-3 / in-context learning** — 第一次「调用基座」而非「自己训模型」，瓶颈从训练转到应用层（[[00]][[03]][[11]]）；同年 **RAG**（Lewis et al.）+ REALM/DPR/ColBERT 奠定「非参数化记忆」与向量检索栈（[[06]][[07]]）。
- **2021 · WebGPT** — LLM 第一次系统地「用工具 + 与环境交互」，符号/RL agent 向 LLM agent 过渡的先声（[[00]][[04]]）；BEIR/SPLADE/Contriever 让混合检索成为行业共识（[[07]]）。

---

## 2. 发轫（2022）：让模型「会想」与「会用工具」，并跑进一个循环

这一年同时点亮了 agent 所需的两半能力——推理（think）与行动（act）——并把它们缝进一个循环。

- **2022-01 · Chain-of-Thought** — 把潜在中间计算显式化，解锁多步推理（[[01]][[03]][[05]]）。
- **2022-03 · InstructGPT/RLHF + STaR + Self-Consistency** — 指令跟随让「自然语言目标→可控行为」成为可能（why-now 核心使能技术，[[00]]）；STaR 第一次把推理「训」进权重（[[01]]）。
- **2022-05/09 · MRKL（LLM 当路由器）/ Code as Policies** — tool-routing 与 code-as-action 的概念祖先（[[02]][[04]]）；同年 9 月 Willison 类比 SQL 注入命名 **prompt injection**（[[12]]）。
- **2022-10 · ⭐ ReAct + LangChain v0** — **本脉络的零点**：`Thought→Action→Observation` 把文本生成器变成「观察–行动」闭环主体；同月 LangChain 把它封装成首个流行框架，从「手写」迈入「框架时代」。几乎所有后续 harness、编码 agent、computer-use agent 都跑这个循环（[[01]][[02]][[04]][[05]][[08]]）。
- **2022-11 · ChatGPT** — 把能力普及成产品，直接点燃随后一年的研究与创业潮（[[00]][[11]]）；同期 Speculative decoding、Orca continuous batching（OSDI'22）开启时延/吞吐优化主线（[[11]]）。

---

## 3. 爆发（2023）：认知架构、长上下文、RAG、multi-agent 一次铺开

GPT-4（2023-03）推理跃升后，社区在一年里把今天题库的概念骨架几乎全部定型。两条暗线并行：**自主度上探**（AutoGPT→Voyager）与**很快暴露的可靠性危机**（全自主烧钱跑偏）。

- **2023-02/03 · Toolformer / 间接注入(IPI) / AutoGPT·BabyAGI / Reflexion / CAMEL / HuggingGPT** — 工具使用从「提示」变「学习」（[[04]]）；Greshake 把威胁从聊天框推向真实应用（[[12]]）；AutoGPT「给个目标就走开」数月破 10 万 star 却当场暴露目标漂移/死循环/烧钱——**反面教材定义了后来所有「加护栏、缩作用域、人在环」的问题边界**（[[00]][[02]][[08]]）；Reflexion 确立「语言反思 + 情景记忆」的免训练学习（[[01]][[06]]）；CAMEL 开启角色协作的 multi-agent 路线（[[08]]）。
- **2023-04/05 · Generative Agents / ToT / Voyager / ReWOO / Multi-Agent Debate / Claude 100K** — 斯坦福小镇证明 agent 需要「记忆流+反思+规划」的认知脚手架（[[00]][[06]]）；ToT 把 CoT 推广为带回溯的搜索（Game-of-24 4%→74%，[[01]]）；Voyager 展示开放式终身学习（[[00]][[02]]）；ReWOO 把规划与观测解耦、省 ~5× token（[[02]][[05]]）；Multi-Agent Debate 开辟「辩论/校验」这条与角色协作并行的第二路线（[[08]]）；Claude 100K 窗口引出「长上下文 vs RAG」之争的伏笔（[[03]]）。
- **2023-06 · ⭐ OpenAI function calling + Lilian Weng agent 综述** — 工具调用从脆弱的「提示词解析」升级为模型原生能力（结构化 JSON），循环才可靠到能进生产（[[02]][[04]]）；Lilian Weng 把 ReAct/Reflexion 串成「大脑+规划+记忆+工具」统一心智模型，成为后续所有框架的概念地基（[[00]]）。
- **2023-07 · Lost in the Middle / GCG·Jailbroken / WebArena** — U 形位置偏置首次戳破「窗口越大越好」（[[03]][[07]]）；GCG 证明越狱可自动化、可迁移（[[12]]）；WebArena 把「在真实环境多步做事」搬上评测台（GPT-4 仅 14.41% vs 人类 78.24%，[[09]]）。
- **2023-08/09 · OWASP LLM Top10 / AutoGen / AgentBench / CoALA** — 注入被钉为 LLM01（[[12]]）；AutoGen 把 multi-agent 对话做成可编程基础设施（[[08]][[14]]）；CoALA 用认知科学统一记忆四分类，给整个领域提供坐标系（[[06]][[14]]）。
- **2023-10/11/12 · SWE-bench / MemGPT / DSPy / GAIA / LLMCompiler** — **SWE-bench 把编码评测从「补全函数」升级为「解决真实工单」**，立下后续每个 agent 追赶的北极星（[[09]][[13]]）；MemGPT「LLM 即操作系统」确立 RAM/disk 分层记忆（[[06]]）；DSPy 开「编译式/programming-not-prompting」支线（[[14]]）；GAIA 成为 deep research 的事实标尺（[[09]][[13]]）。

---

## 4. 产品化与标准化（2024）：harness 成为产品、推理训进权重、MCP 立标准

主线从「能不能做」转向「怎么做对、怎么做便宜、怎么做安全」。**三件大事重塑全局**：推理模型（o1）、工具标准（MCP）、computer use。

- **2024-01/02 · LangGraph / Gemini 1.5（1M token）/ CodeAct** — 线性 chain 表达不了环/分支/持久化，图式状态机给出可恢复编排，正面回应 AutoGPT 的状态丢失痛点（[[02]][[08]][[14]]）；Gemini 1.5 把「RAG 已死」之争推上风口（[[03]][[06]][[07]]）；CodeAct 给 code-as-action 提供学术地基（[[02]][[04]][[14]]）。
- **2024-03/05 · ⭐ Devin / SWE-agent ACI** — Devin 自称「首个 AI 软件工程师」，把叙事从「通用全自主」拉向「垂直、长程、有真实基准」，开启 agent 创业潮（[[00]][[13]]）；**SWE-agent ACI 证明：固定模型、只改接口（harness），SWE-bench 就几乎翻倍（3.8%→12.5%）——「scaffolding 与模型同等重要」成为全行业共识**（[[02]][[13]]）。
- **2024-06/08 · τ-bench / AgentDojo / SWE-bench Verified / prompt caching** — τ-bench 用 `pass^k` 揭穿「单次成功率」的幻觉（SOTA<50%，[[02]][[09]]）；AgentDojo 成为注入攻防的统一打分台（[[12]]）；OpenAI 雇 93 名开发者把 SWE-bench 洗成 500 题干净子集，评测开始自我纠偏（[[09]]）；三大厂把 prompt caching 产品化，缓存成本/延迟的经济模型成型（[[03]][[11]]）。
- **2024-09 · ⭐ OpenAI o1** — 用 RL 把「超长思维链/测试时计算」训进权重，**推理从 prompt 外挂搬进权重，test-time compute 成为第三条 scaling 轴**；外部 ToT/Reflexion 脚手架开始被吸收，agent 主循环变薄（[[00]][[01]]）。
- **2024-10/11 · ⭐ Computer Use / Swarm / MCP** — Anthropic Computer Use 让模型像人一样读截图、点像素，agent 从「调 API」迈向「用人类的工具」（[[00]][[13]]）；OpenAI Swarm 用 handoff 原语极简化多智能体编排（[[08]]）；**MCP 用统一协议把 M×N 集成爆炸降为 M+N，几个月内涌现上千 server，2025 被各大厂采纳——agent 进入「基础设施成熟」阶段**（[[00]][[04]][[14]]）。
- **2024-12 · ⭐ Building Effective Agents / smolagents** — Anthropic 把「workflow vs agent」二分法与五种 workflow 模式写成行业最被引用的工程话语，主张「非必要不建 agent、别急着上框架」（[[00]][[01]][[02]][[08]]）；smolagents 把 harness 极简到 ~1000 行、主推 code-as-action（[[14]]）。

---

## 5. 「Agent 元年」与三大工程纪律之争（2025）：编排 / 上下文 / 安全

模型不再是唯一变量，**领域成熟为三条工程纪律的公开辩论**：single-agent vs multi-agent（编排）、context engineering（上下文）、lethal trifecta（安全）。

- **2025-01/02 · DeepSeek-R1 + Kimi k1.5 / Operator / Claude 3.7 extended thinking** — R1 用纯 RL（GRPO）涌现反思、开源蒸馏，**把 o1 配方平民化、坐实 RLVR**（[[01]]）；Operator/CUA 把 computer use 推成消费级产品（OSWorld 38.1% vs 人类 72.4%，暴露能力/宣传鸿沟，[[00]][[13]]）；Claude 3.7 把「思考深度」做成产品旋钮（[[01]]）。
- **2025-03/04 · OpenAI Agents SDK / METR / CaMeL / MAST / Practical Guide** — 模型厂亲自下场出官方运行时，agent loop 从第三方框架变成厂商原语（[[02]][[08]][[14]]）；METR 用「50% 任务时间跨度」度量自治度（约每 7 个月翻倍，[[09]]）；CaMeL 把防御从「修模型」转向「修架构」、对一类注入可证明安全（[[12]]）；MAST 由约 150 条专家标注 trace（κ=0.88）归纳 14 种 multi-agent 失败模式（1600+ 是其后用 LLM-judge 扩展的 MAST-Data 数据集），把领域从「能力叙事」扳向「可靠性叙事」（[[08]][[10]][[11]]）。
- **2025-06 · ⭐⭐ 同月对撞** — **这是 2025 的引爆点**：Anthropic《multi-agent 研究系统》(6/13，orchestrator-worker 比 single-agent +90.2%、约 15× token) 对撞 Cognition《Don't Build Multi-Agents》(6/12，单线程 + single-writer)——两家头部公司隔日给出相反结论，成为 single-agent vs multi-agent 的定义性辩论（[[00]][[02]][[05]][[08]][[13]]）；同月 Karpathy/Lütke 把 **context engineering** 正名为 AI 工程师核心技能（[[03]][[15]]）；Willison 提出 **lethal trifecta**、六设计模式论文、首个生产级零点击注入 **EchoLeak** 同月落地（[[12]]）。**编排/上下文/安全三大纪律的旗帜同月插下。**
- **2025-07/08/09 · Manus / ChatGPT Agent / GPT-5 router / Claude Agent SDK + memory tool / SWE-bench Pro** — Manus 把 KV-cache 命中率做成头号生产指标（缓存/未缓存 ~10× 价差，[[03]][[13]]）；ChatGPT Agent 把 Operator+Deep Research 合并，行业向「统一通用 agent」收敛（[[13]]）；Claude Code SDK 更名 Claude Agent SDK、记忆走文件式 `/memories`（[[02]][[06]][[14]]）；SWE-bench Pro 用 held-out/商业仓库做抗污染继任者（[[09]]）。
- **2025-10/11/12 · Karpathy「decade of agents」/ Rule of Two / Code execution with MCP / 长跑 harness / 浏览器注入缓解 / OWASP Agentic 2026 · Menlo 市场盘点 / MCP 捐 Linux Foundation** — Karpathy 给「元年」叙事泼冷水：缺记忆/持续学习/可靠多模态，是「agent 的十年」（[[13]]）；Meta 把 lethal trifecta 工程化为「任一会话最多满足三者中两个」（[[12]]）；Code execution with MCP 把工具定义按需加载、150K→2K token（-98.7%），code-as-action 因「省上下文」正式进生产（[[02]][[03]][[04]][[14]]）；Claude for Chrome 把浏览器注入从 23.6%（无缓解）压到 11.2%（autonomous+缓解，[[12]]）；**年末两份报告给「元年」定调**：OWASP 发布《Top 10 for Agentic Applications 2026》（ASI01 目标劫持…ASI10 失控 agent，映射 CSA MAESTRO 七层，[[12]]），Menlo 测得 2025 企业 GenAI 支出约 $37B（较 2024 的 $11.5B 增 3.2×）、但仅约 16% 部署算真 agent（[[11]][[13]]）；Cursor/Claude Code 各破 $10 亿 ARR——**编码成为 agent 第一个跑通收入的垂直，且赢家走 HITL「增强」而非 Devin 式「全委派」**（[[13]]）；MCP 捐给 Linux Foundation 旗下 AAIF，锁定行业标准地位（[[04]]）。

---

## 6. 收敛、退役与训练侧前移（2026）

工程焦点从「prompt」彻底转到「接口、上下文预算、评测维护、隔离」，并出现两个新信号：评测进入「退役 + 污染审计」常态，护城河向「拿得到轨迹数据做 RL」的训练侧前移。

- **2026-01/02 · METR Time Horizon 1.1 / Demystifying evals / 退役 SWE-bench Verified / Langfuse 被收购 / Mastra v1.0** — METR 更新时间地平线度量：Opus 4.5 的 50% 任务时长≈320min、GPT-5≈214min，且 2024 起窗口的能力翻倍周期收紧到≈88.6 天（总体≈196.5 天，[[00]][[09]]）；Anthropic 把 agent 评测沉淀为手册（grader 三分法、pass@k vs pass^k、读 transcript，[[09]]）；**OpenAI 亲手退役自己造的 SWE-bench Verified（2026-02-23 审计：o3 138 道未稳定解题中 59.4% 是测试/题面缺陷、全部前沿模型有污染）——基准生命周期的权威警世故事**（[[09]]）；可观测开源赛道走向整合（[[10]]）。
- **2026-03/04 · 2026 MCP Roadmap / Anthropic 长跑 harness + Managed Agents / Microsoft Agent Framework 1.0 GA / A2A 一周年 / OpenDev 论文 / Cursor agent harness + CursorBench / Cognition Cloud Agents（microVM）/ Multi-Agents What's Working / Dynamic context discovery** — 学界与产业同时把「harness 设计」摆上台面（双 agent 规划/执行、按模型定制工具格式、把可靠性打到 2–3 个 9，[[02]]）；**Anthropic 连发两篇 harness 工程文**：《Harness design for long-running apps》(3/24) 给出 GAN 式 generator-evaluator、上下文 reset + 结构化交接、planner-generator-evaluator 三 agent；《Scaling Managed Agents》(4/8) 把 agent 拆成 brain/hands/session 三层、TTFT p50≈降 60%（p95>降 90%）、凭证不入沙箱（vault+proxy）（[[02]][[08]][[11]][[12]][[13]]）；**协议与框架同步标准化**：MCP 发布《2026 Roadmap》（无状态 Streamable HTTP、Tasks 通信原语、治理与企业就绪，[[04]]），A2A 满周年并入 Linux Foundation——150+ 组织、v1.0 首个稳定规范、三云生产（[[04]][[08]]），微软 Agent Framework 1.0 GA 把 AutoGen 与 Semantic Kernel 合一、二者转维护态（[[08]][[14]]）；Cognition 用 microVM 每会话独立内核运行不可信代码（[[11]][[12]]），并把 multi-agent 收窄为「写单线程、辅助 agent 只贡献智能」的 map-reduce-and-manage 窄模式（[[08]]）；Cursor 实证「模型变强后少给前置上下文、让 agent 自取更省更准」（[[01]][[03]]）。
- **2026-06 · OpenAI Dreaming（记忆后台自动合成）/ Loop Engineering 起势** — Dreaming 把记忆从「用户策展」推向「后台自动合成 + 时间性更新」，代表「自动 vs 可审计」取舍的最新一跳（[[06]]）；同月 **Loop Engineering**（Peter Steinberger 6/7 起于 X，二周内重塑话语）把工程重心再上提一层——从「装备单次运行的 harness」到「驱动 agent 的循环」（定时唤醒 / 派生子 agent / 自我投喂）。它**不取代 harness，而是其上一层**，与 3 月 Anthropic（《Harness design》）+ OpenAI（《Harness engineering》Codex）同推「harness engineering」连成一条「prompt → context → harness → loop」越来越外层的工程化主线（[[02]][[05]]）。
- **前瞻 · EU AI Act 高风险义务**（合规/治理）— 高风险义务原定 **2026-08-02** 生效；2026-05-07「Digital Omnibus」提案拟推迟至 **2027-12-02**，但截至 2026-06 尚未正式通过，**法律上原日期仍有效**（[[11]][[12]]）。

---

## 7. 主时间线总表（缝合 18 节）

| 年代 | 枢纽拐点（⭐） | 代表作 / 事件 | 主要落在 |
|---|---|---|---|
| 1995–2021 | — | AIMA·Franklin&Graesser / DQN·AlphaGo / **Transformer(2017)** / GPT-3·RAG(2020) / WebGPT(2021) | 00·03·06·07·11 |
| 2022 | ⭐ ReAct + LangChain | CoT / InstructGPT / MRKL / function-calling 前夜 / ChatGPT / Orca·投机解码 | 00·01·02·04·05·11 |
| 2023 | ⭐ function calling 进 API | GPT-4·AutoGPT / Reflexion·CAMEL / Generative Agents·ToT·Voyager / Lost-in-the-Middle / SWE-bench·MemGPT·DSPy·GAIA / OWASP·间接注入 | 00·01·02·03·05·06·07·08·09·12·14 |
| 2024 | ⭐ o1 · ⭐ MCP · ⭐ Computer Use | Devin·SWE-agent ACI / τ-bench·AgentDojo·SWE-bench Verified / prompt caching / Building Effective Agents·smolagents | 00·01·02·04·08·09·11·12·13·14 |
| 2025 | ⭐⭐ 6月同月对撞（multi-agent vs single-agent / context engineering / lethal trifecta） | R1·k1.5 / Operator / Agents SDK·CaMeL·MAST / Manus / Claude Agent SDK / Code execution with MCP / $10亿 ARR / OWASP Agentic 2026·Menlo 市场盘点 | 全节 |
| 2026 H1 | ⭐ 评测退役常态 · 训练侧前移 · 协议/框架标准化 · **harness/loop engineering 成行业词** | METR 1.1 / Demystifying evals·退役 SWE-bench Verified / 2026 MCP Roadmap·A2A 一周年 / **Anthropic+OpenAI harness engineering**·Managed Agents / MAF 1.0 GA / Cursor harness·CursorBench / microVM Cloud Agents / Dreaming·**Loop Engineering** | 02·04·06·08·09·10·11·12·13·14 |

---

## 8. 演进的内在逻辑（一句话收束）

- **底座两次换引擎**：手写规则 → RL 策略 → LLM；范式从「一次性生成」→「带反馈的闭环（ReAct）」→「把闭环里的审议训进权重（o1/R1）」。
- **认知科学的旧概念被接回**：记忆/规划/反思在 CoALA、Generative Agents、MemGPT 里重新装配进 LLM。
- **工程纪律由产品化逼出**：context engineering（[[03]]）、workflow vs agent（[[00]]）、single-agent vs multi-agent（[[08]]）、评测维护（[[09]]）、lethal trifecta（[[12]]）——全是「demo→生产」鸿沟的结晶。
- **护城河在迁移**：2022「会写 prompt」→ 2024「会设计 harness/ACI」→ 2025「会管上下文与缓存」→ 2026「拿得到轨迹做 RL」。**底层越商品化（厂商 SDK、MCP、托管缓存），架构判断力与训练数据越值钱。**

---

## 9. 三条学习路线索引

> 三条 track 共用同一套 18 节，区别只在**顺序与深度**。每节后标注「读完你能回答什么」。

### 🅰 面试冲刺（~1–2 周，按「能在白板讲清」排序）

目标：45 分钟 loop 里把「模型 vs harness」「single-agent vs multi-agent」「RAG vs 长上下文」「刷榜 vs 评估」一口气讲清。

`[[00]] → [[02]] → [[03]] → [[04]] → [[05]] → [[08]] → [[09]] → [[13]] → [[15]]`

| 顺序 | 节 | 读完能回答 |
|---|---|---|
| 1 | [[00]] 导论与心智模型 | Agent vs Workflow 本质区别、自主性光谱、why-now、ReAct 心智模型 |
| 2 | [[02]] Harness 运行时 | harness 三要素、tool-call 全链路、停止条件、谁拥有 loop、薄 vs 厚之争 |
| 3 | [[03]] 上下文工程 | context rot、KV/prefix cache 经济学、compaction、Write/Select/Compress/Isolate |
| 4 | [[04]] 工具与 MCP | function calling vs MCP、好工具五原则、工具过载的检索/代码执行解法、tool poisoning |
| 5 | [[05]] 规划与任务分解 | plan-then-execute vs interleaved、反思的边界、TODO 复诵、计划遵守度 |
| 6 | [[08]] 多智能体编排 | 五种编排拓扑、单写者原则、+90.2%/15× token、何时该/不该上 multi-agent |
| 7 | [[09]] 评估 | 三层评估、grader 三分法、LLM-judge 偏差、pass@k vs pass^k、污染与退役 |
| 8 | [[13]] 大厂案例 | Devin/Cursor/Claude Code/Anthropic Research 的工程取舍当答题弹药 |
| 9 | [[15]] 面试题库 | 五大题簇、六组「陷阱 vs 正确姿势」、两个手写原语、STAR 模板 |

> 时间紧时的「最小可用集」：`00 → 02 → 08 → 09 → 15`（覆盖元心智模型 + 最高频陷阱）。

### 🅱 系统精通（全量，按链路生命周期顺读）

目标：吃透「一个请求穿过 agent 系统」的完整工程链路。按 `[[00]] → [[17]]` 顺序通读，逻辑分五段：

1. **地基与大脑**（00→01）：定义、心智模型、推理范式（CoT→ReAct→o1/R1→GPT-5.x/Opus 4.x 一代）。
2. **运行时与喂养**（02→07）：harness 循环 → 上下文工程 → 工具/MCP → 规划 → 记忆 → 检索/RAG（这六节是「上下文里放什么 + 怎么转一圈」的供给侧与调度侧）。
3. **规模化与守护**（08→12）：multi-agent → 评估 → 可观测 → 生产工程 → 安全（把单循环扩成可靠、可观测、可上线的系统）。
4. **集成与出栈**（13→15）：大厂案例（机制落到真实产品）→ 技术栈速查（零件箱选型）→ 面试题库（把知识出栈成答案）。
5. **前沿与外延**（16→17）：训练与强化学习（护城河从 prompt/harness 前移到「拿得到轨迹做 RL」）→ 互操作协议与 Agent 经济（single-agent 链路外延为跨 agent 的协议层与支付层）。

> 读法建议：每节先读 §1 TL;DR + §3 历史脉络 + §8 我的判断三块，建立骨架；再回头补 §4–§7 的机制与争议。

### 🆎 主题速查（按需直达，问题→入口）

| 你想解决的问题 | 直达 |
|---|---|
| Agent 到底是什么、要不要上 agent | [[00]] |
| 推理模型时代还要不要手写 ReAct / RLVR 是什么 | [[01]] |
| 主循环怎么写、停止条件、错误恢复、薄 vs 厚 harness | [[02]] |
| 上下文爆了怎么办、KV-cache 命中率、compaction | [[03]] |
| 工具怎么设计、function calling vs MCP、工具过载 | [[04]] |
| 任务怎么拆、plan-then-execute vs 边走边想 | [[05]] |
| 跨会话记忆、episodic/semantic/procedural、记忆 vs RAG | [[06]] |
| 稠密/稀疏/混合检索、rerank、agentic search vs 向量库 | [[07]] |
| single-agent vs multi-agent、supervisor/handoff、单写者原则 | [[08]] |
| 怎么评一个没标准答案/会循环调工具的系统、pass^k | [[09]] |
| trace/span、OTel GenAI、失败归因、监控 vs 评测 | [[10]] |
| 时延（TTFT/TPOT）、成本、路由/级联、fallback、HITL | [[11]] |
| prompt injection、lethal trifecta、沙箱/隔离防御 | [[12]] |
| Devin/Cursor/Claude Code/Operator/Deep Research 怎么做的 | [[13]] |
| 框架/向量库/协议选型、framework vs runtime vs harness | [[14]] |
| 面试题、手写原语、STAR、陷阱清单 | [[15]] |
| RLHF vs RLVR、GRPO、agentic RL、轨迹蒸馏、RLVR 扩展 vs 锐化 | [[16]] |
| MCP vs A2A、身份发现 NANDA、AP2/ACP 支付、协议级安全 | [[17]] |

---

## 10. 命名模式 ↔ 章节交叉索引

> **用途**：业界谈 agent「设计模式」时常引用三套互有重叠的命名目录。读者若带着其中某一套词汇而来（比如面试时被问「你们走 orchestrator-workers 还是 evaluator-optimizer」），可由下表反查本库对应章节。三套目录抽掉命名差异后，**共同内核都是：反思 / 工具使用 / 规划 / 多智能体编排 / 提示链**——名字不同，机制同源。

三套目录与出处：

- **🅐 Anthropic 五种 workflow 模式** —《Building Effective Agents》(2024-12) 在「workflow（预定义编排）vs agent（模型自主决策）」二分法之上给出的五个可组合 workflow，是行业最被引用的工程话语（二分法全局出处见 [[00]]）。
- **🅑 Andrew Ng 四种 agentic 模式** — The Batch / DeepLearning.AI (2024-03)：Reflection / Tool use / Planning / Multi-agent collaboration。
- **🅒 Gulli《Agentic Design Patterns》21 模式** — Antonio Gullí，Springer 2025（ISBN 978-3-032-01401-6），「每章一模式、带代码」共 21 个 agentic 设计模式（另有约 400 页免费在线草稿）；此处仅概览性提及、把基线点名的代表模式落到章节，其余分散映射至 [[02]][[05]][[08]] 等机制章节。

**模式 → 直达章节**

| 目录 | 模式 | 一句话 | 直达章节 |
|---|---|---|---|
| 🅐 Anthropic 5 | Prompt Chaining 提示链 | 任务拆成顺序子步、每步喂上一步输出 | [[02]] · [[05]] |
| 🅐 Anthropic 5 | Routing 路由 | 先分类输入、再分派到专门处理路径 | [[02]] · [[11]] |
| 🅐 Anthropic 5 | Parallelization 并行化 | sectioning / voting 多路并行再聚合 | [[08]] |
| 🅐 Anthropic 5 | Orchestrator–Workers 编排者-工人 | 中心 LLM 动态分解任务、派给 worker | [[08]] |
| 🅐 Anthropic 5 | Evaluator–Optimizer 评估者-优化者 | 生成–评判闭环迭代（GAN 式 generator-evaluator） | [[02]] · [[09]] |
| 🅑 Ng 4 | Reflection 反思 | 模型自检 / 自评 / 自改 | [[01]] |
| 🅑 Ng 4 | Tool use 工具使用 | 调外部工具 / API 扩展能力 | [[04]] |
| 🅑 Ng 4 | Planning 规划 | 先规划、再分步执行 | [[05]] |
| 🅑 Ng 4 | Multi-agent collaboration multi-agent 协作 | 多角色分工协作 | [[08]] |
| 🅒 Gulli 21 | Prompt Chaining | 顺序链式调用 | [[02]] · [[05]] |
| 🅒 Gulli 21 | Tool Use | 调外部工具 / API | [[04]] |
| 🅒 Gulli 21 | Multi-Agent | multi-agent 协作 | [[08]] |
| 🅒 Gulli 21 | Reflection | 自检自改 | [[01]] · [[05]] |
| 🅒 Gulli 21 | （其余 17 模式，概览性） | 分散映射至机制章节 | [[02]] · [[05]] · [[08]] 等 |

> **三套目录的收敛**：Anthropic 的 Orchestrator–Workers / Parallelization、Ng 的 Multi-agent、Gulli 的 Multi-Agent 是同一族（→ [[08]]）；Ng 的 Reflection 即 Anthropic Evaluator–Optimizer 的 single-agent 版、也是 Gulli 的 Reflection（→ [[01]]/[[02]]）；Ng 的 Tool use 即 Gulli 的 Tool Use（→ [[04]]）；Prompt Chaining 则在 Anthropic 与 Gulli 两套里同名（→ [[02]]/[[05]]）。**记住这四族同源模式，三套词汇即可互译。**

---

## 11. 交叉依赖地图（哪节依赖哪节）

```
            [[00]] 导论(地基/尺子)
               │
      ┌────────┼─────────────────────────────┐
      ▼        ▼                              ▼
  [[01]]推理  [[02]]Harness ◄── 工程中枢，下面六节都挂它
      │        │
      │   ┌────┼────┬────┬────┬────┐
      │   ▼    ▼    ▼    ▼    ▼    ▼
      │ [[03]][[04]][[05]][[06]][[07]]   (上下文/工具/规划/记忆/检索 = 喂养层)
      │   └────┴────┴────┴────┴──► 都是「上下文里放什么」的供给侧，由 [[03]] 总调度
      ▼
  [[08]]多智能体 ──► 复用 [[02]] 单循环当「工人」，扩成组织层
      │
  ┌───┼───────┬─────────┐
  ▼   ▼       ▼         ▼
[[09]]评估 [[10]]可观测 [[11]]生产 [[12]]安全   (横切层：裁判/黑匣子/SLO/免疫系统)
  │   │       │         │
  └───┴───────┴─────────┴──► [[13]]大厂案例(机制落地) → [[14]]技术栈(选型) → [[15]]面试(出栈)

  ── 前沿/外延层 ──────────────────────────────────────────────
  [[16]]训练与 RL ◄── 把 [[01]] 的推理、[[06]] 的记忆从「提示诱发」变为「训进权重」(护城河前移)
  [[17]]协议与经济 ◄── 把 [[04]] 的 MCP(纵向)、[[08]] 的多 agent 外延为跨 agent 协议层 + 支付层
```

- **[[02]] 是中枢**：上接推理范式，下挂上下文/工具/规划/记忆/检索五节，是 multi-agent 的运行底座。
- **[[03]] 是总调度**：04/06/07/08 都是「上下文里放什么」的供给侧，03 决定每轮把什么写回窗口。
- **[[09]] 与 [[10]] 是一体两面**：可观测产出 trace，评测在 trace 上打分（observability powers evaluation）。
- **[[16]] 是底层引擎前移**：01 推理/05 规划/06 记忆此前靠提示与 scaffolding 诱发，16 讲如何用 RL/RLVR 把这些能力训进权重——对应「护城河从 prompt→harness→上下文→轨迹数据」的最后一跳。
- **[[17]] 是 single-agent 链路的外延**：00–12 讲「一个 agent 内部怎么转」，17 讲「多个 agent/服务之间怎么互联与结算」——纵向 [[04]] MCP + 横向 A2A + 身份 + 支付，强交叉 [[08]]/[[12]]。
- **[[15]] 是出口**：把 00–14、16–17 的机制翻译成面试官能给分的信号。

---

> **维护说明**：本脉络半衰期以季度计（agent 领域月度迭代）。新里程碑入库时，先归到上面六个时代之一、标注「被哪股力逼出来」，再回填对应节的 §3。各节正文状态见根 [[README]] 的目录索引表。末次时点刷新：**2026-06-14（v2 批次 A，已并入 2026 H1 里程碑，事实源 `_事实基线-2026-06.md`）**；同日新增 §10「命名模式 ↔ 章节交叉索引」，原交叉依赖地图顺延为 §11。
