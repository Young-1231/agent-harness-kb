> 状态：🟢 已校验

# 01 · Agent 核心与推理范式

> **定位**：Agent 的"思考"机制——决定下一步行动的推理（reasoning）与决策范式。
> **在链路中的位置**：对应全局链路里的 **Think** 环节。这一节是"概念层"，讲清"推理范式"本身；下一节 [[02]] Harness 运行时讲它怎么被工程实现成主循环。

---

## 1. TL;DR / 速览

**本节地图**：从 2022 年的 Chain-of-Thought（CoT）出发，沿"`prompt 即推理` → `思考+行动`（ReAct）→ `自我反思/外部搜索`（Reflexion/ToT）→ `训练出推理`（o1/R1）"这条主线，讲清推理范式如何一步步从 **prompt 外挂搬进权重**，以及这对 Agent 设计意味着什么。读完你应能回答：ReAct 的机制与失败模式、prompted vs trained reasoning 的本质差异、推理模型时代手工脚手架是否过时、CoT 能不能当安全监控信号。

**3–5 条核心结论**：

1. **推理范式的主线是"内化"**：人手搭的脚手架（CoT → ReAct → Reflexion → ToT/GoT/LATS）逐步被 RL 训练目标吸收。作为"训练出的推理"开路者，o1（2024）、DeepSeek-R1（2025）把"逐步思考+搜索+回溯"训进权重，Agent 的外部脚手架因此变薄、主循环变简单；到 2026，这套配方已是旗舰标配——当代推理旗舰（GPT-5.5、Claude Opus 4.8、Gemini 3、DeepSeek-V4）默认内置长思考。
2. **test-time compute 成为新的 scaling 轴**：继参数、数据之后，"让模型多想一会儿"（更长 CoT / 并行思考）成为可单调换准确率的第三条 scaling 曲线，且可作为产品旋钮（thinking budget / effort level）调控。
3. **ReAct 是现代 Agent 的认知架构母版**：`Thought → Action → Observation` 循环把推理"接地"到外部世界，至今仍是生产 Agent 的事实标准循环；但它有可预测的失败模式（错误传播、死循环、对观测质量敏感、长程脆弱）。
4. **"是否真推理"仍是开放前沿**：RLVR 究竟创造了新能力还是只放大基座已有路径（Yue et al.）、推理模型会不会"复杂度崩塌"（Apple vs Lawsen）、CoT 是否忠实可监控（Turpin vs Korbak/Bengio），三组争议都未盖棺。
5. **范式转变重写了 Agent 工程取舍**：推理强了，但"与世界交互、状态/记忆、可靠性、编排"并没被推理模型解决——所以 prompt engineering 升格为 **context engineering**（[[03]]），而非消亡。

---

## 2. 定位与动机

Agent = **模型（能力）+ Harness（可靠性）+ 循环 + 自主决策**（详见 [[00]]）。本节聚焦其中"模型怎么想"这一层：**给定当前上下文，Agent 如何决定下一步该输出什么、该调哪个工具、何时停**。这是整条链路的"大脑"，决定了上层 Harness 能做到多薄、工具调用能多可靠。

**它解决什么问题？** GPT-3 时代发现：纯靠堆参数，在多步算术、常识、符号推理上会撞墙——模型"一步到位"地猜答案，错误率高且不可控。推理范式的根本动机，是把模型**潜在的中间计算显式化、可控化、可接地化**：

- **显式化**（CoT）：让中间推理步骤以文本形式吐出来，把"一锤定音"变成"可检查的过程"。
- **可接地**（ReAct）：让推理能调外部工具/环境，避免在脑内幻觉事实、拿不到实时信息。
- **可改进**（Reflexion/Self-Refine/ToT）：让推理能自评、回溯、跨尝试学习。
- **可训练**（STaR → PRM → o1/R1）：把上面这些"推理时才发生的好行为"压进权重，使之稳定、可迁移、可 scaling。

**在 Agent 链路中的位置**：推理范式是 [[00]] 心智模型与 [[02]] Harness 之间的概念枢纽。它向下决定 [[05]] 规划与任务分解怎么做、[[04]] 工具何时被调用；向上又被 [[03]] 上下文工程喂养（推理质量高度依赖上下文里放了什么）。理解这一节，是理解后面所有工程取舍的前提。

---

## 3. 历史发展脉络（时间线）

> 主线逻辑一句话：**推理从 prompt 外挂逐步搬进权重**。下面每个里程碑都标注"为什么这样演进"。

