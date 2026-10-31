'use strict';

function patchInputApi(source) {
    const before = '_playbackmanager.default.seek(msg.Data.SeekPositionTicks)';
    if (typeof source !== 'string' || source.split(before).length !== 2) {
        throw new Error('Playback input diagnostic source contract mismatch.');
    }
    // The existing command and numeric target are unchanged. No message body,
    // sender identity or server address is copied into diagnostic context.
    return source.replace(before,
        '_playbackmanager.default.seek(msg.Data.SeekPositionTicks,null,{origin:"remote-playstate"})');
}

module.exports = {patchInputApi};
