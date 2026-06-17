> 状态：🟢 已校验

# 09 · 评估（Evaluation）

> **定位**：回答"这个 Agent 到底行不行、稳不稳、有没有变好"的工程学科——把模糊的"感觉它更聪明了"翻译成**可复现、可对比、抗污染**的数字。它是 Agent 迭代的指南针，也是最容易被自欺的环节。
> **在链路中的位置**：评估是 [[01]] 推理范式、[[02]] Harness、[[03]] 上下文、[[04]] 工具、[[08]] multi-agent 所有改动的**裁判**；它依赖 [[10]] 可观测性提供轨迹（transcript），并最终决定 [[11]] 生产工程里"哪个版本能上线"。

---

## 1. TL;DR / 速览

**本节地图**：动机（§2）→ 历史脉络（§3）→ 核心原理（§4）→ 方法谱系（§5）→ 争议（§6）→ 大厂实践（§7）→ 我的判断（§8）→ 面试（§9）→ 文献（§10）。

**核心结论（先看这 5 条）**：

1. **Agent 评估难，难在它不是"一道题对不对"，而是"一条多步轨迹好不好"**。环境交互引入**非确定性**（同一任务重试结果不同），真实任务**多无唯一正解**，字符串匹配彻底失效——必须改用**执行级/状态级判分**（SWE-bench 跑单测、τ-bench 比数据库终态）或 **LLM/Agent 裁判**。
2. **评估分三层**：端到端/结果级（最客观、可复现）、轨迹/过程级（诊断 reward hacking[[12]] 与工具误用）、组件级（单独测规划[[05]]/检索[[07]]/记忆[[06]]）。生产实践里 Anthropic 的主张是"**判结果不判路径**"——别因为模型走了创造性的路就扣分。
3. **三类 grader 各有取舍**：code（快/脆）、model/LLM-as-judge（灵活/非确定/贵）、human（金标准/慢）。LLM 裁判与人类一致率可 >80%，但带**位置、冗长、自偏好**等系统性偏差，**判官本身必须被评估和校准**。
4. **单次成功率会骗人**。`pass@1` 量"能力上限"，`pass^k` 量"可靠性下限"——τ-bench（2024 原论文数据）上当时 SOTA Agent 单次 <50%、`pass^8`（零售域）<25%，重试一致性的崩塌只有 `pass^k` 能照出来。
5. **每个静态基准都有保质期**。生命周期是：**修有效性（SWE-bench→Verified）→ 饱和+污染 → 退役 → 抗污染继任者（SWE-bench Pro）**。2026 年 OpenAI 亲手退役自己造的 Verified（~60% 失败题测试本身就坏、全部前沿模型有污染），是这条铁律最权威的注脚。评估不是"建一次"，而是要排进**退役与污染审计的维护路线图**。

---

## 2. 定位与动机

**它解决什么问题？** 你改了 system prompt、换了模型、加了一个工具——Agent 是变好了还是变差了？人眼看几个 demo 给出的"感觉对了"既不可复现也不可对比，更扛不住"在 200 个真实任务上平均成功率"这种问题。评估就是把"感觉"工程化成**可量化、可回归、可横向对比**的信号。没有它，Agent 开发就是在黑暗里调参；有了它（但用错了），你会信心满满地把一个**过拟合基准、对真实用户更差**的版本推上线。

**为什么 Agent 评估比评估 LLM 更难？** 三个结构性变化：

- **对象是轨迹而非单轮输出**。一次 LLM 调用 `output = f(prompt)` 好评——比对参考答案即可。但 Agent 是 `Think→Act→Observe` 几十步的序列，中间任何一步选错工具、读错文件都可能翻车，而最终结果可能**碰巧蒙对**（掩盖过程错误）或**过程全对但终态差一点**（被一刀切判失败）。
- **环境引入非确定性**。同一任务跑两次，因为采样温度、工具返回时序、网页改版，结果可能不同。"成功率"本身是个**随机变量**，必须用多次重试 + 区间估计来谈，而不是单次跑分。
- **多数真实任务没有唯一正解**。"帮我重构这个模块"有无数种正确写法，"写一封得体的退订邮件"没有 ground-truth 字符串。于是判分要么落到**可执行/可验证的代理目标**（单测通过、数据库终态正确），要么交给 **LLM/人类裁判**——而裁判自己又会引入偏差。

**在 Agent 链路中的位置**：评估横跨整条链路。它给 [[01]][[02]][[03]][[04]][[08]] 的每一次改动当裁判；它消费 [[10]] 可观测性吐出的 trace（"读 transcript"是 Anthropic 反复强调的铁律——你不能信任一个你没审过的 grader）；它的产出（offline 跑分 + online A/B）直接决定 [[11]] 生产工程里的发布门禁；同一套可执行/状态级判分还反向充当 [[16]] 训练侧（agentic RL）的**奖励信号**——评估与训练在"可验证 reward"上首尾相扣，一个坏 grader 会同时毒化评估结论与训练目标。可以说，前面所有章节都在"造能力"，本节是唯一回答"造出来的能力到底值不值得信"的环节。

---

## 3. 历史发展脉络

> 主线逻辑：模型把廉价静态基准刷饱和 + 被当 Agent 部署，逼着评估持续走向 **(a) 可执行/可验证 ground truth、(b) 真实与交互性、(c) 从单次准确率转向可靠性与时间跨度**，同时与**污染**和**评分有效性**死磕。

