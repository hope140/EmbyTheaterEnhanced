# v0.3.8 · 显示兼容与设置维护测试版

**本次重点：刷新率切换、设置顺序与页面维护。**

Windows x64 **Pre-release 测试版**，请从本页手动下载。当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)。

## 更新内容

- 显示查询和切换增加等待上限；显示探测失败时继续原播放流程。
- 合并同一播放请求的刷新率事件，停止或切集时清理旧等待；恢复刷新率前检查当前值。
- 设置栏依次展示操作快捷键、HDMI-CEC、视频、音频、STRM、诊断及关于。
- 修正电影库分块重试与请求归属，并补齐诊断标签脱敏。

## 已知问题

多显示器的目标选择和完整退出恢复仍需继续观察。STRM/115内嵌字幕与音轨切换延迟尚未解决。更多内容见[已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/KNOWN_ISSUES.md)。

## 下载安装

- [下载 Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.8/EmbyTheaterEnhanced-0.3.8-win-x64-setup.exe.sha256)
- 安装程序未进行数字签名。关闭正在运行的客户端后再安装。

## 项目说明

非官方社区维护项目。许可与第三方材料情况见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md) · [与前一版本比较代码变化](https://github.com/hope140/EmbyTheaterEnhanced/compare/v0.3.7...v0.3.8)
