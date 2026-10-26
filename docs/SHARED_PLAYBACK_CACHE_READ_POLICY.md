# Bounded local-block reading candidate

The fixed7a Windows run selected and decoded preloaded B successfully, but its coordinator failed zero repeated body. One aligned256KiB read returned valid data at19.9835ms after its15ms timer fired at15.1183ms; the source then repeated that full block. All50 observed reads ultimately returned valid bytes. This is a real local-wait policy issue, not a missing/invalid-file observation. Baseline passed and owned resources closed; reopen/cancel did not run. See [the actual run](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40332934933).

## Selected minimum change

Give each actual physical-block read a30ms **monotonic absolute** window, starting before store.read, including ownership checks, stat/open/read and hash. Fast reads return immediately; this is a ceiling, not a mandatory sleep. An early timer wake rearms only the remaining time. Keep the actual-block boundary split, fresh source authorization, account/version/generation guards and SHA verification. Missing/invalid local results fall through immediately; a genuinely expired pending read falls through on the original single-gap path. Refusal and timeout counters distinguish these outcomes without pretending store.read can identify every filesystem error separately.

Keep pending physical work/reservations owned until its real finally. Client cancellation or a newer seek stops waiting promptly and cannot count/send a late hit. Only the failed gap falls back; later usable blocks remain eligible. There is no new read-ahead queue, memory/disk budget, URL proxy service, whole-remaining-response bypass, mpv modification or user setting.

30ms is per physical block, not the whole response or a hard OS scheduling guarantee. Compared with7a, a truly stalled read can wait up to15ms more nominally before origin fallback. Multiple slow blocks or Range requests can compound that cost. A read taking longer than30ms can still cause repeated source bytes; it does not become a successful cache hit or satisfy the unchanged Native zero-repeat assertion. This is an explicit finite degraded path, not a guarantee of zero repeats on all storage.

## Controlled comparison and rationale

`tools/shared-playback-cache/read-grace-ab.cjs` compares exact7a source (A), the independent response-shared allowance experiment (B), a fixed25ms variant (C), and the selected fixed30ms source (D). B is retained in Git solely as a reproducible comparison, not the selected policy. The selected source's SHA256 is `e12d4939498354bddfe19b608084328f51e666ecfd8f01a31a4a3e9caff8ee6e`; the regression requires byte equality with the measured variant.

Seven cases,3 warmup+20 measured paired rounds per case, ABCD/DCBA alternating:644 total outcomes,560 measured, no execution/body/hash failures. Real owned files and loopback HTTP are used, with explicit delayed FileHandle callbacks. Node24.18.1/Linux6.18.55, shared cloud workspace filesystem, no OS-cache purge or hardware/Windows calibration. These are causal tests with injected delays, **not** Native first-frame/seek or real-disk percentile evidence. Whole store.read times are also measured; they include ownership/stat/hash work absent from the narrower FileHandle callback timer. The earlier25ms trial repeated one block when that complete read exceeded its deadline, despite a roughly21ms FileHandle callback.

The following values are measured TTFB p50/p95 in milliseconds. Bytes count actual proxy-received body chunks, excluding explicit access probes; they are not requested Range lengths or inferred player consumption.

| Controlled case | Old15ms A | Selected30ms D | D received overlapping body,20 measured samples |
|---|---:|---:|---:|
| Fast local read |1.54/2.44|1.53/2.10|0B|
| One20ms delayed read,20ms origin delay |37.03/37.69|21.54/21.77|0B (A:5MiB)|
| Two20ms delayed reads,20ms origin delay |36.35/38.17|21.50/23.61|0B (A:10MiB)|
| Two20ms reads,0ms configured origin delay |17.39/17.81|21.38/21.78|0B (A:10MiB)|
| One50ms delayed read,20ms origin delay |36.72/37.51|51.88/53.01|5MiB (finite fallback)|
| One50ms read,0ms configured origin delay |17.29/17.77|32.47/32.88|5MiB (finite fallback)|
| Uncached body,20ms origin delay |21.16/21.75|21.03/21.40|0B overlapping; ordinary origin bytes expected|

