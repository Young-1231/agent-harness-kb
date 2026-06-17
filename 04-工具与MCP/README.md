> 状态：🟢 已校验

# 04 · 工具与 MCP

> **定位**：Agent 的"手"——让非确定性的语言模型，可靠地驱动确定性的外部系统。本节讲透 function calling 的 schema 设计、好工具的工程原则、MCP（Model Context Protocol）的架构与生态，以及"工具过载"催生的代码执行新范式。
>
> 上游连 [[03]]（工具定义与中间结果都吃 token，是上下文预算的一部分）、[[02]]（工具调用在 harness 主循环里如何 emit→parse→execute→feedback）；下游连 [[09]]（工具调用怎么评测：BFCL/ToolBench 等基准）、[[11]]（生产化：高权限工具走 HITL、失败降级）、[[12]]（工具是 prompt injection 与 lethal trifecta 的主要攻击面）、[[08]]（multi-agent vs 单线程的工具编排之争）、[[13]]（Claude Code / Cursor / Devin 的工具集设计）、[[17]]（MCP/A2A 之上的 agent 身份、发现与协议互操作层）。

---

## 1. TL;DR / 速览

本节地图：**工具是什么 → 怎么声明（schema）→ 怎么设计好（原则）→ 怎么标准化（MCP）→ 规模化后的代价与解法（上下文膨胀 / 代码执行）→ 安全 → 争议 → 大厂实践**。

核心结论（先记住这 5 条）：

1. **工具调用 = 把"自然语言意图"稳定转成"结构化、可执行的动作"**。2023.06 OpenAI function calling 把它从 prompt 拼接技巧，变成了 JSON-Schema 驱动的 API 原语，成为各家事实标准。
2. **工具的"描述/schema"就是 prompt**。它被加载进模型上下文、直接操纵行为；Hsieh et al. (Google, 2023) 证明：**好的工具文档单独就能匹敌 few-shot 示例**。schema 设计 = 提示工程。
3. **MCP 把 M×N 集成爆炸降为 M+N**。它不是 function calling 的替代，而是建在其上的**协议/传输层**：标准化"工具如何被发现、跨应用复用"，并加入 resources / prompts 两类原语。代价是协议开销、延迟与新攻击面。
4. **工具一多就出事**：10+ 个工具就有"选择悖论"与工具幻觉，"启动即灌入全部 tool schema"是规模化下的**头号反模式**——几十个 MCP server 的定义预加载就先吃掉 5 万–15 万 token。三条结构性解法在 2025 年成型，共享"默认不加载、按需渐进披露"原则——**按需检索（Tool Search Tool，`defer_loading`，最多约 1 万工具）/ 代码执行（Code execution / Cloudflare Code Mode，可把 117 万 token 压到 ~1000）/ 渐进披露技能（Agent Skills，`SKILL.md` 三级披露）**。
5. **安全是从"能用"到"敢在生产用"的卡点**：tool poisoning（恶意指令藏在工具描述里、用户不可见）+ prompt injection 凑齐"lethal trifecta"，至今无根本解；治理手段（OAuth 2.1、网关、官方 Registry、基金会中立治理）在快速补齐。2025-12 MCP 已捐给 Linux Foundation 旗下 Agentic AI Foundation。

---

## 2. 定位与动机

**解决什么问题？** 参数化的 LLM 有三个天生短板：(a) 知识有截止日期、会过时；(b) 不能做精确计算、不能保证算对；(c) 无法对真实世界产生副作用（发邮件、改数据库、跑代码）。工具（tool / function）就是把这三类能力"外接"给模型——模型负责**决策与编排**，确定性系统负责**精确执行**。这正是 MRKL（AI21, 2022）提出的核心洞见：LLM 应当是一个**路由器**，把任务委派给离散的专家模块，而非把一切都背进参数里。

**在 Agent 链路中的位置。** 回看根 README 的全景图：用户输入 → Harness 组装上下文 → **LLM 推理（决定输出文本 or 调用工具）** → 若是 tool call，则 Harness 解析 → 权限校验 → 沙箱执行 → 结果回灌上下文 → 回到推理循环。本节聚焦的就是这条回路里"工具"这一格：

- 工具的**契约**（schema/描述）在"组装上下文"阶段被注入——这是与 [[03]] 上下文工程的交界；
- 工具的**调用机制**（emit→parse→execute→feedback、错误重试、停止条件）在 harness 主循环里——细节见 [[02]]；
- 工具的**推理范式**（Think–Act–Observe 交错）来自 ReAct——见 [[01]]。

一句话定位：**如果说 [[01]] 是 Agent 的"脑"、[[02]] 是"神经系统"，那本节就是 Agent 的"手"——以及让千万只手能被同一个脑安全复用的"标准接口"。**

---

## 3. 历史发展脉络（时间线）

> 主线：**"能不能用工具"（2021–2023 研究）→ "怎么稳定调一个工具"（2023 function calling）→ "怎么接成百上千个工具"（2024 MCP）→ "工具太多怎么办"（2025 检索/代码执行）→ "怎么安全、谁来治理"（2025 安全清算 + 基金会中立化）**。

