> 状态：🟢 已校验

# 07 · 检索与 RAG（Retrieval & RAG）

> **定位**：Agent 如何"取知识"——把外部语料/代码库/记忆喂进上下文的召回与增强机制。
> 上游接 [[03]] 上下文工程（检索结果最终要塞进上下文窗口）、[[06]] 记忆系统（检索是长期记忆的读路径）；
> 下游接 [[01]] 推理范式（检索可作为推理循环里的一次工具调用）、[[09]] 评估（检索质量是生成质量的天花板）、[[16]] 训练（**记忆/检索策略可被 RL 训练**——把静态 RAG 升级为可训练的记忆/检索策略，见 [[16]] Memory-R1 与本节 SWE-grep）。

---

## 1. TL;DR / 速览

**本节地图**：稠密/稀疏/混合检索的底层机制 → 分块与粒度 → 重排与两阶段检索 → 自适应/agentic 检索 → 结构化 RAG（图/树）→ 多模态/视觉文档检索 → 长上下文之争 → 大厂工程取舍 → 评估与面试。

**核心结论（先看这 5 条）**：

1. **RAG 的本质是"非参数化记忆"**。把知识从模型权重里搬到可热插拔的外部索引，换来三样东西：**时效性**（换索引即更新）、**可归因**（带 citation）、**少幻觉**。这是 2020 年 Lewis 等人定义 RAG 时的第一性动机，至今未变。
2. **生产默认是 hybrid + rerank，不是纯稠密**。BEIR 证明稠密模型域外泛化弱、BM25 是难打的强基线；稀疏（BM25/SPLADE）+ 稠密 + 交叉编码器重排是经过反复验证的工业默认配方。
3. **分块（chunking）是隐藏瓶颈**。扁平切块会丢文档级语境与结构，Contextual Retrieval（给每个 chunk 注入上下文）、RAPTOR（层级摘要树）、GraphRAG（实体图）都是在补这个洞。
4. **检索已从"一次召回"沉淀为"推理循环里的一个工具"——这是 2026 的终态主线**。Self-RAG/FLARE 把"是否检索"变成可学习的决策；Agentic RAG / Deep Research（系统化综述见 arXiv 2501.09136）把检索做成 plan→search→reflect 的多轮循环；编码 agent（Claude Code、SWE-grep）甚至直接用 grep 当检索器。**classic "retrieve-then-generate" 退为单跳/简单场景的历史背景与退化特例**。
5. **"RAG 已死"是伪命题，真正发生的是分化**：naive RAG 在退场，但**文档/企业知识库**里向量 RAG 依旧最强，**结构化代码世界**更适合 agentic search，**百万 token 上下文**则用来兜小语料——业界共识是**按场景路由（routing），而非二选一**。

---

## 2. 定位与动机：在 Agent 链路里，检索解决什么

LLM 的参数化记忆有三个硬伤：**冻结**（训练截止后的知识不会更新）、**不透明**（说不清答案来自哪）、**会幻觉**（缺知识时编造）。Agent 要在真实业务里可用，必须能引入私有、实时、可追溯的外部知识——这正是检索的位置。

在 Think–Act–Observe 链路里，检索可以出现在两个层次：

- **作为预处理（classic RAG）**：用户问题来 → 检索 top-k 片段 → 拼进 prompt → 生成。这是"retrieve-then-generate"模板。
- **作为工具（agentic RAG）**：检索退化成 agent 可在推理循环里随时调用的一个 tool（见 [[04]] 工具与 MCP）。何时检索、检索什么、要不要再检索一轮，都由模型决策。

> **2026 的终态：agentic RAG 是主线，classic RAG 退为历史背景。** 早年 "retrieve-then-generate"（检索 → 拼接 → 生成）是 RAG 的默认形态；但当模型已普遍具备长上下文、工具调用与多轮规划能力后，**把检索当成推理循环里随时可调的工具**成为生产默认——何时检索、检索几轮、用哪种检索器（向量 / grep / 图 / 视觉）都交给模型决策。classic RAG 不再是"RAG 的全部"，而是 agentic RAG 在"单跳、低不确定性"场景下的一个退化特例。这条主线的系统化梳理见 **Agentic RAG 综述**（Singh 等，2025，arXiv 2501.09136《Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG》），它把反思 / 规划 / 工具调用 / multi-agent 协作归纳为 agentic RAG 的能力骨架。本节后续的"召回底座 / 分块 / 重排 / 结构化 / 多模态"都应读作**这台 agent 可以调用的检索手段菜单**，而非互斥的方案二选一。

为什么不"把所有东西都塞进上下文"？因为成本/延迟随上下文长度线性（甚至超线性）增长，且长上下文有两种各自独立的退化（与 [[03]]/[[06]] 同口径）：**Lost in the Middle**——U 形位置偏置，关键信息放在中段时利用率最低（"放哪里"的问题）；**context rot**——输入越长、性能非均匀地整体退化，即便远未溢出窗口也成立（"放多少"的问题）。检索的价值就是**做相关性筛选**——在喂给模型之前先把噪声砍掉。Anthropic 在《Effective context engineering》里把这一点提炼为 **just-in-time 检索**：上下文里只存轻量标识（文件路径/查询/链接），运行时再按需加载，保持上下文 "informative yet tight"。这条原则与 [[03]] 上下文工程深度耦合。

---

## 3. 历史发展脉络（2020 → 2026）

