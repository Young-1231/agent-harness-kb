> 状态：🟢 已校验

# 03 · 上下文工程（Context Engineering）

> **定位**：决定"在每一步推理时，往上下文窗口里放哪些 token、怎么放、何时清"的系统性工程。它是 Agent 可靠性、成本与延迟的总开关。
> **在链路中的位置**：上承 [[01]] 的推理范式、[[02]] 的 Harness 运行时，下接 [[04]] 工具/MCP、[[06]] 记忆、[[07]] 检索、[[08]] multi-agent——这些都是"上下文里放什么"的具体来源。

---

## 1. TL;DR / 速览

**本节地图**：动机（§2）→ 历史脉络（§3）→ 核心原理（§4）→ 方法谱系（§5）→ 争议（§6）→ 大厂实践（§7）→ 我的判断（§8）→ 面试（§9）→ 文献（§10）。

**核心结论（先看这 5 条）**：

1. **瓶颈已从“措辞”转移到“整窗口的内容治理”**。在生产级 Agent 里，决定成败的不再是那段 prompt，而是历史、工具输出、记忆、检索结果如何被组装与维护进窗口——*context engineering* 这个名字由 Tobi Lütke 推文（2025-06）带火、Karpathy（2025-06）放大（二人均非最早发明者），后者并类比“LLM = CPU、上下文窗口 = RAM”。
2. **长窗口 ≠ 会用长窗口**。*Lost in the Middle*（2023）实证 U 形注意力曲线，Chroma *Context Rot*（2025）在 18 个前沿模型上证明"输入越长、质量非均匀地下降"——注意力是**有限预算**，"能塞就塞"不可靠。
3. **缓存友好布局是硬指标，不是玄学**。Manus 把 **KV-cache 命中率**列为 Agent 头号生产指标（缓存读 vs 未缓存约 **10x 价差**）；2026 年《Don't Break the Cache》进一步实证："动态内容置末、排除动态工具结果"优于朴素全量缓存，后者反而可能**增加延迟**。
4. **长任务三件套**：compaction（接近上限时高保真摘要重启）、structured note-taking（todo.md / NOTES.md / recitation）、subagent（独立窗口探索、只回传蒸馏摘要）——配合 **just-in-time** 按需检索而非一次性预加载。
5. **没有银弹，全是权衡**。长上下文 vs RAG、compaction vs 外置文件、multi-agent vs 单线程、mask 工具 vs 动态加载——每一组都是真实的工程对立面（§6），边界取决于知识规模、时效、窗口/缓存预算与任务耦合度。

---

## 2. 定位与动机

**它解决什么问题？** LLM 是无状态的纯函数：`output = f(context)`。模型权重在推理期固定，唯一可被你控制的输入就是那段 token 序列。于是"往窗口里写什么"成为指挥模型的**唯一控制面**。早期我们叫它 *prompt engineering*——但当应用从"一问一答"演进到"几十步工具调用的长程 Agent"时，prompt 只占总上下文的一小部分：system 指令、工具定义、检索结果、历史对话、工具返回、记忆、子任务摘要……全都在抢占同一块有限的注意力预算。Anthropic 的官方定义因此是：**在推理时持续策展与维护一组"最优 token 集合"的策略集合**（curate & maintain the optimal set of tokens during inference），prompt engineering 只是它的子集。

**为什么"治理"比"措辞"更重要？** 三个结构性约束：

- **注意力是有限预算**。Transformer 的注意力是 O(n²) 的两两关系，100K token 即意味着上百亿对关系被稀释。token 越多，每个 token 分到的"注意力份额"越少。
- **context rot（上下文腐烂）**。输入变长时，模型性能并非到窗口上限才崩，而是**一路非均匀地退化**（Chroma 2025）。无关信息、干扰项、冗长历史都会主动**拉低**质量。
- **成本与延迟线性甚至超线性增长**。Manus 观测到生产 Agent 的输入:输出 token 比约 **100:1**——绝大部分算力花在反复 prefill 上下文上。不治理上下文，成本和 TTFT 都会失控。

**在 Agent 链路中的位置**：上下文工程是 Harness（[[02]]）每一轮循环的核心动作——`Think → Act → Observe` 之后，Harness 必须决定"把这一轮的 observation 怎么并入下一轮的 context"。它横跨 [[04]] 工具（工具定义/结果如何编排）、[[06]] 记忆（窗口外存什么、怎么召回）、[[07]] 检索（JIT 还是预载）、[[08]] multi-agent（上下文如何隔离/共享）。可以说，上面这些章节都是"上下文里放什么"的**供给侧**，而本节是**需求侧的总调度**。

---

## 3. 历史发展脉络

> 主线逻辑：**prompt engineering → 长上下文 → RAG → context engineering 术语确立（2025）→ context rot 实证**。核心是"瓶颈从措辞转移到整窗口内容治理"。

