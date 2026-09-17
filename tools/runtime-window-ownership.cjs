'use strict';

const path = require('node:path');
const {fileURLToPath} = require('node:url');

function comparablePath(value, platform) {
  const resolved = path.resolve(value);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function classifyDocumentUrl(rawUrl, expectedApplicationPath, platform = process.platform) {
  if (typeof rawUrl !== 'string' || !rawUrl) {
    return {role: 'pending', reason: 'url-empty', urlClass: 'empty'};
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_) {
    return {role: 'auxiliary', reason: 'url-invalid', urlClass: 'invalid'};
  }
  if (parsed.protocol !== 'file:') {
    return {
      role: 'auxiliary',
      reason: 'non-file-document',
      urlClass: parsed.protocol === 'data:' ? 'data-document' : 'non-file-document'
    };
  }
  let actualPath;
  try {
    actualPath = fileURLToPath(parsed);
  } catch (_) {
    return {role: 'auxiliary', reason: 'file-url-invalid', urlClass: 'file-invalid'};
  }
  if (comparablePath(actualPath, platform) !== comparablePath(expectedApplicationPath, platform)) {
    return {role: 'auxiliary', reason: 'file-document-not-application', urlClass: 'file-other'};
  }
  return {role: 'application', reason: 'packaged-application-index', urlClass: 'file-application-index'};
}

function isDestroyed(window) {
  return !window || typeof window.isDestroyed === 'function' && window.isDestroyed();
}

function createWindowOwnership(options) {
  const settings = options || {};
  if (!settings.expectedApplicationPath) throw new Error('expectedApplicationPath is required');
  const classifications = [];
  const auxiliaryWindows = new WeakSet();
  const probedApplicationWindows = new WeakSet();
  let applicationWindow = null;
  let applicationProbeCount = 0;
  let auxiliaryWindowCount = 0;

  function record(window, classification, role, reason) {
    classifications.push({role, reason, urlClass: classification.urlClass});
    if (classifications.length > 64) classifications.shift();
    if (role === 'auxiliary' && window && !auxiliaryWindows.has(window)) {
      auxiliaryWindows.add(window);
      auxiliaryWindowCount++;
    }
  }

  function classifyWindow(window) {
    const rawUrl = window && window.webContents && typeof window.webContents.getURL === 'function'
      ? window.webContents.getURL()
      : '';
    return classifyDocumentUrl(rawUrl, settings.expectedApplicationPath, settings.platform || process.platform);
  }

  function handleLoaded(window) {
    const classification = classifyWindow(window);
    if (classification.role !== 'application') {
      record(window, classification, classification.role === 'pending' ? 'auxiliary' : classification.role, classification.reason);
      return {role: 'auxiliary', shouldStartProbe: false, classification};
    }
    if (applicationWindow && isDestroyed(applicationWindow)) applicationWindow = null;
    if (applicationWindow && applicationWindow !== window) {
      record(window, classification, 'auxiliary', 'application-already-bound');
      return {role: 'auxiliary', shouldStartProbe: false, classification: {...classification, reason: 'application-already-bound'}};
    }
    if (!applicationWindow) applicationWindow = window;
    const shouldStartProbe = !probedApplicationWindows.has(window);
    if (shouldStartProbe) {
      probedApplicationWindows.add(window);
      applicationProbeCount++;
    }
    record(window, classification, 'application', shouldStartProbe ? 'application-selected' : 'application-already-probed');
    return {role: 'application', shouldStartProbe, classification};
  }

  function getApplicationWindow() {
    if (applicationWindow && isDestroyed(applicationWindow)) applicationWindow = null;
    return applicationWindow;
  }

  function snapshot() {
    return {
      applicationWindowSelected: !!getApplicationWindow(),
      applicationWindowCount: applicationWindow ? 1 : 0,
      applicationProbeCount,
      auxiliaryWindowCount,
      classifications: classifications.map(item => ({...item}))
    };
  }

  return {classifyWindow, getApplicationWindow, handleLoaded, snapshot};
}

module.exports = {classifyDocumentUrl, createWindowOwnership};
