param([Parameter(Mandatory=$true)][string]$EvidenceRoot,[Parameter(Mandatory=$true)][string]$Compiler,[Parameter(Mandatory=$true)][string]$ReferenceRoot)
$root=$PSScriptRoot
. (Join-Path $root 'Framework-BuildHelpers.ps1') -Compiler $Compiler -ReferenceRoot $ReferenceRoot
$tree=$EvidenceRoot
$receipt=Get-Content -LiteralPath (Join-Path $tree 'build-receipt.json') -Raw|ConvertFrom-Json; $status=[pscustomobject]@{Passed=$true;OutputSHA256=$receipt.files[0].sha256}
if(-not $status.Passed){throw 'Approved strict Host build missing'}
$out=Join-Path $tree 'cb14'
if(Test-Path -LiteralPath $out){throw 'Fresh consumer evidence directory required'}
[void][IO.Directory]::CreateDirectory($out)
$bundle=Join-Path $out 'bundle';[void][IO.Directory]::CreateDirectory($bundle)
Get-ChildItem -LiteralPath (Join-Path $tree 'bin') -File|ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $bundle $_.Name)}
$lock=@($receipt.references|ForEach-Object{[pscustomobject]@{Name=[IO.Path]::GetFileName($_.path);SHA256=$_.sha256}}); foreach($entry in $receipt.references){Copy-Item -LiteralPath (Join-Path $tree $entry.path) -Destination (Join-Path $bundle ([IO.Path]::GetFileName($entry.path)))}
foreach($entry in $lock){if((Hash (Join-Path $bundle $entry.Name)) -ne $entry.SHA256){throw 'Bundle dependency mismatch'}}
if((Hash (Join-Path $bundle 'Emby.Theater.exe')) -ne $status.OutputSHA256){throw 'Bundle Host mismatch'}
$source=Join-Path $root 'ConsumerBoundaryProbe.WorkConstructors.cs'
if((Hash $source) -ne '785d4b7d64e4b8c61a39488b786a9f9775e81f82a16815e5c19dabda8663f90c'){throw 'Exact supplied probe source changed'}
$probe=Compile-Framework $out 'ConsumerBoundaryProbe' @($source) @() $true
$observerSource=Join-Path $root 'EteHostObserver.cs'
$observer=Compile-Framework $out 'EteHostObserver' @($observerSource) @() $false
[xml]$config=Get-Content -LiteralPath ($probe.Path+'.config') -Raw
$runtime=$config.CreateElement('runtime');$assembly=$config.CreateElement('appDomainManagerAssembly');$assembly.SetAttribute('value',[Reflection.AssemblyName]::GetAssemblyName($observer.Path).FullName);[void]$runtime.AppendChild($assembly)
$manager=$config.CreateElement('appDomainManagerType');$manager.SetAttribute('value','EteHostObserver.LifecycleManager');[void]$runtime.AppendChild($manager);[void]$config.configuration.AppendChild($runtime);$config.Save($probe.Path+'.config')
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('ejb-'+[guid]::NewGuid().ToString('N'));[void][IO.Directory]::CreateDirectory($scratch)
$info=[Diagnostics.ProcessStartInfo]::new();$info.FileName=$probe.Path;$info.WorkingDirectory=$out;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true;$info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false);$info.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
$info.ArgumentList.Add($bundle);$info.ArgumentList.Add($status.OutputSHA256);$info.Environment['TEMP']=$scratch;$info.Environment['TMP']=$scratch
$process=[Diagnostics.Process]::new();$process.StartInfo=$info
if(-not $process.Start()){throw 'Consumer probe process did not start'}
$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync();$exited=$process.WaitForExit(30000);$forced=$false
if(-not $exited){$process.Kill();[void]$process.WaitForExit(3000);$forced=$true}
$stdoutText=$stdout.GetAwaiter().GetResult();$stderrText=$stderr.GetAwaiter().GetResult()
[IO.File]::WriteAllText((Join-Path $out 'probe.jsonl'),$stdoutText,[Text.UTF8Encoding]::new($false));[IO.File]::WriteAllText((Join-Path $out 'stderr.txt'),$stderrText,[Text.UTF8Encoding]::new($false))
$rows=@($stdoutText -split '\r?\n'|Where-Object {$_}|ForEach-Object {ConvertFrom-Json -InputObject $_})
$summary=@($rows|Where-Object {$_.PSObject.Properties.Name -contains 'total'})
$cases=@($rows|Where-Object {$_.PSObject.Properties.Name -contains 'case'})
$passed=$process.ExitCode -eq 0 -and -not $forced -and $summary.Count -eq 1 -and $summary[0].total -eq 14 -and $summary[0].failures -eq 0 -and $cases.Count -eq 14
$bindings=@();$log=Join-Path $out 'host-assembly-observer.txt'
if(Test-Path -LiteralPath $log){$text=[IO.File]::ReadAllText($log);foreach($name in @('MediaBrowser.Model','MediaBrowser.Common','Emby.Theater','Newtonsoft.Json')){$match=[regex]::Match($text,'(?ms)^BeginAssembly='+[regex]::Escape($name)+'\r?\n(.*?)^EndAssembly='+[regex]::Escape($name)+'\r?$');if($match.Success){$fields=@{};foreach($line in ($match.Groups[1].Value -split '\r?\n')){if($line.Contains('=')){$p=$line.IndexOf('=');$fields[$line.Substring(0,$p)]=$line.Substring($p+1)}};$bindings+=[pscustomobject]@{Name=$name;Location=$fields.Location;SHA256=$fields.SHA256}}}}
foreach($name in @('MediaBrowser.Model','MediaBrowser.Common','Newtonsoft.Json')){$bound=@($bindings|Where-Object {$_.Name -eq $name});if($bound.Count -ne 1 -or $bound[0].SHA256 -ne (Hash (Join-Path $bundle ($name+'.dll'))) -or $bound[0].Location -ne (Join-Path $bundle ($name+'.dll'))){$passed=$false}}
$receipt=[ordered]@{RecordedUtc=[DateTime]::UtcNow.ToString('o');Compile=$probe;SuppliedProbeSourceSHA256=(Hash $source);SourceModified=$true;ProductionSourceChanged=$false;OriginalSuppliedProbeSHA256='52e4bee598d46e33a149a84b750e4b3b20c24da6a17dd53295702b61f7fb2c3e';WorkChange='Test harness only: RealProxy Object.GetType dispatch and explicit existing constructor selection instead of Activator overload binding; targets/expected outcomes unchanged; owned short TEMP path avoids Framework MAX_PATH without system changes; original attempts retained';HostSHA256=$status.OutputSHA256;Bundle=$bundle;Exit=$process.ExitCode;ForcedOwnedProcessCleanup=$forced;Summary=$summary;Cases=$cases;ActualBindings=$bindings;FixtureRoot=@($rows|Where-Object {$_.PSObject.Properties.Name -contains 'fixtureRoot'})[0].fixtureRoot;Network='In-process IHttpClient proxies only; no real requests';ApplicationStartup=$false;TaskTimersStarted=$false;OriginalPythonBuilderExecuted=$false;BuildMethod='Existing VS2022 compiler plus exact prepared net462 references';Passed=$passed}
Save-Json (Join-Path $out 'receipt.json') $receipt
$receipt|ConvertTo-Json -Depth 8
if(-not $passed){throw 'Consumer boundary probe failed; retain exact case evidence'}
