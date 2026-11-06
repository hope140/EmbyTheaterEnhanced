# Standalone FN transport experiment

This CLI directory is excluded from production runtime assembly and installers. Its transport modules now reference the shared production source under `src/electronapp/enhanced/fn-connect/core/`; the default-off product experiment is separate. This is not a completed FN feature. See the [current contract](../../../docs/FN_CONNECT_V0417.md) for source recovery, authentication ownership, unsupported modes and acceptance gaps.

Run local Node regressions from the repository root:

```sh
node --test tests/fn-connect-*.test.cjs
```

For a Windows synthetic Electron check, use a clean checkout of the exact reviewed commit and the project's fixed Node.js 24.18.1 and PowerShell 7:

```powershell
pwsh -NoProfile -File prototypes/fn-connect/client/run-windows-smoke.ps1
```

This runner obtains the official Electron archive pinned by the current product manifest, checks archive and executable identities, and runs only loopback fixture services with a fresh synthetic profile. It does not open a NAS or CDN, read a real profile or require credentials. Sandbox, context isolation and web security stay enabled. It refuses an existing `test-output/fn-connect-fixture` directory rather than overwriting evidence. Output is a normalized `result.json` there; raw Chromium stderr is not published. The runner may terminate its own timed-out fixture process tree, and removes its own synthetic profile only after confirmed process exit. A startup or pipe failure remains a failure, not a Session result.

The current pin is Electron 44.5.0, inherited from the product inputs. The three recovered historical runtime/startup diagnostic PowerShell scripts still describe 44.4.2 and should not be used for current acceptance. No Windows run has yet verified this revision, and the historical early-exit cause is unresolved.

For source review only: `electron-main.cjs` requires `--fn-connect-prototype`; `--remember-login` uses the existing Windows-only dedicated profile store. The external streaming consumer is off in live mode unless `--anonymous-media-relay` is supplied, and cannot coexist with `--single-external-header-check`. Full streaming is a different network scope from the old header-only trial. These CLI flags do not enable the separate product experiment or establish authorization to contact a server or consume a real media body. Product Native/CM integration remains unverified on Windows and real services. The current synthetic smoke includes authenticated API POST in addition to CookieJar/WS/media lifecycle stages; it does not start the product UI or libmpv.

Do not copy browser cookies, use real credentials in fixtures, disable sandbox/TLS checks, relax exact-origin gates, or treat a web page URL as an Emby API base. Any real verification needs a separately agreed target, flow and request budget.
