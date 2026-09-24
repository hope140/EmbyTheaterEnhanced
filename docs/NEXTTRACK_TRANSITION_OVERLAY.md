# NextTrack transition artwork

## Scope

The user-observed NextTrack gap exposes the desktop through the transparent main BrowserWindow after the playback surface hides. This change keeps the existing PlaybackManager, Resolver, Session, Native Helper and mpv source-selection flow. It adds one visual layer inside the existing main-renderer `.mpv-videoPlayerContainer`, below the Emby OSD controls and with `pointer-events:none`.

## Source and lifecycle contract

The Video OSD next button calls `PlaybackManager.nextTrack(currentPlayer)` (`vendor/carnival/electronapp/www/videoosd/videoosd.js:2093-2096`). In the local managed queue, `getNextItemInfo()` synchronously returns the next Item before `playInternal`; the existing public `nextItem()` performs an asynchronous `getItem` request. The overlay uses the same queue Item already selected by PlaybackManager and does not add an API request. An external/self-managed player still follows its original `nextTrack()` path without this overlay.

For the current libmpv video player, a narrow wrapper around `nextTrack()` shows the visual layer synchronously and invokes the original method immediately with the original receiver and arguments. The existing manager request sequence is therefore established before any asynchronous rendering work. When that same player's `stop(false)` runs, it lets one renderer paint complete before the existing stop/hide command. This is a rendering boundary, not a fixed-time sleep. It does not discard or coalesce rapid NextTrack calls. A hidden document skips the paint gate so background control cannot wait indefinitely for `requestAnimationFrame`.

The transition states are `IDLE → TRANSITION_SHOWING → LOADING_NEXT → PLAYBACK_READY → HIDE_TRANSITION → IDLE`. The manager's existing `_etePlayRequestSequence` associates the newest overlay with its corresponding libmpv request. Old play responses cannot fade or clear the newest layer. The layer remains over the existing `stop(false) → surface hide → PlaybackInfo/source resolution → loadfile` gap. The current request's `core-playing` boundary first signals the native surface visible, then the overlay waits one more completed renderer paint before fading. This is the best available ready proxy; actual first presented video frame remains a foreground visual acceptance item.

Artwork source order is the Item's first `BackdropImageTags` entry, then `ImageTags.Primary` or `PrimaryImageTag`, each passed through the existing `ApiClient.getImageUrl()`. The overlay container fills its video host (`position:absolute; inset:0; overflow:hidden`); its image fills the container with `width:100%; height:100%; object-fit:cover; object-position:center`. This lets landscape backdrops cover the video area and crops portrait posters to the same area instead of shrinking them. With no usable image, or if image loading fails, the layer stays solid black. Image loading never blocks NextTrack; URLs and Item identifiers are not written to diagnostics. The overlay has no focusable controls and respects `prefers-reduced-motion` by removing itself without fade.

An unrelated newer Play or terminal Stop removes the overlay. A rejected or early-settled NextTrack restores the prior visual state. On normal completion, the existing media/session/control path continues unchanged. No source, mapping, auth, helper process, window ownership or mpv timing policy is changed.

## Verification boundary

Node tests cover artwork selection, black fallback, pre-teardown show order, current-request readiness, fast switch ownership and failure cleanup. After the artwork-ratio fix, focused playback/window tests passed 43/43 and `npm test` passed 325/325; relevant JS syntax and `git diff --check` passed. Runtime provenance and user-visible NextTrack review are separate gates; neither is claimed by these static and unit results.
