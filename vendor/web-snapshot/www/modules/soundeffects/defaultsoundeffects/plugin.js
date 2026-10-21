define([], function () {
  "use strict";
  function DefaultSoundEffects() {
    (this.name = "默认音效"), (this.type = "soundeffects"), (this.id = "defaultsoundeffects");
  }
  return (
    (DefaultSoundEffects.prototype.getEffects = function () {
      return {navigation: "navigation.mp3", select: "select.mp3"};
    }),
    DefaultSoundEffects
  );
});
