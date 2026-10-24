# Isolated Windows runner range smoke

The branch adds a short input to the existing manual `public-ci.yml` workflow; it does not require a new workflow to be registered on the default branch. `range_smoke=off` preserves the existing manual package route. Select `loader-trial` only for the [explicit one-file derived dependency experiment](PLAYBACK_RANGE_LOADER_TRIAL.md). Select `entry` for only the actual fixed-Electron entry check, or explicitly select `native` for entry followed by the synthetic populate/reopen checks. `release_package` must remain false. The range route is restricted to `feature/playback-range-cache` in the same repository; it is not a PR/push task and does not build, install, publish or dispatch anything itself.

In loader-trial mode, current controller tools perform safe startup diagnostics and strict derived verification; the c9 checkout remains the unchanged original verifier.

The controller checkout uses the dispatch's exact `github.sha`, recorded in the evidence; the playback tools are a separate checkout of **c9cd9bacf81445c9c10befd121951b1c63c86faa**. The existing package/public jobs retain their permissions and concurrency. The new job uses standard `windows-2022`, its own concurrency group with cancellation disabled, and a 15-minute job budget. No user desktop, workstation process monitoring, private profile or server is consulted. A preceding denied workstation process query must not be retried or moved into this workflow.

## Fixed inputs and acquisition

| Input | Exact identity |
| --- | --- |
| Candidate source | `162dc69f9c3438d99508c90321a889b693b6b10a` |
| Successful source run | `40067805498` |
| Artifact ID | `12551020498` |
| Original artifact ZIP | 164367963 bytes, SHA256 `b35d89c4d7070bc4e56223802b0db666befbc4623a43f18b8fee5a4ec67083cc` |
| Installer | SHA256 `17df456db78dc726c27e0e882c568dbc875839cbf5f68e967b452bd62e880e6b` |
| Smoke tools | `c9cd9bacf81445c9c10befd121951b1c63c86faa` |

The new job adds only job-scoped `contents: read` and `actions: read`; the standard GitHub token is supplied **only to the download step**, never as a job/global variable or saved in `GITHUB_ENV`. GitHub's [artifact API](https://docs.github.com/en/rest/actions/artifacts#download-an-artifact) requires Actions read access for authenticated downloads. No PAT or new secret is needed. Metadata must match the artifact/run/source and successful completion; expiry, missing input, denied access or mismatching digest stops the route. The raw ZIP is downloaded and checked, rather than trusting an automatically extracted directory. API credentials are never forwarded to signed-storage redirects, and signed URLs are neither printed nor stored.

**Expired or unavailable artifact:** stop and retain the acquisition failure. Do not search by name for a newer artifact, rebuild/repackage, import an old installed runtime or relax hashes. Any replacement identity requires a separate explicit review/lock update before another run; this flow offers no automatic replacement. Artifact availability is established only by the authorized acquisition step.

The only extra component is the already pinned innounp ZIP (572593 bytes, SHA256 `ac1d98bba6588072ade06163781938df274f444bec7318069668608d1e5faae8`), selected from the fixed tools' existing CI input plan. Its whole extracted tree and executable are verified. It only tests/extracts the exact installer with `-t` / `-x -b`; the installer/Host is never executed. The extracted runtime then passes the unmodified candidate ZIP/manifest/source/native gates in the fixed smoke tools. No Host build, MSYS2, libmpv acquisition, npm installation or full packaging chain is run.

## Execution and evidence

A fresh directory under runner TEMP owns the archives, unpacked inputs, generated media and trial profile. Download credentials are removed from extraction children and all smoke child environments. The existing profile and synthetic-media contracts in [the native method](PLAYBACK_RANGE_WINDOWS_SMOKE.md) remain: APPDATA/LOCALAPPDATA/MPV_HOME and profile isolation, 16 MiB test media quota, 1 MiB/s background test value, anonymous loopback sources and no real media. These are test parameters, not approved product capacity/network defaults.

The exact tools keep the entry deadline of 20 seconds and each native phase deadline of 120 seconds. An explicit `native` run still starts with a fresh successful entry proof before populate/reopen, and never proceeds after a failed phase. Required owned child exits are observed by the original controller; no general process enumeration, permission escalation or foreign PID query is introduced. The outer wrapper has a 600-second command backstop, which can stop its own coordinator but does **not** establish Electron/helper exit. Missing/failed owned-exit evidence is uncertain, never acceptance. Job cancellation/disposal likewise cannot prove native cleanup, and `always()` upload is best effort under forced job termination.

D3D11 remains required by the unchanged helper. A hosted runner label does not guarantee a compatible graphics/session context. If initialization fails, report that environment limitation; do not change renderer, GPU options, decoder, timeouts or profile to manufacture a pass. Passing this method proves the documented synthetic transport/decode/lifecycle scope, not visible-picture, audio, real Emby/proxy, NAS or installation acceptance.

Only allowlisted control/acquisition/extraction/execution and per-phase receipts are collected. Profile files, binaries, downloaded ZIPs and environment dumps are excluded. Each JSON/NDJSON is limited to 1 MiB (oversize is recorded and fails collection); stdout is limited to a 512 KiB tail with original size/truncation recorded. `collection.json` describes the evidence actually retained. The artifact uses one-day retention. No existing test artifact is overwritten.

## Operator selection

The coordinating operator selects the delivered branch commit in the existing manual workflow and supplies:

```json
{"range_smoke":"entry","release_package":false}
```

After examining that run, the operator may explicitly select `range_smoke=native` for a new isolated job. This repository change does not dispatch either mode. The server-side branch-input dispatch remains untested here; if GitHub refuses it, stop and report that prerequisite rather than editing the default branch or auto-merging. Confirm the workflow's recorded source SHA matches the intended delivered controller commit; the playback tool checkout remains fixed independently.

Estimated execution is about **5–10 minutes**, excluding runner queueing and assuming the pinned artifact remains available. This consists of checkout/Node setup, downloading the existing 164 MB ZIP and small unpacker, static verification/extraction and the short native checks. It avoids rebuilding a package merely to validate the entry point.
