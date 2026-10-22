define([
  "exports",
  "./../dom.js",
  "./../common/globalize.js",
  "./../emby-apiclient/events.js",
  "./navdrawercontent.js",
  "./../common/usersettings/usersettings.js",
  "./../emby-elements/emby-scroller/emby-scroller.js",
], function (_exports, _dom, _globalize, _events, _navdrawercontent, _usersettings, _embyScroller) {
  Object.defineProperty(_exports, "__esModule", {value: !0}),
    (_exports.default = void 0),
    require(["css!modules/navdrawer/navdrawer.css"]);
  var instance,
    mask,
    _scrollingElement,
    navDrawerElement = document.querySelector(".mainDrawer"),
    DrawerStates_Closed = 0,
    DrawerStates_Open = 1,
    DrawerStates_Docked = 2;
  function onMainDrawerClick(e) {
    e.target.closest(".btnPinNavDrawer") && instance.togglePinState();
  }
  function setPinIcon(icon) {
    var title,
      btnPinNavDrawerIcon = navDrawerElement.querySelector(".btnPinNavDrawerIcon"),
      btnPinNavDrawerIcon =
        (btnPinNavDrawerIcon && (btnPinNavDrawerIcon.innerHTML = icon),
        navDrawerElement.querySelector(".btnPinNavDrawer"));
    btnPinNavDrawerIcon &&
      ("menu_open" === icon
        ? ((title = _globalize.default.translate("HeaderCloseSidebar")),
          btnPinNavDrawerIcon.classList.remove("btnPinNavDrawer-iconpin"),
          btnPinNavDrawerIcon.classList.add("btnPinNavDrawer-iconclose"))
        : ((title = _globalize.default.translate("HeaderPinSidebar")),
          btnPinNavDrawerIcon.classList.add("btnPinNavDrawer-iconpin"),
          btnPinNavDrawerIcon.classList.remove("btnPinNavDrawer-iconclose")),
      (btnPinNavDrawerIcon.title = title),
      btnPinNavDrawerIcon.setAttribute("aria-label", title));
  }
  function NavDrawer() {
    (instance = this),
      navDrawerElement.classList.add("hiddenScrollY-hover"),
      navDrawerElement.classList.add("scrollY-mini"),
      _dom.default.addEventListener(navDrawerElement, "click", onMainDrawerClick, {passive: !0}),
      _dom.default.addEventListener(navDrawerElement, _dom.default.whichTransitionEvent(), onNavDrawerTransitionEnd, {
        passive: !0,
        capture: !0,
      });
  }
  function getScrollingElement() {
    var elem = _scrollingElement;
    return elem || ((elem = document.scrollingElement || document.documentElement), (_scrollingElement = elem)), elem;
  }
  function onNavDrawerTransitionEnd(e) {
    e.target !== e.currentTarget || this.classList.contains("drawer-open") || this.classList.add("hide");
  }
  function onMaskTransitionEnd(e) {
    e.target === e.currentTarget &&
      (e = mask) &&
      e.classList.contains("drawer-backdrop-fadeout") &&
      (e.remove(), (mask = null));
  }
  (NavDrawer.prototype.open = function (isDocked) {
    _navdrawercontent.default.onBeforeOpen(),
      isDocked
        ? (navDrawerElement.classList.add("drawer-docked"), setPinIcon("menu_open"))
        : (navDrawerElement.classList.remove("drawer-docked"), setPinIcon("view_sidebar")),
      (navDrawerElement.style.willChange = "transform");
    var newDrawerState = (this.drawerState = isDocked ? DrawerStates_Docked : DrawerStates_Open);
    navDrawerElement.classList.remove("hide"),
      navDrawerElement.offsetWidth,
      navDrawerElement.classList.add("drawer-open"),
      isDocked
        ? (this.hideMask(), getScrollingElement().classList.remove("withDialogOpen"))
        : (this.showMask(), getScrollingElement().classList.add("withDialogOpen")),
      _events.default.trigger(this, "drawer-state-change", [newDrawerState]);
  }),
    (NavDrawer.prototype.close = function () {
      var currentDrawerState = this.drawerState,
        newDrawerState =
          (currentDrawerState && (navDrawerElement.style.willChange = "transform"),
          (this.drawerState = DrawerStates_Closed));
      navDrawerElement.classList.remove("drawer-open", "drawer-docked"),
        this.hideMask(),
        getScrollingElement().classList.remove("withDialogOpen"),
        currentDrawerState === DrawerStates_Docked && navDrawerElement.classList.add("hide"),
        setPinIcon("view_sidebar"),
        _events.default.trigger(this, "drawer-state-change", [newDrawerState]);
    }),
    (NavDrawer.prototype.toggle = function () {
      this.drawerState ? this.close() : this.open();
    }),
    (NavDrawer.prototype.togglePinState = function () {
      this.drawerState === DrawerStates_Open
        ? (_usersettings.default.drawerStyle("docked"), this.open(!0))
        : (_usersettings.default.drawerStyle("closed"), this.close());
    }),
    (NavDrawer.prototype.showMask = function () {
      mask =
        mask ||
        (function (instance) {
          var mask = document.createElement("div");
          return (
            (mask.className = "drawer-backdrop"),
            _dom.default.addEventListener(mask, _dom.default.whichAnimationEvent(), onMaskTransitionEnd, {
              passive: !0,
              capture: !0,
            }),
            _dom.default.addEventListener(mask, "click", instance.close.bind(instance), {passive: !0}),
            document.body.appendChild(mask),
            mask
          );
        })(this);
    }),
    (NavDrawer.prototype.hideMask = function () {
      mask && mask.classList.add("drawer-backdrop-fadeout");
    });
  var _default = new NavDrawer();
  _exports.default = _default;
});
