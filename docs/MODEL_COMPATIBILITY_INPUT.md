# Original-byte Model compatibility snapshot and zero legacy inputs

`vendor/model-compatibility/snapshot-v1/MediaBrowser.Model.dll` preserves the existing 424,960-byte packaged DLL. SHA256 is `f2eeca1c65e56e96340dc84ff91de6e4cc25bb2e510706748606f05c1e39ebaf`. This is the current compatibility variant from the retained Carnival material, not the different official reference DLL, newly recovered official bytes, or ETE-authored source. Exact source revision remains unresolved. Existing source/notice records remain applicable. No DLL is loaded or executed during preparation or static validation.

~~~powershell
node tools/model-compatibility-input.cjs import . <preserved-model-snapshot-root>
node tools/model-compatibility-input.cjs validate .
~~~

The component manifest locks the sole path, size and file/tree identities. Import verifies the selected DLL before creating a destination, excludes unrelated source files, and never overwrites or substitutes an official variant. Prepared and runtime validation reject missing/changed/extra files and redirects. Runtime provenance binds the delivered DLL, manifest and generator identities. Bodies remain ignored/local; approved restorable material storage is still necessary for cloud use. This is not a full source-rebuild claim or permission to publish unknown-source bodies.

## Normal production entry points

The derived historical input selection is now empty. Any future unaccounted retained input fails with an explicit-component requirement; production does not fall back to a legacy directory. `assemble-runtime-base.cjs` and `validate-build-materials.cjs` validate every current component and no longer traverse `vendor/carnival` or `vendor/patch`, even for an empty selection. Historical full-material validation remains an explicit test/audit operation, separate from normal preparation/build/provenance.

`prepare.ps1` no longer reads, extracts, downloads or copies a Carnival installer or combined patch. Model restoration is explicit through `-ModelSnapshotRoot`. First Web restoration uses `-WebSnapshotRoot`, which copies the fixed independent Web snapshot and user increments with exact preflight validation; it does not reconstruct an old package layout. The old historical Web import remains an explicit historical-only command. Other component restoration and fixed official Electron/Host archives remain separately validated.

Original user material is preserved. In the isolated proof, both legacy directories and legacy archives are absent from normal input paths; old material retained in an offline backup is not read by the candidate. A dedicated archive directory supplies only the fixed official Electron archive for preparation.

## Acceptance boundary

The zero-input stage compares the same baseline's 822 base files, 937 transformed intermediate files, 720 final Web files and generated outputs. It does not change Model, UI, dependency versions, configuration or auto-update behavior. No app or installer is run. Before final packaging acceptance, integrate onto verified main containing the 0.3.15 exit fix, retaining its product source, version and tests. Subsequent byte comparisons must use matching 0.3.15 sources on both sides rather than reverting the fix to reproduce a historical intermediate hash.

Local integration note: this candidate now includes main e150981d and its 0.3.15 product fix/version/tests. The preceding pre-integration warning documents the material-stage acceptance boundary; current comparisons use matching 0.3.15 source. No official Model replacement or runtime launch is performed.

## Current repository restoration update (2026-10-21)

The user authorized tracking the exact required Web, compatibility-resource, small-runtime and original Model snapshots in this same repository. The 775 manifest-listed files (51,953,202 bytes) use ordinary Git with `-text` attributes to preserve bytes. Historical local-only/ignored-storage statements below describe earlier stages and are superseded for these four roots. Source attribution and unresolved exact revisions remain unchanged; storage permission is not a claim of new third-party authorship or complete corresponding source. libmpv stays ignored and is restored from the pinned archive via `node tools/prepare-libmpv.cjs .`; see [repository inputs](REPOSITORY_INPUTS.md). No old full installer/patch or real user profile is included.
