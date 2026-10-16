# v0.3.7 播放控制与连接生命周期合同

当前阶段：A/B/C/D已完成经审核的局部实施，v0.3.7准确源码`1246da1023c43981c7ed40a4e556cb95c7eb7e02`的独立本地候选已完成。公开977/977、材料200/200、隐藏实际应用相关组件/原型18+17+18项及完整payload/ZIP回读通过。没有发布或执行真实媒体/服务器/系统验收。产物身份与人工清单见[本地候选](V037_LOCAL_CANDIDATE.md)；下方初始盘点、旧审核停点和草案保留其当时状态。

## 基线、任务分层与停点

2026-10-16 实时核对远端 main 为 `dd198ac037abd7658e78931dc52da285cf61d174`，本轮独立 managed 工作树及 `codex/v037-controls` 从该准确提交建立。v0.3.6 annotated Tag 解引用为 `de1a731aa3e915b00988134b6f5331bfc867a84a`；产品来源与后续文档 HEAD 分开。原 Settings、v0.3.5、v0.3.6 工作树、产物和 profile 保持。

Task Risk 中高；Task Uncertainty 中高；Cross-module Scope 为 OSD/input、ApiClient socket、main 电源资源及 PlaybackManager 的局部 observer；Playback/Session Impact 为潜在跨层归属风险，当前实际改动为 0。Model Tier 为 Tier 2；主线程保留异步与核心设计/审核，实际主线程型号未由工具暴露。两名 GPT-6 Luna High worker 只做限定只读证据收集和隔离验证，不修改产品或架构；Escalated: No。

第一停点为本合同供规划会话审核。审核后才实施获准的工作包及来源构建；不因主题覆盖六个方向而要求六个方向都改代码。本轮没有新产品 sourceCommit、候选构建、前台或服务器操作。缓存和切轨延迟不进入本批；显示硬件、安装及系统集成按 ROADMAP 后续范围处理。

## 真实来源和调用图

原始输入全部只读。读取的 Carnival / 综合补丁文件逐项 SHA-256 与当前 `vendor/runtime-manifest.json` 匹配。只在私有证据目录复制 PlaybackManager 文本并运行当前生成器，没有复制/修改完整 vendor、工具链或旧 runtime。

| 运行时模块 | 实际维护/生成来源 | 关键归属 |
| --- | --- | --- |
| `electronapp/main.js` | `src/electronapp/main.js` 的 Git blob | AppHost 四种音视频通知、电源锁与应用退出 |
| `electronapp/scripts/videohandler.js` | 同路径 `src/` 维护文件 | 监听原 PlaybackManager start/stop，发原 AppHost 通知 |
| `www/videoosd/videoosd.js` | 固定 Carnival 文件，目前没有本地 overlay | OSD、播放器事件、手势和倍率键盘挂接 |
| `www/videoosd/{playqueue,tvplayqueue}.js` | 固定 Carnival 文件 | 队列 UI，消费原 manager API/事件 |
| `www/modules/common/inputmanager.js` | 固定 Carnival 文件 | 统一命令派发，复用 Router/PlaybackManager |
| `www/modules/common/playback/playbackmanager.js` | Carnival + `tools/patch-playbackmanager.cjs` | Item/MediaSource/PlaySession、请求代次、队列及报告 |
| `www/modules/emby-apiclient/apiclient.js` | `vendor/patch/payload/client/apiclient.js` authoritative overlay | socket、重连、消息订阅与原报告入口 |
| `www/modules/emby-apiclient/connectionmanager.js` | 固定 Carnival 文件 | 原 ApiClient 实例、地址、登录与恢复 |
| `www/modules/{sessionplayer,common/methodtimer}.js` | 固定 Carnival 文件 | 远端状态观察者、SessionEvents 和轮询清理 |

```text
键盘/遥控 -> 原 InputManager / Router -> 原 PlaybackManager -> 原 Player
                                        | 队列 / Item / MediaSource / PlaySession
                                        | start / progress / stop -> 原 ApiClient
                                        +-> VideoOSD / PlayerStats / Queue UI
                                        +-> videohandler -> AppHost -> main powerSaveBlocker

ConnectionManager -> 原 ApiClient.ensureWebSocket -> 当前 socket
SessionPlayer -> 原 ApiClient SessionEvents + MethodTimer（最后观察者退出时清理）
```

