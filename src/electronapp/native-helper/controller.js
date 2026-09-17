'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const PROTOCOL_VERSION = 1;
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_RECEIVE_BUFFER = 128 * 1024;
// stdout is dispatched synchronously; allow one full OS read burst while still
// bounding pathological tiny-frame amplification.
const MAX_INBOUND_FRAMES = 1024;
const MAX_INBOUND_BYTES = 256 * 1024;
const MAX_OUTBOUND_FRAMES = 128;
const MAX_OUTBOUND_BYTES = 256 * 1024;
const ACTIVE_CLIENTS = new Set();
let globalGenerationId = 100;

class ProtocolFailure extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProtocolFailure';
    this.code = code;
  }
}

function encodeFrame(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  if (!payload.length || payload.length > MAX_FRAME_BYTES) throw new ProtocolFailure('invalid-frame-size');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

class FrameDecoder {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.failed = false;
    this.decoder = new TextDecoder('utf-8', { fatal: true });
  }
  push(chunk) {
    if (this.failed) throw new ProtocolFailure('decoder-failed');
    if (this.buffer.length + chunk.length > MAX_RECEIVE_BUFFER) return this.fail('receive-buffer-limit');
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (!length) return this.fail('zero-length-frame');
      if (length > MAX_FRAME_BYTES) return this.fail('oversized-frame');
      if (this.buffer.length < length + 4) break;
      const payload = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      let text;
      try { text = this.decoder.decode(payload); } catch (_) { return this.fail('invalid-utf8'); }
      let message;
      try { message = JSON.parse(text); } catch (_) { return this.fail('malformed-json'); }
      try { validateIncoming(message); }
      catch (error) { return this.fail(error.code || error.message); }
      messages.push(message);
      if (messages.length > MAX_INBOUND_FRAMES) return this.fail('inbound-frame-limit');
      if (messages.reduce((total, item) => total + Buffer.byteLength(JSON.stringify(item), 'utf8') + 4, 0) > MAX_INBOUND_BYTES) return this.fail('inbound-byte-limit');
    }
    return messages;
  }
  fail(code) {
    this.failed = true;
    throw new ProtocolFailure(code);
  }
}

function validateIncoming(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new ProtocolFailure('message-not-object');
  if (message.protocolVersion !== PROTOCOL_VERSION) throw new ProtocolFailure('unsupported-protocol-version');
  if (typeof message.helperInstanceId !== 'string' || !message.helperInstanceId) throw new ProtocolFailure('missing-helper-instance-id');
  if (!['response', 'event', 'lifecycle', 'error'].includes(message.type)) throw new ProtocolFailure('unknown-message-type');
  if (message.type === 'response') {
    if (!Number.isSafeInteger(message.generationId) || message.generationId <= 0) throw new ProtocolFailure('missing-generation-id');
    if (!Number.isSafeInteger(message.requestId) || message.requestId <= 0) throw new ProtocolFailure('missing-request-id');
  }
  if (message.type === 'event') {
    if (!['helper', 'generation'].includes(message.scope)) throw new ProtocolFailure('invalid-event-scope');
    if (message.scope === 'generation' && (!Number.isSafeInteger(message.generationId) || message.generationId <= 0)) throw new ProtocolFailure('missing-generation-id');
    if (typeof message.name !== 'string' || !message.name) throw new ProtocolFailure('missing-event-name');
    if (message.name === 'operation-error') {
      if (message.scope !== 'generation') throw new ProtocolFailure('invalid-operation-error-scope');
      if (!['set-property', 'command'].includes(message.operation)) throw new ProtocolFailure('invalid-operation-error-operation');
      if (!Number.isSafeInteger(message.errorCode) || message.errorCode >= 0) throw new ProtocolFailure('invalid-operation-error-code');
      if (typeof message.error !== 'string' || !message.error || message.error.length > 256) throw new ProtocolFailure('invalid-operation-error-message');
      if (message.fatal !== false) throw new ProtocolFailure('invalid-operation-error-fatality');
      if (message.operation === 'set-property' &&
          (typeof message.property !== 'string' || !message.property || message.property.length > 128)) throw new ProtocolFailure('invalid-operation-error-property');
      if (message.operation === 'command' && Object.hasOwn(message, 'property')) throw new ProtocolFailure('unexpected-operation-error-property');
    }
  }
  if (message.type === 'lifecycle') {
    if (message.scope !== 'helper') throw new ProtocolFailure('invalid-lifecycle-scope');
    if (typeof message.name !== 'string' || !message.name) throw new ProtocolFailure('missing-lifecycle-name');
  }
  if (message.type === 'error' && Object.hasOwn(message, 'requestId')) {
    if (!Number.isSafeInteger(message.requestId) || message.requestId <= 0) throw new ProtocolFailure('missing-request-id');
    if (!Number.isSafeInteger(message.generationId) || message.generationId <= 0) throw new ProtocolFailure('missing-generation-id');
    if (typeof message.code !== 'string' || !message.code) throw new ProtocolFailure('missing-error-code');
  }
}

