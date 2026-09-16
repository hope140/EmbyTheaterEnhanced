# libmpv bridge logical contract

Status: Phase 2 spike contract extraction; not an approved replacement architecture.

Audited baseline: `73eac9fa64c43804e9c5c53690ed087b2c5bb077` (`v0.1.1`). Line references below refer to that baseline. This is a static audit of the maintained caller and its build inputs, not a new real Emby acceptance result. The two isolated prototypes are evaluated separately in [ADR-BRIDGE-MODERNIZATION](ADR-BRIDGE-MODERNIZATION.md).

## Boundary and evidence

The replacement boundary is the native media endpoint below `src/electronapp/plugins/libmpv.js`. PlaybackManager remains responsible for playback selection, Item/MediaSource/PlaySession identity, queue and NextTrack, reports and remote commands. The resolver still changes only the final source. A bridge replacement must preserve DeviceId, WebSocket behavior, progress units and the configured CD2/Mount/Native ordering; the bridge does not implement any of these policies.

Primary evidence:

- `src/electronapp/plugins/libmpv.js`: maintained player, all normal bridge requests and state consumption.
- `src/electronapp/enhanced/diagnostics.js`: additional direct bridge caller; optional, bounded, fail-open diagnostics.
- `src/electronapp/main.js:800–846,1050–1079`: Pepper registration and BrowserWindow security configuration; `:343,1000–1017` supplies the window handle as a decimal string.
- `tools/prepare-preload.cjs:7–55`: canonical prepared preload generator. Immutable `vendor/carnival/electronapp/preload.js:1–7` exposes `ipcRenderer`, `fs`, temporary directory and app data; it does not translate mpv messages. The generator adds diagnostic collection/readiness observations, not a second playback bridge.
- `tools/patch-playbackmanager.cjs`: canonical request ownership overlay applied to the immutable Web snapshot. `vendor/carnival/electronapp/www/modules/common/playback/playbackmanager.js` was read from the existing local vendor input; it is not a tracked product source or a newly vendored file.

Existing documents read for context: AGENTS, README, ARCHITECTURE, PROJECT_STATUS, DECISIONS, LESSONS_LEARNED, PLAYBACK_PIPELINE, SESSION_CONTROL, LIBMPV_RUNTIME, PACKAGING and TESTING. Older narrative line numbers/budgets are not substituted for current caller code.

The native binary is a Chromium Pepper plugin despite its `.node` suffix (`vendor/runtime-manifest.json:29–30`). Locally available upstream reference C++ implementations were inspected only to understand the transport. Neither source has been established as the exact source of the shipped binary. In particular, the public Kagami reference only converts scalar output nodes, while the MediaBrowser reference also recurses through arrays/maps. Binary behavior and maintained caller expectations take precedence over an assumed upstream implementation.

## Logical API expected by upper layers

The existing private helper names can be retained by a small adapter. They are not public PlaybackManager API changes.

| Operation | Upper expectation | Existing implementation / limitation |
|---|---|---|
| Create | Obtain one app-owned video endpoint; allow commands after ready | `createMediaElement` builds a container/embed and registers listeners before attaching the embed (`libmpv.js:603–650`) |
| Ready | Endpoint is initialized and can accept observation/commands | Once-only window `ready` listener installs the 12 observations, then resolves creation; no initialization timeout or failure reply |
| `sendCommand(data)` | Submit a command with ordered arguments | Immediate resolved Promise after `postMessage`; no native success acknowledgement (`:1637–1642`) |
| `setProperty(props)` | Set each named scalar property in caller order | Sends one message per own key; immediate resolved Promise, no per-property result (`:1626–1634`) |
| `getProperty(name)` | Promise for a native property value | Correlates solely by a window event named after the property; no request id, timeout or rejection (`:1604–1613`) |
| `observeProperty(names)` | Receive subsequent values through property notifications | One subscription per name; immediate resolved Promise, no explicit unobserve (`:1616–1623`) |
| Stop | Stop current playback, invalidate pending Play, retain reusable endpoint unless destruction requested | `stop(false)` posts stop and explicitly emits stopped; `stop(true)` destroys (`:1089–1099`) |
| Destroy | Release the endpoint, prevent canceled Play from loading later; allow later creation | Removes DOM container and clears endpoint reference; no native destruction acknowledgement (`:1400–1421`) |

