define(["exports"], function (_exports) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    (_exports.default = {
      getDisplayPlayMethod: function (session) {
        return session.NowPlayingItem
          ? session.TranscodingInfo && session.TranscodingInfo.IsVideoDirect
            ? "DirectStream"
            : "Transcode" === session.PlayState.PlayMethod
            ? "Transcode"
            : "DirectStream" === session.PlayState.PlayMethod || "DirectPlay" === session.PlayState.PlayMethod
            ? "DirectPlay"
            : void 0
          : null;
      },
    });
});
