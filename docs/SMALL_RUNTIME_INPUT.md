# Fixed small runtime input snapshot

Current release selection: [the scoped legacy-resource audit](LEGACY_RESOURCE_RETIREMENT.md) excludes nine compatibility resources and one small notice from new runtime output. Original snapshot bytes/manifests and notices remain preserved and strictly validated; the historical byte-preservation statements below describe input storage, not the new output selection. Runtime reports carry separate output counts, bytes, tree hashes and excluded identities.

Four packaged inputs are independently preserved under `vendor/small-runtime/snapshot-v1`: `cec-driver/cancel`, `config/system.xml`, `electronapp/plugins/mpvplayer/strings/zh-CN.json` and the legacy Chinese notice text file named in the manifest. Their combined 5,216 bytes and runtime paths are unchanged. Model is excluded.

`vendor/small-runtime-manifest.json` locks the exact four paths, sizes, SHA256 identities, tree identity and source boundaries. These are preserved historical packaged bytes, not a claim of ETE authorship or newly recovered official sources. The Chinese translation and notice retain their existing bytes without an invented license. Existing project source/notice records remain applicable; source and public redistribution questions remain open where marked.

## Preparation and verification

~~~powershell
node tools/small-runtime-input.cjs import . <preserved-four-file-snapshot-root>
node tools/small-runtime-input.cjs validate .
~~~

The explicit importer validates all four files before creating a destination. It does not copy unrelated source files. The prepared component rejects missing, changed, extra or redirected entries. Assembly preserves opaque bytes, including the zero-byte CEC marker, and rejects existing output files. Neither the marker nor configuration is executed or applied to the user environment. `config/system.xml` is not parsed, rewritten or used to change auto-update settings.

`prepare.ps1 -SmallRuntimeSnapshotRoot` is the explicit first-restore entry. Ready components are validated. Normal preparation and assembly do not fall back to these four old Carnival paths. The base assembler verifies the snapshot's identities against the historical manifest, then excludes those old physical paths from consumed input selection. The remaining Model DLL retains its original hash and strict validation. Runtime provenance checks the delivered four files and binds the snapshot and generator identities.

Snapshot bodies remain ignored by Git and local only. A source clone alone cannot restore them; approved material storage is still required for cloud recovery. This component is not a full source-rebuild claim.

## Validation boundary and next steps

The required old Carnival selection falls from five files to Model alone; old patch input remains zero. Validation removes the four old paths only in the isolated task copy and compares 822 base files, 937 transformed intermediate files and 720 final Web files against the retained baseline. Original user materials are preserved. Unit/static evidence is separate from full-package or playback acceptance.

The final Model removal can use a separate original-byte snapshot of the existing 424,960-byte DLL with its current SHA256, origin uncertainty and no official replacement. That is a future component change, not part of this stage. Before a final package candidate, coordinate the separately released 0.3.15 exit fix (`e150981d85369b9e61559ee53978a25cdad6f7ad`). This branch does not silently merge or cherry-pick it, change Model/UI/version, or launch the application.

## Current repository restoration update (2026-10-21)

The user authorized tracking the exact required Web, compatibility-resource, small-runtime and original Model snapshots in this same repository. The 775 manifest-listed files (51,953,202 bytes) use ordinary Git with `-text` attributes to preserve bytes. Historical local-only/ignored-storage statements below describe earlier stages and are superseded for these four roots. Source attribution and unresolved exact revisions remain unchanged; storage permission is not a claim of new third-party authorship or complete corresponding source. libmpv stays ignored and is restored from the pinned archive via `node tools/prepare-libmpv.cjs .`; see [repository inputs](REPOSITORY_INPUTS.md). No old full installer/patch or real user profile is included.
