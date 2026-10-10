# Development Roadmap

本页是 Emby Theater Enhanced 未来开发计划的正式来源。问题的复现情况见 [Known Issues](KNOWN_ISSUES.md)，已完成工作的证据见 [项目状态](PROJECT_STATUS.md) 与 [测试记录](TESTING.md)。状态区分 `main` 发布基线、功能分支和待验收工作。

## 当前里程碑（2026-10-10 会话与文件复核）

v0.2.6 / 355f4e6的本地交付与Pre-release公开发布均已完成，三个发布资产已完整回下载核验，见 [发布记录](RELEASE_026.md)。产品验收为631/631、三场景正常关闭、五组完整隔离pipeline、安装器完整性及2136文件解包一致；准确来源与边界见 [本地交付](LOCAL_PACKAGE_026.md)。

PR #20已于2026-10-09 22:22:16（UTC+8）合并；本次远端回读main为bc50d181，开放PR为0。原main46e995e与整合提交45ec2d6为合并父提交。发布tag与产品sourceCommit保持355f4e6；[主线整合报告](MAIN_INTEGRATION_026.md) 中OPEN是创建阶段的历史回执。

grpc-js 1.14.6、About随包版本/刷新和随后发现的同步哈希阻塞已在本地完整维护栈完成。最新分支为codex/about-async-20261010，HEAD dbee15af；产品sourceCommit为7cc7eb85，观测工具为c9502aec。相对main为6个提交、33个文件，包含此前6815d2f维护成果，尚未推送、创建PR、合入或发布。不能把旧7ec6ace候选重新列为最终交付，也不能把这批本地维护说成已包含在公开v0.2.6中。

最新候选的产品全量646/646、工具回归49/49；idle正常关闭及最终hit400完整pipeline通过，取得实际应用renderer中的初始与Helper ready后IPC、复制同快照、诊断导出和main响应性证据。安装器175,627,068 bytes，解包2,137文件一致。初版observer误判造成的FAIL/强清理保留，最终结果使用纠正后的逐快照状态校验。以上为原候选阶段证据；本轮0.2.7从完整维护HEAD继续，使用新sourceCommit构建与隔离验证，结果见本轮收口报告。

用户已开始日常使用，暂未报告新问题；不再把“等待开始使用”作为工程阻塞，也不扩展成所有真实场景均已验收。早期直接app.exit超时仍为UNKNOWN；完整安装生命周期、真实服务专项、可见连续性、HDR/多屏继续独立记录。本次事实、来源与优先级见 [结构化复核记录](evidence/project-priorities-20261010.json)。

## 后续优先级与里程碑

下表保留2026-10-10复核确定的优先级，本轮按用户项目内维护授权推进。P1表示下一步工程优先项，不表示新发现P1产品故障；当前已读会话及文件中未见尚未处理、足以升级为P0的明确新问题。推送、PR、合并、发布、系统安装和全局规则修改各按用户确认范围执行。

| 优先级 / 编号 | 工作与当前状态 | 可自主推进的准备 | 完成标准 / 需要用户参与 |
|---|---|---|---|
| P1 / A1 | 完整维护收口，READY_FOR_PARENT_REVIEW / NOT IN MAIN | 本轮完整栈复核、新版本固定来源、单测和隔离验证完成，见 [收口报告](MAINTENANCE_027.md) | 父会话独立审查后进入本地打包；远端整合另按明确授权 |
| P1 / D1 | 协作与历史文档收口，项目规则S1–S5已接受并应用 | 保留审计结论，重组S1–S5候选并修正下面列出的三处歧义；本轮已更新当前状态导航 | S1–S5按已审阅方向生效，三处歧义已修正；S6为EXCLUDED_BY_USER / KEEP_CANDIDATE，不阻塞A1 |
| P2 / R1 | 下一测试版准备，依赖A1审查及分发决定 | 整理准确变更说明、版本一致性、来源、校验文件和发布清单 | 本轮采用未占用的0.2.7本地测试身份，父会话审核通过后生成最终安装包；若版本或其它构建输入变化，必须生成并验证新来源产物。保留现有v0.2.6 tag和资产，不给7cc7eb85候选改名冒充新版本 |
| P2 / T1 | 有界核查完成，WAITING_EXTERNAL | 160项实体回读一致，三轮查询和四类缺口已记录于 [材料收尾](THIRD_PARTY_MATERIALS_CLOSEOUT_027.md) | 外部材料到达后按准确身份接续，索取需单独授权发送 |
| P2 / I1 | 安装生命周期，独立环境待安排 | 准备干净安装、原位升级、卸载、重装四阶段检查与回滚方案 | 用户确认测试环境及系统安装范围后执行；核对设置/DeviceId预期保留、快捷方式和非预期残留，不覆盖日常客户端 |
| P3 / H1 | 全屏圆角、混合DPI/多屏、HDR专项 | 整理最小场景、当前候选身份及观察项 | 有相应设备/新样本并确认前台验证后执行；目前维持DEFERRED，不与A1混修 |

