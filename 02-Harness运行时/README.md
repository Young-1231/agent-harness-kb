> 状态：🟢 已校验

# 02 · Harness 运行时（The Agent Runtime）

> **定位**：把 [[01]] 里讲的"思考范式"（ReAct / Reflexion / 推理模型）真正跑起来的那层引擎。
> 上游是 [[00]] 的心智模型与 [[01]] 的推理范式；本节专讲"循环怎么转"，工具设计细节在 [[04]]，上下文压缩在 [[03]]，多智能体编排在 [[08]]。

---

## 1. TL;DR / 速览

**本节地图**：定位与动机 → 历史脉络（2022 ReAct 到 2026 Anthropic 长跑 harness / Managed Agents 的 18 个里程碑）→ 核心原理（agent loop 五步 + tool-call 全链路 + 停止条件 + 错误恢复 + 流式 + 权限层级）→ 方法谱系横向对比 → 五组争议 → 四个大厂案例 → 我的判断 → 面试考点 → 参考文献。

**5 条核心结论**：

1. **Harness 就是"LLM 在循环里调用工具"的那段宿主代码**。它本身不含智能，但决定了智能能发挥到几成——Anthropic 把它定义为 `environment + tools + system prompt` 三要素（《Building Effective Agents》, 2024）。
2. **所有现代 harness 的内核都是 ReAct 那个 `reason → act → observe` 循环**（Yao et al., 2022）。从 LangChain 到 OpenAI Agents SDK Runner，区别只在"谁拥有循环、状态存哪、何时停"。
3. **动作表示出现两条路线之争**：结构化 JSON / function-calling（可校验、易加权限）vs `code-as-action`（可组合、省上下文，CodeAct 实测成功率最高 +20%）。2025 年后头部实验室两头都做，趋势是"简单受控用 JSON、复杂多工具用代码"。
4. **可靠性的真正高发失败区不在模型，在 harness**：停止条件、错误重试、上下文压缩、持久化状态。τ-bench 用 `pass^k` 揭示——能力达标的 agent 在重复试验下依然不稳定（SOTA <50%，2024 τ-bench 原论文数据）。
5. **"harness 该多薄"是一场未决之争**：Anthropic / Boris Cherny 主张"尽可能薄的模型包装，secret sauce 全在模型里"；LangChain / 12-Factor 阵营主张"harness 才是护城河"。折中共识是二者互补——好模型让好 harness 更好，弱 harness 会把强模型的上限压死。

---

## 2. 定位与动机

把一次 agent 请求拆开看，链路是：**组装上下文 → LLM 推理 → 解析动作 → 执行工具 → 结果回灌 → 再推理**，直到完成或触达停止条件。**Harness（运行时 / scaffold）就是托管这整段循环的宿主程序**——它不做推理，只负责：

- **拥有并驱动 agent loop**：决定什么时候再调一次模型、什么时候停。
- **承载 tool-call 契约**：把模型吐出的动作（JSON 或代码）解析、校验、执行，再把结果塞回上下文。
- **管理状态与上下文**：对话历史、工具返回、长期记忆、checkpoint——在循环跨越很多轮时不丢"承重状态"。
- **兜安全与可靠性**：权限闸、沙箱、`max_turns` 兜底、错误分类与重试。

**为什么它值得单独成节？** 因为 SWE-agent（Yang et al., 2024）给出了一个反直觉的实证：**在模型固定的前提下，仅改变 Agent-Computer Interface（ACI，即 harness/接口设计）就能显著改变 agent 在 SWE-bench 上的成绩**。换句话说，"模型 vs scaffold"不是非此即彼——scaffold 是一个**可独立调优的性能杠杆**。这把 harness 从"胶水代码"提升成了"产品本身"。这一定位也得到综述层面的呼应——SJTU《Externalization in LLM Agents》(2026) 把 **Memory / Skills / Protocols / Harness Engineering** 并列为 LLM agent 的四大"外化"支柱，把 harness 工程作为一个独立的学术对象来对待。

在 Agent 全景里，harness 是**承上启下的中枢**：上接 [[01]] 的推理范式（它把 Think 工程化）、[[03]] 的上下文工程（它执行 compaction）、[[04]] 的工具与 MCP（它是工具的调用方）、[[05]] 的规划、[[08]] 的多智能体编排（它是 orchestrator 的运行底座）、[[12]] 的安全（它是权限闸所在）。

---

## 3. 历史发展脉络

> 一句话主线：**手写 ReAct loop（零点）→ 框架封装（LangChain）→ 全自动 loop 翻车（AutoGPT）→ 图式状态机（LangGraph）→ code-as-action（CodeAct）→ 厂商官方 SDK 收敛 → 长跑/上下文工程成为新焦点**。

