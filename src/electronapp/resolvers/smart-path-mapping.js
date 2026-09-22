(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.smartPathMapping = factory();
    }
}(this, function () {
    'use strict';

    var STATUS = Object.freeze({
        MATCHED: 'MATCHED',
        AMBIGUOUS: 'AMBIGUOUS',
        NO_MATCH: 'NO_MATCH',
        UNSAFE: 'UNSAFE'
    });
    var CONFIDENCE = Object.freeze({
        HIGH: 'HIGH',
        MEDIUM: 'MEDIUM',
        LOW: 'LOW'
    });

    function hasControlCharacter(value) {
        return /[\u0000-\u001f\u007f]/.test(value);
    }

    function invalidPath(reason) {
        return {path: null, reason: reason};
    }

    function validateSegments(segments) {
        var index;
        for (index = 0; index < segments.length; index++) {
            if (!segments[index]) return 'empty_segment';
            if (segments[index] === '.' || segments[index] === '..') return 'path_traversal';
        }
        return null;
    }

    function parseWindowsDrive(value, allowRoot) {
        var normalized = value.replace(/\//g, '\\');
        var root = normalized.slice(0, 2).toUpperCase() + '\\';
        var rest = normalized.slice(3);
        var segments;
        var segmentError;

        if (!/^[A-Za-z]:\\/.test(normalized)) return invalidPath('relative_path');
        if (!rest) return allowRoot
            ? {path: {kind: 'windows-drive', root: root, segments: [], normalized: root}, reason: null}
            : invalidPath('root_only');
        if (/\\$/.test(normalized)) return invalidPath('incomplete_path');
        if (/\\\\/.test(rest)) return invalidPath('empty_segment');
        segments = rest.split('\\');
        segmentError = validateSegments(segments);
        if (segmentError) return invalidPath(segmentError);
        return {
            path: {
                kind: 'windows-drive',
                root: root,
                segments: segments,
                normalized: root + segments.join('\\')
            },
            reason: null
        };
    }

    function parseUnc(value, allowRoot) {
        var normalized = value.replace(/\//g, '\\');
        var body;
        var parts;
        var root;
        var segments;
        var segmentError;

        if (!/^\\\\[^\\]/.test(normalized) || /^\\\\[?.]\\/.test(normalized)) return invalidPath('invalid_unc_root');
        body = normalized.slice(2);
        if (/\\\\/.test(body)) return invalidPath('empty_segment');
        if (/\\$/.test(normalized)) {
            if (!allowRoot) return invalidPath('incomplete_path');
            body = body.slice(0, -1);
        }
        parts = body.split('\\');
        if (parts.length < 2 || !parts[0] || !parts[1]) return invalidPath('invalid_unc_root');
        segmentError = validateSegments(parts);
        if (segmentError) return invalidPath(segmentError);
        root = '\\\\' + parts[0] + '\\' + parts[1] + '\\';
        segments = parts.slice(2);
        if (!segments.length && !allowRoot) return invalidPath('root_only');
        return {
            path: {
                kind: 'unc',
                root: root,
                rootSegments: parts.slice(0, 2),
                segments: segments,
                normalized: root + segments.join('\\')
            },
            reason: null
        };
    }

    function parsePosix(value, allowRoot) {
        var body;
        var segments;
        var segmentError;

        if (!/^\/(?!\/)/.test(value)) return invalidPath('relative_path');
        if (value.indexOf('\\') >= 0) return invalidPath('mixed_separator');
        if (value === '/') return allowRoot ? {path: {kind: 'posix', root: '/', segments: [], normalized: '/'}, reason: null} : invalidPath('root_only');
        if (/\/$/.test(value)) return invalidPath('incomplete_path');
        body = value.slice(1);
        if (/\/\//.test(body)) return invalidPath('empty_segment');
        segments = body.split('/');
        segmentError = validateSegments(segments);
        if (segmentError) return invalidPath(segmentError);
        return {
            path: {
                kind: 'posix',
                root: '/',
                segments: segments,
                normalized: '/' + segments.join('/')
            },
            reason: null
        };
    }

    function parsePath(value, allowRoot) {
        if (typeof value !== 'string' || !value) return invalidPath('empty_path');
        if (value !== value.trim()) return invalidPath('surrounding_whitespace');
        if (hasControlCharacter(value)) return invalidPath('control_character');
        if (/^[A-Za-z]:[\\/]/.test(value)) return parseWindowsDrive(value, allowRoot === true);
        if (/^(?:\\\\|\/\/)/.test(value)) return parseUnc(value, allowRoot === true);
        if (/^\//.test(value)) return parsePosix(value, allowRoot === true);
        return invalidPath('relative_path');
    }

    function caseRuleFor(path) {
        if (!path) return 'UNKNOWN';
        if (path.kind === 'posix') return 'POSIX_CASE_SENSITIVE';
        if (path.kind === 'unc') return 'UNC_CASE_INSENSITIVE';
        return 'WINDOWS_CASE_INSENSITIVE';
    }

    function segmentEquals(left, right, localKind) {
        if (localKind === 'posix') return left === right;
        return left.toLowerCase() === right.toLowerCase();
    }

    function sameRoot(left, right) {
        if (!left || !right || left.kind !== right.kind) return false;
        if (left.kind === 'posix') return true;
        if (left.kind === 'windows-drive') return left.root.toLowerCase() === right.root.toLowerCase();
        return left.root.toLowerCase() === right.root.toLowerCase();
    }

    function prefixMatches(path, prefix) {
        var index;
        if (!sameRoot(path, prefix) || prefix.segments.length > path.segments.length) return false;
        for (index = 0; index < prefix.segments.length; index++) {
            if (!segmentEquals(path.segments[index], prefix.segments[index], path.kind)) return false;
        }
        return true;
    }

    function buildPath(path, segments) {
        if (path.kind === 'posix') return segments.length ? '/' + segments.join('/') : '/';
        return path.root + segments.join('\\');
    }

    function buildCloudPath(prefix, suffix) {
        var segments = prefix.segments.concat(suffix);
        return segments.length ? '/' + segments.join('/') : '/';
    }

    function candidateKey(path) {
        return path.kind === 'posix' ? path.normalized : path.normalized.toLowerCase();
    }

    function normalizedCandidates(values, allowed) {
        var seen = Object.create(null);
        var candidates = [];
        var invalidReason = null;

        if (!Array.isArray(values)) return {candidates: [], invalidReason: 'invalid_candidates', inputCount: 0};
        values.forEach(function (value, index) {
            var parsed = parsePath(value, false);
            var key;
            if (!parsed.path || !allowed(parsed.path)) {
                if (!invalidReason) invalidReason = parsed.reason || 'invalid_candidate';
                return;
            }
            key = candidateKey(parsed.path);
            if (!seen[key]) {
                seen[key] = true;
                candidates.push({path: parsed.path, index: index});
            }
        });
        return {candidates: candidates, invalidReason: invalidReason, inputCount: values.length};
    }

    function suffixEvidence(localPath, cloudPath) {
        var localIndex = localPath.segments.length - 1;
        var cloudIndex = cloudPath.segments.length - 1;
        var matched = 0;
        while (localIndex >= 0 && cloudIndex >= 0 &&
            segmentEquals(localPath.segments[localIndex], cloudPath.segments[cloudIndex], localPath.kind)) {
            matched++;
            localIndex--;
            cloudIndex--;
        }
        return {
            matchedSuffixSegments: matched,
            matchedParentSegments: Math.max(0, matched - 1),
            filenameMatched: matched > 0
        };
    }

    function baseEvidence(localPath, candidateCount, reason) {
        return {
            matchedSuffixSegments: 0,
            matchedParentSegments: 0,
            filenameMatched: false,
            caseRules: caseRuleFor(localPath),
            candidateCount: candidateCount,
            validCandidateCount: 0,
            manualMappingMatched: false,
            manualConflict: false,
            reason: reason
        };
    }

    function makeResult(status, confidence, suggestion, evidence) {
        return {
            status: status,
            suggestion: suggestion || null,
            confidence: confidence,
            evidence: evidence
        };
    }

    function activeManualMappings(values) {
        if (values === undefined || values === null) return {mappings: [], invalid: false};
        if (!Array.isArray(values)) return {mappings: [], invalid: true};
        return {
            mappings: values.filter(function (value) {
                return value && typeof value === 'object' && value.enabled !== false && value.originState !== 'DISABLED';
            }),
            invalid: false
        };
    }

    function matchingManualMappings(localPath, mappings) {
        var matches = [];
        mappings.forEach(function (mapping, index) {
            var source = parsePath(mapping.sourcePrefix, true);
            var cloud = mapping.cloudPrefix == null || mapping.cloudPrefix === ''
                ? {path: null, reason: null}
                : parsePath(mapping.cloudPrefix, true);
            if (!source.path || !prefixMatches(localPath, source.path)) return;
            matches.push({
                mapping: mapping,
                index: index,
                source: source.path,
                cloud: cloud.path,
                invalidCloud: !!mapping.cloudPrefix && (!cloud.path || cloud.path.kind !== 'posix')
            });
        });
        if (!matches.length) return [];
        var longest = matches.reduce(function (length, match) {
            return Math.max(length, match.source.segments.length);
        }, -1);
        return matches.filter(function (match) { return match.source.segments.length === longest; });
    }

    function manualAuthority(localPath, manualMappings, cloudCandidates, candidateCount) {
        var active = activeManualMappings(manualMappings);
        var matches;
        var outputs = [];
        var conflict = false;
        var evidence;

        if (active.invalid) {
            evidence = baseEvidence(localPath, candidateCount, 'invalid_manual_mappings');
            return makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null, evidence);
        }
        matches = matchingManualMappings(localPath, active.mappings);
        if (!matches.length) return null;

        matches.forEach(function (match) {
            var suffix;
            var output;
            if (match.invalidCloud) {
                conflict = true;
                return;
            }
            if (!match.cloud) return;
            suffix = localPath.segments.slice(match.source.segments.length);
            output = buildCloudPath(match.cloud, suffix);
            if (outputs.indexOf(output) < 0) outputs.push(output);
        });
        if (outputs.length > 1) conflict = true;
        if (!conflict && outputs.length === 1 && cloudCandidates.length &&
            !cloudCandidates.some(function (candidate) { return candidate.path.normalized === outputs[0]; })) {
            conflict = true;
        }

        evidence = baseEvidence(localPath, candidateCount, conflict ? 'manual_mapping_conflict' : 'manual_mapping_exists');
        evidence.validCandidateCount = cloudCandidates.length;
        evidence.manualMappingMatched = true;
        evidence.manualConflict = conflict;
        return makeResult(conflict ? STATUS.UNSAFE : STATUS.NO_MATCH, CONFIDENCE.LOW, null, evidence);
    }

    function equivalentPrefixPaths(left, leftSegments, right, rightSegments) {
        var index;
        if (!sameRoot(left, right) || leftSegments.length !== rightSegments.length) return false;
        for (index = 0; index < leftSegments.length; index++) {
            if (!segmentEquals(leftSegments[index], rightSegments[index], left.kind)) return false;
        }
        return true;
    }

    function inferPrefixMappingCore(sourcePath, candidateInfo, invalidCandidateReason) {
        var evidence;
        var scored;
        var bestScore;
        var best;
        var matched;
        var sourcePrefixLength;
        var targetPrefixLength;
        var sourceSegments;
        var targetSegments;
        var sourcePrefix;
        var targetPrefix;
        var confidence;

        if (candidateInfo.invalidReason) {
            evidence = baseEvidence(sourcePath, candidateInfo.inputCount, invalidCandidateReason);
            evidence.validCandidateCount = candidateInfo.candidates.length;
            return makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null, evidence);
        }
        if (!candidateInfo.candidates.length) {
            return makeResult(STATUS.NO_MATCH, CONFIDENCE.LOW, null,
                baseEvidence(sourcePath, candidateInfo.inputCount, 'no_candidates'));
        }

        scored = candidateInfo.candidates.map(function (candidate) {
            return {candidate: candidate, evidence: suffixEvidence(sourcePath, candidate.path)};
        });
        bestScore = scored.reduce(function (score, value) {
            return Math.max(score, value.evidence.matchedSuffixSegments);
        }, 0);
        best = scored.filter(function (value) { return value.evidence.matchedSuffixSegments === bestScore; });
        evidence = baseEvidence(sourcePath, candidateInfo.inputCount, 'no_common_suffix');
        evidence.validCandidateCount = candidateInfo.candidates.length;

        if (bestScore === 0) return makeResult(STATUS.NO_MATCH, CONFIDENCE.LOW, null, evidence);
        matched = best[0].evidence;
        evidence.matchedSuffixSegments = matched.matchedSuffixSegments;
        evidence.matchedParentSegments = matched.matchedParentSegments;
        evidence.filenameMatched = matched.filenameMatched;

        if (best.length > 1) {
            evidence.reason = 'multiple_equal_candidates';
            return makeResult(STATUS.AMBIGUOUS, CONFIDENCE.LOW, null, evidence);
        }
        if (bestScore === 1) {
            evidence.reason = 'filename_only';
            return makeResult(STATUS.NO_MATCH, CONFIDENCE.LOW, null, evidence);
        }
        if (bestScore === 2) {
            evidence.reason = 'suffix_too_short';
            return makeResult(STATUS.NO_MATCH, CONFIDENCE.LOW, null, evidence);
        }

        sourcePrefixLength = sourcePath.segments.length - bestScore + 1;
        targetPrefixLength = best[0].candidate.path.segments.length - bestScore + 1;
        if (sourcePrefixLength < 1 || targetPrefixLength < 1) {
            evidence.reason = 'root_boundary_ambiguous';
            return makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null, evidence);
        }
        sourceSegments = sourcePath.segments.slice(0, sourcePrefixLength);
        targetSegments = best[0].candidate.path.segments.slice(0, targetPrefixLength);
        sourcePrefix = buildPath(sourcePath, sourceSegments);
        targetPrefix = buildPath(best[0].candidate.path, targetSegments);
        if (equivalentPrefixPaths(sourcePath, sourceSegments, best[0].candidate.path, targetSegments)) {
            evidence.reason = 'identical_mapping';
            return makeResult(STATUS.NO_MATCH, CONFIDENCE.LOW, null, evidence);
        }

        confidence = matched.matchedParentSegments >= 3 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM;
        evidence.reason = confidence === CONFIDENCE.HIGH ? 'unique_long_suffix' : 'unique_supported_suffix';
        return makeResult(STATUS.MATCHED, confidence, {
            sourcePrefix: sourcePrefix,
            targetPrefix: targetPrefix
        }, evidence);
    }

    function sourceValidation(source, requestedSemantics, candidateCount) {
        if (!source.path) {
            return makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null,
                baseEvidence(null, candidateCount, source.reason || 'invalid_source_path'));
        }
        if (['auto', 'windows-drive', 'unc', 'posix'].indexOf(requestedSemantics) < 0 ||
            (requestedSemantics !== 'auto' && requestedSemantics !== source.path.kind)) {
            return makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null,
                baseEvidence(source.path, candidateCount, 'path_semantics_mismatch'));
        }
        return null;
    }

    function anchoredMountPrefix(sourcePath, sourcePrefixValue, mountPath) {
        var sourcePrefix = parsePath(sourcePrefixValue, true);
        var suffix;
        var mountPrefixSegments;
        var offset;
        var index;
        if (!sourcePrefix.path || !prefixMatches(sourcePath, sourcePrefix.path)) return null;
        suffix = sourcePath.segments.slice(sourcePrefix.path.segments.length);
        if (!suffix.length || mountPath.segments.length <= suffix.length) return null;
        offset = mountPath.segments.length - suffix.length;
        for (index = 0; index < suffix.length; index++) {
            if (!segmentEquals(suffix[index], mountPath.segments[offset + index], sourcePath.kind)) return null;
        }
        mountPrefixSegments = mountPath.segments.slice(0, offset);
        if (!mountPrefixSegments.length) return null;
        return {
            sourcePrefix: buildPath(sourcePrefix.path, sourcePrefix.path.segments),
            mountPrefix: buildPath(mountPath, mountPrefixSegments)
        };
    }

    function inferSmartPathMapping(options) {
        var settings = options || {};
        var sourceValue = settings.sourcePath !== undefined ? settings.sourcePath : settings.localPath;
        var source = parsePath(sourceValue, false);
        var requestedSemantics = settings.pathSemantics || 'auto';
        var candidateValues = settings.candidateCloudPaths || [];
        var invalidSource = sourceValidation(source, requestedSemantics,
            Array.isArray(candidateValues) ? candidateValues.length : 0);
        var candidateInfo;
        var manualResult;
        var result;

        if (invalidSource) return invalidSource;
        candidateInfo = normalizedCandidates(candidateValues, function (candidate) {
            return candidate.kind === 'posix';
        });
        manualResult = manualAuthority(source.path, settings.manualMappings, candidateInfo.candidates, candidateInfo.inputCount);
        if (manualResult) return manualResult;
        result = inferPrefixMappingCore(source.path, candidateInfo, 'invalid_cloud_candidate');
        if (result.suggestion) {
            result.suggestion = {
                localPrefix: result.suggestion.sourcePrefix,
                cloudPrefix: result.suggestion.targetPrefix
            };
        }
        return result;
    }

    function inferSmartMountMapping(options) {
        var settings = options || {};
        var source = parsePath(settings.sourcePath, false);
        var requestedSemantics = settings.pathSemantics || 'auto';
        var candidateValues = settings.candidateMountPaths || [];
        var invalidSource = sourceValidation(source, requestedSemantics,
            Array.isArray(candidateValues) ? candidateValues.length : 0);
        var candidateInfo;
        var result;

        if (invalidSource) return invalidSource;
        candidateInfo = normalizedCandidates(candidateValues, function (candidate) {
            if (source.path.kind === 'posix') return candidate.kind === 'posix';
            return candidate.kind === 'windows-drive' || candidate.kind === 'unc';
        });
        result = inferPrefixMappingCore(source.path, candidateInfo, 'invalid_mount_candidate');
        if (result.suggestion) {
            if (settings.sourcePrefix !== undefined) {
                var anchored = candidateInfo.candidates.length === 1
                    ? anchoredMountPrefix(source.path, settings.sourcePrefix, candidateInfo.candidates[0].path)
                    : null;
                if (!anchored) {
                    result = makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null, Object.assign({}, result.evidence, {
                        reason: 'mount_suffix_mismatch'
                    }));
                } else {
                    result.suggestion = anchored;
                }
            } else {
                result.suggestion = {
                    sourcePrefix: result.suggestion.sourcePrefix,
                    mountPrefix: result.suggestion.targetPrefix
                };
            }
        }
        return result;
    }

    function diagnosticRecord(result) {
        var value = result && typeof result === 'object' ? result : {};
        var evidence = value.evidence && typeof value.evidence === 'object' ? value.evidence : {};
        return {
            level: value.status === STATUS.MATCHED ? 'info' : 'warn',
            category: 'resolver',
            event: 'smart-path-mapping-candidate',
            details: {
                status: value.status || STATUS.UNSAFE,
                confidence: value.confidence || CONFIDENCE.LOW,
                matchedSuffixSegments: Number.isSafeInteger(evidence.matchedSuffixSegments) ? evidence.matchedSuffixSegments : 0,
                candidateCount: Number.isSafeInteger(evidence.candidateCount) ? evidence.candidateCount : 0,
                reason: typeof evidence.reason === 'string' ? evidence.reason : 'invalid_result'
            }
        };
    }

    return {
        CONFIDENCE: CONFIDENCE,
        STATUS: STATUS,
        diagnosticRecord: diagnosticRecord,
        inferSmartMountMapping: inferSmartMountMapping,
        inferSmartPathMapping: inferSmartPathMapping
    };
}));
