> 状态：🟢 已校验

# 13 · 大厂案例研究

> 把前面 00–12 节的原理，落到 2022–2026 真实跑通的工业系统上。本节是「集成层」：同样的 Agent loop，被不同公司用不同的 harness、动作空间、上下文策略和评测标准，揉成了三类形态完全不同的产品。

---

## 1. TL;DR / 速览

**本节地图**：我们沿三条产品主线展开——(A) **编码 agent**（SWE-agent / OpenHands / Agentless / Devin / Cursor / Claude Code）、(B) **computer-use agent**（Anthropic Computer Use / OpenAI Operator）、(C) **deep research agent**（OpenAI / Google Gemini / Perplexity / HuggingFace）。每条线我们都拆「harness 动作空间 × 上下文策略 × 评测基准 × 自主度 × 开闭源」，再把横切争议（agent vs agentless、pixel vs DOM、multi vs single agent、增强 vs 委派）摊开。

**5 条核心结论：**

1. **harness/scaffolding 与模型同等重要。** SWE-agent 用一个为「LM 用户」专门设计的 Agent-Computer Interface（ACI），在不改模型权重的前提下把 SWE-bench pass@1 从 RAG 的 3.8% 抬到 12.5%——这是全行业「设计接口、不只是堆模型」的实证起点（参见 [[02]]）。
2. **评测是这场竞赛的发动机。** SWE-bench（编码）、OSWorld（computer-use）、GAIA / BrowseComp（deep research）各自定义了一条北极星指标，谁刷榜谁定义路线（参见 [[09]]）。
3. **三种 agent 原型正在向「统一通用 agent」收敛**，2025-07 ChatGPT Agent 把 Operator（屏幕行动）与 Deep Research（网络综合）合并就是标志；但「通用 vs 垂直」远未定论。
4. **编码是 agent 第一个跑通收入的垂直。** 到 2025-11，Cursor 与 Claude Code 各自年化营收破 $10 亿——而且赢家走的是 human-in-the-loop 的「增强」路线，不是 Devin 式的「全委派」。
5. **token 经济学与上下文工程是生产第一约束。** multi-agent 烧约 15 倍 chat token、KV-cache 命中与否差约 10 倍成本——这些不是优化项，而是决定产品能否上线的硬约束（参见 [[03]]）。

---

## 2. 定位与动机

前面几节把 Agent 拆成了零件：推理范式（[[01]]）、harness 运行时（[[02]]）、上下文工程（[[03]]）、工具与 MCP（[[04]]）、多智能体编排（[[08]]）。但零件不等于系统。**真正的工程取舍只在真实产品里才暴露**：当你要在 Ubuntu 上点像素、要在百万行仓库里改一个 bug、要把几百个网页综合成带引用的报告时，「该给多少自主权」「动作空间用什么抽象」「上下文怎么不爆」这些问题才有了带约束的答案。

本节在 Agent 链路里的位置是**集成与对照层**：不发明新机制，而是把已知机制在不同公司的落地方式并排放，让你看见「同一个 ReAct loop，为什么 Cursor 选择留在 IDE 里、Devin 选择全自主、Anthropic 选择终端原生」。对求职者而言，这一节是面试中「你了解哪些真实 agent 系统、它们的工程取舍是什么」这类问题的弹药库（系统化题库见 [[15]]）；对工程师而言，它是「我要造 agent，该抄谁的作业」的决策地图（具体框架/工具选型见 [[14]]）。

---

## 3. 历史发展脉络（时间线 · ≥8 里程碑）

