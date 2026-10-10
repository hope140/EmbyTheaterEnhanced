# Emby Theater Enhanced 协作规范

开始前阅读本文件、`docs/ARCHITECTURE.md`、`docs/PROJECT_STATUS.md`、`docs/LESSONS_LEARNED.md`，检查 Git 状态、分支、最近提交（如果尚未初始化 Git，则如实记录），再读相关源码。

项目来源基线是 Carnival 3.0 + 用户提供的综合补丁。当前产品与任务基线应在开工时按实际 refs、目标 worktree 和已授权范围核对；来源基线不代表最新产品 revision。官方 3.0.21 仅作比对参考。Windows / Emby / 内嵌 libmpv 优先。普通媒体保留原生链路；STRM 增强只替换最终 source，必须保留 PlaybackManager、Item、MediaSource、PlaySession 与远控生命周期。Item.Path 是 sidecar identity，MediaSource.Path 是 source identity。后续 Resolver 失败必须返回原生播放。

第一轮曾限定为基础构建、安装器、源码审计、外置播放器入口禁用及容错诊断；该阶段已结束。后续实现与阶段证据见 `docs/PROJECT_STATUS.md`、`docs/ARCHITECTURE.md`，当前计划见 `docs/ROADMAP.md`。已有功能和历史任务范围均不自动授权本轮新增、重构或外部操作。

原始归档与 vendor 内容只读；维护 `src/`，由 `tools/build.ps1` 生成 runtime。不要运行 Carnival 或综合补丁里的安装/恢复脚本。不要修改已有客户端、个人 mpv 配置或服务器数据。不要自动升级依赖。

每次交付执行与变更和风险相称的相关验证。有实现、决策、验收事实或当前状态变化时，一次性更新 PROJECT_STATUS、DEVELOPMENT_LOG 及直接受影响的专项文档；只读审核可在获准的独立输出中交付报告，重复状态查询不产生新的项目文档任务。纯文档变化检查事实、链接、diff 与敏感信息；待复用证据所依赖的产品、构建和测试输入均未改变且身份已核对时，不机械重建或重跑已通过 gate。复用证据须注明原 sourceCommit、输入身份、验证层级与未覆盖项，不改标为本轮新运行。区分静态、隔离 runtime、安装验收、真实 Emby 播放和真实远控证据。未通过不得记为完成。

提交、推送、PR、发布、部署、系统安装和外部发送必须有用户当前任务明确授权；任务书内的提交示例不构成授权。获授权后按可单独回滚的小范围提交。保留无关修改及用户数据。文档不得包含凭据或私人路径。

## 模型分级

开始任务时先判断 Task Risk、Task Uncertainty、Cross-module Scope 与 Playback/Session Impact，再按 `docs/AI_MODEL_POLICY.md` 的任务分级选择当前可用且足以可靠完成任务的模型与推理档位。Tier 表示任务风险和所需能力，不绑定模型代际；文件数量不是升级依据。具体型号建议以该政策为单一维护入口，开工时核对当前工具支持，公开能力与成本判断查官方资料。重要任务在 `docs/DEVELOPMENT_LOG.md` 留下 Model Tier、Model、Reason、Escalated；所有模型均遵守本文件和项目知识库。

## 子代理委派

如果当前环境提供且允许 subagent、worker 或 delegation，主线程应判断是否有边界明确、可独立验收的子任务。模型选择遵循 `docs/AI_MODEL_POLICY.md`，同时计入上下文传递、协调、等待和复核开销；简单串行任务可以直接完成。工具可用性与执行授权分别核对，委派不扩大父任务权限。

决定采用委派时，推荐的协作顺序是：

```text
高能力主线程：分析 → 拆任务 → 固化 contract → 定义验收标准
低成本 worker：执行明确任务
高能力主线程：检查 diff → 核对测试 → 验收 → 处理高风险部分
```

### 适合低成本 worker 的任务

在目标、输入输出、允许文件和验收标准均已明确时，按模型政策选择适合执行的可用模型：