function monotonicMicros() {
  return Number(process.hrtime.bigint() / 1000n);
}

class NativeHelperClient {
  constructor(options) {
    this.helperPath = options.helperPath;
    this.libmpvPath = options.libmpvPath;
    this.parentWindowHandle = String(options.parentWindowHandle || '');
    this.helperInstanceId = options.helperInstanceId || crypto.randomUUID();
    this.requestTimeoutMs = options.requestTimeoutMs || 5000;
    this.readyTimeoutMs = options.readyTimeoutMs || 15000;
    this.expectedLibmpvVersion = options.expectedLibmpvVersion || null;
    this.decoder = new FrameDecoder();
    this.pending = new Map();
    this.nextRequestId = 0;
    if (Number.isSafeInteger(options.generationStart) && options.generationStart > globalGenerationId) globalGenerationId = options.generationStart;
    this.generationCounter = globalGenerationId;
    this.currentGenerationId = null;
    this.currentLabel = null;
    this.state = { status: 'idle', path: null, playing: false, fileLoaded: false };
    this.timeline = [];
    this.requestHistory = [];
    this.operationErrors = [];
    this.closeOrdering = [];
    this.stderrChunks = [];
    this.stderrRetainedBytes = 0;
    this.stderrObservedBytes = 0;
    this.maxStderrRetainedBytes = options.maxStderrRetainedBytes || 64 * 1024;
    this.exited = false;
    this.transportTerminated = false;
    this.protocolFailure = null;
    this.handshake = null;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.onTerminal = typeof options.onTerminal === 'function' ? options.onTerminal : () => {};
    this.outboundQueue = [];
    this.outboundBytes = 0;
    this.writeBlocked = false;
  }

