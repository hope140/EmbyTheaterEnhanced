(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.eteNativeHelperClient = factory();
}(this, function () {
    'use strict';

    var CALL_CHANNEL = 'enhanced-native-helper-call';
    var NOTIFY_CHANNEL = 'enhanced-native-helper-notify';
    var EVENT_CHANNEL = 'enhanced-native-helper-event';

    function invoke(ipc, operation, payload, endpointId) {
        if (!ipc || typeof ipc.invoke !== 'function') return Promise.reject(new Error('native-helper-ipc-unavailable'));
        return Promise.resolve(ipc.invoke(CALL_CHANNEL, {operation: operation, payload: payload || {}, endpointId: endpointId || null})).then(function (result) {
            if (!result || result.status === 'error') throw new Error(result && result.reason || 'native-helper-operation-failed');
            return result;
        });
    }

    function Endpoint(ipc, metadata) {
        var self = this;
        var listeners = [];
        var destroyed = false;
        var visible = false;
        var endpointId = metadata.endpointId;
        var currentGenerationId = null;
        if (typeof endpointId !== 'string' || !endpointId) throw new Error('native-helper-endpoint-id-missing');
        function call(operation, payload) { return invoke(ipc, operation, payload, endpointId); }
        this.mode = metadata.mode;
        this.protocolVersion = metadata.protocolVersion;
        this.helperVersion = metadata.helperVersion;
        this.libmpvVersion = metadata.libmpvVersion;
        this.style = {};

        function emit(data) {
            listeners.slice().forEach(function (listener) {
                try { listener({data: data}); } catch (_) { }
            });
        }

        this._onIpcEvent = function (event, message) {
            if (destroyed || !message || typeof message !== 'object') return;
            if (message.type === 'property_change' && message.data && typeof message.data.name === 'string') {
                emit({type: 'property_change', data: {name: message.data.name, value: message.data.value}});
            } else if (message.type === 'bridge_error') {
                emit({type: 'bridge_error', data: {reason: message.reason || 'helper-terminated'}});
            }
        };
        ipc.on(EVENT_CHANNEL, this._onIpcEvent);

        Object.defineProperty(this.style, 'opacity', {
            enumerable: true,
            get: function () { return visible ? 1 : 0; },
            set: function (value) {
                visible = Number(value) > 0;
                if (destroyed || !ipc || typeof ipc.send !== 'function') return;
                ipc.send(NOTIFY_CHANNEL, {operation: 'set-visible', payload: {visible: visible, generationId: currentGenerationId}, endpointId: endpointId});
            }
        });

        this.addEventListener = function (type, listener) {
            if (type === 'message' && typeof listener === 'function' && listeners.indexOf(listener) < 0) listeners.push(listener);
        };
        this.removeEventListener = function (type, listener) {
            if (type !== 'message') return;
            var index = listeners.indexOf(listener);
            if (index >= 0) listeners.splice(index, 1);
        };
        this.beginGeneration = function (label) {
            return call('begin-generation', {label: label}).then(function (result) {
                currentGenerationId = result.generationId;
                return result;
            });
        };
        this.retireGeneration = function (reason) {
            if (destroyed || !ipc || typeof ipc.send !== 'function') return;
            ipc.send(NOTIFY_CHANNEL, {operation: 'retire-generation', payload: {reason: reason || 'retired', generationId: currentGenerationId}, endpointId: endpointId});
            currentGenerationId = null;
        };
        this.observeProperties = function (properties) {
            return call('observe', {properties: properties});
        };
        this.setProperties = function (properties) {
            var entries = Object.keys(properties || {}).map(function (name) { return {name: name, value: properties[name]}; });
            return call('set-properties', {entries: entries, generationId: currentGenerationId});
        };
        this.sendCommand = function (data) {
            return call('command', {data: data, generationId: currentGenerationId});
        };
        this.getProperty = function (name) {
            return call('get-property', {name: name, generationId: currentGenerationId}).then(function (result) { return result.value; });
        };
        this.postMessage = function (message) {
            var pending;
            if (!message || typeof message !== 'object') return;
            if (message.type === 'command') pending = self.sendCommand(message.data);
            else if (message.type === 'set_property' && message.data) pending = self.setProperties((function () {
                var result = {}; result[message.data.name] = message.data.value; return result;
            }()));
            else if (message.type === 'observe_property') pending = self.observeProperties([message.data]);
            else if (message.type === 'get_property_async') {
                pending = self.getProperty(message.data).then(function (value) {
                    emit({type: 'property_change', data: {name: message.data, value: value}});
                }, function () {
                    emit({type: 'property_change', data: {name: message.data, value: null}});
                });
                return;
            }
            if (pending && typeof pending.catch === 'function') {
                pending.catch(function (error) { emit({type: 'bridge_error', data: {reason: error && error.message || 'bridge-call-failed'}}); });
            }
        };
        this.destroy = function () {
            if (destroyed) return Promise.resolve();
            destroyed = true;
            visible = false;
            try { ipc.removeListener(EVENT_CHANNEL, self._onIpcEvent); } catch (_) { }
            listeners = [];
            currentGenerationId = null;
            return invoke(ipc, 'destroy', {}, endpointId);
        };
    }

    function create(options) {
        var ipc = options && options.ipc;
        return invoke(ipc, 'create', {}).then(function (metadata) {
            return metadata.mode === 'pepper' ? {mode: 'pepper', endpoint: null} : {
                mode: 'native-helper',
                endpoint: new Endpoint(ipc, metadata)
            };
        });
    }

    return {CALL_CHANNEL: CALL_CHANNEL, EVENT_CHANNEL: EVENT_CHANNEL, NOTIFY_CHANNEL: NOTIFY_CHANNEL, create: create};
}));