main 的 `sendCommand`（约 661 行）仍进入原 `inputmanager.trigger`，没有第二条控制链。InputManager 的 back 交 Router，stop 有原 1 秒去重，next/previous 交 PlaybackManager。OSD 播放器事件的 bind/release、标准 resume/pause 输入挂接、PlayerStats disable/destroy、SessionPlayer 观察者计数和 MethodTimer destroy 均有现成清理。当前没有证据要求重写这些正常路径。

关键材料身份如下，完整读取清单和行号索引保存在私有证据中。

| 材料 | SHA-256 |
| --- | --- |
| Carnival VideoOSD | `86ab60c897e827b5152435350fe7b3801d8afd6b8889eef96e9996e71bb5eeab` |
| Carnival PlaybackManager | `8df9ea6f1be13f355925b2fd1b9bf7539c5a624d8731be484959a4ec861a1ebd` |
| authoritative ApiClient payload | `a4a901640abe6bc25188c1cf27fb53125b4f65ef2a797def033dc55165b080ae` |
| Carnival ConnectionManager | `beae6ad4a2d386fb6d3553974c0aa3ba7c7e1bc25c1098944f508fe497a08f09` |
| `src/electronapp/main.js` 当前字节 | `36cd259cc1d9fd3f28a84286350549d400e6bf2208415319a9fed8f15687df10` |
| `src/electronapp/scripts/videohandler.js` 当前字节 | `f4378c11ace4aa591fbf7feb77f0c5b1cc200584a76cb2f41d9974147a604342` |

## Observed / Expected / 复现证据

### A — OSD 倍率键盘监听和迟到回调

Observed：固定 `videoosd.js:1914-1962` 在构造时添加匿名 window keydown，每次接收按键再添加匿名 keyup。它先把 `self.i` 置 true，只有映射键 keyup 才复位。500ms timeout 没有视图归属检查，最终 `setPlaybackRate(rate)` 未传 player。原 `pause`（约 2574-2622 行）仅移除另一个 `boundWindowKeyDown`，不撤销此监听或其 timer。

复现：未修改的键盘注册片段与完整原 pause 函数在合成 DOM/events/timer 下执行。普通 ArrowRight 长按对 A 设置 2 倍正常；Escape down/up 后 ArrowRight down 不再排程（`self.i=true`）；三次映射 down/up 留下 3 个 keyup listener；ArrowRight down 后 pause 并切换合成全局 owner 为 B，原 timer 仍对 B 调用 2 倍，pause 后该匿名 keydown 仍在。证据为 `osd-keyboard-probe.cjs`、`osd-keyboard-results.json`。

Expected：保留原键表、500ms 长按阈值、倍率和正常 InputManager 路由。倍率 listener 由当前可用 OSD 拥有，非映射键不锁住状态，注册/清理成对；pause/destroy/player release 清理本 owner 的 timer，迟到回调不得作用于新 player。不得扩展到手势、字幕/音轨切换、队列语义或新快捷键产品设计。

最小候选差异：固定源 VideoOSD 窄变换，仅把该匿名键盘块改为可清理的具名处理器和单一 timer，并接现有 resume/pause/release/destroy；回调核对捕获 player 和视图归属，再显式传该 player。具体键释放与返回恢复 case 在实施前固化测试，不能以全局键盘重写替代。

### B — main 电源锁句柄丢失

Observed：`src/electronapp/main.js:96,362-379` 四种通知共享一个 `sleepLock`。重复 on 会再次 start 并覆盖旧 id；视频 on、音频 on 后 video off 会停止音频 id，视频 id 丢失。`before-quit`（约 1014 行）和 `onWindowClose` 没有此资源的显式收口。`scripts/videohandler.js:7-38` 只用 videoOn/audioOn 标记，start 没有防重复、stop 没有 item/session owner 比较。

复现：运行未修改 main AppHost 分派器、真实 `apphost-command` 和完整 videohandler，电源 API 为只记句柄的 fake。普通 video/audio 单次 start/stop 各剩 0；重复 video-on 后 off 剩 1 个 display lock；video-on/audio-on/video-off/audio-off 后仍剩 1 个 display lock；重复 renderer playbackstart 或先视频后音频再 stop 同样剩 1。证据为 `power-ownership-probe.cjs`、`power-ownership-results.json`。合成事件顺序不代表实际服务器一定发送该序列，真实发生频率为 UNKNOWN。

Expected：保持视频 prevent-display-sleep、音频 prevent-app-suspension 既有语义；每类通知幂等、有独立可回收 id，off 只释放所属资源，退出收口后不再接受新 on。不能由本修复修改 AppHost 协议/认证/sender 或系统电源配置。实际 OS 行为另行验收。

