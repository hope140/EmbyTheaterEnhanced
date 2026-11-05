# v0.4.15 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- 播放普通文本字幕时，可从字幕菜单打开“字幕外观”，调整字号、文字颜色、背景颜色与透明度、描边效果，并即时应用到当前播放。设置沿用当前账号的本地字幕偏好。
- 外观弹窗使用与字幕菜单一致的半透明模糊表面、居中标题与返回按钮，窄窗口支持滚动；补齐中文颜色和透明选项，并修正“小”字号大于默认字号的问题。
- 包含已发布 v0.4.14 的首页通用媒体分区与窄窗口卡片修正，以及 v0.4.13 语言偏好。搜索保留原推荐，不增加最近搜索记录。

## 已知问题

外观入口仅适用于本地播放的普通文本字幕；ASS/SSA、PGS 等带样式或图片字幕及远程播放不提供此入口。描边与历史阴影选项按 libmpv 能力近似，不能保证与网页渲染完全一致；不提供字体、粗体、行距或字幕位置调整。用户已确认整合验收包通过，未据此扩大为所有服务器、遥控、字幕格式或安装组合均已验证。详见[本版核验记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V0415_SUBTITLE_APPEARANCE.md)。

## 下载安装

从本 Release 的实际附件区下载 Windows x64 安装包、同名 `.sha256` 与来源记录；`SHA256SUMS.txt` 列出发行文件摘要。勿将 Source code 压缩包当作客户端安装包。安装器未签名；手动安装前核对 SHA-256 并正常退出客户端。操作说明见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可及第三方来源情况见[许可说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。哈希核对不等于数字签名或许可认证。
