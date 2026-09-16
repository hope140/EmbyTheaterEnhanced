# Helper IPC lifecycle protocol model

Status: research contract for the Phase 2 B architecture. This is not a production schema or adapter.

## Safety objective

No response, event or lifecycle message owned by an old helper process, retired media generation, terminal request or destroyed controller may mutate the current player state. The controller validates identity before it interprets payload data. Unknown, malformed, stale and impossible-future messages fail closed and are recorded with a bounded reason.

## Minimal identity set

| Identity | Required | Scope and reason |
|---|---|---|
| `helperInstanceId` | Yes, on every frame | A unique, never-reused value for one helper process/pipe lifetime. It prevents H1 frames from being accepted after H2 starts. The parent creates the value before spawn and binds it to the owned child/transport. |
| `generationId` | Yes, on all media-scoped command/request/response/event frames | A controller-monotonic identity for one logical load/media lifecycle. It is never reset when a helper restarts. Play B retires Play A before B can become current. |
| `requestId` | Yes, on every response-bearing request/response/error | A controller-monotonic correlation key. The authoritative lookup key is the tuple `(helperInstanceId, generationId, requestId)`, even when the registry is indexed by request id. |
| `playerInstanceId` | No on the wire under this contract | The controller exclusively owns one private transport, each helper restart changes `helperInstanceId`, and the local application token includes `controllerInstanceId`. If a future transport multiplexes controllers or can preserve a helper across controller recreation, this decision must be reopened. |

Random UUIDs are suitable helper identities. Generation and request ids may be positive safe integers as long as they never wrap or reset inside the controller lifetime. Identity values are routing/safety metadata, not Emby `Item`, `MediaSourceId`, `PlaySessionId` or Session identity.

## Message taxonomy

The JSON shapes below document the research model, not a frozen production serialization.

### `COMMAND`

Low-latency, no response required. A resolved adapter Promise means only that the local IPC submission was accepted.

```json
{
  "type": "command",
  "helperInstanceId": "H2",
  "generationId": 42,
  "method": "set_property",
  "params": ["pause", true]
}
```

### `REQUEST` / `RESPONSE`

Used only when the adapter needs a native reply, such as `get_property`, helper initialization, native command submission result or an async query. A request has one parent-owned absolute monotonic deadline.

```json
{
  "type": "request",
  "helperInstanceId": "H2",
  "generationId": 42,
  "requestId": 1007,
  "method": "get_property",
  "params": ["pause"]
}
```

```json
{
  "type": "response",
  "helperInstanceId": "H2",
  "generationId": 42,
  "requestId": 1007,
  "result": false
}
```

The research model includes a numeric deadline in outbound evidence. A production protocol must not compare absolute values from unrelated process clocks. The parent deadline remains authoritative; a helper may receive only a remaining budget or a clock-independent cancellation signal.

### `EVENT`

Media events use `scope=generation` and require `generationId`. Examples include `core-idle`, `file-loaded`, `end-file`, `duration`, `path`, `pause` and `time-pos`.

Helper-global observations use `scope=helper` and must omit `generationId`. Examples include bounded stderr diagnostics and helper readiness. A helper-global event may update diagnostics or helper health; it cannot mutate media state.

### `LIFECYCLE`

Carries helper startup, clean exit or crash facts. The parent process exit signal is authoritative for crash/exit even if the helper cannot emit a final frame. Helper death terminates every request bound to that helper.

### `ERROR`

Carries a typed request-scoped failure or a helper-global diagnostic failure. A request-scoped error must repeat the full identity tuple. It terminates that request once; it does not become a media event.

## Command acknowledgement levels

These guarantees are deliberately separate:

1. `IPC accepted`: the parent accepted or wrote the command. This matches the current `sendCommand` / `setProperty` Promise level and stays low latency.
2. `mpv command submitted`: the helper called the native API and returned its submission result. Use `REQUEST` only where the adapter needs this result, including a hardened load submission path.
3. `operation observed`: a generation-scoped property or lifecycle event confirms the resulting native state. Playback start remains the upper `core-playing` observation, not a command response.

The model does not turn all setters, seek operations or control commands into blocking round trips. Existing upper behavior can keep submission-only Promises. A load submission reply is not `file-loaded`, first frame, `core-playing`, Session start or progress acceptance.

## Request lifecycle

```text
CREATED -> SENT -> RESOLVED
                -> TIMED_OUT
                -> CANCELLED
                -> HELPER_DIED
                -> GENERATION_RETIRED
                -> CONTROLLER_DESTROYED
```

Every state after `SENT` in the diagram is terminal. The registry removes the request, clears its timer and performs exactly one resolve or reject transition. A response for a terminal or unknown request id is dropped. Duplicate, reversed and out-of-order responses are harmless because the response must match the complete identity tuple.

Cancellation is terminal even if the helper cannot cancel the underlying native operation. Cancellation limits resource use where possible; identity validation prevents the eventual late result from becoming authoritative.

## Absolute timeout