`play(options)` is the player API above this boundary. It does not resolve merely on command submission: it waits for `core-playing`, checks request ownership again, makes video visible and shows the existing OSD (`:708–759`). Do not change this into “load command accepted means playback started.” Initial cached JS state is volume 100, unmuted, subtitle delay 0, rate 1; paused/currentTime getters otherwise default to false/0 (`:115–121,1045–1058,1120–1122`). Native initial values arrive through observations; these JS defaults do not prove native playback is active.

## Complete normal command call inventory

The following are all `sendCommand` call sites in the maintained player. No direct `commandv`, arbitrary JSON command-map API, native NextTrack or native session command is consumed here.

| Caller | Payload | Semantics to preserve |
|---|---|---|
| `playInternal`, `:1008–1010` | `['loadfile', source]` or `['loadfile', source, 'replace', '-1', 'user-agent=…']` | Source-only replacement; validated file-local UA is an argument, never a global header/property mutation |
| `currentTime(value)`, `:1046–1054` | `['seek', floor(milliseconds/1000) as string, 'absolute', 'exact']` | Upper milliseconds become integral mpv seconds; seek player event follows submission, not native seek completion |
| `seekRelative`, `:1061–1067` | `['seek', floor(offsetMilliseconds/1000) as string, 'relative']` | Used by rewind/fastForward; preserve existing rounding including negative offsets |
| `stop(false)`, `:1096` | Scalar string `'stop'` | Adapter must normalize this existing caller form; successful Promise alone is not native-stop evidence |
| `playPause`, `:1107–1109` | `['cycle', 'pause']` | Toggle current native pause state |
| External subtitle selection, `:1552–1556` | `['sub-add', DeliveryUrl, 'cached', DisplayTitle, Language]` | Deferred 700 ms by current caller; last metadata arguments can be absent |

Diagnostics adds `['expand-properties', 'set', diagnosticSlot, '${=demuxer-max-bytes}']` (`diagnostics.js:358–362`). Preserve or replace this diagnostic capability explicitly when adapting the endpoint; it is not a playback-policy command.

Important uncertainty: inspected upstream C++ references consume command data as an array of strings, whereas the maintained stop call submits a scalar string. This mismatch is not proof that the exact shipped binary ignores stop, nor proof of a scalar-command guarantee. A replacement adapter should accept the actual caller input and emit a valid native `stop` command, with a native-state test.

## Complete property call inventory

Setters ultimately submit scalar string/boolean/number values. Some values intentionally remain strings so mpv parses options (including large cache byte quantities).

| Group | Properties | Code evidence |
|---|---|---|
| Per-play basic setup | `volume`, `audio-display`, `wid`, `keep-open`, `speed`, `sub-delay` | `libmpv.js:939–946` |
| Conditional video/cache setup | `hwdec`, `gpu-api`, `demuxer-max-bytes`, `vo`, `video-output-levels`, `profile`, `video-sync`, `interpolation`, `fullscreen`, `demuxer-readahead-secs`, `sub-font-size`, `sub-back-color`, `sub-color` | `:948–997` |
| Additional setup helpers | `sub-create-cc-track`, `deinterlace`, `audio-delay`, optional `af`, `audio-channels`, optional `audio-spdif`, `ad-lavc-ac3drc`, conditional `audio-exclusive` | `:1424–1498` |
| Post-load setup | `start` (floor ticks/10,000,000 as string), `pause=false` | `:1021–1024` |
| Controls | `pause`, `volume`, `mute` | `:1112–1155` |
| Aspect ratio | `video-unscaled`, `video-aspect`, `panscan` | `:1216–1242` |
| Subtitle/rate controls | `sub-delay`, `speed`, `sid`, `teletext-page` | `:1380–1389,1528–1584` |
| Audio selection | `aid` | `:1587–1601` |
| Optional diagnostics | `user-data/emby-theater-enhanced/diagnostics/cache-bytes` cleared before text snapshot | `diagnostics.js:16,358` |

