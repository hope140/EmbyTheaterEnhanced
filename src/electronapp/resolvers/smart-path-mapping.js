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

    function normalizedCloudCandidates(values) {
        var seen = Object.create(null);
        var candidates = [];
        var invalidReason = null;

        if (!Array.isArray(values)) return {candidates: [], invalidReason: 'invalid_candidates', inputCount: 0};
        values.forEach(function (value, index) {
            var parsed = parsePath(value, false);
            if (!parsed.path || parsed.path.kind !== 'posix') {
                if (!invalidReason) invalidReason = parsed.reason || 'invalid_cloud_candidate';
                return;
            }
            if (!seen[parsed.path.normalized]) {
                seen[parsed.path.normalized] = true;
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

    function inferSmartPathMapping(options) {
        var settings = options || {};
        var local = parsePath(settings.localPath, false);
        var requestedSemantics = settings.pathSemantics || 'auto';
        var candidateInfo;
        var evidence;
        var manualResult;
        var scored;
        var bestScore;
        var best;
        var matched;
        var localPrefixLength;
        var cloudPrefixLength;
        var localPrefix;
        var cloudPrefix;
        var confidence;

        if (!local.path) {
            return makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null,
                baseEvidence(null, Array.isArray(settings.candidateCloudPaths) ? settings.candidateCloudPaths.length : 0,
                    local.reason || 'invalid_local_path'));
        }
        if (['auto', 'windows-drive', 'unc', 'posix'].indexOf(requestedSemantics) < 0 ||
            (requestedSemantics !== 'auto' && requestedSemantics !== local.path.kind)) {
            return makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null,
                baseEvidence(local.path, Array.isArray(settings.candidateCloudPaths) ? settings.candidateCloudPaths.length : 0,
                    'path_semantics_mismatch'));
        }

        candidateInfo = normalizedCloudCandidates(settings.candidateCloudPaths || []);
        manualResult = manualAuthority(local.path, settings.manualMappings, candidateInfo.candidates, candidateInfo.inputCount);
        if (manualResult) return manualResult;
        if (candidateInfo.invalidReason) {
            evidence = baseEvidence(local.path, candidateInfo.inputCount, 'invalid_cloud_candidate');
            evidence.validCandidateCount = candidateInfo.candidates.length;
            return makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null, evidence);
        }
        if (!candidateInfo.candidates.length) {
            return makeResult(STATUS.NO_MATCH, CONFIDENCE.LOW, null,
                baseEvidence(local.path, candidateInfo.inputCount, 'no_candidates'));
        }

        scored = candidateInfo.candidates.map(function (candidate) {
            return {candidate: candidate, evidence: suffixEvidence(local.path, candidate.path)};
        });
        bestScore = scored.reduce(function (score, value) {
            return Math.max(score, value.evidence.matchedSuffixSegments);
        }, 0);
        best = scored.filter(function (value) { return value.evidence.matchedSuffixSegments === bestScore; });
        evidence = baseEvidence(local.path, candidateInfo.inputCount, 'no_common_suffix');
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

        localPrefixLength = local.path.segments.length - bestScore + 1;
        cloudPrefixLength = best[0].candidate.path.segments.length - bestScore + 1;
        if (localPrefixLength < 1 || cloudPrefixLength < 1) {
            evidence.reason = 'root_boundary_ambiguous';
            return makeResult(STATUS.UNSAFE, CONFIDENCE.LOW, null, evidence);
        }
        localPrefix = buildPath(local.path, local.path.segments.slice(0, localPrefixLength));
        cloudPrefix = buildPath(best[0].candidate.path, best[0].candidate.path.segments.slice(0, cloudPrefixLength));
        if (local.path.kind === 'posix' && localPrefix === cloudPrefix) {
            evidence.reason = 'identical_mapping';
            return makeResult(STATUS.NO_MATCH, CONFIDENCE.LOW, null, evidence);
        }

        confidence = matched.matchedParentSegments >= 3 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM;
        evidence.reason = confidence === CONFIDENCE.HIGH ? 'unique_long_suffix' : 'unique_supported_suffix';
        return makeResult(STATUS.MATCHED, confidence, {
            localPrefix: localPrefix,
            cloudPrefix: cloudPrefix
        }, evidence);
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
        inferSmartPathMapping: inferSmartPathMapping
    };
}));
