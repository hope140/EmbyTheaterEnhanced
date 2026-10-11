# v0.3.0 安装器候选验收

最终状态：`INSTALLER_READY_WITH_LIMITATIONS`。实现、离线工程门禁、候选产物与独立审查完成；真实安装生命周期和用户前台体验仍待执行。

用户反馈后的语言默认和目录页改进及新候选身份见 [后续改进报告](V030_INSTALLER_LANGUAGE_LOCATION.md)。下方的首份候选 `75621cd`、default语言名、完整回归与产物身份是原始阶段证据，不能作为新版的编译或前台通过结果。

本轮从远端 main `6eb11b9350889bc4152c22c68bf7e204f3c1bce5` 创建独立 worktree。当前公开测试版仍为 v0.2.9，下一正式版计划为 v0.3.0；本候选仅用于安装体验验收，不是正式发布资产。本轮不创建 Stable Tag 或 Release。

## 安装契约

- Inno Setup 6.7.3 完整工具链锁不变。简体中文文件来自同版本上游 tag，来源、许可、296 项消息键与原始 SHA256 见 [语言资源](../installer/languages/SOURCE.md)。资源在项目中维护，不修改编译器目录。
- 英文内部名保留 `default`，兼容 v0.2.9 的隐式英文安装记录；中文名为 `chinesesimplified`。Windows UI 语言决定首次默认值，始终允许手动选择；升级优先复用先前安装语言。Windows 原生消息框按钮可能继续使用系统语言。
- AppId 保持 `{868314CE-1253-46A3-A4EA-55CDE71BCF0A}`；Inno 复用安装目录、快捷方式和任务偏好。欢迎页列出版本、Windows x64 与正常关闭客户端建议，桌面快捷方式默认可选，完成后以 `runasoriginaluser` 启动且静默安装跳过启动。
- `CloseApplications=no`、`RestartApplications=no` 保持。准备安装时，以 WMI 检查所选目录和已有登记目录内的三个精确进程路径，再以 `CreateFileW` 的 `GENERIC_WRITE / OPEN_EXISTING` 探测四个关键 PE 文件能否替换；仅打开/关闭句柄，不写文件、不结束进程。未知进程路径、查询异常或占用一律阻止写入。卸载前复用同一保护。
- 交互安装在原生准备页显示关闭及重试提示；静默安装返回 Inno 的准备失败码，调用者必须检查退出码与日志。用户在检查后再次启动客户端仍可能引发普通文件复制错误；没有互斥协议或自动回滚保证。原生错误保留，准备页另给同目录重试/可信旧安装包恢复建议。
- 不新增用户文件操作。登录、STRM/CD2、播放器设置、DeviceId 与个人 mpv 配置继续按既有保留政策处理；卸载确认和成功提示明确个人配置保留。ProgramDataPath 及 profile bootstrap 源码不变。
- UAC/admin 安装和 x64 约定保持，不绕过系统策略。`runasoriginaluser` 依赖正常交互提权链；若操作者直接以管理员账户启动安装器，Inno 无法保证恢复另一个普通用户身份，该场景须单独人工检查。

## 分层结果

产物 sourceCommit 为 `75621cd2406a80b57c9dc2dbfcc5763f1aa40064`。候选文件为 `EmbyTheaterEnhanced-0.3.0-installer-candidate-75621cd-win-x64-setup.exe`，175657242 bytes，SHA256 `4c0f607db268aedaa2c356b1084a202686693ea95a49f2b8a6a7f0fcd9c0cfb6`。同名 `.sha256` 和 `.provenance.json` 已交付并核对；复制后重算哈希相同。安装器 PE 版本为 0.3.0 / numeric 0.3.0.0，Authenticode=`NotSigned`。Inno Setup loader 为 x86，目标和载荷为 Windows x64；unpacker 报告的 6.7.0 是容器格式，不替代固定编译器 6.7.3 的完整身份。

build manifest SHA256 `2186d82741b38731cc9b827d989bc81f54b17f0c89120b48ff0d6b4a62f14635`，39 个构建输入与4份通知绑定固定 commit。语言 `.isl` 为20905 bytes / LF / strict UTF-8 / SHA256 `7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278`，与固定上游 Git blob 原始字节完全相同。独立审查发现的检出 CRLF 转换已修正，不沿用错误的原始字节声明。

最终包实际解出 `default`/`chinesesimplified`，简体中文 LanguageID=$0804，14条自定义消息从解包脚本逐行匹配源码。unpacker 的内建语言 `.isl` 是 LangOptions stub，不能以它重建或声称逐条回读全部原生页面文案；296/296键与占位符完整性来自受控源文件，实际页面仍未执行。编译、包内语言及源身份共同确认受控资源进入候选。

全部 runtime 2139文件（2138 payload + manifest）解包哈希一致，missing/extra/mismatch均0；package在编译前后验证通过。与 v0.2.9 的 runtime 文件集合一致，仅 `electronapp/package.json` 和五份版本/来源元数据变化；PlaybackManager、Session、Resolver、Native源码与二进制、mpv配置及其它产品文件字节保持一致。本轮没有重新宣称实服播放验收。

