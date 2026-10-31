'use strict';

// One actual NODE read, queued after this generation's complete settings batch.
// A submitted setting is never used as the applied value.
function createBudgetReader(owns) {
  let current = null, revision = 0, locked = false;
  function retire() {++revision; current = null; locked = false;}
  function beforeWrite() {
    if (locked) throw Error('shared-cache-budget-in-use');
    ++revision; current = null;
  }
  function read(helper, generationId) {
    // A stale caller must not replace another generation's pending record.
    if (!owns(helper, generationId)) {
      const failed = Promise.reject(Error('shared-cache-generation-retired'));
      failed.catch(() => {}); return failed;
    }
    if (current && current.helper === helper && current.generationId === generationId && current.valid()) return current.promise;
    const version = revision;
    const record = {helper, generationId, valid: () => current === record && revision === version && owns(helper, generationId)};
    current = record;
    let pending;
    try {
      if (!record.valid()) throw Error('shared-cache-generation-retired');
      pending = helper.getProperty('demuxer-max-bytes', 50);
    } catch (error) {pending = Promise.reject(error);}
    record.promise = Promise.resolve(pending).then(bytes => {
      if (!record.valid() || !Number.isSafeInteger(bytes) || bytes < 256 * 1024 || bytes > 3072 * 1024 * 1024) throw Error('shared-cache-budget-unavailable');
      return Object.freeze({bytes, isCurrent: record.valid, commit() {
        if (!record.valid()) throw Error('shared-cache-generation-retired');
        locked = true;
      }});
    });
    // Priming is fire-and-forget; a failed read remains failed for this revision.
    record.promise.catch(() => {});
    return record.promise;
  }
  return {read, beforeWrite, retire};
}
module.exports = {createBudgetReader};