- **2022-10 · ReAct（Yao 等，Princeton/Google）** — 推理与行动交织（think → act → observe → repeat）。这是几乎所有后续编码/computer-use harness 运行的底层循环，是整条主线的概念蓝图。
- **2023-03 · Reflexion（Shinn 等）** — 把失败轨迹用自然语言反思写进情景记忆，重试时变好，无需更新权重。SE agent 里「patch → test → 自我调试」回路的概念根。
- **2023-10 · SWE-bench（Jimenez、Yang 等，Princeton/UChicago）** — 2294 个真实 GitHub issue→PR 任务、Docker 沙箱单测验收。**在产品 agent 出现前，先立下「修真实仓库 issue」的硬基准**，把编码评测从「补全一个函数」升级为「解决真实工单」。这根北极星重新定义了之后每个 agent 追赶的目标。
- **2023-11 · GAIA（Mialon、Fourrier 等，Meta/HuggingFace）** — 466 道需要推理+多模态+工具+浏览的真实问题，人类 92% 而 GPT-4+插件仅 15%。后来 deep research 产品的事实标尺。
- **2024-03 · Devin（Cognition）+ OpenDevin（同日开工）** — Devin 自称「首个 AI 软件工程师」，用沙箱内 shell+编辑器+浏览器演示端到端自主，把 SWE-bench 从研究话题变成产品叙事；它的高调直接催生了同日开源的复刻 OpenDevin——**「炒作」与「开源回应」从一开始就共生**。
- **2024-04 · OSWorld（Xie 等）** — 首个可扩展的真实操作系统（Ubuntu/Windows/macOS）computer-use 基准，369 任务、执行式验收；人类 72.4% vs 最佳模型 12%，把 GUI grounding 的鸿沟摆上台面。
- **2024-05 · SWE-agent ACI（Yang 等，NeurIPS 2024）** — **harness 设计的里程碑**：给同一个模型配上专用的 Agent-Computer Interface，分数几乎翻倍。把「脚手架与模型同等重要」确立为全行业核心工程共识。
- **2024-07 · OpenHands（原 OpenDevin）+ Agentless（同月）** — 一边是通用 agent 平台（代码+CLI+浏览器），一边是「不要 agent」的极简固定流水线，恰好把核心争议结晶出来：到底需不需要自主 agent？
- **2024-10 · Anthropic Computer Use（Claude 3.5 Sonnet 公测）** — 首个能靠截图+像素坐标操作任意 GUI 的前沿模型，把 agent 从代码沙箱扩展到任何有屏幕的软件；但可靠性从发布第一天就被点名偏低。
- **2024-12 · Anthropic《Building Effective Agents》+ Google Gemini Deep Research** — Anthropic 把「workflow vs agent」的设计纪律写成行业最被引用的分类法；Google 发出首个主流消费级 deep research agent。agent 范式从编码外溢到知识工作。
- **2025-01 · OpenAI Operator / CUA** — 对标 Computer Use，OSWorld 刷到 SOTA 38.1%，却远低于人类 72.4%，公开了「能力 vs 宣传」的鸿沟，点燃 computer-use 成熟度之争。
- **2025-02 · 收敛之月** — OpenAI Deep Research（基于 o3）、Anthropic Claude Code 预览、GitHub Copilot Agent 模式同窗落地。每个实验室都在交 agent，「scaffolding 比模型更是产品」全面兑现。
- **2025-05 · Claude Code GA** → **2025-11 Claude Code 与 Cursor 各破 $10 亿 ARR** — 验证终端/CLI 是可持续的 agent 界面；agentic coding 成为首个被证明的 agent 商业模式。
- **2025-06 · Anthropic《How we built our multi-agent research system》vs Cognition《Don't Build Multi-Agents》（相隔一天）** — 两家前沿实验室在多智能体编排上给出**完全相反**的公开结论，成为这一话题的定义性辩论（参见 [[08]]）。
- **2025-07 · Manus《Context Engineering for AI Agents》+ OpenAI ChatGPT Agent** — Manus 交出以 KV-cache 命中率为核心的生产 playbook；OpenAI 把 Operator+Deep Research 合并为单一通用 agent，Operator 独立站下线，行业向「统一通用 agent」收敛（通用 agent 的身份/发现/协议基建参见 [[17]]）。
- **2025-09 / 11 · Anthropic《Writing effective tools》《Code execution with MCP》《Effective harnesses for long-running agents》** — 评测驱动的工具设计、按需加载工具定义省 token、initializer+coding-agent 的长任务 harness——工程焦点从「prompt」转向「接口与上下文预算」。
- **2025-10 · Karpathy「是 agent 的十年，不是元年」（Dwarkesh 播客）** — 经历 18 个月密集发布后的纠偏：模型仍缺记忆、持续学习、可靠多模态与 computer use，为 2026 定下清醒基调。
- **2025-12 · Menlo Ventures《2025 State of GenAI in Enterprise》** — 给「agent 元年」叙事补上一记市场体检：企业 GenAI 支出冲到约 $37B（2024 约 $11.5B，3.2x），但**仅约 16%** 的部署算得上真正的 agent——钱在涌入，真 agent 仍是少数（参见 [[11]]）。
- **2026 · Cognition《How Cognition uses Devin to build Devin》** — dogfooding 规模化：单周合入 659 个 Devin 撰写的 PR（2025 峰值 154）。agent 被接进 web/Slack/Linear/CLI/API，而非孤立的聊天框。
- **2026-02-23 · OpenAI 退役 SWE-bench Verified** — 编码 agent 的北极星基准被其主推方主动退役：前沿模型已能逐字复现 patch（污染），且约 60% 剩余失败题源于测试/题面缺陷。把「刷榜分 ≠ 真实能力」摆上台面——本章出现的 SWE-bench 数字（如 3.8%→12.5%、32%/26%）均为 2024 开源旧分，须据此读（参见 [[09]]）。
- **2026-03 · Anthropic《Harness design for long-running application development》** — 把长程开发 harness 推进到 GAN 式 generator-evaluator + context reset/结构化交接 + planner/generator/evaluator 三 agent 分工，是 2025 长任务 harness 的工程续篇（参见 [[02]][[08]]）。
- **2026-04 · Anthropic《Scaling Managed Agents: Decoupling brain from hands》** — brain/hands/session 三层解耦、凭证不入沙箱（vault+proxy），把 TTFT p50 约降 60%（p95 降逾 90%），标志 agent 从「能跑」走向「能规模化托管」（参见 [[11]][[12]]）。

---

## 4. 核心概念与原理

把所有大厂 agent 还原到最小公倍数，它们都是同一个循环 + 三个可变量。

### 4.1 公共骨架：Agent loop

```text
state = init(task, repo/screen/web)
while not done and steps < budget:
    obs      = perceive(state)          # 文件内容 / 截图 / 网页 / 工具返回
    thought  = LLM(history + obs)        # ReAct 的 "reason"
    action   = parse_action(thought)     # 选一个工具 + 参数
    result   = execute(action)           # 在沙箱/浏览器/OS 里真执行
    history  = compact(history + result) # 上下文工程发生在这里
    done     = verify(result)            # 单测 / 校验器 / 用户确认
return finalize(history)
```

这个骨架来自 **ReAct**。区别大厂系统的，是下面三个可变量。

### 4.2 可变量一：动作空间（action space）——三种主流抽象

