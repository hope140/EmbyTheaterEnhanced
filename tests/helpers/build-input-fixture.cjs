'use strict';

// One lazy seed per factory. No successful contract checks or runtimes are cached.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const contract = require('../../tools/build-input-contract.cjs');
const CONFIG_PATH = 'Emby.Theater.exe.config';
const CONFIG_ANCHOR = '<add key="ProgramDataPath" value=""/>';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function write(root, relative, value) {
    const file = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), {recursive: true});fs.writeFileSync(file, value);return file;
}
function json(root, relative, value) { return write(root, relative, JSON.stringify(value, null, 2) + '\n'); }
function git(root, args) {
    const result = cp.spawnSync('git', ['-C', root, ...args], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.error && result.error.message);
    return result.stdout.trim();
}
function populate(repo) {
    git(repo, ['init', '-q']);
    git(repo, ['config', 'user.name', 'Build Input Test']);
    git(repo, ['config', 'user.email', 'build-input@example.invalid']);
    git(repo, ['config', 'core.autocrlf', 'false']);

    for (const relativePath of contract.INPUT_PATHS) write(repo, relativePath, 'fixture input: ' + relativePath + '\n');
    json(repo, 'package.json', {name: 'build-input-fixture', version: '1.0.0'});
    json(repo, 'package-lock.json', {name: 'build-input-fixture', version: '1.0.0', lockfileVersion: 3, packages: {'': {version: '1.0.0'}}});
    const configBase = Buffer.from('<configuration>\n  ' + CONFIG_ANCHOR + '\n</configuration>\n', 'utf8');
    json(repo, 'vendor/runtime-manifest.json', {schemaVersion: 1, files: [{path: CONFIG_PATH, sha256: sha(configBase)}]});
    write(repo, 'vendor/carnival/' + CONFIG_PATH, configBase);
    require('./runtime-template-fixture.cjs').create(repo,{[CONFIG_PATH]:configBase});
    write(repo, 'docs/UNRELATED.md', 'unrelated committed documentation\n');
    git(repo, ['add', '--all']);
    git(repo, ['commit', '-q', '-m', 'fixture']);
    return configBase;
}
function createFactory(mode = 'seed') {
    if (!['seed', 'fresh'].includes(mode)) throw new Error('Unknown build input fixture preparation mode.');
    let fixtureSeed, closed = false;
    const live = new Set();
    function copySeed(repo) {
        if (!fixtureSeed) {
            const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'build-input-seed-')));
            const source = path.join(base, 'repo');
            try {
                fs.mkdirSync(source);
                const configBase = populate(source);
                fixtureSeed = {base, source, configBase};
            } catch (error) {
                try {fs.rmSync(base, {recursive: true, force: true});}
                catch (cleanupError) {throw new AggregateError([error, cleanupError], 'Fixture population and cleanup failed.', {cause: error});}
                throw error;
            }
        }
        fs.cpSync(fixtureSeed.source, repo, {recursive: true, force: false, errorOnExist: true,
            filter(source) {
                if (fs.lstatSync(source).isSymbolicLink()) throw new Error('Fixture seed redirects forbidden.');
                return true;
            }});
        return Buffer.from(fixtureSeed.configBase);
    }
    function create(temporaryRoot = os.tmpdir()) {
        if (closed) throw new Error('Fixture factory is closed.');
        // TEMP can use an alias; each owned root is resolved to its physical path.
        const base = fs.realpathSync.native(fs.mkdtempSync(path.join(temporaryRoot, 'build-input-contract-')));
        let cleaned = false;
        const cleanup = () => {
            if (!cleaned) {fs.rmSync(base, {recursive: true, force: true});cleaned = true;live.delete(cleanup);}
        };
        live.add(cleanup);
        try {
            const repo = path.join(base, 'repo'), runtime = path.join(base, 'runtime');
            fs.mkdirSync(repo);fs.mkdirSync(runtime);
            const configBase = mode === 'fresh' ? populate(repo) : copySeed(repo);
            return {base, repo, runtime, sourceCommit: git(repo, ['rev-parse', 'HEAD']), configBase, cleanup};
        } catch (error) {
            try {cleanup();}
            catch (cleanupError) {throw new AggregateError([error, cleanupError], 'Fixture creation and cleanup failed.', {cause: error});}
            throw error;
        }
    }
    function dispose() {
        closed = true;
        const errors = [];
        for (const cleanup of [...live]) {
            try {cleanup();} catch (error) {errors.push(error);}
        }
        if (fixtureSeed) {
            try {fs.rmSync(fixtureSeed.base, {recursive: true, force: true});fixtureSeed = undefined;}
            catch (error) {errors.push(error);}
        }
        if (errors.length) throw new AggregateError(errors, 'Fixture cleanup failed.');
    }
    return {create, dispose};
}
module.exports = {createFactory};
