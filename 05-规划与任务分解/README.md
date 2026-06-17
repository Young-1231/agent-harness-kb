> 状态：🟢 已校验

# 05 · 规划与任务分解（Planning & Task Decomposition）

> **定位**：Agent 在「Think」之后、「Act」之前的那一层——把一个模糊的大目标，变成一串可执行、可调度、可追踪的子任务。
> 上游接 [[01]] 推理范式，下游接 [[04]] 工具调用与 [[08]] 多智能体编排，全程依赖 [[03]] 上下文工程托底。

---

## 1. TL;DR / 速览

**本节地图**：先讲规划在 Agent 链路里解决什么（§2）→ 从 CoT 到产品化 Tasks 的演进主线（§3）→ 四条分解策略 + plan-then-execute vs interleaved + TODO 工程模式 + 反思回路 + 计划遵守度的机制（§4）→ 横向谱系表（§5）→ 五组争议（§6）→ Anthropic / Cognition / Cursor / Manus 等大厂取舍（§7）→ 我的判断（§8）→ 面试考点（§9）→ 参考文献（§10）。

**核心结论（先记这 5 条）**：

1. **规划的本质是「上下文管理」而非「智能体数量」。** 长程任务失败的主因不是模型不够聪明，而是全局目标在长轨迹里 salience 衰减、被局部决策淹没（lost-in-the-middle / 目标漂移）。把计划「复诵」进近端上下文，是当前最有效的廉价解法。
2. **plan-then-execute 与 interleaved（边想边做）不是对错之争，而是「环境不确定性」的函数。** 工具可靠、边界清晰 → 一次性规划省 token、抗失败、可并行（ReWOO / LLMCompiler）；环境非平稳、初始信息不全 → 交错执行更鲁棒（ReAct / ADaPT）。
3. **「LLM 不会规划」是被过度简化的结论——成绩高度取决于测的是哪一版 Blocksworld。** 标准版上推理模型 o1-preview 已达 97.8%、GPT-4 也有 34.6%；可一旦换成语义混淆的 Mystery 版，o1-preview 跌到 52.8%、GPT-4 仅 0.16%，o1 在更难的 110 实例集也只有 23.63%（远未饱和）。即低分主要属于混淆版或前代模型，而非「LLM 根本不会规划」；脆弱性仍真实存在，由此分叉出两条路线：外包给符号规划器（LLM+P / LLM-Modulo），或用训练 + 搜索 + 反思把端到端规划「兜」到够用（Plan-and-Act / ToT）。
4. **反思（self-correction）只有挂靠可靠外部信号才有正收益。** 无外部反馈的纯内省式自纠，在推理任务上往往不升反降。
5. **2025–2026 的工业落点是把「计划」做成一等原语**：只读、状态安全、可人审的 plan mode + 结构化 Tasks（Claude Code），以及可持久化、可复用的计划工件（Cursor `.cursor/plans/`），而不再是临时 prompt 技巧。

---

## 2. 定位与动机

在 Think–Act–Observe 循环（见 [[01]]）里，「规划与任务分解」是把**单步决策**升级为**多步全局策略**的那一层。它要回答三个问题：

- **要不要先想清楚整盘棋？**（plan-then-execute vs 反应式 interleaved）
- **大目标怎么切成可执行的小块？**（任务分解的策略与粒度）
- **执行漂移了怎么办？**（计划遵守度、重规划、反思纠错）

**它解决的工程痛点**：

1. **短视贪心（myopia）**：纯 ReAct 式逐步决策容易走一步看一步，在长程依赖任务上「一步错、满盘皆输」。
2. **上下文爆炸与目标漂移**：随着轨迹变长，Token 窗口被工具输出填满，最初的用户目标被挤到上下文中段而「失焦」（lost-in-the-middle，见 [[03]]）。
3. **不可调度**：没有显式计划，就无法做并行函数调用、子任务委派、进度追踪与人审检查点。
4. **不可观测**：人类（和上层 orchestrator）需要一个能看、能改、能审计的「计划工件」来介入。

**在链路中的位置**：规划层吃 [[01]] 产出的推理，吐出结构化子任务，交给 [[04]] 工具层执行；当子任务需要并行或专家化时，升级为 [[08]] 多智能体编排；计划本身的存活与复诵依赖 [[03]] 上下文工程与 [[06]] 记忆系统；plan mode 的「只读安全」属性归 [[12]] 安全节管。

---

## 3. 历史发展脉络

> 主线：**CoT（隐式线性推理）→ 显式 plan-then-execute / 神经符号外包 → 分解框架 → 自适应按需分解 → 产品化一等原语**。