| 年份 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **2020** | **MMLU**（Hendrycks et al.） | 早期各做各的小数据集，无法横向比模型。MMLU 用 57 学科一个可自动评分的**单一分数**把所有模型拉到同一标尺，开启"静态多选 + 单数排名"时代——这是后续一切的起点，也是日后"饱和/被刷"争议的源头。 |
| **2021.07** | **HumanEval / Codex**（Chen et al., OpenAI） | BLEU 测不出代码"能不能跑"。HumanEval 把评判从"像不像参考答案"换成"跑 164 道题的单测看**功能正确**"，确立**可执行 ground truth** 这条主线与 **pass@k** 指标——日后 SWE-bench、τ-bench 全沿用。 |
| **2023.06** | **MT-Bench & Chatbot Arena**（Zheng et al., LMSYS） | 指令微调后的聊天输出是自由文本，精确匹配/多选彻底失效。两条新范式诞生：用 GPT-4 当**判官**自动打分，和让真人**成对投票算 Elo**。它同时催生了"LLM 判官可信吗"与"排行榜可信吗"两大争议。 |
| **2023.07** | **WebArena**（Zhou et al., CMU） | 模型开始被当 Agent 用，静态 QA 测不了"在环境里多步操作"。WebArena 提供可复现的真实网站（电商/论坛/GitLab/CMS）+ 状态化成功判定；最佳 GPT-4 Agent 仅 **14.41%** vs 人类 **78.24%**，暴露"知识强 ≠ 会做事"。 |
| **2023.08** | **AgentBench**（Liu et al., 清华 THUDM） | 环境零散、缺跨域横向比较。AgentBench 把 OS、DB、知识图谱、卡牌、网购、家居等 **8 类环境**统一封装，让"Agent 能力"第一次能用一篇基准比较，推动评测从单轮 QA 转向多轮决策。 |
| **2023.10** | **SWE-bench**（Jimenez/Yang et al., Princeton） | 把"可验证 + 真实任务"推到极致：给真实仓库 + GitHub issue，要求改代码并跑通仓库**自带单测**。**2,294** 个跨文件、长上下文、有经济价值的任务，最强模型仅解 **1.96%**，成为最具影响力的 Agent 基准。 |
| **2023.11** | **GAIA + GPQA**（Meta/HF · NYU） | 对抗饱和与歧义。GAIA **反向设计**：对人极易（92%）、对 GPT-4+插件极难（15%），但答案唯一好评分，综合推理+多模态+浏览+工具。GPQA 用专家撰写的 **"Google-proof"** 研究生难题对抗检索捷径与污染。 |
| **2024.03** | **LiveCodeBench**（Jain et al., Berkeley/MIT） | 静态基准被泄进训练集。LiveCodeBench 按**发布时间持续收集竞赛新题并切片**，把"contamination-free"做成可操作方法，并扩展到自修复/执行/测试预测多能力。 |
| **2024.04** | **OSWorld**（Xie et al., XLANG/HKU） | 把评估扩到真实操作系统的多模态 GUI Agent，执行级判分；**369** 任务最佳模型仅 **12%** vs 人类 **72%**，揭示 GUI grounding 评估缺口。 |
| **2024.06** | **τ-bench**（Yao et al., Sierra） | 真实部署是多轮对话 + 守业务规则，单次成功率掩盖"稳不稳"。τ-bench 让 LLM 模拟用户、比对数据库终态，提出 **pass^k** 可靠性指标：SOTA <50%、`pass^8`（零售）<25%，把"一致性/可靠性"摆上台面。 |
| **2024.08** | **SWE-bench Verified**（OpenAI × Princeton） | 连"真实任务"基准也有错判、欠定义、过严单测。OpenAI 雇 **93 名 Python 开发者**筛 1,699 个样本，产出人工校验的 **500** 题干净子集——直接回应"基准噪声/有效性"质疑，评测开始**自我纠偏**。 |
| **2024.10** | **Agent-as-a-Judge**（Zhuge et al., Meta/KAUST） | 主张只看最终结果不足以评估多步 Agent，用 **Agent 评估 Agent** 提供过程级中间反馈，并发布 DevAI 基准，开辟轨迹/过程级评估方向。 |
| **2025.03** | **METR《Measuring AI Ability to Complete Long Tasks》** | 单一准确率说不清"能干多大事"。METR 用 **"50% 任务完成时间跨度"**（人类需多久的任务 AI 能以 50% 成功率搞定）度量自治度，发现约**每 7 个月翻倍**——把评测从静态分数升级为可外推的能力趋势。同月《Survey on Evaluation of LLM-based Agents》等综述标志 Agent 评估成为独立子领域。 |
| **2025.04** | **BrowseComp**（Wei et al., OpenAI）+ **PaperBench** + **Leaderboard Illusion** | BrowseComp 用 **1,266** 道"难找易验"反向出题度量浏览 Agent：Deep Research **51.5%** vs 带浏览 GPT-4o **1.9%**（27 倍），证明成败在架构而非有无工具。PaperBench 把论文复现拆成 **8,316** 个可评叶子节点。同期《The Leaderboard Illusion》68 页系统批评 Chatbot Arena。 |
| **2025.06** | **τ²-Bench**（Barres et al., Sierra） | 把单控（仅 Agent 用工具）升级为 **Dec-POMDP 双控**（用户也操作共享环境），评估协作与沟通，用可编程任务生成器构造可验证任务，推进对话式 Agent 评估的真实度。 |
| **2025.09** | **SWE-Bench Pro**（Scale AI） | 抗污染继任者，**1,865** 任务跨公开/隐藏/商业仓库；私有集分数大跌（GPT-5 23.3%→14.9%，Opus 4.1 23.1%→17.8%），证明"未见过的代码库"才是真正的泛化测试。 |
| **2026.01** | **Anthropic《Demystifying evals》+《AI-resistant evals》** | 最具体的一手 Agent 评估手册：grader 三分法、pass@k vs pass^k、**读 transcript**；并坦白评估饱和是移动靶——一道 1,000+ 人做过的招聘 take-home，被 Opus 4 击败大多数人、Opus 4.5 追平最强者，被迫反复重设计。 |
| **2026.01** | **METR《Time Horizon 1.1》** | 把时间跨度趋势刷新到前沿模型：Opus 4.5 的 50% 时间地平线≈**320 min**、GPT-5≈**214 min**；翻倍周期近窗（2024 起）≈**88.6 天**、全期约 **196.5 天**，近期斜率较初版"约 7 个月"明显变陡，印证自治度仍在加速、"时间跨度"作为抗饱和趋势指标持续有效。 |
| **2026.01** | **Terminal-Bench**（Stanford + Laude Institute） | 终端/CLI Agent 缺专门基准。给自然语言指令 + Docker 环境 + 测试 + oracle 解，v2.0 精选 **89** 道难任务、前沿模型仅 **<65%**——把评估扩到"在真实终端里把活干完"，作为仍有 headroom 的新一代 Agent 基准。 |
| **2026.02** | **OpenAI 退役 SWE-bench Verified** | 造 Verified 的同一个组亲手退役它：审计 o3 反复解不稳的 **138** 道题（占全集 **27.6%**），发现其中 **59.4%** 是测试/题面本身的缺陷而非模型能力问题，且 GPT-5 系/Opus 4.5/Gemini 3 全部显示训练污染。基准生命周期的**权威警世故事**，建议转向 SWE-bench Pro 等抗污染继任者。 |
| **2026.03** | **Cursor《How we compare model quality》（CursorBench）** | 产品级私有评估：任务取自真实 Cursor 会话、用 **Cursor Blame**（把提交代码溯源回 Agent 请求）控污染、每几个月刷新；并用 **offline + online（A/B）混合**，因为离线 grader 测不出"看着对、用着差"。 |

---

## 4. 核心概念与原理

### 4.1 评估的三个层级

```
端到端 / 结果级 (outcome)   ── 只看最终输出/终态：SWE-bench 跑单测、τ-bench 比数据库终态、
                              WebArena/OSWorld 执行判分。最客观、可复现、抗主观。
轨迹 / 过程级 (trajectory)  ── 看中间步骤：工具调用对不对、有无绕捷径/reward hacking、
                              步数/成本是否合理。Agent-as-a-Judge 给中间反馈。
组件级 (component)          ── 单独测某模块：规划质量、检索召回、工具选择、记忆读写。
                              便于定位"哪一环拖了后腿"。
```

关键张力：**结果级**客观但会**漏掉过程的对错**（蒙对的、走捷径的都判通过）；**轨迹级**能诊断却**缺 ground-truth**（中间步骤没有标准答案，判定本身要靠模型）。Anthropic 的工程立场是默认**判结果不判路径**——给一条创造性但有效的解法判失败，比放过一个偶尔蒙对的更有害；过程信号留给安全/工具正确性这类专门维度。

### 4.2 三类 grader 与何时用

| grader | 机制 | 优点 | 代价 / 风险 |
|---|---|---|---|
| **code-based** | 单测/字符串/正则/状态检查 | 快、便宜、确定、客观 | **脆**——对合法变体一刀切判错（测试过严是 SWE-bench 原始噪声主因） |
| **model-based（LLM-as-judge）** | 强 LLM 按 rubric 打分/对战 | 灵活、可扩展、能评开放式 | **非确定 + 贵 + 有偏**，judge 自己要被校准 |
| **human** | 人工标注/偏好投票 | 金标准、能抓微妙 UX | 慢、贵、难规模化、标注者间也不一致 |

