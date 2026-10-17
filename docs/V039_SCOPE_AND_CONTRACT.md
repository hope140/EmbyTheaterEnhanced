# v0.3.9 安装生命周期范围与合同

## 发行后的当前状态

[v0.3.9 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.9) 已公开，产品source `06d34a712e26e0d6d0b299b487cfd68625df71ed`。新增H7一次038→039升级及安装后父实际复核通过，当前安装039，994项资料与双入口保持、应用启动0；五附件匿名全字节核验及旧Release/Latest031保持已完成，见[发行核验](V039_RELEASE_VERIFICATION.md)。以下036↔038合同及停点是保留的阶段历史，不能作为当前安装版本或待审批状态。

用户随后明确“那就发布吧，发布后准备后续版本内容”，已授权真实0.3.9安装升级验证Pre-release，覆盖本文件原先无功能改动不发039的收口选择。原有界主机矩阵父最终已通过，后续版本元数据、准确main新构建/包体门禁、一次038→039升级、五附件发布回读和发布后的有限规划按[发行合同](V039_RELEASE_CONTRACT.md)执行。下文原产品038、父待核及旧允许文件表属于安装验收阶段记录，不限制这次新增发行授权。

## 当前状态与准确基线

2026-10-17，准备合同 `a8670819262273720d8846c192fd1215f7a9fbfb` 已获父实际审核通过。用户随后明确允许本机ETE安装验证，guest前提撤销，父已核准精确H0–H6、窄私有修正及固定Inno6.7.3两项延后残留分类。当前有界主机矩阵完成，H6恢复可信038，完整资料和原036备份保持，最终证据待父复核；未覆盖项不提升。最新状态见[本机验收合同](V039_HOST_ACCEPTANCE_CONTRACT.md)，不再等待VM或重复普通用户许可。原[环境交接](V039_MANUAL_ENVIRONMENT_HANDOFF.md)保留为历史准备路线。

准确main/docs基线为 `a1b2a04d21c023062934351f29868e9c1c908b7a`，已发布038产品source/Tag为 `0bbc504fbb6ca98dfb7476e8078c4483347b4375` / `v0.3.8`，分支 `codex/v039-install-lifecycle`。本轮尚无确认产品缺陷，产品版本保持0.3.8，不生成或重命名039候选。旧Settings工作区、038发行树、全部旧包/profile/Tag/Release保持。

Task Risk中、Uncertainty中（仅覆盖下述有界主机矩阵）、Cross-module Scope为安装/资料保留/交付工具、Playback/Session Impact为NONE。主线程Tier 2保留数据与系统边界判断；GPT-6 Luna High worker盘点和静态复核私有脚本/证据，未自主实施产品或系统变更。

## 已确认事实与Observed/Expected

| 项目 | Observed | Expected / 结论 |
| --- | --- | --- |
| 安装身份与目录 | 固定AppId；默认 `{autopf}\Emby Theater Enhanced`；admin权限；沿用已有目录并开放目录页 | 保留当前身份、权限和目录语义，不从声明推断UAC/普通用户已通过 |
| 复制与启动 | 完整runtime复制到 `{app}`；快捷方式直指Host；静默安装跳过末尾应用启动 | 标准安装器继续完整payload门禁；不运行现用客户端或以隐藏窗口冒充安装隔离 |
| 升级与换目录 | 原PrepareToInstall检查新目标及登记的旧目录，登记无效失败关闭 | 核新旧目录、文件、登记与资料前后状态；不假定旧目录会自动清理 |
| 降级 | 无版本比较；原包的 `ignoreversion` 与同AppId流程保持 | 沿原允许行为测试，不新增禁止降级；完整兼容结果仍未验证 |
| profile/config | profile独立于程序目录；system.xml及CEC cancel仅缺失时创建 | 有效既有资料应保留；登录/连接的真实存储和用户归属需要系统证据，合成canary不证明真实登录保留 |
| DeviceId | 有效UUID v4复用；缺失/损坏按原逻辑重建 | 有效身份前后不变；不能把原有损坏重建行为改成保留无效身份 |
| 忙碌、权限与恢复 | guard检查目标进程和关键文件句柄；未知进程信息失败关闭；不自动杀进程；文案明确不提供自动回滚 | 区分guard前阻断、复制中失败和取消；记录部分文件状态及人工恢复结果，不承诺自动还原 |
| 真正缺口 | 同目录升级/降级/有界卸载重装及文件锁拒绝已有主机实测；UAC/取消/空资料启动等未测 | 只报告实际覆盖；原私有验收假设失败不自动判产品缺陷 |

依据为 `installer/EmbyTheaterEnhanced.iss`、`installer/installer-guard.iss`、`src/electronapp/enhanced/bootstrap.js`、`src/electronapp/device-identity.js`、相关安装/快照测试与工具。当前读取范围内未发现确定源码矛盾。

## 复用证据与本轮新增准备

