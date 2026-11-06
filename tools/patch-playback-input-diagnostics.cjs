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
    for (const command of ['back', 'home']) {
        const before = '_inputmanager.default.trigger("' + command + '")';
        if (output.split(before).length !== 2) throw new Error('Remote navigation diagnostic anchor mismatch');
        output = output.replace(before, '_inputmanager.default.trigger("' + command + '",{diagnosticOrigin:"remote-general"})');
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
    for (const [command, method] of [['back', 'back'], ['home', 'goHome']]) {
        const before = '_approuter.default.' + method + '()';
        if (source.split(before).length !== (command === 'home' ? 3 : 2)) throw new Error('Navigation input anchor mismatch');
        source = source.replace(before, '(window.__eteNavigationDiagnostics ? window.__eteNavigationDiagnostics.invoke(_playbackmanager.default,"' + command + '",options && options.diagnosticOrigin,function(){return ' + before + ';}) : ' + before + ')');
    }
    return source;
}

function once(source, before, after) {
    if (source.split(before).length !== 2) throw new Error('Navigation route diagnostic anchor mismatch');
    return source.replace(before, after);
}
function patchRouter(source) {
    source = once(source, '  function handleRoute(ctx, route) {', '  function handleRoute(ctx, route) {\n    if (window.__eteNavigationDiagnostics) window.__eteNavigationDiagnostics.capture(ctx);');
    return once(source, '(currentRequest.state = ctx.state),', '(currentRequest.state = ctx.state),\n              (window.__eteNavigationDiagnostics && window.__eteNavigationDiagnostics.copy(ctx, currentRequest)),');
}
function patchViewManager(source) {
    const dispatch = 'dispatchViewEvent(previousView,null,"viewbeforehide",newView)';
    return once(source, dispatch, '(window.__eteNavigationDiagnostics ? window.__eteNavigationDiagnostics.withRoute(options,function(){return ' + dispatch + ';}) : ' + dispatch + ')');
}
module.exports = {patchInputApi, patchInputManager, patchRouter, patchViewManager};
