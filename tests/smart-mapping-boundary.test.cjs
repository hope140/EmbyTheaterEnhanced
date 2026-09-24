const test = require('node:test');
const assert = require('node:assert/strict');

const boundary = require('../src/electronapp/resolvers/smart-mapping-boundary');
const pathRules = require('../src/electronapp/resolvers/path-rules');
const strmResolver = require('../src/electronapp/resolvers/strm-resolver');

function sample(sourcePath, cloudPath, mountPath) {
    const value = {sourcePath, cloudPath};
    if (mountPath !== undefined) value.mountPath = mountPath;
    return value;
}

function branchSamples(sourceRoot, cloudRoot, mountRoot) {
    const values = [
        ['Show', 'Season 1', 'Episode 01.mkv'],
        ['Show', 'Season 2', 'Episode 01.mkv']
    ];
    return values.map(([show, season, file]) => sample(
        `${sourceRoot}\\${show}\\${season}\\${file}`,
        `${cloudRoot}/${show}/${season}/${file}`,
        mountRoot === undefined ? undefined : `${mountRoot}\\${show}\\${season}\\${file}`
    ));
}

function rule(sourcePrefix, cloudPrefix, mountPrefix, id = 'existing') {
    return {
        id,
        sourcePrefix,
        cloudPrefix,
        mountPrefix: mountPrefix || null,
        enabled: true,
        originState: 'USER'
    };
}

const pFixtures = [
    {
        name: 'P1 movie',
        samples: branchSamples('D:\\Library\\Movies', '/cloud/Movies', 'Z:\\Mount\\Movies'),
        sourcePrefix: 'D:\\Library\\Movies',
        cloudPrefix: '/cloud/Movies',
        mountPrefix: 'Z:\\Mount\\Movies'
    },
    {
        name: 'P2 anime',
        samples: branchSamples('D:\\Library\\Anime', '/cloud/Anime', 'Z:\\Mount\\Anime'),
        sourcePrefix: 'D:\\Library\\Anime',
        cloudPrefix: '/cloud/Anime',
        mountPrefix: 'Z:\\Mount\\Anime'
    },
    {
        name: 'P3 documentary',
        samples: branchSamples('D:\\Library\\Documentary', '/cloud/Documentary', 'Z:\\Mount\\Documentary'),
        sourcePrefix: 'D:\\Library\\Documentary',
        cloudPrefix: '/cloud/Documentary',
        mountPrefix: 'Z:\\Mount\\Documentary'
    }
];

test('real P1/P2/P3 fixtures already fully covered produce no suggestion', () => {
    for (const fixture of pFixtures) {
        const rules = [rule(fixture.sourcePrefix, fixture.cloudPrefix, fixture.mountPrefix, fixture.name)];
        const before = structuredClone(rules);
        const result = boundary.preview(fixture.samples, rules);

        assert.equal(result.coverage.status, 'FULLY_COVERED', fixture.name);
        assert.equal(result.coverage.mountStatus, 'MATCHED', fixture.name);
        assert.deepEqual(result.coverage.ruleIds, [fixture.name], fixture.name);
        assert.equal(result.suggestion, null, fixture.name);
        assert.deepEqual(rules, before, fixture.name);
    }
});

test('reported 115open rule covers the same source, cloud and mount file before inference', () => {
    const existing = [rule('/CloudNAS/CloudDrive/115open/115', '/115open/115', 'X:\\115', 'P2')];
    const samples = [sample(
        '/CloudNAS/CloudDrive/115open/115/番剧/A/file.mkv',
        '/115open/115/番剧/A/file.mkv',
        'X:\\115\\番剧\\A\\file.mkv'
    )];
    const result = boundary.preview(samples, existing);
    assert.equal(result.coverage.status, 'FULLY_COVERED');
    assert.deepEqual(result.coverage.ruleIds, ['P2']);
    assert.equal(result.fileMatch.confidence, 'HIGH');
    assert.equal(result.boundary.confidence, 'LOW');
    assert.equal(result.suggestion, null);
});

