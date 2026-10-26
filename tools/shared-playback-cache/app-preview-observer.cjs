'use strict';
// A test-only observer of the service's already validated, owner-bound frames.
// It retains a digest, never pixel buffers, and never substitutes for a capture.
const crypto = require('node:crypto');
const sameOwner = (a, b) => !!a && !!b && a.endpointId === b.endpointId && a.generationId === b.generationId;
function createPreviewObserver({now, colored, current, observe = () => {}}) {
  let candidate = null, nextProbeAt = -Infinity;
  const safeObserve = row => {try {observe(row);} catch (_) {}};
  function install(service) {
    const original = service.capturePreview;
    const wrapped = function (owner) {
      const owned = owner && {endpointId: owner.endpointId, generationId: owner.generationId};
      const requestedAt = now(), promise = original.apply(this, arguments);
      // Return the exact original Promise, including rejection and receiver semantics.
      Promise.resolve(promise).then(frame => {
        const resolvedAt = now();
        let category = 'empty';
        if (frame) {
          if (!sameOwner(owned, frame.owner) || !current(owned)) category = 'stale-owner';
          else if (!colored(frame)) category = 'uncolored';
          else {
            const hash = crypto.createHash('sha256').update(frame.pixels).digest('hex');
            category = candidate && candidate.hash === hash ? 'same-frame' : 'new-frame';
            if (!candidate || requestedAt >= candidate.requestedAt) candidate = {hash, owner: owned, requestedAt, resolvedAt};
          }
        }
        safeObserve({category, generation: owned?.generationId ?? null, requestedAt, resolvedAt});
      }, () => safeObserve({category: 'rejected', generation: owned?.generationId ?? null, requestedAt, resolvedAt: now()})).catch(() => {});
      return promise;
    };
    service.capturePreview = wrapped;
    return () => {if (service.capturePreview !== wrapped) throw Error('app-preview-observer-owner'); service.capturePreview = original; candidate = null;};
  }
  return {
    install,
    // Explicit test requests respect the fixed helper's 950ms minimum interval.
    // Real taskbar requests are observed without changing their cadence.
    probeDue() {const at = now(); if (at < nextProbeAt) return false; nextProbeAt = at + 1000; return true;},
    frame(owner, after, previousHash, before = Infinity) {
      return candidate && current(owner) && sameOwner(owner, candidate.owner) && candidate.requestedAt >= after && candidate.resolvedAt <= before &&
        (!previousHash || candidate.hash !== previousHash) ? {...candidate, owner: {...candidate.owner}} : null;
    }
  };
}
function seekSignals(events, start, owner, target) {
  const rows = events.slice(start).filter(e => e.generation === owner);
  const position = rows.find(e => e.name === 'time-pos' && typeof e.value === 'number' && Math.abs(e.value - target) < 0.2);
  const restart = rows.find(e => e.name === 'playback-restart');
  return position && restart ? {positionAt: position.at, restartAt: restart.at, after: Math.max(position.at, restart.at)} : null;
}
function operationFacts(rows) {
  const operations = new Set(['command', 'set-property', 'get-property', 'load', 'set-option']);
  const properties = new Set(['pause', 'time-pos', 'ao', 'volume', 'speed']);
  return rows.slice(-64).map(row => ({generation: Number.isSafeInteger(row.generationId) ? row.generationId : null,
    operation: operations.has(row.operation) ? row.operation : 'other', property: properties.has(row.property) ? row.property : row.property ? 'other' : null,
    errorCode: Number.isInteger(row.errorCode) ? row.errorCode : null}));
}
module.exports = {createPreviewObserver, seekSignals, operationFacts};
