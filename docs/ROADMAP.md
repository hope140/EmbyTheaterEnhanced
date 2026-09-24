# Development Roadmap

本页是 Emby Theater Enhanced 未来开发计划的正式来源。问题的复现情况见 [Known Issues](KNOWN_ISSUES.md)，已完成工作的证据见 [项目状态](PROJECT_STATUS.md) 与 [测试记录](TESTING.md)。状态区分 `main` 发布基线、功能分支和待验收工作。

## Current Production Baseline

- `origin/main@9a034e8d627f71abbded01a1fba612d9282c9911`，对应 `v0.2.2` 正式发布基线。
- Native Helper + libmpv、Pepper / PPAPI 退役、Electron 44.4.2、apphost 启动命令兼容修复、Windows runtime / package provenance、STRM / CloudDrive2 / DirectUrl 基础路由和诊断包均已进入历史完成项；细节由既有专项文档维护。
- Smart Path Mapping 子项按当前用户提供的功能分支验收状态记录；尚未合并或发布，不属于上述 production baseline。

## NOW

### Smart Path Mapping Finalization

**状态：**

- Implementation = `COMPLETE`（功能分支）
- User Functional Acceptance = `PASS`
- Previous HIGH = `CLOSED`
- Remaining MEDIUM（Token response ordering）= `REMEDIATION APPLIED / RE-REVIEW PENDING`
- Final PR Review = `RE-REVIEW PENDING`
- PR / Merge = `PENDING`

已完成的子项包括 inference engine、semantics 修正、多样本 Mapping Boundary、Existing Rule Coverage、Mount inference、显式 Save draft 和 CloudDrive2 connection status sync。

历史审计记录：此前对 `2baf221af3d580c3d84b27e491106e79ae44aa16` 的审计曾记录 BLOCKER/HIGH 均为 `NONE`、`npm test 308/308 PASS` 和 build/provenance `PASS`。后续针对 PR #18 的复审发现 Token 回包会覆盖未保存的 Settings draft；该 HIGH 已修复并关闭。之后的远端复审发现较早 Token 操作的迟到回包仍可能覆盖较新状态；该 MEDIUM 已应用本地修复，等待远端重新审查。历史结论不代表当前最终审查状态。

本轮 Settings targeted `18/18 PASS`、focused STRM/Settings/CD2/Smart Mapping/diagnostics `191/191 PASS`、`npm test 319/319 PASS`；修改的 JS/CJS 语法检查与 `git diff --check` PASS。exact-HEAD build/provenance 由最终提交的验收结果单独确认。后续顺序：远端重新审查 → PR / Merge。当前不标记为 `READY TO MERGE`，也不代表已经合并、发布或进入 production baseline。

**边界：** STRM 设置页 UI Consolidation 单列于 NEXT，不进入 Smart Mapping 功能 PR；现有 `rules[]`、Resolver 和播放身份链保持原约定。

## NEXT / P1

### 1. NextTrack 切集瞬时白屏

**状态：** `REPRODUCIBLE / USER-VISIBLE / NON-FATAL / SELF-RECOVERING`。按当前用户观察，播放中点击下一集时 100% 出现：视频区域全白，Emby UI / OSD 仍在，等待后下一集自行正常播放。

**前置条件与下一步：** 先做根因诊断，沿 `NextTrack → previous video teardown → playback surface lifecycle → next source resolve → helper/loadfile → first video frame` 记录有界时序和窗口身份，确认究竟哪个 window / surface 暴露白色背景。

**不要误修：** 在确认窗口与播放面之前，不添加黑色遮罩、定时重绘、focus hack 或 `SetWindowPos` workaround；也不把它归入 Seek / Stop 黑帧或 rapid NextTrack 夹具限制。

### 2. STRM UI Consolidation

**状态：** 待 Smart Mapping 功能 PR 结束后单独处理。现有页面由旧 STRM UI、Smart Mapping UI 和后加的 status UI 组成，视觉层级尚未统一。

**目标：** 统一 input、select、toggle、button hierarchy、rule card、assistant sample card、preview card、status indicator、spacing、typography 与 responsive layout。

**边界：** 只整理设置页体验，不改变 Smart Mapping algorithm 或 Resolver。

### 3. Next Episode / DirectUrl / CD2 Pre-warm

**状态：** 历史明确 backlog，尚未实现。

**方向：** 在 post-bridge 阶段，以固定播放进度阈值启动有界准备；从 STRM 找到真实 CD2 target，为下一次 NextTrack 获取 fresh DirectUrl。失败时 fail-open，不能复用旧 Session / PlaySession。实现前需先固定触发、取消、身份和过期边界，并独立验收。

## P2

### Fullscreen Dynamic Corner Policy

**状态：** `REPRODUCIBLE / DEFERRED`。未播放时 windowed 有圆角、fullscreen 为直角；开始播放后 fullscreen 错误出现圆角。

**当前判断：** playback surface top-level window 的 DWM corner state 未随 mainWindow fullscreen 状态同步是较强嫌疑，尚未证实为根因。

**目标：** windowed 为圆角、fullscreen 为直角，播放面跟随 mainWindow。先确认窗口身份和 DWM state；没有新证据前不回到 redraw timers、focus hacks、`SetWindowPos` loops 或 GPU flags。

### CD2 Path Hydration

**状态：** `EVIDENCE-GATED`，等待真实 `not_found` 样本。先取得 CD2 路径可见性前后对照，区分目录未物化与 timeout / transport / 鉴权问题；再决定是否设计有界恢复。

**不要误修：** 不预先实现 ancestor enumeration、cold directory materialization 或 retry loop。既有 Mount / Native fallback 保持有效。

### Diagnostics Observability

**状态：** 计划补足 `helper-ready`、`loadfile`、`core-playing`、`stop` 的有界可观测 marker。目标是定位播放阶段与证据缺口，不改变 playback behavior，不用推断 marker 冒充真实事件。

### Renderer ReferenceError Observer

**状态：** 历史真实 run 有非阻断事件，但缺 message / stack。先加脱敏、有界 observer，取得定位证据后再判断修复范围。

### Installer Residual Audit

**状态：** 待执行完整 `clean install → in-place upgrade → uninstall → reinstall` 检查。区分有意保留的 profile / DeviceId 与非预期 residue；各阶段以实际安装产物和系统状态取证。

## P3

### Mixed-DPI / Multi-monitor scaling

**状态：** `DEFERRED`；需要真实多显示器与不同缩放比环境验收。

### HDR Validation

**状态：** `DEFERRED`；保留真实 HDR 媒体与显示链专项验证。

## OBSERVE

以下项目暂无足够的新证据进入主动修复；新样本出现时先更新 [Known Issues](KNOWN_ISSUES.md)：

- Seek transient black frame：旧版本观察到，近期 `v0.2.2` 前台验收未稳定复现。
- Stop / Exit transient black frame：同上，需区分停止与退出的时序。
- rapid NextTrack `selected=false`：与 Electron 18 baseline 匹配的 formal 夹具限制，当前不作为 source regression。
- transport `stdout-end` stress：跨 Electron 18 与 44 的 harness / environment gap，不能据此直接改 Native Helper。

## DEFERRED / DECISION

- Electron Forge migration evaluation：按现有安装与构建契约另行评估，不与播放问题混修。
- vendor binary / source rebuild / license closure：按来源、再构建能力与许可义务独立决策，见 [许可文档](LICENSING.md)。

## Frozen Artifact

既有文档记录 `.work/stop-barrier-candidate.patch` 为 **FROZEN / DO NOT TOUCH**。本独立 worktree 中未见该文件；本轮没有读取、应用、修改或删除它。
