# v0.4.6 测试版核验

## 当前发行状态

[v0.4.6 测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.6) 已于 2026-10-30 06:33:06 UTC 发布，Release ID `428718596`，`draft=false`、`prerelease=true`。main 已快进包含准确候选，Tag／产品 sourceCommit 固定为 `65356afdab1f7a9e01d8291d254b08583029d37c`。本次回读正式 Latest 仍为 v0.4.0，ID `422090288`，没有替换正式版。

| 验证层 | 来源与结果 |
| --- | --- |
| 准确候选公开 CI | [41011986029](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41011986029)，Windows 2168 pass／0 fail／5 skip，原 6 个材料文件排除保持。 |
| 标准发行构建 | [41011986845](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41011986845)，同一 source，2266 pass／0 fail／2 skip；显式材料 135/135。Host 源码编译与验证、runtime 校验及安装器解包核对通过。 |
| 实际自动发布 | [41014594066](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41014594066)，从 main 手动触发，testing 通道，显式复用上述同源码标准构建；preflight、build 和 publish 均成功。已验证真实草稿创建、五附件上传、公开与 Latest 保护，不将此结果扩大为 stable 通道或所有失败恢复路径通过。 |
| 独立产物核验 | Actions ZIP SHA-256 为 `f7f981b04ba48ac42ca8b854a7fc88874f8306d1cedfc481105d93c01bad56da`；安装器解包回执为 2208 文件、549332707 bytes，与已验证 runtime 逐文件一致。公开五附件重新下载后的大小／SHA-256 与构建及 Release API digest 一致，说明正文与 source Git blob 一致。 |

安装器与解包回执共同绑定 build-manifest SHA-256 `5486f781b6a3d9d0001db9cec20a1c48cb3f560de4994ff788d82c652b9cf590`。其中实际 `electronapp/enhanced/strm-config-store.js` 为 `0e855d1eadbfcbd42a0f1f1bd5c3adf4ea5c59282d0765a76a97503c81e8110e`，与审核源码相同。发布后文档提交不改变 Tag、安装器或原始 notes。

| 公开附件 | bytes | SHA-256 |
| --- | ---: | --- |
| `EmbyTheaterEnhanced-0.4.6-win-x64-setup.exe` | 161998258 | `0a01d16601d67003f926cf95d2b2786b113970894cab6be21f484edfd54cf3a3` |
| `EmbyTheaterEnhanced-0.4.6-win-x64-setup.exe.provenance.json` | 2154 | `57efeeefa9387c2596b58a8b60dcc4510702ea6518c21ec7b778be747ed74939` |
| `EmbyTheaterEnhanced-0.4.6-win-x64-setup.exe.sha256` | 110 | `2911da325dec0ea92e18821e05ba51d2faefde14b9d43a3fbd8507bf84fd64fb` |
| `RELEASE_NOTES.md` | 1992 | `ec9fc62c70fdeeb80a843190229a1060f39abeb4c4ebe8aa8309611f87f781ed` |
| `SHA256SUMS.txt` | 436 | `9dd8600d829409bd6f2d3c9fc0c3e3d7a5be3fe6c84f35288520a0e47b6d0b14` |

以下保留发布前的候选和条件记录，不再表示当前未发布。main／Tag 推送各自触发的后续公开 CI 是独立运行，不以候选 CI 的成功替代其终态。

## 范围与来源

候选承接审核分支 `a6e26d5d80860d922d22037415c696287cb30b65`，基线为 main `2d0acf314cd58d7dcb8b61e0e95ac5d1647b3d96`。产品源码增量仅为 `strm-config-store.js` 的失败临时文件清理和规则快照提交时序，并包含对应回归与项目文档。本次准备只将 package／lock 三处版本同步至 0.4.6，更新发行说明和状态；不修改生产源码、依赖、工作流或固定输入。

未包含预载、共享播放缓存、缓冲暂存、提前下载或其它独立实验。原 v0.4.5 Tag／附件和 v0.4.0 Latest 保持。

## 已有后台证据

准确审核源码 `a6e26d5` 的 [Windows 公开 CI 41008615570](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41008615570) 成功：2168 pass／0 fail／5 skip；公开集合按原合同排除 6 个材料依赖文件。Linux 公开集合 2148 pass／0 fail／25 平台 skip，定向配置回归 86/86，构建输入／测试发现合同 32/32。固定组件、语法和有限凭据模式检查通过。

上述结果不冒充本版新 SHA 的完整构建、安装器或发布核验。版本准备之后的准确来源、适用检查、标准发行构建及五附件身份须分别记录。后台配置用例使用临时目录和合成 Token，没有访问用户 profile、真实服务器或 Work 前台。

版本准备工作树另行运行 `node --test tests/strm-config-persistence.test.cjs tests/strm-resolver-settings.test.cjs tests/actions-release.test.cjs tests/manual-windows-workflow.test.cjs tests/product-version.test.cjs`：86/86 通过，0 fail／0 skip。该集合验证配置失败边界、合成发布 API、工作流接线和版本合同，不会执行真实上传或发布。

## 发布前条件与准备状态（历史记录）

截至本次准备，v0.4.6 Tag 与 Release 尚不存在。现有 `release.yml` 只从 main 手动触发，`actions-release.cjs` 还要求目标 source 已包含于 main；本候选尚不满足该来源条件，未派发发布作业，也未修改该门禁。

满足正常来源条件后，仍需准确 Tag、同版本说明、`channel=testing`、实际 Latest 身份、成功标准发行构建以及五附件核验；正式 Latest 应继续保持 v0.4.0。真实上传、公开后的资产回读和最终发布状态在实际完成前保持未验证，不由合成测试或普通 CI 成功推断。

## 未执行范围

本轮没有完整客户端、真实 Emby／CD2、系统安装或可见画面验收；后台测试不能代替上述证据。清理权限不足、路径被替换或进程异常终止仍可能留下临时文件，不保证断电恢复，也不扫描清理历史残留。
