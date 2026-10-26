'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const {isUtf8} = require('node:buffer');
const TOKEN = 'synthetic-app-fixture-token', USER = 'fixture-user', SERVER = 'prefix-server';
const LIMIT = 65536;
const CORS_HEADERS = new Set(['content-type', 'authorization', 'x-emby-authorization', 'x-emby-token',
  'x-emby-client', 'x-emby-device-name', 'x-emby-device-id', 'x-emby-client-version', 'x-emby-language']);
async function createEmby({plan = {}, record = () => {}} = {}) {
  const files = Object.create(null);
  for (const id of ['A', 'B', 'C']) {
    const file = plan.media && !Array.isArray(plan.media) ? plan.media[id] : null;
    if (!file || file.id !== id || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 20 * 1048576 ||
        !Number.isFinite(file.durationSeconds) || file.durationSeconds <= 0 || file.durationSeconds > 120 ||
        !Number.isFinite(file.fps) || file.fps <= 0 || file.fps > 120 ||
        !Number.isSafeInteger(file.width) || file.width <= 0 || file.width > 1920 ||
        !Number.isSafeInteger(file.height) || file.height <= 0 || file.height > 1080) throw Error('fixture-media-plan-invalid');
    files[id] = {...file};
  }
  const sockets = new Set(), bodies = new Set(), websockets = new Set();
  const counts = {requests: 0, unknown: 0, denied: 0, reports: 0, websocketMessages: 0};
  let origin, closing, signedIn = false;
  let userConfiguration = {EnableNextEpisodeAutoPlay: plan.autoPlay !== false, ResumeRewindSeconds: 0, PlayDefaultAudioTrack: true};
  let displayPreferences = {Id: 'usersettings', CustomPrefs: {}, ScrollDirection: 'Horizontal'};
  function emit(category, data = {}) {try {Promise.resolve(record('emby-fixture', {category, ...data})).catch(() => {});} catch (_) {}}
  const user = () => ({Id: USER, Name: USER, ServerId: SERVER, HasPassword: true,
    Configuration: {...userConfiguration},
    Policy: {IsAdministrator: false, IsDisabled: false, EnableMediaPlayback: true, EnableAudioPlaybackTranscoding: false,
      EnableVideoPlaybackTranscoding: false, EnableContentDeletion: false, EnableAllFolders: true}});
  const system = () => ({Id: SERVER, ServerName: 'Owned loopback fixture', Version: '4.8.11.0',
    LocalAddress: origin, WanAddress: origin, SupportsHTTPS: false, StartupWizardCompleted: true, OperatingSystem: 'Windows'});
  function media(id) {
    const file = files[id];
    return {Id: id + '-avi', Container: 'strm', Protocol: 'Http', Path: 'X:\\Media\\' + id + '.avi',
      Size: file.size,
      RunTimeTicks: Math.round(file.durationSeconds * 10000000), SupportsDirectPlay: false, SupportsDirectStream: true,
      SupportsTranscoding: false, DirectStreamUrl: 'Videos/' + id + '/stream.avi?Static=true&mediaSourceId=' + id + '-avi',
      MediaStreams: [{Index: 0, Type: 'Video', Codec: 'rawvideo', Width: file.width, Height: file.height, RealFrameRate: file.fps}],
      DefaultSubtitleStreamIndex: -1};
  }
  const item = id => ({Id: id, ServerId: SERVER, Name: 'Synthetic ' + id, Type: 'Episode', MediaType: 'Video',
    SeriesId: 'synthetic-series', SeriesName: 'Synthetic series', SeasonId: 'synthetic-season', IndexNumber: 'ABC'.indexOf(id) + 1,
    ParentIndexNumber: 1, Path: 'X:\\Media\\' + id + '.strm', RunTimeTicks: media(id).RunTimeTicks,
    MediaSources: [media(id)], UserData: {PlaybackPositionTicks: 0, Played: false, IsFavorite: false}});
  const collection = items => ({Items: items, TotalRecordCount: items.length});
  function authorized(req, url, required) {
    if (req.headers.cookie || req.headers['proxy-authorization']) return false;
    const tokens = [];
    for (const [key, value] of url.searchParams) if (['api_key', 'x-emby-token'].includes(key.toLowerCase())) tokens.push(value);
    for (const key of ['x-emby-token', 'x-mediabrowser-token']) if (req.headers[key] !== undefined) tokens.push(req.headers[key]);
    for (const key of ['authorization', 'x-emby-authorization']) if (req.headers[key]) {
      const value = req.headers[key];
      if (!/^(?:MediaBrowser|Emby)\s/i.test(value)) return false;
      const token = /\bToken="([^"]*)"/i.exec(value);
      if (token) tokens.push(token[1]);
    }
    return tokens.every(value => value === TOKEN) && (!required || signedIn && tokens.length > 0);
  }
  async function body(req) {
    const chunks = []; let length = 0;
    for await (const chunk of req) {length += chunk.length; if (length > LIMIT) throw Error('body-limit'); chunks.push(chunk);}
    if (!length) return {};
    const text = Buffer.concat(chunks).toString('utf8');
    if ((req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
    const value = JSON.parse(text); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('body-shape'); return value;
  }
  function route(path) {
    if (/^\/(?:System\/Info\/Public|PublicSystemInfo)$/i.test(path)) return 'public-info';
    if (/^\/Users\/Public$/i.test(path)) return 'public-users';
    if (/^\/Users\/authenticatebyname$/i.test(path)) return 'login';
    if (/^\/System\/Info$/i.test(path)) return 'system-info';
    if (path === '/Users/' + USER) return 'user';
    if (path === '/Users/' + USER + '/Configuration') return 'configuration';
    if (path === '/Users/' + USER + '/Items/Root') return 'root-folder';
    if (path === '/Notifications/' + USER + '/Summary') return 'notification-summary';
    if (/^\/Videos\//i.test(path)) return 'media-denied';
    if (/^\/Items\/[ABC]\/PlaybackInfo$/.test(path)) return 'playback-info';
    if (new RegExp('^/Users/' + USER + '/Items/[ABC]$').test(path) || /^\/Items\/[ABC]$/.test(path)) return 'item';
    if (path === '/Users/' + USER + '/Items' || path === '/Items') return 'items';
    if (path === '/Shows/synthetic-series/Episodes') return 'episodes';
    if (path === '/Shows/NextUp') return 'next-up';
    if (/^\/Sessions\/Playing(?:\/Progress|\/Stopped)?$/.test(path)) return 'report';
    if (/^\/Sessions\/Capabilities(?:\/Full)?$/.test(path)) return 'capabilities';
    if (path === '/Sessions/Logout') return 'logout';
    if (path === '/Sessions') return 'sessions';
    if (path === '/System/Endpoint') return 'endpoint';
    if (path === '/DisplayPreferences/usersettings') return 'display-preferences';
    if ([`/Users/${USER}/Views`, `/Users/${USER}/Items/Resume`, '/LiveTv/Channels', '/LiveTv/Programs/Recommended',
      '/Channels', '/Genres', '/MusicGenres', '/Studios', '/Artists', '/Artists/AlbumArtists'].includes(path)) return 'empty-collection';
    if ([`/Users/${USER}/Items/Latest`, `/Users/${USER}/Items/A/Intros`, `/Users/${USER}/Items/B/Intros`,
      `/Users/${USER}/Items/C/Intros`, '/Notifications/' + USER, '/Plugins', '/Devices/CameraUploads'].includes(path)) return 'empty-array';
    return 'unknown';
  }
  const server = http.createServer((req, res) => {
    bodies.add(res); res.once('close', () => bodies.delete(res)); counts.requests++;
    const send = (status, value) => {res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(value === undefined ? '' : JSON.stringify(value));};
    (async () => {
      const url = new URL(req.url, 'http://127.0.0.1'), pathname = url.pathname.replace(/^\/emby(?=\/)/i, ''), category = route(pathname);
      const requestOrigin = req.headers.origin;
      if (requestOrigin !== undefined && requestOrigin !== 'null' && requestOrigin !== origin) {counts.denied++; send(403); req.resume(); return;}
      if (requestOrigin !== undefined) {res.setHeader('Access-Control-Allow-Origin', requestOrigin); res.setHeader('Vary', 'Origin');}
      if (req.method === 'OPTIONS') {
        const method = req.headers['access-control-request-method'], headerText = req.headers['access-control-request-headers'] || '';
        const requestedHeaders = headerText.toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (category === 'unknown') {counts.unknown++; emit('unknown-preflight', {method: 'OPTIONS'}); send(404); req.resume(); return;}
        if (requestOrigin === undefined || category === 'media-denied' || !['GET', 'POST'].includes(method) ||
            headerText.length > 1024 || requestedHeaders.some(value => !CORS_HEADERS.has(value)) ||
            !authorized(req, url, false)) {counts.denied++; send(403); req.resume(); return;}
        res.setHeader('Access-Control-Allow-Methods', method);
        if (requestedHeaders.length) res.setHeader('Access-Control-Allow-Headers', requestedHeaders.join(', '));
        send(204); req.resume(); return;
      }
      const safePath = category === 'unknown' && authorized(req, url, true) &&
        /^\/[A-Za-z0-9/_-]{1,160}$/.test(pathname) && !pathname.includes(TOKEN) ? pathname : undefined;
      emit(category, {method: ['GET', 'POST', 'OPTIONS'].includes(req.method) ? req.method : 'other',
        ...(safePath ? {pathname: safePath} : {})});
      if (!authorized(req, url, !['public-info', 'public-users', 'login'].includes(category))) {counts.denied++; send(403); req.resume(); return;}
      if (category === 'unknown') {counts.unknown++; send(404); req.resume(); return;}
      if (category === 'media-denied') {counts.denied++; send(403); req.resume(); return;}
      const post = ['login', 'report', 'capabilities', 'logout'];
      if (!(req.method === 'GET' && !post.includes(category) || req.method === 'POST' && [...post, 'playback-info', 'configuration', 'display-preferences'].includes(category))) {send(405); req.resume(); return;}
      const data = req.method === 'POST' ? await body(req) : {};
      if (req.method === 'POST' && category === 'configuration') {
        const allowed = {EnableNextEpisodeAutoPlay: value => typeof value === 'boolean', PlayDefaultAudioTrack: value => typeof value === 'boolean',
          ResumeRewindSeconds: value => Number.isSafeInteger(value) && value >= 0 && value <= 60};
        if (Object.keys(data).some(key => !Object.hasOwn(allowed, key) || !allowed[key](data[key]))) {send(400); return;}
        userConfiguration = {...userConfiguration, ...data}; send(204); return;
      }
      if (req.method === 'POST' && category === 'display-preferences') {
        if (Object.keys(data).some(key => !['Id', 'CustomPrefs', 'ScrollDirection', 'Client', 'UserId'].includes(key)) ||
            data.Id !== undefined && data.Id !== 'usersettings' || data.UserId !== undefined && data.UserId !== USER ||
            data.Client !== undefined && (typeof data.Client !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(data.Client)) ||
            data.ScrollDirection !== undefined && !['Horizontal', 'Vertical'].includes(data.ScrollDirection) ||
            data.CustomPrefs !== undefined && (!data.CustomPrefs || typeof data.CustomPrefs !== 'object' || Array.isArray(data.CustomPrefs) ||
              Object.keys(data.CustomPrefs).length > 64 || Object.entries(data.CustomPrefs).some(([key, value]) =>
                !/^[A-Za-z0-9_-]{1,64}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key) ||
                typeof value !== 'string' || value.length > 1024))) {send(400); return;}
        displayPreferences = {...displayPreferences, ...data, CustomPrefs: {...displayPreferences.CustomPrefs, ...data.CustomPrefs}};
        send(204); return;
      }
      if (category === 'login') {
        if (data.Username !== USER || data.Pw !== 'fixture-password') {counts.denied++; send(403); return;}
        signedIn = true;
        send(200, {User: user(), AccessToken: TOKEN, ServerId: SERVER, SessionInfo: {Id: 'synthetic-app-session', UserId: USER, ServerId: SERVER}}); return;
      }
      if (category === 'report') {
        if (!['A', 'B', 'C'].includes(data.ItemId) || data.MediaSourceId !== data.ItemId + '-avi' || data.PlaySessionId !== 'synthetic-session-' + data.ItemId) {send(400); return;}
        counts.reports++; emit('playing-report', {item: data.ItemId, phase: pathname.endsWith('/Stopped') ? 'stopped' : pathname.endsWith('/Progress') ? 'progress' : 'start'}); send(204); return;
      }
      if (['capabilities', 'logout'].includes(category)) {if (category === 'logout') {signedIn = false; for (const socket of websockets) socket.destroy();} send(204); return;}
      let value;
      if (['public-info', 'system-info'].includes(category)) value = system();
      else if (category === 'public-users') value = [user()];
      else if (category === 'user') value = user();
      else if (category === 'configuration') value = user().Configuration;
      else if (category === 'root-folder') value = {Id: 'synthetic-root', ServerId: SERVER, Name: 'Synthetic library', Type: 'Folder', IsFolder: true};
      else if (category === 'notification-summary') value = {UnreadCount: 0, MaxUnreadNotificationLevel: 'Normal'};
      else if (category === 'item') value = item(pathname.split('/').at(-1));
      else if (category === 'playback-info') {const id = pathname.split('/')[2]; value = {MediaSources: [media(id)], PlaySessionId: 'synthetic-session-' + id};}
      else if (category === 'items') {const ids = url.searchParams.get('Ids') || url.searchParams.get('ids') || 'A,B,C'; if (!/^[ABC](?:,[ABC])*$/.test(ids)) {send(400); return;} value = collection(ids.split(',').map(item));}
      else if (category === 'episodes') value = collection(['A', 'B', 'C'].map(item));
      else if (category === 'next-up') value = collection(['B', 'C'].map(item));
      else if (category === 'sessions') value = [{Id: 'synthetic-app-session', UserId: USER}];
      else if (category === 'endpoint') value = {IsLocal: true, IsInNetwork: true};
      else if (category === 'display-preferences') value = displayPreferences;
      else value = category === 'empty-array' ? [] : collection([]);
      send(200, value);
    })().catch(() => {if (!res.headersSent) send(400); else res.destroy();});
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxConnections = 32;
  server.on('connection', socket => {sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => {sockets.delete(socket); websockets.delete(socket);});});
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://127.0.0.1'), key = req.headers['sec-websocket-key'];
    if (url.pathname.toLowerCase() !== '/embywebsocket' && url.pathname.toLowerCase() !== '/websocket') {socket.destroy(); return;}
    if (!authorized(req, url, true) || req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
      !String(req.headers.connection).toLowerCase().split(/\s*,\s*/).includes('upgrade') ||
      req.headers['sec-websocket-version'] !== '13' || typeof key !== 'string' || !/^[A-Za-z0-9+/]{22}==$/.test(key)) {socket.destroy(); return;}
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64') + '\r\n\r\n');
    websockets.add(socket); let buffer = Buffer.alloc(0), messages = 0;
    const frame = (opcode, bytes) => {if (bytes.length > 125) {socket.destroy(); return;} socket.write(Buffer.concat([Buffer.from([0x80 | opcode, bytes.length]), bytes]));};
    const consume = chunk => {
      if (buffer.length + chunk.length > LIMIT) {socket.destroy(); return;}
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        const opcode = buffer[0] & 15; let length = buffer[1] & 127, at = 2;
        if ((buffer[0] & 0xf0) !== 0x80 || !(buffer[1] & 128) || ![1, 8, 9, 10].includes(opcode) || length === 127) {socket.destroy(); return;}
        if (length === 126) {if (buffer.length < 4) return; length = buffer.readUInt16BE(2); at = 4;}
        if (length > 4096 || opcode >= 8 && length > 125) {socket.destroy(); return;}
        if (buffer.length < at + 4 + length) return;
        const mask = buffer.subarray(at, at + 4), data = Buffer.from(buffer.subarray(at + 4, at + 4 + length));
        for (let i = 0; i < length; i++) data[i] ^= mask[i % 4];
        buffer = buffer.subarray(at + 4 + length);
        if (++messages > 256) {socket.destroy(); return;} counts.websocketMessages++;
        if (opcode === 8) {
          const code = data.length >= 2 ? data.readUInt16BE(0) : 1000;
          if (data.length === 1 || code < 1000 || code >= 5000 || [1004, 1005, 1006, 1015].includes(code) ||
              code >= 1016 && code < 3000 || !isUtf8(data.subarray(2))) {socket.destroy(); return;}
          frame(8, data); socket.end(); return;
        }
        if (opcode === 9) frame(10, data);
        if (opcode === 1) {try {if (!isUtf8(data)) throw Error(); const message = JSON.parse(data.toString('utf8')); if (!['KeepAlive', 'SessionsStart', 'SessionsStop', 'ScheduledTasksInfoStart', 'ScheduledTasksInfoStop'].includes(message.MessageType)) {socket.destroy(); return;}} catch (_) {socket.destroy(); return;}}
      }
    };
    socket.on('data', consume); if (head.length) consume(head);
  });
  try {await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});}
  catch (error) {for (const socket of sockets) socket.destroy(); throw error;}
  origin = 'http://127.0.0.1:' + server.address().port;
  return {origin, snapshot: () => ({...counts, sockets: sockets.size, activeBodies: bodies.size, websockets: websockets.size}), close() {
    return closing ||= (async () => {const closed = new Promise(resolve => server.close(resolve));
      const drained = [...sockets].map(socket => new Promise(resolve => {socket.once('close', resolve); socket.destroy();}));
      await Promise.all([closed, ...drained]); if (sockets.size || bodies.size || websockets.size) throw Error('fixture-close-incomplete');})();
  }};
}
module.exports = {createEmby};
