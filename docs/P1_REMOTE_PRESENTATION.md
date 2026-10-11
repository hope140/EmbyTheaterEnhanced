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
| D surface 存在但透明窗口暴露 | NOT_VERIFIED | 隐藏 surface 的源码路径确定；实际像素对照单独记录 |
| E 新视频已播放但恢复失败 | NOT_VERIFIED | 现场缺少客户端日志和画面采样，不能用 core-playing 推断 |

## 最小修复合同

统一 same-player Video replacement Stop 在物理 Stop 前创建并绑定 presentation intent，沿用原 retire -> prepare -> stopForPresentation -> beginGeneration(token) -> native arm/reveal。不同 player、Audio、自管理远端 player 和 terminal Stop 不通过此入口。

公开 Play admission 只接管已经存在的 presentation intent，不抓帧，不创建首次播放遮罩。这样 C 在 item/user/intro 等前置 await 时，B 的过期结束不会释放 C 需要的旧帧。真正的 native prepare 仍在 replacement Stop 边界。公开 Play 整轮和内部请求的完成均按捕获 options/request ID 清理；成功的 core-playing 已移交给 native，不取消原生首帧揭开。

prepared-but-unarmed 阶段增加独立 15 秒安全期限，避免 PlaybackInfo 永久挂起时旧帧无限保留；每个 token 的期限独立，测试注入时钟，期限不是切集等待。native arm 后仍使用既有原生 15 秒有界租期。terminal Stop、失败、最新请求结束和 superseded prepare 全部按归属清理，不改变 libmpv/native 协议或 Native Helper CPP。

保持本地 Next/Previous、Session/Item/MediaSource/PlaySessionId、进度、Seek/Pause、STRM/CD2/115 最终 source 和 retired-event 保护。没有升级依赖、改安装器或更改窗口透明/全屏机制。

## 确定性 RED / GREEN 与独立审查

原基线新增三项 RED：patched manager 窗口/全屏逻辑身份替换未调用 presentation hook；真实 libmpv adapter 缺少统一 hook。日志 `.work/p1-red.log`。两个逻辑播放器身份互相独立，控制异步通过 deferred Promise，未用固定 sleep 排竞态。

独立审查发现最初修复的 B/C 前置异步缺口：B prepared/Stop，C 已 admission 但 currentUser pending，B metadata stale 完成释放旧帧。新增 `.work/p1-review-red.log` 确认 RED 后补 admission 接管；独立复核通过 C user/ids 查询失败、pending 中 terminal Stop、local Next 与 remote PlayNow 交错。

当前针对 manager/native adapter/transition 的 GREEN 为 83/83，日志 `.work/p1-complete-green.log`。包含快速 B/C、metadata success/failure 迟到、当前失败、加载期间 Stop、明确 Stop→Play、成功清理、本地 Next/Previous 以及独立时钟的 deadline/late prepare。完整回归、构建和视觉采样结果在完成后回填；合成状态断言不作为真实视觉 PASS。

## 隔离视觉复核与交付

`tools/compare-transition.ps1 -RemoteCommand PlayNow|NextTrack` 注入冻结 ApiClient message receiver，先验证 A 像素，再采样 A→B、B→A；不登录服务器。Local 模式保持原 Next/Previous。采样保存视频 ROI 色类/哈希和 surface 时间线，不保存私人桌面整屏。

当前候选构建、窗口/全屏像素结果及交付哈希待本轮后续回填。真实 Together 主控/被控联测尚未执行；sourceCommit、真实媒体、硬件解码/HDR/多显示器仍需验收。PR #28、v0.3.0 安装器和暂缓的字幕/音轨性能专项保持独立。
