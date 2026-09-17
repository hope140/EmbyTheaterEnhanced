# 架构

## Production Native Helper Bridge candidate

`feat/native-helper-bridge` 把 `libmpv.js` 以下的 Pepper endpoint 替换为 renderer logical adapter、Electron main supervisor、private inherited framed pipes 与独立 Windows helper。helper-owned child HWND 输出到 main-process video host；原 transparent BrowserWindow 独立置于其上，因此现有 Emby UI/OSD/input ownership 不变。完整 identity、event attribution、crash、surface 与 build contract 见 [NATIVE_HELPER_BRIDGE](NATIVE_HELPER_BRIDGE.md)。

此层只消费 Resolver 的最终 `native/local/url` source。PlaybackManager、Item、MediaSource、MediaSourceId、PlaySessionId、Session、WebSocket、progress、remote control 与 NextTrack 仍由既有链拥有。Pepper 注册在本阶段保留，仅能显式选择，helper failure 不自动回退。

基线为提供的 Carnival 3.0（应用声明 3.0.20-3.0）叠加综合补丁。保留 Windows .NET 启动壳、Electron、离线 Web UI 与内嵌 libmpv 的现有目录关系。

普通视频：Emby → PlaybackManager → 原生 MediaSource → libmpv 插件 → Pepper bridge → mpv-1.dll。Session、PlaySession、进度和远控仍由 Emby Web 生命周期负责。

STRM 增强：在 `libmpv.js` 的 `playInternal(options)` 中，若 `Item.Path` 缺失但 item/server identity 充分，则通过现有 `connectionManager.getApiClient(serverId).getItem(userId, itemId, {Fields:'Path'}, signal)` 做一次有界 metadata recovery；只有返回的原始 Path 以 `.strm` 结尾时才恢复 STRM sidecar identity。`sourcePath=MediaSource.Path` 和 `nativeSource=options.url` 保持不变；普通媒体不因 `DirectStream + file + mkv` 被识别为 STRM。随后仅在确定的 STRM context 内按 DirectUrl/CD2 HTTP/Mount/Native 顺序解析。Resolver 位于 `libmpv.js` 的 `playInternal(options)`，只替换最终交给 `loadfile` 的 source。`sidecarPath`、`sourcePath`、`nativeSource` 三者不可互换；PlaybackManager、Item、MediaSource、PlaySession、WebSocket 和远控生命周期保持原链路。Transcode 永远使用 native source。

`src/electronapp/resolvers/strm-resolver.js` 负责 STRM 判定、异步 source 编排、播放方式保护与 fallback；`mount-resolver.js` 生成确定性本地候选并执行 `existsSync`；`cd2-resolver.js` 只通过窄 IPC 请求 source。Electron main process 的 `enhanced/cd2-service.js` 持有 token、proto、grpc channel 与 active calls，按命中的规则执行 `sourcePrefix → cloudPrefix` mapping，依次调用 `FindFileByPath` 与 `GetDownloadUrlPath`。DirectUrl 只在 URL、expiry、空 additionalHeaders 与受限 User-Agent 全部安全时返回；否则复用同次响应或再次请求的 same-origin `downloadUrlPath`。source/mount/cloud 三个 prefix 保持独立；Windows drive/UNC 比较大小写不敏感，absolute POSIX 比较大小写敏感，均执行严格边界与 `..` 检查。main 从 persistent config store 创建 service，并立即删除 `process.env` 中的全部 `ETE_CD2_*` 输入，renderer 不继承 token、origin、mapping、Bearer metadata、raw gRPC client 或方法名。

STRM resolver settings 由 `enhanced/strm-config-store.js` 持久化 schema version 1 配置和 main-process-only secret 文件；`enhanced/strm-config-ipc.js` 只向当前 BrowserWindow 返回脱敏配置。`libmpv.getRoutes()` 注册 `mpvplayer/strm.html`，页面保存规则后提示重启生效。规则使用最长前缀匹配，支持 `cloud-first`、`mount-first` 和可校验的 `custom` order；AUTO discovery 只能更新 AUTO，USER 与 DISABLED tombstone 受到保护。

播放器只通过 `loadfile <url> replace -1 user-agent=<value>` 传入已验证的 file-local User-Agent；不修改全局 `user-agent` 或 `http-header-fields`。`additionalHeaders` 当前不进入播放器。完整 contract 见 `CD2_DIRECT_URL.md`。

异步播放使用 PlaybackManager request id 与 libmpv monotonic generation 双层保护。新 Play、terminal `PlaybackManager.stop()`、NextTrack、libmpv Stop 和 destroy 会使旧请求失效；新 Play 内部为换项执行的 previous-player stop 不额外失效新请求。active unary call 会被取消，每个异步阶段、`currentSrc` 修改和最终 `loadfile` 前均检查 generation。连接准备最多 200ms，Find 最多 350ms，download URL 最多 300ms，并共享 750ms absolute budget。任何非 Abort transport reject、timeout、RPC、mapping 或 response validation 失败都继续 Mount → native；Abort 和 superseded 向上终止，late response 不能加载旧 source 或触发旧 PlaybackManager error recovery。

`vendor/` 保留已校验的输入说明与文件清单，解包 runtime 不进版本控制；`src/electronapp/` 是可维护应用层；`tools/` 负责本地构建与验证；`installer/` 只负责安装。普通 tracked `src/electronapp` 文件由固定 `sourceCommit` 的 Git tree 枚举，并以原始 blob bytes 写入 runtime；working tree、index、CRLF/LF checkout policy 和 ignored `src/electronapp/www` 都不是这层输入。`apiclient.js`、`toast.css` 由 manifest 锁定的综合补丁 payload 生成，`app.js` 由固定 Carnival base 执行 tracked canonical transform；三者都校验 base/input/generator/output SHA256。`src/electronapp/preload.js` 由 `tools/prepare-preload.cjs` 从 Carnival preload 生成，是 ignored prepared workspace artifact，不是普通 Git blob source。`source-provenance.json` 记录 vendor/archive、Web、Electron、Pepper bridge、libmpv 和 production dependency closure，`runtime-provenance.json` 记录 commit blob/prepared/overlay 到 runtime 的关系，`build-manifest.json` 只枚举最终 payload；三层语义不得互换。该构建治理不改变 Pepper 创建、播放、停止或 Session 生命周期。

正式安装入口直接启动 `{app}\Emby.Theater.exe`。Electron main process 在创建窗口前执行幂等 bootstrap，按 `{runtime}\config\system.xml` 作为 seed，只补齐 Enhanced profile 的 `config`、`cec-driver`、缺失 `system.xml` 和 `cancel`，不覆盖用户文件、不改变 `ProgramDataPath`，也不启动外部进程。

正式 ETE 的 Device identity 在 main process 启动时从 bootstrap 返回的 ETE `config` 目录读取或创建 `device-identity.json`。文件只保存 version 和随机 UUID；缺失或损坏时安全重建，升级沿用已有值，clean profile 生成新值。`deviceName` 继续使用 `os.hostname()`，`deviceId` 不再使用 hostname，也不依赖 app name、版本、服务器、用户或 token。`loadStartInfo` 将同一个持久化 DeviceId 交给 apphost、ConnectionManager、HTTP ApiClient、WebSocket 和播放报告；旧 hostname DeviceId 不迁移、不自动删除服务器 Device/Session。
