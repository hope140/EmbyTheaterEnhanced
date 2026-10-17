# v0.3.9 安装生命周期范围与合同

## 第一停点与准确基线

2026-10-17，状态 `READY_FOR_PARENT_CONTRACT_REVIEW`。本合同承接用户的039安装升级与交付授权；先完成独立盘点和隔离准备，系统边界及具体修复由父会话实际审核后推进。

准确main/docs基线为 `a1b2a04d21c023062934351f29868e9c1c908b7a`，已发布038产品source/Tag为 `0bbc504fbb6ca98dfb7476e8078c4483347b4375` / `v0.3.8`，分支 `codex/v039-install-lifecycle`。本轮尚无确认产品缺陷，产品版本保持0.3.8，不生成或重命名039候选。旧Settings工作区、038发行树、全部旧包/profile/Tag/Release保持。

Task Risk中、Uncertainty中（系统安装行为未测）、Cross-module Scope为安装/资料保留/交付工具、Playback/Session Impact为NONE。主线程Tier 2保留数据与系统边界判断；GPT-6 Luna High worker只盘点明确源码和只读能力，未自主实施产品或系统变更。

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
| 真正缺口 | 没有本轮真实安装/覆盖/降级/卸载重装/UAC/取消/静默退出码实测 | 属证据缺口，不预认产品缺陷；只修能够复现且有明确合同的局部问题 |

依据为 `installer/EmbyTheaterEnhanced.iss`、`installer/installer-guard.iss`、`src/electronapp/enhanced/bootstrap.js`、`src/electronapp/device-identity.js`、相关安装/快照测试与工具。当前读取范围内未发现确定源码矛盾。

## 复用证据与本轮新增准备

夜间C包15项静态/隔离结果和D包有限资源结论见[夜间审核](OVERNIGHT_REVIEW_REPORT_20261016.md)。主线程核对12项安装/profile/DeviceId相关文件，Git blob从night `5341f32985aabefa03f789b1428d8dfa2be5ba06` 到本基线完全相同，因此复用其原有范围，不重跑或重标为039系统PASS。D包中未知手工/外部消费者继续UNKNOWN。

[038发行核验](V038_RELEASE_VERIFICATION.md)的2159 payload/2160完整runtime、标准安装器解包逐路径/逐SHA、来源/input/runtime闭合及五附件全量回读是既有交付门禁。本轮不把它们当新增安装生命周期功能，也不重新包装旧包作为039修复。

新增3套项目内合成资料，覆盖空目标、模拟默认目录及自选中文/空格目录；既有资料含system.xml、有效合成DeviceId、CEC cancel和二进制保留canary。已用原只读收集器保存BEFORE快照，重新核对收集前后输入字节不变。占位EXE/DLL是不可执行文本，不是runtime；installer/app运行数均0。未执行真实操作，故没有伪造AFTER或升级/卸载PASS。

## 生命周期矩阵

下列均为后续验收用例与前提，不是本轮执行结果。每个操作使用独立合成资料及新回执路径，不覆盖历史证据。

| ID | 场景与前置 | 必须回读 | 当前层次 / 剩余 |
| --- | --- | --- | --- |
| I01 | 空目标、模拟默认目录 | 准确payload、登记、快捷方式、首次资料/身份 | BEFORE准备；真实安装未执行 |
| I02 | 自选目录含中文/空格 | 实际落点、参数、快捷方式及启动归属 | 路径资料已备；真实复制/UAC未测 |
| I03 | 同目录覆盖及升级，旧客户端正常退出 | 程序树更新；config/有效DeviceId/CEC与用户资料字节保留 | 原合成证据复用；系统覆盖未测 |
| I04 | 登记目录A、选择目录B | 两目标guard、登记迁移、A/B实际剩余；未知保留而不假定清理 | 静态合同；系统未测 |
| I05 | 可信较旧包覆盖较新包 | 原允许行为、程序版本/完整集合、资料身份和恢复步骤 | 不新增版本guard；系统未测 |
| I06 | 正常退出后卸载 | 程序/快捷方式/登记变化，profile/config/有效DeviceId保持；卸载所属清理完成 | 静态保留设计；系统未测 |
| I07 | 卸载后重装 | 原资料和有效DeviceId复用；缺失/损坏身份按既有规则处理 | BEFORE准备；系统未测 |
| I08 | 专用标准用户、测试管理员，接受提升 | 安装权限、原用户profile及快捷方式归属 | 需专用账户/UAC环境；未执行 |
| I09 | 拒绝UAC | 是否真正创建Setup进程、launcher错误、程序/资料不变 | 不把UAC拒绝硬记为Setup取消码；未执行 |
| I10 | 目标Host/Electron/Helper占用或关键PE文件锁 | 原guard阻断、不强关、不写目标；旧程序和资料前后状态 | 原隔离guard范围复用；系统未测 |
| I11 | 目标ACL拒绝 | 区分关键文件guard拒绝和复制阶段失败；记录实际退出/部分目录状态 | 不改宿主ACL；专用系统未测 |
| I12 | 向导前取消、复制中取消 | 对应退出码、程序部分状态、资料保留和取消后所属进程 | 交互条件未建立；不以强杀替代用户取消 |
| I13 | 受控复制失败及恢复 | 实际失败点、日志、部分文件状态；同目录重试/旧可信包恢复 | 故障注入需单独父审；不承诺自动回滚 |
| I14 | 静默安装/卸载 | 实际exitCode、payload/登记/快捷方式/资料、无末尾应用启动及清理完成 | 静默不是纯文件操作；系统未执行 |

