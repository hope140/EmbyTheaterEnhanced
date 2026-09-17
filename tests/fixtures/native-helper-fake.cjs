'use strict';

const helperInstanceId = process.argv[2];
let buffer = Buffer.alloc(0);
let currentGeneration = null;

function frame(message) {
  const payload = Buffer.from(JSON.stringify(Object.assign({protocolVersion: 1, helperInstanceId}, message)), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

frame({type: 'lifecycle', scope: 'helper', name: 'ready', detail: {
  protocolVersion: 1,
  mpvClientApiVersion: 131077,
  helperVersion: 'fake-1',
  libmpvVersion: 'fake-mpv',
  surfaceAttached: true,
  capabilities: ['private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution'],
  queueLimits: {maxPendingFrames: 128, maxPendingBytes: 262144}
}});

process.stdin.on('data', function (chunk) {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (!length || length > 65536) process.exit(20);
    if (buffer.length < length + 4) return;
    const message = JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
    buffer = buffer.subarray(4 + length);
    if (message.method === 'activate-generation') currentGeneration = message.generationId;
    if (message.method === 'get-property') {
      frame({type: 'response', generationId: message.generationId, requestId: message.requestId, result: {value: {nested: [1, true, 'ok']}}});
    }
    if (message.method === 'load') {
      frame({type: 'response', generationId: message.generationId, requestId: message.requestId, result: {commandAccepted: true, mediaIdentity: 7}});
      frame({type: 'event', scope: 'generation', generationId: message.generationId, name: 'start-file', value: null});
      frame({type: 'event', scope: 'generation', generationId: message.generationId, name: 'file-loaded', value: null});
      frame({type: 'event', scope: 'generation', generationId: message.generationId, name: 'core-idle', value: false});
    }
    if (message.method === 'stop') {
      frame({type: 'response', generationId: message.generationId, requestId: message.requestId, result: {commandAccepted: true}});
    }
  }
});

process.stdin.on('end', function () { process.exit(0); });
setInterval(function () {
  if (currentGeneration) frame({type: 'event', scope: 'generation', generationId: currentGeneration, name: 'time-pos', value: 1});
}, 50).unref();
