# 已确认经验

## 2026-09-23 — File match and mapping boundary are different evidence

- 单组完整路径的 filename 与多层父目录吻合，只能提高“是否对应同一文件”的可信度；将共同 suffix 的第一个目录保留在 prefix 中是候选算法，不是可复用边界证明。旧 Phase 1 pure API 保留作观察证据，Settings admission 另由多样本边界模型决定。
- 手工规则 coverage 必须先于新规则推导。用正式 sourcePrefix 最长前缀选中规则后，按 source 相对路径分别映射至 cloud/mount 并在目标 path kind 下精确比较；否则同一样本会被建议一条更宽、与现有规则重叠的规则。
- 多样本边界取 source/cloud 各自最深非 root 公共父目录，并要求两侧在其下出现目录分叉，且每组相对路径一致。同目录两个文件不能升级边界可信度。CloudDrive2 相对路径必须按 POSIX 大小写校验，即使 source 为 Windows。
- Mount 边界使用 cloud 已确认的同一个 sourcePrefix。可选 Mount 输入不足或不安全时，只拒绝 Mount prefix；已证明的 cloud prefix 仍可进入用户确认草稿。
- `MediaSource.Path` 可以是 POSIX，而当前 Windows 客户端的 Mount 是 drive/UNC。path kind 不必相同；应按 source 提取 relative suffix，再按 mount target 的大小写语义核对，并以现有 `replacePrefix()` 验证完整输出。不能把历史 POSIX→POSIX 的纯推导限制直接套在真实 POSIX→Windows Mount 上。
- 批量 preview 在任何样本、规则草稿、增删样本变化后使旧结果失效。诊断只保留 coverage/file/boundary 枚举和计数，不能把输入路径、规则或 suggestion 放入日志。

## 2026-09-22 — STRM source, cloud and mount identities

- `sourcePrefix` 的“source”指 STRM / Emby 中记录的 `MediaSource.Path`，可能是历史盘符或服务器路径；只有 `mountPrefix` 才表示当前客户端 filesystem 可访问位置。把前者叫“本地路径”会稳定诱导用户填错字段。
- source→cloud 与 source→mount 可以共享 strict parser、segment suffix 和 confidence core，但 target policy 不同：cloud 只接受 absolute POSIX；mount 接受 Windows drive/UNC 互映与 POSIX→POSIX。不能只放宽 cloud candidate 类型。
- optional mount 不能独立决定 rule sourcePrefix。先用 cloud HIGH 固定 sourcePrefix 与 relative suffix，再从 mount full path 末尾验证该 suffix，才能避免两个 longest-suffix 选择不同 anchor 后生成错误 mountPrefix。
- Cloud HIGH 是 rule admission gate；mount 非 HIGH 只丢弃 mountPrefix，不能阻止已经安全的 cloud mapping。UI 必须同时展示两个 confidence，避免把 mount warning 误读为整体失败。
- 草稿身份不能从 `new-rule-*` ID 推断，因为 store 会保留该 ID。draft identity 必须由 SettingsView 内存态维护，并在 load/Save success 后清空。
- EXPLICIT SAVE 必须覆盖 rule 删除、AUTO disable/restore；保留独立 mutation IPC 作为兼容能力，不代表 Settings UI 可以绕过底部 Save。

## 2026-09-22 — User-confirmed mapping draft boundary

- Settings 当前真实 draft 分散在 `this.config` 与 DOM inputs；任何会重绘 rules 的 Add/assistant action 都必须先 `collectConfig()`，否则会丢失用户尚未保存的编辑。
- user-confirmed suggestion 应转换为现有 `USER` rule draft，并继续走原 `SAVE → store.save() → normalizeRule()`；调用 `applyDiscovery()` 会混入 AUTO/tombstone 语义，也会违反“确认后仍需 Save”的边界。
- “确认加入 draft”不等于 durable acceptance。离页自动 Save 会把 preview confirmation 偷换成持久化授权，因此显式 Save contract 必须同时移除 `onPause()` mutation。
- duplicate/conflict 判断只比较 equivalent source prefix 本身；Windows drive/UNC 大小写不敏感，POSIX 大小写敏感。parent/child prefix 是 longest-prefix contract 的合法关系，不能误报冲突。
- preview response 可以向 trusted renderer 返回 canonical prefix 供用户查看，但 diagnostics 必须重新投影到固定 scalar 白名单；不能把完整 result、raw inputs 或 rule body交给 logger。
- 局部 Settings 助手应沿用现有表单结构，使用可见 label、inline status/alert、disabled action 和 44px 操作目标；无需重做页面或导入另一 settings branch。

