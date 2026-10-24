'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function create(root, directory) {
    const bytes = Buffer.from('synthetic loader, never executed');
    fs.mkdirSync(directory, {recursive: true});
    for (const [name, content] of [['vulkan-1.dll', bytes], ['LICENSE', 'synthetic Electron notice'], ['LICENSES.chromium.html', 'synthetic Chromium notices']]) fs.writeFileSync(path.join(directory, name), content);
    const lock = {...require('../../native/windows-media/loader-input.json'), archiveSha256: '1'.repeat(64), size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
    const file = path.join(root, 'native/windows-media/loader-input.json'); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, JSON.stringify(lock));
    return lock;
}
module.exports = {create};
