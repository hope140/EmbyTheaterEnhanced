'use strict';
// Test setup only: keep real product guards and real cross-process exclusion.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), {execFileSync} = require('node:child_process');
function guardPort(root, platform = process.platform) {
    const canonical = platform === 'win32' ? root.toLowerCase() : root;
    return 40000 + crypto.createHash('sha256').update('ETE-range-v2:' + canonical).digest().readUInt32BE(0) % 20000;
}
function excludedRanges(text) {
    return text.split(/\r?\n/).map(line => /^\s*(\d+)\s+(\d+)(?:\s+\*)?\s*$/.exec(line)).filter(Boolean).map(row => {
        const start = Number(row[1]), end = Number(row[2]);
        if (start < 1 || end < start || end > 65535) throw Error('invalid-Windows-port-exclusions');
        return {start, end};
    });
}
function selectRoot(root, relatives, ranges, occupied = new Set(), platform = process.platform) {
    // Select a fresh fixture identity before any store/bind attempt. Never retry
    // EACCES or substitute the product's fixed guard with an unrelated port.
    for (let suffix = 0; suffix < 10000; suffix++) {
        const candidate = root + (suffix ? '-' + suffix : '');
        if (relatives.every(relative => {
            const port = guardPort(path.join(candidate, relative), platform);
            return !occupied.has(port) && !ranges.some(range => port >= range.start && port <= range.end);
        })) return candidate;
    }
    throw Error('no-admissible-fixture-guard-root');
}
let snapshot;
function windowsPorts() {
    if (snapshot) return snapshot;
    const options = {encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1048576};
    const ranges = excludedRanges(execFileSync('netsh.exe', ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], options));
    const occupied = new Set(execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], options).split(/\r?\n/)
        .map(line => /^\s*TCP\s+\S+:(\d+)\s+/.exec(line)).filter(Boolean).map(row => Number(row[1])));
    console.log(JSON.stringify({type: 'range-fixture-port-preflight', readOnly: true, excludedRanges: ranges.length, occupiedPorts: occupied.size, bindRetries: 0}));
    return snapshot = {ranges, occupied};
}
function temporaryRoot(prefix, relatives = []) {
    const original = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    let selected = original, moved = false;
    try {
        if (process.platform !== 'win32' || !relatives.length) return original;
        const {ranges, occupied} = windowsPorts(); selected = selectRoot(original, relatives, ranges, occupied);
        if (selected !== original) {
            // Both names are freshly owned temporary siblings; never overwrite.
            if (fs.existsSync(selected)) throw Error('fixture-root-collision');
            fs.renameSync(original, selected); moved = true;
        }
        return fs.realpathSync.native(selected);
    } catch (error) {fs.rmSync(moved ? selected : original, {recursive: true, force: true}); throw error;}
}
module.exports = {temporaryRoot, guardPort, excludedRanges, selectRoot};