## 2026-09-22 — Smart path mapping evidence boundary

- longest suffix 不能直接把全部 matched directories 从 prefix 剥掉；保留最靠近 root 的 matched directory 作为 anchor，才能从 `D:\Media\Movies\A\B\movie.mkv` 与 `/115/Movies/A/B/movie.mkv` 得到稳定的 `D:\Media\Movies → /115/Movies`。
- path comparison 必须先分类再逐 segment 执行。Windows drive/UNC 的大小写不敏感不能扩散到 POSIX；UNC 的 server/share 是 root boundary，重复 separator、device namespace、relative/traversal 和 incomplete path 应在评分前拒绝。
- `HIGH` 只描述 pair 内的 suffix evidence，不证明 candidate 来源可信、CD2 目录可见、provider identity 相同或 production route 可自动启用。当前最小 CD2 proto 没有 mount/root/listing/stable ID；exact lookup 不能反向变成 discovery。
- dry-run diagnostic 应只输出 status/confidence/count/reason。现有 path hash 会 lower-case absolute path，不能作为 POSIX case-sensitive inference evidence，也不能替代 raw pair 的 main-process validation。
- matching manual rule 是 authority。Phase 1 suggestion 不应进入 `resolveAsync()`；Phase 2 最早的安全 activation boundary 是用户确认后的 main-process validation，再进入既有 `normalizeRule()` / `applyDiscovery()` 并重启生效。

## 2026-09-21 — Electron 44 freeze root boundary and acceptance evidence

- Electron 44 standard custom-scheme canonicalization can change an existing apphost command URL into a lowercase command token with a trailing slash. The parser must canonicalize the command token while preserving raw `openurl` URL/query bytes and rejecting unknown commands.
- `electronapphost://loaded/` failing the existing loaded chain is the confirmed release root boundary for the Electron 44 video freeze. Do not claim that one statement inside `setWindowState` / `focus` / `hasAppLoaded` / `onLoaded` is independently sufficient when the loaded chain was not isolated at that granularity.
- A 2×2 matrix with identical Electron/Host/Native Helper/mpv identities can distinguish source-revision regressions from Host-entrypoint effects. Here 9168 froze through both entrypoints and 725d passed through both, so no DirectComposition/DWM/activation workaround belongs in the product fix.
- Hidden smoke, mpv telemetry, core-playing, helper readiness and native screenshots from an isolated helper smoke do not satisfy a visible real-media freeze gate. If agent UI automation cannot bind a unique foreground window but the user directly confirms the visible real-media result, record `HUMAN-ASSISTED PASS` and `machine playback log evidence = UNAVAILABLE`; keep crash/residual checks separate and do not fabricate missing playback logs.
- A transport stress `stdout-end` reproduced on Electron 18, the prior Electron 44 candidate and the new Electron 44 candidate is a cross-version harness/environment evidence gap, not sufficient evidence of a source-revision regression. Preserve the failure and its comparison scope; do not redesign Native Helper to force the stress harness green.

## 2026-09-19 — Electron 44 runtime and internal protocol compatibility

- Electron binary replacement must replace and verify the entire `x64/electron` tree. Overwriting only `electron.exe` cannot exclude stale DLL, locale or resource files from the historical runtime.
- Official archive SHA256, extracted canonical tree, `electron.exe`, process versions and final runtime tree are separate identities; provenance must bind all of them while keeping Carnival Electron 18 as historical evidence.
- Electron 44 hidden `webContents.capturePage()` can reject because no display surface exists. Background formal gates should not require a screenshot; visible visual gates remain separate.
- Existing non-special custom schemes used by renderer XHR fail before playback on Electron 44 unless registered before ready with `standard + supportFetchAPI + corsEnabled`. Apply this only to the exact existing XHR schemes and do not add `secure`, `bypassCSP` or Service Worker privileges.
- A swallowed renderer `ProgressEvent` can appear later as `player cannot be null`. Bounded pipeline-stage, helper lifecycle and allowlisted diagnostic events localize the first failure without changing PlaybackManager or playback semantics.
- A formal `ok=false` can still be baseline-matched rather than a new regression. Compare the complete assertion vector on the same machine and keep the historical rapid NextTrack limitation explicit instead of changing product logic to make the harness green.

