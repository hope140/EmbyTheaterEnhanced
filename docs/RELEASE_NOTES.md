# v0.4.6 测试版

Windows x64 **Pre-release 测试版**。可手动下载，或在“关于 Enhanced”选择测试通道后主动检查更新。当前正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)。

## 本次更新

- 修复 STRM 配置或 Token 保存失败后遗留本次临时文件的问题；发生普通写入或重命名错误时清理仍属于本次操作的文件。
- 修复规则禁用、恢复和自动发现接口在写盘失败后提前改变内存状态的问题，失败后保留旧状态并允许重试。
- 整理安装、更新、开发和构建文档，明确旧客户端与 v0.4.5 起的软件更新安装交接差异。

## 已知问题与验证范围

本版只包含配置持久化审核修复和文档维护，不包含预载、共享播放缓存、缓冲暂存或提前下载实验。后台回归使用合成数据和隔离目录；未追加真实 Emby／CD2、Windows 前台、完整客户端或系统安装验收。

清理权限不足、文件被替换或进程突然终止时，临时文件仍可能无法清理；本次不会扫描删除历史临时文件，也不改变 Token 存储格式。测试与发行证据见[本版核验记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/v0.4.6/docs/V046_RELEASE_VERIFICATION.md)。

## 下载安装

从本 Release 的实际附件区下载 Windows x64 安装包与对应 `.sha256` 文件，勿将源码压缩包当作安装包。安装器未签名；手动安装前核对同版本 SHA-256 并正常退出客户端。应用内更新的流程取决于当前正在运行的客户端版本，见[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/v0.4.6/docs/USER_GUIDE.md)。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。许可及第三方来源情况见[许可说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/v0.4.6/docs/LICENSING.md)。哈希核对不等于数字签名或许可认证。