里程碑M1是完整维护成果进入可审阅整合状态，随后按明确授权完成主线整合；M2是按确定的新发布身份形成可分发测试包；M3是安装生命周期与第三方剩余材料的处置结论具备后，再评估正式稳定版范围。M3不是要求用户立即补齐所有硬件场景，也不将日常使用反馈替代各项专项验收。

### 项目规则收口与全局候选范围

S1模型型号集中并按任务能力选取、S2历史方案作用域、S3当前导航、S4一次收尾与同源证据复用、S5计入委派协调开销已在项目内应用。70%/5%既有目标保留，不按配额牺牲质量。worker流程前明确“决定采用委派时”；复用条件明确“待复用证据所依赖的产品、构建和测试输入均未改变且身份已核对”。S6全局候选按用户范围澄清为 `EXCLUDED_BY_USER / KEEP_CANDIDATE`，全局AGENTS、配置与memory不在本轮范围。

### 来源与后续接手

公开基线使用main和Release回读。最新本地专项文档位于codex/about-async-20261010分支的docs/ABOUT_VERSION_ASYNC.md、docs/MAINTENANCE_GRPC_ABOUT.md及对应evidence；这些文件在本轮完整维护树存在，尚未进入远端main；读取时保持各自原产品身份。项目规则按本轮授权局部应用，独立审计报告保留其候选创建阶段。接手时先核对当前HEAD、差异和来源记录，不因旧会话末尾曾写“等待授权”而忽略其后已完成的提交与验收。

## Current Production Baseline

- `v0.2.2` 正式 Latest 对应提交 `9a034e8d627f71abbded01a1fba612d9282c9911`；2026-10-10回读远端 `main=bc50d181`，已包含PR #20。公开测试版 `v0.2.6` 的产品sourceCommit仍为 `355f4e6ba434074d1cd5c17e24cd79bad0f5eb1f`，已随PR #20整合；后续grpc/About维护仍为独立本地候选。见 [发布与验收记录](RELEASE_026.md)。
- Native Helper + libmpv、Pepper / PPAPI 退役、Electron 44.4.2、apphost 启动命令兼容修复、Windows runtime / package provenance、STRM / CloudDrive2 / DirectUrl 基础路由和诊断包均已进入历史完成项；细节由既有专项文档维护。
- Smart Path Mapping 已合入 `main`，尚未进入 `v0.2.2` 正式发布基线。

## COMPLETED

### v0.2.6 主线整合

[PR #20](https://github.com/hope140/EmbyTheaterEnhanced/pull/20) 已MERGED，合并提交bc50d181保留父提交46e995e与45ec2d6及完整历史。原整合全量631/631和发布产物355f4e6保持各自身份；当时无CI检查不代表CI通过。该项退出NOW，新的维护整合按A1处理。

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

### 构建复核与安装器重复性

1a05f88已完成writer输出边界修正及重复验证，见 [构建复核交付](BUILD_REVIEW.md)。v0.2.5/3ab10c9另取得535/535全量、17/17writer及两份独立runtime/原始installer字节一致证据，并已发布。v0.2.6继承这些实现，另有其准确来源的正式构建、安装器与运行证据；旧重复性结果不改标成v0.2.6双构建。

### 构建输入与对应来源清单

清单审计和后续构建修正已完成，见 [审计报告](BUILD_INPUT_AUDIT.md) 与 [候选交付](BUILD_HARDENING.md)。3b158f6的安装器容器差异属于历史结果，后续1a05f88和本次v0.2.5各自取得固定输入下的runtime与原始installer字节一致证据。公开仓库完整构建及全部第三方对应源码仍未完成。

已实施 [构建输入绑定与依赖打包修正](BUILD_HARDENING.md)：提交元数据gate、精确npm目录、通知随包与完整本地GCC/Inno树锁。固定公开源码材料补齐了mpv header和8项辅助binary的精确公开身份；Host/离线Web/libmpv完整对应源码和第三方构建配方仍是后续材料工作。新候选的实际构建、重复性和安装器证据单列，不触发组件替换或发布变更。

### P2 阶段观测与能力核对

离线工具和合成样本报告已本地完成，见 [P2阶段观测](P2_TIMING_AND_CAPABILITY_REVIEW.md)。P2历史合成证据的输入sourceCommit为fb10f92；后续工程现已随v0.2.5测试版交付。构建输入清单已独立完成，材料缺口见上项；缺少真实服务样本不触发预热或Hydration实现。

### Settings 与 P0 基线整理

基于完整 v0.2.4 候选整理当前状态与真实差异，见 [P0/P1 本地交付](P0_P1_DELIVERY.md)。Settings 用户验收通过；顶部细条用户确认消失；统一候选已补齐窗口交互、10 次 Next/Previous 与 Stop 回归。历史 430/430 和安装器 2147 文件结果见 [0.2.4 验收](SETTINGS_UI_024_ACCEPTANCE.md) 与 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)，不替代本轮验证。