## 2026-09-17 — Deterministic generation fixture evidence

- `sleep(N)` 不能证明两个异步 Play overlap；timer 恢复可能晚于第一轮 core-playing/Promise settle。只有 listener 已注册、native generation 已建立且 Promise pending 才是可被下一 Play supersede 的确定 gate。
- Promise rejected、generation retired、listener ignored 与 stale event dropped 是不同事实。已 fulfilled Promise 不会因后续 retire 追溯 reject；旧 listener assertion 应观察 remove/callback-after-takeover，controller ownership应观察 stale drop。
- Stop-before-load case 应等待 exact fake CD2 resolve 已进入且 Promise pending，再触发 stop 并观察 matching cancel；复用 full native-generation overlap gate 会等到 source 已加载，反而破坏 late-load prevention 语义。

## 2026-09-17 — Optional diagnostics and generation ownership

- endpoint ready 不等于 playback generation ready。ready diagnostics 若经过异步 property collect，可能在 resolver 等待期间先于 beginGeneration 完成；随后 generic set/command 会合法触发 generation-required，但不能把这个 optional snapshot failure 提升为 playback fatal。
- generation-dependent diagnostic mutation 必须保留 isolation：无 generation 时 skip/unavailable；有 generation 时捕获同一 generation，并在每个 await 后复核。不能把任意 set/command 改成 generation-independent，也不能全局吞掉 stale、transport 或 protocol 错误。
- formal manager.play resolve 不能替代 authoritative core-idle=false。deterministic regression 应同时验证 pre-generation diagnostics、delayed resolver、beginGeneration、load/current generation、core-playing 与 player ownership。

## 2026-09-17 — Formal harness BrowserWindow ownership

- `browser-window-created` 是窗口发现事件，不是 application identity。native-helper surface、overlay 或未来辅助窗口都可能晚于 main 创建；用 first/last/count 或每次覆盖变量会把 application probe 注入错误 renderer。
- formal harness 应先以 exact packaged file document 选 owner，再把 AMD loader 状态作为 assertion。application owner 存活时保持 stable binding，auxiliary 只记录 bounded URL class，绝不注入 pluginManager/pipeline。
- `webContents.executeJavaScript()` 跨 Electron IPC 可能只返回退化 error message。重要注入应带 sourceURL，并在 application renderer 内保留 bounded error/unhandled-rejection、source/line/column 与 pipeline stage evidence。

## 2026-09-17 — Optional Stats property ownership

- `player.getStats()` 的展示字段可能随媒体类型和 libmpv runtime state 不可用；已有 null/省略/default 渲染并不能保护前置 `Promise.all(getProperty)` rejection。optional compatibility 必须在 Stats per-field aggregation 层处理。
- 只允许精确 `property-unavailable` 降级为 null。transport close、helper crash、protocol error、stale generation 与其他未知错误仍必须保持可观察 rejection；不能把 controller 或全局 `getProperty()` 放宽。
- 并发 Stats 请求需要同时记录 property、requestId 与 generationId 才能归因；一次有界、隐私安全的 runtime 副本 instrumentation 足以确认首个 aggregate failure，无需在 production 日志记录媒体 source 或敏感路径。

## 2026-09-17 — Native HWND composition and reproducible helper build

- helper child HWND 必须在专用 video host 内置于 `HWND_TOP`；置底会被该 host 的 Chromium surface 覆盖。HTML OSD 不能依靠同一窗口 CSS z-index，应由独立 transparent BrowserWindow 保持在 video host 上方。
- telemetry 中 `core-idle=false`、gpu-next 或 surface attached 不能代替视觉证据。最终 production source build 同时保留 native property evidence 与实际 screen capture 人工检查。
- data URL 内未编码的 `#` 会被解释为 fragment，使测试 CSS/DOM 截断；UI smoke 必须 encode payload，否则可能把测试夹具缺失误判为 composition failure。
- MinGW PE 默认插入 link timestamp；仅固定 source/flags/compiler 仍不足以 byte-reproduce helper。加入 `-Wl,--no-insert-timestamp` 后两次输出 SHA256 相同。
- 新 BrowserWindow 会改变 `window-all-closed` 条件。video host 必须绑定 main `closed` 并关闭 owned helper/host，否则主窗口关闭后应用可能残留。
- `core-idle` observer 初始可以先回报 `true`；测试 core-playing 必须等待同 generation 的有效 `false`，不能只等待 property name。
- libmpv API 返回负值只说明该次 operation 被拒绝，不能由统一 exception handler 自动升级成 protocol corruption。submission-oriented command 需要独立、typed、generation-scoped、privacy-safe 的 operation diagnostic；真正 schema/identity/version 错误仍单独 fail closed。

