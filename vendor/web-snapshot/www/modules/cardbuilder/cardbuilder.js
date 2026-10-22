define([
  "exports",
  "./../emby-apiclient/connectionmanager.js",
  "./../common/textencoding.js",
  "./../common/globalize.js",
  "./../common/datetime.js",
  "./../common/itemhelper.js",
  "./../common/playback/playbackmanager.js",
  "./../dom.js",
  "./../browser.js",
  "./../focusmanager.js",
  "./../layoutmanager.js",
  "./../skinmanager.js",
  "./../mediainfo/mediainfo.js",
  "./../humanedate/humanedate.js",
  "./../indicators/indicators.js",
  "./../shortcuts.js",
  "./../common/servicelocator.js",
  "./../imageloader/imageloader.js",
  "./../itemcontextmenu.js",
  "./../emby-elements/userdatabuttons/emby-playstatebutton.js",
  "./../emby-elements/userdatabuttons/emby-ratingbutton.js",
  "./../emby-elements/emby-checkbox/emby-checkbox.js",
  "./../emby-elements/emby-button/paper-icon-button-light.js",
], function (
  _exports,
  _connectionmanager,
  _textencoding,
  _globalize,
  _datetime,
  _itemhelper,
  _playbackmanager,
  _dom,
  _browser,
  _focusmanager,
  _layoutmanager,
  _skinmanager,
  _mediainfo,
  _humanedate,
  _indicators,
  _shortcuts,
  _servicelocator,
  _imageloader,
  _itemcontextmenu,
  _embyPlaystatebutton,
  _embyRatingbutton,
  _embyCheckbox,
  _paperIconButtonLight
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["css!modules/cardbuilder/card.css", "programStyles", "embyProgressBarStyle"]);
  var supportsObjectFit =
    CSS.supports("object-fit", "contain") && !_browser.default.iOS && !_browser.default.osx && !_browser.default.edge;
  var enableFocusTransfrom =
      !((_browser = navigator.hardwareConcurrency || 4) < 4) &&
      !(
        (2400 <= (screen.width || screen.availWidth || 0) || 1400 <= (screen.height || screen.availHeight || 0)) &&
        _browser < 6
      ) &&
      !((navigator.deviceMemory || 0) < 2) &&
      !!CSS.supports("transform", "scale(1)") &&
      !!_dom.default.supportsEventListenerOnce() &&
      !!document.documentElement.animate,
    supportsNativeLazyLoading = "loading" in HTMLImageElement.prototype;
  function getCardsHtml(items, options) {
    return buildCardsHtmlInternal((items = 1 === arguments.length ? (options = arguments[0]).items : items), options);
  }
  var cachedWidths = {};
  function setListOptions(items, options) {
    null == options.isBoundListItem && (options.isBoundListItem = !0),
      (options.itemSelector = ".card"),
      (options.imageFallback = !1 !== options.imageFallback);
    for (
      var shape = options.shape || "auto",
        fieldMap =
          (options.sideFooter && (options.textLinks = !(shape = "banner")),
          options.fields || (options.fields = []),
          {}),
        i = 0,
        length = options.fields.length;
      i < length;
      i++
    )
      fieldMap[options.fields[i]] = !0;
    options.showParentTitle && (fieldMap.ParentName = !0),
      (options.fieldMap = fieldMap),
      (options.fieldMapWithForceName = Object.assign(Object.assign({}, fieldMap), {ParentNameOrName: !0}));
    var tagName,
      templateLines = (function (options) {
        var fieldMap = options.fieldMap,
          lines = [];
        return (
          fieldMap.Name && lines.push(""),
          fieldMap.ParentNameOrName && lines.push(""),
          (fieldMap.ProductionYear || fieldMap.OfficialRating) && lines.push(""),
          (fieldMap.CommunityRating || fieldMap.CriticRating) &&
            lines.push(
              '<div class="mediaInfoItems cardMediaInfoItems"><div class="mediaInfoItem mediaInfoCriticRating cardMediaInfoItem"><div class="mediaInfoCriticRatingImage mediaInfoCriticRatingFresh"></div>91%</div></div>'
            ),
          fieldMap.PersonRole && lines.push(""),
          fieldMap.DateModified && lines.push(""),
          fieldMap.ChapterTime && lines.push(""),
          fieldMap.ChannelName && lines.push(""),
          fieldMap.LastServerAddress && lines.push(""),
          fieldMap.Overview && lines.push(""),
          fieldMap.Album && lines.push(""),
          fieldMap.Type && lines.push(""),
          fieldMap.UserLastSeen && lines.push(""),
          fieldMap.Version && lines.push(""),
          fieldMap.Url && lines.push(""),
          fieldMap.InstalledVersion && lines.push(""),
          fieldMap.ItemImageName && lines.push(""),
          fieldMap.Filename && lines.push(""),
          fieldMap.FilenameOrName && lines.push(""),
          (fieldMap.Resolution || fieldMap.Container) && lines.push(""),
          fieldMap.ParentName && lines.push(""),
          fieldMap.CollectionType && lines.push(""),
          fieldMap.LibraryFolders && lines.push(""),
          fieldMap.DeviceAppInfo && lines.push(""),
          fieldMap.DeviceUserInfo && lines.push(""),
          fieldMap.CurrentProgramTime && lines.push(""),
          fieldMap.CurrentProgramParentName && lines.push(""),
          fieldMap.CurrentProgramName && lines.push(""),
          fieldMap.SeriesTimerChannel && lines.push(""),
          fieldMap.SeriesTimerTime && lines.push(""),
          fieldMap.ImageEditorStandardButtons && lines.push(""),
          fieldMap.ImageEditorBackdropButtons && lines.push(""),
          fieldMap.Runtime && lines.push(""),
          fieldMap.SessionNowPlayingInfo && (lines.push(""), lines.push(""), lines.push("")),
          options.showAirTime && lines.push(""),
          fieldMap.DownloadableImageInfo && (lines.push(""), lines.push("")),
          lines
        );
      })(options),
      items =
        (options.lines || options.overlayText || (options.lines = templateLines.length),
        (shape = "auto" !== shape && "autooverflow" !== shape ? shape : _imageloader.default.getShape(items, options))),
      className =
        (options.sideFooter && (items = "square"),
        "auto" === options.preferThumb && (options.preferThumb = "backdrop" === items),
        (options.uiAspect = _imageloader.default.getAspectFromShape(items, options).aspect),
        !options.width && options.widths && (options.width = options.widths[items]),
        options.rows && "number" != typeof options.rows && (options.rows = options.rows[items]),
        "card"),
      isLayoutTv =
        (shape && (className += " " + shape + "Card"),
        options.horizontal
          ? (className += " card-horiz " + shape + "Card-horiz")
          : shape && (className += " " + shape + "Card"),
        options.cardClass && (className += " " + options.cardClass),
        _layoutmanager.default.tv),
      isSingleClickElement =
        (isLayoutTv || (className += " card-hoverable"),
        (isLayoutTv && !options.staticElement) || (!1 === options.hoverMenu && "none" !== options.action)),
      lineContents =
        (enableFocusTransfrom && isLayoutTv && (className += " card-focustransform"),
        options.smallSideFooter &&
          ((className += " smallBannerCard"), options.horizontal && (className += " smallBannerCard-horiz")),
        isSingleClickElement
          ? ((tagName = "button"), (className += " itemAction"))
          : ((tagName = "div"), options.staticElement || ((className += " focusable"), (options.addTabIndex = !0))),
        _layoutmanager.default.tv
          ? ((options.draggable = !1),
            (options.draggableSubItems = !1),
            (options.dropTarget = !1),
            (options.dragReorder = !1))
          : ((options.draggable = !1 !== options.draggable),
            (options.draggableSubItems = options.draggable && !1 !== options.draggableSubItems),
            options.dragReorder && options.draggable
              ? (className += " drop-target ordered-drop-target-x")
              : options.dropTarget && (className += " drop-target full-drop-target")),
        []);
    for (options.lines && (lineContents.length = options.lines), i = 0, length = lineContents.length; i < length; i++)
      lineContents[i] = templateLines[i] || "&nbsp;";
    var cardTextCssClass = options.centerText ? "cardText cardTextCentered" : "cardText",
      cardTextCssClass = lineContents.length
        ? getCardTextLines(lineContents, cardTextCssClass, !options.overlayText, !0, lineContents.length, options)
        : "",
      cardDefaultTextClass = ((options.cardDefaultTextClass || "") + " cardText cardDefaultText").trim(),
      cardDefaultTextClass =
        ((options.cardDefaultTextClass = cardDefaultTextClass), ((options.cardBoxClass || "") + " cardBox").trim()),
      cardPadderClass =
        ((options.cardLayout || options.sideFooter) &&
          ((cardDefaultTextClass += " visualCardBox"),
          options.vibrant &&
            ((cardDefaultTextClass += " visualCardBox-vibrant"),
            "large" === options.vibrantMode && (cardDefaultTextClass += " visualCardBox-vibrant-lg"))),
        options.sideFooter &&
          ((cardDefaultTextClass += " cardBox-sideFooter"),
          _layoutmanager.default.tv && (cardDefaultTextClass += " cardBox-sideFooter-f"),
          (options.centerText = !1)),
        isLayoutTv &&
          (enableFocusTransfrom &&
            ((cardDefaultTextClass += " cardBox-focustransform"),
            !options.focusTransformTitleAdjust ||
              ("portrait" !== shape && "square" !== shape && "fourThree" !== shape) ||
              (cardDefaultTextClass += " cardBox-focustransform-titleadjust")),
          (options.cardLayout || options.sideFooter) && (cardDefaultTextClass += " card-focuscontent")),
        isSingleClickElement ||
          !1 === options.moreButton ||
          options.staticElement ||
          (cardDefaultTextClass += " cardBox-touchzoom"),
        !lineContents.length ||
          options.overlayText ||
          options.cardLayout ||
          options.sideFooter ||
          !1 === options.allowBottomPadding ||
          (cardDefaultTextClass += " cardBox-bottompadded"),
        []),
      innerCardFooterClass =
        (options.sideFooter || cardPadderClass.push("cardPadder-" + shape),
        options.cardPadderClass && cardPadderClass.push(options.cardPadderClass),
        ["innerCardFooter"]),
      cardScalableClass =
        (options.innerCardFooterClass && innerCardFooterClass.push(options.innerCardFooterClass), "cardScalable"),
      cardContentClass =
        ((options.round = options.round && "square" === shape),
        isSingleClickElement &&
          !options.cardLayout &&
          ((cardScalableClass += " card-focuscontent"),
          options.round && (cardScalableClass += " cardFocusContent-round")),
        ((options.cardContentClass || "") + " cardContent cardImageContainer").trim()),
      screen =
        (options.cardLayout ||
          options.sideFooter ||
          ((cardContentClass += " cardContent-shadow"),
          "black" === options.background && (cardContentClass += " cardContent-bg-black")),
        options.paddedImage && (cardContentClass += " paddedImage"),
        options.defaultBackground && (cardContentClass += " defaultCardBackground defaultCardBackground0"),
        options.imageClass && (cardContentClass += " " + options.imageClass),
        options.sideFooter &&
          ((cardContentClass += " cardImageContainer-sideFooter"),
          options.smallSideFooter && (cardContentClass += " cardImageContainer-smallSideFooter")),
        options.round && (cardContentClass += " cardContent-round"),
        (enableFocusTransfrom && isLayoutTv) ||
          options.sideFooter ||
          (isSingleClickElement || options.action,
          isLayoutTv
            ? options.cardLayout
              ? (cardDefaultTextClass += " cardContent-bxsborder")
              : (cardContentClass += " cardContent-bxsborder")
            : (cardContentClass += " cardContent-bxsborder-fv")),
        options.width ||
          ((isLayoutTv = _dom.default.getWindowSize().innerWidth),
          (options.width = (function (cardClass, cardBoxClass, cardContentClass, options, screenWidth) {
            options.sideFooter && (cardClass += " withsidefooter"),
              options.imageWidthTestClass && (cardClass += " " + options.imageWidthTestClass);
            var div,
              width = cachedWidths[(screenWidth = cardClass + screenWidth)];
            return (
              width ||
                (console.log("getImageWidth: " + screenWidth),
                ((div = document.createElement("div")).className = "itemsContainer padded-left padded-right"),
                _layoutmanager.default.tv && div.classList.add("itemsContainer-tv"),
                (div.style.visibility = "hidden"),
                options.sideFooter
                  ? (div.innerHTML =
                      '<div class="' +
                      cardClass +
                      '"><div class="' +
                      cardBoxClass +
                      '"><div class="' +
                      cardContentClass +
                      '"></div></div></div>')
                  : (div.innerHTML =
                      '<div class="' + cardClass + '"><div class="' + cardBoxClass + ' cardScalable"></div></div>'),
                (cardContentClass = document.body).appendChild(div),
                (width = options.sideFooter
                  ? (cachedWidths[screenWidth] = div.querySelector(".cardImageContainer").offsetWidth || 400)
                  : (cachedWidths[screenWidth] = div.querySelector(".cardScalable").offsetWidth || 400)),
                cardContentClass.removeChild(div),
                console.log("width: " + width)),
              width
            );
          })(className, cardDefaultTextClass, cardContentClass, options, isLayoutTv)),
          (isLayoutTv = isLayoutTv),
          (screen = window.screen) &&
            20 < screen.availWidth - isLayoutTv &&
            (options.width = 50 * Math.ceil(options.width / 50))),
        '<div class="' + cardDefaultTextClass + '">'),
      cardPadderClass = cardPadderClass.join(" "),
      innerCardFooterClass = innerCardFooterClass.join(" "),
      isLayoutTv =
        (isSingleClickElement || "none" === options.action
          ? (screen += '<div class="' + cardContentClass + " " + cardScalableClass + " " + cardPadderClass + '"></div>')
          : (screen +=
              '<button type="button" tabindex="-1" class="cardContent-button ' +
              cardContentClass +
              " " +
              cardScalableClass +
              " " +
              cardPadderClass +
              '"></button>'),
        "cardFooter"),
      isLayoutTv =
        (options.vibrant && (isLayoutTv += " cardFooter-vibrant"),
        (options.outerFooterClass = isLayoutTv),
        options.cardLayout && (screen += '<div class="' + isLayoutTv + '">'),
        (screen += cardTextCssClass + "</div>"),
        options.cardLayout && (screen += "</div>"),
        null == options.defaultIcon &&
          (options.sideFooter || options.lines || fieldMap.Name
            ? (options.defaultIcon = !0)
            : (options.defaultIcon = !1)),
        (options.moreTitle = _globalize.default.translate("More")),
        (options.multiSelectTitle = _globalize.default.translate("MultiSelect")),
        (options.multiSelect = !1 !== options.multiSelect && !_layoutmanager.default.tv),
        (options.contextMenu = !1 !== options.contextMenu),
        (options.enableUserData = !1 !== options.enableUserData),
        "");
    options.addTabIndex && (isLayoutTv += ' tabindex="0"'),
      options.draggable && (isLayoutTv += ' draggable="true"'),
      (options.fixedAttributes = isLayoutTv.trim()),
      (options.templateInnerHTML = screen),
      (options.cardPadderClass = cardPadderClass),
      (options.innerCardFooterClass = innerCardFooterClass),
      (options.cardScalableClass = cardScalableClass),
      (options.tagName = tagName),
      (options.shape = shape),
      (options.imageShape = items),
      (options.className = className),
      (options.isSingleClickElement = isSingleClickElement),
      (options.cardContentClass = cardContentClass),
      (options.cardBoxClass = cardDefaultTextClass);
  }
  function buildCardsHtmlInternal(items, options) {
    setListOptions(items, options);
    for (var hasOpenRow, html = "", itemsInRow = 0, rows = options.rows, i = 0, length = items.length; i < length; i++)
      rows &&
        0 === itemsInRow &&
        (hasOpenRow && ((html += "</div>"), (hasOpenRow = !1)),
        (html += '<div class="cardColumn">'),
        (hasOpenRow = !0)),
        (html += getCardHtml(items[i], i, options)),
        itemsInRow++,
        rows && rows <= itemsInRow && ((html += "</div>"), (hasOpenRow = !1), (itemsInRow = 0));
    return hasOpenRow && (html += "</div>"), html;
  }
  function getImageUrl(item, apiClient, options, shape) {
    var imgUrl,
      width = options.width,
      adjustForPixelRatio = options.adjustForPixelRatio;
    if (item.ImageUrl)
      return (
        (imgUrl = item.ImageUrl),
        options.addImageSizeToUrl && options.width && (imgUrl += "&maxWidth=" + width),
        {imgUrl: imgUrl, aspect: item.PrimaryImageAspectRatio}
      );
    var imageAspect,
      height = null,
      primaryImageAspectRatio = item.PrimaryImageAspectRatio,
      forceName = !1,
      imageTags = item.ImageTags,
      uiAspect = options.uiAspect;
    return (
      options.preferThumb && imageTags && imageTags.Thumb
        ? ((imgUrl = apiClient.getImageUrl(item.Id, {
            type: "Thumb",
            maxWidth: width,
            tag: imageTags.Thumb,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : (options.preferBanner || "banner" === shape) && imageTags && imageTags.Banner
        ? ((imgUrl = apiClient.getImageUrl(item.Id, {
            type: "Banner",
            maxWidth: width,
            tag: imageTags.Banner,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 1e3 / 185))
        : options.preferDisc && imageTags && imageTags.Disc
        ? ((imgUrl = apiClient.getImageUrl(item.Id, {
            type: "Disc",
            maxWidth: width,
            tag: imageTags.Disc,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 1))
        : options.preferLogo && imageTags && imageTags.Logo
        ? ((imgUrl = apiClient.getImageUrl(item.Id, {
            type: "Logo",
            maxWidth: width,
            tag: imageTags.Logo,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : options.preferLogo && item.ParentLogoImageTag && item.ParentLogoItemId
        ? ((imgUrl = apiClient.getImageUrl(item.ParentLogoItemId, {
            type: "Logo",
            maxWidth: width,
            tag: item.ParentLogoImageTag,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : options.showChannelLogo && item.ChannelPrimaryImageTag && item.ChannelId
        ? ((imgUrl = apiClient.getImageUrl(item.ChannelId, {
            type: "Primary",
            maxWidth: width,
            tag: item.ChannelPrimaryImageTag,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : options.preferThumb && item.ParentThumbItemId && !1 !== options.inheritThumb && "Photo" !== item.MediaType
        ? ((imgUrl = apiClient.getImageUrl(item.ParentThumbItemId, {
            type: "Thumb",
            maxWidth: width,
            tag: item.ParentThumbImageTag,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : options.preferThumb && item.BackdropImageTags && item.BackdropImageTags.length
        ? ((imgUrl = apiClient.getImageUrl(item.Id, {
            type: "Backdrop",
            maxWidth: width,
            tag: item.BackdropImageTags[0],
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (forceName = !0),
          (imageAspect = 16 / 9))
        : options.preferThumb &&
          item.ParentBackdropImageTags &&
          item.ParentBackdropImageTags.length &&
          !1 !== options.inheritThumb &&
          "Episode" === item.Type
        ? ((imgUrl = apiClient.getImageUrl(item.ParentBackdropItemId, {
            type: "Backdrop",
            maxWidth: width,
            tag: item.ParentBackdropImageTags[0],
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          options.preferThumb && (forceName = !0),
          (imageAspect = 16 / 9))
        : imageTags && imageTags.Primary
        ? ((height = width && uiAspect ? Math.round(width / uiAspect) : null),
          (imgUrl =
            "TvChannel" === item.Type || "ChannelManagementInfo" === item.Type
              ? apiClient.getLogoImageUrl(
                  item,
                  {maxHeight: height, maxWidth: width, blur: options.blur, adjustForPixelRatio: adjustForPixelRatio},
                  _skinmanager.default.getPreferredLogoImageTypes()
                )
              : apiClient.getImageUrl(item.Id, {
                  type: "Primary",
                  maxHeight: height,
                  maxWidth: width,
                  tag: imageTags.Primary,
                  blur: options.blur,
                  adjustForPixelRatio: adjustForPixelRatio,
                })),
          options.preferThumb && (forceName = !0),
          (imageAspect = primaryImageAspectRatio))
        : options.backdropAsSecondary && item.ParentBackdropImageTags && item.ParentBackdropImageTags.length
        ? ((imgUrl = apiClient.getImageUrl(item.ParentBackdropItemId, {
            type: "Backdrop",
            maxWidth: width,
            tag: item.ParentBackdropImageTags[0],
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          options.preferBackdrop && (forceName = !0),
          (imageAspect = 16 / 9))
        : item.ImageTag && "Plugin" === item.Type
        ? ((imgUrl = apiClient.getUrl("Plugins/" + item.Id + "/Thumb", {
            maxHeight: height,
            maxWidth: width,
            tag: item.ImageTag,
          })),
          (imageAspect = 16 / 9))
        : item.ImageTag && null != item.ChapterIndex
        ? ((imgUrl = apiClient.getImageUrl(item.Id, {
            maxWidth: width,
            tag: item.ImageTag,
            type: "Chapter",
            index: item.ChapterIndex,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = primaryImageAspectRatio))
        : item.PrimaryImageTag
        ? ((height = width && uiAspect ? Math.round(width / uiAspect) : null),
          "User" === item.Type
            ? (imgUrl = apiClient.getUserImageUrl(item.Id, {
                maxHeight: height,
                maxWidth: width,
                tag: item.PrimaryImageTag,
                type: "Primary",
                adjustForPixelRatio: adjustForPixelRatio,
              }))
            : ((imgUrl = apiClient.getImageUrl(item.PrimaryImageItemId || item.Id || item.ItemId, {
                type: "Primary",
                maxHeight: height,
                maxWidth: width,
                tag: item.PrimaryImageTag,
                adjustForPixelRatio: adjustForPixelRatio,
              })),
              options.preferThumb && (forceName = !0)),
          (imageAspect = primaryImageAspectRatio))
        : item.AlbumId && item.AlbumPrimaryImageTag
        ? ((height = width && uiAspect ? Math.round(width / uiAspect) : null),
          (imgUrl = apiClient.getImageUrl(item.AlbumId, {
            type: "Primary",
            maxHeight: height,
            maxWidth: width,
            tag: item.AlbumPrimaryImageTag,
            blur: options.blur,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 1))
        : item.ParentThumbItemId &&
          !1 !== options.inheritThumb &&
          uiAspect &&
          1.4 <= uiAspect &&
          "Photo" !== item.MediaType
        ? ((imgUrl = apiClient.getImageUrl(item.ParentThumbItemId, {
            type: "Thumb",
            maxWidth: width,
            tag: item.ParentThumbImageTag,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : item.ParentPrimaryImageTag
        ? ((imgUrl = apiClient.getImageUrl(item.ParentPrimaryImageItemId, {
            type: "Primary",
            maxWidth: width,
            tag: item.ParentPrimaryImageTag,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = "Episode" === item.Type ? 2 / 3 : 1))
        : item.ChannelPrimaryImageTag && item.ChannelId
        ? ((imgUrl = apiClient.getImageUrl(item.ChannelId, {
            type: "Primary",
            maxWidth: width,
            tag: item.ChannelPrimaryImageTag,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : item.SeriesPrimaryImageTag
        ? ((imgUrl = apiClient.getImageUrl(item.SeriesId, {
            type: "Primary",
            maxWidth: width,
            tag: item.SeriesPrimaryImageTag,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 2 / 3))
        : "Season" === item.Type && imageTags && imageTags.Thumb
        ? ((imgUrl = apiClient.getImageUrl(item.Id, {
            type: "Thumb",
            maxWidth: width,
            tag: imageTags.Thumb,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : item.BackdropImageTags && item.BackdropImageTags.length
        ? ((imgUrl = apiClient.getImageUrl(item.Id, {
            type: "Backdrop",
            maxWidth: width,
            tag: item.BackdropImageTags[0],
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : imageTags && imageTags.Thumb
        ? ((imgUrl = apiClient.getImageUrl(item.Id, {
            type: "Thumb",
            maxWidth: width,
            tag: imageTags.Thumb,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : item.ParentThumbItemId && !1 !== options.inheritThumb
        ? ((imgUrl = apiClient.getImageUrl(item.ParentThumbItemId, {
            type: "Thumb",
            maxWidth: width,
            tag: item.ParentThumbImageTag,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : item.ParentBackdropImageTags && item.ParentBackdropImageTags.length && !1 !== options.inheritThumb
        ? ((imgUrl = apiClient.getImageUrl(item.ParentBackdropItemId, {
            type: "Backdrop",
            maxWidth: width,
            tag: item.ParentBackdropImageTags[0],
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 16 / 9))
        : item.PrimaryImageItemId
        ? ((imgUrl = apiClient.getImageUrl(item.PrimaryImageItemId, {
            type: "Primary",
            maxHeight: height,
            maxWidth: width,
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = primaryImageAspectRatio))
        : item.UserPrimaryImageTag &&
          "ActiveSession" !== item.Type &&
          ((imgUrl = apiClient.getUserImageUrl(item.UserId, {
            maxHeight: height,
            maxWidth: width,
            tag: item.UserPrimaryImageTag,
            type: "Primary",
            adjustForPixelRatio: adjustForPixelRatio,
          })),
          (imageAspect = 1)),
      {imgUrl: imgUrl, forceName: forceName, aspect: imageAspect}
    );
  }
  var refreshIndicatorLoaded;
  function getCardTextLines(lines, cssClass, forceLines, isOuterFooter, maxLines, options) {
    for (var html = "", valid = 0, currentCssClass = cssClass, i = 0, length = lines.length; i < length; i++) {
      var currentCssClass = cssClass,
        text = lines[i];
      if (
        (0 < valid && isOuterFooter
          ? (currentCssClass += " cardText-secondary")
          : 0 === valid &&
            isOuterFooter &&
            (options.sideFooter || (currentCssClass += " cardText-first-padded"),
            (currentCssClass += " cardText-first")),
        text &&
          ((html = (html += '<div class="' + currentCssClass + '">') + text + "</div>"),
          valid++,
          maxLines && maxLines <= valid))
      )
        break;
    }
    if (forceLines)
      for (length = maxLines || Math.min(lines.length, maxLines || lines.length); valid < length; )
        (currentCssClass = cssClass),
          0 < valid && isOuterFooter && (currentCssClass += " cardText-secondary"),
          (html += '<div class="' + currentCssClass + '">&nbsp;</div>'),
          valid++;
    return html;
  }
  function isUsingLiveTvNaming(itemType) {
    return "Program" === itemType || "Timer" === itemType || "Recording" === itemType;
  }
  function getAirTimeText(item, showAirDateTime, showAirEndTime) {
    var airTimeText = "";
    if (item.StartDate)
      try {
        var date = new Date(Date.parse(item.StartDate));
        showAirDateTime &&
          (airTimeText +=
            _datetime.default.toLocaleDateString(date, {weekday: "short", month: "short", day: "numeric"}) + " "),
          (airTimeText += _datetime.default.getDisplayTime(date)),
          item.EndDate &&
            showAirEndTime &&
            ((date = new Date(Date.parse(item.EndDate))),
            (airTimeText += " &ndash; " + _datetime.default.getDisplayTime(date)));
      } catch (e) {
        console.log("Error parsing date: " + item.StartDate);
      }
    return airTimeText;
  }
  function getCardFooterText(item, options, fieldMap, imgUrl, footerClass, progressHtml, logoUrl, isOuterFooter) {
    var itemType = item.Type,
      html = "",
      cardTextCssClass =
        (logoUrl &&
          (html +=
            '<div class="lazy cardFooterLogo" loading="lazy" style="background-image:url(' + logoUrl + ');"></div>'),
        options.centerText ? "cardText cardTextCentered" : "cardText"),
      lines = [],
      parentTitleUnderneath =
        "MusicAlbum" === itemType || "Audio" === itemType || "MusicVideo" === itemType || "Game" === itemType,
      serverId = item.ServerId || options.serverId,
      parentTitle =
        (fieldMap.Album &&
          options.albumFirst &&
          (isOuterFooter && item.AlbumId && item.Album
            ? lines.push(
                getTextActionButton(options, {
                  Id: item.AlbumId,
                  ServerId: serverId,
                  Name: item.Album,
                  Type: "MusicAlbum",
                  IsFolder: !0,
                })
              )
            : lines.push(item.Album || "")),
        (!fieldMap.ParentName && !fieldMap.ParentNameOrName) ||
          parentTitleUnderneath ||
          (isOuterFooter && "Episode" === itemType && item.SeriesName
            ? item.SeriesId
              ? lines.push(
                  getTextActionButton(options, {
                    Id: item.SeriesId,
                    ServerId: serverId,
                    Name: item.SeriesName,
                    Type: "Series",
                    IsFolder: !0,
                  })
                )
              : lines.push(_textencoding.default.htmlEncode(item.SeriesName))
            : isUsingLiveTvNaming(itemType)
            ? (lines.push(_textencoding.default.htmlEncode(item.Name)), item.EpisodeTitle || (titleAdded = !0))
            : ((parentTitle =
                item.SeriesName ||
                item.Series ||
                item.Album ||
                (item.AlbumArtist ? item.AlbumArtist.Name || item.AlbumArtist : null) ||
                item.GameSystem ||
                "") ||
                fieldMap.Name) &&
              lines.push(_textencoding.default.htmlEncode(parentTitle))),
        (fieldMap.Name && !titleAdded) || (fieldMap.ParentNameOrName && !lines.length));
    if (
      (!(parentTitle = parentTitle || titleAdded || !fieldMap.Name ? parentTitle : !0) ||
        ((titleAdded = _itemhelper.default.getDisplayName(item, {
          includeParentInfo: options.includeParentInfoInTitle,
          channelNumberFirst: options.channelNumberFirst,
        })) &&
          (isOuterFooter
            ? lines.push(getTextActionButton(options, item, titleAdded, serverId, options.parentId, !0))
            : lines.push(_textencoding.default.htmlEncode(titleAdded)))),
      fieldMap.Type && lines.push(_itemhelper.default.getItemTypeName(item.Type)),
      fieldMap.ParentName &&
        parentTitleUnderneath &&
        (isOuterFooter && item.AlbumArtists && item.AlbumArtists.length && "MusicAlbum" === itemType
          ? ((item.AlbumArtists[0].Type = "MusicArtist"),
            (item.AlbumArtists[0].IsFolder = !0),
            lines.push(getTextActionButton(options, item.AlbumArtists[0], null, serverId)))
          : isOuterFooter && item.ArtistItems && item.ArtistItems.length
          ? ((item.ArtistItems[0].Type = "MusicArtist"),
            (item.ArtistItems[0].IsFolder = !0),
            lines.push(getTextActionButton(options, item.ArtistItems[0], null, serverId)))
          : isOuterFooter && item.AlbumArtists && item.AlbumArtists.length
          ? ((item.AlbumArtists[0].Type = "MusicArtist"),
            (item.AlbumArtists[0].IsFolder = !0),
            lines.push(getTextActionButton(options, item.AlbumArtists[0], null, serverId)))
          : isOuterFooter && item.GameSystem && item.GameSystemId
          ? lines.push(
              getTextActionButton(options, {
                Id: item.GameSystemId,
                ServerId: serverId,
                Name: item.GameSystem,
                Type: "GameSystem",
                IsFolder: !0,
              })
            )
          : lines.push(
              _textencoding.default.htmlEncode(
                isUsingLiveTvNaming(itemType)
                  ? item.Name
                  : item.SeriesName ||
                      item.Series ||
                      item.Album ||
                      (item.AlbumArtist ? item.AlbumArtist.Name || item.AlbumArtist : null) ||
                      item.GameSystem ||
                      ""
              )
            )),
      options.textLines)
    )
      for (var additionalLines = options.textLines(item), i = 0, length = additionalLines.length; i < length; i++)
        lines.push(additionalLines[i]);
    fieldMap.Album &&
      !options.albumFirst &&
      (isOuterFooter && item.AlbumId && item.Album
        ? lines.push(
            getTextActionButton(options, {
              Id: item.AlbumId,
              ServerId: serverId,
              Name: item.Album,
              Type: "MusicAlbum",
              IsFolder: !0,
            })
          )
        : lines.push(item.Album || ""));
    var lineParts,
      parentTitle = fieldMap.CommunityRating,
      titleAdded = fieldMap.CriticRating,
      ContinueView = document.styleSheets[0].addRule(
        ".sections.homeSectionsContainer .innerCardFooter .cardText.cardTextCentered,.detailMainContainer-withitembackdrop .innerCardFooter .cardText,.detailImageContainerCard .innerCardFooter .cardText,.osdRemoteControlImageCardBox .innerCardFooter .cardText",
        "display: none"
      );
      parentTitleUnderneath = [],
      parentTitle =
        ((parentTitle || titleAdded) &&
          ((lineParts = []),
          parentTitle &&
            item.CommunityRating &&
            lineParts.push(_mediainfo.default.getCommunityRating(item, {outerClass: "cardMediaInfoItem"})),
          titleAdded &&
            item.CriticRating &&
            lineParts.push(_mediainfo.default.getCriticRating(item, {outerClass: "cardMediaInfoItem"})),
          (lineParts.length ? lines : (lineParts.push("&nbsp;"), parentTitleUnderneath)).push(
            '<div class="mediaInfoItems cardMediaInfoItems">' + lineParts.join("") + "</div>"
          )),
        fieldMap.ProductionYear),
      parentTitle = fieldMap.OfficialRating;
    return (
      (parentTitleUnderneath || parentTitle) &&
        ((lineParts = []),
        parentTitleUnderneath &&
          ("Series" === itemType
            ? "Continuing" === item.Status
              ? lineParts.push(_globalize.default.translate("SeriesYearToPresent", item.ProductionYear || ""))
              : (titleAdded = item.EndDate ? new Date(Date.parse(item.EndDate)).getFullYear() : null) &&
                item.ProductionYear &&
                titleAdded !== item.ProductionYear
              ? lineParts.push(item.ProductionYear + " &ndash; " + titleAdded)
              : item.ProductionYear && lineParts.push(item.ProductionYear)
            : item.ProductionYear && lineParts.push(item.ProductionYear)),
        parentTitle && item.OfficialRating && lineParts.push(item.OfficialRating),
        lines.push(lineParts.join("&nbsp; "))),
      fieldMap.Runtime &&
        (item.RunTimeTicks ? lines.push(_datetime.default.getHumanReadableRuntime(item.RunTimeTicks)) : lines.push("")),
      options.showAirTime && lines.push(getAirTimeText(item, options.showAirDateTime, options.showAirEndTime) || ""),
      fieldMap.ChannelName &&
        (item.ChannelId
          ? lines.push(
              getTextActionButton(
                options,
                {
                  Id: item.ChannelId,
                  ServerId: serverId,
                  Name: item.ChannelName,
                  Type: "TvChannel",
                  MediaType: item.MediaType,
                  IsFolder: !1,
                },
                item.ChannelName
              )
            )
          : lines.push(item.ChannelName || "&nbsp;")),
      fieldMap.CurrentProgramParentName &&
        (item.CurrentProgram ? lines.push(item.CurrentProgram.Name || "") : lines.push("")),
      fieldMap.CurrentProgramName &&
        (item.CurrentProgram ? lines.push(item.CurrentProgram.EpisodeTitle || "") : lines.push(item.Name || "")),
      fieldMap.CurrentProgramTime &&
        (item.CurrentProgram ? lines.push(getAirTimeText(item.CurrentProgram, !1, !0) || "") : lines.push("")),
      fieldMap.SeriesTimerTime &&
        (item.RecordAnyTime
          ? lines.push(_globalize.default.translate("Anytime"))
          : item.StartDate
          ? lines.push(_datetime.default.getDisplayTime(item.StartDate))
          : lines.push("")),
      fieldMap.SeriesTimerChannel &&
        (item.RecordAnyChannel || null == (parentTitleUnderneath = item.ChannelIds) || !parentTitleUnderneath.length
          ? lines.push(_globalize.default.translate("AllChannels"))
          : lines.push(item.ChannelName || _globalize.default.translate("OneChannel"))),
      fieldMap.PersonRole &&
        (item.Role
          ? lines.push(_globalize.default.translate("ActorAsRole", item.Role))
          : item.PersonType
          ? lines.push(_globalize.default.translate(item.PersonType))
          : lines.push("")),
      fieldMap.ChapterTime && lines.push(_datetime.default.getDisplayRunningTime(item.StartPositionTicks)),
      fieldMap.UserLastSeen &&
        (item.Policy.IsDisabled
          ? lines.push(_globalize.default.translate("Disabled"))
          : lines.push(item.LastActivityDate ? (0, _humanedate.default)(item.LastActivityDate) : "")),
      fieldMap.Url && lines.push(item.Url || ""),
      fieldMap.Version && lines.push(item.Version || ""),
      fieldMap.CollectionType &&
        (item.Id ? lines.push(_itemhelper.default.getContentTypeName(item.CollectionType)) : lines.push("")),
      fieldMap.LibraryFolders &&
        (item.Locations && "boxsets" !== item.CollectionType
          ? 1 === item.Locations.length
            ? lines.push(item.Locations[0])
            : lines.push(_globalize.default.translate("NumLocationsValue", item.Locations.length))
          : lines.push("")),
      fieldMap.DeviceAppInfo && lines.push(item.AppName + " " + item.AppVersion),
      fieldMap.InstalledVersion &&
        (item.InstalledVersion
          ? lines.push(_globalize.default.translate("LabelVersionInstalled", item.InstalledVersion))
          : lines.push("")),
      fieldMap.InstalledVersion && lines.push(item.Version || ""),
      fieldMap.ItemImageName && (item.ImageTag ? lines.push(item.Name) : lines.push("&nbsp;")),
      fieldMap.Filename && lines.push(item.Filename),
      fieldMap.FilenameOrName && lines.push(_textencoding.default.htmlEncode(item.Filename || item.Name || "")),
      fieldMap.Overview && lines.push(_textencoding.default.htmlEncode(item.Overview || "")),
      (fieldMap.Resolution || fieldMap.Container) &&
        ((itemType = []),
        fieldMap.Container && item.Container && itemType.push(item.Container.toUpperCase()),
        fieldMap.Resolution && item.Width && item.Height && itemType.push(_mediainfo.default.getResolutionText(item)),
        lines.push(itemType.join(" ") || "&nbsp;")),
      fieldMap.DownloadableImageInfo &&
        (lines.push(
          (function (item) {
            var text = "",
              lang = item.DisplayLanguage || item.Language;
            return (
              item.Width && item.Height
                ? ((text += item.Width + "x" + item.Height), lang && (text += " - " + lang))
                : lang && (text += lang),
              text
            );
          })(item) || ""
        ),
        lines.push(
          (function (item) {
            var text;
            return (
              "Likes" === item.RatingType
                ? (text =
                    1 === item.CommunityRating
                      ? _globalize.default.translate("OneLike")
                      : _globalize.default.translate("LikeCountValue", item.CommunityRating))
                : item.CommunityRating
                ? ((text = numberToString(item.CommunityRating, 1)),
                  item.VoteCount &&
                    (text +=
                      " - " +
                      (1 === item.VoteCount
                        ? _globalize.default.translate("OneVote")
                        : _globalize.default.translate("VoteCountValue", item.VoteCount))))
                : (text = _globalize.default.translate("Unrated")),
              text
            );
          })(item) || ""
        )),
      fieldMap.DateModified && lines.push(_datetime.default.toLocaleString(new Date(Date.parse(item.DateModified)))),
      fieldMap.DeviceUserInfo &&
        ((titleAdded = ""),
        item.LastUserName &&
          (item.LastUserId
            ? (titleAdded += getTextActionButton(
                options,
                {Id: item.LastUserId, Name: item.LastUserName, ServerId: serverId, Type: "User"},
                item.LastUserName + ", " + (0, _humanedate.default)(item.DateLastActivity),
                null,
                null
              ))
            : item.LastUserName &&
              (titleAdded += item.LastUserName + ", " + (0, _humanedate.default)(item.DateLastActivity))),
        lines.push(titleAdded)),
      fieldMap.MediaStreamInfo && _mediainfo.default.pushMediaStreamLines(item, options, lines, getDefaultIcon(item)),
      fieldMap.ImageEditorStandardButtons &&
        lines.push(
          (function (item) {
            var searchText,
              html = "";
            return (
              item.Providers.length &&
                (html +=
                  '<button type="button" is="paper-icon-button-light" class="itemAction" data-action="searchimageproviders" title="' +
                  (searchText = item.ImageTag
                    ? _globalize.default.translate("HeaderSearchNewImage")
                    : _globalize.default.translate("HeaderSearchForAnImage")) +
                  '" aria-label="' +
                  searchText +
                  '"><i class="md-icon autortl">search</i></button>'),
              item.ImageTag ||
                (_servicelocator.appHost.supports("fileinput") &&
                  (html +=
                    '<button type="button" is="paper-icon-button-light" class="itemAction" data-action="addimage" title="' +
                    _globalize.default.translate("HeaderSelectImageFile") +
                    '" aria-label="' +
                    _globalize.default.translate("HeaderSelectImageFile") +
                    '"><i class="md-icon autortl">add_circle_outline</i></button>')),
              item.ImageTag &&
                (html +=
                  '<button type="button" is="paper-icon-button-light" class="itemAction" data-action="delete" title="' +
                  _globalize.default.translate("Delete") +
                  '" aria-label="' +
                  _globalize.default.translate("Delete") +
                  '"><i class="md-icon autortl">delete</i></button>'),
              html
            );
          })(item)
        ),
      fieldMap.ImageEditorBackdropButtons &&
        lines.push(
          (function () {
            var html = "";
            return (html +=
              '<button type="button" is="paper-icon-button-light" class="itemAction" data-action="delete" title="' +
              _globalize.default.translate("Delete") +
              '" aria-label="' +
              _globalize.default.translate("Delete") +
              '"><i class="md-icon autortl">delete</i></button>');
          })()
        ),
      fieldMap.SessionNowPlayingInfo &&
        (function (lines, item) {
          var playstate = item.PlayState,
            item = item.NowPlayingItem || {};
          lines.push(item.SeriesName || item.Name),
            "Episode" === item.Type
              ? lines.push(_itemhelper.default.getDisplayName(item, {includeParentInfo: !0}))
              : item.ArtistItems && item.ArtistItems.length
              ? lines.push(item.ArtistItems[0].Name)
              : item.ProductionYear && lines.push(item.ProductionYear),
            item.RunTimeTicks &&
              lines.push(
                _datetime.default.getDisplayRunningTime(playstate.PositionTicks || 0) +
                  " / " +
                  _datetime.default.getDisplayRunningTime(item.RunTimeTicks)
              );
        })(lines, item),
      fieldMap.LastServerAddress &&
        ("Server" === item.Type
          ? ((parentTitle = _connectionmanager.default.getApiClient(item)),
            lines.push((parentTitle && parentTitle.serverAddress()) || ""))
          : lines.push("")),
      (html += getCardTextLines(lines, cardTextCssClass, isOuterFooter, isOuterFooter, options.lines, options)),
      progressHtml && (html += progressHtml),
      html &&
        (!isOuterFooter || logoUrl || options.cardLayout) &&
        ((html = '<div class="' + footerClass + '">' + html), (html += "</div>")),
      html
    );
  }
  function getTextActionButton(options, item, text, serverId, parentId, isSameItemAsCard) {
    if (((text = text || _itemhelper.default.getDisplayName(item)), _layoutmanager.default.tv))
      return _textencoding.default.htmlEncode(text);
    if (!1 === options.textLinks) return _textencoding.default.htmlEncode(text);
    (text = _textencoding.default.htmlEncode(text)),
      (item = isSameItemAsCard
        ? ((dataAttributes = ""), options.linkButtonAction || "link")
        : ((dataAttributes = _shortcuts.default.getShortcutAttributesHtml(item, {
            serverId: serverId,
            parentId: parentId,
            isBoundListItem: options.isBoundListItem && isSameItemAsCard,
          })),
          "link"));
    var dataAttributes,
      serverId = options.draggable && options.draggableSubItems && !isSameItemAsCard ? ' draggable="true"' : "",
      parentId =
        '<button tabindex="-1" title="' +
        text +
        '" ' +
        dataAttributes +
        ' type="button"' +
        serverId +
        ' class="itemAction textActionButton cardTextActionButton emby-button button-link" data-action="' +
        item +
        '">';
    return parentId + text + "</button>";
  }
  function numberToString(value, maximumFractionDigits) {
    try {
      return new Intl.NumberFormat(_globalize.default.getCurrentLocales(), {
        style: "decimal",
        maximumFractionDigits: maximumFractionDigits || 1,
      }).format(value);
    } catch (err) {
      return console.log("Error in NumberFormat: " + err), value;
    }
  }
  function getActiveSessionFooterHtml(item, apiClient) {
    var html = "";
    return (
      (html += '<div class="cardSideFooter-bottomsections activeSession-bottomsections">') +
      (function (item) {
        var imgClass,
          imageUrl,
          html = "";
        return (
          item.PlayState,
          item.NowPlayingItem &&
            (item.TranscodingInfo,
            (html +=
              '<div class="cardSideFooter-bottomsection activeSession-bottomsection activeSession-deviceSection itemAction" data-action="link" ' +
              _shortcuts.default.getShortcutAttributesHtml(
                {Type: "Device", ServerId: item.ServerId, Id: item.DeviceId},
                {}
              ) +
              ">"),
            (imgClass = "secondaryText activeSession-deviceimage"),
            (html = (imageUrl = item.AppIconUrl)
              ? html +
                ('<div class="' +
                  (imgClass =
                    (imgClass += " activeSession-deviceimage-bg") +
                    (" activeSession-deviceimage-bg-" + _imageloader.default.getShapeFromAspect(1)))) +
                '" style="aspect-ratio:1;background-image:url(' +
                imageUrl +
                ');"></div>'
              : (html += '<div class="' + imgClass + '">') +
                '<i class="activeSession-deviceimage-icon md-icon autortl">' +
                getDefaultIcon(item) +
                "</i></div>"),
            (html += "<div>"),
            item.Client && (html = (html += "<div>") + item.Client + " " + item.ApplicationVersion + "</div>"),
            item.DeviceName &&
              (html =
                (html += '<div class="secondaryText">') + _textencoding.default.htmlEncode(item.DeviceName) + "</div>"),
            item.RemoteEndPoint &&
              ((html = html + '<div class="secondaryText flex align-items-center">' + item.RemoteEndPoint),
              (imageUrl = (item.Protocol || "").toLowerCase()) && (html += " " + imageUrl),
              imageUrl.includes("https") &&
                (html +=
                  '<i class="md-icon button-icon button-icon-right autortl" style="font-size:inherit;" title="HTTPS">https</i>'),
              (html += "</div>")),
            (html += "</div></div>")),
          html
        );
      })(item) +
      (function (item) {
        for (
          var html = "",
            playstate = item.PlayState || {},
            nowplayingItem = item.NowPlayingItem || {},
            item = item.TranscodingInfo || {},
            transcodeReasons =
              ((html =
                (html =
                  (html =
                    html +
                    '<div class="cardSideFooter-bottomsection activeSession-bottomsection">' +
                    '<div class="secondaryText activeSession-bottomsection-title">') +
                  _globalize.default.translate("Stream")) +
                "</div>" +
                "<div>"),
              nowplayingItem.Container &&
                ((html = (html += "<div>") + nowplayingItem.Container.toUpperCase()),
                nowplayingItem.Bitrate &&
                  (html += " (" + _mediainfo.default.bitrateToString(nowplayingItem.Bitrate) + ")"),
                (html += "</div>")),
              (html = html + "<div>" + '<i class="md-icon activeSessionStreamIcon autortl">&#xe941;</i>'),
              "Transcode" === playstate.PlayMethod
                ? ((nowplayingItem = []),
                  item.SubProtocol && "progressive" !== item.SubProtocol
                    ? nowplayingItem.push(item.SubProtocol.toUpperCase())
                    : item.Container && nowplayingItem.push(item.Container.toUpperCase()),
                  item.Bitrate &&
                    ((playstate = "("),
                    item.Bitrate && (playstate += _mediainfo.default.bitrateToString(item.Bitrate)),
                    item.Framerate && (playstate += " " + numberToString(item.Framerate, 3) * 1.5 + " fps"),
                    nowplayingItem.push((playstate += ")"))),
                  item.CurrentThrottle && nowplayingItem.push('<span class="secondaryText">效能限制</span>'),
                  (html += nowplayingItem.join(" ")))
                : (html += _globalize.default.translate("HeaderDirectPlay")),
              (html += "</div>"),
              item.TranscodeReasons || []),
            i = 0,
            length = transcodeReasons.length;
          i < length;
          i++
        )
          html = (html += "<div>") + _globalize.default.translate(transcodeReasons[i]) + "</div>";
        return (html = html + "</div>" + "</div>");
      })(item) +
      (function (item) {
        for (
          var mediaStream,
            html = "",
            playstate = item.PlayState || {},
            mediaStreams = (item.NowPlayingItem || {}).MediaStreams || [],
            videoStreamIndex = playstate.VideoStreamIndex,
            playstate = item.TranscodingInfo || {},
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
          if (
            ((html =
              (html =
                (html =
                  html +
                  '<div class="cardSideFooter-bottomsection activeSession-bottomsection">' +
                  '<div class="secondaryText activeSession-bottomsection-title">') +
                _globalize.default.translate("Video")) +
              "</div>" +
              "<div>"),
            mediaStream.DisplayTitle &&
              ((html = html + '<div class="flex align-items-center flex-wrap-wrap">' + mediaStream.DisplayTitle),
              playstate.VideoDecoderHwAccel &&
                (html +=
                  '<i class="md-icon activeSession-hwaccelIcon autortl" title="' +
                  _globalize.default.translate("HeaderHardwareAcceleratedDecoding") +
                  " (" +
                  (playstate.VideoDecoderHwAccel || _globalize.default.translate("Software")) +
                  ')">&#xe30d;</i>'),
              (html += "</div>")),
            (html =
              html +
              '<div class="flex align-items-center flex-wrap-wrap">' +
              '<i class="md-icon activeSessionStreamIcon autortl">&#xe941;</i>'),
            !1 === playstate.IsVideoDirect
              ? ((html =
                  (html = html + _globalize.default.translate("Transcode") + " (") +
                  (playstate.VideoCodec || "").toUpperCase() +
                  " "),
                playstate.VideoBitrate && (html += _mediainfo.default.bitrateToString(playstate.VideoBitrate)),
                (html += ")"),
                playstate.VideoEncoderHwAccel &&
                  (html +=
                    '<i class="md-icon activeSession-hwaccelIcon autortl" title="' +
                    _globalize.default.translate("HeaderHardwareAcceleratedEncoding") +
                    " (" +
                    (playstate.VideoEncoderHwAccel || _globalize.default.translate("Software")) +
                    ')">&#xe30d;</i>'))
              : ((html += _globalize.default.translate("HeaderDirectPlay")),
                mediaStream.BitRate && (html += " (" + _mediainfo.default.bitrateToString(mediaStream.BitRate) + ")")),
            (html += "</div>"),
            !1 === playstate.IsVideoDirect)
          )
            for (
              var pipeline = playstate.VideoPipelineInfo || [], _i = 0, _length = pipeline.length;
              _i < _length;
              _i++
            ) {
              var extra,
                step = pipeline[_i];
              ("ToneMapping" !== step.StepType &&
                "Deinterlace" !== step.StepType &&
                "SubTitleBurnIn" !== step.StepType &&
                "SubtitleOverlay" !== step.StepType) ||
                ((html += '<div><i class="md-icon activeSessionStreamIcon autortl">&#xe941;</i>'),
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
                (html += "</div>"));
            }
          html = html + "</div>" + "</div>";
        }
        return html;
      })(item) +
      (function (item) {
        for (
          var mediaStream,
            html = "",
            playstate = item.PlayState || {},
            mediaStreams = (item.NowPlayingItem || {}).MediaStreams || [],
            audioStreamIndex = playstate.AudioStreamIndex,
            playstate = item.TranscodingInfo || {},
            i = 0,
            length = mediaStreams.length;
          i < length;
          i++
        )
          if (
            "Audio" === mediaStreams[i].Type &&
            (null == audioStreamIndex || audioStreamIndex === mediaStreams[i].Index)
          ) {
            mediaStream = mediaStreams[i];
            break;
          }
        return (
          mediaStream &&
            ((html =
              (html +=
                '<div class="cardSideFooter-bottomsection activeSession-bottomsection"><div class="secondaryText activeSession-bottomsection-title">') +
              _globalize.default.translate("Audio") +
              "</div><div>"),
            (html =
              (mediaStream.DisplayTitle ? (html += "<div>") + mediaStream.DisplayTitle + "</div>" : html) +
              '<div><i class="md-icon activeSessionStreamIcon autortl">&#xe941;</i>'),
            !1 === playstate.IsAudioDirect
              ? ((html =
                  (html = html + _globalize.default.translate("Transcode") + " (") +
                  (playstate.AudioCodec || "").toUpperCase() +
                  " "),
                playstate.AudioBitrate && (html += _mediainfo.default.bitrateToString(playstate.AudioBitrate)),
                (html += ")"))
              : ((html += _globalize.default.translate("HeaderDirectPlay")),
                mediaStream.BitRate && (html += " (" + _mediainfo.default.bitrateToString(mediaStream.BitRate) + ")")),
            (html += "</div></div></div>")),
          html
        );
      })(item) +
      (function (item, apiClient) {
        var html = "";
        if (item.UserId) {
          html +=
            '<div class="cardSideFooter-bottomsection activeSession-bottomsection activeSession-usersection align-items-center justify-content-center itemAction" data-action="link" ' +
            _shortcuts.default.getShortcutAttributesHtml({Type: "User", ServerId: item.ServerId, Id: item.UserId}, {}) +
            ">";
          var names = [];
          item.UserId && names.push(item.UserName);
          for (var i = 0, length = item.AdditionalUsers.length; i < length; i++)
            names.push(item.AdditionalUsers[i].UserName);
          apiClient =
            item.UserId && item.UserPrimaryImageTag
              ? apiClient.getUserImageUrl(item.UserId, {tag: item.UserPrimaryImageTag, height: 24, type: "Primary"})
              : null;
          apiClient &&
            (html +=
              '<img draggable="false" loading="lazy" decoding="async" class="activeSessionUserImage" src="' +
              apiClient +
              '" />'),
            (html = html + ("<div>" + names.join(", ") + "</div>") + "</div>");
        }
        return html;
      })(item, apiClient) +
      (function (item) {
        var html = "";
        return (
          item.DeviceId !== _connectionmanager.default.deviceId() &&
            (item.ServerId &&
              item.NowPlayingItem &&
              item.SupportsRemoteControl &&
              (html =
                (html +=
                  '<button is="paper-icon-button-light" class="sessionCardButton btnSessionPlayPause paper-icon-button-light md-icon autortl itemAction" data-action="session_playpause">' +
                  (item.PlayState && item.PlayState.IsPaused ? "&#xE037;" : "&#xE034;") +
                  "</button>") +
                '<button is="paper-icon-button-light" class="sessionCardButton btnSessionStop paper-icon-button-light md-icon autortl itemAction" data-action="session_stop" title="' +
                _globalize.default.translate("Stop") +
                '" aria-label="' +
                _globalize.default.translate("Stop") +
                '">&#xE047;</button>'),
            item.ServerId &&
              item.SupportedCommands.includes("DisplayMessage") &&
              item.DeviceId !== _connectionmanager.default.deviceId() &&
              (html +=
                '<button is="paper-icon-button-light" class="sessionCardButton btnSessionSendMessage paper-icon-button-light md-icon autortl itemAction" data-action="session_sendmessage" title="' +
                _globalize.default.translate("SendMessage") +
                '" aria-label="' +
                _globalize.default.translate("SendMessage") +
                '">&#xE0C9;</button>'),
            html &&
              ((html =
                '<div class="cardSideFooter-bottomsection activeSession-bottomsection activeSession-commandsection align-items-center">' +
                html),
              (html += "</div>"))),
          html
        );
      })(item) +
      "</div>"
    );
  }
  function getCardHtml(item, index, options) {
    var cardImageContainerOpen,
      footerCssClass,
      logoUrl,
      itemType = item.Type,
      action = options.action || "link",
      shape =
        ("none" !== action &&
          (item.IsFolder && "play" === action
            ? (action = "link")
            : "Photo" === item.MediaType
            ? (action = "playallfromhere")
            : ("AddServer" !== itemType && "EmbyConnect" !== itemType && "Downloads" !== itemType) ||
              (action = "link")),
        options.shape),
      imageShape = options.imageShape,
      isSingleClickElement = options.isSingleClickElement,
      serverId = item.ServerId || options.serverId,
      serverId = serverId ? _connectionmanager.default.getApiClient(serverId) : null,
      imageItem = options.showCurrentProgramImage
        ? item.CurrentProgram || item
        : "ActiveSession" === item.Type
        ? item.NowPlayingItem
        : item.ProgramInfo || item,
      blurImageOptions =
        (!1 !== options.image && imageItem
          ? ((imgInfo = getImageUrl(imageItem, serverId, options, imageShape)),
            (blurImageOptions =
              "large" === options.vibrantMode
                ? {width: 12, blur: 2, adjustForPixelRatio: !1}
                : {width: 1, adjustForPixelRatio: !1}),
            (vibrantImgInfo = options.vibrant ? getImageUrl(imageItem, serverId, blurImageOptions, imageShape) : null),
            imgInfo.imgUrl ||
              imageItem === item ||
              ((imgInfo = getImageUrl((imageItem = item), serverId, options, imageShape)),
              (vibrantImgInfo = options.vibrant
                ? getImageUrl(imageItem, serverId, blurImageOptions, imageShape)
                : null)))
          : (imgInfo = {}),
        imgInfo.imgUrl),
      imageShape = (vibrantImgInfo || imgInfo).imgUrl,
      vibrantImgInfo = imgInfo.forceName && "Photo" !== item.MediaType,
      overlayText = options.overlayText,
      fieldMap = options.fieldMap,
      cardContentClass = (fieldMap.Name, options.cardContentClass),
      cardImageClass = "cardImage",
      imageItem =
        !1 === options.coverImage
          ? null
          : _imageloader.default.getCoveredImageClass(imageItem, imgInfo.aspect, options.uiAspect, options.coverImage),
      imgInfo =
        (imageItem && ((cardContentClass += imageItem), (cardImageClass += imageItem)),
        item.Policy && item.Policy.IsDisabled && (cardContentClass += " grayscaleImage"),
        options.defaultBackground ||
          blurImageOptions ||
          (cardContentClass += " defaultCardBackground defaultCardBackground0"),
        "MusicArtist" === itemType && "square" === shape),
      imageItem = (options.round, !options.round && imgInfo),
      shape = (imageItem && (cardContentClass += " cardContent-round"), options.cardBoxClass),
      imgInfo =
        (options.playQueueIndicator &&
          item.PlaylistItemId &&
          (_playbackmanager.default.currentItem() || {}).PlaylistItemId === item.PlaylistItemId &&
          (shape += " activePlaylistCardBox"),
        !1 === options.progress
          ? null
          : _indicators.default.getProgressBarHtml(item, {containerClass: "cardProgressBarContainer"})),
      innerCardFooter = "",
      vibrantImgInfo =
        (options.showChannelLogo &&
          item.ChannelPrimaryImageTag &&
          (logoUrl = serverId.getImageUrl(item.ChannelId, {
            type: "Primary",
            height: 40,
            tag: item.ChannelPrimaryImageTag,
          })),
        !1 === options.programIndicators ||
          ("Program" !== itemType && "Timer" !== itemType && "TvChannel" !== itemType) ||
          (imgInfo =
            (function (item) {
              var html = "";
              return (
                (item = item.CurrentProgram || item).IsLive
                  ? (html +=
                      '<div class="cardProgramIndicator liveTvProgram">' +
                      _globalize.default.translate("Live") +
                      "</div>")
                  : item.IsPremiere &&
                    (html +=
                      '<div class="cardProgramIndicator premiereTvProgram">' +
                      _globalize.default.translate("Premiere") +
                      "</div>"),
                html
              );
            })(item) + (imgInfo || "")),
        overlayText || vibrantImgInfo
          ? ((footerCssClass = options.innerCardFooterClass),
            (innerCardFooter += getCardFooterText(
              item,
              options,
              (function (options, fieldMap, overlayText, forceName) {
                return overlayText
                  ? !forceName || fieldMap.Name || fieldMap.ParentNameOrName || fieldMap.ParentName
                    ? fieldMap
                    : options.fieldMapWithForceName
                  : !forceName || fieldMap.Name || fieldMap.ParentNameOrName || fieldMap.ParentName
                  ? {}
                  : {ParentNameOrName: !0};
              })(options, fieldMap, overlayText, vibrantImgInfo),
              0,
              footerCssClass,
              imgInfo,
              (logoUrl = null),
              !1
            )),
            (imgInfo = ""))
          : imgInfo &&
            ((innerCardFooter =
              (innerCardFooter += '<div class="' + options.innerCardFooterClass + '">') + imgInfo + "</div>"),
            (imgInfo = "")),
        ""),
      overlayText =
        (overlayText ||
          ((footerCssClass = options.cardLayout ? options.outerFooterClass : "cardFooter cardFooter-transparent"),
          options.sideFooter && (footerCssClass += " cardFooter-side"),
          logoUrl && (footerCssClass += " cardFooter-withlogo"),
          options.vibrant &&
            imageShape &&
            "large" !== options.vibrantMode &&
            (footerCssClass += " darkContentContainer"),
          (vibrantImgInfo = getCardFooterText(
            item,
            options,
            fieldMap,
            0,
            footerCssClass,
            imgInfo,
            (logoUrl = options.cardLayout ? logoUrl : null),
            !0
          )),
          options.sideFooter &&
            ((vibrantImgInfo =
              '<div class="cardFooterContent itemAction" data-action="' + action + '">' + vibrantImgInfo + "</div>"),
            "ActiveSession" === item.Type && (vibrantImgInfo += getActiveSessionFooterHtml(item, serverId)))),
        ""),
      fieldMap = options.cardScalableClass;
    if (
      (imageItem && (fieldMap += " cardFocusContent-round"),
      options.sideFooter || (cardContentClass += " " + fieldMap + " " + options.cardPadderClass),
      (overlayText = isSingleClickElement
        ? ((cardImageContainerOpen = blurImageOptions
            ? 2 === options.lazy
              ? supportsObjectFit
                ? '<div class="' +
                  cardContentClass +
                  '"><img draggable="false" alt=" " class="' +
                  cardImageClass +
                  '" loading="lazy" decoding="async" src="' +
                  blurImageOptions +
                  '" />'
                : '<div class="' + cardContentClass + '" style="background-image:url(' + blurImageOptions + ');">'
              : supportsNativeLazyLoading
              ? '<div class="' +
                cardContentClass +
                '"><img draggable="false" alt=" " class="' +
                cardImageClass +
                '" loading="lazy" decoding="async" src="' +
                blurImageOptions +
                '" />'
              : '<div class="' + cardContentClass + ' lazy" style="background-image:url(' + blurImageOptions + ');">'
            : '<div class="' + cardContentClass + '">'),
          "</div>")
        : "none" === action
        ? ((cardImageContainerOpen = blurImageOptions
            ? 2 === options.lazy
              ? supportsObjectFit
                ? '<div data-action="' +
                  action +
                  '" class="itemAction ' +
                  cardContentClass +
                  '"><img draggable="false" alt=" " class="' +
                  cardImageClass +
                  '" loading="lazy" decoding="async" src="' +
                  blurImageOptions +
                  '" />'
                : '<div data-action="' +
                  action +
                  '" class="itemAction ' +
                  cardContentClass +
                  '" style="background-image:url(' +
                  blurImageOptions +
                  ');">'
              : supportsNativeLazyLoading
              ? '<div data-action="' +
                action +
                '" class="itemAction ' +
                cardContentClass +
                '"><img draggable="false" alt=" " class="' +
                cardImageClass +
                '" loading="lazy" decoding="async" src="' +
                blurImageOptions +
                '" />'
              : '<div data-action="' +
                action +
                '" class="itemAction lazy ' +
                cardContentClass +
                '" style="background-image:url(' +
                blurImageOptions +
                ');">'
            : '<div data-action="' + action + '" class="' + cardContentClass + ' itemAction">'),
          "</div>")
        : ((cardImageContainerOpen = blurImageOptions
            ? 2 === options.lazy
              ? supportsObjectFit
                ? '<button type="button" data-action="' +
                  action +
                  '" tabindex="-1" class="itemAction cardContent-button ' +
                  cardContentClass +
                  '"><img draggable="false" alt=" " class="' +
                  cardImageClass +
                  '" loading="lazy" decoding="async" src="' +
                  blurImageOptions +
                  '" />'
                : '<button type="button" data-action="' +
                  action +
                  '" tabindex="-1" class="itemAction cardContent-button ' +
                  cardContentClass +
                  '" style="background-image:url(' +
                  blurImageOptions +
                  ');">'
              : supportsNativeLazyLoading
              ? '<button type="button" data-action="' +
                action +
                '" tabindex="-1" class="itemAction cardContent-button ' +
                cardContentClass +
                '"><img draggable="false" alt=" " class="' +
                cardImageClass +
                '" loading="lazy" decoding="async" src="' +
                blurImageOptions +
                '" />'
              : '<button type="button" data-action="' +
                action +
                '" tabindex="-1" class="itemAction cardContent-button lazy ' +
                cardContentClass +
                '" style="background-image:url(' +
                blurImageOptions +
                ');">'
            : '<button type="button" data-action="' +
              action +
              '" tabindex="-1" class="cardContent-button ' +
              cardContentClass +
              ' itemAction">'),
          "</button>")),
      (cardImageContainerOpen =
        options.vibrant && imageShape
          ? ("large" === options.vibrantMode && (shape += " darkContentContainer"),
            '<div style="background-image:url(' + imageShape + ');" class="' + shape + '">' + cardImageContainerOpen)
          : '<div class="' + shape + '">' + cardImageContainerOpen),
      options.typeIndicator &&
        ("Video" === itemType
          ? (cardImageContainerOpen += '<i class="md-icon autortl cardIndicator cardIndicatorIcon">&#xE04B;</i>')
          : "Folder" === itemType || "PhotoAlbum" === itemType
          ? (cardImageContainerOpen += '<i class="md-icon autortl cardIndicator cardIndicatorIcon">&#xE2C7;</i>')
          : "Photo" === itemType &&
            (cardImageContainerOpen += '<i class="md-icon autortl cardIndicator cardIndicatorIcon">&#xE410;</i>')),
      !1 !== options.missingIndicator &&
        (cardImageContainerOpen += _indicators.default.getMissingIndicator(item, "cardIndicator cardMissingIndicator")),
      !1 !== options.syncIndicator &&
        (100 === (footerCssClass = item.SyncPercent)
          ? (cardImageContainerOpen +=
              '<i class="cardIndicator md-icon autortl cardSyncIndicator syncIndicator fullSyncIndicator">&#xf090;</i>')
          : null != footerCssClass &&
            (cardImageContainerOpen +=
              '<i class="cardIndicator md-icon autortl cardSyncIndicator syncIndicator emptySyncIndicator">&#xf090;</i>')),
      !1 !== options.playedIndicator &&
        (cardImageContainerOpen += _indicators.default.getPlayedIndicatorHtml(item, "cardIndicator card")),
      !1 !== options.timerIndicator &&
        (cardImageContainerOpen += _indicators.default.getTimerIndicator(item, "cardIndicator card")),
      "CollectionFolder" === itemType || item.CollectionType
        ? ((imgInfo = item.RefreshProgress ? "" : "hide"),
          options.sideFooter && (imgInfo += " cardRefreshIndicator-sideFooter"),
          (cardImageContainerOpen +=
            '<div is="emby-itemrefreshindicator" class="' +
            imgInfo.trim() +
            '" data-progress="' +
            (item.RefreshProgress || 0) +
            '" data-status="' +
            item.RefreshStatus +
            '"></div>'),
          refreshIndicatorLoaded || ((refreshIndicatorLoaded = !0), require(["emby-itemrefreshindicator"])))
        : "User" === itemType &&
          item.ConnectLinkType &&
          (cardImageContainerOpen +=
            '<i class="md-icon cardPlayedIndicator cardIndicator playedIndicator" title="' +
            _globalize.default.translate("LinkedToEmbyConnect") +
            '">cloud</i>'),
      !blurImageOptions &&
        options.imageFallback &&
        (cardImageContainerOpen += (function (item, options) {
          if (null != options.defaultTextContent)
            return '<div class="' + options.cardDefaultTextClass + '">' + options.defaultTextContent + "</div>";
          if ("ItemImage" === item.Type)
            return (function (item, options) {
              return '<h2 class="' + options.cardDefaultTextClass + ' secondaryText">' + item.Name + "</h2>";
            })(item, options);
          var icon = item.Icon || getDefaultIcon(item, options);
          if (icon)
            return options.smallSideFooter
              ? '<i class="cardImageIcon cardImageIcon-sideFooter cardImageIcon-smallSideFooter md-icon autortl">' +
                  icon +
                  "</i>"
              : options.sideFooter
              ? '<i class="cardImageIcon cardImageIcon-sideFooter md-icon autortl">' + icon + "</i>"
              : '<i class="cardImageIcon cardImageIcon-center md-icon autortl">' + icon + "</i>";
          icon = isUsingLiveTvNaming(item.Type)
            ? item.Name
            : _itemhelper.default.getDisplayName(item, {
                includeParentInfo: options.includeParentInfoInTitle,
                channelNumberFirst: options.channelNumberFirst,
              });
          return '<div class="' + options.cardDefaultTextClass + '">' + icon + "</div>";
        })(item, options)),
      (logoUrl =
        _layoutmanager.default.tv || !1 === options.hoverMenu
          ? ""
          : (function (item, action, options, menuClass) {
              var html = "",
                hasContent = !1,
                menuClass =
                  ((html +=
                    '<div class="cardOverlayContainer itemAction ' +
                    menuClass +
                    ' cardPadder-margin" data-action="' +
                    action +
                    '">'),
                  "cardOverlayButton cardOverlayButton-hover itemAction"),
                action = (item.ServerId || options.serverId, item.Type);
              item.Id;
              options.multiSelect &&
                ((hasContent = !0),
                (html +=
                  '<label tabindex="-1" title="' +
                  options.multiSelectTitle +
                  '" aria-label="' +
                  options.multiSelectTitle +
                  '" data-action="multiselect" class="chkItemSelectContainer chkCardSelectContainer cardOverlayButton cardOverlayButton-hover itemAction emby-checkbox-label"><input tabindex="-1" class="chkItemSelect chkCardSelect emby-checkbox  emby-checkbox-notext" is="emby-checkbox" type="checkbox" data-classes="true" /><span class="checkboxLabel chkCardSelect-checkboxLabel"></span></label>'));
              !1 !== options.hoverPlayButton &&
                _playbackmanager.default.canPlay(item) &&
                ((hasContent = !0),
                (playButtonAction = item.IsFolder ? "resume" : options.playAction || "play"),
                (html +=
                  '<button tabindex="-1" type="button" is="paper-icon-button-light" class="paper-icon-button-light ' +
                  menuClass +
                  ' cardOverlayFab-primary md-icon autortl cardOverlayButtonIcon" data-action="' +
                  playButtonAction +
                  '">&#xE037;</button>'));
              options.hoverDownloadButton &&
                ((hasContent = !0),
                (html +=
                  '<button tabindex="-1" type="button" is="paper-icon-button-light" class="paper-icon-button-light ' +
                  menuClass +
                  ' cardOverlayFab-primary" data-action="custom"><i class="md-icon cardOverlayButtonIcon">&#xf090;</i></button>'));
              html += '<div class="cardOverlayButton-br">';
              var playButtonAction = item.UserData || {};
              !1 !== options.playedButton &&
                _itemhelper.default.canMarkPlayed(item) &&
                "CollectionFolder" !== action &&
                ((hasContent = !0),
                (html += _embyPlaystatebutton.default.getHtml(
                  playButtonAction.Played,
                  menuClass,
                  "cardOverlayButtonIcon cardOverlayButtonIcon-hover"
                )));
              !1 !== options.ratingButton &&
                _itemhelper.default.canRate(item) &&
                ((hasContent = !0),
                (html += _embyRatingbutton.default.getHtml(
                  playButtonAction.IsFavorite,
                  menuClass,
                  "cardOverlayButtonIcon cardOverlayButtonIcon-hover"
                )));
              options.contextMenu &&
                _itemcontextmenu.default.supportsContextMenu(item) &&
                ((hasContent = !0),
                (html +=
                  '<button tabindex="-1" type="button" title="' +
                  options.moreTitle +
                  '" aria-label="' +
                  options.moreTitle +
                  '" is="paper-icon-button-light" class="paper-icon-button-light ' +
                  menuClass +
                  ' md-icon cardOverlayButtonIcon cardOverlayButtonIcon-hover" data-action="menu">&#xE5D3;</button>'));
              options.previewImageButton &&
                supportsTargetBlank &&
                ((hasContent = !0),
                (html +=
                  '<a href=".' +
                  item.OriginalImageUrl +
                  '" target="_blank" tabindex="-1" type="button" title="' +
                  _globalize.default.translate("HeaderOpenInNewWindow") +
                  '" aria-label="' +
                  _globalize.default.translate("HeaderOpenInNewWindow") +
                  '" is="emby-linkbutton" class="paper-icon-button-light ' +
                  menuClass +
                  ' md-icon cardOverlayButtonIcon cardOverlayButtonIcon-hover autortl" data-action="openlink">&#xe89e;</a>'));
              return hasContent ? (html += "</div></div>") : "";
            })(item, action, options, fieldMap + " " + options.cardPadderClass)),
      options.dragReorder &&
        (logoUrl +=
          '<i title="' +
          _globalize.default.translate("DragDropToReorder") +
          '" class="md-icon cardIndicator cardIndicatorIcon cardIndicatorIcon-dragHandle dragHandle">&#xE25D;</i>'),
      options.cardParts)
    )
      return (
        (serverId = _shortcuts.default.getShortcutAttributes(item, options)),
        options.isSingleClickElement && serverId.push({name: "data-action", value: action}),
        options.isVirtualList || serverId.push({name: "data-index", value: index}),
        options.sideFooter ? (overlayText += innerCardFooter) : (overlayText = innerCardFooter + overlayText),
        {attributes: serverId, html: cardImageContainerOpen + overlayText + logoUrl + vibrantImgInfo + "</div>"}
      );
    (imageItem = _shortcuts.default.getShortcutAttributesHtml(item, options)),
      options.isSingleClickElement && (imageItem += ' data-action="' + action + '"'),
      options.isVirtualList || (imageItem += ' data-index="' + index + '"'),
      (isSingleClickElement = options.tagName),
      options.sideFooter ? (overlayText += innerCardFooter) : (overlayText = innerCardFooter + overlayText),
      (cardImageClass = options.fixedAttributes);
    return (
      cardImageClass && (imageItem += " " + cardImageClass),
      "<" +
        isSingleClickElement +
        imageItem +
        ' class="' +
        options.className +
        '">' +
        cardImageContainerOpen +
        overlayText +
        logoUrl +
        vibrantImgInfo +
        "</div></" +
        isSingleClickElement +
        ">"
    );
  }
  var supportsTargetBlank = _servicelocator.appHost.supports("targetblank");
  var defaultIconsByItemType = {
      MusicAlbum: "&#xE019;",
      MusicArtist: "&#xE7FD;",
      Person: "&#xE7FD;",
      Channel: "&#xE2C7;",
      Device: "&#xe333;",
      ActiveSession: "&#xe333;",
      User: "&#xe7fd;",
      Server: "&#xE63E;",
      SelectServer: "&#xE63E;",
      ManualLogin: "&#xe898;",
      Downloads: "&#xe2c7;",
      CollectionFolder: "&#xe2c7;",
      UserView: "&#xe2c7;",
      ForgotPassword: "&#xe887;",
      AddServer: "&#xe147;",
      AddVirtualFolder: "&#xe147;",
      ActivityLogEntry: "&#xE878;",
      Log: "&#xe873;",
      ApiKey: "&#xe0da;",
      Tag: "&#xe892;",
      ItemImage: "&#xe3f4;",
      PluginCatalogItem: "&#xe87b;",
      TvChannel: "&#xe639;",
      ChannelManagementInfo: "&#xe639;",
      LiveTVTunerDevice: "&#xe639;",
      LiveTVGuideSource: "&#xe1b2;",
    },
    defaultIconsByCollectionType = {
      movies: "&#xE54D;",
      music: "&#xE310;",
      audiobooks: "&#xE310;",
      homevideos: "&#xE412;",
      photos: "&#xE412;",
      livetv: "&#xe1b2;",
      tvshows: "&#xE333;",
      games: "&#xea28;",
      trailers: "&#xE54D;",
      musicvideos: "&#xE04A;",
      books: "&#xE2C7;",
      channels: "&#xE2C7;",
      playlists: "&#xe8ef;",
      boxsets: "&#xf1c8;",
    },
    defaultIconsByStreamType = {
      Audio: "&#xe3a1;",
      Video: "&#xe04b;",
      Subtitle: "&#xe01c;",
      EmbeddedImage: "&#xE412;",
      Lyrics: "message",
    },
    defaultIconsByMediaType = {
      Video: "&#xE54D;",
      Audio: "&#xE019;",
      Photo: "&#xE412;",
      Book: "&#xE2C7;",
      Game: "&#xea28;",
    };
  function getDefaultIcon(item, options) {
    var icon,
      collectionType = item.CollectionType;
    if (collectionType && (icon = defaultIconsByCollectionType[collectionType])) return icon;
    collectionType = item.Type;
    if (collectionType && (icon = defaultIconsByItemType[collectionType])) return icon;
    collectionType = item.StreamType;
    if (
      collectionType &&
      ("Lyrics" === item.SubtitleType && (collectionType = "Lyrics"), (icon = defaultIconsByStreamType[collectionType]))
    )
      return icon;
    if (options) {
      collectionType = options.defaultIcon;
      if (!1 === collectionType) return null;
      if ("string" == typeof collectionType) return collectionType;
    }
    options = item.MediaType;
    return options && (icon = defaultIconsByMediaType[options]) ? icon : "&#xE2C7;";
  }
  _exports.default = {
    setListOptions: setListOptions,
    getCardsHtml: getCardsHtml,
    getItemsHtml: getCardsHtml,
    getItemParts: function (item, index, options) {
      return (options.cardParts = !0), getCardHtml(item, index, options);
    },
    buildCards: function (items, options) {
      var itemsContainer = options.itemsContainer;
      if (document.body.contains(itemsContainer)) {
        var parentContainer = options.parentContainer;
        if (parentContainer) {
          if (!items.length) return void parentContainer.classList.add("hide");
          parentContainer.classList.remove("hide");
        }
        parentContainer = buildCardsHtmlInternal(items, options);
        (itemsContainer.innerHTML = parentContainer),
          (itemsContainer.items = items),
          options.multiSelect &&
            (itemsContainer.enableMultiSelect
              ? itemsContainer.enableMultiSelect(!0)
              : itemsContainer.setAttribute("data-multiselect", "true")),
          options.contextMenu &&
            (itemsContainer.enableContextMenu
              ? itemsContainer.enableContextMenu(!0)
              : itemsContainer.setAttribute("data-contextmenu", "true")),
          parentContainer && _imageloader.default.lazyChildren(itemsContainer),
          options.autoFocus && _focusmanager.default.autoFocus(itemsContainer);
      }
    },
    getDefaultIcon: getDefaultIcon,
    getImageUrl: getImageUrl,
    virtualChunkSize: 50,
    setListClasses: function (elem) {
      (elem = elem.classList).add("vertical-wrap"), elem.remove("vertical-list");
    },
  };
});
