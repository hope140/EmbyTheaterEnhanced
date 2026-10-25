'use strict';
const fs = require('node:fs'), path = require('node:path');
const FLAG = '--ete-retention-context-trial';
function physicalFuturePath(value) {
    let probe = path.resolve(value); const suffix = [];
    while (true) {
        try {return path.join(fs.realpathSync(probe), ...suffix.reverse());}
        catch (error) {
            if (error.code !== 'ENOENT') throw error;
            try {if (fs.lstatSync(probe).isSymbolicLink()) throw Error('retention-protected-path-unresolved');}
            catch (statError) {if (statError.code !== 'ENOENT') throw statError;}
            const parent = path.dirname(probe); if (parent === probe) throw error;
            suffix.push(path.basename(probe)); probe = parent;
        }
    }
}
function prepareLaunch(argv, protectedPaths = []) {
    const related = argv.filter(v => /^--ete-retention(?:-|=|$)/i.test(v));
    if (!related.length) return Object.freeze({enabled: false});
    const invalid = () => {throw Error('retention-context-trial-launch-invalid');};
    if (argv.filter(v => v === FLAG).length !== 1 || argv.some(v => /^--ete-range-cache(?:-|=|$)/i.test(v)) ||
        related.some(v => v !== FLAG && !v.startsWith('--ete-retention-profile='))) return invalid();
    const paths = argv.filter(v => v.startsWith('--ete-retention-profile=')); if (paths.length !== 1) return invalid();
    const profile = paths[0].slice('--ete-retention-profile='.length);
    try {
        const overlaps = protectedPaths.some(value => {
            const root = physicalFuturePath(value);
            const trial = path.resolve(profile);
            const inside = (parent, child) => {const relative = path.relative(parent, child); return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);};
            return inside(root, trial) || inside(trial, root);
        });
        if (overlaps) return invalid();
        if (!path.isAbsolute(profile) || /^\\\\/.test(profile) || fs.realpathSync(profile) !== path.resolve(profile) || !fs.lstatSync(profile).isDirectory() || fs.lstatSync(profile).isSymbolicLink()) return invalid();
        const marker = path.join(profile, 'ete-retention-context-trial-owner');
        if (!fs.readdirSync(profile).length) fs.writeFileSync(marker, 'ETE retention context-only trial v1\n', {flag: 'wx', mode: 0o600});
        if (!fs.lstatSync(marker).isFile() || fs.lstatSync(marker).isSymbolicLink() || fs.readFileSync(marker, 'utf8') !== 'ETE retention context-only trial v1\n') return invalid();
        const directories = {};
        for (const name of ['electron', 'local', 'mpv', 'tmp']) {
            const full = path.join(profile, name); fs.mkdirSync(full, {recursive: true, mode: 0o700});
            if (fs.realpathSync(full) !== full || fs.lstatSync(full).isSymbolicLink()) return invalid(); directories[name] = full;
        }
        return Object.freeze({enabled: true, mode: 'retention-context-only', profile, directories, config: null});
    } catch (_) {return invalid();}
}
module.exports = {prepareLaunch};
