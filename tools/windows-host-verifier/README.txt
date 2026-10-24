Portable unified Host verifier; fixed source identity fef4cbfdb15a52b32a21edb33039833b5fc523ac594fcf3b871b78080dc8be9b.
Run in an existing Windows PowerShell7 host:
  .\Verify-UnifiedHost.ps1 -BuildRoot <actual-current-build-root> -OutputReceipt <new-absolute-receipt-path>
Do not install tools, change execution policy, elevate Windows identity, or bypass denied execution. Obtain any required platform execution approval normally.

BuildRoot inputs:
- build-receipt.json, toolchain-snapshot.json, build/Host.Unified.csproj.
- bin/Emby.Theater.exe, Emby.Theater.pdb and Emby.Theater.exe.config from that actual build.
- references/ fixed five DLLs, each checked against expected-build-contract.json.
- source/ exact57 prepared upstream/changed/helper members, checked against expected-candidate-files.json.
- verification-inputs/System.Configuration.dll:93200bytes, SHA256 3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf. This is only the private-versus-omitted test input from the previously approved official3.0.20 ZIP, not a product runtime dependency. Do not download unknown substitutes.
- The existing exact net462 reference tree referenced by the generated project. Every member is checked against this build's toolchain snapshot.
- Existing VS2022 compiler matching this build's csc snapshot. The verifier checks PATH MSBuild and known VS2022 edition locations derived from ProgramFiles; there is no download/install/fallback.
- Existing Framework64/v4.0.30319/csc.exe for the unchanged guard/controlled-child fixtures.
- An existing short owned process TEMP path. Evidence is created in a fresh euv-GUID directory; nothing is cleaned up.

This package contains no Host EXE/PDB, real profile, login state, tools, large official packages, or old results.
All probes are recompiled and run in new Framework x86 processes against copies of the supplied actual build bytes. The process-local guard blocks non-loopback HTTP;8154 ownership is checked before any request. The child is an inert lifecycle fixture, not Electron/media. A real ETE Startup shortcut causes a stop before Host startup. No CEC cancel marker, task suppression or security-setting change is used.
The14consumer and4transport cases use in-process IHttpClient mocks, not real network failures. All31ZIP fixtures and28JSON contracts are the already-reviewed scope. The symlink-destination test remains omitted because existing net462 APIs lack the test seam; no security change is made to enable it.
Only current generated evidence is parsed. OutputReceipt includes runId/timestamps, input byte hashes and actual loaded locations/hashes. A failure writes a failed receipt after evidence creation; preflight failures may throw before creating a receipt. OutputReceipt must not already exist. The caller may then use its original New-VerifiedRuntime.ps1 against the actual build and this successful envelope; this verifier never overwrites an existing lock.
The manifest binds verifier code, test sources, fixed contract data and synthetic pending fixtures; README/licenses are distribution metadata covered by the outer archive hash.
This is target net462 verification on the installed runtime. The actual Work run used Framework4.8 and does not establish clean4.6.2/full client/media/installer/upgrade acceptance. Preserve the MSB3277 ReaderWriter4.0.10/4.1.0 warning separately.
Original Host-derived fixtures remain subject to GPL2; independently authored test seams/helpers are MIT, and Newtonsoft is MIT. Licenses are included.

