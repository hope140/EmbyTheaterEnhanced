'use strict';

// Isolated process for cache/proxy memory measurements. The parent owns the
// fixture server and every client response body; this child owns only the
// explicitly granted proxy and private store.
const {createStore} = require('./store.cjs');
const {createProxy} = require('./proxy.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');

function memory() {
  const value = process.memoryUsage();
  return {rss: value.rss, heapUsed: value.heapUsed, external: value.external};
}
function send(message) {
  if (process.send) process.send(message);
}
function safeError() {
  return {error: 'worker-error'};
}
function validGrant(grant) {
  if (!grant || typeof grant.url !== 'string' || typeof grant.origin !== 'string' || !grant.metadata ||
      !Number.isSafeInteger(grant.metadata.total) || grant.metadata.total !== 8 * 1024 * 1024) return false;
  try {
    const url = new URL(grant.url);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.origin === grant.origin &&
      !url.username && !url.password && !url.hash;
  } catch {return false;}
}
function countWrite(file, data, counters) {
  const name = path.basename(file);
  const bytes = Buffer.isBuffer(data) ? data.byteLength : Buffer.byteLength(String(data));
  if (/^\.block-[a-f0-9-]+\.tmp$/.test(name)) {
    counters.mediaBlockTempWrites++;
    counters.mediaBlockTempBytes += bytes;
  } else if (/^\.index-[a-f0-9-]+\.tmp$/.test(name)) {
    counters.indexWrites++;
    counters.indexBytes += bytes;
  }
}

let proxy, current, next, sampling, stopped = false;
let baseline, peak;
let report = null;
let config, writeCounters, writePressure;

async function finish() {
  if (stopped) return;
  stopped = true;
  clearInterval(sampling);
  if (proxy) {
    const before = proxy.status();
    const storeBeforeClose = before.store;
    await proxy.close();
    const after = proxy.status();
    report = {
      baseline, peak: peak || memory(),
      reservations: {
        peakMediaBytes: before.peakMediaReservedBytes,
        peakCaptureBytes: before.peakCaptureBytes,
        peakStoreBytes: before.store.peak,
        peakWriteJobs: before.peakWriteJobs || 0,
      },
      disk: {
        currentDiskBytes: config.currentDiskBytes,
        nextDiskBytes: config.nextDiskBytes,
        pendingWriteBytes: config.pendingWriteBytes,
        committedBytes: storeBeforeClose.committed,
        peakStoreBytes: storeBeforeClose.peak,
        reservedBytesAtDrain: storeBeforeClose.reserved,
        pendingBytesAtDrain: storeBeforeClose.pending,
      },
      completedLogicalWrites: {...writeCounters},
      writePressure: {...writePressure},
      activity: {
        originRequests: before.originRequests,
        receivedBytes: before.receivedBytes,
        deliveredBytes: before.deliveredBytes,
        hitBytes: before.hitBytes,
        committedBytes: before.committedBytes,
        activeOriginsAtClose: after.activeOrigins,
        activeBodiesAtClose: after.activeBodies,
        routesAtClose: after.routes,
        openingsAtClose: after.openings,
        pendingKeysAtClose: after.pendingKeys,
        queuedAtClose: after.queued,
        writesAtClose: after.writes,
        jobsAtClose: after.jobs,
        peakWriteJobs: before.peakWriteJobs || 0,
        captureBytesAtClose: after.captureBytes,
        readReservedBytesAtClose: after.readReservedBytes,
        storeReservedBytesAtClose: after.store.reserved,
        storePendingBytesAtClose: after.store.pending,
        storePendingCountAtClose: after.store.pendingCount,
        storeReadersAtClose: after.store.readers,
        storeClosed: after.store.closed,
      },
    };
  }
  send({type: 'finished', report});
  if (process.connected) process.disconnect();
}

