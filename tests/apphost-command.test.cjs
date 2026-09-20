'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const command = require('../src/electronapp/apphost-command');

test('window state commands canonicalize legacy case and standard-scheme slash', () => {
    for (const [url, expected] of [
        ['electronapphost://windowstate-Maximized', 'windowstate-maximized'],
        ['electronapphost://windowstate-maximized', 'windowstate-maximized'],
        ['electronapphost://windowstate-Maximized/', 'windowstate-maximized'],
        ['electronapphost://windowstate-maximized/', 'windowstate-maximized'],
        ['electronapphost://windowstate-Normal/', 'windowstate-normal'],
        ['electronapphost://windowstate-Fullscreen/', 'windowstate-fullscreen'],
        ['electronapphost://windowstate-Minimized/', 'windowstate-minimized']
    ]) {
        const parsed = command.parse(url, 'electronapphost');
        assert.equal(parsed.command, expected, url);
        assert.equal(command.isKnown(parsed.command), true, url);
    }
});

test('all current apphost commands remain recognized after canonicalization', () => {
    for (const value of [
        'exit', 'sleep', 'shutdown', 'restart', 'openurl',
        'video-on', 'video-off', 'audio-on', 'audio-off', 'loaded'
    ]) {
        const parsed = command.parse('electronapphost://' + value + '/', 'electronapphost');
        assert.equal(parsed.command, value);
        assert.equal(command.isKnown(parsed.command), true);
    }
});

test('openurl preserves payload case and query bytes', () => {
    const target = 'HTTPS://Example.test/Case/Path?Token=AbC123&Mode=MiXeD#Fragment';
    const parsed = command.parse('electronapphost://openurl/?url=' + target, 'electronapphost');
    assert.equal(parsed.command, 'openurl');
    assert.equal(parsed.rawQuery, 'url=' + target);
    assert.equal(command.getOpenUrlTarget(parsed), target);
});

test('unknown commands remain unknown and cannot alias a supported action', () => {
    for (const url of [
        'electronapphost://windowstate-maximized-extra/',
        'electronapphost://video-on-extra/',
        'electronapphost://unknown-command/'
    ]) {
        const parsed = command.parse(url, 'electronapphost');
        assert.equal(command.isKnown(parsed.command), false, url);
    }
});

test('raw URL and query are retained independently from the canonical token', () => {
    const parsed = command.parse('electronapphost://OpenURL/?url=HTTP://Host/Path?A=B&C=D', 'electronapphost');
    assert.equal(parsed.command, 'openurl');
    assert.equal(parsed.rawUrl, 'OpenURL/?url=HTTP://Host/Path?A=B&C=D');
    assert.equal(parsed.rawQuery, 'url=HTTP://Host/Path?A=B&C=D');
});
