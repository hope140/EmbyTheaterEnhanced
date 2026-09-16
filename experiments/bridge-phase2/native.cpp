// Isolated Windows architecture spike; GPL-2.0-only. Not a product bridge.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <GL/gl.h>
#include <atomic>
#include <thread>
#include <chrono>
#include <string>
#include <vector>
#include <sstream>
#include <iostream>
#include <fstream>
#include <stdexcept>
#include "mpv/client.h"
#include "mpv/render_gl.h"
#ifdef ADDON
#include "node/node_api.h"
#endif

static std::string quote(const std::string& s) {
    std::string r = "\"";
    for (unsigned char c : s) {
        if (c == '"' || c == '\\') { r += '\\'; r += c; }
        else if (c < 32) { char b[7]; snprintf(b, sizeof b, "\\u%04x", c); r += b; }
        else r += c;
    }
    return r + '"';
}
static std::vector<std::string> split(const std::string& s) {
    std::vector<std::string> r; size_t start = 0, end;
    while ((end = s.find('\t', start)) != std::string::npos) {
        r.push_back(s.substr(start, end-start)); start = end+1;
    }
    r.push_back(s.substr(start)); return r;
}
#define MPV_FUNCS(X) \
 X(mpv_create) X(mpv_initialize) X(mpv_set_option_string) X(mpv_command) \
 X(mpv_set_property_string) X(mpv_get_property_string) X(mpv_free) \
 X(mpv_observe_property) X(mpv_wait_event) X(mpv_terminate_destroy) \
 X(mpv_render_context_create) X(mpv_render_context_set_update_callback) \
 X(mpv_render_context_update) X(mpv_render_context_render) \
 X(mpv_render_context_report_swap) X(mpv_render_context_free)