实务上三者**混用**：用 code grader 跑可执行部分（快回归），用 LLM judge 评开放式部分（建议**多判官投票 + 抽样人审兜底**），用 human 定期校准判官并审 transcript。

### 4.3 LLM-as-judge 及其偏差（判官也要被评估）

MT-Bench/Chatbot Arena 实证：强判官（GPT-4）与人类偏好一致率 **>80%**，达到人-人一致水平，是大规模开放式评测唯一现实选项。但《Justice or Prejudice?》（CALM 框架）量化出 **12 类系统性偏差**，最关键的三类：

- **位置偏差**：成对评分时偏向放在**第一个**的答案。
- **冗长偏差**：偏向**更长**的答案。
- **自偏好/自增强**：偏向**自己或同风格**生成的输出（Gemini 判官偏 Gemini）。

工程缓解：

```python
def debiased_pairwise_judge(judge, q, ans_A, ans_B, n_judges=3):
    votes = []
    for _ in range(n_judges):                     # 多判官委员会，最好跨厂商（FACTS 模式）
        s1 = judge.compare(q, first=ans_A, second=ans_B)
        s2 = judge.compare(q, first=ans_B, second=ans_A)  # 交换位置再判一次
        # 只在两个顺序下结论一致时才计票，消除位置偏差；不一致记为平局
        votes.append(s1 if s1 == flip(s2) else "tie")
    return majority(votes)
```

更彻底的做法是**校准判官本身**（LangChain Align Evals：收集人工对判官打分的修正，存为 few-shot 喂回判官 prompt，迭代对齐），或升级为 **Agent-as-a-Judge**（用带工具的 Agent 去核验中间步骤）。一句话铁律：**你不能信任一个你没拿人类标注验证过的判官。**

### 4.4 pass@k vs pass^k：能力上限 vs 可靠性下限

非确定环境里，单次成功率是误导。两个指标方向相反：

```python
# pass@k：k 次里"至少成功一次"的概率 —— 衡量能力上限，k 越大分越高
def pass_at_k(successes, k):          # successes: 同一任务 N 次重试的布尔列表
    n, c = len(successes), sum(successes)
    if n - c < k: return 1.0
    from math import comb
    return 1.0 - comb(n - c, k) / comb(n, k)   # 1 - C(失败数,k)/C(N,k)，无偏估计

# pass^k：k 次"全部成功"的概率 —— 衡量可靠性下限，k 越大分越低
def pass_pow_k(successes, k):          # successes: 同一任务 N 次重试的布尔列表
    n, c = len(successes), sum(successes)
    if c < k: return 0.0
    from math import comb
    return comb(c, k) / comb(n, k)     # C(成功数,k)/C(N,k)，无偏估计（与 pass@k 同构）
    # 若改用 p**k（p=单次成功率）只是"重试相互独立"下的近似，会高估真实可靠性
```

τ-bench 的发现震撼之处（2024 原论文数据）：很多 Agent `pass@1` 看着体面，`pass^8` 直接掉到 ~25%——意味着"演示能成、批量上线必翻车"。**产品要什么决定报哪个**：一次成功就够（如能人工兜底的草稿生成）看 `pass@k`；要次次可靠（如自动退款、下单）必须看 `pass^k`。

> **同一把 `pass@k` 尺也是训练侧的裁判**：[[16]] 里"RL 究竟扩展还是只锐化能力"的核心争论，正靠 `pass@k` 曲线判案——小 k 的 pass@1 涨、大 k 的 pass@k 可能反被 base 反超（边界缩窄）。评推理能力因此至少要同时看 pass@1 与大 k 的 pass@k 两条曲线，单尺会高估 RL 的能力贡献。

### 4.5 污染与可复现：分数离不开实现

两个常被忽视的"分数失真"来源：

- **基准污染（contamination）**：基准题进了训练集，分数被"记忆"刷高。讽刺式证明是 Schaeffer《Pretraining on the Test Set Is All You Need》——百万参数小模型在含基准的测试集上预训练即满分。但要**分模型看**：GSM1k（复刻 GSM8k 分布的 1,000 新题）显示部分家族（Phi/Mistral）掉分最高约 13 个百分点、且复现 GSM8k 概率与掉分正相关（=部分记忆），而前沿模型过拟合极小。**缓解**：时间切片（LiveCodeBench）、Google-proof 难题（GPQA）、私有/held-out/商业集（SWE-bench Pro）、来源追溯（Cursor Blame）、canary 字符串。
- **可复现性（reproducibility）**：**一个基准分数离不开它的 harness/prompt/分词/评分实现**。HuggingFace 著名一课：同一份 MMLU 数据，Berkeley 原版、Stanford HELM、EleutherAI Harness 三种实现跑出**显著不同的分**、甚至**重排了模型名次**（LLaMA-65B 0.637 vs 0.488）。结论：脱离实现谈"MMLU 分数"毫无意义，必须钉死 harness 才能横向比。

### 4.6 基准生命周期（本章的脊柱）

```
① 修有效性  SWE-bench → SWE-bench Verified（人工校验，N 变小换可信）
② 饱和+污染  前沿模型刷满 + 训练泄漏，分数不再反映真实进步
③ 退役       OpenAI 公开退役自己的 Verified（~60% 失败题测试就是坏的）
④ 抗污染继任 SWE-bench Pro（held-out/商业仓库），头部分数回落，恢复 headroom
```

含义：**没有永恒的基准**。建评估时就要预留"退役预算"和"定期污染审计"，把基准当**有保质期的产品**来运维，而不是一次性建好的资产。

**① 生命周期分类（把每个基准钉到一个阶段）**：

| 阶段 | 代表基准 | 信号 / 证据 | 处置 |
|---|---|---|---|
| **已饱和** | MMLU、HumanEval | 前沿模型刷顶（MMLU 自 2023 GPT-4 ≈86% 后基本停滞）、区分度耗尽 | 降为"冒烟测试"，退出能力前沿 |
| **已退役** | SWE-bench Verified | 全部前沿模型训练污染（可逐字复现 patch）+ 约 **60%** 剩余失败题测试本身有缺陷 | OpenAI 2026-02-23 停报，转继任者 |
| **抗污染继任** | SWE-bench Pro / Terminal-Bench / LiveCodeBench / τ²-bench | 头部分数回落、headroom 恢复 | 当前主战场（见下表） |
| **抗饱和趋势** | METR 时间跨度 | 移动靶，原理上不会被刷满 | 长期追自治度趋势 |

**② 当前抗污染主战场（继任者一览）**：

| 抗污染继任者 | 来源（arXiv） | 关键设计 | 规模 / headroom |
|---|---|---|---|
| **SWE-bench Pro** | Scale AI（2509.16941） | **三段式**抗污染：公开 GPL/copyleft 仓库 + held-out + 商业私有（仅发结果、不公开题面） | 1,865 任务 / 41 仓库；私有集分数大跌 |
| **Terminal-Bench** | Stanford + Laude（2601.11868） | 终端/CLI：自然语言指令 + Docker 环境 + 测试 + oracle 解 | v2.0 89 道难任务，前沿 <65% |
| **LiveCodeBench** | Berkeley/MIT（2403.07974） | **时间窗口**：按竞赛平台发布日期取题切片，杜绝泄题 | 持续滚动收集 |
| **τ-bench → τ²-bench** | Sierra（2506.07982） | **dual-control**：agent 与 user 共改共享状态 + 新增 telecom 域 | τ-bench(2406.12045) 的继任 |

