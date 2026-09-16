# Helper native event attribution and framed-pipe integration

状态：Phase 2B real native gate 已通过；B architecture 可进入 production architecture candidate review，但不是 production ready。本轮没有实现或批准 production adapter。

## Real helper topology

验证拓扑为：

```text
Node parent test controller
  -> private inherited stdin pipe
native Windows helper executable
  -> real bundled libmpv
  -> private inherited stdout pipe
Node parent test controller

native helper stderr -> separately drained bounded diagnostic ring
```

helper 为本轮编译的 x64 C++ research executable，动态加载项目 Phase 2 prototype 已使用的 `mpv-1.dll`。没有启动 Electron、Emby、PlaybackManager、Session、Resolver、WebSocket 或真实用户媒体。测试媒体是 Node 标准库生成的 2 秒 48 kHz mono PCM WAV：A=440 Hz、B=660 Hz、C=880 Hz。

完整 provenance 见 `experiments/helper-native-pipe/evidence/runtime-provenance.json`。本轮 DLL 为 `v0.41.0-920-gdd5d17d32`，libmpv client API `2.5`，SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。

## Transport and framing

协议版本为 `1`。每个 frame 为 4-byte little-endian payload length 加严格 UTF-8 JSON payload。decoder 支持 incremental partial header/payload 与一次 read 中的多个 frame，不依赖 write/read 边界或换行。

研究参数：

- `MAX_FRAME_BYTES = 65536`
- `MAX_RECEIVE_BUFFER = 131072`
- `MAX_INBOUND_FRAMES = 128`
- `MAX_INBOUND_BYTES = 262144`
- `MAX_PENDING_FRAMES = 128`
- `MAX_PENDING_BYTES = 262144`

zero-length、oversized、invalid UTF-8、malformed JSON、未知 protocol version/type，以及缺少/非法 required identity 的 frame 都使连接 fail closed。parent 对 helper steady-state response/event 使用同一 strict validator；专门注入的缺少 `protocolVersion` helper response 被拒绝。decoded inbound queue 超过 frame/byte 上限同样终止连接。pending request 只进入一次 `HELPER_DIED` 终态。协议与 stderr 分离；没有 TCP、HTTP、WebSocket、public named pipe 或 renderer raw transport。

## Exact libmpv identity evidence

实际 pinned `client.h` 与 DLL export/runtime probe 确认：

- `mpv_event` 提供 `event_id`、`error`、`reply_userdata` 和 `data`。
- `mpv_event_start_file` 提供 `int64_t playlist_entry_id`。
- `mpv_event_end_file` 提供与对应 start 相同语义的 `int64_t playlist_entry_id`。
- `MPV_EVENT_FILE_LOADED` 没有独立 event payload/media id。
- `mpv_command_async` 的 `COMMAND_REPLY.reply_userdata` 只关联 async command completion。
- `mpv_observe_property` 的 token 通过 `PROPERTY_CHANGE.reply_userdata` 原样回传；实际 DLL probe 和本轮 runtime 均观察到该行为。

因此不能只用 load command reply 推断 file-loaded/playing，也不能在收到 event 时填入 current generation。

## Event attribution mechanism

native helper 使用以下有证据的 attribution state machine：

1. parent 创建 monotonic `generationId`，发送带 request tuple 的 load request。
2. helper 在尚未取得 native media id 时只允许一个 unbound load candidate，后续 load 暂存在 FIFO，而不是与同一个 `START_FILE` 竞争。
3. `START_FILE.playlist_entry_id` 把该 candidate 绑定为 `generationId <-> playlist_entry_id`，然后才创建该 generation 的 property observers。
4. `END_FILE.playlist_entry_id` 直接查同一映射。
5. `FILE_LOADED` 仅在 native state 中恰有一个 open mapped playlist entry 时接受；0 个或多个都 `DROP_UNATTRIBUTED`，不猜 current generation。
6. `path`、`duration`、`pause`、`time-pos` 与 `core-idle` 使用 per-generation observer token；token 映射回 generation，再由 parent 检查其是否仍 authoritative。
7. `core-idle=false` 只有在该 event 的 generation 仍 current 时才能更新 playing/core-playing state。
8. END_FILE 后回收 playlist/generation mapping 与 quarantine；property observer token 在 generation replacement 时 unobserve/erase。open media、quarantine identity 和 decoded inbound queue 都有总量上限，越界 fail closed。

