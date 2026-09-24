'use strict';

const fs = require('fs');

const cd2Service = require('./cd2-service');
const pathRules = require('../resolvers/path-rules');
const smartMappingBoundary = require('../resolvers/smart-mapping-boundary');

const CHANNELS = Object.freeze({
    GET: 'enhanced-strm-config-get',
    SAVE: 'enhanced-strm-config-save',
    SET_TOKEN: 'enhanced-strm-token-set',
    CLEAR_TOKEN: 'enhanced-strm-token-clear',
    TEST_CONNECTION: 'enhanced-strm-cd2-test-connection',
    GET_CONNECTION_STATUS: 'enhanced-strm-cd2-connection-status',
    TEST_RULE: 'enhanced-strm-rule-test',
    PREVIEW_MAPPING: 'enhanced-strm-smart-mapping-preview'
});

function errorReason(error) {
    const message = String(error && error.message || '');
    if (/^(invalid_token|rule_not_found|invalid_discovery)$/.test(message)) return message;
    if (/^unsupported_schema$/.test(message)) return message;
    return 'invalid_config';
}

function register(options) {
    const settings = options || {};
    const ipcMain = settings.ipcMain;
    const store = settings.store;
    const getWebContents = settings.getWebContents;
    const fileSystem = settings.fs || fs;
    const createTestService = settings.createTestService;
    const handlers = [];
    let connectionStatus = 'unknown';
    let connectionRevision = 0;

    function connectionSnapshot() {
        return {connectionStatus: connectionStatus, connectionRevision: connectionRevision};
    }

    function invalidateConnectionStatus() {
        connectionRevision++;
        connectionStatus = 'unknown';
    }

    function isTrusted(event) {
        const expected = typeof getWebContents === 'function' ? getWebContents() : null;
        return !!expected && event && event.sender === expected;
    }

    function rejectUntrusted() {
        return {status: 'error', reason: 'untrusted_sender'};
    }

    function registerHandler(channel, handler) {
        ipcMain.handle(channel, function (event, request) {
            if (!isTrusted(event)) return rejectUntrusted();
            return handler(request);
        });
        handlers.push(channel);
    }

    function saveRequest(request) {
        const config = request && request.config && typeof request.config === 'object'
            ? request.config
            : request;
        try {
            const saved = store.save(config);
            invalidateConnectionStatus();
            return Object.assign({status: 'saved', requiresRestart: true, config: saved}, connectionSnapshot());
        } catch (error) {
            return {status: 'error', reason: errorReason(error)};
        }
    }

    async function testConnection() {
        const attemptRevision = ++connectionRevision;
        connectionStatus = 'checking';
        let service;
        let response;
        try {
            service = typeof createTestService === 'function' ? createTestService() : settings.service;
            if (!service || typeof service.testConnection !== 'function') {
                response = {status: 'incomplete', reason: 'service_unavailable'};
            } else {
                response = await service.testConnection();
            }
        } catch (_) {
            response = {status: 'connection_failed', reason: 'connection_failed'};
        } finally {
            try {
                if (service && service !== settings.service && typeof service.close === 'function') service.close();
            } catch (_) { /* Connection status must still settle. */ }
        }
        if (!response || !['ok', 'auth_failed', 'connection_failed', 'incomplete'].includes(response.status)) {
            response = {status: 'connection_failed', reason: 'connection_failed'};
        }
        if (attemptRevision !== connectionRevision) {
            return Object.assign({status: 'stale', reason: 'superseded'}, connectionSnapshot());
        }
        connectionStatus = response && response.status === 'ok' ? 'connected' : 'failed';
        return Object.assign({}, response, connectionSnapshot());
    }

    function testRule(request) {
        const rule = store.getRule(request && request.ruleId);
        let mountStatus = 'not_configured';
        let cloudStatus = 'not_configured';

        if (!rule) return Object.assign({status: 'error', reason: 'rule_not_found'}, connectionSnapshot());
        if (rule.mountPrefix) {
            if (process.platform === 'win32' && pathRules.isPosixPath(rule.mountPrefix)) {
                mountStatus = 'unsupported_path';
            } else {
                try {
                    mountStatus = fileSystem.existsSync(rule.mountPrefix) ? 'ok' : 'missing';
                } catch (_) {
                    mountStatus = 'unavailable';
                }
            }
        }
        if (rule.cloudPrefix) {
            const probe = pathRules.appendSuffix(rule.sourcePrefix, 'ete-rule-test.mkv');
            cloudStatus = probe && cd2Service.mapLocalPath(probe, rule.sourcePrefix, rule.cloudPrefix)
                ? 'mapped'
                : 'invalid';
        }

        return Object.assign({
            status: mountStatus === 'missing' || mountStatus === 'unavailable' ? 'warning' : 'ok',
            ruleId: rule.id,
            mount: mountStatus,
            cloud: cloudStatus
        }, connectionSnapshot());
    }

    function previewMapping(request) {
        if (!request || typeof request !== 'object' || Array.isArray(request) ||
            !Array.isArray(request.samples) || request.samples.length < 1 ||
            request.samples.length > smartMappingBoundary.MAX_SAMPLES ||
            (request.rules !== undefined && (!Array.isArray(request.rules) || request.rules.length > 64))) {
            return {status: 'error', reason: 'invalid_request'};
        }
        const samples = request.samples;
        if (samples.some(sample => !sample || typeof sample !== 'object' || Array.isArray(sample) ||
            typeof sample.sourcePath !== 'string' || typeof sample.cloudPath !== 'string' ||
            (sample.mountPath !== undefined && typeof sample.mountPath !== 'string') ||
            sample.sourcePath.length > 32768 || sample.cloudPath.length > 32768 ||
            (sample.mountPath && sample.mountPath.length > 32768))) {
            return {status: 'error', reason: 'invalid_request'};
        }
        const rules = request.rules === undefined
            ? (store && typeof store.getPublicConfig === 'function' ? store.getPublicConfig().rules : [])
            : request.rules;
        if (rules.some(rule => !rule || typeof rule !== 'object' || Array.isArray(rule) ||
            typeof rule.sourcePrefix !== 'string' || rule.sourcePrefix.length > 32768 ||
            (rule.cloudPrefix !== null && rule.cloudPrefix !== undefined &&
                (typeof rule.cloudPrefix !== 'string' || rule.cloudPrefix.length > 32768)) ||
            (rule.mountPrefix !== null && rule.mountPrefix !== undefined &&
                (typeof rule.mountPrefix !== 'string' || rule.mountPrefix.length > 32768)))) {
            return {status: 'error', reason: 'invalid_request'};
        }
        try {
            return {status: 'ok', preview: smartMappingBoundary.preview(samples, rules)};
        } catch (_) {
            return {status: 'error', reason: 'preview_failed'};
        }
    }

    registerHandler(CHANNELS.GET, function () {
        return store.getPublicConfig();
    });
    registerHandler(CHANNELS.GET_CONNECTION_STATUS, connectionSnapshot);
    registerHandler(CHANNELS.SAVE, saveRequest);
    registerHandler(CHANNELS.SET_TOKEN, function (request) {
        try {
            const saved = store.setToken(request && request.token);
            invalidateConnectionStatus();
            return Object.assign({status: 'saved', requiresRestart: true, config: saved}, connectionSnapshot());
        } catch (error) {
            return {status: 'error', reason: errorReason(error)};
        }
    });
    registerHandler(CHANNELS.CLEAR_TOKEN, function () {
        try {
            const saved = store.clearToken();
            invalidateConnectionStatus();
            return Object.assign({status: 'saved', requiresRestart: true, config: saved}, connectionSnapshot());
        } catch (_) {
            return {status: 'error', reason: 'invalid_config'};
        }
    });
    registerHandler(CHANNELS.TEST_CONNECTION, testConnection);
    registerHandler(CHANNELS.TEST_RULE, testRule);
    registerHandler(CHANNELS.PREVIEW_MAPPING, previewMapping);
    return function unregister() {
        if (typeof ipcMain.removeHandler === 'function') {
            handlers.forEach(function (channel) { ipcMain.removeHandler(channel); });
        }
    };
}

module.exports = {
    CHANNELS: CHANNELS,
    register: register
};
