# Existing bridge versus proposed helper lifecycle contract

## Directly audited existing behavior

| Area | Existing bridge/prototype | Direct evidence |
|---|---|---|
| command/set acknowledgement | `postMessage` followed by immediate resolved Promise; no native result | `src/electronapp/plugins/libmpv.js:1626-1643` |
| playback start | `play()` waits for window-level `core-playing`; load submission is not playback completion | `src/electronapp/plugins/libmpv.js:708-759` |
| get correlation | property name is the only correlation; no request id, timeout or reject | `src/electronapp/plugins/libmpv.js:1604-1614` |
| native event identity | `ready` / `property_change` carry no helper, generation or request identity | `src/electronapp/plugins/libmpv.js:657-706`; `docs/BRIDGE_CONTRACT.md` payload section |
| JS play ownership | monotonic play generation protects async JS work and final load boundary | `src/electronapp/plugins/libmpv.js:130-202,721-759,894-895,1001-1025` |
| helper request prototype | local integer id, pending map, 4-second timeout and exit rejection | `experiments/bridge-phase2/main.cjs:36-81` |
| helper response/event wire identity | response has `{id,result}`; polled event has native id/name/value only | `experiments/bridge-phase2/native.cpp:250-260,471-490` |
| prototype framing | tab-delimited newline input and newline JSON output | `experiments/bridge-phase2/main.cjs:46-64,69-75`; `experiments/bridge-phase2/native.cpp:477-490` |
| private boundary | inherited stdin/stdout pipes; no listener; native/path stay in main/helper | `experiments/bridge-phase2/README.md` |

The historical weaknesses are therefore confirmed, with one qualification: the Phase 2 helper prototype already has local request ids and a bounded timeout, but the production `libmpv.js` get path does not, and neither protocol has helper/generation identity on the wire.

## Proposed delta

| Gap | Research contract |
|---|---|
| H1/H2 ambiguity | unique `helperInstanceId` on every frame |
| Play A/B ambiguity | controller-monotonic `generationId` on every media-scoped frame |
| response ambiguity | `requestId` plus helper/generation tuple and terminal registry |
| infinite pending get | one absolute controller deadline; no activity-based renewal |
| cancellation/crash/destroy | typed terminal states with exactly-one settle |
| late/duplicate/unknown traffic | validate identity first, then drop with bounded reason |
| helper-global diagnostics | helper scoped and generation-free; cannot mutate media state |
| newline/tab limits | bounded length-prefixed frames with incremental decode |
| diagnostic/event storm | bounded retention, property coalescing requirement and priority for control/response/lifecycle |
| upper-layer exposure | all identities remain inside the bridge adapter |

## Deterministic result

`node experiments/helper-ipc-contract/verify.cjs` currently reports all 36 required cases, exact matrix coverage and all 12 required invariants PASS. This includes rejected helper-id reuse, transport write failure, synchronous response ordering, scheduled late traffic, real load/playing side-effect sinks, receive-buffer exhaustion, strict UTF-8/schema framing failures and framing-failure-to-helper-death cleanup. This is model-level evidence only. No production adapter, native executable, PlaybackManager, Session, Resolver, WebSocket or libmpv playback was exercised or modified.
