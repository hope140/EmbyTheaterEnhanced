# NextTrack transition artwork

## Scope

The user-observed NextTrack gap exposes the desktop through the transparent main BrowserWindow after the playback surface hides. This change keeps the existing PlaybackManager, Resolver, Session, Native Helper and mpv source-selection flow. It adds one visual layer inside the existing main-renderer `.mpv-videoPlayerContainer`, below the Emby OSD controls and with `pointer-events:none`.

## 2026-10-07 user acceptance follow-up

The user rejected candidate `88f56b7` visually: NextTrack showed black, then artwork, then black, then video; PreviousTrack still exposed transparency. PreviousTrack was not wrapped at all. The renderer adapter now also wraps `previousTrack()`, selecting exactly `manager.getCurrentPlaylistIndex(player) - 1` from the existing queue and invoking the original method synchronously with its receiver and arguments intact. Start-of-queue, non-Video and other-player paths retain their original behavior, and mixed Next/Previous requests retain transition token ownership.

The two black intervals remain unverified at the presentation layer. Artwork loads asynchronously and can leave the black fallback visible; the fade still uses `core-playing` plus renderer paint, not a native first-presented-frame signal. This follow-up does not add artwork waits, prefetching, fixed delays, visibility protocol changes or a first-frame claim. The previous-entry correction is independently tested; it is not a declaration that overall visual acceptance has passed.

## Source and lifecycle contract

The Video OSD next button calls `PlaybackManager.nextTrack(currentPlayer)` (`vendor/carnival/electronapp/www/videoosd/videoosd.js:2093-2096`). In the local managed queue, `getNextItemInfo()` synchronously returns the next Item before `playInternal`; the existing public `nextItem()` performs an asynchronous `getItem` request. The overlay uses the same queue Item already selected by PlaybackManager and does not add an API request. An external/self-managed player still follows its original `nextTrack()` path without this overlay.

For the current libmpv video player, a narrow wrapper around `nextTrack()` shows the visual layer synchronously and invokes the original method immediately with the original receiver and arguments. The existing manager request sequence is therefore established before any asynchronous rendering work. When that same player's `stop(false)` runs, it lets one renderer paint complete before the existing stop/hide command. This is a rendering boundary, not a fixed-time sleep. It does not discard or coalesce rapid NextTrack calls. A hidden document skips the paint gate so background control cannot wait indefinitely for `requestAnimationFrame`.

The transition states are `IDLE → TRANSITION_SHOWING → LOADING_NEXT → PLAYBACK_READY → HIDE_TRANSITION → IDLE`. The manager's existing `_etePlayRequestSequence` associates the newest overlay with its corresponding libmpv request. Old play responses cannot fade or clear the newest layer. The layer remains over the existing `stop(false) → surface hide → PlaybackInfo/source resolution → loadfile` gap. The current request's `core-playing` boundary first signals the native surface visible, then the overlay waits one more completed renderer paint before fading. This is the best available ready proxy; actual first presented video frame remains a foreground visual acceptance item.

Artwork source order is the Item's first `BackdropImageTags` entry, then `ImageTags.Primary` or `PrimaryImageTag`, each passed through the existing `ApiClient.getImageUrl()`. The overlay container fills its video host (`position:absolute; inset:0; overflow:hidden`); its image fills the container with `width:100%; height:100%; object-fit:cover; object-position:center`. This lets landscape backdrops cover the video area and crops portrait posters to the same area instead of shrinking them. With no usable image, or if image loading fails, the layer stays solid black. Image loading never blocks NextTrack; URLs and Item identifiers are not written to diagnostics. The overlay has no focusable controls and respects `prefers-reduced-motion` by removing itself without fade.

An unrelated newer Play or terminal Stop removes the overlay. A rejected or early-settled NextTrack restores the prior visual state. On normal completion, the existing media/session/control path continues unchanged. No source, mapping, auth, helper process, window ownership or mpv timing policy is changed.

## 2026-10-06 cleanup audit

Visual paint waits are now owned and cancellable. Clearing the current transition releases its pending paint promises, visibility listeners and queued animation frames. Errors scheduling either animation frame reject after cleanup so the existing `stop(false)` caller can continue its fail-open path. A newer transition still retains its token protection; no PlaybackManager or libmpv generation logic is changed.

Fade cleanup handles both `transitionend` and `transitioncancel`. Where available, the renderer animation list also supplies a completion promise, and an element with no active animation is cleared immediately. Hidden documents and reduced-motion rendering skip the fade. These paths retain token checks and introduce no polling or delay timers.

The isolated Electron probe passed visible fade cleanup. A never-shown BrowserWindow can report `document.visibilityState=visible` while its CSS animation completion remains suspended; the tested hidden window cleaned up after reveal. This is recorded as a hidden-rendering limitation, not proof of a visible presentation defect or permission for a window/focus workaround.

## Verification boundary

Node tests cover artwork selection, black fallback, pre-teardown show order, current-request readiness, fast switch ownership and failure cleanup. After the artwork-ratio fix, focused playback/window tests passed 43/43 and `npm test` passed 325/325; relevant JS syntax and `git diff --check` passed. Runtime provenance and user-visible NextTrack review are separate gates; neither is claimed by these static and unit results.
