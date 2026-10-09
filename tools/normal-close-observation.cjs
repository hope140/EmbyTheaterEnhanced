'use strict';

// Test-only observations. The real application window and its original
// before-quit handlers retain all shutdown decisions and Promise ownership.
const fs = require('node:fs');
const path = require('node:path');

function install({app, runtime, evidence, getWindow, getServer}) {
    const start = Date.now();
    let count = 0;
    function record(stage, detail) {
        try {
            if (count >= 48) return;
            fs.appendFileSync(path.join(evidence, 'normal-close.jsonl'), JSON.stringify({
                sequence: ++count, stage, elapsedMs: Date.now() - start, ...detail
            }) + '\n');
        } catch (_) { /* Observation cannot change product shutdown. */ }
    }
    for (const [name, relative] of [
        ['diagnostics', 'enhanced/diagnostics-ipc.js'],
        ['maintenance', 'enhanced/maintenance-ipc.js'],
        ['strm-config', 'enhanced/strm-config-ipc.js'],
        ['cd2', 'enhanced/cd2-ipc.js'],
        ['native', 'native-helper/service.js']
    ]) {
        const module = require(path.join(runtime, 'electronapp', relative));
        const original = module.register;
        if (typeof original !== 'function') throw new Error('normal-close-register-unavailable-' + name);
        module.register = function () {
            const unregister = original.apply(this, arguments);
            return function () {
                record(name + '-unregister-start');
                let value;
                try { value = unregister.apply(this, arguments); }
                catch (error) { record(name + '-unregister-failed'); throw error; }
                if (value && typeof value.then === 'function') {
                    value.then(() => record(name + '-unregister-complete'), () => record(name + '-unregister-failed'));
                } else record(name + '-unregister-complete');
                return value;
            };
        };
    }
    const Client = require(path.join(runtime, 'electronapp/native-helper/controller.js')).NativeHelperClient;
    const originalKill = Client.prototype.kill;
    const observedChildren = new WeakSet();
    Client.prototype.kill = function () {
        record('native-client-shutdown-start');
        if (this.child && !observedChildren.has(this.child)) {
            observedChildren.add(this.child);
            const childKill = this.child.kill;
            this.child.kill = function () {
                record('native-child-force-kill');
                return childKill.apply(this, arguments);
            };
        }
        const value = originalKill.apply(this, arguments);
        value.then(() => record('native-client-shutdown-complete', {exited:this.exited === true}),
            () => record('native-client-shutdown-failed'));
        return value;
    };
    app.on('window-all-closed', () => record('window-all-closed'));
    app.on('before-quit', () => record('before-quit'));
    app.on('will-quit', () => {
        record('will-quit');
        // The loopback server belongs to this fixture. Keep media available
        // until the product shutdown chain reaches will-quit.
        const server = getServer();
        if (server) {
            try { server.closeAllConnections(); server.close(); record('fixture-server-close-requested'); }
            catch (_) { record('fixture-server-close-failed'); }
        }
    });
    app.on('quit', (_event, code) => record('quit', {exitCode: code}));
    return {
        close(result) {
            const window = getWindow();
            if (!result.ok || !window || window.isDestroyed()) {
                record('precondition-failed');
                // Failure remains a failure, with the same bounded outer cleanup.
                return;
            }
            window.on('close', () => record('application-window-close'));
            window.on('closed', () => record('application-window-closed'));
            record('application-close-requested', {scenario: process.env.ETE_TEST_NORMAL_CLOSE});
            window.close();
            record('application-close-returned');
        }
    };
}

module.exports = {install};
