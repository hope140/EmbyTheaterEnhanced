'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 48_000;
const DURATION_SECONDS = 2;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const FRAME_COUNT = SAMPLE_RATE * DURATION_SECONDS;
const AMPLITUDE = 8_192;

function writeAscii(buffer, offset, value) {
  buffer.write(value, offset, value.length, 'ascii');
}

function createWav(frequencyHz) {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataSize = FRAME_COUNT * CHANNELS * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  writeAscii(buffer, 0, 'RIFF');
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeAscii(buffer, 8, 'WAVE');
  writeAscii(buffer, 12, 'fmt ');
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // WAVE_FORMAT_PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * bytesPerSample, 28);
  buffer.writeUInt16LE(CHANNELS * bytesPerSample, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  writeAscii(buffer, 36, 'data');
  buffer.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
    // The phase and integer quantization are intentionally fixed so that the
    // same Node runtime produces byte-identical media on every run.
    const sample = Math.round(AMPLITUDE * Math.sin((2 * Math.PI * frequencyHz * frame) / SAMPLE_RATE));
    buffer.writeInt16LE(sample, 44 + frame * bytesPerSample);
  }
  return buffer;
}

function generateMedia(outputDirectory) {
  const directory = path.resolve(outputDirectory || path.join(__dirname, '.work', 'media'));
  fs.mkdirSync(directory, { recursive: true });

  const records = [
    ['A.wav', 440],
    ['B.wav', 660],
    ['C.wav', 880],
  ].map(([fileName, frequencyHz]) => {
    const filePath = path.join(directory, fileName);
    const contents = createWav(frequencyHz);
    fs.writeFileSync(filePath, contents, { flag: 'w' });
    return {
      name: fileName,
      path: filePath,
      size: contents.length,
      sha256: crypto.createHash('sha256').update(contents).digest('hex'),
      frequencyHz,
      sampleRate: SAMPLE_RATE,
      durationSeconds: DURATION_SECONDS,
      channels: CHANNELS,
      bitsPerSample: BITS_PER_SAMPLE,
    };
  });

  return records;
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify({
      format: 'WAV PCM',
      deterministic: true,
      files: generateMedia(process.argv[2]),
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`generate-media failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  BITS_PER_SAMPLE,
  CHANNELS,
  DURATION_SECONDS,
  SAMPLE_RATE,
  createWav,
  generateMedia,
};
