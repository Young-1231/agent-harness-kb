> 状态：🟢 已校验

# 11 · 生产工程（Production Engineering）

> **定位**：把一个能在 demo 里跑通的 Agent，变成**能在真实流量下稳定、便宜、可控运行**的系统。
> 本节是横切层：上承 [[02]] Harness 运行时（推理循环的每一跳都要落到真实的服务、缓存、限流上）、[[03]] 上下文工程（缓存命中率取决于上下文怎么排）、[[04]] 工具与 MCP（并行工具调用是降时延的一等手段）；
> 下接 [[08]] 多智能体编排（single-agent vs multi-agent 是生产架构的核心选型）、[[09]] 评估（可靠性靠评测兜底）、[[10]] 可观测性（TTFT/token/spend 都是一等监控指标）、[[12]] 安全与对抗（guardrails 与 microVM 隔离）。

---

## 1. TL;DR / 速览

**本节地图**：demo→上线的三难（时延/成本/可靠）→ 推理服务架构（continuous batching / PagedAttention / prefill-decode 解耦）→ 时延优化（streaming / 投机解码 / 并行工具调用）→ 成本与 token 预算（缓存 / 路由 / 级联 / Batch）→ 容错（fallback / 熔断 / retry 风暴）→ HITL 与 guardrails → multi-agent 可靠性与可观测 → 架构选型（build vs buy、single-agent vs multi-agent、容器 vs microVM）。

**核心结论（先看这 5 条）**：

1. **生产工程是"原型≠产品"的分水岭，由三根支柱撑起：时延、成本、可靠性**。Gartner 在 2024-07 曾预测到 2025 年底 ≥30% 的生成式 AI 项目会在 PoC 后被弃；据报道实际到 2025 年底约 50% 被弃，主因正是数据质量、风控、成本失控、价值不清——这四样几乎全落在本节。把 demo 做酷很容易，把它做到 SLO 可签、成本可控、出错可恢复才是真功夫。
2. **时延要拆成 TTFT 与 TPOT 两个量分别治**。`总时延 ≈ TTFT + TPOT × 输出长度`。TTFT 由 prefill（算力密集）决定、靠缓存复用前缀来压；TPOT 由 decode（访存密集）决定、靠 continuous batching / 投机解码来压。最有效的"降时延"手段其实是 **streaming**——它不降真实时延，但把感知时延降到首 token 出现的瞬间。
3. **成本治理的核心是 token 经济学，而 Agent 是 token 黑洞**。Anthropic 实测：agent 约用普通 chat 的 ~4x token，multi-agent 约 ~15x。所以降本不是"换个便宜模型"那么简单，而是一套组合拳：**prompt/KV 缓存（读取仅 0.1x 输入价）+ 路由/级联（省 40–98%）+ Batch API（非实时 5 折）+ 按 feature/user/request 维度计量与告警**。
4. **可靠性是工程问题，不是玄学**：评测是脊梁（"evals 是新的单元测试"），fallback/熔断/重试是骨架，可观测（全链路 tracing）是神经。multi-agent 系统的失败可被归因——MAST 由约 150 条专家标注 trace（标注一致性 κ=0.88）归纳出 14 种失败模式（1600+ 是其后用 LLM-judge 扩展出的 MAST-Data 数据集），把"为什么我的 agent 又挂了"变成可研究对象。
5. **顶层有四场没有标准答案的架构选型**：build vs buy（共识在收敛为"买基础设施、自建智能层"）、single-agent vs multi-agent（Cognition vs Anthropic 正面对撞）、prompt cache 显式 vs 自动（Anthropic vs OpenAI）、运行自生成代码用容器 vs microVM（密度 vs 隔离）。没有银弹，只有按场景取舍。

---

## 2. 定位与动机：在 Agent 链路里，生产工程解决什么

2020 年 GPT-3 开放 API，第一次让人可以"调用基础模型"而不是"自己训模型"做产品，瓶颈从训练转移到应用层；2022 年 ChatGPT 引爆生成式 AI 淘金潮，"随手做个酷东西"成了默认起点。但同一年，业界也被推到一个尴尬现实面前：**原型很容易，产品很难**。Chip Huyen 在 2023 年的《Building LLM applications for production》里第一次把这道鸿沟清晰命名——提示词歧义、成本、时延、测试/评测、换模型带来的回归——后续整个领域都围绕这几个问题组织，并在 2025 年沉淀成一门叫 "AI engineering" 的学科。

放到 Think–Act–Observe 的 Agent 循环里看，生产工程是贯穿全程的**横切关注点**，对应三根支柱：

- **时延（latency）**：用户等不起。循环每多转一圈，就多一次 prefill+decode 的往返；工具调用串行还是并行、要不要流式吐字、KV 能不能复用，直接决定用户体感。
- **成本（cost）**：循环每转一圈都在烧 token，而 Agent 天然要把工具结果、历史、记忆反复回灌上下文，token 增长是超线性的。没有预算护栏，一个跑飞的 agent 能把账单烧到 chat 的几十倍。
- **可靠性（reliability）**：LLM 是非确定性组件，工具会超时、provider 会限流、自生成的代码可能有害。生产系统必须能**降级、回退、恢复、审计、隔离**，否则一个长尾错误就拖垮整条链路。

这三者不是孤立的，而是**互相挤压的三角**：要更低时延常要更贵的硬件或更强的模型（涨成本）；要更强可靠性要加 guardrails、重试、HITL（涨时延）；要降成本走小模型/缓存可能损质量（伤可靠）。生产工程的全部艺术，就是在给定 SLO 预算下找这个三角的最优点。

### 2.1 AgentOps 伞形导览：把评估 / 可观测 / 生产缝成一条运营主线

DevOps 管代码、MLOps 管模型、LLMOps 管提示与上下文；Agent 又叠上"自主决策 + 多步工具调用 + 长程状态"，于是需要一把更大的伞——**AgentOps**。Google/Kaggle《Agents Companion》v2（2025-05，76 页，作者含 Antonio Gulli 等）把它系统化：在 DevOps/MLOps 之上专门管 agent 的**评估、可观测、部署与治理**，并把 Agentic RAG 与评估指标、生产化视为一体。

落到本库的节序，AgentOps 恰好把三节缝成一条**闭环运营主线**：

- **[[09]] 评估 = 脊梁**：上线前用 evals / LLM-as-judge 建回归基线，是"能不能发"的门禁。
- **[[11]] 生产（本节）= 骨架**：把通过评估的 agent 部署成 SLO 可签、成本可控、可降级恢复的服务。
- **[[10]] 可观测 = 神经**：上线后用全链路 tracing 采下 TTFT / token / spend / 工具成败。
- **回流 [[09]]**：把生产遥测挖出的失败案例回灌评测集，形成"评估 → 部署 → 观测 → 再评估"的闭环。

一句话：评估定义"对不对"、生产保证"跑得稳付得起"、可观测告诉你"线上到底怎样"，三者缺一，agent 都迈不过生产门槛。本节是这条主线的中段——要把闭环真正跑起来，需配合 [[09]] 的评测体系与 [[10]] 的遥测管线一起读。

---

## 3. 历史发展脉络（2020 → 2026）

> 两条主线：一条是**底层推理服务**从"按请求批处理"一路精细化到"KV 为中心的解耦调度"；另一条是**应用层工程**从"重写胶水代码"演进为"有评测、有路由、有缓存、有标准（MCP）的成熟栈"。两条线在 2024–2026 汇流成 "AI engineering"。

