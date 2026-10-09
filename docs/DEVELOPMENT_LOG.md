# 开发日志

## 2026-10-09 — v0.2.6 原产物公开测试发布

- Model Tier: Tier 1 publication tooling/evidence worker，主线程负责准确身份与远端副作用边界；Model: 当前Codex主线程 / GPT-6 Luna High只读worker；Reason: 固定产物发布、Git与证据核验，不涉及新增产品实现；Escalated: no。
- 用户明确授权发布GitHub。从干净53b488f建立独立 `codex/release-v0.2.6-test-20261009`；独立复核三个资产、证据及新增tracked文本隐私边界。提交身份与已公开v0.2.5一致；没有重写产品历史或重建安装器。
- annotated v0.2.6精确指向355f4e6，发布分支/tag原子推送；Release407934479先draft上传并核对三个digest，再以prerelease=true/latest=false发布，target_commitish绑定准确SHA。
- 完整175621807-byte EXE和两个companion从公开URL重新下载，全部hash匹配。保留原7个Release/12个附件/33项refs，main46e995e及Latest v0.2.2保持。具体sha、时间、资产ID和分层见 [发布记录](RELEASE_026.md) 与 [机器证据](evidence/release-v0.2.6-20261009.json)。
- 发布分支README/状态同步新入口；产品tag不随文档HEAD移动。实际系统安装/升级/卸载、真实Emby/CD2/远控、可见首帧及HDR/多屏仍未新增验收，早期直接app.exit UNKNOWN保留。

## 2026-10-09 — 0.2.6 最终包验证与交付

- 最终产品提交355f4e6，独立Tier2核心审查无P1/P2；full suite631/631，0fail/cancelled/skipped。service聚焦35/35，关闭工具36/36；前后失败与多实例拒绝测试日志保留。
- 从该提交正式build完整runtime，固定GCC/Electron44.4.2/native/dependency/build-input及版本门禁通过。相对68eb024共11文件变化，其中产品仅native-helper/service.js；全部23个EXE/DLL同hash。
- 最终8组串行执行均PASS：idle7552ms、playing8189ms、stopped8054ms、miss400 10323ms、hit0 12699ms、hit400 13416ms、hit800 16328ms、direct400 14403ms。每轮自然exit0、无outer/native强杀、残留0；存在native实例时按clientId逐一核对will-quit前完成。5组完整pipeline各5对Session，保留Next/generation/精确取消/UA隔离，工具hash和product source分开绑定。
- 完整Inno安装器175621807 bytes、PE0.2.6、SHA256 bc878b4e929016071b8d7a41f9b281ad3118e62e8a1e469b0a5c9858718b1532；innounp完整性通过，2136/2136解包文件同hash，post-package VerifyOnly通过。交付7文件独占创建并读回hash，未夹带profile/log/fixture/凭据。
- 最终目录dist/delivery-0.2.6-355f4e6；产品进程残留0。文档提交只记录结果，不替换355f4e6产物身份。原8700039直接退出FAIL、7b3a2dc正常关闭FAIL、ac865c4工具时序假设偏差以及后续PASS均保留；app.exit根因UNKNOWN。系统安装/实服/远控/可见呈现/HDR/多屏未执行，远端无写入。

## 2026-10-09 — 0.2.6 本地包与正常关闭验收

- ac865c4完整8组通过后，按父会话独立review补齐A/B多pending拒绝边界：current+snapshot同一次allSettled，全部结束后按current优先/快照顺序传播原Error，原surface短路不变。精确35例before34 PASS/1 FAIL、after35/35。Stop-before-close verifier假设偏差另记原FAIL，按clientId配对接受已经完成的stopped实例；最终工具专项36/36，原pipeline/generation/Session门槛不动。

- 7b3a2dc重建后idle通过，playing仍native-actual-exit FAIL；新增单次caller白名单观测确认为destroy-client，未保留raw stack。定位renderer endpoint清空client后旧kill仍pending，完整service destroy必须join。新增pending集合和同步snapshot，只作用于destroyClient等待归属，不更改onTerminal/controller/协议。最终同一33例通过Git blob preload对照7b3a2dc为31 PASS/2 FAIL，当前33/33；原fixture已settled rejection与pending contract偏差的32/33日志保留并说明。最终仍从新提交正式重建，不原地patch runtime。

- 初版8700039全量621/621，runtime2136文件、23个EXE/DLL与68eb024一致；installer175618895 bytes/SHA256 48c178ee901d1d83c32bb0c5718754601912ae2fd63400a3c8029157cd8072de。最终直接退出miss400 PASS，hit0播放断言PASS但outer120s退出FAIL；证据原样保留，余组按计划停止。线程快照在deadline后为OWNER_UNAVAILABLE，不猜根因。
- 强化正常关闭idle PASS；playing自然exit0/残留0但native completion缺失，定位service destroyed提前返回，before-quit未等closed首次清理。产品仅service.js缓存完整destroy Promise。独立GPT-5.6 Sol High复核未发现P1/P2；同一31例修改前28 PASS/3 FAIL、修改后31/31，完整pipeline正常关闭工具专项34/34。worker最初提出的失败后surface cleanup已纠正为原错误短路，精确前后日志另存。
- 后续从新提交重建唯一runtime/installer。固定三场景正常关闭及miss400/hit0/hit400/hit800/direct400完整pipeline，后者经window.close收尾，原pipelinePassed、Next/generation/精确取消、五对Session门槛保持。原app.exit失败仍UNKNOWN，不额外重复该路径。结果绑定新product sourceCommit和实际harness hashes。

- Model Tier: Tier 2主线程 + Tier 1明确范围worker；Model: 当前主线程GPT-6系列，审计与测试worker GPT-5.6 Luna High；Reason: 正常退出与会话状态验收需主线程固定contract，worker只做资料/打包审计、工具review及测试；Escalated: no。Task Risk=medium，Task Uncertainty=medium，Cross-module Scope=harness/build/docs，Playback/Session Impact=existing product unchanged。
- 起点99cb850，新分支codex/local-package-026-20261009；本轮有明确本地提交/版本整理/正式打包授权。主目录及旧工作树/产物只读保留。
- 新增正常窗口关闭观察与独立结果核验，保持原Promise/异常和产品入口；fixture资源到will-quit清理。hidden harness在show/focus调用前阻止前台操作。68eb024上三个预检均自然exit0、清理顺序通过、残留0；各自原始目录保留。正常关闭不关闭历史app.exit UNKNOWN。
- 整合05a08e9中独立资料和通知，保留0.2.4/1a05f88证据绑定；现行状态/日志不被旧分支覆盖。版本统一0.2.6，准备从提交生成正式runtime与安装器；结果稍后独立记录。

## 2026-10-09 — Stop 收尾归属与有界退出证据

- Model Tier: Tier 2 core / Tier 1 workers；Model: 当前主线程 GPT-6 系列，输入/回归/取证测试 worker GPT-5.6 Luna High，独立核心审查 GPT-5.6 Sol High；Reason: Task Risk=high，Task Uncertainty=medium，Cross-module Scope=PlaybackManager/真实 libmpv stopped 事件边界，Playback/Session Impact=direct；Escalated: no。主线程设计与最终验收，worker 只执行固定范围任务。
- 准确基线 60acba5；本地工具提交 db2f61b，产品 sourceCommit 68eb0249f8392480154513f3df267204a0f0eb74。源码维护入口仍为 tools/patch-playbackmanager.cjs，版本 0.2.5；原主目录未提交资料和两份旧产物保留。
- 同一 captured stream 的物理 Stop 局部串行，过期 queued request 在执行前退出；一次 cleanup/report 与 current-request 分离。terminal joiner 共享完整拒绝结果，最新 Native token 仍经 prepare；nonlocal/self-managed 保留原 IIFE。审查发现的非本地生命周期越界、terminal 后重复 Stop、terminal join 吞错三项在交付前已修正。
- 最终同一份 VM 测试修改前8 PASS/8 FAIL，修改后16/16；全量608/608、0跳过。主线程补强真实 manager + transition 联合 token、物理 terminal pending Next、准确共享 Error 和全Stop拒绝后的监听恢复，独立复核绑定最终源码及测试哈希。
- 正式 build / package VerifyOnly / provenance通过，运行前后新旧runtime各2136文件与清单匹配；仅 PlaybackManager + 6份来源记录不同，23二进制一致。ignored 比较器首轮因遗漏内部 hash map 失败，修正工具后复算，失败日志保留；不是 runtime payload 失败。
- 预定六次隔离运行已全部执行。新五组完整PASS、自然exit0；旧d480eb8 hit0在app.exit返回后仍OS退出超时，精确root PID/StartTime强清理后0残留。JS exit/quit回调不能替代OS退出；原因UNKNOWN，产品退出语义未改。临时线程快照因所属根进程已收尾而UNAVAILABLE，未编造线程归因。
- 新14份harness输入六轮哈希一致；appData/userData/About/应用renderer归属/隐藏阶段检查通过，五项媒体各一对Started/Stopped，所有pending/重复/未配对指标0。真实服务、远控、首帧/连续性、HDR/多屏、安装与正常窗口关闭保持另列，见 [报告](STOP_OWNERSHIP_EXIT_EVIDENCE.md)。

## 2026-10-09 — PlaybackManager 请求与 pending 会话局部修复

- Model Tier: Tier 2 core design/review + Tier 1 bounded workers；Model: 当前主线程 GPT-6 系列，测试/harness/input worker GPT-5.6 Luna High/Max，独立核心复核 GPT-5.6 Sol High；Reason: 请求快照和 Session 报告归属涉及异步生命周期，主线程固定 contract 后委派测试与输入核对；Escalated: no。Task Risk=medium，Task Uncertainty=medium，Cross-module Scope=PlaybackManager overlay/tests/docs，Playback/Session Impact=local identity and pending report ownership。
- 从准确 af688c8 建立独立 `codex/playback-session-20261009`，主目录未提交资料保持。产品仍0.2.5，固定3ab10c9产物只读作对照；后续构建使用唯一候选名称和新的sourceCommit。
- 新harness在冻结产品的miss400对照复现旧metadata额外play、pending空身份Stopped和重复Started，正常结束且残留0。测试提交084c0c8先加完整报告配对硬门槛，产品提交d480eb8只改39行覆盖器和contract文档。独立AMD VM回归基线2/7、候选7/7，主线程复跑通过；完整593/593、0失败/跳过。首次输入缺失570/579的失败记录保留，输入补齐相关50/50通过。
- 正式候选 `ETE-0.2.5-session-fix-d480eb8-win-x64` 完整构建、来源/版本与package VerifyOnly通过；新旧2136文件各自与清单一致，仅PlaybackManager和6份来源记录改变。Sol High独立核心复核和Luna范围/隐私复核无新增明确问题。
- 五种场景播放/Session断言全PASS，每轮5对完整会话，pending/重复/未配对报告为0，诊断/About/隔离分别通过。首轮runner为4PASS/1FAIL，hit0在11.924s写入smoke成功后120s未退出，精确PID清理后0残留；原因UNKNOWN且未改退出判定。同参数仅做一次独立复验，保留失败；详见 [修复记录](PLAYBACK_REQUEST_SESSION_FIX.md) 与 [结构化证据](evidence/playback-request-session-20261009.json)。
- 独立hit0复验11.366s完整PASS，自然exit0、timedOut=false、残留0，127条诊断通过；产品/provenance/13份harness SHA与首轮一致。退出异常未复现但根因未定，首轮矩阵仍FAIL、观察项保留，不归因并行负载。后续提交只补7项VM测试与验收文档，不修改d480eb8产品或runtime。

## 2026-10-09 — runner 等待条件与失败证据收口

- Model Tier: Tier 2 analysis/review + Tier 1 bounded workers；Model: 当前主线程GPT-6系列，worker GPT-6 Luna High；Reason: 主线程核对跨PlaybackManager/renderer/main异步归属，明确contract后委派fake service、deadline、condition、runner工具与测试；独立复核负责假PASS/超时退出边界；Escalated: no。Task Risk=medium，Task Uncertainty=medium，Cross-module Scope=tools/tests/docs，Playback/Session Impact=observed, product unchanged。
- 从发布文档88c818f建立独立harness树；另取固定3ab10c9的产品根及runtime，ProductRoot四层来源门槛保持。首次仅取证的旧夹具出现PASS，短等待实际约1秒，未用该次PASS抹去发布失败。新fixture把rapid Next与Stop分别绑定main真实pending和成功cancel，并增加B已settled后C的串行case。
- 独立复核关闭夹具的迟到成功覆盖timeout、renderer检查同步异常、Seek被已有位置满足、非CD2迟到metadata未计数、C source/Stop身份不足和读流无期限等问题。Stop observer取错native ID的整合失败、零延迟触发既有1000ms Stop cooldown的失败均原样保留，修正夹具后按固定矩阵验证；产品输入规则保持。
- 首全量561/568的7项失败均为新树缺vendor材料；补齐后相关15/15，随后全量580/580，后续Stop新增3/3，均0跳过。最终矩阵4PASS/1FAIL，miss的staleMetadataIgnored=false为真实产品问题，未弱化断言或重跑取绿。
- 固定产品调用链与只读VM确认共享playOptions被第二Next原地改写，旧metadata守卫误过并再次player.play；五轮另有pending Stop空身份报告，旧成功样本同样存在。产品修复单列，未在本轮改PlaybackManager生成器。详细根因、风险边界、复现命令及原始证据哈希见 [runner记录](RUNNER_DETERMINISM.md) 和 [机器证据](evidence/runner-determinism-20261009.json)。
- 五轮appData/userData读回、About/source和合法脱敏诊断分别通过，候选残留0；13份执行文件矩阵内SHA一致，运行后runtime 2,136文件核对缺失/额外/不匹配均0。没有重建安装器、推送、合并、发布或系统安装；真实服务器、远控、首帧与HDR/多屏未验证。

## 2026-10-09 — v0.2.5 测试版构建、发布与证据收口

- Model Tier: Tier 2 release coordination / Tier 1 workers；Model: current Codex primary session / GPT-5.6 Luna High；Reason: exact source, binary, tag and publication identity review with bounded preparation, testing and read-only audit delegated；Escalated: no。
- 产品提交3ab10c94d75659c0a421b729aac3147afa680751从完整5af8443继续，只有package/lock版本、随包来源索引版本及收口文档变化。root确认src/native/tools/installer/vendor相对审核基线保持。
- 固定三个归档、Electron73文件、GCC6990文件、Inno118文件和解包器5文件；两次fresh npm与正式build，各2136文件路径/hash一致。全量535/535、writer17/17均0失败/跳过；34项输入、33+7包/1171文件与4份通知通过，审计CONSISTENT。
- 两个原始installer均175631770 bytes、SHA256 76d7766cc824bf65f585cd89f0e68841628b2063381aa85392513ed1653d0d65。A完整性、全新解包2136/2136、PE0.2.5通过；B为字节相同对照。receipt精确绑定runtime manifest、compiler与source，发布前隐私扫描通过。
- 隔离首次queue-play超时，第二次完成流程但next.selected=false/cancelCount=1；读回历史3b158f6原始失败向量一致，未放松断言。完整runner记NOT_PASS，普通/STRM控制/报告及generation/Stop断言、123条诊断、About/source/隔离与残留0分别记录。离线合成分析COMPLETE；运行后再次package VerifyOnly通过。
- 准确annotated tag v0.2.5与发布分支原子推送；创建Release 407543805，prerelease=true、latest=false，上传EXE/sha256/provenance三个资产。后续文档HEAD不替换产品sourceCommit；下载与远端核验见 [发布记录](RELEASE_025.md) 和 [结构化证据](evidence/release-v0.2.5-20261009.json)。
- 发布回读：全部asset uploaded/size/digest与本地匹配，两个companion完整下载匹配，公开首1MiB匹配；完整EXE回下载因限速/中断和最后240秒有界续传未完成（171530320/175631770 bytes），该层明确INCOMPLETE。旧6个Release、9个资产、30个远端refs保持，Latest仍v0.2.2；没有留下后台下载进程。

## 2026-10-09 — v0.2.5 测试版收口开始

- Model Tier: Tier 2 coordination / Tier 1 bounded worker; Model: current Codex primary session / GPT-5.6 Luna High; Reason: release integration and exact source-to-artifact identity, with fixed-scope read-only version audit delegated; Escalated: no model escalation requested.
- Task Risk: medium (authorized public test release); Task Uncertainty: low after live refs / Release inspection; Cross-module Scope: version metadata, build and documentation; Playback/Session Impact: none intended, existing source frozen.
- 用户当前授权版本收口、必要提交/推送、准确 tag、GitHub Pre-release 和安装包上传。独立分支从完整 5af8443 继续，v0.2.5 无冲突，Latest v0.2.2 保持。
- package / lock 三处版本升级为 0.2.5，来源索引随包版本同步。构建前先提交；新产物绑定实际 sourceCommit。验证与远端回读待后续记录，不沿用旧候选 SHA256。

## 2026-10-09 — 写入边界修正与安装器确定性

Model Tier: Tier 2 risk management；Model: 当前主线程GPT-6系列，worker GPT-6 Luna High；Reason: 复核跨文件build/provenance写入边界及容器重复性，固定规格局部修复委派后由主线程检查真实diff；Escalated: no。Playback/Session Impact=none，Cross-module Scope=tools/installer/tests/docs。

50项构建定向复跑通过。独立fixture重现旧writer跟随LICENSE硬链接改写runtime外canary且返回passed，全部在临时目录。worker修复后主线程补审原API委托及测试EEXIST误skip，最终17/17零跳过；再次独立复现为拒绝写入且外部canary保持。修复统一预检物理路径、完成标记、config原字节及全部通知，以独占创建和原子config替换保护目标。

PE初步对照排除COFF时间戳；同一runtime重复编译SHA一致，原A/B有1244文件mtime不同。固定6.7.3官方源码和只改变notimestamp的实验确认该文件时间元数据影响。工程提交14f6d28、1a05f88；最终源535/535，两个runtime和原始installer均逐字节一致，A解包2136/2136通过。没有改输入mtime或生成后的EXE。详细来源、SHA与边界见 [BUILD_REVIEW](BUILD_REVIEW.md)。

## 2026-10-09 — 构建输入绑定与依赖打包修正

Model Tier: Tier 2 integration/review，固定规格工具与测试按Tier 1拆分；Model: 当前主线程GPT-6系列，worker GPT-5.6 Sol High；Reason: 主线程负责跨build/package/provenance contract，worker完成审计边界、依赖目录、完整工具树与负向测试；Escalated: no，未改变产品架构。Task Risk=medium，Task Uncertainty=medium（外部材料来源），Cross-module Scope=build/package/provenance/tests/docs，Playback/Session Impact=none。

核实源会话用户授权后，从49f643a建立独立工作树；原主目录、P1与审计交付树均保持。分别提交审计size修复7c8270b、完整工具树锁a51831b、精确依赖生成83b75b8和提交输入/通知绑定3b158f6。限定输入有dirty/staged偏移即拒绝，无关文档允许dirty；普通产品源仍物化Git blobs。

主线程实际复核worker diff，补正保留依赖的manifest来源、canonical metadata hash、caller sourceCommit、祖先junction、独占sidecar写入以及审计schema 2/3兼容。临时npm树和失败输出保留为可核查证据。首轮全量因新工作树未生成ignored preload而有1项加载失败，使用既有generator补齐后专项5/5通过；随后全量524/524通过，最终产品提交再次全量529/529通过。实际build入口4个dirty输入全部在创建输出前拒绝。

同一3b158f6在两个新目录分别fresh npm安装与正式build；各2136文件路径/hash完全相同，helper仍与P1为同一28054c哈希。与P1差异严格为新增6份notice/provenance、删除20个long旧文件、更新4份来源manifest；产品代码和其它二进制/配置完全相同。Inno两次编译都通过完整性与解包回比，但容器原始SHA不同，未修改、过滤或归一化字节。

隐藏runtime首轮double-Next选项断言失败，报告实际依次播放B、C，其它核心与隔离检查通过；构建/测试完成后新profile复验完整PASS。保留两轮原证据，没有改播放链或弱化断言。最终111条合法日志、关联10、两类安全Renderer位置各1、raw canary缺失，6个子进程退出、残留0；原用户日志未读写，真实首帧/实服/系统安装未执行。完整结果见 [BUILD_HARDENING](BUILD_HARDENING.md)。

## 2026-10-09 — 构建输入与对应来源审计

Model Tier: Tier 2 evidence review，确定性工具/测试/清单为Tier 1；Model: 当前主线程GPT-6系列，worker GPT-6 Luna High与GPT-5.6 Sol Medium；Reason: 主线程负责来源/材料证据语义与最终diff，worker执行清单、文档核对和固定contract工具；Escalated: no，沿用主线程模型，无新增架构或法律决策。Task Risk=medium，Task Uncertainty=medium-high（外部来源材料），Cross-module Scope=tools/tests/docs与构建来源审计，Playback/Session Impact=none。

起点1abf554，独立本地分支codex/build-input-audit-20261009；原主目录未提交资料和P1交付保留。读取现有manifest及prepare/build/package/provenance链，新增导出器只观察本地材料、显式输出到新文件，缺失继续且保持INCOMPLETE。主线程review补齐链接祖先、异常版本投影、未知文件名隐藏、退役目录、文件大小写/通知命名和缺文件计数回归；最终14项加既有5项共19/19通过，Node syntax与diff通过。

P1源fb10f92四层validator通过；3归档、1009/51 vendor文件、Electron73文件、2149项payload核对通过。fresh npm ci34包，其中33个生产包1142文件匹配P1，但long路径有20个Carnival3.2.0残留；另外7个Carnival包根共29唯一文件，全node_modules1191文件。记录完整GCC闭包未锁定、Inno gate未消费toolchain manifest、元数据未全绑定sourceCommit等局限，未扩大为生产构建变更。

官方来源只读核实Electron44发布identity；libmpv所称旧Release/API/tag现不可取得，补丁声明含asset hash，但原archive/独立发布记录/完整build依赖仍缺。修正早期Git公开边界被误用作installer内容的文档，完整矩阵见 [BUILD_INPUT_AUDIT](BUILD_INPUT_AUDIT.md)。本轮只进行范围内本地提交，没有重建/启动/安装/远端写入；不宣称法律认证、公开源码完整构建或字节复现。

工具/测试独立提交`0b44a81`；文档和三份脱敏JSON观察另行提交。提交前扫描19个变更文件、29个新增/修改本地链接，敏感路径/凭据模式命中0、链接缺失0、JSON解析通过。原产品/构建链scope diff为空。

## 2026-10-09 — P2 离线计时与能力核对

Model Tier: Tier 1；Model: 当前主线程 GPT-6 系列，worker GPT-6 Luna High；Reason: 离线工具、测试和静态能力审计，产品与Playback/Session不变；Escalated: no。Task Risk=low，Task Uncertainty=bounded，Cross-module Scope=tools/tests/docs，Playback/Session Impact=none。

复核P0/P1交付后从7bee8db创建独立分支。工具基于显式指定JSONL，按sourceCommit/request/native归属分析，输入/字段/输出/统计有界。16项新增加8项既有工具回归24/24、Node语法检查通过。独立review指出空行限额、0ms量化/钳制、完整性表述、终止后迟到端点及多启动writer归属问题，均作保守处理并补回归；单文件多启动直接拒绝分析。

统计由Node解析原始ISO字符串保留毫秒。只读审计中一次PowerShell日期转换得到的0/1000ms结果已撤回，不进入交付。最终110条、8请求、5条完整core-playing链见 [P2报告](P2_TIMING_AND_CAPABILITY_REVIEW.md)。源码确认fake CD2的400ms人为延迟，不能据此判断实服瓶颈。预热涉及跨请求复用/过期/取消与媒体预读，按用户偏好结束该研究；Hydration证据条件保持。没有改产品、安装包、用户日志或远端。

## 2026-10-09 — P0/P1 基线与有限诊断

Model Tier: Tier 2 risk management；Model: 当前主线程 GPT-6 系列，worker GPT-6 Luna High；Reason: 诊断关联、IPC 与核心最终审查由主线程负责，固定规格的审计、测试、版本 gate 委派；Escalated: no，沿用当前会话模型，不新增架构升级。Task Risk=medium，Task Uncertainty=medium，Cross-module Scope=controller/service/preload/diagnostics/tools，Playback/Session Impact=observation only。

现场核验 main=46e995e、v0.2.4 产品=03a2e3b、完整文档候选=ebcb655a。从完整候选创建隔离本地分支，审查 71 文件集成差异和 shared main/libmpv/native 生命周期，统一当前文档清单。既有 Settings、切集与顶部条用户反馈保留，107ms Previous 与 rapid selected=false 证据不变。

P1 contract 先固化再实现；新增记录使用固定枚举、安全包内脚本位置、容量与频率上限和 fail-open 处理。构建输入准备和基线 430/430 PASS，初轮定向 66/66 PASS。最终证据和交付见 [P0/P1 记录](P0_P1_DELIVERY.md)。

最终产品 sourceCommit fb10f92 的全量 455/455、build/provenance/payload 与安装器 2150/2150 比对通过；后续工具专项 8/8。独立 GPT-5.6 Sol High Tier 2 核心复核找到 pendingDrops 写失败丢计数 P2，主线程修复并通过三类失败回归，复核后无未解决明确问题。

runtime 两类 ErrorEvent/PromiseRejectionEvent 经真实 preload/main/logger 路径投影到 JSONL，fake CD2 与播放 generation/Stop fixture 通过；整包 redactionPassed=true。首轮 APPDATA-only 隔离偏差造成既有日志追加合成记录，原样保留；随后显式 app.setPath 并以带版本元数据的测试 package 运行，临时 profile、About/source identity 与既有日志不变均核验。所有候选进程结束，真实服务/系统安装/远端写入未执行。

## 2026-10-09 — 删除历史候选下载页

Model Tier：Tier 1。Model：主线程与Luna入口复核。Reason：用户要求清理已由新版本替代的cc603ba候选；Playback/Session Impact：无；Escalated：no。核对Release ID406794578和4个附件后，删除该Release并保留源码tag。前后快照验证其余6个Release及附件完全保持，正式Latest仍v0.2.2。证据见 `.work/release-0.2.4-20261009/candidate-removal-verification.json`；当前下载入口继续指向v0.2.4，产品和安装包字节未变。

## 2026-10-09 08:30 UTC+8 — v0.2.4 Pre-release 发布完成

Model Tier：Tier 1。Model：主线程与 Luna 复核。Reason：整理已经用户验收的 0.2.4 本地测试包发布记录、下载入口和历史 Release 导航。Playback/Session Impact：无。Escalated：no。

GitHub `v0.2.4` Pre-release 已发布，Release ID `407374861`，sourceCommit `03a2e3b9ea7f1cf786b034b0a1882b10de79a39c`。安装包与 `.sha256` 校验文件两个资产均为 uploaded；安装包 175,597,797 bytes，API digest 和本地 SHA256 均为 `4ea589368f2db40ce09ce4e46f4fe937a2d34a240582d871a8f3f5ae627e4b64`。校验文件已下载并重算，内容中的安装包哈希与本地文件一致；EXE 本轮没有完整重新下载。Release 验证记录为 `.work/release-0.2.4-20261009/release-verification.json`。

六个既有 Release 的标题、当前版本导航和历史正文展示已更新，原始正文仍保留；11 个旧资产、历史日期、release flags 与既有 refs 均保持不变。`main` 为 `46e995e`，正式 Latest 仍为 `v0.2.2`。设置页用户验收为 `PASS`，但不扩展为真实安装或真实 Emby/CD2 等其它环境验收。完整范围见 [SETTINGS_UI_024_ACCEPTANCE](SETTINGS_UI_024_ACCEPTANCE.md)。

## 2026-10-09 — 用户确认0.2.4设置页修正可用

Model Tier：Tier 1，验收记录整理；Playback/Session Impact：无。用户在获得0.2.4 runtime测试入口后明确反馈“可以了，我测过了”，记录本轮设置页修正整体验收通过，未推断系统安装、真实CD2/HDR或其它未说明的测试。产品源03a2e3b与现有.exe/SHA保持，文档diff与源码范围检查通过；没有重跑或重复宣称新自动化PASS。

## 2026-10-09 — 0.2.4本地安装包交付

Model Tier：产品UI/构建为Tier 1；测试harness启动路由竞态经Tier 2只读源码定位后收口。Model：主线程、Luna输入/工具与Sol High事件归属复核。Reason：完整应用导航与旧fragment测试不同，必须绑定实际ViewManager事件；未改播放器/路由生产逻辑。Escalated：测试工具有，产品实现无。

35a69c6提交原三文件修正与0.2.4元数据，430/430和正式构建通过。完整页面暴露重复内容H1，03a2e3b移除三个重复标题、保留原生导航标题与说明的可访问名称；最终再次430/430通过。最终runtime源/来源验证PASS。初版probe两项菜单假设与首屏导航竞态失败均保留，最终以实际itemsContainer菜单点击+匹配的viewshow完成5次页面导航，保存/未保存离页/重载和纯本地规则检查真实IPC通过。已读取实际诊断/About/动态动作截图；当前应用主题与布局对齐，动作聚焦样式正确。

最终exe为175,597,797 bytes，SHA256 4ea589368f2db40ce09ce4e46f4fe937a2d34a240582d871a8f3f5ae627e4b64，FileVersion/ProductVersion及实际About均0.2.4。Inno test通过，解包{app}2147文件与runtime完全匹配。对旧0.2.3逐文件比较只有11个预期文件不同；未修改任何播放/全屏/native/Resolver代码或二进制。完整记录见 [SETTINGS_UI_024_ACCEPTANCE](SETTINGS_UI_024_ACCEPTANCE.md)。只执行本地提交、构建、隔离测试和打包，没有远端写入、系统安装或真实服务操作。

## 2026-10-09 — 设置页修正包执行开始

Model Tier：Tier 1（明确UI修正与构建），主线程审查与页面验收，Luna补准备输入/安装器审计及隔离导航验证工具。Escalated：no。用户接受上一轮建议，授权本地收尾和.exe测试包交付。现场确认v0.2.4标签未使用、v0.2.3仍为f7505cd测试包，远端main仍46e995e。root package/lockfile版本统一0.2.4，依赖与核心播放字节保持。现有工作树已有UI改动保留；后续源提交、构建和各层验收分别记录，不复用旧PASS冒充新版本。

## 2026-10-08 — 设置页对齐与动态Emby按钮样式

Model Tier：Tier 1。Model：主线程限定范围及UI核对，Luna做原生页只读对照和行为回归。Reason：三个设置页的布局与确定的constructor class覆盖；Task Risk：低；Cross-module Scope：共享设置CSS和STRM renderer；Playback/Session Impact：无；Escalated：no。

核对GitHub v0.2.3发布source为f7505cd，统一候选ba76ac0的对应产品字节一致。官方同层音频/视频设置沿用settingsContainer/form.auto-center，full drawer CSS会把表单margin归零；增强页外层另外margin-inline:auto造成居中。EmbyButton constructor先加emby-button并设置hasInit，STRM后续className整体赋值清掉基础类，connectedCallback不会再补回；EmbySelect可能丢constructor环境类，EmbyInput的基础类在connected后初始化，不能混称三者均未升级。

修正限定三个产品文件：外层和STRM form margin-inline=0，rule actions flex-start；element/input/select/三个rule按钮追加业务class。保留原生控件、功能选择器、显式Save及危险动作语义。行为fake按真实button/input/select不同初始化时序重现失败，修正后设置相关36/36通过。没有新调色体系、业务逻辑或播放器修改。

