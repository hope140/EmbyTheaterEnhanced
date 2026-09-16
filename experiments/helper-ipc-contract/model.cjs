'use strict';

const { TextDecoder } = require('node:util');

const MESSAGE_TYPES = Object.freeze({
  COMMAND: 'command',
  REQUEST: 'request',
  RESPONSE: 'response',
  EVENT: 'event',
  LIFECYCLE: 'lifecycle',
  ERROR: 'error'
});

const REQUEST_STATES = Object.freeze({
  CREATED: 'CREATED',
  SENT: 'SENT',
  RESOLVED: 'RESOLVED',
  TIMED_OUT: 'TIMED_OUT',
  CANCELLED: 'CANCELLED',
  HELPER_DIED: 'HELPER_DIED',
  GENERATION_RETIRED: 'GENERATION_RETIRED',
  CONTROLLER_DESTROYED: 'CONTROLLER_DESTROYED'
});

const TERMINAL_REQUEST_STATES = new Set([
  REQUEST_STATES.RESOLVED,
  REQUEST_STATES.TIMED_OUT,
  REQUEST_STATES.CANCELLED,
  REQUEST_STATES.HELPER_DIED,
  REQUEST_STATES.GENERATION_RETIRED,
  REQUEST_STATES.CONTROLLER_DESTROYED
]);

class ProtocolError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

class ControlledScheduler {
  constructor(startMs = 0) {
    this.nowMs = startMs;
    this.nextTimerId = 1;
    this.timers = new Map();
  }

  now() {
    return this.nowMs;
  }

  setTimeout(callback, delayMs) {
    if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError('invalid-delay');
    const id = this.nextTimerId++;
    this.timers.set(id, { id, dueMs: this.nowMs + delayMs, callback });
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  advanceBy(deltaMs) {
    this.advanceTo(this.nowMs + deltaMs);
  }

  advanceTo(targetMs) {
    if (!Number.isFinite(targetMs) || targetMs < this.nowMs) throw new TypeError('invalid-target-time');
    while (true) {
      let next = null;
      for (const timer of this.timers.values()) {
        if (timer.dueMs > targetMs) continue;
        if (!next || timer.dueMs < next.dueMs || (timer.dueMs === next.dueMs && timer.id < next.id)) {
          next = timer;
        }
      }
      if (!next) break;
      this.timers.delete(next.id);
      this.nowMs = next.dueMs;
      next.callback();
    }
    this.nowMs = targetMs;
  }

  pendingTimerCount() {
    return this.timers.size;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function validateMessage(message) {
  if (!isPlainObject(message)) return { ok: false, reason: 'message-not-object' };
  if (!Object.values(MESSAGE_TYPES).includes(message.type)) return { ok: false, reason: 'unknown-message-type' };
  if (!isIdentity(message.helperInstanceId)) return { ok: false, reason: 'missing-helper-instance-id' };

  if (message.type === MESSAGE_TYPES.COMMAND || message.type === MESSAGE_TYPES.REQUEST ||
      message.type === MESSAGE_TYPES.RESPONSE) {
    if (!isPositiveSafeInteger(message.generationId)) return { ok: false, reason: 'missing-generation-id' };
  }

  if (message.type === MESSAGE_TYPES.REQUEST || message.type === MESSAGE_TYPES.RESPONSE) {
    if (!isPositiveSafeInteger(message.requestId)) return { ok: false, reason: 'missing-request-id' };
  }

  if (message.type === MESSAGE_TYPES.COMMAND || message.type === MESSAGE_TYPES.REQUEST) {
    if (typeof message.method !== 'string' || message.method.length === 0 || message.method.length > 128) {
      return { ok: false, reason: 'invalid-method' };
    }
  }

  if (message.type === MESSAGE_TYPES.EVENT) {
    if (message.scope !== 'generation' && message.scope !== 'helper') {
      return { ok: false, reason: 'invalid-event-scope' };
    }
    if (message.scope === 'generation' && !isPositiveSafeInteger(message.generationId)) {
      return { ok: false, reason: 'missing-generation-id' };
    }
    if (message.scope === 'helper' && Object.hasOwn(message, 'generationId')) {
      return { ok: false, reason: 'helper-event-has-generation-id' };
    }
    if (typeof message.name !== 'string' || message.name.length === 0 || message.name.length > 128) {
      return { ok: false, reason: 'invalid-event-name' };
    }
  }

  if (message.type === MESSAGE_TYPES.LIFECYCLE) {
    if (typeof message.name !== 'string' || message.name.length === 0 || message.name.length > 128) {
      return { ok: false, reason: 'invalid-lifecycle-name' };
    }
    if (Object.hasOwn(message, 'generationId') && !isPositiveSafeInteger(message.generationId)) {
      return { ok: false, reason: 'invalid-generation-id' };
    }
  }

  if (message.type === MESSAGE_TYPES.ERROR) {
    if (Object.hasOwn(message, 'requestId') && !isPositiveSafeInteger(message.requestId)) {
      return { ok: false, reason: 'invalid-request-id' };
    }
    if (Object.hasOwn(message, 'requestId') && !isPositiveSafeInteger(message.generationId)) {
      return { ok: false, reason: 'missing-generation-id' };
    }
    if (Object.hasOwn(message, 'generationId') && !isPositiveSafeInteger(message.generationId)) {
      return { ok: false, reason: 'invalid-generation-id' };
    }
    if (typeof message.code !== 'string' || message.code.length === 0 || message.code.length > 128) {
      return { ok: false, reason: 'invalid-error-code' };
    }
  }

  return { ok: true };
}

function encodeFrame(message, maxFrameBytes = 64 * 1024) {
  const validation = validateMessage(message);
  if (!validation.ok) throw new ProtocolError(validation.reason);
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  if (payload.length === 0 || payload.length > maxFrameBytes) throw new ProtocolError('frame-too-large');
  const frame = Buffer.allocUnsafe(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

class LengthPrefixedJsonDecoder {
  constructor(options = {}) {
    this.maxFrameBytes = options.maxFrameBytes || 64 * 1024;
    this.maxBufferedBytes = options.maxBufferedBytes || (this.maxFrameBytes * 2 + 8);
    this.buffer = Buffer.alloc(0);
    this.failed = false;
    this.textDecoder = new TextDecoder('utf-8', { fatal: true });
  }

  push(chunk) {
    if (this.failed) throw new ProtocolError('decoder-failed');
    if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
    if (this.buffer.length + chunk.length > this.maxBufferedBytes) {
      this.failed = true;
      throw new ProtocolError('buffer-limit-exceeded');
    }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (length === 0 || length > this.maxFrameBytes) {
        this.failed = true;
        throw new ProtocolError('invalid-frame-length');
      }
      if (this.buffer.length < 4 + length) break;
      const payload = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      let message;
      try {
        message = JSON.parse(this.textDecoder.decode(payload));
      } catch (error) {
        this.failed = true;
        if (error && error.name === 'TypeError') throw new ProtocolError('invalid-utf8');
        throw new ProtocolError('malformed-json');
      }
      const validation = validateMessage(message);
      if (!validation.ok) {
        this.failed = true;
        throw new ProtocolError(validation.reason);
      }
      messages.push(message);
    }
    return messages;
  }
}

module.exports = {
  ControlledScheduler,
  LengthPrefixedJsonDecoder,
  MESSAGE_TYPES,
  ProtocolError,
  REQUEST_STATES,
  TERMINAL_REQUEST_STATES,
  encodeFrame,
  validateMessage
};
