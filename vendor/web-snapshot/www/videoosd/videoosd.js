define([
  "exports",
  "./../modules/common/playback/playbackmanager.js",
  "./../modules/focusmanager.js",
  "./../modules/cardbuilder/cardbuilder.js",
  "./../modules/dom.js",
  "./../modules/browser.js",
  "./../modules/common/globalize.js",
  "./../modules/common/datetime.js",
  "./../modules/layoutmanager.js",
  "./../modules/common/itemhelper.js",
  "./../modules/emby-apiclient/events.js",
  "./../modules/emby-apiclient/connectionmanager.js",
  "./../modules/appheader/appheader.js",
  "./../modules/mediainfo/mediainfo.js",
  "./../modules/backdrop/backdrop.js",
  "./playqueue.js",
  "./tvplayqueue.js",
  "./lyrics.js",
  "./../modules/approuter.js",
  "./../modules/itemcontextmenu.js",
  "./../modules/shortcuts.js",
  "./../modules/common/inputmanager.js",
  "./../modules/common/usersettings/usersettings.js",
  "./../modules/input/mouse.js",
  "./../modules/emby-elements/emby-scroller/emby-scroller.js",
  "./../modules/emby-elements/emby-button/paper-icon-button-light.js",
  "./../modules/emby-elements/emby-tabs/emby-tabs.js",
  "./../modules/emby-elements/emby-slider/emby-slider.js",
  "./../modules/common/appsettings.js",
  "./../modules/toast/toast.js",
], function (
  _exports,
  _playbackmanager,
  _focusmanager,
  _cardbuilder,
  _dom,
  _browser,
  _globalize,
  _datetime,
  _layoutmanager,
  _itemhelper,
  _events,
  _connectionmanager,
  _appheader,
  _mediainfo,
  _backdrop,
  _playqueue,
  _tvplayqueue,
  _lyrics,
  _approuter,
  _itemcontextmenu,
  _shortcuts,
  _inputmanager,
  _usersettings,
  _mouse,
  _embyScroller,
  _paperIconButtonLight,
  _embyTabs,
  _embySlider,
  _appsettings,
  _toast
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["css!videoosd/videoosd.css"]);
  var useBackdropFilterForBlur = _dom.default.allowBackdropFilter(),
    supportsCssAnimations = CSS.supports("animation-name", "a"),
    enableHighResBlur = !((navigator.hardwareConcurrency || 4) < 6) && !((navigator.deviceMemory || 2) < 2);
  function logoImageUrl(item, apiClient, options) {
    return apiClient.getLogoImageUrl(item, (options = options || {}), ["LogoLightColor", "LogoLight", "Logo"]);
  }
  function isDisplayingLocalVideo(player, mediaType) {
    return (
      player && player.isLocalPlayer && "Video" === (mediaType || _playbackmanager.default.getCurrentMediaType(player))
    );
  }
  function setForwardIcon(btnFastForward) {
    var icon = btnFastForward.querySelector("i");
    switch (
      ((icon.innerHTML = (function () {
        switch (_usersettings.default.skipForwardLength()) {
          case 5e3:
            return "&#xe058;";
          case 1e4:
            return "&#xe056;";
          case 3e4:
            return "&#xe057;";
          default:
            return "&#xE042;";
        }
      })()),
      _usersettings.default.skipForwardLength())
    ) {
      case 5e3:
      case 1e4:
      case 3e4:
        break;
      default:
        icon.classList.add("videoOsd-forwardIcon-flipped");
    }
  }
  function setRewindIcon(btnRewind) {
    btnRewind.querySelector("i").innerHTML = (function () {
      switch (_usersettings.default.skipBackLength()) {
        case 5e3:
          return "&#xe05b;";
        case 1e4:
          return "&#xe059;";
        case 3e4:
          return "&#xe05a;";
        default:
          return "&#xE042;";
      }
    })();
  }
  function showMoreMenu(item, button) {
    _connectionmanager.default
      .getApiClient(item.ServerId)
      .getCurrentUser()
      .then(function (user) {
        return _itemcontextmenu.default
          .show(
            (function (item, user, button) {
              return {
                item: item,
                open: !1,
                play: !1,
                playAllFromHere: !1,
                queueAllFromHere: !1,
                positionTo: button,
                cancelTimer: !1,
                record: !1,
                deleteItem: !1,
                shuffle: !1,
                instantMix: !1,
                user: user,
                share: !0,
                queue: !1,
                editSubtitles: !1,
                positionY: "above",
                transformOrigin: "center bottom",
                convert: !1,
                refreshMetadata: !1,
                identify: !1,
                autoTvLayout: !1,
              };
            })(item, user, button)
          )
          .then(function (result) {
            result.updated;
          });
      });
  }
  function focusMainOsdControls(instance) {
    _focusmanager.default.focus(instance.nowPlayingPositionSlider);
  }
  function hideOrShowAll(instance, elems, hide, focusedElement) {
    for (var wasFocused, i = 0, length = elems.length; i < length; i++) {
      var elem = elems[i];
      hide
        ? (focusedElement && focusedElement === elem && (wasFocused = !0), elem.classList.add("hide"))
        : elem.classList.remove("hide");
    }
    wasFocused && focusMainOsdControls(instance);
  }
  function getTextActionButton(item, text) {
    if (((text = text || _itemhelper.default.getDisplayName(item, {})), _layoutmanager.default.tv)) return text;
    item =
      "<button " +
      _shortcuts.default.getShortcutAttributesHtml(item, {}) +
      ' type="button" class="itemAction button-link osdTextActionButton" is="emby-button" data-action="link">';
    return item + text + "</button>";
  }
  function getSecondaryName(item, enableLinkButton) {
    var title = _itemhelper.default.getDisplayName(item, {
      includeParentInfo: "Program" !== item.Type,
      includeIndexNumber: "Program" !== item.Type,
    });
    return enableLinkButton ? getTextActionButton(item, title) : title;
  }
  function getDefaultOsdContentSection() {
    return _layoutmanager.default.tv || 1056 <= _dom.default.getWindowSize().innerWidth ? "playqueue" : null;
  }
  function destroyPlayQueue(instance) {
    var playQueue = instance.playQueue;
    playQueue && (playQueue.destroy(), (instance.playQueue = null));
  }
  function destroyLyricsRenderer(instance) {
    var lyricsRenderer = instance.lyricsRenderer;
    lyricsRenderer && (lyricsRenderer.destroy(), (instance.lyricsRenderer = null));
  }
  function destroyStats(instance) {
    var statsOverlay = instance.statsOverlay;
    statsOverlay && (statsOverlay.destroy(), (instance.statsOverlay = null));
  }
  function destroySubtitleOffsetOverlay(instance) {
    var subtitleOffsetOverlay = instance.subtitleOffsetOverlay;
    subtitleOffsetOverlay && (subtitleOffsetOverlay.destroy(), (instance.subtitleOffsetOverlay = null));
  }
  function clearBlurFromDocumentElement(instance) {
    document.documentElement.classList.remove("doc-nowplaying-blur"),
      (document.documentElement.style.backgroundImage = null);
    instance = instance.backgroundContainer;
    instance && (instance.style.backgroundImage = null);
  }
  function shouldOsdBeShown(instance) {
    if (!_layoutmanager.default.tv) return !0;
    if (instance.currentVisibleMenu) return !0;
    instance = instance.currentPlayer;
    return !instance || isDisplayingLocalVideo(instance);
  }
  var supportsTouchEvent = "ontouchstart" in document.documentElement;
  function rewind(instance, animateButton) {
    "osd" === instance.currentVisibleMenu &&
      animateButton &&
      supportsCssAnimations &&
      ((animateButton = instance.btnRewindIcon).classList.remove("rew-animate"),
      animateButton.offsetWidth,
      animateButton.classList.add("rew-animate")),
      _playbackmanager.default.rewind(instance.currentPlayer);
  }
  function fastForward(instance, animateButton) {
    "osd" === instance.currentVisibleMenu &&
      animateButton &&
      supportsCssAnimations &&
      ((animateButton = instance.btnFastForwardIcon).classList.remove("ff-animate"),
      animateButton.offsetWidth,
      animateButton.classList.add("ff-animate")),
      _playbackmanager.default.fastForward(instance.currentPlayer);
  }
  function onOsdClick(e, instance, elementToFocusIfShowing, showOsdIfNoEvent) {
    var player;
    if (e.target.closest(".videoOsdBottom,.upNextContainer")) showOsdIfNoEvent && instance.showOsd();
    else if (!e.target.closest("button"))
      return (
        (player = instance.currentPlayer),
        !e.button && player && isDisplayingLocalVideo(player)
          ? (instance.showOsd(null, elementToFocusIfShowing), _playbackmanager.default.playPause(player))
          : showOsdIfNoEvent && instance.showOsd(),
        1
      );
  }
  function toggleStats(instance) {
    require(["playerStats"], function (PlayerStats) {
      var player = instance.currentPlayer;
      player &&
        (instance.statsOverlay
          ? instance.statsOverlay.toggle()
          : ((instance.statsOverlay = new PlayerStats({player: player, view: instance.view})),
            _events.default.on(
              instance.statsOverlay,
              "close",
              function () {
                "osd" === this.currentVisibleMenu && _focusmanager.default.focus(this.btnVideoOsdSettingsRight);
              }.bind(instance)
            )));
    });
  }
  function setBottomTabIndex(instance, index) {
    var bottomTabButtons,
      bottomTabs = instance.bottomTabs;
    -1 === index
      ? bottomTabs.selectedIndex(index)
      : ((bottomTabButtons = instance.bottomTabButtons),
        instance.showOsd(null, bottomTabButtons[index]),
        bottomTabs.selectedIndex(index),
        _focusmanager.default.focus(bottomTabButtons[index]));
  }
  function startOsdHideTimer(instance, timeoutMs) {
    var isLocalVideo;
    stopOsdHideTimer(instance),
      instance.paused ||
        ((isLocalVideo = isDisplayingLocalVideo(instance.currentPlayer)),
        (!_layoutmanager.default.tv && !isLocalVideo) ||
          0 === timeoutMs ||
          _focusmanager.default.hasExclusiveFocusScope() ||
          (instance.osdHideTimeout = setTimeout(
            instance.boundOnOsdHideTimeout,
            timeoutMs || (isLocalVideo ? 2.5e3 : 1e4)
          )));
  }
  function stopOsdHideTimer(instance) {
    var osdHideTimeout = instance.osdHideTimeout;
    osdHideTimeout && (clearTimeout(osdHideTimeout), (instance.osdHideTimeout = null));
  }
  function onRewindInputCommand(e, instance) {
    instance.currentVisibleMenu || e.detail.repeat || (rewind(instance), e.preventDefault()),
      shouldOsdBeShown(instance) /*&& instance.showOsd()*/;
  }
  function onFastForwardInputCommand(e, instance) {
    instance.currentVisibleMenu || e.detail.repeat || (fastForward(instance), e.preventDefault()),
      shouldOsdBeShown(instance) /*&& instance.showOsd()*/;
  }
  function VideoOsd(view, params) {
    (this.view = view), (this.params = params);
    var comingUpNextDisplayed,
      currentUpNextDialog,
      isEnabled,
      currentDisplayItem,
      currentDisplayChapters,
      currentIntroInfo,
      currentMediaSource,
      currentItemThumbnails,
      currentItemThumbnailsPromise,
      enableProgressByTimeOfDay,
      skipIntroValidated,
      enableAutoSkipIntro,
      lastPointerUpType,
      currentOsdContentSectionName,
      timeoutToShowOsd,
      self = this,
      currentPlayerSupportedCommands = [],
      currentRuntimeTicks = 0,
      lastUpdateTime = 0,
      ratingTextNeedsUpdate = !0,
      programStartDateMs = 0,
      programEndDateMs = 0,
      playbackStartTimeTicks = 0,
      nowPlayingVolumeSlider = view.querySelector(".videoOsdVolumeSlider"),
      videoOsdVolumeSliderWrapper = view.querySelector(".videoOsdVolumeSliderWrapper"),
      brightnessSlider = view.querySelector(".videoOsdBrightnessSlider"),
      brightnessSliderContainer = view.querySelector(".brightnessSliderContainer"),
      videoOsdPositionText =
        ((this.nowPlayingPositionSlider = view.querySelector(".videoOsdPositionSlider")),
        view.querySelector(".videoOsdPositionText")),
      videoOsdDurationText = view.querySelector(".videoOsdDurationText"),
      btnRewind = view.querySelector(".btnRewind"),
      btnFastForward = ((this.btnRewindIcon = btnRewind.querySelector("i")), view.querySelector(".btnOsdFastForward")),
      stopButtons =
        ((this.btnFastForwardIcon = btnFastForward.querySelector("i")),
        (this.btnPause = view.querySelector(".videoOsd-btnPause")),
        view.querySelectorAll(".btnVideoOsd-stop")),
      btnRepeatMode = view.querySelector(".btnOsdRepeatMode"),
      btnOsdMoreBottom = view.querySelector(".btnOsdMore-bottom"),
      btnOsdMoreTitle = view.querySelector(".btnOsdMore-title"),
      params = _dom.default.whichTransitionEvent(),
      btnPreviousTrack =
        ((this.headerElement = document.querySelector(".skinHeader")),
        (this.osdBottomElement = view.querySelector(".videoOsdBottom")),
        view.querySelector(".btnPreviousTrack")),
      btnNextTrack = view.querySelector(".btnNextTrack"),
      buttonMute = view.querySelector(".buttonMute"),
      btnSubtitles = view.querySelector(".btnSubtitles"),
      btnAudio = view.querySelector(".btnAudio"),
      btnFullscreen = view.querySelector(".btnFullscreen"),
      videoOsdSecondaryText = view.querySelector(".videoOsdSecondaryText"),
      osdButtons =
        ((this.videoOsdText = view.querySelector(".videoOsdText")), view.querySelector(".videoOsdBottom-buttons")),
      centerButtons = view.querySelector(".videoOsd-centerButtons"),
      videoOsdPositionContainer = view.querySelector(".videoOsdPositionContainer"),
      osdTitle = view.querySelector(".videoOsdTitle"),
      videoOsdThirdTitle = view.querySelector(".videoOsdThirdTitle"),
      videoOsdParentTitle = view.querySelector(".videoOsdParentTitle-small"),
      videoOsdParentTitleLarge = view.querySelector(".videoOsdParentTitle-large"),
      osdPosterContainer =
        ((this.backdropContainer = document.querySelector(".backdropContainer")),
        (this.backgroundContainer = document.querySelector(".backgroundContainer")),
        view.querySelector(".osdPosterContainer")),
      videoOsdSecondaryMediaInfo = view.querySelector(".videoOsdSecondaryMediaInfo"),
      tabContainers =
        ((this.bottomTabs = view.querySelector(".videoOsdBottom-tabs")),
        (this.bottomTabButtons = view.querySelectorAll(".videoosd-tab-button")),
        view.querySelectorAll(".videoosd-tab")),
      btnCloseTabContent =
        ((this.bottomTabControllers = []),
        (this.bottomTabControllers.length = tabContainers.length),
        view.querySelector(".btnCloseTabContent")),
      tabContainersElem = view.querySelector(".videoosd-tabcontainers"),
      videoOsdBottomContentbuttons = view.querySelector(".videoOsdBottom-contentbuttons"),
      videoOsdBottomMaincontrols = view.querySelector(".videoOsdBottom-maincontrols"),
      videoOsdVolumeControls = view.querySelector(".videoOsdVolumeControls"),
      videoOsdButtomButtonsRight = view.querySelector(".videoOsdBottom-buttons-right"),
      videoOsdPositionSliderContainer = view.querySelector(".videoOsdPositionSliderContainer"),
      ratingInfoContainer = view.querySelector(".videoOsd-ratingInfo"),
      ratingTextElement = view.querySelector(".videoOsd-ratingText"),
      btnSkipIntro = view.querySelector(".btnSkipIntro"),
      btnLyrics = view.querySelector(".btnLyrics"),
      btnVideoOsdSettingsTransportButton =
        ((this.btnRecord = view.querySelector(".btnRecord")),
        (this.btnVideoOsdSettingsRight = view.querySelector(".btnVideoOsdSettings-right")),
        view.querySelector(".btnVideoOsdSettings-transport")),
      enableSkipIntro = !0;
    function onRewindAnimationComplete(e) {
      (e && e.target !== e.currentTarget) || this.classList.remove("rew-animate");
    }
    function onFastForwardAnimationComplete(e) {
      (e && e.target !== e.currentTarget) || this.classList.remove("ff-animate");
    }
    function updateRecordingButton(item) {
      var recordingButtonManager;
      if (!item || "Program" !== item.Type)
        return (
          (recordingButtonManager = self.recordingButtonManager) &&
            (recordingButtonManager.destroy(), (self.recordingButtonManager = null)),
          void self.btnRecord.classList.add("hide")
        );
      _connectionmanager.default
        .getApiClient(item.ServerId)
        .getCurrentUser()
        .then(function (user) {
          user.Policy.EnableLiveTvManagement &&
            require(["recordingButton"], function (RecordingButton) {
              var recordingButtonManager = self.recordingButtonManager;
              recordingButtonManager
                ? recordingButtonManager.refreshItem(item)
                : ((recordingButtonManager = self.recordingButtonManager =
                    new RecordingButton({item: item, button: self.btnRecord})),
                  self.btnRecord.classList.remove("hide"));
            });
        });
    }
    function updateButtomTabsVisibility(item, displayItem) {
      if (!item)
        return (
          self.bottomTabs.selectedIndex(-1),
          tabContainersElem.classList.add("hide"),
          void self.bottomTabs.classList.add("hide")
        );
      var apiClient = _connectionmanager.default.getApiClient(item);
      "Video" === item.MediaType
        ? apiClient.getUserViews({}, apiClient.getCurrentUserId())
        : Promise.resolve({Items: []});
      apiClient.getUserViews({}, apiClient.getCurrentUserId()).then(function (result) {
        var bottomTabButtons = self.bottomTabButtons,
          result =
            ("Video" === item.MediaType
              ? bottomTabButtons[0].classList.remove("hide")
              : bottomTabButtons[0].classList.add("hide"),
            currentDisplayChapters && currentDisplayChapters.length
              ? bottomTabButtons[1].classList.remove("hide")
              : bottomTabButtons[1].classList.add("hide"),
            displayItem.People && displayItem.People.length
              ? bottomTabButtons[2].classList.remove("hide")
              : bottomTabButtons[2].classList.add("hide"),
            "Video" === item.MediaType &&
            (function (userViews) {
              for (var i = 0, length = userViews.length; i < length; i++)
                if ("livetv" === userViews[i].CollectionType) return 1;
            })(result.Items)
              ? (bottomTabButtons[3].classList.remove("hide"), bottomTabButtons[4].classList.remove("hide"))
              : (bottomTabButtons[3].classList.add("hide"), bottomTabButtons[4].classList.add("hide")),
            self.bottomTabs),
          selectedIndex =
            (view.querySelector(".videoosd-tab-button:not(.hide)")
              ? (tabContainersElem.classList.remove("hide"), result.classList.remove("hide"))
              : (tabContainersElem.classList.add("hide"), result.classList.add("hide")),
            result.selectedIndex());
        0 <= selectedIndex &&
          (bottomTabButtons[selectedIndex].classList.contains("hide")
            ? result.selectedIndex(-1)
            : loadBottomTabController(selectedIndex, !0));
      });
    }
    function updateDisplayItem(itemInfo) {
      var item = itemInfo.originalItem,
        itemInfo =
          ((self.currentItem = item),
          (currentItemThumbnails = currentItemThumbnailsPromise = null),
          itemInfo.displayItem || item);
      (currentDisplayChapters = (function (chapters) {
        for (var list = [], i = 0, length = chapters.length; i < length; i++) {
          var chapter = chapters[i];
          (chapter.MarkerType && "Chapter" !== chapter.MarkerType) || list.push(chapter);
        }
        return list;
      })((currentDisplayItem = itemInfo).Chapters || [])),
        updateRecordingButton(itemInfo);
      var secondaryName,
        displayingLocalVideo = isDisplayingLocalVideo(self.currentPlayer),
        item =
          (updateButtomTabsVisibility(item, itemInfo),
          itemInfo.EpisodeTitle || itemInfo.IsSeries
            ? (primaryNameText = itemInfo.Name)
            : itemInfo.SeriesName
            ? ((primaryNameText = itemInfo.SeriesName),
              itemInfo.SeriesId &&
                !displayingLocalVideo &&
                (primaryNameHtml = getTextActionButton({
                  Id: itemInfo.SeriesId,
                  Type: "Series",
                  IsFolder: !0,
                  ServerId: itemInfo.ServerId,
                  Name: itemInfo.SeriesName,
                  ParentId: itemInfo.ParentId,
                })))
            : itemInfo.ArtistItems &&
              itemInfo.ArtistItems.length &&
              ((primaryNameText = itemInfo.Name),
              (primaryNameHtml = (function (displayItem) {
                var html = [],
                  artistItems = displayItem.ArtistItems;
                if (artistItems)
                  for (var i = 0, length = artistItems.length; i < length; i++)
                    html.push(
                      getTextActionButton({
                        Id: artistItems[i].Id,
                        ServerId: displayItem.ServerId,
                        Name: artistItems[i].Name,
                        Type: "MusicArtist",
                        IsFolder: !0,
                      })
                    );
                return html;
              })(itemInfo).join(", "))),
          (primaryNameHtml = primaryNameHtml || primaryNameText),
          !(function (item, originalItem, title) {
            originalItem =
              logoImageUrl(item, _connectionmanager.default.getApiClient(item.ServerId), {}) ||
              logoImageUrl(originalItem, _connectionmanager.default.getApiClient(originalItem.ServerId), {});
            {
              var pageTitle;
              originalItem
                ? (_appheader.default.setTitle(""),
                  ((pageTitle = document.querySelector(".pageTitle")).style.backgroundImage =
                    "url('" + originalItem + "')"),
                  pageTitle.classList.add("pageTitleWithLogo"),
                  pageTitle.classList.remove("pageTitleWithDefaultLogo"),
                  (pageTitle.innerHTML = ""))
                : _appheader.default.setTitle("");
            }
            originalItem = title || (item ? item.Name : null);
            originalItem && (document.title = originalItem);
          })(itemInfo, item, primaryNameText),
          !(function (displayItem, item, displayingLocalVideo, mediaType) {
            var headerElement = self.headerElement;
            if (displayingLocalVideo)
              return (
                _backdrop.default.clear(),
                view.classList.add("darkContentContainer", "graphicContentContainer"),
                headerElement.classList.add("headroom-scrolling"),
                clearBlurFromDocumentElement(self)
              );
            if (
              ((displayingLocalVideo = [displayItem]),
              item.Id !== displayItem.Id && displayingLocalVideo.push(item),
              (displayItem =
                "Video" === mediaType ? "nowPlayingVideoBackgroundStyle" : "nowPlayingAudioBackgroundStyle"),
              "blur" === _usersettings.default[displayItem]() &&
                (item = (displayingLocalVideo = getDetailImageItemsSync().Items)[0]))
            ) {
              mediaType = _cardbuilder.default.getImageUrl(item, _connectionmanager.default.getApiClient(item), {
                width: 100,
                adjustForPixelRatio: !1,
              }).imgUrl;
              if (mediaType)
                return (
                  _backdrop.default.setBackdrop(mediaType),
                  mediaType
                    ? (view.classList.add("darkContentContainer"),
                      view.classList.remove("graphicContentContainer"),
                      headerElement.classList.remove("headroom-scrolling"),
                      document.documentElement.classList.add("doc-nowplaying-blur"))
                    : (view.classList.remove("darkContentContainer", "graphicContentContainer"),
                      headerElement.classList.remove("headroom-scrolling"),
                      clearBlurFromDocumentElement(self))
                );
            }
            _backdrop.default.setBackdrops(displayingLocalVideo),
              clearBlurFromDocumentElement(self),
              headerElement.classList.remove("headroom-scrolling"),
              _backdrop.default.hasBackdrop()
                ? view.classList.add("darkContentContainer", "graphicContentContainer")
                : view.classList.remove("darkContentContainer", "graphicContentContainer");
          })(itemInfo, item, displayingLocalVideo, item.MediaType),
          displayingLocalVideo ? setPoster(null) : setPoster(itemInfo),
          (primaryNameText = osdTitle),
          (secondaryName =
            "Audio" === item.MediaType
              ? ((item = primaryNameHtml), (primaryNameHtml = secondaryName = getSecondaryName(itemInfo, !1)), item)
              : getSecondaryName(itemInfo, !displayingLocalVideo)),
          primaryNameHtml || ((primaryNameHtml = secondaryName), (secondaryName = null)),
          (videoOsdParentTitle.innerHTML = primaryNameHtml),
          (videoOsdParentTitleLarge.innerHTML = primaryNameHtml)
            ? videoOsdSecondaryText.classList.add("videoOsdSecondaryText-withparentname")
            : videoOsdSecondaryText.classList.remove("videoOsdSecondaryText-withparentname"),
          secondaryName || itemInfo.Type,
          (primaryNameText.innerHTML = secondaryName)
            ? primaryNameText.classList.remove("hide")
            : primaryNameText.classList.add("hide"),
          videoOsdSecondaryMediaInfo),
        primaryNameHtml =
          "Audio" === itemInfo.MediaType || ("Program" !== itemInfo.Type && !secondaryName)
            ? _mediainfo.default.getMediaInfoHtml(itemInfo, {
                runtime: !1,
                endsAt: !1,
                container: !displayingLocalVideo,
                year: "Audio" !== itemInfo.MediaType,
                CommunityRating: !1,
                criticRating: !1,
              })
            : _mediainfo.default.getSecondaryMediaInfoHtml(itemInfo, {startDate: !1, programTime: !1});
      "Audio" === itemInfo.MediaType && itemInfo.Album && itemInfo.AlbumId
        ? ((videoOsdThirdTitle.innerHTML = getTextActionButton({
            Type: "MusicAlbum",
            Id: itemInfo.AlbumId,
            ServerId: itemInfo.ServerId,
            Name: itemInfo.Album,
          })),
          videoOsdThirdTitle.classList.remove("hide"))
        : videoOsdThirdTitle.classList.add("hide"),
        (function (item) {
          for (
            var mediaStreams =
                ((((item = item && "Audio" !== item.MediaType ? null : item) || {}).MediaSources || [])[0] || {})
                  .MediaStreams || [],
              i = 0,
              length = mediaStreams.length;
            i < length;
            i++
          )
            if ("Subtitle" === mediaStreams[i].Type) return btnLyrics.classList.remove("hide");
          btnLyrics.classList.add("hide"),
            "lyrics" === currentOsdContentSectionName && setContentSection(getDefaultOsdContentSection(), !1);
        })(itemInfo),
        (item.innerHTML = primaryNameHtml) ? item.classList.remove("hide") : item.classList.add("hide"),
        (programEndDateMs = enableProgressByTimeOfDay
          ? (setDisplayTime(videoOsdPositionText, itemInfo.StartDate),
            setDisplayTime(videoOsdDurationText, itemInfo.EndDate),
            (programStartDateMs = itemInfo.StartDate
              ? _datetime.default.parseISO8601Date(itemInfo.StartDate).getTime()
              : 0),
            itemInfo.EndDate ? _datetime.default.parseISO8601Date(itemInfo.EndDate).getTime() : 0)
          : (programStartDateMs = 0));
      for (
        var introStart,
          introEnd,
          primaryNameText = self.lyricsRenderer,
          chapters = (primaryNameText && primaryNameText.updateItem(itemInfo), itemInfo.Chapters || []),
          i = 0,
          length = chapters.length;
        i < length;
        i++
      ) {
        var chapter = chapters[i];
        "IntroStart" === chapter.MarkerType
          ? ((introStart = chapter.StartPositionTicks),
            i < chapters.length - 1 && (introEnd = chapters[i + 1].StartPositionTicks))
          : "IntroEnd" === chapter.MarkerType && (introEnd = chapter.StartPositionTicks);
      }
      currentIntroInfo = null != introStart && introEnd ? {start: introStart, end: introEnd} : null;
    }
    function getDisplayTimeWithoutAmPm(date, showSeconds) {
      return (
        showSeconds
          ? _datetime.default.toLocaleTimeString(date, {hour: "numeric", minute: "2-digit", second: "2-digit"})
          : _datetime.default.getDisplayTime(date)
      )
        .toLowerCase()
        .replace("am", "")
        .replace("pm", "")
        .trim();
    }
    function setDisplayTime(elem, date) {
      var html;
      date && (html = getDisplayTimeWithoutAmPm((date = _datetime.default.parseISO8601Date(date)))),
        (elem.innerHTML = html || "");
    }
    function supportsSubtitleDownloading() {
      return -1 !== currentPlayerSupportedCommands.indexOf("RefreshMediaSource");
    }
    function updateNowPlayingInfo(player, state) {
      var item = state.NowPlayingItem;
      if (((self.currentItem = item), (currentItemThumbnails = currentItemThumbnailsPromise = null), !item))
        return (
          (ratingTextNeedsUpdate = !(currentIntroInfo = currentDisplayChapters = currentDisplayItem = null)),
          setPoster((currentMediaSource = null)),
          updateRecordingButton(null),
          _appheader.default.setTitle(""),
          (nowPlayingVolumeSlider.disabled = !0),
          (self.nowPlayingPositionSlider.disabled = !0),
          btnFastForward.classList.add("hide"),
          btnRewind.classList.add("hide"),
          btnSubtitles.classList.add("hide"),
          btnAudio.classList.add("hide"),
          ratingInfoContainer.classList.add("hide"),
          updateButtomTabsVisibility(null, null),
          (osdTitle.innerHTML = ""),
          void (view.querySelector(".videoOsdMediaInfo").innerHTML = "")
        );
      (currentMediaSource = state.MediaSource),
        (enableProgressByTimeOfDay = (function (item, mediaSource) {
          return !("TvChannel" !== item.Type || !item.CurrentProgram || !mediaSource || mediaSource.RunTimeTicks);
        })(item, state.MediaSource)),
        (function (item) {
          if (!item.Id) return Promise.resolve({originalItem: item});
          var apiClient = _connectionmanager.default.getApiClient(item.ServerId);
          return apiClient.getItem(apiClient.getCurrentUserId(), item.Id).then(function (refreshedItem) {
            return {originalItem: refreshedItem, displayItem: refreshedItem.CurrentProgram || refreshedItem};
          });
        })(item).then(updateDisplayItem),
        (nowPlayingVolumeSlider.disabled = !1),
        (self.nowPlayingPositionSlider.disabled = !1),
        (btnFastForward.disabled = !1),
        "Video" === item.MediaType || item.SupportsResume
          ? (btnFastForward.classList.remove("hide"), btnRewind.classList.remove("hide"))
          : (btnFastForward.classList.add("hide"), btnRewind.classList.add("hide")),
        1 < _playbackmanager.default.audioTracks(player).length
          ? btnAudio.classList.remove("hide")
          : btnAudio.classList.add("hide");
      state = _connectionmanager.default.getApiClient(item);
      state.getCurrentUser().then(function (user) {
        (enableSkipIntro = "None" !== user.Configuration.IntroSkipMode),
          (enableAutoSkipIntro = "AutoSkip" === user.Configuration.IntroSkipMode),
          enableSkipIntro && validateSkipIntroFeature({showDialog: !1}, !0),
          _playbackmanager.default.subtitleTracks(player).length ||
          (_itemhelper.default.canDownloadSubtitles(user, item) && supportsSubtitleDownloading())
            ? btnSubtitles.classList.remove("hide")
            : btnSubtitles.classList.add("hide");
      });
    }
    function setPoster(item) {
      var posterContainer = osdPosterContainer;
      item
        ? (posterContainer.classList.remove("hide"), posterContainer.resume({refresh: !0}))
        : (posterContainer.classList.add("hide"), (posterContainer.innerHTML = ""));
    }
    _layoutmanager.default.tv
      ? osdButtons.classList.add("videoOsdBottom-buttons-tv")
      : (videoOsdPositionText.classList.add("videoOsd-customFont"),
        videoOsdDurationText.classList.add("videoOsd-customFont"),
        ratingTextElement.classList.add("videoOsd-customFont"),
        osdButtons.classList.add("videoOsd-customFont"),
        btnSkipIntro.classList.add("videoOsd-customFont")),
      setRewindIcon(btnRewind),
      setForwardIcon(btnFastForward),
      _dom.default.addEventListener(self.btnRewindIcon, _dom.default.whichAnimationEvent(), onRewindAnimationComplete, {
        passive: !0,
      }),
      _dom.default.addEventListener(
        self.btnRewindIcon,
        _dom.default.whichAnimationCancelEvent(),
        onRewindAnimationComplete,
        {passive: !0}
      ),
      _dom.default.addEventListener(
        self.btnFastForwardIcon,
        _dom.default.whichAnimationEvent(),
        onFastForwardAnimationComplete,
        {passive: !0}
      ),
      _dom.default.addEventListener(
        self.btnFastForwardIcon,
        _dom.default.whichAnimationCancelEvent(),
        onFastForwardAnimationComplete,
        {passive: !0}
      );
    var endEditTimeoutForPositionSlider,
      itemsContainer,
      nowPlayingSliderValue = 0,
      nowPlayingSliderRunTimeTicks = 0;
    function endEditsForPositionSlider() {
      self.nowPlayingPositionSlider.endEditing(!0, nowPlayingSliderValue);
    }
    function clearEndEditTimeoutForPositionSlider() {
      endEditTimeoutForPositionSlider &&
        (clearTimeout(endEditTimeoutForPositionSlider), (endEditTimeoutForPositionSlider = null));
    }
    function startEndEditTimeoutForPositionSlider() {
      clearEndEditTimeoutForPositionSlider(),
        (endEditTimeoutForPositionSlider = setTimeout(endEditsForPositionSlider, 800));
    }
    function convertMsToNowPlayingSliderStep(ms) {
      return nowPlayingSliderRunTimeTicks
        ? ((1e4 * ms) / nowPlayingSliderRunTimeTicks) * 100
        : self.nowPlayingPositionSlider.step;
    }
    function cancelPositionSliderEditing() {
      clearEndEditTimeoutForPositionSlider();
      var elem = self.nowPlayingPositionSlider;
      elem.dragging && elem.cancelEditing();
    }
    function updateFullscreenIcon() {
      var title;
      _playbackmanager.default.isFullscreen(self.currentPlayer)
        ? ((title = _globalize.default.translate("ExitFullscreen")),
          (btnFullscreen.querySelector("i").innerHTML = "&#xE5D1;"))
        : ((title = _globalize.default.translate("Fullscreen")),
          (btnFullscreen.querySelector("i").innerHTML = "&#xE5D0;")),
        (btnFullscreen.title = title),
        btnFullscreen.setAttribute("aria-label", title);
    }
    function updateTransparency(player, mediaType) {
      var player = isDisplayingLocalVideo(player, mediaType),
        headerElement =
          (console.log("updateTransparency: isLocalVideo:" + player + ", mediaType:" + mediaType),
          _layoutmanager.default.tv
            ? (videoOsdSecondaryText.classList.add("videoOsdSecondaryText-tv"),
              videoOsdParentTitleLarge.classList.remove("videoOsdParentTitle-larger"))
            : (videoOsdSecondaryText.classList.remove("videoOsdSecondaryText-tv"),
              videoOsdParentTitleLarge.classList.add("videoOsdParentTitle-larger")),
          self.headerElement),
        videoOsdText = self.videoOsdText,
        backgroundContainer = self.backgroundContainer,
        backdropContainer = self.backdropContainer,
        bottomTabs = self.bottomTabs,
        osdBottomElement = self.osdBottomElement,
        nowPlayingPositionSlider = self.nowPlayingPositionSlider,
        backgroundContainer =
          (player
            ? (self.currentVisibleMenu ||
                (headerElement.classList.add("videoOsdHeader-hidden", "hide"),
                osdBottomElement.classList.add("hide", "videoOsdBottom-hidden")),
              osdBottomElement.classList.add("videoOsdBottom-video"),
              osdPosterContainer.classList.remove("osdPosterContainer-autoexpand"),
              videoOsdSecondaryText.classList.remove("videoOsdSecondaryText-remotecontrol"),
              videoOsdBottomMaincontrols.classList.remove("videoOsdBottomMaincontrols-autoexpand"),
              videoOsdPositionContainer.classList.remove("videoOsdPositionContainer-autosmall"),
              videoOsdPositionContainer.classList.add("focuscontainer-x"),
              tabContainersElem.classList.remove("videoosd-tabcontainers-autosmall"),
              bottomTabs.classList.remove("videoOsdBottom-tabs-remotecontrol"),
              videoOsdVolumeControls.classList.add(
                "videoOsdVolumeControls-showhover",
                "videoOsdVolumeControls-hidetouch"
              ),
              videoOsdParentTitle.classList.add("hide"),
              videoOsdParentTitleLarge.classList.remove("hide"),
              _approuter.default.setTransparency("full"),
              hideOrShowAll(self, stopButtons, !0, null),
              videoOsdText.classList.remove("videoOsdText-remotecontrol", "videoOsdText-autosmall"),
              osdButtons.classList.remove("videoOsdBottom-buttons-remotecontrol"),
              osdBottomElement.classList.remove(
                "videoOsdBottom-remotecontrol",
                "videoOsdBottom-full",
                "padded-top-page",
                "videoOsdBottom-tvnowplaying"
              ),
              view.classList.remove("justify-content-flex-end"),
              osdTitle.classList.remove("secondaryText"),
              videoOsdSecondaryMediaInfo.classList.remove("videoOsdSecondaryMediaInfo-remotecontrol"),
              videoOsdPositionText.classList.remove("videoOsd-customFont-remotecontrol"),
              videoOsdDurationText.classList.remove("videoOsd-customFont-remotecontrol"),
              osdButtons.classList.remove("videoOsd-customFont-remotecontrol"),
              headerElement.classList.remove("videoOsd-customFont-remotecontrol", "videoOsdHeader-tvnowplaying"),
              videoOsdBottomContentbuttons.classList.add("hide"),
              videoOsdBottomContentbuttons.classList.remove(
                "videoOsd-customFont",
                "videoOsd-customFont-remotecontrol",
                "videoOsdBottom-contentbuttons-tv"
              ),
              videoOsdVolumeSliderWrapper.classList.remove("videoOsdVolumeSliderWrapper-customfont"),
              buttonMute.classList.remove("btnMuteOSD-remotecontrol"),
              videoOsdButtomButtonsRight.classList.remove("videoOsdBottom-buttons-right-remotecontrol"),
              videoOsdPositionSliderContainer.classList.remove("videoOsdPositionSliderContainer-limitwidth"),
              backdropContainer.classList.remove(
                "nowplaying-backdropcontainer-blur",
                "nowplaying-backdropcontainer-blur-high",
                "nowplaying-backdropcontainer-blur-extrasaturation",
                "nowplaying-backdropcontainer-blur-backdropfilter"
              ),
              backgroundContainer.classList.remove(
                "nowplaying-backgroundcontainer-blur",
                "nowplaying-backgroundcontainer-blur-backdropfilter"
              ),
              backgroundContainer.classList.remove("nowplaying-backgroundcontainer-brighter"),
              videoOsdPositionText.classList.remove("secondaryText"),
              videoOsdDurationText.classList.remove("secondaryText"),
              nowPlayingPositionSlider.getTrackBackgroundElement().classList.add("videoOsdPositionSlider-large"),
              nowPlayingPositionSlider.getThumbElement().classList.add("videoOsdPositionSlider-thumb-large"),
              (self.enableStopOnBack = !0),
              (self.enableBackOnStop = !0),
              btnOsdMoreTitle.classList.add("hide"),
              btnOsdMoreBottom.classList.add("hide"))
            : (osdTitle.classList.add("secondaryText"),
              osdBottomElement.classList.remove("videoOsdBottom-video", "videoOsdBottom-hidden", "hide"),
              self.showOsd(),
              "blur" ===
              _usersettings.default[
                "Video" === mediaType ? "nowPlayingVideoBackgroundStyle" : "nowPlayingAudioBackgroundStyle"
              ]()
                ? (backdropContainer.classList.add("nowplaying-backdropcontainer-blur"),
                  enableHighResBlur && backdropContainer.classList.add("nowplaying-backdropcontainer-blur-high"),
                  _browser.default.chrome
                    ? backdropContainer.classList.add("nowplaying-backdropcontainer-blur-extrasaturation")
                    : backdropContainer.classList.remove("nowplaying-backdropcontainer-blur-extrasaturation"),
                  backgroundContainer.classList.add("nowplaying-backgroundcontainer-blur"),
                  useBackdropFilterForBlur &&
                    (backgroundContainer.classList.add("nowplaying-backgroundcontainer-blur-backdropfilter"),
                    backdropContainer.classList.add("nowplaying-backdropcontainer-blur-backdropfilter")),
                  backgroundContainer.classList.remove("nowplaying-backgroundcontainer-brighter"))
                : (backdropContainer.classList.remove(
                    "nowplaying-backdropcontainer-blur",
                    "nowplaying-backdropcontainer-blur-high",
                    "nowplaying-backdropcontainer-blur-extrasaturation",
                    "nowplaying-backdropcontainer-blur-backdropfilter"
                  ),
                  backgroundContainer.classList.remove(
                    "nowplaying-backgroundcontainer-blur",
                    "nowplaying-backgroundcontainer-blur-backdropfilter"
                  ),
                  backgroundContainer.classList.add("nowplaying-backgroundcontainer-brighter")),
              videoOsdParentTitleLarge.classList.add("hide"),
              videoOsdParentTitle.classList.remove("hide"),
              _layoutmanager.default.tv
                ? (osdBottomElement.classList.add(
                    "videoOsdBottom-full",
                    "padded-top-page",
                    "videoOsdBottom-tvnowplaying",
                    "videoOsdBottom-remotecontrol"
                  ),
                  view.classList.remove("justify-content-flex-end"),
                  nowPlayingPositionSlider.getTrackBackgroundElement().classList.add("videoOsdPositionSlider-large"),
                  nowPlayingPositionSlider.getThumbElement().classList.add("videoOsdPositionSlider-thumb-large"),
                  videoOsdText.classList.add("videoOsdText-remotecontrol"),
                  videoOsdText.classList.remove("videoOsdText-autosmall"),
                  videoOsdSecondaryMediaInfo.classList.add("videoOsdSecondaryMediaInfo-remotecontrol"),
                  osdPosterContainer.classList.remove("osdPosterContainer-autoexpand"),
                  videoOsdSecondaryText.classList.add("videoOsdSecondaryText-remotecontrol"),
                  osdButtons.classList.remove("videoOsdBottom-buttons-remotecontrol"),
                  videoOsdBottomMaincontrols.classList.remove("videoOsdBottomMaincontrols-autoexpand"),
                  videoOsdPositionContainer.classList.add("focuscontainer-x"),
                  videoOsdPositionContainer.classList.remove("videoOsdPositionContainer-autosmall"),
                  tabContainersElem.classList.remove("videoosd-tabcontainers-autosmall"),
                  bottomTabs.classList.add("videoOsdBottom-tabs-remotecontrol"),
                  videoOsdPositionText.classList.remove("videoOsd-customFont-remotecontrol"),
                  videoOsdDurationText.classList.remove("videoOsd-customFont-remotecontrol"),
                  osdButtons.classList.remove("videoOsd-customFont-remotecontrol"),
                  headerElement.classList.remove("videoOsd-customFont-remotecontrol"),
                  headerElement.classList.add("videoOsdHeader-tvnowplaying"),
                  videoOsdBottomContentbuttons.classList.add("videoOsdBottom-contentbuttons-tv"),
                  videoOsdBottomContentbuttons.classList.remove(
                    "hide",
                    "videoOsd-customFont",
                    "videoOsd-customFont-remotecontrol"
                  ),
                  videoOsdVolumeSliderWrapper.classList.remove("videoOsdVolumeSliderWrapper-customfont"),
                  videoOsdVolumeControls.classList.add(
                    "videoOsdVolumeControls-showhover",
                    "videoOsdVolumeControls-hidetouch"
                  ),
                  buttonMute.classList.remove("btnMuteOSD-remotecontrol"),
                  videoOsdButtomButtonsRight.classList.remove("videoOsdBottom-buttons-right-remotecontrol"),
                  videoOsdPositionSliderContainer.classList.remove("videoOsdPositionSliderContainer-limitwidth"),
                  videoOsdPositionText.classList.add("secondaryText"),
                  videoOsdDurationText.classList.add("secondaryText"),
                  btnOsdMoreTitle.classList.add("hide"),
                  btnOsdMoreBottom.classList.remove("hide"))
                : (osdBottomElement.classList.add(
                    "videoOsdBottom-remotecontrol",
                    "videoOsdBottom-full",
                    "padded-top-page"
                  ),
                  view.classList.remove("justify-content-flex-end"),
                  osdPosterContainer.classList.add("osdPosterContainer-autoexpand"),
                  nowPlayingPositionSlider.getTrackBackgroundElement().classList.remove("videoOsdPositionSlider-large"),
                  nowPlayingPositionSlider.getThumbElement().classList.remove("videoOsdPositionSlider-thumb-large"),
                  videoOsdText.classList.add("videoOsdText-remotecontrol", "videoOsdText-autosmall"),
                  videoOsdSecondaryMediaInfo.classList.add("videoOsdSecondaryMediaInfo-remotecontrol"),
                  videoOsdBottomMaincontrols.classList.add("videoOsdBottomMaincontrols-autoexpand"),
                  videoOsdPositionContainer.classList.add("videoOsdPositionContainer-autosmall"),
                  videoOsdPositionContainer.classList.remove("focuscontainer-x"),
                  tabContainersElem.classList.add("videoosd-tabcontainers-autosmall"),
                  bottomTabs.classList.add("videoOsdBottom-tabs-remotecontrol"),
                  videoOsdSecondaryText.classList.add("videoOsdSecondaryText-remotecontrol"),
                  osdButtons.classList.add("videoOsdBottom-buttons-remotecontrol"),
                  videoOsdPositionText.classList.add("videoOsd-customFont-remotecontrol"),
                  videoOsdDurationText.classList.add("videoOsd-customFont-remotecontrol"),
                  osdButtons.classList.add("videoOsd-customFont-remotecontrol"),
                  headerElement.classList.add("videoOsd-customFont-remotecontrol"),
                  headerElement.classList.remove("videoOsdHeader-tvnowplaying"),
                  videoOsdBottomContentbuttons.classList.remove("hide", "videoOsdBottom-contentbuttons-tv"),
                  videoOsdBottomContentbuttons.classList.add(
                    "videoOsd-customFont",
                    "videoOsd-customFont-remotecontrol"
                  ),
                  videoOsdVolumeSliderWrapper.classList.add("videoOsdVolumeSliderWrapper-customfont"),
                  videoOsdVolumeControls.classList.remove("videoOsdVolumeControls-showhover"),
                  buttonMute.classList.add("btnMuteOSD-remotecontrol"),
                  videoOsdButtomButtonsRight.classList.add("videoOsdBottom-buttons-right-remotecontrol"),
                  videoOsdPositionSliderContainer.classList.add("videoOsdPositionSliderContainer-limitwidth"),
                  videoOsdPositionText.classList.add("secondaryText"),
                  videoOsdDurationText.classList.add("secondaryText"),
                  btnOsdMoreTitle.classList.remove("hide"),
                  btnOsdMoreBottom.classList.add("hide")),
              _approuter.default.setTransparency(0),
              hideOrShowAll(self, stopButtons, !1, null),
              (self.enableStopOnBack = !1),
              (self.enableBackOnStop = !0)),
          player
            ? (destroyPlayQueue(self), destroyLyricsRenderer(self))
            : (self.lyricsRenderer ||
                (self.lyricsRenderer = new _lyrics.default({parent: view.querySelector(".lyricsSection")})),
              self.playQueue ||
                ((mediaType = view.querySelector(".osdPlayQueue")),
                (backdropContainer = _usersettings.default.osdContentSection() || getDefaultOsdContentSection()),
                _layoutmanager.default.tv
                  ? ((self.playQueue = new _tvplayqueue.default({parent: mediaType})),
                    (backdropContainer = "playqueue"))
                  : (self.playQueue = new _playqueue.default({parent: mediaType})),
                setContentSection(
                  (backdropContainer =
                    "lyrics" === backdropContainer ? getDefaultOsdContentSection() : backdropContainer),
                  !1
                ))),
          self.btnPause);
      player && !_layoutmanager.default.tv
        ? (centerButtons.classList.add("videoOsd-centerButtons-autolayout"),
          backgroundContainer.classList.add("videoOsd-btnPause-autolayout"),
          stopButtons[0].classList.add("btnVideoOsd-stop-center-autolayout"),
          stopButtons[1].classList.add("btnVideoOsd-stop-bottom-autolayout"))
        : (centerButtons.classList.remove("videoOsd-centerButtons-autolayout"),
          backgroundContainer.classList.remove("videoOsd-btnPause-autolayout"),
          stopButtons[0].classList.remove("btnVideoOsd-stop-center-autolayout"),
          stopButtons[1].classList.remove("btnVideoOsd-stop-bottom-autolayout"));
    }
    function getDetailImageItemsSync() {
      var item = currentDisplayItem,
        items = [];
      return (
        item &&
          (item.SeriesPrimaryImageTag &&
            (item = {
              Id: item.SeriesId,
              Name: item.SeriesName,
              ServerId: item.ServerId,
              ImageTags: {Primary: item.SeriesPrimaryImageTag},
              IsFolder: !0,
              PrimaryImageAspectRatio: 2 / 3,
            }),
          items.push(item)),
        {Items: items, TotalRecordCount: items.length}
      );
    }
    function getDetailImageItems() {
      return Promise.resolve(getDetailImageItemsSync());
    }
    function getDetailImageListOptions(items) {
      var cardClass = "osdRemoteControlImageCard";
      return (
        _layoutmanager.default.tv || (cardClass += " osdRemoteControlImageCard-automargin"),
        {
          renderer: _cardbuilder.default,
          options: {
            overlayText: !0,
            fields: [],
            action: "none",
            multiSelect: !1,
            contextMenu: !_layoutmanager.default.tv,
            ratingButton: !_layoutmanager.default.tv,
            playedButton: !1,
            cardClass: cardClass,
            cardBoxClass: "osdRemoteControlImageCardBox",
            cardContentClass: "osdRemoteControlImageCardContent",
            defaultIcon: !0,
            typeIndicator: !1,
            playedIndicator: !1,
            syncIndicator: !1,
            timerIndicator: !1,
            randomDefaultBackground: !1,
            staticElement: !0,
            progress: !1,
            hoverPlayButton: !1,
            moreButton: !1,
            enableUserData: !_layoutmanager.default.tv,
            shape: "auto",
          },
          virtualScrollLayout: "vertical-grid",
        }
      );
    }
    function onStateChanged(event, state) {
      state.NowPlayingItem &&
        ((isEnabled = !0),
        (function (player, state) {
          var playState = state.PlayState || {},
            supportedCommands =
              (updatePlayPauseState(playState.IsPaused), _playbackmanager.default.getSupportedCommands(player)),
            nowPlayingPositionSlider =
              ((currentPlayerSupportedCommands = supportedCommands),
              updatePlayerVolumeState(0, playState.IsMuted, playState.VolumeLevel, supportedCommands),
              (function (player) {
                var showSlider = !_layoutmanager.default.tv && currentPlayerSupportedCommands.includes("SetBrightness");
                brightnessSlider &&
                  (showSlider
                    ? (brightnessSliderContainer.classList.remove("hide"),
                      brightnessSlider.dragging ||
                        brightnessSlider.setValue(_playbackmanager.default.getBrightness(player)))
                    : brightnessSliderContainer.classList.add("hide"));
              })(player),
              self.nowPlayingPositionSlider);
          nowPlayingPositionSlider &&
            !nowPlayingPositionSlider.dragging &&
            (nowPlayingPositionSlider.disabled = !playState.CanSeek);
          (btnFastForward.disabled = !playState.CanSeek), (btnRewind.disabled = !playState.CanSeek);
          var nowPlayingItem = state.NowPlayingItem || {},
            displayingLocalVideo = isDisplayingLocalVideo(player, nowPlayingItem.MediaType),
            focusedElement =
              (updateTransparency(player, nowPlayingItem.MediaType),
              (playbackStartTimeTicks = playState.PlaybackStartTimeTicks),
              updateTimeDisplay(
                playState.PositionTicks,
                nowPlayingItem.RunTimeTicks,
                playState.PlaybackStartTimeTicks,
                playState.BufferedRanges || []
              ),
              updateNowPlayingInfo(player, state),
              document.activeElement);
          state.MediaSource
            ? displayingLocalVideo || _layoutmanager.default.tv
              ? (hideButton(btnVideoOsdSettingsTransportButton, focusedElement),
                self.btnVideoOsdSettingsRight.classList.remove("hide"))
              : (btnVideoOsdSettingsTransportButton.classList.remove("hide"),
                hideButton(self.btnVideoOsdSettingsRight, focusedElement))
            : (hideButton(self.btnVideoOsdSettingsRight, focusedElement),
              hideButton(btnVideoOsdSettingsTransportButton, focusedElement));
          var isProgressClear = state.MediaSource && null == state.MediaSource.RunTimeTicks;
          nowPlayingPositionSlider.setIsClear(isProgressClear),
            !supportedCommands.includes("ToggleFullscreen") ||
            !displayingLocalVideo ||
            (player.isLocalPlayer && _layoutmanager.default.tv && _playbackmanager.default.isFullscreen(player))
              ? hideButton(btnFullscreen, focusedElement)
              : btnFullscreen.classList.remove("hide");
          !supportedCommands.includes("PictureInPicture") || _browser.default.web0s || _layoutmanager.default.tv
            ? hideButton(view.querySelector(".btnPip"), focusedElement)
            : view.querySelector(".btnPip").classList.remove("hide");
          updateRepeatModeDisplay(playState.RepeatMode),
            supportedCommands.includes("SetRepeatMode") &&
            "Video" !== nowPlayingItem.MediaType &&
            _layoutmanager.default.tv
              ? btnRepeatMode.classList.remove("hide")
              : hideButton(btnRepeatMode, focusedElement);
          updateFullscreenIcon();
          (nowPlayingPositionSlider = state.PlaylistIndex),
            (isProgressClear = state.PlaylistLength),
            updatePlaylistButtons(nowPlayingPositionSlider, isProgressClear, focusedElement),
            (displayingLocalVideo = self.playQueue);
          displayingLocalVideo &&
            ((playState = state.PlaylistItemId),
            displayingLocalVideo.updatePlaylist(player, playState, nowPlayingPositionSlider, isProgressClear));
        })(this, state));
    }
    function onPlayPauseStateChanged(e) {
      isEnabled && updatePlayPauseState(this.paused());
    }
    function onVolumeChanged(e) {
      isEnabled && updatePlayerVolumeState(0, this.isMuted(), this.getVolume());
    }
    function onPlaybackStart(e, state) {
      console.log("nowplaying event: " + e.type);
      onStateChanged.call(this, e, state),
        setTimeout(resetUpNextDialog, 300),
        resetRatingText(),
        showHideSkipIntro(!1),
        self.bottomTabs.selectedIndex(-1);
    }
    function onRepeatModeChange(e) {
      updateRepeatModeDisplay(_playbackmanager.default.getRepeatMode(this));
    }
    function onSubtitleTrackChange() {
      destroySubtitleOffsetOverlay(self);
    }
    function onPlaylistItemAdd(e) {
      var playlistItemId,
        playlistIndex = _playbackmanager.default.getCurrentPlaylistIndex(this),
        playlistLength = _playbackmanager.default.getCurrentPlaylistLength(this),
        playQueue = (updatePlaylistButtons(playlistIndex, playlistLength, document.activeElement), self.playQueue);
      playQueue &&
        ((playlistItemId = _playbackmanager.default.getCurrentPlaylistItemId(this)),
        playQueue.updatePlaylist(this, playlistItemId, playlistIndex, playlistLength));
    }
    function onPlaylistItemMove(e, info) {
      updatePlaylistButtons(
        _playbackmanager.default.getCurrentPlaylistIndex(this),
        _playbackmanager.default.getCurrentPlaylistLength(this),
        document.activeElement
      );
      var playQueue = self.playQueue;
      playQueue && playQueue.onPlaylistItemMoved(this, e, info);
    }
    function onPlaylistItemRemove(e, info) {
      updatePlaylistButtons(
        _playbackmanager.default.getCurrentPlaylistIndex(this),
        _playbackmanager.default.getCurrentPlaylistLength(this),
        document.activeElement
      );
      var playQueue = self.playQueue;
      playQueue && playQueue.onPlaylistItemRemoved(this, e, info);
    }
    function resetUpNextDialog() {
      (comingUpNextDisplayed = !1),
        currentUpNextDialog && (currentUpNextDialog.destroy(), (currentUpNextDialog = null));
    }
    function onPlaybackStopped(e, state) {
      (currentRuntimeTicks = null),
        resetUpNextDialog(),
        resetRatingText(),
        showHideSkipIntro(!1),
        console.log("nowplaying event: " + e.type),
        state.NextMediaType ||
          ((e = self.playQueue) && e.onPlaybackStopped(),
          (state = self.lyricsRenderer) && state.onPlaybackStopped(),
          (self.enableStopOnBack = !1),
          self.enableBackOnStop && ((self.enableBackOnStop = !1), self.exit()));
    }
    function onMediaStreamsChanged(e) {
      var state = _playbackmanager.default.getPlayerState(this);
      onStateChanged.call(this, {type: "init"}, state);
    }
    function releaseCurrentPlayer() {
      destroyStats(self),
        destroySubtitleOffsetOverlay(self),
        resetUpNextDialog(),
        resetRatingText(),
        showHideSkipIntro(!1);
      var player = self.currentPlayer;
      player &&
        (_events.default.off(player, "playbackstart", onPlaybackStart),
        _events.default.off(player, "playbackstop", onPlaybackStopped),
        _events.default.off(player, "volumechange", onVolumeChanged),
        _events.default.off(player, "pause", onPlayPauseStateChanged),
        _events.default.off(player, "unpause", onPlayPauseStateChanged),
        _events.default.off(player, "timeupdate", onTimeUpdate),
        _events.default.off(player, "fullscreenchange", updateFullscreenIcon),
        _events.default.off(player, "mediastreamschange", onMediaStreamsChanged),
        _events.default.off(player, "statechange", onStateChanged),
        _events.default.off(player, "repeatmodechange", onRepeatModeChange),
        _events.default.off(player, "subtitletrackchange", onSubtitleTrackChange),
        _events.default.off(player, "playlistitemadd", onPlaylistItemAdd),
        _events.default.off(player, "playlistitemmove", onPlaylistItemMove),
        _events.default.off(player, "playlistitemremove", onPlaylistItemRemove),
        (self.currentPlayer = null));
    }
    function resetRatingText() {
      ratingInfoContainer.classList.add("hide"), (ratingTextNeedsUpdate = !0);
    }
    function showHideSkipIntro(show) {
      show
        ? btnSkipIntro._visible ||
          ((btnSkipIntro._visible = !0),
          btnSkipIntro.classList.remove("hide"),
          self.currentVisibleMenu ||
            (_focusmanager.default.focus(btnSkipIntro), enableAutoSkipIntro && btnSkipIntro.click()))
        : btnSkipIntro._visible &&
          ((btnSkipIntro._visible = !1),
          (show = !!self.currentVisibleMenu && btnSkipIntro === document.activeElement),
          btnSkipIntro.classList.add("hide"),
          show && focusMainOsdControls(self));
    }
    function validateSkipIntroFeature(options, incrementAppSettings) {
      return require(["registrationServices"]).then(function (responses) {
        return responses[0].validateFeature("dvr", Object.assign({viewOnly: !0}, options)).then(
          function () {
            (skipIntroValidated = !0), _appsettings.default.introSkipDisplayCount(0);
          },
          function (err) {
            return (
              (skipIntroValidated = !1),
              incrementAppSettings &&
                _appsettings.default.introSkipDisplayCount(_appsettings.default.introSkipDisplayCount() + 1),
              Promise.reject(err)
            );
          }
        );
      });
    }
    function onTimeUpdate(e) {
      var now, item;
      !isEnabled ||
        (now = Date.now()) - lastUpdateTime < 700 ||
        ((lastUpdateTime = now),
        (currentRuntimeTicks = _playbackmanager.default.duration(this)),
        (function (currentTime) {
          var introInfo = currentIntroInfo;
          if (
            introInfo &&
            enableSkipIntro &&
            currentTime >= introInfo.start &&
            currentTime < introInfo.end &&
            (!1 !== skipIntroValidated || _appsettings.default.introSkipDisplayCount() < 5)
          )
            return !0 === skipIntroValidated && _appsettings.default.introSkipDisplayCount(0), showHideSkipIntro(!0);
          showHideSkipIntro(!1);
        })((now = _playbackmanager.default.currentTime(this))),
        (function (player) {
          var item;
          ratingTextNeedsUpdate &&
            (item = currentDisplayItem) &&
            ((ratingTextNeedsUpdate = !1),
            item.OfficialRating && "Trailer" !== item.Type && isDisplayingLocalVideo(player, item.MediaType)
              ? ((ratingTextElement.innerHTML = _globalize.default.translate("RatedValue", item.OfficialRating)),
                ratingInfoContainer.classList.add("hide"),
                ratingInfoContainer.offsetWidth,
                ratingInfoContainer.classList.remove("hide"))
              : ratingInfoContainer.classList.add("hide"));
        })(this),
        updateTimeDisplay(
          now,
          currentRuntimeTicks,
          _playbackmanager.default.playbackStartTime(this),
          _playbackmanager.default.getBufferedRanges(this)
        ),
        (function (player, item) {
          if ("TvChannel" === item.Type) {
            item = item.CurrentProgram;
            if (item && item.EndDate)
              try {
                var state,
                  endDate = _datetime.default.parseISO8601Date(item.EndDate);
                Date.now() >= endDate.getTime() &&
                  (console.log("program info needs to be refreshed"),
                  (state = _playbackmanager.default.getPlayerState(player)),
                  onStateChanged.call(player, {type: "init"}, state));
              } catch (e) {
                console.log("Error parsing date: " + item.EndDate);
              }
          }
        })(this, (item = self.currentItem)),
        (function (player, currentItem, currentTimeTicks, runtimeTicks) {
          runtimeTicks &&
            currentTimeTicks &&
            !comingUpNextDisplayed &&
            !self.currentVisibleMenu &&
            "Episode" === currentItem.Type &&
            _usersettings.default.enableNextVideoInfoOverlay() &&
            ((currentItem = runtimeTicks - currentTimeTicks),
            runtimeTicks - 3.2e3 * (3e10 <= runtimeTicks ? 40 : 24e9 <= runtimeTicks ? 35 : 30) * 1e4 <=
              currentTimeTicks &&
              6e9 <= runtimeTicks &&
              2e8 <= currentItem &&
              (function (player) {
                require(["upNextDialog"], function (UpNextDialog) {
                  self.currentVisibleMenu ||
                    currentUpNextDialog ||
                    ((self.currentVisibleMenu = "upnext"),
                    (comingUpNextDisplayed = !0),
                    _playbackmanager.default.nextItem(player).then(function (nextItem) {
                      (currentUpNextDialog = new UpNextDialog({
                        parent: view.querySelector(".upNextContainer"),
                        player: player,
                        nextItem: nextItem,
                      })),
                        _events.default.on(currentUpNextDialog, "hide", onUpNextHidden);
                    }, onUpNextHidden));
                });
              })(player));
        })(this, item, now, currentRuntimeTicks),
        (item = self.lyricsRenderer) && item.onTimeUpdate(now, currentRuntimeTicks));
    }
    function onUpNextHidden() {
      "upnext" === self.currentVisibleMenu && (self.currentVisibleMenu = null);
    }
    function updatePlayPauseState(isPaused) {
      var btnPause = self.btnPause,
        title = isPaused
          ? ((btnPause.querySelector("i").innerHTML = "&#xE037;"), _globalize.default.translate("Play"))
          : ((btnPause.querySelector("i").innerHTML = "&#xE034;"), _globalize.default.translate("Pause")),
        btnPause = ((btnPause.title = title), btnPause.setAttribute("aria-label", title), self.playQueue);
      btnPause && btnPause.setPausedState(isPaused);
      var playbackMultiply = document.querySelector(".playbackMultiply");
      if (playbackMultiply) {
        playbackMultiply.style.display = isPaused ? "none" : "";
      }
    }
    function hideButton(btn, focusedElement) {
      focusedElement = btn === focusedElement;
      btn.classList.add("hide"), focusedElement && focusMainOsdControls(self);
    }
    function updatePlaylistButtons(playlistIndex, playlistLength, focusedElement) {
      playlistIndex ? btnPreviousTrack.classList.remove("hide") : hideButton(btnPreviousTrack, focusedElement),
        null != playlistIndex && playlistLength && playlistIndex < playlistLength - 1
          ? btnNextTrack.classList.remove("hide")
          : hideButton(btnNextTrack, focusedElement);
    }
    function updateRepeatModeDisplay(repeatMode) {
      var icon = btnRepeatMode.querySelector("i"),
        icon =
          ("RepeatAll" === repeatMode
            ? ((icon.innerHTML = "&#xE040;"),
              icon.classList.add("toggleButtonIcon-active"),
              btnRepeatMode.classList.add("toggleButton-active"))
            : "RepeatOne" === repeatMode
            ? ((icon.innerHTML = "&#xE041;"),
              icon.classList.add("toggleButtonIcon-active"),
              btnRepeatMode.classList.add("toggleButton-active"))
            : ((icon.innerHTML = "&#xE040;"),
              icon.classList.remove("toggleButtonIcon-active"),
              btnRepeatMode.classList.remove("toggleButton-active")),
          self.playQueue);
      icon && icon.updateRepeatModeDisplay(repeatMode);
    }
    function getDisplayPercentByTimeOfDay(programStartDateMs, programRuntimeMs, currentTimeMs) {
      return ((currentTimeMs - programStartDateMs) / programRuntimeMs) * 100;
    }
    (self.updateTransparency = updateTransparency),
      ((itemsContainer = osdPosterContainer).fetchData = getDetailImageItems),
      (itemsContainer.getListOptions = getDetailImageListOptions),
      _dom.default.addEventListener(
        btnFullscreen,
        "click",
        function () {
          _playbackmanager.default.toggleFullscreen(self.currentPlayer);
        },
        {passive: !0}
      ),
      view.querySelector(".btnPip").addEventListener("click", function () {
        _playbackmanager.default.togglePictureInPicture(self.currentPlayer);
      }),
      self.btnVideoOsdSettingsRight.addEventListener("click", onSettingsButtonClick),
      btnVideoOsdSettingsTransportButton.addEventListener("click", onSettingsButtonClick),
      (self.bindToPlayer = function (player, forceStateChange) {
        player === self.currentPlayer
          ? forceStateChange &&
            player &&
            onStateChanged.call(player, {type: "init"}, _playbackmanager.default.getPlayerState(player))
          : (releaseCurrentPlayer(),
            (self.currentPlayer = player) &&
              (onStateChanged.call(player, {type: "init"}, _playbackmanager.default.getPlayerState(player)),
              _events.default.on(player, "playbackstart", onPlaybackStart),
              _events.default.on(player, "playbackstop", onPlaybackStopped),
              _events.default.on(player, "volumechange", onVolumeChanged),
              _events.default.on(player, "pause", onPlayPauseStateChanged),
              _events.default.on(player, "unpause", onPlayPauseStateChanged),
              _events.default.on(player, "timeupdate", onTimeUpdate),
              _events.default.on(player, "fullscreenchange", updateFullscreenIcon),
              _events.default.on(player, "mediastreamschange", onMediaStreamsChanged),
              _events.default.on(player, "statechange", onStateChanged),
              _events.default.on(player, "repeatmodechange", onRepeatModeChange),
              _events.default.on(player, "subtitletrackchange", onSubtitleTrackChange),
              _events.default.on(player, "playlistitemadd", onPlaylistItemAdd),
              _events.default.on(player, "playlistitemmove", onPlaylistItemMove),
              _events.default.on(player, "playlistitemremove", onPlaylistItemRemove),
              resetUpNextDialog(),
              resetRatingText(),
              showHideSkipIntro(!1)));
      }),
      (self.releaseCurrentPlayer = releaseCurrentPlayer);
    var stepSeconds = 10;
    function getStep(runtimeTicks) {
      runtimeTicks = (runtimeTicks = ((1e7 * stepSeconds) / runtimeTicks) * 100).toFixed(3);
      return (runtimeTicks = Math.max(0.01, runtimeTicks)), (runtimeTicks = Math.min(1, runtimeTicks));
    }
    function updateTimeDisplay(positionTicks, runtimeTicks, playbackStartTimeTicks, bufferedRanges) {
      var programRuntimeMs,
        nowPlayingPositionSlider = self.nowPlayingPositionSlider,
        currentTimeMs =
          (enableProgressByTimeOfDay
            ? nowPlayingPositionSlider &&
              !nowPlayingPositionSlider.dragging &&
              (programStartDateMs && programEndDateMs
                ? ((currentTimeMs = (playbackStartTimeTicks + (positionTicks || 0)) / 1e4),
                  (nowPlayingSliderRunTimeTicks = 1e4 * (programRuntimeMs = programEndDateMs - programStartDateMs)),
                  (nowPlayingPositionSlider.step = getStep(nowPlayingSliderRunTimeTicks)),
                  (nowPlayingSliderValue = ((currentTimeMs - programStartDateMs) / programRuntimeMs) * 100),
                  nowPlayingPositionSlider.setValue(nowPlayingSliderValue),
                  bufferedRanges.length
                    ? ((currentTimeMs = getDisplayPercentByTimeOfDay(
                        programStartDateMs,
                        programRuntimeMs,
                        (playbackStartTimeTicks + (bufferedRanges[0].start || 0)) / 1e4
                      )),
                      (programRuntimeMs = getDisplayPercentByTimeOfDay(
                        programStartDateMs,
                        programRuntimeMs,
                        (playbackStartTimeTicks + (bufferedRanges[0].end || 0)) / 1e4
                      )),
                      nowPlayingPositionSlider.setBufferedRanges([{start: currentTimeMs, end: programRuntimeMs}]))
                    : nowPlayingPositionSlider.setBufferedRanges([]))
                : ((nowPlayingPositionSlider.step = 0.01),
                  (nowPlayingSliderRunTimeTicks = null),
                  (nowPlayingSliderValue = 0),
                  nowPlayingPositionSlider.setValue(0),
                  nowPlayingPositionSlider.setBufferedRanges([])))
            : ((nowPlayingSliderRunTimeTicks = runtimeTicks),
              nowPlayingPositionSlider &&
                !nowPlayingPositionSlider.dragging &&
                (runtimeTicks
                  ? ((playbackStartTimeTicks = positionTicks / runtimeTicks),
                    (playbackStartTimeTicks *= 100),
                    (nowPlayingPositionSlider.step = getStep(runtimeTicks)),
                    (nowPlayingSliderValue = playbackStartTimeTicks),
                    nowPlayingPositionSlider.setValue(playbackStartTimeTicks))
                  : ((nowPlayingPositionSlider.step = 0.01),
                    (nowPlayingSliderValue = 0),
                    nowPlayingPositionSlider.setValue(0))),
              nowPlayingPositionSlider &&
                nowPlayingPositionSlider.setBufferedRanges(bufferedRanges, runtimeTicks, positionTicks),
              updateTimeText(videoOsdPositionText, positionTicks),
              updateTimeText(videoOsdDurationText, runtimeTicks - positionTicks)),
          self.bottomTabs.selectedIndex());
      -1 !== currentTimeMs &&
        (programRuntimeMs = self.bottomTabControllers)[currentTimeMs] &&
        programRuntimeMs[currentTimeMs].onTimeUpdate(positionTicks, runtimeTicks);
    }
    function updatePlayerVolumeState(player, isMuted, volumeLevel) {
      var supportedCommands = currentPlayerSupportedCommands,
        showMuteButton = !0,
        showVolumeSlider = !0;
      supportedCommands.includes("Mute") || (showMuteButton = !1),
        supportedCommands.includes("SetVolume") || (showVolumeSlider = !1),
        isMuted
          ? (buttonMute.setAttribute("title", _globalize.default.translate("Unmute")),
            (buttonMute.querySelector("i").innerHTML = "&#xE04F;"))
          : (buttonMute.setAttribute("title", _globalize.default.translate("Mute")),
            (buttonMute.querySelector("i").innerHTML = "&#xE050;")),
        showMuteButton ? buttonMute.classList.remove("hide") : buttonMute.classList.add("hide"),
        nowPlayingVolumeSlider &&
          (showVolumeSlider
            ? videoOsdVolumeSliderWrapper.classList.remove("hide")
            : videoOsdVolumeSliderWrapper.classList.add("hide"),
          nowPlayingVolumeSlider.dragging || nowPlayingVolumeSlider.setValue(volumeLevel));
    }
    function updateTimeText(elem, ticks, dash) {
      null == ticks
        ? (elem.innerHTML = "")
        : ((ticks = _datetime.default.getDisplayRunningTime(ticks)),
          (elem.innerHTML = ticks = dash ? "-" + ticks : ticks));
    }
    function onSettingsButtonClick(e) {
      var btn = this;
      require(["playerSettingsMenu"], function (playerSettingsMenu) {
        var player = self.currentPlayer;
        player &&
          playerSettingsMenu.show({
            player: player,
            positionTo: btn,
            stats: !0,
            onOption: onSettingsOption,
            mediaType: self.currentItem.MediaType,
          });
      });
    }
    function onSettingsOption(selectedOption) {
      "stats" === selectedOption
        ? toggleStats(self)
        : "subtitleoffset" === selectedOption &&
          require(["subtitleOffsetOverlay"], function (SubtitleOffsetOverlay) {
            var player = self.currentPlayer;
            player &&
              (self.subtitleOffsetOverlay || (self.subtitleOffsetOverlay = new SubtitleOffsetOverlay({player: player})),
              self.subtitleOffsetOverlay.show());
          });
    }
    var lastPointerEvent = 0;
    function refreshThumbnailsIfNeeded(item, mediaSourceId, apiClient, maxThumbnailWidth) {
      !item.Id ||
        "Audio" === item.MediaType ||
        currentItemThumbnails ||
        currentItemThumbnailsPromise ||
        !(function (itemId, mediaSourceId, apiClient, maxThumbnailWidth) {
          currentItemThumbnailsPromise ||
            (currentItemThumbnailsPromise = apiClient
              .getThumbnails(itemId, {MediaSourceId: mediaSourceId, Width: maxThumbnailWidth})
              .then(
                function (result) {
                  return (currentItemThumbnails = result), Promise.resolve(result);
                },
                function () {
                  currentItemThumbnailsPromise = null;
                }
              ));
        })(item.Id, mediaSourceId, apiClient, maxThumbnailWidth);
    }
    function getThumbnailBubbleHtml(
      apiClient,
      itemId,
      mediaSourceId,
      thumbnailSet,
      chapters,
      positionTicks,
      maxThumbnailWidth
    ) {
      var thumbnail,
        thumbnails = (thumbnailSet = thumbnailSet || {}).Thumbnails || {},
        bubbleElement = self.nowPlayingPositionSlider.getBubbleElement();
      thumbnails.length
        ? (bubbleElement.classList.add("chapterThumbImageContainer"),
          thumbnailSet.AspectRatio && thumbnailSet.AspectRatio < 1.4
            ? bubbleElement.classList.add("chapterThumbImageContainer-fourthree")
            : bubbleElement.classList.remove("chapterThumbImageContainer-fourthree"),
          bubbleElement.classList.remove("chapterThumbImageContainer-noimg"))
        : (bubbleElement.classList.remove("chapterThumbImageContainer", "chapterThumbImageContainer-fourthree"),
          bubbleElement.classList.add("chapterThumbImageContainer-noimg")),
        _layoutmanager.default.tv
          ? bubbleElement.classList.add("chapterThumbImageContainer-tv")
          : bubbleElement.classList.remove("chapterThumbImageContainer-tv");
      for (var i = 0, length = thumbnails.length; i < length; i++) {
        var currentThumbnail = thumbnails[i];
        if (positionTicks >= currentThumbnail.PositionTicks) thumbnail = currentThumbnail;
        else if (thumbnail) break;
      }
      for (var _i = 0, _length = chapters.length; _i < _length; _i++) {
        var currentChapter = chapters[_i];
        if (positionTicks >= currentChapter.StartPositionTicks) chapter = currentChapter;
        else if (chapter) break;
      }
      var chapter = chapter || {Name: "&nbsp;"},
        thumbnailSet = thumbnail
          ? (function (itemId, thumbnail, maxWidth, apiClient) {
              return thumbnail.ImageTag
                ? apiClient.getImageUrl(itemId, {
                    maxWidth: maxWidth,
                    tag: thumbnail.ImageTag,
                    type: "Thumbnail",
                    PositionTicks: thumbnail.PositionTicks,
                  })
                : null;
            })(itemId, thumbnail, maxThumbnailWidth, apiClient)
          : null,
        bubbleElement = "",
        itemId = "chapterThumbTextContainer";
      return (
        thumbnailSet || (itemId += " chapterThumbTextContainer-noimg"),
        (self.nowPlayingPositionSlider.getBubbleElement().style.backgroundImage = thumbnailSet
          ? "url('" + thumbnailSet + "')"
          : null),
        (bubbleElement =
          (bubbleElement =
            (bubbleElement =
              (bubbleElement =
                (bubbleElement = bubbleElement + ('<div class="' + itemId + '">') + '<div class="chapterThumbText">') +
                (chapter ? _dom.default.htmlEncode(chapter.Name) : "&nbsp;")) +
              "</div>" +
              (thumbnailSet ? '<div class="chapterThumbText">' : '<div class="chapterThumbText secondaryText">')) +
            _datetime.default.getDisplayRunningTime(positionTicks)) +
          "</div>" +
          "</div>")
      );
    }
    function onStop() {
      _playbackmanager.default.stop(self.currentPlayer);
    }
    function onMoreClick() {
      showMoreMenu(self.currentItem, this);
    }
    function onCloseRequestedFromTab() {
      self.bottomTabs.selectedIndex(-1);
    }
    function loadBottomTabController(index, forceRefresh) {
      var tabResumeOptions = {
          refresh: forceRefresh,
          item: self.currentItem,
          displayItem: currentDisplayItem,
          enableProgressByTimeOfDay: enableProgressByTimeOfDay,
        },
        bottomTabControllers = self.bottomTabControllers;
      if (bottomTabControllers[index]) return bottomTabControllers[index].onResume(tabResumeOptions);
      require([
        ["videoosd_infotab", "videoosd_chapterstab", "videoosd_peopletab", "videoosd_onnowtab", "videoosd_guidetab"][
          index
        ],
      ]).then(function (responses) {
        responses = new responses[0](tabContainers[index]);
        return (
          (bottomTabControllers[index] = responses),
          (tabResumeOptions.refresh = !0),
          _events.default.on(responses, "closerequested", onCloseRequestedFromTab),
          responses.onResume(tabResumeOptions)
        );
      });
    }
    function onTabTransitionEnd(e) {
      var elem = e.currentTarget;
      elem === e.target &&
        elem.classList.contains("videoosd-tabcontainers-hidden") &&
        (elem.classList.add("hide"),
        self.osdBottomElement.classList.remove("videoosd-bottom-with-opentab"),
        (e = elem.querySelector(".videoosd-activetab")) && e.classList.remove("videoosd-activetab"),
        focusMainOsdControls(self));
    }
    function setContentSection(sectionName, saveToUserSettings) {
      currentOsdContentSectionName = sectionName;
      for (
        var sections = view.querySelectorAll(".osdContentSection"), i = 0, length = sections.length;
        i < length;
        i++
      ) {
        var section = sections[i];
        section.getAttribute("data-contentsection") === sectionName
          ? section.classList.remove("hide")
          : section.classList.add("hide");
      }
      for (
        var buttons = view.querySelectorAll(".osdContentSectionToggleButton"), _i2 = 0, _length2 = buttons.length;
        _i2 < _length2;
        _i2++
      ) {
        var button = buttons[_i2],
          icon = button.querySelector("i");
        button.getAttribute("data-contentsection") === sectionName
          ? (button.classList.add("toggleButton-active"), icon.classList.add("toggleButtonIcon-active"))
          : (button.classList.remove("toggleButton-active"), icon.classList.remove("toggleButtonIcon-active"));
      }
      var playQueue = self.playQueue,
        playQueue =
          ("playqueue" === sectionName ? playQueue && playQueue.resume({}) : playQueue && playQueue.pause(),
          self.lyricsRenderer),
        playQueue =
          ("lyrics" === sectionName ? playQueue && playQueue.resume({}) : playQueue && playQueue.pause(),
          self.osdBottomElement);
      _layoutmanager.default.tv
        ? sectionName && "playqueue" !== sectionName
          ? playQueue.classList.add("videoOsdBottom-split")
          : playQueue.classList.remove("videoOsdBottom-split")
        : sectionName && "art" !== sectionName
        ? playQueue.classList.add("videoOsdBottom-split")
        : playQueue.classList.remove("videoOsdBottom-split"),
        !1 !== saveToUserSettings && _usersettings.default.osdContentSection(sectionName);
    }
    function onContentSectionToggleButtonClick(e) {
      this.classList.contains("toggleButton-active")
        ? _layoutmanager.default.tv
          ? setContentSection(getDefaultOsdContentSection())
          : setContentSection("art")
        : setContentSection(this.getAttribute("data-contentsection"));
    }
    function onSkipIntroClickInternal() {
      var info = currentIntroInfo,
        player = self.currentPlayer;
      info && player && (_playbackmanager.default.seek(info.end, player), self.hideOsd());
    }
    var my_touches_type = null;
    var my_touches_start = null;
    var my_touches_value = 0;
    var my_touches_nowvalue = 0;
    var my_touches_rate = null;
    var my_touches_time = null;
    var dragByGuesture = false;
    function my_touches_func(e, v, t, x, s) {
      var step = (Math.abs(v) / (s ? x * 5 : x * 0.5)) * 100;
      step = v > 0 ? step : -step;
      v = s ? t + step : t - step;
      step = v >= 100 ? 100 : v <= 0 ? 0 : v;
      if (v >= 99 || v <= 1) {
        my_touches_start = e;
        my_touches_nowvalue = step;
      }
      return step;
    }
    if (
      _dom.default.addEventListener(view, "touchstart", function (e) {
        if (
          !document.querySelector(".backdropContainer.nowplaying-backdropcontainer-blur") &&
          shouldOsdBeShown(self) &&
          my_touches_start == null
        ) {
          brightnessSliderContainer.style.setProperty("display", "none", "important");
          videoOsdVolumeControls.style.setProperty("display", "none", "important");
          my_touches_type = null;
          my_touches_start = e.touches[0];
          my_touches_value = 0;
          my_touches_time = setTimeout(() => {
            if (
              my_touches_type === null &&
              my_touches_rate === null &&
              !self.nowPlayingPositionSlider.dragging &&
              Math.abs(e.touches[0].clientX - my_touches_start.clientX) < 10 &&
              Math.abs(e.touches[0].clientY - my_touches_start.clientY) < 10
            ) {
              window.navigator.vibrate(15);
              document.querySelector(".playbackMultiply").classList.remove("hide");
              my_touches_rate = _playbackmanager.default.getPlaybackRate(self.currentPlayer);
              _playbackmanager.default.setPlaybackRate(my_touches_rate * 2, self.currentPlayer);
              self.hideOsd();
            }
          }, 700);
        }
      }),
      _dom.default.addEventListener(view, "touchmove", function (e) {
        if (
          (!document.querySelector(".backdropContainer.nowplaying-backdropcontainer-blur") && dragByGuesture) ||
          (!self.nowPlayingPositionSlider.dragging && my_touches_start != null && my_touches_rate === null)
        ) {
          var x = e.touches[0].pageX - my_touches_start.pageX;
          var y = e.touches[0].pageY - my_touches_start.pageY;
          var centerX = window.innerWidth / 2;
          if (
            (my_touches_type === null && Math.abs(x) > 20 && Math.abs(e.touches[0].pageX - centerX) < 100) ||
            my_touches_type === "play"
          ) {
            if (my_touches_type === null) {
              my_touches_type = "play";
              my_touches_start = e.touches[0];
              my_touches_nowvalue = nowPlayingSliderValue;
            } else {
              my_touches_value = my_touches_func(e.touches[0], x, my_touches_nowvalue, screen.width, true);
              dragByGuesture = true;
              self.nowPlayingPositionSlider.beginEditing(my_touches_value);
            }
          } else if (Math.abs(y) > 60 || my_touches_type === "volume" || my_touches_type === "bright") {
            if (
              (Math.abs(x) < 20 &&
                Math.abs(y) > 20 &&
                my_touches_type === null &&
                my_touches_start.pageX >= screen.width / 2) ||
              my_touches_type === "volume"
            ) {
              if (my_touches_type === null) {
                my_touches_start = e.touches[0];
                my_touches_type = "volume";
                my_touches_nowvalue = _playbackmanager.default.getVolume(self.currentPlayer);
                videoOsdVolumeControls.classList.add("videoOsdVolumeControls-showhover");
                videoOsdVolumeControls.classList.remove("videoOsdVolumeControls-hidetouch", "hide");
                videoOsdVolumeControls.style.setProperty("display", "flex", "important");
                videoOsdVolumeSliderWrapper.style.setProperty("display", "flex", "important");
              } else {
                my_touches_value = Math.floor(
                  my_touches_func(e.touches[0], y, my_touches_nowvalue, screen.height, false)
                );
                if (_playbackmanager.default.getVolume(self.currentPlayer) != my_touches_value) {
                  nowPlayingVolumeSlider.setValue(my_touches_value);
                  _playbackmanager.default.setVolume(my_touches_value, self.currentPlayer);
                }
              }
              self.showOsd();
            } else if (
              (Math.abs(x) < 20 &&
                Math.abs(y) > 20 &&
                my_touches_type === null &&
                my_touches_start.pageX < screen.width / 2) ||
              my_touches_type === "bright"
            ) {
              if (my_touches_type === null) {
                my_touches_start = e.touches[0];
                my_touches_type = "bright";
                my_touches_nowvalue = _playbackmanager.default.getBrightness(self.currentPlayer);
                brightnessSliderContainer.classList.remove("hide");
                brightnessSliderContainer.style.setProperty("display", "flex", "important");
              } else {
                my_touches_value = Math.floor(
                  my_touches_func(e.touches[0], y, my_touches_nowvalue, screen.height, false)
                );
                if (_playbackmanager.default.getBrightness(self.currentPlayer) != my_touches_value) {
                  brightnessSlider.setValue(my_touches_value);
                  _playbackmanager.default.setBrightness(my_touches_value, self.currentPlayer);
                }
              }
              self.showOsd();
            }
          }
        }
      }),
      _dom.default.addEventListener(view, "touchcancel", function (e) {
        if (my_touches_start && (my_touches_value !== 0 || my_touches_type != null)) {
          if (my_touches_type === "play") {
            nowPlayingSliderValue = my_touches_value;
            self.nowPlayingPositionSlider.setValue(my_touches_value);
            clearEndEditTimeoutForPositionSlider();
            endEditTimeoutForPositionSlider = endEditsForPositionSlider();
          } else if (my_touches_type === "volume") {
            videoOsdVolumeControls.classList.add("videoOsdVolumeControls-hidetouch", "hide");
            videoOsdVolumeControls.style.setProperty("display", "none", "important");
            videoOsdVolumeSliderWrapper.style.setProperty("display", "none", "important");
          } else if (my_touches_type === "bright") {
            brightnessSliderContainer.style.setProperty("display", "none", "important");
          }
          my_touches_start = null;
          my_touches_type = null;
          self.hideOsd();
        }
        my_touches_start = null;
        if (my_touches_time != null) {
          clearTimeout(my_touches_time);
          my_touches_time = null;
        }
        if (my_touches_rate != null) {
          _playbackmanager.default.setPlaybackRate(my_touches_rate, self.currentPlayer);
          my_touches_rate = null;
        }
        dragByGuesture = false;
      }),
      _dom.default.addEventListener(view, "touchend", function (e) {
        if (my_touches_start && (my_touches_value !== 0 || my_touches_type != null)) {
          if (my_touches_type === "play") {
            window.navigator.vibrate(10);
            nowPlayingSliderValue = my_touches_value;
            self.nowPlayingPositionSlider.setValue(my_touches_value);
            clearEndEditTimeoutForPositionSlider();
            endEditTimeoutForPositionSlider = endEditsForPositionSlider();
          } else if (my_touches_type === "volume") {
            window.navigator.vibrate(7);
            videoOsdVolumeControls.classList.add("videoOsdVolumeControls-hidetouch", "hide");
            videoOsdVolumeControls.style.setProperty("display", "none", "important");
            videoOsdVolumeSliderWrapper.style.setProperty("display", "none", "important");
          } else if (my_touches_type === "bright") {
            window.navigator.vibrate(7);
            brightnessSliderContainer.style.setProperty("display", "none", "important");
          }
          my_touches_start = null;
          my_touches_type = null;
          self.hideOsd();
        }
        my_touches_start = null;
        if (my_touches_time != null) {
          clearTimeout(my_touches_time);
          my_touches_time = null;
          document.querySelector(".playbackMultiply").classList.add("hide");
        }
        if (my_touches_rate != null) {
          _playbackmanager.default.setPlaybackRate(my_touches_rate, self.currentPlayer);
          my_touches_rate = null;
        }
        dragByGuesture = false;
      }),
      (_dom.default.addEventListener(
        view,
        window.PointerEvent && !_dom.default.supportsPointerTypeInClickEvent() ? "pointerup" : "click",
        function (e) {
          var isEnoughTimeSinceLastTap,
            pointerType = (pointerType = e.pointerType) || (supportsTouchEvent ? "touch" : "mouse");
          "touch" === (lastPointerUpType = pointerType)
            ? e.target.closest("BUTTON,INPUT,.videoosd-tabcontainers")
              ? self.showOsd()
              : (!(isEnoughTimeSinceLastTap = 300 < (pointerType = Date.now()) - lastPointerEvent) &&
                  "click" !== e.type) ||
                ((lastPointerEvent = pointerType),
                "osd" === self.currentVisibleMenu
                  ? setTimeout(self.boundHideOsd, 10)
                  : self.currentVisibleMenu ||
                    (isEnoughTimeSinceLastTap && (timeoutToShowOsd = setTimeout(self.boundShowOsdDefaultParams, 100))))
            : onOsdClick(e, self, null, !0);
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(window, "keydown", function (event) {
        if (self.i) {
          return;
        }
        self.i = true;
        var intervalId;
        var keyMap = {
          "ArrowRight": {rate: 2, message: "2.0 倍数"},
          "Right": {rate: 2, message: "2.0 倍数"},
          "NavigationRight": {rate: 2, message: "2.0 倍数"},
          "GamepadDPadRight": {rate: 2, message: "2.0 倍数"},
          "GamepadLeftThumbStickRight": {rate: 2, message: "2.0 倍数"},
          "GamepadLeftThumbstickRight": {rate: 2, message: "2.0 倍数"},
          "ArrowLeft": {rate: 1, message: "1.0 倍数"},
          "Left": {rate: 1, message: "1.0 倍数"},
          "NavigationLeft": {rate: 1, message: "1.0 倍数"},
          "GamepadDPadLeft": {rate: 1, message: "1.0 倍数"},
          "GamepadLeftThumbStickLeft": {rate: 1, message: "1.0 倍数"},
          "GamepadLeftThumbstickLeft": {rate: 1, message: "1.0 倍数"},
          "`": {rate: 1, message: "1.0 倍数"},
          "0": {rate: 1, message: "1.0 倍数"},
          "1": {rate: 1.5, message: "1.5 倍数"},
          "2": {rate: 2, message: "2.0 倍数"},
          "3": {rate: 2.5, message: "2.5 倍数"},
          "4": {rate: 3, message: "3.0 倍数"},
          "5": {rate: 3.5, message: "3.5 倍数"},
          "6": {rate: 4, message: "4.0 倍数"},
        };
        var handleKeyDown = function () {
          var key = event.key;
          var rate = keyMap[key].rate;
          var message = keyMap[key].message;
          var noScrollYElement = document.querySelector(".noScrollY:root");
          if (noScrollYElement) {
            noScrollYElement.style.width = "auto";
          }
          _toast.default(message);
          _playbackmanager.default.setPlaybackRate(rate);
        };
        if (self.currentPlayer && !self.nowPlayingPositionSlider.dragging && keyMap.hasOwnProperty(event.key)) {
          intervalId = setTimeout(handleKeyDown, 500);
        }
        _dom.default.addEventListener(window, "keyup", function (event) {
          var keys = Object.keys(keyMap);
          if (keys.includes(event.key)) {
            clearTimeout(intervalId);
            self.i = false;
          }
        });
      }),
      _dom.default.addEventListener(
        view,
        "dblclick",
        function (e) {
          var clientX, windowSize;
          e.target.closest("BUTTON") ||
            ("mouse" === lastPointerUpType
              ? _playbackmanager.default.toggleFullscreen(self.currentPlayer)
              : null != (clientX = e.clientX) &&
                (clientX <= 0.4 * (windowSize = _dom.default.getWindowSize()).innerWidth
                  ? (timeoutToShowOsd && clearTimeout(timeoutToShowOsd), rewind(self, !0))
                  : clientX >= 0.6 * windowSize.innerWidth &&
                    (timeoutToShowOsd && clearTimeout(timeoutToShowOsd), fastForward(self, !0))));
          self.hideOsd();
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(
        buttonMute,
        "click",
        function () {
          _playbackmanager.default.toggleMute(self.currentPlayer);
        },
        {passive: !0}
      ),
      setTimeout(function () {
        brightnessSlider.value = 55;
        _dom.default.addEventListener(
          brightnessSlider,
          "change",
          function () {
            _playbackmanager.default.setBrightness(parseFloat(this.value), self.currentPlayer), self.showOsd();
          },
          {passive: !0}
        ),
          _dom.default.addEventListener(
            brightnessSlider,
            "input",
            function () {
              _playbackmanager.default.setBrightness(parseFloat(this.value), self.currentPlayer), self.showOsd();
            },
            {passive: !0}
          );
      }, 0),
      _dom.default.addEventListener(
        nowPlayingVolumeSlider,
        "change",
        function () {
          _playbackmanager.default.setVolume(parseFloat(this.value), self.currentPlayer);
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(
        self.nowPlayingPositionSlider,
        "change",
        function () {
          var newPercent,
            seekAirTimeTicks,
            player = self.currentPlayer;
          player &&
            ((newPercent = parseFloat(this.value)),
            enableProgressByTimeOfDay
              ? ((seekAirTimeTicks =
                  (seekAirTimeTicks = (newPercent / 100) * (programEndDateMs - programStartDateMs) * 1e4) +
                  1e4 * programStartDateMs -
                  playbackStartTimeTicks),
                _playbackmanager.default.seek(seekAirTimeTicks, player))
              : _playbackmanager.default.seekPercent(newPercent, player));
        },
        {passive: !0}
      ),
      (self.nowPlayingPositionSlider.getBubbleHtml = function (value) {
        if ((self.showOsd(), enableProgressByTimeOfDay))
          return programStartDateMs && programEndDateMs
            ? ((ms = programEndDateMs - programStartDateMs),
              (ms = (ms /= 100) * value + programStartDateMs),
              '<h3 class="sliderBubbleText">' + getDisplayTimeWithoutAmPm(new Date(parseInt(ms)), !0) + "</h3>")
            : "--:--";
        if (!currentRuntimeTicks) return "--:--";
        var ms = currentRuntimeTicks,
          value = ((ms = (ms / 100) * value), self.currentItem);
        if (value) {
          var apiClient = _connectionmanager.default.getApiClient(value.ServerId),
            thumbnails = (refreshThumbnailsIfNeeded(value, "", apiClient, 400), currentItemThumbnails),
            chapters = currentDisplayChapters || [];
          if (chapters.length) {
            apiClient = getThumbnailBubbleHtml(apiClient, value.Id, 0, thumbnails, chapters, ms, 400);
            if (apiClient) return apiClient;
          }
        }
        return '<h2 class="sliderBubbleText">' + _datetime.default.getDisplayRunningTime(ms) + "</h2>";
      }),
      _dom.default.addEventListener(
        self.osdBottomElement,
        params,
        function (e) {
          var elem = e.currentTarget;
          elem === e.target &&
            elem.classList.contains("videoOsdBottom-hidden") &&
            (elem.classList.add("hide"),
            self.headerElement.classList.add("hide"),
            onRewindAnimationComplete.call(self.btnRewindIcon),
            onFastForwardAnimationComplete.call(self.btnFastForwardIcon),
            self.bottomTabs.selectedIndex(-1),
            onTabTransitionEnd.call(tabContainersElem, {target: tabContainersElem, currentTarget: tabContainersElem}),
            view.dispatchEvent(new CustomEvent("video-osd-hide", {bubbles: !0})));
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(
        btnPreviousTrack,
        "click",
        function () {
          _playbackmanager.default.previousTrack(self.currentPlayer);
        },
        {passive: !0}
      ),
      Array.prototype.forEach.call(stopButtons, function (btnStop) {
        btnStop.addEventListener("click", onStop);
      }),
      _dom.default.addEventListener(
        self.btnPause,
        "click",
        function () {
          _playbackmanager.default.playPause(self.currentPlayer);
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(
        btnNextTrack,
        "click",
        function () {
          _playbackmanager.default.nextTrack(self.currentPlayer);
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(
        btnRewind,
        "click",
        function () {
          rewind(self, !0);
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(
        btnFastForward,
        "click",
        function () {
          fastForward(self, !0);
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(
        btnRepeatMode,
        "click",
        function () {
          var player;
          (player = self.currentPlayer) && _playbackmanager.default.toggleRepeatMode(player);
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(btnOsdMoreBottom, "click", onMoreClick, {passive: !0}),
      _dom.default.addEventListener(btnOsdMoreTitle, "click", onMoreClick, {passive: !0}),
      _dom.default.addEventListener(
        btnAudio,
        "click",
        function () {
          var audioTracks,
            currentIndex,
            menuItems,
            positionTo,
            player = self.currentPlayer;
          player &&
            ((audioTracks = _playbackmanager.default.audioTracks(player)),
            (currentIndex = _playbackmanager.default.getAudioStreamIndex(player)),
            (menuItems = audioTracks.map(function (stream) {
              var opt = {
                name: stream.DisplayTitle,
                secondaryText:
                  stream.Title && !(stream.DisplayTitle || "").includes(stream.Title) ? stream.Title : null,
                id: stream.Index,
              };
              return stream.Index === currentIndex && (opt.selected = !0), opt;
            })),
            (positionTo = this),
            require(["actionsheet"], function (actionsheet) {
              self.showOsd(),
                actionsheet
                  .show({
                    items: menuItems,
                    title: _globalize.default.translate("Audio"),
                    positionTo: positionTo,
                    positionY: "above",
                    transformOrigin: "center bottom",
                    hasItemSelectionState: !0,
                    autoTvLayout: !1,
                  })
                  .then(function (id) {
                    self.showOsd();
                    id = parseInt(id);
                    id !== currentIndex && _playbackmanager.default.setAudioStreamIndex(id, player);
                  }, self.boundShowOsdDefaultParams);
            }));
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(
        btnSubtitles,
        "click",
        function () {
          var player = self.currentPlayer,
            streams = _playbackmanager.default.subtitleTracks(player),
            currentIndex = _playbackmanager.default.getSubtitleStreamIndex(player),
            menuItems =
              (null == currentIndex && (currentIndex = -1),
              streams.unshift({Index: -1, DisplayTitle: _globalize.default.translate("Off")}),
              streams.map(function (stream) {
                var opt = {
                  name: stream.DisplayTitle,
                  secondaryText:
                    stream.Title && !(stream.DisplayTitle || "").includes(stream.Title) ? stream.Title : null,
                  id: stream.Index,
                };
                return stream.Index === currentIndex && (opt.selected = !0), opt;
              })),
            positionTo = this;
          (streams = _connectionmanager.default.getApiClient(self.currentItem)).getCurrentUser().then(function (user) {
            supportsSubtitleDownloading() &&
              _itemhelper.default.canDownloadSubtitles(user, self.currentItem) &&
              menuItems.push({
                name: _globalize.default.translate("SearchForSubtitles"),
                id: "search",
                icon: "&#xE8B6;",
              }),
              require(["actionsheet"], function (actionsheet) {
                self.showOsd(),
                  actionsheet
                    .show({
                      title: _globalize.default.translate("Subtitles"),
                      items: menuItems,
                      positionTo: positionTo,
                      positionY: "above",
                      transformOrigin: "center bottom",
                      hasItemSelectionState: !0,
                      hasItemIcon: !0,
                      autoTvLayout: !1,
                    })
                    .then(function (id) {
                      if ((self.showOsd(), "search" === id))
                        return (
                          (item = self.currentItem),
                          (mediaSource = currentMediaSource),
                          void require(["registrationServices", "subtitleEditor"]).then(function (responses) {
                            return responses[0].validateFeature("sync").then(function () {
                              return responses[1]
                                .show({
                                  item: item,
                                  mediaSource: mediaSource,
                                  showCurrentSubtitles: !1,
                                  autoSearch: !0,
                                  closeOnDownload: !0,
                                })
                                .then(function (result) {
                                  _playbackmanager.default.setSubtitleStreamIndex(
                                    result.NewIndex,
                                    self.currentPlayer,
                                    !0
                                  );
                                });
                            });
                          })
                        );
                      var item,
                        mediaSource,
                        id = parseInt(id);
                      id !== currentIndex && _playbackmanager.default.setSubtitleStreamIndex(id, player);
                    }, self.boundShowOsdDefaultParams);
              });
          });
        },
        {passive: !0}
      ),
      self.bottomTabs.addEventListener("beforetabchange", function (e) {
        var previousPanel,
          newPanel = tabContainers[e.detail.selectedTabIndex];
        null != e.detail.previousIndex &&
          ((previousPanel = tabContainers[e.detail.previousIndex]) &&
            newPanel &&
            previousPanel.classList.remove("videoosd-activetab"),
          (previousPanel = self.bottomTabControllers[e.detail.previousIndex]) && previousPanel.onPause()),
          newPanel
            ? (loadBottomTabController(e.detail.selectedTabIndex),
              newPanel.classList.add("videoosd-activetab"),
              tabContainersElem.classList.remove("hide"),
              tabContainersElem.offsetWidth,
              tabContainersElem.classList.remove("videoosd-tabcontainers-hidden"),
              self.osdBottomElement.classList.add("videoosd-bottom-with-opentab"),
              btnCloseTabContent.classList.remove("hide"))
            : (tabContainersElem.classList.add("videoosd-tabcontainers-hidden"),
              btnCloseTabContent.classList.add("hide"));
      }),
      btnCloseTabContent.addEventListener("click", function () {
        self.bottomTabs.selectedIndex(-1);
      }),
      _dom.default.addEventListener(tabContainersElem, params, onTabTransitionEnd, {passive: !0}),
      _inputmanager.default.on(self.bottomTabs, function (e) {
        switch (e.detail.command) {
          case "up":
            -1 !== self.bottomTabs.selectedIndex() &&
              (self.bottomTabs.selectedIndex(-1), e.preventDefault(), e.stopPropagation(), self.showOsd());
            break;
          case "down":
            var btn;
            -1 === self.bottomTabs.selectedIndex() &&
              ((btn = e.target.closest(".videoosd-tab-button"))
                ? self.bottomTabs.selectedIndex(parseInt(btn.getAttribute("data-index")))
                : self.bottomTabs.selectedIndex(-1));
        }
      }),
      _dom.default.addEventListener(
        view.querySelector(".btnSkipIntro"),
        "click",
        function () {
          if (!skipIntroValidated) return validateSkipIntroFeature().then(onSkipIntroClickInternal);
          onSkipIntroClickInternal();
        },
        {passive: !0}
      ),
      _dom.default.addEventListener(view.querySelector(".btnPlayQueue"), "click", onContentSectionToggleButtonClick, {
        passive: !0,
      }),
      _dom.default.addEventListener(btnLyrics, "click", onContentSectionToggleButtonClick, {passive: !0}),
      _dom.default.allowBackdropFilter())
    )
      for (
        var toggleButtonIcons = view.querySelectorAll(".toggleButtonIcon"), i = 0, length = toggleButtonIcons.length;
        i < length;
        i++
      )
        toggleButtonIcons[i].classList.add("toggleButtonIcon-backdropfilter");
    _inputmanager.default.on(self.nowPlayingPositionSlider, function (e) {
      switch (e.detail.command) {
        case "left":
        case "rewind":
          e.preventDefault(),
            (nowPlayingSliderValue = e.detail.repeat
              ? Math.min(Math.max(nowPlayingSliderValue - parseFloat(this.step), this.min), this.max)
              : Math.min(
                  Math.max(
                    nowPlayingSliderValue - convertMsToNowPlayingSliderStep(_usersettings.default.skipBackLength()),
                    this.min
                  ),
                  this.max
                )),
            this.beginEditing(nowPlayingSliderValue),
            startEndEditTimeoutForPositionSlider();
          break;
        case "right":
        case "fastforward":
          e.preventDefault(),
            (nowPlayingSliderValue = e.detail.repeat
              ? Math.min(Math.max(nowPlayingSliderValue + parseFloat(this.step), this.min), this.max)
              : Math.min(
                  Math.max(
                    nowPlayingSliderValue + convertMsToNowPlayingSliderStep(_usersettings.default.skipForwardLength()),
                    this.min
                  ),
                  this.max
                )),
            this.beginEditing(nowPlayingSliderValue),
            startEndEditTimeoutForPositionSlider();
          break;
        case "pageup":
          e.preventDefault(), _playbackmanager.default.nextChapter(self.currentPlayer);
          break;
        case "pagedown":
          e.preventDefault(), _playbackmanager.default.previousChapter(self.currentPlayer);
      }
    }),
      (function () {
        for (
          var sections = view.querySelectorAll(".osdContentSection"), i = 0, length = sections.length;
          i < length;
          i++
        ) {
          var section = sections[i];
          (_layoutmanager.default.tv && "lyrics" !== section.getAttribute("data-contentsection")) ||
            section.classList.add("osdContentSection-split"),
            _layoutmanager.default.tv &&
              "lyrics" === section.getAttribute("data-contentsection") &&
              section.classList.add("osdContentSection-tv-split");
        }
      })(),
      _shortcuts.default.on(this.videoOsdText),
      (this.boundHideOsd = this.hideOsd.bind(this)),
      (this.boundShowOsdDefaultParams = function () {
        this.showOsd();
      }.bind(this)),
      (this.boundOnOsdHideTimeout = function () {
        _focusmanager.default.hasExclusiveFocusScope() || 0 <= this.bottomTabs.selectedIndex()
          ? startOsdHideTimer(this)
          : this.hideOsd();
      }.bind(this));
  }
  (VideoOsd.prototype.showOsd = function (timeoutMs, elementToFocus) {
    var headerElement;
    this.paused ||
      ((headerElement = this.headerElement).classList.remove("hide"),
      headerElement.offsetWidth,
      headerElement.classList.remove("videoOsdHeader-hidden"),
      (function (instance, elementToFocus) {
        var elem;
        instance.currentVisibleMenu ||
          ((elem = instance.osdBottomElement),
          (instance.currentVisibleMenu = "osd"),
          elem.classList.remove("hide"),
          elem.offsetWidth,
          elem.classList.remove("videoOsdBottom-hidden"),
          _focusmanager.default.hasExclusiveFocusScope() ||
            (elementToFocus ? _focusmanager.default.focus(elementToFocus) : focusMainOsdControls(instance)),
          instance.view.dispatchEvent(new CustomEvent("video-osd-show", {bubbles: !0})));
      })(this, elementToFocus),
      startOsdHideTimer(this, timeoutMs));
  }),
    (VideoOsd.prototype.hideOsd = function () {
      var instance, elem;
      (_layoutmanager.default.tv || isDisplayingLocalVideo(this.currentPlayer)) &&
        (this.headerElement.classList.add("videoOsdHeader-hidden"),
        "osd" === (instance = this).currentVisibleMenu &&
          ((elem = instance.osdBottomElement).offsetWidth,
          elem.classList.add("videoOsdBottom-hidden"),
          (instance.currentVisibleMenu = null)),
        (elem = this.lyricsRenderer) && !elem.paused && _layoutmanager.default.tv && elem.focus());
    }),
    (VideoOsd.prototype.exit = function () {
      _approuter.default.back();
    }),
    (VideoOsd.prototype.resume = function (options) {
      this.paused = !1;
      var headerElement = this.headerElement;
      _layoutmanager.default.tv
        ? headerElement.classList.add("videoOsdHeader")
        : headerElement.classList.add("videoOsdHeader", "videoOsd-customFont");
      (headerElement =
        (headerElement = this.boundOnPlayerChange) ||
        (this.boundOnPlayerChange = function (e, player) {
          this.bindToPlayer(player), this.bottomTabs.selectedIndex(-1);
        }.bind(this))),
        _events.default.on(_playbackmanager.default, "playerchange", headerElement),
        this.bindToPlayer(_playbackmanager.default.getCurrentPlayer(), !0),
        (headerElement = this.currentPlayer);
      headerElement &&
        !options.refresh &&
        this.updateTransparency(headerElement, null == (options = this.currentItem) ? void 0 : options.MediaType);
      headerElement =
        (headerElement = this.boundPointerMove) ||
        (this.boundPointerMove = function (e) {
          var obj,
            pointerType = e.pointerType;
          if ("touch" !== pointerType && (pointerType || !supportsTouchEvent))
            return (
              (pointerType = e.screenX || 0),
              (e = e.screenY || 0),
              (obj = this.lastPointerMoveData)
                ? void (
                    (Math.abs(pointerType - obj.x) < 10 && Math.abs(e - obj.y) < 10) ||
                    ((obj.x = pointerType), (obj.y = e), this.showOsd())
                  )
                : ((this.lastPointerMoveData = {x: pointerType, y: e}), void this.showOsd())
            );
        }.bind(this));
      _dom.default.addEventListener(document, window.PointerEvent ? "pointermove" : "mousemove", headerElement, {
        passive: !0,
      }),
        (function (view) {
          var activeElement = document.activeElement;
          if (activeElement && !view.contains(activeElement))
            try {
              activeElement.blur();
            } catch (err) {
              console.log("Error blurring element from previous view: " + err);
            }
        })(this.view);
      options =
        (options = this.boundInputCommand) ||
        (this.boundInputCommand = function (e) {
          switch (e.detail.command) {
            case "back":
              _layoutmanager.default.tv &&
                !_focusmanager.default.hasExclusiveFocusScope() &&
                (isDisplayingLocalVideo(this.currentPlayer)
                  ? "osd" === this.currentVisibleMenu && (e.preventDefault(), this.hideOsd())
                  : this.currentVisibleMenu || (e.preventDefault(), this.showOsd()));
              break;
            case "left":
              if (e.target.closest(".skipIntroContainer,.upNextContainer")) return;
              ("rtl" === document.dir ? onFastForwardInputCommand : onRewindInputCommand)(e, this);
              break;
            case "rewind":
              onRewindInputCommand(e, this);
              break;
            case "right":
              if (e.target.closest(".skipIntroContainer,.upNextContainer")) return;
              ("rtl" === document.dir ? onRewindInputCommand : onFastForwardInputCommand)(e, this);
              break;
            case "fastforward":
              onFastForwardInputCommand(e, this);
              break;
            case "pagedown":
              _playbackmanager.default.nextChapter(this.currentPlayer);
              break;
            case "pageup":
              _playbackmanager.default.previousChapter(this.currentPlayer);
              break;
            case "playpause":
              e.preventDefault(),
                e.stopPropagation(),
                _playbackmanager.default.playPause(this.currentPlayer),
                shouldOsdBeShown(this) && this.showOsd();
              break;
            case "play":
              e.preventDefault(),
                e.stopPropagation(),
                _playbackmanager.default.unpause(this.currentPlayer),
                shouldOsdBeShown(this) && this.showOsd();
              break;
            case "select":
              onOsdClick(e, this, this.btnPause, shouldOsdBeShown(this)) && e.preventDefault();
              break;
            case "up":
              shouldOsdBeShown(this) &&
                (this.currentVisibleMenu ? this.showOsd() : setTimeout(this.showOsd.bind(this), 10));
              break;
            case "down":
              shouldOsdBeShown(this) && this.showOsd();
              break;
            case "menu":
              shouldOsdBeShown(this) && this.showOsd();
              break;
            case "pause":
            case "nowplaying":
              shouldOsdBeShown(this) && this.showOsd();
              break;
            case "record":
              shouldOsdBeShown(this) && this.showOsd(),
                !(function (instance) {
                  (instance = instance.btnRecord).classList.contains("hide") || instance.click();
                })(this);
              break;
            case "togglestats":
              toggleStats(this);
              break;
            case "movies":
            case "music":
            case "tv":
            case "settings":
            case "search":
            case "favorites":
            case "recordedtv":
              e.preventDefault();
              break;
            case "info":
              setBottomTabIndex(this, 0), e.preventDefault();
              break;
            case "livetv":
            case "guide":
              this.bottomTabButtons[3].classList.contains("hide") || setBottomTabIndex(this, 3), e.preventDefault();
          }
        }.bind(this));
      _inputmanager.default.on(window, options);
      headerElement =
        (headerElement = this.boundWindowKeyDown) ||
        (this.boundWindowKeyDown = function (e) {
          var keyCode = e.keyCode;
          if (32 === keyCode || 13 === keyCode)
            _focusmanager.default.hasExclusiveFocusScope() ||
              (this.currentVisibleMenu && !e.target.closest(".videoOsdPositionSlider")
                ? this.showOsd()
                : e.target.closest("BUTTON") ||
                  (_playbackmanager.default.playPause(this.currentPlayer),
                  shouldOsdBeShown(this) && setTimeout(this.boundShowOsdDefaultParams, 100),
                  _browser.default.edge && (e.preventDefault(), e.stopPropagation())));
          else
            switch (e.key) {
              case "b":
              case "B":
                if (_focusmanager.default.hasExclusiveFocusScope()) return;
                if (e.ctrlKey)
                  return e.shiftKey
                    ? (e.preventDefault(), void rewind(this))
                    : (e.preventDefault(), void _playbackmanager.default.previousChapter(this.currentPlayer));
                break;
              case "f":
              case "F":
                if (_focusmanager.default.hasExclusiveFocusScope()) return;
                if (e.ctrlKey)
                  return e.shiftKey
                    ? (e.preventDefault(), void fastForward(this))
                    : (e.preventDefault(), void _playbackmanager.default.nextChapter(this.currentPlayer));
                _playbackmanager.default.toggleFullscreen(this.currentPlayer);
                break;
              case "m":
              case "M":
                if (_focusmanager.default.hasExclusiveFocusScope()) return;
                _playbackmanager.default.toggleMute(this.currentPlayer);
            }
        }.bind(this));
      _dom.default.addEventListener(window, "keydown", headerElement, {}),
        _mouse.default.requestMouseListening("videoosd");
    }),
    (VideoOsd.prototype.pause = function () {
      this.paused = !0;
      var statsOverlay = this.statsOverlay;
      statsOverlay && statsOverlay.enabled(!1);
      this.subtitleOffsetOverlay && destroySubtitleOffsetOverlay(this);
      statsOverlay = this.boundWindowKeyDown;
      statsOverlay && _dom.default.removeEventListener(window, "keydown", statsOverlay, {}),
        this.headerElement.classList.remove(
          "videoOsdHeader",
          "videoOsdHeader-hidden",
          "hide",
          "videoOsd-customFont",
          "videoOsd-customFont-remotecontrol",
          "videoOsdHeader-tvnowplaying"
        ),
        this.backdropContainer.classList.remove(
          "nowplaying-backdropcontainer-blur",
          "nowplaying-backdropcontainer-blur-high",
          "nowplaying-backdropcontainer-blur-extrasaturation",
          "nowplaying-backdropcontainer-blur-backdropfilter"
        );
      this.backgroundContainer.classList.remove(
        "nowplaying-backgroundcontainer-blur",
        "nowplaying-backgroundcontainer-brighter",
        "nowplaying-backgroundcontainer-blur-backdropfilter"
      ),
        clearBlurFromDocumentElement(this);
      var statsOverlay = this.boundPointerMove,
        statsOverlay =
          (statsOverlay &&
            _dom.default.removeEventListener(
              document,
              window.PointerEvent ? "pointermove" : "mousemove",
              statsOverlay,
              {passive: !0}
            ),
          this.boundInputCommand),
        statsOverlay = (statsOverlay && _inputmanager.default.off(window, statsOverlay), this.boundOnPlayerChange);
      statsOverlay && _events.default.off(_playbackmanager.default, "playerchange", statsOverlay),
        this.enableStopOnBack &&
          ((this.enableStopOnBack = !1),
          (this.enableBackOnStop = !1),
          (statsOverlay = this.currentPlayer) &&
            _playbackmanager.default.isPlayingVideo(statsOverlay) &&
            _playbackmanager.default.stop(statsOverlay)),
        this.releaseCurrentPlayer(),
        _mouse.default.releaseMouseListening("videoosd"),
        stopOsdHideTimer(this),
        _backdrop.default.clear();
    }),
    (VideoOsd.prototype.destroy = function () {
      var videoOsdText = this.videoOsdText,
        videoOsdText =
          (videoOsdText && (_shortcuts.default.off(videoOsdText), (this.videoOsdText = null)),
          destroyPlayQueue(this),
          destroyLyricsRenderer(this),
          this.recordingButtonManager),
        bottomTabControllers =
          (videoOsdText && (videoOsdText.destroy(), (this.recordingButtonManager = null)),
          destroyStats(this),
          destroySubtitleOffsetOverlay(this),
          this.bottomTabControllers);
      if (bottomTabControllers) {
        for (var i = 0, length = bottomTabControllers.length; i < length; i++)
          bottomTabControllers[i] && bottomTabControllers[i].destroy();
        this.bottomTabControllers = null;
      }
      (this.boundPointerMove = null),
        (this.boundWindowKeyDown = null),
        (this.boundInputCommand = null),
        (this.boundHideOsd = null),
        (this.boundShowOsdDefaultParams = null),
        (this.boundOnOsdHideTimeout = null),
        (this.boundOnPlayerChange = null),
        (this.headerElement = null);
    }),
    (_exports.default = VideoOsd);
});