| 年份 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **2022-01** | **Chain-of-Thought（Wei et al., Google）** | 把中间推理步骤显式写出即可解锁多步推理，证明「让模型先想再答」有效。但 CoT 是线性、隐式的，并未分离 plan 与 execute——埋下主线问题：能 step-by-step 思考，能否先 plan 再 act？ |
| **2022-05** | **Least-to-Most Prompting（Zhou et al.）** | 第一个把复杂问题显式拆成「由易到难」的子问题序列再逐个求解，把「分解」确立为独立能力（SCAN 16%→99%）。 |
| **2022-10** | **ReAct（Yao et al.）+ Decomposed Prompting（Khot et al.）** | ReAct 确立 Reason→Act→Observe 交错范式，成为「反应式/即时规划」一极；DecomP 提出可委派给子模型库的模块化分解，支持递归再分解。 |
| **2023-02** | **《On the Planning Abilities of LLMs》批判（Valmeekam & Kambhampati, ASU）** | 标准 Blocksworld 上 GPT-4 仅 34.6%、语义混淆的 Mystery 版更跌到 0.16%。这记「冷水」直接催生两条路线：要么显式结构化、要么外包给符号规划器。（2024 年以推理模型 o1-preview 复测：标准 97.8%、Mystery 52.8%、更难 110 实例集仅 23.63%，未饱和——详见 §6 争议三） |
| **2023-03** | **AutoGPT / BabyAGI（社区）** | 首批产品化自主体：维护显式任务清单、自动拆子任务并循环重排优先级，把「任务分解 + TODO」带进大众开发者视野——但空转、目标漂移也促使社区追求更可控的结构。 |
| **2023-03** | **HuggingGPT / JARVIS（微软亚研 × 浙大）** | 四阶段（任务规划→选模型→执行→汇总）先把请求解析成带依赖的任务列表，是「decomposition-first 先分解后执行」的范式样板。 |
| **2023-04** | **LLM+P（Liu, Stone et al., UT Austin）** | 对「LLM 不会可靠规划」的直接回应：不让 LLM 亲自规划，而是把 NL 翻成 PDDL 交经典规划器求最优解再翻回来。开创「LLM 当翻译器、符号求解器保证可靠性」的外包路线。 |
| **2023-05** | **Plan-and-Solve（Wang et al., ACL 2023）+ ReWOO（Xu et al.）+ Tree of Thoughts（Yao et al.）** | PS 把零样本 CoT 升级为显式「先规划分解→再执行」；ReWOO 把推理与观测解耦、一次性出全计划，token 降约 5x 且抗工具失败；ToT 把线性规划扩成带回溯的树搜索（Game of 24：4%→74%）。 |
| **2023-11** | **ADaPT（Prasad et al., UNC/AI2）** | 自适应分解：**仅在执行器 LLM 做不动时才递归拆解**，让粒度同时匹配任务复杂度与模型能力，回应「静态计划僵化」。 |
| **2023-12** | **LLMCompiler（Kim et al., UC Berkeley）** | 把计划编译成函数调用 DAG 并行调度，较 ReAct 提速最高 3.7x、省成本 6.7x——体现「计划即可被编排优化」。 |
| **2024-02** | **《Understanding the Planning of LLM Agents: A Survey》（Huang et al.）** | 首个系统综述，把规划归纳为**任务分解 / 计划选择 / 外部模块 / 反思 / 记忆**五类，给本领域提供权威坐标。 |
| **2024-05** | **LLM-Modulo（Kambhampati et al., ICML 2024）** | 争议的综合解：「LLM 不能独立规划，但能在 LLM-Modulo 框架里辅助规划」——generate-test-critique 循环，LLM 出方案、可靠外部 critic（如 VAL 验 PDDL）把关。 |
| **2024-12** | **Anthropic《Building Effective Agents》** | 官方定调，区分「静态工作流分解」与「模型自主规划」5 种模式（prompt chaining / orchestrator-workers 等），提出 start simple、按需升级的取舍基线。 |
| **2025-03** | **Plan-and-Act（Erdogan et al., ICML 2025）** | 显式分离 Planner 与 Executor，用合成数据训练规划器，WebArena-Lite 取 57.58% SOTA，代表 plan-then-execute 的工程化成熟。 |
| **2025-06** | **「规划分解之争」集中爆发** | Anthropic《multi-agent 研究系统》vs Cognition《Don't Build Multi-Agents》vs LangChain《How and when to build multi-agent systems》同月发布——围绕「拆给并行 subagent 是否可靠」形成一手论战，核心是 context engineering。 |
| **2025–2026** | **产品化一等原语** | Cursor 1.2 Agent To-dos（2025-07）→ Claude Code plan mode + TodoWrite 升级为带依赖/阻塞的结构化 Tasks（TaskCreate/TaskUpdate/TaskGet/TaskList，2026）→ Cursor 3.2 `/multitask` 异步 subagent（2026-04）。规划从临时清单演进为可人审、状态安全的一等 UX 原语（Cursor 的计划工件还可跨会话持久化复用）。 |
| **2026-04** | **《Evaluating Plan Compliance in Autonomous Programming Agents》** | 对 SWE-agent 16,991 条轨迹做首个大规模「计划遵守度」分析：长轨迹中初始计划因 salience 下降被执行漂移，且**周期性提醒可缓解违背**——直击「计划易被执行漂移」的痛点。 |

---

## 4. 核心概念与原理

### 4.1 四条分解策略主线

| 策略 | 代表 | 机制一句话 | 适用边界 |
|---|---|---|---|
| **序列分解** | Least-to-Most | 把问题排成由易到难的子问题链，后一步可用前一步答案 | 子问题间有清晰的难度/依赖序，组合泛化任务 |
| **模块化/可委派分解** | Decomposed Prompting、HuggingGPT | 把子任务委派给专用子提示/子模型（可递归、可替换） | 工具/专家异构、需要调度编排 |
| **递归按需分解** | ADaPT | **只在执行失败时**才把子任务进一步拆开 | 任务难度不均、模型能力不确定，怕过度/不足分解 |
| **自组装推理结构** | Self-Discover | 让模型从原子推理模块自拼出任务专属的规划结构再执行 | 同类任务批量、想省推理算力（10–40x） |

