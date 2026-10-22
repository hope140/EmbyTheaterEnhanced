# Fixed inherited npm component

The 29 inherited files (32,830 bytes) now come from the official MediaBrowser/emby-theater-electron Git commit e897adda583b2339f077cb67113e71326a806de0, whose package version is 3.0.20. These are preserved upstream bundled packages, not upgrades to registry releases. The seven package identities and their individual license declarations/notices are recorded in vendor/inherited-npm-manifest.json; all seven delivered notice files remain in the runtime. This source relation does not relicense third-party packages.

## Reproducible preparation

Obtain the public official Git repository containing the pinned commit, then run:

~~~powershell
node tools/inherited-npm-input.cjs prepare . <official-Git-repository-directory>
node tools/inherited-npm-input.cjs validate .
~~~

Preparation uses git cat-file on the fixed commit, never current checkout bytes or package install scripts. Every entry locks the Git blob id, source size/SHA256, transform and output size/SHA256. All 29 raw Git blobs use LF; the explicit lf-to-crlf transform reproduces the prior delivered bytes exactly, independent of Git autocrlf settings. No code patch is needed against this upstream commit. In particular, the power-off change seen against registry tarballs already exists in this official source.

All source/output buffers are checked before any preparation write. Invalid objects, changes, links, extra prepared files and existing output conflicts fail. Bodies are ignored under vendor/inherited-npm/emby-electron-3.0.20; only component metadata, preparation code and documentation enter Git. tools/prepare.ps1 accepts -OfficialElectronSourceRoot for first preparation. It still supports historical archive bootstrap for other remaining components and is not yet a source-only bootstrap.

## Assembly and provenance

The base assembler checks the component against the exact retained paths/hashes in the historical manifest before excluding their old physical counterparts. Current selection must not overlap the locked fresh npm closure. Normal validation, assembly, dependency copying and dependency/source provenance read the independent component. No normal stage reads vendor/carnival/electronapp/node_modules. Historical directories may be absent; the independent component retains strict whole-tree checks.

Normal old Carnival requirements are reduced from 90 to 61 files; one current libmpv patch remains. The output package versions, metadata, source, notices and runtime byte set are unchanged. Components below those package roots remain subject to the seven package identity checks and exact dependency closure comparison. Old runtime-dependencies.json artifacts use the historical authority; newly generated records bind inheritedNpmManifestSha256 to the new committed manifest. This is a provenance schema-field change, not a player behavior change.

## Validation boundary and remaining work

Targeted regression covers pinned Git acquisition, checked newline conversion, missing/changed source, output/input path redirects, extra files, absent old npm inputs, dependency provenance and tampering. Explicit material checks compare base and transformed intermediate file sets and hashes with the historical route. Full installer/driver/application/playback acceptance remains distinct.

The remaining 61 Carnival files are three templates and 58 retained assets (Model one, manual/external resources 48, other assets nine). Keep their bytes and origins while migrating each group independently. Model, UI, dependency versions and original materials are unchanged. No component bodies are automatically uploaded or published.
