# v0.3.12 本地安装验收包

本地包已获用户认可，[v0.3.12](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.12) 已按授权公开为 Pre-release。下文保留该验收包的来源和验证事实；正式发行使用最终 main source 重新构建，来源与结果见[发行核验](V0312_RELEASE_VERIFICATION.md)。

## 来源与范围

产品 sourceCommit 为 `282d39e5558361d7ce0a443620dd0e9b566d13a5`，基线为 `4dd912a51ded4def7bc6c1208414748f9a5d17bb`。候选修复 STRM 存储类型、解析策略及已有自定义顺序编辑器的下拉箭头定位，统一组件标签关联。自定义顺序仍只在用户选择对应策略时显示。

版本三处同步为 0.3.12，使用原锁文件、完整 Electron 44.4.2 和固定工具链构建。相对 v0.3.11 的 payload 路径集合保持，变化为两份 STRM 源码、应用版本以及五份来源元数据；另生成新的 build-manifest。Native Helper 完整字节保持，生产 `testing=false`。没有新增顺位功能或变更配置保存语义。

## 安装器身份

- 文件名：`EmbyTheaterEnhanced-0.3.12-win-x64-setup.exe`
- 文件大小：175714438 字节
- SHA-256：`fc0972a1616e683b45e13d8608894e8534ea452718691132409a967a567c1490`
- build-manifest SHA-256：`65d59bd02267da3d2adf679067af193b29ff312547bb383241e4488b8fa44c5b`
- 同目录交付 `.exe.sha256` 和 `.exe.provenance.json`；安装器资源版本为 0.3.12。

## 已执行验证

- 原始归档、预备材料、完整 Electron、Native 编译器与 Inno 工具链按固定身份核对；未升级依赖或工具。
- 构建、source/runtime/package provenance 与 `tools/package.ps1 -VerifyOnly` 通过；完整 runtime 2160 项，payload 2159 项。
- 固定 InnoUnp 完整性检查、解包及全部 2160 个 `{app}` 文件的路径、大小、SHA-256 与 runtime 逐项一致。
- 包内实际组件/CSS与 STRM 源码的隔离渲染：明暗主题 × 1280/760/680/420px，共 48 个控件的箭头中心差为 0；标签、ID、禁用隐藏、编辑器隐藏及聚焦缩放检查通过。
- 完整材料环境下，`npm test` 为 1205/1205 通过，失败、取消、跳过与 todo 均为 0；材料测试 129/129，通过 327 个 JavaScript 与 28 个 PowerShell 文件的语法检查。完整测试原日志 SHA-256 为 `1c934227cfc2ba67644a68b9b1c027f683ff3ca7ae1472f0f4930daa56d8090a`。
- 独立复核确认版本、完整文件集合、全部 payload 哈希、provenance 绑定和两份 STRM 文件与产品 commit 的原始 Git blob 字节一致，未发现个人配置或临时验收产物。

首轮完整测试在材料尚未齐备时启动，1133/1144 通过、11 项失败；错误涉及缺失 vendor/preload 等输入。原日志保留，不能将该轮记为通过；完成预备与来源固定后重新运行。

本记录在本地包构建后更新，后续文档提交不替代上述 sourceCommit。交付安装器及两个伴随文件的复制后 SHA-256 回读一致；本地交付阶段未生成远端 Tag、PR 或 Release。

## 用户确认与证据边界

用户已反馈验收通过并授权发布测试版。确认范围为本地验收包的界面修正，不据此推断完整安装矩阵或真实播放/远控场景全部通过。安装使用步骤见[用户指南](USER_GUIDE.md)。

构建、解包、隔离组件检查不等于系统安装、完整客户端视觉、真实播放/远控或服务器验收；本轮未替换现用客户端、操作用户 profile 或服务器。许可及对应源码的既有未决事项按[许可说明](LICENSING.md)保持。
