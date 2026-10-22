define([
  "exports",
  "./../dom.js",
  "./../browser.js",
  "./../common/inputmanager.js",
  "./../common/usersettings/usersettings.js",
  "./../common/globalize.js",
  "./../common/datetime.js",
  "./../common/playback/playbackmanager.js",
  "./../emby-apiclient/events.js",
  "./../emby-apiclient/connectionmanager.js",
  "./../layoutmanager.js",
  "./../approuter.js",
  "./../maintabsmanager.js",
  "./../viewmanager/viewmanager.js",
  "./../backdrop/backdrop.js",
  "./../common/servicelocator.js",
  "./../navdrawer/navdrawer.js",
  "./../navdrawer/navdrawercontent.js",
  "./../common/input/api.js",
  "./../emby-elements/emby-button/paper-icon-button-light.js",
  "./../common/methodtimer.js",
], function (
  _exports,
  _dom,
  _browser,
  _inputmanager,
  _usersettings,
  _globalize,
  _datetime,
  _playbackmanager,
  _events,
  _connectionmanager,
  _layoutmanager,
  _approuter,
  _maintabsmanager,
  _viewmanager,
  _backdrop,
  _servicelocator,
  _navdrawer,
  _navdrawercontent,
  _api,
  _paperIconButtonLight,
  _methodtimer
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["material-icons", "css!modules/appheader/appheader.css"]);
  var headerHomeButton,
    headerMenuButton,
    headerBackButton,
    headerCastButton,
    headerHelpButton,
    headerSearchButton,
    headerSettingsButton,
    headerUserButton,
    selectedPlayerText,
    headerLeft,
    headerRight,
    currentServerId,
    isUserAdmin,
    headerMiddle,
    _scrollingElement,
    boundLayoutModeChangeFn,
    skinHeaderElement = document.querySelector(".skinHeader"),
    skinBodyElement = document.querySelector(".skinBody"),
    backdropContainer = (document.querySelector(".mainDrawer"), document.querySelector(".backdropContainer")),
    hasPhysicalBackButton = _servicelocator.appHost.supports("physicalbackbutton"),
    supportsFullscreenMediaQueries = _servicelocator.appHost.supports("fullscreenmediaqueries"),
    userSignedIn = !1;
  function updateClock() {
    var clock = this.clockElement;
    clock && (clock.innerHTML = _datetime.default.getDisplayTime(new Date()).toLowerCase());
  }
  function onLocalUserSignedOut(e) {
    (userSignedIn = !1),
      headerSearchButton.classList.add("hide"),
      updateUserInHeader(null),
      setRemoteControlVisibility();
  }
  function ensureHeaderSettingsButton() {
    (headerUserButton = headerUserButton || document.querySelector(".headerUserButton")),
      (headerSettingsButton = headerSettingsButton || document.querySelector(".headerSettingsButton"));
  }
  function updateUserInHeader(user) {
    var userImageUrl;
    ensureHeaderSettingsButton(),
      user &&
        user.PrimaryImageTag &&
        (userImageUrl = (function (user, apiClient, options) {
          return (
            ((options = options || {}).type = "Primary"),
            user.PrimaryImageTag
              ? ((options.tag = user.PrimaryImageTag), apiClient.getUserImageUrl(user.Id, options))
              : null
          );
        })(user, _connectionmanager.default.getApiClient(user.ServerId), {
          height: Math.round(38 * Math.max(window.devicePixelRatio || 1, 2)),
        })),
      (headerUserButton.innerHTML = userImageUrl
        ? '<img draggable="false" decoding="async" class="headerUserButtonImage paper-icon-button-img" src="' +
          userImageUrl +
          '" />'
        : '<i class="md-icon">&#xE7FD;</i>'),
      (isUserAdmin = user
        ? (headerUserButton.classList.remove("hide"),
          _layoutmanager.default.tv
            ? headerSettingsButton.classList.add("hide")
            : headerSettingsButton.classList.remove("hide"),
          user.Policy.IsAdministrator)
        : (headerUserButton.classList.add("hide"), headerSettingsButton.classList.add("hide"), !1));
  }
  function onUserUpdated(e, apiClient, data) {
    apiClient.getCurrentUserId() === data.Id && apiClient.serverId() === currentServerId && updateUserInHeader(data);
  }
  function resetPremiereButton() {
    _servicelocator.appHost.supports("premiereinheader") &&
      _connectionmanager.default.currentApiClient() &&
      _connectionmanager.default.currentApiClient().serverId() &&
      require(["registrationServices", "emby-button"], function (registrationServices) {
        registrationServices
          .validateFeature("themes", {viewOnly: !0, showDialog: !1})
      });
  }
  function onPremiereButtonClick() {
    require(["registrationServices"], function (registrationServices) {
      registrationServices.validateFeature("themes", {viewOnly: !0}).then(resetPremiereButton);
    });
  }
  function addPremiereButton() {
    var html =
      '<button is="emby-button" class="raised raised-mini button-submit btnHeaderPremiere headerButton" style="padding-top:.5em;padding-bottom:.5em;">' +
      _globalize.default.translate("HeaderBecomeProjectSupporter") +
      "</button>";
    document.querySelector(".btnHeaderPremiere") ||
      (document.querySelector(".headerRight").insertAdjacentHTML("afterbegin", html),
      document.querySelector(".btnHeaderPremiere").addEventListener("click", onPremiereButtonClick));
  }
  function removePremiereButton() {
    var btn = document.querySelector(".btnHeaderPremiere");
    btn && btn.remove();
  }
  function onLocalUserSignedIn(e, serverId, userId) {
    (currentServerId = serverId),
      (userSignedIn = !0),
      headerSearchButton.classList.remove("hide"),
      _connectionmanager.default.getApiClient(serverId).getUser(userId).then(updateUserInHeader),
      resetPremiereButton(),
      setRemoteControlVisibility();
  }
  function onHeaderMenuButtonClick() {
    _navdrawer.default.open();
  }
  function onHomeClick() {
    _approuter.default.goHome();
  }
  function onBackClick() {
    _approuter.default.back();
  }
  function onSearchClick() {
    _inputmanager.default.trigger("search", {sourceElement: _viewmanager.default.currentView()});
  }
  function onUserButtonClick() {
    _approuter.default.showUserMenu({positionTo: this, positionY: "bottom"});
  }
  function onSettingsButtonClick() {
    var manageServerRouteUrl = _approuter.default.getRouteUrl("manageserver");
    if (!isUserAdmin || !_approuter.default.getRouteInfo(manageServerRouteUrl)) return onUserButtonClick.call(this);
    _approuter.default.show(manageServerRouteUrl);
  }
  function onCastButtonClick() {
    var btn = this;
    require(["playerSelectionMenu"], function (playerSelectionMenu) {
      playerSelectionMenu.show(btn);
    });
  }
  function onLayoutModeChange() {
    ensureHeaderSettingsButton(),
      _layoutmanager.default.tv || headerUserButton.classList.contains("hide")
        ? headerSettingsButton.classList.add("hide")
        : headerSettingsButton.classList.remove("hide"),
      (headerMiddle = headerMiddle || document.querySelector(".headerMiddle")),
      _layoutmanager.default.tv
        ? (skinHeaderElement.classList.add("skinHeader-tv"),
          headerLeft.classList.add("headerLeft-tv"),
          headerRight.classList.add("headerRight-tv"),
          headerMiddle.classList.add("headerMiddle-tv"))
        : (skinHeaderElement.classList.remove("skinHeader-tv"),
          headerLeft.classList.remove("headerLeft-tv"),
          headerRight.classList.remove("headerRight-tv"),
          headerMiddle.classList.remove("headerMiddle-tv")),
      this.destroyClock(),
      this.loadClock();
  }
  function updateCastIcon() {
    var info,
      btnCast = headerCastButton;
    btnCast &&
      ((info = _playbackmanager.default.getPlayerInfo()) && !info.isLocalPlayer
        ? ((btnCast.innerHTML = "&#xE308;"), (selectedPlayerText.innerHTML = info.deviceName || info.name))
        : ((btnCast.innerHTML = "&#xE307;"), (selectedPlayerText.innerHTML = "")));
  }
  function onNewPlayQueueStart(e, player, state) {
    !(function (state) {
      return _layoutmanager.default.tv && state.NowPlayingItem && "Audio" === state.NowPlayingItem.MediaType;
    })(state) ||
      state.IsBackgroundPlayback ||
      _approuter.default.showNowPlaying();
  }
  function setRemoteControlVisibility() {
    _servicelocator.appHost.supports("remotecontrol") && !_layoutmanager.default.tv && userSignedIn
      ? (headerCastButton.classList.remove("hide"), selectedPlayerText.classList.remove("hide"))
      : (headerCastButton.classList.add("hide"), selectedPlayerText.classList.add("hide"));
  }
  function allowDrawer(detail) {
    if (!1 !== detail.drawer) {
      if (detail.hideDrawerWithOtherUserIdParam) {
        detail = detail.params;
        if (detail && detail.userId && detail.serverId) {
          var apiClient = _connectionmanager.default.getApiClient(detail.serverId);
          if (apiClient && apiClient.getCurrentUserId() !== detail.userId) return;
        }
      }
      return 1;
    }
  }
  function updateWindowScroll(detail, view) {
    (elem = _scrollingElement) ||
      ((elem = document.scrollingElement || document.documentElement), (_scrollingElement = elem));
    var elem;
    enableWindowScroll(detail)
      ? (elem.classList.remove("noScrollY"),
        elem.classList.add("overflowYScroll"),
        skinBodyElement.classList.add("skinBody-withWindowScroll"),
        skinHeaderElement.classList.add("headroom-scrolling"))
      : (elem.classList.add("noScrollY"),
        elem.classList.remove("overflowYScroll"),
        skinBodyElement.classList.remove("skinBody-withWindowScroll"));
  }
  function onNavDrawerStateChange(e, drawerState) {
    2 === drawerState
      ? (headerHomeButton.classList.add("headerHomeButton-withdockeddrawer"),
        headerMenuButton.classList.add("headerMenuButton-withfulldrawer"),
        skinBodyElement.classList.add("skinBody-withFullDrawer"),
        skinHeaderElement.classList.add("skinHeader-withfulldrawer"),
        backdropContainer.classList.add("backdropContainer-withfulldrawer"))
      : (1 === drawerState
          ? (headerHomeButton.classList.remove("headerHomeButton-withdockeddrawer"),
            headerMenuButton.classList.remove("headerMenuButton-withfulldrawer"),
            skinBodyElement.classList.remove("skinBody-withFullDrawer"),
            skinHeaderElement.classList.remove("skinHeader-withfulldrawer"))
          : (skinBodyElement.classList.remove("skinBody-withFullDrawer"),
            skinHeaderElement.classList.remove("skinHeader-withfulldrawer"),
            headerHomeButton.classList.remove("headerHomeButton-withdockeddrawer"),
            headerMenuButton.classList.remove("headerMenuButton-withfulldrawer")),
        backdropContainer.classList.remove("backdropContainer-withfulldrawer"));
  }
  function onViewShow(e) {
    var detail = e.detail;
    detail.clearBackdrop && _backdrop.default.clear(),
      (function (detail) {
        !_layoutmanager.default.tv &&
        allowDrawer(detail) &&
        "docked" === (detail.settingsTheme ? "docked" : _usersettings.default.drawerStyle())
          ? ((detail.drawerInline = !0), _navdrawer.default.open(!0))
          : _navdrawer.default.close();
      })(detail),
      (function (detail) {
        !1 === (detail = detail.backButton) ||
        !_approuter.default.canGoBack() ||
        (hasPhysicalBackButton && !0 !== detail && !_layoutmanager.default.tv)
          ? headerBackButton.classList.add("hide")
          : !supportsFullscreenMediaQueries || !0 === detail || _layoutmanager.default.tv
          ? headerBackButton.classList.remove("headerBackButton-showfullscreen", "hide")
          : (headerBackButton.classList.add("headerBackButton-showfullscreen"),
            headerBackButton.classList.remove("hide"));
      })(detail),
      (function (detail) {
        userSignedIn && !1 !== detail.homeButton
          ? headerHomeButton.classList.remove("hide")
          : headerHomeButton.classList.add("hide");
      })(detail),
      (function (detail) {
        userSignedIn && !1 !== detail.searchButton
          ? headerSearchButton.classList.remove("hide")
          : headerSearchButton.classList.add("hide");
      })(detail),
      (function (detail) {
        !_layoutmanager.default.tv && userSignedIn && allowDrawer(detail)
          ? headerMenuButton.classList.remove("hide")
          : headerMenuButton.classList.add("hide");
      })(detail),
      (function (detail) {
        (detail = detail.helpUrl)
          ? ((headerHelpButton.href = detail), headerHelpButton.classList.remove("hide"))
          : headerHelpButton.classList.add("hide");
      })(detail),
      (function (detail) {
        !_layoutmanager.default.tv && detail.adjustHeaderForEmbeddedScroll
          ? skinHeaderElement.classList.add("adjustHeaderForEmbeddedScroll")
          : skinHeaderElement.classList.remove("adjustHeaderForEmbeddedScroll");
      })(detail),
      (function (detail) {
        !1 === detail.secondaryHeaderFeatures
          ? headerRight.classList.add("hide")
          : headerRight.classList.remove("hide");
      })(detail, e.target),
      (function (header, detail) {
        detail.defaultTitle
          ? header.setDefaultTitle()
          : null != (detail = detail.title) && header.setTitle(_globalize.default.translate(detail));
      })(this, detail, e.target),
      _navdrawercontent.default.onViewShow(e),
      !detail.isRestored && enableWindowScroll(detail) && window.scrollTo(0, 0);
  }
  function enableWindowScroll(detail) {
    return !0 === detail.windowScroll;
  }
  function onViewBeforeShow(e) {
    var detail = e.detail,
      e = e.target,
      skinHeader = (detail.headerTabs || _maintabsmanager.default.setTabs(null), skinHeaderElement);
    !1 !== detail.headerBackground && skinHeader.classList.add("skinHeader-withBackground"),
      (detail.adjustHeaderForEmbeddedScroll && !0 !== detail.windowScroll) || (skinHeader.style.transform = "none"),
      updateWindowScroll(detail, e),
      !1 === detail.headerBackground && skinHeader.classList.remove("skinHeader-withBackground"),
      this.setTransparent(detail.transparentHeader);
  }
  function bindEvents(instance) {
    var parent = instance.element;
    (headerBackButton = parent.querySelector(".headerBackButton")),
      (headerHomeButton = parent.querySelector(".headerHomeButton")),
      (headerMenuButton = parent.querySelector(".headerMenuButton")),
      (headerCastButton = parent.querySelector(".headerCastButton")),
      (headerHelpButton = parent.querySelector(".headerHelpButton")),
      (headerSearchButton = parent.querySelector(".headerSearchButton")),
      (selectedPlayerText = parent.querySelector(".headerSelectedPlayer")),
      (headerLeft = parent.querySelector(".headerLeft")),
      (headerRight = parent.querySelector(".headerRight")),
      headerBackButton.addEventListener("click", onBackClick),
      headerHomeButton.addEventListener("click", onHomeClick),
      headerSearchButton.addEventListener("click", onSearchClick),
      headerCastButton.addEventListener("click", onCastButtonClick),
      parent.querySelector(".headerUserButton").addEventListener("click", onUserButtonClick),
      parent.querySelector(".headerSettingsButton").addEventListener("click", onSettingsButtonClick),
      headerMenuButton.addEventListener("click", onHeaderMenuButtonClick),
      (boundLayoutModeChangeFn = onLayoutModeChange.bind(instance)),
      _events.default.on(_layoutmanager.default, "modechange", boundLayoutModeChangeFn),
      _events.default.on(_playbackmanager.default, "playerchange", updateCastIcon),
      _events.default.on(_playbackmanager.default, "playqueuestart", onNewPlayQueueStart),
      _events.default.on(_connectionmanager.default, "localusersignedin", onLocalUserSignedIn),
      _events.default.on(_connectionmanager.default, "localusersignedout", onLocalUserSignedOut),
      _events.default.on(_api.default, "UserUpdated", onUserUpdated),
      document.addEventListener("viewbeforeshow", onViewBeforeShow.bind(instance)),
      document.addEventListener("viewshow", onViewShow.bind(instance)),
      (instance.pageTitleElement = parent.querySelector(".pageTitle")),
      resetPremiereButton(),
      _events.default.on(_connectionmanager.default, "resetregistrationinfo", resetPremiereButton);
  }
  function render(instance) {
    (instance.element = skinHeaderElement),
      _dom.default.allowBackdropFilter() && skinHeaderElement.classList.add("skinHeader-withbackdropfilter"),
      (headerLeft = skinHeaderElement.querySelector(".headerLeft")),
      (Menu = _globalize.default.translate("Menu")),
      (Home = _globalize.default.translate("Home")),
      (Back = _globalize.default.translate("Back")),
      (Help = _globalize.default.translate("Help")),
      (headerLeft.innerHTML =
        '\n            <button type="button" is="paper-icon-button-light" class="headerBackButton headerButton hide-mouse-idle-tv hide" tabindex="-1" title="'
          .concat(Back, '" aria-label="')
          .concat(
            Back,
            '">\n                <i class="md-icon autortl">&#xE5C4;</i>\n            </button>\n            <button type="button" is="paper-icon-button-light" class="headerHomeButton headerButton hide-mouse-idle-tv hide md-icon" tabindex="-1" title="'
          )
          .concat(Home, '" aria-label="')
          .concat(
            Home,
            '">\n                &#xE88A;\n            </button>\n            <button type="button" is="paper-icon-button-light" class="headerMenuButton headerButton hide md-icon" title="'
          )
          .concat(Menu, '" aria-label="')
          .concat(
            Menu,
            '">\n                &#xE5D2;\n            </button>\n            <h2 class="pageTitle">&nbsp;</h2>\n\n            <a type="button" is="emby-linkbutton" class="paper-icon-button-light headerHelpButton headerButton hide secondaryText" title="'
          )
          .concat(Help, '" aria-label="')
          .concat(
            Help,
            '" target="_blank" href="#">\n                <i class="md-icon autortl">&#xe887;</i>\n            </a>\n        '
          ));
    var Help,
      headerLeft = _globalize.default.translate("ManageEmbyServer"),
      Back = _globalize.default.translate("Settings"),
      Home = _globalize.default.translate("Search"),
      Menu = _globalize.default.translate("PlayOnAnotherDevice");
    _globalize.default.translate("HeaderNowPlaying"),
      (skinHeaderElement.querySelector(".headerRight").innerHTML =
        '\n            <div class="headerSelectedPlayer hide">\n\n            </div>\n            <button type="button" is="paper-icon-button-light" class="headerCastButton headerButton md-icon hide" title="'
          .concat(Menu, '" aria-label="')
          .concat(
            Menu,
            '">\n                &#xE307;\n            </button>\n            <button type="button" is="paper-icon-button-light" class="headerSearchButton headerButton md-icon hide" title="'
          )
          .concat(Home, '" aria-label="')
          .concat(
            Home,
            '">\n                &#xE8B6;\n            </button>\n            <button type="button" is="paper-icon-button-light" class="headerUserButton headerButton hide" title="'
          )
          .concat(Back, '" aria-label="')
          .concat(
            Back,
            '">\n                <i class="md-icon largeIcon">&#xE7FD;</i>\n            </button>\n            <button type="button" is="paper-icon-button-light" class="headerSettingsButton headerButton md-icon hide" title="'
          )
          .concat(headerLeft, '" aria-label="')
          .concat(
            headerLeft,
            '">\n                &#xE8B8;\n            </button>\n            <div class="headerClock hide"></div>\n        '
          )),
      bindEvents(instance),
      setRemoteControlVisibility(),
      onLayoutModeChange.call(instance),
      _events.default.on(_navdrawer.default, "drawer-state-change", onNavDrawerStateChange);
  }
  function AppHeader() {}
  (AppHeader.prototype.init = function () {
    return render(this);
  }),
    (AppHeader.prototype.stopClockInterval = function () {
      var interval = this.clockInterval;
      interval && (interval.destroy(), (this.clockInterval = null));
    }),
    (AppHeader.prototype.startClockInterval = function () {
      this.clockInterval = new _methodtimer.default({
        onInterval: updateClock.bind(this),
        timeoutMs: 5e4,
        type: "interval",
      });
    }),
    (AppHeader.prototype.loadClock = function () {
      var elem;
      _layoutmanager.default.tv
        ? ((elem = document.querySelector(".headerClock")).classList.remove("hide"),
          (this.clockElement = elem),
          this.stopClockInterval(),
          this.startClockInterval(),
          updateClock.call(this))
        : this.destroyClock();
    }),
    (AppHeader.prototype.setDefaultTitle = function () {
      var pageTitleElement = this.pageTitleElement;
      pageTitleElement &&
        (pageTitleElement.classList.add("pageTitleWithLogo", "pageTitleWithDefaultLogo"),
        (pageTitleElement.style.backgroundImage = null),
        (pageTitleElement.innerHTML = "")),
        (document.title = "Emby");
    }),
    (AppHeader.prototype.setTitle = function (title) {
      var html, pageTitleElement;
      null == title
        ? this.setDefaultTitle()
        : ((html = (function (title) {
            return title ? ("string" != typeof title ? title.Name || "" : title) : "";
          })((title = "-" === title ? "" : title))),
          (pageTitleElement = this.pageTitleElement) &&
            (pageTitleElement.classList.remove("pageTitleWithLogo", "pageTitleWithDefaultLogo"),
            (pageTitleElement.style.backgroundImage = null),
            (pageTitleElement.innerHTML = html || "")),
          (document.title = title ? ("string" == typeof title ? title : title.Name || "Emby") : "Emby"));
    }),
    (AppHeader.prototype.setTransparent = function (transparent) {
      transparent
        ? skinHeaderElement.classList.add("semiTransparent")
        : skinHeaderElement.classList.remove("semiTransparent");
    }),
    (AppHeader.prototype.hasFocus = function () {
      var activeElement = document.activeElement;
      return !!activeElement && this.element.contains(activeElement);
    }),
    (AppHeader.prototype.ensureVisible = function () {
      skinHeaderElement.style.transform = "none";
    }),
    (AppHeader.prototype.destroyClock = function () {
      this.stopClockInterval();
      var elem = this.clockElement;
      elem && elem.classList.add("hide"), (this.clockElement = null);
    }),
    (AppHeader.prototype.destroy = function () {
      var instance;
      this.destroyClock(),
        (instance = (instance = this).element) &&
          (instance.querySelector(".headerBackButton").removeEventListener("click", onBackClick),
          instance.querySelector(".headerHomeButton").removeEventListener("click", onHomeClick),
          instance.querySelector(".headerSearchButton").removeEventListener("click", onSearchClick),
          instance.querySelector(".headerCastButton").removeEventListener("click", onCastButtonClick),
          instance.querySelector(".headerUserButton").removeEventListener("click", onUserButtonClick),
          instance.querySelector(".headerSettingsButton").removeEventListener("click", onSettingsButtonClick),
          instance.querySelector(".headerMenuButton").removeEventListener("click", onHeaderMenuButtonClick)),
        _events.default.off(_layoutmanager.default, "modechange", boundLayoutModeChangeFn),
        _events.default.off(_playbackmanager.default, "playerchange", updateCastIcon),
        _events.default.off(_playbackmanager.default, "playqueuestart", onNewPlayQueueStart),
        _events.default.off(_connectionmanager.default, "localusersignedin", onLocalUserSignedIn),
        _events.default.off(_connectionmanager.default, "localusersignedout", onLocalUserSignedOut),
        _events.default.off(_api.default, "UserUpdated", onUserUpdated),
        _events.default.off(_connectionmanager.default, "resetregistrationinfo", resetPremiereButton),
        document.removeEventListener("viewbeforeshow", onViewBeforeShow),
        document.removeEventListener("viewshow", onViewShow),
        (this.element = null);
    });
  var _default = new AppHeader();
  _exports.default = _default;
});
