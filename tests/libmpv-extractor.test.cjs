'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const input=require('../tools/libmpv-input.cjs'),prepare=require('../tools/prepare-libmpv.cjs');
const sevenZip='C:\\Program Files\\7-Zip\\7z.exe',tar='C:\\Windows\\System32\\tar.exe';
const archive='C:\\fixed inputs\\archive.7z',member={member:'libmpv-2.dll'},entry={size:64};
function tools(t,available) {
    const checked=[];
    t.mock.method(fs,'existsSync',p=>available.includes(p));
    t.mock.method(input,'physical',(p,directory)=>{checked.push(p);assert.equal(directory,false);});
    return checked;
}
test('preinstalled 7-Zip is selected before an LZMA-incompatible Windows system tar',t=>{
    const checked=tools(t,[sevenZip,tar]),calls=[],dll=Buffer.from('synthetic DLL');
    t.mock.method(cp,'execFileSync',(exe,args,options)=>{
        assert.equal(exe,sevenZip,'system tar must not be attempted');calls.push(args);
        if(args[0]==='l'){assert.equal(options.maxBuffer,1048576);return 'Path = include/mpv/client.h\r\n\r\nPath = libmpv-2.dll\r\n';}
        assert.equal(options.maxBuffer,entry.size+65536);return dll;
    });
    assert.equal(prepare.extract(archive,member,entry,'win32'),dll);
    assert.deepEqual(checked,[sevenZip]);
    assert.deepEqual(calls,[['l','-slt','-ba','-sccUTF-8','--',archive],['x','-so','-spd','-ssc','--',archive,member.member]]);
});
test('absent 7-Zip retains the existing trusted system tar route when supported',t=>{
    const checked=tools(t,[tar]),calls=[],dll=Buffer.from('synthetic DLL');
    t.mock.method(cp,'execFileSync',(exe,args)=>{assert.equal(exe,tar);calls.push(args);return args[0]==='-tf'?'libmpv-2.dll\n':dll;});
    assert.equal(prepare.extract(archive,member,entry,'win32'),dll);
    assert.deepEqual(checked,[tar]);assert.deepEqual(calls,[['-tf',archive],['-xOf',archive,member.member]]);
});
test('missing 7-Zip plus LZMA-incompatible tar fails clearly without another tool or retry',t=>{
    tools(t,[tar]);let calls=0;
    t.mock.method(cp,'execFileSync',exe=>{assert.equal(exe,tar);calls++;throw Error('LZMA codec is unsupported');});
    assert.throws(()=>prepare.extract(archive,member,entry,'win32'),/requires preinstalled trusted 7-Zip.*LZMA codec is unsupported/);
    assert.equal(calls,1);
});
test('missing trusted Windows extractors fail without PATH lookup or installation',t=>{
    tools(t,[]);t.mock.method(cp,'execFileSync',()=>assert.fail('no process may start'));
    assert.throws(()=>prepare.extract(archive,member,entry,'win32'),/Preinstalled trusted 7-Zip or LZMA-capable system tar is required/);
});
test('redirected preinstalled 7-Zip is rejected without falling back to tar',t=>{
    tools(t,[sevenZip,tar]);t.mock.method(input,'physical',()=>{throw Error('links or redirects are forbidden');});
    t.mock.method(cp,'execFileSync',()=>assert.fail('redirected tool may not run'));
    assert.throws(()=>prepare.extract(archive,member,entry,'win32'),/links or redirects are forbidden/);
});
test('failed preinstalled 7-Zip does not silently retry another extractor',t=>{
    tools(t,[sevenZip,tar]);let calls=0;
    t.mock.method(cp,'execFileSync',exe=>{assert.equal(exe,sevenZip);calls++;throw Error('extractor failed');});
    assert.throws(()=>prepare.extract(archive,member,entry,'win32'),/extractor failed/);assert.equal(calls,1);
});
for(const paths of [[],['nested/libmpv-2.dll'],['LIBMPV-2.DLL'],['libmpv-2.dll','libmpv-2.dll']])test('7-Zip requires one exact root DLL member: '+JSON.stringify(paths),t=>{
    tools(t,[sevenZip]);let calls=0;
    t.mock.method(cp,'execFileSync',(exe,args)=>{assert.equal(exe,sevenZip);assert.equal(args[0],'l');calls++;return paths.map(p=>'Path = '+p+'\n').join('\n');});
    assert.throws(()=>prepare.extract(archive,member,entry,'win32'),/exactly one pinned DLL member/);assert.equal(calls,1);
});
test('non-Windows keeps the original bsdtar selection',()=>assert.deepEqual(prepare.selectExtractor('linux'),{kind:'tar',file:'bsdtar'}));