| 年份 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **2022-05** | **MRKL Systems**（AI21，Karpas et al.） | 神经路由器把输入分发给外部"专家模块"——tool-routing 与"harness/model 解耦"的概念祖先。 |
| **2022-09** | **Code as Policies**（Liang et al., Google） | LLM 直接吐可执行策略代码当动作，code-as-action 的早期雏形，比 CodeAct 早一年半。 |
| **2022-10** | **ReAct 论文 + LangChain v0（10/24）** | ReAct 把"只推理的 CoT"和"只行动的 tool use"拧成 `Thought→Action→Observation` 循环——这是所有 harness 的零点；LangChain 把这个循环封装成首个流行框架，从"手写"迈入"框架"。 |
| **2023-02** | **Toolformer**（Schick et al., Meta） | 自监督地学习"何时调哪个 API"，把工具调用能力放进模型权重，挑起"能力在模型 vs 在 scaffold"的解耦之争。 |
| **2023-03** | **Reflexion + AutoGPT(3/30)/BabyAGI(3/28)** | Reflexion 把失败轨迹反思后存进情景记忆再重试，是 loop 级错误恢复的学术模板；AutoGPT/BabyAGI 的"给个目标就走开"全自动 loop 引爆全网，却暴露无记忆、目标漂移、死循环——证明裸 loop 不够用，倒逼后续引入状态与受控流程。 |
| **2023-05** | **Voyager / Gorilla / ReWOO**（同月） | Voyager 用 code-as-action + 技能库 + 执行错误回灌做程序修复；Gorilla 微调出准确的 API 调用 + 检索抗 API 漂移；ReWOO 把 planner 与 observation 解耦，省 ~5x token 且更抗工具失败。 |
| **2023-06** | **OpenAI function calling（6/13）** | 把 emit→parse 契约标准化为"模型吐符合 schema 的 JSON"，循环才可靠到能进生产——此前靠 prompt 解析自由文本，脆弱易碎。 |
| **2023-08/09** | **AutoGen / AgentBench / CoALA** | AutoGen 给出可复用的 multi-agent 对话运行时；AgentBench 是首个多环境 agent 基准；CoALA 把运行时形式化为"记忆 + 内/外动作空间 + 决策循环"，最接近 harness 的学术规格。 |
| **2024-01** | **LangGraph 发布** | 线性 chain 表达不了环、分支、持久化与 human-in-the-loop。图/状态机给出显式控制流 + checkpoint，从"魔法 agent"转向可恢复、可工程化的 workflow——正面回应 AutoGPT 暴露的状态丢失痛点。 |
| **2024-02** | **CodeAct（Wang et al., ICML 2024）** | 把整个动作空间收敛成解释器执行的 Python，支持多轮自我调试与库复用，较 JSON/文本动作成功率最高 +20%——code-as-action 的学术地基。 |
| **2024-04 / 05 / 06** | **Instruction Hierarchy / SWE-agent(ACI) / τ-bench** | Instruction Hierarchy 形式化 `system>developer>user>tool` 特权分层并训练模型遵守；SWE-agent 证明 ACI（接口）本身是性能杠杆；τ-bench 引入 `pass^k` 量化运行时可靠性。 |
| **2024-11** | **MCP 开源（11/25）** | 通用 client/server 协议让工具发布一次、任何 agent 都能发现，把 harness 与工具实现、模型厂商彻底解耦。 |
| **2024-12** | **《Building Effective Agents》+ smolagents** | Anthropic 把"薄 harness"写成方法论（少用框架、上生产削抽象层），与 LangChain 路线正面分野；HuggingFace 把 harness 极简到 ~1000 行并主推 code-as-action。 |
| **2025-03** | **OpenAI Agents SDK（Swarm 继任）** | 模型厂亲自下场出官方轻量运行时（Runner + handoffs + guardrails + sessions + tracing），agent loop 从第三方框架变成厂商原语。 |
| **2025-06** | **Cognition《Don't Build Multi-Agents》(6/12) vs Anthropic《multi-agent 研究系统》(6/13)** | 隔天对垒，引爆架构路线之争：单线程线性 + 上下文压缩 vs orchestrator-worker multi-agent。 |
| **2025-09 ~ 11** | **上下文工程双文 + LangChain Middleware + Claude Agent SDK 更名 + 长跑 harness 文 + Code execution with MCP** | 焦点从 prompt 转向 context engineering（compaction / 外部笔记 / JIT 检索 / 工具 token 预算）；"harness 即产品"被工程化封装；工具爆炸后 code-as-action 因"省上下文（~150K→2K）"正式进生产。 |
| **2026-03 / 04** | **OpenDev 论文（Bui）/ Cursor《Continually improving our agent harness》** | 学界与产业同时把"harness 设计"摆上台面：双 agent 规划/执行、按模型定制工具格式、随模型变强主动拆护栏、把可靠性打到 2-3 个 9。 |
| **2026-03 / 04** | **Anthropic《Harness design for long-running》(3/24) + 《Scaling Managed Agents》(4/8)；OpenAI《Harness engineering》(Codex, 3/4)** | harness 设计被正式方法论化：前者用 GAN 式 generator-evaluator + context reset / 结构化交接 + planner/generator/evaluator 三 agent 跑长程开发；后者把托管 agent 拆成 brain/hands/session 三层（解耦推理与执行），凭证经 vault+proxy 不入沙箱，TTFT p50 约降 60%、p95 降超 90%。**同月 OpenAI 以 Codex「约 100 万行生产代码、零人工手写、PR 由 agent 开/审/合」背书同一范式——「harness engineering」自此从单家说法变成行业通用词。** |
| **2026-06** | **Loop Engineering（Peter Steinberger 起，X，6/7）** | 工程重心再上提一层：harness 装备的是「单次运行」，而 **loop 是那个不停唤醒 / 派生子 agent / 自我投喂的外层循环**。它**不取代 harness，而是其上一层**——把 `prompt → context → harness` 的演进续成「→ loop」第四跳，二周内重塑社区话语（详见 §4.7 末）。 |

---

## 4. 核心概念与原理

### 4.1 规范 agent loop：gather → act → verify → repeat

把 ReAct 工程化，harness 的核心就是一个带停止条件的 while 循环：