  async start() {
    if (!/^\d+$/.test(this.parentWindowHandle)) throw new ProtocolFailure('invalid-parent-window-handle');
    this.child = spawn(this.helperPath, [this.libmpvPath, this.helperInstanceId, this.parentWindowHandle], {
      windowsHide: true,
      detached: false,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    ACTIVE_CLIENTS.add(this);
    this.child.stdin.on('error', error => this.onTransportTerminal('stdin-error', error.code || error.message));
    this.child.stdin.on('close', () => this.onTransportTerminal('stdin-close'));
    this.child.stdin.on('drain', () => this.flushOutbound());
    this.child.stdout.on('data', chunk => this.onStdout(chunk));
    this.child.stdout.on('error', error => this.onTransportTerminal('stdout-error', error.code || error.message));
    this.child.stdout.on('end', () => this.onTransportTerminal('stdout-end'));
    this.child.stdout.on('close', () => this.onTransportTerminal('stdout-close'));
    this.child.stderr.on('data', chunk => this.onStderr(chunk));
    this.child.stderr.on('end', () => this.recordClose('stderr-end'));
    this.child.stderr.on('close', () => this.recordClose('stderr-close'));
    this.exitPromise = new Promise(resolve => {
      let settled = false;
      const settleExit = result => {
        if (settled) return;
        settled = true;
        this.exited = true;
        ACTIVE_CLIENTS.delete(this);
        resolve(result);
      };
      this.child.once('exit', (code, signal) => {
        this.recordClose('process-exit', { code, signal });
        this.onTransportTerminal('process-exit-terminal', `${code}:${signal || ''}`);
        settleExit({ code, signal });
      });
      this.child.once('error', error => {
        this.onTransportTerminal('process-error', error.message);
        settleExit({ code: null, signal: null, error: error.message });
      });
      this.child.once('close', (code, signal) => this.recordClose('process-close', { code, signal }));
    });
    try {
      await Promise.race([
        this.waitFor(() => this.timeline.some(item => item.name === 'ready' && item.action === 'ACCEPT_HELPER_GLOBAL'), this.readyTimeoutMs, 'helper-ready'),
        this.exitPromise.then(exit => { throw new Error(`helper-start-failed:${exit.error || exit.code || exit.signal || 'closed'}`); }),
      ]);
      if (!this.handshake || this.handshake.protocolVersion !== PROTOCOL_VERSION ||
          typeof this.handshake.helperVersion !== 'string' || !this.handshake.helperVersion ||
          typeof this.handshake.libmpvVersion !== 'string' || this.handshake.mpvClientApiVersion !== 131077 ||
          this.handshake.surfaceAttached !== true || !Array.isArray(this.handshake.capabilities)) {
        throw new ProtocolFailure('invalid-helper-handshake');
      }
      const requiredCapabilities = ['private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution'];
      if (!requiredCapabilities.every(capability => this.handshake.capabilities.includes(capability)) ||
          !this.handshake.queueLimits || !Number.isSafeInteger(this.handshake.queueLimits.maxPendingFrames) ||
          !Number.isSafeInteger(this.handshake.queueLimits.maxPendingBytes)) {
        throw new ProtocolFailure('missing-helper-capability');
      }
      if (this.expectedLibmpvVersion && this.handshake.libmpvVersion !== this.expectedLibmpvVersion) {
        throw new ProtocolFailure('unexpected-libmpv-version');
      }
    } catch (error) {
      try { await this.kill(); } catch (_) { }
      throw error;
    }
    return this;
  }

  recordClose(name, detail = null) {
    this.closeOrdering.push({ atParentMicros: monotonicMicros(), name, detail });
  }

  onTransportTerminal(name, detail = null) {
    this.recordClose(name, detail);
    if (this.transportTerminated) return;
    this.transportTerminated = true;
    this.terminateAll('HELPER_DIED', `transport:${name}${detail ? `:${detail}` : ''}`);
    try { this.onTerminal({ name, detail }); } catch (_) { /* diagnostics callback is isolated */ }
  }

  onStderr(chunk) {
    this.stderrObservedBytes += chunk.length;
    this.stderrChunks.push(Buffer.from(chunk));
    this.stderrRetainedBytes += chunk.length;
    while (this.stderrRetainedBytes > this.maxStderrRetainedBytes && this.stderrChunks.length) {
      const removed = this.stderrChunks.shift();
      this.stderrRetainedBytes -= removed.length;
    }
  }

  onStdout(chunk) {
    if (this.transportTerminated || this.protocolFailure) {
      this.recordClose('stdout-after-terminal', { bytes: chunk.length });
      return;
    }
    let messages;
    try { messages = this.decoder.push(chunk); }
    catch (error) {
      this.protocolFailure = error.code || error.message;
      this.recordClose('protocol-failure', this.protocolFailure);
      this.terminateAll('HELPER_DIED', `protocol:${this.protocolFailure}`);
      if (this.child && this.child.exitCode === null) this.child.kill();
      return;
    }
    for (const message of messages) this.dispatch(message);
  }

  dispatch(message) {
    const base = {
      atParentMicros: monotonicMicros(),
      helperInstanceId: message.helperInstanceId,
      generationId: message.generationId ?? null,
      requestId: message.requestId ?? null,
      rawEventId: message.rawEventId ?? null,
      rawEventName: message.rawEventName ?? null,
      mediaIdentity: message.mediaIdentity ?? null,
      name: message.name || message.type,
      currentAuthoritativeGeneration: this.currentGenerationId
    };
    if (this.transportTerminated || this.exited || this.protocolFailure) {
      this.timeline.push({ ...base, action: 'DROP_TRANSPORT_TERMINAL' });
      return;
    }
    if (message.helperInstanceId !== this.helperInstanceId) {
      this.timeline.push({ ...base, action: 'DROP_STALE_HELPER' });
      return;
    }
    if (message.type === 'response' || message.type === 'error') {
      const pending = this.pending.get(message.requestId);
      if (!pending || pending.generationId !== message.generationId) {
        this.timeline.push({ ...base, action: 'DROP_UNKNOWN_OR_TERMINAL_REQUEST' });
        return;
      }
      this.pending.delete(message.requestId);
      clearTimeout(pending.timer);
      const state = message.type === 'response' ? 'RESOLVED' : 'FAILED';
      this.finishRequest(pending, state, message.type === 'response' ? message.result : message.code);
      this.timeline.push({ ...base, action: message.type === 'response' ? 'RESOLVE_REQUEST' : 'REJECT_REQUEST' });
      return;
    }
    if (message.type === 'lifecycle' || message.scope === 'helper') {
      const action = message.name === 'unattributed-native-event' ? 'DROP_UNATTRIBUTED' : 'ACCEPT_HELPER_GLOBAL';
      this.timeline.push({ ...base, action, reason: message.reason || null, detail: message.detail || null });
      if (message.name === 'ready') this.handshake = message.detail || null;
      return;
    }
    if (message.type === 'event') {
      if (message.generationId !== this.currentGenerationId) {
        this.timeline.push({ ...base, action: 'DROP_STALE_GENERATION', value: message.value });
        return;
      }
      if (message.name === 'operation-error') {
        const operationError = {
          generationId: message.generationId,
          operation: message.operation,
          property: message.property || null,
          errorCode: message.errorCode,
          error: message.error,
          fatal: false
        };
        this.operationErrors.push(operationError);
        if (this.operationErrors.length > 64) this.operationErrors.shift();
        this.timeline.push({ ...base, action: 'ACCEPT_OPERATION_ERROR', operation: message.operation, property: message.property || null, errorCode: message.errorCode });
        try { this.onEvent(message); } catch (_) { /* consumer errors cannot corrupt transport state */ }
        return;
      }
      this.timeline.push({ ...base, action: 'ACCEPT', value: message.value });
      if (message.name === 'start-file') this.state.status = 'loading';
      if (message.name === 'file-loaded') { this.state.fileLoaded = true; this.state.status = 'loaded'; }
      if (message.name === 'path') this.state.path = message.value;
      if (message.name === 'core-idle' && message.value === false) { this.state.playing = true; this.state.status = 'playing'; }
      if (message.name === 'core-idle' && message.value === true) this.state.playing = false;
      if (message.name === 'end-file') { this.state.playing = false; if (this.currentGenerationId !== null) this.state.status = 'ended'; }
      try { this.onEvent(message); } catch (_) { /* consumer errors cannot corrupt transport state */ }
    }
  }

  beginGeneration(label, observedProperties = []) {
    if (this.currentGenerationId !== null) this.retireGeneration('superseded');
    this.currentGenerationId = this.allocateGenerationId();
    this.currentLabel = label;
    this.state = { status: 'loading', path: null, playing: false, fileLoaded: false };
    this.timeline.push({ atParentMicros: monotonicMicros(), helperInstanceId: this.helperInstanceId, generationId: this.currentGenerationId, requestId: null, rawEventId: null, rawEventName: null, mediaIdentity: null, name: 'generation-begin', currentAuthoritativeGeneration: this.currentGenerationId, action: 'BEGIN_GENERATION', label });
    this.command('activate-generation', { properties: observedProperties }, this.currentGenerationId);
    return this.currentGenerationId;
  }

  retireGeneration(reason) {
    const retired = this.currentGenerationId;
    if (retired === null) return;
    for (const pending of [...this.pending.values()]) {
      if (pending.generationId === retired && pending.mediaScoped) {
        this.pending.delete(pending.requestId); clearTimeout(pending.timer); this.finishRequest(pending, 'GENERATION_RETIRED', reason);
      }
    }
    try { this.command('retire-generation', {}, retired); } catch (_) { /* local retirement remains authoritative */ }
    this.timeline.push({ atParentMicros: monotonicMicros(), helperInstanceId: this.helperInstanceId, generationId: retired, requestId: null, rawEventId: null, rawEventName: null, mediaIdentity: null, name: 'generation-retired', currentAuthoritativeGeneration: null, action: 'RETIRE_GENERATION', reason });
    this.currentGenerationId = null;
    this.currentLabel = null;
  }

  request(method, params = {}, options = {}) {
    const generationId = options.generationId || this.currentGenerationId || this.allocateGenerationId();
    const requestId = ++this.nextRequestId;
    const timeoutMs = options.timeoutMs || this.requestTimeoutMs;
    const pending = { requestId, generationId, method, mediaScoped: options.mediaScoped !== false, state: 'CREATED', terminalTransitions: 0, deadlineMicros: monotonicMicros() + timeoutMs * 1000 };
    const promise = new Promise((resolve, reject) => { pending.resolve = resolve; pending.reject = reject; });
    promise.requestId = requestId; promise.generationId = generationId;
    pending.state = 'SENT';
    if (this.transportTerminated || this.exited || !this.child || !this.child.stdin || !this.child.stdin.writable) {
      this.finishRequest(pending, 'HELPER_DIED', 'transport-unavailable');
      return promise;
    }
    const expire = () => {
      const remaining = pending.deadlineMicros - monotonicMicros();
      if (remaining > 0) { pending.timer = setTimeout(expire, Math.max(1, Math.ceil(remaining / 1000))); return; }
      if (!this.pending.delete(requestId)) return;
      this.finishRequest(pending, 'TIMED_OUT', 'absolute-deadline');
    };
    pending.timer = setTimeout(expire, timeoutMs);
    this.pending.set(requestId, pending);
    try {
      this.sendEnvelope({ protocolVersion: PROTOCOL_VERSION, type: 'request', helperInstanceId: this.helperInstanceId, generationId, requestId, method, params });
    } catch (error) {
      if (this.pending.delete(requestId)) { clearTimeout(pending.timer); this.finishRequest(pending, 'HELPER_DIED', error.message); }
    }
    return promise;
  }

  command(method, params = {}, generationId = this.currentGenerationId || this.allocateGenerationId()) {
    if (this.transportTerminated || this.exited || !this.child || !this.child.stdin || !this.child.stdin.writable) throw new ProtocolFailure('transport-unavailable');
    this.sendEnvelope({ protocolVersion: PROTOCOL_VERSION, type: 'command', helperInstanceId: this.helperInstanceId, generationId, method, params });
  }

  sendEnvelope(message) {
    const frame = encodeFrame(message);
    if (this.writeBlocked || this.outboundQueue.length) {
      if (this.outboundQueue.length + 1 > MAX_OUTBOUND_FRAMES || this.outboundBytes + frame.length > MAX_OUTBOUND_BYTES) {
        this.onTransportTerminal('outbound-queue-limit');
        if (this.child && this.child.exitCode === null) this.child.kill();
        throw new ProtocolFailure('outbound-queue-limit');
      }
      this.outboundQueue.push(frame);
      this.outboundBytes += frame.length;
      return;
    }
    this.writeBlocked = !this.child.stdin.write(frame);
  }

  flushOutbound() {
    if (this.transportTerminated || !this.child || !this.child.stdin || !this.child.stdin.writable) return;
    this.writeBlocked = false;
    while (!this.writeBlocked && this.outboundQueue.length) {
      const frame = this.outboundQueue.shift();
      this.outboundBytes -= frame.length;
      this.writeBlocked = !this.child.stdin.write(frame);
    }
  }

  allocateGenerationId() {
    globalGenerationId = Math.max(globalGenerationId, this.generationCounter) + 1;
    this.generationCounter = globalGenerationId;
    return globalGenerationId;
  }

  cancelRequest(requestId, reason = 'cancelled') {
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    this.pending.delete(requestId);
    clearTimeout(pending.timer);
    this.finishRequest(pending, 'CANCELLED', reason);
    return true;
  }

  load(args) {
    if (this.currentGenerationId === null) throw new ProtocolFailure('generation-required');
    const generationId = this.currentGenerationId;
    const promise = this.request('load', { args }, { generationId, mediaScoped: true });
    promise.catch(() => { /* The service observes media failure; suppress an unhandled rejection for fire-and-forget callers. */ });
    return { generationId, promise };
  }

  submitCommand(args) {
    if (this.currentGenerationId === null) throw new ProtocolFailure('generation-required');
    this.command('command', { args }, this.currentGenerationId);
  }

  setProperty(name, value) {
    if (this.currentGenerationId === null) throw new ProtocolFailure('generation-required');
    this.command('set-property', { name, value }, this.currentGenerationId);
  }

  getProperty(name, timeoutMs) {
    const generationId = this.currentGenerationId || this.allocateGenerationId();
    return this.request('get-property', { name }, { generationId, mediaScoped: this.currentGenerationId !== null, timeoutMs })
      .then(result => result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : null);
  }

  async stop() {
    this.retireGeneration('stop');
    this.state = { status: 'stopped', path: null, playing: false, fileLoaded: false };
    const stopGeneration = this.allocateGenerationId();
    return this.request('stop', {}, { generationId: stopGeneration, mediaScoped: false });
  }

  finishRequest(pending, state, detail) {
    if (pending.terminalTransitions) return;
    pending.terminalTransitions++;
    pending.state = state;
    this.requestHistory.push({ requestId: pending.requestId, generationId: pending.generationId, method: pending.method, state, detail, terminalTransitions: pending.terminalTransitions });
    if (state === 'RESOLVED') pending.resolve(detail);
    else { const error = new Error(String(detail || state)); error.state = state; pending.reject(error); }
  }

  terminateAll(state, reason) {
    for (const pending of [...this.pending.values()]) {
      this.pending.delete(pending.requestId); clearTimeout(pending.timer); this.finishRequest(pending, state, reason);
    }
  }

  sendRaw(buffer) { this.child.stdin.write(buffer); }
  closeWriteSide() { this.child.stdin.end(); }
  closeReadSide() { this.child.stdout.destroy(); }
  pauseRead() { this.child.stdout.pause(); }
  resumeRead() { this.child.stdout.resume(); }
  async kill() {
    if (!this.child || this.child.exitCode !== null) return this.exitPromise;
    try { this.child.stdin.end(); } catch (_) { }
    const result = await Promise.race([
      this.exitPromise,
      new Promise(resolve => setTimeout(() => resolve(null), 2000))
    ]);
    if (result) return result;
    try { this.child.kill(); } catch (_) { }
    return this.exitPromise;
  }

  async waitFor(predicate, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`timeout:${label}`);
  }

  async waitForGenerationEvent(generationId, name, timeoutMs = 5000) {
    await this.waitFor(() => this.timeline.some(item => item.generationId === generationId && item.name === name && item.action === 'ACCEPT'), timeoutMs, `${generationId}:${name}`);
  }

  snapshot() {
    return {
      helperInstanceId: this.helperInstanceId,
      helperPid: this.child && this.child.pid,
      currentGenerationId: this.currentGenerationId,
      currentLabel: this.currentLabel,
      state: { ...this.state },
      timeline: this.timeline.map(item => ({ ...item })),
      requestHistory: this.requestHistory.map(item => ({ ...item })),
      operationErrors: this.operationErrors.map(item => ({ ...item })),
      pendingRequestCount: this.pending.size,
      closeOrdering: this.closeOrdering.map(item => ({ ...item })),
      stderrObservedBytes: this.stderrObservedBytes,
      stderrRetainedBytes: this.stderrRetainedBytes,
      protocolFailure: this.protocolFailure,
      exited: this.exited
    };
  }
}

async function cleanupActiveClients() {
  await Promise.all([...ACTIVE_CLIENTS].map(async client => {
    try { await client.kill(); } catch (_) { /* best-effort exact owned child cleanup */ }
  }));
}

module.exports = {
  FrameDecoder,
  MAX_FRAME_BYTES,
  MAX_INBOUND_BYTES,
  MAX_INBOUND_FRAMES,
  MAX_RECEIVE_BUFFER,
  NativeHelperClient,
  PROTOCOL_VERSION,
  ProtocolFailure,
  cleanupActiveClients,
  encodeFrame,
  validateIncoming
};
