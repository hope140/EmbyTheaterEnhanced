define(['loading', 'pluginManager', 'appSettings', 'baseView', '../../native-helper/client.js', './preload-settings.js', 'emby-select', 'emby-checkbox', 'emby-input', 'emby-scroller'], function (loading, pluginManager, appSettings, BaseView, nativeHelperClient, preloadSettings) {

    function onSubmit(e) {
        e.preventDefault();
        return false;
    }

    function saveSettings(view, renderSettingsEditable) {

        if (renderSettingsEditable) {
            appSettings.set('mpv-vo', view.querySelector('.selectVideoOut').value);
            appSettings.set('mpv-gpuapi', view.querySelector('.selectGpuApi').value);
        }
        appSettings.set('mpv-hwdec', view.querySelector('.selectHwaMode').value);
        appSettings.set('mpv-outputlevels', view.querySelector('.selectNominalRange').value);
        appSettings.set('mpv-displaysync', view.querySelector('.chkRefreshRateMode').checked);
        appSettings.set('mpv-displaysync_override', view.querySelector('.txtUserRefreshRate').value);
        appSettings.set('mpv-videosyncmode', view.querySelector('.selectVideoSync').value);
        appSettings.set('mpv-deinterlace', view.querySelector('.selectDeinterlace').value);

        appSettings.set('mpv-demuxermaxbytes', view.querySelector('.selectNetworkCache').value);
        appSettings.set('mpv-audiodelay', view.querySelector('.txtDefaultAudioDelay').value);
        appSettings.set('mpv-audiodelay2325', view.querySelector('.txtAudioDelay2325').value);

        appSettings.set('mpv-interpolation', view.querySelector('.chkInterpolation').checked);
        appSettings.set('mpv-openglhq', view.querySelector('.chkOpenglhq').checked);

    }

    function renderSettings(view) {

        view.querySelector('.selectVideoOut').value = appSettings.get('mpv-vo') || '';
        view.querySelector('.selectGpuApi').value = appSettings.get('mpv-gpuapi') || '';
        view.querySelector('.selectHwaMode').value = appSettings.get('mpv-hwdec') || '';
        view.querySelector('.selectNominalRange').value = appSettings.get('mpv-outputlevels') || 'full';
        view.querySelector('.chkRefreshRateMode').checked = appSettings.get('mpv-displaysync') === 'true';
        view.querySelector('.txtUserRefreshRate').value = appSettings.get('mpv-displaysync_override') || '';
        view.querySelector('.selectVideoSync').value = appSettings.get('mpv-videosyncmode') || '';
        view.querySelector('.selectDeinterlace').value = appSettings.get('mpv-deinterlace') || '';

        view.querySelector('.selectNetworkCache').value = appSettings.get('mpv-demuxermaxbytes') || '';
        view.querySelector('.txtDefaultAudioDelay').value = appSettings.get('mpv-audiodelay') || '0';
        view.querySelector('.txtAudioDelay2325').value = appSettings.get('mpv-audiodelay2325') || '0';

        view.querySelector('.chkOpenglhq').checked = appSettings.get('mpv-openglhq') === 'true';
        view.querySelector('.chkInterpolation').checked = appSettings.get('mpv-interpolation') === 'true';

    }

    function setRenderControlsEditable(view, editable) {
        ['.selectVideoOut', '.selectGpuApi'].forEach(function (selector) {
            var control = view.querySelector(selector);
            control.closest('.selectContainer').classList.toggle('hide', !editable);
            control.disabled = !editable;
        });
    }

    function SettingsView(view, params) {

        BaseView.apply(this, arguments);
        this.renderSettingsEditable = false;
        this.renderSettingsRequest = 0;
        setRenderControlsEditable(view, false);
        this.preloadSettings = preloadSettings.create(view, function (channel, value) {
            if (!window.ipc || typeof window.ipc.invoke !== 'function') return Promise.reject(Error('unavailable'));
            return window.ipc.invoke(channel, value);
        });

        view.querySelector('form').addEventListener('submit', onSubmit);
    }

    Object.assign(SettingsView.prototype, BaseView.prototype);

    SettingsView.prototype.loadRenderCapabilities = function () {
        var self = this, request = ++this.renderSettingsRequest;
        this.renderSettingsEditable = false;
        setRenderControlsEditable(this.view, false);
        if (!window.ipc || typeof window.ipc.invoke !== 'function') return Promise.resolve();
        // Read-only status is available before playback and never creates a helper.
        return Promise.resolve().then(function () {
            return window.ipc.invoke(nativeHelperClient.CALL_CHANNEL, {operation: 'status', payload: {}});
        }).then(function (status) {
            if (request !== self.renderSettingsRequest || !status || status.status !== 'ok' ||
                typeof status.mode !== 'string' || !status.mode) return;
            var fixedNative = status.mode === 'native-helper' &&
                status.fixedNativeRenderPath === 'vo=gpu-next; gpu-api=d3d11';
            if (status.mode === 'native-helper' && !fixedNative) return;
            self.renderSettingsEditable = !fixedNative;
            setRenderControlsEditable(self.view, self.renderSettingsEditable);
        }).catch(function () { /* Unknown capability must not overwrite stored render values. */ });
    };

    SettingsView.prototype.onResume = function (options) {

        BaseView.prototype.onResume.apply(this, arguments);

        loading.hide();

        if (options.refresh) {
            renderSettings(this.view);
        }
        return Promise.all([this.loadRenderCapabilities(), this.preloadSettings.resume()]);
    };

    SettingsView.prototype.onPause = function () {

        saveSettings(this.view, this.renderSettingsEditable);
        this.preloadSettings.pause();
        this.renderSettingsRequest++;
        this.renderSettingsEditable = false;
        setRenderControlsEditable(this.view, false);

        BaseView.prototype.onPause.apply(this, arguments);
    };

    SettingsView.prototype.destroy = function () {
        this.renderSettingsRequest++;
        this.preloadSettings.dispose();
        if (BaseView.prototype.destroy) BaseView.prototype.destroy.apply(this, arguments);
    };

    return SettingsView;
});
/* Modified for Emby Theater Enhanced on 2026-09-12/13 and 2026-10-23. Distributed under GPL-2.0-only; see LICENSE. */
