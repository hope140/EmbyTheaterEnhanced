'use strict';

const pathRules = require('./path-rules');
const smartPathMapping = require('./smart-path-mapping');

const parsePath = smartPathMapping.parsePathForInference;
const MAX_SAMPLES = 8;

function sameSegment(left, right, kind) {
    return kind === 'posix' ? left === right : left.toLowerCase() === right.toLowerCase();
}

function sameRoot(left, right) {
    return left.kind === right.kind && (left.kind === 'posix' ||
        left.root.toLowerCase() === right.root.toLowerCase());
}

function samePath(left, right) {
    if (!left || !right || !sameRoot(left, right) || left.segments.length !== right.segments.length) return false;
    return left.segments.every((part, index) => sameSegment(part, right.segments[index], left.kind));
}

function startsWithPath(path, prefix) {
    return sameRoot(path, prefix) && prefix.segments.length <= path.segments.length &&
        prefix.segments.every((part, index) => sameSegment(part, path.segments[index], path.kind));
}

function pathFromParts(path, parts) {
    return path.kind === 'posix' ? '/' + parts.join('/') : path.root + parts.join('\\');
}

function safeFile(value, kind) {
    const parsed = parsePath(value, false);
    return parsed.path && (!kind || parsed.path.kind === kind) ? parsed.path : null;
}

function safePrefix(value, kind) {
    const normalized = kind === 'posix' ? pathRules.normalizeCloudPrefix(value)
        : pathRules.normalizeMappingPrefix(value);
    const parsed = parsePath(normalized, true);
    return parsed.path && (!kind || parsed.path.kind === kind) ? parsed.path : null;
}

function validSamples(values) {
    if (!Array.isArray(values) || !values.length || values.length > MAX_SAMPLES) return null;
    const samples = [];
    for (const value of values) {
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            typeof value.sourcePath !== 'string' || typeof value.cloudPath !== 'string' ||
            value.sourcePath.length > 32768 || value.cloudPath.length > 32768 ||
            (value.mountPath !== undefined && (typeof value.mountPath !== 'string' || value.mountPath.length > 32768))) {
            return null;
        }
        const source = safeFile(value.sourcePath);
        const cloud = safeFile(value.cloudPath, 'posix');
        const mount = value.mountPath ? safeFile(value.mountPath) : null;
        if (!source || !cloud) return null;
        samples.push({source, cloud, mount, sourcePath: value.sourcePath,
            cloudPath: value.cloudPath, mountPath: value.mountPath || '',
            mountInvalid: !!value.mountPath && !mount});
    }
    return samples;
}

function matchedSuffixSegments(source, target) {
    let matched = 0;
    while (matched < source.segments.length && matched < target.segments.length &&
        sameSegment(source.segments[source.segments.length - 1 - matched],
            target.segments[target.segments.length - 1 - matched], source.kind)) matched++;
    return matched;
}

function matchFilePair(sourcePath, cloudPath) {
    const source = safeFile(sourcePath);
    const cloud = safeFile(cloudPath, 'posix');
    if (!source || !cloud) return {status: 'UNSAFE', confidence: 'LOW', matchedSuffixSegments: 0};
    const matched = matchedSuffixSegments(source, cloud);
    return {
        status: matched ? 'MATCHED' : 'NO_MATCH',
        confidence: matched >= 4 ? 'HIGH' : matched >= 3 ? 'MEDIUM' : 'LOW',
        matchedSuffixSegments: matched
    };
}

function selectedRule(source, rules) {
    let winner = null;
    let winnerLength = -1;
    (Array.isArray(rules) ? rules : []).forEach((rule) => {
        if (!rule || rule.enabled === false || rule.originState === 'DISABLED') return;
        const prefix = safePrefix(rule.sourcePrefix);
        if (!prefix || !startsWithPath(source, prefix)) return;
        if (prefix.normalized.length > winnerLength) {
            winner = rule;
            winnerLength = prefix.normalized.length;
        }
    });
    return winner;
}

