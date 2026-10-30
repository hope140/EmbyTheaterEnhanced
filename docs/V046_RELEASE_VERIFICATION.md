# v0.4.6 测试版准备与核验

## 范围与来源

候选承接审核分支 `a6e26d5d80860d922d22037415c696287cb30b65`，基线为 main `2d0acf314cd58d7dcb8b61e0e95ac5d1647b3d96`。产品源码增量仅为 `strm-config-store.js` 的失败临时文件清理和规则快照提交时序，并包含对应回归与项目文档。本次准备只将 package／lock 三处版本同步至 0.4.6，更新发行说明和状态；不修改生产源码、依赖、工作流或固定输入。

未包含预载、共享播放缓存、缓冲暂存、提前下载或其它独立实验。原 v0.4.5 Tag／附件和 v0.4.0 Latest 保持。

## 已有后台证据

准确审核源码 `a6e26d5` 的 [Windows 公开 CI 41008615570](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41008615570) 成功：2168 pass／0 fail／5 skip；公开集合按原合同排除 6 个材料依赖文件。Linux 公开集合 2148 pass／0 fail／25 平台 skip，定向配置回归 86/86，构建输入／测试发现合同 32/32。固定组件、语法和有限凭据模式检查通过。

上述结果不冒充本版新 SHA 的完整构建、安装器或发布核验。版本准备之后的准确来源、适用检查、标准发行构建及五附件身份须分别记录。后台配置用例使用临时目录和合成 Token，没有访问用户 profile、真实服务器或 Work 前台。

版本准备工作树另行运行 `node --test tests/strm-config-persistence.test.cjs tests/strm-resolver-settings.test.cjs tests/actions-release.test.cjs tests/manual-windows-workflow.test.cjs tests/product-version.test.cjs`：86/86 通过，0 fail／0 skip。该集合验证配置失败边界、合成发布 API、工作流接线和版本合同，不会执行真实上传或发布。

## 发布条件与当前状态

截至本次准备，v0.4.6 Tag 与 Release 尚不存在。现有 `release.yml` 只从 main 手动触发，`actions-release.cjs` 还要求目标 source 已包含于 main；本候选尚不满足该来源条件，未派发发布作业，也未修改该门禁。

满足正常来源条件后，仍需准确 Tag、同版本说明、`channel=testing`、实际 Latest 身份、成功标准发行构建以及五附件核验；正式 Latest 应继续保持 v0.4.0。真实上传、公开后的资产回读和最终发布状态在实际完成前保持未验证，不由合成测试或普通 CI 成功推断。

## 未执行范围

本轮没有完整客户端、真实 Emby／CD2、系统安装或可见画面验收；后台测试不能代替上述证据。清理权限不足、路径被替换或进程异常终止仍可能留下临时文件，不保证断电恢复，也不扫描清理历史残留。