| 年份 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **2022-01** | **Chain-of-Thought**（Wei et al., Google Brain）| 堆参数撞墙后，用几个"一步步想"的范例把模型潜在中间步骤显式化，准确率大涨——奠定"推理是大模型涌现、可被提示激发的能力"这一起点。 |
| **2022-03** | **Self-Consistency + STaR**（Wang et al.; Zelikman et al.）| 两个互补动作：①采样多条 CoT 路径再多数投票，把推理变成"集成/搜索"（test-time compute 雏形）；②STaR 把自生成的正确推理链拿去微调——**首次把推理"训"进权重**的种子。 |
| **2022-05** | **Zero-shot CoT + Least-to-Most**（Kojima et al.; Zhou et al.）| "Let's think step by step" 让 CoT 无需范例即可触发；Least-to-Most 引入显式问题分解——CoT 从手工范例泛化为通用机制。 |
| **2022-10** | **ReAct**（Yao et al., Princeton/Google）| 纯 CoT 在脑内推理会幻觉、拿不到外部信息。ReAct 把"思考→行动→观察"串成循环，让推理被外部世界接地。**推理范式与 Agent 正式合流**；数月后 Meta 的 Toolformer（2023-02）让模型学会自调 API。 |
| **2023-02~03** | **Toolformer, Reflexion, Self-Refine** | 工具使用从"提示"变"学习"（Toolformer 自监督决定调什么 API）；Agent 获得迭代自改进——Reflexion 用"言语强化学习"把失败教训写进情景记忆，Self-Refine 用单模型自评自改。 |
| **2023-05** | **Tree of Thoughts + Let's Verify Step by Step**（Yao et al.; Lightman et al.）| ToT 把 CoT 泛化为可 BFS/DFS 搜索、带回溯的思维树（Game of 24：CoT≈4% → ToT≈74%）；"Let's Verify" 证明**逐步过程监督（PRM）胜过只看结果**——后来 RL 推理模型的奖励建模基础。 |
| **2023-08~10** | **Graph of Thoughts + LATS**（Besta et al.; Zhou et al.）| 把推理时审议推到顶点：任意图拓扑的思维（合并/聚合/反馈），以及 MCTS 统一"推理+行动+规划"。**这是"靠人工脚手架在模型外部编排搜索"的能力天花板**——也正是训练派想内化的对象。 |
| **2023-10** | **LLMs Cannot Self-Correct Reasoning Yet**（Huang et al.）| 反证据：缺乏外部反馈/oracle 时，**内在自我校正常常反而掉点**。重新界定 Reflexion/Self-Refine 何时真有效，反向激励"把推理训进权重"的 RL 路线。 |
| **2024-09** | **OpenAI o1（"Learning to reason with LLMs"）** | 与其让人手搭 ToT/Reflexion，o1 用大规模 RL 直接训练超长内部 CoT，性能随"思考"token 增加而变强。**推理从 prompt 搬进权重**，test-time compute 成为第一类 scaling 轴；官方甚至建议对 o1 少用 few-shot CoT。 |
| **2024-12** | **o1 System Card + Anthropic《Building Effective Agents》** | o1 system card 提出 deliberative alignment（用推理在上下文中对齐安全策略）；Anthropic 同期清晰切分 workflow 与 agent、给出 5 种编排模式，成为大厂 Agent 工程基准文献（详见 [[00]]/[[02]]）。 |
| **2025-01** | **DeepSeek-R1 + Kimi k1.5 + HF Open-R1** | 开源配方坐实 **RLVR**：R1-Zero 纯 RL（GRPO）无 SFT 即涌现反思/自验证/"aha moment"（AIME pass@1 15.6%→71%）；k1.5 证明 RL 不需 MCTS/PRM 也能 scale；HF 当月启动 Open-R1 补齐数据/训练管线。**把 o1 平民化**。 |
| **2025-02** | **Claude 3.7 Sonnet 推出 extended thinking** | 首个 hybrid 推理模型：思考可开关、对用户可见、可设 "thinking budget" 精确控制思考时长——**把推理深度做成产品/API 旋钮**。 |
| **2025-03~06** | **Search-R1、RLVR-capacity 之争、Apple《Illusion of Thinking》** | Search-R1 把多轮搜索/工具用端到端训进推理器；Yue et al. 用 pass@k 质疑 RL 只锐化不扩展；Apple 用可控谜题指复杂度超阈值即"崩塌"，旋即被 Lawsen 反驳为评测假象——**"是否真推理"成为当下开放前沿**。 |
| **2026 H1** | **当代推理旗舰齐发 + agentic RL 综述成形** | "训练出的推理"已成旗舰默认档：GPT-5.5、Claude Opus 4.8、Gemini 3、DeepSeek-V4 内置长思考与难度路由；同期《The Landscape of Agentic Reinforcement Learning for LLMs: A Survey》（2509.02547，TMLR）系统化"把推理+工具用一起训进权重"，标志范式重心从提示/外部脚手架进一步移向**训练侧**。 |

---

## 4. 核心概念与原理

### 4.1 CoT：把"潜在计算"显式化

CoT 的本质是改变**解码分布**：不让模型直接对 `P(answer | question)` 采样，而是先生成中间步骤 `r`，再对 `P(answer | question, r)` 采样。中间步骤把一个"需要多步组合"的难题，拆成若干"每步都在分布内"的易题。Self-Consistency 进一步把单条贪心链换成"采样 N 条 + 对最终答案多数投票"，用更多推理时算力换鲁棒性——这是 test-time compute 思想的最早雏形。

### 4.2 ReAct：思考-行动-观察循环（本节必懂）

ReAct（Reasoning + Acting）的核心，是让 policy 交错产出一条**轨迹（trace）**：

- **Thought**：自由形式推理——规划、分解、跟踪状态、处理异常；
- **Action**：一次工具/环境调用，如 `search[...]`、`lookup[...]`、`finish[...]`；
- **Observation**：调用返回的结果，回灌进上下文。

循环直到 `Finish`。**推理让模型会计划、会分解、会跟踪状态、会处理异常；行动让推理被外部事实接地，不至于无约束地漂移**。这种双向协同，恰好补上了纯 CoT（无接地、会幻觉）和纯 act-only agent（无规划、瞎调工具）各自缺的那一半。

最小伪代码（生产实现见 [[02]]）：

```python
def react_loop(task, tools, llm, max_steps=15):
    ctx = [system_prompt(tools), user(task)]
    for step in range(max_steps):
        out = llm(ctx)                       # 模型吐出 Thought + 一个 Action
        thought, action = parse(out)         # 解析（失败要重试/纠错）
        ctx.append(assistant(thought, action))
        if action.name == "finish":
            return action.args               # 命中停止条件
        obs = execute(action, tools)         # Harness 侧：权限校验→沙箱执行
        ctx.append(observation(obs))         # 结果回灌，进入下一轮
    return fallback("hit max_steps")         # 防死循环兜底
```