The conditional `audio-exclusive` branch currently compares `mediaType === 'video'`; this extraction preserves the actual source condition rather than claiming it is active for all video items. This spike does not correct existing settings behavior. `wid` and `fullscreen` are existing native-facing setup requests; their mapping to a new app-owned surface needs an adapter decision, not a new Emby identity or UI policy.

All normal `getProperty` consumers are statistics functions:

- Audio (`:1645–1656`): `audio-codec-name`, `audio-out-params`, `audio-bitrate`, `current-ao`, `audio-out-detected-device`.
- Video (`:1733–1753`): `video-out-params`, `video-codec`, `mpv-version`, `video-bitrate`, `current-vo`, `hwdec-current`, `display-names`, `display-fps`, `estimated-display-fps`, `display-sync-active`, `frame-drop-count`, `decoder-frame-drop-count`, `mistimed-drop-count`, `vo-delayed-frame-count`.
- Media (`:1848–1856`): `chapter`. The commented `media-title` entry is not a consumer.

Diagnostics independently reads (`diagnostics.js:7–14`) `mpv-version`, `libmpv-version`, `mpv-build-date`, `current-vo`, `vo`, `gpu-api`, `gpu-context`, `hwdec`, `hwdec-current`, `scale`, `cscale`, `dscale`, `tscale`, `deband`, `interpolation`, `video-sync`, `target-colorspace-hint`, `target-trc`, `target-prim`, `target-peak`, `tone-mapping`, `gamut-mapping-mode`, `glsl-shaders`, `video-params`, `video-out-params`, `config`, `config-dir`, `sub-font`, `sub-fonts-dir`, `demuxer-max-bytes`, then its cache text slot. It uses endpoint-scoped listeners where possible, installs before sending, times out after 1500 ms by default and always removes its listener (`:320–345`). Diagnostics are not awaited by playback and must remain fail-open.

## Observations and player events

All twelve normal observations are registered together at `libmpv.js:638`. Dispatch is at `:657–706`; state/event handlers are at `:1278–1389`.

| Native property | Consumed value / upper effect |
|---|---|
| `time-pos` | Seconds × 10,000,000 to cached ticks; emit player `timeupdate`; `currentTime()` returns milliseconds |
| `duration` | Seconds × 10,000,000 to cached ticks; duration getter converts to milliseconds |
| `pause` | Store boolean; emit `pause` or `unpause` |
| `volume`, `mute` | Store number/boolean; emit `volumechange` |
| `eof-reached` | Truthy value emits `stopped`; false is ignored |
| `demuxer-cache-state` | Store structured object; `getBufferedRanges` consumes `seekable-ranges` |
| `demuxer-cache-time` | Store raw value; duration fallback currently returns it without the normal tick conversion (`:1078–1085`), an existing unit inconsistency, not an adapter requirement to reinterpret mpv seconds |
| `estimated-vf-fps` | May trigger existing display-refresh adjustment and pause/resume path when enabled |
| `sub-delay` | Seconds × 1000 to cached milliseconds; emit `subtitleoffsetchange` |
| `speed` | Store rate; emit `playbackratechange` |
| `core-idle` | Falsy value dispatches window `core-playing`; satisfies current Play waiter |

Other `property_change` names are dispatched as window `CustomEvent(name, {detail: value})`, which serves stats get replies. The normal wrapper does not dispatch a generic error from native messages. `_onError` exists and emits player `error` (`:1294–1299`), but `message()` never calls it. `play()` can reject from its JS/async chain.

