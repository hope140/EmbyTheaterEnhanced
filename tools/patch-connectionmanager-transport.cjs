'use strict';
const crypto = require('node:crypto');
const BASE_SHA256 = 'beae6ad4a2d386fb6d3553974c0aa3ba7c7e1bc25c1098944f508fe497a08f09';
const sha = text => crypto.createHash('sha256').update(text).digest('hex');

// Keep the existing singleton, callbacks and local regions in their original module.
// Only the transport-owned functions below change; no candidate CM is transplanted.
function patchConnectionManager(source) {
    if (sha(Buffer.from(source)) !== BASE_SHA256) throw Error('ConnectionManager fixed input mismatch.');
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    function replaceSpan(begin, end, replacement) {
        const start = source.indexOf(begin), finish = source.indexOf(end, start + begin.length);
        if (start < 0 || finish < 0 || source.indexOf(begin, start + 1) !== -1) throw Error('ConnectionManager transport anchor mismatch.');
        source = source.slice(0, start) + replacement.replace(/\n/g, newline) + source.slice(finish);
    }
    const first = 'define(["exports", "./events.js"], function (_exports, _events) {';
    if (!source.startsWith(first)) throw Error('ConnectionManager module boundary mismatch.');
    source = source.replace(first, 'define(["exports", "./events.js", "./transport.js"], function (_exports, _events, _transport) {');
    const signedIn = '      instance._getOrAddApiClient(server, serverUrl),';
    if (source.split(signedIn).length !== 2) throw Error('ConnectionManager sign-in boundary mismatch.');
    const begin = source.indexOf('  function onLocalUserSignIn('), end = source.indexOf('  function tryReconnectToUrl(', begin);
    if (begin < 0 || end < 0) throw Error('ConnectionManager sign-in span mismatch.');
    let span = source.slice(begin, end);
    span = span.replace('    return (', '    return Promise.resolve(typeof window !== "undefined" && window.__eteFnTransport && window.__eteFnTransport.beforeIdentityChange({serverId:server.Id,accountId:server.UserId,token:server.AccessToken,serverAddress:serverUrl})).then(function () { return (');
    const tail = '    );' + newline + '  }';
    if (span.split(tail).length !== 2) throw Error('ConnectionManager sign-in completion mismatch.');
    span = span.replace(tail, '    ); });' + newline + '  }');
    source = source.slice(0, begin) + span + source.slice(end);
    replaceSpan('  function getFetchPromise(', '  function sortServers(', '');
    replaceSpan('  function ajax(', '  function getConnectUrl(', `  function ajax(request, signal) {
    if (!request) throw new Error("Request cannot be null");
    return _transport.default.send(request, signal);
  }
`);
    replaceSpan('  function tryReconnectToUrl(', '  function afterConnectValidated(', '');
    replaceSpan('            return (function (instance, serverInfo, signal) {', '            })(this, server).then(', '            return _transport.default.probe(server, url => this.getEmbyServerUrl(url, "system/info/public"), this.rejectInsecureAddresses, options.signal).then(');
    // replaceSpan retains the end anchor, so remove exactly that obsolete terminator.
    const boundary = '.then(            })(this, server).then(';
    if (!source.includes(boundary)) throw Error('ConnectionManager probe boundary mismatch.');
    source = source.replace(boundary, '.then(');
    return source;
}
module.exports = {BASE_SHA256, patchConnectionManager};
