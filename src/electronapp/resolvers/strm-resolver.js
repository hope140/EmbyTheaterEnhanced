(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./mount-resolver.js', './cd2-resolver.js', './path-rules.js'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./mount-resolver'), require('./cd2-resolver'), require('./path-rules'));
    } else {
        root.strmResolver = factory(root.mountResolver, root.cd2Resolver, root.strmPathRules);
    }
}(this, function (mountResolver, cd2Resolver, pathRules) {
    'use strict';

    var DEFAULT_TOTAL_BUDGET_MS = 750;
    var DEFAULT_ORDER = ['direct-url', 'cd2-http', 'mount', 'native'];
    var MOUNT_FIRST_ORDER = ['mount', 'direct-url', 'cd2-http', 'native'];

    function isObject(value) {
        return value !== null && typeof value === 'object';
    }

    function normalizeContext(options) {
        var item = options && isObject(options.item) ? options.item : null;
        var mediaSource = options && isObject(options.mediaSource) ? options.mediaSource : null;
        var streamInfo = options && options.streamInfo ? options.streamInfo : options;

        return {
            item: item,
            mediaSource: mediaSource,
            streamInfo: streamInfo,
            sidecarPath: options && options.sidecarPath !== undefined
                ? options.sidecarPath
                : item && item.Path,
            sourcePath: options && options.sourcePath !== undefined
                ? options.sourcePath
                : mediaSource && mediaSource.Path,
            nativeSource: options && options.nativeSource !== undefined
                ? options.nativeSource
                : options && options.url,
            playMethod: options && options.playMethod !== undefined
                ? options.playMethod
                : streamInfo && streamInfo.playMethod
        };
    }

    function readField(object, name) {
        try {
            return object && object[name];
        } catch (err) {
            return undefined;
        }
    }

    function typeName(value) {
        return value === null ? 'null' : typeof value;
    }

    function hasText(value) {
        return typeof value === 'string' && value.length > 0;
    }

    function safeText(value) {
        return typeof value === 'string' ? value.slice(0, 128) : null;
    }

    function extensionOf(value) {
        var source;
        var lastSlash;
        var baseName;
        var dot;

        if (!hasText(value)) return null;
        source = value.split(/[?#]/)[0];
        lastSlash = Math.max(source.lastIndexOf('/'), source.lastIndexOf('\\'));
        baseName = source.substring(lastSlash + 1);
        dot = baseName.lastIndexOf('.');
        return dot > 0 ? baseName.substring(dot).toLowerCase() : null;
    }

    function protocolOf(value) {
        var parsed;

        if (!hasText(value) || !/^https?:\/\//i.test(value)) return null;
        try {
            parsed = new URL(value);
            return parsed.protocol.slice(0, -1).toLowerCase();
        } catch (err) {
            return null;
        }
    }

    function normalizeProtocol(value) {
        var text = safeText(value);
        if (!text) return null;
        text = text.toLowerCase();
        return text.charAt(text.length - 1) === ':' ? text.slice(0, -1) : text;
    }

    function hasAnyText(objects, names) {
        var objectIndex;
        var nameIndex;

        for (objectIndex = 0; objectIndex < objects.length; objectIndex++) {
            for (nameIndex = 0; nameIndex < names.length; nameIndex++) {
                if (hasText(readField(objects[objectIndex], names[nameIndex]))) return true;
            }
        }
        return false;
    }

    function describeContext(options) {
        var context = normalizeContext(options || {});
        var item = context.item;
        var mediaSource = context.mediaSource;
        var streamInfo = context.streamInfo || {};
        var itemPath = context.sidecarPath;
        var mediaSourcePath = context.sourcePath;
        var nativeSource = context.nativeSource;
        var container = readField(mediaSource, 'Container');
        var mediaSourceProtocol = normalizeProtocol(readField(mediaSource, 'Protocol')) || protocolOf(mediaSourcePath);

        return {
            itemPresent: !!item,
            mediaSourcePresent: !!mediaSource,
            itemPathPresent: hasText(itemPath),
            itemPathType: typeName(itemPath),
            itemPathEndsWithStrm: hasText(itemPath) && /\.strm$/i.test(itemPath),
            itemPathExtension: extensionOf(itemPath),
            mediaSourcePathPresent: hasText(mediaSourcePath),
            mediaSourcePathType: typeName(mediaSourcePath),
            mediaSourcePathExtension: extensionOf(mediaSourcePath),
            mediaSourceContainer: safeText(container),
            nativeSourcePresent: hasText(nativeSource),
            nativeSourceType: typeName(nativeSource),
            playMethod: safeText(context.playMethod),
            itemMediaType: safeText(readField(item, 'MediaType')),
            itemType: safeText(readField(item, 'Type')),
            mediaSourceProtocol: mediaSourceProtocol,
            mediaSourceType: safeText(readField(mediaSource, 'Type')),
            directStreamUrlPresent: hasAnyText([streamInfo, mediaSource], ['directStreamUrl', 'DirectStreamUrl']),
            transcodingUrlPresent: hasAnyText([streamInfo, mediaSource], ['transcodingUrl', 'TranscodingUrl'])
        };
    }

    function diagnoseContext(options) {
        var context = normalizeContext(options || {});
        var missingFields = [];

        if (!context.item) missingFields.push('item');
        if (!context.mediaSource) missingFields.push('mediaSource');
        if (!hasText(context.sidecarPath)) missingFields.push('sidecarPath');
        if (!hasText(context.sourcePath)) missingFields.push('sourcePath');
        if (!hasText(context.nativeSource)) missingFields.push('nativeSource');

        return {
            missingFields: missingFields,
            isStrmDetected: isStrm(context),
            playMethod: safeText(context.playMethod),
            mediaSourceContainer: safeText(readField(context.mediaSource, 'Container'))
        };
    }

    function isStrm(options) {
        try {
            var context = options && options.item !== undefined
                ? normalizeContext(options)
                : options || {};
            var itemPath = context.sidecarPath;
            var container = context.mediaSource && context.mediaSource.Container;

            return (
                typeof itemPath === 'string' && itemPath.toLowerCase().endsWith('.strm')
            ) || String(container || '').toLowerCase() === 'strm';
        } catch (err) {
            return false;
        }
    }

    function nativeResult(nativeSource, reason, detected) {
        return {
            type: 'native',
            source: nativeSource,
            reason: reason,
            isStrm: detected === true,
            localExists: false,
            fallback: true
        };
    }

    function prepare(options) {
        var context = normalizeContext(options || {});
        var detected = isStrm(context);
        var playMethod;

        if (!context.item || !context.mediaSource ||
            typeof context.sidecarPath !== 'string' || !context.sidecarPath ||
            typeof context.sourcePath !== 'string' || !context.sourcePath ||
            typeof context.nativeSource !== 'string' || !context.nativeSource) {
            return {context: context, result: nativeResult(context.nativeSource, 'invalid_context', detected)};
        }

        if (!detected) {
            return {context: context, result: nativeResult(context.nativeSource, 'not_strm', false)};
        }

        playMethod = typeof context.playMethod === 'string' ? context.playMethod.toLowerCase() : '';
        if (playMethod === 'transcode') {
            return {context: context, result: nativeResult(context.nativeSource, 'transcode_skip', true)};
        }

        if (playMethod !== 'directplay' && playMethod !== 'directstream') {
            return {context: context, result: nativeResult(context.nativeSource, 'unsupported_play_method', true)};
        }

        return {context: context, result: null};
    }

    function hasPersistentConfig(config) {
        return isObject(config) && Number(config.version) === 1 && Array.isArray(config.rules);
    }

    function selectRule(context, config) {
        var sourcePath = context && context.sourcePath;
        var sourcePrefix = pathRules.normalizeMappingPrefix(sourcePath);
        var values = sourcePrefix ? [sourcePath] : [context && context.sidecarPath];
        var best = null;
        var bestLength = -1;
        var bestValueIndex = values.length;

        if (!hasPersistentConfig(config)) return null;
        config.rules.forEach(function (rule, ruleIndex) {
            var prefix;
            var valueIndex;
            if (!rule || rule.enabled === false || rule.originState === 'DISABLED') return;
            prefix = pathRules.normalizeMappingPrefix(rule.sourcePrefix);
            if (!prefix) return;
            for (valueIndex = 0; valueIndex < values.length; valueIndex++) {
                if (!pathRules.prefixMatches(values[valueIndex], prefix)) continue;
                if (!best || prefix.length > bestLength ||
                    (prefix.length === bestLength && valueIndex < bestValueIndex) ||
                    (prefix.length === bestLength && valueIndex === bestValueIndex && ruleIndex < best.index)) {
                    best = {rule: rule, index: ruleIndex};
                    bestLength = prefix.length;
                    bestValueIndex = valueIndex;
                }
                break;
            }
        });
        return best && best.rule;
    }

    function orderForRule(rule) {
        if (!rule || rule.strategy === 'cloud-first') return DEFAULT_ORDER.slice();
        if (rule.strategy === 'mount-first') return MOUNT_FIRST_ORDER.slice();
        if (rule.strategy === 'custom' && Array.isArray(rule.order) && rule.order.length === 4) {
            return rule.order.slice();
        }
        return DEFAULT_ORDER.slice();
    }

    function routeForResult(result) {
        var sourceKind = result && result.sourceKind;
        var type = result && result.type;
        if (sourceKind === 'direct-url') return 'direct-url';
        if (type === 'url' && sourceKind === 'cd2-url') return 'cd2-http';
        if (type === 'local' && result.reason === 'mount_hit') return 'mount';
        if (type === 'native') return 'native';
        return 'unknown';
    }

    function persistentNativeResult(context, reason, rule, cd2Reason) {
        var result = nativeResult(context.nativeSource, reason, true);
        if (rule && rule.id) result.ruleId = rule.id;
        if (cd2Reason) result.cd2Reason = cd2Reason;
        return result;
    }

    function resolve(options, dependencies) {
        var prepared = prepare(options);
        var context = prepared.context;
        var config = dependencies && dependencies.config;
        var rule;
        var result;

        if (prepared.result) return prepared.result;

        if (hasPersistentConfig(config)) {
            if (config.enabled === false) return persistentNativeResult(context, 'resolver_disabled');
            rule = selectRule(context, config);
            if (!rule) return persistentNativeResult(context, 'no_matching_rule');
            try {
                result = mountResolver.resolve(context, Object.assign({}, dependencies || {}, {rule: rule}));
                result.isStrm = true;
                result.ruleId = rule.id;
                return result;
            } catch (err) {
                return persistentNativeResult(context, 'native_fallback', rule);
            }
        }

        try {
            result = mountResolver.resolve(context, dependencies);
            result.isStrm = true;
            return result;
        } catch (err) {
            return nativeResult(context.nativeSource, 'native_fallback', true);
        }
    }

    async function resolveAsync(options, dependencies) {
        var prepared = prepare(options);
        var context = prepared.context;
        var config = dependencies && dependencies.config;
        var rule;
        var order;
        var deadlineAt;
        var now;
        var candidates;
        var cd2Reason;
        var result;

        if (prepared.result) return prepared.result;

        if (hasPersistentConfig(config)) {
            if (config.enabled === false) return persistentNativeResult(context, 'resolver_disabled');
            rule = selectRule(context, config);
            if (!rule) return persistentNativeResult(context, 'no_matching_rule');
            order = orderForRule(rule);
            now = dependencies && typeof dependencies.now === 'function' ? dependencies.now : Date.now;
            deadlineAt = now() + DEFAULT_TOTAL_BUDGET_MS;

            try {
                for (var stageIndex = 0; stageIndex < order.length; stageIndex++) {
                    var stage = order[stageIndex];
                    if (stage === 'native') return persistentNativeResult(context, 'native_fallback', rule, cd2Reason);
                    if (stage === 'mount') {
                        result = mountResolver.resolve(context, Object.assign({}, dependencies || {}, {rule: rule}));
                        if (result && result.type === 'local') {
                            result.isStrm = true;
                            result.ruleId = rule.id;
                            return result;
                        }
                        continue;
                    }
                    if (stage === 'direct-url' || stage === 'cd2-http') {
                        if (!candidates) candidates = mountResolver.getCandidates(context, dependencies);
                        if (!candidates.length) continue;
                        result = await cd2Resolver.resolve(context, {
                            cd2Transport: dependencies && dependencies.cd2Transport,
                            requestId: dependencies && dependencies.requestId,
                            signal: dependencies && dependencies.signal,
                            candidates: candidates,
                            ruleId: rule.id,
                            mode: stage === 'direct-url' ? 'direct' : 'same-origin',
                            deadlineAt: deadlineAt
                        });
                        if (result && result.type === 'url') {
                            result.isStrm = true;
                            result.localExists = false;
                            result.ruleId = rule.id;
                            return result;
                        }
                        cd2Reason = result && result.reason;
                    }
                }
                return persistentNativeResult(context, 'native_fallback', rule, cd2Reason);
            } catch (error) {
                if (error && error.name === 'AbortError') throw error;
                return persistentNativeResult(context, 'native_fallback', rule, cd2Reason);
            }
        }

        try {
            candidates = mountResolver.getCandidates(context, dependencies);
            if (candidates.length) {
                result = await cd2Resolver.resolve(context, {
                    cd2Transport: dependencies && dependencies.cd2Transport,
                    requestId: dependencies && dependencies.requestId,
                    signal: dependencies && dependencies.signal,
                    candidates: candidates
                });
                if (result && result.type === 'url') {
                    result.isStrm = true;
                    result.localExists = false;
                    return result;
                }
                cd2Reason = result && result.reason;
            }

            result = mountResolver.resolve(context, dependencies);
            result.isStrm = true;
            if (cd2Reason) result.cd2Reason = cd2Reason;
            return result;
        } catch (error) {
            if (error && error.name === 'AbortError') throw error;
            return nativeResult(context.nativeSource, 'native_fallback', true);
        }
    }

    return {
        isStrm: isStrm,
        describeContext: describeContext,
        diagnoseContext: diagnoseContext,
        selectRule: selectRule,
        orderForRule: orderForRule,
        routeForResult: routeForResult,
        resolve: resolve,
        resolveAsync: resolveAsync,
        resolveStrm: resolve
    };
}));
