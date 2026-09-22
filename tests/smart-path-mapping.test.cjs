const test = require('node:test');
const assert = require('node:assert/strict');

const smartPathMapping = require('../src/electronapp/resolvers/smart-path-mapping');
const strmResolver = require('../src/electronapp/resolvers/strm-resolver');

function infer(localPath, candidateCloudPaths, overrides) {
    return smartPathMapping.inferSmartPathMapping(Object.assign({
        localPath,
        candidateCloudPaths
    }, overrides || {}));
}

function assertNoSuggestion(result, status, reason) {
    assert.equal(result.status, status);
    assert.equal(result.suggestion, null);
    assert.equal(result.evidence.reason, reason);
}

test('exports the four statuses and three confidence levels used by the dry-run contract', () => {
    assert.deepEqual(smartPathMapping.STATUS, {
        MATCHED: 'MATCHED',
        AMBIGUOUS: 'AMBIGUOUS',
        NO_MATCH: 'NO_MATCH',
        UNSAFE: 'UNSAFE'
    });
    assert.deepEqual(smartPathMapping.CONFIDENCE, {
        HIGH: 'HIGH',
        MEDIUM: 'MEDIUM',
        LOW: 'LOW'
    });
});

test('retains the anchor segment while deriving the documented Windows to cloud prefixes', () => {
    const result = infer(
        'D:\\Media\\Movies\\A\\B\\movie.mkv',
        ['/115/Movies/A/B/movie.mkv']
    );

    assert.equal(result.status, 'MATCHED');
    assert.equal(result.confidence, 'HIGH');
    assert.deepEqual(result.suggestion, {
        localPrefix: 'D:\\Media\\Movies',
        cloudPrefix: '/115/Movies'
    });
    assert.equal(result.evidence.matchedSuffixSegments, 4);
    assert.equal(result.evidence.matchedParentSegments, 3);
    assert.equal(result.evidence.reason, 'unique_long_suffix');
});

test('classifies exactly two matching parents plus the filename as MEDIUM confidence', () => {
    const result = infer(
        'D:\\Media\\A\\B\\movie.mkv',
        ['/115/A/B/movie.mkv']
    );

    assert.equal(result.status, 'MATCHED');
    assert.equal(result.confidence, 'MEDIUM');
    assert.deepEqual(result.suggestion, {
        localPrefix: 'D:\\Media\\A',
        cloudPrefix: '/115/A'
    });
    assert.equal(result.evidence.matchedSuffixSegments, 3);
    assert.equal(result.evidence.matchedParentSegments, 2);
    assert.equal(result.evidence.reason, 'unique_supported_suffix');
});

test('does not infer a mapping from a filename-only or single-parent suffix', () => {
    const cases = [
        {
            name: 'filename only',
            local: 'D:\\Media\\Local\\movie.mkv',
            cloud: '/115/Remote/movie.mkv',
            matched: 1,
            reason: 'filename_only'
        },
        {
            name: 'one parent plus filename',
            local: 'D:\\Media\\A\\movie.mkv',
            cloud: '/115/A/movie.mkv',
            matched: 2,
            reason: 'suffix_too_short'
        },
        {
            name: 'no common suffix',
            local: 'D:\\Media\\A\\movie.mkv',
            cloud: '/115/B/other.mkv',
            matched: 0,
            reason: 'no_common_suffix'
        }
    ];

    for (const value of cases) {
        const result = infer(value.local, [value.cloud]);
        assertNoSuggestion(result, 'NO_MATCH', value.reason);
        assert.equal(result.confidence, 'LOW', value.name);
        assert.equal(result.evidence.matchedSuffixSegments, value.matched, value.name);
    }
});

