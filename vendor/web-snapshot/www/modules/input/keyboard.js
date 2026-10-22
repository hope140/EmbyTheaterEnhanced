define([
  "exports",
  "./../common/inputmanager.js",
  "./../browser.js",
  "./../dom.js",
  "./../loading/loading.js",
], function (_exports, _inputmanager, _browser, _dom, _loading) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var preventDefaultOnGamePadA = !_browser.default.edge;
  function sendCommandFromEvent(name, e) {
    var options = {sourceElement: e.target, repeat: e.repeat, originalEvent: e};
    _inputmanager.default.trigger(name, options) && e.preventDefault();
    "back" === name && _loading.default.hide();
  }
  function isEditable(elem) {
    var readOnly = elem.readOnly;
    if (!readOnly && !1 === readOnly)
      switch (elem.type) {
        case "checkbox":
        case "radio":
        case "file":
        case "hidden":
        case "range":
          return;
        default:
          return 1;
      }
  }
  var repeatingKey,
    handleMultiMediaKeys = !_browser.default.electron,
    goBackOnBackspace = _browser.default.electron || globalThis.Windows || _browser.default.tv,
    appMode = globalThis.appMode,
    IsBrowser = !_browser.default.electron && "standalone" === (appMode || "standalone"),
    isNativeTizen = globalThis.tizen,
    repeatKeyFirstInputTime = 0,
    lastRepeatingKeyTime = 0,
    repeatKeyCount = 0,
    repeatKeyLongPressed = !1,
    EnableRepeatWorkaround =
      _browser.default.edge || isNativeTizen || globalThis.webos || globalThis.PalmSystem || "android" === appMode,
    LongPressTimeout = 700;
  function throttleRepeatingKey(key, evt) {
    var timestamp = evt.timeStamp,
      isRepeat = evt.repeat;
    if (
      (EnableRepeatWorkaround &&
        !isRepeat &&
        key === repeatingKey &&
        ((isRepeat = !0),
        (function (evt) {
          try {
            Object.defineProperty(evt, "repeat", {value: !0});
          } catch (err) {}
        })(evt)),
      isRepeat && key === repeatingKey)
    ) {
      if (timestamp - lastRepeatingKeyTime < (repeatKeyCount ? 80 : 200)) return evt.preventDefault(), 1;
      repeatKeyCount++;
    } else
      (repeatingKey = key), (repeatKeyCount = 0), (repeatKeyFirstInputTime = timestamp), (repeatKeyLongPressed = !1);
    lastRepeatingKeyTime = timestamp;
  }
  function checkForLongPress(e, key, command) {
    throttleRepeatingKey(key, e),
      e.repeat &&
        !repeatKeyLongPressed &&
        ((key = e.timeStamp), LongPressTimeout <= key - repeatKeyFirstInputTime) &&
        ((repeatKeyLongPressed = !0), sendCommandFromEvent(command, e));
  }
  function getKeyFromKeyCode(keyCode) {
    switch (keyCode) {
      case 13:
        return "Enter";
      case 19:
        return "Pause";
      case 27:
        return "Back";
      case 32:
        return " ";
      case 33:
        return "PageUp";
      case 34:
        return "PageDown";
      case 37:
        return "ArrowLeft";
      case 39:
        return "ArrowRight";
      case 38:
        return "ArrowUp";
      case 40:
        return "ArrowDown";
      case 403:
        return "ColorF0Red";
      case 404:
        return "ColorF1Green";
      case 405:
        return "ColorF2Yellow";
      case 406:
        return "ColorF3Blue";
      case 412:
        return "MediaRewind";
      case 413:
        return "Stop";
      case 415:
        return "Play";
      case 416:
        return "MediaRecord";
      case 417:
        return "MediaFastForward";
      case 427:
        return "ChannelUp";
      case 428:
        return "ChannelDown";
      case 447:
        return "VolumeUp";
      case 448:
        return "VolumeDown";
      case 449:
        return "VolumeMute";
      case 457:
      case 1056:
        return "Info";
      case 458:
        return "Guide";
      case 459:
      case 460:
        return "Subtitle";
      case 461:
      case 10009:
        return "Back";
      case 10073:
        return "ChannelList";
      case 10135:
        return "Tools";
      case 10140:
        return "PictureSize";
      case 10200:
        return "Teletext";
      case 10221:
        return "Caption";
      case 10225:
        return "Search";
      case 10232:
        return "MediaTrackPrevious";
      case 10233:
        return "MediaTrackNext";
      case 10252:
        return "MediaPlayPause";
    }
    if (null == keyCode) return null;
    switch (keyCode) {
      case globalThis.VK_BACK_SPACE:
        return "Back";
      case globalThis.VK_LEFT:
        return "Left";
      case globalThis.VK_UP:
        return "Up";
      case globalThis.VK_RIGHT:
        return "Right";
      case globalThis.VK_DOWN:
        return "Down";
      case globalThis.VK_MENU:
        return "ContextMenu";
      case globalThis.VK_TRACK_NEXT:
        return "MediaTrackNext";
      case globalThis.VK_TRACK_PREV:
        return "MediaTrackPrevious";
      case globalThis.VK_INFO:
        return "Info";
      case globalThis.VK_STOP:
        return "MediaStop";
      case globalThis.VK_PLAY:
        return "MediaPlay";
      case globalThis.VK_PAUSE:
        return "MediaPause";
      case globalThis.VK_FAST_FWD:
        return "MediaFastForward";
      case globalThis.VK_REWIND:
        return "MediaRewind";
      default:
        return null;
    }
  }
  var keyDownTarget,
    EnableReadOnlyInputWorkaround = isNativeTizen || globalThis.webos || globalThis.PalmSystem,
    EnableSingleCharacterKeyWorkaround = _browser.default.web0s;
  _dom.default.addEventListener(
    window,
    "keydown",
    function onKeyDown(evt) {
      var e,
        key = (key = evt.resultKey || evt.key) || getKeyFromKeyCode(evt.keyCode);
      switch (((keyDownTarget = evt.target), key)) {
        case "ArrowUp":
        case "Up":
        case "NavigationUp":
        case "GamepadDPadUp":
        case "GamepadLeftThumbstickUp":
        case "GamepadLeftThumbStickUp":
          return (isNativeTizen && "Up" === key) || throttleRepeatingKey(key, evt)
            ? void 0
            : void sendCommandFromEvent("up", evt);
        case "ArrowDown":
        case "Down":
        case "NavigationDown":
        case "GamepadDPadDown":
        case "GamepadLeftThumbstickDown":
        case "GamepadLeftThumbStickDown":
          return (isNativeTizen && "Down" === key) || throttleRepeatingKey(key, evt)
            ? void 0
            : void sendCommandFromEvent("down", evt);
        case "ArrowLeft":
        case "Left":
        case "NavigationLeft":
        case "GamepadDPadLeft":
        case "GamepadLeftThumbStickLeft":
        case "GamepadLeftThumbstickLeft":
          if (isEditable(evt.target)) {
            break;
          } else if (isNativeTizen && "Left" === key) {
            return;
          } else if (evt.altKey) {
            evt.preventDefault();
            checkForLongPress(evt, key, "home");
            return;
          } else if (evt.shiftKey && !isEditable(evt.target)) {
            sendCommandFromEvent("rewind", evt);
            return;
          } else if (throttleRepeatingKey(key, evt)) {
            return;
          } else {
            sendCommandFromEvent("left", evt);
          }
          break;
        case "ArrowRight":
        case "Right":
        case "NavigationRight":
        case "GamepadDPadRight":
        case "GamepadLeftThumbStickRight":
        case "GamepadLeftThumbstickRight":
          if (isEditable(evt.target)) {
            break;
          } else if (isNativeTizen && "Right" === key) {
            return;
          } else if (evt.altKey) {
            sendCommandFromEvent("forward", evt);
            return;
          } else if (evt.shiftKey) {
            sendCommandFromEvent("fastforward", evt);
            return;
          } else if (throttleRepeatingKey(key, evt)) {
            return;
          } else {
            sendCommandFromEvent("right", evt);
          }
          break;
        case "End":
          return void (isEditable(evt.target) || sendCommandFromEvent("end", evt));
        case "Home":
          return void (isEditable(evt.target) || sendCommandFromEvent("home", evt));
        case "PageUp":
          return void sendCommandFromEvent("pageup", evt);
        case "PageDown":
          return void sendCommandFromEvent("pagedown", evt);
        case "Backspace":
          if (goBackOnBackspace && !isEditable(evt.target))
            return evt.preventDefault(), void checkForLongPress(evt, key, "home");
          break;
        case "Delete":
        case "Del":
          if (isEditable(evt.target)) break;
          return void sendCommandFromEvent("delete", evt);
        case "GamepadA":
        case "GamePadA":
          return (
            (e = evt),
            (!preventDefaultOnGamePadA && isEditable(e.target)) || e.preventDefault(),
            (e = {sourceElement: e.target, originalEvent: e}),
            void _inputmanager.default.trigger("select", e)
          );
        case "Accept":
        case "NavigationAccept":
        case "NavigateIn":
        case "Open":
        case "Select":
        case "Execute":
        case "Link":
          return void sendCommandFromEvent("select", evt);
        case "Enter":
          return void (evt.target.closest("button,a,select,input,textarea") || sendCommandFromEvent("select", evt));
        case "Escape":
        case "Esc":
        case "Cancel":
        case "NavigationCancel":
        case "GamepadB":
        case "GamePadB":
        case "Exit":
        case "NavigateOut":
        case "Back":
        case "RCUBack":
        case "GoBack":
        case "XF86Back":
          return evt.preventDefault(), void checkForLongPress(evt, key, "home");
        case "ContextMenu":
        case "NavigationMenu":
          return void sendCommandFromEvent("menu", evt);
        case "Menu":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("menu", evt);
          break;
        case "Help":
        case "Finish":
          break;
        case "Find":
        case "Search":
        case "XF86Search":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("search", evt);
          break;
        case "ZoomIn":
        case "ZoomOut":
          return void sendCommandFromEvent("changezoom", evt);
        case "F8":
          return void sendCommandFromEvent("togglemute", evt);
        case "F9":
          return void sendCommandFromEvent("volumedown", evt);
        case "F10":
          return void sendCommandFromEvent("volumeup", evt);
        case "+":
          if (isEditable(evt.target)) break;
          return void sendCommandFromEvent("channelup", evt);
        case "ChannelUp":
        case "RaiseChannel":
        case "XF86RaiseChannel":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("channelup", evt);
          break;
        case "-":
          if (isEditable(evt.target)) break;
          return void sendCommandFromEvent("channeldown", evt);
        case "ChannelDown":
        case "LowerChannel":
        case "XF86LowerChannel":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("channeldown", evt);
          break;
        case "MediaStepForward":
        case "MediaFastForward":
        case "FastFwd":
        case "AudioNext":
        case "XF86AudioNext":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("fastforward", evt);
          break;
        case "Pause":
        case "MediaPause":
        case "AudioPause":
        case "XF86AudioPause":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("pause", evt);
          break;
        case "Play":
        case "MediaPlay":
        case "AudioPlay":
        case "XF86AudioPlay":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("play", evt);
          break;
        case "MediaPlayPause":
        case "PlayBack":
        case "XF86PlayBack":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("playpause", evt);
          break;
        case "MediaRecord":
        case "AudioRecord":
        case "XF86AudioRecord":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("record", evt);
          break;
        case "MediaStepBackward":
        case "MediaRewind":
        case "AudioRewind":
        case "XF86AudioRewind":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("rewind", evt);
          break;
        case "Stop":
        case "MediaStop":
        case "AudioStop":
        case "XF86AudioStop":
        case "XF86Stop":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("stop", evt);
          break;
        case "MediaTrackNext":
        case "MediaNextTrack":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("next", evt);
          break;
        case "MediaTrackPrevious":
        case "MediaPreviousTrack":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("previous", evt);
          break;
        case "AudioVolumeDown":
        case "VolumeDown":
          return void sendCommandFromEvent("volumedown", evt);
        case "AudioVolumeUp":
        case "VolumeUp":
          return void sendCommandFromEvent("volumeup", evt);
        case "AudioVolumeMute":
        case "VolumeMute":
          return void sendCommandFromEvent("togglemute", evt);
        case "Red":
        case "XF86Red":
        case "ColorF0Red":
          return void sendCommandFromEvent("red", evt);
        case "Green":
        case "XF86Green":
        case "ColorF1Green":
          return void sendCommandFromEvent("green", evt);
        case "Yellow":
        case "XF86Yellow":
        case "ColorF2Yellow":
          return void sendCommandFromEvent("yellow", evt);
        case "Blue":
        case "XF86Blue":
        case "ColorF3Blue":
          return void sendCommandFromEvent("blue", evt);
        case "ColorF4Grey":
          return void sendCommandFromEvent("grey", evt);
        case "ColorF5Brown":
          return void sendCommandFromEvent("brown", evt);
        case "Caption":
        case "XF86Caption":
        case "ClosedCaptionToggle":
          return void sendCommandFromEvent("changesubtitletrack", evt);
        case "Dimmer":
          return void sendCommandFromEvent("changebrightness", evt);
        case "DVR":
          return void sendCommandFromEvent("guide", evt);
        case "ChannelList":
        case "Guide":
        case "ChannelGuide":
        case "XF86ChannelGuide":
        case "GuideNextDay":
        case "GuidePreviousDay":
          return void sendCommandFromEvent("guide", evt);
        case "Info":
        case "XF86Info":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("info", evt);
          break;
        case "InstantReplay":
          return void sendCommandFromEvent("rewind", evt);
        case "LiveContent":
          return void sendCommandFromEvent("livetv", evt);
        case "MediaAudioTrack":
          return void sendCommandFromEvent("changeaudiotrack", evt);
        case "MediaLast":
          break;
        case "MediaSkipBackward":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("previouschapter", evt);
          break;
        case "MediaSkipForward":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("nextchapter", evt);
          break;
        case "MediaTopMenu":
          return void sendCommandFromEvent("home", evt);
        case "NavigateNext":
          return void sendCommandFromEvent("next", evt);
        case "NavigatePrevious":
          return void sendCommandFromEvent("previous", evt);
        case "NextFavoriteChannel":
          return void sendCommandFromEvent("next", evt);
        case "Settings":
        case "Tools":
        case "SimpleMenu":
        case "XF86SimpleMenu":
          return void sendCommandFromEvent("settings", evt);
        case "Teletext":
        case "Subtitle":
          return void sendCommandFromEvent("changesubtitletrack", evt);
        case "ZoomToggle":
        case "Zoom":
        case "PictureSize":
        case "XF86PictureSize":
          return void sendCommandFromEvent("changezoom", evt);
        case "New":
          break;
        case "Save":
          return void sendCommandFromEvent("save", evt);
        case "LaunchMusicPlayer":
          return void sendCommandFromEvent("music", evt);
        case "LaunchScreenSaver":
          return void sendCommandFromEvent("screensaver", evt);
        case "BrowserBack":
          if (handleMultiMediaKeys) return evt.preventDefault(), void checkForLongPress(evt, key, "home");
          break;
        case "BrowserFavorites":
          return void sendCommandFromEvent("favorites", evt);
        case "BrowserForward":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("forward", evt);
          break;
        case "BrowserHome":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("home", evt);
          break;
        case "BrowserRefresh":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("refresh", evt);
          break;
        case "BrowserSearch":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("search", evt);
          break;
        case "BrowserStop":
          if (handleMultiMediaKeys) return void sendCommandFromEvent("stop", evt);
          break;
        case "j":
          if (evt.ctrlKey) return void sendCommandFromEvent("togglestats", evt);
          break;
        case "g":
          if (evt.ctrlKey) return void sendCommandFromEvent("guide", evt);
          break;
        case "Add":
        case "Subtract":
          break;
        case "a":
        case "A":
          if (evt.ctrlKey && evt.shiftKey) return void sendCommandFromEvent("changeaudiotrack", evt);
          break;
        case "b":
        case "B":
          if (evt.altKey && !evt.ctrlKey) return evt.preventDefault(), void checkForLongPress(evt, key, "home");
          break;
        case "d":
        case "D":
          if (evt.ctrlKey) return void sendCommandFromEvent("menu", evt);
          break;
        case "o":
        case "O":
          if (evt.ctrlKey) return void sendCommandFromEvent("recordedtv", evt);
          break;
        case "p":
        case "P":
          if (evt.ctrlKey)
            return evt.shiftKey ? void sendCommandFromEvent("play", evt) : void sendCommandFromEvent("playpause", evt);
          break;
        case "r":
        case "R":
          if (evt.ctrlKey) return void sendCommandFromEvent("record", evt);
          break;
        case "s":
        case "S":
          if (evt.ctrlKey)
            return evt.shiftKey ? void sendCommandFromEvent("stop", evt) : void sendCommandFromEvent("search", evt);
          break;
        case "t":
        case "T":
          if (!IsBrowser && evt.ctrlKey) return void sendCommandFromEvent("livetv", evt);
          break;
        case "u":
        case "U":
          if (evt.ctrlKey) return void sendCommandFromEvent("changesubtitletrack", evt);
          break;
        case "z":
        case "Z":
          if (evt.ctrlKey && evt.shiftKey) return void sendCommandFromEvent("changezoom", evt);
          break;
        case "Unidentified":
          if (((evt.resultKey = getKeyFromKeyCode(evt.keyCode)), evt.resultKey)) return onKeyDown(evt);
          break;
        default:
          if (
            EnableSingleCharacterKeyWorkaround &&
            key &&
            1 === key.length &&
            127 < key.charCodeAt(0) &&
            ((evt.resultKey = getKeyFromKeyCode(evt.keyCode)), evt.resultKey)
          )
            return onKeyDown(evt);
          EnableReadOnlyInputWorkaround &&
            !(function (e) {
              var val,
                value = e.keyCode;
              (8 === value || 32 === value || (48 <= value && value <= 57) || (65 <= value && value <= 90)) &&
                "INPUT" === (e = e.target).tagName &&
                e.readOnly &&
                (8 === value
                  ? ((val = e.value), (e.value = val.length ? val.substring(0, val.length - 1) : ""))
                  : (-1 === e.maxLength || e.value.length < e.maxLength) && (e.value += String.fromCharCode(value)),
                e.dispatchEvent(new CustomEvent("input", {bubbles: !0})));
            })(evt);
      }
      !(function (e) {
        _inputmanager.default.notify(null, e);
      })(evt);
    },
    {passive: !1}
  ),
    _dom.default.addEventListener(
      window,
      "keyup",
      function onKeyUp(e) {
        if (
          (EnableRepeatWorkaround && ((repeatingKey = null), (lastRepeatingKeyTime = repeatKeyCount = 0)),
          (repeatKeyLongPressed = !1),
          (repeatKeyFirstInputTime = 0),
          e.target === keyDownTarget)
        ) {
          var key = e.resultKey || e.key;
          switch ((key = key || getKeyFromKeyCode(e.keyCode))) {
            case "ArrowLeft":
            case "Left":
            case "NavigationLeft":
            case "GamepadDPadLeft":
            case "GamepadLeftThumbStickLeft":
            case "GamepadLeftThumbstickLeft":
              (isNativeTizen && "Left" === key) || (e.altKey && (e.preventDefault(), sendCommandFromEvent("back", e)));
              break;
            case "Backspace":
              goBackOnBackspace && !isEditable(e.target) && (e.preventDefault(), sendCommandFromEvent("back", e));
              break;
            case "Escape":
            case "Esc":
            case "Cancel":
            case "NavigationCancel":
            case "GamepadB":
            case "GamePadB":
            case "Exit":
            case "NavigateOut":
            case "Back":
            case "RCUBack":
            case "GoBack":
            case "XF86Back":
              return void sendCommandFromEvent("back", e);
            case "BrowserBack":
              handleMultiMediaKeys && sendCommandFromEvent("back", e);
              break;
            case "b":
            case "B":
              e.altKey && !e.ctrlKey && sendCommandFromEvent("back", e);
              break;
            case "Unidentified":
              if (((e.resultKey = getKeyFromKeyCode(e.keyCode)), e.resultKey)) return onKeyUp(e);
              break;
            default:
              if (
                EnableSingleCharacterKeyWorkaround &&
                key &&
                1 === key.length &&
                127 < key.charCodeAt(0) &&
                ((e.resultKey = getKeyFromKeyCode(e.keyCode)), e.resultKey)
              )
                return onKeyUp(e);
          }
        }
      },
      {passive: !1}
    );
  _exports.default = {
    normalizeKeyFromEvent: function normalizeKeyFromEvent(evt) {
      var key = evt.key;
      switch ((key = key || getKeyFromKeyCode(evt.keyCode))) {
        case "ArrowUp":
        case "Up":
        case "NavigationUp":
        case "GamepadDPadUp":
        case "GamepadLeftThumbstickUp":
        case "GamepadLeftThumbStickUp":
          return "ArrowUp";
        case "ArrowDown":
        case "Down":
        case "NavigationDown":
        case "GamepadDPadDown":
        case "GamepadLeftThumbstickDown":
        case "GamepadLeftThumbStickDown":
          return "ArrowDown";
        case "ArrowLeft":
        case "Left":
        case "NavigationLeft":
        case "GamepadDPadLeft":
        case "GamepadLeftThumbStickLeft":
        case "GamepadLeftThumbstickLeft":
          return "ArrowLeft";
        case "ArrowRight":
        case "Right":
        case "NavigationRight":
        case "GamepadDPadRight":
        case "GamepadLeftThumbStickRight":
        case "GamepadLeftThumbstickRight":
          return "ArrowRight";
        case "Accept":
        case "NavigationAccept":
        case "NavigateIn":
        case "Open":
        case "Select":
        case "Execute":
        case "Link":
        case "Enter":
          return "Enter";
        case "BrowserBack":
        case "Close":
        case "Escape":
        case "Esc":
        case "Cancel":
        case "NavigationCancel":
        case "GamepadB":
        case "GamePadB":
        case "Exit":
        case "NavigateOut":
        case "Back":
        case "RCUBack":
        case "GoBack":
        case "XF86Back":
          return "Back";
        case "Unidentified":
          var keyResult = getKeyFromKeyCode(evt.keyCode);
          if (keyResult) return normalizeKeyFromEvent({key: keyResult});
          break;
        default:
          if (key && 1 === key.length && 127 < key.charCodeAt(0) && (keyResult = getKeyFromKeyCode(evt.keyCode)))
            return normalizeKeyFromEvent({key: keyResult});
      }
      return key;
    },
  };
});