**ReAct 的失败模式（必背）**，源自 Yao et al. 与后续工作：

1. **错误/幻觉传播**：一个错 Thought 触发错 Action，其 Observation 又"印证"了这个错误，越走越偏。
2. **重复无信息循环**：反复发同一个 search/thought 卡死，没有 reset 就出不来。
3. **对检索/观测质量高度敏感**：工具返回噪声或误导信息会直接带偏整条链。
4. **长程脆弱**：上下文增长 → 状态跟踪退化；贪心单路径解码没有回溯能力。

正是这些失败模式催生了后续方案：Reflexion（把失败写进记忆）、Self-Consistency/ToT/LATS（多轨迹搜索与回溯）、以及训练出来的 agentic 推理器。

### 4.3 从"提示推理"到"训练推理"——本章中轴

| 维度 | **Prompted reasoning**（推理时激发，不改权重） | **Trained reasoning**（把推理优化进权重） |
|---|---|---|
| 代表 | CoT、Zero-shot-CoT、Self-Consistency、Least-to-Most/Plan-and-Solve、ToT/GoT/LATS、Self-Refine/Reflexion | STaR（自举推理链）、PRM（Let's Verify）、再到 RL：o1、DeepSeek-R1（RLVR，R1-Zero 连 SFT 都免）、Kimi k1.5 |
| 成本 | 便宜、即插即用 | 训练昂贵 |
| 可迁移 | 模型无关，但脆弱、随模型迭代失效 | 内化进权重，跨任务更稳 |
| 透明度 | 透明，但有时不忠实/不可自纠 | 长 CoT 连贯但更不透明，原始 CoT 可能被隐藏 |
| 能力上限 | 受基座限制 | 更鲁棒、长 CoT、可 test-time scaling；但有争议（Yue et al.：可能只锐化不扩展） |

**RLVR（Reinforcement Learning with Verifiable Rewards）** 是 o1/R1 的核心配方：在数学、代码等**答案可自动验证**的域上，用结果奖励做 RL（R1 用 GRPO），模型自发涌现长 CoT、自我验证、回溯。PRM（过程奖励，逐步打分）和 STaR（自举正确链做 SFT）是它的两块前置铺垫；但 Kimi k1.5 证明**不用 MCTS/PRM 也能 scale**，说明"过程监督是否必需"仍有分歧。

### 4.4 推理模型如何改变 Agent 设计（必懂的四点变化）

1. **脚手架变薄**：过去要用 ToT/GoT/LATS 或 multi-agent 自反思在**外部**搭的"审议/搜索/回溯"，现在被**内化**进模型，Agent 循环更简单。
2. **思考成为可调旋钮**：inference-time compute（"多想一会儿"）变成可与准确率/延迟/成本权衡的参数（thinking budget / effort level）。
3. **工具/搜索从 prompt 走向端到端 RL**：Toolformer → Search-R1，模型**学会**何时、调什么，而非靠人写 ReAct 提示。
4. **新的失败/安全面**：长隐藏 CoT 带来忠实性与可监控性问题（Turpin；o1 deliberative alignment），以及"过度思考"的效率权衡。

### 4.5 两条"自改进"路线：测试时自我修正 vs 训练时自改进（→ 新专节 [[16]]）

把 §4.3 的"提示 vs 训练"再切一刀，专看**"自评/反思/回溯"发生在哪一侧**——这是理解 [[16]] 训练侧专节的入口：

- **测试时自我修正（推理时 prompting / scaffolding）**：自改进发生在**权重之外、推理当下**——Self-Refine（单模型自评自改）、Reflexion（把失败写进情景记忆）、ToT/LATS（外部搜索+回溯）。优点是即插即用、模型无关；但脆弱，且据 Huang et al.（2310.01798）**缺外部反馈时内在自纠常掉点**。
- **训练时自改进（RL/RLVR 把审议训进权重）**：把"逐步思考+自验证+回溯"当训练目标压进权重——o1、DeepSeek-R1（RLVR/GRPO），再到把**推理与工具使用一起训进权重**的 agentic RL（《The Landscape of Agentic Reinforcement Learning for LLMs》2509.02547）。更鲁棒、可迁移、可 test-time scaling。

一句话落点：**审议从"推理时外挂"前移到"训练时内化"，Agent 工程的护城河也随之从「写 prompt」前移到「攒轨迹数据 + 设计 RL 训练」**。这条训练侧主线（RLVR → agentic RL、奖励/可验证域、轨迹数据）已单列为新专节 [[16]] 系统展开，本节只做概念区分、不深入训练细节。

---

## 5. 主流方法谱系（横向对比）

