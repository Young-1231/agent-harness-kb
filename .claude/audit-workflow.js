export const meta = {
  name: 'kb-audit',
  description: '全面审计 Agent/Harness 知识库：18 章逐章核验 + 4 路横向审计 + 综合优化方案',
  phases: [
    { title: '逐章审计', detail: '18 章并行：核验 v2 修订是否落地 + 找剩余陈旧/不一致/渲染风险' },
    { title: '横向审计', detail: '顺序结构 / 一致性与交叉引用 / 呈现层构建 / 元文档新鲜度' },
    { title: '综合', detail: '汇总成优先级优化方案 + 顺序决策' },
  ],
}

// ---- 架构与红线（注入每个 agent）----
const CTX = `本知识库架构（务必理解）：
- 真源是 18 章 markdown：NN-*/README.md（NN=00..17）+ 根 OVERVIEW-发展总脉络.md。
- site/*.html 由 site/assets/_build.py 从 markdown【确定性生成】。**绝不要直接改 HTML**；优化点都落在 markdown 或 _build.py/_TEMPLATE/style.css。
- 唯一事实源是根 _事实基线-2026-06.md，零编造红线：任何 arXiv 编号/数字/日期/里程碑若无法在基线或可信出处核实，须标为可疑。
- 今天是 2026-06-16。当代旗舰：GPT-5.x / Claude Opus 4.x / Gemini 3 / DeepSeek V3.x（2023 的 GPT-4 / 2024 的 o1 等只能作"相变起点/开路者"，不能写成"当前 SOTA"）。
- 仓库根目录：/Users/max/Projects/Agent-Harness-知识库`

const SECTIONS = [
  ["00","00-导论与心智模型","导论与心智模型"],
  ["01","01-Agent核心与推理范式","Agent 核心与推理范式"],
  ["02","02-Harness运行时","Harness 运行时"],
  ["03","03-上下文工程","上下文工程"],
  ["04","04-工具与MCP","工具与 MCP"],
  ["05","05-规划与任务分解","规划与任务分解"],
  ["06","06-记忆系统","记忆系统"],
  ["07","07-检索与RAG","检索与 RAG"],
  ["08","08-多智能体编排","多智能体编排"],
  ["09","09-评估","评估"],
  ["10","10-可观测性与调试","可观测性与调试"],
  ["11","11-生产工程","生产工程"],
  ["12","12-安全与对抗","安全与对抗"],
  ["13","13-大厂案例研究","大厂案例研究"],
  ["14","14-技术栈速查","技术栈速查"],
  ["15","15-面试题库","面试题库"],
  ["16","16-Agent训练与强化学习","Agent 训练与强化学习"],
  ["17","17-互操作协议与Agent经济","互操作协议与 Agent 经济"],
]

