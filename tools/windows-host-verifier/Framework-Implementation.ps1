# Additional reviewed hosted-runner servicing profile. Never accept an unknown hash,
# learn an allowlist from the machine, replace a Framework file, or install an update.
function Test-ReviewedFrameworkEvidence($Evidence) {
 $expected='04a0018561b48efe2a4d56aff686783fd7f8b7f395f4c88c58ba2eb8e8118d41'
 return ($Evidence.sha256 -ceq $expected -and $Evidence.fileHash -ceq $expected -and
  $Evidence.gac -ceq 'True' -and $Evidence.referenceAssembly -ceq 'False' -and
  $Evidence.identity -ceq 'System.Configuration, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a' -and
  $Evidence.canonicalSystemPath -eq $true -and $Evidence.physicalPath -eq $true -and
  $Evidence.githubActions -ceq 'true' -and $Evidence.imageOS -ceq 'win22' -and
  $Evidence.imageVersion -ceq '20261012.333.1' -and $Evidence.osBuild -ceq '20348' -and
  $Evidence.osUbr -eq 5622 -and $Evidence.frameworkRelease -ge 528040 -and $Evidence.frameworkRelease -lt 600000 -and
  $Evidence.fileVersion -match '^4\.8\.\d+\.\d+(?:\s.*)?$' -and
  $Evidence.signatureStatus -ceq 'Valid' -and $Evidence.signatureType -cin @('Authenticode','Catalog') -and
  $Evidence.signerSubject -match '(?:^|,\s*)O=Microsoft Corporation(?:,|$)' -and
  $Evidence.signerThumbprint -cmatch '^[0-9A-F]{40}$' -and $Evidence.failure -ceq '')
}
function Read-ReviewedFrameworkEvidence($Observed) {
 $record=[ordered]@{
  profile='github-win22-20261012.333.1-net48x';sha256=$Observed.SHA256;gac=$Observed.GAC
  identity=$Observed.Identity;referenceAssembly=$Observed.ReferenceAssembly
  canonicalSystemPath=$false;physicalPath=$false;fileHash='';fileVersion=''
  githubActions=[string]$env:GITHUB_ACTIONS;imageOS=[string]$env:ImageOS;imageVersion=[string]$env:ImageVersion
  osBuild='';osUbr=0;frameworkRelease=0;signatureStatus='';signatureType='';signerSubject='';signerThumbprint='';failure=''
 }
 try {
  # Only this known candidate can enter system-file inspection. The original
  # baseline is checked in Finalize-Evidence; all other hashes stay rejected.
  if($Observed.SHA256 -cne '04a0018561b48efe2a4d56aff686783fd7f8b7f395f4c88c58ba2eb8e8118d41'){throw 'candidate'}
  $expected=Join-Path $env:SystemRoot 'Microsoft.NET\assembly\GAC_MSIL\System.Configuration\v4.0_4.0.0.0__b03f5f7f11d50a3a\System.Configuration.dll'
  $actual=[IO.Path]::GetFullPath($Observed.Location)
  if(-not $actual.Equals([IO.Path]::GetFullPath($expected),[StringComparison]::OrdinalIgnoreCase)){throw 'system-path'}
  $record.canonicalSystemPath=$true
  $cursor=$actual
  while($cursor){
   $item=Get-Item -LiteralPath $cursor -Force
   if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'redirect'}
   $next=[IO.Path]::GetDirectoryName($cursor)
   if(-not $next -or $next -ceq $cursor){break};$cursor=$next
  }
  if((Get-Item -LiteralPath $actual).PSIsContainer){throw 'file'}
  $record.physicalPath=$true
  $signature=Get-AuthenticodeSignature -LiteralPath $actual
  $record.signatureStatus=[string]$signature.Status;$record.signatureType=[string]$signature.SignatureType
  if($signature.SignerCertificate){$record.signerSubject=[string]$signature.SignerCertificate.Subject;$record.signerThumbprint=[string]$signature.SignerCertificate.Thumbprint}
  $record.fileVersion=[Diagnostics.FileVersionInfo]::GetVersionInfo($actual).FileVersion
  $windows=Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
  $record.osBuild=[string]$windows.CurrentBuildNumber;$record.osUbr=[int]$windows.UBR
  $framework=Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full'
  $record.frameworkRelease=[int]$framework.Release
  # Bind the inspected file after signature/version reads to the actual Host
  # observer bytes already re-hashed by the finalizer. No file is copied/loaded.
  $record.fileHash=(Get-FileHash -LiteralPath $actual -Algorithm SHA256).Hash.ToLowerInvariant()
 }catch{$record.failure='source-evidence-unavailable'}
 return [pscustomobject]$record
}
function Get-RunnerFrameworkPreflight {
 # A fresh x86 Framework process, not pwsh's Core ConfigurationManager package.
 $powershell=Join-Path $env:SystemRoot 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
 if(-not(Test-Path -LiteralPath $powershell -PathType Leaf)){throw 'Existing x86 Framework PowerShell required for source preflight.'}
 $probe=@'
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Configuration
$a=[System.Configuration.ConfigurationManager].Assembly
$reference=$false
foreach($attribute in [Reflection.CustomAttributeData]::GetCustomAttributes($a)){if($attribute.Constructor.DeclaringType.FullName -ceq 'System.Runtime.CompilerServices.ReferenceAssemblyAttribute'){$reference=$true}}
[ordered]@{SHA256=(Get-FileHash -LiteralPath $a.Location -Algorithm SHA256).Hash.ToLowerInvariant();GAC=$a.GlobalAssemblyCache.ToString();Identity=$a.FullName;Location=$a.Location;ReferenceAssembly=$reference.ToString();pointerSize=[IntPtr]::Size}|ConvertTo-Json -Compress
'@
 $json=@(& $powershell -NoProfile -NonInteractive -Command $probe)
 if($LASTEXITCODE -ne 0){throw 'Framework source preflight process failed.'}
 $observed=($json -join "`n")|ConvertFrom-Json
 if($observed.pointerSize -ne 4 -or $observed.GAC -cne 'True' -or $observed.ReferenceAssembly -cne 'False' -or $observed.Identity -cne 'System.Configuration, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a'){throw 'Framework source preflight binding mismatch.'}
 if($observed.SHA256 -ceq '5a3d35a9a0db4f075cc073ea8e875ef6b3533e88ec610621ac400efcc7c8e663'){
  return [pscustomobject]@{schemaVersion=1;profile='original-fixed-framework';sha256=$observed.SHA256;identity=$observed.Identity;gac=$observed.GAC;referenceAssembly=$observed.ReferenceAssembly;pointerSize=4;scope='Framework source preflight only, not Host acceptance'}
 }
 if($observed.SHA256 -ceq '04a0018561b48efe2a4d56aff686783fd7f8b7f395f4c88c58ba2eb8e8118d41'){
  $evidence=Read-ReviewedFrameworkEvidence $observed
  Write-Host ('FRAMEWORK_SERVICING_EVIDENCE '+($evidence|ConvertTo-Json -Depth 4 -Compress))
  if(Test-ReviewedFrameworkEvidence $evidence){return [pscustomobject]@{schemaVersion=1;profile=$evidence.profile;sha256=$evidence.sha256;pointerSize=4;sourceEvidence=$evidence;scope='Framework source preflight only, not Host acceptance'}}
 }
 throw ('Unreviewed Framework implementation; no downloads/build/retry: '+($observed|ConvertTo-Json -Compress))
}
