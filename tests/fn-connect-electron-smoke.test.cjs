'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {createController} = require('../prototypes/fn-connect/client/controller.cjs');
const {createBridge} = require('../prototypes/fn-connect/client/bridge.cjs');
const {createFixture, createFixtureIO} = require('../prototypes/fn-connect/client/fixture.cjs');
const {runElectronSmoke} = require('../prototypes/fn-connect/client/electron-smoke.cjs');

test('Windows smoke scenario completes against actual local I/O with a synthetic session adapter (not Chromium)', {timeout: 15000}, async t => {
    const fixture = await createFixture(), io = createFixtureIO();
    const controller = createController({enabled: true, mode: 'fixture', io});
    const bridge = await createBridge(controller, {enabled: true});
    t.after(async () => { await bridge.close(); await controller.closeAll(); await fixture.close(); });
    const windows = new Map(), stages = [];
    const outcome = await runElectronSmoke({controller, bridge, fixture, stage: value => stages.push(value),
        async addProfile() {
            const id = controller.add(fixture.profile); await controller.start(id);
            const window = {destroyed: false, isDestroyed() { return this.destroyed; }};
            windows.set(id, window);
            const session = {cookies: {get: async () => [...io.sessions.get(id).cookies.values()]}};
            return {id, window, session};
        },
        authorizeProfile: profile => io.authorize(profile.id, fixture.profile),
        async removeProfile(id) { await controller.close(id); windows.get(id).destroyed = true; }
    });
    assert.equal(outcome.realFNConnect, 'NOT_TESTED');
    assert.equal(outcome.nativeHelperPlayback, 'NOT_TESTED');
    assert.equal(outcome.hlsDash, 'NOT_SUPPORTED');
    assert.equal(outcome.profileCloseClearsCookies, true);
    assert.equal(outcome.websocketSessionCookie, true);
    assert.deepEqual(stages, ['BOOTSTRAP', 'PRIMARY_PAGE_AUTHORIZED', 'PRIMARY_API_VERIFIED', 'ISOLATED_API_DENIED',
        'HTTP_SESSION', 'REDIRECT_SEPARATION', 'WEBSOCKET_SESSION', 'CANCELLATION', 'PROFILE_CLOSE', 'EXPIRY']);
});
