# v0.3.10 · 稳定性维护测试版

Windows x64 **Pre-release 测试版**，请手动下载。当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)。

## 本次更新

- 诊断导出补齐动态字段名中的已知敏感格式清洗。
- 改善服务器发现的错误处理与本次资源清理。
- 避免WOL的错误和迟到回调重复响应。
- 修正Native输入/写队列线程早于状态成员初始化启动的顺序风险。
- 同步打包、许可历史记录及维护文档。

准确来源、构建与包体结果见[发行核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V0310_RELEASE_VERIFICATION.md)。源码/合成验证不代表真实设备、Helper ready或播放验收；本次未追加这些实际运行场景。

## 已知问题

多显示器目标选择与完整退出恢复仍需继续观察，STRM/115内嵌字幕和音轨切换延迟尚未解决。更多内容见[已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/KNOWN_ISSUES.md)。

## 下载安装

- [Windows x64安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.10/EmbyTheaterEnhanced-0.3.10-win-x64-setup.exe)
- [SHA-256校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.10/EmbyTheaterEnhanced-0.3.10-win-x64-setup.exe.sha256)
- 安装程序未进行数字签名。关闭正在运行的客户端后再安装。

## 项目说明

非官方社区维护项目。许可与第三方材料情况见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md) · [与前一版本比较](https://github.com/hope140/EmbyTheaterEnhanced/compare/v0.3.9...v0.3.10)
