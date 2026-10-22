define(["exports", "./../common/globalize.js"], function (_exports, _globalize) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var units = [
    ["year", 31536e6],
    ["month", 2592e6],
    ["week", 6048e5],
    ["day", 864e5],
    ["hour", 36e5],
    ["minute", 6e4],
    ["second", 1e3],
  ];
  var _default =
    window.Intl && window.Intl.RelativeTimeFormat
      ? function (date_str, isPastEvent) {
          for (
            var unit,
              date_str = new Date(Date.parse(date_str)).getTime() - Date.now(),
              elapsedMsAbs = Math.abs(date_str),
              i = 0,
              length = units.length;
            i < length && !(elapsedMsAbs >= (unit = units[i])[1]);
            i++
          );
          return (
            (date_str = Math.round(date_str / unit[1])),
            !1 !== isPastEvent &&
              -1 < (date_str = Math.min(date_str, 1)) &&
              ((date_str = -1), (unit = units[units.length - 1])),
            new Intl.RelativeTimeFormat(_globalize.default.getCurrentLocales()).format(date_str, unit[0])
          );
        }
      : function (date_str) {
          var format,
            time_formats = [
              [90, "1分钟"],
              [3600, "分钟", 60],
              [5400, "1小时"],
              [86400, "小时", 3600],
              [129600, "1天"],
              [604800, "天", 86400],
              [907200, "1周"],
              [2628e3, "周", 604800],
              [3942e3, "1个月"],
              [31536e3, "个月", 2628e3],
              [47304e3, "1年"],
              [31536e5, "年", 31536e3],
            ],
            seconds = (new Date() - new Date(Date.parse(date_str))) / 1e3,
            i = 0;
          for (seconds < 0 && (seconds = Math.abs(seconds)); null != (format = time_formats[i++]); )
            if (seconds < format[0])
              return 2 === format.length
                ? format[1] + "前"
                : Math.round(seconds / format[2]) + " " + format[1] + "前";
          return 47304e5 < seconds ? Math.round(seconds / 47304e5) + "世纪前" : date_str;
        };
  _exports.default = _default;
});
