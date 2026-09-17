# Production Native Helper Bridge

状态：`feat/native-helper-bridge` 的 production implementation、Pepper retirement、正式 source-commit runtime build/provenance/package verify 已通过；`Pepper / PPAPI bridge = RETIRED`，`Native Helper = ONLY production bridge`。REAL Emby Native Helper client acceptance 已完成，ordinary media 按完整 inventory 记录为环境 N/A，真实 STRM fallback、CD2、Remote Control、正常 NextTrack、Session/report、getStats、LibraryOptions-aware Resume 与 non-zero start position 均已通过。立即并发重复 Remote NextTrack 已定位为服务器 WebSocket 交付前语义限制，记录为 non-blocking，不构成 Native Helper 或 PlaybackManager production blocker。本文描述当前实现 contract，不把 research branch 的历史 PASS 当作本分支证据。

## 固定边界

Native Helper 是唯一 production mpv endpoint。PlaybackManager 继续拥有 Item、MediaSource、MediaSourceId、PlaySessionId、Session、WebSocket、播放上报、远控与 NextTrack；Resolver 继续只替换最终 source。当前实现没有修改 PlaybackManager、Session、Resolver、Electron、Chromium、Node 或 installer architecture。

默认且唯一 production 模式为 `native-helper`。`ETE_MPV_BRIDGE_MODE=pepper` 不再选择旧 bridge，启动时确定性返回 `legacy-mode-removed`；其它未知 mode 返回 `unsupported-bridge-mode`。helper 失败 fail closed，不自动切换旧 bridge。

## 运行拓扑

```text
Emby Web / libmpv.js
  -> restricted Electron IPC adapter
Electron main native-helper service
  -> private inherited stdin/stdout pipes
ete-mpv-helper.exe
  -> bundled mpv-1.dll
  -> gpu-next / d3d11 / d3d11va
  -> helper-owned WS_CHILD HWND

independent transparent main BrowserWindow
  -> existing Emby HTML UI / OSD / input above video host
```

Electron main 创建一个无边框、无 taskbar、不可聚焦的 video host BrowserWindow。helper 的 child HWND 只附着到该固定 host；现有 main BrowserWindow 保持 UI、OSD、键鼠与焦点 owner。video host 跟随 main 的 move、resize、maximize、restore、fullscreen、minimize 与 show/focus，并在 main 关闭时销毁 helper 和 host。真实 mixed-DPI 仍是既有 deferred coverage，不在本任务修复。

## Upper bridge contract

Renderer endpoint 保留 DOM-like `addEventListener/removeEventListener/postMessage`，并提供内部 typed helpers。现有上层语义映射如下：

- `sendCommand` 仍是 submission-oriented；IPC accepted、libmpv command accepted、media lifecycle 和 `core-playing` 不混用。
- `setProperty` 按原有 key 顺序提交 scalar value；`wid`、`fullscreen`、`vo` 与 `gpu-api` 由 adapter/surface 固定处理，避免破坏 native child HWND 与 `gpu-next/d3d11`。
- 已授权且 schema 合法的同步 command/set-property 被 libmpv 拒绝时，helper 发送 typed nonfatal `operation-error`；它不等于 helper lifecycle failure，不使当前 generation 失效，也不触发 transport close、helper recreate 或 unrelated request rejection。
- `getProperty` 使用 `requestId`、绝对 monotonic deadline、transport close/crash rejection 与 exactly-once terminal state；MPV node map/array/scalar 保持结构化值。
- 12 个现有 observed properties 保持原名与单位；只有当前 generation 的有效 `core-idle=false` 能合成 `core-playing`。
- scalar `'stop'`、seek、cycle pause、external `sub-add`、diagnostic `expand-properties` 和 file-local `user-agent=` load option 均有明确 allowlist。
- delayed external subtitle 与 display-sync pause/resume 额外绑定当前 upper Play request，supersede 后不会操作新媒体。

## Wire protocol

Protocol version 为 `1`。每个 frame 是 `uint32 little-endian payloadLength` 加 UTF-8 JSON。单 frame、receive buffer、decoded inbound queue、native writer frames/bytes 与 parent writer frames/bytes 均有界；invalid UTF-8、malformed JSON、zero/oversized frame、unsupported version/type/identity 与 queue overflow fail closed。

每次 renderer endpoint 分配 adapter-local `endpointId`，每次 helper spawn 分配不可复用的 `helperInstanceId`；每次 logical media 分配单调 `generationId`；所有 response-bearing request 分配 `requestId`。endpoint/generation token 随受限 IPC call 传递，旧 endpoint 的 retire/destroy/command 不能作用于 replacement。这些 identity 只属于 bridge，不替代或暴露为 Emby identity。

`operation-error` 复用 generation event envelope，固定 `fatal=false`，只包含 operation、可选 property、libmpv error code/string；不回传 command arguments 或媒体/鉴权数据。controller 对其 scope、operation、负 error code、message 长度与 fatality 做 schema 校验，只接受 current generation，并保留最多 64 条 operation history。malformed frame/JSON/UTF-8、unsupported version、identity/schema/authorization/invariant failure 仍属于 protocol-fatal。

