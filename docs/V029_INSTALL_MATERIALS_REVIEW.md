# v0.2.9 安装生命周期与第三方材料审核

日期：2026-10-11（UTC+8）。静态审核基线为 `9774b73469dea9a3651f03737153c872947223ee`，版本更新、最终构建、解包与发布回读由 [综合收尾报告](V029_MAINTENANCE_CLOSEOUT.md) 记录。本页不把历史安装、材料签名、重建或播放 PASS 改为本轮新验收。

风险/范围：Tier 1；安装/发行证据不确定性中等；只读审核与独立报告，Playback/Session impact 无。没有修改源码、vendor、第三方二进制、现用客户端、系统功能或用户 profile。

## 结论矩阵

| 事项 | 本轮状态 | 实际边界 |
|---|---|---|
| 安装器、profile、DeviceId 静态合同 | COMPLETED / STATIC_VERIFIED | 核对当前源码及与 v0.2.8 的 Git blob 身份 |
| 四阶段工具与验收准备 | COMPLETED | 两份现有测试文件实际 3/3，通过且 fail/skip/cancel 为 0；只使用合成临时目录 |
| 全新安装、升级、卸载、重装 | EVIDENCE_GATED / REAL_INSTALL_NOT_EXECUTED | 未发现可直接使用的独立 Windows 测试系统；未在现用系统执行 |
| 随包第三方组件与通知合同 | COMPLETED / STATIC_VERIFIED | 当前冻结输入与 v0.2.8 相同；最终 runtime/安装包文件集合须由发布门禁另行实测 |
| 对应源码、组件通知与构建材料 | WAITING_EXTERNAL | 原缺口逐项保留；不表示分发许可已经闭合 |
| 新增高风险发行问题 | 本轮范围内未发现 | 仅表示未发现相对 v0.2.8 新增的组件/材料问题，不是合规认证 |

## 隔离环境与安装执行边界

2026-10-11 18:39（UTC+8）只读探测：Windows Sandbox feature 为 Disabled，Sandbox executable 不存在；Hyper-V feature 为 Disabled；VMMS service、Get-VM、VBoxManage、vmrun 不可用；可管理 VM 数量 unavailable。`HypervisorPresent=true` 只说明系统报告 hypervisor 存在，不能证明存在可使用、已授权且可恢复快照的 Windows VM。

没有启用 Hyper-V、Sandbox、WSL 或其它系统功能，没有运行安装器、卸载器或现用客户端。因此四阶段均为 `REAL_INSTALL_NOT_EXECUTED`；UAC、Program Files ACL、快捷方式实际启动、卸载登记、系统服务/计划任务及进程残留的系统实测仍未覆盖。

安装器的固定 AppId、x64/admin 目标、递归复制 runtime、`ignoreversion`/`notimestamp`、快捷方式和安装后启动入口已读取。开始菜单、可选桌面快捷方式及安装后 Launch 均指向 `{app}/Emby.Theater.exe`。`CloseApplications=no`、`RestartApplications=no`，验收前必须正常退出被测实例。没有项目自定义 `[UninstallDelete]`、服务注册、计划任务或 profile 迁移/删除步骤。

bootstrap 只在独立 Enhanced profile 中创建缺失的 `config/system.xml` 与 `cec-driver/cancel`；现有文件不覆盖。合法 DeviceId 在 `config/device-identity.json` 中复用，缺失/损坏时原子重建。Native Helper service 是 Electron 持有的子进程管理模块，从固定 runtime 相对路径调用 helper，并非 Windows service 安装入口。携带 USB-CEC driver installer 与自动执行驱动安装是不同事实；本轮未运行它。

按上述静态实现预期，覆盖安装保留 profile，卸载保留 profile/DeviceId，重装复用有效 identity。该预期未以本次版本系统操作验证。递归复制不证明升级时所有旧版孤立文件均已消除，旧文件/缓存/注册表/快捷方式/owned process 与非预期服务或计划任务必须在真实隔离环境检查。

## 可执行的四阶段验收准备

沿用 [安装验收卡](INSTALLER_LIFECYCLE_CARD.md)，其中 v0.2.2 升级基线是历史卡的默认场景。本轮后续实际执行应使用重新核验的 v0.2.8 → v0.2.9，以覆盖用户当前测试版升级路径；正式版 v0.2.2 → v0.2.9 可作为额外兼容性场景。旧 `tools/test-installer.ps1` 固定 0.1.0 → 0.1.1，不作为当前四阶段入口。

