# Emby Theater Enhanced

Emby Theater Enhanced 是面向 Windows x64 的非官方 Emby Theater 社区维护版本，使用内嵌 libmpv 播放。它保留 Emby 的播放会话与远程控制，并为 STRM 媒体提供 CloudDrive2 和本地挂载路径解析。项目与 Emby 无隶属、合作或认可关系。

## 功能

- 内嵌 libmpv 播放，沿用 Emby 的播放进度、字幕、音轨和远程控制。
- STRM 的 CloudDrive2 DirectUrl/HTTP 解析、本地挂载与原生源回退。
- CD2 新资源首次查询未找到时，有限刷新父目录并重新查询。
- 智能路径映射助手、诊断导出和手动检查更新。
- 简体中文/英文安装器及 Together 同步切集支持。

## 下载 v0.3.1

v0.3.1 是当前正式版。请从 [GitHub v0.3.1 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1) 下载 Windows x64 安装包：

- [下载 EmbyTheaterEnhanced-0.3.1-win-x64-setup.exe](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.1/EmbyTheaterEnhanced-0.3.1-win-x64-setup.exe)
- [SHA-256 校验文件](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.1/EmbyTheaterEnhanced-0.3.1-win-x64-setup.exe.sha256) · [安装包来源记录](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.3.1/EmbyTheaterEnhanced-0.3.1-win-x64-setup.exe.provenance.json)

安装包 SHA-256 与准确源码提交见 Release 正文及随附校验文件、来源记录。

该安装包未进行数字签名，源码由 [v0.3.1 Tag](https://github.com/hope140/EmbyTheaterEnhanced/tree/v0.3.1) 固定。来源记录用于核对安装包身份；公开仓库尚未包含全部第三方构建输入，因此不能据此声称所有组件均可从公开源码完整重建，也不能声称第三方许可合规已全面验证。下载和运行前请自行评估 Windows 安全提示及第三方软件风险。

## 安装

新功能测试可下载 [v0.3.3 测试版](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.3)。该版本提供服务端首页分区、手动内核管理，并完善插件页面与原生控件显示；验收范围见 Release 与[显示审计](docs/PLUGIN_DISPLAY_AUDIT.md)。内置更新检查继续读取 Stable 渠道；测试版从该 Release 手动下载。

1. 下载上方 `.exe` 安装包，核对 SHA-256。
2. 关闭正在运行的 Emby Theater Enhanced，然后运行安装程序并按提示完成安装。
3. 首次启动时连接 Emby 服务器。升级时按安装向导确认原安装目录。

安装器可能显示 Windows 管理员权限提示。不要下载 GitHub 自动生成的 Source code 压缩包来安装客户端。

## 配置 STRM 与 CloudDrive2

在 Emby Theater 的“设置”→“播放”→“STRM 智能解析”中启用智能解析。需要使用 CloudDrive2 时填写本机服务地址，设置 Token，启用 CloudDrive2 并测试连接；随后添加路径规则并点击“保存设置”。设置和 Token 保存后，重启应用，播放链才会应用新配置。

每条规则把同一媒体的三种路径对应起来：

| 字段 | 填写内容 |
|---|---|
| STRM 源路径 | Emby `MediaSource.Path` 中记录的媒体源前缀。它不要求是本机可访问路径。 |
| CloudDrive2 路径 | 同一媒体在 CloudDrive2 中的逻辑路径前缀。 |
| 本地挂载路径 | 可选；填写当前客户端能访问的挂载目录，用于 Mount fallback。 |

例如，一条规则可以是：

```text
Emby Item.Path（STRM sidecar identity）：X:\Emby\STRM\Movies\Dune.strm
Emby MediaSource.Path（source identity）：X:\115\电影\Dune.mkv
STRM 源路径规则：X:\115\电影
CloudDrive2 路径：/CloudNAS/CloudDrive/115open/115/电影
本地挂载路径：Z:\115\电影
```

`Item.Path` 标识 `.strm` sidecar；规则优先匹配 `MediaSource.Path`。只有媒体源路径无法识别为绝对路径时，解析器才会使用 `Item.Path` 作为匹配输入。示例路径仅说明字段关系，请替换成服务器返回的真实路径。多个规则重叠时使用匹配到的最长源路径前缀。

不确定路径边界时，可在“智能映射助手”填写至少两组不同目录下的同一文件路径样本，检查建议后再加入规则并保存。助手不会自动扫描媒体库或替你保存配置。

## 常见问题

**增强解析失败会怎样？** 普通解析失败会继续尝试 Emby 原生播放源。取消或已被新播放请求替代的操作不会继续旧请求的 fallback。

**STRM/115 的内嵌字幕或音轨切换为什么要等 5–10 秒？** 这是当前已知延迟，v0.3.1 尚未解决。

**新入库资源为什么在 CD2 中找不到？** v0.3.1 在首次查询确认 NOT_FOUND 后，会有限刷新父目录并重查一次；正常命中保持原有 1200ms 查询预算，恢复总上限为 3000ms，并有 30 秒冷却及并发保护。仍未找到时请确认路径规则及 CD2 中的文件，必要时手动刷新对应目录；Emby 入库和 CD2 缓存更新是不同步骤。

**这是什么软件，支持哪些系统？** 这是非官方社区维护项目，仅提供 Windows x64 客户端；不代表 Emby 官方产品，也不提供 macOS 或 Linux 客户端。

**为什么 Windows 会提示未知发布者？** 当前安装包没有数字签名。请先核对上述发布页、文件名、SHA-256 和来源记录，再自行判断是否运行。

## 项目链接

- [全部版本与发布说明](https://github.com/hope140/EmbyTheaterEnhanced/releases)
- [新用户指南](docs/USER_GUIDE.md)
- [贡献指南](docs/CONTRIBUTING.md)
- [许可与第三方材料说明](docs/LICENSING.md)
- [变更记录](CHANGELOG.md)