| 抽象 | 代表 | 动作长什么样 |
|---|---|---|
| **ACI（专用工具面）** | SWE-agent | `open <file>`、`edit <range>`、`search_dir`、`run_tests`，带护栏与精简反馈 |
| **CodeAct（写代码即行动）** | OpenHands / smolagents | 直接生成可执行 Python，工具是函数调用，可组合、可自调试 |
| **截图+坐标（GUI）** | Anthropic Computer Use / OpenAI Operator | 读屏幕截图 → 输出 `click(x,y)` / `type(...)` / `scroll(...)` |

**关键洞察（SWE-agent）：接口是给模型用的，不是把人类 UI 端过来。** 人类用 `vim` 靠肌肉记忆滚屏；模型需要的是「一次给我刚好够的行、报错精简、改完立即反馈」。同一个 GPT-4，换上 ACI 分数几乎翻倍，证明瓶颈常在接口而非模型原始智商。CodeAct 进一步主张：与其让模型吐 JSON 工具调用，不如让它写代码——HuggingFace 实测 code agent 比结构化调用少约 30% 步数、组合性更好（参见 [[04]] code-as-action 争议）。

### 4.3 可变量二：上下文策略

- **仓库地图 + AST 检索**（AutoCodeRover）：用结构感知的 code-search API + 谱系故障定位，把「对的代码」喂给模型，而非塞整个仓库。
- **HTML 过滤**（Mind2Web）：用小模型先把网页裁剪到能进 context 的片段。
- **CLAUDE.md 记忆 + 隔离 subagent**（Claude Code）：项目级持久记忆自动加载，subagent 在独立 context window 跑，不污染主线。
- **上下文预算管理**（Anthropic long-running harness）：长任务拆 initializer + coding agent，用 JSON 特性清单、进度文件 + git 历史在 context window 间交接。
- **KV-cache 友好布局**（Manus）：prompt 前缀字节级稳定（不放时间戳）、永不中途改工具定义。

### 4.4 可变量三：评测基准（决定了路线）

```text
编码        → SWE-bench / Verified（人筛子集）/ Lite / Multimodal
computer-use→ OSWorld
Web 动作    → WebArena / Mind2Web
deep research→ GAIA / BrowseComp（短可验证答案）
```

评测不是事后打分，而是**前置的产品设计约束**——你优化什么基准，你的 harness 就长成什么样。

---

## 5. 主流方法谱系（横向对比）

**表 1 · 编码 agent**

| 系统 | 机构 | 动作空间 | 上下文策略 | 自主度 | 开/闭源 | 关键数字 |
|---|---|---|---|---|---|---|
| SWE-agent | Princeton NLP | ACI（edit/search/test） | 精简反馈+护栏 | 全自主 | 开源 | SWE-bench 3.8%→12.5% |
| Agentless | Xia 等 | 固定 localize→repair→validate | 层级定位 | **无 agent** | 开源 | 匹配复杂 agent，成本更低 |
| AutoCodeRover | Zhang 等 | 结构感知 search API | AST + 谱系定位 | 半自主 | 开源 | ~19% Lite，~$0.43/issue |
| OpenHands | All Hands AI | CodeAct（可执行 Python） | 沙箱运行时 | 全自主/multi-agent | 开源 | 通用平台基线 |
| Devin | Cognition | 沙箱 shell+编辑器+浏览器 | 单线程线性 + edit-apply | **全委派** | 闭源 | 659 PR/周（dogfood） |
| Cursor | Anysphere | IDE 内编辑 + Agent 模式 | 仓库检索 + shadow workspace | **HITL 增强** | 闭源 | $10 亿+ ARR |
| Claude Code | Anthropic | 终端低层工具 + subagent | CLAUDE.md + 隔离 context | HITL/可 headless | 闭源 | $10 亿 ARR |

**表 2 · computer-use & deep research agent**

| 系统 | 机构 | 动作空间 | 评测 | 工程主张 |
|---|---|---|---|---|
| Computer Use | Anthropic | 截图→像素点击 | OSWorld | 最大通用性，任意 app 无需集成 |
| Operator / CUA | OpenAI | vision+RL GUI | OSWorld 38.1% | 视觉+RL，分层 prompt-injection 防御 |
| Deep Research | OpenAI | o3 端到端 RL 浏览（2025-02 开路引擎） | GAIA / BrowseComp / HLE 26.6%（首发） | 单一 RL agent loop > 手搭编排 |
| Gemini Deep Research | Google | 异步 browse-refine | — | 计划交人审批，执行交自主 |
| Perplexity Deep Research | Perplexity | 数十次搜索 | HLE 21.1% | 速度/成本/免费 > 峰值精度 |
| Open Deep Research | HuggingFace | CodeAgent（写 Python） | GAIA ~54% | 几千行极简框架，code agent |
| Manus | Manus | 通用计算机 + 文件系统 | — | 上下文工程 > 更大模型 |

---

## 6. 主流观点与争议（≥2 组对立面）

**争议 1 · 编码到底需不需要自主 agent？**
- A 方（自主派，**Yang 等 / SWE-agent、OpenHands**）：让模型自己选工具、自己从错误里恢复，才能 scale 到脏乱的真实仓库。
- B 方（无 agent 派，**Xia 等 / Agentless**）：一个固定的 localize→repair→validate 流水线在 SWE-bench Lite 上能匹配甚至打败复杂 agent，成本更低、行为更可预测。
- 现状：两者都对一半——结构化任务固定流水线够用，开放/脏乱任务需要自主回路。

