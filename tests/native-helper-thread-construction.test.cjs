'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(process.env.ETE_NATIVE_CONSTRUCTOR_SOURCE ||
    path.join(__dirname, '../native/mpv-helper/ete-mpv-helper.cpp'), 'utf8');

// This is a source contract for the two fixed classes, not a C++ parser or a
// scheduler test. Member initialization precedes the constructor body; an eager
// thread member is safe only when every other member has already initialized.
function startsAfterMembers(text, name, member, firstMethod) {
    const marker = 'class ' + name + ' {';
    assert.equal(text.split(marker).length, 2, 'unique class boundary');
    const begin = text.indexOf(marker);
    const fieldsEnd = text.indexOf(firstMethod, begin);
    assert.ok(fieldsEnd > begin, 'field block boundary');
    const fields = text.slice(begin, fieldsEnd).replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, '');
    const declaration = new RegExp('std::thread\\s+' + member + '\\s*;', 'g');
    const matches = [...fields.matchAll(declaration)];
    assert.equal(matches.length, 1, 'unique owned thread member');
    const threadIsLast = fields.slice(matches[0].index + matches[0][0].length).trim() === '';

    const constructor = text.indexOf('explicit ' + name + '(', fieldsEnd);
    const destructor = text.indexOf('~' + name + '()', constructor);
    assert.ok(constructor > fieldsEnd && destructor > constructor, 'constructor boundary');
    const bodyBegin = text.indexOf('{', constructor);
    assert.ok(bodyBegin < destructor, 'constructor body boundary');
    const initializer = text.slice(constructor, bodyBegin);
    const body = text.slice(bodyBegin, destructor);
    const eager = new RegExp('\\b' + member + '\\s*\\(\\s*&' + name + '::run\\s*,\\s*this\\s*\\)').test(initializer);
    const bodyStart = new RegExp('\\b' + member + '\\s*=\\s*std::thread\\s*\\(\\s*&' + name + '::run\\s*,\\s*this\\s*\\)').test(body);
    assert.ok(eager || bodyStart, 'recognized owned thread start');
    return eager ? threadIsLast : bodyStart;
}

test('construction guard rejects early publication and accepts two safe member orders', () => {
    const example = (fields, initializer, body = '') => 'class Guard {\n' + fields +
        '\nvoid run() {}\npublic:\nexplicit Guard(HANDLE handle) : ' + initializer +
        ' {' + body + '}\n~Guard() {}\n};';
    const early = 'HANDLE output;\nstd::thread worker;\nstd::atomic<bool> state{false};';
    const late = 'HANDLE output;\nstd::atomic<bool> state{false};\nstd::thread worker;';
    const inspect = value => startsAfterMembers(value, 'Guard', 'worker', 'void run()');
    assert.equal(inspect(example(early, 'output(handle), worker(&Guard::run, this)')), false);
    assert.equal(inspect(example(late, 'output(handle), worker(&Guard::run, this)')), true);
    assert.equal(inspect(example(early, 'output(handle)', 'worker = std::thread(&Guard::run, this);')), true);
});

for (const [name, member, firstMethod] of [
    ['WriterQueue', 'writer', 'static bool writeAll('],
    ['InputReader', 'reader', 'void setFailure(']
]) {
    test(name + ' starts its worker after member state initialization', () => {
        assert.equal(startsAfterMembers(source, name, member, firstMethod), true);
    });
}
