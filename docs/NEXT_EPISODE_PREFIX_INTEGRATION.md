# Next-episode prefix integration on the accepted 043 source

This integration starts at exact `abe1c7426f0c8d0b5d1f7febadd0d39fb9a80a1d`, retaining the accepted 042 page/cache/update work and the 043 one-second Native preview/SMTC/exit ownership already in that source. It does not import the separate pending Host-exit repair. Product version remains 0.4.3; installer, tags, native C++/DLL/controller/WinRT/DWM and build workflow are unchanged.

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

Targeted checks include original source/header/redirect/validator behavior; shared budget, partial prefix and miss passthrough; settings and next-play application; current Native creation/preview/SMTC/exit; 042 Home/detail/cache management/update; and pause/Seek/thumbnail ownership. Real Windows integrated playback, visible settings, complete Windows regression and ordinary package/install acceptance remain unrun. No new package, dispatch, release or main merge belongs to this preparation step. A later Host fix must be coordinated as a separate integration input and cannot be claimed present here.

Final targeted run: 446/446 pass, zero skips across the selected current-source tests; JavaScript syntax, finite credential-pattern scan and patch whitespace checks pass. An explicit diff confirms native/installer/version/controller/preview decoder/Native media and 042 Home/detail/update/cache-management source stay identical to abe1c742. Real integrated Windows/native/visual/installer checks remain unrun.
