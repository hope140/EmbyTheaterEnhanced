# 第一轮真实运行验收

## 2026-09-17 — Final Phase 2 acceptance classification

当前正式 gate 由已完成的 REAL Emby evidence 重新计算：

```text
Formal ordinary = PASS
REAL ordinary media = N/A — ENVIRONMENTALLY UNAVAILABLE
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

最终状态：

```text
REAL EMBY CLIENT ACCEPTANCE = PASS
NATIVE HELPER PRODUCTION ACCEPTANCE = COMPLETE
PEPPER RETIREMENT = AUTHORIZED
```

本轮只记录 authorization，不实际开始 Pepper retirement。

### Concurrent duplicate Remote NextTrack

当前不把 A→B→C 的立即并发远控语义作为客户端 production contract。两个 focused run 均记录：

```text
HTTP NextTrack #1 = fulfilled
HTTP NextTrack #2 = fulfilled
WebSocket NextTrack delivery = 0/2
ApiClient NextTrack = 0
InputManager next = 0
PlaybackManager.nextTrack() = 0
```

因此两个命令没有到达客户端播放链；A 保持 current，B/C 没有被选中或开始播放。准确 gate 为：

```text
CONCURRENT REMOTE NEXTTRACK = NON-BLOCKING / OUTSIDE ESTABLISHED CLIENT CONTRACT
classification = SERVER_REMOTE_COMMAND_SEMANTICS
```

该分类只定位到 WebSocket 交付之前，不推断服务器内部一定是 coalesce、discard 或其他具体实现。普通单次 Remote NextTrack 的 A→B 已独立验证通过。

### ReferenceError follow-up

两个 focused run 各记录 `2` 个 renderer `ReferenceError` events。当前没有 message/stack；同时没有 unhandled rejection、`bridge_error`、helper crash、Electron crash 或观察到的播放副作用。因此记录为：

```text
REFERENCEERROR = NON-BLOCKING FOLLOW-UP
```

本轮不诊断、不修复。

脱敏 evidence：`.work/fast-next-fallback-529315abd95c4d02abca7c7e38274401/run1/output/diagnosis.json`、`run2/output/diagnosis.json`。

## 2026-09-17 — LibraryOptions-aware Resume and fastNext result

### Resume policy

匹配 virtual folder 的只读 `LibraryOptions` 可见，结果为：

```text
MinResumePct = 3
MaxResumePct = 90
MinResumeDurationSeconds = 120
```

当前 item：

```text
RunTimeTicks = 56915310000
duration = 5691.531 seconds
```

原始 Stop：

```text
PositionTicks = 302390000
playedPct = 0.531298%
eligibility = NOT_ELIGIBLE
reason = below MinResumePct
```

### Non-zero start / Resume

按 policy 选择 `5%` target：

```text
targetTicks = 2845765500
actual Remote Seek = 2840000000
```

Remote Seek、local/server position 和新 Progress report 全部通过。Stop 后 metadata polling 第一轮返回：

```text
server saved PlaybackPositionTicks = 2840000000
PlayedPercentage = 4.989870%
Played = false
Unplayed = true
LastPlayedDate = valid/present
```

second Play 通过 PlaybackManager/application contract：

```text
currentPlayer = libmpvmediaplayer
core-playing = PASS
Session NowPlaying = PASS
Playing report = accepted
Progress report = accepted
actual start position = 2840000000 ticks
difference from saved position = 0 ticks
```

所以：

```text
REAL NONZERO START POSITION = PASS
REAL RESUME POSITION = PASS
```

本项测试的是 bridge 对 non-zero start position 的实际承接；server policy 结论单独记录，原始 30 秒测试位置不再作为 Native Helper blocker。

### Fast consecutive NextTrack

Resume 通过后，A/B/C 三项真实媒体进入 fastNext。A 已 core-playing，随后立即并发发送两个 `NextTrack`，没有使用固定 sleep。

```text
HTTP command #1 = fulfilled
HTTP command #2 = fulfilled
unhandled rejection = 0
fast queue CD2 route = direct-url hit
fast queue Native Helper/core-playing = PASS
final current item = not observed
A stopped/retired = not observed
B final ownership = not observed
C Session/report = not observed
```

bounded 45 秒内播放器没有到达 C，acceptance 在此停止。当前 blocker 记录为：

```text
FAST NEXTTRACK / REMOTE COMMAND SEMANTICS = BLOCKED
classification = OTHER
```

这轮没有继续重发命令，也没有把它直接归因为 production bug。generation-required、unexpected bridge_error、helper crash、Electron crash 均为 `0`。

脱敏 evidence：`.work/real-resume-policy-libraryoptions-e3fb5865a80e4d7d8a27a72daa8a9cc5.json`、`.work/live-acceptance-cd2-policyknown-b368825795ad40aab0073ecf3f9fc6b6`。

## 2026-09-17 — Resume policy read-only probe

当前测试 item 的脱敏 duration：

```text
RunTimeTicks = 56915310000
duration = 5691.531 seconds
Stop PositionTicks = 302390000
playedPct = 0.531298%
```

`Library/VirtualFolders` 返回成功，item 匹配一个 `movies` virtual folder。当前 profile `IsAdministrator=false`。`System/Configuration` 返回 HTTP 200，但没有返回：

```text
MinResumePct
MaxResumePct
MinResumeDurationSeconds
```

本机已知 Emby server config roots 也没有可用的 admin `system.xml` evidence。因此：

```text
policy = unavailable to current credentials
CURRENT 30s STOP = POLICY UNKNOWN
```

本轮不猜阈值，不修改 server config，也不把 30 秒 Stop 归因于 report semantics。由于无法证明当前位置满足 resume eligibility，未发送合规 target seek，未执行 second Play，未执行 fast consecutive NextTrack；等待一个授权的只读 policy source 后再继续。

脱敏 evidence：`.work/real-resume-policy-0d35749f49274f39b0af7f6f5c3922d1.json`。

## 2026-09-17 — Resume metadata bounded polling

本轮只修改 acceptance harness 的 Resume 诊断，不修改 production code。`resumeCycle` 在 Stop 后使用 `500ms` polling、`10000ms` bounded window，记录每次 server metadata snapshot。

### Polling timeline

| elapsed | PlaybackPositionTicks | PlayedPercentage | Played | Unplayed | LastPlayedDate |
|---:|---:|---:|---|---|---|
| 97ms | 0 | null | false | true | present |
| 699ms | 0 | null | false | true | present |
| 1300ms | 0 | null | false | true | present |
| 1905ms | 0 | null | false | true | present |
| 2614ms | 0 | null | false | true | present |
| 3219ms | 0 | null | false | true | present |
| 3821ms | 0 | null | false | true | present |
| 4424ms | 0 | null | false | true | present |
| 5211ms | 0 | null | false | true | present |
| 6215ms | 0 | null | false | true | present |
| 7211ms | 0 | null | false | true | present |
| 8214ms | 0 | null | false | true | present |
| 9207ms | 0 | null | false | true | present |

```text
metadata poll interval = 500ms
metadata max wait = 10000ms
metadata update within window = NO
final observed PlaybackPositionTicks = 0
```

### Stop report correlation

```text
Stop report accepted = true
Stop report PositionTicks = 302390000
same ItemId as start lifecycle = true
same MediaSourceId as start lifecycle = true
same PlaySessionId as start lifecycle = true
HTTP response resolved = true
WebSocket command delivered = true
media page returned = true
refreshed UserData.PlaybackPositionTicks = 0
```

因此本轮已经排除“固定 1 秒等待过短”的初步 harness timing 假设。由于 report 已被接受且 payload identity 与播放 lifecycle 一致，但 server metadata 在 bounded window 内仍为 0，首个独立 blocker 分类为：

```text
EMBY SERVER / REPORT SEMANTICS
```

没有继续第二次 Play，也没有把问题直接归因于 production reporting。根据 first-blocker 规则，`fast consecutive NextTrack` 本轮未运行。

## 2026-09-17 — Multi-sample mapping and REAL CD2 run

当前 runtime：`EmbyTheaterEnhanced-0.1.1-native-helper-cd2diag-50f578e`，source commit `50f578e1eb251336d15ba116b558c1ac341d7f05`。真实 profile 只用于复制登录态到临时 acceptance profile；没有覆盖或清理原 profile。

### Inventory and mapping

```text
Movie/Episode total = 7665
fetched = 7665
ordinary = 0
STRM = 7665
sampled STRM = 12
different sidecar/source directories = 12 / 12
source path kind = POSIX
```

因此 ordinary 记录保持：

```text
REAL ORDINARY MEDIA = N/A — ENVIRONMENTALLY UNAVAILABLE
```

补偿证据为 Formal ordinary pipeline PASS，以及此前 REAL Native Helper STRM native-fallback lifecycle PASS；没有创建或修改真实 Emby 媒体库。

12 个样本的 sidecar common descriptor 为 POSIX/media、3 segments、length 15；source common descriptor 为 POSIX/other、5 segments、length 37。每个 actual source path 都是 7 segments，candidate 为 sourcePath-only；sidecar/source relative stem correspondence 为 `12/12`。ETLP `path_map` target 在所有 source path 中位于同一 offset `2`，derived source prefix（4 segments，length 32）在 `12/12` 稳定，替换到 configured cloud target（2 segments，length 12）后保留 source suffix。该 mapping 从真实数据唯一推出，未通过试 prefix 得到。

### ETLP versus Enhanced input

ETLP 的源码链路是：

```text
playbackData.MediaSources[].Path
  -> source_path