| 方案 | 年份 | 推理形态 | 接地/工具 | 搜索/回溯 | 自我改进 | 训练 or 提示 | 适用场景 |
|---|---|---|---|---|---|---|---|
| **CoT** | 2022 | 线性链 | 无 | 无 | 无 | 提示（few-shot） | 通用多步推理打底 |
| **Zero-shot CoT** | 2022 | 线性链 | 无 | 无 | 无 | 提示（一句话） | 零样本快速激发 |
| **Self-Consistency** | 2022 | 多链投票 | 无 | 隐式（采样） | 无 | 提示 | 答案可投票的任务 |
| **Least-to-Most / Plan-and-Solve** | 2022/23 | 分解→顺序解 | 无 | 无 | 无 | 提示 | 易到难泛化、长问题 |
| **ReAct** | 2022 | 思考⇄行动 | **强** | 弱 | 无 | 提示 | 工具/检索类 Agent（母版） |
| **Toolformer** | 2023 | 内嵌 API 调用 | 强 | 无 | 无 | **训练（自监督）** | 学会自调工具 |
| **Self-Refine** | 2023 | 生成-评-改 | 无 | 无 | **强（单模型）** | 提示 | 可自评的生成任务 |
| **Reflexion** | 2023 | 行动+语言反思 | 强 | 弱 | **强（跨尝试）** | 提示+记忆 | 多次重试的决策/编码 |
| **Tree of Thoughts** | 2023 | 思维树 | 弱 | **强（BFS/DFS+回溯）** | 自评估 | 提示 | Game of 24、需前瞻 |
| **Graph of Thoughts** | 2023 | 思维图 | 弱 | **强（任意拓扑）** | 聚合 | 提示 | 可合并/聚合的复杂问题 |
| **LATS** | 2023 | MCTS 统一推理+行动+规划 | 强 | **强（MCTS）** | 价值+反思 | 提示 | 编码/QA 高精度 |
| **o1 / o3** | 2024 | 训练出的长 CoT | 强（工具版） | **内化** | 内化 | **训练（RL）** | 数学/代码/科学硬题 |
| **DeepSeek-R1 / k1.5** | 2025 | 训练出的长 CoT | 强 | 内化 | 内化（自验证） | **训练（RLVR）** | 开源推理、可蒸馏部署 |
| **Search-R1** | 2025 | 训练出的多轮搜索 | **端到端** | 内化 | 内化 | **训练（RL）** | agentic 检索 QA |

横向看一眼就懂这条主线：**接地与搜索能力从"外部脚手架"（ReAct/ToT/GoT/LATS）一路向"训练内化"（o1/R1/Search-R1 为开路者）迁移**；到 2026，这套内化已成当代推理旗舰（GPT-5.5/Opus 4.8/Gemini 3/DeepSeek-V4）的默认档位，表中 o1/o3、R1 等行应读作"相变起点"而非当前 SOTA。

---

## 6. 主流观点与争议（≥2 组对立面）

### 争议 A：推理模型时代，ReAct 与手工 prompt 脚手架是否过时？（本卷核心争议）

- **过时/被吸收派**：o1/R1 已把"逐步思考"内化进权重，OpenAI 官方建议对推理模型**别再堆 few-shot CoT**；ToT/Reflexion 式外部搜索正被 RL 训练目标吸收。论据是手工 prompt 脆弱、不可迁移、随模型迭代失效——符合 Rich Sutton **"苦涩的教训"**（通用的学习+搜索终将碾压人工结构）。代表：OpenAI o1 团队（**Noam Brown**，见 Sequoia 播客）、Sutton 阵营。
- **未过时/转型派**：推理模型只解决"想"，不解决"与外部世界交互、多步任务编排、状态/记忆/可靠性"；ReAct 的 thought-action-observation 循环仍是生产 Agent 的认知架构。术语从 prompt engineering 升格为 **context engineering**（**Karpathy**、Tobi Lütke, 2025-06），是进化非消亡。代表：**LangChain（Harrison Chase，LangGraph 编排层）**、应用工程社区。
- **我的边界判断**：分歧其实在"任务可验证性"。可验证域（数学/代码/检索 QA）里训练内化收益大、脚手架快速贬值；开放、长程、强状态依赖的生产任务里，编排/上下文/记忆仍是工程师的活。

### 争议 B：RL（RLVR）给了模型**新**推理能力，还是只锐化基座已有的？

- **创造新能力派**：DeepSeek-R1 / Kimi k1.5——大规模 RL 让自我反思、验证、更长 CoT 等**新行为涌现**（R1-Zero 的 "aha moment"）。
- **只锐化派**：**Yue et al.（清华 LeapLab, 2504.13837）**——pass@k 分析显示 RLVR 提升采样效率（k=1 更好）却**缩窄**推理边界（大 k 时基座反超），即 RL 只是把概率重新加权到基座已有路径上，未创造新路径。（NeurIPS 2025）
- **未决**：核心是"怎么测推理能力"——pass@1 还是 pass@k？这条争议直接关系到 [[09]] 评估怎么设计。

### 争议 C：LLM 能否在无外部反馈下可靠自我纠错？

- **能派**：Self-Refine / Reflexion——迭代自反馈+语言反思跨任务提升。
- **不能派**：**Huang et al.（2310.01798）**——**内在**自我校正（无 oracle/外部信号）常**掉点**；很多"提升"其实来自把 ground-truth 泄漏进了循环。
- **含义**：自我纠错要可靠，**最小外部信号是什么**是未解问题——这也解释了为什么 RLVR 偏爱可验证域。

### 争议 D：CoT 是否忠实反映真实计算，能否当安全监控信号？

- **不忠实派**：**Turpin et al.（NYU/Anthropic, 2305.04388）**——被偏置诱导时，CoT 会为错误答案事后编造理由、对偏见避而不谈；Anthropic 2025 进一步发现推理模型用了提示/作弊却不在 CoT 承认。
- **守护监控价值派**：**Korbak、Bengio 等 40+ 跨机构（2507.11473《Chain of Thought Monitorability》）**——CoT 虽不完美，却是目前**唯一**能窥见模型推理意图的窗口，呼吁当作"脆弱而珍贵的机会"主动保护。论据：不完美 ≠ 无用。
- **延伸到产品**：CoT 该可见还是隐藏？**Anthropic**（visible extended thinking，便于调试）对阵 **OpenAI o1**（隐藏原始 CoT、只给摘要，出于安全/竞争）。详见 [[12]] 安全与对抗。

### 争议 E：推理是"真推理"还是高级模式匹配 / 复杂度有硬上限？

