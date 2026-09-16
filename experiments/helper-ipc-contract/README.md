# Helper IPC lifecycle and generation safety spike

Pure JavaScript research model for the Phase 2 B architecture:

```text
Electron main/controller <-> private inherited IPC <-> native helper <-> libmpv
```

It imports no production player, opens no socket, starts no native executable and needs no GUI, Emby server, media or libmpv. It does not modify `src/**`.

## Run

```powershell
node experiments/helper-ipc-contract/verify.cjs
```

The verifier uses a controlled scheduler. It performs no wall-clock sleep and exits nonzero on any failed case or required invariant. The current matrix covers ordered/reversed/duplicate/unknown responses, stale helper/generation traffic, absolute timeout, cancellation, helper crash/recreate, rapid Play A -> B -> C, delayed application callbacks, NextTrack, Stop, destroy/recreate, malformed/missing/future identities, framing and bounded event/diagnostic storms.

`TEST_TIMEOUT_MS=50` is an experiment parameter, not a production recommendation.

## Files

- `protocol.md`: proposed lifecycle/identity/framing contract and upper API mapping.
- `model.cjs`: message validation, controlled clock and length-prefixed JSON decoder.
- `fake-helper.cjs`: in-memory private transport and programmable fake helper.
- `controller.cjs`: research-only request registry, generation/helper lifecycle and stale filtering.
- `fault-injection.cjs`: deterministic fault and race cases.
- `verify.cjs`: invariant verification and machine-readable evidence writer.
- `evidence/`: deterministic result matrices.

## Boundaries

This model proves that the stale-message and request-lifecycle rules are internally consistent under the enumerated deterministic injections. It does not prove native pipe throughput, OS pipe failure behavior, parent-death cleanup, actual mpv event ordering, audio/video correctness, Session/WebSocket behavior or production adapter compatibility. Those remain integration work after architecture approval.
