define([
  "exports",
  "./../emby-apiclient/connectionmanager.js",
  "./../dialoghelper/dialoghelper.js",
  "./../layoutmanager.js",
  "./../common/globalize.js",
  "./../common/datetime.js",
  "./../common/textencoding.js",
  "./../loading/loading.js",
  "./../focusmanager.js",
  "./../common/servicelocator.js",
  "./../emby-elements/emby-checkbox/emby-checkbox.js",
  "./../emby-elements/emby-input/emby-input.js",
  "./../emby-elements/emby-select/emby-select.js",
  "./../emby-elements/emby-textarea/emby-textarea.js",
  "./../emby-elements/emby-button/emby-button.js",
  "./../emby-elements/emby-button/paper-icon-button-light.js",
  "./../emby-elements/emby-scroller/emby-scroller.js",
], function (
  _exports,
  _connectionmanager,
  _dialoghelper,
  _layoutmanager,
  _globalize,
  _datetime,
  _textencoding,
  _loading,
  _focusmanager,
  _servicelocator,
  _embyCheckbox,
  _embyInput,
  _embySelect,
  _embyTextarea,
  _embyButton,
  _paperIconButtonLight,
  _embyScroller
) {
  var currentContext, metadataEditorInfo, currentItem, hasChanges;
  function closeDialog() {
    currentContext.classList.contains("dialog") && _dialoghelper.default.close(currentContext);
  }
  function submitUpdatedItem(form, item) {
    var apiClient = getApiClient();
    !(function (form, item, apiClient) {
      if ("TvChannel" !== (item = currentItem).Type) return Promise.resolve();
      var providerId = form.querySelector(".selectGuideDataProvider").value || null,
        form = form.querySelector(".selectGuideChannel").value || null;
      return providerId === item.ListingsProviderId && form === item.ListingsChannelId
        ? Promise.resolve()
        : apiClient.ajax({
            type: "POST",
            url: apiClient.getUrl("LiveTv/ChannelMappings"),
            data: {providerId: providerId, tunerChannelId: item.ManagementId, providerChannelId: form},
            dataType: "json",
          });
    })(form, 0, apiClient).then(function () {
      apiClient.updateItem(item).then(function () {
        (hasChanges = !0),
          require(["toast"], function (toast) {
            toast(_globalize.default.translate("MessageItemSaved"));
          }),
          _loading.default.hide(),
          closeDialog();
      });
    });
  }
  function onSubmit(e) {
    _loading.default.show();
    var item = {
        Id: currentItem.Id,
        Name: this.querySelector(".txtName").value,
        ChannelNumber: this.querySelector(".txtChannelNumber").value,
        OriginalTitle: this.querySelector(".txtOriginalName").value,
        ForcedSortName: this.querySelector(".txtSortName").value,
        SortName: this.querySelector(".txtSortName").value,
        CommunityRating: this.querySelector("#txtCommunityRating").value,
        CriticRating: this.querySelector("#txtCriticRating").value,
        IndexNumber: this.querySelector("#txtIndexNumber").value || null,
        ParentIndexNumber: this.querySelector("#txtParentIndexNumber").value || null,
        SortParentIndexNumber: this.querySelector(".txtDisplaySeason").value,
        SortIndexNumber: this.querySelector(".txtDisplayEpisode").value,
        DisplayOrder: this.querySelector("#selectDisplayOrder").value,
        Album: this.querySelector("#txtAlbum").value,
        AlbumArtists: (function (form) {
          return form
            .querySelector("#txtAlbumArtist")
            .value.trim()
            .split(";")
            .filter(function (s) {
              return 0 < s.length;
            })
            .map(function (a) {
              return {Name: a};
            });
        })(this),
        ArtistItems: (function (form) {
          return form
            .querySelector("#txtArtist")
            .value.trim()
            .split(";")
            .filter(function (s) {
              return 0 < s.length;
            })
            .map(function (a) {
              return {Name: a};
            });
        })(this),
        Overview: this.querySelector("#txtOverview").value,
        Status: this.querySelector("#selectStatus").value,
        Genres: getListValues(this.querySelector("#listGenres")),
        Tags: getListValues(this.querySelector("#listTags")),
        TagItems: getListValues(this.querySelector("#listTags")).map(function (element) {
          return {Name: element};
        }),
        Studios: getListValues(this.querySelector("#listStudios")).map(function (element) {
          return {Name: element};
        }),
        PremiereDate:
          null == (_form$querySelector$v = this.querySelector("#txtPremiereDate").valueAsDateUtc)
            ? void 0
            : _form$querySelector$v.toISOString(),
        DateCreated:
          null == (_form$querySelector$v = this.querySelector("#txtDateAdded").valueAsDateUtc)
            ? void 0
            : _form$querySelector$v.toISOString(),
        EndDate:
          null == (_form$querySelector$v = this.querySelector("#txtEndDate").valueAsDateUtc)
            ? void 0
            : _form$querySelector$v.toISOString(),
        ProductionYear: this.querySelector("#txtProductionYear").value,
        Video3DFormat: this.querySelector("#select3dFormat").value,
        OfficialRating: this.querySelector("#selectOfficialRating").value,
        CustomRating: this.querySelector("#selectCustomRating").value,
        People: currentItem.People,
        LockData: this.querySelector(".chkLockData").checked,
        LockedFields: Array.prototype.filter
          .call(this.querySelectorAll(".chkLockedField"), function (c) {
            return c.checked;
          })
          .map(function (c) {
            return c.getAttribute("data-field");
          }),
      },
      _form$querySelector$v =
        ((item.ProviderIds = Object.assign({}, currentItem.ProviderIds)), this.querySelectorAll(".txtExternalId")),
      _form$querySelector$v =
        (Array.prototype.map.call(_form$querySelector$v, function (idElem) {
          var providerKey = idElem.getAttribute("data-providerkey");
          item.ProviderIds[providerKey] = idElem.value;
        }),
        (item.PreferredMetadataLanguage = this.querySelector("#selectLanguage").value),
        (item.PreferredMetadataCountryCode = this.querySelector("#selectCountry").value),
        "Person" === currentItem.Type &&
          ((_form$querySelector$v = this.querySelector("#txtPlaceOfBirth").value),
          (item.ProductionLocations = _form$querySelector$v ? [_form$querySelector$v] : [])),
        "Series" === currentItem.Type &&
          ((_form$querySelector$v = this.querySelector("#txtSeriesRuntime").value),
          (item.RunTimeTicks = _form$querySelector$v ? 6e8 * _form$querySelector$v : null)),
        this.querySelector("#txtTagline").value);
    return (
      (item.Taglines = _form$querySelector$v ? [_form$querySelector$v] : []),
      submitUpdatedItem(this, item),
      e.preventDefault(),
      e.stopPropagation(),
      !1
    );
  }
  function getListValues(list) {
    return Array.prototype.map.call(list.querySelectorAll(".textValue"), function (el) {
      return el.textContent;
    });
  }
  function editPerson(context, person, index) {
    require(["personEditor"], function (personEditor) {
      personEditor.show(person).then(function (updatedPerson) {
        -1 === index && currentItem.People.push(updatedPerson), populatePeople(context, currentItem.People);
        updatedPerson = context.querySelector('.chkLockedField[data-field="People"]');
        updatedPerson && (updatedPerson.checked = !0);
      });
    });
  }
  function onRejected() {}
  function showMoreMenu(context, button, user) {
    require(["itemContextMenu"], function (itemContextMenu) {
      var item = currentItem;
      itemContextMenu
        .show({
          item: item,
          positionTo: button,
          edit: !1,
          editImages: !0,
          editSubtitles: !0,
          sync: !1,
          share: !1,
          play: !1,
          queue: !1,
          user: user,
        })
        .then(function (result) {
          result.deleted
            ? (function (context, item) {
                var parentId = item.ParentId || item.SeasonId || item.SeriesId;
                parentId
                  ? reload(context, parentId, item.ServerId)
                  : require(["appRouter"], function (appRouter) {
                      appRouter.goHome();
                    });
              })(context, item)
            : result.updated && reload(context, item.Id, item.ServerId);
        }, onRejected);
    });
  }
  function onEditorClick(e) {
    var chkLockedField,
      btnRemoveFromEditorList = e.target.closest(".btnRemoveFromEditorList");
    if (btnRemoveFromEditorList)
      return (
        (chkLockedField = btnRemoveFromEditorList
          .closest(".editableListviewContainer")
          .querySelector(".chkLockedField")) && (chkLockedField.checked = !0),
        (chkLockedField = (chkLockedField = btnRemoveFromEditorList).closest(".listItem")).parentNode.removeChild(
          chkLockedField
        ),
        void e.stopPropagation()
      );
    btnRemoveFromEditorList = e.target.closest(".btnAddTextItem");
    btnRemoveFromEditorList &&
      !(function (source, sortCallback) {
        require(["prompt"], function (prompt) {
          prompt({label: "添加条目："}).then(function (text) {
            var container = source.closest(".editableListviewContainer"),
              list = container.querySelector(".editorList"),
              items = getListValues(list),
              text =
                (items.push(text),
                populateListView(list, items, sortCallback),
                container.querySelector(".chkLockedField"));
            text && (text.checked = !0);
          });
        });
      })(btnRemoveFromEditorList);
  }
  function getApiClient() {
    return _connectionmanager.default.getApiClient(currentItem.ServerId);
  }
  function onGuideDataProviderChange(e) {
    var apiClient,
      section = this.closest(".channelMappingSection"),
      value = this.value;
    value && "none" !== value && "tuner" !== value
      ? (section.querySelector(".fldGuideChannelId").classList.remove("hide"),
        (apiClient = _connectionmanager.default.getApiClient(currentItem)),
        (function (context, item, listingsProviderId, apiClient) {
          apiClient
            .getJSON(apiClient.getUrl("LiveTv/ChannelMappingOptions", {ProviderId: listingsProviderId}))
            .then(function (result) {
              !(function (context, item, channels) {
                (context = context.querySelector(".selectGuideChannel")),
                  (channels = channels
                    .map(function (i) {
                      return '<option value="' + i.Id + '">' + i.Name.trim() + "</option>";
                    })
                    .join(""));
                (context.innerHTML = channels), (context.value = item.ListingsChannelId);
              })(context, item, result.ProviderChannels);
            });
        })(section, currentItem, value, apiClient))
      : section.querySelector(".fldGuideChannelId").classList.add("hide");
  }
  function onFieldInput(e) {
    var container = this.closest(".inputContainer,.selectContainer").parentNode.closest(".inputContainer");
    container && (container.querySelector(".chkLockedField").checked = !0);
  }
  function init(context) {
    context.querySelector(".externalIds").addEventListener("click", function (e) {
      var formatString,
        e = e.target.closest(".btnOpenExternalId");
      e &&
        ((formatString = (e = context.querySelector("#" + e.getAttribute("data-fieldid"))).getAttribute(
          "data-formatstring"
        )),
        e.value && _servicelocator.shell.openUrl(formatString.replace("{0}", e.value)));
    }),
      context.querySelector(".btnCancel").addEventListener("click", function () {
        closeDialog();
      }),
      context.querySelector(".btnMore").addEventListener("click", function (e) {
        getApiClient()
          .getCurrentUser()
          .then(function (user) {
            showMoreMenu(context, e.target, user);
          });
      }),
      context.querySelector(".selectGuideDataProvider").addEventListener("change", onGuideDataProviderChange),
      context.querySelector(".btnHeaderSave").addEventListener("click", function (e) {
        context.querySelector(".btnSave").click();
      }),
      context.removeEventListener("click", onEditorClick),
      context.addEventListener("click", onEditorClick);
    var form = context.querySelector("form");
    form.removeEventListener("submit", onSubmit),
      form.addEventListener("submit", onSubmit),
      context.querySelector("#btnAddPerson").addEventListener("click", function (event, data) {
        editPerson(context, {}, -1);
      }),
      context.querySelector("#peopleList").addEventListener("click", function (e) {
        var index,
          btnDeletePerson = e.target.closest(".btnDeletePerson"),
          btnDeletePerson =
            (btnDeletePerson &&
              ((index = parseInt(btnDeletePerson.getAttribute("data-index"))),
              currentItem.People.splice(index, 1),
              populatePeople(context, currentItem.People),
              (btnDeletePerson = context.querySelector('.chkLockedField[data-field="People"]')) &&
                (btnDeletePerson.checked = !0),
              e.stopPropagation()),
            e.target.closest(".btnEditPerson"));
        btnDeletePerson &&
          ((index = parseInt(btnDeletePerson.getAttribute("data-index"))),
          editPerson(context, currentItem.People[index], index));
      }),
      (function (context) {
        for (
          var elems = context.querySelectorAll(".txtInput-withlockedfield, .select-withlockedfield"),
            i = 0,
            length = elems.length;
          i < length;
          i++
        ) {
          var elem = elems[i];
          "SELECT" === elem.tagName
            ? elem.addEventListener("change", onFieldInput)
            : elem.addEventListener("input", onFieldInput);
        }
      })(context);
  }
  function loadExternalIds(context, item, externalIds) {
    for (
      var html = "",
        providerIds = item.ProviderIds || {},
        keys = Object.keys(providerIds),
        i = 0,
        length = externalIds.length;
      i < length;
      i++
    ) {
      var idInfo = externalIds[i],
        id = "txt1" + idInfo.Key,
        formatString = idInfo.UrlFormatString || "",
        labelText = _globalize.default.translate("LabelDynamicExternalId").replace("{0}", idInfo.Name),
        value =
          ((html = html + '<div class="inputContainer">' + '<div class="flex align-items-center">'),
          providerIds[
            (function (keys, key) {
              var keyLower = key.toLowerCase();
              return (
                keys.filter(function (k) {
                  return k.toLowerCase() === keyLower;
                })[0] || key
              );
            })(keys, idInfo.Key)
          ] || ""),
        html =
          (html += '<div class="flex-grow">') +
          ('<input is="emby-input" class="txtExternalId" value="' +
            value +
            '" data-providerkey="' +
            idInfo.Key +
            '" data-formatstring="' +
            formatString +
            '" id="' +
            id +
            '" label="' +
            labelText +
            '"/>') +
          "</div>";
      formatString &&
        (html +=
          '<button type="button" is="paper-icon-button-light" class="btnOpenExternalId align-self-flex-end md-icon" data-fieldid="' +
          id +
          '">open_in_browser</button>'),
        (html = html + "</div>" + "</div>");
    }
    (context.querySelector(".externalIds", context).innerHTML = html),
      externalIds.length
        ? context.querySelector(".externalIdsSection").classList.remove("hide")
        : context.querySelector(".externalIdsSection").classList.add("hide");
  }
  function hideElement(selector, context, multiple) {
    (context = context || document),
      "string" == typeof selector
        ? ((multiple = multiple ? context.querySelectorAll(selector) : [context.querySelector(selector)]),
          Array.prototype.forEach.call(multiple, function (el) {
            el && el.classList.add("hide");
          }))
        : selector.classList.add("hide");
  }
  function showElement(selector, context, multiple) {
    (context = context || document),
      "string" == typeof selector
        ? ((multiple = multiple ? context.querySelectorAll(selector) : [context.querySelector(selector)]),
          Array.prototype.forEach.call(multiple, function (el) {
            el && el.classList.remove("hide");
          }))
        : selector.classList.remove("hide");
  }
  function setRequired(elem, required) {
    required ? elem.setAttribute("required", "required") : elem.removeAttribute("required");
  }
  function fillItemInfo(context, item, apiClient, parentalRatingOptions) {
    var select = context.querySelector("#selectOfficialRating"),
      parentalRatingOptions =
        (populateRatings(parentalRatingOptions, select, item.OfficialRating),
        (select.value = item.OfficialRating || ""),
        populateRatings(
          parentalRatingOptions,
          (select = context.querySelector("#selectCustomRating")),
          item.CustomRating
        ),
        (select.value = item.CustomRating || ""),
        context.querySelector("#selectStatus")),
      select =
        (!(function (select) {
          var html = "";
          (html =
            (html =
              (html += "<option value=''></option>") +
              "<option value='Continuing'>" +
              _globalize.default.translate("Continuing") +
              "</option>") +
            "<option value='Ended'>" +
            _globalize.default.translate("Ended") +
            "</option>"),
            (select.innerHTML = html);
        })(parentalRatingOptions),
        (parentalRatingOptions.value = item.Status || ""),
        (context.querySelector("#select3dFormat", context).value = item.Video3DFormat || ""),
        populateListView(context.querySelector("#listGenres"), item.Genres),
        populatePeople(context, item.People || []),
        populateListView(
          context.querySelector("#listStudios"),
          (item.Studios || []).map(function (element) {
            return element.Name || "";
          })
        ),
        item.TagItems
          ? populateListView(
              context.querySelector("#listTags"),
              item.TagItems.map(function (element) {
                return element.Name || "";
              })
            )
          : populateListView(context.querySelector("#listTags"), item.Tags),
        item.LockData || !1);
    if (
      ((context.querySelector(".chkLockData").checked = select),
      (context.querySelector(".txtPath").innerHTML = item.Path || ""),
      (context.querySelector(".txtName").value = item.Name || ""),
      (context.querySelector(".txtChannelNumber").value = item.ChannelNumber || ""),
      (context.querySelector(".txtOriginalName").value = item.OriginalTitle || ""),
      (context.querySelector("#txtOverview").value = item.Overview || ""),
      (context.querySelector("#txtTagline").value = item.Taglines && item.Taglines.length ? item.Taglines[0] : ""),
      apiClient.isMinServerVersion("4.7.0.8")
        ? (context.querySelector(".txtSortName").value = item.SortName || "")
        : (context.querySelector(".txtSortName").value = item.ForcedSortName || ""),
      (context.querySelector("#txtCommunityRating").value = item.CommunityRating || ""),
      (context.querySelector("#txtCriticRating").value = item.CriticRating || ""),
      (context.querySelector("#txtIndexNumber").value = null == item.IndexNumber ? "" : item.IndexNumber),
      (context.querySelector("#txtParentIndexNumber").value =
        null == item.ParentIndexNumber ? "" : item.ParentIndexNumber),
      (context.querySelector(".txtDisplaySeason").value =
        "SortParentIndexNumber" in item ? item.SortParentIndexNumber : ""),
      (context.querySelector(".txtDisplayEpisode").value = "SortIndexNumber" in item ? item.SortIndexNumber : ""),
      (context.querySelector("#txtAlbum").value = item.Album || ""),
      (context.querySelector("#txtAlbumArtist").value = (item.AlbumArtists || [])
        .map(function (a) {
          return a.Name;
        })
        .join(";")),
      "Series" === item.Type
        ? (context.querySelector("#selectDisplayOrder").value = (item.DisplayOrder || "").toLowerCase())
        : (context.querySelector("#selectDisplayOrder").value = item.DisplayOrder || ""),
      (context.querySelector("#txtArtist").value = (item.ArtistItems || [])
        .map(function (a) {
          return a.Name;
        })
        .join(";")),
      item.DateCreated)
    )
      try {
        context.querySelector("#txtDateAdded").valueAsNumberUtc = Date.parse(item.DateCreated);
      } catch (e) {
        context.querySelector("#txtDateAdded").value = "";
      }
    else context.querySelector("#txtDateAdded").value = "";
    if (item.PremiereDate)
      try {
        context.querySelector("#txtPremiereDate").valueAsNumberUtc = Date.parse(item.PremiereDate);
      } catch (e) {
        context.querySelector("#txtPremiereDate").value = "";
      }
    else context.querySelector("#txtPremiereDate").value = "";
    if (item.EndDate)
      try {
        context.querySelector("#txtEndDate").valueAsNumberUtc = Date.parse(item.EndDate);
      } catch (e) {
        context.querySelector("#txtEndDate").value = "";
      }
    else context.querySelector("#txtEndDate").value = "";
    context.querySelector("#txtProductionYear").value = item.ProductionYear || "";
    parentalRatingOptions =
      item.ProductionLocations && item.ProductionLocations.length ? item.ProductionLocations[0] : "";
    (context.querySelector("#txtPlaceOfBirth").value = parentalRatingOptions),
      (context.querySelector("#selectLanguage").value = item.PreferredMetadataLanguage || ""),
      (context.querySelector("#selectCountry").value = item.PreferredMetadataCountryCode || ""),
      item.RunTimeTicks
        ? ((select = item.RunTimeTicks / 6e8), (context.querySelector("#txtSeriesRuntime").value = Math.round(select)))
        : (context.querySelector("#txtSeriesRuntime", context).value = "");
  }
  function fillChannelMapping(context, item, apiClient) {
    apiClient.getJSON(apiClient.getUrl("LiveTv/ListingProviders", {ChannelId: item.Id})).then(function (result) {
      result.length
        ? context.querySelector(".channelMappingSection").classList.remove("hide")
        : context.querySelector(".channelMappingSection").classList.add("hide"),
        (function (context, item, providers) {
          (context = context.querySelector(".selectGuideDataProvider")),
            providers.push({Name: _globalize.default.translate("None"), Id: "none"}),
            (providers = providers
              .map(function (i) {
                return (
                  '<option value="' +
                  i.Id +
                  '">' +
                  i.Name +
                  " " +
                  _textencoding.default.htmlEncode(i.ListingsId || i.Path || "").trim() +
                  "</option>"
                );
              })
              .join("")),
            (context.innerHTML = providers),
            (context.value = item.ListingsProviderId),
            onGuideDataProviderChange.call(context);
        })(context, item, result);
    });
  }
  function populateRatings(allParentalRatings, select, currentValue) {
    for (
      var rating,
        html = "",
        ratings = ((html += "<option value=''></option>"), []),
        currentValueFound = !1,
        i = 0,
        length = allParentalRatings.length;
      i < length;
      i++
    )
      (rating = allParentalRatings[i]),
        ratings.push({Name: rating.Name, Value: rating.Name}),
        rating.Name === currentValue && (currentValueFound = !0);
    for (
      currentValue && !currentValueFound && ratings.push({Name: currentValue, Value: currentValue}),
        i = 0,
        length = ratings.length;
      i < length;
      i++
    )
      html += "<option value='" + (rating = ratings[i]).Value + "'>" + rating.Name + "</option>";
    select.innerHTML = html;
  }
  function populateListView(list, items, sortCallback) {
    (items = items || []),
      void 0 === sortCallback
        ? items.sort(function (a, b) {
            return a.toLowerCase().localeCompare(b.toLowerCase());
          })
        : (items = sortCallback(items));
    for (var html = "", i = 0; i < items.length; i++)
      html =
        (html =
          (html +=
            '<div class="listItem listItem-border"><div class="listItemBody listItemBody-noleftpadding"><div class="textValue">') +
          items[i] +
          "</div></div>") +
        '<button type="button" is="paper-icon-button-light" data-index="' +
        i +
        '" class="btnRemoveFromEditorList md-icon">delete</button></div>';
    list.innerHTML = html;
  }
  function populatePeople(context, people) {
    for (
      var html = "", context = context.querySelector("#peopleList"), i = 0, length = people.length;
      i < length;
      i++
    ) {
      var person = people[i],
        html =
          (html =
            (html += '<div class="listItem listItem-border">') +
            ('<button is="emby-button" style="color:inherit;" type="button" class="listItemBody btnEditPerson button-link" data-index="' +
              i +
              '">') +
            '<div class="listItemBodyText textValue">') +
          (person.Name || "") +
          "</div>";
      person.Role &&
        "" !== person.Role &&
        (html += '<div class="listItemBodyText-secondary">' + person.Role + "</div>"),
        (html =
          (html += "</button>") +
          ('<button type="button" is="paper-icon-button-light" data-index="' +
            i +
            '" class="btnDeletePerson md-icon">delete</button>') +
          "</div>");
    }
    context.innerHTML = html;
  }
  function reload(context, itemId, serverId) {
    _loading.default.show(),
      Promise.all([
        (function (itemId, serverId) {
          return (
            (serverId = _connectionmanager.default.getApiClient(serverId)),
            itemId
              ? serverId.getItem(serverId.getCurrentUserId(), itemId, {Fields: "ChannelMappingInfo"})
              : serverId.getRootFolder(serverId.getCurrentUserId())
          );
        })(itemId, serverId),
        (function (itemId, serverId) {
          return (
            (serverId = _connectionmanager.default.getApiClient(serverId)),
            itemId ? serverId.getJSON(serverId.getUrl("Items/" + itemId + "/MetadataEditor")) : Promise.resolve({})
          );
        })(itemId, serverId),
      ]).then(function (responses) {
        var item = responses[0],
          responses =
            ((metadataEditorInfo = responses[1]), (currentItem = item), (hasChanges = !1), metadataEditorInfo.Cultures),
          countries = metadataEditorInfo.Countries,
          responses =
            (loadExternalIds(context, item, metadataEditorInfo.ExternalIdInfos),
            !(function (context, item) {
              for (
                var elems = context.querySelectorAll(".chkLockedField"), i = 0, length = elems.length;
                i < length;
                i++
              ) {
                var elem = elems[i];
                elem.checked = item.LockedFields.includes(elem.getAttribute("data-field"));
              }
            })(context, item),
            !(function (select, languages) {
              var html = "";
              html += "<option value=''></option>";
              for (var i = 0, length = languages.length; i < length; i++) {
                var culture = languages[i];
                html += "<option value='" + culture.TwoLetterISOLanguageName + "'>" + culture.DisplayName + "</option>";
              }
              select.innerHTML = html;
            })(context.querySelector("#selectLanguage"), responses),
            context.querySelector("#selectCountry")),
          allCountries = countries,
          html = "";
        html += "<option value=''></option>";
        for (var i = 0, length = allCountries.length; i < length; i++) {
          var culture = allCountries[i];
          html += "<option value='" + culture.TwoLetterISORegionName + "'>" + culture.DisplayName + "</option>";
        }
        responses.innerHTML = html;
        countries = _connectionmanager.default.getApiClient(item);
        !(function (context, item, apiClient) {
          (item.Path ? showElement : hideElement)("#fldPath", context),
            ("Series" === item.Type || "Movie" === item.Type || "Trailer" === item.Type ? showElement : hideElement)(
              ".fldOriginalName",
              context
            ),
            "Audio" === item.Type
              ? (hideElement(".fldSortName", context), setRequired(context.querySelector(".txtSortName"), !1))
              : (showElement(".fldSortName", context),
                setRequired(context.querySelector(".txtSortName"), apiClient.isMinServerVersion("4.7.0.9"))),
            ("Series" === item.Type ? showElement : hideElement)("#fldSeriesRuntime", context),
            ("Series" === item.Type || "Person" === item.Type ? showElement : hideElement)("#fldEndDate", context),
            ("MusicAlbum" === item.Type ? showElement : hideElement)("#albumAssociationMessage", context),
            ("Movie" === item.Type || "Trailer" === item.Type || "Series" === item.Type ? showElement : hideElement)(
              "#fldCriticRating",
              context
            ),
            ("Series" === item.Type ? showElement : hideElement)("#fldStatus", context),
            ("Video" === item.MediaType && "TvChannel" !== item.Type ? showElement : hideElement)(
              "#fld3dFormat",
              context
            ),
            ("Audio" === item.Type ? showElement : hideElement)("#fldAlbumArtist", context),
            ("TvChannel" === item.Type ? showElement : hideElement)(".fldChannelNumber", context),
            "Audio" === item.Type || "MusicVideo" === item.Type
              ? (showElement("#fldArtist", context), showElement("#fldAlbum", context))
              : (hideElement("#fldArtist", context), hideElement("#fldAlbum", context)),
            ("Episode" === item.Type && 0 === item.ParentIndexNumber ? showElement : hideElement)(
              "#collapsibleSpecialEpisodeInfo",
              context
            ),
            ("Person" === item.Type ||
              "Genre" === item.Type ||
              "Studio" === item.Type ||
              "GameGenre" === item.Type ||
              "MusicGenre" === item.Type ||
              "TvChannel" === item.Type ||
              "Book" === item.Type ||
              "MusicArtist" === item.Type ||
              "Channel" === item.Type ||
              "TvChannel" === item.Type ||
              "Folder" === item.Type
              ? hideElement
              : showElement)("#peopleCollapsible", context),
            "Person" === item.Type ||
            "Genre" === item.Type ||
            "Studio" === item.Type ||
            "GameGenre" === item.Type ||
            "MusicGenre" === item.Type ||
            "TvChannel" === item.Type ||
            "Folder" === item.Type
              ? (hideElement("#fldCommunityRating", context),
                hideElement("#genresCollapsible", context),
                hideElement("#studiosCollapsible", context),
                ("TvChannel" === item.Type ? showElement : hideElement)("#fldOfficialRating", context),
                hideElement("#fldCustomRating", context))
              : (showElement("#fldCommunityRating", context),
                showElement("#genresCollapsible", context),
                showElement("#studiosCollapsible", context),
                showElement("#fldOfficialRating", context),
                showElement("#fldCustomRating", context)),
            ("Folder" === item.Type ? hideElement : showElement)("#tagsCollapsible", context),
            "TvChannel" === item.Type
              ? (hideElement("#metadataSettingsCollapsible", context), hideElement("#fldDateAdded", context))
              : (showElement("#metadataSettingsCollapsible", context), showElement("#fldDateAdded", context)),
            "TvChannel" === item.Type || "Folder" === item.Type
              ? (hideElement("#fldPremiereDate", context), hideElement("#fldYear", context))
              : (showElement("#fldPremiereDate", context), showElement("#fldYear", context)),
            ("TvChannel" === item.Type || "Folder" === item.Type ? hideElement : showElement)(
              ".overviewContainer",
              context
            ),
            "Person" === item.Type
              ? (context.querySelector("#txtProductionYear").label(_globalize.default.translate("LabelBirthYear")),
                context.querySelector("#txtPremiereDate").label(_globalize.default.translate("LabelBirthDate")),
                context.querySelector("#txtEndDate").label(_globalize.default.translate("LabelDeathDate")),
                showElement("#fldPlaceOfBirth"))
              : (context.querySelector("#txtProductionYear").label(_globalize.default.translate("LabelYear")),
                context.querySelector("#txtPremiereDate").label(_globalize.default.translate("LabelReleaseDate")),
                context.querySelector("#txtEndDate").label(_globalize.default.translate("LabelEndDate")),
                hideElement("#fldPlaceOfBirth")),
            "Audio" === item.Type || "Episode" === item.Type || "Season" === item.Type
              ? (showElement("#fldIndexNumber"),
                "Episode" === item.Type
                  ? context.querySelector("#txtIndexNumber").label(_globalize.default.translate("LabelEpisodeNumber"))
                  : "Season" === item.Type
                  ? context.querySelector("#txtIndexNumber").label(_globalize.default.translate("LabelSeasonNumber"))
                  : "Audio" === item.Type
                  ? context.querySelector("#txtIndexNumber").label(_globalize.default.translate("LabelTrackNumber"))
                  : context.querySelector("#txtIndexNumber").label(_globalize.default.translate("LabelNumber")))
              : hideElement("#fldIndexNumber"),
            "Audio" === item.Type || "Episode" === item.Type
              ? (showElement("#fldParentIndexNumber"),
                "Episode" === item.Type
                  ? context
                      .querySelector("#txtParentIndexNumber")
                      .label(_globalize.default.translate("LabelSeasonNumber"))
                  : "Audio" === item.Type
                  ? context
                      .querySelector("#txtParentIndexNumber")
                      .label(_globalize.default.translate("LabelDiscNumber"))
                  : context
                      .querySelector("#txtParentIndexNumber")
                      .label(_globalize.default.translate("LabelParentNumber")))
              : hideElement("#fldParentIndexNumber", context),
            "BoxSet" === item.Type
              ? (showElement("#fldDisplayOrder", context),
                hideElement(".seriesDisplayOrderDescription", context),
                (context.querySelector("#selectDisplayOrder").innerHTML =
                  '<option value="SortName">' +
                  _globalize.default.translate("SortName") +
                  '</option><option value="PremiereDate">' +
                  _globalize.default.translate("ReleaseDate") +
                  "</option>"))
              : "Series" === item.Type
              ? (showElement("#fldDisplayOrder", context),
                showElement(".seriesDisplayOrderDescription", context),
                (context.querySelector("#selectDisplayOrder").innerHTML =
                  '<option value="aired">' +
                  _globalize.default.translate("Aired") +
                  '</option><option value="absolute">' +
                  _globalize.default.translate("Absolute") +
                  '</option><option value="dvd">Dvd</option>'))
              : ((context.querySelector("#selectDisplayOrder").innerHTML = ""),
                hideElement("#fldDisplayOrder", context));
        })(context, item, countries),
          "TvChannel" === item.Type && fillChannelMapping(context, item, countries),
          fillItemInfo(context, item, countries, metadataEditorInfo.ParentalRatingOptions),
          (("Video" === item.MediaType && "Episode" !== item.Type && "TvChannel" !== item.Type) ||
            "Series" === item.Type ||
            "Game" === item.Type
            ? showElement
            : hideElement)("#fldTagline", context),
          _loading.default.hide();
      });
  }
  function show(itemId, serverId, resolve, reject) {
    _loading.default.show(),
      require(["text!modules/metadataeditor/metadataeditor.template.html"], function (template) {
        var dialogOptions = {removeOnClose: !0, scrollY: !1},
          dialogOptions =
            (_layoutmanager.default.tv ? (dialogOptions.size = "fullscreen") : (dialogOptions.size = "medium-tall"),
            _dialoghelper.default.createDialog(dialogOptions)),
          html = (dialogOptions.classList.add("formDialog"), "");
        (html += _globalize.default.translateDocument(template, "sharedcomponents")), (dialogOptions.innerHTML = html);
        for (var elems = dialogOptions.querySelectorAll(".dayText"), date = new Date(); 0 < date.getDay(); )
          date.setDate(date.getDate() - 1);
        for (var i = 0, length = elems.length; i < length; i++)
          (elems[i].innerHTML = _datetime.default.toLocaleDateString(date, {weekday: "long"})),
            date.setDate(date.getDate() + 1);
        _dialoghelper.default.open(dialogOptions),
          dialogOptions.addEventListener("close", function () {
            (hasChanges ? resolve : reject)();
          }),
          init((currentContext = dialogOptions), _connectionmanager.default.getApiClient(serverId)),
          reload(dialogOptions, itemId, serverId);
      });
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["listViewStyle", "formDialogStyle", "flexStyles", "css!modules/metadataeditor/metadataeditor"]),
    (_exports.default = {
      show: function (itemId, serverId) {
        return new Promise(function (resolve, reject) {
          return show(itemId, serverId, resolve, reject);
        });
      },
      embed: function (elem, itemId, serverId) {
        return new Promise(function (resolve, reject) {
          _loading.default.show(),
            require(["text!modules/metadataeditor/metadataeditor.template.html"], function (template) {
              (elem.innerHTML = _globalize.default.translateDocument(template, "sharedcomponents")),
                elem.querySelector(".formDialogFooter").classList.remove("formDialogFooter"),
                elem.querySelector(".btnHeaderSave").classList.remove("hide"),
                elem.querySelector(".btnCancel").classList.add("hide"),
                init((currentContext = elem), _connectionmanager.default.getApiClient(serverId)),
                reload(elem, itemId, serverId),
                _layoutmanager.default.tv && _focusmanager.default.autoFocus(elem);
            });
        });
      },
    });
});
