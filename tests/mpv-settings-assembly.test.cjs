'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {FakeScheduler} = require('./fixtures/refresh-rate-lifecycle.cjs');

const source = fs.readFileSync(path.join(__dirname, '..', 'src/electronapp/plugins/libmpv.js'), 'utf8');

// Case-sensitive Map-backed appSettings fixture; it is a test fixture, not a
// substitute for Emby's loader or a real client configuration.
function loadPlayer(refresh = {}) {
  const clock = new FakeScheduler();
  const settings = new Map();
  const appSettings = {get: key => settings.has(key) ? settings.get(key) : undefined, set: (key, value) => settings.set(key, value)};
  let factory;
  let subtitleAppearance = {};
  const listeners = new Map();
  const refreshRequests = [];
  const dispatch = name => (listeners.get(name) || []).slice().forEach(listener => listener({type: name}));
  const context = {
    define: (dependencies, callback) => { factory = callback; },
    addEventListener: (name, listener) => { const list = listeners.get(name) || []; list.push(listener); listeners.set(name, list); },
    removeEventListener: (name, listener) => { listeners.set(name, (listeners.get(name) || []).filter(item => item !== listener)); },
    dispatchEvent: event => { dispatch(event.type); },
    Event: function (name) { this.type = name; },
    console: {log() {}, warn() {}, error() {}}, Promise, Set, Map, Object, Array, String, Number, Math, parseInt, parseFloat, AbortController,
    CustomEvent: function (name, options) { this.type = name; this.detail = options && options.detail; },
    window: {platform: 'win32', innerWidth: 1920, innerHeight: 1080, PlayerWindowId: 'fixture-window', ipc: {send: () => Promise.resolve()}},
    screen: {width: 1920, height: 1080},
    Date: {now: () => clock.now},
    setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock),
    document: {
      querySelector: () => null,
      body: {firstChild: null, insertBefore() {}},
      createElement: () => ({classList: {add() {}, remove() {}}, style: {}, addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}})
    },
    XMLHttpRequest: class {
      open(method, url) { this.url = url; }
      send() {
        refreshRequests.push(this.url);
        if (this.url === 'electronrefreshrate://list_possible') this.response = refresh.rates || '';
        else if (this.url === 'electronrefreshrate://current') this.response = refresh.current || '';
        else if (this.url.startsWith('electronrefreshrate://change?rate=')) {
          this.response = 'Refresh rate ' + this.url.slice(this.url.indexOf('=') + 1);
        } else this.response = '';
        this.onload();
      }
    }
  };
  vm.runInNewContext(source, context, {filename: 'libmpv.js'});
  const playbackManager = {
    getSubtitleUrl: () => '',
    getPlayerState: () => ({volume: 50}),
    getCurrentItem: () => ({}),
    getPlayerSettings: () => ({}),
    addEventListener() {}, removeEventListener() {}
  };
  const pluginManager = {registerPlugin: (instance, id) => { instance.id = id; }, mapPath: (instance, file) => file};
  const events = {on() {}, off() {}};
  const router = {showVideoOsd: async () => {}, show: async () => {}, setTransparency() {}};
  const userSettings = {get: () => null, getSubtitleAppearanceSettings: () => subtitleAppearance};
  const modules = [
    {}, playbackManager, pluginManager, events, router, appSettings, userSettings,
    (names, callback) => callback(), {},
    {isStrm: () => false, resolveAsync: async context => ({type: 'native', source: context.nativeSource})},
    {}, {}, {}, {},
    {create: async () => ({mode: 'native-helper', endpoint: {style: {}, beginGeneration: async () => {},
      setProperties: async values => captured.push(values), sendCommand: async command => { if (Array.isArray(command) && command[0] === 'loadfile') dispatch('core-playing'); },
      addEventListener() {}, removeEventListener() {}, observeProperties: async () => {}, getProperty: async () => null,
      destroy: async () => {}}})}
  ];
  modules[13] = {install() {}, createNative: () => ({
    playbackStarted() {}, playbackReady() {}, playbackFailed() {}, loadingToken: () => null, install() {},
    admit: () => true, cancel() {}, isActive: () => false, beforeTeardown: async () => null
  })};
  const captured = [];
  const playbackOptions = () => captured.filter(value => Object.prototype.hasOwnProperty.call(value, 'audio-channels'));
  const Player = factory(...modules);
  const instance = new Player();
  return {instance, settings, captured: playbackOptions, refreshRequests,
    async settleDisplayChange(fps) {
      const pending = instance._onEstimatedVfFpsChanged(fps);
      for (let index = 0; index < 8; index++) await Promise.resolve();
      clock.advance(3000);
      return pending;
    },
    setSubtitleAppearance(value) { subtitleAppearance = value; }};
}

