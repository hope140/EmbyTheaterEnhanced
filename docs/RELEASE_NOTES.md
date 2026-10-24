# v0.4.1 测试版

Windows x64 **Pre-release 测试版**，需要手动下载。当前正式版为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0)，本测试版不替代正式版或设为 Latest。

## 本次更新

- 修复连续播放、停止时的资源清理，以及自动切率等待后的暂停保持。
- 修复首次只保存 STRM Token 后的重启恢复，并限制诊断历史持续增长；原保存和认证策略保持。
- 修复 EWT Seek 的小数精度与暂停后的真实完成进度上报，不以命令目标伪造实际落点。
- 修复无章节视频的缩略图预览、实际播放版本绑定，以及快速切换时的旧响应取消隔离。
- 当前固定 Native Helper 模式隐藏视频渲染、图形接口两处无效选择及说明；其他有效设置和历史值保留，实际渲染仍为 gpu-next / D3D11。

## 已知问题与验证范围

九项候选已收到有限用户验收反馈；云端回归、组件 DOM 和真实环境体验分别记录，不表示所有 Emby 版本、多版本媒体、双端 EWT 或显示硬件都已验证。缩略图需要服务端已有数据；不支持按版本请求的接口可能只显示时间文字。难复现问题仍需真实环境继续观察。

本版最终源码、构建与已执行范围见[本版准备及核验记录](https://github.com/hope140/EmbyTheaterEnhanced/blob/fix/audit-ewt-validation/docs/V041_RELEASE_VERIFICATION.md)。既有多显示器和显示恢复等限制见[已知问题](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/KNOWN_ISSUES.md)。

## 下载安装

从本 Release 的实际附件区手动下载 Windows x64 安装包及对应 SHA-256 校验文件；下载、来源记录和哈希应属于同一次发行，不使用源码压缩包代替安装包。先关闭客户端，核对后按[用户指南](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/USER_GUIDE.md)操作。SHA-256用于核对字节，不等于数字签名或许可认证。

## 项目说明

非官方社区维护项目，与 Emby 官方无隶属或认可关系。现有未决第三方来源、对应源码和许可事项保持未决；见[许可与来源说明](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/LICENSING.md)。
