# Third-party notices

This file records the maintained source boundary and known components of the
Windows runtime. Git exclusions do not describe installer contents. Binary
releases already exist; this inventory does not certify their redistribution
terms or completeness of corresponding-source materials. See the dated
source-material index in `docs/SOURCE_MATERIALS.md`. The repository also keeps
the dated P1 input audit in `docs/BUILD_INPUT_AUDIT.md`.

The separate 2026-10-09 materials branch records new evidence in
`docs/THIRD_PARTY_MATERIALS_AUDIT.md`. It does not change an existing payload:
new research archives and notice references are not automatically shipped.
The original libmpv dev archive has now been obtained and its DLL is byte
identical to the packaged DLL. Exact build inputs and complete notices remain
open; archive identity is not a complete-source or license-mode determination.

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
  The supplement preserves 17 original MSYS2 packages and signatures that
  match the locked 6,990-file prefix, plus fixed Inno/InnoUnp source references.

## CloudDrive2 resolver runtime dependencies

- `@grpc/grpc-js` 1.14.6 and `@grpc/proto-loader` 0.8.1 are exact runtime
  dependencies, locked with a 33-package dependency selection in
  `package-lock.json`. Their Apache-2.0 license files are present in the selected
  package directories. Package notices are copied with the package directories.
  The selected package directories are generated exactly from a fresh locked
  npm installation. Seven explicitly retained Carnival package roots remain
  separately identified; they are not part of the 33-package npm selection.
- `src/electronapp/enhanced/proto/clouddrive-v1.proto` is a minimal
  wire-compatible subset of CloudDrive2 API schema 1.0.13. Its field numbers
  were taken from the Apache-2.0 `hope140/embyToLocalPlayer` beta snapshot
  `54b2abae0537f1b4c65752edaac059d3cda4790e`; the official CloudDrive2 1.0.14
  download was checked and the V1 fields were unchanged.

## Runtime components and material gaps

Three Carnival managed DLLs now match exact official NuGet entries:
MediaBrowser.Common 3.3.10, ServiceStack.Text 4.5.14 and SimpleInjector 4.0.11.
Their exact source/build relations remain separate. The fixed ServiceStack.Text
v4.5.14 source [license.txt](https://github.com/ServiceStack/ServiceStack.Text/blob/e5819a8de75a8bae64ddc7a64008613067893e32/license.txt)
contains AGPL-3.0, a FOSS License Exception and commercial licensing text;
this notice records that source reference without selecting a licensing route
for the binary. The NuGet package itself has no standalone license text.

All seven inherited Carnival Node package tarballs have been collected from
the npm registry and their published integrity values verified. Each retained
package's license text is present in the audited runtime and matches the
original after newline normalization. Package metadata, one missing README
and the inherited power-off source change remain explicitly documented;
the retained directories are not described as untouched registry archives.

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

The audited 1a05f88357a08f5d7c99a7e5de28de20aad0dc79 runtime includes the root
project `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/LICENSING.md` and
`docs/SOURCE_MATERIALS.md` in the exact versions copied from that sourceCommit.
Their presence and exact bytes were checked before packaging. The updated
notice in this materials branch is a later revision and has not been repackaged.
The earlier P1 runtime omitted the root notices; it and existing Releases are
unchanged. Complete third-party corresponding-source and notice materials
remain open where the accompanying source index marks them unknown or missing.

## SimpleInjector 4.0.11 license notice

The shipped SimpleInjector.dll is byte-identical to the official NuGet 4.0.11 net45 member. Its package license URL points to the official MIT license. The complete copyright and permission notice follows; this resolves this component notice, without clearing unrelated Host/Additions or bundle obligations.

NuGet source: https://www.nuget.org/packages/SimpleInjector/4.0.11
License snapshot: https://raw.githubusercontent.com/simpleinjector/SimpleInjector/e3ce923d72bca2a5e1452725685b59b886c64bac/LICENSE
License SHA256: df8a87df7cecf121f7d960f664a6d458dcadd01329c560de40eb26e1f801b918

The MIT License (MIT)

Copyright (c) 2013 Simple Injector Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
