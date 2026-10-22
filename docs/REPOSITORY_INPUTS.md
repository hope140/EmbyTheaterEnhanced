# Repository restoration inputs

The user authorized keeping necessary preserved materials in this same ETE repository. These four manifest-listed roots contain 775 files / 51,954,738 bytes:

| Root | Files | Bytes | Origin |
| --- | ---: | ---: | --- |
| vendor/web-snapshot | 722 | 22,169,841 | Historical Web base plus two user patch carriers; exact Web revision unresolved |
| vendor/compatibility-resources/snapshot-v1 | 48 | 29,353,185 | Shaders/theme/preset/font/manual scripts; per-file origins and notices retained |
| vendor/small-runtime/snapshot-v1 | 4 | 5,216 | Historical packaged defaults/resources, not a real user profile |
| vendor/model-compatibility/snapshot-v1 | 1 | 426,496 | Pinned official Windows 3.0.20 Model; prior variant retained in Git history |

Git `-text` attributes preserve every manifest-bound byte across platforms. Only enumerated files are selected; old installers, full Carnival/patch trees, login data, credentials, actual media and generated outputs are excluded. Existing notices remain. Exact Web revision, some manual/theme authorship and font revision/RFN remain unresolved. Model now has official binary distribution identity; an exact corresponding-source rebuild is not established. The former variant remains in Git history. Storage does not establish new authorship or complete corresponding source. The maintained seven-line preload keeps its unresolved-origin declaration. See [official Model selection](MODEL_COMPATIBILITY_INPUT.md).

External components remain fixed acquisitions instead of accumulating binary versions in Git:

- libmpv: `node tools/prepare-libmpv.cjs .`, pinned official SourceForge archive and DLL hashes; no DLL/LFS object required. See LIBMPV_INPUT.md.
- Windows Host/resources: fixed official 3.0.20 ZIP, selecting 19 files; see WINDOWS_HOST_INPUT.md.
- Model recovery if the repository member is absent: the same official ZIP, selecting only MediaBrowser.Model.dll through prepare-model-compatibility.ps1.
- Inherited npm: pinned official Electron Git revision and explicit newline transform; see INHERITED_NPM_INPUT.md.
- Electron 44.4.2: fixed official archive/hash, electron-runtime-manifest.json.
- Project npm: `npm ci --ignore-scripts`, exact package-lock.
- Native helper/installer: own source and locked trusted header/compiler/packager inputs.

Normal preparation/build no longer needs the old installer or patch. A clone supplies preserved snapshots, not external archives/toolchains. The existing public offline entry is `node tools/ci-public-tests.cjs`; full Windows packaging needs its documented trusted inputs. Work libmpv cold download has passed; cloud/Linux and Actions full recovery need separate execution evidence. No complete source rebuild or new release is implied.