最小候选差异：先限 main 中独立资源 owner/helper 和退出清理，保留原命令与回调；是否还需 renderer start/stop owner 防护，须由真实事件状态及迟到 stop 复现确定。现有无 owner token 的四命令无法区分同类通知的任意重排；本合同不承诺仅靠幂等锁即可解决跨会话乱序，也不擅自扩展协议。若需要 videohandler 修改，先补确切 player/state/PlaySession 键与复现供审核。

### C — WebSocket 关闭意图与重连归属

Observed：实际 ApiClient payload 已有 OPEN/CONNECTING ensure guard、旧 close 不清新 socket 的 identity guard，以及 1/2/4 秒至 30 秒的指数退避。不要重新实现一套重连。问题边界在 `apiclient.js:603-615,637-706`：logout 先 close，待 REST logout 完成后才清 token；close 仅处理 OPEN。onclose 的 0ms 通知和重连 timer 不保存 handle，close 后仍依据当前 isLoggedIn 排程；open/error/message 无 socket owner 检查。ConnectionManager 保留/reuse 原 ApiClient 实例；成功连接与 app resume 仍走原 ensure。

Expected：保留原 ApiClient/ConnectionManager、连接地址、认证方法、message payload、SessionEvents 和重放机制；正常意外断线仍使用原退避。显式关闭/logout 后旧 timer 和旧 socket 不得复活或提交消息；当前有效 socket 的回调与订阅继续工作。logout 完成前和重新登录后的行为都要验证，不能只在清 token 后调用 ensure。

复现：加载完整、hash 匹配的实际 payload，在真实 ApiClient prototype 上使用合成实例字段和 socket/timer/REST promise。OPEN socket 执行 logout，触发其 close，再在 REST pending 时触发原 1000ms timer，得到第二个 CONNECTING socket；完成 REST 后 token=null、connected=true，新 socket 仍存活。worker 复现后主线程检查脚本并独立重跑，结果一致。证据为 `websocket-logout-vm.cjs`、`websocket-logout-results.json`。这证明该源码事件顺序可达，不代表真实服务器/浏览器已发生相同故障。

其它静态风险保持未动态验证：CLOSING 时 ensure 可创建新 socket；旧 close 虽不清新引用，仍可通知/排程；旧 message/open/error 可污染新连接。不能把这些推导写成真实远控故障。

最小候选差异：新增 tracked ApiClient 生命周期变换器，串接现有 authoritative overlay，对 callback/timer 持有限定 socket/close-intent owner；保留原退避及正常 ensure 入口。需要区分 logout/显式 close 与意外断线，并覆盖原 ConnectionManager 复用再登录。若必须改变认证语义、ConnectionManager/SessionPlayer 或消息订阅归属，返回审核，不自行扩范围。

供审核的精确方法边界如下；不改原 token/user 写入和 REST 协议，不需要第二个 ApiClient。已核对固定 Web/补丁输入中的 `closeWebSocket()` 调用只在 ApiClient 自身 logout 内，未发现其它产品调用者；这不等于公开方法可以任意改变语义。

| 方法 | 待审核局部差异 |
| --- | --- |
| `logout` | 进入时标记本次退出进行中并退休旧 socket/timer；原 REST 和 done 清认证顺序保持。done 后结束此标记，不能持久禁用同实例后续合法登录 |
| `ensureWebSocket` | 原 OPEN/CONNECTING guard 保留；退出进行中不得开新 socket；不通过修改 connected 的含义代替生命周期控制 |
| `openWebSocket` 的四个回调 | 捕获 socket/代次；message/open/error/close 在任何状态提交、通知、订阅重放之前检查仍属于当前 owner。意外 close 仅当前 owner 可排程原 backoff |
| `closeWebSocket` | 退休代次、清本人 timer、处理 OPEN/CONNECTING，并幂等释放所持引用；保护新 socket。显式关闭的通知次数和延迟以现有消费者合同为准，不能粗暴丢弃全部关闭事件 |
| reconnect / deferred-close timer | 保存单一所持 handle；合法 open、显式 close/logout 或替换时取消。触发时再次核对代次和退出状态；不得让已退役 timer 经同实例重登录作用新连接 |

不在本包改 `setAuthenticationInfo`、HTTP请求字段、ConnectionManager、SessionPlayer 或 PlaybackManager。实际实现若无法在此方法表内闭合，需返回审核。旧 socket 迟到 message/open/error 尚未单独动态复现，必须先补修前失败 case，不能仅加静态 if 就声称问题已覆盖。

