'use strict';
const fs = require('node:fs');
const path = require('node:path');
function createSettings(root, fileSystem = fs) {
    const file = path.join(root, 'diagnostics-settings.json');
    let mode = 'normal', pending = Promise.resolve();
    try { if (JSON.parse(fileSystem.readFileSync(file, 'utf8')).mode === 'detailed') mode = 'detailed'; } catch (_) { }
    return {
        getMode: () => mode,
        setMode(value) {
            if (!['normal', 'detailed'].includes(value)) return Promise.reject(Error('invalid-diagnostic-mode'));
            const operation = pending.catch(() => {}).then(async () => {
                await fileSystem.promises.mkdir(root, {recursive: true});
                try {
                    await fileSystem.promises.writeFile(file + '.tmp', JSON.stringify({schemaVersion: 1, mode: value}) + '\n', 'utf8');
                    await fileSystem.promises.rename(file + '.tmp', file);
                } finally {
                    try { await fileSystem.promises.unlink(file + '.tmp'); } catch (_) { }
                }
                mode = value;
                return mode;
            });
            pending = operation;
            return operation;
        }
    };
}
module.exports = {createSettings};
