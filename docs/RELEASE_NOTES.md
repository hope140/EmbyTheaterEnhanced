# v0.3.15 · 播放后退出修复测试版

Windows x64 **Pre-release 测试版**，请手动下载。当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)。内置更新检查读取 Stable 渠道，不会自动安装测试版。

## 本次更新

- 修复 Windows 播放后关闭窗口时，任务栏媒体控制清理可能触发的主进程 `Object has been destroyed` 错误弹窗。
- 关闭后正确取消相关重试与监听，重复清理安全；任务栏播放/暂停和停止功能继续保留。

本版只包含这项退出修复及回归，不加入依赖拆分或 Host/Model 更新。验证范围见[发行核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V0315_RELEASE_VERIFICATION.md)。

## 已知问题

隔离 Electron 窗口已验证原错误和修复后的关闭流程，播放状态由夹具注入；未完成真实媒体、完整应用退出或系统安装矩阵验收。STRM/115 内嵌字幕和音轨切换延迟、多显示器目标选择及显示恢复等既有限制保持。可选 Windows FFI 系统媒体试验仍未完成普通构建接线。更多内容见[已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/KNOWN_ISSUES.md)。

## 下载安装

- [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.15/EmbyTheaterEnhanced-0.3.15-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.15/EmbyTheaterEnhanced-0.3.15-win-x64-setup.exe.sha256)
- 安装程序未进行数字签名。关闭正在运行的客户端后再安装，步骤见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可与第三方材料情况见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。既有未决来源、对应源码和许可事项保持未决。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md) · [与前一版本比较](https://github.com/hope140/EmbyTheaterEnhanced/compare/v0.3.14...v0.3.15)