工具 `tools/settings-style-preview.cjs` 使用Electron offscreen、已发布包里的真实Emby构造器和CSS，禁止HTTP/WS、独立userData、45秒上限，运行后销毁测试窗口。证据 `.work/settings-style-preview-8a3a28c4ff6b4729983299d8baebf7e7/report.json` 六项检查通过：before内容x477/native x256，after三页x256；三种宽度无横向溢出；按钮instance及emby-button保留。已实际查看按钮、About、诊断和窄屏STRM截图。首轮预览漏载Material Icons字体，第二轮补齐真实字体后重跑；没有改产品图标。预览是组件/布局夹具，非完整运行验收。参考[Electron离屏渲染](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)；离屏软件栅格化仅在测试工具中使用。

当前为本地未提交修正；未改发布标签、版本字段、已安装客户端或0.2.3安装包。正式构建与完整导航验收在后续打包阶段执行。

## 2026-10-08 — 0.2.3测试版版本收口

发布完成：22:22（UTC+8）创建`v0.2.3` Pre-release，Release ID406895582，两个附件uploaded且大小/digest匹配；tag object7143e5d精确指向f7505cd。大文件上传期间保持草稿，未提前公布不完整Release。旧cc603ba页已提示改用v0.2.3，旧tag/资产不变；main和Latest均保持原正式基线。

验证完成：新版本sourceCommit `f7505cda40c7f64e31714fbbe40eaa532926c46c`，npm test430/430通过；正式runtime与installer完成，About实际IPC/页面文本和setup PE版本均0.2.3。runtime2147文件对旧候选只有预期5个元数据文件变化，解包installer的2147文件与runtime全哈希一致。安装包175,622,861 bytes，SHA256 `217f36f065fafe122f06265d703d76018bf51588409a0966fada1bd3c797f314`。后台probe没有实际截图，未运行安装器；既有可见回归作为同一产品字节的历史证据保留。

Model Tier：Tier 1。Model：当前Codex主线程与GPT-6 Luna High验证worker。Reason：已验收统一候选的版本元数据、正式重建、安装器及发布标识同步；Playback/Session Impact：none。Escalated：no。

用户指出当前功能应为0.2.3后，从完整统一候选文档HEAD建立`codex/release-v0.2.3-test-20261008`，将root package与lockfile的三个版本字段由0.2.2改为0.2.3。依赖、产品代码与安装器脚本保持不变。新runtime/installer必须绑定本次版本提交，并逐文件对照cc603ba候选；旧`test-20261008-cc603ba`保留原tag/资产，不重新指向新源码。计划发布`v0.2.3` Pre-release并保持正式Latest v0.2.2；验证与发布结果另记。

## 2026-10-08 — 恢复安装包交付方式

Model Tier：Tier 1。Model：当前Codex主线程、GPT-6 Luna High打包worker。Reason：固定sourceCommit和runtime的原有Inno打包、解包对账及附件交付；Playback/Session Impact：none。Escalated：no。

前一轮将本地runtime ZIP直接作为主要发布资产，没有沿用项目既有安装包形式。用户指出后，在独立detached `cc603ba`工作树正式准备输入、复制已验证runtime并调用原`tools/package.ps1 -OutputBaseFilename`生成测试安装包，未修改构建/安装器或产品。VerifyOnly、命名测试1/1、编译、innounp完整性与2147文件逐项核对通过，原AppId/安装目录/快捷方式保留。没有执行setup或真实安装测试。

安装包与校验文件已上传同一`test-20261008-cc603ba`，发布说明改为优先安装器，ZIP作为备用保留。安装包SHA256 `1412dc7e87e1f353c1985cec15c7c0882a4ac65a48c032700ab991500be4f6df`，GitHub asset digest/size匹配；Latest仍v0.2.2。当前证据见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

## 2026-10-08 — 统一候选GitHub预发布

Model Tier：Tier 1发布操作与证据核对。Model：当前Codex主线程、GPT-6 Luna High只读说明复核。Reason：现有包/提交/标签/验收范围均已固定，用户明确确认GitHub发布。Escalated：no。

复核远端无同名标签/候选分支，创建annotated `test-20261008-cc603ba`指向产品`cc603ba`，原子推送独立候选分支与tag；创建Pre-release，上传原ZIP与校验文件，`latest=false`。Release于20:18（UTC+8）发布，ID406794578。GitHub API回读draft/prerelease、两个asset大小和SHA256、tag peeled target与main均符合预期；正式Latest仍v0.2.2。

发布后Git HTTPS与Release CDN下载出现间歇TLS/EOF；只做有界只读诊断和每命令显式本地代理，未改系统/节点/证书验证。Git读回经显式代理成功，API标签/main/asset校验通过；独立下载校验文件仍UNAVAILABLE，未虚报下载复核成功。记录见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。本轮仅同步发布文档，未重建或改写包。

## 2026-10-08 — 统一候选恢复验收与本地ZIP

Model Tier：Tier 2共享逻辑/探针定位，Tier 1 payload与归档审计。Model：当前Codex主线程、GPT-5.6 Sol High、GPT-6 Luna High。Reason：早期Settings探针连续两轮未定位模块就绪/Promise问题，升级测试工具诊断；产品架构与源码不变。Escalated：yes（仅探针诊断）。

用户完成工作后明确允许继续；新profile补齐实际Settings controller/IPC与可见切集矩阵。探针修正限于appready gate、Alameda Promise、customized element类型断言、clone-safe返回与测试页面呈现。最终430项全量测试沿用同一cc603ba源码的已执行结果；payload在测试后再次验证。10次切换的选源/Session/颜色样本、快速停止和终止Stop通过；H.264/H.265窗口两向78/78帧、max49/52ms无异常颜色；全屏Next77帧/max43ms通过，Previous73帧/max107ms保持INCONCLUSIVE。完整结果见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

归档现有已验证runtime为本地测试ZIP，重新逐项读取2147个条目，缺失/额外/哈希不符均0；ZIP SHA256为`eb5934d3da9a891cd40f5dab94a7cd4d206bd0f4d28b0fd469cbff7a9ef19647`。未重建、改版本或变更产品；本轮文档收尾提交与runtime sourceCommit cc603ba分开。

## 2026-10-08 — 统一候选集成

首次中止时状态：本地两父merge `cc603ba`已构建，430/430全量测试、来源与2146文件payload通过；隐藏Settings controller未通过，manager矩阵因用户实体Esc停止Computer Use而中止。仅清理本任务已核验身份的进程，未继续UI，中止记录当时暂留工作树。随后用户明确授权继续，恢复结果见本页最新条目及 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

Model Tier：Tier 2 核心集成审核，Tier 1 输入准备与测试。Model：当前 Codex 主线程、GPT-5.6 Sol High 只读差异审核、GPT-6 Luna High 测试 worker。Reason：共享 main/libmpv 与窗口/播放生命周期交汇，需要确认合并保留既有 ownership。Escalated：no。Task Risk：medium；Task Uncertainty：medium；Cross-module Scope：Settings/main/libmpv/window；Playback/Session Impact：保留已验证实现，不重设接口。

从全屏文档 HEAD `6be48ed` 建立本会话独立工作树及 `codex/unified-candidate-20261008`，以普通两父本地 merge 接入 Settings `21ef9a4`。自动合并所有产品源码，手动处理三份追加型文档冲突并保留双方历史。产品差异相对 `1e86e51` 仅为 Settings 已有候选内容。测试和正式构建结果另记；未推送或发布。

## 2026-10-08 — 全屏窗口局部修复及顶部细条用户反馈

Model Tier：修复与核心复核Tier 2，测试/文档Tier 1。Model：当前主线程负责窗口决策，GPT-5.6 Sol High只读核心复核，GPT-6 Luna High执行明确的测试与输入审计。Reason：透明main窗口、renderer状态与video carrier联动；不修改播放生命周期。Escalated：no。

从 `94d216b`（产品同 `6473ecb`）建立独立分支 `codex/fullscreen-state-20261008`，原两个工作树及未提交记录保留。Computer Use在独立profile/合成媒体上复现全屏边缘缩放与renderer状态脱节。固定E44源码确认透明窗口使用先通知后setBounds的全屏路径；`isFullScreen=false`不能单独作为退出依据。窄区对照定位video carrier窗口框产生顶部灰色细条。

本地提交 `a8aa114` 限制全屏时main交互并恢复原属性、避免重复进入覆盖normal bounds、在几何失配时退出；carrier使用thickFrame/resizable/movable=false并沿用原bounds同步。核心复核发现迟到restore重新进入全屏，以及全屏最小化关闭保存display bounds两项边界，`1e86e51`已修正并补回归。延迟restore负例移除修正后仅新case失败，观察调用序列[true,false,true]，修正后[true,false]。

最终 `1e86e51` 全量412/412、窗口/service定向37/37、build/provenance、2140文件package VerifyOnly与diff检查通过。产品diff仅main.js和native-helper/service.js；native CPP、原持帧/切集、apphost canonicalization、Session/Resolver未改。`a8aa114`可见交互通过为阶段证据；最终probe在用户Esc停止Computer Use时中断，不记为完整最终交互或播放回归通过。

用户随后手动验证并反馈“现在没有那个条了”，顶部细条升级为 `HUMAN-ASSISTED VISUAL PASS / USER_REPORTED_RESOLVED`。本次跟进只更新文档，未重启桌面测试或改变产品候选。准确入口、证据目录及未完成项见 [全屏窗口修复与验收](FULLSCREEN_WINDOW_STATE.md)。

## 2026-10-08 — 还原候选6473ecb自动化交付

Model Tier：Tier 2。Model：主线程设计与集成；Sol High 原生实现与核心复核；Luna 定向测试、文档与fixture输入工具。Reason：原生持帧、retirement与异步视觉所有权跨层协作，保留已有播放链。Escalated：no。

两次正式构建取commit blobs：5ddeea8用于初次完整窗口/全屏对照，6473ecb纳入旧token Stop no-op与较新epoch撤销in-flight begin的最终修正。最终build/provenance及package VerifyOnly通过，2140文件，默认Helper SHA256为28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc。没有改vendor输入、编译器flags、Electron、mpv或依赖；GDI/DWM从System32可选加载。

最终全量401/401通过；第一次最终全量400/401仅失败于新增fixture工具的单参校验，修正null/空串区分后全量重跑通过，没有削弱产品测试。新增player生命周期覆盖准备中Stop、B→C和prepare失败；fake manager按真实patch保留sequence cancellation，未据缺失该contract的fake首轮失败改生产代码。原生七项实跑覆盖缺失媒体清帧和15秒未加载目标的fail-open，deadline15028ms，失败撤帧后fresh ROI确认为黑色停止视频。

6473ecb完整窗口codec对照81/81帧、max59/44ms、旧/新颜色之外均0；全屏66/48帧、max164/163ms，旧/新颜色之外均0但保持INCONCLUSIVE。两轮各7个owned进程退出、残留0、身份冲突0，fixture和harness运行前后哈希不变。真实媒体/全屏短闪、HDR/多显示器与顶部细条仍待独立验收。所有证据位置见 [还原记录](PLAYBACK_PRESENTATION_RESTORE.md)；本轮没有推送、PR、发布、安装或真实服务器写入。

## 2026-10-08 — Native presentation lifecycle 边界复测与生产候选状态

Model Tier：Tier 2。Model：主线程定义生命周期 contract；Sol High 实现窄范围 CPP Testing/生产支路；Luna 补定向 controller tests。Reason：自动 reveal 涉及 main/renderer/native 的 epoch、generation 与 hold 所有权，必须分别验证实验支路边界和生产 API 暴露。Escalated：no。

已授权的 retired-control 窗口 probe 两向各采 76 帧，最大间隔 53/61ms，black/purple/mixed 均为 0；真实 Stop 11ms，进程与采集资源清理完整。记录位于 `.work/native-frame-retired-auto-window-f3d65a92d92d4699966de0eb909af25e`。该结果是 Testing-only 控制准备窗口证据，不是产品呈现验收。

旧 Testing CPP `269bdcc` 的 boundary run 曾有 case 1–4 PASS、case 5 FAIL：missing-media 已 end-file，但 auto lease 仍为 armed 且旧 hold 保留 4,677,120 bytes。case 4 T HTTP 连接被 MPV 主动关闭，`lateBodyDelivered=false`，因此当轮没有实际迟到 body 对新 generation 的测试。后续 Testing CPP `a2cf6af`，正式 Testing SHA256 `de43f1301f208106fd18291bef0690c2cb20f388dd7f7d4b737c99679ca15378`，在 `.work/native-frame-boundaries-fixed-window-b997f8307ce9428ab6812c1d6c4e8376` 的六项 boundary run 均 PASS；case 5 现观察 autoState=unavailable、active=false、bytes=0；case 6 检查 production API 的响应字段仅含 `ready/status/holdId/painted`，并实测按 control generation 取消不会影响新 hold，cancel-before-delayed-prepare 不会复活 hold。未在默认 Helper 上实跑 test alias 拒绝。T HTTP 连接仍主动取消，迟到 body 行为继续标为未验证。两轮结果都保留，旧失败不被新通过覆盖成从未发生。

生产候选正在接入 native prepare/arm/release 与 fail-open 清理。Next/Previous 保持原 manager 的同步入口、request sequence 与 retire-before-await；main/renderer epoch/token/hold 所有权保护新旧 generation，旧 load 失败隔离，图像只驻留 native。Legacy `create()` DOM overlay 仅保留历史测试，`libmpv.js` 激活 native controller。Native controller contract tests `11/11 PASS`；阶段性 `npm test 395/395 PASS` 未包括之后追加的 lifecycle tests。正式 runtime `presentation-restore-5ddeea8` build/provenance 与窗口对照通过，全屏对照因采样间隔不足保持 `INCONCLUSIVE`；随后修复的 epoch/Stop 补丁尚未重建。当前源码与最终用户视觉验收仍未完成，状态 `IN PROGRESS / NOT ACCEPTED`。

## 2026-10-08 — Native 持帧实际能力取证

正式 Testing build 从 `97fb2d4` 生成并验证输入/编译器/输出来源。独立 harness 的入口/显示/采集上下文问题收口后，确认 `screenshot-raw window` 可取得当前视频红帧（1440x812，65ms），但 GDI child 的 WM_PAINT ACK 之后，真实 Stop 导致合成 ROI 持续黑色。此结果未达到原生保持画面要求，生产 Helper 不变；下一步仅补子窗口状态定位，不用 painted 回包冒充显示成功。所有实际 probe 使用合成媒体和隔离配置，失败后清理完成。

新增独立 native-frame-hold-probe harness，以真实 client.stop、严格屏幕颜色和有界显式 release 测能力，结果固定 experimental-capability-only。测试支路状态回包补父/子窗口存在、可见、尺寸和相对 sibling 顺序，未改绘制或窗口策略。默认/Testing编译通过且默认binary继续byte-identical；probe输入与response校验5/5 PASS。新增状态用于区分真实黑色的来源，尚不决定修复。

Layered测试child使窗口模式持帧/显式释放能力通过，两方向各80帧，无采样黑/紫/mixed；全屏以独立静态点确认持帧，运动阶段保持fresh stream门槛，连续流长间隔仍INCONCLUSIVE。随后实现Testing-only一次性新generation异步截图/自动撤帧候选，修正状态与UI线程的快照一致性、取消终态覆盖，并保留初始resume seek；默认编译字节仍相同。harness定向8/8 PASS；自动候选尚待实际运行，不当成已恢复产品表现。

## 2026-10-07 — Native 私有帧暂存能力 probe

Model Tier：Tier 2。Model：主线程定义 contract，Sol High 在唯一 CPP 文件实现 Testing-only 支路，Luna 准备独立 harness。Reason：只保留 carrier 的实验不足，需验证 GPU 输出停止后的内存暂存；不先改播放/Session 时序。Escalated：no。

新增 private `test-frame-hold/status/release`，严格 generation/media/holdId 归属，截图仅 native memory，独立 child 由原 surfaceThread 管理。默认与Testing按固定编译器/头文件/flags编译均通过；默认产物与现有生产Helper SHA完全相同。原stop/load/generation流程未变。尚无runtime能力结果或自动揭开契约；下一步从提交HEAD正式生成Testing helper后执行合成像素probe。

## 2026-10-07 — 呈现还原目标 / 历史基线工具

Model Tier：Tier 2。Model：当前主线程；Sol High 只读时序复核，Luna inventory / 明确测试工具实现。Task Risk：中高（后续将涉及呈现时序）；Task Uncertainty：高（旧版实际画面尚需对照）；Cross-module Scope：renderer / main surface / 测试；Playback/Session Impact：当前为 test-only，后续保持既有所有权。Escalated：no。

先核对旧 Pepper、Helper/E18、Helper/E44 runtime 与同一 mpv DLL；启动显式用户授权的隔离可见合成测试。当前候选严格红/绿前置已通过一轮，未采到黑色但保留采样间隔限制。历史比较独立于正式 E44 runtime validator，测试工具允许显式旧 runtime、区分有无 overlay、增加全屏观察以及前置像素不足时的 `OBSERVATION_BLOCKED`；没有实现图片预加载，也没有改产品显示策略。

窗口与全屏历史矩阵已取得有效画面；三套全屏 runtime 均确认 gpu-next。原 rVFC 在全屏 document.hidden 时停止提供新样本，因此测试工具改为有界帧流 reader，并减少采集分辨率、保持间隔门槛和新鲜颜色前置。runner 修正 PS5.1 async callback/CIM 创建时间表示，保留 PID 复用拒绝，新增 harness hashes；全量 362/362 PASS。单变量仅抑制 surface.hide 的实验将 mixed 空档转为黑色，明确判定不足，不进入产品；错误实验 hook 首次初始化失败由外层 50s 清理完成，修正测试注入路径后取得有效实验，历史失败证据保留。

## 2026-10-07 — Windowed transition timeline tooling

Model Tier：Tier 2。主线程限定观测范围；Sol High 实现工具与屏幕流，Luna 实现假服务 fixture / 边界测试。Reason：前一轮自动化未覆盖海报加载和窗口模式实际合成，必须先补证据而不是凭 core-playing 改呈现链。

仅修改测试与工具：新增独立 timeline 模式、两种动态 Y4M 生成器、localhost 海报、像素与事件分层记录。console 桥未取得动作后改用受信 sender 的 test-only IPC；低频 thumbnail 采样间隔约 350–380ms，不再作为短闪主方法，改用提前准备的连续流。0/150ms 两组记录到首段黑色采样；其旧视频前置条件有限，追加严格条件的 probe 未完成，明确保留 INCONCLUSIVE，未放松门槛或改产品。生产源码仍为 `456df8e`。

生成器与实际输入逐字节一致；采样颜色、窗口 / focus / display 限制、handler 恢复、动作白名单、时间窗及失焦丢帧 7/7 PASS。原默认 CD2 pipeline 回归 PASS。完整测试首次仅旧 visible-screenshot 文本断言不匹配；按新 timeline 仅流统计、默认 visible 仍截图的合同更新这一断言后，全量 347/347 PASS。运行记录均为隔离测试，不访问真实 Emby/CD2 或正式 profile。工具提交不改变 `src/`，不能当作已修复视觉失败。

## 2026-10-07 — PreviousTrack transition entry follow-up

Model Tier：Tier 2。Model：当前 Codex 主线程；Sol High 只读调用链评审、Luna 确定性测试。Reason：响应真实视觉验收失败，限定修复 renderer 前后切集入口，不扩大 native 呈现契约。Escalated：no。

Settings 候选由用户确认通过；NextTrack `88f56b7` 被确认视觉失败。查证 Video OSD 的 previousTrack 调用不会进入仅包装 nextTrack 的模块；把同一 token / request 包装逻辑复用于两个入口，previous Item 与原 manager 的索引选择完全一致。新增回归对旧提交复现失败，对当前工作区 3/3 PASS；整体 340/340 PASS，语法和 diff 检查通过。

首黑的 artwork load/decode 与尾黑的 core-playing / native show / presented-frame 边界仍需真实时序证据。没有使用固定 sleep 或让图片等待拖延媒体推进，没有新增 helper 首帧接口；当前只收口确定的 previous 入口遗漏。旧 runtime 保留，不将这次源码修正误记为整体视觉 PASS。
## 2026-10-06 — NextTrack transition cleanup audit

Model Tier：Tier 2。Model：当前 Codex 主线程；GPT-6 Sol High 独立只读复核；Luna worker 补充确定性回归。Reason：视觉绘制等待跨入现有 stop(false) 边界，需要保留请求 token 与 libmpv generation guard。Escalated：no。

用户授权独立工作树、范围内本地提交和隔离可见测试。审计以 `8f3d9a9` 为基线，确定性复现取消时 paint waiter 未释放、requestAnimationFrame 抛错后 listener 残留和无实际 CSS 动画时待清理状态。实现集中管理 paint waiter 的释放；fade 同时消费 transitioncancel / 动画完成信号，保留旧 token 不能清新 overlay 的规则。没有改变 source、媒体选择、播放身份或核心生命周期架构。

修复后 NextTrack targeted `18/18 PASS`，最终完整 `npm test 337/337 PASS`，JS syntax 和 diff 检查通过，Tier 2 只读审核通过。首次全量唯一失败来自 diagnostics 自测子进程参数未引用，含空格路径被拆开；对照未引用/正确引用启动取得确定证据后，只修测试启动并保留原脱敏断言及 timeout。Electron 隔离可见 renderer 的淡出完成后为 IDLE / overlay absent；never-shown 窗口的动画在 reveal 前可能仍挂起，reveal 后清理，不把隐藏探针当成真实前台验收。最终提交 runtime 与模拟播放结果由本轮交付报告分层记录。

## 2026-09-24 — NextTrack artwork ratio correction

用户视觉验收发现过渡封面像原比例小图置入视频区域，产生不自然留白。图片来源调整为首个 Backdrop 优先、Primary poster fallback；overlay 容器使用 `position:absolute; inset:0; overflow:hidden`，图片设为 100% 宽高、`object-fit:cover`、居中定位，因此横版 Backdrop 覆盖视频区域，竖版 Poster 会裁切填满。无图或加载失败继续保持黑底。

本次只调整封面来源优先级与显示比例，不改变 NextTrack 调用、播放时序或 Resolver、mpv、Native Helper。比例修复后的 focused playback/window `43/43 PASS`，`npm test 325/325 PASS`，相关 JS syntax 与 `git diff --check` PASS。未执行前台视觉验收。

## 2026-09-24 — NextTrack transition artwork

Model Tier: Tier 3
Model: GPT-6 Sol High
Reason: 用户指定；需在透明播放窗口与 libmpv 的 NextTrack/core-playing 生命周期间增加视觉层，同时保留现有播放链 contract。
Escalated: Yes（用户指定）

用户观察到 NextTrack 切换时视频区域会露出桌面，UI 仍可见。初版新增 renderer-only transition overlay，沿用同步队列中已经选中的下一集 Item，通过现有 `ApiClient.getImageUrl()` 使用 artwork；本条初版图片来源与比例行为已由上方 2026-09-24 比例修复记录更新。NextTrack wrapper 同步显示覆盖层后立即同步调用原 `nextTrack()`，不改变 PlaybackManager request id 与 Stop supersession 顺序；paint gate 移到 `libmpv.stop(false)` 中、现有 surface 隐藏之前，不使用固定延时。当前 `_etePlayRequestSequence` 关联的 `core-playing` 处理使视频容器可见后，再等一帧并淡出。revision token 与 request id 限制迟到的旧 transition 清理/淡出新覆盖层；播放失败或调用提前结束时清理视觉层。覆盖层位于现有 `.mpv-videoPlayerContainer` 内且不接收指针事件。没有新增 image API，也没有改 Resolver、Session、source 选择或 Native Helper。

验证：focused playback/window `42/42 PASS`，`npm test 324/324 PASS`，相关 JS syntax 与 `git diff --check` PASS。exact-commit build/provenance 与 package VerifyOnly 将在本地提交后执行，结果见任务最终报告。前台客户端未自动启动；需要用户视觉复核实际 NextTrack 过渡与首帧衔接后才能确认体验修复。
## 2026-10-06 — Settings maintenance request and release boundary audit

Model Tier：Tier 2（主线程 IPC / 外链边界审核），明确 helper 修复由 Tier 1 worker 执行。Model：当前 Codex 主线程、Luna worker、GPT-6 Sol High 独立复核。Reason：保持维护入口既有 contract，对有确定失败证据的纯 helper 做小范围修复。Escalated：no。

用户授权独立工作树、本地提交和隔离测试。以 `f58d806` 为基线，新增 localhost 滴流、错误响应连接关闭、同步异常 timer 清理、规范化 Release 路径和大整数 prerelease 回归。此前滴流可越过 60ms 测试预算、dot-segment 可离开项目 Releases 路径、相邻大整数被比较为相等。修复后使用统一整体 deadline、规范化后的 URL 白名单、数字字符串比较；保持已有 schema、普通控件与播放链。

新增 maintenance tests 与 Settings visual suite `14/14 PASS`；此前包含状态 / mapping / resolver 的定向 `83/83 PASS`。完整测试初次和串行复核均为 336/337，同一 diagnostics collector 自测失败；无空格路径的干净基线单项通过。捕获子进程启动错误后确认 Start-Process 拆开了未引用的 -File 路径，原调用 exit=-196608 且无 output，正确引用后 exit=0 并生成 bundle。仅修复自测参数引用，不修改生产 collector、断言或 timeout；单项通过后最终 `npm test 337/337 PASS`。独立 Tier 2 只读审核未发现新核心正确性问题；按最终提交构建的 gate 另随交付报告记录。没有访问真实 Emby / CD2，公网 release 查询在自动测试中使用 fixture。

## 2026-09-24 — STRM 规则卡动态 Emby 控件修复

Model Tier: Tier 1

Model: GPT-6 Sol High（当前 host）

Reason: 用户截图定位到规则卡动态 input/select/button 外观与静态表单不一致；问题限定在 renderer 元素创建，播放与状态契约无影响。

Escalated: No

核对 `emby-input`、`emby-select`、`emby-button` 均以 `customElements.define(..., {extends: ...})` 注册；规则卡此前先创建普通 DOM 元素，再设置 `is` 属性，未触发 customized built-in 构造。改为通过 `document.createElement(tag, {is: customName})` 创建。覆盖路径输入、规则 select、自定义解析顺序、规则操作按钮和动态助手样本；不修改字段值、绑定、样本上限、Save/Token 或任何 IPC/Resolver。新增 VM fake DOM 测试核对每个生成的 input/select/button 在创建时得到对应 `is` 选项；旧写法会在此测试失败。Targeted `78/78 PASS`、`npm test 331/331 PASS`、JS syntax 与 `git diff --check` PASS。真实客户端视觉结果待用户复核。

## 2026-09-24 — Settings Visual System correction v2

Model Tier: Tier 2

Model: GPT-6 Sol High（用户指定；Luna worker 分别承担只读审计、局部页面适配和测试）

Reason: 用户实际确认 STRM v1 视觉 FAIL；本轮跨 STRM、诊断、About 三页建立共享样式，并按用户追加确认选择性接入 About maintenance IPC。既有播放与设置状态边界保持冻结。

Escalated: No（模型由用户指定；About/IPC 范围由用户在本轮明确确认）

先审计当前路由和历史分支：当前分支原有 STRM 与诊断路由，没有 About；诊断的浅色按钮问题早于 `3faf888`，而 STRM 独立按钮/卡片体系由该提交引入。旧 Settings 分支只提供 About 维护操作的源码参考，没有 cherry-pick 其完整设计或覆盖 Smart Mapping。新增共享 `enhanced-settings.css`，所有选择器限定在 `.ete-settings-page`；页面 CSS 分别限定在 `strm-settings-page`、`diagnostics-settings-page`、`about-settings-page`。共享 token 统一标题、标签、帮助文案、section/card/row 间距、控件尺寸与按钮高度；Primary 白字深蓝背景的静态对比比约 5.9:1，hover 约 5.1:1。三个页面移除新页面对原生 `raised/button-submit` 的依赖。

STRM 只重排 HTML 与展示 class：单列 CloudDrive2 字段与助手样本、整行路径输入、独立状态行；原有控件 class/id、事件绑定、Save/Token 和 preview/规则行为保持。诊断页沿用原有 IPC/事件，只改显示。用户另行确认 About 页面及维护 IPC 纳入本分支，因此选择性加入 `maintenance.js`、`maintenance-ipc.js`、main 注册/注销和 About route；更新请求仍仅由点击触发，8 秒超时/256 KiB 上限，剪贴板仅格式化白名单字段，外链限制到项目 Releases。Helper 未 ready 不展示预期 libmpv 版本为实测值。

自动化：STRM/Settings/诊断 focused `103/103 PASS`，`npm test 330/330 PASS`，修改 JS syntax、`git diff --check`、三页 HTML 标签平衡 PASS。代码提交 `f3a17ca1bbe3016d33749e98d110282fc798b2f2` 的独立 runtime 生成 `2145` 文件，source/Electron 44.4.2/Native Helper/runtime provenance 和 package `-VerifyOnly` PASS；文档收尾后的 exact HEAD 将再生成 `strm-ui-review2`。本轮没有启动 runtime、Computer Use、前台窗口操作、安装或真实 Emby/CD2 验收；用户视觉复核仍是独立 gate。

## 2026-09-24 — STRM Settings UI consolidation

Model Tier: Tier 1

Model: GPT-6 Luna High（页面实现 worker；主线程复核与验收）

Reason: 目标限定在 STRM 页面视觉与展示层，已知控件、事件与状态契约；无 Playback/Session 影响，无跨模块行为设计。

Escalated: No

从指定 `46e995ef83fca7f7a882e3dc633bdcc2d2d521c7` 创建独立 worktree 和 `codex/strm-ui-consolidation`。没有使用旧 Settings 分支或其他 worktree 的代码改动。页面整理为四段，统一深色 input/select、Emby checkbox 排版、四级按钮、状态行和卡片层级；规则检查按挂载/CloudDrive2 最近测试/路径格式分别展示，助手样本和预览使用同一视觉样式。`strm.js` 仅增加展示 class、状态行与文字/颜色标记，保留功能选择器及原有请求、Save/Token、sample limit 与预览动作。未修改 resolver、inference、IPC、持久化 schema 或播放链。

补充 `tests/strm-ui-consolidation.test.cjs`，将旧静态按钮断言改为 class 包含匹配，并扩充规则状态 race fixture 与状态分离回归。focused `69/69 PASS`；全量 `npm test 322/322 PASS`；JS syntax、`git diff --check` PASS。准备阶段核对固定归档和 Electron 44.4.2 tree，复用经哈希核对的 Native Helper 头文件。代码提交 `ae0e6504f6389f261cea484fcb3e77f299c801a9` 的独立 runtime 生成 `2139` 文件，Electron/Native Helper/source/runtime provenance 与 package `-VerifyOnly` PASS。最终提交需要再次按 exact HEAD 生成 review runtime，身份以本任务最终报告为准。未启动 runtime，未进行 Computer Use、窗口操作、安装、真实 Emby/CD2 或前台视觉验收。

## 2026-09-24 — PR #18 Token 与 Settings draft 隔离修复

Model Tier: Tier 3
Model: GPT-6 Sol High
Reason: 修复跨 renderer Settings draft 与 main-process Token IPC 的异步状态覆盖问题，并核对 CD2 connection snapshot 生命周期。
Escalated: Yes（用户指定）

PR #18 远端复审在 head `b126ff110f133a6707f59d18619ab673c6c40d1d` 发现：`setToken()` / `clearToken()` 成功后用 IPC 返回的 persisted config 整体替换 `this.config`，可能覆盖未保存的规则与普通设置 draft。修复已应用：成功回包只更新 `this.config.cd2.tokenConfigured` 和 Token 显示状态，并保留原有 connection snapshot 失效/应用流程。Token 仍独立立即持久化；普通 Settings 与规则仍只由显式 Save 持久化。

