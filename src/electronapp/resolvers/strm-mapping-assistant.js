(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['./path-rules.js'], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./path-rules'));
    } else {
        root.strmMappingAssistant = factory(root.strmPathRules);
    }
}(this, function (pathRules) {
    'use strict';

    var COLLISION = Object.freeze({
        NONE: 'NONE',
        DUPLICATE: 'DUPLICATE',
        CONFLICT: 'CONFLICT'
    });

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function equivalentSourcePrefix(left, right) {
        var normalizedLeft = pathRules.normalizeMappingPrefix(left);
        var normalizedRight = pathRules.normalizeMappingPrefix(right);
        if (!normalizedLeft || !normalizedRight || pathRules.kind(normalizedLeft) !== pathRules.kind(normalizedRight)) {
            return false;
        }
        return pathRules.prefixMatches(normalizedLeft, normalizedRight) &&
            pathRules.prefixMatches(normalizedRight, normalizedLeft);
    }

    function equivalentCloudPrefix(left, right) {
        var normalizedLeft = pathRules.normalizeCloudPrefix(left);
        var normalizedRight = pathRules.normalizeCloudPrefix(right);
        return !!normalizedLeft && !!normalizedRight && normalizedLeft === normalizedRight;
    }

    function classifyCollision(preview, rules) {
        var conflict = false;
        if (!isObject(preview) || typeof preview.sourcePrefix !== 'string' || typeof preview.cloudPrefix !== 'string') {
            return COLLISION.NONE;
        }
        (Array.isArray(rules) ? rules : []).forEach(function (rule) {
            if (!rule || !equivalentSourcePrefix(preview.sourcePrefix, rule.sourcePrefix)) return;
            if (equivalentCloudPrefix(preview.cloudPrefix, rule.cloudPrefix)) {
                conflict = COLLISION.DUPLICATE;
            } else if (conflict !== COLLISION.DUPLICATE) {
                conflict = COLLISION.CONFLICT;
            }
        });
        return conflict || COLLISION.NONE;
    }

    function isHighMatch(preview) {
        return !!preview && preview.status === 'MATCHED' && preview.confidence === 'HIGH' &&
            typeof preview.sourcePrefix === 'string' && !!preview.sourcePrefix &&
            typeof preview.cloudPrefix === 'string' && !!preview.cloudPrefix;
    }

    function evaluatePreview(preview, rules) {
        var eligible = isHighMatch(preview);
        var collision = eligible ? classifyCollision(preview, rules) : COLLISION.NONE;
        return {
            canAdd: eligible && collision === COLLISION.NONE,
            collision: collision
        };
    }

    function createDraftRule(preview, id) {
        if (!isHighMatch(preview) || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
        return {
            id: id,
            sourcePrefix: preview.sourcePrefix,
            mountPrefix: typeof preview.mountPrefix === 'string' ? preview.mountPrefix : '',
            cloudPrefix: preview.cloudPrefix,
            storageType: 'cloud-mount',
            strategy: 'cloud-first',
            order: ['direct-url', 'cd2-http', 'mount', 'native'],
            originState: 'USER',
            enabled: true
        };
    }

    function addDraftRule(rules, preview, id) {
        var current = Array.isArray(rules) ? rules.slice() : [];
        var evaluation = evaluatePreview(preview, current);
        var rule;
        if (!isHighMatch(preview)) {
            return {status: 'ineligible', rules: current, addedRule: null};
        }
        if (evaluation.collision === COLLISION.DUPLICATE) {
            return {status: 'duplicate', rules: current, addedRule: null};
        }
        if (evaluation.collision === COLLISION.CONFLICT) {
            return {status: 'conflict', rules: current, addedRule: null};
        }
        rule = createDraftRule(preview, id);
        if (!rule) return {status: 'ineligible', rules: current, addedRule: null};
        current.push(rule);
        return {status: 'added', rules: current, addedRule: rule};
    }

    function removeDraftRule(rules, id) {
        return (Array.isArray(rules) ? rules : []).filter(function (rule) {
            return !rule || rule.id !== id;
        });
    }

    function diagnosticRecord(event, preview) {
        var value = isObject(preview) ? preview : {};
        if (event === 'smart-path-mapping-accepted') {
            return {
                schemaVersion: 1,
                level: 'info',
                category: 'resolver',
                event: event,
                details: {
                    confidence: value.confidence || 'LOW',
                    matchedSuffixSegments: Number.isSafeInteger(value.matchedSuffixSegments)
                        ? value.matchedSuffixSegments
                        : 0
                }
            };
        }
        return {
            schemaVersion: 1,
            level: value.status === 'MATCHED' ? 'info' : 'warn',
            category: 'resolver',
            event: 'smart-path-mapping-preview',
            details: {
                status: value.status || 'UNSAFE',
                confidence: value.confidence || 'LOW',
                matchedSuffixSegments: Number.isSafeInteger(value.matchedSuffixSegments)
                    ? value.matchedSuffixSegments
                    : 0,
                reason: typeof value.reason === 'string' ? value.reason : 'invalid_result'
            }
        };
    }

    return {
        COLLISION: COLLISION,
        addDraftRule: addDraftRule,
        classifyCollision: classifyCollision,
        createDraftRule: createDraftRule,
        diagnosticRecord: diagnosticRecord,
        evaluatePreview: evaluatePreview,
        isHighMatch: isHighMatch,
        removeDraftRule: removeDraftRule
    };
}));
