# Controlled next-prefix Native check on the verified 043 Host payload

This is the existing automatic next-prefix experiment, rebound from the old 040 candidate to the verified 043 payload. The original runtime and installer remain unchanged. The derived directory is an experiment, not an ordinary installer or new build acceptance.

## Fixed inputs

- Product input: `0fbb6f9c78320e83f2919c0324dc5db940310166`; the driver commit adds only tools, tests, workflow and documentation. Product `src/` and `native/` must remain identical to that input.
- Runtime: source `b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5`, run `40124678404`, attempt `1`, artifact `12573411870`.
- ZIP: 165275527 bytes, SHA256 `60eb9f6eb306df3e03db910f4f5af7bd05c1a9237c73b5688df12da3ed5dad94`.
- Installer: `EmbyTheaterEnhanced-0.4.3-test-b8938f4ba914-40124678404-1-win-x64-setup.exe`, SHA256 `40a99cc4281c9a7d958d424902982f781c12072a183013b9002713fa24c7af62`.
- Existing extraction/physical inventory tools: `c9cd9bacf81445c9c10befd121951b1c63c86faa`. Only the locked unpacker is acquired; no compiler, kernel or package build is used.

The standard GitHub artifact metadata read confirmed this exact artifact unexpired, with matching digest and expiry 2026-10-25 19:39:35 UTC. Each acquisition checks expiry, source/run/attempt and byte identities again. Missing, denied, expired or mismatched input stops without fallback, rebuild or retry. Download credentials reach only GitHub API calls; extraction and child processes receive none.

## Entry and scope

Workflow: `.github/workflows/public-ci.yml`. Ref: `verify/next-prefix-v043-native-20261024`. Inputs: `range_smoke=next-auto`, `release_package=false`, `build_input_benchmark=false`. A dispatch is separate from preparation and remains coordinated by the parent. The existing package and benchmark jobs explicitly exclude next-auto mode. The range input defaults off, preserving normal dispatch and public push checks; no new workflow file is introduced.

The existing coordinator creates an owned canonical temporary root, statically extracts the verified installer with the fixed unpacker, verifies the archive-bound complete runtime manifest and real helper/libmpv/Electron identities, then derives a separate copy. Exact committed bytes replace only the fourteen `OVERLAY` paths enumerated in `tools/playback-prefix-windows-auto.cjs`: eight disposable-prefix modules, two next-settings UI files, main, Native client/service and libmpv adapter. The current-source source-diff set must equal that whitelist. Every other physical member, including Host, helper, Native media/preview/controller/FFI and provenance, remains byte-identical. The normally assembled Vulkan loader and its provenance must already be correct; no new loader member is added. Driver and overlay hashes/source commits are recorded in the owned plan and checked before and after execution. Integrity reads use the existing original-fs-aware physical inventory under Electron rather than virtual ASAR entries.

After an explicit empty Electron entry check, only two existing controlled cases execute:

1. Natural automatic chain. The unchanged real helper clock drives the maintained renderer, real EOF invokes original PlaybackManager nextTrack, and B must decode with gpu-next. The ordinary settings store is enabled at its default 70%/300 MB. The same generated AVI fixture puts A at 64 seconds (three fps) and B's index past 300 MB, preserving ready-before-EOF, prefix-hit/no-refetch and missing-tail origin checks at the default budget. No direct preload/tick/nextTrack/EOF invocation drives success.
2. Held-next exit. The existing held-source exit case pauses A through the original manager only after actual threshold triggering. It obtains the actual current preview owner, decodes one real owner-bound helper snapshot, then starts another real capture and destroys the service while that promise and the B response are pending. Retirement, dropped late pixels, complete shared drain, physical request close/no late byte, discarded unplayed prefix, helper exit0 and Electron exit0 are mandatory. Pixels are not sent to the renderer or written as artifacts.

Safe scalar success/failure summaries are written directly into job logs; bounded owned traces/receipts remain available separately. No profile, plan, binary, environment, token or media fixture is uploaded. Timeouts, cleanup intervention or uncertain child exits cannot count as success.

## Evidence limits

Preparation/Node tests do not prove Windows decoding. The derived direct-Electron experiment does not launch Host, execute the installer, exercise ordinary app main or visible settings, prove visible desktop/SMTC behavior, access accounts/NAS or establish 302/auth/dian115 compatibility. The separately accepted b8938f4 ordinary Host/Electron close remains a distinct observation. Peak budget observations are sampled store occupancy including reservations, not a continuous physical-disk high-water measurement. No last-buffer persistence or new product behavior is added.

Targeted preparation checks: driver/coordinator/archive/manifest/source-identity/loader and original manual-workflow routing regressions pass with explicit synthetic-validator boundaries; no Windows helper or installer is launched by these tests. An actual detached c9cd9ba tools checkout successfully creates and reads the exact control plan without downloads or process execution. YAML duplicate-key/route parsing, JavaScript/PowerShell syntax, finite credential-pattern scan and patch whitespace are checked separately. Integrated Windows/public and native results must be read from their own exact runs; none is implied by preparation.

## Natural completion window and incomplete fallback

The initial default-300MB Windows run [40129195779](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40129195779) used a 32-second A. Actual 70% triggering occurred at 22.5 seconds, leaving 9.5 seconds; only 237502464 of 300000000 bytes committed before natural EOF. No ready event existed. Original nextTrack still ran, the in-flight B request closed incomplete, preload returned cancelled, cached B reads and a tail origin request occurred, and B really decoded. This is an observed unfinished-prefix fallback, not a pass of the ready-before-EOF case; its joint-exit phase did not run. The source and processes did not hang.

Only the positive fixture timing changes: the same 192 raw frames now run at three fps, producing 64 seconds and a 19.2-second post-70% window. Warming 300MB in that window requires roughly 15.625MB/s versus about 25MB/s observed in the failed short scene. Actual source and disk speed still determine success; the ready-before-EOF assertion remains mandatory and real EOF is never held, injected or advanced. Queue triggering derives from observed duration/progress, including the existing joint-exit case. Product defaults, budget and source behavior do not change.

The separate maintained Alameda `hold-natural-eof` regression continues to require unfinished cancellation, original nextTrack/B load and fallback; its helper remains explicitly synthetic. A missing-ready validator negative case and bounded job-visible order diagnostics preserve the distinction even when B decodes successfully. The original Windows run stays archived and is not relabeled a complete success.

Current fixture/diagnostic follow-up: 113 targeted checks pass, zero failures/skips, including the independent unfinished-natural-EOF Alameda case. The complete original validateTrace acceptance function is byte-identical to 5e19f19; src/native/installer/version diffs are empty. JavaScript/PowerShell syntax, finite credential-pattern and whitespace checks are separate local evidence; the new Windows run is pending.
