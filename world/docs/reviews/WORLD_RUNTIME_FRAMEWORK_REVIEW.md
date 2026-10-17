# WorldSeed / agent-world 与世界运行时计划的适配评估

评估日期：2026-10-16。依据：用户提供的 [世界运行时技术计划](../WORLD_RUNTIME_SPEC.md)。本轮暂停产品实现，只检查源码、依赖与离线测试。

**建议独立实现最小 TypeScript 内核。WorldSeed 值得借鉴规则校验、感知投递和记录结构；agent-world 值得参考插件注册、前端控件与观察面板。当前不建议 fork 任一项目后直接承接整个运行时。**

关键不是缺少咖啡场景，而是两者的写入、批次和事件契约都不同于计划。为符合“不可变快照 → 收集意图 → 唯一结算器 → 可精确回放”，必须改动核心执行路径；这不是再加一个场景配置就能完成。

## 范围与证据等级

固定审阅版本，避免主分支变化影响结论：

| 项目 | 审阅提交 | 代码许可 |
| --- | --- | --- |
| WorldSeed | [`4ffeabf`](https://github.com/AIScientists-Dev/WorldSeed/tree/4ffeabfdee6dbeb1cb248bf676ad13667b22d359) | MIT，版权 AIScientists Inc. |
| agent-world | [`81b6a7f`](https://github.com/nicepkg/agent-world/tree/81b6a7ffd1dc278e0cf2cc22e383401e56d79721) | MIT，版权 Jinming Yang |

以下严格区分：

- **README 宣称**：项目如何描述自己，不能当作保证。
- **代码已实现**：审阅调用链和数据结构后的判断，静态结论不冒充实测。
- **测试已验证**：本次实际执行上游测试、示例或专门反例得到的结果。

未对两个上游调用真实模型、消耗 API 额度、运行完整浏览器部署测试。产品中的已有 DeepSeek 配置未交给它们。评估副本在临时目录，未将上游框架装进产品工程。

## 结论对照

| 技术计划中的硬要求 | WorldSeed | agent-world |
| --- | --- | --- |
| 唯一权威写入、统一校验与批次结算 | 有 StateStore / RulesEngine，但公开机械动作立即写入；DM 分组结果也不是全局统一收集后提交 | 有 handler 分派，插件自行写状态；并行角色思考完成后立刻执行 |
| 每角色严格局部观察 | 有实际实体过滤、隐藏属性和私信；依赖配置，未声明事件 scope 默认公开 | 感知插件和按角色记忆可用；无统一私有字段边界，默认邻近感知含全部 traits |
| 按需唤醒、有界请求、超时、取消 | 有 push/周期唤醒、DM 数量与预算限制；角色外部运行器和 DM 裁判是不同链路，不等于统一决策队列 | 有并发分块、LLM 超时和 Hybrid 按需升级；缺批次身份、整局预算及可靠停止后的结果拒收 |
| 抢资源不受模型返回顺序影响 | 机械动作按到达/FIFO；间接共享 DM 效果可能受完成顺序影响 | 并行 action 执行顺序受响应延迟影响，已复现 |
| 消息来源验证与精确回放 | JSONL、tick 快照、保存恢复有实现；缺稳定消息 ID / 来源链校验，不是完整事件重建 | SnapshotPlugin 可回看；缺消息因果 ID、完整运行状态与唯一提交日志，快照还受监听器顺序影响 |
| 不要 API key 也可验证 | Mock DM、Mock connector、现存场景可跑；部分原测试缺夹具 | IdleBrain 和测试可跑；README 提及的 RuleBrainPlugin 无实现/导出 |
| 同局动态发言上限 | 可以用 DSL 表达部分逻辑；未发现符合计划的原地规则补丁模块，config reload 会创建新 run | 可写插件，但 speech 不经过普通 action handler，必须统一封堵引擎和手动发言入口 |

## 1. 谁修改世界，是否有统一校验与结算

### WorldSeed

**README 宣称**：[How It Works][ws-readme] 描述 tick 中感知、提案、规则/DM 裁决、状态变化。

**代码已实现**：

- [`engine/state_store.py`][ws-store] 是实体的集中存储，`get()` / `all_entities()` 返回实体对象；这是一份集中状态，不是禁止其他模块写入的不可变内核。
- [`engine/rules_engine.py::_validate_action`][ws-rules] 检查动作存在性、available_to、数值约束和前置条件。`process_action()` / `process_mechanical()` 执行事件和效果，确实有可复用的集中校验逻辑。
- 但 [`world.py::submit()`][ws-submit] 明确把 **没有 DM 配置的机械动作立即执行**，只有 DM 动作入队。机械动作不等待下一控制边界，也不经过同批快照；`ActionQueue` 的每角色每 tick 限制只覆盖入队分支。
- [`tick.py::step_async()`][ws-tick] 先顺序处理机械效果，再对 DM 按显式 `params.target` 分组，并发执行各组；每组 await 后直接调用应用效果的代码。注释里的“三阶段”不能解释成已经存在“全部 DM 先返回、然后一个全局结算器提交”。
- [`dm_resolver.py::apply_dm_response()`][ws-dm-apply] 对 DM 效果有实体属性快照与异常回滚，但不能把这项能力扩大成所有机械动作都有交易事务。机械 `process_action()` 是逐 effect 执行，缺对象的 delta 操作会 warn 后返回。

**测试已验证**：

1. 公开 `WorldEngine.submit()` 在 **tick=0** 接受同一角色两次 `earn`，资金从 0 变成 2；没有推进 tick。
2. 构造“先从买家扣 3，再给不存在卖家入账”的机械效果：返回成功，买家从 10 变 7，卖家不存在。这个反例是故意不完整的场景配置，证明内核本身不提供通用原子交易；不代表正确写了所有前提的内置场景一定丢钱。

**适配成本**：所有操作改为命令/意图，禁止 `submit()` 立即写；机械与 DM 拆成纯提案与唯一提交；购买另做原子事务/候选状态，不能只依赖属性 min/max 截断。

### agent-world

**README 宣称**：[Architecture][aw-readme] 强调 EventBus 解耦与 Everything-as-Plugin。

**代码已实现**：

- [`plugin.ts`][aw-plugin] 允许任何已安装插件调用 `updateAgent()` / `updateWorldState()`。开发模式 getter 会返回冻结克隆，这是有用的防误改措施；生产 getter 返回原对象，并且 [`AgentManager`][aw-agent] 对外有实际对象与 Map 的访问入口。
- [`engine.ts::processAgent()`][aw-process] 依次 perceive → recall → think → speech → handler。`registerAction()` 是分派入口，**不是独立的 schema / 前置条件 / 原子提交层**。不同插件自行决定校验及效果。
- [`processAgentsParallel()`][aw-parallel] 对角色分块 `Promise.all`，每个角色在自己的模型返回后继续执行 handler。没有全体 proposal barrier 或 snapshotVersion 校验。

**测试已验证**：资源动作 handler 即使本身用同步检查保证不超卖，最终赢家仍由谁先返回决定，详见第 4 项。

**适配成本**：将插件的写权限改为提案接口，收集动作后排序结算。现有多种插件都使用直接更新接口，改变该契约会波及整套插件，不能只在外层套一个队列解决。

## 2. 角色能否只获得自己的可见信息

### WorldSeed

**代码已实现**：[`Perceiver._build_snapshot()`][ws-perception] 对每个观察者执行 DSL visibility，再对其他实体过滤 hidden_properties；自身保留自己的信息。事件有 `global`、`target_only`、`admin` 和自定义范围。Inbox 为每角色独立保存状态和消息。这比单靠提示词“假装不知道”扎实。

**实际限制**：[`_agent_can_perceive_event()`][ws-scope] 对**未声明的自定义 scope 默认公开投递**。隐藏字段过滤是顶层字段排除，不是完整的嵌套 allowlist。另有有意的 omniscient/system 角色，不能直接照搬到普通 NPC。全知 DM 是裁判，不能把它的上下文当成普通角色上下文。

**测试已验证**：顶层 `private_goal` 从其他人的实体视图过滤，自身能读自己的目标；target_only 私语不进入第三人的 inbox。但把 scope 写成一个未声明值时，第三人确实收到消息。

**适配**：不认识的 scope 拒绝或默认私有；做明确 DTO / allowlist；保存历史收件人，来源引用只能验证为该角色已收事件。仅配置 visibility 不足以覆盖这几个边界。

### agent-world

**代码已实现**：[`GridWorldPlugin.resolvePerceptions()`][aw-grid] 有距离范围，`ConversationPlugin` 会按 targets 给定向对话；MemoryPlugin 按角色取记忆。因此不能说项目完全没有局部信息。

**实际限制**：邻近感知直接包含 `other.traits` 全部内容，没有统一私有字段过滤。额外的 brain-context/tool 插件能从完整世界读数据；自带春秋示例的 [`intelligence.ts`][aw-intelligence] 就给角色注入所有其他国家的概览。这是示例的设计选择，不是你计划的默认信息隔离。

**测试已验证**：把 `privateGoal` 放进 B 的 traits，邻近 A 的 brain 输入里直接出现该值；定向 A→B 消息没有进入 C 的记忆，正确的定向过滤也已确认。

**适配**：必须重做普通角色观察的权威投影，明确公共 traits、私有人设与调试状态。不能只挑个 GridWorldPlugin 就认为角色输入天然安全。

## 3. 按需决策、并发、超时和取消

### WorldSeed

**代码已实现**：

- [`wakeup.py`][ws-wakeup] 与 [`tick_runner.py::evaluate_and_notify()`][ws-notify] 支持 push、whisper、think_interval。外部角色由 Connector / OpenClaw / Codex 激活，不是内核统一管理的 `decide(observation, signal)` 队列。
- `evaluate_and_notify()` 对需要通知的角色直接 `gather`，代码明确不使用 busy gating；存在 BusyTracker 类不等于这里已经实现“一角色一个在途请求”。
- [`tick.py`][ws-tick] 的 `MAX_DM_CALLS_PER_TICK=10` 与 max_dm_calls 是 **DM 裁判请求**的数量/预算控制，不是角色模型并发槽位数；超量走 fallback，不能描述成保序等待的通用限流队列。
- [`LiteLLMDMProvider`][ws-llm] 有请求 timeout、Instructor 重试、fallback model；解析失败也会经 resolver 有限重试。默认多层重试意味着总墙钟预算不能简单等同某一次 timeout。
- [`codex_runner.py`][ws-codex] 另有手动 tick 和 ThreadPoolExecutor/子进程 timeout。这可以做“外部 CLI 回合编排”，但依赖外部 Codex 进程，不是计划中的单进程模型适配器。
- TickRunner.stop() 会 cancel 背景 task；这是有效的局部取消机制。可选 director 对请求状态也会拒绝重复 resolve，但 [`director_resolver.py`][ws-director] 没有你的 batchId + snapshotVersion 过期检查，而是把 pending 结果应用到当前 tick。

**判断**：能力分散在多条链路。要符合计划，需要一个统一角色决策队列、冷却/预算/期限、不可变观察、取消令牌和迟到结果门禁。不能将 DM 的并发限制算成角色调度已完成。

### agent-world

**代码已实现**：

- engine 默认每 tick 遍历所有 active agent；[`HybridBrainPlugin`][aw-hybrid] 可以按条件与冷却升级到 LLM，这是实际的按需减少模型调用能力，但不等于持久行动执行器与 dirtyReasons 调度。
- 并发由 engine 的 chunk 大小限制，配置为正整数时有效；是分块执行而非有速率限制、整局预算的长期请求队列。
- [`LLMBrainPlugin.think()`][aw-llm] 有 AbortController timeout、结构化 respond tool、异常 idle fallback、circuit breaker。主 generateText 的 maxRetries 是 0。不能误说“完全没有超时”。
- [`Engine.stop()`][aw-stop] 只停止后续循环并发 stop 事件，BrainPlugin.think 接口没有 signal 参数；LLM 的 AbortController 是函数内局部对象，不由 engine.stop 管理。

**测试已验证**：本地 fake brain 在 stop 前开始、stop 后返回，action handler 仍执行一次。不是实际 HTTP 取消测试，却足以证明 engine 缺少停止后的提交门禁。

**适配**：把 run/batch 生命周期放进独立调度层；脑接口传 signal，返回结果先验身份/版本再入结算；补 request/batch 双重期限、预算、429 退避及队列指标。

## 4. 多角色争抢资源

### WorldSeed

机械路径可在每次执行前重新检查当前库存，正确前置条件能避免简单超卖；但公开机械动作按到达先后立即执行，入队动作由 [`ActionQueue.drain()`][ws-queue] 保留 FIFO。没有“角色固定列表按 tick 轮换”的内建结算公平性。

DM 只对**显式相同 target**串行。两个不同 target、或没写 target 的动作，都可能通过效果触及同一实体，分组不能保证效果实际独立。resolver 是模型返回后直接 apply，因此共享写也受时延影响。

**测试已验证**：

- 同 tick 队列 A→B：A 买到最后一杯；交换为 B→A：B 买到，库存均为 0。
- 两个无显式 target 的 DM 意图都 set 同一个 `shared.winner`：A 快时最终 B，B 快时最终 A，呈现最后完成者覆盖。这与计划的模型返回顺序无关结算相冲突。

### agent-world

同步 handler 可自行防超卖，但执行优先级由 `processAgent()` 走到 handler 的时刻决定。默认顺序模式也会让后面的角色看到前面已改变的世界；随机打乱列表不是同快照批次。

**测试已验证**：seed、角色顺序、意图集合都不变，仅把 A/B 的 fake 模型延迟 5ms/40ms 互换，买家从 A 换成 B。不能用 seeded RNG 解决这个问题。

**两者都需要补**：先收完整 intent 集，再按消息→资源→任务阶段排序；资源阶段 tick 轮换优先级；buy 必带 maxUnitPrice；set_price 与 buy 使用同一资源顺序；扣款、收款、库存、物品增量在候选状态上全部成功才提交。没有证据表明两者当前直接满足这份购买契约。

## 5. 事件、消息溯源与精确回放

### WorldSeed

**README 宣称**：Past runs preserved and replayable。

**代码已实现**：[`RunRecorder`][ws-record] 写 JSONL、最新状态、每 tick 实体/角色快照，以及供恢复使用的其他文件。[历史快照端点][ws-replay] 可以读取指定 tick。保存/恢复和快照查看是实际存在的功能，不是只有 README。

**不满足计划的地方**：

- [`Event`][ws-event] 和 [`InboxEvent`][ws-inbox] 没有稳定 eventId / eventSeq / sourceEventIds。`source` 是发送者，不是来源消息。进程内用 `id(event)` 去重不等于可持久引用的消息 ID。
- 不能验证“转述引用的是本人已见消息”，也缺稳定的转述 DAG。
- 拒绝记录不统一：立即机械路径的 `action_dispatch.py` 会 record 成功与失败；tick `_record_results()` 对失败只投递 inbox，明确不进入 action stream。不能笼统说已完整记录所有接受/拒绝。
- 每 tick 的回看数据主要是 entities/characters；恢复另读 counters/transient。未发现能仅根据已记录结果重建全部任务、收件状态、规则版本等的统一 reducer 和最终状态一致性测试。

**结论**：能快照回看、能恢复，不应直接标成已通过“完整权威状态精确回放”。缩小要求为只读实体快照播放时，可以参考其现成方案。

### agent-world

**README 宣称**：seeded RNG 用于 deterministic replay。

**代码已实现**：[`SnapshotPlugin`][aw-snapshot] 捕获 agents/worldState/本 tick 事件，默认保留 200 个快照；WebSocket renderer 支持 seek。示例 manager 另存 agents/worldState/tick。不是全无回放能力。

**实际限制与实测**：

- 快照在 tick:after 的一个监听器中生成，其他监听器仍能修改世界。实测先安装 Snapshot、后安装 tick:after 经济插件：快照资金 0，而该 tick 结束后的实际资金 9。快照是否覆盖所有效果取决于插件监听顺序。
- 私有记忆、Conversation 的 buffer、LLM 会话/冷却等在插件内部，不都包含在 worldState/agents 中。示例 save 不等于完整运行时检查点。
- ConversationMessage 只有 from/targets/message/tick，没有稳定消息 ID 与经过校验的 sourceEventIds。EventBus 是消息分发器，不是完整事件存储。
- ConversationPlugin 的感知 buffer 确实延后一 tick，但 engine 对定向 speech 立即写入收件人的 MemoryPlugin。实测顺序模式下，同 tick 后执行的 B 通过 recall 已读到 A 的私语，C 没读到。不能把“两阶段感知”扩大为所有输入通路都隔离同批消息。

**结论**：快照可作为调试面板的数据参考，不能替代计划中的提交事件日志与只读精确回放。

## 6. Mock 和测试能否跑起来

以下都是本次实际执行，未修改上游源码/测试以制造通过。命令和环境细节见 [REPRODUCE.md](evidence/REPRODUCE.md)，结构化结果见 [results.json](evidence/results.json)。

| 项目 / 执行项 | 本次结果 | 能证明什么，不能证明什么 |
| --- | --- | --- |
| agent-world 根 Vitest suite | **14 个文件、153 项通过** | core/world 的现有测试可运行；不是 LLM、WS、完整部署与精确回放验收 |
| agent-world hello-world | **5 角色、20 tick、正常退出** | IdleBrain 无 key 运行成立；只是 idle 示例，不是咖啡交易演示 |
| agent-world 补充反例 | **5 项确认** | 返回时延决定资源赢家；stop 后仍动作；traits 无私有字段屏障；快照落后最终效果；定向消息同 tick 进入记忆 |
| WorldSeed 第一组关键测试 | **203 通过、21 失败、21 跳过** | 覆盖队列、状态、效果、感知、inbox、wakeup、持久化、tick、DM 预算等选定模块 |
| WorldSeed 第二组补充测试 | **98 通过、4 失败、21 跳过** | 参数、enum、constraints、perception paths、inbox wake 等选定模块 |
| WorldSeed 茶馆验证与运行 | **CLI validate 成功；4 场景角色+1 narrator；3 tick，say 成功，0 LLM 调用** | 现存 YAML 与机械路径可用；未启动自主外部角色 |
| WorldSeed 补充反例 | **6 项确认** | FIFO、立即机械写入、无通用机械事务、正确私信/顶层过滤、未知 scope 公开、间接共享 DM 写入顺序 |

WorldSeed 两组选取互不重复，合计 **301 通过、25 失败、42 跳过**，不能描述成全仓通过。25 个失败都要求仓库当前不存在的 `configs/bunker.yaml` 或 `configs/minimal.yaml`；没有补造这些文件。跳过也不记为验证通过。Windows 默认 GBK 还会在 `dm/prompt.py` 读 `shared/languages.json` 时收集失败，本次用 `python -X utf8` 规避，没有修改源码。

agent-world 初次直接测试有 146 通过，两个 world suite 因 `@agent-world/core` 指向尚未构建的 dist 而无法收集；先按 README 要求构建 core 后，153 全部通过。这个先构建要求不是引擎缺陷。

Mock 名称必须分清：WorldSeed 的 `MockDMProvider` 是**裁判替身**，MockConnector 只是记录通知，不会替六个角色自主产生经济行动。agent-world 的 IdleBrain 有实现；README 提到的 **RuleBrainPlugin 在该提交只有文档/注释引用，core 没有对应类或导出**。HybridBrain 接受自定义规则脑，不等于已经提供那个类。

## 7. 许可、依赖与改造代价

**许可证**：两个仓库的根 [WorldSeed LICENSE][ws-license] / [agent-world LICENSE][aw-license] 均为 MIT，可修改和用于商业项目，分发复制代码时保留许可与版权。MIT 不代表其依赖、模型、示例图片及其他第三方素材自动全部采用相同许可；这是代码选型结论，不是全供应链许可审计。没有 ARTEX 那种 AGPL 衍生开源约束。

**依赖和技术栈**：

- WorldSeed：Python 3.11+、Pydantic/YAML/FastAPI/httpx/deepdiff/structlog 等；基础依赖还含 lunar-python、Anthropic。DM 可选 LiteLLM + Instructor；角色自主运行常涉及 OpenClaw 或 Codex；前端是独立 React/Vite。继续采用它意味着保留 Python 后端，或移植其内核，不能满足“TypeScript 前后端共享类型”而不付额外代价。
- agent-world：TypeScript，pnpm/Turbo 多包；core 本身运行依赖较轻，这是优点。选择整套则包含 AI SDK、Zod、tokenx、WS、Next/React 等。当前 lock 安装 11 个 workspace、457 个包，数量包含示例/开发依赖，不能等同最小 core 必须携带的依赖数量。
- agent-world 的 [`ui/server/api-handlers.ts`][aw-settings] 示例会保存并原样返回 apiKey 配置。你的计划要求 API key 只从服务端环境读取，直接复用这个 settings API 不符合要求；这不是已经用真实 key 测试过的泄露结论，而是明确的代码契约差异。

**动态规则**：WorldSeed DSL 可以写计数/前提，但 [`config/reload`][ws-reload] 创建新 run，不是当前世界在下一边界改变 speech_limit。agent-world 可用插件写规则，但普通 speech 在 action handler 之前发出，renderer 还有手动说话路径，因此只拦 `send_message` handler 不够。两者都要把消息投递、发言计数、跨日重置和规则变更收进统一结算层。

| 路线 | 真正能复用的部分 | 为满足计划必须重做的部分 | 判断 |
| --- | --- | --- | --- |
| fork WorldSeed | 感知 DSL、inbox、规则注册思路、JSONL/tick 快照、较多规则测试 | 机械 submit 生命周期、角色决策队列、批次屏障、稳定公平顺序、交易事务、消息 ID/溯源、回放 reducer；若坚持 TS 还需移植 | 比较适合“接受 Python + YAML 世界 + 外部角色/DM 裁判”的另一种产品路线 |
| fork agent-world | TS 核心类型、插件注册、部分面板/WS 协议、Mock 测试习惯 | 插件写权限、think/act 解耦、不可变观察、同批消息隔离、竞态与取消、事件持久化及回放 | 整体改造会触及插件系统的中心契约，现成功能多不能抵消这个成本 |
| 独立最小内核 | 当前项目的 React/Vite 基础、已获许可的像素素材；借鉴两个仓库的设计并保留引用 | 明确实现六个动作、观察投影、队列、结算和回放，并为每条不变量写测试 | **最贴合当前规格，重构面可控** |

## 最终建议与后续边界

选择 **独立最小内核**，参考 WorldSeed 的感知/事件/规则组织，参考 agent-world 的注册与展示方式；不先装全套框架，再去拆除与规格相反的生命周期。

若后续选择放宽规格，以成熟 YAML 场景配置和 Python 优先，WorldSeed 比 agent-world 更接近“世界规则中心”。如果目标改成尽快做一个插件式多 Agent 可视化演示，agent-world 更直接。但在当前的批次一致性、硬规则、来源链和精确回放要求下，两者都不是换咖啡场景就能满足的基座。

下一步仍应只做 P0：3 角色、六动作、Mock、tick 与任务、不可变观察、唯一结算器；先用“最后一杯争抢”“调价同批限价购买”“私语与来源伪造”“暂停与迟到结果”“结果日志重放一致”作为验收。发言上限可以先定义注册接口，动态表单留 P3。这里是建议，**本轮没有继续实现这些模块**。

当前仓库上轮已建立 `refactor/world-runtime-v3`；旧版保存于 `v0.2.0-night-puzzle` / `c43a6d7`。这轮只新增评估文档与独立反例，不把尚未完成的 P0 骨架说成通过验收的引擎。


[ws-readme]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/README.md
[ws-store]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/engine/state_store.py#L24
[ws-rules]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/engine/rules_engine.py#L58
[ws-submit]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/world.py#L374
[ws-tick]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/engine/tick.py#L148
[ws-dm-apply]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/engine/dm_resolver.py#L435
[ws-perception]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/engine/perceiver.py#L121
[ws-scope]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/engine/perceiver.py#L205
[ws-wakeup]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/engine/wakeup.py#L19
[ws-notify]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/server/tick_runner.py#L18
[ws-llm]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/dm/providers/llm.py#L75
[ws-codex]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/cli/codex_runner.py#L470
[ws-director]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/director_resolver.py#L16
[ws-queue]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/engine/action_queue.py#L17
[ws-record]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/persistence.py#L129
[ws-replay]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/server/routes/runs.py#L445
[ws-event]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/models/event.py#L9
[ws-inbox]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/engine/inbox.py#L22
[ws-license]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/LICENSE
[ws-reload]: https://github.com/AIScientists-Dev/WorldSeed/blob/4ffeabfdee6dbeb1cb248bf676ad13667b22d359/src/worldseed/server/routes/gm.py#L210
[aw-readme]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/README.md
[aw-plugin]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/core/src/plugin.ts#L312
[aw-agent]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/core/src/agent.ts#L29
[aw-process]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/core/src/engine.ts#L310
[aw-parallel]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/core/src/engine.ts#L516
[aw-grid]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/world/src/grid-world.ts#L193
[aw-intelligence]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/examples/spring-autumn/src/simulation/intelligence.ts#L67
[aw-hybrid]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/core/src/multi-brain.ts#L158
[aw-llm]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/brain-llm/src/llm-brain.ts#L371
[aw-stop]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/core/src/engine.ts#L243
[aw-snapshot]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/core/src/snapshot.ts#L73
[aw-license]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/LICENSE
[aw-settings]: https://github.com/nicepkg/agent-world/blob/81b6a7ffd1dc278e0cf2cc22e383401e56d79721/packages/ui/src/server/api-handlers.ts#L38
