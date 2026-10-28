# Ordinary C → Stop → quiet → A verification candidate

This local candidate executes the unchanged ordinary product main, renderer PlaybackManager and Native helper. Each owned process and fresh profile explicitly plays synthetic **C**, completes its five function samples, normally stops and drains that Play, waits a fixed **5,000 ms**, then explicitly plays synthetic **A** and completes five more samples. It adds no product preparation interface, startup prewarm, load interception or hidden third Play. C's authorized playback body is counted in its own phase. A has no prior request, cache key or body prefill.

Product source is bound to `6b536371d2569c3bdda96bc633e683e23542fd84`. This test-only product correction preserves the protected runtime tree of c950. The existing strict `app-entry` / `app-matrix` implementation and historical FAIL/null results remain separate. Schema-1 receipts cannot be renamed into this schema-2 trial. This document supersedes the earlier local model-only candidate and its unnecessary zero-total-body preparation condition.

## Execution and acceptance

| Parameter | Contract |
| --- | --- |
| Function entry | One A/B pair, 2 owned processes, 10 samples per process, 20 planned slots |
| Matrix | 3 warmup + 20 measured A/B pairs, alternating order, 46 owned processes, 460 planned slots; 400 measured slots |
| Process concurrency | One process at a time; unconfirmed process/helper closure blocks further launches |
| Both arms | Same ordinary C → Stop → fixed 5 s quiet → A sequence, same source shaping and time window |
| Arm A / arm B | Shared cache disabled / enabled; media identities remain C then A in both arms |
| Selection / disk protection | Existing 50 ms preparation and 30 ms disk-read grace, unchanged |
| Cold C | Layered-only 12 fps / 16 s RGB24 AVI, 192 frames; seek .5 → 3 → 8 → 14 s |
| Ready A | 12 fps / 16 s RGB24 AVI, 192 frames; seek .5 → 3 → 8 → 14 s |
| Decoded frame proof | Unique media/frame, fixed supported mpv/zimg conversion, tolerance 2, target frames 6 / 36 / 96 / 168 with original one-frame allowance |
| Event/fresh-frame deadline | Original 5 s seek-submit, position, restart and new/different-frame gates; original monotonic clock retained |
| Source pacing | Existing 6 MiB prefix; only already-held owned responses may resume by at most 768 KiB after each non-cached seek; all bytes/time counted |
| Stop | Normal PM Stop, old owner retired, pending operations drained, real stopped report, responses and held streams closed before quiet |
| Quiet | Fixed 5 s for both arms, independent of backend readiness; zero new media requests, zero source bytes, zero local body-read calls or hit-byte increase |
| A readiness | At quiet end B backend must already be ready; otherwise A's five slots remain FAIL/null, with no extra Play or extended wait |
| A fresh authority | Real new helper-instance/endpoint/generation tuple, actual fresh budget request/response and accepted source-context proof for A; helper restart may reuse a numeric generation |
| A shared function | B must select the proxy; boundary sample needs actual positive localHitBytes, with coverage and duplicate-body gates retained |
| Missing/failed evidence | All planned slots remain; missing observations stay null; failed observed latency/bytes stay in raw output |
| Entry images | Bounded per-phase preview PNGs and manifests, with original partial/unavailable audit assessments preserved |
| Matrix images | No PNG or window capture; decoded unique-frame proof remains mandatory |

Cold C may legitimately remain original after its selection expires. It can pass cold fallback safety only when that same Play stays original, has zero shared hit claims and passes the real frame/seek/Stop gates. Backend ready never proves a body hit. Quiet-phase file initialization is allowed within the existing product lifecycle, while new media requests/body reads are refused. First-play C traffic is not counted as unauthorized preparation, and cannot be transferred to A's cache-hit counters.

The new explicit A request must independently establish its current owner, actual Native budget response and source proof. It cannot inherit C's proof. Original/proxy routing and backend initializing/ready/failed are recorded separately. The .5 s sample with source 0 / hit 0 is `native-demux-or-no-body`, not a shared hit. A B-boundary local read is required even if the backend was ready before Play.

Every media request has an immutable case/request-ID ledger entry. Tombstones survive close; late C bytes remain C and additionally fail cross-phase/closed-request checks. One-byte bytes are retained separately; only a 0–0 probe candidate is excluded from body overlap, without claiming its role merely from the range. Nonzero one-byte reads remain body. Servers close between cases, preventing a late request from acquiring the next case's ownership.

## Equal-time synthetic supply

The layered generator explicitly selects `layered-equal-time-v1`. C and A both use 12 fps / 16 seconds / 192 frames and the same seek times; the ordinary reference-position condition remains cached target + 1 second, now 1.5 seconds (frame 18) in both phases. The previous 24 fps C used frame 30 for that condition even though its target times had been halved. Merely lowering that position threshold is not this correction.

