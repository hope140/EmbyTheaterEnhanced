[Setup]
AppId={{00000000-0000-0000-0000-000000000000}
AppName=ETE Installer Language Probe
AppVersion=1.0.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DefaultDirName={tmp}\ETE Installer Language Probe
OutputDir=.
OutputBaseFilename=ete-installer-language-probe
PrivilegesRequired=lowest
Uninstallable=no
UsePreviousLanguage=yes
LanguageDetectionMethod=uilanguage
ShowLanguageDialog=yes
DisableDirPage=no
CloseApplications=no
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "languages\ChineseSimplified.isl"

[Code]
function InitializeSetup: Boolean;
var
  ResultFile, SelectedLanguage: String;
begin
  ResultFile := GetEnv('ETE_LANGUAGE_PROBE_RESULT');
  SelectedLanguage := ExpandConstant('{language}');
  if (ResultFile = '') or not SaveStringToFile(ResultFile, SelectedLanguage, False) then
    Log('ETE language probe could not save its result.');
  Result := False;
end;
