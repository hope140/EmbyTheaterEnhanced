'use strict';
// Explicit experiment adapter. No normal app imports, authentication provider,
// source URL persistence, core changes or automatic downloads are supplied here.
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const {once} = require('node:events');
const {performance} = require('node:perf_hooks');
const evidence = require('./evidence');
const BLOCK = 256 * 1024;
const IO_HIGH_WATER = 256 * 1024;
const CAPTURE_JOBS = 8;
const strong = tag => typeof tag === 'string' && /^"[\x21\x23-\x7e]{1,255}"$/.test(tag);
const problem = reason => Object.assign(new Error('shared-cache-' + reason), {reason});
const cancelled = () => problem('cancelled');
const identityFields = ['server', 'account', 'item', 'mediaSource', 'resource', 'representation'];
const metadataKey = value => JSON.stringify(['total', 'etag', 'lastModified', 'version'].map(k => value[k] ?? null));
function identityOf(value) {
  const result = {};
  for (const key of identityFields) {
    if (typeof value?.[key] !== 'string' || !value[key] || value[key].length > 2048) throw problem('identity-invalid');
    result[key] = value[key];
  }
  return Object.freeze(result);
}
function rangeOf(header, total) {
  if (!header) return {start: 0, end: total - 1, partial: false};
  const m = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!m) return null;
  const start = Number(m[1]), end = m[2] ? Number(m[2]) : total - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && end < total
    ? {start, end, partial: true} : null;
}
function grantOf(value) {
  if (!value || !value.metadata || !Number.isSafeInteger(value.metadata.total) || value.metadata.total <= 0) throw problem('source-unavailable');
  const u = new URL(value.url);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.hash || u.origin !== value.origin) throw problem('source-invalid');
  const ua = value.userAgent;
  if (ua !== undefined && (typeof ua !== 'string' || !/^[\x20-\x7e]{1,1024}$/.test(ua) || /[,\\]/.test(ua))) throw problem('source-options');
  return {url: u.href, origin: u.origin, userAgent: ua, metadata: {...value.metadata}, accessChecked: value.accessChecked === true, preparedHandoff: value.preparedHandoff === true, retainedCandidate: value.retainedCandidate,
    expiresAt: Math.min(Date.now() + 300000, Number.isFinite(value.expiresAt) ? value.expiresAt : Infinity)};
}
async function waitDone(promise, signal) {
  if (signal.aborted) throw cancelled();
  let stop;
  const aborted = new Promise((_, reject) => {stop = () => reject(cancelled()); signal.addEventListener('abort', stop, {once: true});});
  try {return await Promise.race([promise, aborted]);}
  finally {signal.removeEventListener('abort', stop);}
}
async function createProxy({store, authorize, resolveAccess, timeoutMs = 5000, mediaBufferBytes = 8 * 1024 * 1024, cacheEnabled = true, cacheForeground = true, requestPolicy = 'sparse', onOriginChunk, onEvidence}) {
  if (typeof cacheForeground !== 'boolean' || resolveAccess !== undefined && typeof resolveAccess !== 'function' || onOriginChunk !== undefined && typeof onOriginChunk !== 'function' || !['sparse', 'coherent'].includes(requestPolicy) || !store || typeof authorize !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000 ||
      !Number.isSafeInteger(mediaBufferBytes) || mediaBufferBytes < BLOCK) throw problem('configuration');
  const routes = new Map(), writes = new Set(), controls = new Set(), jobs = new Set(), openings = new Set(), pendingKeyRecords = new Set();
  const stats = {originRequests: 0, probeRequests: 0, attemptedBytes: 0, receivedBytes: 0, deliveredBytes: 0,
    hitBytes: 0, committedBytes: 0, skippedWrites: 0, captureBytes: 0, peakCaptureBytes: 0,
    activeOrigins: 0, peakOrigins: 0, activeBodies: 0, peakBodies: 0, queued: 0, peakQueued: 0,
    localReadTimeouts: 0, localReadRefusals: 0, localReadGraceMs: 0, readReservedBytes: 0, peakMediaReservedBytes: 0, localWrites: 0, backpressureWrites: 0, originReadHighWaterMarkBytes: 0, localWriteHighWaterMarkBytes: 0, wholeResponseRequests: 0, partialPrefixBypasses: 0, bypassedPrefixBytes: 0, observerErrors: 0, peakWriteJobs: 0, preparedCacheWins: 0, preparedSourceWins: 0};
  let closed = false, closePromise, foregroundWaiters = 0;
  const active = new Set();
  const track = (set, promise) => {set.add(promise); promise.finally(() => set.delete(promise)).catch(() => {}); return promise;};
  function useRecord(record) {if (closed || record.retired) throw cancelled();}
  function retainedMatches(record) {
    if (!record.grant.retainedCandidate) return true;
    if (record.fallbackOriginal) return false;
    if (record.retainedValidated && store.matchRetained(record.grant.retainedCandidate, record.metadata)) return true;
    record.diskUnavailable = true; record.fallbackOriginal = true; record.preparedValidation = 'fallback';
    return false;
  }
  function invalidateRecord(record, keyPromise = record.keyPromise) {
    return record.grant.retainedCandidate
      ? store.invalidateRetained(record.grant.retainedCandidate)
      : keyPromise.then(key => store.invalidate(key));
  }
  function retire(record, purge = false) {
    record.retired = true; record.accessChecked = false; record.finishFirstAccess?.(false); record.controller.abort();
    if (!record.evidenceEnding) {
      record.evidenceEnding = true;
      track(controls, Promise.allSettled([...record.bodyJobs]).then(() => record.observe('route-end', {selectedLocalBytes: record.localHitBytes, queuedLocalBytes: record.queuedLocalBytes, queuedSourceBytes: record.queuedSourceBytes, flushedLocalBytes: record.flushedLocalBytes, flushedSourceBytes: record.flushedSourceBytes, rangeCount: record.rangeCount, omittedRanges: Math.max(0, record.rangeCount - 8)})));
    }
    if (purge) track(controls, invalidateRecord(record).catch(() => {}));
  }
  function prepareKey(record, metadata) {
    const epoch = ++record.metadataEpoch; record.metadata = {...metadata}; record.ready = false;
    record.pendingKeys = (record.pendingKeys || 0) + 1; pendingKeyRecords.add(record);
    const current = () => !closed && !record.retired && epoch === record.metadataEpoch;
    const opening = record.grant.retainedCandidate
      ? store.openRetained(record.identity, record.grant.retainedCandidate, {isCurrent: current})
      : store.open(record.identity, metadata, record.role, {isCurrent: current, retainActualFrom: record.key ?? null});
    record.keyPromise = track(controls, opening.then(async key => {
      if (!current()) throw cancelled();
      if (record.coldAtOpen === undefined) {
        const first = await store.span(key, 0), later = first ? null : await store.nextOffset(key, 0);
        if (!current()) throw cancelled();
        record.coldAtOpen = !first && later === null;
      }
      record.key = key; record.ready = true;
      let coverage; try {coverage = typeof store.coverage === 'function' ? store.coverage(key) : null;} catch (_) {}
      record.observe('index-ready', {coldIndex: record.coldAtOpen, retainedBytes: coverage?.bytes, ...evidence.version(record.metadata)});
      return key;
    }).finally(() => {
      record.pendingKeys--; if (!record.pendingKeys) pendingKeyRecords.delete(record);
    }));
    record.keyPromise.catch(() => {if (epoch === record.metadataEpoch) record.diskUnavailable = true;});
  }
  async function refresh(record) {
    useRecord(record);
    if (record.grant.expiresAt > Date.now()) return;
    let updated;
    try {updated = grantOf(await authorize(record.identity, {reason: 'revalidate', signal: record.controller.signal}));}
    catch {retire(record); throw problem('source-unavailable');}
    useRecord(record);
    if (updated.origin !== record.grant.origin || updated.userAgent !== record.grant.userAgent ||
        !record.fallbackOriginal && metadataKey(updated.metadata) !== metadataKey(record.grant.metadata)) {retire(record, true); throw problem('representation-changed');}
    record.grant = record.fallbackOriginal ? {...updated, metadata: {...record.metadata}} : updated; record.accessChecked = false;
  }
  async function acquire(kind, signal) {
    if (stats.queued >= 4) throw problem('queue-full');
    stats.queued++; stats.peakQueued = Math.max(stats.peakQueued, stats.queued);
    if (kind === 'foreground') foregroundWaiters++;
    try {
      while (true) {
        const background = [...active].filter(t => t.kind === 'background');
        if (kind === 'foreground' && background.length) {
          for (const item of background) item.controller.abort();
          await waitDone(Promise.all(background.map(t => t.done)), signal); continue;
        }
        const blocked = active.size >= 2 || kind === 'background' &&
          (foregroundWaiters || background.length || [...active].some(t => t.kind === 'foreground' &&
            (!t.idle || performance.now() - t.idleAt < 20)));
        if (!blocked) break;
        await waitDone(new Promise(resolve => setTimeout(resolve, 2)), signal);
      }
      if (closed || signal.aborted) throw cancelled();
      const controller = new AbortController();
      const abort = () => controller.abort(); signal.addEventListener('abort', abort, {once: true});
      let finish;
      const ticket = {kind, controller, idle: false, done: new Promise(resolve => {finish = resolve;}), release() {
        signal.removeEventListener('abort', abort); active.delete(ticket); finish();
      }};
      active.add(ticket); return ticket;
    } finally {stats.queued--; if (kind === 'foreground') foregroundWaiters--;}
  }
  function submit(record, start, data, defer, required = false) {
    const work = (async () => {
      try {
        if (defer) await new Promise(setImmediate);
        const key = await waitDone(record.keyPromise, record.controller.signal);
        if (record.retired || record.diskUnavailable) throw problem('cache-io');
        if (await store.put(key, start, data)) stats.committedBytes += data.length;
        else throw problem('cache-io');
      } catch (error) {stats.skippedWrites++; if (required) throw error;}
      finally {stats.captureBytes -= data.length;}
    })();
    track(record.writeJobs, track(writes, work)); stats.peakWriteJobs = Math.max(stats.peakWriteJobs, writes.size);
    return work;
  }
  async function fetchRange(record, start, length, {kind, signal, onData, save = true, probe = false, preparedRead, onValidated, headersOnly = false}) {
    save = save && (kind !== 'foreground' || cacheForeground);
    await refresh(record);
    const ticket = await acquire(kind, signal), combined = AbortSignal.any([signal, ticket.controller.signal, record.controller.signal]);
    let request, response, requestClosed, timer, capture, finalRequiredWrite, count = 0, blockOffset = 0, blockPosition = 0, blockCapacity = 0;
    const recordKeyPromise = record.keyPromise; let preparedChosen;
    try {
      useRecord(record);
      if (combined.aborted) throw cancelled();
      if (resolveAccess) {
        let access;
        try {access = await resolveAccess(record.identity, record.grant, {signal: combined});}
        catch {retire(record); throw problem('source-unavailable');}
        useRecord(record); if (combined.aborted) throw cancelled();
        const refreshed = grantOf({...access, metadata: record.grant.metadata});
        if (refreshed.origin !== record.grant.origin || refreshed.userAgent !== record.grant.userAgent ||
            access.expectedSize !== undefined && access.expectedSize !== record.metadata.total) {
          retire(record, true); throw problem('representation-changed');
        }
        record.grant.url = refreshed.url;
      }
      const headers = {Range: `bytes=${start}-${start + length - 1}`, 'Accept-Encoding': 'identity', Connection: 'close'};
      if (record.grant.userAgent !== undefined) headers['User-Agent'] = record.grant.userAgent;
      if (!onValidated && strong(record.metadata.etag)) headers['If-Match'] = record.metadata.etag;
      stats.originRequests++; const requestId = stats.originRequests; if (probe) stats.probeRequests++;
      stats.attemptedBytes += length; stats.activeOrigins++; stats.peakOrigins = Math.max(stats.peakOrigins, stats.activeOrigins);
      request = (record.grant.url.startsWith('https:') ? https : http).request(record.grant.url, {method: 'GET', headers, agent: false, highWaterMark: IO_HIGH_WATER});
      const incoming = new Promise((resolve, reject) => {request.once('response', resolve); request.once('error', reject);});
      requestClosed = new Promise(resolve => request.once('close', resolve));
      const abort = () => request.destroy(cancelled()); combined.addEventListener('abort', abort, {once: true});
      const arm = () => {clearTimeout(timer); timer = setTimeout(() => request.destroy(problem('origin-timeout')), timeoutMs);};
      arm();
      request.end();
      try {
        response = await incoming;
        useRecord(record); if (combined.aborted) throw cancelled();
        stats.originReadHighWaterMarkBytes = Math.max(stats.originReadHighWaterMarkBytes, response.readableHighWaterMark);
        arm();
        const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers['content-range'] || '');
        if ([401, 403].includes(response.statusCode)) {retire(record); throw problem('access-refused');}
        if (response.statusCode === 412 || m && Number(m[3]) !== record.metadata.total) throw problem('representation-changed');
        if (response.statusCode !== 206 || !m || Number(m[1]) !== start || Number(m[2]) !== start + length - 1 ||
            Number(response.headers['content-length']) !== length ||
            response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw problem('origin-range');
        const tag = response.headers.etag, modified = response.headers['last-modified'];
        if (record.rangeCount <= 8) record.observe('source-headers', {rangeStart: start, rangeEnd: start + length - 1, totalBytes: record.metadata.total, ...evidence.version({total: record.metadata.total, etag: tag, lastModified: modified})});
        let retainedMismatch = false;
        if (record.grant.retainedCandidate && !record.retainedValidated && !record.fallbackOriginal) {
          if (store.matchRetained(record.grant.retainedCandidate, {total: Number(m[3]), etag: tag})) {
            // Match against the stored hashed validator, never put that hash in
            // a raw ETag field or rebuild the retained key from new date fields.
            record.retainedValidated = true; record.metadata = {total: Number(m[3]), etag: tag};
            record.observe('retained-validated', {totalBytes: record.metadata.total,
              etagHash: record.grant.retainedCandidate.etagHash, versionHash: record.grant.retainedCandidate.versionHash});
          } else {
            if (!strong(tag)) throw problem('validator-unavailable');
            retainedMismatch = true;
          }
        }
        const changed = retainedMismatch || strong(record.metadata.etag) && tag !== record.metadata.etag ||
          record.metadata.lastModified !== undefined && modified !== record.metadata.lastModified;
        if (changed && !(onValidated && record.grant.preparedHandoff && !record.deliveredBytes && strong(tag))) throw problem('representation-changed');
        const nextMetadata = {...record.metadata};
        if (strong(tag)) nextMetadata.etag = tag;
        if (record.grant.preparedHandoff && strong(record.metadata.etag) && tag === record.metadata.etag && record.metadata.lastModified === undefined) delete nextMetadata.lastModified;
        else if (typeof modified === 'string') nextMetadata.lastModified = modified; else if (changed) delete nextMetadata.lastModified;
        if (changed) {
          // This exact, authorized Range response is itself playable. Its new
          // version cannot use old cache bytes; forward the SAME response at
          // once instead of adding a redirect/retry before the first frame.
          record.fallbackOriginal = true; record.diskUnavailable = true;
          record.metadata = nextMetadata; record.grant.metadata = {...nextMetadata}; record.metadataEpoch++;
          save = false;
          if (preparedRead) {preparedRead.then(value => value?.release(), () => {}); preparedRead = undefined;}
          track(controls, invalidateRecord(record, recordKeyPromise).catch(() => {}));
        } else if (JSON.stringify(nextMetadata) !== JSON.stringify(record.metadata)) {
          if (record.fallbackOriginal) {record.metadata = nextMetadata; record.grant.metadata = {...nextMetadata}; record.metadataEpoch++;}
          else prepareKey(record, nextMetadata);
        }
        record.accessChecked = true;
        if (onValidated) onValidated();
        if (headersOnly) return;
        if (kind === 'background') {
          // Background work has no player waiting for these bytes: throttle
          // this one response to durable admission instead of dropping blocks
          // and consuming a prefix that cannot subsequently be reused. Keep
          // foreground's optional, nonblocking disk tap below unchanged.
          for await (const chunk of response) {
            clearTimeout(timer);
            if (combined.aborted) throw cancelled(); useRecord(record);
            stats.receivedBytes += chunk.length;
            if (count + chunk.length > length) throw problem('origin-long-body');
            if (onOriginChunk) {
              try {onOriginChunk({requestId, start: start + count, length: chunk.length, kind, probe});}
              catch {stats.observerErrors++;}
            }
            let consumed = 0;
            while (consumed < chunk.length) {
              if (!blockPosition) {
                blockOffset = count; blockCapacity = Math.min(BLOCK, length - count);
                const available = () => 2 * (stats.captureBytes + blockCapacity) + stats.readReservedBytes <= mediaBufferBytes && writes.size < CAPTURE_JOBS;
                while (!available()) {
                  if (!writes.size) throw problem('cache-io');
                  await waitDone(Promise.race([...writes]), combined);
                }
                if (combined.aborted) throw cancelled(); useRecord(record);
                if (!save || !cacheEnabled || record.diskUnavailable) throw problem('cache-io');
                capture = Buffer.allocUnsafe(blockCapacity); stats.captureBytes += blockCapacity;
                stats.peakCaptureBytes = Math.max(stats.peakCaptureBytes, stats.captureBytes);
                stats.peakMediaReservedBytes = Math.max(stats.peakMediaReservedBytes, 2 * stats.captureBytes + stats.readReservedBytes);
              }
              const take = Math.min(chunk.length - consumed, blockCapacity - blockPosition);
              chunk.copy(capture, blockPosition, consumed, consumed + take);
              count += take; blockPosition += take; consumed += take;
              if (blockPosition === blockCapacity) {
                const complete = capture; capture = null; blockPosition = 0;
                const writing = submit(record, start + blockOffset, complete, false, true);
                if (count === length) finalRequiredWrite = writing;
                else await waitDone(writing, combined);
              }
            }
            arm();
          }
          clearTimeout(timer);
          if (count !== length) throw problem('origin-short-body');
        } else {
        // Flowing events avoid the async iterator's per-chunk queue/Promise
        // overhead. Exactly one chunk can wait for player drain; disk remains
        // an optional bounded tap and never participates in that wait.
        let cacheWinner;
        await new Promise((resolve, reject) => {
          let done = false, ended = false, blocked = false, sourceStarted = false;
          const chooseCache = value => {
            if (!value || value === preparedChosen) return;
            if (done || sourceStarted || !value.data || value.key !== record.key || value.epoch !== record.metadataEpoch || !retainedMatches(record) || combined.aborted || closed || record.retired) {value.release(); return;}
            cacheWinner = preparedChosen = value; done = true; clearTimeout(timer); stats.preparedCacheWins++; resolve();
          };
          if (preparedRead) preparedRead.then(chooseCache, () => {});
          const fail = error => {if (done) return; done = true; clearTimeout(timer); reject(error);};
          const finish = () => {
            if (done || !ended || blocked) return;
            if (count !== length) {fail(problem('origin-short-body')); return;}
            done = true; clearTimeout(timer); resolve();
          };
          response.on('error', fail);
          response.once('aborted', () => fail(problem('origin-short-body')));
          response.once('close', () => {if (!ended) fail(problem('origin-short-body'));});
          response.once('end', () => {ended = true; finish();});
          response.on('data', chunk => {
            if (done) return;
            try {
              clearTimeout(timer);
              if (combined.aborted) throw cancelled(); useRecord(record);
              stats.receivedBytes += chunk.length;
              if (count + chunk.length > length) throw problem('origin-long-body');
              if (onOriginChunk) {
                try {onOriginChunk({requestId, start: start + count, length: chunk.length, kind, probe});}
                catch {stats.observerErrors++;}
              }
              if (!sourceStarted) {sourceStarted = true; if (preparedRead) stats.preparedSourceWins++;}
              // Deliver first, then tap for disk. Foreground store hashing and
              // admission run after the current poll batch, within the same
              // existing capture reservations and write-job limit.
              const pending = onData && onData(chunk, ticket);
              if (pending) {
                blocked = true; response.pause();
                Promise.resolve(pending).then(() => {
                  blocked = false;
                  if (done) return;
                  if (combined.aborted) {fail(cancelled()); return;}
                  if (ended) finish();
                  else {arm(); response.resume();}
                }, fail);
              }
              let consumed = 0;
              while (consumed < chunk.length) {
                if (!blockPosition) {
                  blockOffset = count; blockCapacity = Math.min(BLOCK, length - count);
                  if (save && cacheEnabled && !record.diskUnavailable &&
                      2 * (stats.captureBytes + blockCapacity) + stats.readReservedBytes <= mediaBufferBytes && writes.size < CAPTURE_JOBS) {
                    capture = Buffer.allocUnsafe(blockCapacity); stats.captureBytes += blockCapacity;
                    stats.peakCaptureBytes = Math.max(stats.peakCaptureBytes, stats.captureBytes);
                    stats.peakMediaReservedBytes = Math.max(stats.peakMediaReservedBytes, 2 * stats.captureBytes + stats.readReservedBytes);
                  } else if (save && cacheEnabled) stats.skippedWrites++;
                }
                const take = Math.min(chunk.length - consumed, blockCapacity - blockPosition);
                if (capture) chunk.copy(capture, blockPosition, consumed, consumed + take);
                count += take; blockPosition += take; consumed += take;
                if (blockPosition === blockCapacity) {
                  if (capture) {
                    const complete = capture; capture = null;
                    // Two origins can have admitted partial blocks concurrently.
                    // Recheck completion so the job bound remains strict.
                    if (writes.size < CAPTURE_JOBS) submit(record, start + blockOffset, complete, kind === 'foreground');
                    else {stats.captureBytes -= complete.length; stats.skippedWrites++;}
                  }
                  blockPosition = 0;
                }
              }
              if (!pending) arm();
            } catch (error) {fail(error);}
          });
          if (preparedRead?.available) chooseCache(preparedRead.available);
        });
        if (cacheWinner) return {cache: cacheWinner};
        }
      } finally {combined.removeEventListener('abort', abort);}
    } catch (error) {
      if (record.rangeCount <= 8) record.observe('source-refused', {reason: error.reason || 'origin-unavailable', rangeStart: start, rangeEnd: start + length - 1});
      if (error.reason === 'representation-changed') {
        retire(record);
        track(controls, invalidateRecord(record, recordKeyPromise).catch(() => {}));
      }
      throw problem(combined.aborted ? 'cancelled' : error.reason || 'origin-unavailable');
    } finally {
      if (preparedRead) preparedRead.then(value => {if (value && value !== preparedChosen) value.release();}, () => {});
      if (capture) stats.captureBytes -= capture.length;
      clearTimeout(timer); if (response && !response.destroyed) response.destroy();
      if (request) {
        request.destroy();
        if (preparedChosen) {
          // The selected local bytes need not wait for socket teardown, but
          // that teardown still owns its connection slot and is joined on exit.
          track(controls, requestClosed.then(() => {stats.activeOrigins--; ticket.release();}));
        } else {await requestClosed; stats.activeOrigins--; ticket.release();}
      } else ticket.release();
    }
    // Network ownership is released before the last durable write drains.
    // Cancellation can therefore close/preempt a response independently of IO;
    // readiness still cannot be published until the write actually succeeds.
    if (finalRequiredWrite) await waitDone(finalRequiredWrite, combined);
  }
  function preparedRead(record, offset, maximum) {
    // Speculative LOCAL IO only. Version authorization below still gates every
    // byte. A slow/missing disk read never holds up the ordinary origin body.
    const job = (async () => {
      if (!cacheEnabled || !record.ready || record.diskUnavailable ||
          2 * stats.captureBytes + stats.readReservedBytes + 1048576 > mediaBufferBytes) return null;
      const key = record.key, epoch = record.metadataEpoch;
      const span = await store.span(key, offset); if (!span) return null;
      const boundary = await store.nextOffset(key, offset);
      const length = Math.min(BLOCK, maximum, span.end - offset, boundary === null ? Infinity : boundary - offset);
      if (!(length > 0) || record.retired || record.stopped || key !== record.key || epoch !== record.metadataEpoch) return null;
      if (closed || record.stopped || record.retired || key !== record.key || epoch !== record.metadataEpoch ||
          2 * stats.captureBytes + stats.readReservedBytes + 1048576 > mediaBufferBytes) return null;
      stats.readReservedBytes += 1048576;
      stats.peakMediaReservedBytes = Math.max(stats.peakMediaReservedBytes, 2 * stats.captureBytes + stats.readReservedBytes);
      const deadline = performance.now() + 30;
      let ioDone = false, releaseWanted = false, released = false, retained = false, value;
      const release = () => {releaseWanted = true; if (ioDone && !released) {released = true; stats.readReservedBytes -= 1048576;} if (value) value.data = null;};
      const read = track(controls, Promise.resolve().then(() => store.read(key, offset, length)).finally(() => {ioDone = true; if (releaseWanted) release();}));
      let timer;
      try {
        const data = await Promise.race([read, new Promise(resolve => {timer = setTimeout(() => resolve(null),30);})]);
        if (!Buffer.isBuffer(data) || data.length !== length || performance.now() >= deadline || record.retired || record.stopped || key !== record.key || epoch !== record.metadataEpoch) return null;
        retained = true; return value = {data, length, key, epoch, release};
      } catch {return null;} finally {clearTimeout(timer); if (!retained) release();}
    })();
    const candidate = track(controls, job);
    candidate.then(value => {candidate.available = value;}, () => {});
    return candidate;
  }
  function startPreparedRead(record, range, {signal, onData, head}) {
    if (record.preparedCheck) return false;
    record.preparedValidation = 'checking'; let decide, decided = false;
    record.preparedCheck = new Promise(resolve => {decide = value => {if (!decided) {decided = true; resolve(value);}};});
    const candidate = head ? undefined : preparedRead(record, range.start, range.end - range.start + 1);
    let transferredWinner;
    // This is the player's ordinary Range request, not an extra 0-0 probe.
    // Exact response headers must authorize the saved strong version. Cache
    // may win before the first origin chunk; otherwise that body flows at once.
    record.initialFetch = track(controls, fetchRange(record, range.start, range.end - range.start + 1,
      {kind: 'foreground', signal, onData, preparedRead: candidate, headersOnly: head,
       onValidated() {useRecord(record); record.preparedValidation = record.fallbackOriginal ? 'fallback' : 'ready'; record.finishFirstAccess(!record.fallbackOriginal); decide(true);}}).then(result => {transferredWinner = result && result.cache; return result;}).catch(async error => {
      if (decided) throw error;
      record.finishFirstAccess(false);
      if (!closed && !record.stopped && !record.deliveredBytes && routes.get(record.routeToken) === record) {
        try {
          const accessSignal = record.fallbackController.signal;
          const access = resolveAccess ? await resolveAccess(record.identity, record.grant, {signal: accessSignal}) :
            await authorize(record.identity, {reason: 'fallback', signal: accessSignal});
          const checked = grantOf({...access, metadata: record.metadata});
          if (checked.origin !== record.grant.origin || checked.userAgent !== record.grant.userAgent || closed ||
              accessSignal.aborted || record.stopped || record.deliveredBytes || routes.get(record.routeToken) !== record) throw cancelled();
          record.grant.url = checked.url; record.fallbackOriginal = true; record.preparedValidation = 'fallback'; decide(false); return;
        } catch (_) {}
      }
      record.preparedValidation = 'failed'; decide(false); throw error;
    }).finally(() => {
      if (candidate) candidate.then(value => {if (value && value !== transferredWinner) value.release();}, () => {});
    }));
    record.initialFetch.catch(() => {}); return true;
  }
  async function serve(req, res) {
    const record = routes.get(req.url), expectedHost = '127.0.0.1:' + server.address().port;
    if (closed || !record || req.headers.host !== expectedHost || req.headers.origin || req.headers.referer || !['GET', 'HEAD'].includes(req.method)) {res.writeHead(403); res.end(); return;}
    if (record.retired && !record.fallbackOriginal && record.preparedValidation !== 'checking') {res.writeHead(410); res.end(); return;}
    if (stats.activeBodies >= 2) {res.writeHead(503); res.end(); return;}
    const range = rangeOf(req.headers.range, record.metadata.total);
    if (!range) {res.writeHead(416); res.end(); return;}
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, record.controller.signal]);
    const abort = () => controller.abort(); res.once('close', abort); req.once('aborted', abort);
    record.bodyControllers.add(controller);
    const responseClosed = new Promise(resolve => {res.once('finish', resolve); res.once('close', resolve);});
    stats.localWriteHighWaterMarkBytes = Math.max(stats.localWriteHighWaterMarkBytes, res.writableHighWaterMark);
    stats.activeBodies++; stats.peakBodies = Math.max(stats.peakBodies, stats.activeBodies);
    const ordinal = ++record.rangeCount; let selectedLocalBytes = 0, queuedLocalBytes = 0, queuedSourceBytes = 0, flushedLocalBytes = 0, flushedSourceBytes = 0, complete = false;
    const headers = {'Content-Type': 'application/octet-stream', 'Content-Length': range.end - range.start + 1,
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'};
    if (range.partial) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${record.metadata.total}`;
    const write = (bytes, ticket, local = false) => {
      useRecord(record); if (signal.aborted) throw cancelled();
      if (!res.headersSent) res.writeHead(range.partial ? 206 : 200, headers);
      stats.deliveredBytes += bytes.length; record.deliveredBytes += bytes.length;
      stats.localWrites++;
      const accepted = res.write(bytes, error => {
        if (error) return;
        if (local) {flushedLocalBytes += bytes.length; record.flushedLocalBytes += bytes.length;}
        else {flushedSourceBytes += bytes.length; record.flushedSourceBytes += bytes.length;}
      });
      if (local) {queuedLocalBytes += bytes.length; record.queuedLocalBytes += bytes.length;}
      else {queuedSourceBytes += bytes.length; record.queuedSourceBytes += bytes.length;}
      if (!accepted) {
        stats.backpressureWrites++;
        return (async () => {
        if (ticket) {ticket.idle = true; ticket.idleAt = performance.now();}
        let drained = false;
        try {await once(res, 'drain', {signal}); drained = true;}
        finally {
          if (ticket) {
            ticket.idle = false;
            if (drained && !signal.aborted && !record.retired && !closed) {
              const background = [...active].filter(item => item.kind === 'background');
              for (const item of background) item.controller.abort();
              await waitDone(Promise.all(background.map(item => item.done)), signal);
            }
          }
        }
        })();
      }
    };
    const redirectOriginal = async () => {
      const access = resolveAccess ? await resolveAccess(record.identity, record.grant, {signal: controller.signal}) :
        await authorize(record.identity, {reason: 'fallback', signal: controller.signal});
      const checked = grantOf({...access, metadata: record.metadata});
      if (checked.origin !== record.grant.origin || checked.userAgent !== record.grant.userAgent || closed ||
          controller.signal.aborted || record.stopped || record.deliveredBytes || routes.get(req.url) !== record) throw cancelled();
      record.grant.url = checked.url;
      res.writeHead(307, {Location: record.grant.url, 'Cache-Control': 'no-store'}); res.end();
    };
    const work = (async () => {
      let firstCached, ownsInitial = false;
      try {
        if (record.grant.preparedHandoff) {
          record.firstMediaOffset ??= range.start;
          const first = startPreparedRead(record, range, {signal, onData: write, head: req.method === 'HEAD'}); ownsInitial = first;
          if (!await waitDone(record.preparedCheck, controller.signal)) {
            if (!record.fallbackOriginal) throw cancelled();
            await redirectOriginal(); return;
          }
          if (first) {
            const result = await waitDone(record.initialFetch, controller.signal);
            record.initialFetch = null;
            firstCached = result && result.cache;
            if (req.method !== 'HEAD' && !firstCached) {res.end(); return;}
          }
        }
        if (req.method === 'HEAD') {res.writeHead(range.partial ? 206 : 200, headers); res.end(); return;}
        // Experiment only: an open-ended request can choose one complete
        // origin response rather than splice a cached prefix into a new gap.
        // Latch before any body byte. This trades partial-preload acceleration
        // for direct-like seeking; no bytes beyond the client range are read.
        const openEnded = !req.headers.range || /^bytes=\d+-$/.test(req.headers.range);
        if (requestPolicy === 'coherent' && openEnded) {
          const coverage = cacheEnabled && record.ready && !record.diskUnavailable && await store.span(record.key, range.start);
          if (!coverage || coverage.end <= range.end) {
            stats.wholeResponseRequests++;
            if (coverage) {stats.partialPrefixBypasses++; stats.bypassedPrefixBytes += Math.min(coverage.end, range.end + 1) - range.start;}
            await fetchRange(record, range.start, range.end - range.start + 1, {kind: 'foreground', signal, onData: write});
            res.end(); return;
          }
        }
        // Latch per response. During a genuinely cold preparation, do not
        // splice newly captured probe bytes back into this load: that can make
        // the demuxer block at an artificial HTTP gap before a queued seek.
        // Pre-existing/restored data and explicitly finished preloads stay live.
        let readCache = cacheEnabled && !record.fallbackOriginal && retainedMatches(record) && (record.coldAtOpen === false || record.actualStarted || record.preloadReady);
        let offset = range.start;
        if (firstCached && !retainedMatches(record)) {firstCached.release(); firstCached = null; readCache = false;}
        if (firstCached) {
          try {
            useRecord(record); if (signal.aborted || firstCached.key !== record.key || firstCached.epoch !== record.metadataEpoch) throw cancelled();
            stats.hitBytes += firstCached.data.length; record.localHitBytes += firstCached.data.length; selectedLocalBytes += firstCached.data.length;
            await write(firstCached.data, undefined, true); offset += firstCached.data.length;
          } finally {firstCached.release(); firstCached = null; record.initialFetch = null;}
        }
        // Each physical block has a finite read window. Fast/missing reads do not wait.
        // Another seek owns a separate cancellable response; late IO retains its owner.
        const readGracePerBlock = 15;
        while (offset <= range.end) {
          useRecord(record); if (signal.aborted) throw cancelled();
          await refresh(record);
          if (readCache && !retainedMatches(record)) readCache = false;
          let span = readCache && record.ready && !record.diskUnavailable && await store.span(record.key, offset);
          if (span && !record.accessChecked) {
            await fetchRange(record, offset, 1, {kind: 'foreground', signal, save: false, probe: true});
            await record.keyPromise; continue;
          }
          if (span) {
            const epoch = record.metadataEpoch, key = record.key;
            // span merges adjacent blocks; reading across their actual boundary
            // needlessly reads and hashes the following whole physical block.
            const boundary = await waitDone(store.nextOffset(key, offset), signal);
            useRecord(record); if (signal.aborted) throw cancelled();
            if (epoch !== record.metadataEpoch || key !== record.key) throw problem('stale-read');
            const length = Math.min(BLOCK, span.end - offset, range.end - offset + 1,
              boundary === null ? Infinity : boundary - offset);
            if (!(length > 0)) throw problem('invalid-span');
            let data;
            if (2 * stats.captureBytes + stats.readReservedBytes + 1048576 <= mediaBufferBytes) {
              stats.readReservedBytes += 1048576;
              stats.peakMediaReservedBytes = Math.max(stats.peakMediaReservedBytes, 2 * stats.captureBytes + stats.readReservedBytes);
              const readStarted = performance.now();
              const deadline = readStarted + 15 + readGracePerBlock;
              const read = track(controls, store.read(key, offset, length).finally(() => {stats.readReservedBytes -= 1048576;}));
              let timer;
              try {
                const result = await waitDone(Promise.race([read.then(value => ({data: value, timedOut: false})), new Promise(resolve => {
                  const expire = () => {
                    const remaining = deadline - performance.now();
                    if (remaining > 0) {timer = setTimeout(expire, Math.ceil(remaining)); return;}
                    resolve({data: null, timedOut: true});
                  };
                  timer = setTimeout(expire, Math.max(1, Math.ceil(deadline - performance.now())));
                })]), signal);
                data = result.data;
                if (result.timedOut) stats.localReadTimeouts++;
                else if (!data) stats.localReadRefusals++;
              } finally {
                clearTimeout(timer);
                const spent = Math.min(readGracePerBlock, Math.max(0, performance.now() - readStarted - 15));
                stats.localReadGraceMs += spent;
              }
            }
            useRecord(record); if (signal.aborted) throw cancelled();
            if (epoch !== record.metadataEpoch || key !== record.key) throw problem('stale-read');
            if (data && !retainedMatches(record)) {data = null; readCache = false;}
            if (data) {stats.hitBytes += data.length; record.localHitBytes += data.length; selectedLocalBytes += data.length; await write(data, undefined, true); offset += data.length; continue;}
            // Invalid/missing local data falls through to ordinary origin IO.
          }
          const next = readCache && record.ready && await store.nextOffset(record.key, offset);
          const length = Math.min(range.end - offset + 1, next === null || next === false ? Infinity : next - offset);
          if (!(length > 0)) throw problem('invalid-hole');
          await fetchRange(record, offset, length, {kind: 'foreground', signal, onData: write});
          offset += length;
        }
        res.end();
      } catch {
        if (!res.headersSent) {res.writeHead(502); res.end();} else res.destroy();
      } finally {
        if (firstCached) firstCached.release();
        if (ownsInitial && record.initialFetch) {
          const pending = record.initialFetch;
          pending.then(result => {result?.cache?.release(); if (record.initialFetch === pending) record.initialFetch = null;}, () => {if (record.initialFetch === pending) record.initialFetch = null;});
        }
        await responseClosed;
        complete = req.method === 'HEAD' ? res.writableFinished === true : res.writableFinished === true && flushedLocalBytes + flushedSourceBytes === range.end - range.start + 1;
        if (ordinal <= 8) record.observe('range-end', {method: req.method, rangeOrdinal: ordinal, rangeStart: range.start, rangeEnd: range.end, selectedLocalBytes, queuedLocalBytes, queuedSourceBytes, flushedLocalBytes, flushedSourceBytes, complete, fallbackOriginal: record.fallbackOriginal});
        stats.activeBodies--; record.bodyControllers.delete(controller); res.removeListener('close', abort); req.removeListener('aborted', abort);}
    })();
    track(jobs, track(record.bodyJobs, work));
  }
  const server = http.createServer({highWaterMark: IO_HIGH_WATER}, (req, res) => {serve(req, res).catch(() => res.destroy());});
  server.maxConnections = 8; server.headersTimeout = 10000; server.requestTimeout = 30000;
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  let actualRevision = 0;
  function open(value, role = 'current') {
    const retiredPending = [...pendingKeyRecords].filter(record => record.retired).length;
    if (closed || routes.size + openings.size + retiredPending >= 4 || !['current', 'next'].includes(role)) return Promise.reject(problem('route-limit'));
    const identity = identityOf(value), controller = new AbortController(); openings.add(controller);
    const work = (async () => {
    try {
    const grant = grantOf(await authorize(identity, {reason: 'open', signal: controller.signal}));
    if (closed || controller.signal.aborted) throw cancelled();
    if (grant.preparedHandoff && (requestPolicy !== 'sparse' ||
        !strong(grant.metadata.etag) && (!grant.retainedCandidate || grant.retainedCandidate.total !== grant.metadata.total ||
          typeof store.openRetained !== 'function' || typeof store.matchRetained !== 'function'))) throw problem('configuration');
    const record = {identity, role, grant, metadata: {...grant.metadata}, controller, retired: false, metadataEpoch: 0,
      ready: false, accessChecked: grant.accessChecked, fallbackOriginal: false, deliveredBytes: 0, stopped: false, fallbackController: new AbortController(), preparedValidation: grant.preparedHandoff ? 'pending' : undefined, diskUnavailable: false, bodyControllers: new Set(), bodyJobs: new Set(), writeJobs: new Set(), actualStarted: false, preloadReady: false, localHitBytes: 0, queuedLocalBytes: 0, queuedSourceBytes: 0, flushedLocalBytes: 0, flushedSourceBytes: 0, rangeCount: 0, observe: evidence.create(onEvidence, identity)};
    record.firstAccess = grant.preparedHandoff ? new Promise(resolve => {let done = false; record.finishFirstAccess = value => {if (!done) {done = true; resolve(value);}};}) : Promise.resolve(true);
    record.observe('route-open', {role, preparedHandoff: grant.preparedHandoff, totalBytes: grant.metadata.total, retainedHandoff: !!grant.retainedCandidate, ...(grant.retainedCandidate ? {validator: 'stored-hash-candidate', versionHash: grant.retainedCandidate.versionHash, etagHash: grant.retainedCandidate.etagHash} : evidence.version(grant.metadata))});
    prepareKey(record, grant.metadata);
    const route = '/' + crypto.randomBytes(24).toString('hex'); record.routeToken = route; routes.set(route, record);
    return {url: 'http://127.0.0.1:' + server.address().port + route,
      status: () => ({localHitBytes: record.localHitBytes, ...(record.preparedValidation ? {preparedValidation: record.preparedValidation} : {}), ...(record.grant.retainedCandidate ? {retainedHandoff: true} : {}), ...(record.fallbackOriginal ? {fallbackOriginal: true} : {})}),
      preparedMetadata: () => record.ready && !record.retired && !record.diskUnavailable ? {...record.metadata} : null,
      ready: () => record.keyPromise, actual: () => {
        if (record.fallbackOriginal) return Promise.resolve(false);
        useRecord(record); const revision = ++actualRevision;
        return track(controls, (async () => {
          if (!await record.firstAccess) return false;
          if (!retainedMatches(record)) return false;
          while (true) {
            const epoch = record.metadataEpoch;
            let key;
            try {key = await waitDone(record.keyPromise, record.controller.signal);}
            catch (error) {
              useRecord(record);
              if (revision !== actualRevision) throw cancelled();
              if (epoch !== record.metadataEpoch) continue;
              throw error;
            }
            useRecord(record); if (revision !== actualRevision) throw cancelled();
            if (epoch !== record.metadataEpoch) continue;
            if (!retainedMatches(record)) return false;
            if (store.status().currentKey === key) {record.role = 'current'; record.actualStarted = true; return true;}
            const changed = await store.actual(key, {isCurrent: () => !closed && !record.retired && revision === actualRevision && epoch === record.metadataEpoch,
              preferredOffset: record.grant.preparedHandoff ? record.firstMediaOffset ?? 0 : null});
            useRecord(record); if (revision !== actualRevision) throw cancelled();
            if (epoch !== record.metadataEpoch) continue;
            if (changed) {record.role = 'current'; record.actualStarted = true;}
            return changed;
          }
        })());
      },
      // Experimental adapter seek hint. Submit the ordinary asynchronous engine
      // seek first, then interrupt this snapshot of old foreground IO. New target
      // bodies, other routes, authorization and cached spans remain owned.
      prepareForegroundInterruption() {
        useRecord(record);
        const controllers = [...record.bodyControllers], oldJobs = [...record.bodyJobs];
        return async () => {
          for (const controller of controllers) controller.abort();
          await Promise.allSettled(oldJobs);
          return {interruptedBodies: controllers.length};
        };
      },
      retire() {record.stopped = true; record.fallbackController.abort(); retire(record); routes.delete(route);},
      async stop() {
        record.stopped = true; record.fallbackController.abort(); retire(record); routes.delete(route);
        await Promise.allSettled([...record.bodyJobs, ...record.writeJobs, record.preloadJob].filter(Boolean));
      },
      coverage() {return record.ready ? store.coverage(record.key) : {bytes: 0, total: record.metadata.total, verifiedBytes: 0};},
      async preload({maxBytes, signal}) {
        if (record.preloadJob) return record.preloadJob;
        if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !signal) throw problem('preload-budget');
        const combined = AbortSignal.any([signal, record.controller.signal]);
        const total = record.metadata.total, budget = Math.min(maxBytes, total);
        const head = total <= budget ? budget : Math.floor(budget * 0.8);
        const ranges = [{start: 0, end: head}, ...(head < budget ? [{start: total - (budget - head), end: total}] : [])];
        let spent = 0;
        const work = (async () => {
          try {
          await waitDone(record.keyPromise, combined);
          for (const range of ranges) for (let offset = range.start; offset < range.end;) {
            useRecord(record); if (combined.aborted) throw cancelled();
            const span = await store.span(record.key, offset);
            if (span) {offset = Math.min(range.end, span.end); continue;}
            const next = await store.nextOffset(record.key, offset);
            const length = Math.min(range.end - offset, next === null ? Infinity : next - offset, maxBytes - spent);
            if (length <= 0) return {spent};
            spent += length; // Aborted attempts are charged, not hidden as retries.
            await fetchRange(record, offset, length, {kind: 'background', signal: combined});
            await Promise.allSettled([...record.writeJobs]); offset += length;
          }
          useRecord(record); if (combined.aborted) throw cancelled();
          record.preloadReady = true;
          return {spent};
          } catch (error) {
            // A write/admission refusal ends this response, never retries its
            // bytes, and retains the established partial-coverage contract.
            // Only actual stored coverage can be reported by the adapter.
            if (error.reason !== 'cache-io') throw error;
            useRecord(record); if (combined.aborted) throw cancelled();
            return {spent, ready: false, partial: true};
          }
        })();
        record.preloadJob = work;
        work.then(() => {if (record.preloadJob === work) record.preloadJob = null;},
          () => {if (record.preloadJob === work) record.preloadJob = null;});
        return track(jobs, work);
      }};
    } finally {openings.delete(controller);}
    })(); return track(controls, work);
  }
  async function drain() {
    while (jobs.size || writes.size || controls.size) await Promise.allSettled([...jobs, ...writes, ...controls]);
  }
  function close() {
    if (closePromise) return closePromise;
    closePromise = (async () => {
      closed = true; for (const record of routes.values()) {record.stopped = true; record.fallbackController.abort(); retire(record);}
      routes.clear(); for (const controller of openings) controller.abort();
      for (const ticket of active) ticket.controller.abort();
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
      await drain(); await store.close();
    })(); return closePromise;
  }
  return {open, drain, close, status: () => ({...stats, routes: routes.size, openings: openings.size, pendingKeys: pendingKeyRecords.size, writes: writes.size, jobs: jobs.size,
    foregroundIdle: [...active].filter(t => t.kind === 'foreground' && t.idle).length,
    confidence: 'metadata-assumed-unless-strong-validator', store: store.status()})};
}
module.exports = {createProxy, rangeOf};
