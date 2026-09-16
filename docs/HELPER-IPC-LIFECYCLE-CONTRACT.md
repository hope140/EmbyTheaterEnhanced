# Helper IPC 生命周期与 generation 安全契约

状态：Phase 2 B architecture 的研究结论。尚未批准或实现 production adapter。

## Problem

B architecture 把 libmpv core 与 native video surface 放入独立 helper 后，进程隔离只能保证 helper crash 不直接杀死 Electron。它不会自动解决消息归属。旧 helper、旧媒体 generation、已终止 request 或已销毁 controller 的 response/event 如果被当前实例接收，仍可能造成旧媒体加载、播放状态回滚、Stop 后复活或 B 被 A 的属性污染。

安全目标是：任何属于旧 helper、旧 generation、已取消/超时 request 或旧 controller 的消息，都不能作用于当前播放器实例。

本轮没有修改 `src/**`、production bridge、PlaybackManager、Session、Resolver、WebSocket、progress reporting、remote control、MediaSource identity 或 PlaySessionId。

## Existing contract

静态审计确认：

- `sendCommand` 与 `setProperty` 在 `postMessage` 后立即 resolve，只表示 submission acknowledgement，没有 native success 或 operation completion 语义。
- production `getProperty` 用属性名对应 window event，没有 request id、timeout 或 reject；endpoint 缺失时 Promise 可永久 pending。
- native `ready` / `property_change` 不带 helper、generation、request 或 media identity。`core-idle=false` 被合成为 window-level `core-playing`。
- 现有 libmpv play generation 能保护 JS async chain 与最终 `loadfile` 边界，但不能给未标记的 native event 归因。
- Phase 2 helper prototype 已有本地 request sequence、pending map、4 秒 timeout、exit rejection 和 recreate 时的新 JS Helper 对象；wire response/event 仍没有 helper/generation identity。
- 原型 newline JSON/tab framing 能处理简单 partial/concatenated read，并有局部大小限制；任意 tab/newline、统一 malformed handling、schema identity validation 与完整 backpressure contract 尚未建立。

直接证据矩阵见 `experiments/helper-ipc-contract/evidence/contract-comparison.md`。

## Proposed identity model

最小 wire identity 集合为：

1. `helperInstanceId`：必需。每次 helper spawn 唯一且永不复用，每个 frame 都必须携带。H1 crash 后创建 H2 时形成不可跨越的 transport/process identity boundary。
2. `generationId`：所有 media-scoped command/request/response/event 必需。由 controller 单调分配，helper recreate 后也不归零。Play A 被 Play B 替换后，A 的全部 late traffic 必须 DROP。
3. `requestId`：所有需要 response 的 request/response/error 必需。实际归属是 `(helperInstanceId, generationId, requestId)` tuple。

`playerInstanceId` 在当前契约下不进入 wire。原因是一个 controller 独占一条 private transport，每次 helper recreate 都换 `helperInstanceId`，controller destroy/recreate 还受本地 `controllerInstanceId` token 约束。若未来 multiplex 多个 controller、跨 controller 保留 helper，或 transport 能让 controller lifetime 之外的 frame 重新进入，则必须重新评估并增加 player/controller epoch。

这些 identity 只属于 bridge adapter，不得替代或泄漏为 Emby Item、MediaSourceId、PlaySessionId、Session 或 WebSocket identity。

## Message taxonomy

协议逻辑上分为：

- `COMMAND`：低延迟、无需 response 的提交。Promise 只表示 IPC accepted。
- `REQUEST`：需要 native reply 的 get、初始化、load submission result 或 async query。
- `RESPONSE`：完整回显 helper/generation/request tuple，只能终结对应 request。
- `EVENT`：generation-scoped media event 或 helper-scoped global observation。
- `LIFECYCLE`：helper ready、clean exit、crash 等 helper 生命周期事实。
- `ERROR`：request-scoped typed failure 或 helper-global diagnostic failure。

`helper ready`、有界 stderr diagnostic、helper crash/exit 属于 helper-global，不需要 media generation；但仍必须匹配当前 `helperInstanceId`，且不能修改 media state。`core-idle`、`file-loaded`、`end-file`、`duration`、`path`、`pause`、`time-pos` 必须 generation-scoped。