The rejected shared10ms response allowance rescued one20ms read but depleted on consecutive slow reads, retaining5MiB repeated body across20 samples in the two-read case. A fixed25ms variant avoided this systematic depletion but still missed a complete local read in the separate fast-origin comparison. The selected30ms variant had no repeat in all three20ms scenes; its largest whole read in those scenes was26.68ms. It deliberately pays about15ms more than7a in the50ms stall cases. With the very fast configured source, waiting for20ms cached data cost about4ms relative to the old early origin fallback while eliminating its requests/overlap. This is the practical latency-versus-repeat tradeoff, not an assertion that cache is always faster.

All selected-case readers were zero after drain; the observed proxy media reservation maximum was1.5MiB under the unchanged8MiB bound. Payload hashes matched. The small fixture is not a maximum-M/P quota or full-player RAM benchmark; those contracts keep their separate prior evidence.

## Required next evidence

Local deterministic tests must cover repeated in-window blocks without response allowance depletion, exact deadline/early wake, one expired gap with later local hits, missing files without artificial wait, client/generation cancellation and old-I/O ownership. Diagnostic observation retains exact manifest/source hashing and recognizes the30ms timer; it does not fake time in Native.

A new product source identity/package is required after normal regression and parent coordination. The original7a artifact cannot contain this correction. Keep baseline/natural/reopen/cancel and zero repeated body unchanged: a future timeout still fails that acceptance. Ordinary app latency, cache/uncached/boundary/far seek and real-account behavior remain unverified; the separately saved ordinary-entry tools must be explicitly rebound to a newly reviewed product before reuse. No dispatch, package build, real115 request, FN change, main merge or release is part of this local comparison.

The comparator now reconstructs the same hash-pinned historical variants from the maintained selected source through explicit source recipes; it does not require fetching old private/experimental Git objects after a shallow checkout, rebase or squash. All four resulting SHA256 values match the measured inputs. Only the offline source comparison accepts the exact Git LF→CRLF checkout transform; BOM, mixed endings or content edits reject. Native payload/manifest hash gates are not normalized or weakened. Portable comparison/observer subset13 passes after this tooling-only refinement; product source bytes remain unchanged.

## Prepare restored metadata before dispatching the application source

The Home-inclusive bounded-read Windows run passed baseline and natural playback: B retained11,065,064 bytes,49 physical reads had no deadline fire, and no extra B body was read after the natural switch. Reopen then failed its coordinator gate: persisted data was present before startup, but the first dispatched proxy showed no ready disk state or physical read attempt and five body ranges were read again. This is a separate first-route recovery admission issue, not evidence that30ms block reads timed out.

The adapter intentionally allows its low-level proxy to forward while the deferred store initializes. Application selection previously treated that URL as prepared even when its restored key was still pending; the first response could latch the cold path before recovery. Older reopen unit coverage called prefetch before reading, so it did not cover this first ordinary body. Add an internal cancellable handle readiness operation and await it inside the existing shared-session50ms total preparation race. Do not mark actual, prefetch, download a body, replace authority, enlarge a deadline or block the ordinary source behind full recovery. A slow recovery still safely returns the original source when that existing budget expires; this does not guarantee all disk/index sizes can reopen from cache within50ms. Pending real disk work retains its existing owner and cleanup.

Deterministic negative coverage rejects an unready application proxy, whereas the old source dispatched it with recovery held. Fresh-manager tests retain real prior B bytes, reauthorize, then read the first body without a new prefetch or early actual promotion; only the fresh one-byte identity probe may reach the source. Cancellation rejects readiness while recovery remains blocked and cannot dispatch a late hit. These tests are local authority/store/session integration with injected M, not a new Windows Native or ordinary-entry performance result.
