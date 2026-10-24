'use strict';
// Opt-in short Actions experiment; never build, dispatch, publish or access Work.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const MODES = Object.freeze(['ram', 'whendone', 'no', 'immediate']);
const SCOPE = 'stock-mpv-disk-options-observation-only';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
function need(value, code) {if (!value) throw Error(code);}
// The matrix is separately testable without replacing any production input gate.
async function matrix(root, identity, actions) {
    const result = {schema: 1, scope: SCOPE, status: 'running', stage: 'entry', identity,
        originalPackageModified: false, restoreAssessment: 'NOT_ASSESSED',
        modes: MODES.map(mode => ({mode, status: 'NOT_STARTED'}))};
    const file = path.join(root, 'result.json'); let active;
    save(file, result);
    try {
        await actions.entry();
        for (const row of result.modes) {
            active = row; result.stage = row.mode; row.status = 'preparing'; save(file, result);
            await actions.prepare(row.mode);
            row.status = 'running'; save(file, result);
            const receipt = await actions.run(row.mode);
            need(receipt.status === 'observed' && receipt.nativeOutcome === 'EXIT_AND_CLOSE_CONFIRMED' && receipt.streamsClosed === true && receipt.processExited === true,
                'disk-probe-mode-not-established');
            row.status = 'observed'; row.workerPid = receipt.pid; row.exitCode = receipt.code; save(file, result);
        }
        result.stage = 'final-input-check'; save(file, result); await actions.verify();
        result.status = 'observed'; result.stage = 'complete'; save(file, result); return result;
    } catch (_) {
        if (active && active.status !== 'observed') active.status = 'UNKNOWN';
        result.status = 'UNKNOWN'; result.reason = 'disk-probe-matrix-not-established';
        result.nativeOutcome = active ? 'inspect-mode-receipts-no-further-starts' : 'NOT_STARTED'; save(file, result);
        throw Error('disk-probe-matrix-not-established');
    }
}
async function run(file) {
    need(process.platform === 'win32' && process.arch === 'x64', 'disk-probe-Windows-required');
    const ci = require('./ci-playback-range-smoke.cjs'), plan = ci.readPlan(file), repo = path.resolve(__dirname, '..');
    need(plan.mode === 'disk-probe', 'disk-probe-explicit-mode-required');
    ci.noCredentials(process.env);
    const inputs = ci.expandedInputs(plan), root = path.join(plan.root, 'disk-probe');
    need(!fs.existsSync(root), 'disk-probe-fresh-root-required'); fs.mkdirSync(root);
    const trial = require('./playback-range-loader-trial.cjs'), support = require('./playback-range-windows-smoke.cjs');
    // Fresh plans belong to the exact workflow checkout: no stale absolute driver
    // paths, copied/untracked controls, manifest edits, or gate compatibility hacks.
    const derived = trial.derive(repo, inputs.runtime, plan.toolsRoot, plan.paths.artifact, path.join(root, 'derived-image'), plan.workflowCommit);
    const source = support.prepare({repo, runtime: derived.runtime, zip: plan.paths.artifact, out: path.join(root, 'source'), loaderTrial: derived.descriptor});
    const sourceFile = path.join(source.out, 'plan.json'), probe = require('./playback-buffer-disk-probe.cjs');
    save(path.join(root, 'input.json'), {schema: 1, scope: SCOPE, controlsCommit: plan.workflowCommit, baseToolsCommit: ci.PIN.toolsCommit,
        baseSourceCommit: ci.PIN.sourceCommit, sourcePlanSha256: sha(fs.readFileSync(sourceFile)), identity: derived.identity,
        loader: derived.identity.derivation.addition, fixtures: source.fixtures,
        originalPackageModified: false, evidence: 'fresh-one-loader-derived-runtime; not a new installer or packet-cache restore'});
    return matrix(root, derived.identity, {
        entry: () => support.entrySmoke(sourceFile, true),
        prepare(mode) {probe.prepare(sourceFile, path.join(root, mode), mode);},
        run: mode => probe.run(path.join(root, mode, 'probe.json'), true),
        verify() {support.readPlan(sourceFile); trial.verifyRuntime(repo, derived.runtime, plan.paths.artifact, derived.descriptor);}
    });
}
function redact(value, roots) {
    if (Array.isArray(value)) return value.map(row => redact(row, roots));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, row]) =>
        [key, /token|authorization|cookie|password|secret|credential|api[_-]?key/i.test(key) ? '<redacted>' : redact(row, roots)]));
    if (typeof value !== 'string') return value;
    let text = value;
    for (const [root, label] of roots) text = text.replace(new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), label);
    text = text.replace(/https?:\/\/[^\s"'<>]+/gi, '<url-redacted>');
    if (/^(?:[A-Za-z]:[\\/]|\/)/.test(text)) text = '<path-redacted>';
    return text;
}
function collect(plan, destination) {
    const root = path.join(plan.root, 'disk-probe'), rows = [], roots = [[root, '<disk-probe>'], [plan.root, '<owned>'],
        [plan.toolsRoot, '<immutable-tools>'], [path.resolve(__dirname, '..'), '<controls>']].filter(([value]) => typeof value === 'string').sort((a, b) => b[0].length - a[0].length);
    const names = [['input.json', 'input.json'], ['result.json', 'result.json'], ['derived-image/loader-derivation.json', 'loader-derivation.json'],
        ['source/entry.json', 'entry.json'], ['source/entry-coordinator.json', 'entry-coordinator.json']];
    for (const mode of MODES) for (const name of ['probe.json', 'observations.json', 'run.json']) names.push([mode + '/' + name, mode + '-' + name]);
    for (const [relative, target] of names) {
        const file = path.join(root, relative), name = 'disk-' + target;
        if (!fs.existsSync(file)) continue;
        const stat = fs.lstatSync(file);
        need(stat.isFile() && !stat.isSymbolicLink() && fs.realpathSync(file) === path.resolve(file), 'disk-probe-receipt-redirected');
        if (stat.size > 2097152) {rows.push({name, bytes: stat.size, action: 'omitted-too-large'}); continue;}
        const raw = fs.readFileSync(file), redacted = Buffer.from(JSON.stringify(redact(JSON.parse(raw), roots), null, 2) + '\n');
        need(redacted.length <= 2097152, 'disk-probe-redacted-receipt-too-large');
        fs.writeFileSync(path.join(destination, name), redacted, {flag: 'wx', mode: 0o600});
        rows.push({name, bytes: raw.length, publishedBytes: redacted.length, sourceSha256: sha(raw), publishedSha256: sha(redacted), action: 'redacted-json'});
    }
    // Never publish binary media, .dat files, profiles, environment, source plans,
    // or raw worker stderr. Full semantic JSON receipts remain, with path redaction.
    return rows;
}
if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv.length !== 1 || !argv[0].startsWith('--control-plan=')) {console.error('disk-probe-invalid-argument'); process.exitCode = 1;}
    else run(argv[0].slice('--control-plan='.length)).then(() => console.log('disk-probe-four-modes-observed-NOT-restore-acceptance'))
        .catch(() => {console.error('disk-probe-matrix-not-established'); process.exitCode = 1;});
}
module.exports = {MODES, SCOPE, matrix, redact, collect, run};
