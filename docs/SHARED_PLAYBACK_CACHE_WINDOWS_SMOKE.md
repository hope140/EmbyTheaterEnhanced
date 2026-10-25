# 共享播放缓存：独立Windows合成验收

## 当前：B timeout已确认，测量预算回读的实际剩余时间

[Windows40245606297](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40245606297)的baseline完整通过；natural已自然切B，但generation103的原load未选共享代理，固定拒绝为current-probe／timeout。resolver hit至原load约33.19ms，源事件没有该次选择的新0–0探测；预载此前的partial2,621,440B是另一条next-prefix／cache-quota记录。helper和Electron终态正常、无timeout；不把已修的退出链重新当作问题，不宣称后两阶段已过。

原代码先用clear／expand／get读取实际demuxer-max-bytes（get本身50ms界），之后才创建授权路由并发fresh1B探测，而整个选择共25ms。没有发网只证明未完成前置阶段，不能据此断言M读取就是全部根因。本轮工具只记录原M命令提交与get开始／结算、原generation／synthetic item、同钟load时刻及纯值形状布尔；原Promise身份／结果／拒绝、命令参数、期限和媒体授权均不变。观测回调失败不能改变请求，不保留属性值或原始错误；最后十二条M记录与八条选择放入安全摘要。

拒绝仅额外投影有限controller终态（TIMED_OUT／GENERATION_RETIRED等），未知错误不输出负载；clear／expand的新日志失败也不能阻止原super提交。确定性回归保留同一Promise、原同步异常／异步拒绝、观测异常和实际三个代理方法的参数／返回。原慢M回读用例明确核对选择超时之前及迟到之后均无HTTP探测、fixed current-probe／timeout；这只复现候选机制，不是Windows实际耗时证明。

下一次仍同原包和原四阶段，只更新精确工具expected SHA，由父统一派发。读取B的cacheBudgetReads与cacheSelections时间：若M未在B load前完成，再验证提前实际预读／去重；若M已完成，应继续定位cache.open前置工作。无论哪一项，fresh来源授权、1B内容校验及物理关闭保持，不能直接加25ms或接受直连当缓存成功。6ec2后台漏存修复不在该原包内，待原因明确后再统一新产品身份。

此独立观测工具最终完整离线2747项：2734通过、0失败、13项既有平台跳过，约62.1秒；最后40项定向通过、JS583／PowerShell53及有限677文件扫描通过。其后源码复核另发现Native实际NODE／INT64链可直接读M，不存在旧bridge的int32缩窄；那是单独产品候选方向，不纳入本只读工具或冒称已实测解决Windows超时。

## 当前前置：Windows测试端口快照只采一次

[公共CI40242511191](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40242511191)唯一失败在夹具temporaryRoot读取netsh排除表，原十秒调用超时；媒体未开始。总2633项中2628通过、1失败、4跳过，无cancel，不能当作B拒绝证据或权限拒绝。原helper模块缓存只在单文件进程生效；本次仅修测试／CI，保留e5ca97f的安全选择摘要和原产品树。

公共runner和打包回归入口在整批启动前各进行一次原有netsh／netstat只读采集，每命令仍十秒、有界输出；失败锁存并立即让本批失败。schema1的排除区间／去重占用端口经至多8KiB环境变量继承，不持久保存。每个文件进程严格校验字段、端口、重复值和长度，空／损坏／未知schema快照不能忽略或重新采集。非Windows不查系统命令；未使用批runner的独立调用仍在其进程内一次采集。快照不是预留或最新状态保证，实际固定guard和碰撞失败保持，无bind重试／提权／网络或系统设置变更。

独立确定性覆盖包含一次采集／跨factory继承、成功失败锁存、无效／超限拒绝、Linux路径、真实guard派生避让、runner环境传递和首次预检失败禁止启动测试子进程；59项定向通过，不是实际Windows命令结果。后台产品修复6ec2c65另存，本诊断候选不含该产品改动；仍复用原2e99包仅取得B选择拒绝标签，不作为最终缓存验收。

本地完整离线2741项：2728通过、0失败、13项既有平台跳过，约59.8秒；PowerShell53语法、有限676文件模式扫描及新增文档链接／格式通过。真实Windows批次采集、环境大小及新CI结果仍待执行；不得将模拟命令与PowerShell语法检查当作Windows系统查询成功。

