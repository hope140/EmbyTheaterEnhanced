'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const routeStats = require('../src/electronapp/enhanced/playback-route-stats');

function values(category) {
    return Object.fromEntries(category.stats.map(function (stat) { return [stat.label, stat.value]; }));
}

test('route stats map DirectUrl, CD2 HTTP, Mount, native fallback, and ordinary media', () => {
    const direct = values(routeStats.makeStats({isStrm: true, route: 'direct-url', sourceKind: 'direct-url'}));
    assert.deepEqual(direct, {'播放源:': 'CD2 DirectUrl', 'STRM:': '是', 'CD2:': '命中', 'Mount:': '未使用', 'Fallback:': '否'});

    const cd2 = values(routeStats.makeStats({isStrm: true, route: 'cd2-http', sourceKind: 'cd2-url'}));
    assert.equal(cd2['播放源:'], 'CD2 HTTP');
    assert.equal(cd2['CD2:'], '命中');

    const mount = values(routeStats.makeStats({isStrm: true, route: 'mount', cd2Reason: 'timeout'}));
    assert.deepEqual(mount, {'播放源:': '本地挂载', 'STRM:': '是', 'CD2:': '超时', 'Mount:': '命中', 'Fallback:': '否'});

    const fallback = values(routeStats.makeStats({isStrm: true, route: 'native', reason: 'native_fallback', cd2Reason: 'missing_file'}));
    assert.deepEqual(fallback, {'播放源:': 'Emby 原生', 'STRM:': '是', 'CD2:': '未命中', 'Mount:': '未命中', 'Fallback:': '是'});

    const ordinary = values(routeStats.makeStats({isStrm: false, route: 'native', reason: 'not_strm'}));
    assert.deepEqual(ordinary, {'播放源:': 'Emby 原生', 'STRM:': '否'});
});

test('route stats clear at the next request, reject superseded writers, and clear on stop or destroy', () => {
    const state = routeStats.create();
    const requestA = {};
    const requestB = {};
    state.begin(requestA);
    assert.equal(state.commit(requestA, {isStrm: true, route: 'mount'}), true);
    assert.equal(values(state.category())['播放源:'], '本地挂载');

    state.begin(requestB);
    assert.equal(state.category(), null, 'a new request must not expose the previous route while resolving');
    assert.equal(state.commit(requestA, {isStrm: true, route: 'direct-url'}), false, 'a late superseded result must be rejected');
    assert.equal(state.commit(requestB, {isStrm: true, route: 'cd2-http'}), true);
    assert.equal(values(state.category())['播放源:'], 'CD2 HTTP');

    state.clear();
    assert.equal(state.category(), null, 'terminal stop or destroy must not leak a route into another playback');
});

test('libmpv appends one Enhanced category without replacing Media, Video, or Audio', () => {
    const libmpv = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');
    assert.match(libmpv, /Promise\.all\(\[getMediaStats\(\), getVideoStats\(\), getAudioStats\(\)\]\)/);
    assert.match(libmpv, /categories\.push\(responses\[i\]\)/);
    assert.match(libmpv, /enhancedRouteState && enhancedRouteState\.category\(\)/);
    assert.match(libmpv, /if \(enhancedCategory\) categories\.push\(enhancedCategory\)/);
});

test('prepared Emby Stats consumer passes a custom category through to its renderer', () => {
    const consumer = fs.readFileSync(path.join(__dirname, '../src/electronapp/www/modules/playerstats/playerstats.js'), 'utf8');
    assert.match(consumer, /var playerStats = responses\[0\]\.categories \|\| \[\]/);
    assert.match(consumer, /"audio" === category\.type/);
    assert.match(consumer, /"video" === category\.type/);
    assert.match(consumer, /categories\.push\(category\)/);
    assert.match(consumer, /stats\.length\s*&&\s*category\.name/);
});