- **2020-06 · OpenAI 开放 GPT-3 API**。第一次能"调用基础模型"而非自己训模型，瓶颈从训练转移到应用层，催生 prompt engineering，也埋下 demo→上线的鸿沟。
- **2022-07 · OSDI · Orca 提出 iteration-level scheduling（continuous batching）**。把调度粒度从 request 降到 iteration + selective batching，填满 GPU 空闲气泡，在 GPT-3 175B 上较 FasterTransformer 高 36.9× 吞吐。*为什么*：这是现代高吞吐 LLM 服务的奠基，vLLM/TGI 全部沿用。
- **2022-11 · Speculative decoding 原始论文（Leviathan 等，arXiv；ICML'23）**。draft+verify 在不改变输出分布的前提下打破自回归逐 token 瓶颈，无损 2–3× 提速。*为什么*：开启了"时延优化"这条独立主线。
- **2022-10/11 · LangChain 开源 + ChatGPT 发布**。人人都在重写检索/工具/记忆/串联的胶水代码，编排框架出现让 demo 跑得快——这是 "LLM 应用栈" 的第一层，也正式把"原型≠产品"推到台前。
- **2023-04/06 · 给鸿沟命名 + 给角色命名**。Chip Huyen《Building LLM applications for production》拆解 demo→上线五大难；a16z《Emerging Architectures for LLM Applications》给出 in-context learning + RAG + 编排的参考栈；swyx《The Rise of the AI Engineer》为"用 API 消费模型的应用型构建者"命名。*为什么*：领域开始有共享心智模型。
- **2023-06 · vLLM / PagedAttention（Kwon 等，UC Berkeley）**。2023-06-20 开源，把 KV cache 当 OS 虚拟内存分页管理，近零碎片、跨请求共享，吞吐最高 24×；其 PagedAttention 论文发表于 SOSP'23（2023-10 召开，arXiv 预印本 2309.06180）。*为什么*：从基础设施层攻克成本/时延，让自托管开源模型在经济上可行，build 在 build-vs-buy 里成为真选项。
- **2023 · FrugalGPT + GPTCache + NeMo Guardrails / Llama Guard**。FrugalGPT 第一次把推理成本当一等公民系统化（prompt 适配 + 近似缓存 + LLM cascade，省至 98%）；GPTCache 落地语义缓存；NeMo Guardrails（可编程 rails）与 Llama Guard（模型化审核）成为生产安全层标配。
- **2024-03 · Hamel Husain《Your AI Product Needs Evals》**。把可靠性重构为"度量问题"——evals 是新的单元测试，失败的 AI 产品几乎都源于没有评测体系。
- **2024 · 服务架构精细化：DistServe / Splitwise / Sarathi-Serve + SGLang/RadixAttention + Medusa/EAGLE**。prefill/decode 解耦与 chunked-prefill 按 TTFT/TPOT 两类 SLO 分别优化 goodput；RadixAttention 用 radix 树自动复用共享前缀 KV；Medusa/EAGLE 用自草稿头免掉独立 draft 模型。
- **2024-07 · LMSYS 开源 RouteLLM**。把成本-质量权衡操作化：简单 query 走便宜模型、难的走前沿模型，同质量降本 2×+。同期 Mooncake（Kimi）以 KVCache-centric 解耦在生产处理 100B+ tokens/天，长上下文吞吐最高 +525%（FAST'25）。
- **2024 · 厂商把降本/集成产品化**。Anthropic Prompt Caching（重复上下文降本 90%、时延 85%）+ OpenAI 自动 prompt caching（>1024 token 公共前缀，输入按模型分档省 GPT-4o~50% / GPT-4.1~75% / GPT-5 系~90%）+ Cursor Fast Apply（speculative edits）+ Google Vertex context caching（重复输入降约 75%）；11 月 Anthropic 开源 MCP（"工具/上下文的 USB-C"），标志栈走向互操作。
- **2025 · "AI engineering" 成体系**。Chip Huyen O'Reilly《AI Engineering》出版 + Karpathy "Software 3.0" 主题演讲（6/17）+ Gartner（2024-07）预测到 2025 年底 ≥30% GenAI 项目将在 PoC 后被弃（据报道实际约 50%）——"POC 坟场"现实到来，生产工程成为分水岭。同年 MAST 把 multi-agent 失败做成 14 类可研究的失败模式。
- **2025-06 · 架构辩论白热化**。Anthropic《How we built our multi-agent research system》（orchestrator-worker multi-agent）与 Cognition《Don't Build Multi-Agents》（单线程上下文工程）给出对立架构观，成为生产选型的核心辩论。
- **2025-08 · OpenAI GPT-5 内置实时路由器**。把"快模型 vs thinking 模型"的路由搬进前沿端点内部——直接搅动"我到底要不要自建路由"之争。
- **2025-12 · Menlo Ventures《2025 State of GenAI in Enterprise》**。企业 GenAI 支出达 $37B（2024 为 $11.5B，约 3.2x），但据其调研仅约 16% 的部署算得上真正的 agent。*为什么*：钱在猛涌、能跨过生产门槛的仍是少数——本节三难正是那道门槛的具体形状。
- **2026-04 · Anthropic《Scaling Managed Agents: Decoupling brain from hands》**。把长程 agent 拆成 brain / hands / session 三层托管，实测 TTFT p50 约 -60%、p95 降幅超 90%；凭证不入沙箱（走 vault+proxy）。*为什么*：生产工程"下沉进平台"的最新一步——把长程 agent 的服务化做成可托管标准件。
- **2026-04 · Cognition《What We Learned Building Cloud Agents》**。为安全运行不可信的自生成代码，放弃共享内核容器、改用每会话独立内核的 microVM（投入一年多 hypervisor 工程），并用 hypervisor 级快照在 CI/评审等异步空档关机省算力、恢复原样续跑。

---

## 4. 核心概念与原理（讲透机制）

### 4.1 两个时延量：TTFT 与 TPOT

LLM 推理分两个物理阶段，对应两类时延，必须分开优化：

- **Prefill（预填充）**：一次性处理整个输入 prompt、把 KV cache 算出来。决定 **TTFT（Time To First Token，首 token 时延）**。它是**算力密集（compute-bound）**的，输入越长越慢，是缓存复用的主战场。
- **Decode（解码）**：逐 token 自回归生成，每步读一遍全部 KV cache。决定 **TPOT（Time Per Output Token，每输出 token 时延）**。它是**访存密集（memory-bound）**的，batch 越大越划算，是 continuous batching / 投机解码的主战场。

```text
端到端时延（Databricks 公式）：
  Latency ≈ TTFT + TPOT × 输出 token 数
  → 长输入/RAG/长系统提示 → TTFT 痛 → 上前缀缓存
  → 长输出/agent 多轮 → TPOT × N 痛 → 上 continuous batching / 投机解码
  → 用户体感 → 上 streaming，把"感知 TTFT"降到第一个 token 出现
```

### 4.2 服务层吞吐：continuous batching + PagedAttention

朴素的"按请求静态批处理"有两个浪费：① 短请求要等批里最长的请求一起结束（气泡）；② KV cache 按最大长度预留显存（碎片）。两项基石各治一个：

- **Continuous batching（Orca 的 iteration-level scheduling）**：调度粒度从"整个请求"降到"一次 token 迭代"。每生成一步就检查：完成的请求立刻让位、等待的请求随时插入，GPU 气泡被填满。代价是吞吐与单请求尾时延的平衡——批越满吞吐越高，但单条请求可能被更多邻居拖慢。
- **PagedAttention（vLLM）**：把 KV cache 切成固定大小的 block，像 OS 虚拟内存分页一样按需分配、非连续存储，近零碎片，且**相同前缀的 block 可跨请求共享**（copy-on-write）。这是 RadixAttention/prefix caching 的物理基础。

```text
# continuous batching 直觉（伪代码）
running = []                       # 正在 decode 的请求
while True:
    admit_new_requests(running, kv_budget)   # 有空闲 KV block 就放新请求进来
    logits = model.step(running)             # 一次迭代，所有 in-flight 请求一起前向
    for req in running:
        req.append(sample(logits[req]))
        if req.done(): emit(req); free_kv(req); running.remove(req)
```

### 4.3 prefill/decode 解耦 vs chunked-prefill

prefill（算力密集）和 decode（访存密集）放同一张卡上会互相干扰：一个长 prompt 的 prefill 会"卡住"正在 decode 的请求，造成 TPOT 抖动。两条解法：

