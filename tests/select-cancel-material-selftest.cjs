'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const patcher = require('../tools/patch-select-cancel.cjs');

const ROOT = path.resolve(__dirname, '..');
const ACTIONSHEET_PATH = 'vendor/carnival/electronapp/www/modules/actionsheet/actionsheet.js';
const SELECT_PATH = 'vendor/carnival/electronapp/www/modules/emby-elements/emby-select/emby-select.js';
const ACTIONSHEET_SHA256 = '0AD2BFAD1AD2B694EC07C693A44F0EDFBD4EB76121C8939F0E5DE27E0ABEFE67';
const SELECT_SHA256 = '5A26DED88A18643FD189FDF4E367B1AE6B37B24664C75D55207192F58C5C6CD2';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function readLockedMaterial(relativePath, expectedHash) {
    const absolutePath = path.join(ROOT, ...relativePath.split('/'));
    assert.ok(fs.existsSync(absolutePath), 'required locked source material is missing: ' + relativePath);
    const bytes = fs.readFileSync(absolutePath);
    assert.equal(sha256(bytes), expectedHash, relativePath + ' source hash changed');
    return bytes.toString('utf8');
}

function loadSelect(source, actionSheetShow) {
    let EmbySelect;
    const exports = {};
    const dependencies = [
        {default: {translate: value => value}},
        {default: {tv: false}},
        {default: {}},
        {default: {show: actionSheetShow}},
        {default: {allowBackdropFilter() { return false; }}}
    ];
    const babelHelpers = {
        wrapNativeSuper: Super => Super,
        inherits(subclass, superclass) {
            Object.setPrototypeOf(subclass.prototype, superclass.prototype);
            Object.setPrototypeOf(subclass, superclass);
        },
        createSuper: () => function () { return HTMLSelectElement.apply(this, arguments) || this; },
        classCallCheck(instance, Constructor) {
            if (!(instance instanceof Constructor)) throw new TypeError('Invalid constructor call');
        },
        possibleConstructorReturn: (self, value) => value && (typeof value === 'object' || typeof value === 'function') ? value : self,
        createClass(Constructor, prototypeProperties) {
            for (const property of prototypeProperties) Object.defineProperty(Constructor.prototype, property.key, property);
        }
    };
    function HTMLSelectElement() {
        this.attributes = Object.create(null);
        this.value = 'prior';
        this.changed = 0;
        this.listeners = Object.create(null);
        this.classList = {add() {}, contains() { return false; }};
        this.previousElementSibling = null;
        this.hasAttribute = name => Object.prototype.hasOwnProperty.call(this.attributes, name);
        this.getAttribute = name => this.attributes[name] ?? null;
        this.addEventListener = (name, listener) => { this.listeners[name] = listener; };
        this.dispatchEvent = event => { if (event.type === 'change') this.changed++; return true; };
    }
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
    const returnAnchor = 'labelElem.hasItemAsideIcon="true"===select.getAttribute("data-hasitemicon"),_actionsheet.default.show(labelElem).then(function(value)';
    const instrumented = source
        .replace(returnAnchor, returnAnchor.replace('),_actionsheet', ');return _actionsheet'))
        .replace('function getLabel(select)', '_exports.__testShowActionSheet=showActionSheet;function getLabel(select)');
    assert.notEqual(instrumented, source, 'test hook anchors must exist in the locked EmbySelect source');
    vm.runInNewContext(instrumented, sandbox, {filename: SELECT_PATH});
    assert.equal(typeof EmbySelect, 'function');
    return {EmbySelect, showActionSheet: exports.__testShowActionSheet};
}

function deferredActionSheet() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    let options;
    return {
        promise,
        resolve,
        reject,
        show(receivedOptions) { options = receivedOptions; return promise; },
        get options() { return options; }
    };
}

async function rejectionOf(promise) {
    try {
        await promise;
    } catch (error) {
        return {rejected: true, reason: error};
    }
    assert.fail('expected promise to reject');
}