**争议 2 · 多智能体编排 vs 单线程线性 agent？（相隔一天的世纪对线）**
- A 方（**Anthropic**）：orchestrator-worker，lead agent 拆解任务并行 spawn subagent；内部研究评测**比 single-agent Opus 4 高 90.2%**、并行工具调用最多省 90% 墙钟时间——但烧约 15 倍 chat token，所以只该用在高价值、可并行、读多写少的任务。
- B 方（**Cognition / Walden Yan**）：别造 multi-agent。subagent 缺共享 context、会做出互相冲突的隐式决策；默认单线程线性 agent，要压上下文就用专门的模型压，而非 fan-out。
- 本质分歧很可能归约到任务类型：读多并行的研究偏 multi-agent，写多耦合的编码偏单线程（详见 [[08]]）。

**争议 3 · 像素/截图 GUI 控制 vs 结构化（DOM/无障碍树/API）控制？**
- A 方（**OSWorld / SeeClick / Anthropic·OpenAI computer use**）：视觉控制能泛化到任何人类能看见的 app，零集成。
- B 方（**WebArena / Mind2Web 路线**）：DOM/无障碍树/API 动作更可靠更便宜，但碰到没有干净结构的 app 就崩。

**争议 4 · 软件工程的未来是全委派还是 human-in-the-loop 增强？**
- A 方（自主/委派，**Cognition/Devin、GitHub Project Padawan**）：把人移出循环，issue 直接派给 agent。（注：Scott Wu 后来软化，称 HITL 是高风险生产的「永久要求」。）
- B 方（增强，**Anysphere/Cursor、Microsoft Copilot**）：差距不是技术 gap 而是 **context gap**——隐性知识在人脑里；Cursor 坚持 IDE 内 HITL 反而最快冲到 $10 亿+ ARR；Devin 早期实测被 The Register 批「自信地写错」。市场用脚投票更偏 HITL。（注：曾被视作独立 IDE-HITL 阵营的 Windsurf 已于 2025-07 被全委派派的 Cognition 收购，「委派 vs 增强」的阵营边界本身在松动。）

**争议 5 · 「2025 是 agent 元年」还是被高估、还需十年？**
- A 方（元年派，多数厂商/看涨 VC）：以 Cursor、Claude Code 各破 $10 亿 ARR 为证，拐点已至。
- B 方（长期派，**Andrej Karpathy**）：是「agent 的十年」，不是元年——缺记忆、持续学习、可靠多模态/computer use，过早造完整 agent 是错误。

---

## 7. 大厂工程实践（拆解工程取舍）

### 案例 A · Anthropic：Claude Code（终端原生的「反框架」harness）
- **取舍：低层 unix 哲学，而非 opinionated IDE。** 工具刻意做得低层、可脚本化（headless 模式可进 CI），换来组合性与自动化，代价是放弃 hand-holding 的图形界面。
- **上下文策略：** `CLAUDE.md` 作为自动加载的持久项目记忆；agentic 代码库搜索；**subagent 在隔离 context window 跑**，把脏活的中间产物挡在主线之外。工作流是 explore→plan→code→commit + TDD。
- **为什么成立：** 把 agent 当「带工具和记忆的初级工程师」来用——指令、记忆、可验证回路，比花哨 UI 更重要。

### 案例 B · Anthropic：multi-agent 研究系统（orchestrator-worker）
- **取舍：用 15 倍 token 换 90% 墙钟时间。** lead agent 把查询拆成子任务、并行 spawn subagent 做广度优先检索。只对高价值、可并行、读多写少的研究开放。
- **评测方法学：** 用 **end-state（终态）评估**而非逐步比对——因为 multi-agent 路径不可复现。
- **生产之痛：** statefulness——小改动会级联放大，所以重投可观测性与可恢复的错误恢复（呼应 [[10]]）。

### 案例 C · Anysphere：Cursor（fork VS Code 拿编辑器级权限）
- **取舍：承担 fork 维护负担，换插件 API 给不了的编辑器级访问。** 低延迟「Tab」推测补全（<1s，加密 context 片段）。
- **shadow workspace（影子工作区）：** 为了让 AI 拿到 LSP/lint 反馈又不动用户的文件，Cursor 在同一 workspace 里 spawn 一个**隐藏的 Electron 窗口**（独立 extension host，走 gRPC，约 15min 闲置自动关）。设计目标是「LSP 可用 + 可运行」同时不打扰用户编辑。还讨论了内核/FUSE 文件代理在 Linux 干净、却在 macOS/Windows 被挡的跨平台权衡。

### 案例 D · Cognition：Devin（刻意单线程 + edit-apply + 全 API）
- **架构取舍：刻意不做 multi-agent。** 单线程线性架构避免 subagent 冲突。
- **edit-apply 模型：** 大模型用 markdown 描述改动，小快模型重写整个文件——比逼大模型吐合法 diff 更可靠（对立面是 SWE-agent 式的结构化 patch，省一次模型调用）。
- **接入方式：** 暴露完整 REST API，session 可无人启动；被接进 web/Slack/Linear/CLI。dogfooding 到单周 659 PR——这些轨迹同时是把杠杆从 prompting 移向训练侧的数据金矿（参见 [[16]]）。

### 案例 E · OpenAI：Deep Research（端到端 RL single-agent loop）
- **取舍：押注「训练」而非「手搭编排」。** 一个用 RL 在真实浏览+推理任务上端到端训练的模型（2025-02 首发以 **o3** 为开路引擎，HLE 26.6%），自主规划、搜索、把数百来源综合成带引用的分析师级报告。o3 是当年的开路者；OpenAI 当代旗舰已迭代至 **GPT-5.5**（前代 GPT-5.4），deep research 类产品的底座随旗舰滚动升级。
- **对照 Gemini Deep Research：** Google 选「计划交人审批、执行交自主」——异步多分钟 browse-refine-synthesize 后导出 Google Doc。**同一品类，两种自主度哲学。**