- **解耦（DistServe / Splitwise / Mooncake）**：把 prefill 和 decode 拆到不同 GPU（甚至异构硬件），各自按 TTFT/TPOT 独立扩缩配资源，彻底消除干扰。代价是要跨节点传 KV cache、运维更复杂。DistServe 报告 7.4× 请求量或 12.6× 更紧 SLO；Splitwise 1.4× 吞吐且成本降 20%。
- **同机 chunked-prefill（Sarathi-Serve）**：把长 prefill 切成小块，与 decode 步骤交错调度（stall-free），不暂停 decode 即可兼顾吞吐与时延，无需额外硬件和跨机 KV 传输，部署更简单（最高 6.9×）。

Mooncake 更进一步做成 **KVCache-centric**：池化 CPU/DRAM/SSD 当 KV 缓存层 + SLO 调度，是这套思路在 Kimi 的超大规模生产验证。

### 4.4 投机解码（speculative decoding）：打破逐 token 瓶颈

decode 慢在"必须一个 token 算完才能算下一个"。投机解码用 **draft + verify**：先让一个便宜的"草稿"快速猜出未来 k 个 token，再让大模型**一次前向并行验证**这 k 个——接受的部分白赚，拒绝的从分歧点重来。关键性质：**输出分布与原模型完全一致（无损）**。

```text
while not done:
    draft = draft_model.generate(ctx, k)        # 便宜地猜 k 个 token
    probs = target_model.forward(ctx + draft)   # 大模型一次前向并行验证 k+1 个位置
    accept = []
    for i, tok in enumerate(draft):
        if rand() < min(1, p_target/p_draft):   # 接受-拒绝采样保持分布不变
            accept.append(tok)
        else:
            accept.append(resample(p_target));  break
    ctx += accept                                # 一步吃进多个 token
```

草稿从哪来，是这条线的主要分叉：
- **独立 draft 模型**（Leviathan / staged speculative）：通用、易接现成小模型，但要维护第二个模型、占显存。
- **自草稿头 self-draft**（Medusa 加多个并行解码头 + 树状注意力；EAGLE 在 feature 层自回归并注入下一步 token）：省显存、无需第二模型，分布对齐更好、acceptance 更高（~3×）；代价是要为每个目标模型训练草稿头（训练方法见 [[16]]）。
- **领域先验当草稿**（Cursor speculative edits）：代码改写约 90% 不变，直接拿**原文件当草稿**，大模型只验证，做到 ~1000 tok/s。

### 4.5 缓存：精确前缀复用 vs 语义相似复用

缓存是同时降时延（省 prefill）和降成本（省输入 token 计费）的最高杠杆，分两类，风险截然不同：

- **精确前缀 / KV 复用（确定性、无正确性风险）**：RadixAttention 用 radix 树自动复用共享前缀 KV；Prompt Cache 用 schema 定义可复用 prompt 模块、预存其 attention 状态（TTFT 最高降 8×）。厂商产品化为 prompt caching：**Anthropic 显式 `cache_control` 断点**（写 1.25x/5min 或 2x/1h，读仅 0.1x）vs **OpenAI 自动命中**（>1024 token 公共前缀，无需改代码，输入按模型分档省 GPT-4o~50% / GPT-4.1~75% / GPT-5 系~90%）。工程要点：**把动态内容移出可缓存前缀**，让稳定的系统提示/工具定义/长文档在前缀里最大化命中。
- **语义相似复用（命中率高但有误命中风险）**：GPTCache 把 query 编码成 embedding，相似度超阈值就直接返回历史答案，命中时快 2–10×、省 API 钱。代价是"相似 ≠ 等价"，可能返回错误答案，必须配短 TTL + 阈值调优 + 适用场景白名单。

### 4.6 路由与级联：把成本-质量权衡操作化

不是所有请求都配得上前沿模型。两种降本结构：

- **级联（cascade，串行）**：先用便宜模型答，置信度不够再升级到更强模型（FrugalGPT；MoT cascade 用弱模型答案一致性判难度，仅需约 40% 成本匹配强模型）。
- **路由（router，并行前置）**：用一个分类器/小模型预判难度，**一次性**把请求分给合适的模型（RouteLLM 用偏好数据训路由器，同质量降本 2×+；路由器训练见 [[16]]）。

```text
# 级联（先便宜后贵）
ans = cheap_model(q)
if confidence(ans) < tau:        # 自评/verifier/答案一致性
    ans = strong_model(q)
# 路由（前置一次决策）
model = router.pick(q)           # 训练好的分类器
ans = model(q)
```

### 4.7 容错：fallback / 熔断 / 防 retry 风暴

生产必然遇到 provider 宕机、限流、超时。基本原语：

- **fallback（回退）**：LangChain `with_fallbacks` 按顺序试到成功；可在单 runnable 或整链级别设（不同模型常需不同 prompt，故**链级回退更稳**）。Vercel AI Gateway 把这一层外置到统一网关，provider 宕机自动按 host 顺序回退。
- **熔断（circuit breaker）+ 超时重试**：对反复失败的下游快速失败、避免拖垮整条链。
- **防 retry 风暴**：multi-agent 图里，每个节点都开 `with_retry` 会**乘性放大**——A 重试 3 次、每次触发 B 重试 3 次……瞬间 9×、27× 放大。对策：在 router/图级别集中降级，而非在每个工具上盲开重试。

### 4.8 HITL 与 Guardrails

- **HITL（human-in-the-loop）**：在高风险写操作前插审批点、可中断/可回滚，是 scalable oversight 的工程化。难点是"插桩点放哪、需要多少人介入、怎么度量监督有效性"。
- **Guardrails**：输入/输出双向过滤。两条路线——**模型化**（Llama Guard，指令微调分类器，泛化强、零样本适配新分类法）vs **可编程规则**（NeMo Guardrails 用 Colang，确定、可审计、可控对话路径）。共同代价是**每加一道护栏就多一份时延/成本**，且护栏本身也可能被绕过。

### 4.9 durable execution 与会话恢复：让长程 agent 扛得住重启与空档

Agent 已从"一问一答"变成动辄跑几十分钟到几小时的长程任务，期间必然遇到进程崩溃、节点重启、限流退避，以及 CI / 代码评审等**异步空档**（提交后要等几分钟到几十分钟才有结果）。一崩就从头重来，长程 agent 在成本和体验上都不成立。**durable execution（持久化执行）** 就是把执行状态外置、可检查点、可从断点恢复，让 agent"断了能续"。

三条已落地的工程路径，正把"会话恢复"从应用层手写下沉为平台能力：

- **会话状态解耦（Anthropic Managed Agents，2026-04）**：把长程 agent 拆成 **brain / hands / session 三层**，session 层专管会话状态，使会话可托管、可暂停、可恢复；服务化后实测 TTFT p50 约 -60%、p95 降幅超 90%（凭证不入沙箱、走 vault+proxy，见 [[12]]）。
- **断点恢复 + 计划外置（Anthropic Claude Research）**：出错从断点恢复而非重启，并把研究计划写入 memory——既防 200k 上下文截断，本身又是天然检查点（见 §7 案例 C）。
- **hypervisor 级快照（Cognition Cloud Agents，2026）**：用每会话独立 microVM 的内存 + 进程树 + 文件系统快照，在异步空档**关机省算力、恢复时原样续跑**（见 §7 案例 D、[[12]]）。

> 把三条放在一起看：长程 agent 的"会话恢复"正在变成像数据库事务一样的底座默认件——Managed Agents 做成 session 层托管、Cognition 做成 hypervisor 快照，应用工程师越来越不必自己手写检查点。

### 4.10 Agent FinOps 与成本工程：从"基础设施消耗"到"单位成果成本"

Cloud FinOps 时代衡量的是"基础设施消耗"——GPU/CPU 小时、存储、带宽，按资源用量记账。但 Agent 把成本的计量单位悄悄换了：一次"任务"背后是不确定次数的模型调用、工具调用、重试、记忆读写与不断膨胀的长上下文，同一类请求两次跑的花费可能差出几倍。于是一个新兴但有据可循的实践方向正在成形——**Agent FinOps**，主张把成本指标从"每小时基础设施"重构为**单位成果成本（cost per outcome / cost per task）**：不再只问"这个月 GPU 花了多少"，而是问"解决一张工单 / 跑完一次研究 / 合并一个 PR 平均花多少、波动多大"。

