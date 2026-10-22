'use strict';

const crypto = require('node:crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function checked(source, expected, label) {
    if (typeof source !== 'string' || sha(source) !== expected) throw new Error('User Web patch ' + label + ' hash mismatch.');
    return source;
}
function replaceOnce(source, before, after) {
    if (source.split(before).length !== 2) throw new Error('User Web patch anchor mismatch.');
    return source.replace(before, () => after);
}
const crlf = text => text.replace(/\n/g, '\r\n') + '\r\n';

// Exact deltas from the retained historical page to the user's combined patch.
// Context is inherited material, not a claim of ETE authorship. Preserve the old
// payload's mixed line endings for the existing lifecycle transform's input hash.
function patchApiClient(source) {
    let output = checked(source, 'f3516c72784e5bc8782abbce021f22a7f939034e5b8b70639672ae682e18acc0', 'ApiClient base');
    output = replaceOnce(output, crlf(`                (accessToken.onopen = function () {
                  console.log("web socket connection opened"), _events.default.trigger(this, "websocketopen");
                  var list = this.messageListeners;
                  if (list)
                    for (var i = 0, length = (list = list.slice(0)).length; i < length; i++) {`), `                (accessToken.onopen = function () {
                  console.log("web socket connection opened"), _events.default.trigger(this, "websocketopen");
                  this._webSocketReconnectAttempts = 0;
                  var list = this.messageListeners;
                  if (list)
                    for (var i = 0, length = (list = list.slice(0)).length; i < length; i++) {` + "\n");
    output = replaceOnce(output, crlf(`                ((socket = accessToken).onclose = function () {
                  console.log("web socket closed"),
                    apiClient._webSocket === socket &&
                      (console.log("nulling out web socket"), (apiClient._webSocket = null)),
                    setTimeout(function () {
                      _events.default.trigger(apiClient, "websocketclose");
                    }, 0);
                }),
                (this._webSocket = accessToken);`), `                ((socket = accessToken).onclose = function () {
                  console.log("web socket closed"),
                    apiClient._webSocket === socket &&
                      (console.log("nulling out web socket"), (apiClient._webSocket = null)),
                    setTimeout(function () {
                      _events.default.trigger(apiClient, "websocketclose");
                    }, 0);
                  if (apiClient.isLoggedIn()) {
                    apiClient._webSocketReconnectAttempts = (apiClient._webSocketReconnectAttempts || 0) + 1;
                    var reconnectDelay = Math.min(3e4, 1e3 * Math.pow(2, apiClient._webSocketReconnectAttempts - 1));
                    console.log(
                      "web socket reconnect scheduled in "
                        .concat(reconnectDelay, " ms (attempt ")
                        .concat(apiClient._webSocketReconnectAttempts, ")")
                    );
                    setTimeout(function () {
                      apiClient.ensureWebSocket();
                    }, reconnectDelay);
                  }
                }),
                (this._webSocket = accessToken);` + "\n");
    output = replaceOnce(output, crlf(`              } else this.lastPlaybackProgressReport = 0;
              this.lastPlaybackProgressReportTicks = newPositionTicks;
              msSinceLastReport = this.getUrl("Sessions/Playing/Progress");
              return this.ajax({
                type: "POST",
                data: JSON.stringify(options),`), `              } else this.lastPlaybackProgressReport = 0;
              this.lastPlaybackProgressReportTicks = newPositionTicks;
              msSinceLastReport = this.getUrl("Sessions/Playing/Progress");
              this.ensureWebSocket();
              return this.ajax({
                type: "POST",
                data: JSON.stringify(options),` + "\n");
    return checked(output, 'a4a901640abe6bc25188c1cf27fb53125b4f65ef2a797def033dc55165b080ae', 'ApiClient output');
}

function patchToastCss(source) {
    checked(source, 'e4e8efcdfbe4841fd05b6cfe6b2a94393474899f3977416077d99b4f8cad0e39', 'toast base');
    // The historical patch removed this rule and converted the entire CSS to LF.
    const output = replaceOnce(source.replace(/\r\n/g, '\n'), `[class*="accent-"].noScrollY.transparentDocument .toast-group {
  position: relative;
  transform: translate(-50%, -50%);
  top: 15%;
  left: 50%;
}
`, '');
    return checked(output, '654aeb05c1b89ca625cc6bd9145f1966a780c0e80fe1197f619800c5f1894743', 'toast output');
}

module.exports = {patchApiClient, patchToastCss};
