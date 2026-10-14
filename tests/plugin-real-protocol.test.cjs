'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const schemaPath = path.resolve(__dirname, '../src/electronapp/enhanced/plugin-ui/schema.js');

function loadSchema() {
    const context = {define(ids, factory) { const exports = {}; factory(exports); context.schema = exports.default; }};
    vm.runInNewContext(fs.readFileSync(schemaPath, 'utf8'), context, {filename: schemaPath});
    return context.schema;
}

function syntheticPage(viewType) {
    return {
        PageId: 'synthetic-page',
        ViewId: 'synthetic-view',
        ViewType: viewType,
        EditObjectContainer: {
            EditorRoot: {EditorType: 'Group', EditorItems: [
                {Id: 'enabled', EditorType: 'Boolean'},
                {Id: 'label', EditorType: 'Text'}
            ]},
            Object: {enabled: true, label: 'Synthetic value'},
            DefaultObject: {}
        }
    };
}

test('RegularPage schema is accepted and preserved for the normal page path', () => {
    const page = loadSchema().prepare(syntheticPage('RegularPage'));

    assert.equal(page.PageId, 'synthetic-page');
    assert.equal(page.ViewId, 'synthetic-view');
    assert.equal(page.ViewType, 'RegularPage');
    assert.deepEqual(Array.from(page.EditObjectContainer.EditorRoot.EditorItems, item => item.EditorType), ['Boolean', 'Text']);
});

test('unknown plugin view types remain rejected', () => {
    assert.throws(() => loadSchema().prepare(syntheticPage('SyntheticUnknownView')), /Unsupported plugin view/);
});