function ruleMapsTo(sample, rule, targetKey, fullPath) {
    const prefix = safePrefix(rule[targetKey], targetKey === 'cloudPrefix' ? 'posix' : null);
    if (!prefix) return false;
    const mapped = pathRules.replacePrefix(sample.sourcePath, rule.sourcePrefix, rule[targetKey]);
    return !!mapped && samePath(safeFile(mapped), fullPath);
}

function checkExistingRuleCoverage(samples, rules) {
    const parsed = validSamples(samples);
    if (!parsed) return {status: 'CONFLICT', mountStatus: 'UNSAFE', ruleIds: [], reason: 'invalid_sample'};
    const invalidRule = (Array.isArray(rules) ? rules : []).find(rule => rule &&
        rule.enabled !== false && rule.originState !== 'DISABLED' &&
        (!safePrefix(rule.sourcePrefix) ||
            (rule.cloudPrefix && !safePrefix(rule.cloudPrefix, 'posix')) ||
            (rule.mountPrefix && !safePrefix(rule.mountPrefix))));
    if (invalidRule) return {status: 'CONFLICT', mountStatus: 'UNAVAILABLE',
        ruleIds: invalidRule.id ? [invalidRule.id] : [], reason: 'invalid_existing_rule'};
    const ruleIds = [];
    let unmatched = false;
    let missingMount = false;
    let invalidMount = false;
    let mountProvided = false;
    for (const sample of parsed) {
        const rule = selectedRule(sample.source, rules);
        if (!rule) {
            unmatched = true;
            continue;
        }
        if (!ruleMapsTo(sample, rule, 'cloudPrefix', sample.cloud)) {
            return {status: 'CONFLICT', mountStatus: 'UNAVAILABLE', ruleIds: rule.id ? [rule.id] : [],
                reason: 'existing_cloud_conflict'};
        }
        if (rule.id && !ruleIds.includes(rule.id)) ruleIds.push(rule.id);
        if (sample.mountInvalid) {
            mountProvided = true;
            invalidMount = true;
        } else if (sample.mount) {
            mountProvided = true;
            if (!rule.mountPrefix) missingMount = true;
            else if (!ruleMapsTo(sample, rule, 'mountPrefix', sample.mount)) {
                return {status: 'CONFLICT', mountStatus: 'CONFLICT', ruleIds,
                    reason: 'existing_mount_conflict'};
            }
        }
    }
    if (unmatched) return {status: ruleIds.length ? 'CONFLICT' : 'NOT_COVERED',
        mountStatus: 'UNAVAILABLE', ruleIds, reason: ruleIds.length ? 'partial_existing_coverage' : 'no_matching_rule'};
    if (invalidMount) return {status: 'CLOUD_COVERED',
        mountStatus: 'MOUNT_INVALID', ruleIds, reason: 'existing_cloud_coverage'};
    if (mountProvided && missingMount) return {status: 'CLOUD_COVERED',
        mountStatus: 'MOUNT_NOT_CONFIGURED', ruleIds, reason: 'existing_cloud_coverage'};
    return {status: mountProvided ? 'FULLY_COVERED' : 'CLOUD_COVERED',
        mountStatus: mountProvided ? 'MATCHED' : 'NOT_PROVIDED', ruleIds,
        reason: 'existing_cloud_coverage'};
}

function commonParent(parts) {
    const first = parts[0];
    let length = first.segments.length - 1;
    for (const path of parts.slice(1)) {
        if (!sameRoot(first, path)) return null;
        length = Math.min(length, path.segments.length - 1);
        for (let index = 0; index < length; index++) {
            if (!sameSegment(first.segments[index], path.segments[index], first.kind)) {
                length = index;
                break;
            }
        }
    }
    return {path: first, segments: first.segments.slice(0, length)};
}

