# DirectPlay subtitle track mapping

The native adapter resolves an embedded DirectPlay subtitle by its unique container stream index (`MediaStreams.Index` to the non-external mpv subtitle track's `ff-index`) and writes the actual mpv track `id`. External subtitles do not consume embedded IDs and no guessed `sid` is written before `sub-add cached`.

The native service exposes a track table only after the current generation's `file-loaded`. Default selection retains its original selection owner while waiting for playback readiness without blocking unpause. An interactive selection uses a bounded lookup. A missing, duplicate or unavailable identity never falls back to list position; the previous subtitle is disabled and a fixed diagnostic reason is recorded. Stop, replacement, newer selection and route generation changes retire delayed work.

Generated VideoSideData closed-caption tracks retain their existing non-container mapping. DirectStream and Transcode retain their previous embedded selection contract: source indexes do not prove remuxed output identity. This change does not claim to fix that separate mapping boundary or establish a particular user's incident cause.

Validation: `node --test tests/subtitle-selection-ownership.test.cjs tests/native-helper-service.test.cjs tests/native-helper-diagnostics-playback.test.cjs`. For an optional headless real-mpv synthetic check, run `node tools/test-subtitle-track-mapping.cjs --mpv <existing-mpv-executable> --ffmpeg <existing-ffmpeg-executable>`. It exercises the production selection functions, three external-list positions, repeated cached loading and both embedded tracks without loading a product profile. It does not replace installed-client or real-server acceptance.

Add `--reported-layout` to synthesize four audio streams and seven embedded subtitle streams (container indexes 5–11), and exercise default external → first embedded → third embedded selection. This remains synthetic media, not a replay of a private user file.
