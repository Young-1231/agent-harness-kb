> 状态：🟢 已校验

# 08 · 多智能体编排（Multi-Agent Orchestration）

> **定位**：当 [[02]] 的单条 agent loop 不够用时，把多个 agent 组织起来协作的那一层。
> 上游是 [[01]] 的推理范式与 [[02]] 的 harness 运行时；本节专讲"多个循环怎么拼"——任务分解见 [[05]]，上下文如何切分见 [[03]]，跨 agent 记忆见 [[06]]，评测难点见 [[09]]，编排引发的安全面见 [[12]]，产品级案例见 [[13]]。

---

## 1. TL;DR / 速览

**本节地图**：定位与动机 → 历史脉络（2022 ReAct 到 2026 的关键里程碑）→ 核心原理（编排五型 + handoff/subagent/上下文隔离 + 共享状态 + 单写者原则）→ 方法谱系横向对比 → 四组核心争议 → 大厂案例（Anthropic / Cognition / OpenAI / LangGraph）→ 我的判断 → 面试考点 → 参考文献。

**5 条核心结论**：

1. **默认 single-agent，multi-agent 是有门槛的升级，不是默认架构。** OpenAI、Anthropic、Cognition 三家一线团队给开发者的第一建议高度一致：先把 single-agent（[[02]] 的 ReAct 循环）做到极限，被复杂度逼着才上 multi-agent（《A Practical Guide to Building Agents》, 2025；《Building Effective Agents》, 2024）。

2. **multi-agent 的增益与代价都是真实的，分界线是"任务形态"而非"对错"。** Anthropic 的 orchestrator-worker 在广度优先研究任务上比单体 Opus 4 高 **90.2%**，但烧掉约 **15×** 于聊天的 token（《How we built our multi-agent research system》, 2025）；Cognition 在高度互依的编码任务上得出相反结论。两者并不真正矛盾——只读/可并行 → multi-agent 赢；需共享演化状态 → 单线程赢。

3. **可靠性的根因是上下文工程，不是 agent 数量。** multi-agent 最高发的失败是"agent 间错位"（MAST 失败分类法，Cemri et al., 2025）。Cognition 的**单写者原则**（single-writer：只让一个 agent 改状态，其余只贡献"智能"不贡献"动作"）是当前最务实的处方。

4. **编排拓扑是一条光谱**：自由对话（AutoGen）↔ 显式状态图（LangGraph）↔ 单线程（Cognition），OpenAI 的 handoff + guardrails 居中。supervisor 中央路由准且可审计，swarm 去中心化快（实测端到端约 −40% 延迟）但难追踪。

5. **"辩论/集成"与"角色协作"是两条不同动机的路线，且都被质疑性价比。** 在等算力（thinking-token）预算下，multi-agent 辩论常常打不过单体 + self-consistency，增益更多来自模型异构而非辩论本身（Smit et al., 2023；Zhang et al., 2025）；Tran & Kiela（2026）用数据处理不等式给 single-agent 侧提供了最锋利的理论论据。

---

## 2. 定位与动机

single-agent（[[02]]）的内核是 ReAct 的 `reason → act → observe` 循环：一个模型、一段连续上下文、一条线性轨迹。**多智能体编排要解决的是这条单线轨迹撞上的三堵墙**：

- **上下文墙**：一个深度研究任务要读几十个网页，全塞进单一上下文窗口会爆，且"中间信息"会被淹没（[[03]] 的 context rot）。把搜索分给多个**独立上下文**的 subagent，能把"信息卫生"问题分而治之。
- **并行墙**：single-agent 的工具调用本质串行，N 个互不依赖的子问题只能一个个做。multi-agent 让"广度优先"探索真正并行，把墙钟时间（wall-clock）压下来。
- **专精墙**：一个通用 prompt 很难同时是"严谨的规划者 + 挑剔的审查者 + 高产的码农"。角色专业化（CAMEL/MetaGPT 路线）让每个 agent 带定制 system prompt、受限工具集、甚至不同模型档位。

**在 Agent 链路里的位置**：多智能体编排是 harness（[[02]]）之上的**组织层**。它复用 harness 的单循环作为"工人"，自己负责更高层的问题——谁负责什么（profiling）、谁跟谁说话（communication topology）、状态放哪（shared state）、何时停（termination）、结果怎么合（aggregation）。这正是 IJCAI 2024 survey（Guo et al.）给这个子领域画出的四张地图：profiling、communication、capability acquisition、orchestration。

但要先泼一盆冷水：**Anthropic《Building Effective Agents》明确把 multi-agent 列为"能不上就别上"的重型选项**——先用 workflow（预定义代码路径）和 single-agent，只有当任务确实"无法预测子任务、需要动态分解"时，才升级到 orchestrator-workers。本节后面的争议，本质都是在为"这条升级线该画在哪"吵架。

---

## 3. 历史发展脉络

> 一句话主线：**single-agent 原子（ReAct, 2022）→ 自主循环失控（AutoGPT, 2023）→ 两条并行路线：角色协作（CAMEL/AutoGen/MetaGPT）与 辩论/集成（Multi-Agent Debate）→ 生产编排（LangGraph/Agents SDK, 2024–25）→ 反思潮（MAST + Cognition vs Anthropic 隔日对撞, 2025）→ 收敛为"窄模式 + 协议层 + 框架整合"（2026）。**