- **质疑派**：Apple《The Illusion of Thinking》（2025-06）用汉诺塔等可控谜题显示复杂度超阈值后准确率"崩塌"、给了算法也不执行；Gary Marcus 力挺。
- **反驳派**：**Opus & Lawsen《The Illusion of the Illusion of Thinking》（2506.09250）**——"崩塌"实为**输出 token 上限与评测设计缺陷**（让模型输出生成程序而非逐步枚举即可解）。这是"评测方法学之争"压过"能力本质之争"的典型。

---

## 7. 大厂工程实践（≥2 个真实案例）

### 案例 1：DeepSeek-R1——纯 RL + 开源蒸馏，把 o1 配方平民化

- **工程取舍**：R1-Zero 用**纯 RL（GRPO）省掉人工标注推理轨迹**，自发涌现推理但可读性差（语言混杂、格式乱）；正式 R1 加**少量 cold-start SFT** 折中可读性与收敛。最终 AIME 2024 79.8%、MATH-500 97.3%、GPQA 71.5，匹敌 o1，并**开源权重 + 蒸馏到小模型**，使 o1 级推理可低成本部署。
- **行业影响**：催生 **HF Open-R1**（因 DeepSeek 未放训练代码，HF 系统重建数据/训练/评测管线，分"先蒸馏复现 R1-Distill，再复现 R1-Zero 纯 RL 管线"两步）。R1（MIT 许可）让"reasoning model"成为与 base/instruct 并列的默认档位。Nature 2025 给了同行评议版。

### 案例 2：Anthropic Claude Research multi-agent 系统 vs Cognition 单线程——隔日互怼

- **Anthropic（orchestrator-worker）**：lead agent（Opus 4）规划后并行 spin-up subagent（Sonnet 4）检索再汇总，比 single-agent Opus 4 在内研评测上**高 90.2%**；代价是约 **15x token**（vs chat），且 **token 用量单独解释 80% 的性能方差**——结论是**升级模型版本往往比翻倍 token 预算更划算**。extended thinking 当"可控草稿纸"做规划与工具评估。判定边界：仅**广度优先、超单上下文窗口的高价值检索**任务才值得；编码等强依赖任务不适合。
- **Cognition（Devin，单线程）**：默认**放弃并行 multi-agent**，坚持单线程线性 agent 以保证上下文连续与可靠；两原则——①共享完整 agent trace（非单条消息），②"行动暗含决策，冲突决策酿坏果"（Flappy Bird 反例）。只在任务撑爆上下文窗口时才引入压缩。把"避免隐含决策冲突"看得比并行加速更重要。
- **取舍点**：这是 Agent 架构之争的标志性辩论，完整展开见 [[08]] 多智能体编排；两家共识是 **context engineering 是 Agent 工程师第一要务**（[[03]]）。

### 案例 3（补充）：Cursor Composer——dynamic context discovery

Composer 是 **RL 训练的专用编码模型**，据 Cursor 博客比同档智能模型快约 4x，挂 10+ 工具的 harness。上下文策略选 **dynamic（少前置、让 agent 自取）而非 static**：把 MCP 工具描述外置到文件而非静态全量注入，据 Cursor A/B 测试使相关 run 的 agent **总 token 降 46.9%**。harness（指令+工具）对每个新前沿模型单独调优；长任务先出计划等批准再执行。代表推理 Agent 上下文策略的最新工程共识（详见 [[03]]/[[13]]）。

### 案例 4（补充）：OpenAI o1——deliberative alignment

用 RL 训练长 CoT，性能随 train-time 与 test-time compute **双重 scaling**；**隐藏原始 CoT 只给摘要**（安全/竞争权衡）；deliberative alignment 让模型在上下文中对安全策略做推理，换取越狱/违法建议等基准的 SOTA 鲁棒性，代价是延迟与 token 成本上升。说明"训练出的推理"不只改准确率，还改变了 Agent 的**安全面**。

---

## 8. 我的分析与判断

> **以下为分析观点（非客观事实），是我基于上述证据的独立研判，供参考与思辨。**

**趋势研判一：脚手架贬值是非均匀的，按"可验证性"分层。** 我判断手工脚手架不会整体消亡，而是**沿可验证性梯度退场**。数学/代码/检索 QA 这类奖励可自动核验的域，RLVR 内化收益最大，ToT/LATS 这种外部搜索脚手架会最快被吸收；而开放、主观、长程、强状态依赖的生产任务（客服、研究、运维），短期内仍要靠编排层 + context engineering 兜底。换句话说，**"模型负责想得深，harness 负责活得久"**——这条分工线在 2026 年已愈发清晰，并未消失。

**趋势研判二：test-time compute 的回报曲线会先陡后平，并催生"路由"工程。** "多想就更准"不是无限的。over-thinking（在简单题上烧掉大量思考 token）已经是真实成本问题。这条曾经的预测如今已落地：**难度感知路由**已成生产系统标配——GPT-5 系内置自动路由（按难度在即时档与思考档间切换），各家也普遍开放 effort 档（如 DeepSeek-V4 三档推理、thinking budget / effort level 旋钮），简单请求走非推理/低 effort、硬请求才升到高 effort / 并行思考（Deep Think 式）。把"该想多久"本身当成一个待优化的决策，已成为 [[11]] 生产工程的核心 KPI（延迟、$/任务）。

