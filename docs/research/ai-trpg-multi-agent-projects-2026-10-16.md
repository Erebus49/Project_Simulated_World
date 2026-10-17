# AI 跑团与多角色 Agent 项目调研

调研日期：2026-10-16（Asia/Shanghai）。问题是：是否已有类似 COC / D&D 跑团的项目，让 AI 分别担任 DM / KP、PL 与 NPC，每个角色拥有独立人物设定、行动逻辑和记忆，在共同世界里行动并演化出故事。

**有，而且已有与这个设想相当接近的实现。** 最直接的案例是 `ai-dnd-research` 和 `agentic_dnd`；强调真人加入与 Web 跑团流程的案例是 `ai-for-trpg`；强调长期世界模拟、角色自主性和 GM 裁决的基础架构，最值得研究的是 Google DeepMind 的 `Concordia`。但本轮未核实到一个成熟、许可明确、同时完整覆盖「多 AI PL + 独立 NPC + 真人随时加入 + 严格 COC / D&D 规则 + 长期自主世界」的通用产品。现有项目分别把其中几部分做得较深。[D1][A1][F1][C1]

这份报告基于实际读取的一手 GitHub README、关键源码、论文页面和官方产品文档；**没有安装、运行项目或复现其测试**。下文的「源码确认」指静态阅读相应实现；测试数量、运行成本与实验成绩如来自作者，则单独标为作者报告。项目活动日期使用查询时 GitHub API 的 `pushed_at`，下表统一换算为北京时间（Asia/Shanghai）。它是仓库最近推送时间，不能直接等同于稳定发布、功能完成或维护承诺。检索后段 GitHub 匿名 API 出现限流，部分补充项目因此没有追取活动日期。

## 1. 判断是否符合设想，首先要区分两种「多 Agent」

**角色型多 Agent**：DM、队伍里的战士、法师、商人、反派分别是不同的决策实体，拥有各自的人物卡、目标和可见信息。用户描述的核心属于这一类。`ai-dnd-research`、`agentic_dnd` 和 Concordia 的玩家实体符合这个方向。[D2][A2][C1]

**职能型多 Agent**：叙事 Agent、规则查询 Agent、角色建卡 Agent、记忆整理 Agent 协作服务一个真人玩家。它能改善 AI DM，但不代表队伍里每个人都是自主 Agent。ChatRPG 的 Narrator / Archivist 架构和 Strands D&D 示例更接近这一类。两类可以组合，名字里写着 multi-agent 本身不足以证明存在多个自主角色。[P2][M1]

还需要区分「为多个角色保存人物卡」与「多个角色各自做决策」：数据库里有 10 张卡，不能自动推导出有 10 个独立角色 Agent。

## 2. 核心项目对照

