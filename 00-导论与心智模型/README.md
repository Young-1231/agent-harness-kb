> 状态：🟢 已校验

# 00 · 导论与心智模型

> **一句话定位**：本节是整个知识库的地基。在动手谈 harness、上下文、工具、记忆之前，先把"什么算 Agent、什么不算、为什么是现在"这三件事钉死，后面所有工程才有锚点。

---

## 1. TL;DR / 速览

**本节地图**：先用前 LLM 时代的经典定义给 Agent 划一条"最小线"（四要件），再叠加 LLM 时代 Anthropic 的口径（"模型动态自决流程与工具调用"）；然后讲清 **Agent vs Workflow vs Chain vs Copilot** 的边界、**自主性光谱（autonomy spectrum）**、心智模型三件套（大脑 + 规划/反思 + 记忆 + 工具），以及"为什么 2023–2026 才可用"的 why-now 叙事；最后落到争议、大厂取舍与面试考点。

**核心结论（5 条）**：

1. **Agent 的差异不在"用不用工具"，而在"谁决定下一步"。** Workflow 是人预先用代码写死路径、LLM 填空；Agent 是 LLM 在循环里自己决定下一步做什么、调哪个工具、何时停。自主度（autonomy）是唯一的本质刻度——这是 Anthropic《Building Effective Agents》的纲领性区分。
2. **心智模型可压缩成一句话：Agent = LLM 大脑 + 规划/反思 + 记忆 + 工具，跑在一个 ReAct（Reason–Act–Observe）循环里。** 这是 Lilian Weng 2023 年那篇科普立下的公共词汇表，至今几乎所有框架都没跳出它。
3. **"能用"是四个使能技术同时到位的结果，不是单点突破。** 规模涌现（有争议）+ 指令跟随（InstructGPT/RLHF）+ 思维链推理（CoT）+ 可靠的函数调用/工具 + 足够强的基座（GPT-4 / o1 类推理模型是相变起点，当代旗舰已迭代到 Claude Opus 4.8 / Fable 5、GPT-5.5、Gemini 3 系、DeepSeek-V4 等），缺一个自主循环就会当场崩。
4. **"非必要不建 Agent" 是当前业界的反炒作共识。** 任务确定、规则清晰、要可预测/低成本/可审计时，workflow 更优；Agent 的灵活性是用可控性、成本和可调试性换来的。
5. **2025 是叙事上的"Agent 元年"，但 demo 能力与生产可靠性之间仍有鸿沟**——Operator 类 computer-use agent 在 OSWorld 等全机操作基准上一度不足 50%（人类约 72%；实时网页任务如 WebArena 反而过半），长程任务的误差累积仍是没解决的硬骨头。

> 衍生阅读：推理范式见 [[01]]，运行时机制见 [[02]]，上下文工程见 [[03]]，工具与 MCP 见 [[04]]，multi-agent 见 [[08]]，评估见 [[09]]。

---

## 2. 定位与动机

**这一节解决什么问题？** 一个词：**祛魅 + 对齐心智模型**。2023 年以来"Agent"被滥用到几乎失去信息量——有人把一次带工具的 LLM 调用叫 Agent，有人把一整套 multi-agent 公司叫 Agent。如果不先把定义和边界钉死，后面讨论 harness 设计、上下文管理、可靠性工程时，双方根本不在同一个坐标系里。

**在 Agent 链路中的位置**：本节是**全局地基（L0）**。它不对应链路里某个具体环节（Think / Act / Observe / Memory 都在后面的章节），而是提供一把"尺子"：

- 当你在 [[02]] 讨论"harness 该多薄"时，得先知道 harness 到底在替模型承担哪部分自主决策；
- 当你在 [[08]] 讨论"要不要上 multi-agent"时，得先有"自主性光谱"这把尺子，才能判断该把系统放在谱系的哪一格；
- 当你在 [[09]] 讨论"怎么评估 Agent"时，得先承认"Agent ≠ 一次性问答"，评测必须面向多步、有状态、与环境交互的过程。

**动机的本质矛盾**：Agent 的全部价值来自"把决策权让给模型"带来的灵活性与杠杆；Agent 的全部风险也来自同一件事——你把控制权让出去，就同时让出了可预测性、成本上限和可审计性。整个 Agent 工程，本质上就是在"自主性"和"可靠性"这条张力线上找平衡点。本节的任务，就是把这条张力线画出来。

**本库边界声明**：本库聚焦 **LLM 驱动的软件/数字 agent 的工程范式**——harness 运行时、上下文工程、工具与协议、记忆、检索、评估、可观测、生产与安全、乃至训练侧；**刻意不覆盖**多模态感知的底层细节、具身/机器人控制，以及 agent 社会模拟（如 Generative Agents 式大规模群体行为，仅作历史锚点提及而不展开）。相较通用 agent 综述，本库的差异化落点在：[[00]] 把"什么算 agent"的定义与心智模型钉死、[[03]] 把上下文当一等工程对象、[[13]] 拆解大厂的真实取舍、[[15]] 面试导向的考点化，以及新增的 [[16]]（训练侧——把推理/工具/长程决策训进权重）与 [[17]]（互操作协议与 agent 经济——跨厂的发现/协作/支付）。

---

## 3. 历史发展脉络

> 主线：**符号/RL agent →（why-now 使能技术叠加）→ LLM agent 范式（2022 ReAct 起）→ 认知架构与综述化（2023）→ 产品化与"Agent 元年"（2024–25）→ 工程范式收敛（context engineering / multi-agent 路线之争，2025）。**

