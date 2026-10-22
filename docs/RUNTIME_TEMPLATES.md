# Maintained runtime templates

Three small templates replace the physical package/preload/Host-configuration inputs previously read from Carnival. vendor/runtime-templates-manifest.json records LF source identities, exact generated CRLF identities and per-file origin/differences. The normal old Carnival requirement is reduced from 61 to 58 files; current libmpv remains one patch input. This does not complete removal of the old material bootstrap.

| Template | Origin and retained difference |
| --- | --- |
| package.json | Official Electron e897adda583b2339f077cb67113e71326a806de0 package.json; only historical version 3.0.20 -> 3.0.20-3.0 differs before ETE's existing product metadata rewrite |
| Emby.Theater.exe.config | Official Windows 708fadc068cbf66ced6aece4a32f3e12bb2c4e13 Emby.Theater/App.config after newline normalization; exact current CRLF bytes also match the official 3.0.20 ZIP member |
| preload.js | Existing seven-line compatibility bridge, exact upstream/author unresolved; retained verbatim in the local branch, not claimed as ETE original code |

The official repository LICENSE.md files declare GPL v2. Preserve those source references and existing notices; the inherited package metadata's MIT string is kept unchanged for byte compatibility and does not override the repository license. Preload's absent notice does not establish a license. Its local preservation is not a decision to publish unknown-origin material. No source or template body is uploaded by this change.

## Behavior and reproducibility

The maintained text lives under tools/templates/runtime/. LF and CRLF checkouts normalize to the same fixed source hash, then the explicit transform recreates each previous raw input byte. All three identities, flat source whitelist, physical paths and generated output hashes are checked before assembly writes. Extra files, missing/changed templates, links, path redirection and output conflicts fail.

The base assembler emits only package.json, exactly as before. Preload and Host config remain generator inputs. prepare-preload appends the unchanged ETE block to the exact old bridge bytes; window.ipc/window.fs/window.dirName/window.appdata stay intact. Build-input provenance applies the unchanged single ProgramDataPath replacement to the exact old Host-config base, preserving startup/runtime/binding settings. build.ps1 retains its existing PowerShell JSON rewrite for ETE name/productName/version, with no version/dependency upgrade.

Package/prepared-artifact/config provenance now names maintained source paths and distinguishes sourceTemplateSha256 from the transformed base SHA. Those source/provenance fields and delivered documentation change; player payload interfaces and the three generated target files must remain byte-identical against the same product baseline/toolchain.

## Checks and limits

Public tests cover generation, newline checkout differences, hashes, links, extra files, absent old templates and provenance. Explicit material comparison uses a separate frozen old-material oracle for preload and Host-config generation instead of reusing the new template on both sides. Compare the 822-file base and 937-file transformed intermediate set; final package serialization and generated preload/config are also checked separately. This is distinct from rebuilding the full installer or running Host, drivers, media or NAS services.

Remaining old inputs are 58 assets: Model one, manual/external resources 48 and other assets nine. Keep Model unchanged. The next independent sources should preserve existing bytes: small known official config/language/helper resources first, then pinned libmpv acquisition; unresolved retained assets require documented unchanged snapshots or a separately approved replacement.

## Current repository restoration update (2026-10-21)

The user authorized tracking the exact required Web, compatibility-resource, small-runtime and original Model snapshots in this same repository. The 775 manifest-listed files (51,953,202 bytes) use ordinary Git with `-text` attributes to preserve bytes. Historical local-only/ignored-storage statements below describe earlier stages and are superseded for these four roots. Source attribution and unresolved exact revisions remain unchanged; storage permission is not a claim of new third-party authorship or complete corresponding source. libmpv stays ignored and is restored from the pinned archive via `node tools/prepare-libmpv.cjs .`; see [repository inputs](REPOSITORY_INPUTS.md). No old full installer/patch or real user profile is included.
