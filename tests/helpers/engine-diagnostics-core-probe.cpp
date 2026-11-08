#include <algorithm>
#include <chrono>
#include <cassert>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <limits>
#include <regex>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>
#include "engine-core-under-test.h"

int main() {
    NetworkLogProjection network;
    assert(projectNetworkLog("curl", "proto=https ok=0 code=206 size=-1 seekable=0 type=video/x-matroska\n", network));
    assert(network.streamOk==0 && network.declaredContentSize==-1 && network.seekable==0);
    assert(projectNetworkLog("curl", "proto=https ok=1 code=206 size=2994403088 seekable=1 type=video/x-matroska\n", network));
    assert(network.streamOk==1 && network.declaredContentSize==2994403088LL && network.seekable==1);

    const auto safe=scrubEngineText("Decode failure C:\\media\\sample.mkv\nhttps://USER_CANARY:PASSWORD_CANARY@nas.invalid:8098/file?token=TOKEN_CANARY\nAuthorization: Bearer AUTH_CANARY\nCookie: SESSION_CANARY\n{\"api_key\":\"JSON_CANARY\"}");
    assert(safe.find("CANARY")==std::string::npos);
    assert(safe.find("Decode failure")!=std::string::npos && safe.find("sample.mkv")!=std::string::npos);
    const auto folded=scrubEngineText("error\nCookie: A_CANARY\n  B_CANARY\nftp://U_CANARY:P_CANARY@host.invalid/a\npassword=\"P CANARY WITH SPACES\"\n\\\"token\\\":\\\"ESCAPED_CANARY\\\"");
    assert(folded.find("CANARY")==std::string::npos);
    EngineLogWindow unknown;unknown.begin(9,false,1);unknown.add("unknown module","error","fault description",2);
    assert(unknown.errors.size()==1 && unknown.errors[0].module=="other");
    assert(scrubEngineText(("Authorization: "+std::string(65000,'A')).c_str()).find("AAAA")==std::string::npos);

    const auto truncated=scrubEngineText((std::string(370,'x')+" token="+std::string(900,'T')+"CANARY").c_str());
    assert(truncated.size()<=384 && truncated.find("TTTT")==std::string::npos);
    assert(scrubEngineText(std::string(66000,'x').c_str()).find("oversized")!=std::string::npos);

    EngineLogWindow normal;normal.begin(1,false,100);
    normal.add("vd","error","decoder failed",101);normal.add("ao","warn","output warning",102);
    normal.add("cplayer","v","seeking to last frame...",103);
    assert(normal.errors.size()==1 && normal.warnings.size()==1 && normal.context.empty());
    normal.finish("playing");normal.contextOpen=false;normal.add("vd","error","late decoder failure",20000000);
    assert(normal.errors.size()==2);

    EngineLogWindow detailed;detailed.begin(2,true,100);
    detailed.add("cplayer","v","seeking to last frame...",101);assert(detailed.context.size()==1);
    detailed.finish("eof");detailed.add("cplayer","v","queued startup tail",102);assert(detailed.context.size()==2);
    detailed.contextOpen=false;detailed.add("cplayer","v","playback chatter",103);assert(detailed.context.size()==2);
    detailed.begin(3,true,100);detailed.add("demux","debug","startup",101);detailed.tick(15000100);
    detailed.add("demux","debug","after deadline",15000101);assert(detailed.phase=="timeout" && detailed.context.size()==1);
    detailed.add("vd","error","failure after deadline",15000102);assert(detailed.errors.size()==1);
    detailed.begin(4,false,16000000);assert(detailed.context.empty() && detailed.errors.empty() && !detailed.detailed);

    EngineLogWindow flood;flood.begin(5,true,100);
    flood.add("vd","error","FIRST_CAUSE",101);
    const auto begin=std::chrono::steady_clock::now();
    for(int i=0;i<10000;i++) {
        const auto line="failure "+std::to_string(i)+std::string(390,'"');
        flood.add("vd","error",line.c_str(),200+static_cast<uint64_t>(i));
        flood.add("ao","warn",line.c_str(),200+static_cast<uint64_t>(i));
        flood.add("cplayer","v",line.c_str(),200+static_cast<uint64_t>(i));
    }
    const auto micros=std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-begin).count();
    assert(flood.errors.size()==16 && flood.warnings.size()==8 && flood.context.size()==40);
    assert(flood.errors.front().message=="FIRST_CAUSE");
    const auto wire=flood.snapshot(20000);assert(wire.size()<65536 && flood.dropped>0);
    std::cout<<"{\"inputMessages\":30000,\"elapsedMicros\":"<<micros<<",\"retainedRecords\":64,\"snapshotBytes\":"<<wire.size()<<",\"dropped\":"<<flood.dropped<<"}\n";
}
