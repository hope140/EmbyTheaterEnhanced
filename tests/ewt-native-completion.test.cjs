'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('native seek completion samples time-pos at playback-restart under the existing media attribution', () => {
    const source = fs.readFileSync(path.join(__dirname, '../native/mpv-helper/ete-mpv-helper.cpp'), 'utf8');
    const start = source.indexOf('        if (event->event_id == MPV_EVENT_PLAYBACK_RESTART) {');
    const end = source.indexOf('        if (event->event_id == MPV_EVENT_PROPERTY_CHANGE)', start);
    assert.ok(start > 0 && end > start);
    const restart = source.slice(start, end);
    assert.match(restart, /p_mpv_get_property\(mpv, "time-pos", MPV_FORMAT_DOUBLE, &position\) >= 0/);
    assert.match(restart, /std::isfinite\(position\) && position >= 0/);
    assert.match(restart, /seekMedia >= 0 && pendingSeekMedia == seekMedia/);
    assert.ok(restart.indexOf('pendingSeekMedia = -1') < restart.indexOf('p_mpv_get_property'),
        'consume completion before the read, so failure or a duplicate restart cannot replay it');
    assert.match(source, /MPV_EVENT_SEEK\) \{\s*pendingSeekMedia = uniqueOpenMedia\(\)/);
    assert.match(restart, /routeRecord\(\{int\(event->event_id\), eventName\(event->event_id\), seekMedia,\s*"playback-restart", std::to_string\(position\)/);
    assert.ok(restart.indexOf('routeRecord') < restart.indexOf('if (autoStage.load()'), 'presentation capture cannot gate the position notification');
    const attributed = source.slice(source.indexOf('    void emitAttributed('), source.indexOf('    void routeRecord('));
    const coalescing = attributed.match(/bool coalescible = ([^;]+);/)[1];
    assert.doesNotMatch(coalescing, /playback-restart/);
    assert.match(attributed, /writer.enqueue\(std::move\(payload\), !coalescible/);
});