| 年份 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **2022-10** | **ReAct**（Yao et al., arXiv 2210.03629） | 把"推理 + 行动"交织成一个循环，定义了 single-agent 的原子形态。multi-agent 的每个"工人"都继承这条循环——这是一切的零点。 |
| **2023-03** | **AutoGPT / BabyAGI 病毒式爆红** | "给个目标就走开"的全自动单循环引爆全网，却暴露不会澄清需求、目标漂移、死循环。这股挫败感直接催生"用角色/结构约束 agent"的下一步。 |
| **2023-03** | **CAMEL**（Li et al., KAUST, arXiv 2303.17760） | 首个角色扮演双 agent 框架（AI user + AI assistant），用 inception prompting 自驱协作。第一次把"分工"作为单体的替代方案提出——multi-agent 协作范式由此开端。 |
| **2023-04** | **Generative Agents / Smallville**（Park et al., Stanford+Google, arXiv 2304.03442） | 25 个带记忆-反思-规划的 agent 涌现出信息扩散、群体协调（情人节派对口口相传扩散）。把 multi-agent 从"工具"升格为"研究对象"，奠定 agent 社会范式。 |
| **2023-05** | **Multi-Agent Debate**（Du et al., MIT/Google, arXiv 2305.14325） | 多个 LLM 副本多轮辩论后收敛答案，显著提升事实性与推理。把 multi-agent 重新诠释为"推理/校验机制"而非角色扮演——开辟与"角色协作"并行的**第二条路线**。 |
| **2023-07/08** | **ChatDev / MetaGPT**（2307.07924 / 2308.00352） | 把人类公司 SOP 与流水线角色（PM-架构师-工程师-QA）编码进 agent，端到端产出可执行代码库。自由对话易各说各话，引入组织结构压制混乱——"让 multi-agent 可用"的关键工程化一步。 |
| **2023-08** | **AutoGen**（Microsoft, arXiv 2308.08155） | 通用"可对话 agent"框架，支持动态对话模式 + 工具/代码执行。把零散论文范式抽象成可编程基础设施，标志从"学术演示"转向"人人可搭的平台"。（2026-04 Microsoft Agent Framework 1.0 GA 将 AutoGen 与 Semantic Kernel 统一成一个栈，原 AutoGen 转维护态。） |
| **2024-01** | **LangGraph 发布**（LangChain） | 用有状态有向图（循环、条件分支、持久化、人类在环）做编排。生产要的是可靠可控有状态，而非靠巧妙 prompt 自由聊天——编排从"agent 互相对话"升级为"显式状态图"。 |
| **2024-02 / 06** | **More Agents Is All You Need**（Tencent, 2402.05120）+ **Mixture-of-Agents**（2406.04692） | 前者证明朴素采样投票随 agent 数单调涨；后者用纯 OSS 模型分层聚合在 AlpacaEval 2.0 打到 65.1% 超过 GPT-4-Omni。并行/集成确实带来真能力，不只是堆算力。 |
| **2024-10 → 2025-03** | **OpenAI Swarm（实验）→ Agents SDK（生产）** | 以 handoff（交接）为原语，补上 guardrails、tracing、会话管理。连大厂也收敛到"轻量 handoff + 护栏 + 可观测性"，multi-agent 进入工业化标准化阶段。 |
| **2025-03** | **MAST 失败分类法**（Cemri et al., UC Berkeley, arXiv 2503.13657, NeurIPS 2025） | 由约 150 条专家标注 trace（κ=0.88）归纳出 14 种失败模式 / 3 大类（规范缺陷、agent 间错位、校验缺失），再以 LLM-judge 把标注扩展成 1600+ 条的 MAST-Data（涵盖 7 框架 / 200+ 任务）；发现相对 single-agent 增益常很小。把领域从"能力叙事"扳向"可靠性叙事"。 |
| **2025-06-12/13** | **Cognition《Don't Build Multi-Agents》vs Anthropic《multi-agent 研究系统》** | 两家一线团队**隔日对垒**给出相反结论（单线程上下文工程 vs 编排-工人并行）。本节最核心的工程辩论锚点。 |
| **2025-05 / 2026-04** | **Google A2A 协议**（2025-04 发布）+ **Cognition《Multi-Agents: What's Actually Working》**（2026） | A2A 把 multi-agent 从"单框架编排"上推到"跨厂协议层"互操作；Cognition 反转立场，给出"写操作单线程、辅助 agent 只贡献智能"的窄模式生产结论。 |
| **2026 H1** | **A2A 一周年（2026-04）· MAF 1.0 GA（2026-04）· Anthropic《Harness design》（2026-03）· Tran & Kiela（2604.02460）** | 协议层固化 + 框架整合 + single-agent 实证反扑同时发生：**A2A 满一周年**坐实"跨厂协议层"（Linux Foundation 治理、150+ 组织、v1.0 首个稳定规范、Azure/AWS Bedrock AgentCore/Google Cloud 三云生产）；**Microsoft Agent Framework 1.0 GA** 把 AutoGen + Semantic Kernel 统一成一个栈、二者转维护态，结束微软多框架分裂；Anthropic**《Harness design for long-running apps》**给出 planner/generator/evaluator 三 agent + GAN 式 generator-evaluator 的长程编排骨架；**Tran & Kiela（2604.02460）**锁定等 thinking-token 预算、用数据处理不等式给 single-agent 侧最锋利的实证反扑。三股力量把本节主线收紧为"窄模式 + 协议层 + 框架整合"。 |