| 年份 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **1995** | Russell & Norvig《AIMA》确立"理性 agent" | 把 agent 定义为"感知环境→决策→行动以最大化目标"的实体，是所有后世 agent 的概念母版。但符号/专家系统时代靠人工写规则，脆弱、不可泛化——埋下"需要可学习、有世界知识的通用底座"这一动机。 |
| **1996/97** | Franklin & Graesser《Is It an Agent, or Just a Program?》 | 提出区分 agent 与普通程序的要件（对环境反应 / 自主性 / 目标导向 / 持续性），奠定前 LLM 时代的"agent 最小定义"，是本节的学术锚点。 |
| **2013–2016** | 深度 RL agent：DQN(Atari, Nature 2015) → AlphaGo(2016) | DeepMind 证明"从奖励中学到的策略"能碾压手写规则。但它们被锁死在封闭仿真器里、无语言无常识，凸显对"通用可迁移底座"的渴求——为 LLM 接棒铺路。 |
| **2020** | GPT-3 展示 in-context learning | 无需微调即可用提示驱动新任务，为"用自然语言指挥模型"埋下技术前提（why-now 要素之一）。 |
| **2021-12** | WebGPT：RLHF 做带引用的网页问答 | LLM 第一次系统地"用工具 + 与环境交互"，是符号/RL agent 向 LLM agent 过渡的早期信号。 |
| **2022-01** | Chain-of-Thought（CoT）提示问世 | 赋予模型显式多步推理，解锁了 agent 所需的"思考"那一半——成为控制回路的认知底座。 |
| **2022-03** | InstructGPT / RLHF | 指令跟随是把自然语言目标转成可控 agent 行为的前置条件，核心 why-now 使能技术。 |
| **2022-04** | SayCan（Google）：把 LLM 接地到机器人可供性 | LLM 给"有用动作"（Say）+ 可供性函数判断"可行性"（Can），示范如何把模型的"想法"约束到可执行动作空间——自主性需被环境接地的早期范例。 |
| **2022-06** | 《Emergent Abilities》提出规模涌现 | 为"能力到一定规模才出现"提供论据，支撑"为何 2023 后才可用"的叙事（也引发后续是否为度量假象的争论）。 |
| **2022-10** | **ReAct：推理与行动交错的 agent 回路** | **本节范式正式起点**——确立 thought–action–observation 标准循环，把文本生成器变成能"观察–行动"的闭环主体，是从符号/RL 转向 LLM agent 的真正枢纽。 |
| **2022-11** | ChatGPT 发布 | 把 LLM 能力普及为产品级交互，直接点燃随后一年的 agent 研究与创业热潮。 |
| **2023-02** | Toolformer（Meta）：自监督学会调 API | 把"工具使用"内化进模型，工具维度的代表性突破。 |
| **2023-03** | GPT-4 发布(3/14) + Reflexion + AutoGPT(3/30)/BabyAGI(3/28) | GPT-4 推理跃升后，社区把模型调用串成"自设子目标、自评、失败重试"的全自主循环，AutoGPT 数月破 10 万 star；Reflexion 确立"语言式反思 + 记忆"。这是"自主 agent"第一次大众级狂热，也很快暴露全自主循环不可靠、烧钱、难调试，直接点燃"炒作 vs 现实"之争。 |
| **2023-04** | Generative Agents（斯坦福 Smallville） | 25 个 agent 在沙盒小镇规划日程、形成关系。"记忆流 + 反思 + 规划"的认知架构证明：agent 需要的不止一个循环，还要记忆与认知脚手架，奠定 cognitive architecture 思路。 |
| **2023-05** | Tree of Thoughts + Voyager | ToT 把 CoT 推广为对"思维"单元的树搜索（Game-of-24 从 4% 升到 74%）；Voyager 在 Minecraft 展示开放式终身学习与可增长技能库——自主性显著上探。 |
| **2023-06** | OpenAI Function Calling 进 API + Lilian Weng《LLM Powered Autonomous Agents》 | 工具调用从脆弱的"提示词解析"升级为模型原生能力（直接输出结构化 JSON）；Lilian Weng 把 ReAct/Reflexion 串成"大脑 + 规划 + 记忆 + 工具"统一心智模型，成为后续所有框架的概念地基。 |
| **2023-08/09** | Wang 综述、Xi 综述、CoALA 相继发布 | 领域进入"被系统综述"阶段，统一框架（profile/memory/planning/action、脑–感知–行动、认知架构）成形。 |
| **2024-03** | Cognition Devin"首个 AI 软件工程师" | 叙事从"通用全自主"转向"垂直、长程、有真实基准"：Devin 在 SWE-bench 端到端解决 13.9% 真实 GitHub issue（远超当时 GPT-4 的个位数）。把讨论拉回"可度量的实际能力"，开启 agent 创业潮。 |
| **2024-09** | OpenAI o1 推理模型 | 用 RL 训出超长思维链 / 测试时计算（System-2 思考），补上"更可靠的推理"这块长程 agent 的缺失拼图。推理模型自此成为 agent 的引擎。 |
| **2024-10** | Anthropic Computer Use + OpenAI 开源 Swarm | Computer Use 让模型像人一样操作 GUI（截图/点击/输入），agent 从"调 API"迈向"用人类的工具"；Swarm 用 agents + handoffs 两个原语把多智能体编排极简化（后演化为 Agents SDK）。 |
| **2024-11** | Anthropic 开源 MCP 协议 | 用统一协议解决工具集成的 M×N 问题，给 agent 的上下文/工具接入立标准。几个月内涌现上千社区 server，2025 年被 OpenAI、Google 采纳——agent 进入"基础设施成熟"阶段。 |
| **2024-12** | Anthropic《Building Effective Agents》+ HF smolagents | 前者提出 workflow vs agent 二分法与五种 workflow 模式，定义之后的工程话语；后者主张 "code agent"（写代码调工具）并把极简主义（核心约千行）带入框架之争。 |
| **2025-01/03** | OpenAI Operator(1/23) + Manus(3/6)，"Agent 元年"叙事 | 消费级/通用 agent 集中落地：Operator 用 CUA 替用户做网页任务；Manus 自称"首个通用 agent"，72 小时刷屏。叠加各大厂集体押注，"Agent 元年"叙事成型，也暴露全机操作（OSWorld 类）成功率不足 50%（人类约 72%）的现实差距。 |
| **2025-04** | OpenAI《A Practical Guide to Building Agents》 | 从大量客户部署提炼"何时该建 agent / single-agent vs multi-agent / guardrails"，强化产品化方法论。 |
| **2025-05** | 《AI Agents vs. Agentic AI》概念分类发表 | 为 single-agent 自动化与 multi-agent "Agentic AI" 划清边界，刷新自主性光谱的学术语汇（也引发"是否术语营销"的争论）。 |
| **2025-06** | **同月对撞**：Anthropic《multi-agent 研究系统》(6/13) vs Cognition《Don't Build Multi-Agents》(6/12)；LangChain《The rise of context engineering》(6/23) | 两家头部公司就"是否该用 multi-agent"公开给出相反结论，成为导论必讲的架构路线之争；同月 Harrison Chase 把 "context engineering" 正式立为 AI 工程师的核心技能，标志从 prompt engineering 的范式迁移。 |
| **2025-09 / 11** | Anthropic《Effective context engineering》(9月) + 《Code execution with MCP》(11月) | 把 context 定义为有限资源、给出长程 agent 的上下文管理系统方法；并指出连太多 MCP server 时工具定义可在 agent 读到请求前就吃掉 5 万+ token，主张用代码执行调用 MCP 工具提效。工程范式持续收敛。 |
| **2026 H1** | METR Time Horizon 1.1（1月）+ 当代旗舰换代（Claude Opus 4.8 / Fable 5、GPT-5.5、Gemini 3 系、DeepSeek-V4 等）+ Anthropic《Scaling Managed Agents》(4月)拆 brain/hands/session | METR 量化"时间地平线"持续翻倍（Opus 4.5 在 50% 成功率下可处理约 320min 跨度的任务、约 88.6 天翻一番），给 why-now 的"基座持续变强"补上可度量证据；当代推理模型 + 长程 agent 工程（脑/手/会话解耦）让自主循环更长更稳，标志范式从"能不能跑"转向"如何规模化可靠运行"。 |

**演进的内在逻辑**：底座两次"换引擎"——从手写规则（符号）换成从奖励学策略（RL），再换成有语言和世界知识的 LLM；范式从"一次性生成"换成"带反馈的闭环"（ReAct）；然后认知科学的旧概念（记忆/规划/反思）被重新接回（CoALA、Generative Agents）；最后是产品化逼出的工程纪律（context engineering、workflow vs agent、multi-agent 路线之争）。

---

## 4. 核心概念与原理

### 4.1 Agent 的"双层定义"

**第一层（前 LLM 锚点，Franklin & Graesser 1997）**——自主 agent 是"嵌入环境、能感知并作用于环境、持续追求自身议程"的系统，四要件：

