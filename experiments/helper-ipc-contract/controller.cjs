'use strict';

const {
  MESSAGE_TYPES,
  REQUEST_STATES,
  TERMINAL_REQUEST_STATES,
  validateMessage
} = require('./model.cjs');

class RequestTerminalError extends Error {
  constructor(state, reason) {
    super(reason || state);
    this.name = 'RequestTerminalError';
    this.state = state;
    this.reason = reason || state;
  }
}

class ResearchController {
  constructor(options) {
    if (!options || !options.scheduler || !options.transport) throw new TypeError('scheduler-and-transport-required');
    if (typeof options.transport.claimHelperInstanceId !== 'function') {
      throw new TypeError('helper-identity-registry-required');
    }
    this.scheduler = options.scheduler;
    this.transport = options.transport;
    this.controllerInstanceId = options.controllerInstanceId || 'controller-1';
    this.testTimeoutMs = options.testTimeoutMs || 50;
    this.maxDiagnostics = options.maxDiagnostics || 32;
    this.maxDropRecords = options.maxDropRecords || 256;
    this.maxRequestHistory = options.maxRequestHistory || 256;
    this.nextRequestId = 0;
    this.lastGenerationId = 0;
    this.activeGenerationId = null;
    this.activeHelperInstanceId = null;
    this.destroyed = false;
    this.pending = new Map();
    this.requestHistory = [];
    this.drops = [];
    this.diagnostics = [];
    this.metrics = {
      received: 0,
      appliedEvents: 0,
      dropped: 0,
      terminalTransitions: 0,
      duplicateTerminalAttempts: 0,
      peakPendingRequests: 0,
      diagnosticDrops: 0,
      dropRecordDrops: 0,
      requestHistoryDrops: 0
    };
    this.state = {
      status: 'idle',
      media: null,
      path: null,
      duration: null,
      paused: false,
      timePos: 0,
      fileLoaded: false,
      coreIdle: true
    };
    this.effects = {
      loadCalls: [],
      mediaTransitions: [],
      playingTransitions: []
    };
    this.transport.attach(message => this.receive(message));
  }

  startHelper(helperInstanceId) {
    if (this.destroyed) throw new Error('controller-destroyed');
    if (typeof helperInstanceId !== 'string' || helperInstanceId.length === 0) throw new TypeError('helper-instance-id-required');
    if (!this.transport.claimHelperInstanceId(helperInstanceId)) {
      throw new Error('helper-instance-id-reused');
    }
    if (this.activeHelperInstanceId && this.activeHelperInstanceId !== helperInstanceId) {
      this._terminateWhere(
        request => request.helperInstanceId === this.activeHelperInstanceId,
        REQUEST_STATES.HELPER_DIED,
        'helper-replaced'
      );
      this.activeGenerationId = null;
    }
    this.activeHelperInstanceId = helperInstanceId;
    this.state.status = 'idle';
    return helperInstanceId;
  }

  beginGeneration(media) {
    if (this.destroyed) throw new Error('controller-destroyed');
    if (!this.activeHelperInstanceId) throw new Error('helper-not-started');
    if (this.activeGenerationId !== null) {
      const retired = this.activeGenerationId;
      this._terminateWhere(
        request => request.helperInstanceId === this.activeHelperInstanceId && request.generationId === retired,
        REQUEST_STATES.GENERATION_RETIRED,
        'generation-retired'
      );
    }
    this.activeGenerationId = ++this.lastGenerationId;
    this.state = {
      status: 'loading',
      media,
      path: null,
      duration: null,
      paused: false,
      timePos: 0,
      fileLoaded: false,
      coreIdle: true
    };
    this.effects.mediaTransitions.push({ generationId: this.activeGenerationId, media });
    return this.token();
  }

  token() {
    return Object.freeze({
      controllerInstanceId: this.controllerInstanceId,
      helperInstanceId: this.activeHelperInstanceId,
      generationId: this.activeGenerationId
    });
  }

