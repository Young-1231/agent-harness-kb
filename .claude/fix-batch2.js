export const meta = {
  name: 'kb-fix-batch2',
  description: '批次2：15题簇扩展 + 16/17定位语 + 高危数字联网核验 + 13时点 + 03机制 + 将来式软化 + 全库交叉引用',
  phases: [{ title: '修订', detail: '一文件一 agent 并行，按各自检查单做有界修订' }],
}

const ROOT = '/Users/max/Projects/Agent-Harness-知识库'
const COMMON = `你只负责精确、有界地修订【一个文件】。铁律：
① 先完整 Read 目标文件再改；行号仅线索、按内容定位；只做下述检查单内的事，其余原样保留。
② 零编造红线：新增的任何事实/数字/日期/arXiv 只能来自 (a) 根 _事实基线-2026-06.md、(b) 被引用的兄弟章 README、(c) 你本次 WebSearch 联网核实到的一手来源（核实结论写进 verifiedFacts）。核不实就别写或软化为定性（"据其博客/约/据报道"）。
③ 不要触碰 site/*.html（HTML 由 _build.py 生成，我稍后统一重建）。本轮【不做】术语统一（subagent/multi-agent 写法留待下一批），别动术语。
④ 保持 10 段范式与既有风格；交叉引用写作 [[NN]]（两位数字）；最小改动。
今天 2026-06-16；当代旗舰 GPT-5.x / Claude Opus 4.x / Gemini 3 / DeepSeek V3.x（旧模型只作"相变起点/开路者"）。仓库根：${ROOT}
完成后按 schema 返回改动（before/after 片段 + 原因）；若联网核验，把结论与来源写进 verifiedFacts。`