- **Reactivity（对环境反应）**：能感知环境并及时响应；
- **Autonomy（自主性）**：无需逐步指令即可自行决定行动；
- **Goal-orientation（目标导向）**：不只被动响应，还主动追求目标；
- **Temporal continuity（持续性）**：是持续运行的进程，而非一次性函数。

**第二层（LLM 时代口径，Anthropic 2024）**——把上面四要件落到 LLM：

> Workflow 是"LLM 和工具通过**预定义代码路径**编排"；Agent 是"LLM **动态地自己掌控流程与工具调用**"。

合起来给出一个可操作的最小定义：**Agent = 一个由 LLM 在循环中自主决定下一步动作（含工具调用）、并根据观测结果调整、直到自认为完成目标的系统。** 关键词是"自主决定下一步"与"循环"。

### 4.2 底层范式：ReAct（Reason–Act–Observe）循环

几乎所有 LLM agent 的控制回路，本质都是 ReAct 的变体——把"推理（思考下一步该干嘛）"和"行动（调工具/与环境交互）"交错进同一个循环，用"观测（环境返回）"闭环：

```
state = init(task, tools, system_prompt)
while not done and steps < MAX_STEPS:
    # Reason：模型基于当前上下文产出"想法" + 下一步动作
    thought, action = LLM(state.context)

    if action.type == "finish":
        done = True
        answer = action.payload
        break

    # Act：harness 执行动作（调用工具 / 操作环境）
    observation = execute(action)          # 见 [[02]] / [[04]]

    # Observe：把结果写回上下文，进入下一轮
    state.context = append(state.context, thought, action, observation)

return answer
```

三个要点（也是后续章节展开的接缝）：

- **谁来决定 `action`** 是区分 agent 与 workflow 的分水岭：agent 里由 `LLM(...)` 决定，workflow 里由外层 `if/else` 代码决定。
- **`execute(action)`** 是 harness 的活儿——动作可以是 JSON 工具调用，也可以是一段 Python 代码（code-as-action，见 §6 争议五、[[02]]）。
- **`MAX_STEPS` 和 `finish` 条件** 是防死循环的护栏——少了它，AutoGPT 式"无限自我循环烧 token"就会复现（见 §7）。

### 4.3 心智模型三件套（Lilian Weng 2023）

把 ReAct 循环里那个 `LLM(...)` 拆开，得到被引用最广的心智模型：

```
            ┌──────────────── Agent ────────────────┐
            │                                        │
  环境/任务 →│   [ Planning ]   子目标分解 + 自我反思     │
            │        │                               │
            │   [  LLM 大脑  ] ←──→ [ Memory ]         │  → 动作/答案
            │        │            短期(in-context)    │
            │        │            长期(向量库/文件)     │
            │   [ Tool use ]   函数调用 / 检索 / 代码     │
            │                                        │
            └────────────────────────────────────────┘
```

- **Planning（规划/反思）**：把复杂任务拆成子目标（CoT/ToT/Plan-and-Solve），并对历史动作做自我批评与反思（Reflexion）——详见 [[01]]、[[05]]。
- **Memory（记忆）**：短期记忆是 in-context（放进上下文窗口），长期记忆是外部向量库/文件 + 快速检索——详见 [[03]]、[[06]]。
- **Tool use（工具）**：调用外部 API/检索/代码执行，弥补权重里缺失的知识与能力——详见 [[04]]。

### 4.4 自主性光谱（autonomy spectrum）

把上面拼起来，Agent 与"非 Agent"不是非黑即白，而是一条连续谱。**control ↔ autonomy** 是一条轴，不是二选一：

```
低自主 ←──────────────────────────────────────────→ 高自主
固定 Chain    可路由 Workflow     有限自主 Agent      开放式自主 Agent     Agentic AI
(prompt链)   (routing/并行/      (ReAct: 工具+       (规划+记忆+          (多agent协同/
            编排者-工作者)        反思自决下一步)      长程自我纠错)         动态分解/持久记忆)
            ──────────────      ──────────────      ──────────────       ──────────────
 谁决定下一步:  外层代码          模型(受限动作空间)    模型(开放动作空间)     多个模型互相协商
 代表:        五种workflow      ReAct/Reflexion    Voyager/Devin       Generative Agents
                                                                      /多agent系统
```

- **Copilot** 不在这条主轴上：它是"人在环（human-in-the-loop）的建议增强"——模型给建议，人按下"接受"。它和 agent 的差异不在自主算法，而在**谁拥有执行权**。
- 《AI Agents vs. Agentic AI》(2025) 把谱系右端单拎出来命名为 "Agentic AI"（multi-agent 协同/动态分解/持久记忆），与左侧"窄任务 single-agent 自动化"区分——这个切分本身有争议（见 §6）。

### 4.5 Why-now：为什么是 2023–2026

自主循环要"不立即崩溃"，需要四个条件同时到位，缺一不可：

1. **指令跟随（InstructGPT/RLHF, 2022）**——模型得先能可靠"听话"，才能把自然语言目标转成可控行为；
2. **多步推理（CoT, 2022 / o1 类推理模型, 2024）**——循环每一步都要会"想"，否则误差一步放大；
3. **可靠的工具/函数调用（Function Calling, 2023 / MCP, 2024）**——动作得能结构化、可解析、可执行；
4. **足够强的基座（GPT-4, 2023 起为开路者；当代旗舰已是 Claude Opus 4.8 / Fable 5、GPT-5.5、Gemini 3 系、DeepSeek-V4 等）**——上下文长、推理稳，长循环才不会中途失忆或跑飞。

再叠加一个有争议的因子——**规模涌现（emergent abilities）**：Wei 等(2022) 认为某些能力到规模阈值才突现，这是"为何现在才可用"的常见叙事；但 Schaeffer 等(2023) 反驳说这多是非线性度量造成的假象（见 §6 争议一）。无论涌现真假，上面四个工程使能技术的叠加，才是 2023 后自主 agent 从 demo 走向可用的真实原因。

### 4.6 「何时该用 agent」：决策前置

在动手前先过一遍这棵决策树，能避开 §8 里最高频的坑（过早上 agent）：

```
任务能否画成一张确定的流程图（if/else 能把路径写死）？
   ├─ 能 ───────────────→ 用 workflow / chain（固定或可路由），别上自主循环
   └─ 不能（步骤需边走边查、下一步由结果决定）
          │
          ├─ 是否含高风险动作（写库 / 付钱 / 删文件 / 外发邮件）？
          │     ├─ 是 → 用 agent，但叠加 human-in-the-loop + 护栏
          │     │        （确认步 / 预算上限 / 沙箱 / 权限分级）
          │     └─ 否 → 用受限动作空间的 agent（ReAct），配 MAX_STEPS / finish
          │
          └─ 任务是否"可并行的广度型"且价值足够高？
                ├─ 是 → 才考虑多 agent（先算 token 账，见 §7 案例 A）
                └─ 否 → 单线程 agent + 强上下文工程（见 §7 案例 B）
```

三条判据浓缩成一句：**能画确定流程图 → workflow；步骤不确定、需自主 → agent；动作高风险 → 不论哪种都加 HITL 与护栏。** 这与 Anthropic「非必要不建 agent」、OpenAI《A Practical Guide to Building Agents》"先把 single-agent 做到极致再谈 multi-agent"同源。