// 2026-06-14 REVIEW §5.2/§8 点名、各章应已修订的可核查项（用于核验是否真落地）
const VERIFY = {
  "00":"METR Time Horizon 1.1 心智模型是否纳入；'何时该用 agent'决策前置；自主性光谱；模型旗舰是否已更新到 2026 代际",
  "01":"推理模型时代 ReAct/RLVR 定位；'测试时自我修正 vs 训练时自改进'区分；与 16 章交叉是否建立",
  "02":"brain/hands/session 三层；durable execution；HITL；Anthropic 2026 长跑 harness/Managed Agents；薄 vs 厚之争",
  "03":"prompt caching 成本应分档（勿笼统'降 90%'）；context engineering 命名应是 Lütke 首提/Karpathy 推广；四动词 Write/Select/Compress/Isolate 主脊",
  "04":"MCP 2026 Roadmap；code-execution(-98.7% token)；'一次性灌全部 tool schema'应标反模式；Agent Skills；渐进披露",
  "05":"Claude Code Tasks 必须写成'会话内作用域'(勿写跨会话持久化)；Blocksworld ~3% 应补 o1/LRM on PlanBench(~90%+)",
  "06":"OpenAI Dreaming 不得有无源数字、举例须用过去月份；write-manage-read 骨架；持续学习",
  "07":"agentic RAG 为终态；向量库降为回退项(代码场景 grep/agentic 检索为默认)；多模态检索 ColPali",
  "08":"AutoGen→Microsoft Agent Framework 1.0 GA(转维护态)；单 vs 多 agent 结案框；+90.2%/~15× token；A2A 一周年",
  "09":"OpenAI 退役 SWE-bench Verified(2026-02)；基准生命周期小节；pass@k vs pass^k；不确定性量化/弃答；METR 1.1",
  "10":"OTel GenAI semconv 多数仍 experimental(勿写'2026 毕业/标准化成形')；失败归因；监控 vs 评测",
  "11":"MAST 由约 150 条专家标注 trace 归纳(1600+ 为 LLM-judge 扩展)；vLLM 2023-06 发布/SOSP'23；Gartner 改过去式(~50% 弃用率)；brain/hands/session；AgentOps 导览；Agent FinOps",
  "12":"Constitutional 原版 3000+ 小时、次代 2026-01 改内部 probe 1700+ 小时；浏览器注入 23.6%→11.2%；Rule of Two 2025-11；OWASP Agentic 2026；注入不可能性结论；治理合规(EU AI Act 2026-08-02)",
  "13":"Windsurf 已被 Cognition 收购(2025-07)；SWE-bench 32% 是 2024 旧分(现 70-80%+)；Deep Research 引擎已切 GPT-5 代；Menlo 市场数字",
  "14":"增'维护状态/继任者'列；AutoGen→MAF、Swarm→Agents SDK；eval 表换 GAIA/SWE-bench Verified/τ²-bench/Terminal-Bench；补 Google ADK/AWS Strands/MAF",
  "15":"题库与各章口径一致；手写原语；STAR 模板；六组'陷阱 vs 正确姿势'",
  "16":"新章：RLHF/RLVR、GRPO、agentic RL(MDP→POMDP)、轨迹蒸馏、'RLVR 扩展 vs 锐化'之争；与 01/06 交叉；引用真实性逐条把关",
  "17":"新章：纵向 MCP / 横向 A2A·AGNTCY / 身份 NANDA / 支付 AP2·ACP；协议级安全；与 04/08 交叉；引用真实性逐条把关",
}

const PER_SCHEMA = {
  type:"object",
  required:["id","overallScore","summary","topRecommendations"],
  properties:{
    id:{type:"string"},
    overallScore:{type:"integer",minimum:1,maximum:5,description:"本章总体质量 1-5"},
    summary:{type:"string",description:"一段话总评：这章现状如何、最该动什么"},
    verifiedFixes:{type:"array",items:{type:"object",required:["item","status"],properties:{
      item:{type:"string"},status:{type:"string",enum:["fixed","partial","unfixed","n/a"]},note:{type:"string"}}},
      description:"逐条核验 VERIFY 清单项是否落地"},
    freshnessIssues:{type:"array",items:{type:"object",required:["location","issue","severity"],properties:{
      location:{type:"string",description:"行号或小节"},issue:{type:"string"},severity:{type:"string",enum:["high","med","low"]},suggestedFix:{type:"string"}}}},
    factRisks:{type:"array",items:{type:"object",required:["claim","concern"],properties:{claim:{type:"string"},concern:{type:"string"}}},
      description:"无法核实/疑似臆造的 arXiv 编号、数字、日期"},
    structureIssues:{type:"array",items:{type:"object",required:["issue"],properties:{issue:{type:"string"},suggestedFix:{type:"string"}}},
      description:"小节顺序、缺失、冗长、与他章重叠"},
    crossRefIssues:{type:"array",items:{type:"string"},description:"[[NN]] 交叉引用断链/缺失/可补"},
    htmlRenderRisks:{type:"array",items:{type:"object",required:["pattern","risk"],properties:{pattern:{type:"string"},risk:{type:"string"}}},
      description:"会让 _build.py 渲染异常的 markdown 写法（嵌套表格、未闭合代码栏、特殊字符等）"},
    topRecommendations:{type:"array",items:{type:"object",required:["action","priority"],properties:{
      action:{type:"string"},priority:{type:"string",enum:["P0","P1","P2"]},effort:{type:"string",enum:["S","M","L"]}}}},
  }
}

