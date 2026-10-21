# v0.3.14 · 菜单与首页恢复测试版

Windows x64 **Pre-release 测试版**，请手动下载。当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)。内置更新检查读取 Stable 渠道，不会自动安装测试版。

## 本次更新

- 修正设备菜单没有条目时的标题居中，保留有条目菜单的原有布局与操作。
- 改善首页启动和返回时的加载恢复：等待既有客户端、服务器与用户状态就绪，失败后允许重试，离开页面时停止旧页面的加载提交。

本版沿用已合并的菜单与首页修正，统一应用及安装器版本为 0.3.14，不加入后续依赖拆分改动。来源及验证范围见[发行核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V0314_RELEASE_VERIFICATION.md)。

## 已知问题

STRM/115 内嵌字幕和音轨切换延迟、多显示器目标选择及退出时的显示恢复仍有已知限制。Windows 系统媒体控制相关试验尚未完成正式打包接线，本版不承诺其完整可用。用户此前的功能验收反馈不代表本次新版本安装包已经完成自动化实机播放或完整安装验收。更多内容见[已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/KNOWN_ISSUES.md)。

## 下载安装

- [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.14/EmbyTheaterEnhanced-0.3.14-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.14/EmbyTheaterEnhanced-0.3.14-win-x64-setup.exe.sha256)
- 安装程序未进行数字签名。关闭正在运行的客户端后再安装，步骤见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可与第三方材料情况见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。既有未决来源、对应源码和许可事项保持未决。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md) · [与前一版本比较](https://github.com/hope140/EmbyTheaterEnhanced/compare/v0.3.13...v0.3.14)
