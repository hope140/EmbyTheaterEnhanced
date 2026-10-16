# v0.3.7 · 播放控制与连接测试版

**本次重点：播放控件、连接与资源清理。**

Windows x64 **Pre-release 测试版**，请从本页手动下载。当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)。

## 更新内容

- 切集、暂停或离开播放页时，清理倍率按键监听与待执行回调。
- 分别管理视频与音频的电源阻止状态，并在退出时释放。
- 关闭连接、退出登录或重新连接时，清理旧连接回调和重试计时器。
- 清理旧播放请求的音量 OSD 观察器与延迟回调。

## 已知问题

电源与退出组合尚待使用中进一步验证。STRM/115内嵌字幕与音轨切换延迟仍未解决。更多内容见[已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/KNOWN_ISSUES.md)。

## 下载安装

- [下载 Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.7/EmbyTheaterEnhanced-0.3.7-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.7/EmbyTheaterEnhanced-0.3.7-win-x64-setup.exe.sha256)
- 安装程序未进行数字签名。关闭正在运行的客户端后再安装。

## 项目说明

非官方社区维护项目。许可与第三方材料情况见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md) · [与前一版本比较代码变化](https://github.com/hope140/EmbyTheaterEnhanced/compare/v0.3.6...v0.3.7)