> 📦 **结案框**：**提出** — SWE-bench(2023.10) → Verified(2024.08，人工校验 500 题)买"基准有效性"。
> **2026 定论** — OpenAI 2026-02-23 亲手退役 Verified：全部前沿模型训练污染 + 约 60% 剩余失败题测试本身有缺陷，"提升越来越只反映训练时见过多少基准"。
> **现状** — 主战场转向抗污染继任者（SWE-bench Pro 三段式 / Terminal-Bench / LiveCodeBench 时间窗口 / τ²-bench dual-control），评估按"有保质期的产品"运维：排定期污染审计 + 到点退役预算。

### 4.7 不确定性量化与弃答（知道自己不知道）

成功率只回答"做对没有"，回答不了"模型知不知道自己可能做错"。一个 90% 成功率的 Agent，若在剩下 10% 里**高置信地犯错**（而非弃答求助），在自动退款/下单等场景比一个会说"我不确定，转人工"的 Agent 危险得多。于是可靠性评估的第三轴是**校准与弃答（abstain）**：

- **校准**：模型报告的置信度是否匹配实际正确率——SimpleQA 这类基准就刻意测"敢不敢硬答"对照"知道自己不知道"。
- **何时弃答（when-to-abstain）**：在不确定时主动放弃/上交人工（HITL）而非硬猜，是高风险 Agent 的一等可靠性维度。

《Uncertainty Quantification in LLM Agents》（2026，含 Dawn Song / Sharon Li）把这条轴系统化：从置信度校准到弃答策略，梳理出多步 Agent 的 UQ 谱系，把"知道自己不知道"从 LLM 单轮（SimpleQA）提升为**多步 Agent 的可信评估维度**——与 [[10]] 可观测性、[[11]] 生产工程的人工兜底（HITL）直接咬合。

---

## 5. 主流方法谱系

| 范式 / 基准族 | 判分机制 | 评什么 | 代表工作 | 抗污染 | 可复现 | 真实度 | 代价 / 边界 |
|---|---|---|---|---|---|---|---|
| **静态多选** | 选项精确匹配 | 知识/推理 | MMLU、GPQA | 低（GPQA 较高） | 高 | 低 | 易饱和、标签噪声 |
| **可执行代码** | 跑单元测试 | 功能正确性 | HumanEval、SWE-bench(Verified)、LiveCodeBench | 中（时间切片高） | 高 | 中-高 | 测试可能过严/坏 |
| **在线交互环境** | 环境终态/执行判分 | 多步做事能力 | WebArena、OSWorld、AgentBench | 高 | 低（环境会变） | 高 | 贵、难复现、有版本漂移 |
| **工具-用户对话** | 数据库终态 + pass^k | 多轮+守规则+可靠性 | τ-bench、τ²-Bench | 中 | 中 | 高 | 依赖用户模拟器保真度 |
| **浏览/深研** | 比对唯一参考答案 | 深度检索+推理 | BrowseComp、GAIA | 高（反向出题） | 高 | 高 | 出题成本高 |
| **LLM-as-judge** | 强 LLM 打分/对战 | 开放式生成质量 | MT-Bench、AlpacaEval、Arena-Hard | 中 | 中 | 中 | 位置/冗长/自偏好偏差 |
| **人类偏好 Elo** | 众包成对投票 | 真实使用偏好 | Chatbot Arena | 高 | 低 | 高 | 可被操纵、样本/风格偏置 |
| **rubric 分解** | 层级化叶子节点逐条判 | 模糊开放任务 | PaperBench(8,316 节点) | 高 | 中 | 高 | rubric 工程成本巨大 |
| **时间跨度** | 50% 成功的人时长度 | 自治度趋势 | METR | 高（抗饱和） | 中 | 高 | 任务类型外推存疑 |
| **私有产品评估** | 真实会话 + online A/B | 产品级真实效用 | CursorBench、SWE-bench Pro | 高 | 低（不公开） | 最高 | 跨组织不可比 |

> 这些**不是互斥的**。成熟团队通常：用静态/可执行基准做快回归 → 用交互/对话基准测真实能力 → 用 LLM-judge + 人审评开放式 → 用 online A/B 兜住"看着对、用着差" → 用时间跨度/pass^k 追趋势与可靠性。

---

## 6. 主流观点与争议

### 争议 1：LLM-as-judge 能可靠替代人类评估吗？

- **可用派**：Zheng et al.（MT-Bench/LMSYS）及 AlpacaEval/Arena-Hard 采用者。强判官与人类一致率 >80%、可扩展、成本远低于人工，是大规模开放式评测的**唯一现实选项**。
- **质疑派**：Ye et al.《Justice or Prejudice?》、Gu et al.《Survey on LLM-as-a-Judge》、Zhuge et al.（Agent-as-a-Judge）。判官有**位置/冗长/自偏好**等系统性偏差、错判时仍高置信，标准缓解策略也难根除残余偏差，高风险场景不可全盘信任，需校准甚至改判官训练方式。
- **折中（工程界共识）**：LangChain（Align Evals）与 Google DeepMind（FACTS）——**判官可用但必须被治理**：人工修正校准 + 跨厂商多判官投票 + 持续人审。Anthropic 立场更硬：**必须读 transcript 验证判官**。

### 争议 2：判结果还是判轨迹？

- **结果导向派**：Jimenez（SWE-bench 单测）、Yao（τ-bench 终态）、Anthropic。判路径会**过度惩罚合法的创造性解法**且脆弱；判终态最客观可复现。
- **过程导向派**：Zhuge et al.（Agent-as-a-Judge）及 process-supervision 拥护者。只看结果会**漏掉 reward hacking**（碰巧落在对的答案上）和工具误用，安全/效率/工具正确性这些维度只有看轨迹才测得到。
- **关键分歧点**：**有没有可靠 ground-truth**。终态可验证时优先判结果；安全/合规等必须看过程时，再上轨迹级（并接受其判定本身要靠模型、有偏）。

### 争议 3：静态离线基准 vs 在线交互评估，谁更反映真实能力？

- **静态派**：MMLU/HumanEval/GPQA 传统及看重可复现/低成本者。多选/单测廉价、可复现、可大规模自动评分，适合横向排名与回归。
- **真实任务派**：Zhou（WebArena）、Xie（OSWorld）、Jain（LiveCodeBench）、METR。静态已饱和（MMLU 自 2023 GPT-4 达 86% 后基本停滞）且与部署脱节；要在**可执行/交互**的真实任务上评，METR 更主张用"时间跨度"刻画自治度趋势。
- **实务**：两者**互补**——静态做快回归、在线做真实度验证。

### 争议 4：报 pass@1 还是 pass^k？

- **pass@1 派**：主流排行榜。单次成功率简单直观、便于对比。
- **pass^k 派**：Yao et al.（τ-bench）。非确定下 `pass^k` 才暴露一致性崩塌（`pass^8`→~25%），对要"次次可靠"的产品更诚实。
- **判定**：能力研究看 `pass@k`，**可靠性/上线决策必须看 `pass^k`**。

### 争议 5：该信公开共享基准还是私有产品评估？

