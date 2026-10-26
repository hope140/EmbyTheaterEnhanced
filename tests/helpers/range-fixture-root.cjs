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
function linuxOccupiedPorts(text) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 2 * 1024 * 1024 || !/^\s*sl\s+local_address\s+/i.test(text)) throw Error('invalid-Linux-test-port-table');
    const ports = new Set();
    for (const line of text.trim().split(/\r?\n/).slice(1)) {
        if (!line.trim()) continue;
        const match = /^\s*\d+:\s+(?:[0-9a-f]{8}|[0-9a-f]{32}):([0-9a-f]{4})\s+/i.exec(line);
        if (!match) throw Error('invalid-Linux-test-port-table');
        const port = parseInt(match[1], 16); if (port) ports.add(port);
    }
    return ports;
}
const SNAPSHOT_ENV = 'ETE_TEST_WINDOWS_PORT_SNAPSHOT';
const SNAPSHOT_LIMIT = 8192;
function validateSnapshot(value) {
    const exactKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
        Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
    const port = value => Number.isInteger(value) && value >= 1 && value <= 65535;
    if (!exactKeys(value, ['schema', 'ranges', 'occupied']) || value.schema !== 1 ||
        !Array.isArray(value.ranges) || value.ranges.length > 4096 || !Array.isArray(value.occupied) || value.occupied.length > 65535 ||
        value.ranges.some(row => !exactKeys(row, ['start', 'end']) || !port(row.start) || !port(row.end) || row.end < row.start) ||
        value.occupied.some(value => !port(value)) || new Set(value.occupied).size !== value.occupied.length) {
        throw Error('invalid-Windows-test-port-snapshot');
    }
    return {ranges: value.ranges.map(({start, end}) => ({start, end})), occupied: new Set(value.occupied)};
}
function createWindowsPortPreflight({env = process.env, exec = execFileSync, log = value => console.log(value)} = {}) {
    let snapshot, failure;
    function read() {
        if (failure) throw failure;
        if (snapshot) return snapshot;
        try {
            if (Object.hasOwn(env, SNAPSHOT_ENV)) {
                const value = env[SNAPSHOT_ENV];
                if (typeof value !== 'string' || !value || Buffer.byteLength(value) > SNAPSHOT_LIMIT) throw Error('invalid-Windows-test-port-snapshot');
                let parsed;
                try {parsed = JSON.parse(value);} catch (_) {throw Error('invalid-Windows-test-port-snapshot');}
                snapshot = validateSnapshot(parsed);
            } else {
                const options = {encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 1048576};
                const ranges = excludedRanges(exec('netsh.exe', ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp'], options));
                const occupied = [...new Set(exec('netstat.exe', ['-ano', '-p', 'tcp'], options).split(/\r?\n/)
                    .map(line => /^\s*TCP\s+\S+:(\d+)\s+/.exec(line)).filter(Boolean).map(row => Number(row[1])))];
                snapshot = validateSnapshot({schema: 1, ranges, occupied});
                log(JSON.stringify({type: 'range-fixture-port-preflight', readOnly: true, excludedRanges: ranges.length, occupiedPorts: occupied.length, bindRetries: 0}));
            }
            return snapshot;
        } catch (error) {failure = error; throw error;}
    }
    function environment(platform = process.platform) {
        if (platform !== 'win32') return {...env};
        const {ranges, occupied} = read();
        const value = JSON.stringify({schema: 1, ranges, occupied: [...occupied].sort((a, b) => a - b)});
        if (Buffer.byteLength(value) > SNAPSHOT_LIMIT) {
            failure = Error('Windows-test-port-snapshot-too-large'); throw failure;
        }
        return {...env, [SNAPSHOT_ENV]: value};
    }
    return {read, environment};
}
const preflight = createWindowsPortPreflight();
const testEnvironment = (env = process.env, platform = process.platform) => {
    // Batch runners explicitly collect once before --test forks one process
    // per file. Standalone callers retain one bounded read in their process.
    return env === process.env ? preflight.environment(platform) : createWindowsPortPreflight({env}).environment(platform);
};
function temporaryRoot(prefix, relatives = []) {
    const original = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    let selected = original, moved = false;
    try {
        if (!relatives.length || !['win32', 'linux'].includes(process.platform)) return original;
        let ports;
        if (process.platform === 'win32') ports = preflight.read();
        else {
            const occupied = linuxOccupiedPorts(fs.readFileSync('/proc/net/tcp', 'utf8'));
            try {for (const port of linuxOccupiedPorts(fs.readFileSync('/proc/net/tcp6', 'utf8'))) occupied.add(port);}
            catch (error) {if (error.code !== 'ENOENT') throw error;}
            ports = {ranges: [], occupied};
        }
        const {ranges, occupied} = ports; selected = selectRoot(original, relatives, ranges, occupied);
        if (selected !== original) {
            // Both names are freshly owned temporary siblings; never overwrite.
            if (fs.existsSync(selected)) throw Error('fixture-root-collision');
            fs.renameSync(original, selected); moved = true;
        }
        return fs.realpathSync.native(selected);
    } catch (error) {fs.rmSync(moved ? selected : original, {recursive: true, force: true}); throw error;}
}
module.exports = {temporaryRoot, guardPort, excludedRanges, selectRoot, createWindowsPortPreflight, testEnvironment, linuxOccupiedPorts};