---

## 4. 核心概念与原理

### 4.1 五种编排模式（按"输出是否需要聚合"与"控制流是否预定义"切）

```
                         control flow
            预定义代码路径 ───────────────► LLM 动态决定
  顺序流水线           supervisor/层级           自由对话/swarm
 (ChatDev/MetaGPT)    (LangGraph supervisor)     (AutoGen/Swarm)
        │                    │                        │
        └──── 并行/集成 (orchestrator-worker, MoA, 采样投票) ────┘
                            辩论/同侪互评 (Du, Liang)
```

1. **顺序流水线（Sequential pipeline）**：角色按 SOP 依次接力（PM→架构→编码→测试）。优点是结构清晰、可压制级联幻觉；缺点是僵化、错误会沿管线放大。代表：ChatDev、MetaGPT。
2. **supervisor / 路由（最常见的生产拓扑）**：一个中央 orchestrator 收所有消息、分类意图、派给专才、控制权回中心。"路由是它唯一职责"故更准、可审计；代价是每次 handoff 多一跳"翻译"、累加延迟。代表：LangGraph supervisor。
3. **层级（Hierarchical / supervisor-of-supervisors）**：supervisor 嵌套成团队的团队，应对大型任务。
4. **并行 / 集成（Parallel / ensemble）**：orchestrator 把任务拆成互不依赖的子任务并行 spawn（Anthropic），或同一问题多次采样后投票（More Agents），或分层聚合异构模型（MoA）。核心是"输出要被聚合"。
5. **辩论 / 同侪互评（Debate）**：多个 agent 提出并互相证伪，多轮后收敛。动机是**校验与纠错**，不是分工。

> ★关键区分：模式 1–3 是"角色协作（分工）"路线，模式 5 是"辩论/集成（校验）"路线。二者动机不同，别混为一谈。

### 4.2 三个原语：handoff vs subagent vs 上下文隔离

- **handoff（交接）**：把控制权**无状态地**移交给另一个专才。OpenAI Swarm 的心智模型最小：`Agent = system prompt + 工具列表`，`handoff = 一个返回另一个 Agent 的函数`。移交后原 agent 退出，专才接管后续——路由本身就是流程。
- **subagent**：lead agent **spawn** 一个带独立上下文的工人，工人干完把**结果**（而非完整轨迹）回灌给 lead。Anthropic 与 Claude Code 用它做"上下文卫生"——把会淹没主对话的搜索/日志放进子上下文，只回摘要。
- **上下文隔离 vs 共享**：subagent 的独立窗口让并行探索不污染主上下文（Anthropic 的主张），但代价是丢失中间决策、可能产生互相冲突的隐含假设（Cognition 的反对）。

```python
# handoff（去中心化）：控制权转移，状态不带走
def transfer_to_refund_agent():
    return refund_agent           # 返回另一个 Agent → 框架据此切换

# 子 agent（编排-工人）：spawn 工人、只取结果
def lead_agent(query):
    plan = llm.plan(query)                       # lead 规划
    subtasks = decompose(plan)                   # 拆成互不依赖的子任务
    results = parallel_map(                       # ★ 并行 spawn，独立上下文
        lambda t: subagent.run(t, ctx=isolate()),
        subtasks)
    draft  = llm.synthesize(results)             # 汇总
    return citation_agent.run(draft)             # 单独 citation pass
```

### 4.3 共享状态与"单写者原则"

谁能改全局状态，是 multi-agent 可靠性的命门。两种主流做法：

- **显式共享状态（LangGraph）**：一个带类型的图状态（typed graph state）+ checkpoint，所有 agent 读写同一份结构化状态，可持久化、可恢复、可人类在环。
- **消息传递 / 黑板（blackboard）**：agent 间靠消息或共享内存通信，更灵活但更易错位。

**Cognition 的单写者原则（single-writer）**：保持"动作"单线程——**只让一个 agent mutate 状态**，其余 agent 只贡献"智能"（读、建议、审查）不贡献"冲突的写"。理由是"动作隐含决策"（actions carry implicit decisions）：两个并行 subagent 各自做出未明说的风格/接口假设，合并即灾难（著名的 Flappy Bird 例子——一个 subagent 画马里奥风背景，另一个画不搭的鸟）。MAST 把这类问题归为头号失败大类"inter-agent misalignment"，与之呼应。

### 4.4 终止与评测

何时停、几轮收敛，本身是编排难题（MAD 论文专门研究"自适应终止"）。评测尤其棘手：multi-agent 是非确定性系统，轨迹长、分叉多。Anthropic 的务实起步法值得抄：**用 LLM-as-judge + ~20 条代表性 query 起步做 eval，再用人测抓边角 case**（详见 [[09]]）。

---

## 5. 主流方法谱系

