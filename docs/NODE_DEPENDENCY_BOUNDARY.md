# Node runtime dependency boundary

## Scope

The production Node dependency closure is selected only from the root `package-lock.json` entries whose path starts with `node_modules/` and whose `dev` flag is not `true`. The current lock selects 33 packages. Their versions and `sha512` integrity values remain unchanged.

The product has three direct runtime imports in this boundary:

- `src/electronapp/main.js` imports `long`.
- `src/electronapp/enhanced/cd2-service.js` imports `@grpc/grpc-js` and `@grpc/proto-loader`.

The prepared Carnival `electronapp/main.js` also imports `long` at its package root. The audited product and prepared host files have no deep import of these three packages. Their transitive imports are supplied by the same lock-selected closure. The build does not infer dependencies by scanning source and does not add packages that are absent from the lock.

## Why package directories are replaced

Carnival contains `long@3.2.0`. A clean `npm ci` installation of locked `long@5.3.2` has 10 files, while the previous overlay-built runtime had 30. The extra 20 paths came from the old Carnival package and were not part of the locked package. Copying the new package over the old directory therefore did not produce the npm tree selected by the lock.

Every lock-selected package directory is now removed from the new owned output before its clean source directory is copied. The runtime is accepted only when its selected file paths, sizes and SHA-256 hashes exactly equal the clean npm source inventory.

## Inherited Carnival allowlist

The following runtime packages are intentionally inherited as Carnival's existing host dependency set, including its platform-specific branches, and are outside the root npm lock:

| Package path | Version |
| --- | --- |
| `node_modules/detect-rpi` | `1.4.0` |
| `node_modules/is-linux` | `1.0.1` |
| `node_modules/is-osx` | `1.0.2` |
| `node_modules/is-windows` | `1.0.2` |
| `node_modules/power-off` | `1.1.2` |
| `node_modules/sleep-mode` | `1.1.0` |
| `node_modules/sleep-mode/node_modules/is-windows` | `0.1.1` |

The nested package is listed separately for package identity, while its files belong to the `sleep-mode` tree. Before and after selected-package replacement, these paths must match the immutable `vendor/carnival/electronapp` source byte for byte and must match the corresponding size and SHA-256 entries in the committed `vendor/runtime-manifest.json`. No other inherited dependency file is accepted.

## Build integration contract

The build creates the final runtime only under a new direct child of `dist`. The output name must be a simple name and the directory must not exist before the build.

Immediately after creating the empty runtime directory, before copying Carnival, the build runs:

```text
node tools/copy-runtime-dependencies.cjs create-owner <repoRoot> <runtimeRoot> <sourceCommit>
```

This writes `.ete-build-owner.json` and returns a random 32-byte token. The marker binds hashed canonical repository and runtime paths, the full source commit and the token hash. `create-owner` rejects a nonempty output.

The build also creates a unique `runtime-dependencies-*` project below `.work`, copies the already gated root `package.json` and `package-lock.json` into it, and runs:

```text
npm ci --ignore-scripts --omit=dev --no-audit --no-fund
```

`npm ci` is the registry or npm-cache extraction step that enforces every lock integrity value. The copy tool does not download packages and does not treat a mutable install report as a replacement for this command. The source manifests must be raw-byte identical to the gated worktree inputs. Provenance records the committed Git blob SHA-256 for `package.json`, `package-lock.json` and `vendor/runtime-manifest.json`; the tracked-file guard permits only the checkout's LF/CRLF representation of those committed bytes.

After Carnival has been copied to the owned runtime, the build runs:

```text
node tools/copy-runtime-dependencies.cjs copy <repoRoot> <runtimeRoot> <sourceProjectRoot> <token>
```

The copy operation requires the source manifests to be byte-identical to the gated root inputs. It validates package names and versions, lock integrity fields, physical path ownership, the initial Carnival dependency set and all retained bytes before deleting any selected directory. It then performs delete-and-copy replacement, rejects symlinks, junctions, reparse redirects, unsupported filesystem entries and `.node` files, and verifies the exact final file set and hashes. A failed run retains the owner marker and the unique partial output cannot be reused.

On success the tool writes `runtime-dependencies.json`, validates it against the runtime, and removes the temporary owner marker. The provenance contains:

- source commit and root package input hashes;
- the npm command contract;
- every selected package path, name, version and lock integrity value;
- every selected runtime file path, size and SHA-256 hash;
- every retained Carnival file path, size and SHA-256 hash;
- deterministic selected, retained and combined tree hashes.

No absolute local path or ownership token is persisted.

Packaging and later runtime verification use:

```text
node tools/copy-runtime-dependencies.cjs validate <repoRoot> <runtimeRoot> <sourceCommit>
```

The exported `inspectRuntime(repoRoot, runtimeRoot, sourceCommit)` function provides the same check without needing the temporary npm source. It requires the caller's expected full source commit, reparses the current lock, verifies the retained bytes against immutable Carnival and the committed manifest, verifies the selected and complete `node_modules` file sets against `runtime-dependencies.json`, and rejects later additions or byte changes.

## Safety boundary

Mutation is limited to lock-selected directories below `electronapp/node_modules` in the token-owned, new `dist` output. Repository-root `node_modules`, `.work` source dependencies, `src`, `vendor`, an existing runtime, and paths reached through symlinks or junctions are never deletion targets. The build does not modify dependency versions, the lock file, the immutable Carnival source, playback code or runtime provenance owned by other build stages.

This is a static and isolated build boundary. It does not by itself prove installation, real Emby playback, Session/WebSocket behavior or remote-control acceptance.