| 项目 | 实际角色分工 | 人物、记忆与世界状态 | 真人参与 | 许可与本轮活动快照 | 主要缺口 |
| --- | --- | --- | --- | --- | --- |
| [Concordia](https://github.com/google-deepmind/concordia) | GM 与多个 player entities；可组合叙事、场景、时间与行动组件 | 每实体组件可含 instructions、goal、memory；GM 负责观察、行动结果与世界状态 | 框架层可扩展；本轮未核实即用的人机混合跑团入口 | Apache-2.0；2026-10-16 | 通用模拟框架，需要补 COC / D&D 规则、人物卡 UI 和玩家入口。[C1][C2][C3] |
| [ai-dnd-research](https://github.com/maximus-ai-dev/ai-dnd-research) | AI DM + 3 个 AI PC + Rules Keeper + 部分独立敌人；另有记录与世界知识整理 Agent | 每 PC 有职业、能力、个性与行为触发器；JSON 战役状态、前情摘要、wiki、会话记录 | 实验全 AI；支持人类投递 DM 指令，未实现成熟真人 PL 交互 | MIT；2026-03-30 | 原型、固定战役；普通 NPC 多由 DM 扮演，规则裁决仍大量依赖 LLM。[D1][D2][D3][D4] |
| [agentic_dnd](https://github.com/danilonumeroso/agentic_dnd) | 独立 DM + 4 个不同职业、性格的 PlayerAgent | Pydantic 角色与 GameState；各 Agent 消息历史；代码骰点、伤害与状态；Markdown 会话日志 | 本轮看到的是 AI 队伍自主运行流程 | 未发现开源许可；2026-04-03 | 小型验证实现；NPC / 敌人由 DM 控制；规则简化，未见完善长期存档与秘密隔离。[A1][A2][A3] |
| [AI for TRPG / The Last D20](https://github.com/Fujin1997/ai-for-trpg) | 真人主角 + AI DM + 各自提议行动的 AI 同伴；NPC 行动含本地行为策略 | 同伴 profile、goal、近期记忆、私有线索与关系；本地 5E 规则与持久世界后果 | 明确为单真人与 AI 同伴的 Web 冒险 | README 明确未授予开源许可；2026-09-01 | 当前聚焦 Julkoun 区域；NPC 的行动接口不等同于每个 NPC 独立调用 LLM。[F1][F2][F3] |
| [Generative Agents](https://github.com/joonspk-research/generative_agents) / [AI Town](https://github.com/a16z-infra/ai-town) | 小镇中多个自主居民；AI Town 有真人 player 机制 | 人设、记忆、反思、计划、对话与共享场景状态 | AI Town 源码有 human player；原版研究侧重模拟和回放 | Apache-2.0 / MIT；2024-08-06 / 2026-08-26 | 强在社会与故事涌现，缺 DM、正式跑团规则和完整战役流程。[G1][G2][T1][T2] |
| [COC Keeper](https://github.com/Leehow/chatrpgv4) | 宿主 LLM 当 KP；规则工具；可用无上下文 subagent 当 PL 做整局验收 | 调查员卡、HP / SAN、战役状态、模块秘密边界、战斗与追逐 | 正常面向真人；另有 KP + AI PL 的验收协议 | 代码 Apache-2.0；2026-10-13 | 宿主插件，alpha；AI PL 主要是验收流程，未核实多 NPC 自主世界运行时。[K1][K2] |

上表中最需要关注的许可区别是：`agentic_dnd` 的公开源码未找到许可文件；`ai-for-trpg` 更明确写明没有开放源码复用授权。它们适合阅读、比较和联系作者，不能因 GitHub 可见就直接当作可自由复制的开源底座。[A1][F1]

## 3. 最接近「AI 自己跑一桌团」的两个项目

### ai-dnd-research：完整度最贴近，但需要认真读它暴露的问题

仓库的实际结构就是一桌 AI 玩家：DM 描述世界，Cora、Garrick、Mercer 三名 PC 各自决策，Rules Keeper 裁定；部分战斗另设敌人 Agent。`agents.py` 为每个 PC 编写不同的角色、目标、背景、职业能力和性格触发条件；`session.py` 调度 DM、PC、规则裁定与敌人回合；`tools.py` 提供代码生成的骰点和战役 / wiki 读写。[D2][D3][D4]

这比「一个大模型在一条聊天记录里分别写几个人的台词」更接近用户想要的结构。**独立 Agent 不要求使用不同模型**：多个角色可以调用同一模型，关键在于决策调用、人物目标、上下文与状态是否按角色分开。

它也提供了值得直接阅读的失败经验。作者报告：模型倾向于合作、和解和避免冲突，甚至把本来不能交流的敌人改写为可被感化的角色；仅在 DM 提示词里要求「不要这么做」很难根治。后来给敌人独立行动权、规定目标、给 PC 明确触发行为，战斗才更稳定出现。这与用户想要的「每个角色有自己的行动逻辑和特色」直接相关：**反派、同伴和 DM 的目标不能全部折叠成一个“推动大家合作”的目标。**[D5]

需要保留三个边界：

- 作者提供了 9 次战役运行和 180+ session 的代码与数据，但论文自身承认这是顺序迭代的系统验证，没有严格隔离变量。README 写的成绩不能按标准对照实验强度理解，也没有在本次调研复现。[D1][D5]
- 真骰点来自 Python 工具；Rules Keeper 自身仍然是 LLM，并以提示词计算 DC、裁定行动、追踪战斗。它不是一套完整、确定性的 D&D 5E 规则引擎。[D2][D4]
- 研究明确排除了真人 PL；`dm_input.txt` 属于人类给 DM 的指导渠道，不能等同于成熟的真人加入队伍功能。普通 NPC 也并非都拥有独立 Agent。[D3][D5]

**适合用途**：观察自主跑团的调度方式、角色冲突、长战役记录和常见失控模式。它比一个宣传“多 Agent”的空框架更有参考价值，因为能沿着代码看到实际会话和失败现象。

### agentic_dnd：最容易读清楚的一份最小实现

这个项目的结构很直接：`Game.setup()` 创建默认队伍，再针对每个角色 ID 实例化 `PlayerAgent`；另建 `DMAgent`。默认四人分别是好奇理性的法师、勇敢利他的战士、冲动讽刺的牧师、神秘自利的游荡者。角色数据包含属性、HP、AC、职业与 personality。[A1][A2]

`PlayerAgent.take_turn()` 注入自己的人物信息、GameState 摘要、近期叙事和 DM 的当前描述，要求以第一人称行动并调用职业工具；每个实例保留自己的 `messages`。`resolve_action()` 再用 Python 规则代码进行命中、伤害与状态更新。这让「LLM 决定想做什么，代码决定结果」的边界比较清楚。[A2][A3]

不过它是一个小型实验：规则明显简化，README 明确列出缺少豁免、暴击等内容；敌人行动仍由 DM 工具控制。Agent 拥有独立消息列表，并不代表已经实现完整的私有记忆权限：当前提示词里仍使用公共 GameState 摘要。源码能确认保存 Markdown 会话日志，不能据此声称已有完整的长期世界恢复系统。[A1][A2][A3]

**适合用途**：快速理解 DM / PL 分离、结构化动作和规则执行的最小闭环。若要直接复用源码，需要先处理许可证缺失。

## 4. 最接近「真人和 AI 队友一起跑团」的项目

`ai-for-trpg` 的产品流程比前两个更完整：选模组、创建主角、招募同伴、DM 开场、探索 / 社交 / 战斗、场景移动、存档恢复。其 README 把当前范围限定在 *Scourge of the Sword Coast* 的 Julkoun 区域，明确不承诺任意模组导入或全书覆盖。[F1]

最值得参考的是同伴 Agent 的上下文边界。源码不是只塞一个“你是精灵法师”的名字：它读取人物卡、职业属性、personality、个人 goal、最近行动、公开队伍信息、私有线索，以及与同伴的 trust / respect / status，按 actor ID 构建独立决策请求。模型返回的是行动提议，接口标明还需要本地规则执行；模型不可用、重复行动或声称未列明能力时，会使用本地约束回退。[F2]

NPC 部分必须精确描述：本轮查看的 `/api/agents/npc/action` 调用 `chooseNpcAction()`，后者按模组行为、attitude、回合资格和战斗威胁选择结构化动作，是本地 TypeScript 策略。它确实有 NPC 记忆、秘密和世界后果，但这个调用路径**没有证明每个 NPC 都是独立 LLM 决策者**。[F3]

README 报告了 61/61 测试、32 步多 Agent 回放和 27 场景覆盖；这里只确认了这些是仓库声明及存在相应实现文件，没有执行它们。项目明确未授予开源许可。[F1]

**适合用途**：研究人物卡如何影响行动、同伴私有上下文、模组约束、信息可见性和真人控制权交接。它尤其适合比较「有个性的 AI 同伴」与「DM 代写所有同伴台词」的区别。

另一个可玩产品对照是 [Friends & Fables](https://fables.gg/)：官网展示 AI GM Franz、角色与世界编辑、记忆、5E 战术战斗，以及最多 6 名真人多人游玩；[官方帮助](https://help.fables.gg/)也有 Memory / Context / Game State 说明。它能作为产品形态参考，但官网没有证明每个 NPC、每个 AI PL 都由独立 Agent 驱动，本轮也没有找到可核实的对应开源实现，因此不把它当成架构证据。[B1]

## 5. 如果核心是「世界自己运行、人物关系和故事涌现」，优先看这些

### Concordia：架构上最贴合「GM + 自主角色 + 共同世界」

Concordia 明确受桌面 RPG 启发：玩家实体用自然语言提出行动，GM 判断是否可能、处理环境并描述结果。每个 entity 可组合 instructions、memory、行动选择等组件；不是必须把所有角色和世界都塞进单个提示词。[C1][C4]

源码层面，实体有 `act()`、`observe()`、`get_state()`、`set_state()`；顺序引擎依次产生观察、交给实体、挑选行动者、获取动作，再交 GM resolve。README 还提供顺序、同时、异步等调度方向；本轮对顺序引擎读到了具体实现，其他模式以文档声明为依据。[C2][C3]

它的 prefab 比较适合本问题：basic_with_plan 源码组合 Goal、Plan、ObservationToMemory、AssociativeMemory，situated GM 源码维护 Story so far / Locations，时间与地点 prefab 加入时钟，dialogic_and_dramaturgic 组织场景章节，generic simulation 支持 checkpoint 与 HTML 日志。[C3]

**适合用途**：当目标是自定义世界、自主 NPC、角色动机与长期故事，而不只是复刻 D&D 界面时，把 Concordia 作为底层候选。它仍需要实现具体规则、人物卡与玩家入口；本轮没有核实它自带完整 COC / D&D 规则，也没有把自然语言 GM 的常识裁决等同于严格规则引擎。

### Generative Agents 与 AI Town：更强的社会生活感，更弱的跑团裁判

Generative Agents 的论文和公开实现讨论记忆、反思、计划如何支持多个居民在 Smallville 中生活、交流和形成活动。论文报告 25 个角色，以及聚会等由角色传播信息而形成的行为。仓库提供初始人物历史、模拟保存和回放；Persona 源码为每个角色分别维护 spatial memory、associative memory 与 scratch，并通过 perceive / retrieve / plan / execute / reflect 循环行动，属于有研究价值的社会模拟原型。[G1][G2]

AI Town 是更便于作为应用起点的小镇项目：人物数据有 identity 与 plan；Agent tick 驱动移动和对话；记忆按 player ID 管理，并结合相关性、时间、重要性检索以及反思；源码也有 human player 字段与对真人发起 / 接受对话的处理。[T1][T2]

**适合用途**：可视化世界、NPC 自发社交、角色关系和日常故事。如果用户真正想要的是“我走进一个世界，里面的人本来就在生活”，它们比纯 AI DM 聊天更接近。但 DM、骰点裁判、规则动作和战役节奏需要额外建设。

## 6. COC 方向：存在有价值的实现，但要看清角色自治程度

[COC Keeper / chatrpgv4](https://github.com/Leehow/chatrpgv4) 是本轮找到的较具体 COC7 工具：调查员卡、确定性骰点与 HP / SAN、战斗、追逐、持久战役状态、剧本导入与秘密边界。它是面向 Codex、Claude Code、Cursor 的 Keeper 插件，共享一套 canonical 实现。[K1]

它与多 Agent 最直接的连接是整局验收协议：主宿主当 KP，创建不继承上下文的 subagent 当 PL，只转发玩家可见叙事、人物信息和公开骰点，跑到结构化结局或明确阻塞。状态文档同时指出，这种玩家隔离依赖协议，subagent 仍共享文件系统。这可以参考 KP 与 PL 的信息边界设计，不能把它当成已经实现长期多 NPC 自主世界。[K2]

本轮状态文档写的是 `0.4.0-alpha.0`，代码 Apache-2.0。仓库还明确标注部分内置剧本 / 图片的分发来源需要外部权利核实，代码许可不能自动覆盖所有内容资产。[K1][K2]

其他 COC 候选包括 [120241660120/COCagent](https://github.com/120241660120/COCagent)，README 展示 COC7 规则 RAG、人物卡和多调查员管理等功能。不过本轮没有取得足以证明「多个独立 AI PL 与 AI NPC 自主决策」的证据，因此只作为 AI KP / 角色管理方向的检索线索，未纳入核心多角色项目推荐。

## 7. 两个值得借鉴的角色机制补充

**Sotopia** 更接近角色社交与目标达成的模拟 / 评估环境。源码中的 profile 包含 `personality_and_values`、`decision_making_style`、`secret`；场景可为各 Agent 分配不同目标；非全知模式会对角色隐藏其他人的目标和部分私密信息。动作包括说话、非语言表达、行动和离开，调度可同时或轮流。对“每个人有不同目的、会隐瞒、会谈判”的角色设计很有价值，但它不是完整长战役跑团系统。代码 MIT。[S1][S2]

**SillyTavern** 可以最快验证人物卡和群聊演出效果。官方文档有角色 description、personality、scenario、示例对话，群聊可自动轮流回复，也可每次仅注入当前说话者的人物卡。然而官方文档明确指出群组历史持续共享。因此它能做多角色群聊，不能直接推导出各角色拥有严格隔离的认知和秘密，更不是权威世界状态或 D&D / COC 规则模拟器。代码 AGPL-3.0，复用时需按该许可评估。它适合低成本探索角色声线与互动体验。[V1][V2]

## 8. 相关论文分别解决什么问题

| 论文 / 系统 | 已核实的研究内容 | 与用户目标的关系与局限 |
| --- | --- | --- |
| [Concordia: Generative agent-based modeling...](https://arxiv.org/abs/2312.03664) | 特殊 GM Agent、自然语言行动、组件、联想记忆、环境结果 | 直接对应 GM + 多角色的架构；不是完整跑团产品或特定规则实现。[C4] |
| [Generative Agents](https://arxiv.org/abs/2304.03442) | 记忆、反思、计划驱动多居民社会行为 | 支持角色和故事涌现；缺正式跑团裁判与规则。[G2] |
| [Static Vs. Agentic Game Master AI...](https://arxiv.org/abs/2502.19519) | ChatRPG 从静态提示转向 Narrator / Archivist 等多 Agent 与 ReAct，比较单人游玩体验 | 有用的 AI GM 架构；职能分工不等于多个 AI PL。全文链接到 KarmaKamikaze/ChatRPG。[P2] |
| [Player-Driven Emergence in LLM-Driven Game Narrative](https://arxiv.org/abs/2404.17027) | Dejaboom! 固定谜团背景、5 个 NPC、GPT-4 交互，28 名真人；分析玩家生成的叙事节点 | 证明值得研究自由交互的涌现潜力；NPC 固定位置，非 AI 玩家全员自主世界。[P3] |
| [CALYPSO: LLMs as Dungeon Masters’ Assistants](https://arxiv.org/abs/2308.07540) | AIIDE 2023；帮助真人 DM 获取情境信息、描述与灵感 | 研究 AI 如何辅助真人 DM，不是 AI 自动当全桌角色。[P1] |
| [SOTOPIA](https://arxiv.org/abs/2310.11667) | 开放社交交互场景中的角色扮演、目标与评估 | 有助于衡量个性、社会目标和互动；不是战役规则或世界引擎。[S2] |
| [Assessing Rule Adherence of LLM Adjudicators in Call of Cthulhu TRPG](https://arxiv.org/abs/2607.02802) | CoC-Seduce；研究用叙事修辞诱导裁判绕过规则；摘要报告 5,376 样本、22 个裁判模型 | 为 AI KP 设计提供规则鲁棒性参考；是多 Agent 对抗基准，不是可玩跑团平台。本轮读到论文摘要，未复现数据或结果。[P4] |

`ai-dnd-research` 自带的 [paper.md](https://github.com/maximus-ai-dev/ai-dnd-research/blob/main/paper.md) 对合作偏差、敌人独立行动和角色触发器也很有用，但应按作者公开的工程报告阅读，不将其包装成已确认同行评审的论文。[D5]

## 9. 常见的误判与未优先推荐的项目

- [davelewis91/DNDBot](https://github.com/davelewis91/DNDBot) 的简介容易让人联想到完整多 Agent 跑团；当前 README 实际是**人类 DM + 一个 AI PlayerAgent**，多角色 session 与 DM Agent 明确列为计划。它的 YAML 人物卡和规则工具值得读，但不能算已实现 AI 一桌团。README 写 MIT，本轮仓库树未找到对应许可文件，复用前应核实。[X1]
- [jeannineshiu/multi-agents-dnd-game](https://github.com/jeannineshiu/multi-agents-dnd-game) 是 Gamemaster Orchestrator + Rules Agent + Character Agent + Dice MCP，源码和说明展示规则 RAG / 建卡 / 骰点的职能协作；没有证明多个独立 AI PL。MIT-0。[M1]
- [tegridydev/dnd-llm-game](https://github.com/tegridydev/dnd-llm-game) 当前 README 为 DNDLLM26：本地单人 AI DM、DM 控制同伴、SQLite 世界与任务、Ollama 和 lore 检索。仓库简介提到多个模型，但不同模型承担叙事 / 规则 / 检索，不等于每个角色都有独立 Agent。其许可证是自定义 IDCDW，不能误写成 MIT。[X2]
- [colejc24/MultiAgentRoleplayingGame](https://github.com/colejc24/MultiAgentRoleplayingGame) 可见主要是 notebook 和游戏文本，缺少 README 与明确许可；本轮没有把它当作成熟工程底座。
- [ChatArena](https://github.com/chatarena/chatarena) 的官方 README 已标注于 2025-08-11 deprecated；[AgentVerse](https://github.com/OpenBMB/AgentVerse) 可作多角色模拟的历史参考，但本轮没有理由把维护状况较旧的框架优先于 Concordia 推荐。

## 10. 对本项目最有帮助的选择

如果目的只是确认想法是否已有先例：**答案明确是有**。可以先读 `ai-dnd-research` 的真实回合与失败案例，再读 `agentic_dnd` 的短小主循环，最后看 Concordia 如何把角色、观察、行动与 GM 裁决拆开。三者分别回答「能否自己跑团」「最小闭环怎么写」「如何变成更通用的世界模拟」。[D1][A2][C1]

如果目的是做 Hackathon 原型，建议验证一个范围很小、但角色性强的故事：1 个 GM、3–5 个角色、1 张小地图、1 个谜团或冲突。角色除职业与数值外，还要有不同的个人目标、秘密、关系与行动倾向。让真人能接管其中一个角色，或旁观 AI 队伍运行，就能同时展示“玩家 RPG”和“AI 自主演化”。这是基于上述实现的产品建议，本轮没有创建或运行这一原型。

实现上最值得保留的约束是：**角色只能基于自己看见的事件决策；规则和世界状态由统一的代码层提交；DM 根据已生效事件叙事。** 角色可以提出“我偷走钥匙”，但不能直接写成“钥匙已经到手”；GM 可以组织节奏，但不能悄悄把其他 Agent 的决定改写成另一件事。Concordia 的 observation → act → resolve、`agentic_dnd` 的结构化动作，以及 `ai-for-trpg` 的可见信息与规则执行边界，分别提供了对应参考。[C2][A3][F2]

一个可作为设计草图的循环是：

```text
世界状态与事件记录
        │
        ├── 按视野 / 场景 / 秘密权限生成各角色观察
        │                │
        │        人物卡 + 私有记忆 + 个人目标
        │                │
        │          AI 或真人提出行动
        │                │
        └──── 规则校验、骰点、动作冲突与状态提交
                         │
                    GM 描述结果
                         │
              各角色分别更新记忆与计划
```

这只是建议架构，不能当作现有项目已共同验证过的统一实现。尤其是 COC 场景，**角色知识与世界真相要分开**；否则所有角色共享一份完整聊天历史，很容易让尚未发现线索的调查员提前知道谜底。角色冲突也应该来自不同目标和信息，而不只是提示词里写几个性格形容词。

## 11. 一手来源与核实位置

下列来源均由本次主调研或并行调研实际访问。GitHub `main` / `master` 链接指向会继续变化的默认分支；Concordia 的部分关键实现使用本次核实的 HEAD 固定版本。

| 标记 | 来源与本次使用的证据 |
| --- | --- |
| D1 | [ai-dnd-research README](https://github.com/maximus-ai-dev/ai-dnd-research/blob/main/README.md)：角色结构、数据目录、运行范围、MIT 声明。[LICENSE](https://github.com/maximus-ai-dev/ai-dnd-research/blob/main/LICENSE)已读取。 |
| D2 | [code/agents.py](https://github.com/maximus-ai-dev/ai-dnd-research/blob/main/code/agents.py)：`create_pc_agents`、`create_rules_keeper`、`create_enemy_agent`，角色目标、性格与工具。 |
| D3 | [code/session.py](https://github.com/maximus-ai-dev/ai-dnd-research/blob/main/code/session.py)：会话循环、`_run_enemy_turn`、人类 DM 指令、状态与摘要。 |
| D4 | [code/tools.py](https://github.com/maximus-ai-dev/ai-dnd-research/blob/main/code/tools.py)：`roll_dice` 使用 `random.randint`，战役与 wiki 读写。 |
| D5 | [paper.md](https://github.com/maximus-ai-dev/ai-dnd-research/blob/main/paper.md)：合作偏差、顺序实验局限、无人类 PL、未完成项。 |
| A1 | [agentic_dnd README](https://github.com/danilonumeroso/agentic_dnd/blob/main/README.md)：职业、工具、简化规则、运行与会话输出；本次 GitHub 递归文件树未找到许可文件。 |
| A2 | [game.py](https://github.com/danilonumeroso/agentic_dnd/blob/main/game.py)、[models.py](https://github.com/danilonumeroso/agentic_dnd/blob/main/models.py)、[agents/player.py](https://github.com/danilonumeroso/agentic_dnd/blob/main/agents/player.py)：按角色实例化、人物数据、独立消息列表与当前决策上下文。 |
| A3 | [rules.py](https://github.com/danilonumeroso/agentic_dnd/blob/main/rules.py)、[game.py](https://github.com/danilonumeroso/agentic_dnd/blob/main/game.py)：骰点、伤害、动作执行与状态更新。 |
| F1 | [ai-for-trpg README](https://github.com/Fujin1997/ai-for-trpg/blob/main/README.md)：单真人流程、区域范围、人物卡、测试声明及未授权许可。 |
| F2 | [companion/route.ts](https://github.com/Fujin1997/ai-for-trpg/blob/main/app/api/agents/companion/route.ts)、[information-boundary.ts](https://github.com/Fujin1997/ai-for-trpg/blob/main/lib/game/information-boundary.ts)、[agent-memory.ts](https://github.com/Fujin1997/ai-for-trpg/blob/main/lib/game/agent-memory.ts)：按角色可见信息构建 DeepSeek 请求、行为回退与私有线索。 |
| F3 | [npc/action/route.ts](https://github.com/Fujin1997/ai-for-trpg/blob/main/app/api/agents/npc/action/route.ts)、[npc-action.ts](https://github.com/Fujin1997/ai-for-trpg/blob/main/lib/game/npc-action.ts)、[npc-memory.ts](https://github.com/Fujin1997/ai-for-trpg/blob/main/lib/game/npc-memory.ts)：本地 NPC 行动策略、交互与行为记录。 |
| C1 | [Concordia README，固定 HEAD](https://github.com/google-deepmind/concordia/blob/6fbfbc58f324aa74f78568c488713210889a801e/README.md)：GM / players、自然语言行动、组件；另已读取同版本 [LICENSE](https://github.com/google-deepmind/concordia/blob/6fbfbc58f324aa74f78568c488713210889a801e/LICENSE)，确认 Apache-2.0。 |
| C2 | [entity_agent.py](https://github.com/google-deepmind/concordia/blob/6fbfbc58f324aa74f78568c488713210889a801e/concordia/agents/entity_agent.py)、[engines/sequential.py](https://github.com/google-deepmind/concordia/blob/6fbfbc58f324aa74f78568c488713210889a801e/concordia/environment/engines/sequential.py)：observe / act、状态保存和顺序调度。 |
| C3 | [prefabs README](https://github.com/google-deepmind/concordia/blob/6fbfbc58f324aa74f78568c488713210889a801e/concordia/prefabs/README.md)、[environment README](https://github.com/google-deepmind/concordia/blob/6fbfbc58f324aa74f78568c488713210889a801e/concordia/environment/README.md)：计划、地点、时间、场景、checkpoint 和 engine；[basic_with_plan.py](https://github.com/google-deepmind/concordia/blob/6fbfbc58f324aa74f78568c488713210889a801e/concordia/prefabs/entity/basic_with_plan.py)、[situated.py](https://github.com/google-deepmind/concordia/blob/6fbfbc58f324aa74f78568c488713210889a801e/concordia/prefabs/game_master/situated.py) 的对应组件已静态核实。 |
| C4 | [Concordia 论文](https://arxiv.org/abs/2312.03664)：组件、联想记忆、GM 模拟环境；本轮读取论文摘要。 |
| G1 | [Generative Agents README](https://github.com/joonspk-research/generative_agents/blob/main/README.md)：模拟、初始历史、保存与回放；[persona.py](https://github.com/joonspk-research/generative_agents/blob/main/reverie/backend_server/persona/persona.py) 核实每人物独立记忆与认知循环；已读取 [LICENSE](https://github.com/joonspk-research/generative_agents/blob/main/LICENSE)，确认 Apache-2.0。 |
| G2 | [Generative Agents 论文](https://arxiv.org/abs/2304.03442)：25 角色、记忆 / 反思 / 计划与涌现行为；本轮读取摘要。 |
| T1 | [AI Town README](https://github.com/a16z-infra/ai-town/blob/main/README.md)、[data/characters.ts](https://github.com/a16z-infra/ai-town/blob/main/data/characters.ts)：starter 定位、共享状态、人物 identity 与 plan；已读取 [LICENSE](https://github.com/a16z-infra/ai-town/blob/main/LICENSE)，确认 MIT。 |
| T2 | [aiTown/agent.ts](https://github.com/a16z-infra/ai-town/blob/main/convex/aiTown/agent.ts)、[aiTown/player.ts](https://github.com/a16z-infra/ai-town/blob/main/convex/aiTown/player.ts)、[agent/memory.ts](https://github.com/a16z-infra/ai-town/blob/main/convex/agent/memory.ts)、[agent/conversation.ts](https://github.com/a16z-infra/ai-town/blob/main/convex/agent/conversation.ts)：tick、human、记忆归属、检索与角色上下文。 |
| K1 | [COC Keeper README](https://github.com/Leehow/chatrpgv4/blob/main/README.md)：KP 插件、调查员、规则工具、宿主、Apache-2.0；已读取根目录 LICENSE。 |
| K2 | [docs/status/CURRENT.md](https://github.com/Leehow/chatrpgv4/blob/main/docs/status/CURRENT.md)：alpha 状态、无上下文 PL subagent、秘密边界、共享文件系统与内容授权限制。 |
| S1 | [persistent_profile.py](https://github.com/sotopia-lab/sotopia/blob/main/sotopia/database/persistent_profile.py)、[envs/parallel.py](https://github.com/sotopia-lab/sotopia/blob/main/sotopia/envs/parallel.py)：人设、秘密、个人目标、可见性与动作；已读取 [LICENSE](https://github.com/sotopia-lab/sotopia/blob/main/LICENSE)，确认 MIT。 |
| S2 | [SOTOPIA 论文](https://arxiv.org/abs/2310.11667)：交互社交角色与评估；本轮读取摘要。 |
| V1 | [官方群聊文档源码](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/Characters/groupchats.md)：共享群组历史、当前人物卡与自动模式。 |
| V2 | [官方人物卡文档源码](https://github.com/SillyTavern/SillyTavern-Docs/blob/main/Usage/Characters/characterdesign.md)、[主仓库](https://github.com/SillyTavern/SillyTavern)：人物设计字段；已读取 release 分支 [LICENSE](https://github.com/SillyTavern/SillyTavern/blob/release/LICENSE)，确认 AGPL-3.0。 |
| P1 | [CALYPSO 论文页](https://arxiv.org/abs/2308.07540)：真人 DM 助手与 AIIDE 2023；本轮读取摘要与元数据。 |
| P2 | [ChatRPG 论文全文](https://arxiv.org/html/2502.19519v2)、[项目 README](https://github.com/KarmaKamikaze/ChatRPG/blob/master/README.md)：Narrator / Archivist / 工具与单人定位；项目 MIT。 |
| P3 | [Player-Driven Emergence 论文全文](https://arxiv.org/html/2404.17027v3)：Dejaboom!、5 NPC、28 真人、固定位置与叙事节点。 |
| P4 | [CoC-Seduce 论文页](https://arxiv.org/abs/2607.02802)、[作者项目地址](https://github.com/answerrtx/CoC-Seduce)：本轮确认摘要与论文提供的仓库地址；仓库 README 读取请求未成功返回，未据此声称已核实代码或许可。 |
| M1 | [Strands D&D 示例 README](https://github.com/jeannineshiu/multi-agents-dnd-game/blob/main/README.md)：GM / rules / character / dice 的职能分工；MIT-0。 |
| X1 | [DNDBot README](https://github.com/davelewis91/DNDBot/blob/main/README.md)：单 AI Player、人类 DM 与计划项；README 的许可声明未由根目录许可文件交叉确认。 |
| X2 | [DNDLLM26 README](https://github.com/tegridydev/dnd-llm-game/blob/main/README.md)、[LICENSE](https://github.com/tegridydev/dnd-llm-game/blob/main/LICENSE)：单人、DM 控制同伴、模型分工与自定义许可。 |
| B1 | [Friends & Fables 官网](https://fables.gg/)、[官方帮助](https://help.fables.gg/)：AI GM、世界与角色编辑、记忆、5E 与真人多人；未核实内部 Agent 拆分。 |

活动时间与许可元数据还读取了相应 GitHub 仓库 API，例如 [ai-dnd-research 元数据](https://api.github.com/repos/maximus-ai-dev/ai-dnd-research)、[agentic_dnd 元数据](https://api.github.com/repos/danilonumeroso/agentic_dnd)、[ai-for-trpg 元数据](https://api.github.com/repos/Fujin1997/ai-for-trpg)。API 限流后仍能访问部分 raw 源码与 arXiv，一般搜索引擎有连接失败或异常结果；报告没有用这些失败请求支持项目功能结论。
