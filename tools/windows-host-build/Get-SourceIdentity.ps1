[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$CandidateSourceRoot)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Hash-Bytes([byte[]]$Bytes) {
    $h=[Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() }
    finally { $h.Dispose() }
}
function Read-Physical([string]$Path) {
    $p=[IO.Path]::GetFullPath($Path);$item=Get-Item -LiteralPath $p -Force
    if($item.PSIsContainer){throw "Expected ordinary source file: $p"}
    $cursor=$p
    while($cursor){$i=Get-Item -LiteralPath $cursor -Force;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Source redirects forbidden: $p"};$parent=[IO.Directory]::GetParent($cursor);if($null -eq $parent){break};$cursor=$parent.FullName}
    return ,([IO.File]::ReadAllBytes($p))
}
$kit=$PSScriptRoot
$m=Get-Content -LiteralPath (Join-Path $kit 'native/windows-host/change-manifest.json') -Raw | ConvertFrom-Json
$u=Get-Content -LiteralPath (Join-Path $kit 'native/windows-host/upstream-source-manifest.json') -Raw | ConvertFrom-Json
if($m.upstreamCommit -ne '708fadc068cbf66ced6aece4a32f3e12bb2c4e13' -or $m.changes.Count -ne 6 -or $m.addedSources.Count -ne 2 -or $m.compileInputCount -ne 46 -or $u.files.Count -ne 55){throw 'Wrong unified CEC/update/JSON/ZIP source scope.'}
$changes=@{};foreach($c in $m.changes){$changes[$c.path]=$c}
# Enforce all55 inherited and2 added source/resource/license byte identities.
foreach($f in $u.files){
    $b=Read-Physical (Join-Path $CandidateSourceRoot $f.path)
    if($changes.ContainsKey($f.path)){$size=$changes[$f.path].candidateSize;$digest=$changes[$f.path].candidateSHA256}else{$size=$f.size;$digest=$f.sha256}
    if($b.Length -ne $size -or (Hash-Bytes $b) -cne $digest){throw "Undeclared/mismatched candidate input: $($f.path)"}
}
foreach($f in $m.addedSources){$b=Read-Physical (Join-Path $CandidateSourceRoot $f.path);if($b.Length -ne $f.candidateSize -or (Hash-Bytes $b) -cne $f.candidateSHA256){throw 'Added helper source mismatch.'}}
$paths=@('native/windows-host/upstream-source-manifest.json','native/windows-host/host-retirement.patch','native/windows-host/Apply-SourceChanges.ps1','native/windows-host/change-manifest.json','vendor/host-json-manifest.json')
foreach($c in @($m.changes)+@($m.addedSources)){$paths+=('native/windows-host/changes/'+$c.path)}
[string[]]$ordered=$paths;[Array]::Sort($ordered,[StringComparer]::Ordinal)
$records=@();$text=''
foreach($p in $ordered){
    if($p.StartsWith('native/windows-host/changes/')){$actual=Join-Path $CandidateSourceRoot $p.Substring('native/windows-host/changes/'.Length)}else{$actual=Join-Path $kit $p}
    $digest=Hash-Bytes (Read-Physical $actual);$records+=[ordered]@{path=$p;sha256=$digest};$text+=$p+[char]0+$digest+"`n"
}
$fingerprint=Hash-Bytes ([Text.Encoding]::UTF8.GetBytes($text))
$expected=Get-Content -LiteralPath (Join-Path $kit 'EXPECTED-SOURCE-IDENTITY.json') -Raw | ConvertFrom-Json
if($fingerprint -cne $expected.sha256){throw 'Source fingerprint differs from the provided expected identity; stop, do not guess.'}
[ordered]@{upstreamCommit=$m.upstreamCommit;compileInputCount=46;files=$records;sha256=$fingerprint;scope='cec-update-json-zip-unified';containsJsonZipReplacements=$true} | ConvertTo-Json -Depth 8
