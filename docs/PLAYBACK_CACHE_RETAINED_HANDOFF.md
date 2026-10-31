# Retained playback: actual Range validation

Last-playback retention can recover an index after the application reopens. The index contains source identity and validator hashes, not credentials or raw validator strings. A recovered entry is a candidate for reuse; it does not prove that a new playback request is authorized or that the source bytes are unchanged.

The retained handoff races local metadata recovery against the existing one-byte source probe. It keeps the current 50 ms selection deadline and 30 ms cache-read protection. A slow or empty index does not delay the existing probe path. A local candidate can cancel the redundant probe only after checking any already observed denial and joining physical request closure. Expiry keeps that playback on its original source; a late recovery cannot switch it to cache.

Each candidate is an opaque, same-store capability bound to the full source identity, the exact retained entry instance and the new playback owner. It cannot be cloned, transferred to another store, revived by recreating the same key, or used after another actual media entry replaces it. Candidate lookup and route creation do not promote actual playback, alter retention roles, or count a cache hit.

Before any retained bytes can be selected for a player response, that response's real upstream Range must have exact 206 status, Content-Range, length, total size and identity encoding. Its fresh strong ETag must hash to the stored strong ETag. This binds the response to the retained representation without a separate serialized 0–0 round trip. The first retained validation request has a separate 50 ms response-header deadline, shared by concurrent HEAD/GET requests. Expiry cancels the request and follows the zero-delivery original-source fallback; a delayed timer callback cannot accept late headers. Timely validated headers restore the ordinary body timeout. Physical request closure and fresh fallback authorization still have to finish: this is not a 50 ms total-startup or redirect guarantee. The original retained key is preserved; a hash is never sent as a raw ETag. Subsequent requests use the fresh raw validator only in memory. Entry ownership is checked again after asynchronous reads and before actual promotion.

If the real source body arrives before the cache, it can serve that response immediately. A later Range may use the now validated cache. A changed strong version cannot use old bytes: a valid same-size response is forwarded directly and the captured old entry is invalidated. A changed size, missing validator, or weak validator falls back before bytes are delivered. Missing proof alone does not delete a possibly valid retained entry. A running player is not switched to a different URL after bytes have been delivered.

This path applies only when playback retention is enabled and the existing source, authority, budget and representation checks pass. It does not broaden accepted sources, change settings defaults, introduce background downloads, or add startup prewarming. Preloaded next-episode sessions keep their existing handoff path.

## Evidence and limits

`retainedHandoff` means the recovered candidate was selected, not that a response was delivered or decoded. `retained-validated` records a successful fresh Range validator comparison. Existing selected-local, queued and socket-flushed counters retain their distinct meanings; none proves successful decoding.

Targeted tests cover probe/recovery races, known denials, physical-close and deadline expiry, fresh budget failure, exact Range and strong-version gates, source/cache competition, replacement during reads, and same-key replacement protection. The real store suite closes and reopens the disk index, verifies retained reads and rejects identity, owner and entry-instance mismatches. Actual Windows execution and Native playback measurements must be reported separately from event doubles and source tests. No startup speed improvement or green-frame fix follows from these tests alone.

Strong ETags remain an origin-server contract. A server that reuses a strong ETag for changed bytes defeats this version check; detecting that requires independent content verification. Cold disk initialization or slow physical request closure can still miss the fixed selection deadline and safely use the original source. Sources without strong validators use the existing conservative path.

## Design references

- [RFC 9110, combining partial content](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.7.3): partial responses require compatible strong representation validators.
- [Chromium partial cache handling](https://github.com/chromium/chromium/blob/main/net/http/partial_data.cc): sparse entries require strong validators and exact response-range checks. Its separate truncated-entry probe is not claimed to be removed by this design.
- [AndroidX Media3 CacheDataSource](https://github.com/androidx/media/blob/release/libraries/datasource/src/main/java/androidx/media3/datasource/cache/CacheDataSource.java): cache and upstream share byte ranges, with a nonblocking upstream path when cache access is unavailable.

These sources inform the boundaries; their implementation is not copied.