process.on('message', async message => {
  try {
    if (message?.type === 'setup') {
      if (proxy || !validGrant(message.grant)) throw new Error('invalid setup grant');
      const cfg = message.config;
      if (!cfg || !['forward-only', 'cache-enabled'].includes(cfg.mode) || typeof cfg.root !== 'string' ||
          cfg.currentDiskBytes !== 8 * 1024 * 1024 || cfg.nextDiskBytes !== 1024 * 1024 ||
          !Number.isSafeInteger(cfg.mediaBufferBytes) || cfg.mediaBufferBytes < 1024 * 1024 ||
          !Number.isSafeInteger(cfg.pendingWriteBytes) || cfg.pendingWriteBytes < 256 * 1024 ||
          cfg.pendingWriteBytes > cfg.mediaBufferBytes) throw new Error('invalid setup limits');
      const fixedGrant = message.grant;
      const identity = {
        server: 'loopback-memory-fixture', account: 'memory-parent-grant', item: 'deterministic-8m',
        mediaSource: 'single-representation', resource: 'fixture-bytes', representation: 'fixture-v1',
      };
      const preloadIdentity = {...identity, item: 'preload-target'};
      config = {...cfg};
      writeCounters = {mediaBlockTempWrites: 0, mediaBlockTempBytes: 0, indexWrites: 0, indexBytes: 0,
        journalWriteCalls: 0, journalBytes: 0, journalTruncates: 0};
      writePressure = {peakPendingBytes: 0, peakPendingCount: 0};
      const io = {...fs, async open(file, ...args) {
        const handle = await fs.open(file, ...args);
        if (path.basename(String(file)) !== 'index.log') return handle;
        return new Proxy(handle, {get(target, property) {
          if (property === 'write') return async (...args) => {
            const result = await target.write(...args);
            writeCounters.journalWriteCalls++; writeCounters.journalBytes += result.bytesWritten;
            return result;
          };
          if (property === 'truncate') return async (...args) => {
            const result = await target.truncate(...args); writeCounters.journalTruncates++; return result;
          };
          const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
        }});
      }, async writeFile(file, data, ...args) {
        await fs.writeFile(file, data, ...args);
        countWrite(file, data, writeCounters);
      }};
      const store = await createStore({root: cfg.root, io,
        currentBytes: cfg.currentDiskBytes, nextBytes: cfg.nextDiskBytes,
        maxPendingBytes: cfg.pendingWriteBytes});
      const storePut = store.put;
      store.put = (...args) => {
        const result = storePut(...args);
        const pending = store.status();
        writePressure.peakPendingBytes = Math.max(writePressure.peakPendingBytes, pending.pending);
        writePressure.peakPendingCount = Math.max(writePressure.peakPendingCount, pending.pendingCount);
        return result;
      };
      proxy = await createProxy({store, cacheEnabled: cfg.mode === 'cache-enabled', mediaBufferBytes: cfg.mediaBufferBytes,
        authorize: async requested => {
          if (JSON.stringify(requested) !== JSON.stringify(identity) &&
              JSON.stringify(requested) !== JSON.stringify(preloadIdentity)) throw new Error('unexpected identity');
          return fixedGrant;
        }});
      current = await proxy.open(identity);
      await current.ready();
      await current.actual();
      next = await proxy.open(preloadIdentity, 'next');
      await next.ready();
      baseline = memory(); peak = {...baseline};
      sampling = setInterval(() => {
        const sample = memory();
        for (const key of ['rss', 'heapUsed', 'external']) peak[key] = Math.max(peak[key], sample[key]);
      }, 2);
      sampling.unref();
      send({type: 'ready', currentUrl: current.url, nextUrl: next.url});
      return;
    }
    if (message?.type === 'preload' && proxy) {
      const result = await next.preload({maxBytes: 1024 * 1024, signal: new AbortController().signal});
      await proxy.drain();
      send({type: 'preloaded', spent: result.spent});
      return;
    }
    if (message?.type === 'drain' && proxy) {
      await proxy.drain();
      send({type: 'drained'});
      return;
    }
    if (message?.type === 'status' && proxy) {
      await proxy.drain();
      const s = proxy.status();
      send({type: 'status', hitBytes: s.hitBytes, receivedBytes: s.receivedBytes,
        originRequests: s.originRequests, committedBytes: s.committedBytes, peakMediaReservedBytes: s.peakMediaReservedBytes});
      return;
    }
    if (message?.type === 'finish') await finish();
  } catch (error) {
    send({type: 'failure', ...safeError(error)});
    await finish().catch(() => {});
  }
});

process.on('disconnect', () => {if (!stopped) finish().catch(() => process.exitCode = 1);});
process.on('uncaughtException', error => {send({type: 'failure', ...safeError(error)}); finish().catch(() => process.exitCode = 1);});
process.on('unhandledRejection', error => {send({type: 'failure', ...safeError(error)}); finish().catch(() => process.exitCode = 1);});
