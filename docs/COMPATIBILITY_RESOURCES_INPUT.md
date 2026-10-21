# Fixed local compatibility-resource snapshot

48 existing manual/external resource files are independently managed under vendor/compatibility-resources/snapshot-v1. Their 29,353,185 bytes and runtime paths remain unchanged. This selection excludes Model, the four small remaining old inputs, Web, Host, npm and libmpv components. Bodies are ignored by Git and are not publicly uploaded. This is a local snapshot, not a claim of official online recovery or ETE authorship.

| Group | Files | Source/notice boundary |
| --- | ---: | --- |
| Anime4K shader/config resources | 40 | Reference project bloc97/Anime4K; 37 files retain embedded MIT headers. Exact delivered revision/source relation remains unresolved for this snapshot. Other files keep their existing bytes without an invented per-file license. |
| Legacy Emby theme copies | 4 | Two enable/disable theme pairs, exact source revision and edits unresolved; retain current notices. |
| Manual preset | 1 | Existing mpv.conf, author/source unresolved; preparation packages it without applying user settings. |
| Named Source Han Serif font | 1 | Existing Adobe/OFL notice record retained; exact delivered font version and reserved-font-name review remain open. |
| Manual compatibility batch files | 2 | Existing Emby.ConfigureAndUninstall.bat and Emby.Dialog.bat, exact author/source unresolved; never executed by preparation. |

## Preparation and assembly

~~~powershell
node tools/compatibility-resources-input.cjs import . <preserved-snapshot-root>
node tools/compatibility-resources-input.cjs validate .
~~~

Import reads only the manifest's selected file paths from an explicit source directory, verifies every path/type/size/SHA before creating any destination, and preserves bytes including embedded notices and binary data. Unrelated source files are not imported. The resulting component has an exact file set: missing/changed/extra files or redirects fail. Normal assembly validates all inputs and output conflicts before copying into its dedicated runtime. Neither batch files nor fonts/shaders are executed or installed.

The tracked manifest carries per-file identities and origin groups. The base assembler checks those identities against the retained historical manifest before removing their old physical counterparts from normal input selection. The old external namespace and the two old batch paths are optional historical material, never traversed or copied by normal assembly. The new component remains strictly checked, and the five still-consumed old paths keep their existing validation. Source provenance verifies the exact 48 runtime bytes and records the snapshot/generator identities. prepare.ps1 accepts -CompatibilitySnapshotRoot for explicit first restoration; it does not silently fall back to Carnival for these resources.

## Boundaries and remaining work

The old Carnival requirement falls from 53 to five inputs: Model plus four small files. Old patch input remains zero. Original materials are preserved separately. Existing THIRD_PARTY_NOTICES.md and SOURCE_MATERIALS.md remain applicable; the preserved snapshot does not establish missing source/notice facts or authorize new public distribution. A Git clone cannot restore ignored bodies by itself, so approved material storage remains necessary for cloud recovery.

Validation compares 822 base files, 937 transformed intermediate files and final Web against the material baseline. This does not constitute full-package or playback acceptance. The isolated material branch still needs the separately released 0.3.15 exit fix before any final package candidate; this component change does not cherry-pick that fix, change Model/UI/version or run the app.