The controller calculates one absolute monotonic deadline at request creation. Activity, partial input, helper diagnostics and unrelated responses never extend it. A response processed before the deadline resolves once. At the deadline, the request becomes `TIMED_OUT`; every later response is an unknown/terminal request and is dropped.

Production timeout values remain open. The deterministic harness uses `TEST_TIMEOUT_MS=50` only to exercise ordering without wall-clock sleeps.

## Generation lifecycle

Starting Play B performs these actions in order:

1. retire generation A;
2. reject every pending A request as `GENERATION_RETIRED`;
3. allocate the next monotonic generation id;
4. initialize B's adapter-local state;
5. allow B commands and requests.

Stop retires the current generation and leaves no active media generation. Late responses and events cannot reactivate the player. NextTrack is an ordinary generation transition owned by the unchanged PlaybackManager queue logic. Destroy retires all requests and detaches the controller from the transport.

Application callbacks use a local token containing `controllerInstanceId`, `helperInstanceId` and `generationId`. This prevents a resolved result retained by caller code from being applied after controller/helper/generation replacement. The token is adapter-local and is not exposed to Emby upper layers.

## Helper lifecycle

Every helper spawn receives a new `helperInstanceId`. Helper exit or crash:

- terminates all helper-bound requests as `HELPER_DIED`;
- clears the active helper and media generation;
- leaves the Electron/controller process alive;
- requires a fresh helper identity before another generation can start.

H2 may reuse the native window topology, but it must not reuse H1 identity. Generation ids continue monotonically across restart. Old pipe buffers, queued callbacks and intentionally injected H1 messages fail the helper identity check before payload handling.

The parent transport owns a used-identity registry across controller recreation. Attempting to claim H1 twice is a contract violation and fails before a generation can start. A synchronous pipe write failure is treated as helper death: all helper-bound requests terminate immediately and their timers are cleared. An asynchronous stream error/close must enter the same parent-owned helper-death path.

## Framing

The existing prototype's newline JSON plus tab-delimited request input handles simple partial/concatenated reads but cannot safely represent arbitrary tabs/newlines and does not bind schema or identity.

The research model uses:

```text
uint32 big-endian payload length
UTF-8 JSON payload
```

The incremental decoder:

- buffers a partial 4-byte header or payload;
- emits every complete frame when reads are concatenated;
- rejects zero or oversized lengths before allocating a payload;
- enforces a bounded receive buffer;
- validates JSON and required identity fields before dispatch;
- rejects invalid UTF-8 rather than accepting replacement characters;
- treats malformed framing/schema as connection-fatal for that helper identity.

Production serialization may remain JSON or move to a binary structured format. The framing requirements are fixed even if serialization changes. A malformed connection is not resynchronized by scanning attacker-controlled bytes; the helper boundary is closed and pending requests terminate through helper death.

## Backpressure

The experiment proves bounded retention, not native throughput:

- stale events are rejected synchronously and only a bounded diagnostic record ring is retained;
- helper diagnostics use a separate bounded ring and drop oldest records under a storm;
- command submission remains available after 1,000 stale events, 1,000 current property events, 1,000 diagnostics and 1,000 command submissions;
- request and terminal-history retention are bounded in the research controller.

A production helper must additionally use a single ordered writer, cap the total outbound queue and coalesce replaceable high-rate properties such as `time-pos`. Responses, crash/exit lifecycle and command traffic must take priority over coalescible diagnostics. Stderr must be drained independently into a bounded/rotated sink and must never share the response queue. Pipe write backpressure must pause producers rather than growing an unbounded JS/native buffer.

## Security boundary

The allowed transport remains private inherited pipes between the Electron main process and its trusted local child. The protocol adds no localhost listener, public TCP port, named public endpoint, renderer-accessible raw pipe, shell forwarding or arbitrary filesystem RPC. The renderer sees only the existing narrow player adapter surface.

The helper runs with the user's rights and is not a sandbox. Validation and allowlists therefore remain mandatory at the Electron-to-helper boundary. The protocol must not expand the existing command/property surface merely because the child is trusted.

## Upper API mapping

| Existing `libmpv.js` concept | Hardened adapter behavior |
|---|---|
| create / ready | spawn Hn, bind private transport, require typed helper-ready; keep identity internal |
| `sendCommand` | submission-only `COMMAND` by default; optional internal `REQUEST` for native submission errors |
| `setProperty` | ordered command submission; no false operation-complete promise |
| `getProperty` | bounded request with request id and absolute deadline |
| `observeProperty` | helper subscription plus generation-scoped event delivery |
| `core-playing` | current-generation `core-idle=false` only |
| playing / idle / property state | current-generation events only; old generation events drop |
| Stop | retire generation, submit stop if helper is alive, remain stopped despite late traffic |
| destroy / recreate | detach old controller/helper, reject pending work, create new helper identity |

PlaybackManager, Session, Resolver, WebSocket, MediaSource identity, PlaySessionId, progress reporting and remote-control semantics do not need to learn any protocol identity.
