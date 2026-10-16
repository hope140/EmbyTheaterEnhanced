'use strict';

const crypto = require('node:crypto');

function method(source, name, replacement) {
    const marker = '            key: "' + name + '",\n';
    if (source.split(marker).length !== 2) throw new Error('ApiClient lifecycle method mismatch: ' + name);
    const begin = source.indexOf(marker) + marker.length;
    const end = source.indexOf('\n            },\n          },', begin);
    if (end < begin) throw new Error('ApiClient lifecycle method end mismatch: ' + name);
    return source.slice(0, begin) + replacement.trimEnd() + source.slice(end + '\n            },'.length);
}

function patchApiClient(source) {
    if (typeof source !== 'string' || crypto.createHash('sha256').update(source).digest('hex') !==
        'a4a901640abe6bc25188c1cf27fb53125b4f65ef2a797def033dc55165b080ae') {
        throw new Error('ApiClient lifecycle authoritative payload hash mismatch.');
    }
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    let output = method(source.replace(/\r\n/g, '\n'), 'logout', `            value: function () {
              function done() {
                finished = true;
                try {
                  return _this.setAuthenticationInfo(null, null), Promise.resolve();
                } finally {
                  _this._eteLogoutCount--;
                }
              }
              var url,
                _this = this,
                finished = false;
              this._eteLogoutCount = (this._eteLogoutCount || 0) + 1;
              try {
                this.closeWebSocket();
                return this.accessToken()
                  ? ((url = this.getUrl("Sessions/Logout")),
                    this.ajax({type: "POST", url: url, timeout: 1e4}).then(done, done))
                  : done();
              } catch (error) {
                if (!finished) this._eteLogoutCount--;
                throw error;
              }
            },`);
    output = method(output, 'ensureWebSocket', `            value: function () {
              if (!this._eteLogoutCount && this.connected && !this.isWebSocketOpenOrConnecting() && this.isWebSocketSupported())
                try {
                  this.openWebSocket();
                } catch (err) {
                  console.log("Error opening web socket: ".concat(err || ""));
                }
            },`);
    output = method(output, 'openWebSocket', `            value: function () {
              if (this._eteLogoutCount) return;
              var accessToken = this.accessToken();
              if (!accessToken) throw new Error("Cannot open web socket without access token.");
              var apiClient = this;
              var previousSocket = this._webSocket;
              var url = replaceAll(this.getUrl("socket"), "emby/socket", "embywebsocket");
              url = replaceAll(replaceAll(url, "https:", "wss:"), "http:", "ws:");
              url += "?api_key=" + accessToken + "&deviceId=" + this.deviceId();
              var socket = new WebSocket(url);
              if (this._eteReconnectTimer != null) clearTimeout(this._eteReconnectTimer);
              if (this._eteCloseTimer != null) clearTimeout(this._eteCloseTimer);
              this._eteReconnectTimer = this._eteCloseTimer = null;
              var epoch = this._eteSocketEpoch = (this._eteSocketEpoch || 0) + 1;
              this._webSocket = socket;
              function current() {
                return apiClient._eteSocketEpoch === epoch && apiClient._webSocket === socket && !apiClient._eteLogoutCount;
              }
              socket.onmessage = function (msg) {
                if (current()) onMessageReceivedInternal(apiClient, JSON.parse(msg.data));
              };
              socket.onopen = function () {
                if (!current()) return;
                apiClient._webSocketReconnectAttempts = 0;
                _events.default.trigger(apiClient, "websocketopen");
                var list = apiClient.messageListeners;
                if (list) {
                  list = list.slice(0);
                  for (var i = 0; i < list.length && current(); i++) {
                    apiClient.startMessageListener(list[i].name, list[i].options);
                  }
                }
              };
              socket.onerror = function () {
                if (current()) _events.default.trigger(apiClient, "websocketerror");
              };
              socket.onclose = function () {
                if (!current()) return;
                apiClient._webSocket = null;
                var closeTimer = setTimeout(function () {
                  if (apiClient._eteSocketEpoch !== epoch || apiClient._eteCloseTimer !== closeTimer) return;
                  apiClient._eteCloseTimer = null;
                  _events.default.trigger(apiClient, "websocketclose");
                }, 0);
                apiClient._eteCloseTimer = closeTimer;
                if (apiClient.isLoggedIn()) {
                  apiClient._webSocketReconnectAttempts = (apiClient._webSocketReconnectAttempts || 0) + 1;
                  var delay = Math.min(3e4, 1e3 * Math.pow(2, apiClient._webSocketReconnectAttempts - 1));
                  var retryTimer = setTimeout(function () {
                    if (apiClient._eteSocketEpoch !== epoch || apiClient._eteReconnectTimer !== retryTimer) return;
                    apiClient._eteReconnectTimer = null;
                    if (!apiClient._eteLogoutCount && apiClient.isLoggedIn()) apiClient.ensureWebSocket();
                  }, delay);
                  apiClient._eteReconnectTimer = retryTimer;
                }
              };
              if (previousSocket && (previousSocket.readyState === WebSocket.OPEN || previousSocket.readyState === WebSocket.CONNECTING)) {
                previousSocket.close();
              }
            },`);
    output = method(output, 'closeWebSocket', `            value: function () {
              var apiClient = this;
              var socket = this._webSocket;
              var notifyClose = !!socket || this._eteCloseTimer != null;
              if (this._eteReconnectTimer != null) clearTimeout(this._eteReconnectTimer);
              if (this._eteCloseTimer != null) clearTimeout(this._eteCloseTimer);
              this._eteReconnectTimer = this._eteCloseTimer = null;
              this._webSocket = null;
              var epoch = this._eteSocketEpoch = (this._eteSocketEpoch || 0) + 1;
              if (notifyClose) {
                var closeTimer = setTimeout(function () {
                  if (apiClient._eteSocketEpoch !== epoch || apiClient._eteCloseTimer !== closeTimer) return;
                  apiClient._eteCloseTimer = null;
                  _events.default.trigger(apiClient, "websocketclose");
                }, 0);
                this._eteCloseTimer = closeTimer;
              }
              if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close();
            },`);
    return eol === '\r\n' ? output.replace(/\n/g, '\r\n') : output;
}

module.exports = {patchApiClient};
