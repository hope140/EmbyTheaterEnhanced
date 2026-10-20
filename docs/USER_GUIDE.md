# 用户指南

## 选择版本与校验下载

当前正式版为 [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1)，当前测试版为 [v0.3.13](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.13)。两者均面向 Windows x64。测试版需要手动下载；内置检查更新读取 Stable 渠道，不自动安装更新。主分支新增功能不表示已经发布。

从同一个 Release 下载 `.exe` 与对应 `.exe.sha256` 文件；`Source code` 压缩包用于源码，不是客户端安装包。将两个文件放在同一目录，在该目录打开 PowerShell。以 v0.3.12 为例：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\EmbyTheaterEnhanced-0.3.12-win-x64-setup.exe'
Get-Content -LiteralPath '.\EmbyTheaterEnhanced-0.3.12-win-x64-setup.exe.sha256'
```

比较第一条命令的 `Hash` 与校验文件里的 64 位十六进制值，大小写不影响比较。选择其他版本时使用该版实际文件名。哈希不一致时停止安装并重新核对下载；哈希一致仅说明文件与发布校验值相符。当前测试版安装包未签名，Windows 可能显示未知发布者提示。

## 安装与升级

1. 保存播放状态，正常退出客户端。
2. 升级前备份重要配置。备份 `%APPDATA%\EmbyTheaterEnhanced`，以及存在时的 `%APPDATA%\Emby Theater Enhanced`；若自行指定了其他用户资料目录，也需备份该目录。仅复制程序安装目录不能完整备份用户资料。备份可能含登录资料和 Token，请只保存在可信的本地位置。
3. 运行已校验的安装包，按管理员权限提示选择语言和安装目录。升级会预填已有安装位置，请确认原目录。
4. 安装完成后启动客户端，在“关于”确认版本；首次使用时连接自己的 Emby 服务器。

安装器会检查目标目录中的客户端及被占用文件，不会替你强行结束进程。若被拒绝，正常退出客户端后重试。复制或替换失败时保留错误信息，检查目录权限与剩余空间，再在原目录重试；必要时使用此前可信的安装包恢复。安装器不提供自动回滚。

## 卸载与资料保留

正常退出客户端后，在 Windows“设置”的应用列表中找到 Emby Theater Enhanced 并选择卸载，按向导完成。当前安装器卸载程序组件时保留个人设置、登录资料和 DeviceId；卸载后重装会继续使用保留资料，并非恢复全部默认设置。重要配置仍应先备份。

安装、升级与卸载的已验证场景有明确边界，不能保证所有权限、取消、失败恢复和首次启动组合；见[已知问题](KNOWN_ISSUES.md)及[v0.3.9 安装核验](V039_RELEASE_VERIFICATION.md)。v0.3.11 的包体核验没有追加系统安装场景。

## STRM 与 CloudDrive2

启动后使用自己的 Emby 服务器登录。普通媒体无需配置 STRM 增强。进入播放设置中的“STRM 智能解析”，启用所需解析方式。

CloudDrive2 地址填写当前服务地址，Token 通过单独设置动作保存；连接测试使用已保存地址和 Token。Token 不从设置读取接口返回。保存地址后测试连接，再填写路径规则，保存后重启生效。

假设 Emby 的 Item.Path 为 /library/Example.strm，MediaSource.Path 为 /media/cloud/Movies/Example.mkv，而 CD2 中该文件为 /drive/Movies/Example.mkv：sourcePrefix 应是 /media/cloud，cloudPrefix 应是 /drive。可选 mountPrefix 是当前电脑能访问的挂载目录，例如 X:\Cloud；它与服务器路径、CD2 路径不是同一个位置。

规则使用最长前缀且必须匹配目录边界。cloud-first 依次尝试 DirectUrl、CD2 HTTP、Mount、Native；mount-first 优先本地挂载；custom 按页面顺序。无法确定 cloud 或 mount 前缀时不要猜测。先在 CD2 确认目标文件，使用规则测试验证映射。

智能映射助手输入同一媒体的 STRM 目标路径、CD2 文件路径和可选本机挂载路径；使用两个不同目录样本确认映射边界。建议加入的是草稿，仍需点击“保存设置”；离开页面不自动保存，也不会扫描网盘。

播放失败时查看诊断中的路由和 cd2Reason：mapping_miss 表示没有可用映射；not_found 表示服务返回找不到；timeout 表示预算耗尽；invalid_file 表示响应不符合文件检查。当前仅在目标资源明确返回 NOT_FOUND 时进行有限的父目录刷新并最多重查一次；映射缺失、超时和鉴权失败等不触发该恢复。恢复后仍失败时，请确认 CD2 中的实际资源和映射，其他错误不要当作目录缓存缺失。

## mpv 内核候选管理

About 的内核管理区域显示当前进程和下次启动的选择。先准备包含 `candidate.json`、`mpv-1.dll`、`SOURCE.txt`、`NOTICE.txt` 四个固定条目的完整 ZIP，再点击“导入内核包”。维护者可用仓库的 `tools/package-mpv-kernel-candidate.cjs` 生成并验证包；DLL、来源和notice文件需自行提供，工具不会下载内核。

导入会校验包体哈希、Windows x64 DLL结构和必需导出，成功后只加入候选列表。点击“下次启动使用此候选”，退出并重新打开应用后才生效；导入或选择不会切换当前进程的内核。选择固定基线也同样在下次启动生效。

候选启动验证失败时，应用在失败进程退出后至多回到固定基线一次；基线仍失败则停止重试。候选已运行后的故障不会触发进程内换库。静态校验和Helper握手不代表DLL实际加载映像哈希、来源声明或许可已经独立核验，About保留相应UNKNOWN/未评估状态。缺少可信来源元数据或候选存储不可用时，按页面原因处理，不绕过校验手动覆盖程序目录。

## Anime4K 快捷键兼容

旧版 Ctrl+0、Ctrl+反引号和 Ctrl+1 不再由 ETE 截获，也不会重命名 mpv 全局目录里的 Anime4K 配置或停止当前播放。本版本不重新分配这些按键，键盘输入交由 Emby/Electron 原有处理。已有配置文件保持原样。

## 旧外置播放器连播兼容

详情页的旧外置播放器按钮和它的连播计时器已停用，相关设置会保留且不会自动改写。需要 Emby 自动播放下一集时，请继续使用播放设置中的“自动播放下一集”；该流程仍由正常播放队列管理。

## 问题反馈

1. 在“关于”记录应用版本；说明 Windows 版本、普通媒体或 STRM、预期行为与实际现象。
2. 记下发生时间和时区，以及最少复现步骤。播放问题补充是否使用 CD2 或本地挂载、是否发生在切集、停止或切换字幕/音轨时。
3. 在设置的“诊断与日志”点击“导出诊断日志”，保存 TXT。无法启动或无法导出时，先说明该情况并保留错误文字。
4. 检查导出内容，隐藏账号、Token、Cookie、完整媒体地址、私人路径及媒体库标识，再到 [GitHub Issues](https://github.com/hope140/EmbyTheaterEnhanced/issues)提交问题和必要片段。不要上传整个用户资料备份。

日志中的 `UNKNOWN` 表示缺少相应证据，不等同于失败。详细字段和可选仓库采集工具见[诊断说明](CLIENT_DIAGNOSTICS.md)；配置技术边界见[配置合同](STRM_RESOLVER_SETTINGS.md)，当前限制见[已知问题](KNOWN_ISSUES.md)。