验证：Settings state-machine targeted `12/12 PASS`；focused STRM/Settings/CD2/Smart Mapping/diagnostics `185/185 PASS`；`npm test 313/313 PASS`；修改的 JS/CJS 语法检查与 `git diff --check` PASS。exact-HEAD runtime/build provenance 由本轮最终提交的验收结果单独确认；不将历史 `2baf221` provenance 作为本轮证据。Final PR Audit = `REMEDIATION APPLIED / RE-REVIEW PENDING`；PR / Merge = `PENDING`。

## 2026-09-24 — STRM Smart Path Mapping final PR audit

审计 `9a034e8d627f71abbded01a1fba612d9282c9911..844b7e130539645199124b6e636b860eab23c8ad` 的 Phase 1、2、2.1、2.2 与 CD2 status sync。远端 `main` 仍为基线提交；前一轮 status sync 已由独立 `844b7e1` 提交。Smart Mapping 的文件对应关系与多样本边界置信度分开；真实 P1/P2/P3、最长前缀、Windows/UNC/POSIX、Mount 共用 source anchor 与 Resolver rule selection 的回归均通过。production resolver 的 `resolve`/`resolveAsync` 和 route order 无变更。

审计修复仅涉及设置状态与观察边界：Save 请求期间锁定当前表单控件并去重，失败保留草稿；config/Token 只有原子文件写成功后才更新内存；迟到的同 revision `checking` 不覆盖连接测试终态；旧的直接写入 restore/disable IPC 不再注册；补齐旧 preview 完成时的 `this` 绑定；Phase 1 dry-run diagnostic 明确标为 `candidateStatus/suffixConfidence`，避免被误读为 boundary confidence。页面说明连接测试使用已保存的地址与 Token；Token 仍由独立的明确设置/清除操作持久化。修正 Phase 2 历史文案，不改变 boundary 算法、正式规则 schema、CD2 service、Resolver route 或播放器链。

Model Tier: Tier 2

Model: GPT-6 Sol High (requested)

Reason: trusted settings IPC、Save/preview async race、existing coverage 与 Resolver 路径语义核对

Escalated: No

验证：`npm test 308/308 PASS`；focused Smart Mapping/Boundary/coverage/STRM config/UI/Resolver `120/120 PASS`、CD2 `33/33 PASS`、diagnostics `28/28 PASS`。后台/静态检查不代表再次执行真实 Emby/CD2 播放验收；用户此前的功能验收保持独立证据。

## 2026-09-23 — STRM Rules CloudDrive2 connection status desync fix

在 `codex/strm-smart-path-mapping@ce92f6c6b8f05545ca6379212e5d0b4787186023` 上审计设置页。顶部“测试连接”来自 main 的 `createTestService().testConnection()`，会执行有界 readiness 与 `FindFileByPath('/')` 探针；规则卡 `TEST_RULE` 只检查保存规则的 Mount 路径与 source→cloud 前缀映射格式。renderer 原来把 `mapped` 固定显示为“未连接服务”，没有传播连接测试结果。

修复后 main 设置 IPC 统一保存带 revision 的 `unknown/checking/connected/failed` 快照。连接测试成功/失败、重试、乱序返回、配置或 Token 变更都按同一快照处理；规则卡的格式检查和连接状态分开。页面只读获取快照，连接测试完成后刷新所有可见规则卡。未修改生产 CD2 service、Resolver、DirectUrl、Mount、Native、PlaybackManager、Session 或 Electron/window。

Model Tier: Tier 2

Model: GPT-6 (current host)

Reason: trusted main-process IPC and asynchronous status ordering across settings UI

Escalated: No deliberate escalation

验证：STRM Settings/connection UI/client diagnostics/CD2 focused `77/77 PASS`；`git diff --check`、修改 JS syntax PASS。首次 `npm test 295/296` 时，既有 `report-playback-issue` 自测的“程序未运行”前提与仍在运行的旧测试 runtime 冲突；用户正常退出该 runtime 后，全量复测 `npm test 296/296 PASS`。未改诊断工具；前台 Settings UI 与真实 CD2 服务未由本任务执行。

## 2026-09-23 — STRM Smart Path Mapping Phase 2.2 boundary model fix

基于 `codex/strm-smart-path-mapping@e9b698d935163b1e5a98fa0b0b2de384c49ca870` 复核真实 P1/P2/P3 样本，确认 Phase 2.1 将单组文件 suffix HIGH 错当为映射边界 HIGH。新增独立 pure `smart-mapping-boundary.js`：先按正式 longest-prefix 与 source/cloud/mount path semantics 检查当前 `rules[]`，返回 `FULLY_COVERED`、`CLOUD_COVERED`、`NOT_COVERED` 或 `CONFLICT`；再分别返回 `fileMatch` 和 `boundary`。现有规则完整覆盖时不产生 suggestion。

新规则至少需要两组不同目录样本。source/cloud 分别求最深安全公共父目录，拒绝 root-only、同目录换文件名、相对 suffix 不一致、POSIX cloud case mismatch 与 disabled tombstone；只有每组 fileMatch HIGH 且 boundary 跨目录稳定时才允许加入一个普通 `USER` rule draft。Mount 使用同一 sourcePrefix 验证多组相对路径，不能另选 source anchor。Settings UI 可添加有界样本，旧 async response 在样本或规则变化后被丢弃。preview IPC 只读，不调用 CD2、Resolver、config save；生产播放链未变。

Model Tier: Tier 2

Model: GPT-6 (host-assigned after model switch; requested GPT-5.6 Sol High)

Reason: cross-layer mapping boundary, trusted preview IPC and manual-rule authority without playback changes

Escalated: No deliberate escalation

Focused Smart Mapping/coverage/Settings/Resolver/diagnostics `123/123 PASS`；`npm test 285/285 PASS`；JS syntax 与 `git diff --check` PASS。后台 runtime `2139` files，pinned Electron 44.4.2、source、Native Helper、runtime provenance 与 package `-VerifyOnly` PASS；最终文档提交后从最终 HEAD 再构建并核对 source commit。foreground/native UI、真实 Emby/CD2 和安装均未执行。

## 2026-09-22 — STRM Smart Path Mapping Phase 2.1 path semantics fix

继续 `codex/strm-smart-path-mapping`，从 final Phase 2 `c5f937faffc223952fef7c9cac8113f7b6104a12` 开始。用户实测确认“本地路径”被自然理解为当前电脑挂载路径，因此本轮把产品 contract 固定为三种 identity：`sourcePrefix=STRM/Emby MediaSource.Path`、`cloudPrefix=CloudDrive2 logical path`、`mountPrefix=current client filesystem mount`。规则卡、助手 labels、helper text 与 preview 全部使用该语义；未导入 settings UX 分支。

审计 Phase 1 发现 parser/suffix core 已支持 Windows drive、UNC、POSIX，只有 cloud wrapper 强制 target POSIX。小范围提取 `inferPrefixMappingCore()` 并新增 `inferSmartMountMapping()`：Windows drive/UNC 可以互为 source/target，POSIX 只对 POSIX；Windows/UNC case-insensitive，POSIX case-sensitive；relative/traversal/root/share/empty/incomplete 与 ambiguity gates 保持。既有 `inferSmartPathMapping()` 的 `localPath/localPrefix` API 保持兼容，assistant IPC 对外改用明确的 `sourcePath/sourcePrefix`。

组合 preview 先执行 source→cloud；只有 Cloud `MATCHED/HIGH` 才评估 optional mount。mount inference 以 cloud suggestion 的 sourcePrefix 固定相对 suffix，再从 mount full path末尾验证并剥离。Mount HIGH 写入 mountPrefix；mount 缺失或非 HIGH 时 cloud rule仍可加入但 mountPrefix为空并显示 warning；Cloud 非 HIGH 禁止加入。没有调用 CD2、filesystem、Resolver 或 playback route。

同时完成 EXPLICIT SAVE 一致性修正：SettingsView 以内存 draft IDs区分未保存规则，避免已保存 `new-rule-*` 被误删；Add/assistant 先 capture DOM draft；USER remove、AUTO disable/restore只修改 draft，store.save 增加受控 AUTO↔DISABLED transition；onPause仍不保存。没有自动迁移或修改现有 persisted rules。

Model Tier: Tier 2

Model: GPT-5.6 Sol High

Reason: path identity semantics, shared inference core and explicit-save state transitions without playback changes

Escalated: No

自动验证：既有 Phase 1 pure contract保持；新增 mount path-kind/case/root/suffix/ambiguity/traversal/anchor 与组合 preview测试；focused Smart Mapping `23/23 PASS`；assistant + settings `33/33 PASS`；含 Resolver focused `79/79 PASS`；UI/static `10/10 PASS`；`npm test 267/267 PASS`；JS syntax 与 `git diff --check` PASS。`ui-ux-pro-max` 用于 visible labels、persistent helper text、aria-describedby、inline warning 和明确 disabled state。最终 exact-HEAD background runtime 为 `2138` files，pinned Electron 44.4.2、source、Native Helper、runtime provenance 与 package verify 全部 PASS。foreground/native UI、真实 Emby/CD2、安装均未执行。

## 2026-09-22 — STRM Smart Path Mapping Phase 2 user-confirmed assistant

继续 `codex/strm-smart-path-mapping`，基线保持 `origin/main@9a034e8d627f71abbded01a1fba612d9282c9911`，没有导入 `codex/v0.2.3-settings-ux`。先审计 current Settings：`this.config + DOM inputs` 组成 draft，显式 submit 通过 `enhanced-strm-config-save → store.save()` 持久化，service 仍需重启；`applyDiscovery()` 不属于页面 Save。审计同时发现 Add 重绘会丢未保存 DOM 编辑、new draft 无本地 remove、`onPause()` 会隐式 Save。本轮只在该 Settings draft boundary 内修正这些行为。

新增 `strm-mapping-assistant.js` pure helper，复用 `path-rules` 判断 duplicate/conflict，并只允许 `MATCHED/HIGH` 创建一个普通 `USER` rule draft。Settings 页面在路径规则下方加入紧凑助手，保留可见 label、inline feedback、disabled state、responsive grid 与 44px action target。输入原样发送给 trusted config IPC；main handler只调用 Phase 1 `inferSmartPathMapping()`，返回最小 preview，不访问 store/CD2/Resolver。HIGH confirmation 先 collect 当前 DOM draft，再加入现有 rule editor；MEDIUM 只展示；duplicate/conflict 阻断。离页不再自动保存，用户必须点击原 Save。

preview/accepted diagnostics 经现有 structured-log channel发送固定 scalar allowlist，不含 local/cloud path、canonical prefix、URL、Token 或 credential。accepted 只表示加入 draft，不表示已保存。没有新增配置字段，未调用 `applyDiscovery()`，也未修改 PlaybackManager、Session/identity、route order、DirectUrl、Mount/Native、Native Helper、libmpv、Electron/window。

Model Tier: Tier 2

Model: GPT-5.6 Sol High

Reason: cross-layer Settings draft, trusted IPC, path safety and diagnostics boundary while preserving production routing

Escalated: No

自动验证：assistant/config `31/31 PASS`；Phase 1 + assistant + settings + Resolver focused `72/72 PASS`；diagnostics `35/35 PASS`；UI/static `9/9 PASS`；`npm test 260/260 PASS`；JS syntax 与 `git diff --check` PASS。`ui-ux-pro-max` 的局部 form guidance 用于 visible labels、inline submit feedback、disabled confirmation 与 44px target，没有生成或持久化新 design system。最终 exact-HEAD background runtime 为 `2138` files，pinned Electron/source/native/runtime provenance 与 package verify 全部 PASS。foreground/native UI、真实 Emby/CD2、安装均未执行。

## 2026-09-22 — STRM Smart Path Mapping Phase 1 engine and safety model

从 exact `origin/main@9a034e8d627f71abbded01a1fba612d9282c9911` 建立独立 `codex/strm-smart-path-mapping` worktree；没有带入 `codex/v0.2.3-settings-ux`。先审计 current main 的 `rules[]` schema、三种 path identity、metadata recovery、path rules、CD2 proto/client、Mount/DirectUrl 输入、Resolver route 和 diagnostics redaction。当前仓库没有 `pathMappings` 字段；source identity 继续由 absolute `MediaSource.Path` 独占，非 absolute/HTTP source 才允许 `Item.Path` fallback。

新增 `src/electronapp/resolvers/smart-path-mapping.js`：pure deterministic engine 严格分类 Windows drive/UNC/POSIX，逐 segment 计算 longest suffix，保留 mapping anchor，输出 `MATCHED/AMBIGUOUS/NO_MATCH/UNSAFE` 与 `HIGH/MEDIUM/LOW`。HIGH 阈值固定为 filename + 至少三个连续父目录且 candidate 唯一；MEDIUM 为 filename + 两个父目录；更短 suffix 不输出 suggestion。relative、traversal、empty segment、root/incomplete、非 POSIX cloud candidate fail closed。matching manual mapping 阻止 suggestion，conflict 为 UNSAFE。

`strmResolver.previewSmartPathMapping()` 只在显式调用时执行，并通过 fail-open sink 发出 `resolver/smart-path-mapping-candidate`。event 只含 status、confidence、matched suffix count、candidate count 和 reason。`resolve()`、`resolveAsync()`、`libmpv.playInternal()`、PlaybackManager、Session、MediaSourceId、PlaySessionId、DeviceId、reporting、WebSocket、remote control、Native Helper、DirectUrl semantics、window/surface 与 Electron runtime 均未修改。

CD2 current capability：exact `FindFileByPath`、regular-file fields、`GetDownloadUrlPath`、same-origin URL 和受限 DirectUrl 为 AVAILABLE；MountPoint、root listing、directory enumeration、stable file/provider ID、name/suffix search 和 caller-provided cloud candidates 为 NOT AVAILABLE。没有扩展 proto、枚举目录、hydration、retry 或 cold-directory materialization。pure evaluator 可消费外部已知 pair；当前 API 不足以完成 CD2-aware automatic discovery。

Model Tier: Tier 2

Model: GPT-5.6 Sol High

Reason: cross-module Resolver/CD2/diagnostics architecture audit with a frozen production route contract

Escalated: No

验证使用准备脚本校验三份既有 archive、生成 pinned preload，并准备 exact Electron 44.4.2 73-file tree与固定 hash 的 mpv client header。`npm test = 251/251 PASS`；focused Smart Mapping + Resolver/settings `63/63 PASS`；CD2/DirectUrl `33/33 PASS`；diagnostics/collector/observer `28/28 PASS`；`git diff --check` PASS。background build `dist/EmbyTheaterEnhanced-smart-path-phase1-ae86a3c` 绑定产品提交 `ae86a3c3b9404e38d5127c05ecfa046f72efc2bb`，payload `2137` files，source/native/runtime provenance 与 package `-VerifyOnly` PASS，Smart Mapping runtime entry 存在。foreground/native UI/真实 Emby/真实 CD2/安装均未运行。

## 2026-09-21 — Electron 44 Final Candidate post-freeze-fix closure

Model Tier：2。Model：current Codex session。Reason：需要在 exact source revision 上复核 Electron 44 startup fix、自动化/正式 pipeline、Native Helper/installer provenance、安装后 profile 边界与真实前台验收；没有改变 PlaybackManager、Session、Resolver、CD2、Native Helper、libmpv 或视频合成架构。Escalated：no。

确认 fix commit `8be3b6b8fdce9295f73acd7aa6b6507eb5d6c27c` 为 production fix。Electron 44 standard custom-scheme canonicalization 改变了 `electronapphost://loaded/`、`electronapphost://windowstate-Maximized/` 等 renderer command URL 的 command token；旧 parser 对大小写/尾 `/` 敏感，`loaded/` 因此没有执行既有 loaded chain。正式 root boundary 固定为 `APPHOST STARTUP COMMAND CANONICALIZATION`；loaded chain 内哪一条 statement 单独足以恢复视频 presentation 没有进一步隔离，也不作为 release 必要结论。2×2 source/entrypoint matrix 为 HOST+9168 FREEZE 5/5、DIRECT+9168 FREEZE 5/5、HOST+725d PASS 5/5、DIRECT+725d PASS 5/5，四组 Electron/Host/Native Helper/mpv identities 相同。没有加入视频 workaround，也没有重开 DirectComposition/DWM/activation 调查。

从 exact HEAD `725d4c2284596b8ced749a3c8590180a1e6ed1a9` 生成 runtime `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate` 和 installer `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate-setup.exe`。runtime `2137` files；Electron `44.4.2`、Chromium `152.0.7977.130`；source/Electron/Native Helper/runtime provenance、package verify、runtime exclusions、`mpv-win32-x64.node` absent、Pepper/PPAPI absent、helper/mpv present 均 PASS。installer SHA256 为 `AAB19E605E26CE83C73610D1F5844C95EE872268BDBCD7752556E7610D3928A5`；Inno integrity PASS，解包 `{app}` 对 runtime 为 `2137/2137`，`missing=0`、`extra=0`、`mismatch=0`。

验证：`npm test 233/233 PASS`；Collector、Issue Snapshot、CD2 observer、redaction self-tests PASS；focused apphost/Electron/Native Helper/window ownership 为 `55/55 PASS`；Native Helper handshake、service geometry/OSD/input、20× race/crash-recreate、file-local UA isolation、parent-death PASS，parent-death residual `0`。Formal STRM/CD2 PASS；Formal DirectUrl PASS，`allDirectUserAgentsMatched=true`、`noDirectUserAgentLeak=true`；Formal ordinary 与 CD2 miss 的播放、控制、Stats、Session/report assertion 均 PASS，唯一 `selected=false` 为既有 rapid NextTrack baseline limitation，四个邻近 assertion 均 true。transport stress 返回 `transport:stdout-end`，在旧 Electron 44 和 Electron 18 对照上也复现，保留为跨版本 harness/environment evidence gap，不改 Native Helper。

新 installer 已安装到正式目录 `C:\Program Files\Emby Theater Enhanced`；安装后 payload 校验 `missing=0`、`mismatch=0`，profile 与 persistent device identity 保留。用户完成 HUMAN-ASSISTED FOREGROUND ACCEPTANCE，确认 video continuously advancing、audio、OSD、Settings、Pause/Resume、Seek、Fullscreen enter/leave/OSD/controls、Alt-Tab、Minimize/Restore、Resize、Stop、Normal Exit 全部 PASS；video freeze、seek black frame、stop/exit black frame 均未观察到。installed playback machine-log evidence 保持 `UNAVAILABLE`，按本轮验收口径不是 blocker；crash/residual 机器侧检查为 0。没有把缺失日志伪造为 playback PASS，也没有使用 hidden harness 替代用户视觉确认。

终态：`VIDEO FREEZE = NOT REPRODUCED AFTER FIX`；`PR #17 = OPEN / READY TO MERGE`；没有 merge、version bump、tag、Release。`ELECTRON 44 FINAL ACCEPTANCE = PASS — HUMAN-ASSISTED FOREGROUND ACCEPTANCE`，等待主线程复核后再执行 merge。

## 2026-09-19 — Electron 44 foreground regression attribution and bounded fix

Model Tier：2。Model：current Codex session。Reason：真实 foreground A/B 跨 Electron standard scheme、BrowserWindow fullscreen、透明 overlay、Native Helper child HWND、desktop/DWM frame capture 与同 profile playback；保持 PlaybackManager、Resolver、CD2、Mount、Session/report、Native Helper protocol 和 libmpv architecture 不变。Escalated：no。

Fullscreen 根因是 `standard:true` scheme 把 `electronapphost://windowstate-Maximized` 规范化为 main-side `windowstate-maximized/`，旧 case-sensitive switch 未命中但仍返回 XHR 200。新增纯 helper 只 lower-case 并 trim command token 尾 `/`，raw URL/query/openurl target 不变，unknown command 静默 no-op；新增 mixed-case/lowercase/trailing slash/openurl/unknown synthetic tests，并同步旧 source-contract assertion。独立 commit 为 `8be3b6b8fdce9295f73acd7aa6b6507eb5d6c27c`。focused `15/15`、非沙箱完整 `npm test 233/233`、JS syntax 与 diff check 通过。real Electron 44 probe 确认 `setFullScreen(true)` 到达、窗口从约 `1290x722` 进入 `2560x1440`，OSD 变为“退出全屏”。

视频 A/B 仅修改 ignored diagnostic runner。A 不追加开关；B 在正式 main load 和 app ready 前执行 `app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')`，并确认 `hasSwitch=true`。两个 arm 的 safe media hash 都为 `2768c958dda7746c`，固定窗口 `x=182,y=0,1288x720`；每个 arm 播放至少 10 秒，T0/T+2/T+4/T+6/T+8/T+10 的桌面视频区域分别保持单一重复 hash。Seek、一次 32x18 resize、一次 opaque occluder show/hide 后仍没有连续帧变化。两个 arm 的 inspect/select/play/seek/stop、time-pos、PositionTicks、audio、core-playing 均正常，Electron/helper residual 为 0。

因此 switch 功能无效，未进入 idle/playing/GPU/minimized 资源代价阶段，也未进入生产实现、formal pipeline 重跑或新 candidate/installer 构建。没有添加 redraw timer、循环 SetWindowPos、time-pos redraw、surface ownership 改动或安全降级。当前首个 blocker 为 `VIDEO FIX = BLOCKED / NEEDS DEEPER COMPOSITION WORK`；PR #17 保持 OPEN/HOLD/NOT MERGED。

## 2026-09-19 — Electron 44.4.2 background upgrade candidate

Model Tier：2。Model：GPT-5.6 Sol High。Reason：任务跨 official Electron runtime input、build/provenance、main-process protocol compatibility、BrowserWindow/HWND、Native Helper、formal playback gates 与 installer，但保持 PlaybackManager、Session、Resolver、CD2 与 helper protocol 不变。Escalated：no。

PR #15 先在 prepared `codex/diagnostics-tooling@2016dd6d0c1eabd7cd2c23a983557b77f8e908f8` 上完成 `npm test 217/217`、parser/selftests/focused tests、scope/diff/merge-tree Gate，随后用 first-parent `75cd2b957ca690417fc85833c0f6bbf8835a6449`、second-parent `2016dd6...` 的 merge commit `fdb32282810d05ed6e588d0c2dc6bc0582957405` 普通推送到 main。GitHub API 确认 PR #15 merged=true，origin/main 等于该 merge commit。

Electron 输入固定为 official Stable `electron-v44.4.2-win32-x64.zip`，archive SHA256 `6AAE435B6CD5C0EEDF9FD38824BAE4045FFDAECD029F0B8C8328BAC3F5B71F03`、`electron.exe` SHA256 `0446040F3C63EB75D5B1E1663D5EF27F07730A82DF3E4FA47FF77C1A33CEF07C`、73-file tree `F9F14E4FE641B68296CF6D17357B4037A514C87ED8C83E91395DE11D924C9030`。实际 process versions 为 Electron 44.4.2 / Chromium 152.0.7977.130 / Node 24.21.0 / V8 15.2.124.28-electron.0。prepare 对 archive、prepared tree 与 executable fail closed；build 完整替换 `x64/electron`，source/runtime provenance 区分 historical Electron 18 与 production Electron 44。

兼容审计确认 unused BrowserView 可删除且不做 WebContentsView 重构；removed `new-window` 改为 `setWindowOpenHandler`。第一次 hidden formal smoke 暴露 hidden capture surface unavailable，harness 改为 background 不截图。第二个 failure 通过 bounded trace 定位为 `electronrefreshrate://` XHR `ProgressEvent`，发生在 Native Helper 创建前。isolated protocol probe 证明只有 `standard + supportFetchAPI + corsEnabled` 可恢复 200；修复仅注册六个已有 XHR scheme，不增加 secure/bypassCSP/Service Worker，也不改变 handler 语义。

preflight evidence：`npm test 225/225`；package/source/native/runtime/Electron provenance PASS；Formal STRM/CD2 hit PASS；Formal DirectUrl 与 UA isolation PASS；ordinary/CD2 miss 的播放、暂停、seek、恢复、stop、Stats、Session/report 全部通过，唯一 rapid NextTrack `selected=false` 与 Electron 18 baseline 完全一致，其余四项 true，因此为 baseline-matched limitation。Native Helper/ownership/z-order/placement `46/46`、parent-death PASS、residual 0。

final artifact source commit `9168d08f96e121e9852880503fd01af2bf26691d`：`npm test 228/228 PASS`；runtime `EmbyTheaterEnhanced-electron44-9168d08-candidate` build/package/source/Electron/native/runtime provenance PASS；2135 manifest entries / 2136 actual files；Electron 44.4.2 / Chromium 152.0.7977.130 / Node 24.21.0 / V8 15.2.124.28-electron.0；background startup、Formal CD2、Formal DirectUrl/UA isolation PASS；ordinary/CD2 miss 保持 baseline-matched limitation。final parent-death PASS、residual 0。installer `EmbyTheaterEnhanced-electron44-win-x64-candidate-setup.exe` 大小 175563881 bytes、SHA256 `BE338187DD56BE346B832B18793FDE87AE9957EF8AD9A3B72795EA51C22BF957`；archive integrity PASS；解包 `{app}` 对 runtime `missing=0`、`extra=0`、`mismatch=0`。本 final result 仅新增 docs-only 记录，不重写 artifact source provenance；未安装、未前台播放、未 fullscreen、未改真实 profile/服务器/CD2 mapping、未 tag/release/merge Electron PR。

## 2026-09-18 — CD2 route timeline observer

Model Tier：2。Model：current Codex session。Reason：只读 observer 需要按 requestId 合并 app、Playback、Resolver、CD2、Mount 时间线，并区分首次 CD2 evidence 与同 app run 后续 evidence；没有修改 production resolver、CD2 transport 或 fallback。Escalated：no。

Issue Snapshot 已先以独立 commit `eb90fdb8934cf612bd2f39c3e9f071e2469b0d53` 收口；本轮 observer 继续使用同一分支和共享脱敏层，未把两个阶段堆进同一提交。

新增 `tools/observe-cd2-cold-warm.ps1`、`tests/cd2-cold-warm-observer-selftest.ps1` 和 `tests/cd2-cold-warm-observer.test.cjs`。Observer 只读取四个 ETE client JSONL 轮转文件，可用 live bounded polling 或 `-Once` 离线解析；不调用 CD2/Resolver/Mount，不 retry，不 warm cache，不修改 fallback order，不启动播放器。

样本选择要求一条现有 `route=direct-url` 和一条现有 `route=mount`。每条样本按 requestId 关联 `play-request`、`resolver/context-observed`、`route-selected`、CD2 `resolve-start/client-ready/find-file/download-url/resolve-terminal`、Mount、`resolver-complete`、`loadfile-requested` 和 `core-playing`。报告只保存 safe request/rule/media hashes、allowlisted labels、timestamps、elapsed 和 evidence；DirectUrl 只记录 URL generated evidence/sourceKind，不保存 URL。`startupClassification` 只输出 `FIRST_CD2_OBSERVATION` 或 `SUBSEQUENT_CD2_OBSERVATION`，描述样本 CD2 resolve-start 前同 app run 是否已有更早 CD2 resolve/client-ready；`directoryColdWarm` 固定为 `UNAVAILABLE`。这不是目录 hydration 或缓存预热证明。

当前 production log schema 没有 `resolver-initialized`、strategy、order 或 directory hydration event，observer 保持 `UNAVAILABLE`，不读取配置猜测，也不把没有 CD2 event 写成 CD2 未尝试。same-media 只有现有 ItemId、MediaSourceId 或 source identity 能建立 safe hash 时才标记 `PASS`。输出文件经过共享 redaction contract 的两次 Gate，失败则删除报告；exit 2 仅用于 redaction/privacy refusal，等待/证据不足返回 exit 3。

focused synthetic evidence：同一 rule/media 的 DirectUrl hit 被标为 `FIRST_CD2_OBSERVATION`，随后 FindFile `not_found` → Mount `mount_hit` 被标为 `SUBSEQUENT_CD2_OBSERVATION`；两个样本的 `directoryColdWarm` 均为 `UNAVAILABLE`。FindFile、GetDownloadUrl、URL generated、fallback reason、Mount selected reason、malformed JSONL、invalid UTF-8、same-rule/same-media 和 raw secret=0 均通过。waiting 报告返回 exit 3，unsafe output refusal 返回 exit 2。当前仍未取得真实 Emby CD2 样本，不把 synthetic observer evidence 写成真实播放验收。

默认实际日志目录只读 `-Once` smoke：读取 1 个日志文件，发现 5 个 DirectUrl route candidate、0 个 Mount route candidate，生成 redaction-passed 的 `WAITING_FOR_DIRECT_URL_AND_MOUNT` 报告并以 exit 3 结束。Observer 正确等待缺失的第二类样本，没有执行任何 CD2、Mount、retry、cache warm 或 production action；真实同媒体 DirectUrl/Mount 对比仍待用户在问题现场前启动 observer 后产生两类 route evidence。

## 2026-09-17 — Issue Snapshot

Model Tier：2。Model：current Codex session。Reason：只读诊断入口跨 Collector、JSONL observer、进程树、Windows crash metadata 和共享 redaction contract，但不改变 PlaybackManager、Session、Resolver、CD2、Native Helper 或安装器。Escalated：no。

Collector 已先以 `a3f6276a09a7dbdf03263c9e393671b35efcbebf` 创建唯一 checkpoint，未 push、未 PR、未 merge。随后在同一 worktree 开始 Issue Snapshot，当前 Snapshot 变更保持未提交，等待主线程 review。

新增 `tools/report-playback-issue.ps1`。正常运行显示 11 个问题类型，只询问一条可留空 note；先冻结轻量 `ETE-Issue-YYYYMMDD-HHMMSS.json`，再调用现有 Collector，转发相同 `capturedAt` 为 `ProblemTime`，并传递每次随机生成的 `issueCorrelationId`。读取范围限制为已有 ETE JSONL 轮转日志、进程树、runtime metadata 和有界 Windows Application crash metadata；不读取 command line、配置正文、媒体库、CD2 目录或凭据，也不触发 playback、resolver、CD2、Mount、retry 或新的 production observer。

新增 `tools/diagnostics-common.ps1`，由 Collector 和 Snapshot 共用随机 HMAC ID hash、path/URL summary、safe JSON serialization 和 redaction scan。Snapshot 的 Session、NowPlaying、WebSocket、report、CD2 阶段和 process evidence 只使用已观察值；无证据写 `UNAVAILABLE`，缺日志、invalid UTF-8、malformed JSONL、Windows Event 不可读和程序未运行只生成 warning。Snapshot 的最终 redaction gate 失败时不调用 Collector，Collector 仍保留目录二次 Gate 和 ZIP fail-closed 行为。

新增 `tests/report-playback-issue-selftest.ps1` 与 `tests/report-playback-issue.test.cjs`。合成 fixture 覆盖全部 issue type、Other note/空 note、Fullscreen 与 CD2/Mount 现场、Session evidence、helper/error evidence、correlation linkage、ProblemTime forwarding、Collector success/warning、missing logs、program-not-running、malformed JSONL、invalid UTF-8、shared redaction refusal，以及 fake token/server URL/media path/DeviceId/SessionId/ItemId/pickcode 的 Snapshot/bundle/ZIP raw leak 断言。

