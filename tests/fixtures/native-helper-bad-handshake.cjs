'use strict';

const helperInstanceId = process.argv[2];
const payload = Buffer.from(JSON.stringify({
  protocolVersion: 1,
  type: 'lifecycle',
  scope: 'helper',
  helperInstanceId,
  name: 'ready',
  detail: {
    protocolVersion: 1,
    mpvClientApiVersion: 131077,
    helperVersion: 'bad-helper',
    libmpvVersion: 'fake-mpv',
    surfaceAttached: false,
    capabilities: [],
    queueLimits: {maxPendingFrames: 128, maxPendingBytes: 262144}
  }
}), 'utf8');
const header = Buffer.alloc(4);
header.writeUInt32LE(payload.length, 0);
process.stdout.write(Buffer.concat([header, payload]));
process.stdin.resume();
