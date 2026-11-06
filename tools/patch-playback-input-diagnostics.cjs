'use strict';

function patchInputApi(source) {
    const before = '_playbackmanager.default.seek(msg.Data.SeekPositionTicks)';
    if (typeof source !== 'string' || source.split(before).length !== 2) {
        throw new Error('Playback input diagnostic source contract mismatch.');
    }
    // The existing command and numeric target are unchanged. No message body,
    // sender identity or server address is copied into diagnostic context.
    let output = source.replace(before,
        '_playbackmanager.default.seek(msg.Data.SeekPositionTicks,null,{origin:"remote-playstate"})');
    for (const command of ['stop', 'next', 'previous']) {
        const before = '_inputmanager.default.trigger("' + command + '")';
        if (output.split(before).length !== 2) throw new Error('Remote diagnostic anchor mismatch');
        output = output.replace(before, '_inputmanager.default.trigger("' + command + '",{diagnosticOrigin:"remote-playstate"})');
    }
    const play = '_playbackmanager.default.play({ids:msg.Data.ItemIds,';
    if (output.split(play).length !== 2) throw new Error('Remote Play diagnostic anchor mismatch');
    output = output.replace(play, '_playbackmanager.default.play({_eteDiagnosticControl:{controlOrigin:"remote-playstate"},ids:msg.Data.ItemIds,');
    return output;
}
function patchInputManager(source) {
    const origin = '{controlOrigin: options && ["windows-media", "host-command", "remote-playstate"].indexOf(options.diagnosticOrigin) >= 0 ? options.diagnosticOrigin : "input"}';
    for (const method of ['stop', 'nextTrack']) {
        const before = '_playbackmanager.default.' + method + '()';
        if (source.split(before).length !== 2) throw new Error('Input manager diagnostic anchor mismatch');
        source = source.replace(before, '_playbackmanager.default.' + method + '(null,' + origin + ')');
    }
    return source;
}

module.exports = {patchInputApi, patchInputManager};
