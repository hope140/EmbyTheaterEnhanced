'use strict';
const probe = require('./source-probe');
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 256) : '';
const index = value => Number.isSafeInteger(value) && value >= 0 && value <= 99999;
const MAX_ITEMS = 512;
function episodeTitle(item, seriesName) {
    const name = clean(item.Name) || 'Video';
    if (item.Type !== 'Episode') return name;
    const serial = index(item.ParentIndexNumber) && index(item.IndexNumber) ?
        'S' + String(item.ParentIndexNumber).padStart(2, '0') + 'E' + String(item.IndexNumber).padStart(2, '0') : '';
    return [clean(item.SeriesName) || clean(seriesName), serial, name].filter(Boolean).join(' - ').slice(0, 256);
}
async function enumerate(context, signal, dependencies = {}) {
    if (!['serverId', 'accountId', 'itemId'].every(key => identifier(context[key]))) throw probe.failure('invalid-request');
    const server = probe.sourceUrl(context.serverAddress);
    if (server.search || server.hash) throw probe.failure('invalid-server');
    server.pathname = server.pathname.replace(/\/+$/, '') + '/';
    const combined = AbortSignal.any([AbortSignal.timeout(60000), ...(signal ? [signal] : [])]);
    const json = dependencies.jsonRequest || probe.jsonRequest, headers = {'X-Emby-Token': context.token};
    const read = relative => json(new URL(relative, server).href, headers, combined);
    function alive() {if (combined.aborted) throw probe.failure(signal?.aborted ? 'cancelled' : 'timeout');}
    try {
        alive();
        const info = await read('System/Info/Public'); alive();
        if (info.Id !== context.serverId) throw probe.failure('server-changed');
        const user = await read('Users/' + context.accountId); alive();
        if (user.Id !== context.accountId || user.Policy?.EnableContentDownloading !== true) throw probe.failure('download-not-permitted');
        const parent = await read('Users/' + context.accountId + '/Items/' + context.itemId); alive();
        if (parent.Id !== context.itemId || parent.ServerId && parent.ServerId !== context.serverId || !['Season', 'Series'].includes(parent.Type)) throw probe.failure('collection-unavailable');
        const episodes = [], seen = new Set(); let total;
        for (let start = 0; ; ) {
            const url = new URL('Users/' + context.accountId + '/Items', server);
            for (const [key, value] of Object.entries({ParentId: parent.Id, Recursive: 'true', IncludeItemTypes: 'Episode', Fields: 'ParentId,SortName',
                SortBy: 'SortName', SortOrder: 'Ascending', EnableImages: 'false', EnableUserData: 'true', EnableTotalRecordCount: 'true', StartIndex: String(start), Limit: '100'})) url.searchParams.set(key, value);
            const page = await json(url.href, headers, combined); alive();
            if (!Array.isArray(page.Items) || page.Items.length > 100 || !Number.isSafeInteger(page.TotalRecordCount) || page.TotalRecordCount < 0) throw probe.failure('collection-invalid');
            if (page.TotalRecordCount > MAX_ITEMS) throw probe.failure('collection-too-large');
            if (total !== undefined && total !== page.TotalRecordCount) throw probe.failure('collection-changed');
            total = page.TotalRecordCount;
            if (start + page.Items.length > total || !page.Items.length && start < total) throw probe.failure('collection-invalid');
            for (const item of page.Items) {
                if (!identifier(item.Id) || seen.has(item.Id) || item.Type !== 'Episode' || item.ServerId && item.ServerId !== context.serverId ||
                    (parent.Type === 'Series' ? item.SeriesId !== parent.Id : (item.SeasonId || item.ParentId) !== parent.Id)) throw probe.failure('collection-invalid');
                seen.add(item.Id);
                const sources = Array.isArray(item.MediaSources) ? item.MediaSources : [];
                episodes.push({id: item.Id, title: episodeTitle(item, parent.Type === 'Series' ? parent.Name : parent.SeriesName),
                    mediaSourceId: sources.length === 1 && identifier(sources[0].Id) ? sources[0].Id : null,
                    season: index(item.ParentIndexNumber) ? item.ParentIndexNumber : 0, episode: index(item.IndexNumber) ? item.IndexNumber : 0,
                    played: typeof item.UserData?.Played === 'boolean' ? item.UserData.Played : null});
            }
            start += page.Items.length;
            if (start === total) break;
        }
        if (!episodes.length) throw probe.failure('collection-empty');
        episodes.sort((a, b) => a.season - b.season || a.episode - b.episode || a.title.localeCompare(b.title));
        return {title: clean(parent.Name) || (parent.Type === 'Season' ? '本季' : '本剧'), type: parent.Type, episodes};
    } catch (error) {
        const result = probe.failure(combined.aborted ? signal?.aborted ? 'cancelled' : 'timeout' : probe.reasonOf(error));
        result.downloadStage = 'collection-list';
        if (Number.isInteger(error.httpStatus)) result.httpStatus = error.httpStatus;
        throw result;
    }
}
module.exports = {enumerate, episodeTitle, MAX_ITEMS};