| 阶段 | 独立系统内的验收要求 | 当前结果 |
|---|---|---|
| 全新安装 | 无 ETE/profile 的可恢复快照；固定 installer/sourceCommit/SHA256；核对 payload、快捷方式、卸载登记、首次配置与新 DeviceId、启动关闭 | REAL_INSTALL_NOT_EXECUTED |
| 升级 | v0.2.8 安装快照与合成无凭据 canary；旧实例正常退出；覆盖 v0.2.9；核对全部 payload、旧文件、配置 canary/DeviceId hash、快捷方式与登记 | REAL_INSTALL_NOT_EXECUTED |
| 卸载 | 使用该实例正式 uninstaller；核对程序文件/快捷方式/登记清除、profile 与 DeviceId 按政策保留、owned 进程和服务/计划任务差异 | REAL_INSTALL_NOT_EXECUTED |
| 重装 | 卸载后快照安装同一 v0.2.9；核对 payload、单一 profile、canary/DeviceId 复用及正常关闭 | REAL_INSTALL_NOT_EXECUTED |

每阶段失败恢复对应 VM 快照；不要用真实用户凭据、媒体或配置。现有 `installer-lifecycle-snapshot.cjs` 只接受显式隔离目录、拒绝链接与输出覆盖，生成数量/树 hash/DeviceId 文件 hash，不记录原路径或 identity 内容。它继续将 lifecycleAcceptance 写为 NOT_EXECUTED，快捷方式/注册表/进程写 UNKNOWN；采集成功不等于真实安装验收。profile 整树 hash 可能因日志缓存变化，设置 canary 和 DeviceId 应独立核对。

## 输入与材料状态

本轮逐项比较 `v0.2.8` 与审核基线：四份 vendor manifest、`tools/build-toolchains.lock.json`、安装器、bootstrap 与 DeviceId 文件的 Git blob 全部相同。没有修改锁定 DLL、Electron 或 vendor。当前运行依赖声明为 `@grpc/grpc-js 1.14.6`、`@grpc/proto-loader 0.8.1`；版本更新不能修改其锁定依赖闭包。

| 组件 | 已有精确来源/通知证据 | 本轮保留的缺口 |
|---|---|---|
| 维护源码与 Native Helper | 最终 Git sourceCommit、项目 GPL-2.0-only 文本；helper C++ 源码、固定 header 与工具链合同 | 第三方材料不由项目 GPL 声明统一覆盖 |
| Electron 44.4.2 x64 | 固定官方 archive、73-file tree；随包 LICENSE 与 LICENSES.chromium.html | 未从源码重建 Electron/Chromium/依赖；历史 Electron 18 与 Pepper 仅保留为归档输入，不进入生产 runtime |
| npm 生产依赖 | 锁文件 33-package 选择与 fresh npm 完整目录/通知合同；七个 Carnival 包另列 | 包级许可仍逐组件适用；继承包导入/修改历史不能由版本字段替代 |
| Carnival 七个 Node 包 | 原 registry tarballs 和 SRI 的历史审核；七份许可文本的历史随包对应 | package metadata、缺失 README 与 power-off 代码差异；本轮未重新下载 tarballs 或复验 SRI |
| Windows Host 与支撑 DLL | 固定 Carnival hash；Windows Host 公共参考源；Common 3.3.10、ServiceStack.Text 4.5.14、SimpleInjector 4.0.11 三项 NuGet DLL 的历史 EXACT | Host EXE 精确源码/构建关系；Model、SharpCompress、SocketHttpListener、System.Configuration 的精确输入及版本对应通知仍 WAITING_EXTERNAL |
| CEC、driver、RefreshRate | 八个固定 Host 参考 archive 内 binary 的历史对应；版本化参考源码 | 精确 source/build/工具链及完整通知；libCEC 源码不自动涵盖 driver installer |
| patched libmpv | 原 dev archive 与 DLL 的历史 EXACT；固定 mpv/FFmpeg 源码参考；本轮重新读到公开 archive checksum | 准确 winbuild/workflow、所有依赖 revision/patch/config/toolchain、完整通知与对应源码仍 WAITING_EXTERNAL |
| 离线 Web/字体/图片 | 冻结 Carnival Web 761 路径、23 字体、19 图片的历史输入盘点 | 精确 Web revision、依赖锁、overlay/import 关系、逐资产来源/通知仍 WAITING_EXTERNAL；输入计数不等于最终 payload 计数 |
| 本地构建工具 | Inno 6.7.3、InnoUnp 2.67、完整 UCRT64 锁；17 原包/签名、6,990-file prefix 和 12 个准确 recipe 的历史证据 | 本轮未重验签名或重建第三方工具；三个剩余 MSYS2 recipe、完整 source/bootstrap 材料继续 WAITING_EXTERNAL |

