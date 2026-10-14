define(['exports'], function(exports) {
    'use strict';
    var standardIcons = {Loading: 'Loading', Add: 'add', Edit: 'edit', Refresh: 'refresh', Remove: 'remove_circle_outline', Delete: 'delete', ContextMenu: 'more_horiz', Download: 'download', AddToList: 'playlist_add'};
    var statusIcons = {None: '', Succeeded: 'check_circle_outline', Failed: 'error_outline', Warning: 'help_outline', Unavailable: 'remove_circle_outline', InProgress: ''};
    function icon(value) {
        if (typeof value !== 'string') return '';
        if (/^[a-z][a-z0-9_]{0,63}$/.test(value) || /^[\ue000-\uf8ff]$/.test(value)) return value;
        // Decode only a single Material Icons private-use code point. Text and
        // arbitrary HTML/entities never pass through an HTML decoder.
        var match = /^&(?:amp;)?#(x[0-9a-f]{1,6}|[0-9]{1,7});$/i.exec(value);
        if (!match) return '';
        var code = match[1][0].toLowerCase() === 'x' ? parseInt(match[1].slice(1), 16) : Number(match[1]);
        return code >= 0xe000 && code <= 0xf8ff ? String.fromCharCode(code) : '';
    }
    function itemIcon(value) { return value && (standardIcons[value.StandardIcon] || icon(value.Icon)) || ''; }
    function safeHyperLink(value) {
        if (typeof value !== 'string' || value.length > 4096 || !/^https?:\/\//i.test(value) || /[\u0000-\u0020]/.test(value)) return null;
        try {
            var url = new URL(value);
            if (url.username || url.password) return null;
            var forbidden = /^(?:api_key|access_token|token|password|authorization|cookie|x-emby-token)$/i;
            if (Array.from(url.searchParams.keys()).some(function(key) { return forbidden.test(key); })) return null;
            if (/(?:^|[?&#])(?:api_key|access_token|token|password|authorization|cookie|x-emby-token)=/i.test(decodeURIComponent(url.hash))) return null;
            return url.href;
        } catch (_) { return null; }
    }
    function bindLink(element, value) {
        var href = safeHyperLink(value);
        if (!element || !href) return;
        if (element.tagName === 'A') { element.href = href; element.rel = 'noopener noreferrer'; }
        else { element.setAttribute('role', 'link'); element.tabIndex = 0; element.classList.add('ete-plugin-link'); }
        function open(event) {
            if (event.target.closest('[data-data1]')) return;
            if (event.type === 'keydown' && event.key !== 'Enter') return;
            event.preventDefault(); event.stopPropagation();
            // Match the frozen emby-button external-link route. "shell" is
            // supplied by the current host; apphost has no openUrl API.
            require(['shell'], function(shell) { shell.openUrl(href, '_blank'); });
        }
        element.addEventListener('click', open);
        if (element.tagName !== 'A') element.addEventListener('keydown', open);
    }
    function get(object, id) {
        return id && id.split('.').reduce(function(owner, key) { return owner && Object.prototype.hasOwnProperty.call(owner, key) ? owner[key] : undefined; }, object);
    }
    function find(root, id) { return id ? root.querySelector('#' + id.replace(/\./g, '\\.')) : null; }
    function walk(item, callback) {
        callback(item);
        (item.EditorItems || []).forEach(function(child) { walk(child, callback); });
        if (item.TitleButton) walk(item.TitleButton, callback);
    }
    function setIcon(element, value) {
        if (!element) return;
        element.textContent = value === 'Loading' ? '' : value;
        element.classList.toggle('hide', !value || value === 'Loading');
    }
    function prepare(root, container) {
        root.classList.add('ete-plugin-content');
        root.etePluginEditorElements = new Map();
        walk(container.EditorRoot, function(item) {
            var element = find(root, item.Id);
            if (item.EditorType === 'ButtonGroup') {
                var first = item.EditorItems && item.EditorItems[0];
                var button = first && find(root, first.Id);
                var panel = button && button.closest('.verticalSection');
                if (panel) {
                    if (item.Id) panel.id = item.Id;
                    if (item.IsBottomPanel) panel.classList.add('ete-plugin-bottom-panel');
                    element = panel;
                }
            }
            if (!element) return;
            root.etePluginEditorElements.set(item, element);
            element.setAttribute('data-ete-editor', item.EditorType);
            if (element.tagName === 'SELECT') element.parentElement.classList.add('ete-plugin-select-field');
            if (item.EditorType === 'Group') {
                var title = Array.from(element.children).find(function(child) { return child.classList.contains('sectionTitleContainer'); });
                var section = Array.from(element.children).find(function(child) { return child.classList.contains('sectionContent'); });
                if (title && section) Array.from(title.children).filter(function(child) { return child.tagName === 'DIV'; }).forEach(function(description) {
                    description.classList.add('ete-plugin-section-description');
                    element.insertBefore(description, section);
                });
            }
            if (item.EditorType === 'Boolean') {
                var old = element.closest('.checkboxContainer');
                if (!old) return;
                var label = document.createElement('label'), toggle = document.createElement('input', {is: 'emby-toggle'});
                var text = document.createElement('span'), description = old.querySelector('.fieldDescription');
                text.textContent = old.querySelector('span').textContent;
                toggle.type = 'checkbox'; toggle.id = item.Id; toggle.setAttribute('is', 'emby-toggle');
                toggle.setAttribute('data-ete-editor', 'Boolean');
                toggle.disabled = !!item.IsReadOnly;
                label.appendChild(toggle); label.appendChild(text);
                old.replaceChildren(label);
                old.className = 'toggleContainer' + (item.IsAdvanced ? ' advanced' : '');
                if (description) { description.classList.remove('checkboxFieldDescription'); description.classList.add('toggleFieldDescription'); old.appendChild(description); }
                // State and condition reconciliation must own the live input,
                // not the legacy checkbox removed from this wrapper.
                root.etePluginEditorElements.set(item, toggle);
            }
        });
    }
    function conditionResult(condition, value) {
        var result = false;
        switch (condition.SimpleCondition) {
            case 'IsTrue': result = value === true; break;
            case 'IsFalse': result = value === false; break;
            case 'IsNull': result = value == null; break;
            case 'IsNotNullOrEmpty': result = value != null && value !== ''; break;
        }
        switch (condition.ValueCondition) {
            case 'IsEqual': result = value === condition.Value; break;
            case 'IsNotEqual': result = value !== condition.Value; break;
            case 'IsGreater': result = value > condition.Value; break;
            case 'IsGreaterOrEqual': result = value >= condition.Value; break;
            case 'IsLess': result = value < condition.Value; break;
            case 'IsLessOrEqual': result = value <= condition.Value; break;
        }
        return result;
    }
    function apply(root, container) {
        var conditions = [], controlStates = new Map(), visibilityStates = new Map();
        walk(container.EditorRoot, function(item) {
            var element = root.etePluginEditorElements && root.etePluginEditorElements.get(item) || find(root, item.Id), value = get(container.Object, item.Id);
            if (value === undefined) value = get(container.DefaultObject, item.Id);
            conditions = conditions.concat(item.PropertyConditions || []);
            if (!element) return;
            visibilityStates.set(element, item.IsVisible !== false && !(value && ['ButtonItem', 'CaptionItem', 'LabelItem'].indexOf(item.EditorType) >= 0 && value.IsVisible === false));
            if (item.EditorType === 'StatusItem' && value) {
                element.classList.add('infoBanner', 'ete-plugin-status');
                element.setAttribute('role', 'status');
                var glyph = element.querySelector('.statusIcon');
                setIcon(glyph, statusIcons[value.Status] || '');
                element.setAttribute('data-status', value.Status || 'None');
            }
            if (item.EditorType === 'ButtonItem') {
                setIcon(element.querySelector('.buttonIcon'), itemIcon(value));
                if (!element.classList.contains('sectionTitleButton')) element.classList.add('raised', 'raised-mini', 'emby-button');
                if (element.subMenuButtons) element.subMenuButtons.forEach(function(menu) { menu.Icon = itemIcon(menu); });
            }
            if (item.EditorType === 'ProgressItem' && value) {
                element.max = Number.isFinite(value.MaxValue) && value.MaxValue > 0 ? value.MaxValue : 100;
                element.value = Number.isFinite(value.CurrentValue) ? Math.max(0, Math.min(element.max, value.CurrentValue)) : 0;
            }
            if (item.EditorType === 'LabelItem' && value) bindLink(element.querySelector('.labelText'), value.HyperLink);
            if (item.EditorType === 'ItemList') decorateList(element, value, item.Id);
            if (item.EditorType === 'ButtonGroup' && item.IsBottomPanel) {
                var panel = element.closest('.verticalSection');
                if (panel) panel.classList.add('ete-plugin-bottom-panel');
            }
            var controls = element.matches('input, select, textarea, button') ? [element] : Array.from(element.querySelectorAll('input, select, textarea, button'));
            controls.forEach(function(control) {
                var baseline = !!item.IsReadOnly || item.IsEnabled === false || !!controlStates.get(control);
                if (item.EditorType === 'ButtonItem' || item.EditorType === 'ItemList' || item.EditorType === 'RadioGroup' || item.ShowAsRadio) baseline = baseline || control.disabled;
                controlStates.set(control, baseline);
            });
        });
        function fieldValue(id) {
            var element = find(root, id);
            if (!element) return get(container.Object, id);
            if (element.type === 'checkbox') return element.checked;
            if (element.classList.contains('radioGroup')) { var selected = element.querySelector('input:checked'); return selected ? selected.value : null; }
            if (element.type === 'number') return element.value === '' ? null : Number(element.value);
            return element.value;
        }
        function update() {
            var enabled = new Map(), visible = new Map();
            conditions.forEach(function(condition) {
                var element = find(root, condition.AffectedPropertyId);
                if (!element) return;
                var result = conditionResult(condition, fieldValue(condition.TargetPropertyId));
                if (condition.ConditionType === 'Enabled') enabled.set(element, result);
                if (condition.ConditionType === 'Visible') visible.set(element, result);
            });
            visibilityStates.forEach(function(baseline, element) {
                var wrapper = element.closest('.inputContainer, .selectContainer, .toggleContainer, .checkboxContainer') || element;
                wrapper.classList.toggle('hide', !baseline || visible.get(element) === false);
            });
            controlStates.forEach(function(baseline, control) {
                var disabled = baseline;
                enabled.forEach(function(value, element) { if ((element === control || element.contains(control)) && !value) disabled = true; });
                control.disabled = disabled;
            });
        }
        // The inherited listener runs first. Reconcile nested/group conditions
        // afterward without writing display state into the canonical object.
        root.addEventListener('change', update);
        update();
    }
    function decorateList(root, values, prefix) {
        if (!Array.isArray(values)) return;
        root.classList.add('ete-plugin-list');
        values.forEach(function(value, index) {
            var id = prefix + '.listitem' + index, element = find(root, id);
            if (!element) return;
            element.classList.add('ete-plugin-listitem');
            bindLink(element, value.HyperLink);
            var content = element.firstElementChild;
            var glyph = content && content.querySelector('.itemAction .md-icon'), resolved = itemIcon(value);
            if (!glyph && resolved && value.IconMode !== 'NoIcons') {
                var holder = document.createElement('div'); holder.className = 'itemAction ete-plugin-listicon';
                glyph = document.createElement('i'); glyph.className = 'md-icon'; holder.appendChild(glyph);
                element.firstElementChild.insertBefore(holder, element.firstElementChild.firstChild);
            }
            setIcon(glyph, resolved);
            ['Button1', 'Button2'].forEach(function(key) {
                var button = find(root, id + '.' + key.toLowerCase());
                if (!button || !value[key]) return;
                var glyph = button.querySelector('.md-icon');
                if (!glyph && itemIcon(value[key])) { glyph = document.createElement('i'); glyph.className = 'md-icon button-icon'; button.insertBefore(glyph, button.firstChild); }
                setIcon(glyph, itemIcon(value[key]));
            });
            decorateList(element, value.SubItems, id);
        });
    }
    exports.default = {icon: icon, itemIcon: itemIcon, safeHyperLink: safeHyperLink, conditionResult: conditionResult, prepare: prepare, apply: apply};
});
