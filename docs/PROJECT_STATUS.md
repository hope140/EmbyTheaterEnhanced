# 项目状态

## 2026-10-09 — grpc-js与About本地维护交付完成

从main bc50d181建立独立维护分支，grpc-js精确更新1.14.6，About按构建来源显示包内版本及独立运行状态。定向69项、About/metadata15项、全量638/638与npm audit退出0通过；产品sourceCommit 7ec6ace，新runtime和本地安装候选完成。八组串行隔离回归自然退出、残留0；2137文件解包比较全部一致。详见 [维护记录](MAINTENANCE_GRPC_ABOUT.md)。

## 2026-10-09 — PR #20 已合并到 main

用户明确确认合并后，于22:22:16（UTC+8）将 [PR #20](https://github.com/hope140/EmbyTheaterEnhanced/pull/20) 以merge commit合入main。合并提交为 `bc50d181cd5cafd14b31e2c0d24cbf7fd73b0ee1`，父提交依次为原main `46e995e` 和已审阅整合提交 `45ec2d6`；保留完整发布与整合历史。

合并后main整棵Git tree与45ec2d6完全相同，原631/631测试证据、六棵产品/工具/测试目录树及34项构建输入的身份关系保持。本轮没有重新测试、构建或启动客户端。远端回读确认PR已合并，8个Release与15个附件不变，v0.2.6产品仍为355f4e6，Latest仍v0.2.2；除main和GitHub自动移除的PR临时merge ref外，其余远端refs保持。合并回执保存在本地 `.work/pr20-merge/verification.json`。

用户已反馈正在实际使用、暂未发现新问题；该反馈不扩大为真实服务、远控、可见首帧连续性、HDR/多屏或系统安装生命周期的逐项验收。既有直接app.exit UNKNOWN及第三方材料缺口继续保留。以下记录保留各阶段当时的状态。

## 2026-10-09 — v0.2.6 主线整合审查

从完整发布分支4b24919建立独立 `codex/integrate-v0.2.6-main-20261009`。远端main46e995e即merge-base，main独有0、发布分支领先81，开工open PR为0；保留完整历史，无需冲突解决。main到发布树172文件范围及PR合并判定见 [整合报告](MAIN_INTEGRATION_026.md)。

本轮完整单测日志为631/631，0失败/取消/跳过。产品、测试、工具等六棵Git tree和34项构建输入与355f4e6相同；原runtime2136文件、原安装器及八组运行的69份artifact重新回读hash通过。16份原harness输入精确匹配历史hash；新checkout其中6份仅CRLF/LF变化，物理与canonical身份分别记录。原runtime继续归属355f4e6，本轮没有构建或启动客户端。

当前审查未发现产品整合阻断，仅修正文档阶段、CHANGELOG与验收入口遗漏。[PR #20](https://github.com/hope140/EmbyTheaterEnhanced/pull/20) 已创建并附加，OPEN / 非Draft，创建回读MERGEABLE / CLEAN；无check runs/statuses/workflow，不能记CI通过。原36项refs、8个Release及15个附件保持，Latest仍v0.2.2。技术合并条件满足，main合并仍由后续明确操作决定。早期直接app.exit UNKNOWN、真实服务/远控/可见呈现/系统安装/HDR/多屏边界保持。以下为按发生阶段保留的历史记录。

## 2026-10-09 — v0.2.6 Pre-release 已发布并完整回读

用户授权将已验证的本地包按原字节发布。v0.2.6于21:20:19（UTC+8）发布为Pre-release，Release ID407934479，tag精确对应产品 `355f4e6ba434074d1cd5c17e24cd79bad0f5eb1f`。安装包175621807 bytes，SHA256 `bc878b4e929016071b8d7a41f9b281ad3118e62e8a1e469b0a5c9858718b1532`。

EXE、同名SHA256与provenance三个附件均uploaded且服务端digest匹配；三个文件从公开URL完整重新下载后hash也全部匹配。原7个Release、12个附件与33个refs保持；正式Latest仍v0.2.2，main仍46e995e。本轮不改产品或重建包，不扩大系统安装/真实服务/视觉验收。下载和准确分层见 [0.2.6发布记录](RELEASE_026.md)。

## 2026-10-09 — 0.2.6 本地可安装测试包交付完成

最终产品sourceCommit为 `355f4e6ba434074d1cd5c17e24cd79bad0f5eb1f`，版本0.2.6。交付目录 `dist/delivery-0.2.6-355f4e6/`，含setup.exe、同名SHA256/provenance、SHA256SUMS、中文使用说明、验证报告和结构化证据。安装器175621807 bytes，SHA256 `bc878b4e929016071b8d7a41f9b281ad3118e62e8a1e469b0a5c9858718b1532`。

全量631/631、0失败/跳过。最终runtime三场景正常关闭及五组完整pipeline均PASS、自然exit0、无强清理、残留0；每组pipeline五对完整Session独立复算，Next/generation/精确取消和DirectUrl隔离保持。安装器完整性及2136文件解包逐项一致，运行后payload校验和交付文件重新读回通过。23个EXE/DLL与68eb024同hash；产品JS仅native service的关闭等待归属变化。

正常产品关闭路径本轮完成隔离验收；初版8700039及旧d480eb8的直接app.exit退出超时仍UNKNOWN，原失败与工具门槛纠正记录单列。真实服务/远控、可见首帧/连续性、HDR/多屏、系统安装/升级/卸载未执行。本地交付阶段尚未推送、合并或发布，后续发布结果见上方记录。最终报告见 [0.2.6本地包](LOCAL_PACKAGE_026.md) 与 [结构化证据](evidence/local-package-026-20261009.json)；下文保留前序阶段记录。

## 2026-10-09 — 0.2.6 本地可安装候选构建中

ac865c4八组正常关闭/完整pipeline均PASS，原证据保留；随后按父会话精确复核补齐多pending实例中一个拒绝时仍等待其余实例settled的错误边界，35例修改前34/1、修改后35/35。Stop后先退出native再关窗是正常顺序，verifier已按clientId配对纠正，工具36/36。正在固定新最终source重建，不沿用ac865c4产物标签或验收身份。

进一步实测7b3a2dc共享destroy后，renderer destroy先清空client但owned kill仍pending，正常playing关闭依然缺native completion。一次固定caller观察确认为destroy-client。现补齐完整service destroy对已在进行的renderer client清理的等待，最终33例修改前31/2、修改后33/33；7b3a2dc失败runtime保持，最终需以新提交重建再验收。

初版8700039正式runtime/安装器已生成并保留。最终hit0播放断言成功但app.exit后OS超时，完整runner FAIL；因此该UNKNOWN也发生在本次0.2.6，不能只归属旧d480eb8。正常关闭强化检查另发现playing时main closed已启动destroy，而before-quit重复destroy提前返回、没有等native child退出。最小修复缓存完整destroy Promise，同一31例修改前28 PASS/3 FAIL、修改后31/31；原错误短路和播放链不改。新产物必须重建，初版不覆盖。后续固定最终五组完整pipeline通过产品窗口关闭收尾，另做idle/playing/stopped三场景；原pipeline/Next/generation/取消/五对Session断言全部保留。

从准确99cb850建立独立工作树，保持已复核播放实现。正常关闭三个初始预检在只读68eb024 runtime均通过原门槛：before-quit/will-quit及五类IPC清理已观察，OS自然exit0、零残留；当时未核对native child实际清理Promise完成，不将预检替代强化验收。app.exit停滞仍UNKNOWN。

本次版本0.2.6，整合05a08e9第三方材料报告与必要通知，原0.2.4证据身份不改。固定工具链已核对；后续从本次已提交输入正式build/package，运行五组播放与三组正常关闭，校验安装器解包。计划、来源和边界见 [0.2.6本地包](LOCAL_PACKAGE_026.md)。

## 2026-10-09 — Stop 归属候选完成，退出停滞边界已取证

本地分支 `codex/stop-ownership-20261009` 从准确 60acba5 继续；产品 sourceCommit 为 `68eb0249f8392480154513f3df267204a0f0eb74`，版本保持 0.2.5。修复同一旧 stream 的并发 Stop 回调、无标签 stopped 事件与重复报告归属，保留最新 Native presentation preparation 和 terminal queue/player 收尾。相同回归修改前 8/16、修改后 16/16；全量 608/608，独立核心复核通过。

正式 runtime `dist/ETE-0.2.5-stop-owner-68eb024-win-x64` 构建、source/runtime/native/Electron/版本、package 与运行后 2136 文件检查通过；对 d480eb8 仅 PlaybackManager 及六份来源/清单记录变化，23 个二进制全部一致。新候选 miss400、hit0/400/800、direct400 五组完整 PASS，均自然 exit0、残留0；每组普通/STRM/A-B-C共5对完整会话，迟到额外 play、pending/重复/未配对报告为0。

旧 d480eb8 的一次固定 hit0 对照复现退出停滞：11.7秒前后结果落盘、app.exit调用/返回与Node exit/Electron quit回调已完成，OS根进程到120秒仍未退出，精确归属强清理后残留0。原因仍 UNKNOWN，新候选五次自然退出不关闭该问题；正常产品 before-quit 关闭链未验收。六次计划均已执行，没有增加重复运行。完整结果与可复算哈希见 [Stop 与退出报告](STOP_OWNERSHIP_EXIT_EVIDENCE.md) 和 [结构化证据](evidence/stop-ownership-exit-20261009.json)。当前交付为本地可审阅候选。

## 2026-10-09 — 请求与会话局部修复完成，退出异常单独保留

从准确af688c8建立独立 `codex/playback-session-20261009`，产品sourceCommit=d480eb8，版本保持0.2.5。每次请求保留独立身份，pending清理不再生成空身份Stopped，已开始会话和错误收尾保持。基线回归2/7、候选7/7；最终全量593/593、0跳过，来源/版本及2136文件payload检查通过，独立核心复核无明确问题。

五种场景的播放与Session断言均PASS，pending Stop为0、每轮5组完整Started/Stopped。首轮完整runner仍4PASS/1FAIL：hit0成功报告落盘后退出超时，强制收尾残留0，原因UNKNOWN。一次同产品/同harness的独立hit0复验完整PASS、自然exit0、残留0；五种参数均取得通过样本，但原退出失败不覆盖，稳定性继续观察。真实服务/远控、可见首帧、系统安装未执行。完整runtime与各层证据见 [修复记录](PLAYBACK_REQUEST_SESSION_FIX.md)。

## 2026-10-09 — 隐藏 runner 修正，产品矩阵仍有明确失败

在独立 `codex/runner-determinism-20261009` 完成工具/测试修正：明确 pending/cancel 请求门槛、重叠与顺序 Next 分开、事件/报告条件等待、遵守既有 Stop cooldown、分阶段与总期限、超时失败锁定及有界输出收集。固定产品仍为 v0.2.5 / `3ab10c9`，没有改产品源码、构建覆盖器或 runtime。

全量单测580/580，后续Stop专项3/3，均0失败/跳过；隐藏矩阵 hit 0/400/800ms、DirectUrl 400ms四组PASS，miss 400ms因旧PlaybackInfo再次调用播放器FAIL，**整体保持FAIL**。五轮隔离/About/诊断校验分别通过、残留0；运行后2,136文件与固定清单匹配。完整证据见 [runner记录](RUNNER_DETERMINISM.md)。

待处理的两项产品问题已有本地证据：同一队列item复用可变playOptions，使旧请求被新ID重新认作当前请求；pending播放被替换时，Stopped报告缺少PlaySessionId/MediaSourceId。后者新旧成功样本均存在，前者由新增迟到metadata断言检出；真实服务器影响未验证。不得把四组PASS或单测通过写成完整生命周期验收。新旧失败均保留，未推送、合并或发布；真实服务/安装/前台首帧范围不扩大。

## 2026-10-09 — v0.2.5 Pre-release 已发布

GitHub [v0.2.5](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.5) 已发布，Release ID `407543805`。产品 sourceCommit / tag 解引用均为 `3ab10c94d75659c0a421b729aac3147afa680751`。安装包 `EmbyTheaterEnhanced-0.2.5-test-win-x64-setup.exe` 为175,631,770 bytes，SHA256 `76d7766cc824bf65f585cd89f0e68841628b2063381aa85392513ed1653d0d65`；另提供同名 `.sha256` 和 `.provenance.json`。正式 Latest 保持 v0.2.2，发布来自完整分支，main 仍为46e995e。

本次新提交全量535/535、writer17/17均0失败/跳过；两份runtime各2136文件一致，两份原始installer同SHA；主安装器完整性与2136文件解包全匹配，PE及真实About IPC均为0.2.5并绑定准确sourceCommit。与1a05f88仅8个版本/来源文件不同，应用与播放器二进制字节保持。

隐藏假服务测试首轮queue-play达到25秒超时，复验完成流程但runner仍NOT_PASS：next.selected=false、fake CD2 cancelCount=1，读回3b158f6原始失败记录后断言向量与计数一致。普通/STRM控制、身份/Session报告、generation与Stop防迟到加载均通过；123条诊断、12项关联、两类安全Renderer位置和脱敏另记PASS。appData/userData前置隔离及读回通过、残留0。未改断言或重复跑到通过；真实服务、安装、可见首帧、HDR/多屏保持未验收。发布回读与完整证据见 [0.2.5发布记录](RELEASE_025.md)。

远端三个asset状态/大小/digest与本地匹配，两个companion完整下载一致，tag解引用正确。完整EXE回下载因限速、接收中断与有界时限未完成，未记完整客户端SHA通过。6个旧Release、9个旧asset和30个已有远端refs全部保持，最终文档HEAD只记录发布结果。

## 2026-10-09 — v0.2.5 测试版发布收口

按用户明确发布授权，从完整 `5af8443` 建立独立 `codex/release-v0.2.5-test-20261009`。远端核对最高测试版为 v0.2.4，正式 Latest 为 v0.2.2，无开放 PR；v0.2.5 尚不存在。根 package 与 lockfile 统一为 0.2.5，随包来源索引对应新版本，已知材料缺口保持准确表述。现有产品源码、依赖版本与工具链保持。

本轮将从已提交源码重新执行全量测试、两份独立 runtime / installer 构建、来源与 payload 检查、隔离 About / 假服务运行及发布回读。结果完成后补记，旧 0.2.4 候选的 SHA256 和 PASS 不替代本轮验证。主线仅核对范围；当前发布来自完整发布分支，维持 Pre-release。

## 2026-10-09 — 构建复核与安装器字节重复性完成

从da672d2继续独立`codex/build-review-20261009`，修正通知/config/provenance写入的链接越界与旧产物覆盖边界，并使用Inno6.7.3原生notimestamp消除输入mtime对容器身份的影响。产品sourceCommit为1a05f88357a08f5d7c99a7e5de28de20aad0dc79，版本0.2.4。

writer17/17、最终全量535/535均通过且0跳过。独立runtime各2136文件完全一致；正式安装器A/B各175653917 bytes、SHA256均133a74abb36e18dbd21a186c3b330759a9f213e4d0045c5a9fabcf9db4b04258。A完整性和解包2136/2136通过，B为同字节对照。与3b产物只有6份来源/构建记录改变，其余字节保持。未运行真实客户端或安装；交付和精确边界见 [构建复核](BUILD_REVIEW.md)。

## 2026-10-09 — 构建输入绑定与独立候选

独立分支 `codex/build-hardening-20261009` 从审计基线 `49f643a` 继续。产品提交 `3b158f69e974802ef92a3d8c7ef6815139498d1f` 完成提交输入gate、schema 3 provenance、精确Node依赖、通知随包和完整本地GCC/Inno树固定；版本仍为0.2.4，`src/`、native C++、原vendor清单与依赖版本均未改动。

最终提交529/529全量通过，两个独立runtime各2136文件全路径/hash一致；两份安装器完整性与解包2136/2136逐项比较通过，容器原始字节不同。隐藏fake CD2/合成媒体首轮double-Next selected断言失败，一次有界复验完整PASS；两次结果均保留，最终111条产品诊断合法、隔离读回通过、残留0。准确候选、重复性、P1差异和材料缺口见 [构建修正交付](BUILD_HARDENING.md)。

固定上游源码材料已补充：mpv header与固定源码一致；Windows Host参考ZIP中8项辅助二进制与Carnival字节相同。完整对应源码与重建关系保持各自边界。原P1及已发布v0.2.4身份不变，当前为本地工程交付。

## 2026-10-09 — 构建输入、来源与可再构建范围

从1abf554建立独立`codex/build-input-audit-20261009`，完成 [来源/材料矩阵](BUILD_INPUT_AUDIT.md)、只读导出器、14项新增测试和通知/构建文档修正。新工具与既有Git blob/Electron测试19/19，语法与diff通过；P1四层来源重验、三个归档、1009/51 vendor文件、73文件Electron和2149项payload核对通过。

fresh npm33包1142文件与P1对应文件完全匹配，但long目录保留20个Carnival旧文件；最终node_modules共40包根，不是33包。当前可确认本机固定输入组装与P1的helper源构建；公开仓库完整构建、完整工具链和当前runtime/installer字节复现仍未证明。已区分Git排除与发行payload，列出Host/Web/辅助二进制/libmpv的对应源码、通知交付和工具链材料缺口。

产品源码、版本0.2.4、P1 runtime/安装器及原vendor保持；本轮没有启动客户端或访问用户profile。当前远端只读核验main46e995e、Latest v0.2.2、v0.2.4 Pre-release；P1产品fb10f92与已发布03a2e3b继续分开。后续补材料与构建gate按报告优先级独立决定。

## 2026-10-09 — P2 离线阶段观测交付

从P0/P1的7bee8db建立独立codex/p2-performance-20261009，新增只读单文件阶段分析工具与16项回归，连同既有P1日志工具共24/24通过。分析已隔离合成日志110条、8次请求，5次有play→core-playing端点；缺失/歧义/时钟回退保持UNAVAILABLE。fake CD2含固定400ms延迟且无内部分段日志，不用于真实性能或预热收益结论。

预热经复杂度核对后按用户偏好结束本轮研究；Hydration仍等待真实not_found前后样本。产品源码、P1 runtime/安装包及版本保持fb10f92，本轮只变更工具/测试/文档，未启动客户端或访问profile/真实服务。报告见 [P2阶段观测](P2_TIMING_AND_CAPABILITY_REVIEW.md)。

## 2026-10-09 — P0/P1 隔离本地工程

从完整候选 ebcb655a 建立 `codex/p0-p1-diagnostics-20261009`，P0 状态/主线审查准备与 P1 有限诊断已完成可审阅本地交付。产品 sourceCommit=fb10f92，版本 0.2.4；全量 455/455、后续工具专项 8/8、正式来源与 2149 文件 payload、隔离 fake CD2/合成媒体 pipeline、两类 Renderer 安全位置、整包脱敏和安装器解包 2150/2150 均通过。现有主目录资料保留，main/发布状态未改变。

首轮测试只设置 APPDATA，曾向既有客户端日志追加合成记录；该轮不作为隔离通过。测试入口显式固定 appData/userData 后复跑通过，并核对既有日志 hash/length 不变。准确提交、产物、证据及边界见 [P0/P1 交付](P0_P1_DELIVERY.md)，下方按日期保留历史记录。

## 2026-10-09 — 清理已替代的cc603ba候选Release

按用户要求删除 `test-20261008-cc603ba` Release（ID406794578）及其4个附件，保留原源码tag（object `455cd068`）用于追溯。删除后GitHub列表共6个Release，回读确认其余版本的正文、标记、发布日期和附件完全保持，正式Latest仍v0.2.2，当前测试入口仍v0.2.4。此条为后续清理结果，下面发布时的历史保留统计维持原记录。

## 2026-10-09 08:30 UTC+8 — v0.2.4 Pre-release 发布完成

`v0.2.4` 已作为 GitHub Pre-release 发布，Release ID `407374861`，sourceCommit `03a2e3b9ea7f1cf786b034b0a1882b10de79a39c`。安装包与 `.sha256` 校验文件两个资产均已上传；安装包 175,597,797 bytes，GitHub API digest、release 页面与本地 SHA256 均为 `4ea589368f2db40ce09ce4e46f4fe937a2d34a240582d871a8f3f5ae627e4b64`。下载的校验文件与本地校验文件哈希一致，文件内列出的安装包SHA256也匹配；本轮未完整重新下载 EXE。发布回读和历史维护校验均 PASS。

六个既有 Release 仅更新标题、当前版本导航和历史正文展示；原始正文保留，11 个旧资产、日期、draft/prerelease flags 与已有 refs 均未变化。`main` 仍为 `46e995e`，正式 Latest 仍为 `v0.2.2`。设置页用户验收仍为 `PASS`；未据此扩展声称真实安装、CD2 或其它未覆盖场景通过。详细记录见 [0.2.4验收](SETTINGS_UI_024_ACCEPTANCE.md)。

## 2026-10-09 — 0.2.4设置页用户验收通过

用户使用本会话提供的0.2.4测试入口后反馈：“可以了，我测过了”。本轮设置页一致性修正记为 `USER ACCEPTANCE PASS`，对应产品sourceCommit仍为03a2e3b9ea7f1cf786b034b0a1882b10de79a39c，关闭本次UI问题并保留观察。不补写用户未逐项提供的操作、显示模式或安装过程；此前自动化、隔离测试与安装包校验仍保留独立证据。本次仅同步文档，没有改产品、重建、安装或上传GitHub。

## 2026-10-09 — 0.2.4设置页修正安装包可用

最终产品sourceCommit为03a2e3b9ea7f1cf786b034b0a1882b10de79a39c，安装包 `dist/EmbyTheaterEnhanced-0.2.4-test-win-x64-setup.exe`。三页左对齐、动态原生控件类保留、规则操作对齐和重复页标题收尾完成。430/430全量、完整packaged应用真实设置菜单导航/保存/离页/重载/规则检查、About版本与来源、正式构建及Inno完整性/解包2147文件校验均通过。与0.2.3只有6个设置文件及5个版本/来源文件变化，播放/窗口/native字节保持。

本地.exe与SHA256已交付，未上传GitHub或执行系统安装。测试使用隔离profile与合成身份，真实服务范围不扩大；准确产物与分层证据见 [0.2.4验收](SETTINGS_UI_024_ACCEPTANCE.md)。

## 2026-10-09 — 0.2.4设置页修正包收尾

用户接受“设置页一致性修正测试包”的收尾范围，开始在独立分支codex/settings-native-alignment-20261009执行完整页面核对、设置功能回归、正式构建与本地.exe交付。版本字段统一为0.2.4；不加入预热、hydration、窗口/播放重构。前一阶段36项与离屏对照仍是局部证据；本次完整应用和安装器结果完成后另记。

## 2026-10-08 — 增强设置左对齐与原生控件类修正（本地）

用户反馈0.2.3增强设置页整体居中、STRM规则动作的灰色方框/彩色文字与原生Emby风格不一致。以已发布f7505cd产品字节（文档HEAD ba76ac0）建立独立managed worktree `ete-settings-native-alignment`。当前仅修改enhanced-settings.css、strm.css、strm.js：三页沿用原生页面边距并靠左，规则动作统一左对齐；追加业务class，保留自定义控件constructor添加的Emby基础/环境类。

设置/维护/草稿与Token竞态定向36/36 PASS，JS syntax与diff检查通过。真实0.2.3原生控件+CSS的独立离屏夹具重现旧按钮缺emby-button；修正后三页与native audio参考内容起点一致，1920/1280/680无横向溢出，动态按钮均保留实际自定义元素类型和基础类。该夹具使用模拟外层边距与测试数据，不等价于完整应用导航或安装包验收。代码本地未提交，未重新构建/发布安装包；播放、全屏、Resolver/Session未改。

## 2026-10-08 — 0.2.3测试安装包已发布

产品版本字段已由0.2.2修正为0.2.3，sourceCommit `f7505cda40c7f64e31714fbbe40eaa532926c46c`；新安装包为`dist/EmbyTheaterEnhanced-0.2.3-win-x64-setup.exe`。430/430测试、正式重建、来源、payload和安装器2147文件核对通过，实际About和安装器版本资源均为0.2.3。新旧runtime仅5个版本/来源元数据文件不同，产品代码及播放器二进制未变。

GitHub [v0.2.3 Pre-release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.3) 已发布安装包与校验文件，两个asset的大小及服务端digest匹配本地，tag精确指向f7505cd。旧cc603ba测试页已增加替代提示并保留原tag/资产；正式Latest仍v0.2.2，main仍46e995e，详见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

## 2026-10-08 — 预发布安装包已补齐

已按既有交付方式提供 [Windows x64安装包](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/test-20261008-cc603ba/EmbyTheaterEnhanced-unified-test-cc603ba-win-x64-setup.exe) 及SHA256文件，并设为原Pre-release说明的默认下载。安装包由精确`cc603ba`打包工作树中的原Inno脚本生成，使用同一已验证runtime；175,594,443 bytes，SHA256为`1412dc7e87e1f353c1985cec15c7c0882a4ac65a48c032700ab991500be4f6df`。

完整性测试、解包2147文件与原runtime路径/哈希比较全部通过；GitHub端大小与digest匹配。ZIP作为备用附件保留。没有运行系统安装或改变产品源码/版本/主线，完整证据见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

## 2026-10-08 — 统一候选GitHub预发布

用户确认后已发布 [test-20261008-cc603ba](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/test-20261008-cc603ba)，Pre-release且非Latest；附件为已验证的240,289,348-byte ZIP与SHA256文件。annotated tag精确指向产品源码`cc603ba59fc527e50dda5b32f849af7b50702e2f`。GitHub端两个asset均uploaded，大小/digest匹配本地；本机Release CDN独立下载回读受TLS/EOF影响未完成，明确保持UNAVAILABLE。

独立候选分支已推送，main保持`46e995e`，正式Latest仍为`v0.2.2`。没有新增PR或合并主线，产品/版本和测试包字节保持原样。全屏Previous采样及真实环境范围限制随Release说明保留；完整记录见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

## 2026-10-08 — 统一候选本地测试包交付

独立分支 `codex/unified-candidate-20261008` 从全屏文档 HEAD `6be48ed`（产品 `1e86e51`，已包含切集 `6473ecb`）合入 Settings `21ef9a4`。两侧共同祖先及现场远端 main 均为 `46e995e`。main 的维护 IPC 与窗口状态、libmpv 的 About route 与原生持帧自动合并；三份追加型历史文档保留两侧记录。原工作树及未提交资料未改动。

集成 sourceCommit 为 `cc603ba59fc527e50dda5b32f849af7b50702e2f`，入口 `dist/unified-candidate/Emby.Theater.exe`。430/430全量测试、正式build/source/runtime/native provenance、2146文件payload通过。用户重新授权后，以新隔离profile补齐Settings保存/离页不保存/落盘重载、诊断/About、10次窗口/全屏切集、快速Next→Stop及terminal Stop。窗口跨编码两向画面采样通过；全屏Previous最大采样间隔107ms，仍保留极短闪烁INCONCLUSIVE。状态为 `LOCAL TEST CANDIDATE READY / LIMITATIONS RECORDED`，真实Emby/CD2/HDR/多屏/安装验收独立。

本地ZIP `dist/EmbyTheaterEnhanced-unified-test-cc603ba-win-x64.zip` 已逐项重读2147个文件校验，之后另经用户确认完成上述GitHub预发布。详细证据、历史中止与基线匹配的旧快速夹具失败见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。版本字段保持0.2.2；后续文档HEAD不是该runtime的sourceCommit。

## 2026-10-08 — 全屏顶部细条用户验收通过

用户在本会话交付候选后反馈：“我手动验证了，现在没有那个条了”。顶部细条记为 `HUMAN-ASSISTED VISUAL PASS / USER_REPORTED_RESOLVED`，范围限于用户本次所测场景。当前本地产品候选为 `1e86e512e3293e5c9fb43b3803995af50b802762`，独立分支 `codex/fullscreen-state-20261008`，入口 `dist/fullscreen-state-final/Emby.Theater.exe`。此处相对路径以 managed worktree `ete-fullscreen-state-20261008` 为基准；下方旧播放候选的路径仍属于原播放工作树。

最终源码 `npm test 412/412 PASS`、正式build、provenance与2140文件package VerifyOnly通过。产品仅修改 main窗口状态与video carrier窗口配置；原生持帧、前后切集、Session/Resolver与Electron44保持。全屏边缘拖动后状态脱节已在旧候选实测复现，carrier窗口框与顶部浅线的归属已通过合成窄区对照定位。

阶段候选 `a8aa114` 的可见边缘拖动、恢复原尺寸、普通窗口缩放与最小化恢复通过；最终候选可见probe在Computer Use被用户Esc停止时中断，播放中进出全屏、最终切集/Stop及完整窗口交互复测仍未完成。此次用户反馈单独关闭顶部细条视觉项。前后切集按此前用户反馈保留 `USER_REPORTED_RESOLVED / MONITORING`，不继续主动改动。详见 [全屏窗口修复与验收](FULLSCREEN_WINDOW_STATE.md)。

## 2026-10-08 — 播放呈现还原本地候选交付

当前产品源码与交付runtime绑定 `6473ecb046b0621ca79282e0c0ed250e3848f2c5`，路径 `dist/presentation-restore-6473ecb/`。保留Electron 44和原播放/Session/Resolver，前后切集改由native暂存旧帧并一次性揭开新视频，包含快速切换的token/epoch/Stop隔离及失败清理。最终全量 `npm test 401/401 PASS`，build、source/runtime/native provenance和2140文件package校验通过。

完整候选 H.264 720p/24fps+AAC ↔ H.265 1080p/60fps+AAC：窗口81/81帧、max59/44ms，黑/海报/mixed均0；全屏66/48帧、max164/163ms，观察颜色均旧/新视频但短闪分类仍INCONCLUSIVE。原生七项边界通过，含失败与15秒超时的实际清帧；最终两次运行各7个owned进程退出、残留0。状态为 `LOCAL CANDIDATE READY / WINDOWED SYNTHETIC VERIFIED / USER ACCEPTANCE PENDING`，不等于全屏或实服最终验收。详细结果和剩余验收见 [播放呈现还原记录](PLAYBACK_PRESENTATION_RESTORE.md)。没有合并Settings候选、修改真实配置或发布。

## 2026-10-08 — NextTrack 原生呈现候选进行中

旧版恢复目标的 retired-control 窗口 probe 两向各 76 帧、最大间隔 53/61ms，black/purple/mixed 均为 0；真实 Stop 11ms，资源清理完整。旧 Testing runtime `269bdcc` 的 case 1–4 通过，T 的 loopback HTTP 请求被 MPV 主动取消 (`lateBodyDelivered=false`)，case 5 曾在 load failure 后遗留 armed lease/hold，历史失败保留。后续 Testing build `a2cf6af` / SHA256 `de43f1301f208106fd18291bef0690c2cb20f388dd7f7d4b737c99679ca15378` 的六项边界均通过；missing-media end-file 后已观察 `autoState=unavailable`、active=false、bytes=0，另验证 control-generation cancellation 与 delayed prepare 不影响或复活新 hold。HTTP 连接仍被 MPV 主动取消，未验证迟到 body 到达后的行为。完整证据见 [播放呈现还原记录](PLAYBACK_PRESENTATION_RESTORE.md)。

生产侧实现 native presentation prepare/arm/release 与 fail-open 清理。正式 runtime `presentation-restore-5ddeea8`（source commit prefix `5ddeea8`，ordinary Helper SHA256 prefix `28054c`）build/provenance 通过。该 runtime 窗口 Next/Previous 各 83 帧、最大间隔 30/27ms、black/purple/mixed 均为 0、manager 选择正确、overlay 未插入，cleanup 7 exits/residual 0；全屏各 55 帧、最大间隔 165/164ms，颜色样本只有目标视频但采样间隔不足，保留 `INCONCLUSIVE`，cleanup 8 exits/residual 0。随后修复的旧 token Stop-to-C no-op 与高 epoch retire/in-flight begin 边界尚未重建和复测，因此 `5ddeea8` 不是最终候选。Native controller contract `11/11 PASS`；`395/395 PASS` 是阶段性全量结果，不含后续追加 lifecycle tests。当前整体仍 `NOT ACCEPTED`，用户真实视觉验收未完成。

## 2026-10-07 — 播放呈现还原目标开始

用户授权以升级前表现为标准自主修复，保留新版 Electron。见 [播放呈现还原](PLAYBACK_PRESENTATION_RESTORE.md)。当前已确认三套旧 runtime 来源，并重新取得当前候选有效的窗口合成画面；开始将测试工具适配到历史 Pepper / Helper 与全屏模式。生产行为尚未更改，真实视觉失败仍未关闭。

历史窗口/全屏对照已完成：旧 Pepper 的相同 gpu-next 输出是旧画面衔接新画面；Helper 在 Electron 18 时已出现中间内容，Electron 44 同样存在。只抑制 stop 隐藏的测试实验将中间内容转成黑色，未达到还原目标，未用于产品。采样改为直接读取 MediaStreamTrackProcessor，解决透明 renderer 的绘制回调暂停；完整工具测试 362/362 PASS。下一步进入保留已呈现视频帧的能力验证。

## 2026-10-07 — 窗口模式短闪的独立观察夹具

用户确认黑屏很快消失，仅测窗口模式。新增带海报、不同动态媒体、renderer/main/native 事件与合成 ROI 连续流的 test-only 模式；默认 pipeline 保持。初步两组连续流捕获了海报前的黑色采样，海报后短黑未稳定复现；追加稳定旧画面前置条件的单次 probe 未取得前置证据，保持 INCONCLUSIVE。没有据此调整生产显示策略，详情见 [窗口过渡观察](TRANSITION_WINDOWED_TIMELINE.md)。

诊断输入 runtime 绑定 `456df8e`，build / provenance / VerifyOnly 通过。最终 Node 全量 347/347 PASS，采样字段 / 资源约束专项 7/7 PASS，默认 CD2 pipeline 回归 PASS。真实 GUI 中已验证过的流停止 / handler 重置成功，运行后进程残留为 0。此前“没有新 runtime”的记录属于上一轮入口修正；本轮生成的是诊断输入，不是已解决两段黑屏的正式候选。

## 2026-10-07 — 人工视觉失败与 PreviousTrack 入口修正

用户反馈 `88f56b7` 下一集为“黑屏 → 海报 → 黑屏 → 视频”，上一集仍透明，当前整体为 `USER VISUAL FAIL / BLACK INTERVALS UNRESOLVED`。确认上一集未进入过渡 wrapper 后，在同一 renderer 模块增加对称 previousTrack 接入；按现有 manager 的 playlist index - 1 取项，原调用 / request sequence / stop(false) generation guard 保留。

新增三项回归验证准确选项、首项 / 非 Video / 其它播放器绕过、快速 next→previous 时旧回包保护；修改前基线存在失败，修改后 3/3 PASS，完整 `npm test 340/340 PASS`。两段黑屏目前只有用户现象与代码边界证据，没有首帧呈现证据，不记录修复完成；本轮未生成替代旧 candidate 的新 runtime。

## 2026-10-06 — NextTrack 无人值守审计修复

从候选 `8f3d9a9` 在独立本地分支继续审核。已修复视觉任务取消后 paint promise / visibility listener / animation frame 残留，以及帧调度异常和 CSS 过渡取消 / 缺少实际动画时的清理。范围仅为 `enhanced/nexttrack-transition.js` 与回归测试；PlaybackManager、libmpv、Session、Resolver、Native Helper 和封面比例保持原有实现。

新增审计回归由失败用例转为通过，合计 NextTrack focused `18/18 PASS`，最终完整 `npm test 337/337 PASS`；独立 Tier 2 复核未发现新引入核心正确性问题。原 diagnostics 自测在含空格 worktree 中因 Start-Process 参数引用缺失而未启动 collector；仅修复测试参数后全量通过，脱敏断言不变。实际 Electron 可见 renderer 淡出清理通过；未显示窗口的 CSS 动画可能直到 reveal 才完成，保留为隐藏渲染限制。正式 runtime / fake pipeline 的结果按最终源码提交另行记录；真实客户端视觉验收仍待完成。

## 2026-09-24 — NextTrack transition artwork candidate

针对 NextTrack 期间透明播放区域短暂露出桌面的用户观察，当前 `codex/nexttrack-transition-overlay` candidate 增加 renderer 内视觉过渡层。实现复用 PlaybackManager 已选中的队列 Item 和现有 `ApiClient.getImageUrl()`：首个 Backdrop image 优先、Primary poster 次之、不可用时为纯黑。比例修复使 overlay 填满视频容器，图片采用 100% 宽高和居中 `object-fit:cover`，横版图覆盖 16:9 区域，竖版 poster 裁切填满区域。NextTrack 入口先同步显示覆盖层，再同步调用原 `nextTrack()`；paint gate 位于 `libmpv.stop(false)` 隐藏 surface 之前。匹配当前播放请求的 `core-playing` 且视频容器恢复可见后，覆盖层等待一次 paint 再淡出。原播放顺序与 source、Resolver、Session、Native Helper contract 未改。

状态：比例修复 = `CODED / AUTO VERIFIED`；修复后 focused playback/window `43/43 PASS`、`npm test 325/325 PASS`、相关 JS syntax 与 `git diff --check` PASS。Foreground visual review = `PENDING USER REVIEW`。本条不宣称封面比例已通过新的前台视觉验收，也不把自动化或隐藏 runtime 作为视觉证据。
## 2026-10-06 — Settings maintenance 无人值守审计修复

从候选 `f58d806` 在独立本地分支审查。已修复手动更新查询只限制 socket 空闲而未限制整体请求期限、Release URL 未按规范化路径检查白名单、超出安全整数的数字 prerelease 比较三个问题。非成功 HTTP 响应及时关闭连接；同步请求异常清理 deadline。改动集中于 `enhanced/maintenance.js` 和新增回归，不改变 Settings 草稿 / Token / Smart Mapping / 播放契约。

新增失败回归转为通过；新 maintenance 与既有 Settings visual suite 合计 `14/14 PASS`，此前 Settings 状态等相关定向 `83/83 PASS`，最终完整 `npm test 337/337 PASS`，独立 Tier 2 复核未发现新引入核心正确性问题。全量验证曾被 diagnostics 自测的未引用进程参数阻塞：含空格的工作树路径被拆开，正确引用后通过；只改测试启动，不改 collector 或脱敏断言。runtime 与 fake pipeline 结果按最终提交另行记录；真实三页视觉和实际入口验收仍待完成。

## 2026-09-24 — STRM 动态规则控件原生外观修复

用户实际查看 v3 runtime 后确认其余区域满意，但路径规则卡中的输入框、下拉框仍呈浏览器默认白色小控件。根因是规则卡及后续助手样本用 `document.createElement(tag)` 创建普通控件，随后才设置 `is="emby-*"`；Emby 的 input/select/button 是 customized built-in，必须在创建时传入 `{is: 'emby-*'}` 才会获得其组件实现与样式。仅调整 `mpvplayer/strm.js` 的动态控件创建，并加入会识别旧创建方式的生成控件测试。静态 STRM、诊断与 About 的布局和样式未改；Smart Mapping、规则 schema、Token/Save、CD2 状态、Resolver 与播放链未改。

本轮 targeted STRM/Settings `78/78 PASS`，`npm test 331/331 PASS`，JS syntax 与 `git diff --check` PASS。用户视觉复核仍待独立 runtime 再确认。

## 2026-09-24 — Unified Settings Visual System v2 candidate

用户对上一版 STRM runtime 的实际视觉检查结果为 `FAIL`。本轮在 `codex/strm-ui-consolidation` 上重建带 `.ete-settings-page` 命名空间的共享视觉层：字体、间距、卡片、表单控件、四级按钮及状态色由 `mpvplayer/enhanced-settings.css` 的 token 统一；STRM、诊断与 About 只保留各自布局样式。STRM 采用区块标题/说明/内容卡与纵向地址、Token、开关、状态行；规则路径占整行，助手样本纵向排列。诊断页移除原生 `raised/button-submit`；About 页面按用户追加确认纳入本分支，四项维护 IPC 来自旧分支的独立 contract，未导入旧版整套 Settings 设计。

现有 STRM 推导、Resolver、规则 schema、Token/Save 状态机、CD2 状态生命周期、诊断 IPC 与播放链没有行为变化。新增 About route 提供版本/环境信息、白名单环境复制、用户点击后的有界更新查询及受限 Releases 外链。Helper 未 ready 时 libmpv 显示 `UNKNOWN`；显示缩放按主显示器 `scaleFactor` 表达。共享 CSS 与页面 CSS 均限定在各自根类，无裸 `button/input/select` 规则。

验证：STRM/Settings/诊断 focused `103/103 PASS`；全量 `npm test 330/330 PASS`；修改的 JS 语法、`git diff --check` 和三页 HTML 标签平衡 PASS。代码提交 `f3a17ca1bbe3016d33749e98d110282fc798b2f2` 的独立 runtime 为 `2145` 文件，固定 Electron 44.4.2、Native Helper、source/runtime provenance 与 package `-VerifyOnly` 均 PASS。最终提交的 `strm-ui-review2` runtime 身份在任务最终报告中再核对。前台三页切换与实际视觉结果仍待用户复核，当前只记录自动化验证状态。

## 2026-09-24 — STRM Settings UI consolidation

基于 `main@46e995ef83fca7f7a882e3dc633bdcc2d2d521c7` 在独立 `codex/strm-ui-consolidation` worktree 完成 STRM 设置页视觉整理。页面按基础设置、CloudDrive2、路径规则、智能映射助手分区；使用约 1080px 内容宽度、统一深色表单控件、Primary/Secondary/Text/Danger 操作层级、规则来源 badge、分开的挂载/连接/路径格式状态行，以及同风格的样本和预览卡。窄屏单列和长路径换行已加入 CSS。功能控件 id/class 与事件入口保留；JS 只调整 UI render、状态文字和视觉标记。Smart Mapping 推导、规则 schema、Token/Save 状态机、CD2 IPC/连接生命周期、Resolver 与播放链没有改动。

自动验证：STRM UI/Settings focused `69/69 PASS`，`npm test 322/322 PASS`，JS 语法和 `git diff --check` PASS。已从代码提交 `ae0e6504f6389f261cea484fcb3e77f299c801a9` 构建独立 `2139` 文件 runtime：固定 Electron 44.4.2 的 73 文件输入、Native Helper 编译与 provenance、source/runtime provenance、`package.ps1 -VerifyOnly` 均 PASS。最终提交对应的 runtime 身份在任务最终报告中单独核对。前台设置页视觉、真实 Emby/CD2 和安装验收均未执行；交付状态为 `READY FOR USER VISUAL REVIEW`。

## 2026-09-24 — Smart Path Mapping milestone closure

PR #18（`feat: add smart STRM path mapping assistant`）已通过 merge commit `121305b5fa74fa5bf9e8b76caabf280468ddb11b` 合入 `main`，合并的功能 head 为 `ade6620e80ce19da26d6a7bebc53368dffe3f8a5`。Implementation = `COMPLETE`；既有 User Functional Acceptance = `PASS`；Final Remote Re-Review = `PASS`；合并前 `npm test 319/319 PASS`，功能 head 的 exact-HEAD build/provenance 已验证通过。本条未执行新的 runtime、安装或真实客户端验收；未创建版本、tag 或 Release，正式发布基线仍为 `v0.2.2`。

## 2026-09-24 — PR #18 Token / Settings draft remediation

PR #18 当前远端审查发现 Token 设置/清除成功后以旧 persisted config 整体替换 renderer `this.config`，会丢失尚未保存的规则及普通设置 draft。修复已应用为只从 Token IPC 回包提取 `cd2.tokenConfigured`，并继续更新既有 connection snapshot 生命周期；不触发 config reload，不改变 Token 独立立即持久化语义或普通设置显式 Save 语义。

当前状态：Implementation = `COMPLETE`；User Functional Acceptance = `PASS`（既有用户验收记录）；Final PR Audit = `REMEDIATION APPLIED / RE-REVIEW PENDING`；PR / Merge = `PENDING`。本轮 Settings state-machine targeted `12/12 PASS`、focused `185/185 PASS`、`npm test 313/313 PASS`，修改的 JS/CJS 语法与 `git diff --check` PASS。exact-HEAD build/provenance 由最终提交的验收结果单独确认；本轮不记录 READY TO MERGE。

## 2026-09-24 — STRM Smart Path Mapping PR audit candidate

Phase 1–2.2 与 CD2 status sync 已完成 `base..HEAD` 静态/测试审计；远端 `main` 未偏离 v0.2.2 基线。现有规则优先、文件对应置信度与多样本边界置信度分离、Mount 共用 source anchor、schema v1 `rules[]` 和显式 Save 的行为保持。审计修复 Save、preview 与连接状态的迟到响应，移除已不用的直接写入规则 IPC，并确保 config/Token 写失败不改变内存快照。Token 设置/清除继续作为独立的用户明确操作，不属于普通配置和规则草稿。未修改 Smart Mapping boundary 算法或正式播放 route。

验证：`npm test 308/308 PASS`；focused Smart Mapping/Boundary/coverage/STRM config/UI/Resolver `120/120 PASS`、CD2 `33/33 PASS`、diagnostics `28/28 PASS`。新 runtime 只在本轮最终 HEAD 提交后构建；此处不把既有 `844b7e1` runtime 当作审计最终产物。

## 2026-09-23 — STRM Rules CloudDrive2 connection status sync

审计确认“测试连接”读取 main-process CD2 `testConnection()` 的只读连通性/认证探针；规则卡的“检查已保存规则”只在 main 执行 source/cloud prefix replacement 格式检查。旧页面把 `mapped` 固定渲染为“前缀映射格式有效，未连接服务”，且没有消费连接测试结果，造成测试成功后卡片仍显示旧文案。

`strm-config-ipc.js` 现持有一个带 revision 的 `unknown/checking/connected/failed` 连接快照，测试连接、状态读取和规则检查共用它。新测试开始或配置/Token 成功变更时 revision 递增；晚到的旧结果被忽略。设置页顶部与所有规则卡在连接测试完成时立即刷新；格式检查继续单独展示。未修改 CD2/Resolver/DirectUrl/Mount/Native 播放行为，未将路径格式有效视为连接成功。

验证：STRM Settings/connection UI/client diagnostics/CD2 focused `77/77 PASS`；`git diff --check` 和修改 JS 语法检查 PASS。首次 `npm test 295/296` 时，既有 `report-playback-issue` 自测要求客户端未运行，但旧测试 runtime 仍在运行；用户正常退出后，完整复测 `npm test 296/296 PASS`。真实设置页与真实 CD2 连通性未由本任务执行。

## 2026-09-23 — STRM Smart Path Mapping Phase 2.2 boundary model

用户实际样本揭示单组 suffix HIGH 只支持文件对应关系，不能确定可复用 prefix 切点。本分支新增 pure `smart-mapping-boundary.js`，preview 顺序为现有 `rules[]` coverage、fileMatch、multi-sample boundary、optional mount。真实 P1/P2/P3 形态：已有 `/CloudNAS/CloudDrive/115open/115 → /115open/115 → X:\115` 规则对 `/番剧/A/file.mkv` 样本返回 `FULLY_COVERED`、显示已有规则且不生成 suggestion。

单组样本 fileMatch 可以 HIGH，boundary 固定不足；多组样本必须跨不同目录分叉，source/cloud 最深非 root 公共父目录各自唯一，每组相对 suffix 按目标路径语义一致，才能得到 boundary HIGH。同目录仅换文件名不够。Mount 使用同一 sourcePrefix 验证多组路径；Mount 证据不足不会改变已证明的 cloud boundary。现有手工规则按正式最长前缀优先，cloud/mount conflict 与 DISABLED tombstone 均阻止新规则。设置页最多 8 组样本，保留 schema v1 `rules[]` 和显式 Save；生产播放链未修改。

Focused Smart Mapping/coverage/Settings/Resolver/diagnostics `123/123 PASS`，`npm test 285/285 PASS`，JS syntax 与 `git diff --check` PASS。后台 runtime `2139` files，pinned Electron 44.4.2、source、Native Helper、runtime provenance 与 package `-VerifyOnly` 均 PASS；最终文档提交后会从最终 HEAD 再构建并核对 source commit。前台 UI、真实 Emby/CD2、安装均未执行。

## 2026-09-22 — STRM Smart Path Mapping Phase 2.1 path semantics fix

修正 Phase 2 中“本地路径/云端路径”的产品语义歧义。正式 UI 与帮助文本现在明确区分：STRM 源文件路径是 STRM / Emby `MediaSource.Path` 中记录的原始路径；CloudDrive2 文件路径是同一文件的逻辑路径；本地挂载文件路径是当前客户端实际可访问、供 Mount fallback 使用的可选路径。正式 rule card 同样显示 `STRM 源路径 / CloudDrive2 路径 / 本地挂载路径`，空 mount 明确为“未配置”。

Phase 1 core 小范围泛化出 `inferSmartMountMapping()`，保留既有 cloud API 与 18 项 contract。mount 支持 Windows→Windows/UNC、UNC→Windows/UNC、POSIX→POSIX；以 cloud HIGH 得到的 sourcePrefix 固定 relative suffix 后再验证 mount full path。Cloud HIGH + Mount HIGH 生成三字段 rule；mount 缺失或非 HIGH 时仍可生成 cloud rule，mountPrefix 留空并提示原因；Cloud 非 HIGH 整体禁止加入。

所有 rule action 继续遵守 EXPLICIT SAVE：普通新增、assistant、删除、AUTO disable/restore 都只改 draft；修复了持久化 `new-rule-*` 被误判为未保存草稿的问题。没有迁移或猜测现有 persisted rules。自动验证当前为 `npm test 267/267 PASS`；focused Smart Mapping `23/23 PASS`；assistant + settings `33/33 PASS`；含 Resolver focused `79/79 PASS`；UI/static `10/10 PASS`；JS syntax 与 `git diff --check` PASS。最终 exact-HEAD background runtime 为 `2138` files，pinned Electron 44.4.2、source、Native Helper、runtime provenance 与 package verify 全部 PASS；foreground/native UI、真实 Emby/CD2、安装均未执行。

## 2026-09-22 — STRM Smart Path Mapping Phase 2

在独立 `codex/strm-smart-path-mapping` 分支继续复用 Phase 1 engine，实现 user-confirmed mapping assistant。STRM Settings 的路径规则区新增两个显式输入、preview、confidence/evidence 展示和“加入路径规则”；没有扫描按钮，也不宣称 CD2 可自动发现 cloud path。

main-process `enhanced-strm-smart-mapping-preview` 只调用 pure inference；不调用 CD2、Resolver、Mount、Native，不读取或写入 config。只有 `MATCHED/HIGH` 且当前 draft 没有 duplicate/conflict 时可以加入；MEDIUM 只展示。确认创建普通 `USER` rule draft，schema 继续只有 `rules[]`。assistant 不调用 `applyDiscovery()`；原有 Save 才持久化并要求重启。为满足显式确认边界，Settings 离页自动保存已移除；新建/assistant draft 可以本地编辑或移除。

诊断事件 `smart-path-mapping-preview` 与 `smart-path-mapping-accepted` 只保留 status/confidence/matched count/reason 白名单。自动化结果：`npm test 260/260 PASS`；Smart Mapping + assistant + settings + Resolver focused `72/72 PASS`；assistant/config `31/31 PASS`；diagnostics `35/35 PASS`；UI/static `9/9 PASS`；JS syntax 与 `git diff --check` PASS。没有修改 PlaybackManager、Session、MediaSourceId、PlaySessionId、route order、DirectUrl、Mount/Native fallback、Native Helper、libmpv、Electron/window 或 settings UX 分支。前台视觉/键盘、真实 Emby/CD2 和安装均未执行；状态为 `READY FOR USER VISUAL ACCEPTANCE`。

最终 exact-HEAD background runtime 为 `2138` files；pinned Electron 44.4.2 73-file input、source provenance、Electron provenance、Native Helper provenance、runtime provenance 与 package verify 全部 PASS。该 runtime 未启动，也未安装。

## 2026-09-22 — STRM Smart Path Mapping Phase 1

基于 `origin/main@9a034e8d627f71abbded01a1fba612d9282c9911` 创建独立 `codex/strm-smart-path-mapping` worktree。新增 pure deterministic `smart-path-mapping.js` 与 `strmResolver.previewSmartPathMapping()` dry-run hook；production `libmpv.playInternal()`、`resolve()` 和 `resolveAsync()` 不调用推导结果，正式 DirectUrl → CD2 HTTP → Mount → Native route 未改变。

引擎严格区分 Windows drive、UNC 与 POSIX；Windows/UNC segment comparison 大小写不敏感，POSIX 大小写敏感。它从 filename 向上计算 longest continuous suffix，保留最靠近 root 的 matched directory 作为 prefix anchor。filename + 3 个父目录以上且 unique 为 HIGH，filename + 2 个父目录为 MEDIUM；filename-only、单父目录、同分 candidate、relative/traversal、empty segment、root/incomplete path 都不会形成可应用 suggestion。matching manual mapping 永远阻止 smart suggestion，conflict fail closed。

当前固定 CD2 proto 只有 `FindFileByPath` 和 `GetDownloadUrlPath`。exact path lookup、regular-file metadata 与 download URL 可用；MountPoint、root listing、directory enumeration、stable ID、suffix/name search 和 caller-provided cloud candidates 均不可用。因此 Phase 1 evaluator 可验证外部已知 pair，但当前 CD2 API 不足以自行发现 production candidate。建议可信 pair 仍 `USER CONFIRM FIRST`；CD2-aware Phase 2 automatic discovery 为 `INSUFFICIENT DATA`。详细能力矩阵、confidence/safety 和 Phase 2 边界见 [STRM_SMART_PATH_MAPPING](STRM_SMART_PATH_MAPPING.md)。

验证：`npm test 251/251 PASS`；focused Smart Mapping + Resolver/settings `63/63 PASS`；CD2/DirectUrl `33/33 PASS`；diagnostics `28/28 PASS`；`git diff --check` PASS。background runtime 绑定产品提交 `ae86a3c3b9404e38d5127c05ecfa046f72efc2bb`，payload `2137` files，source/native/runtime provenance 与 package verify PASS。未启动 Electron、未执行 foreground/native UI、真实 Emby/CD2、安装、版本 bump、tag、Release 或 deployment。

## 2026-09-21 — Electron 44 post-freeze-fix closure

确认生产修复为 `8be3b6b8fdce9295f73acd7aa6b6507eb5d6c27c`。Electron 44 standard custom-scheme canonicalization 改变了 renderer command URL 的 command token 形态，例如 `electronapphost://loaded/` 与 `electronapphost://windowstate-Maximized/`；旧 parser 对大小写和尾 `/` 敏感，导致 `loaded/` 没有执行既有 `setWindowState(windowStateOnLoad)`、`mainWindow.focus()`、`hasAppLoaded = true`、`onLoaded()` chain。正式根边界固定为：

```text
VIDEO FREEZE ROOT BOUNDARY = APPHOST STARTUP COMMAND CANONICALIZATION
MICRO-MECHANISM = NOT FURTHER ISOLATED / NOT REQUIRED FOR RELEASE
```

2×2 matrix 为 `HOST + 9168 = FREEZE 5/5`、`DIRECT + 9168 = FREEZE 5/5`、`HOST + 725d = PASS 5/5`、`DIRECT + 725d = PASS 5/5`；Electron / Host / Native Helper / mpv identities 相同，因此结论是 freeze tracks source revision, not Host entrypoint。没有新增视频 workaround，也没有重开 DirectComposition/DWM/activation 假设。

从 exact HEAD `725d4c2284596b8ced749a3c8590180a1e6ed1a9` 重建 `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate`，匹配 installer `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate-setup.exe`，大小 `175580523` bytes，SHA256 `AAB19E605E26CE83C73610D1F5844C95EE872268BDBCD7752556E7610D3928A5`。Electron `44.4.2`、Chromium `152.0.7977.130`、source/Electron/Native Helper/runtime provenance、package verify、retired bridge exclusion、`mpv-win32-x64.node` absent、Pepper/PPAPI absent、`ete-mpv-helper.exe`/`mpv-1.dll` present 均 PASS；installer 解包 `{app}` 与 runtime 均为 2137 files，`missing=0`、`extra=0`、`mismatch=0`。

自动化结果：`npm test = 233/233 PASS`；Collector、Issue Snapshot、CD2 observer、privacy/redaction self-test PASS；apphost/Electron/Native Helper/window ownership focused `55/55 PASS`；Native Helper handshake/service/race/UA isolation、parent-death PASS，residual `0`。transport stress smoke 的 `transport:stdout-end` 在本 candidate、旧 Electron 44 comparison runtime 和 Electron 18 historical runtime 均复现，记录为跨版本 harness/environment evidence gap，不归因于 `725d/8be3b6b` source regression。Formal ordinary 与 CD2 miss 保留既有 rapid NextTrack `selected=false` baseline limitation，其余播放、控制、Stats、Session/report assertion PASS；Formal STRM/CD2、Formal DirectUrl、DirectUrl User-Agent isolation PASS。

新 candidate 已通过正式 installer 安装到 `C:\Program Files\Emby Theater Enhanced`，安装后的 payload `missing=0`、`mismatch=0`，现有 profile 与 persistent device identity 保留。用户随后完成 HUMAN-ASSISTED FOREGROUND ACCEPTANCE，确认 video continuously advancing、audio、OSD、Settings、Pause/Resume、Seek、Fullscreen enter/leave/OSD/controls、Alt-Tab、Minimize/Restore、Resize、Stop、Normal Exit 均 PASS；video freeze、seek black frame、stop/exit black frame 均未观察到。installed playback machine-log evidence 保持 `UNAVAILABLE`，按本轮口径不是 blocker；crash/residual 检查为 0。

当前决策：`PR #17 = OPEN / READY TO MERGE`；不 merge、不 bump version、不 tag、不 Release。`ELECTRON 44 FINAL ACCEPTANCE = PASS — HUMAN-ASSISTED FOREGROUND ACCEPTANCE`；`VIDEO FREEZE = NOT REPRODUCED AFTER FIX`。等待主线程复核后再决定是否 merge。

## 2026-09-19 — Electron 44 foreground regression fix and occlusion A/B

Fullscreen parser 已以独立 commit `8be3b6b8fdce9295f73acd7aa6b6507eb5d6c27c` 修复。实现只 canonicalize `electronapphost` command token 的尾 `/` 与大小写；raw URL、raw query 和 `openurl` target 保持原样，unknown command fail closed。synthetic focused `15/15`、非沙箱完整 `npm test 233/233`、real Electron 44 protocol probe 均通过；真实 probe 观察到 main 收到 `windowstate-maximized/` 后调用 `BrowserWindow.setFullScreen(true)`，窗口进入显示器大小的 `2560x1440`，OSD 显示“退出全屏”。

视频冻结的 diagnostic-only A/B 使用同一旧 candidate runtime、同一 profile、同一媒体 hash `2768c958dda7746c`、同一窗口位置/尺寸和同一动作。A 不带 switch；B 在 app ready 前追加并确认 `disable-backgrounding-occluded-windows`。两组 T0/T+2/T+4/T+6/T+8/T+10 的视频区域 PNG SHA256 均各自完全不变；Seek 后 3 秒、单次 32x18 resize 后 2 秒、单次 opaque-window occlusion/uncover 后 2 秒仍不变化。两组 mpv time-pos、PositionTicks、audio 与 core-playing 正常推进，Play/Seek/Stop 均通过。

当日结论为 `OCCLUSION HYPOTHESIS = REJECTED`，`VIDEO FIX = BLOCKED / NEEDS DEEPER COMPOSITION WORK`；这是在 `8be3b6b` 之前的 historical diagnostic status。该 occlusion switch 未写入 production、未提交，也没有进入性能代价与生产候选阶段。2026-09-21 的 post-freeze-fix closure 已将 production root boundary 固定为 apphost startup command canonicalization；旧 A/B 只保留为历史证据。

## 2026-09-19 — Electron 44.4.2 background candidate implementation

基于 PR #15 merge commit `fdb32282810d05ed6e588d0c2dc6bc0582957405` 创建独立 `codex/electron-44-upgrade`。已建立 official Electron 44.4.2 Stable Windows x64 的 exact archive/executable/full-tree contract；Carnival Electron 18.3.15 保留为 historical baseline 并从 production runtime 排除。build、source/runtime provenance、package verify 和 process-version probe 已在 preflight runtime 通过。

实际兼容问题只有两类：已移除的 `webContents new-window` 改为 `setWindowOpenHandler`；Electron 44 下六个既有 internal XHR scheme 需要最小 `standard + supportFetchAPI + corsEnabled` 注册。未启用 `secure`、`bypassCSP`、Service Worker、`nodeIntegration=true`、新的 `contextIsolation=false` 或新的 `sandbox=false`。BrowserView 仅为未使用 import，已删除，不做 WebContentsView/Native surface 重构。

preflight Formal STRM/CD2 与 DirectUrl/UA isolation PASS；ordinary 与 CD2 miss 的全部播放、控制、Stats、Session/report assertion 通过，仅保留 Electron 18 baseline 同样存在的 rapid NextTrack `selected=false` limitation，因此为 `BASELINE-MATCHED LIMITATION / NO NEW REGRESSION`。Native Helper/ownership/z-order/placement focused `46/46 PASS`，parent-death PASS、residual 0。详细 contract 见 [ELECTRON_44_UPGRADE](ELECTRON_44_UPGRADE.md)。

final artifact source commit 为 `9168d08f96e121e9852880503fd01af2bf26691d`。`npm test 228/228 PASS`；candidate runtime `EmbyTheaterEnhanced-electron44-9168d08-candidate` 的 2135-entry manifest、2136 actual files、source/Electron/Native Helper/runtime provenance 与 package verify PASS；background startup、Formal STRM/CD2、Formal DirectUrl/UA isolation PASS。candidate installer `EmbyTheaterEnhanced-electron44-win-x64-candidate-setup.exe` 为 175563881 bytes，SHA256 `BE338187DD56BE346B832B18793FDE87AE9957EF8AD9A3B72795EA51C22BF957`；innounp integrity PASS，解包 `{app}` 与 runtime 均为 2136 files，`missing=0`、`extra=0`、`mismatch=0`。final docs-only result commit 不改变该 artifact 的产品 bytes/provenance。candidate 未安装，v0.2.1 安装、真实 profile、服务器、真实 CD2 mapping、前台播放、fullscreen、Alt-Tab、mixed-DPI 和 Release 均未触碰。

## 2026-09-18 — CD2 route timeline observer ready

在保留上一轮已提交 Issue Snapshot 的 `codex/diagnostics-tooling` worktree 上新增只读 `tools/observe-cd2-cold-warm.ps1` 及 focused selftest/Node wrapper。没有修改 `src/**`、Resolver、CD2 service、PlaybackManager、Native Helper、Session、WebSocket、installer、缓存、客户端配置或播放行为；没有调用 CD2、retry、cache warm、Mount 或 fallback。

Observer 读取已有 `ete-client.jsonl(.1/.2/.3)`，按 requestId 关联 `app/start`、`play-request`、`resolver/context-observed`、`resolver/route-selected`、CD2 阶段、Mount 阶段、`resolver-complete`、`loadfile-requested` 和 `core-playing`。它选择一条 DirectUrl route 和一条 Mount route，输出 `ETE-CD2-Observer-YYYYMMDD-HHMMSS.json`，保存 rule/媒体安全 hash、startup first/subsequent classification、完整有界 timeline、FindFile/GetDownloadUrl evidence、fallback reason、Mount selected reason 和 comparison。

`startupClassification` 只输出 `FIRST_CD2_OBSERVATION` 或 `SUBSEQUENT_CD2_OBSERVATION`，用于描述同一 app run 内 CD2 观测顺序；它不输出 directory cold/warm 结论。`directoryColdWarm` 固定为 `UNAVAILABLE`，因为当前日志没有 parent-directory identity、enumerate、hydration 或 cache evidence。它不主动预热、不改变顺序、不 retry。当前日志没有 resolver initialization、strategy 或 order event 时保持 `UNAVAILABLE`；same-media 只有已有 identity evidence 能证明时才标记 `PASS`。报告复用 `tools/diagnostics-common.ps1`，保存前通过 redaction Gate。

验证：PowerShell 5.1 parser PASS；`tests/cd2-cold-warm-observer-selftest.ps1` PASS；`node --test tests/cd2-cold-warm-observer.test.cjs` PASS；synthetic direct-url + mount fixture 的 same-rule、same-media、startup first/subsequent classification、`directoryColdWarm=UNAVAILABLE`、FindFile、GetDownloadUrl、URL generated、Mount fallback、malformed JSONL、invalid UTF-8 和 raw secret scan 均通过；waiting exit 3 与 redaction refusal exit 2 均通过。当前 observer 变更未提交，等待主线程 review。

默认实际日志目录的只读 `-Once` smoke 读取 1 个日志文件，发现 5 个 DirectUrl route candidate、0 个 Mount route candidate，生成 redaction-passed 的 `WAITING_FOR_DIRECT_URL_AND_MOUNT` 报告并返回 exit 3；这说明当前现场没有可供比较的 Mount 样本，不构成真实 CD2/Mount 播放验收。

## 2026-09-17 — Issue Snapshot tooling in progress

Collector 第一阶段已在 checkpoint `a3f6276a09a7dbdf03263c9e393671b35efcbebf` 收口，未 push、未创建 PR、未 merge。当前未提交 diff 只包含 Issue Snapshot 入口、共享诊断脱敏层、focused self-test、Node wrapper 和本段文档更新；没有修改 `src/**`、PlaybackManager、Native Helper、Resolver、CD2、Session、WebSocket、fullscreen production logic、installer 或客户端配置。

`tools/report-playback-issue.ps1` 默认显示 11 种 issue type，只接受可留空的一句 note。它先冻结 `ETE-Issue-YYYYMMDD-HHMMSS.json`，再把同一 `capturedAt` 和随机 `issueCorrelationId` 传给 Collector 的 `ProblemTime` / manifest。Snapshot 保存已有日志和进程证据中的 product、process、playback、resolver、CD2、Session、error 与 evidence availability；缺失证据保持 `UNAVAILABLE`，不猜测 Session、NowPlaying、WebSocket、report 或 CD2 阶段。

`tools/diagnostics-common.ps1` 是 Collector 与 Snapshot 共用的 redaction contract，包含随机 HMAC ID hash、path/URL summary、safe JSON serialization 和 final redaction scan。Snapshot redaction fail 时会删除不安全输出、停止调用 Collector，并以失败退出；只读诊断失败不会进入播放行为。正常 Collector warning 仍允许生成 bundle，Collector ZIP 仍受原有二次 redaction Gate 约束。

Snapshot focused fixture 已覆盖每种 issue type、Other note/空 note、共享脱敏、correlation linkage、ProblemTime、Collector success/warning、redaction refusal、缺日志、程序未运行、malformed JSONL、invalid UTF-8 以及 fake token/server URL/media path/DeviceId/SessionId/ItemId/pickcode。最终 PowerShell 5.1 parser、Collector/Snapshot focused Node tests、两个 PowerShell selftest、只读 normal-command smoke 和 diff scope review 均通过；fixture 的 Snapshot、bundle 和 ZIP raw secret 均为 0。

最终 normal-command smoke 选择 `11 / Other` 并留空 note，生成 Issue JSON、Bundle 目录和 ZIP；`snapshotElapsedMs=351`、`bundleElapsedMs=1206`、`correlationMatches=true`、`redactionPassed=true`。当前状态：`DIAGNOSTIC BUNDLE = READY`；`ISSUE SNAPSHOT = READY`；本轮不开始 CD2 observer、renderer ReferenceError observer、installer residual audit 或任何 production playback fix。

## 2026-09-17 — Sanitized Diagnostic Bundle Collector ready

基于正式 `v0.2.0` / `origin/main@dbe2f0fe8891e4fbd91a8dedcbb94eac82c66472` 创建独立 `codex/diagnostics-tooling` worktree，只新增只读诊断收集脚本、测试和文档；没有修改 `src/**`、runtime、installer、PlaybackManager、Native Helper、Resolver、CD2、Session、WebSocket、缓存、Electron 或已发布安装。

`tools/collect-diagnostics.ps1` 默认收集最近 20 分钟，也支持问题时间点前后各 5 分钟。输入仅限四个精确 ETE client log 轮转文件、已知 runtime metadata、ETE-owned process tree 和有界 Windows crash event；不读取进程命令行、媒体库、CD2 目录、用户配置正文或整盘文件。输出包含 `product.json`、`processes.json`、`playback.json`、`cd2.json`、`session.json`、`errors.json`、有界 `logs/client.jsonl` 和 `manifest.json`，默认生成同名 ZIP。

每次采集生成不落盘的随机 HMAC-SHA256 key；Device/Session/PlaySession/MediaSource/Item/User/Request/helper/path/host 标识在包内使用稳定 16 位短哈希。路径只保留 kind、root class、segment count、extension 和 hash；URL 只保留 scheme、host hash、path class 和 query-present。整包在 ZIP 前执行独立模式扫描，只有 `manifest.redactionPassed=true` 才允许压缩。

合成安全 Gate 覆盖 fake token、server URL、username、Windows/UNC/POSIX path、相对媒体文件名、pickcode、全部要求的 ID、URL query、重复 ID、空/缺失日志、轮转日志、问题时间窗、500 行日志、tail 上限、manifest file hash、malformed JSONL 和 invalid UTF-8；Windows drive、UNC 与 POSIX 的 kind/root/segment/extension 另有精确断言。目录与 ZIP 均为 `0 raw fixture secrets`；测试还在 bundle 创建后注入 raw URL，确认 manifest 转为 `redactionPassed=false`、进程返回 2 且 ZIP 不生成。targeted black-box test PASS。最终用本机当前 v0.2.0 profile 做一次只读真实 collector smoke，约 `2.8s` 完成，识别 app version `0.2.0` 与 source commit `dbe2f0f...`，8 个 payload 文件、ZIP 和最终 redaction Gate 均 PASS；临时诊断目录已在核验后删除。v0.2.0 client log 尚无 Session/WebSocket/report observer 时，collector 明确输出 `UNAVAILABLE` 和 collection warning，不把缺失观测推断为状态。

当前状态：`DIAGNOSTIC BUNDLE = READY`。Issue Snapshot、CD2 cold/warm observer、renderer ReferenceError observer 和 installer residual audit 尚未开始；`OBSERVATION TOOLING` 仍未完成。

## 2026-09-17 — v0.2.0 Release Gate revalidation

基于 `feat/native-helper-bridge@569c8dfbcd18725bf41a323c49cdfa4d38c8fa6b` 完成版本与 candidate gate 复核。authoritative 版本来源仅更新 `package.json` 与 `package-lock.json` 的对应字段；没有修改 playback code，也没有修改真实 profile 或制造 CD2 mapping。

`npm test` 为 `201/201 PASS`，`git diff --check`、source/native/runtime provenance、package verify、formal ordinary、formal STRM/CD2 和 formal DirectUrl 均 PASS。新 runtime `EmbyTheaterEnhanced-0.2.0-release-569c8df` 绑定该 source commit，payload 为 `2135` entries；`ete-mpv-helper.exe` 与 `mpv-1.dll` 存在，`mpv-win32-x64.node` 与 Pepper/PPAPI runtime artifact 不存在。installer 为 `dist/EmbyTheaterEnhanced-0.2.0-win-x64-setup.exe`，大小 `125637307` bytes，SHA256 `BD192CF1CBA793C2C0C46472F4466EBA0AF2211CA988E4EBC50984827B41A6EE`；Inno archive integrity 通过，解包 `{app}` 与 runtime 逐文件 `2136/2136`，`missing=0`、`extra=0`、`mismatch=0`。

安装后的 `0.2.0` 程序实际完成 `launch → play → pause → seek → resume → normal NextTrack → stop → exit`。安装 payload 与 source commit 对齐；Native Helper observed、Session NowPlaying 和 `12/12` reports accepted，`generation-required=0`、unexpected `bridge_error=0`、helper crash `0`、Electron crash `0`、owned residual `0`，Stop 后 NowPlaying 清空。当前 profile 没有可用 CD2 mapping，安装后日志为 `route=native`、`reason=no_matching_rule`，CD2 未调用。

```text
INSTALLED REAL CORE LIFECYCLE = PASS
INSTALLED REAL CD2 ROUTE = NOT COVERED

COMPENSATING CD2 EVIDENCE:
- historical REAL CD2 = PASS
- final-head Formal CD2 = PASS
- final-head DirectUrl pipeline = PASS
- installed Native Helper REAL lifecycle = PASS
```

当前状态：`RELEASE GATE = OPEN`，feature branch 的 push/PR/review/merge 后 main rebuild、tag 与 GitHub Release 仍按发布流程执行。Concurrent Remote NextTrack server semantics、renderer ReferenceError follow-up、CD2 cold-directory、mixed-DPI、HDR、Electron upgrade、Stop-barrier candidate 等保持 deferred。

## 2026-09-17 — Phase 2B Pepper retirement complete

基于 `feat/native-helper-bridge@7e130c4cadc4b0399f61b8eb945a33e76c1163a3` 完成 Pepper / PPAPI bridge retirement。当前正式状态：

```text
REAL EMBY CLIENT ACCEPTANCE = PASS
NATIVE HELPER PRODUCTION ACCEPTANCE = COMPLETE
PEPPER RETIREMENT = COMPLETE
NATIVE HELPER = SOLE PRODUCTION BRIDGE
```

本轮 production/runtime 结果：

- Electron startup 不再调用 `register-pepper-plugins`，`libmpv.js` 不再创建 `application/x-mpvjs`，正常路径只创建 Native Helper endpoint；`ETE_MPV_BRIDGE_MODE=pepper` fail closed 为 `legacy-mode-removed`，helper failure 不自动切换旧 bridge。
- 归档中的 `electronapp/libmpv/x64/mpv-win32-x64.node` 只作为历史 provenance input 保留。新 runtime `EmbyTheaterEnhanced-0.1.1-pepper-retired-20260917-7e130c4` 的 payload 为 `2135` entries、连同 `build-manifest.json` 实际 `2136` files；旧 `.node` 不存在，Native Helper 与 `mpv-1.dll` 存在。
- Source/NATIVE/RUNTIME provenance 和 `tools/package.ps1 -VerifyOnly` 均 PASS。独立 Native Helper Electron smoke 的 handshake、private pipe、surface attach、generation accepted stale events `0`、Pause/Unpause/Seek 均 PASS。
- Formal local media pipeline PASS；CD2 fake hit pipeline PASS；DirectUrl fake pipeline PASS，UA isolation 三项均为 true；CD2 miss pipeline 的播放、控制和报告通过，但保留既有 rapid NextTrack `selected=false` limitation，不在本轮处理。
- 最小 REAL smoke 使用同一 product runtime，`inspect/select/play/pause/seek/resume/next/stop` 全部 PASS；readiness `class A`、bridge-ready observed、Session/report、Remote Pause/Unpause/Seek/NextTrack/Stop 通过，runner `completed`、cleanup `verified-clean`、owned residual `0`。本次 run 未观察到 renderer/bridge error 或 crash。

本轮没有修改 PlaybackManager、Session/PlaySessionId、Resolver、CD2、Remote NextTrack server semantics、renderer ReferenceError follow-up、Stop-barrier candidate 或 Electron version。Stop-barrier candidate SHA256 继续为 `7BF1F8E53D8BA63717A9CFB44F0D53E46EAE1600E34C4D8F100D3B0153333931`，保持未应用、未删除。

## [PRE-RETIREMENT BASELINE] 2026-09-17 — Phase 2 Native Helper acceptance gate closed

当前 HEAD 为 `50f578e1eb251336d15ba116b558c1ac341d7f05`。Phase 2 已完成正式 gate 收口：

```text
Formal ordinary = PASS
REAL ordinary = N/A — ENVIRONMENTALLY UNAVAILABLE
REAL STRM native-fallback = PASS
REAL CD2 = PASS
REAL Remote Control = PASS
REAL normal NextTrack = PASS
REAL Session/report lifecycle = PASS
REAL Seek backward = PASS
REAL getStats = PASS
REAL Resume policy = PASS
REAL non-zero start position = PASS
REAL Resume position = PASS
generation-required = 0
unexpected bridge_error = 0
unhandled rejection = 0
helper crash = 0
Electron crash = 0
residual process = 0
```

因此正式状态为：

```text
REAL EMBY CLIENT ACCEPTANCE = PASS
NATIVE HELPER PRODUCTION ACCEPTANCE = COMPLETE
PEPPER RETIREMENT = AUTHORIZED
```

本状态只授予 Pepper retirement authorization，不执行 Pepper 删除、迁移或 retirement。

### Concurrent duplicate Remote NextTrack limitation

两个立即并发的真实 `NextTrack` 在 HTTP 层均 fulfilled，但该 focused correlation 观察到对应 WebSocket `Playstate/NextTrack` delivery 为 `0/2`；`ApiClient`、`InputManager` 与 `PlaybackManager.nextTrack()` 均为 `0`。因此 A→B→C 并发语义没有进入客户端，不能作为 Native Helper 或 PlaybackManager production contract 的失败判定。

当前 gate 记录为：

```text
CONCURRENT REMOTE NEXTTRACK = NON-BLOCKING / OUTSIDE ESTABLISHED CLIENT CONTRACT
root cause = SERVER_REMOTE_COMMAND_SEMANTICS
```

该结论只把失效边界定位到 WebSocket 之前，不声称 Emby Server 内部一定执行了 coalesce 或 discard。普通单次 Remote NextTrack 的 A→B 仍已通过。脱敏 focused evidence 保存在 `.work/fast-next-fallback-529315abd95c4d02abca7c7e38274401/run1/output/diagnosis.json` 与 `run2/output/diagnosis.json`。

每次 focused run 另观察到 `2` 个 renderer `ReferenceError` events，当前只保留 error type，未采集 message/stack；没有伴随 unhandled rejection、`bridge_error`、helper crash、Electron crash 或可观察播放副作用。该项记录为：

```text
REFERENCEERROR = NON-BLOCKING FOLLOW-UP
```

不在本轮诊断或修复。

## 2026-09-17 — Resume PASS; fastNext remains blocked

匹配 virtual folder 的 `LibraryOptions` 已读到真实 policy：`MinResumePct=3`、`MaxResumePct=90`、`MinResumeDurationSeconds=120`。测试 item duration `5691.531s`，原始 `302390000` ticks Stop position 对应 `0.531298%`，明确低于 `MinResumePct`，所以原始 Resume 失败属于 `ACCEPTANCE TEST POSITION BELOW SERVER RESUME THRESHOLD`。

按 policy 动态选择 5% target 后，Remote Seek、Progress report、Stop report、server metadata saved position、PlaybackManager second Play、Native Helper/core-playing、Session 和 start/progress reports 全部通过；saved position 与 actual second Play start position 都为 `2840000000` ticks，difference `0`。因此 `REAL NONZERO START POSITION=PASS`、`REAL RESUME POSITION=PASS`。

随后 fastNext 对三个真实 item 立即并发发送两个 NextTrack；HTTP promise fulfilled、queue CD2/Native Helper/core-playing 通过，但 45 秒内 A 未 retired、B/C 未成为 current，C Session/report 未出现。当前第一个 blocker 为 `FAST NEXTTRACK / REMOTE COMMAND SEMANTICS`，分类 `OTHER`，不确认 production bug，不继续重发。REAL gate 保持 FAIL，无 production `src/` 修改，无新 commit。

## 2026-09-17 — Resume eligibility policy is unknown

真实测试 item `RunTimeTicks=56915310000`，`302390000` ticks Stop position 对应 `0.531298%`。`Library/VirtualFolders` 只读查询成功并匹配 `movies` virtual folder；当前 profile 非管理员。

`System/Configuration` HTTP 200 response 没有 `MinResumePct`、`MaxResumePct`、`MinResumeDurationSeconds`，本机也没有现成 server admin config evidence。当前结果为 `policy unavailable to current credentials`，所以 `CURRENT 30s STOP = POLICY UNKNOWN`。不猜阈值、不修改服务器配置。

由于无法证明 eligibility，本轮没有继续 target seek、second Play 或 fast consecutive NextTrack。当前首个 blocker 是 `POLICY UNKNOWN / CURRENT CREDENTIALS`，不是已确认的 production reporting bug；REAL gate 保持 FAIL，无 production `src/` 修改、无新 commit。

## 2026-09-17 — Resume bounded polling complete; server/report blocker remains

`resumeCycle` 已从固定 1 秒单次读取改为 `500ms` interval、`10s` bounded polling。实际 13 次 metadata read 全部为 `PlaybackPositionTicks=0`、`PlayedPercentage=null`、`Played=false`、`Unplayed=true`，`LastPlayedDate` present；bounded window 内没有保存位置更新。

Stop report 已 accepted，`PositionTicks=302390000`；payload 与同一播放 lifecycle 的 ItemId、MediaSourceId、PlaySessionId 一致，HTTP response resolved、WebSocket delivered，media page returned。刷新 item 后 server `UserData.PlaybackPositionTicks` 仍为 `0`。因此本轮不再把问题归为“1 秒 harness timing”，当前分类为 `EMBY SERVER / REPORT SEMANTICS`，production reporting bug 未确认。

由于 Resume authoritative assertion 未完成，`fast consecutive NextTrack` 未运行。当前已有 REAL CD2、STRM native-fallback、Remote Control、Session/report、Seek backward、getStats 保持 PASS；`REAL Resume position=NOT VERIFIED`、`REAL fast consecutive NextTrack=NOT RUN`，REAL gate 保持 FAIL。无 production `src/` 修改，无新 commit。

## 2026-09-17 — Unique real mapping observed; CD2 PASS; remaining harness blocker

当前 HEAD 为 `50f578e1eb251336d15ba116b558c1ac341d7f05`。多样本只读 correlation 覆盖真实 Emby Movie/Episode `7665/7665`，ordinary `0`、STRM `7665`；ordinary acceptance 明确为 `N/A — ENVIRONMENTALLY UNAVAILABLE`，补偿证据为 Formal ordinary PASS 与 REAL STRM native-fallback lifecycle PASS。

从 12 个跨目录真实 STRM 推出唯一 source→cloud mapping：sidecar common 为 POSIX/media，source common 为 POSIX/other；ETLP cloud target 在 `12/12` source path 的 segment offset `2` 出现，derived source prefix 在 `12/12` 稳定，sourcePath-only candidate 与 sidecar/source relative stem 也均为 `12/12`。未修改 production resolver，没有用 sidecar fallback 伪造 CD2 hit，也没有通过试多个 prefix 猜测。

当前 acceptance adapter 只在本轮临时 profile/process environment 中使用该 derived source prefix 与已有 cloud target；真实 config probe 的 same-origin CD2 hit 通过。真实完整 flow 两次获得 `legacy-cd2 -> direct_url_hit -> direct-url`，CD2 `FindFile`、`GetDownloadUrlPath`、Native Helper/core-playing、Session/report、Pause/Resume/Seek/NextTrack/Stop、HTTP/WebSocket controls 均通过；`generation-required=0`、unexpected `bridge_error=0`，结束 residual 为 `0`。无 production `src/` 修改。

剩余首个独立 blocker 来自 acceptance harness 的 resume coverage：Stop report 已接受且位置 `302800000` ticks，返回 media page 后读取 `UserData.PlaybackPositionTicks` 仍为 `0`，因此本轮未继续再 Play，也未运行 fast consecutive NextTrack。分类为 `HARNESS`，具体为 server metadata eventual update 的等待假设；是否有更晚更新尚未验证。当前 REAL CD2 已 PASS，但完整 REAL gate 仍保持 `FAIL`。

## 2026-09-17 — REAL ordinary N/A and no_matching_rule correlation

已将当前真实 ordinary acceptance 按环境事实收口为 `N/A — ENVIRONMENTALLY UNAVAILABLE`，不创建或修改 Emby 媒体库。只读分页覆盖 Movie/Episode `7665/7665` 条记录，`ordinary=0`、`STRM=7665`、source path kind 全为 POSIX。补偿证据为 Formal ordinary pipeline PASS，以及 REAL Native Helper STRM native-fallback lifecycle PASS；ordinary N/A 不再作为 production blocker。

在 harness fix commit `50f578e1eb251336d15ba116b558c1ac341d7f05` 的 current runtime 上，对上一轮成功播放的真实 STRM 进行纯本地 rule-evaluation correlation，未调用 CD2、未播放、未写 profile。脱敏结果：itemId hash `af7137c6a8570078`；sidecar path 为 POSIX、root class `media`、normalized hash `f8cee147db9ba93f`、length 97、5 segments；`MediaSource.Path/sourcePath` 为 POSIX、root class `other`、normalized hash `6ef7215e5d4de93a`、length 118、7 segments。

当前 matcher input 明确为 `sourcePath`，策略为 `sourcePath-exclusive`；sidecar 对同一 source-root 的 `prefixMatches=true`，实际 source 对该 source-root 的 `prefixMatches=false`。Enhanced v1 config 为 enabled、CD2 enabled、DirectUrl enabled、1 条 rule：`ruleIndex=0`、`ruleId=legacy-cd2`、enabled=true、source root/target root 均为 POSIX、regex 不存在。该 rule 的 source root 与 ETLP `[src]` root 的 normalized hash/length 一致，target root 与 ETLP `path_map` target 一致，方向没有反转；但 actual `MediaSource.Path` 不匹配该 source root，失败条件为 `posix-prefix-or-boundary-mismatch`。

`strmResolver.selectRule()` 返回 null，`resolve/resolveAsync` 随后产生 `type=native`、`reason=no_matching_rule`，精确路径为 `selectRule=null -> no_matching_rule`；`cd2TransportInvoked=false`。当前 `path-rules` 对 `/media`、`/mnt`、`/volume` 的独立 POSIX rule probe 均 selected=true，说明当前 production resolver 支持这些 POSIX path class；本样本的 source root 属于其他 POSIX root，问题是 acceptance/config adapter 没有把 actual Emby source root 与已存在 cloud target 建立可证实的 mapping。分类为 `ACCEPTANCE CONFIG ADAPTER`，附带 `ENVIRONMENT` 配置不匹配，不确认 production resolver gap。

本轮不通过不断尝试 prefix 修复，也不调用 Find/DirectUrl/Range/cache/cold-directory。REAL CD2 仍未取得 route hit；无 production files 修改。完整脱敏 correlation evidence 保存在 `.work/real-rule-correlation-50f578e.json`；当前 `REAL EMBY ACCEPTANCE = FAIL`，并停在第一个独立 `ACCEPTANCE CONFIG ADAPTER` blocker。

## 2026-09-17 — REAL acceptance after application-window ownership fix

基于 `feat/native-helper-bridge@49b1fc3668c98487fb044e73a1da698a8b67d822`，仅修正 acceptance harness 的 application-window ownership，并新增回归。`tests/runtime-window-ownership.test.cjs` targeted `7/7`、acceptance readiness/terminal self-tests `3/3`、全量 `npm test` `197/197`、JS syntax 与 `git diff --check` 均通过；`src/` production code 未修改。

从当前 HEAD 重新生成 runtime `EmbyTheaterEnhanced-0.1.1-native-helper-real-49b1fc3-ownerfix`，SOURCE/NATIVE/RUNTIME provenance 与 package verify 均通过，payload 2136 files，helper 为 production non-testing build。修复后的真实 acceptance evidence 显示 application owner 1、auxiliary `data:` window 1、application probe 1，auxiliary 没有覆盖 owner 或接收 acceptance flow injection。

使用现有 persistent Emby 登录态执行标准真实 STRM fallback flow，`inspect/select/play/pause/seek/resume/next/stop` 全部通过；Native Helper handshake、resolver native fallback、core-playing、current player、own Session NowPlaying、真实 WebSocket 命令送达和 10 条播放报告均观察到，Stop 后 NowPlayingItem 清空，target runtime residual 为 0。inspect 的早期 snapshot 仍显示 `websocketOpen=false` / `SupportsRemoteControl=false`，但实际控制步骤的 server accepted 与 WebSocket delivered 均为 true，不能把早期 snapshot 当成当前 regression。当前 flow route 为 `native/no_matching_rule`、CD2 `not_attempted`，因此这是 REAL STRM Native fallback PASS，不是 CD2 PASS。

为验证 CD2，使用原 persistent profile 的登录态副本和现有本地 CD2 配置做了隔离 run；副本只用于本轮，原 profile 未写入。标准 flow 完成，但真实样本仍返回 `route=native`、`reason=no_matching_rule`、`cd2Reason=not_attempted`，所以 REAL CD2 route 未通过/未完成命中证据。随后只读分页扫描 Emby 的全部 `7665` 个 Movie/Episode，实际取回 `7665`，`ordinaryCount=0`、`strmCount=7665`、source path 全为 POSIX；因此 ordinary acceptance 的第一个独立 blocker 为 `MEDIA/ENVIRONMENT`，没有可用的真实非 STRM 媒体，按规则停止后续探测。

本轮 ordinary media、getStats、CD2 HIT/range、独立 Stop→再 Play Resume position 尚未宣称通过；已有 STRM fallback 的 Pause/Resume/Seek/NextTrack/Stop 与 Session/report evidence 保持单独记录。完整脱敏 evidence 位于 `.work/live-acceptance-2525dec8174f42b9a43483e70458b0ff`、`.work/live-acceptance-cd2-34de10d328804431b2ebea57c8521ec9` 和 `.work/real-ordinary-scan-20260917.json`；临时 CD2 profile 已删除，原 persistent profile 保持存在且未新增 resolver config。

本轮 harness 修改文件为 `tools/acceptance-electron.cjs` 与 `tests/runtime-window-ownership.test.cjs`；无 production files 修改、无新 commit、无 Pepper 使用、未开始 Pepper retirement。`.work/stop-barrier-candidate.patch` SHA256 仍为 `7BF1F8E53D8BA63717A9CFB44F0D53E46EAE1600E34C4D8F100D3B0153333931`。由于 ordinary 样本缺失且 CD2 尚未命中，当前仍为 `REAL EMBY ACCEPTANCE = FAIL`。

## 2026-09-17 — Native Helper REAL Emby acceptance blocked by acceptance harness

基于 `feat/native-helper-bridge@49b1fc3668c98487fb044e73a1da698a8b67d822` 重新生成正式 Native Helper runtime `EmbyTheaterEnhanced-0.1.1-native-helper-real-49b1fc3`。`SOURCE PROVENANCE`、`NATIVE PROVENANCE`、`RUNTIME PROVENANCE` 与 `PACKAGE VERIFY` 均通过，payload 为 2136 个文件，helper 为 production non-testing build。当前真实运行模式为 `native-helper`，未设置 Pepper mode，也没有自动 Pepper recovery。

使用现有 persistent Emby profile 的只读检查为 `exists=true, loggedIn=true`，client identity 为 `Emby Theater Enhanced`，非管理员。目标 runtime 的 Electron 主进程与 helper 均实际启动；helper `helper-ready`、libmpv handshake、resolver context/route、native `loadfile`、core-playing 和服务端 NowPlaying/进度均在本次 run 观察到。DeviceId 仅以本地脱敏 hash 记录，原始 DeviceId、SessionId、server URL、token 和媒体标识未写入仓库；inspect 阶段的 WebSocket/SupportsRemoteControl 当时为 false，完整 HTTP/WS identity 对照未完成。

首次真实播放选择到 STRM Movie，当前 profile 本次 route 为 `native` / `no_matching_rule`，CD2 为 `not_attempted`。`inspect`、`select`、`play` 通过并观察到当前 player、Session NowPlaying、core-playing 和 2 条已接受的 start/progress report；在进入 `pause` 时，`tools/acceptance-electron.cjs` 收到第二次 `browser-window-created`，由 Native Helper 创建的 `data:` video surface 覆盖了 application window 的 `win` 引用，随后对辅助 renderer 执行 `window.eteAcceptance.pause()` 失败。该 blocker 归类为 `test/acceptance harness`，不是本次已观察到的 production/helper/media/CD2/server failure。按验收边界停在此处，ordinary media、STRM/CD2 HIT、getStats、remote control、NextTrack、Resume/Stop 生命周期均未宣称通过。

本次完整脱敏 evidence 保存在忽略目录 `.work/live-acceptance-a2a9cf79f6cb4846a1726ee9597a5593`；目标 runtime Electron 主 PID 为 8428、helper PID 为 9356，收尾后 owned Electron/helper residual 均为 0。当前 `REAL EMBY ACCEPTANCE = FAIL`。本轮未修改 production files、未使用 Pepper、未提交/推送/合并/发布，`.work/stop-barrier-candidate.patch` SHA256 仍为 `7BF1F8E53D8BA63717A9CFB44F0D53E46EAE1600E34C4D8F100D3B0153333931`。

## 2026-09-17 — Deterministic generation fixture

基于 `feat/native-helper-bridge@aef373a81aeb88244f219e83e805a148a33e6ef1` 仅修 formal fixture。诊断以两个相同 focused run 证明原 `sleep(250)` 不保证 overlap：一次 Play #1 已 fulfilled 后 Play #2 才进入，另一次 Play #2 在 Play #1 pending 时正确触发 PlaybackSuperseded。原 `oldCoreListenerIgnored` 也只是 `rapid[0].status==='rejected'`，未观察 listener 或 stale event；production generation、event ownership 与 controller stale drop 均通过，无 production bug。

新增 browser/Node 共用 generation observer：Play #1 的 listener 注册、native generation 建立与 pending Promise 构成 overlap gate；Play #2 takeover 必须 retire exact old generation，Play #1 reject PlaybackSuperseded；old listener 必须 remove 且 takeover 后 callback 增量为 0，Play #2 current generation fulfilled。Stop subcase 等待 fake CD2 resolve in-flight 后 stop，要求 matching cancel 且 source 不被 late load 覆盖。focused runtime 连续三次五项与 CD2 cancel 均 PASS、active CD2=0；observer unit `4/4`、全量 `npm test 196/196`、syntax/diff check PASS。production files 未修改；Stop barrier patch 保留未应用。正式 source-commit build/pipeline 需在本 harness commit 成为 HEAD 后执行。

## 2026-09-17 — Ready diagnostics generation ownership fix

基于 `feat/native-helper-bridge@667009e995ff8a6bf08805abf176a745ce9fab86` 修复 production startup-order race：fresh native endpoint ready 后，optional diagnostics collect 可能在 STRM/CD2 resolver 等待期间先完成，并以 generic postMessage 提交 cache snapshot 的 set_property/expand command；此时 generation 尚未建立，两个 `generation-required` 被 client 提升为 playback-fatal bridge_error，随后 PlaybackManager error cleanup 清空 player。根因与旧 remote Stop 无关；`.work/stop-barrier-candidate.patch` 保留且未应用。

renderer native endpoint 现提供 exact、无参数、generation-aware 的 optional cache snapshot：generation=null 时直接 unavailable；有效时用捕获的同一 generation 执行 set/expand/read，每个异步阶段后复核 generation；stale/retired 只降级 snapshot。diagnostics 对 native endpoint 使用该窄方法，legacy/Pepper fallback 保持原 mutation/read contract。direct/global getProperty、通用 postMessage、required command/set、helper protocol/crash、generation retirement、PlaybackManager、Session、Resolver 与 Pepper 均未放宽。targeted `19/19`、全量 `npm test 192/192`、JS syntax 与 `git diff --check` PASS；正式 source-commit build/provenance/pipeline 需在本修复成为 HEAD 后执行。

## 2026-09-17 — Formal runtime harness BrowserWindow ownership fix

基于 `feat/native-helper-bridge@3f62efada515a4cc5d2c297ff5997b6b4d467b3c` 修复 formal harness 的 window ownership：`tools/smoke-electron.cjs` 不再把每个 `browser-window-created` 覆盖为测试窗口，而是在 `did-finish-load` 后以 exact packaged `file:` `electronapp/www/index.html` 选择唯一 application renderer；存活 owner 不会被后创建的 native-helper `data:` surface 或另一个 application-shaped window 覆盖，只有 owner destroyed 后才允许新的有效 application 绑定。AMD assertion、pluginManager probe、pipeline injection 与 application state capture 只对 owner 执行；所有重要 injected script 增加 sourceURL，错误 evidence 只保留 bounded name/message/stack/source/line/column、window class 与 pipeline stage。

纯 fake-window ownership regression `6/6` 与全量 `npm test 183/183` PASS。提交前用既有 `3f62efa` runtime 的 hidden integration 验证 application owner 1、auxiliary 1、application pipeline injection 1、auxiliary injection 0；ordinary 与 STRM 的 play/core-playing/getStats/stop 及 22 条 report fixture 均通过。该 run 随后暴露独立的既有 NextTrack fixture assertion：`selected=false`，但 `priorStopped/nextStarted/rapidNextSettled/rapidNewestLoaded=true`。本 harness ownership 任务不修改或内联修复该问题；新 HEAD 的正式 build/provenance/pipeline 仍按 gate 单独执行。

## 2026-09-17 — Optional getStats property compatibility follow-up

基于 clean `feat/native-helper-bridge@b17e6578ecd8ee6be71821e07380e1f87cd0f308` 的一次 hidden formal pipeline 诊断，精确确认 generation 131 的 `player.getStats()` 首个 aggregate rejection 为 `chapter` / `property-unavailable`，调用链为 `getMediaStats()` → per-category `Promise.all()` → top-level `getStats()`；同一批 Stats 请求还观察到部分 video/audio telemetry property unavailable。媒体请求已经发生且 core-playing 已成立，因此该失败属于 optional Stats consumer ownership，不是 helper wire、播放状态或 Session failure。

`libmpv.js` 现在只在 Media/Video/Audio Stats property 读取边界把精确 `property-unavailable` 映射为 `null`，随后复用既有字段省略、空对象与零值展示逻辑；其他错误继续 reject，direct/global `getProperty()`、helper protocol、generation、PlaybackManager、Session、Resolver、CD2 与 source selection 均未改变。新增真实 AMD module/Player 回归覆盖 A/C 可用字段、B=`chapter` unavailable、structured map/array/number/boolean/INT64 string 保留，以及 `transport-closed` 仍 reject。targeted `2/2`、全量 `npm test 177/177`、JavaScript syntax 与 `git diff --check` PASS；正式 source-commit build、provenance、package、pipeline 与 REAL Emby 在 follow-up commit 成为 HEAD 后执行，本段不预先声称其结果。

## 2026-09-17 — Native helper nonfatal operation failure follow-up

基于 `feat/native-helper-bridge@a22426aafaafc9cd20b7c64f504f1857750ed83f` 修正 helper 的错误所有权：格式、identity、schema 与 protocol invariant 失败继续 fail closed；已经通过 main-process allowlist/schema/generation 校验的 `set-property` 或同步 `command` 被 libmpv 拒绝时，改为发送 generation-scoped `operation-error`，不再抛入 `protocol-error → exit 20`。controller 严格校验 typed error，只接受 current generation，保留最多 64 条脱敏 operation history；stale generation 仍按原规则丢弃。`get-property`、load/stop 的既有非致命 request error 保持不变。

test-only fault injection 以合法 `sub-back-color=0/0/0/1` 和 `cycle pause` 触发 libmpv operation rejection，隐藏 Electron 18.3.15 smoke 已证明同一 helper PID、helperInstanceId 与 generation 保持，stdin/stdout transport 与 protocol ready 保持，随后 `get-property mpv-version` 成功，`stdout-end` 未出现；独立 unsupported protocol version 仍产生 `protocol-error` 并以 exit code 20 终止。focused protocol tests `7/7`、全量 `npm test 175/175`、C++17 `-Werror` testing build 与 `git diff --check` PASS。正式 source-commit build、三层 provenance、package verify、hidden pipeline 与 REAL Emby 只能在实现成为真实 HEAD 后执行，不由 checkout/testing helper 结果替代。

## 2026-09-17 — Production Native Helper Bridge implementation candidate

在 `feat/native-helper-bridge`、base `a16cdc72d9e8bc60284c759a126a3d77c33fa001` 上完成 Electron 18 first 的 production native-helper bridge 源码实现。新增 x64 C++ helper、little-endian framed private pipe、helper/generation/request identity、handshake、structured MPV node、native event attribution、bounded writer/stderr、main-process supervisor、独立 video host 与 renderer logical adapter。默认 bridge mode 为 native-helper；Pepper 只保留显式 `ETE_MPV_BRIDGE_MODE=pepper` 路径，不做自动 fallback。PlaybackManager、Session/PlaySessionId、MediaSourceId、WebSocket、report、Resolver、CD2/Mount、Electron/Chromium/Node 与 installer architecture 均未修改。

当前自动验证：`npm test 173/173`；相关 JS/PowerShell syntax 通过；真实 Electron 18.3.15 + production source helper + bundled libmpv smoke PASS，实际 `current-vo=gpu-next`、D3D11、`hwdec-current=d3d11va`、native surface attach、Pause/Resume/Seek/Stop 与 structured properties PASS；独立 capture 已人工确认视频与 HTML OSD 同时可见。surface 的 resize/maximize/restore/fullscreen/minimize、OSD mouse/focus PASS。rapid A→B、A→B→C、Stop during load、helper crash/recreate 各 20/20，accepted stale event 为 0。Parent 强制终止后 helper 在 5 秒内退出，residual 0。20,000 property burst、1 MiB stderr、partial/invalid/oversized/malformed frames、unsupported version 与 pipe-close fail-closed PASS。普通 load error 保留 H1 并在同一 helper 恢复播放，recreateCount=0；旧 endpoint 不能 retire/destroy replacement；并发首次 Play 共享同一 helper creation，handshake 失败会清理 stale DOM 后允许重试。file-local UA 为 A=`ETE-A/1.0`、B=`ETE-B/1.0`、C=`libmpv`，无跨媒体泄漏。最终 production-source helper 连续播放到 `603.2s`，PID/transport稳定、stale=0，21 次采样 working set 峰值约 102.8 MiB，首尾增长约 0.76 MiB。

当前仍是 **IMPLEMENTATION PASS / REAL ACCEPTANCE PENDING**。一次性 Git fixture 已证明 native helper 的 source-commit build/provenance 与双构建 byte identity，但真实分支 build 只接受当前 HEAD 的 Git blob；本轮尚未获得 commit/push 授权，因此正式 full runtime、package verify 和 installer 尚未执行。REAL Emby ordinary/STRM/CD2、Session/reporting、remote control、NextTrack 与 HDR 也未执行。`origin/main` 保持 `73eac9f`，没有 commit、push、PR 或 merge。完整 contract 见 [NATIVE_HELPER_BRIDGE](NATIVE_HELPER_BRIDGE.md)。

## 2026-09-17 — Production application identity parity

基于 `origin/main@73eac9fa64c43804e9c5c53690ed087b2c5bb077` 独立修复正式 Electron 与 acceptance 的 application identity 漂移。正式启动与 acceptance 现在共同调用 `product-identity.js`，唯一语义为 runtime `package.productName || package.name`；正式启动在 bootstrap、persistent DeviceId、`loadStartInfo()` 与 `BrowserWindow` 创建前完成 `app.setName()`。当前构建 metadata 对应有效 identity 为 `Emby Theater Enhanced`。

本轮未修改 persistent DeviceId helper、存储格式或传播链，也未修改 PlaybackManager、Session/PlaySessionId、MediaSourceId、WebSocket、report、Resolver、CD2、libmpv、Electron、依赖或安装器。Product identity 专项测试 `4/4` 与修改 JS/CJS syntax 通过；`npm test` 为 `144/152`，其余 8 项均由 clean worktree 缺少 private/ignored Carnival Web input 与 prepared preload 导致，未发现真实代码失败。因同一输入缺失且没有当前分支 runtime，未执行 Electron smoke；未开始 Production Bridge Adapter。

## 2026-09-16 — Phase 1 tracked source Git-blob binding

修复远程审核发现的最后一个 source binding blocker：`build.ps1` 不再从 working tree 物理 `src/electronapp` 路径复制普通 tracked 文件，而是从固定 `sourceCommit` 的 Git tree 枚举 regular blob，并以原始 bytes 写入 runtime。dirty/staged index、CRLF/LF checkout policy 与 binary 工作文件变化不会影响输出；prepared preload、Web overlay、PlaybackManager/package overlay contract 未改变。

runtime provenance 对 67 个普通产品文件记录 commit、Git mode、blob object ID、blob SHA256 与 runtime SHA256，并强制 `git-blob-copy` 等值。synthetic dirty/binary/LF-CRLF 回归、实际 dirty `splash.html` build 均通过。fix commit `5a2bafc1dfa5d65f8821a3ef47371c08fe162cad` 的 normal 与新 fresh detached worktree 均 `npm test 152/152`、build/provenance/package verify PASS；实际各 2,131 files，逐路径 `missing=0`、`extra=0`、`mismatch=0`。未修改任何 `src/electronapp` 产品内容。

## 2026-09-16 — Phase 1 reproducible build cleanup

基于 `origin/main@2c668eed87379eafec2e1a25f6b46f6b1dbf5ec6` 完成 Web overlay 与 runtime provenance 清理。build 不再递归吸收 ignored `src/electronapp` 状态，只复制 Git tracked 产品源码；`apiclient.js`、`toast.css` 和 `app.js` 现在各有唯一的 fixed base → payload/transform → exact output contract，base/input/generator/output hash 不匹配会 fail-fast。测试中对 ignored Web snapshot 的读取也改为明确 vendor/patch source。

新增独立 `source-provenance.json`，记录 archive/baseline、Web base/final tree、Electron、Pepper bridge、libmpv 与 production dependency closure；`runtime-provenance.json` 绑定 tracked/prepared/overlay relation；`build-manifest.json` schema 2 只负责 final payload，增加 source/provenance/package-lock binding、规范路径、双向 file-set 与 canonical payload digest。Windows LF/CRLF 不再改变 generator identity，真实 generator 内容偏离 HEAD 仍会停止构建。

正常与 fresh detached worktree 在实现 revision `5019a754ecd75d2a64767e19996d6ded7ad6c3fd` 上均完成 prepare、`npm test 150/150`、build、source/runtime provenance 和 package verify。两边 build manifest 各 2,130 files，实际 runtime 各 2,131 files，逐路径 SHA256 为 `missing=0`、`extra=0`、`mismatch=0`。未编译 installer，未执行真实 Emby 播放；产品播放、Session、WebSocket、Toast、UI、Electron、bridge 与 libmpv 行为未修改。

## 2026-09-16 — CD2 budget and Native fallback Toast REAL acceptance

已验收实现 `9c9ec3871699d26157a4e29a52bf9198c8e03748` 的 Windows candidate REAL acceptance 通过。Candidate 为 `EmbyTheaterEnhanced-0.1.1-cd2-toast-candidate-9c9ec38-setup.exe`，大小 `125,182,889` bytes，SHA256 为 `3c2c136610d2d2cb8e53f8636db7af3a4e5dc0f7333254b5fb6408150e2c6d69`；Build、Provenance、Package verify、Installer verify 均通过，`missing=0`、`extra=0`、`mismatch=0`。

真实 CD2 证据：client ready 约 `7ms`、Find 约 `9ms`，Direct download RPC 约 `336ms`，在 `500ms` contract 下成功 `direct_url_hit`、CD2 HIT、`route=direct-url` 与 `core-playing`。这只证明当前 Windows 环境的约 `336ms` 响应已被覆盖，不推断所有环境的最优值。真实 fallback 证据：Direct/Same-Origin `not_found`、Mount `mount_missing` 后最终 `route=native`、`reason=native_fallback`，原生 Toast 实际显示一次，Stats 正确显示 Emby 原生、STRM 是、CD2/Mount 未命中、Fallback 是。

当前 CD2 budget、Same-Origin reserve、Native fallback Toast 与 Stats semantics 可进入 main。错误 mapping 仅为本地测试配置，未写入仓库；本轮未修改代码、测试、版本或用户/服务器配置。

## 2026-09-16 — CD2 download budget relaxed

真实 Windows telemetry 已证明旧 `300ms` `GetDownloadUrlPath` deadline 偏紧：成功样本约 `133ms`，另一真实样本约 `302ms` 因旧 deadline 超时；同一次播放随后 Mount 与 `core-playing` 通过。当前 contract 已将 STRM Resolver overall budget 从 `750ms` 调整为 `1200ms`，Direct 与 Same-Origin download 均为 `500ms`，Direct 为 Same-Origin 保留 `500ms`；CONNECT/readiness `200ms`、Find `350ms` 保持不变。Resolver 传入的 absolute deadline 仍是 CD2 service 的硬上限。

本轮只修改 CD2 budget 常量、persistent runtime default 和受控时钟测试，不改变 Resolver precedence、STRM identity recovery、Mapping、Mount 判定、PlaybackManager ownership、Session/PlaySessionId、WebSocket、DeviceId、WatchTogether、mpv 或 Electron。CD2/Resolver targeted `76/76`，全量 `npm test` `140/140`；未生成 candidate，真实 Windows playback 尚待用新 budget 重新取证。

## 2026-09-16 — STRM native fallback Toast

当前 prepared Web runtime 已确认使用原生 AMD `toast` 模块；既有 `common/input/api.js` 的 `DisplayMessage` 通过同一模块显示短消息。模块自身未实现 `timeoutMs`，原生动画/回收默认约 3.3 秒，本轮复用默认行为，不引入自定义 DOM、CSS 或动画。

Toast 只在当前播放确认 STRM，且最终 Resolver result 派生为 `route=native`、`reason=native_fallback` 时触发。DirectUrl、CD2 HTTP、Mount、普通非 STRM Native、resolver_disabled、no_matching_rule、transcode_skip、invalid_context 及任何中间阶段失败后命中后续增强路径均不触发。request 级幂等、current request 检查和 stop/destroy/supersede 保护已实现；module/API 异常 fail-open，原生播放与既有 Stats/Session contract 不受影响。

Toast/playback lifecycle targeted `4/4`、全量 `npm test` `144/144`、相关 JS syntax 与 `git diff --check` 通过。未生成 candidate，真实 Windows Toast 视觉验收仍待手工确认。

## 2026-09-16 — Stats 未尝试阶段展示语义

修正 `playback-route-stats` 的用户态映射：Mount-first 直接命中时 CD2 显示“未使用”，`not_attempted` 不再透传；timeout 仍显示“超时”，miss/not_found 仍显示“未命中”。仅调整 Stats 展示语义，不改变 Resolver、CD2、Mount 或 timeout/budget。targeted `4/4`、全量 `npm test` `136/136`、JS syntax 与 `git diff --check` 通过。

## 2026-09-16 — Diagnostics run correlation and native Stats source

修复 Diagnostics Export 的跨 app run request-id 串联：Summary 现在以最新 `route-selected` 向前最近的 `app/start` 为边界，只关联该 run 内相同 request 的 CD2、Mount、native fallback 与 playback event；无边界时保守为 `UNKNOWN`，不会把旧 run 的 Mount HIT 显示到新的 DirectUrl 播放。回归覆盖重复 `play-1-1`、同 run Direct → Same-Origin → Mount、以及同 run 多播放请求。

原生 Emby Stats consumer 审计确认它会无过滤保留自定义 category，只有 audio/video 会改写标题。因此 libmpv 追加第四个 `Emby Theater Enhanced` 分类，显示当前播放的安全 resolver 结果，不改 Web UI、Toast、CSS 或设置页面。状态在新 request、stop/destroy 清除，旧 request 的晚到结果不能覆盖新项；Media/Video/Audio categories 保持原样。Node targeted `20/20`、全量 `npm test` `136/136`、相关 syntax 与 `git diff --check` 通过；从本提交构建的隔离 runtime 已实际通过 DirectUrl、CD2 HTTP、CD2 miss → Mount、native fallback pipeline Stats 验证。未改 CD2 timeout/budget，未生成 candidate，真实 Windows Stats 显示仍待手工验收。

## 2026-09-16 — CD2 REAL PLAYBACK TIMEOUT audit

真实验收已确认 STRM identity recovery、resolver participation、Mount route 和 `core-playing` 均为 `REAL PASS`。本轮审计未调整 `DEFAULT_TOTAL_BUDGET_MS=750` 或 200ms readiness / 350ms Find / 300ms download 上限。约 319ms 与 312ms 旧日志是 CD2 mode 的 aggregate elapsed，当前不能证明具体卡在 `waitForReady`、`FindFileByPath`、`GetDownloadUrlPath` 或 total deadline；最可能但未证实的方向是 300ms download deadline 加少量调度开销。新的 CD2 阶段 timing 将在下一次真实播放区分 client-ready、Find 和 download。

main service 已复用同一 transport/gRPC client/channel；Direct 到达 download miss 后 same-origin 会复用 Find result，Direct 若在 readiness/Find 失败则 same-origin 重新进行这些阶段但不新建 channel。设置页 `mapped` 只验证纯 sourcePrefix → cloudPrefix 替换，不能代表 gRPC/文件/下载 resolve 成功；连接测试使用临时 service 的 1.5s readiness + 500ms 根目录 probe，也不覆盖实际媒体路径与下载。

本轮新增安全 CD2 timing（无 Path/URL/token）并修正 persistent CD2 miss → Mount hit 的 `cd2Reason` 保留；不改变 resolver precedence、source selection、Mount、PlaybackManager、Session、WebSocket、DeviceId、WatchTogether、Electron 或 mpv。自动验证：targeted `72/72`、`npm test` `129/129`、相关 JS syntax 与 `git diff --check` 均通过。未生成 candidate，新的真实 Windows CD2 playback timing 仍待用户验收。

## 2026-09-16 — Client Diagnostics v1

基于 `origin/main@aad4a0ddfd489cf0a9e3bf1f9b7af147d9376f38` 创建分支 `feat/client-diagnostics-log`。本轮新增客户端诊断日志、统一脱敏、轮转、导出 IPC、设置页入口，以及 resolver/CD2/Mount/libmpv 的低风险结构化事件；产品版本保持 `0.1.1`。日志只替换可观测性，不改变 Resolver precedence、DirectUrl、CD2 timeout/budget、Mount 判定、PlaybackManager、Session、WebSocket、DeviceId、播放上报、NextTrack 或 WatchTogether。

日志位置为 `%APPDATA%\EmbyTheaterEnhanced\logs\ete-client.jsonl`，UTF-8 JSONL 追加写入，约 2 MiB 后保留 `.1`、`.2`、`.3`。所有落盘记录统一经过 sanitizer；凭据、认证 query、完整 URL、完整媒体路径、Local Storage/Cookie database 和 `mpv.conf` 原文不落盘，路径与设备/会话标识只保留 16 位哈希。日志和导出失败 fail-open，不传播到播放链。

设置页“诊断与日志”提供状态、导出 TXT、打开日志目录和二次确认清空。导出报告按轮转文件到当前文件顺序合并，并生成最近 route、CD2、Mount、Native fallback、core-playing 和 playback 摘要；不确定值写 `UNKNOWN`。当前自动回归为 `npm test 123/123`，其中本轮 diagnostics/preload targeted 为 `15/15`；构建、provenance、package 和候选安装包结果以本分支最终验证记录为准。

真实 Windows 客户端各 route 播放、真实导出 TXT、AI 可判定性和 Session/remote 状态事件仍需人工验收；旧 upstream Web UI、`apiclient.js`、`connectionmanager.js`、PlaybackManager vendor snapshot 与 WebSocket 生命周期相关观测本轮保持 deferred。详细 contract 见 [CLIENT_DIAGNOSTICS](CLIENT_DIAGNOSTICS.md)。

## 2026-09-16 — STRM identity recovery

真实客户端取证确认：`item` 和 `mediaSource` 存在，但 `item.Path` 缺失；`MediaSource.Path` 已是实际 `.mkv`，Container 为 `mkv`，播放方式为 `DirectStream`。因此本轮没有采用 `DirectStream + file + mkv` 启发式，而是在 `item.Path` 缺失且 `item.Id`/`item.ServerId` 充分时，复用现有 `connectionManager` 与 `apiClient.getItem(userId, itemId, {Fields:'Path'}, signal)` 做一次有界 recovery。

仅当 metadata 返回的 Path 以 `.strm` 结尾时才补入 resolver `sidecarPath`；`MediaSource.Path` 继续作为 source identity，普通 `.mkv`、请求失败、超时和 superseded request 均保持 Native 行为。context diagnostics 新增 `strmIdentitySource`、`metadataRecoveryAttempted`、`metadataRecoverySucceeded` 与 `recoveredPathEndsWithStrm`。

## 2026-09-15 — Stable Enhanced DeviceId implementation

分支 `fix/stable-enhanced-device-id` 基于 `origin/main@780aaed8ddc5bde42654e56e7635379f29f9e485`，未基于 `fix/product-session-identity`。本轮只将正式 ETE 的 DeviceId 从 `os.hostname()` 改为 ETE 自有 config 目录中持久化的随机 UUID；DeviceName 继续使用 hostname。缺失/损坏 identity 文件会原子重建，升级保留，clean profile 生成新值；不迁移旧 hostname DeviceId，不修改服务器 Device/Session、token、capability、WebSocket 或播放链。`app.setName/productName` 不在本分支范围。

新增 identity helper 与 9 项回归测试；当前实现 targeted identity tests 9/9、全量 `npm test` 110/110、JS syntax 和 `git diff --check` 已通过。提交后的 source build、runtime provenance、package verify 和 Windows candidate installer 均通过。candidate 为 `EmbyTheaterEnhanced-0.1.1-stable-device-id-candidate-aba1145-setup.exe`，SHA256 为 `B3D57CBC1E50DD5EEBAA5E5563D8C83831BC3959AEE76D1E99A00845E6F8E51F`。

正式安装后的 REAL acceptance 全部通过：STRM playback、next episode、playback progress reporting、Dashboard remote-control buttons、`SupportsRemoteControl`、WebSocket、DeviceId 与 hostname 分离、DeviceId 重启稳定性均为 `PASS`。第一次与第二次 ETE DeviceId hash 均为 `065ce40875be5fbb`，hostname-derived DeviceId hash 为 `104ab9213e28e4ff`；真实 Session 的 `NowPlayingItem` 存在、PositionTicks 持续增加，`SupportsMediaControl=true`，WebSocket 为 `OPEN`。本轮没有直接捕获 `Sessions/Capabilities/Full` 的 HTTP status，不记录或推断为 `204 PASS`。本次只验证 ETE 独立持久 DeviceId；OLD runtime 的 A/B 已在相同 runtime、token、UserId 下证明原 DeviceId 为 `remote=false`、仅改变 DeviceId 后为 `remote=true`。`fix/product-session-identity` 不属于本修复。

## 2026-09-15 — Direct app launch Daily-use Candidate 修复（REAL PASS — direct app launch）

原 `4761a2440e9ab1df0b3c6d01765f26f9560d9bea` 候选记录为 `NON-BLOCKING FAIL — launcher UX`，原因是 `PowerShell wrapper caused visible console flash and startup delay`。本分支 `fix/direct-app-launch` 将正式入口改为直接启动 `Emby.Theater.exe`，并把原 `Start-Enhanced` 的目录创建与缺失文件 seed 迁入 Electron main-process bootstrap；保留 `ProgramDataPath` 和用户已有配置语义，不修改 PlaybackManager、STRM resolver、CD2、Mount、libmpv、Session、WebSocket 或播放策略。

安装器的开始菜单、桌面快捷方式和安装完成 Launch 均直接指向 `{app}\Emby.Theater.exe`；`tools/build.ps1` 不再复制 `Start-Enhanced.ps1/.cmd`，source tool 文件暂保留。候选 runtime 固定为 `dist/EmbyTheaterEnhanced-0.1.1-direct-app-launch`，installer 固定为 `dist/EmbyTheaterEnhanced-0.1.1-direct-app-launch-setup.exe`；artifact 绑定 code/package HEAD `b16273c71de5e671f1c38e4b355edb72382ec137`，后续 `8bb79341490aaba3404db2a6411510d66a7b8bef` 及本轮文档修正均为 docs-only，不改变 artifact 内容。provenance、package verify、Inno archive integrity 和逐文件 payload comparison 均通过。

当前自动验证：bootstrap/installer targeted 3/3，相关 targeted 合并检查 5/5，`npm test` 101/101，JavaScript syntax 68/68，PowerShell syntax 11/11，`git diff --check` 通过；code/package HEAD `b16273c71de5e671f1c38e4b355edb72382ec137` 的 source build、provenance、package verify、archive integrity、payload comparison 和 packaged bootstrap 隔离检查均通过。后续 docs-only commit 不要求重新生成 artifact。原候选失败原因保留为历史验收记录；本轮仅关闭 launcher UX，不改变整体 Daily-use Candidate 的最终 READY 判定。

真实手工验收已完成并通过：installer post-install Launch、桌面快捷方式、开始菜单快捷方式、直接 `Emby.Theater.exe` 均为 `REAL PASS`。四入口均无 PowerShell/CMD 窗口闪烁，启动体验正常，既有 Emby 登录状态保留。本轮只关闭 launcher UX 问题；Daily-use Candidate 整体仍未达到最终 `READY`，其他 playback、STRM、audio、subtitle、NextTrack 和 endurance 项目保持原有验收边界。

## 2026-09-15 — Daily-use Candidate prepared from latest origin/main

完成首个 Daily-use Candidate 的验证与打包准备。fetch 后 `main` 快进到 `origin/main@4761a2440e9ab1df0b3c6d01765f26f9560d9bea`，快进前工作树干净，没有未预期 local patch。当前候选 runtime 为 `dist/EmbyTheaterEnhanced-0.1.1-daily-use-candidate-4761a24`，实际 2,124 文件；安装包为 `dist/EmbyTheaterEnhanced-0.1.1-daily-use-candidate-4761a24-setup.exe`，125,175,083 bytes，SHA256 `f3088aa87a5fd78f6395b926ccbbf6e16b67bb8085f648625a7949c2b3d5a72a`。旧 0.1.1 setup 未覆盖。

自动验证全部通过：STRM/settings targeted 21/21、全量 `npm test` 98/98、66 个 JS/CJS syntax、11 个 PowerShell syntax、`git diff --check`、source build、runtime provenance（785 product scope，3/3 overlay，1/1 prepared artifact）和 `tools/package.ps1 -VerifyOnly`（2,123 payload entries）。Inno archive integrity 通过，解包 `{app}` 2,124 文件与 runtime 逐文件 SHA256 一致，缺失/额外/mismatch 均为 0。按用户要求没有重跑历史 hidden Electron smoke；该证据仍为 `NOT COMPLETED — hidden Electron smoke timeout`。验收矩阵和手动清单见 [DAILY_USE_CANDIDATE](DAILY_USE_CANDIDATE.md)。

本轮不创建 PR、release 或 tag，不修改产品代码。当前候选可交给用户执行手动日常使用验收；真实 settings UI、真实 Mount、当前 HEAD 的真实完整播放链、音视频轨道切换和 endurance 仍按文档留待手动覆盖。

## 2026-09-15 — STRM resolver settings candidate

基于 `main@ca9ca9de58c37b8f5f3782dd1e45e9efc2071495` 创建独立 worktree/branch `feat/strm-resolver-settings`。本轮将 STRM / Mount / CloudDrive2 / DirectUrl resolver 配置产品化：新增 schema version 1 的 main-process persistent config store、独立 secret 文件、trusted config IPC、最长前缀规则、cloud-first/mount-first/custom strategy、AUTO/USER/DISABLED 生命周期和 `mpvplayer/strm.html` 设置入口。PlaybackManager、Session、PlaySessionId、WebSocket、播放报告和 embedded libmpv ownership 未修改。

配置保存后立即持久化，当前 CD2 service 不做 hot reload，页面提示重启后播放链生效。legacy `ETE_CD2_*` 只在首次 bootstrap 时迁移为 AUTO；其中 `ETE_CD2_ENABLED` 只迁移为 `cd2.enabled`，bootstrap 时 top-level `config.enabled` 始终保持 `true`，不会关闭整个 STRM resolver。persistent USER/AUTO/DISABLED 状态优先，renderer GET 只得到 `tokenConfigured`，不得到 token、Bearer metadata、raw gRPC client 或完整 DirectUrl。

本轮 legacy migration 修复后的最终 HEAD 静态与自动化验证：settings suite 21/21；全量 `npm test` 98/98；覆盖 `ETE_CD2_ENABLED=0` 时 global resolver 保持启用、CD2 disabled 后继续 Mount 命中，以及既有 Windows/UNC/POSIX boundary、`..` 拒绝、source identity precedence、最长前缀、规则 ownership、strategy order、mount replacement、DirectUrl/same-origin mode、Native fallback、Abort 和 bounded authenticated connection probe。最终 HEAD 的 source build、runtime provenance 和 package payload verify 均通过。最终-head synthetic runtime smoke 保持记录为 `NOT COMPLETED — hidden Electron smoke timeout`；本轮未重新运行或重试。该 timeout 属于 runtime smoke 证据边界，不判定产品功能失败，也不宣称最终 HEAD 已重新通过 synthetic runtime。

较早候选 HEAD `295626753089de9f70c2cb28b5c5954be51b3843` 已有 synthetic runtime pipeline PASS 证据，包含 DirectUrl fake、CD2 HTTP fake、CD2 miss → Mount/Native fallback，以及 PlaybackManager / Session / controls / reporting / cleanup。上述证据继续保留，但不冒充最终 HEAD `628b3c4...` 的重新验证结果。

真实边界：当前 native-window automation surface 不可用，未继续启动播放器补齐手工点击证据，因此 `REAL SETTINGS UI: NOT COVERED — native window automation unavailable`。本分支未连接真实服务器，real cloud-first playback 与 real mount-first playback 均为 NOT COVERED；synthetic runtime/Node unit 不能替代真实验收。

## 2026-09-15 — Clean-room reproducibility / readiness observability hardening

基于正式基线 `main@56b2227324811b525cd73caed61e3399cd2875e5` 创建独立分支 `audit/cleanroom-readiness-hardening`，代码提交为 `6c5cc9e05b7dbec6a01a2cf81cd19209deb0b319`。本轮只修改 prepare/build/provenance、acceptance observer/runner、diagnostics tooling、tests 和 docs；没有修改 PlaybackManager、resolver、libmpv 播放逻辑、Session/remote control、settings/autoplay、UI、CEC、Electron 或 mpv 版本。

修复 clean-room blocker：`src/electronapp/preload.js` 原来被 `.gitignore` 忽略，测试直接读取但 `prepare.ps1` 没有生成来源。现在由 tracked `tools/prepare-preload.cjs` 从 vendor Carnival preload 生成 prepared workspace artifact，并由 `prepare.ps1`、`build.ps1` 共用；runtime provenance 单独校验 vendor base、generator、prepared source 和 runtime hash。旧 214-byte vendor preload 与 Enhanced diagnostics/sticky state 不再混淆。

两个独立 clean worktree 各自执行 `npm ci --ignore-scripts`、prepare、`npm test`、build、provenance 和 `package.ps1 -VerifyOnly`，均通过；`npm test` 为 77/77，runtime 各 2116 个 payload，scope 54，prepared artifact valid，两个 build manifest 逐路径 SHA256 identical。

readiness observer 现在记录 raw embed ready、direct diagnostics callback、sticky/current readiness、core-playing、视频 PositionTicks、Session/progress 和 Stop；带 runId/时间/bridge 关联，旧 run 不能污染新 run。完整 alternate evidence 缺少 direct marker 时归类为 class B observer-only-miss，不再当作 Pepper initialization failure。当前 10 次 startup real run 为 A 10/10、playback 10/10、raw/authoritative readiness 10/10、observer miss 0/10、actual player failure 0/10；2 次 full-control 通过，Stop 后 NowPlaying 清空、runner residual=0。结论详见 [CLEANROOM_REPRODUCIBILITY](CLEANROOM_REPRODUCIBILITY.md) 和 [READINESS_OBSERVABILITY](READINESS_OBSERVABILITY.md)。

基础环境记录为 host Node `v24.18.1`、Windows PowerShell `5.1.26100.9444`、bundled Electron `18.3.15`，embedded Node `16.13.2`。本轮不 push、不 merge、不发布。

## 2026-09-14 — External Player process-control cleanup Batch 2

基于 `main@65d97da975ea1ffc3505c099094086c33667931e` 在 `cleanup/external-player-process-chain` 完成本批 host/process legacy cleanup。重新审计确认 Batch 1 已从 fresh runtime 排除 External Player frontend/plugin，`mpvPosEvent`、`mpvPos`、`mpv-socket`、Electron custom shell 的 `canExec/exec/close`、close-event helpers、`shellstart/shellclose`、`processes`、`startProcess`、`closeProcess` 和旧 `execFile` callback chain 均无其它当前 consumer，已从维护产品代码删除。

保留项：`shell.openUrl` 与 `electronapphost://openurl`、generic `window.ipc`、CD2/diagnostics IPC、其它 host protocol command、CEC、Anime4K `child_process.exec('notepad.exe ...')` helper、Pepper/libmpv、PlaybackManager、resolver、Session/remote control 和 `sessionplayer.js`。浏览器 fallback `www/modules/shell.js` 的 unsupported process API 未改动，vendor/carnival 原件未改动。

新 runtime `dist/EmbyTheaterEnhanced-0.1.1-batch2-process-chain-65d97da` provenance PASS（779 product-scope entries），package verify PASS（2,116 payload files）。runtime `electronapp` 下本批 dead reference 为 0；相对 Batch 1 after-cleanup runtime，实际文件数保持 2,117，大小由 389,008,884 降至 389,005,881 bytes，减少 3,003 bytes。文件数不变是因为删除发生在保留的 `main.js`/`shell.js` 文件内部。

新增 targeted process-chain tests 5/5；全量 `npm test` 67/67。唯一一次 bounded real acceptance 的 `inspect/select/play/pause/seek/resume/next/stop` 全部通过，`strm=true`，Pepper-ready、resolver-result、manager-play-resolved、Session/reporting、cleanup 均通过，runner `completed`、`timedOut=false`、residual owned processes=0。`loadfileObservation=unavailable` 仍是既有 observability gap，不作为 gate。

本批未处理 settings/playback、item autoplay、PlaybackManager external-player guards、shared locale/CSS、`external/`、vendor helper、CEC、Pepper/PPAPI、Electron upgrade 或用户配置迁移；当前不能写成 External Player 全部移除。Model Tier：2；Reason：跨 main-process IPC、custom shell、host protocol 和真实播放/Session 边界的删除与验收。

## 2026-09-14 — External Player registration portability fix

在 `cleanup/external-player-frontend` 上补齐 Batch 1 最后一个 portability blocker。新增 tracked `tools/patch-external-player-registration.cjs`，只处理 Electron 的 `responses.electron && list.push("modules/externalplayer/plugin")`；`tools/build.ps1` 在 source overlay 后执行 patch，再排除 External Player frontend directory。Android/其它平台分支不受影响，already-clean 状态幂等，重复/未知变体 fail closed。

`tools/runtime-provenance.cjs` 将 `electronapp/www/app.js` 纳入受控 build overlay，记录并校验 source/runtime/generator hash；source app.js 缺失时安全使用 vendor fallback，scope 不粗暴排除 app.js。新增 app-registration 与 provenance fallback 回归。未修改播放、Session、main IPC、shell、CEC、vendor 或用户数据；未重新执行真实 acceptance。

## 2026-09-14 — Provenance portability blocker fix

Batch 1 review 发现 External Player frontend 位于 ignored `src/electronapp/www/`，本机物理删除不具备 Git portability。当前修复在 `tools/runtime-provenance.cjs` 中加入精确 `src/electronapp/www/modules/externalplayer/` intentional source exclusion，并写入 `validatedProductScope.excludedSourcePrefixes`；同时将 `electronapp/www/app.js` 纳入 tracked build-time registration overlay，由 `tools/patch-external-player-registration.cjs` 只关闭 Electron registration。source subtree/app.js 存在或不存在时均可生成受控 provenance，普通 source file 缺 runtime 仍然失败。新增 targeted regression 与 sentinel portability 验证覆盖该边界。

Local audit workspace：41 个 ignored snapshot files 曾在本机删除。Durable repository/product behavior：provenance contract 和 `tools/build.ps1` runtime exclusion 保证 fresh Enhanced runtime 不包含该 frontend，不依赖本机 ignored snapshot 状态。未修改播放、Session、main IPC、shell、CEC 或用户数据，未重新执行真实 acceptance。

## 2026-09-14 — External Player frontend cleanup Batch 1

基于 Audit commit `fb434e57f2cca065c784e0551c651ef57d1a2634` 创建分支 `cleanup/external-player-frontend`，完成 cleanup commit `adc8758902a580cc3bc7fc33bfb10a6b422c828d`。本轮只移除 External Player frontend/plugin layer：本地 ignored Web snapshot 的 41 个文件已物理删除，`tools/build.ps1` 增加纯 frontend runtime exclusion，并移除直接读取已删除 plugin 的 obsolete 单测。vendor 原件、main IPC、shell、CEC、external helper、PlaybackManager、Session、libmpv、resolver、CD2、DirectUrl、Mount、preload 和用户数据均未修改。持久化到仓库的行为是精确 runtime exclusion，而不是 41 个 tracked file deletion。

新 runtime `dist/EmbyTheaterEnhanced-0.1.1-batch1-after-cleanup-adc8758` provenance 通过，删除路径 0 entries，`package.ps1 -VerifyOnly` 通过（2,116 payload files）。对照 runtime 为 2,158 files / 389,112,766 bytes，清理后为 2,117 files / 389,008,884 bytes，净减少 41 files / 103,882 bytes；本地 source 删除 77,725 bytes。`npm test` 56/56、451 个 JS syntax、11 个 PowerShell syntax 和 `git diff --check` 均通过。

唯一一次 bounded real acceptance 的 `inspect/select/play/pause/seek/resume/stop` 全部通过；`strm=true`、Pepper-ready、resolver-result、manager-play-resolved 均观察到，Session/reporting 正常，runner completed、cleanup verified-clean、residual=0。`loadfileObservation=unavailable` 仍为 observability gap。External Player frontend/plugin layer 已标记 REMOVED；`mpvPosEvent`、named pipe、main-process external-player IPC、shell external-process branch、`external/` 和 vendor helper 明确保留到后续 Batch 2/3。

## 2026-09-14 — Legacy cleanup audit

基于当前 `main@c873913ea1a2716e048e785fa2fd83294dd091b5` 完成 Foundation Cleanup / Legacy Audit。本轮只做静态引用追踪、分类和 packaging inventory，没有修改 `src/` 产品行为、PlaybackManager、Session、libmpv、resolver、CD2、CEC 或用户数据，没有删除代码、运行 Carnival/补丁脚本、执行真实 Emby 播放、提交或推送。

新增 `docs/LEGACY_AUDIT.md`，覆盖 External Player、shell/exec、CEC、旧 IPC/named pipe、settings/routes、打包残留和平台兼容代码。结论为：External Player 41 文件及其旧 mpv pipe 具备高置信度删除候选条件；shared `shell.openUrl`、CEC、preload generic IPC 和 Foundation 播放/Session 链必须保留；Pepper/PPAPI/Electron 18、平台分支、CEC driver/alias、Anime4K preset 和 settings/autoplay 语义继续 DEFER/UNKNOWN。当前推荐进入 Cleanup Batch 1 规划，尚未执行 cleanup PR。

本轮静态证据包含 vendor manifest/build/installer 全量复制关系、当前 ignored Web snapshot 和实际 runtime payload 统计。验证：`npm test` 57/57；未执行真实 acceptance 或安装验收。产品代码 modified：NO。

## 2026-09-14 — Pepper ready listener race follow-up

分支 `fix/pepper-ready-listener-race` 基于 `main@e9e2ad221ed5059574f830e9ffd9ef0dd5c8a22c`，上一轮诊断 harness/doc 资产已由 `ef34827378805e7a80ea0f73e1f5bbf2ddbf9314` 独立保留。本轮产品修复 commit 为 `731dc2ad5ca4898475a5e641b6975563f9cf8c74`，仅将 authoritative window `ready` listener 和 `libmpv=embed` 初始化移到 DOM attach 前，并新增行为型同步 ready 回归。新 runtime provenance 通过；一次真实 acceptance 的 inspect/select/isStrm/Pepper-ready/resolver-result/manager-resolved/cleanup 全部通过。历史 readiness 根因仍未确认，本修复只处理静态 listener-after-attach 风险；未 push、未 merge。

## 2026-09-14 — Pepper readiness 抖动诊断

当前 `main@e9e2ad221ed5059574f830e9ffd9ef0dd5c8a22c` 的产品代码保持冻结。基于新建且通过 full runtime provenance 的 `dist/EmbyTheaterEnhanced-0.1.1-readiness-diagnosis-e9e2ad2` 完成 3 次有界 real acceptance，均 `acceptance=success`、`runner=completed`、`timedOut=false`、`cleanup=verified-clean`、residual=0。三次均观察到唯一 embed，播放期间无重建；`play-called→embed` 为 4535–5996ms，`embed→authoritative enhancedDiagnostics(libmpv, 'ready')` 为 2–3ms。当前诊断为 `ROOT CAUSE NOT YET CONFIRMED`，主要抖动位于 embed 创建前的 PlaybackManager/player 前置链，精确 sub-stage 仍待观测；没有证据支持 Pepper/plugin 初始化、ready 丢失、embed recreation 或 PR4/DirectUrl/resolver 是本轮 ready 抖动原因。详见 `docs/PEPPER_READINESS_DIAGNOSIS.md`。本轮只增强 acceptance harness 与文档，未修改产品代码，不提交、不推送。

更新时间 2026-09-14（UTC+8）。**当前产品代码保持冻结。readiness harness baseline 已由 `3d1cc6d906131d2e7e1d0a10af5fd354b228a41d` 提交；本轮独立 follow-up 加固了 runtime provenance、终态单写入和 PID ownership 边界。历史 real acceptance artifact 已分开记录：旧 `readiness-main-20260914-070236533-48d1e60e` 是 acceptance success 但 runner 在旧生命周期下以 242507ms timeout 收尾；较新的 `terminal-real-20260914-073146032-27837240` 是 acceptance success、runnerResult=`completed`、timedOut=`false`、elapsed=`15959ms`、residual=0。两次均保持 `loadfile` unavailable observability gap，不作为 gate。**

## 接手摘要

- Baseline：用户提供的 Carnival 3.0（应用 3.0.20-3.0）+ 综合补丁最终 ZIP。
- Enhanced：0.1.1 开发候选；Windows host 文件版本保持 3.0.20.0，Electron 应用构建版本为 0.1.1。
- Git：本轮基于 `main@65d97da975ea1ffc3505c099094086c33667931e` 在 `cleanup/external-player-process-chain` 完成 Batch 2；技术基线与验证结果记录于本节，具体合并状态以仓库 Git/PR 历史为准。未知来源的完整 Web snapshot、vendor 输入、二进制与构建产物均排除。
- 源码：`src/electronapp`；原件在根目录，解包输入在 `vendor/carnival` 与 `vendor/patch`。
- 交付：`dist/EmbyTheaterEnhanced-0.1.1-final-win-x64/Start-Enhanced.cmd`；`dist/EmbyTheaterEnhanced-0.1.1-win-x64-setup.exe`。旧 0.1.0 产物保留。
- 工具：`tools/prepare.ps1`、`build.ps1`、`package.ps1`、`test-runtime.ps1`、`test-host.ps1`、`tests/readiness-acceptance.ps1`。

## 验收状态

| 项目 | 状态 |
|---|---|
| 工程目录和知识库 | 完成；公开 Git baseline 已推送，Mount Resolver 已合并到 `main` |
| Carnival 分类与 vendor 清单 | 完成；E 类 815 文件精确上游来源未确认 |
| 可重复 runtime 构建 | 通过；merge review final/repeat 各 2156 个 manifest 载荷，逐文件 SHA256 0 差异 |
| 原 Windows host 启动 | 测试副本通过；host+4 Electron 进程、诊断日志 |
| Electron UI 与播放器注册 | 通过，已视觉查看；无 externalplayer |
| Inno 安装包 | PR #2 隔离编译/解包通过，2157 个 `{app}` 文件与 runtime 逐哈希一致；本轮未执行系统安装 |
| 合成媒体内嵌 libmpv | 可见测试通过播放推进/暂停/seek/恢复/stop |
| 原生普通媒体 / STRM | 真实 STRM 两集通过，走原生 DirectStream；普通文件仅本地/模拟验证，库内无样本 |
| Session / Remote Control | 非管理员账号下，真实服务器接受命令、WebSocket 送达、播放器响应及服务端状态回读全部通过 |
| WatchTogether | 按用户确认的后台控制正常口径通过；未宣称插件双客户端同步精度已测试 |
| STRM Mount Resolver | 已实现 Detection、Mount → Native contract、确定性优先级、媒体扩展 allowlist、Transcode protection 和安全诊断；POSIX source candidate 只进入 CD2，不进入 Windows Mount；43/43 与隔离 runtime 通过；真实 native fallback 通过 |
| CloudDrive2 Resolver PR #2 | merge blocker 已修正；43/43、fake/frozen、Stop-before-player、reject fallback、POSIX mapping、真实 CD2 media core-playing 通过；两个真实 Emby POSIX STRM 样本均 `cd2_hit`，完整控制链与报告通过 |
| CloudDrive2 DirectUrl PR #4 | 56/56；file-local UA/no-leak、unsafe header/UA fallback、expiry reacquire、Abort/timeout/shared budget、fake frozen 完整链既有证据通过；重建 runtime 的 DirectUrl 请求与 UA isolation 通过，真实 DirectUrl + returned UA 的既有 embedded libmpv 分层证据有效；完整实服 PlaybackManager 仍受 resolver 前 timeout 阻塞 |
| Acceptance readiness harness | full runtime provenance 覆盖 818 个 `src/electronapp` 文件与 2 个 Start wrapper，package/PlaybackManager overlay 单独校验；terminal success/failure/timeout、terminal race、PID mismatch synthetic 均通过；历史较新 real artifact 已贯通至 resolver-result，runnerResult=completed/timedOut=false/residual=0，loadfile 保持 unavailable observability gap |
| External Player | frontend/plugin 与 host/process-control chain 已移除；settings/autoplay/PlaybackManager/shared residue 仍保留 |
| 环境诊断 | 实际 Electron/Chrome/Node、DLL API/version、ready/playing 已取得 |
| mpv.conf / GPU / HDR | 配置规则/隔离通过；真实样本 gpu-next、d3d11va 硬解及缓存 3221225472 字节已取得；HDR/画质效果不是本次样本覆盖范围 |

## 已确认环境

Electron **18.3.15**；Chromium **100.0.4896.160**；Node **16.13.2**；mpv **v0.41.0-920-gdd5d17d32**；libmpv client API **2.5**。package.json 中旧 Electron 依赖声明不代表实际版本。

## 已知问题与限制

1. 缓存负数根因已关闭：native 设置正确，bridge int32 回传截断；0.1.1 精确文本诊断已修复。未测实际内存占用峰值，不将配置值等同于内存分配量。
2. APPDATA 隔离问题已关闭：原生默认搜索 Windows Known Folder，测试改用 MPV_HOME 并验证配置标记。正式用户配置未修改。
3. 隐藏窗口媒体测试超时；原始并行 UI/host 测试也出现一次启动超时，后续串行通过。媒体测试使用可见窗口并顺序执行。内存 API fixture 只证明客户端逻辑，不具有真实服务器 Session/网络的证明力。
4. 815 个 E 类文件的精确官方来源，以及 Carnival EXE/bridge 的精确可复现构建来源仍不明；它们不在首次公开提交中。
5. 实际安装使用用户授权的独立 E 盘目录且当前进程已提权；安装/覆盖/启动/卸载均通过，但未展示 UAC 交互，也没有单独验证 Program Files ACL。尚未正式发布。
6. Mount Resolver 已完成静态、单元和隔离 runtime 验证；绝对 POSIX source candidate 在 Windows 上不会进入 `existsSync` Mount；真实 Emby native fallback 与控制链通过，但当前样本没有自然 Mount 命中；不同编码、字幕/音轨差异和长时间稳定性尚未验证。
7. CloudDrive2 PR #2 已完成 main-process 纯 JS gRPC、单条 Windows/UNC/POSIX mapping、750ms 总预算及 generation/late-response 防护。真实临时 mapping 命中，same-origin HEAD 200 / Range 206；有限候选中的普通 MKV 已实际 `core-playing` 并推进。Pepper bridge 不直接暴露 start-file/file-loaded/end-file/log-message；path 可直接观察，file-loaded 由 MKV format 与 13-track list 推断，未观察到 EOF/error。
8. 当前配置仅通过环境变量或 ignored local config 注入，不含设置 UI/credential storage。真实验收使用的 mapping 只存在于 ignored local acceptance 配置，未进入源码、文档或 Git。DirectUrl、User-Agent/additionalHeaders、expiresIn recovery、refresh/retry、多 mapping、provider 特判和 CD2 cache 管理均不在 PR #2。
9. PR #4 只支持受限 file-local User-Agent；`additionalHeaders` 任意非空即回退 same-origin。Pepper 不暴露可靠 HTTP 403/end-file error 分类，因此只实现 known-expiry 的一次 bounded reacquire，不声称运行中 403 自动恢复。既有真实 DirectUrl 分层 smoke 通过；本轮重建 runtime 的 DirectUrl fixture 在首个 source 请求后于 UI 切换阶段 timeout，真实 DirectSmoke 在 resolver 阶段 timeout，均未取得新的完整 Session/WebSocket/controls/reports 证据。
10. Acceptance runner 已改为单次 owned root PID 的 bounded runner：terminal report 出现后等待短 flush window；cleanup 先验证 root PID CreationDate，只有匹配后才观察并登记 descendants，随后只对该 root process tree 执行 `taskkill /PID ... /T /F`；无 terminal report 才使用 deadline timeout，最终始终写入 `runner-result.json`、stdout 和 stderr。success/failure/timeout、terminal race、`inspectProfile` integration race、PID-reuse-with-descendant 与 PID CreationDate mismatch synthetic 均通过。CIM unavailable 会 fail closed 为 `cleanupStatus=unverified`、`ownershipVerified=false`、residual 未知，不报告完整 success，也不观察/登记/kill 不确定 descendants。后续 follow-up 的 full provenance manifest 覆盖全部 repo-owned `src/electronapp` 文件，并将 package metadata 与 PlaybackManager 作为显式 build overlay；vendor baseline、node_modules production closure、Electron runtime binaries 与 native mpv 均独立排除。历史较新的 real artifact 中 `inspect`/`select`/`play-called`/`resolver-result`/`manager-play-resolved` 通过，`loadfileObservation=unavailable`；runner 总耗时 15959ms、runnerResult=completed、timedOut=false、residual owned processes=0。

## 当前阻塞项与下一步

用户已登录非管理员账号，明确允许选择任意影视测试，并确认全库为 STRM、WatchTogether 以后台控制正常为准。2026-09-14 persistent profile inspect 返回 `logged-in`。两个不同 POSIX STRM 样本在同一条本地 ignored source-side mapping 下均由 resolver 返回 `cd2_hit`、source kind 为 `cd2-url`；真实 embedded libmpv 播放推进，Play/Pause/Seek/Resume/NextTrack/Stop 全部通过，Session/WebSocket 回读正常，10 条播放报告全部被服务器接受，停止后 NowPlayingItem 清空。测试会留下样本正常观看进度，未额外重置用户数据。

本轮复核 `mount-resolver.js` 的 POSIX 分支并补充回归：absolute POSIX candidate 仍交给 CD2，CD2 miss 后不调用 Windows `existsSync`；UNC source 仍可命中 Mount。persistent inspect 工具只返回 `{loggedIn,reason}` 安全枚举；通过两个样本的只读 mapLocalPath/CD2 验证后，仅在 ignored acceptance 配置中注入 mapping，完成真实 CD2 控制链。没有修改服务器配置、媒体库、权限、账号、CD2 mount/cache 或网盘数据。许可证、公开范围与模型策略见 `docs/LICENSING.md` 和 `docs/AI_MODEL_POLICY.md`。

历史 PR #4 收尾验证已完成：当时源码 `npm test` 为 56/56，修改/新增 JS 与 PowerShell 语法检查、`git diff --check` 均通过；按源码重建的 verification runtime 关键文件与 `src/` 一致，frozen transport、file-local UA/no-leak 和 Stop-before-player 通过。该历史记录中的 resolver-entry blocker 不代表当前 readiness harness 的终态状态；真实 acceptance 证据仍按各 run 分层保留。

较早的 acceptance-readiness follow-up：`tests/live-acceptance-browser.js` 改为 global API/Events + 单次 canonical PlaybackManager acquisition，并在报告中分开记录 source/result；runner 增加 runtime validation、terminal report detection，gate 更名为 `resolver-result`，loadfile 降级为 unavailable。observer、产品代码未做 instrumentation；相关 real artifact 已通过 resolver-result，后续 terminal lifecycle 与 provenance 边界在本分支独立加固。

PR #2 新增 `cd2-resolver.js` 与 main-process `cd2-service.js`/`cd2-ipc.js`，通过 build-time overlay 给未公开 PlaybackManager 增加 request id，libmpv 使用 monotonic generation、AbortController 和 gRPC cancel。43/43 Node tests 通过；独立 frozen Stop-before-player 断言旧请求未调用 `player.play`、未产生 Playing report。完整 frozen Electron 中 dependency require、fake gRPC、CD2 hit、Mount/Native fallback、Play/Pause/Seek/Resume/NextTrack/Stop、报告、双 NextTrack、active cancel 与 0 active leak 通过。真实 CD2 media 通过；两个真实 Emby POSIX STRM 样本均 `cd2_hit`，embedded libmpv/core-playing、Session/WebSocket/controls/reports 全部通过。未修改 CD2 配置、mount、cache、账号或网盘数据。

## 推荐继续入口

- `docs/TESTING.md`：验证命令和真实测试卡。
- `docs/LIBMPV_RUNTIME.md`：缓存负数、配置来源与 GPU 属性。
- `src/electronapp/plugins/libmpv.js`：self.play、playInternal、message、getProperty。
- `src/electronapp/resolvers/strm-resolver.js` / `mount-resolver.js`：STRM 判定、路径推导、native fallback。
- `src/electronapp/resolvers/cd2-resolver.js`：renderer 窄 IPC adapter。
- `src/electronapp/enhanced/cd2-service.js` / `cd2-ipc.js`：main-process transport、mapping、deadline、校验与 cancel。
- `docs/CD2_RESEARCH.md`：ETLP beta 调研、115 DirectUrl 真实验证、Sol High 架构结论、V1 范围、风险和测试方案。
- `src/electronapp/www/modules/common/playback/playbackmanager.js`：getPlaybackInfo、createStreamInfo、setSrcIntoPlayer、onPlaybackStarted。
- `src/electronapp/www/modules/common/input/api.js`：WebSocket 消息分派。
- `docs/DEVELOPMENT_LOG.md` / `docs/evidence/first-round-followup.json`：本次执行记录与可携带证据摘要；first-round.json 保留初次结果。
- `docs/LIVE_ACCEPTANCE.md`：已脱敏的真实服务器验收、用户确认口径及范围限制；原始细节证据仅保留在本地忽略目录。
