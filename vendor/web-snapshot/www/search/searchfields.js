define([
  "exports",
  "./../modules/emby-apiclient/connectionmanager.js",
  "./../modules/emby-apiclient/events.js",
  "./../modules/common/globalize.js",
  "./../modules/browser.js",
  "./../modules/alphapicker/alphapicker.js",
  "./../modules/layoutmanager.js",
  "./../modules/emby-elements/emby-input/emby-input.js",
  "./../modules/emby-elements/emby-button/emby-button.js",
  "./../modules/common/servicelocator.js",
  "./../modules/approuter.js",
], function (
  _exports,
  _connectionmanager,
  _events,
  _globalize,
  _browser,
  _alphapicker,
  _layoutmanager,
  _embyInput,
  _embyButton,
  _servicelocator,
  _approuter
) {
  function onSearchTimeout() {
    var value = ((value = this.nextSearchValue) || "").trim(),
      context = (_events.default.trigger(this, "search", [value]), this.options.element);
    value 
      ? ((this.mode = "search"), (value = context.querySelector(".searchSuggestions")) && value.classList.add("hide"))
      : ((this.mode = "suggestions"),
        (function (instance, context, apiClient) {
          var options = {
            SortBy: "IsFavoriteOrLiked,Random",
            IncludeItemTypes: "Movie,Series,MusicArtist",
            Limit: 20 * 1.5,
            Recursive: !0,
            ImageTypeLimit: 0,
            EnableImages: !1,
            ParentId: instance.options.parentId,
            EnableTotalRecordCount: !1,
          };
          apiClient.getItems(apiClient.getCurrentUserId(), options).then(function (result) {
            "suggestions" !== instance.mode && (result.Items = []);
            var html = result.Items.map(function (i) {
                var itemHtml =
                  '<div><a is="emby-linkbutton" class="button-link" style="display:inline-block;padding:.5em 1em;" href=".' +
                  _approuter.default.getRouteUrl(i) +
                  '">';
                return itemHtml + i.Name + "</a></div>";
              }).join(""),
              searchSuggestions = context.querySelector(".searchSuggestions");
            (searchSuggestions.querySelector(".searchSuggestionsList").innerHTML = html),
              result.Items.length
                ? searchSuggestions.classList.remove("hide")
                : searchSuggestions.classList.add("hide");
          });
        })(this, context, _connectionmanager.default.getApiClient(this.options.serverId)));
  }
  function triggerSearch(instance, value, immediate) {
    instance.searchTimeout && clearTimeout(instance.searchTimeout), (instance.nextSearchValue = value);
    value = immediate ? 0 : 500;
    instance.searchTimeout = setTimeout(onSearchTimeout.bind(instance), value);
  }
  function initAlphaPicker(alphaPickerElement, instance) {
    (instance.alphaPicker = new _alphapicker.default({element: alphaPickerElement, mode: "keyboard"})),
      alphaPickerElement.addEventListener(
        "alphavalueclicked",
        function (e) {
          var val,
            e = e.detail.value,
            txtSearch = this.options.element.querySelector(".searchfields-txtSearch");
          "backspace" === e
            ? ((val = txtSearch.value), (txtSearch.value = val.length ? val.substring(0, val.length - 1) : ""))
            : (-1 === txtSearch.maxLength || txtSearch.value.length < txtSearch.maxLength) && (txtSearch.value += e),
            txtSearch.dispatchEvent(new CustomEvent("input", {bubbles: !0}));
        }.bind(instance)
      );
  }
  function onVoiceInputRequest(e) {
    var instance = this;
    _servicelocator.appHost.requestSpeechRecognitionPermission().then(
      function () {
        var recognition = instance.speechRecognition;
        if (!recognition)
          try {
            recognition = (function (instance) {
              var recognition = new SpeechRecognition();
              return (
                (recognition.continuous = !1),
                (recognition.onresult = function (event) {
                  var current = event.resultIndex || 0,
                    event = event.results[current][0].transcript;
                  (instance.options.element.querySelector(".searchfields-txtSearch").value = event),
                    triggerSearch(instance, event);
                }),
                (instance.speechRecognition = recognition)
              );
            })(instance);
          } catch (err) {
            console.log("error creating SpeechRecognition: " + err);
          }
        try {
          recognition.start();
        } catch (err) {
          console.log("error starting SpeechRecognition: " + err);
        }
      },
      function () {}
    );
  }
  function embed(elem, instance, options) {
    require(["text!search/searchfields.template.html"]).then(function (responses) {
      elem.innerHTML = _globalize.default.translateDocument(responses[0]);
      var responses = elem.querySelector(".searchfields-txtSearch"),
        alphaPickerElement =
          (_browser.default.tizen && responses.setAttribute("readonly", "readonly"),
          _layoutmanager.default.tv &&
            (responses.setAttribute("virtualkeyboardpolicy", "manual"),
            responses.setAttribute("virtualkeyboardpolicy", "inputmode", "none"),
            responses.setAttribute("placeholder", _globalize.default.translate("Search")),
            elem.querySelector(".searchFieldsSearchIcon").classList.remove("hide")),
          elem.classList.add("searchFields"),
          _layoutmanager.default.tv &&
            ((alphaPickerElement = elem.querySelector(".alphaPicker")),
            elem.querySelector(".alphaPicker").classList.remove("hide"),
            initAlphaPicker(alphaPickerElement, instance)),
          responses.addEventListener(
            "input",
            function (e) {
              triggerSearch(this, e.target.value);
            }.bind(instance)
          ),
          options.value &&
            ((responses.value = options.value), instance.firstLoad && triggerSearch(instance, options.value, !0)),
          elem.querySelector(".btnVoiceInput"));
      self.SpeechRecognition &&
        _servicelocator.appHost.supports("speechrecognition") &&
        alphaPickerElement.classList.remove("hide"),
        alphaPickerElement.addEventListener("click", onVoiceInputRequest.bind(instance)),
        instance.focus();
    });
  }
  function SearchFields(options) {
    embed((this.options = options).element, this, options);
  }
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["flexStyles", "material-icons", "css!search/searchfields"]),
    (SearchFields.prototype.getSearchTerm = function () {
      var txt = this.options.element.querySelector(".searchfields-txtSearch");
      return (txt && txt.value) || null;
    }),
    (SearchFields.prototype.pause = function () {
      this.destroyVoiceInput();
    }),
    (SearchFields.prototype.resume = function () {
      this.firstLoad || ((this.firstLoad = !0), onSearchTimeout.call(this));
    }),
    (SearchFields.prototype.focus = function () {
      this.options.element.querySelector(".searchfields-txtSearch").focus();
    }),
    (SearchFields.prototype.destroyVoiceInput = function () {
      var recognition = this.speechRecognition;
      if (recognition) {
        (this.speechRecognition = null), (recognition.onresult = null);
        try {
          recognition.abort();
        } catch (err) {
          console.log("error aborting SpeechRecognition: " + err);
        }
      }
    }),
    (SearchFields.prototype.destroy = function () {
      this.destroyVoiceInput();
      var options = this.options,
        options =
          (options && options.element.classList.remove("searchFields"), (this.options = null), this.alphaPicker),
        options = (options && options.destroy(), (this.alphaPicker = null), this.searchTimeout);
      options && clearTimeout(options), (this.searchTimeout = null), (this.nextSearchValue = null);
    }),
    (_exports.default = SearchFields);
});