test('full AMD player assembles current video/audio settings from exact keys on consecutive Plays', async () => {
  const {instance, settings, captured, setSubtitleAppearance} = loadPlayer();
  settings.set('mpv-hwdec', 'unset');
  settings.set('mpv-gpuapi', 'vulkan');
  settings.set('mpv-vo', 'gpu');
  settings.set('mpv-outputlevels', 'full');
  settings.set('mpv-openglhq', 'true');
  settings.set('mpv-videosyncmode', 'display-resample');
  settings.set('mpv-interpolation', 'true');
  settings.set('mpv-exclusiveAudio', 'true');
  settings.set('mpv-speakerlayout', '5.1');
  settings.set('mpv-audiospdif', 'ac3,dts');
  settings.set('mpv-drc', '50');
  const options = {
    item: {MediaType: 'video', Type: 'Movie', Path: 'fixture.mkv'}, mediaType: 'video',
    mediaSource: {Path: 'fixture.mkv', RunTimeTicks: 10000000, MediaStreams: []},
    url: 'fixture.mkv', playMethod: 'DirectPlay', startPositionTicks: 0,
    _etePlayRequestId: 1
  };
  await instance.play(options);
  assert.equal(captured().length, 1);
  assert.equal(captured()[0].hwdec, undefined, 'unset omits hwdec');
  assert.equal(captured()[0]['gpu-api'], 'vulkan');
  assert.equal(captured()[0].vo, 'gpu');
  assert.equal(captured()[0]['video-output-levels'], 'full');
  assert.equal(captured()[0].profile, 'opengl-hq');
  assert.equal(captured()[0]['video-sync'], 'display-resample');
  assert.equal(captured()[0].interpolation, true);
  assert.equal(captured()[0]['audio-exclusive'], 'yes');
  assert.equal(captured()[0]['audio-channels'], '5.1,stereo');
  assert.equal(captured()[0]['audio-spdif'], 'ac3,dts');
  assert.equal(captured()[0]['ad-lavc-ac3drc'], 0.5);
  assert.equal(captured()[0].volume, 100, 'unset volume uses player state');

  settings.set('mpv-hwdec', 'Auto');
  settings.set('mpv-gpuapi', '');
  settings.set('mpv-vo', '');
  settings.set('mpv-outputlevels', '');
  settings.set('mpv-openglhq', 'false');
  settings.set('mpv-videosyncmode', '');
  settings.set('mpv-interpolation', 'false');
  settings.set('mpv-exclusiveAudio', false);
  settings.set('mpv-exclusiveaudio', 'true');
  settings.set('mpv-speakerlayout', 'Auto');
  settings.set('mpv-audiospdif', '');
  settings.set('mpv-drc', '');
  await instance.play({...options, _etePlayRequestId: 2});
  assert.equal(captured().length, 2);
  assert.equal(captured()[1].hwdec, 'Auto');
  assert.equal(captured()[1]['gpu-api'], undefined);
  assert.equal(captured()[1].vo, undefined);
  assert.equal(captured()[1]['video-output-levels'], undefined);
  assert.equal(captured()[1].profile, undefined);
  assert.equal(captured()[1]['video-sync'], undefined);
  assert.equal(captured()[1].interpolation, undefined);
  assert.equal(captured()[1]['audio-exclusive'], undefined, 'canonical false is not replaced by legacy true');
  assert.equal(captured()[1]['audio-channels'], 'Auto');
  assert.equal(captured()[1]['audio-spdif'], undefined);
  assert.equal(captured()[1]['ad-lavc-ac3drc'], 0);
  assert.equal(captured()[1].volume, 100, 'empty volume uses player state');

  settings.delete('mpv-exclusiveAudio');
  await instance.play({...options, _etePlayRequestId: 3});
  assert.equal(captured()[2]['audio-exclusive'], 'yes', 'legacy key is read only when canonical key is missing: ' + JSON.stringify(captured()[2]));

  settings.set('mpv-volume', '77');
  settings.set('mpv-demuxermaxbytes', '64000000');
  settings.set('mpv-outputlevels', 'limited');
  settings.set('mpv-videosyncmode', 'audio');
  settings.set('mpv-interpolation', 'true');
  settings.set('mpv-deinterlace', 'yes');
  settings.set('mpv-audiodelay', '120');
  settings.set('mpv-audiodelay2325', '240');
  settings.set('mpv-speakerlayout', '7.1');
  settings.set('mpv-audiospdif', 'ac3');
  settings.set('mpv-drc', '25');
  setSubtitleAppearance({textSize: 'small', textBackground: '#000000', textBackgroundOpacity: '0.5', textColor: '#ffffff'});
  const withStreams = {
    ...options,
    _etePlayRequestId: 4,
    mediaSource: {...options.mediaSource, MediaStreams: [
      {Type: 'Video', AverageFrameRate: 23, IsInterlaced: true}
    ]}
  };
  await instance.play(withStreams);
  const boundary23 = captured()[3];
  assert.equal(boundary23.volume, '77');
  assert.equal(boundary23['demuxer-max-bytes'], '64000000');
  assert.equal(boundary23['video-output-levels'], 'limited');
  assert.equal(boundary23['video-sync'], 'audio');
  assert.equal(boundary23.interpolation, true);
  assert.equal(boundary23['deinterlace'], 'yes');
  assert.equal(boundary23['audio-delay'], 0.24, '23 fps uses the 23-25 fps selector');
  assert.equal(boundary23['audio-channels'], '7.1,5.1,stereo');
  assert.equal(boundary23['audio-spdif'], 'ac3');
  assert.equal(boundary23['ad-lavc-ac3drc'], 0.25);
  assert.equal(boundary23['sub-font-size'], 45);
  assert.equal(boundary23['sub-back-color'], '0/0/0/0.5');
  assert.equal(boundary23['sub-color'], '#ffffff');

  settings.set('mpv-audiodelay', '360');
  settings.set('mpv-audiodelay2325', '480');
  const boundary25 = {...withStreams, _etePlayRequestId: 5, mediaSource: {...withStreams.mediaSource,
    MediaStreams: [{Type: 'Video', AverageFrameRate: 25, IsInterlaced: false}]}};
  await instance.play(boundary25);
  assert.equal(captured()[4]['audio-delay'], 0.48, '25 fps includes the 23-25 fps selector');
  assert.equal(captured()[4].deinterlace, 'yes', 'explicit deinterlace wins when the stream is progressive');

  const outside = {...withStreams, _etePlayRequestId: 6, mediaSource: {...withStreams.mediaSource,
    MediaStreams: [{Type: 'Video', AverageFrameRate: 25.01, IsInterlaced: true}]}};
  settings.set('mpv-deinterlace', '');
  await instance.play(outside);
  assert.equal(captured()[5]['audio-delay'], 0.36, 'outside the boundary uses the general audio delay');
  assert.equal(captured()[5].deinterlace, 'yes', 'unset deinterlace follows interlaced stream metadata');

  settings.set('mpv-deinterlace', 'no');
  settings.set('mpv-demuxermaxbytes', '');
  settings.set('mpv-interpolation', 'false');
  settings.set('mpv-videosyncmode', '');
  const normal = {...options, _etePlayRequestId: 7, mediaSource: {...options.mediaSource,
    MediaStreams: [{Type: 'Video', AverageFrameRate: 24, IsInterlaced: true}]}};
  await instance.play(normal);
  assert.equal(captured()[6].deinterlace, 'no', 'explicit no suppresses interlace auto detection');
  assert.equal(captured()[6]['demuxer-max-bytes'], undefined);
  assert.equal(captured()[6].interpolation, undefined);
  assert.equal(captured()[6]['video-sync'], undefined);
  assert.equal(captured()[6]['audio-delay'], 0.48);

  settings.set('mpv-upmixaudiofor', 'music');
  settings.set('mpv-speakerlayout', '5.1');
  const audioOnly = {
    ...options, _etePlayRequestId: 8,
    item: {MediaType: 'Audio', Type: 'Audio', Path: 'fixture.flac'},
    mediaSource: {Path: 'fixture.flac', RunTimeTicks: 10000000,
      MediaStreams: [{Type: 'Audio', Index: 1}]},
    url: 'fixture.flac'
  };
  await instance.play(audioOnly);
  assert.equal(captured()[7].af, 'lavfi=[pan=5.1|FL=FL|BL=FL|FR=FR|BR=FR|FC<0.5*FL + 0.5*FR]');
  assert.equal(captured()[7]['audio-channels'], '5.1,stereo');
  assert.equal(captured()[7]['audio-exclusive'], undefined, 'exclusive audio is only mapped for video');

  settings.set('mpv-speakerlayout', 'stereo');
  await instance.play({...audioOnly, _etePlayRequestId: 9});
  assert.equal(captured()[8]['audio-channels'], 'stereo');
  assert.equal(captured()[8].af, undefined, 'stereo does not generate a surround upmix filter');

  const videoWithMusicUpmix = {...options, _etePlayRequestId: 10};
  await instance.play(videoWithMusicUpmix);
  assert.equal(captured()[9].af, undefined, 'music upmix setting is ignored for video mediaType');

  const readahead = {...options, _etePlayRequestId: 11, mediaSource: {...options.mediaSource, RunTimeTicks: null}};
  await instance.play(readahead);
  assert.equal(captured()[10]['demuxer-readahead-secs'], 1800, 'missing runtime requests the existing fixed readahead');
  const recording = {...options, _etePlayRequestId: 12, item: {...options.item, Type: 'Recording'}};
  await instance.play(recording);
  assert.equal(captured()[11]['demuxer-readahead-secs'], 1800, 'recordings request the existing fixed readahead');
});

