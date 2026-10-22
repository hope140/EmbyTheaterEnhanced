# Retired native camera-upload settings page

Historical scope note: the716-file/17-body/807–922 counts below describe this camera-pair stage. The later approved three Web residues change the current selection to713/20-body/804–919; the separate20 npm runtime exclusions retain complete source inputs. See [current projection](SCOPED_RUNTIME_PROJECTION.md).

The unmerged PR69 snapshot-v2 selection additionally omits `www/settings/cameraupload.js` and `www/settings/cameraupload.html` from both the current source tree and newly assembled runtime. Their 4814/1586-byte historical identities remain in the unchanged v1 manifest and Git history. The prior `051f990` candidate and its successful [Windows CI39765270391](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39765270391) remain distinct historical evidence; they do not cover this addition.

The removed controller configures local photo folders, upload destination servers, WiFi-only behavior and native progress updates through the `cameraUpload` service. The fixed app.js registers that service only for iOS/Android. The current Electron apphost does not advertise cameraupload, and the settings route was already commented out. This is the desktop-usefulness decision for these two files, not a claim that every camera-upload-related property or service has no consumer.

Only that obsolete commented settings route block is removed from app.js: 674 bytes. Direct comparison with 051f990 proves all other raw and generated app bytes remain equal. The new fixed generated app SHA256 is `1f518be3ffa0e59780ac68e468feac105c696df468cfa9c90e88b9f6792e8eb6`; the previous 4deb9669…f8ffe4 identity is retained in the earlier record. There is no change to executable route logic.

## Preserved server administration and shared code

`/devices/cameraupload.html` remains an admin route using `devices/cameraupload.js`. It reads `ApiClient.getNamedConfiguration("devices")`, edits CameraUploadPath/EnableCameraUploadSubfolders and calls updateNamedConfiguration while retaining other server fields. Its controller and HTML retain SHA256 `bbd038cc8c4244ce1393aba17950852527321afb52cebfd24fca5fea4dea3218` and `72a55e3b4b9be2c74ba5eaa2dd0cffcf0bad909b3c59a721f2d2286a78d9dd30` respectively. The navigation drawer still links to this devices page.

Shared appsettings keys, local sync code, ApiClient methods, conditional native aliases, generic/touch layouts and all other mobile candidates are unchanged. No stored setting, server configuration or account data is migrated or deleted. General notices and original historical manifest/hash records stay preserved; this limited retirement is not a project-wide source/license conclusion.

## Selection and verification

Active Web count is now716; compatibility39 and small-runtime2 remain. The combined reviewed scope is fifteen retired resources plus two replaced small-resource bodies, seventeen old paths in total. The original three v1 manifests remain byte-identical. Since v2 is still an unmerged review candidate, this approved addition updates that candidate's explicit selection; prior commit/CI identities are retained rather than rewritten or presented as new validation.

The two resource files plus the inactive comment block reduce business payload by7074 bytes. Combined PR69 business payload reduction is27,009,333 bytes, excluding notice/provenance changes; compressed installer size is not measured. Base/intermediate resource counts are807/922.

`tests/mobile-camera-settings-retirement.test.cjs` executes the actual desktop capability and conditional service registration in a VM, evaluates real route literals, loads the real devices controller with mock API/DOM, verifies configuration load/save and unrelated fields, pins preserved server file hashes, and checks production Web assembly/overlays for absent settings files and dangling settings references. This is static/isolated validation, not real GUI, upload, server or login acceptance. Installer building, merging and publishing are deferred as instructed.