本轮没有确认可用的独立 Windows VM，禁止在日常客户端上执行安装/卸载。编译和合成 guard 探针不会替代安装生命周期。

| 证据层 | 本轮要求与状态 |
|---|---|
| 源码及资源 | 固定Inno编译、Unicode/296键、双语占位符、39输入来源、完整回归762/762与独立审查 `PASS` |
| 候选产物 | 锁定构建、provenance、版本、包内语言、容器、2139文件及复制后hash `PASS` |
| 合成 Windows guard | PS5.1执行11次探针、12项断言 `PASS`，无 Files/Registry/Run；仅测合成进程和文件占用 |
| 全新安装 / v0.2.9 升级 / 卸载 / 重装 | `NOT_EXECUTED` |
| 实际中文/英文页面、DPI、文字截断、中文安装目录、UAC、普通用户启动 | `NOT_EXECUTED` |
| 用户前台安装体验与最终发布批准 | `PENDING_USER_ACCEPTANCE` |

## 工程检查与审查

首次完整离线回归90个发现文件加显式PLAY-01探针，762项中761通过/1失败，无取消/跳过。唯一失败为 `tests/app-bootstrap.test.cjs` 写死旧英文启动Description；随后局部更新为 `{cm:LaunchApp}`，同时严格核对两个实际语言文本、直接EXE入口、工作目录及 `nowait postinstall skipifsilent runasoriginaluser`，相关6/6通过。修正后的最终完整回归为762/762，fail/cancel/skip/todo均0，exit0，324462.67ms。只有这次必要的测试修正触发重跑，旧失败日志保留，没有为了增加计数重复成功矩阵。

JS225、PS5.1/7各27与有限凭据扫描275文件通过；生产/Native/工具链锁diff为0。全分支diff检查发现上游资源原尾空格/CRLF，使用仅两受控原始文件的whitespace属性处理，源字节与SHA不变，其余diff检查保持。

合成 guard 在中文空格目录内检出自己创建的 `Emby.Theater.exe`，同名前缀外的自建 `electron.exe` 仍存活；锁定EXE/DLL阻止写入；空/相对/无效盘符/缺share UNC均拒绝。有效盘符和UNC仅做语法布尔判断，不访问网络路径。探针编译复制的guard与固定源码逐字节核对，测试清理只结束自建精确PID。它不证明正式安装器的UAC、Preparing事件/静默退出码、卸载事件或注册表在真实系统中已经验收。

已知边界为检查后再次启动客户端的竞态、非关键文件由Inno原生复制错误处理、WMI无法读取的同名其它进程会保守阻止、显式管理员启动的原用户身份限制。系统正在运行的实例、快捷方式/登记和设置/DeviceId保留必须按下一节实际验收，不以脚本推断PASS。

原始日志保留在工作树 `.work/v030-evidence/`，合成探针在 `.work/installer-guard-probe-9928bf98339e476c8952ca8ad5a2e099/`，解包在 `.work/v030-extracted-75621cd/`。匿名摘要见 [机器证据](evidence/v030-installer-candidate.json)，独立评审见 [审查报告](V030_INSTALLER_INDEPENDENT_REVIEW.md)。后续仅测试/属性/文档提交不改标候选sourceCommit；39个构建输入及全部产品字节继续与候选一致，不为文档收尾重建或重新签发产物。

## 整合与交付

实现分支为 `codex/v030-installer`，交付包含EXE、SHA256、package provenance与README。候选内部验收完成，等待用户在独立Windows环境检查新的安装体验；后续正式Stable发布属于下一任务。工程门禁后提交Draft PR供审阅，不自动合并，不创建v0.3.0 Tag或Release。公开v0.2.9的Tag对象、产品commit、Release409622572及三个asset的ID/size/digest/时间戳末端回读保持不变。

## 用户验收入口

使用 [安装生命周期卡](INSTALLER_LIFECYCLE_CARD.md)，在可恢复快照的独立 Windows 环境执行。升级基线必须是准确 v0.2.9 安装包，文件 175650591 bytes，SHA256 `2f4fa378eb75f91f21a5163d4cdb01244621d6bb8144a12c84b81ee419c914a0`，sourceCommit `084554e07782ca6461b7ed67cadd298a92450b24`。

先选择中文，再选择英文，检查欢迎/目录/任务/准备/完成/卸载各原生页面。首次默认语言需分别在中文和英文 Windows 核查；升级/重装检查语言偏好复用。使用含中文和空格的安装目录，分别在常规及高 DPI 下检查布局。

建立无凭据配置 canary 和 DeviceId 文件 hash，检查覆盖升级、卸载、重装后的保留关系。运行客户端时安装与静默安装都应在写文件前失败；正常退出后可重试。快捷方式、卸载登记、单一安装记录和普通用户启动身份需要实际回读，不从脚本推断通过。静默失败应保留 `/LOG` 并检查非零退出码，切勿使用强制关闭参数。失败后恢复 VM 快照，不把同目录重装视为已实现的自动回滚。
