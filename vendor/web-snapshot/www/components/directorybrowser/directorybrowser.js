define([
  "globalize",
  "loading",
  "dialogHelper",
  "dom",
  "listViewStyle",
  "emby-input",
  "emby-button",
  "paper-icon-button-light",
  "formDialogStyle",
  "emby-linkbutton",
], function (globalize, loading, dialogHelper, dom) {
  "use strict";
  var systemInfo;
  function onDialogClosed() {
    loading.hide();
  }
  function refreshDirectoryBrowser(page, path, fileOptions, updatePathOnError) {
    if (path && "string" != typeof path) throw new Error("invalid path");
    loading.show();
    var promises = [];
    "Network" === path
      ? promises.push(ApiClient.getNetworkDevices())
      : path
      ? (promises.push(ApiClient.getDirectoryContents(path, fileOptions)), promises.push(ApiClient.getParentPath(path)))
      : promises.push(ApiClient.getDrives()),
      Promise.all(promises).then(
        function (responses) {
          var folders = responses[0],
            responses = responses[1] || "",
            html = ((page.querySelector("#txtDirectoryPickerPath").value = path || ""), "");
          path && (html += getItem("lnkPath lnkDirectory", "", responses, "..."));
          for (var i = 0, length = folders.length; i < length; i++) {
            var folder = folders[i];
            html += getItem(
              "File" === folder.Type ? "lnkPath lnkFile" : "lnkPath lnkDirectory",
              folder.Type,
              folder.Path,
              folder.Name
            );
          }
          path || (html += getItem("lnkPath lnkDirectory", "", "Network", globalize.translate("ButtonNetwork"))),
            (page.querySelector(".results").innerHTML = html),
            loading.hide();
        },
        function () {
          updatePathOnError && (page.querySelector("#txtDirectoryPickerPath").value = ""),
            (page.querySelector(".results").innerHTML = ""),
            loading.hide();
        }
      );
  }
  function getItem(cssClass, type, path, name) {
    var html = "";
    return (
      (html +=
        '<div class="listItem listItemCursor listItem-border ' +
        cssClass +
        '" data-type="' +
        type +
        '" data-path="' +
        path +
        '">'),
      "Directory" === type
        ? (html += '<i class="md-icon listItemIcon secondaryText">folder</i>')
        : "File" === type
        ? (html += '<i class="md-icon listItemIcon">description</i>')
        : "Network" === path && (html += '<i class="md-icon listItemIcon">wifi</i>'),
      (html =
        (html =
          (html =
            (html += '<div class="listItemBody" style="padding-top:.5em;padding-bottom:.5em;">') +
            '<div class="listItemBodyText">' +
            name) +
          "</div>" +
          "</div>") +
        '<i class="md-icon listItemIcon autortl">&#xe5c8;</i>' +
        "</div>")
    );
  }
  function alertText(text) {
    var options;
    (options = {text: text}),
      require(["alert"], function (alert) {
        alert(options);
      });
  }
  function initEditor(content, options, fileOptions) {
    content.addEventListener("click", function (e) {
      var path,
        e = e.target.closest(".lnkPath");
      e &&
        ((path = e.getAttribute("data-path")),
        e.classList.contains("lnkFile")
          ? (content.querySelector("#txtDirectoryPickerPath").value = path)
          : refreshDirectoryBrowser(content, path, fileOptions, !0));
    }),
      content.addEventListener("click", function (e) {
        e.target.closest(".btnRefreshDirectories") &&
          ((e = content.querySelector("#txtDirectoryPickerPath").value),
          refreshDirectoryBrowser(content, e, fileOptions));
      }),
      content.addEventListener("change", function (e) {
        e = e.target.closest("INPUT");
        e && "txtDirectoryPickerPath" === e.id && refreshDirectoryBrowser(content, e.value, fileOptions);
      }),
      content.querySelector("form").addEventListener("submit", function (e) {
        var networkSharePath, path;
        return (
          options.callback &&
            ((networkSharePath = (networkSharePath = this.querySelector("#txtNetworkPath"))
              ? networkSharePath.value
              : null),
            (function (path, validateWriteable, apiClient) {
              return apiClient
                .ajax({
                  type: "POST",
                  url: apiClient.getUrl("Environment/ValidatePath"),
                  data: {ValidateWriteable: validateWriteable, Path: path},
                })
                .catch(function (response) {
                  if (response) {
                    if (404 === response.status)
                      return (
                        alertText("The path could not be found. Please ensure the path is valid and try again."),
                        Promise.reject()
                      );
                    if (500 === response.status)
                      return (
                        alertText(
                          validateWriteable
                            ? "Emby Server requires write access to this folder. Please ensure write access and try again."
                            : "The path could not be found. Please ensure the path is valid and try again."
                        ),
                        Promise.reject()
                      );
                  }
                  return Promise.resolve();
                });
            })((path = this.querySelector("#txtDirectoryPickerPath").value), options.validateWriteable, ApiClient).then(
              function () {
                options.callback(path, networkSharePath);
              }
            )),
          e.preventDefault(),
          e.stopPropagation(),
          !1
        );
      });
  }
  return function () {
    var currentDialog;
    (this.show = function (options) {
      var fileOptions = {includeDirectories: !0};
      null != (options = options || {}).includeDirectories &&
        (fileOptions.includeDirectories = options.includeDirectories),
        null != options.includeFiles && (fileOptions.includeFiles = options.includeFiles),
        Promise.all([
          systemInfo
            ? Promise.resolve(systemInfo)
            : ApiClient.getSystemInfo().then(function (info) {
                return (systemInfo = info);
              }),
          (function (options) {
            return options.path
              ? Promise.resolve(options.path)
              : ApiClient.getJSON(ApiClient.getUrl("Environment/DefaultDirectoryBrowser")).then(
                  function (result) {
                    return result.Path || "";
                  },
                  function () {
                    return "";
                  }
                );
          })(options),
        ]).then(function (responses) {
          var systemInfo = responses[0],
            responses = responses[1],
            dlg = dialogHelper.createDialog({size: "medium-tall", removeOnClose: !0, scrollY: !1}),
            html =
              (dlg.classList.add("ui-body-a"),
              dlg.classList.add("background-theme-a"),
              dlg.classList.add("directoryPicker"),
              dlg.classList.add("formDialog"),
              ""),
            html =
              (html =
                (html +=
                  '<div class="formDialogHeader"><button is="paper-icon-button-light" class="btnCloseDialog autoSize" tabindex="-1"><i class="md-icon autortl">&#xE5C4;</i></button><h3 class="formDialogHeaderTitle">') +
                (options.header || globalize.translate("HeaderSelectPath")) +
                "</h3></div>") +
              (function (options, systemInfo) {
                var html = "",
                  systemInfo =
                    ((html =
                      html +
                      '<div class="formDialogContent scrollY">' +
                      '<div class="dialogContentInner dialog-content-centered padded-left padded-right" style="padding-top:2em;">'),
                    options.pathReadOnly ||
                      ((html =
                        (html =
                          html +
                          '<div class="infoBanner" style="margin-bottom:1.5em;">' +
                          (options.instruction ? options.instruction + "<br/><br/>" : "")) +
                        globalize
                          .translate("MessageDirectoryPickerInstruction")
                          .replace("{0}", "<b>\\\\server</b>")
                          .replace("{1}", "<b>\\\\192.168.1.101</b>")),
                      "synology" === (systemInfo.PackageName || "").toLowerCase()
                        ? (html =
                            (html += "<br/><br/>") +
                            '<a is="emby-linkbutton" class="button-link" href="https://github.com/MediaBrowser/Wiki/wiki/Synology-:-Setting-Up-Your-Media-Library-Share" target="_blank">' +
                            globalize.translate("LearnHowToCreateSynologyShares") +
                            "</a>")
                        : "bsd" === systemInfo.OperatingSystem.toLowerCase()
                        ? (html =
                            (html =
                              (html += "<br/><br/>") +
                              globalize.translate("MessageDirectoryPickerBSDInstruction") +
                              "<br/>") +
                            '<a is="emby-linkbutton" class="button-link" href="http://doc.freenas.org/9.3/freenas_jails.html#add-storage" target="_blank">' +
                            globalize.translate("ButtonMoreInformation") +
                            "</a>")
                        : "linux" === systemInfo.OperatingSystem.toLowerCase() &&
                          (html =
                            (html += "<br/><br/>") +
                            globalize.translate("MessageDirectoryPickerLinuxInstruction") +
                            "<br/>"),
                      (html += "</div>")),
                    !0 !== options.includeFiles ? "LabelFolder" : "LabelPath"),
                  readOnlyAttribute = options.pathReadOnly ? " readonly" : "";
                return (
                  (html =
                    (html =
                      (html += '<form style="margin:auto;">') +
                      '<div class="inputContainer flex align-items-center">' +
                      '<div class="flex-grow">') +
                    ('<input is="emby-input" id="txtDirectoryPickerPath" type="text" required="required" ' +
                      readOnlyAttribute +
                      ' label="' +
                      globalize.translate(systemInfo) +
                      '"/>') +
                    "</div>"),
                  readOnlyAttribute ||
                    (html +=
                      '<button type="button" is="paper-icon-button-light" class="btnRefreshDirectories emby-input-iconbutton" title="' +
                      globalize.translate("ButtonRefresh") +
                      '" aria-label="' +
                      globalize.translate("ButtonRefresh") +
                      '"><i class="md-icon">search</i></button>'),
                  (html += "</div>"),
                  readOnlyAttribute ||
                    (html +=
                      '<div class="results listItems-border" style="max-height: 200px; overflow-y: auto;"></div>'),
                  options.enableNetworkSharePath &&
                    (html =
                      (html =
                        (html += '<div class="inputContainer" style="margin-top:2em;">') +
                        '<input is="emby-input" id="txtNetworkPath" type="text" label="' +
                        globalize.translate("LabelOptionalNetworkPath") +
                        '"/><div class="fieldDescription">') +
                      globalize.translate("LabelOptionalNetworkPathHelp") +
                      "</div></div>"),
                  (html =
                    (html =
                      (html =
                        (html += '<div class="formDialogFooter">') +
                        ('<button is="emby-button" type="submit" class="raised button-submit block formDialogFooterItem">' +
                          globalize.translate("ButtonOk") +
                          "</button>") +
                        "</div>") +
                      "</form>" +
                      "</div>") +
                    "</div>" +
                    "</div>")
                );
              })(options, systemInfo);
          (dlg.innerHTML = html),
            initEditor(dlg, options, fileOptions),
            dlg.addEventListener("close", onDialogClosed),
            dialogHelper.open(dlg),
            dlg.querySelector(".btnCloseDialog").addEventListener("click", function () {
              dialogHelper.close(dlg);
            });
          (currentDialog = dlg).querySelector("#txtDirectoryPickerPath").value = responses;
          systemInfo = dlg.querySelector("#txtNetworkPath");
          systemInfo && (systemInfo.value = options.networkSharePath || ""),
            options.pathReadOnly || refreshDirectoryBrowser(dlg, responses, fileOptions, !0);
        });
    }),
      (this.close = function () {
        currentDialog && dialogHelper.close(currentDialog);
      });
  };
});
