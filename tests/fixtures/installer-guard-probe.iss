[Setup]
AppId={{66AAB4B5-7034-4B59-A124-C9C5ECA2C7E0}
AppName=ETE Installer Guard Probe
AppVersion=1.0.0
DefaultDirName={tmp}\ETE Installer Guard Probe
OutputDir=.
OutputBaseFilename=installer-guard-probe
PrivilegesRequired=lowest
Uninstallable=no
DisableWelcomePage=yes
CloseApplications=no
RestartApplications=no

[Languages]
Name: "default"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "languages\ChineseSimplified.isl"

[CustomMessages]
default.ClientRunning=ETE guard probe detected an owned client.
chinesesimplified.ClientRunning=ETE guard probe detected an owned client.
default.ProcessCheckFailed=ETE guard probe could not inspect the process list.
chinesesimplified.ProcessCheckFailed=ETE guard probe could not inspect the process list.
default.FileBusy=ETE guard probe could not open a target file (Windows error %1).
chinesesimplified.FileBusy=ETE guard probe could not open a target file (Windows error %1).

[Code]
#include "installer-guard.iss"

function InitializeSetup: Boolean;
var
  TargetDir, ResultFile, GuardResult, Mode: String;
begin
  TargetDir := GetEnv('ETE_GUARD_TARGET');
  ResultFile := GetEnv('ETE_GUARD_RESULT');
  Mode := GetEnv('ETE_GUARD_MODE');
  if Mode = 'absolute' then
  begin
    if IsAbsoluteTargetDir(TargetDir) then GuardResult := '<ABSOLUTE>'
    else GuardResult := '<RELATIVE>';
  end
  else
  begin
    GuardResult := GuardTarget(TargetDir);
    if GuardResult = '' then GuardResult := '<ALLOW>';
  end;
  if (ResultFile = '') or not SaveStringToFile(ResultFile, GuardResult, False) then
    Log('ETE guard probe could not save its result.');
  Result := False;
end;
