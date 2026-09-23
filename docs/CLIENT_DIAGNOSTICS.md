# Client Diagnostics v1

客户端诊断是只读可观测层。它不改变 Resolver precedence、DirectUrl、CD2 budget、Mount 判定、PlaybackManager、Session、WebSocket、DeviceId、播放上报、NextTrack、WatchTogether 或 libmpv source selection。

## 日志位置与轮转

日志始终启用，默认写入：

```text
%APPDATA%\EmbyTheaterEnhanced\logs\ete-client.jsonl
```

日志使用 UTF-8 JSONL，每行一个 event。当前文件达到约 2 MiB 时依次保留：

```text
ete-client.jsonl
ete-client.jsonl.1
ete-client.jsonl.2
ete-client.jsonl.3
```

目录会在第一次写入时创建。写入、目录创建和轮转失败均 fail-open，诊断层不会抛错到播放链；日志写入通过串行异步队列执行，不在播放调用栈中进行同步文件 I/O。

## Event schema

每条记录采用以下结构：

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-09-16T00:00:00.000Z",
  "level": "info",
  "category": "resolver",
  "event": "route-selected",
  "details": {}
}
```

当前主要类别如下：

- `app`：`start`、自然可观测的 `shutdown`，以及版本、平台、架构和安全摘要。
- `resolver`：`context-observed`、必要时的 `invalid-context`、每次 STRM resolve 的 `route-selected`，以及设置页的 `smart-path-mapping-preview` / `smart-path-mapping-accepted`。
- `cd2`：`resolve-start`、`client-ready`、`find-file-start`、`find-file-end`、`download-url-start`、`download-url-end`、`resolve-hit`、`resolve-miss`、`resolve-error`、`resolve-cancelled`。
- `mount`：`resolve-start`、`resolve-hit`、`resolve-miss`。
- `playback`：`play-request`、`resolver-complete`、`loadfile-requested`、`core-playing`、`pause`、`resume`、`seek`、`next`、`stop`、`playback-error`。
- `mpv`：ready/playing 属性快照；不导出 `mpv.conf` 原文。

IPC 也保持两条明确边界：`enhanced-diagnostics` 只接收旧的 mpv property snapshot，`enhanced-diagnostics-log` 只接收 structured client event。两条通道都只接受当前 BrowserWindow 的 trusted sender；logger 自身继续负责最终 sanitizer 和 fail-open。

CD2 resolve 事件只记录 request id、rule id、mode、candidate 数量、reason、耗时、timeout/cancelled 状态和安全的 `sourceKind`。阶段 timing 事件只记录 `mode` 与从该次 CD2 resolve 开始计算的 `elapsedMs`；不记录 Path、URL、token 或 RPC 参数。Mount 事件只记录 request id、rule id、candidate 数量、reason、`localExists` 与 `mappedPathHash`。

Smart Mapping preview 只记录 `coverageStatus`、`fileMatchConfidence`、`boundaryStatus`、`boundaryConfidence`、`matchedSuffixSegments` 和安全 `reason` 枚举；用户把 Boundary HIGH suggestion 加入页面 draft 时，accepted 事件只记录 `boundaryConfidence` 和 `matchedSuffixSegments`。两类事件都不记录 raw STRM/cloud/mount path、canonical prefix、URL、Token 或完整 rule；accepted 也不代表 config 已保存或 production route 已改变。

## Resolver route meanings

`resolver/route-selected` 的 `route` 是稳定枚举：

| route | 判断 | 含义 |
|---|---|---|
| `direct-url` | `sourceKind=direct-url` | DIRECT URL |
| `cd2-http` | `type=url` 且 `sourceKind=cd2-url` | CD2 SAME-ORIGIN HTTP |
| `mount` | `type=local` 且 `reason=mount_hit` | MOUNT |
| `native` | `type=native` | NATIVE FALLBACK |

路由记录包含 `requestId`、`playRequestId`、`isStrm`、`ruleId`、`type`、`reason`、`sourceKind`、`cd2Reason`、`directReason`、`localExists` 和 `fallback`。`result.source` 永远不写入日志。

`resolver/context-observed` 只记录上下文是否存在、字段类型、扩展名、`.strm` 后缀、Container、协议、播放方法和 DirectStream/Transcoding URL 是否存在，不记录原始路径或 URL。`resolver/invalid-context` 额外记录 `missingFields` 与 `isStrmDetected`，用于区分 `item`、`mediaSource`、`sidecarPath`、`sourcePath` 和 `nativeSource` 哪一项缺失；它不会改变原有 `invalid_context` 返回值。

## 导出关联与原生播放信息

导出 Summary 以最新 `resolver/route-selected` 所在的 app run 为边界：从该 route 向前找到最近的 `app/start`，并只在这个 run 内以对应 request id 关联 CD2、Mount、native fallback 与 playback lifecycle。请求 id 在新 app run 中可重新开始，因此找不到 `app/start` 时 Summary 保守显示 `UNKNOWN`，不会跨 run 关联旧事件。

播放中的原生“播放信息 / Stats”面板会追加一个 `Emby Theater Enhanced` 分类。它只显示当前 libmpv player instance 已完成解析的安全 observation：播放源、STRM、CD2、Mount、Fallback，以及存在时的 rule ID；不显示路径、URL、token、headers、阶段耗时或原始诊断数据。新请求开始、stop 和 destroy 都会清除旧 observation；被 supersede 的旧请求不能写入新播放的 Stats。普通非 STRM 显示“播放源：Emby 原生、STRM：否”。

## 隐私与脱敏

所有落盘记录都会经过同一个 sanitizer。以下内容禁止落盘：

- Emby access token、`X-Emby-Token`、`Authorization`、Bearer token、Cookie、api key、password 和 CD2 token。
- URL query、完整媒体 URL、完整 DirectUrl 和完整 origin/path。
- Windows 用户名、Windows drive/UNC 媒体路径和 POSIX 媒体路径。
- Local Storage、Cookie database 和 `mpv.conf` 原文。

需要关联路径时只保留 `SHA256(normalizedPath)[:16]` 的 `pathHash` 或 `mappedPathHash`。需要识别服务时只保留协议与 `SHA256(lowercase hostname)[:16]` 的 `hostHash`。DeviceId、DeviceName、SessionId 和 PlaySessionId 只保留对应的 16 位哈希。对象、Error、循环引用、超长字符串、`undefined` 和 `null` 都按安全规则处理。

## 客户端入口

在设置页打开“诊断与日志”后，可以看到：

1. 诊断日志已启用及简化后的日志目录说明。
2. “导出诊断日志”，通过 Electron save dialog 保存 TXT 报告。
3. “打开日志目录”。
4. “清空日志”，需要两次确认，并只清空当前日志和三层轮转文件。

导出文件名格式为：

```text
EmbyTheaterEnhanced-Diagnostics-YYYYMMDD-HHmmss.txt
```

报告顶部包含应用版本、Build Commit、平台、架构、Electron/Chromium/Node、导出时间和 DeviceId Hash。随后给出最近一次确定的 STRM route、Resolver reason、CD2 结果、Mount 结果、Native fallback、Playback 结果和 core-playing 状态，最后按 `.3 → .2 → .1 → current` 时间顺序合并客户端 JSONL。无法从日志确定的值写为 `UNKNOWN`，畸形 JSONL 行会安全忽略并计数。

## AI 分析建议

将导出的 TXT 原样交给 ChatGPT/Codex/Hermes 时，优先询问：

- 最近一次 STRM 最终 route 是 `DIRECT URL`、`CD2 HTTP`、`MOUNT` 还是 `NATIVE FALLBACK`？
- CD2 是命中、miss、error 还是 cancelled？Mount 是否实际到达并命中？
- Resolver 完成后是否发出了 `loadfile-requested`？之后是否进入 `core-playing`？
- 错误发生在 Resolver、loadfile 前后，还是播放器已经开始后？

这些问题应依据 event 和 reason 回答。日志只提供事实，不包含根因推测。

## Failure behavior and acceptance boundary

诊断 IPC 只接受当前 BrowserWindow 的可信 sender。导出失败、打开目录失败、清空失败只反馈给设置页，不会使客户端崩溃，也不会改变播放 fallback。

本轮覆盖 resolver、CD2、Mount 和 libmpv playback 的低风险事件。由于禁止侵入旧 upstream Web UI、`apiclient.js`、`connectionmanager.js`、PlaybackManager vendor snapshot 和 WebSocket 生命周期，Session capability、NowPlaying、WebSocket 状态与真实双客户端事件保持 `DEFERRED OBSERVABILITY`。真实 Windows 客户端播放各 route、导出 TXT 和交给 AI 的验收仍需要人工执行。

## 一键脱敏诊断包

v0.2.0 之后的观察工具分支提供独立只读 collector：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/collect-diagnostics.ps1
```

