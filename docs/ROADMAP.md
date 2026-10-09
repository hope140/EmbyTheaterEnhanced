# Development Roadmap

本页是 Emby Theater Enhanced 未来开发计划的正式来源。问题的复现情况见 [Known Issues](KNOWN_ISSUES.md)，已完成工作的证据见 [项目状态](PROJECT_STATUS.md) 与 [测试记录](TESTING.md)。状态区分 `main` 发布基线、功能分支和待验收工作。

## 当前本地里程碑（2026-10-09）

当前执行目标已进入0.2.6本地可安装测试包交付：独立候选整合必要材料、固定版本、正式build/package，完成五组隔离播放与三场景正常关闭、installer完整性和逐文件解包核对。进度见 [0.2.6本地包](LOCAL_PACKAGE_026.md)。本地交付完成后，主线整合、公开发布与真实使用验收仍是单独阶段。

`codex/stop-ownership-20261009` / sourceCommit `68eb024` 已交付0.2.5播放生命周期候选：请求快照、pending报告和Stop归属修复均在同一来源runtime复验，608/608、新五组矩阵/5对身份报告、完整来源与payload通过。退出取证已定位到旧d480eb8的app.exit返回后OS进程仍存活；新五组自然退出，根因继续UNKNOWN，不宣告退出稳定性问题关闭。见 [当前报告](STOP_OWNERSHIP_EXIT_EVIDENCE.md)。

后续顺序仍为候选审阅与退出观察、下一测试版安装包/发布准备、主线整合和真实使用验收。它们是后续阶段，当前本地交付没有自动进入这些外部动作；真实首帧/连续性、实服/远控与安装分别验收。

## Current Production Baseline

- `v0.2.2` 正式 Latest 对应提交 `9a034e8d627f71abbded01a1fba612d9282c9911`；2026-10-09 核验远端 `main=46e995e`，已包含 PR #18。最新测试版 `v0.2.5` 的产品 sourceCommit 为 `3ab10c94d75659c0a421b729aac3147afa680751`，从完整发布分支交付，尚未整合到 main；见 [发布与验收记录](RELEASE_025.md)。
- Native Helper + libmpv、Pepper / PPAPI 退役、Electron 44.4.2、apphost 启动命令兼容修复、Windows runtime / package provenance、STRM / CloudDrive2 / DirectUrl 基础路由和诊断包均已进入历史完成项；细节由既有专项文档维护。
- Smart Path Mapping 已合入 `main`，尚未进入 `v0.2.2` 正式发布基线。

## COMPLETED

### Smart Path Mapping

**状态：**

- Implementation = `COMPLETE`
- User Functional Acceptance = `PASS`
- Final Remote Review = `PASS`
- PR #18 = `MERGED`
- Merge commit = `121305b5fa74fa5bf9e8b76caabf280468ddb11b`

已完成的子项包括 inference engine、semantics 修正、多样本 Mapping Boundary、Existing Rule Coverage、Mount inference、显式 Save draft 和 CloudDrive2 connection status sync。

最终远端复审在 head `ade6620e80ce19da26d6a7bebc53368dffe3f8a5` 通过，BLOCKER/HIGH/MEDIUM/LOW 均为 `NONE`。PR #18 使用 merge commit 合入 `main`；正式发布仍为 `v0.2.2`。

合并前验收：Settings targeted `18/18 PASS`、focused STRM/Settings/CD2/Smart Mapping/diagnostics `191/191 PASS`、`npm test 319/319 PASS`；产品提交的 source、Electron 44.4.2、Native Helper、runtime provenance 与 package `-VerifyOnly` 均通过。合并后未执行新版本发布或真实客户端复测。

**边界：** 后续 STRM 设置页整理已经随 v0.2.4 完成并通过用户验收；现有 `rules[]`、Resolver 和播放身份链保持原约定。

## NOW

### 构建复核与安装器重复性

1a05f88本地候选已完成writer输出边界修正及重复验证，见 [构建复核交付](BUILD_REVIEW.md)。后续 v0.2.5/3ab10c9 重新通过535/535全量、17/17writer及两份独立runtime/原始installer字节比较，并作为测试版发布。对应源码材料补齐与主线整合保持独立事项；本轮继续既定播放实现。

### 构建输入与对应来源清单

清单审计和后续构建修正已完成，见 [审计报告](BUILD_INPUT_AUDIT.md) 与 [候选交付](BUILD_HARDENING.md)。3b158f6的安装器容器差异属于历史结果，后续1a05f88和本次v0.2.5各自取得固定输入下的runtime与原始installer字节一致证据。公开仓库完整构建及全部第三方对应源码仍未完成。

