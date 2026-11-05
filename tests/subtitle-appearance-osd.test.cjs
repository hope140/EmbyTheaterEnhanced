'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {fileURLToPath, pathToFileURL} = require('node:url');
const {patchVideoOsd: patchLifecycle} = require('../tools/patch-videoosd-lifecycle.cjs');
const {patchVideoOsd: patchAppearance} = require('../tools/patch-subtitle-appearance.cjs');

const root = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/videoosd/videoosd.js'), 'utf8');
const result = patchAppearance(patchLifecycle(original));

test('source-bound VideoOSD renders only eligible local text subtitle appearance controls', () => {
  new vm.Script(result, {filename: 'videoosd.js'});
  const start = result.indexOf('  function canAdjustSubtitleAppearance(');
  const end = result.indexOf('  function destroySubtitleOffsetOverlay(', start);
  assert.ok(start > 0 && end > start);
  const eligible = vm.runInNewContext(result.slice(start, end) + '\ncanAdjustSubtitleAppearance');
  const local = {isLocalPlayer: true, applySubtitleAppearance() {}};
  assert.equal(eligible(local, {Codec: 'subrip', IsTextSubtitleStream: true}), true);
  assert.equal(eligible(local, {Codec: 'ass', IsTextSubtitleStream: true}), false);
  assert.equal(eligible(local, {Codec: 'hdmv_pgs_subtitle', IsTextSubtitleStream: false}), false);
  assert.equal(eligible({isLocalPlayer: false, applySubtitleAppearance() {}}, {Codec: 'subrip'}), false);
  assert.equal(eligible(local, null), false);
  assert.equal(result.includes('id: "subtitleappearance"'), true);
  assert.equal(result.includes('player !== self.currentPlayer'), true);
  // Alameda's global require resolves .js URLs from the document (www/index.html),
  // not from the videoosd module that invokes it.
  const modulePath = path.resolve(root, 'src/electronapp/www', '../enhanced/subtitle-appearance-dialog.js');
  assert.equal(modulePath, path.join(root, 'src/electronapp/enhanced/subtitle-appearance-dialog.js'));
});

test('appearance OSD patcher refuses stale or duplicated transform anchors', () => {
  assert.throws(() => patchAppearance(result.replace('  function destroySubtitleOffsetOverlay(instance) {', '  function changedOffsetOverlay(instance) {')), /source contract mismatch/);
  assert.throws(() => patchAppearance(result), /source contract mismatch/);
});

test('subtitle menu click loads the real dialog through Alameda and opens it', async () => {
  // Match the packaged renderer: app.js sets Alameda's baseUrl to the www
  // document URL, and the global require used by VideoOSD has no module base.
  assert.match(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/app.js'), 'utf8'),
    /customPaths\.baseUrl = baseRoute/);
  class Element {
    constructor() {
      this.children = [];
      this.attributes = {};
      this.style = {};
      this.classList = {add() {}, toggle() {}};
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    appendChild(child) { child.parentNode = this; this.children.push(child); }
    addEventListener() {}
    querySelector(selector) {
      const name = /^\[data-setting="([^"]+)"\]$/.exec(selector)?.[1];
      if (!name) return null;
      for (const child of this.children) {
        if (child.attributes['data-setting'] === name) return child;
        const match = child.querySelector(selector);
        if (match) return match;
      }
      return null;
    }
  }
  const documentUrl = pathToFileURL(path.join(root, 'src/electronapp/www/index.html'));
  assert.equal(fs.existsSync(fileURLToPath(new URL('../../enhanced/subtitle-appearance-dialog.js', documentUrl))), false);
  const requested = [];
  let context;
  const document = {
    createElement() { return new Element(); },
    head: {appendChild(script) {
      if (script.attributes.href) {
        const cssPath = fileURLToPath(new URL(script.attributes.href, documentUrl));
        assert.equal(cssPath, path.join(root, 'src/electronapp/enhanced/subtitle-appearance-dialog.css'));
        assert.ok(fs.existsSync(cssPath));
        setImmediate(() => script.onload());
        return;
      }
      const url = new URL(script.src, documentUrl);
      requested.push(fileURLToPath(url));
      setImmediate(() => {
        if (!fs.existsSync(fileURLToPath(url))) {
          script.listeners.error();
          return;
        }
        vm.runInContext(fs.readFileSync(fileURLToPath(url), 'utf8'), context, {filename: fileURLToPath(url)});
        script.listeners.load();
      });
    }}
  };
  document.createElement = () => {
    const element = new Element();
    element.listeners = {};
    element.addEventListener = (event, listener) => { element.listeners[event] = listener; };
    return element;
  };
  let resolveOpen;
  const opened = new Promise(resolve => { resolveOpen = resolve; });
  const dialogHelper = {
    createDialog() { return new Element(); },
    open(dialog) { resolveOpen(dialog); return new Promise(() => {}); },
    close() {}
  };
  context = vm.createContext({document, console, Promise, setTimeout, clearTimeout, setImmediate});
  vm.runInContext(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/alameda/alameda.js'), 'utf8'), context);
  context.require.config({baseUrl: documentUrl.href.replace(/index\.html$/, '')});
  const dependencies = {
    dialogHelper, globalize: {translate: key => key, getCurrentLocales: () => ['zh-CN']},
    userSettings: {getSubtitleAppearanceSettings: () => ({}), setSubtitleAppearanceSettings() {}},
    'emby-select': {}, 'paper-icon-button-light': {}, 'emby-scroller': {}, formDialogStyle: {}
  };
  for (const [name, value] of Object.entries(dependencies)) context.define(name, [], value);
  const player = {isLocalPlayer: true, applySubtitleAppearance() {}};
  const self = {currentPlayer: player, subtitleAppearanceDialog: null};
  context.id = 'subtitleappearance';
  context.player = player;
  context.self = self;
  context._playbackmanager = {default: {getSubtitleStream: () => ({Codec: 'subrip', IsTextSubtitleStream: true})}};
  const branchStart = result.indexOf('                      if (id === "subtitleappearance") {');
  const branchEnd = result.indexOf('                      var item,', branchStart);
  assert.ok(branchStart > 0 && branchEnd > branchStart);
  const eligibleStart = result.indexOf('  function canAdjustSubtitleAppearance(');
  const eligibleEnd = result.indexOf('  function destroySubtitleOffsetOverlay(', eligibleStart);
  context.canAdjustSubtitleAppearance = vm.runInContext(result.slice(eligibleStart, eligibleEnd) + '\ncanAdjustSubtitleAppearance', context);
  context.destroySubtitleAppearanceDialog = () => {};
  vm.runInContext('(function(){' + result.slice(branchStart, branchEnd) + '})()', context);
  const dialog = await Promise.race([
    opened,
    new Promise((_, reject) => setTimeout(() => reject(new Error('subtitle dialog did not open')), 1000))
  ]);
  assert.equal(self.subtitleAppearanceDialog !== null, true);
  assert.equal(dialog.children.length, 2);
  for (const field of ['textSize', 'textColor', 'dropShadow', 'textBackground', 'textBackgroundOpacity']) {
    assert.ok(dialog.querySelector('[data-setting="' + field + '"]'), field + ' field missing');
  }
  const choices = field => dialog.querySelector('[data-setting="' + field + '"]').children.map(item => item.textContent);
  assert.ok(choices('textColor').includes('白色'));
  assert.ok(choices('textBackground').includes('透明'));
  assert.ok(choices('dropShadow').includes('标准描边'));
  assert.deepEqual(requested, [path.join(root, 'src/electronapp/enhanced/subtitle-appearance-dialog.js')]);
});