默认在当前目录生成：

```text
ETE-Diagnostics-YYYYMMDD-HHMMSS\
ETE-Diagnostics-YYYYMMDD-HHMMSS.zip
```

默认时间范围为最近 20 分钟。已知问题时间时可收窄到前后各 5 分钟：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/collect-diagnostics.ps1 `
  -ProblemTime '2026-09-17T21:30:00+08:00'
```

可用参数包括 `-OutputRoot`、`-LookbackMinutes`、`-ProblemWindowMinutes`、`-MaxLogLines` 和 `-NoZip`。`-LogRoot`、`-InstallRoot` 与 `-CaptureTime` 主要用于隔离验证或非标准安装路径；正常安装不需要指定。

目录内容固定为：

- `product.json`：版本、source commit、runtime provenance presence、bridge/runtime version 与 Windows version。
- `processes.json`：ETE host、owned Electron、Native Helper PID/count 和 residual status；不读取或输出 command line。
- `playback.json`：最近 play/route/reason/source kind/resolver/core-playing/generation 的已有日志证据。
- `cd2.json`：最近 rule、Find、download、DirectUrl、reason、elapsed 的已有日志证据。
- `session.json`：Session/WebSocket/report 证据；v0.2.0 没有对应 client event 时明确为 `UNAVAILABLE`。
- `errors.json`：有界 client error 与 Windows crash event metadata，不保存 Windows event message 正文。
- `logs/client.jsonl`：仅四个 ETE client log 轮转文件中位于时间窗口内的有界、再次脱敏记录。
- `manifest.json`：tool/capture/app/source/time range、文件 hash、collection warnings 与 redaction Gate。