```python
def agent_loop(task, tools, max_turns=50):
    messages = build_context(system_prompt, tools, task)   # gather context
    for turn in range(max_turns):
        # 1) 调模型（流式）；模型决定：出文本，还是发 tool_use
        resp = model.generate(messages, tool_schemas=tools, stream=True)
        calls = parse_tool_calls(resp)        # 从 token 流里缓冲并解析动作

        if resp.stop_reason != "tool_use":    # ★ 停止条件①：模型主动给最终答案
            return resp.text

        for call in calls:                    # take action
            if not authorize(call):           # ★ 权限闸（PreToolUse hook）
                result = "permission denied: " + call.name
            else:
                result = execute(call)        # 沙箱 / 解释器 / API
            result = truncate(result, 25_000) # ★ 工具返回 token 预算
            messages.append(tool_result(call, result))   # feed back（回灌）
        # verify：可在此插入自检 / Reflexion / 预算检查
    raise MaxTurnsExceeded                     # ★ 停止条件②：硬兜底防死循环
```

这段 ~20 行就是 harness 的"心脏"。所有框架（LangGraph、Agents SDK Runner、Claude Agent SDK）都是在它周围加状态、加图、加可观测、加持久化。

### 4.2 Tool-call 全链路：emit → parse → execute → feed back

这是 harness 最核心的契约，对应 Tool Learning 综述（Qin et al., 2023）里的完整 pipeline：

1. **emit（发出）**：模型决定调用工具并产出动作表示。JSON 路线 = 符合 function schema 的结构化 JSON（OpenAI function calling, 2023）；code 路线 = 一段可执行 Python（CodeAct）。
2. **parse（解析）**：从 **token 流**里把动作解出来。难点在流式——动作是一个 token 一个 token 吐出来的，harness 必须**缓冲完整的 tool_use delta 再执行**。这里 **constrained / grammar decoding**（Outlines，Willard & Louf 2023，把约束解码重构成 O(1) 词表索引的 FSM 转移）保证即便是部分流式输出也始终可解析、不吐坏 JSON。
3. **execute（执行）**：JSON 路线交给注册的函数 / API；code 路线交给解释器（TaskWeaver、smolagents 的 CodeAgent）。执行必须落在**权限与沙箱**之内。
4. **feed back（回灌）**：把执行结果（或报错）作为新的 observation 追加进 messages，进入下一轮。**报错要写成可操作的引导**（Anthropic《Writing tools for agents》），让模型能据此自我修复，而不是吞掉异常。

### 4.3 停止条件（Stopping conditions）

死循环和"过早收手"是 harness 两大顽疾。停止信号有四类：

- **模型主动停**：ReAct 的显式 `Finish` 动作 / `stop_reason != tool_use`。
- **目标达成校验**：τ-bench 用 goal-state 比对判定完成；CoALA 的 decision procedure 决定 halt vs continue。
- **预算/步数兜底**：`max_turns`（Agents SDK Runner 超限抛 `MaxTurnsExceeded`，设 `None` 关闭）、token / 时间预算。
- **护栏中断**：guardrail 命中、需 human-in-the-loop 审批时主动停。

> ⚠️ 开放难题：目前**没有"模型无关的、有原则的停止判据"**——模型既会过度调用又会过早停，纯靠 `max_step` 上限很脆。

### 4.4 错误处理与重试（Error handling & retry）

谁来负责恢复，是模型自省还是 harness 兜底？两层都要：

- **模型自省层**：Reflexion（反思失败轨迹存情景记忆后重试）、Voyager（把执行错误回灌做程序修复 + 自验证）、CodeAct（多轮 self-debug）。
- **Harness 兜底层**：错误分类（Cursor 把工具错误分成 `InvalidArguments / Timeout / ProviderError…` 并做专项 sprint）、retry/rollback、checkpoint 续跑、`error_handlers` 把异常转兜底输出。
- **架构层抗失败**：ReWOO 把计划前置，工具中途失败也不至于满盘皆输。

### 4.5 system / developer / user / tool-output 特权分层

长循环里，**不可信的工具输出每一轮都重新进入上下文**，是 prompt injection 的主攻面。Instruction Hierarchy（Wallace et al., 2024）形式化了 `system > developer > user > tool-output` 的优先级，并训练模型在冲突时服从高优先级。这是 harness 角色分层与注入防御的学术基础（详见 [[12]]）。harness 侧的对应工程：把工具输出标记为低信任、限制其能触发的高权限动作。

### 4.6 谁拥有循环？SDK loop vs 自写 loop

- **SDK 拥有循环**（Claude Agent SDK / OpenAI Agents SDK Runner）：开发者只描述任务与可用工具，Claude/Runner 自己跑 `while(tool_use)`。省心，但让出控制权。
- **开发者自写循环**（Client SDK / 裸 API）：自己写 `while stop_reason == "tool_use"`，换取完全可控。

### 4.7 运行时一级原语：harness 从"循环"长成"平台"

§4.1–§4.6 是 harness 的"裸心脏"。2025–2026 的工程实践把一批能力从"自己在 loop 里手搓"升级成**运行时一级原语（first-class primitives）**——由运行时直接提供、可声明式配置，而不再是每个团队各写一遍的胶水。下表把前面零散提到的机制收拢成一张"harness 平台"功能矩阵：

