'use strict';
const entries = new Map();
let fixture = false;
let defaults = null;
let rememberAvailable = false, savedSequence = 0;
let externalCheckAvailable = false;
const status = document.getElementById('status');
const mediaChecks = new Map();
const checkHistory = new Map();
const connectionLabels = new Map();
const windowTraces = new Map();
let lastWindowId;
const preArmBlocks = new Map();
let lastPreArmId;
const mediaTerminals = new Set(['MEDIA_CHECK_PARTIAL_HEADERS_OBSERVED', 'MEDIA_CHECK_HEADERS_ONLY',
    'MEDIA_CHECK_PLAYLIST_UNSUPPORTED', 'MEDIA_CHECK_TIMEOUT', 'MEDIA_CHECK_METADATA_INVALID']);
let lastCheckId;
function connectionLabel(id) {
    if (!id) return null;
    if (!connectionLabels.has(id)) connectionLabels.set(id, '连接 ' + (connectionLabels.size + 1));
    return connectionLabels.get(id);
}
function show(value) {
    connectionLabel(value.id);
    if (value.id && value.preArmBlocks) { preArmBlocks.set(value.id, value.preArmBlocks); lastPreArmId = value.id; }
    if (value.id && Array.isArray(value.windowLifecycleTrace)) {
        windowTraces.set(value.id, value.windowLifecycleTrace.slice(-16)); lastWindowId = value.id;
    }
    if (value.id && (value.mediaCheck || value.state === 'media-check-armed')) {
        const current = mediaChecks.get(value.id), roundId = Number.isInteger(value.roundId) && value.roundId > 0 ? value.roundId : current?.roundId || 1;
        if (current && roundId < current.roundId) return;
        if (current && roundId > current.roundId) {
            const history = checkHistory.get(value.id) || [];
            history.push({roundId: current.roundId, outcome: current.outcome, ended: current.ended});
            checkHistory.set(value.id, history.slice(-8)); mediaChecks.delete(value.id);
        }
        if (!mediaChecks.has(value.id)) mediaChecks.set(value.id,
            {roundId, diagnosticCount: 0, lastDiagnostic: null, firstMediaBlock: null, outcome: null, connectionCleanup: null, ended: null});
        lastCheckId = value.id;
        const check = mediaChecks.get(value.id), event = value.mediaCheck;
        if (event?.budget) check.budget = event.budget;
        if (event?.event === 'diagnostic') {
            check.diagnosticCount = Math.min(check.diagnosticCount + 1, 1000000);
            check.lastDiagnostic = event;
            if (!check.firstMediaBlock && event.result === 'MEDIA_CHECK_EXTERNAL_BLOCKED' &&
                event.resourceType === 'media' && typeof event.origin === 'string') check.firstMediaBlock = event;
        } else if (event?.event === 'terminal' && mediaTerminals.has(event.result) && !check.outcome) {
            check.outcome = event;
        } else if (event?.event === 'cleanup' &&
            ['MEDIA_CHECK_CONNECTIONS_CLOSED', 'MEDIA_CHECK_CLOSE_UNCONFIRMED'].includes(event.result)) {
            // Socket closure is separate from profile/storage cleanup.
            check.connectionCleanup = event.result;
        }
    }
    if (value.id && mediaChecks.has(value.id)) {
        lastCheckId = value.id;
        const check = mediaChecks.get(value.id);
        if (value.state === 'needs-auth' && !check.outcome && !check.ended) check.ended = 'AUTH_REQUIRED_BEFORE_TERMINAL';
        if (value.state === 'media-check-aborted' && !check.outcome && !check.ended) check.ended = 'MEDIA_WINDOW_CLOSED_BEFORE_TERMINAL';
        if (value.state === 'closed' && !check.outcome && !check.ended) check.ended = 'CONNECTION_REMOVED_BEFORE_TERMINAL';
    }
    const operation = value.error || value.reason || value.state || '';
    const check = mediaChecks.get(lastCheckId);
    const preArmId = preArmBlocks.has(value.id) ? value.id : lastPreArmId;
    const preArm = preArmBlocks.has(preArmId) ? {connection: connectionLabel(preArmId), ...preArmBlocks.get(preArmId)} : undefined;
    const preArmView = preArm ? {preArmBlocks: preArm} : {};
    const windowLifecycle = windowTraces.has(value.id) ? {connection: connectionLabel(value.id), trace: windowTraces.get(value.id)} :
        windowTraces.has(lastWindowId) ? {connection: connectionLabel(lastWindowId), trace: windowTraces.get(lastWindowId)} : undefined;
    status.textContent = mediaChecks.has(lastCheckId) ?
        JSON.stringify({operation: {connection: connectionLabel(value.id), state: operation},
            ...preArmView,
            ...(windowLifecycle ? {windowLifecycle} : {}),
            mediaCheck: {connection: connectionLabel(lastCheckId), ...check, previousRounds: checkHistory.get(lastCheckId) || [],
                awaitingTerminal: !check.outcome && !check.ended}}) : windowLifecycle || preArm ?
        JSON.stringify({operation: {connection: connectionLabel(value.id), state: operation}, ...preArmView,
            ...(windowLifecycle ? {windowLifecycle} : {})}) : operation;
}
async function action(name, payload) { const result = await window.fnExperiment.action(name, payload); show(result); return result; }
function row(id) {
    const section = document.createElement('section'), title = document.createElement('strong'), state = document.createElement('p');
    title.textContent = connectionLabel(id);
    state.textContent = 'authorizing';
    section.append(title, state);
    for (const [name, label] of [['target', '进入 Emby 网页'], ['verify', '验证连接'], ['media-check', '单次媒体响应头检查（会中止播放）'],
        ...(externalCheckAvailable ? [['external-header-once', '仅一次外源响应头（本进程一次，取消网页媒体）']] : []),
        ['prepare-next-check', '准备下一次检查（保留登录）'], ['reopen-check', '重新打开并检查'],
        ...(fixture ? [['fixture-media', '合成 Range 测试']] : []), ['remove', '关闭此连接（已记住登录则保留）'], ['forget', '退出并忘记此连接登录']]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.addEventListener('click', async () => {
            button.disabled = true;
            try { const result = await action(name, {id}); if (['remove', 'forget'].includes(name) && !result.error) {
                section.remove(); entries.delete(id); await refreshSaved();
            } }
            finally { button.disabled = false; }
        });
        section.append(button);
    }
    document.getElementById('profiles').append(section);
    entries.set(id, state);
}
window.fnExperiment.onState(value => {
    if (entries.has(value.id)) entries.get(value.id).textContent = value.state + (value.reason ? ': ' + value.reason : '');
    show(value);
});
window.fnExperiment.action('defaults').then(value => {
    fixture = value.fixture;
    defaults = value.config;
    rememberAvailable = value.rememberAvailable === true;
    externalCheckAvailable = value.externalCheckAvailable === true;
    document.getElementById('remember').disabled = !rememberAvailable;
    if (value.config) {
        document.getElementById('bootstrap').value = value.config.bootstrapUrl;
        document.getElementById('emby').value = value.config.embyUrl;
        document.getElementById('probe').value = value.config.probePath || 'System/Info/Public';
    }
    void refreshSaved();
});
function inputFromForm() {
    const input = {bootstrapUrl: document.getElementById('bootstrap').value,
        embyUrl: document.getElementById('emby').value, probePath: document.getElementById('probe').value};
    if (defaults && input.bootstrapUrl === defaults.bootstrapUrl && input.embyUrl === defaults.embyUrl) {
        for (const key of ['authOrigins', 'externalMediaOrigins', 'expectedServerId']) if (defaults[key]) input[key] = defaults[key];
    }
    return input;
}
async function refreshSaved() {
    if (!rememberAvailable) return;
    const sequence = ++savedSequence, result = await window.fnExperiment.action('saved', inputFromForm());
    if (sequence !== savedSequence) return;
    const select = document.getElementById('saved'); select.replaceChildren();
    const first = document.createElement('option'); first.value = ''; first.textContent = '新建隔离登录分区'; select.append(first);
    for (const value of result.profiles || []) {
        const option = document.createElement('option'); option.value = value.profileId; option.textContent = value.label; select.append(option);
    }
}
for (const id of ['bootstrap', 'emby', 'probe']) document.getElementById(id).addEventListener('change', () => { void refreshSaved(); });
document.getElementById('add').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try {
        const input = inputFromForm();
        input.rememberLogin = rememberAvailable && document.getElementById('remember').checked === true;
        const saved = document.getElementById('saved').value;
        if (input.rememberLogin && saved) input.savedProfileId = saved;
        const result = await action('add', input);
        if (result.id) row(result.id);
    } finally { button.disabled = false; }
});