### D — PlaybackManager 音量 OSD observer 跨 Stop 存活

Observed：当前生成 PlaybackManager 的 `onPlaybackRequested`（约 1540-1555 行，原材料同名函数）创建 body MutationObserver，仅找到 `.volumeOsd:not(.hide)` 才 disconnect，并再排程无 owner 的 50ms hide。该 observer 和 timer 是局部变量，原 stop/替换路径无法取得。此逻辑原已存在，本版尚未修改生成器。

复现：先以原函数片段确认 3 请求留下 3 observer；再用现有 `playbackmanager-request-session.test.cjs` AMD fixture 加 observer 计数，加载完整当前生成模块，经 3 次公开 Play → metadata → start → terminal Stop，observer 存活依次 1、2、3，而 start/stop report 各 3。DOM 永无可见音量 OSD 时即保持该状态。片段探针在之后出现音量 OSD 时还得到 3 个 50ms hide。证据为 `observer-ownership-*` 与 `observer-module-*`。

Expected：保留音量 OSD 既有短延迟隐藏行为；observer/timer 必须属于请求/player，在替换、失败、取消和 terminal Stop 清理，迟到 callback 不修改后续 owner。此项进入 PlaybackManager 核心，必须单独审核精确挂接点；不得顺便改 Session/队列、请求 admission、stop coordinator 或播放时序。

必须触及核心的理由：泄漏创建点在 PlaybackManager 私有闭包；只有 OSD 页面外部清理无法取消其未导出的局部 observer/timer。候选为当前 `tools/patch-playbackmanager.cjs` 内窄变换及对应核心 fixture；需在实施前补逐分支 diff 草案。直接删除旧隐藏行为涉及可见语义，当前未获接受。若审核决定暂缓 D，则保留 `OBSERVED / NOT_FIXED`，不能称所有监听清理问题已完成。

拟议挂接仅为 `onPlaybackRequested` 保存 observer/hide timer owner、当前 mutation 与50ms回调核对捕获 streamInfo/request、`onPlaybackStopped`/`stopForEnhancedReplacement`/terminal Stop/当前请求失败退休对应 owner。新请求 admission 和取消路径必须保证尚未 started 的请求也能清理，不能只在最终 stopped event 执行。既有 request sequence、stop coordinator、报告函数和 PlaySession 选择保持原样；精确逐分支清理补丁若需要触及额外核心函数，则先带对应失败 case 回到审核。

### 保留和观察项

队列 UI 两个模块在 custom element 未完成升级时每 100ms 重试 refresh；destroy 将 itemsContainer 置空，迟到回调可退出。活跃实例永不升级会持续轮询，但目前没有受支持启动顺序下的复现，保持 `STATIC_RISK / UNKNOWN`，不新增 queue 重写。正常 OSD player events、PlayerStats、SessionPlayer/MethodTimer 的已存在清理保留。本版不凭主题给正常功能增加需求。

## 允许文件与冻结边界

本停点实际只允许本合同、PROJECT_STATUS、DEVELOPMENT_LOG 和私有 `.work` 探针/证据/状态。以下为审核后可分别批准的候选文件，当前未实施：

| 工作包 | 产品/生成器候选 | 测试及必要来源接线 |
| --- | --- | --- |
| A | 新 `tools/patch-videoosd-lifecycle.cjs`；原 VideoOSD runtime 仅由变换生成 | 新 public/材料 selftest；现有 overlay/input/provenance fixture 接线 |
| B | `src/electronapp/main.js`；可选独立纯电源 owner helper | 新电源 API fake 生命周期测试、现有 AppHost 回归；renderer 修改另审 |
| C | 新 `tools/patch-apiclient-lifecycle.cjs`；现有 ApiClient overlay 生成关系 | 新隔离 socket/timer/REST fake selftest；既有材料和来源 fixture |
| D | `tools/patch-playbackmanager.cjs`，仅音量 observer 生命周期 | `tests/playbackmanager-request-session.test.cjs` 或独立同等 fixture |
| 共用 | `tools/prepare-web-overlays.cjs`、`tools/build-input-contract.cjs` | `tests/build-input-contract.test.cjs`、`tests/runtime-provenance.test.cjs`，以及实际受影响来源测试 |
| 后续候选身份 | `package.json` / `package-lock.json` 的版本字段及相关文档 | 只在实施获准、版本固定时变更；依赖不动 |

vendor、归档和既有 runtime 只读，绝不直接修改 ApiClient payload 或 VideoOSD 原材料。新增变换器必须进入 generatorPaths、INPUT_PATHS、防篡改测试集合及 provenance fixture。任何其它实际需要文件先给出准确原因及 diff，再由审核扩大。