test('Windows drive matching is case-insensitive and preserves candidate casing in the prefix', () => {
    const result = infer(
        'd:\\MEDIA\\Movies\\A\\B\\MOVIE.MKV',
        ['/115/movies/a/b/movie.mkv'],
        {pathSemantics: 'windows-drive'}
    );

    assert.equal(result.status, 'MATCHED');
    assert.equal(result.confidence, 'HIGH');
    assert.deepEqual(result.suggestion, {
        localPrefix: 'D:\\MEDIA\\Movies',
        cloudPrefix: '/115/movies'
    });
    assert.equal(result.evidence.caseRules, 'WINDOWS_CASE_INSENSITIVE');
});

test('UNC matching is case-insensitive and retains the matched directory anchor', () => {
    const result = infer(
        '\\\\Nas-One\\Media\\Movies\\A\\B\\Movie.mkv',
        ['/cloud/movies/a/b/movie.MKV'],
        {pathSemantics: 'unc'}
    );

    assert.equal(result.status, 'MATCHED');
    assert.equal(result.confidence, 'HIGH');
    assert.deepEqual(result.suggestion, {
        localPrefix: '\\\\Nas-One\\Media\\Movies',
        cloudPrefix: '/cloud/movies'
    });
    assert.equal(result.evidence.caseRules, 'UNC_CASE_INSENSITIVE');
});

test('POSIX matching is case-sensitive while an exact-case suffix remains eligible', () => {
    const matched = infer(
        '/srv/media/Movies/A/B/movie.mkv',
        ['/115/Movies/A/B/movie.mkv'],
        {pathSemantics: 'posix'}
    );
    const caseMismatch = infer(
        '/srv/media/Movies/A/B/movie.mkv',
        ['/115/movies/a/b/MOVIE.mkv'],
        {pathSemantics: 'posix'}
    );

    assert.equal(matched.status, 'MATCHED');
    assert.deepEqual(matched.suggestion, {
        localPrefix: '/srv/media/Movies',
        cloudPrefix: '/115/Movies'
    });
    assert.equal(matched.evidence.caseRules, 'POSIX_CASE_SENSITIVE');
    assertNoSuggestion(caseMismatch, 'NO_MATCH', 'no_common_suffix');
});

test('Unicode path segments participate in the same deterministic suffix evidence', () => {
    const result = infer(
        'D:\\媒体\\电影\\科幻\\第一季\\正片.mkv',
        ['/115/电影/科幻/第一季/正片.mkv']
    );

    assert.equal(result.status, 'MATCHED');
    assert.equal(result.confidence, 'HIGH');
    assert.deepEqual(result.suggestion, {
        localPrefix: 'D:\\媒体\\电影',
        cloudPrefix: '/115/电影'
    });
    assert.equal(result.evidence.matchedSuffixSegments, 4);
});

test('Japanese, spaces, parentheses, brackets, and legal punctuation remain exact segments', () => {
    const result = infer(
        'D:\\Media Library\\日本語\\Season 1 (2026)\\Disc [A]\\Episode #01.mkv',
        ['/cloud/日本語/Season 1 (2026)/Disc [A]/Episode #01.mkv']
    );

    assert.equal(result.status, 'MATCHED');
    assert.equal(result.confidence, 'HIGH');
    assert.deepEqual(result.suggestion, {
        localPrefix: 'D:\\Media Library\\日本語',
        cloudPrefix: '/cloud/日本語'
    });
});

test('selects the unique longest suffix independently of candidate order', () => {
    const options = {
        localPath: 'D:\\Media\\Archive\\Movies\\A\\B\\movie.mkv',
        candidateCloudPaths: [
            '/short/A/B/movie.mkv',
            '/115/Movies/A/B/movie.mkv',
            '/filename-only/movie.mkv'
        ]
    };
    const forward = smartPathMapping.inferSmartPathMapping(options);
    const reversed = smartPathMapping.inferSmartPathMapping(Object.assign({}, options, {
        candidateCloudPaths: options.candidateCloudPaths.slice().reverse()
    }));

    assert.equal(forward.status, 'MATCHED');
    assert.deepEqual(forward.suggestion, {
        localPrefix: 'D:\\Media\\Archive\\Movies',
        cloudPrefix: '/115/Movies'
    });
    assert.equal(forward.evidence.matchedSuffixSegments, 4);
    assert.deepEqual(reversed, forward);
});

