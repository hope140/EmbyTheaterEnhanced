define([
  "baseView",
  "datetime",
  "appRouter",
  "events",
  "itemHelper",
  "serverNotifications",
  "textEncoding",
  "globalize",
  "loading",
  "connectionManager",
  "cardBuilder",
  "components/activitylog",
  "humanedate",
  "listView",
  "emby-linkbutton",
  "flexStyles",
  "emby-button",
  "emby-itemscontainer",
  "css!./dashboard",
], function (
  BaseView,
  datetime,
  appRouter,
  events,
  itemHelper,
  serverNotifications,
  textEncoding,
  globalize,
  loading,
  connectionManager,
  cardBuilder,
  ActivityLog,
  humanedate,
  listView
) {
  "use strict";
  var activeWithinSeconds = 300;
  function buttonEnabled(elem, enabled) {
    enabled
      ? (elem.setAttribute("disabled", ""), elem.removeAttribute("disabled"))
      : elem.setAttribute("disabled", "disabled");
  }
  function showEditServerNameDialog(page) {
    require(["prompt"], function (prompt) {
      prompt({
        label: globalize.translate("LabelFriendlyServerName"),
        description: globalize.translate("LabelFriendlyServerNameHelp"),
        value: page.querySelector(".serverNameHeader").innerHTML,
        confirmText: globalize.translate("ButtonSave"),
      }).then(function (value) {
        loading.show(),
          ApiClient.getServerConfiguration().then(function (config) {
            (config.ServerName = value),
              ApiClient.updateServerConfiguration(config).then(function () {
                (page.querySelector(".serverNameHeader").innerHTML = value), loading.hide();
              });
          });
      });
    });
  }
  var DashboardPage = {
    startInterval: function (apiClient) {
      apiClient.isMinServerVersion("4.6.4")
        ? apiClient.startMessageListener("Sessions", "0,1500,0,true,true")
        : apiClient.startMessageListener("Sessions", "0,1500," + activeWithinSeconds + ",true"),
        apiClient.startMessageListener("ScheduledTasksInfo", "0,1000");
    },
    stopInterval: function (apiClient) {
      apiClient.stopMessageListener("Sessions"), apiClient.stopMessageListener("ScheduledTasksInfo");
    },
    systemUpdateTaskKey: "SystemUpdateTask",
    renderUrls: function (page, systemInfo) {
      var localAccessHtml,
        localUrlElem = page.querySelector(".localUrl"),
        page = page.querySelector(".externalUrl");
      systemInfo.LocalAddress
        ? ((localAccessHtml = globalize.translate(
            "LabelLocalAccessUrl",
            '<a is="emby-linkbutton" class="button-link" href=".' +
              systemInfo.LocalAddress +
              '" target="_blank">' +
              systemInfo.LocalAddress +
              "</a>"
          )),
          (localUrlElem.innerHTML = localAccessHtml),
          localUrlElem.classList.remove("hide"))
        : localUrlElem.classList.add("hide"),
        systemInfo.WanAddress
          ? ((localAccessHtml = systemInfo.WanAddress),
            (localUrlElem = globalize.translate(
              "LabelRemoteAccessUrl",
              '<a is="emby-linkbutton" class="button-link" href=".' +
                localAccessHtml +
                '" target="_blank">' +
                localAccessHtml +
                "</a>"
            )),
            (page.innerHTML = localUrlElem),
            page.classList.remove("hide"))
          : page.classList.add("hide");
    },
    renderSupporterIcon: function (page, pluginSecurityInfo) {
      page = page.querySelector(".supporterIconContainer");
      pluginSecurityInfo.IsMBSupporter
        ? (page.classList.remove("hide"),
          (page.innerHTML =
            '<a is="emby-linkbutton" class="button-link imageLink supporterIcon" href=".' +
            appRouter.getRouteUrl("premiere") +
            '" title="Emby Premiere" aria-label="Emby Premiere"><img src="css/images/supporter/supporterbadge.png" style="height:2em;" /></a>'))
        : page.classList.add("hide");
    },
    installPluginUpdate: function (button) {
      buttonEnabled(button, !1);
      var name = button.getAttribute("data-name"),
        guid = button.getAttribute("data-guid"),
        version = button.getAttribute("data-version"),
        button = button.getAttribute("data-classification");
      loading.show(),
        ApiClient.installPlugin(name, guid, button, version).then(function () {
          loading.hide();
        });
    },
    restartServer: function () {
      require(["serverRestartDialog"], function (ServerRestartDialog) {
        new ServerRestartDialog({apiClient: ApiClient}).show();
      });
    },
    restart: function (btn) {
      require(["confirm"], function (confirm) {
        confirm({
          title: globalize.translate("HeaderRestart"),
          text: globalize.translate("MessageConfirmRestart"),
          confirmText: globalize.translate("Restart"),
          primary: "cancel",
        }).then(function () {
          btn.closest(".page");
          DashboardPage.restartServer();
        });
      });
    },
    shutdown: function (btn) {
      require(["confirm"], function (confirm) {
        confirm({
          title: globalize.translate("HeaderShutdown"),
          text: globalize.translate("MessageConfirmShutdown"),
          confirmText: globalize.translate("关闭"),
          primary: "cancel",
        }).then(function () {
          btn.closest(".page");
          ApiClient.shutdownServer();
        });
      });
    },
  };
  function getServerInfoRow(name, value) {
    var html = "";
    return (
      html +
      "<tr>" +
      '<th class="secondaryText text-align-end" style="font-weight:500;margin:0;padding:0 .5em 0 0;vertical-align:top;">' +
      globalize.translate(name) +
      "</th>" +
      '<td class="text-align-start" style="margin:0;padding:0;vertical-align:top;">' +
      value +
      "</td>" +
      "</tr>"
    );
  }
  function showServerInfo() {
    ApiClient.getSystemInfo().then(function (systemInfo) {
      var options,
        html = "",
        html =
          (html =
            (html =
              (html =
                (html =
                  (html =
                    (html =
                      (html += '<table style="margin:0 auto;">') +
                      getServerInfoRow(globalize.translate("当前版本"), systemInfo.Version)) +
                    (function (name) {
                      var html = "";
                      return (
                        html +
                        "<tr>" +
                        '<th class="text-align-end" style="font-weight:normal;margin: 0;padding: 0 .5em 0 0;vertical-align:top;">' +
                        ('<h3 style="margin:.5em 0;font-weight:500;">' + globalize.translate(name) + "</h3>") +
                        "</th>" +
                        '<td class="text-align-start" style="margin:0;padding:0;vertical-align:top;">' +
                        "</td>" +
                        "</tr>"
                      );
                    })(globalize.translate("数据配置路径"))) +
                  getServerInfoRow(globalize.translate("用户程序数据"), systemInfo.ProgramDataPath)) +
                getServerInfoRow(globalize.translate("媒体库缓存"), systemInfo.CachePath)) +
              getServerInfoRow(globalize.translate("媒体元数据"), systemInfo.InternalMetadataPath)) +
            getServerInfoRow(globalize.translate("运行日志"), systemInfo.LogPath)) +
          getServerInfoRow(globalize.translate("转码缓存"), systemInfo.TranscodingTempPath);
      (options = {html: (html += "</table>"), title: systemInfo.ServerName}),
        require(["alert"], function (alert) {
          alert(options);
        });
    });
  }
  function onShowServerMenuClick(e) {
    require(["actionsheet"], function (actionsheet) {
      var btn = e.target,
        menuItems = [];
      return (
        menuItems.push({name: globalize.translate("ChangeServerDisplayName"), id: "editname", icon: "edit"}),
        menuItems.push({name: globalize.translate("HeaderViewServerInfo"), id: "serverinfo", icon: "insights"}),
        actionsheet
          .show({
            items: menuItems,
            positionTo: btn,
            positionY: "center",
            positionX: "right",
            transformOrigin: "left top",
            hasItemIcon: !0,
          })
          .then(
            function (id) {
              switch (id) {
                case "editname":
                  showEditServerNameDialog(btn.closest(".page"));
                  break;
                case "restart":
                  DashboardPage.restart(btn);
                  break;
                case "shutdown":
                  DashboardPage.shutdown(btn);
                  break;
                case "serverinfo":
                  showServerInfo();
              }
            },
            function () {}
          )
      );
    });
  }
  function onUpdateServerClick() {
    var page = this.closest(".page");
    buttonEnabled(page.querySelector("#btnUpdateApplication"), !1),
      loading.show(),
      ApiClient.getScheduledTasks().then(function (tasks) {
        tasks = tasks.filter(function (t) {
          return t.Key === DashboardPage.systemUpdateTaskKey;
        })[0];
        ApiClient.startScheduledTask(tasks.Id).then(function () {
          pollScheduledTasks(page, ApiClient), loading.hide();
        });
      });
  }
  function onPowerMenuClick(e) {
    require(["actionsheet"], function (actionsheet) {
      ApiClient.getSystemInfo().then(function (systemInfo) {
        var btn = e.target,
          menuItems = [];
        return (
          systemInfo.CanSelfRestart &&
            menuItems.push({name: globalize.translate("RestartServer"), id: "restart", icon: "&#xE5D5;"}),
          menuItems.push({name: globalize.translate("ShutdownServer"), id: "shutdown", icon: "&#xE8AC;"}),
          actionsheet
            .show({
              items: menuItems,
              positionTo: btn,
              positionY: "center",
              positionX: "right",
              transformOrigin: "left top",
              hasItemIcon: !0,
            })
            .then(function (id) {
              switch (id) {
                case "editname":
                  showEditServerNameDialog(btn.closest(".page"));
                  break;
                case "restart":
                  DashboardPage.restart(btn);
                  break;
                case "shutdown":
                  DashboardPage.shutdown(btn);
              }
            })
        );
      });
    });
  }
  function getActiveRecordingsListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "auto",
        defaultShape: "backdrop",
        fields: ["ParentName", "Name"],
        coverImage: !0,
        cardLayout: !1,
        centerText: !0,
        preferThumb: "auto",
        overlayText: !1,
        multiSelect: !1,
      },
      virtualScrollLayout: "vertical-grid",
    };
  }
  function sortSessions(a, b) {
    return a.NowPlayingItem && !b.NowPlayingItem ? -1 : b.NowPlayingItem && !a.NowPlayingItem ? 1 : 0;
  }
  function filterSessions(sessions, apiClient) {
    for (var list = [], serverId = apiClient.serverId(), i = 0, length = sessions.length; i < length; i++) {
      var session = sessions[i];
      session.NowPlayingItem && ((session.ServerId = serverId), (session.Type = "ActiveSession"), list.push(session));
    }
    return list.sort(sortSessions), list;
  }
  function getActiveSessionsListOptions(items) {
    return {
      renderer: cardBuilder,
      options: {
        shape: "auto",
        fields: ["SessionNowPlayingInfo"],
        preferThumb: "auto",
        overlayText: !1,
        multiSelect: !1,
        contextMenu: !1,
        cardClass: "activeSession",
        overlayPlayButton: !1,
        sideFooter: !0,
        draggable: !1,
        action: "session_shownowplayingitem",
      },
      virtualScrollLayout: "vertical-grid",
    };
  }
  function renderHasPendingRestart(view, apiClient, hasPendingRestart, isShuttingDown, hasUpdateAvailable) {
    hasUpdateAvailable
      ? view.querySelector("#pUpToDate").classList.add("hide")
      : view.querySelector("#pUpToDate").classList.remove("hide"),
      hasPendingRestart && !isShuttingDown
        ? view.querySelector(".restartInfoBanner").classList.remove("hide")
        : view.querySelector(".restartInfoBanner").classList.add("hide"),
      !hasPendingRestart && hasUpdateAvailable
        ? apiClient.getAvailableApplicationUpdate().then(function (packageInfo) {
            packageInfo = packageInfo[0];
            packageInfo
              ? (view.querySelector("#newVersionNumber").innerHTML = globalize
                  .translate("VersionXIsAvailableForDownload")
                  .replace("{0}", packageInfo.versionStr))
              : view.querySelector("#pUpdateNow").classList.add("hide");
          })
        : view.querySelector("#pUpdateNow").classList.add("hide");
  }
  function reloadSystemInfo(view, apiClient) {
    apiClient.getSystemInfo().then(function (systemInfo) {
      view.querySelector(".serverNameHeader").innerHTML = systemInfo.ServerName;
      var versionText = systemInfo.Version,
        versionText = globalize.translate(
          "LabelVersionNumber",
          '<a is="emby-linkbutton" class="button-link" href="dashboard/releasenotes.html?version=' +
            versionText +
            '">' +
            versionText +
            "</a>"
        );
      systemInfo.SystemUpdateLevel && "Release" !== systemInfo.SystemUpdateLevel
        ? ((versionText += " " + globalize.translate("Option" + systemInfo.SystemUpdateLevel).toLowerCase()),
          view.querySelector(".betaInfo").classList.remove("hide"))
        : view.querySelector(".betaInfo").classList.add("hide"),
        (view.querySelector("#appVersionNumber").innerHTML = versionText),
        systemInfo.SupportsHttps
          ? (view.querySelector("#ports").innerHTML = globalize.translate(
              "LabelRunningOnPorts",
              systemInfo.HttpServerPortNumber,
              systemInfo.HttpsPortNumber
            ))
          : (view.querySelector("#ports").innerHTML = globalize.translate(
              "LabelRunningOnPort",
              systemInfo.HttpServerPortNumber
            )),
        DashboardPage.renderUrls(view, systemInfo),
        systemInfo.CanSelfUpdate
          ? (view.querySelector("#btnUpdateApplication").classList.remove("hide"),
            view.querySelector("#btnManualUpdateContainer").classList.add("hide"))
          : (view.querySelector("#btnUpdateApplication").classList.add("hide"),
            view.querySelector("#btnManualUpdateContainer").classList.remove("hide")),
        "synology" === systemInfo.PackageName
          ? (view.querySelector("#btnManualUpdateContainer").innerHTML =
              globalize.translate("SynologyUpdateInstructions"))
          : (view.querySelector("#btnManualUpdateContainer").innerHTML =
              '<a is="emby-linkbutton" class="button-link" href="https://emby.media/download" target="_blank">' +
              globalize.translate("PleaseUpdateManually") +
              "</a>"),
        renderHasPendingRestart(
          view,
          apiClient,
          systemInfo.HasPendingRestart,
          systemInfo.IsShuttingDown,
          systemInfo.HasUpdateAvailable
        );
    });
  }
  function pollScheduledTasks(view, apiClient) {
    apiClient.getScheduledTasks().then(function (tasks) {
      renderRunningTasks(view, tasks);
    });
  }
  function renderRunningTasks(view, tasks) {
    var html = "";
    (tasks = tasks.filter(function (t) {
      return "Idle" !== t.State && !t.IsHidden;
    })).length
      ? view.querySelector(".runningTasksContainer").classList.remove("hide")
      : view.querySelector(".runningTasksContainer").classList.add("hide"),
      tasks.filter(function (t) {
        return t.Key === DashboardPage.systemUpdateTaskKey;
      }).length
        ? buttonEnabled(view.querySelector("#btnUpdateApplication"), !1)
        : buttonEnabled(view.querySelector("#btnUpdateApplication"), !0);
    for (var i = 0, length = tasks.length; i < length; i++) {
      var progress,
        task = tasks[i];
      (html = (html += "<div>") + ("<div>" + task.Name + "</div>") + '<div class="flex align-items-center">'),
        "Running" === task.State
          ? (html =
              (html =
                (html +=
                  '<div class="itemProgressBar itemProgressBarRound flex-grow" title="' +
                  (progress = (task.CurrentProgressPercentage || 0).toFixed(1)) +
                  '%" aria-label="' +
                  progress +
                  '%" style="height:.4em;width:5em;">') +
                '<div class="itemProgressBarForeground itemProgressBarForegroundRound" style="width:' +
                progress +
                '%;"></div></div>') +
              '<button type="button" is="paper-icon-button-light" title="' +
              globalize.translate("ButtonStop") +
              '" aria-label="' +
              globalize.translate("ButtonStop") +
              '" onclick="window.stopDashboardTask(this, \'' +
              task.Id +
              '\');" class="autoSize"><i class="md-icon">cancel</i></button>')
          : "Cancelling" === task.State &&
            (html += '<span style="color:#cc0000;">' + globalize.translate("LabelStopping") + "</span>"),
        (html = html + "</div>" + "</div>");
    }
    view.querySelector("#divRunningTasks").innerHTML = html;
  }
  function ServerDashboardView(view, params) {
    BaseView.apply(this, arguments);
    var self = this,
      serverId = ApiClient.serverId();
    function onRestartRequired(e, apiClient) {
      apiClient.serverId() === serverId && renderHasPendingRestart(view, apiClient, !0);
    }
    function onServerShuttingDown(e, apiClient) {
      apiClient.serverId() === serverId && renderHasPendingRestart(view, apiClient, !0, !0);
    }
    function onServerRestarting(e, apiClient) {
      apiClient.serverId() === serverId && renderHasPendingRestart(view, apiClient, !0, !0);
    }
    function onPackageInstalling(e, apiClient) {
      apiClient.serverId() === serverId && (pollScheduledTasks(view, apiClient), reloadSystemInfo(view, apiClient));
    }
    function onPackageInstallationCompleted(e, apiClient) {
      apiClient.serverId() === serverId && (pollScheduledTasks(view, apiClient), reloadSystemInfo(view, apiClient));
    }
    function setNowPlayingItems(items) {
      var itemsContainer = self.nowPlayingSessionsItemsContainer;
      if (
        (function (itemsContainer, items) {
          for (var lookup = {}, i = 0, length = items.length; i < length; i++) {
            var _item = items[i];
            if (((lookup[_item.Id] = !0), -1 === itemsContainer.indexOfItemId(_item.Id))) return 1;
          }
          for (
            var currentItems = itemsContainer.getItems() || [], _i = 0, _length = currentItems.length;
            _i < _length;
            _i++
          )
            if (!lookup[currentItems[_i].Id]) return 1;
        })(itemsContainer, items)
      )
        return (self._activeSessions = items), void itemsContainer.resume(Object.assign({}, {refresh: !0}));
      for (var i = 0, length = items.length; i < length; i++) {
        var item = items[i],
          index = itemsContainer.indexOfItemId(item.Id);
        -1 !== index && itemsContainer.onItemUpdated(index, item);
      }
    }
    function onSessionsUpdate(e, apiClient, info) {
      apiClient.serverId() === serverId &&
        (self.paused
          ? ((self._activeSessions = null), self.nowPlayingSessionsItemsContainer.notifyRefreshNeeded())
          : setNowPlayingItems(filterSessions(info, apiClient)));
    }
    function onScheduledTasksUpdate(e, apiClient, info) {
      apiClient.serverId() === serverId && renderRunningTasks(view, info);
    }
    (this.activeRecordingsItemsContainer = view.querySelector(".activeRecordingItems")),
      (this.nowPlayingSessionsItemsContainer = view.querySelector(".nowPlayingSessions")),
      (this.activeRecordingsItemsContainer.fetchData = function () {
        var apiClient = ApiClient;
        return apiClient.getLiveTvRecordings({
          UserId: apiClient.getCurrentUserId(),
          IsInProgress: !0,
          Fields: this.requestedItemFields + ",PrimaryImageAspectRatio",
          EnableTotalRecordCount: !1,
          EnableImageTypes: "Primary,Thumb,Backdrop",
        });
      }.bind(this)),
      (this.activeRecordingsItemsContainer.getListOptions = getActiveRecordingsListOptions),
      (this.activeRecordingsItemsContainer.parentContainer =
        this.activeRecordingsItemsContainer.closest(".activeRecordingsSection")),
      (this.nowPlayingSessionsItemsContainer.fetchData = function () {
        if (this._activeSessions)
          return Promise.resolve({Items: this._activeSessions, TotalRecordCount: this._activeSessions.length});
        var apiClient = ApiClient,
          query = {IncludeAllSessionsIfAdmin: !0, IsPlaying: !0};
        return (
          apiClient.isMinServerVersion("4.6.4") || (query.ActiveWithinSeconds = activeWithinSeconds),
          apiClient.getSessions(query).then(function (sessions) {
            return {Items: (sessions = filterSessions(sessions, apiClient)), TotalRecordCount: sessions.length};
          })
        );
      }.bind(this)),
      (this.nowPlayingSessionsItemsContainer.getListOptions = getActiveSessionsListOptions),
      (this.nowPlayingSessionsItemsContainer.parentContainer =
        this.nowPlayingSessionsItemsContainer.closest(".dashboardSection")),
      view.querySelector(".btnServerMoreMenu").addEventListener("click", onShowServerMenuClick),
      view.querySelector(".btnRestartMenu").addEventListener("click", onPowerMenuClick),
      view.querySelector(".btnUpdateServer").addEventListener("click", onUpdateServerClick),
      view.addEventListener("viewshow", function (e) {
        var page = this,
          apiClient = ApiClient;
        apiClient &&
          (pollScheduledTasks(page, apiClient),
          DashboardPage.startInterval(apiClient),
          events.on(serverNotifications, "RestartRequired", onRestartRequired),
          events.on(serverNotifications, "ServerShuttingDown", onServerShuttingDown),
          events.on(serverNotifications, "ServerRestarting", onServerRestarting),
          events.on(serverNotifications, "PackageInstalling", onPackageInstalling),
          events.on(serverNotifications, "PackageInstallationCompleted", onPackageInstallationCompleted),
          events.on(serverNotifications, "Sessions", onSessionsUpdate),
          events.on(serverNotifications, "ScheduledTasksInfo", onScheduledTasksUpdate),
          (function () {
            var apiClient = window.ApiClient;
            return apiClient
              ? connectionManager.getRegistrationInfo("themes", apiClient, {viewOnly: !0}).then(
                  function (result) {
                    return {IsMBSupporter: !0};
                  },
                  function () {
                    return {IsMBSupporter: !1};
                  }
                )
              : Promise.reject();
          })().then(function (pluginSecurityInfo) {
            DashboardPage.renderSupporterIcon(page, pluginSecurityInfo);
            var supporterPromotionElem = page.querySelector(".supporterPromotion"),
              pluginSecurityInfo = pluginSecurityInfo.IsMBSupporter;
            supporterPromotionElem
              ? pluginSecurityInfo && supporterPromotionElem.parentNode.removeChild(supporterPromotionElem)
              : pluginSecurityInfo ||
                ((supporterPromotionElem = '<div class="supporterPromotionContainer"><div class="supporterPromotion">'),
                (supporterPromotionElem +=
                  '<a is="emby-linkbutton" href="https://emby.media/premiere" target="_blank" class="raised block" style="background-color:#52B54B;color:#fff;"><div>' +
                  globalize.translate("HeaderSupportTheTeam") +
                  '</div><div style="font-weight:normal;margin-top:.35em;">' +
                  globalize.translate("TextEnjoyBonusFeatures") +
                  "</div></a></div></div>"),
                page.querySelector(".dashboardContainer").insertAdjacentHTML("afterbegin", supporterPromotionElem));
          }),
          reloadSystemInfo(page, ApiClient));
      }),
      (view.querySelector(".betaInfoBanner").innerHTML = globalize.translate(
        "BetaTesterMessage",
        '<a is="emby-linkbutton" class="button-link" href="https://emby.media/community/index.php?/forum/101-testing-area" target="_blank">',
        "</a>"
      )),
      view.addEventListener("viewbeforehide", function () {
        events.off(serverNotifications, "RestartRequired", onRestartRequired),
          events.off(serverNotifications, "ServerShuttingDown", onServerShuttingDown),
          events.off(serverNotifications, "ServerRestarting", onServerRestarting),
          events.off(serverNotifications, "PackageInstalling", onPackageInstalling),
          events.off(serverNotifications, "PackageInstallationCompleted", onPackageInstallationCompleted),
          events.off(serverNotifications, "Sessions", onSessionsUpdate),
          events.off(serverNotifications, "ScheduledTasksInfo", onScheduledTasksUpdate);
      });
  }
  return (
    (window.stopDashboardTask = function (btn, id) {
      var page = btn.closest(".page");
      ApiClient.stopScheduledTask(id).then(function () {
        pollScheduledTasks(page, ApiClient);
      });
    }),
    Object.assign(ServerDashboardView.prototype, BaseView.prototype),
    (ServerDashboardView.prototype.onResume = function (options) {
      BaseView.prototype.onResume.apply(this, arguments),
        this.activeRecordingsItemsContainer.resume(options),
        this.nowPlayingSessionsItemsContainer.resume(Object.assign(options, {refresh: !0}));
      var apiClient = ApiClient;
      apiClient &&
        (this.userActivityLog
          ? this.userActivityLog.resume(options)
          : (this.userActivityLog = new ActivityLog({
              serverId: apiClient.serverId(),
              element: this.view.querySelector(".userActivityItems"),
            })),
        this.serverActivityLog
          ? this.serverActivityLog.resume(options)
          : (this.serverActivityLog = new ActivityLog({
              serverId: apiClient.serverId(),
              element: this.view.querySelector(".serverActivityItems"),
            })),
        (function (view, apiClient) {
          (apiClient =
            "https://swagger.emby.media?url=" + apiClient.getUrl("openapi") + "&api_key=" + apiClient.accessToken()),
            view.querySelector(".swaggerLink").setAttribute("href", apiClient);
        })(this.view, apiClient));
    }),
    (ServerDashboardView.prototype.onPause = function () {
      BaseView.prototype.onPause.apply(this, arguments);
      var apiClient = ApiClient;
      apiClient && DashboardPage.stopInterval(apiClient),
        this.activeRecordingsItemsContainer.pause(),
        this.nowPlayingSessionsItemsContainer.pause(),
        this.userActivityLog && this.userActivityLog.pause(),
        this.serverActivityLog && this.serverActivityLog.pause();
    }),
    (ServerDashboardView.prototype.destroy = function () {
      BaseView.prototype.destroy.apply(this, arguments);
      var userActivityLog = this.userActivityLog,
        userActivityLog =
          (userActivityLog && (userActivityLog.destroy(), (this.userActivityLog = null)), this.serverActivityLog);
      userActivityLog && (userActivityLog.destroy(), (this.serverActivityLog = null)),
        (this.activeRecordingsItemsContainer = null),
        (this.nowPlayingSessionsItemsContainer = null),
        (this._activeSessions = null);
    }),
    ServerDashboardView
  );
});
