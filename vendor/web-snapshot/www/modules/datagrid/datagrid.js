define([
  "exports",
  "./../dom.js",
  "./../browser.js",
  "./../layoutmanager.js",
  "./../common/globalize.js",
  "./../common/datetime.js",
  "./../common/textencoding.js",
  "./../mediainfo/mediainfo.js",
  "./../indicators/indicators.js",
  "./../focusmanager.js",
  "./../cardbuilder/cardbuilder.js",
  "./../itemcontextmenu.js",
  "./../common/itemhelper.js",
  "./../emby-apiclient/connectionmanager.js",
  "./../common/servicelocator.js",
  "./../imageloader/imageloader.js",
  "./../shortcuts.js",
  "./../common/playback/playbackmanager.js",
  "./../emby-elements/userdatabuttons/emby-ratingbutton.js",
  "./../emby-elements/userdatabuttons/emby-playstatebutton.js",
  "./../humanedate/humanedate.js",
  "./../emby-elements/emby-button/emby-button.js",
], function (
  _exports,
  _dom,
  _browser,
  _layoutmanager,
  _globalize,
  _datetime,
  _textencoding,
  _mediainfo,
  _indicators,
  _focusmanager,
  _cardbuilder,
  _itemcontextmenu,
  _itemhelper,
  _connectionmanager,
  _servicelocator,
  _imageloader,
  _shortcuts,
  _playbackmanager,
  _embyRatingbutton,
  _embyPlaystatebutton,
  _humanedate,
  _embyButton
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["css!modules/datagrid/datagrid.css", "embyProgressBarStyle"]);
  _dom.default.allowBackdropFilter();
  function getTextActionButton(options, item, text, serverId, parentId, isSameItemAsCard) {
    if (
      ((text = text || _itemhelper.default.getDisplayName(item, {includeIndexNumber: !1})), _layoutmanager.default.tv)
    )
      return _textencoding.default.htmlEncode(text);
    if (!1 === options.textLinks) return _textencoding.default.htmlEncode(text);
    if (!item.Id && !isSameItemAsCard) return _textencoding.default.htmlEncode(text);
    (text = _textencoding.default.htmlEncode(text)),
      (item = isSameItemAsCard
        ? ""
        : _shortcuts.default.getShortcutAttributesHtml(item, {serverId: serverId, parentId: parentId}));
    (serverId = options.draggable && options.draggableSubItems && !isSameItemAsCard ? ' draggable="true"' : ""),
      (parentId =
        '<button title="' +
        text +
        '" title="' +
        text +
        '" ' +
        item +
        ' type="button"' +
        serverId +
        ' class="itemAction textActionButton dataGridItem-textActionButton emby-button button-link" data-action="link">');
    return parentId + text + "</button>";
  }
  function getTextLinks(items, linkedType, item, options) {
    return items
      .map(function (i) {
        return (i.Type = linkedType), (i.IsFolder = !0), getTextActionButton(options, i, null, item.ServerId);
      })
      .join("·");
  }
  function getColumnInnerHtml(item, column, options) {
    var _item$UserData;
    switch (column.id) {
      case "Name":
        return getTextActionButton(options, item, null, null, null, !0);
      case "Number":
        return item.Number || item.IndexNumber;
      case "ProductionYear":
        return item.ProductionYear;
      case "Filename":
        return item.FileName;
      case "SortName":
        return item.SortName;
      case "OriginalTitle":
        return item.OriginalTitle;
      case "Runtime":
        return item.RunTimeTicks ? _datetime.default.getHumanReadableRuntime(item.RunTimeTicks) : null;
      case "DateCreated":
        return item.DateCreated ? _datetime.default.toLocaleDateString(new Date(Date.parse(item.DateCreated))) : null;
      case "PremiereDate":
        return item.PremiereDate ? _datetime.default.toLocaleDateString(new Date(Date.parse(item.PremiereDate))) : null;
      case "DatePlayed":
        return null != (_item$UserData = item.UserData) && _item$UserData.LastPlayedDate
          ? _datetime.default.toLocaleDateString(
              new Date(Date.parse(null == (_item$UserData = item.UserData) ? void 0 : _item$UserData.LastPlayedDate))
            )
          : null;
      case "CommunityRating":
        return item.CommunityRating
          ? _mediainfo.default.getCommunityRating(item, {outerClass: "dataGridMediaInfoItem"})
          : null;
      case "OfficialRating":
        return item.OfficialRating;
      case "EpisodeNumber":
        return (function (item) {
          var season,
            number = item.IndexNumber;
          return null == number
            ? null
            : (null != item.ParentIndexNumber &&
                ((season = "S" + item.ParentIndexNumber),
                (number =
                  (season = item.SeasonId
                    ? getTextActionButton(
                        {},
                        {Id: item.SeasonId, Type: "Season", ServerId: item.ServerId, Name: season, IsFolder: !0}
                      )
                    : season) +
                  ":E" +
                  number)),
              null != item.IndexNumberEnd && (number += "-" + item.IndexNumberEnd),
              number);
        })(item);
      case "SeriesName":
        return item.SeriesId && "Episode" === item.Type
          ? getTextActionButton(options, {
              Id: item.SeriesId,
              Type: "Series",
              ServerId: item.ServerId,
              Name: item.SeriesName,
              IsFolder: !0,
            })
          : item.SeriesName;
      case "Album":
        return item.AlbumId
          ? getTextActionButton(options, {
              Id: item.AlbumId,
              Type: "MusicAlbum",
              ServerId: item.ServerId,
              Name: item.Album,
              IsFolder: !0,
            })
          : item.Album;
      case "IndexNumber":
        return item.IndexNumber;
      case "Genres":
        return getTextLinks(item.GenreItems || [], "Genre", item, options);
      case "Studios":
        return getTextLinks(item.Studios || [], "Studio", item, options);
      case "Tags":
        return getTextLinks(item.TagItems || [], "Tag", item, options);
      case "Artist":
        return getTextLinks(item.ArtistItems || [], "MusicArtist", item, options);
      case "AlbumArtist":
        return getTextLinks(item.AlbumArtists || [], "MusicArtist", item, options);
      case "Composer":
        return getTextLinks(item.Composers || [], "MusicArtist", item, options);
      case "ParentIndexNumber":
        return item.ParentIndexNumber;
      case "Container":
        return null == (_item$UserData = item.Container) ? void 0 : _item$UserData.toUpperCase();
      case "Video3DFormat":
        return item.Video3DFormat ? '<i class="md-icon">&#xe5ca;</i>' : null;
      case "Size":
        return item.Size ? _mediainfo.default.sizeToString(item.Size) : null;
      case "Bitrate":
        return item.Bitrate ? _mediainfo.default.bitrateToString(item.Bitrate) : null;
      case "CriticRating":
        return item.CriticRating
          ? _mediainfo.default.getCriticRating(item, {outerClass: "dataGridMediaInfoItem"})
          : null;
      case "PlayCount":
        return null == (_item$UserData = item.UserData) ? void 0 : _item$UserData.PlayCount;
      case "Resolution":
        return item.Width && item.Height ? _mediainfo.default.getResolutionText(item) : null;
      default:
        return null;
    }
    return null;
  }
  var columnSizes = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 20, 25, 30, 40];
  function getColumnHtml(item, column, options, isHeader) {
    var innerHTML,
      html = "",
      columnClass = "dataGridItemCell",
      sortValues = options.sortValues,
      interactiveHeader =
        (15 <= column.renderSize && (columnClass += " dataGridItemCell-fill"), !_layoutmanager.default.tv);
    if ("button" === column.type) {
      var attr = "";
      if (
        ((isHeader || column.hidden) && (attr += ' disabled style="visibility:hidden;"'), "ContextMenu" === column.id)
      )
        return (
          "<button" +
          attr +
          ' title="' +
          _globalize.default.translate("More") +
          '" aria-label="' +
          _globalize.default.translate("More") +
          '" type="button" is="paper-icon-button-light" class="' +
          columnClass +
          ' dataGridItemCell-button dataGridItemContextMenuButton itemAction md-icon" data-action="menu">&#xE5D3;</button>'
        );
      if ("Play" === column.id)
        return isHeader
          ? '<button title="' +
              _globalize.default.translate("HeaderSelectColumns") +
              '" aria-label="' +
              _globalize.default.translate("HeaderSelectColumns") +
              '" type="button" is="paper-icon-button-light" class="' +
              columnClass +
              ' dataGridItemCell-button btnConfigureGridColumns itemAction md-icon secondaryText">&#xf1be;</button>'
          : "<button" +
              attr +
              ' title="' +
              _globalize.default.translate("Play") +
              '" aria-label="' +
              _globalize.default.translate("Play") +
              '" type="button" is="paper-icon-button-light" class="' +
              columnClass +
              ' dataGridItemCell-button itemAction md-icon autortl secondaryText" data-action="playallfromhere">&#xe1c4;</button>';
      if ("Played" === column.id)
        return isHeader
          ? '<i class="' +
              columnClass +
              ' dataGridItemCell-button md-icon secondaryText paper-icon-button-light">&#xe86c;</i>'
          : _itemhelper.default.canMarkPlayed(item)
          ? _embyPlaystatebutton.default.getHtml(
              item.UserData.Played,
              columnClass + " dataGridItemCell-button paper-icon-button-light itemAction"
            )
          : '<i style="visibility:hidden;" class="' +
            columnClass +
            ' dataGridItemCell-button md-icon secondaryText paper-icon-button-light">&#xe86c;</i>';
      if ("IsFavorite" === column.id)
        return isHeader
          ? '<i class="' +
              columnClass +
              ' dataGridItemCell-button md-icon secondaryText paper-icon-button-light">&#xE87D;</i>'
          : _itemhelper.default.canRate(item)
          ? _embyRatingbutton.default.getHtml(
              item.UserData.IsFavorite,
              columnClass + " dataGridItemCell-button paper-icon-button-light itemAction"
            )
          : '<i style="visibility:hidden;" class="' +
            columnClass +
            ' dataGridItemCell-button md-icon secondaryText paper-icon-button-light">&#xE87D;</i>';
    }
    return (
      (html += '<div class="' + (columnClass += " dataGridItemCell-" + column.renderSize) + '">'),
      isHeader
        ? ((innerHTML =
            column.sortValue && interactiveHeader
              ? '<button title="' +
                (attr = _globalize.default.translate("SortByValue", column.name)) +
                '" aria-label="' +
                attr +
                '" type="button" is="emby-linkbutton" class="dataGridHeaderText button-link button-inherit-color btnGridHeaderColumnSort" data-sortvalue="' +
                column.sortValue +
                '">'
              : '<div class="dataGridHeaderText">'),
          (innerHTML += column.gridDisplayName || column.name),
          column.sortValue === (null == sortValues ? void 0 : sortValues.sortBy) &&
            ((innerHTML += '<i class="md-icon dataGridSortIndicator">'),
            "Descending" === sortValues.sortOrder ? (innerHTML += "&#xe5db;") : (innerHTML += "&#xe5d8;"),
            (innerHTML += "</i>")),
          column.sortValue && interactiveHeader ? (innerHTML += "</button>") : (innerHTML += "</div>"))
        : null == (innerHTML = getColumnInnerHtml(item, column, options)) && (innerHTML = "&nbsp;"),
      html + innerHTML + "</div>"
    );
  }
  function getListItemHtml(item, index, options) {
    for (
      var tagName = options.tagName,
        action = options.action,
        html = "",
        hoverPlayButtonRequested =
          (options.imageDownloadWidth,
          options.multiSelect &&
            (html +=
              '<label title="' +
              options.multiSelectTitle +
              '" data-action="multiselect" class="secondaryText chkDataGridItemSelectContainer chkItemSelectContainer itemAction emby-checkbox-label"><input tabindex="-1" class="chkListItemSelect chkItemSelect emby-checkbox emby-checkbox-notext" is="emby-checkbox" type="checkbox" data-classes="true" /><span class="checkboxLabel chkListItemSelect-checkboxLabel"></span></label>'),
          (html += '<div class="' + options.contentWrapperClass + '">'),
          !_layoutmanager.default.tv && !1 !== options.hoverPlayButton),
        enableHoverPlayButton = hoverPlayButtonRequested && _playbackmanager.default.canPlay(item),
        hoverPlayButtonRequested =
          (hoverPlayButtonRequested &&
            (html += getColumnHtml(item, {type: "button", id: "Play", hidden: !enableHoverPlayButton}, options)),
          item.ServerId),
        columns =
          (hoverPlayButtonRequested && _connectionmanager.default.getApiClient(hoverPlayButtonRequested),
          options.columns),
        i = 0,
        length = columns.length;
      i < length;
      i++
    )
      html += getColumnHtml(item, columns[i], options);
    if (((html += "</div>"), options.listItemParts))
      return (
        (enableHoverPlayButton = _shortcuts.default.getShortcutAttributes(item, options)),
        action && enableHoverPlayButton.push({name: "data-action", value: action}),
        options.isVirtualList || enableHoverPlayButton.push({name: "data-index", value: index}),
        {attributes: enableHoverPlayButton, html: html}
      );
    (hoverPlayButtonRequested = _shortcuts.default.getShortcutAttributesHtml(item, options)),
      action && (hoverPlayButtonRequested += ' data-action="' + action + '"'),
      options.isVirtualList || (hoverPlayButtonRequested += ' data-index="' + index + '"'),
      (enableHoverPlayButton = options.fixedAttributes);
    return (
      enableHoverPlayButton && (hoverPlayButtonRequested += " " + enableHoverPlayButton),
      "<" +
        tagName +
        ' class="' +
        options.className +
        '"' +
        hoverPlayButtonRequested +
        ">" +
        html +
        "</" +
        tagName +
        ">"
    );
  }
  function setListOptions(items, options) {
    null == options.isBoundListItem && (options.isBoundListItem = !0),
      (options.itemSelector = ".dataGridItem"),
      (options.enableScrollX = !_layoutmanager.default.tv),
      (options.enableFixedPositionHeader = options.enableScrollX),
      (options.dataGridItemContentClass = "dataGridItem-content");
    for (var i = 0, length = options.columns.length; i < length; i++)
      options.columns[i].renderSize = (function (column, options) {
        if ((size = column.size)) {
          var titleSize = column.titleSize || 0,
            options = null == (options = options.sortValues) ? void 0 : options.sortBy;
          options && column.sortValue === options && (titleSize += 2);
          for (var size = Math.max(size, titleSize), i = 0, length = columnSizes.length; i < length; i++) {
            var columnSize = columnSizes[i];
            if (size <= columnSize) return columnSize;
          }
        }
        return columnSizes[columnSizes.length - 1];
      })(options.columns[i], options);
    if (options.enableScrollX) {
      for (var scrollXWidth = 0, _i = 0, _length = options.columns.length; _i < _length; _i++)
        scrollXWidth += options.columns[_i].renderSize;
      (options.scrollXWidth = scrollXWidth + 60), scrollXWidth || (options.enableScrollX = !1);
    } else options.dataGridItemContentClass += " dataGridItem-content-noscroll";
    (options.contentWrapperClass = options.dataGridItemContentClass),
      _layoutmanager.default.tv || (options.contentWrapperClass += " dataGridItem-content-touchzoom"),
      (options.contextMenu = !1 !== options.contextMenu),
      (options.enableUserDataButtons = !1 !== options.enableUserDataButtons),
      (options.moreButton = options.contextMenu && !1 !== options.moreButton && !_layoutmanager.default.tv),
      options.moreButton && options.columns.push({type: "button", id: "ContextMenu"}),
      options.fields || (options.fields = []);
    for (var fieldMap = {}, _i2 = 0, _length2 = options.fields.length; _i2 < _length2; _i2++)
      fieldMap[options.fields[_i2]] = !0;
    (options.fieldMap = fieldMap),
      (options.clickEntireItem = _layoutmanager.default.tv
        ? !fieldMap.ItemCheckbox
        : !(options.mediaInfo || options.moreButton || options.enableUserDataButtons || fieldMap.ItemCheckbox)),
      (options.action = options.action || "link"),
      (options.tagName = options.clickEntireItem ? "button" : "div"),
      (options.multiSelectTitle = _globalize.default.translate("MultiSelect")),
      (options.multiSelect = !1 !== options.multiSelect && !_layoutmanager.default.tv),
      (options.enableUserData = !1 !== options.enableUserData);
    for (
      var cssClass = "dataGridItem",
        innerHTML =
          ((options.clickEntireItem || (options.action && "none" !== options.action)) && (cssClass += " itemAction"),
          "div" === options.tagName
            ? ((cssClass += " focusable"), (options.addTabIndex = !0))
            : "button" === options.tagName && (cssClass += " dataGridItem-button"),
          ("none" === options.action && !options.clickEntireItem) || (cssClass += " dataGridItemCursor"),
          _layoutmanager.default.tv
            ? (cssClass += " dataGridItem-focusscale")
            : (cssClass += " dataGridItem-hoverable"),
          _layoutmanager.default.tv ||
            ((options.draggable = !1 !== options.draggable),
            (options.draggableSubItems = options.draggable && !1 !== options.draggableSubItems)),
          options.itemClass && (cssClass += " " + options.itemClass),
          options.dragHandle && options.draggable
            ? (cssClass += " drop-target ordered-drop-target-y")
            : options.dropTarget && !_layoutmanager.default.tv && (cssClass += " drop-target full-drop-target"),
          (options.className = cssClass),
          ""),
        columns = ((innerHTML += '<div class="' + options.contentWrapperClass + '">'), options.columns),
        item = {},
        _i3 = 0,
        _length3 = columns.length;
      _i3 < _length3;
      _i3++
    )
      innerHTML += getColumnHtml(item, columns[_i3], options);
    innerHTML += "</div>";
    cssClass = "";
    options.addTabIndex && (cssClass += ' tabindex="0"'),
      options.draggable && (cssClass += ' draggable="true"'),
      options.clickEntireItem,
      (options.fixedAttributes = cssClass.trim()),
      (options.templateInnerHTML = innerHTML);
  }
  function getListViewHtml(items, options) {
    setListOptions(0, options);
    for (var html = "", i = 0, length = items.length; i < length; i++) html += getListItemHtml(items[i], i, options);
    return html;
  }
  _exports.default = {
    getListViewHtml: getListViewHtml,
    getItemsHtml: getListViewHtml,
    setListOptions: setListOptions,
    getItemParts: function (item, index, options) {
      return (options.listItemParts = !0), getListItemHtml(item, index, options);
    },
    buildItems: function (items, options) {
      var itemsContainer = options.itemsContainer;
      if (document.body.contains(itemsContainer)) {
        var parentContainer = options.parentContainer;
        if (parentContainer) {
          if (!items.length) return void parentContainer.classList.add("hide");
          parentContainer.classList.remove("hide");
        }
        parentContainer = getListViewHtml(items, options);
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
    virtualChunkSize: 30,
    setListClasses: function (elem) {
      (elem = elem.classList).remove("vertical-wrap"), elem.add("vertical-list");
    },
    renderHeader: function (itemsContainer, headerElement, options) {
      headerElement.classList.add("dataGridHeader"),
        options.enableScrollX && headerElement.classList.add("scrollX", "hiddenScrollX");
      for (
        var contentAttr = "",
          html =
            (html = "") +
            "<div" +
            (contentAttr = options.enableScrollX ? ' style="width:' + options.scrollXWidth + 'ch;"' : contentAttr) +
            ' class="dataGridHeader-content padded-left padded-right ' +
            options.dataGridItemContentClass +
            '"><div class="dataGridHeader-content-inner">',
          columns =
            (!_layoutmanager.default.tv &&
              !1 !== options.hoverPlayButton &&
              (html += getColumnHtml(null, {type: "button", id: "Play"}, options, !0)),
            options.columns),
          i = 0,
          length = columns.length;
        i < length;
        i++
      )
        html += getColumnHtml(null, columns[i], options, !0);
      headerElement.innerHTML = html = html + "</div>" + "</div>";
    },
    onMultiSelectActive: function (itemsContainer, header) {
      header && header.classList.add("multi-select-active");
    },
    onMultiSelectInactive: function (itemsContainer, header) {
      header && header.classList.remove("multi-select-active");
    },
  };
});
