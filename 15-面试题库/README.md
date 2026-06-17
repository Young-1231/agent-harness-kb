> 状态：🟢 已校验

# 15 · 面试题库

> **定位**：把 [[00]]–[[14]]（及进阶的 [[16]]/[[17]]）的知识"出栈"成可在面试现场说清楚的答案。本节既是**复习索引**，也是**可直接刷的题库**——概念题、系统设计题、手写题、项目深挖（STAR）、行为题、陷阱清单一应俱全。
> **在链路中的位置**：这是知识库的"出口层"。前面各节负责把机制讲透，本节负责把机制翻译成**面试官能给分的信号**。读完你应能在 45 分钟的 loop 里，把"模型 vs harness""single-agent vs multi-agent""RAG vs 长上下文""刷榜 vs 评估工程"这些母题一口气讲清。

---

## 1. TL;DR / 速览

**本节地图**：先讲清 2024–2026 年 AI 工程师面试的**范式迁移**（从"推反向传播"到"设计 agent 系统"），再把整条技术主线压成一个可背诵的心智模型，然后给出**方法谱系表（七大题簇）**、**七组争议的"陷阱 vs 正确姿势"**、**大厂案例当弹药**，最后是**独立分析**与**完整题库**。

**3–5 条核心结论**：

1. **面试在追赶生产现实**。题目从"从零训模型/推导 BP"转向 RAG 架构、agentic 系统设计、评估方法（LLM-as-judge / golden set）、上下文工程、延迟-成本三角。五大核心题簇（LLM 基础 / RAG / agentic 系统设计 / 评测 / LLM 产品系统设计）覆盖约 90% 的 loop，高级岗再加两簇进阶——**Agent 训练与 RL**（[[16]]）与**互操作协议与 Agent 经济**（[[17]]），合计**七大题簇**。在生产 agent 里，**LLM 调用本身只占约 20%，其余 80% 是工程**（KDnuggets, 2025）。
2. **一条主线串起所有考点**：让模型**会想**（CoT/ReAct）→ **能用工具**（function calling/MCP）→ 把推理**训进权重**（o1/R1）→ 把上下文**工程化**（context engineering）→ 把产品化/评估/安全**工程化**（Devin/SWE-bench/multi-agent/lethal trifecta）。能讲清这条线、并标注每步的演进动因，就赢了一半。
3. **"模型 vs harness"是面试的元心智模型**：推理模型 ≠ agent。**model 负责 think，harness 负责 act/loop**（工具调用、停止条件、错误恢复、状态、检查点）。Devin 与 SWE-bench 的核心启示都是"差异化在 harness 不在模型"。
4. **争议题考的是判断力，不是站队**。multi-agent、RAG vs 长上下文、是否还要手写 ReAct、框架 vs 手写、context engineering 是否炒概念、刷榜 vs 评估——每一组的正确姿势都是"给出反向判据 + 何时用哪个"，而不是非黑即白。
5. **稳定性 > 一次跑通**。τ-bench（**2024 原论文口径**）用 `pass^k`（连续 k 次都对）揭示 SOTA <50%、零售 `pass^8` <25%；其继任者 **τ²-bench**（2025，dual-control，agent 与用户共改共享状态）进一步收紧口径；面试只报 `pass@1` 是减分项。**eval 即新的系统设计**。

---

## 2. 定位与动机

本节解决的问题：**前 14 节把你"教会了"，但面试现场考的是"你能不能在压力下、用对方听得懂的语言、在白板上把取舍讲清楚"**。这两件事差很远。很多人能背 ReAct 论文，却答不出"给你 4 个工具循环调用的 agent，你会上 multi-agent 吗"——因为这考的不是知识点，而是**判断力 + 反向判据 + 工程取舍**。

**为什么 2024–2026 面试变了？** 三股力量叠加：(1) 模型能力外溢——基座越来越强，"会不会调 API、会不会写 attention"不再是区分度；(2) 生产落地——公司真在跑 agent，踩过 token 爆炸、提示注入、评测污染的坑，于是把这些坑搬进面试；(3) 工程纪律成型——2024.12 Anthropic《Building Effective Agents》、2025 context engineering 正名、lethal trifecta 安全框架，给了面试官**共同语言**。结果就是题型从"算法工程师"漂移到"AI 系统工程师"。

**在 Agent 链路中的位置**：这一节是所有节的"汇流口"。概念题落在 [[01]]/[[07]]；系统设计题落在 [[02]]/[[04]]/[[05]]/[[08]]；手写题落在 [[01]]/[[03]]；评估题落在 [[09]]/[[10]]；安全题落在 [[12]]；成本题落在 [[11]]。本节不重新讲机制，而是教你**怎么把它们组织成答案**。需要细节时跳回对应节即可（每道题都标了 [[NN]] 链接）。

---

## 3. 历史发展脉络（时间线）

> 主线一句话：**面试题随"技术主线 + 生产踩坑"同步演进**。下面每个里程碑都标注它"为什么变成面试题"。

| 年份 | 里程碑 | 为什么这样演进 / 为什么成为面试题 |
|---|---|---|
| **2020** | **RAG**（Lewis et al., NeurIPS）| 确立"参数化记忆 + 非参数化检索"范式。所有"如何接私有知识 / 减幻觉"系统设计题的祖先；面试问"为什么要 RAG"必须能回溯到这里。 |
| **2022.01** | **Chain-of-Thought**（Wei et al.）| "推理能被 prompting 诱发"。概念题高频项；也是"prompted vs trained reasoning"对比的左端。 |
| **2022.10** | **ReAct**（Yao et al.）+ **LangChain 开源**（Harrison Chase）| `think→act→observe` 定义 agent 主循环最小原语，同月 LangChain 让它可复用，开启"框架时代"。**手写 ReAct loop 至今是最高频手写题**。 |
| **2023.03–06** | **AutoGPT/BabyAGI 病毒走红**（3月）+ **GPT-4 + function calling**（6月）| "全自主 agent"首次出圈但极脆弱，暴露 demo 与生产的鸿沟（"是否过度炒作"争议起点）；function calling 把工具 I/O 从"解析自然语言"升级为结构化调用。 |
| **2023** | **Agent 学术爆发年**：Reflexion / Generative Agents / AutoGen / MetaGPT / CAMEL / ToT / Self-RAG | 反思、记忆、multi-agent、树搜索、agentic RAG 一次性铺开。**今天题库的概念骨架基本在这一年定型**。 |
| **2023.10** | **SWE-bench 发布**（Jimenez et al., ICLR 2024）| 评估从静态 benchmark（HumanEval）转向真实仓库级任务，催生"eval 即系统设计"——2025–26 几乎必有一轮 golden set / 轨迹评估 / 防污染。 |
| **2024.02** | **Gemini 1.5 Pro 100 万 token 上下文** | 直接点燃"RAG is dead"之争，把"长上下文 vs 检索"推成核心争议题。理解二者经济学（成本/时延/Lost-in-the-Middle）成为分水岭。 |
| **2024.03** | **Devin 发布**（Cognition，号称首个 AI 软件工程师）| coding agent 产品化标志。证明差异化在 harness（sandbox/plan/工具集）而非模型——"**模型 vs harness**"成为面试核心心智模型。 |
| **2024.09** | **OpenAI o1 发布**（训练出的推理模型；2025.01 DeepSeek-R1 开源复刻 RL 路线）| 推理从"prompt 诱发"转向"RL 训进权重"。引出"推理模型时代还要不要手写 ReAct"争议；R1 把推理能力与成本同时打下来。 |
| **2024.11** | **MCP 发布**（Anthropic，11/25）| 工具/上下文接入标准化，解决 M×N 集成爆炸（"AI 的 USB-C"）。2025 起 MCP 架构（client/server/transport）成为面试新必考点。 |
| **2024.12** | **Anthropic《Building Effective Agents》** | 给出 agent vs workflow 权威定义 + 5 种编排模式，主张"简单可组合优于复杂框架"，同时点燃"框架 vs 手写"争议。几乎是当下 agent 面试的标准引用。 |
| **2025.06** | **multi-agent 分裂周 + context engineering 正名 + lethal trifecta** | 同周内 Anthropic《multi-agent 研究系统》对撞 Cognition《Don't Build Multi-Agents》；Tobi Lütke(6/18)、Karpathy(6/25) 把"context engineering"正名；Simon Willison 提出"lethal trifecta"。领域成熟为**编排 / 上下文 / 安全**三大工程纪律之争——正是 2025–26 面试主考方向。 |
| **2026 H1** | **评测退役 + 框架收敛 + 协议成熟**：OpenAI 退役 SWE-bench Verified（2/23）、Microsoft Agent Framework 1.0 GA（4/3，AutoGen+SK 合并）、The 2026 MCP Roadmap（3/9）| 三件事直接进面试，且各自给一组争议补上新判据：①OpenAI 自家退役 SWE-bench Verified（污染 + 约 60% 剩余失败题测试/题面有缺陷）——"刷榜≠能力"的最新官方实锤，强化"eval 即系统设计"（接 §6⑥）；②AutoGen + Semantic Kernel 合并进 Agent Framework 1.0、二者转维护态——"框架 vs 手写"要更新口径（接 §6④）；③MCP 从"接入标准"走向"无状态 Streamable HTTP + Tasks 原语 + 企业就绪"，协议题升级（接 §9.8 / [[17]]）。 |
| **2024–2026** | **AI 工程师面试范式迁移** | 从"推 BP / 从零训模型"转向 RAG 架构、agentic 系统设计、评估方法、上下文工程、时延/成本。五大核心题簇覆盖约 90% loop（高级岗再加 RL 训练 [[16]] / 协议经济 [[17]] 两簇进阶，合计七大题簇）——**招聘终于追上了生产现实**。 |

