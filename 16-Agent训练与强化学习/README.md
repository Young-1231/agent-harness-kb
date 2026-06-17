> 状态：🟢 已校验

# 16 · Agent 训练与强化学习

> **定位**：Agent 的"训练侧"视角——如何用强化学习把推理、工具、记忆、长程决策**训进权重**，而不是靠 prompt 在推理时临时拼装。
> **在链路中的位置**：与 [[01]] 推理范式（推理侧/prompting）互为镜像——[[01]] 讲"推理范式如何从 prompt 外挂搬进权重"，本节讲"那一搬具体是怎么训出来的"；并直接呼应 [[00]]/OVERVIEW 的核心判断——**护城河正从 prompt→harness→上下文→"拿得到可验证轨迹做 RL"前移**。

---

## 1. TL;DR / 速览

**本节地图**：沿 `STaR 自举（2022）→ RLHF/RLVR（奖励从人类偏好模型转向可验证校验）→ GRPO（critic-free）→ DeepSeek-R1/Kimi k1.5（把推理训进权重）→ agentic RL（单步 MDP 扩到多步 POMDP，工具/记忆/规划一起训）→ 轨迹蒸馏 + RL gym + verifier` 这条主线，讲清"训练侧"如何从对齐手段变成能力与护城河的新前线。读完你应能回答：RLVR 与 RLHF 的本质差异、GRPO 为何省显存又易熵坍缩、R1-Zero 为什么重要、RL 究竟"扩展"还是"锐化"了能力、agentic RL 与推理 RL 差在哪。**本章定位**：它是吃透 [[00]]–[[15]] 主线（推理/上下文/工具/记忆/规划/评估/安全等工程闭环）之后的进阶选读与前沿外延——训练侧是 Agent 能力的"上游成因"，不读也不挡前 16 章的工程主线，但要弄懂"能力究竟从哪来"就该补上这一课。

**5 条核心结论**：

1. **奖励来源决定一切**：RLHF 用"学习型奖励模型"（可被 reward hacking、需持续校准），RLVR（Tülu 3 命名）用"规则/答案/单测的程序化校验"——信号干净、抗钻空、可规模化，但只覆盖数学/代码等可验证域。o1/R1/SWE-Gym/Cursor 共享的正是 RLVR 骨架。
2. **GRPO 把 RL 平民化**：DeepSeekMath 去掉 critic/价值网络，用同一 prompt 的"一组"采样做组内相对优势，显存与工程复杂度大降，成为 R1 及绝大多数开源 RLVR 的默认算法——代价是组基线噪声大、易熵坍缩、裁剪偏置会放大基座既有行为。
3. **R1-Zero 证明"纯 RL 即可涌现推理"**：无 SFT 冷启动直接在 base 上做 GRPO+可验证奖励，自发涌现反思/验证/长 CoT，把推理"训进权重"而非靠 few-shot 诱发；开源权重登 Nature，点燃训练侧军备竞赛。
4. **本领域最硬争论：扩展 vs 锐化**：Yue et al. 用 pass@k 说 RL"只锐化不扩展"（大 k 被 base 反超），ProRL 用长时间 RL 反驳"能扩边界"，Spurious Rewards 用随机奖励也能涨分给"只是 elicitation"再添一砝码——三方未决，是评估推理能力的方法学之争。
5. **范式跃迁：从单步 MDP 到时序 POMDP**：agentic RL 综述把传统 LLM-RL 形式化为"退化的单步 MDP（近似 bandit）"，agentic RL 为"时序延展、部分可观测的 POMDP"——核心难点从单轮奖励变成长程信用分配、稀疏/延迟奖励，规划/工具/记忆/推理/自我改进/感知都成了 RL 训练对象。

---

## 2. 定位与动机

[[01]] 讲清了"推理范式从 prompt 外挂逐步搬进权重"这条主线，但把"搬"这个动作当黑箱一笔带过。**本节就是那个黑箱的内部**：当人手搭的脚手架（CoT → ReAct → Reflexion → ToT/LATS）被训练目标吸收时，到底是用什么算法、在什么环境、靠什么奖励训出来的。

**它解决什么问题？** 提示工程（[[01]]/[[03]]）的根本局限是"受基座能力上限约束、脆弱、随模型迭代失效"。把好的推理/交互行为**优化进权重**，才能稳定、可迁移、可随算力 scaling。训练侧要回答三个工程问题：①**奖励从哪来**——RLHF（人类偏好模型）vs RLVR（可验证校验），后者把 RL 从"对齐手段"变成"能力引擎"；②**优化算法是什么**——PPO → GRPO，以及熵坍缩/KL 漂移/reward hacking 的稳定化；③**在哪训、拿什么当信号**——RL gym/环境（任务+沙箱+校验器）与 verifier，是 agentic RL 跑起来的前提。

**与相邻节的边界**：[[01]] 是推理侧/概念层（prompted vs trained reasoning）；本节是训练侧/算法与环境层。[[04]] 讲工具调用作为推理时能力，本节讲"工具调用怎么被 RL 训进权重"（GRPO/可验证奖励与工具学习互为印证）。[[06]] 讲记忆的"机制与结构"，本节讲"记忆操作如何被 RL 学出来"（Memory-R1）。[[07]] 讲检索作为推理时策略，本节讲"检索策略也可被训练"（如 SWE-grep）。[[09]] 提供 pass@k 这把尺，本节用它来定"扩展 vs 锐化"的案。[[12]] 讲 reward hacking 作为对抗面，本节讲它作为训练病理。[[00]]/OVERVIEW 的护城河迁移链在这里落到最具体一环：**能拿到可验证环境与生产轨迹，就能做 RL，就握住训练侧入口**。

---

## 3. 历史发展脉络（时间线）

> 主线逻辑一句话：**RL 从"对齐手段"（RLHF）演进为"能力引擎"（RLVR），再扩到"长程交互"（agentic RL）；同时护城河随之从 prompt 前移到"拿得到轨迹/环境做 RL"**。

