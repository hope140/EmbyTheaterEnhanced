define([
  "exports",
  "./../modules/focusmanager.js",
  "./../modules/layoutmanager.js",
  "./../modules/loading/loading.js",
  "./../modules/common/globalize.js",
  "./../modules/emby-elements/emby-input/emby-input.js",
  "./../modules/emby-elements/emby-button/emby-button.js",
  "./../modules/emby-elements/emby-checkbox/emby-checkbox.js",
  "./../modules/emby-elements/emby-select/emby-select.js",
  "./../modules/emby-elements/emby-scroller/emby-scroller.js",
  "./../modules/emby-apiclient/connectionmanager.js",
  "./../modules/emby-apiclient/events.js",
], function (
  _exports,
  _focusmanager,
  _layoutmanager,
  _loading,
  _globalize,
  _embyInput,
  _embyButton,
  _embyCheckbox,
  _embySelect,
  _embyScroller,
  _connectionmanager,
  _events
) {
  function getLandingScreenOptionsHtml(type, userValue) {
    return (function (type) {
      var list = [];
      return (
        "movies" === type
          ? (list.push({name: _globalize.default.translate("Movies"), value: "movies", isDefault: !0}),
            list.push({name: _globalize.default.translate("Suggestions"), value: "suggestions"}),
            list.push({name: _globalize.default.translate("Favorites"), value: "favorites"}),
            list.push({name: _globalize.default.translate("Genres"), value: "genres"}),
            list.push({name: _globalize.default.translate("Collections"), value: "collections"}),
            list.push({name: _globalize.default.translate("Folders"), value: "folders"}))
          : "musicvideos" === type
          ? (list.push({name: _globalize.default.translate("Videos"), value: "videos", isDefault: !0}),
            list.push({name: _globalize.default.translate("Folders"), value: "folders"}))
          : "tvshows" === type
          ? (list.push({name: _globalize.default.translate("Shows"), value: "shows", isDefault: !0}),
            list.push({name: _globalize.default.translate("Suggestions"), value: "suggestions"}),
            list.push({name: _globalize.default.translate("Favorites"), value: "favorites"}),
            list.push({name: _globalize.default.translate("Genres"), value: "genres"}),
            list.push({name: _globalize.default.translate("Folders"), value: "folders"}))
          : "music" === type || "audiobooks" === type
          ? (list.push({name: _globalize.default.translate("Suggestions"), value: "suggestions", isDefault: !0}),
            list.push({name: _globalize.default.translate("Albums"), value: "albums"}),
            list.push({name: _globalize.default.translate("HeaderAlbumArtists"), value: "albumartists"}),
            list.push({name: _globalize.default.translate("Artists"), value: "artists"}),
            list.push({name: _globalize.default.translate("Playlists"), value: "playlists"}),
            list.push({name: _globalize.default.translate("Genres"), value: "genres"}),
            list.push({name: _globalize.default.translate("Folders"), value: "folders"}))
          : "livetv" === type
          ? (list.push({name: _globalize.default.translate("Suggestions"), value: "suggestions", isDefault: !0}),
            list.push({name: _globalize.default.translate("Guide"), value: "guide"}),
            list.push({name: _globalize.default.translate("Channels"), value: "channels"}))
          : "homevideos" === type &&
            (list.push({name: _globalize.default.translate("Videos"), value: "videos"}),
            list.push({name: _globalize.default.translate("Photos"), value: "photos"}),
            list.push({name: _globalize.default.translate("Folders"), value: "folders"})),
        list
      );
    })(type)
      .map(function (o) {
        var selected = userValue === o.value || (o.isDefault && !userValue);
        return (
          '<option value="' +
          (o.isDefault ? "" : o.value) +
          '"' +
          (selected ? " selected" : "") +
          ">" +
          o.name +
          "</option>"
        );
      })
      .join("");
  }
  function renderPerLibrarySettings(context, user, userViews, userSettings) {
    for (
      var context = context.querySelector(".perLibrarySettings"), html = "", i = 0, length = userViews.length;
      i < length;
      i++
    )
      html += (function (item, user, userSettings) {
        var html = "",
          folderId = item.Guid || item.Id;
        return (
          ("Channel" !== item.Type && "boxsets" !== item.CollectionType && "playlists" !== item.CollectionType) ||
            (html =
              (html =
                (html += "<div>") +
                '<label><input type="checkbox" is="emby-checkbox" class="chkIncludeInMyMedia" data-folderid="' +
                folderId +
                '"' +
                (-1 === (user.Configuration.MyMediaExcludes || []).indexOf(folderId) ? ' checked="checked"' : "") +
                "/>") +
              "<span>" +
              _globalize.default.translate("DisplayInMyMedia") +
              "</span></label></div>"),
          (html =
            (html =
              -1 === ["playlists", "livetv", "boxsets", "channels"].indexOf(item.CollectionType || "")
                ? (html =
                    html +
                    '<label class="fldIncludeInLatest"><input type="checkbox" is="emby-checkbox" class="chkIncludeInLatest" data-folderid="' +
                    folderId +
                    '"' +
                    (-1 === user.Configuration.LatestItemsExcludes.indexOf(folderId) ? ' checked="checked"' : "") +
                    "/>") +
                  "<span>" +
                  _globalize.default.translate("DisplayInOtherHomeScreenSections") +
                  "</span></label>"
                : html) && '<div class="checkboxListContainer">' + html + "</div>"),
          ("movies" !== item.CollectionType &&
            "tvshows" !== item.CollectionType &&
            "musicvideos" !== item.CollectionType &&
            "music" !== item.CollectionType &&
            "audiobooks" !== item.CollectionType &&
            "livetv" !== item.CollectionType &&
            "homevideos" !== item.CollectionType) ||
            ((html =
              (html += '<div class="selectContainer">') +
              '<select is="emby-select" class="selectLanding" data-folderid="' +
              (user = "livetv" === item.CollectionType ? item.CollectionType : folderId) +
              '" label="' +
              _globalize.default.translate("LabelDefaultScreen") +
              '">'),
            (folderId = userSettings.get("landing-" + user)),
            (html = html + getLandingScreenOptionsHtml(item.CollectionType, folderId) + "</select></div>")),
          html &&
            ((html = "" + '<div class="verticalSection">' + '<h2 class="sectionTitle">' + item.Name + "</h2>" + html),
            (html += "</div>")),
          html
        );
      })(userViews[i], user, userSettings);
    context.innerHTML = html;
  }
  function loadForm(context, user, userSettings, apiClient) {
    (context.querySelector(".chkHidePlayedFromLatest").checked = user.Configuration.HidePlayedInLatest || !1),
      (function (context, userSettings) {
        for (var sectionValues = userSettings.getHomeScreenSections(!0), i = 0; i < sectionValues.length; i++) {
          var select = context.querySelector(".selectHomeSection" + i),
            defaultValue = userSettings.getDefaultHomeScreenSection(i),
            option =
              select.querySelector("option[value=" + defaultValue + "]") || select.querySelector('option[value=""]'),
            userValue = sectionValues[i];
          option && (option.value = ""), (select.value = userValue !== defaultValue && userValue ? userValue : "");
        }
        context.querySelector(".selectTVHomeScreen").value = userSettings.get("tvhome") || "";
      })(context, userSettings);
    apiClient = apiClient.getUserViews({IncludeHidden: !0}, user.Id);
    Promise.all([apiClient]).then(function (responses) {
      !(function (context, result) {
        var html = "";
        (html += result.Items.map(function (view) {
          var currentHtml = "",
            currentHtml =
              (currentHtml =
                (currentHtml =
                  (currentHtml =
                    (currentHtml =
                      (currentHtml +=
                        '<div class="listItem listItem-border viewItem" data-viewid="' +
                        (view.Guid || view.Id) +
                        '">') +
                      '<i class="md-icon listItemIcon">&#xE2C8;</i>' +
                      '<div class="listItemBody">') +
                    "<div>" +
                    view.Name) +
                  "</div>" +
                  "</div>") +
                ('<button type="button" is="paper-icon-button-light" class="btnViewItemUp btnViewItemMove autoSize" title="' +
                  _globalize.default.translate("Up") +
                  '" aria-label="' +
                  _globalize.default.translate("Up") +
                  '"><i class="md-icon">&#xE316;</i></button>')) +
              ('<button type="button" is="paper-icon-button-light" class="btnViewItemDown btnViewItemMove autoSize" title="' +
                _globalize.default.translate("Down") +
                '" aria-label="' +
                _globalize.default.translate("Down") +
                '"><i class="md-icon">&#xE313;</i></button>');
          return (currentHtml += "</div>");
        }).join("")),
          (context.querySelector(".viewOrderList").innerHTML = html);
      })(context, responses[0]),
        renderPerLibrarySettings(context, user, responses[0].Items, userSettings),
        _loading.default.hide();
    });
  }
  function onSectionOrderListClick(e) {
    var viewItem,
      e = e.target.closest(".btnViewItemMove");
    e &&
      (viewItem = e.closest(".viewItem")) &&
      (viewItem.closest(".viewOrderList"),
      e.classList.contains("btnViewItemDown")
        ? (e = viewItem.nextElementSibling) &&
          (viewItem.parentNode.removeChild(viewItem), e.parentNode.insertBefore(viewItem, e.nextElementSibling))
        : (e = viewItem.previousElementSibling) &&
          (viewItem.parentNode.removeChild(viewItem), e.parentNode.insertBefore(viewItem, e)));
  }
  function getCheckboxItems(selector, context, isChecked) {
    for (var inputs = context.querySelectorAll(selector), list = [], i = 0, length = inputs.length; i < length; i++)
      inputs[i].checked === isChecked && list.push(inputs[i]);
    return list;
  }
  function save(instance, context, userId, userSettings, apiClient, enableSaveConfirmation) {
    _loading.default.show(),
      apiClient.getUser(userId).then(function (user) {
        !(function (context, user, userSettingsInstance, apiClient) {
          (user.Configuration.HidePlayedInLatest = context.querySelector(".chkHidePlayedFromLatest").checked),
            (user.Configuration.LatestItemsExcludes = getCheckboxItems(".chkIncludeInLatest", context, !1).map(
              function (i) {
                return i.getAttribute("data-folderid");
              }
            )),
            (user.Configuration.MyMediaExcludes = getCheckboxItems(".chkIncludeInMyMedia", context, !1).map(function (
              i
            ) {
              return i.getAttribute("data-folderid");
            }));
          for (
            var viewItems = context.querySelectorAll(".viewItem"), orderedViews = [], i = 0, length = viewItems.length;
            i < length;
            i++
          )
            orderedViews.push(viewItems[i].getAttribute("data-viewid"));
          (user.Configuration.OrderedViews = orderedViews),
            userSettingsInstance.set("tvhome", context.querySelector(".selectTVHomeScreen").value),
            userSettingsInstance.set("homesection0", context.querySelector(".selectHomeSection0").value),
            userSettingsInstance.set("homesection1", context.querySelector(".selectHomeSection1").value),
            userSettingsInstance.set("homesection2", context.querySelector(".selectHomeSection2").value),
            userSettingsInstance.set("homesection3", context.querySelector(".selectHomeSection3").value),
            userSettingsInstance.set("homesection4", context.querySelector(".selectHomeSection4").value),
            userSettingsInstance.set("homesection5", context.querySelector(".selectHomeSection5").value),
            userSettingsInstance.set("homesection6", context.querySelector(".selectHomeSection6").value);
          var selectLandings = context.querySelectorAll(".selectLanding");
          for (i = 0, length = selectLandings.length; i < length; i++) {
            var selectLanding = selectLandings[i];
            userSettingsInstance.set("landing-" + selectLanding.getAttribute("data-folderid"), selectLanding.value);
          }
          return apiClient.updateUserConfiguration(user.Id, user.Configuration);
        })(context, user, userSettings, apiClient).then(
          function () {
            _loading.default.hide(),
              enableSaveConfirmation &&
                require(["toast"], function (toast) {
                  toast(_globalize.default.translate("SettingsSaved"));
                }),
              _events.default.trigger(instance, "saved");
          },
          function () {
            _loading.default.hide();
          }
        );
      });
  }
  function onSubmit(e) {
    var self = this,
      apiClient = _connectionmanager.default.getApiClient(self.options.serverId),
      userId = self.options.userId,
      userSettings = self.options.userSettings;
    return (
      userSettings.setUserInfo(userId, apiClient).then(function () {
        var enableSaveConfirmation = self.options.enableSaveConfirmation;
        save(self, self.options.element, userId, userSettings, apiClient, enableSaveConfirmation);
      }),
      e && e.preventDefault(),
      !1
    );
  }
  function onChange(e) {
    var fldIncludeInLatest,
      e = e.target.closest(".chkIncludeInMyMedia");
    !e ||
      ((fldIncludeInLatest = e.closest(".verticalSection").querySelector(".fldIncludeInLatest")) &&
        (e.checked ? fldIncludeInLatest.classList.remove("hide") : fldIncludeInLatest.classList.add("hide")));
  }
  function HomeScreenSettings(options) {
    !(function (options, self) {
      for (var i = 0; i < 7; i++)
        options.element
          .querySelector(".selectHomeSection" + i)
          .setLabel(_globalize.default.translate("LabelHomeScreenSectionValue", i + 1));
      options.element.querySelector(".viewOrderList").addEventListener("click", onSectionOrderListClick),
        options.element.querySelector("form").addEventListener("submit", onSubmit.bind(self)),
        options.element.addEventListener("change", onChange),
        options.enableSaveButton && options.element.querySelector(".btnSave").classList.remove("hide"),
        _layoutmanager.default.tv
          ? options.element.querySelector(".selectTVHomeScreenContainer").classList.remove("hide")
          : options.element.querySelector(".selectTVHomeScreenContainer").classList.add("hide"),
        self.loadData(options.autoFocus);
    })((this.options = options), this);
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["listViewStyle"]),
    (HomeScreenSettings.prototype.loadData = function (autoFocus) {
      var context = this.options.element,
        userId = (_loading.default.show(), this.options.userId),
        apiClient = _connectionmanager.default.getApiClient(this.options.serverId),
        userSettings = this.options.userSettings;
      !(function (context) {
        for (
          var elems = context.querySelectorAll('option[value="nextup"]'), i = 0, length = elems.length;
          i < length;
          i++
        )
          elems[i].innerHTML = _globalize.default.translate("继续观看") + " (单集显示)";
      })(context),
        apiClient.getUser(userId).then(function (user) {
          (userId === apiClient.getCurrentUserId()
            ? Promise.resolve()
            : userSettings.setUserInfo(userId, apiClient)
          ).then(function () {
            loadForm(context, user, userSettings, apiClient),
              autoFocus && _layoutmanager.default.tv && _focusmanager.default.autoFocus(context);
          });
        });
    }),
    (HomeScreenSettings.prototype.submit = function () {
      onSubmit.call(this);
    }),
    (HomeScreenSettings.prototype.destroy = function () {
      this.options = null;
    }),
    (_exports.default = HomeScreenSettings);
});