验证结果：PowerShell 5.1 parser PASS；`node --test tests/diagnostics-collector.test.cjs` PASS；`node --test tests/report-playback-issue.test.cjs` PASS；Collector 与 Snapshot PowerShell selftest PASS；`git diff --check`、untracked whitespace 和 allowed scope audit PASS。最终 normal-command smoke 选择 `11 / Other` 并留空 note，生成 Issue JSON、Bundle 目录和 ZIP，`snapshotElapsedMs=351`、`bundleElapsedMs=1206`、`collectorElapsedMs=1018`、`correlationMatches=true`、`redactionPassed=true`；issue 与 manifest 的 correlation ID 相同。无 production files modified，playback behavior modified：NO。没有运行 full `npm test`，保留既有 private/ignored Carnival input 边界，没有安装或伪造输入。Snapshot 变更仍未提交，等待主线程 review。

## 2026-09-17 — Sanitized Diagnostic Bundle Collector

Model Tier：1。Model：current Codex session。Reason：边界明确的只读 PowerShell tooling、递归脱敏、manifest/ZIP Gate 和合成安全测试；无 Playback/Session lifecycle 或产品架构修改。Escalated：no。

从正式 `v0.2.0` merge commit `dbe2f0fe8891e4fbd91a8dedcbb94eac82c66472` 创建隔离 worktree `E:\ETE-diagnostics-tooling` 与分支 `codex/diagnostics-tooling`。本轮只实现第一项 `SANITIZED DIAGNOSTIC BUNDLE COLLECTOR`；没有开始 Issue Snapshot、CD2 observer、ReferenceError observer 或 installer residual audit，也没有修改已发布 v0.2.0、真实 profile、安装器或任何 `src/**` 产品行为。

新增 `tools/collect-diagnostics.ps1`。默认窗口是采集时刻前 20 分钟；`-ProblemTime` 使用该时间点前后各 `-ProblemWindowMinutes`（默认 5）分钟。脚本只读取 `ete-client.jsonl(.1/.2/.3)`、已知 runtime metadata、ETE-owned process tree 和最多 100 条指定 Windows Application crash event。每个包使用未持久化随机 key 的 HMAC-SHA256 16 位短哈希；结构化递归 sanitizer 会删除 credential/username/pickcode/command-line/environment 字段，并将 ID、路径和 URL 转为 allowlisted summaries。采集结果分文件写入后重新扫描整包；任何 raw URL、Bearer、secret assignment、absolute path、sensitive key 或 raw sensitive-ID key 都会令 `redactionPassed=false` 并在压缩前退出。

新增 PowerShell black-box self-test 与 Node test wrapper。fixture 将 480 条有界日志、malformed JSON、invalid UTF-8 和两条含敏感信息的有效事件写入精确 client log，同时在同目录放置带 secret 的 decoy 文件，证明 collector 不会扩大读取范围。测试覆盖 fake token、带 userinfo/query 的 server URL、username、Windows/UNC/POSIX media path、相对 media filename、115 pickcode、DeviceId、SessionId、PlaySessionId、MediaSourceId、ItemId、重复 ID 稳定哈希、空/缺失日志、`.1` 轮转与问题时间窗、manifest 文件 hash、`-MaxLogLines 25`、`-NoZip` 与默认 ZIP 二次扫描。另有并发安全测试在 bundle 目录创建后注入 raw URL，已验证 `redactionPassed=false`、exit 2 且无 ZIP。

验证结果：PowerShell 5.1 parser PASS；`node --test tests/diagnostics-collector.test.cjs` PASS；`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/diagnostics-collector-selftest.ps1` PASS。当前 fixture 的目录与 ZIP 均未包含任一 raw secret。独立审查发现 Windows/UNC separator normalization 与全局同名 helper 归属两项问题；现已修为单反斜杠 normalization，以及只将 ETE-owned helper 纳入 PID/count，unowned helper 只记录无 PID 的 count/status，并补齐 Windows drive、UNC、POSIX 路径精确断言。最终用当前本机 v0.2.0 profile 执行只读真实 collector smoke，约 `2806ms` 完成；manifest 为 `appVersion=0.2.0`、`sourceCommit=dbe2f0f...`、`filesIncluded=8`、`redactionPassed=true`，ZIP 存在；Session/WebSocket observer 与 Windows event access 分别以安全 warning 记录，临时目录核验后已删除。

全量 `npm test` 尝试为 `189/198 PASS`。其中 8 项失败是该 fresh worktree 缺少 private/ignored Carnival Web input 与 prepared `src/electronapp/preload.js`；另 1 项为既有 real grpc-js connection-refusal reason assertion，单独复跑仍为 `26/27`。本轮新增 collector test 在全量中通过，未用代码规避或弱化这些无关失败。尚未发生真实日常故障现场，因此只声明 tooling READY，不声明已取得真实问题诊断证据。

## 2026-09-17 — v0.2.0 Release Gate revalidation

Model Tier：2。Model：current Codex session。Reason：版本 authoritative source、source/native/runtime provenance、installer payload 与 installed Native Helper lifecycle 跨构建和验收层复核；没有改变 playback architecture。Escalated：no。

版本 commit 为 `569c8dfbcd18725bf41a323c49cdfa4d38c8fa6b`，只更新 `package.json` 与 `package-lock.json` 的 `0.1.1 → 0.2.0` authoritative 字段。`npm test` `201/201`、`git diff --check`、source/native/runtime provenance、package verify、formal ordinary、formal STRM/CD2、formal DirectUrl 均 PASS。runtime `EmbyTheaterEnhanced-0.2.0-release-569c8df` 与 installer 均从该 commit 生成；installer 大小 `125637307` bytes，SHA256 为 `BD192CF1CBA793C2C0C46472F4466EBA0AF2211CA988E4EBC50984827B41A6EE`，解包逐文件结果为 `missing=0`、`extra=0`、`mismatch=0`。

实际安装后的 0.2.0 lifecycle 完成 `launch/play/pause/seek/resume/normal NextTrack/stop/exit`。Native Helper、Session NowPlaying、12/12 reports accepted 和清理 residual 均通过；`generation-required=0`、unexpected `bridge_error=0`、helper crash `0`、Electron crash `0`。当前 profile 没有 CD2 mapping，日志观察到 `route=native` / `no_matching_rule`，因此严格记录：

```text
INSTALLED REAL CORE LIFECYCLE = PASS
INSTALLED REAL CD2 ROUTE = NOT COVERED

COMPENSATING CD2 EVIDENCE:
- historical REAL CD2 = PASS
- final-head Formal CD2 = PASS
- final-head DirectUrl pipeline = PASS
- installed Native Helper REAL lifecycle = PASS
```

本轮未修改 `src/` playback code、真实 CD2 profile、服务器配置或 deferred 项。当前只完成 release-candidate gate revalidation；后续按授权流程执行 feature push、PR、review、merge 后 main rebuild、tag 与 GitHub Release。

## 2026-09-17 — Phase 2B Pepper retirement complete

Model Tier：2。Model：current Codex session。Reason：bridge 入口、Electron startup、runtime exclusion、provenance/package、readiness semantics 与 REAL smoke 的跨模块收口；不改变 PlaybackManager、Session、Resolver、CD2 或 remote server semantics。Escalated：no。

基于 `feat/native-helper-bridge@a5acd97f3c07ff980c7dab65752addda96386af0` 完成 retirement boundary，并以 `7e130c4cadc4b0399f61b8eb945a33e76c1163a3` 提交第一组实现。删除 PPAPI registration、旧 `application/x-mpvjs` renderer path、Pepper-only direct probes、旧 `.node` runtime copy；Native Helper service/client 现在是唯一 production bridge，显式旧 mode 确定性返回 `legacy-mode-removed`。

验证：`npm test = 201/201 PASS`；source/native/runtime provenance、runtime exclusion、package verify PASS；retirement runtime payload `2135` entries / `2136` actual files，旧 `mpv-win32-x64.node` absent，Native Helper 与 `mpv-1.dll` present。Formal local media、CD2 hit、DirectUrl/UA isolation pipeline 与独立 Native Helper Electron smoke PASS。CD2 miss pipeline 的 playback/control/report PASS，但既有 rapid NextTrack `selected=false` limitation 保持 deferred。

最小 REAL smoke 使用同一 product runtime，`inspect/select/play/pause/seek/resume/next/stop` PASS；readiness class A、Native Helper bridge-ready observed、Session/report 与 remote controls PASS、runner completed、cleanup verified-clean、owned residual 0。当前正式结论为 `REAL EMBY CLIENT ACCEPTANCE = PASS`、`NATIVE HELPER PRODUCTION ACCEPTANCE = COMPLETE`、`PEPPER RETIREMENT = COMPLETE`。ReferenceError follow-up、concurrent Remote NextTrack limitation、Stop-barrier candidate 与 Electron upgrade 均保持 deferred。

## 2026-09-17 — Phase 2 REAL Emby acceptance complete; concurrent remote limitation non-blocking

Model Tier：1。Model：current Codex session。Reason：现有 REAL evidence 已闭合，剩余工作仅为重新分类已完成的 fast-concurrent diagnostic、同步 acceptance-only gate/docs 并提交；production playback chain、Resolver、Native Helper、PlaybackManager、Session 与 Pepper 全部冻结。Escalated：no。

在 `feat/native-helper-bridge@50f578e1eb251336d15ba116b558c1ac341d7f05` 上完成 Phase 2 acceptance gate 收口。Formal ordinary PASS；真实库完整 inventory 为 ordinary `0`、STRM `7665`，因此 `REAL ordinary media = N/A — ENVIRONMENTALLY UNAVAILABLE`，并以 Formal ordinary 与 REAL STRM native-fallback 作为 compensating evidence。REAL STRM native-fallback、REAL CD2、Remote Control、正常单次 NextTrack、Session/report lifecycle、Seek backward、getStats、LibraryOptions-aware Resume、non-zero start position 与 Resume position 均保持 PASS。

fast-concurrent focused diagnostic 使用两个完全相同参数的 isolated REAL STRM/native-helper run。两次均为：

```text
HTTP NextTrack #1/#2 = fulfilled
WebSocket NextTrack delivery = 0/2
ApiClient NextTrack = 0
InputManager next = 0
PlaybackManager.nextTrack() = 0
generation-required = 0
unexpected bridge_error = 0
unhandled rejection = 0
helper crash = 0
Electron crash = 0
```

两条 HTTP command 到达时 current item 均为 A、queue index 为 `0`、queue length 为 `3`、next candidate 为 B；两条 command 均未进入客户端 WebSocket/ApiClient/InputManager/PlaybackManager。A 只在 bounded wait 结束后的 cleanup 中停止，B/C 未 selected、未 play、未创建 generation。socket 已 open 且 handler 已安装，普通单次 NextTrack 的 WebSocket delivery 另有 PASS evidence，因此分类为 `SERVER_REMOTE_COMMAND_SEMANTICS`，不分类为一般 WebSocket、InputManager、PlaybackManager、Native Helper 或 production NextTrack bug。两次只有启动绝对时间不同，结构性结果一致，`TIMING RACE = NOT CONFIRMED`。

所以当前 gate 改为：

```text
CONCURRENT REMOTE NEXTTRACK = NON-BLOCKING / OUTSIDE ESTABLISHED CLIENT CONTRACT
REAL EMBY CLIENT ACCEPTANCE = PASS
NATIVE HELPER PRODUCTION ACCEPTANCE = COMPLETE
PEPPER RETIREMENT = AUTHORIZED
```

`A→B→C` 的立即并发语义不作为客户端 production contract；本记录只定位服务器是否向该客户端 WebSocket 交付 command 的边界，不声称服务器内部一定 coalesce/discard。两个 focused run 各观察到 `2` 个 renderer `ReferenceError` events，message/stack 尚未采集；没有 unhandled rejection、`bridge_error`、helper/Electron crash 或播放副作用，记录为 `REFERENCEERROR = NON-BLOCKING FOLLOW-UP`，本轮不诊断、不修复。

本轮仅修改 acceptance harness/docs，production files modified `0`。验证：`npm test=197/197`、`node --check tests/live-acceptance-browser.js=PASS`、`git diff --check=PASS`。Stop-barrier candidate 保持 `7BF1F8E53D8BA63717A9CFB44F0D53E46EAE1600E34C4D8F100D3B0153333931`。脱敏 focused evidence：`.work/fast-next-fallback-529315abd95c4d02abca7c7e38274401/run1/output/diagnosis.json`、`run2/output/diagnosis.json`。

## 2026-09-17 — LibraryOptions policy confirmed; Resume PASS; fastNext blocker

Model Tier：2。Model：current Codex session。Reason：本轮把真实 Emby `LibraryOptions` 与 Resume eligibility 解耦于 Native Helper bridge，并在 policy 合规位置完成 second Play，再验证快速连续 NextTrack；未修改 production code。Escalated：no。

对真实测试 item 的 `Library/VirtualFolders/Query` 只读结果：匹配一个 `movies` virtual folder，当前 profile 非管理员但该 endpoint 返回了 `LibraryOptions`。实际 policy 为 `MinResumePct=3`、`MaxResumePct=90`、`MinResumeDurationSeconds=120`。item `RunTimeTicks=56915310000`、duration `5691.531s`；原 Stop `302390000` ticks 对应 `0.531298%`，因此明确为 `NOT_ELIGIBLE`，根因是 acceptance test position below server resume threshold，不是 server/reporting failure。`System/Configuration` 仍不提供这三个字段，本轮以匹配 virtual folder 的 LibraryOptions 为 authoritative read-only source。

将 acceptance harness 的 target position 按 policy 动态计算为 `5%`，target `2845765500` ticks。真实 Remote Seek 到 `2840000000` ticks，local/server 均到达，新的 Progress report accepted；随后 Stop report accepted，server metadata bounded polling 第一轮即返回 `2840000000` ticks、PlayedPercentage `4.989870%`、Played=false、Unplayed=true、LastPlayedDate valid/present。second Play 通过 PlaybackManager/application contract 启动，currentPlayer=`libmpvmediaplayer`、core-playing、Session NowPlaying、start/progress reports 均通过，actual start `2840000000` ticks，saved/actual difference `0` ticks。该项记为 `REAL NONZERO START POSITION=PASS` 与 `REAL RESUME POSITION=PASS`。

随后执行至少三个真实 item 的 fastNext：A core-playing 后立即并发发送两个 `NextTrack`，两个 HTTP promise 均 fulfilled，`unhandledRejectionCount=0`；fast queue 自身完成 CD2 direct-url、Native Helper 与 core-playing，但在 bounded 45 秒内 A 没有被观察为 stopped/retired，B/C 都没有成为 current，C Session/report 也没有出现。当前首个独立 blocker 为 `FAST NEXTTRACK / REMOTE COMMAND SEMANTICS`，属于 `OTHER`，本轮没有继续重发或修改 production，也没有足够证据直接确认 production bug。`generation-required=0`、unexpected `bridge_error=0`、helper/Electron crash=0。

本轮无 production `src/` 修改、无新 commit；当前 harness/docs 仍未提交。`npm test=197/197`、JS syntax、`git diff --check` 通过。无 Pepper 使用，临时 profile/mapping 已清理，residual=0。脱敏 evidence：`.work/real-resume-policy-libraryoptions-e3fb5865a80e4d7d8a27a72daa8a9cc5.json`、`.work/live-acceptance-cd2-policyknown-b368825795ad40aab0073ecf3f9fc6b6`。

## 2026-09-17 — Resume policy unavailable to current profile

Model Tier：2。Model：current Codex session。Reason：本轮只读核对真实 item 的 duration、virtual folder identity、Emby server resume policy 与 `302390000` ticks eligibility；没有修改服务器或 production code。Escalated：no。

对当前测试 item 的脱敏读取结果：`RunTimeTicks=56915310000`，duration `5691.531s`，itemId hash `af7137c6a8570078`；sidecar/source identity descriptor 与既有 correlation 一致。`Library/VirtualFolders` 只读 endpoint 返回 `200`，匹配一个 virtual folder，collection type 为 `movies`；当前用户 `IsAdministrator=false`，top-parent name 不可用，item/parent identity 仅保留 hash。

尝试读取 `System/Configuration`：HTTP response 为 `200`，但 response 不包含 `MinResumePct`、`MaxResumePct`、`MinResumeDurationSeconds` 三个字段。受限于当前非管理员 profile，记录为 `policy unavailable to current credentials`；已检查本机已知 Emby server config roots，没有可用的现成 `system.xml` admin evidence。没有猜测阈值、没有修改服务器配置。

Stop position `302390000` ticks 相对该 item duration 的计算值为 `playedPct=0.531298%`。由于三项 policy 均 unknown，当前结论为：

```text
CURRENT 30s STOP = POLICY UNKNOWN
```

无法安全判断 `MinResumePct`、`MinResumeDurationSeconds` 或 `MaxResumePct` eligibility，也不能选择一个“明确符合 policy”的 target position。因此没有执行 Remote Seek、再次 Stop、second Play 或 fast consecutive NextTrack。本轮首个 blocker 为 `POLICY UNKNOWN / CURRENT CREDENTIALS`，不分类为 production reporting bug。

脱敏 evidence：`.work/real-resume-policy-0d35749f49274f39b0af7f6f5c3922d1.json`。当前 HEAD 仍为 `50f578e`，无新 commit；production `src/` 无改动，临时 profile 已清理，Electron/helper residual 为 `0`。

## 2026-09-17 — Bounded resume polling stopped at Emby server/report semantics

Model Tier：2。Model：current Codex session。Reason：本轮需要把 Stop report payload、HTTP response、WebSocket Session、同一 item 的 MediaSourceId/PlaySessionId 和 Emby metadata 的 bounded eventual-update 结果做关联；未修改 production code。Escalated：no。

在已有 CD2/native-helper real acceptance 基础上，仅修改 acceptance harness 的 `resumeCycle` 诊断：移除固定 1 秒最终判定，改为 `500ms` interval、`10000ms` max wait 的 server metadata polling；每轮记录 elapsed、`PlaybackPositionTicks`、`PlayedPercentage`、`Played`、`Unplayed`、`LastPlayedDate`。`npm test=197/197`、JS syntax 与 `git diff --check` 通过。

实际 bounded timeline 共 `13` 次读取，elapsed 为约 `97ms, 699ms, 1300ms, 1905ms, 2614ms, 3219ms, 3821ms, 4424ms, 5211ms, 6215ms, 7211ms, 8214ms, 9207ms`；全部 `PlaybackPositionTicks=0`、`PlayedPercentage=null`、`Played=false`、`Unplayed=true`，`LastPlayedDate` 保持 present。10 秒窗口内没有出现非零保存位置，未继续第二次 Play。

Stop report correlation：Stop report present、HTTP response resolved/accepted、WebSocket delivered；`PositionTicks=302390000`，same item=`true`，MediaSourceId present 且与该 item 的 start report 相同，PlaySessionId present 且与该 item 的 start report 相同。`media page returned=true`，但刷新同一 item 的 server `UserData.PlaybackPositionTicks` 仍为 `0`。因此已排除固定 1 秒等待过短这一初步 harness 假设，当前第一个独立 blocker 分类为 `EMBY SERVER / REPORT SEMANTICS`；本轮没有证据确认 production reporting bug，也没有修改报告链。

由于 Resume authoritative assertion 未完成，按要求没有继续 `fast consecutive NextTrack`。当前 `REAL Resume position=FAIL/NOT VERIFIED`，`REAL fast consecutive NextTrack=NOT RUN`；已有 REAL CD2、STRM fallback、Remote Control、Session/report、Seek backward、getStats 证据保持有效。当前无 production `src/` 修改、无新 commit、无 Pepper 使用；`REAL EMBY ACCEPTANCE=FAIL`。

脱敏 evidence：`.work/live-acceptance-cd2-final-2e907f7a259146d1a1c610f09481a734`。临时 mapping/profile 已清理，Electron/helper residual 均为 `0`。

## 2026-09-17 — Multi-sample source/cloud correlation and REAL CD2 acceptance

Model Tier：2。Model：current Codex session。Reason：本轮需要把真实 Emby 的多样本 Item.Path、MediaSource.Path、Emby Download 行为、ETLP 实际 parser/CD2 输入、Enhanced rule selection 与真实 gRPC/CD2 playback 关联起来；未修改 production resolver。Escalated：no。

在 `feat/native-helper-bridge@50f578e1eb251336d15ba116b558c1ac341d7f05` 的 `EmbyTheaterEnhanced-0.1.1-native-helper-cd2diag-50f578e` runtime 上，从真实登录态副本只读取 Movie/Episode inventory：`7665/7665`，ordinary `0`、STRM `7665`。选取 `12` 个不同 sidecar/source directory 的 STRM。sidecar common structure 为 POSIX、root class `media`、normalized descriptor hash `2c5750edd20c7ebc`、length `15`、3 segments；每个样本的 sidecar relative suffix 为 2 segments。`MediaSource.Path` common structure 为 POSIX、root class `other`、descriptor hash `bacd208bc305dcbf`、length `37`、5 segments；每个 source path 为 7 segments，source relative suffix 为 2 segments。

当前 ETLP adapter 的 `[src]` root 与 sidecar 结构一致，但不匹配 actual `MediaSource.Path`。ETLP `path_map` target 在每个完整 `MediaSource.Path` 中出现在同一 segment offset `2`；截断到该 target 的 derived source prefix 在 `12/12` 样本中稳定，descriptor hash `017f7afde5e39ad7`、length `32`、4 segments；configured cloud target descriptor hash `5bd333fa2336f6d2`、length `12`、2 segments。所有样本的 sidecar/source relative stem correspondence 为 `12/12`，Enhanced `mountResolver` candidate 为 sourcePath-only `12/12`，source→cloud prefix replacement 为 `12/12`。这是从实际 path segment 关系推出的唯一 mapping，未尝试多个 prefix。

ETLP 实际输入链路由源码确认：`playbackData.MediaSources[].Path -> source_path`，`mainEpInfo.Path -> file_path`，`strm_local_media_path(file_path, source_path)` 得到确定性媒体路径，再经 `[src]/[dst]` 转换为 `strm_cd2_local_path`，最后 `maybe_register_strm_cd2_url(strm_cd2_local_path, fallback_url=stream_url)` 进入 CD2。Enhanced rule selection 的 authoritative input 仍是 `MediaSource.Path/sourcePath`。对 Emby `Items/{id}/Download` 只发起 `Range: bytes=0-4095`，12/12 返回 `206` 视频字节而非 `.strm` 文本；因此 pointer content 没有直接暴露，但 metadata/source identity 与 ETLP parser 的 source_path contract 一致，未把视频响应误记成 STRM 文本。

使用 derived source prefix → configured cloud target 的临时 acceptance config adapter 后，rule-selection probe 为 `12/12` selected `legacy-cd2`，stub transport invocation `24`，随后 actual runtime config probe 的 real same-origin CD2 请求为 `status=hit、reason=cd2_hit、sourceKind=cd2-url`。完整 REAL CD2 flow 从头执行成功：两次真实 playback resolver 均为 `legacy-cd2 -> direct_url_hit -> direct-url`，两次均完成 CD2 `FindFile` 与 `GetDownloadUrlPath`；resolver route hit、Native Helper、core-playing、Session NowPlaying、Pause、Resume、Seek forward、NextTrack、Stop、HTTP/WebSocket remote command 与 playback reports 均通过。`Stop` 后 NowPlaying 清空，运行结束后 Electron/helper residual 为 `0`。本轮没有持久化 acceptance mapping 到真实 profile，原 profile 未被覆盖或清理。

为补剩余 coverage，acceptance harness 当前工作副本新增 `seekBackward`、`getStats`、`resumeCycle`、`fastNext` 验证入口并将选择数扩展为 3；`npm test` 仍为 `197/197`，JS syntax 与 `git diff --check` 通过。`seekBackward=PASS`，`getStats=PASS`，返回 4 categories：`media/video/audio/enhanced`，stat counts `1/17/5/6`。`resumeCycle` 在 `Stop -> media page` 后停止：Stop command server accepted、WebSocket delivered，Stop report accepted 且 position 为 `302800000` ticks，但 1 秒后重新读取同一 item 的 `UserData.PlaybackPositionTicks` 为 `0`，所以没有继续再 Play；该首个独立 blocker 分类为 `HARNESS`，具体是 acceptance 对 Emby metadata eventual update 的等待假设，是否存在更晚 server update 本轮未继续验证。`fastNext` 未在该 blocker 后执行。

脱敏 evidence：`.work/real-multisample-correlation-19669e680df849fdb606907ac9a70a2a.json`、`.work/real-rule-selection-probe-3908f945593d4d63876ba50fc32771d7.json`、`.work/real-cd2-runtime-config-probe-c55cd9c1410643cba3c051b01e882a6f.json`、`.work/live-acceptance-cd2-full-3f8c2c91c88644459db122d89a501061`、`.work/live-acceptance-cd2-remaining-3ef6c50206ca4a9ca61bd0465be9d251`。本轮无 production `src/` 修改；最近 commit 仍为 `50f578e`，新增 harness 与文档保持未提交。无 Pepper 使用、未开始 Pepper retirement；`REAL ORDINARY MEDIA = N/A — ENVIRONMENTALLY UNAVAILABLE`，因此当前 gate 保持 `REAL EMBY ACCEPTANCE = FAIL`。

## 2026-09-17 — Ordinary N/A and pure no_matching_rule correlation

Model Tier：2。Model：current Codex session。Reason：本轮只读 correlation 需要同时核对真实 Emby item/source identity、ETLP schema conversion、Enhanced v1 rule、POSIX path normalization 和 `selectRule` code path；没有实现修复。Escalated：no。

上一轮 harness fix 已单独提交为 `50f578e1eb251336d15ba116b558c1ac341d7f05`。普通媒体按用户要求改为 N/A：完整 Movie/Episode inventory `7665/7665`，ordinary `0`、STRM `7665`，source path 全为 POSIX。记录 `REAL ORDINARY MEDIA = N/A — ENVIRONMENTALLY UNAVAILABLE`，compensating evidence 为 Formal ordinary pipeline PASS 与 REAL STRM native-fallback lifecycle PASS；不修改 Emby media library。

使用上一轮成功播放样本执行无副作用 correlation，itemId hash `af7137c6a8570078`。sidecar 为 POSIX/media，normalized hash `f8cee147db9ba93f`、length 97；`MediaSource.Path` 为 POSIX/other，normalized hash `6ef7215e5d4de93a`、length 118。由于 source path 可被 `normalizeMappingPrefix()` 识别为 absolute POSIX，`strm-resolver.js` 的 `selectRule()` 使用 `values=[sourcePath]`，不再使用 sidecar fallback。sidecar 对 rule source root `prefixMatches=true`，actual source 对同一 root `prefixMatches=false`。

Enhanced config 由当前 production `bootstrapLegacy` 按上一轮实际 acceptance adapter 输入生成：schema v1、resolver/CD2/DirectUrl enabled，唯一 rule `ruleIndex=0, ruleId=legacy-cd2, enabled=true`，regex absent。ETLP `[src]` root 与 Enhanced source root 的 normalized hash/length 一致，ETLP `path_map` target 与 Enhanced target root 一致，source/target 方向正确；actual source 的 POSIX root class 为 `other`，不匹配 configured source root 的 `media` class，rule failure 为 `posix-prefix-or-boundary-mismatch`。

精确生产 code path 为 `selectRule() => null`，随后 `resolve()` / `resolveAsync()` 返回 `type=native`、`reason=no_matching_rule`；correlation 明确 `cd2TransportInvoked=false`。独立 `/media`、`/mnt`、`/volume` POSIX rule probes 均 selected=true，因此没有确认 production resolver 对这些 POSIX class 的 gap。分类为 `ACCEPTANCE CONFIG ADAPTER`，附带环境配置与实际 source root 不匹配；未修改 production、未调用 CD2、未尝试多个 prefix、未处理 cold-directory。

脱敏 evidence 为 `.work/real-rule-correlation-50f578e.json`。本轮在第一个独立 `ACCEPTANCE CONFIG ADAPTER` blocker 处停止；REAL CD2 未取得 route hit，`REAL EMBY ACCEPTANCE = FAIL`。

## 2026-09-17 — Application-window ownership fix and REAL acceptance follow-up

Model Tier：2。Model：current Codex session。Reason：ownership implementation 本身是边界清楚的 Tier 1 harness 修复，但后续真实验收跨 application renderer、Native Helper auxiliary surface、Emby Session/WebSocket、CD2 和真实媒体库存，需要保持证据层分离。Escalated：no。

在 `feat/native-helper-bridge@49b1fc3668c98487fb044e73a1da698a8b67d822` 上只修改 `tools/acceptance-electron.cjs`，复用 `tools/runtime-window-ownership.cjs` 的 canonical packaged `electronapp/www/index.html` identity。`browser-window-created` 不再覆盖 `win`；只有 `did-finish-load` 分类为 application 的窗口才能绑定 owner、执行 epoch/flow injection 和后续 `evaluate`。`data:`、其他 `file:`、`http:`、`https:` 窗口只被记录为 auxiliary。

新增 acceptance-harness regression 与既有 fake ownership cases 合计 `7/7`，其中验证 application renderer 的 fake `window.eteAcceptance` 可用、auxiliary data window 出现后 owner 不变、auxiliary probe/injection count 为 0。acceptance readiness/terminal self-tests `3/3`，全量 `npm test` `197/197`，JavaScript syntax 和 `git diff --check` 通过；`src/`、Native Helper、libmpv、PlaybackManager、Session、Resolver、generation、Pepper 均未修改。

按当前 HEAD 重新构建 runtime `EmbyTheaterEnhanced-0.1.1-native-helper-real-49b1fc3-ownerfix`，SOURCE/NATIVE/RUNTIME provenance 与 package verify 通过，payload 2136 files，helper non-testing。标准 persistent-profile REAL run 的 trace 明确记录 application document owner，随后 Native Helper `data:` auxiliary window，owner 未改变。真实 STRM native fallback 的 inspect/select/play/pause/seek/resume/next/stop 全部通过；helper handshake、core-playing、Session NowPlaying、server accepted、WebSocket delivered 和 10 条 playback reports 通过，Stop 后 NowPlayingItem 清空，target residual=0。resolver 为 `native/no_matching_rule`、CD2 `not_attempted`，故只记 `REAL STRM Native fallback PASS`。

为完成 CD2 目标，使用原 persistent 登录态的隔离副本和已存在的本地 CD2 输入运行标准 flow；副本复制初次因嵌套目录造成 `api-client-unavailable`，该 setup error 已停止并清理，未当成产品 blocker。正确复制后 strict inspect 通过，但真实样本仍为 `no_matching_rule` / `cd2 not_attempted`，没有把 fallback 记作 CD2 hit。随后对 `Movie,Episode` 做完整只读分页：`TotalRecordCount=7665`，fetched `7665`，ordinary `0`，STRM `7665`，source path 全为 POSIX。当前没有真实非 STRM 媒体，故第一个新的独立 blocker 为 `MEDIA/ENVIRONMENT`，本轮停止继续探测。

脱敏 evidence：`.work/live-acceptance-2525dec8174f42b9a43483e70458b0ff`、`.work/live-acceptance-cd2-34de10d328804431b2ebea57c8521ec9`、`.work/real-ordinary-scan-20260917.json`。临时 CD2 profile 已删除并验证原 persistent profile 未新增 `strm-resolver.json`；target runtime owned process residual=0。stop-barrier candidate hash 仍为 `7BF1F8E53D8BA63717A9CFB44F0D53E46EAE1600E34C4D8F100D3B0153333931`。本轮无 production file change、无新 commit、无 Pepper 使用，`REAL EMBY ACCEPTANCE = FAIL`。

## 2026-09-17 — Native Helper REAL Emby acceptance stopped at harness blocker