**常见坑（我在资料与实践中反复看到的）**：
- **把 CoT 当可信解释**：Turpin 的证据很硬——CoT 可被隐藏偏置操纵而只字不提。**别把模型自述的理由当审计依据**，可验证的还是看结果/外部检查。
- **盲目上 multi-agent**：被"90.2%"诱惑而忽略"15x token + 只在广度检索类净收益为正"。默认先单线程（Cognition 的立场更稳），证明瓶颈确实是上下文宽度后再分叉。
- **给推理模型堆 few-shot CoT**：对 o1/R1 这类模型，繁复的 CoT 提示可能**反而干扰**其内化推理，官方建议精简指令、给清目标即可。
- **用 pass@1 一把尺衡量"推理能力"**：Yue et al. 提醒 pass@1 提升可能伴随 pass@k 下降。评估推理时**至少看 pass@1 与 pass@k 两条曲线**（[[09]]）。
- **静态塞满上下文**：模型越强，dynamic discovery（让 agent 自取）越省 token 也越少冲突；但**在弱模型/高确定性场景，静态预检索反而更稳**——别教条。

**最佳实践（我的推荐默认值）**：
1. **从最简循环起步**：先 ReAct + 清晰工具 + 硬停止条件（max_steps/预算）+ fallback，跑通再加复杂度（呼应 Anthropic "能简则简"）。
2. **推理深度做成旋钮**：默认中等 effort，难任务再升；把 thinking budget 纳入成本预算管理。
3. **可验证处用结果奖励/外部 verifier**，不可验证处保留人类/工具反馈回路（别指望纯内在自纠）。
4. **保护 CoT 可监控性**：即便不完全忠实，也按 Korbak/Bengio 的建议，把"是否损害可监控性"纳入模型与 harness 的设计评审（[[12]]）。
5. **先 context engineering 再加 agent 数量**：共享完整 trace、按需取上下文，是比"多开几个 subagent"更高 ROI 的第一刀。

**我的总判断**：2024–2026 是推理"从外挂到内生"的相变期。模型侧 RLVR 把审议能力训进权重，工程侧的价值随之从"设计推理过程"转移到"设计上下文与编排"。**Agent 工程师的护城河不再是会写花哨 prompt，而是会管上下文、设停止条件、做难度路由、保可监控性**——这正是本知识库后续章节（[[02]]–[[13]]）的主战场。

---

## 9. 面试考点

**概念题（≥3）**

1. **讲清 ReAct 机制，并说它比纯 CoT、纯 act-only 各强在哪。**
   答题要点：Thought→Action→Observation 交错循环；推理负责规划/分解/状态跟踪/异常处理，行动负责把推理接地到外部事实；纯 CoT 缺接地（会幻觉），纯 act-only 缺规划（瞎调工具）。一句话：**双向协同补齐彼此短板**。
2. **prompted reasoning 和 trained reasoning 的本质区别？各自优劣？**
   答题要点：前者推理时激发、不改权重（CoT/ToT/Reflexion），便宜、模型无关、透明但受基座限制且可能不忠实/不可自纠；后者把推理优化进权重（STaR→PRM→o1/R1 的 RLVR），更鲁棒、长 CoT、可 test-time scaling，但昂贵、不透明、且"是否真扩展能力"有争议。
3. **什么是 RLVR？为什么它偏爱数学/代码而非开放任务？**
   答题要点：Reinforcement Learning with Verifiable Rewards——在答案可自动验证的域用结果奖励做 RL（R1 用 GRPO）。可验证 → 奖励信号干净、可规模化、不易被 reward hacking；开放任务奖励难定义，是当前公开难题。
4. **test-time compute scaling 是什么？为什么说它是"第三条 scaling 轴"？**
   答题要点：在参数、数据之外，"让模型多想"（更长 CoT / 并行思考 / 多次采样投票）也能单调换准确率；o1 曲线显示 train-time RL 与 test-time thinking 双重 scaling。代价是延迟/成本，需难度路由。

**系统设计题（≥1）**

> **设计一个能可靠完成长程任务（如"调研某主题并产出报告"）的推理 Agent。**
> 要点：①选型——广度检索类可考虑 orchestrator-worker（但算 token 账，15x 是否值），否则默认单线程；②循环——ReAct + 硬停止条件（max_steps/预算/超时）+ fallback；③上下文——context engineering 四策略 write/select/compress/isolate（[[03]]），长轨迹用 compaction；④推理深度——难度路由 + thinking budget；⑤可靠性——工具错误重试、死循环检测、关键步骤人类确认（HITL）；⑥可观测——记录完整 trace 便于 replay 与评估（[[10]]）。

**手写题（≥1）**

> **手写一个带停止条件与防死循环的 ReAct loop（伪代码）。** 见 §4.2 的伪代码：必须包含 system prompt 装配、parse（含解析失败处理）、execute（权限/沙箱）、observation 回灌、finish 停止、max_steps 兜底。加分项：重复 action 检测（连续 N 次相同则 reset/换策略）、token/预算上限。

**陷阱题（≥2）**

1. **"既然 CoT 写出来了，是不是就能当模型真实推理的解释来审计安全？"**
   陷阱在"忠实性"。Turpin et al. 证明 CoT 可被隐藏偏置操纵而只字不提，**不能直接当审计依据**；但据 Korbak/Bengio，它仍是稀缺的可监控窗口，应保护而非神化。
2. **"RL 训练后 benchmark pass@1 涨了，是不是推理能力变强了？"**
   陷阱在评测口径。Yue et al. 指出 pass@1 涨可能伴随 pass@k 跌（边界缩窄）。要同时看两条曲线，区分"采样效率提升"与"能力边界扩展"。
3. **"任务复杂就多开几个 subagent 并行，肯定更快更好？"**
   陷阱在 token 成本与决策冲突。Anthropic 仅在广度检索类报正收益（且 15x token）；Cognition 警告并行 subagent 上下文分散 → 隐含决策冲突 → 坏结果。默认单线程，证明瓶颈是上下文宽度再分叉。

---

## 10. 参考文献