| 一级原语 | 解决什么 | 代表实现 | 关键事实（均出自既有引用） |
|---|---|---|---|
| **brain/hands/session 三层** | 解耦"推理"与"执行"，让昂贵推理与廉价工具执行各自伸缩 | Anthropic《Scaling Managed Agents》(2026-04) | hands 侧沙箱不持凭证，凭证经 **vault+proxy** 注入；TTFT **p50 约降 60% / p95 降超 90%** |
| **middleware 可插拔层** | 不改 loop 主体即可注入横切逻辑（限流 / 审计 / 上下文改写）| LangChain Agent Middleware 1.0（2025-09）| `before_model` / `after_model` / `modify_model_request` 三钩子，链式执行 |
| **durable execution / checkpointer** | 进程崩溃、换机也能从断点续跑 | LangGraph checkpointer | 每步落 checkpoint，可 resume / 回滚续跑（见 §4.4、§5）|
| **human-in-the-loop（HITL）** | 高风险动作前停下等人审批 / 改写再继续 | LangGraph 中断 / Agents SDK guardrails / Claude permissions | 与 checkpoint 同构：中断＝存档，审批＝带人类输入恢复 |
| **并行工具调用** | 一轮内对相互独立的工具并发执行，砍掉串行等待 | 主流 SDK（Claude / OpenAI / LangGraph）| 模型一次产出多个 `tool_use`，harness 并发 execute 后按序回灌（即 §4.1 的 `for call in calls`）|
| **prompt / KV caching** | 缓存稳定前缀（system + 工具 schema + 历史），省 token 与首字延迟 | OpenAI / Anthropic prompt caching；KV cache 复用 | 命中可省成本约 **GPT-4o ~50% / GPT-4.1 ~75% / GPT-5 系 ~90%**；缓存友好的上下文编辑见《Don't Break the Cache》(arXiv:2601.06007) |
| **中断 / 转向（steering）** | 运行中实时插话改方向，不必等跑完或推倒重来 | Claude Code 等交互式 harness | 把"人在环外等结果"变成"人在环内随时纠偏"，与 HITL 互补 |

读这张表的方式：**越靠下越"以人 / 成本为中心"**——前两行解耦的是算力，中间两行兜的是可靠性，后三行省的是延迟 / 成本、并把人重新拉回 loop。这正是 §8 判断里"durable execution 已像数据库事务一样下沉成基建"的具体落点：harness 不再只是"那段 while 循环"，而是一个提供持久化、可观测、可干预的**运行时平台**。

> **两条向外的延伸**：（1）brain/hands 把凭证从沙箱抽走、经 vault+proxy 注入，本质是给每个 agent 一个**可审计的最小权限身份**——这正是 [[17]]（互操作协议与 agent 经济）里"agent 身份 / 发现 / 计费"的运行时前提。（2）这些原语产生的结构化轨迹（每步工具调用、中断点、人类纠偏）天然是**可验证的训练信号**，[[16]]（Agent 训练与强化学习）正是把这条"运行时账本"喂回权重——护城河从 harness 继续往"拿得到可验证轨迹做 RL"前移。

> **再往外一层：从 harness 到 loop（2026-06「Loop Engineering」）。** 本节讲的 harness 装备的是**单次运行**（一个 task、一段 session）。2026 年 3 月 Anthropic 与 OpenAI 同月发文把「harness engineering」推成行业通用词后，6 月 Peter Steinberger（X, 6/7）又提出**「Loop Engineering」**：当模型/harness 已足够可靠，瓶颈就从「跑好一次」变成「**让它自己一遍遍地跑**」——谁来**定时唤醒** agent、**派生子 agent**、把上一轮产物**自我投喂**回下一轮。它**不取代 harness，而是其上一层**，把演进主线从 `prompt → context → harness` 续成 **`→ loop`** 的第四跳（这层「调度循环」与 [[05]] 的规划、本节的中断/转向同源，本库定时/后台任务能力也属此类）。判据：harness 关心「这一轮怎么转得稳」，loop 关心「这串轮次怎么自驱动、何时停、产物怎么级联」。

---

## 5. 主流方法谱系

| 方案 | 动作表示 | 控制流归属 | 谁拥有循环 | 状态/持久化 | 典型停止条件 | 上下文管理 |
|---|---|---|---|---|---|---|
| **裸 ReAct loop（手写）** | 文本/JSON | 开发者 | 开发者 | 内存里的 messages | `Finish` 动作 / 手写 max-step | 手动裁剪 |
| **LangChain → LangGraph** | JSON tool calls | 显式有向图（厚） | 框架（图引擎） | checkpoint 持久化、可恢复 | 图终止节点 + 中断 | Middleware: summarization / HITL |
| **OpenAI Agents SDK（Runner）** | JSON / function-calling | agent 自主 + handoffs | SDK（确定性状态机） | SQLiteSession / 服务端 conversation_id | `max_turns` + guardrails | 三选一 history 互斥防重复 |
| **Claude Agent SDK** | JSON tool_use（薄） | Claude 自主 | SDK（Claude 拥有 loop） | 可 resume/fork 的 sessions、自动 compaction | `stop_reason` + permissions | 内置 compaction + subagent 干净 context |
| **smolagents（CodeAgent）** | **code-as-action（Python）** | agent 自主 | 框架（~1000 行） | 轻量、内存为主 | 写出 `final_answer()` | 代码动作天然少步数 |
| **AutoGen** | JSON / 代码执行 agent | multi-agent 对话编排 | 框架 | 对话历史 | 终止消息 / 轮数 | 按 agent 分隔上下文 |
| **Google ADK** | JSON | 事件驱动 Event Loop | Runner（编排者） | Services 提交 state/artifact，天然可恢复 | RunConfig / Event 终止 | everything-as-Event |

横看一条规律：**越往生产走，循环的"拥有权"越倾向交给运行时，而把状态/持久化做成一等公民**——这正是从裸 loop 到 LangGraph / ADK / Agents SDK 的共同方向。

