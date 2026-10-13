define(['exports'], function(exports) {
    'use strict';
    var denied = ['__proto__', 'prototype', 'constructor'];
    function safePath(value) {
        return typeof value === 'string' && value.length <= 512 && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value) &&
            value.split('.').every(function(part) { return part && denied.indexOf(part) === -1; });
    }
    function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
    function clone(value, depth, count) {
        if (depth > 24 || ++count.n > 20000) throw new Error('Plugin schema limit exceeded');
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(function(v) { return clone(v, depth + 1, count); });
        var result = {};
        Object.keys(value).forEach(function(key) {
            if (denied.indexOf(key) >= 0) throw new Error('Invalid plugin property');
            result[key] = clone(value[key], depth + 1, count);
        });
        return result;
    }
    function tabHref(value) {
        if (typeof value !== 'string') return null;
        var match = /^(?:\.\/|\/)?genericui\?PageId=([^&#]+)(?:&[^#]*)?$/.exec(value);
        if (!match) return null;
        try { return 'genericui?PageId=' + encodeURIComponent(decodeURIComponent(match[1])); } catch (_) { return null; }
    }
    function prepare(data) {
        var copy = clone(data, 0, {n: 0});
        if (!copy || typeof copy.PageId !== 'string' || typeof copy.ViewId !== 'string' || !copy.EditObjectContainer || !copy.EditObjectContainer.EditorRoot) throw new Error('Invalid plugin schema');
        if (copy.ViewType && ['Page', 'Dialog', 'Wizard'].indexOf(copy.ViewType) < 0) throw new Error('Unsupported plugin view');
        var container = copy.EditObjectContainer;
        if (!container.Object || typeof container.Object !== 'object' || Array.isArray(container.Object)) throw new Error('Invalid plugin values');
        container.DefaultObject = container.DefaultObject || {};
        function editor(item, root) {
            if (!item || typeof item !== 'object') throw new Error('Invalid plugin editor');
            if (item.Id && !safePath(item.Id)) throw new Error('Invalid plugin field');
            ['ItemsSourceId', 'StaticItemsSourceId'].forEach(function(key) {
                if (item[key] && !safePath(item[key])) throw new Error('Invalid plugin items source');
            });
            var supported = ['Group', 'Text', 'Numeric', 'Boolean', 'SelectSingle', 'SelectMultiple', 'Date', 'FilePath', 'FolderPath', 'StatusItem', 'ProgressItem', 'ButtonItem', 'ButtonGroup', 'CaptionItem', 'LabelItem', 'SpacerItem', 'ItemList', 'RadioGroup'];
            if (!item.EditorType && root && Array.isArray(item.EditorItems)) item.EditorType = 'Group';
            if (supported.indexOf(item.EditorType) < 0) throw new Error('Unsupported plugin editor');
            ['MinValue', 'MaxValue', 'DecimalPlaces', 'LineCount', 'MaxLength'].forEach(function(key) {
                if (item[key] != null && (typeof item[key] !== 'number' || !Number.isFinite(item[key]))) throw new Error('Invalid plugin constraint');
            });
            if (item.DecimalPlaces > 20 || item.LineCount > 100 || item.MaxLength > 1000000) throw new Error('Plugin constraint limit exceeded');
            // The inherited editor builds markup from these schema strings.
            ['DisplayName', 'Description', 'extraClasses', 'ItemsSourceId', 'StaticItemsSourceId', 'PlaceHolder'].forEach(function(key) { if (item[key] != null) item[key] = escape(item[key]); });
            if (item.EditorType && ['DxDataGrid', 'DxPivotGrid', 'DataGrid', 'PivotGrid'].indexOf(item.EditorType) >= 0) throw new Error('Unsupported plugin editor');
            item.PropertyConditions = item.PropertyConditions || [];
            item.PropertyConditions.forEach(function(condition) {
                if (!safePath(condition.TargetPropertyId) || !safePath(condition.AffectedPropertyId)) throw new Error('Invalid plugin condition');
            });
            if (item.PostbackActions) item.PostbackActions.forEach(function(action) {
                if (!safePath(action.TargetEditorId) || !safePath(action.CommandParameterPropertyId) || typeof action.PostbackCommandId !== 'string') throw new Error('Invalid plugin postback');
            });
            if (item.EditorItems) item.EditorItems.forEach(function(child) { editor(child, false); });
            if (item.TitleButton) editor(item.TitleButton, false);
            if (item.SelectOptions) item.SelectOptions.forEach(function(option) { ['Name', 'Value'].forEach(function(k) { option[k] = escape(option[k]); }); });
        }
        editor(container.EditorRoot, true);
        container.EditorRoot.EditorItems = container.EditorRoot.EditorItems || [];
        return copy;
    }
    function displayContainer(container) {
        var display = clone(container, 0, {n: 0});
        // ItemList values become markup in the inherited editor. Keep command
        // data canonical and escape only the display copy of those fields.
        function links(object) {
            if (!object || typeof object !== 'object') return;
            if (object.HyperLink) object.HyperLink = null;
            Object.keys(object).forEach(function(key) { if (typeof object[key] === 'object') links(object[key]); });
        }
        links(display.Object);
        links(display.DefaultObject);
        function get(object, id) {
            return id.split('.').reduce(function(value, key) { return value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : null; }, object);
        }
        function markup(object) {
            if (!object || typeof object !== 'object') return;
            if (object.PercentComplete != null && (typeof object.PercentComplete !== 'number' || !Number.isFinite(object.PercentComplete))) throw new Error('Invalid plugin progress');
            Object.keys(object).forEach(function(key) {
                if (object[key] != null && ['PrimaryText', 'SecondaryText', 'Text', 'Tag', 'Icon', 'Value', 'Name', 'Caption', 'Data1', 'Data2', 'ConfirmationPrompt'].indexOf(key) >= 0 && !(key === 'Tag' && typeof object[key] === 'object')) object[key] = escape(object[key]);
                else if (typeof object[key] === 'object') markup(object[key]);
            });
        }
        function items(item) {
            if (item.EditorType === 'ButtonItem') {
                [display.Object, display.DefaultObject].forEach(function(object) {
                    var button = get(object, item.Id);
                    if (button && button.SubMenuButtons) markup(button.SubMenuButtons);
                });
            }
            if (item.EditorType === 'ItemList') {
                markup(get(display.Object, item.Id));
                markup(get(display.DefaultObject, item.Id));
            }
            if (item.EditorType === 'RadioGroup' || item.ShowAsRadio) {
                [item.ItemsSourceId, item.StaticItemsSourceId].filter(Boolean).forEach(function(id) {
                    [display.Object, display.DefaultObject].forEach(function(object) {
                        var options = get(object, id);
                        if (Array.isArray(options)) options.forEach(function(option) {
                            ['Value', 'PrimaryText', 'SecondaryText'].forEach(function(key) { if (option[key] != null) option[key] = escape(option[key]); });
                        });
                    });
                });
            }
            (item.EditorItems || []).forEach(items);
            if (item.TitleButton) items(item.TitleButton);
        }
        items(display.EditorRoot);
        return display;
    }
    exports.default = {prepare: function(data) {
        var copy = prepare(data);
        copy.Commands = Array.isArray(copy.Commands) ? copy.Commands : [];
        copy.TabPageInfos = Array.isArray(copy.TabPageInfos) ? copy.TabPageInfos : [];
        return copy;
    }, displayContainer: displayContainer, tabHref: tabHref, safePath: safePath, escape: escape};
});
