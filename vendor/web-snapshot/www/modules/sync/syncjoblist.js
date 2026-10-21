define([
  "exports",
  "./../layoutmanager.js",
  "./../dom.js",
  "./../common/globalize.js",
  "./../emby-apiclient/connectionmanager.js",
  "./../loading/loading.js",
  "./../emby-apiclient/events.js",
  "./../imageloader/imageloader.js",
  "./../common/input/api.js",
], function (_exports, _layoutmanager, _dom, _globalize, _connectionmanager, _loading, _events, _imageloader, _api) {
  function cancelJob(listInstance, id) {
    require(["confirm"], function (confirm) {
      confirm({text: _globalize.default.translate("ConfirmRemoveDownload"), primary: "cancel"}).then(function () {
        _loading.default.show(),
          getApiClient(listInstance)
            .cancelSyncJob(id)
            .then(function () {
              "download" === listInstance.options.mode &&
                require(["localsync"], function (localSync) {
                  localSync.sync();
                }),
                fetchData(listInstance);
            });
      });
    });
  }
  function refreshJob(listInstance, job) {
    listInstance = listInstance.options.element.querySelector(".listItem[data-id='" + job.Id + "']");
    listInstance && (listInstance.querySelector(".jobStatus").innerHTML = getProgressText(job));
  }
  function getProgressText(job) {
    var status = job.Status,
      status = _globalize.default.translate(
        "SyncJobItemStatus" + (status = "Completed" === status ? "Synced" : status)
      );
    return (status =
      "Transferring" !== job.Status && "Converting" !== job.Status
        ? status
        : (status += " ") + (job = 0 < (job = job.Progress || 0) && job < 100 ? job.toFixed(1) : job) + "%");
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0), require(["listViewStyle"]);
  var supportsNativeLazyLoading = "loading" in HTMLImageElement.prototype;
  function renderList(listInstance, jobs, apiClient) {
    if (Date.now() - listInstance.lastDataLoad < 6e4)
      !(function (listInstance, jobs) {
        for (var i = 0, length = jobs.length; i < length; i++) refreshJob(listInstance, jobs[i]);
      })(listInstance, jobs);
    else {
      listInstance.lastDataLoad = Date.now();
      for (
        var html = "",
          lastTargetName = "",
          mode = listInstance.options.mode,
          showTargetName = "download" !== mode,
          hasOpenSection = !1,
          i = 0,
          length = jobs.length;
        i < length;
        i++
      ) {
        var targetName,
          job = jobs[i];
        !showTargetName ||
          ((targetName = job.TargetName || "Unknown") !== lastTargetName &&
            (lastTargetName && ((html += "</div><br/>"), (hasOpenSection = !1)),
            (html =
              (html += '<div class="verticalSection">') +
              '<div class="sectionTitleContainer"><h2 class="sectionTitle">' +
              (lastTargetName = targetName) +
              '</h2></div><div class="itemsContainer vertical-list">'),
            (hasOpenSection = !0))),
          (html += (function (job, apiClient, mode) {
            var imgUrl,
              html = "",
              tagName = _layoutmanager.default.tv ? "button" : "div",
              listItemClass = "listItem listItem-border",
              textLines =
                (_layoutmanager.default.tv && (listItemClass += " listItem-button listItem-focusscale btnJobMenu"),
                (html +=
                  "<" +
                  tagName +
                  ("button" == tagName ? ' type="button"' : "") +
                  ' class="' +
                  listItemClass +
                  '" data-canedit="' +
                  !0 +
                  '" data-id="' +
                  job.Id +
                  '" data-status="' +
                  job.Status +
                  '">'),
                (html = (imgUrl = job.PrimaryImageItemId
                  ? apiClient.getImageUrl(job.PrimaryImageItemId, {
                      type: "Primary",
                      width: 80,
                      tag: job.PrimaryImageTag,
                    })
                  : imgUrl)
                  ? (html += '<div class="listItemImageContainer">') +
                    (supportsNativeLazyLoading
                      ? '<img class="listItemImage" loading="lazy" src="' + imgUrl + '" />'
                      : '<img class="listItemImage lazy" loading="lazy" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" data-src="' +
                        imgUrl +
                        '" />') +
                    "</div>"
                  : (html += '<div class="listItemImageContainer defaultCardBackground defaultCardBackground0">') +
                    ("convert" === mode
                      ? '<i class="md-icon listItemIcon">transform</i>'
                      : '<i class="md-icon listItemIcon">download</i>') +
                    "</div>"),
                []),
              listItemClass = job.Name;
            job.ParentName && (listItemClass += " - " + job.ParentName),
              textLines.push(listItemClass),
              1 === job.ItemCount
                ? textLines.push(_globalize.default.translate("ValueOneItem"))
                : textLines.push(_globalize.default.translate("ItemCount", job.ItemCount)),
              (html += '<div class="listItemBody three-line">');
            for (var i = 0, length = textLines.length; i < length; i++)
              html =
                0 === i
                  ? (html += '<div class="listItemBodyText">') + textLines[i] + "</div>"
                  : (html += '<div class="listItemBodyText listItemBodyText-secondary">') + textLines[i] + "</div>";
            return (
              (html =
                (html =
                  (html += '<div class="listItemBodyText-secondary listItemBodyText jobStatus">') +
                  getProgressText(job)) +
                "</div>" +
                "</div>"),
              _layoutmanager.default.tv ||
                (html +=
                  '<button type="button" is="paper-icon-button-light" class="btnJobMenu listItemButton"><i class="md-icon">more_horiz</i></button>'),
              (html += "</" + tagName + ">")
            );
          })(job, apiClient, mode));
      }
      hasOpenSection && (html += "</div></div>");
      (listInstance = listInstance.options.element.querySelector(".syncJobListContent")),
        (html =
          html ||
          ("download" === mode
            ? '<div style="padding:1em .25em;">' + _globalize.default.translate("MessageNoDownloadsFound") + "</div>"
            : '<div style="padding:1em .25em;">' + _globalize.default.translate("MessageNoSyncJobsFound") + "</div>"));
      (listInstance.innerHTML = html), _imageloader.default.lazyChildren(listInstance);
    }
  }
  function fetchData(listInstance) {
    (listInstance.lastDataLoad = 0), _loading.default.show();
    var options = {},
      apiClient = getApiClient(listInstance);
    listInstance.options.userId &&
      listInstance.options.mode &&
      "convert" !== listInstance.options.mode &&
      "download" !== listInstance.options.mode &&
      (options.UserId = listInstance.options.userId),
      "download" === listInstance.options.mode
        ? (options.TargetId = apiClient.deviceId())
        : "convert" === listInstance.options.mode
        ? (options.IncludeProviders = "ConvertSyncProvider")
        : (options.ExcludeProviders = "ConvertSyncProvider"),
      apiClient.getJSON(apiClient.getUrl("Sync/Jobs", options)).then(function (response) {
        renderList(listInstance, response.Items, apiClient), _loading.default.hide();
      });
  }
  function getApiClient(listInstance) {
    return _connectionmanager.default.getApiClient(listInstance.options.serverId);
  }
  function onElementClick(e) {
    var btnJobMenu = e.target.closest(".btnJobMenu");
    btnJobMenu
      ? (function (listInstance, elem) {
          var jobId = (item = elem.closest(".listItem")).getAttribute("data-id"),
            menuItems = [],
            item =
              ("true" === item.getAttribute("data-canedit") &&
                menuItems.push({name: _globalize.default.translate("Edit"), id: "edit"}),
              _globalize.default.translate("RemoveDownload"));
          menuItems.push({name: item, id: "cancel"}),
            require(["actionsheet"], function (actionsheet) {
              actionsheet.show({
                items: menuItems,
                positionTo: elem,
                callback: function (id) {
                  switch (id) {
                    case "delete":
                    case "cancel":
                      cancelJob(listInstance, jobId);
                      break;
                    case "edit":
                      showJobEditor(listInstance, elem);
                  }
                },
              });
            });
        })(this, btnJobMenu)
      : (btnJobMenu = e.target.closest(".btnCancelJob"))
      ? (btnJobMenu = btnJobMenu.closest(".listItem")) && cancelJob(this, btnJobMenu.getAttribute("data-id"))
      : showJobEditor(this, e.target);
  }
  function showJobEditor(listInstance, elem) {
    var jobId,
      elem = elem.closest(".listItem");
    elem &&
      "true" === elem.getAttribute("data-canedit") &&
      ((jobId = elem.getAttribute("data-id")),
      require(["syncJobEditor"], function (syncJobEditor) {
        syncJobEditor
          .show({serverId: listInstance.options.serverId, jobId: jobId, mode: listInstance.options.mode})
          .then(
            function () {
              fetchData(listInstance);
            },
            function () {
              fetchData(listInstance);
            }
          );
      }));
  }
  function syncJobList(options) {
    this.options = options;
    var onSyncJobCreatedHandler = function (e, apiClient, data) {
        fetchData(this);
      }.bind(this),
      onSyncJobCreatedHandler =
        ((this.onSyncJobCreatedHandler = onSyncJobCreatedHandler),
        _events.default.on(_api.default, "SyncJobCreated", onSyncJobCreatedHandler),
        function (e, apiClient, data) {
          fetchData(this);
        }.bind(this)),
      onSyncJobCreatedHandler =
        ((this.onSyncJobCancelledHandler = onSyncJobCreatedHandler),
        _events.default.on(_api.default, "SyncJobCancelled", onSyncJobCreatedHandler),
        function (e, apiClient, data) {
          refreshJob(this, data);
        }.bind(this)),
      onSyncJobCreatedHandler =
        ((this.onSyncJobUpdatedHandler = onSyncJobCreatedHandler),
        _events.default.on(_api.default, "SyncJobUpdated", onSyncJobCreatedHandler),
        onElementClick.bind(this));
    options.element.addEventListener("click", onSyncJobCreatedHandler),
      (this.onClickHandler = onSyncJobCreatedHandler),
      (options.element.innerHTML = '<div class="syncJobListContent"></div>'),
      fetchData(this);
  }
  (syncJobList.prototype.destroy = function () {
    var onSyncJobCreatedHandler = this.onSyncJobCreatedHandler,
      onSyncJobCreatedHandler =
        ((this.onSyncJobCreatedHandler = null),
        _events.default.off(_api.default, "SyncJobCreated", onSyncJobCreatedHandler),
        this.onSyncJobCancelledHandler),
      onSyncJobCreatedHandler =
        ((this.onSyncJobCancelledHandler = null),
        _events.default.off(_api.default, "SyncJobCancelled", onSyncJobCreatedHandler),
        this.onSyncJobUpdatedHandler),
      onSyncJobCreatedHandler =
        ((this.onSyncJobUpdatedHandler = null),
        _events.default.off(_api.default, "SyncJobUpdated", onSyncJobCreatedHandler),
        this.onClickHandler);
    (this.onClickHandler = null),
      this.options.element.removeEventListener("click", onSyncJobCreatedHandler),
      (this.options = null);
  }),
    (_exports.default = syncJobList);
});
