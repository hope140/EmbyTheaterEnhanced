define(['connectionManager', 'events', 'toast'], function (connectionManager, events, toast) {
    'use strict';
    var started = false, timer = null, lastIdentity = null, sequence = 0;
    var lastStates = Object.create(null), restarts = Object.create(null);
    var channels = {start: 'enhanced-download-start', attach: 'enhanced-download-attach', detach: 'enhanced-download-detach', status: 'enhanced-download-status',
        directory: 'enhanced-download-directory', retry: 'enhanced-download-retry', lookup: 'enhanced-download-lookup',
        cancel: 'enhanced-download-lookup-cancel', progress: 'enhanced-download-progress'};
    var reasons = {
        'auth-required': '下载需要重新登录服务器。', 'download-not-permitted': '服务器未允许当前账户下载此视频。',
        'source-selection-required': '请先选择媒体版本，再下载。', 'source-unavailable': '当前来源暂时无法下载。',
        'pointer-response': '服务器返回的是 STRM 地址文本，未取得影片本体。', 'segmented-source': '此来源是分段流，暂不支持完整文件下载。',
        'container-unrecognized': '无法确认响应是受支持的视频文件，未保存为完成下载。', 'length-unavailable': '来源未提供可核验的文件长度。',
        'directory-unavailable': '下载目录不可用，请在下载设置中重新选择。', 'directory-unwritable': '下载目录不可写。',
        'temporary-changed': '未完成文件的归属已变化，已停止操作，未覆盖或删除该文件。',
        'disk-full': '下载空间不足，任务已保留。', 'representation-changed': '来源版本发生变化，请继续任务以重新下载。',
        'task-store-unsafe': '下载任务记录无法安全读取，已保留原文件。'
    };
    function message(reason) {return reasons[reason] || '下载暂未完成，请在下载设置中查看状态或重试。';}
    function context(api) {
        try {
            if (!api) return null;
            var value = {serverId: api.serverId(), accountId: api.getCurrentUserId(), serverAddress: api.serverAddress(), token: api.accessToken()};
            return value.serverId && value.accountId && value.serverAddress && value.token ? value : null;
        } catch (_) {return null;}
    }
    function current() {try {return typeof connectionManager.currentApiClient === 'function' ? connectionManager.currentApiClient() : null;} catch (_) {return null;}}
    function invoke(name, body) {
        if (!window.ipc || typeof window.ipc.invoke !== 'function') return Promise.resolve({status: 'error', reason: 'source-unavailable'});
        return window.ipc.invoke(channels[name], body).catch(function () {return {status: 'error', reason: 'source-unavailable'};});
    }
    function pulse() {
        var value = context(current());
        if (!value) {if (lastIdentity !== null) invoke('detach', {}); lastIdentity = null; return;}
        var identity = JSON.stringify(value);
        if (identity === lastIdentity) return;
        lastIdentity = identity;
        invoke('attach', {context: value});
    }
    function onProgress(_event, value) {
        if (!value || typeof value.id !== 'string') return;
        if (value.reason && /-restarting$/.test(value.reason) && restarts[value.id] !== value.reason) {
            restarts[value.id] = value.reason;
            toast(value.reason === 'source-changed-restarting' ? '下载源版本发生变化，正在安全地从头下载。' :
                value.reason === 'partial-corrupt-restarting' ? '已下载部分校验不通过，正在从头下载。' : '无法安全续传本次未完成文件，正在从头下载。');
        }
        if (lastStates[value.id] !== value.state) {
            if (value.state === 'complete') toast('下载完成，可在下载设置中查看文件位置。');
            if (value.state === 'failed') toast(message(value.reason));
            lastStates[value.id] = value.state;
        }
    }
    function start() {
        if (started) return;
        started = true;
        if (window.ipc && typeof window.ipc.on === 'function') window.ipc.on(channels.progress, onProgress);
        events.on(connectionManager, 'apiclientcreated', pulse);
        events.on(connectionManager, 'credentialsupdated', pulse);
        timer = setInterval(pulse, 2000);
        window.addEventListener('unload', function () {
            clearInterval(timer); timer = null;
            events.off(connectionManager, 'apiclientcreated', pulse); events.off(connectionManager, 'credentialsupdated', pulse);
            if (window.ipc && typeof window.ipc.removeListener === 'function') window.ipc.removeListener(channels.progress, onProgress);
        }, {once: true});
        pulse();
    }
    async function begin(api, item, mediaSourceId) {
        start();
        var value = context(api);
        if (!value || !item || item.ServerId && item.ServerId !== value.serverId) {toast('请登录当前视频所在服务器后再下载。'); return;}
        toast('正在核对下载来源…');
        var result = await invoke('start', {context: value, itemId: item.Id, mediaSourceId: mediaSourceId});
        if (result.status === 'queued') toast('已加入下载任务，可在设置中的“下载”查看进度。');
        else if (result.status === 'downloaded') toast('已有完整下载，可在下载设置中查看位置。');
        else if (result.status === 'error') toast(message(result.reason));
        return result;
    }
    async function localSource(api, item, source, signal) {
        var value = context(api);
        if (!value || !item || item.MediaType !== 'Video' || !source || !source.Id || item.ServerId && value.serverId !== item.ServerId || signal && signal.aborted) return null;
        var requestId = 'download-' + Date.now().toString(36) + '-' + (++sequence).toString(36);
        function abort() {try {window.ipc.send(channels.cancel, {requestId: requestId});} catch (_) {}}
        if (signal) signal.addEventListener('abort', abort, {once: true});
        try {
            var result = await invoke('lookup', {context: value, itemId: item.Id, mediaSourceId: source.Id, requestId: requestId});
            if (signal && signal.aborted || JSON.stringify(context(api)) !== JSON.stringify(value)) return null;
            return result && result.status === 'hit' && typeof result.source === 'string' ? result : null;
        } finally {if (signal) signal.removeEventListener('abort', abort);}
    }
    function settings(name, payload) {
        var value = context(current());
        if (!value) return Promise.resolve({status: 'error', reason: 'auth-required'});
        return invoke(name, Object.assign({context: value}, payload || {})).then(function (result) {
            return JSON.stringify(context(current())) === JSON.stringify(value) ? result : {status: 'cancelled'};
        });
    }
    return {start: start, begin: begin, localSource: localSource, message: message,
        status: function () {return settings('status');}, directory: function () {return settings('directory');},
        retry: function (id) {return settings('retry', {taskId: id});}};
});
