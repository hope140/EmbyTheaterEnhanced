define([
  "exports",
  "./../emby-apiclient/connectionmanager.js",
  "./../dom.js",
  "./../common/globalize.js",
  "./../approuter.js",
  "./../layoutmanager.js",
  "./../emby-apiclient/events.js",
  "./../common/servicelocator.js",
  "./../common/pluginmanager.js",
  "./../shortcuts.js",
  "./../listview/listview.js",
  "./../cardbuilder/cardbuilder.js",
  "./../emby-elements/emby-collapse/emby-collapse.js",
  "./../emby-elements/emby-button/paper-icon-button-light.js",
  "./../emby-elements/emby-itemscontainer/emby-itemscontainer.js",
], function (
  _exports,
  _connectionmanager,
  _dom,
  _globalize,
  _approuter,
  _layoutmanager,
  _events,
  _servicelocator,
  _pluginmanager,
  _shortcuts,
  _listview,
  _cardbuilder,
  _embyCollapse,
  _paperIconButtonLight,
  _embyItemscontainer
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var navDrawerContentElement,
    navDrawerScroller,
    currentServerId,
    currentListItems,
    currentViewEvent,
    renderAbortController,
    currentDrawerType = 0,
    enableLazyLoadingDrawerContents = !1;
  function getNavDrawerContentElement() {
    return (navDrawerContentElement = navDrawerContentElement || document.querySelector(".mainDrawerScrollSlider"));
  }
  function addPluginPagesToMainMenu(links, pluginItems, section, user) {
    for (var i = 0, length = pluginItems.length; i < length; i++) {
      var href,
        pluginItem = pluginItems[i];
      if (_pluginmanager.default.allowPluginPages(pluginItem.PluginId)) {
        if (user) {
          if (!pluginItem.EnableInUserMenu) continue;
        } else if (!pluginItem.EnableInMainMenu) continue;
        (!user && pluginItem.MenuSection !== section) ||
          ((href = pluginItem.Href || _pluginmanager.default.getConfigurationPageUrl(pluginItem.Name)),
          user && (href += "&userId=" + user.Id),
          links.push({
            Name: pluginItem.DisplayName,
            Icon: pluginItem.MenuIcon || "folder",
            href: href,
            navMenuId: pluginItem.NavMenuId || "/" + href,
          }));
      }
    }
  }
  function getAdminMenuItems(apiClient, user, signal) {
    return _approuter.default.getRouteInfo(_approuter.default.getRouteUrl("manageserver")) &&
      user.Policy.IsAdministrator
      ? apiClient.getConfigurationPages({EnableInMainMenu: !0, UserId: user.Id}, signal).then(
          function (items) {
            return (function (pluginItems, apiClient) {
              var links = [
                {Name: _globalize.default.translate("Server")},
                {
                  Name: _globalize.default.translate("Dashboard"),
                  href: _approuter.default.getRouteUrl("manageserver"),
                  Icon: "dashboard",
                },
                {Name: _globalize.default.translate("Settings"), href: "/dashboard/settings", Icon: "settings"},
                {Name: _globalize.default.translate("Users"), href: "/users", Icon: "people"},
                {Name: "Emby Premiere", href: "/embypremiere", Icon: "star"},
                {Name: _globalize.default.translate("Library"), href: "/librarysetup/library.html", Icon: "folder"},
              ];
              return (
                links.push({
                  Name: _globalize.default.translate("LiveTV"),
                  href: "/livetvsetup/livetvstatus.html",
                  Icon: "dvr",
                }),
                links.push({Name: _globalize.default.translate("Network"), Icon: "wifi", href: "/network"}),
                links.push({
                  Name: _globalize.default.translate("Transcoding"),
                  Icon: "transform",
                  href: "/transcoding",
                }),
                links.push({Name: _globalize.default.translate("Database"), href: "/database", Icon: "storage"}),
                links.push({
                  Name: _globalize.default.translate("Conversions"),
                  Icon: "sync",
                  href: "/conversions?mode=convert",
                }),
                addPluginPagesToMainMenu(links, pluginItems, "server"),
                links.push({divider: !0, Name: _globalize.default.translate("Devices")}),
                links.push({Name: _globalize.default.translate("Devices"), href: "/devices", Icon: "devices"}),
                links.push({
                  Name: _globalize.default.translate("Downloads"),
                  Icon: "download",
                  href: "/serverdownloads",
                }),
                links.push({
                  Name: _globalize.default.translate("HeaderCameraUpload"),
                  href: "/devices/cameraupload.html",
                  Icon: "photo_camera",
                }),
                addPluginPagesToMainMenu(links, pluginItems, "devices"),
                links.push({divider: !0, Name: _globalize.default.translate("Advanced")}),
                links.push({Name: _globalize.default.translate("Logs"), href: "/logs", Icon: "folder_open"}),
                apiClient.isMinServerVersion("4.8.0.16") ||
                  links.push({
                    Name: _globalize.default.translate("Notifications"),
                    Icon: "notifications",
                    href: "server/notifications/notificationsettings.html",
                  }),
                links.push({
                  Name: _globalize.default.translate("Plugins"),
                  Icon: "add_shopping_cart",
                  href: "/plugins",
                }),
                links.push({
                  Name: _globalize.default.translate("HeaderScheduledTasks"),
                  href: "/scheduledtasks",
                  Icon: "schedule",
                }),
                links.push({Name: _globalize.default.translate("HeaderApiKeys"), href: "/apikeys", Icon: "vpn_key"}),
                links.push({
                  Name: _globalize.default.translate("MetadataManager"),
                  href: "/metadatamanager",
                  Icon: "edit",
                }),
                addPluginPagesToMainMenu(links, pluginItems),
                links
              );
            })(items, apiClient);
          },
          function (err) {
            return [];
          }
        )
      : Promise.resolve([]);
  }
  function sortRoutes(a, b) {
    var aOrder = null == a.order ? 1e3 : a.order,
      bOrder = null == b.order ? 1e3 : b.order;
    if (bOrder < aOrder) return 1;
    if (aOrder < bOrder) return -1;
    (aOrder = (aOrder = a.title) && _globalize.default.translate(aOrder)), (bOrder = b.title);
    return (bOrder = bOrder && _globalize.default.translate(bOrder)) < aOrder ? 1 : aOrder < bOrder ? -1 : 0;
  }
  function getUserSettingsRoutes(user, apiClient, loggedInUser) {
    var routes = _approuter.default.getRoutes().filter(function (r) {
        return (function (route, user, loggedInUser) {
          return (
            "settings" === route.type &&
            "user" === route.settingsType &&
            _approuter.default.validateUserAccessToRoute(route, user, loggedInUser)
          );
        })(r, user, loggedInUser);
      }),
      restrictedFeatures = user.Policy.RestrictedFeatures || [];
    return (routes = (routes = routes.filter(function (r) {
      return (
        (!r.featureId || !restrictedFeatures.includes(r.featureId)) &&
        !(r.minServerVersion && !apiClient.isMinServerVersion(r.minServerVersion))
      );
    })).sort(sortRoutes));
  }
  function mapRouteToMenuItem(route, user) {
    var path = route.path;
    return (
      path &&
        "settings" === route.type &&
        "user" === route.settingsType &&
        (path = (path += "?userId=" + user.Id) + "&serverId=" + user.ServerId),
      {Name: _globalize.default.translate(route.title), href: path, Icon: route.icon}
    );
  }
  function getAppSettingsMenuItems(options) {
    var items = [],
      user = (options.apiClient, options.user),
      routes =
        (options.signal,
        !1 !== options.home &&
          items.push({
            Name: _globalize.default.translate("Home"),
            Icon: "&#xE88A;",
            href: _approuter.default.getRouteUrl("home"),
          }),
        items.push({Name: user.Name, section: "user"}),
        _approuter.default
          .getRoutes()
          .filter(function (r) {
            return "settings" === r.type && "user" !== r.settingsType;
          })
          .sort(sortRoutes)),
      options = _servicelocator.appHost.supports("exit") && _layoutmanager.default.tv;
    if (routes.length || options) {
      items.push({Name: _servicelocator.appHost.appName()});
      for (var i = 0, length = routes.length; i < length; i++) items.push(mapRouteToMenuItem(routes[i], user));
    }
    return (
      options && items.push({Name: _globalize.default.translate("Exit"), href: "#", Icon: "&#xE879;", onclick: "exit"}),
      (items = items.concat(
        (function () {
          var items = [];
          /*_servicelocator.appHost.supports("sleep") &&
            items.push({Name: _globalize.default.translate("Sleep"), href: "#", Icon: "&#xE426;", onclick: "sleep"});
          _servicelocator.appHost.supports("shutdown") &&
            items.push({
              Name: _globalize.default.translate("Shutdown"),
              href: "#",
              Icon: "&#xE8AC;",
              onclick: "shutdown",
            });*/
          _servicelocator.appHost.supports("restart") &&
            items.push({
              Name: _globalize.default.translate("Restart"),
              href: "#",
              Icon: "&#xE5D5;",
              onclick: "restart",
            });
          items.length && items.unshift({Name: _servicelocator.appHost.deviceName()});
          return items;
        })()
      )),
      Promise.resolve(items)
    );
  }
  function getItemsHtml(items, options) {
    options.isGlobalList ? (currentListItems = items) : (options.listItems = items);
    for (
      var icon,
        title,
        menuHtml = "",
        collapsible =
          (!1 !== options.header &&
            ((menuHtml =
              (menuHtml += '<div class="navDrawerHeader flex flex-direction-row align-items-center">') +
              '<a is="emby-linkbutton" class="btnNavDrawerLogo flex-grow" href=".' +
              _approuter.default.getRouteUrl("home") +
              '" title="' +
              _globalize.default.translate("Home") +
              '" aria-label="' +
              _globalize.default.translate("Home") +
              '"><h2 is="emby-linkbutton" class="navDrawerLogo pageTitleWithLogo pageTitleWithDefaultLogo flex-grow"></h2></a>'),
            !1 !== options.drawerOptions &&
              (menuHtml +=
                '<button type="button" is="paper-icon-button-light" class="btnPinNavDrawer secondaryText' +
                (enableLazyLoadingDrawerContents
                  ? ((icon = "view_sidebar"),
                    (title = _globalize.default.translate("HeaderPinSidebar")),
                    " btnPinNavDrawer-iconpin")
                  : ((icon = "menu_open"),
                    (title = _globalize.default.translate("Collapse")),
                    " btnPinNavDrawer-iconclose")) +
                '" title="' +
                title +
                '" aria-label="' +
                title +
                '"><i class="md-icon btnPinNavDrawerIcon autortl">' +
                icon +
                "</i></button>"),
            (menuHtml += "</div></div>")),
          !1 !== options.collapsible && !_layoutmanager.default.tv),
        sectionClose = collapsible ? "</div></div>" : "</div>",
        isSectionOpen = !1,
        serverId = options.serverId,
        userId = null == (title = options.user) ? void 0 : title.Id,
        i = 0,
        length = items.length;
      i < length;
      i++
    ) {
      var headerClass,
        itemsContainerClass,
        item = items[i];
      item.section && isSectionOpen && ((isSectionOpen = !1), (menuHtml += sectionClose)),
        "playlists" === item.section
          ? (menuHtml += (function (options) {
              var html = "",
                headerClass = "navMenuHeader secondaryText";
              return (
                options.itemClass && (headerClass += " navMenuHeader-" + options.itemClass),
                (html +=
                  '<div is="emby-collapse" title="' +
                  _globalize.default.translate("Playlists") +
                  '" data-expanded="true" class="navDrawerCollapseSection navDrawerItemsSection" data-headerclass="' +
                  headerClass +
                  '" data-buttonclass="navDrawerCollapseButton" data-iconclass="secondaryText navDrawerCollapseIcon">') +
                  '<div is="emby-itemscontainer" class="navDrawerItemsContainer itemsContainer vertical-list collapseContent navDrawerCollapseContent" data-fromserver="true" data-listtype="playlists">' +
                  "</div></div>"
              );
            })(options))
          : "collections" === item.section
          ? (menuHtml += (function (options) {
              var html = "",
                headerClass = "navMenuHeader secondaryText";
              return (
                options.itemClass && (headerClass += " navMenuHeader-" + options.itemClass),
                (html +=
                  '<div is="emby-collapse" title="' +
                  _globalize.default.translate("Collections") +
                  '" data-expanded="false" class="navDrawerCollapseSection navDrawerItemsSection" data-headerclass="' +
                  headerClass +
                  '" data-buttonclass="navDrawerCollapseButton" data-iconclass="secondaryText navDrawerCollapseIcon">') +
                  '<div is="emby-itemscontainer" class="navDrawerItemsContainer itemsContainer vertical-list collapseContent navDrawerCollapseContent" data-fromserver="true" data-listtype="collections">' +
                  "</div></div>"
              );
            })(options))
          : item.href
          ? isSectionOpen ||
            ((isSectionOpen = !0),
            (menuHtml +=
              '<div is="emby-itemscontainer" class="navDrawerItemsContainer itemsContainer vertical-list" data-listindex="' +
              i +
              '"></div>'))
          : item.Name &&
            (isSectionOpen && ((isSectionOpen = !1), (menuHtml += sectionClose)),
            (headerClass = "navMenuHeader secondaryText"),
            options.itemClass && (headerClass += " navMenuHeader-" + options.itemClass),
            (itemsContainerClass = "navDrawerItemsContainer itemsContainer vertical-list"),
            collapsible
              ? ((menuHtml +=
                  '<div is="emby-collapse" title="' +
                  item.Name +
                  '" data-expanded="true" class="navDrawerCollapseSection" data-headerclass="' +
                  headerClass +
                  '" data-buttonclass="navDrawerCollapseButton" data-iconclass="secondaryText navDrawerCollapseIcon">'),
                (itemsContainerClass += " collapseContent navDrawerCollapseContent"))
              : ((menuHtml += '<h3 class="' + headerClass + '">'),
                item.imageUrl && (menuHtml += '<img src="' + item.imageUrl + '" class="navMenuHeaderImage" />'),
                (menuHtml = menuHtml + item.Name + "</h3>")),
            (menuHtml +=
              '<div is="emby-itemscontainer" class="' + itemsContainerClass + '" data-listindex="' + (i + 1) + '"'),
            serverId && (menuHtml += ' data-serverid="' + serverId + '"'),
            userId && (menuHtml += ' data-userid="' + userId + '"'),
            item.section && (menuHtml += ' data-section="' + item.section + '"'),
            (menuHtml += ">"),
            (isSectionOpen = !0));
    }
    return isSectionOpen && ((isSectionOpen = !1), (menuHtml += sectionClose)), menuHtml;
  }
  function getSettingsDrawerHtml(options) {
    return (function (options) {
      var apiClient = options.apiClient,
        user = options.user,
        signal = options.signal;
      return Promise.all([getAppSettingsMenuItems(options), getAdminMenuItems(apiClient, user, signal)]).then(function (
        responses
      ) {
        return responses[0].concat(responses[1]);
      });
    })(options).then(function (items) {
      return (options.drawerOptions = !1), getItemsHtml(items, options);
    });
  }
  function getDrawerHtml(type, signal) {
    var apiClient = currentServerId
      ? _connectionmanager.default.getApiClient(currentServerId)
      : _connectionmanager.default.currentApiClient();
    return 1 === type && currentServerId
      ? (function (apiClient, signal) {
          return apiClient.getCurrentUser({signal: signal}).then(function (user) {
            return (function (apiClient) {
              return apiClient.getUserViews({}, apiClient.getCurrentUserId()).then(function (result) {
                for (var items = result.Items, list = [], i = 0, length = items.length; i < length; i++) {
                  var view = items[i];
                  list.push(view);
                }
                return list;
              });
            })(apiClient).then(function (result) {
              for (
                var items = result,
                  menuItems = [],
                  i =
                    (/*menuItems.push({
                      Name: _globalize.default.translate("Expand"),
                      Icon: "&#xe5d2;",
                      href: "#",
                      onclick: "menu",
                      Id: "btnExpandMiniDrawer",
                    }),*/
                    menuItems.push({
                      Name: _globalize.default.translate("Home"),
                      Icon: "&#xE88A;",
                      href: _approuter.default.getRouteUrl("home"),
                    }),
                    user.Policy.EnableContentDownloading &&
                      _servicelocator.appHost.supports("sync") &&
                      (menuItems.push({Name: _globalize.default.translate("Downloads")}),
                      menuItems.push({
                        Name: _globalize.default.translate("Downloads"),
                        href: _approuter.default.getRouteUrl("downloads"),
                        Icon: "&#xE2C7;",
                      }),
                      menuItems.push({
                        Name: _globalize.default.translate("HeaderManageDownloads"),
                        href: _approuter.default.getRouteUrl("managedownloads"),
                        Icon: "&#xE3C9;",
                      })),
                    menuItems.push({Name: _globalize.default.translate("HeaderMyMedia")}),
                    0),
                  length = items.length;
                i < length;
                i++
              ) {
                var item = items[i],
                  url = _approuter.default.getRouteUrl(item, {context: item.CollectionType});
                (item.href = url), menuItems.push(item);
              }
              return (
                user.Policy.IsAdministrator &&
                  _approuter.default.getRouteInfo(_approuter.default.getRouteUrl("manageserver")) &&
                  menuItems.push({
                    Name: _globalize.default.translate("MetadataManager"),
                    href: "/metadatamanager",
                    Icon: "&#xE2C7;",
                  }),
                /*menuItems.push({section: "playlists"}),*/
                menuItems.push({section: "collections"}),
                getItemsHtml(menuItems, {isGlobalList: !0})
              );
            });
          });
        })(apiClient, signal)
      : 2 === type
      ? (function (apiClient, signal) {
          return apiClient.getCurrentUser({signal: signal}).then(function (user) {
            return getSettingsDrawerHtml({
              apiClient: apiClient,
              user: user,
              loggedInUser: user,
              signal: signal,
              isGlobalList: !0,
            });
          });
        })(apiClient, signal)
      : Promise.resolve("");
  }
  function getListOptions(items) {
    return {
      renderer: _listview.default,
      options: {
        action: "link",
        image: !0,
        addToListButton: !1,
        fields: ["Name"],
        enableUserDataButtons: !1,
        moreButton: !1,
        highlight: !1,
        mediaInfo: !1,
        dropTarget: !0,
        itemClass: ("navMenuOption navDrawerListItem " + (this.navItemClass || "")).trim(),
        listItemBodyClassName: "navDrawerListItemBody",
        imageContainerClass: "navDrawerListItemImageContainer",
        hoverPlayButton: !1,
        multiSelect: !1,
        draggable: !1,
        enableOverview: !1,
        iconClass: "navDrawerListItemIcon",
        largeFont: !1,
        imagePlayButton: !1,
        enableSideMediaInfo: !1,
      },
      virtualScrollLayout: "vertical-list",
    };
  }
  function getUserMenuItems(serverId, userId, includeFromServer) {
    var apiClient = _connectionmanager.default.getApiClient(serverId);
    return apiClient.getUser(userId).then(function (user) {
      return apiClient.getCurrentUser().then(function (loggedInUser) {
        return (
          includeFromServer
            ? (function (apiClient, user, signal) {
                return apiClient.getConfigurationPages({EnableInUserMenu: !0, UserId: user.Id}, signal).then(
                  function (items) {
                    var links = [];
                    return addPluginPagesToMainMenu(links, items, null, user), links;
                  },
                  function (err) {
                    return [];
                  }
                );
              })(apiClient, user)
            : Promise.resolve([])
        ).then(function (serverItems) {
          return getUserSettingsRoutes(user, apiClient, loggedInUser)
            .map(function (i) {
              return mapRouteToMenuItem(i, user);
            })
            .concat(serverItems);
        });
      });
    });
  }
  function getNavMenuItemsResult() {
    var serverId,
      allListItems = this.listItems,
      itemsContainer = this.itemsContainer;
    return (
      "user" === itemsContainer.getAttribute("data-section")
        ? getUserMenuItems(
            (serverId =
              itemsContainer.getAttribute("data-serverid") || _connectionmanager.default.currentApiClient().serverId()),
            itemsContainer.getAttribute("data-userid") ||
              _connectionmanager.default.getApiClient(serverId).getCurrentUserId(),
            "true" === itemsContainer.getAttribute("data-fromserver")
          )
        : Promise.resolve(
            (function (index, allListItems) {
              for (var items = allListItems.slice(index), i = 0, length = items.length; i < length; i++)
                if (!items[i].href) return (items.length = i), items;
              return items;
            })(parseInt(itemsContainer.getAttribute("data-listindex")), allListItems)
          )
    ).then(function (items) {
      return {Items: items, TotalRecordCount: items.length};
    });
  }
  function getNavMenuListOptions(items) {
    return {
      renderer: _listview.default,
      options: {
        action: "custom",
        addToListButton: !1,
        fields: ["Name"],
        enableUserDataButtons: !1,
        moreButton: !1,
        highlight: !1,
        mediaInfo: !1,
        dropTarget: !1,
        itemClass: ("navMenuOption navDrawerListItem " + (this.navItemClass || "")).trim(),
        listItemBodyClassName: "navDrawerListItemBody",
        imageContainerClass: "navDrawerListItemImageContainer",
        hoverPlayButton: !1,
        multiSelect: !1,
        draggable: !1,
        enableOverview: !1,
        iconClass: "navDrawerListItemIcon",
        largeFont: !1,
        imagePlayButton: !1,
        tooltip: !0,
        preferIcon: !0,
        enableSideMediaInfo: !1,
      },
      virtualScrollLayout: "vertical-list",
    };
  }
  function onItemsContainerUpgrade() {
    return this.resume({refresh: !0});
  }
  function initItemsContainers(elem, options) {
    for (
      var apiClient = currentServerId
          ? _connectionmanager.default.getApiClient(currentServerId)
          : _connectionmanager.default.currentApiClient(),
        itemsContainers = elem.querySelectorAll(".itemsContainer"),
        promises = [],
        i = 0,
        length = itemsContainers.length;
      i < length;
      i++
    ) {
      var itemsContainer = itemsContainers[i],
        type = itemsContainer.getAttribute("data-listtype");
      if ("playlists" === type)
        (itemsContainer.fetchData = (function (serverId) {
          return function () {
            var apiClient = _connectionmanager.default.getApiClient(serverId);
            return apiClient.getItems(apiClient.getCurrentUserId(), {Recursive: !0, IncludeItemTypes: "Playlist"});
          };
        })(apiClient.serverId())),
          (itemsContainer.getListOptions = getListOptions);
      else if ("collections" === type)
        (itemsContainer.fetchData = (function (serverId) {
          return function () {
            var apiClient = _connectionmanager.default.getApiClient(serverId);
            return apiClient.getItems(apiClient.getCurrentUserId(), {Recursive: !0, IncludeItemTypes: "BoxSet"});
          };
        })(apiClient.serverId())),
          (itemsContainer.getListOptions = getListOptions);
      else {
        if (!itemsContainer.hasAttribute("data-listindex") && !itemsContainer.hasAttribute("data-section")) continue;
        (itemsContainer.fetchData = getNavMenuItemsResult.bind({
          itemsContainer: itemsContainer,
          listItems: options ? options.listItems : currentListItems,
        })),
          (itemsContainer.navItemClass = options ? options.itemClass : null),
          (itemsContainer.getListOptions = getNavMenuListOptions),
          itemsContainer.addEventListener("action-null", onItemAction);
      }
      (itemsContainer.afterRefresh = afterItemsContainerRefresh),
        itemsContainer.resume
          ? promises.push(onItemsContainerUpgrade.call(itemsContainer))
          : promises.push(
              (function (itemsContainer) {
                return new Promise(function (resolve, reject) {
                  _dom.default.addEventListener(
                    itemsContainer,
                    "upgraded",
                    function () {
                      onItemsContainerUpgrade.call(itemsContainer).then(resolve);
                    },
                    {once: !0}
                  );
                });
              })(itemsContainer)
            );
    }
    return (elem.itemsContainers = itemsContainers), Promise.all(promises);
  }
  function afterItemsContainerRefresh() {
    currentViewEvent && updateSelectedItemForItemsContainer(this, currentViewEvent),
      "true" !== this.getAttribute("data-fromserver") &&
        (this.setAttribute("data-fromserver", "true"), this.refreshItems());
  }
  function onSetInnerHtmlCallback(html) {
    var elem;
    null != html &&
      (html || (currentDrawerType = 0),
      ((elem = getNavDrawerContentElement()).innerHTML = html),
      initItemsContainers(elem),
      (elem.scrollTop = 0));
  }
  function onRequestError(e) {
    console.log("error filling drawer: " + e + e.stack);
  }
  function updateSelectedItemForItemsContainer(itemsContainer, e) {
    var itemFromNavOption,
      currentNavMenuId =
        (currentNavMenuId = e.detail.navMenuId) ||
        (currentNavMenuId = window.location.href.toString()).substring(currentNavMenuId.indexOf("#!") + 2),
      navDrawerElement = getNavDrawerContentElement(),
      newSelectedOption = currentNavMenuId
        ? navDrawerElement.querySelector('.navMenuOption[data-navmenuid="' + currentNavMenuId + '"]')
        : null;
    return (
      (newSelectedOption =
        itemsContainer.hasAttribute("data-listindex") &&
        -1 !==
          (currentNavMenuId = (function (itemsContainer, currentNavMenuId) {
            for (var items = itemsContainer.items || [], i = 0, length = items.length; i < length; i++) {
              var routeInfo,
                item = items[i],
                navMenuId = item.navMenuId;
              if (
                currentNavMenuId ===
                (navMenuId =
                  !navMenuId && item.href
                    ? ((routeInfo = _approuter.default.getRouteInfo(item.href)) && routeInfo.navMenuId) || item.href
                    : navMenuId)
              )
                return i;
            }
            return -1;
          })(itemsContainer, currentNavMenuId))
          ? itemsContainer.getElement(currentNavMenuId)
          : newSelectedOption) ||
        (e.detail.params &&
          e.detail.params.id &&
          e.detail.params.serverId &&
          -1 !== (currentNavMenuId = itemsContainer.indexOfItemId(e.detail.params.id)) &&
          (itemFromNavOption = itemsContainer.getItem(currentNavMenuId)) &&
          itemFromNavOption.ServerId === e.detail.params.serverId &&
          (newSelectedOption = itemsContainer.getElement(currentNavMenuId))),
      (newSelectedOption && newSelectedOption.classList.contains("navMenuOption-selected")) ||
        (newSelectedOption
          ? ((itemFromNavOption = navDrawerElement.querySelector(".navMenuOption-selected")) &&
              itemFromNavOption.classList.remove("navMenuOption-selected"),
            newSelectedOption.classList.add("navMenuOption-selected"),
            e.detail.requiresDynamicTitle &&
              (function (newSelectedOption) {
                (newSelectedOption = newSelectedOption.querySelector(".listItemBodyText") || newSelectedOption),
                  (newSelectedOption = (newSelectedOption.innerText || newSelectedOption.textContent).trim());
                _events.default.trigger(navDrawerContent, "dynamic-title", [newSelectedOption]);
              })(newSelectedOption),
            (navDrawerScroller = navDrawerScroller || document.querySelector(".mainDrawer")).toCenter(
              newSelectedOption,
              {behavior: "instant"}
            ),
            1)
          : void 0)
    );
  }
  function onViewShowInternal(e, loadContent) {
    var signal,
      newController,
      drawerType = (function (e) {
        return (e = e.detail), currentServerId && !1 !== e.drawer ? (e.settingsTheme ? 2 : 1) : 0;
      })(e);
    drawerType !== currentDrawerType
      ? loadContent
        ? ((drawerType = drawerType),
          renderAbortController && renderAbortController.abort(),
          (newController = new AbortController()),
          (signal = (renderAbortController = newController).signal),
          getDrawerHtml((currentDrawerType = drawerType), signal).then(function (html) {
            signal.aborted || onSetInnerHtmlCallback(html);
          }, onRequestError))
        : onSetInnerHtmlCallback("")
      : currentDrawerType &&
        loadContent &&
        (function (e) {
          for (
            var itemsContainers = getNavDrawerContentElement().itemsContainers || [],
              i = 0,
              length = itemsContainers.length;
            i < length && !updateSelectedItemForItemsContainer(itemsContainers[i], e);
            i++
          );
        })(e);
  }
  _events.default.on(_connectionmanager.default, "localusersignedin", function (e, serverId, userId) {
    (currentServerId = serverId), (currentDrawerType = 0);
  }),
    _events.default.on(_connectionmanager.default, "localusersignedout", function () {
      currentServerId = null;
    });
  var navDrawerContent = {
    onViewShow: function (e) {
      onViewShowInternal((currentViewEvent = e), !(enableLazyLoadingDrawerContents = !e.detail.drawerInline));
    },
    onBeforeOpen: function () {
      enableLazyLoadingDrawerContents && onViewShowInternal(currentViewEvent, !0);
    },
    getSettingsDrawerHtml: getSettingsDrawerHtml,
    initItemsContainers: initItemsContainers,
  };
  function onItemAction(e) {
    var e = e.detail.item,
      onclick = e.onclick;
    "logout" === onclick
      ? _approuter.default.logout()
      : "exit" === onclick
      ? _servicelocator.appHost.exit()
      : "sleep" === onclick
      ? _servicelocator.appHost.sleep()
      : "shutdown" === onclick
      ? _servicelocator.appHost.shutdown()
      : "restart" === onclick
      ? _servicelocator.appHost.restart()
      : "menu" === onclick
      ? _events.default.trigger(navDrawerContent, "open-requested")
      : (onclick = e.href) && _approuter.default.show(onclick);
  }
  _exports.default = navDrawerContent;
});
