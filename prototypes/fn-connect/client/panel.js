'use strict';
const entries = new Map();
let fixture = false;
let defaults = null;
const status = document.getElementById('status');
function show(value) { status.textContent = value.error || value.reason || value.state || ''; }
async function action(name, payload) { const result = await window.fnExperiment.action(name, payload); show(result); return result; }
function row(id) {
    const section = document.createElement('section'), title = document.createElement('strong'), state = document.createElement('p');
    title.textContent = '连接 ' + (entries.size + 1);
    state.textContent = 'authorizing';
    section.append(title, state);
    for (const [name, label] of [['target', '进入 Emby 网页'], ['verify', '验证连接'],
        ...(fixture ? [['fixture-media', '合成 Range 测试']] : []), ['remove', '移除此连接']]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.addEventListener('click', async () => {
            button.disabled = true;
            try { const result = await action(name, {id}); if (name === 'remove' && !result.error) { section.remove(); entries.delete(id); } }
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
    if (value.config) {
        document.getElementById('bootstrap').value = value.config.bootstrapUrl;
        document.getElementById('emby').value = value.config.embyUrl;
        document.getElementById('probe').value = value.config.probePath || 'System/Info/Public';
    }
});
document.getElementById('add').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button'); button.disabled = true;
    try {
        const input = {bootstrapUrl: document.getElementById('bootstrap').value,
            embyUrl: document.getElementById('emby').value, probePath: document.getElementById('probe').value};
        if (defaults && input.bootstrapUrl === defaults.bootstrapUrl && input.embyUrl === defaults.embyUrl) {
            for (const key of ['authOrigins', 'externalMediaOrigins', 'expectedServerId']) if (defaults[key]) input[key] = defaults[key];
        }
        const result = await action('add', input);
        if (result.id) row(result.id);
    } finally { button.disabled = false; }
});
