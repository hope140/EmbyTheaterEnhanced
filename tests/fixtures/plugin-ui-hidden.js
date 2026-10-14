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
    window.__fixtureObservations = {};
    var stylesLoaded = false, scopedStyle = document.createElement('link');
    scopedStyle.rel = 'stylesheet';
    scopedStyle.href = '/fixtures/enhanced/plugin-ui/plugin-ui.css';
    var scopedStyleReady = new Promise(function(resolve) {
        scopedStyle.onload = function() { stylesLoaded = true; resolve(true); };
        scopedStyle.onerror = function() { resolve(false); };
        document.head.appendChild(scopedStyle);
    });
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
            ['text', 'numeric', 'enabled', 'single', 'multiple', 'date', 'status', 'action', 'readonly', 'radioChoice', 'progressZero', 'progressClamp', 'groupActionOne', 'descriptionChild', 'nestedInput', 'showFlag', 'hiddenField', 'safeLabel'].forEach(function(id) {
                check(!!byId(id), 'field_' + id + '_rendered');
            });
            check(byId('enabled').getAttribute('is') === 'emby-toggle', 'boolean_uses_emby_toggle');
            check(byId('readonly').getAttribute('is') === 'emby-toggle' && byId('readonly').disabled, 'readonly_boolean_toggle_disabled');
            check(byId('readonlyGroupedToggle').disabled, 'readonly_grouped_toggle_disabled');
            check(byId('disabledToggle').disabled, 'schema_disabled_toggle_disabled');
            check(byId('hiddenToggle').closest('.toggleContainer').classList.contains('hide'), 'schema_hidden_toggle_hidden');
            check(byId('conditionalToggle').disabled, 'conditional_toggle_initially_disabled');
            check(byId('status').querySelector('.primaryText').textContent === 'Ready & <safe>' && byId('status').querySelector('.secondaryText').textContent === 'Status & <safe>', 'status_preserves_plain_text_once');
            check(byId('action').querySelector('.buttonText').textContent === 'Run & <command>', 'button_preserves_plain_text_once');
            check(byId('caption').querySelector('.captionText').textContent === 'Caption & <safe>', 'caption_preserves_plain_text_once');
            check(byId('label').querySelector('.labelText').textContent === window.__fixturePage.EditObjectContainer.Object.label.Text && !byId('label').querySelector('img'), 'label_preserves_plain_text_without_html');
            check(byId('status').querySelector('.statusIcon').textContent === 'check_circle_outline', 'succeeded_status_icon_is_plain_mapped_text');
            check(byId('action').querySelector('.buttonIcon').textContent === 'delete', 'standard_icon_maps_button_glyph');
            var selectBox=byId('multiple').getBoundingClientRect();
            var selectName=byId('multiple').parentNode.querySelector('.emby-select-selectedName').getBoundingClientRect();
            var selectArrow=byId('multiple').parentNode.querySelector('.selectArrow').getBoundingClientRect();
            window.__fixtureObservations.selectStructure={children:Array.from(byId('multiple').parentNode.children).map(function(e){return {tag:e.tagName,classes:e.className,labelEmpty:e.tagName==='LABEL'?e.textContent.trim()==='':null};}),selectBox:{top:selectBox.top,bottom:selectBox.bottom},name:{top:selectName.top,bottom:selectName.bottom}};
            check(selectName.top>=selectBox.top-1 && selectName.bottom<=selectBox.bottom+1, 'multiple_selected_name_stays_inside_control');
            check(selectArrow.top>=selectBox.top-1 && selectArrow.bottom<=selectBox.bottom+1, 'multiple_arrow_stays_inside_control');
            var selectParent=byId('multiple').parentNode,selectLabel=selectParent.querySelector('label');
            var originalLabel=selectLabel.textContent,originalWidth=selectParent.style.width;
            selectParent.style.width='180px';
            selectLabel.textContent='A long selection label that must wrap across multiple lines';
            selectBox=byId('multiple').getBoundingClientRect();
            selectName=selectParent.querySelector('.emby-select-selectedName').getBoundingClientRect();
            check(selectLabel.getBoundingClientRect().height>25 && selectName.top>=selectBox.top-1 && selectName.bottom<=selectBox.bottom+1, 'wrapped_label_keeps_selected_name_in_control_row');
            selectLabel.textContent='';
            selectBox=byId('multiple').getBoundingClientRect();
            selectName=selectParent.querySelector('.emby-select-selectedName').getBoundingClientRect();
            check(selectName.top>=selectBox.top-1 && selectName.bottom<=selectBox.bottom+1, 'empty_label_keeps_selected_name_in_control_row');
            selectLabel.textContent=originalLabel;selectParent.style.width=originalWidth;
            check(byId('progressZero').max === 100 && byId('progressZero').value === 0, 'zero_progress_uses_safe_default_maximum');
            check(byId('progressClamp').max === 10 && byId('progressClamp').value === 10, 'progress_value_clamps_to_maximum');
            check(Array.from(byId('radioChoice').querySelectorAll('input')).length === 2 && Array.from(byId('radioChoice').querySelectorAll('input')).every(function(input) { return input.disabled; }), 'readonly_radio_choices_disabled');
            check(byId('nestedInput').disabled, 'nested_group_conditions_disable_control');
            check(byId('hiddenField').closest('.inputContainer').classList.contains('hide'), 'visible_condition_cannot_override_explicit_false');
            check(byId('text').value.indexOf('<img') === 0 && viewNode.querySelectorAll('.inputContainer img').length === 0, 'unsafe_text_value_remains_input_text');
            check(viewNode.querySelector('.mainTitle').textContent === 'Synthetic settings' && !Array.from(viewNode.querySelectorAll('.mainContent .sectionTitle')).some(function(node) { return node.textContent === 'Synthetic settings'; }), 'ordinary_page_title_owns_duplicate_root_heading');
            check(viewNode.querySelectorAll('script').length === 0, 'unsafe_values_no_script_nodes');
            check(viewNode.querySelectorAll('[onerror],[onclick]').length === 0, 'unsafe_values_no_event_attributes');
            check(!window.__fixture.injected, 'unsafe_values_not_executed');
            var headerTabs = window.__pluginHeaderTabs && window.__pluginHeaderTabs.querySelector('.emby-tabs-slider');
            check(!!headerTabs && headerTabs.children.length === 1, 'only_safe_header_tab_rendered');
            check(viewNode.querySelector('.labelText').textContent.indexOf('<img') === 0, 'label_text_rendered_as_text');
            check(!viewNode.querySelector('.labelText').getAttribute('href'), 'unsafe_label_link_removed');
            var safeLabel = byId('safeLabel').querySelector('.labelText');
            check(safeLabel.href === 'https://docs.example/path?view=fixture' && safeLabel.rel === 'noopener noreferrer', 'safe_http_link_bound_without_raw_href_fallback');
            var safeClick = new MouseEvent('click', {bubbles: true, cancelable: true});
            safeLabel.dispatchEvent(safeClick);
            check(safeClick.defaultPrevented, 'safe_link_click_prevents_browser_navigation');
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
                check(window.__safeOpenUrlCount === 1, 'safe_link_click_uses_stubbed_shell_only');
                check(byId('text').value === 'notification value', 'notification_values_rendered');
                check(!!byId('numeric') && !!byId('single') && !!byId('multiple'), 'notification_preserved_editor_schema');

            byId('text').value = 'edited text';
            byId('numeric').value = '17';
                byId('nestedEnabled').checked = true;
                byId('nestedEnabled').dispatchEvent(new Event('change', {bubbles: true}));
                check(byId('nestedInput').disabled, 'disabled_parent_group_blocks_nested_enabled_control');
                byId('enabled').checked = true;
                byId('enabled').dispatchEvent(new Event('change', {bubbles: true}));
                check(!byId('nestedInput').disabled, 'group_and_nested_conditions_restore_control');
                check(byId('readonly').disabled, 'readonly_boolean_stays_disabled_after_condition_change');
                check(byId('readonlyGroupedToggle').disabled && byId('disabledToggle').disabled, 'grouped_boolean_baselines_survive_condition_change');
                check(!byId('conditionalToggle').disabled, 'conditional_boolean_reenables_live_toggle');
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

                view.pageId = 'dialog';
                return view.load().then(function() { return wait(60); }).then(function() {
                    check(view.dialog && view.dialog.querySelector('.mainTitle').textContent === 'Synthetic settings', 'dialog_keeps_its_caption_title');
                    check(!!view.dialog.querySelector('.ete-plugin-dialog-scroll') && !view.dialog.querySelector('.ete-plugin-dialog-scroll').contains(view.dialog.querySelector('.pluginCommands')), 'dialog_commands_stay_outside_content_scroll');
                    check(view.dialog.querySelector('.mainSubTitle').textContent === 'Loopback fixture', 'dialog_keeps_its_subtitle');
                    check(!Array.from(view.dialog.querySelectorAll('.mainContent .sectionTitle')).some(function(node) { return node.textContent === 'Synthetic settings'; }), 'dialog_suppresses_duplicate_editor_root_heading');
                    view.closeDialog();

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
        var textDescription = byId('text').parentElement.querySelector('.fieldDescription');
        window.__fixtureObservations.descriptionNodePresent = !!textDescription;
        window.__fixtureObservations.descriptionBreaks = textDescription ? textDescription.querySelectorAll('br').length : 0;
        window.__fixtureObservations.descriptionHasLiteralUnsafeMarkup = !!textDescription && textDescription.textContent.indexOf('<img') >= 0;
        check(!!textDescription, 'description_node_present');
        check(textDescription.textContent.indexOf('First line\nSecond') >= 0, 'description_newline_preserved_as_text');
        check(textDescription.textContent.indexOf('<img') >= 0, 'description_markup_rendered_as_text');
        var descriptionParent = byId('descriptionParent'), descriptionChild = byId('descriptionChild');
        var childDescription = descriptionChild && Array.from(descriptionChild.children).find(function(node) { return node.classList.contains('ete-plugin-section-description'); });
        check(descriptionParent && descriptionChild && !Array.from(descriptionParent.children).some(function(node) { return node.classList.contains('ete-plugin-section-description'); }) && childDescription && childDescription.textContent.indexOf('Nested description only') >= 0, 'unheaded_group_keeps_descendant_description_in_child');
        var parentListItem = byId('items.listitem1'), parentListIcon = parentListItem.querySelector('.ete-plugin-listicon .md-icon'), childListIcon = byId('items.listitem1.button1').querySelector('.md-icon');
        check(parentListIcon && parentListIcon.textContent === 'delete' && childListIcon && childListIcon.textContent === 'play_arrow', 'itemlist_parent_standard_icon_does_not_replace_child_icon');
        check(byId('groupActionOne').disabled && byId('groupActionTwo').disabled, 'unidentified_button_group_disables_its_children');
        return scopedStyleReady.then(function(loaded) {
            check(loaded, 'scoped_stylesheet_loaded');
            var popup = document.createElement('div');
            popup.className = 'actionSheet'; popup.style.height = '1500px';
            popup.innerHTML = '<div class="actionSheetScroller"><div class="itemsContainer" data-virtualscrolllayout="vertical-grid"></div></div>';
            document.body.appendChild(popup);
            var ceiling = Math.min(parseFloat(getComputedStyle(popup).fontSize) * 30, innerHeight * .7);
            check(popup.getBoundingClientRect().height <= ceiling + 1, 'plugin_virtual_popup_obeys_web_height_ceiling');
            byId('view').classList.add('hide');
            check(popup.getBoundingClientRect().height > ceiling + 1, 'inactive_plugin_does_not_resize_shared_popup');
            byId('view').classList.remove('hide');
            popup.classList.add('dialog-fullscreen');
            check(popup.getBoundingClientRect().height > ceiling + 1, 'fullscreen_action_sheet_keeps_existing_height');
            popup.classList.remove('dialog-fullscreen');
            popup.querySelector('.itemsContainer').removeAttribute('data-virtualscrolllayout');
            check(popup.getBoundingClientRect().height > ceiling + 1, 'ordinary_action_sheet_keeps_existing_height');
            popup.remove();
            window.__fixtureResult = {ok: true, assertions: assertions, observations: Object.assign({missing_dependency_rejected: window.__missingRejected === true, stylesLoaded: stylesLoaded}, window.__fixtureObservations)};
        });
    }).catch(function(error) {
        window.__fixtureResult = {ok: false, assertions: assertions, failureClass: error && error.fixtureClass || 'runtime_exception', observations: Object.assign({missing_dependency_rejected: window.__missingRejected === true, stylesLoaded: stylesLoaded}, window.__fixtureObservations)};
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

define('shell', [], function() {
    return {openUrl: function(value, target) {
        if (/^https?:\/\//i.test(value) && target === '_blank') window.__safeOpenUrlCount = (window.__safeOpenUrlCount || 0) + 1;
    }};
});
define('modules/common/input/api.js', ['exports'], function(exports) { exports.default = window.__notifications = {}; });
define('modules/layoutmanager.js', ['exports'], function(exports) { exports.default = {tv: false}; });
define('modules/browser.js', ['exports'], function(exports) { exports.default = {android: false}; });
define('modules/actionsheet/actionsheet.js', ['exports'], function(exports) { exports.default = {}; });
define('modules/dialoghelper/dialoghelper.js', ['exports'], function(exports) {
    exports.default = {createDialog: function() { return document.createElement('div'); }, open: function() {}, close: function(dialog) { dialog.dispatchEvent(new Event('close')); }};
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
