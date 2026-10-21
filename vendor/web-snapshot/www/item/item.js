define([
  "userSettings",
  "../modules/commandprocessor.js",
  "appSettings",
  "toast",
  "indicators",
  "textEncoding",
  "skinManager",
  "multiSelect",
  "backdrop",
  "appHeader",
  "loading",
  "imageLoader",
  "listView",
  "itemContextMenu",
  "globalize",
  "layoutManager",
  "focusManager",
  "apphost",
  "cardBuilder",
  "dom",
  "appRouter",
  "mediaInfo",
  "connectionManager",
  "itemHelper",
  "datetime",
  "inputManager",
  "events",
  "playbackManager",
  "serverNotifications",
  "baseView",
  "emby-scroller",
  "emby-itemscontainer",
  "emby-linkbutton",
  "emby-downloadbutton",
  "emby-select",
  "flexStyles",
  "css!./item",
], function (
  userSettings,
  commandprocessor,
  appSettings,
  toast,
  indicators,
  textEncoding,
  skinManager,
  MultiSelect,
  backdrop,
  appHeader,
  loading,
  imageLoader,
  listView,
  itemContextMenu,
  globalize,
  layoutManager,
  focusManager,
  appHost,
  cardBuilder,
  dom,
  appRouter,
  mediaInfo,
  connectionManager,
  itemHelper,
  datetime,
  inputManager,
  events,
  playbackManager,
  serverNotifications,
  BaseView
) {
  "use strict";
  function renderTrackSelectionsWithoutUser(page, instance, item, forceReload) {
    connectionManager
      .getApiClient(item.ServerId)
      .getCurrentUser()
      .then(function (user) {
        renderTrackSelections(page, instance, item, user, forceReload);
      });
  }
  function isMediaStreamDisplayed(stream) {
    return "Data" !== stream.Type && "Attachment" !== stream.Type;
  }
  function cloneMediaStream(m) {
    return Object.assign({}, m);
  }
  function renderMediaSources(page, renderAdminFields, item, mediaSources) {
    for (
      var groupedVersions = mediaSources.filter(function (g) {
          return "Grouping" === g.Type;
        }),
        parentElem =
          (renderAdminFields && groupedVersions.length
            ? page.querySelector(".splitVersionContainer").classList.remove("hide")
            : page.querySelector(".splitVersionContainer").classList.add("hide"),
          page.querySelector(".mediaSources")),
        anyDisplayed = !1,
        i = ((parentElem.innerHTML = ""), 0),
        length = mediaSources.length;
      i < length;
      i++
    ) {
      var mediaSource = mediaSources[i];
      !(function (version, renderAdminFields) {
        for (var i = 0, length = version.MediaStreams.length; i < length; i++)
          if (isMediaStreamDisplayed(version.MediaStreams[i])) return 1;
        return (
          version.Container ||
          (version.Formats && version.Formats.length) ||
          (version.Path && "Http" !== version.Protocol && renderAdminFields) ||
          !!version.Size
        );
      })(mediaSource, renderAdminFields) ||
        ((anyDisplayed = !0),
        (function (parentElem, renderAdminFields, item, mediaSource, scrollX) {
          for (
            var elem = document.createElement("div"),
              html = (elem.classList.add("mediaSource"), ""),
              renderAdminFields =
                ((html += scrollX
                  ? '<div class="sectionTitle sectionTitle-cards" style="display:block;padding: 0 .3em .5em;">'
                  : '<div style="display:block;">'),
                mediaSource.Path &&
                  "Http" !== mediaSource.Protocol &&
                  renderAdminFields &&
                  (html += "<div>" + mediaSource.Path + "</div>"),
                (html += "<div>"),
                mediaSource.Container && (html += mediaSource.Container.toUpperCase()),
                mediaSource.Size &&
                  (html += '<span style="margin-left:1em;">' + mediaInfo.sizeToString(mediaSource.Size) + "</span>"),
                new Date(Date.parse(item.DateCreated))),
              mediaStreams =
                ((html +=
                  '<span style="margin-left:1em;">' +
                  globalize.translate(
                    "AddedOnValue",
                    datetime.toLocaleDateString(renderAdminFields) + " " + datetime.getDisplayTime(renderAdminFields)
                  ) +
                  "</span>"),
                (elem.innerHTML = html =
                  (html = html + "</div>" + "</div>") && '<div class="padded-left padded-right">' + html + "</div>"),
                elem.insertAdjacentHTML(
                  "beforeend",
                  scrollX
                    ? '<div is="emby-scroller" class="emby-scroller padded-top-focusscale padded-bottom-focusscale padded-left padded-right" data-mousewheel="false" data-centerfocus="true" data-horizontal="true"><div is="emby-itemscontainer" class="detailMediaStreamsItemsContainer scrollSlider focuscontainer-x itemsContainer focusable" data-focusabletype="nearest"></div></div>'
                    : '<div is="emby-itemscontainer" class="vertical-list itemsContainer padded-left padded-right"></div>'
                ),
                parentElem.appendChild(elem),
                mediaSource.MediaStreams.filter(isMediaStreamDisplayed).map(cloneMediaStream)),
              i = 0,
              length = mediaStreams.length;
            i < length;
            i++
          )
            "Subtitle" === mediaStreams[i].Type &&
              "Audio" === item.MediaType &&
              (mediaStreams[i].SubtitleType = "Lyrics"),
              (mediaStreams[i].StreamType = mediaStreams[i].Type),
              (mediaStreams[i].Type = "MediaStream"),
              (mediaStreams[i].MediaSourceId = mediaSource.Id),
              (mediaStreams[i].ItemId = item.Id),
              (mediaStreams[i].ServerId = item.ServerId);
          scrollX
            ? cardBuilder.buildCards(mediaStreams, {
                shape: "backdrop",
                overlayText: !0,
                fields: ["MediaStreamInfo"],
                itemsContainer: elem.querySelector(".itemsContainer"),
                action: "none",
                multiSelect: !1,
                ratingButton: !1,
                playedButton: !1,
                defaultIcon: !1,
                typeIndicator: !1,
                playedIndicator: !1,
                syncIndicator: !1,
                timerIndicator: !1,
                randomDefaultBackground: !1,
                imageFallback: !1,
                cardPadderClass: layoutManager.tv ? "mediaStreamPadder-tv" : "mediaStreamPadder",
                innerCardFooterClass: "mediaStreamInnerCardFooter",
                enableUserData: !1,
                draggable: !1,
              })
            : listView.buildItems(mediaStreams, {
                image: !1,
                fields: ["MediaStreamInfo"],
                itemsContainer: elem.querySelector(".itemsContainer"),
                action: "none",
                multiSelect: !1,
                ratingButton: !1,
                playedButton: !1,
                defaultIcon: !1,
                typeIndicator: !1,
                playedIndicator: !1,
                syncIndicator: !1,
                timerIndicator: !1,
                randomDefaultBackground: !1,
                imageFallback: !1,
                innerCardFooterClass: "mediaStreamInnerCardFooter",
                enableUserDataButtons: !1,
                draggable: !1,
                itemClass: "detailsListItem",
              });
        })(parentElem, renderAdminFields, item, mediaSource, !0));
    }
    anyDisplayed
      ? page.querySelector(".audioVideoMediaInfo").classList.remove("hide")
      : page.querySelector(".audioVideoMediaInfo").classList.add("hide");
  }
  function isRenderingTrackSelections(item) {
    return !(
      !itemHelper.supportsMediaSourceSelection(item) ||
      -1 === playbackManager.getSupportedCommands().indexOf("PlayMediaSource") ||
      !playbackManager.canPlay(item)
    );
  }
  function renderTrackSelections(page, instance, item, user, forceReload, mediaSources) {
    var select = page.querySelector(".selectSource");
    if (!isRenderingTrackSelections(item))
      return (
        renderMediaSources(page, user.Policy.IsAdministrator, item, item.MediaSources || []),
        (instance._currentPlaybackMediaSources = []),
        instance.trackSelectionsContainer.classList.add("hide"),
        (select.innerHTML = ""),
        (page.querySelector(".selectVideo").innerHTML = ""),
        (page.querySelector(".selectAudio").innerHTML = ""),
        (page.querySelector(".selectSubtitles").innerHTML = ""),
        select.setAttribute("disabled", "disabled"),
        void updateTrackSelectionsFocusState(instance, page)
      );
    (mediaSources ? Promise.resolve(mediaSources) : playbackManager.getPlaybackMediaSources(item)).then(function (
      mediaSources
    ) {
      var renderAdminFields = user.Policy.IsAdministrator,
        renderAdminFields =
          (renderMediaSources(page, renderAdminFields, item, mediaSources),
          (instance._currentPlaybackMediaSources = mediaSources),
          instance.trackSelectionsContainer.classList.remove("hide"),
          select.setLabel(globalize.translate("LabelVersion")),
          select.value),
        selectedId = mediaSources[0].Id;
      (select.innerHTML = mediaSources
        .map(function (v) {
          var selected = v.Id === selectedId ? " selected" : "";
          return '<option value="' + v.Id + '"' + selected + ">" + v.Name + "</option>";
        })
        .join("")),
        1 < mediaSources.length
          ? (select.removeAttribute("disabled"), page.querySelector(".selectSourceContainer").classList.remove("hide"))
          : (page.querySelector(".selectSourceContainer").classList.add("hide"),
            select.setAttribute("disabled", "disabled")),
        (select.value === renderAdminFields && !forceReload) ||
          (renderVideoSelections(page, mediaSources),
          renderAudioSelections(page, mediaSources),
          renderSubtitleSelections(page, mediaSources),
          updateTrackSelectionsFocusState(instance, page));
    });
  }
  function renderVideoSelections(page, mediaSources) {
    var mediaSourceId = page.querySelector(".selectSource").value,
      mediaSources = mediaSources
        .filter(function (m) {
          return m.Id === mediaSourceId;
        })[0]
        .MediaStreams.filter(function (m) {
          return "Video" === m.Type;
        }),
      select = page.querySelector(".selectVideo"),
      selectedId =
        (select.setLabel(globalize.translate("LabelVideo")), mediaSources.length ? mediaSources[0].Index : -1);
    (select.innerHTML = mediaSources
      .map(function (v) {
        var selected = v.Index === selectedId ? " selected" : "",
          titleParts = [],
          resolutionText = mediaInfo.getResolutionText(v);
        return (
          resolutionText && titleParts.push(resolutionText),
          v.Codec && titleParts.push(v.Codec.toUpperCase()),
          '<option value="' + v.Index + '" ' + selected + ">" + (v.DisplayTitle || titleParts.join(" ")) + "</option>"
        );
      })
      .join("")),
      select.setAttribute("disabled", "disabled"),
      mediaSources.length
        ? page.querySelector(".selectVideoContainer").classList.remove("hide")
        : page.querySelector(".selectVideoContainer").classList.add("hide");
  }
  function renderAudioSelections(page, mediaSources) {
    var mediaSourceId = page.querySelector(".selectSource").value,
      mediaSources = mediaSources.filter(function (m) {
        return m.Id === mediaSourceId;
      })[0],
      tracks = mediaSources.MediaStreams.filter(function (m) {
        return "Audio" === m.Type;
      }),
      select = page.querySelector(".selectAudio"),
      selectedId = (select.setLabel(globalize.translate("LabelAudio")), mediaSources.DefaultAudioStreamIndex);
    (select.innerHTML = tracks
      .map(function (v) {
        var selected = v.Index === selectedId ? " selected" : "",
          embeddedTitle = v.Title && !(v.DisplayTitle || "").includes(v.Title) ? v.Title : null;
        return (
          "<option" +
          (embeddedTitle ? ' title="' + embeddedTitle + '"' : "") +
          ' value="' +
          v.Index +
          '" ' +
          selected +
          ">" +
          v.DisplayTitle +
          "</option>"
        );
      })
      .join("")),
      1 < tracks.length ? select.removeAttribute("disabled") : select.setAttribute("disabled", "disabled"),
      tracks.length
        ? page.querySelector(".selectAudioContainer").classList.remove("hide")
        : page.querySelector(".selectAudioContainer").classList.add("hide");
  }
  function renderSubtitleSelections(page, mediaSources) {
    var selected,
      mediaSourceId = page.querySelector(".selectSource").value,
      mediaSources = mediaSources.filter(function (m) {
        return m.Id === mediaSourceId;
      })[0],
      tracks = mediaSources.MediaStreams.filter(function (m) {
        return "Subtitle" === m.Type;
      }),
      select = page.querySelector(".selectSubtitles"),
      selectedId =
        (select.setLabel(globalize.translate("LabelSubtitles")),
        null == mediaSources.DefaultSubtitleStreamIndex ? -1 : mediaSources.DefaultSubtitleStreamIndex);
    tracks.length
      ? ((selected = -1 === selectedId ? " selected" : ""),
        (select.innerHTML =
          '<option value="-1">' +
          globalize.translate("Off") +
          "</option>" +
          tracks
            .map(function (v) {
              selected = v.Index === selectedId ? " selected" : "";
              var embeddedTitle = v.Title && !(v.DisplayTitle || "").includes(v.Title) ? v.Title : null;
              return (
                "<option" +
                (embeddedTitle ? ' title="' + embeddedTitle + '"' : "") +
                ' value="' +
                v.Index +
                '" ' +
                selected +
                ">" +
                v.DisplayTitle +
                "</option>"
              );
            })
            .join("")),
        select.classList.remove("noSelections"),
        page.querySelector(".selectSubtitlesContainer").classList.remove("hide"))
      : ((select.innerHTML = ""),
        select.classList.add("noSelections"),
        page.querySelector(".selectSubtitlesContainer").classList.add("hide"));
  }
  function setButtonText(page, query, html) {
    for (var elems = page.querySelectorAll(query), i = 0, length = elems.length; i < length; i++) {
      elems[i].innerHTML = html;
      var btn = elems[i].closest("button");
      btn && ((btn.title = html), btn.setAttribute("aria-label", html));
    }
  }
  function setResumeProgress(resumeInfoElement, item) {
    var ticksLeft,
      resumeInfoElement = resumeInfoElement.querySelector(".resumeProgress");
    item.UserData && 0 < item.UserData.PlaybackPositionTicks && item.RunTimeTicks
      ? ((ticksLeft = item.RunTimeTicks - item.UserData.PlaybackPositionTicks),
        (ticksLeft =
          '<div class="resumeTimeRemaining secondaryText">' +
          globalize.translate("TimeRemainingValue", datetime.getHumanReadableRuntime(ticksLeft)) +
          "</div>"),
        (resumeInfoElement.innerHTML =
          indicators.getProgressBarHtml(item, {containerClass: "resumeInfoProgressBar"}) + ticksLeft),
        resumeInfoElement.classList.remove("hide"))
      : resumeInfoElement.classList.add("hide");
  }
  function setNextUpButtonText(instance, page) {
    !function (query) {
      var item = this.currentItem,
        apiClient = connectionManager.getApiClient(item);
      return "MusicAlbum" !== item.Type
        ? apiClient.getNextUpEpisodes(
            Object.assign(
              {
                SeriesId: item.Id,
                Fields: this.requestedItemFields + ",PrimaryImageAspectRatio",
                ImageTypeLimit: 1,
                UserId: apiClient.getCurrentUserId(),
              },
              query
            )
          )
        : apiClient.getNextUpAudioBookItems(
            Object.assign(
              {
                AlbumId: item.Id,
                Fields: this.requestedItemFields + ",PrimaryImageAspectRatio",
                ImageTypeLimit: 1,
                UserId: apiClient.getCurrentUserId(),
              },
              query
            )
          );
    }
      .call(instance, {Limit: 1})
      .then(function (result) {
        var resumeName,
          result = result.Items[0],
          resumeInfo = page.querySelector(".detailResumeInfo");
        result
          ? (((resumeName = resumeInfo.querySelector(".resumeName")).innerHTML = itemHelper.getDisplayName(result)),
            resumeName.classList.remove("hide"),
            setResumeProgress(resumeInfo, result),
            result.UserData && 0 < result.UserData.PlaybackPositionTicks
              ? setButtonText(page, ".resumeButtonText", globalize.translate("Resume"))
              : setButtonText(page, ".resumeButtonText", globalize.translate("Play")),
            resumeInfo.classList.remove("hide"))
          : (setButtonText(page, ".resumeButtonText", globalize.translate("Play")), resumeInfo.classList.add("hide"));
      });
  }
  function reloadPlayButtons(instance, page, item, isUserDataChangeEvent) {
    var now,
      activeElement,
      isPlayFocused,
      btnPlay,
      btnResume,
      btnPlayTrailer,
      btnShuffle,
      playButtons = page.querySelectorAll(".btnPlay");
    "Program" === item.Type
      ? ((now = new Date()) >= new Date(Date.parse(item.StartDate)) && now < new Date(Date.parse(item.EndDate))
          ? hideAll(page, playButtons, !0)
          : hideAll(page, playButtons),
        hideAll(page, "btnResume"),
        hideAll(page, "detailResumeInfo"),
        hideAll(page, "btnShuffle"),
        hideAll(page, "btnQueue"),
        setButtonText(page, ".playButtonText", globalize.translate("Play")))
      : playbackManager.canPlay(item)
      ? (hideAll(page, "btnPlay", !0),
        (now = item.IsFolder || -1 !== ["MusicAlbum", "MusicGenre", "MusicArtist"].indexOf(item.Type)),
        "MusicAlbum" === item.Type && item.SupportsResume && (now = !1),
        hideAll(page, "btnShuffle", (now = "Season" !== item.Type && "Series" !== item.Type ? now : !1)),
        (isPlayFocused =
          (activeElement = document.activeElement) &&
          activeElement.classList &&
          (activeElement.classList.contains("btnResume") || activeElement.classList.contains("btnMainPlay"))),
        (btnPlay = page.querySelector(".btnPlay")),
        (btnResume = page.querySelector(".btnResume")),
        (btnPlayTrailer = page.querySelector(".btnPlayTrailer-main")),
        (btnShuffle = page.querySelector(".btnShuffle")),
        "Series" === item.Type || ("MusicAlbum" === item.Type && item.SupportsResume)
          ? (btnResume.classList.add("detailButton-primary"),
            btnPlay.classList.remove("detailButton-primary", "detailButton-highres3"),
            setNextUpButtonText(instance, page),
            setButtonText(page, ".playButtonText", globalize.translate("PlayFromBeginning")),
            btnPlay.classList.remove("detailButton-stacked"),
            btnShuffle.classList.remove("detailButton-stacked"),
            isTrailerButtonVisible(item)
              ? (btnPlayTrailer.classList.add("detailButton-stacked"), btnResume.classList.add("detailButton-stacked"))
              : (btnPlayTrailer.classList.remove("detailButton-stacked"),
                btnResume.classList.remove("detailButton-stacked")),
            hideAll(page, "detailResumeInfo", !0),
            hideAll(page, "btnResume", !0),
            hideAll(page, "btnPlay", now))
          : ((instance = item.UserData && 0 < item.UserData.PlaybackPositionTicks)
              ? (btnResume.classList.add("detailButton-primary", "detailButton-stacked"),
                btnPlay.classList.remove("detailButton-primary", "detailButton-stacked"),
                btnPlay.classList.add("detailButton-highres3"),
                btnPlayTrailer.classList.add("detailButton-stacked"),
                btnShuffle.classList.remove("detailButton-stacked"),
                globalize.translate("ResumeAt", datetime.getDisplayRunningTime(item.UserData.PlaybackPositionTicks)),
                setButtonText(page, ".playButtonText", globalize.translate("PlayFromBeginning")),
                hideAll(page, "detailResumeInfo", !0),
                hideAll(page, "resumeName"),
                setResumeProgress(page.querySelector(".detailResumeInfo"), item))
              : (btnPlay.classList.add("detailButton-primary"),
                btnPlay.classList.remove("detailButton-highres3"),
                now
                  ? (btnPlayTrailer.classList.remove("detailButton-stacked"),
                    btnResume.classList.remove("detailButton-stacked"),
                    btnShuffle.classList.add("detailButton-stacked"),
                    btnPlay.classList.add("detailButton-stacked"))
                  : (isTrailerButtonVisible(item)
                      ? (btnPlay.classList.add("detailButton-stacked"),
                        btnResume.classList.remove("detailButton-stacked"),
                        btnPlayTrailer.classList.add("detailButton-stacked"))
                      : (btnPlay.classList.remove("detailButton-stacked"),
                        btnResume.classList.remove("detailButton-stacked"),
                        btnPlayTrailer.classList.remove("detailButton-stacked")),
                    btnShuffle.classList.remove("detailButton-stacked")),
                setButtonText(page, ".playButtonText", globalize.translate("Play"))),
            hideAll(page, "detailResumeInfo", instance),
            hideAll(page, "btnResume", instance)),
        isUserDataChangeEvent || hideAll(page, "btnQueue", playbackManager.canQueue(item)),
        isPlayFocused && focusMainSection.call(activeElement.parentNode))
      : (hideAll(page, playButtons),
        hideAll(page, "btnQueue"),
        hideAll(page, "btnResume"),
        hideAll(page, "detailResumeInfo"),
        hideAll(page, "btnShuffle"));
  }
  function focusMainSection() {
    for (var btns = this.querySelectorAll(".detailButton"), i = 0, length = btns.length; i < length; i++) {
      var btn = btns[i];
      if (focusManager.isCurrentlyFocusable(btn))
        try {
          return void focusManager.focus(btn);
        } catch (err) {}
    }
    focusManager.autoFocus(this);
  }
  function logoImageUrl(item, apiClient, options) {
    options = options || {};
    var logoTypes = skinManager.getPreferredLogoImageTypes();
    return apiClient.getLogoImageUrl(item, options, logoTypes);
  }
  function setTitle(item, apiClient, enableLogo) {
    enableLogo = (enableLogo = "TvChannel" === item.Type ? !1 : enableLogo) ? logoImageUrl(item, apiClient, {}) : null;
    enableLogo
      ? (((item = document.querySelector(".pageTitle")).style.backgroundImage = "url('" + enableLogo + "')"),
        item.classList.add("pageTitleWithLogo"),
        (item.innerHTML = ""))
      : appHeader.setTitle("");
  }
  function renderFloatingLogo(page, item, apiClient) {
    apiClient = logoImageUrl(item, apiClient, {maxWidth: 300});
    "float" === getLogoPlacement(item) &&
      ((item = page.querySelector(".detailLogo")),
      (page = page.querySelector(".detailLogoContainer")),
      apiClient
        ? ((item.style.backgroundImage = "url('" + apiClient + "')"), page.classList.remove("hide"))
        : page.classList.add("hide"));
  }
  function getLogoPlacement(item) {
    return "TvChannel" === item.Type
      ? null
      : (("MusicAlbum" !== item.Type && "Audio" !== item.Type && "MusicVideo" !== item.Type) ||
          (item.ImageTags && item.ImageTags.Logo)) &&
        userSettings.getEnableLogoAsTitle(globalize.getCurrentLocale())
      ? "title"
      : "float";
  }
  function getArtistLinksHtml(artists, serverId) {
    for (var html = [], i = 0, length = artists.length; i < length; i++) {
      var artist = artists[i],
        href = appRouter.getRouteUrl(artist, {itemType: "MusicArtist", serverId: serverId});
      html.push(
        '<a style="font-weight:inherit;" class="button-link button-link-color-inherit" is="emby-linkbutton" href=".' +
          href +
          '">' +
          textEncoding.htmlEncode(artist.Name) +
          "</a>"
      );
    }
    return (html = html.join(" / "));
  }
  function inferContext(item) {
    switch (item.Type) {
      case "Series":
      case "Season":
      case "Episode":
        return "tvshows";
      case "Movie":
        return "movies";
      case "Game":
      case "GameSystem":
        return "games";
      case "MusicArtist":
      case "MusicAlbum":
      case "Audio":
      case "AudioBook":
        return "music";
      case "Program":
      case "TvChannel":
      case "Timer":
      case "SeriesTimer":
        return "livetv";
      default:
        return null;
    }
  }
  function isTrailerButtonVisible(item) {
    if (playbackManager.getSupportedCommands().includes("PlayTrailers")) {
      if (item.LocalTrailerCount) return 1;
      if (item.RemoteTrailers && item.RemoteTrailers.length) return 1;
    }
  }
  function setTrailerButtonVisibility(page, item) {
    isTrailerButtonVisible(item) ? hideAll(page, "btnPlayTrailer", !0) : hideAll(page, "btnPlayTrailer");
  }
  function enableTrackList(item) {
    return !!layoutManager.tv && ("Playlist" === item.Type || ("MusicAlbum" === item.Type && !item.SupportsResume));
  }
  function enableItemBackdropAsTopImage(item) {
    return "Playlist" !== item.Type && "MusicAlbum" !== item.Type && "TvChannel" !== item.Type && "Audio" !== item.Type;
  }
  function hideAll(page, className, show) {
    for (
      var elems = "string" == typeof className ? page.querySelectorAll("." + className) : className,
        i = 0,
        length = elems.length;
      i < length;
      i++
    )
      show ? elems[i].classList.remove("hide") : elems[i].classList.add("hide");
  }
  function getContextMenuOptions(view, item, user, button) {
    (view = view.querySelector(".selectSource")),
      (item = {
        item: item,
        open: !1,
        play: !1,
        playFromBeginning: !0,
        playAllFromHere: !1,
        queueAllFromHere: !1,
        positionTo: button,
        cancelTimer: !1,
        record: !1,
        deleteItem: !0,
        shuffle: !0,
        instantMix: !0,
        user: user,
        share: !0,
        mediaSourceId: (view && view.value) || null,
        positionY: "center",
        positionX: "right",
        transformOrigin: "left top",
        played: !1,
        favorites: !1,
        navigateOnDelete: "back",
        showSeries: !0,
        showSeason: !0,
      });
    return appHost.supports("sync") && (item.syncLocal = !1), item;
  }
  function renderDetails(instance, view, item, apiClient, user) {
    var promises = [],
      overviewElem = view.querySelector(".overview-container"),
      overviewTextElem = overviewElem.querySelector(".overview-text"),
      itemForDetails =
        (enableTrackList(item)
          ? overviewTextElem.classList.add("overview-text-tracklist")
          : overviewTextElem.classList.remove("overview-text-tracklist"),
        ("Timer" === item.Type && item.ProgramInfo) || item),
      overview = itemForDetails.Overview;
    overview
      ? ((function (elem, overview) {
          var textElement = elem.querySelector(".overview-text"),
            btnReadMore = elem.querySelector(".btnReadMore");
          if (((btnReadMore.innerHTML = globalize.translate("HeaderReadMore") + '<i class="md-icon" style="font-size:1.3em;">arrow_drop_down</i>'), !overview))
            return elem.classList.add("hide"), (textElement.innerHTML = "");
          (textElement.innerHTML = overview), elem.classList.remove("hide");
          var overview = textElement.offsetHeight,
            scrollHeight = textElement.scrollHeight,
            textElement = textElement.closest("button");
          overview && scrollHeight && overview < scrollHeight
            ? (!1
                ? (textElement.removeAttribute("disabled"),
                  textElement.classList.remove("btnOverviewText-allowselection"),
                  btnReadMore.classList.add("hide"))
                : (textElement.setAttribute("disabled", "disabled"),
                  textElement.classList.add("btnOverviewText-allowselection"),
                  btnReadMore.classList.remove("hide")),
              setScopedFocus(null, elem, !0))
            : (textElement.setAttribute("disabled", "disabled"),
              layoutManager.tv
                ? textElement.classList.remove("btnOverviewText-allowselection")
                : textElement.classList.add("btnOverviewText-allowselection"),
              btnReadMore.classList.add("hide"),
              setScopedFocus(null, elem, !1));
        })(overviewElem, overview ? dom.stripScripts(overview) : ""),
        "MusicAlbum" === itemForDetails.Type || "Playlist" === itemForDetails.Type
          ? overviewTextElem.classList.add("overview-twoline")
          : overviewTextElem.classList.remove("overview-twoline"))
      : overviewElem.classList.add("hide"),
      (function (page, item) {
        var directors = (item.People || []).filter(function (p) {
            return "Director" === p.Type;
          }),
          html = directors
            .map(function (p) {
              return layoutManager.tv
                ? "<span>" + textEncoding.htmlEncode(p.Name) + "</span>"
                : '<a class="button-link button-link-color-inherit" is="emby-linkbutton" href=".' +
                    appRouter.getRouteUrl({Name: p.Name, Type: "Person", ServerId: item.ServerId, Id: p.Id}, {}) +
                    '">' +
                    textEncoding.htmlEncode(p.Name) +
                    "</a>";
            })
            .join(", ");
        ((page = page.querySelector(".directors")).innerHTML =
          1 < directors.length
            ? globalize.translate("DirectorsValue", html)
            : globalize.translate("DirectorValue", html)),
          directors.length && !layoutManager.tv ? page.classList.add("focusable") : page.classList.remove("focusable"),
          directors.length ? page.classList.remove("hide") : page.classList.add("hide");
      })(view, itemForDetails),
      reloadPlayButtons(instance, view, item),
      (function (page, item) {
        var btnAutoPlays = page.querySelectorAll(".btnAutoPlay");
        var enabled = navigator.userAgent.includes("wv")
          ? appSettings.enableSystemExternalPlayers()
          : JSON.parse(appSettings.get("externalplayers") || "[]").some(item => {
              return item["videotype-file"];
            });
        for (var i = 0, length = btnAutoPlays.length; i < length; i++) {
          var btnAutoPlay = btnAutoPlays[i];
          enabled && (item.Type == "Series" || item.Type == "Season" || item.Type == "Episode")
            ? btnAutoPlay.classList.remove("hide")
            : btnAutoPlay.classList.add("hide");
        }
        updateAutoplayButton();
      })(view, item),
      (function (page, item) {
        for (
          var btnPlaystates = page.querySelectorAll(".btnPlaystate"), i = 0, length = btnPlaystates.length;
          i < length;
          i++
        ) {
          var btnPlaystate = btnPlaystates[i];
          itemHelper.canMarkPlayed(item)
            ? (btnPlaystate.classList.remove("hide"), btnPlaystate.setItem(item))
            : (btnPlaystate.classList.add("hide"), btnPlaystate.setItem(null));
        }
        var btnUserRatings = page.querySelectorAll(".btnUserRating");
        for (i = 0, length = btnUserRatings.length; i < length; i++) {
          var btnUserRating = btnUserRatings[i];
          itemHelper.canRate(item)
            ? (btnUserRating.classList.remove("hide"), btnUserRating.setItem(item))
            : (btnUserRating.classList.add("hide"), btnUserRating.setItem(null));
        }
      })(view, item),
      setTrailerButtonVisibility(view, item),
      "TvChannel" === item.Type && apiClient.isMinServerVersion("4.7.0.34")
        ? hideAll(view, "btnManualRecording", !0)
        : hideAll(view, "btnManualRecording"),
      item.CanDelete && !item.IsFolder && "MusicArtist" !== item.Type
        ? hideAll(view, "btnDeleteItem", !0)
        : hideAll(view, "btnDeleteItem"),
      promises.push(
        (function (instance, page, item, user) {
          if (instance.currentRecordingFields) return instance.currentRecordingFields.refresh(item), Promise.resolve();
          return "Program" === item.Type && user.Policy.EnableLiveTvManagement
            ? require(["recordingFields"]).then(function (responses) {
                var responses = responses[0],
                  recordingFieldsElement = page.querySelector(".mainDetailButtons");
                (instance.currentRecordingFields = new responses({parent: recordingFieldsElement, program: item})),
                  events.on(instance.currentRecordingFields, "recordingchanged", onRecordingChanged.bind(instance)),
                  events.on(
                    instance.currentRecordingFields,
                    "seriesrecordingchanged",
                    onRecordingChanged.bind(instance)
                  );
              })
            : Promise.resolve();
        })(instance, view, item, user)
      );
    itemContextMenu.getCommands(getContextMenuOptions(view, item, user)).length
      ? hideAll(view, "btnMoreCommands", !0)
      : hideAll(view, "btnMoreCommands");
    var hasFocusElements,
      overview = view.querySelector(".mediaInfoPrimary"),
      overviewTextElem =
        ("Season" === item.Type || "SeriesTimer" === item.Type
          ? (overview.classList.add("hide"), overview.classList.remove("focuscontainer-x"))
          : (mediaInfo.fillPrimaryMediaInfo(overview, itemForDetails, {
              interactive: !0,
              episodeTitle: !1,
              subtitles: !1,
              dateAdded: !1,
              genres: !0,
              context: inferContext(itemForDetails),
              endsAt: !1,
              bitrate: "Audio" === itemForDetails.MediaType,
              runtime: "Timer" !== item.Type,
            }),
            (hasFocusElements = null != overview.querySelector("a,button")),
            setScopedFocus(null, overview, hasFocusElements, "nearest"),
            hasFocusElements
              ? overview.classList.add("focuscontainer-x")
              : overview.classList.remove("focuscontainer-x")),
        enableItemBackdropAsTopImage(itemForDetails)
          ? (overview.classList.remove("mediaInfo-centered", "secondaryText"),
            view.querySelector(".detailTextContainerInner").classList.remove("detailTextContainerInner-centered"))
          : (overview.classList.add("mediaInfo-centered", "secondaryText"),
            view.querySelector(".detailTextContainerInner").classList.add("detailTextContainerInner-centered")),
        enableTvDetailImageLayout(item) && "Season" !== item.Type
          ? view.querySelector(".detailTextContainer").classList.add("detailTextContainer-extrapadding")
          : view.querySelector(".detailTextContainer").classList.remove("detailTextContainer-extrapadding"),
        (overview = view.querySelector(".mediaInfoSecondary")),
        mediaInfo.fillSecondaryMediaInfo(overview, item, {interactive: !0}),
        (hasFocusElements = null != overview.querySelector("a,button")),
        setScopedFocus(null, overview, hasFocusElements, "nearest"),
        hasFocusElements ? overview.classList.add("focuscontainer-x") : overview.classList.remove("focuscontainer-x"),
        overview.innerHTML.trim() ? overview.classList.remove("hide") : overview.classList.add("hide"),
        view.querySelector(".tagline"));
    return (
      itemForDetails.Taglines && itemForDetails.Taglines.length
        ? (overviewTextElem.classList.remove("hide"),
          (overviewTextElem.innerHTML = dom.stripScripts(itemForDetails.Taglines[0])))
        : overviewTextElem.classList.add("hide"),
      "Person" === itemForDetails.Type &&
        ((overviewElem = view.querySelector(".birthDate")),
        itemForDetails.PremiereDate
          ? ((apiClient = datetime.toLocaleDateString(new Date(Date.parse(itemForDetails.PremiereDate)), {
              year: "numeric",
              month: "long",
              day: "numeric",
            })),
            (apiClient =
              itemForDetails.ProductionLocations && itemForDetails.ProductionLocations.length
                ? globalize.translate("BornValueWithPlace", apiClient, itemForDetails.ProductionLocations[0])
                : globalize.translate("BornValue", apiClient)),
            (overviewElem.innerHTML = apiClient),
            overviewElem.classList.remove("hide"))
          : overviewElem.classList.add("hide"),
        (instance = view.querySelector(".deathDate")),
        itemForDetails.EndDate
          ? ((user = datetime.toLocaleDateString(new Date(Date.parse(itemForDetails.EndDate)), {
              year: "numeric",
              month: "long",
              day: "numeric",
            })),
            (user = globalize.translate("DiedValue", user)),
            (instance.innerHTML = user),
            instance.classList.remove("hide"))
          : instance.classList.add("hide")),
      (function (page, item) {
        for (
          var itemTags = page.querySelector(".itemTags"),
            tagElements = [],
            tags = item.TagItems || [],
            i = 0,
            length = tags.length;
          i < length;
          i++
        ) {
          var href = appRouter.getRouteUrl(
            {Name: tags[i].Name, Type: "Tag", ServerId: item.ServerId, Id: tags[i].Id},
            {itemTypes: "Person" === item.Type || "MusicArtist" === item.Type ? item.Type : null}
          );
          tagElements.push(
            '<a is="emby-linkbutton" class="raised item-tag-button nobackdropfilter" href=".' +
              href +
              '"><i class="md-icon button-icon button-icon-left autortl">&#xe892;</i>' +
              textEncoding.htmlEncode(tags[i].Name) +
              "</a>"
          );
        }
        (itemTags.innerHTML = tagElements.join("")),
          tagElements.length
            ? page.querySelector(".tagsSection").classList.remove("hide")
            : page.querySelector(".tagsSection").classList.add("hide");
      })(view, item),
      Promise.all(promises)
    );
  }
  function onRecordingChanged() {
    reloadItem(this, !0);
  }
  function renderPeopleItems(view, item, apiClient) {
    view = view.querySelector(".peopleItems");
    if ("Person" !== item.Type && "MusicArtist" !== item.Type) view.classList.add("hide");
    else {
      view.classList.remove("hide");
      for (
        var sections = [],
          sectionElems =
            ("Person" === item.Type
              ? (sections.push({name: globalize.translate("HeaderUpcomingOnTV"), type: "Program"}),
                sections.push({name: globalize.translate("Movies"), type: "Movie"}),
                sections.push({name: globalize.translate("Shows"), type: "Series"}),
                sections.push({name: globalize.translate("Episodes"), type: "Episode"}),
                sections.push({name: globalize.translate("Trailers"), type: "Trailer"}),
                sections.push({name: globalize.translate("HeaderMusicVideos"), type: "MusicVideo"}),
                sections.push({name: globalize.translate("Videos"), type: "Video"}))
              : "MusicArtist" === item.Type &&
                sections.push({name: globalize.translate("HeaderMusicVideos"), type: "MusicVideo"}),
            (view.innerHTML = sections
              .map(function (section) {
                var html = "";
                return (
                  (html += '<div class="verticalSection personSection" data-type="' + section.type + '">') +
                  '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">' +
                  ('<a is="emby-sectiontitle" href="' +
                    (function (item, type) {
                      return "Genre" === item.Type
                        ? "list/list.html?type=" + type + "&genreId=" + item.Id + "&serverId=" + item.ServerId
                        : "MusicGenre" === item.Type
                        ? "list/list.html?type=" + type + "&musicGenreId=" + item.Id + "&serverId=" + item.ServerId
                        : "GameGenre" === item.Type
                        ? "list/list.html?type=" + type + "&gameGenreId=" + item.Id + "&serverId=" + item.ServerId
                        : "Studio" === item.Type
                        ? "list/list.html?type=" + type + "&studioId=" + item.Id + "&serverId=" + item.ServerId
                        : "MusicArtist" === item.Type
                        ? "list/list.html?type=" + type + "&artistId=" + item.Id + "&serverId=" + item.ServerId
                        : "Person" === item.Type
                        ? "list/list.html?type=" + type + "&personId=" + item.Id + "&serverId=" + item.ServerId
                        : "list/list.html?type=" + type + "&parentId=" + item.Id + "&serverId=" + item.ServerId;
                    })(item, section.type) +
                    '" class="button-link  button-link-color-inherit sectionTitleTextButton">') +
                  '<h2 class="sectionTitle sectionTitle-cards">' +
                  section.name +
                  "</h2>" +
                  "</a>" +
                  "</div>" +
                  '<div is="emby-scroller" class="emby-scroller padded-top-focusscale padded-bottom-focusscale padded-left padded-right" data-mousewheel="false" data-centerfocus="true" data-horizontal="true">' +
                  '<div is="emby-itemscontainer" class="scrollSlider focuscontainer-x itemsContainer"></div>' +
                  "</div>" +
                  "</div>" +
                  "</div>"
                );
              })
              .join("")),
            view.querySelectorAll(".personSection")),
          i = 0,
          length = sectionElems.length;
        i < length;
        i++
      )
        !(function (item, element, type, apiClient) {
          switch (type) {
            case "Program":
              loadPeopleItems(
                element,
                item,
                0,
                {IncludeItemTypes: "Program", Limit: 12, SortBy: "StartDate", Fields: "PrimaryImageAspectRatio"},
                {
                  shape: "autooverflow",
                  fields: ["Name", "ChannelName"],
                  centerText: !0,
                  preferThumb: !0,
                  overlayText: !1,
                  showAirTime: !0,
                  showAirDateTime: !0,
                },
                apiClient
              );
              break;
            case "Movie":
              loadPeopleItems(
                element,
                item,
                0,
                {IncludeItemTypes: "Movie", Limit: 12, SortBy: "SortName", Fields: "PrimaryImageAspectRatio"},
                {shape: "autooverflow", fields: ["Name", "ProductionYear"], centerText: !0, overlayText: !1},
                apiClient
              );
              break;
            case "Video":
              loadPeopleItems(
                element,
                item,
                0,
                {IncludeItemTypes: "Video", Limit: 12, SortBy: "SortName", Fields: "PrimaryImageAspectRatio"},
                {shape: "autooverflow", fields: ["Name", "ProductionYear"], centerText: !0, overlayText: !1},
                apiClient
              );
              break;
            case "MusicVideo":
              loadPeopleItems(
                element,
                item,
                0,
                {IncludeItemTypes: "MusicVideo", Limit: 12, SortBy: "SortName", Fields: "PrimaryImageAspectRatio"},
                {shape: "autooverflow", fields: ["Name"], centerText: !0, overlayPlayButton: !0},
                apiClient
              );
              break;
            case "Game":
              loadPeopleItems(
                element,
                item,
                0,
                {IncludeItemTypes: "Game", Limit: 12, SortBy: "SortName", Fields: "PrimaryImageAspectRatio"},
                {shape: "autooverflow", fields: ["Name"], centerText: !0},
                apiClient
              );
              break;
            case "Trailer":
              loadPeopleItems(
                element,
                item,
                0,
                {IncludeItemTypes: "Trailer", Limit: 12, SortBy: "SortName", Fields: "PrimaryImageAspectRatio"},
                {shape: "autooverflow", fields: ["Name"], centerText: !0, overlayPlayButton: !0},
                apiClient
              );
              break;
            case "Series":
              loadPeopleItems(
                element,
                item,
                0,
                {IncludeItemTypes: "Series", Limit: 12, SortBy: "SortName", Fields: "PrimaryImageAspectRatio"},
                {shape: "autooverflow", fields: ["Name"], centerText: !0},
                apiClient
              );
              break;
            case "MusicAlbum":
              loadPeopleItems(
                element,
                item,
                0,
                {
                  IncludeItemTypes: "MusicAlbum",
                  Limit: 12,
                  SortBy: "ProductionYear,SortName",
                  SortOrder: "Descending,Ascending",
                  Fields: "ProductionYear,PrimaryImageAspectRatio",
                },
                {
                  shape: "autooverflow",
                  playFromHere: !0,
                  fields: ["Name", "ProductionYear"],
                  centerText: !0,
                  overlayPlayButton: !0,
                },
                apiClient
              );
              break;
            case "MusicArtist":
              loadPeopleItems(
                element,
                item,
                0,
                {IncludeItemTypes: "MusicArtist", Limit: 8, SortBy: "SortName", Fields: "PrimaryImageAspectRatio"},
                {
                  shape: "autooverflow",
                  playFromHere: !0,
                  fields: ["ParentName", "Name"],
                  centerText: !0,
                  overlayPlayButton: !0,
                },
                apiClient
              );
              break;
            case "Episode":
              loadPeopleItems(
                element,
                item,
                0,
                {
                  IncludeItemTypes: "Episode",
                  Limit: 6,
                  SortBy: "SeriesSortName,ParentIndexNumber,IndexNumber,SortName",
                  Fields: "PrimaryImageAspectRatio",
                },
                {shape: "autooverflow", fields: ["ParentName", "Name"], centerText: !0, overlayPlayButton: !0},
                apiClient
              );
              break;
            case "Audio":
              loadPeopleItems(
                element,
                item,
                0,
                {IncludeItemTypes: "Audio", SortBy: "AlbumArtist,Album,SortName", Fields: "PrimaryImageAspectRatio"},
                {playFromHere: !0, action: "playallfromhere", smallIcon: !0, artist: !0},
                apiClient
              );
          }
        })(item, sectionElems[i], sectionElems[i].getAttribute("data-type"), apiClient);
    }
  }
  function loadPeopleItems(element, item, type, query, listOptions, apiClient) {
    (query.SortOrder = "Ascending"),
      (query.Recursive = !0),
      (query.CollapseBoxSetItems = !1),
      (query.Fields = "PrimaryImageAspectRatio,ProductionYear"),
      "Person" === item.Type ? (query.PersonIds = item.Id) : "MusicArtist" === item.Type && (query.ArtistIds = item.Id),
      (query.ImageTypeLimit = 1),
      (query.EnableTotalRecordCount = !1),
      apiClient.getItems(apiClient.getCurrentUserId(), query).then(function (result) {
        cardBuilder.buildCards(result.Items, {
          parentContainer: element,
          itemsContainer: element.querySelector(".itemsContainer"),
          shape: listOptions.shape,
          fields: listOptions.fields,
          overlayText: !1,
          centerText: !0,
        });
      });
  }
  function onTrackSelectionsSubmit(e) {
    return e.preventDefault(), !1;
  }
  function bindAll(view, selector, eventName, fn) {
    for (var elems = view.querySelectorAll(selector), i = 0, length = elems.length; i < length; i++)
      elems[i].addEventListener(eventName, fn);
  }
  function executeCommandWithCommandProcessor(command, item, options) {
    require(["commandProcessor"], function (commandProcessor) {
      commandProcessor.executeCommand(command, item, options);
    });
  }
  function onDataFetched(responses) {
    var itemInfo = responses[0],
      item = itemInfo.item,
      itemInfo = itemInfo.mediaSources,
      user = responses[1],
      responses = connectionManager.getApiClient(item.ServerId),
      view = this.view,
      hasAnimatedTransition = view.classList.contains("animatedView"),
      backdropImageInfo =
        (("Person" === item.Type && backdrop.hasBackdrop()) ||
          backdrop.setBackdrops([item], {
            enableAnimation: !hasAnimatedTransition,
            enablePrimaryImageBeforeInherited:
              enableTvDetailImageLayout(item) && "Season" !== item.Type && "Episode" !== item.Type,
            allowPrimaryImage: enableTvDetailImageLayout(item),
          }),
        backdrop.hasBackdrop()
          ? view.classList.add("darkContentContainer-item")
          : view.classList.remove("darkContentContainer-item"),
        !hasAnimatedTransition ||
          ((backdropImageInfo = backdrop.getCurrentImageInfo()) &&
            (view.classList.add("animatedView-withbackdrop"),
            !1 === backdropImageInfo.coverImage && view.classList.add("animatedView-withbackdrop-contain"),
            (view.style["background-image"] = "url(" + backdropImageInfo.url + ")"))),
        (this.currentItem = item),
        this.sectionsInitialized ||
          ((this.sectionsInitialized = !0),
          (function (instance, view, item) {
            var section;
            if ("Series" !== item.Type) return;
            var itemsContainer = view.querySelector(".nextUpItemsContainer");
            (itemsContainer.fetchData = getNextUpItems.bind(instance)),
              (itemsContainer.parentContainer = itemsContainer.closest(".verticalSection")),
              (itemsContainer.getListOptions = getNextUpListOptions),
              itemsContainer.classList.add("generalItemsContainer");
          })(this, view, item),
          (function (instance, view, item) {
            if ("Episode" !== item.Type) return;
            var itemsContainer = view.querySelector(".moreFromSeasonItemsContainer"),
              section = itemsContainer.closest(".verticalSection");
            "Episode" === item.Type &&
              ((view = view.querySelector(".moreFromSeasonItemsContainer")),
              ((section = view.closest(".verticalSection")).querySelector("h2").innerHTML = globalize.translate(
                "MoreFromValue",
                item.SeasonName
              )),
              (view.fetchData = function (query) {
                var item = this.currentItem;
                if (!item.SeasonId || !item.SeriesId) return Promise.resolve({TotalRecordCount: 0, Items: []});
                var apiClient = connectionManager.getApiClient(item);
                return (
                  (query = Object.assign(
                    {
                      SeasonId: item.SeasonId,
                      UserId: apiClient.getCurrentUserId(),
                      Fields: this.requestedItemFields + ",PrimaryImageAspectRatio",
                    },
                    query
                  )),
                  apiClient.getEpisodes(item.SeriesId, query).then(function (result) {
                    return !query.StartIndex && result.Items.length < 2
                      ? Promise.resolve({TotalRecordCount: 0, Items: []})
                      : result;
                  })
                );
              }.bind(instance)),
              (view.parentContainer = section),
              (view.getListOptions = getMoreFromSeasonListOptions),
              (view.afterRefresh = function (totalResult) {
                if (totalResult.Items.length) {
                  var item = this.currentItem;
                  if (item) {
                    var view = this.view;
                    if (view) {
                      var itemsContainer = view.querySelector(".moreFromSeasonItemsContainer");
                      if (itemsContainer) {
                        var query,
                          index = itemsContainer.indexOfItemId(item.Id);
                        if (-1 === index)
                          return (
                            (view = connectionManager.getApiClient(item)),
                            (query = {
                              SeasonId: item.SeasonId,
                              UserId: view.getCurrentUserId(),
                              Fields: this.requestedItemFields + ",PrimaryImageAspectRatio",
                              Limit: 0,
                              StartItemId: item.Id,
                            }),
                            view.getEpisodes(item.SeriesId, query).then(function (result) {
                              (index = Math.max(totalResult.TotalRecordCount - result.TotalRecordCount, 0)),
                                itemsContainer.scrollToIndex(
                                  Math.min(index + 1, totalResult.TotalRecordCount - 1),
                                  {behavior: "instant"},
                                  !1
                                );
                            })
                          );
                        itemsContainer.scrollToIndex(
                          Math.min(index + 1, totalResult.TotalRecordCount - 1),
                          {behavior: "instant"},
                          !1
                        );
                      }
                    }
                  }
                }
              }.bind(instance)),
              view.classList.add("generalItemsContainer"));
          })(this, view, item),
          (function (instance, view, item) {
            var view = view.querySelector(".moreFromArtistItemsContainer"),
              section = view.closest(".verticalSection");
            if ("MusicArtist" !== item.Type && "MusicAlbum" !== item.Type) return;
            "MusicArtist" === item.Type
              ? (section.querySelector(".sectionTitle").innerHTML = globalize.translate("HeaderAppearsOn"))
              : (section.querySelector(".sectionTitle").innerHTML = globalize.translate(
                  "MoreFromValue",
                  textEncoding.htmlEncode(item.AlbumArtists[0].Name)
                ));
            (view.fetchData = function (query) {
              var item = this.currentItem;
              if ("MusicAlbum" === item.Type && !item.AlbumArtists && !item.AlbumArtists.length)
                return Promise.resolve({TotalRecordCount: 0, Items: []});
              query = Object.assign(
                {
                  IncludeItemTypes: "MusicAlbum",
                  Recursive: !0,
                  ExcludeItemIds: item.Id,
                  SortBy: "ProductionYear,SortName",
                  SortOrder: "Descending",
                  Fields: this.requestedItemFields + ",PrimaryImageAspectRatio",
                },
                query
              );
              var apiClient = connectionManager.getApiClient(item);
              "MusicArtist" === item.Type
                ? (query.ContributingArtistIds = item.Id)
                : (query.AlbumArtistIds = item.AlbumArtists[0].Id);
              return apiClient.getItems(apiClient.getCurrentUserId(), query);
            }.bind(instance)),
              (view.parentContainer = section),
              (view.getListOptions = getMoreFromArtistListOptions),
              view.classList.add("generalItemsContainer");
          })(this, view, item),
          (function (instance, item, apiClient) {
            var section = instance.view.querySelector(".childrenSection");
            if ("Series" === item.Type || "MusicArtist" === item.Type) sectionType = "x";
            else {
              if ("BoxSet" !== item.Type) return section.classList.add("hide");
              sectionType = "y";
            }
            var headerText,
              headerHtml,
              html = "";
            "x" === sectionType
              ? (html =
                  (html =
                    (html +=
                      '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left padded-right">') +
                    '</div><div is="emby-scroller" class="emby-scroller padded-top-focusscale padded-bottom-focusscale padded-left padded-right" data-mousewheel="false" data-centerfocus="true" data-horizontal="true">') +
                  '<div is="emby-itemscontainer" class="scrollSlider focuscontainer-x childrenItemsContainer generalItemsContainer itemsContainer focusable"></div></div>')
              : "y" === sectionType &&
                (html +=
                  '<h2 class="sectionTitle sectionTitle-cards padded-left padded-right"></h2><div is="emby-itemscontainer" class="itemsContainer vertical-wrap childrenItemsContainer generalItemsContainer focuscontainer-x padded-left padded-right"></div>');
            (section.innerHTML = html),
              "x" === sectionType &&
                ((html = "Series" === item.Type ? "autofocus" : "nearest"),
                setScopedFocus(instance.view, section.querySelector(".focusable"), !0, html));
            var sectionType = section.querySelector(".itemsContainer");
            (sectionType.parentContainer = section),
              "Series" === item.Type
                ? ((headerText = section.querySelector(".sectionTitleContainer")),
                  (headerHtml =
                    (headerHtml = '<h2 class="sectionTitle sectionTitle-cards">') +
                    globalize.translate("全部剧季") +
                    "</h2>"),
                  (headerText.innerHTML = headerHtml),
                  headerText.classList.remove("hide"),
                  (sectionType.fetchData = function () {
                    var item = this.currentItem,
                      apiClient = connectionManager.getApiClient(item);
                    return apiClient.getSeasons(item.Id, {
                      UserId: apiClient.getCurrentUserId(),
                      Fields: this.requestedItemFields + ",PrimaryImageAspectRatio",
                      EnableTotalRecordCount: !1,
                    });
                  }.bind(instance)),
                  (sectionType.getListOptions = getSeriesChildrenListOptions))
                : "MusicArtist" === item.Type
                ? ((headerText = section.querySelector(".sectionTitleContainer")),
                  (html = appRouter.getRouteUrl("list", {
                    serverId: apiClient.serverId(),
                    itemTypes: "MusicAlbum",
                    albumArtistId: item.Id,
                  })),
                  (headerHtml =
                    '<a is="emby-sectiontitle" href=".' +
                    html +
                    '" class="button-link  button-link-color-inherit sectionTitleTextButton">'),
                  (headerHtml =
                    (headerHtml =
                      (headerHtml += '<h2 class="sectionTitle sectionTitle-cards">') + globalize.translate("Albums")) +
                    "</h2></a>"),
                  (headerText.innerHTML = headerHtml),
                  headerText.classList.remove("hide"),
                  sectionType.setAttribute("data-virtualscrolllayout", "horizontal-grid"),
                  (sectionType.fetchData = function (query) {
                    var item = this.currentItem,
                      apiClient = connectionManager.getApiClient(item);
                    return (
                      ((query = Object.assign(
                        {
                          IncludeItemTypes: "MusicAlbum",
                          Recursive: !0,
                          SortBy: "ProductionYear,SortName",
                          SortOrder: "Descending,Ascending",
                          ImageTypeLimit: 1,
                          Fields: this.requestedItemFields + ",PrimaryImageAspectRatio,ProductionYear",
                        },
                        query
                      )).AlbumArtistIds = item.Id),
                      apiClient.getItems(apiClient.getCurrentUserId(), query)
                    );
                  }.bind(instance)),
                  (sectionType.getListOptions = getMusicArtistChildrenListOptions))
                : "BoxSet" === item.Type &&
                  (((headerText = section.querySelector("h2")).innerHTML = globalize.translate("Items")),
                  headerText.classList.remove("hide"),
                  (sectionType.fetchData = function () {
                    var item = this.currentItem,
                      apiClient = connectionManager.getApiClient(item);
                    return apiClient
                      .getItems(apiClient.getCurrentUserId(), {
                        ParentId: item.Id,
                        ImageTypeLimit: 1,
                        Fields: this.requestedItemFields + ",PrimaryImageAspectRatio,ProductionYear",
                        EnableTotalRecordCount: !1,
                      })
                      .then(function (result) {
                        for (var i = 0, length = result.Items.length; i < length; i++)
                          result.Items[i].CollectionId = item.Id;
                        return result;
                      });
                  }.bind(instance)),
                  (sectionType.getListOptions = (function (id) {
                    return function (items) {
                      return {
                        renderer: cardBuilder,
                        options: {
                          shape: "auto",
                          scalable: !0,
                          centerText: !0,
                          fields: ["Name", "ProductionYear"],
                          overlayText: !1,
                          collectionId: id,
                        },
                        virtualScrollLayout: "vertical-grid",
                      };
                    };
                  })(item.Id)),
                  sectionType.setAttribute("data-monitor", "CollectionItems"),
                  sectionType.setAttribute("data-monitorids", item.Id));
          })(this, item, responses),
          (function (instance, view, item, apiClient) {
            var headerText;
            "MusicArtist" === item.Type &&
              ((headerText = view.querySelector(".artistSongsItemsHeader")),
              (apiClient = appRouter.getRouteUrl("list", {
                serverId: apiClient.serverId(),
                itemTypes: "Audio",
                artistId: item.Id,
              })),
              (item = ""),
              (item =
                '<a is="emby-sectiontitle" href=".' +
                apiClient +
                '" class="button-link  button-link-color-inherit sectionTitleTextButton">'),
              (item =
                (item = (item += '<h2 class="sectionTitle sectionTitle-cards">') + globalize.translate("Songs")) +
                "</h2></a>"),
              (headerText.innerHTML = item),
              (apiClient = view.querySelector(".artistSongsItemsContainer")).classList.add("generalItemsContainer"),
              (apiClient.fetchData = function (query) {
                var item = this.currentItem,
                  item = connectionManager.getApiClient(item);
                return item.getItems(
                  item.getCurrentUserId(),
                  Object.assign(
                    {
                      Recursive: !0,
                      IncludeItemTypes: "Audio",
                      ArtistIds: this.currentItem.Id,
                      SortBy: "PlayCount,SortName",
                      SortOrder: "Descending,Ascending",
                      ImageTypeLimit: 1,
                      Fields: this.requestedItemFields + ",PrimaryImageAspectRatio",
                    },
                    query
                  )
                );
              }.bind(instance)),
              (apiClient.getListOptions = getArtistSongsListOptions),
              (apiClient.parentContainer = apiClient.closest(".verticalSection")));
          })(this, view, item, responses),
          (function (instance, item, apiClient) {
            var trackList = instance.view.querySelector(".trackList");
            (trackList.parentContainer = trackList),
              "Season" === item.Type
                ? ((trackList.fetchData = (function (instance, serverId, seriesId, seasonId) {
                    return function (query) {
                      var apiClient = connectionManager.getApiClient(serverId);
                      return apiClient
                        .getEpisodes(
                          seriesId,
                          Object.assign(
                            {
                              SeasonId: seasonId,
                              ImageTypeLimit: 1,
                              UserId: apiClient.getCurrentUserId(),
                              Fields: "Overview,PrimaryImageAspectRatio",
                            },
                            query
                          )
                        )
                        .then(function (result) {
                          return (instance.seasonItems = result.Items), result;
                        });
                    };
                  })(instance, apiClient.serverId(), item.SeriesId, item.Id)),
                  (trackList.getListOptions = (function (item) {
                    return function () {
                      return {
                        renderer: listView,
                        options: {
                          showIndexNumber: !1,
                          imageSize: "large",
                          highlight: !1,
                          action: "link",
                          imagePlayButton: !layoutManager.tv,
                          includeParentInfoInTitle: !1,
                          enableSpecialEpisodePrefix: 0 !== item.IndexNumber,
                          itemClass: "detailsListItem",
                          fields: ["Overview"],
                        },
                        virtualScrollLayout: "vertical-list",
                      };
                    };
                  })(item)),
                  trackList.setAttribute("data-virtualscrolllayout", "vertical-grid"),
                  trackList.classList.add("padded-bottom-page"))
                : "MusicAlbum" === item.Type
                ? ((trackList.fetchData = function (query) {
                    var item = this.currentItem,
                      apiClient = connectionManager.getApiClient(item),
                      includeOverview = !0 === item.SupportsResume,
                      fields = this.requestedItemFields + ",PrimaryImageAspectRatio";
                    includeOverview && (fields += ",Overview");
                    return apiClient.getItems(
                      apiClient.getCurrentUserId(),
                      Object.assign({
                        ParentId: item.Id,
                        Fields: fields,
                        ImageTypeLimit: 1,
                        SortBy: null,
                        EnableTotalRecordCount: !1,
                      })
                    );
                  }.bind(instance)),
                  (trackList.getListOptions = (
                    !0 === item.SupportsResume
                      ? function (item) {
                          return function (items) {
                            var fields = [];
                            return (
                              (function (items) {
                                for (var i = 0, length = items.length; i < length; i++) if (items[i].Overview) return 1;
                                return;
                              })(items) && fields.push("Overview"),
                              "Playlist" === item.Type && fields.push("ParentName"),
                              {
                                renderer: listView,
                                options: {
                                  showIndexNumberLeft: !1,
                                  highlight: !1,
                                  action: "link",
                                  dragHandle: !1,
                                  image: !0,
                                  imageSize: "medium",
                                  showIndexNumber: !0,
                                  artist: "auto",
                                  imagePlayButton: !layoutManager.tv,
                                  showIndex: "MusicAlbum" === item.Type,
                                  fields: fields,
                                  index: "disc",
                                  containerAlbumArtists: "MusicAlbum" === item.Type ? item.AlbumArtists : null,
                                  playAction: "playallfromhere",
                                  includeParentInfoInTitle: !1,
                                  itemClass: "detailsListItem",
                                  autoHideMediaInfo: !1,
                                  enableSideMediaInfo: !0,
                                },
                                virtualScrollLayout: "vertical-list",
                                contextMenuOptions: {openAlbum: !1},
                              }
                            );
                          };
                        }
                      : getPlaylistListOptionsFn
                  )(item)),
                  trackList.classList.add("generalItemsContainer"))
                : "Playlist" === item.Type &&
                  ((trackList.fetchData = (function (serverId, itemId) {
                    return function (query) {
                      var apiClient = connectionManager.getApiClient(serverId);
                      return apiClient
                        .getItems(
                          apiClient.getCurrentUserId(),
                          Object.assign({ParentId: itemId, Fields: "PrimaryImageAspectRatio", ImageTypeLimit: 1}, query)
                        )
                        .then(function (result) {
                          for (var i = 0, length = result.Items.length; i < length; i++)
                            result.Items[i].PlaylistId = itemId;
                          return result;
                        });
                    };
                  })(apiClient.serverId(), item.Id)),
                  (trackList.getListOptions = getPlaylistListOptionsFn(item)),
                  trackList.setAttribute("data-monitor", "PlaylistItems"),
                  trackList.setAttribute("data-monitorids", item.Id),
                  trackList.setAttribute("data-virtualscrolllayout", "vertical-grid"),
                  trackList.classList.add("padded-bottom-page"),
                  trackList.classList.add("generalItemsContainer"));
            "Season" !== item.Type && (layoutManager.tv || ("Playlist" !== item.Type && "MusicAlbum" !== item.Type))
              ? trackList.classList.remove("tracklist-topmargin")
              : trackList.classList.add("tracklist-topmargin");
          })(this, item, responses),
          (function (instance, view, item) {
            (itemHelper.supportsAddingToCollection(item) || itemHelper.supportsAddingToPlaylist(item)) &&
              (((item = view.querySelector(".appearsOnListsItemsContainer")).fetchData = function (query) {
                var item = this.currentItem,
                  apiClient = connectionManager.getApiClient(item);
                return (
                  (query = Object.assign(
                    {
                      fields: this.requestedItemFields + ",PrimaryImageAspectRatio",
                      IncludeItemTypes: "Playlist,BoxSet",
                      Recursive: !0,
                      SortBy: "SortName",
                      ListItemIds: item.Id,
                    },
                    query
                  )),
                  apiClient.getItems(apiClient.getCurrentUserId(), query)
                );
              }.bind(instance)),
              (item.getListOptions = getAppearsOnListsListOptions),
              (item.parentContainer = item.closest(".verticalSection")),
              item.classList.add("generalItemsContainer"));
          })(this, view, item),
          (function (instance, view) {
            view = view.querySelector(".peopleItemsContainer");
            (view.fetchData = (function (instance) {
              return function (query) {
                var serverId = instance.currentItem.ServerId,
                  people = (instance.currentItem.People || []).filter(function (p) {
                    return (
                      (p.ServerId = serverId), "Person" !== p.Type && ((p.PersonType = p.Type), (p.Type = "Person")), !0
                    );
                  }),
                  totalRecordCount = people.length;
                return (
                  query &&
                    ((people = people.slice(query.StartIndex || 0)),
                    query.Limit && people.length > query.Limit && (people.length = query.Limit)),
                  Promise.resolve({Items: people, TotalRecordCount: totalRecordCount})
                );
              };
            })(instance)),
              (view.parentContainer = view.closest(".verticalSection")),
              (view.getListOptions = getPeopleListOptions),
              view.classList.add("generalItemsContainer");
          })(this, view),
          (function (instance, view, item) {
            itemHelper.supportsSimilarItems(item) &&
              (((view = view.querySelector(".similarItemsContainer")).fetchData = function () {
                var item = this.currentItem,
                  apiClient = connectionManager.getApiClient(item),
                  options = {
                    Limit: 12,
                    UserId: apiClient.getCurrentUserId(),
                    ImageTypeLimit: 1,
                    Fields: this.requestedItemFields + ",PrimaryImageAspectRatio,ProductionYear",
                    EnableTotalRecordCount: !1,
                  };
                ("Program" === item.Type || ("Timer" === item.Type && item.ProgramId && !item.IsSports)) &&
                  (options.GroupProgramsBySeries = !0);
                "MusicAlbum" === item.Type &&
                  item.AlbumArtists &&
                  item.AlbumArtists.length &&
                  (options.ExcludeArtistIds = item.AlbumArtists[0].Id);
                item = "Timer" === item.Type ? item.ProgramId : item.Id;
                return apiClient.getSimilarItems(item, options);
              }.bind(instance)),
              (view.parentContainer = view.closest(".verticalSection")),
              (view.getListOptions = (function (item) {
                return function (items) {
                  var fields = ["Name"];
                  return (
                    ("Movie" !== item.Type &&
                      "Trailer" !== item.Type &&
                      "Program" !== item.Type &&
                      "Game" !== item.Type) ||
                      fields.push("ProductionYear"),
                    ("MusicAlbum" !== item.Type && "Game" !== item.Type && "Program" !== item.Type) ||
                      fields.push("ParentName"),
                    {
                      renderer: cardBuilder,
                      options: {
                        shape: "auto",
                        lines: "Game" === item.Type ? 3 : "Program" === item.Type ? 2 : null,
                        centerText: !0,
                        fields: fields,
                        overlayPlayButton: !0,
                        overlayText: !1,
                        multiSelect: "Program" !== item.Type && "Timer" !== item.Type,
                        contextMenu: "Program" !== item.Type && "Timer" !== item.Type,
                        draggable: "Program" !== item.Type && "Timer" !== item.Type,
                        focusTransformTitleAdjust: !0,
                      },
                      virtualScrollLayout: "horizontal-grid",
                    }
                  );
                };
              })(item)),
              view.classList.add("generalItemsContainer"));
          })(this, view, item),
          (function (instance, view, item, apiClient) {
            itemHelper.supportsSimilarItemsOnLiveTV(item, apiClient) &&
              (((item = view.querySelector(".similarOnLiveTVItemsContainer")).fetchData = function () {
                var item = this.currentItem,
                  apiClient = connectionManager.getApiClient(item);
                return apiClient.getSimilarItems(item.Id, {
                  userId: apiClient.getCurrentUserId(),
                  limit: 12,
                  fields: this.requestedItemFields + ",PrimaryImageAspectRatio,ProductionYear",
                  IncludeItemTypes: "Program",
                  EnableTotalRecordCount: !1,
                  GroupProgramsBySeries: !0,
                });
              }.bind(instance)),
              (item.parentContainer = item.closest(".verticalSection")),
              (item.getListOptions = getMoreLikeThisOnLiveTVListOptions),
              item.classList.add("generalItemsContainer"));
          })(this, view, item, responses),
          (function (instance, view, item) {
            ("Series" === item.Type || "Program" === item.Type || ("Timer" === item.Type && item.ProgramId)) &&
              (((view = view.querySelector(".seriesScheduleItemsContainer")).fetchData = function (query) {
                var item = this.currentItem,
                  apiClient = connectionManager.getApiClient(item);
                (query = Object.assign(
                  {
                    UserId: apiClient.getCurrentUserId(),
                    HasAired: !1,
                    SortBy: "StartDate",
                    ImageTypeLimit: 1,
                    EnableImageTypes: "Primary,Thumb,Backdrop",
                    EnableUserData: !1,
                    Fields: "PrimaryImageAspectRatio,ChannelInfo",
                  },
                  query
                )),
                  "Program" === item.Type || ("Timer" === item.Type && item.ProgramId)
                    ? item.AsSeries
                      ? (query.SeriesFromProgramId = item.Id)
                      : ((query.ShowingsFromProgramId = item.ProgramId || item.Id),
                        (query.ExcludeItemIds = item.ProgramId || item.Id))
                    : (query.LibrarySeriesId = item.Id);
                return apiClient.getLiveTvPrograms(query);
              }.bind(instance)),
              (view.parentContainer = view.closest(".verticalSection")),
              (view.getListOptions = function (items) {
                return {
                  renderer: cardBuilder,
                  options: {
                    preferThumb: "auto",
                    shape: "autooverflow",
                    fields: ["Name", "ChannelName"],
                    centerText: !0,
                    overlayText: !1,
                    overlayPlayButton: !1,
                    showAirTime: !0,
                    showAirDateTime: !0,
                    multiSelect: !1,
                    draggable: !1,
                    focusTransformTitleAdjust: !0,
                  },
                  virtualScrollLayout: "horizontal-grid",
                };
              }.bind(instance)),
              view.classList.add("generalItemsContainer"),
              ("Program" !== item.Type && "Timer" !== item.Type) ||
                (item.AsSeries
                  ? (view.parentContainer.querySelector(".sectionTitle").innerHTML = globalize.translate("Showings"))
                  : (view.parentContainer.querySelector(".sectionTitle").innerHTML =
                      globalize.translate("HeaderOtherShowings"))));
          })(this, view, item),
          (function (instance, view, item) {
            itemHelper.supportsExtras(item) &&
              (((item = view.querySelector(".extrasItemsContainer")).fetchData = function (query) {
                var item = this.currentItem,
                  apiClient = connectionManager.getApiClient(item);
                return apiClient.getSpecialFeatures(apiClient.getCurrentUserId(), item.Id).then(function (items) {
                  var totalRecordCount = items.length;
                  return (
                    query &&
                      ((items = items.slice(query.StartIndex || 0)),
                      query.Limit && items.length > query.Limit && (items.length = query.Limit)),
                    {Items: items, TotalRecordCount: totalRecordCount}
                  );
                });
              }.bind(instance)),
              (item.parentContainer = item.closest(".verticalSection")),
              (item.getListOptions = getExtrasListOptions),
              item.classList.add("generalItemsContainer"));
          })(this, view, item),
          (function (instance, view) {
            view = view.querySelector(".chaptersItemsContainer");
            (view.fetchData = function (query) {
              var item = this.currentItem,
                chapters = (function (chapters) {
                  return chapters;
                })(item.Chapters || []);
              chapters.length && !chapters[0].ImageTag && (chapters = []);
              var videoStream =
                  (((item.MediaSources || [])[0] || {}).MediaStreams || []).filter(function (i) {
                    return "Video" === i.Type;
                  })[0] || {},
                aspect = null;
              videoStream.Width && videoStream.Height && (aspect = videoStream.Width / videoStream.Height);
              for (var i = 0, length = chapters.length; i < length; i++) {
                var chapter = chapters[i];
                (chapter.Id = item.Id),
                  (chapter.Type = item.Type),
                  (chapter.ServerId = item.ServerId),
                  (chapter.MediaType = item.MediaType),
                  (chapter.PrimaryImageAspectRatio = aspect),
                  null == chapter.ChapterIndex && (chapter.ChapterIndex = i);
              }
              videoStream = (chapters = (function (chapters) {
                for (var list = [], i = 0, length = chapters.length; i < length; i++) {
                  var chapter = chapters[i];
                  (chapter.MarkerType && "Chapter" !== chapter.MarkerType) || list.push(chapter);
                }
                return list;
              })(chapters)).length;
              query &&
                ((chapters = chapters.slice(query.StartIndex || 0)),
                query.Limit && chapters.length > query.Limit && (chapters.length = query.Limit));
              return Promise.resolve({Items: chapters, TotalRecordCount: videoStream});
            }.bind(instance)),
              (view.parentContainer = view.closest(".verticalSection")),
              (view.getListOptions = getChaptersListOptions),
              view.classList.add("generalItemsContainer");
          })(this, view),
          (function (instance, view) {
            view = view.querySelector(".additionalPartsItemsContainer");
            (view.fetchData = function () {
              var item = this.currentItem;
              if (!item.PartCount) return Promise.resolve({TotalRecordCount: 0, Items: []});
              var apiClient = connectionManager.getApiClient(item);
              return apiClient.getAdditionalVideoParts(apiClient.getCurrentUserId(), item.Id);
            }.bind(instance)),
              (view.parentContainer = view.closest(".verticalSection")),
              (view.getListOptions = getAdditionalPartsListOptions),
              view.classList.add("generalItemsContainer");
          })(this, view),
          (function (instance, view, item) {
            "TvChannel" === item.Type &&
              (((item = view.querySelector(".programGuideItemsContainer")).fetchData = function (query) {
                var item = this.currentItem,
                  apiClient = connectionManager.getApiClient(item);
                return apiClient.getLiveTvPrograms(
                  Object.assign(
                    {
                      ChannelIds: item.Id,
                      UserId: apiClient.getCurrentUserId(),
                      HasAired: !1,
                      SortBy: "StartDate",
                      ImageTypeLimit: 1,
                      EnableUserData: !1,
                      Fields: "PrimaryImageAspectRatio,Overview",
                    },
                    query
                  )
                );
              }.bind(instance)),
              (item.parentContainer = item.closest(".programGuideSection")),
              (item.getListOptions = getProgramGuideListOptions),
              item.classList.add("generalItemsContainer"));
          })(this, view, item),
          (function (instance, view, item) {
            "SeriesTimer" === item.Type &&
              (((item = view.querySelector(".seriesTimerScheduleItemsContainer")).fetchData = function () {
                var item = this.currentItem,
                  apiClient = connectionManager.getApiClient(item);
                return apiClient.getLiveTvTimers({
                  UserId: apiClient.getCurrentUserId(),
                  ImageTypeLimit: 1,
                  EnableImageTypes: "Primary,Backdrop,Thumb",
                  SortBy: "StartDate",
                  EnableTotalRecordCount: !1,
                  EnableUserData: !1,
                  SeriesTimerId: item.Id,
                  Fields: "ChannelInfo,ChannelImage",
                });
              }.bind(instance)),
              (item.parentContainer = item.closest(".verticalSection")),
              (item.getListOptions = getSeriesTimerListOptions),
              item.classList.add("generalItemsContainer"));
          })(this, view, item),
          (function (instance, view, item) {
            var itemsContainer = (function (view, item) {
                var sideImageContainer = view.querySelector(".detailImageContainer-side"),
                  view = view.querySelector(".detailImageContainer-main");
                return enableTrackList(item)
                  ? (view.classList.add("hide"), sideImageContainer.classList.remove("hide"), sideImageContainer)
                  : (view.classList.remove("hide"), sideImageContainer.classList.add("hide"), view);
              })(view, item),
              detailImage = itemsContainer,
              view = view.querySelector(".detailImageContainer-main");
            enableTrackList(item) ||
              ("Person" !== item.Type &&
                "BoxSet" !== item.Type &&
                "Season" !== item.Type &&
                "TvChannel" !== item.Type &&
                "Playlist" !== item.Type) ||
              detailImage.classList.add("detailImageContainer-small");
            "MusicAlbum" !== item.Type &&
              "Playlist" !== item.Type &&
              view.classList.add("detailImageContainer-main-extrabottommargin");
            layoutManager.tv
              ? view.classList.add("detailImageContainer-main-tv")
              : view.classList.remove("detailImageContainer-main-tv");
            enableItemBackdropAsTopImage(item)
              ? view.classList.add("detailImageContainer-hidemobile")
              : view.classList.remove("detailImageContainer-hidemobile");
            view = imageLoader.getShape([item], {});
            detailImage.classList.remove(
              "detailImageContainer-backdrop",
              "detailImageContainer-square",
              "detailImageContainer-portrait",
              "detailImageContainer-fourThree",
              "detailImageContainer-banner"
            ),
              view && detailImage.classList.add("detailImageContainer-" + view);
            "TvChannel" === item.Type ||
            "Season" === item.Type ||
            "MusicAlbum" === item.Type ||
            "Playlist" === item.Type
              ? detailImage.classList.add("detailImage-nomarginleft")
              : detailImage.classList.remove("detailImage-nomarginleft");
            (itemsContainer.fetchData = function () {
              var item = this.currentItem,
                items = [];
              item && enableTvDetailImageLayout(item) | items.push(item);
              return Promise.resolve({Items: items, TotalRecordCount: items.length});
            }.bind(instance)),
              ((itemsContainer.parentContainer = itemsContainer).getListOptions = (function (
                itemType,
                cardClass,
                imageContainerClassName
              ) {
                (imageContainerClassName = imageContainerClassName
                  .split(" ")
                  .filter(function (c) {
                    return c.includes("detailImage");
                  })
                  .join(" ")).includes("detailImageContainer-side") && (imageContainerClassName += " item-fixed-side");
                return (
                  (imageContainerClassName += " imageWidthTest"),
                  function (items) {
                    return {
                      renderer: cardBuilder,
                      options: {
                        overlayText: !0,
                        fields: [],
                        action: "none",
                        imageClass: "detailImage",
                        imageWidthTestClass: imageContainerClassName,
                        multiSelect: !1,
                        contextMenu: !1,
                        ratingButton: !1,
                        playedButton: !1,
                        cardClass: cardClass,
                        defaultIcon: !0,
                        typeIndicator: !1,
                        playedIndicator: !1,
                        syncIndicator: !1,
                        timerIndicator: !1,
                        randomDefaultBackground: !1,
                        staticElement: !0,
                        progress: "Program" === itemType || "Timer" === itemType,
                        enableUserData: !1,
                        draggable: !1,
                        moreButton: !1,
                        programIndicators: !1,
                      },
                      virtualScrollLayout: "vertical-grid",
                    };
                  }
                );
              })(item.Type, "detailImageContainerCard", detailImage.className)),
              (itemsContainer.afterRefresh = afterDetailImageRefreshed),
              itemsContainer.classList.add("generalItemsContainer"),
              enableTvDetailImageLayout(item) && itemsContainer.classList.add("hide");
          })(this, view, item)),
        view.querySelector(".details-additionalContent")),
      hasAnimatedTransition =
        ("TvChannel" === item.Type || "Playlist" === item.Type || "Season" === item.Type
          ? backdropImageInfo.classList.remove("padded-bottom-page")
          : backdropImageInfo.classList.add("padded-bottom-page"),
        backdrop.hasBackdrop()
          ? (backdropImageInfo.classList.add("details-additionalContent-withbackdrop"),
            this.topDetailsContainer.classList.add("topDetailsContainer-withbackdrop"))
          : (backdropImageInfo.classList.remove("details-additionalContent-withbackdrop"),
            this.topDetailsContainer.classList.remove("topDetailsContainer-withbackdrop")),
        hasAnimatedTransition
          ? backdropImageInfo.classList.add("details-additionalContent-fadein")
          : backdropImageInfo.classList.remove("hide"),
        enableTrackList(item)
          ? "Season" === item.Type
            ? setTitle(item, responses)
            : setTitle(item, responses, layoutManager.tv)
          : renderFloatingLogo(view, item, responses), setTitle(item, responses, "float" === getLogoPlacement(item) && "MusicAlbum" !== item.Type),
        view.querySelector(".topDetailsMain")),
      backdropImageInfo = view.querySelector(".item-fixed-side"),
      mainDetailButtons = view.querySelector(".mainDetailButtons"),
      detailMainContainer = this.mainSection,
      detailMainContainer =
        (enableTrackList(item)
          ? ("MusicAlbum" === item.Type
              ? detailMainContainer.classList.add("detailMainContainer-marginleft")
              : detailMainContainer.classList.remove("detailMainContainer-marginleft"),
            hasAnimatedTransition.classList.remove("topDetailsMain-graphic"),
            detailMainContainer.classList.remove("detailMainContainer-withitembackdrop"),
            detailMainContainer.classList.remove("detailMainContainer-vertical"),
            backdropImageInfo.classList.remove("hide"),
            layoutManager.tv && "Season" !== item.Type
              ? hasAnimatedTransition.classList.add("padded-left", "padded-right")
              : hasAnimatedTransition.classList.remove("padded-left", "padded-right"))
          : (detailMainContainer.classList.remove("detailMainContainer-marginleft"),
            enableItemBackdropAsTopImage(item)
              ? (detailMainContainer.classList.add("detailMainContainer-withitembackdrop"),
                detailMainContainer.classList.remove("detailMainContainer-vertical"))
              : (detailMainContainer.classList.remove("detailMainContainer-withitembackdrop"),
                detailMainContainer.classList.add("detailMainContainer-vertical")),
            enableTvDetailImageLayout(item)
              ? layoutManager.tv
                ? hasAnimatedTransition.classList.add("topDetailsMain-graphic", "topDetailsMain-graphic-tv")
                : (hasAnimatedTransition.classList.add("topDetailsMain-graphic"),
                  hasAnimatedTransition.classList.remove("topDetailsMain-graphic-tv"))
              : hasAnimatedTransition.classList.remove("topDetailsMain-graphic", "topDetailsMain-graphic-tv"),
            backdropImageInfo.classList.add("hide"),
            hasAnimatedTransition.classList.remove("padded-left"),
            hasAnimatedTransition.classList.remove("padded-right")),
        []);
    return (
      (function (instance, item, apiClient, user, containers) {
        var parentRoute,
          itemForTitle = ("Timer" === item.Type && item.ProgramInfo) || item,
          context = inferContext(itemForTitle),
          parentNameHtml = [],
          parentNameLast = !1,
          hasButton = !1,
          apiClient =
            "title" !== getLogoPlacement(itemForTitle) ? null : logoImageUrl(itemForTitle, apiClient, {maxHeight: 260}),
          logoAsTitleClass = "itemLogoAsTitle",
          itemNamePrimaryClass = (layoutManager.tv && (logoAsTitleClass += " itemLogoAsTitle-tv"), "itemName-primary"),
          itemPrimaryNameContainerClass = "itemPrimaryNameContainer",
          html =
            (itemForTitle.AlbumArtists && itemForTitle.AlbumArtists.length
              ? (parentNameHtml.push(getArtistLinksHtml(itemForTitle.AlbumArtists, itemForTitle.ServerId)),
                (parentNameLast = !0))
              : itemForTitle.ArtistItems && itemForTitle.ArtistItems.length && "MusicVideo" === itemForTitle.Type
              ? (parentNameHtml.push(getArtistLinksHtml(itemForTitle.ArtistItems, itemForTitle.ServerId)),
                (parentNameLast = !0))
              : itemForTitle.SeriesName && itemForTitle.SeriesId
              ? ((parentRoute = appRouter.getRouteUrl(
                  {
                    Id: itemForTitle.SeriesId,
                    Name: itemForTitle.SeriesName,
                    Type: "Series",
                    IsFolder: !0,
                    ServerId: itemForTitle.ServerId,
                  },
                  {context: context}
                )),
                (hasButton = !0),
                (seriesName = textEncoding.htmlEncode(itemForTitle.SeriesName)),
                apiClient
                  ? ((itemNamePrimaryClass += " itemName-primary-logo"),
                    layoutManager.tv && (itemNamePrimaryClass += " itemName-primary-logo-tv"),
                    (itemPrimaryNameContainerClass += " itemPrimaryNameContainer-logo"),
                    (tabIndex = layoutManager.tv ? ' tabindex="-1"' : ""),
                    parentNameHtml.push(
                      "<a" +
                        tabIndex +
                        ' style="font-weight:inherit;height:100%;width:100%;" class="button-link button-link-color-inherit" is="emby-linkbutton" href=".' +
                        parentRoute +
                        '">' +
                        (seriesName =
                          '<img draggable="false" loading="lazy" decoding="async" class="' +
                          logoAsTitleClass +
                          '" alt="' +
                          seriesName +
                          '" src="' +
                          apiClient +
                          '" />') +
                        "</a>"
                    ))
                  : parentNameHtml.push(
                      '<a style="font-weight:inherit;" class="button-link button-link-color-inherit" is="emby-linkbutton" href=".' +
                        parentRoute +
                        '">' +
                        seriesName +
                        "</a>"
                    ))
              : itemForTitle.SeriesName
              ? parentNameHtml.push(textEncoding.htmlEncode(itemForTitle.SeriesName))
              : (itemForTitle.IsSeries || itemForTitle.EpisodeTitle) &&
                parentNameHtml.push(textEncoding.htmlEncode(itemForTitle.Name)),
            itemForTitle.Album &&
            itemForTitle.AlbumId &&
            ("MusicVideo" === itemForTitle.Type || "Audio" === itemForTitle.Type)
              ? ((parentRoute = appRouter.getRouteUrl(
                  {
                    Id: itemForTitle.AlbumId,
                    Name: itemForTitle.Album,
                    Type: "MusicAlbum",
                    IsFolder: !0,
                    ServerId: itemForTitle.ServerId,
                  },
                  {context: context}
                )),
                (hasButton = !0),
                parentNameHtml.push(
                  '<a style="font-weight:inherit;" class="button-link button-link-color-inherit" is="emby-linkbutton" href=".' +
                    parentRoute +
                    '">' +
                    textEncoding.htmlEncode(itemForTitle.Album) +
                    "</a>"
                ))
              : itemForTitle.Album && parentNameHtml.push(textEncoding.htmlEncode(itemForTitle.Album)),
            ""),
          tabIndex = "",
          seriesName =
            (layoutManager.tv ||
              (itemHelper.canEdit(user, item) &&
                ((hasButton = !0),
                (tabIndex +=
                  '<button is="paper-icon-button-light" class="btnDetailEdit btnEditMetadata secondaryText flex-shrink-zero" title="' +
                  globalize.translate("HeaderEditMetadata") +
                  '" aria-label="' +
                  globalize.translate("HeaderEditMetadata") +
                  '"><i class="md-icon autortl">&#xe3c9;</i></button>')),
              itemHelper.canEditImages(user, item) &&
                ((hasButton = !0),
                (tabIndex +=
                  '<button is="paper-icon-button-light" class="btnDetailEdit btnEditImages secondaryText flex-shrink-zero" title="' +
                  globalize.translate("HeaderEditImages") +
                  '" aria-label="' +
                  globalize.translate("HeaderEditImages") +
                  '"><i class="md-icon">photo</i></button>'))),
            enableItemBackdropAsTopImage(itemForTitle) ||
              (itemPrimaryNameContainerClass += " itemPrimaryNameContainer-centered"),
            parentNameHtml.length &&
              (html = parentNameLast
                ? '<div class="itemSecondaryNameContainer"><h3 class="itemName-secondary">' +
                  parentNameHtml.join(" - ") +
                  "</h3></div>"
                : '<div class="' +
                  itemPrimaryNameContainerClass +
                  '"><h1 class="' +
                  itemNamePrimaryClass +
                  '">' +
                  parentNameHtml.join(" - ") +
                  "</h1></div>"),
            itemHelper.getDisplayName(itemForTitle, {includeParentInfo: !0}));
        html && seriesName && !parentNameLast
          ? (html +=
              '<div class="flex align-items-center flex-wrap-wrap itemSecondaryNameContainer"><h3 class="itemName-secondary">' +
              seriesName +
              "</h3>" +
              tabIndex +
              "</div>")
          : (html =
              (parentNameLast ||
                (apiClient &&
                  ((seriesName =
                    '<img draggable="false" loading="lazy" decoding="async" class="' +
                    logoAsTitleClass +
                    '" alt="' +
                    seriesName +
                    '" src="' +
                    apiClient +
                    '" />'),
                  (itemNamePrimaryClass += " itemName-primary-logo"),
                  (itemPrimaryNameContainerClass += " itemPrimaryNameContainer-logo"),
                  layoutManager.tv && (itemNamePrimaryClass += " itemName-primary-logo-tv"))),
              '<div class="flex align-items-center flex-wrap-wrap ' +
                itemPrimaryNameContainerClass +
                '"><h1 class="' +
                itemNamePrimaryClass +
                '">' +
                seriesName +
                "</h1>" +
                tabIndex +
                "</div>" +
                html));
        for (var i = 0, length = containers.length; i < length; i++) {
          var container = containers[i],
            btnEditMetadata =
              (enableItemBackdropAsTopImage(itemForTitle)
                ? container.classList.remove("nameContainer-centered")
                : container.classList.add("nameContainer-centered"),
              (container.innerHTML = html),
              setScopedFocus(null, container, hasButton, "nearest"),
              html.length ? container.classList.remove("hide") : container.classList.add("hide"),
              container.querySelector(".btnEditMetadata")),
            btnEditMetadata =
              (btnEditMetadata && btnEditMetadata.addEventListener("click", onEditMetadataClick.bind(instance)),
              container.querySelector(".btnEditImages"));
          btnEditMetadata && btnEditMetadata.addEventListener("click", onEditImagesClick.bind(instance));
        }
      })(this, item, responses, user, view.querySelectorAll(".nameContainer")),
      (function (view, item, apiClient) {
        var imgUrl,
          usePrimaryImage,
          screenWidth = screen.availWidth,
          itemBackdropContainerElement = view.querySelector(".itemBackdropContainer"),
          itemBackdropElement = itemBackdropContainerElement.querySelector(".itemBackdrop");
        enableItemBackdropAsTopImage(item)
          ? (itemBackdropContainerElement.classList.remove("hide"),
            (usePrimaryImage =
              ("Video" === item.MediaType && "Movie" !== item.Type && "Trailer" !== item.Type) ||
              (item.MediaType && "Video" !== item.MediaType) ||
              "MusicAlbum" === item.Type ||
              "Playlist" === item.Type),
            "Program" === item.Type && item.ImageTags && item.ImageTags.Thumb
              ? (imgUrl = apiClient.getImageUrl(item.Id, {
                  type: "Thumb",
                  index: 0,
                  maxWidth: screenWidth,
                  tag: item.ImageTags.Thumb,
                  EnableImageEnhancers: !1,
                }))
              : usePrimaryImage && item.ImageTags && item.ImageTags.Primary
              ? (imgUrl = apiClient.getImageUrl(item.Id, {
                  type: "Primary",
                  index: 0,
                  maxWidth: screenWidth,
                  tag: item.ImageTags.Primary,
                  EnableImageEnhancers: !1,
                }))
              : item.BackdropImageTags && item.BackdropImageTags.length
              ? (imgUrl = apiClient.getImageUrl(item.Id, {
                  type: "Backdrop",
                  index: 0,
                  maxWidth: screenWidth,
                  tag: item.BackdropImageTags[0],
                }))
              : item.ParentBackdropItemId && item.ParentBackdropImageTags && item.ParentBackdropImageTags.length
              ? (imgUrl = apiClient.getImageUrl(item.ParentBackdropItemId, {
                  type: "Backdrop",
                  index: 0,
                  tag: item.ParentBackdropImageTags[0],
                  maxWidth: screenWidth,
                }))
              : item.ImageTags && item.ImageTags.Thumb
              ? (imgUrl = apiClient.getImageUrl(item.Id, {
                  type: "Thumb",
                  index: 0,
                  maxWidth: screenWidth,
                  tag: item.ImageTags.Thumb,
                  EnableImageEnhancers: !1,
                }))
              : item.ImageTags &&
                item.ImageTags.Primary &&
                (imgUrl = apiClient.getImageUrl(item.Id, {
                  type: "Primary",
                  index: 0,
                  maxWidth: screenWidth,
                  tag: item.ImageTags.Primary,
                  EnableImageEnhancers: !1,
                })),
            "TvChannel" === item.Type && itemBackdropContainerElement.classList.add("itemBackdropContainer-small"),
            "TvChannel" !== item.Type &&
              enableItemBackdropAsTopImage(item) &&
              view.querySelector(".itemMainScrollSlider").classList.add("itemMainScrollSlider-nopaddingtop"),
            ("TvChannel" !== item.Type && "Person" !== item.Type) ||
              itemBackdropElement.classList.add("itemBackdrop-contain"),
            (itemBackdropElement.style.backgroundImage = imgUrl ? "url('" + imgUrl + "')" : ""))
          : itemBackdropContainerElement.classList.add("hide");
      })(view, item, responses),
      renderTrackSelections(view, this, item, user, !0, itemInfo),
      detailMainContainer.push(renderDetails(this, view, item, responses, user)),
      (function (view, user, item) {
        if (appHost.supports("sync"))
          for (
            var canSync = itemHelper.canSync(user, item),
              buttons = view.querySelectorAll(".btnSyncDownload"),
              i = 0,
              length = buttons.length;
            i < length;
            i++
          )
            buttons[i].setItem(item), canSync ? buttons[i].classList.remove("hide") : buttons[i].classList.add("hide");
      })(view, user, item),
      Promise.all(detailMainContainer).then(function () {
        return (
          enableTrackList(item) ||
            (function (elem) {
              for (var btns = elem.querySelectorAll(".detailButton"), i = 0, length = btns.length; i < length; i++) {
                var btn = btns[i];
                if (focusManager.isCurrentlyFocusable(btn)) return setScopedFocus(null, elem, !0);
              }
              setScopedFocus(null, elem, !1);
            })(mainDetailButtons),
          [item, user]
        );
      })
    );
  }
  function getItemWithMediaSource(instance, apiClient) {
    return (function (instance, apiClient) {
      if ((instance = instance.params).seriesTimerId) return apiClient.getLiveTvSeriesTimer(instance.seriesTimerId);
      if (instance.timerId) return apiClient.getLiveTvTimer(instance.timerId);
      var options = {};
      return (
        "true" === instance.asSeries && (options.AsSeries = !0),
        apiClient.getItem(apiClient.getCurrentUserId(), instance.id, options)
      );
    })(instance, apiClient).then(function (item) {
      var playbackMediaSourcesPromise = isRenderingTrackSelections(item)
        ? playbackManager.getPlaybackMediaSources(item)
        : Promise.resolve([]);
      return playbackMediaSourcesPromise.then(function (mediaSources) {
        return {item: item, mediaSources: mediaSources};
      });
    });
  }
  function startDataLoad(instance) {
    var params = instance.params,
      apiClient = connectionManager.getApiClient(params.serverId);
    instance.dataPromise = Promise.all([getItemWithMediaSource(instance, apiClient), apiClient.getCurrentUser()]).then(
      onDataFetched.bind(instance),
      function (err) {
        return (
          console.log("error loading item: " + err),
          (function (instance, apiClient) {
            (instance = instance.view).querySelector(".details-additionalContent").classList.add("hide"),
              (html = "<div><p>Content no longer available.</p>");
            var apiClient = appRouter.getRouteUrl("home", {serverId: apiClient.serverId()}),
              html =
                (html += '<a href=".' + apiClient + '" is="emby-linkbutton" class="raised btnHomeItemNotFound">') +
                globalize.translate("Home") +
                "</a></div>";
            (instance.querySelector(".detailMainContainer").innerHTML = html),
              focusManager.focus(instance.querySelector(".btnHomeItemNotFound"));
          })(instance, apiClient),
          Promise.reject(err)
        );
      }
    );
  }
  function playCurrentItem(instance, mode) {
    var item;
    MultiSelect.canPlay()
      ? MultiSelect.play()
      : ((item = instance.currentItem),
        ((instance = (function (view, startPositionTicks) {
          var audioStreamIndex = view.querySelector(".selectAudio").value || null;
          return {
            startPositionTicks: startPositionTicks,
            mediaSourceId: view.querySelector(".selectSource").value,
            audioStreamIndex: audioStreamIndex,
            subtitleStreamIndex: view.querySelector(".selectSubtitles").value,
          };
        })(instance.view, item.UserData && "resume" === mode ? null : 0)).items = [item]),
        playbackManager.play(instance));
  }
  function onPlayClick(e) {
    playCurrentItem(this, e.currentTarget.getAttribute("data-mode"));
  }
  function onAutoPlayClick(e) {
    var autoplaySetting = appSettings.get("autoplay");
    if (autoplaySetting == "true") {
      appSettings.set("autoplay", "false");
      toast("【外部播放器】自动播放下一集已关闭");
      updateAutoplayButton();
      window.timeout1 && (clearTimeout(window.timeout1), (window.timeout1 = null));
      window.timeout2 && (clearTimeout(window.timeout2), (window.timeout2 = null));
      window.timeout3 && (clearTimeout(window.timeout3), (window.timeout3 = null));
    } else {
      appSettings.set("autoplay", "true");
      toast("【外部播放器】自动播放下一集已开启");
      updateAutoplayButton();
    }
  }
  function updateAutoplayButton() {
    var autoplaySetting = appSettings.get("autoplay");
    var btns = document.querySelectorAll(".btnAutoPlayIcon");
    for (var i = 0, length = btns.length; i < length; i++) {
      var btn = btns[i];
      if (autoplaySetting == "true") {
        btn.classList.add("playstatebutton-icon-played");
      } else {
        btn.classList.remove("playstatebutton-icon-played");
      }
    }
  }
  function onQueueClick() {
    var text,
      currentItem = this.currentItem;
    playbackManager.queue({items: [currentItem]}),
      (text = {text: globalize.translate("HeaderAddedToPlayQueue"), icon: "&#xe03b;"}),
      require(["toast"], function (toast) {
        toast(text);
      });
  }
  function onEdited() {
    reloadItem(this, !0);
  }
  function onEditCancel() {}
  function onEditMetadataClick() {
    var currentItem = this.currentItem,
      instance = this;
    require(["metadataEditor"]).then(function (responses) {
      return responses[0].show(currentItem.Id, currentItem.ServerId).then(onEdited.bind(instance), onEditCancel);
    });
  }
  function onEditImagesClick() {
    var currentItem = this.currentItem,
      instance = this;
    require(["imageEditor"], function (imageEditor) {
      imageEditor
        .show({itemId: currentItem.Id, serverId: currentItem.ServerId})
        .then(onEdited.bind(instance), onEditCancel);
    });
  }
  function onDeleteClick() {
    var currentItem = this.currentItem;
    require(["deleteHelper"], function (deleteHelper) {
      deleteHelper.deleteItem({item: currentItem, navigate: "back"});
    });
  }
  function onDownloadChange() {
    reloadItem(this, !0);
  }
  function setReadMoreText(btn, isExpanded) {
    var text = "";
    isExpanded
      ? ((text = globalize.translate("HeaderReadLess")),
        !1 || (text += '<i class="md-icon" style="font-size:1.3em;">arrow_drop_up</i>'))
      : ((text = globalize.translate("HeaderReadMore")),
        !1 || (text += '<i class="md-icon" style="font-size:1.3em;">arrow_drop_down</i>')),
      (btn.innerHTML = text);
  }
  function onReadMoreClick(e) {
    var btn = e.currentTarget,
      overviewTextElem = btn.parentNode.querySelector(".overview-text");
    overviewTextElem.classList.contains("overview-text-full")
      ? (overviewTextElem.classList.remove("overview-text-full"), setReadMoreText(btn, !1))
      : (overviewTextElem.classList.add("overview-text-full"), setReadMoreText(btn, !0));
  }
  function onSplitVersionsClick() {
    var params = this.params,
      apiClient = connectionManager.getApiClient(params.serverId);
    !(function (instance, apiClient, params) {
      require(["confirm"], function (confirm) {
        confirm("是否要将已经组合好的媒体源拆分为单个项目？", "拆分版本").then(
          function () {
            loading.show(),
              apiClient.ungroupVersions(params.id).then(function () {
                loading.hide(), reloadItem(instance, !0);
              });
          }
        );
      });
    })(this, (this.view, apiClient), params);
  }
  function onPromiseRejected() {}
  function getSeriesChildrenListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "auto",
        scalable: !0,
        centerText: !0,
        fields: ["Name"],
        overlayText: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getMusicArtistChildrenListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "auto",
        scalable: !0,
        centerText: !0,
        fields: ["Name", "ProductionYear"],
        overlayText: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getPlaylistListOptionsFn(item) {
    return function (items) {
      var fields = [];
      return (
        "Playlist" === item.Type && fields.push("ParentName"),
        {
          renderer: listView,
          options: {
            showIndexNumberLeft: "MusicAlbum" === item.Type,
            action: "playallfromhere",
            dragHandle: "Playlist" === item.Type && !layoutManager.tv,
            playlistId: "Playlist" === item.Type ? item.Id : null,
            image: "Playlist" === item.Type,
            artist: "auto",
            showIndex: "MusicAlbum" === item.Type,
            index: "disc",
            containerAlbumArtists: "MusicAlbum" === item.Type ? item.AlbumArtists : null,
            fields: fields,
            playAction: "playallfromhere",
            itemClass: "detailsListItem",
            autoHideMediaInfo: "Playlist" === item.Type,
            enableSideMediaInfo: !0,
          },
          virtualScrollLayout: "vertical-list",
          contextMenuOptions: {openAlbum: "MusicAlbum" !== item.Type},
        }
      );
    };
  }
  function getAppearsOnListsListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "autooverflow",
        centerText: !0,
        fields: ["Name"],
        overlayText: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getArtistSongsListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "auto",
        lines: 2,
        centerText: !0,
        fields: ["Name", "Album"],
        overlayPlayButton: !0,
        overlayText: !1,
        sideFooter: !0,
        action: "play",
      },
      virtualScrollLayout: "horizontal-grid",
      contextMenuOptions: {openArtist: !1},
    };
  }
  function getPeopleListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        cardLayout: !1,
        centerText: !0,
        fields: ["Name", "PersonRole"],
        cardFooterAside: !1,
        showPersonRoleOrType: !0,
        multiSelect: !1,
        coverImage: !0,
        shape: "portrait",
        draggable: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getMoreLikeThisOnLiveTVListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "auto",
        fields: ["ParentName", "Name", "ProductionYear"],
        centerText: !0,
        showDetailsMenu: !0,
        overlayPlayButton: !0,
        overlayText: !1,
        lines: 2,
        draggable: !1,
        multiSelect: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getNextUpItems(query) {
    var item = this.currentItem,
      apiClient = connectionManager.getApiClient(item);
    return (
      (query = Object.assign(
        {
          SeriesId: item.Id,
          Fields: "PrimaryImageAspectRatio,CanDelete",
          ImageTypeLimit: 1,
          UserId: apiClient.getCurrentUserId(),
        },
        query
      )),
      apiClient.getNextUpEpisodes(query)
    );
  }
  function getNextUpListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {shape: "autooverflow", fields: ["Name"], overlayText: !1, centerText: !0, scalable: !0},
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getAdditionalPartsListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "autooverflow",
        scalable: !0,
        fields: ["Name", "Runtime"],
        action: "playallfromhere",
        centerText: !0,
        overlayText: !1,
        draggable: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getExtrasListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "autooverflow",
        scalable: !0,
        fields: ["Name", "Runtime"],
        action: "playallfromhere",
        centerText: !0,
        overlayText: !1,
        draggable: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getProgramGuideListOptions(items) {
    return {
      renderer: listView,
      options: {
        imageSize: "large",
        enableUserDataButtons: !1,
        mediaInfo: !0,
        mediaInfoWithTitle: !0,
        draggable: !1,
        multiSelect: !1,
        defaultShape: "portrait",
        itemClass: "detailsListItem",
        fields: ["ParentName", "Name", "StartDateTime", "Overview"],
      },
      virtualScrollLayout: "vertical-grid",
    };
  }
  function getSeriesTimerListOptions(items) {
    return {
      renderer: listView,
      options: {
        enableUserDataButtons: !1,
        image: !0,
        mediaInfo: !1,
        imageSize: "large",
        moreButton: !1,
        recordButton: !1,
        draggable: !1,
        multiSelect: !1,
        itemClass: "detailsListItem",
        fields: ["ParentName", "Name", "StartToEndDateTime", "ChannelName", "Overview"],
      },
      virtualScrollLayout: "vertical-grid",
    };
  }
  function enableTvDetailImageLayout(item) {
    if (layoutManager.tv) {
      switch (item.Type) {
        case "Series":
        case "Season":
        case "Audio":
        case "Program":
          return !0;
        case "TvChannel":
        case "Playlist":
        case "MusicAlbum":
        case "MusicArtist":
          return !1;
      }
      switch (item.MediaType) {
        case "Video":
        case "Photo":
        case "Game":
        case "Book":
          return !0;
      }
    }
    return !1;
  }
  function afterDetailImageRefreshed() {
    var detailImageElement = this.querySelector(".detailImage");
    detailImageElement &&
      (this.querySelector(".cardImageIcon")
        ? detailImageElement.classList.remove("detailImage-transparent")
        : detailImageElement.classList.add("detailImage-transparent"));
  }
  function getChaptersListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "autooverflow",
        centerText: !0,
        overlayText: !1,
        fields: ["Name", "ChapterTime"],
        multiSelect: !1,
        contextMenu: !1,
        playedButton: !1,
        ratingButton: !1,
        action: "play",
        enableUserData: !1,
        draggable: !1,
        background: "black",
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getMoreFromSeasonListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "auto",
        scalable: !0,
        fields: ["Name"],
        overlayText: !1,
        centerText: !0,
        includeParentInfoInTitle: !1,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function getMoreFromArtistListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "auto",
        scalable: !0,
        fields: ["Name", "ProductionYear"],
        centerText: !0,
        overlayText: !1,
        overlayPlayButton: !0,
        focusTransformTitleAdjust: !0,
      },
      virtualScrollLayout: "horizontal-grid",
    };
  }
  function onPromiseFailure() {}
  function reloadItem(instance, reloadAllData, restartDataLoad) {
    !reloadAllData || (instance.dataPromise && !1 === restartDataLoad) || startDataLoad(instance),
      instance.dataPromise.then(function (responses) {
        var trackList,
          item = responses[0],
          responses = responses[1],
          apiClient =
            (item
              ? ((function (view, eventName, item) {
                  view.dispatchEvent(new CustomEvent(eventName, {detail: {item: item}, bubbles: !0, cancelable: !1}));
                })(instance.view, "itemshow", item),
                enableItemBackdropAsTopImage(item)
                  ? (document.querySelector(".backdropContainer").classList.add("backdropContainer-preventbackdrop"),
                    instance.backgroundContainer.classList.add(
                      "itemBackgroundContainer",
                      "itemBackgroundContainer-preventbackdrop"
                    ))
                  : (document.querySelector(".backdropContainer").classList.remove("backdropContainer-preventbackdrop"),
                    instance.backgroundContainer.classList.add("itemBackgroundContainer"),
                    instance.backgroundContainer.classList.remove("itemBackgroundContainer-preventbackdrop")),
                enableTvDetailImageLayout(item)
                  ? instance.backgroundContainer.classList.add("itemBackgroundContainer-brighter")
                  : instance.backgroundContainer.classList.remove("itemBackgroundContainer-brighter"))
              : instance.backgroundContainer.classList.remove(
                  "itemBackgroundContainer",
                  "itemBackgroundContainer-brighter",
                  "itemBackgroundContainer-preventbackdrop"
                ),
            connectionManager.getApiClient(item.ServerId)),
          view = instance.view;
        !(function (view, refreshData) {
          for (
            var containers = view.querySelectorAll(".generalItemsContainer"), i = 0, length = containers.length;
            i < length;
            i++
          )
            containers[i].resume({refresh: refreshData});
        })(view, reloadAllData),
          "Season" === item.Type &&
            (trackList = view.querySelector(".trackList")) &&
            trackList.resume({refresh: reloadAllData}).then(function () {
              layoutManager.tv &&
                !(function (items, element) {
                  var focusItem = items.filter(function (i) {
                    return !i.UserData || !i.UserData.Played;
                  })[0];
                  if ((focusItem = focusItem || items[0])) {
                    items = element.indexOfItemId(focusItem.Id);
                    if (-1 !== items) return element.scrollToIndex(items, {}, !0), 1;
                  }
                })(instance.seasonItems, trackList) &&
                layoutManager.tv &&
                focusManager.autoFocus(view);
            }),
          reloadAllData &&
            (renderPeopleItems(view, item, apiClient),
            (function (view, item, user, apiClient) {
              if ("SeriesTimer" === item.Type) {
                if (!user.Policy.EnableLiveTvManagement)
                  return (
                    view.querySelector(".seriesTimerScheduleSection").classList.add("hide"),
                    view.querySelector(".btnCancelSeriesTimer").classList.add("hide")
                  );
                require(["seriesRecordingEditor"], function (seriesRecordingEditor) {
                  seriesRecordingEditor.embed(item, apiClient.serverId(), {
                    context: view.querySelector(".recordingEditor"),
                  });
                }),
                  view.querySelector(".seriesTimerScheduleSection").classList.remove("hide"),
                  view.querySelector(".btnCancelSeriesTimer").classList.remove("hide");
              }
            })(view, item, responses, apiClient),
            (function (view, item, user, apiClient) {
              ("Timer" === item.Type || ("Recording" === item.Type && item.TimerId && "InProgress" === item.Status)) &&
              user.Policy.EnableLiveTvManagement
                ? (require(["recordingEditor"], function (recordingEditor) {
                    recordingEditor.embed(item, apiClient.serverId(), {
                      context: view.querySelector(".recordingEditor"),
                    });
                  }),
                  hideAll(view, "btnCancelTimer", !0))
                : hideAll(view, "btnCancelTimer");
            })(view, item, responses, apiClient),
            (function (page, item) {
              var page = page.querySelector(".linksSection"),
                links = [];
              if (item.ExternalUrls && appHost.supports("externallinks") && !layoutManager.tv)
                for (var i = 0, length = item.ExternalUrls.length; i < length; i++) {
                  var url = item.ExternalUrls[i];
                  links.push(
                    '<a is="emby-linkbutton" class="raised item-tag-button nobackdropfilter" href="' +
                      url.Url +
                      '" target="_blank"><i class="md-icon button-icon button-icon-left">link</i>' +
                      textEncoding.htmlEncode(url.Name) +
                      "</a>"
                  );
                }
              (page.querySelector(".itemLinks").innerHTML = links.join("")),
                links.length ? page.classList.remove("hide") : page.classList.add("hide");
            })(view, item),
            view.querySelector(".audioVideoMediaInfo").classList.remove("mediainfo-forcehide"),
            view.querySelector(".details-additionalContent").classList.remove("hide"),
            layoutManager.tv && focusMainSection.call(instance.mainSection)),
          loading.hide();
      }, onPromiseFailure);
  }
  function addClass(elems, className) {
    for (var i = 0, length = elems.length; i < length; i++) elems[i].classList.add(className);
  }
  function setScopedFocus(view, query, enabled, type) {
    view = "string" == typeof query ? view.querySelector(query) : query;
    enabled
      ? (view.classList.add("focusable"), view.setAttribute("data-focusabletype", type || "autofocus"))
      : (view.classList.remove("focusable"), view.removeAttribute("data-focusabletype"));
  }
  function updateTrackSelectionsFocusState(instance, view) {
    var instance = instance.trackSelectionsContainer,
      isEnabled = instance.querySelector("select:not([disabled]):not(.noSelections)");
    setScopedFocus(view, instance, isEnabled);
  }
  function ItemPage(view, params) {
    self.itemPage = this;
    BaseView.apply(this, arguments),
      (this.params = params),
      (this.playerChangeFn = function () {
        var view = this.view,
          item = this.currentItem;
        view && item && renderTrackSelectionsWithoutUser(view, this, item);
      }.bind(this)),
      (this.onInputCommandFn = function (e) {
        var command = e.detail.command;
        switch (command) {
          case "play":
            playCurrentItem(this, "resume");
            break;
          case "delete":
            onDeleteClick.call(this);
            break;
          case "record":
            executeCommandWithCommandProcessor(command, this.currentItem, {positionTo: e.target});
            break;
          default:
            return;
        }
        e.preventDefault(), e.stopPropagation();
      }.bind(this)),
      (this.topDetailsContainer = view.querySelector(".topDetailsContainer")),
      (this.backgroundContainer = document.querySelector(".backgroundContainer")),
      (this.mainSection = view.querySelector(".detailMainContainer")),
      (this.trackSelectionsContainer = view.querySelector(".trackSelections")),
      layoutManager.tv
        ? addClass(view.querySelectorAll(".reduce-font-size-tv"), "reduce-font-size")
        : (addClass(view.querySelectorAll(".detailTextContainer"), "details-largefont"),
          addClass(view.querySelectorAll(".reduce-font-size-tv"), "reduce-font-size-mobile")),
      (function (view, query, enabled, type) {
        for (var elems = view.querySelectorAll(query), i = 0, length = elems.length; i < length; i++)
          setScopedFocus(view, elems[i], enabled, type);
      })(view, ".focusable", !0, "nearest"),
      this.trackSelectionsContainer.addEventListener("submit", onTrackSelectionsSubmit),
      bindAll(view, ".btnPlay", "click", onPlayClick.bind(this)),
      bindAll(view, ".btnResume", "click", onPlayClick.bind(this)),
      bindAll(view, ".btnQueue", "click", onQueueClick.bind(this)),
      bindAll(
        view,
        ".btnShuffle",
        "click",
        function () {
          var currentItem = this.currentItem;
          playbackManager.shuffle(currentItem);
        }.bind(this)
      ),
      bindAll(
        view,
        ".btnPlayTrailer",
        "click",
        function () {
          var currentItem = this.currentItem;
          playbackManager.playTrailers(currentItem);
        }.bind(this)
      ),
      bindAll(
        view,
        ".btnCancelSeriesTimer",
        "click",
        function () {
          var currentItem = this.currentItem;
          require(["recordingHelper"], function (recordingHelper) {
            recordingHelper.cancelSeriesTimerWithConfirmation(currentItem.Id, currentItem.ServerId).then(function () {
              appRouter.showLiveTV(currentItem.ServerId);
            });
          });
        }.bind(this)
      ),
      bindAll(
        view,
        ".btnCancelTimer",
        "click",
        function () {
          var instance = this,
            item = this.currentItem,
            type = item.Type,
            serverId = item.ServerId,
            timerId = "Timer" === type ? item.Id : item.TimerId;
          require(["recordingHelper"], function (recordingHelper) {
            recordingHelper.cancelTimer(connectionManager.getApiClient(serverId), timerId).then(function () {
              reloadItem(instance, !0);
            });
          });
        }.bind(this)
      ),
      bindAll(view, ".btnDeleteItem", "click", onDeleteClick.bind(this)),
      bindAll(view, ".btnAutoPlay", "click", onAutoPlayClick.bind(this)),
      bindAll(view, ".btnSyncDownload", "download", onDownloadChange.bind(this)),
      bindAll(view, ".btnSyncDownload", "download-cancel", onDownloadChange.bind(this)),
      bindAll(
        view,
        ".btnMoreCommands",
        "click",
        function (e) {
          var button = e.currentTarget,
            instance = this,
            e = this.params,
            e = connectionManager.getApiClient(e.serverId),
            currentItem = this.currentItem,
            view = this.view;
          e.getCurrentUser().then(function (user) {
            itemContextMenu.show(getContextMenuOptions(view, currentItem, user, button)).then(function (result) {
              (!result.updated && "addtoplaylist" !== result.command && "addtocollection" !== result.command) ||
                reloadItem(instance, !0);
            }, onPromiseRejected);
          });
        }.bind(this)
      ),
      bindAll(
        view,
        ".btnManageSeriesRecording",
        "click",
        function (e) {
          var item = this.currentItem;
          item.SeriesTimerId &&
            appRouter.showItem({Type: "SeriesTimer", Id: item.SeriesTimerId, ServerId: item.ServerId});
        }.bind(this)
      ),
      bindAll(
        view,
        ".btnManageRecording",
        "click",
        function (e) {
          var item = this.currentItem;
          item.TimerId && appRouter.showItem({Type: "Timer", Id: item.TimerId, ServerId: item.ServerId});
        }.bind(this)
      ),
      this.mainSection.addEventListener(
        "focus",
        function (e) {
          layoutManager.tv && !e.target.closest(".btnReadMore,.recordingEditor") && this.view.scrollToBeginning();
        }.bind(this),
        !0
      ),
      bindAll(view, ".btnSplitVersions", "click", onSplitVersionsClick.bind(this)),
      bindAll(view, ".btnReadMore", "click", onReadMoreClick.bind(this)),
      bindAll(view, ".btnOverviewText", "click", onReadMoreClick.bind(this));
    var instance = this,
      params =
        (view.querySelector(".selectSource").addEventListener("change", function () {
          renderVideoSelections(view, instance._currentPlaybackMediaSources),
            renderAudioSelections(view, instance._currentPlaybackMediaSources),
            renderSubtitleSelections(view, instance._currentPlaybackMediaSources),
            updateTrackSelectionsFocusState(instance, view);
        }),
        view.querySelector(".btnManualRecording").addEventListener(
          "click",
          function (e) {
            executeCommandWithCommandProcessor("record", this.currentItem, {positionTo: e.target});
          }.bind(this)
        ),
        view.addEventListener(
          "viewbeforehide",
          function (e) {
            ((e = e.detail) && e.newView && e.newView.classList.contains("itemView")) ||
              (this.backgroundContainer.classList.remove(
                "itemBackgroundContainer",
                "itemBackgroundContainer-brighter",
                "itemBackgroundContainer-preventbackdrop"
              ),
              document.querySelector(".backdropContainer").classList.remove("backdropContainer-preventbackdrop"));
          }.bind(this)
        ),
        (this.onUserDataChangedFn = function (e, apiClient, userData) {
          var currentItem = this.currentItem,
            view = this.view;
          currentItem &&
            currentItem.Id === userData.ItemId &&
            ((currentItem.UserData = userData), this.paused || reloadPlayButtons(this, view, currentItem, !0));
        }.bind(this)),
        (this.onLibraryChangedFn = function (e, apiClient, data) {
          var currentItem = this.currentItem;
          this.view,
            currentItem &&
              data.ItemsUpdated &&
              data.ItemsUpdated.includes(currentItem.Id) &&
              (this.paused ? (this._fullReloadOnResume = !0) : reloadItem(this, !0));
        }.bind(this)),
        (this.onTimerCancelledFn = function (e, apiClient, data) {
          var currentItem = this.currentItem;
          currentItem && currentItem.Id === data.Id && !this.paused && appRouter.back();
        }.bind(this)),
        inputManager.on(view, this.onInputCommandFn),
        this.onLibraryChangedFn),
      params = (params && events.on(serverNotifications, "LibraryChanged", params), this.onUserDataChangedFn),
      params = (params && events.on(serverNotifications, "UserDataChanged", params), this.onTimerCancelledFn);
    params && events.on(serverNotifications, "TimerCancelled", params);
  }
  return (
    Object.assign(ItemPage.prototype, BaseView.prototype),
    (ItemPage.prototype.onBeginResume = function (options) {
      BaseView.prototype.onBeginResume.apply(this, arguments), startDataLoad(this);
    }),
    (ItemPage.prototype.onResume = function (options) {
      window.itemPage = this;
      if (options.fromPlayEnded) {
        var current = this.currentItem;
        if (
          (current.Type == "Series" || current.Type == "Season" || current.Type == "Episode") &&
          appSettings.get("autoplay") == "true"
        ) {
          toast("播放结束");
          var self = this;
          window.timeout1 = setTimeout(function () {
            window.timeout1 = null;
            var itemsContainer = self.view.querySelector(
              current.Type == "Series"
                ? ".nextUpItemsContainer"
                : current.Type == "Season"
                ? ".trackList"
                : ".moreFromSeasonItemsContainer"
            );
            var items = itemsContainer.getItems();
            var currentIndex = items.findIndex(item => {
              return item && item.Id == window.id;
            });
            if (currentIndex == -1) {
              toast("你去看别的女人了，我不播了");
              return;
            }
            var nextIndex = currentIndex + 1;
            if (items.length == nextIndex) {
              toast("已经播放到最后一集");
              return;
            }
            var item = itemsContainer.getItem(currentIndex);
            if (window.state.PositionTicks / window.RunTimeTicks > 0.9) {
              var realIndex = item.IndexNumber;
              itemsContainer.scrollToIndex(nextIndex);
              var nextItem = itemsContainer.getItem(nextIndex);
              toast("上一集「第 " + realIndex + " 集」已播放完，即将播放下一集「第 " + nextItem.IndexNumber + " 集」");
              if (current.Type == "Episode") {
                window.timeout2 = setTimeout(function () {
                  window.timeout2 = null;
                  var nextContent = itemsContainer.virtualScroller
                    ? itemsContainer.virtualScroller.scroller._keyToChild[nextIndex]
                    : itemsContainer.children[nextIndex];
                  nextContent.querySelector(".cardContent").click();
                }, 2000);
                window.timeout3 = setTimeout(function () {
                  window.timeout3 = null;
                  var mainDetailBtns = window.itemPage.mainSection.querySelectorAll(".mainDetailButtons");
                  mainDetailBtns[0].children[0].click();
                }, 5000);
              } else {
                window.timeout2 = setTimeout(function () {
                  window.timeout2 = null;
                  commandprocessor.default.executeCommand("resume", nextItem);
                }, 3000);
              }
            }
          }, 1000);
        }
      }
      BaseView.prototype.onResume.apply(this, arguments);
      var view = this.view,
        onPlayerChangeFn = this.playerChangeFn,
        onPlayerChangeFn =
          (onPlayerChangeFn && events.on(playbackManager, "playerchange", onPlayerChangeFn),
          options.refresh || this._fullReloadOnResume);
      (this._fullReloadOnResume = !1),
        reloadItem(this, onPlayerChangeFn, !1),
        onPlayerChangeFn ||
          (renderTrackSelectionsWithoutUser(view, this, (options = this.currentItem), !0),
          setTrailerButtonVisibility(view, options)),
        (this._fullReloadOnResume = !1);
    }),
    (ItemPage.prototype.onPause = function () {
      BaseView.prototype.onPause.apply(this, arguments);
      for (
        var onPlayerChangeFn = this.playerChangeFn,
          onPlayerChangeFn =
            (onPlayerChangeFn && events.off(playbackManager, "playerchange", onPlayerChangeFn), this.view),
          containers = onPlayerChangeFn.querySelectorAll(".generalItemsContainer"),
          i = 0,
          length = containers.length;
        i < length;
        i++
      )
        containers[i].pause();
    }),
    (ItemPage.prototype.enableTransitions = function () {
      return !0;
    }),
    (ItemPage.prototype.destroy = function () {
      var view = this.view,
        onLibraryChangedFn = this.onLibraryChangedFn,
        onLibraryChangedFn =
          (onLibraryChangedFn && events.off(serverNotifications, "LibraryChanged", onLibraryChangedFn),
          (this.onLibraryChangedFn = null),
          this.onUserDataChangedFn),
        onLibraryChangedFn =
          (onLibraryChangedFn && events.off(serverNotifications, "UserDataChanged", onLibraryChangedFn),
          (this.onUserDataChangedFn = null),
          this.onTimerCancelledFn),
        onLibraryChangedFn =
          (onLibraryChangedFn && events.off(serverNotifications, "TimerCancelled", onLibraryChangedFn),
          (this.onTimerCancelledFn = null),
          this.onInputCommandFn);
      onLibraryChangedFn && view && inputManager.off(view, onLibraryChangedFn),
        (this.onInputCommandFn = null),
        BaseView.prototype.destroy.apply(this, arguments),
        (this.playerChangeFn = null),
        (this.currentItem = null),
        (this._currentPlaybackMediaSources = null),
        this.currentRecordingFields && (this.currentRecordingFields.destroy(), (this.currentRecordingFields = null)),
        (this.seasonItems = null),
        (this.topDetailsContainer = null),
        (this.mainSection = null),
        (this.backgroundContainer = null),
        (this.trackSelectionsContainer = null),
        (this.params = null),
        (this.dataPromise = null);
    }),
    ItemPage
  );
});
