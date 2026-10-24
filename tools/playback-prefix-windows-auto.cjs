'use strict';
// A separate, explicitly invoked derived-runtime experiment. Import/prepare never launch Electron.
// Uses a verified 043 Host payload plus exact next-source overlays. Not an ordinary installer or visible/settings/NAS acceptance.
const fs = require(process.versions.electron ? 'original-fs' : 'node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync, spawn} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const TOOLS_COMMIT = 'c9cd9bacf81445c9c10befd121951b1c63c86faa';
const FIXTURE_SIZES = Object.freeze([33182440, 304194304]);
const OWNER = 'ETE next-prefix automatic-chain experiment v1\n';
const MATRIX_PHASES = Object.freeze(['matrix-cancel', 'matrix-preempt', 'matrix-replace', 'matrix-exit', 'matrix-unsupported']);
const MATRIX_REMAINING = Object.freeze(MATRIX_PHASES.slice(1));
const CONFIG = Object.freeze({kind: 'next-prefix', progressPercent: 70, preloadMB: 300, timeoutMs: 30000});
const LOADER = Object.freeze({schemaVersion: 1, component: 'Electron', version: '44.4.2', platform: 'win32', arch: 'x64',
    archiveSha256: '6aae435b6cd5c0eedf9fd38824bae4045ffdaecd029f0b8c8328bac3f5b71f03', sourcePath: 'x64/electron/vulkan-1.dll',
    targetPath: 'electronapp/libmpv/x64/vulkan-1.dll', sha256: '7611034fc1bc24fa103b4c6bf923974cdec46fa506952d6f82cfef836db99fd1',
    relation: 'byte-identical-standard-payload-copy', size: 939008});
const PRODUCT_INPUT_COMMIT = '0fbb6f9c78320e83f2919c0324dc5db940310166';
const OVERLAY = Object.freeze([
    'enhanced/playback-prefix-store.js', 'enhanced/playback-range-cache.js',
    'enhanced/playback-range-http.js', 'enhanced/playback-range-identity.js',
    'enhanced/playback-range-policy.js', 'enhanced/playback-range-renderer.js',
    'enhanced/playback-range-session.js', 'enhanced/playback-range-user-settings.js',
    'plugins/mpvplayer/cache.html', 'plugins/mpvplayer/cache.js', 'main.js',
    'native-helper/service.js', 'native-helper/client.js', 'plugins/libmpv.js'
]);
const BOUNDARIES = Object.freeze(['anonymous-loopback-ApiClient-facade', 'settings-and-plugin-registration',
    'OSD-CSS-navigation-loading-alert', 'hidden-window-show-focus-suppression', 'owned-document-IPC-relay',
    'fixed-Alameda-loader-with-production-aliases']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = file => sha(fs.readFileSync(file));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
function need(value, code) {if (!value) throw Error(code);}
function writeNew(file, value) {fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});}
function git(repo, args, binary = false) {return execFileSync('git', args, {cwd: repo, windowsHide: true, maxBuffer: 16 * 1048576, ...(binary ? {} : {encoding: 'utf8'})});}
function physical(file) {need(fs.realpathSync.native(file) === path.resolve(file) && fs.lstatSync(file).isFile(), 'physical-file-required'); return file;}
function cleanEnvironment(plan, inherited = process.env) {
    const result = {...inherited};
    for (const name of Object.keys(result)) if (/^(?:GITHUB_TOKEN|GH_TOKEN|GH_ENTERPRISE_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN|NODE_OPTIONS|NODE_PATH|ELECTRON_RUN_AS_NODE|NODE_USE_ENV_PROXY|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/i.test(name)) delete result[name];
    return {...result, APPDATA: path.join(plan.out, 'profile'), LOCALAPPDATA: path.join(plan.out, 'profile/local'),
        MPV_HOME: path.join(plan.out, 'profile/mpv'), TEMP: path.join(plan.out, 'tmp'), TMP: path.join(plan.out, 'tmp'), NO_PROXY: '127.0.0.1,localhost'};
}
function supportAt(tools, source) {
    need(git(tools, ['rev-parse', 'HEAD']).trim() === TOOLS_COMMIT && !git(tools, ['status', '--porcelain', '--untracked-files=no']).trim(), 'immutable-tools-required');
    return require(path.join(source, 'tools/playback-range-windows-smoke.cjs'));
}
function inventory(root, tools) {return require(path.join(tools, 'tools/verify-installer-runtime.cjs')).inventory(root);}
function sourceControls(source, commit) {
    need(git(source, ['rev-parse', 'HEAD']).trim() === commit && !git(source, ['status', '--porcelain', '--untracked-files=no']).trim(), 'source-controls-drift');
    need(!git(source, ['diff', '--name-only', PRODUCT_INPUT_COMMIT, commit, '--', 'src', 'native']).trim(), 'product-input-source-drift');
    const expected = OVERLAY.map(member => 'src/electronapp/' + member).sort();
    const changed = git(source, ['diff', '--name-only', 'b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5', PRODUCT_INPUT_COMMIT, '--', 'src']).trim().split(/\r?\n/).sort();
    need(JSON.stringify(changed) === JSON.stringify(expected), 'overlay-source-set-mismatch');
}
function loaderDescriptor(source, commit, base) {
    sourceControls(source, commit);
    const lockPath = 'native/windows-media/loader-input.json', generatorPath = 'tools/windows-native-media-input.cjs';
    const lockBytes = git(source, ['show', commit + ':' + lockPath], true), lock = JSON.parse(lockBytes);
    const {size, ...expectedLock} = LOADER;
    need(JSON.stringify(lock) === JSON.stringify(expectedLock), 'fixed-loader-lock-mismatch');
    for (const member of [LOADER.sourcePath, LOADER.targetPath])
        need(base.get(member)?.sha256 === LOADER.sha256 && base.get(member)?.size === size, 'loader-base-source-or-target-mismatch');
    return {lockPath, lockSha256: sha(lockBytes).toUpperCase(), generatorPath,
        generatorSha256: sha(git(source, ['show', commit + ':' + generatorPath], true)).toUpperCase(), ...LOADER, alreadyPresent: true};
}
function verifyNativeMedia(source, runtime) {
    try {return require(path.join(source, 'tools/windows-native-media-input.cjs')).verify(source, runtime,
        require(path.join(source, 'tools/playback-range-windows-smoke.cjs')).CANDIDATE.commit);}
    catch (_) {throw Error('candidate-native-media-proof');}
}
function overlayRows(sourceRepo, sourceCommit, baseInventory) {
    need(/^[a-f0-9]{40}$/.test(sourceCommit || ''), 'exact-overlay-commit-required');
    git(sourceRepo, ['cat-file', '-e', sourceCommit + '^{commit}']);
    return OVERLAY.map(relative => {
        const member = 'electronapp/' + relative, source = 'src/' + member;
        const bytes = git(sourceRepo, ['show', sourceCommit + ':' + source], true);
        return {member, source, sourceCommit, beforeSha256: baseInventory.get(member)?.sha256 || null, sha256: sha(bytes), size: bytes.length, bytes};
    });
}
function verifyDerivedInventory(base, actual, rows, loader) {
    need(rows.length === OVERLAY.length && new Set(rows.map(row => row.member)).size === rows.length, 'overlay-set-invalid');
    const expected = new Map(base);
    for (const row of rows) {
        need(OVERLAY.includes(row.member.replace(/^electronapp\//, '')) && row.member.startsWith('electronapp/') &&
            row.source === 'src/' + row.member && row.beforeSha256 === (base.get(row.member)?.sha256 || null) &&
            /^[a-f0-9]{64}$/.test(row.sha256) && Number.isSafeInteger(row.size) && row.size > 0, 'overlay-row-invalid');
        expected.set(row.member, row);
    }
    if (loader) {
        need(loader.alreadyPresent === true && loader.sourcePath === LOADER.sourcePath && loader.targetPath === LOADER.targetPath &&
            loader.sha256 === LOADER.sha256 && loader.size === LOADER.size && loader.relation === LOADER.relation &&
            [loader.sourcePath, loader.targetPath].every(member => base.get(member)?.sha256 === loader.sha256 && base.get(member)?.size === loader.size), 'loader-copy-relationship-invalid');
    }
    need(expected.size === actual.size, 'derived-file-set-mismatch');
    for (const [member, row] of expected) need(actual.get(member)?.sha256 === row.sha256 && actual.get(member)?.size === row.size, 'derived-file-mismatch:' + member);
}
function verifyOverlaySource(rows, sources, sourceCommit) {
    need(/^[a-f0-9]{40}$/.test(sourceCommit || '') && rows.every(row => row.sourceCommit === sourceCommit) &&
        JSON.stringify(sources.map(({bytes, ...row}) => row)) === JSON.stringify(rows), 'overlay-source-relationship-changed');
}
function automaticFixtures(support, out) {
    const a = path.join(out, 'A.avi'); support.avi(a, 'A');
    // 64 seconds at three fps leaves 19.2 real seconds after 70% for 300 MB.
    // The prior 32s run warmed 237.5 MB before natural EOF; never hold back EOF.
    const bytes = fs.readFileSync(a), avih = bytes.indexOf(Buffer.from('avih')) + 8, strh = bytes.indexOf(Buffer.from('strh')) + 8;
    bytes.writeUInt32LE(Math.round(1e6 / 3), avih); bytes.writeUInt32LE(320 * 180 * 3 * 3, avih + 4); bytes.writeUInt32LE(3, strh + 24); fs.writeFileSync(a, bytes);
    const seed = path.join(out, 'B-seed.avi'); support.avi(seed, 'B');
    const b = fs.readFileSync(seed), index = b.length - (8 + 192 * 16), padding = FIXTURE_SIZES[1] - b.length;
    need(b.toString('ascii', index, index + 4) === 'idx1' && padding >= 8 && padding % 2 === 0, 'fixture-index-layout');
    b.writeUInt32LE(FIXTURE_SIZES[1] - 8, 4);
    const fd = fs.openSync(path.join(out, 'B.avi'), 'wx'), junk = Buffer.alloc(8); junk.write('JUNK'); junk.writeUInt32LE(padding - 8, 4);
    try {
        fs.writeSync(fd, b.subarray(0, index)); fs.writeSync(fd, junk);
        const zero = Buffer.alloc(1048576); for (let left = padding - 8; left > 0; left -= Math.min(left, zero.length)) fs.writeSync(fd, zero.subarray(0, Math.min(left, zero.length)));
        fs.writeSync(fd, b.subarray(index));
    } finally {fs.closeSync(fd);}
    fs.unlinkSync(seed);
    return ['A', 'B'].map((id, i) => {const file = id + '.avi', full = path.join(out, file), hash = hashFile(full);
        need(fs.statSync(full).size === FIXTURE_SIZES[i], 'fixture-size');
        return {file, size: FIXTURE_SIZES[i], sha256: hash, etag: '"' + hash + '"'};});
}
function driverSource(source, commit, executingFile = __filename) {
    const bytes = git(source, ['show', commit + ':tools/playback-prefix-windows-auto.cjs'], true);
    // Same narrow CRLF checkout equivalence as tracked-file-hash; no trimming,
    // BOM removal or other source transformation is accepted.
    const canonical = value => value.toString('utf8').replace(/\r\n/g, '\n');
    need(canonical(fs.readFileSync(executingFile)) === canonical(bytes), 'driver-source-mismatch');
    return bytes;
}
const PREPARE_STAGES = Object.freeze(['resolve-inputs', 'verify-tools', 'verify-base', 'base-inventory', 'driver-source',
    'overlay-source', 'loader-descriptor', 'output-root', 'copy-runtime', 'overlay-write', 'loader-retained', 'loader-validation',
    'derived-inventory', 'private-directories', 'fixtures', 'driver-and-plan']);
const PREPARE_CODES = Object.freeze(['immutable-tools-required', 'driver-source-mismatch', 'source-controls-drift', 'product-input-source-drift', 'overlay-source-set-mismatch',
    'fixed-loader-lock-mismatch', 'loader-validator-lock-disagreement', 'loader-base-source-or-target-mismatch', 'loader-notice-missing',
    'exact-overlay-commit-required', 'native-loader-lock-invalid', 'native-loader-member-mismatch', 'fresh-absolute-output-required',
    'physical-output-parent-required', 'output-outside-input-roots-required', 'loader-validator-proof-mismatch', 'derived-file-set-mismatch',
    'derived-file-mismatch', 'overlay-set-invalid', 'overlay-row-invalid', 'loader-copy-relationship-invalid', 'fixture-index-layout',
    'fixture-size', 'candidate-zip-identity', 'candidate-installer-receipt', 'candidate-runtime-manifest', 'candidate-runtime-source',
    'candidate-runtime-inventory', 'candidate-maintained-source', 'candidate-fixed-native-identity', 'candidate-native-media-proof', 'candidate-runtime-file', 'candidate-runtime-path', 'candidate-runtime-set', 'prepare-filesystem-error',
    'prepare-dependency-missing', 'prepare-git-failed', 'prepare-unexpected-error']);
function prepareFailure(error) {
    const raw = String(error?.message || ''), fixed = raw.split(':')[0];
    const systemCode = ['ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'ENOSPC', 'EMFILE', 'ENFILE', 'EIO', 'EINVAL', 'MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes(error?.code) ? error.code : null;
    const code = PREPARE_CODES.includes(fixed) ? fixed : systemCode
        ? /MODULE_NOT_FOUND/.test(systemCode) ? 'prepare-dependency-missing' : 'prepare-filesystem-error'
        : Number.isInteger(error?.status) ? 'prepare-git-failed' : 'prepare-unexpected-error';
    return {type: 'next-auto-prepare-failure', stage: PREPARE_STAGES.includes(error?.prepareStage) ? error.prepareStage : 'not-recorded', code,
        systemCode, gitExitCode: Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255 ? error.status : null};
}
function prepare({tools, source, sourceCommit, runtime, zip, out, report}) {
    let stage = 'resolve-inputs';
    const step = value => {stage = value; if (report) report({type: 'next-auto-prepare-stage', stage});};
    try {
        step('resolve-inputs');
        tools = fs.realpathSync.native(tools); source = fs.realpathSync.native(source); runtime = fs.realpathSync.native(runtime); zip = fs.realpathSync.native(zip);
        step('verify-tools'); sourceControls(source, sourceCommit); const support = supportAt(tools, source);
        step('verify-base'); const identity = support.verifyRuntime(tools, runtime, zip, root => inventory(root, tools));
        step('base-inventory'); const base = inventory(runtime, tools);
        step('driver-source'); const driverBytes = driverSource(source, sourceCommit);
        step('overlay-source'); const rows = overlayRows(source, sourceCommit, base);
        step('loader-descriptor'); const loader = loaderDescriptor(source, sourceCommit, base);
        step('output-root');
        need(path.isAbsolute(out) && !fs.existsSync(out), 'fresh-absolute-output-required');
        need(fs.realpathSync.native(path.dirname(out)) === path.resolve(path.dirname(out)), 'physical-output-parent-required');
        for (const protectedRoot of [tools, source, runtime]) {const relative = path.relative(protectedRoot, out); need(relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative), 'output-outside-input-roots-required');}
        fs.mkdirSync(out); out = fs.realpathSync.native(out); fs.writeFileSync(path.join(out, 'owner'), OWNER, {flag: 'wx'});
        step('copy-runtime');
        const derived = path.join(out, 'derived-runtime'); fs.cpSync(runtime, derived, {recursive: true, errorOnExist: true, force: false});
        step('overlay-write');
        for (const row of rows) {const target = path.join(derived, row.member); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.writeFileSync(target, row.bytes);}
        step('loader-retained');
        step('loader-validation');
        verifyNativeMedia(source, derived);
        step('derived-inventory'); verifyDerivedInventory(base, inventory(derived, tools), rows, loader);
        step('private-directories');
        for (const folder of ['profile', 'profile/local', 'profile/mpv', 'profile/electron', 'tmp']) fs.mkdirSync(path.join(out, folder), {recursive: true});
        step('fixtures'); const fixtures = automaticFixtures(support, out);
        step('driver-and-plan');
        const driver = path.join(out, 'auto-driver.cjs'); fs.writeFileSync(driver, driverBytes, {flag: 'wx'});
        const plan = {schema: 1, toolsCommit: TOOLS_COMMIT, tools, source, sourceCommit, runtime, zip, out, derived, driver, driverSha256: hashFile(driver),
            identity, productInputCommit: PRODUCT_INPUT_COMMIT, overlay: rows.map(({bytes, ...row}) => row), loader, config: CONFIG, boundaries: BOUNDARIES, fixtures,
            derivedProof: support.physicalPayloadProof(inventory(derived, tools)), evidence: 'derived-043-runtime-synthetic-next-and-joint-exit; not an ordinary-installer, Host-launch, visual, account or NAS acceptance'};
        writeNew(path.join(out, 'auto-plan.json'), plan); return plan;
    } catch (error) {
        if (error && typeof error === 'object') error.prepareStage = stage;
        throw error;
    }
}
function readPlan(file) {
    physical(file); const plan = readJson(file);
    need(plan.schema === 1 && plan.productInputCommit === PRODUCT_INPUT_COMMIT && plan.toolsCommit === TOOLS_COMMIT && JSON.stringify(plan.config) === JSON.stringify(CONFIG) &&
        JSON.stringify(plan.boundaries) === JSON.stringify(BOUNDARIES) && fs.realpathSync.native(plan.out) === plan.out &&
        path.resolve(file) === path.join(plan.out, 'auto-plan.json') && fs.readFileSync(path.join(plan.out, 'owner'), 'utf8') === OWNER &&
        plan.derived === path.join(plan.out, 'derived-runtime') && plan.driver === path.join(plan.out, 'auto-driver.cjs') &&
        hashFile(physical(plan.driver)) === plan.driverSha256, 'invalid-owned-plan');
    sourceControls(plan.source, plan.sourceCommit);
    const support = supportAt(plan.tools, plan.source), identity = support.verifyRuntime(plan.tools, plan.runtime, plan.zip, root => inventory(root, plan.tools));
    need(plan.driverSha256 === sha(git(plan.source, ['show', plan.sourceCommit + ':tools/playback-prefix-windows-auto.cjs'], true)), 'driver-source-mismatch');
    need(JSON.stringify(identity) === JSON.stringify(plan.identity), 'base-candidate-changed');
    const base = inventory(plan.runtime, plan.tools), rows = overlayRows(plan.source, plan.sourceCommit, base);
    verifyOverlaySource(plan.overlay, rows, plan.sourceCommit);
    const loader = loaderDescriptor(plan.source, plan.sourceCommit, base);
    need(JSON.stringify(loader) === JSON.stringify(plan.loader), 'loader-descriptor-changed');
    // The Node validator checks its full official Electron tree; Electron repeats the physical
    // base/copy/complete-derived relationship using original-fs (never virtual ASAR reads).
    if (!process.versions.electron) verifyNativeMedia(plan.source, plan.derived);
    const actual = inventory(plan.derived, plan.tools); verifyDerivedInventory(base, actual, rows, loader);
    need(JSON.stringify(support.physicalPayloadProof(actual)) === JSON.stringify(plan.derivedProof), 'derived-proof-changed');
    need(plan.fixtures.length === 2 && plan.fixtures.every((row, i) => row.file === ['A.avi', 'B.avi'][i] && row.size === FIXTURE_SIZES[i] &&
        hashFile(physical(path.join(plan.out, row.file))) === row.sha256 && row.etag === '"' + row.sha256 + '"'), 'fixture-changed');
    return plan;
}
function automaticOrder(trace) {
    const find = (type, predicate = () => true) => trace.find(row => row.type === type && predicate(row));
    const a = find('load', row => row.item === 'A'), b = find('load', row => row.item === 'B');
    const duration = a && find('native-property', row => row.generation === a.generation && row.name === 'duration' && row.value > 0);
    const threshold = duration && find('native-property', row => row.generation === a.generation && row.name === 'time-pos' && row.value / duration.value * 100 >= CONFIG.progressPercent);
    const number = value => Number.isFinite(value) ? value : null;
    return {aDurationSeconds: number(duration?.value), thresholdSeconds: number(threshold?.value), thresholdSeq: number(threshold?.seq),
        preloadSeq: number(find('range-preload')?.seq), readySeq: number(find('prefix-ready')?.seq),
        naturalEOFSeq: number(a && find('native-property', row => row.generation === a.generation && row.name === 'eof-reached' && row.value === true)?.seq),
        originalNextSeq: number(find('manager-next-track')?.seq), bLoadSeq: number(b?.seq),
        bFileLoadedSeq: number(b && find('native-property', row => row.generation === b.generation && row.name === 'file-loaded')?.seq),
        preloadCancelledSeq: number(find('range-preload-result', row => row.state === 'cancelled')?.seq)};
}
function validateTrace(trace, total) {
    const find = (type, predicate = () => true) => trace.find(row => row.type === type && predicate(row));
    const a = find('load', row => row.item === 'A'), b = find('load', row => row.item === 'B');
    // A also uses the production priority-observing proxy, but must store no media bytes.
    need(a && b && a.generation !== b.generation && a.direct === false && b.direct === false, 'actual-source-chain-missing');
    const duration = find('native-property', row => row.generation === a.generation && row.name === 'duration' && row.value > 0);
    const threshold = duration && find('native-property', row => row.generation === a.generation && row.name === 'time-pos' && row.value / duration.value * 100 >= CONFIG.progressPercent);
    const preload = find('range-preload'), ready = find('prefix-ready');
    const eof = find('native-property', row => row.generation === a.generation && row.name === 'eof-reached' && row.value === true);
    const next = find('manager-next-track'), loaded = find('native-property', row => row.generation === b.generation && row.name === 'file-loaded');
    need(threshold && preload && ready && eof && next && loaded && threshold.seq < preload.seq && preload.seq < ready.seq && ready.seq < eof.seq && eof.seq < next.seq && next.seq < b.seq && b.seq < loaded.seq, 'automatic-chain-order-missing');
    need(preload.diskBefore === 0 && ready.bytes === Math.min(CONFIG.preloadMB * 1000000, total) && ready.targetBytes === ready.bytes && ready.diskBytes <= CONFIG.preloadMB * 1000000, 'prefix-target-not-proven');
    need(find('native-property', row => row.generation === b.generation && row.name === 'core-idle' && row.value === false) &&
        find('native-property', row => row.generation === b.generation && row.name === 'time-pos' && row.value >= 0.25) &&
        find('decoded-B', row => row.width === 320 && row.height === 180 && row.vo === 'gpu-next'), 'B-native-decode-not-proven');
    need(find('prefix-read', row => row.itemId === 'B' && row.seq > b.seq && row.start === 0 && row.end > 0), 'B-prefix-read-not-observed');
    const fresh = trace.filter(row => row.type === 'origin-media' && row.item === 'B' && row.seq > eof.seq);
    const probes = fresh.filter(row => row.start === 0 && row.end === 0), misses = fresh.filter(row => row.end > 0);
    const lastPrefixBlock = Math.floor(CONFIG.preloadMB * 1000000 / 262144) * 262144;
    need(probes.length >= 1 && misses.length >= 1 && misses.every(row => row.start >= lastPrefixBlock && row.end >= CONFIG.preloadMB * 1000000), 'B-prefix-hit-or-native-miss-not-proven');
    need(trace.filter(row => row.type === 'manager-play-invocation').length === 1 && trace.filter(row => row.type === 'load').length === 2, 'unexpected-play-count');
    need(!trace.some(row => row.type === 'renderer-failure'), 'renderer-failed');
    return {defaultPreloadMB: CONFIG.preloadMB, progressPercent: CONFIG.progressPercent, targetBytes: ready.targetBytes,
        aDurationSeconds: duration.value, thresholdSeconds: threshold.value, preloadSeq: preload.seq, readySeq: ready.seq,
        naturalEOFSeq: eof.seq, originalNextSeq: next.seq, bLoadSeq: b.seq, aGeneration: a.generation, bGeneration: b.generation,
        observedBOriginProbeCount: probes.length, observedBNativeMissCount: misses.length, firstPrefixRefetches: 0,
        prefixReadCount: trace.filter(row => row.type === 'prefix-read' && row.itemId === 'B' && row.seq > b.seq).length,
        decodedWidth: 320, decodedHeight: 180, decoded: true, automatic: true};
}
// This function runs in the actual Electron renderer; no helper/property/EOF substitute exists here.
async function rendererBoot(input) {
    const bridge = window.prefixHarness, stubs = Object.create(null), registered = [];
    const report = (type, data = {}) => bridge.report({type, ...data});
    const common = 'modules/common/';
    const aliases = {playbackManager: common + 'playback/playbackmanager.js', events: 'modules/emby-apiclient/events.js',
        pluginManager: common + 'pluginmanager.js', appSettings: common + 'appsettings.js',
        userSettings: common + 'usersettings/usersettings.js', globalize: common + 'globalize.js', connectionManager: 'modules/emby-apiclient/connectionmanager.js'};
    // Use the unchanged pinned Alameda implementation. Script loading and module
    // identity stay asynchronous; aliases unwrap default exports as app.js does.
    const loaderDocument = {createElement: name => document.createElement(name), head: {appendChild(script) {
        script.addEventListener('load', () => {
            const member = new URL(script.src).pathname.split('/electronapp/')[1];
            if (member) report('module-loaded', {member: 'electronapp/' + member});
        });
        return document.head.appendChild(script);
    }}};
    const amd = new Function('document', bridge.source('www/modules/alameda/alameda.js') +
        ';return {require:requirejs,define:define};')(loaderDocument);
    window.define = amd.define; window.require = amd.require;
    amd.require.config({baseUrl: input.moduleBaseUrl, noRequireCss: true});
    const load = id => amd.require([id]).then(values => values[0]);
    function url(relative, params) {const u = new URL(relative, input.origin + '/'); for (const [key, value] of Object.entries(params || {})) if (value != null) u.searchParams.set(key, value); return u.href;}
    const get = async relative => {const r = await fetch(url(relative), {redirect: 'error'}); if (!r.ok) throw Error('fixture-api-failed'); return r.json();};
    const api = {serverAddress: () => input.origin, serverId: () => 'prefix-server', getCurrentUserId: () => 'anonymous', deviceId: () => 'prefix-device', accessToken: () => '',
        getUrl: url, getCurrentUser: () => get('Users/anonymous'), getItem: (_user, id) => get('Users/anonymous/Items/' + id),
        getPlaybackInfo: id => get('Items/' + id + '/PlaybackInfo'), getEpisodes: series => get('Shows/' + series + '/Episodes'), getEndpointInfo: () => Promise.resolve({IsLocal: true, IsInNetwork: true}),
        getSavedEndpointInfo: () => ({IsLocal: true, IsInNetwork: true}), isMinServerVersion: () => false,
        setAuthorizationInfoIntoRequest: () => {}, stopActiveEncodings: () => Promise.resolve(),
        reportPlaybackStart: info => (report('server-report', {method: 'start', item: info.ItemId}), Promise.resolve()),
        reportPlaybackProgress: info => (report('server-report', {method: 'progress', item: info.ItemId}), Promise.resolve()),
        reportPlaybackStopped: info => (report('server-report', {method: 'stop', item: info.ItemId}), Promise.resolve())};
    const appSettings = {get: key => key === 'mpv-volume' ? '0' : key === 'mpv-demuxermaxbytes' && input.scenario === 'matrix-preempt' ? '1048576' : null, set: () => {}, maxStreamingBitrate: () => 200000000, enableAutomaticBitrateDetection: () => false};
    const plugins = {ofType: type => registered.filter(plugin => plugin.type === type), mapPath: (_plugin, file) => file};
    stubs[aliases.appSettings] = {default: appSettings}; stubs[aliases.pluginManager] = {default: plugins};
    stubs[aliases.userSettings] = {default: {getSubtitleAppearanceSettings: () => ({}), enableCinemaMode: () => false, skipForwardLength: () => 30, skipBackLength: () => 10}};
    stubs[aliases.globalize] = {default: {translate: value => value}};
    stubs[aliases.connectionManager] = {default: {getApiClient: () => api, currentApiClient: () => api}};
    stubs[common + 'servicelocator.js'] = {appHost: {supports: () => false}, fullscreenManager: {}, serverNotifications: {}};
    stubs['modules/loading/loading.js'] = {default: {show: () => report('presentation-stub', {operation: 'loading'}), hide: () => {}}};
    stubs.embyRouter = {showVideoOsd: () => Promise.resolve(), setTransparency: () => {}};
    stubs.alert = () => {report('renderer-failure', {code: 'playback-alert'}); return Promise.resolve();};
    for (const [id, value] of Object.entries(stubs)) amd.define(id, [], () => value);
    for (const [alias, id] of Object.entries(aliases)) amd.define(alias, [], () =>
        load(id).then(value => value && Object.hasOwn(value, 'default') ? value.default : value));
    window.platform = 'win32'; window.PlayerWindowId = input.windowId;
    window.ipc = {invoke: (channel, payload) => bridge.invoke(channel, payload), send: (channel, payload) => bridge.send(channel, payload),
        on: (_channel, listener) => bridge.listen(data => listener(null, data)), removeListener: (_channel, listener) => bridge.unlisten(listener)};
    window.addEventListener('error', () => report('renderer-failure', {code: 'window-error'}));
    window.addEventListener('unhandledrejection', () => report('renderer-failure', {code: 'unhandled-rejection'}));
    try {
        const events = await load('events'), manager = await load('playbackManager'), Player = await load('../plugins/libmpv.js'), player = new Player();
        // Observe the original manager method; EOF remains the sole caller.
        const originalNextTrack = manager.nextTrack;
        manager.nextTrack = function () {report('manager-next-track'); return originalNextTrack.apply(this, arguments);};
        registered.push(player); events.trigger(plugins, 'registered', [player]);
        const items = await Promise.all((input.singleItem ? ['A'] : ['A', 'B']).map(id => api.getItem('anonymous', id)));
        window.prefixPreviewOwner = () => player.getNativePreviewOwner(items[0]);
        window.prefixStop = async () => {await manager.stop(); await player.destroy();};
        window.prefixAction = async operation => {
            report('matrix-action', {operation});
            if (operation === 'pause') manager.pause();
            else if (operation === 'unpause') manager.unpause();
            else if (operation === 'seek-back') await manager.seek(20000000);
            else if (operation === 'cancel') await manager.stop();
            else if (operation === 'replace') await manager.queueNext({items: [await api.getItem('anonymous', 'C')]});
            else throw Error('matrix-action-invalid');
        };
        report('manager-play-invocation');
        await manager.play({items, startIndex: 0, startPositionTicks: 0, fullscreen: false});
        if (manager.getCurrentPlayer() !== player || !player.currentSrc()) throw Error('initial-play-not-established');
        report('initial-play-resolved');
    } catch (error) {report('renderer-failure', {code: 'renderer-chain-failed', detail: String(error.message).slice(0, 180)});}
}
function preload() {
    const {contextBridge, ipcRenderer} = require('electron'); let listener;
    contextBridge.exposeInMainWorld('prefixHarness', {
        source: member => ipcRenderer.sendSync('prefix-source', member), report: value => ipcRenderer.send('prefix-report', value),
        invoke: (channel, value) => ipcRenderer.invoke(channel, value), send: (channel, value) => ipcRenderer.send(channel, value),
        listen: callback => {if (listener) ipcRenderer.removeListener('enhanced-native-helper-event', listener); listener = (_event, data) => callback(data); ipcRenderer.on('enhanced-native-helper-event', listener);},
        unlisten: () => {if (listener) ipcRenderer.removeListener('enhanced-native-helper-event', listener); listener = null;}
    });
}
async function fixtureServer(plan, record, options = {}) {
    const http = require('node:http'), active = new Set(), sockets = new Set(); let held = null, sequence = 0;
    function item(id) {return {Id: id, ServerId: 'prefix-server', Name: 'Synthetic ' + id, Type: 'Episode', MediaType: 'Video', SeriesId: 'synthetic-series',
        Path: id + '.avi', RunTimeTicks: id === 'A' ? 640000000 : 80000000, MediaSources: [media(id)]};}
    function media(id) {return {Id: id + '-avi', Container: 'avi', Protocol: 'Http', Path: id + '.avi', RunTimeTicks: id === 'A' ? 640000000 : 80000000, SupportsDirectPlay: false,
        SupportsDirectStream: true, SupportsTranscoding: false, DirectStreamUrl: 'Videos/' + id + '/stream.avi?Static=true&mediaSourceId=' + id + '-avi',
        MediaStreams: [{Index: 0, Type: 'Video', Codec: 'rawvideo', Width: 320, Height: 180, RealFrameRate: id === 'A' ? 3 : 24}], DefaultSubtitleStreamIndex: -1};}
    const server = http.createServer((req, res) => {
        active.add(res); res.once('close', () => active.delete(res));
        const u = new URL(req.url, 'http://127.0.0.1');
        if (req.method !== 'GET' || Object.keys(req.headers).some(key => /authorization|cookie|emby-token/i.test(key)) || u.searchParams.get('api_key')) {res.writeHead(403); res.end(); return;}
        let value;
        if (u.pathname === '/Users/anonymous') value = {Id: 'anonymous', Configuration: {EnableNextEpisodeAutoPlay: plan.autoPlay !== false, ResumeRewindSeconds: 0}};
        const metadata = /^\/Users\/anonymous\/Items\/([ABC])$/.exec(u.pathname), playback = /^\/Items\/([ABC])\/PlaybackInfo$/.exec(u.pathname);
        if (metadata) value = item(metadata[1]);
        if (u.pathname === '/Shows/synthetic-series/Episodes') value = {Items: ['A', 'B', 'C'].map(item)};
        if (playback) value = {MediaSources: [media(playback[1])], PlaySessionId: 'synthetic-session-' + playback[1]};
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (value) {res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(value)); return;}
        const match = /^\/Videos\/([ABC])\/stream\.avi$/.exec(u.pathname); if (!match) {res.writeHead(404); res.end(); return;}
        const proof = plan.fixtures[match[1] === 'A' ? 0 : 1], range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        if (req.headers.range && !range) {res.writeHead(416); res.end(); return;}
        const start = range ? Number(range[1]) : 0, end = range && range[2] ? Number(range[2]) : proof.size - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= proof.size) {res.writeHead(416); res.end(); return;}
        const requestId = ++sequence; record('origin-media', {requestId, item: match[1], start, end});
        res.setHeader('X-Fixture-Request', String(requestId));
        res.once('close', () => record('origin-closed', {requestId, item: match[1], start, end, complete: res.writableEnded}));
        if (options.unsupported && match[1] === 'A' && start === 0 && end === 0) {
            record('origin-ineligible', {requestId, status: 206, weakETag: true});
        }
        res.writeHead(range ? 206 : 200, {'Content-Type': 'video/x-msvideo', 'Content-Length': end - start + 1, ETag: options.unsupported && match[1] === 'A' ? 'W/' + proof.etag : proof.etag,
            'Accept-Ranges': 'bytes', ...(range ? {'Content-Range': `bytes ${start}-${end}/${proof.size}`} : {})});
        if (options.holdNext && match[1] === 'B' && start === (options.holdStart ?? 262144) && end > start && !held) {
            held = {requestId, response: res, start, end, file: path.join(plan.out, proof.file), completed: false}; const byte = Buffer.alloc(1), fd = fs.openSync(path.join(plan.out, proof.file), 'r');
            try {fs.readSync(fd, byte, 0, 1, start);} finally {fs.closeSync(fd);} res.write(byte);
            record('matrix-held', {requestId, item: 'B', start, end}); return;
        }
        const stream = fs.createReadStream(path.join(plan.out, proof.file), {start, end}); stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy()); stream.pipe(res);
    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    return {origin: 'http://127.0.0.1:' + server.address().port, active, get held() {return held;}, completeHeld() {
        need(held && !held.completed && !held.response.destroyed && held.end - held.start <= 1048576, 'fixture-held-not-completable');
        const bytes = Buffer.alloc(held.end - held.start), fd = fs.openSync(held.file, 'r');
        try {need(fs.readSync(fd, bytes, 0, bytes.length, held.start + 1) === bytes.length, 'fixture-short-read');} finally {fs.closeSync(fd);}
        held.completed = true; held.response.end(bytes); record('matrix-held-completed', {requestId: held.requestId});
    }, releaseHeld() {const bytes = held && !held.response.destroyed ? 1 : 0; if (bytes) held.response.write(Buffer.from([0])); record('matrix-late-release', {bytes}); return bytes;}, async close() {const done = new Promise(resolve => server.close(resolve)); for (const socket of sockets) socket.destroy(); await done; need(active.size === 0, 'live-origin-response');}};
}
const MATRIX_CODES = Object.freeze(['matrix-budget-contract', 'matrix-A-load-missing', 'matrix-ineligible-deadline',
    'matrix-ineligible-fallback-missing', 'matrix-held-deadline', 'matrix-real-threshold-missing', 'matrix-preempt-deadline',
    'matrix-preempt-close-order', 'matrix-A-ended-before-miss', 'matrix-native-cache-state-unavailable', 'matrix-seek-target-cached', 'matrix-foreground-miss-not-observed', 'matrix-seek-changed-generation', 'matrix-seek-position-unobserved', 'matrix-native-cache-readback', 'matrix-A-progress-stalled', 'matrix-pause-unobserved', 'matrix-replace-deadline',
    'matrix-replace-close-order', 'matrix-replace-shared-budget', 'matrix-source-close-missing', 'matrix-late-byte-accepted',
    'matrix-client-close-missing', 'matrix-held-not-active', 'matrix-background-concurrency', 'matrix-unrequested-next', 'matrix-cancel-state-restored', 'matrix-action-invalid']);
function observeOriginRequests(origin, record) {
    const http = require('node:http'), original = http.request, background = new Set(); let sequence = 0;
    function observed(...args) {
        const request = original.apply(this, args), url = args[0];
        const item = url && url.origin === origin && /^\/Videos\/([ABC])\/stream\.avi$/.exec(url.pathname);
        const range = /^bytes=(\d+)-(\d+)$/.exec(args[1]?.headers?.Range || '');
        if (item && range) {
            const data = {clientRequest: ++sequence, item: item[1], start: +range[1], end: +range[2]}; let requestId = null;
            if (item[1] !== 'A') background.add(request);
            record('origin-client-open', {...data, backgroundActive: background.size});
            request.once('response', response => {const n = Number(response.headers['x-fixture-request']); if (Number.isSafeInteger(n) && n > 0) requestId = n;});
            request.once('close', () => {background.delete(request); record('origin-client-closed', {...data, requestId, backgroundActive: background.size});});
        }
        return request;
    }
    http.request = observed;
    return () => {if (http.request === observed) http.request = original;};
}
function uncachedSeekTarget(cache, position, target = 2) {
    const ranges = cache && cache['seekable-ranges'];
    need(Array.isArray(ranges) && ranges.every(row => Number.isFinite(row.start) && Number.isFinite(row.end)), 'matrix-native-cache-state-unavailable');
    need(Number.isFinite(position) && position > target + 1 && !ranges.some(row => target >= row.start && target <= row.end), 'matrix-seek-target-cached');
    return target;
}
async function matrixCase({phase, service, origin, trace, record, action, client, fatal, previewOwner}) {
    const deadline = Date.now() + 55000; let peak = 0, preemptPending = phase === 'matrix-preempt', previewEvidence = {};
    async function until(predicate, code, limitMs = 55000) {
        const stageDeadline = Math.min(deadline, Date.now() + limitMs);
        while (Date.now() < stageDeadline) {
            if (fatal()) throw Error('renderer-chain-failed');
            if (preemptPending) need(!trace.some(row => row.type === 'manager-next-track' || row.type === 'load' && row.item !== 'A' ||
                row.type === 'native-property' && row.generation === a.generation && row.name === 'eof-reached' && row.value === true), 'matrix-A-ended-before-miss');
            const state = service.rangeStatus(); peak = Math.max(peak, state.diskBytes || 0);
            need(state.kind === 'next-prefix' && state.maxBytes === 300000000 && state.diskBytes <= 300000000, 'matrix-budget-contract');
            if (predicate()) return;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        throw Error(code);
    }
    const a = trace.find(row => row.type === 'load' && row.item === 'A'); need(a, 'matrix-A-load-missing');
    const threshold = () => {
        const duration = trace.find(row => row.type === 'native-property' && row.generation === a.generation && row.name === 'duration' && row.value > 0);
        return duration && trace.find(row => row.type === 'native-property' && row.generation === a.generation && row.name === 'time-pos' && row.value / duration.value * 100 >= CONFIG.progressPercent);
    };
    if (phase === 'matrix-unsupported') {
        await until(() => threshold() && trace.some(row => row.type === 'range-preload-result' && row.state === 'unavailable'), 'matrix-ineligible-deadline');
        const video = await client().getProperty('video-out-params', 2000), vo = await client().getProperty('current-vo', 2000);
        need(a.direct && video?.w === 320 && video?.h === 180 && vo === 'gpu-next' && trace.some(row => row.type === 'origin-ineligible' && row.weakETag === true) &&
            !trace.some(row => row.type === 'origin-media' && row.item === 'B') && service.rangeStatus().current.state === 'original' && peak === 0, 'matrix-ineligible-fallback-missing');
        await action('cancel');
        return {defaultPreloadMB: 300, unsupportedOriginalSource: true, weakEtagDeclined: true, originalSourceDecoded: true, nextUnavailable: true, diskPeak: peak, noBLoad: true};
    }
    await until(() => !!origin.held, 'matrix-held-deadline');
    const held = trace.find(row => row.type === 'matrix-held'); need(threshold() && held && threshold().seq < held.seq, 'matrix-real-threshold-missing');
    const heldClient = trace.filter(row => row.type === 'origin-client-open' && row.item === 'B' && row.start === held.start && row.end === held.end && row.seq < held.seq).at(-1);
    need(heldClient, 'matrix-client-close-missing');
    const isHeldClose = row => row.type === 'origin-client-closed' && row.clientRequest === heldClient.clientRequest;
    const before = service.rangeStatus().diskBytes;
    if (phase === 'matrix-preempt') {
        const stage = (label, data = {}) => record('matrix-preempt-stage', {stage: label, generation: a.generation, heldClosed: trace.some(isHeldClose),
            foregroundOpenCount: trace.filter(row => row.type === 'origin-client-open' && row.item === 'A' && row.seq > held.seq).length, ...data});
        stage('held-observed');
        await action('pause');
        await until(() => trace.some(row => row.type === 'native-property' && row.generation === a.generation && row.name === 'pause' && row.value === true), 'matrix-pause-unobserved');
        need(!origin.held.response.destroyed && !trace.some(isHeldClose), 'matrix-held-not-active');
        const forward = Number(await client().getProperty('demuxer-max-bytes', 2000)), backward = Number(await client().getProperty('demuxer-max-back-bytes', 2000));
        need(forward === 1048576 && backward === 0, 'matrix-native-cache-readback');
        const position = await client().getProperty('time-pos', 2000), cache = await client().getProperty('demuxer-cache-state', 2000);
        const ranges = Array.isArray(cache?.['seekable-ranges']) ? cache['seekable-ranges'].filter(row => Number.isFinite(row.start) && Number.isFinite(row.end)).slice(0, 4).map(row => ({start: row.start, end: row.end})) : [];
        stage('cache-observed', {position, forwardCacheBytes: forward, backwardCacheBytes: backward, ranges});
        const target = uncachedSeekTarget(cache, position);
        stage('seek-requested', {position, target}); const seekSequence = trace.at(-1).seq;
        await action('seek-back');
        await until(() => trace.some(isHeldClose) && trace.some(row => row.type === 'origin-client-open' && row.item === 'A' && row.seq > seekSequence), 'matrix-foreground-miss-not-observed', 5000);
        const closed = trace.find(isHeldClose);
        need(client().currentGenerationId === a.generation, 'matrix-seek-changed-generation');
        need(closed.seq > seekSequence, 'matrix-held-not-active');
        need(trace.some(row => row.type === 'origin-client-open' && row.item === 'A' && row.seq > closed.seq), 'matrix-preempt-close-order');
        stage('foreground-miss-observed', {target});
        await until(() => trace.some(row => row.type === 'native-property' && row.generation === a.generation && row.seq > seekSequence && row.name === 'time-pos' && row.value >= target - 0.1 && row.value <= target + 1), 'matrix-seek-position-unobserved', 5000);
        const seekPosition = Number(await client().getProperty('time-pos', 2000));
        const resumeSequence = trace.at(-1).seq;
        await action('unpause');
        await until(() => trace.some(row => row.type === 'native-property' && row.generation === a.generation && row.seq > resumeSequence && row.name === 'time-pos' && row.value > seekPosition), 'matrix-A-progress-stalled', 5000);
        stage('playback-resumed', {target});
        preemptPending = false;
        await action('cancel');
    } else {
        await action('pause');
        await until(() => trace.some(row => row.type === 'native-property' && row.generation === a.generation && row.name === 'pause' && row.value === true), 'matrix-pause-unobserved');
        need(!origin.held.response.destroyed && !trace.some(isHeldClose), 'matrix-held-not-active');
        if (phase === 'matrix-replace') {
            await action('replace');
            await until(() => trace.some(isHeldClose) &&
                trace.some(row => row.type === 'origin-media' && row.item === 'C') && service.rangeStatus().next.state === 'ready', 'matrix-replace-deadline');
            const closed = trace.find(isHeldClose);
            need(trace.some(row => row.type === 'origin-client-open' && row.item === 'C' && row.seq > closed.seq), 'matrix-replace-close-order');
            need(service.rangeStatus().next.bytes === FIXTURE_SIZES[1] && service.rangeStatus().diskBytes === FIXTURE_SIZES[1], 'matrix-replace-shared-budget');
        } else if (phase === 'matrix-exit') {
            need(typeof previewOwner === 'function', 'joint-preview-owner-unavailable');
            const owner = await previewOwner(); need(service.isPreviewOwner(owner), 'joint-preview-owner-unavailable');
            const frame = await service.capturePreview(owner);
            need(frame && frame.owner.generationId === a.generation && frame.width > 0 && frame.height > 0 && frame.pixels.length === frame.width * frame.height * 4, 'joint-preview-native-decode-missing');
            record('joint-preview-decoded', {generation: a.generation, width: frame.width, height: frame.height});
            let previewSettled = false;
            const pending = service.capturePreview(owner).then(value => {previewSettled = true; return value;});
            need(!previewSettled && !origin.held.response.destroyed, 'joint-work-not-pending');
            record('matrix-exit-request');
            const destroy = service.destroy(); need(!service.isPreviewOwner(owner), 'joint-preview-owner-not-retired');
            const [late] = await Promise.all([pending, destroy]); need(late === null, 'joint-late-preview-published');
            record('joint-drained', {previewDropped: true, ownerRetired: true});
            previewEvidence = {nativePreviewDecoded: true, previewWidth: frame.width, previewHeight: frame.height, previewPromisePendingAtDestroy: true, latePreviewDropped: true, jointDrainCompleted: true};
        }
        else await action('cancel');
    }
    // Source close is separately observed; the physical client close precedes
    // foreground dispatch. Attempting a late server byte must write nothing.
    if (phase !== 'matrix-exit') await until(() => origin.held.response.destroyed, 'matrix-source-close-missing');
    else {while (!origin.held.response.destroyed && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));}
    need(origin.held.response.destroyed && origin.releaseHeld() === 0, 'matrix-late-byte-accepted');
    need(trace.some(isHeldClose), 'matrix-client-close-missing');
    need(!trace.some(row => row.type === 'load' && row.item !== 'A') && !trace.some(row => row.type === 'manager-next-track'), 'matrix-unrequested-next');
    if (phase !== 'matrix-replace' && phase !== 'matrix-exit') need(service.rangeStatus().next.state === 'idle', 'matrix-cancel-state-restored');
    const peakBackgroundRequests = Math.max(0, ...trace.filter(row => row.type === 'origin-client-open' && row.item !== 'A').map(row => row.backgroundActive));
    need(peakBackgroundRequests <= 1, 'matrix-background-concurrency');
    record('matrix-checked', {diskBytes: service.rangeStatus().diskBytes});
    return {defaultPreloadMB: 300, actualThreshold: true, foregroundCacheBytes: phase === 'matrix-preempt' ? 1048576 : 0, backwardCacheBytes: 0, seekTargetSeconds: phase === 'matrix-preempt' ? 2 : 0, explicitNativeSeek: phase === 'matrix-preempt', peakBackgroundRequests, candidateBytes: phase === 'matrix-replace' ? service.rangeStatus().next.bytes : 0, heldRequestClosed: true, lateBytes: 0, beforeActionBytes: before, diskPeak: peak,
        foregroundPreempted: phase === 'matrix-preempt', candidateReplaced: phase === 'matrix-replace', exitDuringUnplayedNext: phase === 'matrix-exit', ...previewEvidence, noBLoad: true};
}
async function electronMain(file, phase) {
    const {app, BrowserWindow, ipcMain} = require('electron');
    // Isolate before the expensive base/derived payload hash pass, without trusting arbitrary roots.
    physical(file); const bootstrap = readJson(file);
    need(fs.realpathSync.native(bootstrap.out) === bootstrap.out && path.resolve(file) === path.join(bootstrap.out, 'auto-plan.json') &&
        fs.readFileSync(path.join(bootstrap.out, 'owner'), 'utf8') === OWNER, 'owned-bootstrap-required');
    const environment = cleanEnvironment(bootstrap);
    for (const name of Object.keys(process.env)) if (!Object.hasOwn(environment, name)) delete process.env[name];
    Object.assign(process.env, environment);
    app.setPath('appData', path.join(bootstrap.out, 'profile')); app.setPath('userData', path.join(bootstrap.out, 'profile/electron'));
    app.setPath('sessionData', path.join(bootstrap.out, 'profile/electron')); app.setPath('temp', path.join(bootstrap.out, 'tmp')); app.setAppLogsPath(path.join(bootstrap.out, 'profile/logs'));
    const plan = readPlan(file), trace = [], windows = [], clients = [], contexts = new Map(); let service, origin, visibilityTimer, fatal, outcome, restoreRequests; let prefixRoot = path.join(plan.out, 'profile/prefix');
    const matrix = MATRIX_PHASES.includes(phase);
    const record = (type, data = {}) => {const row = {seq: trace.length, type, ...data}; trace.push(row); fs.appendFileSync(path.join(plan.out, phase + '.trace.ndjson'), JSON.stringify(row) + '\n');};
    const checkpoint = () => fs.writeFileSync(path.join(plan.out, phase + '.running.json'), JSON.stringify({pid: process.pid, phase, helpers: clients.map(client => ({pid: client.child?.pid, exited: client.exited})), last: trace.at(-1)?.type}));
    need(['entry', 'native', ...MATRIX_PHASES].includes(phase), 'invalid-electron-phase');
    for (const name of ['trace.ndjson', 'json', 'running.json']) need(!fs.existsSync(path.join(plan.out, phase + '.' + name)), 'fresh-phase-required');
    record('profile-isolated'); checkpoint(); await app.whenReady(); record('app-ready');
    if (phase === 'entry') {writeNew(path.join(plan.out, 'entry.json'), {status: 'passed', pid: process.pid, phase, windows: BrowserWindow.getAllWindows().length, helpers: 0, derivedProof: plan.derivedProof}); app.exit(0); return;}
    try {
        class HiddenWindow extends BrowserWindow {
            constructor(options) {
                need(options.show === false, 'hidden-constructor-required'); super({...options, show: false, focusable: false}); windows.push(this);
                for (const operation of ['show', 'showInactive', 'focus']) this[operation] = () => record('presentation-stub', {operation});
                this.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
            }
        }
        const mainWindow = new HiddenWindow({show: false, focusable: false, skipTaskbar: true, width: 320, height: 180,
            webPreferences: {sandbox: false, nodeIntegration: false, contextIsolation: true, preload: plan.driver, additionalArguments: ['--prefix-auto-preload']}});
        const html = path.join(plan.out, phase + '-renderer.html'); fs.writeFileSync(html, '<!doctype html><meta charset="utf-8"><base href="' + pathToFileURL(path.join(plan.derived, 'electronapp/www')).href + '/"><title>Owned prefix fixture</title><body></body>', {flag: 'wx'});
        const documentUrl = pathToFileURL(html).href;
        mainWindow.webContents.on('will-navigate', event => event.preventDefault());
        const trusted = event => event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url === documentUrl;
        const {NativeHelperClient} = require(path.join(plan.derived, 'electronapp/native-helper/controller.js'));
        class TracedClient extends NativeHelperClient {
            constructor(options) {const onEvent = options.onEvent; super({...options, onEvent: event => {record('native-property', {generation: event.generationId, name: event.name, value: event.value}); onEvent(event);}}); clients.push(this);}
            async start() {const pending = super.start(); this.smokeClosePromise = this.child ? new Promise(resolve => this.child.once('close', resolve)) : Promise.resolve(); checkpoint(); const result = await pending; record('helper-ready'); checkpoint(); return result;}
            load(args) {if (phase === 'matrix-preempt') this.setProperty('demuxer-max-back-bytes', 0); record('load', {item: contexts.get(this.currentGenerationId), generation: this.currentGenerationId, direct: args[1].startsWith(origin.origin + '/Videos/')}); return super.load(args);}
        }
        origin = await fixtureServer(plan, record, {holdNext: matrix && phase !== 'matrix-unsupported', unsupported: phase === 'matrix-unsupported'});
        if (matrix) restoreRequests = observeOriginRequests(origin.origin, record);
        let rangeConfig = {...CONFIG, root: prefixRoot, onPrefixRead: row => record('prefix-read', row)};
        {
            const preferences = require(path.join(plan.source, 'src/electronapp/enhanced/playback-range-user-settings.js')).createStore({profileRoot: path.join(plan.out, 'profile')});
            preferences.save({...preferences.get(), enabled: true});
            rangeConfig = {...preferences.runtimeConfig(), onPrefixRead: row => record('prefix-read', row)}; prefixRoot = rangeConfig.root;
            record('matrix-policy', {progressPercent: rangeConfig.progressPercent, preloadMB: rangeConfig.preloadMB, maxBytes: rangeConfig.prefetchBytes});
        }
        service = require(path.join(plan.derived, 'electronapp/native-helper/service.js')).createService({electron: {BrowserWindow: HiddenWindow}, NativeHelperClient: TracedClient,
            getMainWindow: () => mainWindow, getWebContents: () => mainWindow.webContents, runtimeRoot: plan.derived,
            rangeCache: rangeConfig});
        ipcMain.on('prefix-source', (event, member) => {
            if (!trusted(event) || typeof member !== 'string' || !/^(?:www\/modules|plugins|enhanced|resolvers|native-helper)\/[A-Za-z0-9_./-]+\.js$/.test(member) || member.split('/').some(part => part === '..' || part === '.')) {event.returnValue = null; return;}
            try {event.returnValue = fs.readFileSync(physical(path.join(plan.derived, 'electronapp', member)), 'utf8');} catch (_) {event.returnValue = null;}
        });
        ipcMain.on('prefix-report', (event, row) => {
            if (!trusted(event) || !row || !['presentation-stub', 'module-loaded', 'server-report', 'manager-play-invocation', 'manager-next-track', 'initial-play-resolved', 'matrix-action', 'renderer-failure'].includes(row.type)) return;
            record(row.type, Object.fromEntries(Object.entries(row).filter(([key]) => ['operation', 'member', 'method', 'item', 'code', 'detail'].includes(key))));
            if (row.type === 'renderer-failure') fatal = Error('renderer-chain-failed');
        });
        ipcMain.handle('enhanced-native-helper-call', async (event, request) => {
            need(trusted(event), 'untrusted-renderer');
            if (request.operation === 'range-context' && request.payload?.context) contexts.set(request.payload.generationId, request.payload.context.itemId);
            if (request.operation === 'create') record('endpoint-created-request');
            if (request.operation === 'range-preload') record('range-preload', {diskBefore: service.rangeStatus().diskBytes});
            const result = await service.call(request.operation, request.payload, request.endpointId);
            if (request.operation === 'range-preload') record('range-preload-result', {state: result.value?.state, bytes: result.value?.bytes});
            return result;
        });
        ipcMain.on('enhanced-native-helper-notify', (event, request) => {if (trusted(event)) service.notify(request.operation, request.payload, request.endpointId);});
        ipcMain.handle('enhanced-strm-config-get', event => {need(trusted(event), 'untrusted-renderer'); return {version: 1, enabled: false, cd2: {}, rules: []};});
        visibilityTimer = setInterval(() => {for (const window of windows) if (!window.isDestroyed() && window.isVisible()) {window.hide(); fatal = Error('unexpected-visible-window');}}, 25);
        await mainWindow.loadFile(html);
        const windowId = require(path.join(plan.derived, 'electronapp/native-helper/service.js')).decimalWindowHandle(mainWindow);
        await mainWindow.webContents.executeJavaScript('(' + rendererBoot.toString() + ')(' + JSON.stringify({origin: origin.origin, windowId, scenario: phase, moduleBaseUrl: pathToFileURL(path.join(plan.derived, 'electronapp/www')).href + '/'}) + ')');
        let checks;
        if (matrix) checks = await matrixCase({phase, service, origin, trace, record,
            action: operation => mainWindow.webContents.executeJavaScript('window.prefixAction(' + JSON.stringify(operation) + ')'), client: () => clients.at(-1), fatal: () => fatal, previewOwner: () => mainWindow.webContents.executeJavaScript('window.prefixPreviewOwner()')});
        else {
        const deadline = Date.now() + 95000; let sampledPeakBytes = 0;
        while (Date.now() < deadline) {
            if (fatal) throw fatal;
            const status = service.rangeStatus(); sampledPeakBytes = Math.max(sampledPeakBytes, status.diskBytes || 0);
            if (status.next?.state === 'ready' && !trace.some(row => row.type === 'prefix-ready')) record('prefix-ready', {bytes: status.next.bytes, targetBytes: status.next.targetBytes, diskBytes: status.diskBytes});
            need(status.kind === 'next-prefix' && status.maxBytes === 300000000 && status.diskBytes <= 300000000, 'next-prefix-status-contract');
            const b = trace.find(row => row.type === 'load' && row.item === 'B'), client = clients.at(-1);
            if (b && client?.currentGenerationId === b.generation && client.state.fileLoaded && trace.some(row => row.type === 'native-property' && row.generation === b.generation && row.name === 'time-pos' && row.value >= 0.25)) {
                const video = await client.getProperty('video-out-params', 2000), vo = await client.getProperty('current-vo', 2000);
                record('decoded-B', {width: video?.w, height: video?.h, vo});
                if (trace.some(row => row.type === 'origin-media' && row.item === 'B' && row.seq > b.seq && row.end >= CONFIG.preloadMB * 1000000)) {
                    checks = {...validateTrace(trace, plan.fixtures[1].size), sampledPeakBytes}; break;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        need(checks, 'automatic-native-deadline');
        }
        if (phase !== 'matrix-exit') await mainWindow.webContents.executeJavaScript('window.prefixStop()');
        outcome = {status: 'passed', checks};
    } catch (error) {outcome = {status: 'failed', code: String(error.message).slice(0, 200), orderDiagnostics: automaticOrder(trace)};}
    finally {
        clearInterval(visibilityTimer); const cleanup = [];
        if (service) try {await service.destroy();} catch (_) {cleanup.push('service-destroy-failed');}
        const diagnostics = require(path.join(plan.source, 'tools/playback-range-helper-diagnostics.cjs'));
        for (const client of clients) try {
            if (!client.exited) await client.kill();
            client.safeDiagnostics = await diagnostics.capture(client);
            need(client.exited && diagnostics.normalExit(client.safeDiagnostics), 'helper-normal-exit-unobserved');
        } catch (_) {cleanup.push('helper-exit-UNCERTAIN');}
        if (restoreRequests) restoreRequests();
        if (origin) try {await origin.close();} catch (_) {cleanup.push('origin-close-failed');}
        try {const root = prefixRoot; if (fs.existsSync(root)) need(!fs.readdirSync(root).some(name => /(?:\.bytes|\.pending)$/.test(name) || name === 'index.json' || name === 'lock'), 'prefix-payload-survived-exit');}
        catch (_) {cleanup.push('temporary-prefix-cleanup-failed');}
        for (const window of windows) if (!window.isDestroyed()) window.destroy();
        if (cleanup.length) outcome = {...outcome, status: 'failed', cleanup};
        checkpoint(); writeNew(path.join(plan.out, phase + '.json'), {...outcome, phase, pid: process.pid, derivedProof: plan.derivedProof, boundaries: BOUNDARIES,
            helpers: clients.map(client => ({pid: client.child?.pid, exited: client.exited, diagnostics: client.safeDiagnostics || null})), evidence: plan.evidence}); app.exit(outcome.status === 'passed' ? 0 : 1);
    }
}
async function coordinate(file, phase, explicit) {
    need(explicit === true && process.platform === 'win32' && process.arch === 'x64', 'explicit-Windows-x64-execution-required');
    const plan = readPlan(file), receiptFile = path.join(plan.out, phase + '-coordinator.json'); need(!fs.existsSync(receiptFile), 'fresh-coordinator-required');
    if (phase !== 'entry') {const entry = readJson(path.join(plan.out, 'entry-coordinator.json')), receipt = readJson(path.join(plan.out, 'entry.json'));
        need(entry.status === 'passed' && entry.exit.code === 0 && !entry.exit.timedOut && receipt.pid === entry.exit.pid && receipt.windows === 0 && receipt.helpers === 0 && JSON.stringify(receipt.derivedProof) === JSON.stringify(plan.derivedProof), 'actual-entry-required');}
    const fd = fs.openSync(path.join(plan.out, phase + '.stdout'), 'wx'); let child, timer, timedOut = false, exit, launchError;
    try {
        child = spawn(path.join(plan.derived, 'x64/electron/electron.exe'), [plan.driver, 'electron', '--plan=' + file, '--phase=' + phase],
            {cwd: plan.out, env: cleanEnvironment(plan), windowsHide: true, shell: false, stdio: ['ignore', fd, fd]});
        const closed = new Promise(resolve => child.once('close', resolve));
        const done = new Promise((resolve, reject) => {child.on('error', error => {if (!child.pid) reject(error); else launchError ||= error;}); child.once('exit', (code, signal) => resolve({pid: child.pid, code, signal, timedOut}));});
        timer = setTimeout(() => {timedOut = true; child.kill();}, phase === 'entry' ? 20000 : 120000);
        writeNew(path.join(plan.out, phase + '.launch.json'), {pid: child.pid || null, deadlineMs: phase === 'entry' ? 20000 : 120000, electronSha256: plan.identity.electronSha256});
        exit = await done; await closed; exit.streamsClosed = true;
        need(!timedOut && !launchError && exit.code === 0 && !exit.signal, 'owned-Electron-exit-failed');
        const receipt = readJson(path.join(plan.out, phase + '.json')); need(receipt.status === 'passed' && receipt.pid === exit.pid && JSON.stringify(receipt.derivedProof) === JSON.stringify(plan.derivedProof), 'phase-receipt-invalid');
        if (phase !== 'entry') {const diagnostics = require(path.join(plan.source, 'tools/playback-range-helper-diagnostics.cjs')); need(receipt.helpers?.length > 0 && receipt.helpers.every(helper => helper.exited && diagnostics.normalExit(helper.diagnostics)), 'native-helper-exit-receipt-invalid');}
        readPlan(file);
        writeNew(receiptFile, {status: 'passed', exit, evidence: plan.evidence});
    } catch (error) {writeNew(receiptFile, {status: 'failed', exit: exit || null, helperExit: phase !== 'entry' ? 'UNCERTAIN' : 'NOT_STARTED', code: String(error.message).slice(0, 200)}); throw error;}
    finally {clearTimeout(timer); fs.closeSync(fd);}
}
function argumentsOf(argv) {
    const [command, ...rest] = argv, values = {};
    const allowed = {prepare: ['tools', 'source', 'source-commit', 'runtime', 'zip', 'out'], 'entry-smoke': ['plan', 'execute-electron-entry'], run: ['plan', 'execute-native'], 'joint-exit': ['plan', 'execute-native-joint-exit'], electron: ['plan', 'phase']}[command];
    need(allowed, 'invalid-command');
    for (const arg of rest) {const match = /^--([a-z-]+)(?:=(.+))?$/.exec(arg); need(match && allowed.includes(match[1]) && !Object.hasOwn(values, match[1]), 'invalid-argument'); values[match[1]] = match[2] ?? true;}
    need(allowed.every(key => Object.hasOwn(values, key)), 'missing-argument'); return {command, values};
}
async function main(argv) {
    const {command, values: a} = argumentsOf(argv);
    if (command === 'prepare') {const plan = prepare({tools: a.tools, source: a.source, sourceCommit: a['source-commit'], runtime: a.runtime, zip: a.zip, out: a.out, report: row => console.log(JSON.stringify(row))}); console.log(JSON.stringify({status: 'prepared-NOT-RUN', plan: path.join(plan.out, 'auto-plan.json'), evidence: plan.evidence}));}
    else if (command === 'entry-smoke') await coordinate(a.plan, 'entry', a['execute-electron-entry']);
    else if (command === 'joint-exit') await coordinate(a.plan, 'matrix-exit', a['execute-native-joint-exit']);
    else if (command === 'run') await coordinate(a.plan, 'native', a['execute-native']);
    else {need(process.versions.electron && process.type === 'browser', 'real-Electron-browser-required'); await electronMain(a.plan, a.phase);}
}
if (process.versions.electron && process.type === 'renderer' && process.argv.includes('--prefix-auto-preload')) preload();
else if (require.main === module || process.versions.electron && process.type === 'browser' && process.argv[1] && path.resolve(process.argv[1]) === __filename) main(process.argv.slice(2)).catch(error => {
    if (error?.prepareStage) console.error(JSON.stringify(prepareFailure(error)));
    else console.error(String(error.message).slice(0, 200));
    process.exitCode = 1;
    if (process.versions.electron && process.type === 'browser') require('electron').app.exit(1);
});
module.exports = {automaticOrder, loaderDescriptor, PRODUCT_INPUT_COMMIT, TOOLS_COMMIT, CONFIG, LOADER, OVERLAY, BOUNDARIES, cleanEnvironment, overlayRows, verifyDerivedInventory, verifyOverlaySource, argumentsOf, validateTrace, rendererBoot, fixtureServer, automaticFixtures, FIXTURE_SIZES, MATRIX_PHASES, MATRIX_REMAINING, MATRIX_CODES, observeOriginRequests, uncachedSeekTarget, matrixCase, driverSource, PREPARE_STAGES, PREPARE_CODES, prepareFailure, prepare, readPlan};
