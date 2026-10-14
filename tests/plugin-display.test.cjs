'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const displayPath = path.join(__dirname, '../src/electronapp/enhanced/plugin-ui/display.js');

function loadDisplay() {
    const source = fs.readFileSync(displayPath, 'utf8');
    const context = {URL, define(_dependencies, factory) { const exports = {}; factory(exports); context.display = exports.default; }};
    vm.runInNewContext(source, context, {filename: displayPath});
    return context.display;
}

class FakeNode {
    constructor(id, type = '') {
        this.id = id;
        this.type = type;
        this.checked = false;
        this.value = '';
        this.disabled = false;
        this.children = [];
        this.parent = null;
        this.classes = new Set();
        this.classList = {
            add: (...names) => names.forEach(name => this.classes.add(name)),
            contains: name => this.classes.has(name),
            toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name)
        };
    }
    append(child) { child.parent = this; this.children.push(child); return child; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    matches(selector) { return /(^|,\s*)(input|select|textarea|button)(,|$)/.test(selector) && (this.type === 'checkbox' || ['input', 'select', 'textarea', 'button'].includes(this.type)); }
    querySelector(selector) { return selector.startsWith('#') ? this.querySelectorAll('*').find(node => node.id === selector.slice(1).replace(/\\\./g, '.')) || null : null; }
    querySelectorAll(selector) {
        const result = [];
        const visit = node => node.children.forEach(child => {
            if (selector === '*' || child.matches(selector)) result.push(child);
            visit(child);
        });
        visit(this);
        return result;
    }
    closest() { return this; }
    addEventListener(name, callback) { this.listener = name === 'change' ? callback : this.listener; }
    dispatch(name) { if (name === 'change' && this.listener) this.listener({type: name, target: this}); }
}

test('display icons accept names and one Material private-use entity only', () => {
    const display = loadDisplay();
    const glyph = String.fromCharCode(0xe123);
    assert.equal(display.icon('check_circle'), 'check_circle');
    assert.equal(display.icon(glyph), glyph);
    assert.equal(display.icon('&#xe123;'), glyph);
    assert.equal(display.icon('&amp;#xe123;'), glyph);
    assert.equal(display.icon('&#57635;'), glyph);
    for (const value of ['<b>icon</b>', '&lt;', '&#65;', '&#xe123;&#xe123;', '&amp;amp;#xe123;', '123', '']) {
        assert.equal(display.icon(value), '', `reject ${value}`);
    }
});

test('standard icon mapping takes priority and custom icon is the fallback', () => {
    const display = loadDisplay();
    assert.equal(display.itemIcon({StandardIcon: 'Delete', Icon: 'edit'}), 'delete');
    assert.equal(display.itemIcon({StandardIcon: 'Unknown', Icon: 'edit'}), 'edit');
    assert.equal(display.itemIcon({StandardIcon: 'Unknown', Icon: '&#xe123;'}), String.fromCharCode(0xe123));
    assert.equal(display.itemIcon({StandardIcon: 'Unknown', Icon: '<svg>'}), '');
});

test('safe hyperlink validation allows credential-free HTTP(S) and rejects active schemes and secrets', () => {
    const safeHyperLink = loadDisplay().safeHyperLink;
    assert.equal(safeHyperLink('https://docs.example/path?view=guide'), 'https://docs.example/path?view=guide');
    assert.equal(safeHyperLink('http://docs.example/path'), 'http://docs.example/path');
    for (const value of [
        'javascript:alert(1)',
        'data:text/html,<b>unsafe</b>',
        'file:///C:/private.txt',
        'https://user:pass@docs.example/path',
        'https://docs.example/path?%61pi_key=synthetic',
        'https://docs.example/path?%74oken=synthetic',
        'https://docs.example/path#access_token=synthetic',
        'https://docs.example/path#x=1&password=synthetic'
    ]) assert.equal(safeHyperLink(value), null, 'reject unsafe URL');
});

test('condition results keep strict booleans and define null, empty, zero, and comparison edges', () => {
    const result = loadDisplay().conditionResult;
    assert.equal(result({SimpleCondition: 'IsTrue'}, true), true);
    assert.equal(result({SimpleCondition: 'IsTrue'}, 1), false);
    assert.equal(result({SimpleCondition: 'IsFalse'}, false), true);
    assert.equal(result({SimpleCondition: 'IsNull'}, null), true);
    assert.equal(result({SimpleCondition: 'IsNull'}, undefined), true);
    assert.equal(result({SimpleCondition: 'IsNull'}, ''), false);
    assert.equal(result({SimpleCondition: 'IsNotNullOrEmpty'}, 0), true);
    assert.equal(result({SimpleCondition: 'IsNotNullOrEmpty'}, ''), false);
    assert.equal(result({ValueCondition: 'IsEqual', Value: 0}, 0), true);
    assert.equal(result({ValueCondition: 'IsEqual', Value: 0}, null), false);
    assert.equal(result({ValueCondition: 'IsNotEqual', Value: 0}, null), true);
    assert.equal(result({ValueCondition: 'IsGreater', Value: 0}, 1), true);
    assert.equal(result({ValueCondition: 'IsGreaterOrEqual', Value: 0}, 0), true);
    assert.equal(result({ValueCondition: 'IsGreaterOrEqual', Value: 0}, null), true);
    assert.equal(result({ValueCondition: 'IsLess', Value: 0}, -1), true);
    assert.equal(result({ValueCondition: 'IsLessOrEqual', Value: 0}, 0), true);
    assert.equal(result({ValueCondition: 'IsLess', Value: 0}, null), false);
});

