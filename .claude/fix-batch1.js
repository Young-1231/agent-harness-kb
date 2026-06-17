export const meta = {
  name: 'kb-fix-batch1',
  description: '落地批次1：元文档完成态收口 + MAST跨章对齐 + 章内自洽硬错 + 呈现层/a11y + 两处红线核验',
  phases: [{ title: '修订', detail: '一个文件一个 agent 并行做精确最小改动' }],
}

const ROOT = '/Users/max/Projects/Agent-Harness-知识库'
const MAINT = '> 维护状态：v2 检修已于 2026-06 全量收口——18 节正文 + OVERVIEW + 元文档均已对齐到根 `_事实基线-2026-06.md`。'
const COMMON = `你只负责精确、最小、外科手术式地修订【一个文件】，不做任何范围外改动，不新增任何未经核实的事实/数字/arXiv 编号（零编造红线）。
规则：① 先完整 Read 目标文件再改；② 行号仅为线索，按内容定位；③ 只改下述指定处，其余原样保留；④ 不要触碰 site/*.html（HTML 由 _build.py 生成，稍后统一重建）。
今天是 2026-06-16；当代旗舰 GPT-5.x / Claude Opus 4.x / Gemini 3 / DeepSeek V3.x。
仓库根：${ROOT}
完成后用 schema 返回你改了什么（before/after 片段 + 原因）。`

