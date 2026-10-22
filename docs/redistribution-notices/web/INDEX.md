# Web notice supplement

Collected 2026-10-12. These are full upstream license snapshots and asset-level
copyright observations for the exact candidate indexed by
[v030-web-unblock.json](../../evidence/v030-web-unblock.json).
This directory has not been copied into the frozen runtime. The current build
ships four project notice files; integration into that delivery contract is
still required before claiming a shipped notice gap is closed.

| Component | Copyright observed in target | Full text | Official source |
|---|---|---|---|
| 21 Roboto WOFF2 files, Version 2.137; 2017 | Copyright 2011 Google Inc. All Rights Reserved. | [Roboto-LICENSE.txt](Roboto-LICENSE.txt), [Apache-2.0.txt](Apache-2.0.txt) | [Google Roboto LICENSE](https://raw.githubusercontent.com/google/roboto/main/LICENSE), [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt) |
| 2 Material Icons Round files, build timestamp 2022-04-11T03:57:28.928963 | Copyright 2019 Google LLC. All Rights Reserved. | [Material-Icons-LICENSE.txt](Material-Icons-LICENSE.txt) | [Google Material Design Icons LICENSE](https://raw.githubusercontent.com/google/material-design-icons/master/LICENSE) |
| jQuery 3.6.0 slim | Official package: Copyright OpenJS Foundation and other contributors, https://openjsf.org/ | [jquery-3.6.0-LICENSE.txt](jquery-3.6.0-LICENSE.txt) | [Official registry source package](https://registry.npmjs.org/jquery/-/jquery-3.6.0.tgz) |

Roboto nameID 14 explicitly names the Apache 2.0 license URL. Every target font
hash and decoded name field is recorded in the evidence. Neither Material Icons
Round file contains a nameID 13 license description or nameID 14 license URL.
Its copyright/family/timestamp observations plus the official project license
are useful attribution evidence, but this report leaves the grant-to-import
relationship for review. Failed archive paths are not an exact source match.

The jQuery target preserves the precise 3.6.0 slim excluded-feature fingerprint,
but has been re-minified with different identifiers and lacks the upstream
banner. The official package supplies the complete MIT copyright and permission
notice above. The target is not claimed to be byte- or AST-equivalent to the
upstream dist file; no complete modified-source relationship is asserted.

License files are preserved without text edits. Their retrieval URLs, byte
sizes and SHA256 values are recorded in the evidence. Mutable upstream URLs
are retrieval locations; the saved bytes and hashes define these snapshots.
Parent review determines the combination and final distribution decision.


## Retired CustomCssJS source input

The historical ETE Web snapshot contained CustomCssJS.js. Snapshot-v2 removes its body and registration from the current tree while preserving the old manifest/hash, Git history and this notice record. The source matches [Shurelol/Emby.CustomCssJS, commit 6933b58c](https://github.com/Shurelol/Emby.CustomCssJS/tree/6933b58c62f98b0919977e953f068b1a581a7a1c) after CRLF-to-LF conversion only. [Emby-CustomCssJS-GPL-3.0.txt](Emby-CustomCssJS-GPL-3.0.txt) is the exact upstream LICENSE, SHA256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`. See [the scoped evidence and limits](../../LEGACY_RESOURCE_RETIREMENT.md); this record is not a claim that the whole legacy package has established source or license compliance.
