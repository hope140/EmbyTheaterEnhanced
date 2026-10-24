'use strict';
// Compiles exact portable blocks extracted from the maintained Windows helper.
// This is not a Windows helper build or libmpv/graphics execution.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const source=fs.readFileSync(path.join(__dirname,'../native/mpv-helper/ete-mpv-helper.cpp'),'utf8');
function between(start,end){const first=source.indexOf(start),last=source.indexOf(end,first+start.length);if(first<0||last<=first)throw Error('Missing maintained source block');return source.slice(first,last);}
const core=between('// BEGIN PREVIEW_OWNER_CORE','// END PREVIEW_OWNER_CORE').replace(/^[^\n]*\n/,'');
const quoteSource=between('std::string quote(', 'bool validUtf8(');
const unavailable=between('    std::string frameUnavailable(', '    bool releaseHeldFrame(');
// Include the real method-call boundary as well as the pure state machine:
// finishPreview -> frameUnavailable previously escaped this compilation.
const previewMethods=between('    bool hasPreviewVideo()', '    static const char* autoStageText(');
const uniqueMedia=between('    int64_t uniqueOpenMedia()', '    void submitNextLoad(');
const program=`#include <algorithm>
#include <cmath>
#include <cstdint>
#include <memory>
#include <vector>
#include <string>
#include <stdexcept>
#include <iostream>
#include <cstring>
#include <cstdlib>
#include <map>
#include <set>
#include <sstream>
#include <iomanip>
${core}
${quoteSource}
struct HeldFrame { int width, height; std::shared_ptr<std::vector<uint8_t>> pixels; };
struct Output {
 struct Reply { uint64_t generation, request; std::string payload; };
 std::vector<Reply> replies;
 PreviewOwner previewOwner; PreviewCapture previewCapture;
 uint64_t latestActivatedGeneration=0, retiredThroughGeneration=0;
 std::map<int64_t,uint64_t> mediaToGeneration; std::set<int64_t> openMedia;
 void emitResponse(uint64_t generation,uint64_t request,const std::string& payload) { replies.push_back({generation,request,payload}); }
 const char* track = nullptr; void* mpv = nullptr;
 static char* copyTrack(void* instance, const char*) {
   const char* value = static_cast<Output*>(instance)->track;
   if (!value) return nullptr;
   char* copied = static_cast<char*>(std::malloc(std::strlen(value)+1)); std::strcpy(copied,value); return copied;
 }
 char* (*p_mpv_get_property_string)(void*, const char*) = copyTrack;
 void (*p_mpv_free)(void*) = std::free;
 ${unavailable}
 ${uniqueMedia}
 ${previewMethods}
};
int main() {
 int checks=0; auto check=[&](bool value){if(!value)throw std::runtime_error("owner-core-check-failed");++checks;};
 Output guard; guard.mpv=&guard;
 guard.track="1";check(guard.hasPreviewVideo());guard.track=nullptr;check(!guard.hasPreviewVideo());
 guard.track="no";check(!guard.hasPreviewVideo());guard.track="";check(!guard.hasPreviewVideo());
 PreviewOwner owner;
 owner.activate(10);owner.start(10,1);check(!owner.owns(10,1));
 owner.restart(1);check(!owner.owns(10,1));owner.fileLoaded(1);check(!owner.owns(10,1));
 owner.restart(1);check(owner.owns(10,1));owner.activate(10);check(owner.owns(10,1));
 PreviewCapture capture{5,10,1,1000,1,false};check(capture.accepts(owner,999));check(!capture.accepts(owner,1000));
 owner.activate(11);check(!capture.accepts(owner,20));
 owner.start(11,2);owner.fileLoaded(2);owner.restart(1);check(!owner.owns(11,2));owner.restart(2);check(owner.owns(11,2));
 check(capture.finish());check(!capture.finish());check(capture.userdata==5);check(!capture.accepts(owner,20));
 capture={};check(capture.userdata==0);
 PreviewCapture next{6,11,2,2000,2,false};check(next.accepts(owner,100));
 owner.end(1);check(owner.owns(11,2));owner.end(2);check(!next.accepts(owner,100));
 owner.start(11,3);owner.fileLoaded(3);owner.restart(3);check(owner.owns(11,3));owner.retire(11);check(!owner.owns(11,3));
 owner.activate(12);owner.start(11,3);owner.fileLoaded(3);owner.restart(3);check(!owner.owns(12,3));
 Output helper; helper.latestActivatedGeneration=12;helper.retiredThroughGeneration=11;
 helper.openMedia.insert(3);helper.mediaToGeneration[3]=12;
 helper.previewOwner.activate(12);helper.previewOwner.start(12,3);helper.previewOwner.fileLoaded(3);helper.previewOwner.restart(3);
 check(helper.ownsPreview(12,3));check(!helper.ownsPreview(11,3));
 helper.mediaToGeneration[3]=11;check(!helper.ownsPreview(12,3));helper.mediaToGeneration[3]=12;
 helper.openMedia.insert(4);check(!helper.ownsPreview(12,3));helper.openMedia.erase(4);
 helper.previewOwner.end(3);check(!helper.ownsPreview(12,3));
 helper.finishPreview("no-pending");check(helper.replies.empty());
 helper.previewCapture={9,12,5,1000,3,false};
 const std::string reason="preview-\\\"retired\\\"\\n";helper.finishPreview(reason);
 check(helper.replies.size()==1);check(helper.replies[0].generation==12&&helper.replies[0].request==5);
 check(helper.previewCapture.finished&&helper.previewCapture.userdata==9);
 helper.finishPreview("duplicate");check(helper.replies.size()==1);
 helper.previewCapture={};helper.finishPreview("cleared-slot");check(helper.replies.size()==1);
 helper.previewCapture={10,13,6,2000,4,false};helper.finishPreview("preview-deadline");
 check(helper.replies.size()==2&&helper.replies[1].generation==13&&helper.replies[1].request==6);
 HeldFrame frame{320,180,std::make_shared<std::vector<uint8_t>>(320*180*4,0)};
 for(size_t i=0;i<frame.pixels->size();i+=4) {(*frame.pixels)[i]=19;(*frame.pixels)[i+1]=67;(*frame.pixels)[i+2]=213;(*frame.pixels)[i+3]=17;}
 std::cout<<"{\\\"checks\\\":"<<checks<<",\\\"unavailable\\\":["<<helper.replies[0].payload<<","<<helper.replies[1].payload<<"],\\\"snapshot\\\":"<<Output{}.previewPixels(frame,12)<<"}";
}`;
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ete-preview-core-'));
try {
 const compiler=process.argv[2]||'g++',input=path.join(root,'core.cpp'),binary=path.join(root,process.platform==='win32'?'core.exe':'core');
 fs.writeFileSync(input,program);
 execFileSync(compiler,['-std=c++17','-Wall','-Wextra','-Werror',input,'-o',binary],{stdio:'pipe'});
 const result=JSON.parse(execFileSync(binary,[],{encoding:'utf8'}));
 const assert=require('node:assert/strict');
 assert.deepEqual(result.unavailable,[{ready:false,status:'unavailable',reason:'preview-"retired"\n'},{ready:false,status:'unavailable',reason:'preview-deadline'}]);
 const decoded=require('../src/electronapp/native-helper/preview-snapshot').decode(result.snapshot,12);
 if(!decoded||decoded.width!==160||decoded.height!==90||decoded.pixels.length!==57600)throw Error('core-output-invalid');
 for(let i=0;i<decoded.pixels.length;i+=4)if(decoded.pixels[i]!==19||decoded.pixels[i+1]!==67||decoded.pixels[i+2]!==213||decoded.pixels[i+3]!==255)throw Error('core-color-invalid');
 process.stdout.write(JSON.stringify({scope:'portable-extracted-source-only',checks:result.checks,finishPreviewBoundaryCompiled:true,unavailableRepliesDecoded:result.unavailable.length,sourcePixels:320*180,outputPixels:160*90,
  compiler:execFileSync(compiler,['--version'],{encoding:'utf8'}).split('\n')[0],windowsHelperBuilt:false})+'\n');
} finally {fs.rmSync(root,{recursive:true,force:true});}