collector 不扫描磁盘、媒体库、115 或 CD2 目录，不读取用户配置正文，也不主动触发目录 enumerate、cache warm、retry 或播放。路径摘要只包含 kind、root class、segment count、extension 和 hash；URL 摘要只包含 scheme、host hash、path class 与 query presence。ID 使用每包随机 key 的 HMAC-SHA256 短哈希，key 不写入包，因此只保证同包事件关联。

ZIP 只有在整目录二次扫描通过且 `manifest.json` 中 `redactionPassed=true` 时才生成。若 Gate 失败，脚本退出并拒绝生成 ZIP；不得发送该目录，先保留本机现场并检查 `redactionWarnings`。

## 一键问题快照

问题发生后的第一时间运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\tools\report-playback-issue.ps1
```

工具会显示 Startup、Playback Failure、Seek、Pause / Resume、NextTrack、CD2 / DirectUrl、Mount fallback、Remote Control、Fullscreen / UI、Crash / Exit 和 Other 共 11 个选项，然后只询问一句可留空的简短描述。它不会要求输入服务器地址、Token、媒体路径、ItemId、SessionId 或 CD2 path。

一次运行先生成：

```text
ETE-Issue-YYYYMMDD-HHMMSS.json
```

随后立即以同一个 `capturedAt` 调用 `collect-diagnostics.ps1 -ProblemTime <capturedAt> -ProblemWindowMinutes 5`，生成完整诊断目录和 ZIP。Snapshot 与 `manifest.json` 共享随机、每次问题新建的 `issueCorrelationId`；该 ID 不由 DeviceId、SessionId、ItemId、MediaSourceId、媒体路径或设备信息派生。

Snapshot 只使用当前已有的 client JSONL、可读的 ETE 进程树、已存在的 runtime metadata 和有界 Windows Application crash metadata。它记录 product、process、playback、resolver、CD2、Session 和 error 的当前证据。没有证据的 Session、NowPlaying、WebSocket 和 report 字段写为 `UNAVAILABLE`；缺日志、invalid UTF-8、畸形 JSONL、无法读取 Windows Event 或程序未运行只形成 warning，不改变播放行为。

`fullscreen-ui` 会保留已有 app window state、Native Helper 进程存在性、currentPlayer、route、corePlaying 和最近 native-helper event。`cd2-or-mount` 会保留 route、rule hash、reason、sourceKind、CD2 attempt、FindFile、DirectUrl、Mount hit 和 elapsed evidence，用于区分没有观测到 CD2、CD2 miss、transport failure 和 DirectUrl failure；脚本不会新增 production observer，也不会重新发起播放、CD2、Mount 或 retry。

Snapshot 与 Collector 共同使用 `tools/diagnostics-common.ps1` 的随机包内 HMAC ID hash、path/URL summary、bounded safe JSON 和最终 redaction scan。若 Snapshot 文件的最终 Gate 发现 raw token、Authorization/Bearer、带敏感 query 的 URL、absolute media path 或敏感 ID，则删除该 Snapshot、停止调用 Collector，并返回失败；播放链不受影响。Collector 自身仍只有在目录二次 Gate 通过后才生成 ZIP。

问题快照入口的退出码保持分流：Snapshot 自身或 Collector redaction/privacy refusal 返回 `2`；普通 Collector generation failure 返回 `3`；Collector 成功且 Snapshot 已生成返回 `0`。

Snapshot 本身目标低于 2 秒；完整 Collector 仍按原有边界执行，目标低于 10 秒。生成结果会在命令行报告 Snapshot、Bundle、ZIP、correlation linkage 和 redaction 状态。

## CD2 route timeline observer

需要观察一次 CD2 DirectUrl 命中和一次 Mount fallback 时，可在播放前启动只读 observer：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\tools\observe-cd2-cold-warm.ps1
```