class Bridge {
    HMODULE dll = nullptr;
#define FIELD(n) decltype(&n) p_##n = nullptr;
    MPV_FUNCS(FIELD)
#undef FIELD
    mpv_handle* core = nullptr;
    HWND parent = nullptr, child = nullptr;
    std::thread surface;
    std::atomic<bool> closing{false}, initialized{false}, dirty{true};
    std::atomic<int> phase{0};
    std::atomic<unsigned> frames{0};
    bool renderApi;
    static void update(void* p) { static_cast<Bridge*>(p)->dirty = true; }
    static void* glProc(void*, const char* name) {
        auto p = wglGetProcAddress(name);
        if (!p || p == (PROC)1 || p == (PROC)2 || p == (PROC)3 || p == (PROC)-1)
            p = GetProcAddress(GetModuleHandleW(L"opengl32.dll"), name);
        return reinterpret_cast<void*>(p);
    }
    void surfaceLoop() {
        // Match the Electron parent context before creating a cross-process child.
        auto dpi = GetWindowDpiAwarenessContext(parent);
        SetThreadDpiAwarenessContext(dpi);
        WNDCLASSW wc{}; wc.style = CS_OWNDC; wc.lpfnWndProc = DefWindowProcW;
        wc.hInstance = GetModuleHandleW(nullptr); wc.lpszClassName = L"ETEPhase2Surface";
        RegisterClassW(&wc);
        child = CreateWindowExW(0, wc.lpszClassName, L"", WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
            0, 80, 640, 360, parent, nullptr, wc.hInstance, nullptr);
        if (!child) { phase = -1; return; }
        phase = 1;
        while (!initialized && !closing) Sleep(1);
        HDC dc = nullptr; HGLRC gl = nullptr; mpv_render_context* render = nullptr;
        if (renderApi && !closing) {
            dc = GetDC(child);
            PIXELFORMATDESCRIPTOR pd{}; pd.nSize = sizeof pd; pd.nVersion = 1;
            pd.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
            pd.iPixelType = PFD_TYPE_RGBA; pd.cColorBits = 32;
            int pf = ChoosePixelFormat(dc, &pd);
            if (!pf || !SetPixelFormat(dc, pf, &pd) || !(gl = wglCreateContext(dc)) || !wglMakeCurrent(dc, gl)) phase = -2;
            else {
                mpv_opengl_init_params init{glProc, nullptr};
                mpv_render_param params[] = {{MPV_RENDER_PARAM_API_TYPE, (void*)"opengl"},
                    {MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &init}, {MPV_RENDER_PARAM_INVALID, nullptr}};
                int rc = p_mpv_render_context_create(&render, core, params);
                if (rc < 0) phase = rc - 100;
                else { p_mpv_render_context_set_update_callback(render, update, this); phase = 2; }
            }
        } else if (!closing) phase = 2;
        int oldW = 0, oldH = 0;
        while (!closing && phase == 2 && IsWindow(parent)) {
            MSG msg; while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
            RECT rect{}; GetClientRect(parent, &rect);
            int top = MulDiv(80, GetDpiForWindow(parent), 96);
            int w = std::max(1L, rect.right), h = std::max(1L, rect.bottom-top);
            bool resized = w != oldW || h != oldH;
            if (resized) { SetWindowPos(child, HWND_TOP, 0, top, w, h, SWP_NOACTIVATE); oldW = w; oldH = h; }
            if (render && (dirty.exchange(false) || resized)) {
                p_mpv_render_context_update(render);
                mpv_opengl_fbo fbo{0, w, h, 0}; int flip = 1;
                mpv_render_param params[] = {{MPV_RENDER_PARAM_OPENGL_FBO, &fbo},
                    {MPV_RENDER_PARAM_FLIP_Y, &flip}, {MPV_RENDER_PARAM_INVALID, nullptr}};
                p_mpv_render_context_render(render, params); SwapBuffers(dc);
                p_mpv_render_context_report_swap(render); ++frames;
            }
            Sleep(8);
        }
        // The render owner frees its context while its WGL context remains current.
        if (render) { p_mpv_render_context_set_update_callback(render, nullptr, nullptr); p_mpv_render_context_free(render); }
        if (gl) { wglMakeCurrent(nullptr, nullptr); wglDeleteContext(gl); }
        if (dc) ReleaseDC(child, dc);
        if (IsWindow(child)) DestroyWindow(child);
        child = nullptr;
    }
    void option(const char* n, const char* v) {
        if (p_mpv_set_option_string(core, n, v) < 0) throw std::runtime_error(std::string("option:") + n);
    }
public:
    explicit Bridge(bool api): renderApi(api) {}
    ~Bridge() { destroy(); }
    void start(const std::string& dllPath, const std::string& hwnd) {
        if (core) throw std::runtime_error("already-created");
        // Absolute, caller-owned path; prevent current-directory DLL search.
        std::wstring wide(dllPath.begin(), dllPath.end());
        dll = LoadLibraryExW(wide.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (!dll) throw std::runtime_error("dll-load");
#define LOAD(n) p_##n = reinterpret_cast<decltype(p_##n)>(GetProcAddress(dll, #n)); if (!p_##n) throw std::runtime_error(#n);
        MPV_FUNCS(LOAD)
#undef LOAD
        parent = (HWND)(uintptr_t)std::stoull(hwnd);
        if (!IsWindow(parent)) throw std::runtime_error("invalid-parent");
        SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(parent));
        core = p_mpv_create(); if (!core) throw std::runtime_error("mpv-create");
        surface = std::thread(&Bridge::surfaceLoop, this);
        for (int i=0; phase == 0 && i<5000; ++i) Sleep(1);
        if (phase != 1) throw std::runtime_error("child-window");
        option("config", "no"); option("terminal", "no"); option("audio", "no");
        option("idle", "yes"); option("input-default-bindings", "no");
        option("input-vo-keyboard", "no"); option("osc", "no");
        option("hwdec", renderApi ? "d3d11va-copy" : "d3d11va");
        if (renderApi) option("vo", "libmpv");
        else {
            option("vo", "gpu-next"); option("gpu-api", "d3d11");
            option("gpu-context", "d3d11");
            option("wid", std::to_string((uintptr_t)child).c_str());
        }
        if (p_mpv_initialize(core) < 0) throw std::runtime_error("mpv-init");
        for (auto n : {"time-pos", "duration"}) p_mpv_observe_property(core, 0, n, MPV_FORMAT_DOUBLE);
        for (auto n : {"pause", "core-idle", "eof-reached"}) p_mpv_observe_property(core, 0, n, MPV_FORMAT_FLAG);
        initialized = true;
        for (int i=0; phase == 1 && i<10000; ++i) Sleep(1);
        if (phase != 2) throw std::runtime_error("render-context:" + std::to_string(phase.load()));
    }
    void destroy() {
        closing = true;
        if (surface.joinable()) surface.join();
        if (core) { p_mpv_terminate_destroy(core); core = nullptr; }
        if (dll) { FreeLibrary(dll); dll = nullptr; }
    }
    std::string get(const std::string& name) {
        char* v = p_mpv_get_property_string(core, name.c_str());
        if (!v) return "null";
        auto s = quote(v); p_mpv_free(v); return s;
    }
    std::string poll() {
        std::string out = "[";
        for (int i=0; core && i<128; ++i) {
            auto e = p_mpv_wait_event(core, 0); if (e->event_id == MPV_EVENT_NONE) break;
            if (out.size() > 1) out += ',';
            out += "{\"event\":" + std::to_string(e->event_id) + ",\"error\":" + std::to_string(e->error);
            if (e->event_id == MPV_EVENT_PROPERTY_CHANGE) {
                auto p = (mpv_event_property*)e->data; std::string val = "null";
                if (p->data && p->format == MPV_FORMAT_FLAG) val = *(int*)p->data ? "true" : "false";
                if (p->data && p->format == MPV_FORMAT_DOUBLE) val = std::to_string(*(double*)p->data);
                out += ",\"name\":" + quote(p->name) + ",\"value\":" + val;
            }
            out += '}';
        }
        return out + ']';
    }
    std::string execute(const std::string& line) {
        auto args = split(line); const auto& op = args.at(0); int rc = 0;
        if (op == "get") return "{\"value\":" + get(args.at(1)) + '}';
        if (op == "capture") {
            RECT r{}; GetWindowRect(parent,&r);int w=r.right-r.left,h=r.bottom-r.top;
            HDC dc=GetDC(parent), memory=CreateCompatibleDC(dc);void* pixels=nullptr;
            BITMAPINFO bi{};bi.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);
            bi.bmiHeader.biWidth=w;bi.bmiHeader.biHeight=-h;bi.bmiHeader.biPlanes=1;bi.bmiHeader.biBitCount=32;
            HBITMAP bitmap=CreateDIBSection(dc,&bi,DIB_RGB_COLORS,&pixels,nullptr,0);
            auto old=SelectObject(memory,bitmap);BOOL ok=PrintWindow(parent,memory,2);
            auto bytes=static_cast<unsigned char*>(pixels);
            for(size_t i=3;i<(size_t)w*h*4;i+=4)bytes[i]=255;
            std::ofstream file(args.at(1),std::ios::binary);file.write((char*)pixels,(size_t)w*h*4);file.close();
            SelectObject(memory,old);DeleteObject(bitmap);DeleteDC(memory);ReleaseDC(parent,dc);
            return "{\"width\":"+std::to_string(w)+",\"height\":"+std::to_string(h)+",\"ok\":"+(ok?"true":"false")+'}';
        }
        if (op == "surface") {
            RECT r{}; GetClientRect(child, &r);
            return "{\"width\":" + std::to_string(r.right) + ",\"height\":" + std::to_string(r.bottom) +
                ",\"frames\":" + std::to_string(frames.load()) + ",\"child\":" + (GetParent(child)==parent ? "true" : "false") +
                ",\"dpi\":" + std::to_string(GetDpiForWindow(parent)) + '}';
        }
        if (op == "pause") rc = p_mpv_set_property_string(core, "pause", args.at(1).c_str());
        else {
            std::vector<const char*> cmd;
            if (op == "load") cmd = {"loadfile", args.at(1).c_str(), "replace", nullptr};
            else if (op == "seek") cmd = {"seek", args.at(1).c_str(), "absolute+exact", nullptr};
            else if (op == "stop") cmd = {"stop", nullptr};
            else throw std::runtime_error("unknown-operation");
            rc = p_mpv_command(core, cmd.data());
        }
        return "{\"rc\":" + std::to_string(rc) + '}';
    }
};

