# v0.4.9 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- Electron 从 44.4.2 更新到固定的 44.5.0，修复 Windows 原生确认框关闭后输入和下拉失去响应的焦点问题，包括 EWT 删除房间确认框点击取消后的已报告场景。
- 保留 v0.4.8 的下载管理与全剧／本季已看集数筛选。本版不包含独立预载／缓冲暂存或 EWT 插件改动。

## 已知问题与验证范围

本版沿用已完成用户验收的焦点修复候选，按新版本重新构建。上游修复与固定输入见[焦点修复说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/ELECTRON_4450_FOCUS.md)；准确源码、Windows CI、包体与公开附件结果见[本版核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V049_RELEASE_VERIFICATION.md)。

自动化覆盖新版 Electron 的接口绑定、隐藏窗口退出及构建／安装包核验；隐藏窗口系统媒体和预览场景使用替身，不代表全部可见窗口、硬件或远控组合通过。真实服务器及可见焦点反馈来自用户验收，未冒称独立机器实测；Windows 完整安装矩阵仍未覆盖。下载继续要求服务器在线、当前账户权限及来源的本体／续传校验。

## 下载安装

从本 Release 的实际附件区下载 Windows x64 安装包与对应 `.sha256` 文件，勿将源码压缩包当作安装包。安装器未签名；手动安装前核对同版本 SHA-256 并正常退出客户端。安装与更新说明见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可及第三方来源情况见[许可说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。哈希核对不等于数字签名或许可认证。