> 一条主线：**检索从"静态一次召回"演进为"推理驱动的动态过程"**；另一条暗线：**分块/索引的语境丢失问题被反复用更重的预处理来补**。

- **2020 · 三块基石同年落地**。REALM（Guu 等）首次端到端预训练神经检索器；DPR（Karpukhin 等）用双编码器证明纯稠密向量可超 BM25；ColBERT（Khattab & Zaharia）提出 late interaction（token 级多向量）在精度与效率间取平衡。*为什么*：稀疏关键词匹配吃不下同义/改写，稠密检索让召回变得可学习、可扩展，成为后续一切 RAG 的底座。
- **2020 · "RAG"被正式命名**。Lewis 等（FAIR/UCL/NYU, NeurIPS 2020）把 DPR 检索器与 BART 生成器缝合，统一参数化与非参数化记忆，在开放域 QA 上 SOTA。*为什么*：确立了"换索引即更新知识"的范式，是所有工程栈的原点。
- **2021 · 评测与表示成熟**。BEIR（18 个异质数据集，零样本检索基准）暴露稠密模型域外泛化短板、坐实 BM25 强基线；SPLADE 学习可用倒排索引的稀疏表示；Contriever 用无监督对比学习做稠密检索。*为什么*：直接催生"稀疏+稠密混合检索"的行业共识。
- **2022 · 查询侧改写 + 推理交错的种子**。HyDE 让 LLM 先生成假设文档再检索；Atlas 证明检索增强模型仅用 64 例就能超越 540B 大模型；同时 ReAct / Self-Ask 把思维链与搜索调用交错——agentic RAG 的概念雏形。ColBERTv2 用残差压缩把多向量存储降 6–10 倍，让 late interaction 落地可行。
- **2023 · 自适应/迭代检索爆发**。Self-RAG（反思 token 决定何时检索并自评）、FLARE（下一句置信度低才触发检索）、IRCoT（检索与思维链逐句交错）；RankGPT 让 LLM 当零样本重排器。同年 Lost in the Middle（Liu, Liang 等）给出 U 形位置偏置的实证，成为"检索精排 vs 上下文堆砌"之争的关键论据；RAG 评测体系化（RAGAS、ARES、Gao 等综述提出 Naive/Advanced/Modular 三范式）；LangChain/LlamaIndex 与向量数据库（Pinecone 等）把 RAG 从论文变成工程栈。
- **2024-02 · Gemini 1.5 Pro 上百万 token 上下文**，>99% 大海捞针召回，点燃"**RAG 已死**"的第一波争论。*为什么*：既然模型本身就是强检索器，为何还要维护脆弱的切块/嵌入/索引管线？
- **2024 · 结构化与稳健化 RAG**。RAPTOR（递归摘要树，ICLR 2024）、GraphRAG（Microsoft, 04 月，实体图+社区摘要做全局 sensemaking）、HippoRAG（知识图+Personalized PageRank 做长期记忆）、CRAG（检索质量评估+纠错兜底）。*为什么*：突破"只检索短片段"的局限。
- **2024-09 · Anthropic 发布 Contextual Retrieval**：嵌入前给每个 chunk 注入文档级上下文，配 contextual BM25 与重排，检索失败率最多降 49%（加 rerank 达 67%）。是"修好 RAG"对"RAG 已死"的务实回击。
- **2024-11 · LazyGraphRAG**（Microsoft）把 LLM 用量从索引期推迟到查询期，索引成本降到向量 RAG 水平（GraphRAG 的 ~0.1%），全局查询便宜 700+ 倍——对 GraphRAG 成本批评的官方自答。
- **2025-01/02 · Agentic RAG 主流化**。综述（Singh 等）把反思/规划/工具调用/multi-agent 协作系统化；OpenAI Deep Research 把"plan→迭代搜索→反思→带引用综合"做成产品。
- **2025-05 · Claude Code 公开"用 agentic search 而非向量 RAG"**（Boris Cherny, Latent Space 播客）。头部编码 agent 放弃预建索引，引爆全行业讨论。
- **2025-09 · Anthropic《Effective context engineering》**提出 just-in-time 检索，取代"预处理塞满"。
- **2025-10 · Cognition SWE-grep**：用 RL 训练多轮高并行 agentic 检索小模型，Cerebras 部署 2800+ TPS，把"模型即检索器"推到极致；同月 Bustamante《The RAG Obituary》登顶 HN。
- **2025-11 → 2026-01 · Cursor 连发两文**：《Improving the agent with semantic search》（自训代码嵌入，A/B 证明语义+grep 混合最优）与《Securely indexing large codebases》（Merkle 增量同步、simhash 跨用户复用、只存 embedding 的安全工程）。*为什么*：与 Claude Code 形成"代码检索该不该上向量"的正面对撞。
- **2026 H1 · 长上下文成旗舰标配、agentic RAG 转向方法工程化**：百万 token 上下文已是主流旗舰（如 Claude Fable 5 与 Opus 4.8、DeepSeek-V4，均 1M ctx）的默认能力，"RAG 已死"之争彻底沉淀为"按场景路由"的工程共识；研究重心也从"是否检索/多轮路由"转向"如何把多轮检索做大做稳"——把检索做成可扩展的分层接口、用 RL 训练多轮检索策略（见 §7 SWE-grep）都是这条线上的代表方向。*为什么*：当窗口与路由都不再是瓶颈，竞争点回到检索策略本身的可扩展性与成本。

---

## 4. 核心概念与原理（讲透机制）

### 4.1 召回底座：稀疏 vs 稠密 vs late interaction