// [dir, 检查单]
const TASKS = [
  ["16-Agent训练与强化学习", `(1) 定位语：在 §1（TL;DR/本节地图）末尾加一句明确"本章为吃透 [[00]]–[[15]] 后的进阶选读/前沿外延"。
(2) 交叉引用：本章正文已铺垫推理/记忆/规划但 footer 或相关处缺链——就近补 [[02]] [[03]] [[05]]（只在确有语义关联处补，勿硬塞）。
(3) 将来式软化：§8 若把 2026 旗舰当"未来会怎样"的预测，改为现在完成时（这些旗舰已是训练范式的既成产物）。`],

  ["17-互操作协议与Agent经济", `(1) 定位语：在 §1 末尾加一句"本章为吃透 [[00]]–[[15]] 后的进阶选读/单 agent 链路的横向外延"。
(2) 交叉引用：协议/框架选型相关处就近补 [[14]]（技术栈速查）。`],

  ["15-面试题库", `这是本批最重的内容增量，务必只用基线 + 16/17 章正文为素材：
(1) 扩题簇：当前题库自限 [[00]]–[[14]]，但正文已铺垫 RL 训练与协议经济。新增两个题簇——「Agent 训练与强化学习（对应 [[16]]）」与「互操作协议与 Agent 经济（对应 [[17]]）」，每簇给 3–5 道有代表性的概念/系统设计题（答案要点简洁），并交叉链 [[16]] [[17]]。若正文有"五大题簇"表述，相应更新为"七大题簇"并把两新簇并入谱系表。
(2) 时点补强：若 §3 时间线停在 2025.06，补 2026 H1 里程碑行（2026-02-23 OpenAI 退役 SWE-bench Verified、2026-04-03 Microsoft Agent Framework 1.0 GA(AutoGen+SK 合并)、2026-03-09 The 2026 MCP Roadmap），并接到 §6 的反向判据/趋势判断。
(3) τ-bench 口径：凡把 τ-bench "SOTA<50% / pass^8<25%" 当现状处，统一加"（2024 原论文口径）"并提及继任者 τ²-bench。
Read 根 _事实基线-2026-06.md、16/17 章 README 取素材，不得编造新题外事实。`],

  ["13-大厂案例研究", `(1) Windsurf 时点：正文把 Windsurf 当作与 Cognition/Devin 对立的独立 HITL 阵营，但 Windsurf 已于 2025-07 被 Cognition 收购。先 WebSearch "Windsurf Cognition 收购 2025" 确认；据实移除/软化该并列项（避免把已被收购方写成独立阵营）。
(2) 评测时点：时间线 §3 与评测叙事/面试题处补"2026-02-23 OpenAI 退役 SWE-bench Verified（污染 + 约 60% 失败题源于测试缺陷）"，并据此把本章出现的 SWE-bench 32%/26% 明确标注为 2024 开源旧分（现 SOTA 70–80%+）。
(3) 交叉引用：就近补 [[14]]（技术栈）与 [[15]]（面试）。`],

  ["04-工具与MCP", `(1) 高危核验：本章"2025-12-09 MCP 捐给 Agentic AI Foundation / Linux Foundation"承重 §1/§3/§6/§8，但事实基线同日仅登记 OWASP+Menlo；且文内成员名单两处疑自相矛盾。WebSearch "MCP Linux Foundation Agentic AI Foundation 捐赠 2025" 核实捐赠主体/日期/成员，据实统一两处名单；核不实则软化日期与归属。
(2) 交叉引用：§1 下游能力图就近补 [[09]] [[11]]。`],

  ["09-评估", `(1) 高危核验（WebSearch 后据实保留/软化，结论写 verifiedFacts）：SWE-bench Pro 各模型 public→private 分（如 23.1%→14.9%）、SWE-bench Verified 退役事件具名的三个模型 + "64 次运行"、CursorBench-3 / 规模翻倍 / 作者署名——逐项查证，核不实者软化为定性或删具体数字。
(2) 将来式软化：§8 "评估即服务"若写成将来预测，改为"已落地（CursorBench / AgentKit Evals 等），仅'全自动污染审计+自动退役'仍属将来增量"。
(3) 交叉引用：组件级评估处补 [[05]] [[06]] [[07]]；reward hacking 处补 [[12]]。`],

  ["08-多智能体编排", `(1) 高危核验：本章引 arXiv 2502.08788《Stop Overvaluing Multi-Agent Debate》——ID/标题/规模均不在基线。WebSearch 核实该 arXiv 是否存在及题名规模；核实则补来源、核不实则软化为定性引用或删编号。
(2) 将来式软化：§8 关于 A2A 标准化 / 多 agent 瘦身的论断若写成将来式，改为现在完成时（A2A 一周年并入 LF、Cognition map-reduce 窄模式 均已落地）。
(3) 交叉引用：就近补 [[11]]（生产可靠性）等确有关联的链接。`],

  ["07-检索与RAG", `(1) 跨章日期冲突：本章引 Cursor《Securely indexing large codebases》标注的年份与 14 章冲突（07 标 2026 vs 14 标 2024）。WebSearch 核实该文真实发布年份，按真实年份统一（同时我会让 14 章那端对齐到同一结论——你只需把本章改对并在 verifiedFacts 写明真实年份+来源）。
(2) 交叉引用：就近补确有关联的章链（如 [[03]] 上下文 / [[14]] 选型）。`],

  ["14-技术栈速查", `(1) 跨章日期冲突：本章 Cursor《Securely indexing large codebases》年份与 07 章冲突。WebSearch 核实真实发布年份后统一（与 07 章对齐到同一真实年份）。
(2) eval 基准表现代化（若尚未做）：把过时基准（AgentBench·MT-Bench 之类）换/补为 GAIA / SWE-bench Verified（注明 2026-02 已退役）/ τ²-bench / Terminal-Bench；"维护状态/继任者"列若已有则跳过。
(3) 交叉引用：§9 面试节就近补 [[15]]。`],

  ["02-Harness运行时", `(1) 将来式软化：§8 若把 durable execution 写成"会变成标配"的预测，改为现在完成时（已成主流运行时原语）。
(2) 交叉引用：footer/相关处补 [[10]]（可观测，本章 tracing/错误恢复处确有关联）。`],

  ["03-上下文工程", `(1) 机制补强（素材取自 _事实基线-2026-06.md §7，已核验，勿引新数字）：在 §4.6/§5 一带补 2025-H2 三大一手"按需供给"机制——Agent Skills 渐进披露 / Tool Search 工具 defer_loading（77K→8.7K token）/ Code execution with MCP（150K→2K token，-98.7%），归入 Select/JIT 主脊。
(2) 交叉引用：就近补 [[04]]（工具）/ [[02]]（运行时）确有关联处。`],

  ["06-记忆系统", `(1) 将来式/口径软化：§6 争议1"长上下文 vs 记忆"的长上下文代表若仍只举旧模型，补当代 Gemini 3 等长窗口代表。
(2) 交叉引用：就近补确有关联章链（如 [[07]] 检索 / [[16]] 训练）。`],

  ["12-安全与对抗", `(1) 将来式/口径软化：§7 若把 Gemini 2.5 当"当前最强防御基座"，标注为"2025 防御研究基座"并指向当代代际。
(2) 交叉引用：footer/相关处补 [[01]]（推理）、[[10]]（可观测）、[[05]]（规划/HITL）确有关联处。`],

  ["00-导论与心智模型", `仅交叉引用补全：footer 交叉链接表漏掉正文已引用的 [[11]]，请补；并就近补 [[14]]（技术栈，若正文确有关联点）。不动其它。`],

  ["01-Agent核心与推理范式", `仅交叉引用补全：就近补 [[10]]（可观测）与 [[11]]（生产）确有关联处。不动其它。`],

  ["05-规划与任务分解", `仅交叉引用补全：正文相关处落锚 [[09]]（计划遵守度评估）与 [[13]]（大厂规划案例）。不动其它。`],

  ["10-可观测性与调试", `仅交叉引用补全：就近补 [[02]]（运行时/trace 来源）与 [[11]]（生产监控）确有关联处。不动其它。`],

  ["11-生产工程", `仅交叉引用补全：§9 面试节就近补 [[15]]。不动其它。`],
]

const SCHEMA = {
  type:"object",
  required:["dir","applied","changes"],
  properties:{
    dir:{type:"string"},
    applied:{type:"boolean"},
    changes:{type:"array",items:{type:"object",required:["what"],properties:{
      what:{type:"string"},before:{type:"string"},after:{type:"string"}}}},
    verifiedFacts:{type:"string",description:"联网核验的结论与一手来源（含真实日期/编号）"},
    notes:{type:"string"},
  }
}

phase('修订')
const results = await parallel(TASKS.map(([dir, instr]) => () =>
  agent(`${COMMON}

【目标文件】${ROOT}/${dir}/README.md

【本文件检查单】
${instr}`, {schema:SCHEMA, phase:'修订', label:dir.slice(0,2)})
))

return { results: results.filter(Boolean) }
