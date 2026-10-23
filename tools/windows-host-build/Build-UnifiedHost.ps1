[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$SourceRoot,
 [Parameter(Mandatory=$true)][string]$OfficialHostRoot,
 [Parameter(Mandatory=$true)][string]$ModelPath,
 [Parameter(Mandatory=$true)][string]$NewtonsoftDllPath,
 [Parameter(Mandatory=$true)][string]$NewtonsoftPackage,
 [Parameter(Mandatory=$true)][string]$MSBuildPath,
 [Parameter(Mandatory=$true)][string]$ReferenceAssembliesPackage,
 [Parameter(Mandatory=$true)][string]$ReferenceAssembliesPath,
 [Parameter(Mandatory=$true)][string]$OutputRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT' -or $PSVersionTable.PSVersion.Major -ne 5){throw 'Use a fresh Windows PowerShell5.1 process, not PowerShell7/CoreLib.'}
$kit=$PSScriptRoot
function Hash-Bytes([byte[]]$Bytes){$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Hash-File([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Read-Physical([string]$Path){
 $p=[IO.Path]::GetFullPath($Path);$item=Get-Item -LiteralPath $p -Force;if($item.PSIsContainer){throw "Ordinary file required: $p"}
 $cursor=$p;while($cursor){$i=Get-Item -LiteralPath $cursor -Force;if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Redirect forbidden: $p"};$parent=[IO.Directory]::GetParent($cursor);if($null -eq $parent){break};$cursor=$parent.FullName}
 return ,([IO.File]::ReadAllBytes($p))
}
function Physical-Files([string]$Base){
 $pending=New-Object 'System.Collections.Generic.Stack[string]';$pending.Push($Base);$files=@()
 while($pending.Count){$dir=$pending.Pop();foreach($entry in Get-ChildItem -LiteralPath $dir -Force){if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Toolchain/reference redirect forbidden: $($entry.FullName)"};if($entry.PSIsContainer){$pending.Push($entry.FullName)}else{$files+=$entry.FullName}}}
 return ,([string[]]$files)
}
function Write-JSON([string]$Path,$Value){[IO.File]::WriteAllText($Path,((ConvertTo-Json -InputObject $Value -Depth 12)+"`n"),(New-Object Text.UTF8Encoding($false)))}
# The outer ZIP SHA is supplied with the transfer. Validate every manifest-bound kit member.
$km=Get-Content -LiteralPath (Join-Path $kit 'HANDOFF-MANIFEST.json') -Raw | ConvertFrom-Json
foreach($f in $km.files){$b=Read-Physical (Join-Path $kit $f.path);if($b.Length -ne $f.size -or (Hash-Bytes $b) -cne $f.sha256){throw "Handoff member identity mismatch: $($f.path)"}}
foreach($name in @('MSBuildExtensionsPath','MSBuildExtensionsPath32','MSBUILD_EXE_PATH','CscToolPath','CscToolExe','CustomBeforeMicrosoftCommonTargets','CustomAfterMicrosoftCommonTargets','DirectoryBuildPropsPath','DirectoryBuildTargetsPath')){if([Environment]::GetEnvironmentVariable($name)){throw "Unexpected build import/tool override: $name"}}
$source=[IO.Path]::GetFullPath($SourceRoot)
$framework=[IO.Path]::GetFullPath($ReferenceAssembliesPath).TrimEnd('\')
$msbuild=(Resolve-Path -LiteralPath $MSBuildPath).Path
$toolRoot=Split-Path -Parent $msbuild
while((Split-Path -Leaf $toolRoot) -ine 'MSBuild'){$parent=Split-Path -Parent $toolRoot;if(!$parent -or $parent -eq $toolRoot){throw 'Cannot locate VS2022 MSBuild root.'};$toolRoot=$parent}
Read-Physical $msbuild | Out-Null
$msVersion=(Get-Item -LiteralPath $msbuild).VersionInfo.FileVersion
if($msVersion -notmatch '^17\.'){throw 'Existing VS2022/MSBuild17 toolchain required; no tool upgrade/fallback.'}
$out=[IO.Path]::GetFullPath($OutputRoot).TrimEnd('\')
$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
if((Split-Path -Parent $out) -ine $temp -or (Split-Path -Leaf $out) -notmatch '^ete-host-unified-[A-Za-z0-9._-]+$'){throw 'OutputRoot must be a new direct TEMP child named ete-host-unified-*.'}
if(Test-Path -LiteralPath $out){throw 'OutputRoot already exists; never overwrite.'}
$cursor=$temp;while($cursor){$i=Get-Item -LiteralPath $cursor -Force;if(!$i.PSIsContainer -or ($i.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'TEMP/output ancestors must be physical directories.'};$parent=[IO.Directory]::GetParent($cursor);if($null -eq $parent){break};$cursor=$parent.FullName}
# Validate all55 fixed upstream files before creating any candidate output.
$upstream=Get-Content -LiteralPath (Join-Path $kit 'native/windows-host/upstream-source-manifest.json') -Raw | ConvertFrom-Json
foreach($f in $upstream.files){$b=Read-Physical (Join-Path $source $f.path);if($b.Length -ne $f.size -or (Hash-Bytes $b) -cne $f.sha256){throw "Original source mismatch: $($f.path)"}}
$referenceManifest=Get-Content -LiteralPath (Join-Path $kit 'REFERENCES.json') -Raw | ConvertFrom-Json
$referenceBuffers=@()
foreach($f in $referenceManifest.files){$name=Split-Path -Leaf $f.path;if($name -eq 'MediaBrowser.Model.dll'){$p=$ModelPath}elseif($name -eq 'Newtonsoft.Json.dll'){$p=$NewtonsoftDllPath}else{$p=Join-Path $OfficialHostRoot $name};$b=Read-Physical $p;if($b.Length -ne $f.size -or (Hash-Bytes $b) -cne $f.sha256){throw "Locked dependency mismatch: $name"};$referenceBuffers+=@{name=$name;bytes=$b}}
# Validate the selected new DLL against the complete pinned NuGet input, without installation.
if((Hash-Bytes (Read-Physical $NewtonsoftPackage)) -cne 'f09081d457405baf35a973fa0c50d6bf272ed683f2568c5a620a49da952f6529'){throw 'Newtonsoft package identity mismatch.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$jsonArchive=[IO.Compression.ZipFile]::OpenRead($NewtonsoftPackage)
try{$members=@($jsonArchive.Entries | Where-Object {$_.FullName -ceq 'lib/net45/Newtonsoft.Json.dll'});if($members.Count -ne 1){throw 'Ambiguous Newtonsoft selected member.'};$stream=$members[0].Open();$memory=New-Object IO.MemoryStream;try{$stream.CopyTo($memory);$body=$memory.ToArray()}finally{$stream.Dispose();$memory.Dispose()};if($body.Length -ne 721320 -or (Hash-Bytes $body) -cne 'f0c07af0e84d4dd4da4bd7823ba4535bc0481b3bf623ed40b659b68147a6bb75'){throw 'Newtonsoft selected member mismatch.'}}finally{$jsonArchive.Dispose()}
# Bind the existing extracted net462 pack to the exact already-approved NuGet bytes.
$packageBytes=Read-Physical $ReferenceAssembliesPackage
if((Hash-Bytes $packageBytes) -cne 'ee692a845743500910855d4c330ca6e9ef87c16e16f740e4474d187185d66e21'){throw 'net462 reference-package identity mismatch.'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($ReferenceAssembliesPackage)
try{
 $anchors=@($zip.Entries | Where-Object {$_.FullName.EndsWith('/v4.6.2/mscorlib.dll',[StringComparison]::OrdinalIgnoreCase)});if($anchors.Count -ne 1){throw 'Ambiguous/missing net462 pack root.'};$prefix=$anchors[0].FullName.Substring(0,$anchors[0].FullName.Length-'mscorlib.dll'.Length);$names=@()
 foreach($entry in $zip.Entries){if(!$entry.FullName.StartsWith($prefix,[StringComparison]::Ordinal) -or $entry.FullName.EndsWith('/')){continue};$rel=$entry.FullName.Substring($prefix.Length);$names+=$rel;$stream=$entry.Open();$memory=New-Object IO.MemoryStream;try{$stream.CopyTo($memory);$expected=$memory.ToArray()}finally{$stream.Dispose();$memory.Dispose()};$actual=Read-Physical (Join-Path $framework $rel);if($actual.Length -ne $expected.Length -or (Hash-Bytes $actual) -cne (Hash-Bytes $expected)){throw "Extracted net462 member differs: $rel"}}
 if($names.Count -lt 10 -or !($names -contains 'System.Configuration.dll')){throw 'Unexpected net462 archive member set.'}
 [string[]]$disk=@();foreach($file in (Physical-Files $framework)){$disk+=$file.Substring($framework.Length+1).Replace('\','/')};[Array]::Sort($disk,[StringComparer]::Ordinal);[string[]]$wanted=$names;[Array]::Sort($wanted,[StringComparer]::Ordinal)
 if(($disk -join "`n") -cne ($wanted -join "`n")){throw 'Extra/missing extracted reference-pack files.'}
}finally{$zip.Dispose()}
function Snapshot-Toolchain{
 $records=@()
 foreach($spec in @(@('msbuild',$toolRoot),@('net462',$framework))){$base=$spec[1];[string[]]$files=Physical-Files $base;[Array]::Sort($files,[StringComparer]::Ordinal);foreach($file in $files){$b=Read-Physical $file;$records+=[ordered]@{component=$spec[0];path=$file.Substring($base.Length+1).Replace('\','/');size=$b.Length;sha256=(Hash-Bytes $b)}}}
 return ConvertTo-Json -InputObject @($records) -Depth 6
}
$toolBefore=Snapshot-Toolchain
New-Item -ItemType Directory -Path $out | Out-Null
$candidate=Join-Path $out 'source';New-Item -ItemType Directory -Path $candidate | Out-Null
foreach($f in $upstream.files){$p=Join-Path $candidate $f.path;New-Item -ItemType Directory -Path (Split-Path -Parent $p) -Force | Out-Null;[IO.File]::WriteAllBytes($p,(Read-Physical (Join-Path $source $f.path)))}
$git=(Get-Command git.exe -ErrorAction Stop).Source
$patch=Join-Path $kit 'native/windows-host/host-retirement.patch'
Push-Location $candidate
try{& $git -c core.autocrlf=false apply --check $patch;if($LASTEXITCODE -ne 0){throw 'Exact source patch check failed.'};& $git -c core.autocrlf=false apply $patch;if($LASTEXITCODE -ne 0){throw 'Source patch application failed.'}}finally{Pop-Location}
$identityText=& (Join-Path $kit 'Get-SourceIdentity.ps1') -CandidateSourceRoot $candidate
$identity=$identityText | ConvertFrom-Json
$referenceRoot=Join-Path $out 'references';New-Item -ItemType Directory -Path $referenceRoot | Out-Null
foreach($f in $referenceBuffers){[IO.File]::WriteAllBytes((Join-Path $referenceRoot $f.name),$f.bytes)}
$build=Join-Path $out 'build';New-Item -ItemType Directory -Path $build | Out-Null
[xml]$project=[IO.File]::ReadAllText((Join-Path $candidate 'Emby.Theater/Emby.Theater.csproj'))
$ns=New-Object Xml.XmlNamespaceManager($project.NameTable);$ns.AddNamespace('m','http://schemas.microsoft.com/developer/msbuild/2003');$namespace=$project.DocumentElement.NamespaceURI
foreach($x in @($project.SelectNodes('//m:Content|//m:None',$ns))){$null=$x.ParentNode.RemoveChild($x)}
$compile=@($project.SelectNodes('//m:Compile',$ns));if($compile.Count -ne 46){throw 'Exactly46 C# compiler inputs required.'}
foreach($x in @($project.SelectNodes('//m:Compile|//m:EmbeddedResource',$ns))){$x.SetAttribute('Include','..\source\Emby.Theater\'+$x.GetAttribute('Include'));if($x.LocalName -eq 'EmbeddedResource'){$logical=$project.CreateElement('LogicalName',$namespace);$logical.InnerText='Emby.Theater.Properties.Resources.resources';$null=$x.AppendChild($logical)}}
foreach($x in @($project.SelectNodes('//m:Reference',$ns))){$name=$x.GetAttribute('Include').Split(',')[0];foreach($c in @($x.ChildNodes)){if($c.LocalName -in @('HintPath','Private')){$null=$x.RemoveChild($c)}};if($referenceManifest.files.path -contains ('references/'+$name+'.dll')){$hint=$project.CreateElement('HintPath',$namespace);$hint.InnerText='..\references\'+$name+'.dll';$null=$x.AppendChild($hint)};$private=$project.CreateElement('Private',$namespace);$private.InnerText='False';$null=$x.AppendChild($private)}
foreach($tag in @('ApplicationIcon','ApplicationManifest')){foreach($x in @($project.SelectNodes('//m:'+$tag,$ns))){$x.InnerText='..\source\Emby.Theater\'+$x.InnerText}}
# Explicit compile-only references from the already fully hash-verified net462 package.
$facadeGroup=$project.CreateElement('ItemGroup',$namespace)
$facadeFiles=@((Join-Path $framework 'mscorlib.dll'))+@(Get-ChildItem -LiteralPath (Join-Path $framework 'Facades') -Filter '*.dll' -File | ForEach-Object {$_.FullName})
foreach($facadePath in $facadeFiles){$reference=$project.CreateElement('Reference',$namespace);$reference.SetAttribute('Include',[IO.Path]::GetFileNameWithoutExtension($facadePath));$hint=$project.CreateElement('HintPath',$namespace);$hint.InnerText=$facadePath;$null=$reference.AppendChild($hint);$private=$project.CreateElement('Private',$namespace);$private.InnerText='False';$null=$reference.AppendChild($private);$null=$facadeGroup.AppendChild($reference)}
$null=$project.DocumentElement.InsertBefore($facadeGroup,($project.SelectNodes('/m:Project/m:Import',$ns) | Select-Object -Last 1))
$properties=$project.CreateElement('PropertyGroup',$namespace)
$values=[ordered]@{Configuration='Release';Platform='x86';PlatformTarget='x86';Prefer32Bit='true';TargetFrameworkVersion='v4.6.2';Optimize='true';DefineConstants='TRACE';DebugType='pdbonly';ErrorReport='none';UseSharedCompilation='false';Deterministic='true';PathMap=($out+'=/_/ete-host');AppConfig='..\source\Emby.Theater\App.config';ImportDirectoryBuildProps='false';ImportDirectoryBuildTargets='false';AssemblySearchPaths='{HintPathFromItem};{TargetFrameworkDirectory}';NoStdLib='true'}
if($out.IndexOfAny([char[]]',;') -ge 0){throw 'Unsupported PathMap punctuation in output path.'}
foreach($name in $values.Keys){$x=$project.CreateElement($name,$namespace);$x.InnerText=$values[$name];$null=$properties.AppendChild($x)}
$lastImport=$project.SelectNodes('/m:Project/m:Import',$ns) | Select-Object -Last 1;$null=$project.DocumentElement.InsertBefore($properties,$lastImport)
$projectPath=Join-Path $build 'Host.Unified.csproj';$writerSettings=New-Object Xml.XmlWriterSettings;$writerSettings.Encoding=New-Object Text.UTF8Encoding($false);$writerSettings.Indent=$true;$writer=[Xml.XmlWriter]::Create($projectPath,$writerSettings);try{$project.Save($writer)}finally{$writer.Dispose()}
$frameworkRoot=Split-Path -Parent (Split-Path -Parent $framework)
$buildArgs=@($projectPath,'/t:Rebuild','/m:1','/nr:false','/p:Configuration=Release','/p:Platform=x86','/p:PlatformTarget=x86','/p:UseSharedCompilation=false','/p:ImportDirectoryBuildProps=false','/p:ImportDirectoryBuildTargets=false',('/p:OutputPath='+$out+'\bin\'),('/p:BaseIntermediateOutputPath='+$out+'\obj\'),('/p:IntermediateOutputPath='+$out+'\obj\Release\'),('/p:FrameworkPathOverride='+$framework),('/p:TargetFrameworkRootPath='+$frameworkRoot+'\'),'/verbosity:diagnostic')
& $msbuild @buildArgs 2>&1 | Tee-Object -FilePath (Join-Path $out 'msbuild.log')
$buildExit=$LASTEXITCODE
$toolAfter=Snapshot-Toolchain
if($toolBefore -cne $toolAfter){throw 'MSBuild/reference toolchain changed during compilation.'}
if($buildExit -ne 0){throw "Unified Host compilation failed ($buildExit); stop, no old Host/IL fallback."}
$afterIdentity=(& (Join-Path $kit 'Get-SourceIdentity.ps1') -CandidateSourceRoot $candidate | ConvertFrom-Json)
if($identity.sha256 -cne $afterIdentity.sha256){throw 'Source identity changed during compilation.'}
foreach($f in $referenceManifest.files){if((Hash-File (Join-Path $out $f.path)) -cne $f.sha256){throw 'Dependency changed during compilation.'}}
$exe=Join-Path $out 'bin/Emby.Theater.exe';$pdb=Join-Path $out 'bin/Emby.Theater.pdb'
$assembly=[Reflection.Assembly]::ReflectionOnlyLoadFrom($exe)
$kind=[Reflection.PortableExecutableKinds]0;$machine=[Reflection.ImageFileMachine]::I386;$assembly.ManifestModule.GetPEKind([ref]$kind,[ref]$machine)
if($machine -ne [Reflection.ImageFileMachine]::I386 -or !($kind -band [Reflection.PortableExecutableKinds]::Required32Bit) -or $assembly.GetName().Version.ToString() -ne '3.0.20.0'){throw 'Host x86/version metadata mismatch.'}
$expectedRefs=Get-Content -LiteralPath (Join-Path $kit 'EXPECTED-ASSEMBLY-REFERENCES.json') -Raw | ConvertFrom-Json
$actualRefs=@($assembly.GetReferencedAssemblies() | ForEach-Object {$_.FullName} | Sort-Object)
if(Compare-Object -ReferenceObject @($expectedRefs.references) -DifferenceObject $actualRefs){throw 'Host dependency identities changed.'}
if($actualRefs -match 'System.Private.CoreLib'){throw 'Unexpected CoreLib reference.'}
$toolPath=Join-Path $out 'toolchain-snapshot.json';[IO.File]::WriteAllText($toolPath,($toolBefore+"`n"),(New-Object Text.UTF8Encoding($false)))
$outputs=@();foreach($p in @($exe,$pdb)){$b=Read-Physical $p;$outputs+=[ordered]@{path=(Split-Path -Leaf $p);size=$b.Length;sha256=(Hash-Bytes $b)}}
if($outputs[0].sha256 -eq '11abf75c8f77ddb0078e7dd62a2eaae60dba244c113bc7893a7e56bc6527163e'){throw 'Original official Host output is forbidden.'}
$record=[ordered]@{schemaVersion=1;scope='cec-update-json-zip-unified';containsJsonZipReplacements=$true;sourceIdentitySha256=$identity.sha256;sourceIdentity=$identity;framework='net462';platform='x86';modelSha256='db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153';referencePackageSha256='ee692a845743500910855d4c330ca6e9ef87c16e16f740e4474d187185d66e21';references=$referenceManifest.files;generatedProjectSha256=(Hash-File $projectPath);builderSha256=(Hash-File $PSCommandPath);compilerVersion=$msVersion;clrVersion=[Environment]::Version.ToString();clrMscorlibSha256=(Hash-File ([object].Assembly.Location));toolchainSnapshotSha256=(Hash-File $toolPath);assemblyReferences=$actualRefs;files=$outputs;verification='PENDING: compile/static metadata only; no Host execution performed'}
Write-JSON (Join-Path $out 'build-receipt.json') $record
Write-Output ("Built unified EXE/PDB under "+$out+". DO NOT directly launch bin Host: use the controlled isolated-profile harness. No verified-runtime lock is created before actual verification.")