- **稀疏（BM25）**：基于词项统计的精确匹配，可用倒排索引、零训练、对罕见词/编号/专名极稳，但吃不下同义改写。
- **稠密单向量（DPR/Contriever）**：query 与 passage 各编码成一个向量，靠 ANN（如 FAISS/HNSW）做近邻检索。语义匹配强、工程简单，但单向量 pooling 会丢 token 级信号，域外泛化偏弱（BEIR 实证）。
- **late interaction 多向量（ColBERT）**：query/doc 各保留**每个 token 的向量**，检索时做 MaxSim 细粒度比对，效果近交叉编码器、速度近双编码器，代价是存储更大（ColBERTv2 用残差压缩缓解）。

```text
相似度度量直觉：
  BM25     : score = Σ_term  idf(t) · tf 饱和项            # 词项重叠
  DPR      : score = q_vec · d_vec                          # 单向量点积
  ColBERT  : score = Σ_{q_i} max_{d_j} (q_i · d_j)          # token 级 MaxSim
```

**嵌入模型怎么选**：稠密召回的天花板高度取决于嵌入模型，业界以 **MTEB**（Massive Text Embedding Benchmark，Muennighoff 等 2022，arXiv 2210.07316；覆盖 8 类任务 / 58 数据集 / 112 语言并附公开排行榜）作为嵌入选型与横评的事实标准。但要警惕榜单过拟合：MTEB 总分高未必等于你的领域 / 语言 / 检索任务上更好，**落地仍须在自己语料上离线复测、再以线上 A/B 定夺**（见 §8 常见坑①）。

### 4.2 两阶段检索：广召回 → 精排（rerank）

工业 RAG 的标准骨架是 **two-stage**：

```text
stage-1 召回（要"全"）：
  cands = dedup( dense_topN(query) ∪ bm25_topN(query) )     # hybrid，N≈50~200
stage-2 精排（要"准"）：
  scored = cross_encoder(query, cand) for cand in cands     # 联合编码 query+doc
  context = top_k(scored)                                    # k≈3~10，喂给 LLM
```

第一阶段双编码器**独立**编码、可预存，所以快但糙；第二阶段交叉编码器（或 ColBERTv2 late-interaction、RankGPT LLM 重排）**联合**编码 query–doc 对，准但贵。把它放在召回之后只对少量候选打分，是"性价比最高的 RAG 增益点之一"（Pinecone / HF Cookbook）。这也呼应 Lost in the Middle：与其把一堆候选全塞上下文让中段被忽略，不如精排出最相关的少数几条放在边缘位置。

### 4.3 分块与检索粒度（隐藏瓶颈）

切块策略直接决定召回质量上限：

- **固定大小切块**：实现简单（512 token 是常见起点），但会在句中/语义边界切断。
- **命题级（Dense X）**：以"命题"为原子单元，检索与下游 QA 均优于段落级——细粒度更精准。
- **小-to-大 / sentence-window 解耦**：用简洁摘要或单句做**召回**，合成时再扩展回**大块**做生成，兼顾召回精度与上下文完整。
- **注入文档上下文（Contextual Retrieval）**：嵌入前给每个 chunk 拼一段 LLM 生成的 50–100 token 文档级说明，解决"孤立 chunk 丢语境"。
- **层级摘要树（RAPTOR）**：递归聚类+摘要自底向上建多层抽象树，检索时按需取不同抽象层级，适合"答案跨整篇文档"的全局/多跳问题。

### 4.4 自适应 / agentic 检索：从"总是 top-k"到"按需多轮"

固定 top-k 既浪费又会注入噪声。进化路径：

1. **按需检索**：FLARE 用下一句 token 置信度触发检索；Self-RAG 用反思 token 决定是否检索并自评证据相关性/支持度。
2. **检索-推理交错**：IRCoT 用 CoT 当查询、用检索结果改进 CoT，攻多跳。
3. **纠错兜底**：CRAG 用轻量评估器判定检索质量，差则触发分解-重组或 Web 搜索兜底。
4. **agentic 循环**：把检索当 tool，agent 规划→分解 query→迭代搜索→反思证据→综合（Deep Research / Search-o1）。这条线与 [[01]] ReAct、[[08]] 多智能体编排直接相连。

### 4.5 结构化 RAG：图与树

向量 RAG 只取局部片段，回答不了"这个语料的主要主题是什么"这类**全局 sensemaking**。GraphRAG 用 LLM 抽实体知识图、预生成社区摘要，把检索从"查找"升级为"结构化综合"；HippoRAG 借海马体索引理论用知识图+PageRank 做单步多跳。代价是索引期重度调用 LLM，成本高、难增量。

### 4.6 多模态 / 视觉文档检索：ColPali 与 ViDoRe

真实企业语料大量是 **PDF / 扫描件 / 幻灯片 / 财报 / 产品手册**这类"富视觉文档"。传统文本 RAG 要先走 **OCR → 版面解析 → 切块**的脆弱管线，每一步都在丢信息——表格结构、图表、排版语义、阅读顺序往往在解析阶段就损毁，是富文档检索的隐藏失败源。

**ColPali**（arXiv 2407.01449，2024）换了一条路：**直接用视觉语言模型（VLM）把整页文档图像编码成多向量**，再沿用 4.1 里的 ColBERT 式 **late-interaction（MaxSim）** 做 query 与"页面"之间的细粒度比对——**完全跳过 OCR/版面解析**，把"看懂版面与图表"交给 VLM 本身。它同时提出 **ViDoRe（Visual Document Retrieval）** 基准来评测这类视觉文档检索。