test('existing coverage selects the same longest source rule as the production Resolver', () => {
    const cases = [
        {
            source: 'd:\\MEDIA\\Series\\A\\file.mkv',
            rules: [rule('D:\\Media', '/cloud', null, 'parent'),
                rule('D:\\Media\\Series', '/cloud/Series', null, 'longest')],
            expected: 'longest'
        },
        {
            source: '\\\\NAS\\Share\\Series\\A\\file.mkv',
            rules: [rule('\\\\nas\\share\\Series', '/cloud/Series', null, 'unc')],
            expected: 'unc'
        },
        {
            source: '/srv/Media/Series/A/file.mkv',
            rules: [rule('/srv/Media', '/cloud', null, 'posix')],
            expected: 'posix'
        },
        {
            source: '/srv/media/Series/A/file.mkv',
            rules: [rule('/srv/Media', '/cloud', null, 'wrong-case')],
            expected: null
        },
        {
            source: 'D:\\MediaExtra\\Series\\A\\file.mkv',
            rules: [rule('D:\\Media', '/cloud', null, 'boundary')],
            expected: null
        },
        {
            source: '\\\\nas\\OtherShare\\Series\\A\\file.mkv',
            rules: [rule('\\\\nas\\share', '/cloud', null, 'wrong-share')],
            expected: null
        }
    ];
    for (const entry of cases) {
        const selected = strmResolver.selectRule({sourcePath: entry.source, sidecarPath: 'Z:\\unrelated.mkv.strm'},
            {version: 1, rules: entry.rules});
        const cloud = selected
            ? pathRules.replacePrefix(entry.source, selected.sourcePrefix, selected.cloudPrefix)
            : '/cloud/Series/A/file.mkv';
        const coverage = boundary.checkExistingRuleCoverage([sample(entry.source, cloud)], entry.rules);
        assert.equal(selected && selected.id, entry.expected, entry.source);
        assert.equal(coverage.status, selected ? 'CLOUD_COVERED' : 'NOT_COVERED', entry.source);
        assert.deepEqual(coverage.ruleIds, selected ? [selected.id] : [], entry.source);
    }
});

test('uncovered two-branch samples reach an exact HIGH cloud boundary', () => {
    const samples = branchSamples('D:\\Library\\Anime', '/cloud/Anime');
    const result = boundary.preview(samples, []);

    assert.equal(result.coverage.status, 'NOT_COVERED');
    assert.equal(result.fileMatch.status, 'MATCHED');
    assert.equal(result.fileMatch.confidence, 'HIGH');
    assert.equal(result.boundary.status, 'MATCHED');
    assert.equal(result.boundary.confidence, 'HIGH');
    assert.deepEqual(result.suggestion, {
        sourcePrefix: 'D:\\Library\\Anime\\Show',
        cloudPrefix: '/cloud/Anime/Show',
        mountPrefix: ''
    });
});

test('P1-style single-sample filename evidence never becomes a HIGH boundary', () => {
    const samples = [sample(
        'D:\\Library\\Anime\\Show\\Season 1\\Episode 01.mkv',
        '/cloud/Anime/Show/Season 1/Episode 01.mkv'
    )];
    const direct = boundary.inferMappingBoundaryFromSamples(samples);
    const result = boundary.preview(samples, []);

    assert.equal(boundary.matchFilePair(samples[0].sourcePath, samples[0].cloudPath).confidence, 'HIGH');
    assert.deepEqual(direct, {
        status: 'INSUFFICIENT_EVIDENCE',
        confidence: 'LOW',
        reason: 'second_sample_required',
        suggestion: null
    });
    assert.equal(result.fileMatch.confidence, 'HIGH');
    assert.equal(result.boundary.reason, 'second_sample_required');
    assert.equal(result.suggestion, null);
});

test('two samples from the same directory remain insufficient evidence', () => {
    const samples = [
        sample('D:\\Library\\Anime\\Show\\Season 1\\Episode 01.mkv', '/cloud/Anime/Show/Season 1/Episode 01.mkv'),
        sample('D:\\Library\\Anime\\Show\\Season 1\\Episode 02.mkv', '/cloud/Anime/Show/Season 1/Episode 02.mkv')
    ];
    const result = boundary.inferMappingBoundaryFromSamples(samples);

    assert.deepEqual(result, {
        status: 'INSUFFICIENT_EVIDENCE',
        confidence: 'LOW',
        reason: 'independent_directories_required',
        suggestion: null
    });
});