### 4.7 能力 / 自主性「成熟度阶梯」

把 §4.4 的自主性光谱竖过来，按"谁决定下一步 + 护栏重点"拆成可逐级爬升的阶梯——工程默认从 L0 起步，每升一阶都要能说清"上一阶为什么不够"：

| 阶 | 形态 | 自主性特征 | 谁决定下一步 | 护栏重点 | 代表 |
|---|---|---|---|---|---|
| **L0** | 固定 Chain | 无自主、线性 | 人（代码写死） | 输出校验 | prompt chaining |
| **L1** | 可路由 Workflow | 有限分支 / 并行 | 人 + 少量分类决策 | 分支兜底、超时 | routing / parallelization |
| **L2** | 有限自主 Agent | 受限动作空间循环 | 模型（受限） | `MAX_STEPS` / `finish` / 预算 | ReAct |
| **L3** | 反思 / 规划型 Agent | 自我纠错 + 情景记忆 | 模型 + 自我反馈 | 可观测回放、停止条件 | Reflexion / ToT |
| **L4** | 开放式自主 Agent | 开放动作 + 技能增长 | 模型（开放） | 沙箱 + HITL + 权限分级 | Voyager / Devin |
| **L5** | multi-agent / Agentic AI | 多模型协商 / 动态分解 | 编排器 + multi-agent | 成本闸 + 冲突决策治理 | Claude Research |

往下走自主度与杠杆递增，可预测性与可调试性递减；阶梯不是"越高越好"，而是"匹配任务确定性的最低可行阶"。

### 4.8 METR 时间地平线：长程能力的统一标尺

why-now 里"基座持续变强"过去只能定性说，METR 的**时间地平线（time horizon）**给了它一把可量化的统一标尺：把一项任务的难度，用"人类专家完成它需要多久"来标定，再问"模型在某一成功率（如 50%）下能搞定多长跨度的任务"。

- **2026-01 METR Time Horizon 1.1**：50% 成功率下，**Claude Opus 4.5 ≈ 320 分钟**、**GPT-5 ≈ 214 分钟**的任务跨度；
- **增速**：以 2024 起的窗口看约 **88.6 天翻一番**（若取全历史窗口则约 196.5 天）——长程自主能力呈指数上探。

它的价值在于把散落的 benchmark 折叠成一个随时间演进的标量，正好量化了本节 §4.5 与 §3 末行最难定性的那件事——"自主循环到底能跑多长"。配套的争议（基准是否饱和、是否会被污染退役）见 [[09]]；把这种长程能力"训进权重"的训练侧视角见 [[16]]。

### 4.9 Model / Orchestration / Tools：三层 triad 入口

§4.3 的心智模型三件套讲的是"agent 内部由什么构成"；落到"动手搭一个 agent 要做哪几类设计决策"，可循 OpenAI《A Practical Guide to Building Agents》的方法论拆出一组互补的入口三元组（概念性）：

- **Model（选模型）**：用哪个基座承担推理与决策——按任务难度 / 延迟 / 成本分级，未必处处用最强模型；
- **Tools（配工具）**：给哪些外部能力（API / 检索 / 代码执行 / 计算机操作），决定动作空间的边界——详见 [[04]]；
- **Orchestration（定编排与护栏）**：single-agent 还是 multi-agent、循环如何收敛、在哪里插 guardrails 与 human-in-the-loop——详见 [[02]]、[[08]]、[[12]]。

记法："**模型是大脑、工具是手脚、编排是规则与缰绳**"——三者任一短板都会让自主循环当场崩。

---

## 5. 主流方法谱系（横向对比）

> 维度：谁决定下一步 / 控制流 / 可预测性 / 成本 / 适用场景 / 代表作。

| 方案 | 谁决定下一步 | 控制流 | 可预测性·可审计性 | 成本 | 最适用场景 | 代表作 / 来源 |
|---|---|---|---|---|---|---|
| **固定 Chain（prompt chaining）** | 人（代码写死） | 线性、预定义 | 高 | 低 | 任务可拆成固定步骤（如"先抽取→再翻译→再润色"） | Anthropic 五模式之一 |
| **可路由 Workflow（routing / parallelization / orchestrator-workers / evaluator-optimizer）** | 人（代码 + 少量分类决策） | 有限分支、预定义 | 较高 | 中 | 输入类别有限、可并行、可迭代评分 | 《Building Effective Agents》五模式 |
| **有限自主 Agent（ReAct）** | 模型（受限动作空间） | 循环，模型自决 | 中 | 中–高 | 步骤无法预先确定、需边走边查 | ReAct (Yao 2022) |
| **反思型 Agent（Reflexion / Self-Refine）** | 模型 + 自我反馈 | 循环 + 反思记忆 | 中 | 高 | 可从失败中迭代改进的试错任务 | Reflexion (Shinn 2023) |
| **搜索/审慎规划（Tree of Thoughts）** | 模型（树搜索 + 回溯） | 树状探索 | 中 | 高（多路径） | 需前瞻/回溯的硬推理（24 点、规划） | ToT (Yao 2023) |
| **开放式自主 Agent（Voyager / Devin）** | 模型（开放动作 + 技能库） | 长循环 + 课程/技能增长 | 低 | 高 | 开放世界、长程、终身学习 | Voyager (Wang 2023) |
| **multi-agent / Agentic AI** | 多个模型协商 + 编排器 | orchestrator-worker / handoff | 低 | 很高（Anthropic 测约 15× chat） | 可并行的广度任务（研究/检索） | multi-agent 综述 (Guo 2024)；Claude Research |
| **Code Agent（code-as-action）** | 模型（写代码作为动作） | 循环，动作=可执行代码 | 中（需沙箱） | 中（步数更少） | 工具组合复杂、需循环/条件/嵌套 | CodeAct (Wang 2024)；smolagents |

**读表要点**：从上往下，自主度递增、可预测性递减、成本递增。**工程的默认起点应该是表的上方**（最简 workflow），只在简单方案确实不够时才往下走——这正是 Anthropic 的"非必要不建 agent"。

---

## 6. 主流观点与争议

### 争议一：涌现能力是真实"相变"，还是度量假象？

- **A 方（Jason Wei 等, Google, 2022）**：某些能力在小模型上近随机、达到规模阈值才突现，无法由小模型外推——这支撑"为何现在才可用"的规模叙事。
- **B 方（Rylan Schaeffer / Sanmi Koyejo 等, Stanford, 2023, NeurIPS）**：换用线性/连续度量后，曲线平滑可预测；所谓"涌现"多是研究者选用的非线性/不连续度量造成的伪影。
- **为什么重要**：它直接决定"为何 2023 后才可用"的因果叙事是否成立。我的取舍（详见 §8）：无论涌现真假，**工程使能技术的叠加**比"涌现"更能解释 why-now。

### 争议二：是否过度炒作？（泡沫论 vs 实干乐观论）

