# INSTALL_DISPLAY_READINESS_027 — 静态审查与执行准备

审查时间：2026-10-10（Asia/Hong_Kong）

仓库：`codex/maintenance-027-20261010`，HEAD `dbee15afc76d97ed68117206e6ac6b638315732b`
审查等级：Tier 1；风险低（静态读取与项目内报告写入），不确定性中等（真实安装生命周期及显示硬件没有本轮运行证据），跨模块范围低，Playback/Session impact 无（未改产品）。

## Observed

- `installer/EmbyTheaterEnhanced.iss` 用固定 `AppId` 和默认 `{autopf}\Emby Theater Enhanced` 安装目录；递归复制 runtime，启用 `ignoreversion` 与 `notimestamp`。没有自定义 `[UninstallDelete]`、profile 清理、注册表清理或迁移代码。存在可选桌面快捷方式，安装完成时可启动应用。`CloseApplications=no`，因此运行中的客户端应在测试前正常退出。
- `tools/package.ps1` 在编译前校验当前 HEAD、构建输入、依赖、产品版本、退役文件排除、source/runtime provenance 及完整 payload path/hash；`-VerifyOnly` 只做校验。正式编译需已有固定 Inno 工具链；不会自动安装工具。安装包输出和 companion 文件必须不存在。
- `src/electronapp/enhanced/bootstrap.js` 把配置/日志/CEC 数据置于 `%APPDATA%\EmbyTheaterEnhanced`，仅为缺失的 `config/system.xml` 和 `cec-driver/cancel` 创建初始文件。`src/electronapp/device-identity.js` 在 `config/device-identity.json` 持久化 UUID；有效值会复用，缺失或损坏时原子重建。`main.js` 从该 profile 目录读取/创建 DeviceId。Electron `userData` 另由启动参数或默认路径承载应用配置。
- 当前机器的只读能力探测：Windows Sandbox feature `Disabled`；Hyper-V feature `Disabled`；VMMS service `unavailable`；Hyper-V 管理命令 `unavailable`；`HypervisorPresent=true`。现有可管理 VM 数量为 `unavailable`。因此目前没有证据表明存在已配置且可立即用于生命周期验收的隔离 Windows 环境；单独的 hypervisor 标记不构成可用 VM 证明。没有启动、安装或更改系统组件。

## Expected

安装目录和 profile 目录相互独立。按现有静态结构，升级覆盖安装文件应保留 profile；卸载器没有项目自定义的 profile 删除步骤；卸载后重新安装会复用未删除的有效 DeviceId 和现有配置。以上是源码/脚本预期，尚非本次候选安装实测。

## 生命周期验收与回滚计划

四阶段都应在快照可还原的独立 Windows VM 中执行。测试前固定精确 installer 文件名、SHA-256、provenance/source commit 和旧版基线；保留安装前 VM 快照。生成一个无真实凭据的 profile canary，并只记录配置文件存在性、大小/哈希和 DeviceId 哈希，不能保存 DeviceId 原文、账号、Token 或媒体路径。

1. **Clean install — 本次 `NOT_EXECUTED`**：从无 ETE 安装和无 ETE profile 的 VM 快照开始；安装候选，记录安装目录、快捷方式、卸载项、payload 对比和启动/正常退出。检查 bootstrap 只创建约定默认文件，建立首个 profile 与 DeviceId。回滚恢复安装前 VM 快照。
2. **In-place upgrade — 本次 `NOT_EXECUTED`**：从装有正式旧版且含 canary/profile 的快照开始，正常退出旧客户端后，用同一 AppId 的候选安装器覆盖。核对安装目录 payload 对候选 manifest 的 `missing/extra/hash mismatch`，核对用户配置 canary、Emby 登录状态存在性与 DeviceId 哈希保持；检查旧快捷方式/卸载项指向正确安装。回滚恢复旧版快照，不能把候选文件手工覆盖回去。
3. **Uninstall — 本次 `NOT_EXECUTED`**：从升级通过后的独立快照运行该安装实例对应的正式卸载器。分别检查程序文件、快捷方式、卸载登记和 profile：程序/快捷方式应移除，profile 应按当前无自定义删除逻辑继续存在；检查 ETE owned process 残留。回滚恢复卸载前快照。
4. **Reinstall — 本次 `NOT_EXECUTED`**：从卸载后的快照重装同一候选；检查安装文件完整，profile canary、配置和 DeviceId 哈希复用，启动可读且未产生第二套意外 profile。回滚恢复卸载后快照；最终清理仅通过销毁/恢复 VM 快照完成。