test('cloud-covered samples without a mount are not offered again', () => {
    const samples = branchSamples('D:\\Library\\Anime', '/cloud/Anime');
    const result = boundary.preview(samples, [rule('D:\\Library\\Anime\\Show', '/cloud/Anime/Show', null)]);

    assert.equal(result.coverage.status, 'CLOUD_COVERED');
    assert.equal(result.coverage.mountStatus, 'NOT_PROVIDED');
    assert.deepEqual(result.coverage.ruleIds, ['existing']);
    assert.equal(result.suggestion, null);
});

test('a provided mount with a cloud-only rule reports CLOUD_COVERED/MOUNT_NOT_CONFIGURED', () => {
    const samples = branchSamples('D:\\Library\\Anime', '/cloud/Anime', 'Z:\\Mount\\Anime');
    const result = boundary.preview(samples, [rule('D:\\Library\\Anime\\Show', '/cloud/Anime/Show', null)]);

    assert.equal(result.coverage.status, 'CLOUD_COVERED');
    assert.equal(result.coverage.mountStatus, 'MOUNT_NOT_CONFIGURED');
    assert.equal(result.coverage.reason, 'existing_cloud_coverage');
    assert.equal(result.suggestion, null);
});

test('the selected longest rule controls cloud and mount conflict classification', () => {
    const samples = branchSamples('D:\\Library\\Anime', '/cloud/Anime', 'Z:\\Mount\\Anime');
    const cloudConflict = boundary.preview(samples, [
        rule('D:\\Library\\Anime', '/cloud/Anime', 'Z:\\Mount\\Anime', 'parent'),
        rule('D:\\Library\\Anime\\Show', '/cloud/OtherShow', 'Z:\\Mount\\Anime\\Show', 'child')
    ]);
    const mountConflict = boundary.preview(samples, [
        rule('D:\\Library\\Anime', '/cloud/Anime', 'Z:\\Mount\\Anime', 'parent'),
        rule('D:\\Library\\Anime\\Show', '/cloud/Anime/Show', 'Z:\\OtherShow', 'child')
    ]);

    assert.equal(cloudConflict.coverage.status, 'CONFLICT');
    assert.equal(cloudConflict.coverage.reason, 'existing_cloud_conflict');
    assert.deepEqual(cloudConflict.coverage.ruleIds, ['child']);
    assert.equal(cloudConflict.suggestion, null);
    assert.equal(mountConflict.coverage.status, 'CONFLICT');
    assert.equal(mountConflict.coverage.mountStatus, 'CONFLICT');
    assert.equal(mountConflict.coverage.reason, 'existing_mount_conflict');
    assert.deepEqual(mountConflict.coverage.ruleIds, ['child']);
    assert.equal(mountConflict.suggestion, null);
});

test('mount inference follows the already resolved cloud boundary', () => {
    const samples = branchSamples('D:\\Library\\Anime', '/cloud/Anime', 'Z:\\Mounted\\Anime');
    const cloud = boundary.inferMappingBoundaryFromSamples(samples);
    const mount = boundary.inferMountBoundaryFromSamples(samples, cloud.suggestion.sourcePrefix);

    assert.equal(cloud.status, 'MATCHED');
    assert.deepEqual(cloud.suggestion, {
        sourcePrefix: 'D:\\Library\\Anime\\Show',
        cloudPrefix: '/cloud/Anime/Show'
    });
    assert.deepEqual(mount, {
        status: 'MATCHED',
        confidence: 'HIGH',
        reason: 'mount_relative_suffix_consensus',
        mountPrefix: 'Z:\\Mounted\\Anime\\Show'
    });
    assert.deepEqual(boundary.preview(samples, []).suggestion, {
        sourcePrefix: 'D:\\Library\\Anime\\Show',
        cloudPrefix: '/cloud/Anime/Show',
        mountPrefix: 'Z:\\Mounted\\Anime\\Show'
    });
});

