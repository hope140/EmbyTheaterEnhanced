# 共享播放缓存：独立Windows合成验收

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