- **公开派**：HuggingFace、学术社区。SWE-bench/MMLU 可复现、跨实验室/论文可比；没有它跨模型对比就崩塌。
- **私有派**：Cursor、Scale AI。公开基准会泄进训练集、且与产品现实脱节；从真实会话来的私有评估区分度更高、抗污染——代价是**牺牲可复现性**（跨组织不可比）。
- **现状**：领域正在**分裂**为"可复现但易泄漏的公开集"与"真实但不透明的私有集"，短期无解。

### 争议 6：静态基准注定饱和+污染，该不该弃用？

- **弃用/移动靶派**：OpenAI（退役 Verified）、METR（时间跨度）、Anthropic（招聘 eval 被模型追平）。固定的人类标准线终会被刷过，应转向**移动靶指标**或定期刷新的私有集。
- **维护派**：基准维护者阵营。精心策展的静态基准在**预留退役预算 + 污染审计**的前提下，对可复现性与趋势追踪仍有不可替代的价值。

### 争议 7：人类偏好排行榜是可信信号还是可被操纵的"幻觉"？

- **批评派**：Singh et al.《The Leaderboard Illusion》、Simon Willison。私测 + 择优披露给大厂特权（某提供商测 27 个私有变体只公开最佳）、按 Arena 偏好（更长/更自信/排版好）过拟合却不泛化。**标志案例**：Meta 提交与开源权重不同的 Llama-4-Maverick 实验版刷到 Arena #2，被指 bait-and-switch（The Register 报道），迫使 LMArena 道歉改政策、重测原版（排名大跌）。
- **维护派**：LMArena/LMSYS 回应坚称平台公开透明、政策一贯，众包真人成对投票仍是**最贴近真实使用、最难单点造假**的活体信号，并已更新提交/披露政策回应争议。

---

## 7. 大厂工程实践

### 案例 A：OpenAI SWE-bench Verified 的完整生命周期——花人力买有效性，再亲手退役

**取舍一（2024，买有效性）**：与其信一个 2,294 题、自动判分但噪声大的基准，OpenAI 雇 **93 名 Python 开发者**筛 1,699 个样本，产出干净的 **500** 题子集。代价是 N 大幅变小 + 一次性标注成本，回报极具体：测得的 GPT-4o 从 ~16%（Agentless on 全量）跳到 **33.2%**——**之前的差距是测量误差，不是能力差距**。工程教训：**值得花人力提升基准有效性，哪怕 N 变小**。

**取舍二（2026，退役）**：18 个月后，造 Verified 的同一个组公开退役它。审计 138 道（占全集 **27.6%**）o3 在 64 次独立运行中都解不稳的题，发现这些"失败"里 **59.4%** 其实是测试/题面本身的缺陷，且 GPT-5 系/Claude Opus 4.5/Gemini 3 全部显示训练污染——"Verified 上的提升越来越只反映模型在训练时见了多少基准，而非真实软工能力"。工程教训：**给基准排退役预算和污染审计；一个头条分数只在一个时间窗口内有意义**。

### 案例 B：Anthropic Agent 评估手册——判结果、混用 grader、读 transcript

**取舍：在灵活与可信间用"读 transcript"兜底。** Anthropic《Demystifying evals》的可落地范式：

- **从 20–50 个真实生产失败任务起步**，而非追求完美覆盖。
- **混用三类 grader**：code（快/脆）、model（灵活/非确定/贵）、human（金标准/慢）。
- **判最终输出/终态，不判路径**——避免惩罚创造性解法。
- **试验间隔离环境**——防止一次失败污染后续重试，造成相关性失真。
- **可靠性单独用 pass@k vs pass^k 度量**。
- **最高铁律：读 transcript**——你不能信任没审过的 grader，要盯着 reward hacking 与 eval 饱和。

**对照（同属 Anthropic，AI-resistant evals）**：一道用了 2 年、1,000+ 候选人做过的性能工程 take-home，先被 Claude Opus 4 击败大多数人、再被 Opus 4.5 追平最强者，被迫**反复重设计**走向刻意刁钻的任务。证明任何固定的人类标准线都会随模型变强而失效——**评估需要维护路线图，不是一次性建好**。

### 案例 C：Cursor CursorBench——私有评估 + 在线 A/B 混合

**取舍：放弃公开可复现，换更高区分度与抗污染。** Cursor 从**真实内部会话**构建基准（带 query→solution 的 ground truth），用 **Cursor Blame**（把提交代码溯源回 Agent 请求）控污染、每几个月刷新（已迭代到 CursorBench-3，题目规模较初版约翻倍——按代码行数与平均文件数计）。关键：因为**离线 grader 测不出"看着对、用着差"**，必须配 **online 受控实验（A/B）**，并跟踪一**篮子代理指标**而非死磕单一数字。

### 案例 D：Google DeepMind FACTS Grounding——多判官 + 私有集

**取舍：多付推理成本换公平、抗刷榜。** 长文本接地真实性评估（1,719 例，公开 860 / 私有 859）。两个值得抄的工程选择：(1) **聚合三家竞品判官**（Gemini 1.5 Pro + GPT-4o + Claude 3.5 Sonnet）取平均，**中和自偏好偏差**；(2) **判出"没真正回应 prompt"的回答直接判负**，并**留私有 held-out 集**抵抗排行榜过拟合。

### 案例 E（补充）：HuggingFace Open LLM Leaderboard——标准化 harness

**取舍：要可比性，不要好看的论文数字。** 各家自报的 MMLU 用各自优化过的 prompt，互不可比。HF 统一用固定的 EleutherAI Harness 跑分——虽然和厂商自报值有出入，但**只有钉死同一实现，跨模型对比才有效**。他们选了可复现/可比，而非迎合漂亮的论文数字。

---

## 8. 我的分析与判断

> **以下为分析观点（非客观事实），是我基于上述材料的独立研判，供参考与批判。**

**趋势研判一：评估正在从"一个排行榜数字"裂变成"三层信号栈"。** 我判断未来的标准形态是：底层 **offline 快回归**（可执行 + LLM-judge，秒级反馈，挡明显回退）→ 中层 **真实任务/可靠性集**（τ-bench 式 pass^k、私有 held-out，周级，决定能不能 candidate）→ 顶层 **online A/B + 一篮子代理指标**（生产流量，决定能不能 GA）。单一基准分数会越来越像"编译通过"——必要但远不充分。Cursor 的 offline+online 混合是这个栈的早期完整样本，会被广泛抄。

**趋势研判二：抗污染会从"出题技巧"升级为"基础设施"。** 时间切片、反向出题、held-out 商业仓库都是出题侧的补丁；真正的解法是**来源追溯 + 持续刷新**做进评估平台。这套"评估即服务"的早期形态**已经落地**——Cursor 从真实会话挖任务 + Cursor Blame 控污染（CursorBench）、OpenAI 把 Evals 直接做进 AgentKit（GA）等，已把"从真实日志建评估"产品化；**仍属将来增量的，是"全自动污染审计 + 自动到点退役"**——OpenAI 都是**事后**才发现 Verified 污染的，人工审计跟不上模型迭代速度，这块自动化我赌 2027 年前补齐。

**趋势研判三：'判官信任'是下一个真正的瓶颈。** 能力越强，越没有比模型更强的廉价裁判，LLM-as-judge 的自偏好会从"小偏差"变成"系统性高估自家模型"。跨厂商多判官委员会（FACTS）+ 人工校准（Align Evals）会成为高风险评估的标配，但它贵且慢。Agent-as-a-Judge 是更激进的方向，但"用会犯错的 Agent 评会犯错的 Agent"有循环失真风险，其可信边界仍未被系统刻画——这是我认为最值得做的开放问题。