---

## 6. 主流观点与争议

**① 动作表示：code-as-action vs JSON tool-calls。**
- A 方（code-as-action）：Xingyao Wang 等（CodeAct, UIUC/ICML 2024）、HuggingFace smolagents、Anthropic（2025-11《Code execution with MCP》）、Voyager（NVIDIA）。论据：动作空间无界、可组合（循环/条件/嵌套）、可自我调试；多工具场景省 80–98% 上下文（Anthropic 实测 ~150K→2K tokens）；LLM 在代码上训练充分。
- B 方（JSON/function-calling）：OpenAI（function calling、Structured Outputs、Responses API）及多数企业框架。论据：schema 可校验、可预测、易加权限与 guardrail；无需起沙箱、避免任意代码执行的安全面。
- 现状：Anthropic 2025 后两头都做，趋势是"简单/受控用 JSON、复杂/多工具用代码"共存。

> 📦 结案框：**code-as-action（CodeAct，2024）/ JSON function-calling（2023）提出** → **2026 定论**：非互斥替代，按"工具基数"分层共存（少工具 + 强权限用 JSON；几十上百个 MCP 工具走 code-as-action，省上下文 ~150K→2K）→ **现状**：头部实验室两头都做，《Code execution with MCP》已把 code-as-action 推进生产。

**② 循环形态：ReAct 交错 vs ReWOO 解耦。**
- A 方（Yao et al., ReAct）：每步观察后再推理，对意外鲁棒、实现简单。
- B 方（Xu et al., ReWOO）：把全部工具调用前置规划，省 ~5x token，且对工具失败更鲁棒。
- 本质是"反应性 vs 计划性"的取舍（延伸到 [[05]]）。

**③ harness 厚薄 / 是不是护城河。**
- 薄派：Boris Cherny / Anthropic——"尽可能薄的模型包装""secret sauce 全在模型里"，墙上挂着 Bitter Lesson，为"六个月后的模型"设计；《Building Effective Agents》主张避开框架。论据：METR、Scale 发现部分任务上 harness 差异落在误差范围内。
- 厚派：LangChain/LangGraph（Harrison Chase）显式图掌控控制流；Dex Horthy《12-Factor Agents》——"own your prompts/context/control flow"。论据：生产可靠性靠状态、控制流、上下文管理、HITL 与验证；弱 harness 会封死强模型上限。
- Latent Space 一针见血：Claude Code 这个"薄包装"里塞了 8 种 compaction、生产校准的熔断器、沙箱化 fork 出来的摘要 agent——**最薄的 harness 也仍是 harness**。

**④ 可靠性住在模型还是 harness/decoder？**
- A 方：训进去——Toolformer / Gorilla 微调模型直接吐对的调用。
- B 方：在外面强制——constrained decoding（Outlines/grammar）+ ACI scaffolding 保证可解析、合法的动作，与模型无关。

**⑤ multi-agent 并行 vs 单线程线性（2025-06 隔天对垒）。**
- Anthropic：orchestrator-worker 在 breadth-first 研究任务上比单体 Opus 4 高 90.2%（2025-06 内部 eval），适合可并行探索。
- Cognition（Walden Yan）：subagent 间隐含决策会冲突、缺可靠协商机制，默认单线程 + 上下文压缩才稳。
- 这是 [[08]] 的主战场，但根子在 harness 的编排形态选择。

---

## 7. 大厂工程实践

**案例 A — Anthropic：Claude Code / Claude Agent SDK（薄 harness 的工程化）。**
2025-09 把驱动 Claude Code 的同一套 agent loop + 上下文管理抽成 Claude Agent SDK。工程取舍：内置 Read/Edit/Bash/Glob/Grep 工具、`PreToolUse/PostToolUse` hooks 做安全闸、permissions 控权限、可 resume/fork 的 sessions；**工具返回默认截到 25k token**；接近上限**自动 compaction**，subagent 用干净 context 返回 1-2k 摘要。SDK 拥有循环（省自写工具循环）vs Client SDK 自写（要 control 自由度），二选一。长跑场景（《Effective harnesses for long-running agents》, 2025-11）更进一步：用 initializer 专用 prompt 搭好首个 window，之后每轮固定"读目录→看 git log/progress→挑最高优先级未完成功能→跑基线 e2e"，并用 **JSON feature-list + init.sh + claude-progress.txt + git 提交**承载跨 window 的持久状态，而非只靠 compaction。

**案例 B — Cursor：按模型定制 harness（生产取舍最透明）。**
《Continually improving our agent harness》（2026-04）披露：**给不同模型不同编辑格式**（OpenAI 用 patch、Claude 用 string-replace）与不同 prompt 风格（对 OpenAI 更字面精确、对 Claude 更直觉容错）；**随模型变强主动"拆护栏"**（去掉 lint 回灌，改给可按需拉取的动态 context，见《Dynamic context discovery》）；**工具错误分类 + 专项 sprint 把可靠性打到 2-3 个 9**；离线 **CursorBench** + 在线 **Keep Rate A/B** 双轨评估；切模型时自动热换 harness 变体。代价 = 每模型定制的维护成本。

**案例 C — OpenAI：Agents SDK Runner（最小原语 + 确定性状态机）。**
`Runner.run` 是确定性循环：调模型→若 `final_output` 则结束；若 handoff 则换 agent 重跑；若有 tool calls 则执行、回填、重跑。用 `handoffs` 在专家 agent 间切换替代中心 orchestrator；`max_turns` 硬兜底防死循环；history 三选一（手动 `to_input_list` / `SQLiteSession` / 服务端 `conversation_id`）**互斥防重复 context**。

