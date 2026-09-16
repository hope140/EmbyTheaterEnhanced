'use strict';

const { MESSAGE_TYPES } = require('./model.cjs');

class SharedTransport {
  constructor(options = {}) {
    this.receiver = null;
    this.outbound = [];
    this.maxOutboundHistory = options.maxOutboundHistory || 128;
    this.outboundHistoryDrops = 0;
    this.onSend = null;
    this.sendFailure = null;
    this.claimedHelperInstanceIds = new Set();
  }

  attach(receiver) {
    this.receiver = receiver;
  }

  detach() {
    this.receiver = null;
  }

  send(message) {
    if (this.sendFailure) {
      const error = this.sendFailure;
      this.sendFailure = null;
      throw error;
    }
    if (this.outbound.length >= this.maxOutboundHistory) {
      this.outbound.shift();
      this.outboundHistoryDrops++;
    }
    this.outbound.push(message);
    if (this.onSend) this.onSend(message);
  }

  deliver(message) {
    if (this.receiver) this.receiver(message);
  }

  failNextSend(error = new Error('transport-send-failed')) {
    this.sendFailure = error;
  }

  claimHelperInstanceId(helperInstanceId) {
    if (this.claimedHelperInstanceIds.has(helperInstanceId)) return false;
    this.claimedHelperInstanceIds.add(helperInstanceId);
    return true;
  }
}

class FakeHelper {
  constructor(options) {
    this.helperInstanceId = options.helperInstanceId;
    this.scheduler = options.scheduler;
    this.transport = options.transport;
    this.plans = new Map();
    this.alive = true;
    this.transport.onSend = message => this._onMessage(message);
  }

  plan(method, behavior) {
    this.plans.set(method, { ...behavior });
    return this;
  }

  restart(helperInstanceId) {
    this.helperInstanceId = helperInstanceId;
    this.alive = true;
  }

  crash() {
    if (!this.alive) return;
    const oldHelperInstanceId = this.helperInstanceId;
    this.alive = false;
    this.transport.deliver({
      type: MESSAGE_TYPES.LIFECYCLE,
      helperInstanceId: oldHelperInstanceId,
      name: 'helper-crashed'
    });
  }

  emitGenerationEvent(generationId, name, value, overrides = {}) {
    this.transport.deliver({
      type: MESSAGE_TYPES.EVENT,
      helperInstanceId: overrides.helperInstanceId || this.helperInstanceId,
      generationId: overrides.generationId || generationId,
      scope: 'generation',
      name,
      value
    });
  }

  emitHelperEvent(name, value, overrides = {}) {
    this.transport.deliver({
      type: MESSAGE_TYPES.EVENT,
      helperInstanceId: overrides.helperInstanceId || this.helperInstanceId,
      scope: 'helper',
      name,
      value
    });
  }

  respond(outboundRequest, overrides = {}) {
    this.transport.deliver({
      type: MESSAGE_TYPES.RESPONSE,
      helperInstanceId: overrides.helperInstanceId || outboundRequest.helperInstanceId,
      generationId: overrides.generationId || outboundRequest.generationId,
      requestId: overrides.requestId || outboundRequest.requestId,
      result: Object.hasOwn(overrides, 'result') ? overrides.result : { ok: true }
    });
  }

  sendMalformed(value) {
    this.transport.deliver(value);
  }

  _onMessage(message) {
    if (!this.alive || message.type !== MESSAGE_TYPES.REQUEST) return;
    const behavior = this.plans.get(message.method) || {};
    if (behavior.drop) return;
    const delayMs = behavior.delayMs || 0;
    const deliver = () => {
      if (!this.alive && !behavior.deliverAfterCrash) return;
      if (behavior.malformed) {
        this.sendMalformed(behavior.malformed);
        return;
      }
      this.respond(message, {
        helperInstanceId: behavior.helperInstanceId,
        generationId: behavior.generationId,
        requestId: behavior.requestId,
        result: Object.hasOwn(behavior, 'result') ? behavior.result : { ok: true, method: message.method }
      });
      if (behavior.duplicate) this.respond(message, { result: { duplicate: true } });
    };
    if (delayMs === 0) deliver();
    else this.scheduler.setTimeout(deliver, delayMs);
  }
}

module.exports = { FakeHelper, SharedTransport };