The legacy fixture generator remains unchanged by default, including C at 24 fps / 8 seconds. The layered C body, index, dimensions, frame identities, frame stride, byte length, 6 MiB supply and bounded continuation rules remain identical. Only three AVI timing fields change, and generated FPS/duration/SHA/ETag metadata matches those actual bytes. New layered plans require the explicit timing marker; source startup verifies both A/C timing headers and rejects relabeled legacy bytes, inconsistent metadata and stale ETag. No product interface or behavior changes.

The old 6 MiB window already contained C frame 30: from byte 224 it includes complete frames 0–35 and 70,368 bytes of frame 36. Therefore the earlier original-source/proxy difference cannot be described as missing target-frame bytes or a proven disk/decoder defect. Equalizing the timeline corrects a demonstrated fixture mismatch, but does not establish the precise Native/demux stall cause or guarantee that the new ordinary entry will pass. Previous failures remain failures. Do not pool latency distributions across the old C timing and `layered-equal-time-v1`.

## Reports and performance limits

`layered-performance.json` contains every planned slot, raw per-case results, source phase totals, per-request byte/closure ledger and full B admission/fallback/unclassified denominators. Entry performs function/evidence validation and reports performance NOT_ASSESSED because capture I/O participates. Matrix produces descriptive measured p50/p95 and paired B−A differences separately for cold-C and ready-A, split into A-original, B-proxy and B-original-fallback. It never pools routes or phases, discards failed slots, substitutes zero for missing resources, or converts partial valid subsets into overall acceptance. B all-case denominator is 23, measured denominator 20. All failures and missing results remain visible even when a valid subset has quantiles.

Physical process/helper exits, observation restoration, complete bootstrap observations and final source/control cleanup gate trust independently. A cleanup rejection of any value removes that case from trusted quantiles while preserving raw numbers. Whole-case Electron peak plus per-owned-helper observed lifetime peaks is a conservative sum across both phases, not simultaneous RSS or phase-isolated memory. Disk bytes are logical observed files, not filesystem allocation. No audio, visible presentation, real NAS or 115 conclusion follows from this synthetic trial.

The earlier strict matrix failures remain failures. No performance improvement or Windows acceptance is inferred from local source tests. Ordinary Windows entry must pass with the exact newly verified package before the fixed complete matrix is dispatched.

## Runnable entry and matrix

After authorized publication, checkout the exact tool commit with its product ancestor and unchanged protected product tree, use locked dependencies, and supply a successful **exact 6b536371d2569c3bdda96bc633e683e23542fd84 product** manual-package artifact. The failed c950 package run has no usable artifact. Old 4f/83 packages and the unpublished tooling HEAD are refused as product aliases. The separate test-only probe-fence fix is included in this product anchor; any further changed product commit identity requires normal tool-contract rebinding and source-tree checks before execution. No artifact ID or digest is guessed here.

On an owned Windows Actions checkout, the new wrapper performs read-only artifact download, size/ZIP/EXE hash checks, fixed provenance checks, locked static installer extraction and normal owned runtime execution. It never executes the installer or builds a package:

~~~powershell
./tools/shared-playback-cache/layered-ci.ps1 `
  -ArtifactId $ReviewedArtifactId -ZipSha256 $ReviewedZipSha256 `
  -InstallerSha256 $ReviewedInstallerSha256 -ExpectedToolSha $ExactToolSha `
  -OutputRoot $NewOwnedOutputRoot -Mode entry
# Only after exact entry succeeds, a separate new output directory:
./tools/shared-playback-cache/layered-ci.ps1 `
  -ArtifactId $ReviewedArtifactId -ZipSha256 $ReviewedZipSha256 `
  -InstallerSha256 $ReviewedInstallerSha256 -ExpectedToolSha $ExactToolSha `
  -OutputRoot $AnotherNewOwnedOutputRoot -Mode matrix
~~~

The wrapper requires the ordinary read-only Actions job token, exact repository, matching `GITHUB_SHA`, a fresh output directory and an unexpired successful manual-package artifact. It does not retry or select another artifact. Safe outputs contain candidate-source, layered-performance, all case/lifecycle receipts, and entry-only per-phase bounded PNGs/manifests.

Workflow file `.github/workflows/public-ci.yml` has a separate mutually exclusive layered job. Future entry dispatch inputs are:

~~~json
{
  "release_package": false,
  "build_input_benchmark": false,
  "shared_cache_smoke": true,
  "shared_cache_diagnostics": true,
  "benchmark_expected_sha": "<exact published tool SHA>",
  "benchmark_warm_calls": "app-layered-entry",
  "shared_cache_artifact_id": "<reviewed successful product artifact ID>",
  "shared_cache_zip_sha256": "<actual downloaded ZIP SHA256>",
  "shared_cache_installer_sha256": "<actual EXE SHA256>"
}
~~~

For the complete matrix change only `benchmark_warm_calls` to `app-layered-matrix`, retaining identical reviewed identities. Matrix sizes are fixed in code; there is no smaller success substitute. These are reproducible future parameters, not a dispatch or a claim that a successful package exists.