## 当前：baseline完整通过，natural共享选择尚未通过

[四阶段40241705325](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40241705325)的baseline首次完整通过：真实首帧、前后seek与恢复推进、原PM同item／session／MediaSource Stop回调、helper和Electron自然退出0。natural已从真实EOF沿原PM切B，但B的load仍为原源；预载仅报告partial，保留2,359,296B，不能用源端完整响应约11MB代替成功缓存。natural正常退出1／流关闭，无timeout；reopen和cancel未运行。

本轮仅增加工具可观察性：每次原load和range-preload返回时，保存当时的current state／固定stage、reason及next state／bytes／target和磁盘占用，并将最后八项放入安全CI摘要。未知标签规范化，不输出URL、账户、token或私密路径。partial本身没有禁止新代理open的门禁；25ms准备期限、fresh授权与探测、身份／请求选项各有可能导致原源回退，未取得实际diagnostic前不归因。所有原选择、ready、零正文重取、退出及期限断言保持，不重新打包或声称四阶段通过。

静态另查到后台预载和前台共用可丢写tap：写队列满时仍接收源正文而放弃缓存，完整请求后不会补漏。这是需要独立受控红绿验证的产品问题，不能只改慢合成源掩盖，也不把partial的cache-quota标签当作实际配额已满。当前工具提交不包含产品改动，仍可按原输入复用2e99cf2包；若后续修产品，必须另有新包身份，不沿用本原包冒充。

该工具增量的24项定向检查通过；已跟踪的完整离线2734项中2721通过、0失败、13项既有平台跳过，约62.2秒；JS581／PowerShell53、有限模式与新增文档链接／格式检查通过。独立新增的背景慢盘红例不纳入本工具提交或该通过数，其失败保留给后续产品修复，不能把这批通过当作预载丢块已解决。

## 当前：Stop已完成，修正测试播放的报告语义

[四阶段40239466573](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40239466573)在baseline的server-stop确认失败；真实解码、前后seek、暂停解除后推进、Stop／destroy IPC及六个ACK均通过，helper退出0，Electron自然退出1／流关闭且无timeout。实际停止动作已完成，后三阶段未运行。

原因可由固定PM源码和同链红绿回归定位：旧rendererBoot传`fullscreen:false`，PM将其识别为`IsBackgroundPlayback=true`，reportPlayback直接跳过Start／Progress／Stop。显示窗口是否hidden是另一归属。工具夹具现使用正常`fullscreen:true`，保留强制hidden、禁止show／focus、OSD stub和service对fullscreen的surface处理；不修改产品、vendor或原包，不放宽窗口限制。

新Alameda用例通过原PM／adapter／service和synthetic helper播放A后调用原Stop，证明Start和Stop各一次，Item=A、PlaySessionId=synthetic-session-A、MediaSourceId=A-avi，且没有EOF或切B混入。相同断言切回旧Git来源的rendererBoot得到缺失正常Start的红例。Windows工具继续要求本次Stop之后的报告，并增加相同三项身份严格匹配；安全日志仅投影这些已知synthetic ID，旧／错媒体或会话不可通过。

这里的server-report证据是原PM调用**合成ApiClient报告入口**，不是实际Emby HTTP已经发送／接收的证明。既有loopback metadata／媒体请求仍按原链真实执行；不连接真实服务器或115。下一轮继续原完整四阶段、原包和40秒／120秒工作预算，父单次派发，不重复打包。

本地同断言旧boot红／新boot绿完成；相关Alameda全场景及Stop／工具检查35项通过。完整离线2733项：2720通过、0失败、13项既有平台跳过，约61.7秒；JS581／PowerShell53语法、有限模式和文档检查通过。产品／固定PM overlay／vendor字节未改；修正后的Windows四阶段尚待一次实际运行。

## 当前：将已验证的执行合同接回四阶段

[Native有限对照40234836887](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40234836887)已实际三例全通过：helper空闲、本地播放、播放加一次64×64彩色预览；renderer中的void实际跨界为null，同frame ACK21／22、24个观察、六个脚本和四次IPC完整。三个Electron和helper均自然退出0、流关闭、无signal／timeout／kill。该结果排除“helper或preview必然阻塞”的判断，仍不包含下述四阶段或真实115。

