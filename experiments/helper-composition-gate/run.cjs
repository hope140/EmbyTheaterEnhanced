'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [electron, binary, libmpv, media, outputArg] = process.argv.slice(2);
if (!outputArg) throw new Error('Usage: run.cjs electron binary-dir libmpv generated-media new-output-dir');
const output = path.resolve(outputArg);
if (fs.existsSync(output)) throw new Error('Choose a fresh output directory');
fs.mkdirSync(output, { recursive: true });
const env = {
  ...process.env,
  GATE_BINARY: path.resolve(binary),
  GATE_LIBMPV: path.resolve(libmpv),
  GATE_MEDIA: path.resolve(media),
  GATE_OUTPUT: output
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(path.resolve(electron), [path.join(__dirname, 'main.cjs')], {
  env,
  windowsHide: false,
  stdio: ['ignore', 'pipe', 'pipe']
});
function getProcessStartTime(pid) {
  const script = `$p=Get-Process -Id ${Number(pid)} -ErrorAction Stop; $p.StartTime.ToUniversalTime().ToString('o')`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 5000
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null;
}
const rootIdentity = { pid: child.pid, startTimeUtc: getProcessStartTime(child.pid) };
child.stdout.pipe(fs.createWriteStream(path.join(output, 'stdout.log')));
child.stderr.pipe(fs.createWriteStream(path.join(output, 'stderr.log')));
let timedOut = false;
let cleanup = { attempted: false, ownershipVerified: null, result: 'not-needed' };
const timer = setTimeout(() => {
  timedOut = true;
  const currentStartTime = getProcessStartTime(child.pid);
  const ownershipVerified = Boolean(rootIdentity.startTimeUtc && currentStartTime === rootIdentity.startTimeUtc);
  cleanup = { attempted: false, ownershipVerified, result: ownershipVerified ? 'pending' : 'skipped-unverified-owner' };
  if (child.exitCode === null && ownershipVerified) {
    cleanup.attempted = true;
    const killed = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    cleanup.result = killed.status === 0 ? 'taskkill-completed' : 'taskkill-failed';
  }
}, 150000);
child.on('error', error => { clearTimeout(timer); throw error; });
child.on('exit', (code, signal) => {
  clearTimeout(timer);
  const result = { rootIdentity, exitCode: code, signal, timedOut, naturalExit: !timedOut, cleanup };
  fs.writeFileSync(path.join(output, 'runner.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  process.exitCode = code === 0 && !timedOut ? 0 : 1;
});
