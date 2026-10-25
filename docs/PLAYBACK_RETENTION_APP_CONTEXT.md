# Playback retention: ordinary-entry context trial

## Later stage: separate source-built experiment, ordinary context still disabled

The independent [custom-core experiment](../native/experiments/buffer-retention/README.md) now supplies a finite report API and positive Linux synthetic mapping/error/cancel/new-process evidence. It does not change the bundled fixed production core or connect ordinary replay. The context-only checkpoint below remains its original scope; statements that no core was changed/built refer to that earlier checkpoint. The proposed bounded core work is now implemented only in the separate experiment patch/build, not in a Windows product kernel.

## Verified result and current capability

Run [40161248912](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40161248912), job121073089323 at `a59360795baca4fcb1d23950b1342d80c53e9f65`, actually reports `PASS`: finite export18ms/4,268,642B, zero newly observed export source requests/scheduled/completed bytes, stored window, manager close/reopen, next-helper lease read, released lease, final closed manager and zero native readers. The EDL/WAV temporary files were removed while one managed clip remained. Five helpers and the driver exited0 with closed streams. The PCM comparison covers9,600 exact samples around the seam, untimed file output and this raw-video/PCM fixture only. Artifact12586458304 ZIP SHA256 `fe1a66604ec52caf4a1062fe8cf93e6c63896aa6e5ec75c9d5bdc3c33b2b13f0` is the published diagnostic identity; the actual job summary was independently read.

This is a positive finite-window storage/native-read result. It does not establish ordinary application authorization, arbitrary media mapping, device gaplessness, a complete current-buffer snapshot or a network saving. The EDL phase positively flushed1,581,512 saved-payload bytes to the underlying system. Consumption by the client is unknown. At Stop/deadline all active HTTP responses, sockets and source streams were closed; five historical/current closed-response callbacks remained unacknowledged. Those callbacks are not live resources or evidence of zero transfer.

This source revision adds an opt-in **context-only** ordinary application path. Normal playback continues through the original source. `canReuse` is always false with reason `exact-export-map-unavailable`; no `dump-cache`, Store import, media persistence, EDL replacement, settings control or additional cache quota is wired into normal playback.

## Trusted ownership and bounded-buffer observation

The actual `plugins/libmpv.js` adapter obtains Item, selected MediaSource, PlaySession and final resolved source from its existing playback request. `playback-retention-renderer.js` reuses the existing capture provider with the current ConnectionManager ApiClient, server/user identity and identity epoch. The adapter rechecks request/endpoint ownership after the authorization await; Abort retires only its bound generation. PlaybackManager remains the session/queue/reporting owner.

The main service validates the live endpoint/generation and accepts only same-origin HTTP(S), non-live Video, DirectPlay/DirectStream with exactly `Static=true`. A fresh one-byte206 read must confirm a strong ETag and source length. Redirects, weak/absent validators, Range200/416, invalid identity and other sources simply leave this context unavailable; ordinary playback retains the original source. The current authenticated final URL is held only in memory; no credentials or source URL enter the status, profile marker or retained store. This is an authenticated readability/version check using the existing session URL, not a new login or full-media content hash. Cross-origin redirects such as some media gateways are unsupported here.

After the actual native playing signal, read only the existing `demuxer-max-bytes`, `demuxer-max-back-bytes`, `demuxer-donate-buffer`, `cache-on-disk` and `demuxer-cache-state`. RAM mode is required for this trial. Forward/backward budgets, held-forward and held-total counters remain separate; no setter, duplicated byte cache, new capacity or download occurs. The status is an observation, not an exact exported packet list or proof that a future remux fits the byte budget including container overhead.

Stop/new generation/destroy cancel the one-byte request and join its physical retirement. Repeated retirement joins the same barrier. After any await, stale Stop/destroy cannot act on a replacement helper/generation/endpoint. Service destroy joins outstanding helper exits and the context reader. Shared old-helper destruction must not invalidate a newly created replacement endpoint even before its first generation.

## Explicit isolated launch (new source only)

Only a runtime genuinely built from this revision understands these arguments:

```text
--ete-retention-context-trial --ete-retention-profile=<precreated-absolute-empty-directory>
```

Do not pass these flags to the old162 candidate or a released installation. No package has yet been built or native app-entry test executed for this revision. The legacy162 candidate remains immutable and proves the finite synthetic helper path only.

