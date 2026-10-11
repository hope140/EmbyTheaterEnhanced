# Emby Theater Enhanced

基于 Carnival 3.0 与综合补丁的 Windows Emby 客户端维护工程。当前正式版为 `v0.2.2`，最新公开测试版为 `v0.2.8`。PLAY-01、SEC-01/02 局部加固、LIFE-01/02 和 CI028 已进入主线及 v0.2.8；[PR #25](https://github.com/hope140/EmbyTheaterEnhanced/pull/25) 的外挂字幕异步选择竞态修复已合入 `main`，尚未随 v0.2.8 发布。

2026-10-11 核对的 main 为 `9774b73469dea9a3651f03737153c872947223ee`；v0.2.9 最小维护测试版正在准备。当前状态和验收边界见 [项目状态](docs/PROJECT_STATUS.md)，后续计划唯一入口为 [ROADMAP](docs/ROADMAP.md)。整体审核从 [审核入口](docs/AI_REVIEW_GUIDE.md)开始，并记录实际 HEAD；历史候选状态按原日期与来源解读。

Emby Theater Enhanced is an unofficial community-maintained project. It is not affiliated with or endorsed by Emby.

Emby Theater Enhanced 是非官方社区维护项目，与 Emby 不存在隶属、合作或认可关系。

## 发布版本

| 渠道 | 版本 | 入口 |
|---|---|---|
| 最新测试版 · Pre-release | `v0.2.8` | [发布说明](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.8) · [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.8/EmbyTheaterEnhanced-0.2.8-win-x64-setup.exe) · [SHA-256 文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.8/EmbyTheaterEnhanced-0.2.8-win-x64-setup.exe.sha256) · [来源记录](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.8/EmbyTheaterEnhanced-0.2.8-win-x64-setup.exe.provenance.json) |
| 当前正式版 · Latest | `v0.2.2` | [发布说明](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2) · [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.2/EmbyTheaterEnhanced-0.2.2-win-x64-setup.exe) |
| 历史版本 | `v0.2.7` 及更早版本 | [全部历史版本](https://github.com/hope140/EmbyTheaterEnhanced/releases) |

下载 Windows x64 安装包后，先核对随附 SHA-256 与来源记录，再按安装器提示选择独立安装目录。安装生命周期四阶段的本轮真实执行结果单独记录，解包完整性不能代替安装、升级、卸载和重装验收。

## 当前维护内容

v0.2.8 已交付 Stop 后旧播放/换流响应归属修复、外链与增强 IPC 的局部安全边界、Native Helper 异常资源清理和退出等待，以及 Windows CI 兼容修正。发布来源为 `888310de8ebae941b407ae070102b84d4fec1e5e`；具体工程与人工证据见 [统一候选验收](docs/INTEGRATION_028_CANDIDATE.md)、[CI 收尾](docs/CI028_HOSTED_VALIDATION.md) 和 [v0.2.8 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.8)。

v0.2.9 计划交付已经合入 main 的外挂字幕异步选择竞态修复。当旧外挂字幕选择仍在 700ms 等待中，较新的字幕选择、关闭字幕、Stop 或换集使其失效，旧回调会在提交 `sub-add` 前被拦截；已经提交的命令不在此守卫的撤回范围内。原 700ms 与内嵌字幕、音轨、缓存行为保持。修复及历史真实 Emby 验收来源见 [整合记录](docs/V029_SUBTITLE_INTEGRATION.md)。

本轮诊断隐私修复已通过合成回归与独立审核，隐藏自由文本中的完整认证/Cookie 头字段值，以及带空格绝对路径的私人媒体名尾部；实际问题快照和诊断 ZIP 已回读验证。该必要修复随 v0.2.9 交付，有限规则不代表全部未知秘密格式均已识别。详细范围见 [安全审查](docs/V029_SECURITY_REVIEW.md)。

当前主要保留问题是 STRM/115 内嵌字幕及音轨切换约 5–10 秒的用户体感延迟，状态为 `DEFERRED / USER_ACCEPTED`。CD2 Path Hydration 等待真实 `not_found` 样本；历史黑帧、白屏、特殊 app.exit 超时按原证据观察。用户反馈当前窗口和全屏圆角现象已解决，记为 `USER_REPORTED_RESOLVED / NO_CHANGE_REQUIRED`。详情见 [Known Issues](docs/KNOWN_ISSUES.md)。

## 历史交付与审核导航

0.2.7完整维护交付包含grpc-js 1.14.6、About可信版本与刷新、64KiB异步校验。[PR #21](https://github.com/hope140/EmbyTheaterEnhanced/pull/21)已合并到 `main`，保留完整维护历史；安装包产品sourceCommit仍为d8fcb0f9。[AI审核指南](docs/AI_REVIEW_GUIDE.md)提供源码、测试日志、安装器逐文件证据和未验证边界，[后续计划](docs/ROADMAP.md)仅将未完成事项列入待办。[本地到远端同步范围](docs/REMOTE_SYNC_027.md)说明历史资料的处理，[主线收尾记录](docs/MAIN_CLOSEOUT_027.md)说明合并核验。

以下保留上一轮公开基线与历史验收导航。

2026-10-09，最新测试版 [v0.2.6 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.6) 从完整发布分支交付，正式 Latest 仍为 [v0.2.2](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2)。本版修复连续切集请求身份、pending/并发 Stop 报告归属及正常关闭的 Native Helper 等待，并整合第三方材料通知。631项全量、三种正常关闭与五组完整隔离播放矩阵通过；准确源码、下载、SHA256及保留边界见 [0.2.6发布记录](docs/RELEASE_026.md)。此前设置页用户验收仍归属 [0.2.4验收记录](docs/SETTINGS_UI_024_ACCEPTANCE.md)。

v0.2.6完整发布树的主线整合差异、验证与PR状态见 [主线整合报告](docs/MAIN_INTEGRATION_026.md)。发布产品身份仍为355f4e6，整合文档不改变已发布的tag和安装包。

P0/P1 的历史证据见[本地交付](docs/P0_P1_DELIVERY.md)，随 v0.2.5 交付并保留在v0.2.6的诊断继续遵循[诊断 contract](docs/P1_DIAGNOSTICS_CONTRACT.md)。P2 已交付[离线阶段观测工具与能力结论](docs/P2_TIMING_AND_CAPABILITY_REVIEW.md)。[构建输入、来源与可再构建范围审计](docs/BUILD_INPUT_AUDIT.md)已整理固定输入、实际payload和对应源码材料缺口；当前本地构建依赖外部固定输入，公开仓库本身尚不能完整构建全部组件。进度与优先级见 [Development Roadmap](docs/ROADMAP.md)，可复现问题与观察项见 [Known Issues](docs/KNOWN_ISSUES.md)。Smart Path Mapping 已完成用户功能验收和最终远端复审，并通过 PR #18 合入 `main`。

## 已完成能力

### 核心架构

- [x] Native Helper + libmpv 播放架构、Helper 子窗口 / HWND 播放面
- [x] Native Helper 崩溃隔离与重建；Pepper / PPAPI 播放桥退役
- [x] Electron 44.4.2 升级及 apphost 启动命令兼容修复
- [x] Windows runtime / package provenance 校验
- [x] `v0.2.2` 正式发布

播放采用 Native Helper + libmpv 作为唯一生产 bridge。Helper 拥有视频子窗口，Electron main 监督进程与播放面，透明前景窗口保留 Emby UI/OSD/input；PlaybackManager、Item、MediaSource、PlaySession、Session/WebSocket 和远控生命周期仍由既有链拥有。STRM 增强仅替换最终 source，保留身份和 Native fallback 合同，见 [架构](docs/ARCHITECTURE.md)。

### STRM / CloudDrive2

- [x] STRM 原始路径识别、CloudDrive2 路径解析与 DirectUrl capability
- [x] CD2 HTTP → Mount → Native fallback；手动 `rules[]` 与最长前缀匹配
- [x] Smart Path Mapping inference engine、多样本 Mapping Boundary 推导、Existing Rule Coverage 检测与 Mount 路径推导
- [x] Smart Mapping 显式 Save draft 语义、CloudDrive2 连接状态同步
- [x] Smart Path Mapping Final PR Audit
- [x] Smart Path Mapping PR / Merge
- [x] STRM 设置页一致性修正（用户验收通过，已随 v0.2.4 测试版发布）
- [ ] CD2 Path Hydration（等待真实 `not_found` 样本）

### 播放体验

- [x] 播放 / Pause / Seek / Stop 基础链路与 Fullscreen 基础控制
- [x] `v0.2.2` 视频冻结根边界修复
- [x] NextTrack 原生持帧还原（v0.2.3 起提供；全屏短闪与真实媒体仍按各自验收范围观察）
- [x] 圆角状态用户反馈已解决（`USER_REPORTED_RESOLVED / NO_CHANGE_REQUIRED`；未新增独立视觉 PASS）
- [ ] Mixed-DPI / 多显示器缩放适配

### 诊断与维护

- [x] 诊断包导出、播放 / 路由诊断信息与敏感信息脱敏
- [x] 最小播放诊断与 Renderer 错误位置采集（随 v0.2.5 测试版交付，证据见发布记录）
- [x] About环境信息、手动更新查询与发布入口
- [ ] Installer install / upgrade / uninstall / reinstall 残留审计

### 观察项

- [ ] Seek transient black frame
- [ ] Stop / Exit transient black frame
- [x] rapid NextTrack确定性夹具、请求身份与Stop归属修复（本地/隔离证据见0.2.6发布记录）
- [ ] transport `stdout-end` stress / harness gap
- [ ] HDR 专项验证

### 暂缓 / 决策项

- [ ] Electron Forge 迁移评估
- [x] 构建输入与对应来源清单审计（本地材料与P1候选）
- [x] [本地构建输入绑定、依赖目录与通知交付contract](docs/BUILD_HARDENING.md)
- [x] 同提交两次独立runtime与installer字节一致（2136文件，见[构建复核](docs/BUILD_REVIEW.md)）
- [x] 第三方材料索引与四份通知随包交付
- [ ] 第三方剩余对应源码与完整构建材料补齐

## 项目文档

- [当前状态与验收边界](docs/PROJECT_STATUS.md) / [测试与构建](docs/TESTING.md)
- [架构](docs/ARCHITECTURE.md) / [STRM 设置契约](docs/STRM_RESOLVER_SETTINGS.md) / [DirectUrl 契约](docs/CD2_DIRECT_URL.md)
- [本地构建](docs/PACKAGING.md) / [许可与公开范围](docs/LICENSING.md)
