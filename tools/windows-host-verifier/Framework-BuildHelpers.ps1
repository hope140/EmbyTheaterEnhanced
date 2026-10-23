param([Parameter(Mandatory=$true)][string]$Compiler,[Parameter(Mandatory=$true)][string]$ReferenceRoot)
$script:Compiler=$Compiler;$script:ReferenceRoot=$ReferenceRoot
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$script:ReferenceFiles=@(Get-ChildItem -LiteralPath $script:ReferenceRoot -Filter '*.dll' -File|Where-Object {$_.Name -notin @('System.EnterpriseServices.Thunk.dll','System.EnterpriseServices.Wrapper.dll')})+@(Get-ChildItem -LiteralPath (Join-Path $script:ReferenceRoot 'Facades') -Filter '*.dll' -File)
function Hash([string]$path){(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Save-Json([string]$path,$value){[IO.File]::WriteAllText($path,($value|ConvertTo-Json -Depth 15),[Text.UTF8Encoding]::new($false))}
function Compile-Framework([string]$out,[string]$name,[string[]]$sources,[string[]]$extra,[bool]$exe){
 [void][IO.Directory]::CreateDirectory($out)
 $destination=Join-Path $out ($name+$(if($exe){'.exe'}else{'.dll'}))
 if(Test-Path -LiteralPath $destination){throw ('Do not overwrite prior binary: '+$destination)}
 $options=@('/nologo','/nostdlib+','/langversion:7.3','/deterministic+','/warn:4','/platform:x86',('/target:'+$(if($exe){'exe'}else{'library'})),('/out:'+$destination))
 $options+=@($script:ReferenceFiles|ForEach-Object {'/reference:'+$_.FullName})
 $options+=@($extra|ForEach-Object {'/reference:'+$_});$options+=$sources
 $rsp=Join-Path $out ($name+'.rsp');[IO.File]::WriteAllLines($rsp,@($options|ForEach-Object {'"'+$_+'"'}),[Text.UTF8Encoding]::new($false))
 $log=@(& $script:Compiler '/noconfig' ('@'+$rsp) 2>&1);$code=$LASTEXITCODE
 [IO.File]::WriteAllLines((Join-Path $out ($name+'-compiler.txt')),[string[]]$log,[Text.UTF8Encoding]::new($false))
 if($code -ne 0){throw ('Compile failed '+$name+': '+($log -join "`n"))}
 [IO.File]::WriteAllText(($destination+'.config'),'<configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.6.2"/></startup></configuration>',[Text.UTF8Encoding]::new($false))
 return [pscustomobject]@{Path=$destination;Target='net462/x86';Exit=$code;SHA256=(Hash $destination);Compiler=$script:Compiler;Diagnostics=$log.Count}
}
function Run-OwnedProbe([string]$exe,[string[]]$arguments,[string]$log){
 $result=@(& $exe @arguments 2>&1);$code=$LASTEXITCODE
 [IO.File]::WriteAllLines($log,[string[]]$result,[Text.UTF8Encoding]::new($false))
 return [pscustomobject]@{Exit=$code;Log=$log;Lines=$result.Count}
}