> 选型直觉：**预先知道步骤** → 序列/模块化分解；**不知道会不会卡** → 按需递归分解；**同类任务反复跑** → 自组装结构复用。

### 4.2 plan-then-execute vs interleaved

这是本节最核心的取舍轴。两种循环的伪代码对照：

```python
# A. Interleaved（ReAct 式）：边想边做，每步都可重规划
state = init(task)
while not done(state):
    thought = llm.reason(state)        # 基于最新观测推理
    action  = llm.act(thought, state)  # 立刻决定下一个动作
    obs     = env.execute(action)      # 拿到真实反馈
    state   = update(state, thought, action, obs)
# 优点：观测驱动、即时纠错、抗环境非平稳
# 缺点：贪心短视、长程依赖弱、每步都吃一次 LLM 调用

# B. Plan-then-execute（ReWOO/Plan-and-Solve 式）：一次性出全计划再执行
plan = llm.plan(task)                  # 一次推理产出完整蓝图（带占位符 #E1,#E2…）
results = {}
for step in plan:                      # 计划与观测解耦，可并行
    args = bind(step.args, results)    # 用前序结果填占位
    results[step.id] = tools[step.tool](args)
answer = llm.solve(task, plan, results)# 最后一次性汇总
# 优点：省 token（ReWOO 约 5x）、抗单点工具失败、可编译成 DAG 并行（LLMCompiler）
# 缺点：静态计划遇意外反馈即失效，开放环境不鲁棒
```

**ADaPT 是两派之间的折中桥**——它默认让 executor 直接做（interleaved 的乐观），失败才递归 `plan()` 拆细（plan-then-execute 的兜底）：

```python
def adapt(task, depth):
    ok = executor.try(task)            # 先乐观执行
    if ok or depth > MAX: return ok
    subtasks, logic = planner.decompose(task)  # 做不动才拆
    return combine(logic, [adapt(s, depth+1) for s in subtasks])
```

**LLMCompiler 则证明「计划可被当作程序优化」**：Planner 产出函数调用 DAG，Task-Fetching Unit 解析依赖并把无依赖的节点并行派发，Executor 并发执行——把「规划」从一串文本变成可调度的执行图（详见 [[04]] 并行工具调用）。

### 4.3 TODO / plan 工程模式：把计划复诵进近端上下文

生产 Agent 的关键发现（Manus、Claude Code）：**持续重写的 TODO/计划文件，本质是一种对抗 lost-in-the-middle 的注意力操纵手段**。把全局目标反复写到上下文末尾（近端、高 salience），模型每一步决策都能「看见」原始目标，缓解目标漂移。

代价：Manus 实测约 **1/3 的动作**耗在更新清单本身。所以工程上要权衡「复诵频率 × token 成本」，Manus 后来转向独立 planner→executor subagent 架构。Claude Code 把它做成产品原语：`TodoWrite` 的 `pending/in_progress/completed` 三态机，2026 升级为 `TaskCreate/TaskUpdate/TaskGet/TaskList` 四件套、支持依赖与阻塞（`addBlocks`/`addBlockedBy`）的结构化 Tasks（按官方文档为会话内作用域，不跨会话持久化）。

### 4.4 反思纠错回路（reflection）与它的边界

Reflexion / Self-Refine / DEPS 用「语言化反馈 + 迭代精炼」改进决策（不更新权重）：生成→自评/环境反馈→反思写入记忆→重试。**但有效性有硬边界**：Huang et al.《LLMs Cannot Self-Correct Reasoning Yet》证明，**无外部反馈时**的纯内省式自纠在推理任务上往往不升反降。结论：反思必须挂靠可靠验证信号（单测、执行结果、检索证据、符号 critic），否则是负收益（详见 §6 争议二）。

### 4.5 计划遵守度（plan adherence）：一个被低估的新问题

有了好计划不等于会照做。2026 年对 SWE-agent 16,991 条轨迹的分析发现：**长轨迹中初始计划的 salience 下降、局部决策主导，导致执行漂移**；而**周期性插入计划提醒**能显著缓解违背、提升成功率；反直觉的是，**一个糟糕的计划比没有计划更伤性能**，过早塞入与模型内部解题策略不一致的额外阶段也会拖累表现。这正是 smolagents `planning_interval`（每 N 步插一个不调工具的「重规划步」）的工程动机（把「计划遵守度」做成一类可量化的评估指标，详见 [[09]]）。

---

## 5. 主流方法谱系

