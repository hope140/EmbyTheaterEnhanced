'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const externalPlayerRegistration = require('./patch-external-player-registration.cjs');
const customCssJs = require('./patch-custom-css-js.cjs');
const externalPlayerResidue = require('./patch-externalplayer-residue.cjs');
const itemControls = require('./patch-item-controls.cjs');
const itemLifecycle = require('./patch-item-lifecycle.cjs');
const pluginSettings = require('./patch-plugin-settings.cjs');
const serverHome = require('./patch-server-home.cjs');
const movieBrowser = require('./patch-movie-browser.cjs');
const trackedFileHash = require('./tracked-file-hash.cjs');

const GENERATOR_PATH = 'tools/prepare-web-overlays.cjs';
const APP_GENERATOR_PATH = 'tools/patch-external-player-registration.cjs';
const CUSTOM_CSS_JS_GENERATOR_PATH = 'tools/patch-custom-css-js.cjs';
const EXTERNAL_PLAYER_RESIDUE_GENERATOR_PATH = 'tools/patch-externalplayer-residue.cjs';
const ITEM_CONTROLS_GENERATOR_PATH = 'tools/patch-item-controls.cjs';
const ITEM_LIFECYCLE_GENERATOR_PATH = 'tools/patch-item-lifecycle.cjs';
const PLUGIN_GENERATOR_PATH = 'tools/patch-plugin-settings.cjs';
const HOME_GENERATOR_PATH = 'tools/patch-server-home.cjs';
const MOVIE_GENERATOR_PATH = 'tools/patch-movie-browser.cjs';