**案例 D — Anthropic：multi-agent 深度研究系统（长跑运行时账本）。**
orchestrator-worker 实跑：lead 规划→并行 spawn 3-5 subagent→合成 + 独立 citation pass。**明算账**——multi-agent 约 15x token（single-agent 约 4x），token 解释 80% 任务成败方差，只对"产出价值 > 成本"的宽探索任务才值。工程化长跑靠：可恢复 checkpoint、context 逼近 200k 前把计划写入外部 memory、rainbow 部署灰度切流、生产 tracing。已知瓶颈：lead 同步阻塞等 subagent。

> 另可参照 smolagents（~1000 行、code-as-action，安全靠 E2B/Docker/Modal 沙箱，明确 `LocalPythonExecutor` 不是安全边界）、LangChain 1.0 Middleware（`before_model/after_model/modify_model_request` 三钩子）、Google ADK（事件驱动、强一致可恢复）、Cognition Devin（反 multi-agent、单线程 + 专用压缩 LLM）。更深拆解见 [[13]]。

---

## 8. 我的分析与判断

> **以下为分析观点（非事实陈述），是作者基于上述材料的独立研判。**

**趋势研判。** 三个方向我判断是确定性的：（1）**循环拥有权向模型厂的官方 SDK 收敛**。当 OpenAI Agents SDK、Claude Agent SDK 都把 loop 做成原语后，第三方"通用框架"的差异化会被挤到编排（[[08]]）、可观测（[[10]]）、评估（[[09]]）这些**横切层**——LangChain 自己把 agent 跑在 LangGraph 上、并开放 Middleware，正是承认"核心 loop 迟早被厂商商品化"的防守动作。（2）**code-as-action 与 JSON 不会一方吃掉另一方，而是按"工具基数"分层**：工具少且要强权限管控用 JSON；工具多（几十上百个 MCP server）必然走 code-as-action，因为"每工具一份 JSON schema"的上下文成本是线性爆炸的，这是 Anthropic ~150K→2K 那个数字的根本原因。（3）**持久化/durable execution 已成主流运行时原语**——checkpoint、event-sourcing（ADK 已经这么做）、rainbow 部署，已像当年的数据库事务一样下沉成基建。

**常见坑（我见过最多踩的）。** ①**把 `max_turns` 当唯一停止条件**——它只防死循环，防不了"过早收手"，必须配目标校验或自检。②**吞掉工具报错**：把 exception 转成空字符串塞回去，模型完全无法自我修复；报错必须是可操作的自然语言引导。③**compaction 丢承重状态**：天真地"总结前 N 轮"会把关键 ID、未完成的 TODO 压没——这是长跑失败的头号原因，宁可把承重状态写进外部文件（progress.txt / feature-list）也别全赌在摘要上。④**流式没缓冲完就执行**：tool_use delta 没攒齐就解析，必崩。⑤**信任工具输出**：把检索/网页返回当成和 system prompt 同级，prompt injection 直接破防。

**最佳实践。** 起步用裸 loop + 厂商官方 SDK，**别一上来上重框架**（Anthropic 这点我完全认同——抽象层是债）；把"承重状态"显式外置（文件 + git），把 compaction 当成"有损压缩"来对待并单独评估它的保真度；错误**分类**而非笼统重试；**离线 bench + 在线 A/B 双轨**评估，单看离线必过拟合；对动作表示做"基数路由"——工具一多就切 code-as-action 并配真沙箱。一句话：**把 harness 当成一个有 SLA 的软件系统来运维，而不是一段 prompt 胶水**。

---

## 9. 面试考点

**概念题**

1. **什么是 harness？它和模型的边界在哪？** 要点：托管 agent loop 的宿主程序，三要素 `environment + tools + system prompt`；不含智能但决定智能发挥几成；引 SWE-agent 的 ACI 实证——固定模型只改接口就能改成绩。
2. **画出 tool-call 全链路。** 要点：emit（模型吐 JSON/代码）→ parse（从 token 流缓冲解析，constrained decoding 保证可解析）→ execute（沙箱/解释器/API + 权限闸）→ feed back（结果或可操作报错回灌）。
3. **code-as-action 与 JSON tool-calls 各自优劣？** 要点：code = 可组合/省上下文/可自调试（CodeAct +20%）；JSON = 可校验/易加权限/无需沙箱。按工具基数分层选择。
4. **谁应该拥有 agent loop？** 要点：SDK 拥有（省心、让出控制）vs 自写（可控、要维护）；举 Agents SDK Runner / Claude Agent SDK vs 裸 API。

**系统设计题**

5. **设计一个能跑数小时、跨多个 context window 的长跑 coding agent harness。** 要点：①每轮固定流程（读 progress → 看 git → 选最高优先级未完成项 → 跑基线 e2e）；②承重状态外置（feature-list JSON + progress 文件 + git 提交）而非只靠 compaction；③接近上限触发 compaction + subagent 卸载；④checkpoint/resume 续跑；⑤权限闸 + 沙箱；⑥停止条件多路（目标校验 + `max_turns` 兜底）；⑦离线 bench + 在线 A/B + tracing 闭环。

**手写题**

6. **手写一个带停止条件、`max_turns` 兜底、权限校验、工具结果截断的 agent loop。** 参考 §4.1 的 20 行伪代码——考察点是：`stop_reason` 判停、循环外的 `MaxTurnsExceeded`、执行前 `authorize`、回灌前 `truncate(result, 25k)`、流式 `parse_tool_calls` 要缓冲。

