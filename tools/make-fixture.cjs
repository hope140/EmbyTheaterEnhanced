'use strict';
const fs = require('fs');

const output = process.argv[2];
const secondsText = process.argv[3];
const seconds = secondsText === undefined ? 5 : Number(secondsText);

function fail(message) {
    process.stderr.write(message + '\n');
    process.exitCode = 1;
}

if (!output || fs.existsSync(output)) {
    fail('Supply a new output path.');
} else if (secondsText !== undefined && !/^\d+$/.test(secondsText)) {
    fail('Seconds must be an integer from 3 to 120.');
} else if (!Number.isSafeInteger(seconds) || seconds < 3 || seconds > 120) {
    fail('Seconds must be an integer from 3 to 120.');
} else {
    const frame = Buffer.concat([Buffer.from('FRAME\n'), Buffer.alloc(64 * 64, 100), Buffer.alloc(64 * 64 / 4, 90), Buffer.alloc(64 * 64 / 4, 180)]);
    const header = Buffer.from('YUV4MPEG2 W64 H64 F30:1 Ip A1:1 C420jpeg\n');
    fs.writeFileSync(output, Buffer.concat([header, ...Array(seconds * 30).fill(frame)]));
}