There are no native `start-file`, `file-loaded`, `end-file`, `shutdown`, or `log-message` cases in `message()`. `core-playing` is a JS synthesis from a property, not a native mpv event. A probe may use real native lifecycle events for evidence, but must not present them as already consumed production contract. Likewise a resolved `play()`/`core-idle=false` does not by itself prove first visible frame, hwdec, HDR, server Session or remote-control correctness.

## Lifecycle and request ownership

| Scenario | Current behavior and required preservation |
|---|---|
| First Play A | `beginPlayRequest` synchronously creates monotonic generation and AbortController; show OSD/display-sync/create/ready precede final source setup and load. Wait for core-playing before successful player Play (`:173–202,708–759`) |
| Play B replaces A | New generation aborts A and removes A's core-playing/abort listeners. Every awaited play stage and final currentSrc/load boundary checks ownership (`:150–202,721–759,894–895,1001–1025`). Reuses an existing endpoint/container |
| Terminal Stop | Invalidates request generation, then sends stop or destroys. Explicitly emits `stopped`; cached position is preserved for final reports (`:1045,1089–1099`) |
| NextTrack | PlaybackManager owns the queue and calls normal player Play for the next item. It is not an mpv playlist-next bridge command. Baseline vendor manager `:2293–2304` and maintained overlay preserve this distinction |
| Previous-player stop during new Play | Baseline manager uses `activePlayer.stop(false)` when reusing the same player, otherwise `stop(true)` (`vendor …/playbackmanager.js:884–898`). Overlay invalidates manager sequence only at terminal manager Stop, not this internal replacement step |
| Destroy/recreate | `destroyInternal` invalidates, restores existing transparency/refresh-rate behavior, persists volume, removes container and clears endpoint. A later Play creates a new endpoint (`libmpv.js:1400–1421,603–650`) |
| Window close / app quit | Electron Windows window-all-closed handler quits (`main.js:82–87`). The before-quit callback unregisters app IPC (`:959–964`); it is not a native bridge shutdown handshake. Legacy native lifetime follows embed/process destruction |
| Native initialization/failure | No normal timeout, structured initialization error, crash signal or shutdown acknowledgement exists in this wrapper; absent ready or property response may leave Promise pending |

PlaybackManager's maintained overlay creates `_etePlayRequestId`, checks asynchronous preplay/bitrate/profile/PlaybackInfo boundaries, forwards the id, and suppresses superseded recovery. It is the authoritative tracked source of these changes (`tools/patch-playbackmanager.cjs:18–127`). This is separate from bridge transport request correlation.

## Payload and transport compatibility

Legacy outgoing messages are JS objects sent directly by DOM `postMessage`, not JSON strings:

```javascript
{type: 'command', data: ['loadfile', source]}
{type: 'set_property', data: {name: 'pause', value: true}}
{type: 'get_property_async', data: 'time-pos'}
{type: 'observe_property', data: 'pause'}
```

Incoming events consumed by the wrapper are `{type:'ready', data:…}` and `{type:'property_change', data:{name,value}}` in `event.data`. Neither carries generation, media identity, request id, error code or command acknowledgement. A helper may use framed JSON internally; that serialization is an implementation choice below the logical API.

String, boolean, number, null/unavailable and structured object/array property values matter. Statistics inspect `audio-out-params`/`video-out-params`, and buffering reads an array inside `demuxer-cache-state`; a scalar-only replacement is insufficient for full caller compatibility. Do not JSON-stringify structured values into strings at the logical boundary. Command arguments remain an ordered string vector; map-style `mpv_command_node` and arbitrary request headers are not current product capabilities.

