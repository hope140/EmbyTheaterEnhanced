# v0.4.0 正式版

Windows x64 正式版。本次整理已经验收的维护范围、来源输入与可恢复云端构建，保留旧 v0.3.16 测试版。

## 本次更新

- 完整移除 CEC 功能、相关设置和驱动安装提示；普通 HDMI 音视频、刷新率、键鼠及服务器远控保持。
- 退役旧 Emby Theater Host 自更新检查和安装链，保留本项目发行版更新入口。升级只清理身份可核对的旧应用文件，保留用户资料，不卸载系统驱动。
- Host 从固定官方源码维护构建，JSON／ZIP 实现及普通 API 传输使用可追溯维护源；损坏或截断的 JSON 明确报错。
- 清理已批准的旧资源与运行依赖，保留必要第三方通知和历史来源；GitHub Windows runner 独立恢复固定输入、编译验证 Host 和 Native Helper，再核验安装器。

## 已知问题与验证范围

本轮候选已获用户验收，有限安装、升级、STRM 播放和正常 Host 入口结果按其准确来源单独记录。云端构建与包体检查不等于所有服务器、媒体、硬件或干净 .NET Framework 环境验收。最终来源、CI、五附件和已执行范围见[本版发行核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V040_RELEASE_VERIFICATION.md)。

多显示器目标选择、显示恢复等既有限制保持，详见[已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/KNOWN_ISSUES.md)。

## 下载安装

- [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe.sha256)
- [安装包来源记录](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe.provenance.json) · [附件校验表](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/SHA256SUMS.txt)
- 关闭正在运行的客户端，校验后安装；步骤见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。安装程序未签名，SHA-256用于核对下载字节，不等于数字签名或许可认证。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。现有未决第三方来源、对应源码和许可事项保持未决；见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。

[版本变更记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/CHANGELOG.md) · [与旧测试版比较](https://github.com/hope140/EmbyTheaterEnhanced/compare/v0.3.16...v0.4.0)
