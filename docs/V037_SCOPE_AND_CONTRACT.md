# v0.3.7 播放控制与连接生命周期合同

状态：`SCOPE_REVIEW_REQUIRED`。本轮只读盘点、隔离复现与文档已形成；生产代码、版本号和发行状态未变。此文件中的修正边界是待审核合同，不能作为自行解除核心冻结的依据。

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
