define(["exports", "./events.js"], function (_exports, _events) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  function isLocalId(str) {
    return str && str.startsWith("local:");
  }
  function replaceAll(originalString, strReplace, strWith) {
    strReplace = new RegExp(strReplace, "ig");
    return originalString.replace(strReplace, strWith);
  }
  function paramsToString(params) {
    var key,
      values = [];
    for (key in params) {
      var value = params[key];
      null != value &&
        "" !== value &&
        values.push("".concat(encodeURIComponent(key), "=").concat(encodeURIComponent(value)));
    }
    return values.join("&");
  }
  function getFetchPromise(instance, request, signal) {
    if (signal && signal.aborted) return Promise.reject((((err = new Error("AbortError")).name = "AbortError"), err));
    var err = request.headers || {},
      fetchRequest =
        ("json" === request.dataType && (err.accept = "application/json"),
        {headers: err, method: request.type, credentials: "same-origin"}),
      boundAbort =
        (request.timeout &&
          ((boundAbort = (abortController = new AbortController()).abort.bind(abortController)),
          signal && signal.addEventListener("abort", boundAbort),
          setTimeout(boundAbort, request.timeout),
          (signal = abortController.signal)),
        signal && (fetchRequest.signal = signal),
        request.contentType),
      abortController =
        (request.data &&
          ("string" == typeof request.data
            ? (fetchRequest.body = request.data)
            : ((fetchRequest.body = paramsToString(request.data)),
              (boundAbort = boundAbort || "application/x-www-form-urlencoded; charset=UTF-8"))),
        request.url);
    return (
      instance._enableQueryStringRequestContentType &&
        "application/json" === boundAbort &&
        ((boundAbort = "text/plain"),
        (abortController = abortController + (abortController.includes("?") ? "&" : "?") + "reqformat=json")),
      boundAbort && (err["Content-Type"] = boundAbort),
      fetch(abortController, fetchRequest)
    );
  }
  function setSavedEndpointInfo(instance, info) {
    instance._endPointInfo = info;
  }
  function _onNetworkChanged(instance, resetAddress) {
    resetAddress &&
      ((instance.connected = !1),
      (resetAddress = getAddresses(instance.serverInfo())).length && (instance._serverAddress = resetAddress[0].url)),
      setSavedEndpointInfo(instance, null);
  }
  function getAddresses(serverInfo) {
    var address,
      addresses = [],
      addressesStrings = [];
    return (
      !serverInfo.ManualAddress ||
        (!(address = serverInfo.ManualAddress).includes("://127.0.0.1") &&
          !address.toLowerCase().includes("://localhost")) ||
        addressesStrings.includes(serverInfo.ManualAddress.toLowerCase()) ||
        (addresses.push({url: serverInfo.ManualAddress}),
        addressesStrings.push(addresses[addresses.length - 1].url.toLowerCase())),
      serverInfo.LocalAddress &&
        !addressesStrings.includes(serverInfo.LocalAddress.toLowerCase()) &&
        (addresses.push({url: serverInfo.LocalAddress}),
        addressesStrings.push(addresses[addresses.length - 1].url.toLowerCase())),
      serverInfo.ManualAddress &&
        !addressesStrings.includes(serverInfo.ManualAddress.toLowerCase()) &&
        (addresses.push({url: serverInfo.ManualAddress}),
        addressesStrings.push(addresses[addresses.length - 1].url.toLowerCase())),
      serverInfo.RemoteAddress &&
        !addressesStrings.includes(serverInfo.RemoteAddress.toLowerCase()) &&
        (addresses.push({url: serverInfo.RemoteAddress}),
        addressesStrings.push(addresses[addresses.length - 1].url.toLowerCase())),
      console.log("getAddresses: ".concat(addressesStrings.join("|"))),
      addresses
    );
  }
  function setTimeoutPromise(timeout) {
    return new Promise(function (resolve) {
      setTimeout(resolve, timeout);
    });
  }
  function tryReconnectInternal(instance, signal) {
    var addresses = getAddresses(instance.serverInfo());
    if (!addresses.length) return Promise.reject();
    if (1 === addresses.length) return Promise.resolve(addresses[0].url);
    for (
      var abortController = new AbortController(),
        boundAbort = abortController.abort.bind(abortController),
        promises = (signal && signal.addEventListener("abort", boundAbort), (signal = abortController.signal), []),
        i = 0,
        length = addresses.length;
      i < length;
      i++
    )
      promises.push(
        (function (instance, url, delay, signal) {
          return (
            console.log("tryReconnectToUrl: ".concat(url)),
            setTimeoutPromise(delay).then(function () {
              return getFetchPromise(
                instance,
                {url: instance.getUrl("system/info/public", null, url), type: "GET", dataType: "json", timeout: 15e3},
                signal
              ).then(function () {
                return url;
              });
            })
          );
        })(instance, addresses[i].url, 200 * i, signal)
      );
    return Promise.any(promises).then(function (url) {
      return instance.serverAddress(url), abortController.abort(), Promise.resolve(url);
    });
  }
  function tryReconnect(instance, signal, argument_2) {
    var retryCount = 2 < arguments.length && void 0 !== argument_2 ? argument_2 : 0,
      promise = tryReconnectInternal(instance, signal);
    return 2 <= retryCount
      ? promise
      : promise.catch(function (err) {
          return (
            console.log("error in tryReconnectInternal: ".concat(err || "")),
            setTimeoutPromise(500).then(function () {
              return tryReconnect(instance, signal, retryCount + 1);
            })
          );
        });
  }
  function getUserCacheKey(userId, serverId) {
    return "user-".concat(userId, "-").concat(serverId);
  }
  function getCachedUser(instance, userId) {
    var serverId = instance.serverId();
    if (!serverId) return null;
    instance = instance.appStorage.getItem(getUserCacheKey(userId, serverId));
    return instance ? ((userId = JSON.parse(instance)) && (userId.Type = "User"), userId) : null;
  }
  function saveUserInCache(_ref, user) {
    _ref = _ref.appStorage;
    (user.Type = "User"),
      (user.DateLastFetched = Date.now()),
      _ref.setItem(getUserCacheKey(user.Id, user.ServerId), JSON.stringify(user));
  }
  function removeCachedUser(_ref2, userId, serverId) {
    _ref2.appStorage.removeItem(getUserCacheKey(userId, serverId));
  }
  var messageIdsReceived = {};
  function onMessageReceivedInternal(instance, msg) {
    var messageId = msg.MessageId;
    if (messageId) {
      if (messageIdsReceived[messageId]) return;
      messageIdsReceived[messageId] = !0;
    }
    var user,
      messageId = msg.MessageType;
    "UserUpdated" === messageId || "UserConfigurationUpdated" === messageId || "UserPolicyUpdated" === messageId
      ? (user = msg.Data).Id === instance.getCurrentUserId() &&
        (saveUserInCache(instance, user), (instance._userViewsPromise = null))
      : "LibraryChanged" === messageId && (instance._userViewsPromise = null),
      _events.default.trigger(instance, "message", [msg]);
  }
  function detectBitrateWithEndpointInfo(instance, _ref3) {
    if (_ref3.IsInNetwork) return 14e7;
    if (instance.getMaxBandwidth) {
      _ref3 = instance.getMaxBandwidth();
      if (_ref3) return _ref3;
    }
    return 5e6;
  }
  function getRemoteImagePrefix(instance, options) {
    var urlPrefix = "Items/".concat(options.itemId);
    return delete options.itemId, urlPrefix;
  }
  function setUsersProperties(response) {
    return response.forEach(setUserProperties), Promise.resolve(response);
  }
  function setUserProperties(user) {
    user.Type = "User";
  }
  function normalizeImageOptions(_ref4, options) {
    var _ref4 = _ref4._devicePixelRatio;
    !1 !== options.adjustForPixelRatio &&
      (_ref4 = _ref4 || 1) &&
      (options.width && (options.width = Math.round(options.width * _ref4)),
      options.height && (options.height = Math.round(options.height * _ref4)),
      options.maxWidth && (options.maxWidth = Math.round(options.maxWidth * _ref4)),
      options.maxHeight && (options.maxHeight = Math.round(options.maxHeight * _ref4))),
      delete options.adjustForPixelRatio,
      options.quality || ("Backdrop" === options.type ? (options.quality = 70) : (options.quality = 90));
  }
  function mapToId(i) {
    return i.Id;
  }
  var startingPlaySession = Date.now();
  function onUserDataUpdated(userData) {
    var instance = this.instance,
      itemId = this.itemId,
      userId = this.userId;
    return (
      (userData.ItemId = itemId),
      _events.default.trigger(instance, "message", [
        {MessageType: "UserDataChanged", Data: {UserId: userId, UserDataList: [userData], IsLocalEvent: !0}},
      ]),
      userData
    );
  }
  function onItemUpdated(result) {
    var instance = this.instance,
      itemId = this.itemId;
    return (
      _events.default.trigger(instance, "message", [
        {
          MessageType: "LibraryChanged",
          Data: {ItemsAdded: [], ItemsRemoved: [], ItemsUpdated: [itemId], IsLocalEvent: !0},
        },
      ]),
      result
    );
  }
  function onItemsDeleted(result) {
    for (
      var instance = this.instance,
        items = this.items,
        foldersRemovedFrom = [],
        itemsRemoved = [],
        i = 0,
        length = items.length;
      i < length;
      i++
    ) {
      var item = items[i];
      item.ParentId && foldersRemovedFrom.push(item.ParentId), itemsRemoved.push(item.Id);
    }
    return (
      _events.default.trigger(instance, "message", [
        {
          MessageType: "LibraryChanged",
          Data: {
            ItemsAdded: [],
            ItemsRemoved: itemsRemoved,
            ItemsUpdated: [],
            FoldersRemovedFrom: foldersRemovedFrom,
            IsLocalEvent: !0,
          },
        },
      ]),
      result
    );
  }
  function getCachedWakeOnLanInfo(instance) {
    var serverId = instance.serverId(),
      instance = instance.appStorage.getItem("server-".concat(serverId, "-wakeonlaninfo"));
    return instance ? JSON.parse(instance) : [];
  }
  function refreshWakeOnLanInfoIfNeeded(instance) {
    instance._wakeOnLan.isSupported() &&
      instance.accessToken() &&
      !1 !== instance.enableAutomaticBitrateDetection &&
      (console.log("refreshWakeOnLanInfoIfNeeded"),
      setTimeout(
        function () {
          var instance = this;
          console.log("refreshWakeOnLanInfo"),
            instance.getWakeOnLanInfo().then(
              function (info) {
                var serverId = instance.serverId();
                return (
                  instance.appStorage.setItem("server-".concat(serverId, "-wakeonlaninfo"), JSON.stringify(info)), info
                );
              },
              function (err) {
                return console.log("Error in getWakeOnLanInfo: ".concat(err || "")), [];
              }
            );
        }.bind(instance),
        1e4
      ));
  }
  function reversePrefixes(prefixes) {
    return prefixes.reverse(), prefixes;
  }
  function updateTagItemsResponse(promise, query) {
    return promise.then(function (result) {
      var outerIds = query.OuterIds ? query.OuterIds.split(",") : [];
      return (
        outerIds.length &&
          (result.Items = result.Items.filter(function (i) {
            return outerIds.includes(i.Id);
          })),
        result.TotalRecordCount ||
          !1 === query.EnableTotalRecordCount ||
          (result.TotalRecordCount = result.Items.length),
        result
      );
    });
  }
  var StandardWidths = [480, 720, 1280, 1920, 2560, 3840],
    ApiClient = (function () {
      function ApiClient(
        appStorage,
        wakeOnLan,
        serverAddress,
        appName,
        appVersion,
        deviceName,
        deviceId,
        devicePixelRatio
      ) {
        if ((babelHelpers.classCallCheck(this, ApiClient), !serverAddress))
          throw new Error("Must supply a serverAddress");
        if (!appName) throw new Error("Must supply a appName");
        if (!appVersion) throw new Error("Must supply a appVersion");
        if (!deviceName) throw new Error("Must supply a deviceName");
        if (!deviceId) throw new Error("Must supply a deviceId");
        console.log("ApiClient serverAddress: ".concat(serverAddress)),
          console.log("ApiClient appName: ".concat(appName)),
          console.log("ApiClient appVersion: ".concat(appVersion)),
          console.log("ApiClient deviceName: ".concat(deviceName)),
          console.log("ApiClient deviceId: ".concat(deviceId)),
          (this.appStorage = appStorage),
          (this._wakeOnLan = wakeOnLan),
          (this._serverInfo = {}),
          (this._serverAddress = serverAddress),
          (this._deviceId = deviceId),
          (this._deviceName = deviceName),
          (this._appName = appName),
          (this._appVersion = appVersion),
          (this._devicePixelRatio = devicePixelRatio);
      }
      return (
        babelHelpers.createClass(ApiClient, [
          {
            key: "appName",
            value: function () {
              return this._appName;
            },
          },
          {
            key: "setAuthorizationInfoIntoRequest",
            value: function (request, includeAccessToken) {
              var headers = request.headers,
                currentServerInfo = this.serverInfo(),
                appName = this._appName,
                currentServerInfo = currentServerInfo.AccessToken,
                values = [],
                queryStringAuth = this._queryStringAuth,
                authValues = queryStringAuth ? {} : headers,
                appName =
                  (appName &&
                    (authValues
                      ? (authValues["X-Emby-Client"] = appName)
                      : values.push('Client="'.concat(appName, '"'))),
                  this._deviceName &&
                    (authValues
                      ? (authValues["X-Emby-Device-Name"] = queryStringAuth
                          ? this._deviceName
                          : encodeURIComponent(this._deviceName))
                      : values.push('Device="'.concat(encodeURIComponent(this._deviceName), '"'))),
                  this._deviceId &&
                    (authValues
                      ? (authValues["X-Emby-Device-Id"] = this._deviceId)
                      : values.push('DeviceId="'.concat(this._deviceId, '"'))),
                  this._appVersion &&
                    (authValues
                      ? (authValues["X-Emby-Client-Version"] = this._appVersion)
                      : values.push('Version="'.concat(this._appVersion, '"'))),
                  currentServerInfo &&
                    !1 !== includeAccessToken &&
                    (authValues
                      ? (authValues["X-Emby-Token"] = currentServerInfo)
                      : values.push('Token="'.concat(currentServerInfo, '"'))),
                  this.getCurrentLocale());
              appName && authValues && (authValues["X-Emby-Language"] = appName),
                authValues
                  ? queryStringAuth &&
                    (includeAccessToken = paramsToString(authValues)) &&
                    ((currentServerInfo = request.url),
                    (currentServerInfo += currentServerInfo.includes("?") ? "&" : "?"),
                    (request.url = currentServerInfo += includeAccessToken))
                  : values.length &&
                    ((appName = "MediaBrowser ".concat(values.join(", "))),
                    (headers["X-Emby-Authorization"] = appName));
            },
          },
          {
            key: "appVersion",
            value: function () {
              return this._appVersion;
            },
          },
          {
            key: "deviceName",
            value: function () {
              return this._deviceName;
            },
          },
          {
            key: "deviceId",
            value: function () {
              return this._deviceId;
            },
          },
          {
            key: "serverAddress",
            value: function (val) {
              if (null != val) {
                if (!val.toLowerCase().startsWith("http")) throw new Error("Invalid url: ".concat(val));
                (this._serverAddress = val), _onNetworkChanged(this);
              }
              return this._serverAddress;
            },
          },
          {
            key: "onNetworkChanged",
            value: function () {
              _onNetworkChanged(this, !0);
            },
          },
          {
            key: "getUrl",
            value: function (name, params, serverAddress) {
              if (!name) throw new Error("Url name cannot be empty");
              serverAddress = serverAddress || this._serverAddress;
              if (!serverAddress) throw new Error("serverAddress is yet not set");
              var lowered = (serverAddress = serverAddress.endsWith("/")
                ? serverAddress.substring(0, serverAddress.length - 1)
                : serverAddress).toLowerCase();
              return (
                lowered.endsWith("/emby") || lowered.endsWith("/mediabrowser") || (serverAddress += "/emby"),
                name && ("/" !== name.charAt(0) && (serverAddress += "/"), (serverAddress += name)),
                (params = params && paramsToString(params)) && (serverAddress += "?".concat(params)),
                serverAddress
              );
            },
          },
          {
            key: "fetchWithFailover",
            value: function (request, enableReconnection, signal) {
              console.log("apiclient.fetchWithFailover ".concat(request.url)), (request.timeout = 3e4);
              var instance = this;
              return getFetchPromise(this, request, signal).then(
                function (response) {
                  return (
                    (instance.connected = !0),
                    response.status < 400
                      ? "json" === request.dataType || "application/json" === request.headers.accept
                        ? response.json()
                        : "text" === request.dataType ||
                          (response.headers.get("Content-Type") || "").toLowerCase().startsWith("text/") ||
                          204 === response.status
                        ? response.text()
                        : response
                      : Promise.reject(response)
                  );
                },
                function (error) {
                  var previousServerAddress;
                  if (
                    (error
                      ? "AbortError" === error.name
                        ? console.log("AbortError: ".concat(request.url))
                        : console.log(
                            "Request failed to "
                              .concat(request.url, " ")
                              .concat(error.status || "", " ")
                              .concat(error.toString())
                          )
                      : console.log("Request timed out to ".concat(request.url)),
                    (error && error.status) || !enableReconnection)
                  )
                    throw (console.log("Reporting request failure"), error);
                  return (
                    console.log("Attempting reconnection"),
                    (previousServerAddress = instance.serverAddress()),
                    tryReconnect(instance, signal, null).then(function (newServerAddress) {
                      return (
                        console.log("Reconnect succeeded to ".concat(newServerAddress)),
                        (instance.connected = !0),
                        instance.enableWebSocketAutoConnect && instance.ensureWebSocket(),
                        (request.url = request.url.replace(previousServerAddress, newServerAddress)),
                        console.log("Retrying request with new url: ".concat(request.url)),
                        instance.fetchWithFailover(request, !1, signal)
                      );
                    })
                  );
                }
              );
            },
          },
          {
            key: "fetch",
            value: function (request, includeAccessToken, signal) {
              if (request)
                return (
                  (request.headers = request.headers || {}),
                  this.setAuthorizationInfoIntoRequest(request, includeAccessToken),
                  !1 === this.enableAutomaticNetworking || "GET" !== request.type
                    ? getFetchPromise(this, request, signal).then(function (response) {
                        return response.status < 400
                          ? "json" === request.dataType || "application/json" === request.headers.accept
                            ? response.json()
                            : "text" === request.dataType ||
                              (response.headers.get("Content-Type") || "").toLowerCase().startsWith("text/") ||
                              204 === response.status
                            ? response.text()
                            : response
                          : Promise.reject(response);
                      })
                    : this.fetchWithFailover(request, !0, signal)
                );
              throw new Error("Request cannot be null");
            },
          },
          {
            key: "setAuthenticationInfo",
            value: function (accessKey, userId) {
              (this._serverInfo.AccessToken = accessKey),
                this._serverInfo.UserId !== userId && (this._userViewsPromise = null),
                (this._serverInfo.UserId = userId),
                refreshWakeOnLanInfoIfNeeded(this);
            },
          },
          {
            key: "serverInfo",
            value: function (info) {
              var currentUserId;
              return (
                info &&
                  ((currentUserId = this.getCurrentUserId()),
                  (this._serverInfo = info),
                  currentUserId !== this.getCurrentUserId() && (this._userViewsPromise = null)),
                this._serverInfo
              );
            },
          },
          {
            key: "getCurrentUserName",
            value: function () {
              var userId = this.getCurrentUserId();
              if (!userId) return null;
              userId = getCachedUser(this, userId);
              return null == userId ? null : userId.Name;
            },
          },
          {
            key: "getCurrentUserId",
            value: function () {
              return this._serverInfo.UserId;
            },
          },
          {
            key: "accessToken",
            value: function () {
              return this._serverInfo.AccessToken;
            },
          },
          {
            key: "serverId",
            value: function () {
              return this.serverInfo().Id;
            },
          },
          {
            key: "serverName",
            value: function () {
              return this.serverInfo().Name;
            },
          },
          {
            key: "ajax",
            value: function (request, includeAccessToken) {
              if (request) return this.fetch(request, includeAccessToken, request.signal);
              throw new Error("Request cannot be null");
            },
          },
          {
            key: "getCurrentUser",
            value: function (options) {
              var userId = this.getCurrentUserId();
              return userId
                ? this.getUser(userId, (options = options || {}).enableCache, options.signal)
                : Promise.reject();
            },
          },
          {
            key: "isLoggedIn",
            value: function () {
              var info = this.serverInfo();
              return !!(info && info.UserId && info.AccessToken);
            },
          },
          {
            key: "logout",
            value: function () {
              function done() {
                return _this.setAuthenticationInfo(null, null), Promise.resolve();
              }
              var url,
                _this = this;
              this.closeWebSocket();
              return this.accessToken()
                ? ((url = this.getUrl("Sessions/Logout")),
                  this.ajax({type: "POST", url: url, timeout: 1e4}).then(done, done))
                : done();
            },
          },
          {
            key: "authenticateUserByName",
            value: function (name, password) {
              if (!name) return Promise.reject();
              var url = this.getUrl("Users/authenticatebyname"),
                instance = this;
              return instance
                .ajax({type: "POST", url: url, data: {Username: name, Pw: password || ""}, dataType: "json"})
                .then(function (result) {
                  (instance._userViewsPromise = null), saveUserInCache(instance, result.User);
                  function afterOnAuthenticated() {
                    return refreshWakeOnLanInfoIfNeeded(instance), result;
                  }
                  return instance.onAuthenticated
                    ? instance.onAuthenticated(instance, result).then(afterOnAuthenticated)
                    : (afterOnAuthenticated(), result);
                });
            },
          },
          {
            key: "ensureWebSocket",
            value: function () {
              if (this.connected && !this.isWebSocketOpenOrConnecting() && this.isWebSocketSupported())
                try {
                  this.openWebSocket();
                } catch (err) {
                  console.log("Error opening web socket: ".concat(err || ""));
                }
            },
          },
          {
            key: "openWebSocket",
            value: function () {
              var accessToken = this.accessToken();
              if (!accessToken) throw new Error("Cannot open web socket without access token.");
              var apiClient,
                socket,
                url = replaceAll((url = this.getUrl("socket")), "emby/socket", "embywebsocket"),
                accessToken =
                  ((url = replaceAll(url, "https:", "wss:")),
                  (url = replaceAll(url, "http:", "ws:")),
                  (url = (url += "?api_key=".concat(accessToken)) + "&deviceId=".concat(this.deviceId())),
                  console.log("opening web socket with url: ".concat(url)),
                  new WebSocket(url));
              (accessToken.onmessage = function (msg) {
                onMessageReceivedInternal(this, (msg = JSON.parse(msg.data)));
              }.bind(this)),
                (accessToken.onopen = function () {
                  console.log("web socket connection opened"), _events.default.trigger(this, "websocketopen");
                  var list = this.messageListeners;
                  if (list)
                    for (var i = 0, length = (list = list.slice(0)).length; i < length; i++) {
                      var listener = list[i];
                      this.startMessageListener(listener.name, listener.options);
                    }
                }.bind(this)),
                (accessToken.onerror = function () {
                  _events.default.trigger(this, "websocketerror");
                }.bind(this)),
                (apiClient = this),
                ((socket = accessToken).onclose = function () {
                  console.log("web socket closed"),
                    apiClient._webSocket === socket &&
                      (console.log("nulling out web socket"), (apiClient._webSocket = null)),
                    setTimeout(function () {
                      _events.default.trigger(apiClient, "websocketclose");
                    }, 0);
                }),
                (this._webSocket = accessToken);
            },
          },
          {
            key: "closeWebSocket",
            value: function () {
              var socket = this._webSocket;
              socket && socket.readyState === WebSocket.OPEN && socket.close();
            },
          },
          {
            key: "sendWebSocketMessage",
            value: function (name, data) {
              console.log("Sending web socket message: ".concat(name));
              name = {MessageType: name};
              data && (name.Data = data), (name = JSON.stringify(name)), this._webSocket.send(name);
            },
          },
          {
            key: "startMessageListener",
            value: function (name, options) {
              console.log("apiclient starting message listener ".concat(name, " with options ").concat(options)),
                this.sendMessage("".concat(name, "Start"), options);
              var list = this.messageListeners;
              list || (this.messageListeners = list = []);
              for (var i = 0, length = list.length; i < length; i++) if (list[i].name === name) return;
              list.push({name: name, options: options});
            },
          },
          {
            key: "stopMessageListener",
            value: function (name) {
              var list = this.messageListeners;
              list &&
                (this.messageListeners = list.filter(function (n) {
                  return n.name !== name;
                })),
                console.log("apiclient stopping message listener ".concat(name)),
                this.sendMessage("".concat(name, "Stop"));
            },
          },
          {
            key: "sendMessage",
            value: function (name, data) {
              this.isWebSocketOpen() && this.sendWebSocketMessage(name, data);
            },
          },
          {
            key: "isMessageChannelOpen",
            value: function () {
              return this.isWebSocketOpen();
            },
          },
          {
            key: "isWebSocketOpen",
            value: function () {
              var socket = this._webSocket;
              return !!socket && socket.readyState === WebSocket.OPEN;
            },
          },
          {
            key: "isWebSocketOpenOrConnecting",
            value: function () {
              var socket = this._webSocket;
              return !!socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING);
            },
          },
          {
            key: "get",
            value: function (url) {
              return this.ajax({type: "GET", url: url});
            },
          },
          {
            key: "getJSON",
            value: function (url, signal) {
              return this.fetch({url: url, type: "GET", dataType: "json"}, null, signal);
            },
          },
          {
            key: "getText",
            value: function (url, signal) {
              return this.fetch({url: url, type: "GET", dataType: "text"}, null, signal);
            },
          },
          {
            key: "updateServerInfo",
            value: function (server, serverUrl) {
              if (null == server) throw new Error("server cannot be null");
              if ((this.serverInfo(server), !serverUrl))
                throw new Error("serverUrl cannot be null. serverInfo: ".concat(JSON.stringify(server)));
              console.log("Setting server address to ".concat(serverUrl)), this.serverAddress(serverUrl);
            },
          },
          {
            key: "isWebSocketSupported",
            value: function () {
              try {
                return null != WebSocket;
              } catch (err) {
                return !1;
              }
            },
          },
          {
            key: "clearAuthenticationInfo",
            value: function () {
              this.setAuthenticationInfo(null, null);
            },
          },
          {
            key: "encodeName",
            value: function (name) {
              name = paramsToString({
                name: (name = (name = (name = name.split("/").join("-")).split("&").join("-")).split("?").join("-")),
              });
              return name.substring(name.indexOf("=") + 1).replace("'", "%27");
            },
          },
          {
            key: "getProductNews",
            value: function () {
              var url = this.getUrl(
                "News/Product",
                0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : {}
              );
              return this.getJSON(url);
            },
          },
          {
            key: "detectBitrate",
            value: function (signal) {
              var instance = this;
              return this.getEndpointInfo(signal).then(
                function (info) {
                  return detectBitrateWithEndpointInfo(instance, info);
                },
                function (err) {
                  return (
                    console.log("error in getEndpointInfo: ".concat(err || "")),
                    detectBitrateWithEndpointInfo(instance, {})
                  );
                }
              );
            },
          },
          {
            key: "getItem",
            value: function (userId, itemId, options, signal) {
              if (!itemId) throw new Error("null itemId");
              userId = userId
                ? this.getUrl("Users/".concat(userId, "/Items/").concat(itemId), options)
                : this.getUrl("Items/".concat(itemId), options);
              return this.getJSON(userId, signal);
            },
          },
          {
            key: "getRootFolder",
            value: function (userId) {
              if (!userId) throw new Error("null userId");
              userId = this.getUrl("Users/".concat(userId, "/Items/Root"));
              return this.getJSON(userId);
            },
          },
          {
            key: "getCurrentLocale",
            value: function () {
              return this.currentLocale;
            },
          },
          {
            key: "setCurrentLocale",
            value: function (value) {
              this.currentLocale = value;
            },
          },
          {
            key: "getNotificationTypes",
            value: function (options) {
              return this.getJSON(
                this.getUrl("Notifications/Types", (options = "string" == typeof options ? {} : options))
              );
            },
          },
          {
            key: "sendTestUserNotification",
            value: function (options) {
              var url = this.getUrl("Notifications/Services/Test");
              return this.ajax({
                type: "POST",
                url: url,
                data: JSON.stringify(options),
                contentType: "application/json",
              });
            },
          },
          {
            key: "saveUserNotification",
            value: function (options) {
              var url = this.getUrl("Notifications/Services/Configured");
              return this.ajax({
                type: "POST",
                url: url,
                data: JSON.stringify(options),
                contentType: "application/json",
              });
            },
          },
          {
            key: "getFeatures",
            value: function (query) {
              return this.isMinServerVersion("4.8.0.20")
                ? this.getJSON(this.getUrl("Features", query))
                : Promise.resolve([]);
            },
          },
          {
            key: "getRemoteImageProviders",
            value: function (options) {
              if (!options) throw new Error("null options");
              var urlPrefix = getRemoteImagePrefix(0, options),
                urlPrefix = this.getUrl("".concat(urlPrefix, "/RemoteImages/Providers"), options);
              return this.getJSON(urlPrefix);
            },
          },
          {
            key: "getAvailableRemoteImages",
            value: function (options) {
              if (!options) throw new Error("null options");
              var urlPrefix = getRemoteImagePrefix(0, options),
                urlPrefix = this.getUrl("".concat(urlPrefix, "/RemoteImages"), options);
              return this.getJSON(urlPrefix);
            },
          },
          {
            key: "downloadRemoteImage",
            value: function (options) {
              if (!options) throw new Error("null options");
              var itemId = options.itemId,
                urlPrefix = getRemoteImagePrefix(0, options),
                urlPrefix = this.getUrl("".concat(urlPrefix, "/RemoteImages/Download"), options);
              return this.ajax({type: "POST", url: urlPrefix}).then(
                onItemUpdated.bind({instance: this, itemId: itemId})
              );
            },
          },
          {
            key: "getRecordingFolders",
            value: function (userId) {
              userId = this.getUrl("LiveTv/Recordings/Folders", {userId: userId});
              return this.getJSON(userId);
            },
          },
          {
            key: "getLiveTvInfo",
            value: function (options) {
              options = this.getUrl("LiveTv/Info", options || {});
              return this.getJSON(options);
            },
          },
          {
            key: "getLiveTvGuideInfo",
            value: function (options) {
              options = this.getUrl("LiveTv/GuideInfo", options || {});
              return this.getJSON(options);
            },
          },
          {
            key: "getLiveTvChannel",
            value: function (id, userId) {
              if (!id) throw new Error("null id");
              var options = {},
                userId = (userId && (options.userId = userId), this.getUrl("LiveTv/Channels/".concat(id), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getLiveTvChannelsForManagement",
            value: function (query) {
              query = this.getUrl("LiveTv/Manage/Channels", query);
              return this.getJSON(query);
            },
          },
          {
            key: "setChannelDisabled",
            value: function (item, disabled) {
              var id = item.Id,
                item = this.getUrl("LiveTv/Manage/Channels/".concat(id, "/Disabled"), {
                  ManagementId: item.ManagementId,
                  Disabled: disabled,
                });
              return this.ajax({type: "POST", url: item, contentType: "application/json", dataType: "json"}).then(
                function (result) {
                  var instance = this.instance,
                    id = this.id;
                  return (
                    _events.default.trigger(instance, "message", [
                      {MessageType: "ChannelManagementInfoUpdated", Data: {Channel: result, Id: id, IsLocalEvent: !0}},
                    ]),
                    result
                  );
                }.bind({instance: this, id: id})
              );
            },
          },
          {
            key: "setChannelSortIndex",
            value: function (item, newIndex) {
              var id = item.Id,
                item = this.getUrl("LiveTv/Manage/Channels/".concat(id, "/SortIndex"), {
                  ManagementId: item.ManagementId,
                  NewIndex: newIndex,
                });
              return this.ajax({type: "POST", url: item}).then(
                function (result) {
                  var instance = this.instance,
                    id = this.id;
                  return (
                    _events.default.trigger(instance, "message", [
                      {MessageType: "ChannelManagementInfoUpdated", Data: {Id: id, IsLocalEvent: !0}},
                    ]),
                    result
                  );
                }.bind({instance: this, id: id})
              );
            },
          },
          {
            key: "getLiveTvChannels",
            value: function (options) {
              options = this.getUrl("LiveTv/Channels", options || {});
              return this.getJSON(options);
            },
          },
          {
            key: "getLiveTvPrograms",
            value: function () {
              var options = 0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : {};
              return options.channelIds && 1800 < options.channelIds.length
                ? this.ajax({
                    type: "POST",
                    url: this.getUrl("LiveTv/Programs"),
                    data: JSON.stringify(options),
                    contentType: "application/json",
                    dataType: "json",
                  })
                : this.getJSON(this.getUrl("LiveTv/Programs", options));
            },
          },
          {
            key: "getEpg",
            value: function () {
              var options = 0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : {};
              return (
                (options.AddCurrentProgram = !1),
                (options.EnableUserData = !1),
                (options.EnableImageTypes = "Primary"),
                (options.UserId = this.getCurrentUserId()),
                this.getJSON(this.getUrl("LiveTv/EPG", options)).then(
                  function (result) {
                    return (
                      result.Items.forEach(
                        function (result) {
                          (result.Type = "EpgChannel"), (result.ServerId = this.serverId());
                        }.bind(this)
                      ),
                      result
                    );
                  }.bind(this)
                )
              );
            },
          },
          {
            key: "getLiveTvRecommendedPrograms",
            value: function () {
              return this.getJSON(
                this.getUrl(
                  "LiveTv/Programs/Recommended",
                  0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : {}
                )
              );
            },
          },
          {
            key: "getLiveTvRecordings",
            value: function (options, signal) {
              options = this.getUrl("LiveTv/Recordings", options || {});
              return this.getJSON(options, signal);
            },
          },
          {
            key: "getLiveTvRecordingSeries",
            value: function (options) {
              options = this.getUrl("LiveTv/Recordings/Series", options || {});
              return this.getJSON(options);
            },
          },
          {
            key: "getLiveTvRecording",
            value: function (id, userId) {
              if (!id) throw new Error("null id");
              var options = {},
                userId = (userId && (options.userId = userId), this.getUrl("LiveTv/Recordings/".concat(id), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getLiveTvProgram",
            value: function (id, userId) {
              if (!id) throw new Error("null id");
              var options = {},
                userId = (userId && (options.userId = userId), this.getUrl("LiveTv/Programs/".concat(id), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "cancelLiveTvTimer",
            value: function (id) {
              if (!id) throw new Error("null id");
              var method,
                id = this._enablePostForDelete
                  ? ((method = "POST"), this.getUrl("LiveTv/Timers/".concat(id, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("LiveTv/Timers/".concat(id)));
              return this.ajax({type: method, url: id});
            },
          },
          {
            key: "getLiveTvTimers",
            value: function (options) {
              options = this.getUrl("LiveTv/Timers", options || {});
              return this.getJSON(options);
            },
          },
          {
            key: "getLiveTvTimer",
            value: function (id) {
              if (!id) throw new Error("null id");
              id = this.getUrl("LiveTv/Timers/".concat(id));
              return this.getJSON(id);
            },
          },
          {
            key: "getNewLiveTvTimerDefaults",
            value: function () {
              var url = this.getUrl(
                "LiveTv/Timers/Defaults",
                0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : {}
              );
              return this.getJSON(url);
            },
          },
          {
            key: "createLiveTvTimer",
            value: function (item) {
              if (!item) throw new Error("null item");
              var url = this.getUrl("LiveTv/Timers");
              return this.ajax({type: "POST", url: url, data: JSON.stringify(item), contentType: "application/json"});
            },
          },
          {
            key: "updateLiveTvTimer",
            value: function (item) {
              if (!item) throw new Error("null item");
              var url = this.getUrl("LiveTv/Timers/".concat(item.Id));
              return this.ajax({type: "POST", url: url, data: JSON.stringify(item), contentType: "application/json"});
            },
          },
          {
            key: "resetLiveTvTuner",
            value: function (id) {
              if (!id) throw new Error("null id");
              id = this.getUrl("LiveTv/Tuners/".concat(id, "/Reset"));
              return this.ajax({type: "POST", url: id});
            },
          },
          {
            key: "getLiveTvSeriesTimers",
            value: function (query, signal) {
              return this.getJSON(this.getUrl("LiveTv/SeriesTimers", query), signal);
            },
          },
          {
            key: "getLiveTvSeriesTimer",
            value: function (id) {
              if (!id) throw new Error("null id");
              id = this.getUrl("LiveTv/SeriesTimers/".concat(id));
              return this.getJSON(id);
            },
          },
          {
            key: "cancelLiveTvSeriesTimer",
            value: function (id) {
              if (!id) throw new Error("null id");
              var method,
                id = this._enablePostForDelete
                  ? ((method = "POST"), this.getUrl("LiveTv/SeriesTimers/".concat(id, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("LiveTv/SeriesTimers/".concat(id)));
              return this.ajax({type: method, url: id});
            },
          },
          {
            key: "createLiveTvSeriesTimer",
            value: function (item) {
              if (!item) throw new Error("null item");
              var url = this.getUrl("LiveTv/SeriesTimers");
              return this.ajax({type: "POST", url: url, data: JSON.stringify(item), contentType: "application/json"});
            },
          },
          {
            key: "updateLiveTvSeriesTimer",
            value: function (item) {
              if (!item) throw new Error("null item");
              var itemId = item.Id,
                url = this.getUrl("LiveTv/SeriesTimers/".concat(itemId));
              return this.ajax({
                type: "POST",
                url: url,
                data: JSON.stringify(item),
                contentType: "application/json",
              }).then(
                function (result) {
                  var instance = this.instance,
                    itemId = this.itemId;
                  return (
                    _events.default.trigger(instance, "message", [
                      {MessageType: "SeriesTimerUpdated", Data: {Id: itemId, IsLocalEvent: !0}},
                    ]),
                    result
                  );
                }.bind({instance: this, itemId: itemId})
              );
            },
          },
          {
            key: "getRegistrationInfo",
            value: function (feature) {
              feature = this.getUrl("Registrations/".concat(feature));
              return this.getJSON(feature);
            },
          },
          {
            key: "getSystemInfo",
            value: function () {
              var url = this.getUrl("System/Info"),
                instance = this;
              return this.getJSON(url).then(function (info) {
                return instance.setSystemInfo(info), Promise.resolve(info);
              });
            },
          },
          {
            key: "getSyncStatus",
            value: function (itemId) {
              itemId = this.getUrl("Sync/".concat(itemId, "/Status"));
              return this.ajax({
                url: itemId,
                type: "POST",
                dataType: "json",
                contentType: "application/json",
                data: JSON.stringify({TargetId: this.deviceId()}),
              });
            },
          },
          {
            key: "getPublicSystemInfo",
            value: function () {
              var url = this.getUrl("System/Info/Public"),
                instance = this;
              return this.getJSON(url).then(function (info) {
                return instance.setSystemInfo(info), Promise.resolve(info);
              });
            },
          },
          {
            key: "getInstantMixFromItem",
            value: function (itemId, options) {
              itemId = this.getUrl("Items/".concat(itemId, "/InstantMix"), options);
              return this.getJSON(itemId);
            },
          },
          {
            key: "getEpisodes",
            value: function (itemId, options, signal) {
              itemId = this.getUrl("Shows/".concat(itemId, "/Episodes"), options);
              return this.getJSON(itemId, signal);
            },
          },
          {
            key: "getDisplayPreferences",
            value: function (id, userId, app) {
              id = this.getUrl("DisplayPreferences/".concat(id), {userId: userId, client: app});
              return this.getJSON(id);
            },
          },
          {
            key: "updateDisplayPreferences",
            value: function (id, obj, userId, app) {
              id = this.getUrl("DisplayPreferences/".concat(id), {userId: userId, client: app});
              return this.ajax({type: "POST", url: id, data: JSON.stringify(obj), contentType: "application/json"});
            },
          },
          {
            key: "getSeasons",
            value: function (itemId, options) {
              itemId = this.getUrl("Shows/".concat(itemId, "/Seasons"), options);
              return this.getJSON(itemId);
            },
          },
          {
            key: "getSimilarItems",
            value: function (itemId, options) {
              itemId = this.getUrl("Items/".concat(itemId, "/Similar"), options);
              return this.getJSON(itemId);
            },
          },
          {
            key: "getCultures",
            value: function () {
              var url = this.getUrl("Localization/cultures");
              return this.getJSON(url);
            },
          },
          {
            key: "getCountries",
            value: function () {
              var url = this.getUrl("Localization/countries");
              return this.getJSON(url);
            },
          },
          {
            key: "getPlaybackInfo",
            value: function (itemId, options, deviceProfile, signal) {
              deviceProfile = {DeviceProfile: deviceProfile};
              return this.ajax({
                url: this.getUrl("Items/".concat(itemId, "/PlaybackInfo"), options),
                type: "POST",
                data: JSON.stringify(deviceProfile),
                contentType: "application/json",
                dataType: "json",
                signal: signal,
              });
            },
          },
          {
            key: "getLiveStreamMediaInfo",
            value: function (liveStreamId) {
              liveStreamId = {LiveStreamId: liveStreamId};
              return this.ajax({
                url: this.getUrl("LiveStreams/MediaInfo"),
                type: "POST",
                data: JSON.stringify(liveStreamId),
                contentType: "application/json",
                dataType: "json",
              });
            },
          },
          {
            key: "getIntros",
            value: function (itemId, signal) {
              return this.getJSON(
                this.getUrl("Users/".concat(this.getCurrentUserId(), "/Items/").concat(itemId, "/Intros")),
                signal
              );
            },
          },
          {
            key: "getDirectoryContents",
            value: function (path, options) {
              if (!path) throw new Error("null path");
              if ("string" != typeof path) throw new Error("invalid path");
              (options = options || {}).path = path;
              path = this.getUrl("Environment/DirectoryContents", options);
              return this.getJSON(path);
            },
          },
          {
            key: "getNetworkShares",
            value: function (path) {
              if (!path) throw new Error("null path");
              var options = {},
                path = ((options.path = path), this.getUrl("Environment/NetworkShares", options));
              return this.getJSON(path);
            },
          },
          {
            key: "getParentPath",
            value: function (path) {
              if (!path) throw new Error("null path");
              var options = {},
                path = ((options.path = path), this.getUrl("Environment/ParentPath", options));
              return this.ajax({type: "GET", url: path, dataType: "text"});
            },
          },
          {
            key: "getDrives",
            value: function () {
              var url = this.getUrl("Environment/Drives");
              return this.getJSON(url);
            },
          },
          {
            key: "getNetworkDevices",
            value: function () {
              var url = this.getUrl("Environment/NetworkDevices");
              return this.getJSON(url);
            },
          },
          {
            key: "getActivityLog",
            value: function (options) {
              var options = this.getUrl("System/ActivityLog/Entries", options || {}),
                serverId = this.serverId();
              return this.getJSON(options).then(function (result) {
                for (var items = result.Items, i = 0, length = items.length; i < length; i++) {
                  var item = items[i];
                  (item.Type = "ActivityLogEntry"), (item.ServerId = serverId);
                }
                return result;
              });
            },
          },
          {
            key: "cancelPackageInstallation",
            value: function (installationId) {
              if (!installationId) throw new Error("null installationId");
              var method,
                installationId = this._enablePostForDelete
                  ? ((method = "POST"), this.getUrl("Packages/Installing/".concat(installationId, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("Packages/Installing/".concat(installationId)));
              return this.ajax({type: method, url: installationId});
            },
          },
          {
            key: "refreshItem",
            value: function (itemId, options) {
              if (!itemId) throw new Error("null itemId");
              itemId = this.getUrl("Items/".concat(itemId, "/Refresh"), options || {});
              return this.ajax({type: "POST", url: itemId});
            },
          },
          {
            key: "installPlugin",
            value: function (name, guid, updateClass, version) {
              if (!name) throw new Error("null name");
              if (!updateClass) throw new Error("null updateClass");
              (updateClass = {updateClass: updateClass, AssemblyGuid: guid}),
                version && (updateClass.version = version),
                (guid = this.getUrl("Packages/Installed/".concat(name), updateClass));
              return this.ajax({type: "POST", url: guid});
            },
          },
          {
            key: "restartServer",
            value: function () {
              var url = this.getUrl("System/Restart");
              return this.ajax({type: "POST", url: url});
            },
          },
          {
            key: "shutdownServer",
            value: function () {
              var url = this.getUrl("System/Shutdown");
              return this.ajax({type: "POST", url: url});
            },
          },
          {
            key: "getPackageInfo",
            value: function (name, guid) {
              if (!name) throw new Error("null name");
              (guid = {AssemblyGuid: guid}), (name = this.getUrl("Packages/".concat(name), guid));
              return this.getJSON(name);
            },
          },
          {
            key: "getAvailableApplicationUpdate",
            value: function () {
              var url = this.getUrl("Packages/Updates", {PackageType: "System"});
              return this.getJSON(url);
            },
          },
          {
            key: "getAvailablePluginUpdates",
            value: function () {
              var url = this.getUrl("Packages/Updates", {PackageType: "UserInstalled"});
              return this.getJSON(url);
            },
          },
          {
            key: "getVirtualFolders",
            value: function (query, signal) {
              var serverId = this.serverId();
              return this.getJSON(
                this.getUrl(
                  "Library/VirtualFolders/Query",
                  (query = "string" == typeof query ? {userId: query} : query)
                ),
                signal
              ).then(function (result) {
                for (var i = 0, length = result.Items.length; i < length; i++) {
                  var item = result.Items[i];
                  !(function (item) {
                    (item.Type = "VirtualFolder"), (item.Id = item.ItemId), (item.IsFolder = !0);
                  })(item),
                    (item.ServerId = serverId);
                }
                return result;
              });
            },
          },
          {
            key: "getPhysicalPaths",
            value: function () {
              var url = this.getUrl("Library/PhysicalPaths");
              return this.getJSON(url);
            },
          },
          {
            key: "getServerConfiguration",
            value: function () {
              var url = this.getUrl("System/Configuration");
              return this.getJSON(url);
            },
          },
          {
            key: "getDevices",
            value: function (query) {
              var instance = this;
              return this.getJSON(this.getUrl("Devices", query)).then(function (result) {
                for (var device, apiClient, iconUrl, i = 0, length = result.Items.length; i < length; i++)
                  (device = result.Items[i]),
                    (apiClient = instance),
                    (iconUrl = void 0),
                    (device.Type = "Device"),
                    (device.ServerId = apiClient.serverId()),
                    (device.PrimaryImageAspectRatio = 1),
                    (iconUrl = device.IconUrl) &&
                      -1 === iconUrl.indexOf("://") &&
                      (iconUrl = apiClient.getUrl(iconUrl)),
                    (device.ImageUrl = iconUrl);
                return result;
              });
            },
          },
          {
            key: "getDevicesOptions",
            value: function () {
              var url = this.getUrl("System/Configuration/devices");
              return this.getJSON(url);
            },
          },
          {
            key: "getContentUploadHistory",
            value: function () {
              var url = this.getUrl("Devices/CameraUploads", {DeviceId: this.deviceId()});
              return this.getJSON(url);
            },
          },
          {
            key: "getNamedConfiguration",
            value: function (name) {
              name = this.getUrl("System/Configuration/".concat(name));
              return this.getJSON(name);
            },
          },
          {
            key: "getHardwareAccelerations",
            value: function () {
              var url = this.getUrl("Encoding/HardwareAccelerations");
              return this.getJSON(url);
            },
          },
          {
            key: "getVideoCodecInformation",
            value: function () {
              var url = this.getUrl("Encoding/CodecInformation/Video");
              return this.getJSON(url);
            },
          },
          {
            key: "getScheduledTasks",
            value: function () {
              var url = this.getUrl(
                "ScheduledTasks",
                0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : {}
              );
              return this.getJSON(url);
            },
          },
          {
            key: "startScheduledTask",
            value: function (id) {
              if (!id) throw new Error("null id");
              id = this.getUrl("ScheduledTasks/Running/".concat(id));
              return this.ajax({type: "POST", url: id});
            },
          },
          {
            key: "getScheduledTask",
            value: function (id) {
              if (!id) throw new Error("null id");
              id = this.getUrl("ScheduledTasks/".concat(id));
              return this.getJSON(id);
            },
          },
          {
            key: "getNextUpAudioBookItems",
            value: function (options, signal) {
              if (!this.isMinServerVersion("4.7.0.15")) return Promise.resolve({Items: [], TotalRecordCount: 0});
              options = this.getUrl("AudioBooks/NextUp", options);
              return this.getJSON(options, signal);
            },
          },
          {
            key: "getNextUpEpisodes",
            value: function (options, signal) {
              options = this.getUrl("Shows/NextUp", options);
              return this.getJSON(options, signal);
            },
          },
          {
            key: "stopScheduledTask",
            value: function (id) {
              if (!id) throw new Error("null id");
              var method,
                id = this._enablePostForDelete
                  ? ((method = "POST"), this.getUrl("ScheduledTasks/Running/".concat(id, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("ScheduledTasks/Running/".concat(id)));
              return this.ajax({type: method, url: id});
            },
          },
          {
            key: "getPluginConfiguration",
            value: function (id) {
              if (!id) throw new Error("null Id");
              id = this.getUrl("Plugins/".concat(id, "/Configuration"));
              return this.getJSON(id);
            },
          },
          {
            key: "getAvailablePlugins",
            value: function () {
              var options = 0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : {},
                options = ((options.PackageType = "UserInstalled"), this.getUrl("Packages", options));
              return this.getJSON(options);
            },
          },
          {
            key: "uninstallPlugin",
            value: function (id) {
              if (id) return this.uninstallPlugins([{Id: id}]);
              throw new Error("null Id");
            },
          },
          {
            key: "uninstallPluginSingle",
            value: function (id) {
              if (!id) throw new Error("null Id");
              var method,
                id = this._enablePostForDelete
                  ? ((method = "POST"), this.getUrl("Plugins/".concat(id, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("Plugins/".concat(id)));
              return this.ajax({type: method, url: id});
            },
          },
          {
            key: "uninstallPlugins",
            value: function (items) {
              return Promise.all(items.map(mapToId).map(this.uninstallPluginSingle.bind(this))).then(
                function (result) {
                  var instance = this.instance;
                  return (
                    _events.default.trigger(instance, "message", [
                      {MessageType: "PluginsUninstalled", Data: {Ids: [], IsLocalEvent: !0}},
                    ]),
                    result
                  );
                }.bind({instance: this, items: items})
              );
            },
          },
          {
            key: "removeVirtualFolder",
            value: function (virtualFolder, refreshLibrary) {
              if (!virtualFolder) throw new Error("null virtualFolder");
              var method,
                instance = this,
                url = this._enablePostForDelete
                  ? ((method = "POST"), "Library/VirtualFolders/Delete")
                  : ((method = "DELETE"), "Library/VirtualFolders");
              return (
                (url = this.getUrl(url, {
                  refreshLibrary: !!refreshLibrary,
                  id: virtualFolder.Id,
                  name: virtualFolder.Name,
                })),
                this.ajax({type: method, url: url}).then(function () {
                  instance._userViewsPromise = null;
                })
              );
            },
          },
          {
            key: "addVirtualFolder",
            value: function (name, type, refreshLibrary, libraryOptions) {
              if (!name) throw new Error("null name");
              var options = {},
                type =
                  (type && (options.collectionType = type),
                  (options.refreshLibrary = !!refreshLibrary),
                  (options.name = name),
                  this.getUrl("Library/VirtualFolders", options)),
                instance = this;
              return this.ajax({
                type: "POST",
                url: type,
                data: JSON.stringify({LibraryOptions: libraryOptions}),
                contentType: "application/json",
              }).then(function () {
                instance._userViewsPromise = null;
              });
            },
          },
          {
            key: "updateVirtualFolderOptions",
            value: function (id, libraryOptions) {
              if (!id) throw new Error("null name");
              var url = this.getUrl("Library/VirtualFolders/LibraryOptions"),
                instance = this;
              return this.ajax({
                type: "POST",
                url: url,
                data: JSON.stringify({Id: id, LibraryOptions: libraryOptions}),
                contentType: "application/json",
              })
                .then(onItemUpdated.bind({instance: this, itemId: id}))
                .then(function () {
                  instance._userViewsPromise = null;
                });
            },
          },
          {
            key: "renameVirtualFolder",
            value: function (virtualFolder, newName, refreshLibrary) {
              if (!virtualFolder) throw new Error("null virtualFolder");
              var refreshLibrary = this.getUrl("Library/VirtualFolders/Name", {
                  refreshLibrary: !!refreshLibrary,
                  newName: newName,
                  name: virtualFolder.Name,
                  Id: virtualFolder.Id,
                }),
                instance = this;
              return this.ajax({type: "POST", url: refreshLibrary}).then(function () {
                instance._userViewsPromise = null;
              });
            },
          },
          {
            key: "addMediaPath",
            value: function (virtualFolder, mediaPath, networkSharePath, refreshLibrary) {
              if (!virtualFolder) throw new Error("null virtualFolder");
              if (!mediaPath) throw new Error("null mediaPath");
              var mediaPath = {Path: mediaPath},
                instance =
                  (networkSharePath && (mediaPath.NetworkPath = networkSharePath),
                  (networkSharePath = this.getUrl("Library/VirtualFolders/Paths", {refreshLibrary: !!refreshLibrary})),
                  this);
              return this.ajax({
                type: "POST",
                url: networkSharePath,
                data: JSON.stringify({Name: virtualFolder.Name, PathInfo: mediaPath, Id: virtualFolder.Id}),
                contentType: "application/json",
              }).then(function () {
                instance._userViewsPromise = null;
              });
            },
          },
          {
            key: "updateMediaPath",
            value: function (virtualFolder, pathInfo) {
              if (!virtualFolder) throw new Error("null virtualFolder");
              if (!pathInfo) throw new Error("null pathInfo");
              var url = this.getUrl("Library/VirtualFolders/Paths/Update"),
                instance = this;
              return this.ajax({
                type: "POST",
                url: url,
                data: JSON.stringify({Name: virtualFolder.Name, PathInfo: pathInfo, Id: virtualFolder.Id}),
                contentType: "application/json",
              }).then(function () {
                instance._userViewsPromise = null;
              });
            },
          },
          {
            key: "removeMediaPath",
            value: function (virtualFolder, mediaPath, refreshLibrary) {
              if (!virtualFolder) throw new Error("null virtualFolder");
              if (!mediaPath) throw new Error("null mediaPath");
              var method,
                instance = this,
                url = this._enablePostForDelete
                  ? ((method = "POST"), "Library/VirtualFolders/Paths/Delete")
                  : ((method = "DELETE"), "Library/VirtualFolders/Paths");
              return (
                (url = this.getUrl(url, {
                  refreshLibrary: !!refreshLibrary,
                  path: mediaPath,
                  name: virtualFolder.Name,
                  Id: virtualFolder.Id,
                })),
                this.ajax({type: method, url: url}).then(function () {
                  instance._userViewsPromise = null;
                })
              );
            },
          },
          {
            key: "deleteUserSingle",
            value: function (id) {
              if (!id) throw new Error("null id");
              var method,
                serverId = this.serverId(),
                instance = this,
                url = this._enablePostForDelete
                  ? ((method = "POST"), this.getUrl("Users/".concat(id, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("Users/".concat(id)));
              return this.ajax({type: method, url: url}).then(function () {
                removeCachedUser(instance, id, serverId), (instance._userViewsPromise = null);
              });
            },
          },
          {
            key: "deleteUsers",
            value: function (items) {
              return Promise.all(items.map(mapToId).map(this.deleteUserSingle.bind(this))).then(
                function (result) {
                  var instance = this.instance;
                  return (
                    _events.default.trigger(instance, "message", [
                      {MessageType: "UsersDeleted", Data: {Ids: [], IsLocalEvent: !0}},
                    ]),
                    result
                  );
                }.bind({instance: this, items: items})
              );
            },
          },
          {
            key: "deleteUser",
            value: function (id) {
              return this.deleteUser([{Id: id}]);
            },
          },
          {
            key: "deleteUserImage",
            value: function (userId, imageType, imageIndex) {
              if (!userId) throw new Error("null userId");
              if (!imageType) throw new Error("null imageType");
              var method,
                imageType = this.getUrl("Users/".concat(userId, "/Images/").concat(imageType)),
                serverId = (null != imageIndex && (imageType += "/".concat(imageIndex)), this.serverId()),
                instance = this;
              return (
                this._enablePostForDelete ? ((method = "POST"), (imageType += "/Delete")) : (method = "DELETE"),
                this.ajax({type: method, url: imageType}).then(function () {
                  removeCachedUser(instance, userId, serverId);
                })
              );
            },
          },
          {
            key: "deleteItemImage",
            value: function (itemId, imageType, imageIndex) {
              if (!imageType) throw new Error("null imageType");
              var method,
                url = this.getUrl("Items/".concat(itemId, "/Images"));
              return (
                (url += "/".concat(imageType)),
                null != imageIndex && (url += "/".concat(imageIndex)),
                this._enablePostForDelete ? ((method = "POST"), (url += "/Delete")) : (method = "DELETE"),
                this.ajax({type: method, url: url}).then(onItemUpdated.bind({instance: this, itemId: itemId}))
              );
            },
          },
          {
            key: "deleteItem",
            value: function (item) {
              if (!item) throw new Error("null itemId");
              var method,
                url = this._enablePostForDelete
                  ? ((method = "POST"), this.getUrl("Items/".concat(item.Id, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("Items/".concat(item.Id)));
              return this.ajax({type: method, url: url}).then(onItemsDeleted.bind({instance: this, items: [item]}));
            },
          },
          {
            key: "deleteItems",
            value: function (items) {
              if (!items) throw new Error("null itemId");
              if (this._enablePostForDelete)
                return this.ajax({
                  type: "POST",
                  url: this.getUrl("Items/Delete", {Ids: items.map(mapToId).join(",")}),
                }).then(onItemsDeleted.bind({instance: this, items: items}));
              for (var promises = [], i = 0, length = items.length; i < length; i++) {
                var item = items[i],
                  method = void 0,
                  url = void 0,
                  url = this._enablePostForDelete
                    ? ((method = "POST"), this.getUrl("Items/".concat(item.Id, "/Delete")))
                    : ((method = "DELETE"), this.getUrl("Items/".concat(item.Id)));
                promises.push(this.ajax({type: method, url: url}));
              }
              return Promise.all(promises).then(onItemsDeleted.bind({instance: this, items: items}));
            },
          },
          {
            key: "stopActiveEncodings",
            value: function (playSessionId) {
              var method,
                options = {deviceId: this.deviceId()};
              return (
                playSessionId && (options.PlaySessionId = playSessionId),
                (playSessionId = this._enablePostForDelete
                  ? ((method = "POST"), this.getUrl("Videos/ActiveEncodings/Delete", options))
                  : ((method = "DELETE"), this.getUrl("Videos/ActiveEncodings", options))),
                this.ajax({type: method, url: playSessionId})
              );
            },
          },
          {
            key: "reportCapabilities",
            value: function (options) {
              var url = this.getUrl("Sessions/Capabilities/Full");
              return this.ajax({
                type: "POST",
                url: url,
                data: JSON.stringify(options),
                contentType: "application/json",
              });
            },
          },
          {
            key: "updateItemImageFromUrl",
            value: function (itemId, imageType, imageIndex, imageUrl) {
              if (!imageType) throw new Error("null imageType");
              return (
                (imageIndex = imageIndex || 0),
                this.ajax({
                  type: "POST",
                  url: this.getUrl(
                    "Items/".concat(itemId, "/Images/").concat(imageType, "/").concat(imageIndex, "/Url"),
                    {}
                  ),
                  data: JSON.stringify({Url: imageUrl}),
                  contentType: "application/json",
                }).then(onItemUpdated.bind({instance: this, itemId: itemId}))
              );
            },
          },
          {
            key: "updateItemImageIndex",
            value: function (itemId, imageType, imageIndex, newIndex) {
              if (!imageType) throw new Error("null imageType");
              (newIndex = {newIndex: newIndex}),
                (imageIndex = imageIndex || 0),
                (imageType = this.getUrl(
                  "Items/".concat(itemId, "/Images/").concat(imageType, "/").concat(imageIndex, "/Index"),
                  newIndex
                ));
              return this.ajax({type: "POST", url: imageType}).then(
                onItemUpdated.bind({instance: this, itemId: itemId})
              );
            },
          },
          {
            key: "getItemImageInfos",
            value: function (itemId) {
              itemId = this.getUrl("Items/".concat(itemId, "/Images"));
              return this.getJSON(itemId);
            },
          },
          {
            key: "getCriticReviews",
            value: function (itemId, options) {
              if (!itemId) throw new Error("null itemId");
              itemId = this.getUrl("Items/".concat(itemId, "/CriticReviews"), options);
              return this.getJSON(itemId);
            },
          },
          {
            key: "getItemDownloadUrl",
            value: function (itemId, mediaSourceId) {
              if (!itemId) throw new Error("itemId cannot be empty");
              itemId = "Items/".concat(itemId, "/Download");
              return this.getUrl(itemId, {api_key: this.accessToken(), mediaSourceId: mediaSourceId});
            },
          },
          {
            key: "getSessions",
            value: function (options) {
              options = this.getUrl("Sessions", options);
              return this.getJSON(options);
            },
          },
          {
            key: "uploadUserImage",
            value: function (userId, imageType, file) {
              if (!userId) throw new Error("null userId");
              if (!imageType) throw new Error("null imageType");
              if (!file) throw new Error("File must be an image.");
              if ("image/png" !== file.type && "image/jpeg" !== file.type && "image/jpeg" !== file.type && "image/webp" !== file.type)
                throw new Error("File must be an image.");
              var instance = this,
                serverId = this.serverId();
              return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                (reader.onerror = function () {
                  reject();
                }),
                  (reader.onabort = function () {
                    reject();
                  }),
                  (reader.onload = function (_ref5) {
                    var _ref5 = _ref5.target.result.split(",")[1],
                      url = instance.getUrl("Users/".concat(userId, "/Images/").concat(imageType));
                    instance
                      .ajax({
                        type: "POST",
                        url: url,
                        data: _ref5,
                        contentType: "image/".concat(file.name.substring(file.name.lastIndexOf(".") + 1)),
                      })
                      .then(function () {
                        removeCachedUser(instance, userId, serverId), resolve();
                      }, reject);
                  }),
                  reader.readAsDataURL(file);
              });
            },
          },
          {
            key: "uploadItemImage",
            value: function (itemId, imageType, file) {
              if (!itemId) throw new Error("null itemId");
              if (!imageType) throw new Error("null imageType");
              if (!file) throw new Error("File must be an image.");
              if ("image/png" !== file.type && "image/jpeg" !== file.type && "image/jpeg" !== file.type && "image/webp" !== file.type)
                throw new Error("File must be an image.");
              var url = this.getUrl("Items/".concat(itemId, "/Images")),
                instance = ((url += "/".concat(imageType)), this);
              return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                (reader.onerror = function () {
                  reject();
                }),
                  (reader.onabort = function () {
                    reject();
                  }),
                  (reader.onload = function (_ref6) {
                    _ref6 = _ref6.target.result.split(",")[1];
                    instance
                      .ajax({
                        type: "POST",
                        url: url,
                        data: _ref6,
                        contentType: "image/".concat(file.name.substring(file.name.lastIndexOf(".") + 1)),
                      })
                      .then(function (result) {
                        onItemUpdated.call({instance: instance, itemId: itemId}), resolve(result);
                      }, reject);
                  }),
                  reader.readAsDataURL(file);
              });
            },
          },
          {
            key: "getInstalledPlugins",
            value: function () {
              var url = this.getUrl("Plugins", {});
              return this.getJSON(url);
            },
          },
          {
            key: "getCurrentUserCached",
            value: function () {
              return getCachedUser(this, this.getCurrentUserId());
            },
          },
          {
            key: "getUser",
            value: function (id, enableCache, signal) {
              if (!id) throw new Error("Must supply a userId");
              var cachedUser;
              if (
                !1 !== enableCache &&
                (cachedUser = getCachedUser(this, id)) &&
                Date.now() - (cachedUser.DateLastFetched || 0) <= 6e4
              )
                return Promise.resolve(cachedUser);
              var instance = this,
                url = this.getUrl("Users/".concat(id)),
                url = this.getJSON(url, signal).then(
                  function (user) {
                    return saveUserInCache(instance, user), user;
                  },
                  function (response) {
                    if ((!signal || !signal.aborted) && (!response || !response.status) && instance.accessToken()) {
                      var user = getCachedUser(instance, id);
                      if (user) return Promise.resolve(user);
                    }
                    throw response;
                  }
                );
              return !1 !== enableCache && cachedUser ? Promise.resolve(cachedUser) : url;
            },
          },
          {
            key: "getStudio",
            value: function (name, userId) {
              if (!name) throw new Error("null name");
              var options = {},
                userId =
                  (userId && (options.userId = userId), this.getUrl("Studios/".concat(this.encodeName(name)), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getGenre",
            value: function (name, userId) {
              if (!name) throw new Error("null name");
              var options = {},
                userId =
                  (userId && (options.userId = userId), this.getUrl("Genres/".concat(this.encodeName(name)), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getMusicGenre",
            value: function (name, userId) {
              if (!name) throw new Error("null name");
              var options = {},
                userId =
                  (userId && (options.userId = userId),
                  this.getUrl("MusicGenres/".concat(this.encodeName(name)), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getGameGenre",
            value: function (name, userId) {
              if (!name) throw new Error("null name");
              var options = {},
                userId =
                  (userId && (options.userId = userId),
                  this.getUrl("GameGenres/".concat(this.encodeName(name)), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getArtist",
            value: function (name, userId) {
              if (!name) throw new Error("null name");
              var options = {},
                userId =
                  (userId && (options.userId = userId), this.getUrl("Artists/".concat(this.encodeName(name)), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getPerson",
            value: function (name, userId) {
              if (!name) throw new Error("null name");
              var options = {},
                userId =
                  (userId && (options.userId = userId), this.getUrl("Persons/".concat(this.encodeName(name)), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getPublicUsersQueryResult",
            value: function (query, signal) {
              var url = this.getUrl("users/public");
              return this.ajax({type: "GET", url: url, dataType: "json", signal: signal}, !1)
                .then(setUsersProperties)
                .then(function (users) {
                  var totalRecordCount = users.length;
                  return (
                    query &&
                      ((users = users.slice(query.StartIndex || 0)),
                      query.Limit && users.length > query.Limit && (users.length = query.Limit)),
                    {Items: users, TotalRecordCount: totalRecordCount}
                  );
                });
            },
          },
          {
            key: "getPublicUsers",
            value: function () {
              return this.getPublicUsersQueryResult({}).then(function (result) {
                return result.Items;
              });
            },
          },
          {
            key: "getUsersQueryResult",
            value: function (query, signal) {
              return this.getJSON(this.getUrl("Users/Query", query), signal).then(function (result) {
                return setUsersProperties(result.Items), result;
              });
            },
          },
          {
            key: "getUsers",
            value: function (query, signal) {
              return this.getUsersQueryResult(query, signal).then(function (result) {
                return result.Items;
              });
            },
          },
          {
            key: "getUserPrefixes",
            value: function (query, signal) {
              signal = this.getJSON(this.getUrl("Users/Prefixes", query), signal);
              return (signal =
                "Descending" !== query.SortOrder || this.isMinServerVersion("4.7.0.19")
                  ? signal
                  : signal.then(reversePrefixes));
            },
          },
          {
            key: "getApiKeys",
            value: function (query, signal) {
              var instance = this;
              return this.getJSON(this.getUrl("Auth/Keys", query), signal).then(function (result) {
                return (
                  (function (instance, response) {
                    for (var serverId = instance.serverId(), i = 0, length = response.Items.length; i < length; i++) {
                      var log = response.Items[i];
                      (log.ServerId = serverId), (log.Type = "ApiKey"), (log.CanDelete = !0);
                    }
                  })(instance, result),
                  result
                );
              });
            },
          },
          {
            key: "getLogs",
            value: function (query, signal) {
              var instance = this;
              return this.getJSON(this.getUrl("System/Logs/Query", query), signal).then(function (result) {
                return (
                  (function (instance, items) {
                    for (var serverId = instance.serverId(), i = 0, length = items.length; i < length; i++) {
                      var log = items[i];
                      (log.ServerId = serverId), (log.Type = "Log"), (log.CanDownload = !0);
                    }
                  })(instance, result.Items),
                  result
                );
              });
            },
          },
          {
            key: "getLogDownloadUrl",
            value: function (_ref7) {
              var Name = _ref7.Name,
                _ref7 = _ref7.Sanitize;
              return this.getUrl("System/Logs/".concat(Name), {Sanitize: _ref7, api_key: this.accessToken()});
            },
          },
          {
            key: "getLogLines",
            value: function (options, signal) {
              var name = options.name,
                name = ((options.name = null), this.getUrl("System/Logs/".concat(name, "/Lines"), options || {}));
              return this.getJSON(name, signal);
            },
          },
          {
            key: "getParentalRatings",
            value: function () {
              var url = this.getUrl("Localization/ParentalRatings");
              return this.getJSON(url);
            },
          },
          {
            key: "getDefaultImageSizes",
            value: function () {
              return StandardWidths.slice(0);
            },
          },
          {
            key: "getImageUrls",
            value: function (itemId, imageOptions, sourceOptions) {
              for (
                var sources = [],
                  originalImageOptions = imageOptions,
                  widths = (null == sourceOptions ? void 0 : sourceOptions.widths) || StandardWidths,
                  i = 0,
                  length = widths.length;
                i < length;
                i++
              )
                ((imageOptions = Object.assign({}, originalImageOptions)).adjustForPixelRatio = !1),
                  (imageOptions.maxWidth = widths[i]),
                  sources.push({url: this.getImageUrl(itemId, imageOptions), width: imageOptions.maxWidth});
              return sources;
            },
          },
          {
            key: "getImageUrl",
            value: function (itemId, options) {
              if (!itemId) throw new Error("itemId cannot be empty");
              options = options || {};
              itemId = "Items/".concat(itemId, "/Images/").concat(options.type);
              return (
                null != options.index && (itemId += "/".concat(options.index)),
                normalizeImageOptions(this, options),
                delete options.type,
                delete options.index,
                this.getUrl(itemId, options)
              );
            },
          },
          {
            key: "getLogoImageUrl",
            value: function (item, options, preferredLogoImageTypes) {
              for (
                var i = 0,
                  length = (preferredLogoImageTypes = preferredLogoImageTypes || [
                    "LogoLightColor",
                    "LogoLight",
                    "Logo",
                  ]).length;
                i < length;
                i++
              ) {
                var logoType = preferredLogoImageTypes[i];
                if (item.ImageTags && item.ImageTags[logoType])
                  return (
                    (options.type = logoType),
                    (options.tag = item.ImageTags[logoType]),
                    this.getImageUrl(item.Id, options)
                  );
              }
              return item.ParentLogoImageTag
                ? ((options.tag = item.ParentLogoImageTag),
                  (options.type = "Logo"),
                  this.getImageUrl(item.ParentLogoItemId, options))
                : ("TvChannel" === item.Type || "ChannelManagementInfo" === item.Type) &&
                  item.ImageTags &&
                  item.ImageTags.Primary
                ? ((options.tag = item.ImageTags.Primary),
                  (options.type = "Primary"),
                  this.getImageUrl(item.Id, options))
                : null;
            },
          },
          {
            key: "getUserImageUrl",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              options = options || {};
              userId = "Users/".concat(userId, "/Images/").concat(options.type);
              return (
                null != options.index && (userId += "/".concat(options.index)),
                normalizeImageOptions(this, options),
                delete options.type,
                delete options.index,
                this.getUrl(userId, options)
              );
            },
          },
          {
            key: "getThumbImageUrl",
            value: function (item, options) {
              if (item)
                return (
                  ((options = options || {}).imageType = "thumb"),
                  item.ImageTags && item.ImageTags.Thumb
                    ? ((options.tag = item.ImageTags.Thumb), this.getImageUrl(item.Id, options))
                    : item.ParentThumbItemId
                    ? ((options.tag = item.ImageTags.ParentThumbImageTag),
                      this.getImageUrl(item.ParentThumbItemId, options))
                    : null
                );
              throw new Error("null item");
            },
          },
          {
            key: "updateUserPassword",
            value: function (userId, currentPassword, newPassword) {
              if (!userId) return Promise.reject();
              var url = this.getUrl("Users/".concat(userId, "/Password")),
                serverId = this.serverId(),
                instance = this;
              return this.ajax({
                type: "POST",
                url: url,
                data: {CurrentPw: currentPassword || "", NewPw: newPassword},
              }).then(function () {
                return removeCachedUser(instance, userId, serverId), Promise.resolve();
              });
            },
          },
          {
            key: "updateEasyPassword",
            value: function (userId, newPassword) {
              var url,
                serverId,
                instance = this;
              {
                if (userId)
                  return (
                    (url = this.getUrl("Users/".concat(userId, "/EasyPassword"))),
                    (serverId = this.serverId()),
                    this.ajax({type: "POST", url: url, data: {NewPw: newPassword}}).then(function () {
                      return removeCachedUser(instance, userId, serverId), Promise.resolve();
                    })
                  );
                Promise.reject();
              }
            },
          },
          {
            key: "resetUserPassword",
            value: function (userId) {
              if (!userId) throw new Error("null userId");
              var url = this.getUrl("Users/".concat(userId, "/Password")),
                serverId = this.serverId(),
                postData = {resetPassword: !0},
                instance = this;
              return this.ajax({type: "POST", url: url, data: postData}).then(function () {
                return removeCachedUser(instance, userId, serverId), Promise.resolve();
              });
            },
          },
          {
            key: "resetEasyPassword",
            value: function (userId) {
              if (!userId) throw new Error("null userId");
              var url = this.getUrl("Users/".concat(userId, "/EasyPassword")),
                serverId = this.serverId(),
                postData = {resetPassword: !0},
                instance = this;
              return this.ajax({type: "POST", url: url, data: postData}).then(function () {
                return removeCachedUser(instance, userId, serverId), Promise.resolve();
              });
            },
          },
          {
            key: "updateServerConfiguration",
            value: function (configuration) {
              if (!configuration) throw new Error("null configuration");
              var url = this.getUrl("System/Configuration");
              return this.ajax({
                type: "POST",
                url: url,
                data: JSON.stringify(configuration),
                contentType: "application/json",
              });
            },
          },
          {
            key: "updateNamedConfiguration",
            value: function (name, configuration) {
              if (!configuration) throw new Error("null configuration");
              name = this.getUrl("System/Configuration/".concat(name));
              return this.ajax({
                type: "POST",
                url: name,
                data: JSON.stringify(configuration),
                contentType: "application/json",
              });
            },
          },
          {
            key: "getTypedUserSettings",
            value: function (userId, key) {
              userId = this.getUrl("Users/".concat(userId, "/TypedSettings/").concat(key));
              return this.getJSON(userId);
            },
          },
          {
            key: "updateTypedUserSettings",
            value: function (userId, key, configuration) {
              if (!configuration) throw new Error("null configuration");
              userId = this.getUrl("Users/".concat(userId, "/TypedSettings/").concat(key));
              return this.ajax({
                type: "POST",
                url: userId,
                data: JSON.stringify(configuration),
                contentType: "application/json",
              });
            },
          },
          {
            key: "getTunerHostConfiguration",
            value: function (id) {
              return this.getNamedConfiguration("livetv").then(function (config) {
                return config.TunerHosts.filter(function (i) {
                  return i.Id === id;
                })[0];
              });
            },
          },
          {
            key: "saveTunerHostConfiguration",
            value: function (tunerHostInfo) {
              return this.ajax({
                type: "POST",
                url: this.getUrl("LiveTv/TunerHosts"),
                data: JSON.stringify(tunerHostInfo),
                contentType: "application/json",
                dataType: "json",
              });
            },
          },
          {
            key: "getDefaultTunerHostConfiguration",
            value: function (type) {
              return this.isMinServerVersion("4.7.0.26")
                ? this.getJSON(this.getUrl("LiveTv/TunerHosts/Default/" + type))
                : Promise.resolve({Type: type});
            },
          },
          {
            key: "updateItem",
            value: function (item) {
              if (!item) throw new Error("null item");
              var url = this.getUrl("Items/".concat(item.Id));
              return this.ajax({
                type: "POST",
                url: url,
                data: JSON.stringify(item),
                contentType: "application/json",
              }).then(onItemUpdated.bind({instance: this, itemId: item.Id}));
            },
          },
          {
            key: "updatePluginSecurityInfo",
            value: function (info) {
              var url = this.getUrl("Plugins/SecurityInfo");
              return this.ajax({type: "POST", url: url, data: JSON.stringify(info), contentType: "application/json"});
            },
          },
          {
            key: "createUser",
            value: function (options) {
              var url = this.getUrl("Users/New");
              return this.ajax({type: "POST", url: url, data: options, dataType: "json"});
            },
          },
          {
            key: "updateUser",
            value: function (user) {
              if (!user) throw new Error("null user");
              var url = this.getUrl("Users/".concat(user.Id));
              return this.ajax({type: "POST", url: url, data: JSON.stringify(user), contentType: "application/json"});
            },
          },
          {
            key: "updateUserPolicy",
            value: function (userId, policy) {
              if (!userId) throw new Error("null userId");
              if (!policy) throw new Error("null policy");
              var url = this.getUrl("Users/".concat(userId, "/Policy")),
                instance = this;
              return (
                instance.getCurrentUserId() === userId && (instance._userViewsPromise = null),
                removeCachedUser(instance, userId, instance.serverId()),
                this.ajax({type: "POST", url: url, data: JSON.stringify(policy), contentType: "application/json"}).then(
                  function () {
                    return (
                      instance.getCurrentUserId() === userId && (instance._userViewsPromise = null),
                      removeCachedUser(instance, userId, instance.serverId()),
                      Promise.resolve()
                    );
                  }
                )
              );
            },
          },
          {
            key: "updateUserConfiguration",
            value: function (userId, configuration) {
              if (!userId) throw new Error("null userId");
              if (!configuration) throw new Error("null configuration");
              var url = this.getUrl("Users/".concat(userId, "/Configuration")),
                instance = this;
              return (
                instance.getCurrentUserId() === userId && (instance._userViewsPromise = null),
                removeCachedUser(instance, userId, instance.serverId()),
                this.ajax({
                  type: "POST",
                  url: url,
                  data: JSON.stringify(configuration),
                  contentType: "application/json",
                }).then(function () {
                  return (
                    instance.getCurrentUserId() === userId && (instance._userViewsPromise = null),
                    removeCachedUser(instance, userId, instance.serverId()),
                    Promise.resolve()
                  );
                })
              );
            },
          },
          {
            key: "updateScheduledTaskTriggers",
            value: function (id, triggers) {
              if (!id) throw new Error("null id");
              if (!triggers) throw new Error("null triggers");
              id = this.getUrl("ScheduledTasks/".concat(id, "/Triggers"));
              return this.ajax({
                type: "POST",
                url: id,
                data: JSON.stringify(triggers),
                contentType: "application/json",
              });
            },
          },
          {
            key: "updatePluginConfiguration",
            value: function (id, configuration) {
              if (!id) throw new Error("null Id");
              if (!configuration) throw new Error("null configuration");
              id = this.getUrl("Plugins/".concat(id, "/Configuration"));
              return this.ajax({
                type: "POST",
                url: id,
                data: JSON.stringify(configuration),
                contentType: "application/json",
              });
            },
          },
          {
            key: "getAncestorItems",
            value: function (itemId, userId) {
              if (!itemId) throw new Error("null itemId");
              var options = {},
                userId =
                  (userId && (options.userId = userId), this.getUrl("Items/".concat(itemId, "/Ancestors"), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getItems",
            value: function (userId, options, signal) {
              userId =
                "string" === (typeof userId).toString().toLowerCase()
                  ? this.getUrl("Users/".concat(userId, "/Items"), options)
                  : this.getUrl("Items", options);
              return this.getJSON(userId, signal);
            },
          },
          {
            key: "getLiveTvChannelTags",
            value: function (options, signal) {
              (options = options || {}).UserId = this.getCurrentUserId();
              var url = this.getUrl("LiveTv/ChannelTags", options),
                url = this.getJSON(url, signal);
              return this.isMinServerVersion("4.7.0.31") ? url : updateTagItemsResponse(url, options);
            },
          },
          {
            key: "getLiveTvChannelTagPrefixes",
            value: function (options, signal) {
              (options = options || {}).UserId = this.getCurrentUserId();
              var url = this.getUrl("LiveTv/ChannelTags/Prefixes", options),
                url = this.getJSON(url, signal);
              return (url =
                "Descending" !== options.SortOrder || this.isMinServerVersion("4.7.0.19")
                  ? url
                  : url.then(reversePrefixes));
            },
          },
          {
            key: "getResumableItems",
            value: function (userId, options) {
              return this.getJSON(this.getUrl("Users/".concat(userId, "/Items/Resume"), options));
            },
          },
          {
            key: "getMovieRecommendations",
            value: function (options) {
              return this.getJSON(this.getUrl("Movies/Recommendations", options));
            },
          },
          {
            key: "getUpcomingEpisodes",
            value: function (options) {
              return this.getJSON(this.getUrl("Shows/Upcoming", options));
            },
          },
          {
            key: "getUserViews",
            value: function (options, userId, signal) {
              var currentUserId = this.getCurrentUserId(),
                currentUserId = !(
                  (userId = userId || currentUserId) !== currentUserId ||
                  (options && options.IncludeHidden)
                );
              if (currentUserId && this._userViewsPromise) return this._userViewsPromise;
              var userId = this.getUrl("Users/".concat(userId, "/Views"), options),
                self = this,
                options = this.getJSON(userId, signal).catch(function () {
                  self._userViewsPromise = null;
                });
              return currentUserId && (this._userViewsPromise = options), options;
            },
          },
          {
            key: "getArtists",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              userId = this.getUrl("Artists", options);
              return this.getJSON(userId);
            },
          },
          {
            key: "getAlbumArtists",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              userId = this.getUrl("Artists/AlbumArtists", options);
              return this.getJSON(userId);
            },
          },
          {
            key: "getGenres",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              (userId = this.getUrl("Genres", options)), (userId = this.getJSON(userId));
              return this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options);
            },
          },
          {
            key: "getMusicGenres",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              userId = this.getUrl("MusicGenres", options);
              return this.getJSON(userId);
            },
          },
          {
            key: "getGameGenres",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              userId = this.getUrl("GameGenres", options);
              return this.getJSON(userId);
            },
          },
          {
            key: "getPeople",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              userId = this.getUrl("Persons", options);
              return this.getJSON(userId);
            },
          },
          {
            key: "getThumbnails",
            value: function (itemId, options) {
              if (isLocalId(itemId)) return Promise.resolve({Thumbnails: []});
              itemId = this.getUrl("Items/".concat(itemId, "/ThumbnailSet"), options);
              return this.getJSON(itemId);
            },
          },
          {
            key: "getDeleteInfo",
            value: function (itemId, options) {
              itemId = this.getUrl("Items/".concat(itemId, "/DeleteInfo"), options);
              return this.getJSON(itemId);
            },
          },
          {
            key: "getStudios",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              (userId = this.getUrl("Studios", options)), (userId = this.getJSON(userId));
              return this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options);
            },
          },
          {
            key: "getOfficialRatings",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              ((options = options || {}).userId = userId),
                0 !== options.Limit || this.isMinServerVersion("4.7.0.31") || (options.Limit = null);
              (userId = this.getUrl("OfficialRatings", options)), (userId = this.getJSON(userId));
              return this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options);
            },
          },
          {
            key: "getYears",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              ((options = options || {}).userId = userId),
                0 !== options.Limit || this.isMinServerVersion("4.7.0.31") || (options.Limit = null);
              (userId = this.getUrl("Years", options)), (userId = this.getJSON(userId));
              return this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options);
            },
          },
          {
            key: "getTags",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              ((options = options || {}).userId = userId),
                0 !== options.Limit || this.isMinServerVersion("4.7.0.31") || (options.Limit = null);
              var userId = this.getUrl("Tags", options),
                userId = this.getJSON(userId),
                fillTagPropertiesFn = function (result) {
                  for (
                    var serverId = this.serverId(), items = result.Items || result, i = 0, length = items.length;
                    i < length;
                    i++
                  ) {
                    var item = items[i];
                    (item.ServerId = serverId), (item.Type = "Tag");
                  }
                  return result;
                }.bind(this);
              return (this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options)).then(
                fillTagPropertiesFn
              );
            },
          },
          {
            key: "getItemTypes",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              userId = this.getUrl("ItemTypes", options);
              return this.getJSON(userId);
            },
          },
          {
            key: "getContainers",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              ((options = options || {}).userId = userId),
                0 !== options.Limit || this.isMinServerVersion("4.7.0.31") || (options.Limit = null);
              (userId = this.getUrl("Containers", options)), (userId = this.getJSON(userId));
              return this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options);
            },
          },
          {
            key: "getAudioCodecs",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              (userId = this.getUrl("AudioCodecs", options)), (userId = this.getJSON(userId));
              return this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options);
            },
          },
          {
            key: "getStreamLanguages",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              (userId = this.getUrl("StreamLanguages", options)), (userId = this.getJSON(userId));
              return this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options);
            },
          },
          {
            key: "getVideoCodecs",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              (userId = this.getUrl("VideoCodecs", options)), (userId = this.getJSON(userId));
              return this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options);
            },
          },
          {
            key: "getSubtitleCodecs",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              (userId = this.getUrl("SubtitleCodecs", options)), (userId = this.getJSON(userId));
              return this.isMinServerVersion("4.7.0.31") ? userId : updateTagItemsResponse(userId, options);
            },
          },
          {
            key: "getPrefixes",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              (userId = this.getUrl("Items/Prefixes", options)), (userId = this.getJSON(userId));
              return (userId =
                "Descending" !== options.SortOrder || this.isMinServerVersion("4.7.0.19")
                  ? userId
                  : userId.then(reversePrefixes));
            },
          },
          {
            key: "getArtistPrefixes",
            value: function (userId, options) {
              if (!userId) throw new Error("null userId");
              (options = options || {}).userId = userId;
              (userId = this.getUrl("Artists/Prefixes", options)), (userId = this.getJSON(userId));
              return (userId =
                "Descending" !== options.SortOrder || this.isMinServerVersion("4.7.0.19")
                  ? userId
                  : userId.then(reversePrefixes));
            },
          },
          {
            key: "getLocalTrailers",
            value: function (userId, itemId) {
              if (!userId) throw new Error("null userId");
              if (!itemId) throw new Error("null itemId");
              userId = this.getUrl("Users/".concat(userId, "/Items/").concat(itemId, "/LocalTrailers"));
              return this.getJSON(userId);
            },
          },
          {
            key: "getAllTrailers",
            value: function (query, item) {
              return (
                item.LocalTrailerCount && !1 !== query.LocalTrailers
                  ? this.getLocalTrailers(this.getCurrentUserId(), item.Id)
                  : Promise.resolve([])
              ).then(function (localTrailers) {
                var trailers = localTrailers.splice(0);
                if (item.RemoteTrailers && !1 !== query.RemoteTrailers)
                  for (var i = 0, length = item.RemoteTrailers.length; i < length; i++)
                    trailers.push(item.RemoteTrailers[i]);
                var localTrailers =
                    (((item.MediaSources || [])[0] || {}).MediaStreams || []).filter(function (i) {
                      return "Video" === i.Type;
                    })[0] || {},
                  aspect = null;
                localTrailers.Width && localTrailers.Height && (aspect = localTrailers.Width / localTrailers.Height);
                for (var _i = 0, _length = trailers.length; _i < _length; _i++) {
                  var trailer = trailers[_i];
                  trailer.Name || (trailer.Name = "Trailer: " + item.Name),
                    trailer.Type || (trailer.Type = "Trailer"),
                    trailer.ServerId || (trailer.ServerId = item.ServerId),
                    trailer.MediaType || (trailer.MediaType = "Video"),
                    trailer.PrimaryImageAspectRatio || (trailer.PrimaryImageAspectRatio = aspect),
                    (trailer.ImageTags && trailer.ImageTags.Thumb) ||
                      (item.ImageTags && item.ImageTags.Thumb
                        ? ((trailer.ParentThumbItemId = item.Id), (trailer.ParentThumbImageTag = item.ImageTags.Thumb))
                        : ((trailer.ParentThumbItemId = item.ParentThumbItemId),
                          (trailer.ParentThumbImageTag = item.ParentThumbImageTag))),
                    (trailer.ParentBackdropImageTags && trailer.ParentBackdropImageTags.length) ||
                      ((trailer.ParentBackdropItemId = item.Id),
                      (trailer.ParentBackdropImageTags = item.BackdropImageTags));
                }
                localTrailers = trailers.length;
                return (
                  query &&
                    ((trailers = trailers.slice(query.StartIndex || 0)),
                    query.Limit && trailers.length > query.Limit && (trailers.length = query.Limit)),
                  Promise.resolve({Items: trailers, TotalRecordCount: localTrailers})
                );
              });
            },
          },
          {
            key: "getGameSystems",
            value: function () {
              var options = {},
                userId = this.getCurrentUserId(),
                userId = (userId && (options.userId = userId), this.getUrl("Games/SystemSummaries", options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getAdditionalVideoParts",
            value: function (userId, itemId) {
              if (!itemId) throw new Error("null itemId");
              var options = {},
                userId =
                  (userId && (options.userId = userId),
                  this.getUrl("Videos/".concat(itemId, "/AdditionalParts"), options));
              return this.getJSON(userId);
            },
          },
          {
            key: "getThemeMedia",
            value: function (itemId, options) {
              itemId = this.getUrl("Items/".concat(itemId, "/ThemeMedia"), options);
              return this.getJSON(itemId);
            },
          },
          {
            key: "getAudioStreamUrl",
            value: function (
              _ref8,
              _ref9,
              directPlayContainers,
              maxBitrate,
              maxAudioSampleRate,
              maxAudioBitDepth,
              startPosition,
              enableRemoteMedia
            ) {
              var _ref8 = _ref8.Id,
                Container = _ref9.Container,
                Protocol = _ref9.Protocol,
                _ref9 = _ref9.AudioCodec,
                _ref8 = "Audio/".concat(_ref8, "/universal");
              return (
                startingPlaySession++,
                this.getUrl(_ref8, {
                  UserId: this.getCurrentUserId(),
                  DeviceId: this.deviceId(),
                  MaxStreamingBitrate: maxBitrate,
                  Container: directPlayContainers,
                  TranscodingContainer: Container || null,
                  TranscodingProtocol: Protocol || null,
                  AudioCodec: _ref9,
                  MaxAudioSampleRate: maxAudioSampleRate,
                  MaxAudioBitDepth: maxAudioBitDepth,
                  api_key: this.accessToken(),
                  PlaySessionId: startingPlaySession,
                  StartTimeTicks: startPosition || 0,
                  EnableRedirection: !0,
                  EnableRemoteMedia: enableRemoteMedia,
                })
              );
            },
          },
          {
            key: "getAudioStreamUrls",
            value: function (
              items,
              transcodingProfile,
              directPlayContainers,
              maxBitrate,
              maxAudioSampleRate,
              maxAudioBitDepth,
              startPosition,
              enableRemoteMedia
            ) {
              for (var streamUrls = [], i = 0, length = items.length; i < length; i++) {
                var item = items[i],
                  streamUrl = void 0;
                "Audio" === item.MediaType &&
                  (streamUrl = this.getAudioStreamUrl(
                    item,
                    transcodingProfile,
                    directPlayContainers,
                    maxBitrate,
                    maxAudioSampleRate,
                    maxAudioBitDepth,
                    startPosition,
                    enableRemoteMedia
                  )),
                  streamUrls.push(streamUrl || ""),
                  0 === i && (startPosition = 0);
              }
              return Promise.resolve(streamUrls);
            },
          },
          {
            key: "getSpecialFeatures",
            value: function (userId, itemId) {
              if (!userId) throw new Error("null userId");
              if (!itemId) throw new Error("null itemId");
              userId = this.getUrl("Users/".concat(userId, "/Items/").concat(itemId, "/SpecialFeatures"));
              return this.getJSON(userId);
            },
          },
          {
            key: "getDateParamValue",
            value: function (date) {
              function formatDigit(i) {
                return i < 10 ? "0".concat(i) : i;
              }
              return ""
                .concat(date.getFullYear())
                .concat(formatDigit(date.getMonth() + 1))
                .concat(formatDigit(date.getDate()))
                .concat(formatDigit(date.getHours()))
                .concat(formatDigit(date.getMinutes()))
                .concat(formatDigit(date.getSeconds()));
            },
          },
          {
            key: "markPlayed",
            value: function (userId, itemId, date) {
              if (!userId) throw new Error("null userId");
              if (!itemId) throw new Error("null itemId");
              var options = {},
                date =
                  (date && (options.DatePlayed = this.getDateParamValue(date)),
                  this.getUrl("Users/".concat(userId, "/PlayedItems/").concat(itemId), options));
              return this.ajax({type: "POST", url: date, dataType: "json"}).then(
                onUserDataUpdated.bind({instance: this, userId: userId, itemId: itemId})
              );
            },
          },
          {
            key: "markUnplayed",
            value: function (userId, itemId) {
              if (!userId) throw new Error("null userId");
              if (!itemId) throw new Error("null itemId");
              var method,
                url = this._enablePostForDelete
                  ? ((method = "POST"), this.getUrl("Users/".concat(userId, "/PlayedItems/").concat(itemId, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("Users/".concat(userId, "/PlayedItems/").concat(itemId)));
              return this.ajax({type: method, url: url, dataType: "json"}).then(
                onUserDataUpdated.bind({instance: this, userId: userId, itemId: itemId})
              );
            },
          },
          {
            key: "updateFavoriteStatus",
            value: function (userId, itemId, isFavorite) {
              if (!userId) throw new Error("null userId");
              if (!itemId) throw new Error("null itemId");
              var method,
                isFavorite = isFavorite
                  ? ((method = "POST"), this.getUrl("Users/".concat(userId, "/FavoriteItems/").concat(itemId)))
                  : this._enablePostForDelete
                  ? ((method = "POST"),
                    this.getUrl("Users/".concat(userId, "/FavoriteItems/").concat(itemId, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("Users/".concat(userId, "/FavoriteItems/").concat(itemId)));
              return this.ajax({type: method, url: isFavorite, dataType: "json"}).then(
                onUserDataUpdated.bind({instance: this, userId: userId, itemId: itemId})
              );
            },
          },
          {
            key: "updateUserItemRating",
            value: function (userId, itemId, likes) {
              if (!userId) throw new Error("null userId");
              if (!itemId) throw new Error("null itemId");
              likes = this.getUrl("Users/".concat(userId, "/Items/").concat(itemId, "/Rating"), {likes: likes});
              return this.ajax({type: "POST", url: likes, dataType: "json"}).then(
                onUserDataUpdated.bind({instance: this, userId: userId, itemId: itemId})
              );
            },
          },
          {
            key: "updateHideFromResume",
            value: function (itemId, hide) {
              if (!itemId) throw new Error("null itemId");
              var userId = this.getCurrentUserId(),
                hide = this.getUrl("Users/".concat(userId, "/Items/").concat(itemId, "/HideFromResume"), {
                  Hide: !1 !== hide,
                });
              return this.ajax({type: "POST", url: hide, dataType: "json"}).then(
                onUserDataUpdated.bind({instance: this, userId: userId, itemId: itemId})
              );
            },
          },
          {
            key: "getItemCounts",
            value: function (userId) {
              var options = {},
                userId = (userId && (options.userId = userId), this.getUrl("Items/Counts", options));
              return this.getJSON(userId);
            },
          },
          {
            key: "clearUserItemRating",
            value: function (userId, itemId) {
              if (!userId) throw new Error("null userId");
              if (!itemId) throw new Error("null itemId");
              var method,
                url = this._enablePostForDelete
                  ? ((method = "POST"),
                    this.getUrl("Users/".concat(userId, "/Items/").concat(itemId, "/Rating/Delete")))
                  : ((method = "DELETE"), this.getUrl("Users/".concat(userId, "/Items/").concat(itemId, "/Rating")));
              return this.ajax({type: method, url: url, dataType: "json"}).then(
                onUserDataUpdated.bind({instance: this, userId: userId, itemId: itemId})
              );
            },
          },
          {
            key: "reportPlaybackStart",
            value: function (options) {
              if (!options) throw new Error("null options");
              (this.lastPlaybackProgressReport = 0), (this.lastPlaybackProgressReportTicks = null);
              var url = this.getUrl("Sessions/Playing"),
                url = this.ajax({
                  type: "POST",
                  data: JSON.stringify(options),
                  contentType: "application/json",
                  url: url,
                });
              return options.ItemId && !isLocalId(options.ItemId) && this.ensureWebSocket(), url;
            },
          },
          {
            key: "reportPlaybackProgress",
            value: function (options) {
              if (!options) throw new Error("null options");
              var newPositionTicks = options.PositionTicks;
              if ("timeupdate" === (options.EventName || "timeupdate")) {
                var now = Date.now(),
                  msSinceLastReport = now - (this.lastPlaybackProgressReport || 0);
                if (msSinceLastReport <= 1e4) {
                  if (!newPositionTicks) return Promise.resolve();
                  msSinceLastReport = 1e4 * msSinceLastReport + (this.lastPlaybackProgressReportTicks || 0);
                  if (Math.abs((newPositionTicks || 0) - msSinceLastReport) < 5e7) return Promise.resolve();
                }
                this.lastPlaybackProgressReport = now;
              } else this.lastPlaybackProgressReport = 0;
              this.lastPlaybackProgressReportTicks = newPositionTicks;
              msSinceLastReport = this.getUrl("Sessions/Playing/Progress");
              return this.ajax({
                type: "POST",
                data: JSON.stringify(options),
                contentType: "application/json",
                url: msSinceLastReport,
              });
            },
          },
          {
            key: "reportOfflineActions",
            value: function (actions) {
              if (!actions) throw new Error("null actions");
              var url = this.getUrl("Sync/OfflineActions");
              return this.ajax({
                type: "POST",
                data: JSON.stringify(actions),
                contentType: "application/json",
                url: url,
              });
            },
          },
          {
            key: "syncData",
            value: function (data) {
              if (!data) throw new Error("null data");
              var url = this.getUrl("Sync/Data");
              return this.ajax({
                type: "POST",
                data: JSON.stringify(data),
                contentType: "application/json",
                url: url,
                dataType: "json",
              });
            },
          },
          {
            key: "getReadySyncItems",
            value: function (deviceId) {
              if (!deviceId) throw new Error("null deviceId");
              deviceId = this.getUrl("Sync/Items/Ready", {TargetId: deviceId});
              return this.getJSON(deviceId);
            },
          },
          {
            key: "reportSyncJobItemTransferred",
            value: function (syncJobItemId) {
              if (!syncJobItemId) throw new Error("null syncJobItemId");
              syncJobItemId = this.getUrl("Sync/JobItems/".concat(syncJobItemId, "/Transferred"));
              return this.ajax({type: "POST", url: syncJobItemId});
            },
          },
          {
            key: "cancelSyncItems",
            value: function (itemIds, targetId) {
              if (!itemIds) throw new Error("null itemIds");
              var method,
                targetId = this._enablePostForDelete
                  ? ((method = "POST"), "Sync/".concat(targetId || this.deviceId(), "/Items/Delete"))
                  : ((method = "DELETE"), "Sync/".concat(targetId || this.deviceId(), "/Items"));
              return this.ajax({type: method, url: this.getUrl(targetId, {ItemIds: itemIds.join(",")})});
            },
          },
          {
            key: "clearUserTrackSelections",
            value: function (userId, type) {
              if (!userId) throw new Error("null userId");
              var method,
                serverId = this.serverId(),
                instance = this,
                type = this._enablePostForDelete
                  ? ((method = "POST"),
                    this.getUrl("Users/".concat(userId, "/TrackSelections/").concat(type, "/Delete")))
                  : ((method = "DELETE"), this.getUrl("Users/".concat(userId, "/TrackSelections/").concat(type)));
              return this.ajax({type: method, url: type}).then(function () {
                removeCachedUser(instance, userId, serverId);
              });
            },
          },
          {
            key: "reportPlaybackStopped",
            value: function (options) {
              if (!options) throw new Error("null options");
              (this.lastPlaybackProgressReport = 0), (this.lastPlaybackProgressReportTicks = null);
              var url = this.getUrl("Sessions/Playing/Stopped");
              return this.ajax({
                type: "POST",
                data: JSON.stringify(options),
                contentType: "application/json",
                url: url,
              });
            },
          },
          {
            key: "sendPlayCommand",
            value: function (sessionId, options) {
              if (!sessionId) throw new Error("null sessionId");
              if (!options) throw new Error("null options");
              sessionId = this.getUrl("Sessions/".concat(sessionId, "/Playing"), options);
              return this.ajax({type: "POST", url: sessionId});
            },
          },
          {
            key: "sendCommand",
            value: function (sessionId, command) {
              if (!sessionId) throw new Error("null sessionId");
              if (!command) throw new Error("null command");
              sessionId = {type: "POST", url: this.getUrl("Sessions/".concat(sessionId, "/Command"))};
              return (
                (sessionId.data = JSON.stringify(command)),
                (sessionId.contentType = "application/json"),
                this.ajax(sessionId)
              );
            },
          },
          {
            key: "sendMessageCommand",
            value: function (sessionId, options) {
              if (!sessionId) throw new Error("null sessionId");
              if (!options) throw new Error("null options");
              sessionId = {type: "POST", url: this.getUrl("Sessions/".concat(sessionId, "/Message"))};
              return (
                (sessionId.data = JSON.stringify(options)),
                (sessionId.contentType = "application/json"),
                this.ajax(sessionId)
              );
            },
          },
          {
            key: "sendPlayStateCommand",
            value: function (sessionId, command, options) {
              if (!sessionId) throw new Error("null sessionId");
              if (!command) throw new Error("null command");
              sessionId = this.getUrl("Sessions/".concat(sessionId, "/Playing/").concat(command), options || {});
              return this.ajax({type: "POST", url: sessionId});
            },
          },
          {
            key: "getSavedEndpointInfo",
            value: function () {
              return this._endPointInfo;
            },
          },
          {
            key: "getEndpointInfo",
            value: function (signal) {
              var savedValue = this._endPointInfo;
              if (savedValue) return Promise.resolve(savedValue);
              var instance = this;
              return this.getJSON(this.getUrl("System/Endpoint"), signal).then(function (endPointInfo) {
                return setSavedEndpointInfo(instance, endPointInfo), endPointInfo;
              });
            },
          },
          {
            key: "getWakeOnLanInfo",
            value: function () {
              return this.getJSON(this.getUrl("System/WakeOnLanInfo"));
            },
          },
          {
            key: "getLatestItems",
            value: function () {
              var options = 0 < arguments.length && void 0 !== arguments[0] ? arguments[0] : {};
              return (
                (options = options || {}).ParentId ||
                  options.parentId ||
                  options.IncludeItemTypes ||
                  this.isMinServerVersion("4.6.4") ||
                  ("Video" === options.MediaTypes
                    ? (options.IncludeItemTypes = "Movie,Video,Episode,MusicVideo,Trailer")
                    : "Audio" === options.MediaTypes
                    ? (options.IncludeItemTypes = "Movie,Video,Episode,MusicVideo,Trailer,Audio")
                    : (options.IncludeItemTypes = "Audio")),
                this.getJSON(this.getUrl("Users/".concat(this.getCurrentUserId(), "/Items/Latest"), options))
              );
            },
          },
          {
            key: "getPlayQueue",
            value: function (options) {
              return this.getJSON(this.getUrl("Sessions/PlayQueue", options));
            },
          },
          {
            key: "supportsWakeOnLan",
            value: function () {
              return !!this._wakeOnLan.isSupported() && 0 < getCachedWakeOnLanInfo(this).length;
            },
          },
          {
            key: "wakeOnLan",
            value: function () {
              var infos = getCachedWakeOnLanInfo(this);
              return (function sendNextWakeOnLan(wakeOnLan, infos, index) {
                if (index >= infos.length) return Promise.resolve();
                var info = infos[index];
                function goNext() {
                  return sendNextWakeOnLan(wakeOnLan, infos, index + 1);
                }
                return (
                  console.log("sending wakeonlan to ".concat(info.MacAddress)),
                  wakeOnLan.send(info).then(goNext, goNext)
                );
              })(this._wakeOnLan, infos, 0);
            },
          },
          {
            key: "addToList",
            value: function (userId, type, id, addIds) {
              type = this.getUrl(
                ("BoxSet" === type || "Collection" === type ? "Collections" : "Playlists") + "/" + id + "/Items",
                {Ids: addIds, userId: userId}
              );
              return this.ajax({type: "POST", url: type});
            },
          },
          {
            key: "createList",
            value: function (userId, type, name, addIds) {
              type = this.getUrl("BoxSet" === type || "Collection" === type ? "Collections" : "Playlists", {
                Name: name,
                Ids: addIds,
                userId: userId,
              });
              return this.ajax({type: "POST", url: type, dataType: "json"});
            },
          },
          {
            key: "setSystemInfo",
            value: function (_ref10) {
              _ref10 = _ref10.Version;
              (this._serverVersion = _ref10),
                (this._enablePostForDelete = this.isMinServerVersion("4.7.0.33")),
                (this._enableQueryStringRequestContentType = this.isMinServerVersion("4.7.0.33")),
                (this._queryStringAuth = !0);
            },
          },
          {
            key: "serverVersion",
            value: function () {
              return this._serverVersion;
            },
          },
          {
            key: "isMinServerVersion",
            value: function (version) {
              var serverVersion = this.serverVersion();
              return (
                !!serverVersion &&
                0 <=
                  (function (a, b) {
                    (a = a.split(".")), (b = b.split("."));
                    for (var i = 0, length = Math.max(a.length, b.length); i < length; i++) {
                      var aVal = parseInt(a[i] || "0"),
                        bVal = parseInt(b[i] || "0");
                      if (aVal < bVal) return -1;
                      if (bVal < aVal) return 1;
                    }
                    return 0;
                  })(serverVersion, version)
              );
            },
          },
          {
            key: "handleMessageReceived",
            value: function (msg) {
              onMessageReceivedInternal(this, msg);
            },
          },
          {
            key: "getSearchResults",
            value: function (query) {
              var promises;
              return !query.SearchTerm || query.SearchTerm.length < 1
                ? Promise.resolve({Items: [], TotalRecordCount: 0, ItemTypes: []})
                : ((promises = []).push(this.getItems(this.getCurrentUserId(), query)),
                  query.StartIndex ||
                    query.IncludeItemTypes ||
                    !1 === query.IncludeSearchTypes ||
                    promises.push(this.getItemTypes(this.getCurrentUserId(), query)),
                  Promise.all(promises).then(function (responses) {
                    return 1 < responses.length && (responses[0].ItemTypes = responses[1].Items), responses[0];
                  }));
            },
          },
          {
            key: "getToneMapOptions",
            value: function () {
              var url = this.getUrl("Encoding/ToneMapOptions");
              return this.getJSON(url);
            },
          },
          {
            key: "removeItemsFromPlaylist",
            value: function (playlistId, items) {
              for (var method, url, playlistItemIds = [], i = 0, length = items.length; i < length; i++)
                playlistItemIds.push(items[i].PlaylistItemId);
              return (
                (url = this._enablePostForDelete
                  ? ((method = "POST"), "Playlists/" + playlistId + "/Items/Delete")
                  : ((method = "DELETE"), "Playlists/" + playlistId + "/Items")),
                this.ajax({url: this.getUrl(url, {EntryIds: playlistItemIds.join(",")}), type: method}).then(
                  function (result) {
                    var instance = this.instance,
                      playlistItemIds = this.playlistItemIds,
                      playlistId = this.playlistId;
                    return (
                      _events.default.trigger(instance, "message", [
                        {
                          MessageType: "ItemsRemovedFromPlaylist",
                          Data: {PlaylistId: playlistId, PlaylistItemIds: playlistItemIds, IsLocalEvent: !0},
                        },
                      ]),
                      result
                    );
                  }.bind({instance: this, playlistItemIds: playlistItemIds, playlistId: playlistId})
                )
              );
            },
          },
          {
            key: "removeItemsFromCollection",
            value: function (collectionId, items) {
              for (var method, url, itemIds = [], i = 0, length = items.length; i < length; i++)
                itemIds.push(items[i].Id);
              return (
                (url = this._enablePostForDelete
                  ? ((method = "POST"), "Collections/" + collectionId + "/Items/Delete")
                  : ((method = "DELETE"), "Collections/" + collectionId + "/Items")),
                this.ajax({url: this.getUrl(url, {Ids: itemIds.join(",")}), type: method}).then(
                  function (result) {
                    var instance = this.instance,
                      itemIds = this.itemIds,
                      collectionId = this.collectionId;
                    return (
                      _events.default.trigger(instance, "message", [
                        {
                          MessageType: "ItemsRemovedFromCollection",
                          Data: {CollectionId: collectionId, ItemIds: itemIds, IsLocalEvent: !0},
                        },
                      ]),
                      result
                    );
                  }.bind({instance: this, itemIds: itemIds, collectionId: collectionId})
                )
              );
            },
          },
          {
            key: "reconnectTest",
            value: function (signal) {
              return tryReconnect(this, signal);
            },
          },
          {
            key: "mergeVersions",
            value: function (items) {
              var instance = this;
              return this.ajax({
                type: "POST",
                url: this.getUrl("Videos/MergeVersions", {Ids: items.map(mapToId).join(",")}),
              }).then(function (result) {
                return (
                  _events.default.trigger(instance, "message", [
                    {MessageType: "ItemsMerged", Data: {Items: items.map(mapToId), IsLocalEvent: !0}},
                  ]),
                  result
                );
              });
            },
          },
          {
            key: "ungroupVersions",
            value: function (id) {
              var method,
                instance = this,
                url = instance._enablePostForDelete
                  ? ((method = "POST"), "Videos/" + id + "/AlternateSources/Delete")
                  : ((method = "DELETE"), "Videos/" + id + "/AlternateSources");
              return instance.ajax({type: method, url: instance.getUrl(url)}).then(function (result) {
                return (
                  _events.default.trigger(instance, "message", [
                    {MessageType: "ItemsSplit", Data: {Items: [id], IsLocalEvent: !0}},
                  ]),
                  result
                );
              });
            },
          },
          {
            key: "deleteSubtitles",
            value: function (itemId, mediaSourceId, subtitleStreamIndex) {
              var method,
                subtitleStreamIndex = this._enablePostForDelete
                  ? ((method = "POST"), "Videos/" + itemId + "/Subtitles/" + subtitleStreamIndex + "/Delete")
                  : ((method = "DELETE"), "Videos/" + itemId + "/Subtitles/" + subtitleStreamIndex);
              return this.ajax({
                type: method,
                url: this.getUrl(subtitleStreamIndex, {MediaSourceId: mediaSourceId}),
              }).then(onItemUpdated.bind({instance: this, itemId: itemId}));
            },
          },
          {
            key: "cancelSyncJob",
            value: function (id) {
              var method,
                id = this._enablePostForDelete
                  ? ((method = "POST"), "Sync/Jobs/" + id + "/Delete")
                  : ((method = "DELETE"), "Sync/Jobs/" + id);
              return this.ajax({url: this.getUrl(id), type: method});
            },
          },
          {
            key: "cancelSyncJobItem",
            value: function (jobItemId) {
              var method,
                jobItemId = this._enablePostForDelete
                  ? ((method = "POST"), "Sync/JobItems/" + jobItemId + "/Delete")
                  : ((method = "DELETE"), "Sync/JobItems/" + jobItemId);
              return this.ajax({url: this.getUrl(jobItemId), type: method});
            },
          },
          {
            key: "removeEmbyConnectLink",
            value: function (userId) {
              var method,
                userId = this._enablePostForDelete
                  ? ((method = "POST"), "Users/" + userId + "/Connect/Link/Delete")
                  : ((method = "DELETE"), "Users/" + userId + "/Connect/Link");
              return this.ajax({type: method, url: this.getUrl(userId)});
            },
          },
          {
            key: "deleteApiKey",
            value: function (accessToken) {
              var method,
                accessToken = this._enablePostForDelete
                  ? ((method = "POST"), "Auth/Keys/" + accessToken + "/Delete")
                  : ((method = "DELETE"), "Auth/Keys/" + accessToken);
              return this.ajax({type: method, url: this.getUrl(accessToken)});
            },
          },
          {
            key: "deleteDevice",
            value: function (id) {
              return this.deleteDevices([{Id: id}]);
            },
          },
          {
            key: "deleteDeviceSingle",
            value: function (id) {
              var method,
                url = this._enablePostForDelete
                  ? ((method = "POST"), "Devices/Delete")
                  : ((method = "DELETE"), "Devices");
              return this.ajax({type: method, url: this.getUrl(url, {Id: id})});
            },
          },
          {
            key: "deleteDevices",
            value: function (items) {
              return Promise.all(items.map(mapToId).map(this.deleteDeviceSingle.bind(this))).then(
                function (result) {
                  var instance = this.instance;
                  return (
                    _events.default.trigger(instance, "message", [
                      {MessageType: "DevicesDeleted", Data: {Ids: [], IsLocalEvent: !0}},
                    ]),
                    result
                  );
                }.bind({instance: this, items: items})
              );
            },
          },
          {
            key: "deleteLiveTVTunerDevice",
            value: function (id) {
              var method,
                url = this._enablePostForDelete
                  ? ((method = "POST"), "LiveTv/TunerHosts/Delete")
                  : ((method = "DELETE"), "LiveTv/TunerHosts");
              return this.ajax({type: method, url: this.getUrl(url, {Id: id})});
            },
          },
          {
            key: "deleteLiveTVGuideSource",
            value: function (id) {
              var method,
                url = this._enablePostForDelete
                  ? ((method = "POST"), "LiveTv/ListingProviders/Delete")
                  : ((method = "DELETE"), "LiveTv/ListingProviders");
              return this.ajax({type: method, url: this.getUrl(url, {Id: id})});
            },
          },
          {
            key: "getConfigurationPages",
            value: function (options, signal) {
              return null != options && options.EnableInUserMenu && !this.isMinServerVersion("4.8.0.20")
                ? Promise.resolve([])
                : this.getJSON(
                    this.getUrl(
                      "web/configurationpages",
                      Object.assign({PageType: "PluginConfiguration", UserId: this.getCurrentUserId()}, options)
                    ),
                    signal
                  );
            },
          },
        ]),
        ApiClient
      );
    })();
  (ApiClient.prototype.getScaledImageUrl = function (itemId, options) {
    return this.getImageUrl(itemId, options);
  }),
    (_exports.default = ApiClient);
});