为什么 agent 的成本天生比 chat 难预测——四个放大源叠加：
- **多跳调用**：一次任务循环里模型与工具被反复调用，步数本身是非确定的（见 §2 三难）。
- **重试与回退**：失败重试、跨厂商 fallback 都在悄悄追加 token，multi-agent 图里还会乘性放大（见 §4.7）。
- **记忆增长**：长程会话的记忆 / 历史越积越多，每轮回灌的上下文随时间单调上涨（见 [[06]]）。
- **长上下文**：长输入抬高 prefill 成本，TTFT 与输入计费同涨（见 §4.1）。

这套实践目前主要由行业组织与厂商在推动（FinOps Foundation 已把 agentic 用例纳入 AI FinOps 议题，Finout、Orq.ai 等给出 per-agent / per-task 成本归因与告警的产品视角），定位上属于"**新兴但有据可循**"——可作为**方向**采纳，但口径尚未标准化，**不宜当权威基准数字引用**。落到工程上，它与本节既有的预算护栏 / 计量告警是一体两面：护栏是"别把账单烧飞"的闸门（§4.7、§8 常见坑⑤），FinOps 则是"每单成果到底值不值"的账本。单位成果成本进一步上接 Agent 经济层的计费与结算（按调用/任务计价、机器对机器支付，见 [[17]]）。

> 📊 **市场现实锚点（为什么"单位成果成本"现在被逼成必答题）**：Menlo Ventures《2025 State of GenAI in Enterprise》(2025-12) 记企业 GenAI 支出已达 $37B（2024 为 $11.5B，约 3.2x），但据其调研**仅约 16%** 的部署算得上真正的 agent；Deloitte《Tech Trends 2026》（agentic AI strategy）亦记**仅约 11%** 已投产（另 14% 有可部署方案、38% 在 pilot）。钱在猛涌、真正跨过生产门槛的仍是少数——当投入快速放大而产出仍稀薄，"每一块钱换回多少成果"自然从可选项变成必答题。

---

## 5. 主流方法谱系（横向对比）

### 5.1 推理服务/时延优化技术 × 维度

| 技术 | 主治 | 机制 | 收益（论文口径） | 代价/风险 |
|---|---|---|---|---|
| Continuous batching（Orca） | 吞吐 | iteration-level 调度填气泡 | 36.9× vs FasterTransformer | 单请求尾时延受邻居影响 |
| PagedAttention（vLLM） | 吞吐/显存 | KV 分页 + 前缀共享 | 最高 24× 吞吐 | 引擎复杂度 |
| Prefill/decode 解耦（DistServe/Splitwise） | TTFT+TPOT 干扰 | 两阶段拆到不同 GPU | 7.4× 请求 / 成本-20% | 跨机传 KV、运维重 |
| Chunked-prefill（Sarathi-Serve） | 吞吐-时延权衡 | 切块交错、stall-free | 最高 6.9× | 同机仍有耦合 |
| RadixAttention/Prompt Cache | TTFT | 前缀 KV 自动复用 | TTFT 最高 8× | 仅命中共享前缀 |
| 投机解码 独立 draft（Leviathan） | TPOT | 小模型草稿+并行验证 | 无损 2–3× | 维护第二模型、占显存 |
| 自草稿 Medusa/EAGLE | TPOT | 多解码头/feature 自回归 | 无损 ~3× | 需训练草稿头 |
| Speculative edits（Cursor） | TPOT | 原文件当草稿 | ~1000 tok/s（9–13×） | 仅强先验场景 |
| 并行工具调用（LLMCompiler） | agent 端到端时延 | Planner/Executor DAG 并行 | 时延-3.7×、成本-6.7× | 需可并行的任务图 |
| Streaming（SSE） | 感知时延 | token 增量推送 | 体感最优 | serverless 计活跃时长 |

### 5.2 成本/可靠性手段 × 维度

| 手段 | 主治 | 代表 | 收益 | 正确性风险 |
|---|---|---|---|---|
| 精确前缀缓存 | 成本+TTFT | Anthropic/OpenAI prompt cache、RadixAttention | 降本最高 90%、读 0.1x | 无 |
| 语义缓存 | 成本+时延 | GPTCache | 命中快 2–10× | **有误命中** |
| Batch API | 成本 | OpenAI Batch | 非实时 5 折 | 牺牲实时性 |
| 路由 | 成本 | RouteLLM、GPT-5 内置 | 同质量 2×+ | OOD 误路由 |
| 级联 | 成本 | FrugalGPT、MoT cascade | 省 40–98% | 分布外可靠性存疑 |
| Fallback/网关 | 可用性 | LangChain `with_fallbacks`、Vercel AI Gateway | 抗宕机/限流 | 质量回退 ≠ 可用性回退 |
| Guardrails | 安全 | Llama Guard / NeMo | 拦有害输入输出 | 加时延、可被绕过 |
| HITL | 可控 | 审批点/可中断 | 高风险兜底 | 规模化难、拖慢 |

---

## 6. 主流观点与争议（≥2 组对立面）

**争议一：服务架构——解耦 prefill/decode vs 同机 chunked-prefill？**
- *解耦派*（DistServe / Splitwise / Mooncake）：彻底消除两阶段干扰，可按 TTFT/TPOT 独立扩缩与配（异构）硬件，超大规模/长上下文下 goodput 更高。
- *同机派*（Sarathi-Serve）：chunked-prefill + stall-free 调度无需额外硬件与跨机 KV 传输即可满足 SLO，部署运维更简单。
- *现状*：LLM serving 系统研究圈（OSDI/ISCA/MLSys）的共识是"看规模与负载"——超大规模、长上下文、严 SLO 倾向解耦；中小规模倾向同机。三者（投机解码 × 解耦 × 前缀缓存）如何联合优化，仍是开放问题。

**争议二：投机解码——独立 draft 模型 vs 自草稿头？**
- *独立 draft 派*（Leviathan / Chen）：通用、与目标模型解耦，易接现成小模型，工程简单。
- *自草稿派*（Medusa / EAGLE）：省显存、无需维护第二模型，分布对齐更好、acceptance rate 更高。代价是要为每个目标模型训练草稿头。

**争议三：缓存——精确前缀复用 vs 语义相似复用？**
- *精确派*（RadixAttention / Prompt Cache / 厂商 prompt cache）：确定性命中、无正确性风险。
- *语义派*（GPTCache）：命中率更高、省更多成本，但存在误命中返回错误答案的风险。代表了"安全保守 vs 激进省钱"的工程价值观分歧。

**争议四：prompt caching 应让开发者显式控制断点，还是平台自动命中？（Anthropic vs OpenAI）**
- *Anthropic*：`cache_control` 显式断点，可外科手术式分别缓存系统提示/工具/长文档，命中率可控但需手动布局上下文。
- *OpenAI*：>1024 token 公共前缀自动缓存、零接入成本，但可控性弱，需靠"稳定内容置前"间接优化。本质是"控制权 vs 易用性"。

**争议五：生产复杂任务用 orchestrator-worker multi-agent，还是上下文工程做强的 single-agent？（Anthropic vs Cognition）**
- *Anthropic*：lead agent 规划并并行起 3–5 个 subagent，在内部研究评测上比 single-agent Opus 4 高 90.2%，适合可拆成并行支线的研究类任务（代价 ~15x token）。
- *Cognition / Walden Yan*：multi-agent 因上下文割裂、决策冲突而脆弱；两原则——共享完整 agent trace（不只传消息）、写操作单线程（single writer），额外 agent 只贡献"智能"不直接"动手"。结论：当前更应押注上下文工程做强的 single-agent。详见 [[08]]。

