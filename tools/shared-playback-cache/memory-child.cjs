'use strict';

// Isolated process for cache/proxy memory measurements. The parent owns the
// fixture server and every client response body; this child owns only the
// explicitly granted proxy and private store.
const {createStore} = require('./store.cjs');
const {createProxy} = require('./proxy.cjs');

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

let proxy, current, next, sampling, stopped = false;
let baseline, peak;
let report = null;

async function finish() {
  if (stopped) return;
  stopped = true;
  clearInterval(sampling);
  if (proxy) {
    const before = proxy.status();
    await proxy.close();
    const after = proxy.status();
    report = {
      baseline, peak: peak || memory(),
      reservations: {
        peakMediaBytes: before.peakMediaReservedBytes,
        peakCaptureBytes: before.peakCaptureBytes,
        peakStoreBytes: before.store.peak,
      },
      activity: {
        originRequests: before.originRequests,
        receivedBytes: before.receivedBytes,
        deliveredBytes: before.deliveredBytes,
        hitBytes: before.hitBytes,
        committedBytes: before.committedBytes,
        activeOriginsAtClose: after.activeOrigins,
        activeBodiesAtClose: after.activeBodies,
        routesAtClose: after.routes,
        writesAtClose: after.writes,
        jobsAtClose: after.jobs,
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
      const store = await createStore({root: cfg.root,
        currentBytes: cfg.currentDiskBytes, nextBytes: cfg.nextDiskBytes,
        maxPendingBytes: cfg.pendingWriteBytes});
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