| 方案 | 规划时机 | 分解方式 | 交错? | 可靠性来源 | Token 效率 | 最适场景 |
|---|---|---|---|---|---|---|
| **CoT** | 隐式 | 线性思维链 | — | 模型本身 | 高 | 单轮多步推理 |
| **Least-to-Most** | 静态前置 | 由易到难序列 | 否 | 提示结构 | 中 | 组合泛化 |
| **ReAct** | 动态/即时 | 不显式 | 是 | 环境观测 | 低（每步调用） | 非平稳交互环境 |
| **HuggingGPT** | 静态前置 | 模块化任务图 | 否 | 工具/专家模型 | 中 | 多模态工具编排 |
| **Plan-and-Solve** | 静态前置 | 计划列表 | 否 | 提示结构 | 高 | 零样本数理推理 |
| **ReWOO** | 静态前置 | 蓝图 + 占位符 | 否（解耦观测） | 计划一致性 | **很高（约5x）** | 工具链清晰、怕工具失败 |
| **Tree of Thoughts** | 搜索式 | 思维树 + 回溯 | 否（前瞻） | 自评估 + 搜索 | 低（多分支） | 需探索/试错 |
| **ADaPT** | 自适应 | 失败时递归拆 | 半交错 | 失败信号 | 中 | 难度不均的长程任务 |
| **LLMCompiler** | 静态前置 | 函数调用 DAG | 否（并行） | 依赖图 + 并发 | 高（3.7x 提速） | 可并行的多工具调用 |
| **LLM+P** | 外包 | NL→PDDL | 否 | **经典规划器（最优性保证）** | 中 | 可形式化的封闭域 |
| **Self-Discover** | 静态前置 | 自组装推理结构 | 否 | 结构复用 | 高（推理算力降10–40x） | 同类任务批量 |
| **Plan-and-Act** | 静态前置（可重规划） | Planner/Executor 分离 | 半交错 | 训练 + 合成数据 | 中 | 长程 Web/GUI 任务 |

---

## 6. 主流观点与争议

### 争议一：plan-then-execute vs interleaved（先规划 vs 边做边想）

- **A 方（先整体规划）**：ReWOO（Binfeng Xu）、Plan-and-Solve（Lei Wang）、Plan-and-Act（Erdogan）、LangChain plan-and-execute、Cognition「前置 scoping」。论据：一次性出全计划省 token（ReWOO 约 5x）、抗工具失败、便于并行编排（LLMCompiler 的 DAG）、长程更稳。
- **B 方（交错执行）**：ReAct（Shunyu Yao）、ADaPT（Prasad/Khot）、smolagents `planning_interval`（Hugging Face）。论据：真实环境非平稳，初始信息不全，静态全计划遇意外反馈即崩；交错可即时纠错、把决策锚定在观测上。
- **折中**：ADaPT「按需分解」、smolagents「周期性重规划」被视为桥梁——默认乐观执行，卡住或定期才重规划。

### 争议二：反思/自纠真有效，还是经常帮倒忙？

- **有效派**：Reflexion（Shinn）、Self-Refine（Madaan）、DEPS（Zihao Wang）——语言化反思 + 迭代能跨试错持续提升，**尤其有外部/环境反馈时**。
- **质疑派**：Huang & Denny Zhou《Cannot Self-Correct Yet》——无外部反馈的内省式自纠在推理上往往不升反降。
- **裁决**：分歧的真正变量是「**有没有可靠的外部验证信号**」。有信号（单测/执行/检索）→ 反思有效；纯内省 → 风险大于收益。

### 争议三：LLM 该自己规划，还是外包给符号规划器？

- **怀疑/外包派**：Kambhampati & Valmeekam（ASU）——标准 Blocksworld 推理模型可达 97.8%，但语义混淆的 Mystery 版骤降（GPT-4 0.16%、o1-preview 52.8%）、更难的 110 实例集 o1 仅 23.63%（未饱和），据此论证 LLM 是近似检索器、自我验证不可靠，应交 PDDL + 经典规划器（LLM+P）或外部 critic（LLM-Modulo）。
- **乐观/内生派**：Plan-and-Act（Erdogan）、Self-Discover（Pei Zhou）、ToT（Yao）、AutoGPT/BabyAGI 阵营——靠训练、树搜索回溯、自组装结构，LLM 在真实长程任务可达 SOTA，无需封闭域符号求解器；规划能力随规模涌现，对许多真实任务「够用」。
- **综合解**：LLM-Modulo 的 generate-test-critique——LLM 出方案、可靠外部 critic 把关，混合架构而非纯端到端。

### 争议四：复杂任务该拆给并行 subagent，还是单线程线性智能体？

- **拆分并行派**：Anthropic multi-agent 研究系统（orchestrator/lead + subagent，读多/广度任务 +90.2%）、LangChain（Harrison Chase）。论据：读多、广度优先、可并行探索的任务提速明显。
- **不要拆派**：Cognition《Don't Build Multi-Agents》——并行 subagent 上下文割裂、「行动隐含决策」冲突难合并（Flappy Bird 两 subagent 风格打架的例子）；应单线程连续上下文，必要时才压缩历史。
- **共识地带**：写类/需合并的任务交单一主智能体；**可靠性的核心是 context engineering，不是智能体数量**；multi-agent 代价约 15x token，只对高价值可并行任务划算。

### 争议五：计划是「持久化可编辑工件」还是「临时上下文产物」？且要不要人审？

- **工件化 + 人审**：Cursor Plan Mode（计划是可编辑 Markdown，存 `.cursor/plans/`、可跨会话持久化复用）、Claude Code 的 plan mode 人审检查点 + 会话内作用域的结构化 Tasks。论据：先让人改边界再执行，降低跑偏成本。
- **临时化 + 自动化**：Anthropic lead agent 把 plan 写进 memory 主要为防上下文超限、随任务消解；Devin 把规划当作可优化的延迟点（官方 2025 复盘：问题求解提速约 4x、资源效率约 2x、PR 合并率 34%→67%），把人审视为延迟成本。论据：规划本身是可优化的延迟/准确率权衡点，应尽快动手。