**争议六：极致时延该自研专用推理模型，还是直接用基础模型 API？（Cursor vs 通用实践）**
- *Cursor*：自研微调 Llama-3-70B + speculative edits + 专用推理（Fireworks/Together），换 ~1000 tok/s 与 9–13× 加速。
- *多数团队*：用基础模型 API + streaming + 缓存 + Batch 已够，自研模型/推理的工程与维护成本太高，只在"对生成有强先验"的窄场景才值。

**争议七：运行 agent 自生成代码——容器够用还是必须 microVM？（Cognition vs 容器密度派）**
- *Cognition*：共享内核容器一处被攻破即殃及全部，必须 microVM 每会话独立内核（投入一年多 hypervisor 工程）。见 [[12]]。
- *密度/成本派*：容器更轻、启动快、密度高，VM 隔离带来冷启动与资源开销，需权衡安全 vs 单机承载。

**争议八：Build vs Buy + 何时上多模型路由？**
- *Buy / API 优先 + 厂商内部路由*（a16z、swyx、OpenAI/Anthropic 平台；GPT-5 开路的端点内置路由）：用现成基础模型 + 厂商平台，只建薄薄的"智能层"，速度快（几天 vs 自建半年）、买到自己造不出的前沿质量；路由复杂、分类器要随模型漂移重训，不如用一个够强的模型 + prompt caching 或厂商内部路由。
- *Build / 自掌栈 + 尽早路由*（Meta Llama、Mistral、vLLM/Berkeley、有合规约束的企业；LMSYS RouteLLM、OpenRouter）：vLLM 自托管换控制权/隐私/规模化单位成本/无锁定；负载复杂度差异大时所有请求都用前沿模型就是在简单步骤上多付钱，路由同质量降本 2×+。
- *收敛*：新兴共识是混合式——**"买基础设施层，自建智能层"**；路由要不要上，取决于负载异构度与是否已能用厂商内部路由端点。RouterArena 等基准则提醒：路由收益要扣掉额外集成与分类器漂移的开销。

> 📦 **结案框**：build vs buy（2023 a16z《Emerging Architectures》/ swyx 提出）
> - **2026 定论**：收敛为混合式——"买基础设施层、自建智能层"，前沿质量与底座尽量外购，差异化只押在智能层。
> - **现状**：路由是否上取决于负载异构度与厂商内部路由端点（GPT-5 已内置实时路由）；RouterArena 提醒收益要扣掉集成与分类器漂移开销。

**争议九：可靠性靠"评测驱动"还是"生产遥测优先"？**
- *评测驱动派*（Hamel Husain、swyx、OpenAI Evals）：测不了就改不动，失败产品共同根因是没有评测体系，应先建评测集 + LLM-as-judge + 错误分析再扩规模。
- *遥测优先派*（可观测性阵营）：离线评测（尤其 LLM-as-judge）噪声大、可被刷、与真实使用漂移，不如在护栏后上线、用生产流量 + 人工抽检学习。多数成熟团队最终是两者结合（见 [[09]] / [[10]]）。

---

## 7. 大厂工程实践（≥2 个真实案例 + 取舍拆解）

**案例 A · Moonshot AI / Kimi —— Mooncake KVCache-centric 解耦（超大规模服务）**
做法：把 prefill/decode 解耦，并用池化的 CPU/DRAM/SSD 组成 KVCache 缓存层 + SLO 感知调度。生产成绩：处理 100B+ tokens/天，长上下文吞吐最高 +525%，A800/H800 集群较旧系统多承载 115%/107% 请求。取舍：用更复杂的分布式 KV 传输与调度，换长上下文场景的极致 goodput——只有当长上下文 + 高 QPS 同时成立时才值这套工程量。

**案例 B · Cursor Fast Apply —— 为极致时延自研专用模型 + 专用推理**
做法：代码改写约 90% 不变，于是微调 Llama-3-70B 做 **speculative edits**——用原文件当草稿、大模型一次前向校验，交 Fireworks/Together 专用推理，达 ~1000 tok/s，相对原 GPT-4 投机方案约 9×、相对原始 70B 约 13×。取舍：放弃通用 API 的便利、承担自研与推理运维成本，换"在强先验场景上的极致时延"。这是"build 智能层 + 专用推理"路线的标杆。来源 fireworks.ai/blog/cursor。

**案例 C · Anthropic Claude Research —— orchestrator-worker multi-agent**
做法：lead agent 规划并并行起 3–5 个 subagent，独立 citation pass 再合成。取舍：主动接受 ~15x token 成本换取相对 single-agent +90.2% 的质量；工程上靠三根支柱兜底——**持久化执行**（出错从断点恢复而非重启、把研究计划写入 memory 防 200k 上下文截断）、**全链路 tracing**（看决策结构而非对话内容）、**rainbow deployment**（平滑切流不打断在跑的 agent）。这是"multi-agent 有用"一方的最强论据，但也坦承只适合高价值、可并行的任务。来源 anthropic.com/engineering/multi-agent-research-system。

**案例 D · Cognition Devin / Cloud Agents —— microVM 隔离 + 单 writer**
做法：为安全运行 agent 自生成的不可信代码，放弃共享内核容器、改用每会话独立内核的 microVM（一年多 hypervisor 工程），并用 hypervisor 级快照（内存+进程树+文件系统）在 CI/代码评审等异步空档关机省算力、恢复时原样续跑。架构上同时主张 single-writer single-agent。取舍：拿冷启动与单机密度的开销，换"一处被攻破不殃及全部"的隔离强度；难点不在单点而在 orchestration/治理/集成的累计面积。来源 cognition.ai/blog/what-we-learned-building-cloud-agents。

**案例 E · OpenAI 平台级降本组合 —— 把降本做成默认**
做法：自动 prompt caching（>1024 token 公共前缀、无需改代码，输入按模型分档省 GPT-4o~50% / GPT-4.1~75% / GPT-5 系~90%）+ Batch API（非实时 5 折）+ streaming 作为默认时延手段 + latency optimization 七原则（更快出 token / 少生成 / 少输入 / 少请求 / 并行 / streaming / 能不用 LLM 就别用）。取舍：缓存可控性弱（靠"稳定内容置前"优化）、Batch 牺牲实时性，但对绝大多数应用是"零接入成本就降本"。来源 OpenAI prompt-caching / latency-optimization 文档。

**案例 F · Hugging Face TGI —— 开源生产推理的工程分水岭**
做法：continuous batching 在 token 迭代级动态合批填满 GPU 气泡、SSE 流式吐 token、Flash/Paged Attention、量化、OpenAI 兼容 API + 内建 Prometheus/OpenTelemetry 可观测。已在 Grammarly、Uber、Deutsche Telekom 生产使用。取舍：把吞吐 vs 单请求时延的平衡、可观测都内建好，是"原型→生产"的标准底座。

**案例 G · Vercel AI Gateway —— 把可用性工程外置到网关**
做法：单端点接数百模型，provider 宕机/能力不匹配时按指定顺序自动 fallback，按最终完成请求的模型计费，并把 token/spend 作为一等可观测指标。取舍：多一跳网关，换跨厂商韧性与统一计费观测——适合不想在应用层自己写容错逻辑的团队。来源 vercel.com/changelog（2025-11）。

> 一条横向规律：**头部团队的差异化在"自建智能层 + 专用工程"，而把推理底座/缓存/容错尽量交给厂商或开源引擎**。Kimi/Cursor 选择自研是因为规模或先验强到自研能换来数量级收益；多数团队应反过来——先吃满厂商缓存/Batch/streaming，再谈自建。详见 [[13]] 大厂案例研究、[[14]] 技术栈速查。

---

## 8. 我的分析与判断

> **以下为分析观点（非事实陈述），是我对证据的独立研判，可能与主流不同。**

