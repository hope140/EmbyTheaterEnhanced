define(["exports", "./../emby-apiclient/events.js", "./servicelocator.js"], function (
  _exports,
  _events,
  _servicelocator
) {
  function getKey(name, userId) {
    return (name = userId ? userId + "-" + name : name);
  }
  function AppSettings() {}
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (AppSettings.prototype.enableAutoLogin = function (val) {
      return null != val && this.set("enableAutoLogin", val.toString()), "false" !== this.get("enableAutoLogin");
    }),
    (AppSettings.prototype.enableAutomaticBitrateDetection = function (isInNetwork, mediaType, val) {
      var key = "enableautobitratebitrate-" + mediaType + "-" + isInNetwork;
      return (
        null != val && this.set(key, (val = isInNetwork && "Audio" === mediaType ? !0 : val).toString()),
        !(!isInNetwork || "Audio" !== mediaType) || "false" !== this.get(key)
      );
    }),
    (AppSettings.prototype.maxStreamingBitrate = function (isInNetwork, mediaType, val) {
      var key = "maxbitrate-" + mediaType + "-" + isInNetwork;
      return (
        null == val || (isInNetwork && "Audio" === mediaType) || this.set(key, val),
        isInNetwork && "Audio" === mediaType ? 15e7 : parseInt(this.get(key) || "0") || 12e7
      );
    }),
    (AppSettings.prototype.maxStaticMusicBitrate = function (val) {
      void 0 !== val && this.set("maxStaticMusicBitrate", val);
      return parseInt(this.get("maxStaticMusicBitrate") || (12e7).toString()) || 12e7;
    }),
    (AppSettings.prototype.maxChromecastBitrate = function (val) {
      var bitrate = this.get("chromecastBitrate1");
      if (bitrate === undefined || bitrate === null) {
        bitrate = 12e7;
      }
      if (val !== undefined) {
        this.set("chromecastBitrate1", val);
      }
      return parseInt(bitrate);
    }),
    (AppSettings.prototype.introSkipDisplayCount = function (val) {
      return (
        null != val && this.set("introSkipDisplayCount", val),
        (val = this.get("introSkipDisplayCount")) ? parseInt(val) : 0
      );
    }),
    (AppSettings.prototype.syncOnlyOnWifi = function (val) {
      return null != val && this.set("syncOnlyOnWifi", val.toString()), "false" !== this.get("syncOnlyOnWifi");
    }),
    (AppSettings.prototype.cameraUploadOnlyOnWifi = function (val) {
      return (
        null != val && this.set("cameraUploadOnlyOnWifi", val.toString()),
        "false" !== this.get("cameraUploadOnlyOnWifi")
      );
    }),
    (AppSettings.prototype.cameraUploadAllFolders = function (val) {
      return (
        null != val && this.set("cameraUploadAllFolders", val.toString()),
        "false" !== this.get("cameraUploadAllFolders")
      );
    }),
    (AppSettings.prototype.syncWhenRoaming = function (val) {
      return null != val && this.set("syncWhenRoaming", val.toString()), "false" !== this.get("syncWhenRoaming");
    }),
    (AppSettings.prototype.syncPath = function (val) {
      return null != val && this.set("syncPath", val), this.get("syncPath");
    }),
    (AppSettings.prototype.cameraUploadFolders = function (val) {
      return (
        null != val && this.set("cameraUploadFolders", val.join("||")),
        (val = this.get("cameraUploadFolders")) ? val.split("||") : []
      );
    }),
    (AppSettings.prototype.cameraUploadServers = function (val) {
      return (
        null != val && this.set("cameraUploadServers", val.join(",")),
        (val = this.get("cameraUploadServers")) ? val.split(",") : []
      );
    }),
    (AppSettings.prototype.runAtStartup = function (val) {
      return null != val && this.set("runatstartup", val.toString()), "true" === this.get("runatstartup");
    }),
    (AppSettings.prototype.enableRefreshRateSwitching = function (val) {
      return (
        null != val && this.set("enableRefreshRateSwitching", val.toString()),
        "true" === this.get("enableRefreshRateSwitching")
      );
    }),
    (AppSettings.prototype.backgroundVideo = function (val) {
      return null != val && this.set("backgroundVideo", val), this.get("backgroundVideo");
    }),
    (AppSettings.prototype.set = function (name, value, userId) {
      var currentValue = this.get(name, userId);
      _servicelocator.appStorage.setItem(getKey(name, userId), value),
        currentValue !== value && _events.default.trigger(this, "change", [name, value]);
    }),
    (AppSettings.prototype.get = function (name, userId) {
      return _servicelocator.appStorage.getItem(getKey(name, userId));
    }),
    (AppSettings.prototype.enableSystemExternalPlayers = function (val) {
      return (
        null != val && this.set("enableSystemExternalPlayers", val.toString()),
        "true" === this.get("enableSystemExternalPlayers")
      );
    }),
    (AppSettings.prototype.autoplay = function (val) {
      return null != val && this.set("autoplay", val.toString()), "false" !== this.get("autoplay");
    });
  var _default = new AppSettings();
  _exports.default = _default;
});
