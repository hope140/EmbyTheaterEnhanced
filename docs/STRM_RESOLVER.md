# STRM Playback Source Resolver

Resolver 运行在现有 `PlaybackManager → libmpv` 播放链内，只决定 Embedded libmpv 最终加载的 source，不创建播放器、Session 或 PlaySession。规则命中后按 `cloud-first`、`mount-first` 或 `custom` order 尝试 safe CloudDrive2 DirectUrl、CloudDrive2 same-origin HTTP、Mount 和 Native。

## Detection

满足以下任一条件即视为 STRM，比较大小写不敏感。

- `Item.Path` 是字符串且以 `.strm` 结尾。
- `MediaSource.Container` 为 `strm`。

普通媒体直接返回 native source，不进入本地路径推导。

当 `Item.Path` 缺失时，`libmpv.playInternal` 只在 `item.Id` 与 `item.ServerId` 同时存在的情况下，通过现有 `connectionManager` 找到 ApiClient，并调用 `getItem(userId, itemId, {Fields:'Path'}, signal)` 做一次有界 metadata recovery。返回的 Path 以 `.strm` 结尾时才作为 `sidecarPath`；返回普通媒体 Path、请求失败、超时或 request superseded 都保持 native 行为。`DirectStream + file + mkv` 本身不是 STRM 证据。

## Context

Resolver 使用三个严格分离的路径字段。

| 字段 | 来源 | 含义 |
|---|---|---|
| `sidecarPath` | `Item.Path` | `.strm` sidecar identity |
| `sourcePath` | `MediaSource.Path` | sidecar 中保存的目标路径或 URL |
| `nativeSource` | `options.url` | PlaybackManager 已决定的最终原生播放 source |

`item`、`mediaSource`、`playMethod` 和完整 `streamInfo` 只作为现有播放上下文传入。Resolver 不修改这些对象。

若发生 recovery，`sidecarPath` 的来源在 diagnostics 中标记为 `metadata-recovery`；原始 `sourcePath` 仍来自 `MediaSource.Path`，不会改回 `.strm`。

## Resolver contract

同步 `resolve()` 保留原 Mount 契约；产品播放使用异步 `resolveAsync()`，CD2 成功可返回 URL，否则继续原 Mount/Native 契约。

```javascript
{
    type: 'native' | 'local' | 'url',
    source: '...',
    reason: '...',
    isStrm: true | false,
    localExists: true | false,
    fallback: true | false
}
```

`type: 'url'` 表示已经由 main process 校验的 DirectUrl 或 CD2 same-origin HTTP(S) source；`sourceKind` 区分 `direct-url` 与 `cd2-url`。只有 DirectUrl 可以携带受限的 `requestOptions.userAgent`，并由 libmpv 作为 file-local `loadfile` option 传递。CD2 resolver 不控制播放器，也不改变输入 context。

## CloudDrive2 rules