- 补充单元测试、测试 case、fake server、fake gRPC、fake HTTP、fixture 和测试数据。
- 执行测试、构建、静态检查、`git diff --check`、重复构建验证，整理测试证据和普通测试失败日志。
- 同步 README、PROJECT_STATUS、DEVELOPMENT_LOG、CHANGELOG 等文档。
- 敏感信息扫描、日志脱敏检查、dependency inventory 和安装包 payload 核对。
- 实现已有明确 contract 的纯函数、helper、mapping、config parser 或独立 resolver 子模块。
- 按明确的 review comment 修复局部问题，或搜索代码引用、调用关系和影响范围。

明确、可重复的文档、测试、Git、日志、静态检查和独立实现可由 Tier 1 执行；推理档位随任务需要选择，不因进入编码阶段自动使用 Max。文件数量不构成自动升级理由。

### 必须保留给高能力主线程的任务

以下工作不得交给低成本 worker 自行决策：整体架构和跨层接口设计、PlaybackManager 生命周期、Session/PlaySessionId/MediaSource 身份链、libmpv 生命周期、async race/generation/stale response/cancellation、renderer 与 main 的 IPC 安全边界、CD2 或 provider 鉴权与 credential 边界、DirectUrl header 隔离与 URL reacquire、复杂 fallback、多个合理根因的难复现播放故障，以及 merge 前的最终核心正确性审核。

低成本 worker 可以为这些问题收集证据、补测试或验证一个明确假设，但不得改变架构 contract。

### Worker contract

每个 worker 任务至少写明：目标、允许修改的文件、禁止修改的文件、输入、输出、必须保持的不变量、验收标准、必须运行的测试，以及最终汇报内容。

Worker 不得自行扩大范围、增加未经批准的功能、改变批准的架构、重写稳定播放链或 merge PR。发现 contract 不成立、测试结果与设计冲突、必须改变架构或出现新的跨层风险时，应停止扩大实现，保存证据并返回主线程。

### 最小上下文

只向 worker 提供完成任务所需的最小上下文，例如相关测试文件、resolver contract、对应设计章节、当前 diff 和验收 case。无需让 worker 重新读取与任务无关的历史、完整调研、旧 PR 或全部日志。主线程应保留架构决策权，并在委派前明确哪些资料是事实、哪些是假设。

### 并行、worktree 与 branch

当 worker 之间不修改同一核心区域、且没有相互依赖的未决架构时，可以并行执行测试、文档和 packaging/dependency audit。不得让多个 worker 同时修改 PlaybackManager、libmpv 生命周期、同一个未定设计或其他高冲突核心文件。

实现型 worker 在环境支持时使用独立 worktree 和独立 branch；只读研究可以不创建 worktree。主线程负责检查 branch、commit 和 diff，worker 不得自行 merge。当前已有的 PR 或候选实现不因新增委派规则被中途拆分或重构。

### 主线程验收

Worker 报告 `done` 不代表通过。主线程必须查看真实 diff，确认没有越界，核对测试结果，检查关键不变量，确认没有引入新的依赖或未批准行为，并判断是否需要更高模型复核。验收时仍要区分静态检查、隔离 runtime、安装验收、真实 Emby 播放和真实远控证据；worker 的局部测试不能替代更高层验收。

### 停止与升级

Worker 遇到以下任一情况应返回主线程，而不是继续扩大修改：设计与真实行为冲突、需要改变批准的 contract、测试与静态结论冲突、出现跨层生命周期风险，或连续两轮低成本修复仍未定位。汇报至少使用以下结构：

```text
Observed:
Expected:
Evidence:
Files involved:
Tests:
Why current contract may be insufficient:
Recommended escalation:
```

是否提高模型能力或推理档位由主线程根据风险、当前证据和模型政策决定。

### 上下文成本

长任务可按“主线程研究与架构 → 固化设计 → worker 执行 → 主线程 review”缩小上下文；只有可隔离工作和预期收益足以覆盖协调开销时才拆分。委派次数和占比不作为完成标准，高风险决策和最终验收仍由主线程负责。