| 年份 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **2020** | **GPT-3 与 in-context learning**（Brown et al.） | 模型不再为每个任务微调，仅靠上下文里的指令+少量示例就能被指挥。"往窗口里写什么示例"第一次成为可工程化的杠杆——这是整条主线的起点。 |
| **2020** | **RAG**（Lewis et al., Meta/FAIR） | 参数化记忆覆盖不了时效/私有知识，于是引入非参数化检索，把检索结果拼进上下文。这是"往上下文放什么"的第一条工程化路径，也埋下日后**长上下文 vs RAG** 之争的伏笔。 |
| **2022** | **Chain-of-Thought**（Wei et al., Google） | 仅改写提示（"一步步想"）就能在大模型上涌现推理，提示工程从"写好指令"进化到"设计模型的思考轨迹"——提示从此被巩固为主控手段，其局限也随之更显眼。 |
| **2023.05** | **Claude 100K 窗口**（Anthropic） | 窗口从约 9K 跳到 100K，"直接把整本书塞进去"第一次可行，引出一条与 RAG 对立的路线：与其检索拼接，不如一次性全放进窗口。 |
| **2023.07** | **Lost in the Middle**（Liu et al., Stanford） | 实证发现关键信息放在上下文**中间**时模型几乎"看不见"（U 形曲线），首次戳破"窗口越大越好"，证明上下文必须被**有意编排**（位置/相关性）——工程化的第一份硬证据。 |
| **2023** | **长上下文扩展方法群**：Position Interpolation、YaRN；同期 **StreamingLLM**（attention sink）、**H2O**（KV 逐出）、**Prompt Cache**、**LLMLingua**（prompt 压缩）、**MemGPT** | 窗口可被廉价外推的同时，KV-cache 压缩、前缀缓存复用、prompt 压缩、分层记忆等**核心子问题集体成型**。MemGPT 提出"LLM 即操作系统"的分层记忆观，把上下文从静态文本变成需调度的资源。 |
| **2024.02** | **Gemini 1.5 百万 token 窗口**（Google，后扩至 2M） | "几乎所有知识都能塞进窗口"看似成真，把长上下文 vs RAG 推上风口顶点；同时把成本、延迟、context rot 等代价集中暴露。 |
| **2024.05–10** | **三大厂缓存产品化**：Google context caching（5 月，省约 75%）、Anthropic prompt caching（8 月，缓存读约 0.1x、最高省 90%）、OpenAI 自动 prefix caching（10 月，≥1024 token 自动命中、最高降 80% 延迟） | 把"前缀缓存"从学术方案变成大厂产品能力，奠定 **append-only + 稳定前缀**这类设计的经济模型——"静态在前、变量在后"成为跨厂商通用规范。 |
| **2024** | **严肃评测 + KV 治理**：RULER、SnapKV、Found in the Middle；年末 **CAG《Don't Do RAG》** | RULER 用合成多针/多跳任务戳破"宣称的上下文长度"；SnapKV/Found in the Middle 推进 KV 选择压缩与位置偏置校准；CAG 主张长窗口预载 KV 可替代实时检索，正式开启 **RAG vs 长上下文（CAG）** 路线之争。 |
| **2025.06** | **术语确立**：Tobi Lütke（6/18）、Andrej Karpathy（6/25）；Drew Breunig 失效四象限（6/22） | Agent 应用里决定效果的不再只是提示，瓶颈正式从"措辞"挪到"整窗口治理"，于是需要一个新名字。Breunig 把失效系统化为 **poisoning / distraction / confusion / clash** 四类，给"为什么要工程化"画出故障地图。 |
| **2025.07** | **Chroma《Context Rot》**（18 模型）+ **Manus 生产实践** | Chroma 把"输入越长越不可靠"从经验升级为 18 模型的实证；Manus 把 KV-cache 命中率、文件系统即上下文、mask 而非删工具、recitation 落到**生产指标**——证明这是硬工程而非概念包装。 |
| **2025.09** | **Anthropic《Effective context engineering for AI agents》**（随 Sonnet 4.5） | 大厂机构化定型：定义其为"策展最优 token 集合"，系统化 compaction / structured note-taking / subagent / just-in-time，并定调它是 prompt engineering 的**自然演进**而非取代——脉络收束。 |
| **2025.07 / 2025.10** | **学科化综述**：Mei 等《A Survey of Context Engineering》（1400+ 篇）、GAIR《Context Engineering 2.0》 | 把它正式定义为"对信息载荷的系统优化"，拆为检索生成/处理/管理三层；2.0 给出形式化定义与 1.0→2.0 历史分期，论证其可追溯至 1990s 人机交互。 |
| **2026.01** | **Cursor《Dynamic context discovery》** | 编码 Agent 最新取舍：模型变强后"少给前置上下文、让 Agent 自取"更省更准；选择性加载 MCP 工具 A/B 实测降 **46.9% token**。 |
| **2026** | **《Don't Break the Cache》**（DeepResearchBench） | 在 500+ 会话上比较三家厂商三种缓存策略，把“缓存友好布局”从经验上升为可测结论：动态内容置末、排除动态工具结果，省成本 41–80%、TTFT 提升 13–31%；朴素全量缓存反而可能增加延迟。 |
| **2026.03** | **《Context Engineering: From Prompts to Corporate Multi-Agent Architecture》**（arXiv 2603.09619） | 提出五条评判准则（relevance / sufficiency / isolation / economy / provenance）与累进成熟度金字塔 **Prompt → Context → Intent → Spec**，把上下文工程从零散技巧上升为企业级 multi-agent 架构的分层方法论——脉络从“术语确立 / 实证”进一步走向“工程成熟度模型”。 |

---

## 4. 核心概念与原理

### 4.1 心智模型：LLM = CPU，上下文窗口 = RAM

LangChain 与 Karpathy 共享的心智模型：上下文窗口就是工作内存（RAM），容量有限且昂贵；Agent 框架/Harness 像操作系统，负责往这块 RAM 里调度"恰好正确"的 token。由此 LangChain 把上下文工程归纳为四类基本操作：

- **Write**（写到窗口外）：scratchpad、记忆、文件——把暂时不用的信息移出窗口。
- **Select**（按需拉回）：RAG、向量检索、语义选工具——把需要的信息召回窗口。
- **Compress**（压缩）：对话摘要、工具输出压缩、只留必要 token。
- **Isolate**（隔离）：multi-agent、沙箱——把不同上下文拆开互不污染。

> **这四个动词是贯穿本节的主脊**（Lance Martin《Context Engineering for Agents》, LangChain, 2025-06-23）。本节讲到的每一种技术，本质上都落在其中一个动词上——下表把"动词"与"本节已展开的技术"一一对应，便于把零散方法挂回同一根骨架：