1. 复用 Mount Resolver 的确定性媒体候选，不扫描目录、不解析 provider opaque id。
2. main process 以 persistent schema version 1 配置为 authoritative source；首次启动且没有持久化配置时才读取 `ETE_CD2_ENABLED`、`ETE_CD2_ORIGIN`、`ETE_CD2_TOKEN`、`ETE_CD2_LOCAL_PREFIX` 与 `ETE_CD2_CLOUD_PREFIX` 做 AUTO bootstrap。`ETE_CD2_ENABLED` 只迁移为 `cd2.enabled`，bootstrap 时 top-level `config.enabled` 保持 `true`；因此 legacy `0` 只关闭 CD2 service，STRM resolver 仍可继续 Mount → Native。token 不进入 renderer、诊断或日志。
3. 每条命中规则独立执行 source prefix → POSIX cloud prefix mapping，并保留 source/mount/cloud 三种路径语义；drive/UNC 大小写不敏感，absolute POSIX 大小写敏感，均严格检查路径边界并拒绝 `..`。absolute POSIX `MediaSource.Path` 带 allowlisted 媒体后缀时是确定性 CD2 candidate；在 Windows client 上它不会进入 `existsSync` Mount 检查，只能由 CD2 命中，否则继续下一 stage。
4. 先调用 `GetDownloadUrlPath(... get_direct_url=true)`；只有安全 HTTP(S) DirectUrl、空 additionalHeaders、受限可打印 ASCII User-Agent 与有效 expiry 才可直连。任意 additionalHeaders、控制字符、逗号/反斜杠 UA、无效/近过期 URL 均优先 same-origin。
5. `direct-url` 与 `cd2-http` 通过同一 main service 的窄 mode 区分；DirectUrl miss/unsupported/transport failure 后按当前规则的下一 stage 取得同源 URL。连续 CD2 stages 复用 Find 结果并共享 `1200ms` absolute budget；CONNECT/readiness 最多 `200ms`，Find 最多 `350ms`，Direct 与 Same-Origin download 各最多 `500ms`，Direct 为 Same-Origin 保留最多 `500ms`。若 CD2 miss 后 Mount 命中，Mount route 的诊断 metadata 保留最近一次 `cd2Reason`；不改变 route 或 source。Abort/superseded 不进入 fallback。

## Mount rules

按以下顺序尝试，只有 `fs.existsSync(candidate) === true` 才命中。

1. sidecar stem 已含媒体扩展，例如 `Movie.mkv.strm → Movie.mkv`。
2. `sourcePath` 已是明确的 Windows 本地路径或 UNC 路径，例如 `C:\Media\Movie.mkv`、`\\server\share\Movie.mkv`。
3. 从 HTTP(S) `sourcePath` 的 URL pathname 提取明确文件名，并在 `sidecarPath` 所在目录尝试。
4. 从 URL 的 `name`、`filename` 或 `file_name` query 参数提取明确文件名，并在 sidecar 所在目录尝试。

可作为 Mount candidate 的扩展为：`mkv`、`mp4`、`m4v`、`avi`、`mov`、`ts`、`m2ts`、`mts`、`webm`、`mpg`、`mpeg`、`vob`、`wmv`、`flv`、`y4m`、`mp3`、`flac`、`m4a`、`aac`、`ogg`、`opus`、`wav`、`wma`、`ape`、`alac`。其他扩展即使文件存在也不命中。

URL pathname 使用 `URL` 解析，编码文件名使用安全解码。解码、URL 解析或文件系统检查异常均转为 native fallback。

Mount 规则命中时，会将 candidate 按 `sourcePrefix → mountPrefix` 做确定性前缀替换，再执行 `existsSync`。没有 `mountPrefix` 的规则不会猜测本地路径。

第一版不进行模糊搜索、递归扫描、全盘搜索、父目录猜测、历史缓存、数据库或 provider 特判。

## Fallback and playback safety

- 非 STRM、缺少 `item`/`mediaSource`/任一三个路径字段、未知播放方式和任何 Resolver 异常都保留 `nativeSource`。metadata recovery 的 ApiClient 缺失、identity 缺失、失败和超时同样 fail-open。
- `Transcode` 始终保留 `nativeSource`。
- `DirectPlay` 和 `DirectStream` 只有在确定性本地文件命中时才替换 source。
- renderer Resolver 只通过窄 IPC 请求 main-process CD2 service，不自行 seek，也不改变 resume offset、音轨、字幕、`MediaSourceId` 或 `PlaySessionId`。
- `libmpv.playInternal` 仅使用结果的 `source` 调用原有 `loadfile`；原始 `options` 继续用于字幕、音轨、上报和 Session 控制。
- PlaybackManager request id 与 libmpv generation 使新 Play/NextTrack/Stop/destroy 立即淘汰旧请求；旧 RPC、旧 `core-playing` listener 和旧 error recovery 不得影响新播放。

