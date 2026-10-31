define(['connectionManager', 'events', 'toast'], function (connectionManager, events, toast) {
    'use strict';
    var started = false, timer = null, lastIdentity = null, sequence = 0;
    var lastStates = Object.create(null), restarts = Object.create(null);
    var channels = {start: 'enhanced-download-start', attach: 'enhanced-download-attach', detach: 'enhanced-download-detach', status: 'enhanced-download-status',
        collection: 'enhanced-download-collection', control: 'enhanced-download-control', openFolder: 'enhanced-download-open-folder', directory: 'enhanced-download-directory', retry: 'enhanced-download-retry', lookup: 'enhanced-download-lookup',
        cancel: 'enhanced-download-lookup-cancel', progress: 'enhanced-download-progress'};
    var reasons = {
        'collection-unavailable': '只能从剧集或季详情添加整部剧／整季下载。',
        'collection-empty': '此项目当前没有可加入的剧集。',
        'collection-invalid': '服务器返回的剧集列表不完整或归属不明确，未继续添加，请重试。',
        'collection-changed': '读取期间剧集列表发生变化，请重新添加。',
        'collection-too-large': '一次最多添加 512 集，请改为逐季添加。',
        'task-limit': '下载任务记录已达上限，请先移除不需要的记录。',
        'task-store-unavailable': '无法保存下载任务，请检查客户端配置目录的空间或权限。',
        'user-paused': '已手动暂停，点击继续可恢复；重开客户端也会保持暂停。',
        'directory-changed': '下载目录的身份已变化，原记录已保留。',
        'file-missing': '未找到文件，可能已被移动或删除；可选择仅删除记录。',
        'file-changed': '文件已变化，未删除或接管此文件；可选择仅删除记录。',
        'file-unavailable': '暂时无法读取文件，记录已保留，请检查磁盘和权限。',
        'file-delete-unavailable': '此处暂时无法安全删除文件，记录已保留；可选择仅删除记录。',
        'file-delete-unconfirmed': '文件正被使用、校验未通过或删除结果未确认，记录已保留；请检查后重试或仅删除记录。',
        'request-pending': '已有操作正在等待处理，请稍后重试。',
        'invalid-metadata': '服务器返回的资料不是有效 JSON，无法核对下载权限和来源。',
        'metadata-redirect': '服务器资料接口发生跳转，请检查服务器地址或代理配置。',
        'network-failed': '连接下载来源失败，请检查网络、证书和服务器地址。',
        'timeout': '核对下载来源超时，请稍后重试。',
        'server-changed': '服务器身份与当前登录不一致，请重新登录。',
        'http-status': '下载来源返回错误响应，请稍后重试。',
        'directory-invalid': '下载目录无效，请重新选择。',
        'settings-invalid': '下载目录设置无法读取，原设置已保留。',
        'settings-save-failed': '无法保存下载目录，请检查客户端配置目录权限。',
        'folder-open-failed': '系统无法打开此下载文件夹，请检查目录是否可用。',
        'source-close-failed': '下载来源连接未能正常关闭，请重试。',
        'stream-unsupported': '此来源暂不支持完整视频文件下载。',
        'auth-required': '下载需要重新登录服务器。', 'download-not-permitted': '服务器未允许当前账户下载此视频。',
        'source-selection-required': '请先选择媒体版本，再下载。', 'source-unavailable': '当前来源暂时无法下载。',
        'pointer-response': '服务器返回的是 STRM 地址文本，未取得影片本体。', 'segmented-source': '此来源是分段流，暂不支持完整文件下载。',
        'container-unrecognized': '无法确认响应是受支持的视频文件，未保存为完成下载。', 'length-unavailable': '来源未提供可核验的文件长度。',
        'directory-unavailable': '下载目录不可用，请在下载管理中重新选择。', 'directory-unwritable': '下载目录不可写。',
        'temporary-changed': '未完成文件的归属已变化，已停止操作，未覆盖或删除该文件。',
        'disk-full': '下载空间不足，任务已保留。', 'representation-changed': '来源版本发生变化，请继续任务以重新下载。',
        'file-too-large': '文件超出此目录文件系统的单文件大小限制，请为新任务选择支持大文件的目录。',
        'publication-unconfirmed': '文件提交结果尚未确认，任务和文件已保留，请继续任务以核验。',
        'publication-unavailable': '此目录无法安全提交文件，任务已保留。',
        'task-store-unsafe': '下载任务记录无法安全读取，已保留原文件。'
    };
    var stages = {'collection-list': '读取剧集列表', 'server-check': '服务器核验', 'permission-check': '账户权限', 'item-check': '视频资料',
        'version-check': '媒体版本', 'resolve-source': '解析来源', 'probe-source': '影片本体验证', prepare: '准备下载'};
    function message(reason) {return reasons[reason] || '下载未完成' + (typeof reason === 'string' && /^[a-z-]{1,64}$/.test(reason) ? '（' + reason + '）' : '') + '，请在下载管理中重试。';}
    var sources = {'direct-url': 'CD2 直链', 'cd2-url': 'CD2 HTTP', 'media-source-http': '媒体源 HTTP', 'emby-original': 'Emby 下载接口', 'emby-static': 'Emby 原始视频接口'};
    function detail(value) {
        var d = value.diagnostic || {}, stage = value.stage || d.stage;
        return (stages[stage] ? stages[stage] + '：' : '') + message(value.reason) +
            (d.httpStatus ? '（HTTP ' + d.httpStatus + '）' : '') + (sources[d.sourceKind] ? ' 来源：' + sources[d.sourceKind] : '');
    }
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
            if (value.state === 'complete') {
                var title = [value.title, value.fileName].find(function (name) {return typeof name === 'string' && name.trim();}) || '视频';
                // The native toast accepts HTML; media names remain plain text.
                title = title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 256);
                toast('下载完成：' + title.replace(/[&<>"']/g, function (character) {
                    return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character];
                }));
            }
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
        toast('正在准备下载…');
        var result = await invoke('start', {context: value, itemId: item.Id, mediaSourceId: mediaSourceId, title: item.Name});
        if (JSON.stringify(context(current())) !== JSON.stringify(value) || JSON.stringify(context(api)) !== JSON.stringify(value)) return {status: 'cancelled'};
        if (result.status === 'queued') toast('已加入下载任务，可在设置中的“下载管理”查看进度。');
        else if (result.status === 'downloaded') toast('已有完整下载，可在下载管理中查看位置。');
        else if (result.status === 'error') toast(detail(result));
        return result;
    }
    async function beginCollection(api, item) {
        start();
        var value = context(api);
        if (!value || !item || item.ServerId && item.ServerId !== value.serverId) {toast('请登录当前项目所在服务器后再下载。'); return;}
        toast('正在读取剧集列表…');
        var result = await invoke('collection', {context: value, itemId: item.Id});
        if (JSON.stringify(context(current())) !== JSON.stringify(value) || JSON.stringify(context(api)) !== JSON.stringify(value)) return {status: 'cancelled'};
        if (result.status === 'queued') toast(result.added ? '已加入 ' + result.added + ' 集；' + result.reused + ' 项已有任务未重复添加，可在下载管理查看。' : '这些剧集已有任务，未重复添加。');
        else if (result.status === 'error') toast((result.added ? '已加入 ' + result.added + ' 集，其余未加入：' : '') + detail(result));
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
    return {start: start, begin: begin, beginCollection: beginCollection, localSource: localSource, message: message, detail: detail, sourceKind: function (value) {return sources[value] || '旧记录未保存下载来源';}, stage: function (value) {return stages[value] || '准备下载';},
        status: function () {return settings('status');}, directory: function () {return settings('directory');},
        pause: function (id) {return settings('control', {action: 'pause', taskIds: [id]});},
        resume: function (id) {return settings('control', {action: 'resume', taskIds: [id]});},
        pauseAll: function () {return settings('control', {action: 'pause', all: true});},
        resumeAll: function () {return settings('control', {action: 'resume', all: true});},
        remove: function (ids) {return settings('control', {action: 'remove', taskIds: ids});},
        openFolder: function (id) {return settings('openFolder', id ? {taskId: id} : {});},
        retry: function (id) {return settings('retry', {taskId: id});}};
});