Local regressions run with `node --test --test-concurrency=1 tests/shared-playback-layered-runner.test.cjs`. They exercise the real sequencing/renderer/ledger/observer closures, real NativeHelperClient request/dispatch semantics over an owned fake transport, and real RGB24 loopback HTTP/Emby/gRPC fixtures. They do not run Electron/mpv/Windows or establish actual package behavior.


## Prefix coverage diagnostic boundary

In full diagnostic modes, the ten-second prefix requirement still queries the cached-seek frame offset and requires the returned contiguous span to reach the original prefix threshold. Each case now retains bounded key/identity/version bindings, store put offsets and outcomes, first/latest/changed span observations, store pending/fault/current-key state and proxy capture/skipped-write counters. Identity and validator values are hashed; URLs, credentials and block data are not recorded. Bindings and observations include an owned store-instance number to distinguish identical keys across backend instances. The wrapper retains the original put receiver, arguments and Promise and restores its hooks on exit. Extra status reads and completion observers have measurement overhead; they are not claimed to be timing neutral. Observer errors, overflow, unresolved operations, missing prefix evidence and restoration failures reject both case acceptance and phase-statistics trust, retaining the raw slots and full denominators.

Foreground disk capture is an optional bounded tap, so a completed source prefix is not by itself proof of durable contiguous coverage. Slow writes can exhaust capture admission and leave a permanent hole that polling cannot repair. The local regression uses real paced HTTP, the maintained sparse proxy and a controlled store I/O gate to distinguish that mechanism from missing/wrong keys or pending writes. This is a diagnostic reproduction, not a replay or root-cause finding for a Windows failure. It never fills a hole, changes the source window, extends the deadline or converts a failed case into a hit.


## Explicit minimal observation candidate

`app-layered-entry` / `app-layered-matrix` retain full diagnostics. The separate `app-layered-minimal-entry` / `app-layered-minimal-matrix` choices select `minimal-v1`, bound into the immutable plan, case receipt and coordinator result. Direct runner use is `--mode=entry|matrix --observation-mode=minimal-v1`; omitting the observation argument still means full. PowerShell uses `-Mode entry|matrix -ObservationMode minimal-v1`. Artifact, installer, product, source, tool and fixture identities remain exact. The workflow's existing smoke-and-diagnostics booleans still select its isolated verification job; the receipt's explicit observation mode describes which optional details actually ran.

Minimal does not load the lexical bootstrap observer or wrap `store.put`. Bootstrap evidence states only source-verified/not-observed, with operation/pending/error/drop counts, timing, summaries and restoration fields null. Prefix observation retains store-instance/key/full-identity/version bindings and the original span query with bounded state samples; put details and put-pending counts are null with NOT_OBSERVED. Gate-observer errors and lost rows are actual observations and must remain zero; restoration must succeed. A minimal receipt cannot enter full statistics, or vice versa, by self-reporting a different mode. The coordinator supplies the expected plan mode, exact store hash and fixture to its trust checks. Malformed or inconsistent binding/owner/key/instance/query evidence, wrong source hash, non-null disabled details or missing required observation metadata rejects trust. Fixture size and ETag independently bind the observed metadata digest and the recomputed store version key. The opaque full identity digest remains an observation by the source-bound tool, not a replacement for current source-proof authorization. A legitimate observed missing binding/span or incomplete prefix is a functional failure, not a clean hit or fabricated telemetry. Functional gate success is checked separately from observer completeness; a later failed or unexecuted phase does not erase earlier trustworthy measured samples. A completed proxy phase still requires its bound prefix span to satisfy the unchanged threshold.

All identity, frame, source-body, lifecycle, ten-second prefix, five-second quiet, 50/30 ms and exit requirements remain. Keep every failed/null slot and separate the complete cold/ready cohort denominators. Entry still precedes the fixed complete matrix: 3 warmups plus 20 measured pairs / 46 processes / 460 total and 400 measured slots. This candidate reduces selected observation work but is not observation-free; full/minimal results from different runners or times cannot establish a causal instrumentation cost. Existing historical FAIL results remain unchanged. Product runtime bytes stay fixed, so this tool-only comparison does not require another installer build.

Minimal also records one final synchronous status snapshot per owned store/proxy instance at ordinary will-quit, after the product's cleanup attempt. Created-instance counts must match the complete numbered arrays. Every created store must report closed, not faulted, with pending bytes/count, readers and reservations zero; proxy route/job/opening/body/origin/capture/read-reservation counts must be zero. A proxy phase must reference a captured proxy instance and every non-null observed store binding/sample instance must reference a closed store. Not-created is explicit null, never fabricated zero state. Read failure, missing fields, omitted earlier instances or nonzero activity rejects case/statistics trust. This adds no wait, retry, close action or timed-sample I/O; normal physical process/helper closure remains separately mandatory.