旧 `test-20261008-cc603ba` Release 已删除，原 tag 与验收文档保留。以上成果均在v0.2.6完整发布树中，主线整合范围见本页当前里程碑。

### P1 最小播放诊断与 Renderer 错误定位

已补齐现有 JSONL 的 native 文件事件、generation/request 关联、持帧及 surface 隐藏观察、有限脱敏 Renderer 错误位置与交付版本检查，随v0.2.5发布并保留在v0.2.6。范围、限额、不可用语义见 [诊断 contract](P1_DIAGNOSTICS_CONTRACT.md)，历史验收见 [本地交付](P0_P1_DELIVERY.md)。

### 播放请求、Stop 与正常关闭

v0.2.6已包含每请求options快照、pending报告抑制、捕获stream的Stop排空与一次报告、Native Helper共享destroy及全部pending退出等待。631项和八组完整隔离运行见 [0.2.6交付](LOCAL_PACKAGE_026.md)；真实Emby/CD2/远控仍按独立范围验收。

## NOW

当前顺序为完整维护栈审阅与0.2.7本地交付准备。项目S1–S5收口、材料有界核查、安装器静态审查与显示前置整理在本轮完成，最终安装包在父会话独立审核通过后生成。grpc/About来源及异步修复沿用已完成实现；不重复开发。原主目录与旧候选保留，公开main/Release身份保持。

## 可选后续研究

2026-10-09已核对元数据、URL与媒体预读复杂度。跨请求URL复用需要失效/取消/鉴权归属，媒体预读会新增服务端副作用，当前没有实际收益证据；按用户“复杂就不做”要求结束本轮预热研究，不进入实现排期，见P2报告。

## P2

### About 高级运行信息

版本来源、刷新与main异步校验已由原7cc7eb85本地候选覆盖，实际Helper ready后IPC证据已取得；本轮完整继承并以0.2.7新来源验证，见 [原异步维护](ABOUT_VERSION_ASYNC.md) 与本轮收口。公开v0.2.6保持原身份。

### Fullscreen Dynamic Corner Policy

**状态：** `REPRODUCIBLE / DEFERRED`。未播放时 windowed 有圆角、fullscreen 为直角；开始播放后 fullscreen 错误出现圆角。

**当前判断：** playback surface top-level window 的 DWM corner state 未随 mainWindow fullscreen 状态同步是较强嫌疑，尚未证实为根因。

**目标：** windowed 为圆角、fullscreen 为直角，播放面跟随 mainWindow。先确认窗口身份和 DWM state；没有新证据前不回到 redraw timers、focus hacks、`SetWindowPos` loops 或 GPU flags。

### CD2 Path Hydration

**状态：** `EVIDENCE-GATED`，等待真实 `not_found` 样本。先取得 CD2 路径可见性前后对照，区分目录未物化与 timeout / transport / 鉴权问题；再决定是否设计有界恢复。

**不要误修：** 不预先实现 ancestor enumeration、cold directory materialization 或 retry loop。既有 Mount / Native fallback 保持有效。

### Installer Residual Audit

**状态：** 静态审查及四阶段/回滚计划已完成，见 [安装与显示准备](INSTALL_DISPLAY_READINESS_027.md)。当前未发现可立即使用的隔离VM/Sandbox；四阶段系统执行为NOT_EXECUTED。profile/DeviceId有意保留与程序残留分别取证。

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
- 对应源码与第三方完整构建材料：清单审计、固定工具链锁及四份通知随包已完成；Host/离线Web/libmpv等剩余材料见 [来源索引](SOURCE_MATERIALS.md) 与 [第三方审计](THIRD_PARTY_MATERIALS_AUDIT.md)，许可状态见 [许可文档](LICENSING.md)。

## Frozen Artifact

既有文档记录 `.work/stop-barrier-candidate.patch` 为 **FROZEN / DO NOT TOUCH**。本独立 worktree 中未见该文件；本轮没有读取、应用、修改或删除它。
