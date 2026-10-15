# 安装与 STRM 配置

从 [Release 页面](https://github.com/hope140/EmbyTheaterEnhanced/releases) 选择所需稳定版或测试版的 Windows x64 安装包和 SHA-256 文件；主分支新增功能不表示已经发布。安装前关闭运行中的 ETE，核对文件哈希后按安装器选择语言和独立目录。安装器未签名；如系统提示，先检查来源和哈希。升级显示目录页并预填现有位置。卸载/重装等完整系统场景仍有验证缺口，重要配置请先备份。

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

诊断设置提供状态、日志和导出包，About 提供版本与手动检查更新。提交问题前检查导出内容，隐藏账号、Token、Cookie、完整媒体地址和私人路径。更多内容见 [已知问题](KNOWN_ISSUES.md)、[配置合同](STRM_RESOLVER_SETTINGS.md) 和 [诊断](CLIENT_DIAGNOSTICS.md)。