夜间C包15项静态/隔离结果和D包有限资源结论见[夜间审核](OVERNIGHT_REVIEW_REPORT_20261016.md)。主线程核对12项安装/profile/DeviceId相关文件，Git blob从night `5341f32985aabefa03f789b1428d8dfa2be5ba06` 到本基线完全相同，因此复用其原有范围，不重跑或重标为039系统PASS。D包中未知手工/外部消费者继续UNKNOWN。

[038发行核验](V038_RELEASE_VERIFICATION.md)的2159 payload/2160完整runtime、标准安装器解包逐路径/逐SHA、来源/input/runtime闭合及五附件全量回读是既有交付门禁。本轮不把它们当新增安装生命周期功能，也不重新包装旧包作为039修复。

准备阶段新增3套项目内合成资料，覆盖空目标、模拟默认目录及自选中文/空格目录；既有资料含system.xml、有效合成DeviceId、CEC cancel和二进制保留canary。已用原只读收集器保存BEFORE快照，重新核对收集前后输入字节不变。占位EXE/DLL是不可执行文本，不是runtime；该准备阶段installer/app运行数均0，没有伪造AFTER或升级/卸载PASS。随后真实HOST证据单独保存，不回填合成快照。

## 生命周期矩阵

下列区分当前主机子场景实测与未覆盖前提；本机矩阵只针对已核APP及保留PROFILE，不推广为全部14项通过。每次操作使用新回执，不覆盖合成准备或失败attempt。

| ID | 场景与前置 | 必须回读 | 当前层次 / 剩余 |
| --- | --- | --- | --- |
| I01 | 空目标、模拟默认目录 | 准确payload、登记、快捷方式、首次资料/身份 | BEFORE准备；真实安装未执行 |
| I02 | 自选目录含中文/空格 | 实际落点、参数、快捷方式及启动归属 | 路径资料已备；真实复制/UAC未测 |
| I03 | 同目录覆盖及升级，旧客户端正常退出 | 程序树更新；config/有效DeviceId/CEC与用户资料字节保留 | H2/H4包体及全部资料保持PASS；前置无所属客户端，不冒充正常关闭交互 |
| I04 | 登记目录A、选择目录B | 两目标guard、登记迁移、A/B实际剩余；未知保留而不假定清理 | 静态合同；系统未测 |
| I05 | 可信较旧包覆盖较新包 | 原允许行为、程序版本/完整集合、资料身份和恢复步骤 | H3声明包体/来源/全部资料保持PASS，H4返回038；不含跨版本应用运行兼容 |
| I06 | 正常退出后卸载 | 程序/快捷方式/登记变化，profile/config/有效DeviceId保持；卸载所属清理完成 | H5有界子场景PASS，root/clone实读0及声明文件/登记/shortcut移除、资料保持；两项精确Inno延后残留已父核；关闭交互未执行 |
| I07 | 卸载后重装 | 原资料和有效DeviceId复用；缺失/损坏身份按既有规则处理 | H6保留有效资料文件重装PASS；未启动应用，不扩成身份运行复用/缺失损坏重建验收 |
| I08 | 专用标准用户、测试管理员，接受提升 | 安装权限、原用户profile及快捷方式归属 | 需专用账户/UAC环境；未执行 |
| I09 | 拒绝UAC | 是否真正创建Setup进程、launcher错误、程序/资料不变 | 不把UAC拒绝硬记为Setup取消码；未执行 |
| I10 | 目标Host/Electron/Helper占用或关键PE文件锁 | 原guard阻断、不强关、不写目标；旧程序和资料前后状态 | H1_A2只读Host句柄共享冲突拒绝PASS/实际exit7；真实运行实例占用子场景未执行 |
| I11 | 目标ACL拒绝 | 区分关键文件guard拒绝和复制阶段失败；记录实际退出/部分目录状态 | 不改宿主ACL；专用系统未测 |
| I12 | 向导前取消、复制中取消 | 对应退出码、程序部分状态、资料保留和取消后所属进程 | 交互条件未建立；不以强杀替代用户取消 |
| I13 | 受控复制失败及恢复 | 实际失败点、日志、部分文件状态；同目录重试/旧可信包恢复 | 故障注入需单独父审；不承诺自动回滚 |
| I14 | 静默安装/卸载 | 实际exitCode、payload/登记/快捷方式/资料、无末尾应用启动及清理完成 | H1_A2/H2–H6有界静默子场景PASS，H5精确两项延后残留已父核；app0，不宣称TEMP文件零 |

版本对、准确安装器SHA、账户、目标目录、故障注入点及必要矩阵由具体环境合同固定。现有 `tools/test-installer.ps1` 仍是历史0.1.0/0.1.1真实系统脚本，不直接拿来运行039；其显式授权、已有登记/profile/快捷方式拒绝等护栏保留。

## 收集、退出码与完成判定

