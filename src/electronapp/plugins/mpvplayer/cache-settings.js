(function (factory) {
    if (typeof define === 'function' && define.amd) define(['../../enhanced/page-cache/home-layout-cache.js'], function (cache) { return factory(cache.default.management); });
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('../../enhanced/page-cache/home-layout-cache').management);
}(function (pages) {
    'use strict';
    var channels = {status: 'enhanced-http-cache-status', clear: 'enhanced-http-cache-clear'};
    function bytes(value) {
        if (!Number.isSafeInteger(value) || value < 0) return null;
        if (value < 1024) return value + ' bytes';
        var unit = value < 1048576 ? 1024 : 1048576;
        return (value / unit).toFixed(1) + (unit === 1024 ? ' KiB' : ' MiB') + '（' + value + ' bytes）';
    }
    function create(view, request) {
        var root = view.querySelector('.cacheManagementPage');
        if (!root) throw new Error('Cache management template unavailable.');
        function node(selector) { var value = root.querySelector(selector); if (!value) throw new Error('Cache management control unavailable.'); return value; }
        var pageValue = node('.cachePageValue'), httpValue = node('.cacheHttpValue'), budget = node('.cachePageBudget');
        var pageState = node('.cachePageState'), httpState = node('.cacheHttpState'), state = node('.cacheOperationState');
        var refresh = node('.btnRefreshCache'), pageClear = node('.btnClearPageCache'), httpClear = node('.btnClearHttpCache'), allClear = node('.btnClearAllCaches');
        var controls = [refresh, pageClear, httpClear, allClear], active = false, disposed = false, epoch = 0, pending = null;
        function current(ticket) { return active && !disposed && ticket === epoch; }
        function message(target, text, error) { target.textContent = text; target.setAttribute('role', error ? 'alert' : 'status'); }
        function buttons() { controls.forEach(function (button) { button.disabled = !!pending || !active || disposed; }); }
        function renderPages(info) {
            if (!info || info.status !== 'ok' || !['entries', 'enabledOwners', 'maxEntries'].every(function (key) { return Number.isSafeInteger(info[key]) && info[key] >= 0; }) || !bytes(info.serializedBytes) || !bytes(info.maxSerializedBytes)) {
                pageValue.textContent = '无法读取'; budget.textContent = ''; return false;
            }
            pageValue.textContent = info.entries + ' 条；序列化占用 ' + bytes(info.serializedBytes);
            budget.textContent = info.enabledOwners ? '当前配置上限：' + info.maxEntries + ' 条 / ' + bytes(info.maxSerializedBytes) : '布局缓存未启用；此页面不会开启缓存。';
            return true;
        }
        function readPages() { try { return pages.snapshot(); } catch (_) { return {status: 'unavailable'}; } }
        async function pageOperation(clear, ticket) {
            if (!current(ticket)) return {status: 'not-started'};
            message(pageState, clear ? '正在清理首页布局缓存…' : '正在读取…', false);
            var result;
            try { result = clear ? pages.clear() : pages.snapshot(); } catch (_) { result = {status: 'unavailable'}; }
            if (!current(ticket)) return {status: 'not-started'};
            var ok = renderPages(result);
            message(pageState, ok ? clear ? '首页布局缓存已清理；当前界面保留，下次读取重新获取。' : '' : clear ? '首页布局清理未能确认完成，请手动重试。' : '首页布局统计暂不可用。', !ok);
            return {status: ok ? 'ok' : 'failed'};
        }
        async function httpOperation(clear, ticket) {
            if (!current(ticket)) return {status: 'not-started'};
            message(httpState, clear ? '正在清理 HTTP 缓存…' : '正在读取…', false);
            var result;
            try { result = await request(clear ? channels.clear : channels.status); } catch (_) { result = null; }
            if (!current(ticket)) return {status: 'retired'};
            if (result && result.status === 'busy') {
                httpValue.textContent = '操作进行中'; message(httpState, '已有 HTTP 缓存操作进行中；完成后可手动刷新。', false); return {status: 'busy'};
            }
            if (clear && result && result.status === 'cleared' && result.measurement === 'unavailable') {
                httpValue.textContent = '无法读取'; message(httpState, 'HTTP 缓存清理完成；统计暂不可用，可手动刷新。', false); return {status: 'ok', measurement: 'unavailable'};
            }
            if (!result || result.status !== (clear ? 'cleared' : 'ok') || !bytes(result.bytes)) {
                httpValue.textContent = '无法读取'; message(httpState, clear ? 'HTTP 清理未能确认完成，请手动重试。' : 'HTTP 统计暂不可用，请手动刷新。', true); return {status: 'failed'};
            }
            httpValue.textContent = bytes(result.bytes) + '（当前 session HTTP 总量）';
            message(httpState, clear ? 'HTTP 缓存清理完成；资源使用中可能重新产生缓存。' : '', false);
            return {status: 'ok'};
        }
        function operation(kind) {
            if (!active || disposed || pending) return pending || Promise.resolve();
            var ticket = epoch;
            message(state, kind === 'refresh' ? '正在读取统计…' : '正在清理所选缓存…', false);
            var work = Promise.resolve().then(async function () {
                if (!current(ticket)) return;
                var results = [];
                if (kind === 'pages' || kind === 'all' || kind === 'refresh') results.push(await pageOperation(kind !== 'refresh', ticket));
                // A failed layout owner does not block the independent HTTP owner. Leaving the page does.
                if (kind === 'http' || kind === 'all' || kind === 'refresh') results.push(await httpOperation(kind !== 'refresh', ticket));
                if (!current(ticket)) return;
                if (results.some(function (value) { return value.status === 'failed'; })) {
                    message(state, kind === 'all' && results.some(function (value) { return value.status === 'ok'; }) ? '部分清理完成，请查看各项结果。' : '操作未能全部完成，请查看各项结果。', true);
                } else if (results.some(function (value) { return value.status === 'busy'; })) {
                    message(state, 'HTTP 操作仍在进行；完成后可手动刷新。', false);
                } else if (kind === 'refresh') message(state, '', false);
                else message(state, results.some(function (value) { return value.measurement === 'unavailable'; }) ? '清理已完成，部分统计暂不可用。' : kind === 'all' ? '以上缓存已清理。' : '清理已完成。', false);
            }).catch(function () {
                if (current(ticket)) message(state, '操作未能确认完成，请查看各项状态并手动重试。', true);
            });
            pending = work; buttons();
            work.then(function () {
                if (pending === work) pending = null;
                if (active && !disposed) {
                    buttons();
                    if (ticket !== epoch) {
                        message(pageState, '统计待刷新', false); message(httpState, '统计待刷新', false);
                        message(state, '上次操作已结束，请刷新统计。', false);
                    }
                }
            });
            return work;
        }
        function refreshClick() { operation('refresh'); }
        function pageClick() { operation('pages'); }
        function httpClick() { operation('http'); }
        function allClick() { operation('all'); }
        refresh.addEventListener('click', refreshClick); pageClear.addEventListener('click', pageClick); httpClear.addEventListener('click', httpClick); allClear.addEventListener('click', allClick);
        buttons();
        return {
            resume: function () {
                if (disposed) return;
                active = true; epoch++; renderPages(readPages()); buttons();
                if (pending) { httpValue.textContent = '等待刷新'; message(state, '上次操作正在收尾；完成后可手动刷新。', false); return pending; }
                return operation('refresh');
            },
            pause: function () { active = false; epoch++; buttons(); },
            dispose: function () {
                if (disposed) return; disposed = true; active = false; epoch++; buttons();
                refresh.removeEventListener('click', refreshClick); pageClear.removeEventListener('click', pageClick); httpClear.removeEventListener('click', httpClick); allClear.removeEventListener('click', allClick);
            }
        };
    }
    return {create: create};
}));