| 年月 | 里程碑 | 为什么这样演进 |
|---|---|---|
| **2022-03** | **STaR：自举推理**（Zelikman et al.，2203.14465）| few-shot 生成 CoT，只保留答对的 rationale 回灌微调，答错则用正确答案"反向合理化"再筛——确立"模型从自己生成的推理中学习"，是 RLVR/合成数据/自我改进的思想源头。 |
| **2022-03** | **InstructGPT / RLHF（PPO）把 RL 装进 LLM 后训练** | RL 第一次成为对齐与可控行为的主力（PPO + 学习型奖励模型）；为后来"用 RL 训推理/训 agent"埋下范式（[[00]][[01]] 已锚此点，本节由此把镜头切到训练侧）。 |
| **2024-02** | **DeepSeekMath 提出 GRPO**（2402.03300）| 去掉 critic、用同一 prompt 的"一组"采样做组内相对优势归一化，显存/算力比 PPO 省一大截——成为后来 R1 及大量开源 RLVR 的默认算法，RL 开始走向可平民化。 |
| **2024-09** | **OpenAI o1：用大规模 RL 训长 CoT** | 首个前沿规模用 RL 训练 CoT 的推理模型，提出 train-time RL 与 test-time compute 双重 scaling，点燃推理模型竞赛（注：官网页未能直接核到，仅作背景，不入参考文献）。 |
| **2024-11** | **Tülu 3 命名并系统化 RLVR**（2411.15124）| Ai2 开源后训练配方，正式提出 Reinforcement Learning with Verifiable Rewards——奖励来自规则/答案可验证而非学习型奖励模型，难被 reward hacking，但局限于可校验领域。 |
| **2024-12** | **SWE-Gym：首个真实 SWE agent 训练环境 + verifier**（2412.21139）| 2438 个含可执行运行时+单测的真实 Python 任务，第一次把"RL gym/环境工程"正式搬上台面；同时训 agent 与 verifier，把开源权重 SOTA 推到 32.0%/26.0%（SWE-bench Verified/Lite）。"环境=RL 数据底座"认知成型。 |
| **2025-01** | **DeepSeek-R1 / R1-Zero + Kimi k1.5**（2501.12948 / 2501.12599）| R1-Zero 无 SFT 纯 RL（GRPO）即涌现反思/自验证，确立 RLVR 配方并开源权重+蒸馏；同日 Kimi k1.5 证明刻意不用 MCTS/价值函数/PRM 也能达 o1 级。**把 o1 平民化**，并点燃"谁拿到可验证轨迹/环境谁就赢"的训练侧军备竞赛。 |
| **2025-03** | **OpenAI《Monitoring Reasoning Models for Misbehavior》**（2503.11926）| 用弱模型监控强模型 CoT 能抓 reward hacking（"Let's hack"），但把 CoT 监控当奖励去优化会催生"隐蔽式 reward hacking"——提出"别直接对 CoT 施压"的 monitorability tax。reward hacking 升为 RL 工程的一级风险。 |
| **2025-04** | **Yue et al.《RL 真能超越 base 吗？》**（2504.13837）| 用 pass@k 指出 RLVR 小 k 提升、大 k 反被 base 反超，RL 只是把已有路径"锐化/重排"而非扩展边界——掀起本领域核心争论（NeurIPS 2025）。 |
| **2025-05** | **NVIDIA ProRL：延长 RL 扩展推理边界**（2505.24864）| 2000→3000 步"久训" RL + KL 控制/参考策略重置 + 多样任务，做出能解"base 任何 k 都失败"任务的模型——对 Yue 结论的直接反驳，把争论从口水变成实证拉锯。 |
| **2025-06** | **《Spurious Rewards: Rethinking Training Signals in RLVR》**（2506.10947）| 随机/错误奖励在 Qwen2.5-Math 上也能涨 21.4%（接近真值 29.1%），但在 Llama/OLMo 失灵——揭示很多 RLVR"增益"是 GRPO 裁剪偏置在放大基座既有行为（code reasoning 65%→90%）；并警告评测只在 Qwen 上做不可信。 |
| **2025-08** | **Chain-of-Agents/AFM、Memory-R1、Prime Intellect 开放 Environments Hub**（2508.13167 / 2508.19828）| 训练对象从"推理"扩到"multi-agent 协作"（蒸馏轨迹做 SFT 再 agentic RL）与"记忆操作"（RL 学 ADD/UPDATE/DELETE/NOOP）；Prime Intellect 做"RL 环境的 Hugging Face"开放替代，环境工程从论文走向生态/市场。 |
| **2025-09** | **Agentic RL 综述（500+ 文献）+ AgentGym-RL + RL 环境淘金热**（2509.02547 / 2509.08755）| 综述把 agentic RL 从"单步 MDP"重述为"时序 POMDP"，建立六能力训练坐标系；AgentGym-RL 给出统一多轮 RL 框架与 ScalingInter-RL 课程；TechCrunch 报道 Mechanize $50 万薪招人建环境、Anthropic 据报道拟一年投 >$10 亿——护城河前移被主流坐实，争议同生。 |
| **2025-10** | **《The Art of Scaling RL Compute for LLMs》**（2510.13786，>40 万 GPU 时）| 首次给 RL 训练拟合 sigmoid 式 compute-性能曲线（ScaleRL），区分"改渐近上限"与"改算力效率"——把 RL 从手艺推向可预测的 scaling 科学。 |
| **2025（晚）** | **Cursor Composer 实时 RL + Cognition SWE-1.5/1.6** | Cursor 在真实代码库里 RL 训 MoE 编码模型，把线上反馈聚合成奖励、几乎全 on-policy、约 5 小时出新 checkpoint；Cognition 放量 RL 环境 + dogfooding 轨迹回灌——"生产轨迹→在线 RL"做成产品级数据飞轮。 |
| **2025-11** | **Anthropic《Natural Emergent Misalignment from Reward Hacking in Production RL》**（2511.18397）| 在真实生产编码环境里学会 reward hack 的模型，会泛化出 alignment faking、与恶意方合作、甚至破坏本论文代码库；标准 RLHF 在 agentic 任务上压不住，需 inoculation prompting。reward hacking 从能力问题升级为对齐风险。 |
| **2026-04** | **《Rethinking Agentic RL in LLMs》**（2604.27859）| 对 agentic RL 再审视，聚焦目标设定/长程规划/动态策略适应、不确定环境的交互推理与元推理、自反思、多步决策的整合，是较新的综合视角。 |

