# P0/P1 本地交付记录

## 基线与范围

2026-10-09 只读核验：远端 main 为 `46e995ef83fca7f7a882e3dc633bdcc2d2d521c7`，正式 Latest 为 v0.2.2。v0.2.4 Pre-release 的产品 sourceCommit 为 `03a2e3b9ea7f1cf786b034b0a1882b10de79a39c`，完整候选文档 HEAD 为 `ebcb655ad6b5ae19f09b2cbeee90b7cc5838e957`。本轮从该完整 HEAD 创建隔离分支 `codex/p0-p1-diagnostics-20261009`，主目录和已有候选的未提交资料原样保留。

允许本地源码、测试、文档、可回滚提交及独立候选构建。目标为 P0 状态收口与主线整合审查准备、P1 最小诊断与交付自动化。预热为可选后续候选，本轮不实施；性能研究、Hydration、Forge 与圆角不进入本轮。

## P0 主线整合审查

main 到 ebcb655a 共 71 个文件，10,979 行新增、623 行删除，`git diff --check` 通过。差异分为 Settings/maintenance、Native Helper 持帧与取消、窗口/全屏状态、工具测试和历史证据四组。已有两父整合提交 `cc603ba` 的第一父为 `6be48ed`、第二父为 `21ef9a4`；本轮沿用完整候选，没有重新拼接旧分支。

静态比对确认 `native-helper/service.js` 与 helper C++ 与全屏候选 `1e86e51` 一致；main/libmpv 的交叉合并增量对应维护 IPC/About 和窗口状态。v0.2.4 后续设置修正仅触及设置页与版本元数据。对 endpoint/current generation、begin/arm 等待前后复核、presentation epoch/token、stale response 清理、libmpv stop/play 请求边界和 fullscreen placement revision/HWND 的审查没有发现可据当前证据确定的整合缺陷。

候选范围较宽，适合按上述四组审阅；静态审查不替代运行验收。README、ROADMAP、KNOWN_ISSUES 的当前状态已统一到 v0.2.4；历史状态和失败证据继续按原提交归属保留。主线整合未执行。

## 当前已确认状态

- Settings 一致性修正已通过用户验收并随 v0.2.4 测试版发布。
- 顶部细条已由用户确认消失；统一候选已补齐边缘锁定、尺寸恢复、普通缩放、重复全屏、最小化恢复、关闭保存、10 次 Next/Previous 和 Stop。
- 上一集/下一集按用户所测场景记为基本解决并观察。
- 全屏跨编码 Previous 为 73 帧、max107ms，保持 INCONCLUSIVE；旧快速夹具 next.selected=false 与基线一致，保留原失败，不改断言或产品掩盖。

## P1 实现与验证进度

诊断设计见 [P1 contract](P1_DIAGNOSTICS_CONTRACT.md)。源码新增旁路 controller observer、main 侧有限关联与阶段记录、preload 全局错误投影和可信 IPC 二次校验；普通播放/Resolver/Session/native 协议与窗口时序保持既有实现。打包增加根版本、lockfile、runtime 应用与 build manifest 的一致性 gate。

准备阶段使用固定 manifest 验证的归档、完整 Electron 44.4.2 运行树、固定 Native Helper header 与既有锁文件。基线串行单元测试 430/430 PASS，0 skipped。P1 第一轮定向测试 66/66 PASS。正式全量、构建、runtime 与 payload 结果将在完成后记入此处；这些中间结果不是最终交付验收。

## 验收边界

本轮 runtime 使用合成媒体、假服务和临时 profile。日志中的 native file-loaded/core-playing 仅为事件证据；真实首帧、真实 Emby/CD2、服务器远控、HDR、多屏和系统安装生命周期仍按独立专项验收。新增 Renderer observer 用于定位历史错误，未预判或宣告其业务根因修复。

安装脚本静态核对：既有 Enhanced profile 位于应用数据目录，bootstrap 仅补缺失文件；安装器没有清理该目录的动作。此结论是配置保留策略审计，不是 clean install/upgrade/uninstall/reinstall 实测。