完整研究 schema 与 validation 规则见 `experiments/helper-ipc-contract/protocol.md`。该 schema 不是冻结的 production serialization。

## Command acknowledgement semantics

三层 guarantee 必须保持分离：

```text
IPC accepted
mpv command submitted
native state / lifecycle observed
```

现有 upper API 真正依赖的是低延迟 submission Promise 与随后 `core-playing`/property events，不需要把所有 command 改为 blocking RPC。普通 set、pause、seek 可继续 submission-only；如果 adapter 需要知道 `mpv_command` 是否接受 `loadfile`，可在内部使用 request/response，但该 response 仍不等于 `file-loaded`、首帧、`core-playing`、Session 开始或 progress accepted。

## Request lifecycle

状态机为：

```text
CREATED -> SENT -> RESOLVED
                -> TIMED_OUT
                -> CANCELLED
                -> HELPER_DIED
                -> GENERATION_RETIRED
                -> CONTROLLER_DESTROYED
```

`SENT` 之后列出的状态均为终态。进入终态时必须原子完成：从 pending registry 移除、清除 timer、记录唯一 terminal reason、resolve/reject exactly once。任何 duplicate、unknown 或 terminal request response 都 DROP，不得再次回调或修改 state。

## Timeout semantics

每个 request 在 controller 创建时获得一个 absolute monotonic deadline。partial frame、diagnostic、无关 response 或 helper activity 均不得续期。deadline 前处理到的合法 response 可以 resolve；deadline 时立即转为 `TIMED_OUT`，之后到达的同 request response 视为 terminal/unknown 并 DROP。

实验使用受控 scheduler 与 `TEST_TIMEOUT_MS=50`，仅用于验证顺序，不是 production timeout 建议。跨进程不能直接比较不同 monotonic clock 的绝对数；production 中 parent deadline 始终权威，helper 只接收 remaining budget 或 cancellation signal。

## Generation lifecycle

Play B 开始时必须先 retire A，再创建 B：

- A 的 pending requests 全部以 `GENERATION_RETIRED` 结束；
- A 的 late response/event/load result 全部 DROP；
- B 获得新的 monotonic `generationId` 和干净 adapter-local state；
- 只有 B identity 可以触发当前 `core-playing`、path、duration、pause、time-pos 等状态变化。

NextTrack 仍由 PlaybackManager queue 触发 normal Play，只在 adapter 内成为 generation transition。Stop retire 当前 generation 并留下“无 active media generation”状态，旧 event 不能 spontaneous reload 或 resurrection。应用异步 callback 在写 current state 前还要用包含 controller/helper/generation 的本地 token 复核。

## Helper lifecycle

helper exit/crash 立即将该 helper 的全部 pending request 终结为 `HELPER_DIED`，清除 active helper/generation，并允许 Electron/controller 保持存活。重建 helper 必须分配 H2，不得复用 H1；generation 继续单调前进。

shared transport 测试已把 C1/H1 的 frame 注入 C2/H2，旧 frame 因 helper identity 不匹配而 DROP。这个模型不替代 production 中的 owned child process、exit/close ordering、Job Object 或 parent-death cleanup 验证。

transport 还维护跨 controller 的 used helper identity registry；C2 再次 claim H1 会在 generation 创建前失败。同步 pipe write failure 立即进入 helper-death 路径，清除全部 helper-bound request 与 timer；production stream 的异步 error/close 必须进入相同路径。

## Fault behavior

确定性 fake helper 支持 delay、reorder、duplicate、drop、malformed、crash、restart、stale event、wrong generation 与 wrong helper identity。当前必测 matrix 精确覆盖，36/36 case PASS，覆盖用户要求的 18 项 fault matrix 及：

- response just before deadline；
- never responds；
- helper-global/event generation split；
- NextTrack late event race；
- critical Play A -> B late completion；
- response 已 resolve 但 application callback 晚于 generation change；
- helper identity reuse 与 transport write failure；
- synchronous response 状态顺序与 scheduled late response；
- response 恰好到达 absolute deadline 的 exclusive-deadline 规则；
- incomplete frame 超过 receive buffer 上限；
- framing failure 关闭 helper boundary、终结 pending 并清除 timer；
- destroy/recreate shared transport；
- partial/concatenated/malformed/oversized framing；
- submission acknowledgement semantics。

