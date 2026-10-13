define(['exports', '../../www/modules/loading/loading.js', '../../www/modules/common/globalize.js'], function(exports, loading, globalize) {
    'use strict';
    function message(response) {
        if (response && response.status === 401) return 'Plugin request denied. Sign in again.';
        if (response && response.status === 403) return 'Plugin request denied.';
        if (response && response.status === 404) return 'Plugin resource is unavailable.';
        return 'Plugin request failed. Please try again.';
    }
    function safeError(response) {
        var status = response && response.status;
        var cancelled = response && response.name === 'AbortError';
        var error = new Error(cancelled ? 'Plugin request cancelled.' : message({status: status}));
        error.name = cancelled ? 'AbortError' : 'PluginRequestError';
        error.code = cancelled ? 'plugin-request-cancelled' : 'plugin-request-failed';
        // Caller frames may contain plugin resource URLs. Rejection diagnostics
        // keep the static classification instead of forwarding those frames.
        error.stack = error.name + ': ' + error.message;
        if (Number.isInteger(status) && status >= 100 && status <= 599) error.status = status;
        return error;
    }
    exports.default = {
        getErrorInfo: function(response) { return Promise.resolve({title: globalize.default.translate('Error'), text: message(response)}); },
        handleErrorResponse: function(response) {
            loading.default.hide();
            var error = safeError(response);
            if (error.name === 'AbortError') return Promise.reject(error);
            return Promise.resolve().then(function() { return require(['alert']); }).then(function(deps) {
                return deps[0]({title: globalize.default.translate('Error'), text: error.message});
            }).then(function() { throw error; }, function() { throw error; });
        },
        handleConfigurationSavedResponse: function(response) {
            loading.default.hide();
            return require(['toast']).then(function(deps) { deps[0](globalize.default.translate('SettingsSaved')); return response; });
        }
    };
});