### 案例 F · Manus：上下文工程即产品
- **取舍：性能来自上下文工程，不是更大模型。** KV-cache 命中率是头号生产指标（缓存/未缓存约 10 倍成本差）：prompt 前缀字节稳定、**用 logit masking 屏蔽工具而非中途删工具定义**、用文件系统当外置无限上下文、把失败留在 context 里让模型学。框架重写 4 次（「随机研究生下降」）。

---

## 8. 我的分析与判断

> **以下为分析观点（非事实陈述），是作者基于上述材料的独立研判，可证伪。**

**市场现实校准：先给「agent 元年」做一次体检。** 把三份独立的企业落地调研并排放，hype 与落地之间的落差是结构性的，不是个案——这也是下面三条研判共同的地基（**表中数字为引用事实，结论为个人研判**）。

**表 3 · 「部署 vs 落地」的三份体检（2025–2026）**

| 来源 | 已部署 / 投入面 | 真正落地 / 产出面 | 落差信号 |
|---|---|---|---|
| Menlo《2025 State of GenAI in Enterprise》 | 企业 GenAI 支出 ~**$37B**（2024 ~$11.5B，**3.2x**）；agent 平台 ~占横向类目 **10%**（~$750M） | **仅约 16%** 的部署算得上真正的 agent | 钱在涌入，真 agent 仍是少数 |
| McKinsey《Seizing the agentic AI advantage》（「gen AI 悖论」） | **约 80%** 企业已部署 gen AI | **>80%** 报告对 EBIT 无实质影响；**约 90%** 高价值/转型型用例仍卡在 pilot（是用例占比，**非采用率**）；**<10%** pilot 能规模化 | 部署 ≠ EBIT |
| Deloitte《Tech Trends 2026》（agentic AI strategy） | 14% 有可部署方案、38% 在 pilot、30% 仍在探索 | **仅 11%** 已投产 | 多数停在 pilot/探索 |

**读法：** 钱（支出 3.2x）和故事（"元年"）都已就位，但"产出"这一栏全线偏冷——真 agent 占比仅 16%（Menlo）、转型用例近九成卡在 pilot（McKinsey）、产线投产仅 11%（Deloitte）。本节前面那些破 $10 亿 ARR 的赢家（Cursor / Claude Code）是**已经穿过这道落差的少数**，不是行业平均；把它们当基准会系统性高估成熟度。这给 §6 争议 5（"元年 vs 十年"）补上市场侧证据：Karpathy 的"十年"判断与这组落地数字方向一致——拐点信号真实，但规模化兑现仍是少数派工程（参见 [[11]]）。

**研判一：「harness 红利」正在见顶，下一波分水岭在训练侧。** 2024 年 ACI 把分数翻倍，是因为前沿模型当时还在「会推理但不会用工具」的阶段，脚手架能捡走大量地上的钱。但 SWE-Gym 已经显示，训练 agent + 校验器 + 推理时扩展能把开源 SOTA 推得比纯 prompting 更远（**32%/26% Verified/Lite 系 2024 开源旧分**；到 2026 前沿系统的 SWE-bench 已抬到 70–80%+，且 SWE-bench Verified 已于 2026-02-23 被 OpenAI 退役，见 §3）。我的判断是：**2026 之后，纯靠 prompt/scaffolding 的边际收益会快速衰减，真正的护城河回到「能拿到轨迹数据做 RL」的那批公司**（agentic RL 训练的系统化框架参见 [[16]]）——这也是为什么 Cognition 拼命 dogfooding（659 PR/周不只是产能，更是轨迹金矿）。而握有数据与模型的这批公司已不止西方阵营：据报道，到 2026 H1，阿里 **Qwen3.7-Max**（号称自主千次工具调用、连续运行约 35 小时）、智谱 **GLM-5.1**、月之暗面 **Kimi K2.6** 等中国前沿模型也已挤进 agentic 第一梯队，开/闭源混合，是本节西方案例之外不应忽略的对照面（以上为 medium 置信、约 2026 上半年口径）。

**研判二：computer-use 是被产品营销透支最严重的品类。** 把厂商的 OSWorld SOTA（Operator 38.1%、后续前沿模型逐代抬升至六成档）和独立实测（多数部署真实任务完成率不到 40%）并排看，结论很清楚：**演示曲线陡，可靠性曲线平。** 加上 prompt injection 几乎是结构性弱点（截图里塞一行字就能劫持），我认为 computer-use 在 2026 仍然是「beta 心智」——能做受控的、可回滚的、低风险的桌面自动化，但别把它放进会花钱、会发邮件、会删数据的关键路径。

**研判三：增强派（HITL）会在「写多」垂直长期赢，委派派会在「读多」垂直先突破。** Cursor/Claude Code 在编码（写多、强耦合、错一行炸一片）赢，不是偶然——这类任务的 context gap 在人脑里，HITL 是必需而非过渡。反过来，deep research（读多、可并行、终态可验）天然适合更高自主度。Anthropic vs Cognition 的对线，我倾向于「不是架构信仰之争，是任务结构之差」。

