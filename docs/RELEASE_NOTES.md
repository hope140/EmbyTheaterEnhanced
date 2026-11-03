# v0.4.12 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- 加入已通过独立低版本包交接验收的更新退出与安装交接修复：等待关键清理和原生进程实际退出，保留不确定状态的恢复回执，避免将取消请求或安装器启动误记为升级成功。
- 增加提前 EOF 定位日志：在低频或缓存状态变化时记录当前有效播放位置、缓存末端、缓存可播时长、剩余时长及缓存 EOF 转变。原生错误只记录已有的有限数值结果；播放器目前没有可靠的 HTTP 状态和重连结果事件，因此本版不会推断这些值。
- 保留 v0.4.11 的字幕首选语言多选。本版不改变普通 Seek、EOF、自动恢复或切线路行为。

## 验证范围

更新交接修复曾由独立 0.4.10-test 包作为发起端升级到 v0.4.11，用户确认验收通过。v0.4.12 组合版的 Windows 自动测试、安装器及实际更新体验仍以本版准确源码的结果为准；提前 EOF 的现场根因仍未确定。日志只投影数值和有限状态，不记录完整 URL、query、令牌、请求头、User-Agent 或网盘路径。核验方法与边界见[本版核验](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/V0412_RELEASE_VERIFICATION.md)。

## 下载安装

从本 Release 的实际附件区下载 Windows x64 安装包与对应 .sha256 文件，勿将源码压缩包当作安装包。安装器未签名；手动安装前核对同版本 SHA-256 并正常退出客户端。安装与更新说明见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可及第三方来源情况见[许可说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。哈希核对不等于数字签名或许可认证。