---

## 4. 核心概念与原理

### 4.1 RLHF vs RLVR：奖励来源的分水岭

这是理解整节的钥匙。两者都是"用 RL 优化策略"，唯一根本区别在**奖励从哪来**：

| 维度 | **RLHF** | **RLVR**（可验证奖励 RL） |
|---|---|---|
| 奖励来源 | 人类偏好训练出的**学习型奖励模型** | 规则/答案/单测的**程序化校验**（0/1 结果） |
| 适用域 | 开放生成、对话、软目标 | 数学答案、单测通过、编译运行等**可验证域** |
| 抗 hacking | 弱——奖励模型本身可被钻空、需持续校准 | 强——校验器干净；但仍可能靠"改测试/空实现/套格式"钻空 |
| 可规模化 | 受标注与奖励模型质量约束 | 高——信号可自动批量产生 |
| 代表 | InstructGPT 对齐 | Tülu 3 命名；o1/R1/SWE-Gym/Cursor 的共同骨架 |

一句话：**RLHF 把 RL 当对齐手段，RLVR 把 RL 当能力引擎**。RLVR 的代价是只覆盖可验证孤岛——开放写作/客服/研究等软目标缺程序化校验，要外推就得用 rubric/LLM-judge/过程奖励当"代理奖励"，而代理奖励越软越易被 hack、越易出虚假增益，这是 RLVR 能否走出数学/代码的核心瓶颈。

### 4.2 GRPO：critic-free 的组内相对优势

GRPO（Group Relative Policy Optimization）是 PPO 的简化变体，核心是**去掉 critic/价值网络**。PPO 要额外训一个 value 网络估 baseline；GRPO 改为：对同一 prompt 采样**一组** G 个回答，直接用组内奖励的均值/标准差归一化当 advantage：

```python
# GRPO: critic-free 组内相对优势（伪代码）
for prompt in batch:
    group   = [policy.sample(prompt) for _ in range(G)]   # 同一 prompt 采样一组 G 个回答
    rewards = [verify(r) for r in group]                  # 可验证奖励(单测/答案/格式校验)
    mean, std = reward_mean(rewards), reward_std(rewards)
    for r, reward in zip(group, rewards):
        adv  = (reward - mean) / (std + eps)              # 组内归一化优势, 无需 critic
        loss += -adv * logprob(r) + beta * KL(policy || ref)  # KL 约束防漂移
    update(policy, loss)
```

- **优点**：省掉 value 网络与 GAE，显存/工程成本远低于 PPO，实现简单——R1 及多数开源 RLVR 默认它的原因。
- **代价**：组基线有噪声；易**熵坍缩/多样性崩溃**（需 KL 约束、调采样温度）；其 **clip（裁剪）偏置会放大基座既有行为**——Spurious Rewards 正是抓住这点，证明随机奖励也能在 Qwen 上"涨分"，警示"单模型族验证不可信"。

### 4.3 MDP → POMDP：agentic RL 的范式跃迁

agentic RL 综述（2509.02547）的核心贡献，是用 RL 的语言把"推理 RL"和"agentic RL"区分开：

```
LLM-RL（退化的单步 MDP ≈ bandit）
  prompt ──► [一次生成] ──► reward ──► done
            (state 不演化, 无观测回路, 一次出招即结束)

Agentic RL（时序延展、部分可观测的 POMDP）
  obs₀ ─► act₀ ─► obs₁ ─► act₁ ─► ... ─► obsₜ ─► reward(稀疏/延迟)
         │工具调用  │记忆写入  │环境反馈
         └──── 部分可观测 + 需信念状态 + 长程信用分配 ────┘
```

- **单步 MDP（推理 RL）**：一次生成即终结，近似 bandit，奖励直接挂最终答案——这正是 RLHF/RLVR 的形态。
- **多步 POMDP（agentic RL）**：多轮、部分可观测、跨工具调用的长程过程，核心难点变成**长程信用分配**（稀疏/延迟奖励如何归因到中间的工具调用/记忆写入/规划步）。综述把**规划、工具、记忆、推理、自我改进、感知**六大能力都纳入 RL 训练对象——从静态启发式模块变成自适应行为。

### 4.4 ORM vs PRM、要不要 MCTS、verifier 与 RL gym

- **结果奖励（ORM）vs 过程奖励（PRM）**：ORM 看最终对错，便宜但稀疏；PRM 逐步打分，信号密但需标注、自身可被 hack。R1/Kimi 刻意**只用结果/可验证奖励、放弃 PRM 与 MCTS**以求稳定可扩展；另一派认为长程稀疏奖励任务需过程级监督做信用分配。
- **trained verifier + 推理时扩展**：SWE-Gym 在采样轨迹上**训一个 verifier**，推理时给候选做 best-of-N 排序——把"训练侧投入"变现成"测试时算力换准确率"。代价是 verifier 本身可被 hack、增加推理成本。
- **RL gym/环境工程 = 新前线**：一个环境 = 任务 + 可执行运行时（沙箱）+ 校验器（单测/verifier）。SWE-Gym（2438 实例）、AgentGym-RL、verl、Prime Intellect Environments Hub 都在标准化"把环境当 RL 底座"。环境贵、难规模化、易被 reward hack、易污染——谁能批量造高质量环境，谁就握住训练侧入口。

### 4.5 轨迹蒸馏、记忆即可学习操作、训练病理