- **A 方·泡沫论（Gary Marcus, NYU 荣休）**：除窄场景外 agent 仍不可靠，LLM 并非真推理而是统计联想、会幻觉；长程任务里误差逐步累积使全自主 agent 脆弱；基准分数与生产可用性之间鸿沟巨大。AutoGPT"10 万星后归于沉寂"被当作典型证据。
- **B 方·实干乐观论（Andrew Ng, DeepLearning.AI）**：agentic workflow 确有实效——把反思/工具/规划/multi-agent 的迭代循环套在模型外，能让较弱模型在某些设置下反超更强模型；各大实验室已交付可度量产品（Devin 的 SWE-bench 增益、Computer Use、Operator）。问题是工程，而非方向。
- **调和点**：双方都同意"窄、垂直、有真实基准"的 agent 已可用，分歧在"通用全自主"的成熟度与时间表。
- **2025–26 落地率为这条张力提供了实测刻度**（标 medium 置信，从保守口径）：Menlo Ventures 测得企业部署中**仅约 16% 算"真 agent"**、Deloitte《Tech Trends 2026》测**仅约 11% 已投产**——支持泡沫派"鸿沟巨大"；但 LangChain《State of Agent Engineering》调研里**57% 受访者已有 agent 投产**（质量是头号障碍）——支持乐观派"方向没错、问题是工程"。两组数据并不矛盾：**窄垂直在快速投产、通用全自主仍稀缺**，正是调和点的量化版（详见 [[11]]/[[13]]）。

### 争议三：workflow 还是 agent？大多数任务该不该上 agent？

- **A 方（Anthropic《Building Effective Agents》, Erik Schluntz / Barry Zhang）**：生产中大部分价值来自可组合的 workflow（提示链/路由/并行/编排者-工作者/评估者-优化者）；"先找最简方案，只在任务确需灵活性时才引入自主 agent"，且别动辄上重框架——框架抽象会遮蔽底层 prompt/响应。
- **B 方（Harrison Chase, LangChain）**：control↔autonomy 是连续谱，最佳点常在"可控 agent"这一中段；"deep agents"需要规划、记忆、subagent 等更复杂的编排，认知架构应按应用定制，编排层框架（如 LangGraph）有其价值。
- **本质**：这不是"对错"，而是"在谱系上把默认起点设在哪"。

### 争议四：复杂任务该 multi-agent 并行，还是单线程 + 强上下文工程？（2025-06 同月对撞）

- **A 方（Anthropic《multi-agent 研究系统》, 2025-06-13）**：研究类、可并行的广度任务用 orchestrator-worker（lead agent = Opus 4 + 并行 subagent = Sonnet 4），内部评测较 single-agent **+90.2%**。
- **B 方（Cognition《Don't Build Multi-Agents》, Walden Yan, 2025-06-12）**：别建 multi-agent——两条 context engineering 原则：(1) 共享上下文且共享完整 agent trace 而非单条消息；(2) 动作隐含决策，subagent 各自臆测会产生冲突决策（Flappy Bird 例子：subagent 拼出 Mario 背景 + 不兼容的鸟）。主张单线程 agent + 微调小模型压缩历史。
- **关键调和点**：Anthropic 自己也明确承认，编码这类强依赖、需共享上下文的任务**不适合** multi-agent。所以二者其实在说"按任务类型分流"：广度可并行 → multi-agent；强依赖串行 → 单线程。详见 [[08]]。

### 争议五：动作空间该用代码还是 JSON 工具调用？

- **A 方（HF smolagents / CodeAct, Wang 2024）**：让 LLM 写代码作动作，天然支持循环/条件/嵌套；CodeAct 实测比输出 JSON 工具字典**约少 30% 步数**（即少约 30% LLM 调用）且基准成功率更高。
- **B 方（OpenAI Agents SDK 等主流 function-calling）**：JSON 工具调用更可控、易加 guardrails、无需沙箱。
- **代价**：code agent 必须上 E2B/Modal 等沙箱防任意代码执行，把安全风险换成了运维成本。详见 [[02]]、[[12]]。

### 争议六：'AI Agent' 与 'Agentic AI' 的区分有无实质意义？

- **A 方（Sapkota 等, 2025）**：应区分窄任务的 single-agent 自动化与 multi-agent 协同/持久记忆/动态分解的 Agentic AI，二者设计哲学不同。
- **B 方（质疑者）**：该区分多为术语营销，自主性是连续光谱，硬切两类易制造伪边界。

---

## 7. 大厂工程实践（取舍拆解）

### 案例 A：Anthropic Claude Research——multi-agent 的"贵但值"

- **架构**：orchestrator-worker。lead agent（Opus 4）分析查询、制定策略、并行 spawn 多个 subagent（Sonnet 4）各自探索不同子方向，最后汇总。
- **收益**：内部研究 eval 上较 single-agent Claude Opus 4 **+90.2%**。
- **代价**：token 经济性是硬约束——Anthropic 自陈 agent 通常用约 **4× chat** 的 token，而**multi-agent 系统约 15× chat**。
- **取舍结论**：只在"任务价值高 + 可并行"时才值得；并明确把编码这类强依赖、需共享上下文的任务**排除**在外。这是"用 token 成本换广度并行收益"的典型工程账。

### 案例 B：Cognition Devin——单线程的"可靠优先"反向取舍

- **取舍**：刻意**不拆** multi-agent，坚持单线程 agent 共享完整上下文/trace，以避免 subagent 冲突决策。
- **代价与补丁**：长任务上下文会溢出，于是专门**微调一个小模型来压缩动作历史**，团队自陈这件事 "hard to get right"。
- **意义**：与案例 A 形成同期、同问题、相反结论的对照——代表"可靠性优先于并行度"的路线。两者放在一起，正好说明"多 vs 单"没有银弹，是逐任务的工程判断。

### 案例 C：Anthropic Code execution with MCP——用代码执行换 token 效率

- **问题**：连接大量 MCP server 时，工具定义 + 中间结果可在 agent 还没读到请求前就吃掉 **5 万+ token**；文中一个例子里上下文从 15 万 token 降到 2 千 token（约 98.7% 节省）。
- **解法**：把 MCP 工具暴露为代码 API，让 agent 写代码按需加载工具、用循环/条件/嵌套组合调用，在执行环境里先处理数据再把结果回传模型。
- **取舍**：用"引入代码执行环境"的复杂度，换 token 效率与可组合性。详见 [[04]]。

### 案例 D：Cursor multi-agent 并行（git worktree 隔离）

- **演进**：早期 Shadow Workspace（隐藏第二个 VS Code 实例做 lint/类型检查，2025-01 移除）→ Cursor 2.0 用 **git worktree** 让多个 agent 并行、各自隔离工作区与测试，避免文件锁冲突；并发现"多个模型攻同一问题再择优"能显著提升困难任务的结果。
- **张力点**：这与 Anthropic"编码不适合 multi-agent"形成有趣对照——Cursor 的 multi-agent 是"隔离 + 择优"，而非"协同共享上下文"，恰好绕开了 Cognition 指出的"subagent 冲突决策"问题。

### 反面案例：AutoGPT / BabyAGI——"高自主不可靠"的警示

把模型调用串成"自设子目标、自评、失败重试"的全自主循环，数月破 10 万 star，是大众级"自主 agent"狂热的起点；但很快暴露易跑偏、烧 token、难收敛、难调试与归因，"由盛转衰"成了"自主度越高、可靠性越脆"的经典证据。它的价值是反向的：定义了后来所有"加护栏、缩作用域、人在环"工程纪律的问题边界。