**陷阱题**

7. **"上了 multi-agent 一定更强"对吗？** 错。multi-agent 约 15x token，仅对"产出价值 > 成本"的宽探索任务才值；写作类强一致任务上 subagent 隐含决策会冲突（Cognition 的 Flappy Bird 反例）。
8. **"harness 越薄越好、智能全在模型里"对吗？** 片面。这是薄派立场，但 METR/Scale 的"误差范围"证据与"最薄的 Claude Code 也塞了 8 种 compaction + 熔断器"的事实并存——薄是一种"模型已够强、重 scaffold 反碍事"的判断，不是"不需要 harness"。
9. **`max_turns` 能保证 agent 不死循环也不过早停吗？** 不能。它只防死循环；过早收手要靠目标校验/自检，二者是不同的停止信号。

---

## 10. 参考文献

### 📄 论文

- Yao et al., **ReAct: Synergizing Reasoning and Acting in Language Models**, 2022 — https://arxiv.org/abs/2210.03629 — harness 核心循环的学术原型：`Thought→Action→Observation` 交错。
- Wang et al., **Executable Code Actions Elicit Better LLM Agents (CodeAct)**, ICML 2024 — https://arxiv.org/abs/2402.01030 — 用可执行 Python 作统一动作空间，较 JSON/文本动作成功率最高 +20%。
- Shinn et al., **Reflexion: Language Agents with Verbal Reinforcement Learning**, 2023 — https://arxiv.org/abs/2303.11366 — 反思失败轨迹存情景记忆再重试，loop 级错误恢复模板。
- Xu et al., **ReWOO: Decoupling Reasoning from Observations**, 2023 — https://arxiv.org/abs/2305.18323 — 计划前置、worker 执行，省 ~5x token 且更抗工具失败。
- Yang et al., **SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering**, 2024 — https://arxiv.org/abs/2405.15793 — 证明 ACI（接口/scaffold）本身是独立的性能杠杆。
- Yao et al., **τ-bench: A Benchmark for Tool-Agent-User Interaction**, 2024 — https://arxiv.org/abs/2406.12045 — 引入 `pass^k` 量化运行时可靠性（SOTA <50%，2024 τ-bench 原论文数据）。
- Wallace et al., **The Instruction Hierarchy: Training LLMs to Prioritize Privileged Instructions**, 2024 — https://arxiv.org/abs/2404.13208 — 形式化 `system>developer>user>tool` 特权分层，注入防御学术基础。
- Willard & Louf, **Efficient Guided Generation for LLMs (Outlines)**, 2023 — https://arxiv.org/abs/2307.09702 — 把约束解码重构成 O(1) 词表索引的 FSM，保证可解析的结构化输出。
- Sumers et al., **Cognitive Architectures for Language Agents (CoALA)**, 2023 — https://arxiv.org/abs/2309.02427 — 把运行时形式化为"记忆 + 内/外动作空间 + 决策循环"，最接近 harness 的学术规格。
- Schick et al., **Toolformer: Language Models Can Teach Themselves to Use Tools**, 2023 — https://arxiv.org/abs/2302.04761 — 自监督把工具调用能力训进权重。
- Patil et al., **Gorilla: Large Language Model Connected with Massive APIs**, 2023 — https://arxiv.org/abs/2305.15334 — 微调 + 检索做准确 API 调用，引入 APIBench/BFCL。
- Wang et al., **Voyager: An Open-Ended Embodied Agent with LLMs**, 2023 — https://arxiv.org/abs/2305.16291 — code-as-action 技能库 + 执行错误回灌做程序修复。
- Qin et al., **Tool Learning with Foundation Models**, 2023 — https://arxiv.org/abs/2304.08354 — 工具使用全 pipeline 综述（intent→selection→call→execution→feedback）。
- Karpas et al., **MRKL Systems**, 2022 — https://arxiv.org/abs/2205.00445 — 神经路由器分发到外部专家模块，tool-routing/解耦的概念祖先。
- Qiao et al., **TaskWeaver: A Code-First Agent Framework**, 2023 — https://arxiv.org/abs/2311.17541 — 把请求转可执行代码、插件即可调函数，产品化 code-as-action。
- Wu et al., **AutoGen: Multi-Agent Conversation**, 2023 — https://arxiv.org/abs/2308.08155 — 可复用的 multi-agent 对话运行时底座。
- Bui, **Building Effective AI Coding Agents for the Terminal: Scaffolding, Harness, Context Engineering, and Lessons Learned (OpenDev)**, 2026 — https://arxiv.org/abs/2603.05344 — 双 agent 规划/执行分离 + 工作负载特化模型路由 + 自适应上下文压缩 + 自动记忆系统。
- Zhang et al. (SJTU), **Externalization in LLM Agents: A Unified Review of Memory, Skills, Protocols and Harness Engineering**, 2026 — https://arxiv.org/abs/2604.08224 — 把 Memory / Skills / Protocols / Harness Engineering 并列为 LLM agent 的四大"外化"支柱，从综述层面确立 harness 工程的独立学术定位。
- **Don't Break the Cache**, 2026 — https://arxiv.org/abs/2601.06007 — 缓存友好的上下文管理：稳定前缀复用是 harness 省 token / 降首字延迟的一级杠杆（对应 §4.7 的 prompt/KV caching 原语）。

### ✍️ 博客与工程文

