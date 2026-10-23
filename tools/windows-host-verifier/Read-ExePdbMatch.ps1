param([Parameter(Mandatory=$true)][string]$Exe,[Parameter(Mandatory=$true)][string]$Pdb)
$ErrorActionPreference='Stop'
$stream=[IO.File]::OpenRead($Exe)
try{$pe=[System.Reflection.PortableExecutable.PEReader]::new($stream)
 try{$entries=@($pe.ReadDebugDirectory()|Where-Object {$_.Type.ToString() -eq 'CodeView'});if($entries.Count -ne 1){throw 'One CodeView entry required'};$codeView=$pe.ReadCodeViewDebugDirectoryData($entries[0]);$cv=[pscustomobject]@{Guid=$codeView.Guid.ToString();Age=$codeView.Age;Path=$codeView.Path}}
 finally{$pe.Dispose()}
}finally{$stream.Dispose()}
$bytes=[IO.File]::ReadAllBytes($Pdb)
if(-not [Text.Encoding]::ASCII.GetString($bytes,0,32).StartsWith('Microsoft C/C++ MSF 7.00')){throw 'Native MSF7 PDB required'}
$pageSize=[BitConverter]::ToUInt32($bytes,32);$directorySize=[BitConverter]::ToUInt32($bytes,44);$blockMap=[BitConverter]::ToUInt32($bytes,52)
$directoryPages=[int][Math]::Ceiling($directorySize/[double]$pageSize);$directory=[byte[]]::new($directoryPages*$pageSize)
for($i=0;$i -lt $directoryPages;$i++){$page=[BitConverter]::ToUInt32($bytes,[int]($blockMap*$pageSize+4*$i));[Array]::Copy($bytes,[int]($page*$pageSize),$directory,[int]($i*$pageSize),[int]$pageSize)}
$count=[BitConverter]::ToUInt32($directory,0);$cursor=4+4*$count;$infoBytes=$null
for($index=0;$index -lt $count;$index++){$size=[BitConverter]::ToUInt32($directory,[int](4+4*$index));if($size -eq [uint32]::MaxValue){continue};$pages=[int][Math]::Ceiling($size/[double]$pageSize)
 if($index -eq 1){$infoBytes=[byte[]]::new($pages*$pageSize);for($j=0;$j -lt $pages;$j++){$page=[BitConverter]::ToUInt32($directory,[int]($cursor+4*$j));[Array]::Copy($bytes,[int]($page*$pageSize),$infoBytes,[int]($j*$pageSize),[int]$pageSize)}};$cursor+=4*$pages
}
if($null -eq $infoBytes){throw 'PDB info stream missing'}
$age=[BitConverter]::ToUInt32($infoBytes,8);$guidBytes=[byte[]]::new(16);[Array]::Copy($infoBytes,12,$guidBytes,0,16);$guid=[guid]::new($guidBytes)
[pscustomobject]@{Method='Read-only PE CodeView and native MSF7 info stream comparison';CodeView=$cv;PdbInfo=[pscustomobject]@{Guid=$guid.ToString();Age=$age};Matched=($guid.ToString() -eq $cv.Guid -and $age -eq $cv.Age)}