Model Tier：2。Model：current Codex session。Reason：真实验收跨 Electron main/renderer、Native Helper、libmpv、PlaybackManager、Emby Session/WebSocket 与报告链；本轮只做证据采集，不改变 production contract。Escalated：no。

先在独立 `E:\ETE-native-helper-bridge` worktree 核验 `feat/native-helper-bridge@49b1fc3668c98487fb044e73a1da698a8b67d822`，worktree 初始 clean。正式构建 `EmbyTheaterEnhanced-0.1.1-native-helper-real-49b1fc3` 从 HEAD Git blob 生成，SOURCE/NATIVE/RUNTIME provenance 和 package verify 均通过，runtime payload 2136 files，native helper 为 non-testing build。未设置 `ETE_MPV_BRIDGE_MODE=pepper`，实际观察到 `native-helper/helper-ready` 和 helper executable；没有自动 Pepper recovery。

使用现有 persistent profile 的 strict inspect 为 `loggedIn=true`，client identity `Emby Theater Enhanced`，非管理员；inspect 阶段 own Session 可见，但 `websocketOpen=false`、`SupportsRemoteControl=false`，故 HTTP/WS Session identity 与 remote control 尚未通过。首次选择到的真实样本是 STRM Movie，`inspect/select/play` 均通过；当前 profile 这次没有匹配 CD2 rule，resolver 日志为 `route=native`、`reason=no_matching_rule`、`cd2Reason=not_attempted`。应用日志观察到 `helper-ready`、native loadfile request、`core-playing`、current player、own Session NowPlaying 以及 2 条已接受的 start/progress report。run window 内 `generation-required=0`、`bridge_error=0`、helper-terminal/crash=0、生产 error event=0。

进入下一步 `pause` 时，`acceptance-trace.txt` 依次记录 application document 完成、play 后第二次 `browser-window-created`（Native Helper video surface）和 `method-start=pause`；随后 `acceptance-operation-failed`，renderer 报告 `Script failed to execute`。源码审计确认 `tools/acceptance-electron.cjs:67-70` 的全局监听器无条件执行 `win=created`，因此辅助 `data:` surface 覆盖 application renderer；后续 `evaluate()` 对辅助窗口调用 `window.eteAcceptance.pause()` 失败。该首个独立 blocker 归类为 `test/acceptance harness`，没有证据支持 production/native helper/CD2/Emby server failure。按任务边界未重试、未修改 harness/production、未继续 ordinary、STRM/CD2、getStats、remote control、NextTrack 或 Resume/Stop。

完整脱敏 evidence 位于忽略目录 `.work/live-acceptance-a2a9cf79f6cb4846a1726ee9597a5593`；当时主 Electron PID 8428、helper PID 9356，收尾后 target runtime owned process residual=0。`.work/stop-barrier-candidate.patch` hash 仍为 `7BF1F8E53D8BA63717A9CFB44F0D53E46EAE1600E34C4D8F100D3B0153333931`。本轮无 production file change、无新 commit、无 Pepper 使用，`REAL EMBY ACCEPTANCE = FAIL`。

## 2026-09-17 — Deterministic generation fixture

Model Tier：2。Model：GPT-5.6 Sol High。Reason：虽然只改 harness，但必须准确区分 renderer request generation、native generation、listener cleanup 与 controller stale filtering，禁止因 fixture timing 误判 production regression。Escalated：no。

两次相同 focused diagnosis 结果不同：non-overlap run 中 Play #1 在 927.0ms fulfilled，Play #2 到 1015.8ms 才进入；Play #1 gen131 后续被正常 retire，旧 gen131 END_FILE 在 gen132 current 时 controller drop-stale。overlap run 中 Play #2 于 489.5ms 进入，Play #1 于 491.9ms 正确 reject PlaybackSuperseded，且 Play #1 尚无 native generation。两个 run 均无旧 callback 影响 current state；因此 root cause 为 fixed-delay TIMING，`oldCoreListenerIgnored` 命名与 observation 不符，aef373a diagnostics fix 无直接因果。

harness observer 现在透明包装 application window 的 core listener add/remove、endpoint begin/retire generation 与 fake CD2 resolve/cancel IPC。Play #1 gate 要求 listener + native generation + pending；assertion 关联 Play #1/2 requestId、old generation retirement、PlaybackSuperseded。old-listener assertion 要求 removed、takeover 后 callback count=0、Play #2 fulfilled。Stop case 等待 exact request 的 CD2 resolve in-flight，再触发 stop 并观察 matching cancel。focused official runtime 连续三次 `first/second/old/stop/late=true`、cancel=1、active=0；unit `4/4`，全量 `npm test 196/196`。未修改 production、NextTrack、Stop barrier、REAL profile 或 Pepper。

## 2026-09-17 — Ready diagnostics generation ownership fix

Model Tier：2。Model：GPT-5.6 Sol High。Reason：修复点虽窄，但必须同时保持 optional diagnostics fail-open、native generation isolation、direct/global getProperty 与 required helper/protocol fatal 边界，并验证 delayed STRM/CD2 authoritative core-playing。Escalated：no。

两次 bounded diagnosis 已证明 remoteStop#1、managerStop#1、playerStop#1 与 destroy#1 在新 STRM Play 前约 789ms 全部 settle；真正独立 owner 是 ready diagnostics 在 generation=null 时发送 diagnostic set_property/expand，产生 `generation-required` bridge_error。新 generation 163 随后虽建立并提交 load，但早先错误已使 embedded.play reject，PlaybackManager onPlaybackError 的 destroy 才 retire generation。Stop barrier candidate 以 SHA256 `7BF1F8E53D8BA63717A9CFB44F0D53E46EAE1600E34C4D8F100D3B0153333931` 保存在 ignored `.work`，本提交不包含它。

实现只修改 renderer client 与 diagnostics consumer：native endpoint 无 generation 时不提交 optional cache mutation；有 generation 时 exact set/expand/read 共用捕获 generation，并在每个 await 后复核；generation-required/stale/retired 返回 unavailable，其他错误仍 reject。真实 libmpv.js + real native client deterministic regression 用 delayed resolver 保证 diagnostics 先于 beginGeneration，随后 fake CD2 HTTP hit、current-generation load 与 core-idle=false 通过，manager ownership 保持。targeted `19/19`、全量 `npm test 192/192`、syntax 与 diff check PASS；未修改 helper C++、controller/service、PlaybackManager、Session、Resolver、CD2 或 Pepper。

## 2026-09-17 — Formal runtime harness BrowserWindow ownership fix

Model Tier：1。Model：GPT-5.6 Sol High。Reason：根因与允许文件已经明确，修改只涉及 runtime test harness ownership、error evidence、fixture stage marker、纯 fake-window regression 和文档；production renderer、native helper、PlaybackManager、Session、Resolver、CD2、Electron runtime 与 Pepper 全部冻结。Escalated：no。

根因为 `tools/smoke-electron.cjs` 的全局 `browser-window-created` handler 把每个新窗口写入 `testWindow`，随后对 native-helper 合法创建的 sandboxed `data:` surface 注入 bare AMD `require(['pluginManager'])`。新增纯 helper 以 exact packaged index file identity 分类 application/auxiliary；只在 application `did-finish-load` 后启动一次 harness，owner 存活时拒绝覆盖，destroy 后才允许 replacement。分类 evidence 不保存完整 URL/query；hidden harness 对所有窗口显式保持 `alwaysOnTop=false`。renderer error evidence 增加 bounded name/message/stack/sourceURL/line/column、window class 与 pipeline stage，重要 executeJavaScript 均带 sourceURL。

验证：ownership targeted `6/6`，product-identity + ownership `10/10`，全量 `npm test 183/183`，JS syntax 与 `git diff --check` PASS。既有 `3f62efa` runtime 的提交前 hidden integration 证明 application owner/probe/pipeline 各 1、auxiliary 1、auxiliary injection 0，原 `require is not defined` 未复现；ordinary/STRM 两轮全部字段通过。最终 assertion 因独立 NextTrack `selected=false` 而失败，其余 NextTrack facts 为 true；按 stop boundary 未在本轮修改 fixture expectation 或 production NextTrack semantics。

## 2026-09-17 — Optional getStats property compatibility follow-up

Model Tier：2。Model：GPT-5.6 Sol High。Reason：虽然 production 修改集中在 Stats consumer，但诊断和验收必须区分 helper request correlation、generation ownership、optional telemetry 与 required playback/transport failure。Escalated：no。

开始时核验独立 worktree `E:\ETE-native-helper-bridge` 为 clean，分支、HEAD 与 remote 均为 `feat/native-helper-bridge@b17e6578ecd8ee6be71821e07380e1f87cd0f308`。复用该 HEAD 的正式 runtime，在 test-only runtime 副本中增加 128 条固定上限、仅含 property/error/requestId/generationId 的隐私安全 correlation；一次 hidden pipeline 即确认 generation 131、request 64 的 `chapter` 是 `getMediaStats()` 首个 `property-unavailable`，并停止诊断。证据未记录 URL、token、Authorization、command arguments 或媒体路径。

根因为 Media/Video/Audio Stats 已在渲染阶段把 null 作为字段缺失或默认值处理，但三个 per-category `Promise.all(getProperty)` 会在 native direct property rejection 时提前失败。修复新增 Stats 专用 `getOptionalStatsProperty()`，只把精确 `property-unavailable` 转为 `null`；transport/protocol/helper/generation 与未知错误继续 reject。未修改全局 `getProperty()`、native helper、PlaybackManager、Session、Resolver、CD2、MediaSource/PlaySession/Device/Product identity、NextTrack、remote control、Electron 或 Pepper。

验证：真实 AMD module/Player targeted `2/2`，覆盖 A/C available、B=`chapter` unavailable 后 aggregate resolve，map/array/number/boolean/INT64 string 保留，以及 `transport-closed` 不被吞掉；全量 `npm test 177/177`、相关 JavaScript syntax 与 `git diff --check` PASS。正式 source-commit build、三层 provenance、package verify、同一 hidden pipeline 与 REAL Emby 必须在本 follow-up commit 成为真实 HEAD 后执行。

## 2026-09-17 — Native helper nonfatal operation failure follow-up

Model Tier：2。Model：GPT-5.6 Sol High。Reason：修改点集中，但必须同时保持 native helper protocol-fatal 边界、generation ownership、transport lifecycle 与 upper submission semantics。Escalated：no。

开始时核验独立 worktree `E:\ETE-native-helper-bridge` 为 clean，`HEAD` 与 `origin/feat/native-helper-bridge` 均为 `a22426aafaafc9cd20b7c64f504f1857750ed83f`；原始调用链为 `mpv_set_property_string` 或同步 `mpv_command` 返回负值后抛异常，主循环把所有异常统一转换为 `protocol-error` 并 exit 20。审计确认 `mpv_get_property`、load 与 stop 已使用非致命 response error；`mpv_observe_property` 不属于本次指定调用集合，未扩大修改。

helper 新增 generation-scoped `operation-error` event，只包含 operation、allowlisted property 名、libmpv error code/string 与 `fatal=false`，不含 command arguments、URL、header 或 token。controller 对 schema/fatality/error bounds 做 fail-closed 校验，只接受 current generation，并在 64 条有界 history 中记录；operation failure 不进入 request mass rejection、helper recreate、surface teardown 或 generation retirement。submission-oriented `setProperty`/`sendCommand`、PlaybackManager、Session、Resolver、CD2、libmpv playback semantics、Electron 与 Pepper 均未修改。

验证：focused protocol `7/7`；`npm test 175/175`；dirty-source testing helper 使用固定 GCC/flags 与 `-Werror` 编译通过。隐藏 Electron fault-injection smoke 对真实 bundled libmpv 验证 set-property 与 command rejection 均为 typed nonfatal，同 PID/helperInstanceId/generation、transport open、protocol ready、后续 property request成功、`stdout-end=false`；独立 unsupported protocol version 仍观察到 `protocol-error`、exit 20。正式 source-commit build 与后续 pipeline 必须等获授权 commit 成为 HEAD 后重新执行，本段不预先声称其结果。

## 2026-09-17 — Production Native Helper Bridge implementation candidate

Model Tier：2。Model：GPT-5.6 Sol High。Reason：native helper、framed IPC、libmpv event attribution、Electron main/renderer、native HWND composition、crash/recreate 与 Git-blob build provenance 跨多个层级，同时必须冻结 PlaybackManager/Session/Resolver。Escalated：no。

开始时逐项核验 `origin/main=73eac9fa64c43804e9c5c53690ed087b2c5bb077`、`origin/fix/product-session-identity-v2=a16cdc72d9e8bc60284c759a126a3d77c33fa001`、`origin/spike/helper-native-pipe-integration=ff668aefd745023e0bd730df0b57d685d59d6dcb` 与 consolidation `4ff38123c2f1c3b058b68f66ca8ebb74db539f54`。新 worktree `E:\ETE-native-helper-bridge` 与分支 `feat/native-helper-bridge` 从 `a16cdc7` 创建；research worktree 只读，未 merge/cherry-pick research commit 或复制 experiment binary。

Phase A 静态审计确认 upper contract 可以由 adapter 保持，不需要修改 PlaybackManager、Session 或 Resolver。生产实现新增 `native/mpv-helper/ete-mpv-helper.cpp`，将研究阶段的 native attribution 与 Windows child HWND/gpu-next/D3D11 surface 合并；增加 MPV node map/array/scalar serialization、dynamic observation、UTF-8 framed JSON、bounded input/output、private inherited pipes、handshake 与 test-only fault hooks。Renderer endpoint 保持 postMessage/message logical shape；main service使用严格 command/property allowlist、固定 runtime paths、无 shell/public endpoint/TCP/localhost，并在 helper failure 时 fail closed。

实测中首先发现 child HWND 使用 `HWND_BOTTOM` 会被 video host 的 Chromium surface 覆盖；改为 helper child `HWND_TOP`，再由独立 transparent main BrowserWindow置顶，production build 的 screen capture 显示实际 H.264 test frame 与 HTML OSD 同时可见。另修复 smoke data URL 未编码 `#` 导致 CSS/OSD 被 fragment 截断的问题；失败 capture 保留为本地 ignored evidence，未误报通过。surface service 随 main move/resize/maximize/restore/fullscreen/minimize/close 管理 video host，main 关闭会销毁 helper，避免额外 BrowserWindow 阻止 `window-all-closed`。

验证：`npm test 173/173`；Node/PowerShell syntax PASS。生产源码 helper 两次带 `--no-insert-timestamp` 编译 SHA256 相同；checkout build hash为 `29ef57275443c49d7685c57518b91eca0152c20ed25fda21dd42c7a554c4cb2f`，但不是正式 source-commit artifact。真实 Electron 18 smoke 得到 Electron 18.3.15 / Chromium 100.0.4896.160 / Node 16.13.2、helper handshake 1.0.0、libmpv `mpv v0.41.0-920-gdd5d17d32` / API 2.5；`gpu-next`、D3D11、d3d11va、native HWND、structured video params、Pause/Unpause/Seek/Stop PASS，load-to-playing 单次约 475ms，仅作本机 telemetry。

竞态与 lifecycle：rapid A→B 20/20、A→B→C 20/20、Stop during load 20/20、helper access-violation + recreate 20/20，accepted stale events 0；pending request 在 crash 时 exactly-once `HELPER_DIED`。强制终止 exact Electron parent 后 helper 5 秒内 pipe EOF 退出，residual 0。pressure test 提交 20,000 property updates，coalesced 19,718，native output peak 3 frames/869 bytes；1 MiB stderr 全量读取、retained 4 KiB；partial frame PASS，zero/oversized/invalid UTF-8/malformed JSON/unsupported version、malformed helper output 和 pipe close 均 fail closed。DirectUrl file-local UA A/B/C 分别观测 `ETE-A/1.0`、`ETE-B/1.0`、`libmpv`。最终 production-source helper 的 10+ minute run 到达 `time-pos=603.2s`，helper PID/transport稳定、stale=0；21 个 working-set sample 峰值 107,806,720 bytes，首尾增长 794,624 bytes。

代码复核后又关闭了普通 load failure 丢失 H1 引用、旧 renderer endpoint 操作 replacement、destroy-during-handshake、required capability 未校验、optional subtitle metadata、HWND cross-thread access、structured INT64 精度、quarantine bytes/depth 与 compiler/linker provenance 等问题。真实缺失媒体产生一次 `load-failed`，service 保持同一 helper ready，随后有效媒体恢复且 recreateCount=0；stale endpoint 的 retire/destroy 被拒绝。第二轮 review 发现首次 create 的 DOM/promise race 与 delayed subtitle rejection；现已用单一 `mediaElementPromise`、creation epoch、失败 cleanup/retry 和 optional rejection handling 修复，新增并发首次 Play、handshake failure retry 与 native readiness observer 回归。

构建新增 pinned official `client.h` prepare、Git-blob source materializer、native helper compiler/staging 与 `native-helper-provenance.json` validation；installer 继续递归包含 runtime，无需 architecture 改动。一次性 `.work` Git fixture 暴露并修正了 PowerShell include argument 被错误拼成单个参数的问题；修正后从 fixture commit Git blob 连续构建两次，provenance 均 PASS，helper SHA256 均为 `29ef57275443c49d7685c57518b91eca0152c20ed25fda21dd42c7a554c4cb2f`。build contract 还会拒绝 manifest/build/materializer/validator/contract/tracked-hash generator 与 HEAD 不一致。当前没有 commit/push 授权，因此真实分支 build 仍无法把未提交实现作为合法 `sourceCommit` 输入；未执行正式 full runtime/package/installer 或 REAL Emby。Model/automation evidence 不替代这些 gate。

## 2026-09-17 — Production application identity parity

Model Tier：2。Model：GPT-5.6 Sol High。Reason：修改虽小，但必须核对正式 Electron startup、acceptance harness、`loadStartInfo`、BrowserWindow、ConnectionManager 与既有 persistent DeviceId 的初始化边界。Escalated：no。

先核验 `origin/main=73eac9fa64c43804e9c5c53690ed087b2c5bb077`，并在独立 worktree 的 `fix/product-session-identity-v2` 上审计旧 reference `8eb50624c03acbf42229bac1bfebd07041f7ed6f`。当前 base 的正式 `main.js` 没有设置 application name，`loadStartInfo()` 却使用 `app.name`；acceptance 则自行使用 `metadata.productName || metadata.name`，因此旧 production gap 仍存在。旧测试中的 hostname DeviceId 断言已不适用于当前 main 的 persistent UUID baseline，未原样复刻。

新增小型 `product-identity.js`，集中实现 runtime `productName || name` 与 `app.setName()`；正式 startup 和 acceptance 均调用该 helper，不再保留两套 fallback。正式调用位于 bootstrap、persistent DeviceId、`loadStartInfo()` 与 `BrowserWindow` 之前，之后仍由 `loadStartInfo.name = app.name` 进入既有 apphost/ConnectionManager client identity 链。DeviceId 继续从 Enhanced config 的 `device-identity.json` 读取或生成，`deviceName` 继续使用 hostname。

验证：product identity 专项 `4/4`；修改的 JS/CJS `node --check` 全部通过。安装锁定依赖后全量 `npm test` 为 `144/152`；8 项失败均为 `ENOENT` 或显式 missing-base，源于 clean worktree 不含 `vendor/carnival/electronapp/www` 与 prepared `src/electronapp/preload.js`，归类为 `ENVIRONMENT_INPUT_MISSING`，真实代码失败为 0。缺少这些 private/ignored input 且不存在当前分支 runtime，因此未运行 build 或 Electron smoke，也未用代码规避测试。本轮未修改 PlaybackManager、Session/PlaySessionId、MediaSourceId、WebSocket、reports、Resolver、CD2、libmpv、Electron、依赖或安装器，未开始 Bridge Adapter。

## 2026-09-16 — Bind tracked runtime sources to Git blobs

Model Tier：1。Model：GPT-5 Codex（current session）。Reason：远程审核已明确 blocker、允许文件、输入输出与验收标准；修改限定为 build source acquisition、runtime provenance 和回归测试。Escalated：no。

旧 Phase 1 build 用 `git ls-files` 限定 path 集，但 `Copy-Item` 仍读取工作树 bytes；runtime provenance 同样 hash 工作树文件。因此 dirty tracked source 或不同 `core.autocrlf` checkout 可以在 `sourceCommit` 不变时改变 runtime。新增 `copy-tracked-product-sources.cjs`，从一次解析的 `sourceCommit` 以 `git ls-tree -r -z --full-tree` 枚举 regular `100644/100755 blob`，用 `git cat-file blob` 读取 Buffer 并写入 runtime。binary 不 decode，路径与 object type fail closed。

runtime provenance 的普通 source relation 改为 `git-blob-copy`，记录 commit/mode/object ID/blob SHA256/runtime SHA256；scope 标记 `git-commit-blobs` 并绑定 acquisition generator。prepared preload、Web overlay、PlaybackManager/package overlay、source provenance 与 build manifest 分层保持不变。

验证：新增 dirty tracked 与 LF/CRLF 两项回归，全量 `npm test 152/152`；实际 dirty `splash.html` build 中 worktree hash 与 HEAD blob 不同，runtime/provenance 仍等于 HEAD blob，package verify PASS。normal 与全新 detached worktree 均 build/provenance/package verify PASS，实际 2,131 files 对比 `missing=0`、`extra=0`、`mismatch=0`。没有修改产品代码、Electron、Pepper bridge、Resolver、UI、Session、WebSocket 或播放链。

## 2026-09-16 — Phase 1 reproducible build cleanup

Model Tier：2。Model：GPT-5 Codex（current session）。Reason：任务跨 build assembly、ignored Web snapshot、prepared source、provenance、dependency closure、package verify 和双 worktree 字节比对，但明确冻结产品播放、Session 与 Electron/bridge/libmpv 行为。Escalated：no。

基线核验为 `origin/main=2c668eed87379eafec2e1a25f6b46f6b1dbf5ec6`，在独立分支 `chore/reproducible-build-phase1` 与隔离 worktree 执行。完整审计确认 `build.ps1` 的递归 source copy 会吸收 ignored physical snapshot；开发机与 Carnival 差异集中在 prepared preload、`app.js`、`apiclient.js`、`toast.css`。preload 已有 generator contract；后三项分别存在未显式复制 patch payload或 app 双输出。测试还发现 `playerstats.js` 直接读取 ignored snapshot，DeviceId chain test 优先读取 ignored Web。

实现将 source copy 限定为 Git tracked `src/electronapp`，preload 单独生成复制；新增 fail-fast `prepare-web-overlays.cjs`，把两份 manifest-locked client payload 与 app canonical transform 固化为唯一输出。`prepare.ps1 -ArchiveRoot` 允许 clean worktree 直接消费经 hash 核验的外部 archive。双 worktree 首次对比发现 Windows LF/CRLF 会改变 generator worktree SHA，随后增加 canonical Git blob identity 与 HEAD 内容 guard；输出目录名也从 final payload identity 中移除。

provenance 拆分为 source、runtime 与 final payload 三层。source 层记录 archive/baseline、Web tree/overlay、Electron 18.3.15、Pepper bridge、libmpv 和 33-package dependency closure；runtime 层记录 67 个 Git tracked product source、prepared preload、PlaybackManager/package overlay；build manifest schema 2 记录 2,130 个 payload 条目、两份 provenance binding 与 payload-set digest。package verify 现在拒绝 duplicate/invalid path，做 expected/actual 双向集合、逐文件 hash 与 binding/digest 校验。

验证：正常与 fresh detached worktree 均 `npm test 150/150`、build PASS、source provenance PASS、runtime provenance PASS、package verify PASS。两边实际 2,131 files 逐路径 SHA256：`missing=0`、`extra=0`、`mismatch=0`；payload-set SHA256 均为 `b5578003078484399930d0b1d613680d0c91178395406307b6028bb79eba4c96`。JS/CJS syntax 81 files PASS，PowerShell syntax PASS，`git diff --check` PASS。未编译 installer、未运行真实客户端或安装流程；installer container 确定性、third-party source build 与公开再分发许可仍不在本次通过范围。

## 2026-09-16 — CD2 budget and Native fallback Toast REAL acceptance

Model Tier：1。Reason：本轮仅收录用户完成的 Windows candidate REAL acceptance，不修改产品代码、测试或配置。Escalated：no。

在已验收实现 `9c9ec3871699d26157a4e29a52bf9198c8e03748` 上完成 candidate 验收。Artifact 为 `EmbyTheaterEnhanced-0.1.1-cd2-toast-candidate-9c9ec38-setup.exe`，大小 `125,182,889` bytes，SHA256 为 `3c2c136610d2d2cb8e53f8636db7af3a4e5dc0f7333254b5fb6408150e2c6d69`；Build、Provenance、Package verify 与 Installer verify 均通过，`missing=0`、`extra=0`、`mismatch=0`。

Windows REAL 1：一次真实 candidate 播放中，client ready 约 `7ms`、`FindFileByPath` 约 `9ms`，Direct `GetDownloadUrlPath` 从 elapsed `≈16ms` 到 `≈352ms`，RPC 约 `336ms`，在当前 `500ms` download contract 下得到 `direct_url_hit`、CD2 HIT、`route=direct-url` 与 `core-playing PASS`。该证据证明旧 `300ms` deadline 会误杀此环境中的正常约 `300ms+` 响应；不表述为所有环境的最终最优值。

Windows REAL 2：使用故意错误的更具体 STRM mapping，使 Direct 与 Same-Origin 均 `not_found`、Mount `mount_missing`，最终得到 `route=native`、`reason=native_fallback`、`fallback=true`，并通过 `core-playing`。用户实际观察到原生 Toast 文案“增强播放源不可用，已回退 Emby 原生播放”，同一次播放仅显示一次；Emby Playback Stats 显示播放源为 Emby 原生、STRM 为是、CD2 与 Mount 为未命中、Fallback 为是。因此 STRM Enhanced all-fail → Native、Native fallback Toast 与 Stats semantics 均为 REAL PASS。

错误 mapping 仅存在于用户本地测试配置，未写入仓库。当前 `500ms` Direct/Same-Origin download、`1200ms` Resolver total、`500ms` Same-Origin reserve 与 Native fallback Toast 均具备进入 main 的 REAL acceptance 证据；本轮不开始下一阶段 bridge 工作。

## 2026-09-16 — CD2 download budget relaxation

Model Tier：2。Reason：真实 Windows telemetry 指向 CD2 download stage 的 deadline 长尾，且 Resolver/main service 必须共享同一个 absolute deadline contract；不改变 resolver precedence、source identity、PlaybackManager ownership、Session、WebSocket 或播放器生命周期。Escalated：no。

基于正式 `main@1dd9bb20e19c3cf86ce62bef7aac33aaa89f1885` 创建 `fix/cd2-budget-native-fallback-toast`。真实成功样本显示 `client-ready≈6ms`、`FindFileByPath≈8ms`、`GetDownloadUrlPath≈133ms`；另一真实样本的 download 约 `302ms` 在旧 `300ms` deadline 下超时，随后 Mount 与 `core-playing` 仍通过。由此确认旧 download budget 偏紧，readiness 不是根因。

本 commit 将 Resolver overall budget 从 `750ms` 调整为 `1200ms`；main CD2 service 的 Direct 与 Same-Origin `GetDownloadUrlPath` 均从 `300ms` 调整为 `500ms`，Direct 仍为 Same-Origin 保留 `500ms`，CONNECT/readiness `200ms` 与 Find `350ms` 保持不变。所有阶段继续受 shared absolute deadline 限制，未取消硬上限；persistent config runtime default 同步为 `1200ms`。

本次修正旧 one-third cap 导致默认 runtime 实际仅保留 `400ms` 的实现偏差。

新增 fake-clock/controlled-timer 回归覆盖 320ms Direct 成功、Direct timeout → Same-Origin 320ms 成功、超过 500ms 仍 timeout，以及 Resolver 向每个 CD2 stage 传递同一 `1200ms` deadline。验证：CD2/Resolver targeted `76/76`，全量 `npm test` `140/140`。未生成 installer candidate，未执行真实客户端播放。

## 2026-09-16 — STRM native fallback Toast

Model Tier：2。Reason：通知触发点必须与 libmpv 当前 playback request、Resolver 最终 route/reason、stop/destroy 和 supersede 生命周期一致；实现只复用现有 Emby Web runtime，不改变播放 source、Stats、Session 或 PlaybackManager ownership。Escalated：no。

审计 prepared/Carnival Web runtime：`src/electronapp/www/modules/toast/toast.js` 是现有原生 AMD Toast 模块，`common/input/api.js` 的 `DisplayMessage` 已通过 `require(["toast"], ...)` 使用它。当前模块接受字符串/选项对象，但不读取 `timeoutMs`；其原生动画/回收默认约 3.3 秒，因此沿用默认时长，不增加 HTML overlay、CSS、动画或通知框架。

`libmpv.playInternal` 在最终 `resolver-result` 已确定后，仅当当前 request 已确认 STRM 且结果为 `route=native`、`reason=native_fallback` 时异步请求原生 Toast。每个 request 有独立幂等标记；加载回调再次检查 current request，新的 Play/NextTrack、stop 或 destroy 会使旧回调失效。Toast module 缺失、API 不存在、throw 或 reject 均 fail-open，不影响原生 `loadfile`、Session、上报和 playback error；现有 Stats contract 未改。

新增 Toast/playback lifecycle targeted `4/4`，覆盖 DirectUrl/CD2 HTTP/Mount/普通 Native、resolver_disabled/no_matching_rule/transcode_skip/invalid_context、最终 native fallback、supersede、stop/destroy、重复 loader callback 和 fail-open。全量 `npm test` `144/144` 通过；未生成 installer candidate，未执行真实客户端播放。

## 2026-09-16 — Stats 未尝试阶段展示语义

本轮只修正 `playback-route-stats.js` 的用户态文本：空 CD2 reason 与 `not_attempted` 统一显示“未使用”，保留 timeout“超时”、miss/not_found“未命中”及 DirectUrl/CD2 HTTP“命中”。新增 Mount-first → Mount hit → CD2 未使用回归；Resolver/CD2/Mount 行为与 timeout/budget 未改。targeted `4/4`、全量 `npm test` `136/136`、JS syntax 与 `git diff --check` 通过。

## 2026-09-16 — Diagnostics run correlation and native Stats source

Model Tier：2。Reason：导出关联涉及跨 run 事件边界，Stats 状态必须与 libmpv request generation、supersede、stop/destroy 生命周期严格一致；未改变 PlaybackManager、Session、WebSocket、resolver source selection 或 timeout。Escalated：no。

`diagnostics.buildDiagnosticReport()` 现在从最新 `resolver/route-selected` 反向定位最近 `app/start`，并以该 app run 的数组边界加 request id 关联 CD2、Mount、core-playing 与 playback error。不存在 run boundary 时不回退到全量同 request id 查询，保守显示 `UNKNOWN`。新增重复 request id 跨 run、同 run Direct → Same-Origin → Mount、同 run 多 request 三个回归。

审计 prepared `playerstats.js` 证实 `player.getStats().categories` 无过滤加入面板，只有 audio/video type 会替换标题；因此 `libmpv.getStats()` 追加显式命名的 `enhanced` category，不修改 Emby Web UI。新增 instance-local `playback-route-stats`，只保存 request/route/isStrm/reason/sourceKind/ruleId/CD2 结果等安全枚举，绝不保存 source、路径、URL、token 或 headers。新播放先清空，resolver 仅在 current request 校验后提交，stop/destroy 同样清空；普通非 STRM 显示 Emby 原生与 STRM 否。Media/Video/Audio 顺序和值保持不变。

