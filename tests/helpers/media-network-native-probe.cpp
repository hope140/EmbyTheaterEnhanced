#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <string>
#include <string_view>
#include <iostream>
#include <cassert>
#include <cstdint>
#include <atomic>
#include <condition_variable>
#include <deque>
#include <map>
#include <mutex>
#include <thread>
#include "mpv/client.h"
#include "network-core.h"
#include "network-writer.h"
int main(int argc, char** argv) {
    if (argc == 1) {
        NetworkLogProjection p;
        assert(projectNetworkLog("curl", "proto=http ok=1 code=206 size=1 seekable=1 type=SECRET_CANARY\n", p) && p.httpStatus == 206);
        assert(projectNetworkLog("curl", "HTTP error 403\n", p) && p.httpStatus == 403);
        assert(projectNetworkLog("curl", "error: Could not connect to server\n", p) && std::string(p.networkError) == "connect");
        assert(projectNetworkLog("curl", "transfer failed: Transferred a partial file\n", p) && std::string(p.stage) == "transfer");
        assert(projectNetworkLog("curl", "Transferred a partial file, retrying (#1) from 12\n", p) && std::string(p.kind) == "retry");
        assert(projectNetworkLog("curl", "error: Could not resolve hostname\n", p) && std::string(p.networkError) == "name-resolution");
        assert(projectNetworkLog("curl", "error: SSL connect error\n", p) && std::string(p.networkError) == "tls-handshake");
        assert(projectNetworkLog("curl", "TLS certificate verification failed.\n", p) && std::string(p.networkError) == "tls-verification");
        assert(projectNetworkLog("curl", "error: Timeout was reached\n", p) && std::string(p.networkError) == "timeout");
        assert(projectNetworkLog("overflow", "SECRET_CANARY", p) && std::string(p.kind) == "overflow");
        for (const char* s : {"https://secret.invalid/HTTP error 403", "> Authorization: HTTP error 403", "< X-Private: HTTP error 403",
            "< HTTP/1.1 200 HTTP error 403", "HTTP error 403 SECRET_CANARY", "error: SECRET_CANARY", "HTTP error 999", "HTTP error -13",
            "HTTP error 403\nHTTP error 404", "proto=http ok=1 code=403x size=0", "Transferred a partial file, retrying (#TOKEN) from 1"}) assert(!projectNetworkLog("curl", s, p));
        assert(!projectNetworkLog("ffmpeg", "HTTP error 403", p));
        assert(!projectNetworkLog("SECRET_CANARY", "HTTP error 403", p));
        assert(!projectNetworkLog("curl", std::string(8192, 'X').c_str(), p));
        NetworkLogBudget budget; unsigned accepted=0, suppressed=0;
        for(int i=0;i<100000;++i){p={"response","response","none",200};if(budget.admit(0,p)){++accepted;if(std::string(p.kind)=="suppressed")++suppressed;}}
        assert(accepted==65 && suppressed==1); assert(budget.admit(60000000,p));
        HANDLE input=nullptr,output=nullptr;assert(CreatePipe(&input,&output,nullptr,4096));
        WriterQueue writer(output);assert(writer.enqueue(std::string(60000,'X'),true));
        DWORD available=0;const DWORD waitStart=GetTickCount();
        while(GetTickCount()-waitStart<2000){assert(PeekNamedPipe(input,nullptr,0,nullptr,&available,nullptr));if(available)break;Sleep(1);}
        assert(available>0); // writer has popped the first frame and is blocked in the full pipe
        for(int i=0;i<127;++i)assert(writer.enqueue("X",true));
        assert(writer.enqueue("diagnostic",false,"media-network-diagnostics"));
        assert(writer.enqueue("authoritative",true));assert(!writer.hasFailed());
        assert(writer.enqueue("dropped-diagnostic",false,"media-network-diagnostics"));assert(!writer.hasFailed());
        assert(writer.metricsJson().find("\"coalescedDropped\":2")!=std::string::npos);
        CloseHandle(input);writer.close();CloseHandle(output);
        std::cout << "projection-and-budget-passed\n"; return 0;
    }
    if (argc != 3 || !isolateNetworkStderr()) return 2;
    std::fputs("STDERR_GUARD_CANARY", stderr);
    DWORD written = 0; WriteFile(GetStdHandle(STD_ERROR_HANDLE), "STDERR_GUARD_CANARY", 19, &written, nullptr);
    HMODULE dll=LoadLibraryExA(argv[1],nullptr,LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR|LOAD_LIBRARY_SEARCH_DEFAULT_DIRS); if(!dll)return 3;
#define FN(n) auto n##_fn=reinterpret_cast<decltype(&n)>(GetProcAddress(dll,#n)); if(!n##_fn)return 4
    FN(mpv_create);FN(mpv_initialize);FN(mpv_set_option_string);FN(mpv_request_log_messages);FN(mpv_command);FN(mpv_wait_event);FN(mpv_terminate_destroy);FN(mpv_create_client);FN(mpv_destroy);
    mpv_handle* m=mpv_create_fn(); if(!m)return 5;
    for (auto kv : {std::pair<const char*,const char*>{"config","no"},{"terminal","no"},{"vo","null"},{"ao","null"},{"ytdl","no"},{"network-timeout","2"}}) mpv_set_option_string_fn(m,kv.first,kv.second);
    if (mpv_initialize_fn(m)<0)return 6;
    mpv_handle* logs=mpv_create_client_fn(m,"ete-network-diagnostics");if(!logs || mpv_request_log_messages_fn(logs,"debug")<0)return 7;
    const char* args[]={"loadfile",argv[2],nullptr};mpv_command_fn(m,args);
    DWORD start=GetTickCount(),finished=0;int endReason=-1,mpvError=0; unsigned sequence=0; NetworkLogBudget budget;
    std::cout << "{\"observations\":[";bool first=true;
    while(GetTickCount()-start<8000 && (!finished || GetTickCount()-finished<100)) {
        const auto* event=mpv_wait_event_fn(m,0.005);
        if(event->event_id==MPV_EVENT_END_FILE){const auto* end=static_cast<const mpv_event_end_file*>(event->data);endReason=end->reason;mpvError=end->error;finished=GetTickCount();}
        for(int i=0;i<64;++i){const auto* e=mpv_wait_event_fn(logs,0);if(!e||e->event_id==MPV_EVENT_NONE)break;
            if(e->event_id!=MPV_EVENT_LOG_MESSAGE||!e->data)continue;
            const auto* log=static_cast<const mpv_event_log_message*>(e->data);NetworkLogProjection p;
            if(!projectNetworkLog(log->prefix,log->text,p)||!budget.admit((GetTickCount()-start)*1000ULL,p))continue;
            if(!first)std::cout<<',';first=false;
            std::cout<<"{\"kind\":\""<<p.kind<<"\",\"stage\":\""<<p.stage<<"\",\"networkError\":\""<<p.networkError<<"\",\"httpStatus\":";
            if(p.httpStatus)std::cout<<p.httpStatus;else std::cout<<"null";std::cout<<",\"sequence\":"<<++sequence<<'}';
        }
    }
    mpv_destroy_fn(logs);mpv_terminate_destroy_fn(m);FreeLibrary(dll);
    std::cout<<"],\"endReason\":"<<endReason<<",\"mpvError\":"<<mpvError<<"}\n";
}
