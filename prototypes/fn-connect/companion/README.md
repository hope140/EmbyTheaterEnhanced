# ETE FN companion: mock review scaffold

This is original ETE design code and a non-installable review skeleton. It does
not include Ting Reader source, authentication/signing material or upstream
launch scripts. The repository's license applies to these original files.

Candidate route: an fnOS-registered app gateway reaches an app-owned Unix socket;
a small companion would forward to one explicitly configured local Emby service.
The gateway authorizes access; Emby continues to authenticate its own users.
An Emby plugin cannot by itself register that fnOS route. Existing NAS mappings,
permissions and endpoint addresses are unknown; none are assumed by this scaffold.

`config.mock.json` is strictly disabled and mock-only. The candidate app ID,
socket name and prefix are reserved design values, not an installed NAS mapping.
`activateMock: true` only enables an injected in-memory upstream. The
`gatewayAuthorized` flag is a synthetic test input, not production access control.
There is no network client, listener, socket, system API, media filesystem access
or credential store. Production configs and installable package targets fail.

The mock strips the candidate prefix, preserves the request method/query/body and
Emby Authorization/Range headers, and removes gateway cookies/headers and
hop-by-hop headers. This is a proposed boundary, not proof of actual HTTP, cookie,
streaming or native-player compatibility. All Cookie headers are currently
removed; support for any Emby cookie-based authentication is unverified.
Responses pass through unchanged. No cache, retry, route switching, response URL
rewrite or WebSocket upgrade is implemented. Cancellation retires late success;
an upstream that ignores its AbortSignal can remain pending.

From the repository root, create a review document:

```sh
node prototypes/fn-connect/companion/prepare-review.cjs > /tmp/ete-fn-companion-review.json
node --test tests/fn-connect-companion.test.cjs
```

The JSON document binds every included text entry by SHA256. It is not a `.fpk`
and must never be renamed or installed as one. Templates retain unresolved fnOS
schema, access policy, package version and socket ownership fields. The shell
template always exits 78 and starts nothing. No fnpack toolchain is selected or
invoked. A future real package must separately supply a validated bridge binary,
socket lifecycle, a single approved upstream endpoint, gateway authorization and
permissions, license/source notices, and tested install/rollback behavior.

See the repository's `docs/FN_CONNECT_COMPANION_PLAN.md` for evidence, the design
comparison, remaining gates and the complete minimum real-test authorization.
