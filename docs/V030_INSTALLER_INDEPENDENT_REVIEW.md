# v0.3.0 安装器独立审查

结论：`INSTALLER_READY_WITH_LIMITATIONS`。当前审查范围没有未关闭的 actionable finding；候选可进入用户安装体验验收。本报告来自独立只读审查工作树；仅新增本报告，不改产品代码，不提交、推送、创建 PR、Tag 或 Release。工程通过不构成 Stable 发布批准。

审查日期：2026-10-11（UTC+8）。Model Tier：Tier 2；范围涉及安装事件、Windows API 和发行证据，保留跨边界判断。未执行真实安装、升级、卸载、重装或前台 UI 验收。

冻结审查来源：`75621cd2406a80b57c9dc2dbfcc5763f1aa40064`，基线 `6eb11b9350889bc4152c22c68bf7e204f3c1bce5`。candidate commit 时主实现工作树 clean；对 baseline 到 candidate 的 18 个 changed paths 核对，无 `src/**`、`native/**`、runtime/toolchain lock 或 package 编译流程变化。后续仅 test/immutable whitespace 属性/验收文档变化，不改变候选构建输入。本审查工作树只新增本报告。

## 问题与修复回读

1. **P2 — 固定语言资源字节与来源声明不一致：已修复**。初始资源被 checkout 转为 CRLF，与“按上游字节原样复制”声明不符。独立回读确认最终 `ChineseSimplified.isl` 为 20,905 bytes、LF、SHA-256 `7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278`，与固定上游原始 bytes 相同；SOURCE 和 SHA256SUMS 同步，`-text` 属性保留。

2. **P2 — 已注册实例的目录不可读/为空时仍跳过旧实例保护：已修复**。独立回读 `installer/EmbyTheaterEnhanced.iss:95` 确认 RegKeyExists 区分全新安装；登记存在但 InstallLocation 读取失败或不满足 IsAbsoluteTargetDir 时返回双语 InstalledRecordInvalid。登记缺失保持允许全新安装。路径函数同时拒绝空、相对路径、非字母 drive、缺 share 的 UNC 及 device namespace。

安装保护与资源来源两项 finding 已关闭。

3. **P2 — 完整回归出现与本次文案相关的失败：已修复并通过最终全量重跑**。冻结 commit 的初始 `full-tests.log` 为 762 tests、761 pass、1 fail。旧 `tests/app-bootstrap.test.cjs:54` 硬编码英文完成页 Description，当前 `{cm:LaunchApp}` 导致匹配失败。后续 test-only diff 已改为精确检查本地化引用、直接 EXE、WorkingDir、nowait/postinstall/runasoriginaluser/skipifsilent 和两种语言的实际文本，未删除或跳过有效断言。主线程报告局部 6/6 PASS；独立 reviewer 已核对实际 diff，并回读最终 `full-tests-final.log`：762 tests、762 pass、fail/cancelled/skipped/todo 均 0，324462.67ms。初始失败日志保留。此修复没有改变候选已消费的构建输入或 installer bytes。

最终测试日志为 70,282 bytes，SHA-256 `60c65b2f7a4423f777e0c928c187c184cd16e3a6793964a25ba3cf4e29457e23`。该 hash 绑定最终测试状态，不能把后续 test/attr/docs commit 重标为本候选的 sourceCommit。全量回归由主线程执行，reviewer 未重跑矩阵。

## 已核对的不变量

