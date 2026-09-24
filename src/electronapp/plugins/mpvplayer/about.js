define(['loading', 'baseView', 'emby-button', 'emby-scroller', 'css!./enhanced-settings', 'css!./about'], function (loading, BaseView) {
    'use strict';

    var CHANNELS = {
        info: 'enhanced-maintenance-info',
        copy: 'enhanced-maintenance-copy-environment',
        checkUpdate: 'enhanced-maintenance-check-update',
        releases: 'enhanced-maintenance-open-releases'
    };

    function request(channel, payload) {
        if (!window.ipc || typeof window.ipc.invoke !== 'function') return Promise.reject(new Error('maintenance_api_unavailable'));
        return window.ipc.invoke(channel, payload);
    }

    function setStatus(node, text, isError) {
        node.textContent = text || '';
        node.setAttribute('role', isError ? 'alert' : 'status');
    }

    function setValue(view, selector, value, fallback) {
        view.querySelector(selector).textContent = value || fallback || 'UNKNOWN';
    }

    function AboutView(view) {
        BaseView.apply(this, arguments);
        this.view = view;
        this.info = null;
        view.querySelector('.btnCheckUpdates').addEventListener('click', this.checkUpdates.bind(this));
        view.querySelector('.btnCopyEnvironment').addEventListener('click', this.copyEnvironment.bind(this));
        view.querySelector('.btnOpenReleases').addEventListener('click', this.openReleases.bind(this));
        view.querySelector('.aboutReleaseLink').addEventListener('click', function (event) {
            event.preventDefault();
            this.openReleases();
        }.bind(this));
    }

    Object.assign(AboutView.prototype, BaseView.prototype);

    AboutView.prototype.loadInfo = function () {
        var view = this.view;
        loading.show();
        return request(CHANNELS.info).then(function (response) {
            if (!response || response.status !== 'ok' || !response.info) throw new Error('maintenance_info_failed');
            this.info = response.info;
            setValue(view, '.aboutHeaderVersion', response.info.appVersion);
            setValue(view, '.aboutAppVersion', response.info.appVersion);
            setValue(view, '.aboutElectron', response.info.electron);
            setValue(view, '.aboutChromium', response.info.chromium);
            setValue(view, '.aboutNativeHelper', response.info.nativeHelper);
            setValue(view, '.aboutLibmpv', response.info.libmpv);
            setValue(view, '.aboutSourceCommit', response.info.sourceCommit);
            setValue(view, '.aboutNode', response.info.node);
            setValue(view, '.aboutWindows', response.info.windows);
            setValue(view, '.aboutDisplayDpi', response.info.displayDpi, 'NOT AVAILABLE');
            setStatus(view.querySelector('.aboutCopyState'), '', false);
        }.bind(this)).catch(function () {
            setStatus(view.querySelector('.aboutCopyState'), '无法读取版本信息，请重启应用后重试。', true);
        }).then(function () {
            loading.hide();
        });
    };

    AboutView.prototype.checkUpdates = function () {
        var view = this.view;
        var button = view.querySelector('.btnCheckUpdates');
        var state = view.querySelector('.aboutUpdateState');
        var update = view.querySelector('.about-update');
        button.disabled = true;
        update.hidden = true;
        setStatus(state, '正在检查…', false);
        request(CHANNELS.checkUpdate).then(function (response) {
            if (response && response.status === 'latest') {
                setStatus(state, '已是最新版本（' + response.currentVersion + '）。', false);
                return;
            }
            if (response && response.status === 'update-available') {
                setValue(view, '.aboutCurrentVersion', response.currentVersion);
                setValue(view, '.aboutLatestVersion', response.latestVersion);
                view.querySelector('.aboutReleaseLink').setAttribute('data-release-url', response.releaseUrl || '');
                update.hidden = false;
                setStatus(state, '发现新版本：' + response.latestVersion + '。', false);
                return;
            }
            setStatus(state, '检查失败，请稍后重试。', true);
        }).catch(function () {
            setStatus(state, '检查失败，请稍后重试。', true);
        }).then(function () {
            button.disabled = false;
        });
    };

    AboutView.prototype.copyEnvironment = function () {
        var state = this.view.querySelector('.aboutCopyState');
        var ready = this.info ? Promise.resolve() : this.loadInfo();
        ready.then(function () {
            return request(CHANNELS.copy);
        }).then(function (response) {
            setStatus(state, response && response.status === 'copied' ? '已复制版本/环境信息。' : '复制失败，请稍后重试。', !(response && response.status === 'copied'));
        }).catch(function () {
            setStatus(state, '复制失败，请稍后重试。', true);
        });
    };

    AboutView.prototype.openReleases = function () {
        var link = this.view.querySelector('.aboutReleaseLink');
        request(CHANNELS.releases, {url: link.getAttribute('data-release-url') || ''}).catch(function () {});
    };

    AboutView.prototype.onResume = function (options) {
        BaseView.prototype.onResume.apply(this, arguments);
        if (!this.info || (options && options.refresh)) this.loadInfo();
        else loading.hide();
    };

    AboutView.prototype.onPause = function () {
        BaseView.prototype.onPause.apply(this, arguments);
    };

    return AboutView;
});
