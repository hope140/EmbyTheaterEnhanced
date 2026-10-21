define(["exports", "./layoutmanager.js", "./emby-apiclient/events.js"], function (_exports, _layoutmanager, _events) {
  Object.defineProperty(_exports, "__esModule", {value: !0}), (_exports.default = void 0);
  var scopes = [];
  function isAutoFocusEnabled(elem) {
    if (_layoutmanager.default.tv) return !0;
    if (elem)
      switch (elem.tagName) {
        case "INPUT":
          switch (elem.type) {
            case "checkbox":
            case "radio":
            case "file":
            case "hidden":
            case "range":
              return !1;
            default:
              return !0;
          }
          break;
        case "TEXTAREA":
          return !0;
      }
    return !1;
  }
  function getElementToAutoFocus(view, options) {
    var element;
    return (options && !1 === options.findAutoFocusElement) ||
      !(element = view.querySelector(".autofocus")) ||
      !isCurrentlyFocusableInternal(element)
      ? getFocusableElements(view, 1, ".noautofocus", options)[0] || getFocusableElements(view, 1, null, options)[0]
      : element;
  }
  function autoFocus(view, options) {
    view = getElementToAutoFocus(view, options);
    return view && focus(view, options);
  }
  function focus(element, options) {
    for (; element.classList.contains("focusable"); ) {
      var autoFocusElement = getElementToAutoFocus(element, options);
      if (!autoFocusElement) break;
      element = autoFocusElement;
    }
    return null != options && options.skipIfNotEnabled && !isAutoFocusEnabled(element)
      ? null
      : (focusInternal(element, options), element);
  }
  function focusInternal(element, options) {
    try {
      var preventScroll = options ? options.preventScroll : null;
      null == preventScroll && (preventScroll = !0), element.focus({preventScroll: preventScroll});
    } catch (err) {
      console.log("Error in focusManager.focusInternal: " + err);
    }
  }
  var focusableTagNames = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "DIV[tabindex]"],
    focusableQuerySelectors = focusableTagNames.map(function (t) {
      return "A" === t && (t += "[href]"), t + ':not([tabindex="-1"]):not(:disabled)';
    }),
    focusableQuery = (focusableQuerySelectors.push(".focusable"), focusableQuerySelectors.join(","));
  var focusableTagNameQuery = focusableTagNames.join(","),
    focusableParentQuery = focusableTagNames.join(",") + ",.focusable";
  function focusableParent(elem, includeGroups) {
    return !1 === includeGroups
      ? elem.closest(focusableTagNameQuery) || elem
      : elem.closest(focusableParentQuery) || elem;
  }
  function isCurrentlyFocusableInternal(elem) {
    return null !== elem.offsetParent;
  }
  var defaultScope = document.body;
  function getCurrentScope() {
    return scopes[scopes.length - 1] || defaultScope;
  }
  function getFocusableElements(parent, limit, excludeSelector, options) {
    for (
      var elems,
        fn = (parent = parent || getCurrentScope()).getFocusableElements,
        focusableElements =
          ((elems =
            (elems = fn ? fn(parent, document.activeElement, null, options) : elems) ||
            parent.querySelectorAll(
              (function (excludeSelector) {
                if (!excludeSelector) return focusableQuery;
                for (
                  var newQuerySelectors = [focusableQuerySelectors.length],
                    i = 0,
                    length = focusableQuerySelectors.length;
                  i < length;
                  i++
                )
                  newQuerySelectors[i] = focusableQuerySelectors[i] + ":not(" + excludeSelector + ")";
                return newQuerySelectors.join(",");
              })(excludeSelector)
            )),
          []),
        i = 0,
        length = elems.length;
      i < length;
      i++
    ) {
      var elem = elems[i];
      if (null !== elem.offsetParent && (focusableElements.push(elem), limit) && limit <= focusableElements.length)
        break;
    }
    return focusableElements;
  }
  var focusContainerQueries = [
    ".focuscontainer,.focuscontainer-x,.focuscontainer-left",
    ".focuscontainer,.focuscontainer-x,.focuscontainer-right",
    ".focuscontainer,.focuscontainer-y",
    ".focuscontainer,.focuscontainer-y,.focuscontainer-down",
  ];
  function getFocusContainer(elem, direction) {
    var defaultScopeResult,
      direction = focusContainerQueries[direction],
      direction = elem.closest(direction);
    return (
      direction ||
      ((direction = getCurrentScope()) === (defaultScopeResult = defaultScope) || direction.contains(elem)
        ? direction
        : defaultScopeResult)
    );
  }
  function getNearestElement(activeElement, activeElementRect, direction, focusableElements, focusableContainer) {
    for (
      var nearestElement,
        activeElementTop = activeElementRect.top,
        activeElementLeft = activeElementRect.left,
        point1x = parseFloat(activeElementLeft) || 0,
        point1y = parseFloat(activeElementTop) || 0,
        point2x = parseFloat(point1x + activeElementRect.width - 1) || point1x,
        point2y = parseFloat(point1y + activeElementRect.height - 1) || point1y,
        minDistance = 1 / 0,
        i = 0,
        length = focusableElements.length;
      i < length;
      i++
    ) {
      var curr = focusableElements[i];
      if (curr !== activeElement && curr !== focusableContainer) {
        var elementRect = curr.getBoundingClientRect(),
          elementRectWidth = elementRect.width,
          elementRectHeight = elementRect.height;
        if (elementRectWidth || elementRectHeight) {
          var elementRectLeft = elementRect.left,
            elementRectTop = elementRect.top;
          switch (direction) {
            case 0:
              if (activeElementLeft <= elementRectLeft) continue;
              if (elementRect.right === activeElementRect.right) continue;
              break;
            case 1:
              if (elementRect.right <= activeElementRect.right) continue;
              if (elementRectLeft === activeElementLeft) continue;
              break;
            case 2:
              if (activeElementTop <= elementRectTop) continue;
              if (elementRect.bottom >= activeElementRect.bottom) continue;
              break;
            case 3:
              if (elementRect.bottom <= activeElementRect.bottom) continue;
              if (elementRectTop <= activeElementTop) continue;
          }
          var x2 = elementRectLeft + elementRectWidth - 1,
            y2 = elementRectTop + elementRectHeight - 1,
            distX = void 0,
            distY = void 0;
          switch (direction) {
            case 0:
              var intersectY = intersection(point1y, point2y, elementRectTop, y2),
                distX = Math.abs(point1x - Math.min(point1x, x2)),
                distY = intersectY || 1 + Math.min(Math.abs(point1y - y2), Math.abs(point2y - elementRectTop));
              break;
            case 1:
              intersectY = intersection(point1y, point2y, elementRectTop, y2);
              (distX = Math.abs(point2x - Math.max(point2x, elementRectLeft))),
                (distY = intersectY || 1 + Math.min(Math.abs(point1y - y2), Math.abs(point2y - elementRectTop)));
              break;
            case 2:
              var intersectX = intersection(point1x, point2x, elementRectLeft, x2);
              (distY = Math.abs(point1y - Math.min(point1y, y2))),
                (distX = intersectX || 1 + Math.min(Math.abs(point1x - x2), Math.abs(point2x - elementRectLeft)));
              break;
            case 3:
              intersectX = intersection(point1x, point2x, elementRectLeft, x2);
              (distY = Math.abs(point2y - Math.max(point2y, elementRectTop))),
                (distX = intersectX || 1 + Math.min(Math.abs(point1x - x2), Math.abs(point2x - elementRectLeft)));
          }
          elementRectWidth = Math.sqrt(distX * distX + distY * distY);
          elementRectWidth < minDistance && ((nearestElement = curr), (minDistance = elementRectWidth));
        }
      }
    }
    return nearestElement;
  }
  function intersection(a1, a2, b1, b2) {
    (b1 = Math.max(a1, b1)), (b2 = Math.min(a2, b2));
    return b2 <= b1 ? null : 1e-9 + (1 - (b2 - b1) / (a2 - a1));
  }
  function navOuter(sourceElement, direction) {
    var _container$controller,
      newElement,
      container = sourceElement ? getFocusContainer(sourceElement, direction) : getCurrentScope();
    if (container === sourceElement)
      return null != (_container$controller = container.controller) && _container$controller.autoFocus
        ? container.controller.autoFocus({skipIfNotEnabled: !1})
        : autoFocus(container);
    for (
      ;
      container &&
      !(newElement = (function (activeElement, direction, container) {
        var focusableContainer, nearestElement, fn, activeElementRect;
        return (activeElement =
          (activeElement = activeElement || document.activeElement) && focusableParent(activeElement))
          ? ((focusableContainer = activeElement.closest(".focusable")),
            (fn =
              ((fn = container.getFocusableElements) && fn(nearestElement, activeElement, direction)) ||
              container.querySelectorAll(focusableQuery)),
            (activeElementRect = activeElement.getBoundingClientRect()),
            (nearestElement = getNearestElement(activeElement, activeElementRect, direction, fn, focusableContainer))
              ? "autofocus" ===
                (fn = (nearestElement =
                  activeElement &&
                  (fn = nearestElement.closest(".focusable")) &&
                  fn !== nearestElement &&
                  focusableContainer !== fn
                    ? fn
                    : nearestElement).getAttribute("data-focusabletype"))
                ? autoFocus(nearestElement)
                : "nearest" === fn
                ? ((activeElementRect = activeElementRect || activeElement.getBoundingClientRect()),
                  (activeElementRect = getNearestElement(
                    activeElement,
                    activeElementRect,
                    direction,
                    ((fn = nearestElement.getFocusableElements) && fn(nearestElement, activeElement, direction)) ||
                      nearestElement.querySelectorAll(focusableQuery),
                    focusableContainer
                  ))
                    ? (focusInternal(activeElementRect), activeElementRect)
                    : autoFocus(nearestElement))
                : (focusInternal(nearestElement, {}), nearestElement)
              : void 0)
          : autoFocus(container, {findAutoFocusElement: !1});
      })(sourceElement, direction, container)) &&
      (function (container, direction) {
        var classList = container.classList;
        switch (direction) {
          case 0:
          case 1:
            return classList.contains("navout-x");
          case 2:
            return classList.contains("navout-up");
          default:
            return;
        }
      })(container, direction);

    ) {
      var parentNode = container.parentNode;
      if (!parentNode) break;
      container = getFocusContainer(parentNode, direction);
    }
    return newElement;
  }
  var focusManager = {
    autoFocus: autoFocus,
    focus: focus,
    focusableParent: focusableParent,
    moveLeft: function (sourceElement) {
      navOuter(sourceElement, 0) && _events.default.trigger(focusManager, "move");
    },
    moveRight: function (sourceElement) {
      navOuter(sourceElement, 1) && _events.default.trigger(focusManager, "move");
    },
    moveUp: function (sourceElement) {
      navOuter(sourceElement, 2) && _events.default.trigger(focusManager, "move");
    },
    moveDown: function (sourceElement) {
      navOuter(sourceElement, 3) && _events.default.trigger(focusManager, "move");
    },
    sendText: function (text) {
      document.activeElement.value = text;
    },
    isCurrentlyFocusable: function (elem) {
      return !!elem.matches(focusableQuery) && null !== elem.offsetParent;
    },
    pushScope: function (elem) {
      scopes.includes(elem) || scopes.push(elem);
    },
    popScope: function (elem) {
      var arr;
      (elem = elem), -1 < (elem = (arr = scopes).indexOf(elem)) && arr.splice(elem, 1);
    },
    hasExclusiveFocusScope: function () {
      return scopes.length;
    },
    getCurrentScope: getCurrentScope,
    isAutoFocusEnabled: isAutoFocusEnabled,
  };
  _exports.default = focusManager;
});
