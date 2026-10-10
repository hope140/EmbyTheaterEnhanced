# Development Roadmap

本页是 Emby Theater Enhanced 后续计划的正式来源。当前完整源码与文档以 `main` 为准，测试包以v0.2.7的固定产品来源为准。问题的复现情况见 [Known Issues](KNOWN_ISSUES.md)，已完成工作的证据见 [项目状态](PROJECT_STATUS.md) 与 [测试记录](TESTING.md)。

## 当前里程碑（2026-10-10 独立审核）

审核固定main `0b782dd`、产品v0.2.7 `d8fcb0f9`。独立审核完成，PLAY-01已在独立本地产品提交 `1a62f3d` 修复，定向46/46、全量681/681及独立复核通过；尚未进入main或发布版本。请求归属contract、构建与隔离runtime结果见 [PLAY-01报告](PLAY01_STOP_BOUNDARY.md)。SEC-01、SEC-02局部边界、LIFE-01与LIFE-02仍为各自本地分支，未提前合并。本轮只关闭PLAY-01的确定性局部问题，正式版仍需组合候选与实际场景验收。准备入口见 [独立报告](INDEPENDENT_REVIEW_028.md)、[交付验收](REVIEW_028_DELIVERY.md)、[播放矩阵](RELEASE_ACCEPTANCE_MATRIX.md)、[安装卡](INSTALLER_LIFECYCLE_CARD.md)。以下0.2.7发布数据保留历史身份。