本轮只将这套完成确认和收尾接回原四阶段工具，产品、固定包与原身份门禁不变。boot／pause／unpause／Stop原表达式各执行一次，在renderer内验证void，写入递增序号并仍返回void；main记录wire类型，从同一捕获frame读取本次固定1000＋序号ACK。原动作与ACK共用一个原动作deadline，不能各拿一次完整等待；换frame、导航、退休、旧ACK、缺ACK和异常均失败。seek原返回true另严格验证。boot还需initial-play-resolved且无renderer-failure；pause／unpause仍需原native属性及推进，Stop仍需destroy IPC、真实helper exit／close和本次媒体server-stop回报，不能以ACK代替。

清理共用一次Promise并锁定失败；来源读取计入原每worker40秒／播放协调工作120秒，截止前5秒进入失败清理，不放宽期限。Native销毁失败后仍独立确认每个helper退出／流关闭，未知不显式销毁其carrier、不进入下一阶段；退出已证实但renderer后续固定17不返回也失败。store检查只在原后端关闭后进行，超时或退休的迟到open必须关闭，未校验数据不作为成功。正常路径先关闭所属helper，再确认窗口销毁、写回执和app.exit；外层仍须看到实际PID退出0／无signal／流close／无进程错误。

协调器移植同一有界收集方式，将最后2秒留在原120秒工作预算内；未知退出只写FAIL并停止后续阶段，EPERM／EACCES不反复终止。源服务仍走既有HTTP／gRPC物理收尾，gRPC原有3秒收尾界不变；不能把工作deadline描述为所有OS资源无条件在120秒硬退出。原四阶段尚未通过，旧driver本就没有严格undefined断言，故本轮不能声称已找到旧超时首因。

下一次只选Public offline CI的原四阶段路线：smoke=true、diagnostics=false、release_package=false、build_input_benchmark=false；benchmark_warm_calls保留默认3，benchmark_trials默认4且本模式不用，expected_sha绑定新工具。继续复用artifact12609342891、原ZIP SHA89b1947dc7946ec3505d4f5fb780b81df21725517d8ed46f7e37f68382396150和installer SHA1e38c2b2ed440b112e23ec838f16ca2e5debd6a88be7dc87bb42864c30c6883d；下载前仍重核有效期和来源，禁止换包身份。不重新打包、自动dispatch或访问真实媒体。

本轮完整离线2726项：2713通过、0失败、13项既有平台跳过，约61.6秒；ACK／收集器／deadline／迟到store／原四阶段门禁定向40项通过。JS580／PowerShell53语法、有限凭据模式及新增文档链接／补丁格式通过。确定性VM不代替Windows或真实helper；当前完整四阶段仍待一次实际运行。

以下为历史准备与验证记录，不能把其待执行状态替代上述最新状态。

状态：2e99cf2的完整Windows公共CI（2555通过、0失败、4跳过）、8次固定自然切集稳定性及独立打包验证（2653通过、0失败、1个Unix跳过）通过。首次Native短验在prepare参数解析失败，未启动helper；当前仅修工具／测试，不改产品或内核。不得将这些结果当作真实Native、普通可见UI或115验收。

## 来源与执行边界

`windows-contract.cjs`固定产品内容基线为`2e99cf2b861cb1f56367e5fbc79e45024c11ccec`，对应已经完成验证的独立包。相对225827a的src/native/vendor/installer/package内容无变化。工具公开入口必须显式给candidateCommit，仅允许该基线或产品树相同的当前工具HEAD；不按名称、日期或最近成功包自动选来源。CI入口固定复用此已审阅包；后续工具使用自己的精确HEAD，下载前证明基线为祖先且受保护产品树和工作区未改，包的来源及每项摘要仍绑定2e99cf2，不把旧包重标为新工具提交。

门禁逐层绑定独立提供的installer SHA、schema1安装回执、schema3物理build-manifest、完整文件集合／payload摘要／可选size、三个provenance绑定、全部维护源码Git blob及native／固定Electron身份。Electron使用original-fs核物理ASAR，不忽略文件、不改原清单。工具、fixture、rendererBoot和workflow另记录精确工具提交／文件摘要。旧225包或过期162包没有替代入口。工具自身接受Git原字节或严格等价的CRLF checkout，分别记录来源／实际文件摘要；拒绝BOM、混合换行和正文改动。