准备阶段沿用只读 `tools/installer-lifecycle-snapshot.cjs`；输出必须在被观察目录之外、显式绝对路径且拒绝重解析链接、已占用回执。其 `--isolated-environment` 是路径确认，不是Windows guest隔离证明；`STATIC_VERIFIED` 和 `lifecycleAcceptance=NOT_EXECUTED` 不升级为系统PASS。原phase集合不变；真实HOST使用精确父审路径的独立私有收集/执行器及新回执，不改历史工具护栏或phase标签伪造执行。

每次真实操作须保存操作前/后程序与资料摘要、有效DeviceId摘要、installer/source SHA、原始退出值、launcher是否创建进程、登记/快捷方式与所属进程状态、必要日志及恢复记录。退出0也必须结合实际文件与系统读回判断，失败/无法检查分别记录，不把UNKNOWN当false。

计划按[Inno Setup退出码合同](https://jrsoftware.org/ishelp/topic_setupexitcodes.htm)区分正常完成0、安装前取消2、安装中取消/Abort为5、Prepare阶段不能继续为7/8；其它非0和未知值保留原值及日志。使用[静默参数合同](https://jrsoftware.org/ishelp/topic_setupcmdline.htm)时必须禁止自动重启，不自动关闭应用；是否自定义重启返回码需在具体方案中记录，当前不新增产品策略。本机已实读H1_A2为7、H2–H4/H5_A2/H6为0，未覆盖值仍只是合同预期。

[卸载退出码合同](https://jrsoftware.org/ishelp/topic_uninstexitcodes.htm)要求把非0当未完成，且原卸载进程返回时临时clone仍可能清理；未来验收须另核所属清理完成，不只看单个退出值。

## 隔离环境与系统边界停点（历史准备阶段）

本节记录用户允许本机测试之前的边界；之后的本机授权及实际执行范围以[本机验收合同](V039_HOST_ACCEPTANCE_CONTRACT.md)为准。核心、资料保护及签名暂缓不变量继续有效。

本轮只做限定命令存在性和OS能力只读查询，没有启动Sandbox/VM/container，没有枚举个人VM、磁盘、profile、凭据或服务器。主线程另核tracked项目环境声明为0；此结论只表示项目专用可回退Windows环境 `NOT_ESTABLISHED`，不证明机器没有其他VM。机器原始能力值保留私有回执，不作为产品要求或持久用户事实。

若提供专用可丢弃Windows guest，下一份精确合同至少写明：环境身份及归属、已确认的还原点/销毁恢复能力、测试OS和专用账户、只读安装输入与单独证据输出、网络/剪贴板/共享目录和宿主隔离规则。安装器的Program Files/固定AppId HKLM64登记、快捷方式、guest TEMP及UAC副作用只可发生于该guest；是否允许创建/恢复guest也须父审，不能由现有能力推定授权。

当前宿主不安装/卸载，不改注册表、服务、启动项、驱动、电源、ACL或Windows功能，不启动前台，也不读取个人资料。不得以改AppId或改profile根规避真实安装语义。需要人工启动环境或操作的项目，在独立可行项完成后只通知一次最小步骤；其余独立项继续，不以一项缺环境宣布全局阻塞。

## 允许文件、不变量与下一停点

本阶段允许修改本合同、本机验收合同、环境交接、PROJECT_STATUS、DEVELOPMENT_LOG及自有忽略目录 `.work/v039/`、`.work/V039_TASK_STATE.json`。产品允许修改文件目前为NONE；只有明确Observed/Expected/修前复现、精确局部文件与不变量、有效修后用例经父审后，才另开实现范围。

冻结PlaybackManager/Session/Item/MediaSource/PlaySession、Resolver/CD2/Mount/DirectUrl、Native/libmpv/IPC认证/窗口、依赖及默认内核。profile/身份/降级语义不擅改；038完整lease/映射/显示、缓存/预热/切轨延迟、圆角和037电源系统实测仍暂缓。资源只对新增消费者证据明确的遗漏/打包问题局部修正；vendor、共享字体/主题、HTML回退及未知外部消费者保留。数字签名全部暂缓，不采购、注册、取私钥或接入服务。

父核本机验收合同、精确目标及备份/恢复门禁后，已推进获授权HOST真实安装，不再要求guest；产品修复仍只依据明确证据。无确认产品问题时交有界证据、剩余条件并审核收口，不靠改版本号发包或制造额外用户手测停点。若有真实必要改动、相关验证及父实际审核通过，原授权已覆盖push/PR/CI后正常merge、准确最终main标准构建/Tag/Pre-release、五附件匿名全字节校验和文档/远端收尾，Latest仍031；确有必要人工门禁未满足则保留候选，不跳过。不启动040。

恢复入口为私有 `.work/V039_TASK_STATE.json`，列明准确工作树/HEAD、来源、报告、快照与下一步。当前没有039 PR/构建/Tag/Release，产品源码不变；原12项Git blob复用绑定、3套合成BEFORE及限定盘点保留，HOST真实备份/升级/降级/卸载重装证据单列。当前可信038已实际恢复且最终完整读回，profile/原036备份保持；H5两项精确延后残留获父核、原FAIL仍在，不声称临时文件零。最终证据待父审核后收口。
