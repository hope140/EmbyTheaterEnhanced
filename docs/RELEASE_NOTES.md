# v0.3.13 · 退出清理维护测试版

Windows x64 **Pre-release 测试版**，请手动下载。当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)。内置更新检查读取 Stable 渠道，不会自动安装测试版。

## 本次更新

- 修复播放器辅助进程发生错误时，客户端可能过早认定该进程已经退出的问题。
- 修复关闭期间某项清理失败后，客户端可能提前退出、未等其他清理完成的问题。

有限试用暂时未发现明显问题，具体来源与验证范围见[发行核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V0313_RELEASE_VERIFICATION.md)。

## 已知问题

整体退出超时与强退策略尚未调整，未确认结束的辅助进程仍可能造成等待。STRM/115 字幕与音轨切换延迟、多显示器目标选择及完整退出时的显示恢复仍有已知限制。更多内容见[已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/KNOWN_ISSUES.md)。

## 下载安装

- [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.13/EmbyTheaterEnhanced-0.3.13-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.13/EmbyTheaterEnhanced-0.3.13-win-x64-setup.exe.sha256)
- 安装程序未进行数字签名。关闭正在运行的客户端后再安装，步骤见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可与第三方材料情况见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。既有未决来源、对应源码和许可事项保持未决。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md) · [与前一版本比较](https://github.com/hope140/EmbyTheaterEnhanced/compare/v0.3.12...v0.3.13)