全部 `INV-01` 至 `INV-12` PASS。机器可读结果位于 `experiments/helper-ipc-contract/evidence/`。

## Protocol framing

研究模型选择 `uint32be length + UTF-8 JSON`，用于明确验证 partial read、concatenated frames、message-size limit、malformed JSON、invalid UTF-8 与缺失 identity。oversize/malformed/encoding/schema failure 对当前 helper connection fail closed，不尝试扫描不可信字节重新同步；decoder 进入 failed 后不能继续接收。

production serialization 可以继续 JSON，也可以改为 binary structured protocol；必须保留 length-boundary、incremental decode、单 frame 大小限制、总 receive buffer 上限、schema validation 与 connection-fatal malformed policy。

## Backpressure

模型级 event/diagnostic storm 验证：1,000 个 stale events、1,000 个 current property events、1,000 个 oversized helper diagnostics 与 1,000 个 command submissions 后，media state 保持当前 generation、单条 diagnostic 被截断、各类保留记录有界、command path 仍可提交。production 仍需实现并验证：

- 单一有序 writer 和 bounded total outbound queue；
- coalesce 可替换的高频 property，如 `time-pos`；
- response/lifecycle/control 优先于 diagnostic/property storm；
- stderr 独立 drain 到 bounded/rotated sink；
- 遇到 pipe write backpressure 时暂停 producer，不扩张内存。

因此本轮只证明 contract/model 可有界，未做真实 native pipe benchmark。

## Upper API compatibility

现有 `libmpv.js`-facing create/ready、commands、set/get/observe、playing/idle、Stop 与 destroy/recreate 均可由内部 adapter 映射。helper/generation/request identities 无需被 PlaybackManager 或 Session 理解。

保持不变的上层语义：

- Resolver 只改变最终 WHAT is played；
- PlaybackManager 继续拥有 WHO is playing、queue 与 NextTrack；
- Session/PlaySessionId/MediaSource/WebSocket/progress/remote control 不改变；
- `play()` 继续等待当前 generation 的播放状态 observation；
- Stop 与 destroy 继续是上层 lifecycle boundary。

完整 command/property/event inventory 仍以 `docs/BRIDGE_CONTRACT.md` 为准。本轮没有验证真实 libmpv event ordering 或完整 Emby integration，故 compatibility 判定为 conceptual PASS，不是 production acceptance。

## Security boundary

保持 private inherited IPC only：无 localhost listener、public TCP port、named public endpoint、renderer raw helper pipe、shell command forwarding 或 arbitrary filesystem RPC。helper 是 trusted local child，但仍以用户权限运行，不是 sandbox。Electron-to-helper operation/property/source allowlist 仍是必要边界。

## Decision

**YES WITH CONDITIONS**：B helper IPC 可以在不改变 Emby PlaybackManager/Session semantics 的情况下做到 generation-safe 与 crash-safe。

条件是：

1. production adapter 完整实现三项 identity、terminal request registry、absolute deadline、generation retirement 和 helper replacement；
2. 所有 media event 在 helper/adapter 边界获得正确 generation attribution，不能把未标记的 mpv event 猜测为 current；
3. transport framing、queue/backpressure、stderr 和 parent/helper exit ordering 按有界 contract 实现；
4. integration 阶段继续验证 unchanged `libmpv.js` upper contract、真实 mpv event ordering、Stop/NextTrack/destroy 与 Emby Session/remote reporting；
5. architecture approval 之前不接入 production。

## Open questions

- native helper 如何把 mpv event 与发起 load 的 generation 无歧义绑定，特别是 libmpv 自身未回显 application generation 的事件。
- load submission、start-file/file-loaded/core-idle 的具体 production state machine 与 error mapping。
- helper ready/exit 与 pipe close 的 Windows ordering，以及 Electron parent forced death 时的 helper cleanup。
- bounded queue 的实际容量、property coalescing policy 与 native/JS writer priority。
- Unicode、large structured property values、exact numeric representation 与协议 version negotiation。
- production timeout 数值及不同 request class 的预算。

这些问题影响实现和真实验收，不否定本轮 identity/lifecycle 模型的 fail-closed 结果。