---

## 4. 核心概念与原理：一口气讲清的主线 + 两个手写原语

面试里能让你瞬间显出"懂行"的，是把碎片知识压成**一条可背诵的主线**与**两个能默写的原语**。

### 4.1 主线：从"会想"到"工程化"

```
[1] 让模型会想     CoT(2022) → ReAct(2022) → Reflexion/ToT(2023)
        │  动因：堆参数在多步推理撞墙，把中间计算显式化、可接地、可改进
[2] 让模型能用工具  function calling(2023) → MCP(2024)
        │  动因：把"幻觉事实"换成"调真实 API"，并标准化工具接入(解决 M×N)
[3] 把推理训进权重  o1(2024) → DeepSeek-R1(2025)
        │  动因：人手搭 ToT/Reflexion 有天花板，用 RL 直接把"思考+搜索"训进权重
[4] 把上下文工程化  context engineering(2025)：write/select/compress/isolate
        │  动因：上下文=有限注意力预算(transformer n²)，Lost-in-the-Middle 证明堆长无用
[5] 把产品/评估/安全工程化  Devin·SWE-bench·多智能体·lethal trifecta(2024-26)
           动因：demo 到生产的鸿沟靠 harness/eval/guardrail 填，不靠更强模型
```

会背这五步、且**每步能说出演进动因**，是 [[00]] 导论的核心,也是面试开场最高效的"框架展示"。

### 4.2 元心智模型：model 负责 think，harness 负责 act/loop

> **推理模型 ≠ agent。** 推理模型（o1/R1 为开路者，到 2026 已是旗舰标配——当代如 GPT-5.5、Claude Opus 4.8、Gemini 3、DeepSeek-V4 默认内置长思考）只是把第 [1] 步的 think 做得更强；它不会替你管工具调用、停止条件、错误恢复、状态持久化、检查点续跑——这些全在 **harness**（[[02]]）。

这条解耦是回答几乎所有"陷阱题"的总钥匙：当面试官说"推理模型（o1 开路、如今已是旗舰默认档）这么强了还要 ReAct 吗？"，正确答案是"ReAct 描述的是 agent 控制流（act/loop），不是 prompt 技巧；推理模型让 think 那一步更强,但 act/observe 循环依旧必需"。

### 4.3 手写原语一：ReAct loop（最高频手写题）

```python
def react_agent(task, tools, llm, max_steps=10):
    scratchpad = []                      # 累积 thought/action/observation
    for step in range(max_steps):
        prompt = build_prompt(task, tools, scratchpad)
        out = llm(prompt, stop=["\nObservation:"])   # 让模型生成 Thought + Action
        thought, action = parse(out)     # action = {tool, args} 或 {"finish": answer}
        scratchpad.append(("thought", thought))

        if action.get("finish"):         # 终止条件①：模型主动收尾
            return action["finish"]

        try:                             # 错误恢复：把异常喂回上下文让模型自纠
            obs = tools[action["tool"]](**action["args"])
        except Exception as e:
            obs = f"Error: {e}. Try a different approach."
        scratchpad.append(("observation", obs))

    return "Stopped: max steps reached"  # 终止条件②：步数预算兜底，防死循环
```

**答题加分点**：(1) 必须有**两个终止条件**（主动 finish + max_steps 兜底）；(2) 把工具异常**回灌**进上下文是 Reflexion 思想的最小实现（[[01]]）；(3) `stop` token 防止模型自己幻觉 observation；(4) 失败模式要会讲：错误传播、死循环、对观测质量敏感、长程上下文膨胀。

### 4.4 手写原语二：compaction（上下文压缩重启）

```python
def maybe_compact(history, llm, threshold=0.85, window=200_000):
    if token_count(history) < threshold * window:
        return history
    # 留什么 / 丢什么 是关键取舍
    keep = {
        "architecture_decisions": extract_decisions(history),  # 架构决策：保
        "open_bugs": extract_unresolved(history),              # 未解 bug：保
        "impl_details": extract_recent_code(history, n=5),     # 最近 5 个文件：保
    }
    summary = llm(f"Summarize preserving: {keep}. Drop verbose tool outputs.")
    return [system_prompt, summary] + history[-RECENT_TURNS:]   # 摘要 + 近几轮重启
```

这是 Claude Code 的真实做法（[[03]]/[[13]]）：接近窗口上限时摘要重启，**保留架构决策 / 未解 bug / 实现细节，丢弃冗余工具输出**。考点：过度压缩会丢隐性信息（openQuestion，无原则性解法），所以"留什么"要显式声明而非交给模型自由发挥。

---

## 5. 主流方法谱系：七大题簇 × 答题维度

