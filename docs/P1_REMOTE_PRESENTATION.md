# P1 同步播放被控端切集呈现

## 当前范围与身份

2026-10-11，独立分支 `codex/p1-remote-presentation-20261011`，基线 `6eb11b9350889bc4152c22c68bf7e204f3c1bce5`。用户确认被控端为 0.2.9；其现场 sourceCommit 尚未读取。发布的 0.2.9 产品来源为 `084554e07782ca6461b7ed67cadd298a92450b24`，本轮也用该现存隔离 runtime 作对照。

NAS 仅执行只读检查。加载日志记录 Together 1.6.0.5（2026-10-08 23:06:10）；当前 DLL 为 1,139,200 bytes，SHA256 `513dda4032d3c06c1d66091610e83e5569fcc810c2982abb05aed2adcb36d535`，与本机 handoff diagnostics assembly 精确一致，本机 assembly version 为 1.6.0.5。没有重启、上传或变更服务器。

2026-10-11 22:44:50.798 的脱敏 handoff 记录包含一次 `dispatch`、`dispatch_result=returned`，22:45:01.282 为 `failed`。这些字段证明服务器本地发送调用与后续确认失败，不能证明客户端是否收包、是否显示视频，也不能单独确定该条就是透明画面反馈的那次操作。

## 精确消息路径

同步插件的 `SessionBridge.SendPlayItemAsync` 经 `ISessionManager.SendPlayCommand` 发送单个 ItemId 和 `PlayCommand.PlayNow`。其调用者为 `SyncEngine -> SessionBridgeCommandIssuer -> SessionBridge`；诊断候选不改变该发送语义。插件没有调用 NextTrack/PlayNext，`SendStopAsync` 仅有定义，没有调用；PlaybackStopped 回调只请求立即 poll。

冻结前端 `modules/emby-apiclient/apiclient.js` 接收 WebSocket JSON，再触发 ApiClient `message`，`modules/common/input/api.js` 分流如下。

| 输入 | 调用 | 本专项意义 |
|---|---|---|
| 本地 Next/Previous | PlaybackManager.nextTrack/previousTrack -> playInternal | 已有 nexttrack-transition 包装层 |
| Playstate NextTrack/PreviousTrack | InputManager next/previous -> 同上 | 原持帧入口已覆盖 |
| Play PlayNow | PlaybackManager.play(ids) -> item/user/intro -> playInternal | Together 的实际入口，原先漏覆盖 |
| Play PlayNext | PlaybackManager.queueNext | 排队，不立即替换当前媒体 |
| Playstate Stop -> Play | PlaybackManager.stop -> 新 PlaybackManager.play | terminal Stop 必须清理旧帧，不能推断未来 Play |
| 直接替换队列/媒体 | playInternal -> same-player replacement Stop | 由统一替换边界覆盖 |

原缺陷路径为 `PlayNow -> stopForEnhancedReplacement -> libmpv.stop(false) -> invalidate/retire -> 无 active presentation -> 普通 stop -> service surfaceWanted=false -> surface hide`，随后才获取 B PlaybackInfo 和执行 B generation/load。独立 main video carrier 被隐藏，透明 Electron 视频区域因而存在露出背景的窗口。它不同于本地 NextTrack 已创建 token 的路径。

## 假设判定

| 假设 | 结论 | 证据边界 |
|---|---|---|
| A 远控切集绕过 nextTrack 包装 | CONFIRMED | 已部署 DLL 与本机源码对应 PlayNow，冻结 receiver 调用 play |
| B 旧 generation 退休但未准备 hold | CONFIRMED | 原路径进入普通 Stop；真实适配层与 patched manager RED |
| C 插件先发 terminal Stop | REJECTED | 对当前插件 handoff 路径拒绝；独立 Stop→Play 仍作回归 |
| D surface仍正常显示但透明窗口独立暴露 | REJECTED（受控复现） | carrier被Stop隐藏；现场其它D类故障仍NOT_VERIFIED |
| E 新视频已播放但恢复失败 | REJECTED（受控复现） | 新视频实际像素正常出现；现场其它E类故障仍NOT_VERIFIED |

## 最小修复合同

统一 same-player Video replacement Stop 在物理 Stop 前创建并绑定 presentation intent，沿用原 retire -> prepare -> stopForPresentation -> beginGeneration(token) -> native arm/reveal。不同 player、Audio、自管理远端 player 和 terminal Stop 不通过此入口。