| 动词 | 一句话 | 本节对应技术 | 详见 |
|---|---|---|---|
| **Write**（写到窗外） | 把暂时不用的信息移出窗口、按需再读回 | structured note-taking（todo.md / NOTES.md / recitation）、外置记忆（MemGPT / A-MEM / Generative Agents）、microcompaction 把大工具输出写磁盘只留指针 | §4.4 · §4.6 · §7 案例 B |
| **Select**（按需拉回） | 需要时才把信息召回窗口 | RAG / 向量检索、just-in-time 动态发现（文件路径 / 符号 / URL 标识符自取）、语义选工具、工具/技能 JIT 加载（Skills / Tool Search / code-exec MCP，详见 [[04]]） | §4.6 · §5 · §6 争议 1/5 |
| **Compress**（压到够用） | 不丢关键信息前提下削减 token | compaction 高保真摘要重启、prompt 压缩（LLMLingua）、工具输出压缩、KV 选择 / 逐出 | §4.4 · §5 |
| **Isolate**（拆分隔离） | 把不同上下文拆开、互不污染 | subagent 独立窗口 + 蒸馏回传、沙箱、多智能体编排 | §5 · §6 争议 4 · §7 |

> 生产系统几乎总是四动词并用：稳定前缀 + prefix caching 打底，Select（JIT 检索）负责供给、Write（写文件 / 笔记）负责扩容、Compress（接近上限 compaction）负责保窗、Isolate（subagent）负责扛重活。§5 的方法谱系即可视为这四个动词的展开。

### 4.2 上下文里到底放什么

一段生产 Agent 的上下文，按"海拔"从稳定到易变，大致是：

```
[system prompt / 角色与策略]      <- 最稳定，放最前（缓存友好）
[工具定义 / tool schemas]         <- 稳定
[few-shot 示例 / 领域知识]        <- 较稳定
[长期记忆 / 检索召回结果]         <- 半动态
[历史对话 turn 1..n]             <- append-only 增长
[本轮工具调用 & 返回结果]         <- 最动态，放最后
```

**关键原则**：system prompt 要写在"正确的海拔"——既不要硬编码一堆 if-else 脆规则，也不要假设模型无所不知，而是给出清晰的启发式与边界（Anthropic）。**信息要按相关性精选**，无关信息不是中性的，它会主动触发 context rot。

### 4.3 context rot 与位置偏置（为什么"少即是多"）

*Lost in the Middle*：把答案放在长上下文不同位置，准确率呈 **U 形**——开头/结尾最高，中间最低。*Found in the Middle*（2024）把成因归于模型固有的 U 形注意力偏置，并提出校准机制按相关性而非位置分配注意力，RAG 任务最高 +10 个百分点。

Chroma *Context Rot* 的反直觉发现更狠：

- 即使是**简单复制/检索**任务，输入越长性能也单调下降；
- **单个干扰项**即降准确率，长上下文**放大**其害；
- 反直觉：**打乱无结构的 haystack 反而比逻辑连贯的文档表现更好**；
- LongMemEval 上，~300 token 的**聚焦输入**显著优于 ~113k token 的全量输入。

工程含义：**策展（curate）而非堆量（accumulate）**。

### 4.4 compaction：接近上限时怎么办

```python
def maybe_compact(ctx, model, threshold=0.85):
    if ctx.token_count() < model.window * threshold:
        return ctx                       # 还有余量，不动
    # 1) 先最大化 recall：摘要要保住"架构决策/未解 bug/实现细节/未完成 todo"
    summary = model.summarize(
        ctx.history,
        keep=["decisions", "open_bugs", "file_paths", "todos"]
    )
    # 2) 重启上下文：稳定前缀 + 摘要 + 最近 K 条原文（rehydration）
    new_ctx = ctx.system + ctx.tools + summary + ctx.last_k_messages(k=5)
    # 3) Claude Code 还会重读最近约 5 个文件、恢复 todo/plan
    return new_ctx
```

Anthropic 的次序是"**先保 recall、再提 precision**"——宁可摘要长一点也别丢关键决策。Claude Code 把它做成**三层**：microcompaction（大工具输出写磁盘，窗口里只留引用指针）、auto（留足"输出缓冲 + 压缩流程完成"的余量时自动触发）、manual（`/compact` 带 focus 让用户决定保留什么）。

> **"怎么压"本身也是权衡**：除了"何时压、压多狠"，压缩流程的调度方式同样影响吞吐——arXiv 2605.23296 从 serving 角度比较了**并行压缩 vs 顺序摘要**两条基线（HotpotQA / LoCoMo，跨 8B–120B 模型规模），提示在长程 agent 服务里压缩调度本身就是质量 / 延迟的权衡点（注：它是两路对比，而非一套四路策略）。

### 4.5 KV-cache / prefix caching：为什么布局决定成本

Transformer 推理分 prefill（处理输入）和 decode（逐 token 生成）。prefill 会为每个输入 token 算出 Key/Value 张量缓存（KV-cache）。**前缀缓存**：若两次请求共享相同前缀，第二次可直接复用第一次的 KV，跳过重复 prefill——这就是缓存读比未缓存便宜约 10x、延迟降 80% 的来源。

致命点：**缓存按最长公共前缀匹配，前缀一旦有一个 token 变了，后面全部失效**。所以：

```
✅ 缓存友好：  [稳定 system][稳定 tools][...历史 append-only...][本轮动态]
❌ 击穿缓存：  system 里塞了秒级时间戳 / 工具被动态增删 / JSON key 无序序列化
```

Manus 的硬约束由此而来：system prompt 不放秒级时间戳、上下文严格 **append-only**、JSON 序列化 key 稳定确定。《Don't Break the Cache》进一步实测："**把动态工具结果排除出缓存、动态内容置末**"优于朴素全量缓存——因为动态内容混进缓存会反复失效，朴素缓存反而徒增 TTFT。

### 4.6 just-in-time vs 预加载

两条路线对应"何时把信息放进窗口"：

- **预加载（CAG / Sleep-time）**：查询前就把全部相关知识塞进窗口并预计算 KV（CAG），或在查询到来前**离线**预处理上下文、预更新长期记忆（Sleep-time Compute：测试期算力降约 5x、准确率最高 +18%）。适合知识库**小而稳定**。
- **just-in-time（Anthropic / Cursor）**：上下文里只放轻量**标识符**（文件路径、URL、工具名），让 Agent 在需要时自取。Cursor 把"文件"作为统一原语：长输出写文件用 `tail/grep` 选读、MCP 工具按 server 分文件夹按需加载。适合知识库**大、时效强**。

