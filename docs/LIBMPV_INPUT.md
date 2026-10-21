# Fixed local libmpv snapshot

Normal preparation and build now use one independently hash-locked DLL snapshot under vendor/libmpv/20260809. The body is ignored by Git. Version, runtime filename, client interface and DLL bytes are unchanged. The current source is the previously prepared combined-patch DLL, not a fresh official download and not ETE-authored code.

- Input: mpv-1.dll, 119,725,568 bytes, SHA256 965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c.
- Runtime: electronapp/libmpv/x64/mpv-1.dll, exactly the same bytes.
- Historical public candidate: mpv-dev-x86_64-20260809-git-dd5d17d328.7z, 31,173,907 bytes, SHA256 c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12. Its previously audited libmpv-2.dll matched this DLL, including the existing filename rename.
- [Provider record](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download) and [mpv source reference](https://github.com/mpv-player/mpv/tree/dd5d17d3285a095a0f712fa9d116e22a076492de) remain provenance candidates/references. Current preparation does not download or claim to recover that archive.

## Local preparation and strict identity

~~~powershell
node tools/libmpv-input.cjs import . <fixed-snapshot-file>
node tools/libmpv-input.cjs validate .
~~~

The explicit source file may be a preserved independent snapshot. It is checked for physical paths, exact size and SHA before creating output. Existing prepared snapshots are validated rather than overwritten. The prepared directory must contain exactly its single pinned file. Links, redirects, changed/missing/extra files and occupied runtime targets fail. Normal build copies the snapshot through the component module and validates the final runtime identity in source provenance; no DLL is executed by preparation.

prepare.ps1 accepts -LibmpvSnapshotFile only when the component is absent. It never recreates or reads vendor/patch or automatically extracts the combined-patch archive. An absent independent Web snapshot now requires explicit restoration; its historical one-time importer remains a separate utility. The remaining Carnival bootstrap still needs its own original archive if the 53 remaining assets are absent, and official Electron retains its pinned archive check.

## Provenance, notices and recovery limits

The tracked manifest declares local-snapshot provenance, the former path as historical metadata, current file hash and public archive candidate separately. Source provenance records the independent physical input and marks old patch/predecessor paths physicalInputRequired=false. The old patch manifest is retained as a historical identity comparison; no patch directory traversal is part of normal material validation.

Existing THIRD_PARTY_NOTICES.md and SOURCE_MATERIALS.md continue to apply. Exact winbuild/dependency sources, patches, options, toolchain and complete notices remain separate unresolved review items. Snapshot import is not a full source rebuild, a new redistribution authorization, a public binary upload or a successful cloud recovery. A Git clone alone cannot restore this ignored body; keep the verified snapshot in approved material storage until a verified acquisition route is available.

Historical inventory/audit tools and explicit comparison oracles may still read old full inputs when deliberately supplied; they are not normal build dependencies. Tests compare the new snapshot route against a separately supplied, hash-checked old DLL oracle.
