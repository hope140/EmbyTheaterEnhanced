'use strict';

function once(source, before, after) {
    if (source.split(before).length !== 2) throw new Error('Subtitle appearance OSD source contract mismatch.');
    return source.replace(before, after);
}

function patchVideoOsd(source) {
    if (source.includes('  function destroySubtitleAppearanceDialog(instance) {')) {
        throw new Error('Subtitle appearance OSD source contract mismatch.');
    }
    let output = once(source,
        '  function destroySubtitleOffsetOverlay(instance) {',
        `  function destroySubtitleAppearanceDialog(instance) {
    if (instance.subtitleAppearanceDialog) {
      instance.subtitleAppearanceDialog.destroy();
      instance.subtitleAppearanceDialog = null;
    }
  }
  function canAdjustSubtitleAppearance(player, stream) {
    if (!player || !player.isLocalPlayer || typeof player.applySubtitleAppearance !== "function" || !stream) return false;
    var format = String(stream.Codec || stream.Format || "").toLowerCase();
    return (stream.IsTextSubtitleStream === true ||
      (stream.IsTextSubtitleStream == null &&
        ["subrip", "srt", "webvtt", "vtt", "mov_text", "text", "ttml"].indexOf(format) !== -1)) &&
      ["ass", "ssa", "pgs", "hdmv_pgs_subtitle", "dvdsub", "vobsub", "dvb_subtitle"].indexOf(format) === -1;
  }
  function destroySubtitleOffsetOverlay(instance) {`);
    output = once(output,
        '    function onSubtitleTrackChange() {\n      destroySubtitleOffsetOverlay(self);',
        '    function onSubtitleTrackChange() {\n      destroySubtitleAppearanceDialog(self);\n      destroySubtitleOffsetOverlay(self);');
    output = once(output,
        '    function onPlaybackStopped(e, state) {\n',
        '    function onPlaybackStopped(e, state) {\n      if (self.currentPlayer === this) destroySubtitleAppearanceDialog(self);\n');
    output = once(output,
        '    function releaseCurrentPlayer() {\n',
        '    function releaseCurrentPlayer() {\n      destroySubtitleAppearanceDialog(self);\n');
    output = once(output,
        '      this.subtitleOffsetOverlay && destroySubtitleOffsetOverlay(this);',
        '      this.subtitleOffsetOverlay && destroySubtitleOffsetOverlay(this);\n      destroySubtitleAppearanceDialog(this);');
    output = once(output,
        '          destroySubtitleOffsetOverlay(this),\n          this.bottomTabControllers);',
        '          destroySubtitleOffsetOverlay(this),\n          destroySubtitleAppearanceDialog(this),\n          this.bottomTabControllers);');
    output = once(output,
        '              require(["actionsheet"], function (actionsheet) {\n                self.showOsd(),',
        `              player === self.currentPlayer && canAdjustSubtitleAppearance(player, _playbackmanager.default.getSubtitleStream(player)) &&
                menuItems.push({name: _globalize.default.translate("HeaderSubtitleAppearance"), id: "subtitleappearance", icon: "&#xe262;"}),
              require(["actionsheet"], function (actionsheet) {
                if (player !== self.currentPlayer) return;
                self.showOsd(),`);
    output = once(output,
        '                      var item,\n                        mediaSource,\n                        id = parseInt(id);',
        `                      if (id === "subtitleappearance") {
                        if (player !== self.currentPlayer ||
                            !canAdjustSubtitleAppearance(player, _playbackmanager.default.getSubtitleStream(player))) return;
                        require(["./../../enhanced/subtitle-appearance-dialog.js"], function (SubtitleAppearanceDialog) {
                          if (player !== self.currentPlayer ||
                              !canAdjustSubtitleAppearance(player, _playbackmanager.default.getSubtitleStream(player))) return;
                          destroySubtitleAppearanceDialog(self);
                          var dialog = new SubtitleAppearanceDialog({player: player});
                          self.subtitleAppearanceDialog = dialog;
                          dialog.show().then(function () {
                            if (self.subtitleAppearanceDialog === dialog) self.subtitleAppearanceDialog = null;
                          });
                        });
                        return;
                      }
                      var item,
                        mediaSource,
                        id = parseInt(id);`);
    return output;
}

module.exports = {patchVideoOsd};
