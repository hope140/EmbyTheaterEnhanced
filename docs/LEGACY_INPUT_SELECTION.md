# Current legacy input selection

Current selection update: the manual/external resource component removes 48 physical old input requirements, leaving only Model and four small files in Carnival (five total), with old patch count zero. Actual component and remaining-input hashes/path/extra checks stay strict. See [compatibility snapshot](COMPATIBILITY_RESOURCES_INPUT.md).

Current patch removal: all normal vendor/patch physical requirements are removed. The same libmpv DLL is a separately validated local snapshot, leaving 53 Carnival assets and zero patch inputs. Historical patch identities remain metadata, and the deliberately supplied comparison oracle is not a normal dependency. See [snapshot contract](LIBMPV_INPUT.md).

Current official-resource update: five additional exact official ZIP members are independently acquired, leaving 53 old Carnival physical inputs and one current libmpv patch. No behavioral file contents changed. See [official component](WINDOWS_HOST_INPUT.md).

Subsequent template update: the three small templates are now maintained source inputs, leaving 58 physical Carnival assets plus one libmpv patch. Previous 90/61 counts describe earlier stages. See [template contract](RUNTIME_TEMPLATES.md).

Subsequent component update: the 29 inherited npm files below now have independent official Git acquisition and strict component validation. Normal old Carnival requirements are 61 files, plus one current libmpv patch. Earlier 90-file counts describe the predecessor stage. See [inherited npm component](INHERITED_NPM_INPUT.md).

Normal assembly validates only files whose bytes are copied or used as generation templates. The historical full manifest remains committed evidence, not a requirement to keep retired binaries. This is one incremental removal of old-package dependencies; it is not a complete source rebuild.

## Physical input contract

After the independent Web snapshot and official Windows Host component, the remaining Carnival requirement is reduced from 234 to 90 files. The patch requirement is reduced from 49 to one pinned libmpv DLL. The 144 and 48 removed requirements are not deleted from original materials or silently claimed as freshly verified.

| Current Carnival input | Files | Bytes | Next independent source group |
| --- | ---: | ---: | --- |
| Application package template | 1 | 898 | Preserve semantics in a maintained template |
| Inherited npm package files | 29 | 32,830 | Fixed registry archives plus recorded modifications/notices |
| Retained assets and binaries | 58 | 30,223,804 | Component-specific pinned acquisition or an unchanged documented snapshot |
| Host configuration template | 1 | 2,104 | Compare official template before independent acquisition |
| Preload template | 1 | 214 | Preserve exact IPC behavior in an explicit input |

The 58 assets include the unchanged Model DLL, 46 external resources and two manual batch files, plus nine configuration, language, documentation and auxiliary files. Copied does not imply invoked by the application. Manual compatibility resources require a separate decision before removal. Model remains unchanged.

## Historical references without physical reads

The 144 Carnival predecessors are 73 old Electron files, one Pepper bridge, 45 source-covered files, 24 files superseded by the locked npm closure, and the old base libmpv. The 48 unused patch files are scripts, fonts, shaders, presets and notes. The two Web patch inputs already belong to the independent Web component.

The assembler derives selection from the committed product tree, overlay contract, npm lock and component manifests. Required entries cannot overlap ignored paths. Explicit retired paths, the retired Electron tree, superseded npm package directories and retired patch mpv namespace are optional and never traversed or copied. Unexpected files in active namespaces still fail. Required file hashes, directory types, ancestor links, extra files, and independent Web/Host manifests remain checked.

Source provenance labels old Electron, Pepper and base libmpv identities as historical manifest records with physicalInputRequired=false. Current official Electron, current libmpv and all consumed components retain physical validation. Historical archive/count fields do not claim a fresh archive read. tools/audit-build-inputs.cjs remains a separate historical full-material audit; production does not invoke it.

## Verification boundaries

Public regression tests exercise absent and changed predecessors, strict consumed templates and current libmpv, extra files and path redirection. The explicit windows-host-material-selftest.cjs compares the 822-file base against the original copy-entry manifest plus the independent raw Web manifest. runtime-base-material-selftest.cjs accepts ETE_LEGACY_RUNTIME_ORACLE_ROOT only as a read-only complete historical comparison oracle, outside normal production input selection. It compares both routes after common production transforms. This optional test oracle is not a build dependency.

No UI, Model, dependency version, original material or player behavior is changed. Static payload equivalence is not an installer, driver, display or playback acceptance test.

## Remaining work

Normal builds still need 90 Carnival files, one libmpv DLL, the independent Web snapshot/patches, the official Host component and the already fixed toolchain/npm/Electron inputs. prepare.ps1 still supports historical archive bootstrap for remaining components. It has not become a source-only acquisition workflow. First migrate the inherited npm group using verified archives and explicit local deltas, then small templates and independently sourced assets. Preserve unresolved origin labels; do not publish external snapshot bodies without the separate distribution decision.
