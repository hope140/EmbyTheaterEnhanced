'use strict';

const fs = require('node:fs');
const path = require('node:path');
const directory = process.argv[2];
if (!directory) throw new Error('Supply an output directory for the two test media files.');
const fixtures = [
    {name: 'transition-a.y4m', y: 80, u: 100, v: 230},
    {name: 'transition-b.y4m', y: 150, u: 90, v: 45}
];
for (const fixture of fixtures) {
    if (fs.existsSync(path.join(directory, fixture.name))) throw new Error('Test media already exists; choose a new directory.');
}
fs.mkdirSync(directory, {recursive: true});
for (const fixture of fixtures) {
    const file = path.join(directory, fixture.name);
    const output = fs.openSync(file, 'wx');
    try {
        fs.writeSync(output, 'YUV4MPEG2 W96 H64 F30:1 Ip A1:1 C420jpeg\n');
        for (let frame = 0; frame < 900; frame++) {
            const luma = Buffer.alloc(96 * 64, fixture.y + frame % 9);
            const x = frame % 88;
            for (let row = 0; row < 64; row++) luma.fill(210, row * 96 + x, row * 96 + x + 8);
            fs.writeSync(output, 'FRAME\n');
            fs.writeSync(output, luma);
            fs.writeSync(output, Buffer.alloc(96 * 64 / 4, fixture.u));
            fs.writeSync(output, Buffer.alloc(96 * 64 / 4, fixture.v));
        }
    } finally { fs.closeSync(output); }
}
console.log(JSON.stringify({status: 'created', frames: 900, fps: 30, files: fixtures.map(item => item.name)}));