test('reports equally strong suffix candidates as ambiguous without choosing one', () => {
    const result = infer(
        'D:\\Media\\Movies\\A\\B\\movie.mkv',
        [
            '/115/Movies/A/B/movie.mkv',
            '/cloud/Movies/A/B/movie.mkv'
        ]
    );

    assertNoSuggestion(result, 'AMBIGUOUS', 'multiple_equal_candidates');
    assert.equal(result.confidence, 'LOW');
    assert.equal(result.evidence.matchedSuffixSegments, 4);
    assert.equal(result.evidence.candidateCount, 2);
    assert.equal(result.evidence.validCandidateCount, 2);
});

test('rejects unsafe local paths, semantics mismatches, and every non-absolute-POSIX cloud candidate', () => {
    const unsafeCases = [
        {
            name: 'relative local path',
            options: {localPath: 'Media\\A\\B\\movie.mkv', candidateCloudPaths: ['/115/A/B/movie.mkv']},
            reason: 'relative_path'
        },
        {
            name: 'local traversal',
            options: {localPath: 'D:\\Media\\..\\A\\movie.mkv', candidateCloudPaths: ['/115/A/B/movie.mkv']},
            reason: 'path_traversal'
        },
        {
            name: 'surrounding whitespace',
            options: {localPath: ' D:\\Media\\A\\B\\movie.mkv', candidateCloudPaths: ['/115/A/B/movie.mkv']},
            reason: 'surrounding_whitespace'
        },
        {
            name: 'explicit semantics mismatch',
            options: {localPath: 'D:\\Media\\A\\B\\movie.mkv', candidateCloudPaths: ['/115/A/B/movie.mkv'], pathSemantics: 'posix'},
            reason: 'path_semantics_mismatch'
        },
        {
            name: 'Windows cloud candidate',
            options: {localPath: 'D:\\Media\\A\\B\\movie.mkv', candidateCloudPaths: ['X:\\Cloud\\A\\B\\movie.mkv']},
            reason: 'invalid_cloud_candidate'
        },
        {
            name: 'UNC cloud candidate',
            options: {localPath: 'D:\\Media\\A\\B\\movie.mkv', candidateCloudPaths: ['\\\\cloud\\share\\A\\B\\movie.mkv']},
            reason: 'invalid_cloud_candidate'
        },
        {
            name: 'relative cloud candidate',
            options: {localPath: 'D:\\Media\\A\\B\\movie.mkv', candidateCloudPaths: ['115/A/B/movie.mkv']},
            reason: 'invalid_cloud_candidate'
        },
        {
            name: 'cloud traversal',
            options: {localPath: 'D:\\Media\\A\\B\\movie.mkv', candidateCloudPaths: ['/115/../A/B/movie.mkv']},
            reason: 'invalid_cloud_candidate'
        },
        {
            name: 'empty local path',
            options: {localPath: '', candidateCloudPaths: ['/115/A/B/movie.mkv']},
            reason: 'empty_path'
        },
        {
            name: 'local drive root only',
            options: {localPath: 'D:\\', candidateCloudPaths: ['/115/A/B/movie.mkv']},
            reason: 'root_only'
        },
        {
            name: 'local empty segment ambiguity',
            options: {localPath: 'D:\\Media\\\\A\\B\\movie.mkv', candidateCloudPaths: ['/115/A/B/movie.mkv']},
            reason: 'empty_segment'
        },
        {
            name: 'cloud empty segment ambiguity',
            options: {localPath: 'D:\\Media\\A\\B\\movie.mkv', candidateCloudPaths: ['/115//A/B/movie.mkv']},
            reason: 'invalid_cloud_candidate'
        },
        {
            name: 'cloud path is incomplete',
            options: {localPath: 'D:\\Media\\A\\B\\movie.mkv', candidateCloudPaths: ['/115/A/B/']},
            reason: 'invalid_cloud_candidate'
        },
        {
            name: 'cloud root only',
            options: {localPath: 'D:\\Media\\A\\B\\movie.mkv', candidateCloudPaths: ['/']},
            reason: 'invalid_cloud_candidate'
        }
    ];

    for (const value of unsafeCases) {
        const result = smartPathMapping.inferSmartPathMapping(value.options);
        assertNoSuggestion(result, 'UNSAFE', value.reason);
        assert.equal(result.confidence, 'LOW', value.name);
    }
});