test('locked ActionSheet transforms only the native close rejection branch', () => {
    const source = readLockedMaterial(ACTIONSHEET_PATH, ACTIONSHEET_SHA256);
    const transformed = patcher.patchActionSheet(source);
    const expected = source.replace(
        ':Promise.reject()})})}).then(resolve,reject)',
        ':Promise.reject({code:"ETE_ACTIONSHEET_CANCELLED"})})})}).then(resolve,reject)'
    );
    assert.equal(transformed, expected, 'ActionSheet overlay must make exactly the one cancellation substitution');
    assert.equal((transformed.match(/Promise\.reject\(/g) || []).length, (source.match(/Promise\.reject\(/g) || []).length);
    assert.ok(transformed.includes(':Promise.reject({code:"ETE_ACTIONSHEET_CANCELLED"})})})}).then(resolve,reject)'));
    assert.match(transformed, /options\.getItems\(query\)\.then\(function\(result\)/,
        'getItems failures must retain the original rejection path');
});

test('locked EmbySelect silently consumes cancellation and preserves real rejection identity', async () => {
    const original = readLockedMaterial(SELECT_PATH, SELECT_SHA256);
    const transformed = patcher.patchSelect(original);
    const expected = original.replace(
        '}(select,value)})}function getLabel',
        '}(select,value)},function(error){if(!error||error.code!=="ETE_ACTIONSHEET_CANCELLED")throw error})}function getLabel'
    );
    assert.equal(transformed, expected, 'EmbySelect overlay must only add the cancellation rejection handler');

    const menu = deferredActionSheet();
    const {EmbySelect, showActionSheet} = loadSelect(transformed, menu.show.bind(menu));
    const select = new EmbySelect();

    const selected = showActionSheet(select);
    menu.resolve(['chosen']);
    await selected;
    assert.equal(select.value, 'chosen');
    assert.equal(select.changed, 1);

    const cancelledMenu = deferredActionSheet();
    const cancelHarness = loadSelect(transformed, cancelledMenu.show.bind(cancelledMenu));
    const cancelledSelect = new cancelHarness.EmbySelect();
    cancelledSelect.value = 'keep';
    const cancelled = cancelHarness.showActionSheet(cancelledSelect);
    cancelledMenu.reject({code: 'ETE_ACTIONSHEET_CANCELLED'});
    await cancelled;
    assert.equal(cancelledSelect.value, 'keep');
    assert.equal(cancelledSelect.changed, 0);

    for (const error of [new Error('real menu failure'), undefined]) {
        const failedMenu = deferredActionSheet();
        const failureHarness = loadSelect(transformed, failedMenu.show.bind(failedMenu));
        const failedSelect = new failureHarness.EmbySelect();
        failedSelect.value = 'keep';
        const failed = failureHarness.showActionSheet(failedSelect);
        failedMenu.reject(error);
        assert.deepEqual(await rejectionOf(failed), {rejected: true, reason: error});
        assert.equal(failedSelect.value, 'keep');
        assert.equal(failedSelect.changed, 0);
    }
});

test('native menu, disabled controls, and multiple-selection rules keep their prior behavior', async () => {
    const original = readLockedMaterial(SELECT_PATH, SELECT_SHA256);
    const transformed = patcher.patchSelect(original);
    const menu = deferredActionSheet();
    const {EmbySelect, showActionSheet} = loadSelect(transformed, menu.show.bind(menu));

    const native = new EmbySelect();
    native.listeners.pointerdown.call(native, {button: 0, pointerType: 'mouse', preventDefault() { assert.fail('native pointerdown should not be prevented'); }});
    native.listeners.keydown.call(native, {keyCode: 13, preventDefault() { assert.fail('native Enter should not be prevented'); }});
    native.listeners.click.call(native, {stopPropagation() { assert.fail('native click should bubble'); }, preventDefault() { assert.fail('native click should retain browser behavior'); }});
    assert.equal(menu.options, undefined);

    const customDisabled = new EmbySelect();
    customDisabled.attributes['data-menu'] = 'custom';
    customDisabled.disabled = true;
    customDisabled.listeners.pointerdown.call(customDisabled, {button: 0, pointerType: 'mouse', preventDefault() {}});
    customDisabled.listeners.click.call(customDisabled, {stopPropagation() {}, preventDefault() {}});
    assert.equal(menu.options, undefined);

    const setValuesCalls = [];
    const partialMenu = deferredActionSheet();
    const partial = loadSelect(transformed, partialMenu.show.bind(partialMenu));
    const partialMultiple = {
        _totalRecordCount: 2,
        getValues() { return []; },
        hasAttribute(name) { return name === 'multiple'; },
        getAttribute() { return null; },
        setValues(values, triggerChange) { setValuesCalls.push({values, triggerChange}); }
    };
    const partialPromise = partial.showActionSheet(partialMultiple);
    assert.equal(partialMenu.options.multiple, true);
    partialMenu.resolve(['one']);
    await partialPromise;
    assert.deepEqual(setValuesCalls.at(-1), {values: ['one'], triggerChange: true});

    const allMenu = deferredActionSheet();
    const all = loadSelect(transformed, allMenu.show.bind(allMenu));
    const allMultiple = {
        _totalRecordCount: 2,
        getValues() { return []; },
        hasAttribute(name) { return name === 'multiple'; },
        getAttribute() { return null; },
        setValues(values, triggerChange) { setValuesCalls.push({values, triggerChange}); }
    };
    const allPromise = all.showActionSheet(allMultiple);
    allMenu.resolve(['one', 'two']);
    await allPromise;
    assert.deepEqual(Array.from(setValuesCalls.at(-1).values), []);
    assert.equal(setValuesCalls.at(-1).triggerChange, true);
});

process.stdout.write('Fixed select cancellation materials passed: ' + ACTIONSHEET_SHA256 + ', ' + SELECT_SHA256 + '\n');
