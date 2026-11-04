'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const cancel = require('../tools/patch-select-cancel.cjs');
const reorder = require('../tools/patch-actionsheet-reordering.cjs');

const root = path.resolve(__dirname, '..');
const actionSource = reorder.patchActionSheet(cancel.patchActionSheet(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/actionsheet/actionsheet.js'), 'utf8')));
const selectSource = reorder.patchSelect(cancel.patchSelect(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/emby-elements/emby-select/emby-select.js'), 'utf8')));

function helpers() {
    const exports = {};
    const instrumented = actionSource.replace('function getListOptions(){',
        '_exports.__eteTest={eteReorderItems:eteReorderItems,eteMoveSelection:eteMoveSelection,eteSyncDrop:eteSyncDrop,eteDecorateReorderRow:eteDecorateReorderRow,eteSetupReorderRows:eteSetupReorderRows,getListOptions:getListOptions};function getListOptions(){');
    assert.notEqual(instrumented, actionSource);
    vm.runInNewContext(instrumented, {
        require() {},
        define(_deps, factory) {
            const dependencies = Array.from({length: 16}, () => ({default: {}}));
            dependencies[0] = exports;
            dependencies[3] = {default: {translate(key) { return key; }}};
            factory(...dependencies);
        },
        Promise, Object,
        document: {
            createElement() {
                return {
                    classList: {add() {}},
                    children: [],
                    setAttribute() {},
                    addEventListener(event, fn) { this[event] = fn; },
                    appendChild(child) { this.children.push(child); }
                };
            }
        }
    });
    return exports.__eteTest;
}

test('only explicit multi-select opts in to ActionSheet reordering', () => {
    assert.match(selectSource, /enableReordering="true"===select\.getAttribute\("data-reordering"\)&&labelElem\.multiple/);
    assert.match(actionSource, /if\(options\.enableReordering\)/);
    const {getListOptions} = helpers();
    const ordinary = getListOptions.call({multiple: true});
    const ordered = getListOptions.call({multiple: true, enableReordering: true});
    assert.equal(ordinary.options.draggable, false);
    assert.equal(ordinary.options.dragHandle, false);
    assert.equal(ordered.options.draggable, true);
    assert.equal(ordered.options.dragHandle, true);
    assert.match(actionSource, /itemsContainer\.onUpdateElement=function\(row,item\)\{eteDecorateReorderRow\(options,itemsContainer,row,item\)\}/);
    assert.doesNotMatch(actionSource, /options\.enableVirtualScroller=!1/);
});

test('popup selected values sort first, keep unknown codes, and use full-list paging', async () => {
    const {eteReorderItems} = helpers();
    const options = {
        selectedValuesClone: ['zz', 'ja'],
        _eteGetItems: async () => ({Items: [
            {Id: 'en', Name: 'English'}, {Id: 'ja', Name: 'Japanese'},
            {Id: 'zz', Name: 'zz'}, {Id: 'zh', Name: 'Chinese'}
        ]})
    };
    const result = await eteReorderItems(options, {StartIndex: 1, Limit: 2});
    assert.equal(result.TotalRecordCount, 4);
    assert.deepEqual(Array.from(result.Items, item => item.Id), ['ja', 'en']);
});

test('repeat keyboard moves update only the popup clone and restore focus on refresh', () => {
    const {eteMoveSelection} = helpers();
    const options = {selectedValuesClone: ['en', 'ja', 'zh']};
    const container = {refreshItems() { this.refreshes = (this.refreshes || 0) + 1; }};
    eteMoveSelection(options, container, 'zh', 1, -1);
    eteMoveSelection(options, container, 'zh', 0, -1);
    assert.deepEqual(Array.from(options.selectedValuesClone), ['zh', 'en', 'ja']);
    assert.deepEqual({...options._eteReorderFocus}, {id: 'zh', direction: -1, handle: false});
    assert.equal(container.refreshes, 2);
    eteMoveSelection(options, container, 'zh', -1, -1);
    assert.equal(container.refreshes, 2);
});

test('drop takes rendered selected order, independent of non-row content index', () => {
    const {eteSyncDrop} = helpers();
    const options = {selectedValuesClone: ['en', 'ja', 'zh']};
    const rows = ['ja', 'zh', 'en'].map(id => ({getAttribute() { return id; }}));
    const container = {
        querySelectorAll(selector) {
            assert.equal(selector, '.ete-reorder-selected');
            return rows;
        },
        refreshItems() { this.refreshes = (this.refreshes || 0) + 1; }
    };
    eteSyncDrop(options, container);
    assert.deepEqual(Array.from(options.selectedValuesClone), ['ja', 'zh', 'en']);
    assert.equal(container.refreshes, 1);
});

test('each selected row button moves its own language, including the last rendered row', () => {
    const {eteSetupReorderRows} = helpers();
    const options = {selectedValuesClone: ['en', 'ja']};
    const rows = ['en', 'ja', 'zz'].map(id => ({
        id,
        classList: {add() {}, remove() {}},
        setAttribute() {}, removeAttribute() {},
        querySelector(selector) { return selector === '.listViewDragHandle' ? null : null; },
        appendChild(child) { this.controls = child; },
        getAttribute() { return id; }
    }));
    const nestedContent = {insertBefore(controls, handle) { this.controls = controls; this.before = handle; }};
    const nestedHandle = {parentNode: nestedContent, classList: {add() {}, remove() {}}, setAttribute() {}};
    rows[0].querySelector = selector => selector === '.listViewDragHandle' ? nestedHandle : null;
    const container = {
        getItemSelector() { return '.listItem'; },
        querySelectorAll() { return rows; },
        getItemFromElement(row) { return {Id: row.id, Name: row.id}; },
        refreshItems() { this.refreshes = (this.refreshes || 0) + 1; }
    };
    eteSetupReorderRows(options, container);
    assert.equal(nestedContent.controls.children.length, 2);
    rows[1].controls.children[0].click({preventDefault() {}, stopPropagation() {}});
    assert.deepEqual(Array.from(options.selectedValuesClone), ['ja', 'en']);
    assert.equal(container.refreshes, 1);
});

test('virtual row recycling removes stale controls and drag state', () => {
    const {eteDecorateReorderRow} = helpers();
    const classes = new Set();
    const handleClasses = new Set();
    const content = {controls: null, insertBefore(controls) { this.controls = controls; }};
    const handle = {parentNode: content, classList: {
        add(name) { handleClasses.add(name); }, remove(name) { handleClasses.delete(name); }
    }, setAttribute() {}, removeAttribute() {}};
    const row = {
        attributes: new Map(),
        classList: {
            add(...names) { names.forEach(name => classes.add(name)); },
            remove(...names) { names.forEach(name => classes.delete(name)); },
            contains(name) { return classes.has(name); }
        },
        querySelector(selector) {
            if (selector === '.listViewDragHandle') return handle;
            return selector === '.ete-reorder-controls' ? content.controls : null;
        },
        setAttribute(name, value) { this.attributes.set(name, value); },
        getAttribute(name) { return this.attributes.get(name) || null; },
        hasAttribute(name) { return this.attributes.has(name); },
        removeAttribute(name) { this.attributes.delete(name); }
    };
    const options = {selectedValuesClone: ['en', 'ja']};
    const container = {refreshItems() { this.refreshes = (this.refreshes || 0) + 1; }};
    eteDecorateReorderRow(options, container, row, {Id: 'en', Name: 'English'});
    assert.equal(row.attributes.get('draggable'), 'true');
    assert.equal(content.controls.children.length, 2);
    content.controls.remove = () => { content.controls = null; };
    eteDecorateReorderRow(options, container, row, {Id: 'zz', Name: 'Other'});
    assert.equal(row.attributes.has('draggable'), false);
    assert.equal(classes.has('ete-reorder-selected'), false);
    assert.equal(handleClasses.has('hide'), true);
    eteDecorateReorderRow(options, container, row, {Id: 'ja', Name: 'Japanese'});
    assert.equal(row.attributes.get('data-ete-reorder-id'), 'ja');
    assert.equal(content.controls.children.length, 2);
    assert.equal(handleClasses.has('hide'), false);
    handle.onkeydown({key: 'ArrowUp', preventDefault() {}, stopPropagation() {}});
    assert.deepEqual(Array.from(options.selectedValuesClone), ['ja', 'en']);
    assert.equal(options._eteReorderFocus.handle, true);
    assert.equal(container.refreshes, 1);
});

test('source transforms reject a changed or duplicate frozen anchor', () => {
    assert.throws(() => reorder.patchSelect('missing'), /contract mismatch/);
    assert.throws(() => reorder.patchActionSheet('missing'), /contract mismatch/);
});