const WEB_OVERLAY_CONTRACT = Object.freeze([
    Object.freeze({
        id: 'movie-browse-items-container',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js',
        inputPath: null,
        runtimePath: 'electronapp/www/modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js',
        expectedBaseSha256: '46670CE92ADF5A46BA6F7689481E89CD39A5D423A9F97D9D78F45E49F1E86E49',
        expectedInputSha256: null,
        expectedOutputSha256: '57C5A0F1FF6DE6129FC7BDFA54079E45454F6769F34C20AEFD39C5BD49F2C4DF',
        transform: 'patchItemsContainer',
        generatorPaths: Object.freeze([GENERATOR_PATH, MOVIE_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'movie-browse-virtual-scroller',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/modules/virtual-scroller/virtual-scroller.js',
        inputPath: null,
        runtimePath: 'electronapp/www/modules/virtual-scroller/virtual-scroller.js',
        expectedBaseSha256: 'D2982A619FDF3DC7F9ED13910D0CAB3723E7122440B02214057D2FC6A592A5B9',
        expectedInputSha256: null,
        expectedOutputSha256: 'D84307154E5380B384452C76823B6AA7FDD5325855B431F4EA92A5EA3EEC1247',
        transform: 'patchVirtualScroller',
        generatorPaths: Object.freeze([GENERATOR_PATH, MOVIE_GENERATOR_PATH])
    }),

    Object.freeze({
        id: 'movie-browse-videos-tab',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/modules/tabbedview/videostab.js',
        inputPath: null,
        runtimePath: 'electronapp/www/modules/tabbedview/videostab.js',
        expectedBaseSha256: '33953C30C79BE3AD95E4010E0BA40BD96B0CA660E2BE0A46B58453532D46EAE4',
        expectedInputSha256: null,
        expectedOutputSha256: '72E2CA3737C9F47D73CEEE9C27BB75348FB90FD65A38FF7E5C51977927343A40',
        transform: 'patchVideosTab',
        generatorPaths: Object.freeze([GENERATOR_PATH, MOVIE_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'movie-browse-items-tab',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/modules/tabbedview/itemstab.js',
        inputPath: null,
        runtimePath: 'electronapp/www/modules/tabbedview/itemstab.js',
        expectedBaseSha256: '1B3E4D45BF73CA5EF748E88EE9A1A8366969FA1C0F55F29E4A01540FE1197D82',
        expectedInputSha256: null,
        expectedOutputSha256: 'D49E1E0CDA0E044A360B21162E24D932435A95A32C0915C393A858616F768DCA',
        transform: 'patchItemsTab',
        generatorPaths: Object.freeze([GENERATOR_PATH, MOVIE_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'movie-browse-list-controller',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/modules/tabbedview/listcontroller.js',
        inputPath: null,
        runtimePath: 'electronapp/www/modules/tabbedview/listcontroller.js',
        expectedBaseSha256: 'A8776FF47B4811A68AC177722FA3CD5FF7C7DE2B760B50EE9FB5ACF8C16D92D1',
        expectedInputSha256: null,
        expectedOutputSha256: '999748A15FA9E0F81FF4F5945ADD32B21B24CE6DBD6DAE6A0F4C0B3CC883D643',
        transform: 'patchListController',
        generatorPaths: Object.freeze([GENERATOR_PATH, MOVIE_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'movie-browse-categories',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/home_horiz/views.movies.js',
        inputPath: null,
        runtimePath: 'electronapp/www/home_horiz/views.movies.js',
        expectedBaseSha256: 'DA5964B009397D1EA73E72DF87105F9B4E20ED08CE829AD0449269A315A89FA4',
        expectedInputSha256: null,
        expectedOutputSha256: '8B750A47CC2D04AC0B403A2A96E4347DA3EDBDB9ACB342A5D9634B1B71918C77',
        transform: 'patchMovieCategories',
        generatorPaths: Object.freeze([GENERATOR_PATH, MOVIE_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'custom-css-js',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/modules/CustomCssJS.js',
        inputPath: null,
        runtimePath: 'electronapp/www/modules/CustomCssJS.js',
        expectedBaseSha256: '2177DE28DCC4E715F07C63329DC361C5B4DDD37EB7E59F273830B22ACEA37912',
        expectedInputSha256: null,
        expectedOutputSha256: 'B9F6268F3E3126426F189F38F1E57FF4CD03D8F9A213305157E1F6842F251103',
        generatorPaths: Object.freeze([GENERATOR_PATH, CUSTOM_CSS_JS_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'item-externalplayer-residue',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/item/item.js',
        inputPath: null,
        runtimePath: 'electronapp/www/item/item.js',
        expectedBaseSha256: 'C8F51119365ECD2881B0A33F1F9E9DD6DA90E305572621188FB31A15FDCB4623',
        expectedInputSha256: null,
        expectedOutputSha256: '72311EB4FD8E2A151B280366218A44DE802DB1083BD71DA99F9EF1CB8CC3AB11',
        generatorPaths: Object.freeze([GENERATOR_PATH, EXTERNAL_PLAYER_RESIDUE_GENERATOR_PATH, ITEM_LIFECYCLE_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'item-externalplayer-residue-template',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/item/item.html',
        inputPath: null,
        runtimePath: 'electronapp/www/item/item.html',
        expectedBaseSha256: 'A11D00BB58F83A9F56A16F137342D5C3B62DF03AE83436527D426B56B160A6B5',
        expectedInputSha256: null,
        expectedOutputSha256: '03A897B7266A59B687E2B74A8253BE9A46FC9997FAD18BC4E956E5A5ADFA1E33',
        generatorPaths: Object.freeze([GENERATOR_PATH, EXTERNAL_PLAYER_RESIDUE_GENERATOR_PATH, ITEM_CONTROLS_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'item-track-selection-layout',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/modules/layout.css',
        inputPath: null,
        runtimePath: 'electronapp/www/modules/layout.css',
        expectedBaseSha256: 'D6EB9A45859D776806B7B7078C4763C452DADA04834B3F461797DEE1FE80DC8C',
        expectedInputSha256: null,
        expectedOutputSha256: '81241E0E01B21602C646A6630D8707F75E99F619E600DD16018C4D9223F3DFF5',
        generatorPaths: Object.freeze([GENERATOR_PATH, ITEM_CONTROLS_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'apiclient',
        mode: 'vendor-payload-replacement',
        basePath: 'vendor/carnival/electronapp/www/modules/emby-apiclient/apiclient.js',
        inputPath: 'vendor/patch/payload/client/apiclient.js',
        runtimePath: 'electronapp/www/modules/emby-apiclient/apiclient.js',
        expectedBaseSha256: 'F3516C72784E5BC8782ABBCE021F22A7F939034E5B8B70639672AE682E18ACC0',
        expectedInputSha256: 'A4A901640ABE6BC25188C1CF27FB53125B4F65EF2A797DEF033DC55165B080AE',
        expectedOutputSha256: 'A4A901640ABE6BC25188C1CF27FB53125B4F65EF2A797DEF033DC55165B080AE',
        generatorPaths: Object.freeze([GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'toast-css',
        mode: 'vendor-payload-replacement',
        basePath: 'vendor/carnival/electronapp/www/modules/toast/toast.css',
        inputPath: 'vendor/patch/payload/client/toast.css',
        runtimePath: 'electronapp/www/modules/toast/toast.css',
        expectedBaseSha256: 'E4E8EFCDFBE4841FD05B6CFE6B2A94393474899F3977416077D99B4F8CAD0E39',
        expectedInputSha256: '654AEB05C1B89CA625CC6BD9145F1966A780C0E80FE1197F619800C5F1894743',
        expectedOutputSha256: '654AEB05C1B89CA625CC6BD9145F1966A780C0E80FE1197F619800C5F1894743',
        generatorPaths: Object.freeze([GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'app-js',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/app.js',
        inputPath: null,
        runtimePath: 'electronapp/www/app.js',
        expectedBaseSha256: '3EF3102567458359A02E2FE8F79A8700CFE9C223347ABE5AB6ECB8BD93BE89D2',
        expectedInputSha256: null,
        expectedOutputSha256: '2588872934F2F95D613AFD6B6DCFF90D654035873B278F556AB73BED96F5BC92',
        generatorPaths: Object.freeze([GENERATOR_PATH, APP_GENERATOR_PATH, PLUGIN_GENERATOR_PATH, HOME_GENERATOR_PATH, MOVIE_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'server-home-tab',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/home/hometab.js',
        inputPath: null,
        runtimePath: 'electronapp/www/home/hometab.js',
        expectedBaseSha256: '649CD90AD590898187D7CFA4B969339734FC5DED93149EDEE0454C66C2773DA6',
        expectedInputSha256: null,
        expectedOutputSha256: 'EE30D819DE898154D8D6727CE31FE86418F79761368FA4B7075F071DF56635CB',
        generatorPaths: Object.freeze([GENERATOR_PATH, HOME_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'plugin-viewmanager',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/modules/viewmanager/viewmanager.js',
        inputPath: null,
        runtimePath: 'electronapp/www/modules/viewmanager/viewmanager.js',
        expectedBaseSha256: 'A15C0615FB7B2F69A0EAAF7052B9CDD6317E6A58D9D2B2D2C5B407ED4A95E1E3',
        expectedInputSha256: null,
        expectedOutputSha256: '6C6A7315C74984F96171149AA2993ED9B276B9E92CBFFC6E1F78DBB8955513E6',
        generatorPaths: Object.freeze([GENERATOR_PATH, PLUGIN_GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'plugin-router',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/modules/approuter.js',
        inputPath: null,
        runtimePath: 'electronapp/www/modules/approuter.js',
        expectedBaseSha256: 'CF4621BF3865BDE1ECB77BEFB2BEA67A0B4B505FC285BC83B743A880C4306AA1',
        expectedInputSha256: null,
        expectedOutputSha256: '3A2A73970AEA9156C79BCF5545693904B69A4C448854FA3BAAF4EEB6DD621691',
        generatorPaths: Object.freeze([GENERATOR_PATH, PLUGIN_GENERATOR_PATH])
    })
]);

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function readChecked(root, relativePath, expectedHash, label) {
    const file = path.join(root, relativePath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        throw new Error(label + ' missing: ' + relativePath);
    }
    const value = fs.readFileSync(file);
    const actualHash = sha256(value);
    if (actualHash !== expectedHash) {
        throw new Error(label + ' hash mismatch: ' + relativePath + ' expected=' + expectedHash + ' actual=' + actualHash);
    }
    return value;
}

function outputFor(root, contract) {
    const base = readChecked(root, contract.basePath, contract.expectedBaseSha256, 'Web overlay base');
    if (contract.mode === 'vendor-payload-replacement') {
        return {
            base,
            input: readChecked(root, contract.inputPath, contract.expectedInputSha256, 'Web overlay input')
        };
    }
    if (contract.id === 'custom-css-js' && contract.mode === 'tracked-canonical-transform') {
        return {base, input: Buffer.from(customCssJs.patchText(base.toString('utf8')), 'utf8')};
    }
    if (contract.id === 'item-externalplayer-residue' && contract.mode === 'tracked-canonical-transform') {
        return {base, input: Buffer.from(itemLifecycle.patchItemLifecycle(externalPlayerResidue.patchItemText(base.toString('utf8'))), 'utf8')};
    }
    if (contract.id === 'item-externalplayer-residue-template' && contract.mode === 'tracked-canonical-transform') {
        const withoutLegacyButton = externalPlayerResidue.patchItemHtmlText(base.toString('utf8'));
        return {base, input: Buffer.from(itemControls.patchItemHtmlText(withoutLegacyButton), 'utf8')};
    }
    if (contract.id === 'item-track-selection-layout' && contract.mode === 'tracked-canonical-transform') {
        return {base, input: Buffer.from(itemControls.patchLayoutCssText(base.toString('utf8')), 'utf8')};
    }
    if (contract.id === 'app-js' && contract.mode === 'tracked-canonical-transform') {
        const transformed = externalPlayerRegistration.patchText(base.toString('utf8'));
        if (transformed.action !== 'patched') {
            throw new Error('Web overlay canonical transform did not patch the frozen app.js base.');
        }
        return {base, input: Buffer.from(movieBrowser.patchApp(serverHome.patchApp(pluginSettings.patchApp(transformed.text))), 'utf8')};
    }
    if (contract.id === 'server-home-tab' && contract.mode === 'tracked-canonical-transform') {
        return {base, input: Buffer.from(serverHome.patchHomeTab(base.toString('utf8')), 'utf8')};
    }
    if (contract.id.startsWith('movie-browse-')) {
        return {base, input: Buffer.from(movieBrowser[contract.transform](base.toString('utf8')), 'utf8')};
    }
    if (contract.id === 'plugin-viewmanager' && contract.mode === 'tracked-canonical-transform') {
        return {base, input: Buffer.from(pluginSettings.patchViewManager(base.toString('utf8')), 'utf8')};
    }
    if (contract.id === 'plugin-router' && contract.mode === 'tracked-canonical-transform') {
        return {base, input: Buffer.from(pluginSettings.patchRouter(base.toString('utf8')), 'utf8')};
    }
    throw new Error('Unsupported Web overlay contract: ' + contract.id);
}

function generatorHashes(root, contract) {
    return contract.generatorPaths.map(generatorPath => {
        const file = path.join(root, generatorPath);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            throw new Error('Web overlay generator missing: ' + generatorPath);
        }
        return {path: generatorPath, sha256: trackedFileHash.hashTrackedTextFile(root, generatorPath)};
    });
}

function expectedEntry(root, runtimeRoot, contract, write) {
    const values = outputFor(root, contract);
    const outputHash = sha256(values.input);
    if (outputHash !== contract.expectedOutputSha256) {
        throw new Error('Web overlay generated output hash mismatch: ' + contract.runtimePath +
            ' expected=' + contract.expectedOutputSha256 + ' actual=' + outputHash);
    }
    const runtimeFile = path.join(runtimeRoot, contract.runtimePath);
    if (write) {
        fs.mkdirSync(path.dirname(runtimeFile), {recursive: true});
        fs.writeFileSync(runtimeFile, values.input);
    }
    if (!fs.existsSync(runtimeFile) || !fs.statSync(runtimeFile).isFile()) {
        throw new Error('Web overlay runtime output missing: ' + contract.runtimePath);
    }
    const runtimeSha256 = sha256(fs.readFileSync(runtimeFile));
    if (runtimeSha256 !== contract.expectedOutputSha256) {
        throw new Error('Web overlay runtime output hash mismatch: ' + contract.runtimePath +
            ' expected=' + contract.expectedOutputSha256 + ' actual=' + runtimeSha256);
    }
    return {
        id: contract.id,
        mode: contract.mode,
        basePath: contract.basePath,
        baseSha256: sha256(values.base),
        inputPath: contract.inputPath,
        inputSha256: contract.inputPath ? sha256(values.input) : null,
        generatorHashes: generatorHashes(root, contract),
        runtimePath: contract.runtimePath,
        expectedOutputSha256: contract.expectedOutputSha256,
        runtimeSha256
    };
}

function apply(rootArg, runtimeRootArg) {
    const root = path.resolve(rootArg);
    const runtimeRoot = path.resolve(runtimeRootArg);
    // Validate every input and generator before writing any output so a bad base
    // cannot leave a partially assembled Web snapshot.
    for (const contract of WEB_OVERLAY_CONTRACT) {
        const values = outputFor(root, contract);
        const outputHash = sha256(values.input);
        if (outputHash !== contract.expectedOutputSha256) {
            throw new Error('Web overlay generated output hash mismatch: ' + contract.runtimePath +
                ' expected=' + contract.expectedOutputSha256 + ' actual=' + outputHash);
        }
        generatorHashes(root, contract);
    }
    const entries = WEB_OVERLAY_CONTRACT.map(contract => expectedEntry(root, runtimeRoot, contract, true));
    return {schemaVersion: 1, status: 'passed', entries};
}

function inspect(rootArg, runtimeRootArg) {
    const root = path.resolve(rootArg);
    const runtimeRoot = path.resolve(runtimeRootArg);
    const entries = WEB_OVERLAY_CONTRACT.map(contract => expectedEntry(root, runtimeRoot, contract, false));
    return {schemaVersion: 1, status: 'passed', entries};
}

if (require.main === module) {
    const [root, runtimeRoot] = process.argv.slice(2);
    if (!root || !runtimeRoot) throw new Error('Usage: prepare-web-overlays.cjs <root> <runtime-root>');
    process.stdout.write(JSON.stringify(apply(root, runtimeRoot)) + '\n');
}

module.exports = {WEB_OVERLAY_CONTRACT, apply, inspect, sha256};
