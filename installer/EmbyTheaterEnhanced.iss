#ifndef AppVersion
  #error AppVersion must be supplied by tools/package.ps1
#endif
#ifndef RuntimeDir
  #error RuntimeDir must be supplied by tools/package.ps1
#endif
#ifndef OutputBaseFilename
  #define OutputBaseFilename "EmbyTheaterEnhanced-" + AppVersion + "-win-x64-setup"
#endif

[Setup]
AppId={{868314CE-1253-46A3-A4EA-55CDE71BCF0A}
AppName=Emby Theater Enhanced
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\Emby Theater Enhanced
DefaultGroupName=Emby Theater Enhanced
UninstallDisplayIcon={app}\electronapp\icon.ico
SetupIconFile={#RuntimeDir}\electronapp\icon.ico
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableDirPage=no
UsePreviousAppDir=yes
UsePreviousGroup=yes
UsePreviousTasks=yes
UsePreviousLanguage=yes
LanguageDetectionMethod=uilanguage
ShowLanguageDialog=yes
CloseApplications=no
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "chinesesimplified"; MessagesFile: "languages\ChineseSimplified.isl"

[Messages]
english.WelcomeLabel2=This will install Emby Theater Enhanced {#AppVersion} (Windows x64) on your computer.%n%nBefore continuing, save your playback state and close the existing client normally.%n%nYour personal settings and DeviceId are retained during an upgrade.
chinesesimplified.WelcomeLabel2=即将在您的计算机上安装 Emby Theater Enhanced {#AppVersion}（Windows x64）。%n%n继续前，请保存播放状态并正常关闭现有客户端。%n%n升级会保留个人设置和设备标识。
english.ConfirmUninstall=Remove %1 and its program components?%n%nPersonal settings, sign-in data and DeviceId will be kept. Close the client normally before continuing.
chinesesimplified.ConfirmUninstall=是否卸载 %1 及其程序组件？%n%n个人设置、登录数据和设备标识会保留。继续前请正常关闭客户端。
english.UninstalledAll=%1 was successfully removed.%n%nPersonal settings, sign-in data and DeviceId have been kept.
chinesesimplified.UninstalledAll=%1 已成功卸载。%n%n个人设置、登录数据和设备标识已保留。
english.ErrorCopying=Could not copy a program file. Close the client normally, check permissions and free disk space, then retry in the same directory. Keep the details below if the error persists. Automatic rollback is not provided.%n%nFile error:
chinesesimplified.ErrorCopying=无法复制程序文件。请正常关闭客户端，检查目录权限和剩余空间，然后在原目录重试。若错误持续，请保留以下详细信息。本安装器不提供自动回滚。%n%n文件错误：
english.ErrorReplacingExistingFile=Could not replace an existing program file. Close the client normally, check permissions and retry in the same directory. If needed, reinstall the previous trusted installer. Automatic rollback is not provided.%n%nFile error:
chinesesimplified.ErrorReplacingExistingFile=无法替换现有程序文件。请正常关闭客户端，检查目录权限，然后在原目录重试。必要时使用之前可信的安装包重新安装。本安装器不提供自动回滚。%n%n文件错误：

[CustomMessages]
english.DesktopShortcut=Create a desktop shortcut
chinesesimplified.DesktopShortcut=创建桌面快捷方式
english.LaunchApp=Launch Emby Theater Enhanced
chinesesimplified.LaunchApp=启动 Emby Theater Enhanced
english.ClientRunning=Emby Theater Enhanced is running in the installation directory. Save your playback state and close the client normally, then retry. No process has been closed by Setup.
chinesesimplified.ClientRunning=安装目录中的 Emby Theater Enhanced 正在运行。请保存播放状态并正常关闭客户端，然后重试。安装程序没有关闭任何进程。
english.ProcessCheckFailed=Setup could not verify whether the client is running. No program files have been changed. Close the client normally and retry; if this persists, check the Windows Management Instrumentation service or restart Windows.
chinesesimplified.ProcessCheckFailed=安装程序无法确认客户端是否正在运行，尚未修改程序文件。请正常关闭客户端后重试；若问题持续，请检查 Windows 管理规范服务或重启系统。
english.InstalledRecordInvalid=The existing uninstall record has no readable, valid installation directory. No program files have been changed. Check the installation record before retrying; do not delete your personal settings.
chinesesimplified.InstalledRecordInvalid=现有卸载记录中的安装目录无法读取或无效，尚未修改程序文件。请检查安装记录后重试，不要删除个人设置。
english.FileBusy=An existing program file cannot be opened for replacement (Windows error %1). Close the client normally, check the installation directory permissions, and retry. No program files have been changed.
chinesesimplified.FileBusy=现有程序文件无法打开以进行替换（Windows 错误 %1）。请正常关闭客户端，检查安装目录权限，然后重试。尚未修改程序文件。
english.RecoveryAdvice=If installation fails, keep the error details, close the client normally and retry. If needed, reinstall the previous trusted installer in the same directory. Automatic rollback is not provided. Personal settings are kept.
chinesesimplified.RecoveryAdvice=若安装失败，请保留错误信息，正常关闭客户端后重试。必要时可使用之前可信的安装包在原目录重新安装。本安装器不提供自动回滚，个人设置会保留。

english.RetiredFileUnsafe=Setup cannot safely retire an old program file. Its contents, ownership, path or access differs from the expected version. No unknown file will be removed. Close the client normally and retry; if needed, reinstall the previous trusted installer. Personal settings and system drivers are kept.
chinesesimplified.RetiredFileUnsafe=安装程序无法安全移除旧程序文件：内容、归属、路径或访问状态与预期版本不同。不会删除未知文件。请正常关闭客户端后重试；必要时重新安装之前可信的安装包。个人设置和系统驱动会保留。

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopShortcut}"; Flags: unchecked

[Files]
; Source mtimes vary between equivalent builds and are not part of payload identity.
Source: "{#RuntimeDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs notimestamp

[Icons]
Name: "{group}\Emby Theater Enhanced"; Filename: "{app}\Emby.Theater.exe"; WorkingDir: "{app}"; IconFilename: "{app}\electronapp\icon.ico"
Name: "{autodesktop}\Emby Theater Enhanced"; Filename: "{app}\Emby.Theater.exe"; WorkingDir: "{app}"; IconFilename: "{app}\electronapp\icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\Emby.Theater.exe"; WorkingDir: "{app}"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent runasoriginaluser

[Code]
#include "installer-guard.iss"
#include "retired-runtime.iss"

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  PreviousDir: String;
begin
  Result := GuardTarget(ExpandConstant('{app}'));
  if Result <> '' then Exit;
  { Guard the registered instance too if the user chooses a different directory. }
  if RegKeyExists(HKLM64,
    'Software\Microsoft\Windows\CurrentVersion\Uninstall\{868314CE-1253-46A3-A4EA-55CDE71BCF0A}_is1') then
  begin
    if not RegQueryStringValue(HKLM64,
      'Software\Microsoft\Windows\CurrentVersion\Uninstall\{868314CE-1253-46A3-A4EA-55CDE71BCF0A}_is1',
      'InstallLocation', PreviousDir) or not IsAbsoluteTargetDir(PreviousDir) then
      Result := CustomMessage('InstalledRecordInvalid')
    else if CompareText(AddBackslash(PreviousDir), AddBackslash(ExpandConstant('{app}'))) <> 0 then
      Result := GuardTarget(PreviousDir);
  end;
  if Result = '' then Result := CheckRetiredRuntime(ExpandConstant('{app}'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  { Cleanup runs only after the new verified payload has been installed. }
  if CurStep = ssPostInstall then RetireKnownRuntime(ExpandConstant('{app}'));
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo,
  MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo + NewLine + MemoGroupInfo + NewLine + MemoTasksInfo +
    NewLine + NewLine + CustomMessage('RecoveryAdvice');
end;

function InitializeUninstall: Boolean;
var
  Error: String;
begin
  Error := GuardTarget(ExpandConstant('{app}'));
  Result := Error = '';
  if not Result then
  begin
    Log(Error);
    if not UninstallSilent then MsgBox(Error, mbError, MB_OK);
  end;
end;