只在专用Windows runner运行：本地生成无音轨AVI A16s／B8s／C8s，固定320×180、A12fps／B/C24fps，8-bit DIB；各11,065,064B。逐帧写入文件，不在内存拼整片，无编码器或媒体下载依赖。HTTP和真实gRPC fixture只监听127.0.0.1；同一协调器维持相同origin至全部重开阶段，避免换端口导致身份变化。只有synthetic测试字符串，无真实NAS／115／账户。

worker使用候选真实BrowserWindow、原生IPC main-frame边界、Alameda／PlaybackManager／libmpv插件、source resolver、CD2 service／真实gRPC transport、authority、service、controller及helper。不会直接issue/bind伪造proof、替换helper属性／EOF，也不直接调用range-preload驱动自然切集。

为提供有界测试页面，仅候选精确index文件URL被独立Electron session映射为空harness shell；真实模块从已核验runtime读取。候选文件不改，普通main bootstrap和登录／完整用户UI不执行，因此不能把本验收称为普通安装／可见界面验收。窗口保持hidden；首帧指main进程取到真实native解码preview，seek还需真实位置与playback-restart，再取得颜色通道非黑的帧；不是屏幕可见首帧、无声卡或画质保证。

## 手动CI入口

使用已有`.github/workflows/public-ci.yml`／Public offline CI，选择本独立分支的最终工具SHA。

当前已完成九文件首错诊断；下一轮只重复shared自然切集，不需要artifact或Native：

~~~text
release_package=false
build_input_benchmark=false
shared_cache_smoke=false
shared_cache_diagnostics=true
benchmark_expected_sha=<精确40位工具SHA>
benchmark_trials=8
artifact相关三项留空
~~~

仅执行`windows-shared-cache-diagnostics`，当前调用`windows-stability.cjs`：只匹配`trusted-cd2-shared`，固定2／4／6／8次（该技术模式复用benchmark_trials，普通benchmark本身关闭）；推荐本轮8次，每次新Node进程、8s单次／80s总界。预先确定次数，不因失败重试或删除失败；任何超时、退出／流状态错误、未执行、目标没有执行、TAP或指标不符都使总结果非零。即时输出受控TAP stack，不能把诊断留在不可读artifact中。保留每次文件及总摘要，不用test-force-exit。原九文件工具`windows-diagnostics.cjs --out=新目录`仍可复现历史矩阵，各文件25s／总150s；当前手动workflow不会再重复那九文件。

成功也输出B从原command到load选择的耗时、新鲜1B探测物理关闭耗时、真实store.open耗时；保留25ms原软期限，不据结果放宽。此值不是首帧或seek性能。合成生命周期夹具明确在产品select完成后，等待实际A key再发原有一次8B读取，实际确认A8B留存才允许合成时钟到70%；不新增下载／put／授权，48B共存、代理选择和实际自然next断言不变。独立pending-recovery用例仍证明真实冷网络不必等待索引，不能把这一生命周期前提冒称冷首帧证明。

前次[Windows CI 40209021958](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40209021958)最终40分钟取消；完整日志只有16个失败名，末条16:05:07，没有AssertionError／stack，不能认定首因是EACCES、路径或25ms期限。规范化目录和端口预检是补齐已知测试前提，不是已经得到Windows修复证据。新诊断先取得真实断言；公共runner也切TAP，保留原测试集合、非零结果及六项材料排除不变。

Windows诊断和该SHA的push CI均通过后，再只运行一次普通测试包：

~~~text
release_package=false
build_input_benchmark=false
shared_cache_smoke=false
shared_cache_diagnostics=false
其余输入留默认
~~~

拿到上述固定2e99cf2成功manual package的artifact ID、ZIP SHA256及installer SHA256后，选择已经验证的最新工具ref，用正常UI单次选择：

~~~text
release_package=false
build_input_benchmark=false
shared_cache_smoke=true
shared_cache_diagnostics=false
benchmark_expected_sha=<精确40位工具SHA；该模式必填>
shared_cache_artifact_id=<上述准确artifact ID>
shared_cache_zip_sha256=<已核验ZIP SHA256>
shared_cache_installer_sha256=<已核验installer SHA256>
~~~

