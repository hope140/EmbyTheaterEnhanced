define([
  "exports",
  "./../emby-apiclient/connectionmanager.js",
  "./../emby-apiclient/events.js",
  "./../common/globalize.js",
  "./../approuter.js",
  "./../emby-elements/emby-tabs/emby-tabs.js",
  "./../layoutmanager.js",
  "./../cardbuilder/cardbuilder.js",
  "./../common/servicelocator.js",
  "./../appfooter/appfooter.js",
], function (
  _exports,
  _connectionmanager,
  _events,
  _globalize,
  _approuter,
  _embyTabs,
  _layoutmanager,
  _cardbuilder,
  _servicelocator,
  _appfooter
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["css!modules/dockedtabs/dockedtabs.css"]);
  var instance,
    headerHomeButton,
    headerSearchButton,
    headerMenuButton,
    currentServerId,
    hiddenMode = 0,
    libraryMode = 2,
    currentMode = hiddenMode,
    userSignedIn = !1;
  function onLocalUserSignedIn(e, serverId, userId) {
    (currentMode = hiddenMode), (currentServerId = serverId), (userSignedIn = !0);
  }
  function onLocalUserSignedOut(e) {
    userSignedIn = !1;
  }
  function updateHomeButton(tabsEnabled) {
    (tabsEnabled || headerHomeButton) &&
      ((headerHomeButton = headerHomeButton || document.querySelector(".headerHomeButton")),
      tabsEnabled
        ? headerHomeButton.classList.add("hiddenWhenBottomNavVisible")
        : headerHomeButton.classList.remove("hiddenWhenBottomNavVisible"));
  }
  function updateSearchButton(tabsEnabled) {
    (tabsEnabled || headerSearchButton) &&
      ((headerSearchButton = headerSearchButton || document.querySelector(".headerSearchButton")),
      tabsEnabled
        ? headerSearchButton.classList.add("hiddenWhenBottomNavVisible")
        : headerSearchButton.classList.remove("hiddenWhenBottomNavVisible"));
  }
  function updateMenuButton(tabsEnabled) {
    (tabsEnabled || headerMenuButton) &&
      (headerMenuButton = headerMenuButton || document.querySelector(".headerMenuButton"));
  }
  function setMode(mode) {
    var tabs;
    mode !== currentMode &&
      (tabs = instance) &&
      ((currentMode = mode) === libraryMode &&
        (function (parentElement) {
          var tabs = [];
          _connectionmanager.default
            .getApiClient(currentServerId)
            .getUserViews()
            .then(function (result) {
              tabs.push({
                name: _globalize.default.translate("Home"),
                icon: "&#xE88A;",
                active: !0,
                href: _approuter.default.getRouteUrl("home"),
              }),
                tabs.push({
                  name: _globalize.default.translate("Search"),
                  icon: "&#xE8B6;",
                  href: _approuter.default.getRouteUrl("search"),
                }),
                _servicelocator.appHost.supports("sync") &&
                  tabs.push({
                    name: _globalize.default.translate("Downloads"),
                    icon: "&#xf090;",
                    href: _approuter.default.getRouteUrl("downloads"),
                  });
              /*for (var i = 0, length = result.Items.length; i < length && !(5 <= tabs.length); i++)
                tabs.push({
                  name: result.Items[i].Name,
                  icon: _cardbuilder.default.getDefaultIcon(result.Items[i]),
                  href: _approuter.default.getRouteUrl(result.Items[i]),
                });*/
              !(function (tabs, parentElement) {
                tabs.length
                  ? ((tabs = tabs
                      .map(function (tab, index) {
                        var active = tab.active ? " emby-tab-button-active" : "";
                        return (
                          '<a is="emby-linkbutton" href=".' +
                          tab.href +
                          '" tabindex="-1" class="dockedtabs-tab-button emby-tab-button' +
                          active +
                          '" data-index="' +
                          index +
                          '">                <i class="dockedtabs-tab-button-icon md-icon">' +
                          tab.icon +
                          "</i><div>" +
                          tab.name +
                          "</div></a>"
                        );
                      })
                      .join("")),
                    (parentElement.innerHTML = tabs))
                  : (parentElement.innerHTML = ""),
                  parentElement.onTabsChanged();
              })(tabs, parentElement);
            });
        })(getElement(tabs)),
      mode === hiddenMode
        ? (tabs.hide(), updateHomeButton(!1), updateSearchButton(!1), updateMenuButton(!1))
        : (tabs.show(), updateHomeButton(!0), updateSearchButton(!0), updateMenuButton(!0)));
  }
  function onViewShow(e) {
    e = e.detail;
    _layoutmanager.default.tv || !1 === e.dockedTabs || !userSignedIn ? setMode(hiddenMode) : setMode(libraryMode);
  }
  function getElement(instance) {
    return (
      instance.element ||
      (instance.element =
        (_appfooter.default.add('<div is="emby-tabs" class="dockedtabs-tabs dockedtabs hide"></div>'),
        _appfooter.default.element.querySelector(".dockedtabs")))
    );
  }
  function DockedTabs() {
    (instance = this),
      _events.default.on(_connectionmanager.default, "localusersignedin", onLocalUserSignedIn),
      _events.default.on(_connectionmanager.default, "localusersignedout", onLocalUserSignedOut),
      document.addEventListener("viewshow", onViewShow);
  }
  (DockedTabs.prototype.destroy = function () {
    document.removeEventListener("viewshow", onViewShow);
    this.element;
    this.element = null;
  }),
    (DockedTabs.prototype.show = function () {
      getElement(this).classList.remove("hide"), _appfooter.default.setWithContent50w(!0);
    }),
    (DockedTabs.prototype.hide = function () {
      var element = this.element;
      element && (element.classList.add("hide"), (element.innerHTML = ""), _appfooter.default.setWithContent50w(!1));
    }),
    new DockedTabs(),
    (_exports.default = DockedTabs);
});