test('display sync override selects only through synthetic refresh-rate fixtures', async () => {
  const {instance, settings, refreshRequests, settleDisplayChange} = loadPlayer({rates: '60;120;144', current: '60'});
  settings.set('mpv-displaysync', 'true');
  settings.set('mpv-displaysync_override', '120;144');
  await instance.play({
    item: {MediaType: 'video', Type: 'Movie', Path: 'refresh-fixture.mkv'},
    mediaSource: {Path: 'refresh-fixture.mkv', RunTimeTicks: 10000000, MediaStreams: []},
    url: 'refresh-fixture.mkv', playMethod: 'DirectPlay', _etePlayRequestId: 1
  });
  assert.deepEqual(refreshRequests, [
    'electronrefreshrate://list_possible', 'electronrefreshrate://current'
  ], 'startup reads only synthetic list/current responses');
  await settleDisplayChange(24);
  assert.deepEqual(refreshRequests, [
    'electronrefreshrate://list_possible', 'electronrefreshrate://current',
    'electronrefreshrate://change?rate=120'
  ], 'synthetic change URL records the selected override rate without a real system write');

  for (const value of [undefined, '', 'false']) {
    const disabled = loadPlayer({rates: '60;120;144', current: '60'});
    if (value !== undefined) disabled.settings.set('mpv-displaysync', value);
    await disabled.instance.play({
      item: {MediaType: 'video', Type: 'Movie', Path: 'disabled-fixture.mkv'},
      mediaSource: {Path: 'disabled-fixture.mkv', RunTimeTicks: 10000000, MediaStreams: []},
      url: 'disabled-fixture.mkv', playMethod: 'DirectPlay', _etePlayRequestId: 1
    });
    await disabled.instance._onEstimatedVfFpsChanged(24);
    assert.equal(disabled.refreshRequests.some(url => url.startsWith('electronrefreshrate://change?')),
      false, 'disabled setting ' + String(value) + ' does not request a rate change');
  }

  const noOverride = loadPlayer({rates: '60;120;144', current: '60'});
  noOverride.settings.set('mpv-displaysync', 'true');
  noOverride.settings.set('mpv-displaysync_override', '');
  await noOverride.instance.play({
    item: {MediaType: 'video', Type: 'Movie', Path: 'default-rate-fixture.mkv'},
    mediaSource: {Path: 'default-rate-fixture.mkv', RunTimeTicks: 10000000, MediaStreams: []},
    url: 'default-rate-fixture.mkv', playMethod: 'DirectPlay', _etePlayRequestId: 1
  });
  await noOverride.settleDisplayChange(24);
  assert.ok(noOverride.refreshRequests.includes('electronrefreshrate://change?rate=120'),
    'empty override falls back to the first compatible synthetic rate');
});
