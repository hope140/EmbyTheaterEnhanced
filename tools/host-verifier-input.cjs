'use strict';
// Exact verifier inputs; source-fingerprint bindings include the Host exit candidate.
// No generated evidence or binaries are accepted.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const FILES = Object.freeze([
    {
        "path": "tools/windows-host-verifier/ConsumerBoundaryProbe.WorkConstructors.cs",
        "size": 14252,
        "sha256": "785d4b7d64e4b8c61a39488b786a9f9775e81f82a16815e5c19dabda8663f90c"
    },
    {
        "path": "tools/windows-host-verifier/ConsumerTransportProbe.Work.cs",
        "size": 13809,
        "sha256": "b9d46e5f468f1ae1d7dca10ee678641253e888fed60849c3e89cd859f1eeb4a8"
    },
    {
        "path": "tools/windows-host-verifier/EteHostObserver.cs",
        "size": 3660,
        "sha256": "db68c03f432de375274d26027efe5cab97cacd134b41427badd11a8b6bfb1de2"
    },
    {
        "path": "tools/windows-host-verifier/EteTestFixtures.cs",
        "size": 4828,
        "sha256": "ceb10f8bb28c7ce0ec8b43f404292ad0a97ecec63f4aedbb86d2e8fa2ea71b1c"
    },
    {
        "path": "tools/windows-host-verifier/ExactJsonDifferenceCasesV2.cs",
        "size": 3830,
        "sha256": "872684fc6e7aa3fe3abbbfa71723ccebb4a431bca52cf73dc9e7f6cfe25eb0aa"
    },
    {
        "path": "tools/windows-host-verifier/Finalize-Evidence.ps1",
        "size": 8508,
        "sha256": "bb6f59f93dc7e659efc5d34cdc64da453a052374e9efdac7d2b93b91494835f2"
    },
    {
        "path": "tools/windows-host-verifier/Framework-BuildHelpers.ps1",
        "size": 2461,
        "sha256": "d61fb59dbe66ae74552c04c97b9306cfc1e89b420c1793bc51735bcd415d36f5"
    },
    {
        "path": "tools/windows-host-verifier/Framework-Implementation.ps1",
        "size": 6398,
        "sha256": "a332196e072ea4f45f336c5c926c1b65145c17eb77a2e339d166c9536094fe4b"
    },
    {
        "path": "tools/windows-host-verifier/FrameworkFixtureMaker.cs",
        "size": 5397,
        "sha256": "e8dacf738e6da8db1a66ea30505553b57ebcd11c4bc7e7bf4ba14eb8e55deb4a"
    },
    {
        "path": "tools/windows-host-verifier/HostPair.template.ps1",
        "size": 15500,
        "sha256": "14441ae959686e8421c772c33918ddc5abfd05b6277e66e3b0a805287de9b160"
    },
    {
        "path": "tools/windows-host-verifier/JsonContractStubs.cs",
        "size": 1302,
        "sha256": "fcd6d6c25d485a5634e1aaec032478947c527e0b6f32002cc2ea8392f4ec0fb2"
    },
    {
        "path": "tools/windows-host-verifier/JsonUnitProgram.cs",
        "size": 21733,
        "sha256": "e9d760703cc080155c16b9ae8a939aced7ec936e3e5f26fe090e0353e9c5b85d"
    },
    {
        "path": "tools/windows-host-verifier/LICENSE-Helpers-MIT.txt",
        "size": 1095,
        "sha256": "9ea516699794ce62078b3cb39c45e9a94db23c3db23e3b7f03a1e90d83e5152e"
    },
    {
        "path": "tools/windows-host-verifier/LICENSE-Newtonsoft-MIT.md",
        "size": 1104,
        "sha256": "b98a397897ff55f76cddc380041507a95a896b2946e0188703bf0496793d6516"
    },
    {
        "path": "tools/windows-host-verifier/LICENSE.md",
        "size": 18014,
        "sha256": "f371b80469fb235bc500ec29e0e85b682d4a6157a158567d828ff0be544d4f1d"
    },
    {
        "path": "tools/windows-host-verifier/OfficialModelContractProbe.cs",
        "size": 6707,
        "sha256": "0b13908bd840dfa26049b1c7740f31b5dac36e65315386136745575b72cd3d07"
    },
    {
        "path": "tools/windows-host-verifier/Prepare-HostPair.ps1",
        "size": 3594,
        "sha256": "a4dbc749f980f312f76a4eacbc2ca8c8cd47e230a701f0d010229097928b87a5"
    },
    {
        "path": "tools/windows-host-verifier/README.txt",
        "size": 3523,
        "sha256": "80ac27b26ab1cc5c4de37e01b2d6aae5199a6a0950d172783cecadddf5b6a172"
    },
    {
        "path": "tools/windows-host-verifier/Read-ExePdbMatch.ps1",
        "size": 2185,
        "sha256": "43600c90d27b41ec069d3a353418d1fd8106ceb3c07ebbb8c8aea6b0215feadd"
    },
    {
        "path": "tools/windows-host-verifier/RealModelJsonProbe.ApprovedStrict.cs",
        "size": 9907,
        "sha256": "c2f42930324b8e2c7cf56c957ca76664f69f45d8545689cdb7b280f5a52b12dc"
    },
    {
        "path": "tools/windows-host-verifier/Run-Boundaries.ps1",
        "size": 6331,
        "sha256": "4f9416b7428933d7040f43c98ec5bfeb43346916790692734e30b1c7d881e30f"
    },
    {
        "path": "tools/windows-host-verifier/Run-Components.ps1",
        "size": 4443,
        "sha256": "34ee792daf1e6c4912bc8a0659777e7bbb5b3477e8544fa891be441622598d89"
    },
    {
        "path": "tools/windows-host-verifier/Run-Transport.ps1",
        "size": 6387,
        "sha256": "edc225c605da3b95efb89c8ac80825fe57fa07d0993fa50ef883195c20fc9ebf"
    },
    {
        "path": "tools/windows-host-verifier/RuntimeIdentity.cs",
        "size": 915,
        "sha256": "82a9e6f9c2d920d12b43980db7fd3a63c302440ef4265aa2cb34c776859ab581"
    },
    {
        "path": "tools/windows-host-verifier/UnifiedZipProbe.cs",
        "size": 1823,
        "sha256": "7114757d39757322a2a986af6f0d3bda4eee773c9c4bb5b708df1821c361c2b1"
    },
    {
        "path": "tools/windows-host-verifier/Verify-UnifiedHost.ps1",
        "size": 9822,
        "sha256": "16186de4becf700c783c77fe5d185780edafb74c0b908fb81b968b2137703f3e"
    },
    {
        "path": "tools/windows-host-verifier/ZipContractStubs.cs",
        "size": 1140,
        "sha256": "1102819bb1279ee252b0f21e1fad44c157909d5e5dbdedd0c6f303dcb6496fdc"
    },
    {
        "path": "tools/windows-host-verifier/ZipUnitProgram.cs",
        "size": 8730,
        "sha256": "b8c40e7797c70dc1f0dad728c0c18ec3522e9866ff7528e9ac367b3cad0fd8bd"
    },
    {
        "path": "tools/windows-host-verifier/expected-build-contract.json",
        "size": 1618,
        "sha256": "4d78666dd51fb92796fc0771507d52bed27ce3f812ddccb79373b0c7f677f0e5"
    },
    {
        "path": "tools/windows-host-verifier/expected-candidate-files.json",
        "size": 9522,
        "sha256": "58b3f69adad4d1d4539cb0c9cfaa04ba6744ecdc4dca696658d27d5c29e54936"
    },
    {
        "path": "tools/windows-host-verifier/fixtures-pending/emby-theater.zip",
        "size": 207,
        "sha256": "4c8495ce55dfa28c1170b14533291a73b554bb198761f6cd70f836f7fa53241b"
    },
    {
        "path": "tools/windows-host-verifier/fixtures-pending/emby-theater.zip.ver",
        "size": 33,
        "sha256": "0a69151594a2743c26a0a3453a1d81ed18d5cdb6be39abe564c8678473d2b13e"
    },
    {
        "path": "tools/windows-host-verifier/verifier-manifest.json",
        "size": 5237,
        "sha256": "3d0d09a4e17f41729b98fcbd6cfa570ccf6be6bb33808fb65a4afdc2ec20658d"
    }
].map(Object.freeze));
const PATHS = Object.freeze(FILES.map(f => f.path));
const BINARY_PATHS = Object.freeze(['tools/windows-host-verifier/fixtures-pending/emby-theater.zip']);
function validate(rootArg) {
    const root = path.resolve(rootArg), prefix = 'tools/windows-host-verifier/';
    for (const f of FILES) {
        const file = path.join(root, f.path);
        for (let p = file;; p = path.dirname(p)) {
            if (fs.lstatSync(p).isSymbolicLink()) throw Error('Host verifier redirects forbidden.');
            if (p === path.dirname(p)) break;
        }
        if (!fs.lstatSync(file).isFile() || fs.realpathSync.native(file).toLowerCase() !== file.toLowerCase()) throw Error('Host verifier physical file required.');
        const b = fs.readFileSync(file);
        if (b.length !== f.size || crypto.createHash('sha256').update(b).digest('hex') !== f.sha256) throw Error('Host verifier byte identity mismatch: ' + f.path);
    }
    function walk(dir) {
        return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
            const p = path.join(dir, e.name);
            if (e.isSymbolicLink()) throw Error('Host verifier redirects forbidden.');
            return e.isDirectory() ? walk(p) : [path.relative(root, p).split(path.sep).join('/')];
        });
    }
    if (JSON.stringify(walk(path.join(root, prefix)).sort()) !== JSON.stringify([...PATHS].sort())) throw Error('Host verifier file set mismatch.');
    return {files: FILES.length, bytes: FILES.reduce((n, f) => n + f.size, 0)};
}
module.exports = {FILES, PATHS, BINARY_PATHS, validate};
if (require.main === module) {
    try { process.stdout.write(JSON.stringify(validate(process.argv[2])) + '\n'); }
    catch (e) { process.stderr.write(e.message + '\n'); process.exitCode = 1; }
}
