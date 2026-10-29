# v0.4.5 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- 修复在首页再次点击侧栏“主页”后正文空白的问题。
- 修复客户端单条删除请求的条目参数和服务端版本适配，保留原确认与错误处理。
- 标记已播放或删除后，首页重新获取内容时保留可复用布局和滚动位置；等待期间主动滚动后不拉回旧位置。
- 修复默认透明字幕背景的 libmpv 色值格式，并恢复首页图片内文字的旧隐藏样式。
- 合入此前的手动更新流程优化：复用已校验安装包，正常退出后打开安装向导；不增加后台自动检查或静默安装。

## 已知问题

删除整行或内容变短时，滚动位置会限制在新的有效范围内；刷新失败仍走原错误或回退页面。用户已验收独立候选，新版本仍从最终发布源码重新构建；不将有限验收扩大为全部服务器、字幕样式或硬件组合通过。完整来源与构建结果见[本版核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V045_RELEASE_VERIFICATION.md)。

本版不包含尚未验收的共享播放缓存、下一集预加载或飞牛认证实验。现有页面缓存不能代替服务器授权、最新进度或播放数据。

## 下载安装

- [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.5/EmbyTheaterEnhanced-0.4.5-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.5/EmbyTheaterEnhanced-0.4.5-win-x64-setup.exe.sha256)
- [来源记录](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.5/EmbyTheaterEnhanced-0.4.5-win-x64-setup.exe.provenance.json)

安装器未签名。手动安装前请核对同版本 SHA-256 并正常退出客户端；具体步骤见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。应用不会自动检查更新。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可与第三方材料情况见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md)
