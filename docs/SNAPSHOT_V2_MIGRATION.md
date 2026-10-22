# Legacy snapshot v2 selection

This migration removes the fifteen specifically reviewed old files from the current source tree: nine compatibility resources, all four old small resources, and CustomCssJS.js plus themes/logo.png. Thirteen are retired; the old configuration and Chinese localization are replaced by the already approved maintained outputs. No other resource is retired. [The exact fifteen old paths, sizes and hashes](evidence/legacy-snapshot-v2.json) are recorded separately.

| Component | v1 | Active v2 | Current input root |
|---|---:|---:|---|
| compatibility-resources | 48 | 39 | vendor/compatibility-resources/snapshot-v2 |
| small-runtime | 4 | 2 | vendor/small-runtime/snapshot-v2 |
| Web | 720 | 718 | vendor/web-snapshot |

Web retains its established root to avoid changing unrelated source/provenance consumers; its manifest explicitly identifies snapshot-v2. The historical v1 manifest is separate and the loader rejects the v1 version. The two historical Web user-patch carriers remain byte-identical and outside the 718 resource count; retiring other material is outside this selection.

## Exact identities and necessary reference changes

The three original manifest byte streams are preserved under vendor/snapshot-history, bound by SHA256 in the v2 manifests and the build-input contract. Runtime assembly compares the complete historical selection with the active selection: only the approved removals and explicit replacement paths are permitted; kept resources retain their old hashes. Missing history, changed history, added retired paths, unapproved changes/removals and old-version fallback fail before copying. Normal assembly does not read old Git bodies or require a previous installer.

Compatibility keeps the same thirty-nine shader bytes. Small v2 contains the 543-byte generated configuration and 2787-byte maintained Chinese resource. `src/config/system-defaults.json` retains the five original fields/defaults. `src/localization/mpvplayer/zh-CN.json` is now the complete maintained 37-key file, because applying a partial override would require the removed old body. It contains exactly the thirteen selected revisions and twenty-four inherited values; the latter are individually hash-bound in the migration record. This does not claim the inherited words or original file were authored by ETE.

The active Web app.js removes only the obsolete 55-byte CustomCssJS registration. Active index.html carries the existing startup transform, including the reference to the already present ETE startup.svg and the existing contain/centering rules. Both final generated identities remain unchanged from the previously reviewed outputs. No consumer is left pointing to either deleted Web asset. Title/screen-saver logowhite/logodark images and media Logo APIs remain separate and unchanged. The SVG comes from committed product source at its normal runtime path; the raw input directory is an assembly input rather than a separately supported app distribution.

Some retired backup CSS has identical bytes to a stylesheet that already existed at an active Web path. Those pre-existing useful copies are retained with the same path/hash and remain subject to the existing overlays. The migration does not copy retired bodies into new active locations, and does not remove an active stylesheet merely because its hash also occurred in a backup.

## Source, notices and history

All fifteen old paths are absent from the current tree. The raw old XML, old Chinese JSON, third-party plugin, font, batch files, preset/config, notice, packaged CEC marker and old startup PNG are not carried in a second active archive directory. The old bodies remain available through existing commits/tags; Git history is not rewritten. The change does not reclaim older clones, source ZIPs or installers or shrink historical Git objects.

Root LICENSE, THIRD_PARTY_NOTICES, source/notice records, Adobe/OFL and existing font naming/copyright boundaries, retained shader MIT headers, the historical notice restriction and the complete CustomCssJS GPLv3 record stay preserved. The old startup image's observed lettering included “by David & NoisyX”; that observation and unresolved authorship/permission boundary are retained without asserting a new grant. Removing these resources is not a whole-project license-clearance conclusion; other inherited source questions remain separate.

The v0.3.16 commit/tag/release/attachments are unchanged. Its original tools/manifests/bodies are still in its original Git tree. No prior installer was rebuilt, no profile data or credentials were accessed, and no installed application directory was cleaned. PR67's merged maintained ApiClient/toast behavior and attribution are preserved.

## Verification boundary

Tests assert the exact 39/2/718 active selections, all fifteen absent old paths, fixed historical manifest hashes, individual inherited translation values, generated XML contract, no obsolete Web consumers, strict negative migration cases and clean runtime material equivalence. The material oracle compares every path/size/hash independently using the active manifests and approved maintained output identities. Base/intermediate and source/provenance checks are distinct from GUI, login, playback and installer acceptance. This change does not trigger an installer build or publication.