| 题簇 | 典型问法 | 锚点知识 / 节 | 高分要点 | 高频陷阱 |
|---|---|---|---|---|
| **LLM 基础** | CoT/Self-Consistency 原理；function calling 机制；采样参数(温度/top-p) | [[01]] | 讲清"prompted vs trained reasoning"；Self-Consistency=采样多路+多数投票，不改权重 | 把 temperature 当"创造力旋钮"含糊带过 |
| **RAG 架构** | 设计接私有知识的问答；Naive/Advanced/Modular 三代；为什么不无脑堆长上下文 | [[07]] | chunking/embedding/rerank/引用溯源全链路；用 Lost-in-the-Middle 当反长上下文证据 | "Gemini 1M 了不需要 RAG"——把它当二选一 |
| **agentic 系统设计** | 设计 coding / 客服 / deep research agent | [[02]][[04]][[05]][[08]] | 编排器+工具接口层+记忆+policy/guardrail+observability 五大件；先 single-agent 加足工具 | 一上来堆 supervisor + N 个 subagent 显"高级" |
| **评测** | 如何评一个没标准答案 / 会循环调工具的系统 | [[09]] | golden set + 分层(组件/轨迹/端到端) + LLM-judge(校偏) + 在线监控；`pass^k` 看稳定性 | 只报 `pass@1`；不提 judge 偏置；拿刷榜当能力证明 |
| **LLM 产品系统设计** | 延迟-成本-质量三角；KV-cache；高吞吐服务 | [[11]] | KV-cache 命中率为头号成本指标；PagedAttention/vLLM；缓存友好的 prompt 前缀 | 只谈准确率不谈成本/时延；动态增删工具废掉 KV-cache |
| **Agent 训练与 RL**（进阶/高级岗）| RLHF vs RLVR；GRPO 一句话；agentic RL vs 推理 RL；为真实 SWE agent 设计 RL 管线 | [[16]] | 奖励来源决定一切（RLVR=可验证校验，抗 hacking、只覆盖可验证域）；GRPO=critic-free 组内相对优势；同时报 pass@1/pass@k 区分锐化与扩边界 | 只在 Qwen 单族验证 RLVR 增益；把 reward hacking 当能彻底修掉的 bug |
| **互操作协议与 Agent 经济**（进阶/高级岗）| 画四层协议栈；MCP vs A2A 为何互补；AP2/ACP/x402 三分工；设计可审计的自主购物系统 | [[17]] | 互操作=四层栈（纵向 MCP / 横向 A2A / 身份发现 / 支付）；MCP 解决不了 agent 协作；支付"同层选一、跨层组合" | 把 MCP 当万能协议；以为 Agent Card 自带身份验证；以为"捐基金会=无锁定=安全" |

> **答题通用骨架**（PromptLayer 面试官视角）：意图 → 上下文组装 → 推理 → 动作校验 → 沙箱执行 → 状态更新 → 循环，**全程可观测**。系统设计题先画这条主回路，再逐件展开五大组件。

---

## 6. 主流观点与争议：七组"陷阱 vs 正确姿势"

> 争议题不是让你站队，而是看你**有没有反向判据**。每组给出"答题误区"与"正确姿势"。

**① multi-agent vs 单线程智能体（最高频陷阱）**
- 正方 **Anthropic**（《multi-agent 研究系统》, 2025.06）：orchestrator-worker + 上下文隔离，在"宽而浅"可并行的研究任务上比 single-agent **高约 90%**，token 用量单独解释 **80%** 的效果方差。
- 反方 **Cognition / Walden Yan**（《Don't Build Multi-Agents》, 2025.06）：动作隐含决策，并行 agent 互不可见 → 冲突决策 → 坏结果；默认**单线程线性 agent**，上下文太长就引专门的压缩模型（single-writer 原则）。
- **正确姿势**：先证明 single-agent 不够、且任务**可并行 + 可上下文隔离**再上 multi-agent；multi-agent ~**15x token**，对强共享上下文的 coding 任务明确不划算。区分 wide-shallow（适合 multi-agent）vs deep-sequential（适合 single-agent）。两家共识是"**context engineering 才是关键**"。详见 [[08]]。

**② RAG vs 超长上下文**
- "RAG is dead"派（2024.02 Gemini 1M 触发）：直接塞知识库进窗口，免去 chunking/embedding/索引全套麻烦。
- "RAG 没死"派：**Lost-in-the-Middle**（Liu et al., 2023）证明中间信息被忽略（U 形曲线）；长上下文成本约 8–82× 更贵、时延更高、无法增量更新/溯源。
- **正确姿势**：不是二选一而是**分层互补**——"naive RAG 死了，agentic/sophisticated RAG 更活"。会讲"何时用哪个"才是真本事。详见 [[07]]。

**③ 推理模型时代还要手写 ReAct/CoT 吗？**
- 训练派（o1/R1 开路，当代旗舰 GPT-5.5/Opus 4.8/Gemini 3/DeepSeek-V4 已默认内置长思考）：推理已 RL 内化进权重，对推理模型显式追加 CoT 甚至可能降效。
- harness 工程派（ReAct 作者；Anthropic）：act-observe 循环——工具调用、停止条件、错误恢复——仍必需；ReAct 是控制流不是 prompt 技巧。
- **正确姿势**：守住"model 负责 think、harness 负责 act/loop"的解耦；**推理模型 ≠ agent**，它只是更强的那一步 think。详见 [[01]]/[[02]]。

**④ 框架（LangChain/LangGraph）vs 自建极简 harness**
- 反方 **Anthropic**：最成功的实现用简单可组合模式而非复杂框架；先理解底层 primitives 再决定要不要框架。HuggingFace smolagents 约 1000 行就逼近闭源 Deep Research。
- 正方 **LangChain/Harrison Chase**：框架给 vendor 无关层、记忆、多工具编排、可观测（LangSmith）；LangGraph 提供图式可控编排。
- **正确姿势**：识别产品真正需要的**最小 primitives**，权衡抽象代价；别极端化成"全手写"或"上来就全家桶"。框架战在 2026 收敛——**Microsoft Agent Framework 1.0 GA（2026-04-03）把 AutoGen + Semantic Kernel 合并、二者转维护态**，答题别再拿已停更的旧框架名当主力论据。详见 [[02]]。

**⑤ context engineering 是真范式还是炒概念？**
- 正名派（**Karpathy** 6/25 + **Tobi Lütke** 6/18, 2025）：prompt 只是工业级上下文的极小部分，prompt engineering 是 context engineering 的子集。
- 批评者：不过是 RAG/信息检索/系统设计的重新包装。
- **正确姿势**：落到工程纪律——compaction、KV/prefix-cache 友好布局、JIT 加载 vs 预加载、上下文预算与裁剪。**不是"写更长的 prompt"**。详见 [[03]]。

**⑥ 刷榜 vs 评估工程**
- 刷榜派：跑 SWE-bench/GAIA 拿分即证明能力。
- 评估工程派（SWE-bench/τ-bench 作者；Zheng et al. LLM-as-judge）：benchmark 有污染/过拟合；要 golden set + 分层评估 + LLM-judge（校位置/自偏好偏置）+ 在线监控。"**eval 即新的系统设计**"。
- **正确姿势**：讲清 agent 评估为何难（轨迹非确定）、防污染、judge 偏差校正、离线回归 + 在线监控双轨。**最新官方实锤**：2026-02-23 OpenAI 自己退役 SWE-bench Verified——前沿模型可逐字复现 patch（污染）+ 约 60% 剩余失败题测试/题面有缺陷——正是"刷榜≠能力"的反向判据。详见 [[09]]。

**⑦ 安全侧（lethal trifecta）**
- **Simon Willison**（2025.06）：当 agent 同时具备**私有数据 + 不可信内容 + 对外通信通道**三要素，就无条件易受间接 prompt injection（Greshake et al., 2023），与模型对齐/系统提示加固无关。已在 M365 Copilot、ChatGPT 插件、Slack 真实出事。
- **防御**：打断三角之一（禁外泄通道 / 隔离不可信内容 / 最小权限沙箱）。详见 [[12]]。