**常见坑（按踩雷频率排序）：**
1. **拿 SWE-bench 分数当能力信号，忽略污染与过拟合。** PR 里可能泄漏解、harness 可能对基准过拟合、换语言/视觉就崩（SWE-bench Multimodal 上顶级系统集体跳水）。看分先问：Verified 还是全量？是否同分布？
2. **上来就 multi-agent。** 没有 end-state 评测和可观测性之前，multi-agent 只会把不可复现的失败放大 15 倍 token。
3. **中途改工具定义 / prompt 前缀不稳定**，直接打穿 KV-cache，成本 10 倍恶化还查不出来。
4. **把工具当人类 UI 端过来。** 返回 UUID 而非可读名字、一个动作要 5 次低层调用——模型会被淹死。

**最佳实践（我会照做的顺序）：**
- 先写评测、再写 agent（eval-driven），用 end-state 评估长任务；
- 默认单线程线性 + 固定流水线，只在证明任务可并行且读多时才上 multi-agent；
- 工具做「为模型设计」：少而高层、命名空间化、返回人类可读上下文、按需用 code-execution 加载定义（[[04]]）；
- 上下文优先级：稳定前缀 > 外置文件系统 > 隔离 subagent > 压缩 > 检索；
- computer-use 一律加 prompt-injection 分类器 + 人审高风险动作（[[12]]）。

---

## 9. 面试考点

**概念题**

1. **什么是 Agent-Computer Interface（ACI），为什么说它证明了「harness 与模型同等重要」？**
   要点：ACI 是为 LM「这类新用户」专门设计的工具面（受护栏的编辑、仓库导航、测试执行 + 精简反馈），不是把人类 UI 端过来。SWE-agent 在不改权重下把 SWE-bench pass@1 从 3.8%→12.5%，说明瓶颈常在接口而非模型原始能力。

2. **编码 agent 的三种动作空间抽象各是什么，优劣？**
   要点：ACI（专用工具，可控/护栏好）、CodeAct/写代码（可组合、少约 30% 步数、但要沙箱与不可信代码风险）、截图+坐标 GUI（最通用、但慢且不可靠、易受 prompt injection）。

3. **deep research 这一品类是怎么收敛出来的，评测用什么？**
   要点：从 GAIA（多模态+工具+浏览）到 BrowseComp（难找、短可验证答案）；OpenAI（o3 端到端 RL 单 loop）、Google（计划交人审批）、Perplexity（速度/成本）、HuggingFace（code agent 极简复刻 ~54% GAIA）四种路线。

4. **「评测污染」为什么是 SWE-bench 类基准的结构性隐忧？**
   要点：PR 里可能泄漏解、harness 对基准过拟合、弱泛化（换语言/视觉崩）；缓解靠 Verified 人筛子集、执行式验收、动态/live 基准。**实例：2026-02-23 OpenAI 主动退役 SWE-bench Verified——前沿模型已能逐字复现 patch（污染），且约 60% 剩余失败题源于测试/题面缺陷（参见 [[09]][[15]]）。**

**系统设计题**

5. **设计一个能在百万行真实仓库里解决 GitHub issue 的编码 agent，要求成本可控、行为可复现、能在 CI 里跑。**
   要点：(a) 上下文——AST/仓库地图 + 谱系故障定位做精准检索，别塞整库；(b) 动作空间——ACI（受护栏 edit/search/run_tests）或固定 localize→repair→validate 流水线（成本与可预测性更好）；(c) 验证——单测做终态判定，patch→test 回路 + 反思重试；(d) 成本——按 issue 计费、限步数预算、KV-cache 友好前缀；(e) 可复现——headless 模式 + 固定随机种子 + 轨迹日志（呼应 [[02]][[10]]）。

**手写题**

6. **手写一个最小 ReAct + 工具调用 harness 的伪代码，要求含停止条件、错误重试、上下文压缩。**
```python
def agent(task, tools, max_steps=30, max_retries=2):
    history = [system_prompt(tools), user(task)]
    for step in range(max_steps):
        thought = llm(history)                    # reason
        if is_final(thought):
            return extract_answer(thought)        # 停止条件 1
        action = parse_action(thought)            # {name, args}
        for attempt in range(max_retries+1):
            try:
                obs = tools[action.name](**action.args)  # act+observe
                break
            except ToolError as e:
                obs = f"ERROR: {e}; 请修正参数后重试"     # 错误反馈进 context
        history.append(assistant(thought)); history.append(tool(obs))
        if token_count(history) > BUDGET:
            history = compact(history)            # 上下文压缩/交接
    return "reached step limit"                   # 停止条件 2：防死循环
```

**陷阱题**

7. **「multi-agent 一定比 single-agent 强吗？」**
   陷阱：直接答「是」。正解：取决于任务结构。Anthropic 在读多并行的研究上 multi-agent +90.2%，但烧约 15 倍 token；Cognition 主张写多耦合任务用单线程线性，否则 subagent 做冲突的隐式决策。先问任务可并行性与读写比。

8. **「computer-use agent OSWorld 刷到 60%+ 了，是不是可以放进生产关键路径？」**
   陷阱：把厂商 benchmark 当生产可靠性。正解：人类约 72.4%，独立实测多数部署真实完成率 <40%，且普遍易受 prompt injection；生产前需加分类器防注入、人审高风险动作、可回滚沙箱。

9. **「为什么 Devin（全自主）没赢，Cursor（HITL）反而先破 $10 亿 ARR？」**
   陷阱：归因为技术不行。正解：差距是 context gap 不是 capability gap——隐性知识在人脑，编码是写多强耦合任务，HITL 是必需而非过渡；市场更买「增强」而非「委派」。

