'use strict';

function lineEndingOf(source) {
    return source.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
}

function replaceUnique(source, original, replacement, label) {
    const index = source.indexOf(original);
    if (index === -1 || source.indexOf(original, index + original.length) !== -1) {
        throw new Error('External-player source contract mismatch: ' + label);
    }
    return source.slice(0, index) + replacement + source.slice(index + original.length);
}

function replaceBetween(source, startToken, endToken, replacement, label) {
    const startIndex = source.indexOf(startToken);
    const endIndex = startIndex === -1 ? -1 : source.indexOf(endToken, startIndex + startToken.length);
    if (startIndex === -1 || endIndex === -1 ||
        source.indexOf(startToken, startIndex + startToken.length) !== -1 ||
        source.indexOf(endToken, endIndex + endToken.length) !== -1) {
        throw new Error('External-player source contract mismatch: ' + label);
    }
    return source.slice(0, startIndex) + replacement + source.slice(endIndex);
}

function patchItemText(value) {
    if (typeof value !== 'string') throw new TypeError('Item source must be text.');
    const lineEnding = lineEndingOf(value);
    let output = value;
    output = replaceUnique(
        output,
        ['  "../modules/commandprocessor.js",', '  "appSettings",'].join(lineEnding),
        '  "appSettings",',
        'legacy commandprocessor dependency'
    );
    output = replaceUnique(output, ['  commandprocessor,'].join(lineEnding), '', 'legacy commandprocessor parameter');

    const oldButtonConsumer = [
        '      (function (page, item) {',
        '        var btnAutoPlays = page.querySelectorAll(".btnAutoPlay");',
        '        var enabled = navigator.userAgent.includes("wv")',
        '          ? appSettings.enableSystemExternalPlayers()',
        '          : JSON.parse(appSettings.get("externalplayers") || "[]").some(item => {',
        '              return item["videotype-file"];',
        '            });',
        '        for (var i = 0, length = btnAutoPlays.length; i < length; i++) {',
        '          var btnAutoPlay = btnAutoPlays[i];',
        '          enabled && (item.Type == "Series" || item.Type == "Season" || item.Type == "Episode")',
        '            ? btnAutoPlay.classList.remove("hide")',
        '            : btnAutoPlay.classList.add("hide");',
        '        }',
        '        updateAutoplayButton();',
        '      })(view, item),'
    ].join(lineEnding);
    output = replaceUnique(
        output,
        oldButtonConsumer,
        '      notifyLegacyExternalPlayerRetirement(item),',
        'legacy external-player button consumer'
    );

    const noticeFunction = [
        '  function notifyLegacyExternalPlayerRetirement(item) {',
        '    if (!item || (item.Type !== "Series" && item.Type !== "Season" && item.Type !== "Episode") ||',
        '        window.isLegacyExternalPlayerNoticeShown) return;',
        '    var hasLegacySettings = false;',
        '    try {',
        '      hasLegacySettings = appSettings.get("autoplay") == "true";',
        '      var externalPlayers = appSettings.get("externalplayers");',
        '      if (externalPlayers) {',
        '        var parsedPlayers = JSON.parse(externalPlayers);',
        '        hasLegacySettings = hasLegacySettings || !Array.isArray(parsedPlayers) || parsedPlayers.some(function (player) {',
        '          return player && player["videotype-file"];',
        '        });',
        '      }',
        '      if (navigator && typeof navigator.userAgent === "string" && navigator.userAgent.includes("wv") &&',
        '          appSettings.enableSystemExternalPlayers()) hasLegacySettings = true;',
        '    } catch (_error) {',
        '      hasLegacySettings = true;',
        '    }',
        '    if (!hasLegacySettings) return;',
        '    window.isLegacyExternalPlayerNoticeShown = true;',
        '    try {',
        '      var notification = toast("Legacy external-player controls and autoplay are inactive; saved settings remain unchanged. Emby’s normal next-episode setting still works. / 旧版外置播放器按钮和自动续播已停用；已保存设置未更改，Emby 正常下一集设置仍可用。");',
        '      if (notification && typeof notification.catch === "function") notification.catch(function () {});',
        '    } catch (_error) {',
        '      // The compatibility notice is best-effort; no legacy playback is started.',
        '    }',
        '  }'
    ].join(lineEnding);
    output = replaceBetween(
        output,
        '  function onAutoPlayClick(e) {',
        '  function onQueueClick() {',
        noticeFunction + lineEnding,
        'legacy autoplay click and status functions'
    );
    output = replaceUnique(
        output,
        ['      bindAll(view, ".btnAutoPlay", "click", onAutoPlayClick.bind(this)),'].join(lineEnding),
        '',
        'legacy autoplay click binding'
    );
    output = replaceBetween(
        output,
        '      if (options.fromPlayEnded) {',
        '      BaseView.prototype.onResume.apply(this, arguments);',
        '      notifyLegacyExternalPlayerRetirement(this.currentItem);' + lineEnding,
        'legacy detail-page autoplay timer'
    );

    for (const legacyConsumer of [
        'onAutoPlayClick',
        'updateAutoplayButton',
        'window.timeout1',
        'window.timeout2',
        'window.timeout3',
        'commandprocessor.default.executeCommand("resume", nextItem)',
        'appSettings.set("autoplay"'
    ]) {
        if (output.includes(legacyConsumer)) {
            throw new Error('External-player output still contains a retired detail consumer: ' + legacyConsumer);
        }
    }
    return output;
}

function patchItemHtmlText(value) {
    if (typeof value !== 'string') throw new TypeError('Item HTML source must be text.');
    const lineEnding = lineEndingOf(value);
    const oldButton = [
        '                            <button is="emby-button" type="button" class="btnAutoPlay hide fab detailButton detailButton-autotext" title="连播">',
        '                                <i class="md-icon button-icon btnAutoPlayIcon detailButton-autotext-icon autortl">sync</i>',
        '                                <span class="detailButton-autotext-text secondaryText autoplayButtonText">连播</span>',
        '                            </button>'
    ].join(lineEnding);
    const output = replaceUnique(value, oldButton, '', 'legacy autoplay button markup');
    if (output.includes('btnAutoPlay')) {
        throw new Error('External-player HTML still contains a legacy autoplay control.');
    }
    return output;
}

module.exports = {patchItemHtmlText, patchItemText};