此模式只执行`windows-shared-cache-smoke`，不进入打包／benchmark，不重编内核或全量安装包。独立并发组、原组不变；仅job级contents/read和actions/read，无写权限／新secret。固定Node24.18.1，依赖按锁文件安装且不执行scripts；仅为静态解包复用仓库已锁定innounp及原来源／SHA，不安装或执行installer，不准备整套编译工具链。任何下载拒绝／artifact过期都失败并保留来源，不改用其他包、镜像或路径；需要父协调新的明确来源。

GitHub token只给api.github.com，artifact302用另一个无认证客户端下载；进入工具／native前移除GH_TOKEN。ZIP有准确SHA、大小、路径、条数及解压体积边界。候选完整性通过后才生成新owned profile，逐段验证全部子目录、owner和runtime不重叠，启动前及每个worker再次校验，拒绝junction／symlink。APPDATA、LOCALAPPDATA、MPV_HOME、TEMP、session／logs／crash均隔离。未创建或复制普通profile。

总native协调deadline120s，每个worker最多40s，超时不放宽；只退出已记录所属Electron／helper。父进程终止不自动算helper已退出，缺回执必须标UNCERTAIN。HTTP响应、socket、gRPC关闭也要有回执，真正close失败不能吞掉当PASS。

## 四阶段判据

1. baseline：同一候选／同一合成CD2链，关闭共享开关。取得A解码帧、向前8s／回2s的seek及停止时间。
2. natural：测试开关启用，M使用既有300MiB值，P沿产品300十进制MB，触发70%。A必须选中shared代理；真实进度经renderer发现队列B，B预载ready；A自然EOF经原manager next切B、B也必须选shared且解码。B开始后的源请求只许独立1B probe，不能重复暖正文。
3. reopen：新Electron／新helper、同owned profile和相同源origin。先有保留的实际B且next=0；重新授权探测后解码B，整个阶段B源请求只许0–0探测，正文回源即失败。仅“文件存在／代理已选中／播放成功”均不够。
4. cancel：另一实际A开始后才清旧B；真实70%预载B到受控1B后挂起。走原manager Stop／destroy，必须找到同一B requestId的held→实际response close→晚发尝试0记录，无旧native事件。没有真实held请求不能空跑通过。

停止后读回已关闭store，next／pending／reader／reserved均须0；自然／重开阶段实际缓存须仍存在。每个真实helper需handshake、exit0和child close，Electron也需exit／流关闭。M＋P、源版本／账户／崩溃恢复大矩阵沿前轮独立证据；小AVI全小于P并非真实长影片预热全覆盖。

安全结果输出到CI日志`SHARED_CACHE_WINDOWS`，只上传candidate-source、coordinator及各phase／stage JSON。plan、source URL、profile路径、fixture媒体、token、原始stderr不上传；loader错误仅保留固定标签和系统数字码。报告保留1天。

一次A/B是接线／故障探针，报告原始毫秒值；不以单次噪声或绿色workflow宣布性能无退步。正式性能门禁仍需成组首帧／seek／卡顿样本与Windows实际条件，真实115请求保持0。

## 已解包环境直接执行

先核工具SHA、候选独立来源及摘要，再用固定Node24.18.1／PowerShell7：

~~~powershell
./tools/shared-playback-cache/windows-run.ps1 -RuntimeRoot "$RuntimeRoot" -Installer "$Installer" -InstallerSha256 "$InstallerSha256" -ProductCommit "$ReviewedPackageSHA" -OutputRoot "$FreshOwnedOutput"
~~~

Output必须是新目录。该命令不安装，不访问真实服务器，不替用户准备真实账号；不能在Work前台执行。本轮没有运行以上Windows命令，也没有自行dispatch。

2db8000交付时Linux串行完整回归2656项：2643通过、0失败、13项既有平台跳过；当时JS563／PowerShell53语法通过。一次本地回归发现坏块剔除用例与成功源回填并发的测试假设冲突，现明确跳过该用例的回填写，只测坏块拒绝／剔除，正文SHA与坏数据命中0B断言保持；不作为Windows首因。Windows平台的新诊断及真实helper短验均尚待父用普通UI单次运行，不能据此宣称Windows回归已修好。

后续无包诊断run40213682632（2db8000）实际132项131通过、1失败、0skip，无timeout且流关闭；8文件通过，唯一shared自然切集在B已预载后回原source。未取得该选路的具体reason；追加的测试观测只输出媒体字母、规范化diagnostic、探测关闭与真实索引open起止，不改期限或成功断言。该Windows结果仍不是全仓／Native通过。