这使 native identity attribution 与 parent authority check 分层：helper 说明 event 属于谁，parent 决定该 owner 是否仍能作用于当前 state。

## Generation lifecycle

开始 B 前先 retire A；开始 C 前先 retire B。retirement 立即把该 generation 的 pending media request 终结为 `GENERATION_RETIRED`，并使后续 response/event/load/property/idle/end 只能记录为 stale drop。Stop retire active generation 并将 current generation 置空，旧 `file-loaded`、`core-idle=false` 或其他 property 不能重新建立 playing state。

真实 run 共记录 1061 条 timeline action；没有任何 generation 与当时 authoritative generation 不一致的 event 被 `ACCEPT`，52 条旧 generation event 被明确 `DROP_STALE_GENERATION`，4 条在安全回收后失去唯一 mapping 的 event 被 `DROP_UNATTRIBUTED`。rapid A->B、rapid A->B->C 与 Stop during load 均为 20/20 PASS。额外用 main-thread blocker 确定性积压 A/B/C：retire command 在 native submission 前淘汰 queued A/B，只有 C 产生 START_FILE，queued old start=0。

因果边界需要准确表述：Play A 在它仍是 current 时已经提交给 libmpv，后续 Play B 不可能反向证明 A 从未开始 load。本 gate 证明的是 B retirement boundary 之后，A 不会再次提交 load、成为 current、改变 B/C path/playing state 或 Stop 后复活。若 A 尚停留在 resolver/adapter await 阶段，上一阶段 generation check 要求在发送 native load 前丢弃它，因此 late resolver completion 不会进入 helper。

## Request lifecycle

parent registry 使用：

```text
CREATED -> SENT -> RESOLVED
                -> TIMED_OUT
                -> CANCELLED
                -> HELPER_DIED
                -> GENERATION_RETIRED
```

timeout 是 parent monotonic absolute deadline，不由 activity 或 partial frame 续期。terminal transition 会先从 registry 删除并清 timer，再 settle Promise 和记录 `terminalTransitions=1`。late/duplicate/unknown response 只记录 `DROP_UNKNOWN_OR_TERMINAL_REQUEST`。真实 pipe 验证了 `TIMED_OUT`、`CANCELLED`、normal exit、access violation、pipe close 与 partial-frame crash 下的 exactly-once terminal outcome。

## Helper crash, recreate, and parent death

20 次真实 access violation crash 都由 Node parent 捕获；parent 未崩溃，pending request 均只以 `HELPER_DIED` 终结一次。recreate 分配全新 `helperInstanceId`，新 helper 可初始化并加载 C；旧 helper transport/message 不能更新新 controller state。

normal explicit exit、parent write-side close、parent read-side close、write to closed peer、partial frame then crash，以及 stdout/stderr/process exit/close callback 的实际顺序都被记录。parent 的 stdin/stdout error/end/close 本身就原子终结 pending registry，不再依赖随后 process exit；terminal 后的新 request 立即 `HELPER_DIED`，后续 stdout bytes/event 全部 drop，后续 exit callback 保持幂等。spawn error 也关闭 active registry 并 resolve exit lifecycle。supervisor 强制终止 parent-under-test 后，helper 从继承 pipe EOF 在 5 秒 deadline 内退出，residual helper process 为 0；无需 localhost listener 或公共 endpoint。

## Writer queue and stderr drain

helper writer queue 将 response、error 和 lifecycle boundary 作为 critical frame；同 helper/generation/property 的高频 property event 可 coalesce。critical frame 不被 property pressure 丢弃；如果 critical frame 本身无法在有界预算内排队，helper fail closed，而不是无限分配。

slow-reader stress 同时发出 20,000 条 property event、1 MiB stderr 与 protocol request。结果为 19,723 次 coalescing，output queue 峰值 8 frames / 2,312 bytes，低于 128 frames / 262,144 bytes；request 正常完成，没有 deadlock、corruption 或 starvation。另用 main-thread blocker 自动填满 decoded inbound queue，超过 128 frames 后连接以 `inbound-queue-limit` fail closed。stderr 观察到完整 1,048,576 bytes，parent bounded retention 为 57,344 bytes，低于 65,536-byte limit。

## Upper API compatibility