默认最多观察 5 分钟，每 250 ms 重新读取四个已有 ETE client JSONL 轮转文件。它只等待日志变化，不调用 CD2、Resolver、Mount、播放、retry、cache warm 或任何 IPC。已有日志也可以离线分析：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\tools\observe-cd2-cold-warm.ps1 `
  -Once -LogRoot 'C:\path\to\logs' -OutputRoot 'C:\path\to\evidence'
```

成功输出：

```text
ETE-CD2-Observer-YYYYMMDD-HHMMSS.json
```

`startupClassification=FIRST_CD2_OBSERVATION` 表示该样本的 `cd2/resolve-start` 之前，在同一个 `app/start` run 内没有更早的 CD2 `resolve-start` 或 `client-ready` 证据；`startupClassification=SUBSEQUENT_CD2_OBSERVATION` 表示已有更早证据。它只描述启动后的观测顺序，不代表目录 cold、目录 warm、目录 hydrated 或目录 cached，也不代表 CD2 命中。`directoryColdWarm` 在当前版本固定为 `UNAVAILABLE`，除非未来已有日志提供 parent directory identity、directory enumerate、hydration 或 cache evidence。报告同时保存 `appStartTime`、`firstPlaybackTime`、每个样本的 request/rule/media safe hash、分类依据和 resolver initialization state。

每个样本包含：

- Resolver：rule matched、safe rule hash、strategy、order、selected route、route reason 和 fallback reason。
- CD2：`resolve-start`、`client-ready`、FindFile start/end、FindFile result、GetDownloadUrl start/end、URL generated evidence、terminal reason 和 elapsed。
- Mount：resolve start/hit/miss、selected reason、Mount fallback evidence。
- Timeline：按现有 event timestamp 重建 play request、resolver context、CD2、Mount、resolver complete、loadfile request 和 core-playing 的有界时间线。

当前 v0.2.0 client log 没有单独的 `resolver-initialized`、strategy、order 或 directory hydration event 时，报告明确保留 `UNAVAILABLE`，不从当前配置、规则名称、最终 route 或前一个媒体样本反推。只有 ItemId、MediaSourceId 或 source identity 已存在于现有记录时，same-media 才能标记为 `PASS`；否则保持 `UNAVAILABLE`。报告自身使用与 Collector/Snapshot 相同的共享 redaction contract，并在保存前执行二次 Gate。

退出码固定为：`0` 表示已捕获一条 DirectUrl route 和一条 Mount route 的有效报告；`2` 只表示 privacy/redaction safety failure；`3` 表示 evidence 不足或仍在等待两类可比较 route。`WAITING_FOR_DIRECT_URL_AND_MOUNT` 属于 exit 3，不复用 exit 2。
