# Range-cache source eligibility and resource decisions

This document records local fixture evidence for the independent range-cache candidate. It is not proof of any real proxy, Emby server, account or CDN behavior. The first implementation still rejects all redirects and does not add a header or cookie authentication provider.

## What the current implementation can select

| Response or source condition | Current behavior | Evidence boundary |
| --- | --- | --- |
| Current API origin; static video; current URL grant; exact 206, strong ETag and known length | May select loopback Range source; subsequent holes require the same representation | Actual cache/session/service plus synthetic 64-byte HTTP body |
| Same-origin 302 | Dispatch original source; do not follow Location | Redirect target receives no cache-layer request |
| Cross-origin 302, including a signed target URL | Dispatch original source; do not copy query grants, Authorization, Cookie or X-Emby-Token to a target | Two separately bound loopback origins; target receives no request |
| Final playback URL already differs from the API origin | Dispatch original source without cache-layer probing | Production context validator and service dispatch |
| Origin requires Authorization, Cookie, token header or combinations | Probe is not silently authenticated; dispatch original source after denial | Synthetic canaries only; there is no implicit header/cookie provider |
| No ETag, weak ETag or Last-Modified alone | Dispatch original source | No date-based validator relaxation |
| Initial Range ignored with full 200, 416 or short body | Dispatch original source | Actual strict reader and service source selection |
| ETag changes, If-Match returns 412, Range later becomes 200/416, or later body is short | Fail that missing-range request; commit no new block | Previously validated blocks remain version-bound; this is not seamless original-source restart |
| Seek cancels an in-progress range | Abort only that owned response/request; a new seek may read another range | Wait for physical origin/socket close; cancelled block is not committed |

The header-dependent redirect fixtures first make a separate, explicitly synthetic control request to establish that the server would return 302 when the expected canaries are present. The production reader then sends none of these sensitive headers and declines the origin rather than guessing an authentication provider. Response Set-Cookie does not create a cookie jar; ad-hoc reader `headers` options are not forwarded. These assertions must not be interpreted as support for header-authenticated media.

The service tests capture the actual loadfile source passed to an explicitly mocked helper. Original-source dispatch proves preservation of the existing playback path, not that this mocked helper followed a redirect or decoded its target. The real decoder fixture described in [the range contract](PLAYBACK_RANGE_CACHE.md) covers a directly served synthetic MP4, not a redirected source. HTTPS certificate behavior, real proxy routing, visible Windows playback, subtitle/Session behavior and real authorization remain outside these HTTP fixture results.

A deployment whose media URLs redirect may therefore have no cache-eligible media today, even though ordinary playback continues on its original path. No actual deployment has been queried by this matrix.

## Safe next steps for redirected media

Keep the existing original-source fallback until an explicit redirect contract is reviewed. A future same-origin route would need a bounded redirect chain, a fresh existing authorization provider, cancellation, exact final-resource/validator identity and a repeatable no-leak test. A future cross-origin signed-resource route would also need a rule tying the current authorized media to that exact final representation, fresh signature lifetime checks and zero sensitive-header or cookie forwarding. Neither route can be implemented by copying account headers to Location, stripping a version guard or treating ETag as globally unique across resources. Header- or cookie-dependent cross-origin targets remain an original-playback case unless an actual supported authorization contract is supplied.

Only redacted response capabilities are needed to decide whether a real source fits: redirect/no redirect, same/different origin, status, Range support, validator type/presence, length stability and whether an existing supported provider is required. Do not collect raw URLs, signatures, tokens, cookies, account identifiers or request headers into public diagnostics. This document adds no live-source probe or NAS request.

## Product choices versus engineering trial limits

| Field or behavior | Status and meaning |
| --- | --- |
| `progressPercent` | Confirmed product choices 50/60/70/80/90; default 70 |
| `preloadMB` | Confirmed choices 100/300/500 MB; default 300; this is a prefix budget, not a total disk quota |
| Last actual video lifetime | Confirmed: no TTL; retain until another video actually starts; readers release before deletion |
| Unplayed next prefix at exit | Confirmed: discard; browsing/preloading does not promote it |
| `maxBytes` | Explicit trial hard raw-media-byte limit across last, next and retiring readers. Bounded test/store input only; not the existing mpv packet-buffer budget or an additional product preference |
| `bytesPerSecond` | Explicit background-preload trial limit; foreground reads are not throttled by it. Optional diagnostic limit. Normal automatic scheduling has no numeric MB/s default or required rate input; it uses one media/probe request, foreground preemption and cancellation |
| `minFreeBytes` | Explicit engineering free-space safety reserve in the bounded raw-byte trial. No additional user-facing reserve setting or default is selected |
| `timeoutMs` | Explicit engineering per-origin-request deadline, bounded by 30000 ms; no new user-facing timeout choice is implied |
| Block size, outstanding-work bounds, index bound and ownership guard | Engineering constraints, not additional product cache preferences |

No production disk quota, free-space reserve, bandwidth or network policy is inferred from the existing mpv memory-buffer setting. No new defaults for these fields are introduced here. At capacity, this trial continues foreground playback without writing additional blocks and stops preloading. It does not reserve a hidden slice for the next episode, evict the retained last object early or promise that the chosen prefix target can always fit. The corrected product requirement is to retain only mpv's existing bounded buffer, with the next-prefix budget independent; it does not await a separate last-cache capacity or total-budget split. This raw-byte matrix remains useful transport evidence, but is not evidence of packet snapshot/restore. See [the fixed-source audit](PLAYBACK_BUFFER_RETENTION_DESIGN.md).

## Reproduce

```sh
node tools/prepare-preload.cjs
node --test tests/playback-range-origin-matrix.test.cjs
node --test --test-concurrency=1 tests/*.test.cjs
```

The first command prepares the repository's generated preload input; its absence is an input failure, not an implementation regression. Full-repository output and skipped platform tests must be reported separately from the focused matrix. The public runner uses its separately declared six material-test exclusions; a full local run does not silently inherit those exclusions. Windows build preflight is governed by [the strict Framework servicing profiles](FRAMEWORK_SERVICING_PROFILES.md); it neither installs a Framework nor accepts arbitrary signed hashes.

Range fixtures canonicalize temporary roots before invoking the unchanged strict product path validator, so an inherited TEMP short-name alias cannot become an invalid product root. Server cleanup explicitly awaits each owned socket close as well as server close; a server callback alone is not used as physical-close evidence. These portability guards do not substitute for a Windows runtime run.