---

## 8. 我的分析与判断

> **以下为分析观点（非事实陈述），是作者基于上述材料的独立研判，可能随技术演进被推翻。**

**趋势研判（3 条）**：

1. **"Agent vs Workflow"的边界会随模型变强而上移，但不会消失。** 今天该手写的胶水代码（路由、重试、上下文裁剪），明天会被更强的模型和标准（如 MCP）吸收一部分；但"谁拥有执行权与控制权"这条线是产品和合规层面的，不是能力问题——所以这条边界会移动，不会被抹平。判断一个系统时，别问"它够不够智能"，要问"它的失败由谁兜底"。
2. **2026 的主战场已坐实为 context engineering，而非 prompt engineering，也非"要不要上 agent"——这条 2025 年的判断已在 2026 H1 兑现。** 早在 2025 年同一季度，Anthropic、LangChain、Cognition 就不约而同收敛到"上下文是有限资源、要在推理时维护最优 token 集"，行业共识已从"怎么让模型聪明地想"迁移到"怎么在有限注意力预算里喂对信息"。进入 2026，这一范式进一步固化为可复用工程：Anthropic《Harness design for long-running application development》(2026-03)给出 context reset + 结构化交接的长程方案，《Scaling Managed Agents》(2026-04)把上下文与执行解耦成 brain/hands/session 三层；学界亦出现 context engineering 的累进成熟度模型（arXiv 2603.09619）。这是 [[03]] 会重点展开的，但它的根扎在本节——因为 context 管理本质上就是在 ReAct 循环里决定"每一轮把什么写回上下文"。
3. **multi-agent 不是终点而是一种"成本换并行"的手段，且会被推理模型部分蚕食。** Anthropic 的 15× token 账单说明 multi-agent 现在是奢侈品。随着单个推理模型（o1/o3 类）能跑更长更稳的链，很多今天靠 multi-agent 拆的活，明天 single-agent + 强上下文工程就能干——Cognition 押的就是这个方向。我倾向认为：**multi-agent 的合理使用场景会收窄到"天然可并行的广度任务"，而非"复杂任务的默认解法"。**

**常见坑（5 个，按踩坑频率排序）**：

1. **过早上 agent。** 任务其实是固定流程（能画出确定的流程图），却上了自主循环，换来不可预测、贵、难调试。**先问：这任务能不能用 if/else 画出来？能就用 workflow。**
2. **没有硬停止条件。** 忘了 `MAX_STEPS` / 预算上限 / `finish` 工具，复现 AutoGPT 式烧钱循环。
3. **把"基准分数"当"生产可用"。** SWE-bench 上的百分比和真实站点 <50% 成功率是两个世界，demo 能力不等于可靠性。
4. **multi-agent 当默认解。** 没算 token 账、没判断任务是否可并行，就拆 subagent，结果是 15× 成本 + 冲突决策。
5. **过度依赖框架的高层抽象。** 框架把 prompt/响应藏起来，出问题时连"模型到底看到了什么上下文"都不知道，调试无从下手。

**最佳实践（可直接照做）**：

- **从最简方案起步，逐级加自主性**：固定 chain → 可路由 workflow →（确需灵活时再）ReAct agent →（确需并行广度时再）multi-agent。每升一级都要能说清"上一级为什么不够"。
- **先直接调 API，把一个 single-agent 做到极致，再考虑 multi-agent**（OpenAI Practical Guide 的明确建议）。
- **按风险逐级放权 + 保留 human-in-the-loop**：高风险动作（写库、付钱、删文件）加确认或护栏，别一步到位全自主。
- **把可观测性（observability）当一等公民**：每一步的 thought/action/observation 都要可回放（见 [[10]]），否则长程 agent 出错根本无法归因。
- **用内部 eval 自证，但别自欺**：各家都在用内部 eval，记得区分"过程评分 vs 结果评分"，警惕数据泄漏与不可复现（见 [[09]]）。

---

## 9. 面试考点

**概念题**

1. **用一句话定义 Agent，并说清它与 Workflow 的本质区别。**
   - 要点：Agent = LLM 在循环中**自主决定下一步动作（含工具调用）**直到完成目标；Workflow = LLM 和工具走**预定义代码路径**。本质差异是**自主度（谁决定下一步：模型 vs 外层代码）**，不是"用不用工具"。引用 Anthropic《Building Effective Agents》。

2. **画出/描述 Agent 的心智模型三件套，并说清每件对应后续哪个工程模块。**
   - 要点：LLM 大脑 + 规划/反思（[[01]]/[[05]]）+ 记忆（短期 in-context / 长期向量库，[[03]]/[[06]]）+ 工具调用（[[04]]），底层跑 ReAct（Reason–Act–Observe）循环。来源 Lilian Weng 2023。

3. **解释"自主性光谱"，并把 ReAct / Reflexion / Voyager / multi-agent 分别标到谱系上。**
   - 要点：固定 chain → 可路由 workflow → 有限自主（ReAct，受限动作空间）→ 反思型（Reflexion，加情景记忆）→ 开放式自主（Voyager，技能库+终身学习）→ Agentic AI（multi-agent 协同）。control↔autonomy 是连续谱，不是二选一。

4. **"为什么 Agent 到 2023–2026 才可用？"（why-now）**
   - 要点：四个使能技术叠加——指令跟随（InstructGPT/RLHF）+ 多步推理（CoT / o1 类）+ 可靠函数调用（Function Calling / MCP）+ 强基座（GPT-4 起步，当代为 Claude Opus 4.8 / Fable 5、GPT-5.5、Gemini 3 系等）；外加有争议的规模涌现（Wei vs Schaeffer）。强调"叠加"而非单点。

**系统设计题**

5. **设计一个"企业内部文档问答 + 操作"助手，并论证它应该是 workflow、agent，还是混合。**
   - 要点：先拆任务确定性——"查文档回答"可固定（检索→生成，用 workflow/RAG，见 [[07]]）；"按结果执行操作（建工单/改配置）"步骤不确定、需自主决策 → 用受限 agent。整体倾向**混合**：可预测部分走 workflow，开放部分走有护栏的 agent；高风险动作加 human-in-the-loop。要谈停止条件、guardrails、可观测性、token 成本。

**手写题**

6. **手写一个最小 ReAct loop 的伪代码，并标出"防死循环"和"工具执行"在哪。**
   - 要点：见 §4.2 伪代码。必须有 `MAX_STEPS` / 预算上限、`finish` 终止动作、`execute(action)` 由 harness 而非模型执行、每轮把 observation 写回上下文。能讲清"谁决定 action"即区分 agent/workflow 的点为加分。

**陷阱题**

7. **"multi-agent 一定比 single-agent 强吗？" / "Anthropic 测出 +90.2%，是不是该默认上 multi-agent？"**
   - 陷阱：+90.2% 有前提（可并行的研究类广度任务），代价是约 **15× chat** 的 token；且 Anthropic 自己把编码这类强依赖任务排除在外，Cognition 更直接主张单线程。正确答案：**逐任务判断**——可并行广度 → multi-agent；强依赖串行 → 单线程 + 强上下文工程。

