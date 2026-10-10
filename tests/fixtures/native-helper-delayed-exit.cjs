'use strict';

// A private Node fake process, not the product helper or a runtime/profile.
// Delayed EOF exit models a still-owned process after transport termination.
const helperInstanceId = process.argv[2];
const keepalive = setInterval(function () {}, 50);
const payload = Buffer.from(JSON.stringify({
  protocolVersion: 1, helperInstanceId, type: 'lifecycle', scope: 'helper', name: 'ready', detail: {
    protocolVersion: 1, mpvClientApiVersion: 131077, helperVersion: 'fake-delayed-exit', libmpvVersion: 'fake-mpv',
    surfaceAttached: true,
    capabilities: ['private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution'],
    queueLimits: {maxPendingFrames: 128, maxPendingBytes: 262144}
  }
}));
const header = Buffer.alloc(4);
header.writeUInt32LE(payload.length);
process.stdout.write(Buffer.concat([header, payload]));
process.stdin.resume();
process.stdin.on('end', function () {
  setTimeout(function () { clearInterval(keepalive); process.exit(0); }, helperInstanceId.endsWith('-1') ? 1200 : 30);
});