验证：diagnostics + route Stats targeted `20/20`，全量 `npm test` `136/136`，consumer contract test、JavaScript syntax 与 `git diff --check` 通过。`tests/pipeline-browser.js` 同步扩展为在实际 libmpv player 上读取 Stats category；从本提交构建的 2,129 文件隔离 runtime 已串行通过 DirectUrl、CD2 HTTP、CD2 miss → Mount、native fallback 四条 pipeline，均保持 source identity、控制与 19 条模拟报告。未构建 candidate、未运行真实 Emby 播放，CD2 timeout/budget 未改变。

## 2026-09-16 — CD2 REAL PLAYBACK TIMEOUT audit and timing

Model Tier：2。Reason：真实 STRM 播放已验证 identity recovery、resolver participation、Mount route 与 core-playing；本轮只定位 CD2 gRPC lifecycle/deadline，不改变 PlaybackManager、Session、WebSocket、Mount 或 timeout 数值。Escalated：no。

审计确认 `DEFAULT_TOTAL_BUDGET_MS=750` 仍不变。persistent resolver 在 renderer 创建一次 750ms absolute deadline；main service 对每个 mode 取不超过该 deadline 的上限，`waitForReady` 最多 200ms，`FindFileByPath` 为从该 mode 开始计的 350ms absolute deadline，`GetDownloadUrlPath` 最多 300ms；DirectUrl 另为 same-origin 预留最多 200ms。现有约 319ms / 312ms 仅是整次 CD2 mode 的 aggregate elapsed，不能仅凭旧日志判定具体 RPC；它们更接近 300ms download budget 加调度开销，但也可能是 readiness 消耗后的 Find deadline，必须以新阶段事件确认。

main process 继续持有单一 lazy transport/gRPC client；创建 service 时仅预载 transport，首次播放仍可能在 `waitForReady` 发生连接冷启动。Direct 的下载阶段 miss 会保存 mode session，随后 same-origin 复用同一 client/channel 与 Find result；若 Direct 在 readiness 或 Find 阶段失败，same-origin 仍会重新执行 readiness/Find，但不会新建 client/channel。设置页“测试映射”的 `mapped` 只做纯 prefix replacement；“测试连接”创建并关闭临时 service，执行 1.5s ready 加 500ms `FindFileByPath('/')`，两者都不证明实际媒体下载链。

新增 CD2-only timing 事件 `resolve-start`、`client-ready`、`find-file-start/end`、`download-url-start/end`、`resolve-hit/miss`。新增阶段事件仅记录 mode 和 elapsedMs，不记录 Path、URL、token 或 RPC 参数。persistent config 线路在 CD2 direct/same-origin miss 后由 Mount 命中时，现在保留最近一次 `cd2Reason` 作为 route diagnostics metadata；route/source selection 保持不变。

验证：CD2/STRM targeted `72/72`，全量 `npm test` `129/129`，相关 JavaScript syntax 与 `git diff --check` 通过。未构建、打包、生成 candidate 或执行新的真实客户端播放；下一次真实日志应使用阶段事件判定卡在 readiness、Find 还是 download 后，再决定是否需要产品层 budget 调整。

## 2026-09-16 — Client Diagnostics v1

Model Tier：2。Reason：任务跨 main-process logger/IPC、renderer/libmpv resolver 观测、CD2/Mount 事件和设置页，但明确禁止改变播放、Session、WebSocket 与 fallback contract。Escalated：no。

从最新 `origin/main@aad4a0ddfd489cf0a9e3bf1f9b7af147d9376f38` 创建 `feat/client-diagnostics-log`。新增 `enhanced/diagnostics.js` 的统一 structured JSONL logger、2 MiB/3 层轮转、递归 sanitizer、路径/主机/设备哈希、畸形行容错和 TXT report builder；新增可信 `diagnostics-ipc.js` 处理状态、Electron save dialog 导出、打开目录和二次确认后的精确日志清空。日志根目录沿用 ETE bootstrap profile，正常运行路径为 `%APPDATA%\EmbyTheaterEnhanced\logs`。

`main.js` 记录 app start/shutdown、版本/provenance/mpv 配置摘要，并把 CD2 service 接入 fail-open observability callback。`strm-resolver.js` 增加纯 route mapping；`libmpv.js` 记录 play request、resolver complete、route-selected、loadfile-requested、core-playing、pause/resume、seek、stop、error 及可自然获得的 next；CD2 记录 bounded resolve start/hit/miss/error/cancelled，Mount 记录 candidate count、reason、localExists 与 mappedPathHash。未修改 resolver precedence、source selection、timeout、Session、WebSocket、DeviceId、reporting、NextTrack 或既有 vendor Web UI。

新增设置页 `mpvplayer/diagnostics.html/js/css`，只显示安全的简化目录说明；生成式 preload 只增加 path hash helper，不携带 token。更新 `docs/CLIENT_DIAGNOSTICS.md`、DECISIONS 与 libmpv runtime 说明。测试覆盖 Authorization/Bearer、X-Emby-Token、api key、Cookie、password、URL query、Windows/UNC/POSIX path、circular/undefined/null/huge Error、目录/追加/轮转失败、malformed JSONL、四 route、CD2 telemetry 和 trusted IPC。

验证：本轮 targeted diagnostics/preload `15/15`，全量 `npm test` `123/123`；相关 JavaScript syntax 与 `git diff --check` 已通过。真实 Windows route 播放、TXT 导出、AI 判读、Session/remote observability 保持 `MANUAL ACCEPTANCE REQUIRED` 或 `DEFERRED OBSERVABILITY`，不以 synthetic 证据替代。

## 2026-09-16 — Resolver runtime context diagnostics

在现有 `feat/client-diagnostics-log` 上继续增加一次最小 context 观测，不修 Resolver。`libmpv.playInternal` 在 `strmResolver.isStrm/resolveAsync` 前记录 `resolver/context-observed`，包括字段存在性、类型、扩展名、STRM 后缀、Container、协议、播放方法、媒体类型和 direct/transcode URL 存在性；若结果仍为 `invalid_context`，追加 `resolver/invalid-context` 与确定的 `missingFields`。路径和 URL 不进入该事件，原 sanitizer 和日志架构保持不变。

新增 `strm-resolver.js` 纯诊断 helper `describeContext/diagnoseContext`，覆盖完整 context、缺 item.Path、缺 MediaSource.Path、缺 native source、Container=strm、`.strm` 和 DirectStream；回归同时断言 Resolver 原返回值不变。真实 DirectStream 的 item/media source/Container 是否被 Emby 改写，需从新 candidate 的 context event 取证，不根据猜测修改产品逻辑。

## 2026-09-16 — STRM identity recovery from Emby metadata

真实取证显示 DirectStream 进入 `libmpv.playInternal` 时 `item.Path` 缺失，而 `MediaSource.Path` 已是实际 `.mkv`、Container 为 `mkv`。本轮只修复 STRM identity 输入：当 item/server identity 充分时，调用当前 runtime 已有的 `connectionManager.getApiClient(serverId)` 与 `apiClient.getItem(userId, itemId, {Fields:'Path'}, signal)`，每次播放最多一次并受当前 AbortSignal 与 750ms recovery timeout 约束。

返回 `.strm` Path 才补 `resolverContext.sidecarPath`，`sourcePath` 和 `nativeSource` 不变；普通 metadata `.mkv` 不会被识别为 STRM，也没有引入 `DirectStream + file + mkv` heuristic。失败、无 ApiClient、超时和 superseded 均 fail-open，late metadata 结果不能污染新 request。context event 记录 `strmIdentitySource`、`metadataRecoveryAttempted`、`metadataRecoverySucceeded` 和 `recoveredPathEndsWithStrm`，不记录原始 Path/URL。

## 2026-09-16 — Client Diagnostics IPC wiring follow-up

复核 `911c19e` 后发现 structured client event 与旧 mpv snapshot 共用 `enhanced-diagnostics`，main handler 会把 resolver/playback 事件转换为 `mpv/snapshot`。本次在现有分支继续修复，没有新建分支、PR 或 merge：`diagnostics-ipc.js` 新增 trusted `CHANNELS.LOG = enhanced-diagnostics-log` listener，直接交给 logger 并吞掉 Promise rejection；unregister 使用 `removeListener`。旧 `enhanced-diagnostics` snapshot handler 保持不变，`libmpv.js` structured event 改发新 channel。

同时将 Mount `resolve-start` 调整为 `info`，`routeForResult` 收紧为 `type=local && reason=mount_hit`；CD2 wrapper 的 unexpected exception telemetry 使用明确 `status=error`/`reason=unexpected_exception`，不改变原有 miss、timeout 或 fallback 返回值。

新增 wiring regression：renderer structured `resolver/route-selected(route=cd2-http)` → IPC listener → JSONL → `exportReport`，确认持久化仍是 resolver event、导出为 `Last STRM Route: CD2 HTTP`，不会变成 `mpv/snapshot`；同时确认旧 snapshot sanitizer 通路和 listener 卸载边界。验证：targeted diagnostics/preload `12/12`，全量 `npm test` `120/120`，相关 JS syntax 与 `git diff --check` 通过。构建、provenance、package 和 candidate installer 将绑定本次修复后的最终 HEAD。

## 2026-09-15 — Stable Enhanced DeviceId

Model Tier：2。Reason：真实服务器 A/B 已证明 OLD 的 hostname DeviceId 对应服务器状态不可远控，而仅换用独立 DeviceId 后同一 OLD runtime 可远控；本轮只实现持久化 DeviceId，不改 capability、ApiClient、WebSocket 或播放链。Escalated：no。

分支 `fix/stable-enhanced-device-id` 从 `origin/main@780aaed8ddc5bde42654e56e7635379f29f9e485` 创建，没有带入 `fix/product-session-identity`。main process 使用既有 ETE bootstrap config 目录中的 `device-identity.json` 作为持久化边界，首次运行生成 UUID v4，后续启动读取同一值；损坏/缺失时使用同目录临时文件、fsync 和 rename 重建。`deviceName` 仍为 hostname，旧 hostname DeviceId 不迁移。

新增 `src/electronapp/device-identity.js` 与 `tests/device-identity.test.cjs`，覆盖首次生成、同 profile 稳定、clean profile 隔离、hostname 分离、损坏重建、randomBytes fallback、启动顺序、HTTP/WS identity 链和无 token/user/server 依赖。验证：targeted 9/9，`npm test` 110/110，相关 JavaScript syntax 与 `git diff --check` 通过。提交后的 source build、runtime provenance、package verify 和 candidate installer 均通过；正式安装后的 REAL acceptance 见下方收尾记录。

## 2026-09-15 — Stable Enhanced DeviceId REAL acceptance closure

Model Tier：1。Reason：本条仅收录用户完成的正式 Windows candidate 安装、播放、远控与重启稳定性验收，不修改产品代码或测试。Escalated：no。

候选安装包：`EmbyTheaterEnhanced-0.1.1-stable-device-id-candidate-aba1145-setup.exe`；SHA256：`B3D57CBC1E50DD5EEBAA5E5563D8C83831BC3959AEE76D1E99A00845E6F8E51F`。验收分支为 `fix/stable-enhanced-device-id`，代码 HEAD 为 `aba114552e181afad011ff56eef1083ca39ddeea`。

REAL acceptance 全部通过：STRM playback、next episode、playback progress reporting、Dashboard remote-control buttons、`SupportsRemoteControl`、WebSocket、DeviceId 与 hostname 分离、DeviceId 重启稳定性均为 `PASS`。第一次 ETE DeviceId hash 为 `065ce40875be5fbb`，第二次仍为 `065ce40875be5fbb`；hostname-derived DeviceId hash 为 `104ab9213e28e4ff`。当前真实 Session 的 `NowPlayingItem` 存在，PositionTicks 持续增加，`SupportsMediaControl=true`，WebSocket 为 `OPEN`。

本轮没有直接捕获 `Sessions/Capabilities/Full` 的 HTTP status，因此不记录或推断为 `204 PASS`；`SupportsMediaControl=true` 仅按当前真实 capability 状态与服务器远控行为记录。该修复验证的是 ETE 独立、持久化 DeviceId。此前 OLD runtime 的控制变量 A/B 已证明，在相同 runtime、token 和 UserId 下，原 DeviceId 为 `remote=false`，仅改变 DeviceId 后为 `remote=true`。本记录不把历史每一次 `SupportsRemoteControl=false` 宣称为已完全还原，`fix/product-session-identity` 也不属于本修复。

## 2026-09-15 — Direct app launch 真实安装验收收尾

Model Tier：1。Reason：本轮仅记录用户完成的 Windows 真实安装后四入口手工验收并创建 PR，不修改产品代码，不重新 build/package/test/smoke。Escalated：no。

原候选验收记录为 `NON-BLOCKING FAIL — launcher UX`，问题是 `PowerShell wrapper caused visible console flash and startup delay`。用户已确认新候选四种真实入口全部通过：installer post-install Launch、desktop shortcut、Start Menu shortcut、直接 `Emby.Theater.exe` 均为 `REAL PASS`；四入口均无命令窗口闪烁，启动体验正常，既有 Emby 登录状态保留。

本项结论更新为 `REAL PASS — direct app launch`。Daily-use Candidate 整体不升级为最终 `READY`；其他 playback、STRM、audio、subtitle、NextTrack 和 endurance 项目仍按原有 REAL/SYNTHETIC/NOT COVERED 证据记录。保留 code/package HEAD `b16273c71de5e671f1c38e4b355edb72382ec137` 的代码、build/provenance/package/integrity 证据；后续 `8bb79341490aaba3404db2a6411510d66a7b8bef` 及本轮文档修正均为 docs-only，不改变 artifact 内容；hidden Electron smoke 未重跑。

## 2026-09-15 — Direct app launch Daily-use Candidate 修复

Model Tier：1。Reason：范围限定为 Electron main-process bootstrap、installer direct entry、runtime copy/provenance 和启动 UX 验证，不触碰播放链或 Session 生命周期。Escalated：no。

原 `4761a2440e9ab1df0b3c6d01765f26f9560d9bea` Daily-use Candidate 的启动验收记录为 `NON-BLOCKING FAIL — launcher UX`，原因是 `PowerShell wrapper caused visible console flash and startup delay`。本分支 `fix/direct-app-launch` 将开始菜单、桌面快捷方式和 `[Run]` 入口统一改为直接启动 `{app}\Emby.Theater.exe`。

新增 `src/electronapp/enhanced/bootstrap.js`，由 main process 在窗口创建前按实际 packaged layout `{runtime}\electronapp\main.js` → `{runtime}\config\system.xml` 执行幂等初始化：创建 `%APPDATA%\EmbyTheaterEnhanced\config` 与 `cec-driver`，只为缺失的 `system.xml` seed，为缺失的 `cec-driver\cancel` 创建空文件；既有用户文件保持原样。`ProgramDataPath` 未改，未引入外部进程。`Start-Enhanced.ps1/.cmd` 保留为源码工具，但不再由 `tools/build.ps1` 复制进正式 runtime，provenance scope 同步移除 wrapper entries。

验证：bootstrap/installer targeted 3/3；相关 targeted 合并检查 5/5；全量 `npm test` 101/101；68 个 JavaScript/CJS syntax、11 个 PowerShell syntax、`git diff --check` 通过。候选 runtime/package 路径固定，code/package HEAD `b16273c71de5e671f1c38e4b355edb72382ec137` 的 source build、provenance、package verify 和 Inno payload integrity 均通过；runtime 实际 2,123 文件、payload entries 2,122，解包 `{app}` 2,123 文件 missing/extra/hash mismatch=0，legacy launcher=0，packaged bootstrap seed/preserve 隔离检查通过。后续 docs-only commit 不要求重新 build/package/test。真实安装后的桌面、开始菜单、安装完成 Launch 和直接 exe 四入口已记录为 `REAL PASS`，但整体 Daily-use Candidate 仍不写最终 `READY`。

## 2026-09-15 — Daily-use Candidate 验证与打包准备

Model Tier：1。Reason：范围限定为最新 `origin/main` 的 baseline verification、runtime/package preparation 和 acceptance matrix；不改变产品行为。Escalated：no。

fetch 后确认 `main == origin/main == 4761a2440e9ab1df0b3c6d01765f26f9560d9bea`。快进前工作树 clean，无 unexpected local patch。按既有工具链从当前 HEAD 构建 `dist/EmbyTheaterEnhanced-0.1.1-daily-use-candidate-4761a24`，Build 完成，runtime 实际 2,124 文件，provenance 通过（source commit 精确匹配、785 scope entries、3/3 build overlays、1/1 prepared artifact）。

验证结果：STRM/settings targeted 21/21；`npm test` 98/98；66 个 JS/CJS `node --check`；11 个 PowerShell parser checks；`git diff --check`；`tools/package.ps1 -VerifyOnly` 通过。使用现有项目内 Inno compiler 在独立 staging 目录生成 setup，再复制为候选文件名 `dist/EmbyTheaterEnhanced-0.1.1-daily-use-candidate-4761a24-setup.exe`，大小 125,175,083 bytes，SHA256 `f3088aa87a5fd78f6395b926ccbbf6e16b67bb8085f648625a7949c2b3d5a72a`。innounp integrity test 通过；解包 `{app}` 2,124 文件与 runtime 逐文件 hash 对齐，missing/extra/mismatch 均为 0。没有覆盖旧 0.1.1 setup。

Acceptance matrix 已建立于 `docs/DAILY_USE_CANDIDATE.md`。A/C/F 的当前证据为 synthetic；B/D/E 复用已标注 source HEAD 的历史真实证据，未冒充 `4761…` 当前候选实测。历史 final-head hidden Electron smoke 按要求未重跑，继续记录 `NOT COMPLETED — hidden Electron smoke timeout`；真实 settings UI、真实 Mount、当前候选完整 Emby playback、轨道操作和 endurance 留给手动 checklist。本轮不提交、不推送、不创建 PR、release 或 tag。

## 2026-09-15 — Fix ETE_CD2_ENABLED legacy migration

在 `bootstrapLegacy()` 中修复 legacy 开关映射：`ETE_CD2_ENABLED` 现在只迁移为 `config.cd2.enabled`，bootstrap 时 top-level `config.enabled` 始终为 `true`。因此旧环境 `ETE_CD2_ENABLED=0` 只关闭 CloudDrive2 service，STRM resolver 仍保持启用并可在 CD2 disabled/miss 后进入 Mount → Native；`ETE_CD2_ENABLED=1` 同时得到 global resolver enabled 与 CD2 enabled。新设置页保存的 top-level `enabled` 语义和 persistent USER 配置优先级保持不变，resolver stage architecture 未修改。

新增 regression test 覆盖 `ETE_CD2_ENABLED=0`、有效 source/mount mapping、CD2 disabled 后 Mount 命中和不返回 `resolver_disabled`；既有 `ETE_CD2_ENABLED=1` 测试同时确认 global resolver 与 CD2 均启用。Node targeted tests 21/21、`npm test` 98/98、JavaScript syntax 和 `git diff --check` 通过。最终 HEAD 的 build、runtime provenance 和 package verify 通过；Final-head synthetic runtime smoke 记录为 `NOT COMPLETED — hidden Electron smoke timeout`，本轮未重新运行或重试。REAL settings UI 继续记录为 `NOT COVERED — native window automation unavailable`，真实服务器 cloud-first/mount-first playback 继续 NOT COVERED。

## 2026-09-15 — Fix STRM rule-selection identity precedence

在 `feat/strm-resolver-settings@2956267` 上修复 `selectRule()`：可识别的绝对 `sourcePath` 现在独占 longest-prefix match；source 没有命中时直接返回 null，不再由更长的 `Item.Path` sidecar rule 接管。只有 HTTP/非绝对 source path 才使用 sidecar identity fallback。Windows/UNC case-insensitive、POSIX case-sensitive 和目录边界保持不变。

新增 A/B/C regression tests，分别覆盖 source 命中优先、有效 source 无命中禁止 sidecar 接管、HTTP source 允许 sidecar fallback。未修改 PlaybackManager、Session、libmpv ownership、CD2 service 架构或配置 schema。

验证：settings targeted 20/20；`npm test` 97/97；相关 JS syntax 与 `git diff --check` 通过；最终 HEAD 的 build、runtime provenance 和 package verify 通过。较早候选 HEAD `295626753089de9f70c2cb28b5c5954be51b3843` 的 synthetic runtime pipeline PASS 证据继续保留，包含 DirectUrl fake、CD2 HTTP fake、CD2 miss → Mount/Native fallback、PlaybackManager / Session / controls / reporting / cleanup，但不冒充最终 HEAD 验证。source identity precedence 修复后最后一次 hidden Electron synthetic runtime smoke 因 timeout 未完成，记录为 `NOT COMPLETED — hidden Electron smoke timeout`；按测试限制未重试。该 timeout 不判定产品功能失败，也不宣称最终 HEAD 已重新通过 synthetic runtime。REAL settings UI 继续记录为 `NOT COVERED — native window automation unavailable`。

## 2026-09-15 — STRM resolver settings candidate

Model Tier：2。Reason：跨 main-process persistent config/secret IPC、resolver rule ordering、Mount prefix replacement、DirectUrl/same-origin deadline reuse 和现有 libmpv source-only boundary；没有改变 PlaybackManager、Session、WebSocket 或 player ownership。Escalated：no。

基于 `main@ca9ca9de58c37b8f5f3782dd1e45e9efc2071495` 创建 `feat/strm-resolver-settings` 独立 worktree。新增 `strm-config-store.js`、`strm-config-ipc.js`、`path-rules.js`、settings route/page/style/client 和 targeted tests。配置与 secret 分离，GET 只返回 tokenConfigured；legacy env 仅做首次 AUTO bootstrap。规则支持 source/mount/cloud 三种独立路径、最长前缀、Windows/UNC case-insensitive、POSIX case-sensitive、cloud-first、mount-first、custom order 以及 AUTO/USER/DISABLED 保护。

CD2 service 保留现有 DirectUrl 安全 contract，并以 `direct` / `same-origin` mode 在同一 service 中复用 Find 结果和 750ms absolute deadline。Mount stage 增加 deterministic sourcePrefix → mountPrefix replacement；Native、Transcode、Abort、superseded 和 late-response 语义保持原行为。

验证：`npm test` 94/94；settings targeted 17/17；JavaScript syntax、PowerShell syntax、`git diff --check`、prepare、build、runtime provenance 和 package verify 均按本分支执行。synthetic frozen runtime 的 DirectUrl、CD2 HTTP、CD2 miss fallback、PlaybackManager/Session/controls/reporting/cleanup 通过。native-window automation 不可用，真实 settings UI、真实服务器 cloud-first/mount-first playback 未宣称。

## 2026-09-15 — Clean-room / readiness foundation hardening

Model Tier：2。Reason：跨 prepare/build/provenance 与 embedded Pepper readiness observer、真实 Session/playback evidence 的边界审计；产品播放代码保持冻结。

基线 `main@56b2227324811b525cd73caed61e3399cd2875e5` 在独立 fresh worktree 中先按 `npm ci --ignore-scripts` 后执行 `npm test`，复现 62 PASS / 1 FAIL：`tests/external-player-process-chain.test.cjs` 模块加载阶段直接读取缺失的 ignored `src/electronapp/preload.js`。vendor 只有 214-byte Carnival preload；主开发工作区的 620-byte diagnostics preload 没有 Git source 或 prepare 生成 contract。

新增 `tools/prepare-preload.cjs`，以 vendor preload 为只读 base 生成 deterministic prepared workspace artifact，保留现有 IPC/fs/os/appdata bridge，加入非阻塞 diagnostics bridge 和带 runId 的 sticky readiness state。`prepare.ps1`、`build.ps1` 共用生成器；`runtime-provenance.cjs` 新增 prepared artifact contract，旧/手工/过期 preload 会 fail closed。其它 ignored inputs 审计为 SAFE/INTENTIONAL/UNKNOWN，没有把整个 Web snapshot 纳入 Git。

readiness observer 新增 raw ready、direct diagnostics、sticky state、core-playing 和 video-progress facts；live flow 只在 manager resolved、core-playing、视频推进、Session NowPlaying 与已接受 playback report 齐全时把缺少 direct marker 的 run 判为 class B alternate evidence。`tools/readiness-evidence.cjs` 和新增 synthetic tests 覆盖 A/B/C/D/E；不把 `play-called` 单独当作 ready，outgoing loadfile 仍保持 unavailable observability gap。

提交：`6c5cc9e05b7dbec6a01a2cf81cd19209deb0b319`，消息为 `fix: make clean-room inputs and readiness evidence reproducible`。验证：`npm test` 77/77；Node/PowerShell syntax PASS；acceptance readiness、terminal race/integration、PID reuse descendant synthetic PASS。两个独立 cleanroom worktree 的 prepare/npm test/build/provenance/package verify 全部 PASS，runtime payload 各 2116 且逐路径 hashes identical。

真实验证使用 cleanroom-1 validated runtime，串行 startup-only 10 次和 full-control 2 次。startup 10/10 class A、raw/direct/sticky readiness 10/10、resolver/core/video/Session/progress/stop 10/10、cleanup verified-clean、residual 0；full-control 2/2 的 pause/seek/resume/next/stop 和 10 条 reports 均通过。旧 vendor-only runtime 的对照 run 为 class B，direct marker 缺失但 manager/core/video/Session/progress 全部成功，证明 observer miss 被单独分类。详细脱敏证据见 `docs/CLEANROOM_REPRODUCIBILITY.md` 与 `docs/READINESS_OBSERVABILITY.md`。

## 2026-09-14 — External Player process-control cleanup Batch 2

基于 `main@65d97da975ea1ffc3505c099094086c33667931e` 创建 `cleanup/external-player-process-chain`，完成 Foundation Cleanup / Legacy Cleanup Batch 2。按任务书重新审计了 `rg`、IPC registration、`electronapphost` protocol dispatch、动态 command string、preload exposure、shell consumer、main caller、tests 和 build/package 输入。Batch 1 已将旧 External Player frontend/plugin 从 fresh runtime 排除，因此 `mpvPosEvent`/`mpvPos`/`mpv-socket`、Electron custom shell process methods、shell protocol process cases 和 main process helper chain 均确认没有其它当前 consumer。

产品变更：

- `src/electronapp/main.js` 删除旧 `net.Socket`、playback-time polling、`ipcMain.handle('mpvPosEvent')`、`webContents.send('mpvPos')`、`shellstart/shellclose` dispatch、`processes` map、`startProcess`、`closeProcess` 和旧 `execFile` callback chain。
- `src/electronapp/shell.js` 删除 `canExec`、`exec`、`close`、`getProcessClosePromise`、`onChildProcessClosed` 及其 event/argument helpers；保留 `shell.openUrl` 和原有 `electronapphost://openurl` request contract。
- Anime4K `child_process.exec('notepad.exe ...')`、CEC process execution、refresh-rate process、generic preload `window.ipc`、CD2/diagnostics IPC、CEC、Pepper/libmpv、PlaybackManager、resolver、Session/remote control 均保留。未修改 settings/playback、item autoplay、PlaybackManager external-player guards、shared locale/CSS、`external/`、vendor helper、用户配置或服务器数据。

新增 `tests/external-player-process-chain.test.cjs`，以 source-level contract 检查 dead registration/dispatch/helper 消失，以 VM 行为测试验证 `shell.openUrl` 发出 `GET electronapphost://openurl?url=...`，并以 fake trusted IPC 验证 CD2 resolve/cancel 与 Anime4K/CEC preservation。没有引入新测试框架。

验证结果：

- `npm test`：67/67 PASS；targeted process-chain tests：5/5 PASS。
- JavaScript syntax：455 files PASS；PowerShell syntax：11 files PASS；`git diff --check`：PASS。
- fresh runtime `EmbyTheaterEnhanced-0.1.1-batch2-process-chain-65d97da`：runtime provenance PASS（779 product-scope entries），`package.ps1 -VerifyOnly` PASS（2,116 payload files）。runtime `electronapp` 中本批 dead process references 为 0；`shell.js`、preload、CD2/diagnostics、CEC、libmpv、resolver、PlaybackManager、`sessionplayer.js` 均存在。
- 相对 Batch 1 after-cleanup runtime：实际文件数 2,117 → 2,117，减少 0；大小 389,008,884 → 389,005,881 bytes，减少 3,003 bytes。删除发生在保留的 `main.js`/`shell.js` 文件内部，未删除整个 shared 文件。
- 唯一一次 bounded real acceptance 使用 `inspect,select,play,pause,seek,resume,next,stop`，全部 PASS；`strm=true`，Pepper-ready、resolver-result、manager-play-resolved、Session/reporting、cleanup 均通过；runner `completed`、`timedOut=false`、`cleanup=verified-clean`、residual owned processes=0。`loadfileObservation=unavailable` 仍是既有 observability gap，不作为 gate。

同步更新 `docs/LEGACY_AUDIT.md`、`docs/EXTERNAL_PLAYER_REMOVAL.md`、`docs/PROJECT_STATUS.md` 和 `docs/TESTING.md`，明确 Batch 1 frontend/plugin layer 与 Batch 2 host/process-control chain 已移除，settings/autoplay/PlaybackManager/shared residue 仍保留。vendor 原件未修改；本轮不 push、不 merge、不开始下一批。

Model Tier: 2
Model: current Codex session
Reason: main-process IPC、custom shell、electronapphost protocol、真实 PlaybackManager/Session/remote-control acceptance 均在边界内，需要跨层删除后复核
Escalated: no

## 2026-09-14 — External Player registration portability fix

Batch 1 review 的最后 blocker 是 Electron External Player registration 只存在于 ignored Web snapshot 的本机修改。本轮新增 `tools/patch-external-player-registration.cjs`，以精确 registration pattern 做可重复、幂等且 fail-closed 的 patch；`tools/build.ps1` 在 source overlay 后执行它，再移除 `electronapp/www/modules/externalplayer`。Android `native/android/externalplayer` 和其它平台分支保持不变。

`runtime-provenance.cjs` 将 `electronapp/www/app.js` 登记为受控 overlay，记录 generator/runtime/source 状态；source app.js 存在时验证 source/runtime/generator hash，source app.js 缺失时验证 vendor fallback runtime overlay，且不降低其它产品 scope。新增 active/already-clean/platform-preservation/malformed-duplicate patch tests，以及 source sentinel/external-player exclusion 和 normal missing-runtime failure regression。未修改播放代码、Session、main IPC、shell、CEC、vendor 或用户数据，未重新执行真实 acceptance。

Model Tier: 1
Model: current Codex session
Reason: the change is a narrow tracked build/provenance contract with targeted fixtures; playback and Session behavior remain out of scope
Escalated: no

## 2026-09-14 — Provenance portability blocker fix

Batch 1 review 发现 External Player frontend 位于 ignored `src/electronapp/www/`，本机删除 41 个文件不会同步到其它构建机；若 provenance 继续枚举它们，而 build runtime 已排除目录，另一台机器会构建失败。本轮只修该 contract：`runtime-provenance.cjs` 以精确 `src/electronapp/www/modules/externalplayer/` 前缀做 intentional source exclusion，并在 `validatedProductScope.excludedSourcePrefixes` 中记录；同时将 `electronapp/www/app.js` 登记为由 `patch-external-player-registration.cjs` 控制的 build overlay，只关闭 Electron registration。write/validate 共用同一 exclusion/overlay contract，其他非排除 source file 的缺失仍 fail。

Local audit workspace：本机曾删除 41 个 ignored snapshot files。Durable repository/product behavior：provenance contract 与 `tools/build.ps1` exclusion 保证该 frontend 不进入 fresh Enhanced runtime，无论 ignored snapshot 是否存在。新增 targeted provenance regression，未修改播放代码、Session、main IPC、shell、CEC、vendor 或用户数据；未重新执行真实 acceptance。

