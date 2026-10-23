'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {validateConfig} = require('./bridge-mock.cjs');

function prepareReview({config, target = 'mock-review'} = {}) {
    if (target !== 'mock-review') throw new Error('INSTALLABLE_PACKAGE_NOT_AVAILABLE');
    const selected = validateConfig(config);
    const files = ['bridge-mock.cjs', 'fpk-templates/manifest.in', 'fpk-templates/ui-config.json.in',
        'fpk-templates/privilege.json.in', 'fpk-templates/main.sh.in', 'README.md'];
    const entries = [{path: 'config.mock.json', content: JSON.stringify(selected, null, 2) + '\n'},
        ...files.map(name => ({path: name, content: fs.readFileSync(path.join(__dirname, name), 'utf8')})),
        {path: 'PROJECT-LICENSE.txt', content: fs.readFileSync(path.resolve(__dirname, '../../../LICENSE'), 'utf8')}]
        .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
        .map(entry => ({...entry, sha256: crypto.createHash('sha256').update(entry.content).digest('hex')}));
    return {schemaVersion: 1, artifactType: 'NON_INSTALLABLE_MOCK_REVIEW', productionReady: false,
        containsThirdPartyImplementation: false, credentialStorage: false, entries};
}

module.exports = {prepareReview};
if (require.main === module) {
    if (process.argv.length !== 2) { process.stderr.write('MOCK_REVIEW_ONLY\n'); process.exitCode = 1; }
    else process.stdout.write(JSON.stringify(prepareReview(), null, 2) + '\n');
}