版本对、准确安装器SHA、账户、目标目录、故障注入点及必要矩阵由具体环境合同固定。现有 `tools/test-installer.ps1` 仍是历史0.1.0/0.1.1真实系统脚本，不直接拿来运行039；其显式授权、已有登记/profile/快捷方式拒绝等护栏保留。

## 收集、退出码与完成判定

沿用只读 `tools/installer-lifecycle-snapshot.cjs`；输出必须在被观察目录之外、显式绝对路径且拒绝重解析链接、已占用回执。其 `--isolated-environment` 是路径确认，不是Windows guest隔离证明；`STATIC_VERIFIED` 和 `lifecycleAcceptance=NOT_EXECUTED` 不升级为系统PASS。原phase集合不变；降级/取消/失败的实际操作名放在外层场景记录，不能靠修改phase标签伪造执行。

每次真实操作须保存操作前/后程序与资料摘要、有效DeviceId摘要、installer/source SHA、原始退出值、launcher是否创建进程、登记/快捷方式与所属进程状态、必要日志及恢复记录。退出0也必须结合实际文件与系统读回判断，失败/无法检查分别记录，不把UNKNOWN当false。

计划按[Inno Setup退出码合同](https://jrsoftware.org/ishelp/topic_setupexitcodes.htm)区分正常完成0、安装前取消2、安装中取消/Abort为5、Prepare阶段不能继续为7/8；其它非0和未知值保留原值及日志。使用[静默参数合同](https://jrsoftware.org/ishelp/topic_setupcmdline.htm)时必须禁止自动重启，不自动关闭应用；是否自定义重启返回码需在具体方案中记录，当前不新增产品策略。以上只是文档预期，不是实际测得退出码。

[卸载退出码合同](https://jrsoftware.org/ishelp/topic_uninstexitcodes.htm)要求把非0当未完成，且原卸载进程返回时临时clone仍可能清理；未来验收须另核所属清理完成，不只看单个退出值。

## 隔离环境与系统边界停点

本轮只做限定命令存在性和OS能力只读查询，没有启动Sandbox/VM/container，没有枚举个人VM、磁盘、profile、凭据或服务器。主线程另核tracked项目环境声明为0；此结论只表示项目专用可回退Windows环境 `NOT_ESTABLISHED`，不证明机器没有其他VM。机器原始能力值保留私有回执，不作为产品要求或持久用户事实。

若提供专用可丢弃Windows guest，下一份精确合同至少写明：环境身份及归属、已确认的还原点/销毁恢复能力、测试OS和专用账户、只读安装输入与单独证据输出、网络/剪贴板/共享目录和宿主隔离规则。安装器的Program Files/固定AppId HKLM64登记、快捷方式、guest TEMP及UAC副作用只可发生于该guest；是否允许创建/恢复guest也须父审，不能由现有能力推定授权。

当前宿主不安装/卸载，不改注册表、服务、启动项、驱动、电源、ACL或Windows功能，不启动前台，也不读取个人资料。不得以改AppId或改profile根规避真实安装语义。需要人工启动环境或操作的项目，在独立可行项完成后只通知一次最小步骤；其余独立项继续，不以一项缺环境宣布全局阻塞。

## 允许文件、不变量与下一停点

本阶段允许修改本合同、PROJECT_STATUS、DEVELOPMENT_LOG及自有忽略目录 `.work/v039/`、`.work/V039_TASK_STATE.json`。产品允许修改文件目前为NONE；只有明确Observed/Expected/修前复现、精确局部文件与不变量、有效修后用例经父审后，才另开实现范围。

冻结PlaybackManager/Session/Item/MediaSource/PlaySession、Resolver/CD2/Mount/DirectUrl、Native/libmpv/IPC认证/窗口、依赖及默认内核。profile/身份/降级语义不擅改；038完整lease/映射/显示、缓存/预热/切轨延迟、圆角和037电源系统实测仍暂缓。资源只对新增消费者证据明确的遗漏/打包问题局部修正；vendor、共享字体/主题、HTML回退及未知外部消费者保留。数字签名全部暂缓，不采购、注册、取私钥或接入服务。

父审核当前合同、真实diff与回执后，才决定可回退环境或证据明确的局部修复。无确认产品问题时交审核与剩余条件，不靠改版本号发包。若有真实必要改动、相关验证及父实际审核通过，原授权已覆盖push/PR/CI后正常merge、准确最终main标准构建/Tag/Pre-release、五附件匿名全字节校验和文档/远端收尾，Latest仍031；必要人工门禁未满足则保留候选，不跳过。结束于039发布或真正人工停点，不启动040。

恢复入口为私有 `.work/V039_TASK_STATE.json`，列明准确工作树/HEAD、来源、报告、快照与下一步。当前没有PR、039构建/Tag/Release或系统操作；实际验证仅为12项Git blob复用绑定、3套合成BEFORE快照及输入字节回读、限定环境/项目声明盘点和文档检查。