要点与定位：

- **机制是 4.1 late-interaction 的多模态推广**：把"token 级多向量 + MaxSim"从纯文本推广到"页面图像即文档"，因此存储成本同样偏高（多向量），但召回能直接吃下版面与图表语义。
- **省掉解析管线**：对图文混排、表格密集的文档，免去 OCR/解析的级联误差，是文本切块策略救不回来的那部分召回。
- **可作为 agentic RAG 的一种检索手段**：在 §2 的"检索手段菜单"里，视觉检索与向量 / BM25 / grep / 图检索并列，由 agent 按文档形态择优调用——富视觉语料优先视觉检索，纯文本语料仍走 hybrid。

---

## 5. 主流方法谱系（横向对比）

> 下面两张表把 §2 的"检索手段菜单"横向展开；落到具体技术栈的选型对照见 [[14]]。

### 5.1 召回/排序方法 × 维度

| 方法 | 表示/索引 | 精确匹配 | 语义匹配 | 存储成本 | 域外泛化 | 典型定位 |
|---|---|---|---|---|---|---|
| BM25（稀疏） | 倒排索引 | 强 | 弱 | 低 | 强（强基线） | hybrid 的稀疏一极、专名/编号 |
| SPLADE（学习稀疏） | 倒排索引 | 强 | 中 | 中 | 较强 | 兼词项扩展的稀疏检索 |
| DPR（稠密单向量） | ANN 向量库 | 弱 | 强 | 中 | 偏弱 | 工业默认召回 |
| ColBERT/v2（多向量） | token 级向量 | 中 | 强 | 高（v2 压缩） | 强 | 高精度召回/重排 |
| ColPali（视觉多向量） | 页面图像→多向量 | —（视觉 late-interaction） | 强（含版面/图表语义） | 高（多向量） | — | 富文档/PDF/扫描件，免 OCR |
| Cross-encoder rerank | 不预存，在线打分 | — | 最强（联合编码） | — | 强 | 第二阶段精排 |
| Hybrid（稠密+BM25+rerank） | 混合 | 强 | 强 | 中高 | 强 | **生产默认** |
| GraphRAG | 实体图+社区摘要 | — | 全局综合 | 索引很贵 | — | 全局/多跳 sensemaking |
| Agentic grep | 无预建索引 | 强（正则） | 弱（靠 LLM 规划补） | 零索引 | 不会过期 | 结构化代码库 |

### 5.2 RAG 范式演进（Gao 等综述视角）

| 范式 | 检索时机 | 代表技术 | 适用 |
|---|---|---|---|
| Naive RAG | 一次、固定 top-k | 切块+向量召回+拼接 | 简单 FAQ/单跳 |
| Advanced RAG | 一次，但前后处理强化 | 查询改写(HyDE)、hybrid、rerank、chunk 优化 | 多数生产场景 |
| Modular / Agentic RAG | 按需、多轮、推理驱动 | Self-RAG、FLARE、CRAG、Deep Research | 多跳/调研/复杂任务 |

---

## 6. 主流观点与争议（≥2 组对立面）

**争议一：长上下文会取代 RAG 吗？**
- *长上下文派*：百万 token 窗口（Google DeepMind 的 Gemini 1.5 Pro 团队，2024-02）+ context caching/CAG，主张直接把整个语料喂进去，免掉切块/嵌入/索引这些脆弱环节；Bustamante《The RAG Obituary》（2025）把向量 RAG 称为"小上下文时代的拐杖"。
- *RAG 派*：LlamaIndex（Jerry Liu）、向量库厂商、Chia Jeng Yang 等指出长上下文被不均匀使用（Lost in the Middle），现实多事实召回会掉到 ~60%，一次百万 token 请求比检索几千 token 慢约 30–60 倍、贵 1000+ 倍；RAG 还在**时效性/超窗语料/可归因/权限控制**上不可替代。
- *已收敛*：Google DeepMind 自己的 Self-Route 研究（Li 等, 2024, arXiv 2407.16833）发现 LC 与 RAG 在多数查询上结论一致——**资源足时长上下文质量略优、但 RAG 成本低得多**，故**把简单查询路由给 RAG、难的给长上下文**，是"都要、按需路由"的实证答案。

> 📦 **结案框 · 长上下文 vs RAG** ｜ **提出（2024）**：Gemini 1.5 Pro 百万 token + CAG 引爆"RAG 已死"，主张整库直喂、免掉切块/嵌入/索引。
> **2026 定论**：不取代、**按需路由**——Self-Route（Google DeepMind, arXiv 2407.16833）证 LC 与 RAG 在多数查询上结论一致，资源足时长上下文质量略优、RAG 成本低得多；按难度路由（简单给 RAG、难的给长上下文）**降本 ~65%（Gemini-1.5-Pro）/ ~39%（GPT-4o）**。
> **现状**：百万 token 成旗舰标配（与 [[03]] 同口径），"RAG 已死"之争沉淀为"按场景路由"工程共识——小语料直喂、文档/企业库走向量 RAG、结构化代码走 agentic（见争议四结案框）。