---

## 7. 大厂工程实践：拿来当答题弹药的真实案例

**案例 A — Anthropic multi-agent 研究系统（deep research 系统设计范本）**
lead agent 拆解查询并并行派发 subagent，每个 subagent 拥有独立上下文窗口（"叠加" token 容量），且须被赋予**明确目标 / 边界 / 输出格式 / 工具指引**。取舍：明知比单聊耗 **~15x token**，但只对**高价值 + 可并行 + 超单窗口**的研究任务启用；coding 这类强共享上下文任务明确不上。生产侧靠有状态执行 + 检查点续跑 + 全链路 tracing + rainbow 部署（避免运行中 agent 被升级打断）。→ 用于 deep research 系统设计题 + "何时上 multi-agent"陷阱题。

**案例 B — Cognition / Devin（"模型 vs harness"活教材）**
coding agent 产品化标志，差异化在 plan + sandbox + 工具集构成的 **harness**，而非模型。曾给 Devin MCP 任意 spawn/通信其他 Devin，结果"极度混乱"，遂回退**单线程线性 agent + 专门压缩模型**总结历史。唯一可靠的 multi-agent 形态是 root agent 把**隔离子任务**派到独立沙箱、互不共享机器。→ 用于"模型 vs harness"母题 + multi-agent 反方论据。

**案例 C — τ-bench / Sierra（客服 agent 可靠性的真实数据）**
模拟用户 + 域内 API（航空/零售）+ 政策约束，用 `pass^k`（连续 k 次都对）衡量一致性，揭示 SOTA **<50%**、零售 `pass^8` **<25%**（**2024 原论文口径**；继任者 **τ²-bench** 2025 加 dual-control + telecom 域，口径更严）。→ 客服 agent 系统设计题里"可靠性/一致性/回退人工"的硬数据；也是"为什么只报 pass@1 不够"的证据。

**案例 D — Manus（KV-cache 命中率为头号成本指标）**
Sonnet 缓存 $0.30 vs 未缓存 $3 / MTok（**10× 价差**，输入输出比约 100:1）。工程纪律：保持 prompt 前缀稳定、用 **logits 掩码屏蔽工具而非动态增删**（增删会作废 KV-cache）、把文件系统当外部记忆、**故意保留错误轨迹**让模型自纠。→ 成本/延迟系统设计题加分弹药（[[11]]）。

**案例 E — Cursor 语义搜索 vs grep（检索取舍 + 评估工程）**
自建 Cursor Context Bench 离线评测 + 线上 A/B：语义检索离线平均 **+12.5%** 准确率（区间 6.5%–23.5%），大仓（1000+ 文件）代码留存 +2.6%。结论不是替代 grep 而是**二者并用**；因非所有请求都需检索，全量上线增益被稀释（成本/延迟取舍），故按需触发。索引侧本地按 AST 切 chunk、文件路径加密、代码不落明文、Merkle 树增量同步。→ "RAG vs grep"争议 + 隐私/检索取舍 + 评估工程三题通吃（[[07]]/[[09]]）。

**案例 F — MCP 生态（工具层标准化）**
2024.11 开源，一年内被 OpenAI/Google/Microsoft/AWS 采纳成事实标准，用统一协议（client/server/transport）解决 M×N 集成爆炸。→ "tool 调度如何标准化"必考点（[[04]]）。

---

## 8. 我的分析与判断

> **以下为分析观点（非客观事实），是我对面试趋势的研判，仅供决策参考。**

**趋势研判**：

1. **面试正从"知识点"漂向"判断力"，且不可逆。** 当基座模型每季度变强，"会不会用某个 API"的区分度趋零，唯一稳定值钱的是**反向判据**——知道何时**不**该上 agent、何时**不**该上 multi-agent、何时**不**该上 RAG。我判断 2026 之后，"给出反向判据"会成为高级岗的硬门槛，初级岗才停留在"会搭"。

2. **"模型 vs harness"会持续是分水岭，但天平在缓慢右移。** 推理模型变强 → harness 理论上可以变薄。但我的判断是**短期变厚、长期变薄**：当前可靠性缺口（τ-bench 2024 原论文口径 <50%）逼着大家堆 harness（检查点、进度文件、端到端验证）；只有当模型把"长程一致性"也内化了，harness 才会瘦身。面试里能讲清"为什么现在 harness 还在变厚"是加分项。

3. **评估会吃掉系统设计的半壁江山。** "eval 即新的系统设计"不是口号——当输出非确定，唯一能让你迭代的就是评测飞轮。到 2026 年中，agentic 系统设计题已**默认带一轮 eval 设计**、几乎不再单独成题。不会讲 golden set + judge 偏差校正 + 防污染 + 在线监控的人,会被直接筛掉。

**常见坑（我见过最多的失分点）**：
- **把争议题当判断题答**：张口"长上下文取代 RAG / multi-agent 更高级"，没有反向判据 → 直接暴露没踩过生产坑。
- **只报 `pass@1` 不报 `pass^k`**：把"跑通一次"当"可靠"，是稳定性意识缺失的红旗。
- **系统设计不画可观测性**：编排器、工具层、记忆、guardrail 都画了，唯独没有 tracing/监控——生产 agent 没有可观测就是黑盒（[[10]]）。
- **安全题不提 lethal trifecta**：被问"agent 安全"只会答"加 system prompt 防注入"，而正解是**结构性打断三角**——加固提示对间接注入无效。
- **项目深挖只讲做了什么、不讲量化结果**：STAR 的 R（Result）没有数字 = 没说服力。

**最佳实践（我给候选人的可执行建议）**：
- **开场先抛主线**：用 §4.1 的五步主线 + "model vs harness"解耦定调,让面试官知道你有全局图。
- **每个设计先问三件事**：任务是 wide-shallow 还是 deep-sequential？输出确定还是非确定？数据有没有不可信来源？——这三问直接决定 single-agent / multi-agent、要不要 eval、要不要 guardrail。
- **用真实案例当锚**：讲 multi-agent 引 Anthropic +90%/15x token；讲成本引 Manus KV-cache 10× 价差；讲可靠性引 τ-bench `pass^8`<25%（2024 原论文口径，继任者 τ²-bench）。数字 + 出处 = 可信。
- **项目用 STAR + 红线意识**：讲 SearchAgent-Zero 报 0.3991 这个真实核心指标，并主动说明"8B 是框架自报口径、是我守的红线"——**主动暴露口径边界比掩盖更显诚信**（[[09]] 防泄漏）。

---

## 9. 面试考点（题库主体）

### 9.1 概念题（带答题要点）

**C1. CoT 与 Self-Consistency 有什么区别？为什么 Self-Consistency 更可靠？** → CoT 让模型吐中间步骤（单条贪心路径）；Self-Consistency 采样**多条**推理路径再**多数投票**，用集成抵消单条路径的随机错误，**不改权重**就提升可靠性。要点：这是"test-time compute"的雏形；代价是多次采样 = 多倍成本。([[01]])

**C2. function calling / tool use 的机制？模型如何决定何时调哪个工具？** → 学术源流是 Toolformer（自监督学会调什么 API/何时调/传什么参）；工程上靠 (1) 工具的结构化 schema（名字/描述/参数）注入上下文，(2) 模型输出结构化 tool call，(3) harness 执行并回灌 observation。要点：**工具描述质量 ≈ prompt 质量**，Anthropic 仅靠精修工具描述就在 SWE-bench Verified 刷到 SOTA。([[04]])

