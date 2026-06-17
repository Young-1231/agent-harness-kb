export const meta = {
  name: 'kb-fix-batch4',
  description: '批次4（已批准）：多智能体/多 agent → multi-agent 全库统一 + 单 agent 对照归一 + 根README subagent 残留',
  phases: [{ title: 'multi-agent 统一', detail: '一文件一 agent：全库术语英文化，保护专有名「多智能体编排」与结构身份' }],
}

const ROOT = '/Users/max/Projects/Agent-Harness-知识库'
const RULE = `用户已批准：把 multi-agent 家族全库统一为英文。规则（精确、机械、逐处看语境）：
① "多智能体" → "multi-agent"；"多 agent"/"多 Agent"/"多agent" → "multi-agent"。中英混排按本库习惯补空格、保持句子通顺。
② 对照归一：与 multi-agent 直接对照出现的 "单智能体"/"单 agent"/"单 Agent" → "single-agent"（如「单 vs 多 agent」→「single-agent vs multi-agent」「单智能体系统」→「single-agent 系统」）。只在确为"单/多 agent"对照语境时改；孤立的"单"不要乱改。
③【必须保护、绝不改】：
   - 专有名 "多智能体编排"（这是第 08 章/学科正式名，全库约 31 处，凡出现一律保留原样，包括 [[08]] 多智能体编排 这类章名引用）。
   - 章 H1 标题（如 "# 08 · 多智能体编排（Multi-Agent Orchestration）"）。
   - 代码块（围栏 \`\`\` 内，含 ASCII 依赖图/注释，如 OVERVIEW 的依赖地图、08 的伪代码注释 "# 子 agent…"）、URL、参考文献英文题名（如 Don't Build Multi-Agents、How we built our multi-agent research system）、[[NN]] 两位数标签内文字。
④ 小节标题 ##/### 里的"多智能体"可改为 multi-agent（锚点是 sec-N 位置式、改标题文本不影响导航与 TOC），但若标题就是"多智能体编排"则保留。
⑤ 不碰 site/*.html（我稍后统一重建）。最小改动、别误伤、别把通顺句改肿。
改完用 grep 自检：除"多智能体编排"/代码块/参考题名外，不应再有裸"多智能体"或"多 agent"。`

const SCHEMA = {
  type:"object",
  required:["file","applied"],
  properties:{
    file:{type:"string"},
    applied:{type:"boolean"},
    multiAgentReplacements:{type:"integer"},
    singleAgentReplacements:{type:"integer"},
    proprietaryKept:{type:"integer",description:"保留的「多智能体编排」处数"},
    extra:{type:"string",description:"额外清理（如根 README subagent 残留）"},
    residualCheck:{type:"string",description:"自检结果：还剩哪些裸 多智能体/多 agent（应只在保护项内）"},
    notes:{type:"string"},
  }
}

// 18 章 + OVERVIEW + 根 README
const FILES = [
  "00-导论与心智模型/README.md","01-Agent核心与推理范式/README.md","02-Harness运行时/README.md",
  "03-上下文工程/README.md","04-工具与MCP/README.md","05-规划与任务分解/README.md",
  "06-记忆系统/README.md","07-检索与RAG/README.md","08-多智能体编排/README.md",
  "09-评估/README.md","10-可观测性与调试/README.md","11-生产工程/README.md",
  "12-安全与对抗/README.md","13-大厂案例研究/README.md","14-技术栈速查/README.md",
  "15-面试题库/README.md","16-Agent训练与强化学习/README.md","17-互操作协议与Agent经济/README.md",
  "OVERVIEW-发展总脉络.md","README.md",
]

phase('multi-agent 统一')
const results = await parallel(FILES.map(rel => () => {
  const extra = rel === "README.md"
    ? "\n额外：本文件（根 README 索引表）第 92 行还有 subagent 家族残留 \"子 agent\" → 改为英文 subagent。"
    : (rel === "08-多智能体编排/README.md"
      ? "\n注意：本章 multi-agent 出现最密集（且 §1 大量小节标题/案例标题含多智能体），逐处仔细；代码块里的伪代码注释（如 \"# 子 agent…\"）属代码块、保留不动。"
      : "")
  return agent(`${RULE}
${extra}

【目标文件】${ROOT}/${rel}
先 Read 全文，应用规则，grep 自检后按 schema 返回（含替换数、保留的「多智能体编排」数、residualCheck）。`,
    {schema:SCHEMA, phase:'multi-agent 统一', label:rel.split('/')[0].slice(0,6)})
}))

return { results: results.filter(Boolean) }
