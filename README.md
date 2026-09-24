# Emby Theater Enhanced

基于 Carnival 3.0 与综合补丁的 Windows Emby 客户端维护工程。当前正式发布基线为 `v0.2.2`；Smart Path Mapping 已通过 PR #18 合入 `main`，尚未发布新版本。

Emby Theater Enhanced is an unofficial community-maintained project. It is not affiliated with or endorsed by Emby.

Emby Theater Enhanced 是非官方社区维护项目，与 Emby 不存在隶属、合作或认可关系。

## 开发计划

进度与优先级见 [Development Roadmap](docs/ROADMAP.md)，可复现问题与观察项见 [Known Issues](docs/KNOWN_ISSUES.md)。Smart Path Mapping 已完成用户功能验收和最终远端复审，并通过 PR #18 合入 `main`。

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
- [ ] STRM 设置页 UI Consolidation
- [ ] Next Episode / DirectUrl / CD2 Pre-warm
- [ ] CD2 Path Hydration（等待真实 `not_found` 样本）

### 播放体验

- [x] 播放 / Pause / Seek / Stop 基础链路与 Fullscreen 基础控制
- [x] `v0.2.2` 视频冻结根边界修复
- [ ] NextTrack 切集瞬时白屏根因分析
- [ ] Fullscreen 播放后圆角状态同步
- [ ] Mixed-DPI / 多显示器缩放适配

### 诊断与维护

- [x] 诊断包导出、播放 / 路由诊断信息与敏感信息脱敏
- [ ] `helper-ready` / `loadfile` / `core-playing` / `stop` 可观测 marker
- [ ] Renderer `ReferenceError` observer
- [ ] Installer install / upgrade / uninstall / reinstall 残留审计

### 观察项

- [ ] Seek transient black frame
- [ ] Stop / Exit transient black frame
- [ ] rapid NextTrack `selected=false` baseline limitation
- [ ] transport `stdout-end` stress / harness gap
- [ ] HDR 专项验证

### 暂缓 / 决策项

- [ ] Electron Forge 迁移评估
- [ ] vendor binary / source rebuild / license closure

## 项目文档

- [当前状态与验收边界](docs/PROJECT_STATUS.md) / [测试与构建](docs/TESTING.md)
- [架构](docs/ARCHITECTURE.md) / [STRM 设置契约](docs/STRM_RESOLVER_SETTINGS.md) / [DirectUrl 契约](docs/CD2_DIRECT_URL.md)
- [本地构建](docs/PACKAGING.md) / [许可与公开范围](docs/LICENSING.md)
