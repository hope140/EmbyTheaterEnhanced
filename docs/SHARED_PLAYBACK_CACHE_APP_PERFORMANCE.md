# Shared-cache ordinary-entry verification tools

These tools verify the reviewed product `b4bd4dd9fe51f93a482c69986fe5e77f7f3503ed` (bounded30ms reads plus the merged Home compatibility fix). They are maintained on a separate verification branch: no product payload, ordinary defaults, authentication implementation, kernel or package dependencies change. Keep the product branch frozen while its package and original Native four-phase smoke are coordinated. This document describes executable tools and local contract tests, not a successful Windows ordinary-entry or performance result.

## Entry and source ownership

The verified package is statically extracted, never installed. The tooling wrapper sets the exact candidate app path and explicit owned trial argument, then executes the unchanged `electronapp/main.js`. The product creates its own BrowserWindows, normal preload, protocols, web document, settings, authority, renderer, ApiClient, PlaybackManager, resolver and Native helper. No replacement renderer, OSD stub, ApiClient, PlaybackManager or injected source proof is supplied. Factory observations preserve original arguments, receiver and returned Promises; they only record real store/native results.

Pre-main Electron directories use fresh owned scratch siblings, outside the trial profile. Product trial validation then moves APPDATA, LOCALAPPDATA, MPV_HOME and temporary/session directories to the owned profile before ordinary bootstrap. Invalid ownership/source/path rejects startup; there is no fallback to an existing account profile. Ordinary settings modules seed only that fresh test profile: cache disabled for arm A, shared trial enabled for B, M300MiB and the existing70%/300MiB choices. STRM/CD2 configuration and fixed synthetic-only credentials target loopback fixtures, not a user server. Actual ConnectionManager authentication receives its test session from the local service; the renderer does not manufacture authorization evidence.

The local Emby fixture implements a finite API whitelist, actual HTTP login/reports and bounded WebSocket handshake/messages. Unknown routes fail and record a bounded safe pathname without query/token; unsupported behavior is not converted to generic success. The generated raw AVI files are small, deterministic and contain no audio. Local CD2 RPC supplies those exact media identities and direct URLs. Browser external requests are denied and counted; Native loads must remain loopback. Failed source establishment is a failed test, not a direct-source or synthetic helper fallback.

## Fixed experiment

`entry` runs one A/B preflight pair, including all five scene checks. It reports `NOT_ASSESSED` for performance. Run this first to expose missing ordinary-app fixture contracts without launching the full matrix repeatedly.

`matrix` runs46 fresh ordinary-main processes:3 warmup pairs and20 measured A/B pairs, alternating AB/BA. Each arm produces five outcomes,230 planned rows total:

| Scene | Evidence |
|---|---|
| Cold first decoded frame | Fresh profile/cache; ordinary PM play to real colored Native frame; actual selected shared route for B |
| Cached seek | Target0.5s frame range must already have complete committed cache coverage |
| Uncached seek | Target8s frame range must be absent |
| Boundary seek | Target3s frame must straddle an actual committed range boundary |
| Far seek | Target14s frame must be absent |

A classification mismatch fails; it is never relabeled after observing the result. Seek timing begins after coverage checks and observation control requests, before the actual PM seek; it ends after target time-pos/playback-restart, a same-generation updated decoded frame, unpause and real time advancement. This is decoded/resumed playback, not a claim about visible composition or input-to-photon latency. Captured frame hashes must change after the target events; exact pixel equality to an arbitrary decoder/color pipeline is not assumed.

The source is loopback,16KiB per8ms with20ms initial delay. Each initial forward response pauses after2MiB from its actual requested start, including nonzero AVI payload offsets; later range responses pause after256KiB so the missing-range scenarios cannot silently become complete warm files before measurement. Real seek/Stop cancellation closes these responses. The fixture models a controlled data-availability window, not a claim to represent every LAN/NAS/disk. AVI frame layout is generated and verified, not guessed from media bitrate. MKV, transcoding, subtitles and audio are outside this initial experiment.

