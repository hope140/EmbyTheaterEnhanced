# v0.3.0 Host / 托管 DLL 材料解阻结果

日期 2026-10-12（UTC+8）。固定 base `72d4688821822860d20342ae8c784a279b06b4f5`，只读候选 `sourceCommit=7827425e07024fcca3bf671aa4401bb3020291b0` / `0.3.0`。本轮 Task Risk/Uncertainty 为 Tier 2，仅收集并核对明确版本材料及 Host 行为；没有产品、安装器、vendor 或依赖变更，没有运行下载代码、重建 Host 或安装测试。机器回执见 [v030-host-unblock.json](evidence/v030-host-unblock.json)，全文与官方获取路径见 [SOURCE_INDEX](redistribution-notices/host/SOURCE_INDEX.md)。最终许可充分性和整个 bundle 的分发决定由主线程复核。

## 本轮实际闭合

1. 从官方 NuGet 再次取得 **MediaBrowser.Common 3.3.10** 和 **ServiceStack.Text 4.5.14**。目标 DLL 与指定成员逐字节 hash EXACT，且与当前 stable-rc 清单相符；Common 同包 Model 不匹配，不能沿用 Common 结论。
2. 取得 ServiceStack 官方 `v4.5.14 → e5819a8de75a8bae64ddc7a64008613067893e32` tag API、完整源码 ZIP、构建/版本 stamping 脚本。**Software 本身的官方版本源码可获取路径已解决**；官方 NuGet EXACT 表明目标 DLL 与官方发行成员无字节差异，无须再要求 Carnival 提供该 DLL 的修改源码。收集并回读完整 ServiceStack copyright / AGPLv3 / FOSS Exception 文本及 GNU AGPLv3 全文，**这一层的许可文本缺口已解决为可交付材料**。
3. 取得并回读固定 Windows Host `708fadc068cbf66ced6aece4a32f3e12bb2c4e13` 完整源码 ZIP 和根 GPLv2 全文。reference source 获取、GPL 文本获取已解决；确认其启动/AppData/argv/native 边界，具体见下文。
4. 两份原始 nuspec 全文包含 Common `Copyright © Emby 2013` 与 ServiceStack `ServiceStack 2017 and contributors`；原文归档与实际交付文本 hash 均写入回执。所有 SHA256 均由实体自动计算，没有手抄或截断。

以上是新取得并实体回读的闭合结果，不是重复引用旧 160 项 readback。新增官方查询/下载 **9/12**（其中 6 个下载实体，含 tag JSON）。4 个归档重新下载的 hash 均与历史固定身份一致。没有重试已不匹配的 SharpCompress/SocketHttpListener NuGet 或不存在 tag。SimpleInjector 的既有完整 MIT notice 结论保持，本轮未重复获取。

## 准确身份

| 目标/材料 | 本轮 SHA256 |
|---|---|
| 目标 Host EXE | `11abf75c8f77ddb0078e7dd62a2eaae60dba244c113bc7893a7e56bc6527163e` |
| 目标 Common / official nupkg member | `8fc955a5215e862f5bde882cedbe2be52e6a242d89d03406844993595d72657f` |
| 目标 ServiceStack / official nupkg net45 member | `2cc4fc93be82d4818dc81beb9f5cd0e4f995c77e1725c129e4918e8aeaeb39c1` |
| 固定 Host 源 ZIP | `7dc15a294137c0a40553282289f4590b7cf75a8f9169dafbe5d08d2fe3a1a884` |
| 固定 ServiceStack 源 ZIP | `97ed2dfa327dc5d2827c373205df551d5fdb595b0ac6e7f925d0c1f118364dd9` |
| ServiceStack copyright / FOSS exception 原文 | `b3b85e98776c6f99a5354363a45b8f5284fef916765a34cbadc6ca5612e149ec` |
| GNU AGPLv3 全文 | `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0` |
| Host GPLv2 全文 | `f371b80469fb235bc500ec29e0e85b682d4a6157a158567d828ff0be544d4f1d` |

