# v0.4.8 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- “下载全剧”“下载本季”默认勾选“跳过已看完的集数”，按当前登录账户的已看状态筛选；部分观看的集数仍会下载，取消勾选可下载全部。
- 确认框同时显示筛选与全部各可添加数量，已有任务不重复添加。已看状态不完整时明确提示并默认取消，只有主动选择“仍下载全部”才继续。
- 下载管理移除“状态自动更新”文字，进度、完成和失败状态仍会自动更新。既有下载文件和任务保留。

## 已知问题与验证范围

本版沿用 Electron 44.4.2，未纳入独立的宿主升级候选。已报告 EWT 原生确认框关闭后输入／下拉失效、切换窗口后恢复的问题，本版尚未验收修复。

下载需要服务器在线及当前账户的下载权限；状态读取失败不能绕过鉴权或权限检查。来源仍须通过影片本体、长度与续传校验。筛选只在本次添加时判断，之后观看剧集不会自动删除任务或文件；更改下载目录仍只影响新任务。

筛选采用合成服务、临时磁盘及DOM／IPC回归，真实服务器已看状态和原生确认框可见体验尚未独立验证。准确源码、构建及发布状态见[本版核验记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V048_RELEASE_VERIFICATION.md)。

## 下载安装

从本 Release 的实际附件区下载 Windows x64 安装包与对应 `.sha256` 文件，勿将源码压缩包当作安装包。安装器未签名；手动安装前核对同版本 SHA-256 并正常退出客户端。安装与更新说明见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可及第三方来源情况见[许可说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。哈希核对不等于数字签名或许可认证。