**趋势研判**。第一，**生产工程正在"下沉进平台"**：prompt caching、Batch、内部路由（GPT-5）、托管 RAG、网关 fallback——过去三年里几乎每一个"自建难点"都被厂商吸收成了一个 API 参数或一个 5 折开关。这意味着应用层工程师的护城河正在从"我会调 vLLM / 我会写路由器"上移到"我会设计上下文与缓存边界、我会定义 SLO 与评测、我会做架构取舍"。换句话说，**底层越商品化，架构判断力越值钱**。第二，**时延优化的三条线（投机解码 × prefill-decode 解耦 × 前缀缓存）会从各自为战走向联合调度**，但目前没有统一模型——谁先把"给定异构负载 + 多类 SLO，如何联合配资源最大化 goodput"做成一个可调度的抽象，谁就拿下下一代 serving 引擎。第三，**Agent 让"成本"重新成为一等约束**。chat 时代 token 便宜到可以挥霍，但 agent ~4x、multi-agent ~15x 的放大系数把成本推回设计中心；未来 agent 框架的标配会是**预算护栏（token/步数/并发上限）+ 提前止损 + 按 feature/user 计量**，就像今天 Web 服务标配限流一样。第四，**single-agent vs multi-agent 之争不会有赢家通吃**，会按任务可分解度收敛：可拆成独立只读支线的研究/检索类 → multi-agent 并行划算；强状态依赖、写操作密集的（编码、交易）→ single-writer single-agent + 强上下文工程更稳。Anthropic 和 Cognition 其实在描述两类不同任务，不是在同一题上对错。

**常见坑**（按踩雷频率排序）。① **只优化平均时延、不看 p99**——continuous batching 提了平均吞吐，却可能让个别请求被邻居拖到尾部爆炸，SLO 要按 p95/p99 签。② **缓存命中率个位数还以为上了缓存**——动态内容（时间戳、随机 ID、user 名）混进了可缓存前缀，把命中率打穿；必须把动态内容移到前缀之后。③ **multi-agent 图里盲开 with_retry**——乘性放大成 retry 风暴，必须在 router/图级集中降级。④ **语义缓存当精确缓存用**——"相似"不等于"等价"，没有 TTL 和场景白名单就会返回似是而非的错答案。⑤ **没有预算护栏的 agent**——一个推理跑飞能烧掉 chat 几十倍的钱，且常常是悄无声息地烧。⑥ **guardrails 越加越多却越慢越易绕**——护栏不是越多越好，要在时延预算内选最关键的几道。⑦ **离线 evals 当发布门禁、却不接生产遥测**——LLM-as-judge 会漂移、会被刷，离线绿了线上照样翻车。⑧ **跨厂商 fallback 只回退可用性、不回退质量**——换了个能用但更弱的模型，用户拿到的是"可用的烂答案"，且不同模型常需不同 prompt。

**最佳实践（我的默认配方）**。(1) **先拆 SLO 再谈优化**：把目标拆成 TTFT、TPOT、p99、单请求成本四个量，对症下药而非乱试。(2) **streaming 是第一手段**，几乎零成本就把感知时延打到地板。(3) **缓存优先于换模型**：把系统提示/工具定义/长文档做成稳定前缀，先吃满 prompt cache（读 0.1x）和 Batch（5 折），再考虑路由/级联。(4) **缓存命中率当一等指标监控**，目标 70–85%，靠"动态内容外移 + 前缀稳定化"逼上去。(5) **容错分层**：单点 fallback + 链级 fallback + 网关兜底，且在 multi-agent 图上**关掉工具级重试、改在图级集中降级**。(6) **预算护栏从第一天就装**：token/步数/并发/超时上限 + 按 feature/user 计量告警，别等账单爆了才补。(7) **可靠性两条腿走路**：离线 evals 建回归基线 + 生产遥测/人工抽检定发布，谁也别单独信。(8) **架构选型默认"买基础设施、自建智能层"**，只有规模或先验强到能换数量级收益时才自研推理/模型。

---

## 9. 面试考点

> 本节按概念/系统设计/手写/陷阱四类给本章高频考点；更系统的题库与答法见 [[15]]。

**概念题**

1. **TTFT 和 TPOT 分别由什么决定、各自怎么优化？** 要点：TTFT 由 prefill（compute-bound、随输入长度涨）决定，靠前缀/KV 缓存（RadixAttention、prompt cache）压；TPOT 由 decode（memory-bound、随 batch 受益）决定，靠 continuous batching、投机解码压；端到端 `≈ TTFT + TPOT × 输出长度`；streaming 降"感知"时延但不降真实时延。

2. **continuous batching 与 PagedAttention 各解决什么浪费？** 要点：continuous batching（Orca）把调度从 request 降到 iteration、填满 GPU 气泡，治"等最长请求"的浪费；PagedAttention（vLLM）把 KV cache 分页、近零碎片且前缀可跨请求共享，治"按最大长度预留"的碎片浪费。二者是现代推理引擎（vLLM/TGI）的两块基石。

3. **投机解码为什么能在不改变输出分布的前提下提速？** 要点：draft 模型猜 k 个 token，target 模型一次前向并行验证，用接受-拒绝采样（`min(1, p_target/p_draft)`）保证最终分布等于 target 模型独立采样的分布；接受的 token 白赚、拒绝的从分歧点重采。draft 来源分独立模型 vs 自草稿头（Medusa/EAGLE）vs 领域先验（Cursor 用原文件）。

4. **prefill/decode 解耦 vs chunked-prefill 的取舍？** 要点：解耦（DistServe/Splitwise/Mooncake）彻底消干扰、可按 TTFT/TPOT 独立配（异构）硬件，代价是跨机传 KV、运维重；chunked-prefill（Sarathi-Serve）同机切块交错 stall-free、部署简单，无需额外硬件。规模大/长上下文/严 SLO 倾向解耦。

5. **精确缓存 vs 语义缓存的本质区别与风险？** 要点：精确前缀/KV 复用确定性命中、无正确性风险（RadixAttention、prompt cache）；语义缓存（GPTCache）按 embedding 相似度命中、命中率更高更省，但"相似≠等价"会误命中返回错答案，需短 TTL + 阈值 + 场景白名单。

**系统设计题**

- **设计一个能扛百万 DAU 的生产级 coding agent 服务，给出时延/成本/可靠性方案。** 要点：
  - *服务层*：vLLM/TGI（continuous batching + PagedAttention），长上下文走 prefill/decode 解耦或 chunked-prefill；按 TTFT/TPOT 双 SLO 配资源。
  - *时延*：streaming SSE 默认；并行工具调用（LLMCompiler 式 DAG）；代码改写用 speculative edits；prefix cache 复用系统提示/仓库上下文。
  - *成本*：prompt cache（稳定前缀）+ Batch（离线索引/批任务 5 折）+ 路由/级联（简单补全走小模型）；按 feature/user 计量 + 预算告警 + 跑飞止损。
  - *可靠性*：链级 fallback + 网关兜底；熔断 + 超时；guardrails（输入注入防御 + 输出安全）；高风险写操作 HITL 审批；全链路 tracing（TTFT/token/spend/工具成败）。
  - *隔离*：跑自生成代码用 microVM/沙箱（见 [[12]]）；持久化执行 + 检查点恢复 + rainbow deployment 平滑发布。
  - *评测*：离线 evals 回归 + 生产遥测/人工抽检定发布门禁（见 [[09]][[10]]）。

**手写题**

- **写一个带级联降级 + 缓存 + fallback + 预算护栏的 agent 调用封装。**
```python
def call_with_cost_control(q, budget, exact_cache, sem_cache):
    if (hit := exact_cache.get(prefix_key(q))) is not None:   # 精确前缀缓存
        return hit
    if (hit := sem_cache.lookup(q, threshold=0.95)) is not None:  # 语义缓存(高阈值)
        return hit
    if budget.spent > budget.cap:            # 预算护栏：超支即止损/降级
        return cheap_model(q)
    ans = cheap_model(q)                     # 级联：先便宜
    if confidence(ans) < TAU:                # 自评/verifier 触发升级
        for model in [strong_model, fallback_model]:   # 强模型 + 跨厂商 fallback
            try:
                ans = with_timeout(model, q, t=8); break
            except (RateLimit, Timeout, Outage):
                continue                     # 注意：单层 fallback，不在工具级盲开 retry
    budget.charge(tokens(ans)); sem_cache.put(q, ans, ttl=300)
    return ans
```