## 显示验收最小场景与前置条件

这些只是后续真实验收的最小提纲，不是显示修复或通过声明。

- **HDR**：真实支持 HDR 输出的 Windows、已启用 HDR 的目标显示器、可确认 HDR metadata 的真实样本、记录的 GPU/解码路径；比较窗口/全屏的视频区域与系统 HDR 状态，并记录首帧和持续显示证据。项目已有记录只覆盖 `gpu-next`、D3D11/D3D11VA 与缓存属性，明确没有覆盖 HDR 画质效果。
- **多屏/混合 DPI**：两台可用显示器，记录各自分辨率、缩放、主副屏与 HDR 状态；在窗口、全屏、跨屏移动、全屏进出、Alt-Tab、最小化/恢复后核对目标屏 bounds、视频区域帧和 OSD。既有 Electron 44 后台记录将 mixed-DPI 与手动全屏列为 NOT RUN；统一候选记录也明确多显示器未覆盖。
- **全屏动态圆角（ROADMAP 已记录的可复现问题）**：状态为 `REPRODUCIBLE / DEFERRED`。未播放时 windowed 为圆角、fullscreen 为直角；开始播放后 fullscreen 错误出现圆角。当前较强嫌疑是 playback surface top-level window 的 DWM corner state 未随 mainWindow fullscreen 状态同步，但根因尚未证实。后续先确认窗口身份并观察 DWM state；没有新证据前不进入 redraw timer、focus hack、`SetWindowPos` loop 或 GPU flag 路径。需要在目标候选、播放面可见且能切换 windowed/fullscreen 的前台场景复现，并记录播放前/后与 mainWindow 状态、surface/window 身份和 DWM corner state。已记录的顶部细条问题属于另一现象，不替代这个圆角场景。

显示实测需要可见前台操作，且应使用已确认候选、真实目标显示器和用户选择的媒体；本轮没有执行这些动作。ROADMAP 的 Fullscreen Dynamic Corner Policy 现有 `REPRODUCIBLE / DEFERRED` 记录是本轮整理的既定项目事实；其 DWM 机制仍是嫌疑而非已证实根因。

## Evidence / 限制

当前唯一可直接提出的验收阻碍是未发现可立即使用的隔离 Windows VM/Sandbox 配置，因此四阶段系统生命周期实测本轮无法执行。项目内历史记录证明某个先前候选安装后 payload/profile/DeviceId 保留，并有用户参与的前台窗口播放验收；这些事实绑定各自历史候选，不能替代当前 HEAD 的升级/卸载/重装验证。显示资料同样绑定历史候选和特定场景。

安装/显示只读子任务未执行产品测试、build、package、installer 解包/运行、安装、卸载、启动 Electron、真实 Emby/CD2、真实服务器远控、HDR、多屏或圆角验收。主线程本轮产品与隔离验证另见维护收口报告。报告经主线程复核后整合到项目文档；实际系统与显示验收仍按以上边界记录。

机器可读细节、精确源文件 SHA-256 与阶段状态见[机器证据](evidence/install-display-readiness-027.json)。

Hash 说明：AGENTS.md 与 docs/LESSONS_LEARNED.md 的 SHA-256 是初次读取时记录；审查结束前，共享 worktree 出现主线程并发文档修改（未由本审查写入）。安装器、工具及 profile 相关产品源码的哈希已复核匹配。