这套 JIT 思路在 2025-H2 已从"知识检索"延伸到**工具与技能定义本身**——把一次性全量预载的 tool schema 改为用到才拉进窗口，是 Select 动词在工具侧的产品化（机制细节属 [[04]] 工具/MCP，由 Harness 运行时 [[02]] 在每轮循环里调度）。三个一手机制：

- **Agent Skills**（Anthropic，2025-10-16）：技能 = 含 `SKILL.md` 的文件夹，按**渐进披露（progressive disclosure）三级**加载——先只读 metadata、命中才载入完整指令、再按需拉取支撑文件，避免把所有技能说明常驻窗口。
- **Tool Search Tool**（Anthropic，2025-11-24）：给工具打 **`defer_loading`** 标记，用检索每次只展开 3–5 个工具引用，把工具定义占用从约 **77K 压到 8.7K token（~85%）**，最多可挂 1 万工具。
- **Code execution with MCP**（Anthropic，2025-11-04）：把 MCP server 当作代码 API、用到才 `import`，上下文从 **150K 降到 2K token（-98.7%）**。

---

## 5. 主流方法谱系

| 方案 | 核心机制 | 解决的子问题 | 代表工作 | 代价 / 边界 |
|---|---|---|---|---|
| **长上下文扩展** | RoPE 内插/外推扩窗 | 让窗口能放下更多 | Position Interpolation、YaRN | 窗口大 ≠ 会用；context rot；成本 O(n²) |
| **RAG（Select）** | 向量检索召回外部知识 | 时效/私有知识、控窗口 | Lewis RAG（2020） | 检索质量上限；切块/rerank 工程 |
| **CAG 预载** | 全知识预载 + 预计算 KV | 免检索延迟与召回误差 | Chan《Don't Do RAG》 | 受窗口限制；知识库须小而稳 |
| **prompt 压缩（Compress）** | token 级迭代压缩 | 降 token 成本 | LLMLingua（20x）、LongLLMLingua | 有损；问题感知压缩需额外模型 |
| **KV 选择/逐出** | 按注意力重要性留 KV | 显存/解码加速 | H2O、SnapKV、StreamingLLM | 可能丢长程依赖 |
| **prefix caching** | 复用相同前缀 KV | 降成本/TTFT（10x） | Prompt Cache；三大厂产品 | 要求稳定前缀、append-only |
| **compaction（Compress）** | 高保真摘要后重启 | 窗口溢出、长对话 | Anthropic / Claude Code | 摘要有损；需 rehydration |
| **外置记忆（Write）** | 文件/笔记/记忆库换页 | 看似无限上下文 | MemGPT、A-MEM、Generative Agents | 召回可靠性、记忆评测难 |
| **subagent（Isolate）** | 独立窗口 + 蒸馏回传 | 上下文隔离、扩展总容量 | Anthropic research system | ~15x token；协调/冲突风险 |
| **JIT / 动态发现** | 标识符按需自取 | 控膨胀、降 token | Anthropic（Skills / Tool Search / code-exec MCP）、Cursor（-46.9%） | 多花若干步主动检索 |
| **工具掩蔽（mask）** | logits masking 限定可选 | 保缓存、防悬空引用 | Manus | 工具集固定、灵活性下降 |

> 这些方法**不是互斥的**，生产系统通常组合使用：稳定前缀 + prefix caching + append-only + JIT 检索 + 接近上限时 compaction + subagent 隔离重活。

---

## 6. 主流观点与争议

### 争议 1：长上下文 vs RAG——窗口达百万级后 RAG 还有必要吗？

- **A 方（"RAG 已死"/长上下文派）**：代表 Google/Gemini 团队及部分实践者。窗口已 1–2M，直接全塞更简单，省去切块与检索管线；让模型用原生 attention 交错检索与生成，质量高于一次性朴素检索；token 会越来越便宜越快。CAG（Chan et al.《Don't Do RAG》）是其学术形态：预载 + 预计算 KV，消除检索延迟与误差。
- **B 方（RAG 仍在/混合派）**：代表 Jerry Liu（LlamaIndex，"演进而非消亡"）、Chroma、Anthropic（"策展 token"立场）。真实知识库**永远大于任何窗口**；lost-in-the-middle 与 context rot 让"全塞"不可靠；检索更省成本、更低延迟、可审计可溯源。长上下文只是**简化**（如减少切块）而非取代 RAG，终局是"长上下文 RAG"混合架构。
- **我的判定锚点**：边界由知识规模、时效、可审计性决定，学术评测（多篇 long-context vs RAG 对比）多指向"混合"。

> 📦 **结案框：长上下文 vs RAG（CAG）之争**
> - **提出（2024）**：Gemini 1.5 百万 token 窗口 + CAG《Don't Do RAG》把"窗口够大，RAG 还要吗"推上风口。
> - **2026 定论**：Self-Route（Google，arXiv 2407.16833）给出收敛性实证——资源充足时长上下文质量略优，但 RAG 成本低得多；按需路由（先用 RAG，判定不可答再转长上下文）兼得二者，**降本 ~65%（Gemini-1.5-Pro）/ ~39%（GPT-4o）而质量逼近纯长上下文**。
> - **现状**：终局不是二选一，而是"长上下文 RAG"混合 / 缓存感知的 agentic retrieval；边界由知识规模、时效、可审计性、窗口与缓存预算共同决定。

### 争议 2："context engineering"是真演进还是新瓶装旧酒？

- **A 方（真演进）**：Karpathy、Tobi Lütke、Anthropic。"prompt engineering 没错，只是瓶颈挪到了别处"——生产 Agent 里提示只占总上下文一小部分，真正决定成败的是历史/工具输出/记忆/检索如何被组装维护，值得新名字与新方法论。
- **B 方（换皮/怀疑）**：HN / OpenAI 开发者论坛部分实践者。这些事从业者早就在做，只是重新包装，本质仍是提示工程，更多是营销与 hype 周期。
- **折中方**：Simon Willison——认可这是个**有用的新名字**，但承认底层做法（往窗口里放对的东西）早已存在。