0.2.7产品d8fcb0f9和获审阅的安装器已按原字节发布为Pre-release，完整源码、文档及原始审核证据已通过 [PR #21](https://github.com/hope140/EmbyTheaterEnhanced/pull/21) 合入main，整合提交ef4fcf58。整体审核直接使用main并记录实际HEAD，入口见 [AI审核指南](AI_REVIEW_GUIDE.md)；发布与合并核验见 [0.2.7发布记录](RELEASE_027.md) 和 [主线收尾](MAIN_CLOSEOUT_027.md)。

上一轮PR #20已于2026-10-09 22:22:16（UTC+8）合并，得到历史基线bc50d181；父提交为46e995e与45ec2d6。其v0.2.6产品sourceCommit保持355f4e6；[主线整合报告](MAIN_INTEGRATION_026.md) 中OPEN是创建阶段的历史回执。

grpc-js 1.14.6、About随包版本/刷新及异步校验均已进入main与0.2.7完整维护栈。旧6815d2f/7ec6ace与dbee15af/7cc7eb85仍为各自阶段的来源，最终产品采用d8fcb0f9、观测工具0e87d4f。原公开v0.2.6/355f4e6保持其历史身份。

0.2.7最终产品全量651/651、工具42/42、父会话53/53，十组串行隔离运行及About初始/ready IPC通过。安装器175,632,871 bytes，SHA256为86bee55146714f4f7e493cadb8b483537644f513c92364df7fc0c18f5315f3db；解包与runtime各2,137文件一致。旧observer误判FAIL和原证据层级保留；该发布轮次只复制获核验产物和证据，没有重建或重跑相同产品。本次独立审核未执行远端写入。

用户已开始日常使用，暂未报告新问题；不再把“等待开始使用”作为工程阻塞，也不扩展成所有真实场景均已验收。早期直接app.exit超时仍为UNKNOWN；完整安装生命周期、真实服务专项、可见连续性、HDR/多屏继续独立记录。前期优先级的历史快照见 [结构化复核记录](evidence/project-priorities-20261010.json)，后续完成事实以本页当前状态和 [主线收尾记录](evidence/main-closeout-027-20261010.json)为准。

## 后续优先级与里程碑

下表只列尚未关闭的工程与验收事项。原A1/D1/R1及独立审核已经完成；发现P1不等于真实用户环境已发生，具体复现层级以独立报告为准。

| 优先级 / 编号 | 工作与当前状态 | 可自主推进的准备 | 完成标准 / 需要用户参与 |
|---|---|---|---|
| P1 / PLAY-01 | LOCAL_FIX_UNIT_VERIFIED / NOT_MERGED | 最小contract、RED/GREEN及独立复核已完成；产品1a62f3d | 获准后独立PR审查；隔离runtime结果见专项报告；组合候选和真实服务验收后解除发布阻断 |
| P1 / SEC-01、SEC-02、LIFE-02；P2 / LIFE-01 | LOCAL_UNIT_VERIFIED / NOT_MERGED | 四项独立提交已完成源码与局部测试复核 | 获批准后逐项PR；LIFE-02依赖LIFE-01；组合候选需重新验证IPC、正常关闭与播放路由 |
| P2 / CI-01 | 本地公开离线CI准备 | 精确区分公开测试与6份材料依赖测试，语法/diff/有限敏感检查 | Actions真实运行待push/PR授权；完整vendor构建层仍单列 |
| P2 / QA-01 | PREPARED | 可执行离线测试、真实场景矩阵与授权边界已准备 | 新合并候选runtime与获授权的Emby/CD2/Session/字幕章节/远控验收 |
| P2 / SEC-02后续 | DESIGN_REQUIRED | 主frame/导航已局部加固；fs/rawIPC/CORS/CSP/isolation依赖已列明 | 窄preload接口与兼容性设计；不能直接整体启用隔离开关 |
| P2 / T1 | 有界核查完成，WAITING_EXTERNAL | 160项实体回读一致，三轮查询和四类缺口已记录于 [材料收尾](THIRD_PARTY_MATERIALS_CLOSEOUT_027.md) | 外部材料到达后按准确身份接续，索取需单独授权发送 |
| P2 / INST-01 | PREPARED / REAL NOT_EXECUTED | 四阶段卡与只读目录/DeviceId快照工具、合成验证已准备 | 独立VM和系统安装范围授权后执行v0.2.2→候选升级、卸载、重装；不使用历史0.1.x脚本冒充当前验收 |
| P3 / H1 | 全屏圆角、混合DPI/多屏、HDR专项，DEFERRED | 最小场景、当前候选身份与观察项已整理 | 有相应设备/新样本并确认前台验证后执行；先定位再决定局部修复，不扩大为显示链重构 |

已完成里程碑：M1完整维护审阅并合入main；M2发布并完整回读0.2.7测试安装包。下一里程碑M3为独立整体审核意见处置完成：确认的问题有复现、修复和相称验证，证据不足项有明确结论。其后M4为稳定版范围决策：结合安装生命周期与第三方材料处置结果，明确可发布范围和仍保留的验收边界。M4不要求立即补齐所有硬件场景，也不将日常使用反馈替代专项验收。

### 项目规则收口与全局候选范围

S1模型型号集中并按任务能力选取、S2历史方案作用域、S3当前导航、S4一次收尾与同源证据复用、S5计入委派协调开销已在项目内应用。70%/5%既有目标保留，不按配额牺牲质量。worker流程前明确“决定采用委派时”；复用条件明确“待复用证据所依赖的产品、构建和测试输入均未改变且身份已核对”。S6全局候选按用户范围澄清为 `EXCLUDED_BY_USER / KEEP_CANDIDATE`，全局AGENTS、配置与memory不在本轮范围。

### 来源与后续接手

整体审核使用main与 [AI审核指南](AI_REVIEW_GUIDE.md)，其中包含About、grpc维护及0.2.7全部专项文档、原始测试日志与来源记录。项目S1–S5已应用，全局S6继续排除。接手时先记录main实际HEAD与产品来源，不把历史会话的“等待授权”“待打包”或旧PR的OPEN快照当作当前进度。

## Current Production Baseline

- `v0.2.2` 正式Latest对应9a034e8d；main已包含PR #20与PR #21的完整维护历史。最新公开测试版v0.2.7绑定产品d8fcb0f9，完整项目审核直接使用main。旧v0.2.6/355f4e6保持历史身份；见 [0.2.7发布记录](RELEASE_027.md) 与 [0.2.6记录](RELEASE_026.md)。
- Native Helper + libmpv、Pepper / PPAPI 退役、Electron 44.4.2、apphost 启动命令兼容修复、Windows runtime / package provenance、STRM / CloudDrive2 / DirectUrl 基础路由和诊断包均已进入历史完成项；细节由既有专项文档维护。
- Smart Path Mapping 已合入 `main`，尚未进入 `v0.2.2` 正式发布基线。

## COMPLETED

### 0.2.7 维护、文档规则与公开交付（原A1 / D1 / R1）

grpc-js 1.14.6、About可信版本/刷新/异步校验、S1–S5项目规则、历史方案作用域、公开审核资料及原字节测试安装器均已完成。PR #21以ef4fcf58合入main，合并树与已审阅1addcc73完全一致；v0.2.7及三个资产已发布并完整回下载核验。详见 [主线收尾](MAIN_CLOSEOUT_027.md)。全局S6按用户决定排除，不列为待批准或交付阻塞。

### About 高级运行信息

版本来源、刷新与main异步校验已由原7cc7eb85候选实现；0.2.7完整继承并验证了Helper ready后的实际IPC、复制同快照与诊断导出。见 [异步维护记录](ABOUT_VERSION_ASYNC.md) 和 [0.2.7维护收口](MAINTENANCE_027.md)。该项已实现、已发布、已进入main。

### v0.2.6 主线整合

[PR #20](https://github.com/hope140/EmbyTheaterEnhanced/pull/20) 已MERGED，合并提交bc50d181保留父提交46e995e与45ec2d6及完整历史。原整合全量631/631和发布产物355f4e6保持各自身份；当时无CI检查不代表CI通过。后续0.2.7整合亦已完成，见上项。

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

独立审核已完成，先处理PLAY-01的核心contract与回归设计，随后按授权进行独立修复PR及组合候选验收。当前只完成本地分支、测试和准备；没有push/PR/merge/tag/发布/安装。材料T1仍WAITING_EXTERNAL，显示H1及历史观察维持原条件触发边界。

## 可选后续研究

2026-10-09已核对元数据、URL与媒体预读复杂度。跨请求URL复用需要失效/取消/鉴权归属，媒体预读会新增服务端副作用，当前没有实际收益证据；按用户“复杂就不做”要求结束本轮预热研究，不进入实现排期，见P2报告。

## P2

### CD2 Path Hydration

**状态：** `EVIDENCE-GATED`，等待真实 `not_found` 样本。先取得 CD2 路径可见性前后对照，区分目录未物化与 timeout / transport / 鉴权问题；再决定是否设计有界恢复。

**不要误修：** 不预先实现 ancestor enumeration、cold directory materialization 或 retry loop。既有 Mount / Native fallback 保持有效。

### Installer Residual Audit

**状态：** 静态审查及四阶段/回滚计划已完成，见 [安装与显示准备](INSTALL_DISPLAY_READINESS_027.md)。当前未发现可立即使用的隔离VM/Sandbox；四阶段系统执行为NOT_EXECUTED。profile/DeviceId有意保留与程序残留分别取证。

## P3

### Fullscreen Dynamic Corner Policy

**状态：** `REPRODUCIBLE / DEFERRED`。未播放时 windowed 有圆角、fullscreen 为直角；开始播放后 fullscreen 错误出现圆角。按H1列P3显示专项，未新增播放阻断证据。

**当前判断：** playback surface top-level window 的 DWM corner state 未随 mainWindow fullscreen 状态同步是较强嫌疑，尚未证实为根因。

**目标：** windowed 为圆角、fullscreen 为直角，播放面跟随 mainWindow。先确认窗口身份和 DWM state；没有新证据前不回到 redraw timers、focus hacks、`SetWindowPos` loops 或 GPU flags。

### Mixed-DPI / Multi-monitor scaling

**状态：** `DEFERRED`；需要真实多显示器与不同缩放比环境验收。

### HDR Validation

**状态：** `DEFERRED`；保留真实 HDR 媒体与显示链专项验证。

## OBSERVE

以下项目暂无足够的新证据进入主动修复；新样本出现时先更新 [Known Issues](KNOWN_ISSUES.md)：

- 历史候选直接app.exit后OS进程未退出：根因UNKNOWN，正常产品关闭通过不等于该路径已解决；有新复现时按原始证据继续定位。
- Seek transient black frame：旧版本观察到，近期 `v0.2.2` 前台验收未稳定复现。
- Stop / Exit transient black frame：同上，需区分停止与退出的时序。
- rapid NextTrack旧`selected=false`为历史夹具结果；已由显式pending/cancel/迟到metadata门槛取代。d480eb8与68eb024分别修复其后确认的请求身份/pending报告、Stop归属问题；新五组全部通过，不再以旧“夹具限制”概括当前状态。
- transport `stdout-end` stress：跨 Electron 18 与 44 的 harness / environment gap，不能据此直接改 Native Helper。

## DEFERRED / DECISION

- Electron Forge migration evaluation：按现有安装与构建契约另行评估，不与播放问题混修。
- 对应源码与第三方完整构建材料：清单审计、固定工具链锁及四份通知随包已完成；Host/离线Web/libmpv等剩余材料见 [来源索引](SOURCE_MATERIALS.md) 与 [第三方审计](THIRD_PARTY_MATERIALS_AUDIT.md)，许可状态见 [许可文档](LICENSING.md)。

## Frozen Artifact

既有文档记录 `.work/stop-barrier-candidate.patch` 为 **FROZEN / DO NOT TOUCH**。本独立 worktree 中未见该文件；本轮没有读取、应用、修改或删除它。