The shipped legacy transport's integer truncation is established by the historical same-handle 900/2048/3072/4096/8192 MiB test documented in `LIBMPV_RUNTIME.md:35–43`: raw results wrap at 32 bits while native textual values are correct. That defect must not become the replacement logical contract. Preserve exact values within JS safe-integer range and define an explicit lossless representation beyond it before expanding the API; do not guess by adding 2^32 to negative numbers. Current diagnostics already checks numeric text with `Number.isSafeInteger` (`diagnostics.js:363–371`). HWND is supplied as a decimal string, not an imprecise JS number.

## Compatibility gaps to close in a future adapter

The following are existing limitations or migration requirements, not guarantees made by legacy Pepper and not product fixes implemented in this spike:

1. Ready and core-playing are window-level events without endpoint/media identity. Current Play generation checks prevent superseded JS work from finishing, but cannot establish which native load produced an untagged late property notification. A new endpoint must scope callbacks and pending requests to its own lifetime; native event/media association needs an explicit integration design.
2. `getProperty` sends before installing its listener, has no timeout, and correlates only by property name. Concurrent same-property queries can resolve from the same response; a query of one of the twelve special-cased observed names would not receive the default name event. Current stats query list avoids those names. New native replies must settle deterministically and not leak pending callbacks after destroy/native failure.
3. `observeProperty`, `setProperty` and `sendCommand` silently resolve with no endpoint. Their Promise settlement is not proof of native effect. New command acknowledgements may be retained internally, but must not silently move the existing upper playback-start or seek-reporting boundary.
4. Pending readiness is not canceled by DOM destruction; the old once-only global listener can remain. The delayed external `sub-add` and display-refresh pause/resume path are not protected by the Play generation (`:1346–1366,1552–1556`). A transport epoch alone cannot identify an old logical subtitle command sent later to a reused endpoint. These require narrowly reviewed caller/adapter ownership work during integration.
5. `_onCoreIdleUpdate` treats any falsy value as active, and other cached state persists across stop/destroy. A new adapter must distinguish unsupported/error results from valid false without inventing playback success. Initialization/native failures need an explicit error and cleanup path rather than hanging callers.
6. An explicit stop plus later truthy EOF can both emit stopped; the transport cannot assume exactly-once stop completion from these events. The Emby lifecycle remains upstream and must be regression-tested before integration.

## Surface and security assumptions above the bridge

The legacy DOM container is fixed to the viewport and embed fills it (`plugins/libmpv.css:1–16`). Existing player code controls opacity, backdrop/OSD transparency and Windows native-VO behavior (`libmpv.js:740–748,1028–1041`); Native `wid` gets Electron's window handle. A replacement must provide app-owned rendering and preserve HTML controls/subtitles/focus expectations, but no specific HWND, GPU context or shared texture design is required by this logical contract. Those choices and their limitations belong in the ADR.

Electron main owns minimize/restore/fullscreen state notifications and focus (`main.js:151–186`); these are `windowstatechanged` DOM events, not bridge resize/fullscreen command replies. Window close persists bounds and releases shortcuts/CEC (`:873–891`). There is no explicit bridge resize, DPI-change or sleep/resume API in the maintained wrapper; Pepper handles its own surface lifecycle. A replacement must supply that missing platform implementation beneath the same upper UI behavior, and demonstrate resize/minimize/restore/fullscreen independently.

Current main disables global sandboxing and uses `nodeIntegration:false`, `contextIsolation:false`, `sandbox:false` with preload (`main.js:805–809,1064–1079`). This is a description of the legacy runtime, not permission for a future architecture to require those settings. The bridge API is commands/properties/events; renderer access to native modules, raw filesystem, credentials or unrestricted IPC is not part of its logical contract.

## Acceptance boundary

An isolated fake caller can establish create/render/load/control/property/lifecycle feasibility and compare native crash handling. It cannot establish compatibility with all settings, structured statistics, delayed subtitles, generation races, actual Emby Session, WebSocket, remote control, progress or NextTrack. Later shadow/integration work must cover those at unchanged Electron 18 first. This document adds no production API, native binary, dependency, build overlay or security change; Phase 1 provenance continues to govern any later runtime inclusion.