**争议二：稠密足够，还是必须 hybrid + rerank？**
- *纯稠密派*（DPR/Contriever 路线，FAIR）：统一向量空间、语义强、工程简单。
- *混合派*（BEIR/SPLADE/ColBERT 路线，Khattab/Zaharia 等）：单向量丢 token 级信号，BM25 在精确词/罕见实体/代码上仍胜，late interaction 找回精度——务实赢家是 hybrid。
- *收敛信号*：Anthropic 的 Contextual Retrieval 明确组合 contextual embeddings + contextual BM25 + reranking，等于官方为"hybrid 是生产默认"背书。

**争议三：GraphRAG 值不值得做？**
- *图派*（Microsoft Research, Darren Edge/Jonathan Larson）：图+社区摘要对全局/多跳/查询聚焦类问答带来综合性与多样性提升，适合法律/金融/生物医学/企业 wiki 等需要跨文档综合、重溯源的复杂语料。
- *务实派*（实践者 + Microsoft 自己的 LazyGraphRAG）：前期图索引昂贵（有大语料 ~$33k 的报告）、对动态语料难维护，多数 FAQ/单事实查询用向量 RAG+rerank 就够；LazyGraphRAG/LightRAG 用 ~0.1% 索引成本逼近大部分质量。决策规则：**只有高查询量+稳定语料+调研型场景**才值回 GraphRAG 的票。

**争议四：代码检索——向量嵌入 vs agentic grep？**
- *agentic 派*（Cognition/Anthropic）：代码高度结构化，grep/glob+读文件更准、免维护、不会过期，没有索引外泄风险；SWE-grep 用 RL+并行把延迟压下来。
- *混合派*（Cursor）：线上 A/B 显示大库里语义检索仍有显著增量（问答准确率 +12.5%、大库代码保留 +2.6%），纯 grep 会漏掉自然语言意图——**语义+grep 混合最优**，而非二选一。

> 📦 **结案框 · 代码检索：向量嵌入 vs agentic grep** ｜ **提出（2025）**：Claude Code 公开放弃向量 RAG、改用 agentic search（grep/glob+读文件），《The RAG Obituary》同期助推。
> **2026 定论**：**代码场景 agentic/grep 检索成默认**——代码高度结构化、grep 不会过期、无索引外泄风险；Cursor 线上 A/B 表明大库语义检索仍有增量，故**向量索引降为"按需回退"**（补大库语义召回与自然语言意图），而非默认主力。
> **现状**：头部编码 agent 以 agentic grep 为默认检索路径、向量库按需回退做混合；与 [[14]]「代码助手走 agentic grep + 语义混合、向量库按需」、[[03]] just-in-time 检索同口径。

---

## 7. 大厂工程实践（≥2 个真实案例 + 取舍拆解）

**案例 A · Anthropic Contextual Retrieval（"修好 RAG"派，2024-09-19）**
做法：对每个 chunk 先用 LLM 生成 50–100 token 的文档级上下文再嵌入，并行维护 contextual embeddings 与 contextual BM25，最后接重排。效果（top-20 检索失败率逐级下降）：基线 **5.7% → 3.7%（仅 contextual embeddings，-35%）→ 2.9%（叠加 contextual BM25，-49%）→ 1.9%（再叠加 reranking，-67%）**。关键工程取舍：逐 chunk 调 LLM 本会很贵，靠 **prompt caching** 把一次性 contextualize 成本压到约 $1.02/百万 doc tokens。经验法则：知识库 <200K tokens 直接长上下文，超过才上 RAG。

**案例 B · Cursor 远程向量索引 + 自训代码嵌入 + Merkle 同步（"自建可控"派）**
做法：服务端 Turbopuffer 向量库 + 自训代码嵌入（训练信号来自 agent 真实会话轨迹，再让 LLM 回溯"每步最该被检索到什么"做排序标签），与 grep 做 hybrid。工程取舍：为隐私**只存 embedding 不存明文、混淆路径**；用 **Merkle 树**做文件/目录级增量同步（只重算改动文件及其父路径）；用 **simhash** 匹配相似代码库、跨团队成员复用索引（同库克隆平均 92% 相似），据 Cursor 博客把首查 P99 从 4.03 小时压到 21 秒；用 content proof 做权限过滤（客户端拿不到自己没有的代码）。它保留向量检索的语义召回，用安全+缓存工程抵消其成本/延迟/隐私劣势。

**案例 C · Cognition SWE-grep：模型即检索器（"放弃向量库"派）**
做法：不建向量库，用 RL 训练专用小模型做多轮高并行 agentic 检索——每轮最多 8 个并行工具调用（grep/glob/读文件）、限定 ≤4 轮，交 Cerebras 以 2800+ TPS（mini，约 20x Haiku 4.5）服务。论点：向量检索快但复杂查询不准且污染上下文，纯 agentic 灵活但 10–20 轮太慢，SWE-grep 用"少轮×高并行×高吞吐硬件"两者兼顾，落地为 Windsurf 的 Fast Context subagent。

**案例 D · GraphRAG → LazyGraphRAG（索引期 vs 查询期的成本再平衡）**
原 GraphRAG 在索引期重度用 LLM 抽实体/写社区摘要，适合全局问答但前期成本高、难增量；LazyGraphRAG 把 LLM 全部推迟到查询期（索引只用轻量 NLP），索引成本 = 向量 RAG、全局查询成本比 GraphRAG Global Search 低 700+ 倍且同等质量。取舍本质是在"索引贵/查询快"与"索引便宜/查询贵"之间，默认偏向延迟决策（lazy）。