test('POSIX STRM source can map to a Windows mount using the same confirmed boundary', () => {
    const samples = [
        sample('/CloudNAS/CloudDrive/115open/115/番剧/A/a.mkv',
            '/115open/115/番剧/A/a.mkv', 'X:\\115\\番剧\\A\\a.mkv'),
        sample('/CloudNAS/CloudDrive/115open/115/电影/B/b.mkv',
            '/115open/115/电影/B/b.mkv', 'X:\\115\\电影\\B\\b.mkv')
    ];
    const result = boundary.preview(samples, []);
    assert.deepEqual(result.suggestion, {
        sourcePrefix: '/CloudNAS/CloudDrive/115open/115',
        cloudPrefix: '/115open/115',
        mountPrefix: 'X:\\115'
    });
    for (const value of samples) {
        assert.equal(pathRules.replacePrefix(value.sourcePath,
            result.suggestion.sourcePrefix, result.suggestion.mountPrefix), value.mountPath);
    }
});

test('unsafe optional mount does not discard a sound cloud boundary', () => {
    const samples = branchSamples('D:\\Library\\Anime', '/cloud/Anime', 'Z:\\Mounted\\Anime');
    samples[1].mountPath = 'Z:\\Mounted\\..\\Anime\\Show\\Season 2\\Episode 01.mkv';
    const result = boundary.preview(samples, []);
    assert.equal(result.fileMatch.confidence, 'HIGH');
    assert.equal(result.boundary.confidence, 'HIGH');
    assert.equal(result.mount.status, 'UNSAFE');
    assert.deepEqual(result.suggestion, {
        sourcePrefix: 'D:\\Library\\Anime\\Show',
        cloudPrefix: '/cloud/Anime/Show',
        mountPrefix: ''
    });
});

test('Windows, UNC, and POSIX boundaries preserve their case rules', () => {
    const windows = boundary.inferMappingBoundaryFromSamples([
        sample('d:\\MEDIA\\Show\\Season 1\\Episode 01.mkv', '/cloud/Show/Season 1/Episode 01.mkv'),
        sample('D:\\media\\Show\\Season 2\\Episode 01.mkv', '/cloud/Show/Season 2/Episode 01.mkv')
    ]);
    const unc = boundary.inferMappingBoundaryFromSamples([
        sample('\\\\NAS\\Share\\Show\\Season 1\\Episode 01.mkv', '/cloud/Show/Season 1/Episode 01.mkv'),
        sample('\\\\nas\\share\\Show\\Season 2\\Episode 01.mkv', '/cloud/Show/Season 2/Episode 01.mkv')
    ]);
    const posix = boundary.inferMappingBoundaryFromSamples([
        sample('/srv/Media/Show/Season 1/Episode 01.mkv', '/cloud/Show/Season 1/Episode 01.mkv'),
        sample('/srv/Media/Show/Season 2/Episode 01.mkv', '/cloud/Show/Season 2/Episode 01.mkv')
    ]);
    const posixCaseMismatch = boundary.preview([
        sample('/srv/Media/Show/Season 1/Episode 01.mkv', '/cloud/Show/Season 1/Episode 01.mkv'),
        sample('/srv/media/Show/Season 2/Episode 01.mkv', '/cloud/Show/Season 2/Episode 01.mkv')
    ], []);

    assert.equal(windows.status, 'MATCHED');
    assert.deepEqual(windows.suggestion, {
        sourcePrefix: 'D:\\MEDIA\\Show',
        cloudPrefix: '/cloud/Show'
    });
    assert.equal(unc.status, 'MATCHED');
    assert.deepEqual(unc.suggestion, {
        sourcePrefix: '\\\\NAS\\Share\\Show',
        cloudPrefix: '/cloud/Show'
    });
    assert.equal(posix.status, 'MATCHED');
    assert.deepEqual(posix.suggestion, {
        sourcePrefix: '/srv/Media/Show',
        cloudPrefix: '/cloud/Show'
    });
    assert.equal(posixCaseMismatch.fileMatch.confidence, 'MEDIUM');
    assert.equal(posixCaseMismatch.boundary.reason, 'file_match_insufficient');
    assert.equal(posixCaseMismatch.suggestion, null);
});

