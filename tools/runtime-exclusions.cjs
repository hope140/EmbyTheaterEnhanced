'use strict';

const fs = require('fs');
const path = require('path');

// These inputs remain in the immutable Carnival archive inventory for
// provenance, but are deliberately absent from every Enhanced runtime.
const RETIRED_COMPATIBILITY_PATHS = Object.freeze([
  'external/Anime4K/Anime4K-off.conf',
  'external/emby.disable/www/modules/layout.css',
  'external/emby.disable/www/modules/themes/darkgradient/theme.css',
  'external/emby.enable/www/modules/layout.css',
  'external/emby.enable/www/modules/themes/darkgradient/theme.css',
  'external/Presets/fonts/Source Han Serif SC-Bold.ttf',
  'Emby.ConfigureAndUninstall.bat',
  'Emby.Dialog.bat',
  'external/Presets/mpv.conf'
]);
const RETIRED_SMALL_RUNTIME_PATHS = Object.freeze(['\u6ce8\u610f\u4e8b\u9879.txt', 'cec-driver/cancel']);
const RETIRED_WEB_PATHS = Object.freeze(['electronapp/www/modules/CustomCssJS.js',
  'electronapp/www/modules/themes/logo.png',
  'electronapp/www/settings/cameraupload.js',
  'electronapp/www/settings/cameraupload.html',
  'electronapp/www/components/directorybrowser/directorybrowser.css',
  'electronapp/www/modules/emby-apiclient/appstorage-cache.js',
  'electronapp/www/serviceworker-app.js']);
const RETIRED_CEC_RUNTIME_PATHS = Object.freeze([
  'cec/cec-client.exe', 'cec/cec-client.x64.exe', 'cec/cec.dll', 'cec/cec.x64.dll',
  'cec/p8-usbcec-driver-installer.exe', 'electronapp/cec/cec.js',
  'electronapp/cec/command-map.js', 'electronapp/plugins/cec.js',
  'electronapp/plugins/cec/cec.js', 'electronapp/plugins/cec/cec.html'
]);
const RETIRED_RUNTIME_PATHS = Object.freeze([
  'electronapp/libmpv/x64/mpv-win32-x64.node',
  ...RETIRED_COMPATIBILITY_PATHS,
  ...RETIRED_SMALL_RUNTIME_PATHS,
  ...RETIRED_WEB_PATHS,
  ...RETIRED_CEC_RUNTIME_PATHS,
  'ServiceStack.Text.dll', 'ServiceStack.Text.xml', 'SharpCompress.dll'
]);

function runtimeFile(root, relativePath) {
  if (typeof root !== 'string' || !root || typeof relativePath !== 'string' ||
      !relativePath || relativePath.includes('\\') || relativePath.startsWith('/') ||
      relativePath.split('/').includes('..') || relativePath.split('/').includes('.')) {
    throw new Error('Invalid runtime exclusion path.');
  }
  const runtimeRoot = path.resolve(root);
  const target = path.resolve(runtimeRoot, ...relativePath.split('/'));
  if (!target.startsWith(runtimeRoot + path.sep)) throw new Error('Runtime exclusion escaped its root.');
  return target;
}

function verify(root) {
  const present = RETIRED_RUNTIME_PATHS.filter(relativePath => {
    try { fs.lstatSync(runtimeFile(root, relativePath)); return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  });
  return {
    schemaVersion: 1,
    status: present.length === 0 ? 'passed' : 'failed',
    excludedPaths: [...RETIRED_RUNTIME_PATHS],
    presentPaths: present
  };
}

function remove(root) {
  const removed = [];
  for (const relativePath of RETIRED_RUNTIME_PATHS) {
    const target = runtimeFile(root, relativePath);
    if (!fs.existsSync(target)) continue;
    if (RETIRED_CEC_RUNTIME_PATHS.includes(relativePath)) throw new Error('CEC must be omitted by assembly, not deleted after copying: '+relativePath);
    if (!fs.statSync(target).isFile()) throw new Error('Runtime exclusion target is not a file: ' + relativePath);
    fs.rmSync(target);
    removed.push(relativePath);
  }
  const result = verify(root);
  if (result.status !== 'passed') throw new Error('Runtime exclusion failed: ' + result.presentPaths.join(','));
  return Object.assign(result, {removedPaths: removed});
}

if (require.main === module) {
  const [command, root] = process.argv.slice(2);
  if (!command || !root || !['remove', 'verify'].includes(command)) {
    throw new Error('Usage: runtime-exclusions.cjs <remove|verify> <runtime>');
  }
  const result = command === 'remove' ? remove(path.resolve(root)) : verify(path.resolve(root));
  process.stdout.write(JSON.stringify(result) + '\n');
  if (result.status !== 'passed') process.exitCode = 1;
}

module.exports = {RETIRED_RUNTIME_PATHS, RETIRED_CEC_RUNTIME_PATHS, RETIRED_COMPATIBILITY_PATHS, RETIRED_SMALL_RUNTIME_PATHS, RETIRED_WEB_PATHS, remove, runtimeFile, verify};
