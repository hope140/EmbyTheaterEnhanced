define(['loading', 'baseView', 'emby-select', 'emby-checkbox', 'emby-input', 'emby-button', 'emby-scroller', 'css!./enhanced-settings'], function (loading, BaseView) {
    'use strict';
    var GET = 'enhanced-playback-range-settings-get', SAVE = 'enhanced-playback-range-settings-save';
    function invoke(channel, value) {if (!window.ipc || !window.ipc.invoke) return Promise.reject(Error('unavailable')); return window.ipc.invoke(channel, value);}
    function number(value) {return value.trim() === '' ? null : Number(value) * 1000000;}
    function RuntimeView(view) {
        BaseView.apply(this, arguments); this.view = view; this.epoch = 0; this.active = false; this.saving = false; this.loaded = false;
        view.querySelector('form').addEventListener('submit', this.save.bind(this));
    }
    Object.assign(RuntimeView.prototype, BaseView.prototype);
    RuntimeView.prototype.lock = function () {var disabled = !this.loaded || this.saving; this.view.querySelectorAll('input,select,button').forEach(function (node) {node.disabled = disabled;});};
    RuntimeView.prototype.runtime = function (value) {
        var text = value && value.enabled ? '本次运行已启用。' : '本次运行未启用。';
        if (value && Number.isFinite(value.diskBytes)) text += ' 本配置目录已提交的媒体缓存总量 ' + (value.diskBytes / 1000000).toFixed(1) + ' MB。';
        this.view.querySelector('.rangeRuntimeState').textContent = text;
    };
    RuntimeView.prototype.load = async function () {
        var ticket = this.epoch, view = this.view;
        try {
            var result = await invoke(GET); if (!this.active || this.epoch !== ticket) return;
            if (!result || result.status !== 'ok') throw Error('unavailable');
            var config = result.config;
            view.querySelector('.chkRangeEnabled').checked = config.enabled;
            view.querySelector('.selectRangeProgress').value = String(config.progressPercent);
            view.querySelector('.selectRangePreload').value = String(config.preloadMB);
            view.querySelector('.txtRangeBudget').value = config.maxBytes == null ? '' : String(config.maxBytes / 1000000);
            view.querySelector('.txtRangeRate').value = config.bytesPerSecond == null ? '' : String(config.bytesPerSecond / 1000000);
            this.loaded = true; this.runtime(result.runtime);
        } catch (_) {if (this.active && this.epoch === ticket) view.querySelector('.rangeSettingsState').textContent = '无法读取配置，请返回后重试。';}
        finally {if (this.active && this.epoch === ticket) {this.lock(); loading.hide();}}
    };
    RuntimeView.prototype.save = async function (event) {
        event.preventDefault(); if (!this.active || !this.loaded || this.saving) return false;
        var view = this.view, ticket = this.epoch, enabled = view.querySelector('.chkRangeEnabled').checked;
        var config = {schema: 1, enabled: enabled, progressPercent: Number(view.querySelector('.selectRangeProgress').value), preloadMB: Number(view.querySelector('.selectRangePreload').value),
            maxBytes: number(view.querySelector('.txtRangeBudget').value), bytesPerSecond: number(view.querySelector('.txtRangeRate').value)};
        var state = view.querySelector('.rangeSettingsState');
        if (enabled && (!Number.isSafeInteger(config.maxBytes) || config.maxBytes <= 0 || !Number.isSafeInteger(config.bytesPerSecond) || config.bytesPerSecond <= 0)) {state.textContent = '启用前请明确填写磁盘预算和后台预载限速。'; return false;}
        this.saving = true; this.lock();
        try {
            var result = await invoke(SAVE, config); if (!this.active || this.epoch !== ticket) return false;
            if (result && result.reason === 'active-budget-reduction') {state.textContent = '降低预算前请先关闭缓存并重启，以免影响正在使用的缓存。'; return false;}
            if (result && result.reason === 'budget-below-retained-cache') {state.textContent = '预算低于已保留缓存，请填写足够容量；现有缓存未删除。'; return false;}
            if (!result || result.status !== 'saved') throw Error('save-failed');
            state.textContent = '已保存，重启后生效。'; this.runtime(result.runtime);
        } catch (_) {if (this.active && this.epoch === ticket) state.textContent = '保存失败，请检查输入后重试；当前配置未改变。';}
        finally {this.saving = false; if (this.active) this.lock();}
        return false;
    };
    RuntimeView.prototype.onResume = function () {BaseView.prototype.onResume.apply(this, arguments); this.active = true; this.epoch++; this.loaded = false; this.lock(); void this.load();};
    RuntimeView.prototype.onPause = function () {this.active = false; this.epoch++; BaseView.prototype.onPause.apply(this, arguments);};
    RuntimeView.prototype.destroy = function () {this.active = false; this.epoch++; if (BaseView.prototype.destroy) BaseView.prototype.destroy.apply(this, arguments);};
    return RuntimeView;
});
