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
        var suggestion = preview && preview.suggestion ? preview.suggestion : preview;
        if (!isObject(suggestion) || typeof suggestion.sourcePrefix !== 'string' || typeof suggestion.cloudPrefix !== 'string') {
            return COLLISION.NONE;
        }
        (Array.isArray(rules) ? rules : []).forEach(function (rule) {
            if (!rule || !equivalentSourcePrefix(suggestion.sourcePrefix, rule.sourcePrefix)) return;
            if (equivalentCloudPrefix(suggestion.cloudPrefix, rule.cloudPrefix)) {
                conflict = COLLISION.DUPLICATE;
            } else if (conflict !== COLLISION.DUPLICATE) {
                conflict = COLLISION.CONFLICT;
            }
        });
        return conflict || COLLISION.NONE;
    }

    function isHighMatch(preview) {
        var suggestion = preview && preview.suggestion;
        return !!preview && preview.coverage && preview.coverage.status === 'NOT_COVERED' &&
            preview.fileMatch && preview.fileMatch.status === 'MATCHED' &&
            preview.fileMatch.confidence === 'HIGH' && preview.boundary &&
            preview.boundary.status === 'MATCHED' && preview.boundary.confidence === 'HIGH' &&
            suggestion && typeof suggestion.sourcePrefix === 'string' && !!suggestion.sourcePrefix &&
            typeof suggestion.cloudPrefix === 'string' && !!suggestion.cloudPrefix;
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
        var suggestion = preview.suggestion;
        return {
            id: id,
            sourcePrefix: suggestion.sourcePrefix,
            mountPrefix: typeof suggestion.mountPrefix === 'string' ? suggestion.mountPrefix : '',
            cloudPrefix: suggestion.cloudPrefix,
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
        var fileMatch = isObject(value.fileMatch) ? value.fileMatch : {};
        var boundary = isObject(value.boundary) ? value.boundary : {};
        var coverage = isObject(value.coverage) ? value.coverage : {};
        if (event === 'smart-path-mapping-accepted') {
            return {
                schemaVersion: 1,
                level: 'info',
                category: 'resolver',
                event: event,
                details: {
                    boundaryConfidence: boundary.confidence || 'LOW',
                    matchedSuffixSegments: Number.isSafeInteger(fileMatch.matchedSuffixSegments)
                        ? fileMatch.matchedSuffixSegments : 0
                }
            };
        }
        return {
            schemaVersion: 1,
            level: boundary.status === 'MATCHED' || coverage.status === 'FULLY_COVERED' ? 'info' : 'warn',
            category: 'resolver',
            event: 'smart-path-mapping-preview',
            details: {
                coverageStatus: coverage.status || 'NOT_COVERED',
                fileMatchConfidence: fileMatch.confidence || 'LOW',
                boundaryStatus: boundary.status || 'UNRESOLVED',
                boundaryConfidence: boundary.confidence || 'LOW',
                matchedSuffixSegments: Number.isSafeInteger(fileMatch.matchedSuffixSegments)
                    ? fileMatch.matchedSuffixSegments : 0,
                reason: typeof boundary.reason === 'string' ? boundary.reason : 'invalid_result'
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
