define([
  "exports",
  "./../emby-apiclient/connectionmanager.js",
  "./../dom.js",
  "./../common/globalize.js",
  "./../layoutmanager.js",
  "./../loading/loading.js",
  "./../dialoghelper/dialoghelper.js",
  "./../emby-elements/emby-button/emby-button.js",
  "./../emby-elements/emby-select/emby-select.js",
  "./../emby-elements/emby-scroller/emby-scroller.js",
], function (
  _exports,
  _connectionmanager,
  _dom,
  _globalize,
  _layoutmanager,
  _loading,
  _dialoghelper,
  _embyButton,
  _embySelect,
  _embyScroller
) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["formDialogStyle", "css!modules/imageuploader/style"]);
  var currentItem,
    currentFile,
    hasChanges = !1;
  function onFileReaderError(evt) {
    switch ((_loading.default.hide(), evt.target.error.code)) {
      case evt.target.error.NOT_FOUND_ERR:
        require(["toast"], function (toast) {
          toast(_globalize.default.translate("MessageFileReadError"));
        });
        break;
      case evt.target.error.ABORT_ERR:
        break;
      default:
        require(["toast"], function (toast) {
          toast(_globalize.default.translate("MessageFileReadError"));
        });
    }
  }
  function setFiles(page, files) {
    files = (files = (function (files) {
      for (var list = [], i = 0, length = files.length; i < length; i++) validateImage(files[i]) && list.push(files[i]);
      return list;
    })(files))[0];
    if (!files || !files.type.match("image.*"))
      return (
        (page.querySelector("#imageOutput").innerHTML = ""),
        page.querySelector("#fldUpload").classList.add("hide"),
        void (currentFile = null)
      );
    currentFile = files;
    var theFile,
      reader = new FileReader();
    (reader.onerror = onFileReaderError),
      (reader.onloadstart = function () {
        page.querySelector("#fldUpload").classList.add("hide");
      }),
      (reader.onabort = function () {
        _loading.default.hide(), console.log("File read cancelled");
      }),
      (reader.onload =
        ((theFile = files),
        function (e) {
          e = [
            '<img style="max-width:100%;max-height:100%;" src="',
            e.target.result,
            '" title="',
            escape(theFile.name),
            '"/>',
          ].join("");
          (page.querySelector("#imageOutput").innerHTML = e), page.querySelector("#fldUpload").classList.remove("hide");
        })),
      reader.readAsDataURL(files);
  }
  var supportedImageTypes = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
  function validateImage(file) {
    return !!supportedImageTypes.includes(file.type);
  }
  function onSubmit(e) {
    e.preventDefault();
    var dlg,
      imageType,
      e = currentFile;
    return (
      e &&
        validateImage(e) &&
        (_loading.default.show(),
        (imageType = (dlg = this.closest(".dialog")).querySelector("#selectImageType").value),
        _connectionmanager.default
          .getApiClient(currentItem)
          .uploadItemImage(currentItem.Id, imageType, e)
          .then(function () {
            (dlg.querySelector(".uploadImage").value = ""),
              _loading.default.hide(),
              (hasChanges = !0),
              _dialoghelper.default.close(dlg);
          })),
      !1
    );
  }
  function removeImageType(dlg, type) {
    dlg = dlg.querySelector('option[value="' + type + '"]');
    dlg && dlg.parentNode.removeChild(dlg);
  }
  function showEditor(options, resolve) {
    (options = options || {}),
      require(["text!modules/imageuploader/imageuploader.template.html"], function (template) {
        currentItem = options.item;
        var page,
          dialogOptions = {removeOnClose: !0},
          dlg =
            (_layoutmanager.default.tv
              ? (dialogOptions.size = "fullscreen")
              : (dialogOptions.size = "fullscreen-border"),
            _dialoghelper.default.createDialog(dialogOptions));
        dlg.classList.add("formDialog"),
          (dlg.innerHTML = _globalize.default.translateDocument(template, "sharedcomponents")),
          dlg.querySelector(".uploadImage").setAttribute("accept", supportedImageTypes.join(",")),
          "TvChannel" !== currentItem.Type &&
            (removeImageType(dlg, "LogoLight"), removeImageType(dlg, "LogoLightColor")),
          dlg.addEventListener("close", function () {
            _loading.default.hide(), resolve(hasChanges);
          }),
          options.imageType || dlg.querySelector(".fldSelectImageType").classList.remove("hide"),
          _dialoghelper.default.open(dlg),
          (page = dlg).querySelector("form").addEventListener("submit", onSubmit),
          page.querySelector(".uploadImage").addEventListener("change", function () {
            setFiles(page, this.files);
          }),
          page.querySelector(".btnBrowse").addEventListener("click", function () {
            page.querySelector(".uploadImage").click();
          }),
          (dlg.querySelector("#selectImageType").value = options.imageType || "Primary"),
          dlg.querySelector(".btnCancel").addEventListener("click", function () {
            _dialoghelper.default.close(dlg);
          });
      });
  }
  _exports.default = {
    show: function (options) {
      return new Promise(function (resolve, reject) {
        (hasChanges = !1), showEditor(options, resolve);
      });
    },
  };
});
