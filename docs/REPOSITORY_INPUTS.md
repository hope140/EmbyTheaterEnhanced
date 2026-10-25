# Repository restoration inputs

The three active body selections and the zero-input compatibility retirement record below contain **718 files / 22,552,067 bytes**, including the two retained Web patch carriers. Earlier 775-file/v1 counts describe historical snapshots, not current input requirements.

| Root | Files | Bytes | Origin |
| --- | ---: | ---: | --- |
| vendor/web-snapshot | 715 | 22,122,241 | 713 historical Web members plus two retained patch carriers; exact upstream Web revision remains unresolved |
| compatibility-resources retirement metadata (no body root required) | 0 | 0 | All 39 Anime4K shaders retired; original identities/notices remain historical |
| vendor/small-runtime/snapshot-v2 | 2 | 3,330 | Maintained default/configuration and translation seeds; inherited content remains attributed separately |
| vendor/model-compatibility/snapshot-v1 | 1 | 426,496 | Pinned official Windows 3.0.20 Model; former variant remains in Git history |

Git `-text` attributes preserve manifest-bound bytes across platforms. Only enumerated members are consumed. Removed v1 bodies remain identifiable through historical manifests/hashes and Git history; necessary notices remain. Storage does not establish new authorship, complete corresponding source or general licence clearance. Exact Web revision, some historical asset authorship and font revision/RFN conditions remain unresolved. See [v2 migration](SNAPSHOT_V2_MIGRATION.md), [maintained small outputs](MAINTAINED_SMALL_RUNTIME.md) and [official Model selection](MODEL_COMPATIBILITY_INPUT.md).

Other inputs have separate fixed acquisition and verification contracts:

- libmpv: original 31,173,907-byte archive under `vendor/archive/libmpv/20260809`; HEAD blob, archive/DLL size and SHA256 are checked. The DLL remains ignored. Recovery uses the repository archive without a SourceForge request; full dependency/build/notice completeness remains unresolved. See [libmpv](LIBMPV_INPUT.md).
- Windows Host/resources: complete official 3.0.20 ZIP recovery selects 19 original members. The runtime excludes nine retired members and replaces EXE/PDB with the matching source-built Host; the official recovery input is not relabeled as an unchanged new Host. See [Host contract](WINDOWS_HOST_INPUT.md).
- Source-built Host: fixed official source commit, reviewed maintained replacements and helpers, net462/x86, locked references and MSBuild17. The runner compiles its own EXE/PDB, executes the reviewed verifier and generates a source/run-bound lock; no Work binary or old receipt is needed. See [source contract](../native/windows-host/README.md) and [Actions build](ACTIONS_TEST_PACKAGE.md).
- Newtonsoft.Json: fixed 13.0.4 net45 NuGet member, complete package and DLL hashes, MIT notice and runtime identity. SharpCompress, ServiceStack and private System.Configuration are retired from the current runtime, while official input identities and necessary notices remain. See [JSON input](WINDOWS_HOST_INPUT.md).
- Inherited npm: fixed official Electron Git revision, 29 selected files and explicit newline transform; see [inherited npm](INHERITED_NPM_INPUT.md).
- Electron 44.4.2: fixed official archive and complete runtime tree; see `vendor/electron-runtime-manifest.json`.
- Project npm: `npm ci --ignore-scripts` and exact package-lock; the full source set and selected runtime projection remain separate.
- Native Helper/installer: maintained source, fixed header, complete compiler tree and locked packager/unpacker identities. No tool installation or automatic compiler substitution occurs during the Actions build.

Preparation and build require neither `vendor/carnival` nor `vendor/patch`, old installers, real profiles, credentials or user media. A clone supplies tracked snapshots and fixed restoration recipes; external source archives and toolchains still require the documented acquisitions. [Run 39974691780](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39974691780) completed the clean Windows route through actual Host verification, Native Helper compilation and test installer comparison. That test package precedes v0.4.0; it does not establish a full rebuild of every third-party binary or the publication of a new release.