function hasBranch(paths, ancestor) {
    const children = new Set();
    for (const path of paths) {
        const child = path.segments[ancestor.segments.length];
        if (!child || path.segments.length <= ancestor.segments.length + 1) return false;
        children.add(path.kind === 'posix' ? child : child.toLowerCase());
    }
    return children.size >= 2;
}

function suffixFor(path, prefix) {
    return startsWithPath(path, prefix) ? path.segments.slice(prefix.segments.length) : null;
}

function sameSuffix(left, right, kind) {
    return left && right && left.length === right.length &&
        left.every((part, index) => sameSegment(part, right[index], kind));
}

function inferMappingBoundaryFromSamples(samples) {
    const parsed = validSamples(samples);
    if (!parsed) return {status: 'UNSAFE', confidence: 'LOW', reason: 'invalid_sample', suggestion: null};
    if (parsed.length < 2) return {status: 'INSUFFICIENT_EVIDENCE', confidence: 'LOW',
        reason: 'second_sample_required', suggestion: null};
    const sources = parsed.map(sample => sample.source);
    const clouds = parsed.map(sample => sample.cloud);
    const sourceAncestor = commonParent(sources);
    const cloudAncestor = commonParent(clouds);
    if (!sourceAncestor || !cloudAncestor || !sourceAncestor.segments.length || !cloudAncestor.segments.length ||
        !hasBranch(sources, sourceAncestor) || !hasBranch(clouds, cloudAncestor)) {
        return {status: 'INSUFFICIENT_EVIDENCE', confidence: 'LOW',
            reason: 'independent_directories_required', suggestion: null};
    }
    const sourcePrefix = safePrefix(pathFromParts(sourceAncestor.path, sourceAncestor.segments));
    const cloudPrefix = safePrefix(pathFromParts(cloudAncestor.path, cloudAncestor.segments), 'posix');
    if (!sourcePrefix || !cloudPrefix || !parsed.every(sample => sameSuffix(
        suffixFor(sample.source, sourcePrefix), suffixFor(sample.cloud, cloudPrefix), sample.cloud.kind))) {
        return {status: 'UNRESOLVED', confidence: 'LOW', reason: 'relative_suffix_mismatch', suggestion: null};
    }
    return {status: 'MATCHED', confidence: 'HIGH', reason: 'independent_branch_consensus',
        suggestion: {sourcePrefix: sourcePrefix.normalized, cloudPrefix: cloudPrefix.normalized}};
}

function inferMountBoundaryFromSamples(samples, sourcePrefixValue) {
    const parsed = validSamples(samples);
    if (!parsed) return {status: 'UNSAFE', confidence: 'LOW', reason: 'invalid_sample', mountPrefix: ''};
    if (parsed.some(sample => sample.mountInvalid)) {
        return {status: 'UNSAFE', confidence: 'LOW', reason: 'invalid_mount_candidate', mountPrefix: ''};
    }
    if (parsed.length < 2 || parsed.some(sample => !sample.mount)) {
        return {status: 'INSUFFICIENT_EVIDENCE', confidence: 'LOW',
            reason: parsed.some(sample => !!sample.mount) ? 'matching_mount_samples_required' : 'mount_samples_required',
            mountPrefix: ''};
    }
    const sourcePrefix = safePrefix(sourcePrefixValue);
    if (!sourcePrefix) return {status: 'UNSAFE', confidence: 'LOW', reason: 'invalid_source_prefix', mountPrefix: ''};
    let mountPrefix = null;
    for (const sample of parsed) {
        if (sample.source.kind !== 'posix' && sample.mount.kind === 'posix') {
            return {status: 'UNRESOLVED', confidence: 'LOW', reason: 'mount_path_kind_mismatch', mountPrefix: ''};
        }
        const relative = suffixFor(sample.source, sourcePrefix);
        if (!relative || sample.mount.segments.length <= relative.length) {
            return {status: 'UNRESOLVED', confidence: 'LOW', reason: 'mount_suffix_mismatch', mountPrefix: ''};
        }
        const parts = sample.mount.segments.slice(0, -relative.length);
        const candidate = safePrefix(pathFromParts(sample.mount, parts));
        const trailing = sample.mount.segments.slice(-relative.length);
        if (!candidate || !parts.length || !sameSuffix(relative, trailing, sample.mount.kind) ||
            (mountPrefix && !samePath(mountPrefix, candidate))) {
            return {status: 'UNRESOLVED', confidence: 'LOW', reason: 'mount_suffix_mismatch', mountPrefix: ''};
        }
        mountPrefix = candidate;
    }
    return {status: 'MATCHED', confidence: 'HIGH', reason: 'mount_relative_suffix_consensus',
        mountPrefix: mountPrefix.normalized};
}

