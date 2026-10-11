{ Shared by Setup and Uninstall. Read-only probes; never shut down a process. }
const
  GuardGenericWrite = $40000000;
  GuardShareAll = $00000007;
  GuardOpenExisting = 3;
  GuardInvalidHandle = -1;

function GuardCreateFile(FileName: String; DesiredAccess, ShareMode,
  SecurityAttributes, CreationDisposition, FlagsAndAttributes,
  TemplateFile: LongWord): Integer;
  external 'CreateFileW@kernel32.dll stdcall';
function GuardCloseHandle(Handle: Integer): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';
function GuardGetLastError: LongWord;
  external 'GetLastError@kernel32.dll stdcall';

function IsTargetProcessPath(ProcessPath, TargetDir: String): Boolean;
var
  Prefix: String;
begin
  Prefix := AddBackslash(TargetDir);
  { Exact paths avoid confusing another Electron application or a portable copy. }
  Result := (CompareText(ProcessPath, Prefix + 'Emby.Theater.exe') = 0) or
    (CompareText(ProcessPath, Prefix + 'x64\electron\electron.exe') = 0) or
    (CompareText(ProcessPath, Prefix + 'electronapp\native-helper\ete-mpv-helper.exe') = 0);
end;

function CheckTargetProcesses(TargetDir: String): String;
var
  Locator, Service, Processes, Process: Variant;
  I: Integer;
  ProcessPath: String;
begin
  Result := '';
  try
    Locator := CreateOleObject('WbemScripting.SWbemLocator');
    Service := Locator.ConnectServer('', 'root\CIMV2');
    Processes := Service.ExecQuery(
      'SELECT ExecutablePath FROM Win32_Process WHERE ' +
      'Name=''Emby.Theater.exe'' OR Name=''electron.exe'' OR Name=''ete-mpv-helper.exe''');
    for I := 0 to Processes.Count - 1 do
    begin
      Process := Processes.ItemIndex(I);
      if VarIsNull(Process.ExecutablePath) or VarIsEmpty(Process.ExecutablePath) then
      begin
        Result := CustomMessage('ProcessCheckFailed');
        Exit;
      end;
      ProcessPath := Process.ExecutablePath;
      if ProcessPath = '' then
      begin
        Result := CustomMessage('ProcessCheckFailed');
        Exit;
      end;
      if IsTargetProcessPath(ProcessPath, TargetDir) then
      begin
        Result := CustomMessage('ClientRunning');
        Exit;
      end;
    end;
  except
    { An unavailable process inventory must never be interpreted as no client. }
    Result := CustomMessage('ProcessCheckFailed');
  end;
end;

function CheckTargetFiles(TargetDir: String): String;
var
  Files: TArrayOfString;
  I, Handle: Integer;
  FileName: String;
  Error: LongWord;
begin
  Result := '';
  SetArrayLength(Files, 4);
  Files[0] := 'Emby.Theater.exe';
  Files[1] := 'x64\electron\electron.exe';
  Files[2] := 'electronapp\native-helper\ete-mpv-helper.exe';
  Files[3] := 'electronapp\libmpv\x64\mpv-1.dll';
  for I := 0 to GetArrayLength(Files) - 1 do
  begin
    FileName := AddBackslash(TargetDir) + Files[I];
    if FileExists(FileName) then
    begin
      { OPEN_EXISTING only requests write access; it never writes/truncates a byte.
        Loaded PE images and handles denying replacement reject this request. }
      Handle := GuardCreateFile(FileName, GuardGenericWrite, GuardShareAll,
        0, GuardOpenExisting, 0, 0);
      if Handle = GuardInvalidHandle then
      begin
        Error := GuardGetLastError;
        Result := FmtMessage(CustomMessage('FileBusy'), [IntToStr(Error)]);
        Exit;
      end;
      GuardCloseHandle(Handle);
    end;
  end;
end;

function IsAbsoluteTargetDir(TargetDir: String): Boolean;
var
  Rest, Server, Share: String;
  Separator: Integer;
begin
  Result := False;
  if Length(TargetDir) >= 3 then
    if (CompareText(Copy(TargetDir, 1, 1), 'A') >= 0) and
      (CompareText(Copy(TargetDir, 1, 1), 'Z') <= 0) and
      (TargetDir[2] = ':') and (TargetDir[3] = '\') then
    begin
      Result := True;
      Exit;
    end;
  if Copy(TargetDir, 1, 2) <> '\\' then Exit;
  Rest := Copy(TargetDir, 3, Length(TargetDir));
  Separator := Pos('\', Rest);
  if Separator <= 1 then Exit;
  Server := Copy(Rest, 1, Separator - 1);
  if (Server = '.') or (Server = '?') then Exit;
  Share := Copy(Rest, Separator + 1, Length(Rest));
  Separator := Pos('\', Share);
  if Separator > 0 then Share := Copy(Share, 1, Separator - 1);
  Result := (Share <> '') and (Share <> '.') and (Share <> '..');
end;

function GuardTarget(TargetDir: String): String;
begin
  if not IsAbsoluteTargetDir(TargetDir) then
  begin
    Result := CustomMessage('ProcessCheckFailed');
    Exit;
  end;
  Result := CheckTargetProcesses(TargetDir);
  if Result = '' then Result := CheckTargetFiles(TargetDir);
end;