| 年份 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **2021-12** | **WebGPT**（OpenAI） | 第一次高调证明：给 LLM 一个真实浏览器工具 + 人类反馈训练，能修复参数模型修不了的事实性。工具增强的概念种子。 |
| **2022-05** | **MRKL Systems**（AI21） | 提出"LLM 路由到离散专家/工具模块"的蓝图，是工具增强与 agent 路由的思想祖先。 |
| **2022-10** | **ReAct**（Yao et al., Princeton/Google） | 确立 Thought→Act→Observe 交错范式——几乎所有工具型 agent 的控制循环源头。把"工具使用"从工程 trick 抬升为可学习能力。 |
| **2023-02** | **Toolformer**（Meta） | 自监督让模型自己学"何时/调哪个/带什么参数/结果怎么接回去"，工具使用可被模型自学的奠基作。 |
| **2023-03** | **ChatGPT Plugins**（OpenAI） | 第一个面向大众的工具接口，验证了巨大需求；但每个插件是一次性定制、审核制、同时只能开 3 个，**暴露了 N×M 集成难题**，为标准化埋下动机。 |
| **2023-06** | **OpenAI function calling**（gpt-3.5/4-0613） | 把工具调用从 prompt 拼接变成结构化 API 原语：开发者用 JSON Schema 声明函数，模型返回带类型的参数对象。被 Anthropic tool use、Gemini 迅速复刻，成为事实底座。**但它只解决"怎么调一个工具"，不解决"怎么发现/接入上千个"。** |
| **2023-07** | **ToolLLM / ToolBench**（OpenBMB/THU） | 把工具规模推到 16k+ 真实 RapidAPI 端点，开源数据集 + 检索器 + DFSDT 决策树搜索，缩小开源与闭源的工具使用差距；同时系统暴露工具检索与多步调用的难度。 |
| **2023** | **Gorilla、API-Bank、Chameleon、ToolkenGPT + 首篇 Tool-Learning 综述** | benchmark、检索感知调用、组合式工具程序、统一综述集中爆发——工具学习固化为一个公认子领域。 |
| **2024-02** | **CodeAct**（Wang et al.） | 证明"用可执行代码作为统一动作空间"在组合性/对象管理/通用性上优于 JSON 工具字典，成为 code-as-action 路线的理论依据。 |
| **2024-11-25** | **Anthropic 开源 MCP**（spec 2024-11-05） | 作者 David Soria Parra 与 Justin Spahr-Summers 用一套 client-host-server 协议替代 N×M 一次性集成（"AI 的 USB-C"）。首批落地 Block、Apollo + 开发工具 Zed/Replit/Codeium/Sourcegraph。 |
| **2024-12** | **HuggingFace smolagents** | 把"让模型写 Python 代码当动作"做成默认范式（引用 CodeAct），推动 code agent 工程化。 |
| **2025-03 / 04** | **OpenAI（Altman）与 Google DeepMind（Hassabis）相继支持 MCP** | 标准胜负取决于网络效应：连最大竞争对手都接入，MCP 才从"某厂规范"变"跨厂商默认"。Responses API 加入远程 MCP，OpenAI 进入 MCP 指导委员会。 |
| **2025-04** | **安全清算：Invariant Labs 披露 Tool Poisoning，Simon Willison 放大风险** | 采用速度远超安全模型成熟度。恶意 MCP server 可把指令藏进工具描述（模型可见、用户不可见），配合 prompt injection 静默窃取数据。安全成为生产化卡点。 |
| **2025-09-08** | **MCP 官方 Registry（社区目录）预览上线** | server 数冲到上万，"发现哪个能用、哪个可信"成新瓶颈。Registry 由 Anthropic、GitHub、PulseMCP、Microsoft 共建，是从"野蛮生长"转向"可发现、可治理"的一步。 |
| **2025-09** | **Anthropic《Writing effective tools for AI agents》** | 把工具设计沉淀为可操作原则：少而精、命名空间、返回高信号上下文、token 预算、eval 驱动迭代。 |
| **2025-10** | **OpenAI DevDay：Apps SDK 与 AgentKit，均基于 MCP** | MCP 从"连数据源"升级为"在 ChatGPT 内分发应用"的平台层，标准外溢到产品生态。 |
| **2025-11** | **Anthropic《Code execution with MCP》+《Advanced tool use》(Tool Search / Programmatic Tool Calling)；Cloudflare 推 Code Mode** | 解决工具规模化后的上下文爆炸：渐进式工具发现 + 代码执行，把 15 万 token 工作流压到 ~2K（-98.7%）；Cloudflare 把 2500+ 端点从 ~117 万 token 压到 ~1000。 |
| **2025-12-09** | **MCP 捐给 Agentic AI Foundation（Linux Foundation 旗下）** | AWS、Anthropic、Block、Bloomberg、Cloudflare、Google、Microsoft、OpenAI 八家为白金成员；同批捐入的还有 Block 的 goose 与 OpenAI 的 AGENTS.md。MCP 不再是"Anthropic 的协议"——用厂商中立基金会锁定其行业级标准地位。 |
| **2026-03-09** | **The 2026 MCP Roadmap** | 协议进入"工程治理期"：四优先级——无状态 Streamable HTTP（去会话耦合、可水平扩展）/ Agent 通信的 Tasks 原语 / 治理成熟化 / 企业就绪。MCP 已是事实标准，重心从"抢地盘"转向"可运维、可合规、能进企业"。 |
| **2026-04-09** | **A2A 协议一周年（Linux Foundation）** | 150+ 组织、v1.0 首个稳定规范、三云生产（Azure / AWS Bedrock AgentCore / Google Cloud）。Agent↔Agent 通信标准与 MCP（Agent↔工具）形成互补分层，标准化从"工具接入"扩到"agent 互联"（再上一层的 agent 身份/发现/信任见 [[17]]）。 |

---

## 4. 核心概念与原理

### 4.1 工具 schema 设计：声明即提示

一个工具在 API 层就是一段**带类型的 JSON Schema**：`name` + `description` + 每个参数的 `type` / `description` / `required` vs optional / `enum`。MCP 的工具同样是 `name` + `description` + `inputSchema`。

```jsonc
// OpenAI function calling / Anthropic tool use 的工具声明（简化）
{
  "name": "asana_search_tasks",
  "description": "在 Asana 中按关键词搜索任务。返回任务标题、负责人、到期日；不返回内部 UUID。",
  "input_schema": {
    "type": "object",
    "properties": {
      "query":     { "type": "string", "description": "搜索关键词" },
      "project_id":{ "type": "string", "description": "限定项目（可选）" },
      "status":    { "type": "string", "enum": ["open", "completed", "all"], "default": "open" },
      "limit":     { "type": "integer", "description": "返回上限，默认 20", "default": 20 }
    },
    "required": ["query"]
  }
}
```

关键认知：**这段 schema 不是给程序读的，首先是给模型读的**。`description`、参数名、`enum` 全部进入上下文，直接决定模型选不选这个工具、怎么填参数。这就是为什么 Hsieh et al.（Google, 2023）的结论如此重要——**高质量工具文档单独就能匹敌 few-shot 示例**：与其塞示范对话，不如把描述写清楚。这也是 OpenAI 2023.06 function calling 正式确立"JSON-Schema 参数"模式的意义所在。

工具调用的完整闭环（与 [[02]] harness 主循环呼应）：

```
模型 emit 一个 tool_call（name + arguments JSON）
  → harness parse & 校验参数（类型、必填、权限）
  → 沙箱执行工具
  → 把结果（或错误）作为 tool_result 回灌上下文
  → 模型基于观察继续推理（Observe → Think）
  → 直到完成 / 触达停止条件 / 预算耗尽
```

一次返回**零个 / 一个 / 多个** tool_call 都要能处理（并行函数调用，见 §5）。工具失败时，**把错误原文回喂给模型**让它自纠，是 OpenAI 官方文档明确推荐的做法。

### 4.2 好工具的工程原则（Anthropic 五原则）

Anthropic《Writing effective tools for AI agents》把经验沉淀成 5 条，核心框架是一句话：**工具是确定性系统与非确定性 agent 之间的契约（contract）**。