| 方案 | 拓扑 | 控制流 | 上下文 | 代表系统 | 最适场景 | 主要风险 |
|---|---|---|---|---|---|---|
| **顺序流水线** | 链式角色 | 预定义 SOP | 沿管线传递 | ChatDev / MetaGPT | 流程固定的"软件公司"式产出 | 僵化、级联幻觉放大 |
| **Supervisor 路由** | 中央星形 | 代码/LLM 混合 | 中央汇聚 | LangGraph supervisor | 意图分类 + 专才委派（客服/工单） | 每跳加延迟、中央成瓶颈 |
| **层级团队** | supervisor 嵌套 | 代码为主 | 分层汇聚 | LangGraph hierarchical | 超大任务、需组织结构 | 协调开销大、调试难 |
| **Handoff / Swarm** | 去中心化对等 | LLM 自主 | 随交接传递/重置 | OpenAI Swarm/Agents SDK | 动态路由、对话式接管 | 控制分散、难追踪 |
| **Orchestrator-Worker** | 一对多并行 | LLM 动态拆 | **隔离**子上下文 | Anthropic Research | 广度优先、只读、可并行研究 | ~15× token、同步派发成瓶颈 |
| **MoA / 采样投票** | 分层/扁平集成 | 代码固定 | 各自独立 | Mixture-of-Agents | 能力增强、聚合多模型 | 算力翻倍、延迟叠加 |
| **辩论 / 同侪互评** | 全连接对等 | 轮次固定/自适应 | 各自 + 互读 | Du / Liang MAD | 重校验的事实/数学题 | 性价比存疑、可能"不公正裁判" |
| **单线程 + 辅助** | 线性主轴 + 旁路 | 单写者 | 共享完整 trace | Cognition / Devin | 高度互依的编码、写操作 | 不能真正并行、上下文会涨 |

> 选型一句话：**输出要"聚合" → 并行/集成/辩论；输入要"路由" → supervisor/handoff；任务"互依需共享演化状态" → 单线程 + 辅助。**

---

## 6. 主流观点与争议

### 争议一（★核心★）：multi-agent 在真实产品里净有用，还是净脆弱？

- **【有用·Anthropic】**《How we built our multi-agent research system》（2025-06-13）：orchestrator-worker（lead Opus 4 规划 → 并行 spawn 3–5 个 Sonnet 4 subagent → 汇总 → 单独 citation pass）让 Claude Research 比单体 Opus 4 高 **90.2%**；token 用量解释了 **80%** 的性能方差，并行把复杂查询研究时间最多砍 **90%**。适用：广度优先、超出单上下文窗口、重并行工具调用的研究任务。代价坦白：约 **15×** 于聊天的 token，只对"高价值任务"划算——并**明确承认编码等高度互依任务不适合 multi-agent**。
- **【脆弱·Cognition / Walden Yan】**《Don't Build Multi-Agents》（2025-06-12）：并行 subagent 割裂上下文、做出互相冲突的隐含决策 → 产出脆弱（Flappy Bird 例子）。两原则：①共享完整 agent trace 而非孤立消息；②动作隐含决策，冲突即坏结果。处方：默认单线程，溢出就用压缩模型摘要历史，subagent 只留给"答案不需要进主历史"的明确子问题。
- **谁对**：Anthropic（research 团队）vs Cognition（Devin 母公司）。隔日对垒看似针锋相对，**深层其实可调和**——双方都同意边界在"任务形态"：只读/广度优先/可并行 → multi-agent 赢；高度互依/需共享上下文的编码 → 单线程赢。Anthropic 自己也把编码列为 multi-agent 的差场景，恰好是 Cognition 的主战场。**第三方评注**（Simon Willison, 2025）点出：所谓"协调"很大程度上就是把委派边界写清楚的 prompt 工程。

> 📦 **结案框（single-agent vs multi-agent：任务形态之争）**：提出 → 2026 定论 → 现状
> - **提出（2025-06）**：Anthropic《multi-agent 研究系统》的 orchestrator-worker 在广度优先研究上比单体 Opus 4 **+90.2%**（代价约 **15×** 于聊天的 token、token 用量解释 80% 性能方差）；次日 Cognition《Don't Build Multi-Agents》给出相反结论（单线程 + 单写者，Flappy Bird 冲突案例）。隔日对撞成为本节锚点。
> - **2026 定论**：不是"谁对错"，而是"任务形态"分界——**只读 / 广度优先 / 可并行 → multi-agent 赢；互依 / 需共享演化状态的写入 → 单线程赢**。Tran & Kiela《Single-Agent > Multi-Agent on Multi-Hop》（arXiv 2604.02460）在**等 thinking-token 预算**下证 single-agent 在多跳推理反超，并用数据处理不等式给出机理（每次 handoff 只会丢信息）——把"multi-agent 更强"的旧结论限定在"算力未对齐"的语境里。
> - **现状**：multi-agent 已瘦身为两类窄模式（只读广度并行 + 只贡献智能不贡献动作的旁路）；"单 vs 多"的二元问法正让位给"上下文怎么切"（[[03]]），跨厂协作上移到协议层（[[17]]）。

### 争议二：辩论/集成是真提升推理，还是昂贵的表演？

- **【提升·Du/Tenenbaum/Mordatch, MIT/Google】**Multi-Agent Debate（2305.14325）：多 LLM 多轮辩论显著改善数学/事实性、减少幻觉，可直接套黑盒模型。Liang et al.（2305.19118）补上裁判与 tit-for-tat 对抗"思维退化"。
- **【质疑·Smit et al. / Zhang et al. / Cemri et al.】**《Should we be going MAD?》（2311.17371）系统对比发现辩论**不可靠地优于** self-consistency；《Stop Overvaluing MAD》（2502.08788）评测 5 种 MAD × 9 benchmark × 4 模型，结论是**同构辩论几乎打不过 self-consistency，增益主要来自模型异构**；MAST（2503.13657）实证 multi-agent 相对强单体增益常很小却付数倍 token。
- **谁对**：辩论派 vs 实证怀疑派。共识正在形成：**辩论的价值更多在"引入异构视角"而非"辩论动作本身"**。

