{ Exact legacy application identities; source: retired-runtime.json. }
function RetiredPath(Index: Integer): String;
begin
  Result := '';
  case Index of
    0: Result := 'System.Configuration.dll';
    1: Result := 'cec\cec-client.exe';
    2: Result := 'cec\cec-client.x64.exe';
    3: Result := 'cec\cec.dll';
    4: Result := 'cec\cec.x64.dll';
    5: Result := 'cec\p8-usbcec-driver-installer.exe';
    6: Result := 'electronapp\cec\cec.js';
    7: Result := 'electronapp\cec\command-map.js';
    8: Result := 'electronapp\plugins\cec.js';
    9: Result := 'electronapp\plugins\cec\cec.html';
    10: Result := 'electronapp\plugins\cec\cec.js';
    11: Result := 'ServiceStack.Text.dll';
    12: Result := 'ServiceStack.Text.xml';
    13: Result := 'SharpCompress.dll';
  end;
end;

function RetiredSHA256(Index: Integer): String;
begin
  Result := '';
  case Index of
    0: Result := '3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf';
    1: Result := '42f601278f82c37d0cc26460d4ac80e62f6cec5b84b2efb0ee8ed75c1cbc4519';
    2: Result := '42f601278f82c37d0cc26460d4ac80e62f6cec5b84b2efb0ee8ed75c1cbc4519';
    3: Result := '6e2932ab53f4d05d5f815499786a48c3ccb8a60c527aa2f34e4abbf14dc66d04';
    4: Result := '6e2932ab53f4d05d5f815499786a48c3ccb8a60c527aa2f34e4abbf14dc66d04';
    5: Result := '6e4d5a091720cf5ad727896bbf3766e5529468e24849183439506130bde3546a';
    6: Result := 'd937ab39ef534e8cf1fafcc7784d864521e1d2cc48514c342f981a1889558795';
    7: Result := '3e81363821638657aaa7c907a0dad8adda5b29e3d150ecb55c19636bc3cdfebc';
    8: Result := 'cf0832b015500550ef3ceaa5c92ed4bcfb0672272785e7b18c07612d2432754d';
    9: Result := 'ab535fbda8863307160503a60a8398b6783648a4f9c40f0c0bc9bd0591031117';
    10: Result := 'cfaf792731a54a04470da37cc6029f87b11ce77d2ebe263958ace189a4b45a73';
    11: Result := '2cc4fc93be82d4818dc81beb9f5cd0e4f995c77e1725c129e4918e8aeaeb39c1';
    12: Result := '19b2a3730eb32f402888a58df9c6704cde19c0e38138dbad4fef000750669c0d';
    13: Result := '3c34138417974ce215e5d1b5bdbb7abd578ce77420073ea9de3f46ccebe42b55';
  end;
end;
