# 维护记录

## 2026-10-25 — 专用更新缓存与正常退出后的安装向导

独立候选从已整合0.4.2／0.4.3的指定main `8745493d92fb4348d5af2d86d13797f0a8760e81` 开发，移除更新目录选择。用户点击后仍先从官方Tag重核附件；受管目录记录文件归属，已有好包复核后复用，新版本另存且失败不覆盖旧包。交接守卫锁定路径／文件并重算官方SHA及Zone，私有握手完成后排队原 `app.quit()`，确认实际Electron与同目录Host退出再以系统Shell无参数打开向导。下一次同位置目标／更新版本启动才做有限身份清理，旧版／失败／忙碌／未知文件保留。

没有重建Host自动更新、改管理员持久设置或代理认证行为。新增离线缓存与状态机测试、实际Windows无执行锁／清理测试，后者在Linux明确跳过；C#编译和PowerShell语法不代替Windows API、UAC／SmartScreen或实机安装。包内自检扩至9项、绑定12份模块，保留原零网络／真实profile／安装执行门禁。完整合同与交接见[手动更新](MANUAL_APP_UPDATE.md)；本轮不自行dispatch、运行软件安装包或退出Work现用进程。

初轮完整Linux回归2181项（2159通过、0失败、22跳过），含真实PowerShell脚本的合成进程正常退出顺序；Windows句柄／非子进程退出码断言仍待验。Unix非子进程退出码不可据此验证，未放宽产品零退出要求或把这两个断言记为通过。另隔离缓存不可用与只读通道／版本检查，区分安装未完成和清理待重试提示。包内9项与12模块源码投影绑定、原打包门禁均通过；没有真实Windows GUI／安装证据。

追加托管Windows独立短验证：原public-ci字节不改，固定actions／Node与准确head checkout，不装依赖或构建产品包。自有临时目录编译asInvoker标记程序，通过真实缓存、Zone3、C#句柄守卫和ShellExecute等待合成客户端自然退出，随后验证旧版保留／合成目标版清理；取消后复用另有真实Windows用例。入口拒绝Work／本地／self-hosted与SHA不符，runner零跳过才通过；不改策略或自动接受系统安全UI，受阻保留失败证据。相关本地49项38通过、11平台跳过，尚不宣称Windows实际执行或真实UAC／安装通过。

Windows短测发现分离启动不执行脚本及清理退出码误判，已采用普通隐藏启动、认证本机管道和显式清理回执。进一步对照确认精简环境的模块自动发现约耗30秒；直接从系统 `$PSHOME` 路径加载 Utility 模块的Windows受控编译／打印验证约4.9秒，无策略覆盖或runner缓存继承。真实文件锁与完整交接门禁恢复后另行记录，不以诊断通过代替产品验收。

修正后的完整Linux回归2189项（2165通过、0失败、24平台跳过），包内9项合成自检和12模块绑定／打包门禁投影7项通过。Windows实际句柄、身份／Zone／硬链接拒绝、缓存取消复用、版本确认清理与异常退出顺序共117项全部通过、零失败／取消／跳过（源码 `3a2756f50832c0a66f0672e9c3e9d6fc532b6979`，[独立短测](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40167813705)）。该回执仍是无执行阶段；受控asInvoker假安装器交接现恢复验证，不能据此声称真实安装／UAC通过。

安装器交接边界已实测：无执行的relay／PowerShell生命周期在合成客户端自然退出后正常完成；完整受控运行119项中118通过、1失败，停在实际ShellExecute，可见窗口和SmartScreen进程存在，调用未返回，假安装器无启动标记（[0031027源码回执](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40168743383)）。不宣称具体窗口／策略根因，不接受安全提示或再自动尝试该入口。自动job改为原生／marker-only子集，明确标记 `native-only-passed`；完整安装交接、实际客户端和UAC仍需隔离有交互Windows验证。源码及包内自检、原生子集通过不等于安装器端到端验收通过。

## 2026-10-25 — 文档入口与当前发行状态

已核对远端 main 与 v0.4.3 Tag 同为 `69e55b91a0cc6ba4b01ce60cb65d9aca41b0311e`（含 PR #77）。[v0.4.3](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.3) 于 2026-10-25 发布为测试版，Latest 正式版仍为 [v0.4.0](https://github.com/hope140/EmbyTheaterEnhanced/releases/latest)，v0.4.2 为上一批测试版。

v0.4.2 的详情静态缓存、独立缓存管理、手动更新及正式／测试通道已发布；v0.4.3 保留这些并纳入一秒任务栏视频预览、Windows 系统媒体卡片、退出修复、清理按钮居中及“智能解析”展示名。原任务栏两个按钮已移除；预览不合成字幕或承诺连续视频。