**C3. RAG 的三代范式（Naive / Advanced / Modular）？** → Naive：检索→拼接→生成；Advanced：加 pre-retrieval（query 改写/扩展）与 post-retrieval（rerank/压缩）；Modular：检索-生成-增强解耦成可编排模块（含 agentic RAG、按需检索）。三要素=检索、生成、增强。要点：引 Gao et al. RAG Survey 当总纲。([[07]])

**C4. Reflexion 如何让 agent 从失败中学习而不更新权重？** → 用**语言化反思** + 情节记忆缓冲：失败后让模型写一段"我错在哪、下次怎么改"的反思，存进记忆，下一试次注入上下文。要点：这是"verbal reinforcement learning"，是 §4.3 错误回灌的完整版；局限——无外部反馈时内在自我校正常常反而掉点。([[01]])

**C5. MemGPT 的分层记忆怎么实现"无界上下文"？** → 借 OS 虚拟内存：主上下文（窗口内，类比 RAM）+ 外部上下文（窗口外，类比磁盘），模型通过**函数调用 + 中断调度**在两者间换页。要点：是 compaction / 记忆分层的标准引用（[[06]]）。

**C6. Lost-in-the-Middle 是什么？对系统设计意味着什么？** → 长上下文中**中间位置**的信息被显著忽略，准确率呈 **U 形**（首尾高、中间低）。意味着：不能无脑堆 context；关键信息要放首尾；是"RAG vs 长上下文"陷阱题的关键证据。([[03]]/[[07]])

**C7. LLM-as-Judge 有哪些偏置？如何缓解？** → 位置偏置（偏向先出现的）、冗长偏置（偏向长答案）、自我偏好偏置（偏向自己生成的）。缓解：交换位置取平均、控制长度、用不同模型当 judge、关键场景人审兜底。要点：与人类偏好一致 >80%（Zheng et al.），但高风险场景不能完全替代人工。([[09]])

### 9.2 系统设计题

**S1. 设计一个 coding agent（参照 SWE-bench）。** 主回路：意图理解 → **代码检索**（grep/ripgrep + 语义检索并用，Cursor +12.5%）→ 定位 → **多文件编辑** → 运行测试 → 读测试反馈 → 迭代修复 → **沙箱执行**。关键组件：(1) harness（plan + sandbox + 工具集，差异化在此不在模型，引 Devin）；(2) 上下文工程（compaction + 进度文件 + git 检查点，长任务靠 harness 不靠更强模型）；(3) 每会话只做一个特性防上下文耗尽；(4) 端到端验证（浏览器自动化）而非只跑单测；(5) eval（SWE-bench Verified + golden set + 防污染）。陷阱：别一上来堆 multi-agent（coding 是强共享上下文，单线程更稳）。([[02]]/[[13]])

**S2. 设计一个客服 agent（参照 τ-bench）。** 组件五件套：(1) **API 工具层**（订单/退款/航班改签等域内 API）；(2) **policy / guardrails**（分层：相关性/安全/PII/审核 + 人工兜底，引 OpenAI 实践指南）；(3) **用户模拟**用于离线评测；(4) **可靠性**用 `pass^k` 衡量（零售 `pass^8`<25% 是现实警钟，**2024 原论文口径**；继任者 τ²-bench 引入 dual-control 更严苛）；(5) **回退与人工接管**（低置信/高风险动作转人工）。陷阱：高风险动作（扣款/改签）必须有确认 + 审计日志；不能只看一次性通过率。([[04]]/[[09]])

**S3. 设计一个 deep research agent（参照 GAIA / Anthropic）。** 架构：orchestrator-worker——lead agent 拆解为可并行子问题，派发独立上下文窗口的 subagent 检索，再综合。关键取舍：(1) 只对 wide-shallow 高价值任务上 multi-agent（~15x token）；(2) subagent 须给明确目标/边界/输出格式；(3) **引用溯源**（每条结论挂来源）；(4) token 成本控制（Anthropic 称 token 解释约 80% 效果方差）；(5) 评测用 GAIA（人类 92% vs GPT-4+插件 15%）+ LLM-judge + 人测三管齐下。对标真实系统：OpenAI / Gemini / Perplexity Deep Research（搜索后端各异）。([[05]]/[[08]])

**S4.（加分）如何低成本高吞吐地服务这个 agent？** KV-cache 命中率为头号成本指标（Manus 10× 价差）→ 保持 prompt 前缀稳定、用 logits 掩码屏蔽工具而非动态增删；PagedAttention/vLLM 做 KV-cache 分页提 2–4× 吞吐；批处理 + 语义缓存；延迟-成本-质量三角显式取舍。([[11]])

### 9.3 手写题

**H1. 手写 ReAct loop（thought→action→observation + 终止条件）。** → 见 §4.3。评分点：两个终止条件、错误回灌、stop token、能讲失败模式。

**H2. 手写 tool 调度（并行 / ReWOO 解耦 / 错误重试）。** → 三种形态：(a) ReAct 串行（每步依赖上一步观察）；(b) **并行**（无依赖的工具调用并发 fan-out，再汇聚）；(c) **ReWOO 解耦**——Planner 先一次性生成全部步骤的计划（用 `#E1`/`#E2` 占位变量引用未来结果），Worker 批量执行，Solver 汇总，省去穿插推理的重复 prompt（HotpotQA 上 ~5× token 效率）。错误重试：指数退避 + 把错误喂回上下文。要点：能根据"工具贵不贵 / 步骤依赖强不强"选 ReAct vs ReWOO。([[05]])

**H3. 手写 compaction（摘要重启 + 保留关键决策）。** → 见 §4.4。评分点：显式声明"留什么丢什么"（架构决策/未解 bug/近 N 文件 vs 冗余工具输出）、阈值触发、摘要 + 近几轮拼接重启。

### 9.4 项目深挖（STAR）

> 用 **Situation → Task → Action → Result**，R 必须带**可量化数字**。

- **maquant（multi-agent 量化交易框架）**：S 量化策略需多源信号融合且评测易泄漏未来信息；T 设计 LLM-as-overlay 混合架构 + **防泄漏评测**；A 严格时序切分、point-in-time 数据、把回测与训练数据隔离；R 给出**无泄漏**的可复现指标（强调"防泄漏"本身是核心贡献，区别于刷分）。([[09]])
- **gewu（A 股投研 multi-agent）**：S 投研需 multi-agent 分工（数据/基本面/情绪/风控）；T 编排可审计的研究流水线；A orchestrator 分派 + 引用溯源 + 人工兜底；R 用真实研报场景验证，强调可解释与可溯源。
- **SearchAgent-Zero（搜索 agent）**：S/T 搜索 agent 的端到端能力评测；A 多步检索 + 综合；R 核心指标 **0.3991**，并**主动声明"8B 是框架自报口径、是我守的红线"**——把口径边界讲清比掩盖更显工程诚信。

**STAR 通用红线**：(1) R 必须有数字；(2) 主动暴露口径/假设/局限；(3) 讲清一个真实取舍（为什么选 A 不选 B）；(4) 一句话失败复盘。

### 9.5 行为题（要点）

