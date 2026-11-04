# v0.4.12 更新交接与 EOF 定位发行核验

## 发布后回读（2026-11-03）

[PR #89](https://github.com/hope140/EmbyTheaterEnhanced/pull/89) 以 merge commit `98ea09a22708a7d845f46318df3f3a49272ccac0` 合入 main；其父提交保留准确构建来源 `676888a09220a7cc95fd10eee035432f715e471b`。轻量 Tag `v0.4.12` 指向该来源。[标准发行构建](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41562289480) 与[发布工作流](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41567001625)均成功；构建回执为 `version=0.4.12`、五附件通过，Windows 完整测试 2488 项：2486 pass／0 fail／2 skip，安装器解包与 runtime 回比通过。[PR 公开 CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41562278806)、[push 公开 CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41562251265) 均为 2391 项：2386 pass／0 fail／5 skip；[隔离原生更新检查](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/41562278796) 为 178／178，未执行真实交互安装。

[公开 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.12) ID `432215370` 为 `prerelease=true`、`draft=false`，目标来源同上；安装器、provenance、`.sha256`、`RELEASE_NOTES.md` 和 `SHA256SUMS.txt` 五附件均已公开。安装器 [Windows x64 下载](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.12/EmbyTheaterEnhanced-0.4.12-win-x64-setup.exe) 大小 `161850235` 字节，SHA-256 `b3d3c8214e04461f8bdbb9a4809a371f2e51dcf3fb2f52355b3d330ace670b43`。发布后独立下载五附件并复算大小／SHA-256，与 GitHub digest、构建回执及校验表一致；notes 与来源文档字节一致，provenance 的来源／版本一致。正式 Latest 回读仍为 `v0.4.0`（Release ID `422090288`）。

用户确认此前独立 0.4.10-test 更新修复包发起升级到 v0.4.11 的安装交接验收通过。此反馈没有覆盖 v0.4.12 组合包的交互安装、真实服务播放或现场提前 EOF；根因仍未知，自动恢复未加入。以下为**发布前候选阶段记录**，其中“未合并／未发布”只描述当时状态。

## 来源与范围

以已发布字幕测试版 v0.4.11 的 main 合并提交 `5749f99182cbf6ec6f2b9ed9ed2d5db70e3a258d` 为基线，整合独立更新修复 `d2a7a0f58eb011b6c2b4b021a3351aef098d4b12` 的四项提交，仅解决两份维护文档顶部冲突。同步根 package／lock 三处产品版本到 0.4.12，并加入提前 EOF 的低频定位日志与回归。字幕多选保持，普通 Seek、EOF、自动恢复和切线路行为不变；此前暂停的其他播放修复不在范围。

更新修复的 0.4.10-test 独立包由运行中的修复版发起升级到公开 v0.4.11；用户确认该现场交接验收通过。这是更新修复的现场证据，不等同于 v0.4.12 组合安装与播放验收。

## 定位日志合同

播放器只投影当前有效播放位置、原生缓存末端／缓存时长、两者推得的缓存可播时长、剩余时长、缓存 EOF／reader EOF／underrun 布尔值及缓存 EOF 前态。每次播放独立限频：普通样本约每 30 秒，状态变化最少间隔 5 秒；结束事件可补录尚未写出的 EOF 转变。提交 Seek 后，直到该次原生 playback-restart 前不把旧位置称为当前可播位置。换片、旧代次或非当前缓存不产生新缓存样本。

字段由严格数值／布尔值投影，不读取 URL、query、令牌、请求头、User-Agent、路径、原始错误文本或其他媒体标识。现有原生 bridge 在 end-file 错误时只提供有限 reason 和 mpv 错误码，不提供可核实的读取失败分类、HTTP 状态或重连结果；本版不生成这些字段，也不将缓存 EOF 当成网络错误。导出仍经既有脱敏与有界日志链路。

## 候选验证与发布停点

准确提交需运行本地定向及公开离线集、语法和来源门禁，以及 Windows 公开 CI、隔离更新原生检查和 `release_package=true` 标准构建；实际结果按准确运行回执报告。静态安装器解包回比不等于交互安装或真实服务播放；提前 EOF 的现场根因仍需用户环境日志。

本分支只准备候选，不合并 main、不建 v0.4.12 Tag、不创建 Release。若后续获准发布，须先核对准确源码、三处版本、同源码五附件与正式 Latest，再走 `testing` 标准发布流程。