1. **建高杠杆工具，而非 1:1 薄包装**。别把每个 REST 端点都包成一个工具；把多步操作合并成"贴近用户任务"的少数工具（如 `schedule_meeting` 而不是 `list_calendars`+`check_availability`+`create_event` 三件套）。
2. **命名空间（namespacing）**。用一致前缀划清边界：`asana_search`、`asana_create`、`gdrive_search`。让模型一眼看出工具归属，减少跨服务误用。
3. **返回有意义、token-高效的上下文**。返回"标题/负责人/到期日"这类语义信息，而不是 UUID；用分页、截断、默认值控 token。**工具的返回值也是上下文预算的一部分**（[[03]]）。
4. **像写 prompt 一样打磨工具描述**。命名要贴合用户对任务的心智；错误信息要是**可操作的自然语言**（"日期格式应为 YYYY-MM-DD，你传的是 06/13/2026"），好让非确定性的 agent 能自我纠正。
5. **eval 驱动、与模型协作迭代**。用真实多步任务做评测，甚至**让 Claude 自己跑工具**来发现哪些描述会误导它，再改工具。

补两个常被忽略的隐性契约：**幂等性 / 重试安全**（agent 会重试，`create_payment` 若非幂等会重复扣款）；**执行语义清晰**（有无副作用、是否有状态）。这些在规范里大多是"非正式约定"，却是可靠性的命门（见 §8）。

### 4.3 MCP 架构：client / host / server / transport

MCP 是建在 JSON-RPC 2.0 之上、**有状态会话 + 能力协商（capability negotiation）** 的 client-host-server 设计：

```
        ┌─────────────────────────── HOST（如 Claude Desktop / Cursor / IDE）──────────────────────────┐
        │  容器 & 协调者：集成 LLM（sampling）、强制用户授权与安全边界、为每个 server 派生一个 client    │
        │                                                                                             │
        │   ┌── CLIENT A ──┐        ┌── CLIENT B ──┐        ┌── CLIENT C ──┐                            │
        │   │ 1:1 隔离会话 │        │ 1:1 隔离会话 │        │ 1:1 隔离会话 │                            │
        │   └──────┬───────┘        └──────┬───────┘        └──────┬───────┘                            │
        └──────────┼───────────────────────┼───────────────────────┼────────────────────────────────────┘
                   │ JSON-RPC              │ JSON-RPC              │ JSON-RPC
            ┌──────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐
            │  SERVER 1   │         │  SERVER 2   │         │  SERVER 3   │
            │ GitHub      │         │ Postgres    │         │ Slack       │
            │ tools/      │         │ resources/  │         │ prompts/    │
            │ resources/  │         │ ...         │         │ ...         │
            │ prompts/    │         └─────────────┘         └─────────────┘
            └─────────────┘
```

三个角色：

- **HOST**：容器/协调者。负责启动 client、整合 LLM（含 sampling——server 可反向请求模型生成）、**强制用户同意与安全边界**。
- **CLIENT**：每个 server 一个、彼此隔离的 1:1 会话，双向路由消息。
- **SERVER**：暴露三类 MCP 原语——**Tools（模型可调用的函数）/ Resources（可读的上下文数据，如文件、记录）/ Prompts（预制提示模板）**；可本地或远程运行。

**传输层（transport）**：本地用 **stdio**，远程用 **Streamable HTTP**（2025-03 spec 取代了旧的 HTTP+SSE）。

**关键安全不变量**：一个 server **看不到完整对话、也看不到其它 server**——隔离是协议级设计，而非可选项。

### 4.4 MCP vs 纯 function calling：到底谁是谁

这是本节最常被问混的点，记住分层：

- **function calling 是模型能力（capability）**：模型针对"应用自己定义并执行"的函数，吐出结构化参数对象。每个应用各写一遍集成 → **M×N 问题**（M 个模型客户端 × N 个工具）。
- **MCP 是建在该能力之上的协议/传输层（protocol）**：标准化"工具如何被**动态发现**（list/能力协商）、如何**跨应用与客户端复用**"，并把范畴从"只有 tools"扩到 resources + prompts。一次写 server，处处可用 → **M+N**。

取舍一句话：**MCP 用协议开销/延迟 + 新攻击面（tool poisoning / rug-pull），换来互操作、复用与组合性。** 对单个自包含应用，原生 function calling 往往更简单——MCPGauge（《Help or Hurdle?》, 2025）实测发现 MCP 集成**并不总能提升任务表现**。

### 4.5 工具过载与上下文膨胀（2025 的核心痛点）

> 🚫 **反模式（明确标注）**：**「启动即把全部 tool schema 灌进上下文」是规模化下的头号反模式。** 接十几个 server 就先吃掉 5 万–15 万 token，用户还没开口预算已去大半；工具一多还叠加"选择悖论"与工具幻觉。三条结构性解法共享同一个原则——**默认不加载，按相关性逐级展开（渐进披露）**：

- **① 按需检索 / 渐进式发现**：Tool Search Tool（Anthropic《Advanced tool use》, 2025-11）、RAG-MCP——把工具用 `defer_loading:true` 标记，启动时不灌定义，靠 regex/BM25 变体按需检索、每次只返回 3–5 个 `tool_reference` 再展开。Anthropic 实测 token -85%（~77K→8.7K），准确率反升（当时旗舰 Opus 4.5：79.5%→88.1%；Opus 4：49%→74%），**最多可挂约 1 万个工具**。
- **② 代码执行 / Code-as-action**：把 MCP server 暴露成文件系统里的代码 API，让擅长写代码的模型**写代码来 import 并编排工具**，在沙箱里就地过滤中间结果、只回传精炼数据。Anthropic 的 Google Drive→Salesforce 工作流从 ~150K token 降到 ~2K（-98.7%）；Cloudflare Code Mode 用 V8 isolate，把 2500+ 端点 ~117 万 token 压到 ~1000（-99.9%）。
- **③ 渐进披露技能 / Agent Skills**：把工具 + 指令 + 资源打包成含 `SKILL.md` 的文件夹，模型先读元数据、相关时才展开完整指令与支撑文件（详见 §4.6）。

> 直觉：**当工具数从"几个"涨到"上百个"，"把工具当成一个个直接调用"这个前提本身就该被质疑了。** 这是 §6 争议二的核心战场。

### 4.6 Agent Skills：渐进披露作为"第三条路"

如果说 Tool Search 解决"工具定义太多"、代码执行解决"中间结果太多"，**Agent Skills（Anthropic，2025-10-16）解决的是"指令与领域知识太多"**——它把完成某类任务所需的**指令、脚本、模板、参考文档**一起打包成一个**含 `SKILL.md` 的文件夹**，让模型按需动态加载，而不是把所有可能用到的说明都常驻系统提示里。

核心机制是 **progressive disclosure（渐进披露）三级**，逐级只在"确实需要"时才花 token：

1. **元数据（metadata）**：启动时模型只看到每个技能 `SKILL.md` 顶部的名称 + 简短描述（几十 token 级），用来判断"有没有这个能力、什么时候该用"；
2. **完整指令**：模型判定某技能相关后，才把该 `SKILL.md` 的正文完整读进上下文；
3. **支撑文件**：执行中需要时，再按需读取技能目录下的脚本 / 模板 / 数据等附加文件。