- **失败复盘**："讲一次 agent 上线翻车" → 结构：现象（如 token 爆炸/提示注入/评测虚高）→ 根因 → 修复 → **沉淀的机制**（不是"以后更小心"，而是"加了 X 监控/Y guardrail"）。
- **技术取舍解释**："为什么选 single-agent 不选 multi-agent" → 用 wide-shallow vs deep-sequential + 15× token 当判据。
- **面对不确定性的决策**："需求模糊时怎么定方案" → 先做最小可评测原型 + golden set，用数据而非争论收敛。
- **跨团队协作**：强调把"非确定性系统"的预期对齐做在前面（eval 指标 + SLA + 回退策略）。

### 9.6 高频陷阱清单（速记）

| 陷阱 | 一句话正解 |
|---|---|
| 无脑堆长上下文 | Lost-in-the-Middle，中间被忽略；上下文=有限注意力预算 |
| 滥用 multi-agent | ~15× token + 协调/上下文同步开销；先证明 single-agent 不够 |
| 忽视提示注入 | lethal trifecta（私有数据+不可信内容+外泄通道），结构性打断三角 |
| LLM-as-Judge 不提偏置 | 位置/冗长/自偏好偏置 + 校正方法（换位/人审兜底） |
| RAG 无脑检索 | 按需检索（Self-RAG 反思 token）；不是每个 query 都该检索 |
| 只看 `pass@1` | `pass^k` 看稳定性，τ-bench 零售 `pass^8`<25%（2024 原论文口径，继任者 τ²-bench） |
| 把推理模型当 agent | model 负责 think、harness 负责 act/loop |
| 动态增删工具 | 废掉 KV-cache；用 logits 掩码屏蔽 |

### 9.7 Agent 训练与强化学习（对应 [[16]]，进阶/高级岗）

> 训练侧考点。母题：**奖励从哪来、护城河是否前移到"可验证环境 + 生产轨迹"**。

**RL1. RLHF 与 RLVR 的本质区别？为什么 RLVR 偏爱数学/代码而非开放任务？** → 区别在**奖励来源**：RLHF 用人类偏好训出的**学习型奖励模型**（可被 reward hacking、需持续校准），RLVR（Tülu 3 命名）用规则/答案/单测的**程序化校验**（0/1 结果，信号干净、可规模化、抗钻空）。RLVR 只覆盖可验证域；开放写作/客服/研究缺程序化校验，外推得用 rubric/LLM-judge 当代理奖励，越软越易被 hack——这是 RLVR 走出数学/代码的核心瓶颈。一句话：**RLHF 把 RL 当对齐手段，RLVR 把 RL 当能力引擎**。([[16]])

**RL2. 一句话讲清 GRPO，并说它相对 PPO 的优劣。** → 去掉 critic/价值网络，对同一 prompt 采样**一组** G 个回答，advantage =（单条奖励 − 组内均值）/组内标准差，再加 KL 约束防漂移。优：省显存、实现简单（R1 默认）；劣：组基线噪声大、易**熵坍缩**、其 clip 偏置会**放大基座既有行为**——Spurious Rewards 据此证明随机奖励也能在 Qwen 上"涨分"，警示**单模型族验证不可信**。([[16]])

**RL3. agentic RL 与推理 RL 差在哪？** → 推理 RL ≈ **退化的单步 MDP**（近似 bandit，一次生成即结束，奖励直接挂最终答案）；agentic RL 是**时序延展、部分可观测的 POMDP**（多轮、需记忆与信念状态），把规划/工具/记忆/推理/自我改进/感知六能力都纳入 RL 训练对象。核心难点从单轮奖励变成稀疏/延迟奖励下的**长程信用分配**。([[16]])

**RL4.（系统设计）为真实软件工程 agent 设计 RL 训练管线（参照 SWE-Gym）。** → ①**环境**：批量造"任务 + 可执行沙箱 + 单测/校验器"，防污染与 reward hacking（改测试/空实现钻空）；②**冷启动**：少量蒸馏/SFT 修可读性（或论证可纯 RL from base）；③**算法**：GRPO + KL 约束，监控熵坍缩、跨模型族验证；④**verifier**：在采样轨迹上训 verifier，推理期 best-of-N 把训练投入变现成测试时算力；⑤**评估**：同时报 pass@1 与 pass@k，区分锐化与扩边界；⑥**长程**：多轮用交互课程（ScalingInter）控崩溃；⑦**安全**：把 reward hacking 当一级风险、护 CoT 可监控性（[[12]]）。([[16]])

**RL5.（陷阱）"RLVR 后 benchmark pass@1 涨了，是不是推理能力真变强了？"** → 陷阱在评测口径与模型族。Yue et al. 用 pass@k 指出 pass@1 涨可能伴随大 k 的 pass@k **跌**（边界缩窄、RL 只锐化不扩展）；Spurious Rewards 进一步证明随机奖励在 Qwen 上也能"涨分"。正解：**同时看 pass@1 与 pass@k 两条曲线、跨模型族（Llama/OLMo）复现**，区分"采样效率提升"与"能力边界扩展"——这场"扩展 vs 锐化"之争至今未决。([[16]]/[[09]])

### 9.8 互操作协议与 Agent 经济（对应 [[17]]，进阶/高级岗）

> 系统侧考点。母题：**互操作不是一个协议而是一个四层栈；协议安全可能"治不好"**。

**IP1. 画出 agent 互操作的四层协议栈，并说清每层边界。** → 自下而上：**纵向层** MCP（模型↔工具/数据，[[04]]）→ **横向层** A2A / AGNTCY（agent↔agent 发现/委派/长任务）→ **身份与发现** NANDA AgentFacts / A2A Agent Card / OASF（对面是谁、可信吗）→ **支付层** AP2（授权）/ ACP（结账）/ x402（结算）。关键一句：**MCP 不是唯一协议，它解决不了 agent 之间的协作**（Google/Anthropic 官方均称 MCP 与 A2A 互补而非竞争）。([[17]])

**IP2. MCP vs A2A 有什么区别？为什么说互补不竞争？** → MCP **纵向、透明**（摊开 tools/resources/prompts、JSON-RPC，client 信任 server）；A2A **横向、不透明**（只暴露 Agent Card、不暴露内部实现/记忆/工具，原语是 Task 生命周期 + Artifacts，原生支持长任务流式，对等互不信任）。本质是**建模选择**：把对端当"一个工具"（MCP 够）还是"一个不透明的对等智能体"（需 A2A）。旁证：AP2 同时把自己定位为 A2A 与 MCP 的扩展。([[17]]/[[04]])

**IP3. AP2、ACP、x402 三者怎么分工？** → **AP2=授权层**（Mandates: Intent 预授权 / Cart 锁"所见即所付" / Payment 标示 agent 参与，用可验证凭证做不可抵赖审计链，回答 authorization/authenticity/accountability）；**ACP=结账层**（Shared/delegated Payment Token + OAuth，商家保 merchant-of-record，agent 不接触卡号，已落地 ChatGPT Instant Checkout）；**x402=结算层**（HTTP 402 + 稳定币 USDC 的机器微支付，无账号/无 API key）。口诀：**同层选一、跨层组合**——AP2 经 a2a-x402 把链上结算接进来，卡网与链上不是你死我活。([[17]])

**IP4.（系统设计）设计一个让 agent 替用户自主购物并付款的系统（要可审计、防超额、防欺诈）。** → MCP 调商品检索/比价工具（纵向）→ A2A 把"下单"委派给商家 agent、用 Signed Agent Card / AgentFacts 验身份（横向+发现）→ **AP2 Intent Mandate 预授权"买什么+预算上限"、Cart Mandate 锁"所见即所付"**（授权）→ ACP Shared Payment Token（卡网，agent 不接触卡号）或 x402 稳定币（链上）结算。**可审计**：VC 签发的 Mandate 链作不可抵赖证据，token 按"商家+金额"限作用域；**安全**：每个 MCP server 当不可信代码沙箱化、防 tool poisoning（[[12]]），全链路 trace（[[10]]）。说清为何**不**让 agent 直接持有用户原始支付凭证。([[17]])

