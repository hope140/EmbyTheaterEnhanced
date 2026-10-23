param([Parameter(Mandatory=$true)][string]$EvidenceRoot,[Parameter(Mandatory=$true)][string]$Compiler,[Parameter(Mandatory=$true)][string]$ReferenceRoot)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$prep=Join-Path $EvidenceRoot 'controlled-acceptance'
$run=Join-Path $prep ('controlled-host-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($run)
$utf8=[Text.UTF8Encoding]::new($false)
function Save-Json($value,[string]$path){[IO.File]::WriteAllText($path,($value|ConvertTo-Json -Depth 12),$utf8)}
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Snapshot([string]$root){
 $items=@{}
 foreach($file in Get-ChildItem -LiteralPath $root -File -Recurse -Force){
  $items[$file.FullName.Substring($root.Length+1)]=[pscustomobject]@{Length=$file.Length;Ticks=$file.LastWriteTimeUtc.Ticks}
 }
 return $items
}
function Assembly-Evidence([string]$path){
 $reference=$false;$stream=[IO.File]::OpenRead($path)
 try{$pe=[System.Reflection.PortableExecutable.PEReader]::new($stream)
  try{$md=[System.Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($pe)
   foreach($attributeHandle in $md.GetAssemblyDefinition().GetCustomAttributes()){
    $attribute=$md.GetCustomAttribute($attributeHandle)
    if($attribute.Constructor.Kind.ToString() -eq 'MemberReference'){
     $row=[System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken($attribute.Constructor)-band 16777215
     $member=$md.GetMemberReference([System.Reflection.Metadata.Ecma335.MetadataTokens]::MemberReferenceHandle($row))
     if($member.Parent.Kind.ToString() -eq 'TypeReference'){
      $tr=[System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken($member.Parent)-band 16777215
      $type=$md.GetTypeReference([System.Reflection.Metadata.Ecma335.MetadataTokens]::TypeReferenceHandle($tr))
      if($md.GetString($type.Name) -eq 'ReferenceAssemblyAttribute' -and $md.GetString($type.Namespace) -eq 'System.Runtime.CompilerServices'){$reference=$true}
     }
    }
   }
  }finally{$pe.Dispose()}
 }finally{$stream.Dispose()}
 [pscustomobject]@{Identity=[Reflection.AssemblyName]::GetAssemblyName($path).FullName;Location=$path;SHA256=(Hash $path);GacPath=($path -match '(?i)\\Microsoft\.Net\\assembly\\GAC_');ReferenceAssembly=$reference;Evidence='File mapped in the running owned Host process, enumerated through Process.Modules; metadata and hash read from that mapped path.'}
}
function Local-Post([string]$route,[string]$body){
 $reply=Invoke-WebRequest -Uri ('http://localhost:8154/'+$route) -Method Post -Body $body -ContentType 'text/plain' -NoProxy -TimeoutSec 2 -SkipHttpErrorCheck
 $content=if($reply.Content -is [byte[]]){[Text.Encoding]::UTF8.GetString($reply.Content)}else{[string]$reply.Content}
 [pscustomobject]@{Route=$route;Status=[int]$reply.StatusCode;Body=$content.Trim()}
}
$records=@();$fatal=$null
try{
 $csc=(Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe')
 if(-not(Test-Path -LiteralPath $csc)){throw 'Existing Framework compiler missing.'}
 $fixtures=Join-Path $prep 'EteTestFixtures.cs'
 $guard=Join-Path $run 'EteTestGuard.dll';$child=Join-Path $run 'ControlledChild.exe'
 $compiler=@(& $csc /nologo /target:library /platform:anycpu ('/out:'+$guard) $fixtures 2>&1);$guardExit=$LASTEXITCODE
 [IO.File]::WriteAllText((Join-Path $run 'guard-compiler.txt'),($compiler -join "`n"),$utf8)
 if($guardExit -ne 0){throw 'Guard fixture compile failed.'}
 $compiler=@(& $csc /nologo /target:winexe /platform:anycpu /main:EteTest.ControlledChild ('/out:'+$child) $fixtures 2>&1);$childExit=$LASTEXITCODE
 [IO.File]::WriteAllText((Join-Path $run 'child-compiler.txt'),($compiler -join "`n"),$utf8)
 if($childExit -ne 0){throw 'Controlled child compile failed.'}
 $observer=Join-Path $run 'EteHostObserver.dll'
 $compiler=@(& $csc /nologo /target:library /platform:anycpu ('/out:'+$observer) (Join-Path $prep 'EteHostObserver.cs') 2>&1);$observerExit=$LASTEXITCODE
 [IO.File]::WriteAllText((Join-Path $run 'observer-compiler.txt'),($compiler -join "`n"),$utf8)
 if($observerExit -ne 0){throw 'Host observer compile failed.'}
 Add-Type -Path $guard
 $owners=@([EteTest.GuardProxy]::ListenerOwners(8154))
 if($owners.Count){throw '8154 is occupied; do not launch or contact its owner.'}
 $startMenu=[Environment]::GetFolderPath([Environment+SpecialFolder]::StartMenu)
 if(Test-Path -LiteralPath (Join-Path $startMenu 'Emby\Emby Theater.lnk')){throw 'Real ETE autorun source shortcut exists; cannot run stock source without risking a user Startup change.'}
 $startupRoot=[Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
 foreach($name in @('Emby Theater.lnk','Emby Theater Enhanced.lnk','ETE.lnk')){if(Test-Path -LiteralPath (Join-Path $startupRoot $name)){throw 'Existing real ETE Startup shortcut found; stop without user-config writes.'}}
 foreach($variant in @('private-target','omitted')){
  $variantRoot=Join-Path $prep ('variants\'+$variant)
  $runtime=Join-Path $variantRoot 'runtime';$profile=Join-Path $variantRoot 'profile'
  $case=Join-Path $run $variant;[void][IO.Directory]::CreateDirectory($case)
  $exe=Join-Path $runtime 'Emby.Theater.exe'
  [xml]$ownedConfig=Get-Content -LiteralPath ($exe+'.config') -Raw -Encoding UTF8
  $ownedDataPath=@($ownedConfig.configuration.appSettings.add|Where-Object {$_.key -eq 'ProgramDataPath'})
  if($ownedDataPath.Count -ne 1 -or $ownedDataPath[0].value -ne $profile){throw 'Owned synthetic profile path check failed before Host startup.'}
  if((Hash $exe) -ne 'b8e595b3ff52f84b3669ac34d74db192ee2598787c810b13e1c1d18a3cd6cdfa'){throw 'Original Host hash mismatch.'}
  $private=Join-Path $runtime 'System.Configuration.dll'
  if($variant -eq 'private-target'){
   if(-not(Test-Path -LiteralPath $private) -or (Hash $private) -ne '3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf'){throw 'Private input mismatch.'}
  }elseif(Test-Path -LiteralPath $private){throw 'Omitted variant contains private DLL.'}
  $childPath=Join-Path $runtime 'x64\electron\electron.exe'
  $originalChildHash=Hash $childPath
  Copy-Item -LiteralPath $child -Destination $childPath
  Copy-Item -LiteralPath $guard -Destination (Join-Path $runtime 'EteTestGuard.dll')
  Copy-Item -LiteralPath $observer -Destination (Join-Path $runtime 'EteHostObserver.dll')
  [xml]$cfg=Get-Content -LiteralPath ($exe+'.config') -Raw -Encoding UTF8
  if($cfg.configuration.SelectSingleNode('system.net')){throw 'Unexpected preexisting private network configuration.'}
  $net=$cfg.CreateElement('system.net');$proxy=$cfg.CreateElement('defaultProxy')
  $proxy.SetAttribute('enabled','true');$proxy.SetAttribute('useDefaultCredentials','false')
  $module=$cfg.CreateElement('module');$module.SetAttribute('type','EteTest.GuardProxy, EteTestGuard')
  [void]$proxy.AppendChild($module);[void]$net.AppendChild($proxy);[void]$cfg.configuration.AppendChild($net);$cfg.Save($exe+'.config')
  $managerAssembly=$cfg.CreateElement('appDomainManagerAssembly');$managerAssembly.SetAttribute('value',[Reflection.AssemblyName]::GetAssemblyName($observer).FullName)
  $managerType=$cfg.CreateElement('appDomainManagerType');$managerType.SetAttribute('value','EteHostObserver.LifecycleManager')
  [void]$cfg.configuration.runtime.AppendChild($managerAssembly);[void]$cfg.configuration.runtime.AppendChild($managerType);$cfg.Save($exe+'.config')
  $systemXml=Join-Path $profile 'config\system.xml'
  [xml]$xml=Get-Content -LiteralPath $systemXml -Raw -Encoding UTF8
  $xml.DocumentElement.RunAtStartup='true';$xml.Save($systemXml)
  if(@([EteTest.GuardProxy]::ListenerOwners(8154)).Count){throw '8154 became occupied before test startup.'}
  $before=Snapshot $variantRoot;$proc=$null;$started=$false;$stdout=$null;$stderr=$null;$childPid=$null;$forced=$false;$caseError=$null;$assemblyEvidence=@();$http=@();$normalExit=$false;$ready=$false;$is64=$null;$xmlSaved=$false;$start=[DateTime]::UtcNow
  try{
   $info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$exe;$info.WorkingDirectory=$runtime
   $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
   $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
   $info.Environment['ETE_TEST_VARIANT_ROOT']=$variantRoot
   $scratch=Join-Path $case 'process-temp';[void][IO.Directory]::CreateDirectory($scratch)
   $info.Environment['TEMP']=$scratch;$info.Environment['TMP']=$scratch
   $proc=[Diagnostics.Process]::new();$proc.StartInfo=$info
   if(-not $proc.Start()){throw 'Original Host did not start.'}
   $started=$true
   $stdout=$proc.StandardOutput.ReadToEndAsync();$stderr=$proc.StandardError.ReadToEndAsync()
   Write-Output ('HOST_STARTED '+$variant+' PID='+$proc.Id)
   $is64=[EteTest.GuardProxy]::ProcessIs64Bit($proc)
   $clock=[Diagnostics.Stopwatch]::StartNew()
   while($clock.Elapsed.TotalSeconds -lt 20 -and -not $proc.HasExited){
    $owners=@([EteTest.GuardProxy]::ListenerOwners(8154))
    if($owners.Count){if(@($owners|Where-Object {$_ -ne $proc.Id}).Count){throw '8154 is owned by another process; no request sent.'};$ready=$true;break}
    Start-Sleep -Milliseconds 100
   }
   if(-not $ready){throw 'Owned Host did not establish localhost8154 within deadline.'}
   Start-Sleep -Milliseconds 4200
   $ownersAfterDelay=@([EteTest.GuardProxy]::ListenerOwners(8154))
   if($proc.HasExited -or $ownersAfterDelay.Count -ne 1 -or $ownersAfterDelay[0] -ne $proc.Id){throw 'Owned listener was lost before local requests.'}
   $proc.Refresh()
   foreach($mapped in $proc.Modules){if($mapped.ModuleName -in @('System.Configuration.dll','MediaBrowser.Model.dll','MediaBrowser.Common.dll','ServiceStack.Text.dll')){$assemblyEvidence+=Assembly-Evidence $mapped.FileName}}
   $existing=Join-Path $profile 'config\system.xml';$missing=Join-Path $profile 'synthetic-missing-file'
   $http+=Local-Post 'fileexists' $existing;$http+=Local-Post 'fileexists' $missing
   $http+=Local-Post 'directoryexists' $profile;$http+=Local-Post 'directoryexists' (Join-Path $profile 'synthetic-missing-directory')
   $http+=Local-Post 'runatstartup-false' ''
   [xml]$afterXml=Get-Content -LiteralPath $systemXml -Raw -Encoding UTF8
   $xmlSaved=($afterXml.DocumentElement.RunAtStartup -eq 'false' -and $afterXml.DocumentElement.EnableAutoUpdate -eq 'true' -and $afterXml.DocumentElement.LogFileRetentionDays -eq '0')
   if(-not $xmlSaved){throw 'Original Host XML save/read contract failed.'}
   if(@($http|Where-Object {$_.Status -ne 200}).Count -or $http[0].Body -ne 'true' -or $http[1].Body -ne 'false' -or $http[2].Body -ne 'true' -or $http[3].Body -ne 'false'){throw 'Owned local interface result mismatch.'}
   [IO.File]::WriteAllBytes((Join-Path $variantRoot 'controlled-child-stop'),[byte[]]@())
   $normalExit=$proc.WaitForExit(7000)
   if(-not $normalExit){throw 'Original Host did not exit after controlled child exited.'}
  }catch{$caseError=$_.ToString()}
  finally{
   [IO.File]::WriteAllBytes((Join-Path $variantRoot 'controlled-child-stop'),[byte[]]@())
   if($started -and -not $proc.HasExited){
    if(-not $proc.WaitForExit(1000)){$proc.Kill();[void]$proc.WaitForExit(3000);$forced=$true}
   }
   $childStart=Join-Path $variantRoot 'controlled-child-start.txt'
   if(Test-Path -LiteralPath $childStart){$pidLine=Get-Content -LiteralPath $childStart|Where-Object {$_ -match '^PID='};$childPid=[int]($pidLine -replace '^PID=','')
    $ownedChild=Get-Process -Id $childPid -ErrorAction SilentlyContinue
    if($ownedChild -and -not $ownedChild.HasExited -and $ownedChild.MainModule.FileName -eq $childPath){if(-not $ownedChild.WaitForExit(1500)){$ownedChild.Kill();[void]$ownedChild.WaitForExit(3000);$forced=$true}}
   }
   if($started -and $proc.HasExited -and $null -ne $stdout){[IO.File]::WriteAllText((Join-Path $case 'stdout.txt'),$stdout.GetAwaiter().GetResult(),$utf8);[IO.File]::WriteAllText((Join-Path $case 'stderr.txt'),$stderr.GetAwaiter().GetResult(),$utf8)}
  }
  $changes=@();$after=Snapshot $variantRoot
  foreach($key in $after.Keys){if(-not $before.ContainsKey($key)){$changes+=[pscustomobject]@{Path=$key;Change='created';SHA256=(Hash (Join-Path $variantRoot $key))}}elseif($before[$key].Length -ne $after[$key].Length -or $before[$key].Ticks -ne $after[$key].Ticks){$changes+=[pscustomobject]@{Path=$key;Change='metadata-changed';SHA256=(Hash (Join-Path $variantRoot $key))}}}
  foreach($key in $before.Keys){if(-not $after.ContainsKey($key)){$changes+=[pscustomobject]@{Path=$key;Change='removed'}}}
  $exitCode=if($started -and $proc.HasExited){$proc.ExitCode}else{$null}
  $remainingOwners=@([EteTest.GuardProxy]::ListenerOwners(8154))
  $observerLog=Join-Path $runtime 'host-assembly-observer.txt'
  if(Test-Path -LiteralPath $observerLog){Copy-Item -LiteralPath $observerLog -Destination (Join-Path $case 'host-assembly-observer.txt')}
  $record=[ordered]@{Variant=$variant;StartedUtc=$start.ToString('o');HostPID=if($started){$proc.Id}else{$null};HostIs64Bit=$is64;OriginalHostSHA256=(Hash $exe);PrivateSystemConfigurationPresent=(Test-Path -LiteralPath $private);ChildPlaceholderSHA256=$originalChildHash;ControlledChildSHA256=(Hash $childPath);ControlledChildPID=$childPid;OwnedPortReady=$ready;MappedAssemblyEvidence=$assemblyEvidence;AssemblyObserverLog=if(Test-Path -LiteralPath $observerLog){$observerLog}else{$null};ManagedExitMarker=(Test-Path -LiteralPath (Join-Path $runtime 'host-managed-exit.txt'));Http=$http;ActualHostXmlSaved=$xmlSaved;NormalExit=$normalExit;ExitCode=$exitCode;ForcedOwnedProcessCleanup=$forced;Remaining8154Owners=$remainingOwners;Changes=$changes;Error=$caseError;Scope='Reviewed CEC and legacy-update retirement candidate Host and locked dependencies with a documented process-local AppDomain assembly observer, private loopback-only HTTP proxy, legacy EnableAutoUpdate=true, no task suppression and no CEC cancel marker, and an explicitly controlled child; not a full Electron/ETE client acceptance.'}
  Save-Json $record (Join-Path $case 'case.json');$records+=[pscustomobject]$record
  Write-Output ('HOST_FINISHED '+$variant+' Exit='+$exitCode+' Ready='+$ready+' XmlSaved='+$xmlSaved+' NormalExit='+$normalExit)
  if($caseError -match 'Access.*denied|拒绝访问|UnauthorizedAccess|SecurityException|Win32Exception'){throw ('Permission/security failure: '+$caseError)}
  if($remainingOwners.Count){throw '8154 remains occupied; do not start the next variant.'}
 }
}catch{$fatal=$_.ToString();[IO.File]::WriteAllText((Join-Path $run 'fatal-error.txt'),$fatal,$utf8)}
finally{
 $restoration=@()
 $startupRoot=[Environment]::GetFolderPath([Environment+SpecialFolder]::Startup)
 foreach($name in @('Emby Theater.lnk','Emby Theater Enhanced.lnk','ETE.lnk')){
  $absent=-not(Test-Path -LiteralPath (Join-Path $startupRoot $name))
  $restoration+=[pscustomobject]@{Scope='Known ETE Startup name';Name=$name;Action='checked-only-no-restore-write';Verified=$absent}
 }
 $restoration+=[pscustomobject]@{Scope='Real ETE profile';Action='not-read-copied-or-restored-by-this-harness; owned synthetic Host profile and inert child used';Verified=$true}
 Save-Json $restoration (Join-Path $run 'restoration.json')
 Save-Json ([ordered]@{RecordedUtc=[DateTime]::UtcNow.ToString('o');EvidenceDirectory=$run;Cases=$records;FatalError=$fatal;Restoration=$restoration;FullElectronAcceptance=$false;OriginalProductFilesWritten=$false;SystemSecuritySettingsChanged=$false}) (Join-Path $run 'summary.json')
 Write-Output ('EVIDENCE_DIRECTORY='+$run)
}
if($fatal){exit 1}
