# Bounded playback engine diagnostics

The Diagnostics settings page offers Normal (default) and Detailed modes. Saving
the mode is atomic and affects the next Play request. It never reloads or sends
a playback command. Generations created while advancing routes within the same
Play keep that Play's selected mode. Turning Detailed off retains necessary errors.

Normal mode retains native operation errors, actual startup property execution
results, and bounded mpv fatal/error/warn messages. Detailed additionally retains
selected cplayer/demux/ffmpeg/decoder/output/curl context during startup, for at
most 15 seconds by collector receipt time. Successful startup, EOF, retirement,
and timeout end that context window; already queued messages are drained once.
No trace subscription, stream request, playback retry or player option change is
introduced. The existing separate debug log client is reused.

## Evidence and association

- `operation-error` carries the authoritative generation, property, numeric mpv
  result and fixed mpv error description. It is persisted in Normal mode.
- `startup-property-result` records the actual native set-property return for
  start, pause, aid, sid, hwdec and keep-open. `applied` reports API execution,
  not successful decoding or playback. Command submission remains separate.
- Network observations preserve `streamOk`, `declaredContentSize`, `seekable`
  and `mpvLevel` when available. Declared size is not bytes transferred, and a
  206 status alone does not demonstrate a usable stream or a successful seek.
- Engine text has no native media identity. Its authoritative `generationId`
  remains null. Candidate generation/request fields describe only the active
  generation context. Delayed old-source messages can overlap that context.
  They must not be treated as exact request attribution.
- Sequence numbers, native deduplication/retention drops and observed snapshot
  gaps expose incomplete collection. Absence of a message is not proof of the
  absence of a fault. Coalescing/backpressure can omit intermediate context.

## Bounds and privacy

Each native generation retains at most 16 errors, 8 warnings and 40 context
messages. Each lane reserves its first half and rotates its latter half. Error
slots cannot be consumed by context or warnings. Text is scrubbed before IPC,
then limited to 384 UTF-8 bytes; input above 64 KiB becomes an explicit omission.
Native snapshots are coalesced by generation, emitted at most four times per
second, and constrained by the existing 64 KiB frame and 256 KiB pending budget.
Authoritative media messages can evict optional diagnostic snapshots.

Parent-side errors and context use independent admission/pending budgets: 60
error/warn and 180 context records per minute, each with at most 32 writes in
flight. Existing JSONL rotation remains approximately four files of 2 MiB each.
Export includes retained engine records and does not enable extra collection.

Credential header values, bearer credentials, named secret assignments, URL
userinfo and complete remote URL paths/queries are removed before truncation.
The parent revalidates and scrubs again before persistence. Fault descriptions,
server authorities and ordinary local media paths remain useful evidence and
can contain private information. The settings page and export warn users to
review the report before sharing. No raw stderr or raw log fallback is enabled.

## Verification

```powershell
node --test tests/engine-diagnostics.test.cjs tests/engine-diagnostics-native.test.cjs tests/native-helper-service.test.cjs
```

The native test compiles the exact production projection/scrubbing/window code
and executes synthetic failures, credential canaries, deadlines and floods. It
does not load libmpv or play media. CPU timing and retained wire size are printed
as synthetic measurements; they are not FPS or real-media acceptance results.
The full helper must also be built from the final commit using the pinned
compiler tree and verified with native-helper provenance before packaging.
