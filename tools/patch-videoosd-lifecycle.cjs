'use strict';

const crypto = require('node:crypto');

function once(source, before, after) {
    if (typeof source !== 'string' || source.split(before).length !== 2) {
        throw new Error('VideoOSD lifecycle source contract mismatch.');
    }
    return source.replace(before, after);
}

function patchVideoOsd(source) {
    const start = '_dom.default.addEventListener(window, "keydown", function (event)';
    const end = '_dom.default.addEventListener(\n        view,\n        "dblclick"';
    if (typeof source !== 'string' || source.split(start).length !== 2 || source.split(end).length !== 2) {
        throw new Error('VideoOSD lifecycle keyboard anchors mismatch.');
    }
    const begin = source.indexOf(start);
    const finish = source.indexOf(end, begin);
    const block = source.slice(begin, finish);
    if (crypto.createHash('sha256').update(block).digest('hex') !==
        '87afaf30e3dcf0e2d1981b526b8bb122fc0d6efdde9d00d85fa276a8dec92b53') {
        throw new Error('VideoOSD lifecycle keyboard input hash mismatch.');
    }
    // Keep the frozen key table byte-for-byte. Only ownership and cleanup change.
    const keys = block.slice(block.indexOf('var keyMap = {'), block.indexOf('        var handleKeyDown'));
    const replacement = `(function () {
        ${keys.trim()}
        self.clearRateKey = function () {
          var owner = self._eteRateKey;
          self._eteRateKey = null;
          if (owner && owner.timer != null) clearTimeout(owner.timer);
        };
        self.boundRateKeyDown = function (event) {
          if (self.paused || event.repeat || self._eteRateKey || !self.currentPlayer ||
              self.nowPlayingPositionSlider.dragging || !Object.prototype.hasOwnProperty.call(keyMap, event.key)) return;
          var owner = {player: self.currentPlayer, key: event.key, timer: null};
          self._eteRateKey = owner;
          owner.timer = setTimeout(function () {
            owner.timer = null;
            if (self._eteRateKey !== owner || self.paused || self.currentPlayer !== owner.player) return;
            var setting = keyMap[owner.key];
            var noScrollYElement = document.querySelector(".noScrollY:root");
            if (noScrollYElement) noScrollYElement.style.width = "auto";
            _toast.default(setting.message);
            _playbackmanager.default.setPlaybackRate(setting.rate, owner.player);
          }, 500);
        };
        self.boundRateKeyUp = function (event) {
          if (self._eteRateKey && self._eteRateKey.key === event.key) self.clearRateKey();
        };
        self.bindRateKeys = function () {
          if (self._eteRateKeysBound || self._eteRateKeysDestroyed) return;
          self._eteRateKeysBound = true;
          _dom.default.addEventListener(window, "keydown", self.boundRateKeyDown);
          _dom.default.addEventListener(window, "keyup", self.boundRateKeyUp);
        };
        self.releaseRateKeys = function () {
          self.clearRateKey();
          if (!self._eteRateKeysBound) return;
          self._eteRateKeysBound = false;
          _dom.default.removeEventListener(window, "keydown", self.boundRateKeyDown);
          _dom.default.removeEventListener(window, "keyup", self.boundRateKeyUp);
        };
      })(),
      `;
    let output = source.slice(0, begin) + replacement + source.slice(finish);
    output = once(output, '    function onPlaybackStart(e, state) {\n',
        '    function onPlaybackStart(e, state) {\n      if (self.currentPlayer === this && self.clearRateKey) self.clearRateKey();\n');
    output = once(output, '    function onPlaybackStopped(e, state) {\n',
        '    function onPlaybackStopped(e, state) {\n      if (self.currentPlayer === this && self.clearRateKey) self.clearRateKey();\n');
    output = once(output, '    function releaseCurrentPlayer() {\n',
        '    function releaseCurrentPlayer() {\n      if (self.clearRateKey) self.clearRateKey();\n');
    output = once(output, '(VideoOsd.prototype.resume = function (options) {\n      this.paused = !1;',
        '(VideoOsd.prototype.resume = function (options) {\n      this.paused = !1;\n      this.bindRateKeys();');
    output = once(output, '(VideoOsd.prototype.pause = function () {\n      this.paused = !0;',
        '(VideoOsd.prototype.pause = function () {\n      this.paused = !0;\n      this.releaseRateKeys();');
    return once(output, '(VideoOsd.prototype.destroy = function () {\n',
        '(VideoOsd.prototype.destroy = function () {\n      this._eteRateKeysDestroyed = true;\n      this.releaseRateKeys();\n');
}

module.exports = {patchVideoOsd};
