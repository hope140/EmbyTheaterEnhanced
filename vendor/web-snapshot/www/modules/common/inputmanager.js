define([
  "exports",
  "./../dom.js",
  "./../approuter.js",
  "./playback/playbackmanager.js",
  "./../focusmanager.js",
  "./servicelocator.js",
  "./../emby-apiclient/events.js",
], function (_exports, _dom, _approuter, _playbackmanager, _focusmanager, _servicelocator, _events) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var lastInputTime = Date.now();
  function onFunctionalEvent() {
    lastInputTime = Date.now();
  }
  _events.default.on(_servicelocator.appHost, "pause", onFunctionalEvent),
    _events.default.on(_servicelocator.appHost, "resume", onFunctionalEvent),
    window.addEventListener("popstate", onFunctionalEvent, !1);
  var commandTimes = {};
  function handleCommand(name, options) {
    lastInputTime = Date.now();
    var command,
      last,
      now,
      sourceElement = options ? options.sourceElement : null,
      tagName =
        (((sourceElement = sourceElement || document.activeElement) &&
          "BODY" !== (tagName = sourceElement.tagName) &&
          "HTML" !== tagName) ||
          (sourceElement = _focusmanager.default.getCurrentScope()),
        {detail: {command: name}, bubbles: !0, cancelable: !0});
    if (
      (options && ((tagName.detail.repeat = options.repeat), (tagName.detail.originalEvent = options.originalEvent)),
      !sourceElement.dispatchEvent(new CustomEvent("command", tagName)))
    )
      return !0;
    switch (name) {
      case "up":
        return _focusmanager.default.moveUp(sourceElement), !0;
      case "down":
        return _focusmanager.default.moveDown(sourceElement), !0;
      case "left":
        return _focusmanager.default.moveLeft(sourceElement), !0;
      case "right":
        return _focusmanager.default.moveRight(sourceElement), !0;
      case "home":
        return _approuter.default.goHome(), !0;
      case "settings":
        return _approuter.default.showSettings(), !0;
      case "back":
        return _approuter.default.back(), !0;
      case "forward":
        return _approuter.default.forward(), !0;
      case "select":
        return sourceElement.click(), !0;
      case "menu":
      case "info":
        return !0;
      case "nextchapter":
        return _playbackmanager.default.nextChapter(), !0;
      case "next":
      case "nexttrack":
        return _playbackmanager.default.nextTrack(), !0;
      case "previous":
      case "previoustrack":
        return _playbackmanager.default.previousTrack(), !0;
      case "previouschapter":
        return _playbackmanager.default.previousChapter(), !0;
      case "guide":
        return _approuter.default.showGuide(), !0;
      case "recordedtv":
        return _approuter.default.showRecordedTV(), !0;
      case "record":
        return !0;
      case "livetv":
        return _approuter.default.showLiveTV(), !0;
      case "mute":
        return _playbackmanager.default.setMute(!0), !0;
      case "unmute":
        return _playbackmanager.default.setMute(!1), !0;
      case "togglemute":
        return _playbackmanager.default.toggleMute(), !0;
      case "channelup":
        return _playbackmanager.default.channelUp(), !0;
      case "channeldown":
        return _playbackmanager.default.channelDown(), !0;
      case "volumedown":
        return _playbackmanager.default.volumeDown(), !0;
      case "volumeup":
        return _playbackmanager.default.volumeUp(), !0;
      case "play":
        return _playbackmanager.default.unpause(), !0;
      case "pause":
        return _playbackmanager.default.pause(), !0;
      case "playpause":
        return _playbackmanager.default.playPause(), !0;
      case "stop":
        return (
          (last = commandTimes[(command = "stop")] || 0),
          (now = Date.now()) - last < 1e3 || ((commandTimes[command] = now), !1) || _playbackmanager.default.stop(),
          !0
        );
      case "changezoom":
        return _playbackmanager.default.toggleAspectRatio(), !0;
      case "changeaudiotrack":
        return _playbackmanager.default.changeAudioStream(), !0;
      case "changesubtitletrack":
        return _playbackmanager.default.changeSubtitleStream(), !0;
      case "search":
        return _approuter.default.showSearch(), !0;
      case "favorites":
        return _approuter.default.showFavorites(), !0;
      case "fastforward":
        return _playbackmanager.default.fastForward(), !0;
      case "rewind":
        return _playbackmanager.default.rewind(), !0;
      case "togglefullscreen":
        return _playbackmanager.default.toggleFullscreen(), !0;
      case "disabledisplaymirror":
        return _playbackmanager.default.enableDisplayMirroring(!1), !0;
      case "enabledisplaymirror":
        return _playbackmanager.default.enableDisplayMirroring(!0), !0;
      case "toggledisplaymirror":
        return _playbackmanager.default.toggleDisplayMirroring(), !0;
      case "togglestats":
        return !0;
      case "movies":
      case "music":
      case "tv":
        return _approuter.default.goHome(), !0;
      case "nowplaying":
        return _approuter.default.showNowPlaying(), !0;
      case "save":
      case "screensaver":
      case "refresh":
      case "changebrightness":
      case "red":
      case "green":
      case "yellow":
      case "blue":
      case "grey":
      case "brown":
        return !0;
      case "repeatnone":
        return _playbackmanager.default.setRepeatMode("RepeatNone"), !0;
      case "repeatall":
        return _playbackmanager.default.setRepeatMode("RepeatAll"), !0;
      case "repeatone":
        return _playbackmanager.default.setRepeatMode("RepeatOne"), !0;
      default:
        return !1;
    }
  }
  _events = {
    trigger: handleCommand,
    handle: handleCommand,
    notify: function (triggerCommand, evt) {
      (lastInputTime = Date.now()), !1 !== triggerCommand && handleCommand("unknown", {originalEvent: evt});
    },
    idleTime: function () {
      return Date.now() - lastInputTime;
    },
    on: function (scope, fn, options) {
      _dom.default.addEventListener(scope, "command", fn, (options = options || {}));
    },
    off: function (scope, fn, options) {
      _dom.default.removeEventListener(scope, "command", fn, (options = options || {}));
    },
  };
  self.Emby && (Emby.InputManager = _events), (_exports.default = _events);
});
