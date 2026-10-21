define(["exports", "./../servicelocator.js", "./../usersettings/usersettings.js"], function (
  _exports,
  _servicelocator,
  _usersettings
) {
  function getResolvedPromise() {
    return Promise.resolve();
  }
  function alertText(options) {
    return (
      (dep = ["alert"]),
      new Promise(function (resolve, reject) {
        require(dep, resolve);
      }).then(function (alert) {
        return alert(options);
      })
    );
    var dep;
  }
  function showMessage(text, userSettingsKey, appHostFeature) {
    if (_servicelocator.appHost.supports(appHostFeature)) return Promise.resolve();
    var dayNum,
      appHostFeature = new Date();
    return (
      (userSettingsKey +=
        appHostFeature.getFullYear() +
        "-w" +
        ((appHostFeature = appHostFeature),
        (dayNum =
          (appHostFeature = new Date(
            Date.UTC(appHostFeature.getFullYear(), appHostFeature.getMonth(), appHostFeature.getDate())
          )).getUTCDay() || 7),
        appHostFeature.setUTCDate(appHostFeature.getUTCDate() + 4 - dayNum),
        (dayNum = new Date(Date.UTC(appHostFeature.getUTCFullYear(), 0, 1))),
        Math.ceil(((appHostFeature - dayNum) / 864e5 + 1) / 7))),
      "1" === _usersettings.default.get(userSettingsKey, !1)
        ? Promise.resolve()
        : (_usersettings.default.set(userSettingsKey, "1", !1), alertText(text).catch(getResolvedPromise))
    );
  }
  function ExpirementalPlaybackWarnings() {
    (this.name = "Experimental playback warnings"),
      (this.type = "preplayintercept"),
      (this.id = "expirementalplaybackwarnings");
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (ExpirementalPlaybackWarnings.prototype.intercept = function (options) {
      options = options.item;
      return options
        ? "Iso" === options.VideoType ||
          "iso" === options.Container ||
          "blurayiso" === options.Container ||
          "dvdiso" === options.Container
          ? showMessage(
              "目前播放“ISO文件”功能还处于实验性阶段，为了获得更好的体验，请用“MKVToolNix”工具将视频文件转换为“MKV”扩展名格式，或者使用能够直接播放“ISO文件”的外部播放器。",
              "isoexpirementalinfo",
              "nativeisoplayback"
            )
          : "BluRay" === options.VideoType || "bluray" === options.Container
          ? showMessage(
              "目前播放“BluRay文件夹”功能还处于实验性阶段，为了获得更好的体验，请用“MKVToolNix”工具将视频文件转换为“MKV”扩展名格式，或者使用能够直接播放“Bluray文件夹”的外部播放器。",
              "blurayexpirementalinfo",
              "nativeblurayplayback"
            )
          : "Dvd" === options.VideoType || "dvd" === options.Container
          ? showMessage(
              "目前播放“DVD文件夹”功能还处于实验性阶段，为了获得更好的体验，请用“MKVToolNix”工具将视频文件转换为“MKV”扩展名格式，或者使用能够直接播放“DVD文件夹”的外部播放器。",
              "dvdexpirementalinfo",
              "nativedvdplayback"
            )
          : Promise.resolve()
        : Promise.resolve();
    }),
    (_exports.default = ExpirementalPlaybackWarnings);
});