  isCurrentToken(token) {
    return !this.destroyed && !!token && token.controllerInstanceId === this.controllerInstanceId &&
      token.helperInstanceId === this.activeHelperInstanceId && token.generationId === this.activeGenerationId;
  }

  commitFor(token, mutation) {
    if (!this.isCurrentToken(token)) {
      this._drop('stale-application-token', token);
      return false;
    }
    mutation(this.state);
    return true;
  }

  submitLoadFor(token, source) {
    return this.commitFor(token, state => {
      this.effects.loadCalls.push({ helperInstanceId: token.helperInstanceId, generationId: token.generationId, source });
      state.path = source;
    });
  }

  command(method, params) {
    if (!this._canSendGenerationMessage()) return Promise.reject(new Error('generation-not-active'));
    const message = {
      type: MESSAGE_TYPES.COMMAND,
      helperInstanceId: this.activeHelperInstanceId,
      generationId: this.activeGenerationId,
      method,
      params
    };
    try {
      this.transport.send(message);
      return Promise.resolve({ accepted: true, guarantee: 'ipc-submission-only' });
    } catch (error) {
      this.helperDied(message.helperInstanceId, 'transport-send-failed');
      return Promise.reject(new RequestTerminalError(REQUEST_STATES.HELPER_DIED, error && error.message || 'transport-send-failed'));
    }
  }

