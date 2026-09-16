# Helper native-pipe integration spike

Research-only Windows harness for Phase 2B. It launches a real native executable over private inherited `stdin`/`stdout` pipes, dynamically loads the project's existing `mpv-1.dll`, generates deterministic local PCM WAV media, and verifies event attribution, framing, request lifetime, crash/recreate, parent death, and bounded backpressure behavior.

Nothing in this directory is imported by production code. The helper exposes test-only crash and stress methods and must not be shipped.

## Protocol

- Protocol version: `1`.
- Framing: `uint32 little-endian payloadLength` followed by strict UTF-8 JSON.
- Limits: 64 KiB per frame, 128 KiB receive buffer, 128/256 KiB decoded inbound queue, and 128/256 KiB pending output queue.
- Identities: `helperInstanceId` on every message, `generationId` on media-scoped messages, and `requestId` on response-bearing traffic.
- `stdin`: parent to helper protocol; `stdout`: helper to parent protocol; `stderr`: diagnostics only.

## Event attribution

- `MPV_EVENT_START_FILE` and `MPV_EVENT_END_FILE` use the bundled header's native `playlist_entry_id`.
- `MPV_EVENT_FILE_LOADED` has no payload identity in this API. It is accepted only when the native state machine has exactly one open playlist-entry mapping; ambiguous events fail closed as unattributed.
- property changes, including `core-idle`, use a per-generation `mpv_observe_property` `reply_userdata` token.
- `MPV_EVENT_COMMAND_REPLY.reply_userdata` correlates the load submission request only. It is never treated as file-loaded or playing evidence.

The helper serializes unbound load submissions until `START_FILE` binds the load to a playlist entry. It does not stamp incoming events with the current generation.

## Run

The experiment reuses an existing local mpv header and DLL. It does not download or upgrade anything.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\experiments\helper-native-pipe\build.ps1 `
  -InputRoot <phase-2-native-input-root> `
  -Libmpv <existing-mpv-1.dll> `
  -OutputRoot .\.work\helper-native-pipe-build

node .\experiments\helper-native-pipe\run.cjs `
  .\.work\helper-native-pipe-build\helper-native-pipe.exe `
  <existing-mpv-1.dll> `
  .\.work\helper-native-pipe-run `
  .\.work\helper-native-pipe-build\runtime-provenance.json
```

Generated binaries and media remain under ignored `.work/`. Committed machine-readable results are under `evidence/`.

## Safety boundary

The harness creates no listener, named public endpoint, HTTP/WebSocket transport, renderer-accessible handle, shell forwarding, or arbitrary filesystem RPC. Media paths are limited to WAV files created by `generate-media.cjs`. Parent-death cleanup relies on inherited pipe EOF and is verified by a separate supervisor.
