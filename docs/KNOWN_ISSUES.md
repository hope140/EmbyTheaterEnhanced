# Known Issues

## 2026-10-10 — 独立审核新增发现

- **P1 PLAY-01 / LOCAL_FIX_UNIT_VERIFIED / NOT_MERGED**：v0.2.7及当前main仍含Stop后旧换流响应重载问题。本地独立产品提交1a62f3d在manager捕获请求和换流owner，并同步终止Stop前意图；原RED已复现，定向46/46、全量681/681、独立复核通过。缺陷在本地确定性范围关闭，发布阻断需待批准整合和候选验收后解除。真实服务未执行；隔离runtime证据单列，不扩大为真实画面或报告送达验收。见 [修复报告](PLAY01_STOP_BOUNDARY.md)；[原审核](INDEPENDENT_REVIEW_028.md)保留。
- **SEC01 / SEC02 / LIFE01 / LIFE02**：外链协议、IPC主frame/文档、异常资源清理及terminal-owned退出等待已有独立本地修复，当前仅STATIC/UNIT层通过，尚未进入main或安装包。SEC02宽preload/CSP/CORS/isolation迁移仍待设计；默认controller.kill拒绝可达性UNKNOWN。详见 [交付报告](REVIEW_028_DELIVERY.md)。

本轮没有新P0结论；以下历史观察与已修结果保留原身份。

2026-10-10当前入口：v0.2.7已发布，完整维护已随PR #21合入main，见 [发布记录](RELEASE_027.md)。grpc/About维护已完成；旧直接app.exit根因UNKNOWN、全屏播放圆角DEFERRED、真实服务/可见呈现/安装/显示专项仍按原证据层级保留。后续按 [路线图](ROADMAP.md)推进，以下候选记录是历史证据，不能将旧“待执行”当作本轮尚未收尾。

2026-10-09发布更新：v0.2.6 / 355f4e6已作为Pre-release公开，631项全量、正常关闭与播放八组隔离结果、安装包身份与完整下载回读见 [发布记录](RELEASE_026.md)。正常产品关闭通过不消除早期候选直接app.exit的UNKNOWN；安装/实服/视觉验收边界保持。下方记录保留各候选的原始sourceCommit和失败/通过层级。

最终本地0.2.6/355f4e6安装包已交付。正常窗口关闭的重复destroy等待、renderer先行退出join与多实例拒绝早退已修复，631/631及最终8组隔离运行通过；本轮正常关闭项记 `FIXED / ISOLATED RUNTIME VERIFIED`。直接app.exit超时在8700039与旧d480eb8发生过，根因继续UNKNOWN，最终未复跑该路径；正常关闭通过不消除该观察项。系统安装、真实服务/远控、可见首帧/连续性、HDR/多屏仍未验收。见 [最终报告](LOCAL_PACKAGE_026.md)。下文保留前序证据与具体边界。

## 2026-10-09 — 正常关闭等待首次Native清理

- ac865c4三场景及五组完整pipeline通过，但静态/fake多实例拒绝检查发现Promise.all可能在一个pending失败时早退。最终改为current和pending一起allSettled，再按current优先/快照顺序传播原始错误，surface失败短路保持。35例前34/1、后35/35；最终source runtime待下方最终交付证据关闭正常路径项目，app.exit UNKNOWN继续分列。

- 7b3a2dc的真实playing关闭证明只共享service destroy仍不足：renderer endpoint先发起destroyClient并清空client，owned kill仍pending。单次caller观察为destroy-client；现新增pending client清理集合与destroy时快照等待。同一最终33例准确7b3a2dc对照31 PASS/2 FAIL，新源码33/33。最终新来源正常关闭/完整矩阵待实测后记录，不能把前述表面自然exit记为强化通过。

- 初版0.2.6/8700039的playing关闭：window closed在7109ms进入native-client-shutdown，before-quit重复destroy在7134ms完成返回，will-quit/quit先于native completion；OS exit0和残留0仍不代表清理已被等待。强化验收FAIL保留。
- 最小修复让destroy同步拒绝新请求，并向所有调用者返回同一个完整Promise，原失败短路保留。同一31例修改前28/3、修改后31/31。最终新来源runtime尚需三场景关闭和完整五组pipeline复验，见 [本地包记录](LOCAL_PACKAGE_026.md)。
- app.exit停滞也在初版0.2.6/8700039 hit0复现：12193ms落盘、12209ms返回app.exit，OS到120s未退出；精确归属强清理后0残留。此问题与已证实正常关闭的重复destroy竞态是两项证据，根因仍UNKNOWN，不宣称此局部修复解决app.exit。

