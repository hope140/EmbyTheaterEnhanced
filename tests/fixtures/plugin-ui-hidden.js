'use strict';

(function() {
    var assertions = 0;
    function check(condition, label) {
        assertions++;
        if (!condition) { var error = new Error('fixture assertion'); error.fixtureClass = label; throw error; }
    }
    function wait(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }
    function byId(id) { return document.getElementById(id); }
    function safeErrorClass(error) {
        var message = String(error && error.message || '');
        var property = /reading [\"']([A-Za-z0-9_$]+)[\"']/.exec(message);
        var missingFunction = /([A-Za-z0-9_$.]+) is not a function/.exec(message);
        var kind = property ? 'missing_' + property[1] : missingFunction ? 'not_function_' + missingFunction[1].replace(/\./g, '_') : /innerHTML/i.test(message) ? 'inner_html' : /querySelector/i.test(message) ? 'query_selector' : /appendChild/i.test(message) ? 'append_child' :
            error && error.name === 'TypeError' ? 'type_error' : error && error.name === 'ReferenceError' ? 'reference_error' : 'unknown';
        var frames = String(error && error.stack || '').split('\n');
        var frame = frames.map(function(line) { return /at ([A-Za-z0-9_.$]+)/.exec(line); }).filter(Boolean)[0];
        return kind + (frame ? '_at_' + frame[1].replace(/[^A-Za-z0-9_$]+/g, '_') : '');
    }
    function defineAlias(name, target) {
        define(name, [target], function(value) { return value; });
    }
    function aliases() {
        defineAlias('baseView', 'modules/viewmanager/baseview.js');
        defineAlias('datetime', 'modules/common/datetime.js');
        defineAlias('globalize', 'modules/common/globalize.js');
        defineAlias('apphost', 'modules/apphost.js');
        defineAlias('loading', 'modules/loading/loading.js');
        defineAlias('pluginManager', 'modules/common/pluginmanager.js');
        defineAlias('responseHelper', 'enhanced/plugin-ui/responsehelper.js');
        defineAlias('emby-input', 'modules/emby-elements/emby-input/emby-input.js');
        defineAlias('emby-button', 'modules/emby-elements/emby-button/emby-button.js');
        defineAlias('emby-checkbox', 'modules/emby-elements/emby-checkbox/emby-checkbox.js');
        defineAlias('emby-scroller', 'modules/emby-elements/emby-scroller/emby-scroller.js');
        defineAlias('emby-select', 'modules/emby-elements/emby-select/emby-select.js');
        defineAlias('emby-premierecontainer', 'enhanced/plugin-ui/premierecontainer.js');
    }
    function requireAll(ids) {
        return ids.reduce(function(chain, id) {
            return chain.then(function(values) {
                return new Promise(function(resolve, reject) {
                    require([id], function(value) { values.push(value); resolve(values); }).catch(function(error) {
                        var failedId = error && error.requireModules && error.requireModules[0];
                        var suffix = failedId ? failedId.split('/').pop().replace(/\.js$/, '') : id.split('/').pop().replace(/\.js$/, '');
                        var kind = error && error.name ? String(error.name).replace(/[^A-Za-z0-9]+/g, '_') : typeof error;
                        var message = String(error && error.message || '');
                        if (/CustomElementRegistry|custom element/i.test(message)) kind += '_custom_element';
                        else if (/cannot be invoked without 'new'|Illegal constructor/i.test(message)) kind += '_native_constructor';
                        else if (/Cannot read properties|undefined/i.test(message)) {
                            var property = /reading [\"']([A-Za-z0-9_$]+)[\"']/.exec(message);
                            kind += property ? '_missing_' + property[1] : '_dependency_value';
                        }
                        else if (/already been defined/i.test(message)) kind += '_duplicate_definition';
                        var frame = String(error && error.stack || '').split('\n')[1] || '';
                        var functionName = /at ([A-Za-z0-9_.$]+)/.exec(frame);
                        if (functionName) kind += '_at_' + functionName[1];
                        reject({fixtureClass: 'module_load_failed_' + suffix.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_' + kind});
                    });
                });
            });
        }, Promise.resolve([]));
    }

    window.__fixture = {injected: false};
    window.__fixtureResult = null;
    require.config({baseUrl: '/', noRequireCss: true});
    aliases();

    var moduleIds = [
        'baseView', 'datetime', 'globalize', 'apphost', 'loading', 'pluginManager', 'responseHelper',
        'emby-input', 'emby-button', 'emby-checkbox', 'emby-scroller', 'emby-select', 'emby-premierecontainer',
        'modules/dom.js', 'modules/emby-apiclient/events.js', 'modules/genericedit/genericedit.js',
        'enhanced/plugin-ui/genericui.js', 'enhanced/plugin-ui/schema.js',
        'modules/viewmanager/baseview.js', 'modules/common/datetime.js', 'modules/common/globalize.js',
        'modules/apphost.js', 'modules/loading/loading.js', 'modules/common/pluginmanager.js',
        'enhanced/plugin-ui/responsehelper.js', 'modules/emby-elements/emby-input/emby-input.js',
        'modules/emby-elements/emby-button/emby-button.js', 'modules/emby-elements/emby-checkbox/emby-checkbox.js',
        'modules/emby-elements/emby-scroller/emby-scroller.js', 'modules/emby-elements/emby-select/emby-select.js',
        'enhanced/plugin-ui/premierecontainer.js', 'modules/maintabsmanager.js', 'modules/appheader/appheader.js'
    ];
    requireAll(moduleIds).then(function(loaded) {
        check(loaded.every(Boolean), 'required_modules_resolved');
        check(typeof self.babelHelpers === 'object', 'babel_helpers_object');
        check(typeof self.babelHelpers.createSuper === 'function', 'babel_create_super');
        check(typeof self._createSuper === 'function', 'underscore_create_super');
        check(typeof babelHelpers === 'object', 'bare_babel_helpers_global');
        check(typeof self.babelHelpers.toConsumableArray === 'function', 'genericedit_helper_bootstrapped');
        check(typeof customElements.get('emby-input') === 'function', 'real_input_control_registered');
        check(typeof customElements.get('emby-button') === 'function', 'real_button_control_registered');
        check(typeof customElements.get('emby-checkbox') === 'function', 'real_checkbox_control_registered');
        check(typeof customElements.get('emby-select') === 'function', 'real_select_control_registered');
        var aliasesMatchCanonical = [[0, 18], [1, 19], [2, 20], [3, 21], [4, 22], [5, 23], [6, 24],
            [7, 25], [8, 26], [9, 27], [10, 28], [11, 29], [12, 30]].every(function(pair) { return loaded[pair[0]] === loaded[pair[1]]; });
        check(aliasesMatchCanonical, 'backup_aliases_match_canonical_modules');

        var View = loaded[16].default;
        var schema = loaded[17].default;
        window.__renderPhase = 'not_started';
        var originalRender = View.prototype.render;
        View.prototype.render = function(input, generation) {
            try { schema.prepare(input); } catch (_) { window.__renderPhase = 'schema_reject'; throw _; }
            window.__renderPhase = 'genericedit_render';
            var result;
            try { result = originalRender.call(this, input, generation); } catch (error) {
                window.__renderPhase = 'genericedit_sync_' + safeErrorClass(error);
                throw error;
            }
            return Promise.resolve(result).then(function(value) { window.__renderPhase = 'rendered'; return value; }, function(error) {
                window.__renderPhase = 'genericedit_async_' + safeErrorClass(error);
                throw error;
            });
        };
        var viewNode = byId('view');
        var view = new View(viewNode, {PageId: 'synthetic'});
        view.onResume();
        return wait(120).then(function() {
            var loadFailed = !view.data && !viewNode.querySelector('.pluginError').hidden;
            check(view.data && view.data.PageId === 'synthetic', loadFailed ? 'ui_view_failed_' + window.__renderPhase : 'ui_view_pending_or_not_rendered');
            ['text', 'numeric', 'enabled', 'single', 'multiple', 'date', 'status', 'action'].forEach(function(id) {
                check(!!byId(id), 'field_' + id + '_rendered');
            });
            check(viewNode.querySelectorAll('script').length === 0, 'unsafe_values_no_script_nodes');
            check(viewNode.querySelectorAll('[onerror],[onclick]').length === 0, 'unsafe_values_no_event_attributes');
            check(!window.__fixture.injected, 'unsafe_values_not_executed');
            var headerTabs = window.__pluginHeaderTabs && window.__pluginHeaderTabs.querySelector('.emby-tabs-slider');
            check(!!headerTabs && headerTabs.children.length === 1, 'only_safe_header_tab_rendered');
            check(viewNode.querySelector('.labelText').textContent.indexOf('<img') === 0, 'label_text_rendered_as_text');
            check(!viewNode.querySelector('.labelText').getAttribute('href'), 'unsafe_label_link_removed');
            var progress = viewNode.querySelector('.taskProgressInner');
            check(!!progress && progress.style.width === '42%', 'finite_progress_rendered_safely');
            check(Array.from(viewNode.querySelectorAll('.listItemBodyText')).some(function(node) { return node.textContent.indexOf('<img') === 0; }), 'itemlist_tag_text_rendered_safely');

            var update = JSON.parse(JSON.stringify(window.__fixturePage));
            update.ViewId = 'view-updated';
            update.IsPageChangeInfo = true;
            update.Caption = 'Synthetic update';
            update.EditObjectContainer.Object.text = 'notification value';
            loaded[14].default.trigger(window.__notifications, 'UIPageInfoChanged', [window.__fixtureClient, update]);
            return wait(80).then(function() {
                check(view.data.ViewId === 'view-updated', 'notification_rerendered_owned_page');
                check(byId('text').value === 'notification value', 'notification_values_rendered');
                check(!!byId('numeric') && !!byId('single') && !!byId('multiple'), 'notification_preserved_editor_schema');

            byId('text').value = 'edited text';
            byId('numeric').value = '17';
            byId('enabled').checked = true;
            byId('single').value = 'two';
            byId('multiple').values = ['red', 'blue'];
            byId('date').value = '2026-03-04';
            return view.runCommand('PageSave').then(function() { return wait(90); }).then(function() {
                check(!!window.__lastCommand, 'command_received');
                var sent = JSON.parse(window.__lastCommand.Data);
                check(sent.text === 'edited text', 'text_edit_captured');
                check(sent.numeric === '17', 'numeric_edit_captured_as_inherited_string');
                check(sent.enabled === true, 'boolean_edit_captured');
                check(sent.single === 'two', 'single_select_edit_captured');
                check(Array.isArray(sent.multiple) ? sent.multiple.join(',') === 'red,blue' : sent.multiple === 'red,blue', 'multi_select_edit_captured');
                var midnightUtc = Date.parse('2026-03-04T00:00:00Z');
                var expectedDate = new Date(midnightUtc + new Date(midnightUtc).getTimezoneOffset() * 60000).toISOString();
                check(sent.date === expectedDate, 'date_edit_captured_with_inherited_timezone_conversion');

                view.pageId = 'malicious-progress';
                return view.load().then(function() { return wait(60); }).then(function() {
                    var error = viewNode.querySelector('.pluginError');
                    check(!error.hidden && error.textContent === 'Plugin page could not be loaded. Please try again.', 'invalid_progress_shows_static_error');
                    check(!window.__fixture.injected && viewNode.querySelectorAll('script,[onerror],[onclick]').length === 0, 'invalid_progress_value_not_injected');
                view.onPause();
                view.pageId = 'late';
                var late = view.load();
                view.onPause();
                return late.then(function() { return wait(430); }).then(function() {
                    check(view.data.PageId === 'synthetic', 'late_response_cancelled_after_pause');
                    return requireAll(['fixture_missing_dependency.js']).then(function() {
                        check(false, 'missing_dependency_must_reject');
                    }, function() {
                        window.__missingRejected = true;
                        check(true, 'missing_dependency_rejected');
                    });
                });
                });
            });
            });
        });
    }).then(function() {
        return requireAll(['responseHelper']).then(function(modules) {
            var helper = modules[0].default;
            var raw = {status: 403, url: 'https://private.invalid/?api_key=synthetic-secret', headers: {Authorization: 'synthetic-secret'}, responseText: 'synthetic-secret'};
            return helper.handleErrorResponse(raw).then(function() { check(false, 'helper_error_must_reject'); }, function(error) {
                check(error instanceof Error && error !== raw && error.name === 'PluginRequestError' && error.status === 403, 'helper_rejection_is_clean_typed_error');
                var own = Object.getOwnPropertyNames(error).map(function(key) { return [key, error[key]]; });
                check(!JSON.stringify(own).includes('synthetic-secret') && !JSON.stringify(own).includes('private.invalid') && !error.cause && !error.headers && !error.url && !error.responseText, 'helper_rejection_contains_no_raw_data');
            }).then(function() {
                return helper.handleErrorResponse({name: 'AbortError', message: 'synthetic-secret', headers: raw.headers}).then(function() { check(false, 'helper_abort_must_reject'); }, function(error) {
                    check(error instanceof Error && error.name === 'AbortError' && error.message === 'Plugin request cancelled.' && window.__p2Alerts === 1, 'helper_abort_is_clean_and_silent');
                });
            });
        });
    }).then(function() {
        window.__fixtureResult = {ok: true, assertions: assertions, observations: {missing_dependency_rejected: window.__missingRejected === true}};
    }).catch(function(error) {
        window.__fixtureResult = {ok: false, assertions: assertions, failureClass: error && error.fixtureClass || 'runtime_exception', observations: {missing_dependency_rejected: window.__missingRejected === true}};
    });
}());

// The renderer-side transport is synthetic and remains on loopback.
define('modules/emby-apiclient/connectionmanager.js', ['exports'], function(exports) {
    var client = {
        getUrl: function(name, query) {
            var params = new URLSearchParams(query || {});
            return '/api/' + name + (params.size ? '?' + params.toString() : '');
        },
        getJSON: function(url) { return fetch(url).then(function(response) { if (!response.ok) throw {status: response.status}; return response.json(); }).then(function(data) { if (data.PageId === 'synthetic') window.__fixturePage = data; return data; }); },
        ajax: function(options) {
            window.__lastCommand = JSON.parse(options.data);
            return fetch(options.url, {method: options.type, headers: {'content-type': options.contentType}, body: options.data})
                .then(function(response) { if (!response.ok) throw {status: response.status}; return response.json(); });
        }
    };
    window.__fixtureClient = client;
    exports.default = {currentApiClient: function() { return client; }};
});

define('modules/common/input/api.js', ['exports'], function(exports) { exports.default = window.__notifications = {}; });
define('modules/layoutmanager.js', ['exports'], function(exports) { exports.default = {tv: false}; });
define('modules/browser.js', ['exports'], function(exports) { exports.default = {android: false}; });
define('modules/actionsheet/actionsheet.js', ['exports'], function(exports) { exports.default = {}; });
define('modules/dialoghelper/dialoghelper.js', ['exports'], function(exports) {
    exports.default = {createDialog: function() { throw new Error('dialog path not in scope'); }, open: function() {}, close: function() {}};
});
define('modules/approuter.js', ['exports'], function(exports) {
    exports.default = {handleAnchorClick: function() {}, getRouteInfo: function() { return null; }, show: function() {}};
});
define('modules/maintabsmanager.js', ['exports'], function(exports) {
    var owner = null, current = null, host = document.createElement('div');
    exports.default = {
        setTabs: function(view, selectedIndex, getTabsFn, _getTabContainersFn, onTabChange) {
            if (!view) {
                owner = null; current = null; host.replaceChildren(); window.__pluginHeaderTabs = null;
                return {tabsContainer: host, replaced: false};
            }
            owner = view;
            var tabs = getTabsFn(), root = document.createElement('div'), slider = document.createElement('div');
            root.className = 'tabs-viewmenubar'; root.setAttribute('is', 'emby-tabs');
            slider.className = 'emby-tabs-slider'; root.appendChild(slider);
            if (onTabChange) root.addEventListener('tabchange', onTabChange);
            function select(index) {
                var previousIndex = root.selectedIndex;
                root.selectedIndex = index;
                Array.from(slider.children).forEach(function(button, buttonIndex) {
                    button.className = 'emby-tab-button main-tab-button' + (buttonIndex === index ? ' emby-tab-button-active' : '');
                    if (buttonIndex === index) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
                });
                root.dispatchEvent(new CustomEvent('tabchange', {detail: {selectedTabIndex: index, previousIndex: previousIndex}}));
            }
            root.selectedIndex = selectedIndex;
            tabs.forEach(function(tab, index) {
                var button = document.createElement('button');
                button.className = 'emby-tab-button main-tab-button' + (index === selectedIndex ? ' emby-tab-button-active' : '');
                button.textContent = tab.name; button.setAttribute('data-index', index);
                if (index === selectedIndex) button.setAttribute('aria-current', 'page');
                slider.appendChild(button);
                button.addEventListener('click', function() { current = root; select(index); });
            });
            current = root;
            host.replaceChildren(root); window.__pluginHeaderTabs = root;
            return {tabsContainer: host, replaced: true};
        },
        getTabsElement: function() { return current; },
        selectedTabIndex: function(index) {
            if (!current || index == null) return;
            var root = current, slider = root.querySelector('.emby-tabs-slider'), previousIndex = root.selectedIndex;
            root.selectedIndex = index;
            Array.from(slider.children).forEach(function(button, buttonIndex) {
                button.className = 'emby-tab-button main-tab-button' + (buttonIndex === index ? ' emby-tab-button-active' : '');
                if (buttonIndex === index) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
            });
            root.dispatchEvent(new CustomEvent('tabchange', {detail: {selectedTabIndex: index, previousIndex: previousIndex}}));
        },
        owner: function() { return owner; }
    };
});
define('modules/appheader/appheader.js', ['exports'], function(exports) {
    exports.default = {
        setDefaultTitle: function() { document.title = 'Emby'; },
        setTitle: function(title) { document.title = title == null ? 'Emby' : String(title); }
    };
});
define('modules/common/usersettings/usersettings.js', ['exports'], function(exports) {
    exports.default = {language: function() { return 'en-us'; }, dateTimeLocale: function() { return 'en-us'; }};
});
define('modules/common/servicelocator.js', ['exports'], function(exports) {
    exports.appHost = {supports: function() { return false; }};
    exports.iapManager = {isUnlockedByDefault: function() { return Promise.reject({}); }};
});
define('modules/registrationservices/registrationservices.js', ['exports'], function(exports) {
    exports.default = {validateFeature: function() { return Promise.resolve(); }};
});
define('modules/common/appsettings.js', ['exports'], function(exports) { exports.default = {}; });
define('modules/alert.js', [], function() { return Promise.resolve(); });
define('alert', [], function() { return function() { window.__p2Alerts = (window.__p2Alerts || 0) + 1; return Promise.resolve(); }; });
define('modules/toast.js', [], function() { return function() {}; });
['listViewStyle', 'formDialogStyle', 'flexStyles', 'material-icons'].forEach(function(id) { define(id, [], function() { return {}; }); });
