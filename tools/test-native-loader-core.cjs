'use strict';
// Host compilation of the actual loader function with Win32 call substitutes.
// This checks call ordering/privacy and C++ types, not Windows DLL execution.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const source=fs.readFileSync(path.join(__dirname,'../native/mpv-helper/ete-mpv-helper.cpp'),'utf8'),start=source.indexOf('HMODULE loadMpvLibrary('),end=source.indexOf('bool parseWindowHandle(',start);
if(start<0||end<start)throw Error('Actual loader source missing');
const code=`#include <string>
#include <vector>
#include <stdexcept>
#include <iostream>
#include <cstdint>
using DWORD=uint32_t;using HMODULE=void*;
constexpr DWORD LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR=256,LOAD_LIBRARY_SEARCH_DEFAULT_DIRS=4096,INVALID_FILE_ATTRIBUTES=0xffffffff,FILE_ATTRIBUTE_DIRECTORY=16;
DWORD errorCode=126,attributes=32,flagsSeen=0;HMODULE loaded=nullptr;std::vector<int> calls;
HMODULE LoadLibraryExW(const wchar_t*,void*,DWORD flags){calls.push_back(1);flagsSeen=flags;return loaded;}
DWORD GetLastError(){calls.push_back(2);return errorCode;}
DWORD GetFileAttributesW(const wchar_t*){calls.push_back(3);errorCode=5;return attributes;}
${source.slice(start,end)}
int main(){int checks=0;auto check=[&](bool v){if(!v)throw std::runtime_error("loader-core-failed");++checks;};
for(DWORD error:{126u,127u,193u,1114u}){calls.clear();errorCode=error;try{loadMpvLibrary(L"C:\\\\private-title\\\\mpv-1.dll");throw std::runtime_error("expected-rejection");}catch(const std::runtime_error& e){std::string text=e.what();check(text.find("win32-"+std::to_string(error))!=std::string::npos);check(text.find("private-title")==std::string::npos);check(text.find("target-file-1:absolute-1")!=std::string::npos);}check(calls==std::vector<int>({1,2,3}));check(flagsSeen==4352);}
attributes=INVALID_FILE_ATTRIBUTES;errorCode=126;try{loadMpvLibrary(L"relative/private.dll");}catch(const std::runtime_error& e){check(std::string(e.what()).find("target-file-0:absolute-0")!=std::string::npos);check(std::string(e.what()).find("forward-slashes-1")!=std::string::npos);}
loaded=reinterpret_cast<HMODULE>(1);calls.clear();check(loadMpvLibrary(L"C:\\\\valid.dll")==loaded);check(calls==std::vector<int>({1}));
std::cout<<"{\\"checks\\":"<<checks<<",\\"windowsDllExecuted\\":false}"<<std::endl;}
`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ete-loader-core-'));
try{const input=path.join(dir,'test.cpp'),output=path.join(dir,process.platform==='win32'?'test.exe':'test');fs.writeFileSync(input,code);cp.execFileSync('g++',['-std=c++17','-Wall','-Wextra','-Werror',input,'-o',output],{stdio:'pipe'});process.stdout.write(cp.execFileSync(output));}finally{fs.rmSync(dir,{recursive:true,force:true});}