**常见坑（我见过/可预见的）**：

1. **只报 pass@1 就宣称"可靠"**——演示能成、批量上线翻车。要次次可靠的场景必须报 `pass^k`。
2. **信一个没审过 transcript 的 LLM judge**——judge 可能在用冗长/格式打分，或被 reward hacking 骗过去。务必抽样人审。
3. **拿 NIAH/单测通过就当"真实能力"**——SWE-bench 原始集 ~60% 失败题测试是坏的；过严/坏的单测会把能力误判成不能。
4. **永远用同一个静态基准追进度**——它会饱和会被污染，某天你优化的全是"对基准的记忆"。要排退役。
5. **试验之间不隔离环境**——一次失败把脏状态留给下一次重试，成功率被相关性失真，`pass^k` 算出来是假的。
6. **脱离 harness 比分数**——同一份 MMLU 换实现就重排名次，跨论文比"裸分"等于自欺。
7. **优化单一指标**——必被 Goodhart：刷高了基准、用户体验反而更差（"看着对、用着差"）。

**最佳实践清单（我的优先级排序）**：

1. **从真实失败建集**：20–50 个生产失败任务起步，远胜一个覆盖完美但脱离现实的大基准。
2. **判结果优先，过程留给安全维度**：终态可验证就判终态，别惩罚创造性路径。
3. **grader 三类混用 + 必读 transcript**：code 跑回归、model 评开放式（多判官 + 人审兜底）、human 定期校准判官。
4. **能力看 pass@k、可靠性看 pass^k**，且试验间严格隔离环境、报置信区间。
5. **把抗污染当一等公民**：来源追溯、held-out/私有集、定期刷新、到点退役。
6. **offline 挡回退、online 定生死**：用 A/B + 一篮子代理指标兜住离线测不出的 UX。
7. **给抗饱和留后手**：用 METR 式时间跨度或刷新私有集追趋势，别等基准刷满了才慌。

**一句话判断**：Agent 评估的本质不是"造一个更难的基准"，而是"经营一套**会过期、会被污染、会被判官偏差侵蚀**的信号系统"——谁把评估当**需要持续运维的产品**而非一次性资产，谁就掌握了 Agent 迭代的真指南针。

---

## 9. 面试考点

**概念题**

1. **为什么评估 Agent 比评估 LLM 难？**
   要点：①对象是**多步轨迹**而非单轮输出，中间步骤可错、结果可能蒙对或差一点；②环境交互引入**非确定性**，成功率是随机变量；③真实任务**多无唯一正解**，字符串匹配失效，须用**执行级/状态级判分**或 **LLM/Agent 裁判**。

2. **评估的三个层级是什么？各举一例。**
   要点：端到端/结果级（SWE-bench 单测、τ-bench 数据库终态）、轨迹/过程级（Agent-as-a-Judge 中间反馈、工具调用是否正确）、组件级（单独评规划/检索/记忆）。张力：结果级客观但漏过程，轨迹级能诊断但缺 ground-truth。

3. **LLM-as-judge 有哪些偏差？怎么缓解？**
   要点：位置偏差（偏第一个）、冗长偏差（偏长答案）、自偏好/自增强（偏自家/同风格）、格式偏差。缓解：成对评分**交换位置取一致**、**跨厂商多判官投票**（FACTS）、**人工修正校准**（Align Evals）、必要时升级 **Agent-as-judge**；且**判官本身必须用人类标注验证**。

4. **pass@k 和 pass^k 的区别？分别衡量什么？**
   要点：`pass@k`=k 次至少成功一次（**能力上限**，k 越大越高）；`pass^k`=k 次全部成功（**可靠性下限**，k 越大越低）。τ-bench 上 `pass@1` 体面而 `pass^8`→~25%。能力研究看前者，**上线/可靠性决策必须看后者**。

**系统设计题**

5. **为一个客服/编码 Agent 设计一套评估体系。**
   要点框架：①**任务来源**——从真实生产失败挖 20–50 个起步，带 ground-truth（终态/单测/参考答案）；②**判分**——code grader 跑可执行部分、LLM judge（多判官 + 人审兜底）评开放式、判终态不判路径；③**可靠性**——同任务多跑、报 `pass^k` + 置信区间、**试验间隔离环境**；④**抗污染**——私有/held-out 集、来源追溯、定期刷新、到点退役；⑤**离线+在线**——offline 挡回退、online A/B + 一篮子代理指标定生死（兜住"看着对、用着差"）；⑥**判官治理**——定期用人类标注校准 judge、必读 transcript。说清每个取舍即满分。

**手写题**

6. **写出 pass@k 与 pass^k 的计算，并说明何时用哪个。**
   参见 §4.4：`pass@k = 1 - C(失败数,k)/C(N,k)`、`pass^k = C(成功数,k)/C(N,k)`（两者均为无偏估计，结构同构；`p^k` 仅是"重试独立"下的近似）。评分点：方向相反（pass@k 随 k 升、pass^k 随 k 降）、能力 vs 可靠性的语义、产品需求决定报哪个。加分：提到要隔离环境、报置信区间。

**陷阱题**

7. **"模型在 SWE-bench Verified 上从 70% 涨到 80%，说明它真的更会写代码了" —— 对吗？**
   陷阱：忽视污染与基准保质期。反驳：2026 年 OpenAI 退役 Verified——模型"失败"题里 ~60% 测试是坏的、全部前沿模型有训练污染，"提升越来越只反映训练时见过多少基准"。正解：看抗污染继任者（SWE-bench Pro 私有集分数大跌）、做污染审计、追趋势用移动靶指标。

8. **"用 GPT-4 当裁判给两个回答打分，谁分高选谁，客观又省钱" —— 对吗？**
   陷阱：信未校准的判官。反驳：判官有位置/冗长/自偏好偏差且错判时高置信；GPT 判官可能偏长答案、偏 GPT 自己的风格。正解：交换位置、跨厂商多判官、用人类标注校准、抽样人审、读 transcript。

9. **"我们 pass@1 有 85%，可以放心上线自动退款功能了" —— 对吗？**
   陷阱：用能力上限冒充可靠性。反驳：自动退款要求**次次可靠**，`pass@1` 85% 可能对应 `pass^8` <40%，意味着连做 8 单就大概率出错。正解：报 `pass^k`、看一致性、高风险动作加人工兜底（HITL，见 [[11]]）。

10. **"RLVR 把模型在某 benchmark 上从 30% 训到 70%，说明它真获得了新推理能力" —— 对吗？（评估 × 训练交叉）**
   陷阱：把 pass@1 提升当能力边界扩张。反驳：用 **pass@k**（大 k）看真实解题集合——清华 Yue 等（arXiv:2504.13837）发现 RLVR 在小 k 占优、大 k 反被 base 反超，主张 RL 只是「**锐化/重排序**」已有路径而非扩边界；NVIDIA ProRL（2505.24864）则用长时 RL 给出反例。正解：报 pass@k 曲线而非单点、区分「锐化 vs 扩展」、并防 benchmark 污染。训练侧机制详见 [[16]]。

---

## 10. 参考文献

### 📄 论文