test('an empty candidate set is a deterministic NO_MATCH rather than an unsafe guess', () => {
    const result = infer('D:\\Media\\A\\B\\movie.mkv', []);
    assertNoSuggestion(result, 'NO_MATCH', 'no_candidates');
    assert.equal(result.evidence.candidateCount, 0);
});

test('manual mappings on another drive or UNC share do not cross root boundaries', () => {
    const driveResult = infer(
        'D:\\Media\\Movies\\A\\B\\movie.mkv',
        ['/115/Movies/A/B/movie.mkv'],
        {manualMappings: [{sourcePrefix: 'E:\\Media\\Movies', cloudPrefix: '/other/Movies'}]}
    );
    const uncResult = infer(
        '\\\\nas\\media\\Movies\\A\\B\\movie.mkv',
        ['/115/Movies/A/B/movie.mkv'],
        {manualMappings: [{sourcePrefix: '\\\\nas\\other-share', cloudPrefix: '/other'}]}
    );

    assert.equal(driveResult.status, 'MATCHED');
    assert.equal(driveResult.evidence.manualMappingMatched, false);
    assert.equal(uncResult.status, 'MATCHED');
    assert.equal(uncResult.evidence.manualMappingMatched, false);
});

test('deduplicates identical cloud candidates without changing input evidence or determinism', () => {
    const options = {
        localPath: 'D:\\Media\\Movies\\A\\B\\movie.mkv',
        candidateCloudPaths: [
            '/115/Movies/A/B/movie.mkv',
            '/115/Movies/A/B/movie.mkv'
        ]
    };
    const first = smartPathMapping.inferSmartPathMapping(options);
    const second = smartPathMapping.inferSmartPathMapping(options);

    assert.equal(first.status, 'MATCHED');
    assert.equal(first.evidence.candidateCount, 2);
    assert.equal(first.evidence.validCandidateCount, 1);
    assert.deepEqual(second, first);
});

test('a matching manual mapping is authoritative and never emits a suggestion', () => {
    const result = infer(
        'D:\\Media\\Movies\\A\\B\\movie.mkv',
        ['/115/Movies/A/B/movie.mkv'],
        {
            manualMappings: [
                {sourcePrefix: 'D:\\Media', cloudPrefix: '/old'},
                {sourcePrefix: 'D:\\Media\\Movies', cloudPrefix: '/115/Movies'}
            ]
        }
    );

    assertNoSuggestion(result, 'NO_MATCH', 'manual_mapping_exists');
    assert.equal(result.evidence.manualMappingMatched, true);
    assert.equal(result.evidence.manualConflict, false);
});

test('manual mapping conflicts and invalid manual targets fail closed as UNSAFE', () => {
    const candidateConflict = infer(
        'D:\\Media\\Movies\\A\\B\\movie.mkv',
        ['/different/Movies/A/B/movie.mkv'],
        {manualMappings: [{sourcePrefix: 'D:\\Media\\Movies', cloudPrefix: '/115/Movies'}]}
    );
    const equalLengthConflict = infer(
        'D:\\Media\\Movies\\A\\B\\movie.mkv',
        [],
        {
            manualMappings: [
                {sourcePrefix: 'D:\\Media\\Movies', cloudPrefix: '/115/Movies'},
                {sourcePrefix: 'd:\\media\\movies', cloudPrefix: '/other/Movies'}
            ]
        }
    );
    const invalidCloud = infer(
        'D:\\Media\\Movies\\A\\B\\movie.mkv',
        [],
        {manualMappings: [{sourcePrefix: 'D:\\Media\\Movies', cloudPrefix: 'X:\\Cloud'}]}
    );

    for (const result of [candidateConflict, equalLengthConflict, invalidCloud]) {
        assertNoSuggestion(result, 'UNSAFE', 'manual_mapping_conflict');
        assert.equal(result.evidence.manualMappingMatched, true);
        assert.equal(result.evidence.manualConflict, true);
    }
});