---

## 10. 参考文献

### 📄 论文

- ReAct: Synergizing Reasoning and Acting in Language Models — Yao 等, 2022. https://arxiv.org/abs/2210.03629 — 推理+行动交织，所有 agent harness 的底层循环。
- Reflexion: Language Agents with Verbal Reinforcement Learning — Shinn 等, 2023. https://arxiv.org/abs/2303.11366 — 用语言反思失败、写进情景记忆，self-debug 回路的概念根。
- Mind2Web: Towards a Generalist Agent for the Web — Deng 等, 2023. https://arxiv.org/abs/2306.06070 — 首个通用 web agent 基准，引入小模型 HTML 过滤。
- WebArena: A Realistic Web Environment for Building Autonomous Agents — Zhou 等, 2023. https://arxiv.org/abs/2307.13854 — 可复现自托管多站点环境 + 执行式功能正确性评测。
- SWE-bench: Can Language Models Resolve Real-World GitHub Issues? — Jimenez、Yang 等, 2023. https://arxiv.org/abs/2310.06770 — 2294 真实 issue→PR + 单测验收，编码 agent 的北极星基准。
- GAIA: a benchmark for General AI Assistants — Mialon、Fourrier 等, 2023. https://arxiv.org/abs/2311.12983 — 人类 92% vs GPT-4+插件 15%，deep research 的事实标尺。
- SeeClick: Harnessing GUI Grounding for Advanced Visual GUI Agents — Cheng 等, 2024. https://arxiv.org/abs/2401.10935 — GUI grounding 是截图 agent 的瓶颈，提出 ScreenSpot 基准。
- Executable Code Actions Elicit Better LLM Agents (CodeAct) — Wang 等, 2024. https://arxiv.org/abs/2402.01030 — 用可执行 Python 统一动作空间，OpenHands harness 的抽象基础。
- AutoCodeRover: Autonomous Program Improvement — Zhang 等, 2024. https://arxiv.org/abs/2404.05427 — AST 感知 code-search + 谱系故障定位，~19% Lite，~$0.43/issue。
- OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments — Xie 等, 2024. https://arxiv.org/abs/2404.07972 — 首个真实操作系统 computer-use 基准，人类 72.4% vs 模型 12%。
- SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering — Yang、Jimenez 等, 2024. https://arxiv.org/abs/2405.15793 — 提出 ACI，接口设计把 SWE-bench 翻倍，NeurIPS 2024。
- Agentless: Demystifying LLM-based Software Engineering Agents — Xia 等, 2024. https://arxiv.org/abs/2407.01489 — 固定三段式流水线匹配/超越复杂 agent，「还需要 agent 吗」的对照点。
- OpenHands: An Open Platform for AI Software Developers as Generalist Agents — Wang 等, 2024. https://arxiv.org/abs/2407.16741 — 开源通用开发 agent 平台，确立代码+CLI+浏览器动作空间。
- Large Language Model-Based Agents for Software Engineering: A Survey — Liu 等, 2024. https://arxiv.org/abs/2409.02977 — 系统综述 SE agent，规划/记忆/感知/行动分类。
- SWE-bench Multimodal: Do AI Systems Generalize to Visual Software Domains? — Yang 等, 2024. https://arxiv.org/abs/2410.03859 — 617 个视觉 JS bug 任务，顶级 Python 系统集体跳水，暴露泛化极限。
- Large Language Model-Brained GUI Agents: A Survey — Zhang 等, 2024. https://arxiv.org/abs/2411.18279 — computer-use/GUI agent 的综合分类法。
- Training Software Engineering Agents and Verifiers with SWE-Gym — Pan 等, 2024. https://arxiv.org/abs/2412.21139 — 首个 SE agent 训练环境 + 轨迹训练校验器，把杠杆从 prompting 移到训练。
- The AI Agent Index — Casper 等, 2025. https://arxiv.org/abs/2502.01635 — 记录 30 个已部署 agent 的设计/能力/评测/安全，闭源 agent 透明度最接近的学术来源。
- BrowseComp: A Simple Yet Challenging Benchmark for Browsing Agents — Wei 等 (OpenAI), 2025. https://arxiv.org/abs/2504.12516 — 1266 道难找、短可验证答案，deep research 专用评测。
- Deep Research: A Survey of Autonomous Research Agents — Zhang 等, 2025. https://arxiv.org/abs/2508.12752 — 综述 deep research 范式（规划/检索/工具/报告）与 RL 优化。

### ✍️ 博客与工程文

