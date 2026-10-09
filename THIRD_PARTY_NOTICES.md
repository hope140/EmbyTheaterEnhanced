# Third-party notices

This file records the maintained source boundary and known components of the
Windows runtime. Git exclusions do not describe installer contents. Binary
releases already exist; this inventory does not certify their redistribution
terms or completeness of corresponding-source materials. See the dated
source-material index in `docs/SOURCE_MATERIALS.md`. The repository also keeps
the dated P1 input audit in `docs/BUILD_INPUT_AUDIT.md`.

## Upstream Emby Theater code

Maintained Electron application code is compared with the public MediaBrowser
Emby Theater repository. The Windows host has public reference source, but its
exact Carnival binary-to-source relationship remains unproven. The maintained project declares
GPL-2.0-only; see `LICENSE` and `docs/LICENSING.md`. Preserve upstream notices
when importing or changing identifiable upstream files.

## Development tooling

- `node-unrar-js` 2.0.2 is a development dependency, locked in
  `package-lock.json`; its own license remains with the dependency when
  installed.
- Inno Setup and InnoUnp are local build/test tools. Their version, source, and
  hash records are in `vendor/toolchain-manifest.json`. They are not application
  files copied into the runtime; Inno generates the installer container. Their
  executables and generated installers are not tracked in Git.
- Native Helper is compiled from `native/mpv-helper/ete-mpv-helper.cpp` with
  the header and compiler identity in `vendor/native-helper-manifest.json`.
  That original manifest pins the driver and flags. The supplemental tracked
  build-toolchain lock fixes the local compiler distribution tree; upstream
  source-package and full toolchain reconstruction materials remain separate.

## CloudDrive2 resolver runtime dependencies

- `@grpc/grpc-js` 1.14.4 and `@grpc/proto-loader` 0.8.1 are exact runtime
  dependencies, locked with a 33-package dependency selection in
  `package-lock.json`. Their Apache-2.0 license files are present in the audited
  P1 runtime. Package notices are copied with the package directories.
  The selected package directories are generated exactly from a fresh locked
  npm installation. Seven explicitly retained Carnival package roots remain
  separately identified; they are not part of the 33-package npm selection.
- `src/electronapp/enhanced/proto/clouddrive-v1.proto` is a minimal
  wire-compatible subset of CloudDrive2 API schema 1.0.13. Its field numbers
  were taken from the Apache-2.0 `hope140/embyToLocalPlayer` beta snapshot
  `54b2abae0537f1b4c65752edaac059d3cda4790e`; the official CloudDrive2 1.0.14
  download was checked and the V1 fields were unchanged.

## Runtime components and material gaps

The Windows payload includes the complete official Electron 44.4.2 tree,
Carnival Windows host and supporting binaries, offline Web baseline and assets,
controlled overlays, the pinned libmpv DLL, and the source-built Native Helper.
Electron's `LICENSE` and `LICENSES.chromium.html` are present in the audited
payload. The retired Pepper `.node` input and historical Carnival Electron 18
tree are excluded from the production runtime.

Original archives, prepared runtime trees and generated binaries remain
untracked Git inputs/outputs. Their hashes and roles are in the existing vendor
manifests. Exact corresponding source/build materials for the Carnival host,
supporting binaries, offline Web/assets and patched libmpv are not fully
established. A libmpv filename, header license or version string does not
establish the DLL's build configuration or complete license composition.

This candidate includes the root project `LICENSE`, this notice,
`docs/LICENSING.md` and `docs/SOURCE_MATERIALS.md`, copied from the recorded
sourceCommit. Their presence and exact bytes are checked before packaging.
The earlier P1 runtime omitted the root notices; it and existing Releases are
unchanged. Complete third-party corresponding-source and notice materials
remain open where the accompanying source index marks them unknown or missing.