未来 adapter 可以继续向 `src/electronapp/plugins/libmpv.js` 上层提供现有概念：

| Upper concept | Adapter mapping |
|---|---|
| `sendCommand` | low-latency IPC submission; optional internal async command reply is not playback completion |
| `setProperty` | generation-scoped command submission followed by attributed property observation |
| `getProperty` | request/response tuple with absolute timeout |
| property events | attributed observer token, then current-generation filter |
| `core-playing` | only current generation `core-idle=false` may synthesize it |
| `core-idle` | current generation only; stale idle/end cannot affect the new media |
| `destroy` | retire generation, terminate pending registry, close transport, reject later old-helper traffic |

`helperInstanceId`、`generationId`、`requestId` 全部停留在 bridge adapter 以下。PlaybackManager、Item、MediaSourceId、PlaySessionId、Session、progress reporting、remote control 与 Resolver contract 不需要改变。STRM enhancement 仍然只改变最终 source，不改变播放器 ownership。

## Failure modes

- native identity 缺失或 mapping ambiguous：`DROP_UNATTRIBUTED`，不猜 current generation。
- wrong helper/generation/request tuple：drop，不 mutate state。
- malformed frame/schema/version：connection fail closed，pending request 进入 `HELPER_DIED`。
- helper crash/EOF：该 helper 的所有 pending request exactly once 终结。
- parent death：helper 从 private pipe EOF 退出。
- output pressure：property coalesce；critical budget exhaustion fail closed。

## Direct evidence

- 本地 pinned header 的 start/end structs 均有 `playlist_entry_id`；FILE_LOADED 没有 event payload identity。
- 实际 bundled DLL runtime 为 mpv `v0.41.0-920-gdd5d17d32` / client API `2.5`，并成功回传 observer `reply_userdata`。
- 真实 native helper、真实 libmpv、真实 inherited Windows pipes 完成 single/sequential/race/stop/crash/recreate/framing/backpressure/parent-death scenarios。
- event timeline 中 accepted stale = 0；rapid AB、rapid ABC、Stop 和 access-violation crash 各 20/20 PASS。
- helper-origin malformed response 后拼接的 valid current-generation event 仍未被接受；invalid/zero identity、decoded inbound queue overflow 与 spawn failure 均真实 fail closed。transport stream terminal 不依赖 process exit 才终结 pending，并封闭后续 state mutation/request submission。
- parent death 后 residual helper process = 0。

## Inference

- 在保持每个 unbound load 串行绑定，并对 FILE_LOADED ambiguity fail closed 的条件下，现有 mpv API 足以建立 generation-safe adapter。
- upper libmpv-facing concepts 可由 bridge 内部 translation 保持；无需改变 Emby PlaybackManager/Session semantics。
- 因 promotion criteria 全部通过，B architecture 可进入 production architecture candidate review。

## Not established and open questions

- production timeout、queue 与 retention 数值尚未冻结；本轮数值仅为 research parameter。
- 尚未验证 production Electron adapter、native video surface/Window embedding、installer/package 或真实 Emby playback。
- 尚未验证复杂 playlist、多 helper multiplex 或不串行 unbound loads；若未来引入这些行为，必须重新证明唯一 native mapping。
- 已提交给 libmpv 的 current A 无法被未来到达的 Play B 追溯为“从未开始加载”；contract 保证的是 retirement 后旧 A 不再具有 authority。production adapter 仍必须在 resolver completion 与 native load submission 之间复核 generation。
- 本轮没有 benchmark 长时间运行、真实视频解码/GPU 输出或 mixed-DPI；mixed-DPI 是已知独立问题，不属于此 gate。
- 还需 production code review 决定 critical queue exhaustion 的最终 process/error UX，但不能弱化 fail-closed 语义。

## Architecture implication

结论为 PASS：real libmpv events 可以无歧义归属或 fail closed，private inherited pipes 可以保持上一阶段 IPC invariants，helper crash/recreate 与 parent death 可以 fail closed。B architecture status 为 **PRODUCTION ARCHITECTURE CANDIDATE**，不是 production ready。

下一阶段建议仅进行 **Production Bridge Adapter — Electron 18 First**：只替换 Pepper bridge，保持 Electron 18 和既有 PlaybackManager/Session/Resolver/WebSocket semantics，不同时升级 Electron。
