'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function createController() {
  const nodes = new Map();
  function node(tag, options) {
    const result = {
      tagName: tag, customName: options && options.is, className: options && options.is ? 'emby-button native-theme-class' : '',
      textContent: '', disabled: false, hidden: false, attributes: {}, listeners: [], children: [],
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] || null; },
      addEventListener(name, listener) { this.listeners.push([name, listener]); },
      appendChild(child) { this.children.push(child); this.firstChild = this.children[0] || null; },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); this.firstChild = this.children[0] || null; }
    };
    result.classList = {add(name) { result.className += ' ' + name; }};
    return result;
  }
  const view = {querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }};
  function BaseView() {}
  BaseView.prototype.onResume = function () {};
  BaseView.prototype.onPause = function () {};
  let AboutView;
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/electronapp/plugins/mpvplayer/about.js'), 'utf8');
  const context = {
    define(_dependencies, factory) {
      AboutView = factory({show() {}, hide() {}}, BaseView, {create: () => ({resume() {}, pause() {}, dispose() {}})});
    },
    window: {ipc: {invoke: async () => ({status: 'ok', candidates: [], selectedCandidateId: null})}},
    document: {createElement: (tag, options) => node(tag, options)}
  };
  vm.runInNewContext(source, context, {filename: 'about.js'});
  return {controller: new AboutView(view), view, nodes};
}

test('invalid pending state does not claim a running candidate is the fixed baseline', () => {
  const {controller, view} = createController();
  controller.renderKernelStatus({
    status: 'ok', selectionState: 'invalid', selectedCandidateId: null,
    candidates: [{candidateId: 'a'.repeat(64), version: 'mpv v0.42.0', sizeBytes: 123}],
    runtime: {activeCandidateId: 'a'.repeat(64), effectiveCandidateId: 'a'.repeat(64), activationState: 'candidate-active'}
  });
  const message = view.querySelector('.aboutKernelState').textContent;
  assert.match(message, /下次启动选择状态无效/);
  assert.match(message, /当前进程仍使用已启动候选/);
  assert.doesNotMatch(message, /固定基线/);
  const card = view.querySelector('.aboutKernelCandidates').children[0];
  assert.equal(card.children[0].children[1].disabled, true, 'invalid state requires explicit baseline repair before candidate selection');
});

test('candidate actions retain native button classes and selection identity while technical evidence starts collapsed', () => {
  const {controller, view} = createController();
  const id = 'e'.repeat(64), selected = [];
  controller.selectKernel = value => selected.push(value);
  controller.renderKernelStatus({status: 'ok', selectionState: 'valid', selectedCandidateId: null,
    candidates: [{candidateId: id, version: '<mpv-test>', sizeBytes: 1024}],
    runtime: {activeCandidateId: null, effectiveCandidateId: null, activationState: 'baseline-lazy'}});
  const card = view.querySelector('.aboutKernelCandidates').children[0], content = card.children[0];
  const body = content.children[0], button = content.children[1], details = body.children[2];
  assert.match(card.className, /listItem-border/);
  assert.equal(button.customName, 'emby-button');
  assert.match(button.className, /native-theme-class/);
  assert.match(button.className, /emby-button/);
  assert.equal(button.disabled, false);
  button.listeners.find(event => event[0] === 'click')[1]();
  assert.deepEqual(selected, [id]);
  assert.equal(body.children[0].textContent, '<mpv-test>');
  assert.equal(details.tagName, 'details');
  assert.ok(!details.open);
  assert.equal(details.children[1].children[1].textContent, id);
  assert.match(details.children[2].textContent, /NOT_ASSESSED/);
  assert.match(details.children[3].textContent, /UNKNOWN/);
});

test('visible kernel rows distinguish current process from the next startup selection', () => {
  const {controller, view} = createController();
  const oldId = 'a'.repeat(64), newId = 'b'.repeat(64);
  const result = {status: 'ok', selectionState: 'valid', selectedCandidateId: newId,
    candidates: [{candidateId: oldId, version: 'mpv-old'}, {candidateId: newId, version: 'mpv-new'}],
    runtime: {activeCandidateId: oldId, effectiveCandidateId: oldId, activationState: 'candidate-active'}};
  controller.renderKernelStatus(result);
  assert.equal(view.querySelector('.aboutKernelCurrent').textContent, 'mpv-old');
  assert.equal(view.querySelector('.aboutKernelNext').textContent, 'mpv-new');
  assert.match(view.querySelector('.aboutKernelState').textContent, /当前运行内核保持不变/);
  result.selectedCandidateId = oldId;
  controller.renderKernelStatus(result);
  assert.match(view.querySelector('.aboutKernelState').textContent, /通过启动校验/);
  assert.equal(view.querySelector('.aboutKernelCandidates').children[0].children[0].children[1].disabled, true);
  result.selectedCandidateId = null;
  controller.renderKernelStatus(result);
  assert.equal(view.querySelector('.aboutKernelCurrent').textContent, 'mpv-old');
  assert.equal(view.querySelector('.aboutKernelNext').textContent, '内置内核');
  controller.renderKernelStatus({status: 'ok', candidates: [], runtime: null});
  assert.equal(view.querySelector('.aboutKernelCurrent').textContent, 'UNKNOWN');
  assert.equal(view.querySelector('.aboutKernelNext').textContent, 'UNKNOWN');
});

