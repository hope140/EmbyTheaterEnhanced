(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./mount-resolver.js', './cd2-resolver.js', './path-rules.js', './smart-path-mapping.js'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./mount-resolver'), require('./cd2-resolver'), require('./path-rules'), require('./smart-path-mapping'));
    } else {
        root.strmResolver = factory(root.mountResolver, root.cd2Resolver, root.strmPathRules, root.smartPathMapping);
    }
}(this, function (mountResolver, cd2Resolver, pathRules, smartPathMapping) {
    'use strict';

    var DEFAULT_TOTAL_BUDGET_MS = 1200;
    var REFRESH_RECOVERY_BUDGET_MS = 1800;
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
            fallback: reason === 'native_fallback' || reason === 'invalid_context'
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

    function previewSmartPathMapping(options, dependencies) {
        var result = smartPathMapping.inferSmartPathMapping(options || {});
        var diagnostic = smartPathMapping.diagnosticRecord(result);
        try {
            if (dependencies && typeof dependencies.onDiagnostic === 'function') {
                var pending = dependencies.onDiagnostic(diagnostic);
                if (pending && typeof pending.catch === 'function') pending.catch(function () {});
            }
        } catch (_) { /* Dry-run observability is fail-open. */ }
        return result;
    }

    function persistentNativeResult(context, reason, rule, cd2Reason, mountReason) {
        var result = nativeResult(context.nativeSource, reason, true);
        if (rule && rule.id) result.ruleId = rule.id;
        if (cd2Reason) result.cd2Reason = cd2Reason;
        if (mountReason) result.mountReason = mountReason;
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
                result.mountReason = result.reason;
                result.isStrm = true;
                result.ruleId = rule.id;
                return result;
            } catch (err) {
                return persistentNativeResult(context, 'native_fallback', rule);
            }
        }

        try {
            result = mountResolver.resolve(context, dependencies);
            result.mountReason = result.reason;
            result.isStrm = true;
            return result;
        } catch (err) {
            return nativeResult(context.nativeSource, 'native_fallback', true);
        }
    }

    async function resolveAsync(options, dependencies, sequence) {
        var prepared = prepare(options);
        var context = prepared.context;
        var config = dependencies && dependencies.config;
        var rule;
        var order;
        var deadlineAt;
        var now;
        var candidates;
        var history = sequence ? sequence.history : {};
        var cd2Reason = history.cd2Reason;
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
                for (var stageIndex = sequence ? sequence.index : 0; stageIndex < order.length; stageIndex++) {
                    if (sequence) sequence.index = stageIndex + 1;
                    var stage = order[stageIndex];
                    if (sequence) {
                        if (sequence.seen[stage]) continue;
                        sequence.seen[stage] = true;
                    }
                    // Reaching native first is a policy choice. Later positions mean
                    // earlier stages missed or a delivered source failed to load.
                    if (stage === 'native') {
                        if (sequence) sequence.nativeTried = true;
                        return persistentNativeResult(context, stageIndex === 0 ? 'native_selected' : 'native_fallback', rule, cd2Reason, history.mountReason);
                    }
                    if (stage === 'mount') {
                        history.mountReason = 'mount_error';
                        result = mountResolver.resolve(context, Object.assign({}, dependencies || {}, {rule: rule}));
                        history.mountReason = result && result.reason || 'mount_error';
                        if (result) result.mountReason = history.mountReason;
                        if (result && result.type === 'local') {
                            result.isStrm = true;
                            result.ruleId = rule.id;
                            if (cd2Reason) result.cd2Reason = cd2Reason;
                            return result;
                        }
                        continue;
                    }
                    if (stage === 'direct-url' || stage === 'cd2-http') {
                        if (!candidates) candidates = mountResolver.getCandidates(context, dependencies);
                        if (!candidates.length) continue;
                        result = await cd2Resolver.resolve(context, {
                            cd2Transport: dependencies && dependencies.cd2Transport,
                            configLease: dependencies && dependencies.configLease,
                            requestId: dependencies && dependencies.requestId,
                            signal: dependencies && dependencies.signal,
                            candidates: candidates,
                            ruleId: rule.id,
                            mode: stage === 'direct-url' ? 'direct' : 'same-origin',
                            deadlineAt: deadlineAt,
                            refreshDeadlineAt: deadlineAt + REFRESH_RECOVERY_BUDGET_MS
                        });
                        history.cd2Reason = cd2Reason = result && result.reason;
                        if (result && result.type === 'url') {
                            if (history.mountReason) result.mountReason = history.mountReason;
                            result.isStrm = true;
                            result.localExists = false;
                            result.ruleId = rule.id;
                            return result;
                        }
                    }
                }
                if (sequence && sequence.nativeTried) return null;
                if (sequence) sequence.nativeTried = true;
                return persistentNativeResult(context, 'native_fallback', rule, cd2Reason, history.mountReason);
            } catch (error) {
                if (error && error.name === 'AbortError') throw error;
                if (sequence) {
                    sequence.index = order.length;
                    if (sequence.nativeTried) return null;
                    sequence.nativeTried = true;
                }
                return persistentNativeResult(context, 'native_fallback', rule, cd2Reason, history.mountReason);
            }
        }

        try {
            candidates = mountResolver.getCandidates(context, dependencies);
            if (candidates.length) {
                result = await cd2Resolver.resolve(context, {
                    cd2Transport: dependencies && dependencies.cd2Transport,
                    configLease: dependencies && dependencies.configLease,
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
            result.mountReason = result.reason;
            result.isStrm = true;
            if (cd2Reason) result.cd2Reason = cd2Reason;
            return result;
        } catch (error) {
            if (error && error.name === 'AbortError') throw error;
            return nativeResult(context.nativeSource, 'native_fallback', true);
        }
    }

    // One cursor per upper Play. Consumed misses and delivered sources are never revisited.
    // Each resolver pass shares the existing absolute CD2 budget; the player bounds all passes and media loads.
    function createSequence(options, dependencies) {
        var prepared = prepare(options);
        var config = dependencies && dependencies.config;
        if (prepared.result || !hasPersistentConfig(config) || config.enabled === false ||
            !selectRule(prepared.context, config)) return null;
        var snapshot = Object.assign({}, dependencies, {config: JSON.parse(JSON.stringify(config))});
        var state = {index: 0, nativeTried: false, history: {}, seen: Object.create(null)};
        var closed = false;
        var busy = false;
        return {
            next: async function () {
                if (busy) throw new Error('resolver-sequence-busy');
                if (closed) return null;
                if (snapshot.signal && snapshot.signal.aborted) {
                    var error = new Error('Playback cancelled'); error.name = 'AbortError'; throw error;
                }
                busy = true;
                try {
                    var result = await resolveAsync(prepared.context, snapshot, state);
                    if (snapshot.signal && snapshot.signal.aborted) {
                        var cancelled = new Error('Playback cancelled'); cancelled.name = 'AbortError'; throw cancelled;
                    }
                    if (!result || state.nativeTried && state.index >= orderForRule(selectRule(prepared.context, snapshot.config)).length) closed = true;
                    return result;
                } finally { busy = false; }
            }
        };
    }

    return {
        isStrm: isStrm,
        describeContext: describeContext,
        diagnoseContext: diagnoseContext,
        selectRule: selectRule,
        orderForRule: orderForRule,
        previewSmartPathMapping: previewSmartPathMapping,
        routeForResult: routeForResult,
        resolve: resolve,
        resolveAsync: resolveAsync,
        createSequence: createSequence,
        resolveStrm: resolve
    };
}));
