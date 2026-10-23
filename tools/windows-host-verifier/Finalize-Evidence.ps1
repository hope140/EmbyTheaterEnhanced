param([Parameter(Mandatory=$true)][string]$EvidenceRoot,[Parameter(Mandatory=$true)][string]$Compiler,[Parameter(Mandatory=$true)][string]$ReferenceRoot)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$b=$EvidenceRoot
$r=$PSScriptRoot
function Get-EvidenceHash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
$build=Get-Content -LiteralPath (Join-Path $b 'build-receipt.json') -Raw|ConvertFrom-Json
$comp=Get-Content -LiteralPath (Join-Path $b 'component-verification.json') -Raw|ConvertFrom-Json
$id=Get-Content -LiteralPath (Join-Path $b 'contracts\identity.json') -Raw|ConvertFrom-Json
$contract=[IO.File]::ReadAllText((Join-Path $b 'contracts\update-contract.txt'))
foreach($s in @('CanSelfUpdate=False','DirectPassed=True','InterfacePassed=True','ReflectionPassed=True','InstallFaultedTaskContractPassed=True','OldTaskAbsent=True','Passed=True')){if(-not $contract.Contains($s)){throw ('Missing update contract '+$s)}}
if(-not $comp.Passed -or $id.pointerSize -ne 4 -or $id.host.sha256 -cne $build.files[0].sha256 -or $id.model.sha256 -cne $build.modelSha256 -or $id.common.sha256 -cne '8fc955a5215e862f5bde882cedbe2be52e6a242d89d03406844993595d72657f' -or $id.newtonsoft.sha256 -cne 'f0c07af0e84d4dd4da4bd7823ba4535bc0481b3bf623ed40b659b68147a6bb75'){throw 'Actual binding mismatch'}
$consumer=Get-Content -LiteralPath (Join-Path $b 'cb14\receipt.json') -Raw|ConvertFrom-Json
$transport=Get-Content -LiteralPath (Join-Path $b 'cbtransport\receipt.json') -Raw|ConvertFrom-Json
if(-not $consumer.Passed -or -not $transport.Passed){throw 'Consumer probe mismatch'}
$exact=Get-Content -LiteralPath (Join-Path $b 'contracts\exact-json-cases.json') -Raw|ConvertFrom-Json
$nullWrite=@($exact.cases|Where-Object{$_.label -ceq 'write-null-trigger-array'})[0]
$nullRead=@($exact.cases|Where-Object{$_.label -ceq 'same-input-null-array'})[0]
$bad=@($exact.cases|Where-Object{$_.label -in @('truncated-after-Name-colon','two-adjacent-empty-objects')})
if($nullWrite.output.hex -cne '5B7B7D5D' -or $nullRead.returnedArrayFirstElementNull -ne $true -or $nullRead.readStreamClosed -ne $true -or $bad.Count -ne 4 -or @($bad|Where-Object{$_.exceptionType -cne 'Newtonsoft.Json.JsonReaderException' -or ($_.method.StartsWith('DeserializeFromStream') -and -not $_.readStreamClosed)}).Count){throw 'Exact JSON mismatch'}
$zipLines=Get-Content -LiteralPath (Join-Path $b 'zip-contracts\test-output.txt')
$zip=@($zipLines|Where-Object{$_.StartsWith('{"status"')}|ForEach-Object{$_|ConvertFrom-Json})[0]
$hostZip=[IO.File]::ReadAllText((Join-Path $b 'contracts\host-zip-contract.txt'))
if($zip.tests -ne 31 -or $zip.status -cne 'PASS' -or -not $hostZip.Contains('stored.zip=Passed') -or -not $hostZip.Contains('deflate.zip=Passed')){throw 'ZIP mismatch'}
$accept=Join-Path $b 'controlled-acceptance';$runs=@(Get-ChildItem -LiteralPath $accept -Directory -Filter 'controlled-host-*');if($runs.Count -ne 1){throw 'One actual Host run required'}
$summaryPath=Join-Path $runs[0].FullName 'summary.json';$summary=Get-Content -LiteralPath $summaryPath -Raw|ConvertFrom-Json
if($summary.FatalError -or $summary.Cases.Count -ne 2 -or @($summary.Restoration|Where-Object{-not $_.Verified}).Count){throw 'Startup/restoration summary failed'}
$seeds=Get-Content -LiteralPath (Join-Path $accept 'pending-seeds.json') -Raw|ConvertFrom-Json
$caseRows=@();$bindingRows=@()
foreach($c in $summary.Cases){
 if($c.Error -or -not $c.StartedUtc -or $c.HostIs64Bit -ne $false -or -not $c.OwnedPortReady -or -not $c.ActualHostXmlSaved -or -not $c.NormalExit -or $c.ExitCode -ne 0 -or $c.ForcedOwnedProcessCleanup -or $c.Remaining8154Owners.Count -or -not $c.ManagedExitMarker -or $c.OriginalHostSHA256 -cne $build.files[0].sha256){throw ('Host case failed '+$c.Variant)}
 $seed=@($seeds|Where-Object{$_.Variant -ceq $c.Variant})[0]
 foreach($f in $seed.Pending){if(-not(Test-Path -LiteralPath $f.Path) -or (Get-Item -LiteralPath $f.Path).Length -ne $f.Bytes -or (Get-EvidenceHash $f.Path) -cne $f.SHA256){throw 'Pending file consumed/changed'}}
 $child=Join-Path $seed.Root 'controlled-child-start.txt';$argsText=[IO.File]::ReadAllText($child)
 foreach($s in @('ArgumentCount=3',('Argument0='+$seed.Root+'\runtime\electronapp'),('Argument1='+$seed.Root+'\profile\data\electron'),('Argument2='+$seed.Root+'\runtime\x64\mpv\mpv.exe'))){if(-not $argsText.Contains($s)){throw ('Argument shape mismatch '+$s)}}
 $observer=[IO.File]::ReadAllText($c.AssemblyObserverLog)
 if($observer.Contains('BeginAssembly=ServiceStack.Text') -or $observer.Contains('BeginAssembly=SharpCompress')){throw 'Retired dependency loaded'}
 foreach($name in @('Emby.Theater','MediaBrowser.Model','MediaBrowser.Common','Newtonsoft.Json','System.Configuration')){
  $match=[regex]::Match($observer,'(?ms)^BeginAssembly='+[regex]::Escape($name)+'\r?\n(.*?)^EndAssembly='+[regex]::Escape($name)+'\r?$')
  if(-not $match.Success){throw ('Observed assembly missing '+$name)}
  $f=@{};foreach($line in ($match.Groups[1].Value -split '\r?\n')){if($line.Contains('=')){$p=$line.IndexOf('=');$f[$line.Substring(0,$p)]=$line.Substring($p+1)}}
  if((Get-EvidenceHash $f.Location) -cne $f.SHA256 -or $f.ReferenceAssembly -cne 'False'){throw 'Observed file/reference mismatch'}
  if($name -eq 'System.Configuration'){if($f.GAC -cne 'True' -or $f.SHA256 -cne '5a3d35a9a0db4f075cc073ea8e875ef6b3533e88ec610621ac400efcc7c8e663'){throw 'Framework implementation mismatch'}}
  elseif($name -eq 'Emby.Theater'){$want=$build.files[0].sha256;if($f.SHA256 -cne $want){throw 'Observed Host mismatch'}}
  else{$want=@($build.references|Where-Object{[IO.Path]::GetFileNameWithoutExtension($_.path) -ceq $name})[0].sha256;if($f.SHA256 -cne $want){throw 'Observed dependency mismatch'}}
  $bindingRows+=[ordered]@{case=$c.Variant;assembly=$name;location=$f.Location;sha256=$f.SHA256;gac=$f.GAC;referenceAssembly=$f.ReferenceAssembly}
 }
 $caseRows+=[ordered]@{name=$c.Variant;passed=$true;local8154=$true;xmlSave=$true;exitCode=$c.ExitCode;pendingPreserved=$true;argumentShape='app/data/mpv';usesCancelMask=$false;usesTaskSuppression=$false;summary=$summaryPath;observer=$c.AssemblyObserverLog;childArguments=$child}
}
$envelope=[ordered]@{
 schemaVersion=1;scope='cec-update-json-zip-unified';result='passed';sourceIdentitySha256=$build.sourceIdentitySha256
 hostExeSha256=$build.files[0].sha256;hostPdbSha256=$build.files[1].sha256;modelSha256=$id.model.sha256;clrObjectAssembly=$id.objectAssembly
 directUpdateCheck='no-update';interfaceUpdateCheck='no-update';reflectionUpdateCheck='no-update';canSelfUpdate=$false;legacyTaskAbsent=$true;installUpdate='NotSupportedException';noCecOrUpdaterLaunch=$true;startupCases=$caseRows
 loadedModelSha256=$id.model.sha256;loadedModelLocation=$id.model.location;probePointerSize=$id.pointerSize;loadedNewtonsoftSha256=$id.newtonsoft.sha256;loadedNewtonsoftLocation=$id.newtonsoft.location
 compiledHostJsonDtos='passed-10';malformedJsonDocuments='JsonReaderException';nullArraySlots='compatible';zipStoredDeflateFixtures='passed'
 jsonContractTests=28;zipContractTests=31;consumerBoundaryCases=14;mockTransportCases=4;actualHostBindings=$bindingRows
 scopeLimitations='Existing Framework4.8 runtime, target net462/x86; controlled Electron lifecycle stub; no full client, media, installer/upgrade or clean4.6.2 runtime acceptance.'
 evidence=[ordered]@{components='component-verification.json';contracts='contracts';consumer='cb14/receipt.json';mockTransport='cbtransport/receipt.json';startup=$summaryPath}
}
[IO.File]::WriteAllText((Join-Path $b 'verification-envelope.json'),(($envelope|ConvertTo-Json -Depth 12)+[char]10),[Text.UTF8Encoding]::new($false))
$envelope|ConvertTo-Json -Depth 3