已实施 [构建输入绑定与依赖打包修正](BUILD_HARDENING.md)：提交元数据gate、精确npm目录、通知随包与完整本地GCC/Inno树锁。固定公开源码材料补齐了mpv header和8项辅助binary的精确公开身份；Host/离线Web/libmpv完整对应源码和第三方构建配方仍是后续材料工作。新候选的实际构建、重复性和安装器证据单列，不触发组件替换或发布变更。

### P2 阶段观测与能力核对

离线工具和合成样本报告已本地完成，见 [P2阶段观测](P2_TIMING_AND_CAPABILITY_REVIEW.md)。P2历史合成证据的输入sourceCommit为fb10f92；后续工程现已随v0.2.5测试版交付。构建输入清单已独立完成，材料缺口见上项；缺少真实服务样本不触发预热或Hydration实现。

### P0 基线与主线整合审查

基于完整 v0.2.4 候选整理当前状态与真实差异，见 [P0/P1 本地交付](P0_P1_DELIVERY.md)。Settings 用户验收通过；顶部细条用户确认消失；统一候选已补齐窗口交互、10 次 Next/Previous 与 Stop 回归。历史 430/430 和安装器 2147 文件结果见 [0.2.4 验收](SETTINGS_UI_024_ACCEPTANCE.md) 与 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)，不替代本轮验证。

旧 `test-20261008-cc603ba` Release 已删除，原 tag 与验收文档保留。main 整合、PR 与后续发布单独决定。

### P1 最小播放诊断与 Renderer 错误定位

补齐现有 JSONL 的 native 文件事件、generation/request 关联、持帧及 surface 隐藏观察，采集有限脱敏 Renderer 错误位置，并检查交付版本一致性。范围、限额、不可用语义和验证要求见 [诊断 contract](P1_DIAGNOSTICS_CONTRACT.md)；实际完成状态见 [本地交付](P0_P1_DELIVERY.md)。

### 1. NextTrack 切集瞬时白屏

**状态：** `USER_REPORTED_RESOLVED / MONITORING`。2026-10-08用户反馈还原候选前后切集问题基本解决；当前保持该呈现实现，历史白屏描述见Known Issues。

**前置条件与下一步：** 新样本出现后再按媒体、模式和操作时序复核；当前全屏局部修复不重做切集呈现。

**不要误修：** 在确认窗口与播放面之前，不添加黑色遮罩、定时重绘、focus hack 或 `SetWindowPos` workaround；也不把它归入 Seek / Stop 黑帧或 rapid NextTrack 夹具限制。

## 可选后续研究

2026-10-09已核对元数据、URL与媒体预读复杂度。跨请求URL复用需要失效/取消/鉴权归属，媒体预读会新增服务端副作用，当前没有实际收益证据；按用户“复杂就不做”要求结束本轮预热研究，不进入实现排期，见P2报告。

## P2

### Fullscreen Dynamic Corner Policy

**状态：** `REPRODUCIBLE / DEFERRED`。未播放时 windowed 有圆角、fullscreen 为直角；开始播放后 fullscreen 错误出现圆角。

**当前判断：** playback surface top-level window 的 DWM corner state 未随 mainWindow fullscreen 状态同步是较强嫌疑，尚未证实为根因。

**目标：** windowed 为圆角、fullscreen 为直角，播放面跟随 mainWindow。先确认窗口身份和 DWM state；没有新证据前不回到 redraw timers、focus hacks、`SetWindowPos` loops 或 GPU flags。

### CD2 Path Hydration

**状态：** `EVIDENCE-GATED`，等待真实 `not_found` 样本。先取得 CD2 路径可见性前后对照，区分目录未物化与 timeout / transport / 鉴权问题；再决定是否设计有界恢复。

**不要误修：** 不预先实现 ancestor enumeration、cold directory materialization 或 retry loop。既有 Mount / Native fallback 保持有效。

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
- rapid NextTrack旧`selected=false`为历史夹具结果；已由显式pending/cancel/迟到metadata门槛取代。d480eb8与68eb024分别修复其后确认的请求身份/pending报告、Stop归属问题；新五组全部通过，不再以旧“夹具限制”概括当前状态。
- transport `stdout-end` stress：跨 Electron 18 与 44 的 harness / environment gap，不能据此直接改 Native Helper。

## DEFERRED / DECISION

- Electron Forge migration evaluation：按现有安装与构建契约另行评估，不与播放问题混修。
- 对应源码 / 通知交付 / 完整工具链材料：清单审计完成，缺口与补齐顺序见 [构建输入审计](BUILD_INPUT_AUDIT.md)，许可状态见 [许可文档](LICENSING.md)。

## Frozen Artifact

既有文档记录 `.work/stop-barrier-candidate.patch` 为 **FROZEN / DO NOT TOUCH**。本独立 worktree 中未见该文件；本轮没有读取、应用、修改或删除它。
