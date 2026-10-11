'use strict';

const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

if (process.argv.length !== 3) throw new Error('Usage: node make-subtitle-race-fixture.cjs <output-dir>');
const outputDir = path.resolve(process.argv[2]);
fs.mkdirSync(outputDir, {recursive: true});

function stamp(ms) {
    const seconds = Math.floor(ms / 1000);
    return `00:00:${String(seconds).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

function subtitle(label) {
    const cues = [];
    for (let ms = 0, index = 1; ms < 45000; ms += 500, index++) {
        cues.push(`${index}\n${stamp(ms)} --> ${stamp(ms + 490)}\n${label}\n`);
    }
    return cues.join('\n');
}

const media = path.join(outputDir, 'media-one.mkv');
const secondMedia = path.join(outputDir, 'media-two.mkv');
const externalA = path.join(outputDir, 'external-a.srt');
const externalB = path.join(outputDir, 'external-b.srt');
fs.writeFileSync(externalA, subtitle('EXTERNAL A'), 'ascii');
fs.writeFileSync(externalB, subtitle('EXTERNAL B'), 'ascii');

const args = ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=24:d=45',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=45',
    '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-shortest',
    '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact',
    '-metadata', 'creation_time=1970-01-01T00:00:00Z', media];
const run = childProcess.spawnSync('ffmpeg', args, {encoding: 'utf8', windowsHide: true});
if (run.error || run.status !== 0) throw new Error('Synthetic media generation failed');
fs.copyFileSync(media, secondMedia);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
process.stdout.write(JSON.stringify({mediaSha256: sha256(media), secondMediaSha256: sha256(secondMedia),
    externalASha256: sha256(externalA), externalBSha256: sha256(externalB), durationSeconds: 45}) + '\n');