handshake 必须在 ready 前确认 protocol、helper version、libmpv runtime version/client API、capabilities、queue limits 与 native surface。当前固定 libmpv 为 `mpv v0.41.0-920-gdd5d17d32`，SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`，client API `2.5`。

## Native event attribution

- serialized unbound load 通过 `START_FILE.playlist_entry_id` 绑定 generation。
- `END_FILE.playlist_entry_id` 直接查同一映射；旧 generation event 在 parent authority boundary 丢弃。
- generation-sensitive properties 使用 `mpv_observe_property.reply_userdata` token。
- `FILE_LOADED` 只有 native state 中恰有一个 unique open mapped media identity 时才接受；否则 quarantine/drop，不猜 current generation。
- B 成为 authoritative 后，A 的 event、response、error recovery 与 `core-idle=false` 均不能改变 B。已经在 A authoritative 时提交给 libmpv 的 load 不被错误描述为“从未发生”。

## Crash 与关闭

helper crash/EOF/protocol failure 会原子终止该 helper 的全部 pending request；late response 只记录/drop。下一次合法 Play 可创建 H2，且 H2 identity 与 H1 不同；当前播放停止/报错，不重新启用旧 bridge。Electron parent 被强制终止时，继承 pipe EOF 使 helper 自行退出；当前 production implementation 不需要额外 Job Object。

stderr 持续 drain，只保留有界 tail。Native writer 将 response/error/lifecycle 作为 critical frame，高频 property 按 helper/generation/property key coalesce；critical budget exhaustion fail closed。Parent writer 在 Node stream backpressure 时使用 128 frames / 256 KiB 上限。

## Build 与 provenance

`tools/prepare-native-helper-inputs.ps1` 从 mpv 官方固定 commit `dd5d17d32` 获取 `include/mpv/client.h` 并核对 SHA256 `1acf99ee77c8c2a6f1d1993bd81bbc8a91d27fb5924e80171670e6139a4bd353`。`tools/build-native-helper.ps1` 只从 `sourceCommit` 的 Git blob materialize `native/mpv-helper/ete-mpv-helper.cpp`，不读取 dirty checkout bytes或 research binary。`tools/runtime-exclusions.cjs` 将归档中的旧 bridge input 排除出 Enhanced runtime。

MSYS2 UCRT64 GCC 16.1.0 使用 C++17、static libgcc/libstdc++ 与 `--no-insert-timestamp`。helper 输出到 `electronapp/native-helper/ete-mpv-helper.exe`；`native-helper-provenance.json` 记录 source blob/hash、header、compiler hash/version/flags、libmpv、protocol 与 helper hash/size。`source-provenance.json` 再绑定该 record，最终 build manifest 与 installer 的递归 runtime payload自然包含 helper，不需要重设计安装器。

本轮 retirement runtime `EmbyTheaterEnhanced-0.1.1-pepper-retired-20260917-7e130c4` 已从 retirement code commit 构建，native helper/source/runtime provenance 与 package verify 均通过；payload 为 2135 entries、连同 `build-manifest.json` 实际 2136 files，helper 为 non-testing build，旧 `mpv-win32-x64.node` 不在 runtime。REAL smoke 使用同一 product runtime 完成。

## 当前验证边界

已完成：Node/fake protocol 与 renderer adapter；真实 Electron 18.3.15、真实 production-source helper、真实 libmpv/private pipes/native HWND；`gpu-next/d3d11/d3d11va`；结构化 property；OSD visual/input；resize/maximize/restore/fullscreen/minimize；20 轮 A→B、A→B→C、Stop during load、crash/recreate；parent-death cleanup；framing/backpressure/stderr/pipe-close；DirectUrl file-local UA isolation；603.2 秒连续播放与有界 memory telemetry；test-only operation rejection 下的 same-helper/generation/transport nonfatal regression 与 protocol-fatal negative regression；acceptance application-window ownership regression `7/7`；真实 STRM native fallback 的完整控制链与报告；真实 CD2 hit；LibraryOptions-aware non-zero start/Resume position bridge acceptance；正常单次 Remote NextTrack。立即并发重复 Remote NextTrack 的两个 HTTP 请求均 fulfilled，但 WebSocket delivery 为 `0/2`，因此按 `SERVER_REMOTE_COMMAND_SEMANTICS` 记录为 non-blocking limitation。

未完成：installer install/run、HDR 与真实 mixed-DPI；这些是独立 deferred coverage，不阻止当前 Phase 2 gate。ordinary media 已明确为 `N/A — ENVIRONMENTALLY UNAVAILABLE`。立即并发重复 Remote NextTrack 记录为 `CONCURRENT REMOTE NEXTTRACK = NON-BLOCKING / OUTSIDE ESTABLISHED CLIENT CONTRACT`，不确认 production bug。focused run 的每次 `2` 个 renderer `ReferenceError` 记录为 `NON-BLOCKING FOLLOW-UP`，待后续单独补充 message/stack evidence。当前可以给出 `REAL EMBY CLIENT ACCEPTANCE = PASS`、`NATIVE HELPER PRODUCTION ACCEPTANCE = COMPLETE` 与 `PEPPER RETIREMENT = COMPLETE`。
