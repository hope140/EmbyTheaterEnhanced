'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const boundary = require('../tools/native-frame-boundary-cases.cjs');
const source = fs.readFileSync(path.join(__dirname, '../tools/native-frame-boundary-cases.cjs'), 'utf8');

test('boundary validators require unavailable responses, the exact held frame, and the exact armed generation', function () {
    assert.equal(boundary.safeReason('target-generation-unavailable'), 'target-generation-unavailable');
    assert.equal(boundary.safeReason('C:\\private\\fixture'), null);
    assert.deepEqual(boundary.assertUnavailable({ready:false,status:'unavailable',reason:'stale-or-unmapped-generation'}), {
        ready:false,status:'unavailable',reason:'stale-or-unmapped-generation'
    });
    assert.throws(() => boundary.assertUnavailable({ready:true,status:'held'}), /boundary-expected-unavailable/);
    assert.deepEqual(boundary.assertHeld({active:true,holdId:41,bytes:4096,painted:true}, 41), {
        active:true,holdId:41,bytes:4096,painted:true
    });
    assert.throws(() => boundary.assertHeld({active:true,holdId:42,bytes:4096,painted:true}, 41),
        /boundary-held-frame-not-preserved/);
    assert.deepEqual(boundary.assertArmed({armed:true,autoState:'armed',targetGen:12,holdId:41}, 12, 41), {
        armed:true,autoState:'armed',targetGen:12,holdId:41
    });
    assert.throws(() => boundary.assertArmed({armed:true,autoState:'armed',targetGen:13,holdId:41}, 12, 41),
        /boundary-auto-arm-mismatch/);
});

test('retirement cancellation requires the target lease to cancel while preserving its held bitmap', function () {
    assert.deepEqual(boundary.assertCancelled({autoState:'cancelled',targetGen:18,autoHoldId:41,
        active:true,holdId:41,bytes:8192,painted:true}, 18, 41), {
        autoState:'cancelled',targetGen:18,autoHoldId:41,active:true,holdId:41,bytes:8192,painted:true
    });
    assert.throws(() => boundary.assertCancelled({autoState:'armed',targetGen:18,autoHoldId:41,
        active:true,holdId:41,bytes:8192,painted:true}, 18, 41), /boundary-retired-lease-not-cancelled-or-hold-lost/);
    assert.throws(() => boundary.assertCancelled({autoState:'cancelled',targetGen:18,autoHoldId:41,
        active:false,holdId:null,bytes:0}, 18, 41), /boundary-retired-lease-not-cancelled-or-hold-lost/);
});

test('HTTP gate evidence distinguishes a released late body from a cancelled transport', function () {
    assert.deepEqual(boundary.normalizeGateDelivery({
        released:false,transportCancelled:true,lateBodyDelivered:false,reason:'client-closed-before-body'
    }), {transportCancelled:true,lateBodyDelivered:false,reason:'client-closed-before-body'});
    assert.deepEqual(boundary.normalizeGateDelivery({
        released:false,transportCancelled:true,lateBodyDelivered:false,reason:'client-closed-during-body'
    }), {transportCancelled:true,lateBodyDelivered:false,reason:'client-closed-during-body'});
    assert.deepEqual(boundary.normalizeGateDelivery({
        released:true,transportCancelled:false,lateBodyDelivered:true,bodyBytes:1234
    }), {transportCancelled:false,lateBodyDelivered:true,bodyBytes:1234});
    assert.throws(() => boundary.normalizeGateDelivery({released:false,transportCancelled:false,lateBodyDelivered:true}),
        /boundary-http-delivery-state-invalid/);
});

test('loopback mode removes proxy variables only from the provided child environment', function () {
    const environment = {
        HTTP_PROXY:'http://proxy.invalid',http_proxy:'http://lower.invalid',
        HTTPS_PROXY:'https://proxy.invalid',All_Proxy:'socks5://proxy.invalid',
        PATH:'synthetic-path'
    };
    const configured = boundary.configureLoopbackProxyBypass(environment);
    assert.equal(configured.HTTP_PROXY, undefined);
    assert.equal(configured.http_proxy, undefined);
    assert.equal(configured.HTTPS_PROXY, undefined);
    assert.equal(configured.All_Proxy, undefined);
    assert.equal(configured.NO_PROXY, '127.0.0.1,localhost');
    assert.equal(configured.no_proxy, '127.0.0.1,localhost');
    assert.equal(configured.PATH, 'synthetic-path');
});

test('boundary harness stays loopback-only and records the five requested native lifecycle cases', function () {
    for (const name of [
        'retired-hold-rejection-and-wrong-release-preserves-id1',
        'first-auto-release-and-seek-does-not-recapture',
        'late-release-cannot-clear-new-hold',
        'retired-pending-http-generation-cannot-affect-current-generation',
        'failed-load-clears-auto-lease'
    ]) assert.ok(source.includes("'" + name + "'"), 'missing case ' + name);
    assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/);
    assert.match(source, /request\.url !== '\/gate\/' \+ path\.basename\(mediaPath\)/);
    assert.doesNotMatch(source, /0\.0\.0\.0|https?:\/\/[^'" ]+\.com|capture-screen|setAlwaysOnTop|toPNG/);
    assert.match(source, /finally \{\s+await gate\.close\(\);\s+\}/);
});
