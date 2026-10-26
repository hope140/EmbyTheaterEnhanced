(function (factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
}(function () {
    'use strict';
    var progressChoices = Object.freeze([50, 60, 70, 80, 90]);
    var preloadChoicesMB = Object.freeze([100, 300, 500]);
    function selection(options) {
        options = options || {};
        var progressPercent = options.progressPercent == null ? 70 : options.progressPercent;
        var preloadMB = options.preloadMB == null ? 300 : options.preloadMB;
        if (progressChoices.indexOf(progressPercent) < 0 || preloadChoicesMB.indexOf(preloadMB) < 0) throw Error('range-selection-invalid');
        return Object.freeze({progressPercent: progressPercent, preloadMB: preloadMB, prefetchBytes: preloadMB * 1024 * 1024});
    }
    return {selection: selection, progressChoices: progressChoices, preloadChoicesMB: preloadChoicesMB};
}));