  request(method, params, options = {}) {
    if (!this._canSendGenerationMessage()) return Promise.reject(new Error('generation-not-active'));
    const timeoutMs = options.timeoutMs || this.testTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new TypeError('invalid-timeout'));
    const requestId = ++this.nextRequestId;
    const request = {
      requestId,
      helperInstanceId: this.activeHelperInstanceId,
      generationId: this.activeGenerationId,
      method,
      state: REQUEST_STATES.CREATED,
      stateTransitions: [REQUEST_STATES.CREATED],
      createdAtMs: this.scheduler.now(),
      deadlineMs: this.scheduler.now() + timeoutMs,
      terminalTransitions: 0,
      timer: null,
      resolve: null,
      reject: null
    };
    const promise = new Promise((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
    });
    promise.requestId = requestId;
    promise.token = Object.freeze({
      controllerInstanceId: this.controllerInstanceId,
      helperInstanceId: request.helperInstanceId,
      generationId: request.generationId,
      requestId
    });
    this.pending.set(requestId, request);
    this.metrics.peakPendingRequests = Math.max(this.metrics.peakPendingRequests, this.pending.size);
    request.timer = this.scheduler.setTimeout(() => {
      this._settle(request, REQUEST_STATES.TIMED_OUT, undefined, 'absolute-deadline-exceeded');
    }, timeoutMs);
    request.state = REQUEST_STATES.SENT;
    request.stateTransitions.push(REQUEST_STATES.SENT);
    try {
      this.transport.send({
        type: MESSAGE_TYPES.REQUEST,
        helperInstanceId: request.helperInstanceId,
        generationId: request.generationId,
        requestId,
        method,
        params,
        deadlineMs: request.deadlineMs
      });
    } catch (error) {
      this.helperDied(request.helperInstanceId, 'transport-send-failed');
    }
    return promise;
  }

  cancelRequest(requestId, reason = 'cancelled') {
    const request = this.pending.get(requestId);
    if (!request) return false;
    return this._settle(request, REQUEST_STATES.CANCELLED, undefined, reason);
  }

  stop() {
    if (this.destroyed) return;
    const retired = this.activeGenerationId;
    if (retired !== null) {
      this._terminateWhere(
        request => request.helperInstanceId === this.activeHelperInstanceId && request.generationId === retired,
        REQUEST_STATES.GENERATION_RETIRED,
        'stop-retired-generation'
      );
    }
    this.activeGenerationId = null;
    this.state.status = 'stopped';
    this.state.media = null;
    this.state.path = null;
    this.state.fileLoaded = false;
    this.state.coreIdle = true;
  }

  helperDied(helperInstanceId, reason = 'helper-died') {
    if (helperInstanceId !== this.activeHelperInstanceId) {
      this._drop('stale-helper-lifecycle', { helperInstanceId });
      return false;
    }
    this._terminateWhere(
      request => request.helperInstanceId === helperInstanceId,
      REQUEST_STATES.HELPER_DIED,
      reason
    );
    this.activeHelperInstanceId = null;
    this.activeGenerationId = null;
    this.state.status = 'helper-dead';
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    this._terminateWhere(() => true, REQUEST_STATES.CONTROLLER_DESTROYED, 'controller-destroyed');
    this.destroyed = true;
    this.activeHelperInstanceId = null;
    this.activeGenerationId = null;
    this.state.status = 'destroyed';
    this.transport.detach();
  }

  receive(message) {
    this.metrics.received++;
    if (this.destroyed) {
      this._drop('controller-destroyed', message);
      return;
    }
    const validation = validateMessage(message);
    if (!validation.ok) {
      this._drop(`malformed:${validation.reason}`, message);
      return;
    }
    if (message.helperInstanceId !== this.activeHelperInstanceId) {
      this._drop('stale-helper-instance', message);
      return;
    }
    if (Object.hasOwn(message, 'generationId') && message.generationId > this.lastGenerationId) {
      this._drop('impossible-future-generation', message);
      return;
    }

    switch (message.type) {
      case MESSAGE_TYPES.RESPONSE:
        this._receiveResponse(message);
        break;
      case MESSAGE_TYPES.EVENT:
        this._receiveEvent(message);
        break;
      case MESSAGE_TYPES.LIFECYCLE:
        this._receiveLifecycle(message);
        break;
      case MESSAGE_TYPES.ERROR:
        this._receiveError(message);
        break;
      default:
        this._drop('unexpected-direction', message);
        break;
    }
  }

  snapshot() {
    return {
      controllerInstanceId: this.controllerInstanceId,
      helperInstanceId: this.activeHelperInstanceId,
      generationId: this.activeGenerationId,
      lastGenerationId: this.lastGenerationId,
      state: { ...this.state },
      pendingRequestIds: [...this.pending.keys()],
      requestHistory: this.requestHistory.map(item => ({ ...item })),
      drops: this.drops.map(item => ({ ...item })),
      diagnostics: this.diagnostics.map(item => ({ ...item })),
      metrics: { ...this.metrics },
      effects: {
        loadCalls: this.effects.loadCalls.map(item => ({ ...item })),
        mediaTransitions: this.effects.mediaTransitions.map(item => ({ ...item })),
        playingTransitions: this.effects.playingTransitions.map(item => ({ ...item }))
      },
      destroyed: this.destroyed
    };
  }

  _canSendGenerationMessage() {
    return !this.destroyed && !!this.activeHelperInstanceId && this.activeGenerationId !== null;
  }

  _receiveResponse(message) {
    const request = this.pending.get(message.requestId);
    if (!request) {
      this._drop('unknown-or-terminal-request-id', message);
      return;
    }
    if (message.helperInstanceId !== request.helperInstanceId || message.generationId !== request.generationId) {
      this._drop('response-identity-mismatch', message);
      return;
    }
    if (message.generationId !== this.activeGenerationId) {
      this._drop('stale-generation-response', message);
      return;
    }
    this._settle(request, REQUEST_STATES.RESOLVED, message.result);
  }

  _receiveEvent(message) {
    if (message.scope === 'helper') {
      this._appendDiagnostic({ atMs: this.scheduler.now(), name: message.name, value: message.value });
      return;
    }
    if (message.generationId !== this.activeGenerationId) {
      this._drop('stale-generation-event', message);
      return;
    }
    switch (message.name) {
      case 'core-idle':
        this.state.coreIdle = !!message.value;
        if (message.value === false) {
          this.state.status = 'playing';
          this.effects.playingTransitions.push({ generationId: message.generationId, media: this.state.media });
        }
        break;
      case 'file-loaded':
        this.state.fileLoaded = true;
        break;
      case 'duration':
        this.state.duration = message.value;
        break;
      case 'path':
        this.state.path = message.value;
        break;
      case 'pause':
        this.state.paused = !!message.value;
        break;
      case 'time-pos':
        this.state.timePos = message.value;
        break;
      case 'end-file':
        this.state.status = 'ended';
        break;
      default:
        this._appendDiagnostic({ atMs: this.scheduler.now(), name: `event:${message.name}` });
        break;
    }
    this.metrics.appliedEvents++;
  }

  _receiveLifecycle(message) {
    if (message.name === 'helper-crashed' || message.name === 'helper-exited') {
      this.helperDied(message.helperInstanceId, message.name);
      return;
    }
    this._appendDiagnostic({ atMs: this.scheduler.now(), name: `lifecycle:${message.name}` });
  }

  _receiveError(message) {
    if (!Object.hasOwn(message, 'requestId')) {
      this._appendDiagnostic({ atMs: this.scheduler.now(), name: `helper-error:${message.code}` });
      return;
    }
    const request = this.pending.get(message.requestId);
    if (!request) {
      this._drop('unknown-error-request-id', message);
      return;
    }
    if (request.helperInstanceId !== message.helperInstanceId || request.generationId !== message.generationId) {
      this._drop('error-identity-mismatch', message);
      return;
    }
    this._settle(request, REQUEST_STATES.CANCELLED, undefined, `helper-error:${message.code}`);
  }

  _settle(request, terminalState, value, reason) {
    if (!TERMINAL_REQUEST_STATES.has(terminalState)) throw new TypeError('terminal-state-required');
    if (TERMINAL_REQUEST_STATES.has(request.state)) {
      this.metrics.duplicateTerminalAttempts++;
      return false;
    }
    this.scheduler.clearTimeout(request.timer);
    this.pending.delete(request.requestId);
    request.state = terminalState;
    request.stateTransitions.push(terminalState);
    request.terminalTransitions++;
    this.metrics.terminalTransitions++;
    const record = {
      requestId: request.requestId,
      helperInstanceId: request.helperInstanceId,
      generationId: request.generationId,
      method: request.method,
      state: terminalState,
      reason: reason || null,
      createdAtMs: request.createdAtMs,
      deadlineMs: request.deadlineMs,
      settledAtMs: this.scheduler.now(),
      terminalTransitions: request.terminalTransitions,
      stateTransitions: [...request.stateTransitions]
    };
    this.requestHistory.push(record);
    if (this.requestHistory.length > this.maxRequestHistory) {
      this.requestHistory.shift();
      this.metrics.requestHistoryDrops++;
    }
    if (terminalState === REQUEST_STATES.RESOLVED) request.resolve(value);
    else request.reject(new RequestTerminalError(terminalState, reason));
    return true;
  }

  _terminateWhere(predicate, state, reason) {
    for (const request of [...this.pending.values()]) {
      if (predicate(request)) this._settle(request, state, undefined, reason);
    }
  }

  _appendDiagnostic(item) {
    if (this.diagnostics.length >= this.maxDiagnostics) {
      this.diagnostics.shift();
      this.metrics.diagnosticDrops++;
    }
    const bounded = { ...item };
    if (Object.hasOwn(bounded, 'value')) bounded.value = boundDiagnosticValue(bounded.value);
    this.diagnostics.push(bounded);
  }

  _drop(reason, message) {
    this.metrics.dropped++;
    if (this.drops.length >= this.maxDropRecords) {
      this.drops.shift();
      this.metrics.dropRecordDrops++;
    }
    this.drops.push({ atMs: this.scheduler.now(), reason, messageType: message && message.type || null });
  }
}

function boundDiagnosticValue(value) {
  if (typeof value === 'string') return value.length <= 1024 ? value : `${value.slice(0, 1024)}...[truncated]`;
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  try {
    const json = JSON.stringify(value);
    if (!json) return '[unavailable]';
    return json.length <= 1024 ? json : `${json.slice(0, 1024)}...[truncated]`;
  } catch (_) {
    return '[unserializable]';
  }
}

module.exports = { ResearchController, RequestTerminalError };
