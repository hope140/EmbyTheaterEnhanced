"""Deterministically derive only the three fixed, hash-verified MIT source files.

No product repository or later upstream input is read. Original bytes in licensed/
remain unchanged. Registration logic has no targeted changes or qualification.
"""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'INPUT_MANIFEST.json').read_text())
for row in manifest['files']:
    data = (root / row['path']).read_bytes()
    assert len(data) == row['bytes']
    assert hashlib.sha256(data).hexdigest() == row['sha256']
    assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == row['git_blob_sha1']

notice = ('/* Copyright (c) Emby https://emby.media\n'
          ' * Derived solely from fixed MIT commit fdd0939ac596406ab92274f30fd83d226a677424.\n'
          ' * Contract adaptations, 2026. Full MIT license: ../LICENSE.md. */\n')
for name in ['apiclient', 'connectionmanager']:
    source = (root / 'licensed' / f'{name}.js').read_text(encoding='utf-8-sig')
    start = source.index('function getFetchPromise(')
    end = source.index('\nfunction ', start + 10)
    source = source[:start] + '''function getFetchPromise(request, signal) {
    return transport.request(request, signal).then(({ response, cleanup }) => {
        cleanup();
        return response;
    });
}
''' + source[end:]
    source = source.replace("import events from './events.js';", "import events from './events.js';\nimport transport from './transport.js';")
    if name == 'apiclient':
        source = source.replace('instance.wakeOnLan.isSupported()', 'instance._wakeOnLan.isSupported()')
        source = source.replace('this.wakeOnLan = wakeOnLan;', 'this._wakeOnLan = wakeOnLan;')
        source = source.replace('this.wakeOnLan.isSupported()', 'this._wakeOnLan.isSupported()')
        source = source.replace('sendNextWakeOnLan(this.wakeOnLan,', 'sendNextWakeOnLan(this._wakeOnLan,')
        source = source.replace('file.type !== "image/jpeg" && file.type !== "image/jpeg"',
                                'file.type !== "image/jpeg" && file.type !== "image/webp"')
        for endpoint in ['Sessions/Playing/Progress']:
            source = source.replace(f'        const url = this.getUrl("{endpoint}");',
                f'        this.ensureWebSocket();\n        const url = this.getUrl("{endpoint}");')
    else:
        source = source.replace('const defaultTimeout = 20000;', 'const defaultTimeout = 5000;')
        source = source.replace("this._minServerVersion = '4.1.1';", "this._minServerVersion = '4.6.0.50';")
        start = source.index('function tryReconnect(instance, serverInfo, signal) {')
        end = source.index('\nfunction afterConnectValidated(', start)
        source = source[:start] + '''function tryReconnect(instance, serverInfo, signal) {
    return transport.probe(serverInfo, url => instance.getEmbyServerUrl(url, 'system/info/public'),
        instance.rejectInsecureAddresses, signal);
}
''' + source[end:]
        source = source.replace('    constructor(\n        credentialProvider,', '    initialize(\n        credentialProvider,', 1)
        source = source.replace('        let apiClient = this.getApiClient(server.Id);',
            '        let apiClient = server.Id ? this.getApiClient(server.Id) : null;\n'
            '        if (!apiClient && server.IsLocalServer) {\n'
            '            apiClient = this._apiClients.find(client => client.serverInfo().IsLocalServer);\n'
            '        }\n'
            '        if (!apiClient && !server.Id && !server.IsLocalServer) {\n'
            '            apiClient = this._apiClients.find(client => client.serverAddress().toLowerCase() === serverUrl?.toLowerCase());\n'
            '        }')
        source = source.replace('            apiClient.serverInfo(server);\n\n            apiClient.onAuthenticated',
            '            apiClient.serverInfo(server);\n            if (server.Id) this._apiClientsMap[server.Id] = apiClient;\n'
            '            if (apiClient.setCurrentLocale) apiClient.setCurrentLocale(this._currentLocale);\n\n            apiClient.onAuthenticated')
    (root / 'src' / f'mit-{name}.js').write_text(notice + source)
(root / 'src' / 'events.js').write_text(notice + (root / 'licensed' / 'events.js').read_text(encoding='utf-8-sig'))
(root / 'LICENSE.md').write_bytes((root / 'licensed' / 'LICENSE.md').read_bytes())
print('Verified all fixed inputs; reproduced MIT-derived sources.')