const CROSS_SCHEMA = {
  type:"object",
  required:["area","verdict","findings"],
  properties:{
    area:{type:"string"},
    verdict:{type:"string",description:"该维度的总体判断"},
    findings:{type:"array",items:{type:"object",required:["title","detail","priority"],properties:{
      title:{type:"string"},detail:{type:"string"},priority:{type:"string",enum:["P0","P1","P2"]},
      effort:{type:"string",enum:["S","M","L"]},action:{type:"string",description:"具体可执行动作 + 涉及文件"}}}},
  }
}

// ---------- Phase 1: 逐章 ----------
phase('逐章审计')
const perCh = await parallel(SECTIONS.map(([id,dir,title]) => () =>
  agent(
`${CTX}

你审计第 ${id} 章「${title}」，源文件：${dir}/README.md。

步骤：
1) 完整 Read ${dir}/README.md；按需 Read 根 _事实基线-2026-06.md 比对事实。
2) 逐条核验这章本应已落地的修订（2026-06 REVIEW 点名），判定 fixed/partial/unfixed/n/a：
   【核验清单】${VERIFY[id]||"（无专项，按通用标准审）"}
3) 找【剩余】问题：
   - 陈旧时点：仍把旧旗舰当"当前 SOTA"、把已兑现趋势写成将来式预测、时间线缺 2026 H1、旧 benchmark 旧分当现状。
   - 事实风险：无法核实/疑似臆造的 arXiv 编号、第三方数字、日期（对照基线）。
   - 结构：小节顺序是否最优、是否有缺口/冗长/与他章重复。
   - 交叉引用 [[NN]]：断链、该补未补。
   - HTML 渲染风险：会让 _build.py（见架构说明）渲染异常的 markdown 写法。
仅报真实、具体、可定位的问题（给行号/小节），不要泛泛而谈，不要编造问题凑数。按 schema 返回。`,
    {schema:PER_SCHEMA, phase:'逐章审计', label:`审:${id}`})
))

// ---------- Phase 2: 横向 ----------
phase('横向审计')
const allCh = SECTIONS.map(s=>`${s[0]} ${s[2]}`).join(' / ')
const cross = await parallel([
  () => agent(
`${CTX}

维度：【顺序与结构】。当前章序与导航/翻页顺序都由 _build.py 的 SECTIONS 决定，现为 00→17：
${allCh}
请判断：
1) 这个"按请求生命周期"的章序是否最优？若调整顺序，会牵动 [[NN]] 交叉引用、URL(NN.html) 语义、OVERVIEW §9 学习路线——代价如何，是否值得？
2) 是否存在应合并/拆分/挪位的章节，或明显内容重叠（如 06 记忆 vs 07 检索、09 评估 vs 10 可观测）？
3) 各章是否都遵循 10 段范式（TL;DR→定位→历史→机制→横向表→争议→大厂→判断→面试→参考）？有无走样。
请 Read README.md、OVERVIEW-发展总脉络.md(§9-§11)，并按需抽查各章 H2 大纲。verdict 给出"是否建议重排"的明确结论与理由。`,
    {schema:CROSS_SCHEMA, phase:'横向审计', label:'顺序结构'}),

  () => agent(
`${CTX}

维度：【一致性与交叉引用图】。跨全 18 章 + OVERVIEW 检查：
1) 术语一致性（同一概念多种译名/写法）、模型旗舰口径是否全库统一到 2026 代际。
2) [[NN]] 交叉引用完整性：是否有指向不存在小节/章节的死链；OVERVIEW 的依赖图与正文是否吻合。
3) 关键数字/日期跨章是否打架（如 +90.2%、-98.7%、23.6%→11.2%、METR doubling 周期 在不同章是否一致）。
4) 状态徽章、引用格式、参考文献格式是否统一。
用 grep/Read across 文件取证，findings 给出冲突的具体位置。`,
    {schema:CROSS_SCHEMA, phase:'横向审计', label:'一致性'}),

  () => agent(
`${CTX}

维度：【呈现层 / 构建 / HTML】。审 site/assets/_build.py、_TEMPLATE.html、_GUIDE.md、style.css、app.js：
1) 构建确定性：把 site/ 备份到 /tmp，运行 \`python3 site/assets/_build.py\`，与现有 site/*.html 逐文件 diff——若有差异说明 HTML 曾被手改或未重建；报告差异，然后【从 /tmp 备份还原 site/】保持工作树不变。
2) _GUIDE.md 陈旧：仍写"16 节 / 00…15"，应为"18 节 / 00…17"（NAV 模板、hero、subtitle、pill）。列出所有需改处。
3) _build.py 的 markdown 解析是否有边界 bug（嵌套列表、表格对齐、代码栏语言、[[NN]]/链接、状态徽章、时间线表识别）——结合各章真实写法判断。
4) 可访问性/移动端/暗色主题/TOC scrollspy/翻页器 是否有明显缺陷。
findings 给出文件 + 具体改法。`,
    {schema:CROSS_SCHEMA, phase:'横向审计', label:'呈现构建'}),

  () => agent(
`${CTX}

维度：【元文档新鲜度】。审 README.md、PLAN.md、REVIEW-2026-06-系统化审查与对标.md、_事实基线-2026-06.md：
1) 抽样已证实：各章正文其实已完成 v2 修订（硬错大多已修），但 README §六"下一步(v2 检修)"仍把批次 A 写成"进行中"、把批次 C→D 写成未做的 backlog——与现实不符。请逐条核对 README/REVIEW 里"进行中/backlog/待办"的表述，标出哪些其实已落地、该改写为"已完成"。
2) PLAN.md 是否还停留在原 16 节施工蓝图、需不需要标注"已完工/历史存档"。
3) REVIEW §八路线图 P0/P1/P2 各项的真实完成度（已落地 vs 仍待办）。
4) 这些元文档（含 _GUIDE）是否该统一一处"维护状态"口径。
请 Read 这些文件并按需抽查正文取证，findings 给出"哪个文件哪段该怎么改"。`,
    {schema:CROSS_SCHEMA, phase:'横向审计', label:'元文档'}),
])