- **Hendrycks et al. (2020)** · *Measuring Massive Multitask Language Understanding (MMLU)* · 57 学科静态多选基准，奠定"单一可比分数"范式，也成为日后饱和/标签错误争议的标本。 · https://arxiv.org/abs/2009.03300
- **Chen et al. (2021, OpenAI)** · *Evaluating Large Language Models Trained on Code (HumanEval/Codex)* · 164 道可执行编程题 + pass@k，把代码评测从文本匹配转为"跑单测看功能正确"，确立可执行 ground truth。 · https://arxiv.org/abs/2107.03374
- **Zheng et al. (2023, LMSYS)** · *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena* · 确立 LLM-as-judge 与众包 Elo 两大开放式评测范式，实证 GPT-4 判官与人一致率 >80%。 · https://arxiv.org/abs/2306.05685
- **Zhou et al. (2023, CMU)** · *WebArena: A Realistic Web Environment for Building Autonomous Agents* · 自托管真实网页环境 + 状态化判定，812 任务，GPT-4 Agent 14.41% vs 人类 78.24%，推动在线评估。 · https://arxiv.org/abs/2307.13854
- **Liu et al. (2023, THUDM)** · *AgentBench: Evaluating LLMs as Agents* · 首个跨 8 环境（OS/DB/KG 等）的系统化 LLM-as-Agent 多环境基准，推动评测从单轮 QA 转向多轮决策。 · https://arxiv.org/abs/2308.03688
- **Jimenez, Yang et al. (2023, Princeton)** · *SWE-bench: Can Language Models Resolve Real-World GitHub Issues?* · 2,294 个真实 GitHub issue，用仓库自带单测判分，开创真实软工 Agent 评估，最强模型仅 1.96%。 · https://arxiv.org/abs/2310.06770
- **Mialon et al. (2023, Meta/HF)** · *GAIA: a benchmark for General AI Assistants* · 466 道"人易（92%）模型难（GPT-4+插件 15%）、答案唯一好评分"的通用助手题，综合推理+多模态+浏览+工具。 · https://arxiv.org/abs/2311.12983
- **Rein et al. (2023, NYU)** · *GPQA: A Graduate-Level Google-Proof Q&A Benchmark* · 专家撰写、"Google-proof"的研究生级难题，对抗检索捷径与数据污染，支撑可扩展监督评估。 · https://arxiv.org/abs/2311.12022
- **Chiang et al. (2024, LMSYS)** · *Chatbot Arena: An Open Platform for Evaluating LLMs by Human Preference* · 众包成对对战 + Elo 排名的在线人类偏好平台，成为业界最被引用的 LLM 排行榜。 · https://arxiv.org/abs/2403.04132
- **Jain et al. (2024, Berkeley/MIT)** · *LiveCodeBench: Holistic and Contamination Free Evaluation of LLMs for Code* · 按发布时间持续收集竞赛新题并切片，把"抗污染"做成可操作方法，扩展到自修复/执行/测试预测。 · https://arxiv.org/abs/2403.07974
- **Xie et al. (2024, XLANG/HKU)** · *OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments* · 369 任务的真实操作系统环境，执行级判分，最佳 12% vs 人类 72%，暴露 GUI grounding 评估缺口。 · https://arxiv.org/abs/2404.07972
- **Yao et al. (2024, Sierra)** · *τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains* · LLM 模拟用户的动态多轮 + 工具 + 守规则基准，提出 pass^k 可靠性指标，揭示 pass^8（零售）<25%。 · https://arxiv.org/abs/2406.12045
- **Zhang et al. (2024, Scale AI)** · *A Careful Examination of LLM Performance on Grade School Arithmetic (GSM1k)* · 复刻 GSM8k 分布的 1,000 新题，量化污染/过拟合：部分家族掉分约 13pp，前沿模型过拟合极小。 · https://arxiv.org/abs/2405.00332
- **Ye et al. (2024)** · *Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge* · 用 CALM 框架量化位置/冗长/自偏好等 12 类裁判偏差，揭示自动评估的可靠性边界。 · https://arxiv.org/abs/2410.02736
- **Zhuge et al. (2024, Meta/KAUST)** · *Agent-as-a-Judge: Evaluate Agents with Agents* · 主张只看结果不足以评估多步 Agent，用 Agent 评 Agent 给过程级反馈，发布 DevAI 基准。 · https://arxiv.org/abs/2410.10934
- **OpenAI (2024)** · *MLE-bench: Evaluating ML Agents on ML Engineering* · 75 个真实 Kaggle 比赛按奖牌阈值判分，证明 scaffold/harness 对分数影响可与底座模型相当。 · https://arxiv.org/abs/2410.07095
- **Wei et al. (2024, OpenAI)** · *Measuring short-form factuality in LLMs (SimpleQA)* · 4,326 道无歧义事实题，测校准/弃答（model 是否"知道自己不知道"），刻意对抗前沿模型。 · https://arxiv.org/abs/2411.04368
- **Gu et al. (2024)** · *A Survey on LLM-as-a-Judge* · 全面综述裁判范式的设计、可靠性、偏差（位置/冗长/幻觉）与对齐方法。 · https://arxiv.org/abs/2411.15594
- **Kwa, West et al. (2025, METR)** · *Measuring AI Ability to Complete Long Tasks* · 提出"50% 任务完成时间跨度"度量自治度，发现约每 7 个月翻倍，把评测升级为可外推趋势。 · https://arxiv.org/abs/2503.14499
- **Yehudai et al. (2025, IBM/Yale)** · *Survey on Evaluation of LLM-based Agents* · 首个全面的 Agent 评估综述，从能力维度、应用基准、通用 Agent、核心维度、框架/工具五视角梳理领域。 · https://arxiv.org/abs/2503.16416
- **OpenAI (2025)** · *PaperBench: Evaluating AI's Ability to Replicate AI Research* · 复现 20 篇 ICML 2024 论文，拆成 8,316 个可评叶子节点（与原作者共建），LLM 判官经人类校验。 · https://arxiv.org/abs/2504.01848
- **Wei et al. (2025, OpenAI)** · *BrowseComp: A Simple Yet Challenging Benchmark for Browsing Agents* · 1,266 道"反向出题、难找易验"浏览基准，Deep Research 51.5% vs GPT-4o-browsing 1.9%，证明成败在架构。 · https://arxiv.org/abs/2504.12516
- **Singh et al. (2025)** · *The Leaderboard Illusion* · 68 页系统批评 Chatbot Arena：私测 + 择优披露给大厂特权、按 Arena 偏好过拟合，质疑人类偏好榜有效性。 · https://arxiv.org/abs/2504.20879
- **Barres et al. (2025, Sierra)** · *τ²-Bench: Evaluating Conversational Agents in a Dual-Control Environment* · 把单控升级为 Dec-POMDP 双控（用户也用工具改共享环境），评估协作与沟通，用可编程任务生成器构造可验证任务。 · https://arxiv.org/abs/2506.07982
- **Scale AI (2025)** · *SWE-Bench Pro: Can AI Agents Solve Long-Horizon Software Engineering Tasks?* · 1,865 任务跨公开/隐藏/商业仓库的抗污染继任者，私有集分数大跌，证明"未见过的代码库"才是真泛化测试。 · https://arxiv.org/abs/2509.16941
- **Stanford + Laude Institute (2026)** · *Terminal-Bench* · 终端/CLI Agent 基准：自然语言指令 + Docker 环境 + 测试 + oracle 解，v2.0 精选 89 道难任务、前沿模型仍 <65%，作为仍有 headroom 的新一代 Agent 基准。 · https://arxiv.org/abs/2601.11868 · https://tbench.ai
- **(2026, 含 Dawn Song / Sharon Li)** · *Uncertainty Quantification in LLM Agents: Foundations, Emerging Challenges, and Opportunities* · 系统梳理 LLM Agent 的不确定性量化：从置信度校准到"何时弃答（abstain）"，把"知道自己不知道"提为可靠性与可信评估的一等维度。 · https://arxiv.org/abs/2602.05073

