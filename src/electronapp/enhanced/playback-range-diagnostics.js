(function (factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';
    var stages = ['configuration', 'current-context', 'current-probe', 'next-metadata', 'next-context', 'next-probe', 'next-prefix', 'progress-check', 'lifecycle'];
    var labels = {
        disabled: '预载未启用', 'context-missing': '播放上下文不可用', 'identity-missing': '播放身份不可用',
        'media-unsupported': '媒体类型不支持', 'container-unsupported': '媒体容器不支持', 'mode-unsupported': '播放方式不支持', 'live-unsupported': '直播不支持预载',
        'source-invalid': '来源地址无效', 'source-not-http': '来源不是 HTTP', 'source-cross-origin': '来源与 Emby 不同源', 'source-credentials': '来源包含地址凭据',
        'current-proxy-required': '当前播放未建立预载代理', 'file-options-unproxied': '当前来源使用独立播放选项',
        'generation-retired': '播放请求已结束', 'request-cancelled': '预载请求已取消', 'no-next-episode': '队列中暂无下一集', 'waiting-progress': '等待播放进度',
        'metadata-auth': '下一集信息需要认证', 'metadata-redirect': '下一集信息发生重定向', 'metadata-http-status': '下一集信息请求失败',
        'metadata-size': '下一集信息超过大小限制', 'metadata-json': '下一集信息格式无效', 'metadata-shape': '下一集信息不完整', 'metadata-origin': '下一集信息来源不同源',
        'next-identity': '下一集身份不匹配', 'source-count': '下一集媒体来源数量不支持', 'directstream-required': '下一集不支持直接串流',
        redirect: '媒体请求发生重定向', 'auth-required': '媒体来源需要认证', 'status-not-206': '来源未返回部分内容',
        'range-invalid': '来源返回的字节范围无效', 'etag-missing': '来源未提供 ETag', 'etag-weak': '来源只提供弱 ETag', 'etag-invalid': '来源 ETag 无效',
        'length-mismatch': '来源内容长度不匹配', 'encoding-unsupported': '来源内容编码不支持', 'validator-changed': '来源校验标记已变化', 'representation-changed': '来源内容大小已变化',
        'body-invalid': '来源响应内容不完整', 'response-interrupted': '来源响应中断', 'network-failed': '来源网络请求失败', timeout: '预载请求超时',
        'cache-unavailable': '预载缓存不可用', 'cache-quota': '预载缓存空间不足', 'cache-io': '预载缓存读写失败', 'proxy-unavailable': '预载代理不可用', unexpected: '预载暂不可用'
    };
    var legacy = {
        'range-cancelled': 'request-cancelled', 'range-next-retired': 'generation-retired',
        'range-request-invalid': 'source-invalid', 'range-response-invalid': 'range-invalid', 'range-body-invalid': 'body-invalid',
        'range-response-interrupted': 'response-interrupted', 'range-network-failed': 'network-failed', 'range-timeout': 'timeout',
        'range-cache-unavailable': 'cache-unavailable', 'range-quota': 'cache-quota',
        'range-metadata-origin': 'metadata-origin', 'range-metadata-denied': 'metadata-http-status', 'range-metadata-limit': 'metadata-size',
        'stale-generation': 'generation-retired', 'stale-endpoint': 'generation-retired', 'generation-superseded': 'generation-retired'
    };
    function knownReason(value) {return typeof value === 'string' && Object.prototype.hasOwnProperty.call(labels, value);}
    function snapshot(value) {
        value = value || {};
        var result = {stage: stages.indexOf(value.stage) >= 0 ? value.stage : 'lifecycle', reason: knownReason(value.reason) ? value.reason : 'unexpected'};
        if (Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599) result.httpStatus = value.httpStatus;
        return result;
    }
    function diagnosticError(reason, legacyMessage, httpStatus) {
        var record = snapshot({reason: reason, httpStatus: httpStatus}), result = Error(legacyMessage);
        result.preloadReason = record.reason;
        if (record.httpStatus !== undefined) result.httpStatus = record.httpStatus;
        return result;
    }
    function fromError(error, stage, fallback) {
        var reason = knownReason(fallback) ? fallback : 'unexpected', httpStatus;
        try {
            if (error && knownReason(error.preloadReason)) reason = error.preloadReason;
            else if (error && typeof error.message === 'string' && Object.prototype.hasOwnProperty.call(legacy, error.message)) reason = legacy[error.message];
            if (error) httpStatus = error.httpStatus;
        } catch (_) { /* Unknown error objects never supply diagnostic text. */ }
        return snapshot({stage: stage, reason: reason, httpStatus: httpStatus});
    }
    function text(value) {
        var record = snapshot(value);
        return labels[record.reason] + ' [' + record.stage + '/' + record.reason + ']';
    }
    return {snapshot: snapshot, error: diagnosticError, fromError: fromError, text: text};
}));