- 使用 `PrepareToInstall` 在安装写入前返回错误；`InitializeUninstall` 在卸载初始化返回 False。WMI 查询异常、Null、Empty 与空 ExecutablePath 均拒绝继续。依据是 Inno Setup 官方事件与退出码文档，实际 silent 安装退出及磁盘状态仍待 VM 验收。
- 精确匹配所选目录下的 `Emby.Theater.exe`、`x64/electron/electron.exe`、`electronapp/native-helper/ete-mpv-helper.exe`；已知其他目录实例不会按进程名直接归为目标实例。
- 文件探测固定四个 critical PE，采用 CreateFileW、GENERIC_WRITE、share read/write/delete、OPEN_EXISTING 和即时 CloseHandle。该组合没有新建、截断或 WriteFile 操作。String 对 W API 保持 Unicode；Integer/LongWord 句柄及指针占位只适用于当前锁定的 x86 Setup 执行体，不能迁移为 x64 Setup 而原样保留 ABI 声明。
- `CloseApplications=no`、`RestartApplications=no`；本次脚本没有终止进程、关闭消息、自动回滚或 profile 删除操作。完成页保留 `runasoriginaluser` 与 `skipifsilent`。
- AppId、admin 权限、默认安装目录、快捷方式目标和 runtime 相对布局保持基线；生产 `src/**`、`native/**`、Electron/native toolchain lock 未改。bootstrap/profile/DeviceId 代码未改，版本升级仅改产品版本与 root lock metadata。
- 构建输入 contract 已列入安装主脚本、guard、中文语言、语言许可证、SOURCE 与 SHA256SUMS；正式构建要求 committed HEAD 与物理文本吻合，并将 input/source/runtime/payload 分层绑定。最终独立运行只读 input inspect 并与 built input provenance 比对：39/39 输入，changedInputs 0，sourceCommit 为冻结 candidate；新增 6 项 installer 路径确实进入回执。
- 中文与锁定 Inno 6.7.3 的 Default.isl 键集合独立比对为 296/296，缺失 0、多余 0。冻结 candidate 中 default 英文与中文各 12 个自定义/覆盖键，缺失、多余及 %1/%n 占位符差异均为 0。ErrorCopying/ErrorReplacingExistingFile 的双语恢复提示保留原生后续详细错误；未新增占位符。该检查不代表实际语言选择、字体、排版或所有弹窗视觉验收通过。
- LANGUAGE LICENSE 与固定上游 commit 原始字节 SHA-256 一致：`2e5346868c2a18434489824e11d65c3031620f792fefc415d05f19cd441abf5c`。资源是 Inno 仓库的用户贡献翻译，不能描述为官方维护的中文翻译。
- 主线程 Windows PowerShell 5.1 的非安装 probe 有 12 项 PASS 记录；独立回读 `.work/v030-evidence/guard.log`、11 个 result 文件与 staged fixture 源码，确认空/相对/非法 drive/不完整 UNC 拒绝、absolute 纯语法分类、中文及空格路径、相似前缀 sibling 放行、精确 owned client 阻断、sibling 未关闭和 exe/DLL 锁拒绝（Windows error 32）。staged guard 物理 SHA-256 与冻结源码相同：`2323845849a5f6a16e979bb7023f763ee056ea3fc98d461950f305660f4ebb6a`。probe 在 InitializeSetup 返回 False，且无产品 Files/Registry/Run/Uninstall payload；此证据不覆盖真实 PrepareToInstall、InitializeUninstall、损坏注册记录或实际用户进程生命周期。
- `git diff --check 6eb11b9..75621cd` 的初始结果为非零，诊断只来自原样上游资源的既存尾空格/CRLF；该初始失败保留。最终通过两个 immutable 文件专属 whitespace 属性保留原 bytes，并再次对提交范围执行检查得到 PASS；未用 clean working-tree 的空 diff 替代提交范围检查。

## 合理限制

- WMI ExecutablePath 官方定义带 SeDebugPrivilege qualifier。无法读取任意同名 Electron 进程的路径时，当前合同选择阻塞；这可能影响其他用户/受保护进程存在时的可用性，不能改成未知等于无目标。
- 预检查是时间点观察。WMI 检查与文件复制/删除之间仍可启动客户端；成功的句柄马上关闭，不能锁定整个安装事务。不存在防竞争或自动事务回滚保证。
- 只检查四个 critical PE。其他 payload 的独占锁、仅拒绝 delete 的共享句柄、后续磁盘/权限失败，仍可能发生在安装写入开始后。GENERIC_WRITE 成功不等于整个 payload 可安全替换或卸载。
- 字符串路径比较不解析 8.3、junction、符号链接、重定向与其他别名，也不扫描全部磁盘、其他登记或 portable copy。文件探测提供部分补充，不能声称覆盖未知安装根目录。
- 变更安装目录、低版本覆盖与失败后手动恢复，仍需 VM 验证卸载记录、旧目录残留、快捷方式和 payload。RecoveryAdvice 是操作说明，不能标为已验证恢复能力。
- 守卫拒绝时“程序文件未修改”的范围是进入安装/卸载前的产品文件；Setup 自身临时解包及显式日志不在这个承诺内。

## 候选产物回读

独立回读如下，未重新构建或运行产品安装器。

