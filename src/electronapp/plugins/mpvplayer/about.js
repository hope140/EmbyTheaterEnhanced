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
        this.infoRequestId = 0;
        view.querySelector('.btnCheckUpdates').addEventListener('click', this.checkUpdates.bind(this));
        view.querySelector('.btnCopyEnvironment').addEventListener('click', this.copyEnvironment.bind(this));
        view.querySelector('.btnOpenReleases').addEventListener('click', this.openReleases.bind(this));
        view.querySelector('.aboutReleaseLink').addEventListener('click', function (event) {
            event.preventDefault();
            this.openReleases();
        }.bind(this));
    }

    Object.assign(AboutView.prototype, BaseView.prototype);

    AboutView.prototype.renderInfo = function (info) {
        this.info = info;
        var view = this.view;
        var fields = {
            aboutHeaderVersion: 'appVersion', aboutAppVersion: 'appVersion',
            aboutElectron: 'electron', aboutChromium: 'chromium', aboutNativeHelper: 'nativeHelper',
            aboutLibmpv: 'libmpv', aboutSourceCommit: 'sourceCommit', aboutNode: 'node',
            aboutWindows: 'windows', aboutDisplayDpi: 'displayDpi', aboutNativeHelperState: 'nativeHelperState',
            aboutRunningNativeHelper: 'runningNativeHelper', aboutRunningLibmpv: 'runningLibmpv'
        };
        Object.keys(fields).forEach(function (name) { setValue(view, '.' + name, info[fields[name]]); });
    };

    AboutView.prototype.loadInfo = function () {
        var view = this.view;
        var requestId = ++this.infoRequestId;
        loading.show();
        return request(CHANNELS.info).then(function (response) {
            if (!response || response.status !== 'ok' || !response.info) throw new Error('maintenance_info_failed');
            if (requestId !== this.infoRequestId) return;
            this.renderInfo(response.info);
            setStatus(view.querySelector('.aboutCopyState'), '', false);
        }.bind(this)).catch(function () {
            if (requestId !== this.infoRequestId) return;
            setStatus(view.querySelector('.aboutCopyState'), '无法读取版本信息，请重启应用后重试。', true);
        }.bind(this)).then(function () {
            if (requestId === this.infoRequestId) loading.hide();
        }.bind(this));
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
        var requestId = ++this.infoRequestId;
        loading.hide();
        request(CHANNELS.copy).then(function (response) {
            if (requestId !== this.infoRequestId) return;
            if (response && response.status === 'copied' && response.info) this.renderInfo(response.info);
            setStatus(state, response && response.status === 'copied' ? '已复制版本/环境信息。' : '复制失败，请稍后重试。', !(response && response.status === 'copied'));
        }.bind(this)).catch(function () {
            if (requestId !== this.infoRequestId) return;
            setStatus(state, '复制失败，请稍后重试。', true);
        }.bind(this));
    };

    AboutView.prototype.openReleases = function () {
        var link = this.view.querySelector('.aboutReleaseLink');
        request(CHANNELS.releases, {url: link.getAttribute('data-release-url') || ''}).catch(function () {});
    };

    AboutView.prototype.onResume = function (options) {
        BaseView.prototype.onResume.apply(this, arguments);
        this.loadInfo();
    };

    AboutView.prototype.onPause = function () {
        BaseView.prototype.onPause.apply(this, arguments);
    };

    return AboutView;
});
