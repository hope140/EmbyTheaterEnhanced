# v0.4.10 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- 修复切集后旧片头信息残留，以及等待片头功能验证时切集导致旧点击作用到新播放的问题。
- 跳过片头前检查当前播放的片长和片头边界，拒绝达到或超过片尾的错误终点；片长尚未确认时等待有效信息。
- 补充定位与播放结束的脱敏诊断，帮助追查拖动进度后意外跳到下一集的问题。记录定位来源、目标、播放代次与有限的位置／时长／缓存观测，不记录完整播放地址或令牌，不增加持续进度日志。
- 保留 v0.4.9 的 Electron 44.5.0 焦点修复及下载管理。本版不包含独立预载／缓冲暂存或 EWT 插件改动。

## 已知问题与验证范围

片头缺陷已通过可控复现和回归测试；普通拖动进度后提前结束的现场根因仍未确认，新增诊断不等于该问题已经修复，也不能据此归因某个代理或服务器。普通定位与 EOF 处理保持原行为。诊断字段和调查边界见[定位诊断说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/SEEK_EOF_DIAGNOSTICS.md)；准确源码、Windows CI、包体与公开附件结果见[本版核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V0410_RELEASE_VERIFICATION.md)。

自动化与构建核验不替代实际片源、可见窗口、硬件和远控组合验收；本次未登录真实服务器或独立完成上述现场复现。Windows 完整安装矩阵仍未覆盖。下载继续要求服务器在线、当前账户权限及来源的本体／续传校验。

## 下载安装

从本 Release 的实际附件区下载 Windows x64 安装包与对应 `.sha256` 文件，勿将源码压缩包当作安装包。安装器未签名；手动安装前核对同版本 SHA-256 并正常退出客户端。安装与更新说明见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可及第三方来源情况见[许可说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。哈希核对不等于数字签名或许可认证。