8. **"既然涌现证明大模型会突然获得新能力，那 Agent 可用就是涌现的结果，对吗？"**
   - 陷阱：涌现本身有争议（Schaeffer 2023 指其可能是度量假象）；且 agent 可用主要靠工程使能技术叠加，而非单一涌现。把"涌现"当成 why-now 的唯一/主要原因是错的。

9. **"用了 LangChain/某框架就等于做了 agent" / "带工具的 LLM 调用就是 agent" 对吗？**
   - 陷阱：框架 ≠ 自主性，单次带工具调用 ≠ 循环自决。判断标准始终是"模型是否在循环里自主决定下一步"。框架抽象还可能遮蔽底层 prompt/响应，反而增加调试难度。

**前沿考点（训练侧 / 协议层——对应新增 [[16]]/[[17]]）**

10. **"为什么说 agent 的护城河正从 prompt 前移到'拿得到可验证轨迹做 RL'？"**
   - 要点：底层越商品化（厂商 SDK、MCP、托管缓存），prompt/scaffolding 的边际收益越衰减；2024 ACI「改接口翻倍分数」是 harness 红利，2025–26 转向「用 RL 把推理/工具/记忆/长程决策训进权重」（DeepSeek-R1、SWE-Gym、agentic RL）。能拿到**可验证轨迹数据**做 RL 的玩家护城河最深——这也是 Cognition 拼命 dogfooding 的原因。机制详见 [[16]]。
11. **"MCP 与 A2A 的分工是什么？为什么说 MCP 解决不了 agent 间协作？"**
   - 要点：MCP 是**纵向**「模型 ↔ 工具/数据」标准（把 M×N 集成压成 M+N）；A2A 是**横向**「agent ↔ agent」协作（发现/委派/长任务），二者互补不互替。再叠**身份发现**（NANDA/Agent Card）与**支付电商**（AP2/ACP/x402）才构成完整四层互操作栈。MCP 让 single-agent 会"用工具"，但跨厂、跨组织的 agent 互相发现与协作、乃至机器间结算，属 A2A/经济层的事。详见 [[04]]/[[17]]。

---

## 10. 参考文献

### 📄 论文

- Stuart Russell, Peter Norvig · 1995 · 《Artificial Intelligence: A Modern Approach (AIMA)》 · 确立"理性 agent（感知-决策-行动以最大化目标）"的经典定义，所有后续 agent 的概念母版。 · https://aima.cs.berkeley.edu/
- S. Franklin, A. Graesser · 1997 · 《Is It an Agent, or Just a Program? A Taxonomy for Autonomous Agents》 · 前 LLM 时代"agent 最小定义"，提出区分 agent 与普通程序的四要件。 · https://doi.org/10.1007/BFb0013570
- V. Mnih 等 (DeepMind) · 2015 · 《Human-level control through deep reinforcement learning (DQN)》 · 从原始像素端到端学策略、在 49 款 Atari 达人类水平，LLM 之前的"RL agent"范式高点。 · https://www.nature.com/articles/nature14236
- R. Nakano, J. Schulman 等 (OpenAI) · 2021 · 《WebGPT: Browser-assisted question-answering with human feedback》 · LLM 早期"会用工具/与环境交互"的范式，符号/RL 向 LLM agent 过渡的先声。 · https://arxiv.org/abs/2112.09332
- Jason Wei 等 (Google) · 2022 · 《Chain-of-Thought Prompting Elicits Reasoning in Large Language Models》 · 分步推理提示解锁 LLM 多步推理，是 agent"思考"那一半的前置突破。 · https://arxiv.org/abs/2201.11903
- Long Ouyang, Jan Leike 等 (OpenAI) · 2022 · 《Training language models to follow instructions with human feedback (InstructGPT)》 · RLHF 对齐使模型可靠"听指令"，把自然语言目标转成可控行为的前置条件。 · https://arxiv.org/abs/2203.02155
- M. Ahn, B. Ichter 等 (Google) · 2022 · 《Do As I Can, Not As I Say: Grounding Language in Robotic Affordances (SayCan)》 · LLM 给"有用动作" + 可供性判"可行性"，自主性需被环境接地的早期范例。 · https://arxiv.org/abs/2204.01691
- Jason Wei 等 · 2022 · 《Emergent Abilities of Large Language Models》 · 提出"涌现能力"，为"为何现在才可用"的规模叙事提供论据（也引发争论）。 · https://arxiv.org/abs/2206.07682
- Shunyu Yao 等 (Princeton/Google) · 2022 · 《ReAct: Synergizing Reasoning and Acting in Language Models》 · 本节范式起点：thought-action-observation 交错循环，确立 LLM agent 标准控制回路。 · https://arxiv.org/abs/2210.03629
- Timo Schick 等 (Meta) · 2023 · 《Toolformer: Language Models Can Teach Themselves to Use Tools》 · 自监督学会何时调哪个 API，把"工具使用"内化进模型。 · https://arxiv.org/abs/2302.04761
- Noah Shinn 等 · 2023 (NeurIPS) · 《Reflexion: Language Agents with Verbal Reinforcement Learning》 · 不更新权重、用语言反思 + 情景记忆改进试错，确立"自我反思 + 记忆"核心能力。 · https://arxiv.org/abs/2303.11366
- R. Schaeffer, B. Miranda, S. Koyejo (Stanford) · 2023 (NeurIPS) · 《Are Emergent Abilities of Large Language Models a Mirage?》 · 反方：涌现可能是非线性度量造成的伪影，对规模-涌现叙事构成关键学术争论。 · https://arxiv.org/abs/2304.15004
- Joon Sung Park 等 (Stanford) · 2023 (UIST) · 《Generative Agents: Interactive Simulacra of Human Behavior》 · "记忆流 + 反思 + 规划"架构模拟 25 个可信行为 agent，奠定 cognitive architecture 思路。 · https://arxiv.org/abs/2304.03442
- Shunyu Yao 等 · 2023 (NeurIPS) · 《Tree of Thoughts: Deliberate Problem Solving with Large Language Models》 · 把 CoT 推广为对"思维"单元的树搜索，支持自评/前瞻/回溯。 · https://arxiv.org/abs/2305.10601
- Guanzhi Wang 等 (NVIDIA/Caltech) · 2023 · 《Voyager: An Open-Ended Embodied Agent with Large Language Models》 · Minecraft 首个 LLM 终身学习具身 agent：自动课程 + 可增长技能库 + 迭代自我修正。 · https://arxiv.org/abs/2305.16291
- Lei Wang 等 (RUC) · 2023 · 《A Survey on Large Language Model based Autonomous Agents》 · 种子综述：profile/memory/planning/action 统一构建框架，最常被引的定义性 survey。 · https://arxiv.org/abs/2308.11432
- Theodore R. Sumers, Shunyu Yao 等 · 2023 · 《Cognitive Architectures for Language Agents (CoALA)》 · 用模块化记忆 + 结构化动作空间 + 决策循环统一刻画"语言 agent"，把符号 agent 传统接回 LLM 时代。 · https://arxiv.org/abs/2309.02427
- Zhiheng Xi 等 (Fudan) · 2023 · 《The Rise and Potential of Large Language Model Based Agents: A Survey》 · 86 页"脑-感知-行动"框架综述，覆盖 single-agent/multi-agent 与人机协作。 · https://arxiv.org/abs/2309.07864
- Xingyao Wang 等 (UIUC) · 2024 · 《Executable Code Actions Elicit Better LLM Agents (CodeAct)》 · 用可执行 Python 代码作统一动作空间，较 JSON 工具字典约少 30% 步数、成功率更高；smolagents "code agent" 的理论依据。 · https://arxiv.org/abs/2402.01030
- Taicheng Guo 等 (Notre Dame/KAUST) · 2024 (IJCAI) · 《Large Language Model based Multi-Agents: A Survey of Progress and Challenges》 · 系统梳理 multi-agent 的环境/profiling/通信/能力增长机制与挑战。 · https://arxiv.org/abs/2402.01680
- A. Yehudai 等 · 2025 · 《A Survey on Evaluation of LLM-based Agents》 · 首批系统梳理 agent 评测：能力维度、benchmark 与框架，直指多步/有状态/交互式评测难题。 · https://arxiv.org/abs/2503.16416
- R. Sapkota, K. Roumeliotis, M. Karkee 等 · 2025 · 《AI Agents vs. Agentic AI: A Conceptual Taxonomy, Applications and Challenges》 · 区分"AI Agent"（窄任务自动化）与"Agentic AI"（multi-agent 协同/持久记忆/动态分解）。 · https://arxiv.org/abs/2505.10468
- Weinan Zhang, Zhuosheng Zhang 等 (SJTU) · 2026 · 《Externalization in LLM Agents: A Unified Review of Memory, Skills, Protocols and Harness Engineering》 · 把记忆/技能/协议/harness 工程统一到"外化"视角，为 harness 作为独立工程层（[[02]] 的定位）背书。 · https://arxiv.org/abs/2604.08224
- Gloriaameng · GitHub 综述仓库（持续更新）· 《Awesome-Agent-Harness》 · 把 harness 形式化为 H=(E,T,C,S,L,V) 六元组，汇集 110+ 论文 / 23 系统 / 9 挑战，是 harness 作为独立研究对象的社区索引。 · https://github.com/Gloriaameng/Awesome-Agent-Harness