### 争议三：上下文该隔离，还是共享完整 trace？

- **【隔离·Anthropic / Cursor】**subagent 独立窗口让并行探索不污染 lead；Cognition 自己在 2026 的 code-review loop 里也发现**审查 agent 不带前文反而更好**（context rot——短上下文改善注意力分配）。
- **【共享·Cognition 2025】**单写者 + 共享完整 trace，否则 miscommunication 累积。
- **谁对**：有意思的是 **Cognition 前后两篇自相"翻转"**——2025 说共享、2026 说审查场景该隔离。真正的判据是："context rot 主导时隔离，miscommunication 主导时共享"，至今无统一理论。

### 争议四：编排该 LLM 自主（handoff）还是代码控制（确定性）？

- **【via LLM】**用 tools + handoffs 让模型自主规划，最灵活，适合开放式/动态路由（OpenAI decentralized、Swarm）。
- **【via code】**结构化输出 + 链式 + 并行，在速度/成本/性能上更确定可预测，适合结构化流程（OpenAI manager 模式、LangGraph 状态图）。
- **谁对**：OpenAI Agents SDK 文档把这对张力直接摆成两条官方路线；AutoGen/CAMEL 偏自由对话涌现派，LangGraph/Cognition 偏显式控制派，OpenAI 居中（handoff 但加护栏 + tracing）。

---

## 7. 大厂工程实践

### 案例 A：Anthropic Claude Research（orchestrator-worker 标杆）

**架构**：lead agent（Opus 4）拆解查询 → 并行 spawn 3–5 个带**独立上下文**和**显式目标/边界 prompt** 的 subagent（Sonnet 4）→ 汇总 → 独立 citation pass 补引用。

**工程取舍**：
- **明知 token 是 chat 的 ~15×（single-agent 仅 ~4×）仍上 multi-agent**，因为研究任务"价值高到付得起"，且 token 扩展几乎线性换性能（解释 80% 方差）。这是一条清醒的"经济学决策"，不是技术崇拜。
- **委派 prompt 的质量是首要可靠性杠杆**——subagent 拿到的"目标 + 边界 + 输出格式"写得好不好，直接决定不重不漏。
- **当前瓶颈是 lead 同步派发 subagent**；异步能加并行度，但会引入协调与一致性复杂度（Anthropic 明确点名为开放问题）。
- **生产可靠性靠**：full tracing（只看决策模式不看对话内容以兼顾隐私）+ rainbow 部署 + checkpoint 恢复（这套生产工程化骨架见 [[11]]）。

### 案例 B：Cognition Devin（单线程 → 窄模式的真实演进）

从《Don't Build Multi-Agents》（2025）到《Multi-Agents: What's Actually Working》（2026），Cognition 的立场不是"翻烧饼"而是**收窄了适用域**：

- **写操作始终单线程**——额外 agent 只能贡献"智能"，不能贡献"动作"。
- 三个被验证可行的窄模式：① **code-review loop**（无前文的审查 agent，平均每 PR 抓 2 个 bug、约 58% 为严重；反直觉地"不共享初始上下文"更好，因 context rot）；② **smart friend**（小模型按需调用前沿模型做难决策，本质是能力路由器）；③ **manager-child 委派**（必须重度 context engineering 防"过度规定"）。
- 形态收敛为 **map-reduce-and-manage**：manager 拆活、children 执行、manager 综合回报。结论：那种"任意 agent 互相谈判的无结构 swarm"基本是干扰项。半年间 Devin 企业用量 8×。

### 案例 C：OpenAI Agents SDK / Swarm（工业化收敛）

Swarm（2024-10）定位**教育性**、stateless、每次 `run()` 从头跑，被 Agents SDK（2025-03）取代。生产版补上 guardrails + tracing + 会话管理 + TS 支持。给开发者的默认建议很克制：**先 single-agent，复杂度逼你才上 multi-agent**；上 multi-agent 时在 **manager（边=工具调用，聚合专才）** 与 **decentralized（边=handoff，专才接管）** 之间按"结构化 vs 动态路由"二选一。

### 案例 D：LangGraph / Deep Agents（把编排做成可选架构）

LangGraph 文档把 **Supervisor（准、可审计、但每跳加延迟）vs Swarm（用 `Command(goto)` 直接移交、跳过中介、实测端到端约 −40% 延迟、更少 LLM 调用、但分散难追踪）** 摆成明确权衡。2026 的 Deep Agents 进一步把规划/上下文管理/文件系统/subagent spawn 打包成开箱即用，解决"每次从裸 LangGraph 重新接线"的工程重复成本。更上一层，**Google A2A 协议**（2025）把互操作推到协议层，让 ADK/LangGraph/CrewAI 等不同框架、不同厂商的 agent 互相通信——这条"跨厂协议层"主线（A2A 一周年、Linux Foundation 治理、150+ 组织、v1.0 首个稳定规范）已自成一节，详见 [[17]] 互操作协议与 Agent 经济（另见 [[13]]、[[14]]）。

---

## 8. 我的分析与判断

> **以下为分析观点（非客观事实），是我基于上述材料的独立研判。**

