# Next-episode prefix integration on the accepted 043 source

This integration starts at exact `abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d`, retaining the accepted 042 page/cache/update work and the 043 one-second Native preview/SMTC/exit ownership already in that source. The current follow-up imports the verified Host lifecycle source and complete source bindings from exact `b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5`. Product version remains 0.4.3; installer, tags, native C++/DLL/controller/WinRT/DWM and build workflow are unchanged.

The next-only implementation is ported from frozen verification source `9559d0fc8a85474fa0ed98c4459e7074fe2ff8b4`. That source's 0.4.0 installer and native experiment results remain historical evidence; none is a new integrated 043 runtime or installation acceptance result.

## Mapping and overlap resolution

| Responsibility | Integrated change | Retained baseline behavior |
| --- | --- | --- |
| Identity/HTTP/store | Add disposable prefix store, strict HTTP reader, shared-P cache and identity/OS-exclusion utilities | No persisted last-play index or restore engine; old range-trial launcher/store are absent |
| Policy/settings | Default off, 70%, 300 MB; choices 50/60/70/80/90 and 100/300/500 MB | No total disk-capacity or bandwidth prompt; Save applies on next playback |
| main | Register ordinary settings IPC, pass config provider and add its independent cleanup | Preserve early page-cache profile preparation, detail flush, cache management, updater preferences and Native attachment/exit |
| helper client | Add generation-bound range binding/status metadata | Preserve current preview owner, create generation and diagnostics logic |
| helper service | Add context/preload/cancel/status, final-source selection and cleanup | Preserve createdEndpointId validation, endpoint retirement before asynchronous destruction, capturePreview/isPreviewOwner and preview-work exit wait |
| libmpv | Add request-owned renderer binding and playback-info category | Preserve pause ownership, actual Seek completion, thumbnail identity, current queue and Native preview owner |
| settings routes | Add Playback/7.5 next-episode page | Preserve General cache-management route, all existing titles/orders/controllers and updater/cache functionality |

Service destruction waits for both the current Native preview work and disposable-prefix/apply work; one failure cannot bypass another owned cleanup. The controller, snapshot decoder and Native platform files are not replaced by the older verification branch. Three-way overlaps are resolved at the existing ownership checks and route entries, not by choosing either entire old file.

## Product contract

Only an explicit original-queue next episode from the same series is eligible. The original player decides nextTrack and autoplay; preloading neither changes settings nor starts another episode. Foreground missing ranges pass through and physically preempt the single background request. All candidate prefixes, leases and write reservations share the selected decimal-MB budget P. Unplayed next prefixes are discarded on close/reopen; current-media misses are never accumulated.

Only verifiable same-origin static HTTP with exact 206 and strong ETag is supported. Redirect/header-auth/cross-origin/incompatible origins retain original-source dispatch and report unavailable. Synthetic-source coverage is not actual NAS/auth/302/dian115 acceptance. Last-buffer persistence and FN transport are excluded.

## Validation boundaries

Node integration reuses the existing Alameda/server fixture functions, extracted into a Node-only helper. It loads the current PM/queue/adapter/client/service/store; helper clock/document remain explicitly synthetic. Ready-before-EOF and pending-at-EOF cases remain separate and deterministic. Active held-next exit also captures an owner-bound 043 preview and proves shutdown drains both pending preview and preload work without publishing late pixels.

Targeted checks include original source/header/redirect/validator behavior; shared budget, partial prefix and miss passthrough; settings and next-play application; current Native creation/preview/SMTC/exit; 042 Home/detail/cache management/update; and pause/Seek/thumbnail ownership. Real integrated Native playback, visible settings and ordinary package/install acceptance remain unrun. The pre-Host integration `e110ab6139f3ee65a4e9ee39fbc94e89194fe98e` passed all 2108 selected Windows public offline tests with zero skips in [run 40123988881](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/40123988881). That result remains specific to e110; the Host follow-up has separate checks. No new package, dispatch, release or main merge belongs to this preparation step.

Pre-Host targeted run: 446/446 pass, zero skips across the selected current-source tests; JavaScript syntax, finite credential-pattern scan and patch whitespace checks pass. An explicit diff confirms native/installer/version/controller/preview decoder/Native media and 042 Home/detail/update/cache-management source stay identical to abe1c742. Real integrated Windows/native/visual/installer checks remain unrun.

## Verified Host source follow-up

The lifecycle change initializes the exit Dispatcher before Electron startup, records whether the real Forms loop has started and sends a single idempotent exit request onto that Dispatcher. Shutdown waits for the real message loop; no polling timer, process kill or optional shutdown-log flush is added. The Program replacement and patch, unified identity, runtime schema, builder contract, candidate declarations, component verifier and both verifier manifests are copied byte-for-byte from b8938f4. Production source-chain gates compare the official 55 inputs and both patch/replacement routes before compilation; they do not accept a manifest-only identity. See [Host contract](HOST_EXIT_LIFECYCLE.md).

Only existing Host regression helpers are imported. The two separate diagnostic workflows and short source-gate wrapper are excluded. Next-only JavaScript, settings, queue/preview ownership, installer/version and Native C++ remain identical to e110. The source-chain regression tests retain explicit skips when the official source material is unavailable; the normal production build must acquire and verify it before compilation.

The b8938f4 ordinary-install observation is separately reported: Host and Electron started, displayed a window and closed normally with both exit codes zero and no leftover process or force kill. Its checker marked the run failed on a newly added shutdown-log persistence item outside the existing exit contract. This integration does not import the optional log flush and does not relabel that separate runtime as a combined next-prefix runtime.

The next real Native check should reuse the existing controlled source and actual helper-progress / renderer / natural EOF / original nextTrack path against an exact, source-bound combined runtime. It must also retain 043 preview ownership and ordinary Host-to-Electron close checks. A direct Electron launch alone cannot prove ordinary Host exit or visible settings. No new driver framework or package is required by this source-preparation step.

Combined Host-source targeted regression: 566 tests across 41 selected files, 563 pass, zero fail, three explicit official-source-material skips. The checkout/autocrlf fixed-identity gate passes on the candidate commit; all57 declaration/manifest agreement and seven independent stale-input negative cases pass. The real official55/patch/replacement material cases, real Framework lifecycle execution, combined Native runtime and ordinary installation were not run here. JavaScript syntax (511 tracked files), PowerShell syntax (51) and finite credential-pattern checks (602 text files) pass. The 14 production/provenance imports are byte-identical to b8938f4; src/, Native C++/media/controller, installer/version and workflow diffs against e110 are empty. Normal push may trigger existing Windows public offline checks; that outcome is separate from these local results.
