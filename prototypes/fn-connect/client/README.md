# Standalone FN transport experiment

This CLI directory is excluded from production runtime assembly and installers. Its transport modules now reference the shared production source under `src/electronapp/enhanced/fn-connect/core/`; the default-off product experiment is separate. This is not a completed FN feature. See the [current contract](../../../docs/FN_CONNECT_V0417.md) for source recovery, authentication ownership, unsupported modes and acceptance gaps.

Run local regressions from the repository root with fixed Node.js 24.18.1 and PowerShell 7 on PATH (runner tests use synthetic subprocess/clock fixtures, without downloading Electron):

```sh
node --test tests/fn-connect-*.test.cjs
```

For a Windows synthetic Electron check, use a clean checkout of the exact reviewed commit and the project's fixed Node.js 24.18.1 and PowerShell 7:

```powershell
pwsh -NoProfile -File prototypes/fn-connect/client/run-windows-smoke.ps1
```

This runner obtains the official Electron archive pinned by the current product manifest, checks archive and executable identities, and runs only loopback fixture services with a fresh synthetic profile. It does not open a NAS or CDN, read a real profile or require credentials. Sandbox, context isolation and web security stay enabled. It refuses an existing `test-output/fn-connect-fixture` directory rather than overwriting evidence. Output is a normalized `result.json` there; raw Chromium stderr is not published. The runner may terminate its own timed-out fixture process tree, and removes its own synthetic profile only after confirmed process exit. A startup or pipe failure remains a failure, not a Session result.

An explicit original-ZIP cache can be selected instead of downloading:

```powershell
pwsh -NoProfile -File prototypes/fn-connect/client/run-windows-smoke.ps1 -ArchiveRoot 'C:\ETE-inputs\Electron-44.5.0'
```

The example directory must already contain `electron-v44.5.0-win32-x64.zip`: exactly **157966405 bytes**, SHA-256 **b3405d8847bc5054cd16272f538d22ba5b73032945e85cef26241f7135035278**. Keep the material's official-source record; matching the pinned hash proves byte identity, not its download history. No installed runtime, old application package, extracted tree, alternate filename or URL is accepted.

Only an absolute physical directory on a Fixed local drive is allowed. Network/UNC paths, reparse parents and reparse files are rejected before traversing them. The source is read exclusively, copied into the new owned temporary directory, and checked for size, SHA and changes; the copied ZIP is verified again before the unchanged extraction/EXE/source/worker-exit gates. A supplied cache root, including an explicit empty value, selects cache-only mode: missing, occupied, invalid or changed input fails with a fixed result and never falls back to downloading. Cache input is never edited, deleted, unlocked or resumed. Copy and verification share the same preparation deadline. With no `-ArchiveRoot` parameter the existing fixed official download remains the sole single transfer.

Preparation runs in one owned PowerShell worker with a shared 15-minute monotonic budget: source/manifest checks, one official download, complete archive size/SHA validation, extraction, executable SHA validation and a final clean-source check. Slow download progress does not renew the budget. `runner-status.json` is written at startup and contains only the round ID, source SHA, fixed stage, elapsed time and download byte count. A failed preparation writes a fixed `result.json` before recursive cleanup; a status-write failure must not prevent the independent failure result. Failed preparation materials are retained, and no Electron process is allowed unless the verified worker has exited. Unknown termination remains unconfirmed. No automatic download retry is added.

The deadline controls the preparation decision, not a hard real-time guarantee for OS filesystem calls or process-tree termination. Stop is scoped to this invocation's owned worker; if termination cannot be confirmed the evidence is retained and no further stage runs. The subsequent Electron/pipe waits retain their existing limits; this is not a whole-run cleanup deadline. New runner changes do not affect an older already-running checkout or establish a new real-Windows acceptance result.

The current pin is Electron 44.5.0, inherited from the product inputs. The three recovered historical runtime/startup diagnostic PowerShell scripts still describe 44.4.2 and should not be used for current acceptance. No Windows run has yet verified this revision, and the historical early-exit cause is unresolved.

For source review only: `electron-main.cjs` requires `--fn-connect-prototype`; `--remember-login` uses the existing Windows-only dedicated profile store. The external streaming consumer is off in live mode unless `--anonymous-media-relay` is supplied, and cannot coexist with `--single-external-header-check`. Full streaming is a different network scope from the old header-only trial. These CLI flags do not enable the separate product experiment or establish authorization to contact a server or consume a real media body. Product Native/CM integration remains unverified on Windows and real services. The current synthetic smoke includes authenticated API POST in addition to CookieJar/WS/media lifecycle stages; it does not start the product UI or libmpv.

Do not copy browser cookies, use real credentials in fixtures, disable sandbox/TLS checks, relax exact-origin gates, or treat a web page URL as an Emby API base. Any real verification needs a separately agreed target, flow and request budget.