// ---------- Phase 3: 综合 ----------
phase('综合')
const PLAN_SCHEMA = {
  type:"object",
  required:["executiveSummary","orderingDecision","prioritizedActions"],
  properties:{
    executiveSummary:{type:"string",description:"3-6 句：知识库现状总判定 + 本轮最该做什么"},
    orderingDecision:{type:"object",required:["recommendation","rationale"],properties:{
      recommendation:{type:"string",description:"保持现序 / 局部微调 / 重排——明确结论"},rationale:{type:"string"}}},
    prioritizedActions:{type:"array",items:{type:"object",required:["action","priority","effort"],properties:{
      action:{type:"string"},priority:{type:"string",enum:["P0","P1","P2"]},area:{type:"string"},
      effort:{type:"string",enum:["S","M","L"]},files:{type:"array",items:{type:"string"}},rationale:{type:"string"}}}},
    quickWins:{type:"array",items:{type:"string"},description:"低风险、可立即落地的小改动"},
    openQuestionsForUser:{type:"array",items:{type:"string"},description:"需用户拍板的结构性取舍"},
  }
}
const plan = await agent(
`${CTX}

下面是 18 章逐章审计结果与 4 路横向审计结果（JSON）。请综合成一份【优先级优化方案】：
- 去重、合并同类项，按 P0/P1/P2 + effort 排序，标注涉及文件。
- orderingDecision：基于"顺序结构"审计给出是否重排的明确结论（注意重排的交叉引用/URL/学习路线代价）。
- quickWins：能立刻安全落地的（如 _GUIDE/README 元文档对齐、_GUIDE "16节"→"18节"、个别 grep 可定位的硬错/死链）。
- openQuestionsForUser：只放真正需要用户拍板的结构性取舍。
务实、可执行，不堆砌。

【逐章】
${JSON.stringify(perCh.filter(Boolean), null, 1)}

【横向】
${JSON.stringify(cross.filter(Boolean), null, 1)}`,
  {schema:PLAN_SCHEMA, phase:'综合', label:'综合方案'})

return { plan, perCh: perCh.filter(Boolean), cross: cross.filter(Boolean) }