> 托管 vs 自建的分界也很清楚：**OpenAI File Search / Vertex AI RAG Engine** 把 parse/chunk/embed/查询改写/hybrid/rerank 全打包，省运维、上手快，代价是黑盒、底层不可调；而 Cursor/Cognition 选择自建，正是为了拿到自训嵌入、安全索引、缓存这些**关键收益**。详见 [[13]] 大厂案例研究。

---

## 8. 我的分析与判断

> **以下为分析观点（非事实陈述），是我对证据的独立研判，可能与主流不同。**

**趋势研判**。第一，"RAG vs 长上下文 vs agentic search"不会有赢家通吃，最终形态是**按语料形态分治的路由器**：结构化、强引用、频繁变更（代码、表格、合规库）→ agentic/grep 或 hybrid；非结构化、需跨文档综合的中型语料 → 向量 RAG + rerank（必要时上图）；小到能整体进窗口的 → 直接长上下文。判定的真正自变量不是"模型多强"，而是**语料的结构度、更新频率、对溯源的要求、查询量**这四维。第二，**检索器本身正在被"模型化"**：从手工 BM25/向量，到 Contextual Retrieval 用 LLM 改写 chunk，再到 SWE-grep 用 RL 把整个检索策略训进一个小模型（**记忆/检索策略可被 RL 训练，把静态 RAG 升级为可训练策略，详见 [[16]] 训练**）——"检索"与"推理"的边界正在消融，未来的检索器更像一个会规划的小 agent，而非一张静态索引表。第三，**索引经济学（index economics）会成为选型的第一性约束**：LazyGraphRAG、prompt caching、simhash 复用都在说同一件事——谁能把"重预处理"推迟、摊薄或复用，谁就能在质量不降的前提下赢成本，这比再刷一个点的 recall@k 更决定能否上生产。

**常见坑**（按踩雷频率排序）。① **只看离线 recall@k 不做线上 A/B**——Cursor 的关键收益恰恰是 A/B 测出来的，离线指标常和真实满意度脱节。② **分块拍脑袋**：默认 512 token 只是起点，丢语境的 chunk 会让再好的嵌入也救不回来。③ **跳过 rerank**：这是投入产出比最高的一步，却最常被省。④ **检索失败无兜底**：检索召回是生成质量的天花板，没有 CRAG 式的质量评估与 fallback，模型会在烂证据上一本正经地幻觉。⑤ **知识冲突无策略**：参数化知识与检索知识打架时该信谁，多数系统没有显式处理。⑥ **agentic 检索不设预算**：多轮搜索容易跑飞，必须设轮数/并发/超时上限（SWE-grep 的 ≤4 轮就是硬约束）。

**最佳实践（我的默认配方）**：(1) 先量语料——<200K tokens 别上 RAG，直接长上下文。(2) 起步就用 **hybrid（BM25+稠密）+ cross-encoder rerank**，别幻想纯稠密。(3) chunk 上做 **Contextual Retrieval** 或小-to-大解耦，这是低成本高回报。(4) 用 **RAGAS/ARES** 沿上下文相关性/忠实度/答案相关性建离线基线，但**上线决策以 A/B 为准**。(5) 多跳/调研任务再上 agentic，且**先把单次检索质量打磨好**——agentic 不能掩盖召回烂。(6) 把"索引成本/新鲜度/权限"当一等公民，而不是事后补丁。

---

## 9. 面试考点

**概念题**
1. **RAG 为什么能减少幻觉、且比微调更适合更新知识？** 答题要点：非参数化记忆可热插拔（换索引即更新，无需重训）、生成被 grounding 到检索证据、可带 citation 溯源；微调把知识压进权重，更新贵且不透明。
2. **稠密、稀疏、late interaction 三类检索的本质差异与各自短板？** 要点：BM25 词项精确匹配（弱语义）、DPR 单向量语义（丢 token 级信号、域外弱、BEIR 证据）、ColBERT token 级 MaxSim（精度高但存储大）；所以生产用 hybrid。
3. **两阶段检索里 reranker 为什么用 cross-encoder 而不是 bi-encoder？** 要点：bi-encoder 独立编码可预存但糙，cross-encoder 联合编码 query–doc 对、能建模细粒度交互、更准，只对少量候选打分所以延迟可控。
4. **Contextual Retrieval 解决什么问题、为什么便宜？** 要点：补"孤立 chunk 丢文档语境"，嵌入前注入 LLM 生成的 chunk 上下文；靠 prompt caching 把逐 chunk 调用摊薄到约 $1/百万 tokens，失败率最多 -67%（含 rerank）。

**系统设计题**
- **为一个百万文档的企业知识库设计带引用的问答系统。** 要点：数据摄入（parse→chunk 策略→Contextual/小-to-大）；hybrid 索引（向量库 + 倒排）；查询侧（改写/HyDE、必要时 query 分解）；两阶段召回+rerank；生成时强制 citation；评估（离线 RAGAS + 线上 A/B + 检索失败率监控）；新鲜度（增量索引/Merkle）、权限（content-proof/多租户隔离）、成本（缓存、score_threshold 截断）。给出"何时改用长上下文 / 何时上 GraphRAG"的路由判据。

**手写题**
- **写出自适应 RAG 的检索循环伪代码（含按需检索 + 兜底 + 终止）。**
```python
def adaptive_rag(query, max_rounds=4):
    ctx, answer = [], None
    for r in range(max_rounds):
        if r == 0 or low_confidence(answer):           # FLARE/Self-RAG 式触发
            cands = dedup(dense_topN(query) + bm25_topN(query))   # hybrid 召回
            docs  = rerank(query, cands)[:k]            # cross-encoder 精排
            if retrieval_quality(query, docs) < tau:    # CRAG 式评估
                docs += web_search_fallback(query)      # 兜底
            ctx += docs
        answer = generate(query, ctx)                   # 带 citation
        if is_grounded_and_complete(answer, ctx):       # 终止判定
            break
    return answer, citations(ctx)
```

