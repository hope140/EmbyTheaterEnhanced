'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const builder = path.resolve(__dirname, '../tools/build-native-helper.ps1');

for (const exitCode of [0, 23]) test('Native compiler invocation scopes dependency PATH and restores it after child exit '+exitCode, t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-compiler-env-'));
    t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
    const child = path.join(dir, 'compiler-process-stub.cjs'), evidence = path.join(dir, 'child.json');
    // A real external process observes the production invocation's environment
    // and argument boundaries; this stub is not a GCC compilation claim.
    fs.writeFileSync(child, `require('node:fs').writeFileSync(process.argv[2],JSON.stringify({path:process.env.PATH,args:process.argv.slice(3)}));process.exit(${exitCode});`);
    const command = String.raw`
        $ErrorActionPreference='Stop';Set-StrictMode -Version Latest
        $tokens=$null;$errors=$null
        $ast=[Management.Automation.Language.Parser]::ParseFile($env:ETE_BUILDER,[ref]$tokens,[ref]$errors)
        if($errors.Count){throw 'Builder parse error'}
        $functions=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'Invoke-LockedNativeCompiler'},$true))
        if($functions.Count -ne 1){throw 'One production invocation function required'}
        . ([scriptblock]::Create($functions[0].Extent.Text))
        $before=$env:PATH;$caught=$null
        try {Invoke-LockedNativeCompiler -CompilerPath $env:ETE_NODE -CompilerArguments @($env:ETE_CHILD,$env:ETE_EVIDENCE,'source with spaces.cpp','-Werror')}
        catch {$caught=$_.Exception.Message}
        ConvertTo-Json -Compress -InputObject @{before=$before;after=$env:PATH;error=$caught;separator=[string][IO.Path]::PathSeparator}
    `;
    const r = cp.spawnSync('pwsh', ['-NoProfile','-NonInteractive','-Command',command], {
        encoding:'utf8',env:{...process.env,ETE_BUILDER:builder,ETE_NODE:process.execPath,ETE_CHILD:child,ETE_EVIDENCE:evidence}
    });
    assert.equal(r.status,0,r.error?.message||r.stderr);
    const result = JSON.parse(r.stdout), observed = JSON.parse(fs.readFileSync(evidence));
    assert.equal(observed.path,path.dirname(process.execPath)+result.separator+result.before);
    assert.deepEqual(observed.args,['source with spaces.cpp','-Werror']);
    assert.equal(result.after,result.before);
    assert.equal(result.error,exitCode?'Native helper compiler failed with exit code '+exitCode:null);
});

test('Native compiler process environment is applied only after fixed toolchain, compiler and input validation', () => {
    const source = fs.readFileSync(builder,'utf8');
    const invocation = source.indexOf('    Invoke-LockedNativeCompiler -CompilerPath $compiler -CompilerArguments $arguments');
    for (const check of ['Native helper build contract differs from HEAD.', 'Pinned helper header hash mismatch.', 'Runtime libmpv hash mismatch.', 'Complete native compiler toolchain validation failed.', 'Native helper compiler identity mismatch.']) {
        assert.ok(source.indexOf(check)>0 && source.indexOf(check)<invocation,check);
    }
    assert.doesNotMatch(source,/SetEnvironmentVariable|ExecutionPolicy|Start-Process|pacman|Invoke-WebRequest/);
    assert.ok(source.indexOf('native-helper-provenance.json')<0); // output remains selected by the locked manifest
    assert.ok(source.indexOf('$record = [ordered]@{')>invocation);
});