#ifdef ADDON
static Bridge* active = nullptr;
struct Work {
    napi_async_work work; napi_deferred deferred;
    std::string op, dll, hwnd, error;
};
static void executeWork(napi_env, void* data) {
    auto* w = static_cast<Work*>(data);
    try {
        if (w->op == "create") {
            active = new Bridge(true);
            try { active->start(w->dll, w->hwnd); }
            catch (...) { delete active; active=nullptr; throw; }
        } else { delete active; active=nullptr; }
    } catch (const std::exception& e) { w->error=e.what(); }
}
static void completeWork(napi_env env, napi_status status, void* data) {
    auto* w=static_cast<Work*>(data); napi_value result;
    if (status != napi_ok && w->error.empty()) w->error="native-async-work";
    napi_create_string_utf8(env,w->error.empty()?"{}":w->error.c_str(),NAPI_AUTO_LENGTH,&result);
    if(w->error.empty()) napi_resolve_deferred(env,w->deferred,result);
    else napi_reject_deferred(env,w->deferred,result);
    napi_delete_async_work(env,w->work);delete w;
}
static std::string jsString(napi_env e, napi_value v) {
    size_t size; napi_get_value_string_utf8(e, v, nullptr, 0, &size);
    std::vector<char> text(size+1); napi_get_value_string_utf8(e, v, text.data(), text.size(), &size);
    return std::string(text.data(), size);
}
static napi_value invoke(napi_env env, napi_callback_info info) {
    size_t argc=3; napi_value argv[3], result; napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
    try {
        if (!argc) throw std::runtime_error("operation-required");
        auto op = jsString(env, argv[0]); std::string out = "{}";
        if (op == "create" || op == "destroy") {
            if (op == "create" && (active || argc != 3)) throw std::runtime_error("create-arguments");
            auto* w=new Work{};w->op=op;
            if(op=="create"){w->dll=jsString(env,argv[1]);w->hwnd=jsString(env,argv[2]);}
            napi_value name;napi_create_string_utf8(env,"surface-lifecycle",NAPI_AUTO_LENGTH,&name);
            napi_create_promise(env,&w->deferred,&result);
            napi_create_async_work(env,nullptr,name,executeWork,completeWork,w,&w->work);
            napi_queue_async_work(env,w->work);return result;
        }
        else if (!active) throw std::runtime_error("not-created");
        else if (op == "poll") out = active->poll();
        else out = active->execute(op);
        napi_create_string_utf8(env, out.c_str(), out.size(), &result); return result;
    } catch (const std::exception& e) { napi_throw_error(env, nullptr, e.what()); return nullptr; }
}
static void cleanup(void*) { delete active; active = nullptr; }
extern "C" __declspec(dllexport) napi_value napi_register_module_v1(napi_env env, napi_value exports) {
    napi_value fn; napi_create_function(env, "invoke", NAPI_AUTO_LENGTH, invoke, nullptr, &fn);
    napi_set_named_property(env, exports, "invoke", fn); napi_add_env_cleanup_hook(env, cleanup, nullptr); return exports;
}
#else
int main(int argc, char** argv) {
    SetErrorMode(SEM_NOGPFAULTERRORBOX | SEM_FAILCRITICALERRORS);
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    if (argc != 3) return 2;
    try {
        Bridge b(false); b.start(argv[1], argv[2]);
        std::cout << "{\"ready\":true}" << std::endl;
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line.size() > 16384) return 3;
            auto pos = line.find('\t'); if (pos == std::string::npos) return 4;
            auto id = line.substr(0,pos), op = line.substr(pos+1);
            // Deliberate native access violation, isolated to this owned test process.
            if (op == "crash") { RaiseException(EXCEPTION_ACCESS_VIOLATION, EXCEPTION_NONCONTINUABLE, 0, nullptr); return 5; }
            if (op == "destroy") break;
            auto result = op == "poll" ? b.poll() : b.execute(op);
            std::cout << "{\"id\":" << id << ",\"result\":" << result << "}" << std::endl;
        }
        return 0;
    } catch (const std::exception& e) { std::cout << "{\"failure\":" << quote(e.what()) << "}" << std::endl; return 1; }
}
#endif