公开 Play admission 只接管已经存在的 presentation intent，不抓帧，不创建首次播放遮罩。这样 C 在 item/user/intro 等前置 await 时，B 的过期结束不会释放 C 需要的旧帧。真正的 native prepare 仍在 replacement Stop 边界。公开 Play 整轮和内部请求的完成均按捕获 options/request ID 清理；成功的 core-playing 已移交给 native，不取消原生首帧揭开。

prepared-but-unarmed 阶段增加独立 15 秒安全期限，避免 PlaybackInfo 永久挂起时旧帧无限保留；每个 token 的期限独立，测试注入时钟，期限不是切集等待。native arm 后仍使用既有原生 15 秒有界租期。terminal Stop、失败、最新请求结束和 superseded prepare 全部按归属清理，不改变 libmpv/native 协议或 Native Helper CPP。

保持本地 Next/Previous、Session/Item/MediaSource/PlaySessionId、进度、Seek/Pause、STRM/CD2/115 最终 source 和 retired-event 保护。没有升级依赖、改安装器或更改窗口透明/全屏机制。

## 确定性 RED / GREEN 与独立审查

原基线新增三项 RED：patched manager 窗口/全屏逻辑身份替换未调用 presentation hook；真实 libmpv adapter 缺少统一 hook。日志 `.work/p1-red.log`。两个逻辑播放器身份互相独立，控制异步通过 deferred Promise，未用固定 sleep 排竞态。

独立审查发现最初修复的 B/C 前置异步缺口：B prepared/Stop，C 已 admission 但 currentUser pending，B metadata stale 完成释放旧帧。新增 `.work/p1-review-red.log` 确认 RED 后补 admission 接管；独立复核通过 C user/ids 查询失败、pending 中 terminal Stop、local Next 与 remote PlayNow 交错。

针对 manager/native adapter/transition 的 GREEN 为 83/83，日志 `.work/p1-complete-green.log`。包含快速 B/C、metadata success/failure 迟到、当前失败、加载期间 Stop、明确 Stop→Play、成功清理、本地 Next/Previous 以及独立时钟的 deadline/late prepare。独立复核已关闭 B/C 前置等待缺口，未发现剩余明确问题。

完整回归最终 `777/777`，fail/cancel/skip/todo 均 0，日志 `.work/p1-full-tests-concurrency2.log`。首轮 772/773 是新工作树缺少 ignored prepared preload；按工具生成后，默认并发轮次 776/777 的失败为测试临时仓库 Git 子进程退出 4294967295；独立 audit 20/20 与 concurrency=2 整轮通过，没有删改断言。最终纯 harness 调整后，相关 observer/pipeline 测试 50/50 与实际 DirectUrl runtime 通过；没有冒充最终 harness 重新跑过整轮 777 项。

固定产品提交 `31d11073fb33dad17bbaefec37f7260dafb8d50e` 正式构建、三层 provenance、锁定依赖及 `package.ps1 -VerifyOnly` 通过，payload 2138 文件 + manifest 自身。首次构建缺少工作树本地锁定编译器树，保留 partial，复制现存锁定输入并完整校验后在新输出名构建成功。Helper SHA256 仍为 `28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`；Electron 44.4.2、libmpv 和 Native CPP 字节未改。

真实隔离 runtime 的 fake DirectUrl pipeline 通过 ordinary/STRM、Pause/Seek/Resume/Stop、Session 与22条报告、serial/rapid Next、过期 metadata、精确取消和 User-Agent 隔离，证据 `.work/runtime-test-7eca474986c7442aaa4de3acfa99b32e`。fake 服务没有访问真实 Emby/CD2/115。

## 隔离视觉复核与交付

`tools/compare-transition.ps1 -RemoteCommand PlayNow|NextTrack` 注入冻结 ApiClient message receiver，先验证 A 像素，再采样 A→B、B→A；不登录服务器。Local 模式保持原 Next/Previous。采样保存视频 ROI 色类/哈希和 surface 时间线，不保存私人桌面整屏。