冻结：Resolver/CD2/Mount/DirectUrl、Native Helper/libmpv/协议、认证/IPC 边界、窗口/显示、依赖和默认内核；原 Item.Path/MediaSource.Path 语义、Item/MediaSource/PlaySession 身份、单一 start/progress/stop、原 PlaybackManager 与 Session/远控 owner 不变。取消/退出后旧请求、socket、listener、timer 和 blocker 不得对新 owner 动作。不能新增播放或登录链。

## 逐项验收与回退

| 工作包 | 必须执行的针对性验收 |
| --- | --- |
| A | 映射/非映射键、短按/500ms 长按、自动重复、多个 keyup、拖动不触发；反复 resume/pause/destroy listener/timer 归零；A 按下后 pause/release/切 B，迟到 callback 调用数 0；原 back/stop/next 与焦点路由保持 |
| B | 普通音视频开始/停止、重复 on/off、交错 on/off、未 start 就 off、退出中 on、重复 shutdown；每类至多一个所持句柄、终态 0；不停止未知 id；真实退出及 OS 效果另列 |
| C | OPEN/CONNECTING/CLOSING/CLOSED、重复 ensure；异常 close 原退避/封顶/成功重置；logout pending/成功/失败、主动 close、重登录、旧 open/message/error/close、退役 timer 和订阅重放；当前 owner 事件恰一次，旧 owner 事件/复活 0；消息及报告身份保持 |
| D | 无音量 OSD 的重复 Play/Stop、替换/失败/取消、迟到 mutation/hide；旧 owner observer/timer 清零；现有 58 项请求/Session 回归继续通过，started session 每项 start/progress/stop 身份成对，未启动项无 stop report |
| 共用 | public 定向、材料 hash/锚点/拒绝错误输入、来源 fixture 与完整门禁；准确 sourceCommit 本地构建、VerifyOnly、独立 payload/provenance 核对；隐藏完整应用合成 API 的 input/queue/reconnect/exit 所有权验证；只重复受修改或新失败影响的检查 |

实施后分开记录静态/单元、完整模块合成、隐藏完整应用、用户视觉、真实播放远控、系统安装与硬件。前四项的合成结果不能代替真实设备/服务器 PASS。真实开始/进度/停止、切集/退出/重连和资源清理必须有各自证据；不能以机器未取得日志推断未发生。

回退以工作包独立本地提交或精确反向补丁完成，保护既有工作；保留每个新来源的独立产物和旧版本。A/C 回到原固定 overlay，B 回到该小范围 main/helper，D 回到原生成器；均不改用户数据/服务器/profile、不覆写旧 runtime。当前授权包含必要本地提交/构建与审核后修正，不包含 push、PR、merge、Tag/Release、安装或真实服务器业务写入。跨包依赖必须在提交说明注明，来源记录不得把文档 HEAD 冒充产品提交。

## 本轮验证与恢复入口

- 基线 PlaybackManager 请求/Session 定向回归 58/58，0 skipped；AppHost/外链定向 20/20，0 skipped。
- 7 个控制相关固定 JS 文件 `node --check` 通过；材料读取 SHA 与清单匹配。A/B/C/D 为上述隔离复现，尚未修正；C 主线程已复核实际脚本并重跑一致。
- observer 完整模块探针首轮 fixture 缺 `getCurrentUser`，次轮使用 background playback 导致 report 计数不符；均为夹具问题。按现有公开 Play fixture 补依赖并用正常 fullscreen 语义后得到 1/2/3 observer 和 3/3 reports。没有改产品或弱化断言；失败记录保留在私有目录。
- 未运行完整应用/Native、未建立新候选、未读取个人凭据、未访问真实服务器、未执行前台/安装/硬件验收。对应层为 `NOT_EXECUTED / UNKNOWN`。
- 私有 `.work/V037_TASK_STATE.json` 保存 source/HEAD、工作树、证据、待办与恢复入口。复现和 worker 清单位于 `.work/v037`；这些文件不进入产品或公开提交。路径参数和本机资料只保存在该私有状态。

下一步是父会话审核 A/B/C/D 的精确允许范围与核心触及条件；本轮在此停止，不向其它聊天发送消息，也不持续轮询。

## 父审核后的 A/B/C 实施与 D 停点

