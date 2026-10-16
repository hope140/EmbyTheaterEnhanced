'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const movieBrowser = require('../src/electronapp/enhanced/library/movie-browser.js');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

function makeOwner(options = {itemType: 'Movie'}, getItems = () => Promise.resolve({Items: []})) {
    const owner = {
        options,
        apiClient: {
            userId: 'user-a',
            getCurrentUserId() { return this.userId; }
        },
        getItems,
        initItemsContainer() {
            this.itemsContainer = {
                fetchData: null,
                refreshItemsInternal: function () {
                    const controller = new AbortController();
                    return this.fetchData({StartIndex: 0, Limit: 30}, controller.signal);
                }
            };
            // Matches ItemsTab -> ListController.initItemsContainer binding order.
            this.itemsContainer.fetchData = this.getItems.bind(this);
            return this.itemsContainer;
        },
        onResume(options) {
            this.resumeCalls = (this.resumeCalls || 0) + 1;
            this.resumeOptions = options;
            return options && options.fetch ? this.itemsContainer.fetchData(options.query, options.signal) : 'resumed';
        },
        onPause() { this.pauseCalls = (this.pauseCalls || 0) + 1; return 'paused'; },
        destroy() { this.destroyCalls = (this.destroyCalls || 0) + 1; return 'destroyed'; }
    };
    movieBrowser.install(owner);
    return owner;
}

function rejectionOf(promise) {
    // Attach the rejection handler immediately so cancellation tests never leave an
    // unhandled rejection while the simulated transport is still pending.
    return promise.then(
        () => { throw new Error('Expected request to reject.'); },
        error => error
    );
}

test('installs only for Movie and wraps the post-install container binding', async () => {
    const original = function (query, signal) { return Promise.resolve({query, signal}); };
    const episode = makeOwner({itemType: 'Episode'}, original);
    assert.equal(episode.getItems, original);
    assert.equal(episode._eteMovieBrowse, undefined);

    const owner = makeOwner({itemType: 'Movie'}, original);
    const state = owner._eteMovieBrowse;
    assert.ok(state);
    movieBrowser.install(owner);
    assert.equal(owner._eteMovieBrowse, state, 'repeated installation is idempotent');

    const container = owner.initItemsContainer();
    assert.equal(typeof container.fetchData, 'function');
    const resultPromise = owner.onResume({fetch: true, query: {StartIndex: 30, Limit: 30}});
    const result = await resultPromise;
    assert.equal(result.query.StartIndex, 30);
    assert.equal(result.query.Limit, 30);
    assert.ok(result.signal instanceof AbortSignal);
    assert.equal(result.signal.aborted, false);
    assert.equal(state.paused, false);
});

test('preserves the paging DTO and successful result, and passes an abortable signal through', async () => {
    const query = {StartIndex: 60, Limit: 30, EnableTotalRecordCount: false};
    const payload = {Items: [{Id: 'movie-1'}], TotalRecordCount: 91};
    let receivedQuery;
    let receivedSignal;
    const owner = makeOwner({itemType: 'Movie'}, (value, signal) => {
        receivedQuery = value;
        receivedSignal = signal;
        return Promise.resolve(payload);
    });
    owner.initItemsContainer();
    owner.onResume();

    const result = await owner.itemsContainer.fetchData(query);
    assert.equal(receivedQuery, query);
    assert.equal(result, payload);
    assert.ok(receivedSignal instanceof AbortSignal);
    assert.equal(receivedSignal.aborted, false);
});

test('preserves the underlying error object when a current request fails', async () => {
    const transportError = new Error('transport failed');
    const owner = makeOwner({itemType: 'Movie'}, () => Promise.reject(transportError));
    owner.initItemsContainer();
    owner.onResume();

    await assert.rejects(owner.itemsContainer.fetchData({StartIndex: 0, Limit: 30}), error => error === transportError);
});

test('caller abort immediately rejects and aborts the underlying request; late success is ignored', async () => {
    const transport = deferred();
    let transportSignal;
    const owner = makeOwner({itemType: 'Movie'}, (_query, signal) => {
        transportSignal = signal;
        return transport.promise;
    });
    owner.initItemsContainer();
    owner.onResume();

    const caller = new AbortController();
    const pending = rejectionOf(owner.itemsContainer.fetchData({StartIndex: 0, Limit: 30}, caller.signal));
    await Promise.resolve();
    caller.abort();
    const error = await pending;
    assert.equal(error.name, 'AbortError');
    assert.equal(transportSignal.aborted, true);
    transport.resolve({Items: [{Id: 'late'}]});
    await Promise.resolve();
});

