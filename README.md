# Emby Theater Enhanced

基于 Carnival 3.0 与综合补丁的 Windows Emby 客户端维护工程。当前正式版为 `v0.2.2`，最新测试版 `v0.2.4` 已发布为 Pre-release；Smart Path Mapping 已通过 PR #18 合入 `main`。

Emby Theater Enhanced is an unofficial community-maintained project. It is not affiliated with or endorsed by Emby.

Emby Theater Enhanced 是非官方社区维护项目，与 Emby 不存在隶属、合作或认可关系。

## 发布版本

| 渠道 | 版本 | 入口 |
|---|---|---|
| 最新测试版 · Pre-release | `v0.2.4` | [发布说明](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.4) · [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.4/EmbyTheaterEnhanced-0.2.4-test-win-x64-setup.exe) · [SHA-256 文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.4/EmbyTheaterEnhanced-0.2.4-test-win-x64-setup.exe.sha256) |
| 当前正式版 · Latest | `v0.2.2` | [发布说明](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2) · [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.2/EmbyTheaterEnhanced-0.2.2-win-x64-setup.exe) |
| 历史版本 | `v0.2.3` 及更早版本 | [全部历史版本](https://github.com/hope140/EmbyTheaterEnhanced/releases) |

## 开发计划

2026-10-09，设置页一致性修正已通过本轮用户验收并发布为最新测试版 [v0.2.4 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.4)；正式 Latest 仍为 [v0.2.2](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2)。v0.2.4 继承 v0.2.3 的功能和修复，统一增强设置页与 Emby 原生设置的对齐、动态控件样式及导航标题。完整产物信息与验收范围见[0.2.4验收记录](docs/SETTINGS_UI_024_ACCEPTANCE.md)。

P0 主线整合准备与 P1 最小诊断已完成[本地交付](docs/P0_P1_DELIVERY.md)，新增诊断遵循[诊断 contract](docs/P1_DIAGNOSTICS_CONTRACT.md)。P2 已交付[离线阶段观测工具与能力结论](docs/P2_TIMING_AND_CAPABILITY_REVIEW.md)，产品基线保持P1候选。[构建输入、来源与可再构建范围审计](docs/BUILD_INPUT_AUDIT.md)已整理固定输入、实际payload和对应源码材料缺口；当前本地构建依赖外部固定输入，公开仓库本身尚不能完整构建全部组件。进度与优先级见 [Development Roadmap](docs/ROADMAP.md)，可复现问题与观察项见 [Known Issues](docs/KNOWN_ISSUES.md)。Smart Path Mapping 已完成用户功能验收和最终远端复审，并通过 PR #18 合入 `main`。

### 核心架构

- [x] Native Helper + libmpv 播放架构、Helper 子窗口 / HWND 播放面
- [x] Native Helper 崩溃隔离与重建；Pepper / PPAPI 播放桥退役
- [x] Electron 44.4.2 升级及 apphost 启动命令兼容修复
- [x] Windows runtime / package provenance 校验
- [x] `v0.2.2` 正式发布

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
- [ ] Fullscreen 播放后圆角状态同步
- [ ] Mixed-DPI / 多显示器缩放适配

### 诊断与维护

- [x] 诊断包导出、播放 / 路由诊断信息与敏感信息脱敏
- [x] 最小播放诊断与 Renderer 错误位置采集（P1 本地候选，证据见交付记录）
- [ ] Installer install / upgrade / uninstall / reinstall 残留审计

### 观察项

- [ ] Seek transient black frame
- [ ] Stop / Exit transient black frame
- [ ] rapid NextTrack `selected=false` baseline limitation
- [ ] transport `stdout-end` stress / harness gap
- [ ] HDR 专项验证

### 暂缓 / 决策项

- [ ] Electron Forge 迁移评估
- [x] 构建输入与对应来源清单审计（本地材料与P1候选）
- [ ] 对应源码、通知交付与完整工具链材料补齐

## 项目文档

- [当前状态与验收边界](docs/PROJECT_STATUS.md) / [测试与构建](docs/TESTING.md)
- [架构](docs/ARCHITECTURE.md) / [STRM 设置契约](docs/STRM_RESOLVER_SETTINGS.md) / [DirectUrl 契约](docs/CD2_DIRECT_URL.md)
- [本地构建](docs/PACKAGING.md) / [许可与公开范围](docs/LICENSING.md)
