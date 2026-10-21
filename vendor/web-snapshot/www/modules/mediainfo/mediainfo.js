define([
  "exports",
  "./../common/datetime.js",
  "./../common/globalize.js",
  "./../common/textencoding.js",
  "./../common/itemhelper.js",
  "./../indicators/indicators.js",
  "./../approuter.js",
  "./../emby-apiclient/connectionmanager.js",
  "./../emby-elements/emby-button/emby-button.js",
], function (
  _exports,
  _datetime,
  _globalize,
  _textencoding,
  _itemhelper,
  _indicators,
  _approuter,
  _connectionmanager,
  _embyButton
) {
  function getProgramInfoHtml(item, options) {
    var date,
      text,
      html = "",
      miscInfo = [];
    if (item.StartDate && !1 !== options.programTime)
      try {
        (text = ""),
          (date = new Date(Date.parse(item.StartDate))),
          !1 !== options.startDate &&
            (text += _datetime.default.toLocaleDateString(date, {weekday: "short", month: "short", day: "numeric"})),
          (text += " " + _datetime.default.getDisplayTime(date)),
          item.EndDate &&
            ((date = new Date(Date.parse(item.EndDate))),
            (text += " &ndash; " + _datetime.default.getDisplayTime(date))),
          miscInfo.push(text);
      } catch (e) {
        console.log("Error parsing date: " + item.StartDate);
      }
    return (
      item.ChannelName &&
        ((date = item.ChannelName),
        item.ChannelNumber && (date += " " + item.ChannelNumber),
        options.interactive && item.ChannelId
          ? miscInfo.push({
              html:
                '<a is="emby-linkbutton" class="button-link button-link-color-inherit mediaInfoItem" href=".' +
                _approuter.default.getRouteUrl({
                  ServerId: item.ServerId,
                  Type: "TvChannel",
                  Name: item.ChannelName,
                  Id: item.ChannelId,
                }) +
                '">' +
                date +
                "</a>",
            })
          : miscInfo.push(date)),
      options.timerIndicator &&
        (text = (function (item) {
          var status,
            itemType = item.Type;
          if ("SeriesTimer" === itemType)
            return '<i class="md-icon mediaInfoItem mediaInfoIconItem mediaInfoTimerIcon">&#xE062;</i>';
          if (item.TimerId || item.SeriesTimerId) status = item.Status || "Cancelled";
          else {
            if ("Timer" !== itemType) return "";
            status = item.Status;
          }
          return item.SeriesTimerId
            ? "Cancelled" !== status
              ? '<i class="md-icon mediaInfoItem mediaInfoIconItem mediaInfoTimerIcon">&#xE062;</i>'
              : '<i class="md-icon mediaInfoItem mediaInfoIconItem">&#xE062;</i>'
            : '<i class="md-icon mediaInfoItem mediaInfoIconItem mediaInfoTimerIcon">&#xE061;</i>';
        })(item)) &&
        miscInfo.push({html: text}),
      (html += miscInfo.map(getMediaInfoItem).join(""))
    );
  }
  function numberToString(value, maximumFractionDigits) {
    try {
      return new Intl.NumberFormat(_globalize.default.getCurrentLocales(), {
        style: "decimal",
        maximumFractionDigits: null == maximumFractionDigits ? 1 : maximumFractionDigits,
      }).format(value);
    } catch (err) {
      return console.log("Error in NumberFormat: " + err), value;
    }
  }
  function bitrateToString(value) {
    return 1e3 < (value /= 1e3)
      ? numberToString((value /= 1e3), 0) + " Mbps"
      : numberToString(parseInt(value)) + " Kbps";
  }
  function getMediaInfoHtml(item, options) {
    var html = "",
      miscInfo = [],
      itemType = ((options = options || {}), item.Type),
      showFolderRuntime =
        "MusicAlbum" === itemType || "MusicArtist" === itemType || "Playlist" === itemType || "MusicGenre" === itemType;
    if (("Episode" === itemType || "Photo" === item.MediaType) && !1 !== options.originalAirDate && item.PremiereDate)
      try {
        (date = new Date(Date.parse(item.PremiereDate))),
          (text = _datetime.default.toLocaleDateString(date)),
          miscInfo.push(text);
      } catch (e) {
        console.log("Error parsing date: " + item.PremiereDate);
      }
    if (
      ("SeriesTimer" === itemType &&
        (item.RecordAnyTime
          ? miscInfo.push(_globalize.default.translate("Anytime"))
          : item.StartDate && miscInfo.push(_datetime.default.getDisplayTime(item.StartDate)),
        item.RecordAnyChannel || null == (_item$ChannelIds = item.ChannelIds) || !_item$ChannelIds.length
          ? miscInfo.push(_globalize.default.translate("AllChannels"))
          : miscInfo.push(item.ChannelName || _globalize.default.translate("OneChannel"))),
      item.StartDate && "Program" !== itemType && "SeriesTimer" !== itemType && "Timer" !== itemType)
    )
      try {
        (date = new Date(Date.parse(item.StartDate))),
          (text = _datetime.default.toLocaleDateString(date)),
          miscInfo.push(text),
          "Recording" !== itemType && ((text = _datetime.default.getDisplayTime(date)), miscInfo.push(text));
      } catch (e) {
        console.log("Error parsing date: " + item.StartDate);
      }
    if (!1 !== options.year && item.ProductionYear && "Series" === itemType)
      if ("Continuing" === item.Status)
        miscInfo.push(_globalize.default.translate("SeriesYearToPresent", item.ProductionYear));
      else if (item.ProductionYear) {
        if (((text = item.ProductionYear), item.EndDate))
          try {
            var endYear = new Date(Date.parse(item.EndDate)).getFullYear();
            endYear !== item.ProductionYear && (text += " &ndash; " + endYear);
          } catch (e) {
            console.log("Error parsing date: " + item.EndDate);
          }
        miscInfo.push(text);
      }
    if (
      ("Series" === itemType &&
        ((_item$ChannelIds = ""),
        item.Studios &&
          item.Studios.length &&
          ((endYear = item.Studios[0]),
          _item$ChannelIds && (_item$ChannelIds += " on "),
          (_item$ChannelIds +=
            '<a class="button-link button-link-color-inherit" is="emby-linkbutton" href=".' +
            _approuter.default.getRouteUrl({
              Name: endYear.Name,
              Type: "Studio",
              ServerId: item.ServerId,
              Id: endYear.Id,
            }) +
            '">' +
            endYear.Name +
            "</a>")),
        _item$ChannelIds && miscInfo.push(_item$ChannelIds)),
      !1 !== options.programIndicator &&
        (item.IsLive
          ? miscInfo.push({
              html:
                '<div class="mediaInfoProgramAttribute mediaInfoItem liveTvProgram">' +
                _globalize.default.translate("Live") +
                "</div>",
            })
          : item.IsPremiere
          ? miscInfo.push({
              html:
                '<div class="mediaInfoProgramAttribute mediaInfoItem premiereTvProgram">' +
                _globalize.default.translate("Premiere") +
                "</div>",
            })
          : item.IsNew
          ? miscInfo.push({
              html:
                '<div class="mediaInfoProgramAttribute mediaInfoItem newTvProgram">' +
                _globalize.default.translate("AttributeNew") +
                "</div>",
            })
          : item.IsRepeat &&
            miscInfo.push({
              html:
                '<div class="mediaInfoProgramAttribute mediaInfoItem repeatTvProgram secondaryText">' +
                _globalize.default.translate("Repeat") +
                "</div>",
            })),
      "Program" === itemType)
    )
      if ((item.IsSeries || item.EpisodeTitle) && !1 !== options.episodeTitle)
        (text = _itemhelper.default.getDisplayName(item, {includeIndexNumber: options.episodeTitleIndexNumber})) &&
          miscInfo.push(text);
      else if (item.IsMovie && item.ProductionYear && !1 !== options.originalAirDate)
        miscInfo.push(item.ProductionYear);
      else if (item.PremiereDate && !1 !== options.originalAirDate)
        try {
          (date = new Date(Date.parse(item.PremiereDate))),
            (text = _globalize.default.translate("OriginalAirDateValue", _datetime.default.toLocaleDateString(date))),
            miscInfo.push(text);
        } catch (e) {
          console.log("Error parsing date: " + item.PremiereDate);
        }
      else item.ProductionYear && miscInfo.push(item.ProductionYear);
    if (
      !1 !== options.year &&
      "Series" !== itemType &&
      "Episode" !== itemType &&
      "Person" !== itemType &&
      "Photo" !== item.MediaType &&
      "Program" !== itemType &&
      "Season" !== itemType
    )
      if (item.ProductionYear) miscInfo.push(item.ProductionYear);
      else if (item.PremiereDate)
        try {
          (text = new Date(Date.parse(item.PremiereDate)).getFullYear()), miscInfo.push(text);
        } catch (e) {
          console.log("Error parsing date: " + item.PremiereDate);
        }
    item.RunTimeTicks &&
      "Series" !== itemType &&
      "Program" !== itemType &&
      !showFolderRuntime &&
      !1 !== options.runtime &&
      ("Audio" === itemType
        ? miscInfo.push(_datetime.default.getDisplayRunningTime(item.RunTimeTicks))
        : miscInfo.push(_datetime.default.getHumanReadableRuntime(item.RunTimeTicks))),
      item.OfficialRating &&
        miscInfo.push({
          html: '<div class="mediaInfoItem mediaInfoItem-parentalRating">' + item.OfficialRating + "</div>",
        }),
      showFolderRuntime &&
        ((endYear = item.SongCount || item.ChildCount) &&
          (1 === endYear
            ? miscInfo.push(_globalize.default.translate("OneTrack"))
            : miscInfo.push(_globalize.default.translate("TrackCount", endYear))),
        item.RunTimeTicks &&
          "Playlist" === itemType &&
          miscInfo.push(_datetime.default.getHumanReadableRuntime(item.RunTimeTicks))),
      "Series" === itemType &&
        item.ChildCount &&
        (1 === item.ChildCount
          ? miscInfo.push(_globalize.default.translate("OneSeason"))
          : miscInfo.push(_globalize.default.translate("NumberSeasonsValue", item.ChildCount))),
      item.Video3DFormat && miscInfo.push("3D"),
      "Photo" === item.MediaType && item.Width && item.Height && miscInfo.push(item.Width + "x" + item.Height),
      options.container && item.Container && miscInfo.push(item.Container.toUpperCase());
    var date,
      text,
      _item$ChannelIds = item.Bitrate || item.BitRate;
    return (
      options.bitrate && _item$ChannelIds && miscInfo.push(bitrateToString(_item$ChannelIds)),
      !1 !== options.CommunityRating && item.CommunityRating && (html += getStarIconsHtml(item)),
      item.CriticRating && !1 !== options.criticRating && (html += getCriticRating(item)),
      (html += miscInfo.map(getMediaInfoItem).join("")),
      item.HasSubtitles &&
        !1 !== options.subtitles &&
        (html += '<div class="mediaInfoItem mediaInfoText closedCaptionMediaInfoText">CC</div>'),
      !1 !== options.endsAt && (date = getEndsAt(item)) && (html += getMediaInfoItem(date, "endsAt")),
      options.dateAdded &&
        _itemhelper.default.enableDateAddedDisplay(item) &&
        ((text = new Date(Date.parse(item.DateCreated))),
        (html += getMediaInfoItem(
          _globalize.default.translate("AddedOnValue", _datetime.default.toLocaleDateString(text))
        ))),
      options.genres &&
        (html += (function (item, options) {
          var type,
            context = options.context,
            options = (item.GenreItems || []).slice(0),
            itemType = item.Type;
          switch (
            (("Playlist" !== itemType && "BoxSet" !== itemType && "MusicArtist" !== itemType) ||
              (50 < options.length && (options.length = 50)),
            context)
          ) {
            case "games":
              type = "GameGenre";
              break;
            case "music":
              type = "MusicGenre";
              break;
            default:
              type = "Genre";
          }
          return (itemType =
            (itemType = options
              .map(function (p) {
                return (
                  '<a class="button-link button-link-color-inherit" is="emby-linkbutton" style="font-weight:inherit;" href=".' +
                  _approuter.default.getRouteUrl(
                    {Name: p.Name, Type: type, ServerId: item.ServerId, Id: p.Id},
                    {context: context}
                  ) +
                  '">' +
                  _textencoding.default.htmlEncode(p.Name) +
                  "</a>"
                );
              })
              .join(" ")) && '<div class="mediaInfoItem" style="white-space:normal;">' + itemType + "</div>");
        })(item, options)),
      (html += _indicators.default.getMissingIndicator(item))
    );
  }
  function getEndsAt(item) {
    var positionTicks;
    if ("Video" === item.MediaType && item.RunTimeTicks && !item.StartDate && "Program" !== item.Type)
      return (
        (positionTicks = (item.UserData && item.UserData.PlaybackPositionTicks) || 0),
        getEndsAtFromPosition(item.RunTimeTicks, positionTicks)
      );
    return null;
  }
  function getEndsAtFromPosition(runtimeTicks, positionTicks, includeText) {
    (runtimeTicks = Date.now() + (runtimeTicks - (positionTicks || 0)) / 1e4),
      (runtimeTicks = new Date(runtimeTicks)),
      (positionTicks = _datetime.default.getDisplayTime(runtimeTicks));
    return !1 === includeText ? positionTicks : _globalize.default.translate("EndsAtValue", positionTicks);
  }
  function getMediaInfoItem(m, cssClass) {
    cssClass = "string" == typeof cssClass ? cssClass + " mediaInfoItem" : "mediaInfoItem";
    var mediaInfoText = m;
    if ("string" != typeof m && "number" != typeof m) {
      if (m.html) return m.html;
      (mediaInfoText = m.text), (cssClass += " " + m.cssClass);
    }
    return '<div class="' + cssClass + '">' + mediaInfoText + "</div>";
  }
  function getCriticRating(item, options) {
    var outerClass = "mediaInfoItem mediaInfoCriticRating";
    return (
      options && options.outerClass && (outerClass += " " + options.outerClass),
      '<div class="' +
        outerClass +
        '"><div class="mediaInfoCriticRatingImage ' +
        (60 <= item.CriticRating ? "mediaInfoCriticRatingFresh" : "mediaInfoCriticRatingRotten") +
        '"></div>' +
        item.CriticRating +
        "%</div>"
    );
  }
  function getStarIconsHtml(item, options) {
    var outerClass,
      html = "",
      item = item.CommunityRating;
    return (
      item &&
        ((outerClass = "starRatingContainer mediaInfoItem"),
        options && options.outerClass && (outerClass += " " + options.outerClass),
        (html =
          (html = html + '<div class="' + outerClass + '"><i class="md-icon starIcon">&#xE838;</i>') +
          numberToString(item, 1) +
          "</div>")),
      html
    );
  }
  function fillPrimaryMediaInfo(elem, item, options) {
    var html = getPrimaryMediaInfoHtml(item, options);
    (elem.innerHTML = html) ? elem.classList.remove("hide") : elem.classList.add("hide"),
      afterFill(elem, item, options);
  }
  function afterFill(elem, item, options) {
    !1 !== options.endsAt &&
      (options = elem.querySelector(".endsAt")) &&
      (function (elem, item) {
        var interval = setInterval(function () {
          document.body.contains(elem) ? (elem.innerHTML = getEndsAt(item)) : clearInterval(interval);
        }, 6e4);
      })(options, item);
  }
  function getPrimaryMediaInfoHtml(item, options) {
    return null == (options = options || {}).interactive && (options.interactive = !1), getMediaInfoHtml(item, options);
  }
  function getSecondaryMediaInfoHtml(item, options) {
    null == (options = options || {}).interactive && (options.interactive = !1);
    var itemType = item.Type;
    return "Program" === itemType || "Timer" === itemType || "Recording" === itemType
      ? getProgramInfoHtml(item, options)
      : "";
  }
  function createAttribute(label, value, className) {
    return (
      '<div class="' +
      (className = (className = className ? className + " " : "") + " flex" + " mediaStreamAttribute") +
      '"><span class="mediaInfoAttributeLabel">' +
      label +
      '</span><span class="mediaInfoAttributeValue">' +
      value +
      "</span></div>"
    );
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["material-icons", "css!modules/mediainfo/mediainfo.css", "programStyles"]),
    (_exports.default = {
      getMediaInfoHtml: getPrimaryMediaInfoHtml,
      fill: fillPrimaryMediaInfo,
      getEndsAt: getEndsAt,
      getEndsAtFromPosition: getEndsAtFromPosition,
      getPrimaryMediaInfoHtml: getPrimaryMediaInfoHtml,
      getSecondaryMediaInfoHtml: getSecondaryMediaInfoHtml,
      fillPrimaryMediaInfo: fillPrimaryMediaInfo,
      fillSecondaryMediaInfo: function (elem, item, options) {
        var html = getSecondaryMediaInfoHtml(item, options);
        (elem.innerHTML = html) ? elem.classList.remove("hide") : elem.classList.add("hide"),
          afterFill(elem, item, options);
      },
      getResolutionText: function (item) {
        if ("Video" !== item.MediaType) return item.Width && item.Height ? item.Width + "x" + item.Height : null;
        var width = item.Width,
          height = item.Height;
        if (width && height) {
          if (3800 <= width || 2e3 <= height) return "4K";
          if (2500 <= width || 1400 <= height) return item.IsInterlaced ? "1440i" : "1440p";
          if (1800 <= width || 1e3 <= height) return item.IsInterlaced ? "1080i" : "1080p";
          if (1200 <= width || 700 <= height) return item.IsInterlaced ? "720i" : "720p";
          if (700 <= width || 400 <= height) return item.IsInterlaced ? "480i" : "480p";
        }
        return null;
      },
      pushMediaStreamLines: function (stream, options, lines, icon) {
        var streamType = stream.StreamType,
          streamTypeLocalizationKey = "EmbeddedImage" === streamType ? "Image" : streamType,
          streamTypeLocalizationKey =
            ("Lyrics" === stream.SubtitleType && (streamTypeLocalizationKey = "Lyrics"),
            _globalize.default.translate(streamTypeLocalizationKey));
        lines.push(
          '<h3 style="margin: .6em 0 .8em;" class="flex align-items-center">' +
            (streamTypeLocalizationKey = icon
              ? '<i class="md-icon autortl mediaStreamTypeIcon">' + icon + "</i>" + streamTypeLocalizationKey
              : streamTypeLocalizationKey) +
            "</h3>"
        ),
          stream.DisplayTitle &&
            lines.push(createAttribute(_globalize.default.translate("Title"), stream.DisplayTitle)),
          stream.Title &&
            stream.Title !== stream.DisplayTitle &&
            lines.push(createAttribute(_globalize.default.translate("HeaderEmbeddedTitle"), stream.Title)),
          (stream.DisplayLanguage || stream.Language) &&
            "Video" !== streamType &&
            lines.push(
              createAttribute(_globalize.default.translate("语言种类"), stream.DisplayLanguage || stream.Language)
            ),
          stream.Codec &&
            lines.push(createAttribute(_globalize.default.translate("Codec"), stream.Codec.toUpperCase())),
          stream.CodecTag &&
            lines.push(createAttribute(_globalize.default.translate("HeaderCodecTag"), stream.CodecTag)),
          stream.Profile && lines.push(createAttribute(_globalize.default.translate("编码规格"), stream.Profile)),
          stream.Level && lines.push(createAttribute(_globalize.default.translate("编码级别"), stream.Level)),
          (stream.Width || stream.Height) &&
            lines.push(createAttribute(_globalize.default.translate("源分辨率"), stream.Width + "x" + stream.Height)),
          stream.AspectRatio &&
            "mjpeg" !== stream.Codec &&
            lines.push(createAttribute(_globalize.default.translate("HeaderAspectRatio"), stream.AspectRatio)),
          "Video" === streamType &&
            lines.push(
              createAttribute(
                _globalize.default.translate("Interlaced"),
                stream.IsInterlaced ? _globalize.default.translate("Yes") : _globalize.default.translate("No")
              )
            ),
          (stream.AverageFrameRate || stream.RealFrameRate) &&
            lines.push(
              createAttribute(
                _globalize.default.translate("帧速率　"),
                numberToString(stream.AverageFrameRate || stream.RealFrameRate, 3)
              )
            ),
          stream.ChannelLayout &&
            lines.push(createAttribute(_globalize.default.translate("音效布局"), stream.ChannelLayout)),
          stream.Channels &&
            lines.push(createAttribute(_globalize.default.translate("音频声道"), stream.Channels + " ch")),
          stream.BitRate &&
            "mjpeg" !== stream.Codec &&
            lines.push(createAttribute(_globalize.default.translate("比特率　"), bitrateToString(stream.BitRate))),
          stream.SampleRate &&
            lines.push(
              createAttribute(_globalize.default.translate("采样率　"), numberToString(stream.SampleRate) + " Hz")
            ),
          stream.VideoRange &&
            "SDR" !== stream.VideoRange &&
            lines.push(createAttribute(_globalize.default.translate("HeaderVideoRange"), stream.VideoRange)),
          stream.ColorPrimaries &&
            lines.push(createAttribute(_globalize.default.translate("HeaderColorPrimaries"), stream.ColorPrimaries)),
          stream.ColorSpace &&
            lines.push(createAttribute(_globalize.default.translate("HeaderColorSpace"), stream.ColorSpace)),
          stream.ColorTransfer &&
            lines.push(createAttribute(_globalize.default.translate("HeaderColorTransfer"), stream.ColorTransfer)),
          stream.BitDepth &&
            lines.push(createAttribute(_globalize.default.translate("HeaderBitDepth"), stream.BitDepth + " Bit")),
          stream.PixelFormat &&
            lines.push(createAttribute(_globalize.default.translate("HeaderPixelFormat"), stream.PixelFormat)),
          stream.RefFrames &&
            lines.push(createAttribute(_globalize.default.translate("HeaderReferenceFrames"), stream.RefFrames)),
          stream.Rotation && lines.push(createAttribute(_globalize.default.translate("Rotation"), stream.Rotation)),
          "Video" !== streamType &&
            lines.push(
              createAttribute(
                _globalize.default.translate("Default"),
                stream.IsDefault ? _globalize.default.translate("Yes") : _globalize.default.translate("No")
              )
            ),
          "Subtitle" === streamType &&
            ("Lyrics" !== stream.SubtitleType &&
              lines.push(
                createAttribute(
                  _globalize.default.translate("Forced"),
                  stream.IsForced ? _globalize.default.translate("Yes") : _globalize.default.translate("No")
                )
              ),
            lines.push(
              createAttribute(
                _globalize.default.translate("External"),
                stream.IsExternal ? _globalize.default.translate("Yes") : _globalize.default.translate("No")
              )
            )),
          stream.IsExternal &&
            stream.Path &&
            lines.push(
              createAttribute(
                _globalize.default.translate("File"),
                (function (stream) {
                  return (stream = stream.Path.split("/").join("\\").split("\\"))[stream.length - 1];
                })(stream)
              )
            );
      },
      getCommunityRating: getStarIconsHtml,
      getCriticRating: getCriticRating,
      bitrateToString: bitrateToString,
      sizeToString: function (size) {
        var gb = 1073741824;
        return gb <= size ? numberToString(size / gb, 1) + " GB" : numberToString(size / 1048576, 1) + " MB";
      },
    });
});