mainEpInfo.Path
  -> file_path
strm_local_media_path(file_path, source_path)
  -> [src]/[dst] translated media_path
  -> strm_cd2_local_path
  -> maybe_register_strm_cd2_url(...)
```

所以 ETLP CD2 matcher 的实际输入是 translated local mounted path；Enhanced rule selection 的实际输入是 `MediaSource.Path/sourcePath`。对 `Items/{id}/Download` 做的有界 `Range: bytes=0-4095` 读取全部返回 `206` video bytes，未暴露 `.strm` pointer text；这被记录为 endpoint behavior，不作为 content identity failure。`MediaSource.Path` 的 source identity 由 ETLP parser comment/code contract 与多样本 suffix correspondence 支持。

### Rule selection and CD2

使用 derived mapping 的 rule-selection probe：

| 检查 | 结果 |
|---|---|
| selected `legacy-cd2` | `12/12` |
| sourcePath-only candidate | `12/12` |
| stub CD2 transport invocation | `24` |
| actual same-origin CD2 probe | `status=hit, reason=cd2_hit, sourceKind=cd2-url` |
| real full flow CD2 route | `direct_url_hit / direct-url`，两次 playback resolver hit |
| real CD2 phases | `FindFile` 与 `GetDownloadUrlPath` 均完成 |

完整 real CD2 flow 的 `inspect/select/play/pause/seek/resume/next/stop` 全部通过，remote command 的 server accepted 与 WebSocket delivered 全部通过；Native Helper/core-playing、own Session、播放报告、Stop 后 NowPlaying 清空均通过。`generation-required=0`、unexpected `bridge_error=0`；当前 run 没有 helper/Electron crash，结束时 residual 为 `0`。

### Remaining coverage blocker

为了补剩余检查，当前 acceptance 工作副本新增了 `seekBackward`、`getStats`、`resumeCycle`、`fastNext` 方法。`seekBackward` 与 `getStats` 通过，`getStats` 返回 `media/video/audio/enhanced` 四类。`resumeCycle` 已确认 Stop command accepted、WebSocket delivered、Stop report accepted（`302800000` ticks），也成功返回 media page；但 1 秒后刷新 item 的 `UserData.PlaybackPositionTicks` 仍为 `0`，未继续再 Play。这里按第一个独立 blocker 停止，分类为 `HARNESS`，表现为对 Emby server metadata eventual update 的等待假设；本轮没有继续判断更晚的 server update，也没有执行 `fastNext`。

脱敏 evidence：`.work/real-multisample-correlation-19669e680df849fdb606907ac9a70a2a.json`、`.work/real-rule-selection-probe-3908f945593d4d63876ba50fc32771d7.json`、`.work/real-cd2-runtime-config-probe-c55cd9c1410643cba3c051b01e882a6f.json`、`.work/live-acceptance-cd2-full-3f8c2c91c88644459db122d89a501061`、`.work/live-acceptance-cd2-remaining-3ef6c50206ca4a9ca61bd0465be9d251`。

## 2026-09-17 — Ordinary acceptance N/A and CD2 rule correlation

根据完整只读 inventory，当前真实 ordinary acceptance 记录为：

```text
REAL ORDINARY MEDIA = N/A — ENVIRONMENTALLY UNAVAILABLE
```

Emby Movie/Episode `TotalRecordCount=7665`，实际取回 `7665`；`ordinary=0`、`STRM=7665`，source path kind 为 POSIX `7665/7665`。不创建或修改真实媒体库。Compensating evidence 为 Formal ordinary pipeline PASS，以及 REAL Native Helper STRM native-fallback lifecycle PASS。该 N/A 不作为 production blocker。

针对上一轮成功播放的真实 STRM，仅执行本地 rule-evaluation correlation，未调用 CD2、未播放、未修改 profile。itemId hash 为 `af7137c6a8570078`。sidecar path 与 source path 均为 POSIX，但 sidecar normalized hash/length 为 `f8cee147db9ba93f` / 97，root class 为 `media`；`MediaSource.Path/sourcePath` normalized hash/length 为 `6ef7215e5d4de93a` / 118，root class 为 `other`。source path 是合法 absolute mapping candidate，因此当前 matcher input 为 `sourcePath`，sidecar fallback policy 为 `sourcePath-exclusive`。

唯一相关 rule 的脱敏结果：

| 字段 | 结果 |
|---|---|
| rule index / id | `0 / legacy-cd2` |
| enabled | `true` |
| input path | `sourcePath` |
| input kind | POSIX，root class `other` |
| source root | POSIX，root class `media`，normalized hash `ababeaaffa67f26b`，length 10 |
| target root | POSIX，normalized hash `5bd333fa2336f6d2`，length 12 |
| regex matcher | absent / not applicable |
| sidecar vs source root | `matched=true` |
| actual source vs source root | `matched=false` |
| failure reason | `posix-prefix-or-boundary-mismatch` |

ETLP schema conversion的方向核对通过：ETLP `[src]` root 与 Enhanced rule source root 相同，ETLP `[dst]` 与 `path_map` source 为 Windows root，ETLP `path_map` target 与 Enhanced rule target 相同；没有证据表明方向反转。实际 source 不属于该 source root，`selectRule()` 返回 null，`resolve/resolveAsync` 进入 `no_matching_rule`，并且 `cd2TransportInvoked=false`。因此当前分类为 `ACCEPTANCE CONFIG ADAPTER`，附带 `ENVIRONMENT` 配置与实际 Emby source root 不一致；不是已确认的 production resolver gap。

独立 POSIX probe 对 `/media`、`/mnt`、`/volume` 均 selected=true，当前 resolver 支持这三类 POSIX rule。由于没有从 actual source 与现有 configured map 推导出唯一正确 source root，本轮不尝试多个 prefix，不调用 CD2 API，也不处理 cold-directory。REAL CD2 仍为未完成，当前第一个独立 blocker 为 `ACCEPTANCE CONFIG ADAPTER`。

脱敏 correlation evidence：`.work/real-rule-correlation-50f578e.json`。

## 2026-09-17 — Application-window ownership fix and REAL acceptance follow-up

本轮绑定 `feat/native-helper-bridge@49b1fc3668c98487fb044e73a1da698a8b67d822`，只修改 acceptance harness ownership，不修改 Native Helper、libmpv、PlaybackManager、Session、Resolver、generation 或 Pepper。ownership targeted regression `7/7`、acceptance readiness/terminal self-tests `3/3`、全量 `npm test` `197/197` 通过。重新构建的 runtime `EmbyTheaterEnhanced-0.1.1-native-helper-real-49b1fc3-ownerfix` 的四层 provenance/package 校验通过。

修复后的标准真实 flow 观察到 application owner 1、auxiliary `data:` window 1、application probe 1；后续 `evaluate` 保持在 application renderer。真实 STRM fallback 流程结果如下：

| 检查 | 本次结果 |
|---|---|
| Login / API / own Session | `loggedIn=true`，非管理员，own Session visible |
| App identity | `Emby Theater Enhanced`，same client/version |
| Native Helper | helper handshake、native-helper route 与 core-playing 通过 |
| Play | 通过，current player 与 Session NowPlaying 均观察到 |
| Pause / Resume / Seek | 通过；server accepted，WebSocket delivered，播放器状态正确 |
| NextTrack | 通过；旧项停止、新项启动，服务端当前项更新 |
| Stop | 通过；Stop report accepted，NowPlayingItem 清空 |
| Reports | 10 条真实 start/progress/stopped reports 全部 accepted |
| generation-required / bridge_error | `0 / 0` |
| helper/Electron crash | `0 / 0` observed |
| target runtime residual | `0` |

该真实 flow 的 resolver 结果为 `route=native`、`reason=no_matching_rule`、`cd2Reason=not_attempted`，因此记为 `REAL STRM Native fallback = PASS`，不记为 CD2 acceptance。inspect 的早期 `websocketOpen=false` / `SupportsRemoteControl=false` snapshot 没有阻止后续实际 WebSocket controls；控制阶段的 server accepted 和 WebSocket delivered 均为 true。

随后使用登录态 profile 副本和现有本地 CD2 输入执行隔离 run，原 persistent profile 未修改。该 run 完成标准 flow，但真实样本仍为 `no_matching_rule` / `cd2 not_attempted`，未取得 CD2 DirectUrl 或 same-origin hit、range playback、CD2 active-request cleanup 证据。临时副本已删除，credential material 未保留。

为寻找 ordinary 样本执行了只读分页扫描：Emby `Movie,Episode` `TotalRecordCount=7665`，实际取回 `7665`；`ordinaryCount=0`、`strmCount=7665`，全部 source path 为 POSIX。因当前真实媒体库没有非 STRM 样本，本轮第一个新的独立 blocker 为 `MEDIA/ENVIRONMENT`，按规则停止，没有继续猜 mapping 或执行额外播放。

本轮 ordinary、getStats、CD2 HIT/range、独立 Stop→再 Play Resume position 尚未覆盖；上一段 STRM fallback 的控制链证据保持有效。脱敏 evidence 保存在 `.work/live-acceptance-2525dec8174f42b9a43483e70458b0ff`、`.work/live-acceptance-cd2-34de10d328804431b2ebea57c8521ec9` 和 `.work/real-ordinary-scan-20260917.json`。

当前结论：

```text
REAL EMBY ACCEPTANCE = FAIL
```

本轮未使用 Pepper、未修改 production files、未提交/推送/合并，也未开始 Pepper retirement。

## 2026-09-17 — Native Helper REAL acceptance run

本次 run 绑定正式 source commit `49b1fc3668c98487fb044e73a1da698a8b67d822` 与 runtime `EmbyTheaterEnhanced-0.1.1-native-helper-real-49b1fc3`。四层 provenance/package 校验通过，实际运行模式为 `native-helper`；没有设置 Pepper fallback，也没有自动 Pepper recovery。

现有 persistent profile 只读检查为 `loggedIn=true`，client identity 为 `Emby Theater Enhanced`，非管理员。真实 application renderer 成功完成 inspect/select/play；helper handshake、resolver context、native route/load、core-playing、客户端 current player、HTTP Session NowPlaying 和已接受的 start/progress reports 均观察到。`DeviceId` 只保留在本地脱敏日志中，原始 DeviceId、SessionId、server URL、token 和媒体标识不进入文档。

本次选择的是 STRM Movie。profile 当前未命中 CD2 mapping，日志明确为 `route=native`、`reason=no_matching_rule`、`cd2Reason=not_attempted`，因此没有把这次播放记为 STRM/CD2 acceptance。进入 `pause` 时，Native Helper 合法创建的辅助 `data:` video surface 触发第二次 `browser-window-created`；现有 acceptance harness 在 `tools/acceptance-electron.cjs` 中把 application `win` 覆盖为该辅助 renderer，`window.eteAcceptance.pause()` 随后执行失败。该结果归类为 `test/acceptance harness` blocker，按规则停止后续动作。

| 检查 | 本次结果 |
|---|---|
| 登录/API/Session | `loggedIn=true`、own Session visible；inspect 时 WebSocket/SupportsRemoteControl 为 false，完整 identity 对照未完成 |
| inspect / select / play | 通过；core-playing、current player、NowPlaying 与 start/progress report observed |
| Pause / Resume / Seek / Stop | 未完成；在 Pause harness invocation 失败前停止 |
| getStats | 未覆盖 |
| STRM/CD2 | 未覆盖；本次 route 为 native、CD2 not_attempted |
| Remote Control / NextTrack | 未覆盖 |
| generation-required / bridge_error | 0 / 0 |
| helper / Electron crash | 0 / 0；helper-terminal 0 |
| residual | owned Electron/helper 0 |

完整脱敏 evidence 保留在忽略目录 `.work/live-acceptance-a2a9cf79f6cb4846a1726ee9597a5593`。本次结论为 `REAL EMBY ACCEPTANCE = FAIL`；不升级为 Native Helper production acceptance complete，也不授权或开始 Pepper retirement。

日期：2026-09-13（UTC+8）；产品版本：0.1.1。

用户已自行登录，账号非管理员。用户允许使用库内任意影视，并说明全库均为 STRM；WatchTogether 本轮以后台控制正常为验收标准，不要求额外双客户端测试。

## 实际结果

选择两个不同的 STRM 样本（STRM Sample A、STRM Sample B）。两项均 Item.Path 以 .strm 结尾、单 MediaSource。通过现有 PlaybackManager 调用内嵌 libmpv，播放方式为原生 DirectStream。样本名称、内部 ItemId、MediaSourceId 和 PlaySessionId 不进入公开仓库。

| 检查 | 结果 |
|---|---|
| 账号与 Session | 非管理员；自己的 Session 可见；SupportsRemoteControl=true；WebSocket 已连接 |
| 播放与进度 | 客户端进度推进，服务器显示正确 Item 与对应进度 |
| Pause | 服务端 POST 接受，真实 WebSocket Playstate 到达；客户端与服务器均暂停 |
| Seek | 后台跳转至 60 秒；客户端、服务器 PositionTicks 均为 600000000 |
| Unpause | 后台恢复，客户端继续推进到 62 秒以上 |
| NextTrack | Sample A 停止、Sample B 开始，换为新的 PlaySessionId |
| Stop | 服务端接受、WebSocket 到达、客户端停止；服务端 NowPlayingItem 清空 |
| 上报一致性 | 两个不同 Item 各对应一个 MediaSource 和 PlaySession；真实开始/过程/停止请求全部成功 |
| 画面与 native 属性 | 实际查看动画画面；gpu-next 输出、d3d11va 硬解，缓存字节值 3221225472 |

完整控制测试包含 10 条实际发送的播放报告，全部接受。另一次约 20 秒画面检查完成后通过服务器 Stop 停止。测试没有修改服务端配置、权限或媒体文件；正常播放会留下样本观看进度，未额外回写重置。原始证据文件仅保存在本地忽略目录。

## 工具与证据边界

`tools/accept-live.ps1 -AuthorizedLivePlayback` 启动项目专用验收入口，复用现有 Enhanced profile，不复制凭据、不启动调试监听端口。使用真实 ApiClient 发送控制到服务器自己的 Session，观察真实 WebSocket 消息、播放器状态和 Sessions 回读。上报观察位于 ajax 层，仅记录实际发送请求的白名单字段，不替换传输、不模拟结果。

验收启动入口加载相同产品 main.js 和资源；不经过 .NET host 的本轮播放测试与此前 Windows host/安装启动验证分别记录。普通启动方式在测试后恢复。

初次脚本使用 npm 包名 `emby-theater-enhanced`，登录时 token 对应产品名称 `Emby Theater Enhanced`，导致可远控的 WebSocket Session 与 HTTP Session 不一致。把验收入口 app name 修正为 productName 后，账号无需权限变化，完整远控通过。没有因此修改产品能力声明或服务器设置。

## 结论

第一轮运行验收按用户更新口径通过。普通文件因全库 STRM 无实服样本，保留本地/模拟证据；HDR、大码率长时间稳定性、所有编码、插件双端同步精度不在这两个样本的证明范围。本验收阶段当时尚未执行 Git 提交或发布；后续公开基线状态以 `PROJECT_STATUS.md` 为准。当前产品构建与安装包无需重新生成。

## 2026-09-14 — PR #2 follow-up

使用同一个 `%LOCALAPPDATA%\EmbyTheaterEnhanced-Acceptance` profile 进行 inspect。实现现在只有在 API client 存在且 `getCurrentUser()` 成功返回用户对象时才报告 `loggedIn=true`；超时、拒绝、空用户、缺少 API 或异常只返回安全枚举，不输出 server URL、username、token、cookie、localStorage 或 raw exception。实际 inspect 结果为 `exists=true, loggedIn=true, reason=logged-in`。

在当前工作区生成的隔离 runtime 上执行真实验收，选择两个 POSIX STRM 样本。只读 mapping 诊断确认两个样本共享一条稳定 single-prefix mapping，relative suffix 保持，边界/`..`/POSIX case sensitivity 通过，两个 CD2 target 均为 regular file，HEAD 200、Range 206 且无重定向。真实 Session 可见、账号为非管理员、WebSocket 在线、远控能力有效；两个样本均 `cd2_hit`，source kind 为 CD2 URL，embedded libmpv/core-playing 与 playback advancing、Play、Pause、Seek、Resume、NextTrack、Stop 全部通过，10 条播放报告全部被服务器接受。

实际 mapping 只存在于 ignored local acceptance 配置，没有写入源码、文档、fixture、acceptance report 或 Git。验收不使用 `Item.Path` 替代 `MediaSource.Path`，也没有自动学习、扫描或修改服务器/CD2 配置；原始证据只保存在本地 ignored work directory。

## 2026-09-14 — PR #4 DirectUrl 分层验收

复用同一 persistent profile 与已有 ignored mapping，不修改服务器或 CloudDrive2。安全模式在 renderer 内选取既有 STRM 的真实 `MediaSource.Path` 并调用 trusted CD2 IPC；输出只保留字段存在性和状态枚举。结果为 `sourceKind=direct-url`、returned User-Agent present、expiresIn present。随后 exact embedded libmpv 以 file-local `loadfile` option 打开该 DirectUrl，观察到 path accepted、format present、core-idle=false 与 time-pos advancing；未把 URL、query、UA、token、媒体名或路径写入公开 evidence。

完整 PlaybackManager → Session/WebSocket/controls/reports 复测多次在 `manager.play()` 45 秒内未完成，且 resolver 记录为 0，证明阻塞发生在本轮 source resolution 之前。刷新率协议独立 probe 正常；未修改产品播放链来绕过该阻塞。`ETE_CD2_DIRECT_URL=0` 的真实 same-origin 分层重试两次停在新 embed `bridge-not-ready`，没有发 loadfile。PR #2 的两个真实 same-origin 样本与全控制链证据仍有效，但不能替代 PR #4 的完整实服验收，因此本轮结论为 DirectUrl acquisition/libmpv PASS、完整真实 Emby acceptance 未通过。

## 2026-09-14 — PR #4 收尾复核

按当前源码重建独立 verification runtime 后，frozen DirectUrl fixture 进入 resolver 并观察到 DirectUrl 请求、required UA 与 no-leak；整体 fixture 在切换第二个 source 时发生 UI readiness timeout，因此不新增完整 controls/generation 通过结论。exact Pepper file-local UA 探针与 Stop-before-player 仍通过。

使用已有 persistent profile 和 ignored mapping 做一次有界真实 DirectSmoke，inspect/select 通过，但 resolver 阶段返回 timeout，未创建 bridge、未发起媒体请求；此结果记录为 acceptance/runtime 前置阻塞，不作为 DirectUrl 或 fallback 失败。前一条已保存的真实 DirectUrl 分层成功证据仍是本轮 product path 的 PASS 依据，完整 PlaybackManager/Session/WebSocket/controls/reports 继续保持未通过。

## 2026-09-14 — Pepper readiness 抖动诊断

本轮不是功能验收，使用当前 `main@e9e2ad221ed5059574f830e9ffd9ef0dd5c8a22c` 新建 verification runtime，连续执行 Run A/B/C，每次只执行 `inspect,select,play,stop`。三次均 acceptance success、runner completed、timedOut=false、cleanup verified-clean、residual=0；每次 unique embed=1，播放期间无 recreation/duplicate，Stop 后正常 disconnected。

脱敏 timing 如下：

| Run | play→embed | embed→bootstrap | bootstrap→authoritative ready | embed→authoritative ready | authoritative ready→manager resolved |
|---|---:|---:|---:|---:|---:|
| A | 5996ms | 3ms | ≈0ms（raw -1） | 2ms | 2657ms |
| B | 4565ms | 4ms | ≈0ms（raw -1） | 3ms | 2117ms |
| C | 4535ms | 4ms | ≈0ms（raw -1） | 3ms | 2268ms |

三次的 resolver-result 均在 ready 后 4–5ms 出现；没有证据将 PR4/DirectUrl/resolver 与 Pepper ready 延迟关联。`loadfileObservation=unavailable` 仍是 acceptance-only outgoing command 观测缺口。结论为 `ROOT CAUSE NOT YET CONFIRMED`，主要抖动位于 embed 前置的 PlaybackManager/player 链，精确子阶段尚未观测；产品代码没有修改。

## 2026-09-14 — Pepper ready listener race follow-up

分支 `fix/pepper-ready-listener-race` 的产品修复 commit 为 `731dc2ad5ca4898475a5e641b6975563f9cf8c74`。按该 commit 构建新 runtime 后只执行一次 `inspect,select,play,stop`，结果为 inspect PASS、select PASS、isStrm=true、unique embed=1、Pepper ready、resolver-result、manager-play-resolved 和 classification success；runner completed、cleanup verified-clean、residual=0。

本次 timing 为 `play→embed=4724ms`、`embed→Pepper ready=22ms`。它只证明 listener 顺序修复没有破坏当前播放链，不证明性能改善，也不改变历史 `ROOT CAUSE NOT YET CONFIRMED` 结论。`loadfileObservation=unavailable` 继续作为 observability gap。

## 2026-09-16 — CD2 budget and Native fallback Toast candidate

本节记录已验收实现 `9c9ec3871699d26157a4e29a52bf9198c8e03748` 的 Windows candidate REAL acceptance。Artifact 为 `EmbyTheaterEnhanced-0.1.1-cd2-toast-candidate-9c9ec38-setup.exe`，大小 `125,182,889` bytes，SHA256 为 `3c2c136610d2d2cb8e53f8636db7af3a4e5dc0f7333254b5fb6408150e2c6d69`。Build、Provenance、Package verify 和 Installer verify 均通过，解包逐文件结果为 `missing=0`、`extra=0`、`mismatch=0`。

### CD2 timeout budget

真实 candidate 播放观察到 client ready 约 `7ms`、`FindFileByPath` 约 `9ms`；Direct `GetDownloadUrlPath` 从 elapsed `≈16ms` 到 `≈352ms`，RPC 约 `336ms`，最终 `direct_url_hit`、CD2 HIT、`route=direct-url` 和 `core-playing PASS`。该样本的响应明显超过旧 `300ms` download deadline，在当前 `500ms` contract 下成功。证据范围是当前 Windows 环境覆盖约 `336ms` 响应，不代表所有环境的最终最优 budget。

### Native fallback Toast

另一条真实播放使用故意错误的更具体 STRM mapping。Direct 与 Same-Origin 均为 `not_found`，Mount 为 `mount_missing`，最终为 `route=native`、`reason=native_fallback`、`fallback=true`，随后 `core-playing PASS`。用户实际观察到一次原生 Toast：`增强播放源不可用，已回退 Emby 原生播放`。Emby Playback Stats 同时显示播放源为 Emby 原生、STRM 为是、CD2 为未命中、Mount 为未命中、Fallback 为是，因此 all-fail → Native、Toast 和 Stats semantics 均为 REAL PASS。

错误 mapping 仅存在于用户本地测试配置，未进入源码、文档中的配置数据或服务器。该验收证明当前 candidate 可用于下一步日用观察；不扩大到未覆盖编码、长期稳定性或下一阶段 bridge 工作。