test('invalid pending state with no active candidate reports the frozen baseline choice', () => {
  const {controller, view} = createController();
  controller.renderKernelStatus({
    status: 'ok', selectionState: 'invalid', selectedCandidateId: null, candidates: [],
    runtime: {activeCandidateId: null, effectiveCandidateId: null, activationState: 'baseline-lazy'}
  });
  const message = view.querySelector('.aboutKernelState').textContent;
  assert.match(message, /本次启动选择固定基线/);
  assert.match(message, /显式选择固定基线可修复/);
});

test('unavailable candidate management keeps baseline playback controls and reports the concrete boundary', () => {
  const {controller, view} = createController();
  controller.renderKernelStatus({status: 'unavailable', reason: 'store-unavailable'});
  assert.match(view.querySelector('.aboutKernelState').textContent, /候选存储不可用/);
  assert.equal(view.querySelector('.btnImportKernel').disabled, true);
  assert.equal(view.querySelector('.btnSelectBaseline').disabled, true);

  controller.renderKernelStatus({status: 'unavailable', reason: 'package-identity-unavailable'});
  assert.match(view.querySelector('.aboutKernelState').textContent, /Helper 身份未能通过 provenance\/hash 校验/);
  assert.equal(view.querySelector('.btnImportKernel').disabled, true);
});

test('About keeps import and select errors visible across status refresh, cancel, and later success', async () => {
  const nodes = new Map();
  function node() {
    return {
      textContent: '', disabled: false, hidden: false, attributes: {}, listeners: [], children: [],
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] || null; },
      addEventListener(name, listener) { this.listeners.push([name, listener]); },
      appendChild(child) { this.children.push(child); this.firstChild = this.children[0] || null; },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); this.firstChild = this.children[0] || null; }
    };
  }
  const view = {querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); }};
  function BaseView() {}
  BaseView.prototype.onResume = function () {};
  BaseView.prototype.onPause = function () {};
  let importResult = {status: 'error', reason: 'zip-invalid'};
  let selectResult = {status: 'error', reason: 'state-write-failed'};
  let kernelStatus = {status: 'ok', selectionState: 'missing', selectedCandidateId: null,
    candidates: [], lastActivation: null, runtime: {activeCandidateId: null, effectiveCandidateId: null, activationState: 'baseline-lazy'}};
  const invocations = [];
  let AboutView;
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/electronapp/plugins/mpvplayer/about.js'), 'utf8');
  const context = {
    define(_dependencies, factory) { AboutView = factory({show() {}, hide() {}}, BaseView, {create: () => ({resume() {}, pause() {}, dispose() {}})}); },
    window: {ipc: {invoke: async channel => {
      invocations.push(channel);
      if (channel === 'enhanced-mpv-kernel-import') return importResult;
      if (channel === 'enhanced-mpv-kernel-select') return selectResult;
      if (channel === 'enhanced-mpv-kernel-status') return kernelStatus;
      return {status: 'ok'};
    } }},
    document: {createElement: () => node()}
  };
  vm.runInNewContext(source, context, {filename: 'about.js'});
  const controller = new AboutView(view);
  const operationState = view.querySelector('.aboutKernelOperationState');
  controller.renderKernelStatus({status: 'ok', selectionState: 'missing', selectedCandidateId: null,
    candidates: [], lastActivation: null,
    runtime: {activeCandidateId: null, effectiveCandidateId: null, activationState: 'baseline-lazy'}});
  const summaryBefore = view.querySelector('.aboutKernelState').textContent;
  assert.match(summaryBefore, /固定基线/);
  kernelStatus = {status: 'ok', selectionState: 'invalid', selectedCandidateId: null, candidates: [], lastActivation: null,
    runtime: {activeCandidateId: 'd'.repeat(64), effectiveCandidateId: 'd'.repeat(64), activationState: 'candidate-active'}};
  await controller.loadKernelStatus();
  assert.match(view.querySelector('.aboutKernelState').textContent, /当前进程仍使用已启动候选/);

  await controller.importKernel();
  assert.match(operationState.textContent, /zip-invalid/);
  assert.equal(operationState.getAttribute('role'), 'alert');
  assert.ok(invocations.includes('enhanced-mpv-kernel-status'));
  assert.match(view.querySelector('.aboutKernelState').textContent, /当前进程仍使用已启动候选/,
    'status refresh reports active candidate identity independently of operation error');

  importResult = {status: 'cancelled'};
  await controller.importKernel();
  assert.match(operationState.textContent, /zip-invalid/, 'cancel does not erase a prior import error');
  assert.equal(operationState.getAttribute('role'), 'alert');

  importResult = {status: 'imported', candidate: {candidateId: 'c'.repeat(64)}};
  await controller.importKernel();
  assert.match(operationState.textContent, /已导入/);
  assert.equal(operationState.getAttribute('role'), 'status');

  await controller.selectBaseline();
  assert.match(operationState.textContent, /state-write-failed/);
  assert.equal(operationState.getAttribute('role'), 'alert');
  selectResult = {status: 'selected', selectedCandidateId: null, pendingRestart: true};
  await controller.selectBaseline();
  assert.match(operationState.textContent, /下次启动选择已保存/);
  assert.equal(operationState.getAttribute('role'), 'status');
  assert.equal(invocations.filter(channel => channel === 'enhanced-mpv-kernel-status').length, 6);
});
