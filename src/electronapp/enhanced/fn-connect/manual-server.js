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
        function retireProfile(id) {
            retirement = Promise.all([retirement, fn.remove(id)]).then(function () {});
            // UI retirement is allowed without awaiting; a later explicit
            // reconnect must still observe this original failure.
            retirement.catch(function () {});
            return retirement;
        }
        function reset() {
            generation++; connectAbort?.abort();
            if (profile && !completed) retireProfile(profile);
            profile = null; fingerprint = null; restartOnSubmit = false;
        }
        function notice(message) { status.textContent = message; }
        var retirement, restartOnSubmit = false;
        var enabled, bootstrap, authOrigins, mediaOrigins, mediaConsent, status, reviewNotice, pendingOpen = false;
        var pendingNotices = new Map();
        function review(value) {
            restartOnSubmit = value.code !== 'LOGIN_TARGET_REQUIRES_EMBY_CLIENT';
            reviewNotice = !restartOnSubmit ? '认证窗口已停止进入 Emby 页面；请回到此处继续验证飞牛授权，再按原流程登录 Emby。' :
                value.code === 'LOGIN_PAGE_LOAD_FAILED' ?
                '官方认证入口加载失败（' + (value.errorCode || 'OTHER') + '）。请核对入口后重新连接，不会自动重试。' :
                value.origin ? '认证跳转未放行：' + value.origin + '。请核对官方归属后再配置，不会自动信任。' :
                '官方认证跳转被阻止。请核对入口及允许的认证 origin 后重新连接，不会自动信任。';
            notice(reviewNotice); submit.textContent = restartOnSubmit ? '重新连接' : '已完成飞牛认证，继续';
        }
        async function openProfile(config, epoch) {
            pendingOpen = true;
            try {
                if (retirement) {try {await retirement;} catch {throw new Error('FN_CLOSE_UNCONFIRMED');}}
                if (disposed || generation !== epoch || !enabled.checked) return;
                var opened = await fn.open(config);
                if (disposed || generation !== epoch || !enabled.checked) { await retireProfile(opened.id); return; }
                profile = opened.id; fingerprint = JSON.stringify(config);
                if (pendingNotices.has(profile)) review(pendingNotices.get(profile));
                notice(reviewNotice || '请在独立窗口完成飞牛官方认证，再回到此处继续。Emby 账号仍在原登录页面输入。');
                submit.textContent = restartOnSubmit ? '重新连接' : '已完成飞牛认证，继续';
            } catch (error) {
                if (!disposed && generation === epoch && pendingNotices.has(error?.profileId)) review(pendingNotices.get(error.profileId));
                throw error;
            } finally { pendingOpen = false; pendingNotices.clear(); }
        }
        async function connect(event) {
            if (!enabled?.checked) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (busy || disposed) return;
            busy = true; submit.disabled = true; reviewNotice = null;
            try {
                var address = view.querySelector('.txtServerHost').value.trim();
                var port = view.querySelector('.txtServerPort').value.trim();
                if (port) { var parsed = new URL(address); parsed.port = port; address = parsed.href; }
                var config = {bootstrapUrl: bootstrap.value.trim(), embyUrl: address, authOrigins: list(authOrigins.value),
                    externalMediaOrigins: mediaConsent.checked ? list(mediaOrigins.value) : []};
                var next = JSON.stringify(config);
                if (fingerprint !== next || restartOnSubmit) reset();
                var epoch = generation;
                if (!profile) { await openProfile(config, epoch); return; }
                try { await fn.verify(profile); }
                catch (error) {
                    // Only a known retired handle can be recreated by this
                    // explicit click. Never retry auth/network failures.
                    if (!['PROFILE_CLOSED', 'FN_PROFILE_UNKNOWN'].includes(error?.message)) throw error;
                    if (disposed || generation !== epoch || !enabled.checked) return;
                    reset(); epoch = generation;
                    await openProfile(config, epoch); return;
                }
                if (disposed || generation !== epoch || !enabled.checked) return;
                await fn.route(profile);
                if (disposed || generation !== epoch || !enabled.checked) return;
                options.loading.show();
                connectAbort = new AbortController();
                var result = await options.connection.connectToAddress(address, {enableAutoLogin: false, signal: connectAbort.signal});
                if (disposed || generation !== epoch || !enabled.checked) return;
                if (!['SignedIn', 'ServerSignIn'].includes(result?.State)) throw new Error('FN_CONNECTION_UNAVAILABLE');
                completed = true;
                await options.router.handleConnectionResult(result, view);
            } catch (error) {
                if (disposed || !enabled.checked || epoch !== undefined && generation !== epoch) return;
                var codes = {API_BASE_REQUIRES_REVIEW: '请填写已确认的 Emby API 地址，不要填写 /web/index.html。',
                    FN_CLOSE_UNCONFIRMED: '上次连接尚未确认收尾，未创建新的认证窗口。',
                    FN_AUTH_REQUIRED: '飞牛访问尚未授权，请先在官方窗口完成认证。', ACCESS_CODE_REQUIRED: '请在官方窗口完成飞牛访问码认证。',
                    ACCESS_DENIED_UNCLASSIFIED: '访问被拒绝，尚不能确认是登录还是入口配置问题。',
                    INVALID_MEDIA_ORIGIN: '媒体地址须为明确的 HTTPS origin，不能与认证地址相同。'};
                if (!profile) submit.textContent = '重新连接';
                notice(reviewNotice || codes[error?.message] || '连接未完成。请核对官方认证窗口及填写的入口；不会自动重试或扩大允许地址。');
            } finally { busy = false; if (!disposed) { submit.disabled = false; options.loading.hide(); } }
        }
        fn.available().then(function (available) {
            if (!available || disposed) return;
            section = document.createElement('section');
            enabled = field('使用 FN Connect（独立实验）', 'checkbox');
            bootstrap = field('飞牛官方登录入口（填写原完整入口，可含路径；不要用额外认证地址替换）', 'url');
            bootstrap.placeholder = 'https://fnos.net/你的飞牛ID';
            authOrigins = field('额外允许的官方认证 origin（精确 HTTPS 地址，不含路径；以逗号分隔）');
            authOrigins.placeholder = 'https://auth.example.test';
            mediaOrigins = field('允许的外部媒体 origin（仅媒体正文用途，不是认证入口；不使用通配符）');
            mediaOrigins.placeholder = 'https://media.example.test';
            mediaConsent = field('允许从以上媒体地址读取正文；只传正常播放链接、Range 和实际 UA，不传飞牛／Emby 认证', 'checkbox');
            status = document.createElement('p'); status.setAttribute('role', 'status'); section.appendChild(status);
            unsubscribe = fn.onNotice(function (value) {
                if (disposed || !value.profileId) return;
                if (value.profileId === profile) review(value);
                else if (pendingOpen && pendingNotices.size < 16) pendingNotices.set(value.profileId, value);
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