父会话审核文档提交 `9b8cbd3`，用固定材料独立复现四项结果，随后明确批准 A/B/C 的局部实施；D 仅允许测试和逐分支差异草案。初始停点因此只对 A/B/C 解除，D 保持核心审核。原实现和错误记录没有被覆盖。

A 使用 `tools/patch-videoosd-lifecycle.cjs` 变换固定 VideoOSD：原键表逐字保留，500ms 和倍率保持；具名 down/up 监听由现有 resume/pause/destroy 管理，releaseCurrentPlayer 仅退休本次按键 timer；回调核对视图/player，显式传捕获的 player。复核另外在隐藏完整应用复现同一个 Player 对象切集时，单靠对象相等仍会执行旧 timer；因此在原 OSD playbackstart/playbackstop 处理器内，限事件所属 player 仍是当前 player 时退休该 timer，原事件处理主体保持。B 新增独立电源 owner，main 四通知各自幂等释放所持句柄；before-quit 先置关闭状态并回收，再进入原 Native/kernel/startup drain。该异步窗口中的新 on 被忽略，协议、videohandler、sender、窗口语义保持。

C 仅变换 logout、ensureWebSocket、openWebSocket 四回调和 closeWebSocket：当前 socket 代次、可撤销 retry/deferred-close timer 与退出进行中计数约束迟到动作；显式 close 仍有一次所属通知，原 backoff/合法消息/订阅重放、REST 字段/done 清 token 和 connected 含义保持。同实例合法再登录可恢复，setAuthenticationInfo/ConnectionManager/SessionPlayer 未修改。来源记录同时核对 Carnival base、原始 payload input 和生成 output，inputSha256 不再从生成 output 借值；原 payload SHA 保持不变。

实际修改文件除上述 main、纯 helper、新变换器外，仅为必要 overlay/input/provenance 接线、针对性测试和本合同/状态记录。没有修改 PlaybackManager 生产生成器、Resolver/Native/认证/IPC/窗口/依赖或菜单。完整来源候选构建等待 D 审核，避免按未定核心反复构建。

本地提交分开保存：`a5e29a7` 为 B 电源归属；`5a6e886eb207358709dacc84e77317f624601a20` 为 A/C 与必要来源/测试接线，包含前者。D 证据和本轮状态文档是后续独立提交，不冒充新候选来源。该源码提交的51项 build-input Git blob 检查通过；source-contract/tamper 定向25/25、维护JS语法308项及有限凭据模式扫描359项通过。最后仅新增D材料自测，另行语法检查；没有运行系统软件安装。

当前针对性验证：A 摘录材料自测保留 20 键表和阈值，并覆盖同一 Player 的原 start/stop 处理器；隐藏完整应用加载原 VideoOsdView、完整 AMD 模块及原生 HTML 组件，以合成 player/rate sink 检查实际 resume/pause/release/destroy、DOM listener 安装/解除和同一 Player 连续停止/开始，最终18项通过，显示/网络/Native 子进程为0。此前同一 Player 的修前失败和17项历史结果分别保留。该 runtime 是从 v0.3.6 的2158个 manifest 文件核验复制后作4项明确替换的隔离夹具，不是 v0.3.7 来源候选，不声称其旧 provenance 仍验证新字节。

该完整应用夹具直接构造原 VideoOsdView 并调用其实际生命周期，用真实 Events 和 DOM 组件验证挂接；未驱动真实播放所创建的 Router/OSD 路径。C 只有完整模块 fake socket/REST 验证，B 电源由 fake API 验证；三者都没有真实服务器、OS电源、前台或设备验收。四次夹具所属根进程均已退出，Native子进程始终0。

B/C/public patcher 与既有 AppHost 最终定向共50/50通过；C 完整模块 fake socket/REST/timer 矩阵17/17（含四方法之外字节保持），修前13项中4通过/9失败。main 测试覆盖 before-quit 后 Native/kernel/startup 尚未 drain 时，通知回调完成、锁各回收一次且不再 start。六项 overlay/provenance 材料按最终A输出复验通过；首轮 SVG fixture 用 checkout 字节与 Git blob 比较因 CRLF 不符而失败，已改为实际提交 blob 复核，原有效断言和失败记录保留。本轮公开离线门禁975/975通过；该全量早于最后补齐同Player清理，最后局部差异已重跑相关定向、材料和完整组件场景，没有把早期全量记为新候选的来源绑定门禁。

### D 逐分支差异草案，尚未执行