1. 本地 SFX 可直接解包为 1009 个文件，未发现加密条目；无须逆向安装器。
2. `electronapp/package.json` 声明 Electron ^9.4.0，但本地 `x64/electron/electron.exe` 文件版本是 18.3.15。运行时版本需要实测，不可从开发依赖推断。
3. 原 `libmpv.js` 在播放时根据 appSettings 设置 hwdec、vo、demuxer-max-bytes 等；mpv.conf 中对应设置可能随后被覆盖。
4. 原桥接 getProperty 在无回复时不会结束；新增诊断必须有超时并移除监听器，不能阻塞播放。
5. Windows 自带 tar 不能解压本包所声明的字典大小；固定 node-unrar-js 2.0.2 解包成功。
6. 隐藏窗口的合成播放器测试未收到 ready；可见窗口能收到 ready/playing 并通过 5 项动作。测试没有画面时不能仅靠延长隐藏窗口等待宣称播放正常。
7. 未登录情况下直接调用已经注册到 PlaybackManager 的插件会触发需要服务器 API client 的回调。合成单元级播放测试应实例化独立插件；真实 Session 测试必须有服务器上下文。
8. Windows native mpv 通过 Known Folder 获取默认配置目录；只改 APPDATA 不会改变该路径。已验证子进程 MPV_HOME 能加载独立配置标记，正式用户配置不需要修改。
9. 900/2048/3072/4096/8192MiB 同 handle 实验确认 native 属性正确、bridge 的数值回传截断到 int32。0.1.1 使用 mpv 文本快照取得准确值，不能用负数加 2^32 的方法修正任意容量。
10. 本地 PlaybackManager fixture 需要提供完整 endpoint 能力；将 HTTP 源错误标为不受支持的 remote 会走 DirectStream 并请求错误的模拟 URL。修正 fixture 后 DirectPlay、消息分派与上报集成通过；未改变产品能力判断。
11. GitHub 上显示 GPL-2.0 的仓库及其 GPL v2 文本本身不足以证明 “or later”；只有明确的版权/许可通知才能扩大该授权。公开派生维护层应保守使用 GPL-2.0-only，并将来源未确认资产留在版本控制之外。
12. 播放与 Session 的当前验收状态必须集中以 `LIVE_ACCEPTANCE.md` 为准；静态审计文档只能描述其证据边界，不能保留与真实验收冲突的旧结论。
13. Alameda 为 `file://` 模块加载相对依赖时不会可靠地为带协议的模块 ID 补 `.js`；新增相对 AMD 依赖应显式写扩展名，并用隔离 runtime 验证实际插件注册。
14. renderer 侧现有安全边界只通过 preload 暴露 `window.fs`，Mount 检查应使用同步 `existsSync` 和有限路径规则，不应引入服务器请求、递归扫描或不确定映射。
15. `embedded.play` 收到的 `options.url` 必须继续是 PlaybackManager 形成的 native source；验证换源结果应检查插件的 `currentSrc` 或最终 `loadfile`，不能把原始播放上下文误当成已替换 source。
16. Electron runtime 夹具必须串行启动并单独核对进程；UI 启动超时、插件加载失败和实际媒体播放失败要分别记录，不能用其中一项替代另外两项证据。
17. Resolver 的规则优先级必须在每条规则完成候选生成后立即检查存在性；低优先级 URL 解析失败不能回溯覆盖已经命中的 sidecar 或本地 sourcePath。
18. 文件扩展名是播放安全边界的一部分；第一版应维护明确的音视频 allowlist，接受少量漏命中，避免把 `.txt`、`.nfo`、图片等文件交给播放器。
19. 真实 smoke 应把 sourcePath 形态、实际 PlayMethod 和最终 source 类型分开记录；当前服务器没有自然 Mount 映射时，必须明确记录 real Emby Mount hit pending，并把 native fallback 作为独立通过项。
20. 真实验收只需在隔离输出中保留脱敏的状态枚举和报告计数；服务器地址、账号、认证材料、媒体路径与 Item 标识不应进入仓库或公开 evidence。
21. ETLP beta 的 CloudDrive2 控制/文件查询使用 gRPC，HTTP 主要承载 CD2 下载 URL 和 ETLP 本地 gateway；不能把 HTTP 管理端口误认为已存在 REST 文件解析 API。
22. CloudDrive2 proto source version 与运行时 API version 可能错位；本机 proto 1.0.13 与 runtime 1.0.15 的基础只读 RPC 兼容，但实现前仍需固定版本和字段兼容策略。
23. ETLP 的 Windows 本地路径进入 CD2 查询前必须经过明确 `path_map`；配置存在不代表命中，local prefix 与实际挂载路径的 mapping hit 需要单独实测。
24. 本机 CD2 样本返回的同源 HTTP URL 自带 query 鉴权并支持 byte Range，但这不能推导所有 provider 都不需要 `User-Agent`、Cookie、Referer 或其他动态 headers。
25. 115 开启 Support Direct Link 后，真实 `get_direct_url=true` 响应会返回外部 HTTPS `directUrl`、专用 `userAgent` 和分钟级 `expiresIn`；裸 Range 为 403，携带该 User-Agent 才稳定为 206，因此不能把“有 directUrl”直接等同于可安全播放。
26. 当前 Pepper bridge 的 command 路径会把每个参数转为字符串后调用 `mpv_command`，不能传 `MPV_FORMAT_NODE_MAP`。mpv 0.41 的 `loadfile ... -1 <options>` 可以承载 file-local 选项并在文件结束后恢复，但任意 header 的字符串编码和 bridge 实机行为必须单独验收，不能改全局 User-Agent 后立即清理。
27. 同步 Mount Resolver 改成异步 CD2 lookup 后，deadline 只能限制资源占用，不能阻止 late response 覆盖新播放。PlaybackManager 请求、libmpv `loadfile`、NextTrack 与 Stop 必须共享 generation/request id，并在每个 await 后和最终 `loadfile` 前复核。
28. `@grpc/grpc-js` 可在当前 Electron 18.3.15 内置 Node 16.13.2 中以纯 JavaScript 完成带 Bearer metadata 和 deadline 的真实只读 RPC；`grpc-web` 使用不同 wire protocol，直连原生 CD2 gRPC 仍需要代理，不适合作为本项目 V1 transport。
29. grpc/proto 的首次同步 require 与 schema 解析可能接近 1 秒，JavaScript timer 无法抢占这段冷加载；CD2 enabled 时应在 main 启动阶段预加载 transport，让 750ms playback budget 只承担 readiness 与 RPC。
30. 仅在 libmpv 拒绝旧 generation 还不够：旧 PlaybackManager 请求可能在到达 `player.play` 前先停止新播放器。request id 必须在 PlaybackManager 的 preplay、bitrate、device profile、PlaybackInfo 和最终 player 调用边界复核。
31. CloudDrive2 drive-letter mount point 可能返回 `X:`；作为绝对 mapping root 使用时必须规范化为 `X:\`。`X:folder` 是当前盘符相对路径，应该继续拒绝。
32. 可见 frozen Electron media fixture 必须串行；并行运行会竞争 Pepper/GPU/窗口资源并产生无关超时。失败后先核对残留进程，再用相同参数串行复跑。
33. “CD2 URL 已成为 currentSrc”只证明 source replacement；没有 `core-playing`、控制和报告证据时，不能写成真实 Enhanced CD2 playback 通过。
34. terminal `PlaybackManager.stop()` 与新 Play 内部 `activePlayer.stop()` 语义不同；只在 terminal API 失效 request sequence，才能关闭 Stop-before-player.play 而不让换集流程自我取消。
35. CD2 transport Promise reject 必须转为 miss 后继续 Mount/Native；只有 Abort/superseded 可以跳过 fallback 并向上终止。
36. 空 cloudPrefix 与显式 `/` 必须区分：前者是缺配置，后者是合法 cloud-root mapping。
37. 真实 Emby 的 Item/MediaSource 路径可能是 absolute POSIX，即使客户端运行在 Windows。单条 mapping 需要按路径风格选择大小写规则，不能把 Windows 平台等同于 Windows source identity。
38. Pepper bridge 当前没有转发 mpv start-file/file-loaded/end-file/log-message；真实媒体验收可直接观察 path/core-playing/core-idle/time-pos，并以 file-format+track-list 推断 file-loaded，但必须标明证据性质。
39. 当前 exact Pepper/mpv 0.41 已实测 `loadfile <url> replace -1 user-agent=<value>` 的 per-file 恢复语义：UA-A → UA-B → same-origin C 无泄漏。这个结论只覆盖严格校验的 User-Agent，不自动扩展到 `http-header-fields` 或任意 additionalHeaders。
40. DirectUrl acquisition 可以复用同一次 `get_direct_url=true` 响应里的 `downloadUrlPath`，但 transport timeout 仍可能需要第二次 same-origin RPC；两者必须共享一个 absolute budget，并为 fallback 保留实际时间，不能串联两个完整 timeout。
41. 真实 DirectUrl 在独立 embedded libmpv 中推进不等于完整 Emby 验收。若 PlaybackManager 在 resolver 日志出现前超时，应把 source acquisition/libmpv 与 Session/WebSocket/controls/reports 分层报告，不能把 PR #2 的 same-origin 全链证据迁移为 PR #4 通过。
42. blocker 修复后不能仅按 runtime 目录名复用旧 frozen 产物；关键 `src/` 文件必须与 verification runtime 做逐文件 hash 校验，确保测试确实覆盖最新预算和 UA fail-closed 逻辑。
43. Acceptance runner 必须保存自己启动的 exact root PID，并用该 PID 的 process tree 做超时清理；进程名快照和全局 `Stop-Process` 会把 ownership 证明与用户已有进程混在一起。无论 harness 是否启动，都要先落 stdout/stderr 和 machine-readable runner report，再解释 acceptance report 是否存在。
44. Readiness observer 只应记录产品事实；`enhancedDiagnostics(..., 'ready')` 才是 Pepper authoritative-ready，native bootstrap ready 只能作为独立观察项。模块解析、阶段超时和成功判定应留在 live acceptance flow，不能在 observer 中复制事件总线或 gate state machine。
45. 真实 acceptance 在 inspect/module 前置阶段阻塞时，只能报告前置阻塞和缺失 gates；runner 已完成或旧分层 media 证据不能替代本次完整 PlaybackManager/Session/controls/reports 验收。单次 run 后遵守停止边界，不用第二次运行掩盖第一次证据。
46. frozen Alameda app startup 会把 `ConnectionManager`、`ApiClient`、`Events` 暴露到 window，而 `playbackManager` 仍应按 canonical module id 单独取得；acceptance flow 应先有界等待 global，再只做一次已确认模块的 require，并分别记录 API client、PlaybackManager 与 Events 的 source/result。三模块 batch callback 不能作为可靠 readiness 证明。
47. acceptance 必须把 runtime provenance 纳入 gate：旧 dist runtime 可能成功创建播放器并完成 native `loadfile`，但没有当前 resolver 代码，不能把 resolver marker missing 归因于产品 flow。resolver 完成日志不能命名为 resolver-enter；embed `postMessage` 覆盖失败时，loadfile 必须标为 observability gap，不能用 manager-play-resolved 替代。
48. acceptance runtime 必须在启动前绑定 source commit、关键文件 hash、resolver directory 和 `resolveAsync` marker；resolver 完成日志应使用 result/decision 语义，loadfile outgoing source 不可观察时应为 unavailable 并从硬 gate 排除。current-main runtime 的 `resolver-result` 通过后，才能把主链结论与 loadfile 观测缺口分开记录。
49. current-main acceptance 只有在 runtime provenance 通过后才具有产品 flow 解释力；`resolver-result` 与 `manager-play-resolved` 均通过且 loadfile unavailable 时，可将主链记为成功，同时保留 loadfile observability gap，不把它升级为产品 regression。
50. acceptance report 的 `completed=true` 与 terminal classification 才能触发 runner 收尾；成功和明确失败都应 `timedOut=false`、`runnerResult=completed`，只有缺少终态报告才进入 deadline timeout。taskkill 后的 child exit code 不能覆盖已确认的 terminal success，owned process residual 才是清理结果的关键证据。
51. runtime provenance 不能只校验少量 sentinel；构建验收应覆盖全部 repo-owned `src/electronapp` 文件和启动 wrapper，并把构建时改写的 package metadata、PlaybackManager overlay 与 vendor/node_modules/Electron/native payload 分开建模。终态收尾还必须在 exact root PID kill 前重新核对 CreationDate；PID 缺失按已退出处理，CreationDate 不同只记录 ownership mismatch，绝不按进程名扩大清理范围。
52. `embed-created` 若来自 acceptance DOM observer，只能命名为 creation observation，不能冒充产品 `createElement()` 调用；要拆分 PlaybackManager 前置等待，必须单独定义边界信号。
53. 当前 Pepper `ready` message 先由产品 embed listener 处理，再同步触发 window `ready` 和 authoritative diagnostics；acceptance listener 后注册时可能出现毫秒级负差值，这属于 listener 顺序与 Date.now 取整，不是真实负耗时。
54. 三次同 commit/runtime 的 readiness 样本如果 `embed→authoritative ready` 稳定而 `play→embed` 波动，应先定位 embed 前置链，不能把长尾直接归因于 PPAPI、DLL 或 resolver。
55. terminal acceptance report 已持久化后 root 自然退出属于可验证收尾路径；runner 可只检查已建立 ownership 的 known descendants，并保持 creation-date 边界，不能把正常 root exit 误报成 harness failure。
56. 当前 Alameda acceptance loader 可能返回 Promise，且 `ConnectionManager.currentApiClient` 可能在 global 初始化后才出现；profile inspect 必须兼容 callback/Promise 和有界等待，失败只能输出安全枚举。
57. Pepper bridge 的行为回归必须模拟 attach 同步窗口内的 immediate ready；仅检查 `addEventListener` 与 `insertBefore` 的文本顺序不足以证明 callback 实际捕获事件。listener ordering 修复应保持 `{once:true}` 和现有 destroy/reuse 生命周期，并用一次有界真实 acceptance 做非性能性质的回归。
58. ignored required source 不能靠开发机残留维持：如果 `src/electronapp/preload.js` 是 vendor-derived 加项目诊断的 prepared artifact，应由 tracked generator 在 prepare/build 中生成，并由 test、runtime provenance 共用同一 contract；缺失时测试必须失败而不是 skip。
59. readiness 证据必须分层：embed raw `ready`、产品 diagnostics callback、sticky/current state、core-playing、视频 PositionTicks、Session NowPlaying 和已接受 report 各自记录；direct marker 缺失但完整播放事实存在时归为 class B observer-only-miss，不能写成 Pepper initialization failure，也不能 silent PASS。
60. run-scoped readiness state 需要 runId、时间边界和 bridge identity；旧 run 的 ready event 即使晚到也不能污染新 run。loadfile 或产品函数调用不可观测时保留 unavailable/observation wording，不用 manager resolved 替代未取得的信号。
61. ignored snapshot 有 vendor fallback 不代表 build 可复现；只要 build 递归复制物理 source 目录，本机残留就仍是隐式输入。source copy 应以 Git tracked path 集合为准，prepared/vendor overlay 单独建模。
62. Windows worktree 的 LF/CRLF filter 会让同一 tracked generator 的物理文件 SHA 不同。正式 provenance 应使用当前 commit 的 canonical Git blob identity，同时验证工作文件除换行外没有偏离 HEAD。
63. source provenance、runtime relation 和 final payload manifest 回答不同问题。前者解释 input/transform/output，中间层验证 repo-owned 与 prepared artifact，后者只枚举最终 file set；把三者混成一份 manifest 会留下 coverage 与递归 hash 歧义。
64. `git ls-files` 只限制 path 集合，不绑定 file bytes；随后从 worktree `Copy-Item` 仍会吸收 dirty 与 checkout filter 结果。固定 commit 的 runtime 必须从 commit tree 取 blob object，并按原始 bytes materialize，同时在 provenance 中记录 commit/mode/object ID/hash。
