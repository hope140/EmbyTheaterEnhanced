{ Retire only known program leaves after successful payload copy. No profile cleanup. }
#include "retired-runtime-identities.iss"

function RetiredGetFileAttributes(FileName: String): LongWord;
  external 'GetFileAttributesW@kernel32.dll stdcall';

function RetiredPathIsPhysical(FileName: String): Boolean;
var
  Cursor, Parent: String;
  Attributes: LongWord;
begin
  Result := False;
  Cursor := ExpandFileName(FileName);
  while Cursor <> '' do
  begin
    Attributes := RetiredGetFileAttributes(Cursor);
    if (Attributes = $FFFFFFFF) or ((Attributes and $400) <> 0) then Exit;
    Parent := ExtractFileDir(Cursor);
    if CompareText(Parent, Cursor) = 0 then Break;
    Cursor := Parent;
  end;
  Result := True;
end;

function RetiredTargetIsOwned(TargetDir: String): Boolean;
var
  Registered, Target, WindowsDir, ProfileDir: String;
begin
  Result := False;
  Target := AddBackslash(ExpandFileName(TargetDir));
  WindowsDir := AddBackslash(ExpandFileName(ExpandConstant('{win}')));
  ProfileDir := AddBackslash(ExpandFileName(ExpandConstant('{userappdata}\EmbyTheaterEnhanced')));
  if (CompareText(Copy(Target, 1, Length(WindowsDir)), WindowsDir) = 0) or
     (CompareText(Copy(Target, 1, Length(ProfileDir)), ProfileDir) = 0) or
     (Pos('\embytheaterenhanced\', Lowercase(Target)) > 0) then Exit;
  if not RegQueryStringValue(HKLM64,
    'Software\Microsoft\Windows\CurrentVersion\Uninstall\{868314CE-1253-46A3-A4EA-55CDE71BCF0A}_is1',
    'InstallLocation', Registered) then Exit;
  if not IsAbsoluteTargetDir(Registered) then Exit;
  Result := CompareText(AddBackslash(ExpandFileName(Registered)), Target) = 0;
end;

function CheckRetiredRuntime(TargetDir: String): String;
var
  I, Handle: Integer;
  FileName: String;
  HasRetired: Boolean;
  Attributes: LongWord;
begin
  Result := '';
  HasRetired := False;
  try
    for I := 0 to 13 do
    begin
      FileName := AddBackslash(ExpandFileName(TargetDir)) + RetiredPath(I);
      Attributes := RetiredGetFileAttributes(FileName);
      if (Attributes <> $FFFFFFFF) and ((Attributes and $400) <> 0) then
      begin
        Result := CustomMessage('RetiredFileUnsafe');
        Exit;
      end;
      if DirExists(FileName) then
      begin
        Result := CustomMessage('RetiredFileUnsafe');
        Exit;
      end;
      if FileExists(FileName) then
      begin
        HasRetired := True;
        if not RetiredPathIsPhysical(FileName) then
        begin
          Result := CustomMessage('RetiredFileUnsafe');
          Exit;
        end;
        if CompareText(GetSHA256OfFile(FileName), RetiredSHA256(I)) <> 0 then
        begin
          Result := CustomMessage('RetiredFileUnsafe');
          Exit;
        end;
        Handle := GuardCreateFile(FileName, GuardGenericWrite, GuardShareAll,
          0, GuardOpenExisting, 0, 0);
        if Handle = GuardInvalidHandle then
        begin
          Result := CustomMessage('RetiredFileUnsafe');
          Exit;
        end;
        GuardCloseHandle(Handle);
      end;
    end;
    if HasRetired and not RetiredTargetIsOwned(TargetDir) then
      Result := CustomMessage('RetiredFileUnsafe');
  except
    Result := CustomMessage('RetiredFileUnsafe');
  end;
end;

procedure RetireKnownRuntime(TargetDir: String);
var
  I: Integer;
  FileName, Error: String;
begin
  Error := GuardTarget(TargetDir);
  if Error = '' then Error := CheckRetiredRuntime(TargetDir);
  if Error <> '' then RaiseException(Error);
  for I := 0 to 13 do
  begin
    FileName := AddBackslash(ExpandFileName(TargetDir)) + RetiredPath(I);
    if FileExists(FileName) then
    begin
      { Recheck immediately before each exact leaf removal; never recurse. }
      if not RetiredPathIsPhysical(FileName) or
        (CompareText(GetSHA256OfFile(FileName), RetiredSHA256(I)) <> 0) then
        RaiseException(CustomMessage('RetiredFileUnsafe'));
      if not DeleteFile(FileName) then RaiseException(CustomMessage('RetiredFileUnsafe'));
      Log('Removed verified retired program file: ' + RetiredPath(I));
    end;
  end;
end;
