# Emby Theater Enhanced

Emby Theater Enhanced 是面向 Windows x64 的 Emby Theater 社区增强版，重点改善 STRM 网盘播放、路径配置和日常使用体验。项目与 Emby 无隶属、合作或认可关系。

## 相比上游的增强

- **STRM 网盘播放**：通过 CloudDrive2 获取媒体直链，也可使用本地挂载路径；增强解析失败时尝试原有播放源。
- **智能路径映射助手**：根据同一文件的多组路径样本生成映射建议，减少手工填写规则的工作。
- **CD2 新资源重查**：新入库文件首次找不到时，自动尝试刷新对应父目录并重新查询。
- **诊断日志导出**：集中导出播放与错误信息，并对已知格式的敏感内容脱敏，方便排查和反馈问题。

当前测试版还包含：

- **mpv 内核管理**：手动导入内核包，选择后在下次启动时生效。
- **插件设置适配**：改善神医助手、Madby GenericUI 等插件设置页的控件、页签和滚动显示。
- **首页分区同步**：按 Emby 服务器配置的分区和顺序显示首页内容。

## 下载

仅支持 Windows x64。正式版与测试版的功能范围不同，请按需选择。

| 渠道 | 下载 | 校验 |
| --- | --- | --- |
| 正式版 · [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1) | [Windows x64](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.1/EmbyTheaterEnhanced-0.3.1-win-x64-setup.exe) | [SHA-256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.1/EmbyTheaterEnhanced-0.3.1-win-x64-setup.exe.sha256) |
| 测试版 · [v0.3.12](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.12) | [Windows x64](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.12/EmbyTheaterEnhanced-0.3.12-win-x64-setup.exe) | [SHA-256](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.12/EmbyTheaterEnhanced-0.3.12-win-x64-setup.exe.sha256) |

内置更新检查读取正式版渠道，测试版需手动下载。各版具体变化见[变更记录](CHANGELOG.md)。

当前下载包未签名，Windows 可能提示未知发布者。下载校验、安装升级和配置步骤见[用户指南](docs/USER_GUIDE.md)。

STRM/115 的内嵌字幕、音轨切换仍可能有数秒延迟；插件设置适配也有兼容范围。使用前可查看[已知问题](docs/KNOWN_ISSUES.md)，遇到问题按[反馈步骤](docs/USER_GUIDE.md#问题反馈)提供必要信息。

## 项目链接

- [全部版本与发布说明](https://github.com/hope140/EmbyTheaterEnhanced/releases)
- [新用户指南](docs/USER_GUIDE.md)
- [文档索引](docs/README.md)
- [已知问题与反馈](docs/KNOWN_ISSUES.md)
- [贡献指南](docs/CONTRIBUTING.md)
- [许可与第三方材料说明](docs/LICENSING.md)
- [变更记录](CHANGELOG.md)
