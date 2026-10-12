'use strict';

const path = require('path');

const REFRESH_BUDGET_MS = 1800;
const MAX_PARENT_LEVELS = 3;
const COOLDOWN_MS = 30000;
const MAX_COOLDOWNS = 64;

function parentChain(cloudPath, cloudPrefix) {
    const parents = [];
    let parent = path.posix.dirname(cloudPath);
    while (parents.length < MAX_PARENT_LEVELS && parent !== '/' &&
        (parent === cloudPrefix || parent.startsWith(cloudPrefix === '/' ? '/' : cloudPrefix + '/'))) {
        parents.push(parent);
        if (parent === cloudPrefix) break;
        parent = path.posix.dirname(parent);
    }
    return parents;
}

function createRefresher(options) {
    const now = options.now;
    const cooldowns = new Map();
    let owner = null;

    async function refresh(entry, cloudPath, cloudPrefix, overallDeadline) {
        const parents = parentChain(cloudPath, cloudPrefix);
        if (!parents.length) return {reason: 'refresh_boundary'};
        if (entry.cancelled) return {reason: 'cancelled'};
        if (owner) return {reason: 'refresh_busy'};
        const key = parents[0];
        const startedAt = now();
        for (const [candidate, expiresAt] of cooldowns) {
            if (expiresAt <= startedAt) cooldowns.delete(candidate);
        }
        if (cooldowns.has(key)) return {reason: 'refresh_cooldown'};
        if (cooldowns.size >= MAX_COOLDOWNS) return {reason: 'refresh_capacity'};
        cooldowns.set(key, startedAt + COOLDOWN_MS);
        owner = entry;
        const deadline = Math.min(overallDeadline, startedAt + REFRESH_BUDGET_MS);
        try {
            let existing = -1;
            for (let index = 0; index < parents.length; index++) {
                if (entry.cancelled) return {reason: 'cancelled'};
                if (now() >= deadline) return {reason: 'timeout'};
                const reply = await options.find(entry, parents[index], Math.min(deadline, now() + 350));
                if (entry.cancelled) return {reason: 'cancelled'};
                if (reply.reason === 'not_found') continue;
                if (reply.reason) return reply;
                if (!reply.directory) return {reason: 'invalid_directory'};
                existing = index;
                break;
            }
            if (existing < 0) return {reason: 'not_found'};
            for (let index = existing; index >= 0; index--) {
                if (entry.cancelled) return {reason: 'cancelled'};
                if (now() >= deadline) return {reason: 'timeout'};
                const reply = await options.stream(entry, parents[index], deadline);
                if (entry.cancelled) return {reason: 'cancelled'};
                if (reply.reason) return reply;
            }
            return now() >= deadline ? {reason: 'timeout'} : {refreshed: true, levels: existing + 1};
        } finally {
            if (owner === entry) owner = null;
        }
    }

    return {refresh: refresh};
}

module.exports = {REFRESH_BUDGET_MS: REFRESH_BUDGET_MS, createRefresher: createRefresher};