**趋势研判。** 我判断三件事是确定的方向：

1. **"multi-agent vs single-agent"这个二元问法会过时，被"上下文怎么切"取代。** LangChain 的调和最接近本质——真正的杠杆是 **context handoff（上下文如何在边界上传递）**，agent 数量只是它的副产品。Anthropic 的"隔离子上下文"和 Cognition 的"共享 trace 单写者"看似对立，其实是同一道题（如何在并行度与一致性之间取舍）的两个解。未来赢家不是站队哪一派，而是能**按子任务动态选择隔离 or 共享**的系统。
2. **multi-agent 已"瘦身"成两类窄形态**：（a）**只读的广度并行**（research/检索 fan-out），（b）**只贡献智能不贡献动作的旁路**（code-review、smart-friend 能力路由）。Cognition 2026 把生产形态收敛为 **map-reduce-and-manage** 窄模式、Anthropic 2025 收敛为 orchestrator-worker，两家不约而同落到这两类，绝非巧合——它们恰好绕开了"多写者冲突"这个根本矛盾。那种"5–6 个 agent 平等协商写同一个 repo"的科幻图景，在可预见的将来是**反模式**。
3. **协议层（A2A/MCP）与编排层已分离**。MCP（[[04]]）解决"agent↔工具"，A2A 解决"agent↔agent"（协议层与 agent 经济自成一节，见 [[17]]）。随着跨厂 agent 互操作标准化落地（A2A 一周年并入 Linux Foundation 治理、150+ 组织、v1.0 首个稳定规范），"单框架内编排"的护城河正在变窄，价值上移到**可观测性（[[10]]）、评测（[[09]]）、上下文工程（[[03]]）、生产工程（[[11]]）**这些横切层——这与 [[02]] 里"核心 loop 被厂商商品化"的判断同源。
4. **编排（推理期）之外还有一条正交路径：训练侧（[[16]]）**。本节谈的全是"怎么把现成的循环拼起来"——属于推理期编排；让 single-agent/multi-agent 的协作、工具使用与角色专精变强，还可以从 agentic RL 直接训练（见 [[16]]），二者互补而非替代。把 multi-agent 的能力增益完全归给"编排花样"，会忽略"训练让 single-agent 直接变强"这条更省 token 的路（与 Tran & Kiela 的实证反扑同向）。

**常见坑（我见过/推断的高频翻车点）：**

- **把 token 当免费的。** multi-agent 默认就是 10–15× 成本。没有"任务价值 > 成本"的明确账，上 multi-agent 就是给老板烧钱。先问"这个查询值不值 15× token"。
- **委派 prompt 写得含糊。** subagent 不重不漏全靠"目标 + 边界 + 输出 schema"。含糊的委派 = subagent 各自脑补 = MAST 的 inter-agent misalignment。
- **盲目并行写操作。** 这是 Flappy Bird 灾难的根源。**任何会 mutate 共享状态的动作都应单线程化**，这条几乎没有例外。
- **拿辩论当银弹。** 在等算力预算下，先试"单体 + self-consistency 投票"，打不过再考虑辩论；且优先引入**异构模型**而非同构副本。
- **没有 compute-controlled 评测。** 不锁 token 预算去比单 vs 多，得到的"multi-agent 更强"很可能只是算力混淆（Tran & Kiela 的核心警告）。

**最佳实践（我的处方）：**
1. **默认 single-agent**，把 [[02]] 的循环、[[03]] 的 compaction 做到极限再说。
2. 升级到 multi-agent 前过三道闸：**子任务真的互不依赖吗？上下文能干净切分吗？任务价值付得起 N× token 吗？** 三个都"是"才上。
3. **首选 supervisor + 单写者**：中央可审计、写操作单线程，辅助 agent 只读只建议。
4. **从一开始就做 tracing 和 compute-controlled eval**——multi-agent 的 bug 不可观测就无法归因（MAST 的 14 种失败模式大多需要轨迹级回放才能定位）。

---

## 9. 面试考点

**概念题**

1. **single-agent vs multi-agent 怎么选？** 要点：默认 single-agent；multi-agent 只在"子任务独立 + 上下文可干净切分 + 任务价值付得起 ~10–15× token"时才赢。引数据：Anthropic +90.2%/15× token；Tran & Kiela 在等 token 预算下 single-agent 反超（数据处理不等式：每次 handoff 只会丢信息）。分界是任务形态（只读并行 vs 互依写入），不是绝对对错。

2. **列举并区分主流编排拓扑。** 要点：顺序流水线（ChatDev/MetaGPT）、supervisor 路由（最常见）、层级团队、handoff/swarm（去中心化）、orchestrator-worker 并行、辩论/集成。再点出"角色协作（分工）"与"辩论/集成（校验）"是两条不同动机的路线。

3. **handoff、subagent、上下文隔离三者的区别？** 要点：handoff = 无状态控制权转移（Swarm，路由即流程）；subagent = spawn 独立上下文工人、只回结果（Anthropic，做信息卫生）；上下文隔离 = 并行不污染但丢中间决策，对立面是 Cognition 的"共享完整 trace + 单写者"。

4.（陷阱）**multi-agent 辩论一定比 single-agent 强吗？** 要点：不一定。等算力下常打不过 self-consistency，增益多来自模型异构而非辩论本身（Smit 2023；Zhang 2025）。

**系统设计题**

