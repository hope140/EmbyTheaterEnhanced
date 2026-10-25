(function (factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';
    var GET = 'enhanced-playback-range-settings-get', SAVE = 'enhanced-playback-range-settings-save';
    function valid(config) {
        return config && config.schema === 1 && typeof config.enabled === 'boolean' &&
            [50, 60, 70, 80, 90].indexOf(config.progressPercent) !== -1 && [100, 300, 500].indexOf(config.preloadMB) !== -1;
    }
    function create(view, invoke) {
        var enabled = view.querySelector('.chkRangeEnabled'), progress = view.querySelector('.selectRangeProgress');
        var amount = view.querySelector('.selectRangePreload'), state = view.querySelector('.rangeSettingsState');
        var controls = [enabled, progress, amount], active = false, disposed = false, loaded = false, epoch = 0, revision = 0;
        var tail = Promise.resolve(), lastRequested = null;
        function current(ticket) {return active && !disposed && epoch === ticket;}
        function lock() {controls.forEach(function (node) {node.disabled = !active || !loaded || disposed;});}
        function snapshot() {return {schema: 1, enabled: enabled.checked, progressPercent: Number(progress.value), preloadMB: Number(amount.value)};}
        function changed() {
            if (!active || disposed || !loaded) return tail;
            var config = snapshot(), key = JSON.stringify(config);
            if (!valid(config) || key === lastRequested) return tail;
            lastRequested = key;
            var ticket = epoch, requestRevision = ++revision;
            state.textContent = '正在保存…';
            // Capture the user choice now. Accepted changes still finish after pause,
            // while their replies may only update the page that issued them.
            tail = tail.then(function () {return invoke(SAVE, config);}).then(function (result) {
                if (!result || result.status !== 'saved') throw Error('save-failed');
                if (current(ticket) && revision === requestRevision) state.textContent = '已保存，下次播放生效。';
            }).catch(function () {
                if (current(ticket) && revision === requestRevision) state.textContent = '保存失败，请重新选择后重试。';
            });
            return tail;
        }
        controls.forEach(function (node) {node.addEventListener('change', changed);});
        lock();
        return {
            resume: function () {
                if (disposed) return Promise.resolve();
                active = true; loaded = false; var ticket = ++epoch;
                state.textContent = ''; lock();
                // A new read observes all previously accepted writes, including
                // changes queued just before leaving this view.
                return tail.then(function () {
                    if (!current(ticket)) return null;
                    return invoke(GET);
                }).then(function (result) {
                    if (!current(ticket)) return;
                    if (!result || result.status !== 'ok' || !valid(result.config)) throw Error('unavailable');
                    enabled.checked = result.config.enabled;
                    progress.value = String(result.config.progressPercent);
                    amount.value = String(result.config.preloadMB);
                    lastRequested = JSON.stringify(snapshot()); loaded = true;
                }).catch(function () {
                    if (current(ticket)) state.textContent = '无法读取预载设置，请返回后重试。';
                }).then(function () {if (current(ticket)) lock();});
            },
            pause: function () {
                changed(); active = false; epoch++; loaded = false; lock(); return tail;
            },
            dispose: function () {
                if (disposed) return;
                changed(); disposed = true; active = false; loaded = false; epoch++; lock();
                controls.forEach(function (node) {node.removeEventListener('change', changed);});
            }
        };
    }
    return {create: create};
}));
