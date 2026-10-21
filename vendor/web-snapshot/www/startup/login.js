define([
  "exports",
  "./../list/list.js",
  "./../modules/loading/loading.js",
  "./../modules/common/globalize.js",
  "./../modules/emby-elements/emby-input/emby-input.js",
  "./../modules/emby-elements/emby-button/emby-button.js",
  "./../modules/emby-elements/emby-checkbox/emby-checkbox.js",
  "./../modules/emby-elements/emby-select/emby-select.js",
  "./../modules/emby-elements/emby-scroller/emby-scroller.js",
  "./../modules/emby-apiclient/connectionmanager.js",
  "./../modules/approuter.js",
  "./../modules/focusmanager.js",
  "./../modules/common/appsettings.js",
  "./../modules/common/servicelocator.js",
  "./startuphelper.js",
], function (
  _exports,
  _list,
  _loading,
  _globalize,
  _embyInput,
  _embyButton,
  _embyCheckbox,
  _embySelect,
  _embyScroller,
  _connectionmanager,
  _approuter,
  _focusmanager,
  _appsettings,
  _servicelocator,
  _startuphelper
) {
  function setItemProperies(server) {}
  function LoginPage(view, params) {
    (this.enableAlphaNumericShortcuts = !1),
      _list.default.call(this, view, params),
      view.querySelector(".itemsContainer").addEventListener(
        "action-null",
        function (e) {
          "User" !== (e = e.detail.item).Type
            ? _approuter.default.showItem(e)
            : e.HasPassword
            ? _approuter.default.showItem({Type: "ManualLogin", ServerId: e.ServerId, Username: e.Name})
            : _startuphelper.default.authenticateUser(e.ServerId, e.Name);
        }.bind(this)
      ),
      (function (view, apiClient) {
        _servicelocator.appHost.supports("multiserver") ||
          apiClient.getJSON(apiClient.getUrl("Branding/Configuration")).then(function (options) {
            var elem = view.querySelector(".disclaimer");
            options.LoginDisclaimer && elem.classList.remove("hide"),
              (elem.innerHTML = options.LoginDisclaimer || "");
          });
      })(view, _connectionmanager.default.getApiClient(params.serverId));
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["material-icons"]),
    Object.assign(LoginPage.prototype, _list.default.prototype),
    (LoginPage.prototype.getSortMenuOptions = function () {
      return [];
    }),
    (LoginPage.prototype.supportsPlay = function () {
      return !1;
    }),
    (LoginPage.prototype.getItems = function (query) {
      var serverId = this.params.serverId;
      return _connectionmanager.default
        .getApiClient(serverId)
        .getPublicUsers()
        .then(function (items) {
          items.forEach(setItemProperies),
            (function (items, serverId) {
              items.push({
                Name: _globalize.default.translate("HeaderManualLogin"),
                Type: "ManualLogin",
                ServerId: serverId,
              }),
                /*items.push({
                  Name: _globalize.default.translate("HeaderForgotPassword"),
                  Type: "ForgotPassword",
                  ServerId: serverId,
                }),*/
                _servicelocator.appHost.supports("multiserver") &&
                  items.push({Name: _globalize.default.translate("HeaderChangeServer"), Type: "SelectServer"});
            })(items, serverId);
          var totalRecordCount = items.length;
          return (
            query &&
              (query.StartIndex && (items = items.slice(query.StartIndex)),
              null != query.Limit && query.Limit < items.length && (items.length = query.Limit)),
            {Items: items, TotalRecordCount: totalRecordCount}
          );
        });
    }),
    (LoginPage.prototype.setTitle = function () {}),
    (LoginPage.prototype.getCardOptions = function (items, settings) {
      var options = _list.default.prototype.getCardOptions.apply(this, arguments);
      return Object.assign(options, {
        shape: "auto",
        fields: ["Name"],
        centerText: !0,
        overlayText: !1,
        multiSelect: !1,
        contextMenu: !1,
        action: "custom",
        defaultBackground: !0,
        draggable: !1,
      });
    }),
    (_exports.default = LoginPage);
});
