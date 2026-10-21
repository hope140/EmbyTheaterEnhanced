define([
  "exports",
  "./common/servicelocator.js",
  "./layoutmanager.js",
  "./common/globalize.js",
  "./browser.js",
], function (_exports, _servicelocator, _layoutmanager, _globalize, _browser) {
  function getPremiumInfoUrl() {
    return _browser.default.tizen ? "https://emby.media/premieresamsung" : "https://emby.media/premiere";
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (_exports.default = {
      getProductInfo: function (feature) {
        return null;
      },
      beginPurchase: function (feature, email) {
        return (
          _servicelocator.appHost.supports("externalpremium")
            ? _servicelocator.shell.openUrl(getPremiumInfoUrl())
            : require(["alert"], function (alert) {
                alert("Please visit " + getPremiumInfoUrl());
              }),
          Promise.reject()
        );
      },
      restorePurchase: function (id) {
        return Promise.reject();
      },
      getSubscriptionOptions: function () {
        var options = [];
        return (
          options.push({
            id: "embypremiere",
            title: _globalize.default.translate("HeaderBecomeProjectSupporter"),
            requiresEmail: !1,
          }),
          Promise.resolve(options)
        );
      },
      isUnlockedByDefault: function (feature, options) {
        return ("playback" === feature || "playback-tv" === feature) &&
          ((!_layoutmanager.default.tv &&
            "playback-tv" !== feature &&
            "windows" !== self.appMode &&
            "winjs" !== self.appMode &&
            !_browser.default.electron) ||
            _browser.default.operaTv ||
            _browser.default.tizen ||
            _browser.default.web0s)
          ? Promise.resolve()
          : Promise.reject();
      },
      getAdminFeatureName: function (feature) {
        return "playback" === feature &&
          (_layoutmanager.default.tv ||
            "windows" === self.appMode ||
            "winjs" === self.appMode ||
            _browser.default.electron)
          ? "embytheater-unlock"
          : feature;
      },
      getRestoreButtonText: function () {
        return _globalize.default.translate("HeaderAlreadyPaid");
      },
      getPeriodicMessageIntervalMs: function (feature) {
        return "playback" === feature &&
          (_layoutmanager.default.tv ||
            "windows" === self.appMode ||
            "winjs" === self.appMode ||
            _browser.default.electron)
          ? 864e5
          : 0;
      },
      getPremiumInfoUrl: getPremiumInfoUrl,
    });
});