### ✍️ 博客与工程文

- **OpenAI (2024)** · *Introducing SWE-bench Verified* · 雇 93 名开发者筛 1,699 样本产出 500 题干净子集，测得 GPT-4o 从 ~16% 升到 33.2%——差距是测量误差非能力差距。 · https://openai.com/index/introducing-swe-bench-verified/
- **OpenAI / Glaese & Watkins (2026)** · *Why we no longer evaluate SWE-bench Verified* · 造 Verified 的组亲手退役它：~60% 失败题测试就是坏的、全部前沿模型有训练污染，建议转 SWE-bench Pro。基准生命周期的权威警世故事。 · https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/
- **Anthropic Engineering (2026)** · *Demystifying evals for AI agents* · 最具体的一手 Agent 评估手册：从真实失败建集、grader 三分法、判结果不判路径、pass@k vs pass^k、隔离环境、必读 transcript。 · https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- **Anthropic Engineering / Tristan Hume (2026)** · *Designing AI-resistant technical evaluations* · 招聘 take-home 被 Opus 4 击败多数人、Opus 4.5 追平最强者，反复重设计——固定人类标准线随模型变强而失效，评估需维护路线图。 · https://www.anthropic.com/engineering/AI-resistant-technical-evaluations
- **Cursor / Naman Jain (2026)** · *How we compare model quality in Cursor (CursorBench)* · 私有评估：真实会话 + Cursor Blame 控污染 + 定期刷新，offline+online(A/B) 混合兜住"看着对、用着差"，跟踪一篮子代理指标。 · https://cursor.com/blog/cursorbench
- **Sierra (2024)** · *τ-bench: Shaping the development and evaluation of AI agents* · 提出 pass^k 看一致性：SOTA Agent 重复同一任务 8 次成功率骤降到 ~25%，说明单次成功率严重高估真实可靠性。 · https://sierra.ai/blog/tau-bench-shaping-development-evaluation-agents
- **LMSYS Org (2023)** · *Chatbot Arena: Benchmarking LLMs in the Wild with Elo Ratings* · 众包匿名对战 + Elo 的在线人类偏好评估，难被污染、持续更新，但有样本偏置与提示质量参差。 · https://lmsys.org/blog/2023-05-03-arena/
- **OpenAI (2025)** · *BrowseComp: a benchmark for browsing agents* · "难找易验"反向出题哲学：从可验证事实倒推难找问题，自动评分却极难，浏览本身（0.6%→1.9%）无策略推理无用。 · https://openai.com/index/browsecomp/
- **OpenAI (2024)** · *Introducing SimpleQA* · 为廉价无歧义评分而设计的事实性基准（4,326 题、双标注者定答案），测校准/弃答而非裸准确率，GPT-4o 仅 ~38%。 · https://openai.com/index/introducing-simpleqa/
- **OpenAI (2024)** · *MLE-bench* · 75 个真实 Kaggle 比赛按奖牌阈值判分，最佳（o1-preview + AIDE）16.9% 拿铜——scaffold 可与底座模型同等重要，故评估须固定 scaffold。 · https://openai.com/index/mle-bench/
- **Google DeepMind (2024)** · *FACTS Grounding: a new benchmark for evaluating factuality* · 长文本接地真实性（1,719 例，公开 860/私有 859）：三家竞品判官取平均中和自偏好 + 离题判负 + 私有集抗刷榜。 · https://deepmind.google/blog/facts-grounding-a-new-benchmark-for-evaluating-the-factuality-of-large-language-models/
- **METR (2025)** · *Measuring AI Ability to Complete Long Tasks* · 科普"50% 任务完成时间跨度"方法与约 7 个月翻倍趋势，主张用真实人时长度而非单点准确率衡量自治度。 · https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/
- **METR (2026)** · *Time Horizon 1.1* · 用前沿模型刷新时间跨度趋势：Opus 4.5 的 50% 时间地平线≈320 min、GPT-5≈214 min；翻倍周期近窗（2024 起）≈88.6 天、全期约 196.5 天，近期斜率较初版明显变陡。 · https://metr.org/blog/2026-1-29-time-horizon-1-1/
- **Scale AI (2025)** · *SWE-Bench Pro: Raising the Bar for Agentic Coding* · 抗污染继任者，1,865 任务含 held-out/商业代码，私有集分数大跌（GPT-5 23.3%→14.9%），证明"未见过代码库"是真泛化测试。 · https://scale.com/blog/swe-bench-pro
- **LangChain (2025)** · *Introducing Align Evals: Streamlining LLM Application Evaluation* · 收集人工对判官打分的修正、存为 few-shot 喂回判官 prompt 迭代对齐——把判官本身当作要评估和调优的对象。 · https://blog.langchain.com/introducing-align-evals/
- **HuggingFace (2023)** · *What's going on with the Open LLM Leaderboard? (MMLU)* · 同一份 MMLU 三种实现跑出显著不同分、甚至重排名次（LLaMA-65B 0.637 vs 0.488）；脱离 harness 谈分数毫无意义。 · https://huggingface.co/blog/open-llm-leaderboard-mmlu
- **Simon Willison (2025)** · *Understanding the recent criticism of the Chatbot Arena* · 独立梳理 Leaderboard Illusion 争议要点：私测、择优披露、过拟合 Arena 偏好。 · https://simonwillison.net/2025/Apr/30/criticism-of-the-chatbot-arena/
- **The Register (2025)** · *Meta accused of Llama 4 bait-n-switch to juice LMArena rank* · 报道 Meta 用与开源权重不同的实验版刷 Arena #2 的争议，"排行榜可被操纵"的标志性案例。 · https://www.theregister.com/2025/04/08/meta_llama4_cheating/

### 📚 官方文档 / 平台

- **Princeton PLI (2023)** · *SWE-bench: Can Language Models Resolve Real-World GitHub Issues?* · 作者团队介绍设计动机：真实 issue + 跑单测验证，远超传统代码生成。 · https://pli.princeton.edu/blog/2023/swe-bench-can-language-models-resolve-real-world-github-issues
- **LMArena (2025)** · *LMArena Response to "The Leaderboard Illusion"* · 维护方反驳，坚称平台公开透明、政策一贯，呼吁批评基于准确数据，并已更新提交/披露政策。 · https://arena.ai/blog/our-response/

---

> **交叉链接**：[[01]] Agent 核心与推理范式 · [[02]] Harness 运行时 · [[03]] 上下文工程 · [[04]] 工具与 MCP · [[08]] 多智能体编排 · [[10]] 可观测性与调试 · [[11]] 生产工程 · [[12]] 安全与对抗 · [[13]] 大厂案例研究 · [[15]] 面试题库 · [[16]] 训练与强化学习 · [[17]] 互操作协议与 Agent 经济
