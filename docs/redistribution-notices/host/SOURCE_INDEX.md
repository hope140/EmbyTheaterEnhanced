# Host / managed dependency source and notice index

Collected 2026-10-12. These five exact text files are a repository supplement. They were not inserted into the frozen stable-rc runtime or uploaded with an installer. Binary/source archives stay in the ignored local `.work/host-unblock/` material directory; official URLs below provide the public retrieval paths.

| Text | Bytes | SHA256 |
|---|---:|---|
| `ServiceStack.Text-v4.5.14-license.txt` | 3746 | `b3b85e98776c6f99a5354363a45b8f5284fef916765a34cbadc6ca5612e149ec` |
| `Windows-Host-708fadc-LICENSE.md` | 18014 | `f371b80469fb235bc500ec29e0e85b682d4a6157a158567d828ff0be544d4f1d` |
| `MediaBrowser.Common-3.3.10.nuspec.xml` | 736 | `4f773b8c1a85e1582e6ab931f20e712ea74e98052f3caf743ebbdd2f6cfd3549` |
| `ServiceStack.Text-4.5.14.nuspec.xml` | 1098 | `8c617f41bd570318e46291e8956e6b6d55f686fc469340962cca620c78cee140` |
| `AGPL-3.0.txt` | 34523 | `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0` |

| Downloaded official entity | Bytes | SHA256 | Retrieval path |
|---|---:|---|---|
| `mediabrowser.common.3.3.10.nupkg` | 177439 | `4d9bd3ed99e9b2b6cd22622018af5667246d8b866041f540afdb973b30d30d0b` | [official source](https://api.nuget.org/v3-flatcontainer/mediabrowser.common/3.3.10/mediabrowser.common.3.3.10.nupkg) |
| `servicestack.text.4.5.14.nupkg` | 560785 | `7fd29722344036768ab3c7e1be3c70382f93e57ce2b5be0cf3d918b66b85eb5e` | [official source](https://api.nuget.org/v3-flatcontainer/servicestack.text/4.5.14/servicestack.text.4.5.14.nupkg) |
| `servicestack-text-e5819a8-source.zip` | 6376149 | `97ed2dfa327dc5d2827c373205df551d5fdb595b0ac6e7f925d0c1f118364dd9` | [official source](https://codeload.github.com/ServiceStack/ServiceStack.Text/zip/e5819a8de75a8bae64ddc7a64008613067893e32) |
| `windows-host-708fadc-source.zip` | 198671303 | `7dc15a294137c0a40553282289f4590b7cf75a8f9169dafbe5d08d2fe3a1a884` | [official source](https://codeload.github.com/MediaBrowser/emby-theater-windows/zip/708fadc068cbf66ced6aece4a32f3e12bb2c4e13) |
| `AGPL-3.0.txt` | 34523 | `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0` | [official source](https://www.gnu.org/licenses/agpl-3.0.txt) |

ServiceStack.Text uses the exact official 4.5.14 NuGet `lib/net45/ServiceStack.Text.dll` in the target runtime. [Official tag v4.5.14](https://api.github.com/repos/ServiceStack/ServiceStack.Text/git/ref/tags/v4.5.14) maps to `e5819a8de75a8bae64ddc7a64008613067893e32`. The full publisher source archive, build scripts, copyright/AGPL/FOSS exception and GNU AGPLv3 text have been collected. Fixed publisher tag source is the available preferred source; this report does not require byte-identical rebuilding as a universal license precondition. Its stale checked-in library DLL differs from the distributed NuGet DLL; the version-stamping build scripts are separately identified in the receipt.

Software source availability and full notice text acquisition are resolved for this ServiceStack layer. The FOSS exception still requires AGPLv3 compliance for the Software/Derivative Work, listed licenses for independent Additions, complete source for Additions, and an end-user application. The exception lists GPL 2.0. This does not determine the actual Host/Additions scope or satisfy its still-unknown preferred source/distribution arrangement. No commercial route has been selected.

MediaBrowser.Common 3.3.10 NuGet exactly matches its target DLL; the full original nuspec preserves its `Copyright © Emby 2013`. It supplies no license file, license URL or expression. This metadata acquisition does not invent a grant for Common. The same package's Model DLL differs from the target. Both license/source duties remain conditional on verified origin and actual terms.

Windows Host reference `708fadc068cbf66ced6aece4a32f3e12bb2c4e13` supplies the full GPLv2 text, source and project files. Source AssemblyInfo copyright declaration is `[assembly: AssemblyCopyright("Copyright ©  2015")]`. This reference license is not automatically a license grant for separately bundled DLLs, or proof that the Carnival EXE was built from an unmodified tree. Its actual source/patch relation still needs the provider's records. PDB, an identical SDK archive and bit-identical rebuild are provenance/reproduction aids rather than universal source obligations.

Source-member, target runtime, exact NuGet relationships, fixed tag response and each full-text byte equality are recorded in [machine receipt](../../evidence/v030-host-unblock.json). The [result report](../../V030_HOST_UNBLOCK_RESULT.md) defines the remaining provider material and A/B/C options. Original notice bytes are preserved by exact-path `.gitattributes`; only the original ServiceStack license's trailing whitespace is exempted from whitespace lint.