The directory must be empty or carry the exact trial-owner marker, physically resolve without links, and be outside any ordinary profile. Known Electron profile roots and Windows Host positional paths are protected even when empty; overlapping parents/children are rejected before creating a marker. No automatic fallback to an ordinary profile is allowed. Unknown, incomplete, mixed-case, duplicate or mixed range-cache trial arguments fail before bootstrap. User/app/session data, APPDATA, LOCALAPPDATA, MPV_HOME and TEMP/TMP are isolated before bootstrap, including the Windows Host's ordinary positional data path. The range cache is disabled in this context-only trial. Without the flag the existing launch behavior and playback settings are preserved. Starting this UI trial is coordinated separately; the source tests do not run a user's installation or server.

## Exact timeline blocker in the fixed production core

The fixed production input remains mpv `dd5d17d3285a095a0f712fa9d116e22a076492de`, DLL SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`.

[recorder.c](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/common/recorder.c) privately computes `base_ts` and `rebase_ts` for a recording restart, then writes packet timestamps with their difference. [recorder.h](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/common/recorder.h) exposes no mapping getter. [dump-cache](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/player/command.c) returns completion status, not this mapping. Cache-state/seekable ranges and demuxer-start-time are not the first packet actually muxed. `demux_probe_cache_dump_target` in [demux.c](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/demux.c) explicitly provides a conservative probable target. Recorder discontinuity logs contain rebase_ts, not the private source anchor. Changing the output container to Matroska does not remove this timestamp rebasing.

The synthetic prototype found the original source offset by matching packet payloads against its already-known local source. Doing that to ordinary media would require source data outside the held buffer and is excluded. Requested dump start, approximate cache alignment or a guessed offset cannot replace the exact map without risking wrong resume time, audio/subtitle alignment and seek reporting. Thus a context-only app path is safe to implement now; transparent retained playback is not enabled on the present public API.

## Smallest concrete next decision: read-only export mapping capability

No core source or binary was changed or built. Before a custom-core experiment, obtain the separately required architecture/build confirmation. A bounded proposal is:

1. `common/recorder.h/.c`: capture the finite recorder segment's valid source anchor/rebase pair and each selected A/V stream's first actually muxed input/output PTS/DTS, stream identity/timebase, packet count and keyframe information. No payloads, URLs, tokens or retained raw byte layer.
2. `demux/demux.h/.c`: snapshot that report before recorder destruction; associate it with one monotonically identified finite export and convert internal timestamps with the source timestamp offset. Initially accept one continuous segment only. Multiple ranges, absent timestamps, inconsistent track anchors or unsupported muxer shifts must yield unmappable.
3. `player/command.c`: publish a bounded immutable completion result only after successful finite export, trailer and close; retire the result on error/cancel/next export. Existing recorder paths sometimes log write/trailer failures without propagating a full success contract, which must be resolved rather than treating file existence as success. A narrowly correlated helper result route is a separate protocol change to review.
4. Validate that report against the existing raw/PCM fixture and one small compressed/B-frame fixture, including exact seek/seam, corrupted result/file fallback, cancellation, source identity changes, physical exits and lease cleanup. A new DLL must have a new source/build/hash identity; never relabel the old162 package or skip its original integrity gate.

This is several native/API/protocol and validation changes, not a configuration toggle. It creates an ongoing fixed-core patch/rebase obligation and still does not prove all codecs, subtitles, discontinuous media, device audio or whole-buffer export overhead. If maintaining that capability is not acceptable, keep the finite-export experiment and do not ship transparent last-buffer retention. Next-episode preload remains independent.

## Local validation boundaries

The app adapter is exercised through its actual AMD factory with a substituted DOM/endpoint and synthetic ApiClient provider. Main startup is exercised through its complete Windows-order VM contract with isolated temporary fixtures. Service tests use real loopback HTTP and substituted helper objects; they test fresh206 authorization, unchanged load source, existing3GiB numeric budget handling without setters, physical cancellation, old Stop/new generation and old destroy/new endpoint races. Renderer tests cover account/identity epoch changes and shared close barriers. These are local code-path tests, not installed Electron, a real server login or ordinary helper playback evidence.

The full public regression initially exposed a missing `.js` suffix in the new AMD dependency; the production module now uses the repository's explicit relative `.js` form and the real AMD manager/queue/adapter loader test passes. The old successful native state run is preserved separately from these new source tests.

Final local checks:130 targeted tests pass; complete public regression2,062 tests/2,052 passed/0 failed/10 explicit platform skips. Earlier intermediate existing Range fixture failures are preserved in the maintenance record; an isolated diagnostic reproduced a pre-probe listener EADDRINUSE, without changing product transport, retrying ports or weakening assertions.487 tracked JavaScript syntax checks,579-text finite credential-pattern scan, changed-document encoding/link/private-path checks and patch whitespace pass.