**陷阱题**

1. **"上了 continuous batching 吞吐就上去了，时延也更好了，对吧？"** 反驳：吞吐和单请求尾时延是权衡——批越满吞吐越高，但单条请求会被更多邻居拖慢，p99 可能恶化。要按 p95/p99 签 SLO，必要时上 prefill/decode 解耦或限批。

2. **"prompt caching 一开就降本 90%，对吧？"** 反驳：90% 是上限不是默认。命中率取决于前缀是否稳定——动态内容（时间戳/随机 ID/user 名）混进可缓存前缀会把命中率打到个位数；要把动态内容移到前缀之后，命中率才上得去。Anthropic 还要写入 1.25x/2x、5min/1h TTL。

3. **"multi-agent 比 single-agent 强，复杂任务都该上 multi-agent？"** 反驳：Anthropic 的 +90.2% 是在可并行的研究类任务上、且付 ~15x token；Cognition 指出 multi-agent 上下文割裂、决策冲突、写操作冲突会更脆弱。强状态/写密集任务（编码、交易）更适合 single-writer single-agent + 强上下文工程。

4. **"加 retry 让系统更稳。"** 反驳：在 multi-agent 图里工具级盲开 retry 会乘性放大成 retry 风暴（3×3×3=27），反而打垮下游。应在 router/图级集中降级，关掉工具级重试。

---

## 10. 参考文献

### 📄 论文

- Yu et al. — **Orca: A Distributed Serving System for Transformer-Based Generative Models** (2022, OSDI) · https://www.usenix.org/conference/osdi22/presentation/yu · 提出 iteration-level scheduling（continuous batching）+ selective batching，现代高吞吐 LLM 服务的奠基。
- Kwon et al. — **Efficient Memory Management for LLM Serving with PagedAttention (vLLM)** (2023, SOSP) · https://arxiv.org/abs/2309.06180 · 用 OS 分页思想管理 KV cache，近零碎片 + 跨请求前缀共享，吞吐最高 24×。
- Zhong et al. — **DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving** (2024) · https://arxiv.org/abs/2401.09670 · prefill/decode 拆到不同 GPU 消除干扰，7.4× 请求或 12.6× 更紧 SLO。
- Patel et al. — **Splitwise: Efficient Generative LLM Inference Using Phase Splitting** (2024) · https://arxiv.org/abs/2311.18677 · 按 prompt/token 两阶段配异构硬件，1.4× 吞吐且成本降 20%。
- Agrawal et al. — **Taming Throughput-Latency Tradeoff with Sarathi-Serve** (2024) · https://arxiv.org/abs/2403.02310 · chunked-prefill + stall-free 调度，不暂停 decode 兼顾吞吐与 SLO（最高 6.9×）。
- Zheng et al. — **SGLang: Efficient Execution of Structured LM Programs (RadixAttention)** (2024) · https://arxiv.org/abs/2312.07104 · radix 树自动复用共享前缀 KV，最高 6.4× 吞吐、降 TTFT。
- Qin et al. — **Mooncake: A KVCache-centric Disaggregated Architecture for LLM Serving** (2024) · https://arxiv.org/abs/2407.00079 · Kimi 生产级 KV 解耦，长上下文吞吐最高 +525%。
- Leviathan et al. — **Fast Inference from Transformers via Speculative Decoding** (2022/2023, ICML) · https://arxiv.org/abs/2211.17192 · 投机解码开山作，无损 2–3× 提速。
- Spector & Ré — **Accelerating LLM Inference with Staged Speculative Decoding** (2023) · https://arxiv.org/abs/2308.04623 · 树状草稿 + 分阶段，小批量单批时延降 3.16×。
- Cai et al. — **Medusa: Simple LLM Inference Acceleration with Multiple Decoding Heads** (2024) · https://arxiv.org/abs/2401.10774 · 多并行解码头 + 树状注意力，免独立 draft 模型，2.2–3.6×。
- Li et al. — **EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty** (2024) · https://arxiv.org/abs/2401.15077 · feature 层自回归 + 注入下一步 token，无损 ~3×，优于 Medusa/Lookahead。
- Hu et al. — **Speculative Decoding and Beyond: An In-Depth Survey of Techniques** (2025) · https://arxiv.org/abs/2502.19732 · 系统梳理 draft/verify 各类方法的分类与取舍。
- Kim et al. — **An LLM Compiler for Parallel Function Calling (LLMCompiler)** (2024) · https://arxiv.org/abs/2312.04511 · Planner/Task-Fetch/Executor 并行工具调用，较 ReAct 降时延 3.7×、成本 6.7×。
- Chen, Zaharia, Zou — **FrugalGPT: Using LLMs While Reducing Cost and Improving Performance** (2023) · https://arxiv.org/abs/2305.05176 · prompt 适配 + 近似 + LLM cascade，匹配 GPT-4 而成本最高降 98%。
- Ong et al. — **RouteLLM: Learning to Route LLMs with Preference Data** (2024) · https://arxiv.org/abs/2406.18665 · 偏好数据训路由器，简单 query 导向便宜模型，同质量降本 2×+。
- Yue et al. — **LLM Cascades with Mixture of Thought Representations for Cost-Efficient Reasoning** (2024) · https://arxiv.org/abs/2310.03094 · 弱模型答案一致性判难度做级联，约 40% 成本匹配强模型。
- Bang — **GPTCache: An Open-Source Semantic Cache for LLM Applications** (2023, NLP-OSS) · https://aclanthology.org/2023.nlposs-1.24/ · query→embedding 语义相似缓存，命中快 2–10× 省 API 成本。
- Gim et al. — **Prompt Cache: Modular Attention Reuse for Low-Latency Inference** (2024) · https://arxiv.org/abs/2311.04934 · schema 定义可复用 prompt 模块、预存 attention 状态，TTFT 最高降 8×。
- Rebedea et al. — **NeMo Guardrails: Controllable & Safe LLM Apps with Programmable Rails** (2023) · https://arxiv.org/abs/2310.10501 · Colang 可编程 rails 控制话题/安全/对话路径，确定可审计。
- Inan et al. (Meta) — **Llama Guard: LLM-based Input-Output Safeguard** (2023) · https://arxiv.org/abs/2312.06674 · 指令微调 Llama2-7B 做输入/输出安全分类，自带可定制风险分类法。
- Dong et al. — **Safeguarding Large Language Models: A Survey** (2024) · https://arxiv.org/abs/2406.02622 · 系统综述 guardrail 机制、评估增强与绕过攻击/防御。
- Cemri et al. — **Why Do Multi-Agent LLM Systems Fail? (MAST)** (2025) · https://arxiv.org/abs/2503.13657 · 由约 150 条专家标注 trace（κ=0.88）归纳 14 种失败模式（1600+ 为后续 LLM-judge 扩展的 MAST-Data），给出生产可靠性分类法。
- Zou et al. — **LLM-Based Human-Agent Collaboration and Interaction Systems: A Survey** (2025) · https://arxiv.org/abs/2505.00753 · HITL/人机协作的反馈、控制、监督设计模式与分类。
- Miao et al. — **Towards Efficient Generative LLM Serving: A Survey from Algorithms to Systems** (2023) · https://arxiv.org/abs/2312.15234 · 批处理/量化/调度/内存的全景 serving 地图。
- — **LLM Inference Serving: Survey of Recent Advances and Opportunities** (2024) · https://arxiv.org/abs/2407.12391 · 聚焦 2023 年以来的调度/缓存/解耦/SLO 进展。
- — **RouterArena: An Open Platform for Comprehensive Comparison of LLM Routers** (2025) · https://arxiv.org/abs/2510.00202 · 统一基准对比各家路由器，暴露收益与开销/分类器漂移权衡。

### ✍️ 博客与工程文（优先一手）

