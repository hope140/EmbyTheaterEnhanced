# Development Roadmap

2026-10-12当前V030_FEATURE_FREEZE：Together原问题已有USER_REPORTED_PASS；停止新增播放器/HDR/系统媒体控制/OSD/字幕音轨性能/远控协议/Native Helper/非必要安装器功能。只处理实际发布阻断、安全与安装兼容和材料，最终计划与来源见[V030_FINAL_RELEASE_GATE](V030_FINAL_RELEASE_GATE.md)。旧门禁记录保留原日期。

2026-10-12：v0.3.0工程收尾及主线整合完成，PR29已通过Merge Commit进入main98b0651；真实Windows/Together、全屏视觉和发行材料门禁保留，总体BLOCKED_WITH_EVIDENCE。来源/main CI见[V030_STABLE_READINESS](V030_STABLE_READINESS.md)，本轮不另开研发专项。

本页是后续维护计划入口。2026-10-11，公开测试版 [v0.2.9 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.9) 已交付，产品main来源 `084554e07782ca6461b7ed67cadd298a92450b24`，[PR #25](https://github.com/hope140/EmbyTheaterEnhanced/pull/25) 与 [PR #26](https://github.com/hope140/EmbyTheaterEnhanced/pull/26) 已合并，[产品main CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38134108870) SUCCESS。正式 Latest 仍为 [v0.2.2](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2)，准确资产和最终文档身份见 [综合收尾](V029_MAINTENANCE_CLOSEOUT.md)。

问题细节见 [Known Issues](KNOWN_ISSUES.md)，当前工程身份及验收层级见 [项目状态](PROJECT_STATUS.md)，测试入口见 [TESTING](TESTING.md)。历史记录中的 OPEN、READY_FOR_MERGE、NOT_EXECUTED 仅代表原日期及来源，不能覆盖本页当前状态。

v0.3.0安装器新候选的中文默认、手动语言选择、升级目录页已获USER_UI_ACCEPTANCE=PASS；完整安装/卸载生命周期尚未执行。安装器整合走PR #28与其main检查记录，不创建Stable资产。SyncPlay主控Next导致被控偶发透明屏幕另列 [正式版前独立播放专项](SYNCPLAY_NEXT_TRANSPARENT_SCREEN_TASK.md)，不在安装器PR修复。Stable余项统一见 [安装器整合与发布门禁](V030_INSTALLER_INTEGRATION.md)。

## 已完成里程碑

| 里程碑 | 当前状态 | 证据入口 |
|---|---|---|
| Native Helper + libmpv、Pepper 退役、Electron 44.4.2 与 apphost 启动兼容 | COMPLETED | [架构](ARCHITECTURE.md)、[Native Helper](NATIVE_HELPER_BRIDGE.md)、[Electron 44](ELECTRON_44_UPGRADE.md) |
| Smart Path Mapping 和设置页整理 | COMPLETED；PR #18 MERGED，用户功能验收通过 | [Settings 契约](STRM_RESOLVER_SETTINGS.md)、[0.2.4 用户验收](SETTINGS_UI_024_ACCEPTANCE.md) |
| About、诊断、构建来源与通知交付 | COMPLETED；保留对应源码材料缺口 | [About](ABOUT_VERSION_ASYNC.md)、[诊断](P1_DIAGNOSTICS_CONTRACT.md)、[构建复核](BUILD_REVIEW.md) |
| PLAY-01、SEC-01/02 局部加固、LIFE-01/02、CI028 | COMPLETED；已进入 main 与 v0.2.8 | [统一候选历史验收](INTEGRATION_028_CANDIDATE.md)、[Hosted 收尾](CI028_HOSTED_VALIDATION.md) |
| 外挂字幕异步选择竞态修复 | COMPLETED / PUBLISHED v0.2.9；v0.2.8不包含该修复 | [PR #25](https://github.com/hope140/EmbyTheaterEnhanced/pull/25)、[整合与历史真实验收](V029_SUBTITLE_INTEGRATION.md) |
| 圆角现象 | USER_REPORTED_RESOLVED / NO_CHANGE_REQUIRED | 用户接受当前窗口与全屏表现；未新增独立视觉 PASS |

## v0.2.9 维护交付已完成

本轮交付 PR #25 的外挂字幕异步选择守卫、必要诊断隐私修复及版本/文档同步。发布从通过 CI 的产品main重新构建，公开686/686和材料加PLAY01为73/73、独立审核、34输入、八组隐藏runtime、来源/package验证、2139文件解包、三个公开附件实际下载均通过。旧v0.2.8资产保持，精确证据与未覆盖层级见综合收尾。

诊断自由文本认证/Cookie 与空格路径修复已随v0.2.9交付；focused47/47、独立34/34及合成问题快照/ZIP回读通过，有限规则不宣称覆盖所有未知秘密。后续只根据新样本或明确边界问题维护。

诊断隐私、Native Helper 既有生命周期、安全边界、脚本与文档一致性执行有限复核。Renderer 进一步隔离作为兼容性设计任务，候选是否形成与是否进入发布分开判断。构建流程见 [PACKAGING](PACKAGING.md)，第三方边界见 [LICENSING](LICENSING.md)。

安装器四阶段只在已可用的独立 Windows VM/Sandbox 或可丢弃系统执行；环境不足时记录 `REAL_INSTALL_NOT_EXECUTED` 并保留 [四阶段测试卡](INSTALLER_LIFECYCLE_CARD.md)。解包、哈希、隔离 runtime 和现用客户端日常使用均不替代此系统验收。

## 持续观察

| 项目 | 当前证据 | 重新调查的触发条件 |
|---|---|---|
| Seek / Stop / Exit 偶发黑帧 | 历史 OBSERVE；当前频率未确认 | 新版本、操作时序及有限播放面样本 |
| 旧版本 NextTrack 短暂白屏 | USER_REPORTED_RESOLVED / MONITORING | 新的明确可复现样本 |
| 特殊 app.exit OS 退出超时 | OBSERVED / ROOT CAUSE UNKNOWN；正常关闭通过不关闭此项 | 新的准确进程归属与退出时序证据 |
| Native Helper transport `stdout-end` stress 差异 | HARNESS / ENVIRONMENT GAP | 独立、可复核差异证据 |

无新证据时保持现有播放、Session 和 Native Helper 合同。

## 证据触发

- **CD2 Path Hydration：EVIDENCE_GATED。** 等待真实 `FindFileByPath=not_found` 与路径可见性前后对照，再区分目录未物化、timeout、transport、鉴权等原因；既有 Mount / Native fallback 保持。
- **特定媒体播放问题：EVIDENCE_GATED。** 有实际媒体类别与明确操作样本后再开展定向验收；普通文件、真实远控、可见连续性分别记录覆盖。
- **内嵌字幕 / 音轨性能：DEFERRED / USER_ACCEPTED。** 用户体感约 5–10 秒，已有 Refresh Seek、缓存覆盖消失与 underrun 研究；可靠视听 T4 和安全修复未取得。保留全部研究，待用户明确重新启动与实际样本后接续。

## 设备相关

HDR、Mixed-DPI / 多显示器为 `DEFERRED`。适当硬件或新的用户报告到位后做限定场景验证，再判断是否有局部修复；当前没有对应专项 PASS。

## 长期工程与正式稳定版准备

| 项目 | 状态与下一步 |
|---|---|
| Renderer 进一步隔离 | DESIGN_REQUIRED；窄 preload、fs/raw IPC、CSP/CORS、webSecurity/contextIsolation/sandbox 的兼容性与安全矩阵先行 |
| 第三方对应源码、授权与完整构建材料 | WAITING_EXTERNAL；[材料索引](SOURCE_MATERIALS.md)、[审计](THIRD_PARTY_MATERIALS_AUDIT.md)、[收尾](THIRD_PARTY_MATERIALS_CLOSEOUT_027.md) 保留精确身份和未取得项；不推断分发授权 |
| 安装生命周期 | PREPARED / EVIDENCE_GATED；独立系统到位后执行全新安装、升级、卸载、重装，分别核对程序残留与 profile/DeviceId 有意保留 |
| 正式稳定版发布 | 尚未排定；综合真实使用、安装生命周期、材料处置与精确版本证据决定范围及剩余边界 |
| Electron Forge 迁移 | OPTIONAL / DEFERRED；按现有构建与安装契约独立评估 |

## 范围决策与历史导航

圆角状态已按用户反馈结束，无新增 DWM policy 工作。内嵌切轨性能专项暂缓；历史预热研究按用户“复杂就不做”结束，见 [P2 研究](P2_TIMING_AND_CAPABILITY_REVIEW.md)。全局 S6 为 `EXCLUDED_BY_USER / KEEP_CANDIDATE`，全局配置与 memory 不在本轮范围。

完整历史来源见 [0.2.7 发布](RELEASE_027.md)、[主线收尾](MAIN_CLOSEOUT_027.md)、[CI028](CI028_WINDOWS_COMPAT.md)、[v0.2.8 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.8) 与 [外挂字幕整合](V029_SUBTITLE_INTEGRATION.md)。以下保留原完成阶段的版本、提交与验证数量，不能改标为 v0.2.9 新运行。

## 历史已完成记录（截至 v0.2.7 / v0.2.6 阶段）

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

## Frozen Artifact

既有文档记录 `.work/stop-barrier-candidate.patch` 为 **FROZEN / DO NOT TOUCH**。其保留与存在情况由原工作树管理，本轮不读取、应用、修改或删除它。