---

## 7. 大厂工程实践

### 案例 A：Anthropic — multi-agent 研究系统（orchestrator-workers）

Lead/orchestrator agent 先用 extended thinking 规划策略、**把计划写进外部 memory**（防上下文超限），再按复杂度决定 subagent 数量（简单查询 1 个 / 3–10 次工具调用，复杂可 10+）。**关键契约**：每个子任务必须给「目标、输出格式、工具与来源指引、清晰边界」，否则 subagent 重复劳动或留空。
**工程取舍**：表现 +90.2% 的代价是约 **15x** 于普通对话的 token，只对高价值、可并行任务划算；写类合成刻意保留单线程。这与官方《Building Effective Agents》的「start simple、按需升级」一脉相承（详见 [[08]]）。

### 案例 B：Cognition（Devin）— 单线程 + 前置 scoping + RL 压缩规划

Cognition 是「不要 multi-agent」的旗手：用一个会把孤立子任务委派给**自己**（独立 sandbox）的单线程智能体，靠共享完整 trace（而非单条消息）保证决策一致性。
**工程取舍**：会话开始先分析任务、搜代码库、产出初步计划供人审改，再自主执行；官方 2025 复盘的量化进步是**问题求解提速约 4x、资源效率约 2x、PR 合并率从 34% 升到 67%**。明确弱点是「中途反复加需求会变差」——把「一次性把边界定清 + 可验证产出」当作产品契约。

### 案例 C：Anthropic Claude Code — plan mode + Tasks 的安全/上下文定位

走 explore→plan→code→commit 四阶段：Shift+Tab 进入**只读** plan mode 先产计划、设人审批检查点，通过后再用结构化 Tasks（带依赖/阻塞，会话内作用域）执行。
**两个一手工程信号**：①《Claude Code auto mode》把 plan mode 与 todo 划入「**不能修改状态**」的安全工具白名单，自动放行、无需分类器审查（auto mode 整体只挡约 0.4% 良性命令、漏放约 17% 过激动作，所以 plan mode 的只读属性是 defense-in-depth 的一环，详见 [[12]]）；②一切围绕上下文管理——「窗口填满即降智」，TODO 既是分解也是上下文锚点（详见 [[03]]）。

### 案例 D：Manus — 从 todo.md 复诵到 planner/executor 分离

一手复盘：持续重写 `todo.md` 把全局计划复诵进近端注意力，对抗 lost-in-the-middle 与目标漂移；但实测约 1/3 动作耗在更新清单，遂转向独立 planner→executor subagent 架构。是「规划产品化真实权衡」的活教材。

### 案例 E：Cursor — 可视可编辑 To-dos + `/multitask` 折中回摆

Cursor 1.2 把长任务自动拆成带依赖的 To-dos，聊天中持续可见、随进度更新、可推 Slack；Plan Mode 的计划是可编辑 Markdown、存 `.cursor/plans/` 复用、可把选定 to-dos 派给新 agent。3.2（2026-04）推出 `/multitask`：在「单线程更可靠」共识下，仍把**可并行**的子任务交异步 subagent 编队——代表工程上的折中回摆。

> 横向对比：Anthropic/Cursor 倾向「拆 + 人审 + 工件化」，Cognition 倾向「单线程 + 前置定清 + RL 压缩」。差异根源是任务画像——读多/广度 vs 写多/需合并。（这些厂商在编码/研究/Web 等场景的完整规划案例横评见 [[13]]）

---

## 8. 我的分析与判断

> **以下为分析观点（非事实陈述），可证伪、欢迎打脸。**

**判断一：规划之争的「正确答案」正在从『选范式』收敛到『选控制器』。** plan-then-execute vs interleaved 吵了三年，真正的工程结论不是某一方胜出，而是**需要一个元控制器，按「环境不确定性 × 工具可靠性 × 任务长度」动态选择**何时一次性规划、何时交错、何时重规划。ADaPT 的「失败才拆」、smolagents 的 `planning_interval` 都是这个控制器的雏形，但它们用的是固定启发式（失败信号 / 固定间隔）。下一步会是**模型自决重规划时机**——把「现在该不该重新规划」也变成一个可学习的决策。今天还没有公认判据，这是本节最值钱的开放问题。

**判断二：Kambhampati 学派「LLM 不会规划」的结论，正在被「LLM 不会从零规划，但很会改计划」悄悄绕过。** 那 0.16%–23.63% 的低分（Mystery 版 GPT-4 仅 0.16%、o1 在 110 难例集 23.63%）是「让 LLM 在封闭域、且多在语义混淆/超难实例上从空白生成可执行最优计划」的成绩；而真实产品里 LLM 干的是**在人/工具/检索给的脚手架上做增量规划与修补**——这恰好是它的强项。所以我认为符号外包（LLM+P）会留在「可形式化的封闭域」（机器人、调度、形式验证），而开放域的主战场属于「LLM 出方案 + 廉价可验证 critic（单测/类型检查/执行结果）」的 LLM-Modulo 变体。**关键不是要不要 critic，而是在没有 PDDL 的开放任务里，怎么造出等价于 VAL 的廉价可靠 critic**——目前最现实的答案是「可执行环境本身」（编译器、测试、沙箱）。