**IP5.（陷阱）"协议都捐给 Linux Foundation 了，所以没有厂商锁定、也安全了"对吗？** → 错两处。①**中立治理 ≠ 去中心化 ≠ 无锁定**——发起大厂仍掌握事实标准与方向话语权，且"MCP 进 AAIF、A2A 另进 LF"的多基金会格局本身又是新分裂；②治理管不了 **tool poisoning**——根因是 **LLM 分不清"数据"与"指令"**（结构性难题，非工程 bug），2025–2026 CVE 浪潮（mcp-remote CVE-2025-6514，CVSS 9.6）为证。正解：协议安全长期停留在"纵深缓解 + 责任划分"，护城河转向可信执行环境 + 审计/责任链（[[12]]/[[11]]）。([[17]])

### 9.9 网传面经速览（小红书，⚠️ 未核验，仅作方向参考）

> **来源与边界**：以下整理自小红书 2026-06 的公开"面经/八股"笔记（详见根 [[_小红书情报快照-2026-06]]），**均为社媒自述、未独立核实真伪**，不属于本库已校验的题库主体（§9.1–§9.8 才是）。放这里的价值是**校准方向**——看真实候选人被问到什么，验证上面的题簇没漏；具体答案请回前面各节与对应 [[NN]]。

**A. 公司分布（自述）**：腾讯（AI 应用开发一面 / Agent 二面）、字节（大模型算法实习 / AI Agent 开发一面）、百度（后训练算法 / 手撕 tokenizer）、滴滴（Agent 后端两轮）、淘天（Agent 一面）、小红书（AI infra 一面）。

**B. "手撕"高频清单（自述）**：手撕 self-attention / multi-head attention、KL 散度、safe softmax、AUC 与常见损失、RMSNorm / LayerNorm / BatchNorm；算法侧以二分 / DP / 数组 / 字符串为主。**新变种**：百度让"输入 Prompt + 词表、手写 tokenizer 输出子词"——印证手撕正从"背 BP"漂向"实现 LLM 组件"（接 §1 范式迁移）。

**C. Agent 工程真题（自述，括号内为社媒答法，judge 时请对照本库）**：

1. 你们用 ReAct 还是 Plan-and-Execute？（混用：大计划 + 执行中遇异常切 ReAct 局部纠偏 → 本库判据见 [[05]]/[[01]]）
2. 怎么让模型不瞎编工具参数？（function calling 结构化输出 + JSON 校验重试 + 后端默认值兜底 → [[04]]）
3. Agent 长/短期记忆怎么存？（短期 Redis 存会话与状态、长期摘要/偏好抽取入向量库并控长度 → [[06]]）
4. 多智能体怎么协作（如写码 + 审查）？（角色锁定 + 顺序链 + 输出格式约束 → [[08]]）
5. 七大复习方向（与本库 §5 题簇高度重合）：核心概念架构 / 多智能体协同 / 设计模式 / 状态管理 / Evals / Agentic RAG / 多模态。

**D. 2026 新增热词题**：Harness Engineering 与 Loop Engineering（"模型是大脑、harness 是让它进真实世界工作的基础设施"；harness 管"单次跑得稳"、loop 管"自驱动跑多轮"）——展开见 [[02]] §3/§4.7，本库元心智模型可直接复用作答。

**E. 一条面试官视角（自述，但与本库主线吻合）**："有了 AI 以后不能再背八股，要结合场景与实际问题，考察分析问题的思路"——即 §2"题型从算法工程师漂移到 AI 系统工程师"的现场实证。

---

## 10. 参考文献

### 📄 论文

- **ReAct: Synergizing Reasoning and Acting in Language Models** · Yao et al. (Princeton/Google) · 2022 · <https://arxiv.org/abs/2210.03629> — `think→act→observe` 定义 agent 主循环最小原语，最高频手写题原型。
- **Chain-of-Thought Prompting Elicits Reasoning in LLMs** · Wei et al. (Google) · 2022 · <https://arxiv.org/abs/2201.11903> — 用 prompting 诱发逐步推理，推理范式起点。
- **Self-Consistency Improves Chain of Thought Reasoning** · Wang et al. · 2022 · <https://arxiv.org/abs/2203.11171> — 采样多路 + 多数投票，"不改权重提升可靠性"的标准技巧。
- **Toolformer: LMs Can Teach Themselves to Use Tools** · Schick et al. (Meta) · 2023 · <https://arxiv.org/abs/2302.04761> — 自监督学会何时/调什么 API，function calling 学术源流。
- **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks** · Lewis et al. (FAIR) · 2020 · <https://arxiv.org/abs/2005.11401> — RAG 原始论文，所有"外挂知识"系统设计题的源头。
- **Retrieval-Augmented Generation for LLMs: A Survey** · Gao et al. · 2023 · <https://arxiv.org/abs/2312.10997> — Naive/Advanced/Modular 三代范式，RAG 系统设计题总纲。
- **Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection** · Asai et al. · 2023 · <https://arxiv.org/abs/2310.11511> — 反思 token 实现按需检索 + 自我批判。
- **Reflexion: Language Agents with Verbal Reinforcement Learning** · Shinn et al. · 2023 · <https://arxiv.org/abs/2303.11366> — 语言化反思 + 情节记忆跨试次自改进。
- **Tree of Thoughts: Deliberate Problem Solving with LLMs** · Yao et al. · 2023 · <https://arxiv.org/abs/2305.10601> — CoT 泛化为可 BFS/DFS 搜索的思维树。
- **Plan-and-Solve Prompting** · Wang et al. · 2023 · <https://arxiv.org/abs/2305.04091> — 先规划再执行的零样本提示，planner-executor 提示层代表。
- **ReWOO: Decoupling Reasoning from Observations** · Xu et al. · 2023 · <https://arxiv.org/abs/2305.18323> — Planner/Worker/Solver 解耦，HotpotQA ~5× token 效率，手写 tool 调度弹药。
- **Generative Agents: Interactive Simulacra of Human Behavior** · Park et al. · 2023 · <https://arxiv.org/abs/2304.03442> — 记忆流 + 反思 + 规划，multi-agent 记忆设计标杆。
- **Voyager: An Open-Ended Embodied Agent with LLMs** · Wang et al. · 2023 · <https://arxiv.org/abs/2305.16291> — 自动课程 + 可执行技能库，终身学习/技能复用代表。
- **MemGPT: Towards LLMs as Operating Systems** · Packer et al. · 2023 · <https://arxiv.org/abs/2310.08560> — OS 式分层记忆 + 中断调度，无界上下文标准引用。
- **A Survey on LLM based Autonomous Agents** · Wang et al. · 2023 · <https://arxiv.org/abs/2308.11432> — profile-memory-planning-action 统一框架，架构题总览。
- **SWE-bench: Can LMs Resolve Real-World GitHub Issues?** · Jimenez et al. (Princeton) · 2023 · <https://arxiv.org/abs/2310.06770> — 2294 个真实 issue，coding agent 评测事实标准。
- **GAIA: a Benchmark for General AI Assistants** · Mialon et al. · 2023 · <https://arxiv.org/abs/2311.12983> — 人类 92% vs GPT-4+插件 15%，deep research 标准评测集。
- **τ-bench: A Benchmark for Tool-Agent-User Interaction** · Yao et al. (Sierra) · 2024 · <https://arxiv.org/abs/2406.12045> — 模拟用户 + 域内 API + 政策约束，`pass^k` 揭示 SOTA<50%、零售 `pass^8`<25%（**2024 原论文口径**）。继任者 **τ²-bench**（Sierra · 2025 · <https://arxiv.org/abs/2506.07982>）加 dual-control（agent 与用户共改共享状态）+ telecom 域。
- **Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena** · Zheng et al. · 2023 · <https://arxiv.org/abs/2306.05685> — LLM 当评委与人类一致 >80%，并揭示位置/冗长/自偏好偏置。
- **Lost in the Middle: How Language Models Use Long Contexts** · Liu et al. (Stanford) · 2023 · <https://arxiv.org/abs/2307.03172> — 长上下文中部被忽略（U 形），反"无脑堆 context"关键证据。
- **Efficient Memory Management for LLM Serving with PagedAttention (vLLM)** · Kwon et al. (SOSP) · 2023 · <https://dl.acm.org/doi/10.1145/3600006.3613165> — KV-cache 分页，2–4× 吞吐，LLM 服务系统设计基石。
- **Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection** · Greshake et al. · 2023 · <https://arxiv.org/abs/2302.12173> — 间接提示注入分类法，agent 安全题必备。
- **AutoGen: Multi-Agent Conversation Framework** · Wu et al. (Microsoft) · 2023 · <https://arxiv.org/abs/2308.08155> — multi-agent 对话编排，multi-agent 工程起点之一。
- **DeepSeek-R1: Incentivizing Reasoning Capability via RL** · DeepSeek-AI · 2025 · <https://arxiv.org/abs/2501.12948> — 开源 RL 推理模型，把"训练出的推理"与低成本同时落地。
- **A Survey on Evaluation of LLM-based Agents** · Yehudai et al. · 2025 · <https://arxiv.org/abs/2503.16416> — agent 评估能力维度/基准/方法缺口的总纲。
- **Deep Research: A Survey of Autonomous Research Agents** · Zhang et al. · 2025 · <https://arxiv.org/abs/2508.12752> — planning→检索→综合流程与基准，deep research 系统设计最新地图。