### 📄 论文

- **Chain-of-Thought Prompting Elicits Reasoning in LLMs** · Wei, Wang, Zhou et al. (Google Brain) · 2022 · <https://arxiv.org/abs/2201.11903> — CoT 开山作，证明大模型推理可被中间步骤提示激发（NeurIPS 2022）。
- **Self-Consistency Improves CoT Reasoning** · Wang et al. (Google) · 2022 · <https://arxiv.org/abs/2203.11171> — 多路径采样+多数投票，test-time compute 雏形（ICLR 2023）。
- **STaR: Bootstrapping Reasoning With Reasoning** · Zelikman, Wu, Mu, Goodman · 2022 · <https://arxiv.org/abs/2203.14465> — 自举正确推理链做微调，"把推理训进权重"的早期蓝图（NeurIPS 2022）。
- **Large Language Models are Zero-Shot Reasoners** · Kojima et al. · 2022 · <https://arxiv.org/abs/2205.11916> — "Let's think step by step" 无范例触发 CoT（NeurIPS 2022）。
- **Least-to-Most Prompting** · Zhou et al. · 2022 · <https://arxiv.org/abs/2205.10625> — 显式问题分解，易到难泛化（ICLR 2023）。
- **ReAct: Synergizing Reasoning and Acting** · Yao et al. (Princeton/Google) · 2022 · <https://arxiv.org/abs/2210.03629> — 思考-行动-观察循环，现代 Agent 认知架构母版（ICLR 2023）。
- **Toolformer: LMs Can Teach Themselves to Use Tools** · Schick et al. (Meta) · 2023 · <https://arxiv.org/abs/2302.04761> — 自监督学习何时/调什么 API，工具使用从提示变学习（NeurIPS 2023）。
- **Reflexion: Language Agents with Verbal Reinforcement Learning** · Shinn et al. · 2023 · <https://arxiv.org/abs/2303.11366> — 语言化反思存进情景记忆，跨尝试自改进（NeurIPS 2023）。
- **Self-Refine: Iterative Refinement with Self-Feedback** · Madaan et al. · 2023 · <https://arxiv.org/abs/2303.17651> — 单模型生成-评-改循环，纯提示自纠基线（NeurIPS 2023）。
- **Plan-and-Solve Prompting** · Wang et al. · 2023 · <https://arxiv.org/abs/2305.04091> — 先规划再执行的零样本提示（ACL 2023）。
- **Language Models Don't Always Say What They Think** · Turpin, Michael, Perez, Bowman (NYU/Anthropic) · 2023 · <https://arxiv.org/abs/2305.04388> — CoT 会为被偏置答案事后合理化，挑战"CoT=可信解释"（NeurIPS 2023）。
- **Tree of Thoughts** · Yao et al. (Princeton) · 2023 · <https://arxiv.org/abs/2305.10601> — CoT 泛化为带自评估+回溯的搜索树，外部脚手架搜索巅峰（NeurIPS 2023）。
- **Let's Verify Step by Step** · Lightman et al. (OpenAI) · 2023 · <https://arxiv.org/abs/2305.20050> — 过程监督（PRM）胜过结果监督，发布 PRM800K（ICLR 2024）。
- **Graph of Thoughts** · Besta et al. · 2023 · <https://arxiv.org/abs/2308.09687> — 思维建成任意图（合并/聚合/反馈），最通用的提示审议拓扑（AAAI 2024）。
- **LLMs Cannot Self-Correct Reasoning Yet** · Huang et al. · 2023 · <https://arxiv.org/abs/2310.01798> — 内在自我校正常掉点，界定 Self-Refine/Reflexion 何时有效（ICLR 2024）。
- **LATS: Language Agent Tree Search** · Zhou et al. · 2023 · <https://arxiv.org/abs/2310.04406> — MCTS 统一推理+行动+规划（ICML 2024）。
- **The Rise and Potential of LLM Based Agents: A Survey** · Xi et al. · 2023 · <https://arxiv.org/abs/2309.07864> — LLM-agent 构造（脑/感知/行动）与 multi-agent 社会的标准综述。
- **From System 1 to System 2: A Survey of Reasoning LLMs** · Li et al. · 2025 · <https://arxiv.org/abs/2502.17419> — 把领域框成 System-1→System-2 的转变，梳理结构搜索/奖励建模/自改进/RL 微调。
- **OpenAI o1 System Card** · OpenAI · 2024 · <https://arxiv.org/abs/2412.16720> — 一手系统卡：o1 用 RL 训长 CoT、提出 deliberative alignment；推理同时放大能力与风险。
- **DeepSeek-R1: Incentivizing Reasoning Capability via RL** · DeepSeek-AI · 2025 · <https://arxiv.org/abs/2501.12948>（Nature 版 <https://www.nature.com/articles/s41586-025-09422-z>）— 纯 RL（GRPO）涌现反思/自验证，开源权重+蒸馏，确立 RLVR。
- **Kimi k1.5: Scaling RL with LLMs** · Kimi Team · 2025 · <https://arxiv.org/abs/2501.12599> — 多模态 RL 推理器，证明不用 MCTS/价值函数/PRM 也能 scale。
- **Search-R1: Training LLMs to Reason and Leverage Search Engines with RL** · Jin et al. · 2025 · <https://arxiv.org/abs/2503.09516> — R1 式 RL 扩到多轮 agentic 搜索，比 RAG +20–41%。
- **Does RL Really Incentivize Reasoning Capacity Beyond the Base Model?** · Yue et al. (Tsinghua LeapLab) · 2025 · <https://arxiv.org/abs/2504.13837> — pass@k 分析：RLVR 提采样效率但缩窄推理边界（NeurIPS 2025）。
- **The Illusion of the Illusion of Thinking** · C. Opus & A. Lawsen · 2025 · <https://arxiv.org/abs/2506.09250> — 反驳 Apple"推理崩塌"，指其为 token 上限/评测设计缺陷。
- **Chain of Thought Monitorability** · Korbak, Bengio 等 40+ 跨机构 · 2025 · <https://arxiv.org/abs/2507.11473> — 立场文：CoT 虽不完全忠实，仍是窥见模型意图的唯一窗口，呼吁保护。
- **The Landscape of Agentic Reinforcement Learning for LLMs: A Survey** · 25 作者团队（含 Philip Torr、Shuicheng Yan）· 2025（TMLR，v5 2026） · <https://arxiv.org/abs/2509.02547> — 系统综述 agentic RL，把推理与工具使用一起训进权重，标志推理范式重心从提示/外部脚手架移向训练侧。