5. **设计一个深度研究 agent（输入一个开放问题，产出带引用的报告）。** 要点：orchestrator-worker——lead 规划并拆成互不依赖的子查询 → 并行 spawn 带独立上下文 + 明确目标/边界 prompt 的 subagent → 汇总 → **单独 citation pass** 补引用。可靠性：LLM-as-judge + ~20 query 起步做 eval、full tracing、checkpoint 恢复。坦白成本：~15× token，靠"任务高价值"justify。说清为何**不**把它做成多写者并行（会冲突）。

**手写题**

6. **手写一个 supervisor 路由循环。** 评分点：中央 LLM 分类意图 → 选 worker → 调用 → 结果回中心 → 判断是否完成 → 循环；带 `max_turns` 兜底、终止条件、单写者状态。

```python
def supervisor(query, workers, state, max_turns=10):
    state["task"] = query
    for _ in range(max_turns):
        decision = router_llm(state)              # 分类意图，选下一步
        if decision.done:
            return decision.answer
        w = workers[decision.worker]              # 路由到专才
        result = w.run(decision.subtask, read_only_view(state))  # 只读视图
        state = merge(state, result, writer="supervisor")        # ★ 单写者
    return finalize(state)                          # max_turns 兜底
```

**陷阱题**

7. **"agent 越多越好"对吗？** 要点：错。MAST 14 种失败模式显示增益常 marginal 却付数倍 token；最高发失败是 inter-agent misalignment。More Agents 的单调增益只在"朴素采样投票"这一窄设定成立，不能外推到协作写入。

8. **两个 subagent 并行改同一个文件会怎样？** 要点：隐含决策冲突（Flappy Bird）。处方：单写者原则——写操作单线程，其余 agent 只贡献智能不贡献动作。

---

## 10. 参考文献

### 📄 论文

- **ReAct: Synergizing Reasoning and Acting in Language Models** — Yao et al., 2022（ICLR 2023）· <https://arxiv.org/abs/2210.03629> · single-agent 的 reason-act-observe 循环，multi-agent 每个工人的内核。
- **Reflexion: Language Agents with Verbal Reinforcement Learning** — Shinn et al., 2023（NeurIPS）· <https://arxiv.org/abs/2303.11366> · 言语反思 + 情景记忆，single-agent 用它替代"批判 agent"。
- **CAMEL: Communicative Agents for "Mind" Exploration** — Li et al. (KAUST), 2023（NeurIPS）· <https://arxiv.org/abs/2303.17760> · 首个角色扮演双 agent 框架，角色协作范式起点。
- **Generative Agents: Interactive Simulacra of Human Behavior** — Park et al. (Stanford+Google), 2023（UIST）· <https://arxiv.org/abs/2304.03442> · 25-agent Smallville 涌现社会协调，agent 社会范式。
- **Improving Factuality and Reasoning through Multiagent Debate** — Du et al. (MIT/Google), 2023（ICML 2024）· <https://arxiv.org/abs/2305.14325> · 多 LLM 多轮辩论提升事实性，"辩论"路线锚点。
- **Encouraging Divergent Thinking in LLMs through Multi-Agent Debate (MAD)** — Liang et al., 2023（EMNLP 2024）· <https://arxiv.org/abs/2305.19118> · 加裁判与 tit-for-tat 对抗"思维退化"，研究自适应终止。
- **Should we be going MAD? A Look at Multi-Agent Debate Strategies** — Smit et al., 2023（ICML 2024）· <https://arxiv.org/abs/2311.17371> · 系统对比：辩论不可靠地优于 self-consistency，早期严谨怀疑者。
- **Stop Overvaluing Multi-Agent Debate** — Zhang et al., 2025 · <https://arxiv.org/abs/2502.08788> · 5 MAD × 9 benchmark × 4 模型：增益主要来自模型异构而非辩论本身。
- **ChatDev: Communicative Agents for Software Development** — Qian et al. (OpenBMB), 2023（ACL 2024）· <https://arxiv.org/abs/2307.07924> · 虚拟软件公司 + chat-chain，顺序流水线编排范例。
- **MetaGPT: Meta Programming for a Multi-Agent Collaborative Framework** — Hong et al., 2023（ICLR 2024）· <https://arxiv.org/abs/2308.00352> · 把人类 SOP 编码进 agent，流水线角色压制级联幻觉。
- **AutoGen: Multi-Agent Conversation Framework** — Wu et al. (Microsoft), 2023 · <https://arxiv.org/abs/2308.08155> · 通用可对话 agent 框架，自由对话涌现派基础设施。
- **AgentVerse: Facilitating Multi-Agent Collaboration** — Chen et al. (OpenBMB), 2023（ICLR 2024）· <https://arxiv.org/abs/2308.10848> · 按任务动态招募/重组专家，证明 group 可超 single-agent。
- **More Agents Is All You Need** — Li et al. (Tencent), 2024（TMLR）· <https://arxiv.org/abs/2402.05120> · 采样投票（Agent Forest）随 agent 数单调涨，并行集成的 scaling 结果。
- **Mixture-of-Agents Enhances LLM Capabilities** — Wang et al., 2024（ICLR 2025）· <https://arxiv.org/abs/2406.04692> · 分层聚合纯 OSS 模型在 AlpacaEval 2.0 达 65.1% 超 GPT-4-Omni。
- **LLM-based Multi-Agents: A Survey of Progress and Challenges** — Guo et al., 2024（IJCAI）· <https://arxiv.org/abs/2402.01680> · 基础 survey：profiling/communication/capability/orchestration 四张地图。
- **A Survey on LLM-based Multi-Agent System: Recent Advances and New Frontiers in Application** — Chen et al. (HIT), 2024 · <https://arxiv.org/abs/2412.17481> · 应用向 survey，覆盖编排模式与通信拓扑到 2024 底。
- **Why Do Multi-Agent LLM Systems Fail? (MAST)** — Cemri et al. (UC Berkeley), 2025（NeurIPS 2025）· <https://arxiv.org/abs/2503.13657> · 首个失败分类法：14 模式 / 3 大类，把领域扳向可靠性。
- **Single-Agent LLMs Outperform Multi-Agent Systems on Multi-Hop Reasoning Under Equal Thinking Token Budgets** — Tran & Kiela (Stanford), 2026 · <https://arxiv.org/abs/2604.02460> · 锁定 thinking-token 预算后 single-agent 反超，用数据处理不等式论证"每次 handoff 只丢信息"。