所有最终窗口对照使用同一 harness 字节、软件解码 Y4M A/B、独立 profile/appData/MPV_HOME 和同一视频 ROI。冻结 PlayNow 默认 fullscreen；窗口测试只在测试调用参数中固定 fullscreen=false，保持 ids、消息分流与替换链；全屏测试保持默认行为。这项测试 viewport policy 没有进入产品。初轮单元素 ItemId 数组未被 fake getItem 识别，另一次窗口被默认 fullscreen 切换、一次初始播放超时，均保留为 harness/observation 失败，不当作产品 RED 或视觉证据。

| 最终像素证据 | A→B / B→A 帧数 | 最大间隔 ms | 非旧/新视频样本 | 结论 |
|---|---|---|---|---|
| 发布 0.2.9 PlayNow 窗口对照 | 80 / 77 | 61 / 77 | mixed 15 / 13，白色 ROI；surface-hidden 2次 | 透明/背景空档路径复现 |
| 31d1107 PlayNow 窗口 | 72 / 72 | 59 / 61 | black/purple/blue/mixed 全0 | WINDOWED SYNTHETIC VISUAL PASS |
| 31d1107 Playstate Next/Previous 窗口 | 76 / 77 | 58 / 64 | 全0 | WINDOWED SYNTHETIC VISUAL PASS |
| 31d1107 本地 Next/Previous 窗口 | 76 / 76 | 59 / 58 | 全0 | LOCAL VISUAL REGRESSION PASS |
| 31d1107 PlayNow 全屏 | 46 / 49 | 454 / 367 | 所采全0 | INCONCLUSIVE；不能排除采样空档内短闪 |

目录依次为 `.work/transition-compare-p1-final-red-window-681808e333a44cec91d4fd684935ca77`、`p1-final-green-window-72343f8b2faa44c9b5e2a2b7ea87b082`、`p1-final-remote-next-7368be892d824ab399189c01e08884ba`、`p1-final-local-5ee40e1ea89a48f1a745f67a87475a69`、`p1-final-fullscreen-306e2992827b4fb2ba5cd8249ce3b97b`，后四项也位于 `.work/transition-compare-` 前缀下。各轮逻辑切换成功，owned 进程自然退出，residual=0、强制清理=0；窗口对照只保存实际 composited-screen-video-roi 色类与帧哈希。观察器的 OBSERVED_VIDEO_TRANSITION 仅表示看到了视频切换，不是无背景断言；本表另按真实非视频样本计数判定。全屏最大间隔继续使用100ms原门槛，未放宽。

因此 A/B 根因 CONFIRMED 的结论有调用图、确定性 RED 和窗口实际像素支持。D 的“surface仍正常显示但透明窗口独立失效”在该受控复现中 REJECTED：普通 Stop 使 carrier 隐藏，既有透明窗口因此暴露背景；E 在该复现中 REJECTED，新视频恢复正常。现场其他硬件/媒体环境的 D/E 仍 NOT_VERIFIED，不能用合成场景排除所有呈现故障。

交付 `dist/ETE-P1-remote-31d1107.zip`，240,357,378 bytes，SHA256 `2f42e830dc2a7b0978c16bea293e51a5232fb9951b07ef8fdff1809b0e743ef0`。只读逐项回读2142个文件（runtime2139 + README/隔离CMD/CJS三项）SHA均相符，`.work/p1-zip-readback.json`。独立交付审核另核对 sidecar、完整路径集合、产品三文件、argv/About与profile隔离静态链；没有启动交付启动器或完成登录验收。启动入口 `Start-Isolated.cmd` 直接运行包内 Electron，显式绑定包旁 profile/appdata、userdata、mpv，不导入现用客户端配置。

当前状态 `LOCAL CANDIDATE READY / WINDOWED SYNTHETIC VISUAL PASS / FULLSCREEN INCONCLUSIVE / REAL_PLUGIN_ACCEPTANCE_PENDING`。真实 Together 主控/被控联测尚未执行；现场 sourceCommit、真实媒体、硬件解码/HDR/多显示器与交付入口登录仍需验收。建议在正式版前完成真实用户验收。

本会话没有任何 push/PR/merge/发布/服务器写入/系统安装。收尾只读回查发现 PR #28 已由本会话以外的操作转为 MERGED，head `ab03cb2f833070e3d4ef1e6806ee86a85101467a`，远端 main 为 `a8ba606c0bb4d8c4540ff7f9ad17eccb3d35db50`；没有自动把本专项合入该新基线。v0.3.0 安装器和暂缓的字幕/音轨性能专项保持独立。