**陷阱题**
1. **"上下文窗口够大就不需要 RAG 了，对吗？"** 反驳点：Lost in the Middle 的位置偏置、成本/延迟随长度暴涨（~1000x）、超窗语料、时效性、可归因、权限——Self-Route 证明最优是路由而非取代。
2. **"向量检索一定比关键词检索好？"** 反驳点：BEIR 显示 BM25 是难打的强基线，稠密域外泛化弱；精确词/罕见专名/代码符号上 BM25 常胜，所以要 hybrid。
3. **（加问）"GraphRAG 质量高就该默认用？"** 反驳点：索引期 LLM 成本极高、动态语料难维护，LazyGraphRAG 用 0.1% 成本逼近——只有高查询量+稳定语料+调研型场景才值。

---

## 10. 参考文献

### 📄 论文
- Guu et al. — **REALM: Retrieval-Augmented Language Model Pre-Training** (2020) · https://arxiv.org/abs/2002.08909 · 首个端到端预训练神经知识检索器，为开放域 QA 带来 4–16% 绝对提升。
- Karpukhin et al. — **Dense Passage Retrieval (DPR)** (2020, EMNLP) · https://arxiv.org/abs/2004.04906 · 双编码器稠密检索 top-20 比 BM25 高 9–19%，奠定向量召回工程基础。
- Lewis et al. — **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks** (2020, NeurIPS) · https://arxiv.org/abs/2005.11401 · 正式提出 RAG，统一参数化与非参数化记忆，是整个领域原点。
- Khattab & Zaharia — **ColBERT: Late Interaction over BERT** (2020, SIGIR) · https://arxiv.org/abs/2004.12832 · 提出 token 级多向量 late interaction，精度近交叉编码器而快两个数量级。
- Thakur et al. — **BEIR: Heterogeneous Benchmark for Zero-shot IR** (2021) · https://arxiv.org/abs/2104.08663 · 18 数据集零样本基准，揭示 BM25 强基线、稠密域外泛化不足。
- Muennighoff et al. — **MTEB: Massive Text Embedding Benchmark** (2022, EACL'23) · https://arxiv.org/abs/2210.07316 · 8 类任务/58 数据集/112 语言的嵌入横评基准+公开排行榜，嵌入选型的事实标准。
- Formal et al. — **SPLADE: Sparse Lexical and Expansion Model** (2021) · https://arxiv.org/abs/2107.05720 · 学习可用倒排索引的稀疏表示，混合检索的稀疏一极。
- Santhanam et al. — **ColBERTv2** (2021/2022, NAACL) · https://arxiv.org/abs/2112.01488 · 残差压缩+去噪监督把 late interaction 存储降 6–10 倍，落地可行。
- ColPali — **用视觉语言模型直接检索文档页面图像（多向量 late-interaction + ViDoRe 基准）** (2024) · https://arxiv.org/abs/2407.01449 · 跳过 OCR/版面解析，VLM 把整页编码成多向量做 MaxSim，富视觉文档检索新主力。
- Izacard et al. — **Contriever: Unsupervised Dense IR with Contrastive Learning** (2021) · https://arxiv.org/abs/2112.09118 · 无监督对比学习稠密检索，BEIR 上多数据集超 BM25。
- Izacard et al. — **Atlas: Few-shot Retrieval-Augmented LM** (2022) · https://arxiv.org/abs/2208.03299 · 64 例即在 NQ 达 42%+，以 50x 更少参数超 540B 模型。
- Gao et al. — **HyDE: Precise Zero-Shot Dense Retrieval** (2022) · https://arxiv.org/abs/2212.10496 · LLM 先生成假设文档再检索，无需相关性标注即超 Contriever。
- Trivedi et al. — **IRCoT: Interleaving Retrieval with CoT** (2023) · https://arxiv.org/abs/2212.10509 · 检索与思维链逐句交错，多跳 QA 检索提升达 21 点。
- Jiang et al. — **FLARE: Active Retrieval Augmented Generation** (2023, EMNLP) · https://arxiv.org/abs/2305.06983 · 下一句置信度低才触发检索的前瞻式主动检索。
- Asai et al. — **Self-RAG** (2023) · https://arxiv.org/abs/2310.11511 · 反思 token 决定何时检索并自评证据，7B/13B 多任务超 ChatGPT。
- Sun et al. — **RankGPT: LLM as Re-Ranking Agents** (2023, EMNLP 杰出论文) · https://arxiv.org/abs/2304.09542 · 排列生成提示让 LLM 零样本重排，媲美有监督重排器。
- Liu, Lin, Hewitt, ... Liang — **Lost in the Middle** (2023, TACL) · https://arxiv.org/abs/2307.03172 · U 形位置偏置，长上下文中段信息被忽略的关键实证。
- Chen et al. — **Dense X Retrieval: What Granularity?** (2023) · https://arxiv.org/abs/2312.06648 · 以"命题"为原子检索单元，细粒度优于段落级。
- Gao et al. — **Retrieval-Augmented Generation for LLMs: A Survey** (2023) · https://arxiv.org/abs/2312.10997 · Naive/Advanced/Modular 三范式，本节核心地图。
- Es et al. — **RAGAS: Automated Evaluation of RAG** (2023) · https://arxiv.org/abs/2309.15217 · 无参考评估套件，三维度自动打分。
- Saad-Falcon et al. — **ARES: Automated Evaluation Framework for RAG** (2023) · https://arxiv.org/abs/2311.09476 · 合成数据微调轻量评审 + PPI，少量标注即可评估。
- Sarthi et al. — **RAPTOR: Recursive Tree-Organized Retrieval** (2024, ICLR) · https://arxiv.org/abs/2401.18059 · 递归聚类摘要建多层抽象树，攻多跳/全局问题。
- Edge et al. — **From Local to Global: A GraphRAG Approach** (2024, MSR) · https://arxiv.org/abs/2404.16130 · 实体图+社区摘要做全局 sensemaking。
- Gutiérrez et al. — **HippoRAG** (2024) · https://arxiv.org/abs/2405.14831 · 知识图+Personalized PageRank 做长期记忆与单步多跳。
- Yan et al. — **Corrective RAG (CRAG)** (2024) · https://arxiv.org/abs/2401.15884 · 轻量评估器判定检索质量并触发纠错/Web 兜底。
- Barnett et al. — **Seven Failure Points When Engineering a RAG System** (2024) · https://arxiv.org/abs/2401.05856 · 三案例归纳 7 类 RAG 失败点，工程避坑清单。
- Li et al. — **RAG or Long-Context LLMs? A Comprehensive Study (Self-Route)** (2024, Google DeepMind) · https://arxiv.org/pdf/2407.16833 · LC 与 RAG 多数查询结论一致，提出按难度路由。
- Singh et al. — **Agentic Retrieval-Augmented Generation: A Survey on Agentic RAG** (2025) · https://arxiv.org/abs/2501.09136 · 反思/规划/工具调用/multi-agent 的 agentic RAG 分类学；本节"终态主线"的系统化综述。

### ✍️ 博客与工程文（优先一手）
- Anthropic — **Introducing Contextual Retrieval** (2024) · https://www.anthropic.com/news/contextual-retrieval · 注入 chunk 上下文+contextual BM25+rerank，失败率最多 -67%。
- Anthropic — **Effective context engineering for AI agents** (2025) · https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents · just-in-time 检索：只存轻量标识、运行时按需加载。
- Cursor — **Improving the agent with semantic search** (2025) · https://cursor.com/blog/semsearch · 自训代码嵌入，A/B 证明语义+grep 混合最优（问答 +12.5%）。
- Cursor — **Securely indexing large codebases** (2026) · https://cursor.com/blog/secure-codebase-indexing · Merkle 增量同步、simhash 复用、只存 embedding，首查 P99 4h→21s。
- Cognition — **Introducing SWE-grep and SWE-grep-mini: RL for Multi-Turn Fast Context Retrieval** (2025) · https://cognition.ai/blog/swe-grep · RL 训练多轮高并行检索小模型，Cerebras 2800+ TPS。
- Microsoft Research — **LazyGraphRAG sets a new standard for quality and cost** (2024) · https://www.microsoft.com/en-us/research/blog/lazygraphrag-setting-a-new-standard-for-quality-and-cost/ · LLM 推迟到查询期，索引成本=向量 RAG、全局查询便宜 700+ 倍。
- Pinecone — **Rerankers and Two-Stage Retrieval** (2024) · https://www.pinecone.io/learn/series/rag/rerankers/ · 标准两阶段检索，rerank 是性价比最高的增益点。
- Hugging Face — **Advanced RAG on HF docs using LangChain** (2024) · https://huggingface.co/learn/cookbook/advanced_rag · 多召回再 cross-encoder(ColBERTv2) rerank 留 top_k 的实战配方。
- LlamaIndex — **A Cheat Sheet and Recipes for Building Advanced RAG** (2024) · https://www.llamaindex.ai/blog/a-cheat-sheet-and-some-recipes-for-building-advanced-rag-803a9d94c41b · pre/retrieval/post 三层优化、解耦检索块与合成块。
- Nicolas Bustamante — **The RAG Obituary: Killed by Agents, Buried by Context Windows** (2025) · https://www.nicolasbustamante.com/p/the-rag-obituary-killed-by-agents · "RAG 已死"论的代表作（争议方）。
- Simon Willison — **Introducing Contextual Retrieval (annotated)** (2024) · https://simonwillison.net/2024/Sep/20/introducing-contextual-retrieval/ · 第三方解读：本质是工程务实而非新模型，hybrid 仍赢。

### 📚 官方文档
- OpenAI — **Retrieval / File Search (Vector Stores)** (2025) · https://platform.openai.com/docs/guides/retrieval · 托管 RAG：自动 chunk/embed、查询改写、并行多检索、hybrid、rerank、可调 score_threshold。
- Google Cloud — **Expanding grounding capabilities (RAG and grounding) on Vertex AI** (2024) · https://cloud.google.com/blog/products/ai-machine-learning/rag-and-grounding-on-vertex-ai · 托管 Vertex AI Search 与组件级 Embedding/Ranking/Grounding（check-grounding）API 双轨。

### 🎥 Talk / 播客
- Latent Space — **Claude Code: Anthropic's Agent in Your Terminal**（Boris Cherny & Catherine Wu, 2025-05）· https://www.latent.space/p/claude-code · 头部编码 agent 公开放弃向量 RAG、改用 agentic search 的一手陈述。