### 争议 3：上下文溢出时——窗口内 compaction 还是外置到文件再 JIT 召回？

- **compaction 派（Anthropic / Claude Code）**：摘要后重启最简单，对**持续对话**最佳，摘要保留架构决策/未解 bug。
- **文件外置派（Manus / Cursor）**：摘要是 **lossy** 的，应把长输出写文件、保留**可恢复指针**，摘要时再回查原文；迭代型长任务更稳。
- 实务上二者常**混合**：摘要 + 关键原文回查。

### 争议 4：长任务用 multi-agent 并行还是单线程线性？（与 [[08]] 强关联）

- **Cognition / Devin（Walden Yan《Don't Build Multi-Agents》）**：反对朴素并行。两原则——①共享上下文且要共享**完整 trace**（不只单条消息）；②动作隐含决策，冲突决策产坏结果（Flappy Bird 例：subagent 各画不兼容的美术风格）。主张**单线程线性 Agent**，长任务才引入专门的上下文压缩模型。
- **Anthropic（《How we built our multi-agent research system》）**：orchestrator-worker（Opus 4 主控 + Sonnet 4 subagent 并行检索），内部评测比单代理高 **90.2%**，代价约 **15x token**。subagent 各持独立窗口、只回传蒸馏摘要。
- **同一问题的相反结论**：关键在任务是否**可并行解耦**。检索类广度任务 → multi-agent 收益大；强耦合需共享决策的任务 → 单线程更稳。

### 争议 5：工具集变大时——动态增删还是固定 + 遮罩？

- **Manus**：动态增删会**击穿 KV-cache** 且让模型指向已消失的工具，应保持定义稳定、用 **logits masking**（统一前缀 `browser_`/`shell_`）限定可选。
- **Cursor**：按需选择性加载 MCP 工具（分文件夹、grep/语义发现），据其博客 A/B 实测降 **46.9% token**，动态加载在编码场景有效。
- 边界：缓存稳定性优先（高频短交互）→ Manus 路线；token 预算优先且工具海量（编码/MCP 生态）→ Cursor 路线。

### 争议 6：context rot 是可被规模/训练消除的工程缺陷，还是注意力的根本限制？

- **可解决派**：长窗口推动者（Google DeepMind、Magic.dev）。更好的位置编码、训练数据与更大窗口会逐步抹平中间位置劣势。
- **根本限制派**：Chroma（Hong/Troynikov/Huber）、Drew Breunig。退化随长度单调出现、跨 18 模型普遍，attention 稀释是结构性的（O(n²) 下 100K token 即上百亿对关系），"少而精策展"将长期必要。

---

## 7. 大厂工程实践

### 案例 A：Manus——以 KV-cache 命中率为头号指标

**取舍：为命中率牺牲灵活性。** Manus（Yichao "Peak" Ji）把生产 Agent 总结为六条，核心是"缓存友好布局"：

1. **KV-cache 命中率是头号指标**——Claude Sonnet 缓存 $0.30 vs 未缓存 $3/MTok（10x），输入:输出 ≈ 100:1。故 system prompt 不放秒级时间戳、上下文严格 append-only、JSON key 序列化稳定。
2. **工具用 logits masking 而非动态增删**——统一前缀，避免击穿缓存与悬空引用。
3. **文件系统即"无限上下文"**——做**可恢复压缩**（保留 URL/路径，需要时再读回）。
4. **recitation 对抗 lost-in-the-middle**——用 `todo.md` 把目标反复重写进**近端**上下文（复杂任务约 50 次工具调用，目标易被"冲淡"）。
5. **保留错误堆栈**——让模型看到失败以自我纠偏，而非默默吞掉。
6. **避免 few-shot 模式僵化**——示例过多会让模型机械模仿。

**工程亮点**：把抽象的"上下文工程"翻译成可量化的成本/延迟收益，证明它是硬工程。

### 案例 B：Anthropic Claude Code——compaction 三件套 + 三层治理

**取舍：分层治理而非一次性丢历史。**

- **三件套**：compaction（接近上限高保真摘要重启）、structured note-taking（NOTES.md/todo 持久化到窗口外）、subagent（给子任务全新窗口，探索几万 token 只回传 1k–2k 蒸馏摘要）。
- **三层 compaction**：microcompaction（大工具输出写磁盘，窗口留引用指针，覆盖 Read/Bash/Grep/Glob/WebSearch/WebFetch/Edit/Write）→ auto（留足"输出缓冲 + 压缩完成"的 buffer 时触发，社区观测触发点较历史 90%+ 提前）→ manual（`/compact` 带 focus）。
- **rehydration**：压缩后重读最近约 5 个文件、恢复 todo/plan。
- **just-in-time**：上下文里放轻量标识符而非预加载全量；把大文件读取**委派给 subagent**，使内容留在 subagent 窗口而非主窗口（见官方 *Explore the context window* 文档）。

**对照案例（同属 Anthropic）**：orchestrator-worker multi-agent 研究系统——用 ~15x token 换检索广度与上下文隔离，比单代理高 90.2%，但明确限定用于"产出价值远超成本"的研究类任务。它与 Cognition 的单线程立场构成同一问题的相反工程结论（§6 争议 4）。

### 案例 C（补充）：跨厂商缓存作为成本杠杆

**收敛的工程约束：“不变的放前面、可变的放后面”。** Anthropic 用 `cache_control` 显式打断点（5 分钟 TTL、命中免费续期、最高省 90%）；OpenAI 自动前缀缓存（≥1024 token、128 递增，成本节省按模型分档——GPT-4o 约 50% / GPT-4.1 约 75% / GPT-5 系约 90% / 实时音频约 98.75%，延迟最高降约 80%）；Google 显式 context caching（省约 75%）+ 隐式缓存。三家机制不同，但都把 append-only、稳定 system prompt 这类设计的经济性变成现实——这是 §4.5 布局原则的产品基础。

---

## 8. 我的分析与判断

> **以下为分析观点（非客观事实），是我基于上述材料的独立研判，供参考与批判。**

