# Native Preview Trial

This is an opt-in, portable test overlay on an unchanged source-bound standard payload. Normal Host/package entry remains unchanged and does not enable ETE_WINDOWS_NATIVE_TRIAL. Launch-Trial.ps1 requires a new profile outside this bundle; no authentication seed is included. Test-Owner.ps1 uses only newly generated local red/green Y4M files and a source-bound production helper. Neither a static selfcheck nor helper snapshot PASS proves visible taskbar/Peek acceptance.

The added Koffi 3.3.3 and @koromix/koffi-win32-x64 3.3.3 inputs come only from exact registry.npmjs.org tarballs recorded by lock SRI, archive SHA256 and per-member SHA256. No npm install scripts execute. Koffi and its Windows addon are MIT; the full Koffi LICENSE.txt and vendor node-api-headers/LICENSE / node-addon-api/LICENSE.md remain under electronapp/enhanced/native-media/node_modules/koffi/. The standard payload's third-party notices remain unchanged.

Run the selfcheck before launching. Use separate new output/profile directories for every probe; do not install over the normal application or copy an existing user's profile. Keep profiles and logs outside this distributable bundle.