### ✍️ 博客与工程文（优先一手）

- Lilian Weng (Lil'Log, OpenAI) · 2023-06-23 · 《LLM Powered Autonomous Agents》 · 导论必读的心智模型源头：agent = LLM 大脑 + 规划 + 记忆 + 工具，把 ReAct/Reflexion 串成统一框架。 · https://lilianweng.github.io/posts/2023-06-23-agent/
- Anthropic Engineering · 2024-12-19 · 《Building Effective Agents》 · 一手定义 workflow vs agent，给出五种 workflow 模式与"先用最简方案、别急着上框架"的反炒作主张。 · https://www.anthropic.com/engineering/building-effective-agents
- Hugging Face · 2024-12-31 · 《Introducing smolagents: simple agents that write actions in code》 · 主张 "code agent"（写 Python 调工具）优于 JSON 工具字典，核心约千行代码，把极简主义带入框架之争。 · https://huggingface.co/blog/smolagents
- Andrew Ng / DeepLearning.AI · 2024 · 《Four AI agentic workflow design patterns (Reflection / Tool use / Planning / Multi-agent)》 · 实干乐观派代表论据：agentic workflow 能让较弱模型反超，是真实的能力放大器。 · https://www.deeplearning.ai/the-batch/issue-242/
- Walden Yan (Cognition) · 2025-06-12 · 《Don't Build Multi-Agents》 · 与 Anthropic 同月唱反调：两条 context engineering 原则，主张单线程共享完整 trace + 微调小模型压缩历史。 · https://cognition.ai/blog/dont-build-multi-agents
- Anthropic Engineering · 2025-06-13 · 《How we built our multi-agent research system》 · 一手复盘 orchestrator-worker（Opus 4 lead + Sonnet 4 subagent），内部评测 +90.2%，但约 15× chat 的 token 成本。 · https://www.anthropic.com/engineering/multi-agent-research-system
- Harrison Chase (LangChain) · 2025-06-23 · 《The rise of context engineering》 · 把 context engineering 立为 AI 工程师核心技能：在正确时机以正确格式提供正确信息与工具。 · https://www.langchain.com/blog/the-rise-of-context-engineering
- Anthropic Engineering · 2025-09-29 · 《Effective context engineering for AI agents》 · 把 context 定义为有限资源，给出长程 agent 的 compaction/记忆/subagent 上下文管理系统方法。 · https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic Engineering · 2025-11-04 · 《Code execution with MCP: building more efficient agents》 · 指出连太多 MCP server 时工具定义可吃掉 5 万+ token，主张用代码执行调用 MCP 工具提效（例中 15 万→2 千 token）。 · https://www.anthropic.com/engineering/code-execution-with-mcp
- Cursor · 2025 · 《Best practices for coding with agents》 · 编码 agent 产品方一手实践：用 git worktree 让 multi-agent 并行隔离工作，"多模型攻同题再择优"提升困难任务。 · https://cursor.com/blog/agent-best-practices
- Gary Marcus (Marcus on AI) · 2025 · 《AI Agents: Hype versus Reality, redux》 · 泡沫论代表：agent 被无休止炒作但除窄场景外不可靠，长程误差累积是硬伤。 · https://garymarcus.substack.com/p/ai-agents-hype-versus-reality-redux
- METR · 2026-01-29 · 《METR Time Horizon 1.1》 · 用"时间地平线"量化长程能力的统一标尺：50% 成功率下 Opus 4.5≈320min、GPT-5≈214min，2024 起约 88.6 天翻一番。 · https://metr.org/blog/2026-1-29-time-horizon-1-1/

### 📚 官方文档

- OpenAI · 2025-04 · 《A Practical Guide to Building Agents》(PDF) · 从客户部署提炼：什么是 agent、何时该建、single-agent vs multi-agent 编排、分层 guardrails；single-agent 先做到极致再考虑 multi-agent。 · https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- Anthropic · 2024-11 · 《Introducing the Model Context Protocol (MCP)》 · 用开放协议解决工具集成 M×N 问题，标志 agent 基础设施走向标准化。 · https://www.anthropic.com/news/model-context-protocol

### 🎥 Talk / 播客

- Sequoia Capital × Harrison Chase (LangChain) · 2026-01 · 《Context Engineering Our Way to Long-Horizon Agents》(Training Data 播客，第 77 期) · agent/框架派论据：复盘从早期 scaffolding 到 harness 架构的演进，主张 harness 比模型更决定长程可靠性、context engineering 是核心技能；control↔autonomy 视作连续谱。 · https://www.sequoiacap.com/podcast/context-engineering-our-way-to-long-horizon-agents-langchains-harrison-chase/

---

> **交叉链接**：推理范式 [[01]] · Harness 运行时 [[02]] · 上下文工程 [[03]] · 工具与 MCP [[04]] · 规划与分解 [[05]] · 记忆 [[06]] · 检索/RAG [[07]] · multi-agent [[08]] · 评估 [[09]] · 可观测性 [[10]] · 生产工程 [[11]] · 安全与对抗 [[12]] · 大厂案例 [[13]] · 技术栈速查 [[14]] · 面试题库 [[15]] · 训练与强化学习 [[16]] · 互操作协议与 Agent 经济 [[17]]
