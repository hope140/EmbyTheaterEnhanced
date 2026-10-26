# Emby Theater Enhanced

面向 **Windows x64** 的非官方 Emby Theater 社区增强版，用于连接自己的 Emby 服务器，重点改善 STRM 网盘播放、页面浏览和日常使用体验。项目与 Emby 官方无隶属、合作或认可关系。

[下载安装](#下载安装) · [安装与更新指南](docs/USER_GUIDE.md) · [常见问题](docs/USER_GUIDE.md#常见问题) · [开发与构建](docs/CONTRIBUTING.md) · [文档索引](docs/README.md)

## 下载安装

截至 2026-10-26，正式版与测试版如下。只需使用客户端时，下载安装包即可，无需准备源码和构建工具。

| 渠道 | 下载 | 校验 |
| --- | --- | --- |
| 正式版 · [v0.4.0（Latest）](https://github.com/hope140/EmbyTheaterEnhanced/releases/latest) | [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe) | [SHA-256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/EmbyTheaterEnhanced-0.4.0-win-x64-setup.exe.sha256) |
| 测试版 · [v0.4.4（Pre-release）](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.4) | [Windows x64 安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/EmbyTheaterEnhanced-0.4.4-win-x64-setup.exe) | [SHA-256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.4/EmbyTheaterEnhanced-0.4.4-win-x64-setup.exe.sha256) |

从同一 Release 下载安装包和校验文件，核对 SHA-256 后，正常退出客户端再安装。`Source code` 压缩包不是安装包。安装程序未签名，Windows 可能提示未知发布者；校验值用于核对下载字节。

**v0.4.2 起**可在“关于 Enhanced”主动选择正式／测试通道、检查并下载安装包，下载后仍需自行退出并安装。应用不会自动检查或安装更新，也不提供降级下载。v0.4.0 用户可从上表手动升级；步骤见[用户指南](docs/USER_GUIDE.md)。

## 主要功能

- **STRM 智能解析**：通过 CloudDrive2 获取媒体直链，也可使用本机挂载路径；失败时继续尝试原有播放源。路径映射助手可根据样本生成规则建议，新资源明确找不到时有界刷新父目录并重查。
- **页面与设置维护**：按服务器配置显示首页分区，改善详情、搜索及部分插件设置页的控件和导航；兼容范围见[已知问题](docs/KNOWN_ISSUES.md)。
- **mpv 内核管理**：手动导入内核候选包，选择后下次启动生效；来源与兼容校验的边界见[用户指南](docs/USER_GUIDE.md#mpv-内核候选管理)。
- **诊断导出**：导出播放与错误信息，对已知敏感格式脱敏；反馈前仍需自行检查内容。

测试版在以上基础上增加：

- **v0.4.2 页面缓存与缓存管理**：再次打开近期详情时先显示有限静态信息，再更新服务器数据；可分别或一并清理资源缓存与页面缓存，保留登录和设置。缓存不能代替授权、最新进度或真实播放数据。
- **v0.4.2 手动更新与通道选择**：保存正式／测试通道，主动检查和下载更新。
- **v0.4.3 Windows 媒体集成**：任务栏缩略图和 Peek 显示一秒采样的视频预览，控制集中到系统媒体卡片；原任务栏两个控制按钮已移除。预览是低频截图，不承诺连续流畅视频，也不合成字幕。
- **v0.4.3 使用修正**：修复退出异常及 Host 残留，缓存清理按钮文字居中，设置展示名简化为“智能解析”。
- **v0.4.4 浏览与诊断修正**：改善详情布局和海报交接、返回首页时的驻留内容复用，补充脱敏播放诊断；移除不再使用的包内 Anime4K shader。

各版范围见[变更记录](CHANGELOG.md)与[实际 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases)。下一集预加载、缓冲暂存和飞牛认证仍是[独立实验](docs/NEXT_RELEASE_SCOPE.md#未发布实验)，不属于上述已发布功能。

## 文档与反馈

- [用户指南](docs/USER_GUIDE.md)：校验、安装、更新、配置和常见问题。
- [已知问题](docs/KNOWN_ISSUES.md) · [反馈步骤](docs/USER_GUIDE.md#问题反馈) · [GitHub Issues](https://github.com/hope140/EmbyTheaterEnhanced/issues)。
- [贡献指南](docs/CONTRIBUTING.md)：项目结构、依赖、检查与构建入口。
- [文档索引](docs/README.md)：技术合同、来源材料及历史发行记录。

维护层按 [GPL-2.0-only](LICENSE) 发布；第三方组件适用各自条款。保留或发布材料不表示其授权、来源及完整对应源码均已核验。必要通知与未决事项见[许可与来源说明](docs/LICENSING.md)和[第三方通知](THIRD_PARTY_NOTICES.md)。
