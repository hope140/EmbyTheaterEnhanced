define([
  "inputManager",
  "events",
  "globalize",
  "playbackManager",
  "connectionManager",
  "playMethodHelper",
  "layoutManager",
  "paper-icon-button-light",
  "css!./playerstats",
  "scrollStyles",
  "exports",
  "./../emby-apiclient/connectionmanager.js",
  "./../common/playback/playbackmanager.js",
  "./../common/globalize.js",
  "./../emby-apiclient/events.js",
  "./../layoutmanager.js",
  "./../common/inputmanager.js",
  "./../emby-elements/emby-button/paper-icon-button-light.js",
  "./../mediainfo/mediainfo.js",
], function (
  inputManager,
  events,
  globalize,
  playbackManager,
  connectionManager,
  playMethodHelper,
  layoutManager,
  _exports,
  _connectionmanager,
  _playbackmanager,
  _globalize,
  _events,
  _layoutmanager,
  _inputmanager,
  _paperIconButtonLight,
  _mediainfo
) {
  function init(instance) {
    var button,
      parent = document.createElement("div");
    parent.classList.add("playerStats"), parent.classList.add("hide");
    (parent.innerHTML =
      '<div class="playerStats-content">' +
      (button =
        '<button type="button" is="paper-icon-button-light" class="playerStats-closeButton"><i class="md-icon">close</i></button>') +
      '<div class="playerStats-stats scrollY hiddenScrollY-hover scrollY-mini"></div></div>'),
      (button = parent.querySelector(".playerStats-closeButton")) &&
        button.addEventListener(
          "click",
          function () {
            this.enabled(!1), events.trigger(this, "close");
          }.bind(instance)
        ),
      document.body.appendChild(parent),
      (instance.element = parent);
  }
  function translateReason(reason) {
    return globalize.translate("" + reason);
  }
  function getVideoStats(session) {
    for (
      var mediaStream,
        stats = [],
        playstate = session.PlayState || {},
        mediaStreams = (session.NowPlayingItem || {}).MediaStreams || [],
        videoStreamIndex = playstate.VideoStreamIndex,
        playstate = session.TranscodingInfo || {},
        i = 0,
        length = mediaStreams.length;
      i < length;
      i++
    )
      if (
        "Video" === mediaStreams[i].Type &&
        (null == videoStreamIndex || videoStreamIndex === mediaStreams[i].Index)
      ) {
        mediaStream = mediaStreams[i];
        break;
      }
    if (mediaStream) {
      var session = mediaStream.DisplayTitle || _globalize.default.translate("Video"),
        session =
          (playstate.VideoDecoderHwAccel &&
            (session +=
              '<i class="md-icon playerStatsIcon playerStats-hwaccelIcon" title="' +
              _globalize.default.translate("HeaderHardwareAcceleratedDecoding") +
              " (" +
              (playstate.VideoDecoderHwAccel || _globalize.default.translate("Software")) +
              ')">&#xe30d;</i>'),
          stats.push({label: session}),
          []),
        framerate =
          (mediaStream.Profile && session.push(mediaStream.Profile),
          mediaStream.Level && session.push(mediaStream.Level),
          mediaStream.BitRate && session.push(_mediainfo.default.bitrateToString(mediaStream.BitRate)),
          mediaStream.AverageFrameRate || mediaStream.RealFrameRate),
        framerate =
          (framerate &&
            session.push(
              (function (value, maximumFractionDigits) {
                try {
                  return new Intl.NumberFormat(_globalize.default.getCurrentLocales(), {
                    style: "decimal",
                    maximumFractionDigits: maximumFractionDigits || 1,
                  }).format(value);
                } catch (err) {
                  return console.log("Error in NumberFormat: " + err), value;
                }
              })(framerate, 3) + " fps"
            ),
          session.length && stats.push({label: session.join(" ")}),
          '<i class="md-icon playerStatsIcon autortl">&#xe941;</i>');
      if (
        (!1 === playstate.IsVideoDirect
          ? ((framerate =
              (framerate = framerate + _globalize.default.translate("Transcode") + " (") +
              (playstate.VideoCodec || "").toUpperCase() +
              " "),
            playstate.VideoBitrate && (framerate += _mediainfo.default.bitrateToString(playstate.VideoBitrate)),
            (framerate += ")"),
            playstate.VideoEncoderHwAccel &&
              (framerate +=
                '<i class="md-icon playerStatsIcon playerStats-hwaccelIcon" title="' +
                _globalize.default.translate("HeaderHardwareAcceleratedEncoding") +
                " (" +
                (playstate.VideoEncoderHwAccel || _globalize.default.translate("Software")) +
                ')">&#xe30d;</i>'))
          : ((framerate += _globalize.default.translate("HeaderDirectPlay")),
            mediaStream.BitRate && (framerate += " (" + _mediainfo.default.bitrateToString(mediaStream.BitRate) + ")")),
        stats.push({value: framerate}),
        !1 === playstate.IsVideoDirect)
      )
        for (var pipeline = playstate.VideoPipelineInfo || [], _i = 0, _length = pipeline.length; _i < _length; _i++) {
          var html,
            extra,
            step = pipeline[_i];
          ("ToneMapping" !== step.StepType &&
            "Deinterlace" !== step.StepType &&
            "SubTitleBurnIn" !== step.StepType &&
            "SubtitleOverlay" !== step.StepType) ||
            ((html = ""),
            (html += '<i class="md-icon playerStatsIcon autortl">&#xe941;</i>'),
            "ToneMapping" === step.StepType
              ? (html += _globalize.default.translate("HeaderToneMapping"))
              : "Deinterlace" === step.StepType
              ? (html += _globalize.default.translate("Deinterlacing"))
              : ("SubTitleBurnIn" !== step.StepType && "SubtitleOverlay" !== step.StepType) ||
                (html += _globalize.default.translate("HeaderBurningInSubtitles")),
            (extra = []),
            step.ParamShort
              ? extra.push(step.ParamShort)
              : step.Param
              ? "Subtitles" !== step.Param && extra.push(step.Param)
              : step.FfmpegOptions && extra.push(step.FfmpegOptions),
            extra.length && (html += ' <span class="secondaryText">(' + extra.join(" ") + ")</span>"),
            stats.push({value: html}));
        }
    }
    return stats;
  }
  function getDisplayBitrate(bitrate) {
    return 1e6 < bitrate ? (bitrate / 1e6).toFixed(1) + " Mbps" : Math.floor(bitrate / 1e3) + " Kbps";
  }
  function getCategory(categories, type, name) {
    for (var i = 0, length = categories.length; i < length; i++) {
      var _category = categories[i];
      if (_category.type === type) return _category;
    }
    name = {stats: [], name: name, type: type};
    return categories.push(name), name;
  }
  function getStats(instance, player) {
    var statsPromise = player.getStats ? player.getStats() : Promise.resolve({}),
      instance = (function (instance, player) {
        return Date.now() - (instance.lastSessionTime || 0) < 1e4
          ? Promise.resolve(instance.lastSession)
          : (player = connectionManager.getApiClient(playbackManager.currentItem(player).ServerId))
              .getSessions({deviceId: player.deviceId()})
              .then(
                function (sessions) {
                  return (
                    (instance.lastSession = sessions[0] || {}),
                    (instance.lastSessionTime = Date.now()),
                    Promise.resolve(instance.lastSession)
                  );
                },
                function () {
                  return Promise.resolve({});
                }
              );
      })(instance, player);
    return Promise.all([statsPromise, instance]).then(function (responses) {
      var playerStats = responses[0].categories || [],
        responses = responses[1],
        displayPlayMethod = playMethodHelper.getDisplayPlayMethod(responses),
        baseCategory = {stats: [], name: "播放信息"},
        categories =
          (baseCategory.stats.unshift({label: "播放形式:", value: displayPlayMethod}),
          baseCategory.stats.unshift({label: "播放器:", value: player.name}),
          []);
      categories.push(baseCategory);
      for (var i = 0, length = playerStats.length; i < length; i++) {
        var category = playerStats[i];
        "audio" === category.type
          ? (category.name = "音频信息")
          : "video" === category.type && (category.name = "视频信息"),
          categories.push(category);
      }
      return (
        responses.TranscodingInfo &&
          categories.push({
            stats: (function (session, displayPlayMethod) {
              var videoCodec,
                audioCodec,
                totalBitrate,
                sessionStats = [];
              return (
                session.TranscodingInfo &&
                  ((videoCodec = session.TranscodingInfo.VideoCodec),
                  (audioCodec = session.TranscodingInfo.AudioCodec),
                  (totalBitrate = session.TranscodingInfo.Bitrate),
                  session.TranscodingInfo.AudioChannels),
                videoCodec &&
                  sessionStats.push({
                    label: "视频编码:",
                    value: session.TranscodingInfo.IsVideoDirect
                      ? videoCodec.toUpperCase() + " (Direct)"
                      : videoCodec.toUpperCase(),
                  }),
                audioCodec &&
                  sessionStats.push({
                    label: "音频编码:",
                    value: session.TranscodingInfo.IsAudioDirect
                      ? audioCodec.toUpperCase() + " (Direct)"
                      : audioCodec.toUpperCase(),
                  }),
                "Transcode" === displayPlayMethod &&
                  (totalBitrate &&
                    sessionStats.push({label: "转换码率(Bit):", value: getDisplayBitrate(totalBitrate)}),
                  session.TranscodingInfo.CompletionPercentage &&
                    sessionStats.push({
                      label: "转码完成度:",
                      value: session.TranscodingInfo.CompletionPercentage.toFixed(1) + "%",
                    }),
                  session.TranscodingInfo.Framerate &&
                    sessionStats.push({label: "转码帧速率:", value: session.TranscodingInfo.Framerate * 1.5 + " fps"}),
                  session.TranscodingInfo.TranscodeReasons &&
                    session.TranscodingInfo.TranscodeReasons.length &&
                    sessionStats.push({
                      label: "转码原因:",
                      value: session.TranscodingInfo.TranscodeReasons.map(translateReason).join("<br/>"),
                    })),
                sessionStats
              );
            })(responses, displayPlayMethod),
            name: "转码" === displayPlayMethod ? "转码信息" : "当前播放源信息",
          }),
        categories.push({
          stats: (function (player) {
            var sessionStats = [],
              totalBitrate = (mediaSource = playbackManager.currentMediaSource(player) || {}).Bitrate;
            mediaSource.Container && sessionStats.push({label: "媒体源容器:", value: mediaSource.Container}),
              totalBitrate && sessionStats.push({label: "比特率(Bit)", value: getDisplayBitrate(totalBitrate)});
            var mediaSource = (totalBitrate =
                (mediaSource.MediaStreams || []).filter(function (s) {
                  return "Video" === s.Type;
                })[0] || {}).Codec,
              audioStreamIndex = playbackManager.getAudioStreamIndex(player),
              audioCodec = (player =
                playbackManager.audioTracks(player).filter(function (s) {
                  return "Audio" === s.Type && s.Index === audioStreamIndex;
                })[0] || {}).Codec,
              audioChannels = player.Channels,
              videoInfos = [],
              mediaSource =
                (mediaSource && videoInfos.push(mediaSource.toUpperCase()),
                totalBitrate.Profile && videoInfos.push(totalBitrate.Profile),
                videoInfos.length && sessionStats.push({label: "视频编码:", value: videoInfos.join(" ")}),
                totalBitrate.BitRate &&
                  sessionStats.push({label: "视频码率:", value: getDisplayBitrate(totalBitrate.BitRate)}),
                (totalBitrate.AverageFrameRate || totalBitrate.RealFrameRate) &&
                  sessionStats.push({
                    label: "视频帧速率:",
                    value: (totalBitrate.AverageFrameRate || totalBitrate.RealFrameRate) + " fps",
                  }),
                []);
            return (
              audioCodec && mediaSource.push(audioCodec.toUpperCase()),
              player.Profile && mediaSource.push(player.Profile),
              mediaSource.length && sessionStats.push({label: "音频编码:", value: mediaSource.join(" ")}),
              player.BitRate && sessionStats.push({label: "音频码率:", value: getDisplayBitrate(player.BitRate)}),
              audioChannels && sessionStats.push({label: "音频声道:", value: audioChannels}),
              player.SampleRate && sessionStats.push({label: "音频采样率:", value: player.SampleRate + " Hz"}),
              player.BitDepth && sessionStats.push({label: "音频位深度:", value: player.BitDepth}),
              sessionStats
            );
          })(player),
          name: "媒体源文件信息",
        }),
        Promise.resolve(categories)
      );
    });
  }
  function renderPlayerStats(instance, player) {
    var now = Date.now();
    now - (instance.lastRender || 0) < 700 ||
      ((instance.lastRender = now),
      getStats(instance, player).then(function (stats) {
        var elem = instance.element;
        elem &&
          !(function (elem, categories) {
            elem.querySelector(".playerStats-stats").innerHTML = categories
              .map(function (category) {
                var categoryHtml = "",
                  stats = category.stats;
                stats.length &&
                  category.name &&
                  (categoryHtml =
                    (categoryHtml =
                      (categoryHtml +=
                        '<div class="playerStats-stat playerStats-stat-header"><div class="playerStats-stat-label">') +
                      category.name +
                      "</div>") +
                    '<div class="playerStats-stat-value">' +
                    (category.subText || "") +
                    "</div></div>");
                for (var i = 0, length = stats.length; i < length; i++) {
                  categoryHtml += '<div class="playerStats-stat">';
                  var stat = stats[i],
                    categoryHtml =
                      (categoryHtml =
                        (categoryHtml =
                          (categoryHtml = (categoryHtml += '<div class="playerStats-stat-label">') + stat.label) +
                          "</div>" +
                          '<div class="playerStats-stat-value">') + stat.value) +
                      "</div>" +
                      "</div>";
                }
                return categoryHtml;
              })
              .join("");
          })(elem, stats);
      }));
  }
  function unbindEvents(instance, player) {
    var onTimeUpdate = instance.onTimeUpdate,
      player = (onTimeUpdate && events.off(player, "timeupdate", onTimeUpdate), instance.onInputCommand);
    player && inputManager.off(instance.element, player);
  }
  function PlayerStats(options) {
    (this.options = options),
      (this.onTimeUpdate = function () {
        var options = this.options;
        options && renderPlayerStats(this, options.player);
      }.bind(this)),
      (this.onInputCommand = function (e) {
        switch (e.detail.command) {
          case "back":
            break;
          case "left":
          case "right":
          case "pageup":
          case "pagedown":
          case "up":
          case "down":
            e.stopPropagation();
            break;
          case "select":
          case "menu":
          case "info":
          case "movies":
          case "music":
          case "tv":
          case "settings":
          case "nowplaying":
          case "search":
          case "favorites":
          case "livetv":
          case "recordedtv":
          case "guide":
            e.preventDefault();
        }
      }.bind(this)),
      init(this),
      this.enabled(!0);
  }
  return (
    (PlayerStats.prototype.enabled = function (enabled) {
      if (null == enabled) return this._enabled;
      var player,
        onTimeUpdate,
        options = this.options;
      options &&
        ((this._enabled = enabled)
          ? (this.element.classList.remove("hide"),
            (enabled = this),
            (player = options.player),
            (onTimeUpdate = enabled.onTimeUpdate) && events.on(player, "timeupdate", onTimeUpdate),
            (player = enabled.onInputCommand) && inputManager.on(enabled.element, player))
          : (this.element.classList.add("hide"), unbindEvents(this, options.player)));
    }),
    (PlayerStats.prototype.toggle = function () {
      this.enabled(!this.enabled());
    }),
    (PlayerStats.prototype.destroy = function () {
      var options = this.options,
        options = (options && ((this.options = null), unbindEvents(this, options.player)), this.element);
      options && (options.parentNode.removeChild(options), (this.element = null)),
        (this.onTimeUpdate = null),
        (this.onInputCommand = null);
    }),
    PlayerStats
  );
});