**判断三：TODO/Tasks 的真正价值一半是给模型的、一半是给人的，别混为一谈。** 把计划复诵进上下文对模型有因果增益（对抗 salience 衰减，2026 plan-compliance 论文给了证据）；但持久化、依赖、跨会话、可推 Slack 这些，**主要服务于人类可观测性与可控性**，对模型最终成功率的边际增益递减。工程上别为了「看起来很 agentic」而过度工程化清单——Manus 的 1/3 动作浪费就是警告。**复诵要短、要近端、要高频；治理要外置、异步、按需。**

**常见坑（踩过的人才懂）**：
1. **过度规划/overthinking**：上来就把任务拆成 20 步细计划，结果环境一变全废，还白烧 token。对策：分解粒度匹配难度，按需递归。
2. **计划漂移不自知**：长轨迹里执行早就偏离初始计划，但没人提醒。对策：周期性复诵计划 + 在关键检查点对照核验。
3. **无信号反思**：让模型「再想想对不对」却没有外部验证——大概率把对的改错。对策：反思必须挂可执行/可检索信号。
4. **过早 multi-agent 化**：为不需要并行的任务上 orchestrator，换来 15x token 和上下文割裂。对策：先 single-agent + TODO，证明不够再拆。
5. **糟糕计划比没计划更糟**（2026 实证）：别为了「有计划」而塞一个与模型解题习惯冲突的烂计划。

**最佳实践清单**：① 默认从「single-agent + 显式 TODO + explore→plan→code→commit」起步；② 工具可靠且边界清晰 → plan-then-execute + DAG 并行；环境非平稳 → 交错 + 按需重规划；③ 子任务下发必须带「目标/输出格式/工具/边界」四要素契约；④ 反思一律挂外部验证信号；⑤ 高风险任务用只读 plan mode + 人审检查点门控；⑥ 计划默认临时驻留上下文，只有真正需要跨会话/团队协作才工件化持久化。

---

## 9. 面试考点

**概念题**

1. **plan-then-execute 与 interleaved（ReAct）的本质区别与各自适用场景？** 要点：前者一次性出全计划、推理与观测解耦（ReWOO/Plan-and-Solve），省 token、抗工具失败、可并行编排，适合工具可靠 + 边界清晰；后者边观测边决策（ReAct），抗环境非平稳、即时纠错，但贪心短视、每步一次调用。判别变量＝环境不确定性 × 工具可靠性 × 任务长度。

2. **任务分解的四条主线及适用边界？** 序列（Least-to-Most）/ 模块化可委派（DecomP、HuggingGPT）/ 递归按需（ADaPT）/ 自组装结构（Self-Discover）。会说每条的代表与「什么时候用哪个」即合格。

3. **反思/自纠在什么条件下有正收益？** 要点：必须有可靠外部反馈（单测、执行结果、检索证据、符号 critic）；无外部信号的纯内省式自纠在推理任务上往往不升反降（Huang《Cannot Self-Correct Yet》）。

4. **为什么说『规划的核心是上下文工程而非智能体数量』？** 长轨迹里全局目标 salience 衰减、被局部决策淹没（lost-in-the-middle）；复诵计划进近端上下文是廉价解；multi-agent 反而割裂上下文、放大 context engineering 难度（Cognition）。

**系统设计题**

5. **设计一个能处理长程编码任务（如修复跨多文件的 bug）的规划子系统。** 期望覆盖：①入口 explore（搜代码库、画依赖）；② 只读 plan mode 产出可审计划 + 人审检查点；③ 把计划落成带依赖的 Tasks（DAG）；④ 读类子任务可并行下发（带目标/格式/工具/边界四要素契约），写类合并交单一主智能体；⑤ 周期性复诵计划对抗漂移 + 执行结果作为反思验证信号；⑥ 上下文预算管理（窗口填满即降智）；⑦ 失败时 ADaPT 式按需递归拆解。加分：讨论 plan-then-execute vs 交错的动态切换判据、token/延迟取舍。

**手写题**

6. **写出 ADaPT 风格「按需递归分解」的伪代码，并说明停止条件。** 见 §4.2：先乐观执行 executor.try()，成功或超深度即返回；失败才 planner.decompose() 拆子任务，对每个子任务递归，再按 logic（and/or）组合。停止条件：执行成功、达到最大递归深度、或不可再分。考点是「分解时机 = 失败信号」而非预先全拆。

**陷阱题**

7. **「multi-agent 并行一定比 single-agent 快又好」对吗？** 错。并行 subagent 上下文割裂、「行动隐含决策」冲突难合并，写类任务结果难统一；代价约 15x token，只有读多/广度优先/高价值任务才划算（Anthropic +90.2% vs Cognition「Don't Build Multi-Agents」）。

8. **「计划越详细越好」对吗？** 错。过度规划导致僵化与 analysis-paralysis；2026 plan-compliance 实证表明**糟糕的计划比没计划更伤性能**，过早塞入与模型解题策略不一致的阶段会拖累表现。应按需分解、粒度匹配难度。

9. **「让 LLM 自我反思就能纠错」对吗？** 不一定。无外部验证信号时内省式自纠常常不升反降；反思的收益高度依赖可靠外部反馈。

---

