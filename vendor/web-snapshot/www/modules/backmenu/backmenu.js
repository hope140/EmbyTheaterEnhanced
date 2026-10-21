define([
  "exports",
  "./../emby-apiclient/connectionmanager.js",
  "./../common/servicelocator.js",
  "./../layoutmanager.js",
  "./../common/globalize.js",
  "./../browser.js",
  "./../approuter.js",
  "./../actionsheet/actionsheet.js",
  "./../cardbuilder/cardbuilder.js",
], function (
  _exports,
  _connectionmanager,
  _servicelocator,
  _layoutmanager,
  _globalize,
  _browser,
  _approuter,
  _actionsheet,
  _cardbuilder
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (_exports.default = function (options) {
      var apiClient = _connectionmanager.default.currentApiClient();
      return (function (apiClient) {
        return apiClient ? apiClient.getCurrentUser() : Promise.resolve(null);
      })(apiClient).then(function (user) {
        return _actionsheet.default
          .show({
            items: (function (apiClient, user) {
              var items = [],
                currentRoute = _approuter.default.current();
              return (
                currentRoute &&
                  "home" !== currentRoute.type &&
                  items.push({name: _globalize.default.translate("Home"), id: "home", icon: "&#xE88A;"}),
                (apiClient && _browser.default.web0s && "554ae9ea56b94c1c82cc628f6de52d85" === apiClient.serverId()) ||
                  items.push({
                    name: _globalize.default.translate("HeaderAppSettings"),
                    id: "settings",
                    icon: "&#xE8B8;",
                    secondaryText: _servicelocator.appHost.appName() + " " + _servicelocator.appHost.appVersion(),
                  }),
                user &&
                  user.Policy.IsAdministrator &&
                  _approuter.default.getRouteInfo(_approuter.default.getRouteUrl("manageserver")) &&
                  items.push({
                    name: _globalize.default.translate("ManageEmbyServer"),
                    id: "manageserver",
                    icon: "dashboard",
                  }),
                _servicelocator.appHost.supports("multiserver") &&
                  items.push({
                    name: _globalize.default.translate("HeaderChangeServer"),
                    id: "selectserver",
                    icon: "&#xE63E;",
                  }),
                apiClient &&
                  !_connectionmanager.default.isLoggedIntoConnect() &&
                  items.push({
                    name: _globalize.default.translate("HeaderChangeUser"),
                    id: "changeuser",
                    icon: "person",
                  }),
                  items.push({
                    name: _globalize.default.translate("HeaderSignOut"),
                    id: "logout",
                    icon: "&#xE879;"
                  }),
                _layoutmanager.default.tv &&
                  _servicelocator.appHost.supports("exit") &&
                  items.push({name: _globalize.default.translate("Exit"), id: "exit", icon: "&#xE879;"}),
                /*_servicelocator.appHost.supports("sleep") &&
                  items.push({name: _globalize.default.translate("Sleep"), id: "sleep", icon: "&#xE426;"}),
                items.push({name: _globalize.default.translate("HeaderSignOut"), id: "logout", icon: "&#xE879;"}),
                _servicelocator.appHost.supports("shutdown") &&
                  items.push({name: _globalize.default.translate("Shutdown"), id: "shutdown", icon: "&#xE8AC;"}),*/
                _servicelocator.appHost.supports("restart") &&
                  items.push({name: _globalize.default.translate("Restart"), id: "restart", icon: "&#xE5D5;"}),
                items
              );
            })(apiClient, user),
            positionTo: options.positionTo,
            positionY: options.positionY,
            positionX: options.positionX,
            transformOrigin: options.transformOrigin,
            iconRight: !0,
            item: user,
            cardBuilder: _cardbuilder.default,
            showServerName: !0,
            hasItemIcon: !0,
          })
          .then(function (id) {
            switch (id) {
              case "logout":
                _approuter.default.logout();
                break;
              case "changeuser":
                _approuter.default.showServerLogin(apiClient);
                break;
              case "home":
                _approuter.default.goHome();
                break;
              case "exit":
                _servicelocator.appHost.exit();
                break;
              case "sleep":
                _servicelocator.appHost.sleep();
                break;
              case "shutdown":
                _servicelocator.appHost.shutdown();
                break;
              case "restart":
                _servicelocator.appHost.restart();
                break;
              case "settings":
                _approuter.default.showSettings();
                break;
              case "manageserver":
                _approuter.default.show(_approuter.default.getRouteUrl("manageserver"));
                break;
              case "selectserver":
                _approuter.default.showSelectServer();
                break;
              default:
                return Promise.reject();
            }
            return Promise.resolve();
          });
      });
    });
});
