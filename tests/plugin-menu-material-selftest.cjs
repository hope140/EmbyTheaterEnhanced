'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const material = path.join(root, 'vendor/carnival/electronapp/www/modules/genericedit/genericedit.js');
const hasMaterial = fs.existsSync(material);

function extract(source, name) {
    const start = source.indexOf('function ' + name + '('), open = source.indexOf('{', start);
    assert.ok(start >= 0 && open >= 0);
    let depth = 0, quote = null, escaped = false;
    for (let i = open; i < source.length; i++) {
        const c = source[i];
        if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'") { quote = c; continue; }
        if (c === '{') depth++;
        if (c === '}' && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error('Unclosed material function');
}
function amd(name, dependencies = {}) {
    let output;
    const context = {define(ids, factory) { const exports = {}; factory(exports, ...ids.slice(1).map(id => dependencies[id] || {default: function() {}})); output = exports.default; }, Promise};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'src/electronapp/enhanced/plugin-ui', name), 'utf8'), context);
    return output;
}
function page() {
    return {PageId: 'synthetic', ViewId: 'v', EditObjectContainer: {EditorRoot: {EditorType: 'Group', EditorItems: [{Id: 'action', EditorType: 'ButtonItem'}, {Id: 'items', EditorType: 'ItemList'}]},
        Object: {action: {IsEnabled: true, SubMenuButtons: [{Caption: '<img src=x onerror=attack()>', Icon: '<svg onload=attack()>', Data1: 'Delete" & command', Data2: 'item" & id', ConfirmationPrompt: 'Confirm <delete> & operation?'}]},
            items: [{Button1: {IsEnabled: true, Caption: '<img src=x>', Data1: 'Remove', ConfirmationPrompt: 'Confirm item removal?'}}]}}};
}

test('frozen RED: submenu and ItemList helpers do not forward action confirmation', {skip: !hasMaterial}, () => {
    const source = fs.readFileSync(material, 'utf8'), canonical = page().EditObjectContainer.Object;
    let options, event;
    const context = {_actionsheet: {default: {show(value) { options = value; }}}, window: {}, MouseEvent: class {constructor() {}}};
    vm.runInNewContext(extract(source, 'actionSheetHandler') + ';' + extract(source, 'renderListButton'), context);
    const button = {type: 'button', subMenuButtons: canonical.action.SubMenuButtons, dispatchEvent(value) { event = value; }};
    context.actionSheetHandler({target: {closest() { return button; }}}); options.callback('item0');
    assert.equal(options.items[0].icon, '<svg onload=attack()>');
    assert.equal(event.ConfirmationPrompt, undefined);
    assert.doesNotMatch(context.renderListButton(canonical.items[0].Button1, 'items.listitem0.button1'), /data-prompt/);
});

test('candidate GREEN: real frozen submenu uses escaped display and canonical command confirmation', {skip: !hasMaterial}, () => {
    const schema = amd('schema.js'), data = schema.prepare(page()), display = schema.displayContainer(data.EditObjectContainer);
    const View = amd('genericui.js', {'./schema.js': {default: schema}, '../../www/modules/viewmanager/baseview.js': {default: function() {}}});
    let options, forwarded, originalEvent;
    const view = Object.create(View.prototype);
    view.active = true; view.data = data; view.view = {contains() { return true; }};
    view.runCommand = function(...args) { forwarded = args; };
    const button = {type: 'button', disabled: false, subMenuButtons: display.Object.action.SubMenuButtons, etePluginAction: data.EditObjectContainer.Object.action,
        closest() { return this; }, getAttribute() { return null; }, dispatchEvent(event) {
            originalEvent = event; event.target = this; event.preventDefault = function() {}; event.stopPropagation = function() {}; view.onClick(event);
        }};
    const context = {_actionsheet: {default: {show(value) { options = value; }}}, window: {}, MouseEvent: class {constructor() {}}};
    vm.runInNewContext(extract(fs.readFileSync(material, 'utf8'), 'actionSheetHandler'), context);
    context.actionSheetHandler({target: {closest() { return button; }}});
    assert.doesNotMatch(options.items[0].name, /<img/); assert.doesNotMatch(options.items[0].icon, /<svg/);
    assert.match(options.items[0].id, /&quot;/);
    options.callback('item0');
    assert.equal(originalEvent.ConfirmationPrompt, undefined, 'test executes the actual old event shape');
    assert.deepEqual(forwarded, ['Delete" & command', 'item" & id', 'Confirm <delete> & operation?']);
    assert.equal(data.EditObjectContainer.Object.action.SubMenuButtons[0].Icon, '<svg onload=attack()>', 'canonical data remains unchanged');
});
