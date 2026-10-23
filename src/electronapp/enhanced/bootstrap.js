'use strict';

const fs = require('fs');
const path = require('path');

function resolveSeedPath(runtimeRoot) {
    return path.join(runtimeRoot, 'config', 'system.xml');
}

function seedFileIfMissing(source, destination) {
    if (fs.existsSync(destination)) return;
    try {
        fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    } catch (error) {
        if (!fs.existsSync(destination) || error.code !== 'EEXIST') throw error;
    }
}

function bootstrap(options) {
    const settings = options || {};
    const appDataPath = settings.appDataPath;
    const runtimeRoot = settings.runtimeRoot;
    if (!appDataPath || !runtimeRoot) throw new Error('appDataPath and runtimeRoot are required.');

    const profileRoot = path.join(appDataPath, 'EmbyTheaterEnhanced');
    const configDirectory = path.join(profileRoot, 'config');
    const systemConfig = path.join(configDirectory, 'system.xml');
    const seedPath = resolveSeedPath(runtimeRoot);

    fs.mkdirSync(configDirectory, {recursive: true});
    seedFileIfMissing(seedPath, systemConfig);

    return {profileRoot, configDirectory, systemConfig, seedPath};
}

module.exports = {bootstrap, resolveSeedPath};
