# v0.4.11 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- 字幕首选语言可按顺序多选，重新进入设置页时保留选择。播放时仍由服务器返回的默认字幕轨道决定实际选轨。
- 收紧应用内更新的退出与安装交接：等待关键清理实际完成后才放行安装向导；交接未确认时保留阻止和有限恢复提示，并在重试时重新核验安装包。
- 保留 v0.4.10 已发布的片头修复、定位诊断及此前功能。本版未加入独立预载／缓冲暂存或暂停的播放异常修复。

## 已知问题与验证范围

从旧版升级至本版时，发起更新的仍是旧客户端，因此该次升级不能证明本版的退出与安装交接修复有效。验收该修复需要运行本版客户端，再由它升级到之后更高的版本。向导启动、退出码和回执均不单独证明安装成功，仍需在原安装位置启动目标版本并核对。

字幕多选的服务端实际解释、真实 GUI 与播放组合，以及真实 Windows 安装、UAC 和更新交接仍需现场验收。普通拖动进度后提前结束的现场根因仍未确认。准确源码、CI、包体及现场验收边界见[本版核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V0411_RELEASE_VERIFICATION.md)。

## 下载安装

从本 Release 的实际附件区下载 Windows x64 安装包与对应 .sha256 文件，勿将源码压缩包当作安装包。安装器未签名；手动安装前核对同版本 SHA-256 并正常退出客户端。安装与更新说明见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可及第三方来源情况见[许可说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。哈希核对不等于数字签名或许可认证。
