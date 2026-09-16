(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.playbackRouteStats = factory();
    }
}(this, function () {
    'use strict';

    function routeForObservation(observation) {
        if (observation && observation.route === 'direct-url') return 'direct-url';
        if (observation && observation.route === 'cd2-http') return 'cd2-http';
        if (observation && observation.route === 'mount') return 'mount';
        return 'native';
    }

    function reasonText(reason) {
        var value = typeof reason === 'string' ? reason : '';
        if (!value) return '未知';
        if (value.indexOf('timeout') >= 0) return '超时';
        if (value.indexOf('cancel') >= 0) return '已取消';
        if (value.indexOf('error') >= 0) return '错误';
        if (value.indexOf('unavailable') >= 0 || value.indexOf('disabled') >= 0) return '未使用';
        if (value.indexOf('miss') >= 0 || value.indexOf('missing') >= 0 || value.indexOf('not_found') >= 0) return '未命中';
        return value;
    }

    function makeStats(observation) {
        var route = routeForObservation(observation);
        var isStrm = observation && observation.isStrm === true;
        var stats = [
            {label: '播放源:', value: route === 'direct-url' ? 'CD2 DirectUrl' : route === 'cd2-http' ? 'CD2 HTTP' : route === 'mount' ? '本地挂载' : 'Emby 原生'},
            {label: 'STRM:', value: isStrm ? '是' : '否'}
        ];

        if (isStrm) {
            stats.push({label: 'CD2:', value: (route === 'direct-url' || route === 'cd2-http') ? '命中' : reasonText(observation && observation.cd2Reason)});
            stats.push({label: 'Mount:', value: route === 'mount' ? '命中' : (route === 'direct-url' || route === 'cd2-http') ? '未使用' : observation && observation.reason === 'native_fallback' ? '未命中' : '未使用'});
            stats.push({label: 'Fallback:', value: route === 'native' ? '是' : '否'});
            if (observation && typeof observation.ruleId === 'string' && observation.ruleId) {
                stats.push({label: '规则 ID:', value: observation.ruleId});
            }
        }

        return {type: 'enhanced', name: 'Emby Theater Enhanced', stats: stats};
    }

    function create() {
        var activeRequest = null;
        var observation = null;

        return {
            begin: function (request) {
                activeRequest = request || null;
                observation = null;
            },
            commit: function (request, value) {
                if (!request || activeRequest !== request || !value || typeof value !== 'object') return false;
                observation = {
                    requestId: typeof value.requestId === 'string' ? value.requestId : null,
                    isStrm: value.isStrm === true,
                    route: routeForObservation(value),
                    reason: typeof value.reason === 'string' ? value.reason : null,
                    sourceKind: typeof value.sourceKind === 'string' ? value.sourceKind : null,
                    ruleId: typeof value.ruleId === 'string' ? value.ruleId : null,
                    cd2Reason: typeof value.cd2Reason === 'string' ? value.cd2Reason : null,
                    directReason: typeof value.directReason === 'string' ? value.directReason : null,
                    localExists: value.localExists === true,
                    fallback: value.fallback === true
                };
                return true;
            },
            clear: function () {
                activeRequest = null;
                observation = null;
            },
            category: function () {
                return observation ? makeStats(observation) : null;
            }
        };
    }

    return {create: create, makeStats: makeStats};
}));
