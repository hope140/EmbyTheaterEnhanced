define(['exports', 'modules/viewmanager/baseview.js', 'modules/emby-apiclient/connectionmanager.js',
    'modules/emby-apiclient/events.js', 'modules/common/input/api.js', 'modules/common/globalize.js',
    'modules/genericedit/genericedit.js', './schema.js', './responsehelper.js',
    'modules/emby-elements/emby-scroller/emby-scroller.js', 'modules/emby-elements/emby-button/emby-button.js',
    'modules/dialoghelper/dialoghelper.js', 'modules/maintabsmanager.js', 'modules/appheader/appheader.js', 'modules/approuter.js',
    './display.js', 'css!./plugin-ui.css'],
function(exports, baseView, connection, events, notifications, globalize, genericEdit, schema, responseHelper, scroller, button, dialogHelper, mainTabs, appHeader, appRouter, display) {
    'use strict';
    // Canonical IDs reuse the initialized application singletons in Alameda.
    // This one standard Babel helper is referenced by the frozen field editor
    // but absent from its helper bundle. Never replace a supplied helper.
    if (typeof babelHelpers !== 'undefined' && !babelHelpers.toConsumableArray) {
        babelHelpers.toConsumableArray = function(value) { return Array.from(value); };
    }
    var eventName = 'UIPageInfoChanged';
    function View(view, params) {
        baseView.default.apply(this, arguments);
        this.pageId = params && params.PageId;
        this.generation = 0;
        this.active = false;
        this.tabs = [];
        this.tabRequest = 0;
        this.boundTabChange = this.onTabChange.bind(this);
        this.boundUpdate = this.onUpdate.bind(this);
        this.boundClick = this.onClick.bind(this);
        this.boundSubmit = this.onSubmit.bind(this);
        this.boundCommand = this.onInputCommand.bind(this);
        view.addEventListener('click', this.boundClick);
        view.addEventListener('command', this.boundCommand);
        view.querySelector('form').addEventListener('submit', this.boundSubmit);
    }
    Object.assign(View.prototype, baseView.default.prototype);
    View.prototype.current = function(generation) { return !!this.view && this.active && generation === this.generation; };
    View.prototype.root = function() { return this.dialog || this.view; };
    View.prototype.showError = function(kind) {
        if (!this.view) return;
        var element = this.root().querySelector('.pluginError');
        element.textContent = kind === 'command' ? (/^zh/i.test(globalize.default.getCurrentLocale()) ? '操作未能完成，请重试。' : 'Plugin action could not be completed. Please try again.') : 'Plugin page could not be loaded. Please try again.';
        element.hidden = false;
    };
    View.prototype.onResume = function() {
        baseView.default.prototype.onResume.apply(this, arguments);
        if (this.active) return;
        this.active = true;
        this.apiClient = connection.default.currentApiClient();
        appHeader.default.setDefaultTitle();
        if (this.pageData) {
            this.renderTabs(this.pageData);
            this.setHeaderTitle(this.pageData.Caption, this.generation);
        }
        events.default.on(notifications.default, eventName, this.boundUpdate);
        this.load();
    };
    View.prototype.onPause = function() {
        var headerTabs = mainTabs.default.getTabsElement();
        if (this.active && (!headerTabs || headerTabs === this.headerTabsElement)) appHeader.default.setDefaultTitle();
        this.active = false;
        this.generation++;
        this.tabRequest++;
        this.clearHeaderTabs();
        this.commandPending = false;
        events.default.off(notifications.default, eventName, this.boundUpdate);
        this.closeDialog();
        this.data = this.pageData || null;
        if (this.pageData) this.pageId = this.pageData.PageId;
        baseView.default.prototype.onPause.apply(this, arguments);
    };
    View.prototype.destroy = function() {
        this.onPause();
        if (this.view) {
            this.view.removeEventListener('click', this.boundClick);
            this.view.removeEventListener('command', this.boundCommand);
            this.view.querySelector('form').removeEventListener('submit', this.boundSubmit);
        }
        this.data = null;
        baseView.default.prototype.destroy.apply(this, arguments);
    };
    View.prototype.load = function() {
        var self = this, generation = ++this.generation, client = this.apiClient;
        if (!client || typeof this.pageId !== 'string' || !this.pageId || this.pageId.length > 512) { this.showError(); return Promise.resolve(); }
        return client.getJSON(client.getUrl('UI/View', {PageId: this.pageId, ClientLocale: globalize.default.getCurrentLocale()})).then(function(data) {
            if (self.current(generation)) return self.render(data, generation);
        }).catch(function() { if (self.current(generation)) self.showError(); });
    };
    View.prototype.render = function(input, generation) {
        var self = this;
        if (!this.current(generation)) return Promise.resolve();
        var data = schema.default.prepare(input), detached = document.createElement('div');
        var editorContainer = schema.default.displayContainer(data.EditObjectContainer);
        // The inherited postback listener captures Object. Keep that binding
        // canonical; only its markup-consuming value pass uses an escaped copy.
        editorContainer.Object = data.EditObjectContainer.Object;
        editorContainer.DefaultObject = data.EditObjectContainer.DefaultObject;
        var root = editorContainer.EditorRoot;
        if (root.DisplayName === schema.default.escape(data.Caption)) root.DisplayName = '';
        if (root.Description === schema.default.escape(data.SubCaption)) root.Description = '';
        detached.className = 'mainContent';
        // Keep the inherited editor and its local field/condition listeners on
        // a fresh node. A stale asynchronous render never touches the live page.
        return Promise.resolve(genericEdit.default.renderForm(editorContainer, detached)).then(function() {
            if (!self.current(generation)) return;
            display.default.prepare(detached, data.EditObjectContainer);
            Array.from(detached.querySelectorAll('select[multiple]')).forEach(function(select) {
                // Frozen emby-select expects an option provider even for the
                // static multiple selects emitted by the inherited editor.
                select.getItems = function(query) {
                    query = query || {};
                    var ids = query.Ids == null ? null : Array.isArray(query.Ids) ? query.Ids : String(query.Ids).split(',');
                    var items = Array.from(select.options).map(function(option) {
                        return {Id: option.value, Name: schema.default.escape(option.textContent), Selected: option.selected, searchText: option.textContent.toLowerCase()};
                    });
                    if (ids) items = items.filter(function(item) { return ids.indexOf(item.Id) >= 0; });
                    if (query.SearchTerm) items = items.filter(function(item) { return item.searchText.indexOf(String(query.SearchTerm).toLowerCase()) >= 0; });
                    var count = items.length;
                    var start = Math.max(0, Number(query.StartIndex) || 0);
                    items = items.slice(start, query.Limit == null ? undefined : start + Math.max(0, Number(query.Limit) || 0));
                    items.forEach(function(item) { delete item.searchText; });
                    return Promise.resolve({Items: items, TotalRecordCount: count});
                };
            });
            genericEdit.default.setFormValues(schema.default.displayContainer(data.EditObjectContainer), detached);
            function attachAction(element, value) {
                if (!element || !value) return;
                element.etePluginAction = value;
                element.disabled = !value.IsEnabled;
                if (typeof value.ConfirmationPrompt === 'string') element.setAttribute('data-prompt', value.ConfirmationPrompt);
            }
            function listActions(list, prefix) {
                if (!Array.isArray(list)) return;
                list.forEach(function(item, index) {
                    var id = prefix + '.listitem' + index;
                    ['Button1', 'Button2'].forEach(function(key) {
                        attachAction(detached.querySelector('#' + (id + '.' + key.toLowerCase()).replace(/\./g, '\\.')), item[key]);
                    });
                    listActions(item.SubItems, id);
                });
            }
            function buttonState(item) {
                if ((item.EditorType === 'ButtonItem' || item.EditorType === 'ItemList') && item.Id) {
                    var value = item.Id.split('.').reduce(function(owner, key) {
                        return owner && Object.prototype.hasOwnProperty.call(owner, key) ? owner[key] : null;
                    }, data.EditObjectContainer.Object);
                    if (item.EditorType === 'ItemList') listActions(value, item.Id);
                    else attachAction(detached.querySelector('#' + item.Id.replace(/\./g, '\\.')), value);
                }
                (item.EditorItems || []).forEach(buttonState);
                if (item.TitleButton) buttonState(item.TitleButton);
            }
            buttonState(data.EditObjectContainer.EditorRoot);
            display.default.apply(detached, data.EditObjectContainer);
            var isDialog = data.ViewType === 'Dialog' || data.ViewType === 'Wizard';
            self.closeDialog();
            var view = isDialog ? self.createDialog(data) : self.view, old = view.querySelector('.mainContent');
            old.parentNode.replaceChild(detached, old);
            view.querySelector('.mainTitle').textContent = data.Caption || '';
            view.querySelector('.mainTitle').hidden = !isDialog;
            view.querySelector('.mainSubTitle').textContent = data.SubCaption || '';
            view.querySelector('.pluginError').hidden = true;
            self.data = data;
            self.pageId = data.PageId;
            if (isDialog) self.dialog = view;
            if (!isDialog) {
                self.pageData = data;
                self.renderTabs(data);
                self.setHeaderTitle(data.Caption, generation);
            }
            self.renderCommands(data);
            if (isDialog) dialogHelper.default.open(view);
        });
    };
    View.prototype.createDialog = function(data) {
        var self = this, dialog = dialogHelper.default.createDialog({removeOnClose: true, enableHistory: false, size: data.ShowDialogFullScreen ? 'fullscreen' : 'small', autoFocus: true});
        dialog.classList.add('formDialog');
        dialog.classList.add('ete-plugin-view');
        dialog.innerHTML = '<form class="dialogForm"><div class="dialogContentInner ete-plugin-dialog-scroll"><h2 class="mainTitle"></h2><div class="mainSubTitle"></div><p class="pluginError" role="status" hidden></p><div class="mainContent"></div></div><div class="pluginCommands"></div></form>';
        dialog.addEventListener('click', this.boundClick);
        dialog.addEventListener('command', this.boundCommand);
        dialog.querySelector('form').addEventListener('submit', this.boundSubmit);
        dialog.addEventListener('close', function() {
            dialog.removeEventListener('click', self.boundClick);
            dialog.removeEventListener('command', self.boundCommand);
            dialog.querySelector('form').removeEventListener('submit', self.boundSubmit);
            if (self.dialog === dialog) { self.dialog = null; self.generation++; self.data = self.pageData || null; }
        }, {once: true});
        return dialog;
    };
    View.prototype.closeDialog = function() {
        if (!this.dialog) return;
        var dialog = this.dialog;
        this.dialog = null;
        dialogHelper.default.close(dialog);
    };
    View.prototype.renderTabs = function(data) {
        var self = this;
        this.tabs = data.TabPageInfos.map(function(tab) {
            return {PageId: tab.PageId, name: schema.default.escape(tab.DisplayName || ''), href: schema.default.tabHref(tab.Href)};
        }).filter(function(tab) { return !!tab.href; });
        if (!this.tabs.length) { this.clearHeaderTabs(); return; }
        // Native responsive header tabs require the matching content offset.
        this.view.classList.add('withTabs');
        var index = this.tabIndex();
        // Rebuild owned metadata on notifications; setTabs otherwise only
        // changes selection when the owner view is unchanged.
        if (this.headerTabsElement && mainTabs.default.getTabsElement() === this.headerTabsElement) mainTabs.default.setTabs(null);
        // Native header tabs own selection, focus and the existing pill styles.
        // Buttons use the native tabchange event instead of file:// anchors.
        mainTabs.default.setTabs(this.view, index, function() {
            return self.tabs.map(function(tab) { return {name: tab.name}; });
        }, null, this.boundTabChange);
        this.headerTabsElement = mainTabs.default.getTabsElement();
        this.syncTabSelection(index);
    };
    View.prototype.tabIndex = function() {
        var pageId = this.pageData && this.pageData.PageId;
        var index = this.tabs.findIndex(function(tab) { return tab.PageId === pageId; });
        return index < 0 ? 0 : index;
    };
    View.prototype.syncTabSelection = function(index) {
        if (!this.headerTabsElement) return;
        this.headerTabsElement.setAttribute('role', 'tablist');
        this.headerTabsElement.querySelectorAll('.emby-tab-button').forEach(function(element, buttonIndex) {
            element.setAttribute('role', 'tab');
            element.setAttribute('aria-selected', buttonIndex === index ? 'true' : 'false');
            if (buttonIndex === index) element.setAttribute('aria-current', 'page');
            else element.removeAttribute('aria-current');
        });
    };
    View.prototype.onTabChange = function(event) {
        if (this.restoringTabSelection || !this.active || !this.view || event.currentTarget !== this.headerTabsElement || mainTabs.default.getTabsElement() !== this.headerTabsElement) return;
        var index = event.detail && event.detail.selectedTabIndex;
        if (!Number.isInteger(index) || index < 0 || index >= this.tabs.length) return;
        var tab = this.tabs[index];
        var self = this, request = ++this.tabRequest;
        this.syncTabSelection(index);
        function restoreSelection() {
            if (!self.active || request !== self.tabRequest || mainTabs.default.getTabsElement() !== self.headerTabsElement) return;
            // Native selectedTabIndex synchronously emits tabchange too.
            // Restoring a failed intent must not create another navigation.
            self.restoringTabSelection = true;
            try { mainTabs.default.selectedTabIndex(self.tabIndex()); }
            finally { self.restoringTabSelection = false; }
            self.syncTabSelection(self.tabIndex());
        }
        try { Promise.resolve(appRouter.default.show(tab.href)).catch(restoreSelection); }
        catch (_) { restoreSelection(); }
    };
    View.prototype.clearHeaderTabs = function() {
        if (this.headerTabsElement && mainTabs.default.getTabsElement() === this.headerTabsElement) mainTabs.default.setTabs(null);
        this.headerTabsElement = null;
        this.tabs = [];
        if (this.view) this.view.classList.remove('withTabs');
    };
    View.prototype.setHeaderTitle = function(caption, generation) {
        if (!this.current(generation)) return;
        caption = typeof caption === 'string' ? caption : '';
        var escaped = schema.default.escape(caption);
        this.view.setAttribute('data-title', escaped);
        // The inherited header writes HTML; browser title remains plain text.
        appHeader.default.setTitle(escaped);
        document.title = caption || 'Emby';
    };
    View.prototype.renderCommands = function(data) {
        var container = this.root().querySelector('.pluginCommands');
        container.replaceChildren();
        data.Commands.forEach(function(command) {
            if (!command.IsVisible || typeof command.CommandType !== 'string') return;
            // Regular web pages use header/input navigation, not a PageBack footer.
            if (command.CommandType === 'PageBack' && data.ViewType !== 'Dialog' && data.ViewType !== 'Wizard') return;
            var button = document.createElement('button', {is: 'emby-button'});
            button.type = command.CommandType === 'PageSave' ? 'submit' : 'button';
            button.setAttribute('is', 'emby-button');
            button.setAttribute('data-data1', command.CommandType);
            if (data.PluginId) button.setAttribute('data-data2', data.PluginId);
            button.textContent = command.Caption || (command.CommandType === 'PageBack' ? globalize.default.translate('Back') : command.CommandType);
            button.disabled = !command.IsEnabled;
            button.className = 'raised emby-button';
            container.appendChild(button);
        });
    };
    View.prototype.onUpdate = function(e, client, data) {
        if (!this.active || client !== this.apiClient || !this.data || !data || data.PageId !== this.data.PageId) return;
        if (data.ViewId !== this.data.ViewId && !data.IsPageChangeInfo) return;
        // Same-view refreshes can omit navigation, as the dashboard does.
        // Only a page transition may deliberately replace it with no tabs.
        if (!data.IsPageChangeInfo && !this.dialog && this.pageData && (!data.TabPageInfos || !data.TabPageInfos.length)) {
            data = Object.assign({}, data, {TabPageInfos: this.pageData.TabPageInfos});
        }
        var self = this, generation = ++this.generation;
        Promise.resolve().then(function() { return self.render(data, generation); }).catch(function() { if (self.current(generation)) self.showError(); });
    };
    View.prototype.onClick = function(e) {
        if (!this.active || !this.data) return;
        var button = e.target.closest && e.target.closest('[data-data1]');
        if (button && !this.root().contains(button)) return;
        var command = e.Data1 || button && button.getAttribute('data-data1');
        if (!command || button && button.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        var itemId = e.Data2 || button && button.getAttribute('data-data2');
        var prompt = e.ConfirmationPrompt || button && button.getAttribute('data-prompt');
        var action = button && button.etePluginAction;
        if (e.Data1 && action && Array.isArray(action.SubMenuButtons)) {
            function same(value, actual) { return value == null ? actual == null || actual === '' : String(value) === String(actual) || schema.default.escape(value) === String(actual); }
            var selected = action.SubMenuButtons.find(function(menu) { return same(menu.Data1, e.Data1) && same(menu.Data2, e.Data2); });
            if (selected) {
                if (selected.IsEnabled === false || selected.IsVisible === false) return;
                command = selected.Data1;
                itemId = selected.Data2;
                prompt = selected.ConfirmationPrompt || prompt;
            }
        }
        this.runCommand(command, itemId, prompt);
    };
    View.prototype.onSubmit = function(e) { e.preventDefault(); this.runCommand('PageSave', this.data && this.data.PluginId, null); };
    View.prototype.onInputCommand = function(e) {
        if (e.detail.command !== 'back' || !this.active || !this.data) return;
        var command = this.data.Commands.find(function(c) { return c.CommandType === 'PageBack' && c.IsVisible && c.IsEnabled; });
        if (command) { e.preventDefault(); e.stopPropagation(); this.runCommand('PageBack', null, null); }
    };
    View.prototype.runCommand = function(command, itemId, prompt) {
        var self = this, data = this.data, client = this.apiClient;
        if (!this.active || !data || this.commandPending || typeof command !== 'string' || command.length > 128) return Promise.resolve();
        var declared = data.Commands.find(function(c) { return c.CommandType === command; });
        if (declared && (!declared.IsVisible || !declared.IsEnabled)) return Promise.resolve();
        if (['PageSave', 'WizardNext', 'WizardFinish', 'DialogOk'].indexOf(command) >= 0) {
            var save = data.Commands.find(function(c) { return c.CommandType === command && c.IsEnabled && c.IsVisible; });
            if (!save || !this.root().querySelector('form').reportValidity()) return Promise.resolve();
        }
        if (command !== 'PageBack') {
            genericEdit.default.getItemValues(data.EditObjectContainer, this.root().querySelector('.mainContent'));
            if (data.EditObjectContainer.isDataValid === false) return Promise.resolve();
        }
        var generation = ++this.generation, payload = command === 'PageBack' ? null : JSON.stringify(data.EditObjectContainer.Object);
        this.commandPending = generation;
        var confirmation = prompt ? require(['confirm']).then(function(deps) {
            return deps[0]({text: prompt}).then(function() { return true; }, function() { return false; });
        }) : Promise.resolve(true);
        return confirmation.then(function(confirmed) {
            if (!confirmed || !self.current(generation)) return;
            return client.ajax({type: 'POST', url: client.getUrl('UI/Command'), contentType: 'application/json', dataType: 'json',
                data: JSON.stringify({PageId: data.PageId, CommandId: command, Data: payload, ItemId: command === 'PageBack' ? null : itemId || null, ClientLocale: globalize.default.getCurrentLocale()})
            }).then(function(result) {
                if (!self.current(generation)) return;
                if (result.RedirectViewUrl) {
                    var href = schema.default.tabHref(result.RedirectViewUrl);
                    if (!href) throw new Error('Unsupported plugin redirect');
                    return require(['appRouter']).then(function(deps) { if (self.current(generation)) deps[0].show(href); });
                }
                return self.render(result, generation);
            });
        }).catch(function() { if (self.current(generation)) self.showError('command'); })
            .finally(function() { if (self.commandPending === generation) self.commandPending = false; });
    };
    exports.default = View;
});