test('refreshItemsInternal aborts pending work before starting the new page request', async () => {
    const older = deferred();
    const newer = deferred();
    const signals = [];
    let call = 0;
    const owner = makeOwner({itemType: 'Movie'}, (_query, signal) => {
        signals.push(signal);
        return (++call === 1 ? older : newer).promise;
    });
    const container = owner.initItemsContainer();
    owner.onResume();

    const firstError = rejectionOf(container.fetchData({StartIndex: 0, Limit: 30}));
    await Promise.resolve();
    const second = container.refreshItemsInternal();
    const secondResult = second.then(
        result => ({result}),
        error => ({error})
    );
    assert.equal((await firstError).name, 'AbortError');
    assert.equal(signals[0].aborted, true);
    assert.equal(signals[1].aborted, false);

    const expected = {Items: [{Id: 'new-page'}]};
    newer.resolve(expected);
    assert.deepEqual(await secondResult, {result: expected});
    older.reject(new Error('late old failure'));
    await Promise.resolve();
});

test('pause and destroy immediately abort their pending request', async t => {
    for (const lifecycle of ['onPause', 'destroy']) {
        await t.test(lifecycle, async () => {
            const transport = deferred();
            let transportSignal;
            const owner = makeOwner({itemType: 'Movie'}, (_query, signal) => {
                transportSignal = signal;
                return transport.promise;
            });
            owner.initItemsContainer();
            owner.onResume();

            const pending = rejectionOf(owner.itemsContainer.fetchData({StartIndex: 0, Limit: 30}));
            await Promise.resolve();
            assert.equal(owner[lifecycle](), lifecycle === 'onPause' ? 'paused' : 'destroyed');
            assert.equal((await pending).name, 'AbortError');
            assert.equal(transportSignal.aborted, true);
            transport.resolve({Items: []});
            await Promise.resolve();
        });
    }
});

test('drops a late success after the active user changes', async () => {
    const transport = deferred();
    let transportStarted = false;
    const owner = makeOwner({itemType: 'Movie'}, () => {
        transportStarted = true;
        return transport.promise;
    });
    owner.initItemsContainer();
    owner.onResume();

    const pending = rejectionOf(owner.itemsContainer.fetchData({StartIndex: 0, Limit: 30}));
    await Promise.resolve();
    assert.equal(transportStarted, true);
    owner.apiClient.userId = 'user-b';
    transport.resolve({Items: [{Id: 'from-user-a'}]});
    assert.equal((await pending).name, 'AbortError');
});

test('a user change also discards a late transport failure', async () => {
    const transport = deferred();
    let transportStarted = false;
    const owner = makeOwner({itemType: 'Movie'}, () => {
        transportStarted = true;
        return transport.promise;
    });
    owner.initItemsContainer();
    owner.onResume();

    const pending = rejectionOf(owner.itemsContainer.fetchData({StartIndex: 0, Limit: 30}));
    await Promise.resolve();
    assert.equal(transportStarted, true);
    owner.apiClient.userId = 'user-b';
    const lateError = new Error('old account request failed');
    transport.reject(lateError);
    const error = await pending;
    assert.equal(error.name, 'AbortError');
});

test('a user change before transport dispatch cancels without sending the old page query', async () => {
    let transportCalls = 0;
    const owner = makeOwner({itemType: 'Movie'}, () => {
        transportCalls++;
        return Promise.resolve({Items: []});
    });
    owner.initItemsContainer();
    owner.onResume();

    const pending = rejectionOf(owner.itemsContainer.fetchData({StartIndex: 30, Limit: 30}));
    owner.apiClient.userId = 'user-b';
    assert.equal((await pending).name, 'AbortError');
    await Promise.resolve();
    assert.equal(transportCalls, 0);
});

test('without refresh, lifecycle still delegates to the existing resume and preserves its result', async () => {
    const owner = makeOwner({itemType: 'Movie'});
    const container = owner.initItemsContainer();
    const options = {refresh: false, autoFocus: true};
    assert.equal(owner.onResume(options), 'resumed');
    assert.equal(owner.resumeCalls, 1);
    assert.equal(owner.resumeOptions, options);
    assert.equal(owner.itemsContainer, container);
    assert.equal(owner._eteMovieBrowse.paused, false);
});
