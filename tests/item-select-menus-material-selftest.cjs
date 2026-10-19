'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const externalPlayerResidue = require('../tools/patch-externalplayer-residue.cjs');
const itemControls = require('../tools/patch-item-controls.cjs');
const contentWidth = require('../tools/patch-content-width.cjs');

const repoRoot = path.resolve(__dirname, '..');
const sourcePath = 'vendor/carnival/electronapp/www/item/item.html';
const source = fs.readFileSync(path.join(repoRoot, sourcePath), 'utf8');
const priorOverlay = externalPlayerResidue.patchItemHtmlText(source);

test('transforms the frozen vendor CSS while retaining the existing track-selection overlay', () => {
    const sourcePath = path.join(repoRoot, 'vendor/carnival/electronapp/www/modules/layout.css');
    const source = fs.readFileSync(sourcePath, 'utf8');
    const withTrackSelection = itemControls.patchLayoutCssText(source);
    const output = contentWidth.patchContentWidthText(withTrackSelection);

    assert.equal((output.match(/-webkit-line-clamp:/g) || []).length,
        (withTrackSelection.match(/-webkit-line-clamp:/g) || []).length);
    assert.match(output, /@media all and \(min-width: 50em\) \{\r?\n  \.readOnlyContent,\r?\n  form \{\r?\n    max-width: 90ch;/);
    assert.match(output, /\.secondaryText\.focusPreviewOverview,\r?\n\.readOnlyContent \{\r?\n  -webkit-line-clamp: 3;\r?\n\}/);
    assert.match(output, /\.secondaryText\.focusPreviewOverview \{\r?\n  max-width: 90ch !important;\r?\n\}/);
    assert.doesNotMatch(output, /\.readOnlyContent \{\r?\n  -webkit-line-clamp: 3;\r?\n  max-width: 90ch !important;/);
    assert.match(output, /\/\* ETE detail track selection layout overlay \*\//);
});

test('adds custom menu mode to source and video while preserving all other HTML bytes', () => {
    const output = itemControls.patchItemHtmlText(priorOverlay);
    const expected = priorOverlay
        .replace('<select is="emby-select" class="selectSource detailTrackSelect emby-select-inline" label=""></select>',
            '<select is="emby-select" class="selectSource detailTrackSelect emby-select-inline" label="" data-menu="custom"></select>')
        .replace('<select is="emby-select" class="selectVideo detailTrackSelect emby-select-inline" label=""></select>',
            '<select is="emby-select" class="selectVideo detailTrackSelect emby-select-inline" label="" data-menu="custom"></select>');
    assert.equal(output, expected);
    assert.equal((output.match(/<select\b/g) || []).length, 4);
    assert.equal((output.match(/data-menu="custom"/g) || []).length, 4);
    for (const control of ['selectSource', 'selectVideo', 'selectAudio', 'selectSubtitles']) {
        assert.match(output, new RegExp('<select[^>]*class="' + control + '[^"]*"[^>]*data-menu="custom"'));
    }
});

test('fails closed on changed or duplicate selector anchors without modifying input', () => {
    const missing = priorOverlay.replace('selectSource detailTrackSelect', 'selectSource changed detailTrackSelect');
    assert.throws(() => itemControls.patchItemHtmlText(missing), /selectSource selector/);
    assert.ok(missing.includes('selectVideo detailTrackSelect'));

    const sourceSelector = '<select is="emby-select" class="selectSource detailTrackSelect emby-select-inline" label=""></select>';
    const duplicate = priorOverlay + '\n' + sourceSelector;
    assert.throws(() => itemControls.patchItemHtmlText(duplicate), /selectSource selector/);
    assert.ok(duplicate.endsWith(sourceSelector));
});

test('leaves Emby selector implementation and ActionSheet implementation unchanged', () => {
    const selectorsPath = 'vendor/carnival/electronapp/www/modules/emby-elements/emby-select/emby-select.js';
    const actionSheetPath = 'vendor/carnival/electronapp/www/modules/actionsheet/actionsheet.js';
    const selectorsBefore = fs.readFileSync(path.join(repoRoot, selectorsPath));
    const actionSheetBefore = fs.readFileSync(path.join(repoRoot, actionSheetPath));
    const output = itemControls.patchItemHtmlText(priorOverlay);
    assert.notEqual(output, priorOverlay);
    assert.deepEqual(fs.readFileSync(path.join(repoRoot, selectorsPath)), selectorsBefore);
    assert.deepEqual(fs.readFileSync(path.join(repoRoot, actionSheetPath)), actionSheetBefore);
});

test('appends a detail-only wide-screen layout override while preserving the canonical CSS prefix', () => {
    const layoutPath = 'vendor/carnival/electronapp/www/modules/layout.css';
    const layout = fs.readFileSync(path.join(repoRoot, layoutPath), 'utf8');
    const output = itemControls.patchLayoutCssText(layout);
    const addition = output.slice(layout.length);
    assert.ok(output.startsWith(layout));
    assert.match(addition, /^\/\* ETE detail track selection layout overlay \*\//);
    assert.match(addition, /@media all and \(min-width: 80em\)/);
    assert.match(addition, /\.itemView \.trackSelections\s*\{\s*width: auto;/);
    assert.match(addition, /\.itemView \.trackSelections \.selectLabel,\s*\.itemView \.trackSelections \.detailTrackSelect\s*\{\s*margin-top: 0;/);
    assert.doesNotMatch(addition, /^\s*\.selectLabel\s*(,|\{)|^\s*\.detailTrackSelect\s*\{/m);
    assert.throws(() => itemControls.patchLayoutCssText(output), /overlay marker already exists/);
});

test('frozen Emby select routes custom pointer and Enter input through ActionSheet and keeps change events', async () => {
    const modulePath = path.join(repoRoot, 'vendor/carnival/electronapp/www/modules/emby-elements/emby-select/emby-select.js');
    const moduleSource = fs.readFileSync(modulePath, 'utf8');
    const calls = [];
    let EmbySelect;

    function HTMLSelectElement() {
        this.attributes = {'data-menu': 'custom'};
        this.value = '';
        this.changed = 0;
        this.listeners = Object.create(null);
        this.classList = {add() {}, contains() { return false; }};
        this.previousElementSibling = null;
        this.hasAttribute = name => Object.prototype.hasOwnProperty.call(this.attributes, name);
        this.getAttribute = name => this.attributes[name] ?? null;
        this.addEventListener = (name, listener) => { this.listeners[name] = listener; };
        this.dispatchEvent = event => { if (event.type === 'change') this.changed++; return true; };
    }
    const exports = {};
    const dependencies = [
        {default: {translate: value => value}},
        {default: {tv: false}},
        {},
        {default: {show(options) { calls.push(options); return Promise.resolve(['selected']); }}},
        {default: {allowBackdropFilter() { return false; }}}
    ];
    const babelHelpers = {
        wrapNativeSuper: Super => Super,
        inherits: (subclass, superclass) => {
            Object.setPrototypeOf(subclass.prototype, superclass.prototype);
            Object.setPrototypeOf(subclass, superclass);
        },
        createSuper: () => function () { return HTMLSelectElement.apply(this, arguments) || this; },
        classCallCheck: (instance, Constructor) => {
            if (!(instance instanceof Constructor)) throw new TypeError('Invalid constructor call');
        },
        possibleConstructorReturn: (self, value) => value && (typeof value === 'object' || typeof value === 'function') ? value : self,
        createClass: (Constructor, prototypeProperties) => {
            for (const property of prototypeProperties) Object.defineProperty(Constructor.prototype, property.key, property);
            return Constructor;
        }
    };
    const sandbox = {
        babelHelpers,
        _createSuper: () => function () { return HTMLSelectElement.apply(this, arguments) || this; },
        HTMLSelectElement,
        Object,
        Promise,
        document: {
            documentElement: {},
            createEvent() { return {initEvent(type) { this.type = type; }}; }
        },
        window: {PointerEvent: function PointerEvent() {}},
        customElements: {define(_name, constructor) { EmbySelect = constructor; }},
        require() {},
        define(_names, factory) { factory(exports, ...dependencies); }
    };
    vm.runInNewContext(moduleSource, sandbox, {filename: modulePath});
    assert.equal(typeof EmbySelect, 'function');

    for (const controlName of ['selectSource', 'selectVideo']) {
        const control = new EmbySelect();
        assert.equal(control.getAttribute('data-menu'), 'custom');
        control.listeners.pointerdown.call(control, {button: 0, pointerType: 'mouse', preventDefault() {}});
        await Promise.resolve();
        assert.equal(calls.at(-1).positionTo, control, controlName + ' pointerdown opens its ActionSheet');
        assert.equal(control.value, 'selected');
        assert.equal(control.changed, 1);

        control.listeners.keydown.call(control, {keyCode: 13, preventDefault() {}});
        await Promise.resolve();
        assert.equal(calls.at(-1).positionTo, control, controlName + ' Enter opens its ActionSheet');
        assert.equal(control.changed, 2);
    }

    const disabled = new EmbySelect();
    disabled.disabled = true;
    const callCount = calls.length;
    disabled.listeners.pointerdown.call(disabled, {button: 0, pointerType: 'mouse', preventDefault() {}});
    disabled.listeners.click.call(disabled, {stopPropagation() {}, preventDefault() {}});
    assert.equal(calls.length, callCount);
});
