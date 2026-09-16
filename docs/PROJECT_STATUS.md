# 项目状态

## 2026-09-16 — Phase 2B native event attribution / framed-pipe gate

基于 `c5dcc0f` 在独立 worktree/branch `spike/helper-native-pipe-integration` 完成真实 Windows native helper、真实 bundled libmpv 与 private inherited stdin/stdout pipe 验证。协议 version 1 使用 uint32 little-endian length + strict UTF-8 JSON，保留 `helperInstanceId + generationId + requestId` 最小 identity；stderr 独立持续 drain，native writer queue 有界并对高频 property coalesce。

实际 mpv header/runtime 证明 `START_FILE` 与 `END_FILE` 带 `playlist_entry_id`，property event 可用 observer `reply_userdata` 归属 generation；`FILE_LOADED` 没有 direct identity，因此只在恰有一个 open mapped playlist entry 时接受，其他情况 fail closed。最终 timeline 1061 条，accepted stale=0、`DROP_STALE_GENERATION`=52、`DROP_UNATTRIBUTED`=4；rapid A→B、A→B→C、Stop during load、access-violation crash 均 20/20 PASS，确定性 queued A/B/C supersession 仅 C 进入 START_FILE。parent death 后 helper 因 pipe EOF 有界退出，residual=0。20,000 property burst 下 output queue 峰值 8 frames/2,312 bytes、coalesce 19,723 次；decoded inbound queue overflow 也 fail closed；1 MiB stderr 全部 drain。

Gate 结论为 **PASS**，B architecture 升为 **PRODUCTION ARCHITECTURE CANDIDATE**，不是 production ready。下一步仅建议 Electron 18 first 的 production bridge adapter review；本轮未修改 `src/**`、PlaybackManager、Session、Resolver、WebSocket、版本、依赖、runtime 或 installer，也未进行 Emby/UI/mixed-DPI 验收。完整结论见 `docs/HELPER-NATIVE-PIPE-INTEGRATION.md`。

## 2026-09-16 — Helper IPC lifecycle / generation safety spike

基于 `add2c32` 创建独立分支 `spike/helper-ipc-lifecycle-contract`，保留 Phase 2 bridge 与 helper composition research，不带入后续 mixed-DPI 提交。新增纯 JS research model、fake helper、controlled scheduler、length-prefixed framing decoder、27 项 deterministic fault injection 与机器可读 evidence；没有导入 production player，也没有运行 GUI、真实 Emby、真实媒体或真实 libmpv。

结论为 **YES WITH CONDITIONS**。最小 wire identity 是 `helperInstanceId + generationId + requestId`；独占 transport 与 helper-per-recreate identity 前提下不需要 wire-level `playerInstanceId`，controller identity 保留为 adapter-local token。absolute deadline、cancel、generation retirement、helper crash、helper recreate、helper-id reuse rejection、transport write failure、late response/event/application callback、A→B→C、NextTrack、Stop、destroy/recreate、strict framing/receive buffer/helper-death wiring 与 bounded storm 全部通过；必测 matrix 精确覆盖，36/36 cases 与 INV-01..INV-12 为 PASS。

研究 contract 保持 existing command/set submission-only semantics，`play()` 仍由 current-generation playback observation 完成；identity 不暴露给 PlaybackManager/Session。production framing/serialization、native event generation attribution、real pipe backpressure、parent-death cleanup、真实 libmpv ordering 与完整 Emby integration 仍未建立。本轮未修改 `src/**`、PlaybackManager、Session、Resolver、WebSocket、版本、依赖、runtime 或安装器。

## 2026-09-16 — Phase 2A helper composition/input/DPI gate

最终 run-11 证据已完成并分别复核机器状态与截图，Gate 为 **CONDITIONAL PASS**，B 继续保持 **RESEARCH DIRECTION**，尚未成为生产架构。helper-owned D3D11 video 与 parent-owned transparent HTML overlay 在最终 desktop BitBlt captures 中实际合成；`playing-overlay-visible`、`overlay-visible-again`、`resized`、`maximized`、`restore-after-minimize`、`fullscreen`、`fullscreen-exit`、`monitor-0`、`monitor-1`、`secondary-fullscreen`、`after-crash-reload` 均显示生成式 SDR test frame 与 HTML OSD，`overlay-hidden` 显示实际视频且无 OSD。button/slider/mousemove/hover/click-through、Space/Left/Right/Enter/Esc、focus、Alt-Tab、resize、maximize/restore、minimize/restore、fullscreen enter/exit、same-DPI monitor transition 和 helper lifecycle 均通过。

Telemetry 保持 B 的 `current-vo=gpu-next`、`gpu-api=d3d11`、`gpu-context=d3d11`、`hwdec-current=d3d11va`；security sandbox/contextIsolation/nodeIntegration baseline 通过。故意的 helper access violation `0xC0000005` 后 main/renderer/overlay 存活，helper recreate 与 video reload 通过。两真实显示器均为 Electron `scaleFactor=1.5`、native DPI `144`，因此 single-DPI 与 same-DPI monitor transition PASS；REAL MIXED-DPI 及 INPUT ALIGNMENT AFTER DPI CHANGE 为 BLOCKED，不能把 API 模拟算 PASS。短样本仅观察到 button `46.26ms`、slider `21.79ms`，CPU 有噪声，不下性能结论。

早期被遮挡/PrintWindow 黑屏属于 **CAPTURE LIMITATION**；最终 run-11 desktop BitBlt 已取得全部请求状态。无结构性 compositor blocker，不做 DirectComposition。产品 PlaybackManager、Resolver、Session、WebSocket、UI、依赖、版本、正式 runtime、安装器和服务器均未改；完整分层证据见 [helper composition gate](HELPER-COMPOSITION-GATE.md)。

## 2026-09-16 — Phase 2 bridge modernization spike

基于正式 `73eac9f` / `v0.1.1` 的独立分支完成 [bridge contract](BRIDGE_CONTRACT.md) 与 [研究 ADR](ADR-BRIDGE-MODERNIZATION.md)。两个 Windows x64 原型均实际编译并在 Electron 18.3.15 加载、控制播放和销毁重建。B helper 保留 `gpu-next/d3d11/d3d11va`，实际窗口画面、resize、最小化恢复、全屏进出和 `0xC0000005` native crash 隔离/重建通过。A 使用 OpenGL render API 和 `d3d11va-copy`，软件 Chromium UI 合成下画面通过；默认 GPU UI 下 PrintWindow 未取得视频，保持 PARTIAL。

研究建议为 **B / MEDIUM，待架构批准**。两个 child HWND 原型均未解决既有 HTML OSD 合成；下一步先做 composition/input feasibility gate，不立即接入 Emby。证据仅为真实 Windows 上的隔离合成媒体原型，不代表 REAL Emby/Session/WebSocket 验收。生产播放代码、UI、依赖、版本、正式 provenance 和打包流程均未修改；native 输出仅在 ignored 实验目录。修改前后现有测试均 152/152 通过。完整矩阵和未覆盖项见 ADR。

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
