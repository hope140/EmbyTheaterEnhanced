'use strict';
// Representation identity and OS exclusion only; no media persistence/index/restore engine.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const strongTag = value => typeof value === 'string' && /^"[\x21\x23-\x7e]{1,255}"$/.test(value);
const integer = value => Number.isSafeInteger(value) && value > 0;
function identityKey(identity, proof) {
    const fields = ['serverId', 'serverOrigin', 'accountId', 'itemId', 'mediaSourceId', 'representation'];
    if (!identity || fields.some(k => typeof identity[k] !== 'string' || !identity[k] || identity[k].length > 2048) ||
        !proof || !strongTag(proof.etag) || !integer(proof.total)) throw Error('range-identity-invalid');
    return sha(JSON.stringify(fields.map(k => identity[k]).concat(proof.etag, proof.total)));
}

async function acquireGuard(root) {
    // OS lifetime, not PID guesses or stale-file timing. A collision disables caching.
    const canonical = process.platform === 'win32' ? root.toLowerCase() : root;
    const port = 40000 + crypto.createHash('sha256').update('ETE-range-v2:' + canonical).digest().readUInt32BE(0) % 20000;
    const guard = net.createServer(socket => socket.destroy()); guard.maxConnections = 1;
    await new Promise((resolve, reject) => {guard.once('error', reject); guard.listen({host: '127.0.0.1', port, exclusive: true, reusePort: false}, resolve);});
    guard.unref();
    return {close: () => new Promise((resolve, reject) => guard.close(error => error ? reject(error) : resolve()))};
}

module.exports = {identityKey, strongTag, acquireGuard};