新增 `tests/playbackmanager-observer-material-selftest.cjs`，材料必须存在且 size/SHA 与当前清单一致，缺失或变更明确失败。对未修改的生产生成器执行结果为 7 项中 1 通过、6 失败、0 skipped：同一有效 owner 可见 OSD 的 50ms 隐藏为正例；重复终止 Stop、无 started 的 pending load Stop、替换、load 失败、provisional 后 playback-info 失败及 A 的 timer 隐藏 B 复用节点为修前失败例。D 的失败仍是 `OBSERVED / NOT_FIXED`。

精确生成源码差异保存在私有 `.work/v037/d-observer-proposed.patch`，相邻 `d-observer-proposed.js` 只是生成源码审查草案，只有语法检查，未作为产品/生成器/完整应用输入执行。原生成器与 `9b8cbd3` 字节一致。草案不包含新报告、队列或 stop coordinator 实现。

拟议 resource owner 为原 manager 上单一私有对象 `{player, requestId, observer, timer}`。开始请求的 provisional streamInfo 和最终播放 streamInfo 是两个对象，因此不能用它们的对象相等作为开始后仍有效的判据；两者从 item.playOptions 继承同一个 `_etePlayRequestId`。草案使用捕获 player、原请求代次和 owner 对象三项核对。50ms timer 到期前再次检查，退休旧 owner 时只清相同对象，不能清掉新的 owner。

| 拟变更函数/位置（当前生成源码） | 精确拟议差异 | 原语义保持 |
| --- | --- | --- |
| 模块局部新增两函数 | `beginEnhancedVolumeOsd(manager, player, streamInfo)` 保存 observer/50ms timer；`retireEnhancedVolumeOsd(manager, requestId?, player?, expectedOwner?)` 只清匹配 owner | 不新增公开 API/事件、Session 或协议 |
| `onPlaybackRequested`，原约1540行 | 用 begin helper 替换原局部 MutationObserver 块 | provisional 标记、setCurrentPlayer 和 playerData.streamInfo 赋值不变 |
| `playInternal` 非 capturedRequestId 分支，原约865行 | 原代次加一之后只插入退休旧资源；捕获 id 的 admission 条件、赋值和返回保持 | Next/Previous 的原 admission 和异步顺序不改 |
| 公开 `play` 已有 admission，原约2299行 | 原代次加一后清资源，再按原代码给 options 赋 id | 不增加/跳过/重排播放请求；旧 A 仍可能播放，但其旧请求的 OSD 隐藏资源提前退休，不自动重建 |
| `PlaybackManager.prototype.stop`，原约2637行 | 原代次加一后、原 completion fence 之前清资源 | 同步 physical Stop、重复 fence、排空、报告与返回原样 |
| `setCurrentPlayerInternal`，原约402行 | 原 targetInfo 校验成功后，若 player 对象变化，仅清之前 player 的资源 | 原 begin/end updates、playerchange 与 target/Session 选择不变 |
| `onPlaybackStopped`，原约1639行 | 原 isChangingStream 与 duplicate-stop guard 内，在原 streamInfo 标记/清空前清匹配 request/player 的资源 | 不新增 stale-event 分类，不改变原 stop 事件是否被接受及报告身份 |
| `onPlaybackStoppedFromSelfManagingPlayer`，原约1602行 | 函数起始清匹配 player 的资源 | 原状态、itemstopped、destroy 和事件保持；此分支尚缺动态 fixture |
| `playInternal.catch`，原约924行 | 原 current-request guard 后，清失败请求 id 的资源，再调用原失败处理 | 原错误/取消/alert、rejection 和 fallback 不变 |
| `playAfterBitrateDetect` 的初始 `player.play` rejection，原约1323行 | 原 stale/superseded return 分支只增加按捕获 request id 退休资源 | 原 predicate/return 不变；不触碰 changeStream 的性能或700ms逻辑 |

完整 diff 的回退单位仍是未来一个独立的 `patch-playbackmanager.cjs` 小范围变更。本阶段没有把草案写入该生成器。

