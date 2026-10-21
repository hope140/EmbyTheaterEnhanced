define([
  "exports",
  "./../dom.js",
  "./../common/servicelocator.js",
  "./../layoutmanager.js",
  "./../common/globalize.js",
  "./../cardbuilder/cardbuilder.js",
  "./../common/usersettings/usersettings.js",
  "./../emby-apiclient/connectionmanager.js",
  "./../common/appsettings.js",
  "./../registrationservices/registrationservices.js",
  "./../approuter.js",
  "./../emby-elements/emby-button/emby-button.js",
  "./../emby-elements/emby-button/paper-icon-button-light.js",
  "./../emby-elements/emby-itemscontainer/emby-itemscontainer.js",
  "./../emby-elements/emby-scroller/emby-scroller.js",
], function (
  _exports,
  _dom,
  _servicelocator,
  _layoutmanager,
  _globalize,
  _cardbuilder,
  _usersettings,
  _connectionmanager,
  _appsettings,
  _registrationservices,
  _approuter,
  _embyButton,
  _paperIconButtonLight,
  _embyItemscontainer,
  _embyScroller
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var RequestedItemFields = "BasicSyncInfo,CanDelete,Container";
  function resume(elem, options) {
    for (
      var elems = elem.querySelectorAll(".itemsContainer"), promises = [], i = 0, length = elems.length;
      i < length;
      i++
    )
      promises.push(elems[i].resume(options));
    elem = Promise.all(promises);
    return options && !1 === options.returnPromise ? promises[0] : elem;
  }
  function getUserViews(apiClient, userId) {
    return apiClient.getUserViews({}, userId || apiClient.getCurrentUserId()).then(function (result) {
      return result.Items;
    });
  }
  function getLibraryButtonsListOptions(items) {
    return {
      renderer: _cardbuilder.default,
      options: {
        fields: ["Name"],
        centerText: !0,
        overlayText: !1,
        lazy: !0,
        transition: !1,
        hoverPlayButton: !1,
        sideFooter: !0,
        image: !1,
        smallSideFooter: !0,
        multiSelect: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getAppInfoListOptions(items) {
    return {
      renderer: _cardbuilder.default,
      options: {
        shape: "autooverflow",
        overlayText: !1,
        fields: ["Name"],
        centerText: !0,
        contextMenu: !1,
        action: "custom",
        multiSelect: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getDownloadListOptions(items) {
    var fields = [];
    return (
      fields.push("Name"),
      fields.push("ProductionYear"),
      fields.push("ParentName"),
      {
        renderer: _cardbuilder.default,
        options: {
          preferThumb: "auto",
          inheritThumb: !1,
          shape: "autooverflow",
          overlayText: !1,
          fields: fields,
          lazy: !0,
          showDetailsMenu: !0,
          overlayPlayButton: !0,
          context: "home",
          centerText: !0,
          lines: 2,
          focusTransformTitleAdjust: !0,
        },
        virtualScrollLayout: "horizontal-grid",
      }
    );
  }
  function getLibraryCardsListOptions(items) {
    return {
      renderer: _cardbuilder.default,
      options: {
        shape: "smallBackdrop",
        fields: ["Name"],
        centerText: !0,
        overlayText: !1,
        lazy: !0,
        transition: !1,
        hoverPlayButton: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function loadLibraryTiles(elem, apiClient, index, useSmallButtons) {
    var serverId,
      html = "",
      itemsContainerClass =
        ((html =
          (html += '<div class="sectionTitleContainer sectionTitleContainer-cards">') +
          ('<h2 class="sectionTitle sectionTitle-cards padded-left padded-right">' +
            _globalize.default.translate("HeaderMyMedia") +
            "</h2>")),
        "itemsContainer scrollSlider focuscontainer-x"),
      index =
        (!_layoutmanager.default.tv && index < 2 && (itemsContainerClass += " itemsContainer-finepointerwrap"),
        useSmallButtons && (itemsContainerClass += " itemsContainer-sideFooters itemsContainer-smallSideFooters"),
        (html =
          (html =
            html +
            "</div>" +
            ('<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right" data-mousewheel="false" data-centerfocus="true"><div is="emby-itemscontainer" class="' +
              itemsContainerClass +
              '">')) +
          "</div>" +
          "</div>"),
        elem.classList.add("hide"),
        (elem.innerHTML = html),
        useSmallButtons &&
          (_layoutmanager.default.tv
            ? elem.classList.add("padded-bottom")
            : elem.classList.add("verticalSection-extrabottompadding")),
        !(function (elem, userId, serverId) {
          (elem = elem.querySelector(".btnHomeScreenSettings")) &&
            elem.addEventListener("click", function () {
              _approuter.default.show("settings/homescreen.html?userId=" + userId + "&serverId=" + serverId);
            });
        })(elem, apiClient.getCurrentUserId(), apiClient.serverId()),
        elem.querySelector(".itemsContainer"));
    (index.fetchData =
      ((serverId = apiClient.serverId()),
      function () {
        var apiClient = _connectionmanager.default.getApiClient(serverId);
        return getUserViews(apiClient, apiClient.getCurrentUserId());
      })),
      (index.getListOptions = useSmallButtons ? getLibraryButtonsListOptions : getLibraryCardsListOptions),
      (index.parentContainer = elem);
  }
  function getContinueWatchingListOptions(items) {
    var fields = [];
    return (
      fields.push("Name"),
      fields.push("ProductionYear"),
      fields.push("ParentName"),
      {
        renderer: _cardbuilder.default,
        options: {
          preferThumb: !0,
          shape: "backdrop",
          overlayText: !1,
          fields: fields,
          lazy: !0,
          showDetailsMenu: !0,
          overlayPlayButton: !0,
          context: "home",
          centerText: !0,
          cardLayout: !1,
          lines: 2,
          focusTransformTitleAdjust: !0,
        },
        virtualScrollLayout: "horizontal-grid",
        contextMenuOptions: {removeFromResume: !0},
      }
    );
  }
  function getContinueListeningListOptions(items) {
    var fields = [];
    return (
      fields.push("Name"),
      fields.push("Album"),
      fields.push("ParentName"),
      {
        renderer: _cardbuilder.default,
        options: {
          preferThumb: "auto",
          shape: "auto",
          overlayText: !1,
          fields: fields,
          lazy: !0,
          showDetailsMenu: !0,
          overlayPlayButton: !0,
          context: "home",
          centerText: !0,
          cardLayout: !1,
          albumFirst: !0,
          focusTransformTitleAdjust: !0,
        },
        virtualScrollLayout: "horizontal-grid",
      }
    );
  }
  function getOnNowListOptions(items) {
    return {
      renderer: _cardbuilder.default,
      options: {
        preferThumb: "auto",
        inheritThumb: !1,
        shape: "autooverflow",
        centerText: !0,
        overlayText: !1,
        lines: 3,
        fields: ["CurrentProgramName", "CurrentProgramParentName", "CurrentProgramTime"],
        showCurrentProgramImage: !0,
        showAirDateTime: !1,
        overlayPlayButton: !0,
        defaultShape: "portrait",
        action: "programlink",
        multiSelect: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
      contextMenuOptions: {createRecording: !1},
    };
  }
  function getNextUpListOptions(items) {
    var fields = ["Name"];
    return (
      fields.push("ParentName"),
      {
        renderer: _cardbuilder.default,
        options: {
          preferThumb: !0,
          shape: "backdrop",
          overlayText: !1,
          fields: fields,
          lazy: !0,
          overlayPlayButton: !0,
          context: "home",
          centerText: !0,
          cardLayout: !1,
          focusTransformTitleAdjust: !0,
        },
        virtualScrollLayout: "horizontal-grid",
        contextMenuOptions: {removeFromNextUp: !0},
      }
    );
  }
  _exports.default = {
    loadSections: function (elem, apiClient, user) {
      for (
        var sections = _usersettings.default.getHomeScreenSections(), html = "", i = 0, length = sections.length;
        i < length;
        i++
      )
        (html += '<div class="verticalSection section' + i + ' focusable" data-focusabletype="nearest"></div>'),
          0 === i &&
            (html +=
              '<div class="verticalSection section-downloads hide focusable" data-focusabletype="nearest"></div><div class="verticalSection section-appinfo hide focusable" data-focusabletype="nearest"></div>');
      (elem.innerHTML = html), elem.classList.add("homeSectionsContainer");
      var promises = [];
      for (i = 0, length = sections.length; i < length; i++)
        promises.push(
          (function (page, apiClient, user, allSections, index) {
            var section = allSections[index],
              page = (apiClient.getCurrentUserId(), page.querySelector(".section" + index));
            {
              if ("latestmedia" === section)
                return (function (elem, apiClient, user) {
                  return getUserViews(apiClient, apiClient.getCurrentUserId()).then(function (userViews) {
                    elem.classList.remove("verticalSection"),
                      elem.classList.remove("focusable"),
                      elem.removeAttribute("data-focusabletype");
                    for (
                      var excludeViewTypes = ["playlists", "livetv", "boxsets", "channels"],
                        i = 0,
                        length = userViews.length;
                      i < length;
                      i++
                    ) {
                      var frag,
                        item = userViews[i];
                      user.Configuration.LatestItemsExcludes.includes(item.Id) ||
                        (item.Guid && user.Configuration.LatestItemsExcludes.includes(item.Guid)) ||
                        excludeViewTypes.includes(item.CollectionType || []) ||
                        ((frag = document.createElement("div")).classList.add("hide"),
                        frag.classList.add("verticalSection"),
                        frag.classList.add("focusable"),
                        frag.setAttribute("data-focusabletype", "nearest"),
                        elem.appendChild(frag),
                        (function (elem, apiClient, parent) {
                          var html = "";
                          (html +=
                            '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">'),
                            _layoutmanager.default.tv
                              ? (html +=
                                  '<h2 class="sectionTitle sectionTitle-cards">' +
                                  _globalize.default.translate("LatestFromLibrary", parent.Name) +
                                  "</h2>")
                              : (html =
                                  (html =
                                    (html =
                                      html +
                                      ('<a is="emby-sectiontitle" href=".' +
                                        _approuter.default.getRouteUrl(parent, {section: "latest"})) +
                                      '" class="more button-link  button-link-color-inherit sectionTitleTextButton"><h2 class="sectionTitle sectionTitle-cards">') +
                                    _globalize.default.translate("LatestFromLibrary", parent.Name)) + "</h2></a>");
                          html += "</div>";
                          var monitor =
                              "music" === parent.CollectionType || "audiobooks" === parent.CollectionType
                                ? "markplayed"
                                : "videoplayback,markplayed",
                            monitor =
                              ((html =
                                (html +=
                                  '<div data-parentid="' +
                                  parent.Id +
                                  '" is="emby-scroller" data-mousewheel="false" data-centerfocus="true" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" data-monitor="' +
                                  monitor +
                                  '" data-virtualscrolllayout="horizontal-grid">') + "</div></div>"),
                              (elem.innerHTML = html),
                              elem.querySelector(".itemsContainer"));
                          (monitor.fetchData = (function (serverId, parentId) {
                            return function (query) {
                              return _connectionmanager.default
                                .getApiClient(serverId)
                                .getLatestItems({
                                  Limit: 16,
                                  Fields:
                                    RequestedItemFields + ",PrimaryImageAspectRatio,ProductionYear,Status,EndDate",
                                  ImageTypeLimit: 1,
                                  EnableImageTypes: "Primary,Backdrop,Thumb",
                                  ParentId: parentId,
                                });
                            };
                          })(apiClient.serverId(), parent.Id, parent.CollectionType)),
                            (monitor.getListOptions = (function (viewType) {
                              return function (items) {
                                var fields = [];
                                return (
                                  "photos" !== viewType && fields.push("Name"),
                                  ("movies" !== viewType &&
                                    "tvshows" !== viewType &&
                                    "musicvideos" !== viewType &&
                                    viewType) ||
                                    fields.push("ProductionYear"),
                                  ("music" !== viewType &&
                                    "audiobooks" !== viewType &&
                                    "tvshows" !== viewType &&
                                    "musicvideos" !== viewType &&
                                    viewType) ||
                                    fields.push("ParentName"),
                                  {
                                    renderer: _cardbuilder.default,
                                    options: {
                                      shape: "autooverflow",
                                      preferThumb: "auto",
                                      showUnplayedIndicator: !1,
                                      showChildCountIndicator: !0,
                                      context: "home",
                                      overlayText: !1,
                                      centerText: !0,
                                      overlayPlayButton: "photos" !== viewType,
                                      fields: fields,
                                      lines: "musicvideos" !== viewType && viewType ? 2 : 3,
                                      focusTransformTitleAdjust: !0,
                                    },
                                    virtualScrollLayout: "horizontal-grid",
                                  }
                                );
                              };
                            })((parent.Type, parent.CollectionType))),
                            (monitor.parentContainer = elem);
                        })(frag, apiClient, item));
                    }
                  });
                })(page, apiClient, user);
              if ("smalllibrarytiles" === section) return loadLibraryTiles(page, apiClient, index);
              if ("librarybuttons" === section) return loadLibraryTiles(page, apiClient, index, !0);
              if ("resume" === section)
                !(function (elem, apiClient, allSections) {
                  var html = "",
                    html =
                      ((html =
                        (html =
                          '<h2 class="sectionTitle sectionTitle-cards padded-left padded-right">' +
                          _globalize.default.translate("HeaderContinueWatching") +
                          '</h2><div is="emby-scroller" data-mousewheel="false" data-centerfocus="true" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" data-monitor="videoplayback,markplayed" data-virtualscrolllayout="horizontal-grid">') +
                        "</div></div>"),
                      elem.classList.add("hide"),
                      (elem.innerHTML = html),
                      elem.querySelector(".itemsContainer"));
                  (html.fetchData = (function (serverId, allSections) {
                    return function (query) {
                      var apiClient = _connectionmanager.default.getApiClient(serverId),
                        query = Object.assign(
                          {
                            Recursive: !0,
                            Fields: RequestedItemFields + ",PrimaryImageAspectRatio,ProductionYear",
                            ImageTypeLimit: 1,
                            EnableImageTypes: "Primary,Backdrop,Thumb",
                            MediaTypes: "Video",
                            IncludeNextUp: !allSections.includes("nextup") && null,
                          },
                          query
                        );
                      return apiClient.getResumableItems(apiClient.getCurrentUserId(), query);
                    };
                  })(apiClient.serverId(), allSections)),
                    (html.getListOptions = getContinueWatchingListOptions),
                    (html.parentContainer = elem);
                })(page, apiClient, allSections);
              else if ("resumeaudio" === section)
                !(function (elem, apiClient) {
                  var html = "",
                    html =
                      ((html =
                        (html =
                          '<h2 class="sectionTitle sectionTitle-cards padded-left padded-right">' +
                          _globalize.default.translate("HeaderContinueListening") +
                          '</h2><div is="emby-scroller" data-mousewheel="false" data-centerfocus="true" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" data-monitor="audioplayback,markplayed" data-virtualscrolllayout="horizontal-grid">') +
                        "</div></div>"),
                      elem.classList.add("hide"),
                      (elem.innerHTML = html),
                      elem.querySelector(".itemsContainer"));
                  (html.fetchData = (function (serverId) {
                    return function (query) {
                      var apiClient = _connectionmanager.default.getApiClient(serverId),
                        query = Object.assign(
                          {
                            Recursive: !0,
                            Fields: RequestedItemFields + ",PrimaryImageAspectRatio,ProductionYear",
                            ImageTypeLimit: 1,
                            EnableImageTypes: "Primary,Backdrop,Thumb",
                            MediaTypes: "Audio",
                          },
                          query
                        );
                      return apiClient.getResumableItems(apiClient.getCurrentUserId(), query);
                    };
                  })(apiClient.serverId())),
                    (html.getListOptions = getContinueListeningListOptions),
                    (html.parentContainer = elem);
                })(page, apiClient);
              else if ("activerecordings" === section)
                !(function (elem, activeRecordingsOnly, apiClient) {
                  var title = activeRecordingsOnly
                      ? _globalize.default.translate("HeaderActiveRecordings")
                      : _globalize.default.translate("HeaderLatestRecordings"),
                    html = "",
                    title =
                      ((html =
                        (html =
                          (html =
                            '<div class="sectionTitleContainer sectionTitleContainer-cards"><h2 class="sectionTitle sectionTitle-cards padded-left padded-right">' +
                            title +
                            "</h2>") +
                          '</div><div is="emby-scroller" data-mousewheel="false" data-centerfocus="true" class="padded-top-focusscale padded-bottom-focusscale"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x padded-left padded-right" data-monitor="RecordingStarted,RecordingEnded" data-virtualscrolllayout="horizontal-grid">') +
                        "</div></div>"),
                      elem.classList.add("hide"),
                      (elem.innerHTML = html),
                      elem.querySelector(".itemsContainer"));
                  (title.fetchData = (function (serverId, activeRecordingsOnly) {
                    return function (query) {
                      var apiClient = _connectionmanager.default.getApiClient(serverId);
                      return apiClient.getLiveTvRecordings(
                        Object.assign(
                          {
                            userId: apiClient.getCurrentUserId(),
                            Fields: RequestedItemFields + ",PrimaryImageAspectRatio,ProductionYear",
                            IsLibraryItem: !!activeRecordingsOnly && null,
                            IsInProgress: !!activeRecordingsOnly || null,
                          },
                          query
                        )
                      );
                    };
                  })(apiClient.serverId(), activeRecordingsOnly)),
                    (title.getListOptions = (function (activeRecordingsOnly) {
                      return function (items) {
                        var fields = [];
                        return (
                          fields.push("Name"),
                          fields.push("ProductionYear"),
                          fields.push("ParentName"),
                          {
                            renderer: _cardbuilder.default,
                            options: {
                              shape: "autooverflow",
                              fields: fields,
                              lazy: !0,
                              showDetailsMenu: !0,
                              centerText: !0,
                              overlayText: !1,
                              lines: 2,
                              overlayPlayButton: !activeRecordingsOnly,
                              preferThumb: !0,
                              cardLayout: !1,
                              action: activeRecordingsOnly ? "none" : null,
                              focusTransformTitleAdjust: !0,
                            },
                            virtualScrollLayout: "horizontal-grid",
                          }
                        );
                      };
                    })(activeRecordingsOnly)),
                    (title.parentContainer = elem),
                    (title.maxTotalRecordCount = 24);
                })(page, !0, apiClient);
              else {
                if ("nextup" !== section)
                  return "livetv" === section
                    ? (function (elem, apiClient, user) {
                        if (!user.Policy.EnableLiveTvAccess)
                          return elem.classList.add("hide"), elem.classList.remove("focusable"), Promise.resolve();
                        user = [];
                        user.push(
                          _registrationservices.default.validateFeature("livetv", {viewOnly: !0, showDialog: !1}).then(
                            function () {
                              return Promise.resolve(!0);
                            },
                            function () {
                              return Promise.resolve(!1);
                            }
                          )
                        ),
                          apiClient.getCurrentUserId();
                        return Promise.all(user).then(function (responses) {
                          var serverId,
                            html = "";
                          responses[0]
                            ? (elem.classList.remove("padded-left"),
                              elem.classList.remove("padded-right"),
                              elem.classList.remove("padded-bottom"),
                              elem.classList.remove("verticalSection"),
                              elem.classList.remove("focusable"),
                              elem.removeAttribute("data-focusabletype"),
                              (html =
                                (html =
                                  (html =
                                    (html =
                                      (html =
                                        (html +=
                                          '<div class="verticalSection focusable" data-focusabletype="nearest"><div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">') +
                                        '<h2 class="sectionTitle sectionTitle-cards">' +
                                        _globalize.default.translate("LiveTV") +
                                        '</h2></div><div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right" data-mousewheel="false" data-centerfocus="true" data-scrollbuttons="false"><div class="scrollSlider padded-top padded-bottom focuscontainer-x flex align-items-center">') +
                                      '<a style="margin:.5em 0 .5em .4em;" is="emby-linkbutton" href=".' +
                                      _approuter.default.getRouteUrl("livetv", {
                                        serverId: apiClient.serverId(),
                                        section: "programs",
                                      }) +
                                      '" class="raised justify-content-center"><i class="md-icon button-icon button-icon-left">&#xe639;</i><span>' +
                                      _globalize.default.translate("Programs") +
                                      "</span></a>") +
                                    '<a style="margin:.5em 0 .5em .8em;" is="emby-linkbutton" href=".' +
                                    _approuter.default.getRouteUrl("livetv", {
                                      serverId: apiClient.serverId(),
                                      section: "guide",
                                    }) +
                                    '" class="raised justify-content-center"><i class="md-icon button-icon button-icon-left autortl">&#xe1b2;</i><span>' +
                                    _globalize.default.translate("Guide") +
                                    "</span></a>") +
                                  '<a style="margin:.5em 0 .5em .8em;" is="emby-linkbutton" href=".' +
                                  _approuter.default.getRouteUrl("recordedtv", {serverId: apiClient.serverId()}) +
                                  '" class="raised justify-content-center"><i class="md-icon button-icon button-icon-left">folder</i><span>' +
                                  _globalize.default.translate("Recordings") +
                                  "</span></a>") +
                                '<a style="margin:.5em 0 .5em .8em;" is="emby-linkbutton" href=".' +
                                _approuter.default.getRouteUrl("livetv", {
                                  serverId: apiClient.serverId(),
                                  section: "dvrschedule",
                                }) +
                                '" class="raised justify-content-center"><i class="md-icon button-icon button-icon-left">&#xe916;</i><span>' +
                                _globalize.default.translate("Schedule") +
                                '</span></a></div></div></div></div><div class="verticalSection focusable" data-focusabletype="nearest"><div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">'),
                              _layoutmanager.default.tv
                                ? (html +=
                                    '<h2 class="sectionTitle sectionTitle-cards">' +
                                    _globalize.default.translate("HeaderOnNow") +
                                    "</h2>")
                                : (html =
                                    (html =
                                      html +
                                      ('<a is="emby-sectiontitle" href=".' +
                                        _approuter.default.getRouteUrl("livetv", {
                                          serverId: apiClient.serverId(),
                                          section: "onnow",
                                        })) +
                                      '" class="more button-link  button-link-color-inherit sectionTitleTextButton"><h2 class="sectionTitle sectionTitle-cards">') +
                                    _globalize.default.translate("HeaderOnNow") +
                                    "</h2></a>"),
                              (elem.innerHTML = html =
                                (html =
                                  (html += "</div>") +
                                  '<div is="emby-scroller" data-mousewheel="false" data-centerfocus="true" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" data-refreshinterval="300000" data-virtualscrolllayout="horizontal-grid">' +
                                  "</div>") +
                                "</div>" +
                                "</div>"),
                              ((responses = elem.querySelector(".itemsContainer")).parentContainer = elem),
                              (responses.fetchData =
                                ((serverId = apiClient.serverId()),
                                function (query) {
                                  var apiClient = _connectionmanager.default.getApiClient(serverId);
                                  return (
                                    (query = Object.assign(
                                      {
                                        userId: apiClient.getCurrentUserId(),
                                        IsAiring: !0,
                                        ImageTypeLimit: 1,
                                        EnableImageTypes: "Primary,Backdrop,Thumb",
                                        Fields: "ProgramPrimaryImageAspectRatio",
                                        EnableUserData: !1,
                                      },
                                      query
                                    )),
                                    _usersettings.default.addLiveTvChannelSortingToQuery(query, _globalize.default),
                                    apiClient.getLiveTvChannels(query)
                                  );
                                })),
                              (responses.getListOptions = getOnNowListOptions))
                            : (elem.classList.add("hide"),
                              elem.classList.remove("focusable"),
                              elem.classList.add("padded-left"),
                              elem.classList.add("padded-right"),
                              elem.classList.add("padded-bottom"),
                              (html =
                                (html =
                                  html +
                                  ('<h2 class="sectionTitle">' + _globalize.default.translate("")) +
                                  '</h2><button is="emby-button" type="button" class="raised button-submit block btnUnlock">') +
                                "<span>" +
                                _globalize.default.translate("HeaderBecomeProjectSupporter") +
                                "</span>"),
                              (elem.innerHTML = html += "</button>"),
                              (function (elem, apiClient) {
                                apiClient
                                  .getLiveTvChannels({
                                    userId: apiClient.getCurrentUserId(),
                                    limit: 1,
                                    ImageTypeLimit: 1,
                                    EnableTotalRecordCount: !1,
                                    EnableImages: !1,
                                    EnableUserData: !1,
                                  })
                                  .then(function (result) {
                                    result.Items.length
                                      ? (elem.classList.add("focusable"), elem.classList.remove("hide"))
                                      : (elem.classList.add("hide"), elem.classList.remove("focusable"));
                                  });
                              })(elem, apiClient)),
                            (function (elem) {
                              var btnUnlock = elem.querySelector(".btnUnlock");
                              btnUnlock &&
                                btnUnlock.addEventListener("click", function (e) {
                                  _registrationservices.default
                                    .validateFeature("livetv", {viewOnly: !0})
                                    .then(function () {
                                      elem
                                        .closest(".homeSectionsContainer")
                                        .dispatchEvent(new CustomEvent("settingschange", {cancelable: !1}));
                                    });
                                });
                            })(elem);
                        });
                      })(page, apiClient, user)
                    : ((page.innerHTML = ""), Promise.resolve());
                !(function (elem, apiClient) {
                  var html = "";
                  (html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">'),
                    _layoutmanager.default.tv
                      ? (html +=
                          '<h2 class="sectionTitle sectionTitle-cards">' +
                          _globalize.default.translate("HeaderNextUp") +
                          "</h2>")
                      : (html =
                          (html =
                            (html =
                              html +
                              ('<a is="emby-sectiontitle" href=".' +
                                _approuter.default.getRouteUrl("nextup", {serverId: apiClient.serverId()})) +
                              '" class="button-link  button-link-color-inherit sectionTitleTextButton"><h2 class="sectionTitle sectionTitle-cards">') +
                            _globalize.default.translate("HeaderNextUp")) + "</h2></a>");
                  (html =
                    (html +=
                      '</div><div is="emby-scroller" data-mousewheel="false" data-centerfocus="true" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" data-monitor="videoplayback,markplayed" data-virtualscrolllayout="horizontal-grid">') +
                    "</div></div>"),
                    elem.classList.add("hide"),
                    (elem.innerHTML = html);
                  html = elem.querySelector(".itemsContainer");
                  (html.fetchData = (function (serverId) {
                    return function (query) {
                      var apiClient = _connectionmanager.default.getApiClient(serverId);
                      return apiClient.getNextUpEpisodes(
                        Object.assign(
                          {
                            LegacyNextUp: !0,
                            Fields: RequestedItemFields + ",PrimaryImageAspectRatio,SeriesInfo,DateCreated",
                            UserId: apiClient.getCurrentUserId(),
                            ImageTypeLimit: 1,
                            EnableImageTypes: "Primary,Backdrop,Thumb",
                          },
                          query
                        )
                      );
                    };
                  })(apiClient.serverId())),
                    (html.getListOptions = getNextUpListOptions),
                    (html.parentContainer = elem);
                })(page, apiClient);
              }
            }
            return Promise.resolve();
          })(elem, apiClient, user, sections, i)
        ),
          0 === i &&
            (promises.push(
              (function (elem, apiClient, user) {
                if (
                  (elem.classList.add("hide"),
                  !_servicelocator.appHost.supports("sync") || !user.Policy.EnableContentDownloading)
                )
                  return Promise.resolve();
                user = "";
                (user =
                  (user =
                    (user =
                      (user +=
                        '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">') +
                      '<a is="emby-sectiontitle" href=".' +
                      _approuter.default.getRouteUrl("downloads") +
                      '" class="more button-link  button-link-color-inherit sectionTitleTextButton"><h2 class="sectionTitle sectionTitle-cards">') +
                    _globalize.default.translate("Downloads")) + "</h2></a>"),
                  _layoutmanager.default.tv ||
                    (user +=
                      '<a is="emby-linkbutton" href=".' +
                      _approuter.default.getRouteUrl("managedownloads") +
                      '" class="sectionTitleIconButton"><i class="md-icon">&#xE8B8;</i></a>');
                (user =
                  (user +=
                    '</div><div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right" data-mousewheel="false" data-centerfocus="true"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x">') +
                  "</div></div>"),
                  (elem.innerHTML = user);
                user = elem.querySelector(".itemsContainer");
                (user.fetchData = (function (serverId) {
                  return function () {
                    var apiClient = _connectionmanager.default.getApiClient(serverId);
                    return apiClient.getLatestOfflineItems
                      ? apiClient.getLatestOfflineItems({Limit: 20, Filters: "IsNotFolder"})
                      : Promise.resolve([]);
                  };
                })(apiClient.serverId())),
                  (user.getListOptions = getDownloadListOptions),
                  (user.parentContainer = elem);
              })(elem.querySelector(".section-downloads"), apiClient, user)
            ),
            promises.push(
              (function (elem, apiClient) {
                return (
                  elem.classList.add("hide"),
                  (function () {
                    var cacheKey = "lastappinfopresent5",
                      lastDatePresented = parseInt(_appsettings.default.get(cacheKey) || "0");
                    if (!lastDatePresented) return _appsettings.default.set(cacheKey, Date.now()), Promise.resolve("");
                    if (Date.now() - lastDatePresented < 1728e5) return Promise.resolve("");
                    return _registrationservices.default.validateFeature("dvr", {showDialog: !1, viewOnly: !0}).then(
                      function () {
                        return _appsettings.default.set(cacheKey, Date.now()), "";
                      },
                      function () {
                        return (
                          _appsettings.default.set(cacheKey, Date.now()),
                          (html = ""),
                          (html =
                            (html =
                              (html =
                                (html += '<div class="sectionTitleContainer sectionTitleContainer-cards">') +
                                '<h2 class="sectionTitle sectionTitle-cards padded-left padded-right">Discover Emby Premiere</h2></div>') +
                              '<p class="sectionTitle-cards padded-left padded-right">Enjoy Emby DVR, get free access to Emby apps, and more.</p><div is="emby-scroller" data-mousewheel="false" data-centerfocus="true" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x">') +
                            "</div></div>")
                        );
                        var html;
                      }
                    );
                  })().then(function (html) {
                    (elem.innerHTML = html),
                      (function (elem) {
                        elem = elem.querySelector(".itemsContainer");
                        elem &&
                          elem.addEventListener("action-null", function (e) {
                            e.target.closest(".card") && _registrationservices.default.showPremiereInfo();
                          });
                      })(elem);
                    html = elem.querySelector(".itemsContainer");
                    html &&
                      ((html.fetchData = function () {
                        var items = [];
                        return (
                          items.push({
                            Name: "",
                            Id: "PremiereInfo1",
                            ImageUrl:
                              "https://raw.githubusercontent.com/MediaBrowser/Emby.Resources/master/apps/theater1.png",
                            PrimaryImageAspectRatio: 16 / 9,
                            ServerId: this.serverId(),
                          }),
                          items.push({
                            Name: "",
                            Id: "PremiereInfo2",
                            ImageUrl:
                              "https://raw.githubusercontent.com/MediaBrowser/Emby.Resources/master/apps/theater2.png",
                            PrimaryImageAspectRatio: 16 / 9,
                            ServerId: this.serverId(),
                          }),
                          items.push({
                            Name: "",
                            Id: "PremiereInfo3",
                            ImageUrl:
                              "https://raw.githubusercontent.com/MediaBrowser/Emby.Resources/master/apps/theater3.png",
                            PrimaryImageAspectRatio: 16 / 9,
                            ServerId: this.serverId(),
                          }),
                          Promise.resolve({Items: items, TotalRecordCount: items.length})
                        );
                      }.bind(apiClient)),
                      (html.getListOptions = getAppInfoListOptions),
                      (html.parentContainer = elem));
                  }),
                  Promise.resolve()
                );
              })(elem.querySelector(".section-appinfo"), apiClient)
            ));
      return Promise.all(promises).then(function () {
        return resume(elem, {refresh: !0, returnPromise: !1});
      });
    },
    pause: function (elem) {
      for (var elems = elem.querySelectorAll(".itemsContainer"), i = 0, length = elems.length; i < length; i++)
        elems[i].pause();
    },
    resume: resume,
  };
});
