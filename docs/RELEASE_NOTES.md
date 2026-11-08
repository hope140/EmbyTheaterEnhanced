# v0.4.19 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- 修复先加载外挂字幕后，切换内嵌字幕仍停留在外挂或选错轨道的问题；快速切换及关闭字幕时，旧请求不会覆盖新选择。
- 改善首页删除、标记已播放和返回后的刷新稳定性，保留滚动位置与卡片行布局，减少重复刷新造成的回顶和后台转圈。
- 补充播放配置读取、回退阶段以及 CD2 取链耗时和有效期诊断，帮助定位起播问题；沿用原有播放、取消和回退流程。

## 已知问题

历史偶发提前停止的具体根因仍未确认，本版不新增播放中断后的自动恢复。字幕修复覆盖本次核验的原始容器和 DirectStream 轨道映射；转码及生成字幕保留原选择流程。不同服务器、媒体与设备组合仍需验证。

## 下载安装

从本 Release 的实际附件区下载 Windows x64 安装包、同名 `.sha256` 与来源记录；`SHA256SUMS.txt` 列出发行文件摘要。勿将 Source code 压缩包当作客户端安装包。安装器未签名；手动安装前核对 SHA-256 并正常退出客户端。操作说明见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。准确版本、源码和包体身份以本版附件来源记录为准。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可及第三方来源情况见[许可说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。哈希核对不等于数字签名或许可认证。