本轮回读 [ServiceStack.Text 固定源码许可](https://github.com/ServiceStack/ServiceStack.Text/blob/e5819a8de75a8bae64ddc7a64008613067893e32/license.txt)，文本确有 AGPL-3.0、FOSS License Exception 与商业许可入口。仅记录准确来源，不选择当前 binary 的实际许可路线，也不推断兼容性。

本轮回读 [libmpv 原 dev archive 的公开记录](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download)，其 SHA256 为 `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`，与既有材料声明一致。该值是 archive hash；锁定 DLL hash 为 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，双方 DLL 字节对应沿用原材料审核，并非本轮重新下载/解包结果。[固定 mpv Copyright](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/Copyright) 区分默认 GPL、条件 LGPL 构建及链接依赖，不能用 API header 或项目根 LICENSE 推断 DLL 完整许可组成。[Inno 6.7.3 官方发布入口](https://github.com/jrsoftware/issrc/releases/tag/is-6_7_3) 本轮可读；工具二进制 hash 身份由本地锁和发布构建门禁验证。

原 [材料审计](THIRD_PARTY_MATERIALS_AUDIT.md)、[材料索取清单](THIRD_PARTY_MATERIALS_REQUEST.md)、[027 有界材料收尾](THIRD_PARTY_MATERIALS_CLOSEOUT_027.md) 和 [构建输入审计](BUILD_INPUT_AUDIT.md) 保留各自日期/sourceCommit。160 项实体 readback、签名和 recipe 关系仍属于原记录，本轮没有把它们改写为新的 PASS，也未向提供者发送请求。缺少准确关系的材料不因测试版既往发布而闭合。

## 发布材料门禁与实际验证

现有合同把 `LICENSE`、`THIRD_PARTY_NOTICES.md`、`docs/LICENSING.md`、`docs/SOURCE_MATERIALS.md` 四份通知按最终 sourceCommit 的 Git blob 随包；`build-input-provenance.json` 绑定其身份，package 校验后才允许编译。新审核报告和研究材料保持 repository-only，不扩大生产文件集合。

最终发布构建仍必须确认四份通知实际存在且 hash 对应最终提交、Electron 两份通知存在、npm notices 保留、helper/libmpv 在固定路径、退役 Pepper 缺席；安装器解包后再核对完整 path/hash 集合。构建/解包验证与真实安装验收分开记录。若最终文件集合引入无法解释的第三方组件或通知丢失，应作为 RELEASE_BLOCKER 返回主线程，不能凭此静态报告放行。

本轮实际运行 `node --test tests/installer-lifecycle-snapshot.test.cjs tests/installer-output-name.test.cjs`：3 PASS、0 FAIL、0 SKIP、0 CANCEL。原始输出在本轮忽略的 `.work/v029-materials/installer-preparation-tests.tap`。仅验证合成四阶段快照、保密投影、覆盖拒绝与候选文件名合同。报告完成后执行 `git diff --check` 与有限相对链接/敏感路径检查；最终 runtime、安装器版本/来源、CI 和三个公开附件的实测结果由综合收尾报告单列。

后续仅在安全隔离环境可用或精确材料到达时继续对应验收。没有新的明确高风险分发问题时，原材料 WAITING_EXTERNAL 与系统安装未执行按本轮授权保留为测试版真实边界；正式稳定版仍需单独收口安装/设备验收与发行材料审查。

## 候选 runtime 实体核对

后续对 `dist/CANDIDATE-029-0bac2e8` 实体进行只读核对，来源为 `0bac2e8b2294fb4011bb3f2cef0c48624a35a570`、版本 0.2.9。此节仅属于候选 runtime，不能替代最终 main 构建、安装器、公开附件或真实系统安装结论；没有重复运行前述工具测试。

- 实际读取全部 2,138 payload 文件的 SHA256，并核对完整目录集合；连同 manifest 共 2,139 文件，missing/extra/hash mismatch 均为 0。source、dependency 和 Native Helper provenance 的 sourceCommit 均为该候选提交。
- 四份项目通知与该 sourceCommit 的原始 Git blob 字节完全相同。实际 SHA256 为 LICENSE `2bdb13b91b9440dcfdf51b2f72e04e566c92eb50d48350ada10b30a1d37c3c05`、THIRD_PARTY_NOTICES `b0553d7741f08209087418d66204f509850fa0b6fd39e330b4679cb52cbe6bde`、LICENSING `fa4a35b0847579137ea063840e22581ee6dbde579eefdfc8e491c89303393564`、SOURCE_MATERIALS `cc4b71ec41454b8d26ec24926b74868e1c59f299efdcbfc46edc02ffe6933396`。
- 与 v0.2.8 / `888310de8ebae941b407ae070102b84d4fec1e5e` 的发布 runtime manifest 对比，路径集合没有新增或删除；全部 23 个 EXE/DLL/NODE 分类文件的实际 hash 与旧 manifest 相同。差异仅为项目 LICENSING、diagnostics、libmpv 插件、产品 package 元数据及五份来源/依赖记录，不引入新第三方 binary 或资产。
- Electron 全树实际 73 文件，LICENSE 与 LICENSES.chromium.html 存在；electron.exe 为锁定 `0446040f3c63eb75d5b1e1663d5ef27f07730a82df3e4fa47ff77c1a33cef07c`，全部 Electron 文件 hash 与旧发布 manifest 相同。固定 libmpv 实际 hash 为 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`；Native Helper 存在，退役 Pepper 不存在。
- npm selected 33-package identity（版本/integrity）与七个 retained Carnival package identity 均与 v0.2.8 完全相同；selected 1,142 文件 + retained 29 文件 = combined 1,171 文件。整个 npm 文件集没有字节变化，包含其随包 notices；grpc-js/proto-loader 两份 LICENSE 存在。

上述候选实体核对未发现相对 v0.2.8 新增的第三方材料风险；原 WAITING_EXTERNAL 缺口保持。原始有限记录为忽略的 `.work/v029-materials/candidate-runtime-materials.json`；它只保存相对路径、身份和结果，不作为新的构建信任根或许可认证。最终 main runtime 与安装器结论由综合收尾报告另行记录。

## 最终 main runtime 材料核对

最终正式构建 `dist/RELEASE-029-084554e` 的产品来源为 `084554e07782ca6461b7ed67cadd298a92450b24`、版本 0.2.9。本轮追加只读实体核对，没有重跑旧工具测试、运行安装器或修改通知本体。

- 34 项输入的 path/Git blob/hash 记录与候选 `0bac2e8` 完全相同；四份项目通知的实体 SHA256 均保持上节值，逐份等于最终 sourceCommit 原始 Git blob。
- 最终 manifest 仍列 2,138 payload 文件，path 集合相对候选没有增加或删除。最终与候选的 payload hash 差异仅为五份来源/依赖记录；产品源码和第三方文件的声明 hash 不变。
- 实际重新读取 23 个 EXE/DLL/NODE 分类文件、Electron + npm 两树合计 1,244 个文件的 SHA256，均与候选及最终 manifest 相同。此 1,244 文件为 Electron 73 + npm 1,171，包括其随包 notices；没有新增第三方组件或通知缺失。
- 五份来源/依赖记录的 sourceCommit 均指向最终 `084554e`；原始有限记录保存在忽略的 `.work/v029-materials/final-runtime-materials.json`。

最终 main runtime 材料核对未发现新增风险。安装器正在由主线程独立打包，其版本、解包完整集合和三个附件回读应以综合收尾报告及实际 installer verification 为准。主线程八组隐藏运行矩阵属于 `ISOLATED_RUNTIME`；它们不构成系统安装四阶段的证据，`REAL_INSTALL_NOT_EXECUTED` 与原材料 `WAITING_EXTERNAL` 均保持。

## 最终安装器解包材料回读

主线程随后完成标准安装器及解包验证。本审查回读 `.work/v029-release/installer-verification.json`：来源 `084554e07782ca6461b7ed67cadd298a92450b24`、版本 0.2.9、expected/actual 均为 2,139 文件，missing/extra/mismatch 均为 0、failures 为空。该完整文件集合/哈希结果归属主线程执行，本审查未重复全量哈希。PE 记录实际 product/file 字符串为 0.2.9，四段 numeric product/file version 为 0.2.9.0。

标准安装器 `EmbyTheaterEnhanced-0.2.9-win-x64-setup.exe` 为 175,650,591 bytes，记录 SHA256 `2f4fa378eb75f91f21a5163d4cdb01244621d6bb8144a12c84b81ee419c914a0`；安装器自身 identity 与附件下载回读由主线程发布门禁另外确认。

本审查独立读取 `.work/v029-release/unpack-final/{app}` 内四份项目通知的实际字节，四份 SHA256 均与上节值相同，并分别等于最终提交的原始 Git blob 及最终 runtime 文件。没有发现通知丢失、替换或新增材料风险。此结论为 `INSTALLER_EXTRACTION`；未执行安装器安装/卸载操作，系统四阶段仍为 `REAL_INSTALL_NOT_EXECUTED`，第三方对应源码/许可材料仍为 `WAITING_EXTERNAL`。