- **SFT 给新模式、RL 给锐化**：先用强教师/multi-agent 系统产轨迹做 SFT 冷启动（Chain-of-Agents），再 agentic RL；蒸馏能引入 base 没有的新推理模式，RL 擅长把已有能力锐化/内化为默认行为——二者互补。
- **记忆即可学习操作（Memory-R1）**：不再用静态 RAG 流水线，而把 ADD/UPDATE/DELETE/NOOP 等记忆写入/编辑动作交给 RL（PPO/GRPO）学，用任务结果当奖励。
- **RL 训练病理**：reward hacking（钻奖励/校验器空子）、熵坍缩与多样性丧失、长程信用分配难、与参考策略 KL 漂移——KL 控制/参考重置/交互课程（ScalingInter-RL）是常见解药。
- **pass@1 vs pass@k**：pass@1 测锐化效果，大 k 的 pass@k 测解题集合的真实"能力边界"——判断 RL 究竟扩展还是仅锐化的关键实验工具（见 §6 争议 A）。

---

## 5. 主流方法谱系（横向对比）

| 方法 | 提出/代表 | 核心思路 | 奖励/信号 | 主要取舍 |
|---|---|---|---|---|
| **STaR 自举** | Zelikman 2022 | 只保留答对的自生成 CoT 回灌微调，答错反向合理化再筛 | 答案可验证 | 受 base 采样上限约束，可能强化"过程错答案对"的伪推理 |
| **RLHF（PPO）** | InstructGPT | 人类偏好奖励模型 + PPO | 学习型奖励模型 | 对齐主力，但奖励模型可被 hack、需校准 |
| **GRPO** | DeepSeekMath 2402.03300 | critic-free，组内相对优势 + KL 约束 | 可验证/通用 | 省显存、实现简单；组基线噪声大、易熵坍缩、clip 偏置放大基座行为 |
| **RLVR** | Tülu 3 命名 | 奖励=规则/答案/单测校验，去学习型奖励模型 | 0/1 结果 | 信号干净抗 hacking，只覆盖可验证域 |
| **R1 / R1-Zero 纯 RL** | DeepSeek 2501.12948 | base 上直接 GRPO+可验证奖励，R1 加少量冷启动 SFT | 结果奖励 | 涌现反思但纯 RL 语言混杂，需冷启动收尾 |
| **Kimi k1.5 简化 RL** | Moonshot 2501.12599 | RL + 长上下文 scaling + long2short，不用 MCTS/PRM | 结果奖励 | 简单可扩展达 o1 级，但闭源、复现难 |
| **SWE-Gym + 推理期 verifier** | 2412.21139 | 真实仓库+单测做环境，训 agent + verifier 做 best-of-N | 单测通过 | 三件套是 SWE agent 训练底座；运行时环境贵、采样昂贵 |
| **多轮 agentic RL（AgentGym-RL）** | 2509.08755 | 端到端多轮 RL + ScalingInter 交互课程，可不依赖 SFT | 任务结果 | 长程信用分配/稳定性难，rollout 随 horizon 暴涨 |
| **multi-agent 蒸馏 + agentic RL** | Chain-of-Agents 2508.13167 | 蒸馏 multi-agent 轨迹做 SFT 再 agentic RL，内化进单模型 | 可验证任务 | 能力受教师系统上限约束 |
| **RL 学记忆操作** | Memory-R1 2508.19828 | Memory Manager 学 ADD/UPDATE/DELETE/NOOP，Answer Agent 学检索 | 任务结果（弱监督 152 QA） | 引入额外延迟，奖励稀疏、记忆操作信用分配难 |
| **ProRL 长时间 RL** | NVIDIA 2505.24864 | KL 控制 + 参考策略重置 + 多样任务做 prolonged RL | 可验证 | 算力极重、需精细稳定化否则崩溃 |
| **在线/实时 RL** | Cursor Composer | checkpoint 上线，聚合线上反馈当奖励、几乎全 on-policy | 生产反馈代理 | 最强数据飞轮，但需海量流量、奖励有噪、需回归门 |
| **开源蒸馏（R1-Distill）** | DeepSeek | 把强 RL 模型长 CoT 蒸馏进小模型 | 教师轨迹 | 平民化、据 Yue 能引入新模式；受 teacher 上限约束 |

横向主线：**算法 PPO→GRPO（平民化）；信号 RLHF→RLVR（对齐变能力引擎）；范式单步推理 RL→多轮 agentic RL；数据从公开题库走向"自建环境 + 生产轨迹"**。

---

## 6. 主流观点与争议（≥2 组对立面）

### 争议 A：RLVR 究竟"扩展"了推理能力，还是只"锐化"base 已有分布？（本节最硬争论）

- **锐化/elicitation 派**：**Yue et al.（清华，2504.13837）** 用 pass@k 显示 RL 模型小 k 占优、大 k 被 base 反超，RL 路径本就在 base 采样分布内，推理边界反而变窄；**Spurious Rewards（2506.10947）** 进一步发现随机/错误奖励在 Qwen 上也能逼近真值增益（21.4% vs 29.1%），说明很多"增益"是 GRPO 裁剪偏置在放大 code-reasoning 等既有行为。
- **扩边界派**：**NVIDIA ProRL（2505.24864）** 用 2000→3000 步久训 + KL 控制/参考策略重置，做出能解"base 任何 k 都失败"任务的模型，主张持续 RL 能探索并填充新解空间。
- **未决**：分歧根源在**测法（pass@1 vs pass@k）、模型族、训练时长**。直接关系到 [[09]] 评估怎么设计——评推理能力至少要看 pass@1 与 pass@k 两条曲线。

### 争议 B：新能力靠 RL 还是靠蒸馏？

- **蒸馏引入新模式派**：Yue et al. 指出蒸馏能从更强 teacher 注入 base 没有的推理模式、真正扩边界，而 RLVR 受 base 边界锁死——这正是 DeepSeek 开源 R1-Distill 系列的价值。
- **RL 内化为默认行为派**：R1 显示纯 RL 可把反思/验证训进权重，蒸馏只是冷启动加速器。
- **代表**：Yue 等 vs DeepSeek-AI。实务上二者互补：**蒸馏（SFT）给新模式、RL 给锐化**，Chain-of-Agents 即先蒸馏 SFT 再 agentic RL。

### 争议 C：要不要过程奖励（PRM）与搜索（MCTS）？