- Chip Huyen — **Building LLM applications for production** (2023) · https://huyenchip.com/2023/04/11/llm-engineering.html · 最早清晰命名 demo→上线鸿沟：提示词歧义/成本/时延/测试/换模型回归。
- Databricks / MosaicML — **LLM Inference Performance Engineering: Best Practices** (2023) · https://www.databricks.com/blog/llm-inference-performance-engineering-best-practices · 把 TTFT/TPOT/throughput 三指标讲清，给定时延预算下最大化吞吐。
- vLLM Team — **vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention** (2023) · https://blog.vllm.ai/2023/06/20/vllm.html · PagedAttention 把推理成本/吞吐打开，使自托管在经济上可行。
- Microsoft Research — **Splitwise improves GPU usage by splitting LLM inference phases** (2024) · https://www.microsoft.com/en-us/research/blog/splitwise-improves-gpu-usage-by-splitting-llm-inference-phases/ · 工程语言讲 prefill/decode 解耦如何提利用率降本。
- LMSYS Org — **RouteLLM: An Open-Source Framework for Cost-Effective LLM Routing** (2024) · https://lmsys.org/blog/2024-07-01-routellm/ · 与商用路由同质量但便宜 40%+，把成本-质量权衡操作化。
- Anthropic Engineering — **How we built our multi-agent research system** (2025) · https://www.anthropic.com/engineering/multi-agent-research-system · multi-agent 三支柱：token 成本意识（agent ~4x、multi-agent ~15x）、持久化执行、全链路 tracing + rainbow deployment。
- Anthropic — **Prompt Caching with Claude（+ 1h 扩展 TTL）** (2024–2025) · https://www.anthropic.com/news/prompt-caching · 显式 `cache_control` 断点，写 1.25x/2x、读 0.1x，长上下文降本 90%、时延 85%。
- OpenAI — **Prompt Caching in the API** (2024) · https://openai.com/index/api-prompt-caching/ · 自动命中、无需改代码，>1024 token 公共前缀输入按模型分档省 GPT-4o~50% / GPT-4.1~75% / GPT-5 系~90%，并降时延。
- Cognition / Walden Yan — **Don't Build Multi-Agents** (2025) · https://cognition.ai/blog/dont-build-multi-agents · 单线程上下文工程：共享完整 trace、写操作 single-writer，押注 single-agent。
- Cognition — **What We Learned Building Cloud Agents** (2026) · https://cognition.ai/blog/what-we-learned-building-cloud-agents · microVM 每会话独立内核 + hypervisor 级快照在异步空档省算力。
- Fireworks AI — **How Cursor built Fast Apply using Speculative Decoding** (2024) · https://fireworks.ai/blog/cursor · 微调 Llama-3-70B + speculative edits，~1000 tok/s（9–13×）。
- LangChain Docs — **How to add fallbacks to a runnable** (2025) · https://python.langchain.com/docs/how_to/fallbacks/ · `with_fallbacks` 单/链级回退，multi-agent 慎用 with_retry 防风暴。
- Vercel — **Model fallbacks now available in AI Gateway** (2025) · https://vercel.com/changelog/model-fallbacks-now-available-in-vercel-ai-gateway · 单端点接数百模型、provider 宕机自动按序 fallback、按完成模型计费。
- a16z (Bornstein, Radovanovic) — **Emerging Architectures for LLM Applications** (2023) · https://a16z.com/emerging-architectures-for-llm-applications/ · in-context learning + RAG + 编排的参考栈，"LLM 应用栈"心智模型。
- swyx — **The Rise of the AI Engineer** (2023) · https://www.latent.space/p/ai-engineer · 为区别于 ML 工程师的"用 API 消费模型"新角色命名。
- Hamel Husain — **Your AI Product Needs Evals** (2024) · https://hamel.dev/blog/posts/evals/ · evals = 新的单元测试，失败产品共同根因是没有评测体系。
- Gartner — **Predicts 30% of GenAI Projects Will Be Abandoned After PoC by End of 2025** (2024) · https://www.gartner.com/en/newsroom/press-releases/2024-07-29-gartner-predicts-30-percent-of-generative-ai-projects-will-be-abandoned-after-proof-of-concept-by-end-of-2025 · "POC 坟场"数据点：数据质量/风控/成本/价值是主因。
- FinOps Foundation — **AI for FinOps / Agentic use cases** · https://www.finops.org/insights/ai-for-finops-agentic-use-cases/ · 把 agentic 用例纳入 AI FinOps 议题，推动从"基础设施消耗"转向单位成果成本计量（新兴方向，非权威基准）。
- Menlo Ventures — **2025: The State of Generative AI in the Enterprise** (2025-12) · https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/ · 企业 GenAI 支出 $37B（2024 $11.5B，约 3.2x），仅约 16% 部署算真正的 agent。
- Deloitte — **Tech Trends 2026: Agentic AI strategy** · https://www.deloitte.com/us/en/insights/topics/tech-trends/2026/agentic-ai-strategy.html · 仅约 11% agentic 项目已投产（14% 可部署、38% pilot、30% 探索），生产化仍是少数。

### 📚 官方文档

- OpenAI — **Latency optimization guide（七原则）** (2025) · https://developers.openai.com/api/docs/guides/latency-optimization · 更快出 token / 少生成 / 少输入 / 少请求 / 并行 / streaming 最有效 / 能不用 LLM 就别用。
- OpenAI — **Production best practices** (2025) · https://developers.openai.com/api/docs/guides/production-best-practices · 用满足质量的最小模型、按 feature/user/request 计量、设告警、Batch 5 折、语义缓存 + 短 TTL。
- Hugging Face — **Text Generation Inference (TGI)** (2025) · https://huggingface.co/docs/text-generation-inference/en/index · 开源生产推理样板：continuous batching、SSE、Flash/Paged Attention、量化 + Prometheus/OTel。
- Anthropic — **Introducing the Model Context Protocol (MCP)** (2024) · https://www.anthropic.com/news/model-context-protocol · 工具/数据集成开放标准，减少定制胶水、推动栈互操作。
- Google Cloud — **Context caching overview (Vertex AI)** (2025) · https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview · 为重复长上下文提供显式缓存资源，重复输入成本砍约 75%。
- Google / Kaggle — **Agents Companion (v2)** (2025) · Kaggle whitepaper（76 页，作者含 Antonio Gulli 等）· 把 AgentOps 伞形（评估/可观测/部署/治理）+ Agentic RAG 系统化，缝合"评估 → 生产 → 可观测"的运营主线。
- Anthropic Engineering — **Scaling Managed Agents: Decoupling brain from hands** (2026) · https://www.anthropic.com/engineering/managed-agents · 长程 agent 拆 brain/hands/session 三层，session 层托管会话状态支持 durable execution，TTFT p50 约 -60%、p95 降幅 >90%。

### 🎥 Talk / 书

- Chip Huyen — **AI Engineering: Building Applications with Foundation Models**（书，2025, O'Reilly）· https://github.com/chiphuyen/aie-book · 把基础模型应用工程（服务/时延/成本/评测/guardrails）体系化为 "AI engineering" 学科。
- Andrej Karpathy — **Software 3.0 / Software Is Changing (Again)**（YC AI Startup School, 2025）· https://www.latent.space/p/s3 · LLM 是"用英语编程的新型计算机"，兼具 OS/utility/fab 特性，重塑软件构建与交付。

---

> **交叉链接**：[[02]] Harness 运行时（循环与 streaming）· [[03]] 上下文工程（缓存命中率、single-writer）· [[04]] 工具与 MCP（并行工具调用）· [[08]] 多智能体编排（single-agent vs multi-agent）· [[09]] 评估（可靠性脊梁）· [[10]] 可观测性（TTFT/token/spend 监控）· [[12]] 安全与对抗（guardrails、microVM 隔离）· [[13]] 大厂案例 · [[14]] 技术栈速查 · [[16]] Agent 训练与强化学习（草稿头/路由器训练）· [[17]] 互操作协议与 Agent 经济（单位成果成本/计费结算）。