function preview(samples, rules) {
    const parsed = validSamples(samples);
    if (!parsed) return {coverage: {status: 'CONFLICT', mountStatus: 'UNSAFE', ruleIds: [], reason: 'invalid_sample'},
        fileMatch: {status: 'UNSAFE', confidence: 'LOW', matchedSuffixSegments: 0},
        boundary: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'invalid_sample'}, suggestion: null,
        mount: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'invalid_sample'}};
    const coverage = checkExistingRuleCoverage(samples, rules);
    const pairs = parsed.map(sample => matchFilePair(sample.sourcePath, sample.cloudPath));
    const minimumSuffix = Math.min(...pairs.map(pair => pair.matchedSuffixSegments));
    const fileMatch = {status: pairs.every(pair => pair.status === 'MATCHED') ? 'MATCHED' : 'NO_MATCH',
        confidence: pairs.every(pair => pair.confidence === 'HIGH') ? 'HIGH'
            : pairs.every(pair => pair.confidence !== 'LOW') ? 'MEDIUM' : 'LOW',
        matchedSuffixSegments: minimumSuffix};
    if (coverage.status !== 'NOT_COVERED') return {coverage, fileMatch,
        boundary: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'existing_rule_first'},
        suggestion: null, mount: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'existing_rule_first'}};
    if (fileMatch.confidence !== 'HIGH') return {coverage, fileMatch,
        boundary: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'file_match_insufficient'},
        suggestion: null, mount: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'file_match_insufficient'}};
    const boundary = inferMappingBoundaryFromSamples(samples);
    if (boundary.status !== 'MATCHED') return {coverage, fileMatch, boundary, suggestion: null,
        mount: {status: 'INSUFFICIENT_EVIDENCE', confidence: 'LOW', reason: 'cloud_boundary_unresolved'}};
    const candidateSource = safePrefix(boundary.suggestion.sourcePrefix);
    const suppressedRule = (Array.isArray(rules) ? rules : []).find(rule => {
        if (!rule || rule.originState !== 'DISABLED') return false;
        return samePath(candidateSource, safePrefix(rule.sourcePrefix));
    });
    if (suppressedRule) return {
        coverage: {status: 'CONFLICT', mountStatus: 'UNAVAILABLE',
            ruleIds: suppressedRule.id ? [suppressedRule.id] : [], reason: 'disabled_rule_tombstone'},
        fileMatch, boundary: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'disabled_rule_tombstone'},
        suggestion: null, mount: {status: 'UNRESOLVED', confidence: 'LOW', reason: 'disabled_rule_tombstone'}
    };
    const mount = inferMountBoundaryFromSamples(samples, boundary.suggestion.sourcePrefix);
    return {coverage, fileMatch, boundary, mount, suggestion: {
        sourcePrefix: boundary.suggestion.sourcePrefix,
        cloudPrefix: boundary.suggestion.cloudPrefix,
        mountPrefix: mount.status === 'MATCHED' ? mount.mountPrefix : ''
    }};
}

module.exports = {MAX_SAMPLES, checkExistingRuleCoverage, matchFilePair,
    inferMappingBoundaryFromSamples, inferMountBoundaryFromSamples, preview};