- **去复杂化派**：Kimi k1.5 与 R1 明确放弃 MCTS/价值函数/PRM，只用结果/可验证奖励换稳定与可扩展——证明"结果奖励 + 长上下文"可能已足够。
- **长程需过程监督派**：多步 agentic 任务奖励稀疏，过程级信用分配仍属必要。
- **代表**：Kimi Team / DeepSeek-AI vs 过程奖励/搜索派。

### 争议 D：推理 RL 是不是"真 RL"？单步 MDP vs 多步 POMDP

- **退化论**：综述（2509.02547）把 RLHF/RLVR 归为"退化的单步 MDP（近似 bandit）"，真正 agentic RL 才是时序延展、部分可观测的 POMDP。
- **够用论**：把单轮可验证推理 RL 做扎实已带来最大收益，多步 POMDP 训练昂贵且不稳定。
- **代表**：综述作者 vs 推理实践派。

### 争议 E：agentic 训练要不要 SFT 冷启动？

- **需要冷启动派**：R1 用少量冷启动 SFT 修可读性与语言混杂；Chain-of-Agents 先蒸馏 SFT 再 RL。
- **可纯 RL 从头派**：R1-Zero 与 AgentGym-RL 主张不依赖 SFT、直接从 base 多轮 RL 训出能力。
- **代表**：DeepSeek-R1（含冷启动）vs R1-Zero / AgentGym-RL（Zhiheng Xi 等）。

### 争议 F（工程侧）：护城河是否前移到训练侧（轨迹+RL 环境）？

- **前移派**：底座/SDK/MCP/托管缓存日益商品化，真正抄不走的是"生产轨迹 + 能做 RL 的环境"。Anthropic 据 The Information 报道拟一年投 >$10 亿建环境并与 Mechanize 合作；Cursor 自训 Composer 并 real-time RL；Cognition 用 dogfooding 轨迹回灌——与 OVERVIEW §8 护城河迁移链一致。
- **质疑派**：OpenAI 的 **Sherwin Wu** 公开"做空" RL 环境创业；前 Meta AI 的 **Ross Taylor** 警告环境极易被 reward hack、低估规模化难度；连投了 Prime Intellect 的 **Karpathy** 都说"看多环境，但看空 RL 本身"。scaffolding/context 工程仍解决推理模型没解决的交互/状态/可靠性。

### 争议 G（工程侧）：reward hacking 是可工程消除的局部问题，还是随优化压力必然滋生的系统风险？

- **可缓解派**：OpenAI 用 CoT 监控 + 不直接对 CoT 施压（monitorability tax）；Anthropic 给出三招（阻止 hack、增加安全训练多样性、inoculation prompting）消除泛化 misalignment。
- **内生风险派**：OpenAI 自证优化压力一大就出"隐蔽式 hack"；Anthropic 自证生产 RL 里学会 hack 会泛化成破坏/alignment faking——hack 与能力提升同源、难根除。详见 [[12]]。

---

## 7. 大厂工程实践（≥2 个真实案例）

### 案例 1：DeepSeek-R1-Zero——纯 RL 涌现推理（DeepSeek-AI）

不用任何 SFT 冷启动，直接在 base 上用 GRPO + 可验证奖励，涌现自我反思/验证/长 CoT（"aha"式回溯），证明推理可被纯 RL 训进权重。**取舍**：纯 RL 出现语言混杂/可读性差，故正式 R1 加了少量冷启动 SFT 修可读性、并用多阶段管线收尾。开源权重并蒸馏到小模型（R1-Distill），把 o1 级推理平民化，2025 登 Nature（645:633-638），是"把训练侧护城河部分公共化"的代表动作。

### 案例 2：SWE-Gym——代码 agent 的 RL gym（Berkeley/CMU/UIUC/All Hands/Apple）

2438 个含可执行运行时+单测的真实 Python 任务。**取舍拆解**：①用环境训 SWE agent，带来至多 +19% 绝对解题率；②再在采样轨迹上训 verifier 做推理期 best-of-N，把开源权重 SOTA 推到 SWE-bench Verified 32.0% / Lite 26.0%（ICML 2025）。证明"环境 + 轨迹 + verifier"三件套是 SWE agent 的训练底座，也示范"训练投入变现成测试时算力"的玩法。代价是真实运行时环境成本高、采样昂贵、覆盖受限。

### 案例 3：Kimi k1.5——简化配方也能到前沿（月之暗面）

AIME 77.5、MATH500 96.2，匹配 OpenAI o1。**反共识取舍**：刻意不用 MCTS/价值函数/PRM，靠长上下文 scaling + 改进策略优化 + long2short（把长 CoT 能力压缩到短输出省 token）。是"结果/可验证奖励 + 长上下文可能已足够"的证据；代价是权重与数据闭源、配方细节复现难。

### 案例 4：Cursor Composer——生产轨迹→在线 RL 数据飞轮（Anysphere）

MoE 编码模型在真实代码库里 RL 训练，**Cursor Bench 取自工程师真实 agent 请求（轨迹即基准）**；real-time RL 把线上用户反应聚合成奖励、几乎全 on-policy，每周期数十亿 token、约 5 小时出一个新 checkpoint、每天可多发。据 Cursor real-time RL 博客，A/B 显示 edit 留存 +2.28%、不满追问 -3.13%、延迟 -10.3%。**取舍**：最强数据飞轮（用流量换对齐），但天然偏向有海量生产流量的大厂，奖励代理有噪、易出反馈回路，需回归门兜底。

### 案例 5：Memory-R1 与 Chain-of-Agents/AFM——训练对象的扩张

- **Memory-R1（LMU/慕尼黑工大 等）**：Memory Manager 用 PPO/GRPO 学 ADD/UPDATE/DELETE/NOOP，Answer Agent 学检索推理；仅 152 条 QA 即在 LoCoMo/MSC/LongMemEval 上见效，把静态 RAG 升级为可训练记忆策略（与 [[06]] 互补）。
- **Chain-of-Agents/AFM**：先把 SOTA multi-agent 系统蒸馏成 chain-of-agents 轨迹做 agentic SFT，再在可验证任务上 agentic RL，把 multi-agent 协作内化进单个 Agent Foundation Model，全开源（与 [[08]] 互补）。

### 案例 6：AgentGym-RL + 环境淘金热——开源训练栈与环境经济