- Building Effective Agents — Anthropic, 2024. https://www.anthropic.com/engineering/building-effective-agents — 最被引用的 workflow vs agent 分类法，主张简单可组合模式优于重框架。
- Developing a computer use model — Anthropic, 2024. https://www.anthropic.com/research/developing-computer-use — Claude 如何学会读截图、数像素移动光标，computer-use harness 一手来源。
- Introducing computer use, Claude 3.5 Sonnet, and Haiku — Anthropic, 2024. https://www.anthropic.com/news/3-5-models-and-computer-use — 首个前沿模型公测屏幕操作，自承公测期可靠性有限。
- Initial explorations of Anthropic's new Computer Use — Simon Willison, 2024. https://simonwillison.net/2024/Oct/22/computer-use/ — 独立实测：惊艳但不稳，早点出可靠性与安全隐忧。
- How we built our multi-agent research system — Anthropic, 2025. https://www.anthropic.com/engineering/multi-agent-research-system — orchestrator-worker +90.2%、省 90% 时间但烧 15x token，end-state 评测。
- Don't Build Multi-Agents — Cognition (Walden Yan), 2025. https://cognition.ai/blog/dont-build-multi-agents — 与 Anthropic 相隔一天的对立面：默认单线程线性 agent。
- Claude Code: Best practices for agentic coding — Anthropic, 2025. https://www.anthropic.com/engineering/claude-code-best-practices — CLAUDE.md 记忆 + explore→plan→code→commit + headless，上下文 playbook。
- Effective harnesses for long-running agents — Anthropic, 2025. https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents — 长任务拆 initializer+coding agent，JSON 特性清单 + 进度文件交接。
- Writing effective tools for AI agents — Anthropic, 2025. https://www.anthropic.com/engineering/writing-tools-for-agents — 为模型而非人设计工具：合并、命名空间、可读返回、token 预算、eval 驱动。
- Code execution with MCP — Anthropic, 2025. https://www.anthropic.com/engineering/code-execution-with-mcp — agent 写代码按需加载工具定义，解决大 MCP 部署的工具膨胀。
- Context Engineering for AI Agents: Lessons from Building Manus — Yichao Ji (Manus), 2025. https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus — KV-cache 命中率头号指标、logit masking、文件系统当外置上下文。
- Introducing deep research — OpenAI, 2025. https://openai.com/index/introducing-deep-research/ — o3 端到端 RL 浏览，HLE 26.6%，押注 single-agent loop。
- Computer-Using Agent (CUA) — OpenAI, 2025. https://openai.com/index/computer-using-agent/ — Operator 的 vision+RL GUI agent 与分层 prompt-injection 防御。
- Introducing ChatGPT agent — OpenAI, 2025. https://openai.com/index/introducing-chatgpt-agent/ — 统一 Operator+Deep Research，标志向通用 agent 收敛。
- Try Deep Research in Gemini — Google, 2024. https://blog.google/products/gemini/google-gemini-deep-research/ — 首个主流消费级 deep research，计划交人审批、执行交自主。
- Introducing Perplexity Deep Research — Perplexity, 2025. https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research — HLE 21.1%，押注速度/成本/可及性而非峰值精度。
- Open-source DeepResearch — HuggingFace (smolagents), 2025. https://huggingface.co/blog/open-deep-research — ~24h 复刻、~54% GAIA，code agent 比 JSON 调用少约 30% 步数。
- Iterating with shadow workspaces — Cursor/Anysphere, 2024. https://cursor.com/blog/shadow-workspace — 隐藏 Electron 窗口给 AI LSP/lint 反馈而不动用户文件。
- The rise of 'context engineering' — Harrison Chase (LangChain), 2025. https://www.langchain.com/blog/the-rise-of-context-engineering — 多数 agent 失败是 context 失败，pro-framework 立场。
- How Cognition uses Devin to build Devin — Cognition, 2026. https://cognition.ai/blog/how-cognition-uses-devin-to-build-devin — 单周 659 PR dogfooding，Devin 暴露完整 REST API。
- Introducing Devin, the first AI software engineer — Cognition, 2024. https://cognition.ai/blog/introducing-devin — 端到端自主的产品叙事原点。
- Tool touted as 'first AI software engineer' is bad at its job — The Register, 2025. https://www.theregister.com/2025/01/23/ai_developer_devin_poor_reviews/ — 全自主路线质疑代表：实测 Devin 完成率低、「自信地写错」。
- I Tested Every Major Computer Use Agent in 2025 — Coasty, 2026. https://coasty.ai/blog/computer-use-agent-comparison-2025-20260406 — computer-use 怀疑派实测：多数真实完成率 <40%。

### 📚 官方文档 / 指南

- A practical guide to building agents — OpenAI, 2025. https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf — 34 页实践指南：manager vs handoff multi-agent 模式 + 分层 guardrails，配 Agents SDK。

### 🎥 Talk

- AGI is still a decade away（"decade of agents"）— Andrej Karpathy @ Dwarkesh 播客 / Simon Willison 摘录, 2025. https://simonwillison.net/2025/Oct/18/agi-is-still-a-decade-away/ — 对「agent 元年」的权威纠偏：缺记忆/持续学习/可靠多模态，需十年级工程。

### 📊 市场 / 行业调研

- The 2025 State of Generative AI in the Enterprise — Menlo Ventures, 2025. https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/ — 企业 GenAI 支出 ~$37B（3.2x）、agent 平台 ~占横向类目 10%、仅约 16% 部署算真 agent。
- Seizing the agentic AI advantage（「gen AI 悖论」）— McKinsey / QuantumBlack, 2025-06. — 约 80% 已部署但 >80% 对 EBIT 无实质影响、约 90% 转型型用例卡 pilot、<10% pilot 能规模化。
- Tech Trends 2026 · Agentic AI strategy — Deloitte, 2026. deloitte.com（tech-trends/2026/agentic-ai-strategy）— 仅 11% 已投产、14% 可部署、38% pilot、30% 探索。

---

> 交叉链接：推理范式 [[01]] · Harness 运行时 [[02]] · 上下文工程 [[03]] · 工具与 MCP [[04]] · 多智能体编排 [[08]] · 评估 [[09]] · 可观测性与调试 [[10]] · 生产与商业化 [[11]] · 安全与对抗 [[12]] · 技术栈速查 [[14]] · 面试题库 [[15]] · 训练与强化学习 [[16]] · 身份与协议 [[17]]
