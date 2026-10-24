define(['baseView', './cache-settings', 'emby-button', 'emby-scroller', 'css!./enhanced-settings', 'css!./cache-management'], function (BaseView, cacheSettings) {
    'use strict';
    function request(channel) {
        if (!window.ipc || typeof window.ipc.invoke !== 'function') return Promise.reject(new Error('cache_api_unavailable'));
        return window.ipc.invoke(channel);
    }
    function CacheManagementView(view) {
        BaseView.apply(this, arguments);
        this.cacheManagement = cacheSettings.create(view, request);
    }
    Object.assign(CacheManagementView.prototype, BaseView.prototype);
    CacheManagementView.prototype.onResume = function () {
        BaseView.prototype.onResume.apply(this, arguments);
        return this.cacheManagement.resume();
    };
    CacheManagementView.prototype.onPause = function () {
        this.cacheManagement.pause();
        BaseView.prototype.onPause.apply(this, arguments);
    };
    CacheManagementView.prototype.destroy = function () {
        this.cacheManagement.dispose();
        if (BaseView.prototype.destroy) return BaseView.prototype.destroy.apply(this, arguments);
    };
    return CacheManagementView;
});