## 10. 参考文献

### 📄 论文

- Wei et al. (2022) *Chain-of-Thought Prompting Elicits Reasoning in LLMs* — https://arxiv.org/abs/2201.11903 ｜ 显式中间推理步骤激发多步推理，本节脉络起点（但仍是线性隐式，未分离 plan/execute）。
- Zhou et al. (2022) *Least-to-Most Prompting* — https://arxiv.org/abs/2205.10625 ｜ 首个把复杂问题显式拆成由易到难子问题序列，确立「分解」为独立能力（SCAN 16%→99%）。
- Khot et al. (2022) *Decomposed Prompting* — https://arxiv.org/abs/2210.02406 ｜ 模块化分解：子任务委派给专用子提示/子模型库，支持递归再分解与替换。
- Yao et al. (2022) *ReAct: Synergizing Reasoning and Acting* — https://arxiv.org/abs/2210.03629 ｜ Reason-Act-Observe 交错范式，「反应式/即时规划」基线，plan-then-execute 的主要对照。
- Wang et al. (2023) *DEPS: Describe, Explain, Plan and Select* — https://arxiv.org/abs/2302.01560 ｜ 开放世界交互式规划：失败时自解释纠错 + 可训练目标选择器，带反思的规划。
- Valmeekam & Kambhampati et al. (2023) *On the Planning Abilities of LLMs* — https://arxiv.org/abs/2302.06706 ｜ Blocksworld 实测：标准版 GPT-4 34.6%、语义混淆 Mystery 版骤降至 0.16%，怀疑派实证基石（低分主要在混淆版而非标准版）。
- Valmeekam & Kambhampati et al. (2024) *Blocksworld 复测（推理模型 o1-preview）* — https://arxiv.org/abs/2409.13373 ｜ 标准 Blocksworld 97.8%、语义混淆 Mystery 52.8%、更难 110 实例集仅 23.63%（未饱和），把「LLM 不会规划」修正为「会，但对混淆/超难实例仍脆」，是 §6 争议三的更新证据。
- Shinn et al. (2023) *Reflexion: Verbal Reinforcement Learning* — https://arxiv.org/abs/2303.11366 ｜ 语言化反馈存入情节记忆、跨试错改进，反思纠错回路代表作。
- Shen et al. (2023) *HuggingGPT / JARVIS* — https://arxiv.org/abs/2303.17580 ｜ LLM 作控制器：任务规划→选模型→执行→汇总，decomposition-first 产品化样板。
- Madaan et al. (2023) *Self-Refine: Iterative Refinement with Self-Feedback* — https://arxiv.org/abs/2303.17651 ｜ 单 LLM 兼任生成/批评/精炼，自反馈迭代，7 类任务平均约 +20%。
- Liu, Stone et al. (2023) *LLM+P* — https://arxiv.org/abs/2304.11477 ｜ NL→PDDL→经典规划器→NL，神经符号外包路线开创者。
- Wang et al. (2023) *Plan-and-Solve Prompting* (ACL 2023) — https://arxiv.org/abs/2305.04091 ｜ 零样本「先规划分解→再执行」，把隐式 CoT 升级为显式 plan-then-execute。
- Yao et al. (2023) *Tree of Thoughts* — https://arxiv.org/abs/2305.10601 ｜ 带自评估与回溯的思维树搜索（Game of 24：4%→74%），带前瞻的规划。
- Xu et al. (2023) *ReWOO: Decoupling Reasoning from Observations* — https://arxiv.org/abs/2305.18323 ｜ 一次性出全计划再批量执行，token 约降 5x 且抗工具失败，plan-then-execute 标志作。
- Huang et al. (2023) *LLMs Cannot Self-Correct Reasoning Yet* — https://arxiv.org/abs/2310.01798 ｜ 无外部反馈的内省式自纠常不升反降，反思有效性的边界证据。
- Prasad et al. (2023) *ADaPT: As-Needed Decomposition and Planning* — https://arxiv.org/abs/2311.05772 ｜ 仅在执行失败时递归分解，粒度自适应难度（ALFWorld/WebShop/TextCraft 最高 +28/+27/+33%）。
- Kim et al. (2023) *An LLM Compiler for Parallel Function Calling* — https://arxiv.org/abs/2312.04511 ｜ 计划编译成函数调用 DAG 并行调度，较 ReAct 提速 3.7x、省成本 6.7x。
- Huang et al. (2024) *Understanding the Planning of LLM Agents: A Survey* — https://arxiv.org/abs/2402.02716 ｜ 五类法（分解/选择/外部模块/反思/记忆），领域选型坐标。
- Zhou et al. (2024) *Self-Discover: LLMs Self-Compose Reasoning Structures* — https://arxiv.org/abs/2402.03620 ｜ 从原子模块自组装任务专属规划结构，较 CoT 最高 +32%、推理算力降 10–40x。
- Kambhampati et al. (2024) *LLMs Can't Plan, But Can Help Planning in LLM-Modulo Frameworks* (ICML 2024) — https://arxiv.org/abs/2402.01817 ｜ generate-test-critique 混合架构，争议的综合解。
- Erdogan et al. (2025) *Plan-and-Act* (ICML 2025) — https://arxiv.org/abs/2503.09572 ｜ Planner/Executor 分离 + 合成数据训练规划器，WebArena-Lite 57.58% SOTA。
- (2026) *Evaluating Plan Compliance in Autonomous Programming Agents* — https://arxiv.org/abs/2604.12147 ｜ SWE-agent 16,991 轨迹首个大规模「计划遵守度」分析：长轨迹漂移、周期提醒可缓解、烂计划比没计划更糟。

