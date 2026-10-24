(function (factory) {
    if (typeof define === 'function' && define.amd) define(['../../enhanced/page-cache/home-layout-cache.js'], function (cache) { return factory(cache.default.management); });
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('../../enhanced/page-cache/home-layout-cache').management);
}(function (pages) {
    'use strict';
    var channels = {status: 'enhanced-http-cache-status', clear: 'enhanced-http-cache-clear'};
    function create(view, request) {
        var root = view.querySelector('.aboutCacheManagement');
        if (!root) return {resume: function () {}, pause: function () {}, dispose: function () {}};
        var pageValue = root.querySelector('.cachePageValue'), httpValue = root.querySelector('.cacheHttpValue');
        var state = root.querySelector('.cacheOperationState'), refresh = root.querySelector('.btnRefreshCache');
        var pageClear = root.querySelector('.btnClearPageCache'), httpClear = root.querySelector('.btnClearHttpCache');
        var active = false, disposed = false, epoch = 0, pending = null;
        function message(text, error) { state.textContent = text; state.setAttribute('role', error ? 'alert' : 'status'); }
        function buttons() { [refresh, pageClear, httpClear].forEach(function (button) { button.disabled = !!pending || !active; }); }
        function renderPages() {
            var info = pages.snapshot();
            if (info.status !== 'ok') { pageValue.textContent = '无法读取'; return false; }
            pageValue.textContent = info.enabledOwners ? info.entries + ' / ' + info.maxEntries + ' 条；序列化预算 ' + info.serializedBytes + ' / ' + info.maxSerializedBytes + ' bytes；在途 ' + info.pending : '未启用（0 条）';
            return true;
        }
        function operation(kind) {
            if (!active || disposed || pending) return pending || Promise.resolve();
            var ticket = epoch;
            message(kind === 'refresh' ? '正在读取…' : '正在清理…', false);
            var work = Promise.resolve().then(function () {
                if (!active || disposed || ticket !== epoch) return null;
                if (kind === 'pages') {
                    var result = pages.clear();
                    if (result.status !== 'ok') throw Error();
                    return {status: 'pages-cleared'};
                }
                return request(kind === 'http' ? channels.clear : channels.status);
            }).then(function (result) {
                if (!active || disposed || ticket !== epoch || !result) return;
                var valid = renderPages();
                if (result.status === 'pages-cleared') { message(valid ? '首页布局数据已清理；当前界面保留，下次读取重新获取。' : '已清理，统计暂不可用。', !valid); return; }
                if (result.status === 'busy') { httpValue.textContent = '正在清理'; message('HTTP 缓存操作进行中；完成后可刷新统计。', false); return; }
                if (result.status === 'cleared' && result.measurement === 'unavailable') {
                    httpValue.textContent = '无法读取'; message('HTTP 缓存清理完成；统计暂不可用，可手动刷新。', false); return;
                }
                if (!['ok', 'cleared'].includes(result.status) || !Number.isSafeInteger(result.bytes) || result.bytes < 0) throw Error();
                httpValue.textContent = result.bytes + ' bytes（session HTTP 总量）';
                message(!valid ? '页面数据统计暂不可用。' : result.status === 'cleared' ? 'HTTP 缓存清理完成；使用过程中可能重新产生。' : '', !valid);
            }).catch(function () {
                if (!active || disposed || ticket !== epoch) return;
                if (kind !== 'pages') httpValue.textContent = '无法读取';
                renderPages(); message('操作失败，请手动重试。', true);
            });
            pending = work; buttons();
            work.then(function () {
                if (pending === work) pending = null;
                if (active && !disposed) {
                    buttons();
                    if (ticket !== epoch) message('上次操作已结束，请刷新统计。', false);
                }
            });
            return work;
        }
        function refreshClick() { operation('refresh'); }
        function pageClick() { operation('pages'); }
        function httpClick() { operation('http'); }
        refresh.addEventListener('click', refreshClick); pageClear.addEventListener('click', pageClick); httpClear.addEventListener('click', httpClick);
        return {resume: function () { if (disposed) return; active = true; epoch++; renderPages(); buttons(); if (pending) { message('上次操作正在收尾；完成后可手动刷新。', false); return pending; } return operation('refresh'); },
            pause: function () { active = false; epoch++; buttons(); },
            dispose: function () { disposed = true; active = false; epoch++; refresh.removeEventListener('click', refreshClick); pageClear.removeEventListener('click', pageClick); httpClear.removeEventListener('click', httpClick); }};
    }
    return {create: create};
}));