0.2.6本地可安装候选从99cb850继续，产品播放实现保持68eb024。新增正常窗口关闭预检在idle/playing/stopped均自然退出、零残留；最终新来源runtime还将验证window-all-closed及实际native child退出。该证据不关闭下方历史app.exit异常，详情见 [本地包记录](LOCAL_PACKAGE_026.md)。

2026-10-09 当前本地候选为0.2.5/68eb024，继承d480eb8的请求快照/pending报告修复，并补齐Stop收尾归属。全量608/608，新五组隐藏runtime完整PASS；旧d480eb8退出超时在本轮对照再次复现，根因UNKNOWN。详见 [Stop 与退出报告](STOP_OWNERSHIP_EXIT_EVIDENCE.md)。已发布3ab10c9和此前d480eb8的失败/通过样本各自保留，本地候选不改写已发布产物。

## 2026-10-09 — replacement Stop 并发归属

- 状态：`FIXED IN LOCAL CANDIDATE / SYNTHETIC AND ISOLATED RUNTIME VERIFIED`，sourceCommit=68eb024。
- 旧行为：A已Started时两个Next都选择B，两个Stop闭包捕获同一A；顺序完成重复Stopped，乱序完成可清空B。真实libmpv还有stopped-before-resolve事件窗口。乱序由受控fake复算，不声明真实用户必现。
- 新行为：同一旧stream的物理Stop排空前保持stopped解绑；captured stream领取一次收尾，新播放在旧物理操作之后进入。terminal、pending、旧metadata/错误及最新Native token回归均保持。最终同一测试修改前8/16、修改后16/16；新五组普通/STRM/队列各5对完整身份报告。真实服务器与可见呈现仍待各自验收。

## 2026-10-09 — 两项异步身份问题已在本地候选修复

- **P1，CONFIRMED_LOCAL_BEHAVIOR：旧PlaybackInfo可再次调用播放器。** 同一待切入B的playOptions被两次Next复用，第二请求原地覆盖ID，旧请求守卫误过；miss场景在第二Next完成后释放旧响应，观察到额外embedded.play和重复Playing报告。这是共同PlaybackInfo阶段问题，不限于CD2 miss；hit/direct在更后面的CD2门槛通过不能排除它。
- **P1，CONFIRMED_LOCAL_BEHAVIOR：pending Stop报告缺少身份。** B尚未Playing即被替换时，Stopped中PlaySessionId=null且MediaSourceId缺失；新矩阵五轮和旧成功样本均存在。真实Emby处理及会话影响仍NOT_VERIFIED，不视为已接受的无害行为。
- 状态：`FIXED IN LOCAL CANDIDATE / SYNTHETIC PLAYBACK VERIFIED`，sourceCommit=d480eb8。每次请求的独立快照修复迟到PlaybackInfo及旧错误，显式pending状态只抑制临时报告，真实Started/Stopped保持完整配对。修改前回归5项失败、修改后7/7通过；新候选五种场景均无pending/重复/未配对报告。真实Emby处理与影响保持NOT_VERIFIED。

## 2026-10-09 — 隐藏hit0成功落盘后进程退出超时

- 状态：`OBSERVED / ROOT CAUSE UNKNOWN`。
- 产品：0.2.5/d480eb8；首轮hit0在11.924s记录完整smoke PASS，所有播放、Session和generation断言通过，但Electron根PID在120秒仍存活。runner按原边界强制清理，整体FAIL；零残留只代表清理结果。
- 现有日志不能归因Native Helper、renderer、缓存或并行验证；未改产品退出流程或runner门槛。同参数仅做一次无其它验证并行的独立复验，结果在 [修复记录](PLAYBACK_REQUEST_SESSION_FIX.md) 单独保留，首轮失败不覆盖。
- 独立复验为完整PASS：同一d480eb8与13个harness SHA，11.366s完成、自然exit0、timedOut=false、残留0。退出停滞未复现，继续观察，不能认定根因已解决。
- 后续本轮固定对照已再次复现：相同d480eb8、带14项哈希绑定的退出观察harness，11,698ms落盘，11,699ms请求app.exit，11,705ms记录Node exit/Electron quit，11,707ms返回；120s时OS根PID/StartTime仍匹配，强清理后0残留。故障边界为 `AFTER_APP_EXIT_RETURN / OS_EXIT_TIMEOUT`，不是已证实卡在产品before-quit链。正常pipeline fixture server和被绕过的产品native shutdown仅是静态候选，没有因果证据。
- 新68eb024五组均自然退出，仍不能由通过样本关闭根因。线程/完整进程树停滞快照为UNAVAILABLE；本轮到六次既定运行即停止，不追加跑绿。正常产品窗口关闭、实服与安装仍NOT_VERIFIED。