最新完整push run40214559293／job121232783515（4898b07）自然失败：2555项2501通过、50失败、4跳过、无cancel。主要失败来自app-trial夹具在进入断言前的physical→createProfile拒绝；同run的TEMP探针明确rawMkdtemp resolvedEqualsNative=false／hasShortNameSegment=true，而physicalMkdtemp两项为true／false。现仅将该夹具改用既有canonical helper，产品拒绝alias／link的校验不变。另外shared B该次已用代理、索引open约4.52ms，失败的是A8B＋B40B共存采样；冷后台恢复可合法跳过首次可选tap，现明确上述生命周期夹具前提，未降低48B要求。先前B回原source的根因仍未知，不能用单次成功说已解决。

本地最终预检：有界8次shared单例全通过，B选择p50=3.78ms／最大4.20ms，probe p50=1.61ms／最大1.73ms，store.open p50=1.48ms／最大1.61ms；同一Linux机器、loopback、新临时根／新Node进程、OS缓存未清，原始回执在仓库外。这不是Windows稳定性或任意影片保证。相关应用／profile／adapter定向95项、工具／workflow定向26项通过；Windows有界8次仍等待父单次手动调度。本任务未重跑旧40分钟失败run、未自行dispatch或打包。

本次稳定性工具及夹具修正后的Linux完整回归2660项：2647通过、0失败、13既有平台跳过，约122.6s。该结果不覆盖新的Windows完整回归或8次稳定性；当前仍不可排包。


## prepare参数修正与原包复用

首次Native调用在进入候选复核／profile生成之前报invalid-argument：prepare白名单包含installer-sha256，但参数名正则只允许字母和连字符，拒绝了数字256。现允许参数名中的数字，仍逐项严格白名单、拒绝未知／重复／空值；增加与真实PowerShell调用逐项比对的完整prepare命令回归，包含Windows空格路径。修前确定失败，修后通过；不引入原生fallback或放松任何profile／物理文件校验。Windows实际prepare与四阶段Native仍需新的短验，不能以Node解析通过代替。

CI的benchmark_expected_sha始终填新的精确工具SHA；三个artifact参数继续填2e99cf2原包的ID和独立核验摘要。工具通过固定PRODUCT_COMMIT取得包身份，提前检查受保护产品树未变；工具来源与包来源分别记录。原安装器、manifest、payload、provenance和native字节均不修改，无需再完整打包。

本次本地完整离线回归2662项：2649通过、0失败、13项既有平台跳过，约125.8s；JS565／PowerShell53语法、有限凭据模式扫描及文档链接通过。完整prepare参数修前失败、修后通过，另实际执行原PowerShell调用行完成Node argv往返。以上不是新的Windows Native通过证据。


## 首帧后超时的诊断合同

后续真实Windows尝试已通过准备门禁，并取得隐藏HWND的实际解码首帧，随后baseline被外层终止；没有最终worker回执，helper退出保持UNCERTAIN。只有A源响应全部关闭、gRPC退出，不能据此说helper正常关闭或Native验收通过；其余三阶段未运行。该次证据不能确定首帧后哪项await卡住。

工具修正一处已证实的截止时间错位：原worker在同步完整性复核后才启动39秒watchdog，可能晚于从spawn起算的40秒协调器。现由协调器传入同一个绝对截止时间，worker扣除启动及复核耗时；不延长40秒／120秒边界。renderer执行及predicate本身有界，给所属helper清理预留时间；前后seek分别记录pause命令／属性、模块及seek派发、位置、restart、帧、unpause和退出阶段。watchdog兜底只写FAIL及实际helper状态，未确认时仍UNCERTAIN，不把进程终止或源端归零当成功。若发生晚到renderer求值，原service退役和IPC移除仍隔离旧命令；没有新增Native或产品fallback。

定向测试包含真实worker源码的受控VM时钟、12秒复核后剩余27秒watchdog、永不完成的求值拒绝并进入caller finally、迟到结果不改判定。它们不代替Windows实际seek／helper退出；仍使用原2e99cf2包，下一次仅更新工具SHA。

