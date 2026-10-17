'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function objectEnd(source, open) {
    let depth = 0, quote = null, escaped = false, lineComment = false, blockComment = false;
    for (let index = open; index < source.length; index++) {
        const current = source[index], next = source[index + 1];
        if (lineComment) { if (current === '\n') lineComment = false; continue; }
        if (blockComment) { if (current === '*' && next === '/') {blockComment = false; index++;} continue; }
        if (quote) { if (escaped) escaped = false; else if (current === '\\') escaped = true; else if (current === quote) quote = null; continue; }
        if (current === '/' && next === '/') {lineComment = true; index++; continue;}
        if (current === '/' && next === '*') {blockComment = true; index++; continue;}
        if (current === '"' || current === "'" || current === '`') {quote = current; continue;}
        if (current === '{') depth++;
        if (current === '}' && --depth === 0) return index + 1;
    }
    throw new Error('Unclosed source-bound fixture block');
}

function namedFunction(source, name) {
    const start = source.indexOf('function ' + name + '(');
    assert(start >= 0, name);
    const open = source.indexOf('{', start);
    return source.slice(start, objectEnd(source, open));
}

function pluginRoutes(root) {
    return [
        ['cecinput', 'src/electronapp/plugins/cec.js'],
        ['libmpvmediaplayer', 'src/electronapp/plugins/libmpv.js']
    ].flatMap(([id, file]) => {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        const assignment = source.indexOf('getRoutes = function () {');
        assert(assignment >= 0, file);
        const start = source.indexOf('function', assignment), open = source.indexOf('{', start);
        const owner = {id};
        const getRoutes = vm.runInNewContext('(' + source.slice(start, objectEnd(source, open)) + ')', {
            self: owner,
            pluginManager: {mapPath: (instance, relative) => '/plugins/' + instance.id + '/' + relative}
        }, {timeout: 1000, filename: file});
        return Array.from(getRoutes.call(owner), route => ({...route, pluginId: id}));
    });
}

function appSettingsRoutes(source, supports = feature => feature === 'keyboardsettings' || feature === 'fileinput') {
    const routes = [];
    const start = source.indexOf('appHost.supports("keyboardsettings")');
    const search = source.indexOf('path: "/search"', start);
    const end = source.lastIndexOf('appRouter.addRoute(', search);
    assert(start >= 0 && search > start && end > start);
    // Execute the original registration expression, including comments and
    // capability conditions; scanning object literals would include dead routes.
    const registration = source.slice(start, end).trim().replace(/,$/, '');
    vm.runInNewContext('(' + registration + ')', {
        appHost: {supports}, appRouter: {addRoute: route => routes.push(route)}
    }, {timeout: 1000});
    return routes;
}

module.exports = {namedFunction, pluginRoutes, appSettingsRoutes};
