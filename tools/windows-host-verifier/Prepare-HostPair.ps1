param([Parameter(Mandatory=$true)][string]$EvidenceRoot,[Parameter(Mandatory=$true)][string]$Compiler,[Parameter(Mandatory=$true)][string]$ReferenceRoot)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
$r=$PSScriptRoot
$root=$EvidenceRoot
$old=$PSScriptRoot
$accept=Join-Path $root 'controlled-acceptance'
if(Test-Path -LiteralPath $accept){throw 'Fresh controlled directory required'}
[void][IO.Directory]::CreateDirectory($accept)
$build=Get-Content -LiteralPath (Join-Path $root 'build-receipt.json') -Raw|ConvertFrom-Json
foreach($name in @('EteTestFixtures.cs','EteHostObserver.cs')){Copy-Item -LiteralPath (Join-Path $old $name) -Destination (Join-Path $accept $name)}
$s=[IO.File]::ReadAllText((Join-Path $old 'HostPair.template.ps1'))
$s=$s.Replace($old,$accept).Replace('b8e595b3ff52f84b3669ac34d74db192ee2598787c810b13e1c1d18a3cd6cdfa',$build.files[0].sha256)
[IO.File]::WriteAllText((Join-Path $accept 'Run-UnifiedPair.ps1'),$s,[Text.UTF8Encoding]::new($false))
$seeds=@()
foreach($variant in @('private-target','omitted')){
 $v=Join-Path $accept ('variants\'+$variant);$runtime=Join-Path $v 'runtime';$profile=Join-Path $v 'profile'
 foreach($d in @($runtime,(Join-Path $runtime 'x64\electron'),(Join-Path $runtime 'x64\mpv'),(Join-Path $runtime 'electronapp'),(Join-Path $profile 'config'),(Join-Path $profile 'data\electron'),(Join-Path $profile 'updates'))){[void][IO.Directory]::CreateDirectory($d)}
 foreach($f in Get-ChildItem -LiteralPath (Join-Path $root 'bin') -File){Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $runtime $f.Name)}
 foreach($entry in $build.references){Copy-Item -LiteralPath (Join-Path $root $entry.path) -Destination (Join-Path $runtime ([IO.Path]::GetFileName($entry.path)))}
 if($variant -eq 'private-target'){$private=Join-Path $root 'verification-inputs\System.Configuration.dll';if((Get-FileHash -LiteralPath $private -Algorithm SHA256).Hash.ToLowerInvariant() -cne '3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf'){throw 'Private target identity mismatch'};Copy-Item -LiteralPath $private -Destination (Join-Path $runtime 'System.Configuration.dll')}
 $cp=Join-Path $runtime 'Emby.Theater.exe.config';[xml]$cfg=Get-Content -LiteralPath $cp -Raw;$data=@($cfg.configuration.appSettings.add|Where-Object{$_.key -ceq 'ProgramDataPath'});if($data.Count -ne 1){throw 'DataPath missing'};$data[0].value=$profile;$cfg.Save($cp)
 [IO.File]::WriteAllBytes((Join-Path $runtime 'x64\electron\electron.exe'),[byte[]]@())
 [IO.File]::WriteAllText((Join-Path $profile 'config\system.xml'),'<?xml version="1.0"?><BaseApplicationConfiguration><EnableDebugLevelLogging>false</EnableDebugLevelLogging><EnableAutoUpdate>true</EnableAutoUpdate><LogFileRetentionDays>0</LogFileRetentionDays><RunAtStartup>true</RunAtStartup><IsStartupWizardCompleted>false</IsStartupWizardCompleted></BaseApplicationConfiguration>',[Text.UTF8Encoding]::new($false))
 $pending=@();foreach($name in @('emby-theater.zip','emby-theater.zip.ver')){$target=Join-Path $profile ('updates\'+$name);Copy-Item -LiteralPath (Join-Path $old ('fixtures-pending\'+$name)) -Destination $target;$pending+=[ordered]@{Path=$target;Bytes=(Get-Item -LiteralPath $target).Length;SHA256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()}}
 $seeds+=[ordered]@{Variant=$variant;Root=$v;Pending=$pending;UsesCecCancel=$false;SuppressesTasks=$false}
}
[IO.File]::WriteAllText((Join-Path $accept 'pending-seeds.json'),($seeds|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Write-Output (Join-Path $accept 'Run-UnifiedPair.ps1')