const FIXES = [
  ["README.md", `只改 §六「下一步（v2 检修）」整节，从"进行中/backlog"翻成完成态，不动其它任何章节：
- 节标题可改为「## 六、维护状态（v2 检修已收口）」。
- 「v2 检修（进行中，2026-06-14 起）」→「v2 检修已于 2026-06 全量收口」。
- 「批次 A · 时点刷新（OVERVIEW/README 已落地，余下文件进行中）」→ 改为"全部各章正文已落地"的完成态。
- 最后一段「后续批次（C→D）backlog：…」整段从待办语气改为「批次 C→D 已完成」并把动词全部改成完成态（这些工作经审计核验确已落地于各章正文）。
- 在 §六 顶部加维护状态行：${MAINT}
保持事实准确，不要新增任何未发生的承诺或新数字。`],

  ["REVIEW-2026-06-系统化审查与对标.md", `这份 2026-06-14 审查报告的"待办"语气已过时（其点名修订经核验大多已落地正文）。做完成态收口，不改分析结论与对标内容本身：
- 文件顶部（H1 下、首个 blockquote 附近）加维护状态行：${MAINT}
- §一执行摘要里「时点冻结」问题描述处补注「（已于 v2 修复）」。
- §三末尾「可执行升级…叠加命名模式↔章节交叉索引」处标注「（命名模式索引已落地于 OVERVIEW §10）」。
- §八优先级改进路线图 P0/P1/P2 各条目末尾加「✅ 已落地」。
- §九「建议的执行方式」的分批表述改为「已分批落地」。
只改语气/状态标注，保留原始分析、表格、外部对标资源清单。`],

  ["PLAN.md", `这是原 16 节施工蓝图、工程已完工。在文件顶部（H1 标题下）加一个"历史存档"横幅 blockquote：说明本蓝图所述 16 节已全部完工、16/17 两节为 v2 新增（详见 README 与 OVERVIEW）、本文件保留作历史存档。并加维护状态行：${MAINT}
不改正文蓝图内容。`],

  ["_事实基线-2026-06.md", `文件顶部说明里若写着本基线"v2 完成后可删除或归档"之类的临时语气，改为"已归档（v2 已收口，仍作各章事实溯源的唯一来源）"。可在顶部加维护状态行：${MAINT}
不动任何事实条目本身。`],

  ["OVERVIEW-发展总脉络.md", `§5（约 line76）关于 MAST 的表述写成"MAST 从 1600+ trace 归纳 14 种多 agent 失败模式"，是与 11 章口径冲突的旧混淆版。改为与 11 章一致："MAST 由约 150 条专家标注 trace（κ=0.88）归纳 14 种失败模式（1600+ 是其后用 LLM-judge 扩展的 MAST-Data 数据集）"，并保持句子在原语境通顺。只改这一处 MAST 描述。`],

  ["08-多智能体编排/README.md", `约 line58 把 MAST 写成"1600+ trace 归纳 14 模式"的旧混淆版，改为 11 章口径：14 模式由约 150 条专家标注 trace（κ=0.88）归纳，1600+ 是其后 LLM-judge 扩展的 MAST-Data。只改 MAST 这一处。`],

  ["10-可观测性与调试/README.md", `三件事，最小改动：
(a) MAST 口径：约 line155 与 line348 若把 1600+ 当成产出 14 模式的专家标注集，改为 11 章口径（约 150 条专家 trace κ=0.88 归纳 14 模式，1600+ 为其后 LLM-judge 扩展的 MAST-Data）。
(b) "Langfuse 被 ClickHouse 收购（2026-01）"这一说法在文中重复多处、但不在事实基线。请先 WebSearch 'Langfuse ClickHouse 收购 / Langfuse acquired' 核实：若有可信一手来源确认，保留并在参考补来源；若无法确认，降级为不依赖该事件的中性表述（如"Langfuse（2026 进入整合期）"）或删去具体收购方/日期，避免无源承重数字。
(c) 案例 Cresta 若被多处引用但参考节无出处，降级为"代表性实践（无公开复盘）"或补一手出处。
只动这三点。`],

  ["02-Harness运行时/README.md", `约 line12 的本节地图/导语写"2022 ReAct 到 2026 Cursor 的 11 个里程碑"——计数与终点都不对。请 Read 本章 §3 时间线，数出实际里程碑行数，把数字与终点都改正确（终点应是 2026 的 Anthropic 长跑 harness / Managed Agents 一类，而非 Cursor）。只改这一处。`],

  ["06-记忆系统/README.md", `本节地图（约 line12）写"九大方案横向对比"，但 §5 横向对比表实为 10 行。Read §5 确认行数后，把"九大方案"改为与表实际数量一致（应为"十大方案"）。只改这一处计数。`],

  ["14-技术栈速查/README.md", `(a) 约 line93 标题"编排范式的三种形态"与下文代码块/正文"四种形态"矛盾——Read 上下文确认实为四种后，把"三种"→"四种"。
(b) 约 line102 有悬挂内部引用"§11 openQuestion"（本章无 §11）——改指实际存在的小节或删去该引用。`],

  ["15-面试题库/README.md", `约 line12 与 line142 写"六组（陷阱 vs 正确姿势）"，但实际为七组（①-⑦）。Read 确认后把"六组"改为"七组"。只改计数。`],

  ["05-规划与任务分解/README.md", `约 line221 有悬空内部引用"§10 openQuestions"，但 §10 是参考文献、无该节。改为不依赖错误编号的表述（如"本节最值钱的开放问题"）。只改这处引用。`],

  ["09-评估/README.md", `约 line63 与 line261 出现"GPT-5.2"，该版本号未在事实基线登记、与全库其它章口径不一致。Read 根 _事实基线-2026-06.md 确认已登记的当代版本号（如 GPT-5.4/5.5），把"GPT-5.2"统一改为已登记版本号或泛称"GPT-5 一代/系"。只改这两处版本号。`],

  ["12-安全与对抗/README.md", `参考/正文把 EchoLeak 归为 arXiv 论文"Reddy & Gujral, 2509.10540"。EchoLeak 实为 Aim Security 的行业漏洞披露（M365 Copilot 零点击注入，CVE-2025-32711，2025-06），不是 arXiv 学术论文。可 WebSearch 'EchoLeak Aim Security CVE-2025-32711' 确认。请去掉虚构的 arXiv 编号与作者归属，改为引 Aim Security 一手披露（标为安全厂商披露而非论文）。只改 EchoLeak 这处引用归属。`],

  ["site/assets/_GUIDE.md", `这份 _build.py 规格说明仍停在 16 节，更新到 18 节（00–17），仅改计数/导航、不改其它规格：
- "16 节"→"18 节"（约 line47 brand subtitle、line217 hero lede、line221 pill）。
- "00…15" / "00.html … 15.html" / "index/overview/00…15" 等 → 改为含到 17（约 line11、line81、line206、line237）。
- §2 固定 NAV 模板（约 line53-68，现列 00–15）补上 16、17 两个 nav__link：16 = "Agent 训练与强化学习"、17 = "互操作协议与 Agent 经济"，与 _build.py 的 SECTIONS 一致。
- §6 首页 hero 文案/pill 若与 _build.py build_index 实际输出（含 "2026-06 刷新" pill、首页只有 next pager）不一致，对齐之。
注意：勿手改任何 site/*.html。`],

  ["site/assets/app.js", `initThemeToggle 在页面加载时未按当前主题初始化 toggle 的 aria-pressed，导致浅色模式下 aria-pressed 与实际不符（无障碍缺陷）。Read 文件定位 initThemeToggle，在为按钮绑定 click 监听【之前】加一行用当前 data-theme 初始化（按文件现有变量名，如已有 root 用 root）：
btn.setAttribute('aria-pressed', String((root||document.documentElement).getAttribute('data-theme') === 'light'));
只改这一处初始化，不动其它交互逻辑。`],
]

const SCHEMA = {
  type:"object",
  required:["file","applied","changes"],
  properties:{
    file:{type:"string"},
    applied:{type:"boolean",description:"是否成功落地"},
    changes:{type:"array",items:{type:"object",required:["what"],properties:{
      what:{type:"string"},before:{type:"string"},after:{type:"string"}}}},
    verifiedFacts:{type:"string",description:"若做了联网核验，写结论与来源"},
    notes:{type:"string"},
  }
}

phase('修订')
const results = await parallel(FIXES.map(([rel, instr]) => () =>
  agent(`${COMMON}

【目标文件】${ROOT}/${rel}

【本文件要做的修订】
${instr}`, {schema:SCHEMA, phase:'修订', label:rel.replace(/^.*\//,'').replace('.md','').replace('README','').slice(0,14)||rel})
))

return { results: results.filter(Boolean) }
