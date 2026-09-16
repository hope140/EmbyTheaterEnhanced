'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { TextDecoder } = require('node:util');

const PROTOCOL_VERSION = 1;
const MESSAGE_TYPES = new Set(['command', 'request', 'response', 'event', 'lifecycle', 'error']);
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_RECEIVE_BUFFER_BYTES = 128 * 1024;
const READY_TIMEOUT_MS = 15_000;
const MAX_DIAGNOSTIC_BYTES = 64 * 1024;

class ProtocolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProtocolError';
  }
}

function usage() {
  return 'usage: node parent-under-test.cjs <native-helper-exe> <libmpv> <output-json>';
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name}-required`);
  }
  return value;
}

function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }
  if (argv.length !== 3) throw new Error(usage());
  const [helper, libmpv, output] = argv.map(value => path.resolve(requiredString(value, 'argument')));
  if (!fs.existsSync(helper)) throw new Error(`native-helper-not-found:${helper}`);
  if (!fs.existsSync(libmpv)) throw new Error(`libmpv-not-found:${libmpv}`);
  return { helper, libmpv, output };
}

function assertSafePositiveInteger(value, field) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ProtocolError(`${field}-invalid`);
  }
}

function validateFrame(frame, helperInstanceId) {
  if (frame === null || typeof frame !== 'object' || Array.isArray(frame)) {
    throw new ProtocolError('frame-object-required');
  }
  if (frame.protocolVersion !== PROTOCOL_VERSION) {
    throw new ProtocolError('unsupported-protocol-version');
  }
  if (frame.helperInstanceId !== helperInstanceId) {
    throw new ProtocolError('helper-instance-id-mismatch');
  }
  if (typeof frame.type !== 'string' || !MESSAGE_TYPES.has(frame.type)) {
    // A bare ready packet was used by the older bridge prototype. It is
    // accepted only as a compatibility shape and still needs all identity
    // checks above.
    if (frame.type !== 'ready') throw new ProtocolError('message-type-invalid');
  }
  if (frame.type === 'request' || frame.type === 'response' || frame.type === 'error') {
    assertSafePositiveInteger(frame.requestId, 'requestId');
  }
  if (frame.scope === 'generation') assertSafePositiveInteger(frame.generationId, 'generationId');
  if (frame.type === 'event' && frame.scope !== 'generation' && frame.scope !== 'helper') {
    throw new ProtocolError('event-scope-invalid');
  }
  if (frame.type === 'lifecycle' && typeof frame.name !== 'string' && typeof frame.event !== 'string') {
    throw new ProtocolError('lifecycle-name-required');
  }
  if (frame.type === 'ready' && frame.ready !== true && frame.name !== 'ready' && frame.event !== 'ready') {
    throw new ProtocolError('ready-marker-invalid');
  }
  return frame;
}

function isReadyFrame(frame) {
  return frame.type === 'ready'
    || (frame.type === 'lifecycle' && (frame.name === 'ready' || frame.event === 'ready'))
    || (frame.type === 'event' && frame.scope === 'helper' && frame.name === 'ready');
}

class FrameDecoder {
  constructor({ maxFrameBytes = MAX_FRAME_BYTES, maxReceiveBufferBytes = MAX_RECEIVE_BUFFER_BYTES } = {}) {
    this.maxFrameBytes = maxFrameBytes;
    this.maxReceiveBufferBytes = maxReceiveBufferBytes;
    this.buffer = Buffer.alloc(0);
    this.decoder = new TextDecoder('utf-8', { fatal: true });
  }

  push(chunk) {
    if (!Buffer.isBuffer(chunk) || chunk.length === 0) return [];
    if (this.buffer.length + chunk.length > this.maxReceiveBufferBytes) {
      throw new ProtocolError('receive-buffer-limit');
    }
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const frames = [];
    while (this.buffer.length >= 4) {
      const payloadLength = this.buffer.readUInt32LE(0);
      if (payloadLength === 0 || payloadLength > this.maxFrameBytes) {
        throw new ProtocolError('frame-length-invalid');
      }
      if (this.buffer.length < 4 + payloadLength) break;
      const payload = this.buffer.subarray(4, 4 + payloadLength);
      this.buffer = this.buffer.subarray(4 + payloadLength);
      let text;
      try {
        text = this.decoder.decode(payload);
      } catch {
        throw new ProtocolError('invalid-utf8');
      }
      let frame;
      try {
        frame = JSON.parse(text);
      } catch {
        throw new ProtocolError('malformed-json');
      }
      frames.push(frame);
    }
    return frames;
  }

  finish() {
    if (this.buffer.length !== 0) throw new ProtocolError('truncated-frame');
  }
}

function frameJson(value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  if (payload.length === 0 || payload.length > MAX_FRAME_BYTES) throw new ProtocolError('outbound-frame-too-large');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

async function waitForReady(child, helperInstanceId) {
  const decoder = new FrameDecoder();
  const diagnostics = { frames: 0, stderrBytes: 0, stderrTail: '' };
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(new Error('helper-ready-timeout')), READY_TIMEOUT_MS);

    const finish = (error, frame) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        error.diagnostics = diagnostics;
        reject(error);
      } else {
        resolve({ frame, diagnostics });
      }
    };

    child.stdout.on('data', chunk => {
      if (settled) return;
      try {
        for (const candidate of decoder.push(chunk)) {
          const frame = validateFrame(candidate, helperInstanceId);
          diagnostics.frames += 1;
          if (isReadyFrame(frame)) finish(null, frame);
        }
      } catch (error) {
        finish(error instanceof ProtocolError ? error : new ProtocolError(error.message));
      }
    });
    child.stderr.on('data', chunk => {
      // Drain stderr independently of protocol stdout. Keep only a bounded
      // tail so a diagnostic storm cannot retain unbounded memory.
      diagnostics.stderrBytes += chunk.length;
      diagnostics.stderrTail = `${diagnostics.stderrTail}${chunk.toString('utf8')}`.slice(-MAX_DIAGNOSTIC_BYTES);
    });
    child.stderr.on('error', () => {});
    child.stdout.once('error', error => finish(error));
    child.once('error', error => finish(error));
    child.once('exit', (code, signal) => {
      if (!settled) finish(new Error(`helper-exited-before-ready:${code === null ? signal : code}`));
    });
  });
}

function writeOutput(outputPath, record) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArguments(argv);
  if (args === null) return;

  const helperInstanceId = crypto.randomUUID();
  // The experiment helper contract is positional: argv[1] is the libmpv DLL
  // and argv[2] is the parent-assigned, never-reused helper identity.
  const child = spawn(args.helper, [args.libmpv, helperInstanceId], {
    cwd: path.dirname(args.helper),
    windowsHide: true,
    detached: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ETE_HELPER_INSTANCE_ID: helperInstanceId,
      ETE_PROTOCOL_VERSION: String(PROTOCOL_VERSION),
    },
  });
  // A peer crash/close can surface as an asynchronous write error. It is
  // expected during lifecycle tests and must never become an uncaught error
  // in the parent harness.
  child.stdin.on('error', () => {});

  let shuttingDown = false;
  const cleanup = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // On ordinary shutdown this closes the parent's write end first. On a
    // forced parent termination the OS closes this inherited-pipe handle.
    try { child.stdin.destroy(); } catch { /* already closed */ }
    if (!child.killed && child.exitCode === null) {
      try { child.kill(); } catch { /* process may have exited concurrently */ }
    }
  };
  process.once('exit', cleanup);
  process.once('SIGINT', () => { cleanup(); process.exit(130); });
  process.once('SIGTERM', () => { cleanup(); process.exit(143); });

  try {
    const ready = await waitForReady(child, helperInstanceId);
    writeOutput(args.output, {
      protocolVersion: PROTOCOL_VERSION,
      helperInstanceId,
      parentPid: process.pid,
      helperPid: child.pid,
      nativeHelperExe: args.helper,
      libmpv: args.libmpv,
      ready: true,
      readyFrame: ready.frame,
      diagnostics: ready.diagnostics,
    });

    // Keep the parent alive for supervisor-controlled kill/EOF tests. This is
    // deliberately one process with private child stdio pipes: no shell,
    // detached process, public endpoint or extra handle-holder is created.
    setInterval(() => {}, 60 * 60 * 1000);
    process.stdin.resume();
  } catch (error) {
    cleanup();
    process.stderr.write(`parent-under-test failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`parent-under-test failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  FrameDecoder,
  MAX_FRAME_BYTES,
  MAX_RECEIVE_BUFFER_BYTES,
  PROTOCOL_VERSION,
  frameJson,
  validateFrame,
};