test('preview emits only bounded diagnostic details and remains fail-open for observers', async () => {
    const records = [];
    const options = {
        localPath: 'D:\\Media\\Movies\\A\\B\\movie.mkv',
        candidateCloudPaths: ['/115/Movies/A/B/movie.mkv']
    };
    const result = strmResolver.previewSmartPathMapping(options, {
        onDiagnostic(record) {
            records.push(record);
        }
    });

    assert.equal(result.status, 'MATCHED');
    assert.equal(records.length, 1);
    assert.deepEqual(Object.keys(records[0].details).sort(), [
        'candidateCount',
        'confidence',
        'matchedSuffixSegments',
        'reason',
        'status'
    ]);
    assert.deepEqual(records[0].details, {
        status: 'MATCHED',
        confidence: 'HIGH',
        matchedSuffixSegments: 4,
        candidateCount: 1,
        reason: 'unique_long_suffix'
    });
    assert.doesNotMatch(JSON.stringify(records[0]), /D:\\\\Media|\/115\/Movies|movie\.mkv/);

    assert.doesNotThrow(() => strmResolver.previewSmartPathMapping(options, {
        onDiagnostic() { throw new Error('synthetic observer failure'); }
    }));
    assert.doesNotThrow(() => strmResolver.previewSmartPathMapping(options, {
        onDiagnostic() { return Promise.reject(new Error('synthetic async observer failure')); }
    }));
    await new Promise(resolve => setImmediate(resolve));
});

test('mount inference derives anchored Windows drive prefixes without changing cloud inference', () => {
    const cloud = smartPathMapping.inferSmartPathMapping({
        sourcePath: 'X:\\115\\A\\B\\f.mkv',
        candidateCloudPaths: ['/CloudNAS/115/A/B/f.mkv']
    });
    const mount = smartPathMapping.inferSmartMountMapping({
        sourcePath: 'X:\\115\\A\\B\\f.mkv',
        sourcePrefix: cloud.suggestion.localPrefix,
        candidateMountPaths: ['Z:\\115\\A\\B\\f.mkv']
    });

    assert.equal(cloud.status, 'MATCHED');
    assert.equal(cloud.confidence, 'HIGH');
    assert.deepEqual(cloud.suggestion, {localPrefix: 'X:\\115', cloudPrefix: '/CloudNAS/115'});
    assert.equal(mount.status, 'MATCHED');
    assert.equal(mount.confidence, 'HIGH');
    assert.deepEqual(mount.suggestion, {sourcePrefix: 'X:\\115', mountPrefix: 'Z:\\115'});
});

test('mount inference supports the approved Windows, UNC, and POSIX path-kind matrix', () => {
    const cases = [
        ['X:\\115\\A\\B\\f.mkv', 'Z:\\115\\A\\B\\f.mkv', 'X:\\115', 'Z:\\115'],
        ['X:\\115\\A\\B\\f.mkv', '\\\\nas\\share\\115\\A\\B\\f.mkv', 'X:\\115', '\\\\nas\\share\\115'],
        ['\\\\source\\share\\115\\A\\B\\f.mkv', 'Z:\\115\\A\\B\\f.mkv', '\\\\source\\share\\115', 'Z:\\115'],
        ['\\\\source\\share\\115\\A\\B\\f.mkv', '\\\\target\\media\\115\\A\\B\\f.mkv', '\\\\source\\share\\115', '\\\\target\\media\\115'],
        ['/srv/115/A/B/f.mkv', '/mnt/115/A/B/f.mkv', '/srv/115', '/mnt/115']
    ];

    for (const [sourcePath, mountPath, sourcePrefix, mountPrefix] of cases) {
        const result = smartPathMapping.inferSmartMountMapping({
            sourcePath,
            candidateMountPaths: [mountPath]
        });
        assert.equal(result.status, 'MATCHED', sourcePath + ' -> ' + mountPath);
        assert.equal(result.confidence, 'HIGH');
        assert.deepEqual(result.suggestion, {sourcePrefix, mountPrefix});
    }
});