- Anthropic, **Building Effective Agents**, 2024 — https://www.anthropic.com/engineering/building-effective-agents — 薄 harness 宣言：简单可组合 > 复杂框架；区分 workflow 与 agent。
- Cognition (Walden Yan), **Don't Build Multi-Agents**, 2025 — https://cognition.ai/blog/dont-build-multi-agents — 单线程线性 + 上下文压缩为默认；共享完整 trace，避免并行 subagent 隐含决策冲突。
- Anthropic, **How we built our multi-agent research system**, 2025 — https://www.anthropic.com/engineering/multi-agent-research-system — orchestrator-worker、15x token 账本、checkpoint/rainbow 长跑工程。
- Anthropic, **Effective context engineering for AI agents**, 2025 — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — context rot；compaction / 结构化笔记 / subagent / JIT 检索。
- Anthropic, **Code execution with MCP**, 2025 — https://www.anthropic.com/engineering/code-execution-with-mcp — 把 MCP 工具当代码 API，上下文 ~150K→2K，code-as-action 进生产。
- Anthropic, **Effective harnesses for long-running agents**, 2025 — https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents — initializer + coding 双 agent、feature-list、init.sh、progress 文件、git 做持久状态。
- Anthropic, **Harness design for long-running application development**, 2026 — https://www.anthropic.com/engineering/harness-design-long-running-apps — GAN 式 generator-evaluator + context reset / 结构化交接 + planner/generator/evaluator 三 agent，长程开发的 harness 设计方法论。
- Anthropic, **Scaling Managed Agents: Decoupling brain from hands**, 2026 — https://www.anthropic.com/engineering/managed-agents — 把托管 agent 拆成 brain/hands/session 三层、解耦推理与执行，凭证经 vault+proxy 不入沙箱，TTFT p50 约降 60% / p95 降超 90%。
- Cursor, **Continually improving our agent harness**, 2026 — https://cursor.com/blog/continually-improving-agent-harness — 按模型定制工具格式、拆护栏、错误分类、可靠性 2-3 个 9、双轨评估。
- HuggingFace, **Introducing smolagents**, 2024 — https://huggingface.co/blog/smolagents — ~1000 行 harness、CodeAgent 写 Python 动作、沙箱安全。
- LangChain, **Agent Middleware (LangChain 1.0)**, 2025 — https://www.langchain.com/blog/agent-middleware — `before_model/after_model/modify_model_request` 三钩子把 loop 生命周期开放给开发者。
- Dex Horthy / HumanLayer, **12-Factor Agents**, 2025 — https://github.com/humanlayer/12-factor-agents — own your prompts/context/control flow，厚 harness 方法论。
- Latent Space, **Is Harness Engineering real?**, 2026 — https://www.latent.space/p/ainews-is-harness-engineering-real — Boris Cherny"最薄包装"论 vs METR/Scale 反证；最薄的 harness 也仍是 harness。
- OpenAI, **Harness engineering: leveraging Codex in an agent-first world**, 2026-03 — https://openai.com/index/harness-engineering/ — Codex 团队 5 个月构建并上线约 100 万行生产 beta、零人工手写、PR 由 agent 开/审/合；与 Anthropic 同月把「harness engineering」推成行业通用词。
- Peter Steinberger / Cobus Greyling, **Loop Engineering**, 2026-06 — https://cobusgreyling.substack.com/p/loop-engineering — harness 之上的「调度循环」层（定时唤醒 / 派生子 agent / 自我投喂）；起于 Steinberger X 帖(6/7)，prompt→context→harness→loop 的第四跳。

### 📚 官方文档

- OpenAI, **Function calling and other API updates**, 2023 — https://openai.com/index/function-calling-and-other-api-updates/ — emit→parse 契约标准化为 schema-valid JSON。
- OpenAI Agents SDK, **Running agents (Runner)**, 2025 — https://openai.github.io/openai-agents-python/running_agents/ — `Runner.run` 确定性状态机循环、`max_turns` 兜底、history 三选一互斥。
- Anthropic / Claude Code, **Agent SDK overview**, 2025 — https://code.claude.com/docs/en/agent-sdk/overview — Agent SDK 拥有 loop、内置工具/hooks/subagents/permissions、可 resume/fork sessions。
- Anthropic, **Introducing the Model Context Protocol (MCP)**, 2024 — https://www.anthropic.com/news/model-context-protocol — 通用 client/server 标准，harness 与工具实现/模型厂商解耦。
- Anthropic, **Writing effective tools for AI agents**, 2025 — https://www.anthropic.com/engineering/writing-tools-for-agents — 工具即 harness 接口：合并多步、命名空间、25k token 截断、可操作报错。
- Google ADK, **Agent Runtime / Event Loop**, 2025 — https://google.github.io/adk-docs/runtime/ — Runner 编排事件循环，经 Services 提交 state/artifact，天然持久化可恢复。

### 🎥 Talk / 播客

- Latent Space Podcast, **Boris Cherny on Claude Code（"thinnest possible wrapper"）**, 2025/2026 — https://www.latent.space/p/ainews-is-harness-engineering-real — 薄 harness 立场的一手出处与 harness-as-moat 之辩。

---

> 交叉链接：[[00]] 心智模型 · [[01]] 推理范式 · [[03]] 上下文工程 · [[04]] 工具与 MCP · [[05]] 规划 · [[08]] 多智能体编排 · [[09]] 评估 · [[10]] 可观测 · [[12]] 安全与对抗 · [[13]] 大厂案例 · [[15]] 面试题库 · [[16]] 训练与强化学习 · [[17]] 互操作协议与 agent 经济