## 2026-09-14 — External Player frontend cleanup Batch 1

从 Audit commit `fb434e57f2cca065c784e0551c651ef57d1a2634` 创建 `cleanup/external-player-frontend`，提交 `adc8758902a580cc3bc7fc33bfb10a6b422c828d`，消息为 `cleanup: remove dead external player frontend`。本轮按 contract 只清理前端/plugin 表层：物理删除本地 ignored Web snapshot 中 `www/modules/externalplayer/**` 的 41 个文件；在 `tools/build.ps1` 增加纯 External Player runtime exclusion，避免 vendor 全量复制把它重新带入新 runtime；删除直接读取该 plugin 文件的 obsolete 单测。持久化仓库行为是 exclusion，不是 41 个 tracked file deletion。没有修改 main.js、mpvPosEvent、named pipe、shell、shell.openUrl、CEC、Pepper/PPAPI、libmpv、PlaybackManager、remoteplayer、Session、resolver、CD2、DirectUrl、Mount、preload、external/、vendor helper 或用户设置。

删除前重新追踪了 registration、AMD require、route/controller、自引用和 package copy rule。删除后剩余 `externalplayer` 命中逐项归类为 Android 平台分支、Batch 2 settings/autoplay/PlaybackManager guard、负向 smoke 断言或合法 build exclusion，没有失效的 `www/modules/externalplayer` runtime path。vendor/carnival 原件仍保留 41 个文件且未修改。

验证 runtime 为 `dist/EmbyTheaterEnhanced-0.1.1-batch1-after-cleanup-adc8758`：provenance PASS（779 scope entries）、payload verify PASS（2,116 files）、删除路径 0 entries；npm test 56/56，451 个 JS syntax、11 个 PowerShell syntax、git diff --check 全部通过。对照 runtime 2,158 files / 389,112,766 bytes，清理后 2,117 files / 389,008,884 bytes，减少 41 files / 103,882 bytes；本地 source size 减少 77,725 bytes。

唯一一次 bounded real acceptance 使用 `inspect,select,play,pause,seek,resume,stop`，全部 PASS，`strm=true`，Pepper-ready/resolver-result/manager-play-resolved 均 observed，Session/reporting 正常，runner completed、cleanup verified-clean、residual=0。`loadfileObservation=unavailable` 保持既有 observability gap，不作为本轮 gate。

准确状态：External Player frontend/plugin layer removed；main-process/helper residue remains for Batch 2 audit/removal。未 push、未 merge、未开始 Batch 2。

Model Tier: 1
Model: current Codex session
Reason: the requested deletion was narrow and the cross-module contract was fixed; only frontend payload/build exclusion and an obsolete direct-load test were in scope
Escalated: no

## 2026-09-14 — Foundation legacy audit

本轮按任务书在 `main@c873913ea1a2716e048e785fa2fd83294dd091b5` 上执行 Foundation Cleanup / Legacy Audit。范围限定为审计、分类和可执行清单，不删除产品代码、不修改播放架构、不运行 Carnival 或综合补丁安装/恢复脚本、不执行真实 Emby acceptance、不提交或推送。

静态追踪确认：维护版 `www/app.js` 已以 `responses.electron && false` 禁止 External Player 默认注册，disabled plugin 构造函数返回空路由/不可播放；其 41 个 module/controller/HTML/locale 文件仍随全量 vendor copy 进入 runtime。旧 `mpvPosEvent`/`mpv-socket` producer 只有该不可达 plugin consumer；`shell.js` 的 `openUrl` 仍有四类活动调用者，只有 process-only `exec/canExec/close` 可作为拆分候选。CEC 由顶层 plugin 动态加载并通过 `electroncec` 初始化，判为 KEEP。动态 plugin、opaque managed host、CEC executable 参数、用户 settings/autoplay、Anime4K preset、CEC driver/alias 和平台分支按证据不足或共享风险列为 UNKNOWN/DEFER。

新增 `docs/LEGACY_AUDIT.md`，记录 8 个任务领域、依赖链、KEEP/DELETE CANDIDATE/DEFER/UNKNOWN、三个 cleanup batch、payload 统计和 Batch 1 回归条件。统计包括 External Player 41 文件约 77KB、CEC 15 文件约 1.47MB、`external/` 46 文件约 29.34MB、旧 root BAT 约 13.9KB；vendor 原件和 ignored runtime 均保持只读。

验证：`npm test` 57/57；本轮未运行安装器、真实播放或远控验收。产品代码 modified：NO。

Model Tier: 1
Model: current Codex session
Reason: task contract was audit-only; implementation scope was limited to documentation and static cross-module evidence
Escalated: no

## 2026-09-14 — Pepper ready listener race follow-up

本轮在 `fix/pepper-ready-listener-race` 上执行，基于 `main@e9e2ad221ed5059574f830e9ffd9ef0dd5c8a22c`。上一轮诊断 harness/doc 资产已先独立保留为 `ef34827378805e7a80ea0f73e1f5bbf2ddbf9314`；本轮不混入临时 instrumentation。

重新核对 `src/electronapp/plugins/libmpv.js` 后确认旧顺序为：创建 embed → 注册 embed `message` listener → attach 到 dialog → 设置 `libmpv` → 注册 window `ready` listener。由于 Pepper 可能在 attach 同步窗口发出 `{type:'ready'}`，旧顺序存在 listener-after-attach race。修复后顺序为：创建 embed → 注册 message listener → 设置 `libmpv` → 注册 window authoritative `ready` listener → attach 到 dialog。embed 属性、`application/x-mpvjs`、DOM parent、ready callback、`enhancedDiagnostics(libmpv, 'ready')`、player reuse、stop/destroy 和 message handling 均保持不变；listener 仍使用 `{once:true}`，没有新增 retry、sleep、timeout 或轮询。

新增 `tests/pepper-ready-listener-race.test.cjs`，使用实际 `libmpv.js` AMD factory、最小 fake DOM/event target，并让 fake Pepper 在 `insertBefore(embed)` 的同步调用内立即发 ready。旧顺序测试会超时，修复后证明 ready 被捕获、`play()` 收束、authoritative ready callback 只执行一次；npm 全量测试为 57/57。初始化区其它首次消息 listener 没有发现同类 attach 后注册风险：embed `message` listener 已在 attach 前，`core-playing` listener 在 `playInternal/loadfile` 前。

按本分支 HEAD 构建 `dist/EmbyTheaterEnhanced-0.1.1-pepper-ready-race-731dc2a`，full runtime provenance 820/820 通过。唯一一次真实 acceptance 使用 `inspect,select,play,stop`，结果为 inspect PASS、select PASS、isStrm=true、unique embed=1、Pepper ready observed、resolver-result observed、manager-play-resolved observed、classification success、cleanup verified-clean、residual=0。timing 为 `play→embed=4724ms`、`embed→Pepper ready=22ms`，仅作为回归证据，不宣称性能改善；`loadfileObservation=unavailable` 仍是既有 observability gap。

本轮仍保留 `ROOT CAUSE NOT YET CONFIRMED`。本修复只关闭静态极早 ready 丢失风险，不能宣称已经确认历史 20–30 秒 readiness 长尾的根因。

Model Tier: 2
Model: current Codex session
Reason: the change is small but touches libmpv/Pepper event ordering and requires a synchronous fake-plugin behavior test plus one real acceptance
Escalated: no

提交：`731dc2ad5ca4898475a5e641b6975563f9cf8c74`，消息为 `fix: register Pepper ready listener before attach`。未 push、未 merge。

## 2026-09-14 — Pepper readiness 抖动诊断

本轮按用户任务只做 Foundation / Pepper readiness diagnosis。基线为 `main@e9e2ad221ed5059574f830e9ffd9ef0dd5c8a22c`，产品 `src/electronapp`、PlaybackManager、libmpv、preload、main、resolver、CD2、DirectUrl、服务器和用户播放器配置均未修改；没有提交、推送或发布。

静态审计确认实际链路为 PlaybackManager `self.play()` → `playInternal()` → `showVideoOsd()` → `displaySync()` → `createMediaElement()` → `<embed type="application/x-mpvjs">` → embed `message` `{type:'ready'}` → `enhancedDiagnostics(libmpv, 'ready')` → resolver/loadfile/core-playing → `enhancedDiagnostics(..., 'playing')` → manager play Promise resolve。产品在 `libmpv.js:523` 插入 embed 后才在 `:526` 注册 window `ready` listener，存在静态 listener-after-event 风险；当前没有 ready timeout/retry。现有 `createMediaElement()` call、outgoing loadfile 和 DLL init 起点没有可靠 acceptance signal。

本轮只在 `tests/` 与 `tools/` 做最小 harness 增强：observer 用 MutationObserver 记录 embed creation observation、attached/disconnected、unique count、recreation/duplicate；recorder 输出 lifecycle/timing；profile inspect 兼容 Promise-style loader、global ConnectionManager 延迟初始化；runner 对 terminal report 后 root 自然退出按已验证 creation date 继续做安全 cleanup。没有加入产品 instrumentation、通用 AMD probe、event bus 或复杂状态机。

按当前 HEAD 新建 `dist/EmbyTheaterEnhanced-0.1.1-readiness-diagnosis-e9e2ad2`，runtime provenance 820/820 scope entries 通过。Run A/B/C 均使用相同 runtime、相同 harness 和 `inspect,select,play,stop`：

| Run | play→embed | embed→bootstrap | embed→authoritative ready | ready→manager resolved | result |
|---|---:|---:|---:|---:|---|
| A | 5996ms | 3ms | 2ms | 2657ms | success |
| B | 4565ms | 4ms | 3ms | 2117ms | success |
| C | 4535ms | 4ms | 3ms | 2268ms | success |

三次均 unique embed=1、无播放期间 recreation/duplicate；runner 均 `completed`、`timedOut=false`、`cleanup=verified-clean`、residual=0。`bootstrap→authoritative ready` 原始值三次为 -1ms，解释为同一 message dispatch 中产品 listener 先于 acceptance listener，业务间隔约 0ms。resolver-result 在 ready 后 4–5ms 出现，loadfile observation 仍 unavailable，不影响 gate。

诊断结论：`ROOT CAUSE NOT YET CONFIRMED`。本轮主要 jitter stage 是 `play-called→embed-created/attached`（4535–5996ms），不是 `embed→Pepper ready`。最可能层是 embed 创建前的 PlaybackManager/player 前置链，包括 API/码率/流选择、OSD 路由和 display-sync，但当前没有调用级时间戳，不能确认单一根因。三次没有证据支持 PPAPI/plugin ready 随机延迟、ready 丢失、embed recreation、harness 影响或 PR4/DirectUrl/resolver 因果关系。完整脱敏 evidence 见 `docs/PEPPER_READINESS_DIAGNOSIS.md`。

Model Tier: 2
Model: current Codex session
Reason: real Pepper/libmpv readiness timing spans PlaybackManager, Electron/Preload, embed lifecycle, bridge message ordering and bounded acceptance cleanup; product lifecycle was kept frozen
Escalated: no

结论：三次 readiness 样本已完成；root cause 未确认，不提出产品修复，不提交、不推送。

## 2026-09-14 — terminal writer 与 cleanup verification follow-up

本轮只处理 acceptance harness 的终态写入和 cleanup verification，产品代码、resolver、observer、PlaybackManager、libmpv、preload、CD2、Pepper bridge 与服务器配置均未修改。`inspectProfile()`、normal success/failure、operation failure 与 global timeout 现在都通过同一个 `createTerminalWriter()`，其内部复用 `OPEN → FINALIZING → COMPLETED` single-writer guard；losing path 在 await 返回后先检查 ownership，不再写入 shared `failure`、terminal classification 或 `report.completed`。cleanup 入口先用当前 root PID 与原始 CreationDate 完成 identity validation，再将同一已验证 snapshot 交给 tree observation；root missing、reuse 或 CIM unavailable 都不会登记或清理 descendants。

新增 integration synthetic 覆盖 `inspectProfile` failure 与 global timeout 的近同时竞争，以及 success claim 后 losing failure 的污染尝试；两项均只产生一次 terminal save，胜出的 classification 保持不变。CIM/WMI 查询失败现在 fail closed：不 kill 未确认 ownership 的 PID，`cleanupStatus=unverified`、`ownershipVerified=false`、`residualOwnedProcesses=null`，runnerResult=`cleanup-unverified` 且返回非零。新增 PID-reuse-with-descendant synthetic，确认复用 root 的 child 未被登记或终止。正常 success/failure/timeout 保持 `verified-clean`；CreationDate mismatch 保持 `pid-reused`/`ownership-mismatch` 并阻止完整 cleanup success。

`dist/EmbyTheaterEnhanced-0.1.1-provenance3-20260914` 在本 follow-up commit 前绑定 `8a3433e53a9c47bba0c25ff5b43e1b3281a4fe9e`，full provenance positive validation 820/820 通过；较早 `provenance2` runtime 因 sourceCommit stale 被 ValidationOnly negative 正确报告为 `runtime-validation-failed`，未启动 Electron。未运行真实 Emby acceptance。

Model Tier: 2
Model: current Codex session
Reason: terminal ownership race and cleanup-verification semantics cross the Electron writer and PowerShell runner, while product playback remains frozen
Escalated: no

结论：terminal writer、inspectProfile integration race、losing-writer protection、CIM unavailable fail-closed、root-before-tree ordering 和既有 PID mismatch 均有合成证据，已形成独立 follow-up commit，可进入 targeted review。

## 2026-09-14 — readiness harness boundary hardening

本轮是 readiness harness 的独立 follow-up 审计，产品代码、PlaybackManager、libmpv、preload、CD2、Pepper bridge、resolver 和服务器配置均保持不变。runtime provenance 从少量 sentinel 扩展为构建范围清单：覆盖 `src/electronapp` 的全部 818 个文件和两个 `Start-Enhanced` wrapper，共 820 个 scope entries；`package.json` 元数据与 PlaybackManager 改写分别记录为显式 build overlay。`sourceCommit`、`validatedProductScope` 与 `baselineIdentity` 分开保存，vendor baseline、node_modules production closure、Electron runtime binary 和 native mpv 不归入产品 scope。

`dist/EmbyTheaterEnhanced-0.1.1-provenance2-20260914` 在上一 follow-up commit 前绑定 baseline `3d1cc6d906131d2e7e1d0a10af5fd354b228a41d`，full provenance positive validation 与 package payload verification 通过；旧 partial-stale runtime 的 ValidationOnly negative 以 `runtime-validation-failed` fail-fast，未启动 Electron。runner 的 terminal guard 采用 `OPEN → FINALIZING → COMPLETED` 单写入语义，success/failure/timeout、terminal race 与 PID mismatch synthetic 均通过；后续本轮补充了 `inspectProfile` integration race、losing-writer protection 与 CIM fail-closed。PID cleanup 在 kill 前重新读取 root PID 的 CreationDate，synthetic mismatch 记录 `pid-reused`/`ownership-mismatch`，不执行不属于本次 run 的清理。CIM lookup unavailable synthetic 以 `cleanupStatus=unverified`、`ownershipVerified=false`、residual 未知结束，runner 不报告完整 success，也不 kill 不确定 PID。

历史 real artifact 分开保留：`readiness-main-20260914-070236533-48d1e60e` 是旧 runner lifecycle 下 acceptance success 但 `runnerResult=timeout`、总耗时 `242507ms`；`terminal-real-20260914-073146032-27837240` 是终态收尾修复后的 acceptance success、`runnerResult=completed`、`timedOut=false`、总耗时 `15959ms`、residual=0。两次均将 `loadfileObservation=unavailable` 作为 observability gap，不作为 gate。本轮 follow-up 没有运行真实 acceptance。

文档同步更正了 fixture 覆盖范围：可重复 fixture 覆盖 profile inspect 的 client lookup；global API、single PlaybackManager require 与 global fallback 不再被描述为已有独立 fixture 证明，而以 acceptance flow/real artifact 证据区分记录。旧 `guard()` helper 已移除。

Model Tier: 1
Model: current Codex session
Reason: bounded provenance, terminal lifecycle and process ownership review; product playback lifecycle remained frozen
Escalated: no

结论：readiness harness follow-up 的 provenance、terminal race 与 PID ownership 边界已完成静态/合成验证，已形成独立提交并可进入 review；不推送、不创建 PR、不运行真实 acceptance。

## 2026-09-14 — runner terminal lifecycle follow-up

本轮只修改 acceptance runner 的终态收尾与 synthetic child，产品代码、resolver、observer 事实采集和 loadfile 观测均未修改。`tests/readiness-acceptance.ps1` 现在以 `acceptance.json` 的 `completed=true` 且存在安全 terminal classification 作为唯一终态来源；检测后等待 300ms flush window，再只清理本次启动的 exact root process tree。240000ms deadline 仍保留给无 terminal report 的 hang，并以 `timedOut=true` / `runnerResult=timeout` 区分。

synthetic success 在约 2.5s 内返回 `runnerResult=completed`、`timedOut=false`、residual=0；synthetic terminal failure 同样提前结束并保留 runner exit code 1；无 terminal report 的 timeout case 返回 `runnerResult=timeout`、`timedOut=true`、residual=0。未使用全局进程名清理。

较新的 `terminal-real-20260914-073146032-27837240` acceptance artifact 使用已校验 runtime，terminal success 在约 14.2s 被识别，runner 总耗时 15.959s，`runnerResult=completed`、`timedOut=false`、acceptance report 存在、root PID 52620 的 exact cleanup 后 residual owned processes=0。`processExitCode=1` 是 taskkill 后的 child 状态，runner 根据 terminal classification 正确返回 `runnerExitCode=0`。本 follow-up 不运行真实 acceptance。

Model Tier: 1
Model: current Codex session
Reason: bounded runner terminal detection and owned process cleanup only
Escalated: no

结论：runner success/failure/timeout 三种生命周期均已验证；本轮不提交、不推送、不发布。

## 2026-09-14 — resolver-bearing runtime acceptance

基于当前 HEAD `c880b97757be422ae818fe30b3a335003e41227b` 使用既有 `tools/build.ps1` 新建 `dist/EmbyTheaterEnhanced-0.1.1-readiness-main-20260914`（2156 files），未覆盖已有 runtime、vendor 或产品源码。正式 runner 增加 runtime fail-fast：四个关键产品文件逐项 source/runtime SHA256 MATCH，`electronapp/resolvers/` 存在，`libmpv.js` 含 `strmResolver.resolveAsync` 与 resolver-result marker；旧 `final-win-x64` 负例被报告为 `runtime-validation-failed` 且未启动 Electron。acceptance report 记录 runtime name、source commit 和 validation status。

更正 gate 语义：`resolver-enter` 改为 `resolver-result`，因为现有产品日志在 `await strmResolver.resolveAsync(...)` 返回后才输出；observer 轮询中恢复被 app 覆盖的 console hook。loadfile 保持 observability gap：embed outgoing `postMessage` wrapper 仍失败并记录 `embed-command-hook-failed`，因此 loadfile 只报告 `unavailable`，不作为硬 gate。产品代码与 PlaybackManager/libmpv 实现未修改。

旧 runner lifecycle iteration 使用 `readiness-main-20260914-070236533-48d1e60e`。runtime validation=passed；`inspect=PASS`、`select=PASS`、`isStrm=true`、容器为 `mkv`/`mp4`、`play-called`、`embed-created`、Pepper authoritative-ready、`manager-play-resolved`、`resolver-result` 全部通过。`loadfileObservation=unavailable`，未作为失败条件；acceptance 主链结果为 `success`，没有新增完整控制链之外的额外结论。runner 达到 240000ms child deadline 后总耗时 242507ms，报告、stdout/stderr 存在，ownership inspection=ok，exact root process tree cleanup 后 residual owned processes=0。

Model Tier: 1
Model: current Codex session
Reason: runtime provenance gate and bounded resolver-result terminology correction; no product flow instrumentation
Escalated: no

结论：harness 已使用 current-main runtime 贯通至 resolver-result；loadfile 仍是明确的 observability gap，不据此判断产品失败。无需升级到产品 flow 调查，不提交、不推送、不发布。

## 2026-09-14 — resolver/loadfile missing static audit

本轮只读审查当前 acceptance harness 与实际 runtime provenance，没有新增 harness 代码、没有修改产品代码，也没有执行第二次真实 acceptance。当前 runner/observer 职责仍清晰：`tests/readiness-acceptance.ps1` 负责 owned root/deadline/cleanup，`tests/acceptance-readiness.js` 只记录产品事实，`tests/live-acceptance-browser.js` 负责 flow gates，`tools/acceptance-readiness.cjs` 负责结果汇总。未发现第二套 event bus 或重复 gate state machine；`tools/acceptance-electron.cjs` 的 `guard` helper 当前未使用，作为后续纯 cleanup 候选保留。

关键 provenance：`tests/readiness-acceptance.ps1` 默认启动 `dist/EmbyTheaterEnhanced-0.1.1-final-win-x64`，该目录时间早于当前 resolver runtime；其 `electronapp/plugins/libmpv.js` 不包含 `strmResolver.resolveAsync`、`STRM resolver: invoked` 或 file-local load option。当前 `src` 与 `dist/EmbyTheaterEnhanced-0.1.1-readiness-b-main-20260914` 的 `libmpv.js` hash 一致，并包含 resolver 调用与 marker。因此上一次真实 run 的 `resolver-enter=missing` 首要分类为 A：实际 acceptance runtime 没有进入 resolver 产品代码，不能据此判断 resolver regression。

当前源码实际链路为 `libmpv.js:647` 的 `await strmResolver.resolveAsync(...)`，resolver 完成后在 `libmpv.js:677` 调用 `logStrmResolverResult`。`tests/acceptance-readiness.js:85` 匹配该完成日志却标记 `resolver-enter`，所以该名称不准确，属于 D；它最多表示 resolver decision/result 已打印，不能证明 entry。`libmpv.js:788-790` 才是当前源码的 `loadfile` command，`sendCommand` 位于 `:1399-1405`。observer 在 `acceptance-readiness.js:33` 依赖收到 command，并在 `:51-58` 尝试覆盖 embed 的 `postMessage`；本次真实报告的 `lastError=embed-command-hook-failed` 证明该 outgoing loadfile 观测不具权威性，形成 OBSERVABILITY GAP。

本次 timeline 显示 observer installed 约 283ms、`play-called` 约 2770ms，因此 C（observer 晚于 resolver）不成立；但 app 的 `data-appmode=standalone` 会在 `www/app.js:1650` 改写 `console.log`，现有 hook 仍有生命周期 race。当前真实样本由 `select` 的 `.strm` 后缀过滤，`strm=true`，容器为 `mkv`/`mp4`，resolver 入口条件成立。PlaybackManager 的 `self.play()` 返回 `playWithIntros` 链；视频 local player 的 `player.play()` 继续等待 libmpv `playForRequest`，后者等待 `playInternal`、core-playing、OSD 与 playing diagnostic，因此 manager-play-resolved 对当前源码可确认是播放 promise 完成，但在 stale runtime 中只证明旧 native play 已完成，不能反推 resolver 曾执行。

本轮不修改产品 instrumentation，不尝试修复 loadfile 的不可靠 outgoing hook，不执行第二次真实 run。下一步最小 harness 修复应先固定/校验 resolver-bearing runtime，再把 resolver gate 改成准确的 result/decision 语义；loadfile 若没有现有可靠 acceptance-only source，继续保持 OBSERVABILITY GAP。

## 2026-09-14 — inspect module acquisition follow-up

保持 `fix/acceptance-readiness`，产品代码继续冻结在 `main@c880b97`；本轮只修改 acceptance flow/report 分类，没有修改 `src/electronapp`、PlaybackManager、libmpv、preload、CD2、Pepper bridge、服务器或配置。对比 PR #2/#4 的历史 flow 后确认，当前 frozen Alameda runtime 已暴露 `window.ConnectionManager`、`window.ApiClient`、`window.Events`；`playbackManager` 没有对应可靠 global。之前的三模块 batch require 与过早注入共同使 inspect 卡在 module resolution。

`tests/live-acceptance-browser.js` 现按最小路径获取对象：有界等待并调用 `window.ConnectionManager.currentApiClient()`（必要时使用 `window.ApiClient`），只对已确认的 `playbackManager` 做一次 `require(['playbackManager'])`，事件对象直接使用 `window.Events`。没有新增通用 AMD resolver、自动扫描、relative-path probe 或 batch require；`tools/acceptance-electron.cjs` 只将 inspect acquisition 摘要提升到报告顶层，`tools/acceptance-readiness.cjs` 增加 API/PlaybackManager/Events 前置分类。observer 保持未改。

实际 acquisition 路径已在 real acceptance artifact 中观察到 `window.ConnectionManager.currentApiClient`、canonical `playbackManager` require 与 `window.Events`；现有可重复 fixture 只覆盖 profile inspect 的 client lookup，没有独立 fixture 证明上述三条 live acquisition 路径。JS/PowerShell syntax、observer self-test、runner synthetic（exact root cleanup/residual 0）、`npm test` 56/56 和 `git diff --check` 通过。

旧 `module-acq-20260914-061651157-ec84996` iteration 中，`inspect=PASS`、`select=PASS`、`play-called=seen`；acquisition 为 `currentApiClient=window.ConnectionManager.currentApiClient/available`、`PlaybackManager=amd-require:playbackManager/available`、`Events=window.Events/available`。随后 `embed-created`、Pepper authoritative-ready 与 `manager-play-resolved` 均被观察到，但 `resolver-enter` 未观察到，flow 以 `resolver-entry-timeout` 停止，`loadfile` 未观察到；没有新增完整 resolver/Session/remote-control/DirectUrl 全链通过结论。runner 最终达到 240000ms bounded deadline，报告存在，ownership inspection=ok，residual owned processes=0，并按 exact root process tree 清理。

Model Tier: 1
Model: current Codex session
Reason: acceptance-only single-module acquisition and report classification; product playback lifecycle remained frozen
Escalated: no

历史结论：该 iteration 的 inspect module acquisition 目标完成并可进入 harness review；完整实服播放验收当时仍停在后续 `resolver-entry-timeout`。

## 2026-09-14 — acceptance readiness runner 与 observer 收敛

保持 `fix/acceptance-readiness`，产品代码冻结在 `main@c880b97`，没有修改 `src/`、PlaybackManager、Session/WebSocket、libmpv、服务器或 CD2 配置。本轮先复用 `.work/run-accept-once.ps1` 已证明的 `ProcessStartInfo` 形状，将 `tests/readiness-acceptance.ps1` 收敛为单次 runner：保存 exact root PID，使用 wall-clock deadline，超时只对该 root 的 owned process tree 执行精确 `taskkill /PID ... /T /F`，始终写入 `runner-result.json`、stdout 和 stderr，并记录 residual owned PID 数；没有按进程名全局清理。

`tests/acceptance-readiness.js` 从 383 LOC 降至 124 LOC。observer 只记录安装时间、`enhancedDiagnostics` wrapper、`ready`/`playing`、mpv embed、bridge message summary、resolver console marker 和可观察到的 loadfile；Pepper authoritative ready 只认 `enhancedDiagnostics(..., 'ready')`，native bootstrap ready 单独记录。AMD module probe 与自建 event bus 已移出/删除，模块解析和六个播放 gate 回到 `tests/live-acceptance-browser.js`；删除了不再需要的 `tests/acceptance-modules.js` 与 `tools/readiness-timeline.cjs`。新增 `tests/acceptance-readiness-selftest.cjs`，不引入测试框架。

静态与合成验证：`npm test` 56/56；修改/新增 JS 与 `tests/readiness-acceptance.ps1` PowerShell syntax PASS；`git diff --check` PASS；observer synthetic self-test PASS；runner synthetic child 写入 stdout/stderr 后在 1.2 秒 deadline 被精确终止，`runner-result=timeout`、runner exit code 124、stdout/stderr 文件存在、ownership inspection=ok、residual owned processes=0。synthetic 的 child process exit code 1 是 taskkill 终止结果，不作为 runner failure 误报。

旧 `single-real` iteration 的 runner 在 47.2 秒内完成，`acceptance.json`、stdout/stderr 均存在，ownership inspection=ok、residual=0；Electron 子进程因 acceptance 失败返回 1，runner 如实返回 1。flow 在 `inspect` 阶段以 `module-resolution-timeout` 结束，没有 `play-called`、embed、Pepper-ready、manager-play-resolved、resolver-enter 或 loadfile 事实，因此没有真实播放/Session/远控通过证据。该次真实运行后仅补充了 flow 的 bare/window AMD loader 兼容尝试，当前代码的该补充只经过静态语法验证。

Model Tier: 2
Model: current Codex session
Reason: Electron process ownership/timeout cleanup and acceptance gate responsibility cross the runner, renderer observer and browser flow; product playback code remains frozen
Escalated: no

结论：runner lifecycle 与 observer synthetic gate 通过，但真实 acceptance 在 harness inspect 前置阶段阻塞；当前为 `NEEDS MORE HARNESS WORK`，不提交、不推送、不发布。

## 2026-09-14 — PR #4 DirectUrl 收尾验证

按已冻结的 PR #4 contract 完成机械回归与分层收尾，没有重做 Sol High review、没有重构 DirectUrl，也没有修改 PlaybackManager ownership、Session/WebSocket、libmpv 生命周期或服务器/CD2 配置。先发现既有 `cd2-direct-url-c` runtime 的 `cd2-service.js` 未包含 same-origin reserve 与显式空 UA fail-closed 修复，未覆盖原目录，改由 `tools/build.ps1` 生成独立 verification runtime（2156 files）；四个关键生产文件与 `src/` 逐 SHA256 一致。

验证结果：`npm test` 56/56；4 条 blocker targeted tests 通过，覆盖 fallback budget、near-expiry reacquire 保留 same-origin 时间窗、reacquire failure fallback 和显式空 UA/非空 header fail-closed；13 个修改/新增 JS、3 个 PowerShell 脚本语法通过，`git diff --check` 通过。新 frozen runtime 的 gRPC/direct response smoke 通过（Electron 18.3.15、Node 16.13.2、grpc-js 1.14.4、proto-loader 0.8.1、0 native addon）；exact Pepper UA-A → UA-B → same-origin C 全部 path/format/core-idle=false/time-pos advancing 且无泄漏；Stop-before-player 通过。

新 runtime 的完整 DirectUrl pipeline 进入 resolver 并观察到 DirectUrl 请求、UA 精确匹配与 no-leak，但在切换第二个 fixture source 时发生 UI smoke timeout，整体 fixture 不记为全链通过。一次有界真实 DirectSmoke 的 inspect/select 通过，但 resolver 阶段 timeout，未进入 bridge；既有成功的真实 DirectUrl + returned UA/expiry + embedded libmpv 播放推进证据保留。上述 readiness/前置 timeout 未证明 DirectUrl 或 same-origin fallback 失败，也未取得新的完整实服 Session/WebSocket/controls/reports 证据。敏感信息扫描仅发现合成 example/localhost fixture，未发现真实凭据、URL/query token、Cookie、路径或 UA。

Model Tier: 1
Model: current Codex session / Luna Max
Reason: contract、验收边界与修改范围已冻结，本轮为测试、frozen runtime、敏感信息审计和文档收尾
Escalated: no

结论：原三个 Sol code blocker 均有当前源码 targeted evidence；acceptance infrastructure blocker 仍存在。PR #4 product code `READY FOR TARGETED FINAL REVIEW`，不 merge、不提交、不发布。

## 2026-09-14 — PR #4 DirectUrl 安全实现与分层验收

