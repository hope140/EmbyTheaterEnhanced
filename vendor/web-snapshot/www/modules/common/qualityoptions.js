define(["exports", "./globalize.js"], function (_exports, _globalize) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (_exports.default = {
      getVideoQualityOptions: function (options) {
        var maxStreamingBitrate = options.currentMaxBitrate,
          maxAllowedWidth = options.videoWidth || 4096,
          qualityOptions = [],
          maxAllowedWidth =
            (1900 <= maxAllowedWidth &&
              (qualityOptions.push({name: "媒体源直接传输", maxHeight: 2160, bitrate: 12e7})),
            1900 <= maxAllowedWidth
              ? (qualityOptions.push({name: "1080P【超清】", maxHeight: 1080, bitrate: 10000001}),
                qualityOptions.push({name: "1080P【高清】", maxHeight: 1080, bitrate: 8000001}),
                qualityOptions.push({name: "1080P【标清】", maxHeight: 1080, bitrate: 6000001}),
                qualityOptions.push({name: "1080P【流畅】", maxHeight: 1080, bitrate: 4000002}))
              : 1260 <= maxAllowedWidth
              ? (qualityOptions.push({name: "媒体源直接传输", maxHeight: 720, bitrate: 1e7}),
                qualityOptions.push({name: "720P【超清】", maxHeight: 720, bitrate: 8e6}),
                qualityOptions.push({name: "720P【高清】", maxHeight: 720, bitrate: 6e6}),
                qualityOptions.push({name: "720P【标清】", maxHeight: 720, bitrate: 5e6}),
                qualityOptions.push({name: "720P【流畅】", maxHeight: 720, bitrate: 3e6}))
              : 620 <= maxAllowedWidth &&
                (qualityOptions.push({name: "媒体源直接传输", maxHeight: 480, bitrate: 4000001}),
                qualityOptions.push({name: "480P【超清】", maxHeight: 480, bitrate: 3000001}),
                qualityOptions.push({name: "480P【高清】", maxHeight: 480, bitrate: 25e5}),
                qualityOptions.push({name: "480P【标清】", maxHeight: 480, bitrate: 2000001}),
                qualityOptions.push({name: "480P【流畅】", maxHeight: 480, bitrate: 1500001})),
            1260 <= maxAllowedWidth &&
            (qualityOptions.push({name: "720P【清晰】", maxHeight: 720, bitrate: 4e6})),
            qualityOptions.push({name: "480P【流畅】", maxHeight: 480, bitrate: 1e6}),
            qualityOptions.push({name: "240P【极速】", maxHeight: 240, bitrate: 32e4}),
            {name: _globalize.default.translate("Auto"), bitrate: 0, selected: options.isAutomaticBitrateEnabled});
        if ((options.enableAuto && qualityOptions.push(maxAllowedWidth), maxStreamingBitrate)) {
          for (var selectedIndex = -1, i = 0, length = qualityOptions.length; i < length; i++) {
            var option = qualityOptions[i];
            -1 === selectedIndex && option.bitrate <= maxStreamingBitrate && (selectedIndex = i);
          }
          var currentQualityOption =
            qualityOptions[(selectedIndex = -1 === selectedIndex ? qualityOptions.length - 1 : selectedIndex)];
          options.isAutomaticBitrateEnabled
            ? (maxAllowedWidth.autoText = currentQualityOption.name)
            : (currentQualityOption.selected = !0);
        }
        return qualityOptions;
      },
      getAudioQualityOptions: function (options) {
        var maxStreamingBitrate = options.currentMaxBitrate,
          qualityOptions = [],
          autoQualityOption =
            (qualityOptions.push({name: "媒体源直接传输", bitrate: 12e7}),
            qualityOptions.push({name: "2M【超品质】", bitrate: 2e6}),
            qualityOptions.push({name: "1M【高品质】", bitrate: 1e6}),
            qualityOptions.push({name: "512K【较高】", bitrate: 512e3}),
            qualityOptions.push({name: "320K【标准】", bitrate: 32e4}),
            qualityOptions.push({name: "192K【普通】", bitrate: 192e3}),
            {name: _globalize.default.translate("Auto"), bitrate: 0, selected: options.isAutomaticBitrateEnabled});
        if ((options.enableAuto && qualityOptions.push(autoQualityOption), maxStreamingBitrate)) {
          for (var selectedIndex = -1, i = 0, length = qualityOptions.length; i < length; i++) {
            var option = qualityOptions[i];
            -1 === selectedIndex && option.bitrate <= maxStreamingBitrate && (selectedIndex = i);
          }
          var currentQualityOption =
            qualityOptions[(selectedIndex = -1 === selectedIndex ? qualityOptions.length - 1 : selectedIndex)];
          options.isAutomaticBitrateEnabled
            ? (autoQualityOption.autoText = currentQualityOption.name)
            : (currentQualityOption.selected = !0);
        }
        return qualityOptions;
      },
    });
});
