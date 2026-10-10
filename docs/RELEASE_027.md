# v0.2.7 测试发布与远端审核

日期：2026-10-10（UTC+8）。当前阶段：PREPARED_NOT_PUBLISHED；实际发布完成后更新本节与远端回读证据。

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

发布前保留main、既有refs、8个Release和15个附件的快照；v0.2.7不存在时才创建精确源码tag和新Release。先上传草稿并核对三个资产的大小/服务端digest，再发布为Pre-release；发布后回读源码tag、附件和公开下载。当前审核PR及下载验证结果将在实际操作后记录，不提前写PASS。