Samples retain every failure and null unobserved latency. Successful measured samples contribute p50/p95 and paired B−A latency, with explicit valid counts. A failed case/cleanup cannot make the overall run pass even if some individual latencies were measured. No new Native performance threshold is invented. Existing HTTP benchmark gates remain separate and unchanged; neither a single four-phase smoke nor HTTP first-byte timings establish ordinary Native performance.

## Measurements and limits

- Source byte counters use actual source filesystem stream bytes and range intersections with committed coverage captured before each seek. They are **not confirmed player-consumed bytes**; a paced stream may read ahead one chunk before cancellation. All single-byte requests are excluded and explicitly labeled, rather than claiming every such request is independently identified as an access probe. Requests retain the case that opened them; late close/bytes cannot migrate to the next case.
- Each outcome also records shared proxy hit-byte changes. No source body plus no shared hit is labeled `native-demux-or-no-body`; it is not advertised as a disk hit. Existing mpv demux RAM remains part of ordinary playback.
- Electron working sets/main RSS are sampled every100ms. After the timed operations, one bounded, non-elevated `Get-Process` query reads only the actual still-live owned Native PID's lifetime PeakWorkingSet. The report preserves both values and their conservative sum; it is not a simultaneous whole-player RSS peak or a hard memory cap. Failed/denied queries stop acceptance, with no retry or escalation. Disk observations include logical sizes of owned cache files/index, not filesystem allocated blocks. All raw numeric sample rows remain available.
- Each child is bounded by90s including startup and source verification; the suite is bounded by90min. The workflow has a separate100min collection/acquisition ceiling. These limits do not change the original40s/120s four-phase Native smoke. The first failed ordinary entry stops early; an uncertain child exit or remaining owned source response also stops subsequent launches.
- Quit follows the product's normal drain. A bounded tool-only `will-quit` observer waits for each actual helper close/streams, then permits quit. The coordinator independently confirms the exact Electron PID exited and streams closed. A denied terminate is not retried or escalated, and uncertainty remains FAIL.

## Dispatch after the package is verified

Use the existing `Public offline CI` workflow on the exact verification-branch tool commit. First verify its normal push CI. A new installer is unnecessary: source compatibility must prove the reviewed product is an ancestor and all protected product trees match. The package artifact must be the unexpired successful manual package of that exact reviewed product with independently checked ZIP and installer digests; no older product artifact, edited manifest or replacement URL is accepted. Acquisition failure/expiry stops without an alternate or retry.

Set both `shared_cache_smoke=true` and `shared_cache_diagnostics=true`, `benchmark_warm_calls=app-entry`, `benchmark_expected_sha=<exact tool HEAD>`. Set `release_package` and `build_input_benchmark` false and leave `benchmark_trials=4`. This reuses the existing ten-input workflow; the app selector excludes both ordinary Native smoke and liveness jobs and does not change the fixed20/3 experiment. Fill `shared_cache_artifact_id`, `shared_cache_zip_sha256` and `shared_cache_installer_sha256` with the same reviewed product package. After entry PASS, parent may dispatch `benchmark_warm_calls=app-matrix` with the same bindings. No job dispatches another job, builds a package, publishes or installs.

Read safe `candidate-source.json`, `app-performance.json` and `case-N.json` receipts. Product/tool identities are separate; sources, sample count/validity, helper close, Electron exit, HTTP/WS/gRPC cleanup, unknown routes and external attempts all matter. Entry PASS is a prerequisite, not the20-pair result. Matrix PASS means complete technical samples/cleanup, not an automatic claim of no perceptible regression: inspect the paired distributions, failed rows, actual source overlaps and resource scope before a product decision. Ordinary visible UI, audio and real accounts remain separately unverified.

The tool observes the product's `appready` event with an owned, temporary debugger script before ordinary scripts run, then detaches before measurement. The script only marks readiness; it supplies no API, module or proof. This uses the fixed [Electron44.4.2 debugger API](https://github.com/electron/electron/blob/v44.4.2/docs/api/debugger.md); it does not open a remote debugging port or change the product preload/security flags. Same-document router hash changes are allowed only while the exact owned main frame and physical app entry remain unchanged. Replacement/navigation rejects.