test('adapter reads frozen schema input without mutating it', () => {
    const display = loadDisplay();
    const item = Object.freeze({Id: 'status', EditorType: 'StatusItem', PropertyConditions: Object.freeze([])});
    const object = Object.freeze({status: Object.freeze({Status: 'Succeeded'})});
    const container = Object.freeze({
        EditorRoot: Object.freeze({EditorItems: Object.freeze([item])}),
        Object: object,
        DefaultObject: Object.freeze({})
    });
    const glyph = {textContent: '', classList: {toggle() {}}};
    const element = {
        setAttribute() {},
        classList: {add() {}, toggle() {}},
        closest() { return null; },
        querySelector() { return glyph; },
        matches() { return false; },
        querySelectorAll() { return []; }
    };
    const root = {querySelector() { return element; }, addEventListener() {}};
    assert.doesNotThrow(() => display.apply(root, container));
    assert.deepEqual(JSON.parse(JSON.stringify(container)), {
        EditorRoot: {EditorItems: [{Id: 'status', EditorType: 'StatusItem', PropertyConditions: []}]},
        Object: {status: {Status: 'Succeeded'}}, DefaultObject: {}
    });
});

test('change reconciliation restores enabled controls, applies nested conditions, and preserves visibility/read-only baselines', () => {
    const display = loadDisplay();
    const root = new FakeNode('root');
    const flagA = root.append(new FakeNode('flagA', 'input')); flagA.type = 'checkbox';
    const flagB = root.append(new FakeNode('flagB', 'input')); flagB.type = 'checkbox';
    const showFlag = root.append(new FakeNode('showFlag', 'input')); showFlag.type = 'checkbox'; showFlag.checked = true;
    const group = root.append(new FakeNode('group'));
    const nestedGroup = group.append(new FakeNode('nestedGroup'));
    const nestedButton = nestedGroup.append(new FakeNode('nestedButton', 'button'));
    const readOnly = root.append(new FakeNode('readOnly', 'input'));
    const hidden = root.append(new FakeNode('hidden'));
    const container = {
        EditorRoot: {EditorItems: [
            {Id: 'flagA', EditorType: 'Boolean'},
            {Id: 'flagB', EditorType: 'Boolean'},
            {Id: 'showFlag', EditorType: 'Boolean'},
            {Id: 'group', EditorType: 'Group', PropertyConditions: [
                {TargetPropertyId: 'flagA', AffectedPropertyId: 'group', ConditionType: 'Enabled', SimpleCondition: 'IsTrue'}
            ], EditorItems: [
                {Id: 'nestedGroup', EditorType: 'Group', PropertyConditions: [
                    {TargetPropertyId: 'flagB', AffectedPropertyId: 'nestedButton', ConditionType: 'Enabled', SimpleCondition: 'IsTrue'}
                ], EditorItems: [{Id: 'nestedButton', EditorType: 'ButtonItem'}]}
            ]},
            {Id: 'readOnly', EditorType: 'Text', IsReadOnly: true},
            {Id: 'hidden', EditorType: 'Text', IsVisible: false, PropertyConditions: [
                {TargetPropertyId: 'showFlag', AffectedPropertyId: 'hidden', ConditionType: 'Visible', SimpleCondition: 'IsTrue'}
            ]}
        ]},
        Object: {}, DefaultObject: {}
    };
    display.apply(root, container);

    assert.equal(nestedButton.disabled, true);
    assert.equal(readOnly.disabled, true);
    assert.equal(hidden.classList.contains('hide'), true, 'visible condition cannot override explicit IsVisible=false');

    flagB.checked = true;
    root.dispatch('change');
    assert.equal(nestedButton.disabled, true, 'nested enabled condition remains under its disabled group');
    flagA.checked = true;
    root.dispatch('change');
    assert.equal(nestedButton.disabled, false, 'enabled condition restores the nested control after both conditions pass');
    assert.equal(readOnly.disabled, true, 'read-only baseline remains disabled after reconciliation');
    assert.equal(hidden.classList.contains('hide'), true);
});