**趋势研判一：上下文工程正在"下沉"为 Harness 的默认能力，但不会消失。** 2025 年它还是要靠工程师手动布局（稳定前缀、recitation、手写 compaction）；2026 年 Cursor/Claude Code 已经把"文件即上下文""动态发现""三层 compaction"做进运行时。我判断未来 1–2 年它会像 GC（垃圾回收）之于内存管理一样**部分自动化**——但**不会被完全吸收**：因为"放什么"本质是任务语义判断，模型自管理上下文仍受 context rot 反噬（让一个会腐烂的系统自己决定喂自己什么，存在循环依赖）。所以这是个"高层抽象不断吃掉低层手活、但顶层判断永远留给人/更强模型"的渐进过程。

**趋势研判二：长上下文 vs RAG 之争会以"混合 + 分层缓存"收场。** "RAG 已死"是营销叙事。真实约束是经济学：百万窗口全塞的 prefill 成本 + context rot 的质量损失，长期高于"JIT 检索 + 前缀缓存"。我赌终局是 **JIT 检索把高信号片段放进一个高度缓存友好的稳定布局里**——既不是纯长上下文，也不是经典 RAG，而是"缓存感知的 agentic retrieval"。《Don't Break the Cache》是这个方向的第一块实证基石；而 **Self-Route**（见 §6 争议 1 结案框）已先一步给"长上下文 vs RAG"盖棺：质量略优但贵、RAG 便宜，按需路由两得其美。

**常见坑（我见过/可预见的）**：

1. **在 system prompt 里塞动态时间戳/会话 ID**——一行就击穿全部缓存，账单翻数倍而你以为是模型变贵了。
2. **把工具结果原文无脑 append**——一次网页抓取几万 token 直接灌进主窗口，三五轮就 context rot。正解：写文件 + 留指针（§4.6）。
3. **compaction 只保 precision 不保 recall**——摘要太"干净"丢了未解 bug 和架构决策，模型重启后开始**重复犯已经犯过的错**。Anthropic 的"先 recall 后 precision"是对的。
4. **盲目上 multi-agent 追求并行**——强耦合任务里 subagent 做出不兼容假设，整合阶段全盘崩（Cognition 的核心警告）。先问"这任务真能解耦吗"。
5. **用 few-shot 示例当万灵药**——示例会让 Agent 陷入模式僵化，长程任务里尤其有害。
6. **只测 needle-in-haystack 就宣称"支持 1M 上下文"**——RULER/Context Rot 已证明这远高估真实可用长度。

**最佳实践清单（我的优先级排序）**：

1. **先量缓存命中率**——它是成本/延迟的总开关，且最容易被一行代码毁掉。稳定前缀 + append-only + 确定性序列化是地基。
2. **默认 JIT、谨慎预载**——除非知识库小而稳（适合 CAG/Sleep-time），否则用标识符按需自取。
3. **长输出一律写文件、窗口留指针**——可恢复压缩 > 有损摘要，能不丢就不丢。
4. **接近上限再 compaction，且先 recall 后 precision，压缩后 rehydration**。
5. **用 recitation（todo.md）把目标钉在近端**——对抗 lost-in-the-middle 的廉价高效手段。
6. **multi-agent 只用于可并行解耦的广度任务**，并接受 ~15x token 的明账。
7. **建立超越 NIAH 的内部 eval**——至少测干扰项、长度梯度、位置敏感性。

**一句话判断**：上下文工程的本质不是"如何放更多"，而是"如何在有限注意力预算下，让每个 token 都值回它稀释掉的注意力"。**少即是多**不是审美偏好，而是被 18 个模型实证支撑的工程定律。

---

## 9. 面试考点

**概念题**

1. **什么是 context engineering？和 prompt engineering 什么关系？**
   要点：在推理时持续**策展与维护"最优 token 集合"**的策略集合；prompt 只是其子集，历史/工具输出/记忆/检索共同构成上下文。一句话：瓶颈从"措辞"转移到"整窗口内容治理"。它是 prompt engineering 的自然演进而非取代。

2. **解释 lost-in-the-middle 与 context rot，二者区别？**
   要点：lost-in-the-middle 是**位置偏置**（U 形，中间信息利用率最低，Liu 2023）；context rot 是 Chroma 2025 提出的更普遍现象——**输入越长、性能非均匀地单调退化**，即使远未溢出窗口、即使简单复制任务也成立。前者是"放哪里"，后者是"放多少"。共同结论：注意力是有限预算，少即是多。

3. **prefix/KV caching 的原理？为什么决定 Agent 成本？**
   要点：prefill 为输入算 KV-cache；相同前缀可复用 KV、跳过重复 prefill，缓存读 vs 未缓存约 10x 价差、延迟降最高 80%。Agent 输入:输出 ≈ 100:1，绝大部分算力在反复 prefill，故命中率是头号成本指标。**按最长公共前缀匹配，前缀变一个 token 后面全失效**。

4. **Write / Select / Compress / Isolate 四类操作各举一例。**
   要点：Write=scratchpad/记忆写到窗口外；Select=RAG/语义选工具；Compress=对话摘要/工具输出压缩/compaction；Isolate=multi-agent/沙箱。心智模型：LLM=CPU、上下文=RAM。

**系统设计题**

5. **设计一个能跑几十步、不爆上下文的长程编码 Agent。**
   要点框架：①**布局**：稳定 system+tools 前缀、append-only、确定性 JSON 序列化（保缓存）；②**供给**：JIT 检索（文件路径/符号按需读），大输出写文件留指针；③**治理**：接近上限触发 compaction（先 recall 保架构决策/未解 bug/todo，后 precision，压缩后重读最近文件 rehydration）；④**对抗腐烂**：todo.md recitation 把目标钉在近端、保留错误堆栈；⑤**隔离重活**：把大范围探索委派 subagent、只回传蒸馏摘要；⑥**度量**：监控缓存命中率、TTFT、每步 token。说清每个选择的取舍即满分。

**手写题**

