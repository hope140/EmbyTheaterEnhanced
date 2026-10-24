(function (factory) {
    if (typeof define === 'function' && define.amd) define(['ete-home-layout-cache', 'ete-detail-cache-store'], function (cache, details) { return factory(cache.default.management, details.default); });
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('../../enhanced/page-cache/home-layout-cache').management, require('../../enhanced/detail-cache/store.js'));
}(function (pages, details) {
    'use strict';
    var channels = {status: 'enhanced-http-cache-status', clear: 'enhanced-http-cache-clear'};
    function bytes(value) {
        if (!Number.isSafeInteger(value) || value < 0) return null;
        if (value < 1024) return value + ' bytes';
        var unit = value < 1048576 ? 1024 : 1048576;
        return (value / unit).toFixed(1) + (unit === 1024 ? ' KiB' : ' MiB') + '（' + value + ' bytes）';
    }
    function create(view, request, detailStore) {
        var root = view.querySelector('.cacheManagementPage');
        if (!root) throw new Error('Cache management template unavailable.');
        function node(selector) { var value = root.querySelector(selector); if (!value) throw new Error('Cache management control unavailable.'); return value; }
        var pageValue = node('.cachePageValue'), httpValue = node('.cacheHttpValue'), budget = node('.cachePageBudget');
        var pageState = node('.cachePageState'), httpState = node('.cacheHttpState'), state = node('.cacheOperationState');
        var refresh = node('.btnRefreshCache'), pageClear = node('.btnClearPageCache'), httpClear = node('.btnClearHttpCache'), allClear = node('.btnClearAllCaches');
        var controls = [refresh, pageClear, httpClear, allClear], active = false, disposed = false, epoch = 0, pending = null;
        if (detailStore === undefined) {
            try { detailStore = details.shared(); } catch (_) { detailStore = null; }
        }
        var pageOwners = [{name: '首页布局', owner: pages}, {name: '详情数据', owner: detailStore}];
        function current(ticket) { return active && !disposed && ticket === epoch; }
        function message(target, text, error) { target.textContent = text; target.setAttribute('role', error ? 'alert' : 'status'); }
        function buttons() { controls.forEach(function (button) { button.disabled = !!pending || !active || disposed; }); }
        function validPageInfo(info) {
            return info && info.status === 'ok' && Number.isSafeInteger(info.entries) && info.entries >= 0 && bytes(info.serializedBytes) !== null;
        }
        function renderPages(results) {
            var readable = results.filter(function (result) { return result.ok; });
            var total = readable.reduce(function (sum, result) { return sum + result.info.serializedBytes; }, 0);
            pageValue.textContent = readable.length && bytes(total) !== null ? bytes(total) + (readable.length < pageOwners.length ? '（部分可读）' : '') : '无法读取';
            budget.textContent = '';
        }
        async function pageOperation(clear, ticket) {
            if (!current(ticket)) return {status: 'not-started'};
            message(pageState, clear ? '正在清理…' : '正在读取…', false);
            var results = [];
            for (var i = 0; i < pageOwners.length; i++) {
                // Each owner starts only while this page is current. An in-flight owner may finish after pause.
                if (!current(ticket)) return {status: 'retired'};
                var source = pageOwners[i], result;
                try { result = await source.owner[clear ? 'clear' : 'snapshot'](); } catch (_) { result = null; }
                if (!current(ticket)) return {status: 'retired'};
                results.push({name: source.name, info: result, ok: validPageInfo(result)});
            }
            renderPages(results);
            var failed = results.some(function (result) { return !result.ok; });
            var text = results.filter(function (result) { return clear || !result.ok; }).map(function (result) {
                return result.name + (result.ok ? '已清理' : clear ? '清理未确认，请重试' : '统计不可用，请刷新');
            }).join('；');
            message(pageState, text ? text + '。' : '', failed);
            return {status: failed ? 'failed' : 'ok', successfulOwners: results.filter(function (result) { return result.ok; }).length};
        }
        async function httpOperation(clear, ticket) {
            if (!current(ticket)) return {status: 'not-started'};
            message(httpState, clear ? '正在清理…' : '正在读取…', false);
            var result;
            try { result = await request(clear ? channels.clear : channels.status); } catch (_) { result = null; }
            if (!current(ticket)) return {status: 'retired'};
            if (result && result.status === 'busy') {
                httpValue.textContent = '操作进行中'; message(httpState, '操作进行中，请稍后刷新。', false); return {status: 'busy'};
            }
            if (clear && result && result.status === 'cleared' && result.measurement === 'unavailable') {
                httpValue.textContent = '无法读取'; message(httpState, '清理完成；统计暂不可用，请刷新。', false); return {status: 'ok', measurement: 'unavailable'};
            }
            if (!result || result.status !== (clear ? 'cleared' : 'ok') || !bytes(result.bytes)) {
                httpValue.textContent = '无法读取'; message(httpState, clear ? '清理未确认，请重试。' : '统计暂不可用，请刷新。', true); return {status: 'failed'};
            }
            httpValue.textContent = bytes(result.bytes);
            message(httpState, clear ? '清理完成。' : '', false);
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
                // A failed page owner does not block the independent HTTP owner. Leaving the page does.
                if (kind === 'http' || kind === 'all' || kind === 'refresh') results.push(await httpOperation(kind !== 'refresh', ticket));
                if (!current(ticket)) return;
                if (results.some(function (value) { return value.status === 'failed'; })) {
                    message(state, kind !== 'refresh' && results.some(function (value) { return value.status === 'ok' || value.successfulOwners > 0; }) ? '部分清理完成，请查看各项结果。' : '操作未能全部完成，请查看各项结果。', true);
                } else if (results.some(function (value) { return value.status === 'busy'; })) {
                    message(state, '资源操作仍在进行，请稍后刷新。', false);
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
                active = true; epoch++; buttons();
                if (pending) { pageValue.textContent = '等待刷新'; httpValue.textContent = '等待刷新'; message(state, '上次操作正在收尾；完成后可手动刷新。', false); return pending; }
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
