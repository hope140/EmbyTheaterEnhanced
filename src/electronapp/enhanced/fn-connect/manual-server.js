define(['./renderer.js'], function (fn) {
    'use strict';
    function install(view, options) {
        var disposed = false, completed = false, busy = false, profile = null, fingerprint, section, generation = 0, connectAbort, unsubscribe;
        var form = view.querySelector('form'), submit = form.querySelector('[type="submit"]');
        var originalLabel = submit.textContent;
        function field(label, type) {
            var row = document.createElement('div'), text = document.createElement('label'), input = document.createElement('input');
            row.className = 'inputContainer'; text.textContent = label; input.type = type || 'text'; input.className = 'input';
            text.appendChild(input); row.appendChild(text); section.appendChild(row); return input;
        }
        function list(value) { return value.split(/[\s,]+/).filter(Boolean); }
        function reset() { generation++; connectAbort?.abort(); if (profile && !completed) fn.remove(profile).catch(function () {}); profile = null; fingerprint = null; }
        function notice(message) { status.textContent = message; }
        var enabled, bootstrap, authOrigins, mediaOrigins, mediaConsent, status;
        async function connect(event) {
            if (!enabled?.checked) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (busy || disposed) return;
            busy = true; submit.disabled = true;
            try {
                var address = view.querySelector('.txtServerHost').value.trim();
                var port = view.querySelector('.txtServerPort').value.trim();
                if (port) { var parsed = new URL(address); parsed.port = port; address = parsed.href; }
                var config = {bootstrapUrl: bootstrap.value.trim(), embyUrl: address, authOrigins: list(authOrigins.value),
                    externalMediaOrigins: mediaConsent.checked ? list(mediaOrigins.value) : []};
                var next = JSON.stringify(config);
                if (fingerprint !== next) reset();
                var epoch = generation;
                if (!profile) {
                    var opened = await fn.open(config);
                    if (disposed || generation !== epoch || !enabled.checked) { await fn.remove(opened.id); return; }
                    profile = opened.id; fingerprint = next;
                    notice('请在独立窗口完成飞牛官方认证，再回到此处继续。Emby 账号仍在原登录页面输入。');
                    submit.textContent = '已完成飞牛认证，继续'; return;
                }
                await fn.verify(profile); await fn.route(profile);
                if (disposed || generation !== epoch || !enabled.checked) return;
                options.loading.show();
                connectAbort = new AbortController();
                var result = await options.connection.connectToAddress(address, {enableAutoLogin: false, signal: connectAbort.signal});
                if (disposed || generation !== epoch || !enabled.checked) return;
                if (!['SignedIn', 'ServerSignIn'].includes(result?.State)) throw new Error('FN_CONNECTION_UNAVAILABLE');
                completed = true;
                await options.router.handleConnectionResult(result, view);
            } catch (error) {
                var codes = {API_BASE_REQUIRES_REVIEW: '请填写已确认的 Emby API 地址，不要填写 /web/index.html。',
                    FN_AUTH_REQUIRED: '飞牛访问尚未授权，请先在官方窗口完成认证。', ACCESS_CODE_REQUIRED: '请在官方窗口完成飞牛访问码认证。',
                    ACCESS_DENIED_UNCLASSIFIED: '访问被拒绝，尚不能确认是登录还是入口配置问题。',
                    INVALID_MEDIA_ORIGIN: '媒体地址须为明确的 HTTPS origin，不能与认证地址相同。'};
                notice(codes[error?.message] || '连接未完成。请核对官方认证窗口及填写的入口；不会自动重试或扩大允许地址。');
            } finally { busy = false; if (!disposed) { submit.disabled = false; options.loading.hide(); } }
        }
        fn.available().then(function (available) {
            if (!available || disposed) return;
            section = document.createElement('section');
            enabled = field('使用 FN Connect（独立实验）', 'checkbox');
            bootstrap = field('飞牛官方登录入口', 'url');
            authOrigins = field('额外允许的官方认证 origin（以逗号分隔，不含路径）');
            mediaOrigins = field('允许的外部媒体 origin（以逗号分隔，不使用通配符）');
            mediaConsent = field('允许从以上媒体地址读取正文；只传正常播放链接、Range 和实际 UA，不传飞牛／Emby 认证', 'checkbox');
            status = document.createElement('p'); status.setAttribute('role', 'status'); section.appendChild(status);
            unsubscribe = fn.onNotice(function (value) {
                notice(value.origin ? '认证跳转未放行：' + value.origin + '。请核对官方归属后再配置，不会自动信任。' : '官方认证页面未完成，请查看独立窗口。');
            });
            var help = document.createElement('p'); help.textContent = '上方填写原 Emby 客户端使用的服务器基址，不填写网页文件路径。此实验不跨次启动复用飞牛登录，目录保留；普通连接保持原流程。'; section.appendChild(help);
            function toggle() {
                [bootstrap, authOrigins, mediaOrigins, mediaConsent].forEach(function (node) { node.disabled = !enabled.checked; });
                bootstrap.required = enabled.checked;
                if (enabled.checked && view.querySelector('.txtServerPort').value === '8096') view.querySelector('.txtServerPort').value = '';
                if (!enabled.checked) { reset(); submit.textContent = originalLabel; }
            }
            enabled.addEventListener('change', toggle); toggle();
            form.insertBefore(section, submit); form.addEventListener('submit', connect, true);
        });
        return function dispose() {
            disposed = true; form.removeEventListener('submit', connect, true); reset();
            if (unsubscribe) unsubscribe();
            if (section) section.remove();
        };
    }
    return {install: install};
});