| 分支 | owner 生存期与清理点 | 当前证据/缺口 |
| --- | --- | --- |
| 尚未到 onPlaybackRequested 的 user/intro/device-profile 等等待 | 没有本次 observer；已有新 admission 只退休之前请求资源 | 现有请求代次门禁保留；preplay interceptor 不能由当前闭包 fixture 注入，`NOT_EXERCISED` |
| provisional 已创建、player.play 未 started，随后 Stop | Stop 清 manager 当前资源；晚回复仍走原代次 guard | 修前失败 case，无 started 不报告 stop 的原回归保留 |
| started 后 terminal Stop | Stop 即清，不等停止事件；后续 accepted stopped 清理幂等 | 修前循环存活1/2/3，start/stop各3；草案未执行 |
| A→B 替换 | 新 admission 先清 A；B onRequested 创建新 owner；旧 A 回调因对象/代次不符不能清 B | 修前 B 开始后两个 observer；草案保持 stop coordinator 函数体原样 |
| provisional 后 playback-info 或 load 失败 | 当前请求 catch/accepted stopped/superseded return 按 id 清资源 | 两类修前失败已分开；旧请求 rejection 不得清新 B |
| active 同一 owner 看见 volume OSD | disconnect observer，保留唯一50ms timer，仍按原时间隐藏 | 现有正例通过，草案不得删除此行为 |
| mutation/timer 已排队后退休或共享节点转属 B | observer 回调和50ms回调先核对 owner；清资源函数按 expectedOwner 对象匹配 | 修前同节点复用隐藏失败；草案批准后须补手工触发已取消回调、旧mutation不清新owner |
| 选择远端/移除当前 player、自管理 player 停止 | 拟接现有 setCurrentPlayerInternal 与 self-managed stopped 清理 | 需要新增动态 case；不把普通本地 fixture 扩写为这些分支 PASS |

审核重点是上述私有 resource 挂接是否允许，以及 admission 时提前退休 A 的隐藏资源是否符合已有可见行为约束。若批准 D，先把缺少的切 owner、自管理、取消及双重迟到 callback case 补齐为修前失败，再把这份精确差异转换为固定源变换；不先改 request/Session 架构。当前未执行草案测试，不承诺这份草案已修复全部路径。

### 独立菜单待办

用户已确认后续仅调整 Emby Theater Enhanced 一栏的顺序为：操作快捷键 → HDMI-CEC → 视频设置 → 音频设置 → STRM智能解析 → 诊断与日志 → 关于Enhanced。版本未指定，其它栏、分类、路由与功能保持。本轮仅记录，不修改菜单，也不自动并入 v0.3.7。

## D 条件审核后的实施闭合

父会话执行原草案和现有58+7材料用例，定位当前有效 initial player.play rejection 仍可能走原 onPlaybackStarted/onPlaybackError 而未进入外层 catch，原草案64/65。父审副本在原错误主体之前增加本 request 资源退休，并对排队 mutation 增加 timer/observer guard、disconnect 后置 observer=null，原65项通过。父会话随后明确允许在补齐分支测试后落实到原生成器并继续本地合批候选。

扩展后 observer 材料19项：原生产输出5通过/14修前失败；父审副本18通过/1失败。最后一项证明，同一 self-managed Player 的旧A itemstopped 仅凭player会退休新B资源。实际公开Play→player.play({items})保留不同 canonical Item 和原 request marker，A=1/B=2。最终 owner 额外捕获既有 Item 引用；self-managed stop 优先按事件 Item 中原 request id 清理，未携带 marker 时只匹配原 canonical Item 对象，不用 player 或相同Id猜归属。无 marker 的旧A clone 不退休B。同 owner 非终止 stop 和 exact Item 无 marker fallback 为正例，保留原状态/事件处理主体。

父审项、正常50ms隐藏、四种 pre-observer 等待/取消正例、player选择/移除、旧mutation/已取消50ms callback、重复排队mutation均已覆盖。原58请求/Session在旧、父审和最终三个输出下全部通过；主线程独立执行审查输出及实际生产生成器，均为77/77、0 skipped。生产输出与最终审查副本逐字节SHA一致；没有把私有bridge当生产生成器。原stop coordinator、报告函数、queue、admission条件/原代次增量及错误返回顺序保持，新增语句只退休OSD资源。

既有 self-managed stopped 会清 player.streamInfo，包括合成迟到A事件；本轮没有改变该核心事件接受/状态语义，测试明确保留这一边界。无法关联的Item clone不凭猜测清资源，不引入新事件字段或协议。所有结果仍为完整模块合成API/player/DOM层，未补写真正服务器/播放远控PASS。

B普通 start/isStarted/stop API异常仍可在原AppHost完成callback之前向上传播，与旧main路径一致；本轮不改变协议或吞掉该异常，也不承诺这类OS失败已优雅恢复。shutdown保持现有窄catch/日志，并尝试释放两类所持资源。

下一步固定0.3.7版本/准确sourceCommit，执行最终公开与材料门禁、来源构建、独立payload/provenance核对、隐藏实际应用相关原型/Events/组件验证以及独立本地交付。未授权远端发布、真实服务器写入、前台、系统安装或硬件验收仍不执行。