## 2026-10-09 — 设置页一致性修正通过用户验收

0.2.4/03a2e3b的三页左对齐、动态原生控件样式与重复标题修正，用户测试后明确反馈“可以了，我测过了”，记为 `USER ACCEPTANCE PASS / CLOSED WITH MONITORING`。本次只关闭此UI问题，未扩展到系统安装或其它专项；见[0.2.4验收记录](SETTINGS_UI_024_ACCEPTANCE.md)。

2026-10-08统一候选历史证据：`cc603ba`已补齐核心Settings、窗口、连续切集与Stop隔离回归；后续已由v0.2.4替代，其旧Release已删除，原tag与证据保留。全屏跨编码Previous为73帧/max107ms，所采无黑/紫/mixed但仍INCONCLUSIVE；窗口跨编码两向通过。旧rapid NextTrack夹具selected=false已与`1e86e51`同条件匹配，未修改断言。证据和专项未覆盖范围见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

本页记录尚需诊断的问题与观察项。`OBSERVED` 表示已见现象，`SUSPECTED` 表示待验证解释，只有证据闭合后才使用 `CONFIRMED`。开发优先级见 [Development Roadmap](ROADMAP.md)。

## 2026-10-08 当前候选验收

### 全屏顶部细条

- 状态：`HUMAN-ASSISTED VISUAL PASS / USER_REPORTED_RESOLVED`。
- 用户在本会话候选交付后手动验证并明确反馈“现在没有那个条了”；对应本会话交付候选为 `1e86e51`，入口 `dist/fullscreen-state-final/Emby.Theater.exe`。
- 本机合成对照中，video carrier原生窗口框产生顶部两行灰色像素；carrier配置调整后恢复为视频色，renderer对应像素不变。用户视觉反馈与该证据分别保留。
- 范围：顶部细条已在本次用户所测场景消失；全屏窗口交互、最小化恢复、播放中进出全屏和最终切集/Stop仍按各自证据记录，见 [验收记录](FULLSCREEN_WINDOW_STATE.md)。

### 全屏缩放后状态脱节