### ✍️ 博客与工程文（优先一手）

- **Building Effective Agents** · Anthropic (Schluntz & Zhang) · 2024 · <https://www.anthropic.com/research/building-effective-agents> — workflow vs agent 权威定义 + 5 种编排模式，系统设计题共同语言。
- **How we built our multi-agent research system** · Anthropic Engineering · 2025 · <https://www.anthropic.com/engineering/multi-agent-research-system> — orchestrator-worker +90.2%、~15× token，multi-agent 正方一手数据。
- **Effective Context Engineering for AI Agents** · Anthropic Engineering · 2025 · <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents> — 上下文=有限注意力预算；JIT 检索 + compaction + subagent。
- **Writing Effective Tools for AI Agents** · Anthropic Engineering · 2025 · <https://www.anthropic.com/engineering/writing-tools-for-agents> — 仅靠精修工具描述就在 SWE-bench Verified 刷到 SOTA。
- **Effective Harnesses for Long-Running Agents** · Anthropic Engineering · 2025 · <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents> — 长任务靠 harness：双 agent + 进度文件 + git 检查点 + 端到端验证。
- **Introducing the Model Context Protocol** · Anthropic · 2024 · <https://www.anthropic.com/news/model-context-protocol> — MCP 标准化工具接入，解决 M×N（"AI 的 USB-C"）。
- **Don't Build Multi-Agents** · Cognition / Walden Yan · 2025 · <https://cognition.ai/blog/dont-build-multi-agents> — 单线程 + single-writer 原则，multi-agent 反方论据。
- **Introducing Devin, the first AI software engineer** · Cognition · 2024 · <https://cognition.ai/blog/introducing-devin> — coding agent 产品化，差异化在 harness 非模型。
- **Context Engineering for AI Agents: Lessons from Building Manus** · Manus / Yichao Ji · 2025 · <https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus> — KV-cache 命中率为头号指标（10× 价差），工具用掩码不增删。
- **Context Engineering for Agents (write/select/compress/isolate)** · LangChain · 2025 · <https://www.langchain.com/blog/context-engineering-for-agents> — 上下文工程四策略。
- **A Practical Guide to Building Agents** · OpenAI · 2025 · <https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf> — 先 single-agent 加足工具；manager vs decentralized；guardrails 分层。
- **Open Deep Research / smolagents** · HuggingFace · 2025 · <https://huggingface.co/blog/open-deep-research> — CodeAgent 写 Python 调工具减约 30% 步数，GAIA 55% pass@1。
- **The lethal trifecta for AI agents** · Simon Willison · 2025 · <https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/> — 私有数据+不可信内容+外泄通道并存即可被数据外泄，安全必背框架。
- **12-Factor Agents** · HumanLayer / Dex Horthy · 2025 · <https://github.com/humanlayer/12-factor-agents> — 生产可靠 agent = 工程良好的传统软件 + 关键点点缀 LLM。
- **Improving the agent with semantic search** · Cursor · 2025 · <https://cursor.com/blog/semsearch> — 语义检索离线 +12.5%，结论是与 grep 并用而非替代。
- **Your AI Product Needs Evals** · Hamel Husain · 2024 · <https://hamel.dev/blog/posts/evals/> — eval-driven dev：错误分析 → 分层评测 → 迭代飞轮。
- **Prompt Engineering (Google/Kaggle Whitepaper)** · Lee Boonstra (Google) · 2024 · <https://www.kaggle.com/whitepaper-prompt-engineering> — zero/few-shot、CoT、self-consistency、ReAct 系统化，大厂事实标准参考。
- **LLM Powered Autonomous Agents** · Lilian Weng · 2023 · <https://lilianweng.github.io/posts/2023-06-23-agent/> — 规划+记忆+工具的 agent 心智模型经典综述。
- **"+1 for context engineering over prompt engineering"** · Andrej Karpathy (X) · 2025 · <https://x.com/karpathy/status/1937902205765607626> — context engineering 正名事件。
- **The Agentic System Design Interview: How to evaluate AI Engineers** · PromptLayer · 2025 · <https://blog.promptlayer.com/the-agentic-system-design-interview-how-to-evaluate-ai-engineers/> — 面试官视角五大评分维度：编排器/工具层/记忆/policy/observability。
- **10 Essential Agentic AI Interview Questions for AI Engineers** · KDnuggets · 2025 · <https://www.kdnuggets.com/10-essential-agentic-ai-interview-questions-for-ai-engineers> — 高频概念/设计题清单；LLM 只占生产 agent 约 20%。

### 📚 官方文档

- **Model Context Protocol 规范** · Anthropic · 2024– · <https://modelcontextprotocol.io/> — client/server/transport 架构与工具接入标准。

---

> **交叉链接**：本节是 [[00]]–[[14]]（及进阶的 [[16]]/[[17]]）的"出口层"。概念题回 [[01]] / [[07]]；系统设计回 [[02]] / [[04]] / [[05]] / [[08]]；手写题回 [[01]] / [[03]]；评估回 [[09]] / [[10]]；安全回 [[12]]；成本/服务回 [[11]]；大厂案例回 [[13]]；训练侧回 [[16]]；协议/经济回 [[17]]；速查回 [[14]]。