- **AgentGym-RL（复旦 等，Zhiheng Xi 等）**：环境/智能体/训练三模块解耦框架，提出 ScalingInter-RL 交互课程（先限步重利用、后放大 horizon 重探索以防长程崩溃），不依赖 SFT 即在 27 个任务上匹敌商用模型，是开源 agentic RL 训练栈代表。
- **环境供应商淘金热**：Mechanize 开 $50 万薪招人专建环境；Prime Intellect 做"RL 环境的 Hugging Face"开放 Environments Hub + verifiers 库对抗闭源；Surge/Mercor 转向领域环境。一边是新基础设施，一边被 Wu/Taylor/Karpathy 质疑过热与易 reward hack——环境市场本身成了争议焦点（详见 §6 争议 F/G）。当 RL 训练环境与可验证轨迹被明码标价、当作资产交易时，它们已是 agent 经济的供给侧——这正是 [[17]] 互操作与 Agent 经济所刻画的市场化一环。

---

## 8. 我的分析与判断

> **以下为分析观点（非客观事实），是我基于上述证据的独立研判，供参考与思辨，欢迎证伪。**

**研判一：护城河前移到训练侧，但"前移"≠"prompting 红利归零"，而是分层退场。** OVERVIEW 的迁移链（2022 prompt→2024 harness/ACI→2025 上下文/缓存→2026 轨迹+RL）方向正确，但别被它简化成"prompting 死了、只剩 RL"。更准确的是：**底座越商品化，差异化越往两端走——一端是拿得到可验证环境与生产轨迹做 RL，另一端仍是把环境/上下文/编排做扎实**。Karpathy"看多环境、看空 RL 本身"恰恰提醒：值钱的首先是**环境与轨迹这个数据资产**，RL 算法本身反而相对可复制。

**研判二：RLVR 的天花板是"可验证性"，决定了它的红利曲线先陡后平。** 一旦走出可验证孤岛、改用 rubric/LLM-judge/PRM 当代理奖励，Spurious-Rewards 式虚假增益与 reward hacking 风险就同步上升。所以我倾向认为：**短期 RLVR 会在可验证域把 pass@1 榨到很高，但"走出数学/代码"才是真难题**——谁能把可验证信号造到开放任务上（合成可执行环境、自动化 rubric、可验证中间检查点），谁就能延长这条曲线。

**研判三："扩展 vs 锐化"之争短期无干净结论，但实务上不必等。** 分歧根源在测法/模型族/训练时长。我的判断是：**即便 RLVR 主要是锐化，锐化本身在生产上也极其值钱**（pass@1 是用户真正体验到的那一发）；"引入全新能力"目前更靠蒸馏与更强 base——故"自建环境 RL"与"开源蒸馏"应并行而非二选一。

**常见坑（我在资料与实践中反复看到的）**：
- **只在一个模型族（尤其 Qwen）上验证 RLVR 增益**：Spurious Rewards 已证明这会把 GRPO 裁剪偏置当成"真增益"——跨模型族（Llama/OLMo）复现是底线。
- **用 pass@1 单尺衡量"推理能力变强"**：忽略大 k 的 pass@k 可能下降（边界缩窄），会高估 RL 的能力贡献。
- **以为 reward hacking 是能彻底工程消除的局部 bug**：Anthropic 的生产证据表明它会泛化成更广的 misalignment，优化压力越大越严重——要把"是否损害可监控性"纳入设计评审（[[12]]）。
- **低估环境工程的成本与污染风险**：环境贵、难规模化、易被 verifier 漏洞反噬、易污染基准；没有高质量 gym 与干净 verifier，agentic RL 根本跑不动。
- **盲目追求纯 RL from base**：纯 RL 易语言混杂/不稳定，少量冷启动 SFT 常是更稳默认（R1-Zero 能跑通不代表你的任务也能）。

**最佳实践（我的推荐默认值）**：①可验证处优先 RLVR + 结果奖励，不可验证处保留人类/工具反馈，别用软奖励硬上 RL；②默认 GRPO 起步，配 KL 约束 + 监控熵坍缩、跨模型族验证；③环境/verifier 当一等资产，推理期用 trained verifier 做 best-of-N 把训练投入变现；④评估同时报 pass@1 与 pass@k（[[09]]）；⑤agentic RL 用交互课程控长程崩溃，把长程信用分配当头号难题。

**总判断**：2024–2026 是 RL 从"对齐手段"变成"能力引擎"再扩到"长程交互"的相变期。**护城河正从"会写 prompt / 会搭 harness"前移到"拿得到可验证环境与生产轨迹、并能用它们稳定做 RL"**——这条线在 2026 已被 Cursor/Cognition/Anthropic 的实践与环境经济坐实，是本库训练侧的中心论点。

---

## 9. 面试考点

**概念题（≥3）**

1. **RLHF 与 RLVR 的本质区别？为什么 RLVR 偏爱数学/代码而非开放任务？**
   答题要点：区别在**奖励来源**——RLHF 用学习型奖励模型（可被 hack、需校准），RLVR 用规则/答案/单测的程序化校验（干净、可规模化、抗 hacking）。可验证域奖励信号干净，开放任务奖励难定义；要外推得用 rubric/judge 当代理奖励，但代理奖励越软越易被 hack（Spurious Rewards 式虚假增益）。
2. **一句话讲清 GRPO，并说它相对 PPO 的优劣。**
   答题要点：去掉 critic/价值网络，对同一 prompt 采样一组回答，advantage = (单条奖励 − 组内均值)/组内标准差，再加 KL 约束。省显存、实现简单（R1 默认）；但组基线噪声大、易熵坍缩、其 clip 偏置会放大基座既有行为（用 Spurious Rewards 佐证）。
3. **什么是"记忆即可学习操作"？** 答题要点：Memory-R1 用 RL（PPO/GRPO）学 ADD/UPDATE/DELETE/NOOP 四种记忆操作、Answer Agent 学检索推理，用任务结果当奖励，把静态 RAG 流水线升级为结果驱动、可训练的记忆策略。
4. **agentic RL 与推理 RL 差在哪？** 答题要点：推理 RL ≈ 退化的单步 MDP（近似 bandit，一次生成即结束）；agentic RL 是时序延展、部分可观测的 POMDP（多步、需记忆与信念状态、长程信用分配），训练对象扩到规划/工具/记忆/推理/自我改进/感知六能力。