这与 §4.5 的另两条解法是**同一思想在不同层面的投影**——默认不加载、按相关性逐级展开。2025-12-18 Anthropic 追加了**组织级技能管理与技能目录**，并把 Skills 作为**开放标准**发布，使技能从单机配置走向团队 / 组织共享（与 [[13]] 的 Claude Code 工具与技能实践直接相关）。

> 一句话：**Tool Search 给"工具"做渐进披露，Agent Skills 给"知识与流程"做渐进披露，代码执行给"数据"做渐进披露——三者正交、可叠用。**

---

## 5. 主流方法谱系（横向对比）

> 系统性纵览可参《The Evolution of Tool Use in LLM Agents: From Single-Tool Call to Multi-Tool Orchestration》（2026, [arXiv:2603.22862](https://arxiv.org/abs/2603.22862)）——从单工具调用到多工具编排的演进综述，按推理期规划 / 训练 / 安全 / 效率维度组织，正好可作本节 §4–§5 方法谱系与规模化解法的纵览索引。

### 5.1 动作表示：JSON 工具调用 vs 代码即动作

| 维度 | JSON function calling | Code-as-action（CodeAct / smolagents / Code Mode） |
|---|---|---|
| 动作形态 | 模型吐结构化 JSON 参数 | 模型写并执行代码（Python/TS） |
| 组合性 | 弱：多工具需多轮往返 | 强：一段代码内编排、循环、条件 |
| 步数 | 多 | 少（smolagents 口径约少 ~30% 步数） |
| token 效率 | 中间结果全进上下文 | 在执行环境就地过滤，只回精炼结果 |
| 可移植 / 护栏 | 高，易审计、易加 schema 校验 | 需沙箱（E2B/Docker/Modal/V8 isolate）隔离 |
| 调试 | 直观（每步可见） | 较难（代码黑盒 + 沙箱运维） |
| 代表 | OpenAI / Google / Anthropic 默认 | HuggingFace smolagents、Anthropic Code execution、Cloudflare Code Mode |

### 5.2 工具学习训练范式

| 范式 | 代表工作 | 是否训练 | 核心思想 | 适用 |
|---|---|---|---|---|
| 纯 prompt + 文档 | ReAct / ART / Tool Documentation | 否（frozen） | 好文档≈few-shot；交错推理与行动 | 工具少、文档好 |
| 自监督学工具 | Toolformer | 是 | 模型自己在文本里插 API 调用 | 通用工具能力内化 |
| 检索感知微调 | Gorilla / ToolLLM | 是 | API 文档接地 + 检索，降幻觉 | 上千 API、文档会变 |
| 工具嵌入 | ToolkenGPT | 部分 | 每个工具 = 一个 "toolken" 嵌入，frozen LLM 插大量工具 | 海量工具免微调 |
| RL 奖励设计 | ToolRL | 是（RL/GRPO） | 把奖励拆成 tool-name/param-name/param-value 匹配，泛化优于 SFT | SFT 过拟合时 |

### 5.3 工具规模化解法

| 解法 | 代表 | 机制 | token 收益 | 代价 |
|---|---|---|---|---|
| 全量预加载（**反模式**） | 传统 all-tools-in-context | 一次塞全部定义 | 0（基线） | 工具一多即爆 |
| 按需检索 | Tool Search（`defer_loading`） / RAG-MCP | 检索后再加载工具定义 | -85% 量级（~77K→8.7K） | 多一次检索往返延迟 |
| 渐进披露技能 | Agent Skills（`SKILL.md`） | 三级披露：元数据→完整指令→支撑文件 | 启动近零，按需展开 | 需技能编写规范与目录治理 |
| 代码执行 | Code execution with MCP / Code Mode | 工具→代码 API，模型写代码编排 | -98%~99.9% | 沙箱运维 + 安全成本 |
| 程序化调用 | Programmatic Tool Calling | 代码内编排多工具，省推理往返 | 复杂任务 -37%，省 19+ 次往返 | 实现复杂度 |

### 5.4 评测基准

| 基准 | 机构/年份 | 特点 |
|---|---|---|
| API-Bank | 2023 | 73 API / 314 对话，早期可运行工具评测 |
| ToolBench | OpenBMB 2023 | 16k+ 真实 API，规模化但 live API 不稳定 |
| StableToolBench | THUNLP 2024 | 缓存 + LLM 模拟虚拟 API server，可复现 |
| BFCL | UC Berkeley 2025 | AST 评测 single/parallel/multi-turn，扩到 agentic；事实标准 |
| MCP-Bench | 2025 | 28 个 live MCP server / 250 工具，测跨工具协同 |
| MCPGauge | 2025 | 沿 proactivity/compliance/effectiveness/overhead 四维探 MCP |

> 并行 vs 组合调用（Gemini 官方文档）：**并行**（互不依赖的函数一轮并发、用 id 回映、无需保序）vs **组合**（前一函数输出作后一函数输入）——这是 function calling 自身的能力分层，与上面的规模化解法正交。

---

## 6. 主流观点与争议

### 争议一：MCP 到底有没有必要——新基础设施，还是被炒作的"API 套壳"？

> 📦 **结案框**
> - **提出（2024-11）** → MCP 开源后，"要不要上 MCP / 是不是 API 套壳"成为持续约一年的争论。
> - **2026 定论** → MCP 已是跨厂商**事实标准**（2025-12 入 Linux Foundation、2026-03 Roadmap 进入"治理成熟 + 企业就绪"、A2A 一周年 150+ 组织三云生产）。
> - **现状** → 真问题从"要不要上"转向**协议级安全（tool poisoning / lethal trifecta，见争议五）+ token 效率（上下文膨胀，见 §4.5）**；怀疑/拥护两派论点仍各自成立，争点变为"怎么上得好"（深入研判见 §8）。

- **怀疑派**（Armin Ronacher《Your MCP Doesn't Need 30 Tools: It Needs Code》、Tyk、Nordic APIs、部分一线工程师）：多数场景下 MCP 只是 REST API 上的一层开销；工具**不可组合**（组合都靠模型推理）、每次调用都吃大量上下文；"我们还没有通用 agent，只有 app 专属工作流"，MCP 在解决一个尚不存在的问题。MCPGauge 实证支持：MCP 不总能提升表现。
- **拥护派**（Anthropic、Speakeasy《Common Criticisms of MCP》、The New Stack）：MCP 解决的是 **N×M 一次性集成的组合爆炸**，设计前提是"模型如何发现、推理、安全使用工具"，不是"人如何集成系统"。**用 API 时代的预期评估它显得冗余，用 AI 时代约束评估它近乎必然**；很多反对其实在骂"ChatGPT 应用商店式实现"，而非协议本身。OpenAI/Google/Microsoft 的收敛是网络效应的胜利证据。

> 我的取向（详见 §8）：单 app 用原生 function calling；要跨团队/跨产品复用工具、或要让外部生态接入，MCP 的 M+N 才回本。

### 争议二：工具过载的正解是"按需检索"还是"让模型写代码"？

- **检索/工具搜索派**（AWS 语义工具选择、WRITER、Epsilla、RAG-MCP 作者、Anthropic Tool Search Tool）：工具到 10+ 就有"选择悖论"与工具幻觉；解法是动态发现/按需加载，token 降 ~85%、选择准确率从 ~49% 升到 ~74%。
- **代码执行派**（Anthropic《Code execution with MCP》、Cloudflare Code Mode 的 Kenton Varda/Sunil Pai、转向 Skills 的 Armin Ronacher）：别再把工具当一个个直接调用，把 server 暴露成代码 API、让模型写代码编排。Anthropic 把 15 万 token 降到 ~2K，Cloudflare 把 2500+ 端点压到 ~1000。**检索只是缓解，代码执行才是结构性转变。**

### 争议三：教模型用工具，SFT 还是 RL？

- **SFT 派**（OpenBMB ToolBench/ToolLLM）：在工具调用轨迹上做监督微调是成熟配方。
- **RL 派**（Qian et al.《ToolRL》, NeurIPS 2025）：SFT 易过拟合、难泛化到陌生/复杂工具；把奖励**拆解**为 tool-name/param-name/param-value 匹配的 RL（GRPO）泛化更好（较 base +17%、较 SFT +15%）。

### 争议四：frozen LLM + 好文档，还是为工具微调？

- **微调派**（Schick/Patil/Qin：Toolformer、Gorilla、ToolLLM）：把工具能力烤进模型、扩到上千 API。
- **文档派**（Hsieh et al.：Tool Documentation；ReAct；ART）：frozen LLM + 高质量 schema/文档即可匹敌 few-shot，无需训练。

### 争议五：MCP 安全是协议级根本缺陷，还是可治理的实现问题？

- **警示派**（Invariant Labs 的 Beurer-Kellner & Fischer、Simon Willison、Cloud Security Alliance、MCPTox 作者）：MCP 把"不可信内容 + 工具访问 + 外泄通道"凑成 **lethal trifecta**；tool poisoning 让恶意 server 把指令藏进工具描述（用户不可见）即可静默窃密，prompt injection 至今无根本解，自动授权工具调用本质危险。MCPTox 用 45 个真实 server / 353 工具 / 20 个 agent 把它量化成基准。
- **可治理派**（MCP spec 维护者、MintMCP/MCP Manager 等网关厂商）：安全是实现与运营层问题，可用 OAuth 2.1（2025 spec 引入）、MCP 网关/代理、工具签名、官方 Registry 信任与企业管控收敛；不应因早期实现裸奔就否定协议。

> 延伸到 [[08]] 的经典对照：**Cognition《Don't Build Multi-Agents》（单线程 + 上下文工程更可靠）vs Anthropic multi-agent 研究系统**——并行 subagent 因彼此看不到对方上下文而脆弱、决策冲突。这场"隔日互怼"本质也是工具/上下文编排哲学之争。

---

## 7. 大厂工程实践

### 案例 A：OpenAI——从 function calling 到全面拥抱对手的 MCP

2023.06 OpenAI 用 function calling（gpt-3.5/4-0613）把 JSON-Schema 工具调用产品化，**一手把工具使用从研究变成主流开发实践**——这是它定义标准的时刻。但 2025.03 起，OpenAI 反过来**采纳竞品 Anthropic 发起的 MCP**：Responses API 支持远程 MCP server（Streamable HTTP/SSE），几行代码接任意 MCP 工具；并加入 MCP 指导委员会；2025.10 DevDay 的 Apps SDK 与 AgentKit 都建在 MCP 上（合作伙伴含 Booking/Canva/Figma/Spotify）。
**工程取舍**：放弃对协议演进的完全掌控，换生态网络效应与开发者速度。当你判断"标准会赢"，加入比另起炉灶更划算——这是平台战略而非纯技术决定。

### 案例 B：Anthropic——既造标准，又造"标准的解药"

Anthropic 是 MCP 的发起者与参考实现（2024.11 开源 + 预制 server + Python/TS SDK），但更值得学的是它**自曝并修复 MCP 的代价**：

- 公开承认 MCP 的"上下文膨胀"——接十几个 server 就吃掉数万 token；
- 给出两套生产解法（Tool Search Tool：token -85%、准确率升；Programmatic Tool Calling：复杂任务 token -37%、省 19+ 次推理往返；Tool Use Examples：参数处理 72%→90%）；
- 同时 Claude Code 的工具集刻意做成 **low-level、unopinionated 的"最薄包装"**——暴露接近原始模型能力的 Bash/Read/Edit/Grep/Write + subagent，奉行 do-the-simple-thing-first，把可控性/可脚本化/安全留给用户（见 [[13]]）。
**工程取舍**：通用原子工具的灵活性 vs 高层封装的开箱即用——Anthropic 在自家产品里选了前者，又用 Tool Search/代码执行去补"工具一多就爆"的洞。

### 案例 C：Cloudflare Code Mode——工具过载的极致工程化反方案

把 MCP 工具转成 **TypeScript API、在 V8 isolate 沙箱执行**模型写的代码。isolate 比容器轻得多、毫秒级启动，可为每段代码新建隔离环境。对 Cloudflare 自家 2500+ 端点的大 API，token 降幅近 **99.9%**（~117 万 → ~1000）。
**工程取舍**：换来近乎极限的 token/上下文节省，代价是必须自建安全沙箱、资源限制与监控——运维与安全成本是直接工具调用所没有的。

### 案例 D：Invariant Labs + OWASP——把安全从个案推成标准

Invariant Labs 演示了针对 **WhatsApp 与 GitHub MCP server 的可工作 tool-poisoning rug-pull**：恶意 server 借工具描述里的隐藏指令静默外泄聊天记录/数据。这把 MCP 安全从理论推到真实危害，催生 2025 年 MCP 安全研究潮，并被 **OWASP 收进 MCP Top 10（MCP03:2025 Tool Poisoning）**，把零散发现变成共享安全清单。
**工程取舍**：生态采用速度（"敢不敢用"）被安全成熟度反向约束——这是 [[12]] 的核心议题在工具层的投影。

---

## 8. 我的分析与判断

> **以下为分析观点（非客观事实），是我基于上述材料的独立研判，仅供参考。**

**趋势研判一：工具调用的"原语"正在从 JSON 上移到代码。** 2023 的胜利是 function calling 把意图变成结构化 JSON；2025 的转向是——当工具规模化、当推理模型本就擅长写代码，**"让模型写代码来编排工具"在 token、组合性、步数上系统性占优**。我判断未来 2 年的事实形态会是**分层共存**：MCP/schema 负责"工具的发现与契约"，代码执行负责"工具的编排与执行"。Anthropic 同时押注两条（Tool Search + Programmatic Tool Calling）已经在示范这个分层。纯 JSON 工具调用不会消失，但会退守到"少数高杠杆工具 + 简单单步场景"。

**趋势研判二：MCP 会作为"发现/接入标准"长存，但"协议即一切"的叙事会退潮。** 2025-12 捐给 Linux Foundation 是它"赢得标准之战"的封顶动作——中立治理是开放标准的终局。但 MCPGauge 的冷水是对的：协议本身不产生智能，套壳式 server 只增开销。**真正的价值在 server 设计质量（高杠杆、低 token、好错误信息），而非"接了 MCP"这件事本身。**

**常见坑（我见过/可预见的）：**
1. **把 OpenAPI 自动 1:1 包成几十上百个工具**——覆盖全、改造省，但模型选择准确率与 token 成本一起崩。正解：少而精、合并多步、命名空间。
2. **工具描述当文档写、不当 prompt 写**——写给人看的"获取用户信息"远不如写给模型看的"按 user_id 查用户，返回姓名/邮箱/状态；不返回密码"。
3. **错误信息返回 stack trace 或错误码**——agent 无法自纠。要返回可操作的自然语言。
4. **工具非幂等却被 agent 重试**——支付/写库类工具不做幂等键，会重复副作用。这是 §4.2 里"被规范忽略却致命"的那条。
5. **把 tool_result 当可信内容直接喂回模型**——工具返回是头号 prompt injection 通道（[[12]]）。任何"私有数据 + 不可信工具返回 + 外发能力"同时在场，就是 lethal trifecta。
6. **盲目堆 MCP server**——每多接一个就多吃几万 token + 多一个供应链信任面。接之前先问：这个 server 我信任吗？它进上下文值这些 token 吗？

**最佳实践（我的清单）：**
- **工具数控制在两位数以内**；超了就上 Tool Search/检索或代码执行，别硬塞。
- **eval 驱动迭代**：用真实多步任务跑，**让模型自己用工具**暴露描述缺陷（Anthropic 的方法值得抄）。
- **默认幂等 + 可操作错误信息 + token 预算（分页/截断/默认值）** 三件套写进每个工具。
- **安全分层**：沙箱执行（[[12]]）+ 最小权限 + 工具返回视为不可信 + 高权限操作走 HITL（[[11]]）。
- **选型判据**：单 app → 原生 function calling；跨产品/外部生态复用 → MCP；数据密集/多步编排 → 代码执行。**别为了用 MCP 而用 MCP。**

---

## 9. 面试考点

**概念题**

1. **function calling 与 MCP 是什么关系？**
   要点：function calling 是**模型能力**（吐结构化参数，应用自己定义并执行函数，导致 M×N 集成）；MCP 是建在其上的**协议/传输层**（标准化工具的动态发现与跨应用复用，M+N，并加 resources/prompts）。MCP 不替代 function calling，是补它"发现与复用"的洞。代价：协议开销、延迟、新攻击面；单 app 可能仍偏好原生。

2. **MCP 的 host / client / server 各负责什么？传输层有哪些？为什么 server 之间要隔离？**
   要点：host = 容器/协调者（集成 LLM、强制授权、派生 client）；client = 每 server 一个的 1:1 隔离会话；server = 暴露 tools/resources/prompts。传输：本地 stdio、远程 Streamable HTTP（取代旧 HTTP+SSE）。隔离是安全不变量——server 看不到完整对话也看不到其它 server，防越权与横向数据泄露。

3. **工具的 description/schema 为什么如此关键？**
   要点：它被加载进模型上下文、直接操纵"选不选、怎么填参数"——schema 设计就是提示工程。Hsieh et al.（2023）：好文档单独≈few-shot。引申到错误信息要可操作、命名要贴合用户心智。

4. **什么是 tool poisoning？为什么危险？**
   要点：恶意 MCP server 把指令藏进工具描述（模型可见、用户不可见），配合 prompt injection 可静默窃密/改行为；Invariant Labs 演示过 WhatsApp/GitHub rug-pull，已入 OWASP MCP Top 10。与 lethal trifecta 关联。

**系统设计题**

5. **为一个接了 50+ 工具、要做多步长任务的 agent 设计工具层，如何不让上下文爆掉、又保证调用准确？**
   要点：(a) 不全量预加载——上 Tool Search/RAG-MCP 按需检索工具定义（token -85% 量级）；(b) 工具治理——少而精、命名空间、合并多步、删冗余；(c) 数据密集/多步编排走代码执行（沙箱内过滤中间结果，只回精炼数据，token -98%）；(d) 返回值控 token（分页/截断/默认值）；(e) 评估闭环（真实多步任务 + 让模型自评工具）；(f) 安全（沙箱、最小权限、工具返回视为不可信、高权限 HITL）。讲清每步的 token/延迟/准确率取舍。

**手写题**

6. **手写一个带工具调用 + 错误自纠的 agent 主循环（伪代码）。**

```python
def agent_loop(user_msg, tools, max_steps=10, token_budget=150_000):
    ctx = [system_prompt(), tool_schemas(tools), user_msg]   # schema 即 prompt
    for step in range(max_steps):
        if tokens(ctx) > token_budget:
            ctx = compact(ctx)                                # 见 [[03]]
        resp = llm(ctx, tools=tools)                          # 模型 emit 文本或 tool_calls
        if not resp.tool_calls:
            return resp.text                                  # 停止条件：无工具调用
        ctx.append(resp)
        for call in resp.tool_calls:                          # 可能 0/1/多个（并行）
            if not authorize(call):                           # 权限/HITL 校验
                ctx.append(tool_error(call, "权限被拒，需用户确认"))
                continue
            try:
                args = validate(call.arguments, tools[call.name].schema)
                result = sandbox_exec(tools[call.name], args) # 沙箱执行，见 [[12]]
                ctx.append(tool_result(call, truncate(result)))  # 截断控 token
            except ToolError as e:
                ctx.append(tool_error(call, actionable_msg(e)))  # 错误回喂，让模型自纠
    return "达到步数上限，未完成"
```
答题要点：强调 emit→parse→authorize→sandbox→feedback 闭环、并行调用、可操作错误回喂、token 预算/compaction、停止条件。

**陷阱题**

7. **"工具越多 agent 越强"对吗？**
   错。10+ 就有选择悖论与工具幻觉，几十个 server 预加载先吃 5 万–15 万 token。正解是少而精 + 按需检索/代码执行，而非堆工具。

8. **"接了 MCP 就比 function calling 更好"对吗？**
   不一定。MCPGauge 实证 MCP 不总提升表现；单个自包含 app 用原生 function calling 更简单、更快、攻击面更小。MCP 的回本点在跨应用复用与生态互操作，且要承担协议开销 + tool poisoning 等安全成本。

9. **"工具返回的内容是可信的、可以直接喂回模型"对吗？**
   危险的错。工具返回是头号间接 prompt injection 通道；私有数据 + 不可信工具返回 + 外发能力 = lethal trifecta，至今无根本解（[[12]]）。

---

## 10. 参考文献

### 📄 论文

- Nakano et al. (OpenAI), **WebGPT: Browser-assisted question-answering with human feedback**, 2021 — <https://arxiv.org/abs/2112.09332> — 微调 GPT-3 用文本浏览器搜索/导航/引用，早期证明外部工具提升 LLM 事实性。
- Karpas et al. (AI21), **MRKL Systems**, 2022 — <https://arxiv.org/abs/2205.00445> — "LLM 路由到离散专家/工具模块"的概念蓝图，工具增强与 agent 路由的思想祖先。
- Yao et al., **ReAct: Synergizing Reasoning and Acting in Language Models**, 2022 — <https://arxiv.org/abs/2210.03629> — Thought–Act–Observe 交错，几乎所有工具型 agent 的控制范式源头。
- Schick et al. (Meta AI), **Toolformer: Language Models Can Teach Themselves to Use Tools**, 2023 — <https://arxiv.org/abs/2302.04761> — 自监督学"何时/调哪个/带什么参数/怎么接回"，工具使用可自学的奠基作。
- Paranjape et al., **ART: Automatic multi-step reasoning and tool-use**, 2023 — <https://arxiv.org/abs/2303.09014> — frozen LLM 自动生成"推理+工具调用"交错程序，自动化 ReAct/CoT 的手写脚本。
- Shen et al., **HuggingGPT**, 2023 — <https://arxiv.org/abs/2303.17580> — LLM 当控制器，按描述把任务派发给专家模型（工具），早期大规模工具/模型编排（NeurIPS 2023）。
- Li et al., **API-Bank**, 2023 — <https://arxiv.org/abs/2304.08244> — 73 API/314 对话的可运行工具评测，早期标准化（EMNLP 2023）。
- Qin et al. (40+ 作者), **Tool Learning with Foundation Models**, 2023 — <https://arxiv.org/abs/2304.08354> — 首篇工具学习综述，给出认知起源与统一分类（后入 ACM Computing Surveys）。
- Lu et al., **Chameleon: Plug-and-Play Compositional Reasoning**, 2023 — <https://arxiv.org/abs/2304.09842> — 按 query 合成组合异构工具（视觉/搜索/Python/规则）的程序（NeurIPS 2023）。
- Hao et al., **ToolkenGPT: Augmenting Frozen LMs with Massive Tools via Tool Embeddings**, 2023 — <https://arxiv.org/abs/2305.11554> — 每个工具表示为可学的 "toolken" 嵌入，frozen LLM 免微调插海量工具（NeurIPS 2023 oral）。
- Patil et al. (UC Berkeley), **Gorilla: LLM Connected with Massive APIs**, 2023 — <https://arxiv.org/abs/2305.15334> — 检索感知微调 + 文档接地，降 API 幻觉；提出 APIBench（NeurIPS 2024）。
- Qin et al. (OpenBMB/THU), **ToolLLM: Mastering 16000+ Real-world APIs**, 2023 — <https://arxiv.org/abs/2307.16789> — ToolBench 16k+ 真实端点 + 检索器 + DFSDT，缩小开源工具使用差距（ICLR 2024 spotlight）。
- Hsieh et al. (Google), **Tool Documentation Enables Zero-Shot Tool-Usage**, 2023 — <https://arxiv.org/abs/2308.00675> — 好文档/schema 描述单独即匹敌 few-shot，直接论证 schema 设计是工具可靠性的关键杠杆。
- Wang et al., **Executable Code Actions Elicit Better LLM Agents (CodeAct)**, 2024 — <https://arxiv.org/abs/2402.01030> — 可执行代码作为统一动作空间优于 JSON 工具字典，smolagents 的理论依据。
- Guo et al. (THUNLP), **StableToolBench**, 2024 — <https://arxiv.org/abs/2403.07714> — 用缓存 + LLM 模拟的虚拟 API server 取代不稳定的 live API，使工具评测可复现（ACL 2024 Findings）。
- Qu et al., **Tool Learning with Large Language Models: A Survey**, 2024 — <https://arxiv.org/abs/2405.17935> — 把工具学习组织为任务规划/工具选择/工具调用/响应生成四阶段的清晰分类。
- Patil et al. (UC Berkeley), **The Berkeley Function Calling Leaderboard (BFCL)**, 2025 — <https://proceedings.mlr.press/v267/patil25a.html> — AST 评测 single/parallel/multi-turn，扩到 stateful agentic，事实标准（ICML 2025）。
- Qian et al., **ToolRL: Reward is All Tool Learning Needs**, 2025 — <https://arxiv.org/abs/2504.13958> — 首个系统性工具 RL 奖励设计（GRPO），拆解 tool-name/param-name/param-value，RL 泛化优于 SFT（NeurIPS 2025）。
- Hou, Zhao, Wang, Wang, **Model Context Protocol (MCP): Landscape, Security Threats, and Future Research Directions**, 2025 — <https://arxiv.org/abs/2503.23278> — 首篇 MCP 生态学术分析：server 生命周期 + 威胁分类 + 缓解方向。
- Wang et al., **MCP-Bench**, 2025 — <https://arxiv.org/abs/2508.20453> — 接 28 个 live MCP server / 250 工具，测跨工具协同、精确参数控制与规划。
- Song et al., **Help or Hurdle? Rethinking MCP-Augmented LLMs (MCPGauge)**, 2025 — <https://arxiv.org/abs/2508.12566> — 沿 proactivity/compliance/effectiveness/overhead 四维探 MCP，发现 MCP 不总提升表现。
- Gan & Sun, **RAG-MCP: Mitigating Prompt Bloat in LLM Tool Selection via RAG**, 2025 — <https://arxiv.org/abs/2505.03275> — 用检索代替全量预加载工具定义，选择准确率升、prompt token 减半。
- Wang et al., **MCPTox: A Benchmark for Tool Poisoning Attack on Real-World MCP Servers**, 2025 — <https://arxiv.org/abs/2508.14925> — 45 个真实 server/353 工具/20 agent，把 tool poisoning 从个案推成可量化基准。
- **The Evolution of Tool Use in LLM Agents: From Single-Tool Call to Multi-Tool Orchestration**, 2026 — <https://arxiv.org/abs/2603.22862> — 工具使用综述：系统梳理从单工具调用到多工具编排的演进路径，可作 §4–§5 方法谱系与规模化解法的纵览索引。

### ✍️ 博客与工程文（优先一手）

- Anthropic Engineering, **Writing effective tools for AI agents**, 2025 — <https://www.anthropic.com/engineering/writing-tools-for-agents> — 工具设计五原则：高杠杆、命名空间、高信号 token-高效返回、打磨描述、eval 驱动；"工具是确定性系统与非确定性 agent 的契约"。
- Anthropic Engineering, **Code execution with MCP: building more efficient agents**, 2025 — <https://www.anthropic.com/engineering/code-execution-with-mcp> — 让 agent 写代码 import MCP 工具、在沙箱处理中间结果，数据密集任务 token 省约 98%（150K→2K）。
- Anthropic Engineering, **Introducing advanced tool use on the Claude Developer Platform**, 2025 — <https://www.anthropic.com/engineering/advanced-tool-use> — Tool Search（`defer_loading`、token -85%（~77K→8.7K）、准确率升、最多约 1 万工具）/ Programmatic Tool Calling（复杂任务 -37%、省 19+ 往返）/ Tool Use Examples（72%→90%）。
- Anthropic (news), **Agent Skills**, 2025 — <https://www.anthropic.com/news/skills> — 技能 = 含 `SKILL.md` 的文件夹，progressive disclosure 三级（元数据→完整指令→支撑文件）按需加载；2025-12-18 追加组织级管理与技能目录、作为开放标准发布。
- Invariant Labs, **MCP Security Notification: Tool Poisoning Attacks**, 2025 — <https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks> — 首次系统披露 tool poisoning，演示 WhatsApp/GitHub rug-pull，证明工具描述是活跃注入面。
- Simon Willison, **Model Context Protocol has prompt injection security problems**, 2025 — <https://simonwillison.net/2025/Apr/9/mcp-prompt-injection/> — 权威评论者点名 MCP 凑齐 lethal trifecta，prompt injection 无根本解。
- HuggingFace (Aymeric Roucher 等), **Introducing smolagents**, 2024 — <https://huggingface.co/blog/smolagents> — 主张 code agent：写 Python 当动作优于 JSON 工具字典，安全靠沙箱（E2B/Docker/Modal）。
- Cognition (Walden Yan), **Don't Build Multi-Agents**, 2025 — <https://cognition.ai/blog/dont-build-multi-agents> — Devin 团队主张单线程 + 上下文工程；并行 subagent 因上下文隔离而脆弱、冲突（与 [[08]] 直接相关）。
- Cloudflare, **Code Mode: the better way to use MCP**, 2025 — <https://blog.cloudflare.com/code-mode/> — 工具转 TypeScript API 在 V8 isolate 跑模型代码，2500+ 端点 ~117 万 token 压到 ~1000（-99.9%）。
- Armin Ronacher, **Your MCP Doesn't Need 30 Tools: It Needs Code**, 2025 — <https://lucumr.pocoo.org/2025/8/18/code-mcps/> — MCP 怀疑派代表作：工具不可组合、太吃上下文，不如让 agent 写一次性代码。
- Speakeasy, **Common Criticisms of MCP (And Why They Miss the Point)**, 2025 — <https://www.speakeasy.com/mcp/mcp-for-skeptics/common-criticisms> — 拥护派系统反驳：用 AI 时代约束而非 API 时代预期评估 MCP，它就从冗余变必然。
- Simon Willison, **Code execution with MCP**（独立解读）, 2025 — <https://simonwillison.net/2025/Nov/4/code-execution-with-mcp/> — 对 Anthropic 代码执行范式的外部交叉验证 lens。

### 📚 官方文档与标准

- Anthropic (news), **Introducing the Model Context Protocol**, 2024 — <https://www.anthropic.com/news/model-context-protocol> — MCP 发布原帖（spec 2024-11-05），开放标准把 N×M 集成统一为一套协议，首批 Block/Apollo/Zed/Replit/Codeium/Sourcegraph。
- modelcontextprotocol.io, **MCP Specification — Architecture**, 2025 — <https://modelcontextprotocol.io/specification/2025-06-18/architecture> — 权威架构参考：JSON-RPC client-host-server、有状态会话、能力协商、隔离不变量。
- OpenAI (docs), **Function calling guide**, 2023 — <https://developers.openai.com/api/docs/guides/function-calling> — 一手要点：JSON Schema 定义、限制工具数、假设一次返回 0/1/多调用、失败回喂错误自纠。
- OpenAI (index), **New tools and features in the Responses API（含远程 MCP）**, 2025 — <https://openai.com/index/new-tools-and-features-in-the-responses-api/> — Responses API 支持远程 MCP server，OpenAI 加入 MCP 指导委员会，标志跨厂商化。
- Google (Gemini docs), **Function calling with the Gemini API**, 2025 — <https://ai.google.dev/gemini-api/docs/function-calling> — 一手文档：并行调用（id 回映、无需保序）、组合调用（前者输出作后者输入）、multi-tool use。
- Cursor (docs), **Model Context Protocol (MCP) in Cursor**, 2025 — <https://cursor.com/docs/mcp> — 产品侧一手：`.cursor/mcp.json` 提交进 git 让全队共享工具、server 信任管控、MCP Apps 返回交互式 UI 并降级。
- OWASP Foundation, **MCP03:2025 — Tool Poisoning (MCP Top 10)**, 2025 — <https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning> — 社区安全标准化：tool poisoning 列入 MCP Top 10，形成公认漏洞类别。
- Model Context Protocol Blog, **Introducing the MCP Registry (preview)**, 2025 — <https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/> — 官方社区目录上线，回应"上万 server 如何发现与信任"的治理需求。
- Linux Foundation, **Agentic AI Foundation (AAIF) 成立，MCP/goose/AGENTS.md 作为首批捐赠项目**, 2025-12-09 — <https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation> — MCP 捐入中立基金会，AWS/Anthropic/Block/Bloomberg/Cloudflare/Google/Microsoft/OpenAI 为白金成员，锁定其行业标准地位。

### 🎥 Talk

> 本节未引用录播 talk（避免给出未核验链接）；上述官方文档与工程博客均为一手且可点验。MCP 相关公开演讲多在 AI Engineer 大会发布，读者可按需检索，本库不收录未逐条核验的视频链接。

---

> **交叉链接**：[[01]] 推理范式（ReAct 控制循环）· [[02]] Harness 运行时（tool-call 全链路）· [[03]] 上下文工程（工具定义/返回值的 token 预算）· [[08]] multi-agent（工具编排之争）· [[09]] 评估（BFCL/ToolBench）· [[11]] 生产工程（HITL/降级）· [[12]] 安全与对抗（tool poisoning / lethal trifecta）· [[13]] 大厂案例（Claude Code / Cursor / Devin 工具集）· [[17]] 协议与互操作（MCP/A2A 之上的 agent 身份、发现与协议层）。
