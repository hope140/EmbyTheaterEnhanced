define([
  "exports",
  "./../modules/viewmanager/baseview.js",
  "./../modules/loading/loading.js",
  "./../modules/common/globalize.js",
  "./../modules/emby-elements/emby-input/emby-input.js",
  "./../modules/emby-elements/emby-button/emby-button.js",
  "./../modules/emby-elements/emby-checkbox/emby-checkbox.js",
  "./../modules/emby-elements/emby-select/emby-select.js",
  "./../modules/emby-elements/emby-scroller/emby-scroller.js",
  "./../modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js",
  "./../modules/common/datetime.js",
  "./../modules/layoutmanager.js",
  "./../components/taskbutton.js",
  "./../modules/maintabsmanager.js",
  "./../modules/cardbuilder/cardbuilder.js",
  "./../modules/approuter.js",
], function (
  _exports,
  _baseview,
  _loading,
  _globalize,
  _embyInput,
  _embyButton,
  _embyCheckbox,
  _embySelect,
  _embyScroller,
  _embyItemscontainer,
  _datetime,
  _layoutmanager,
  _taskbutton,
  _maintabsmanager,
  _cardbuilder,
  _approuter
) {
  function getListingProviders() {
    var apiClient = this.apiClient;
    return apiClient
      .getJSON(ApiClient.getUrl("LiveTv/ListingProviders"))
      .catch(function () {
        return apiClient.getNamedConfiguration("livetv").then(function (config) {
          return config.ListingProviders;
        });
      })
      .then(function (results) {
        return (
          (function (providers, apiClient) {
            for (var i = 0, length = providers.length; i < length; i++) {
              var provider = providers[i];
              provider.Name || (provider.Name = provider.Type),
                provider.Url || (provider.Url = provider.Path || provider.ListingsId),
                provider.SetupUrl ||
                  (provider.SetupUrl =
                    "xmltv" === provider.Type ? "livetvsetup/xmltv.html" : "livetvsetup/schedulesdirect.html"),
                (provider.ProviderType = provider.Type),
                (provider.Type = "LiveTVGuideSource"),
                (provider.ServerId = apiClient.serverId());
            }
          })(results, apiClient),
          results
        );
      });
  }
  function getTunerDevices() {
    var apiClient = this.apiClient;
    return apiClient
      .getJSON(ApiClient.getUrl("LiveTv/TunerHosts"))
      .catch(function () {
        return apiClient.getNamedConfiguration("livetv").then(function (config) {
          return config.TunerHosts;
        });
      })
      .then(function (results) {
        return (
          (function (devices, apiClient) {
            for (var i = 0, length = devices.length; i < length; i++) {
              var tuner = devices[i];
              (tuner.Type = "LiveTVTunerDevice"),
                (tuner.Name = tuner.FriendlyName),
                (tuner.ServerId = apiClient.serverId());
            }
          })(results, apiClient),
          results
        );
      });
  }
  function addDevice(button) {
    require(["actionsheet"], function (actionSheet) {
      return ApiClient.getJSON(ApiClient.getUrl("LiveTv/TunerHosts/Types")).then(function (types) {
        var allTunerTypes = types;
        return (
          (types = allTunerTypes.map(function (t) {
            return {id: t.Id, name: t.Name};
          })),
          actionSheet
            .show({
              items: types,
              title: _globalize.default.translate("HeaderAddTvSource"),
              positionTo: button,
              positionY: "bottom",
              bottomText: _globalize.default.translate(
                "ForAdditionalLiveTvOptions",
                '<a is="emby-linkbutton" href="plugincatalog" class="button-link">',
                "</a>"
              ),
            })
            .then(function (typeId) {
              !(function (allTunerTypes, typeId) {
                (allTunerTypes =
                  (allTunerTypes = allTunerTypes.filter(function (t) {
                    return t.Id === typeId;
                  })[0].SetupUrl) || "livetvsetup/livetvtuner.html?type=" + typeId),
                  _approuter.default.show(allTunerTypes);
              })(allTunerTypes, typeId);
            })
        );
      });
    });
  }
  function getTabs() {
    var list = [{href: "livetvsetup/livetvstatus.html", name: _globalize.default.translate("Setup")}];
    return (
      list.push({href: "livetvsetup/channels", name: _globalize.default.translate("Channels")}),
      list.push({href: "livetvsetup/livetvsettings.html", name: _globalize.default.translate("Advanced")}),
      list
    );
  }
  function LiveTVSetupView(view, params) {
    _baseview.default.apply(this, arguments),
      view.querySelector(".btnAddDevice").addEventListener("click", function () {
        addDevice(this);
      }),
      view.querySelector(".btnAddProvider").addEventListener("click", function () {
        _approuter.default.show("livetvsetup/guideprovider.html");
      }),
      (view.querySelector(".premiereInfo").innerHTML = _globalize.default.translate(
        "",
        '<a is="emby-linkbutton" href="https://emby.media/premiere" target="_blank" class="button-link">',
        "</a>"
      )),
      (this.apiClient = ApiClient),
      (this.tunersItemsContainer = view.querySelector(".devicesList")),
      (this.tunersItemsContainer.fetchData = getTunerDevices.bind(this)),
      (this.tunersItemsContainer.getListOptions = function () {
        return {
          renderer: _cardbuilder.default,
          options: {
            fields: ["Name", "Url"],
            multiSelect: !1,
            overlayText: !1,
            draggable: !1,
            action: "edit",
            shape: "backdrop",
            defaultBackground: !0,
          },
          virtualScrollLayout: "vertical-grid",
        };
      }.bind(this)),
      (this.providersItemsContainer = view.querySelector(".providerList")),
      (this.providersItemsContainer.fetchData = getListingProviders.bind(this)),
      (this.providersItemsContainer.getListOptions = function () {
        return {
          renderer: _cardbuilder.default,
          options: {
            fields: ["Name", "Url"],
            multiSelect: !1,
            overlayText: !1,
            draggable: !1,
            action: "edit",
            shape: "backdrop",
            defaultBackground: !0,
          },
          virtualScrollLayout: "vertical-grid",
        };
      }.bind(this));
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["listViewStyle", "flexStyles", "material-icons"]),
    Object.assign(LiveTVSetupView.prototype, _baseview.default.prototype),
    (LiveTVSetupView.prototype.onResume = function (options) {
      return (
        _baseview.default.prototype.onResume.apply(this, arguments),
        _maintabsmanager.default.setTabs(this, 0, getTabs),
        (0, _taskbutton.default)({
          mode: "on",
          progressElem: this.view.querySelector(".refreshGuideProgress"),
          taskKey: "RefreshGuide",
          button: this.view.querySelector(".btnRefresh"),
        }),
        Promise.all([this.tunersItemsContainer.resume(options), this.providersItemsContainer.resume(options)])
      );
    }),
    (LiveTVSetupView.prototype.onPause = function () {
      _baseview.default.prototype.onPause.apply(this, arguments),
        this.tunersItemsContainer.pause(),
        this.providersItemsContainer.pause(),
        (0, _taskbutton.default)({
          mode: "off",
          progressElem: this.view.querySelector(".refreshGuideProgress"),
          taskKey: "RefreshGuide",
          button: this.view.querySelector(".btnRefresh"),
        });
    }),
    (_exports.default = LiveTVSetupView);
});