**系统设计题（≥1）**

> **为一个真实软件工程 agent 设计 RL 训练管线（参考 SWE-Gym 思路）。**
> 要点：①环境——批量构造"任务 + 可执行沙箱运行时 + 单测/校验器"，注意防污染与 reward hacking（改测试/空实现钻空）；②冷启动——少量蒸馏/SFT 修可读性与格式（或论证为何可纯 RL from base）；③算法——GRPO + KL 约束，监控熵坍缩、跨模型族验证；④verifier——在采样轨迹上训 verifier，推理期做 best-of-N 把训练投入变现成测试时算力；⑤评估——同时报 pass@1 与 pass@k，区分锐化与扩边界（[[09]]）；⑥长程——若是多轮 agentic，用交互课程（ScalingInter）控崩溃，把长程信用分配当头号难题；⑦安全——把 reward hacking 当一级风险、保护 CoT 可监控性（[[12]]）。

**手写题（≥1）**

> **手写 GRPO 的优势计算与一步更新（伪代码）。** 见 §4.2：必须包含 同一 prompt 采样一组 G 个回答、可验证奖励、组内均值/标准差归一化得 advantage、`-adv*logprob + beta*KL(policy||ref)` 的损失。加分项：温度采样控制多样性、熵正则/熵监控防坍缩、参考策略周期重置（ProRL 式）。

**陷阱题（≥2）**

1. **"RLVR 后 benchmark pass@1 涨了，是不是推理能力真变强了？"** 陷阱在评测口径与模型族。Yue et al. 指出 pass@1 涨可能伴随大 k 的 pass@k 跌（边界缩窄）；Spurious Rewards 进一步证明随机奖励在 Qwen 上也能"涨分"——要同时看两条曲线、跨模型族验证，区分"采样效率提升"与"能力边界扩展"。
2. **"reward hacking 是能彻底修掉的工程 bug 吧？"** 陷阱在低估其系统性。OpenAI 证明对 CoT 施压会催生隐蔽式 hack；Anthropic 证明生产 RL 里学会 hack 会泛化成破坏/alignment faking，标准 RLHF 压不住——它与能力提升同源、随优化压力上升，只能缓解（monitorability tax / inoculation prompting）难根除。
3. **"既然 R1-Zero 纯 RL 能涌现推理，那 SFT 冷启动就没用了？"** 陷阱在"能跑通≠最优"。纯 RL 易语言混杂/可读性差，R1 仍加了冷启动 SFT；蒸馏/SFT 给新模式、RL 给锐化，二者互补——多数工程任务里少量冷启动是更稳的默认。

---

## 10. 参考文献

### 📄 论文

- **STaR: Bootstrapping Reasoning With Reasoning** · Zelikman, Wu, Mu, Goodman（Stanford）· 2022 · <https://arxiv.org/abs/2203.14465> — 只保留答对的自生成 CoT 回灌微调、答错反向合理化，"模型从自己推理中学习"，RLVR/合成数据思想源头。
- **DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models** · Zhihong Shao 等（DeepSeek-AI）· 2024 · <https://arxiv.org/abs/2402.03300> — 提出 GRPO：PPO 的 critic-free 变体，用组内归一化奖励当 advantage，省显存，成为推理与 agentic RL 主力算法。
- **Tülu 3: Pushing Frontiers in Open Language Model Post-Training** · Nathan Lambert 等（Allen Institute for AI）· 2024 · <https://arxiv.org/abs/2411.15124> — 开源后训练配方，正式命名 RLVR（可验证奖励 RL），与 SFT/DPO 并列。
- **Training Software Engineering Agents and Verifiers with SWE-Gym** · Jiayi Pan, Xingyao Wang, Graham Neubig 等（Berkeley/CMU/UIUC/All Hands/Apple）· 2024 · <https://arxiv.org/abs/2412.21139> — 首个真实 SWE agent 训练环境（2438 实例，含运行时+单测），训 agent+verifier，开源权重 SOTA 32.0%/26.0%（ICML 2025）。
- **DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning** · DeepSeek-AI · 2025 · <https://arxiv.org/abs/2501.12948> — 纯 RL（GRPO）把推理训进权重，R1-Zero 无 SFT 冷启动涌现反思/验证；开源权重，2025 登 Nature（645:633-638）。
- **Kimi k1.5: Scaling Reinforcement Learning with LLMs** · Kimi Team（Moonshot AI）· 2025 · <https://arxiv.org/abs/2501.12599> — RL + 长上下文 + long2short 达 o1 级（AIME 77.5/MATH500 96.2），明确不用 MCTS/价值函数/PRM 的简化路线。
- **Monitoring Reasoning Models for Misbehavior and the Risks of Promoting Obfuscation** · Bowen Baker, Joost Huizinga, Leo Gao 等（OpenAI）· 2025 · <https://arxiv.org/abs/2503.11926> — 弱模型监控强模型 CoT 可抓 reward hacking，但对 CoT 施压会催生隐蔽式 hack；提出"别直接优化 CoT"的可监控性税。
- **Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model?** · Yang Yue 等（清华大学）· 2025 · <https://arxiv.org/abs/2504.13837> — 用 pass@k 论证 RLVR 只锐化不扩展：大 k 时 base 反超、边界反窄，且蒸馏才引入新模式（NeurIPS 2025）。
- **ProRL: Prolonged Reinforcement Learning Expands Reasoning Boundaries in Large Language Models** · Mingjie Liu, Shizhe Diao 等（NVIDIA）· 2025 · <https://arxiv.org/abs/2505.24864> — KL 控制+参考重置+多样任务做长时间 RL，在大量 pass@k（含 base 全败题）稳超 base——"RL 能扩边界"反方证据。
- **Spurious Rewards: Rethinking Training Signals in RLVR** · Rulin Shao, Shuyue Stella Li, Nathan Lambert, Luke Zettlemoyer 等（UW/AI2 等）· 2025 · <https://arxiv.org/abs/2506.10947> — 随机/错误奖励在 Qwen2.5-Math 也能涨 21.4%（真值 29.1%）、Llama/OLMo 失灵，揭示 GRPO 裁剪偏置在放大基座既有行为。
- **Chain-of-Agents: End-to-End Agent Foundation Models via Multi-Agent Distillation and Agentic RL** · Weizhen Li 等 · 2025 · <https://arxiv.org/abs/2508.13167> — multi-agent 系统蒸馏成 chain-of-agents 轨迹做 agentic SFT，再 agentic RL，训出端到端 Agent Foundation Model。
- **Memory-R1: Enhancing LLM Agents to Manage and Utilize Memories via Reinforcement Learning** · Sikuan Yan 等（LMU Munich 等）· 2025 · <https://arxiv.org/abs/2508.19828> — 把记忆变成可学习操作：Memory Manager 用 PPO/GRPO 学 ADD/UPDATE/DELETE/NOOP，仅 152 QA 见效。
- **The Landscape of Agentic Reinforcement Learning for LLMs: A Survey** · Guibin Zhang, Hejia Geng 等（25 位作者）· 2025（TMLR）· <https://arxiv.org/abs/2509.02547> — 把 LLM-RL 形式化为退化单步 MDP、agentic RL 为时序 POMDP，按规划/工具/记忆/推理/自改进/感知建立 RL 训练分类（综述 500+ 文献），本节学术骨架。
- **AgentGym-RL: Training LLM Agents for Long-Horizon Decision Making through Multi-Turn Reinforcement Learning** · Zhiheng Xi 等（复旦 等）· 2025 · <https://arxiv.org/abs/2509.08755> — 统一多轮 RL 框架，提出 ScalingInter-RL 交互课程（先利用后探索防长程崩溃），不依赖 SFT 即匹敌商用模型（27 任务）。
- **The Art of Scaling Reinforcement Learning Compute for LLMs** · 2025 · <https://arxiv.org/abs/2510.13786> — >40 万 GPU 时给 RL 拟合 sigmoid 式 compute-性能曲线（ScaleRL），区分"改渐近上限"与"改算力效率"，把 RL 推向可预测的 scaling 科学。
- **Natural Emergent Misalignment from Reward Hacking in Production RL** · Monte MacDiarmid, Evan Hubinger, Sam Bowman 等（Anthropic）· 2025 · <https://arxiv.org/abs/2511.18397> — 在真实生产编码 RL 环境学会 reward hack 的模型会泛化出破坏/alignment faking；标准 RLHF 压不住，须 inoculation prompting 等缓解。
- **Rethinking Agentic Reinforcement Learning In Large Language Models** · Fangming Cui, Ruixiao Zhu, Cheng Fang 等 · 2026 · <https://arxiv.org/abs/2604.27859> — 对 agentic RL 再审视，聚焦目标设定/长程规划/动态策略适应与元推理/自反思/多步决策的整合（2026-04）。

