'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), net = require('node:net');
const {once} = require('node:events');
const {createEmby} = require('../tools/shared-playback-cache/app-emby-fixture.cjs');
const plan = {media: Object.fromEntries(['A', 'B', 'C'].map((id, index) => [id,
  {id, size: 1000000 + index * 1000, fps: 12 + index * 6, durationSeconds: 16 - index * 4, width: 320, height: 180}]))};
async function setup(t) {const rows = [], server = await createEmby({plan, record: (event, value) => rows.push({event, ...value})}); t.after(() => server.close()); return {server, rows};}
async function login(server) {
  const response = await fetch(server.origin + '/Users/authenticatebyname', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({Username: 'fixture-user', Pw: 'fixture-password'})});
  assert.equal(response.status, 200); return response.json();
}
test('real login returns a synthetic session used by actual authenticated metadata requests', async t => {
  const {server} = await setup(t);
  assert.equal((await fetch(server.origin + '/System/Info/Public')).status, 200);
  const auth = await login(server), headers = {'X-Emby-Token': auth.AccessToken};
  assert.equal(auth.User.Id, 'fixture-user'); assert.equal(auth.ServerId, 'prefix-server');
  const user = await (await fetch(server.origin + '/Users/fixture-user', {headers})).json(); assert.equal(user.Configuration.EnableNextEpisodeAutoPlay, true);
  const playback = await (await fetch(server.origin + '/Items/B/PlaybackInfo', {method: 'POST', headers, body: '{}'})).json();
  assert.equal(playback.MediaSources[0].Path, 'X:\\Media\\B.avi');
  assert.equal(playback.PlaySessionId, 'synthetic-session-B');
  for (const id of ['A', 'B', 'C']) {
    // Production ApiClient switches JSON requests to text/plain + reqformat=json.
    const response = await fetch(server.origin + '/emby/Items/' + id + '/PlaybackInfo?reqformat=json&X-Emby-Token=' + auth.AccessToken,
      {method: 'POST', headers: {'Content-Type': 'text/plain'}, body: JSON.stringify({UserId: auth.User.Id})});
    assert.equal(response.status, 200);
    const media = (await response.json()).MediaSources[0], expected = plan.media[id];
    assert.equal(media.Size, expected.size); assert.equal(media.RunTimeTicks, expected.durationSeconds * 10000000);
    assert.equal(media.MediaStreams[0].RealFrameRate, expected.fps);
    assert.equal(media.MediaStreams[0].Width, expected.width); assert.equal(media.MediaStreams[0].Height, expected.height);
  }
  assert.equal((await fetch(server.origin + '/' + playback.MediaSources[0].DirectStreamUrl, {headers})).status, 403);
  await server.close(); assert.equal(server.snapshot().sockets, 0); assert.equal(server.snapshot().activeBodies, 0);
});
test('maintained WakeOnLan API consumes an authenticated empty array without broadcast capability', async t => {
  const fs = require('node:fs'), vm = require('node:vm');
  const {server, rows} = await setup(t), auth = await login(server), headers = {'X-Emby-Token': auth.AccessToken};
  const sdk = fs.readFileSync(require.resolve('../src/electronapp/www/modules/emby-apiclient/mit-apiclient.js'), 'utf8');
  const extract = (startText, endText) => {
    const start = sdk.indexOf(startText), end = sdk.indexOf(endText, start);
    assert.ok(start >= 0 && end > start, 'maintained SDK method boundaries must exist');
    return sdk.slice(start, end);
  };
  const helpers = extract('function getCachedWakeOnLanInfo(instance) {', 'function compareVersions(');
  const methods = [
    extract('    getWakeOnLanInfo() {', '    getLatestItems('),
    extract('    supportsWakeOnLan() {', '    wakeOnLan() {'),
    extract('    wakeOnLan() {', '    setSystemInfo(')
  ].join('\n');
  assert.match(methods, /getJSON\(this\.getUrl\('System\/WakeOnLanInfo'\)\)/);
  const context = {console: {log() {}}};
  const loaded = vm.runInNewContext(`(function () { ${helpers} return {Api: class { ${methods} }, refreshWakeOnLanInfo}; })()`, context);
  const api = new loaded.Api();
  const stored = new Map(); let sends = 0;
  api.appStorage = {getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value)};
  api.serverId = () => auth.ServerId;
  api._wakeOnLan = {isSupported: () => true, send: () => {sends++; return Promise.resolve();}};
  api.getUrl = path => server.origin + '/emby/' + path;
  api.getJSON = async url => {const response = await fetch(url, {headers}); assert.equal(response.status, 200); return response.json();};

  assert.deepEqual(await api.getWakeOnLanInfo(), []);
  loaded.refreshWakeOnLanInfo.call(api);
  const deadline = Date.now() + 1000;
  while (stored.get('server-' + auth.ServerId + '-wakeonlaninfo') !== '[]' && Date.now() < deadline)
    await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(stored.get('server-' + auth.ServerId + '-wakeonlaninfo'), '[]');
  assert.equal(api.supportsWakeOnLan(), false);
  await api.wakeOnLan();
  assert.equal(sends, 0, 'an empty response cannot create MAC entries or send a wake-on-LAN broadcast');

  const preflight = await fetch(server.origin + '/emby/System/WakeOnLanInfo', {method: 'OPTIONS', headers: {
    Origin: 'null', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'X-Emby-Token'
  }});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'null');
  assert.equal((await fetch(server.origin + '/emby/System/WakeOnLanInfo')).status, 403);
  assert.equal((await fetch(server.origin + '/emby/System/WakeOnLanInfo', {method: 'POST', headers})).status, 405);
  const unknownBefore = server.snapshot().unknown;
  assert.equal((await fetch(server.origin + '/emby/System/WakeOnLanInfo/extra', {headers})).status, 404);
  assert.equal(server.snapshot().unknown, unknownBefore + 1);
  assert.deepEqual(rows.filter(row => row.category === 'wake-on-lan-info').map(row => row.method), ['GET', 'GET', 'GET', 'POST']);
  assert.equal(rows.find(row => row.category === 'unknown' && row.pathname === '/System/WakeOnLanInfo/extra')?.category, 'unknown');
});
test('unknown routes, external credentials and wrong login fail closed without recording secrets', async t => {
  const {server, rows} = await setup(t), auth = await login(server);
  assert.equal((await fetch(server.origin + '/unknown?secret=never-log', {headers: {'X-Emby-Token': auth.AccessToken}})).status, 404);
  assert.equal((await fetch(server.origin + '/System/Info/Public', {headers: {Authorization: 'Bearer never-log'}})).status, 403);
  assert.equal((await fetch(server.origin + '/Users/fixture-user?api_key=never-log')).status, 403);
  assert.equal((await fetch(server.origin + '/Users/authenticatebyname', {method: 'POST', body: JSON.stringify({Username: 'real-user', Pw: 'never-log'})})).status, 403);
  assert.equal(JSON.stringify(rows).includes('never-log'), false); assert.equal(JSON.stringify(rows).includes('real-user'), false);
  assert.equal(rows.find(row => row.category === 'unknown').pathname, '/unknown');
  const count = rows.length;
  await fetch(server.origin + '/unsafe%20path?api_key=' + auth.AccessToken);
  assert.equal(rows[count].pathname, undefined);
});
test('playing reports validate real session and media source identifiers', async t => {
  const {server, rows} = await setup(t), auth = await login(server), headers = {'X-Emby-Token': auth.AccessToken};
  for (const suffix of ['', '/Progress', '/Stopped']) {
    assert.equal((await fetch(server.origin + '/Sessions/Playing' + suffix, {method: 'POST', headers,
      body: JSON.stringify({ItemId: 'A', MediaSourceId: 'A-avi', PlaySessionId: 'synthetic-session-A'})})).status, 204);
  }
  assert.equal((await fetch(server.origin + '/Sessions/Playing', {method: 'POST', headers, body: JSON.stringify({ItemId: 'A'})})).status, 400);
  assert.deepEqual(rows.filter(row => row.category === 'playing-report').map(row => row.phase), ['start', 'progress', 'stopped']);
});
function masked(opcode, text) {const bytes = Buffer.from(text), mask = Buffer.from([1, 2, 3, 4]), data = Buffer.from(bytes); for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4]; return Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | bytes.length]), mask, data]);}
test('real websocket handshake ping pong close and owned socket cleanup', {timeout: 5000}, async t => {
  const {server} = await setup(t), auth = await login(server), url = new URL(server.origin);
  const socket = net.connect(Number(url.port), '127.0.0.1'); t.after(() => socket.destroy());
  await once(socket, 'connect');
  const handshake = once(socket, 'data');
  socket.write('GET /embywebsocket?api_key=' + auth.AccessToken + '&deviceId=fixture-device HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
  assert.match((await handshake)[0].toString(), /101 Switching Protocols/);
  const pong = once(socket, 'data'); socket.write(masked(9, 'ping')); assert.deepEqual((await pong)[0], Buffer.from([0x8a, 4, 112, 105, 110, 103]));
  const closed = once(socket, 'close'); socket.write(masked(8, '')); socket.resume(); await closed;
  await server.close(); assert.equal(server.snapshot().websockets, 0); assert.equal(server.snapshot().sockets, 0);
});
test('missing or mismatched media rows fail before listening instead of borrowing B for C', async () => {
  await assert.rejects(createEmby({}), /fixture-media-plan-invalid/);
  await assert.rejects(createEmby({plan: {media: {...plan.media, C: undefined}}}), /fixture-media-plan-invalid/);
  await assert.rejects(createEmby({plan: {media: {...plan.media, C: plan.media.B}}}), /fixture-media-plan-invalid/);
});
test('SDK root notification and preference routes stay scoped to synthetic user and reject permission changes', async t => {
  const {server} = await setup(t), auth = await login(server), headers = {'X-Emby-Token': auth.AccessToken, 'Content-Type': 'text/plain'};
  const call = (route, value) => fetch(server.origin + '/emby/' + route, {headers, ...(value === undefined ? {} : {method: 'POST', body: JSON.stringify(value)})});
  const root = await (await call('Users/fixture-user/Items/Root')).json();
  assert.equal(root.Id, 'synthetic-root'); assert.equal(root.Type, 'Folder'); assert.equal(root.IsFolder, true);
  assert.deepEqual(await (await call('Notifications/fixture-user/Summary')).json(), {UnreadCount: 0, MaxUnreadNotificationLevel: 'Normal'});
  assert.equal((await call('DisplayPreferences/usersettings', {Id: 'usersettings', CustomPrefs: {theme: 'dark'}})).status, 204);
  assert.equal((await (await call('DisplayPreferences/usersettings')).json()).CustomPrefs.theme, 'dark');
  assert.equal((await call('Users/fixture-user/Configuration', {EnableNextEpisodeAutoPlay: false, ResumeRewindSeconds: 5})).status, 204);
  const user = await (await call('Users/fixture-user')).json();
  assert.equal(user.Configuration.EnableNextEpisodeAutoPlay, false); assert.equal(user.Configuration.ResumeRewindSeconds, 5); assert.equal(user.Policy.IsAdministrator, false);
  assert.equal((await call('Users/fixture-user/Configuration', {IsAdministrator: true})).status, 400);
  assert.equal((await call('Users/fixture-user/Configuration', {ResumeRewindSeconds: -1})).status, 400);
  assert.equal((await call('DisplayPreferences/usersettings', {CustomPrefs: {theme: 'x'.repeat(1025)}})).status, 400);
  assert.equal((await call('Users/other/Configuration', {EnableNextEpisodeAutoPlay: true})).status, 404);
  assert.equal((await call('still-unknown')).status, 404);
});
test('file renderer CORS preflight permits only known routes methods headers and owned origins without token', async t => {
  const {server} = await setup(t);
  const headers = {Origin: 'null', 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'Content-Type, X-Emby-Authorization, X-Emby-Token, X-Emby-Client, X-Emby-Device-Name, X-Emby-Device-Id, X-Emby-Client-Version'};
  const preflight = await fetch(server.origin + '/emby/Users/authenticatebyname', {method: 'OPTIONS', headers});
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'null');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
  for (const changes of [{Origin: 'https://foreign.invalid'}, {'Access-Control-Request-Method': 'DELETE'},
    {'Access-Control-Request-Headers': 'X-Foreign-Secret'}]) {
    assert.equal((await fetch(server.origin + '/System/Info', {method: 'OPTIONS', headers: {...headers, ...changes}})).status, 403);
  }
  assert.equal((await fetch(server.origin + '/unknown', {method: 'OPTIONS', headers})).status, 404);
  const actual = await fetch(server.origin + '/System/Info/Public', {headers: {Origin: 'null'}});
  assert.equal(actual.status, 200); assert.equal(actual.headers.get('access-control-allow-origin'), 'null');
  assert.equal((await fetch(server.origin + '/System/Info/Public', {headers: {Origin: server.origin}})).headers.get('access-control-allow-origin'), server.origin);
  const denied = await fetch(server.origin + '/System/Info/Public', {headers: {Origin: 'https://foreign.invalid'}});
  assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('fresh ordinary cinema-mode playback consumes authenticated Intros as the real PM collection contract', async t => {
  const fs = require('node:fs'), vm = require('node:vm');
  const {server, rows} = await setup(t), auth = await login(server);
  const headers = {'X-Emby-Token': auth.AccessToken};
  // Execute the maintained ApiClient method, then the fixed PM's actual intro
  // consumer. Only the downstream playback implementation is a unit checkpoint;
  // this test is not a Native or ordinary-main execution claim.
  const sdk = fs.readFileSync(require.resolve('../src/electronapp/www/modules/emby-apiclient/apiclient.js'), 'utf8');
  const method = sdk.slice(sdk.indexOf('    getIntros(itemId, signal) {'), sdk.indexOf('    getNextUpEpisodes(', sdk.indexOf('    getIntros(itemId, signal) {')));
  assert.match(method, /getJSON/);
  const Api = vm.runInNewContext('(class {' + method + '})');
  const api = new Api();
  api.getCurrentUserId = () => auth.User.Id;
  api.getUrl = route => server.origin + '/emby/' + route;
  api.getJSON = async (url, signal) => {const response = await fetch(url, {headers, signal}); assert.equal(response.status, 200); return response.json();};
  const pm = fs.readFileSync(require.resolve('../vendor/web-snapshot/www/modules/common/playback/playbackmanager.js'), 'utf8');
  const begin = pm.indexOf('    function playWithIntrosInternal('), end = pm.indexOf('    function playWithIntros(', begin);
  assert.ok(begin > 0 && end > begin);
  let entered = 0;
  const consume = vm.runInNewContext('(' + pm.slice(begin,end) + ')', {
    _usersettings: {default: {enableCinemaMode: () => true}},
    _loading: {default: {show() {}, hide() {}}}, self: {},
    getDefaultIntros() {throw Error('the ordinary enabled-cinema branch must request actual fixture Intros');},
    playInternal(item, options) {entered++; return Promise.resolve({id: item.Id, count: options.items.length});}
  });
  for (const id of ['A', 'B', 'C']) {
    const item = await (await fetch(server.origin + '/emby/Users/' + auth.User.Id + '/Items/' + id, {headers})).json();
    const result = await consume([item], item, api, 0, {fullscreen: true});
    assert.equal(result.id, id); assert.equal(result.count, 1);
    assert.deepEqual(await api.getIntros(id), {Items: [], TotalRecordCount: 0});
  }
  assert.equal(entered, 3);
  assert.ok(rows.some(row => row.category === 'intros'), 'intros has a dedicated safe route category');
  assert.equal((await fetch(server.origin + '/Users/fixture-user/Items/A/Intros')).status, 403);
  assert.equal((await fetch(server.origin + '/Users/fixture-user/Items/Latest', {headers})).status, 200);
  assert.deepEqual(await (await fetch(server.origin + '/Users/fixture-user/Items/Latest', {headers})).json(), [], 'SDK Latest array keeps its separate contract');
});