6. **写出 compaction 触发与执行的伪代码（含 rehydration）。**
   参见 §4.4：阈值判断 → 高保真摘要（keep 决策/bug/路径/todo）→ 稳定前缀 + 摘要 + 最近 K 条原文重启 → 重读最近文件、恢复 todo/plan。评分点：**先 recall 后 precision**、保留指针、rehydration 三处。

**陷阱题**

7. **"窗口够大就把所有文档全塞进去，最省事" —— 对吗？**
   陷阱：忽视 context rot 与成本。反驳：①18 模型实证输入越长越不可靠（连乱序 haystack 反优于连贯文档）；②单个干扰项即降准确率；③O(n²) prefill 成本 + 缓存难命中。正解：JIT + 最小高信号 token。

8. **"把整段上下文都做 prefix 缓存，肯定更省钱" —— 对吗？**
   陷阱：把动态工具结果混进缓存。反驳（《Don't Break the Cache》）：动态内容会让缓存反复失效，朴素全量缓存反而**可能增加延迟**；正解是动态内容置末、排除动态工具结果，省 41–80%、TTFT +13–31%。

9. **"multi-agent 并行一定比 single-agent 强" —— 对吗？**
   陷阱：忽视上下文隔离的冲突决策。反驳：Cognition 证明强耦合任务里 subagent 做不兼容假设导致整合失败；Anthropic 的 90.2% 仅在**可并行的广度检索**任务成立，且代价 ~15x token。正解：先判断任务可否解耦。

---

## 10. 参考文献

### 📄 论文

- **Brown et al. (2020)** · *Language Models are Few-Shot Learners (GPT-3)* · 确立 in-context learning，使"上下文里放什么示例"成为决定性能的工程变量。 · https://arxiv.org/abs/2005.14165
- **Lewis et al. (2020, Meta/FAIR)** · *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks* · 开创 RAG：参数化记忆 + 非参数化检索，"按需把外部知识放进上下文"的范式源头。 · https://arxiv.org/abs/2005.11401
- **Wei et al. (2022, Google)** · *Chain-of-Thought Prompting Elicits Reasoning in LLMs* · 证明上下文结构/内容设计比单纯措辞更关键，prompt 走向工程化的标志。 · https://arxiv.org/abs/2201.11903
- **Liu et al. (2023, Stanford)** · *Lost in the Middle: How Language Models Use Long Contexts* · 实证 U 形位置偏置，"上下文需被编排"的第一份硬证据。 · https://arxiv.org/abs/2307.03172
- **Chen et al. (2023)** · *Extending Context Window of LLMs via Position Interpolation* · RoPE 线性内插少量微调扩窗到 32K，长上下文扩展奠基方法之一。 · https://arxiv.org/abs/2306.15595
- **Peng et al. (2023)** · *YaRN: Efficient Context Window Extension of LLMs* · 高效扩展 RoPE 窗口并支持推理期 Dynamic Scaling 免微调外推，事实标准。 · https://arxiv.org/abs/2309.00071
- **Xiao et al. (2023)** · *Efficient Streaming Language Models with Attention Sinks (StreamingLLM)* · 发现 attention sink，保留最初几个 token 的 KV 即可稳定外推到数百万 token。 · https://arxiv.org/abs/2309.17453
- **Zhang et al. (2023, NeurIPS)** · *H2O: Heavy-Hitter Oracle for Efficient Generative Inference of LLMs* · 基于 heavy-hitter 的 KV-cache 逐出策略，把 KV 与推理成本问题形式化。 · https://arxiv.org/abs/2306.14048
- **Packer et al. (2023, UC Berkeley)** · *MemGPT: Towards LLMs as Operating Systems* · OS 式分层内存/换页，把上下文重构为"需被调度的资源"。 · https://arxiv.org/abs/2310.08560
- **Park et al. (2023, UIST)** · *Generative Agents: Interactive Simulacra of Human Behavior* · memory stream + reflection + retrieval，agent 长期记忆与 JIT 召回的范式样板。 · https://arxiv.org/abs/2304.03442
- **Jiang et al. (2023, EMNLP)** · *LLMLingua: Compressing Prompts for Accelerated Inference of LLMs* · 预算控制器 + token 级迭代压缩，最高 20x 压缩仍保能力。 · https://arxiv.org/abs/2310.05736
- **Jiang et al. (2023)** · *LongLLMLingua* · 面向长上下文/RAG 的问题感知压缩与重排，约 4x 更少 token 反而提升最多 21.4%。 · https://arxiv.org/abs/2310.06839
- **Gim et al. (2023, MLSys 2024)** · *Prompt Cache: Modular Attention Reuse for Low-Latency Inference* · 对可复用片段预计算并跨请求复用 KV，前缀缓存的学术基础。 · https://arxiv.org/abs/2311.04934
- **Hsieh et al. (2024)** · *RULER: What's the Real Context Size of Your Long-Context LMs?* · 多针/多跳/聚合合成任务揭示真实可用上下文远短于宣称值。 · https://arxiv.org/abs/2404.06654
- **Li et al. (2024, NeurIPS)** · *SnapKV: LLM Knows What You are Looking for Before Generation* · 用 prompt 末端观察窗聚类重要 KV 压缩，16K 输入 3.6x 解码加速几乎不掉点。 · https://arxiv.org/abs/2404.14469
- **Hsieh et al. (2024, ACL Findings)** · *Found in the Middle: Calibrating Positional Attention Bias* · 把 lost-in-the-middle 归因于 U 形注意力偏置并提出校准，RAG 最高 +10pp。 · https://arxiv.org/abs/2406.16008
- **Chan et al. (2024, WWW 2025)** · *Don't Do RAG: When Cache-Augmented Generation (CAG) is All You Need for Knowledge Tasks* · 全知识预载 + 预计算 KV、免实时检索，"预加载 vs JIT"之争的代表。 · https://arxiv.org/abs/2412.15605
- **Self-Route (Google, 2024)** · *按需在 RAG 与长上下文间路由* · 资源足时长上下文质量略优、RAG 成本低得多；先 RAG、判定不可答再转长上下文，降本 ~65%（Gemini-1.5-Pro）/ ~39%（GPT-4o）而质量逼近纯长上下文——"RAG vs 长上下文"争议的收敛性实证（§6 结案框）。 · https://arxiv.org/abs/2407.16833
- **Xu et al. (2025)** · *A-MEM: Agentic Memory for LLM Agents* · Zettelkasten 式自动结构化笔记 + 动态互链，可自演化的 agent 记忆网络。 · https://arxiv.org/abs/2502.12110
- **Lin, Packer et al. (2025, Letta/UC Berkeley)** · *Sleep-time Compute: Beyond Inference Scaling at Test-time* · 查询前离线预处理上下文/预更新记忆，测试期算力降约 5x、准确率最高 +18%。 · https://arxiv.org/abs/2504.13171
- **Mei et al. (2025, 中科院计算所等)** · *A Survey of Context Engineering for Large Language Models* · 首篇系统综述（1400+ 篇），定义为"对信息载荷的系统优化"，拆检索生成/处理/管理三层。 · https://arxiv.org/abs/2507.13334
- **Hua et al. (2025, GAIR/上海交大等)** · *Context Engineering 2.0: The Context of Context Engineering* · 形式化定义 + 1.0/2.0 历史分期，论证可追溯至 1990s 人机交互。 · https://arxiv.org/abs/2510.26493
- **Lumer et al. (2026)** · *Don't Break the Cache: An Evaluation of Prompt Caching for Long-Horizon Agentic Tasks* · DeepResearchBench 上比较三厂三策略，"动态内容置末、排除动态工具结果"优于朴素全量缓存。 · https://arxiv.org/abs/2601.06007
- **Vishnyakova (2026)** · *Context Engineering: From Prompts to Corporate Multi-Agent Architecture* · 五准则（relevance / sufficiency / isolation / economy / provenance）+ 累进成熟度金字塔 Prompt→Context→Intent→Spec，把上下文工程上升为企业级分层方法论。 · https://arxiv.org/abs/2603.09619
- **Parallel Context Compaction (2026)** · *Parallel Context Compaction for Long-Horizon LLM Agent Serving* · 从 serving 角度对比并行压缩 vs 顺序摘要两条基线（HotpotQA / LoCoMo，8B–120B），把"压缩怎么调度"纳入吞吐 / 质量权衡（两路对比而非四路策略）。 · https://arxiv.org/abs/2605.23296