本轮本地完整离线2667项：2654通过、0失败、13项既有平台跳过，约126.2秒；最后的VM磁盘存在性隔离修正后5项定向再通过。JS566／PowerShell53语法、有限凭据模式扫描及文档链接通过。新工具仍需Windows实际回执，不能以这些测试认定首帧后阻碍已解决。


## 受限主frame控制与恢复播放证据

6158d5e的真实baseline已通过暂停、前向seek位置／restart／解码帧，然后unpause求值超时，renderer没有对应matrix-action记录。helper退出0且streamsClosed，但Electron仍由外层终止；这两种退出事实分开处理，不能标整场通过。固定[Electron44.4.2的WebContents实现](https://github.com/electron/electron/blob/v44.4.2/lib/browser/api/web-contents.ts#L145-L163)先等待加载状态，再向renderer求值；这证明存在该等待层，尚未证明它是该次根因。

仅工具改用[固定版本WebFrameMain公开API](https://github.com/electron/electron/blob/v44.4.2/docs/api/web-frame-main.md#frameexecutejavascriptcode-usergesture)，对已加载的精确index主frame执行原表达式，前后校验同一frame、URL及未销毁／未detach。求值失败仍失败，不调用main Native替代操作，不更改隐藏窗口节流、产品源码、内核或超时。记录求值前loading／loadingMainFrame等布尔状态，拒绝退休frame。

恢复播放须经原renderer→PlaybackManager→现有client／IPC→真实helper；求值返回本身不算成功。新增实际pause=false确认，随后读取原生time-pos作为新基线，再用同generation的新鲜原生读回证明继续前进，不使用排队的seek旧事件充数。清理细分主窗口销毁、其他窗口销毁、protocol移除、回执写入与app.exit请求；回执注明正常cleanup或watchdog来源，安全CI摘要直接含受控状态和seek事实。Electron仍须真正退出，外层超时不能通过。主frame单元不等于Windows实际控制已成功，下一次仍复用原包短验。

本轮本地完整离线2672项：2659通过、0失败、13项既有平台跳过，约127.2秒。主frame／截止时间／现有工具定向22项通过；JS567、PowerShell53语法、有限凭据模式扫描及文档链接通过。独立审查确认未弱化来源／frame边界，实际Windows恢复播放及Electron退出仍待新短验。


## Stop与隐藏页面调度的单变量短验

45bab22真实baseline的前后seek及pause=false后的新鲜时间推进均通过，随后Stop超时；正常cleanup回执、helper退出0和流关闭均有证据，Electron则仍被外层终止。没有matrix-action stop不能判断Stop未执行：旧prefixStop根本没有该记录。现只在原renderer函数的manager.stop、player.destroy前后及主进程destroy IPC进入／完成处记录固定阶段，不改变调用顺序或原promise等待。

下一轮保持同一frame API和40秒／120秒边界，仅对隐藏测试主页面设置backgroundThrottling=false并实际读回确认，用前台脚本调度语义执行受控播放；不显示／聚焦窗口，不改产品配置或Native。固定[Electron背景节流说明](https://www.electronjs.org/docs/latest/api/web-contents#contentssetbackgroundthrottlingallowed)解释这一试验变量；它是否为该次根因仍需真实短验，不能预称产品修复。

Stop成功还须本次主进程destroy IPC的成功回执、当前媒体在本次Stop之后发出的原server stop报告，并确认真实helper退出0及streamsClosed；事件异步送达，因此显式有界等待，不借旧自然EOF报告通过。app quit仅增加观测阶段，最终仍以协调器收到Electron exit与流关闭为准，不能以helper退出、回执写入、app.exit请求或quit事件代替。原2e99cf2包、来源清单、身份和范围缓存逻辑均不变。

本轮本地完整离线2674项：2661通过、0失败、13项既有平台跳过，约126.1秒；Stop分段2项及原工具22项定向通过，JS568／PowerShell53语法、有限凭据模式扫描及文档链接通过。独立审查未发现来源／Stop证据门禁弱化。以上仍不是新Windows短验通过或背景节流根因证明。


当前转入[系统性存活审查](SHARED_PLAYBACK_CACHE_LIVENESS.md)：不再以零散求值入口／节流修改后重跑四阶段作为根因验证。新增批量Git全量校验、进程PID绑定、分层求值及退出证据仍需Windows最小复现；未宣布Native通过。
