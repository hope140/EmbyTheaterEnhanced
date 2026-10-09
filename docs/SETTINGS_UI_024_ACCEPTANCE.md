# 0.2.4 设置页一致性修正测试包

日期：2026-10-09（UTC+8）。路径均相对于 managed worktree `ete-settings-native-alignment`。交付状态：`USER ACCEPTANCE PASS / GITHUB PRE-RELEASE PUBLISHED`。

## GitHub 发布记录

后续清理（2026-10-09）：按用户要求删除已替代的 `test-20261008-cc603ba` Release及其4个附件，保留源码tag。列表现为6个Release，其余版本与资产保持；删除回读结果见 `.work/release-0.2.4-20261009/candidate-removal-verification.json`。以下08:30发布时的保留统计为当时快照。

`v0.2.4` 于 2026-10-09 08:30（UTC+8）作为 Pre-release 发布，Release ID `407374861`，tag 精确指向 sourceCommit `03a2e3b9ea7f1cf786b034b0a1882b10de79a39c`。可从[发布页](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.4)下载 [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.4/EmbyTheaterEnhanced-0.2.4-test-win-x64-setup.exe)和 [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.2.4/EmbyTheaterEnhanced-0.2.4-test-win-x64-setup.exe.sha256)。两个资产均已上传；安装包 API digest 与本地文件 SHA256 一致，大小 175,597,797 bytes。校验文件已下载并重算，文件内容中的安装包哈希匹配；EXE 本轮未完整重新下载。

六个旧 Release 仅增加标题导航和折叠式历史说明；历史正文仍完整保留，11 个旧资产及各 Release 的日期、flags 均未变化，现有 refs 保持不变。正式 Latest 仍为 [v0.2.2](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.2)，`main` 仍为 `46e995e`。回读结果见 `.work/release-0.2.4-20261009/release-verification.json` 和 `releases-after.json`。

## 用户验收

用户使用本会话提供的0.2.4 runtime入口后反馈：“可以了，我测过了”。据此记录本轮设置页左对齐、控件样式和标题收尾的整体验收通过，关闭该UI问题并保留观察；不补写未逐项报告的操作、窗口模式、安装过程或其它媒体环境。程序仍为下面的03a2e3b候选，未因这次反馈改代码、重建或更换安装包。

## 最终产物

- 产品sourceCommit：`03a2e3b9ea7f1cf786b034b0a1882b10de79a39c`。
- 本地分支：`codex/settings-native-alignment-20261009`。
- runtime：`dist/EmbyTheaterEnhanced-0.2.4-ui-final-win-x64/`。
- 安装器：`dist/EmbyTheaterEnhanced-0.2.4-test-win-x64-setup.exe`。
- 大小：175,597,797 bytes。
- SHA256：`4ea589368f2db40ce09ce4e46f4fe937a2d34a240582d871a8f3f5ae627e4b64`。
- 同名 `.exe.sha256` 已生成。应用/About、build manifest、installer FileVersion/ProductVersion均为0.2.4。

## 修改

以已发布0.2.3/f7505cd（文档HEAD ba76ac0）为基线。三页根容器及STRM form改为左对齐，规则操作行宽窄屏一致；动态控件追加业务class，保留Emby constructor添加的基础和环境类。完整导航检查还发现内容区H1与原生导航标题重复，因此STRM、诊断、About仅保留原生导航标题，说明区保留可访问名称和原说明文字。

产品变化限定 `plugins/mpvplayer/` 下的 `strm.js`、`strm.css`、`enhanced-settings.css`、`strm.html`、`diagnostics.html`、`about.html`，另有版本元数据。规则、Token、存储/IPC语义与播放/窗口/Resolver/native二进制不改。

## 验证

| 层级 | 实际结果 | 证据 |
|---|---|---|
| 最终全量单测 | 430/430 PASS | `.work/ui-validation-20261009/full-unit-final.log` |
| 设置/维护/草稿竞态定向 | 36/36 PASS | `.work/ui-validation-20261009/focused-header-cleanup.log` |
| 正式build与source/runtime/native provenance | PASS，绑定03a2e3b，2146 payload文件 | `.work/ui-validation-20261009/build-03a2e3b.log` |
| 最终实际应用设置导航 | PASS：五次实际菜单进入audio/STRM/diagnostics/STRM reload/About，ViewManager创建controller并派发对应viewshow | `.work/ui-validation-20261009/router-run-0de6e5c722704e82a0a77abb02412b4c/settings-router-probe.json` |
| 设置操作 | UI添加合成规则、显式保存、一次纯本地规则检查、离页不保存、重新进入读取及磁盘配置核对PASS | 同上 |
| 样式/版本 | 三页与原生audio内容起点均x311.55（1280 CSS px）；无横溢；动态按钮原生类型/base类、真实焦点样式、单一导航标题、About 0.2.4/commit通过 | 同上及该目录PNG |
| 安装器 | Inno完整性PASS；解包2147文件与runtime路径/SHA全一致；missing/extra/mismatch=0；PE双版本0.2.4 | `.work/ui-validation-20261009/installer-audit-03a2e3b.json`、`installer-integrity-final.log` |
| 对比已发布0.2.3 | 两树各2147文件，2136文件不变；仅6个设置文件+应用package+4个来源文件变化 | `.work/ui-validation-20261009/runtime-diff-0.2.3-to-0.2.4.json` |

前期1920/1280/680离屏组件布局仍为补充证据，最终检查使用完整packaged main/renderer和真实设置菜单，不再是fragment mount。可见截图已由主线程读取，规则动作使用本包实际主题。测试进程结束后未发现本工作树Electron/Helper残留。

## 测试边界与历史

完整应用测试用新的隔离userData/APPDATA/LOCALAPPDATA/MPV_HOME与合成只读登录身份，不提供真实服务器地址/Token。设置get/save和规则检查调用真实main IPC；规则检查仅格式映射和空挂载配置，不连接CD2。更新、Release、Token、CD2连接等真实外部动作不点击。实际安装升级、真实Emby/CD2及此前全屏极短闪烁等专项未在本轮扩大验收。

初版harness把原生菜单误认为a[href]，随后发现实际为itemsContainer/itemAction；另一轮硬编码根路由名、又与首屏自动导航并发，产生测试假失败。最终从dom-ready记录初始selectserver的viewshow，开始前等该首屏完成，目标导航绑定event.detail.route及event.detail.view，保留严格的源菜单与controller断言。失败日志/截图保留，没有修改产品路由或放宽检查。Electron正常app.quit不采用Node.exitCode，测试工具改为正常before-quit清理完成后显式设置自身退出状态。

35a69c6的初次runtime/安装器属于中间候选，未包括重复标题收尾；本页只交付03a2e3b的test安装器。未覆盖、移动或改写旧0.2.3发布资产。