ServiceStack 源归档的预置 `lib/net45/ServiceStack.Text.dll` 为 `7c1049eb3de6fcede2e6746a43067a0e17e0b506523f6b6d1fa0ac5a2cd567b8`，与 target DLL 不同。`AssemblyInfo` 初始 4.0.0、nuspec 初始 4.5.0；`build/build.proj` 显式以 Major=4 / Minor=5 / PatchVersion 或 BUILD_NUMBER stamping 版本再打包。这些是构建层观察，不据此否定官方发行 tag 的 preferred source，也不把无 bit-exact rebuild 直接判作源义务失败。固定官方 tag/source、exact NuGet provenance 是 Software 层候选履行依据；源码到字节的可复现实验没有执行。

## 仍 pending 的实际义务

**ServiceStack Host/Additions**：FOSS Exception 列出 GPL 2.0，但要求 Software/Derivative Work 遵守 AGPLv3，独立 Additions 使用列表许可、提供完整源码，并用于 end-user application。独立部分的实际范围、Carnival Host/Model 等受影响代码的 preferred source 与适用许可、对象代码发行所伴随的源码获取安排仍未确认。Software 官方源码与文本已收集，不能替代 Additions 的完整源。没有选择商业路线。

**Common**：官方 3.3.10 nupkg 中没有 LICENSE/COPYING/NOTICE，nuspec 无 licenseUrl/expression。已保存准确版权原文，仍没有据此推导 GPL 或其它再分发许可。需要对应适用 grant，以及在该 grant 要求时取得源码/修改；Model 另需其准确来源。

**Carnival Host**：reference ZIP 不含目标 EXE，当前没有 source/patch 或未修改构建说明绑定到目标 hash。根 GPL 文本不是对包中全部 DLL 的自动授权。最少提供者材料为按目标 hash 出具的“由固定源未修改构建”说明，或完整实际 preferred source、相对固定源 patch、控制编译/安装的脚本及必要接口定义；对应依赖的实际 grant/notice 与必要 source；本次发行的源交付/访问安排。构建日志、精确 SDK/targeting-pack、PDB 可以提高 provenance/复现可信度，**不是普遍必需材料**，也不要求同字节重建作为全部源码义务的先决条件。通常随工具链/系统正常分发组件的例外应按实际许可审查。

**System.Configuration / SharpCompress / SocketHttpListener / Model**：准确来源与许可尚未闭合，copyleft 对应源码义务保持条件化。SharpCompress 与 SocketHttpListener 已从本轮 Host ZIP 自动 hash 验证对应目标 DLL，但 public binary location 不给出 grant；System.Configuration 的版本字段及 csproj 中 `.NETFramework/v4.5` HintPath 不能确定目标 DLL 的发行权。没有下载新的猜测包。

**材料交付**：5 份精确全文/元数据已保存于本仓库的 `docs/redistribution-notices/host/`；当前冻结 runtime 的原 4-file notice contract 未变。本轮没有将它们随 installer 发布，不能把“文本已收集”报成“当前安装包 NOTICE_GAP 已全关闭”。A 路线落地仍需主线程在授权范围内确定来源/源码方案并提供随对象代码的通知与来源路径。

## Host reference 行为与 B 路线可行性

`Emby.Theater.csproj` 是经典 VS15/MSBuild WinExe、目标 .NET Framework 4.6.2。声明 Common3.3.10、ServiceStack4.5.14、SimpleInjector4.0.11；SharpCompress、SocketHttpListener 使用归档 ThirdParty binary。工程包含大量外部 `emby-theater-electron` content-copy 引用及旧 Electron/PPAPI/CEC payload；重建时应固定 candidate 内容集，不能直接让历史 content copy 覆盖当前正式 runtime。当前探测仅确认 dotnet SDK 10.0.302，PATH 无 msbuild/nuget/csc；没有证明 Framework build prerequisites 完整，也没有安装工具或尝试 compile。**静态可行，实际 build compatibility 待实验**。

