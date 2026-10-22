define([
  "exports",
  "./../modules/viewmanager/baseview.js",
  "./../modules/loading/loading.js",
  "./../modules/common/globalize.js",
  "./../modules/emby-elements/emby-input/emby-input.js",
  "./../modules/emby-elements/emby-button/emby-button.js",
  "./../modules/emby-elements/emby-checkbox/emby-checkbox.js",
  "./../modules/emby-elements/emby-select/emby-select.js",
  "./../modules/formhelper.js",
  "./../modules/emby-apiclient/connectionmanager.js",
], function (
  _exports,
  _baseview,
  _loading,
  _globalize,
  _embyInput,
  _embyButton,
  _embyCheckbox,
  _embySelect,
  _formhelper,
  _connectionmanager
) {
  function loadPage(page, config, codecs, defaultCodecConfigurations) {
    var selectHwa = page.querySelector("#selectHwa"),
      codecConfigs =
        ((selectHwa.value = config.HardwareAccelerationMode || 0),
        1 === config.HardwareAccelerationMode ? defaultCodecConfigurations : config.CodecConfigurations || []),
      defaultCodecConfigurations =
        ((function (context, codecs, codecConfigs) {
          if (null == codecs || 0 === codecs.length) return;
          !(function (codecs, codecConfigs) {
            for (var i = 0, length = codecs.length; i < length; i++) {
              var codec = codecs[i],
                config = getConfigurationByCodecId(codecConfigs, codec.Id);
              config && config.Priority ? (codec.Priority = config.Priority) : (codec.Priority = 0);
            }
          })(codecs, codecConfigs);
          var decoderHtml = renderCodecsGrouped(
              0,
              0,
              codecs.filter(function (codec) {
                return "Decoder" === codec.Direction && codec.IsHardwareCodec;
              })
            ),
            codecConfigs = renderCodecsGrouped(
              0,
              0,
              codecs.filter(function (codec) {
                return "Encoder" === codec.Direction && codec.IsHardwareCodec;
              })
            );
          (context.querySelector("#hardwareDecoders").innerHTML = decoderHtml),
            (context.querySelector("#hardwareEncoders").innerHTML = codecConfigs);
        })(page, codecs, codecConfigs),
        Array.prototype.forEach.call(page.querySelectorAll(".chkEnableCodec"), function (c) {
          var codecId = c.getAttribute("data-codec"),
            codecId = getConfigurationByCodecId(codecConfigs, codecId);
          c.checked = codecId && codecId.IsEnabled;
        }),
        (page.querySelector("#chkEnableThrottle").checked = config.EnableThrottling),
        (page.querySelector("#selectThreadCount").value = config.EncodingThreadCount),
        (page.querySelector("#txtDownMixAudioBoost").value = config.DownMixAudioBoost),
        (page.querySelector("#txtTranscodingTempPath").value = config.TranscodingTempPath || ""),
        (page.querySelector("#selectH264Preset").value = config.H264Preset || ""),
        (page.querySelector("#txtH264Crf").value = config.H264Crf || "0"),
        (page.querySelector("#chkEnableSubtitleExtraction").checked = config.EnableSubtitleExtraction || !1),
        page.querySelector(".selectToneMapping"));
    config.EnableHardwareToneMapping && config.EnableSoftwareToneMapping
      ? (defaultCodecConfigurations.value = "both")
      : config.EnableHardwareToneMapping
      ? (defaultCodecConfigurations.value = "hw")
      : config.EnableSoftwareToneMapping
      ? (defaultCodecConfigurations.value = "swforced")
      : (defaultCodecConfigurations.value = ""),
      onSelectToneMappingEnabledChanged.call(defaultCodecConfigurations),
      onHwaModeChange.call(selectHwa),
      _loading.default.hide(),
      (function (page) {
        page.querySelector("#hardwareDecoders").addEventListener("click", onCodecClick),
          page.querySelector("#hardwareEncoders").addEventListener("click", onCodecClick);
      })(page);
  }
  function renderCodecsGrouped(context, codecConfigs, codecs) {
    return codecs
      .map(function (item) {
        return item.MediaTypeName;
      })
      .filter(distinct)
      .map(function (group) {
        var groupCodecs = codecs.filter(function (codec) {
          return codec.MediaTypeName === group;
        });
        return (function (group, codecs) {
          codecs.sort(function (c1, c2) {
            return c2.Priority - c1.Priority;
          });
          group = '<div><h3 class="checkboxListLabel">' + group + "</h3>";
          return (group =
            (group += '<div class="checkboxList codecList">') +
            codecs.map(renderSingleCodec).join("") +
            "</div></div>");
        })(group, groupCodecs);
      })
      .join("");
  }
  function renderSingleCodec(codec, index, codecs) {
    var checkBoxHtml = '<label class="listItemCheckboxContainer">',
      upDownHtml =
        ((checkBoxHtml =
          (checkBoxHtml +=
            '<input type="checkbox" is="emby-checkbox" class="chkEnableCodec"  data-codec="' + codec.Id + '" />') +
          ("<span>" + codec.Name + "</span></label>")),
        "");
    0 < index
      ? (upDownHtml +=
          '<button type="button" is="paper-icon-button-light" title="' +
          _globalize.default.translate("ButtonUp") +
          '" aria-label="' +
          _globalize.default.translate("ButtonUp") +
          '" class="listItemButton btnSortableMoveUp btnSortable" data-pluginindex="' +
          codec.Id +
          '"><i class="md-icon">keyboard_arrow_up</i></button>')
      : 1 < codecs.length &&
        (upDownHtml +=
          '<button type="button" is="paper-icon-button-light" title="' +
          _globalize.default.translate("ButtonDown") +
          '" aria-label="' +
          _globalize.default.translate("ButtonDown") +
          '" class="listItemButton btnSortableMoveDown btnSortable" data-pluginindex="' +
          codec.Id +
          '"><i class="md-icon">keyboard_arrow_down</i></button>');
    codec = '<div class="listItem ' + (index < codecs.length - 1 ? " listItem-border " : "") + ' sortableOption">';
    return (
      (codec += checkBoxHtml) +
      '<div class="listItemBody two-line listItemBodyText"></div>' +
      "" +
      upDownHtml +
      "</div>"
    );
  }
  function onSubmit(e) {
    var form = this,
      apiClient = (_loading.default.show(), ApiClient);
    return (
      apiClient.getNamedConfiguration("encoding").then(function (config) {
        (config.DownMixAudioBoost = form.querySelector("#txtDownMixAudioBoost").value),
          (config.TranscodingTempPath = form.querySelector("#txtTranscodingTempPath").value),
          (config.EncodingThreadCount = form.querySelector("#selectThreadCount").value),
          (config.H264Preset = form.querySelector("#selectH264Preset").value),
          (config.H264Crf = parseInt(form.querySelector("#txtH264Crf").value || "0")),
          (config.EnableSubtitleExtraction = form.querySelector("#chkEnableSubtitleExtraction").checked),
          (config.EnableThrottling = form.querySelector("#chkEnableThrottle").checked);
        var selectHwa = form.querySelector("#selectHwa"),
          selectHwa =
            ((config.HardwareAccelerationMode = parseInt(selectHwa.value)),
            form.querySelector(".selectToneMapping").value),
          codecConfigs =
            ("both" === selectHwa
              ? ((config.EnableHardwareToneMapping = !0), (config.EnableSoftwareToneMapping = !0))
              : "hw" === selectHwa
              ? ((config.EnableHardwareToneMapping = !0), (config.EnableSoftwareToneMapping = !1))
              : "swforced" === selectHwa
              ? ((config.EnableHardwareToneMapping = !1), (config.EnableSoftwareToneMapping = !0))
              : ((config.EnableHardwareToneMapping = !1), (config.EnableSoftwareToneMapping = !1)),
            []);
        2 === config.HardwareAccelerationMode &&
          Array.prototype.forEach.call(form.querySelectorAll(".chkEnableCodec"), function (c) {
            var priority = c.checked
                ? 100 -
                  (function (checkBox) {
                    var li = checkBox.closest(".sortableOption"),
                      index = 0;
                    for (; (li = li.previousElementSibling); ) index++;
                    return index;
                  })(c)
                : 0,
              priority = {CodecId: c.getAttribute("data-codec"), Priority: priority, IsEnabled: c.checked};
            codecConfigs.push(priority);
          }),
          (config.HardwareAccelerationType = null),
          (config.CodecConfigurations = codecConfigs),
          apiClient.updateNamedConfiguration("encoding", config).then(function (response) {
            _loading.default.hide(), _formhelper.default.handleConfigurationSavedResponse(response);
          });
      }),
      e.preventDefault(),
      e.stopPropagation(),
      !1
    );
  }
  function getConfigurationByCodecId(codecConfigs, codecId) {
    if (codecId && null != codecConfigs && 0 !== codecConfigs.length)
      for (var i = 0; i < codecConfigs.length; i++)
        if (codecConfigs[i] && codecConfigs[i].CodecId && codecConfigs[i].CodecId === codecId) return codecConfigs[i];
    return null;
  }
  function distinct(value, index, self) {
    return self.indexOf(value) === index;
  }
  function onCodecClick(e) {
    var li,
      list,
      e = e.target.closest(".btnSortable");
    e &&
      ((list = (li = e.closest(".sortableOption")).closest(".codecList")),
      e.classList.contains("btnSortableMoveDown")
        ? (e = li.nextElementSibling) &&
          (li.parentNode.removeChild(li), e.parentNode.insertBefore(li, e.nextElementSibling))
        : (e = li.previousElementSibling) && (li.parentNode.removeChild(li), e.parentNode.insertBefore(li, e)),
      Array.prototype.forEach.call(list.querySelectorAll(".sortableOption"), adjustSortableListElement));
  }
  function adjustSortableListElement(elem) {
    var btnSortable = elem.querySelector(".btnSortable");
    elem.previousElementSibling
      ? (btnSortable.classList.add("btnSortableMoveUp"),
        btnSortable.classList.remove("btnSortableMoveDown"),
        (btnSortable.querySelector("i").innerHTML = "keyboard_arrow_up"))
      : (btnSortable.classList.remove("btnSortableMoveUp"),
        btnSortable.classList.add("btnSortableMoveDown"),
        (btnSortable.querySelector("i").innerHTML = "keyboard_arrow_down")),
      elem.nextElementSibling ? elem.classList.add("listItem-border") : elem.classList.remove("listItem-border");
  }
  function onHwaModeChange(e) {
    for (
      var advancedSections = this.closest(".page").querySelectorAll(".hwaAdvanced"),
        mode = this.value,
        i = 0,
        length = advancedSections.length;
      i < length;
      i++
    )
      "2" === mode ? advancedSections[i].classList.remove("hide") : advancedSections[i].classList.add("hide");
  }
  function onSelectToneMappingEnabledChanged(e) {
    var descriptionText,
      selectContainer = this.closest(".selectContainer"),
      value = this.value,
      value =
        ("both" === value
          ? (descriptionText = _globalize.default.translate("ToneMappingInBothDescription"))
          : "hw" === value
          ? (descriptionText = _globalize.default.translate("ToneMappingInHardwareDescription"))
          : "swforced" === value &&
            (descriptionText = _globalize.default.translate("ToneMappingInSoftwareDescription")),
        selectContainer.querySelector(".toneMappingDescription"));
    (value.innerHTML = descriptionText || ""),
      descriptionText ? value.classList.remove("hide") : value.classList.add("hide");
  }
  function onMediaEncodingInitializaed(page, apiClient, toneMapOptions) {
    _loading.default.show();
    var configPromise = apiClient.getNamedConfiguration("encoding"),
      codecInfoPromise = apiClient.getVideoCodecInformation().catch(function () {
        return [];
      }),
      apiClient = apiClient.getJSON(apiClient.getUrl("Encoding/CodecConfiguration/Defaults")).catch(function () {
        return [];
      });
    !(function (page, toneMapOptions) {
      var innerHTML;
      toneMapOptions.OptionsVisibility.IsSoftwareToneMappingAvailable ||
      toneMapOptions.OptionsVisibility.IsAnyHardwareToneMappingAvailable
        ? ((innerHTML = ""),
          (innerHTML += '<option value="">' + _globalize.default.translate("No") + "</option>"),
          toneMapOptions.OptionsVisibility.IsAnyHardwareToneMappingAvailable
            ? (innerHTML =
                (innerHTML +=
                  '<option value="hw">' +
                  _globalize.default.translate("WithHardwareAcceleratedTranscoding") +
                  "</option>") +
                '<option value="both">' +
                _globalize.default.translate("WithEitherHardwareOrSoftwareTranscoding") +
                "</option>")
            : (innerHTML += '<option value="both">' + _globalize.default.translate("Yes") + "</option>"),
          (page.querySelector(".selectToneMapping").innerHTML = innerHTML),
          page.querySelector(".fldToneMapping").classList.remove("hide"))
        : page.querySelector(".fldToneMapping").classList.add("hide");
    })(page, toneMapOptions),
      Promise.all([configPromise, codecInfoPromise, apiClient]).then(function (responses) {
        loadPage(page, responses[0], responses[1], responses[2]);
      });
  }
  function checkMediaEncodingInitialization(page, apiClient) {
    _loading.default.show(),
      apiClient.getToneMapOptions().then(
        function (toneMapOptions) {
          page.querySelector(".encodingSettingsForm").classList.remove("hide"),
            page.querySelector(".encodingNotInitializedMessage").classList.add("hide"),
            onMediaEncodingInitializaed(page, apiClient, toneMapOptions);
        },
        function (errorResponse) {
          page.querySelector(".encodingSettingsForm").classList.add("hide"),
            page.querySelector(".encodingNotInitializedMessage").classList.remove("hide"),
            503 === errorResponse.status
              ? (function (page, apiClient) {
                  setTimeout(function () {
                    checkMediaEncodingInitialization(page, apiClient);
                  }, 1e3);
                })(page, apiClient)
              : _loading.default.hide();
        }
      );
  }
  function View(view, params) {
    _baseview.default.apply(this, arguments);
    var apiClient = _connectionmanager.default.currentApiClient();
    view.querySelector("#selectHwa").addEventListener("change", onHwaModeChange),
      (view.querySelector(".hwaGuideLink").innerHTML = _globalize.default.translate(
        "SeeOurHwaGuide",
        '<a is="emby-linkbutton" href="https://support.emby.media/support/solutions/articles/44001160148-hardware-acceleration-overview" class="button-link" target="_blank">',
        "</a>"
      )),
      view.querySelector("#btnSelectTranscodingTempPath").addEventListener("click", function () {
        require(["directorybrowser"], function (directoryBrowser) {
          var picker = new directoryBrowser();
          picker.show({
            callback: function (path) {
              path && (view.querySelector("#txtTranscodingTempPath").value = path), picker.close();
            },
            validateWriteable: !0,
            header: _globalize.default.translate("HeaderSelectTranscodingPath"),
            instruction: _globalize.default.translate("HeaderSelectTranscodingPathHelp"),
          });
        });
      }),
      view.querySelector(".encodingSettingsForm").addEventListener("submit", onSubmit),
      apiClient.getSystemInfo().then(function (systemInfo) {
        for (
          var hwaPremiereInfo = view.querySelectorAll(".hwaPremiereInfo"), i = 0, length = hwaPremiereInfo.length;
          i < length;
          i++
        )
          systemInfo.HardwareAccelerationRequiresPremiere
            ? hwaPremiereInfo[i].classList.remove("hide")
            : hwaPremiereInfo[i].classList.add("hide"),
            (hwaPremiereInfo[i].innerHTML = _globalize.default.translate(
              "",
              '<a href="https://emby.media/premiere" data-preset="premiereinfo" is="emby-linkbutton" type="button" class="button-link btnHwaPremiere">',
              "</a>"
            ));
      }),
      view.querySelector(".selectToneMapping").addEventListener("change", onSelectToneMappingEnabledChanged);
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    Object.assign(View.prototype, _baseview.default.prototype),
    (View.prototype.onResume = function (options) {
      _baseview.default.prototype.onResume.apply(this, arguments),
        checkMediaEncodingInitialization(this.view, ApiClient);
    }),
    (_exports.default = View);
});
