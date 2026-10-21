define([
  "exports",
  "./../dom.js",
  "./../emby-apiclient/connectionmanager.js",
  "./../emby-apiclient/events.js",
  "./../common/pluginmanager.js",
  "./../layoutmanager.js",
  "./../common/servicelocator.js",
  "./../common/usersettings/usersettings.js",
  "./../common/inputmanager.js",
], function (
  _exports,
  _dom,
  _connectionmanager,
  _events,
  _pluginmanager,
  _layoutmanager,
  _servicelocator,
  _usersettings,
  _inputmanager
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var soundEffectsPlayer,
    effects = {};
  function reload() {
    var soundeffectPlugin;
    _servicelocator.appHost.supports("soundeffects") &&
      (_dom.default.removeEventListener(window, "keydown", onKeyDown, {passive: !0}),
      _inputmanager.default.off(window, onInputCommand, {passive: !0}),
      _layoutmanager.default.tv &&
        (_dom.default.addEventListener(window, "keydown", onKeyDown, {passive: !0}),
        _inputmanager.default.on(window, onInputCommand, {passive: !0}),
        (soundeffectPlugin = (function () {
          var soundeffectOption;
          try {
            soundeffectOption = _usersettings.default.soundEffects();
          } catch (err) {}
          soundeffectOption = soundeffectOption || "defaultsoundeffects";
          if ("none" === soundeffectOption) return null;
          var soundeffectPlugin = _pluginmanager.default.ofType("soundeffects").filter(function (i) {
            return i.id === soundeffectOption;
          })[0];
          soundeffectPlugin =
            soundeffectPlugin ||
            _pluginmanager.default.ofType("soundeffects").filter(function (i) {
              return "defaultsoundeffects" === i.id;
            })[0];
          return soundeffectPlugin;
        })())
          ? (function (soundeffectPlugin) {
              var i,
                effectDictionary = soundeffectPlugin.getEffects(),
                temp = {};
              for (i in effectDictionary)
                temp[i] = _pluginmanager.default.mapPath(soundeffectPlugin, effectDictionary[i]);
              effects = temp;
            })(soundeffectPlugin)
          : (effects = {})));
  }
  function onInputCommand(e) {
    switch (e.detail.command) {
      case "left":
      case "up":
      case "down":
      case "right":
        play("navigation");
    }
  }
  function onKeyDown(evt) {
    13 === evt.keyCode && play("select");
  }
  function play(type) {
    var effect = effects[type];
    effect &&
      (soundEffectsPlayer
        ? soundEffectsPlayer.play({path: effect})
        : require(["soundEffectsPlayer"], function (soundEffectsPlayer_) {
            (soundEffectsPlayer = soundEffectsPlayer_).play({path: effect});
          }));
  }
  reload(),
    _events.default.on(_connectionmanager.default, "localusersignedin", reload),
    _events.default.on(_usersettings.default, "change", function (e, name) {
      "soundeffects" === name && reload();
    });
  _exports.default = {};
});