| 源码观察 | 替代时需要保持或明确决策 |
|---|---|
| `App/ElectronApp.cs` 选 x64/x86 Electron，传 app directory、data/electron、cec-client、mpv 共 4 个引号 argv | 空格路径/位数、当前 main parseCommandLine 与 bootstrap 的参数兼容 |
| `Program.cs` 将 ProgramDataPath 的 ApplicationData 占位符展开并支持相对路径；reference App.config 值为空，现包指定 EmbyTheaterEnhanced | 正式 profile/config 路径、用户文件保留；不能照搬空值回到安装目录 |
| 全局 EmbyTheater mutex 与 5 秒等待；Electron exited 触发 Program.Exit | 单实例、退出/restart/child cleanup；reference StartProcess 未把 local process 赋给 `_process`，不假定 Carnival 二进制的关闭行为与它一致 |
| Host data/device.txt GUID；现 ETE 为 config/device-identity.json | 两层身份分开，正式 HTTP/WebSocket/Session DeviceId 保持 |
| SocketHttpListener 绑定 localhost:8154，提供 fileexists/directoryexists/runatstartup routes；现 filesystem.js 仍消费8154 | 真实消费者、端点与系统启动行为兼容 |
| RunApplication 调用 InstallCecDriver，含 profile cancel/INF 检查、MessageBox 及可能的 VC++/driver installer | 只能在可丢弃环境回归；任何生产行为改变单独评审 |
| reference Host 没有 Native Helper/libmpv owner；生产由 ETE main/native-helper 管理 | APPHOST STARTUP COMMAND CANONICALIZATION 保持，Helper/窗口/全屏/播放/Session 不重写 |

B 路线建议在隔离 candidate 编译 Host，只使用已确认授权/可获取源码的依赖并锁定内容复制输入；在依赖权利缺口仍存在时，重新编译 Host 自身不能自动解阻整个 Host 组。回归需覆盖上述启动/身份/端点/退出/CEC，并补当前 Electron44、Native Helper 生命周期、普通媒体/STRM/Together 及新入口安装/升级验收。此替代 **PROPOSED_NOT_IMPLEMENTED**，没有更换任何生产 binary。

## A/B/C 收口方案

- **A 保留现二进制并补真实材料**。提供者补准确 Host/Additions preferred source/patch 与逐 DLL grant/notice，主线程复核 FOSS 边界及发行源获取安排。Common版权和ServiceStack Software源/许可全文已经可直接复用，不再索取普遍无关的 PDB/bit-exact 证明。
- **B 固定 GPL reference 重建独立候选**。取得实际依赖许可/必要源码后，编译并回归 source-maintained Host；此方案尚未实施，不能据静态可行性称可发版。
- **C 设计可维护启动器及必要本地服务**。若无法取得原 Host source/grant，可另案评估直接 Electron 启动和对8154/单实例/退出/CEC功能的必要替代。先明确产品行为与验收再授权实现；当前没有删除 Host/DLL 或改入口。它不会解决本专项之外的 libmpv/Web/字体/图片权利。

## 验证与用户安装事实

本轮实际执行 archive/source-member SHA256、official tag identity、两份 NuGet EXACT、当前候选9文件对manifest回读、5份许可/metadata全文与原始成员byte-exact、JSON解析/计数、文本敏感边界和 `git diff --check`。准确结果在机器回执 validation；没有重复产品全量测试、runtime启动或安装测试。

最新用户报告“昨天覆盖升级成功，升级后正常启动/使用”按当前任务记录为 **USER_INSTALL_ACCEPTANCE=PASS**，upgrade/start/use=`USER_REPORTED_PASS`。配置保留、DeviceId保留没有确认；本轮未执行卸载/重装，用户也没有报告这两项，不能扩成完整生命周期通过。此事实不替代发行材料判断。