诊断只记录 `isStrm`、结果类型、reason、local exists 和 fallback；context event 另记录 identity source、字段存在性、类型、扩展名和 recovery 事实，不记录完整媒体路径、URL、凭据、媒体名称或 Item 标识。当前 reason 包括 `mount_hit`、`mount_missing`、`mapping_miss`、`transport_error`、`not_strm`、`transcode_skip`、`invalid_context`、`parse_failed` 和 `native_fallback`。

## Known limitations

当前 unit/fake/frozen Electron 已覆盖 DirectUrl + file-local UA、unsafe UA/header → same-origin、known-expiry bounded reacquire、transport reject/timeout → same-origin、规则策略顺序、source/mount/cloud prefix replacement、最长前缀、AUTO/USER/DISABLED、CD2 miss → Mount/Native、POSIX candidate 不进入 Windows Mount、Transcode、Abort、cancel、late callback、双 NextTrack、libmpv Stop、PlaybackManager Stop-before-player.play 和旧 `core-playing` listener。真实 settings UI 的 native-window 自动化和真实服务器 cloud-first/mount-first playback 未在本分支宣称；HTTP-error-triggered refresh、任意 additionalHeaders 和 active full-directory discovery 仍不支持。

## 起播阶段的同请求后续路线

`createSequence()` 为已命中持久规则的 STRM 主视频创建请求内游标，普通媒体、转码和已下载本地优先路径保持原行为。每次 `next()` 消费实际设置顺序中尚未尝试的阶段；解析 miss 和已交付的路线均不重走。Native 位于自定义顺序中间时也只消费一次。规则从本次配置快照复制，设置变化只影响新 Play。

URL 交付或 load 命令 accepted 不代表成功起播。只有当前 native generation 的主媒体 `end-file reason=4` 被分类为 `media-load`；起播前该错误可推进游标。无法确认媒体归属的 load command/transport/protocol 故障、字幕错误、主动停止和已 core-playing 后的错误不轮换路线。每次加载分配新 native generation；旧 generation 的错误、属性及 EOF 不得完成新尝试。上一尝试的同步异步尾部先排空，延迟字幕额外绑定 attempt；不递归调用用户 Play，不创建新 Session，也不调用 Next。

从首次路线解析开始到有效 core-playing 设置 **15 秒绝对总期限**，涵盖解析及真实媒体起播等待；检查结果提交时的时间，不能依赖 timer 的调度顺序。每次继续解析仍按原 1200ms（已知新资源恢复另受原合同限制）限制连续 CD2 阶段，总期限不会因换路线重置。CD2 内既有 expiry 校验保留；不新增同路线重取 URL。轮换仅退休媒体 generation，不取消整个配置 lease；Stop、新 Play、Next 或退出才取消原请求链。起播 offset、音字幕选择与 DirectUrl file-local UA 沿原加载步骤逐次应用，同源/Native 不继承 DirectUrl UA。

后续路线耗尽时只拒绝原 `player.play` Promise，将同集兼容流/转码及最终错误收尾交还 PlaybackManager。正常 EOF 与主动 Next 不受此游标控制。终局错误不自动下一集由独立 PlaybackManager 修复提供，必须在组合候选上重新验证。

诊断 `startup-route` 复用请求/native owner，添加数字 `attempt`、受限路线及 `start/failed/advance/success/exhausted/cancelled` disposition。原因只记录媒体错误、后续路线、起播成功、请求退休或期限等类别，不记录 URL、路径、媒体名、凭据，也不把 helper 范围 HTTP 状态绑定到本次资源。

公开测试通过生产 patcher 输出、真实 JS resolver/adapter 和合成 IPC 验证上述控制流；不能代替 Windows 固定 DLL、真实用户媒体、可见画面和服务器 Session 验收。可运行 `node --test tests/strm-resolver-settings.test.cjs tests/native-helper-diagnostics-playback.test.cjs tests/native-helper-client.test.cjs tests/native-helper-service.test.cjs tests/playbackmanager-request-session.test.cjs`；最后一项需要仓库固定 Web 快照。