| 项目 | 实际结果 |
|---|---|
| runtime | `dist/INSTALLER-CANDIDATE-030-75621cd` |
| installer | `EmbyTheaterEnhanced-0.3.0-installer-candidate-75621cd-win-x64-setup.exe` |
| installer bytes | 175,657,242 |
| installer SHA-256 | `4c0f607db268aedaa2c356b1084a202686693ea95a49f2b8a6a7f0fcd9c0cfb6`，与两个 companion 回执相同 |
| source / version | `75621cd2406a80b57c9dc2dbfcc5763f1aa40064` / `0.3.0` |
| runtime manifest SHA-256 | `2186d82741b38731cc9b827d989bc81f54b17f0c89120b48ff0d6b4a62f14635`，与 package receipt 相同 |
| setup PE | machine `0x014c`，x86 Setup；数值四段版本 `0.3.0.0`，字符串 Trim 后 `0.3.0` |
| compiler receipt | Inno `6.7.3`，完整 118-file compiler tree/lock identity一致 |
| input provenance | 39 inputs；安装 script/guard/语言/license/SHA/SOURCE 共 6 项实际列入，中文和许可证原字节 hash 一致 |
| payload | manifest 2,138 entries，加 manifest 本身后 runtime / extracted `{app}` 均为 2,139 files |
| 独立逐文件 SHA-256 | runtime / extracted missing 0、extra 0、mismatch 0；manifest / extracted mismatch 0 |
| 内部语言 | unpacker 列出 `default: English` 与 `chinesesimplified: 简体中文`；compiled metadata AppId/0.3.0/InstalledRecordInvalid 文案符合源码 |

主线程产物回执记录 Chinese LanguageID `0804`、14 个 embedded CustomMessages（7 键 × 2 语言）；独立回读签名状态为 Authenticode `NotSigned`，CompiledCode.bin 为 8,249 bytes。签名状态属于交付的既存限制；当前没有声称安装器具备可信签名或正式发布身份。

container integrity 和解包日志均已回读；unpacker 的 `6.7.0 (Unicode)` 是检测出的 archive format 标识，不替代实际 6.7.3 compiler receipt。语言 extraction 文件是 unpacker stub，不能用其 210-byte 大小误判上游资源缺失，也不能将解包结果当作 UI 验收。

产品 runtime 的 launcher PE 保持 `3.0.20.0`，Electron 为 `44.4.2`，helper 没有 FileVersion 资源，mpv 维持 `v0.41.0-920-gdd5d17d32`。产品/installer 的 0.3.0 metadata 与底层二进制版本分别记录；进程保护按路径，不根据这些底层 FileVersion 推断已运行实例的产品版本。

whitespace 问题已用两个 immutable 上游文件专属属性处理；新增本地属性下 `git diff --check 6eb11b9..75621cd` 和 dirty diff 均通过，资源 bytes 不变。这是后续审计属性修复，未改变本 installer 消费的 input bytes。

产物检查未发现内容或 provenance 不一致，源码、资源、原生合成 guard 和最终工程门禁支持 `INSTALLER_READY_WITH_LIMITATIONS`。真实安装与前台证据仍未执行，当前不批准稳定发布。

真实安装、升级、卸载、重装、运行中 silent 拒绝的磁盘无变化、语言界面、UAC/启动用户、真实 Emby/CD2/远控均 `NOT_EXECUTED`。本报告不会用单元、fixture、编译或解包结果替代这些证据。

## 官方依据

- [Inno Setup event functions](https://jrsoftware.org/ishelp/topic_scriptevents.htm) 与 [Setup exit codes](https://jrsoftware.org/ishelp/topic_setupexitcodes.htm)：PrepareToInstall 非空错误及 InitializeUninstall False 的阻断语义。
- [Inno Setup DLL declarations](https://jrsoftware.org/ishelp/topic_scriptdll.htm)：DLL external 声明及 Windows stdcall；[Setup architecture](https://jrsoftware.org/ishelp/topic_setup_setuparchitecture.htm) 区分 Setup 执行体和目标安装模式。
- [CreateFileW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)：OPEN_EXISTING、sharing 与访问权限；该依据不提供事务保证。
- [Win32_Process](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-process)：ExecutablePath 与 SeDebugPrivilege。
- [CloseApplications](https://jrsoftware.org/ishelp/topic_setup_closeapplications.htm) 与 [RestartApplications](https://jrsoftware.org/ishelp/topic_setup_restartapplications.htm)：保持 no 避免自动关闭/重启行为。
- [固定中文资源](https://raw.githubusercontent.com/jrsoftware/issrc/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/Files/Languages/Unofficial/ChineseSimplified.isl) 与 [固定许可](https://raw.githubusercontent.com/jrsoftware/issrc/4adf37ed7f3fd2bd11c6836ba056e3de170fbabf/license.txt)：下载原始 bytes 到内存，独立计算 SHA-256。
