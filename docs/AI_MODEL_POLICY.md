# AI / Codex 模型使用策略

## 默认规则

Tier 是任务分类，不绑定模型代际或固定推理档。Tier 1 用于边界清楚、规格和验收明确的重复工作；Tier 2 用于调用图不确定、跨层异步、Playback/Session 或 IPC/credential 边界的分析和实现；Tier 3 用于重大架构、高失败成本或经 Tier 2 有证据分析仍未定位的关键问题。先选可靠完成任务所需的能力，再从当前工具提供的模型和推理档中选择，不以代码行数或文件数量决定。Tier 1 承担 70% 以上日常任务、Tier 3 目标占比不超过 5% 的既有目标保持；本轮不核算或调整比例，也不按配额牺牲质量。

型号参考核对日为 2026-10-10：当前可用时，明确重复任务可选 GPT-6 Luna（High 起点）；复杂分析和跨模块工作可选 GPT-6.1 Sol（从适合任务的默认档起步）；最困难或高失败成本工作可考虑 GPT-6 Astra。GPT-5.6 系列仍可用时可以继续用于适合的任务，这不是退役声明。具体可用性以当前环境为准；推理档不跨代机械换算，Max 不因“编码”自动启用。本地工具仅证明支持选择；公开能力与相对成本参见 [官方 Models](https://learn.chatgpt.com/docs/models) 和 [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)，本项目未做付费模型基准或总成本测量。

| 任务 | 任务分级 / 选择依据 |
|---|---|
| README、知识库、Git/Tag、日志、`.gitignore`、简单测试、明确规格脚本 | Tier 1；以边界和验收清晰为前提 |
| 已批准设计的独立 helper、mapping/config、fixture、局部修复 | Tier 1；不自行决定 fallback、鉴权或生命周期 |
| Mount 复杂回归、CD2 Range/Header/异步兼容、PlaybackManager、Session/WebSocket | Tier 2；按不确定性和边界风险选择推理档 |
| libmpv 生命周期、Electron/Native Helper bridge | Tier 2，必要时 Tier 3；主线程保留决策权 |
| Electron 大版本升级、跨多层难复现播放故障 | 按实际兼容风险和分析证据选择 Tier 2 / Tier 3 |

## 升级与降级

Tier 1 → Tier 2：涉及 PlaybackManager 与 player 两层以上、Session/WebSocket、Native fallback、多个合理根因、连续两轮 Tier 1 无解、需理解较大调用图，或测试结果与静态逻辑冲突时可考虑。先澄清规格、读取已有文档或拆成分析/执行/验收任务。

Tier 2 → Tier 3：Tier 2 已完整分析至少一轮仍未定位时可以升级；重大架构或高失败成本问题可直接选择所需能力，无需为满足流程先消耗一轮低档分析。开发日志写明风险、证据和原因。

如果修改文件、函数、输入输出、测试与验收标准都已明确，即使涉及多个文件，也应降回 Tier 1。文件多不代表难，未知多才代表难。当前模型高于建议等级时可以完成当前任务，但后续同类任务应采用更低成本模型。

## Orchestrator / Worker 原则

主线程负责规格、架构边界和最终验收。设计已批准、接口和输入输出明确、修改范围清楚、验收标准完整且任务可隔离时，评估是否委派给足以可靠完成任务的可用模型。判断同时考虑上下文传递、协调和复核开销；委派会增加模型与工具工作量，不保证总成本更低。简单任务可以由当前主线程直接完成。

| 角色 | 适合承担的工作 |
|---|---|
| Tier 1 worker | 文档、测试、Git、日志、静态检查、构建验证、信息整理和敏感信息扫描 |
| Tier 1 worker（明确 contract） | 已完成设计的普通实现、独立 helper、resolver 子模块、mapping/config、fake fixture 和明确 review comment 的局部修复 |
| Tier 2 | 复杂跨模块分析或实现，以及需要理解较大调用图的兼容性问题 |
| 主线程按 Tier 2 / Tier 3 风险选择 | 高风险架构、Playback/Session/libmpv 生命周期、异步 race、IPC/credential 边界和最终核心 review |

决定采用委派时，主线程应先分析问题、拆分任务、固化 contract 并定义验收，再由 worker 执行，最后由主线程检查真实 diff、核对测试、检查不变量并决定接受、返工或升级。Worker 任务至少必须说明目标、允许和禁止修改的文件、输入输出、不变量、验收标准、测试和汇报内容；worker 不得自行扩大范围、改变架构 contract、重写稳定播放链或 merge PR。

低成本 worker 可以为高风险问题收集证据、补测试或验证明确假设，但不得自行决定整体架构、PlaybackManager/Session/PlaySessionId/MediaSource 身份链、libmpv 生命周期、generation/cancellation、renderer-main IPC 安全边界、CD2/provider credential、DirectUrl header 与 expires URL 处理，或复杂 fallback。主线程应向 worker 提供最小必要上下文，并在并行时用互不冲突的 worktree/branch 隔离实现；只读研究可以不创建 worktree。

如果 worker 发现设计与真实行为冲突、contract 不成立、测试与静态结论冲突、出现跨层生命周期风险，或连续两轮低成本修复仍未定位，应停止扩大实现并返回证据。升级报告至少包含 `Observed`、`Expected`、`Evidence`、`Files involved`、`Tests`、`Why current contract may be insufficient` 和 `Recommended escalation`。Worker 的 `done` 不构成通过，静态或局部测试也不替代真实播放、Session、远控或安装验收。

委派选择适用于新任务；已经按明确范围执行的任务继续保持原 contract，不因模型政策修订而强制中途拆分或重构。当前工具是否提供委派和是否允许本轮使用，以实时能力与上层指令为准。

## 边界与留痕

模型策略不能改变架构治理：所有模型都遵守 `AGENTS.md`、`ARCHITECTURE.md`、`DECISIONS.md` 和 `PROJECT_STATUS.md`。不得让低成本模型擅自重构核心播放链，也不得让高成本模型扩大已授权范围。

重要任务在 `docs/DEVELOPMENT_LOG.md` 记录：

```text
Model Tier: 1
Model: <actual model and reasoning effort>
Reason: task contract and acceptance criteria were already explicit
Escalated: no
```

Mount Resolver 已有实现与证据；后续局部维护先核对当前代码和 contract。已明确的独立实现、测试和文档可按 Tier 1 执行；Playback/Session、fallback、异步归属或 credential 边界的决策由主线程按 Tier 2 / Tier 3 风险处理。