README、用户指南、贡献指南和文档索引统一下载、配置、更新、常见问题与开发入口。后续实验状态见[后续范围](NEXT_RELEASE_SCOPE.md#未发布实验)，不写为已发布功能或承诺日期。许可与必要通知不变，保留材料不等于核验授权。此次只整理现有文档白名单，本地文档路由相关回归 47/47 通过，10 份改动文档的 232 个相对链接及 21 个标题锚点核对通过，5 段 PowerShell 示例仅做语法解析；正式 docs-only 门禁及远端 CI 结果以本次 PR 为准。没有新增客户端、安装、硬件或 NAS 验收。

## 历史记录阅读说明

以下日期段落保存当时的候选、计划和检查结果，其中“尚未发布”“未合 main”“待 runner 验证”等不代表当前待办。准确发布状态以上述当前入口和对应 Release 为准；历史证据不能替代新源码或新包的验证。

## 2026-10-24 — v0.4.2 第一批测试版准备

整合详情静态内容持久缓存、独立缓存管理和手动更新／正式测试通道，保留v0.4.1修复及main构建输入提速。详情数据按身份隔离，缓存不替代授权、最新进度或播放数据；首页布局试验默认保持，登录与设置不随缓存清理。

根产品版本一致为0.4.2；正常release路由、Framework来源预检、包内更新器自检和五附件来源校验保持。全仓／材料及受控浏览器回归与实际Windows包核验分别记录，不把旧包反馈当作新来源构建结果。来源与发布参数见[v0.4.2核验说明](V042_RELEASE_VERIFICATION.md)。

## 2026-10-24 — 恢复main正常手动打包默认值

修复旧实验分支互锁：benchmark默认false，普通test／release按原入口运行；显式benchmark才skip包并进入短job，去掉两个job的分支硬编码。原权限／concurrency／固定SHA／release输入与完整包门禁均保持，release+benchmark冲突仍fail closed。相关测试从实际default取值，覆盖main／perf／其它ref和test／release而不是预期普通包被禁；旧配置在新测试复现3处红例。没有重做性能实验或完整包，未合main或引入详情／Native／Range功能。

## 2026-10-24 — 恢复workflow结构回归

依据40087539201的两条精确失败日志，将原manual块截取改为按顶层job边界定位。原3项测试和3个action计数保留并加严到原精确pin；路由矩阵覆盖自动事件、目标／其它ref及benchmark模式，新增2项检查短基准的mode／SHA拒绝发生在checkout前、固定输入与诊断artifact边界。仅修改测试和文档，不改workflow／构建／缓存／并发。相关43项、零跳过；实际工作流与重排安全job通过，16个不安全／默认偏移变体拒绝；独立只读复审通过。正常push后的完整公共CI独立确认，未新增性能样本、打包、PR或main合并。

## 2026-10-24 — Windows短基准结果归档

归档c1c6e7dc的成功Windows run40087708509／job120853913867、artifact12557687964的177152字节／SHA256及88项已核验清单摘要；三套输入身份及每对digest一致，夹具逐次核174文件，27份process记录无异常。Git调用plan8→4、Host111→3；fixture首次7→7／热7→1。批读首次和热操作均下降；seed首次多551.530ms，后续每次少1676.471ms，以中位数模型第二次可摊销。文档区分候选正常入口、仅对照算法和仍未验证的完整回归／整包收益，保留首次慢22.763%／热快75.976%的准备成本证据及OS缓存／29.768秒预准备／0单测边界。仅改文档，无新增实验或main合并。见[归档](CI_BUILD_PERFORMANCE.md)。

只读核对发现同SHA公共CI40087539201已1543 pass／2 fail；两处为新增workflow job后的结构断言不匹配，相关验证前轮遗漏。已记录失败日志与合并阻断，未把短基准成功当全CI通过；此文档收尾不改测试或workflow、不跳失败。

## 2026-10-24 — 短基准UI入口准备

复用默认分支已有的public-ci.yml手动入口，在perf/build-inputs增加独立短基准job与明确输入，默认4轮／3次热调用；checkout绑定github.sha，可显式填审核SHA拒绝分支移动。模式冲突失败，perf分支无全包回退；原打包concurrency block及公共回归不变。基准仅运行已审plan／host／fixture-prep，0项单元测试，原始结果和完整身份验收仍保留，artifact缺失即错误。没有扩大权限／接触secret／缓存改动或自行dispatch。UI复现与未实测边界见[方案](CI_WINDOWS_AB.md)。

## 2026-10-24 — Windows输入性能验证准备

新增Windows PowerShell／Node定向基准协调器，核精确SHA、全仓干净、固定工具和物理独立输出；默认每臂4轮first＋3warm，顺序AB／BA。Host固定commit获取在计时外，测量禁止lazy fetch；每份来源／完整集合／哈希校验保留，诊断产物白名单排除对象库与源码恢复树。原28个测试主体未变，提取私有夹具工厂以保证短基准量同一准备路径，并补4项边界／隔离回归。Windows正确性run40085107715已通过；Windows性能尚未执行，不用完整CI跨机器时长推断收益。复现见[WindowsA/B](CI_WINDOWS_AB.md)。

## 2026-10-24 — 修正性能实验Windows换行夹具

实际Windows公共run40083575146在c16208a得到1540 pass／1 fail／0 skip，唯一失败在新增authority测试：将已有CRLF再次直接扩为CRLF，造成CRCRLF，原HEAD字节校验正确拒绝。只修测试转换为先规范LF再生成CRLF，重复两轮并新增CRCRLF仍拒绝断言；不改生产校验、测试选择／数量、workflow或并发。原红例在Linux同错误复现，修后相关38项／0跳过和core.autocrlf=true checkout该组6项／0跳过通过；新Windows结果仍需单独核验。原同输入A/B数据与边界保留，不能由换行修正声称Windows性能收益。详见[实验记录](CI_BUILD_PERFORMANCE.md)。


## 2026-10-24 — 构建输入提速实验：本地对照完成

独立perf/build-inputs候选基于main 88578c91，新增分阶段／测试热点日志，将固定Git读取扩到获取authority和55份Host来源；每次仍验证精确commit／blob／size／SHA、当前物理路径及工作树字节，没有跨调用缓存成功结果。原27项构建输入用例主体完整保留，种子只复用文件内不可变输入，每用例物理独立.git／工作树及新runtime；增加隔离和损坏输入负测。workflow、缓存、并发、runner规格、产品源码与材料版本保持。

同e8be676输入、每臂3次交替本地A/B：Git调用8→4、111→3；夹具组fresh／seed均28/28、0跳过，中位13.370／12.294秒，初次种子准备更慢、后续复用更快。完整范围、方差和首次／热调用见[性能实验](CI_BUILD_PERFORMANCE.md)，不把Linux局部差值称Windows整包收益。公共完整集1531 pass／0 fail／10既有Linux skip，runtime来源6/6及Host／Release／计时相邻65项通过；精确HEAD输入合同、语法和有限凭据模式检查通过。未手动触发Actions或打包；普通push后的CI另核，Windows A/B及端到端收益尚未验证，不将局部结果当发布或安装证据。


## 2026-10-23 — v0.4.0整合PR70来源与必要声明

将PR70固定提交6576f5d的16份来源／声明材料整合到既有发布分支，四处文档冲突采用保留双方有效内容。API／page完整MIT、Sizzle原文、VTT版权／固定源／实际差异、Material Icons来源、Socket组件与集成范围及npm36许可命名口径保留；原JSON／CSV证据字节及analysisRef不改。旧“尚未替换Host／仍运行Sharp和ServiceStack”等仅作为研究时点，不恢复旧链；当前源码Host／JSON／ZIP、CEC退役、API维护与业务来源指纹均不变。

17份文档UTF-8／末行／新增链接、冲突标记与有限凭据模式检查通过，六份PR70 JSON／CSV证据与6576f5d字节完全一致；构建输入、快照迁移、维护Web材料及文档检查相关37项全部通过／0跳过。本次只整合文档与必要notice，不新增功能、不改认证区域，不将用户保留决定写入README或Release。研究证据与许可覆盖仍分开；v0.4.0尚待正常PR检查／main集成、最终提交正式五附件构建及发布回读，未复用旧0.3.16测试产物。详见[研究索引](DEPENDENCY_RESEARCH.md)与[发行核验](V040_RELEASE_VERIFICATION.md)。


## 2026-10-23 — 干净云端测试包成功，准备v0.4.0正式版

run39974691780对6858c711完成Host实际验证、1609项普通测试、Native Helper实际编译及安装器完整性／完整解包比较，manual job15分52秒成功。原工具链依赖PATH局部接线在新runner兑现，未改变GCC／树／flags；它证明修正后的本次构建成功，不补出此前无stderr退出1的具体DLL证据。415 JS／47 PowerShell及有限模式检查通过，平台skip0；显式全部材料需正式构建另跑。

artifact服务端大小164336955、摘要227e63055c4396bb007e64c283b74d4da092564c17a7ae1e415cd61efccbd51f与来源6858一致，上传17文件；独立下载内容核验仍待完成，未将其写为通过。该包仍为0.3.16测试身份，不作为新正式资产复用。

最终版本经用户确定为v0.4.0，先前0.3.17计划撤回且未写入。仅更新根package及lock两个根版本字段、正式notes草稿和当前文档事实，保留旧v0.3.16。当前公开Latest3.1／prerelease3.16与待发4.0分开；输入数量按活动manifest重算757／24943281，历史阶段说明、已退役CEC入口及来源／许可存储表述同步纠正。两处用户决定保留的局部认证逻辑未触及，原决定及核验边界继续只在开发文档记录，不转入README／Release。后续Windows控制、缓存／预加载和FNConnect等独立分支不进入本版。

正式构建入口补充五文件来源／哈希日志：所有既有门禁后重读实际五附件，检查installer receipt、单文件SHA、四项SUMS和精确Git notes，再输出RELEASE_FILE_EVIDENCE供发布核对，不增加上传路径或权限。源码AST生产块的合成正负例覆盖错误source／version、改安装器／notes／校验、缺件，保留原文件；相关15项通过，先前版本／输入／模板／Host／路由合同125项通过，新／变更链接32个目的地通过；最终七文件联合定向136项全部通过（0失败、0跳过）。一次初版新测试存在括号笔误，在执行前解析失败后修正并完整复验，未将该失败计为通过。

新正式source、五附件、Tag／main／Release均尚未产生；后续必须真实release_package=true重建并完整来源核验，不借用旧回执或重命名旧测试包。常规可回退工作已有授权；具体保护／审批阻塞按实际证据报告，不绕过。

## 2026-10-23 — 固定Native工具链的子进程依赖环境

run `39970619136` 完整回归1606／1606通过、0失败／0跳过，耗时662749ms；Host真实验证及锁接入、语法／固定输入检查继续通过。实际runtime构建在build-native-helper.ps1原48行收到GCC exit1，14:54:24 UTC结束（21分04秒），无安装器／artifact。终态日志没有C++编译或链接stderr，不能用泛化exit1代替已证实根因。

静态检查发现GCC完整6990文件工具链已锁定验证，但实际编译没有把其ucrt64/bin前置到进程PATH；驱动版本探针成功不能证明位于其他目录的cc1plus子程序能解析同树DLL。MSYS2官方环境说明要求UCRT64 bin优先，项目维护方记录过子编译器因PATH中的其他winpthreads DLL导致启动失败。这支持环境缺口推断，尚不能证明该run的实际失败DLL。依据：[官方环境](https://www.msys2.org/docs/environments/)及[维护方问题记录](https://github.com/msys2/MINGW-packages/issues/24355)。

仅将实际编译调用置于局部函数：调用前仍完成源提交／header／libmpv／完整工具链／编译器身份检查，当前进程PATH临时前置经验证编译器的bin，finally恢复原值；异常继续阻止provenance记录，未安装软件或改变系统环境。固定GCC／库／flags、C++源码和Host指纹不变。回归从实际PowerShell AST提取生产函数，以真实外部Node子进程作编译驱动替身，覆盖环境前缀、含空格参数、exit0／exit23及恢复；不是GCC或Windows DLL加载实测。连同工具链身份／环境拒绝、源版本物化和workflow测试14项通过（0失败、0跳过），下一次新runner仍需独立编译和验证。

## 2026-10-23 — provenance断言独立绑定夹具Git blob

run `39967786650` 于14:27:14 UTC结束（manual job13分45秒），本次镜像20261021.343.1；14:18:41 Host真实验证PASSED，本次生成锁、接入及preflight继续成功。原Framework固定门禁未修改，本轮不触发其失败诊断；不能据此补出上轮旧镜像的实际GAC/path/hash。完整测试1605／1604通过／1失败／0跳过，用时507208ms，未打包上传。

唯一失败为runtime-provenance.test.cjs原368行：生成器tools/windows-host-input.cjs的Git blob SHA为50730AF013A7978482C59F346294538DB47A9D604091B9CEF522B030A9978400，CRLF工作树SHA为3446258485A87DB75395F9DAA022CEB4D1A15EAEE98B0627C88DC0F3A7FC3F76，与CI actual／expected完全一致。生产tracked-file-hash检查工作树canonical文本与HEAD后返回原Git blob身份，测试却用原工作树字节作预期；与Work或runner Host产物hash无关。

新增LF／CRLF参数化夹具先复现原CRLF失败，再将测试预期改为独立git show读取精确夹具提交的blob。两种换行均保留私有DLL回流拒绝、错误projection清单拒绝，并追加真实生成器内容篡改被source及runtime provenance拒绝且不覆盖现场的检查。完整provenance文件6项通过（0失败、0跳过），没有修改生产代码或放宽门禁，未重复已经通过的全套Windows测试；下一次云run仍需重新构建、验证并运行全部回归。

## 2026-10-23 — 保留固定Framework门禁并输出拒绝证据

`39965790277` 在14:05:10 UTC结束，manual job用时5分45秒；MSBuild编译成功，最终验证器第42行拒绝System.Configuration的GAC／固定SHA256条件。artifact为空，尚未接入锁或整包构建。映像为20261012.333.1，与前次该门禁通过的20261021.343.1不同；现有错误没有实际绑定字段，原因不能进一步确定。

本轮只增强原throw的诊断，明确期望与实际GAC、SHA256、identity、location和referenceAssembly。条件表达式、固定允许hash及前置实际文件hash／非reference验证不变；不增加允许hash、不从当前未知输出自动生成信任。Finalize-Evidence及内外manifest更新精确身份，32文件现196279字节；业务源码／来源指纹及builder不变。新增回归经PowerShell AST选取实际生产分支，在合成元数据上验证原通过值与四种拒绝（错误hash、非GAC、GAC大小写、hash大小写）及准确诊断；不冒充真实Framework或Host验证。相关四文件99项通过（0失败、0跳过），32文件精确清单、来源指纹、builder哈希和diff检查通过。后续run若同条件不满足仍会失败，必须先取得并核对新实现证据，不能将诊断修正当构建问题已解决。

## 2026-10-23 — 关闭runner到build消费链路的同类CLI初始化缺口

运行 `39961791456` 已完成Host编译、实际验证与接入，独立source-built-input preflight随后以未初始化sourceIdentity失败。审查限定于runner接入和build Host消费控制链：9个根入口可达44个本地require控制模块，两组循环分别为plan／receipt／source-built-input和build-input-contract／build-input-provenance。plan已提前导出；本轮将source-built-input和后两模块的原导出赋值移至CLI分派前。receipt无CLI分派，其余检查到的组件、装配和provenance入口无回到自身的加载边，不做无关批量改写；runtime-provenance保持仅CLI消费形态。

真实子进程覆盖plan的install-runner、source-built-input的identity／preflight／stage（含stage返回的validateRuntime）、copy-runtime-dependencies的create-owner、windows-host-input的assemble，以及build-input-contract检查、build-input-provenance write／validate。后续Host消费的派生文件及JSON依赖身份逐项验证；拒绝回执／产物篡改、双锁、不同run、源码／回执／runtime重定向、dist外输出和错误owner，保留原字节不覆盖。有效runner链路修前复现循环错误，修后相关98项通过；夹具使用合成非执行字节，不冒充新Host编译或完整客户端验收。业务源码、固定指纹、编译器和验证器标准不变，新云run必须重新编译验证，失败run锁不外部复用。

## 2026-10-23 — plan CLI先导出安全工具再调用receipt模块

手动run `39959947978` 已完成Host云编译和实际验证，失败发生在随后 `install-runner` 接入阶段。plan原先在CLI执行后才赋值module.exports；receipt加载时反向解构physical，读到循环依赖中的未初始化导出。仅把原导出赋值移到CLI分派前，不改函数或回执验证。新增4项真实Node子进程回归，修前均以同一错误失败，修后正常接入、错误回执、路径重定向和已有证据保护均兑现原合同，连同既有runner／workflow共45项通过。夹具均为合成字节，不冒充产品执行；原云验证回执不搬运复用，新run必须重建并重新验证，完整包闭环仍待后续运行。

## 2026-10-23 — 使用映像已有7-Zip恢复固定libmpv归档

Windows2022手动run `39958180700` 在MSBuild定位前被系统tar的 `LZMA codec is unsupported` 阻断，失败与原版／派生Host均无关。官方部署映像清单列有7zip；恢复器仅在固定Program Files位置选择已有7-Zip并拒绝重定向，缺失时保留受信系统tar路线，所选工具失败不更换工具重试、不安装或更换输入。技术列表要求唯一精确根DLL成员，stdout提取禁用通配符，原归档／Git blob与输出长度／SHA256验证保持。新增11项选择／列表回归，连同原libmpv下载与仓库归档负例共32项通过；这些使用受控进程响应，不冒充真实Windows7-Zip执行。产品字节、来源指纹和编译器／验证门禁未改，完整云端结果仍待下一次手动运行。

## 2026-10-23 — 手动作业映像与MSBuild17合同匹配

手动run `39957149782` 在恢复固定材料、55份官方源码、来源指纹和32份验证器输入后，于MSBuild定位阶段报 `Existing MSBuild17 unavailable.`，未进入编译且无产物。日志映像为 `windows-2025-vs2026`；官方当前标签与Windows2022工具清单仍提供VS2022／MSBuild17路线。仅将手动job改为 `windows-2022` 并同步原工作流回归及说明；定位范围 `[17.0,18.0)`、builder版本拒绝检查、PS5.1／PS7分工、net462／x86和所有验证保持。没有升级编译器、安装软件、修改业务源码、借用回执或再次dispatch；新runner实际版本与完整结果待后续运行。

## 2026-10-23 — 固定Host输入的Windows checkout回归

公开CI `39952554306` 完成1491项：1487通过、4失败、0跳过，测试耗时665973ms；失败是来源指纹守卫阻断，未触及时限。`core.autocrlf=true` 的Git过滤复现表明，Apply-SourceChanges.ps1、change-manifest.json、upstream-source-manifest.json和host-json-manifest.json原始LF字节未受属性保护。仅为4条精确路径增加 `-text`，不规范化被验字节、不重算预期指纹、不改源码或测试标准。新增对全部13份指纹输入的真实Git checkout过滤回归，修前失败、修后38项Host runner测试及26项构建输入合同通过；原始Windows失败保留，新Windows结果另行记录。手动workflow读取Forbidden未重试，未据此扩大作业权限。

## 2026-10-23 — 候选验收后的文档与构建合同收尾

本轮候选 `ad77308cd83bd629a7b75349d727044f9fa1d86b` 已获用户验收确认；对应 Windows 构建、安装器、升级、副本 STRM 播放及正常 Host 入口检查由独立验证环境执行。来源与当前公开交接提交分开记录，未将局部实机结果外推为所有环境或全部许可通过。

文档当前说明集中到 SOURCE_CLEANUP_CLOSEOUT、PACKAGING、WINDOWS_HOST_INPUT 与 CEC_RETIREMENT，旧来源计数和阶段性待办不再作为当前构建说明。必要第三方声明及历史发行核验记录保留；认证区域的用户保留决定仍仅在本开发文档记录，不转入 README 或发行说明。

锁 schema 从旧 CEC-only 来源指纹纠正为当前统一 CEC／旧更新／JSON／ZIP 指纹，新增与 EXPECTED-SOURCE-IDENTITY 和实际生成计划一致的断言。未修改业务源码或 Work 负责的路径／测试修正，未采用失败的 Base64 输入。已通过正常Git取得 `0a8bf15c25df507fe4c7b55431bb3bbd8e67f09f` 的38文件交付；验证器32文件共196010字节保持原样，薄包装和PowerShell7调度已在本地接入，builder保持Windows PowerShell5.1、net462/x86。对照用私有配置DLL只进入verification-inputs；验证器全文件纳入输入／回执生成器合同，合成ZIP增加原字节比较，防UTF-8及换行归一掩盖差异。当前差量未提交或推送。



本地整合核验补记：已在隔离提交快照 `7e95be4e051ca596c9fc8e2a3954945f04428a81` 执行172份普通测试文件，共1576项／1566通过／0失败／10项既有平台skip；另21份显式材料自测共135项全部通过。413份JavaScript和47份PowerShell语法、构建输入合同、32文件验证器精确身份以及新增文档链接检查通过。Host首项材料预期差集的静态疑点未在执行中复现，其它退役项已由分类步骤排除，无需改测试。该快照只是本地回归证据，不是Windows编译／完整客户端新验收，也不是远端发布提交；本补记仅更新文档。

## 历史阶段记录

以下条目保留其当时状态与验证边界；当前状态以上文为准。

## 2026-10-23 — Unified source integration, final Windows artifacts pending

The two exact API and JSON/ZIP transfer archives are hash-verified. The API selection uses four maintained AMD modules and a complete MIT notice; CM changes are restricted to transport in the original module, with original local text/reset ownership retained. A listener representation difference found by existing lifecycle assertions is corrected without relaxing those assertions. API/CM integration24/24 and assembly/provenance12/12 passed before the native JSON/ZIP integration; subsequent final checks are recorded separately.

The Host candidate now has6 replaced and2 added source files,57 source/resource/license inputs and46 Compile items. The exact four reviewed JSON/ZIP source bodies are retained, Newtonsoft13.0.4 net45 input is hash-verified, and ServiceStack/Sharp references and runtime paths are removed. Full official19-file recovery input and notices remain; the retained official projection is10 files, plus the separately pinned new dependency and source-built EXE/PDB selection. Existing ETE updates, ordinary tasks, user profiles/pending files and system drivers remain outside the cleanup.

Work is offline. Final source fingerprint: `81b18ab1264941b7121967770d9b791af7fd4436b6cf910da443c92f967eea45`; a new source-only Windows handoff is prepared. No earlier EXE/PDB or receipt may be relabeled as a matching unified artifact. Linux full regression first ran1538 cases (1523 pass,5 failures,10 existing Windows skips); the five observed failures are resolved in36 targeted cases and14 isolated staged-commit gate cases, all passing. The product branch remains uncommitted and its HEAD gates remain strict. Full-client/Windows installer acceptance and exact new compiler outputs remain pending. No commit, push, PR, package or release has been made.


## 2026-10-23 — 认证区域保留决定（后续整合边界）

用户决定保留当前已指定的两处认证／注册相关局部区域，本轮不再处理；新增改动的许可覆盖未核实。此记录既不认定已确定侵权，也不认定许可已经通过。后续非注册API／CM候选只先做接线边界计划，不整文件覆盖，保护现有入口、注册区域、缓存／reset调用和模块归属，不新增或重做授权旁路；整合后需做使用流程回归，当前完整产品未验收。此决定仅记开发文档，不加入README或Release说明，原本必须保留的第三方版权／许可文本保持。

## 2026-10-23 — CEC投影、首启及升级候选收尾

Windows纠正历史社区Model混入后，官方db22下原版/v1/v2/组合合同及六例启动保存退出范围已获通过摘要；选择v1无更新结果，撤销不必要的同步异常变化，不改Model。统一分支继续将官方Host19项投影为13项，五CEC二进制及五产品源码退出runtime；bootstrap/可选入口不再新写cancel，已有profile配置/标记保持。

新增源码派生Host输入门禁和EXE/PDB来源绑定：缺已验证锁与真实产物时，build在创建输出前失败，绝不回退旧Host。当前仍需接收Windows核验产物及构建回执。十一项升级旧程序文件以精确hash/注册归属/物理路径及锁检查处理，新载荷成功安装后才删除，不递归、不卸系统驱动、不触碰用户数据；Windows执行负例尚待验收。JSON替换的null数组修正已通过摘要核验，损坏/截断输入已选择明确报错，消费者边界验证及源码交接待完成，未称组合全部通过，未推送或发布。

## 2026-10-23 — 退休检查接口修订，等待 Windows 复验

Work首版候选构建和启动/保存/退出等范围通过，但旧CheckForApplicationUpdate构造结果时依赖加载失败；该项失败保留。当前最小修订只让检查方法同步抛NotSupportedException，明确区别于原先“成功返回无更新”的约定；保留锁定接口签名，未改Model/框架或添加垫片。唯一源码调用方SystemUpdateTask已退出编译；Host HTTP/ETE更新路径无此调用，六依赖未发现静态MemberRef，不宣称所有动态消费者不存在。

修订的直接/接口/反射调用必须实际得到预期NotSupportedException，FileNotFoundException/TypeLoadException仍为失败；还需重新验证8154/XML/退出、无cancel屏蔽与pending文件保持。当前只做本地源改/材料验证，未推送或替换正式runtime。

## 2026-10-23 — Host 源码退役候选，等待 Windows 对照

固定708fadc官方源码基线Windows构建/隔离运行已获通过回执；当前同一未提交分支新增native/windows-host四文件源码候选及精确输入/输出manifest。删除CEC安装入口/参数、pending更新处理，旧自更新检查返回无更新、安装明确不支持；两旧更新类退出编译（46→44），原工程九项CEC/更新helper Content退出。其它任务、共享InstallationManager及六份现有DLL保留，ETE发行/服务器更新路径不改。校验脚本先验证55份原始文件与四份候选，任何身份不符在创建输出前退出；不执行Host或安装器。

候选Windows编译/运行仍待Work对照，现有runtime Host和五CEC二进制暂保持；cancel写入及精确应用目录升级迁移待候选闭合。未提交推送/发布、未变更正式安装/profile/系统驱动。此前IL只读提案未采用，当前明确走源码维护，不将基线成功外推为候选或整机GUI验证。详见[源码合同](../native/windows-host/README.md)。

## 2026-10-23 — CEC退役前端阶段

同一未提交分支移除CEC插件/设置三文件和client/provider两文件，退役electroncec协议、自动spawn、参数消费与进程owner；仅在插件发现处阻止旧CEC模块残留，其它输入插件和视频事件脚本照常。更新被新规格替代的CEC保留断言，保持窗口状态、键盘快捷键、libmpv等既有断言；源函数VM回归覆盖空目录、旧插件及Windowsprofile参数不移位。46/46范围测试通过；Node24.18.1/Linux串行全套1492项：1482 pass、0 fail、10个既有Windows平台skip，仍不是完整客户端验收。

当前Host SHA和只读PE/CLI字段核对，参考708fadc的安装任务与Electron参数接线已读；研究侧七方法摘要已交接，另直接解析当前wrapper、唯一调用点及StartProcess参数槽，在内存形成58-byte协调差异方案，没有写出/执行新Host。官方输入与派生输出身份需分开，维护方式先确认，不擅重写Host或删驱动二进制留下提示；外部cancel仍不能保证所有Host前置。升级hash门禁与十一项程序文件迁移待Host闭合，不操作系统驱动、GAC、profile或登录；ADL/RefreshRate和共享VC++消费者边界保持。Source/notice历史保留，具体边界见[CEC候选方案](CEC_RETIREMENT.md)。

## 2026-10-23 — 私有框架DLL测试候选投影

Host输入保持完整19文件，装配仅省略固定System.Configuration.dll（93,200 bytes、3dba0c61…e8f1bf）；来源验证仍读取并校验被省略的输入。计划和provenance记录来源/产物不同集合以及排除差集，投影代码SHA进入source provenance，最终验证拒绝重新夹入DLL，任何错误版本/路径/大小/hash不静默跳过。保留System.Configuration.xml与现有许可声明、历史来源记录，不写系统/GAC或现用安装。

保留现有回归，新增精确投影、未知身份、别名/目录/悬空链接拒绝、计划防旧输入复活和最终provenance负例。局部44/44及真实组件材料投影1/1通过；原main工具与候选工具隔离装配的804/803基础文件逐项比较，仅固定DLL差异，其余字节相同。Node24.18.1/Linux串行全套1486项：1476 pass、0 fail、10个既有Windows平台skip。原材料完整性通过；单元、组件和基础payload证据不升级为完整Electron/登录/实播及CEC零客户端/零安装路径验收。未提交候选继续受HEAD构建输入守卫限制，完整测试包及验证方案见[Host输入合同](WINDOWS_HOST_INPUT.md)，原始回执留仓库外。

## 2026-10-23 — PR70历史研究快照：明确许可组件通知与有限剩余项

以下段落保留PR70在当前Host/API清理之前的研究状态；现行退役、替换与Windows验证见本页上方及发行核验。仅更新声明和文档：补API/page完整MIT、Sizzle原通知及VTT版权/来源/真实差异；核对现有11个notice入口、33个npm包36许可成员、shader37MIT＋2Unlicense。统一Socket组件MIT/集成边界、Sharp当前DLL及专项条款、Common的Updater范围；helper和七AppSettings访问器已有明确底稿，不再因旧编译器未知列必需替换。当前main0a1dd65只比材料基线a33多CI40分钟调整，研究分支相对main没有运行代码或工作流改动。

保留Web后期独立表达、428-byte VTT CSS、Sharp/ServiceStack组合交付、DPInst/ADL材料和真实Host验证的具体边界；不将来源/方法匹配比例当许可完成率。完整事实、固定URL/hash和局部测试限制见[统一索引](DEPENDENCY_RESEARCH.md)及[证据](dependency-research/evidence/license-closure-20261023.json)。本次未替换组件、打包或发布，未将文档补齐称整体许可清零。

## 2026-10-22 — 构建合同读取批量化

仅在一次inspect内复用固定Git提交数据：单次ls-tree -z加cat-file --batch替代逐文件重复进程，严格核对blob身份、类型、长度与分隔；工作区存在性、物理路径/链接、HEAD绑定、规范化文本比较及原始blob SHA仍由既有顺序验证。缺失对象按原路径读取以兑现原错误；批量失败/异常输出丢弃批量字节并回退，不能把不完整帧当成功，也不缓存上次工作区状态。独立hasher的两参数调用保持原行为。

保留原19项合同回归并加6项负向/等价回归；全套使用--test-concurrency=1，1476项中1466 pass、0 fail、10个Windows专属skip。固定材料校验、preload原生成关系通过。独立隔离Git夹具用同88项固定main字节，先各预热一次，再交替顺序做三轮成对比较；正常校验177→3次Git启动，逐项污染88文件7920→264，输出和每次拒绝结果逐项相同。原始回执与脚本留在仓库外；本地证据不代表Windows CI或实际产品运行验收，未改工作流门禁或产品路径。

## 2026-10-22 — 三份 Web 残留与二十份 npm 产物投影

按精确批准范围将三份无引用 Web 正文退出当前 v2 候选树/装配，Web713，兼容39/小组件2不变；保留实际目录选择器、localStorage/memory、空worker注册、playqueueconfirmation及语言/兼容入口。npm完整33包/1142文件与SRI/恢复输入保持，仅在新建有归属runtime复制时省略20个固定版本/路径/大小/hash产物，投影1122。provenance同时校验完整来源树、排除差集及其余字节，35份许可/notice不变。新增逐项负向、真实依赖复制、descriptor.json负对照、实际loader/存储初始化和Web装配回归；[完整范围与验收边界](SCOPED_RUNTIME_PROJECTION.md)。不改播放路径、CEC DLL、旧电源包，不合并、不打安装器或发布。

外部交接原件及夹具生成器均通过SHA256校验；原npm探针121成员/定义/wire对照通过，Chromium localhost原12组及批准三文件组合补4组通过，均为隔离组件/模拟API证据，不是Windows整机验收。首次Windows公共集1385 pass/1 fail暴露新增复制测试依赖未准备的外部继承材料；改为合成无关继承包，真实33个锁定npm包和全部投影/协议/负向断言保持。无外部材料的公开测试cleanroom三项通过，不增加跳过或缩小选择。详见[浏览器证据](evidence/web-residue-browser.json)。

## 2026-10-22 — 公共 CI 测试日志实时输出

仅将 ci-public-tests.cjs 的子进程 stdout/stderr 从整组缓存后打印改为直接继承；保持测试选择、参数、串行、工作目录、退出码、启动错误和现有工作流时限。隔离测试用双输出握手证明子测试结束前可见日志，同时覆盖成功/失败、空退出状态和启动错误。四项脚本回归通过；本改动提供取消时的诊断进度，不将旧取消记录算作成功，也未减少测试或扩大资源清理范围。

## 2026-10-22 — 移动端本地相机上传设置页退役

追加移除 settings/cameraupload.js/.html，当前桌面host无本地上传能力、服务仅iOS/Android注册且旧设置路由已注释。仅删除该674-byte注释块，app其它原始/生成字节不变；不改共享设置存储、sync、通用/触屏布局或其他移动端候选。devices/cameraupload管理员路由、页面及devices配置读写API保留，真实controller的mock回归覆盖两字段和其它字段保留。

活动集合39/2/716、基础/中间807/922，共十七个旧正文退出候选tree，必要声明、原manifest/hash和历史保持。051f990的Windows1372/1372成功记录保留身份，不冒充本追加提交结果；新head另跑CI。详细路径、hash、桌面入口和验证边界见[相机设置退役合同](MOBILE_CAMERA_SETTINGS_RETIREMENT.md)。不构建安装器、不合并、不发布。

## 2026-10-22 — 合入 PR67 基线并迁移活动快照 v2

同步已合并 main 7a21ca5，保留 ApiClient/toast 维护源、行为与来源说明，并解决两份状态文档及构建/测试合同的必要冲突。按确认范围迁移兼容39、小组件2、Web718；十五个旧正文退出当前 tree，原三份 manifest 的精确字节/hash 独立保存。Web 沿用根路径但版本明确为v2，app/index 同步消除旧模块/图片引用，最终生成身份保持。中文维护源改为完整37键，仍只有13项选定修订，24项继承值逐项hash保持。

不将原有有效 Web 样式与备用样式的同字节关系当作新复制或扩大删除；保留必要声明、旧限制、CustomCssJS GPL与旧Git/tag。迁移边界、十五项清单及负向校验见[迁移合同](SNAPSHOT_V2_MIGRATION.md)。初轮迁移单测发现旧数量/旧正文断言与已提交输入守卫需按新阶段校正，失败日志保留；最终组合检查和CI另以提交为准，不触发安装器、合并69或发布。

提交后全材料首轮215 pass/5 fail：四个来源夹具缺少两份退役小资源的历史元数据，一项启动材料自测仍对已变换v2重复应用旧生成器。补齐历史夹具并保持原18F777…B305D完整输出身份，重复变换明确拒绝；原失败日志保留，产品验证不放宽。

迁移后本地公共集1372项：1362 pass、0 fail、10 Windows平台skip；修后全材料及六个依赖文件合计220/220、0 skip，基础809/中间924项完整对照通过。组件 provenance 明确记录v1 manifest身份和v2身份，历史SHA不以新输出SHA冒充。最终Windows CI另按提交核验。

## 2026-10-22 — 旧启动 logo 最小退役

追加剥离 modules/themes/logo.png（1238×377，32,892 bytes，624aa242…906c064）。沿用 PR70 的动态引用评估并补本地固定材料核对；生产 index 已由现有 ETE startup.svg 替代，其尺寸、透明背景和 contain/居中样式保持。真实 Web 装配/overlay 回归验证旧图缺席、自有图存在、生成 index 目标不悬空，保留屏保及明暗标题图。没有新设计图片或宣称 GUI/冷启/登录已实测。

现为十三项退役、两个维护输出，Web 基底718项、基础/共同变换集合809/924，业务 payload 净减少27,002,259 bytes；provenance/通知和压缩体积另计。冻结正文和 manifest 全部保持，原 PNG 仍在当前源码树，源文件删除所需的新快照迁移仍仅评估。最终组合及 Windows CI 另按新 head 核验，不触发安装器、合并或发布。

追加 logo 后首轮材料组合为86 pass/1 fail，失败是 CustomCssJS 材料自测仍断言719项旧输出数量；修为718并明确逐项断言两份批准排除及 logo 缺席，未放宽输入哈希、保留文件或未知差值检查。修后材料组合87/87通过，0 fail/skip/cancel，基础809/中间924项完整对照通过。

## 2026-10-22 — 默认配置与十三项中文文本维护

默认配置改为 ETE 维护的 typed JSON→确定性 XML；五个值、字段类型、root/namespace、首次缺配置才复制及已有文件不覆盖保持。播放器中文仅覆盖 T01/T04/T05/T07/T08/T09/T10/T13/T14/T15/T16/T17/T18，保持 37 keys 和其余 24 项原文，三项长说明采用单段。维护源、继承边界、输出 hash 及回归见[小组件维护合同](MAINTAINED_SMALL_RUNTIME.md)。vendor 原文/manifest 保留且全部校验，新 snapshot 迁移仍仅评估；不将旧作者或整份翻译署名为 ETE。

前一 Windows 资源退役候选 `cfbd6e4` 公共集 1350 pass / 1 fail / 0 skip；失败是官方 Model 恢复测试夹具漏复制 Web 校验器新增的 runtime-exclusions 依赖。仅补齐夹具并新增跨平台依赖加载回归，Model 字节和校验不改。新配置/译文与该修复以新提交重新验证；不沿用旧绿灯，不触发完整安装器、不合并或发布。

## 2026-10-22 — CustomCssJS 可选集成退役

按明确退役范围，从新客户端装配中移除 CustomCssJS 模块和 app.js 注册，删除专属禁 JS 生成器及其无用合同/测试。它历史上有条件可执行，不是所有桌面环境都无路径；本轮选择撤出该可选第三方功能。保留普通 CSS、主题、原生 Branding/Css 的既有条件、storage、profile CEC 标记和 Carnival 隐藏标记。

冻结 Web 输入仍为 720 项且全部哈希检查，实际基底输出 719 项；累计少 12 个运行资源，基础/共同变换后集合为 810/925。新增真实主界面插件阶段的可用/不可用接口回归、无端点请求、无模块输出及严格注册锚点检查。上游固定 commit、CRLF 同文本、接口/注入行为与 GPLv3 原文记录见[退役合同](LEGACY_RESOURCE_RETIREMENT.md)。当前源码树原文没有删除，新快照迁移仅评估；不合 main、不改已发布版本，Windows/GUI/实播证据按本候选另计。

Linux 公共集 1351 项为 1341 pass、0 fail、10 个 Windows 平台 skip；六个材料依赖文件另测 84/84，真实材料 3/3。默认配置及中文本地化均先提供逐项差异，最终确认前维持原产品字节，候选不参与构建。修正退役测试的复验命令，并明确 MainActivity 分支只留在原始存档。完整安装包待相关 PR 工作完成后统一构建，本轮未触发。
## 2026-10-22 — Maintain derived ApiClient and toast sources directly

ApiClient 和 toast 的现有最终字节直接纳入 `src/electronapp/www` 下两个明确开放的维护路径，由既有 Git blob 装配器复制；移除对应用户补丁、ApiClient 生命周期生成器及两个 overlay 入口，其余 overlay 保持。维护源码明确为固定历史 Web 的派生文件，保留用户原有重连/进度/toast 修复和后续 socket/注销/计时器归属修复，不将继承正文整体标作原创，不替换原上游版本。

原缺件已按固定官方 ZIP/Git blobs 和仓库原始归档恢复，材料门禁保持原校验。直接源码方案完整 npm test 为 1429 pass / 0 fail / 10 Windows 专属 skip；全部显式材料自测 136/136，0 fail/skip，完整门禁通过。822 个基底及937个中间文件对照通过；相对 main `6fee412` 的720个 Web 文件路径/SHA完全相同。HEAD输入合同84文件、JS语法385文件、有限模式检查442文件通过。未进行 Windows 整包、GUI、登录或用户媒体验收。vendor、remoteaudio/remotevideo、依赖和版本保持，发布分支、Tag/Release/附件不动。来源和复现见 [Web 输入合同](WEB_SNAPSHOT_INPUT.md)。

## 2026-10-22 — v0.3.16 云构建与发布前文档修订

产品 source 固定 `6fee412ad68934d0194303916cfe346e6254a228`，[Windows Actions run 39737710070](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39737710070) 成功，发行模式开启：全量 1439/1439、显式材料 131/131、标准构建、VerifyOnly、安装器编译和完整解包对照通过，失败/跳过/取消均为 0。独立下载回执确认原 artifact 的 CRC、13 文件集合、校验表与安装器哈希；2170 个完整 runtime 文件对照通过。本次没有新包 GUI、真实播放或安装验收。

按用户长期未再遇到的反馈，将音轨/字幕切换延迟记为已解决，更新当前问题、首页说明、后续范围和发行 notes，保留历史计划事实。产品 Tag 仍绑定 6fee412，安装器及两个 companion 不变；修订 notes 与 SHA256SUMS 是后续文档材料，不冒充构建 source 的原始 notes。具体身份、哈希及发布门禁见[发行核验](V0316_RELEASE_VERIFICATION.md)。

## 2026-10-22 — CEC 包内副本与桌面 CSS 条件复核

现用固定 Host IL 明确从 ProgramDataPath 读取 cec-driver/cancel；生产配置指向独立用户 profile，bootstrap 独立创建并保留该标记，不复制包内文件。因此把无消费者的包内 cancel 纳入剥离，profile 语义、CEC 启动链及用户文件保持；累计新 runtime 剥离 11 项/26,963,353 bytes，兼容/小组件输出 39/2 项。Host 先启动 Electron 再检查驱动，但没有等待 bootstrap 的握手；没有宣称首启时序或真实设备已验收。

CustomCssJS 通过真实 app/pluginmanager 构造与登录事件可在无 MainActivity 的桌面环境处理服务端 forced_on CSS。没有独立客户端编辑页；普通选择依赖既存 localStorage，local CSS 也依赖服务端接口成功。多服务器桌面会跳过 Branding/Css，不能把两者视为同一入口。新增真实固定材料的 AMD/DOM 隔离回归，证据不升级为 GUI/真实服务验收。逐项依据及静态 IL 方法见[资源退役合同](LEGACY_RESOURCE_RETIREMENT.md)。原始快照、声明、三个保留文件与 Carnival 状态不改。


## 2026-10-22 — 14 项旧资源用途与独立剥离候选

核对安装、启动、菜单和手工 BAT 后，从新装配输出剥离两份旧 BAT、四份备用 CSS、字体、全局 mpv 预设、Anime4K-off.conf 及旧注意事项，共 10 文件/26,963,353 bytes。保留 system.xml 种子、中文播放器翻译、CEC cancel 标记和 CustomCssJS CSS 定制；Carnival/MainActivity 候选保持。原始 vendor 和 manifest 只读、全部输入哈希及版权/许可声明保留；来源和许可未闭合项不会因发布包瘦身自动解决。

兼容/小组件实际输出为 39/3 项，新增 runtime 数量/字节/树身份及排除清单；重新夹回旧资源直接失败。真实材料参考侧用固定 manifest 与独立十项批准差值比较，812 个基础文件、927 个共同变换后的中间文件一致；CSS/禁 JS 与首次配置回归保持。运行时 provenance 夹具首轮仍复制旧 notice 而失败，修正夹具走同一排除阶段后单独复验，原失败保留。Windows 完整包、安装/升级、真实播放和硬件验收尚未执行，不套用 v0.3.16 云包证据。详细逐项理由、包体影响及复验入口见 [资源退役合同](LEGACY_RESOURCE_RETIREMENT.md)。


## 2026-10-22 — v0.3.16 测试版准备

在 main 37ee98e 基线上统一 0.3.16 元数据与发行文件，保持产品源码、固定组件、依赖、播放器逻辑和 notices。手动 Windows 工作流增加显式 release_package 布尔输入，同一只读作业可生成标准安装包名、运行完整显式材料集合并暂存标准五附件；默认测试包流程保持。不会自动发布或新增写权限。

基线相对已验收组合 609c32e 只有文档、CI 和测试变化。最终 source、Windows run、Tag 和五附件仍待核验，未做新包 GUI、真实播放或系统安装；详见[发行合同](V0316_RELEASE_CONTRACT.md)和[发行核验](V0316_RELEASE_VERIFICATION.md)。

## 2026-10-22 — 材料自测去除隐含旧包输入

导航 DOM 夹具使用 `vendor/web-snapshot` 并校验其材料，39 个原断言用例不再因旧路径注册为 skip。runtime 自测参考侧直接按独立组件清单构造基底，不调用被测组装选择逻辑；先核对 822 个基底文件，再核对 937 个共同变换后的中间文件。完整历史复制对照不能用现有组件伪造，原断言另存显式外部参考审计，缺少显式参数即失败，不下载旧包。

Linux 显式材料集合 131/131 通过，0 fail/skip/cancel。该验证不等于历史完整包等价性或 Windows 产品验收；未执行旧参考审计、helper 编译、安装器或真实应用。产品源码、vendor、依赖和 CI 工作流不改。

## 2026-10-22 — 按完整事件差异分流公共 CI

新增无外部依赖的路径分类器及轻量文档检查器，使用已审普通文档白名单，排除 build-input-contract 的 notice/来源合同及所有未知路径。NUL 分隔差异覆盖重命名两端、删除及整个 PR/push；零 before、浅历史和无法证明范围完整时选择全测。原 windows-public-offline 在同一作业内执行实际选中检查，摘要记录未执行回归，完整手动打包定义保持。

针对性 Git 夹具覆盖纯文档、代码/构建配置、混合多提交、synthetic merge、force push、重命名/删除、缺失 base/head、未知/截断差异及轻量检查失败；CI 专项 44/44、构建输入合同 19/19 通过。三份编辑文档轻量检查及 YAML/语法核对通过，不重跑大包，不改产品或依赖，不自动推送/合并/发布。Knowledge Review：后一个 docs 提交不能抹去整个 PR 中的代码；Markdown 也可能是构建与测试输入；轻量作业成功不能称公共回归已执行。旧额外材料夹具失败/跳过保持单列。

## 2026-10-22 — 独立官方 Model 云构建组合

从成功 Actions 提交 cb5dc47 建独立分支，核对 Model 分支基于 ad14a95 后，仅以三方合并整合 951324d 两项提交。只解决两份记录文档冲突并保留两边内容，未用旧基线覆盖新的归档、Actions 或物理临时根修复。Model 新成员和官方 ZIP 身份均锁定，云端总结补充 ZIP/成员哈希；完整组合结果单独绑定新的 sourceCommit。未运行真实 Host、GUI 或 ACL 操作。

## 2026-10-22 — 发行标题只保留版本与渠道

27 个非草稿 Release 仅调整 `name` 为完整原 Tag 加一个空格及“测试版”或“正式版”，具体改动保留在原详情中。按实际 `prerelease` 标志区分 21 个测试版与 6 个正式版；逐项写后回读及最终列表核对通过，全部正文、104 个附件、Tag、目标来源、发布时间及 Latest 保持。未改应用或依赖，不新增运行验收结论。

发行规范与模板同步适用于全部现有及未来版本，不限制主次版本号；特殊非版本对象先确认。Knowledge Review：Release 显示名、产品 Tag、渠道标志和原始 notes 是不同字段；标题简化不应移动 Tag、替换安装包或批量重写历史正文。

## 2026-10-22 — runtime provenance 夹具物理临时根

标准托管运行已从 Git 恢复固定 libmpv 且材料准备通过，随后三项来源测试因 OS 临时父路径别名失败。三个夹具统一将新建目录解析为物理路径；新增父路径 junction 的正常来源写入/验证及输入子 junction 仍被拒绝的集成回归。受控别名旧源码 0/3、新源码 4/4，原错误信息一致；保留云运行 1398/1401 失败证据，不弱化生产路径校验，不重试 SourceForge。

## 2026-10-22 — 固定归档分支分发与云端恢复证据

按更新授权整合本地原始归档恢复提交，保留完整上游 7z 与既有版本/DLL 哈希，明确成品源码说明覆盖未完全核实的限制。旁置许可证、来源和固定源码获取说明，不创建书面源码要约。手动构建要求没有 .work、dist、node_modules 或 prepared libmpv，输出归档 Git blob 与准备前后状态；未把旧 Work 包或缓存当作干净 runner 结果。云端测试和包身份必须另按 run 核验，不自动合并或发布。

## 2026-10-22 — 原始 libmpv 归档本地恢复试验

保留原始上游 7z 字节，不将大 DLL 入 Git；新增 HEAD blob、路径与固定身份验证。生产恢复入口改读仓库归档，禁止隐式下载；旧受控 HTTP 诊断夹具保留。缺失、损坏、未提交/脏归档、准备缓存掩盖、路径重定向及冷恢复离线回归通过 29/29。公开上传仍暂停，未触发完整云下载，也未发布或合并。

干净本地克隆经仓库 Git blob 恢复相同 DLL，下载缓存与旧包均不存在。公共回归整轮 1284/1286，两个失败源于漏装锁定 gRPC 依赖，补齐后原工作树两个文件 60/60；组合覆盖 1318 个独立用例，原失败记录保留。原始成品资料核对与额外依赖审计分开，后者的未完成不自动等于禁止转存。

正常读取固定公开 builder/mpv/FFmpeg 源码及原始构建日志，重新校验三个源码 ZIP 的历史哈希。脚本中的分支更新与缓存依赖不能代替完整 resolved source lock；未把 recipe 列表当作实际链接组件清单，未假定对应源码义务已满足。来源与完整现有许可证文本通过归档旁说明关联，未伪造新上游授权。

## 2026-10-21 — libmpv 失败回执与输出去重

保留已校验的跳转 host/path 和状态，仅记录受限 Server 产品家族、CF-Ray、Retry-After；查询、认证、Cookie、正文与底层原始异常均不回显。每次失败带独立 attemptId 和脚本层计数，Node 显式捕获 stderr，避免 execFileSync 的自动错误回显造成重复报告。生产命令行继续只接受原参数与固定官方 HTTPS 路径，库级发送测试入口只供受控回环 HTTP 回归。未发起真实归档下载、对外消息、主分支合并或发布。

## 2026-10-21 — 托管 Windows 手动打包入口

为现有公开 CI 添加事件隔离的手动标准 runner 作业。新增固定组件与原工具链恢复入口、安装包逐文件比较器及完整打包编排，上传采用明确文件白名单与一天保留期。保持只读 token，不添加凭据，不执行安装或客户端，实际远端构建完成前不宣称干净 runner 已验证。

## 2026-10-22 — 固定官方 Model 构建输入

从 ad14a95 独立集成已验证的官方 Windows 3.0.20 Model，保留组件路径、旧件 Git 历史、严格文件/路径/重定向门禁。将历史 Model 等字节要求改为显式替换路径，新增固定归档预检与唯一成员恢复，来源记录绑定恢复脚本；合成组装对照同时应用相同替换，并断言官方候选与历史夹具不同。原 Host/Electron/libmpv 和产品播放代码不动。

回归与生成物证据和既有真实播放验收分层记录；后者不覆盖声音听检、字幕切换或本次新包。应用数据 ACL 残留属于独立恢复问题，本次不触及用户配置、GUI 或安全设置。不推送、合并或发布。

静态基底 822 项和完整中间产物 937 项逐路径/大小/SHA 对照通过，历史对照显式应用同样官方 Model 替换。隔离组件 40/40 包含本地接口和 7 组内存更新场景；官方 ZIP 实际恢复及合成归档拒绝边界已执行。全量自动化日志、最终 sourceCommit、来源绑定与 payload/候选包身份分别记录，保留先前失败回执，不把工具或夹具修正混作产品播放修复。

## 2026-10-21 — v0.3.15 发行闭环

按用户批准合并PR #59，准确产品source固定`e150981d85369b9e61559ee53978a25cdad6f7ad`并建立新隔离构建树。最终本地公开1202/1202、材料212/212、345 JS/28 PowerShell语法与396文本有限模式通过；实际构建输出的Electron/媒体控制模块四组关闭场景退出0。main与annotated Tag CI各1202/1202通过后才公开Pre-release。

标准安装器及五附件均来自最终main，2163完整文件与解包逐路径/大小/SHA一致；安装器175756102字节，SHA-256 `15d750c1babddefd6d4cfc02dd52103e7189e38afe3870113000c34ae5e0bace`，未签名。五附件匿名完整回读通过，旧26个Release的受保护字段、99附件、56行旧Tag引用保持；v0.3.14正文仅两处计划文字按授权更新。产品Tag与原始notes不随本次后续文档提交改变。

Knowledge Review：实际窗口销毁验证、真实媒体与完整Host验收分层记录；候选、最终产品source、后续文档HEAD及网页正文各有独立身份，不覆盖旧发行字节。

## 2026-10-21 — Windows 任务栏媒体控制退出修复

原 `closed` 回调在窗口销毁后重新读取 `window.webContents`，抛出 `Object has been destroyed` 并中断后续清理。绑定时缓存所属 emitter；dispose 入口即设置幂等标记、取消重试并退休状态，清完自有监听后仅对存活且已注册按钮的窗口提交空工具栏。迟到 IPC 检查销毁状态，原 sender 校验、命令和有限注册重试保持。

回归模拟销毁后抛错的 getter，覆盖播放/暂停后关闭、before-quit/closed 顺序、已销毁窗口、重复/重入清理、迟到 IPC/重试和工具栏清空失败。原发布源码 13/17，修复 17/17；固定 Electron 44.4.2 原源码三组复现异常，正常 before-quit 顺序通过，修后四组全退出 0。初版 harness 将 Electron 内部监听误算为模块监听，已改为核对本模块新增函数，原结果保留。公开集合1202/1202、六项材料文件及十九项显式材料自测212/212通过，失败/跳过/取消均0；345 JS、28 PowerShell语法与396份文本有限模式检查通过。

用户授权准备 0.3.15，根 package/lock 根版本同步，依赖及工具链保持。候选与最终 main 的测试、构建和发行身份分别记录；不自动合并。Knowledge Review：缓存 emitter 可移除 JS 监听，不表示销毁后仍可从 BrowserWindow 获取它；隔离窗口及注入播放状态不等于真实媒体或完整应用退出验收。

## 2026-10-21 — 误发临时发行对象清理

在正常 0.3.14 已公开且完整回读通过后，按明确范围对误发 Release 419485449 执行一次删除，返回 204，并核对其 Release 与六附件 API/下载入口均为 404。保留该 baseline Git Tag 和六份本地原文件；所有其他 Release、资产与 Tag 身份不变，包括正常 v0.3.13 和 v0.3.14。发行文档分别记录发布时的旧对象保持与后续这一项清理，不把源码 Tag 保留误写为安装包下载入口仍可用。

## 2026-10-21 — v0.3.14 标准测试版发行完成

版本准备分支经 PR #57 正常合并，以 `ce9310e1c8392af174e4bb5cd3f84e8a6ab0c867` 新建正式 runtime 与安装器；annotated `v0.3.14` 绑定该提交，Main/Tag CI 各 1198/1198，Tag CI 于 2026-10-21T12:37:02Z 完成，Release 于 2026-10-21T12:46:07Z 公开。初始网页正文及 RELEASE_NOTES 附件采用产品 source 的原始 Git blob，严格使用标准五附件，不设 Latest。

最终 source 全量本地 1280/1280、显式材料 130/130、345 JS/28 PowerShell 语法、396 文本有限模式及固定工具身份通过。2163 个 runtime/解包文件一致，五附件匿名完整长度/哈希回读通过。旧发行对象保留，未运行安装器、应用或真实媒体/服务。本条只记录实际发行事实；下载导航和核验更新为独立文档变更，不改变产物 source、Tag 或附件。Knowledge Review：候选包、最终 main 包和后续文档 HEAD 是三种身份；成功上传和事后 CI 通过不能替代公开前 Tag CI 门禁。

## 2026-10-21 — 0.3.14 版本与发行流程准备

独立发布修复分支固定 bb0c3a9 功能基线，只统一根 package/lock 为 0.3.14，按既有模板准备菜单与首页恢复的用户说明、合同及核验初稿。版本由原构建链传递到 runtime package、manifest 和安装器，不手改生成产物，不升级依赖。

后续在准确提交上重新测试与构建，候选结果绑定仓库外回执；正式产品仍须经批准合并后从 main source 重建，Tag CI 完成才公开五附件。旧临时 baseline Tag、Release 和附件保持，文案处理另行审核。Knowledge Review：上传校验不能替代版本一致、source 中的 notes、发布前 Tag CI 和发行文档流程。

## 2026-10-21 - Independent compatibility resource acquisition

Select the exact 48 manual/external assets, lock every runtime path/size/SHA, import only the whitelist and preserve current bytes/notices. Move normal assembly/material/provenance reads to the independent snapshot; keep strict checks for the remaining five old inputs and all current components. Add absent-old-resource and input redirect/tampering coverage; compare complete static payloads. No UI/Model/version/final-product-baseline merge.

## 2026-10-21 - Remove the last normal patch-directory dependency

Create a one-file local snapshot component with strict size/SHA/path/extra-file checks and explicit current versus historical/public-candidate provenance. Route build, preparation, material gate and source provenance through it. Keep independent old DLL bytes only as a deliberate comparison oracle. Do not substitute another version or claim current online recovery. See [component contract](LIBMPV_INPUT.md).

## 2026-10-21 - Reuse fixed official resource acquisition

Add five previously hashed exact official ZIP members to the existing component whitelist, source/notice records and strict validation. Reuse dynamic assembly/provenance selection without introducing another prepared tree or changing generators. Test missing old resource paths and compare complete base/intermediate/Web outputs. Preserve prior prepared material as local evidence; do not overwrite or delete original inputs.

## 2026-10-21 - Remove small-template physical dependencies

Record official package/config references and retained differences; preserve the seven-line bridge without claiming authorship. Normalize tracked text, verify source/generated hashes, and distinguish source versus transformed-base identities in provenance. Compare generation against a separate old-material oracle, including final package serialization. See [templates](RUNTIME_TEMPLATES.md).

## 2026-10-21 - Pinned upstream npm preparation

Pin source commit, blob/SHA256, exact newline transform and output identities instead of relying on Windows checkout settings. Update base assembly, material and dependency/source provenance together so no hidden old npm read remains. Preserve upstream bundled metadata and code rather than replacing with newer registry packages. See [component contract](INHERITED_NPM_INPUT.md).

## 2026-10-21 - Gate-only predecessor retirement

Separate consumed input validation from historical provenance. Retain the tracked full manifest, label metadata-only identities explicitly, reject overlap with required paths, and keep active hash/link/extra-file checks. Add absent-predecessor and current-input tampering regressions; use an independent read-only historical oracle for whole intermediate payload comparison. No product, Model or dependency changes. See [selection](LEGACY_INPUT_SELECTION.md).

## 2026-10-21 — 公共测试的 Linux 开发支持

三份测试修正路径夹具，两个测试使用跨平台 PowerShell helper；保留产品路径拒绝规则、原断言和 Windows 的真实文件系统/原 shell。五项诊断与编码集成增加明确的非 Windows 跳过原因，既有四项跳过保持；公共 runner 和 Windows workflow 未变。新增注册检查实际加载五份测试，确认 `win32` 不被跳过，Linux 的跳过均有原因。

Linux 原集合 1193 项为 1150 通过、39 失败、4 跳过；修后新增 5 项回归，全量 1198 项为 1189 通过、9 跳过、0 失败/取消。34 项原失败变为通过，5 项 Windows 集成保留 Windows 执行义务。345 JS/28 PowerShell 语法、396 文本有限模式扫描及 diff 检查通过。Windows 实跑、材料、应用/Host/安装与真实播放未执行；不扩大为跨平台产品运行结论。Knowledge Review：宿主临时目录不等于产品客户端路径身份；shell helper 可移植不代表 Windows PowerShell 5.1 编码及嵌套诊断集成可由 Linux 替代。

## 2026-10-21 — 文件级基线组装接续已推送源码

从已核验e286aee独立接入stage1组装器和测试，保留新菜单/首页/Windows媒体代码；原补丁的三份状态文档开头因新记录变化，人工补入本条，未覆盖新记录。新增工具由既有manifest、产品Git tree、Web合同与npm lock推导文件清单，复用新runtime owner，拒绝额外/缺失/篡改输入及链接路径，改用逐文件排他创建。该基线复制797项、跳过212副本；完整prepared材料及历史来源验证保持。

来源和依赖版本不变；Windows原生FFI仍按基线保留为独立试验。公开离线回归1193/1193、显式材料合同211/211及固定材料中间产物对照1/1通过，937输出逐路径/大小/SHA一致；固定工具输入、语法和有限凭据模式检查通过。正式构建使用现有可信工具，产物和sourceCommit绑定回执仅在隔离目录，不安装、不运行真实服务、不发布。Knowledge Review：构建复制动作与材料可用性是两层合同；新源码/overlay提交后必须重算清单，不能把旧基线计数作为新结果。

## 2026-10-21 — 菜单、首页与 Windows 媒体本地候选

- 增加 ActionSheet 空列表 CSS overlay 及固定源/输出哈希关系，保留原组件行为。
- 首页增加可取消的 3 秒身份等待、请求代次检查和失败 pending 释放，错误态保留通用文字。
- Windows 媒体模块复用原播放器和输入链；preload 提前捕获模块，原 play 入口传入原实例幂等绑定。SMTC/DWM 保持主窗口、媒体代次与资源清理归属；任务栏注册按窗口显示状态执行，并处理有限失败重试和 shell 主题。
- 增加试验入口单实例唤回与专用快捷方式身份工具，Koffi 3.3.3 依赖单独锁定；正式构建仍不装配原生试验依赖。

此前公开回归 1170/1170、材料相关 82/82；最终媒体定向 47/47，首页同断言修前 17/24、修后 24/24，空菜单隔离几何 32 组通过。真实接口/播放检查与用户有限人工接受分别记录，未外推未执行的多屏、长时或正式安装验收。提交前额外全量复验遇到受限临时目录的原子重命名权限错误（EPERM），该次不记为回归通过。本轮不打包，技术合同见 [Windows 媒体控制](WINDOWS_MEDIA_CONTROLS.md)。

## 2026-10-20 — v0.3.13 测试版发行收尾

v0.3.13 Pre-release 已公开（Release 417908398），PR #52 合并后的产品 source 为 `d313e93a9d0920af7ed27cd1743d6bb9c9178d4d`，Tag 对象为 `70e236f58e89d21f00d89f066020185f24197b13`。Main/Tag CI 各 1142/1142，产品 push/PR CI 成功；固定材料 211/211，runtime 2160 项、VerifyOnly、InnoUnp 与完整解包 SHA 核对通过。安装器 175752088 字节，SHA-256 `4d67499f5716bc10f4ca936757a274b0a57a7f621843d27043604ff49d00a923`，未签名。五附件匿名完整回读均通过：安装器 21 段连续 Range 覆盖全部字节，另四件完整 GET，均未发送 Authorization。旧 24 个 Release、89 个附件和 51 行 Tag 引用及 Latest v0.3.1 保持；详细身份见[发行核验](V0313_RELEASE_VERIFICATION.md)。

本版仅 F1/F2 与版本/来源元数据；整体退出期限和强退策略未改。未执行真实故障注入、完整安装矩阵、播放/远控、Helper ready 或 loaded-image SHA 验收；许可未决事项保持。

## 2026-10-20 — 0.3.13 发行准备阶段

用户有限试用反馈后授权 Pre-release 发行。F1/F2 候选 d4f6e8b 的生产差异保持，只同步 0.3.13 版本和发行说明；按正常 PR/Checks 合并后重新绑定最终 source 构建，不沿用 0.3.12 本地安装器冒充新来源。原候选公开离线 1142/1142、材料 211/211 与包体证据保持各自身份。真实故障注入、安装/播放/远控与硬件验收未新增；R1 及许可未决状态保持。原有正式版、Tag 和附件不修改。

## 2026-10-19 — 退出状态与清理等待修正

修正controller将有PID child error误作exit的问题：error持续监听且transport终结仍幂等，仅无PID的spawn失败直接结算，真实exit继续拥有进程终结确认。main原before-quit中的cleanup同步逐项启动，throw转换为拒绝并记录固定step；所有阶段结算后统一quit，避免单项失败跳过其他owner的pending收尾。power退役、PlaybackManager/Session、generation、service归属和原kill等待策略保持。

两份真实源码VM回归覆盖重复事件、启动失败、同步/异步失败、其他阶段pending和单次quit；同断言固定39882基线2/19通过、修后19/19通过。完整公开离线集合1142/1142（失败/跳过/取消0），tracked语法327项和有限凭据模式378项及新增测试补充检查通过。原始验证日志留在仓库外；复现命令见[测试说明](TESTING.md)。本地差异尚未提交，不代表发行构建或实际客户端验收；整体退出期限仍须另定合同。

## 2026-10-19 — 0.3.12 测试版发布与完整回读

用户验收本地包后明确授权发布，主线程按 Tier 1 固化来源并复核最终包体，GPT-6 Luna High 独立检查完整 runtime/解包、五附件、标签来源及导航。PR #50 的分支/PR CI 各 1123/1123 后正常合并至 `408f74df626f23c9ad1295090548d7d95bc0525f`，annotated Tag `fda6e8b2553ca04517f39f36e65899123eb108ae` 绑定该 source；main/Tag CI 各 1123/1123。固定材料 211/211，正式 source 重建/VerifyOnly/Inno/InnoUnp 完整性与 2160 项解包逐路径/大小/SHA 通过，48 个包内隔离控件检查通过。

Release 417039490 在草稿五附件身份核对和 source CI 后公开为 Pre-release；安装器 175744489 字节，SHA `7318242c49044d7dd54524a07aaf2dd399ef401c6f37df9696a6d1f6010eeaa7`。21 个连续 Range 覆盖安装器全部字节，另四件完整 GET；匿名回读未发送 Authorization，完整 SHA 均匹配。旧 23 个 Release、84 个附件及 49 行 Tag 引用保持，Latest v0.3.1。来源、五件完整哈希与限制见[核验记录](V0312_RELEASE_VERIFICATION.md)，原本地验收产物仍保留且不冒充最终 main 来源。

同步下载入口、指南、打包页、文档索引和状态；后续文档 PR/HEAD 与产品 source 分开。本轮未追加系统安装、真实 Emby/CD2、播放/远控或设备验收，未操作现用客户端、个人 profile 或服务器；许可未决事项保持。

## 2026-10-19 — 0.3.12 验收安装包完成

用户明确允许本地提交本次修复及 0.3.12 版本后打包，发布须等待其后续验收。按 Tier 1 执行固定工具链打包，主线程保留来源/包体验收，GPT-6 Luna High 只读盘点材料。版本三处同步，更新候选变更说明；源码变化仅为本轮两份 STRM 文件。构建固定准确本地 commit，不混用旧 runtime 或绕过来源门禁；尚未完成的构建、安装与服务验收不记为通过。

产品 source 固定 `282d39e5558361d7ce0a443620dd0e9b566d13a5`，物理复制并逐清单验证既有材料和工具链，未升级。构建与 VerifyOnly 通过后使用固定 Inno 编译，InnoUnp 完整性/解包和 2160 项 `{app}` 全部路径/大小/SHA 通过；版本资源为 0.3.12。相对 0.3.11 仅 8 项 payload 变化（两份 STRM、版本及五份来源/依赖元数据），Native Helper 字节及生产 `testing=false` 保持。独立 worker 复核全部 runtime、Git blob、版本和 provenance 通过，主线程检查完整回执并核交付三文件复制后 SHA。

首轮测试在材料准备完成前启动，1133/1144 通过、11 项失败，原日志保留；补齐材料并固定来源后完整重跑 1205/1205，0 失败/取消/跳过/todo。材料测试 129/129、327 JS 与 28 PS 语法通过；包内实际组件/CSS 与源码的 48 个隔离控件几何及标签/禁用/隐藏/聚焦检查通过。来源、大小与完整哈希见[本地验收记录](V0312_LOCAL_ACCEPTANCE.md)。这些门禁不替代用户安装、客户端视觉或真实服务验收；该本地阶段的发行停点已由用户后续确认和发布授权覆盖；正式发行见本页当前记录，产品来源与后续文档提交分开。

## 2026-10-19 — STRM 下拉箭头与标签修正

Model Tier: Tier 1；Model: 主线程沿当前配置，GPT-6 Luna High 执行只读盘点、diff 复核和相关测试；Reason: 明确范围的标签/布局修正；Playback/Session Impact: NONE；Escalated: No。

`createLabeledSelect` 的手工标签与 EmbySelect 自动生成标签叠加；顺序编辑器的嵌套标签缺少箭头所需的定位容器。改用组件 `label` 属性，顺序字段增加独立 wrapper/ID；局部 CSS 将标签放在第一行、选择器与箭头叠放在第二行居中，取消旧占位与固定 margin 对齐。保留 `aria-label`、选项值、`dataset.index`、事件与持久化语义，vendor 保持只读。

验证使用 v0.3.11 发行 runtime 的原始组件、主题和 Electron 44，以合成 custom 规则渲染源码；明暗主题 × 1280/760/680/420px 的 48 个选择器均中心差 0、箭头在控件内、没有横向越界，每个控件有唯一关联标签。另核对 ID、禁用隐藏、编辑器隐藏与聚焦缩放；Edge 隔离静态卡片截图辅助检查桌面/窄屏箭头。音频 2、视频 7、CEC 1 个原生选择器采用组件标签，未发现上述结构缺陷；其原生固定偏移存在小幅几何差异，本轮未改动。

执行 `node --test tests/strm-ui-consolidation.test.cjs tests/settings-visual-system.test.cjs tests/settings-night-audit.test.cjs tests/strm-settings-races.test.cjs tests/strm-connection-status-ui.test.cjs`，44/44 通过；`node --check src/electronapp/plugins/mpvplayer/strm.js` 与 `git diff --check` 通过。Electron 隐藏窗口的 capturePage 不可用，改以组件几何检查和静态快照截图分层记录；不将其视为完整应用视觉验收。未构建发行包、操作现用客户端或服务器，未提交/推送/发布。

## 2026-10-19 — v0.3.11发行与文档收口

两项CSS修正经PR #48正常合并到`3b308c7fcec44990d1a0820e1a982691d7d4e17b`，准确source重建并通过公开/固定材料与完整包体检查。annotated Tag绑定产品source，五附件经大小/digest及匿名全字节核对，旧Release/附件/Tag引用与Latest保持。

同步下载入口、用户指南、打包/路线摘要及[发行核验](V0311_RELEASE_VERIFICATION.md)。本地试用资料、原始日志与临时脚本未进入发行包或公开提交；系统安装、真实播放/远控及硬件仍按未执行边界记录，后续文档HEAD与产品source分开。

## 2026-10-18 — README 功能介绍精简

按用户反馈，仅介绍 STRM/CD2、映射助手、诊断导出及测试版的内核管理、插件设置和首页分区增强。移出重复的安装流程、路径字段与内部实现说明，保留下载、用户指南、已知问题和许可入口；不将上游已有播放、字幕音轨或 Together 能力写成新增功能。

## 2026-10-18 — 用户文档与发行说明维护

Model Tier: Tier 1；Model: 主线程沿用当前配置，GPT-6 Luna High 执行限定只读文档/Release 盘点；Reason: 明确范围的导航、事实链接和文本维护，来源与最终验收由主线程核对；Escalated: No。

基于 v0.3.10 发行后的文档 main `adec0303be1eca3c46f22223066b863da9e771cb`，补用户操作步骤、索引、发行规范及模板，修正当前排期与已知问题的版本语境。检查按文本、链接、真实附件与 GitHub Markdown 结构执行，正常公共 CI 另记；不重复材料、构建、安装或播放。远端展示文案的变更须保存逐对象前后关系并回读，原始 notes 与附件保持发行时身份。最终范围与实际结果见[复核记录](POST_V0310_PUBLIC_DOCS_REVIEW_REPORT_20261018.md)。

准确文档提交 `8f991cd8cd115afdaaf82aa75e0faa859e71dca9` 经实际呈现/三版正文审核及分支、PR 公共 CI 各 1119/1119 后，通过 PR #46 正常合并至 `39f7cf22058a578423bb2c8ef2f913545f4452dd`。公开指南 Git blob 确认后执行三个仅 `body` 的请求，逐对象及全量元数据读回通过；22 个标题、19 份未选正文、79 个附件身份、Tag/渠道与 Latest 保持。原始发行 notes、已核字节与当前展示文案的关系分开记录，本轮未追加二进制下载、构建或系统运行证据。

合并后 main [CI 39104724762](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39104724762) 原日志 1119/1119，fail/cancelled/skipped/todo 均为 0。仅同步本报告、项目状态与维护记录三份收尾文档，最终文档提交及其公共 CI 独立核对，不改变已发布产品身份。

## 2026-10-18 — v0.3.10 发行收口

v0.3.10 Pre-release 已公开，产品 Tag 固定 v0.3.10 → 73a5379983e2be2a2bc0bdc8aec8f0fcb5f07d63；Stable/Latest 保持 v0.3.1。准确发行、CI、材料、包体与匿名附件证据见 [发行核验](V0310_RELEASE_VERIFICATION.md)。文档 HEAD 后续独立记录，不改变产品 Tag/source。系统安装、前台、真实 Helper ready/加载映像 SHA、播放/远控与设备验收保持 NOT_EXECUTED/UNKNOWN；许可未决按许可说明保留。

固定材料复制及独立逐文件核对通过；JSON/TSV 集合摘要不能跨序列化直接比较，原汇总失败与首件保留。核心观察器按原始 Git blob SHA 和数值 PE 版本修正后组合核验通过，未重打产品或重跑材料。匿名下载的后置汇总丢失元数据字段，由同次 API 原件补充独立回执，原五附件完整字节和初版回执保持。低成本 worker 提供私有审计、下载与文档适配草案，主线程实际审代码、修正观察器并执行门禁，父独立包体审核通过。

以下准备记录保留其当时停点。

## 2026-10-18 v0.3.10发行准备

Model Tier: Tier 1处理明确版本/文档/固定流程，Tier 2保留准确来源、包体及最终审核；Model: 主线程沿用当前配置，GPT-6 Luna High限定只读工具盘点；Reason: 行为沿已审四修，实际版本传播链明确，发行身份需独立核对；Escalated: No。基线d6f19c0，新managed树/分支，root旧Settings脏树和全部旧包/资料/回执保留。

根package.version、lock顶层version及packages[空键].version三处改0.3.10；runtime/manifest/Inno版本由既有链生成，不修改src/native/tools/tests/installer/vendor/workflow或依赖。父已实际核五字段纯validator传播没有一位patch截断，worker提供旧039脚本硬编码与材料路径清单；不为版本增加产品逻辑或重复该绿项。先交准备diff/notes父审，随后按新准确main保存本版真实公共/材料/构建/包体/匿名回读结果，不复用旧计数冒充。

## 2026-10-18 夜间有限复核与主线集成

Model Tier: Tier 2负责局部异步、Native构造合同和最终核对，Tier 1执行明确测试/资料/文档与固定材料准备；Model: 主线程沿用当前配置，worker为GPT-6 Luna High；Reason: 六包有限复核，网络及Native精确差异先经技术审核，PlaybackManager/Session/鉴权及Native协议、运行loop和关闭归属保持；Escalated: No。起点31fdc，诊断E01提交8ace992、网络A01/A02提交74855b0、文档C01/C02提交dbf91ab、Native A03提交e41a050分开可回退。

诊断safeKey复用既有sanitizeText，7项同断言修前1通过/6失败、修后7通过，诊断相邻49项通过。UDP精确两helper差异经技术审后按SHA应用，保留JSON数组/重复结果/best-effort timeout和WOL138字节/参数/回调形状；正式14项同test修前3通过/11失败，候选与实际产品14/14，原错误harness/102包长假设日志独立保留，不作为生产故障证据。callback finally清理仅证明close请求，不等同于OS退出。

Native定向检查确认WriterQueue/InputReader在线程成员初始化时启动run，后声明的状态成员尚未构造。经精确技术审核，仅将两处线程启动移到构造函数体，按批准SHA核对实际产品字节；字段布局、run/close/dtor和协议保持。同一受限源码合同修前1/3、候选和实际产品3/3，相邻9文件Node/fake集合78/78。固定GCC编译的单线程替代模型保留早期fixture编译失败，最终准确提取before/candidate声明与构造器；主线程独立核全部state marker及负对照。模型不证明真实线程race、Helper崩溃或播放结果。

最终构建候选固定e41a050，使用新的冻结树避免覆盖早期dbf材料/构建回执；固定材料复制后完整/独立重哈希。24材料文件210/210实际退出0，标准build/VerifyOnly及109普通源码Gitblob绑定、Native CPP另核blob、51输入4notice、完整2160文件ZIP回读通过。ZIP240470557 bytes/SHA-256 e1d524aaa175fc68f58abe82f9bc559b755b7eef6203409c3bf3554a9b94debe，生产Helper testing=false/SHA-256 baaef0f2c4599cd48a2bfbb7bc188071dc548d57ddf3ee794fe5baeca3589494，默认libmpv身份保持。Helper字节随批准cpp修正变化；实际生产Helper未运行。随后纯报告文档HEAD不替代该候选来源，旧dbf候选及原回执保留。

当前main十文档、21Release、PR43与产品tag已做有限只读身份/事实核对，未发现必须改旧Release正文之处，原对象快照保存。PACKAGING保留037历史全段，LICENSING只改030段标题，未决许可正文保持。前台/安装/真实服务器和UDP硬件未执行，签名及其它暂缓项未启动。PR #44已在父实际累计diff和独立候选核验通过后正常merge，代码main为`88fcac151d14a6e8d69ff5bd47db252b1d5b71c3`；分支/PR/main CI各1119/1119，8份文档Git blob与旧21 Release/附件元数据、43行旧Tag引用和Latest031读回通过。

网络首轮过程REPORT曾被补注，原字节未保存，原probe/log/RESULT及事故说明保留，不声称原报告已恢复。编译模型早期失败和修正后实际输出分别保留；回调、fake和源码合同不替代系统退出、真实网络或线程调度验收。最后纯文档同步不更改已核e41源码/输入及本地ZIP身份；最终文档CI和准确HEAD另存交付回执。

## 2026-10-17 发布后的范围准备

Model Tier: Tier 1文档准备；Model: 主线程沿用当前配置，GPT-6 Luna High限定只读系统能力盘点；Reason: 只同步实际交付/剩余条件，不改产品，显示跨层决策保留父审；Escalated: No。准确基线为8f46ed4（公共CI1095/1095），产品source06d与Tag分开。最终远端回读检查器首次误将GitHub LF与Windows CRLF工作文件比较，原失败/脚本保留；新检查器比较准确提交Git blob后通过，没有修改产品或远端来迁就检查。

核对现有CHANGELOG/架构/显示合同与维护源码，补后续范围及当前ROADMAP，纠正安装未测条目的已完成部分，保留完整矩阵和硬件未知。CEC构造请求、WOL/发现协议及开机启动能力广告分别按静态证据记录；没有设备/发包/系统启动项执行。签名、缓存、切轨延迟、圆角和硬件缺口暂缓，已有Web/菜单/手动mpv管理不重做。文档diff/引用/有限隐私检查与父实际审核是本次准备门禁；不重复材料、构建、H7或公开下载。

## 2026-10-17 v0.3.9公开发行与H7收口

Model Tier: Tier 2；Model: 主线程沿用当前配置，GPT-6 Luna High承担限定材料/静态检查与文档草稿；Reason: 版本改动明确，来源、安装器、进程及资料边界由主线程和父独立复核；Escalated: No。PR #43正常merge生成产品source `06d34a712e26e0d6d0b299b487cfd68625df71ed`，准确main标准runtime/固定Inno新安装器构建通过；7个版本/来源身份文件差异、2153字节一致，Native testing=false。main/Tag公共CI各1095/1095、材料210/210，无依赖或功能代码变化。

父批准精确V3 runner后只执行一次H7 038→039，预检重hash原备份/资料/当前038/可信包；root与child绑定句柄读到实际0、所属TEMP消失，完整039 payload/登记/两入口及994项资料保持通过，未启动应用。父又独立5组全量安装后读回及fixedAppId/所属进程检查通过。公开现有5附件后匿名下载全部字节，安装器21个range按序覆盖并组装重hash，4小文件完整GET；provenance/notes/SHA关系、旧20Release与43行旧Tag、Latest031保持已读回。[发行核验](V039_RELEASE_VERIFICATION.md)记录实际范围。产品Tag留在06d，随后文档提交不重标。

材料测试实际只跑一次210/210；worker误覆盖初版解析失败回执的原字节无法恢复，原日志与后续独立校验/事故记录保留，不能说已恢复原件。上传5文件实际成功后的一次只读Latest请求EOF由新只读回执补核，没有重上传。旧H0–H6及其失败/TEMP分类保留，本次不增加完整14项或播放验收。

以下为按阶段保留的历史执行记录，旧未发布/待核/038当前态已被本节实际结果更新。

## 2026-10-17 v0.3.9真实版本发行接手

Model Tier: Tier 2；Model: 主线程沿用当前配置，GPT-6 Luna High只读盘点明确发行工具链；Reason: 版本改动明确，来源/包体/当前主机升级边界留主线程，普通检查可委派；Escalated: No。用户新指令明确即使无功能修复也发布安装升级验证039，旧不发空版的收口选择已被覆盖。隔离发行树从5b0ccce开始，原main基线a1b2a04、038产品source0bbc504分开记录。

本次产品差异限根package/package-lock版本，说明文档如实记036↔038有界验收与沿用038功能。固定原工具链和材料重新绑定最终正常合并main，标准新0.3.9安装器不由038文件改名；新runtime逐文件只接受版本派生/来源身份元数据差异。旧038资产、profile/DeviceId/原036备份及父恢复Desktop均保护。新039包和private runner精确source/hash/参数先父技术核，再一次同目录升级，不复跑卸载矩阵或启动应用。

原H0–H6父最终审核已完成，独立8组0失败，桌面入口后由父按H0原件exclusiveCopy恢复；这些既有结果不升级成039新包、完整14项或播放验收。公开五附件来源/匿名字节校验、Latest031保持、后续规划的有限范围按新发行合同执行，当前只处准备，没有新远端写入或安装。

## 2026-10-17 v0.3.9有界系统验证收口与038恢复

Model Tier: Tier 2；Model: 主线程沿用当前配置，GPT-6 Luna High独立审已落盘回执；Reason: 父接受固定工具链残留语义后恢复已授权H6并收口真实证据；Escalated: No。父实际读官方固定6.7.3源码和本次self-copy SHA/空marker，接受仅这两项无额外/无reparse的延后残留。新增独占分类接受回执，旧H5_A2 FAIL不改；没有手删或额外卸载来触发清理。

H6前再次核原036程序/资料备份完整集合及SHA、当前APP仅原debug.log、登记/两shortcut空、994项资料保持、无所属活进程、两项TEMP字节与post回执相同及可信038包SHA。H6实际root/child绑定句柄exit0，完整声明payload2159及manifest准确，实际2163文件/3extras，所属setup TEMP消失。后续独立最终全文件读回与H6_after一致，固定登记0.3.8/source0bbc504、当前fresh uninstaller/dat归属及哈希可读，开始菜单目标/工作目录/图标正确，桌面任务原默认unchecked。原036备份和两参考包再次全量校验可用。

最终profile994文件/93727294字节及有效DeviceId文件不变。7次实际root操作为6次setup和1次uninstaller；H1初次未知root退出保持原失败，H1_A2实读7，H2/H3/H4/H5_A2/H6实读0。当前所属进程0、app启动0；精确已接受的uninstall TEMP两文件仍在，不作文件零或全盘临时目录清理宣称。H0三次私有工具/门禁失败、H1观察失败、H5 preexec表示失败和H5_A2立即归零假设失败全部保留各自独占回执。无产品改动/确认缺陷，不生成039版本/包或远端写入；本机子场景之外的原矩阵与运行/前台验收继续未测。状态完成于有界证据交父最终复核。

独立worker的落盘回执一致性审计已由主线程实际读回：阶段exit/每实例绑定句柄退出、profile摘要、payload/extras计数与完整行、H5原FAIL/接受分类和H6默认shortcut状态一致，无新矛盾；该审计没有访问live APP/profile/注册表原值，不能替代主线程最终系统读回。四份文档diff/新增隐私扫描通过，src/native/tools/tests/installer及package文件仍与准确基线相同；纯文档收尾未重跑无关公开/材料全量门禁。

## 2026-10-17 v0.3.9 H5_A2卸载与Inno6.7.3残留语义

Model Tier: Tier 2；Model: 主线程沿用当前配置；Reason: 父已准登记解析窄修后真实卸载及异常门禁；Escalated: No。H1–H4未重跑。H5_A2独占新回执实际root/clone均BOUND_PROCESS_HANDLE退出0；log卸载成功、无需重启。后读回确认声明payload和manifest/固定登记/两快捷方式移除，资料994项/DeviceId字节保持、ETE进程0，APP只余原有debug.log。没有启动应用或手动清理。

所属TEMP在180秒仍有4377460字节 `_unins.tmp` 和空 `_unins-done.tmp`，原attempt按既定门禁FAIL保留。self-copy SHA与fresh uninstaller一致。官方固定tag is-6_7_3（GitHub读取解析tree c7af86b4b2fd03371185df2b09a1dca8d472ab70）Setup.Uninstall.pas 196–218/247–248创建done信号，408–460正常二阶段分支不保证立即自删，650于卸载启动调用DeleteResidualTempUninstallDirs；Setup.MainFunc.pas 1460–1624执行后续残留清理，3625–3635的Setup启动调用处于注释测试块。只读原始来源，不安装/升级工具链，不重跑卸载器或手删本次/其他TEMP。

由此形成有界验收假设纠正草案：保留旧FAIL，区分root/clone真实退出和固定工具链延后文件；只接受本次已绑定TEMP根的精确self-copy SHA及空marker，没有未知项/重解析。此时仍等待父技术分类接受，H6草案只恢复原038，入口保持该门禁且复核当前APP残留/profile/登记/可信包；没有实际执行。当前client程序已卸载，资料及原036私有备份保留，不误报038当前已安装。

## 2026-10-17 v0.3.9 H1重验及H2–H4真实完成

Model Tier: Tier 2；Model: 主线程沿用当前配置，GPT-6 Luna High静态复核；Reason: 父已接受观察器停点并准私有修复后重验；Escalated: No。观察器保持Start返回root进程Handle，已验证child绑定Handle/创建时间，CIM空路径在原绝对期限内有限重查并结合原Handle终态；真实非空映像差异、创建时间不符/PID复用仍拒绝并保存观测。TEMP只等本次目录清理、不手删。静态审查发现新脚本复制的未使用停止读回模式仍读旧H1证据，执行前已删除历史模式并禁止额外CLI参数。

H1_A2独占新日志/STARTED/PROCESS/RESULT/快照实际通过：root为BOUND_HANDLE_AFTER_EMPTY_OR_GONE_CIM，子进程为BOUND_PROCESS_HANDLE，实际exit均7；错误32/句柄释放/完整前后保持通过。H2/H3/H4分别036→038、038→036、036→038，实际exit0、每步owned两实例结束、TEMP清理及payload/source/登记/快捷方式/994项profile字节保持通过。额外文件27/28/27；H3另有038的playback-power-owner脚本，按合同仅盘点，不擅清或扩大为功耗问题。

H5尚未启动卸载器便在登记位置比较拒绝。新私有诊断及停止后全文件读回证实：DisplayVersion038；InstallLocation自H0字节未变，末尾反斜杠导致原始Equals失败，规范目标仍APP；程序/资料/登记/shortcut未变。此为私有比较器表示处理，非确认产品缺陷。已准备只允许精确APP+一个可选末尾反斜杠的窄草案及H5_A2独占回执，另拒绝卸载原路径的dot/相对/device/参数语法；仅语法通过，按父对非观察器新证据的停点等待技术核。未实际卸载或执行H6，没有产品/版本修改。

## 2026-10-17 v0.3.9受保护备份与H1实际拒绝

Model Tier: Tier 2；Model: 主线程沿用当前配置，GPT-6 Luna High分别静态复核备份及生命周期脚本；Reason: 精确主机变更与所属进程证据；Escalated: No。父已接受6a8c95b中的真实ACL失败并批准窄目的权限实现：独占创建新空根，受保护DACL仅当前用户/SYSTEM/Administrators三allow、CI/OI FullControl，Owner与权限先读回，现有父目录不改且额外write/delete/权限主体拒绝。

v3按计划完成新根保护和唯一登记元数据写入，但既有PowerShell回执使用true而非$true导致停止；原失败未覆盖。v4只读核验该本任务根的Owner/protected DACL、唯一非reparse登记文件及canonical一致性，不再修改已有根ACL，再从独占子目录继续。图标复制探针、完整程序/资料/快捷方式复制及源/目的全文件读回、源前后/登记稳定、3620条目ACL门禁全通过。H0最终PASS，2186程序/994资料文件。静态复核记录曾要求首次写入前断言新根仍为空，该断言已加入；v4实际分支无Set-Acl。

生命周期脚本先经Node/PS语法和只读036完整门禁；静态审查指出桌面shortcut缺失原会被跳过，已改成显式核任务状态：覆盖阶段沿原已选任务，卸载后规范参数的新安装沿原默认unchecked，不擅加TASKS。该H6预期尚未实测，不能报告PASS。

H1实际启动可信038一次并观察一个所属Inno TEMP子进程；持有的只读Host句柄触发安装日志PrepareToInstall failed/Windows错误32。观察器在路径一致性核对报错，finally释放句柄；回执未记录冲突时实际路径/创建时间，精确root退出码UNAVAILABLE，不把它归因为已证实退出竞态。父批准计划的预期7没有实际退出证据。停止后仅按已记录PID/父子范围只读复核：所属进程0、TEMP根已清理；另全量程序及资料SHA、DeviceId文件、固定登记和两快捷方式均与036前态一致。无强杀、无客户端启动，H2–H6未执行。下一步先补观察器诊断并父核，不弱化路径/未知/退出门禁；没有产品缺陷或039空版。

## 2026-10-17 v0.3.9 H0首次执行与隐私门禁

Model Tier: Tier 2；Model: 主线程沿用当前配置，GPT-6 Luna High作限定静态复核；Reason: 已获精确本机顺序授权，需核不透明备份与真实权限；Escalated: No。父已批准H0–H6，无新增普通用户许可停点。产品及版本不变，未执行安装器或应用。

H0首轮在备份初始化前失败：历史清单使用localeCompare，新脚本使用UTF-16排序，有序数组比较误报漂移。保留原脚本/失败回执，独立全文件重枚举/hash确认2186项完整集合、大小/SHA相同，新增/缺失/变化均0。新脚本仅统一排序并拒绝两侧大小写重复路径，独立静态复核接受；新输出名避免覆盖原回执。

第二轮通过源身份门禁后，在创建BACKUP前拒绝父目录额外读取主体。历史补充预检只筛常见宽泛SID，结论不能提升为“只有本用户/SYSTEM/Administrators可读”；实际严格门禁有效拦截。未创建备份、未复制资料、未写APP/登记/快捷方式，036保持。按合同保存具体私有证据并停在父技术复核，不放宽规则、不修改现有父/系统ACL。可行目的权限方案须在资料复制前确定，H1–H6仍未执行；本轮不因验证工具问题制造039产品版本。

实际验证：两份私有Node脚本语法检查、PowerShell AST检查通过；独立完整程序哈希复算通过；H0 v1/v2失败均保留。后续只做文档一致性与diff检查，不重跑无关产品回归。静态安装器读回未确认H1精确退出码或卸载残留集合，须结合实际日志和目标读回判断，不把静态推断当系统PASS。

## 2026-10-17 v0.3.9本机授权与只读预检

Model Tier: Tier 2；Model: 主线程沿用当前配置；GPT-6 Luna High worker仅静态读私有收集器，不运行系统查询；Reason: 真实host路径、权限、资料保留与卸载安全；Escalated: No。用户本机授权撤销guest前提，未授权其他软件/驱动/服务/启动项/电源/防护/虚拟化或个人mpv变更。新本机合同以精确私有别名约束，不把DIR/静默标为隔离。

只读核固定AppId的必要视图、安装元数据与完整文件哈希、ETE精确映像路径进程、当前令牌、空间、快捷方式及资料不透明摘要；两份已存在可信包按source/provenance/大小/SHA核实，无额外下载或复制。原包manifest列项无修改/缺失，非manifest项另列保留，不预认缺陷。资料仅必要DeviceId合法性布尔和哈希，不解析登录/Token/Cookie/服务器密码，原始路径和数据均在私有回执。

首版预检/静态问题保留；v2收窄进程WQL为精确ETE路径并修逐项扫描预算，参考祖先及备份权限用独立只读补充证据闭合。Program Files下的已核ETE子目录是授权目标，禁止其容器/Windows及工作树/备份等重叠；备份目的位于忽略私有树，不得反过来成为安装目标。没有执行安装器/应用、关闭进程或写登记/快捷方式，真实系统矩阵尚未通过；先完成父路径技术审查及实际私有备份读回再继续，无新增用户普通审批。

## 2026-10-17 v0.3.9环境交接收口

Model Tier: Tier 1（本次明确文档交接）；Model: 主线程沿用当前配置；Reason: 父已实际通过准备范围，只同步环境条件和恢复入口；Escalated: No。新增环境交接及必要状态链接，产品/版本/依赖保持。交接区分环境启动与guest固定AppId/登记/快捷方式/TEMP/UAC副作用，说明临时DIR/静默不是宿主隔离，未新增或执行系统脚本。

最小顺序为首次安装、覆盖升级、卸载保留资料、重装身份文件保留；静默skipifsilent不生成首次应用身份的结果边界明确，取消/失败/UAC按具体环境补充，不要求用户手测14项。038参考安装器source0bbc504、175754512 bytes、SHA2f0be46a17c16522f677e7a174da72815bec8d9a06ffb0181a5183670fdef2db沿既有发行证据，并只读核公开元数据对应；无额外下载/复制大包，旧包保留自己的版本来源。

独立准备已完成，停在专用可回退Windows环境及guest系统写入许可，未运行安装器/应用或改宿主。父自有证据worker结果待父实际读回后通知；不把准备范围通过扩成系统安装PASS，不凑039候选或启动040。仅文档规则/来源/链接和Git diff检查，不重跑旧15绿灯。

## 2026-10-17 v0.3.9第一停点与安装准备

Model Tier: Tier 2；Model: 主线程沿用当前配置，精确标识未暴露；两个GPT-6 Luna High worker分别只读规则/覆盖和限定环境能力；Reason: 数据保留与系统边界需主线程/父审核，明确盘点交低成本worker；Escalated: No。准确基线a1b2a04，旧038产品0bbc504和root旧Settings、所有候选/profile/资产保持。

安装身份/目录、profile/config/DeviceId、guard与失败恢复原合同已读，未发现确定产品缺陷；主线程逐项核12个Git blob与night5341相同，复用C历史15/15及D有限审核，不重跑旧probe/覆盖回执。限定命令存在性及OS能力只读盘点没有启动/枚举个人VM或读取profile/凭据；环境worker因禁止Git未判断tracked声明，主线程补做tracked文件名检查为0，仍只记项目专用guest NOT_ESTABLISHED，不推断机器没有VM。

新私有脚本仅在自有项目临时树创建3套不可执行sentinel资料，用原snapshot collector收集BEFORE；输入前后逐SHA保持，实际installer/app运行0，生命周期NOT_EXECUTED，未伪造AFTER。官方Inno退出码/静默/卸载clone合同仅作后续预期，不把退出0或隔离确认参数当系统验收。产品/版本/依赖未改，仅提交首合同与状态；后续精确环境、系统副作用和有效局部缺陷先父审，满足条件再沿授权发布，不凑039功能或启动040。

## 2026-10-17 v0.3.8发行闭环

Model Tier: Tier 2；Model: 主线程沿用当前配置；GPT-6 Luna High worker限定固定输入与私有发行脚本，父会话独立源码/包体审计；Reason: 合并后准确来源和公开资产完整回读；Escalated: No。PR42的8332cde经两公开CI通过后正常merge，产品main/Tag固定0bbc504fbb6ca98dfb7476e8078c4483347b4375，产品内容与bd候选一致，包含夜间5341四修；没有新增核心或依赖差异。

准确main公开CI与Tag CI各1095/1095，材料210/210，源构建/VerifyOnly、隐藏62项、标准Inno安装器解包2160路径/逐SHA及2154相同/6身份元数据对照通过。安装器175754512 bytes，SHA-256 2f0be46a17c16522f677e7a174da72815bec8d9a06ffb0181a5183670fdef2db；五附件按原Git blob发布说明、provenance和校验关系封存，全部匿名完整下载核验，安装器range按序覆盖全部字节重算SHA。Release非draft、prerelease，Latest保持031；后续README与状态提交仅文档，不改变产品Tag或产物来源。

首轮私有适配版的受控baseline路径/末尾LF假设已修正且原脚本保留；实际首轮审计的Node→Windows PowerShell5.1缺Get-FileHash失败及诊断保留，直接5.1 VerifyOnly通过。最终审计仅把该子调用改为与构建相同的PowerShell7并捕获输出；旧签名查询空状态不作有效证据，另在当前宿主ErrorAction Stop查询确认NotSigned。所有来源、集合、SHA、候选比较及原VerifyOnly门禁保持，安装器字节未改。失败不归为产品问题，也不擦除为首次全绿。

用户反馈主要验收USER_REPORTED_NO_ISSUE、其余MONITORING，独立真实前台/硬件/播放远控/系统安装仍未执行。旧Settings脏树、候选/profile和旧版本资产保留；不继续缓存/切轨优化或下一版。详细发行身份与五附件回读见[V038_RELEASE_VERIFICATION](V038_RELEASE_VERIFICATION.md)。

## 2026-10-17 v0.3.8测试版发行授权与准备

Model Tier: Tier 2；Model: 主线程沿用当前配置；GPT-6 Luna High worker仅准备固定材料，后续限定包体审计；Reason: 准确main来源、安装器及远端资产闭环，产品合同冻结；Escalated: No。Task Risk中、Uncertainty低、Cross-module Scope为发行工具链、Playback/Session Impact为NONE。新隔离发行树从0c8c051建立，保留bd486f5候选/profile与根目录旧Settings改动，不增改产品。

用户授权必要提交/push/PR、CI后merge、main准确构建/标准安装器、Tag/Pre-release及五附件匿名完整回读、README/状态收尾。用户主要验收USER_REPORTED_NO_ISSUE，其余MONITORING；不虚构逐场景PASS，不等待额外补测。Stable/Latest保持031，真实硬件、系统安装、主动前台及服务器业务不在执行范围；缓存/切轨性能与下一版不推进。最终产品source与后续文档HEAD继续分开，具体产物和远端结果完成后追加。

## 2026-10-17 v0.3.8准确来源本地候选收尾

Model Tier: Tier 2；Model: 主线程沿用当前配置，精确标识未暴露；GPT-6 Luna High worker限定测试、私有交付脚本/文档草案与独立runtime审计；Reason: 已准有限显示异步组合及准确来源交付；Escalated: No。最终产品来源bd486f5fa625496086248b80a3f8859dc19b19da，版本0.3.8；仅改根包及lock版本字段，依赖保持。公开1095/1095、材料210/210，JS322/PS28语法与373 tracked文本有限凭据模式检查通过；有限扫描不是完整秘密扫描。

同一来源源构建、VerifyOnly通过，2159 payload/2160完整runtime的集合/逐SHA与109产品/51输入/4notice Git blobs绑定通过；独立578/578审计确认相对夜间baseline仅8个路径变化，含2产品JS及版本/来源元数据，Native Helper/libmpv/Electron字节相同。隐藏实际组件62/62及候选launch.cjs隔离检查通过；两次实际显示/网络/Native子进程均0，正常退出且无所属残留。file协议Service Worker缓存错误保留，不计为真实网络或业务验收。

最终候选ETE-v0.3.8-display-bd486f5-20261017为2165文件，ZIP完整集合、逐项SHA及CRC回读通过；233738938 bytes，SHA-256 5aa4bcf59b70cbcddf15575f7440b5a77859dc4bb47ed35d96f70aad43724cc8。候选profile只在同级专用目录，profile/harness/私有日志不入包。build-manifest及payload-set准确SHA、启动入口和边界见[V038_LOCAL_CANDIDATE](V038_LOCAL_CANDIDATE.md)。此后只同步文档，文档HEAD与产品source分开，未重新标记产物来源。

完整B2 lease/CAS、跨renderer同值接管、显示映射与完整app-exit恢复仍UNKNOWN；人工验收USER_DEFERRED_NOT_TESTED，不阻塞有限本地交付，真实播放/远控/硬件/前台/安装未执行。保留全部初败、错误事务断言、历史覆盖事故与独立重建复验，不引用父私有未闭合补验为PASS。仅本地提交，没有推送、PR、merge、Tag、Release、部署或系统安装。

## 2026-10-17 v0.3.8 N2实施与有限组合来源准备

Model Tier: Tier 2；Model: 主线程沿用当前配置；GPT-6 Luna High worker限定恢复AMD/相邻测试，另两worker只准备私有候选/隐藏harness；Reason: N2-v2已父准，保留N1的窄恢复观察守卫与准确来源交付；Escalated: No。d0a9092仅落实N2 helper/destroy调用及有效测试，实际源与批准私有草案字节相同。未知current不写、同值才恢复，共8000绝对预算，Native/destroy不等待，失败只诊断不重试；没有新lease/协议/工具。

恢复矩阵15项及旧相关测试同一修前25/40、修后40/40，补并发destroy41/41，主线程组合155/155。首轮cross错误要求读写事务的失败保留，改为逐命令FIFO，并保留同时destroy与各自观测决策，未改产品迎合错误断言。父已读产品窄diff及并发case；额外父私有补验未闭合不引用为最终PASS。版本三字段锁0.3.8、依赖不变，后续完整门禁/构建固定准确sourceCommit；候选、运行和包体结果另记，当前未执行真实硬件/前台/远端动作。

## 2026-10-17 v0.3.8 N1按已审形状局部实施

Model Tier: Tier 2；Model: 主线程沿用当前配置；两个GPT-6 Luna High worker分别限定新增FPS合并与微任务/退休完整AMD测试，主线程保留源实现、diff和实际边界审核；Reason: N1-v2已父准，局部async工作归属；Escalated: No。产品c64923c只改libmpv的FPS工作记录/原invalidate挂接及相邻测试，不改main FIFO、destroy/恢复、Native/IPC或Session。相对父准v2差异仅括号/缩进/注释。

最终同一测试对精确311源码分别8 fail/1 pass与5 fail/4 pass，N1产品各9/9；主线程合并新回归及Native/字幕43/43，既有Play/settings/两adapter27/27，合计70/70。成功3000ms边界和原暂停出口正控有效。真实endpoint unpause排微任务的收口用例，原311通过、旧未应用外层finally草案失败、当前产品通过，三类来源分开。首轮三处fixture误算Native初始pause:false或最后FPS目标，已保留尝试并修正，同一最终测试重跑精确旧源；公开测试去掉私有输出和随source改变预期，只以显式输入替换源码，各异步组有wall timeout。

N2仍未准实施。保存基于N1的独立rebase v2草案，仅补不可用/不符restore回包的固定诊断提案，未应用且只有语法检查，不覆盖旧候选或父目录。版本、全量门禁、runtime/候选等组合范围收敛再执行；真实硬件/服务/前台/安装仍未验证。

## 2026-10-17 v0.3.8 A父审边界修正与B1局部闭环

Model Tier: Tier 2；Model: 主线程沿用当前配置；GPT-6 Luna High worker仅新增FIFO/两完整AMD测试与B2窄失败探针，主线程实现及审查main/必要FPS消费者；Reason: 已批B1的全局物理槽与绝对期限；Escalated: No。7270803修正close先于迟到timer的绝对截止检查，4项1/4→4/4；f4bbbde封闭空/非正数change结果，3项0/3→3/3；311e366实现三原动作全局FIFO、receive deadline、排队过期、exit/close与callback/quarantine/shutdown，未新增协议或工具。

B1来源311e366公开1061/1061、局部/相邻121/121、两AMD跨实例2项及main期限/队列53项通过，材料210/210、JS319/PS28、有限扫描370通过；所属惰性Node进程2次close/残留0。父实际源码复核与独立14/14通过。原4a全量npm1121/1122唯一缺prepared preload的require失败保持，固定生成后该夹具5/5通过，未弱化断言。主线程末态检查发现跨实例fixture只await函数而未调用，b165592仅修为实际shutdown调用并断言timer/入口，2/2通过；产品与此前门禁来源完全相同，未重复全部绿灯。未运行真实RefreshRate/Native、前台、显示设置或系统操作。

B2只准备N1/N2窄合同及未应用diff，source311的完整AMD8场景/292trace记录修前FAIL/正控/UNKNOWN，草案只有语法检查，不计修后。跨实例旧回执被worker误跑覆盖的原件完整性损失已保全现场与hash；独立新目录用4a Git源和历史raw SHA重现2反例/83trace，不能称恢复原件，父自有证据未动。相关worker后续只读或只写自己新目录。版本与候选继续等待范围收敛，不把FIFO当逻辑lease。

末态OS回读另发现此前Ctrl+C未结束的所属跨实例测试树；根据本任务完整命令、启动时间和父子关系确认后收口，再独立回读确认退出，没有按进程名操作其他Node。旧22项数据合同回读与最终进程退出证据分开，私有状态更新实际结论。

## 2026-10-17 v0.3.8 A局部实施与B归属设计

Model Tier: Tier 2；Model: 主线程沿用当前配置；GPT-6 Luna High两个worker限定新增生命周期及完整AMD测试，一个worker只读跨实例归属库存；Reason: A已父准的main/XHR有界生命周期，主线程保留异步和shutdown最终判断；Escalated: No。A产品只改main.js/libmpv.js原入口与必要调用，无新产品helper文件、依赖、协议或Native变更。

工具5000+1000与XHR/Play总8000预算按父准落地；未退出保留隔离，shutdown拒绝单独隔离，原Native/kernel/startup drain继续。显示失败只在displaySync降级，旧Play取消仍superseded；FPS失败清资格并只允许current解除其原暂停，原成功3000ms保留，恢复未await仅catch/已知值检查，B语义未实施。原22生命周期修前4/22、额外3项0/3，AMD初始14项4/14；最终相关104/104通过。新增测试暴露迟到timeout二次abort及首轮shutdown fail-fast，修前日志保留。Windows所属惰性Node子进程2次close、残留0；未执行RefreshRate/真实Native/前台/显示设置。最终公开验证另记准确来源。

B设计基于实际固定Web构造/重载库存及固定Electron44.4.2 ProtocolRequest文档，不能证明生产跨renderer singleton；[设计审查](V038_DISPLAY_OWNERSHIP_REVIEW.md)列出全局物理队列、局部lease字段/挂接/状态和不能保证跨实例接管的缺口。只设计及补失败探针，未把A局部门禁计作最终038候选验收。

## 2026-10-17 v0.3.8 显示兼容证据与首个合同停点

Model Tier: Tier 2；Model: 主线程沿用当前用户配置，精确标识未暴露；三个 GPT-6 Luna High worker 仅收集工具/XHR、完整AMD归属竞争及映射/窗口证据；Reason: 跨main工具与renderer显示异步，产品实现前固化调用图和父审边界；Escalated: No。隔离分支codex/v038-display精确基于e2b0eff，旧树/profile/候选保持。

10个超时目标场景与调度器自检证明当前没有deadline；最终5个完整AMD场景与146条trace确认正常unpause、并发写的stats/物理值错序、Stop/Next后旧工具落地和盲恢复第三值。主审要求重做计数式时钟、未接setProperties的否定断言，并用现有stats出口纠正后续请求的时序推断；原尝试保留，采用真实可控调度与正向对照证据。协议16/16、设置2/2、全屏11/11通过；现有固定材料复制和4项身份核验通过，没有构建新runtime。固定Host参考源码已实际只读读取并记录SHA，当前生产窗口映射仍UNKNOWN，源码与二进制可重复构建关系未建立。

[合同](V038_SCOPE_AND_CONTRACT.md)列出限定文件、一次完成/有界清理候选预算、物理操作与播放owner差异、外部设置优先和验收矩阵；预算来源仅为项目既有请求上限类比与明确新假设，待父审。当前只文档/私有证据，无新产品修改，不声称硬件、真实服务或前台PASS。

## 2026-10-17 有限维护最终父审状态收尾

父会话已实际复核产品source5341f32985aabefa03f789b1428d8dfa2be5ba06与文档快照9799a65d23944d59baffb468f791421defa5cbff，独立artifact298/298、0失败。源码、最终组合、996/210/62、Session/C15/VerifyOnly、入口及完整交付/ZIP证据均已父验；状态更新为PARENT_REVIEWED_LOCAL_CANDIDATE_COMPLETE，人工菜单/电影库往返等待用户。仅更新本报告/状态及私有恢复信息，不重跑门禁，不改source/runtime/ZIP/VALIDATION/profile。原失败和审计器schema/root-prefix错误保持；未测显示器映射、timeout/恢复owner、硬件/系统安装保留恢复条件，不扩大本轮范围。Model Tier: Tier 1（纯文档/状态）；主线程沿用当前配置；Escalated: No。

以下为父审前的实施与收尾过程记录。

## 2026-10-17 有限维护组合验证与本地候选收尾

最终产品来源5341f32985aabefa03f789b1428d8dfa2be5ba06，实际公开完整确认996/996、材料210/210、JS313/PS28/有限模式364通过。首次534公开995/996的单一Git夹具进程异常隔离1/1通过后完整确认；原失败保留。build/VerifyOnly与独立109产品/51输入/4notice Git blob、2159payload/2160runtime完整集合SHA通过，相对037仅5产品输出/6来源元数据变化。菜单9与OSD/API/PM53项隐藏通过；第一次夹具提前destroy导致的异步错误改为drain+pause后通过，产品未为此修改。实际候选入口隐藏启动资料隔离、show/network/真实Native子进程0；所属进程退出，profile不入交付。

新目录ETE-night-maintenance-5341f32-20261017与ZIP已完成；ZIP2164文件流逐SHA/CRC、240674258 bytes，SHA3f39076954ae4b3ef18270a17ccfcb288c3b9cc2634d7a0ba6956f3f7db677c1。完整矩阵、失败历史、未测与最小清单见[报告](OVERNIGHT_REVIEW_REPORT_20261016.md)。Model Tier/worker角色沿前合同，主线程保留组合/核心判断；此收尾仅文档，不改变产品/ZIP或发布状态，待父会话最终产物验收。

## 2026-10-17 E2最终变换链边界修正

首次组合材料207项中200通过，7项均被VirtualScroller最终输出hash拦住：中间Movie SHA被误作生产末态，实际还有Search patchBrowseGuard。追加实际Movie→Search回归亦证实Search marker被误扩为object。父审批准区分Movie专属marker和既有共享browse提交guard；Search变换器不改，Search-only维持true/null和原stale保护。19项最终组合回归通过，最终输出54537E...C3802F。旧8cc公开996/996、材料200/207、中间16项与新增修前17/19均原样保留，不合并成新来源PASS；新准确来源再次运行门禁。此阶段没有构建候选或操作已发资产。

## 2026-10-17 E2电影分块双终态归属

父审指出catch-only方案不足，批准补成功已fulfilled但提交前退休的分支。生产patchVirtualScroller只在Movie请求使用唯一truthy token，失败和success stale guard返回前只清当前同token；正常成功保留loaded，原数据守卫和非Movie true/null保持。隔离worker只扩材料测试，主审取真实diff并强化同map同epoch旧成功/失败保护，修前12/16、修后16/16。固定输入D298...A5B9不变，原overlay输出绑定改2ADE...597A9；没有新generator或缓存策略。组合来源/构建另核，真实前台与服务器未执行。

## 2026-10-17 B/P1刷新率协议错误收口

按父审限定合同只改registerFreshRate和getRefreshRate/setRefreshRate：完成标记先于callback；unknown不spawn；同步spawn异常或child/error空回调且close不重复；无数字响应按旧空值resolve。16项实际函数体回归修前7通过/9失败，修后连同既有mpv设置与全屏状态共29/29通过。所有child/XHR为合成替身，未启动刷新率工具、显示器或窗口。DISPLAY1/工具路径/正常协议与输出保持，未加入超时、映射或恢复状态机。

## 2026-10-17 E1诊断标签修正

隔离worker在night-log-labels分支提交de44b69，仅safeLabel及相邻诊断回归。主线程检查实际diff后以no-commit取两文件，强化独立canary而非原路径后缀断言，补POSIX、两种Windows分隔符、fallback和截断；主树诊断集合45/45通过。源码只复用既有sanitizeText再原归一，不改schema/IPC/轮转或权限。原独立分支、修前失败和私有回执保留；当前本地修正不发布。

## 2026-10-17 指定设置栏排序局部修正

原设置聚合器按route.order及翻译标题排序。仅给cec.js与libmpv.js getRoutes中的六项补order3—8，键盘保持原order2，其他路由字段保持。新增源码元数据与实际固定注册表达式/聚合器材料回归，修前1通过/2失败，修后3/3；同时覆盖sync开关及用户路线保留。首次夹具把注释/未激活对象当route的失败单列保留，不冒充产品修前证据。安装相关15/15隔离检查通过，不代表系统安装。B/P1、E1与修订E2已获父审限定批准，独立推进，不扩大显示/播放架构。

## 2026-10-17 Web分块归属与诊断标签复现

E1纯函数探针确认category/event字符白名单不能替代已有文本脱敏；正常产品调用固定标签，未声称常规泄露。E2使用固定VirtualScroller函数体、生产patcher和Movie wrapper复现pause/resume(false)后分块标记仍true而无法重新fetch，旧数据继续被抑制。最小标签处理与局部chunk token方案见[异步及隐私审查](OVERNIGHT_ASYNC_PRIVACY_REVIEW_20261016.md)，仅文档/私有证据，等待父审，不改变产品。STRM/CD2有限源码核对未发现新增确定问题；不把覆盖范围扩大为完整Native或真实服务验收。

## 2026-10-17 显示异常复现与局部方案停点

三个现有函数体的合成用例复现child/error未收口、unknown仍spawn及无数字响应Promise悬挂，真实子进程/窗口/显示器操作为0。P1仅建议协议一次回调和无数字响应按原空结果settle，精确允许文件/不变量/测试见[显示审查](OVERNIGHT_DISPLAY_REVIEW_20261016.md)，待父审，产品未改。首轮安装/资源只读审核未发现确定缺陷，保留降级策略及手工消费者UNKNOWN。固定输入准备与4项门禁通过；E的信任/异步候选仍只收集证据，不授权worker实施。

## 2026-10-16 发布后有限维护合同

Model Tier: Tier 1（明确菜单/安装/资源证据）与 Tier 2（显示跨层及核心审查）；Model: 主线程沿用当前配置；三个 GPT-6 Luna High worker 分别只读定位菜单、安装升级和资源消费者；Reason: 先固化有限覆盖、证据和高风险停点；Escalated: No。基线 main `45bea67bb6f3c9e825c44c6e1a5e0f908f74b8d0`，独立本地分支 `codex/post-v037-night`。仅新增合同报告/状态记录，未修改产品或启动测试/候选。验收与恢复见[报告](OVERNIGHT_REVIEW_REPORT_20261016.md)，本轮不自动发布后续修正。

## 2026-10-16 v0.3.7 Pre-release 发行收尾

Model Tier: Tier 1（文档发行状态与证据同步）；Model: 主线程沿用配置，精确标识未由工具暴露；Reason: 已合并并完成验证的来源仅作发行记录与导航收尾；Escalated: No。本轮Worker限定处理固定输入、私有验证脚本及文档补丁，主线程核对实际差异与测试；发布决策和全部Git/远端操作由主线程执行，不据此声称型号变更。

PR #41 已合并，产品Tag `v0.3.7` 固定 main source `bf6e48214820fac0558bdfe7f37526f1c7a3d7c2`。主线与Tag CI 977/977，材料200/200；最终runtime 2159 payload/2160完整文件，VerifyOnly通过，2160个安装器解包文件与runtime集合及逐SHA匹配。安装器 175733823 bytes，SHA-256 `aca0ff577ad111f726bf769706b23d5e0e2d7d1706e7bfa768c2d15e9db1f49d`；build-manifest SHA `1439f6521e32d40758b049f4e15eb4ed171a9698bdbc27d776c9dfb303cec19e`。相对已审本地候选只有6项source/provenance身份元数据不同，产品字节一致。五个附件匿名完整回读通过，发布状态及资产见[发行核验](V037_RELEASE_VERIFICATION.md)。文档收尾提交与产品source/tag单独记录。

最终来源53项隐藏合成检查通过；窗口show、网络请求、Native子进程、所属残留为0。用户报告清单1—4和6项正常；第5项由用户暂缓且未测试，不作为本次门禁。没有据此声明真实播放/远控、系统电源、前台、系统安装或硬件PASS。旧1246da1本地wrapper ZIP及其SHA仅作为历史候选身份保留。下方发行准备段及后续候选记录均为历史快照，原文保留。

## 2026-10-16 v0.3.7发行准备授权

Model Tier: Tier 1（明确发行合同）；Model: 主线程沿用配置，精确标识未暴露；限定GPT-6 Luna High只读复核累计scope及准备匿名回读脚本；Reason: 已审产品不变，按固定工具链和来源执行发行；Escalated: No。用户新授权测试版发布闭环，不继承旧版授权作推断。父会话负责PR审核与后续排期，当前产品冻结和边界保持。

实时核对远端main dd198ac，未存在v0.3.7 Tag/Release或开放PR，Latest仍v0.3.1。当前ebaed19干净，1246da1后的产品/工具/测试/版本tree无差异。用户反馈清单1—4及6正常，仅记USER_REPORTED_NORMAL；第5电源/退出组合明确暂缓，NOT_TESTED且不阻塞发布。已保存旧Release/Latest/Tag快照；本次仅增量文档，之后创建PR供父审，最终main另构建标准安装器，不冒用本地wrapper ZIP来源。

不读旧profile/个人凭据，不改旧目录或已有Release附件，不系统安装/主动前台/真实服务器写入，不启动038或混入菜单/签名需求。电源项后续使用反馈由用户决定，不再重复设等待门禁。

## 2026-10-16 v0.3.7父审核文档收尾

Model Tier: Tier 1；Model: 主线程沿用配置，精确标识未暴露；Reason: 明确回执的文档/私有状态同步；Escalated: No。父会话审核产品source1246da1023c43981c7ed40a4e556cb95c7eb7e02及文档快照619be41，报告生产路径77/77、生成PM/runtime/已审副本一致，冻结与source后仅文档差异通过。读取既有`.work/v037-parent-final-artifact-audit/result.json`，302项全部PASS、failures为空，覆盖完整payload/runtime/ZIP逐SHA、Git blob来源、launcher/profile及ZIP完整字节/CRC。

父审对象ZIP保持240504661 bytes、SHA9e7ea2d64df19838e2942674f4efbe23be54cfeff8b0eadab74fea281180ed6c；本轮没有重新执行这些门禁或修改任何产品/产物/VALIDATION/profile。只将当前状态同步为parent reviewed、manual review pending；前台、真实服务器播放/远控、OS电源与安装仍未验证。本轮docs-only提交HEAD与产品source分开，私有task state记录准确新HEAD；交付与heartbeat删除由父会话处理，没有新增远端、安装或前台动作。

## 2026-10-16 v0.3.7准确来源本地候选完成

产品源码1246da1023c43981c7ed40a4e556cb95c7eb7e02，版本0.3.7，后续文档HEAD单独记录。Model Tier: Tier 2；主线程沿用配置并保留异步/核心最终核对，GPT-6 Luna High只补限定测试、固定输入预检和私有renderer夹具，未提交/改架构；Escalated: No。D以d13e418独立保存，1246da1只同步版本/候选说明。最终公开离线977/977、完整材料200/200，0失败/跳过；JS309、PowerShell28及360文件有限凭据模式检查通过。旧975不替代本次来源门禁。

从准确提交Git blobs、固定prepared输入和项目内GCC构建新runtime：2159 payload/2160完整文件，VerifyOnly及独立逐文件SHA/完整集合、canonical payload-set核对通过；Helper28054c75和默认libmpv965efde4保持固定字节。ApiClient base/raw input/transformed output身份分层，完整provenance通过。未下载缺失的Electron ZIP，prepared73文件完整树通过原门禁；不宣称本轮独立回读该归档或当前加载DLL哈希。

真实main/AMD的空profile隐藏检查：原VideoOsdView/组件18、ApiClient原型+真实Events17、PM构造器/真实队列/Events/原生MutationObserver18项，API/Player/socket为合成替身，OSD手动生命周期。合成报告7 start/1 progress/7 stop，7个Session身份一一配对；8个UI stop含1个未启动pending原事件，不混作Session报告。observer/timer终态0，显示、Node/浏览器外网、Native子进程0，所属进程退出。原file: Cache警告单列，无新增页面错误。

私有连接脚本首轮restCountBeforeLogout作用域遗漏、第二轮播放脚本fullscreen:false导致原background模式无报告，失败分别保留；仅修夹具并维持原断言，产品字节未变后通过。独立交付launch.cjs探针通过版本/应用资料与argv隔离；其生成profile移动到本任务私有目录保留，绝对源/目标已核验位于工作树内，未读个人凭据、未动旧profile。

独立目录dist/ETE-v0.3.7-controls-1246da1-20261016，完整2164文件ZIP流回读通过；ZIP240504661 bytes，SHA9e7ea2d64df19838e2942674f4efbe23be54cfeff8b0eadab74fea281180ed6c，附.sha256。测试说明与VALIDATION只含摘要，私有harness/profile/日志不入包，锁定依赖原带文件完整保留。源/runtime/delivery身份和人工项见V037_LOCAL_CANDIDATE，恢复见私有task state。未push/PR/merge/Tag/Release、真实前台/服务器播放远控/OS电源/安装/硬件，菜单与038等未实施。

限定GPT-6 Luna High独立只读payload/ZIP审计27项通过，无差异；主线程已核对真实报告、再次回读runtime完整集合/SHA、ZIP精确大小写路径/sidecar/SHA与审核PM输出，并确认四个最终隐藏/启动根进程均已退出。最后仅文档收尾，不重构建、不重标1246da1产品来源，不将文件审计提升为DLL加载或真实服务验收。

## 2026-10-16 v0.3.7 D扩展测试及生产窄变换

Model Tier: Tier 2；Model: 主线程沿用配置，精确标识未暴露；GPT-6 Luna High只补限定fixture/用例与分支证据；Reason: observer/timer和self-managed Item/request归属由主线程设计/最终核对；Escalated: No。父会话先复核ABC，再明确批准D补测和条件实施，继续本地候选授权。

父审执行发现原草案当前load失败未退休资源64/65，审查副本补initial rejection清理及queued mutation guard后65/65。新增四个pre-observer等待/取消无资源正例、selection/removal、raw旧mutation/已取消timer、重复mutation、self-managed当前/迟到事件等共19个observer case：旧输出5/19、父审18/19，最后缺口为player-only旧stop误清新B。实际自管理公开Play保留A/B canonical Item及request id1/2，最终资源hook按原id或exact Item对象退休，不猜无marker旧clone；原core streamInfo=null与事件接受主体未动。

主线程独立审查副本77/77，生产patch-playbackmanager.cjs只追加已审资源helper/挂接，生成输出与审查副本SHA一致；实际生产58请求/Session+19 observer再次77/77，0 skipped。固定锚点错误输入拒绝测试8/8。原stop coordinator/报告/队列和admission谓词、错误返回、50ms行为保持；未改Native/Resolver/认证/协议/窗口/依赖。B普通电源API异常沿旧路径向上传播、可能先于AppHost callback；shutdown窄catch/双类清理保持，不扩写普通OS异常优雅恢复。

固定物理材料按清单复制并验证：Carnival1009、patch51、完整Electron73、UCRT64 6990及header/原Inno工具树通过，无系统安装。指定旧工作树的Electron ZIP不存在，未下载/运行prepare.ps1；当前已有prepared完整树通过原门禁，直接用于既有build.ps1，不宣称本轮再次验证该ZIP归档字节。下一步固定版本/source并只构建一个最终本地候选。

## 2026-10-16 v0.3.7父审后A/B/C实施与D草案

Model Tier: Tier 2；Model: 主线程沿用配置，精确标识未暴露；worker GPT-6 Luna High负责纯电源helper/限定测试及D只读分支清单；Reason: 视图、socket与应用退出资源的异步归属由主线程设计/验收；Escalated: No。父会话独立复现并明确批准A/B/C，D仅测试与逐分支diff草案。菜单重排只记录已确认独立待办，不赋版本、不改产品菜单。

B以本地提交a5e29a7独立保存：音视频各持一个幂等电源id，ID0有效，陈旧inactive id可重获，shutdown先退休新on并尝试两类清理，失败保留错误和所持id。main before-quit先置关闭标记/收锁，原Native/kernel/startup drain及协议/窗口不变；实际main摘录覆盖drain未完成时通知回调完成、不再start和恰一次释放，清理失败不阻塞原退出收尾。videohandler未改，既有无token四命令的任意同类乱序问题仍不承诺解决。

A固定VideoOSD窄变换保留20键表/500ms/倍率，监听和timer按resume/pause/release/destroy清理并显式传捕获player。完整隐藏应用发现首轮仅比较player对象不足以覆盖同一Player切集，已保留失败并接原OSD playbackstart/playbackstop当前player清理；最终实际VideoOsdView/AMD/原生组件18项通过，显示/网络/Native0。隔离runtime由v036准确manifest的2158文件逐项核验后复制，并作4项显式替换，fixture身份明确，不冒充v037来源构建；个人profile/旧包保持，fake电源API不施加系统电源效果。

C仅改logout/ensure/open回调/close，增socket代次、可取消retry/deferred-close timer和pending logout计数，旧回调不影响新连接，显式close通知不吞掉，同实例重登可恢复。REST/auth字段/done清token、connected含义、原backoff与订阅重放保持；4方法外字节及CRLF验证通过。Carnival base、raw payload input、transformed output三SHA分别绑定，vendor不改；新增变换器接generatorPaths/INPUT_PATHS/tamper/provenance fixture。最初patcher未处理原payload CRLF导致锚点失败，修正后恢复原换行；不是材料变更或弱化校验。

本轮公开离线975/975，早于同Player末次局部补修；之后相关定向50/50、A材料和最终输出overlay/provenance6/6复验通过。来源fixture首轮1项因SVG checkout CRLF与Git blob字节不一致失败，改为核对准确提交blob后通过，有效断言保留。D完整生成模块材料7项为1正例通过/6修前失败，生成器未改；新私有差异草案只node --check，未执行，不记修复PASS。当前合同逐项给出provisional/started/失败/取消/替换/Stop/迟到mutation与timer清理位置，并标出self-managed/preplay等待补case。

在D核心审核停点保存状态与恢复入口，暂不生成整套候选/升级版本。不push/PR/merge/Release、前台、真实服务器/凭据、安装、硬件或缓存/切轨延迟工作；准确来源构建、真实播放远控/OS电源与安装验收均未执行。

A/C及来源接线本地提交5a6e886，包含B提交a5e29a7；准确提交的51项build-input blobs检查通过，追加source-contract/tamper25/25，维护JS语法308项和有限凭据模式359项通过。D自测作为后续独立测试/文档提交，另有语法检查。完整应用仅直接构造并驱动原VideoOsdView/Events/原生组件，不补写真实播放Router路径、C真实WebSocket、B系统电源或任何硬件PASS；四次所属夹具进程退出，Native启动0。

## 2026-10-16 v0.3.7只读范围合同

Model Tier: Tier 2；Model: 主线程沿用配置，精确标识未由工具暴露；worker为GPT-6 Luna High，仅限只读模块/事件盘点与隔离VM；Reason: OSD/input、socket重连、main资源及PlaybackManager私有observer的跨模块异步归属；Escalated: No。Task Risk中高、Task Uncertainty中高、Cross-module Scope为上述四处，当前Playback/Session产品改动0。

实时ls-remote main为dd198ac，v0.3.6 Tag解引用de1a731；新managed工作树从准确main建立codex/v037-controls，原Settings/v035/v036与profile/产物保持。固定材料SHA均对照当前manifest，ApiClient审计确认实际来源为综合补丁authoritative payload而非Carnival base。两名worker没有产品/公开文档/版本控制写入，只生成私有清单与VM脚本；主线程复核证据、执行关键复现并汇总合同。

原main分派器与videohandler的fake电源API复现重复/交错on后off遗留句柄，普通单次开始停止为0；原OSD键盘注册和pause片段复现非映射键锁住倍率handler、3次操作留3个keyup listener、pause后500ms回调仍作用新owner。完整ApiClient模块/prototype及合成依赖复现logout REST pending时旧1秒timer重连，完成后token已清、新socket仍CONNECTING，主线程重跑一致。完整当前生成PlaybackManager的既有AMD fixture连续3次公开Play/Stop后observer存活1/2/3，start/stop报告各3；原50ms hide无owner检查。全部为隔离证据，不提升为真实应用/服务器/设备PASS。

PlaybackManager基线58/58、AppHost/外链20/20、7个固定JS语法及材料hash通过。observer探针首轮fixture缺getCurrentUser，次轮background playback按原语义不报告，补齐既有fixture依赖并使用正常fullscreen后通过原断言；私有失败记录保留，产品与有效测试未改。完整应用/前台/Native/真实服务器播放远控/OS电源/安装/硬件均NOT_EXECUTED。生产代码、版本号、依赖与发行状态保持；私有状态保存恢复入口，不进入包体。

交付docs/V037_SCOPE_AND_CONTRACT.md及PROJECT_STATUS；四项分别定义Observed/Expected、实际文件、最小候选差异、冻结、回退及验收。PlaybackManager私有observer和ApiClient核心必须经规划会话明确审核后才能修正；现有正常队列和Session清理不重写。本轮停在SCOPE_REVIEW_REQUIRED，没有push/PR/merge/Tag/Release、候选构建或系统/服务器写入。

## 2026-10-16 v0.3.6发行与匿名回读完成

Model Tier: Tier 1；Model: 主线程沿用配置，测试worker GPT-6 Luna High；Reason: 固定启动资产/窄CSS变换及来源发行合同；Escalated: No。PR #40两项955/955通过后merge为de1a731aa3e915b00988134b6f5331bfc867a84a，最终main及Tag CI955/955通过。原图完整PNG字节复用，新SVG从准确Git blob物化；源码/工具链/完整payload来源门禁通过。

最终main材料163/163、隐藏启动三视口/原loader正常重载通过，show/net/Native0，截图与已审候选像素一致。标准Inno编译后归档测试/2159文件解包SHA和完整集合通过；与v0.3.5 runtime比较仅启动资产/样式/版本及来源记录变化，Helper/libmpv字节保持。安装器175752059 bytes、020df218195e9999d443ad0832df6cd1be9a8c9f8dc8d7780b75b6c25893edc1、NotSigned。草稿五附件关系核验后公开Pre-release，匿名四小附件完整GET及安装器21段全部字节顺序SHA通过；未将上传状态或GitHub digest当成下载通过。

首轮新增fixture预期SHA大小写不一致5/6及修正后6/6分别保留，没有放宽有效断言或修改产品哈希；完整材料按最终来源单轮记录。用户本次直接授权完成发布，未补做或虚构前台、真实播放/远控及系统安装；旧版本/Stable按快照核对，原profile/旧产物保持。后续仅文档收尾及其CI/最终远端回读，不重标产品Tag。


## 2026-10-16 v0.3.6启动图接入

实施候选08ddc52：955/955公开离线通过，新增public/材料5项和来源fixture修正后6/6通过。首轮fixture仅新增预期SHA字母大小写不一致（5/6），已保持原哈希及有效断言修正预期格式，原日志保留。准确来源构建/VerifyOnly2158 payload通过；真实main空profile隐藏启动三视口图片/中心/黑底/无横溢出、原loader重载后初始页面就绪及启动图消失通过，截图已查，show/外网/Node网络/Native为0。私有harness、状态与截图不进入安装包，最终main/标准安装器/公开下载证据后续单列。

Model Tier: Tier 1；Model: 主线程沿用配置，限定测试worker GPT-6 Luna High；Reason: 独立视觉资产与固定index CSS变换，合同/输入输出明确；Escalated: No。Task Risk低、Task Uncertainty低、Cross-module Scope为启动资产/overlay/来源与发行工具，Playback/Session Impact为0。用户已明确要求完成并发布本版，按Pre-release执行，Stable v0.3.1保持。

在独立工作树从0f7f3a5实施：复用原logowhite.png字节加入THEATER ENHANCED副标，不使用生成预览的重绘近似图；固定index窄变换只换背景资源及适配宽度。原loader/DOM/启动ready与播放/认证/IPC保持。测试worker只处理限定tests及来源fixture接线，不修改产品或执行merge。当前验证/来源构建及发行结果尚待实际完成，不预记PASS；全新物理vendor和项目工具链复用既有固定输入，仍由原门禁核验，无系统安装。

## 2026-10-16 v0.3.5 Pre-release发行完成

Model Tier: Tier 1（明确发行合同）；Model: 当前主线程，精确标识未由工具暴露；Reason: 提交绑定构建/发行/回读，产品代码保持已审核候选；Escalated: No。用户明确“测试完成了，可以发布了”，按其当前cc7f542候选已测场景记录，不扩写人工逐项验收。

PR #39 head7959651的Push/PR CI均951/951通过后merge为b0234c8a0e8d4fb264b21cf39f8ce68c9146d115；最终main和Tag公开CI均951/951通过。全新物理材料工作树首轮材料因未生成src/electronapp/preload.js而157/158、1失败；保留日志，按原固定生成器准备后完整162/162、exit 0，起止HEAD一致。未改断言/跳过材料。旧441eafb默认入口P1、2c9410c重复空态和旧Git fixture950/951+隔离1/1（根因UNKNOWN）仍各保留历史证据。

从最终main新建runtime并编译标准Inno安装器；VerifyOnly、解包测试、2158个{app}文件与完整runtime逐项SHA/集合比对通过。Tag固定同一source，五附件草稿大小/digest/说明与校验关系通过后公开Pre-release。匿名四小文件完整GET及安装器21个range全部字节顺序hash通过，source/provenance/SHA/notes关系一致。安装器175741577 bytes、SHA 03f8cf5f2b18f854cc6548a7fe2d60cd641a8187479c4fd2e3ad22c8dfd87414、NotSigned。Stable/Latest v0.3.1及旧v0.3.3/v0.3.4正文/附件身份/flags回读保持。没有系统安装/真实服务器业务写入/前台或Native播放动作；详细验收边界见V035_RELEASE_VERIFICATION。后续仅文档收尾，不重标Tag/包来源。


## 2026-10-16 v0.3.5 测试版发行准备

2026-10-16：用户对cc7f542当前本地候选所测场景反馈“测试完成了，可以发布了”，记录为USER_REPORTED_TEST_COMPLETE，并明确授权v0.3.5 Pre-release发行。该反馈不补写未说明媒体、真实远控、系统安装或旧服务器矩阵逐项PASS。当前进入PR/门禁、最终main来源构建、标准安装器及公开回读流程；Stable保留v0.3.1。


## 2026-10-16 v0.3.5 搜索重复空态修正

用户截图发现同页两条无匹配提示。旧完整应用默认getRouteUrl已复现2条（维护eteSearchStatus与原ListController.setEmptyListState各一条），修前单测也失败。Model Tier: Tier 1；Model: 当前主线程，精确标识未由工具暴露；Reason: 单helper删除重复UI owner，播放影响0；Escalated: No。限定worker仅调整测试，主线程复核真实DOM。

产品来源cc7f542cf12a236bba22948030b5043a8a736e08，删除5行成功空态分支，原响应/原native空态/单字符提示保持，独立错误status保留。定向15/15、材料162/162、默认完整应用24项及390/800/1280恰好1条提示通过；VerifyOnly/完整2158文件/副本和启动隔离通过。未重复不相关全量公开套件，也未将旧来源结果记为新来源通过。新独立本地包身份与ZIP回读见V035_SEARCH_FEEDBACK_FIX；旧目录/ZIP/profile保留，未推送/PR/发布/安装，真实服务/前台/播放远控NOT_VERIFIED。

## 2026-10-16 v0.3.5 默认搜索入口P1修正

父审核复现并拒绝441eafb。主线程使用旧完整runtime与原getRouteUrl默认路由独立复现item or serverId cannot be null，显示/网络/Native均0；此前强加serverId的隐藏夹具未覆盖默认入口，旧结果不算本问题通过。Model Tier: Tier 1（明确局部合同）；Model: 当前主线程，精确标识未由工具暴露；Reason: 单helper客户端选择与回复归属，播放影响0；Escalated: No。GPT-6 Luna High只补限定测试，保留修改前失败日志。

产品只改list-search.js，来源2c9410c1bfd9ab27e7f3fe9943f9841b20494829；按owner.apiClient、显式serverId、canonical currentApiClient优先级选择，并在成功/错误提交前核对同一API对象和userid。测试提交8b484d2，定向15/15；默认原路由20、显式18、电视9、详情24/真实菜单取消、电影25、首页17及新来源材料162/162通过。2157 payload/2158完整runtime、VerifyOnly、独立SHA/交付副本与空profile启动隔离通过。公开首轮950/951，唯一临时Git fixture失败项保留原日志，隔离复验1/1通过；首次根因UNKNOWN；最终ZIP2162文件/234473398 bytes逐项回读通过，SHA 7f8a2b88d4c40d00391798209cd0fa055fa8c941b4c4164ac3c7fc93c35eab10；回执见V035_DEFAULT_SEARCH_FIX，未推送/PR/合并/发布或安装，真实服务器/前台/播放远控NOT_VERIFIED。

## 2026-10-16 v0.3.5 搜索与菜单合批

用户明确接受“继续进行吧，合进去一起”，新增标准/电视搜索与必要原生菜单取消修正；旧详情用户观察保留。Model Tier: Tier 2；Model: 当前Codex主线程，精确标识未由工具暴露；Reason: 两条搜索路由与异步提交/恢复，播放核心影响0；Escalated: No。GPT-6 Luna High worker只读盘点及限定测试，主线程保留产品设计与最终核对。

新增patcher均进入固定overlay哈希、INPUT_PATHS、防篡改集合和provenance fixture。旧完整应用复现迟到覆盖和异步template空节点；后续修正返回时新输入与已完成错误状态保留。产品source 441eafb5dd5434174bad739eb0e1ed01abb0ae4f，测试提交3b5520d；同来源标准18、电视9、详情24、原电影库/首页及实际菜单取消通过，材料162/162。真实点击/键盘取消保值且change=0，视频禁用控制不伪算可选菜单。来源runtime2157 payload/2158完整文件、VerifyOnly/独立SHA和空profile启动隔离通过。最终公开948/948通过，ZIP2162文件/234473141 bytes逐项流回读通过，SHA 6b85f003ff3d75831fc65d05924c37696e45e9565765edca74eba082cd8f200e；详见V035_BROWSE_CANDIDATE。未推送/PR/合并/发布或系统安装，真实服务/前台/播放远控NOT_VERIFIED。

## 2026-10-16 v0.3.5 详情事务候选

Model Tier: Tier 2；Model: 当前Codex会话，运行时未向任务提供精确模型标识；Reason: 详情AMD控制器异步/离页/返回的跨组件正确性；Escalated: No。明确测试任务委派worker，产品合同和实现由主线程负责。

基于实时main ef7a8d8建立独立工作树，保护原Settings工作区。核对Movie/Series/Season/Episode同一路由与类型分区，保留无问题证据的信息布局。旧完整应用隐藏探针在详情销毁后释放回复，复现null classList未处理拒绝；外网/显示/Native启动均0。增加固定源变换器，与既有item overlay串联，暂停/销毁/刷新失效旧事务，阻止旧主渲染、reload及选择回填；保持底层API和所有播放/Session owner。最终产品source 51ae2e4（1f0b58d后补齐构建输入与夹具并重建）；公开941/941、材料157/157、输入tamper专项19/19、隐藏完整应用24项与12组三视口、真实Tab/Shift+Tab及2157完整文件集/交付副本核对通过。启动隔离探针通过，profile已移出交付。初始两项provenance夹具失败、菜单取消undefined拒绝、菜单异步填充与Series按钮夹具修订均保留；取消诊断仍OBSERVED，前台/真实服务器/播放/远控/安装NOT_VERIFIED。最终ZIP2161文件完整流回读通过，SHA c16db379c003ce7ec1fad1cc8f4e0c297afe1187d530515fbbf8c7e8fd5efb16；旧.NET路径分隔符首次审计失败已保留并改用标准条目后通过。详细身份见V035_LOCAL_CANDIDATE；本轮没有push/PR/合并/发布/安装或真实服务器访问。

## 2026-10-16 v0.3.4测试版发行完成

## 2026-10-16 — 详情候选反馈与批次讨论

用户在收到51ae2e4本地候选及详情页测试说明后反馈“现在看起来没问题”。记录为当前已测场景USER_REPORTED_NO_ISSUE / MONITORING，不补写具体媒体、菜单取消、实际播放/远控/安装逐项通过。用户同时询问能否合并其他Web相关版本，当前仅进入批次调整讨论，尚未接受搜索或共享控件的新实施范围，也没有新的发布授权。

- PR #38的push与PR公开CI通过后合并，最终main源码及产品Tag固定为`98c26e4a123f0b8c623451ee7603fc431b28bddf`。独立工作树以该提交重新构建标准runtime和安装器，产品文件与最终本地候选一致；版本0.3.4，依赖、默认内核及播放核心不变。
- 最终主线公开CI940/940、固定材料156/156且无跳过。空profile和合成API的完整应用首页17项、电影库25项、390/800/1280视口通过；实际显示/外网/Node网络/Native启动0，所属进程退出，原file: Cache警告单列。首张电影1280截图早于隐藏窗口重绘，夹具在全新隔离目录强制尺寸变化并等待后重新截图核对，产品未改。
- VerifyOnly和独立复核确认2156项payload、2157项完整runtime；安装器完整性检查及解包后2157文件逐路径和SHA一致，保留12项锁定依赖原带测试文件，本轮profile、wrapper和验收脚本未入包。安装器175753774 bytes，SHA-256 `eedf03e83b0f4b2b2ef674134af4fefc5068573b5bb82466e3ad4191c46d0c3d`，NotSigned。manifest SHA `c8b37b4649327ee1f88a28dff34516073a1eeee4ca206d20d341ce3e9a4bcf74`，payload-set SHA `d5378284e15bc58be35b76679948a1f5ab5e06c886d1b6b33494fa6f7854ee4b`。
- v0.3.4以Pre-release且非Latest发布。安装器、provenance、单独SHA、RELEASE_NOTES及SHA256SUMS五项附件匿名完整回读通过；安装器按连续范围覆盖全部字节后顺序哈希，两份校验文件与来源关系一致，Release正文与说明附件内容一致。Stable/Latest仍v0.3.1，v0.3.3元数据和附件保持。后续仅同步状态文档，Tag和产品来源不随文档HEAD移动。
- Model Tier：Tier 1；主线程继承会话配置，GPT-6 Luna High执行只读累计源码及解包复核，均无明确问题，主线程核对真实报告、diff、门禁与远端状态。未执行系统安装、真实服务器业务、前台、播放或远控验收；没有启动后续版本。

## 2026-10-16 v0.3.4测试版发行准备

以下为发行准备时快照，当前发行结果见上方完成记录。

- 用户明确要求发测试包，批准本版主线集成、准确来源安装器、Pre-release发布与公开回读；当前核对main=6fb61e3、打开PR0、v0.3.4尚不存在。父会话已审核累计源码与本地候选，新增三文档有限用户反馈原样保留。
- 发行文本围绕浏览取消、迟到提交与焦点、电影分类入口及首页媒体库标题，保留USER_REPORTED_NO_ISSUE/MONITORING边界，不推断逐项人工或播放/安装通过。版本仍0.3.4，依赖和默认内核不变，完整Web迁移未实施。
- Model Tier：Tier 1（发行脚本/文档/已固定验证）；主线程继承当前会话模型，Luna worker做只读累计diff及包体复核；核心正确性与最终发布由主线程审核。新构建必须绑定最终主线提交，旧本地wrapper/profile不入发行包，所有旧候选继续保留。材料缺口与既有许可未决状态不因发布改写。

## 2026-10-16 — 用户反馈暂未发现问题

用户在收到ae245f6标题跳转候选后反馈“现在没看到有什么问题”。按上下文归属于当前v0.3.4候选的有限使用观察，记录为USER_REPORTED_NO_ISSUE / MONITORING；本次标题缺项转入观察。用户未逐项说明点击/Enter/See All/返回焦点、媒体类型或设备组合，不补写逐项PASS，也不扩大为真实播放、远控、旧服务器矩阵或安装验收。缓存继续不做，既有包体/sourceCommit保持，未因此发布或启动后续版本。

## 2026-10-16 首页分区标题跳转续办

- 最终产品来源ae245f623fa32957c155cfb8b5dd1f1e7aa78987，依次保留4a9e4bc（标题接线）、eae49c6（返回焦点）和ae245f6（次级入口隐藏时回可见标题）三个小范围提交；起点b646374后的产品改动只在两个home模块，其他为直接相关测试/文档。
- 隐藏完整应用先验证native标题/See All及正确电影路由，发现返回重建DOM后焦点为BODY；修正仅保留分区标题Id/入口种类。早期See All焦点断言曾点击只有6项时原组件已隐藏的入口，改用12项可见输入，并补充隐藏入口回可见标题测试；不改变原数量门槛或组件。另保留新生custom元素的is声明属性，实际instanceof和原loader一并核对。
- 最终39项定向/材料、940项公开门禁通过；空profile+合成API完整应用17项、3视口通过，含真实Enter到tv suggestions、返回内容/标题/See All焦点、失效账号激活阻止及TV普通标题。实际show/浏览器外网/Node网络/Native启动0，非预期页面错误0，原file: Cache警告单列；未执行真实服务器/前台业务。requestWait/clear/refresh函数体与起点逐字一致，无缓存策略变化。
- 来源构建为EmbyTheaterEnhanced-v034-home-titles-ae245f6-20261016，2156 payload / 2157完整runtime逐路径及SHA通过，两个home模块匹配指定Git blob；manifest SHA b3cd0fe004b96ccaee8e3fe925579373f82cd1b86a4176a7c829d0c5445ad350，payload-set SHA acf43a44d4488ffa598d9101604c0cef47a6943dad0149c78211a8c96ca7442f。独立VerifyOnly及2169项包体断言通过。
- 新交付ETE-v0.3.4-home-titles-ae245f6-20261016与旧ed00a97目录/ZIP分开；启动wrapper隔离探针通过，生成profile移出交付。ZIP2161文件逐项回读通过（28个命名审计断言），SHA 6e4abb611e896af0de8ec232d6290043354cd58e4204b4d8233e50cca68c12c2；只保留12个与v0.3.3同字节的锁定依赖测试文件，没有本轮profile/harness/fixture。默认DLL哈希保持，未发布或安装。
- 本轮还发现旧电影库合成夹具只设置serverInfo.Version，原运行serverVersion未赋值，因此旧case当时仅证明缺版本提示的原查询可用。已在独立空profile目录、原ed00a97不变runtime上经setSystemInfo显式设置4.10.0.40→4.6.0.0→恢复，25项补证通过且显示/网络/Native0；旧回执不改写为当时已设置版本。真实旧服务器矩阵仍未验证。
- 以下为本批提交前记录；此后的文档HEAD不重标上述产品来源，不重跑已覆盖的无关门禁。旧产物和用户profile未被替换，没有远端写入或真实服务器业务操作。
- Model Tier：Tier 2；Model：主线程继承会话配置、provider测试worker为GPT-6 Luna High；Reason：服务端导航DTO与原native标题/router接线；Escalated：无。风险/不确定性中，模块范围为home provider/renderer和定向测试，Playback/Session影响NONE。
- 当前用户明确只补跳转，缓存先不做，保留现有搜索布局；本任务可回退本地提交/构建授权继续有效。起点b646374，旧产品ed00a97与其测试目录/ZIP保持，不能覆盖用户可能运行的产物。
- 已在旧ed00a97的真实main/app/router/原组件中，用空profile和合成API复现5个分区、30张卡片、标题/See All链接0。初次夹具未通过原setSystemInfo设置ApiClient运行版本，导致走旧首页回退；修正夹具后基线通过，产品未改。只读静态样本与原homesections确认桌面latest父库经原router进入suggestions，TV为h2。
- provider投影冻结的Id/CollectionType/owner ServerId，Type/IsFolder仅作可选一致性校验；路由/路径/命令不跨边界。renderer显式加载原native标题和canonical router，文本用textContent，保留原See All/键盘机制，局部capture仅拒绝失效owner/stage。
- provider17项、renderer16项、固定材料4项，共37项通过。材料用原getRouteUrl及原isLocalItem函数验证电影/电视剧latest路径；覆盖恶意URL/query/脚本、跨server、标题HTML、TV、旧owner激活、现有取消/清空与回退。没有改刷新清空、重试、时限或新增缓存；未更改vendor、媒体库/搜索/详情controller或播放核心。后续新来源构建/完整应用/ZIP结果另记。

## 2026-10-16 v0.3.4本地交付收尾

- 用户随后明确允许本批可回退操作，批准14文件本地提交、来源绑定构建、包体核对及隔离隐藏/视口验收。核对审核回执中的14项文件集合和SHA均未改变，在codex/v034-library提交为ed00a97c11490a36e2a844c531772750deb22524；本轮没有新的产品修正。
- 首次构建拒绝测试阶段的vendor目录联接，保留部分输出与日志；改用固定输入物理副本及项目内锁定工具链，在新r2输出完成构建。产品来源ed00a97，版本0.3.4，2156项payload和2157项runtime文件（含manifest）逐路径/SHA匹配；独立VerifyOnly和16项包体断言通过。manifest SHA 9cf1211f4c367f82445cac59883037b165c1cce18072a9c7383d5cfd811f577b，payload-set SHA 8a70575381f2ea59a64dab112b6a10d5d5bf19a7acd189bf948d9a33abcccbac。默认DLL仍为965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c。
- 完整隐藏应用使用真实main/入口/路由/原组件、空profile及合成ApiClient，阻止浏览器和Node外网、LAN发现与子进程。最终23项浏览检查通过，含真实详情页进入/返回、1460非零滚动位置和同一影片焦点恢复、分页、筛选排序、卡片/列表、重复刷新、离页迟到响应、失败恢复和合成旧版本提示。390/800/1280 CSS视口均无页面横向溢出；390采用夹具临时最小尺寸覆盖，未改产品窗口约束。已实际查看三种截图。show、外部请求、Node网络、Native启动和残余进程0，只有原file: Service Worker Cache警告，非预期页面错误0。
- 初期完整应用夹具缺electronfile本地协议allowlist、Prefixes应为数组、列表异步渲染需等待、虚拟卡片身份不能用缺失data-id，以及偏好保存应由合成API接收；对应失败与初步结果均保留，最终结论以修正后的完整夹具为准，不记作产品回归或借此改产品。真实服务器/个人profile/前台窗口均未参与。
- 本地交付使用独立test-profile入口；launch.cjs在require正式main前显式固定appData/userData/sessionData/logs/temp，避免只依赖环境变量推断隔离。隐藏探针确认appData/userData/config均隔离、版本0.3.4，show/网络/子进程0；生成profile移到交付目录之外的私有验证目录，不随包分发。runtime文件保持来源绑定字节；外层入口作为本地交付wrapper单独记录SHA。
- 最终r2 ZIP为2161文件（runtime2157+外层4），逐文件完整回读及4359项独立断言通过，SHA为81962ab3d5f521925408ecb07a89d14de27861735781dc65b727d8c1fdb8b735，与sidecar一致。12个上游protobufjs测试文件与v0.3.3 manifest/实际文件同SHA，9个对应锁定依赖记录一致；精确保留继承文件，不删除锁定依赖树，本轮profile/harness/fixture及非白名单测试文件0。
- 交付与实际验证见V034_LOCAL_CANDIDATE。本次只追加文档提交，不重跑无关全量门禁或重标产品来源。尚未执行真实服务器矩阵、前台键盘/遥控、播放/远控或安装验收，没有推送/PR/合并/发布/系统安装。

## 2026-10-16 v0.3.4电影库浏览候选（提交前快照）

- Model Tier：Tier 2；Model：主线程继承当前会话配置，测试worker为GPT-6 Luna High；Reason：浏览controller、容器及异步取消跨模块接线；Escalated：无。Task Risk/Uncertainty：中；Cross-module Scope：电影页及原共用列表的条件接线；Playback/Session Impact：NONE。主线程保留合同、取消归属与最终审核。
- 重新核对远端main为6fb61e3，从准确提交建立隔离工作树；读取原目录未提交的NEXT_STEPS_20261016完整计划，不覆盖原Settings分支与已有改动。电影试点范围已在当前任务接受，后续版本没有实施授权。
- 复用已完成Web评估及固定4.10.1.0私有静态样本，核对实际路由/API/分页/筛选排序/返回恢复，不引入新Web资产。电影库原功能继续由VideosTab→ItemsTab/ListController→itemscontainer/virtual-scroller提供。
- 冻结材料复现普通getItems丢失signal与迟到首屏覆盖。新增Movie专用维护模块，取消Promise与底层signal分开处理，刷新/离页/销毁及账号变化均阻止旧结果和旧焦点回调；普通失败保留原错误对象与页面错误路径。发送前账号切换也不发出旧页查询。电影类别的movies页签参数改为已有videos，收藏/合集参数保持。
- app与六个页面/共用模块输出纳入固定输入/输出SHA合同，新生成器加入build-input及provenance夹具。非Movie不安装维护层，其他页面的普通API调用仍保持原参数个数。版本与锁文件仅更新到0.3.4，无依赖升级。
- worker首先报告迟到失败未检查账号的有效失败，主线程修复后12/12 helper测试通过；材料10/10通过，覆盖冻结基线复现、真实default拆包、原controller/容器refresh、分页筛选、离页/重复刷新、失败恢复与缓存resume。主审核补齐首屏/分页最终提交和容器50ms延迟焦点/monitor回调归属检查，旧分页失败不得重置新query tracking，同query中断分页仍可重试。overlay/runtime provenance6/6及首轮构建输入/overlay23/23通过。
- 隔离Electron源预览用实际Alameda及原拆包函数加载维护模块和固定controller，canonical连接factory为1次，分页signal接线通过；显示、聚焦和外部请求0。首次夹具启动受ELECTRON_RUN_AS_NODE环境影响，随后页面相对路径配置错误，均保留失败现场；修正夹具后通过，不记作产品故障或完整应用/视觉验收。
- 新工作树首次公开门禁897/899通过，因锁定依赖尚未准备导致两个CD2测试入口失败；随后仅用离线缓存执行npm ci --ignore-scripts，相关两文件60/60通过，完整公开门禁复跑931/931通过，失败/跳过0。未修改CD2产品或测试、依赖版本和锁定内容。最终source冻结后的22项电影检查和6项overlay/runtime provenance夹具通过；283项tracked及新增/变更JS语法、334项tracked与全部14差异文本有限凭据模式和diff-check通过。来源绑定构建要求提交源码；本批没有提交授权，完成可审阅源码与验证后一次性请求本地提交/构建。尚无runtime包、完整应用、窄视口、真实服务器/媒体/远控或安装通过结论；未推送、创建PR、合并或发布。

## 2026-10-15 v0.3.3发布收尾

- PR #37已合入main，产品来源与v0.3.3 Tag均为11f29056c64abe2fb8133a409781a83e11cf9a60；最终主线公开CI919/919、材料144/144通过。材料测试已分离为显式selftest，原断言保留，不用跳过来制造通过。
- 最终来源重新构建并校验2155项payload；固定Inno编译安装器后经innounp测试/解包，2156文件（含manifest）逐路径/哈希与运行时匹配。安装器175696187 bytes，SHA-256 066143a7a89fbf56ad9009b27298c4eb4c1e63f51c20b7642f463d43cc635589，保持NotSigned。
- 最终运行时About原生组件18组状态及三视口检查通过；完整应用初始化中的合成四选择器均为真实EmbySelect并使用原ActionSheet，选择区宽度恢复，实际窗口显示/Native启动0。个人登录、配置及已导入内核仅用于独立本地入口，不进入公开安装器；新内核基本播放保留用户反馈身份。
- 已发布GitHub Pre-release并上传安装器、来源记录、单文件摘要、Release说明与SHA256SUMS五个附件；Stable/Latest保持v0.3.1，旧v0.3.2附件不变。产品Tag和包体由原提交固定，后续文档提交不重标产品源码。切轨延迟继续无限期延期。

## 2026-10-15 v0.3.3测试版发布范围

- 用户明确要求当前UI修复完成后发布测试版，并授权本任务可回退操作。版本推进为0.3.3，使用Pre-release，保留v0.3.1正式版/Latest及既有v0.3.2资产。
- 集成已审核的内核候选打包CLI参数修正及真实子进程回归，来源为独立已完成7d03bbb的两个工具/测试Git blobs；状态文档在当前分支统一记录，不覆盖新进度。暂停的离线延迟工具保留独立分支，不恢复采样、性能实施或前台操作。
- 详情新增生成器暴露runtime-provenance材料夹具遗漏：补入fixture固定文件清单后原两项正/负例通过，没有降低来源与tamper断言。3cddb46的材料失败保留，后续新来源重跑独立记录。
- 3cddb46公开925/925通过；实际完整应用初始化后，合成详情控件使用四个真实EmbySelect，原生ActionSheet生成两项、选择区宽度恢复，窗口显示/Native启动均0。实际详情路由在严格网络限制下未完成，记录为夹具限制，不记为真实详情验收；控件检查不执行原Item业务controller或改真实媒体选择。
- 发布安装器从最终main来源重新构建，校验版本/来源/完整payload及解包内容；发布后核对Tag、Pre-release/Latest与匿名下载字节。安装器保持NotSigned，来源许可等既有边界保留，不执行系统安装，不携带私有测试脚本、登录材料或用户导入的内核。

## 2026-10-15 详情选择器原生菜单与布局跟进

- 用户在About本地提交/构建授权后补充详情页UI差异，并明确本任务可回退操作直接推进。About九路径已单独提交59b34cd并构建，详情修复保持独立可回滚提交；不扩展为发布、安装或真实业务写入。
- Model Tier: Tier 1；Model: 明确规格实施GPT-6 Luna High，主线程沿用当前配置负责审核；Reason: 两个属性与详情局部样式，既有原生控件和构建合同明确；Escalated: no。
- 根因一：selectSource/selectVideo未指定data-menu=custom，桌面模式落入Windows原生菜单；selectAudio/selectSubtitles已使用Emby ActionSheet。仅在固定HTML overlay补两个属性，原Item controller、控件和菜单模块字节保持。
- 根因二：Carnival layout.css的宽屏附加规则将noScrollY详情选择区限为24em，并对label/select增加上边距。固定布局overlay保留原文，仅追加.itemView内80em以上的width:auto与margin-top:0；不修改其他页的选择器或整套主题。
- 新生成器进入build-input与runtime overlay来源合同，输入/输出SHA固定，重复或漂移锚点拒绝；HTML既有外置播放器退役变换链保留。执行冻结emby-select的pointer/Enter/change/disabled测试，以及5项定向与28项组合检查通过；父会话复读真实diff并重复5项通过。后续来源绑定构建、包体及原生控件隐藏验证独立记录，不宣称完整新版详情页已迁移。

## 2026-10-15 About原生界面整理候选

- Model Tier: Tier 1；Model: 主线程沿用当前配置，只读Web范围核对为GPT-6 Luna High；Reason: 已有界面与IPC合同明确，限定About三文件和回归/文档；Escalated: no。没有修改内核选择、启动、回退、播放或Session代码。
- 用户确认20261015候选可以播放，截图显示候选已通过启动握手；这分别是USER_REPORTED有限播放与截图证据，映像SHA仍UNKNOWN，其他媒体组合与回退未验收。
- 动态候选按钮使用document.createElement的原生emby-button注册并追加样式类，保留构造器的主题/焦点类；候选列表复用原listItem样式，不再使用独立边框卡片。默认显示本次/下次启动及简短状态，长哈希/PE/来源/许可声明收进技术详情，保持未知值和判断边界。
- About原生primary按钮沿用button-submit主题填充，不更改其他设置页；空状态行不保留高度，去除空白占位。版本信息与操作功能、原IPC及错误/取消状态保持。相关定向测试19/19通过；实际原生按钮/样式的隔离渲染与来源绑定构建分别记录。
- 只读复核Web范围：已做GenericUI/插件兼容与首页HomeSections接线；卡片、其他页族和共享播放组件主要沿用原有实现。Electron44.4.2是独立运行时升级，不能表述为整套新版Web迁移完成。路线图进度按已确认首页方向和延迟无限期延期同步。
- 定向19/19、公开920/920、JS280项及331文本有限凭据模式扫描通过。源预览使用真实Emby按钮/滚动元素与列表/主题样式、合成IPC；390/800/1280的18组状态、默认折叠/展开、选用按钮的原生实例/主题类和ID分派通过，截图已人工检查，无外部网络或真实窗口显示。首轮夹具用矩形尺寸误判闭合details的不可见后代，次轮试图点击已禁用的选中按钮，分别更正可见性与交互前置条件后通过；未为夹具错误修改产品。该证据不替代来源绑定包/安装或真实内核操作；用户随后明确授权本批9路径本地提交和继续构建，复核差异及已审核字节后执行。

## 2026-10-15 首页说明收敛与空收藏核对

- Model Tier: Tier 2；Model: 主线程沿用当前配置，独立内核材料任务为GPT-6 Luna High；Reason: 原生页签加载与接口/渲染证据需区分；Escalated: no。没有改变播放、Session、认证或公共组件归属。
- 移除成功首页顶部额外管理说明；回归改为要求stage直接由分区组成，显式空布局也不插入说明节点，28项定向检查通过。变更继续位于已授权的首页本地提交/后台构建范围。
- 完整应用隐藏切换可创建12个Favorites分区，原生getItems/getArtists/getPeople成功返回0条；只读核对Filters=IsFavorite、IsFavorite=true、Filters=IsFavoriteOrLikes同样为空。用户明确原网页也无收藏，所以保留原生收藏行为，不用合成内容冒充真实收藏，也不将空列表误记为加载失败。
- 独立材料任务准备20261015版shinchiro标准x64 libmpv ZIP，父会话使用产品worker重新验证四条目完整性、x64及必需导出通过。来源URL及下载摘要另行核对，候选DLL未加载、未替换基线；真实导入/启动/回退由用户后续单独测试。
- 产品提交44edab5完成来源绑定构建及2155项payload校验；公开918/918、材料82/82、JS280项通过。实际应用在只读服务/隔离profile中切换主页-喜欢-主页：首页13分区、说明节点0，真实空收藏页签可进入；另一次仅在内存中提供1条合成收藏，原Favorites组件生成卡片。窗口实际显示0、Native子进程启动0，网络限制引起的独立renderer拒绝保留，不宣称全部renderer异常为0。直接启动入口完整文件集合与哈希检查通过，登录与STRM配置复用，不带入候选内核选择；文档HEAD与44edab5产品来源分开。

## 2026-10-15 原生首页加载链验证收尾

- 产品来源f087a4e重新来源绑定构建，公开918/918、材料82/82、JS280/PowerShell28及331文本有限扫描通过；2155 payload完整校验。原生别名回归28/28，组件隐藏窗口800/1280各14项通过；夹具已使用原app.js的getDynamicImport及拆包函数。
- 完整应用检查直接运行实际main、app.js/router、HomeTab与BaseTab，使用隔离登录副本，只放行同一服务的元数据GET。实际构建出13个首页分区并出现卡片、布局有效，未再出现首页构造帧错误；禁止写入、WebSocket/其他网络与Native子进程，实际窗口显示0。观察到的卡片数是初始懒加载结果，不代表所有虚拟列表或前台交互完成验收。
- 完整应用夹具前两次因误拦本机electronfile协议未进入应用层，保留失败；放行既有本机协议后通过，没有为夹具错误修改产品。只读模式下的非首页网络拒绝单独保留，不宣称所有renderer异常为0。
- 新独立入口沿用已核对登录/连接配置，在新目录验证启动文件与payload，未覆盖用户正在运行的旧候选。f087a4e产物来源与后续文档HEAD分开；前台复测仍由用户完成，延迟项无限期延期。

## 2026-10-15 首页原生模块导出合同修正

- 用户实测be8e8c4首页空白。脱敏renderer日志定位到构造函数第1行669列；原生app.js的getDynamicImport经过returnFirstDependencyDefault返回controller本体，接线额外访问.default.create而中断，尚未进入服务端数据读取。
- 旧Node/隐藏夹具把别名等同于原AMD module对象，掩盖了正式加载链的拆包语义。回归改用原app.js两段实际函数生成别名：修改前复现相同TypeError，修改后28/28通过。接线直接消费controller.create，并重新固定HomeTab输出SHA；不改公共加载器或其他模块导出合同。
- 用户报告喜欢页可用、插件暂未发现问题、尝试播放暂时正常，只按各自有限反馈记录。切轨延迟无限期延期，后续不主动采集/优化；新内核导入因材料不足未验收。
- 修复继续限定在此前明确批准的首页文件范围，后续本地来源绑定构建和隐藏完整应用验证分别记录；没有前台输入、推送或安装。

## 2026-10-15 首页候选后台构建与验证收尾

- 用户明确授权13路径本地提交及隔离构建/隐藏验证，候选先提交5444670；真实组件验证促成同范围内的激活修正be8e8c4。最终runtime保持be8e8c4来源，版本0.3.2，2155项payload通过package VerifyOnly及完整集合/哈希核对。本地ZIP2156条目（含manifest）逐条目读回，SHA-256为5905cc86ea209c8263d07127c37913c55031ecfb23704f596b72c941970b70aa。
- 最终来源公开门禁918/918、材料门禁82/82，JS280项、PowerShell28项及331维护文本有限凭据模式检查通过。相对e15692e，产品文件仅新增两个首页模块、修改app.js与HomeTab；其余差异为来源/依赖记录，无payload移除，原Helper/DLL字节保持。
- 隐藏DOM用实际构建资产及原CardBuilder/itemscontainer/imageloader/scroller，在800和1280 CSS视口各14断言通过；标题转义、卡片输出、离页取消和旧服务器回退有受控证据。show/focus/外部请求0，无测试Electron残余。BaseTab、API数据及宿主业务服务为fixture；未执行真实播放、会话/远控、登录复用或安装。
- 保留所有首次失败：旧5444670卡片未激活，以及隐藏夹具缺input、图像辅助方法/样式alias、播放和菜单能力、shortcut服务等依赖。最终夹具改用原imageloader和shortcuts，补齐受控宿主服务，未为夹具失败修改生产公共组件。前台保持暂停；没有推送、PR或发行。
- 本条为文档收尾，最终包和来源回执仍绑定be8e8c4，不因后续doc-only提交重标或重建已验证产物。

## 2026-10-15 首次卡片容器激活修正

- 5444670来源runtime的隐藏真实CardBuilder/itemscontainer检查在卡片断言失败；受控BaseTab和API服务不包含真实播放。实际组件的refresh monitor初始为paused，直接refreshItems提前返回；改为公开resume({refresh:true})，不更改组件、播放或Session实现。
- Node fixture以真实paused初态建模，接口/生命周期28/28复核通过。保留第一次夹具模块依赖超时及第二次实际卡片失败，不把它们改成PASS；后续runtime按新提交单独构建/绑定。

## 2026-10-15 首页渲染与生命周期接线候选

- 已批准接口候选4d59329后继续本地接线：固定HomeTab/app.js overlay注册单一维护controller，沿用原BaseTab、ApiClient、CardBuilder、itemscontainer与焦点/播放owner。首批覆盖默认水平卡片布局，未支持视图、图像/尺寸或命令分区完整回旧首页。
- 刷新前清除旧stage；暂停、销毁、user/server/client变化和新轮次使旧响应失效。旧renderer的user及加载等待也可取消且有期限；卡片渲染异常会回退，回退仍失败只显示可重试的通用提示。标题使用textContent，原上下文操作与Item DTO不重建。
- 目标服务只读核对4.10.0.40：tv与mobile,desktop各13分区；resume/onnow/latestmedia三类条目API读取成功。仅保存脱敏schema摘要，无服务器写入、UI、原始响应或媒体内容落盘。
- 接口与Node DOM/生命周期测试28/28，构建输入与overlay23/23通过。来源绑定构建、隐藏实际DOM与前台结果仍待后续；当前不以这些检查宣称页面或播放已验收。
- Model Tier: Tier 2；Model: 主线程沿用当前会话模型；Reason: 页面事务、取消、fallback与来源生成关系；Escalated: no。真实服务摘要与原始试验过程保存在仓库外。

## 2026-10-15 服务端首页只读接口候选

- 用户选择跟随新版网页首页分区/顺序，保留旧版回退。自有适配模块复用当前ApiClient的getUrl/getJSON，不新建认证、播放或Session owner，不复制新版Web整树。
- GET HomeSections及Section Items保留服务端顺序与原Item DTO；ID按路径段编码，查询参数固定，禁止转发任意URL/命令。刷新/暂停/销毁取消请求，过期client/server/user响应丢弃；请求或不支持布局整体回退。
- 11项离线合同测试通过。版本门槛和DTO依据固定Web分析样本，不是目标服务器实测；尚未接到HomeTab或生成页面候选。接线/renderer与设置提示、真实服务、前台/播放验收分别保留待办。
- Model Tier: Tier 2；Model: 主线程当前模型；Reason: 首页请求归属与兼容回退；Escalated: no。普通工具和文档核对由独立worker完成。

## 2026-10-15 主线集成与交付记录归属

- 用户明确授权已审核累计59路径推送、创建PR、检查通过后合入main及最终main来源测试包构建；已创建[PR #36](https://github.com/hope140/EmbyTheaterEnhanced/pull/36)。产品范围保持，补充的内核管理使用说明与状态同步只触及既有文档。具体合并状态、main构建sourceCommit/包体SHA及未验收范围写入PR最终收尾说明；不通过后续doc-only提交重标旧产物来源。
- 下面各条按原来源保留候选、本地构建和后台证据。本批不发布Release/Tag、不安装客户端，也不把合成DOM、fake-client或静态PE结果改称真实Native/播放/前台通过。首页迁移不启动，切轨延迟继续暂停。

## 2026-10-15 已完成批次整体收尾核对

- 用户纠正应先收尾已完成成果，首页迁移不进入本批；切轨延迟继续按用户要求暂停。逐项核对旧功能/M01、L02、M02及插件布局的累计59路径，17项产品源码与94dbcef runtime字节/manifest相符，未发现已完成提交遗漏或新首页/延迟产品混入。本条为远端操作前的本地审核记录；后续授权与集成归属见上条。
- 提交前门禁275JS/28PowerShell语法、326个维护文本的有限凭据模式扫描与累计diff-check通过。890/890公开、82/82材料及131项隐藏插件/12组静态几何保留本轮来源。固定94dbcef runtime生成本地验收ZIP，从ZIP内读回2154个文件全量SHA匹配；ZIP SHA为`b08a652e984c8623e96459bcdacdfd8ffe5eaa13a91c1a9a4280c4168062a74b`，未作为Release发布或安装。
- 旧About私有夹具的scope问题在新副本修正并预检查；唯一有效Electron运行通过8个合成状态和全部布局断言。内容窗口800（Electron坐标），125%缩放，实测CSS640×702、devicePixelRatio1.875；横溢出0，启用按钮可滚动/键盘到达。show/focus/activate为0，所属Electron退出且无残余，runtime仍2153项payload加manifest且无debug.log。保留启动前目录冲突及外层PowerShell变量命名错误；后者仅修正读回，没有重跑Electron。旧69e8141历史NOT_VERIFIED保持，新94dbcef合成DOM结果单列，不称真实Native/前台验收。
- 通用审计最初误将最新doc-only HEAD85c4243作为runtime源，得到来源MISMATCH；原结果保留。主线程用正式source-provenance/runtime-provenance CLI显式绑定真实产品提交94dbcef后均通过、errors为空，未修改或弱化validator。文档收尾不改变产品/runtime来源，不重新构建已验证包。
- Model Tier: Tier 1用于明确集成清单、既有私有fixture修正与包体验证；worker选择GPT-6 Luna High，主线程保留累计来源/最终结论审核。没有实施新首页、切轨性能变更、推送、PR、合并、发布、系统安装或现用profile操作。

## 2026-10-15 插件布局来源绑定构建收尾

- 用户明确批准本批9文件本地提交和后台构建。父核对准确allowlist、全部SHA、反向patch和空index后提交`94dbcef4b6f50469e535fb91fe86209d16670ae4`。Tier 1 GPT-6 Luna High任务负责固定输入复制/校验、锁文件依赖、构建及测试证据；主线程保留候选审查、最终runtime隐藏复验和完整payload读回。原主目录与M02产物保持。
- 固定Carnival/patch/Electron44.4.2完整树、mpv头文件与GCC UCRT64工具链由已验证M02材料复用并校验；`npm ci --ignore-scripts`使用原锁，不升级依赖。source-bound输出`dist/EmbyTheaterEnhanced-plugin-layout-94dbcef-20261015`共2153项payload；build-manifest SHA为`8b22c2110084946abfb955ae15666c6b11281e5bec884caaa076ad67e533b289`，payload-set SHA为`bf8ea4d3e2abee07e6084a786f804e64410d72202d767173f18a7bbf791715d7`。VerifyOnly和隐藏测试后的父逐SHA/完整集合复核均通过。
- 113个发现测试文件按原合同排除6项材料依赖，107文件公开门禁890/890。首次材料门禁并行启动过早，准备态preload尚未生成，统计77/78且4项未加载；保留失败后确认preload与本次runtime/manifest同SHA，在稳定准备态单次重试六项材料门禁82/82通过。没有改产品/测试来消除失败。
- 父的私有fixture从最终runtime读取实际维护模块、冻结Web模块和Electron执行131项隐藏合成检查；1次本地有效命令、外部请求/目录选择器请求/前台动作均为0。实际runtime CSS的静态模板三视口12组复验通过。最终runtime来源始终为94dbcef，后续文档收尾单列，不重新构建。没有执行真实插件脚本/业务、Helper/DLL、播放、现用profile、前台、安装器或发布。

## 2026-10-15 传统插件布局与基础编辑器验证

- 基于`dd34ac3`在独立工作树处理Chapter API宽度反馈。只读获取当前插件字节并通过PE元数据静态提取四页模板，未加载DLL或执行插件脚本。属性隔离复现传统表格`display:block`导致33%布局列坍缩；移除该display覆盖，保留原表格约束，由现有内容容器承接横向溢出。没有改插件模板、路由、业务命令、PlaybackManager、Session、Native Helper或现用profile。
- 同一实际CSS的四页、三视口共12组静态几何复核覆盖单层/嵌套百分比分栏、长合成行、目录滚动、窄Options输入焦点及外层纵向滚动。真实网页同尺寸矩形和前台仍未验收。原来仅恢复嵌套表布局的备选会遗漏单层分栏且窄Options仍整页溢出，未采用。
- 现有基础editor/source-ID差分转为测试覆盖补齐：新增四类editor、对象数组选项、过滤/分页、本地provider、显示转义及canonical命令值不变的断言。worker相关Node测试40/40，父会话扩大到相邻路由/关闭/订阅的55/55复核通过，两次不合并计数；隐藏Electron合成门禁131项通过，1次loopback命令，外部请求/目录选择器请求/前台动作均为0。首次新fixture漏了冻结GenericEdit必需的SelectOptions数组而失败，补齐后重跑；保留失败证据，未据此修改产品或vendor。
- Model Tier: Tier 1用于明确CSS和测试范围；Model: worker使用GPT-6 Luna High，主线程沿用当前会话配置并保留原因判定与最终审核；Reason: 局部布局及已确认控件合同，无播放/Session改动；Escalated: no。
- M02最终提交边界、完整2153项payload、manifest/provenance、公开888/888及材料82/82已独立读回；fake-client重启/回退不替代真实内核或播放验收。04下一步缺少旧目标内容录制，保留T4 NOT_OBSERVED和700ms既有等待；06首页新API/配置归属仍需具体设计。当时的新候选未提交或构建；后续94dbcef构建结果见本日收尾记录，未发布。

## 2026-10-14 M02 手动内核候选实施

- 用户已确认方案为手动导入完整候选ZIP、下次应用启动生效、候选启动验证失败一次回到固定baseline。隔离组合worktree基于`a820f5d5dfba35f1f52b93a6d7097af80552fb02`；保留旧M01候选、共享旧主目录与所有已有改动。产品变更28文件已按单独回滚范围提交为`8d06f0b53280a86c3b74c94c452cb6469d428312`（`feat: add manual mpv kernel candidates`）。随后两项test-only断言适配单独提交为`d894e4ea093af026f8e463aaeb12677f99dfd4cc`；runtime源身份仍绑定产品提交`8d06f0b`。未推送、创建PR、合并、发布或安装。
- 主线程保留`service.js`、`main.js`、窄IPC、startup effective target、退出确认和fallback；Luna worker分别负责纯ZIP/schema/PE parser及profile store测试。候选包只含`candidate.json`、`mpv-1.dll`、`SOURCE.txt`、`NOTICE.txt`；固定生产Helper SHA/API131077/protocol1/capabilities，不接收renderer任意路径/URL/command，不执行包内文件。大包解析/hash/Deflate/PE预检在本地worker_threads运行，关闭等待本任务worker退出。
- Profile状态以DLL SHA寻址、对象不可覆盖；导入不选择，选择仅为pendingRestart。Main在应用构造时冻结一次启动选择；无候选继续baseline lazy启动，候选才在renderer page load前启动前验证。失败候选仅在owned process exit确认后fallback一次；有效候选失败后本进程effective target锁存baseline，后续create或baseline crash重建不重新试候选。成功候选的显式recreate仍绑定同一candidate；播放中Helper crash不换库/重放session。损坏JSON/unknown schema和超限普通state仅由用户显式baseline选择原子修复，state link/directory拒绝并保留。
- About明确分开包/静态结果、pending/active、ready handshake和image SHA UNKNOWN；source/notice来自随包声明，releaseability NOT_ASSESSED。离线维护工具生成固定ZIP并在输出前用同一import validator readback。无可信候选来源、完整runtime build、Helper/DLL load、真实profile、播放器前台、Emby/服务器或业务播放验收。
- 定向矩阵：16个测试文件164/164，覆盖ZIP Store/Deflate尾流消费、CRC/schema/path/flags/Zip64/属性/重复名/offset重叠、PE架构/节表/RVA/导出、profile store取消/并发/原子性/state修复、窄IPC、About状态与错误反馈，以及baseline lazy启动、候选预热、exact-exit后单次fallback、effective target锁存和destroy/recreate/crash边界。固定baseline DLL只做匹配SHA的静态PE预检，未加载或执行。独立Astra复核的90/90绑定其精确sourceContentSet `7958559f3a917ec9adf7396688dc0ab2438e4b65be909f07eb156f8a2567c194`；父会话对后续main/IPC/About小差异实跑13/13。三组结果分别记录，不相加。
- 定向公开离线门禁：首次107个文件/888项中887通过、1失败，原因是`product-session-identity.test.cjs`只查找旧的`loadStartInfo().then(...)`语法；M02启动链改为`return loadStartInfo()`，identity先于该调用的产品不变量仍成立。test-only提交改为识别两种实际调用形式并保留原顺序断言，完整重跑107个文件、888/888通过、0跳过。六项material-required测试首次为81/82，唯一失败是旧`external-player-process-chain`把L02已退役的sleep命令当作正向保留项；test-only提交移除该过期正向项，保留并加强windowstate/exit/loaded/video/audio/openurl正向断言及sleep/shutdown/restart的禁用断言，之后82/82通过。
- 依赖按原`package-lock.json`执行`npm ci --ignore-scripts --no-audit --no-fund`，34个包安装成功。经已验证mainline输入复制并逐项重核：Carnival 1009文件、patch 51文件、Electron 44.4.2 73文件、固定GCC 6990文件/553090415 bytes及mpv头文件均匹配各自合同。产品提交`8d06f0b`上运行`tools/build.ps1 -OutputName EmbyTheaterEnhanced-m02-8d06f0b-20261014`，生成2153文件；build-manifest SHA-256 `b76274946b9012315eda1a5af181b59235c145c598f0130e51600200e0bad42f`，payload-set SHA-256 `5cf12c1679489cc5e4cc54af29c94e5779522619670fde7007238910747a98bd`。`tools/package.ps1 -RuntimeName EmbyTheaterEnhanced-m02-8d06f0b-20261014 -VerifyOnly`核验2153文件、逐文件哈希及provenance通过。source/runtime/input provenance均指向产品提交；Helper SHA为`28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`，baseline DLL SHA为`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。未生成安装器。
- 使用构建runtime中的实际store/bootstrap/service代码和真实runtime身份、独立合成profile及Fake NativeHelperClient模拟baseline lazy启动、pending选择不改变当前target、重启冻结候选、坏SHA/API/version拒绝、候选exit receipt后一次baseline fallback、baseline失败停止重试；共三组模拟启动，不调用真实Helper进程或加载DLL，不创建真实BrowserWindow，不触发show/focus/activate、播放/Session/远控、真实profile或服务器。前三次模拟回执记录了夹具identity作用域、plan索引、事件索引及状态读取假设错误；修正夹具后第四次通过。全部尝试日志保留在仓库外`m02/build-validation/`。
- 静态检查：产品候选23个JS/CJS语法检查通过；两项test-only文件也分别通过`node --check`，差异`git diff --check`通过。未运行完整`npm test`、安装器/系统安装、真实候选或Helper/DLL、前台UI、Emby播放/远控或服务器访问；也未推送、创建PR或发布。完整检查回执见仓库外`M02_BUILD_RESULT.md/json`。
- Model Tier 3；Model为当前GPT-6主线程（运行时未显示更细模型别名），Reason为跨main/IPC/store/Native Helper的启动/退出/安全边界；Escalated为NO（从起始即按Tier 3）。Luna纯模块worker负责parser/store文件；Astra和父会话均只读复核。最终后台结果停在父会话payload/commit readback，不声称真实内核升级或播放验收。

## 2026-10-14 L02 停用旧 AppHost 系统动作

- 用户选择停用旧 sleep/shutdown/restart 协议动作。Web apphost 不再广告这三项能力或暴露对应方法；apphost-command 白名单及 main 协议分派不再接受和执行这些 token，删除专属系统动作函数。拒绝请求仍调用协议 callback 并返回空响应。apphost.js 是 source-maintained 的 src/electronapp 产品文件；基线提交 aab528b 的 Git blob 为 52614ee25e10d74df5da8d2583ed9955e455b677，输入字节 SHA-256 为 7087A292E7262131E0F1EA08716E257846B55FE23510302A7D6E6AC746DA6A21，直接修改受 sourceCommit 绑定，不需要 vendor overlay。
- 保持 APPHOST STARTUP COMMAND CANONICALIZATION、windowstate、exit、loaded、video/audio powerSaveBlocker 与 openurl 安全解析路径；未改变普通锁屏/播放电源阻止器。没有调用真实系统动作。
- 实际 main handler 对大小写、尾斜杠、双尾斜杠和编码变体合成请求逐一回调并验证零副作用；实际 apphost.js VM 核验 capability 与方法均关闭，正常 windowstate/exit 命令保留。定向22/22、相关 JS 语法与 diff-check通过。
- Task Risk/Uncertainty 与 Cross-module Scope 为 Tier 2；Playback/Session Impact 为 NONE。主线程保留协议/系统动作边界与最终审查，沿用当前会话模型，未升级。父会话最终审核通过并记录于私有 L02_FINAL_REVIEW.md；9路径 L02 变更另提交为69e8141，和30路径aab528b可分别回退。
- source-bound `tools/build.ps1` 以sourceCommit 69e8141abf61bd335ec58498937ce1689ff115e2完成。隔离runtime为dist/EmbyTheaterEnhanced-phase01-l02-20261014；build-manifest SHA-256 048eb6973d54de5d337f26e383ed1a556c1fcd707db1b53e07c632987b085580，payload 2147文件，canonical payload-set SHA-256 41b786dc862cab51d4a385b862f2de612831afc5e696d608ae1d77fac585a852。`tools/package.ps1 -VerifyOnly`完整文件集、逐文件hash、provenance、runtime exclusion和锁定依赖校验通过；未生成安装器。
- 通过实际构建产物的Web AppHost VM检查21项，主协议分派器从构建后的main.js执行合成测试13/13。父会话在仅含一项bundled identity测试调整的test-only HEAD cca8f52复跑公共离线门禁：98/98测试文件集，819/819 cases，0失败/跳过；JS语法259、PowerShell语法28、有限凭据扫描310及diff-check均PASS。340个tracked源文件hash汇总为e8d244b9a744375b8dfdd8ef2270b01b7188444df1c2441dde19c2634a9b310d。原先784/787那次门禁作为旧结果保留，未覆盖或合并到本次结果；runtime仍只绑定产品sourceCommit 69e8141。
- 隔离隐藏About DOM fixture直接加载生成runtime中的About.html、About.js、CSS及Babel/Emby button/scroller AMD模块；maintenance IPC仅返回合成状态，profile路径仅在私有fixture下，所有HTTP/HTTPS/WebSocket请求均被拦截。隔离窗的show/focus/activate均0，所有owned PID及子进程退出且无残留。run-20261014-06在私有几何回执生成器处因main harness作用域中缺少buildManifest而停止；父会话从独立run identity复核同一fixture也遇到相同缺项。800px/125%矩形及notReady/failed/missing完整DOM场景没有取得最终回执，状态明确保留NOT_VERIFIED；该fixture错误不能据此判定产品通过或产品失败。各run日志/回执保留于私有build-validation/hidden-about；没有产品源码或runtime变更，也未启动生产客户端、真实profile、服务器或系统动作。
- 文档后续提交只同步构建、公共门禁和隐藏fixture边界；runtime build-manifest的sourceCommit保持69e8141，公共测试所用HEAD为cca8f52，文档commit单独记录，不冒充runtime来源。前台、真实Emby/远控和安装验收仍未执行。

## 2026-10-14 M01 身份与配置候选整合

- 用户授权本地应用已审核的归一化 M01 补丁；在旧功能主线 managed worktree 使用 git apply --check 后应用9路径（6产品、3测试）。补丁 SHA-256 03DB9C95249D380BA8EA2790FFAB188A5BAA186681DE08DEE0FC4F3B449F7DCD；原始缺少终止换行的 M01_CANDIDATE.diff、M01 原 worktree 与两个早期 harness failure 记录均保留。
- About/maintenance 分开展示包内libmpv文件SHA、编译期预期身份、ready Helper 握手实际版本/API/capabilities；未ready信息为UNKNOWN/NOT AVAILABLE。包内SHA不冒充已加载映像哈希；实际映像SHA与属性回读仍UNKNOWN。固定render path与被忽略的UI值解释不改变Native路径。
- libmpv.js只对exclusiveAudio用规范UI键mpv-exclusiveAudio，缺失时兼容旧小写键；显式false优先，媒体类型仍限制为video。没有改PlaybackManager、Session、source/Resolver、generation、loadfile、Stop/Next、Helper协议或sender边界。
- M01定向Native状态、设置组装、About/维护测试72/72通过；定向语法/静态检查经父审核。应用后组合回归：L01 AMD/VM16/16、AppHost/外链18/18、L04+process-chain6/6、L05 item VM4/4、Next/Session76/76、overlay4/4、runtime provenance2/2、Pepper4/4、build-input audit20/20、public selector1/1。Full tools/build.ps1、真实Helper/DLL、MPV_HOME、前台、服务器和播放均未执行。
- Model Tier 2；主线程保留跨Native/renderer身份合同与最终审查，沿用会话模型。M01独立审查未发现产品越界；没有模型升级。source-bound全构建需要新增提交，本轮未提交/推送/PR/发布。

## 2026-10-14 批次01续办 L01 与 L03-L05 候选

- 在隔离 managed worktree 的 e862288 基线上继续。L01 的提示错误隔离与加载标记时机已修复：toast 缺失、抛错或 Promise rejection 都不阻断 CSS；JS 偏好解析失败只记录固定泛化信息，不输出配置或错误对象；加载成功后才置位 isCustomCssJSLoad。输入 CustomCssJS.js SHA-256 2177DE28DCC4E715F07C63329DC361C5B4DDD37EB7E59F273830B22ACEA37912；overlay 输出 SHA-256 B9F6268F3E3126426F189F38F1E57FF4CD03D8F9A213305157E1F6842F251103。旧 server/local 配置保留，CSS 保持选择链。
- 公开AMD/VM用例16/16、L01固定原件 material selftest、Web overlay生成4/4、build-input消费者/篡改测试1/1通过。新增两条overlay patcher直接依赖进入build-input contract，runtime provenance测试通过固定原件与generator绑定。
- L02新增真实main分派的合成非法scheme/编码command无动作检查以及windowstate、loaded、video/audio通知、openurl路径保持用例；共18/18通过。当前协议仍未验证sender/referrer，sleep/shutdown语义仍待决定；没有调用系统动作。
- L03核验manifest固定的Host SHA与BAT SHA，并用ilspycmd做静态托管IL检查，未发现两个BAT名称、.bat字样或直接启动调用。托管IL范围外的动态路径/组件消费者及手工用户依赖仍UNKNOWN；因此runtime exclusions和manifest保持未排除这两份BAT。没有执行Host或BAT，也未清理已有安装目录。
- L04移除onLoaded中的Anime4K before-input-event拦截、全局配置rename、隐式Stop及旧Notepad/Shader帮助对话框。新构建不重新分配按键，旧mpv配置不读写；用户指南增加兼容说明。合成按键归属及process-chain测试6/6通过，Next/Stop/Session owner相关回归76/76通过。
- L05通过固定hash item.js/item.html overlays移除旧详情按钮、appSettings.autoplay写入和fromPlayEnded timer；旧autoplay/externalplayers值保留并在存在旧设置时给一次提示。PlaybackManager/PlayQueue/Session/Together未改；item AMD/VM合成4/4、固定material selftest、playback queue/session 76/76通过。
- 任务 Tier 2；主线程保留权限/播放边界和最终审核，两名GPT-6 Luna worker提供只读AppHost及Host IL闭包材料。完整tools/build.ps1、客户端前台、真实Emby、安装、BAT/Host和系统动作均未执行。没有提交、推送、PR、合并或发布。

## 2026-10-14 批次01 CustomCssJS 信任边界候选

- 基线为实时远端 main e862288f10182e60ccb43128e71af755172210c1，在隔离 managed worktree 工作。新增 CustomCssJS.js 固定源哈希 overlay：CSS server/local 选择链保持；旧 JS forced_on、server/local 选择及本地存储数据保留但不执行；只在存在活动旧脚本或 JS 配置损坏时提示一次。JS 配置解析单独捕获，避免坏 JS 偏好阻断 CSS。未扩大到 preload、renderer sandbox、Native IPC 或播放模块重构。
- Task Risk Tier 2；Task Uncertainty：JS 执行入口及固定输入已锁定，Host 与旧用户行为仍有 UNKNOWN；Cross-module Scope：Web 模块、生成器、测试与维护文档；Playback/Session Impact：NONE。主线程沿用会话默认模型，任务接口未暴露具体子型号；两个独立只读闭包审核由 GPT-6 Luna worker 执行。Reason：可信 renderer 中的任意脚本可达 preload 文件/IPC 能力；主线程保留安全合同和最终审查。Escalated：NO。
- 输入 CustomCssJS.js SHA-256 2177DE28DCC4E715F07C63329DC361C5B4DDD37EB7E59F273830B22ACEA37912 与 e862288 runtime-manifest 一致；生成 overlay SHA-256 FD7B862359EB5E48C31A3759BC0B160DF127395B82291D4136B3FF869BC27D7B。定向变换3/3、全 Web overlay 构建准备4/4、AppHost 规范化合同5/5通过；变换输入以 manifest 锁定 vendor 文件验证。完整 runtime build、真实客户端、真实服务器、安装及用户脚本行为未执行。
- 其余批次01候选保持未实现：AppHost 的系统动作仍可由旧协议静态调用，需先确定 legacy 请求停用或显式用户确认合同；两份旧 BAT 的 Carnival Host 固定名依赖为 UNKNOWN，暂不从 runtime 排除；Anime4K 快捷键的按键传递/替代行为未定；外置播放器 timer 的运行时 owner、resume 路由及用户依赖未知。没有执行系统动作、旧 BAT、mpv 全局配置或真实播放。

## 2026-10-14 插件兼容与总排期主线集成

- 用户明确授权合并，范围为已发布插件兼容分支及本地总排期文档。基线为main 080d352、插件分支44816ad；产品源码保持373209b，当前新增提交仅整理状态、总排期和维护记录。经PR合并承接既有17个提交，不改变已发布Tag/附件身份或Stable渠道。
- 复核受影响源码与构建变换范围：维护插件模块、app/viewmanager/router overlay及来源合同；Native Helper、PlaybackManager、Session、CD2/Resolver和锁定依赖保持。历史分支审计只供集成范围判断，研究探针与窗口激活实验不纳入。
- Task Tier 1；主线程沿用用户配置并负责最终diff/核心边界核对，GPT-6 Luna High执行公开离线测试、语法和有限凭据扫描。新增文档执行diff/相对链接检查；已发布源码的923/923及隐藏/包体验证保留原修订归属，不重报为本轮执行。PR及main的实际公开CI结果以GitHub记录为准；未执行前台、系统安装或真实业务操作。

## 2026-10-14 核对主分支集成完整性

- 实时更新远端引用并核对34个PR及最近Release；远端main为080d352，v0.3.2测试版来源373209b，插件分支44816ad比main多17个提交且包含main全部历史。测试版发布不代表分支已合并，最新总排期文档也尚未提交。
- 对129个本地/远端引用进行祖先和patch等价扫描，重点补审生命周期、Stop、IPC边界、构建安全、deadline、CD2刷新、旧Settings、产品身份及远控presentation；CD2和presentation相关候选文件与main的blob一致，旧Settings与身份已由后续实现替代。未发现其他可确认的产品实现漏合；v029观测/延迟及窗口激活研究不整体并入，两个合成安装快照辅助文件的保留价值待判断。
- Task Tier 1，主线程沿用用户配置；只读引用/内容审计worker为GPT-6 Luna High，最终结论由主线程核对。只更新现有状态/维护文档及私有审计结果，保留其余改动；没有产品修改、提交、推送、合并或新发布。执行Git图关系、内容与diff检查，未运行无关产品回归。

## 2026-10-14 汇总整个项目并重排后续批次

- 读取已完成的固定v0.3.2 Web评估和测试版收尾记录，实时核对Release仍为Pre-release、Stable/Latest为v0.3.1；区分产品373209b与收尾文档44816ad。评估当前Web的720文件审计面和A/B/C工作包范围不是实际修改数量或工时。
- 用户澄清范围为整个ETE，不继续安排当前界面版单独验收。已发布修复移出待办，原未执行验证不改写PASS；旧审计L01–L11/M01–M02与已知字幕/音轨延迟、Web评估A/B/C一并纳入。主线调整为旧功能/信任边界 → mpv身份配置 → 内核管理升级 → 实证延迟修复 → Web底座/首页/媒体库/详情搜索；播放连接生命周期、显示硬件、CEC/WOL/发现/启动、安装配置回退与资源收口分批后置。旧v0.3.2清理/mpv建议的编号不再作为现发行范围。CustomCssJS动态执行路径在固定v0.3.2 runtime仍有静态证据，实际启用/执行不在本轮验证；优先复核边界，不推断已利用或运行。
- 计划将原生播放/Session、STRM/CD2和窗口归属保持为固定边界；不把新Web或内核升级视为字幕延迟改善。来源/ABI受阻有可独立推进的工作分支，相关核心区域串行，高风险变量分开候选；当前版不再重复排期，后续实际涉及内核/播放/硬件的改动保留必要回归。内核及控件/首页试点后再给时间区间，外部条件等待单独计入。原旧功能清理与可选能力均仍为候选，不把只读审计自动扩大为删除/改动授权。
- 本轮仅修改ROADMAP、PROJECT_STATUS与此记录，未改产品、vendor、版本或当前客户端，未提交/推送/发布。执行文档范围、相对链接和diff检查；没有重跑无关全量代码测试。Task Tier 1，Playback/Session实际影响NONE，沿用主线程配置。

## 2026-10-14 v0.3.2 测试版发布完成

- 产品来源固定为 `373209b641e966eb0672e54ceb415080cb5f126d`，包含测试材料分组修正；维护插件源码、8 个模块/模板及 3 项 Web 输出与 8d19eb8 完全一致。最终从该已提交源码生成独立 runtime，固定 Native Helper、完整 Electron 44.4.2 和锁定依赖保持。后续本项收尾只记录发布状态，不重标产品来源。
- 完整串行门禁覆盖 97 个常规测试文件及 5 个显式插件材料 selftest，923/923 通过、失败/跳过 0；最终源码[公开 CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38521023162)的 91 个公开测试文件实测 788/788 通过。JavaScript 248 文件、PowerShell 28 文件、有限凭据模式扫描 299 文本文件和 v0.3.1 至候选完整 diff 检查通过。未将首次 CI 的材料缺失失败或中断运行改为 PASS。
- 最终实际 runtime 的 AMD/DOM 合成检查 104 项通过；连续三次隐藏产品 bootstrap 均加载产品入口，使用独立临时目录及不同新 DeviceId，前台动作 NONE。直接 Electron bootstrap 不是 Host、安装或用户视觉验收；修复基线私有入口另有三次 bootstrap 与三次启动前校验。
- 安装器为 `EmbyTheaterEnhanced-0.3.2-373209b-win-x64-setup.exe`，175700593 字节，SHA-256 `a4c83e3fae09f87da4a1090192096a6cd067cd515bda7e4819212294db05e872`，PE 0.3.2.0、Authenticode NotSigned。固定编译器、来源和 package 校验通过；解包的 2147 个 payload 文件加 manifest 共 2148 项，缺失/额外/哈希差异 0。私有 harness、种子、profile 和已知私人路径未进入公开 payload 或附件。
- Annotated Tag `v0.3.2` 解引用至准确产品提交，功能分支按正常推送更新。[GitHub Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.2)为非 Draft、Pre-release，Latest 仍为 v0.3.1。五个附件均匿名 HTTP 200 下载，大小、逐附件 SHA-256 和 GitHub digest 相同；安装器、来源 sidecar、两种校验文件及 Release 正文/说明附件关系一致。v0.3.1 Release 元数据、附件身份和 Tag 保持。
- 前台显示 NOT_CHECKED；Host/系统安装、真实保存/备份/恢复、播放/远控 NOT_EXECUTED；实页未触发的分组说明和窄屏嵌套列表 NOT_EXERCISED。历史 114 次实页/模板/合成模态对照保持 8d19eb8 归属，504 次响应式工作对照保持 e248b59 归属。材料/许可 UNKNOWN 与既有风险状态保持，不把测试版发布当作新合规证明。
- Model Tier 2，Playback/Session Impact NONE，Escalated NO；主线程沿用用户配置保留最终审核/发布，两项审查及测试分组/回归按 GPT-6 Luna High 配置派发，子代理未独立暴露实际路由身份。主线程实际核对 worker diff、原断言保留、无 vendor 正反边界及最终日志后验收。

## 2026-10-14 插件兼容测试版收尾

- 首轮发行候选 5186e69 的本地 875/875 与正式 payload/隐藏门禁通过，但公开 CI 检出 5 项材料依赖测试误入离线集合（788/793，缺失未公开的 Alameda 与 app/view-manager 输入）。将完整 Alameda identity 测试及实际冻结材料的关闭别名顺序测试迁入显式 material-selftest，保留原断言，公开集合继续运行纯合成关闭测试；没有复制 vendor、跳过用例或弱化断言。该候选安装包未发布，后续从修正后的提交重新构建并重新核对门禁。
- 测试迁移定向 10/10 通过；无 vendor 的公开树纯关闭测试 5/5 通过，显式材料测试按预期因缺失输入失败而非跳过。公开选择器发现 97 个测试文件并选中 91 个，6 个既有材料排除合同保持；Alameda 全文件和关闭顺序用例按 Git 文本规范化核对，原断言保持。主线程复核 worker diff、门禁及范围后接管提交与最终发行来源绑定。

- 从 8d19eb8 的 clean 候选继续，核对远端 Stable/Latest 为 v0.3.1、未占用后续版本 v0.3.2。采用既有数字产品版本和 GitHub Pre-release 标记，内置 Stable 更新渠道保持；不增加 beta feed 或安装器版本规则。
- 主线程有界审核 GenericUI、导航事务、取消/代际/owner、受控 overlay 与来源合同；只读 worker 审核 schema/display/错误/关闭组件并执行公开离线回归及材料检查。最终安装器从版本化提交生成新 runtime，另执行来源校验、完整解包文件集合/哈希比较与公开匿名下载回读；准确提交、哈希和最终执行结果写入 Release 来源记录及收尾记录。
- 8d19eb8 正式来源回执包含 114 次后台对照、98/98 定向测试、104 项隐藏 DOM 和 2147 个 payload 文件。已核对四类回执的准确 sourceCommit、experimentalOverlay=false、前台动作 NONE、UI/Command=0 与非读取 HTTP=0。历史 e248b59 的 504 次工作对照/873 项回归不冒充新修订结果。
- 私有入口本轮连续三次隐藏 bootstrap 与三次启动前校验通过，不能记为前台启动 PASS。正式页面回执已核对；旧隐藏 fixture 的 CSS 原始哈希与正式 runtime 不同，因此发行前在新 runtime 上重新执行该门禁，不借用旧结果冒充发行产物。正常测试安装包不携带只读验收 harness、登录种子或 profile，不将私有命令限制混入产品。前台显示、真实业务命令、播放/远控和系统安装保持 NOT_CHECKED/NOT_EXECUTED；未触发的分组说明及窄屏嵌套列表保持 NOT_EXERCISED。
- Task Risk Tier 2；Task Uncertainty 有界；Cross-module Scope 为插件适配、受控构建 overlay 和发行身份；Playback/Session Impact NONE；Escalated NO。主线程沿用用户运行配置。两个只读 worker 按 GPT-6 Luna High 配置派发；worker 自报运行身份仅暴露 GPT-6，未独立确认子型号，因此不把派发配置当作其独立运行时身份认证。高风险正确性、修改、提交和发布由主线程保留。

## 2026-10-14 按钮主次、形状和布局集中核对

- 用户指出网页绿色全宽保存与客户端普通小按钮不同。真实神医页的RED为网页PageSave宽度比1、button-submit=true、胶囊；旧适配宽度比约0.079、普通背景、约0.6em圆角。源因为renderCommands丢失网页btnSave/block及主要动作类，之前组件数量/几何矩阵没有覆盖按钮主次，不能把差异仅归为主题。
- 依据当前网页普通页面DOM与公共Wizard模板映射：PageSave全宽胶囊、enabled时主色；DialogOk主要确认，WizardNext/Finish/Back/辅助步骤中性胶囊；DialogCancel/WizardCancel移到标题栏图标，保留原data-data1、命令、enabled、可访问名称及form验证，不换业务接口。禁用主要操作不保留button-submit。确认区仍位于滚动内容之外，长内容和命令区可达。
- 传统按钮核对另发现Backup主页及Restore/Extract模板保留旧小圆角。受控loader只给实际传统插件stage增加ete-plugin-legacy-page标记，已有维护关闭控件只给所属dialog增加标记；维护CSS限定这些区域的raised圆角，不改变普通设置或全局主题。viewmanager固定输出哈希为6C6A7315C74984F96171149AA2993ED9B276B9E92CBFFC6E1F78DBB8955513E6，冻结base/epoch/signal与owner校验保持。
- 工作按钮矩阵覆盖神医6页、Madby8页的正常/800px/125%，84次；传统7页及2个模板18次；30字段Dialog/WizardNext/WizardFinish的小窗/全屏12次合成对照。主操作宽度比、主色标记/计算颜色、圆角、禁用、普通操作/路径图标、标题栏取消与末字段/按钮可达均分别记录，真实UI/Command及非读取HTTP为0，不点击保存、确认或配置动作。此前响应式504次及873全套结果保持原来源，本次不冒充新源码的全套结果。
- 定向98/98、隐藏104项与语法/diff校验通过；新增保存启用/禁用角色转换、模态主次及取消归属测试、真实隐藏全宽/胶囊几何断言。只读按钮合同审计由GPT-6 Luna High执行，主线程负责接口/模板归属和交付审核；Task Tier 2，Playback/Session Impact NONE。后续严格source-bound构建与产物复验、重复入口验证另记私有回执。

## 2026-10-14 验收入口早期诊断日志合同修正

- 用户再次报告e248b59打不开。只读完整集合比对显示唯一extra为app/x64/electron/debug.log；缺失及哈希变化均0，原日志路径环境绑定仍存在。上次路由修复未覆盖早期诊断日志，不能将一次启动检查通过当成长期入口可用证据。
- 仅私有verify-bundle脚本将这一条已知非代码运行输出从静态集合比较中分离，要求实际为普通文件且路径祖先没有链接，manifest不得将其列为payload；不忽略其他日志/文件，不修改或删掉现场日志，所有2156个静态bundle条目及产品来源仍完整验证。脚本原哈希与manifest备份后精确修改，仅其harness哈希/size重绑定，product sourceCommit保持e248b59。
- 独立虚拟文件系统边界验证4项通过：真实已知日志不阻塞，额外程序文件拒绝、程序字节变化拒绝、日志链接拒绝；既有登录种子及产品字节不改。连续3次启动前检查通过，重复隐藏完整产品bootstrap证据以本轮私有回执固定；机器前台动作NONE，不记录用户已实际成功打开。
- Task Risk/Uncertainty为Tier 1，Playback/Session Impact NONE，主线程沿用现有配置处理这个局部入口修复。没有放宽业务命令、修改真实profile、修改构建来源、推送、发布或安装。

## 2026-10-14 响应式与长内容集中收口

- 用户反馈小窗下页签遮挡说明。真实同尺寸RED为网页首段在131px、旧适配在87px且与页签相交；维护端遗漏原生withTabs类，低于120em时仍用6em而非9em顶部占位。只同步实际导航组的所属view标记及清理，不添加固定像素补偿；保留安全筛选后仍有单个可用页签的既有行为。
- 长表单另确认缺陷：旧Dialog在30个字段时没有可滚动容器，末字段和命令按钮都不可达。维护模板增加独立内容滚动区与固定布局命令区，保留form、验证、ID、canonical object和事件归属；CSS限定维护对话框。公开网页模板与完整合成字段描述符作结构对照，普通/全屏、窄窗125%情况下字段及命令均可访问；没有运行真实保存或对话框业务控制器。
- 传统Chapter Options在部分窄视口的表格向页面外溢出约30–72px；表格组件内部承接固有宽度，保留字段和表格原始内容，整页不再横向溢出。仅传统插件加载前增加已维护CSS依赖；viewmanager输出固定哈希更新为531DA7726914BD3555BC0EC39B834BFCF1A4F4AB6C1F0AE29D000DA1A14305DA，冻结base哈希及epoch/signal/owner门禁保持。
- 当前神医6页、Madby8页、Backup/Chapter四页/Episode Refresh/TheIntroDB合计7个传统页面，按639/640/799/800/1055/1056/1919/1920/1921/2560窗口宽度和1280窗口125%/150%缩放作504次工作对照。核对实际CSS viewport、首文字片段与页签相交、字段几何、整页溢出及长页面滚动；部分系统最小尺寸会取整，报告保留请求尺寸与实际viewport。传统表格的局部滚动不当作整页溢出。
- 首次扩展probe误把容纳整页的分组盒当首文字，并未复位document滚动，导致双方大量伪失败。改用文字片段矩形、真实滚动祖先复位和隐藏绘制等待后重新执行；旧失败receipt保留，不并入绿色结果。只读源码审计另指出分组说明间距、窄屏嵌套列表两项候选，当前真实页面没有对应内容，记录NOT_EXERCISED，不凭静态样式推断视觉PASS。
- 公开873/873、材料48/48、定向50/50、隐藏101项通过，真实服务UI/Command及非读取HTTP均0。主线程处理布局与加载边界；两项明确只读审计由GPT-6 Luna High完成，Task Tier 2，Playback/Session Impact NONE。正式来源绑定构建、复验及独立客户端身份另由交付回执固定，未做前台或配置业务验收。

## 2026-10-14 普通页面返回控件与错误语义

- 真实网页仪表盘没有底部PageBack按钮，只有未显示的PageSave标准页面按钮；旧适配将元数据中的内部PageBack直接渲染为按钮，点击进入命令接口后被私有验收入口拦截，再显示通用加载失败。用户明确要求改成网页行为。
- 普通Page/RegularPage不再渲染PageBack底部按钮；Dialog/Wizard仍保留对应返回控件，无Caption时使用原Back本地化。页面读取与动作失败分别显示静态提示，后者有中文/默认英文，不含服务器响应详情。键盘PageBack协议的Data=null、ItemId=null保持；更新合成模态按钮测试继续验证该协议，增加普通页面不显示内部按钮的回归。
- 工作实验真实对照均为0个底部PageBack；点击实际顶栏返回箭头成功进入设置页、没有pluginError，UI/Command及非读取HTTP均0。曾研究只允许PageBack的私有守卫，但顶栏返回无需该接口，守卫及测试保存在私有研究目录而未进入产品或交付，原验收限制保持。
- 产品定向29/29、隐藏合成100项和语法通过。Task Risk/Uncertainty为Tier 1，Playback/Session Impact为NONE；明确私有守卫研究由GPT-6 Luna High执行，主线程核对固定Electron上传数据并作最终范围决策；无需改变共享导航、认证、窗口或播放链。来源绑定构建与新独立入口由私有交付回执固定，前台待确认。

## 2026-10-14 仪表盘刷新导航与离页标题

- 首次真实仪表盘协议含6项TabPageInfos；只读WebSocket观察复现5次同PageId/ViewId、IsPageChangeInfo=false且TabPageInfos为空的更新，旧适配顶部持续为0。网页组件对应分支只刷新内容，不清导航；没有执行业务命令，完成的非读取HTTP为0。
- 同一页面的增量通知在缺失/空导航时继承现有普通页面导航，不修改传入通知，不影响有内容的页签更新、Dialog/Wizard或显式页面切换清空。工作实验4次真实更新后导航始终6项。离页只在active且无其他页签owner时清理标题，重复pause不清新标题；迟到响应及新owner保护测试保持。
- 网页/候选对照确认Chapter API自带4个英文页签和传统原生表单，结构差异来自插件模板；ETE从Madby进入该页留下“运行状态”是另一个适配缺陷，已在当前离页清理中修正。保留传统插件布局及宿主主题，不强制改写插件HTML。
- 定向28/28、隐藏真实AMD合成100项及语法通过；Task Risk/Uncertainty为Tier 2，Playback/Session Impact为NONE，主线程沿用当前模型处理导航更新与owner边界，无架构或共享模块修改。正式来源绑定后台复验与独立客户端交付以私有回执固定，前台仍待用户确认。

## 2026-10-14 私有验收入口日志隔离修复

- 新入口启动失败已在同一私有客户端复现：完整集合比对仅多出runtime下debug.log，manifest规定的文件均存在且哈希匹配。用户启动记录为child-exit-failure，不能把此前隐藏启动及dry-run通过视作实际前台启动通过。
- 保留完整校验合同和product sourceCommit=25bef64，只为私有Start/Verify子进程环境显式设置ELECTRON_LOG_FILE，提前创建独立logs目录。原日志移至独立诊断目录；两个脚本经原manifest哈希核对后精确修改，只有对应harness条目的大小及哈希更新，product payload保持。
- 复验bundle完整性PASS、隐藏真实产品bootstrap PASS（授权登录副本已复制、前台动作NONE）、连续两次Start dry-run PASS。额外隐藏Electron探针强制产生固定日志标记，验证日志落入独立运行目录且runtime没有新debug.log，之后bundle再次PASS。入口和桌面目标保持，前台重新打开仍待用户确认。
- Task Risk/Uncertainty为Tier 1，Playback/Session Impact为NONE；沿用主线程运行配置，无架构或产品源码变化。未重新构建产品，私有harness修复以独立哈希回执记录，不更改25bef64产物来源或复用旧机器结果冒充前台证据。

## 2026-10-14 多选弹层高度修正

- 用户反馈五项语言菜单展开高度不一致。读取当前网页组件样式并进行后台绘制的同尺寸真实DOM对照，确认网页虚拟弹层max-height为min(30em,70vh)，旧客户端按calc(98% - top)指定高度且仅有84%上限。1280×900下原五项菜单约630px、网页约395px；工作实验新增限制后约394px，差额来自主题边框。
- 仅修改维护插件CSS，以当前可见插件页与虚拟itemsContainer限定body级弹层；排除全屏模式。没有修改共享actionsheet、选择控件、选项provider、选择值、事件、路由或播放链。隐藏合成100项通过，新增有效上限、离开插件页、普通菜单及全屏菜单的实际计算尺寸边界；定向32/32通过。
- Task Risk/Uncertainty与Cross-module Scope为Tier 1，Playback/Session Impact为NONE；主线程沿用当前运行配置，局部CSS与验收任务无需架构委派。真实非读取请求及UI/Command计数均0，后台结果不代替前台验收。准确提交、源码绑定构建、不同窗口复验及独立客户端交付由本轮私有回执固定。

## 2026-10-14 选择控件垂直几何修正

- 用户反馈选择值落到控件下方与说明重叠。真实神医元数据页及隐藏合成均有RED；旧native selectedName/arrow用隐藏占位行估计标签高度，空标签及换行会失准。
- display只给选择控件父层添加专属类，插件CSS将标签、输入、说明和覆盖层分配网格行；移除覆盖层的隐藏占位，不移动节点、不改选择值/provider/事件或共享vendor CSS。
- 隐藏Electron实际DOM检查选中值、箭头在输入边界内，空标签、180px长标签及原字段/命令契约继续通过，共96项；定向40/40。真实14个控件补齐几何与说明重叠门禁，并在正常、窄窗口、125%缩放对照。
- 保留此前整套证据身份，不将旧水平溢出PASS称为垂直布局PASS；新源码绑定产物以交付回执为准。没有前台自动操作、业务保存、推送、发布或安装。

## 2026-10-13 三插件显示整体收口

- 按用户要求集中对照全部14个GenericUI页、Backup主页与两对话框，以及6个邻接传统页面；真实网页与候选截图、计算样式分别核对，正常、窄窗口和125%缩放均有证据。私有值、服务端原始资源及截图不进提交或共享包。
- 窄display适配复用旧字段编辑器与原开关组件；纯文本和HTML消费者分别保持边界，状态和StandardIcon不解析任意HTML。修正父子图标归属、无标题父组说明、按钮组以及live Boolean替换后的状态Map；Boolean只读/隐藏实际RED后修正，当前隐藏合成92项通过。
- Backup真实模板声明的新关闭组件通过受控AMD别名和插件preparse加载补齐；保留epoch/signal门禁，只关闭所属dialog，不触发表单提交。隐藏动画验证通过后台绘制推进，前台动作NONE。
- 主会话接管模型容量中断后的收尾。定向测试42/42、公开787/787、材料54/54通过；GPT-6 Astra High只读生产审查无明确P1/P2。GPT-6 Luna High完成纯文本/动态来源DOM审计及关闭组件的隔离补丁，主会话核对真实diff和native行为。
- 生成器仅新增close组件加载；固定vendor输入不变，审核生成字节后同步app/viewmanager输出hash，未降低dirty generator、source/runtime provenance门禁。获授权本地提交和来源绑定构建，最终准确身份及回读结果由独立产物清单提供。
- 保留客户端宿主主题、字体与冻结核心。当前用户状态仍为DISPLAY_PARITY_NOT_ACCEPTED，后台检查不替代整体验收；没有发布、部署、安装、远端写入或业务操作。

## 2026-10-13 插件设置兼容候选

- 基线为 v0.3.1 / 080d352。主目录旧 Settings 支线及其已有改动未修改，候选使用独立 managed worktree / codex/plugin-settings-compat。
- Model Tier：Tier 2；Model：主线程用户配置，独立核心审核 GPT-5.6 Sol High，明确测试任务 GPT-6 Luna High；Reason：模块兼容与页面异步生命周期，播放/认证边界冻结；Escalated：无，未重开播放架构。
- 模型选型建议更新为 GPT-6 Luna / GPT-6.1 Sol / GPT-6 Astra，分别对应明确规格执行、跨模块实现与高风险设计/最终复核；既有完成审核保留实际型号。此前 GPT-5.6 Sol High 派发依据为原项目旧 Tier 2 推荐。
- 最终准确候选另交 GPT-6.1 Sol High 做只读审核，范围为本次源码/变换及取消、字段、通知、命令边界；这是一轮独立后续审核，不改写此前审核的型号或结果。
- 真实 frozen viewmanager 的确定性 RED 复现 controller reject 叠页及取消后迟到覆盖。受控变换增加隐藏暂存、取消/代际检查和安全失败清理；独立审核补齐普通/插件混合导航、权限/controller 前置迟到与当前页面 resume 的归属检查。router 仅添加该取消检查，原权限表达式、input/API 与播放模块保持。
- 新维护模块补齐传统两个依赖与 GenericUI 页面、页签、字段、命令、通知、Dialog/Wizard 生命周期。NAS 只读资源用于协议对照；没有复制其实现、执行 DLL、保存设置或触发命令。
- 首轮公开离线测试 741/741；后续公开集合一次运行 760 项，759 通过、1 项旧 transform 断言失败，该断言已同步并在增量集合复测通过。材料层完整适用测试 82/82，最后生成器变更再验 overlay/provenance fixture；最新插件相关增量集合 70/70。按收尾指示保留原始结果，不重复已完成矩阵或合并成一次准确候选全套绿色声明。
- 隐藏 Electron 44.4.2 合成 fixture 42 项通过，真实 AMD/字段编辑器与控件、13 组传统依赖 identity 均有机器证据，配置/命令只发往 loopback。最后取消入口先拒绝已 abort signal；子菜单显示副本安全转义，命令和确认由 canonical metadata 恢复，ItemList 动作提示补齐。真实三个插件前台结果仍待验收。
- 提交前源码绑定构建曾拒绝未提交生成器，门禁保持；该阶段实验未取得正式 package/provenance 通过证据。后续本地提交及构建结果见下方交付记录。

## 2026-10-13 最终审核两项 P2 收口

- 主会话对上一封存修订完成源码/构建差异/receipt 复核及准确公开回归 761/761；该结果保留原修订身份，不作为本次增量源码的全套回归声明。
- responseHelper 失败和取消统一拒绝清理后的 typed Error，只保留静态分类及安全 status；原 response 与 alert/module 错误不向下游传播。
- 插件导航与 GenericUI router 的错误 toast 在实际 AMD 回调执行时重新校验请求归属；新增 deferred 模块测试保留 RED 42/46、修复后 GREEN 46/46。当前有效失败提示及 signal 单独取消均有断言。
- 两项修复由主线程实现，明确 toast 测试由 GPT-6 Luna High 执行；冻结核心、依赖、认证与业务接口保持。后续证据与重新封存文件以本次 P2 报告为准。
- 收口定向 56/56，受影响 overlay/provenance fixture 6/6；隐藏 Electron 45 项通过，其中新增3项直接检查浏览器中的 typed rejection、敏感字段清理及 AbortError 静默。7个受影响脚本语法/有限凭据扫描与 diff-check 通过。旧761/761保持上一封存修订身份，未重复完整公开矩阵。

## 2026-10-13 本地提交与隔离验收交付

- 用户授权精确审核的31文件本地提交及必要状态同步、构建与后台验证。实现提交 d4440ed；仅整理7个测试文件末尾多余空行，保留代码逻辑与原换行。没有推送、PR、合并、Tag、Release、部署或系统安装。
- 提交后公开离线测试 764/764、材料层测试 130/130、隐藏 Electron 合成验证45项通过，前台动作为 NONE。旧761/761继续保留此前封存修订身份。
- 固定输入与完整工具链通过校验，源码绑定构建、2144项 payload 集合和三层 provenance 校验通过；native helper 为正常构建，testing=false。状态同步后从最终提交重新构建，准确交付身份见产物清单。
- 隔离入口在 bootstrap 前绑定 appData、userData、sessionData、temp、日志、crashDumps 与 MPV_HOME，生成新 DeviceId，不复制现用 profile 或凭据。后台探针加载实际主页面并抑制显示调用；启动 dry-run 通过。
- 明确脚本任务由 GPT-6 Luna High 执行，隔离脚本最终只读审核由 GPT-6 Astra High 完成。审核发现的状态文件链接写入、根目录父层重解析边界及 Electron ASAR 物理文件校验问题已修复；环境字典保持对象返回，避免 PowerShell 枚举破坏子进程隔离环境。
- 本验收包直接运行 Electron，不能称为 Host 或安装等价验证。HTTP(S) 护栏限定默认 Chromium session，拒绝 UI/Command 与非浏览请求（登录/能力注册除外）；不证明任意插件 GET 或其它协议都无副作用。真实三个插件视觉、播放及远控结果尚未执行。

## 2026-10-13 真实插件失败复现与修正

- 268598b 的前台三插件结果为 USER_REPORTED_FAIL，静态 fallback 提示不代表修复。旧764/764及合成45项继续保留原来源及覆盖范围。
- 初始授权登录种子与最新已关闭隔离会话的选择比较为 server MATCH、user DIFFERENT；最新副本经只读 API 验证为管理员。仅使用用户授权的登录副本，复制源文件前后哈希保持，不读取其他 profile，不输出身份、URL、凭据或配置值。
- 神医和 Madby 的真实 UI/View 均HTTP200，协议类型为 RegularPage；旧 schema 拒绝该类型，形成明确RED。维护schema仅增加该普通页面枚举并保留wire value，未知类型拒绝保持。
- 真实完整产品路由在 controller-import/view-load 阶段又复现失败。维护模块的 ../../www/modules 相对引用在 Alameda 中形成 ../www/modules 第二身份，得到未初始化的共享实例。仅将三个维护模块的共享依赖改为原 modules/... 身份，自有schema/helper仍使用相对引用；未修改共享模块、认证或播放链。
- 新增最小合成协议与真实 Alameda 身份回归，保留 RegularPage RED及三模块 identity RED。旧fake/hidden registry同步canonical身份，既有行为和安全断言保持。定向35/35、新合同6/6、公共770/770、材料130/130、隐藏45项通过；语法及有限凭据模式扫描通过。
- 工作实验只覆盖四个维护模块，完整产品其余字节保持。真实后台GREEN包括神医/Madby首载表单与各两个额外页签、Backup真实HTML/controller及BackupRestore/BackupInfo HTTP200、普通设置往返；controller和DOM均有证据，每次只有一个可见当前页。实验不冒充source-bound产物；最终提交重建与产物回执另行固定准确身份。
- 本轮风险/不确定性为Tier 2，Playback/Session影响为NONE。主线程沿用用户配置；明确测试及离线检查由GPT-6 Luna High执行，最终源码只读审核为GPT-6 Astra High，本次限定diff未发现明确P1/P2。没有扩大为架构重写。
- 新私有验收入口继续使用独立appData/userData/sessionData/temp/MPV_HOME和新DeviceId，只复制自身布置的已授权登录种子，提供Open.cmd。可分享ZIP不含登录种子或机器_state。所有机器操作均为后台，真实前台结果、Host/系统安装/播放/远控及业务命令仍未执行；没有推送、PR、合并、Tag、Release、部署或NAS业务写入。

## 2026-10-13 页签真实点击与标题修正

- 用户对ceba1fd反馈三个页面能打开，记录为PAGE_OPEN_PASS / TAB_UX_NOT_ACCEPTED；不推断保存、全部页签或视觉已通过。上一轮页签矩阵使用direct router.show，仅保留读取/渲染证据。
- 隐藏完整产品的HTMLElement.click复现RED：正文6个普通anchor，真实点击1次但tabchange/router/UI/View增量均0、目标和返回未提交；应用标题保持上一页。仅取得最小网页GenericUI模块的只读合同标识，未复制实现或私人截图。
- 维护GenericUI复用原maintabsmanager/appheader/approuter的canonical实例，原生居中按钮经tabchange送入原router；正文链接移除，沿用原胶囊与focus样式，不新增全局CSS或overlay。有效普通页面Caption同步页头；header输入转义，document.title为纯文本，Dialog/Wizard保留父页标题。
- 页签元素、异步路由恢复和标题依附controller/代际；通知只重建自己的元数据，pause/destroy不清理新owner。独立审核复现原selectedTabIndex同步派发tabchange导致失败恢复再导航，局部try/finally抑制重入，mock同步派发后原“只导航一次”断言通过。
- 工作实验真实后台点击覆盖神医5个额外页签往返10次、Madby7个往返14次，总24次HTMLElement.click、24次router、24次UI/View；每步PageId、Caption/页头、选中pill、居中及一页可见匹配，离开到普通设置时旧组已清理，业务命令及非只读HTTP为0。实验与后续来源绑定复验分别记录，不能记为前台视觉PASS。
- 定向28/28、公开773/773、材料130/130、隐藏合成45项通过；JS243文件/PS28文件语法、294个tracked文本的有限凭据扫描通过。CI diff wrapper首次缺环境参数属于harness输入错误，按既有合同与有效本地base重跑PASS；工作diff-check通过。
- Task Risk/Uncertainty为Tier 2，Playback/Session影响NONE。主线程沿用用户配置，明确测试由GPT-6 Luna High执行，最终源码只读审核由GPT-6 Astra High执行，恢复重入P2已关闭。没有修改普通设置、播放、认证、窗口、依赖或产品版本。
- 本地提交与来源绑定新产物仍采用独立路径，保留ceba客户端及授权登录副本。直接Electron入口和后台结果不代表Host、安装、真实播放或新修订视觉验收；没有推送、PR、合并、Tag、Release、部署或NAS业务写入。

## 2026-10-12

- 整理 README 与 CHANGELOG，更新 v0.3.0 下载和版本导航。
- 增加用户配置与贡献指南，分离历史内部迭代资料；原件已在仓库外逐文件校验归档。
- 保留版权、第三方通知、固定输入清单、必要技术合同和许可风险事实。Git 历史及既有发行附件保持。
- 验证结果由该文档 PR 的检查记录提供。真实播放、系统安装和完整发行重建不属于此次文档整理的验证范围。
- Release 正文及过时标题整理后，已回读确认附件和 Tag 保持；文档 PR #32 已以 Merge Commit 合并，main CI 通过。

## CD2 新资源整合与 v0.3.1

- PR #33 合入 PR #32 的真实 main，产品与已审核的 2b146ad / 4e183e9 保持；文档冲突沿用精简公开状态。
- 复核 Proto、取消、预算、单次重查、回退及 UA/header 边界；准确候选提交接受完整公开 CI 与独立复核。
- 增加首次冷资源、二次命中、Stop/Next、播放画面及 Session 的隔离验收步骤。六项真实 CD2 验收为 USER_REPORTED_PASS，工程测试与用户反馈保持各自证据边界。
- PR #32、#33 已合并，对应 main 公开 CI 成功。v0.3.1 同步产品版本、下载导航、更新说明和已知限制；运行公开离线测试、语法及凭据检查，结果以发布准备 PR 的 CI 为准。
- 正式产物从最终 main 使用原固定输入及工具链单独构建；发布身份与回读证据保存在 Release 附件及本地审计记录中。
# 固定Web输入整理

增加独立Web材料清单、显式一次性导入与严格树校验；生产组装、Web overlay及来源记录切换到独立组件，保留现有变换和输出身份，移除旧www的必需物理读取。原材料与Model不变，材料正文不入Git；增加无旧www及输入完整性回归。验证范围和未完成项按本次交付结果记录，详见WEB_SNAPSHOT_INPUT.md。
## 固定Host输入整理

增加官方Windows 3.0.20归档与14文件白名单，按原字节准备、组装并验证runtime身份；旧目录对应文件退出物理门禁。保留Model及其它材料与既有版本，不运行归档安装器/辅助程序。新增组件完整性、无旧Host输入、来源与runtime篡改回归，详见WINDOWS_HOST_INPUT.md。


2026-10-21: isolated small-input stage adds exact four-path import/validation/provenance and explicit preparation, removes four old physical gates, and preserves original materials. Includes configuration, language, notice and zero-byte CEC marker without executing or applying them. Tests cover missing legacy files, cold restore, configuration tamper, links and unchanged Model. See [contract](SMALL_RUNTIME_INPUT.md).


2026-10-21: added original-byte Model component and runtime provenance, removed the final normal legacy physical input and old-installer bootstrap, and added independent Web restoration. Strict component checks remain; historical oracle tests are explicit. Original materials preserved. Validation covers missing entire old directories, snapshot tamper/links, cold restoration and unchanged payload/generators. See [contract](MODEL_COMPATIBILITY_INPUT.md).


2026-10-21 local integration: the independent-component material work is combined with main e150981d (product 0.3.15), retaining the published exit fix and its regressions. Normal old Carnival/patch requirements are zero; original Model/config/UI/dependency identities are preserved. Prior material-stage baseline and release entries below remain historical records. Current full regression, matching-0.3.15 material comparison and any build/package results are separate evidence; no app launch, new release, push or remote-main merge is included.

## 2026-10-21 - Pinned libmpv recovery and repository snapshots

Current libmpv is recovered from the fixed SourceForge asset using standard HTTPS redirects, exact archive magic/size/SHA256 and exact extracted DLL identity. Work cold recovery with no old package or snapshot DLL succeeded; Linux/cloud execution is not yet verified. DLL/version/API/Model/UI bytes are unchanged. Four required snapshot roots are now selected for user-authorized same-repository storage (775 files, 51,953,202 bytes) with byte-preserving Git attributes; libmpv and generated/cache/toolchain inputs stay ignored. Third-party source uncertainties remain explicitly recorded. No main merge or release is authorized by this change.

## 2026-10-21 - Public CI path and snapshot-format regression

GitHub Windows public CI exposed one preload fixture using a nonphysical TEMP alias. The fixture now canonicalizes its root, with a junction regression proving redirected product callers remain rejected; production validators are unchanged. Snapshot bytes must remain exact, including existing CRLF/trailing formatting: narrow per-file attributes describe inherited formatting, while a new CI step strictly validates all four snapshot trees against their manifests before tests/lint. Maintained source whitespace rules and all content/path/hash gates remain intact. No runtime, Model, playback or dependency-version change.


## 2026-10-23 - Runner source-built Host integration preparation

The manual Windows package route now calls `tools/ci-source-built-host.ps1` after the existing independent component recovery. It recovers the fixed official 55 source files as raw Git blobs, verifies their recorded SHA256 values, and acquires only the two pinned NuGet inputs without installation. Repository build tools materialize the current unified source kit; a new Framework/x86 process must compile and run its own matching-byte verification before a generated lock can enter assembly. Runner evidence binds the checkout, run identity, source, compiler receipt, probe receipt and EXE/PDB. External Work receipts and original-Host fallback are not substitutes.

This is local integration preparation, not a successful GitHub run. Work's exact validated builder delta has now been applied:16941 bytes, SHA256 ad98235870d72c4e5ce48227fcae6b8f01d8a0500dadc3e69cd55ae2deb926ed. It moves the search-path property into generated XML, adds compile-only references from the already pinned net462 pack, and corrects metadata enumeration initialization; business source identity is unchanged. Work reported MSB3277 separately; pure net462 runtime compatibility is not established by this transfer. `tools/Test-SourceBuiltHost.ps1` is still pending the verified portable harness handoff. Its absence stops before compilation/acceptance, so the current skeleton cannot produce a package or claim runner acceptance. Local checks cover recovery/receipt contracts and syntax only. Full README/project-document consolidation remains deferred until test-package user acceptance.
