define([
  "exports",
  "./../modules/viewmanager/baseview.js",
  "./../modules/focusmanager.js",
  "./../modules/common/servicelocator.js",
  "./../modules/emby-apiclient/connectionmanager.js",
  "./../modules/common/usersettings/usersettings.js",
  "./../modules/common/usersettings/usersettingsbuilder.js",
  "./../modules/loading/loading.js",
  "./../modules/common/globalize.js",
  "./../modules/emby-elements/emby-scroller/emby-scroller.js",
  "./../modules/emby-elements/emby-select/emby-select.js",
  "./../modules/emby-elements/emby-button/emby-button.js",
  "./../modules/emby-elements/emby-input/emby-input.js",
  "./../modules/emby-elements/emby-checkbox/emby-checkbox.js",
  "./../modules/layoutmanager.js",
  "./../modules/common/appsettings.js",
  "./../modules/common/qualityoptions.js",
], function (
  _exports,
  _baseview,
  _focusmanager,
  _servicelocator,
  _connectionmanager,
  _usersettings,
  _usersettingsbuilder,
  _loading,
  _globalize,
  _embyScroller,
  _embySelect,
  _embyButton,
  _embyInput,
  _embyCheckbox,
  _layoutmanager,
  _appsettings,
  _qualityoptions
) {
  function fillSkipLengths(select) {
    select.innerHTML = [5, 10, 15, 20, 25, 30]
      .map(function (option) {
        return {name: _globalize.default.translate("ValueSeconds", option), value: 1e3 * option};
      })
      .map(function (o) {
        return '<option value="' + o.value + '">' + o.name + "</option>";
      })
      .join("");
  }
  function setMaxBitrateIntoField(select, isInNetwork, mediatype) {
    var options =
      "Audio" === mediatype
        ? _qualityoptions.default.getAudioQualityOptions({
            currentMaxBitrate: _appsettings.default.maxStreamingBitrate(isInNetwork, mediatype),
            isAutomaticBitrateEnabled: _appsettings.default.enableAutomaticBitrateDetection(isInNetwork, mediatype),
            enableAuto: !0,
          })
        : _qualityoptions.default.getVideoQualityOptions({
            currentMaxBitrate: _appsettings.default.maxStreamingBitrate(isInNetwork, mediatype),
            isAutomaticBitrateEnabled: _appsettings.default.enableAutomaticBitrateDetection(isInNetwork, mediatype),
            enableAuto: !0,
          });
    (select.innerHTML = options
      .map(function (i) {
        return '<option value="' + (i.bitrate || "") + '">' + i.name + "</option>";
      })
      .join("")),
      _appsettings.default.enableAutomaticBitrateDetection(isInNetwork, mediatype)
        ? (select.value = "")
        : (select.value = _appsettings.default.maxStreamingBitrate(isInNetwork, mediatype));
  }
  function setMaxBitrateFromField(select, isInNetwork, mediatype) {
    select.value
      ? (_appsettings.default.maxStreamingBitrate(isInNetwork, mediatype, select.value),
        _appsettings.default.enableAutomaticBitrateDetection(isInNetwork, mediatype, !1))
      : _appsettings.default.enableAutomaticBitrateDetection(isInNetwork, mediatype, !0);
  }
  function loadForm(context, user, userSettings, apiClient) {
    var loggedInUserId = apiClient.getCurrentUserId(),
      userId = user.Id,
      loggedInUserId =
        (!(function (context, user, apiClient) {
          if (_servicelocator.appHost.supports("multiserver"))
            return (
              context.querySelector(".fldVideoInNetworkQuality").classList.remove("hide"),
              context.querySelector(".fldVideoInternetQuality").classList.remove("hide"),
              user.Policy.EnableAudioPlaybackTranscoding
                ? context.querySelector(".musicQualitySection").classList.remove("hide")
                : context.querySelector(".musicQualitySection").classList.add("hide")
            );
          apiClient.getEndpointInfo().then(function (endpointInfo) {
            endpointInfo.IsInNetwork
              ? (context.querySelector(".fldVideoInNetworkQuality").classList.remove("hide"),
                context.querySelector(".fldVideoInternetQuality").classList.add("hide"),
                context.querySelector(".musicQualitySection").classList.add("hide"))
              : (context.querySelector(".fldVideoInNetworkQuality").classList.add("hide"),
                context.querySelector(".fldVideoInternetQuality").classList.remove("hide"),
                user.Policy.EnableAudioPlaybackTranscoding
                  ? context.querySelector(".musicQualitySection").classList.remove("hide")
                  : context.querySelector(".musicQualitySection").classList.add("hide"));
          });
        })(context, user, apiClient),
        apiClient.getCultures().then(function (allCultures) {
          var select = context.querySelector(".selectAudioLanguage"),
            languages = allCultures,
            value = user.Configuration.AudioLanguagePreference,
            html = "";
          html +=
            "<option" +
            (value ? "" : " selected") +
            " value=''>" +
            _globalize.default.translate("AnyLanguage") +
            "</option>";
          for (var i = 0, length = languages.length; i < length; i++) {
            var culture = languages[i];
            html +=
              "<option" +
              (value === culture.TwoLetterISOLanguageName || value === culture.ThreeLetterISOLanguageName
                ? " selected"
                : "") +
              " value='" +
              culture.TwoLetterISOLanguageName +
              "'>" +
              culture.DisplayName +
              "</option>";
          }
          (select.innerHTML = html),
            (context.querySelector(".chkEpisodeAutoPlay").checked = user.Configuration.EnableNextEpisodeAutoPlay || !1);
        }),
        _servicelocator.appHost.supports("backgroundvideo")
          ? context.querySelector(".fldBackgroundVideo").classList.remove("hide")
          : context.querySelector(".fldBackgroundVideo").classList.add("hide"),
        _servicelocator.appHost.supports("externalplayerintent") && userId === loggedInUserId
          ? context.querySelector(".fldExternalPlayer").classList.remove("hide")
          : context.querySelector(".fldExternalPlayer").classList.add("hide"),
        userId === loggedInUserId
          ? (context.querySelector(".qualitySections").classList.remove("hide"),
            _servicelocator.appHost.supports("chromecast")
              ? context.querySelector(".fldChromecastQuality").classList.remove("hide")
              : context.querySelector(".fldChromecastQuality").classList.add("hide"))
          : (context.querySelector(".qualitySections").classList.add("hide"),
            context.querySelector(".fldChromecastQuality").classList.add("hide")),
        _servicelocator.appHost.supports("changerefreshrate")
          ? context.querySelector(".fldEnableRefreshRate").classList.remove("hide")
          : context.querySelector(".fldEnableRefreshRate").classList.add("hide"),
        "554ae9ea56b94c1c82cc628f6de52d85" === apiClient.serverId()
          ? context.querySelector(".fldEnableNextVideoOverlay").classList.add("hide")
          : context.querySelector(".fldEnableNextVideoOverlay").classList.remove("hide"),
        (context.querySelector(".chkRememberAudioTracks").checked = user.Configuration.RememberAudioSelections || !1),
        (context.querySelector(".chkPlayDefaultAudioTrack").checked = user.Configuration.PlayDefaultAudioTrack || !1),
        (context.querySelector(".chkEnableCinemaMode").checked = userSettings.enableCinemaMode()),
        (context.querySelector(".chkEnableNextVideoOverlay").checked = userSettings.enableNextVideoInfoOverlay()),
        (context.querySelector(".chkExternalVideoPlayer").checked = _appsettings.default.enableSystemExternalPlayers()),
        (context.querySelector(".selectBackgroundVideo").value = _appsettings.default.backgroundVideo() || ""),
        (context.querySelector(".chkEnableRefreshRate").checked = _appsettings.default.enableRefreshRateSwitching()),
        (context.querySelector(".chkStillWatching").checked = userSettings.enableStillWatching()),
        setMaxBitrateIntoField(context.querySelector(".selectVideoInNetworkQuality"), !0, "Video"),
        setMaxBitrateIntoField(context.querySelector(".selectVideoInternetQuality"), !1, "Video"),
        setMaxBitrateIntoField(context.querySelector(".selectMusicInternetQuality"), !1, "Audio"),
        (userId = context.querySelector(".selectChromecastVideoQuality")),
        (loggedInUserId = _qualityoptions.default.getVideoQualityOptions({
          currentMaxBitrate: _appsettings.default.maxChromecastBitrate(),
          isAutomaticBitrateEnabled: !_appsettings.default.maxChromecastBitrate(),
          enableAuto: !0,
        })),
        (userId.innerHTML = loggedInUserId
          .map(function (i) {
            return '<option value="' + (i.bitrate || "") + '">' + i.name + "</option>";
          })
          .join("")),
        (userId.value = _appsettings.default.maxChromecastBitrate() || ""),
        context.querySelector(".selectSkipForwardLength")),
      userId =
        (fillSkipLengths(loggedInUserId),
        (loggedInUserId.value = userSettings.skipForwardLength()),
        context.querySelector(".selectSkipBackLength")),
      loggedInUserId =
        (fillSkipLengths(userId),
        (userId.value = userSettings.skipBackLength()),
        context.querySelector(".selectResumeRewind"));
    !(function (select) {
      select.innerHTML = [0, 5, 10, 15, 20]
        .map(function (option) {
          return {name: _globalize.default.translate("ValueSeconds", option), value: option};
        })
        .map(function (o) {
          return '<option value="' + o.value + '">' + o.name + "</option>";
        })
        .join("");
    })(loggedInUserId),
      (loggedInUserId.value = user.Configuration.ResumeRewindSeconds || 0),
      (context.querySelector(".selectIntroSkip").value = user.Configuration.IntroSkipMode || "None"),
      (function (context, apiClient) {
        "554ae9ea56b94c1c82cc628f6de52d85" === apiClient.serverId()
          ? context.querySelector(".fldEpisodeAutoPlay").classList.add("hide")
          : context.querySelector(".fldEpisodeAutoPlay").classList.remove("hide");
      })(context, apiClient),
      _loading.default.hide();
  }
  function save(context, userId, userSettings, apiClient, enableSaveConfirmation) {
    _loading.default.show(),
      apiClient.getUser(userId).then(function (user) {
        !(function (context, user, userSettingsInstance, apiClient) {
          return (
            _appsettings.default.enableRefreshRateSwitching(context.querySelector(".chkEnableRefreshRate").checked),
            _appsettings.default.backgroundVideo(context.querySelector(".selectBackgroundVideo").value),
            _appsettings.default.enableSystemExternalPlayers(context.querySelector(".chkExternalVideoPlayer").checked),
            _appsettings.default.maxChromecastBitrate(context.querySelector(".selectChromecastVideoQuality").value),
            setMaxBitrateFromField(context.querySelector(".selectVideoInNetworkQuality"), !0, "Video"),
            setMaxBitrateFromField(context.querySelector(".selectVideoInternetQuality"), !1, "Video"),
            setMaxBitrateFromField(context.querySelector(".selectMusicInternetQuality"), !1, "Audio"),
            (user.Configuration.AudioLanguagePreference = context.querySelector(".selectAudioLanguage").value),
            (user.Configuration.PlayDefaultAudioTrack = context.querySelector(".chkPlayDefaultAudioTrack").checked),
            (user.Configuration.EnableNextEpisodeAutoPlay = context.querySelector(".chkEpisodeAutoPlay").checked),
            (user.Configuration.RememberAudioSelections = context.querySelector(".chkRememberAudioTracks").checked),
            userSettingsInstance.enableCinemaMode(context.querySelector(".chkEnableCinemaMode").checked),
            userSettingsInstance.enableNextVideoInfoOverlay(
              context.querySelector(".chkEnableNextVideoOverlay").checked
            ),
            userSettingsInstance.skipForwardLength(context.querySelector(".selectSkipForwardLength").value),
            userSettingsInstance.skipBackLength(context.querySelector(".selectSkipBackLength").value),
            userSettingsInstance.enableStillWatching(context.querySelector(".chkStillWatching").checked),
            (user.Configuration.ResumeRewindSeconds = context.querySelector(".selectResumeRewind").value),
            (user.Configuration.IntroSkipMode = context.querySelector(".selectIntroSkip").value),
            apiClient.updateUserConfiguration(user.Id, user.Configuration)
          );
        })(context, user, userSettings, apiClient).then(
          function () {
            _loading.default.hide(),
              enableSaveConfirmation &&
                require(["toast"], function (toast) {
                  toast(_globalize.default.translate("SettingsSaved"));
                });
          },
          function () {
            _loading.default.hide();
          }
        );
      });
  }
  function onSubmit(e) {
    var options = this,
      apiClient = _connectionmanager.default.getApiClient(options.serverId),
      userId = options.userId,
      userSettings = options.userSettings;
    return (
      userSettings.setUserInfo(userId, apiClient).then(function () {
        var enableSaveConfirmation = options.enableSaveConfirmation;
        save(options.element, userId, userSettings, apiClient, enableSaveConfirmation);
      }),
      e && e.preventDefault(),
      !1
    );
  }
  function onTrackSelectionsCleared() {
    _loading.default.hide();
  }
  function View(view, params) {
    _baseview.default.apply(this, arguments);
    for (
      var apiClient = _connectionmanager.default.getApiClient(params.serverId),
        userId = params.userId || apiClient.getCurrentUserId(),
        userSettings =
          userId === apiClient.getCurrentUserId() ? _usersettings.default : new _usersettingsbuilder.default(),
        userId = {
          serverId: apiClient.serverId(),
          userId: userId,
          element: view.querySelector(".settingsContainer"),
          userSettings: userSettings,
          enableSaveButton: !1,
          enableSaveConfirmation: !1,
          autoFocus: !0,
          autoSave: !0,
        },
        featurePremiereInfo =
          ((this.settingsOptions = userId),
          apiClient.isMinServerVersion("4.7.0.15")
            ? userId.element.querySelector(".fldResumeRewind").classList.remove("hide")
            : userId.element.querySelector(".fldResumeRewind").classList.add("hide"),
          apiClient.isMinServerVersion("4.7.2")
            ? userId.element.querySelector(".fldIntroSkip").classList.remove("hide")
            : userId.element.querySelector(".fldIntroSkip").classList.add("hide"),
          userId.element.querySelector("form").addEventListener("submit", onSubmit.bind(userId)),
          userId.element.querySelector(".btnClearTrackSelections").addEventListener(
            "click",
            function (e) {
              var options = this,
                mode = e.target.closest("button").getAttribute("data-mode");
              require(["confirm"]).then(function (responses) {
                return responses[0]({
                  title: _globalize.default.translate("HeaderClearTrackSelections"),
                  text: _globalize.default.translate("QuestionClearSavedTracks"),
                  confirmText: _globalize.default.translate("HeaderClearTrackSelections"),
                  primary: "cancel",
                }).then(function () {
                  return (
                    _loading.default.show(),
                    _connectionmanager.default
                      .getApiClient(options.serverId)
                      .clearUserTrackSelections(options.userId, mode)
                      .then(onTrackSelectionsCleared, onTrackSelectionsCleared)
                  );
                });
              });
            }.bind(userId)
          ),
          userId.enableSaveButton && userId.element.querySelector(".btnSave").classList.remove("hide"),
          userId.element.querySelectorAll(".featurePremiereInfo")),
        i = 0,
        length = featurePremiereInfo.length;
      i < length;
      i++
    )
      featurePremiereInfo[i].innerHTML = _globalize.default.translate("", "", "");
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["listViewStyle"]),
    Object.assign(View.prototype, _baseview.default.prototype),
    (View.prototype.onResume = function (options) {
      _baseview.default.prototype.onResume.apply(this, arguments),
        options.refresh &&
          (function (options) {
            var context = options.element,
              userId = (_loading.default.show(), options.userId),
              apiClient = _connectionmanager.default.getApiClient(options.serverId),
              userSettings = options.userSettings;
            apiClient.getUser(userId).then(function (user) {
              (userId === apiClient.getCurrentUserId()
                ? Promise.resolve()
                : userSettings.setUserInfo(userId, apiClient)
              ).then(function () {
                loadForm(context, user, userSettings, apiClient),
                  _layoutmanager.default.tv && _focusmanager.default.autoFocus(context);
              });
            });
          })(this.settingsOptions);
    }),
    (View.prototype.onPause = function () {
      this.settingsOptions.autoSave && onSubmit.call(this.settingsOptions),
        _baseview.default.prototype.onPause.apply(this, arguments);
    }),
    (View.prototype.destroy = function () {
      _baseview.default.prototype.destroy.apply(this, arguments), (this.settingsOptions = null);
    }),
    (_exports.default = View);
});