从 `main@ba3d7e9` 创建 `feat/cd2-direct-url`。Sol High contract review 先冻结 file-local header、expiry、generation 与 fallback 边界；Luna Max worker 按明确 contract 实现，主线程复核 diff 与验收。DirectUrl 只改变最终 source，PlaybackManager、MediaSource/Item/PlaySessionId、Session/WebSocket、libmpv ownership 与报告链均未改。

exact frozen Pepper 使用字符串 argv 调用 `mpv_command`。隔离 fake HTTP 验证 `loadfile <url> replace -1 user-agent=<value>` 的 UA-A → UA-B → same-origin C 三段均推进且无泄漏。产品实现只允许受限可打印 ASCII UA；任意 additionalHeaders、unsafe UA、malformed URL、invalid/near expiry 与 transport failure 优先 same-origin。DirectUrl 与 fallback 共用 750ms absolute budget，known-expiry 最多重取一次，Abort/Stop/NextTrack 继续取消旧 request 并丢弃 late response；未实现全局 header、provider 特判、后台刷新或 HTTP-error retry。

验证：55/55 unit/fake、修改 JS/PS 语法与 `git diff --check` 通过；frozen fake DirectUrl 一次完整运行覆盖 UA isolation、Pause/Seek/Resume/NextTrack/Stop、generation/cancel 与 19 条报告。真实 persistent profile 的分层 smoke 选取既有 STRM，取得 `sourceKind=direct-url`、returned UA/expiry present、path/format/core-playing/time advancing。完整 PlaybackManager 实服复测连续在 resolver 前 45 秒超时，same-origin 强制 smoke 两次停在 embed `bridge-not-ready`；这些失败没有发送旧 DirectUrl 或证明 fallback 错误，但使 PR #4 保持 NOT READY。未改服务器、CD2 config/mount/cache、账号或网盘数据。

Model Tier: 2
Model: GPT-5.6 Sol High contract/review + GPT-5.6 Luna Max implementation
Reason: file-local header isolation、expiry、generation 与 fallback correctness 跨播放器/main/renderer
Escalated: yes；按项目模型分级执行

## 2026-09-14 — single-prefix mapping 与真实 Emby CD2 验收完成

继续 `feat/cd2-resolver`，没有改产品 resolver、PlaybackManager、Session/WebSocket 或 libmpv。使用同一个 persistent acceptance profile，先对两个有限 STRM 样本做脱敏只读诊断：两个 `Item.Path`/`MediaSource.Path` 关系可由同一条 source-side POSIX prefix → cloud prefix 表示，relative suffix 保持；`mapLocalPath` 的边界、`..` 拒绝和 POSIX case sensitivity 通过。两个候选 CD2 target 均为 regular file，`FindFileByPath` 与 `GetDownloadUrlPath(get_direct_url=false)` 成功，HEAD 200、Range 206、无重定向。实际 mapping 只写入 ignored local acceptance 配置，未进入源码、文档、fixture、acceptance report 或 Git。

使用该 ignored mapping 重跑真实 Emby acceptance。两个样本 resolver 均返回 `type=url`、`reason=cd2_hit`、`source kind=cd2-url`；embedded libmpv/core-playing 与 playback advancing 通过。真实 inspect 为 `logged-in`、非管理员、Session 可见、WebSocket 在线、远控有效；Play、Pause、Seek、Resume、NextTrack、Stop 全部通过，两个 Item/MediaSource/PlaySession identity 由实际开始/停止报告保持，10 条报告全部接受，Stop 后 NowPlayingItem 清空。一次首请求 cold timeout 在重复运行中未复现，最终验收以两个样本均 `cd2_hit` 的重复结果为准。

没有修改服务器、CD2 配置、mount、cache、账号、媒体库或网盘数据；没有新增 multi-mapping、retry、refresh、DirectUrl、headers、音轨或设置 UI。未发现新的跨层生命周期、Session identity 或 PlaybackManager/libmpv correctness 问题，没有升级到 Sol High。

Model Tier: 1
Model: current Codex session
Reason: explicit single-prefix mapping contract and bounded real acceptance rerun
Escalated: no

## 2026-09-14 — persistent profile inspect 修正与 PR #2 真实验收复核

保持 `feat/cd2-resolver`，先复核 worker 未提交 diff，再补充 persistent profile inspect 的 targeted test 和 POSIX Mount 边界回归。`inspectAcceptanceProfile` 现在必须同时取得 API client 并成功解析 `getCurrentUser()` 用户对象才报告 `loggedIn=true`；拒绝、超时、空用户、缺少 API、loader/client 异常统一收敛为安全枚举，结果字段仅有 `loggedIn` 与 `reason`。`accept-live.ps1` 使用 LocalApplicationData 下的固定 acceptance profile，profile 不存在、inspect 失败和手动登录入口均不回显 profile 路径或认证材料。

POSIX 回归确认 absolute `MediaSource.Path` 仍作为 CD2 candidate 发送；CD2 miss 后不会进入 Windows `existsSync` Mount flow。UNC source 仍可在存在时命中 Mount。Node tests 为 43/43，JS/PowerShell 语法和 `git diff --check` 通过；当前工作区源码构建的隔离 runtime 为 2156 个 manifest payload（含 `build-manifest.json` 共 2157 个文件），runtime `mount-resolver.js` 与 source hash 一致并包含 POSIX guard。

同一个 persistent profile 的真实 inspect 返回 `logged-in`。随后真实 Emby acceptance 选择两个 POSIX STRM 样本，inspect、Session/WebSocket、Play、Pause、Seek、Resume、NextTrack、Stop 和 10 条真实播放报告全部通过；resolver 两次记录 `cd2=mapping_miss` → `mount_missing` → native URL。脱敏 select 复核显示两个 `Item.Path` 命中当前 sidecar 前缀，但两个 `MediaSource.Path` 未命中当前 source-side mapping，因此没有把 native fallback 记为真实 CD2 source hit。

当前剩余 blocker 是与实际 `MediaSource.Path` 匹配的 POSIX→CD2 source mapping 未确认。没有修改服务器、CD2、mount、cache、账号、媒体库或网盘数据；没有发现新的跨层生命周期、Session identity 或 PlaybackManager/libmpv correctness 问题，没有升级到 Sol High。

Model Tier: 2
Model: current Codex session
Reason: persistent acceptance, real Emby Session/WebSocket/control evidence, and resolver source-identity boundary
Escalated: no

## 2026-09-13 — PR #2 merge-blocker 修正与真实媒体诊断

保持 `feat/cd2-resolver`，没有同步 `origin/main`，也没有修改另一会话正在维护的 `AGENTS.md` 或 `docs/AI_MODEL_POLICY.md`。本轮关闭三个代码 blocker：仅 terminal `PlaybackManager.prototype.stop()` 增加 request invalidation，新 Play 内部 previous-player stop 不受影响；非 Abort 的 IPC/transport reject 转为安全 `transport_error` miss 后继续 Mount → Native，Abort 仍向上终止；空/缺失 cloudPrefix 为 `missing_mapping`，显式 `/` 保持合法。

真实 Emby 只读选择新增证据：两个 STRM 样本的 Item.Path 与 MediaSource.Path 都是 absolute POSIX，而不是 Windows drive/UNC。现有 ETLP `src→dst` 与 `dst→cloud` 两段单规则可安全折叠。因此单条 mapping 扩展为 Windows drive/UNC 或 absolute POSIX local prefix；Windows/UNC 大小写不敏感，POSIX 大小写敏感，边界与 `..` 检查一致。带 allowlisted 媒体后缀的 absolute POSIX MediaSource.Path 成为确定性 CD2 candidate，在 Windows Mount 中仍自然 miss；未增加第二条 mapping、regex、扫描或自动学习。

targeted tests 为 38/38。独立 frozen Stop-before-player 测试使 PlaybackInfo pending，执行真实 PlaybackManager Stop 后再释放响应，断言 Promise 收束、`player.play` 未调用、无 Playing report。transport reject 分别验证 Mount 与 Native，Abort 不 fallback；cloudPrefix 空/显式 root 与 POSIX 边界均覆盖。完整 CD2 hit、Mount、Native、generation/cancel、双 NextTrack 和报告回归串行通过；其中一次可见 Electron 在 STRM 阶段偶发超时，同参数串行复跑通过并保留失败证据。

真实 CD2 media 诊断使用有限 80 目录/2000 entry 范围内的普通 `mkv-medium`。final frozen runtime 观察到 resolved path 被 mpv 接受、file-format=MKV、13 tracks（1 video/1 audio）、`core-playing` event、`core-idle=false`、cache state/time 与 time-pos 推进，未观察到 EOF/error。Pepper bridge 不暴露 start-file/file-loaded/end-file/log-message，所以 start/end 标记为不可直接观察，file-loaded 由 format+track list 推断。默认音视频轨存在，本轮未处理用户另报的手动音轨问题。

真实 Emby 全链只在独立 media 成功后尝试。两次均在 inspect 阶段返回 `not-logged-in`，未选择播放、未触发 CD2、未产生新 Playing/Progress/Stopped；0 残留进程。因此真实 Emby CD2 hit、Session、WebSocket、controls、reports 保持未验收，原因是当前登录态不可用，不是 media/core-playing 失败。

最终候选与 repeat 各 2156 个 manifest 载荷、0 SHA256 差异、0 runtime native addon。隔离 installer SHA256 与 payload 结果见最新 Packaging/Testing 记录。本轮未修改 CD2 配置、mount、cache、账号、媒体、Emby metadata、权限或服务器配置。

Model Tier: 2
Model: GPT-5.6 Sol
Reason: merge-blocking PlaybackManager race, resolver fallback correctness, real mpv event diagnosis and real Emby acceptance
Escalated: no

## 2026-09-13 — CloudDrive2 Resolver PR #2 实现与验证

从已推送的 `main` 文档基线 `6888780` 创建 `feat/cd2-resolver`。本轮实现 `CD2 same-origin HTTP → Mount → Native`，Transcode 永远 Native；没有实现 DirectUrl、User-Agent/additionalHeaders、expiresIn recovery、115 Open API、refresh/retry、复杂 mapping、设置 UI、自动发现或 cache 管理。

产品实现：精确锁定 `@grpc/grpc-js@1.14.4` 与 `@grpc/proto-loader@0.8.1`；Electron main process 持有 token、proto、channel、metadata 与 active calls，renderer 只通过可信 sender 的 `resolve/cancel` IPC。main 完成同步读取/预加载后立即删除 `process.env` 中全部 `ETE_CD2_*` 输入，防止 renderer 继承 token、origin 或 mapping。V1 使用 Apache-2.0 ETLP beta 快照中的最小 CloudDrive2 1.0.13 wire schema，SHA256 固定；官方下载的 1.0.14 proto 已做 diff，两个 V1 RPC 与关键 field numbers 未变化。单条 mapping 支持 drive/UNC、大小写不敏感、严格边界、拒绝 `..`，cloud path 使用 POSIX normalize。只调用 `FindFileByPath` 与 `GetDownloadUrlPath(get_direct_url=false)`，只接受同 scheme/host/port HTTP(S) URL。

异步生命周期：PlaybackManager build overlay 为每次播放生成 request id，并在异步阶段和 `player.play` 前拒绝 stale request；libmpv 在 `self.play` 开头同步建立 monotonic generation/AbortController。新 Play、NextTrack、Stop、destroy 会 invalidate 旧 generation、取消 active unary call并移除旧 `core-playing` listener；每个 await、fallback、`currentSrc` 与 `loadfile` 前复核。readiness 200ms、Find 350ms、download 300ms 共用 750ms absolute budget；grpc/proto 在 CD2 enabled 时于 main 启动预加载，connection-refused 的 playback 阶段断言在 500ms 内 fallback，冷 require/parse 时间不计入起播 budget。

自动验证：Node 33/33；修改 JS 与 build overlay 输出语法通过。fake HTTP 覆盖 200/206/404/500/timeout/307；fake gRPC 覆盖 found/missing/directory/UNAVAILABLE/deadline/slow/late/malformed/cancel。frozen Electron 18.3.15 / Node 16.13.2 中 grpc-js/proto-loader require、Bearer metadata、两个 unary RPC、same-origin result 和 0 native addon 通过。CD2 hit fixture 验证 7 resolve、3 active cancel、0 active leak，A→B、Stop、旧 core listener、双 NextTrack 只允许最新 source；Play/Pause/Seek/Unpause/NextTrack/Stop、Item/MediaSource/MediaSourceId/PlaySessionId 与 19 条模拟报告保持。CD2 miss → Mount 与 CD2 miss → Native 分别通过。

构建与 installer：最终 `pr2-k/l` 各 2156 个 manifest 载荷，逐文件 SHA256 0 差异；连 build-manifest 共 2157 文件，production closure 为 33 个纯 JS package、0 `.node` addon。隔离 Inno setup 编译成功，SHA256 `7db35eb258a4c245e04c55fc3fa04d34ee18724be650330fdb581ecbf76cd515`；innounp 解包的 2157 个 `{app}` 文件与 `pr2-k` runtime 全部逐哈希一致。本轮未运行 installer 或修改系统安装。

真实 CD2：仅在内存读取既有 token，临时 mapping 命中；最终 frozen runtime 的 `FindFileByPath`、`GetDownloadUrlPath(false)`、same-origin HEAD 200、Range 206、无重定向通过。没有修改 CD2 设置、mount、cache、账号或网盘数据。真实 CD2 source 已在隔离播放器中成为 `currentSrc`，但同一样本在 45 秒内未产生 `core-playing`；因此 real Enhanced CD2 playback 未通过，真实 Emby Session/WebSocket/controls/reports 未执行。两次此类超时均保留在 ignored `.work`，不写入公开敏感细节。

曾有一次并行启动两个可见 Electron fixture 导致 Mount suite 超时；按既有规则清理确认 0 残留进程后串行重跑通过。另有测试编排的 drive-root 与拼写错误在发出媒体请求前安全失败，修正后真实只读 smoke 通过，均未当作产品成功证据。

Model Tier: 2
Model: GPT-5.6 Sol
Reason: main-process gRPC, renderer/main IPC, PlaybackManager and libmpv generation, native fallback and frozen runtime packaging span multiple layers
Escalated: no; this task started at the approved Tier 2 level

## 2026-09-13 — CloudDrive2 Resolver Sol High 架构评审

在 `main == origin/main == 7670d42`、工作区仅有既有调研文档改动的基线上完成 Tier 2 / Sol High 评审。本轮没有修改 `src/`、`package.json`、CD2 配置/mount/cache、Emby/服务器配置或网盘数据，没有执行 refresh、真实 Enhanced 播放、分支、commit、PR、发布或安装。

复用一个现有 115 媒体样本，对同一文件分别执行 `GetDownloadUrlPath(get_direct_url=false/true)`。`false` 返回同源 `downloadUrlPath`，HEAD=200、单字节 Range=206，无重定向和额外 header。`true` 额外返回 provider/external HTTPS DirectUrl、专用 User-Agent 和分钟级 expiresIn，additionalHeaders 为空；裸 URL 的 HEAD/Range 均为 403，携带返回 User-Agent 后 HEAD 仍为 403、Range 为 206，交叉顺序复测两次一致。所有 token、完整 URL/query、媒体名、账号和私人路径只在内存中使用且未输出或落盘。

Transport 结论：固定 `@grpc/grpc-js@1.14.4` + `@grpc/proto-loader@0.8.1`，放在 Electron main process，通过窄 IPC 服务 renderer。临时隔离 smoke 使用随包 Electron 18.3.15 / Node 16.13.2、repo proto 1.0.13 调用 runtime 1.0.15，Bearer metadata、unary RPC、deadline 和 insecure localhost HTTP/2 成功，无 native addon。`grpc-web` 因 wire protocol 不同且需要代理而不采用。临时依赖只位于 ignored `.work`，完成后清理。

架构结论：115 DirectUrl 分类为 Level B，但因专用 User-Agent、分钟级有效期及当前 Pepper bridge 只能把 command 参数转成字符串，DirectUrl 不进入 V1。PR #2 建议实现 `CD2 same-origin HTTP → Mount → Native`；Transcode 永远 Native。异步接入必须在 PlaybackManager 与 libmpv 之间共享单调 generation/request id，Stop/NextTrack/新播放立即取消旧请求，并在每个 await 后和最终 `loadfile` 前拒绝 stale response。建议总 lookup budget 750ms，不 retry、不 refresh、不持久或跨播放缓存 URL。

Model Tier: 2
Model: GPT-5.6 Sol
Reason: gRPC packaging, proto/runtime drift, provider HTTP headers/expiry, PlaybackManager/libmpv asynchronous lifecycle and native fallback span multiple layers
Escalated: yes, from the prior Tier 1 research

## 2026-09-13 — CloudDrive2 Resolver 调研完成

按当前主线任务书优先审计 `hope140/embyToLocalPlayer` 的 `beta` 分支，研究快照为 `54b2abae0537f1b4c65752edaac059d3cda4790e`。本轮只做设计和只读验证，没有修改 Enhanced 产品源码，没有执行 CD2 refresh，没有进行 Enhanced + CD2 实际播放集成，也没有修改本机 CD2 配置、挂载、账号或媒体数据。

新增 `docs/CD2_RESEARCH.md`，记录 ETLP 的完整 STRM → local path → path_map → gRPC → HTTP download URL → 外置播放器调用链，以及路径推导、mapping、refresh、headers/Range/auth、fallback、禁止迁移逻辑、Enhanced V1/V2 边界和 fake/real 测试方案。

本机只读结果：CloudDrive2 service 为 Running/Automatic，运行时 RPC 版本为 1.0.15；19798 的 HTTP 与 gRPC 可用，配置中的 19799 在探测时未监听；存在一个已挂载的 Windows drive-letter mount。使用运行 ETLP 配置的现有 token 仅在内存中查询一个媒体样本，`FindFileByPath`、`GetDownloadUrlPath` 成功，返回同源 HTTP URL；HEAD=200，单字节 Range=206，支持 `Accept-Ranges: bytes`，本次没有额外 HTTP headers 和重定向。当前 ETLP 一条 path_map 对该样本没有命中，因此 mapping 是后续实机命中的前置条件。敏感 token、URL、路径、账号和媒体名未写入文档。

ETLP beta 的 CD2 client/gateway 测试使用 fake/stub，`test_strm_media_path`、`test_clouddrive2_client`、`test_clouddrive2_gateway` 通过。当前结论为 **Need Sol High review**，原因是 Python cp39-win32 `grpcio` 与 Enhanced Node/Electron 不兼容，以及 proto/runtime 漂移、Range/临时 URL、可选动态 headers、refresh stream 和 PlaybackManager source-only 接入存在跨层风险。调研完成后按任务要求停止，等待主线程审核。

Model Tier: 1
Model: GPT-5（当前 Codex 会话）
Reason: research contract and evidence boundary were explicit; implementation was intentionally out of scope
Escalated: no

## 2026-09-13 — PR #1 边界修正与真实 native smoke

根据主线程复核修正当前 PR 的两个边界：Mount 规则改为按优先级逐条生成并立即执行 `existsSync`，高优先级 sidecar 命中不会被后续 sourcePath 解析失败推翻；候选扩展改为明确音视频 allowlist，`.txt`、`.nfo` 等文件即使存在也不作为 Mount source。

新增回归覆盖 malformed/unsupported sourcePath 的优先级短路和非媒体扩展误命中。Node 单元测试 19/19 通过；包含修正的隔离 frozen Electron runtime native fallback 与 Mount-hit 两套测试通过，PlaybackManager、Session/control 和 20 条模拟报告保持通过。

随后使用现有 Enhanced 登录态进行最小真实 Emby smoke。只读检查确认非管理员、WebSocket 在线，选取 2 个 STRM 样本；样本 `Container=mp4`，`MediaSource.Path` 为当前规则不可解析的 other 形态。实际播放为 DirectStream，最终 source 类型为 URL，证明本次真实播放走 native fallback；Play、Pause、Seek、Unpause、NextTrack、Stop 全部通过，10 条播放报告被接受，停止后状态清理通过。当前条件没有自然 Mount 映射，real Emby Mount hit pending；未修改服务器配置、媒体库、权限、元数据或用户认证材料，未写入公开 evidence。

Model Tier: 1
Model: GPT-5.6 Luna Max
Reason: boundary corrections were explicit and the real smoke reused the existing acceptance harness
Escalated: no

## 2026-09-13 — STRM Mount Resolver 第一版

按用户确认的 `feat/strm-mount-resolver` 规格，在 repo-local Git identity `hope140 <hope140y@outlook.com>` 下实现最小确定性 STRM Mount Resolver。Resolver 只在 `libmpv.playInternal(options)` 的最终 `loadfile` 前替换 source，继续沿用 PlaybackManager、Item、MediaSource、PlaySessionId、字幕/音轨、offset、播放上报和远控链路。

完成内容：

- 新增 `src/electronapp/resolvers/strm-resolver.js`，按 `Item.Path` `.strm` 后缀或 `MediaSource.Container=strm` 判定 STRM，并统一 native fallback。
- 新增 `src/electronapp/resolvers/mount-resolver.js`，依次支持 sidecar stem、明确 Windows/UNC `sourcePath`、URL pathname 文件名及 `name`/`filename`/`file_name`，仅 `existsSync` 命中才返回 local。
- Transcode、缺字段、非法 URL、解码异常、文件不存在和 Resolver 异常均保留 `options.url`；诊断只记录脱敏的类型、reason、存在性和 fallback 状态。
- 扩展 Node 单元测试和隔离 PlaybackManager runtime 夹具，覆盖普通媒体、STRM native fallback、Mount 命中、Session/control 状态保持和 20 条模拟上报。

验证：Node 单元测试 17/17 通过；修改 JS 与 PowerShell 语法检查通过；隔离 frozen Electron 的普通视频、STRM Mount、PlaybackManager 上报、Pause/Seek/Unpause/Stop/NextTrack 通过。隔离 runtime 不是真实 Emby 服务器 Mount 验收，真实 Mount 样本、字幕/音轨差异、换流重入和长时间稳定性仍待实机验证。没有实现 CD2、外部播放器、Session 模拟或服务器改动。

Model Tier: 1
Model: GPT-5.6 Luna Max
Reason: task contract and acceptance criteria were already explicit
Escalated: no

## 2026-09-13 — 开源基线与模型策略

建立公开源代码基线的许可证和公开范围：官方 Windows/Electron 对照仓库均为 GPL v2，维护源码未证明 `or later` 授权，故新增根 `LICENSE` 并采用 GPL-2.0-only。新增 `THIRD_PARTY_NOTICES.md`、`docs/LICENSING.md`，将 vendor 输入、二进制、构建产物和 E 类完整离线 Web snapshot 排除在首个公开提交外。更新 README 的非官方声明、`.gitignore`、测试输出路径与真实验收文档表述；没有修改播放、Session、libmpv 或 Resolver。

新增 `docs/AI_MODEL_POLICY.md`，并在 AGENTS/DECISIONS 中固定 Tier 1 默认、Tier 2/3 升降级规则与重要任务留痕字段。敏感信息扫描未发现待公开文件中的实际认证材料；测试中仅有刻意构造的脱敏样例。

Model Tier: policy
Model: current Codex session
Reason: licensing evidence, public-boundary audit, and acceptance-document reconciliation
Escalated: no

本轮建立本地 `main` 的公开源代码基线并创建带注释的 `v0.1.1-baseline` 标签；没有配置 remote、推送或创建 GitHub Release。提交只包含已审计范围，提交署名使用项目中性 noreply 地址而非本机个人 Git 身份。

公开审核清理后，确认用户提供的 GitHub remote 无既有 branch/tag，再以普通 fast-forward 初次推送 `main` 和 `v0.1.1-baseline`。没有 force push，也没有创建 GitHub Release。公开版本移除了真实媒体样本名称、内部 Item/MediaSource/PlaySession 标识及其原始 JSON evidence；补充 source-governance baseline 的不可独立构建说明，并审计公开 B 类文本代码的 GPL 修改声明。

## 2026-09-13 — 真实 STRM 与后台控制验收完成

用户登录非管理员账号，授权任意库内影视并说明全库 STRM；WatchTogether 按后台控制正常验收。只查有限候选并使用两个不同 STRM 样本。真实 DirectStream 播放、服务端进度、Pause/Seek 60 秒/Unpause/NextTrack/Stop 均通过；10 条真实播放报告全部被接受，逐 Item 的 MediaSource/PlaySession 一致。另做可见画面检查，确认 gpu-next、d3d11va 与正确 3GiB 缓存诊断。

新增 live 验收工具，凭据仅由原客户端读取，不输出、不复制。初次工具 app name 错用 package.name，导致 HTTP/WS Session 分裂；改用 productName 后完整通过，没有改产品源码或服务器权限。通过报告按白名单沉淀为 docs/evidence/live-acceptance.json。保留用户播放进度，停止测试播放并恢复普通启动。0.1.1 构建哈希不变，无需重建。第一轮按最新用户确认口径关闭；普通文件库内无样本、HDR和插件双端同步精度未覆盖，Git提交发布未授权。

## 2026-09-13 — 最终证据整理

补齐 `docs/evidence/first-round-followup.json`，记录实际媒体测试、客户端 fixture 上报、诊断、安装/覆盖/卸载和最终安装包 SHA256。复核测试安装目录与注册表记录已移除、无测试 host 残留、个人 mpv.conf 哈希未变。0.1.1 最终 runtime 与重复构建 1013 文件一致；安装包实际解包 1012 载荷全匹配。继续入口是用户登录并指定真实样本，无需重复已通过的本地测试。

## 2026-09-12 — 第一轮继续收尾，0.1.1

用户指出仍有本地工作可推进，要求继续完成第一轮。先修正上一轮“本地可做的工作全部完成”的过满表述，继续处理已知问题。随后用户表示会自行登录 Enhanced 并指定真实样本，并明确授权独立测试目录安装/覆盖/卸载。

完成：

- 同一个实际 embed 上核对 900/2048/3072/4096/8192MiB，证明 native 缓存属性正确，bridge 回传 int32 截断。诊断改为自有瞬态 user-data 文本快照，安全整数验证后记录精确值及 legacyValue；读取前清空元数据槽，防止失败后误读旧值。
- 回复直接限定到目标 embed，同 embed 的 ready/playing 采集串行；unsupported、超时仍不阻塞播放。空 shader 数组正确记录 configured=false。
- 依据该 mpv revision 的源码确认 Windows Known Folder 默认路径，测试改用子进程 MPV_HOME；bilinear 与配置标记已实测通过。正式启动未改画质或个人配置。
- 新增真实 PlaybackManager、ApiClient 播放报告序列化及 input/api.js 消息分派的 fixture 集成测试。普通视频和 STRM 两项均 DirectPlay；source 与 Item.Path 保留；开始/进度/停止报告的 ItemId/MediaSourceId/PlaySessionId 一致；Pause/Seek/Unpause/Stop 和 NextTrack 全部通过，共收集 20 条模拟上报。
- 单元测试 8/8 通过；最终修改 JS 语法检查通过。新版独立合成视频与配置/容量测试通过。原 Windows host 启动检查通过，1 host + 4 Electron 进程与诊断日志存在。
- 0.1.1 runtime 重复构建 1013 文件 SHA256 全一致；安装包 123972095 bytes，SHA256 `84bfd2970d6d31277fe43fffdd9f1b20f608458d070986a62d318181d3bd5701`；解包与实际安装均核对 1012 个载荷文件。
- 在授权独立目录先安装 0.1.0，再覆盖到 0.1.1；注册表版本/路径、桌面与开始菜单快捷方式通过。实际执行已安装快捷方式，launcher exit=0，Windows host/Electron/诊断日志通过。卸载 exit=0，目录/注册表/快捷方式均清理；新建的 Enhanced profile 保留供后续登录，个人 mpv.conf SHA256 未变。

测试期间发现的夹具问题及边界：未提供 Windows host 的 Electron-only fixture 不能依赖 localhost:8154 文件探测，因此使用随机 localhost HTTP 媒体源；HTTP endpoint 标记错误时走 DirectStream 请求不存在的 fixture API，修正输入后通过。未登录场景的 OSD 导航单独替换，其他产品播放链未改。一次 UI 与 host 测试并行后启动超时，后续媒体验证顺序执行成功。保留失败证据，不把它们写成产品功能验收成功。

尚待真实 Emby 普通视频/STRM、实际 Session/WebSocket、后台远控与 WatchTogether；用户将登录并指定样本。没有创建 Git 仓库、commit、PR 或远端发布。所有真实服务器操作仍等待样本范围。

## 2026-09-12 — 第一轮本地准备与开发

任务输入为第一阶段任务书及本地两个归档。开始时目录只有 SFX 与综合补丁 ZIP，没有 Git 仓库、分支或提交。按本地开发范围执行，未将任务书的 commit 示例视为授权。

完成工作：

1. 保存原件并核对 SHA256，Carnival 解包 1234 条目/1009 文件、补丁 51 文件；未执行原安装/恢复脚本。
2. 下载固定官方参考，逐文件分类，22 A / 29 B / 126 C / 17 D / 815 E；导入可维护 src/electronapp，vendor 只读及忽略规则。
3. 吸收已核验 toast、apiclient、3072MiB 选项和新版 libmpv；建立 prepare/build/package/installer/启动入口。
4. 禁用外置自动注册和模块实例调用；保留旧代码、Remote Control 与 shared shell。
5. 建立运行时版本与 ready/playing 容错诊断、日志脱敏和 4 项单元测试。
6. 完成播放链、Session/WebSocket、外置禁用、libmpv 与未来 Resolver 插入点文档。

实际验证：

- PowerShell 5.1 构建成功；重复构建载荷 1013 文件全哈希一致。
- Inno Setup 6.7.3 编译成功，setup 123990793 bytes，SHA256 `f120c2b0f4ba46e8153bcb451e9cb0a06fee1a2987753c303965c0177a2dfb66`。
- 安装包解包后 1012 个载荷文件全哈希匹配。未运行安装器。
- Electron 启动、离线 Web UI、插件列表检查通过，启动截图已查看。版本 18.3.15 / Chromium 100.0.4896.160 / Node 16.13.2。
- 独立 libmpv 插件合成媒体播放推进、pause、seek、resume、stop 5 项通过；取得实际 GPU 与视频输出属性。
- 原 .NET host 在唯一测试副本运行，10 秒后 host 存活、4 个 Electron 进程、诊断日志存在；退出时只终止该副本内的进程。
- DLL probe 得到 API 2.5、mpv v0.41.0-920-gdd5d17d32；unsupported 版本属性如实返回 unavailable。
- 诊断与外置禁用测试 4/4 通过；修改 JS 语法检查通过。

处理中发现并保留的证据：

- PowerShell 5.1 默认编码误读中文 manifest 文件名，构建改为显式 UTF8 后成功。
- 隐藏窗口合成媒体超时；可见窗口成功。
- 首次可见媒体测试使用已注册插件，停止事件进入需要 API client 的 PlaybackManager，未登录上下文抛 getSavedEndpointInfo；测试改为独立实例后全部动作通过。产品 PlaybackManager 未因此修改。
- 临时 APPDATA 不能证明 native mpv 配置隔离；ready 值与现有用户配置对应。个人 mpv.conf 未修改。
- demuxer-max-bytes 回报 -1073741824，疑似 bridge 32 位数值回报问题，实际缓存影响待查。

尚未完成：系统安装/升级/卸载、真实 Emby 普通视频和 STRM、真实后台 Session 与远控、EmbyWatchTogether、完整 mpv.conf 路径追踪和画质效果验收。第一轮处于本地开发完成、真实验收待关闭的状态。

Commit 列表：空。未初始化 Git，未提交、推送、创建 PR、发布或修改服务器。