The performance fixture presents a single A queue with automatic episode expansion disabled for its synthetic user, isolating seek from background-next traffic; original four-phase smoke separately covers preload/promotion. Direct Native URLs must exactly match that A source. Shared URLs must have been observed from the real proxy opened for the expected hashed server origin, synthetic account, Item A and MediaSource A-avi. Any B/C media response in a performance case fails source evidence. Cache coverage alone or any arbitrary loopback proxy cannot satisfy the identity check.

Native startup approval, if pending or denied, also applies to these ordinary-entry modes. Preparing/pushing tooling or passing local contract tests does not authorize dispatching a different mode to bypass that decision.

Nonzero initial AVI video ranges are covered explicitly: readiness checks the actual cached target frame, not an assumed byte-zero prefix. The source window includes a complete bounded span from that request start so incomplete final blocks cannot masquerade as prepared coverage. Any observed overlapping source body during a B-arm seek fails that sample, even if timing and decoding succeed. Windows execution is still pending.

The test-only request filter cancels LAN discovery and Wake-on-LAN custom-scheme requests before their ordinary main handlers can send broadcasts; their blocked count is reported separately. Protocol registration and explicit real ConnectionManager login to the owned fixture remain normal. LAN discovery/WOL are not part of this loopback verification. No network/firewall/security setting is changed.

As defense in depth, the owned child denies Node UDP socket creation before loading main, preserving a separately reported counter and restoring only its own wrapper at exit. This also prevents LAN discovery/WOL when a custom-scheme request does not traverse the browser request filter. HTTP/CD2/native media still follow real loopback transports and authorization; no OS network or permission setting is changed.

Final egress-guard regression:2,922 tests,2,897 pass,zero fail/cancel,25 existing platform/material skips (137.1s); targeted200/200, JavaScript614/PowerShell55 syntax and finite credential-pattern scan713 pass. These are local tool/contract results, not Windows Native or ordinary-entry performance evidence.

## Binding after the Home compatibility synchronization

Both physical-package `PRODUCT_COMMIT` and ordinary-entry `BASE` now equal `b4bd4dd9fe51f93a482c69986fe5e77f7f3503ed`. The verification branch includes that commit as an ancestor and must have no protected product-tree difference (`src`, `native`, `vendor`, `installer`, package manifests/locks). Its own tool SHA remains separately bound by checkout, workflow input and the hashed plan/tool list. Old7a and earlier30ms artifacts are not compatible with this binding. Use only one future successful manual package produced from the reviewed commit, with its actual artifact/run identifiers and independently checked ZIP/EXE hashes; this tool successor does not require a second installer. The source30ms observer is inherited unchanged rather than restoring the old15ms observer. No Windows execution is implied by source rebinding.

Home-inclusive tool regression:2,932 tests/2,907 pass/0 fail/25 existing platform or material skips (137.9s); focused Home/cache/app/source tests433/433. JavaScript617/PowerShell55 syntax, finite credential-pattern scan716, changed documentation checks and protected-tree equality pass. This is local verification; the exact new tool commit still requires its own Windows CI, and no Native or ordinary-entry result is implied.

## Structured Windows fixture-root control channel

The first ordinary-entry Windows prepare failed before any sample: the temporary-root preflight logged a diagnostic JSON line to stdout alongside the path. PowerShell then treated that combined value as a path. The source package and physical extraction had passed; no ordinary-entry or performance result was produced.

A source-bound helper now emits exactly one schema1 root record on stdout and routes the existing port-preflight diagnostics to stderr. PowerShell captures streams separately, limits raw stdout to8192 bytes, strict-decodes UTF-8 and validates one terminated record, exact keys/types/kind and a canonical existing direct temporary child with the expected prefix. It does not select a last line, trim away arbitrary output, ignore an error or relax source acquisition. The same helper is included in all three coordinator source inventories. Tests run the actual AST-extracted PowerShell consumer with real Node and synthetic helper output, including diagnostics, extra lines, BOM, missing newline, wrong schema/path and oversize refusal; fixture-specific path-case/alias behavior is explicitly controlled. No Windows Native run or successful app sample is implied.