- 状态：`FIXED IN LOCAL CANDIDATE / UNIFIED SYNTHETIC INTERACTION VERIFIED`。
- 旧候选实测拖动后bounds由2560x1440变为y=170、2560x1270，只出现resize/move，renderer仍为Fullscreen。
- `1e86e51` 增加全屏交互锁、原窗口状态恢复与几何失配退出；11项窗口状态回归通过。早期最终复测曾中断，后续统一候选已补齐边缘拖动、恢复尺寸、普通缩放、重复全屏、最小化恢复、关闭保存与播放切换，见[统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

## Observe

### NextTrack 切集时视频区域瞬时白屏

- 状态：`USER_REPORTED_RESOLVED / MONITORING`。2026-10-08用户已反馈当前还原候选上一集/下一集问题基本解决；以下白屏描述为历史现象。
- 复现：播放过程中点击下一集。
- `OBSERVED`：视频区域变为全白，Emby UI / OSD 仍存在；等待后下一集自行正常播放，无需重试。
- 用户影响：切集过渡有明显视觉缺陷，播放可自动恢复。
- 当前证据：用户的真实播放观察；尚未定位暴露白色背景的具体 window / surface。
- 下一步：保持已验证呈现实现并观察；出现新的具体样本时再定位。全屏窗口修复未改变该实现。
- 区别：不是 Seek 或 Stop / Exit 的 transient black frame，也不是 rapid NextTrack `selected=false` 的既有夹具限制。

## Deferred

### 播放开始后 Fullscreen 圆角出现

- 状态：`REPRODUCIBLE / DEFERRED`。
- 复现：未播放时在 windowed 与 fullscreen 间切换，再开始播放并观察 fullscreen 窗口边角。
- `OBSERVED`：未播放时 windowed 有圆角、fullscreen 为直角；开始播放后 fullscreen 错误出现圆角。
- 用户影响：fullscreen 视觉状态不一致；当前没有播放中断证据。
- `SUSPECTED`：playback surface 的 top-level window 与 mainWindow fullscreen 状态的 DWM corner 同步可能不一致；根因尚未证实。
- 下一步：分别识别 mainWindow 与播放面的窗口、状态和 DWM corner policy；目标为 windowed 圆角、fullscreen 直角，播放面跟随 mainWindow。
- 区别：这是播放开始后的圆角状态问题，不等同于 `v0.2.2` 已修复的视频冻结。

## Observe

### Seek transient black frame

- 状态：`OBSERVE`；旧版本有观察，近期 `v0.2.2` 用户前台验收未稳定复现。
- 用户影响：若再现，会造成 Seek 时短暂黑帧；目前无法确认当前版本频率。
- 下一步：出现新样本时记录版本、媒体、操作时序和播放面证据，再判断是否进入修复。
- 区别：画面为黑色，发生在 Seek；与 NextTrack 白屏分开记录。

### Stop / Exit transient black frame

- 状态：`OBSERVE`；旧版本有观察，近期 `v0.2.2` 用户前台验收未稳定复现。
- 用户影响：若再现，会造成 Stop 或退出时短暂黑帧；目前无法确认当前版本频率。
- 下一步：有新样本时区分 Stop 与正常 Exit，记录窗口和播放面时序。
- 区别：发生在 Stop / Exit，不是切集后自动恢复的白屏。

### rapid NextTrack `selected=false`

- 状态：`HISTORICAL FIXTURE RESULT / SUPERSEDED BY EXPLICIT GATES`。
- 旧Electron18/current对照的selected=false保留为历史证据；后续固定pending/cancel/metadata门槛已检出并修复真实的共享options与pending报告问题，本轮又修复更早的Stop并发窗口。不能继续把当前rapidNext整体归为已接受夹具限制。
- 新68eb024五组的overlap、迟到metadata、双Next最终B及顺序C均通过。真实用户白屏与可见连续性仍由独立呈现验收判断。

### transport `stdout-end` stress

- 状态：`HARNESS / ENVIRONMENT GAP`。
- `OBSERVED`：同一 stress 在 Electron 18、旧 Electron 44 candidate 和 `v0.2.2` candidate 均复现。
- 用户影响：限制该 stress gate 的解释力；现有证据不能把它归为当前 source 回归。
- 下一步：需要独立、可复核的差异证据后再调查；不要仅为使夹具变绿改写 Native Helper。
- 区别：transport stress 与用户可见白屏或黑帧没有已证实的因果关系。

### Renderer `ReferenceError`

- 状态：`OBSERVE / NON-BLOCKING FOLLOW-UP`。
- `OBSERVED`：历史 focused real run 记录到 renderer `ReferenceError` event；未伴随 unhandled rejection、bridge / helper / Electron crash 或播放副作用，message / stack 缺失。
- 用户影响：现有证据未显示直接播放影响；缺少定位信息。
- 当前工程：P1 本地候选已增加有限错误类别和包内调用位置 observer，详见[诊断 contract](P1_DIAGNOSTICS_CONTRACT.md)。下一步在新样本出现时按脱敏位置定位；任意消息和原始 stack 不保存。
- 区别：不将无堆栈事件直接归因于 NextTrack 白屏。

### Concurrent Remote NextTrack

- 状态：`OBSERVE / OUTSIDE ESTABLISHED CLIENT CONTRACT`。
- `OBSERVED`：历史 focused real run 中，立即并发的两个远程命令 HTTP fulfilled，但对应 WebSocket `NextTrack` delivery 为 `0/2`；普通单次远程 NextTrack 通过。
- 用户影响：并发远程命令语义尚未建立；当前没有客户端播放缺陷的直接证据。
- 下一步：若产品需要该并发语义，先取得服务器到 WebSocket 的端到端证据。
- 区别：与本页点击下一集时出现的白屏分别追踪。

### Ordinary real media coverage

- 状态：`N/A — ENVIRONMENTALLY UNAVAILABLE`；当前真实媒体库未提供普通文件样本。
- 用户影响：无法用该环境为 ordinary real media 单独取得实服验收证据。
- 当前证据：formal ordinary pipeline 与真实 STRM 生命周期已有各自记录，不能互相替代。
- 下一步：出现合适的普通文件样本时单独验收并更新 [测试记录](TESTING.md)。
- 区别：这是样本覆盖缺口，不是已确认的 ordinary playback 故障。

## Evidence-gated

### CD2 Path Hydration

- 状态：`EVIDENCE-GATED / DEFERRED`；等待真实 `FindFileByPath=not_found` 样本。
- 可复现性：当前发布基线没有足以确认该场景的真实样本与前后对照。
- 用户影响：若确认为目录尚未物化导致的 false negative，可能让可用 CD2 源暂时走既有 Mount / Native fallback；发生率未知。
- 当前证据：历史研究提出目录可见性假设，但不能据此确认当前故障。
- 下一步：先采集真实目标路径的脱敏、有限时序和人工浏览前后对照，再决定是否设计有界恢复。
- 区别：`not_found` 可见性问题不能与 timeout、transport、鉴权、DirectUrl、libmpv 或 Session 故障混同。