### ✍️ 博客与工程文

- Lilian Weng (2023) *LLM Powered Autonomous Agents* — https://lilianweng.github.io/posts/2023-06-23-agent/ ｜ 最具影响力的 agent 综述博文，把 Planning 拆为分解 + 反思，工程界规划心智模型来源。
- LangChain (2023) *Plan-and-Execute Agents* — https://www.langchain.com/blog/plan-and-execute-agents ｜ planner/executor 分离搬进生产框架，灵感点名 BabyAGI 与 Plan-and-Solve；代价是「需多得多的模型调用」。
- Anthropic (2024) *Building Effective Agents* — https://www.anthropic.com/engineering/building-effective-agents ｜ 区分工作流分解（prompt chaining）与自主规划（orchestrator-workers），start simple、按需升级的取舍基线。
- Anthropic (2025) *How we built our multi-agent research system* — https://www.anthropic.com/engineering/multi-agent-research-system ｜ lead agent 规划写入 memory、按复杂度起 subagent、子任务四要素契约；+90.2% 代价约 15x token。
- Cognition (2025) *Don't Build Multi-Agents* — https://cognition.ai/blog/dont-build-multi-agents ｜ 反对并行 subagent（共享完整 trace、行动隐含决策冲突），主张单线程连续上下文，可靠性核心是 context engineering。
- Cognition (2025) *Devin's 2025 Performance Review* — https://cognition.ai/blog/devin-annual-performance-review-2025 ｜ 一手运营复盘：擅长前期理解代码库/画架构，但「清晰前置 scoping + 可验证产出」才适合自主规划，中途加需求会变差。
- OpenAI (2025) *A practical guide to building agents* — https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf ｜ manager pattern vs decentralized handoff，建议从 single-agent 起步、必要时才 multi-agent。
- LangChain / Harrison Chase (2025) *How and when to build multi-agent systems* — https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems ｜ 读多任务适合 multi-agent、写任务交单一主智能体；子任务必须配详细指令；context engineering 是工程师第一要务。
- Manus / Yichao 'Peak' Ji (2025) *Context Engineering for AI Agents: Lessons from Building Manus* — https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus ｜ 重写 todo.md 复诵全局计划抗 lost-in-the-middle；约 1/3 动作耗在更新清单，后转 planner→executor subagent。
- Hugging Face (2025) *Building good agents (smolagents — periodic planning)* — https://huggingface.co/docs/smolagents/tutorials/building_good_agents ｜ `planning_interval` 把「周期性重规划」做成框架级开关，支持 human-in-the-loop 改计划。
- Anthropic (2026) *How we built Claude Code auto mode* — https://www.anthropic.com/engineering/claude-code-auto-mode ｜ plan mode 与 todo 被划入「不修改状态」安全工具白名单自动放行，印证规划/待办在权限模型里是只读低风险动作。
- Cursor (2025) *Agent Planning, Better Context & Faster Tab (1.2 Changelog)* — https://cursor.com/changelog/1-2 ｜ Agent To-dos：长任务拆成带依赖待办、持续可见随进度更新、可推 Slack。
- Cursor (2025) *Plan Mode (Docs)* — https://cursor.com/docs/agent/plan-mode ｜ 计划是可编辑 Markdown、存 `.cursor/plans/` 复用、可把选定 to-dos 派给新 agent，规划＝可编辑可复用工件。
- Cursor (2026) *Multitask, Worktrees, and Multi-root Workspaces (3.2 Changelog)* — https://cursor.com/changelog/04-24-26 ｜ `/multitask` 异步 subagent 并行，在「单线程更可靠」共识下保留显式并行入口（折中回摆）。

### 📚 官方文档

- Anthropic (2025) *Todo Lists / Task Tracking (Agent SDK Docs)* — https://code.claude.com/docs/en/agent-sdk/todo-tracking ｜ `pending/in_progress/completed` 三态机演进为带依赖/阻塞的 Task 工具（`TaskCreate/TaskUpdate/TaskGet/TaskList`，会话内作用域），规划产品化权威口径。
- Anthropic (2025) *Claude Code Best Practices (explore→plan→code→commit)* — https://code.claude.com/docs/en/best-practices ｜ 非平凡任务四阶段，核心是上下文管理与 TDD 反馈环。
- Kambhampati et al. (2024) *Position: LLMs Can't Plan…* (PMLR v235) — https://proceedings.mlr.press/v235/kambhampati24a.html ｜ ICML 2024 官方收录版，LLM-Modulo 立场论文。

---

> 交叉链接：[[01]] 推理范式（CoT/ReAct/Reflexion）｜[[03]] 上下文工程（lost-in-the-middle / TODO 锚点）｜[[04]] 工具与 MCP（DAG 并行调用）｜[[06]] 记忆系统（计划写入 memory）｜[[08]] 多智能体编排（orchestrator-workers）｜[[09]] 评估（plan adherence）｜[[12]] 安全与对抗（plan mode 只读门控）｜[[13]] 大厂案例研究