test('mount inference preserves source case semantics and rejects unsupported kind combinations', () => {
    const windows = smartPathMapping.inferSmartMountMapping({
        sourcePath: 'x:\\115\\A\\B\\F.MKV',
        candidateMountPaths: ['z:\\115\\a\\b\\f.mkv']
    });
    const posixMismatch = smartPathMapping.inferSmartMountMapping({
        sourcePath: '/srv/Media/A/B/f.mkv',
        candidateMountPaths: ['/mnt/media/a/b/F.mkv']
    });
    const unsupported = smartPathMapping.inferSmartMountMapping({
        sourcePath: '/srv/media/A/B/f.mkv',
        candidateMountPaths: ['Z:\\media\\A\\B\\f.mkv']
    });

    assert.equal(windows.status, 'MATCHED');
    assert.equal(windows.confidence, 'HIGH');
    assert.equal(posixMismatch.status, 'NO_MATCH');
    assert.equal(unsupported.status, 'UNSAFE');
    assert.equal(unsupported.evidence.reason, 'invalid_mount_candidate');
});

test('mount inference keeps safety, short suffix, ambiguity, traversal, and semantic dedupe gates', () => {
    const short = smartPathMapping.inferSmartMountMapping({
        sourcePath: 'X:\\Media\\A\\f.mkv',
        candidateMountPaths: ['Z:\\Mount\\A\\f.mkv']
    });
    const ambiguous = smartPathMapping.inferSmartMountMapping({
        sourcePath: 'X:\\Media\\A\\B\\f.mkv',
        candidateMountPaths: ['Z:\\One\\A\\B\\f.mkv', '\\\\nas\\two\\A\\B\\f.mkv']
    });
    const traversal = smartPathMapping.inferSmartMountMapping({
        sourcePath: 'X:\\Media\\A\\B\\f.mkv',
        candidateMountPaths: ['Z:\\Mount\\..\\B\\f.mkv']
    });
    const deduped = smartPathMapping.inferSmartMountMapping({
        sourcePath: 'X:\\Media\\A\\B\\f.mkv',
        candidateMountPaths: ['Z:\\Mount\\A\\B\\f.mkv', 'z:\\mount\\a\\b\\F.MKV']
    });

    assert.equal(short.status, 'NO_MATCH');
    assert.equal(short.confidence, 'LOW');
    assert.equal(ambiguous.status, 'AMBIGUOUS');
    assert.equal(traversal.status, 'UNSAFE');
    assert.equal(deduped.status, 'MATCHED');
    assert.equal(deduped.evidence.validCandidateCount, 1);
});

test('mount inference binds mountPrefix to the cloud suggestion sourcePrefix', () => {
    const sourcePath = 'X:\\Media\\Movies\\A\\B\\m.mkv';
    const cloud = smartPathMapping.inferSmartPathMapping({
        sourcePath,
        candidateCloudPaths: ['/Cloud/Movies/A/B/m.mkv']
    });
    const mount = smartPathMapping.inferSmartMountMapping({
        sourcePath,
        sourcePrefix: cloud.suggestion.localPrefix,
        candidateMountPaths: ['Z:\\Mounted\\Cloud\\Movies\\A\\B\\m.mkv']
    });

    assert.deepEqual(cloud.suggestion, {
        localPrefix: 'X:\\Media\\Movies',
        cloudPrefix: '/Cloud/Movies'
    });
    assert.deepEqual(mount.suggestion, {
        sourcePrefix: 'X:\\Media\\Movies',
        mountPrefix: 'Z:\\Mounted\\Cloud\\Movies'
    });
});
