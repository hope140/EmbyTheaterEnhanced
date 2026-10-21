define([
  "exports",
  "./../emby-apiclient/connectionmanager.js",
  "./../dialoghelper/dialoghelper.js",
  "./../common/globalize.js",
  "./../emby-apiclient/events.js",
  "./../dom.js",
  "./../common/playback/playbackmanager.js",
  "./../emby-elements/emby-input/emby-input.js",
  "./../emby-elements/emby-select/emby-select.js",
  "./../emby-elements/emby-button/emby-button.js",
  "./../emby-elements/emby-button/paper-icon-button-light.js",
], function (
  _exports,
  _connectionmanager,
  _dialoghelper,
  _globalize,
  _events,
  _dom,
  _playbackmanager,
  _embyInput,
  _embySelect,
  _embyButton,
  _paperIconButtonLight
) {
  function SubtitleOffsetDialog(options) {
    this.options = options;
  }
  function onDialogClosed() {
    var instance = this,
      player = this.options.player;
    return (
      (instance = instance.localOnSubtitleOffsetChange) &&
        _events.default.off(player, "subtitleoffsetchange", instance),
      Promise.resolve()
    );
  }
  function onIncrementButtonClick(e) {
    _playbackmanager.default.incrementSubtitleOffset(
      parseInt(e.currentTarget.getAttribute("data-offset")),
      this.options.player
    );
  }
  function refreshData(instance, player) {
    !(function (instance, offsetValue) {
      instance.dlg.querySelector(".offsetValue").innerHTML = offsetValue;
    })(instance, _playbackmanager.default.getSubtitleOffset(player));
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["material-icons", "formDialogStyle"]),
    (SubtitleOffsetDialog.prototype.show = function () {
      var dlg, instance, player;
      function localOnSubtitleOffsetChange(e) {
        refreshData(instance, player);
      }
      this.dlg ||
        ((dlg = _dialoghelper.default.createDialog({
          removeOnClose: !1,
          scrollY: !1,
          transparentBackground: !0,
        })).classList.add("formDialog"),
        dlg.classList.add("subtitleOffsetDialog"),
        _dom.default.allowBackdropFilter() && dlg.classList.add("dialog-blur"),
        (html =
          (html =
            (html =
              '<div class="formDialogHeader formDialogHeader-clear justify-content-center" style="padding-top:1.25em;"><button is="paper-icon-button-light" class="hide-mouse-idle-tv btnCancel autoSize" tabindex="-1" style="position:absolute;top:.9em;left:.25em;"><i class="md-icon autortl">&#xE5C4;</i></button>') +
            '<h3 class="formDialogHeaderTitle" style="margin:0;">' +
            _globalize.default.translate("HeaderSubtitleOffset") +
            "</h3></div>") +
          (function () {
            var html = "";
            return (
              (html +=
                '<div class="formDialogContent flex flex-direction-column align-items-center" style="padding-left:1.5em;padding-right:1.5em;padding-bottom:.25em;">') +
              '<div class="subtitleOverlayOffsetText" style="margin:1em 0;"><span class="offsetValue">0</span><span> 毫秒</span></div>' +
              '<div class="subtitleOverlayControls flex flex-direction-row align-items-center justify-content-center padded-top padded-bottom">' +
              ('<button is="emby-button" type="button" data-offset="-500" class="flex-shrink-zero btnDecrementSubtitleOffset raised raised-mini nobackdropfilter" title="' +
                _globalize.default.translate("HeaderDecreaseSubtitleOffset") +
                '" aria-label="' +
                _globalize.default.translate("HeaderDecreaseSubtitleOffset") +
                '">- 500 毫秒</button>') +
              ('<button is="emby-button" type="button" data-offset="500" class="flex-shrink-zero btnIncrementSubtitleOffset raised raised-mini nobackdropfilter" title="' +
                _globalize.default.translate("HeaderIncreaseSubtitleOffset") +
                '" aria-label="' +
                _globalize.default.translate("HeaderIncreaseSubtitleOffset") +
                '">+ 500 毫秒</button>') +
              ('<button is="emby-button" type="button" class="flex-shrink-zero btnReset raised raised-mini nobackdropfilter" title="' +
                _globalize.default.translate("Reset") +
                '" aria-label="' +
                _globalize.default.translate("Reset") +
                '">' +
                _globalize.default.translate("Reset") +
                "</button>") +
              "</div>" +
              "</div>"
            );
          })()),
        (dlg.innerHTML = html),
        (this.dlg = dlg).querySelector(".btnCancel").addEventListener(
          "click",
          function () {
            this.close();
          }.bind(this)
        ),
        dlg.querySelector(".btnDecrementSubtitleOffset").addEventListener("click", onIncrementButtonClick.bind(this)),
        dlg.querySelector(".btnIncrementSubtitleOffset").addEventListener("click", onIncrementButtonClick.bind(this)),
        dlg.querySelector(".btnReset").addEventListener(
          "click",
          function (e) {
            _playbackmanager.default.setSubtitleOffset(0, this.options.player);
          }.bind(this)
        )),
        (player = (instance = this).options.player),
        (instance.localOnSubtitleOffsetChange = localOnSubtitleOffsetChange),
        _events.default.on(player, "subtitleoffsetchange", localOnSubtitleOffsetChange),
        refreshData(this, this.options.player);
      var html = onDialogClosed.bind(this);
      return _dialoghelper.default.open(this.dlg).then(html, html);
    }),
    (SubtitleOffsetDialog.prototype.close = function () {
      var dlg = this.dlg;
      dlg && _dialoghelper.default.close(dlg);
    }),
    (SubtitleOffsetDialog.prototype.destroy = function () {
      this.close(), (this.options = null), (this.dlg = null);
    }),
    (_exports.default = SubtitleOffsetDialog);
});
