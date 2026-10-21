define(["exports", "./../dom.js"], function (_exports, _dom) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var prevContext,
    prevPageContext,
    base = "",
    allRoutes = [];
  function page(path, routeInfo, fn) {
    "function" == typeof fn
      ? ((page.callbacks[path.toUpperCase()] = {routeInfo: routeInfo, fn: fn}), allRoutes.push(routeInfo))
      : page.start(path);
  }
  (page.getRoutes = function () {
    return allRoutes;
  }),
    (page.callbacks = {}),
    (page.current = ""),
    (page.base = function (path) {
      if (0 === arguments.length) return base;
      base = path;
    });
  var loaded = "complete" === document.readyState;
  function onpopstate(e) {
    var path;
    loaded &&
      !(function (event) {
        event = event.state || {};
        return !1 !== previousPopState.navigate ? ((previousPopState = event), !1) : ((previousPopState = event), !0);
      })(e) &&
      (e.state
        ? ((path = e.state.path), page.replace(path, e.state, null, null, !0))
        : page.show(location.pathname + location.hash, void 0, void 0, !1, !0));
  }
  function decodeURLEncodedURIComponent(val) {
    return "string" != typeof val ? val : decodeURIComponent(val.replace(/\+/g, " "));
  }
  function Context(path, state) {
    var i = (path = "/" === path[0] && 0 !== path.indexOf(base) ? base + "#!" + path : path).indexOf("?");
    (this.canonicalPath = path),
      (this.path = path.replace(base, "") || "/"),
      (this.path = this.path.replace("#!", "") || "/"),
      (this.title = document.title),
      (this.state = state || {}),
      (this.state.path = path),
      (this.querystring = ~i ? decodeURLEncodedURIComponent(path.slice(i + 1)) : ""),
      (this.pathname = decodeURLEncodedURIComponent(~i ? path.slice(0, i) : path)),
      (this.hash = "");
  }
  _dom.default.addEventListener(
    window,
    "load",
    function () {
      setTimeout(function () {
        loaded = !0;
      }, 0);
    },
    {once: !0}
  ),
    (page.start = function (options) {
      var url;
      !1 !== (options = options || {}).popstate && window.addEventListener("popstate", onpopstate, !1),
        ~location.hash.indexOf("#!")
          ? ((url = location.hash.substr(2)),
            (options = location.href.toString()).indexOf("?") >= options.indexOf("#!") && (url += location.search))
          : (url = location.pathname + location.search + location.hash),
        page.replace(url, null, !0, !0);
    }),
    (page.show = function (path, state, dispatch, push, isBack) {
      path = new Context(path, state);
      return (
        (path.isBack = isBack),
        (page.current = path.path),
        !1 !== dispatch && page.dispatch(path),
        !1 !== path.handled && !1 !== push && path.pushState(),
        path
      );
    }),
    (page.restorePreviousState = function () {
      (prevContext = prevPageContext), page.show(prevContext.pathname, prevContext.state, !1, !0, !1);
    }),
    (page.back = function (path, state) {
      history.back();
    }),
    (page.forward = function () {
      history.forward();
    }),
    (page.canGoBack = function () {
      return 1 < history.length;
    }),
    (page.replace = function (path, state, init, dispatch, isBack) {
      path = new Context(path, state);
      return (
        (path.isBack = isBack),
        (page.current = path.path),
        (path.init = init),
        path.save(),
        !1 !== dispatch && page.dispatch(path),
        path
      );
    }),
    (page.getRoute = function (path) {
      var callbacks = page.callbacks,
        qsIndex = path.indexOf("?"),
        callbacks = callbacks[(~qsIndex ? path.slice(0, qsIndex) : path).toUpperCase()];
      return callbacks ? callbacks.routeInfo : null;
    }),
    (page.dispatch = function (ctx) {
      (prevPageContext = prevContext), (prevContext = ctx);
      var qsIndex,
        callbacks = page.callbacks,
        path = ctx.path;
      {
        if (path === page.current)
          return (callbacks = callbacks[(~(qsIndex = path.indexOf("?")) ? path.slice(0, qsIndex) : path).toUpperCase()])
            ? callbacks.fn(ctx, callbacks.routeInfo)
            : void 0;
        ctx.handled = !1;
      }
    }),
    (Context.prototype.pushState = function () {
      history.pushState(this.state, this.title, "/" !== this.path ? "#!" + this.path : this.canonicalPath);
    }),
    (Context.prototype.save = function () {
      history.replaceState(this.state, this.title, "/" !== this.path ? "#!" + this.path : this.canonicalPath);
    });
  var previousPopState = {};
  (page.pushState = function (state, title, url) {
    (url = "#!" + url), history.pushState(state, title, url), (previousPopState = state);
  }),
    (page.handleAnchorClick = function (e) {
      var orig, el;
      1 !==
        (function (e) {
          return null === (e = e || window.event).which ? e.button : e.which;
        })(e) ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.defaultPrevented ||
        ((el = (el = e.target) && el.closest("A")) &&
          "A" === el.nodeName &&
          !el.hasAttribute("download") &&
          "external" !== el.getAttribute("rel") &&
          ("#" === el.getAttribute("href")
            ? e.preventDefault()
            : !el.target &&
              (function (href) {
                var origin = location.protocol + "//" + location.hostname;
                location.port && (origin += ":" + location.port);
                return href && 0 === href.indexOf(origin);
              })(el.href) &&
              ((orig = el = el.pathname + el.search + (el.hash || "")),
              (el = (el = 0 === el.indexOf(base) ? el.substr(base.length) : el).replace("#!", "")),
              e.preventDefault(),
              page.show(orig))));
    }),
    (_exports.default = page);
});