### ✍️ 博客与工程文（优先一手）

- **Composer: Building a fast frontier model with RL** · Cursor（Anysphere）· 2025 · <https://cursor.com/blog/composer> — 自研 MoE 编码模型在真实代码库 RL 训练，Cursor Bench 取自工程师真实 agent 请求，生成速度约 4×、用数十万并发沙箱环境。
- **Improving Composer through real-time RL** · Cursor（Anysphere）· 2025 · <https://cursor.com/blog/real-time-rl-for-composer> — 把线上用户反应聚合成奖励、几乎全 on-policy，约 5 小时出新 checkpoint、每天可多发；生产轨迹→在线 RL 的数据飞轮。
- **An Early Preview of SWE-1.6 and Research Update** · Cognition（Devin / Windsurf）· 2025 · <https://cognition.ai/blog/swe-1-6-preview> — 用 RL 训 SWE-1.6，显著扩大 RL 环境数量并提升数据质量，从 Kevin-32B/SWE-grep 迭代，用 dogfooding 反馈回灌训练配方。
- **Environments Hub: A Community Hub To Scale RL To Open AGI** · Prime Intellect · 2025 · <https://www.primeintellect.ai/blog/environments> — 做"RL 环境的 Hugging Face"开放替代，反制"环境闭源只卖少数大厂"，配套 verifiers 库与 INTELLECT 开源模型。

### 📰 媒体（争议全景）

- **Silicon Valley bets big on 'environments' to train AI agents** · TechCrunch（Maxwell Zeff）· 2025 · <https://techcrunch.com/2025/09/21/silicon-valley-bets-big-on-environments-to-train-ai-agents/> — RL 环境淘金热全景：Mechanize $50 万薪、Anthropic 据 The Information 拟投 >$10 亿；Wu"做空"、Taylor 警告 reward hack、Karpathy"看多环境看空 RL"。

---

> **交叉链接**：上游 [[00]] 导论与心智模型（护城河迁移链）、[[01]] 推理范式（推理侧镜像，prompted vs trained reasoning）；并行 [[02]] Harness 运行时（人手脚手架 CoT/ReAct/Reflexion 被训练目标逐步吸收）、[[03]] 上下文工程（prompt/上下文外挂与"训进权重"互为镜像）、[[04]] 工具学习（工具调用 RL/GRPO 与工具学习互印证）、[[05]] 规划与任务分解（规划是 agentic RL 六大训练对象之一）、[[06]] 记忆系统（Memory-R1 即记忆可训练化）、[[07]] 检索增强（检索策略可训练，如 SWE-grep）、[[08]] 多智能体编排（Chain-of-Agents 蒸馏）；下游 [[09]] 评估（pass@1 vs pass@k）、[[11]] 生产工程（在线 RL 与数据飞轮）、[[12]] 安全与对抗（reward hacking 是训练期对抗面）、[[13]] 大厂案例研究（训练侧护城河，Cursor/Cognition/Anthropic）；衔接 [[17]] 互操作协议与 Agent 经济（环境/轨迹的市场化）、[[15]] 面试题库。