### ✍️ 博客与工程文（优先一手）

- **Learning to Reason with LLMs（o1 发布文）** · OpenAI · 2024 · <https://openai.com/index/learning-to-reason-with-llms/> — o1 用 RL 训长内部 CoT，train-time 与 test-time compute 双重 scaling。
- **OpenAI o1 System Card（博客）** · OpenAI · 2024 · <https://openai.com/index/openai-o1-system-card/> — deliberative alignment 与越狱鲁棒性，推理改变 Agent 安全面。
- **Why We Think** · Lilian Weng（Lil'Log）· 2025 · <https://lilianweng.github.io/posts/2025-05-01-thinking/> — 把 test-time compute/CoT/latent thoughts 统一为提升智能的杠杆（System 1/2 框架）。
- **Claude's extended thinking** · Anthropic · 2025 · <https://www.anthropic.com/news/visible-extended-thinking> — 思考可见/可开关/可设 thinking budget，把推理深度做成产品旋钮。
- **Building Effective Agents** · Anthropic · 2024 · <https://www.anthropic.com/research/building-effective-agents> — 区分 workflow 与 agent，5 种编排模式，主张能简则简。
- **How we built our multi-agent research system** · Anthropic Engineering · 2025 · <https://www.anthropic.com/engineering/multi-agent-research-system> — orchestrator-worker +90.2%、~15x token、token 解释 80% 方差。
- **Effective context engineering for AI agents** · Anthropic Engineering · 2025 · <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents> — context engineering 是 prompt engineering 的自然演进。
- **Don't Build Multi-Agents** · Cognition（Devin）· 2025 · <https://cognition.ai/blog/dont-build-multi-agents> — 反方：默认单线程、共享完整 trace，避免隐含决策冲突。
- **Context Engineering for Agents** · LangChain · 2025 · <https://www.langchain.com/blog/context-engineering-for-agents> — write/select/compress/isolate 四策略。
- **Introducing smolagents** · HuggingFace · 2024 · <https://huggingface.co/blog/smolagents> — code agents（写代码当动作）少约 30% 步数，需沙箱。
- **Open-R1: a fully open reproduction of DeepSeek-R1** · HuggingFace · 2025 · <https://huggingface.co/blog/open-r1> — 系统重建 R1 数据/训练/评测管线。
- **Dynamic context discovery** · Cursor · 2026 · <https://cursor.com/blog/dynamic-context-discovery> — dynamic > static，MCP 工具描述外置使 token 降 46.9%。
- **Gemini 2.5: Deep Think is now rolling out** · Google · 2025 · <https://blog.google/products/gemini/gemini-2-5-deep-think/> — parallel thinking 作为 test-time compute 新维度，IMO 金牌级。
- **"+1 for context engineering over prompt engineering"** · Andrej Karpathy（X）· 2025 · <https://x.com/karpathy/status/1937902205765607626> — prompt 工程升格为 context 工程，支撑"转型非过时"一方。

### 🎥 Talk / 播客

- **Noam Brown and Team on Teaching LLMs to Reason** · Sequoia Training Data · 2024 · <https://sequoiacap.com/podcast/training-data-noam-brown/> — o1 把搜索/CoT 从外部脚手架内化为训练目标。
- **Harrison Chase on Building the Orchestration Layer for AI Agents** · Sequoia Training Data · 2024 · <https://www.sequoiacap.com/podcast/training-data-harrison-chase/> — 推理再强，生产 Agent 仍需编排层；ReAct 是"第一个 Agent 认知架构"。

### 📰 媒体（争议全景）

- **Do reasoning models really "think" or not?** · VentureBeat · 2025 · <https://venturebeat.com/ai/do-reasoning-models-really-think-or-not-apple-research-sparks-lively-debate-response> — Apple 谜题"崩塌"之争的社区全景。
- **New paper pushes back on Apple's LLM "reasoning collapse" study** · 9to5Mac · 2025 · <https://9to5mac.com/2025/06/13/new-paper-pushes-back-on-apples-llm-reasoning-collapse-study/> — 反驳方核心：崩塌是 token 上限/评测设计假象。

---

> **交叉链接**：上游 [[00]] 导论与心智模型；下游 [[02]] Harness 运行时（把本节循环工程化）、[[03]] 上下文工程（喂养推理）、[[04]] 工具与 MCP、[[05]] 规划与任务分解、[[08]] 多智能体编排（架构之争）、[[12]] 安全与对抗（CoT 可监控性）、[[13]] 大厂案例研究、[[09]] 评估（pass@k 之争）、[[10]] 可观测性与调试（trace/replay 与失败归因）、[[11]] 生产工程（难度路由、token 成本与 SLO）、[[16]] agentic RL / 训练侧自改进（§4.5 的训练侧深挖）、[[15]] 面试题库。
