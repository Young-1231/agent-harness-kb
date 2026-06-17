export const meta = {
  name: 'kb-fix-batch3',
  description: '批次3：subagent 术语统一英文 + 多代理归一 + 广谱数字/arXiv 轻量核验软化 + _build.py 健壮性加固',
  phases: [{ title: '收尾', detail: '一文件一 agent：术语统一 + 轻量软化；外加 _build.py 加固' }],
}

const ROOT = '/Users/max/Projects/Agent-Harness-知识库'
const COMMON = `你只精确修订【一个文件】。铁律：① 先 Read 再改；② 零编造红线，新增/保留的数字只能来自基线 _事实基线-2026-06.md、被引兄弟章、或你本次 WebSearch 核到的一手源；③ 不碰 site/*.html；④ 最小改动、保持可读与原风格。今天 2026-06-16。仓库根：${ROOT}

【术语统一规则（本批核心）】
- subagent 家族（"子代理""子智能体""子 agent""子agent"）→ 统一英文 \`subagent\`（行内沿用本章 agent 的既有写法风格，可加/不加反引号，与上下文一致）。标题文本里的可一并改（锚点是 sec-N 位置式、改标题文本不影响导航）。
- 孤立变体 "多代理" → 归一为 "多智能体"（仅消除这个少数变体；本批【不要】改动 "多智能体"/"多智能体编排"/各级标题里的多智能体——multi-agent 家族是否整体改英文留待单独确认）。
- 不改：代码块内、URL、参考文献题名、[[NN]] 标签内、章 H1 标题里的专有名。
- 替换要逐处看语境，别误伤非术语用法，别把通顺句子改肿。`

const SOFT = `【广谱数字/arXiv 轻量软化（次要、judicious）】对下列"基线外/未登记"项：一手来源（Cursor/Anthropic 等自家博客）的数字若没标出处，补一句轻量归属（"据 X 博客，约…"）；未登记 arXiv 先快速 WebSearch——确为真则保留并可补一手出处、查不到则软化为定性或去编号。判据：不过度对冲、不降低可读性，宁少改勿改肿；已在基线/已核验的不动。本文件待办项：`

// [dir, 本文件软化清单（无则空）]
const TASKS = [
  ["00-导论与心智模型", ""],
  ["01-Agent核心与推理范式", "Cursor Composer '4x 速度 / 46.9%' 等自家数字若无出处→补'据 Cursor'归属。"],
  ["02-Harness运行时", "'可靠性 2–3 个 9'、'8 种 compaction'、'token 解释占 80% 方差' 等若为他方数字无出处→补归属或软化。"],
  ["03-上下文工程", "'46.9%'(Cursor)无出处→补归属；arXiv 2504.13171 未登记→WebSearch 核实，真则留、否则软化。"],
  ["04-工具与MCP", "本章 MCP 时代一组 arXiv 编号若未登记→逐个快速 WebSearch，真则留(可补出处)、查不到软化。MCP 捐赠数据已在批次2 核实，勿动。"],
  ["05-规划与任务分解", ""],
  ["06-记忆系统", "arXiv 2508.19828 / 2507.07957 / 2501.01880 未登记→WebSearch 核实，真则留、否则软化为定性。"],
  ["07-检索与RAG", "Cursor '+12.5%'、'P99 4.03h→21s' 等自家数字无出处→补'据 Cursor'归属。"],
  ["08-多智能体编排", "'token 解释占 80% 方差' 类他方数字无出处→补归属或软化。"],
  ["09-评估", ""],
  ["10-可观测性与调试", ""],
  ["13-大厂案例研究", "arXiv 2508.12752 未登记→WebSearch 核实，真则留、否则软化。"],
  ["14-技术栈速查", "arXiv 2505.02279 / 2507.21504 / 2310.11703 未登记→逐个 WebSearch；'token 80% 方差'无出处→归属/软化。"],
  ["15-面试题库", "'token 80% 方差' 类无出处→归属/软化。"],
  ["16-Agent训练与强化学习", "A/B 实验 '+2.28% / -3.13%' 若为某方私有数据无出处→补归属或软化为定性。"],
  ["17-互操作协议与Agent经济", "arXiv 2508.03101 / 2508.03095 未登记→WebSearch 核实，真则留、否则软化。"],
]

const SCHEMA = {
  type:"object",
  required:["dir","applied"],
  properties:{
    dir:{type:"string"},
    applied:{type:"boolean"},
    subagentReplacements:{type:"integer",description:"subagent 家族替换处数"},
    duojaiNormalized:{type:"integer",description:"多代理→多智能体 处数"},
    softenChanges:{type:"array",items:{type:"object",required:["what"],properties:{what:{type:"string"},before:{type:"string"},after:{type:"string"}}}},
    verifiedFacts:{type:"string"},
    notes:{type:"string"},
  }
}

phase('收尾')
const fileWork = parallel(TASKS.map(([dir, soft]) => () =>
  agent(`${COMMON}
${soft ? SOFT + soft : "本文件无广谱软化待办，只做术语统一。"}

【目标文件】${ROOT}/${dir}/README.md
完成后按 schema 返回（含替换处数与软化改动）。`, {schema:SCHEMA, phase:'收尾', label:dir.slice(0,2)})
))

const buildWork = agent(`${COMMON.split('【术语统一规则')[0]}

你只加固 ${ROOT}/site/assets/_build.py 的 markdown 解析健壮性（当前内容已验证可正常构建、本批是面向未来内容演进的防御性加固，务必不改变现有 18 章的渲染输出）：
1) 开栏代码块正则：现 \`^\\\`\\\`\\\`(\\w+)?\` 对 \`c++\`/带 title 的语言串会丢字符——改为只取首个语言 token（容忍 \`\\\`\\\`\\\`python title=...\` 这类）。
2) emit_table：切分列前，先用占位符保护行内代码（反引号内）中的字面 \`|\`，避免把代码里的竖线当列分隔。
3) md_link：对 .md / 目录类内链增加回退（无 NN 前缀时回退到 overview.html / index.html，不要原样吐出坏链）。
4) 删除 is_timeline 中 \`len(header)==3 and h0 in YEAR_HEAD\` 这条永远为假的死代码。
5) h3 的 heading-anchor 补 aria-label="锚点"（与 h2 一致）。
改完【在仓库根运行 python3 site/assets/_build.py】，并把 site 与改前逐文件 diff 验证"现有 18 章渲染零变化"（若有非预期 diff 要说明）。`,
  {schema:{type:"object",required:["applied","renderUnchanged"],properties:{applied:{type:"boolean"},renderUnchanged:{type:"boolean"},changes:{type:"array",items:{type:"string"}},notes:{type:"string"}}}, phase:'收尾', label:'build加固'})

const [files, build] = await parallel([() => fileWork, () => buildWork])
return { files: (files||[]).filter(Boolean), build }