### ✍️ 博客与工程文

- **Anthropic Engineering (2025)** · *Effective context engineering for AI agents* · 官方定义 + compaction/note-taking/subagent/JIT 系统化（随 Sonnet 4.5）。 · https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- **Manus / Yichao "Peak" Ji (2025)** · *Context Engineering for AI Agents: Lessons from Building Manus* · KV-cache 命中率头号指标、文件即上下文、mask 而非删工具、recitation 实战范本。 · https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus
- **LangChain (2025)** · *Context Engineering for Agents (Write/Select/Compress/Isolate)* · 四类基本操作 + "LLM=CPU、上下文=RAM"心智模型。 · https://www.langchain.com/blog/context-engineering-for-agents
- **Chroma / Hong, Troynikov, Huber (2025)** · *Context Rot: How Increasing Input Tokens Impacts LLM Performance* · 18 模型实证输入越长越不可靠、非均匀退化，"少即是多"的实证锚点。 · https://research.trychroma.com/context-rot
- **Cognition / Walden Yan (2025)** · *Don't Build Multi-Agents* · 反朴素并行 multi-agent：共享完整 trace、动作隐含决策，主张单线程线性。 · https://cognition.ai/blog/dont-build-multi-agents
- **Anthropic Engineering (2025)** · *How we built our multi-agent research system* · orchestrator-worker multi-agent 比单代理高 90.2%，代价 ~15x token，与 Cognition 对照。 · https://www.anthropic.com/engineering/multi-agent-research-system
- **Cursor (2026)** · *Dynamic context discovery* · 少给前置上下文让 agent 自取，选择性加载 MCP 工具降 46.9% token，"文件"为统一原语。 · https://cursor.com/blog/dynamic-context-discovery
- **Drew Breunig (2025)** · *How Long Contexts Fail (and How to Fix Them)* · 上下文失效四象限 poisoning/distraction/confusion/clash，故障地图。 · https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html
- **Andrej Karpathy (2025, X)** · *+1 for "context engineering" over "prompt engineering"* · 为术语背书："用恰好正确的信息填充上下文窗口"的精细艺术，提示只是其一小部分。 · https://x.com/karpathy/status/1937902205765607626
- **Simon Willison (2025)** · *Context engineering* · 折中立场：有用的新名字，但承认底层做法早已存在。 · https://simonwillison.net/2025/jun/27/context-engineering/

### 📚 官方文档

- **Anthropic (2025)** · *Prompt caching（Claude API 文档）* · 用 `cache_control` 打断点缓存稳定前缀，5 分钟 TTL、命中免费续期、最高省 90%。 · https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- **OpenAI (2024)** · *Prompt Caching in the API* · 自动 prefix caching，≥1024 token 起 128 递增匹配，零改动；成本节省按模型分档（GPT-4o 约 50% / GPT-4.1 约 75% / GPT-5 系约 90% / 实时音频约 98.75%），延迟最高降约 80%。 · https://openai.com/index/api-prompt-caching/
- **Google Developers (2025)** · *Gemini 2.5 models now support implicit caching* · 显式 context caching（省约 75%）之上加隐式缓存，自动传递命中折扣。 · https://developers.googleblog.com/en/gemini-2-5-models-now-support-implicit-caching/
- **Anthropic / Claude Code (2025)** · *Explore the context window* · 说明 Claude Code 上下文构成与管理（自动 compaction、`/compact` focus、`/clear`、委派 subagent）。 · https://code.claude.com/docs/en/context-window

---

> **交叉链接**：[[00]] 导论与心智模型 · [[01]] Agent 核心与推理范式 · [[02]] Harness 运行时 · [[04]] 工具与 MCP · [[06]] 记忆系统 · [[07]] 检索与 RAG · [[08]] 多智能体编排 · [[13]] 大厂案例研究
