# v0.2.7 测试发布与远端审核

日期：2026-10-10（UTC+8）。状态：**PUBLISHED / PRE-RELEASE**。v0.2.7于11:24:27（UTC+8）公开，Release ID408588855；正式Latest仍为v0.2.2。

[Release与下载](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.7) · [已合并PR #21](https://github.com/hope140/EmbyTheaterEnhanced/pull/21)。完整维护已合入main，整合提交ef4fcf58；整体审核从main及 [审核指南](AI_REVIEW_GUIDE.md)开始，合并核验见 [主线收尾](MAIN_CLOSEOUT_027.md)。

用户授权将本地应公开的项目成果放到GitHub，并发布已验证测试包供其它AI整体审核。本轮从完整维护交付0bcbfc74建立codex/release-v0.2.7-test-20261010，保留全部实现与历史，仅补公开导航、审核入口和证据；不会重建产品。

| 身份 | 固定值 |
|---|---|
| 产品源码 / tag目标 | d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0 / v0.2.7 |
| 本地交付文档HEAD | 0bcbfc74f2dbd9ed35bfb82eee719d25d2260b03 |
| 安装器 | EmbyTheaterEnhanced-0.2.7-win-x64-setup.exe |
| 安装器大小 | 175632871 bytes |
| 安装器SHA256 | 86bee55146714f4f7e493cadb8b483537644f513c92364df7fc0c18f5315f3db |
| Runtime manifest SHA256 | c6794efc6b69aeef67c3274903715e2483955a564dc9b2bc8a3e4cefd24ffe6c |
| 发布渠道 | Pre-release；正式Latest保持v0.2.2 |

## 发布内容

- grpc-js精确更新到1.14.6；About显示可信随包版本并区分实时握手状态，恢复页面时刷新，复制使用同一快照。
- 包内大文件校验改为64KiB异步分块，保持完整hash/身份核验及并发查询合并，避免同步占住Electron main。
- 项目S1–S5及历史作用域、来源/安装准备文档完成；[整体审核入口](AI_REVIEW_GUIDE.md)提供源码导航、原始测试日志和明确的复核任务。

## 验证与公开边界

产品651/651、工具42/42、父会话53/53，十组串行隐藏隔离运行自然exit0、无强清理、残留0；About初始/ready IPC、Session配对和脱敏分层记录。安装器Inno完整性及2,137文件解包逐项匹配，主会话再次核验EXE、来源、runtime和交付副本。准确记录见 [本地交付](LOCAL_PACKAGE_027.md)、[维护收口](MAINTENANCE_027.md) 和 [公开原始证据索引](evidence/review-027/index.json)。本轮发布不把这些结果标为重新执行的产品测试。

首次observer误判和PE字符串检查修正保留，旧直接app.exit根因UNKNOWN。真实Emby/CD2/远控、可见视频/HDR/多屏和系统安装生命周期未在本轮验收；四类第三方材料仍WAITING_EXTERNAL，不作完整对应源码或许可闭合声明。公开范围及本地研究分支处置见 [同步范围](REMOTE_SYNC_027.md)。

## 远端回读

发布前保留main、既有refs、8个Release和15个附件的快照。v0.2.7 annotated tag object为b53f36f54685554d8d342fb30a07ffa51f1c526b，解引用产品d8fcb0f9。发布准备提交1d7a651随新分支和tag原子推送；审核PR #21已创建并附加。后续发布记录提交单列，不改变产品tag。

三个资产均uploaded，EXE ID626883014、SHA256文件ID626882949、provenance ID626882956，大小和服务端digest均与本地逐项匹配；核对后才将草稿公开为Pre-release，target_commitish为准确产品SHA。GitHub合并状态MERGEABLE/CLEAN与空检查集合单列，未声称CI通过。公开下载及旧远端对象保持结果见 [发布机器证据](evidence/release-v0.2.7-20261010.json)。

三个附件均已完整回下载并重算SHA256匹配。第一次匿名EXE直链在300秒取得69,237,248/175,632,871 bytes后超时，来源文件直链另出现一次HTTP500；原失败保留。随后EXE和provenance经GitHub CLI/API路线完整取得，EXE下载约37.96秒，SHA256文件经匿名公开链接取得，全部与本地和服务端digest一致。没有改代理/系统配置，也不把首轮匿名下载说成完成。公开AI指南和651项日志从raw地址下载后与Git blob完全一致。

发布阶段的快照确认旧47项远端refs、8个Release和15个附件的原身份、正文、标志及digest保持；当时只新增发布分支、v0.2.7及PR #21对应自动refs，main尚未合并。随后用户明确要求完成主线收尾，PR #21已合入main；上述发布机器证据保持原阶段，不改写历史OPEN记录。v0.2.7的Release导航随后指向main，tag与附件字节保持。

公开原始证据保留CRLF/LF实际字节，目录级属性仅承认CR为换行的一部分并关闭文本转换，仍检查其它空白错误。第一次普通whitespace检查把原始CR当尾随空白的结果没有导致改写原日志；九份Git blob的SHA256与源文件完全一致。