test('cloud POSIX casing must match exactly even when the source is Windows', () => {
    const samples = [
        sample('D:\\Library\\Show\\Season 1\\Episode 01.MKV', '/cloud/Library/Show/Season 1/Episode 01.mkv'),
        sample('D:\\Library\\Show\\Season 2\\Episode 01.MKV', '/cloud/Library/Show/Season 2/Episode 01.mkv')
    ];
    const result = boundary.preview(samples, []);
    assert.equal(result.fileMatch.confidence, 'HIGH');
    assert.equal(result.boundary.confidence, 'LOW');
    assert.equal(result.boundary.reason, 'relative_suffix_mismatch');
    assert.equal(result.suggestion, null);
});

test('disabled rule tombstone suppresses a matching new boundary', () => {
    const samples = branchSamples('D:\\Library\\Anime', '/cloud/Anime');
    const disabled = rule('D:\\Library\\Anime\\Show', '/cloud/Anime/Show', null, 'disabled');
    disabled.enabled = false;
    disabled.originState = 'DISABLED';
    const result = boundary.preview(samples, [disabled]);
    assert.equal(result.coverage.status, 'CONFLICT');
    assert.equal(result.coverage.reason, 'disabled_rule_tombstone');
    assert.equal(result.suggestion, null);
});

test('an invalid rule draft blocks a new suggestion until the user corrects it', () => {
    const samples = branchSamples('D:\\Library\\Anime', '/cloud/Anime');
    const invalid = rule('relative\\Anime', '/cloud/Anime', null, 'dirty');
    const result = boundary.preview(samples, [invalid]);
    assert.equal(result.coverage.status, 'CONFLICT');
    assert.equal(result.coverage.reason, 'invalid_existing_rule');
    assert.equal(result.suggestion, null);
});

test('mount boundary rejects a Windows source paired with a POSIX mount', () => {
    const samples = [
        sample('D:\\Library\\Show\\Season 1\\Episode 01.mkv', '/cloud/Show/Season 1/Episode 01.mkv', '/mnt/Show/Season 1/Episode 01.mkv'),
        sample('D:\\Library\\Show\\Season 2\\Episode 01.mkv', '/cloud/Show/Season 2/Episode 01.mkv', '/mnt/Show/Season 2/Episode 01.mkv')
    ];
    const result = boundary.inferMountBoundaryFromSamples(samples, 'D:\\Library\\Show');

    assert.notEqual(result.status, 'MATCHED');
    assert.equal(result.mountPrefix, '');
});

test('traversal, relative, root, and device-namespace paths fail closed', () => {
    const invalid = [
        ['D:\\Library\\..\\Show\\Season 1\\Episode 01.mkv', '/cloud/Show/Season 1/Episode 01.mkv'],
        ['relative\\Show\\Season 1\\Episode 01.mkv', '/cloud/Show/Season 1/Episode 01.mkv'],
        ['D:\\', '/'],
        ['\\\\?\\C:\\Show\\Season 1\\Episode 01.mkv', '/cloud/Show/Season 1/Episode 01.mkv']
    ];
    for (const [sourcePath, cloudPath] of invalid) {
        const result = boundary.preview([sample(sourcePath, cloudPath)], []);
        assert.equal(result.coverage.status, 'CONFLICT', sourcePath);
        assert.equal(result.coverage.reason, 'invalid_sample', sourcePath);
        assert.equal(result.suggestion, null, sourcePath);
    }
});

test('valid samples and rules are never mutated by coverage or preview', () => {
    const samples = branchSamples('D:\\Library\\Anime', '/cloud/Anime', 'Z:\\Mount\\Anime');
    const rules = [rule('D:\\Library\\Anime\\Show', '/cloud/Anime/Show', 'Z:\\Mount\\Anime\\Show')];
    const samplesBefore = structuredClone(samples);
    const rulesBefore = structuredClone(rules);

    boundary.checkExistingRuleCoverage(samples, rules);
    boundary.preview(samples, rules);

    assert.deepEqual(samples, samplesBefore);
    assert.deepEqual(rules, rulesBefore);
});