### ✍️ 博客与工程文

- **How we built our multi-agent research system** — Anthropic Engineering, 2025 · <https://www.anthropic.com/engineering/multi-agent-research-system> · orchestrator-worker 标杆；+90.2%、~15× token、研究时间 −90%、token 解释 80% 方差。
- **Building Effective Agents** — Anthropic, 2024 · <https://www.anthropic.com/engineering/building-effective-agents> · 编排"宪法"：分清 workflows vs agents，给出 orchestrator-workers，主张"能不上框架/multi-agent 就别上"。
- **Don't Build Multi-Agents** — Cognition (Walden Yan), 2025 · <https://cognition.ai/blog/dont-build-multi-agents> · 反方一手立场：共享完整 trace + 单线程写；Flappy Bird 案例。
- **Multi-Agents: What's Actually Working** — Cognition, 2026 · <https://cognition.ai/blog/multi-agents-working> · 反转后的窄模式结论：写单线程、辅助 agent 只贡献智能；code-review/smart-friend/manager-child 三可行模式。
- **How and when to build multi-agent systems** — LangChain, 2025 · <https://www.langchain.com/blog/how-and-when-to-build-multi-agent-systems> · 用上下文工程调和争议：真正的杠杆是 context handoff 而非 agent 数。
- **A Practical Guide to Building Agents** — OpenAI, 2025 · <https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf> · single vs multi 分类学；manager vs decentralized 两范式；先 single-agent 起步。
- **Anthropic multi-agent 研究系统（评注）** — Simon Willison, 2025 · <https://simonwillison.net/2025/Jun/14/multi-agent-research-system/> · 第三方评注：点出隔日对撞语境，强调"协调 = 委派边界的 prompt 工程"。

### 📚 官方文档

- **Orchestrating multiple agents** — OpenAI Agents SDK Docs, 2025 · <https://openai.github.io/openai-agents-python/multi_agent/> · via LLM vs via code 两条路线；Agents-as-Tools vs Handoffs 两模式。
- **openai/swarm** — OpenAI, 2024 · <https://github.com/openai/swarm> · 教育性极简原语：Agent = prompt + 函数，handoff = 返回另一 Agent 的函数；已被 Agents SDK 取代。
- **Multi-agent architectures (supervisor vs swarm)** — LangGraph Docs, 2025 · <https://langchain-ai.github.io/langgraph/concepts/multi_agent/> · supervisor（准/可审计/加延迟）vs swarm（`Command(goto)` 直接移交/约 −40% 延迟）权衡。
- **langgraph-supervisor** — LangChain, 2025 · <https://github.com/langchain-ai/langgraph-supervisor-py> · supervisor 模式生产参考实现，可嵌套成层级团队。
- **Create custom subagents** — Claude Code Docs (Anthropic), 2025 · <https://code.claude.com/docs/en/sub-agents> · subagent 作"上下文卫生"工具：独立窗口 + 受限工具 + 可路由 Haiku 4.5 控成本，只回摘要。
- **smolagents** — Hugging Face, 2025 · <https://github.com/huggingface/smolagents> · 代码优先轻量框架，CodeAgent 把动作写成 Python；multi-agent 走 managed agent 组合。
- **Announcing the Agent2Agent Protocol (A2A)** — Google Developers Blog, 2025 · <https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/> · 跨厂 agent 互操作协议，把编排推到协议层（现归 Linux Foundation 治理）。

### 🎥 Talk

- **What's next for AI agentic workflows** — Andrew Ng, Sequoia AI Ascent 2024 · <https://www.youtube.com/watch?v=sal78ACtGTc> · 用 self-reflection / tool use / multi-agent collaboration 等设计模式论证 agentic workflow 的能力跃升，multi-agent 协作的高人气科普锚点。

---

> 交叉链接：[[00]] 心智模型 · [[01]] 推理范式 · [[02]] Harness 运行时 · [[03]] 上下文工程 · [[05]] 规划与任务分解 · [[06]] 记忆系统 · [[09]] 评估 · [[10]] 可观测性与调试 · [[11]] 生产工程 · [[12]] 安全与对抗 · [[13]] 大厂案例 · [[14]] 技术栈速查 · [[15]] 面试题库 · [[16]] Agent 训练与强化学习 · [[17]] 互操作协议与 Agent 经济
