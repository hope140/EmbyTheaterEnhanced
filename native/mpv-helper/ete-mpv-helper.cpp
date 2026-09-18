// Emby Theater Enhanced production native mpv helper; GPL-2.0-only.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cwchar>
#include <cstring>
#include <deque>
#include <iomanip>
#include <fstream>
#include <iostream>
#include <limits>
#include <map>
#include <mutex>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>
#include "mpv/client.h"

namespace {

constexpr uint32_t PROTOCOL_VERSION = 1;
constexpr uint32_t MAX_FRAME_BYTES = 64 * 1024;
constexpr size_t MAX_RECEIVE_BUFFER = 128 * 1024;
constexpr size_t MAX_PENDING_FRAMES = 128;
constexpr size_t MAX_PENDING_BYTES = 256 * 1024;
constexpr size_t MAX_QUARANTINED_EVENTS = 256;
constexpr size_t MAX_QUARANTINED_IDENTITIES = 64;
constexpr size_t MAX_TRACKED_MEDIA = 256;
constexpr size_t MAX_INBOUND_FRAMES = 128;
constexpr size_t MAX_INBOUND_BYTES = 256 * 1024;
constexpr size_t MAX_QUARANTINED_BYTES = 256 * 1024;
constexpr size_t MAX_PROPERTY_JSON_BYTES = 48 * 1024;
constexpr const char* HELPER_VERSION = "1.0.0";
constexpr DWORD ETE_DWMWA_WINDOW_CORNER_PREFERENCE = 33;
constexpr DWORD ETE_DWMWCP_DEFAULT = 0;
constexpr DWORD ETE_DWMWCP_DONOTROUND = 1;

std::string wideToUtf8(const std::wstring& value) {
    if (value.empty()) return {};
    int bytes = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (bytes <= 0) throw std::runtime_error("wide-to-utf8-failed");
    std::string result(static_cast<size_t>(bytes), '\0');
    if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), result.data(), bytes, nullptr, nullptr) != bytes)
        throw std::runtime_error("wide-to-utf8-failed");
    return result;
}

bool parseWindowHandle(const wchar_t* text, HWND& window) {
    if (!text || !*text) return false;
    uintptr_t value = 0;
    for (const wchar_t* cursor = text; *cursor; ++cursor) {
        if (*cursor < L'0' || *cursor > L'9') return false;
        uintptr_t digit = static_cast<uintptr_t>(*cursor - L'0');
        if (value > (std::numeric_limits<uintptr_t>::max() - digit) / 10) return false;
        value = value * 10 + digit;
    }
    if (!value) return false;
    window = reinterpret_cast<HWND>(value);
    return true;
}

void applySurfaceCornerPreference(HWND surface, const wchar_t* cornerMode) {
    DWORD preference = 0;
    if (cornerMode && std::wcscmp(cornerMode, L"square") == 0) preference = ETE_DWMWCP_DONOTROUND;
    else if (cornerMode && std::wcscmp(cornerMode, L"default") == 0) preference = ETE_DWMWCP_DEFAULT;
    else return;
    HMODULE dwmapi = LoadLibraryW(L"dwmapi.dll");
    if (!dwmapi) return;
    using DwmSetWindowAttributeFn = HRESULT (WINAPI *)(HWND, DWORD, LPCVOID, DWORD);
    auto setWindowAttribute = reinterpret_cast<DwmSetWindowAttributeFn>(GetProcAddress(dwmapi, "DwmSetWindowAttribute"));
    if (setWindowAttribute) setWindowAttribute(surface, ETE_DWMWA_WINDOW_CORNER_PREFERENCE, &preference, sizeof(preference));
    FreeLibrary(dwmapi);
}

int placeWindowBehind(const wchar_t* surfaceText, const wchar_t* mainText, const wchar_t* cornerMode) {
    HWND surface = nullptr;
    HWND mainWindow = nullptr;
    if (!parseWindowHandle(surfaceText, surface) || !parseWindowHandle(mainText, mainWindow) || surface == mainWindow) return 30;
    if (!IsWindow(surface) || !IsWindow(mainWindow)) return 31;
    DWORD surfaceProcess = 0;
    DWORD mainProcess = 0;
    GetWindowThreadProcessId(surface, &surfaceProcess);
    GetWindowThreadProcessId(mainWindow, &mainProcess);
    if (!surfaceProcess || surfaceProcess != mainProcess) return 32;
    if (GetWindow(surface, GW_OWNER) || GetWindow(mainWindow, GW_OWNER)) return 33;
    LONG_PTR surfaceStyle = GetWindowLongPtrW(surface, GWL_EXSTYLE);
    if ((surfaceStyle & WS_EX_NOACTIVATE) == 0) return 34;
    applySurfaceCornerPreference(surface, cornerMode);
    if (!SetWindowPos(surface, mainWindow, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_SHOWWINDOW)) return 35;
    return 0;
}

uint64_t monotonicMicros() {
    static LARGE_INTEGER frequency = [] { LARGE_INTEGER value{}; QueryPerformanceFrequency(&value); return value; }();
    LARGE_INTEGER now{}; QueryPerformanceCounter(&now);
    return static_cast<uint64_t>((now.QuadPart * 1000000LL) / frequency.QuadPart);
}

std::string quote(const std::string& input) {
    std::ostringstream out; out << '"';
    for (unsigned char c : input) {
        switch (c) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (c < 0x20) out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << int(c) << std::dec;
                else out << char(c);
        }
    }
    out << '"'; return out.str();
}

bool validUtf8(const std::string& value) {
    const auto* data = reinterpret_cast<const unsigned char*>(value.data());
    size_t index = 0;
    while (index < value.size()) {
        unsigned char c = data[index++];
        if (c <= 0x7f) continue;
        int continuation = 0; uint32_t codepoint = 0;
        if ((c & 0xe0) == 0xc0) { continuation = 1; codepoint = c & 0x1f; if (codepoint < 2) return false; }
        else if ((c & 0xf0) == 0xe0) { continuation = 2; codepoint = c & 0x0f; }
        else if ((c & 0xf8) == 0xf0) { continuation = 3; codepoint = c & 0x07; }
        else return false;
        if (index + continuation > value.size()) return false;
        for (int i = 0; i < continuation; ++i) {
            unsigned char next = data[index++];
            if ((next & 0xc0) != 0x80) return false;
            codepoint = (codepoint << 6) | (next & 0x3f);
        }
        if ((continuation == 2 && codepoint < 0x800) ||
            (continuation == 3 && codepoint < 0x10000) ||
            (codepoint >= 0xd800 && codepoint <= 0xdfff) || codepoint > 0x10ffff) return false;
    }
    return true;
}

struct Json {
    enum class Type { Null, Bool, Number, String, Array, Object } type = Type::Null;
    bool boolean = false;
    double number = 0;
    std::string string;
    std::vector<Json> array;
    std::map<std::string, Json> object;

    const Json& at(const std::string& key) const {
        auto found = object.find(key); if (found == object.end()) throw std::runtime_error("missing-field:" + key);
        return found->second;
    }
    bool has(const std::string& key) const { return object.find(key) != object.end(); }
    std::string text(const std::string& key) const {
        const auto& value = at(key); if (value.type != Type::String) throw std::runtime_error("invalid-string:" + key);
        return value.string;
    }
    int64_t integer(const std::string& key) const {
        const auto& value = at(key); if (value.type != Type::Number || value.number < 0 || value.number > 9007199254740991.0 || value.number != static_cast<int64_t>(value.number))
            throw std::runtime_error("invalid-integer:" + key);
        return static_cast<int64_t>(value.number);
    }
};

class JsonParser {
    const std::string& source; size_t position = 0;
    void whitespace() { while (position < source.size() && (source[position] == ' ' || source[position] == '\t' || source[position] == '\r' || source[position] == '\n')) ++position; }
    char take() { if (position >= source.size()) throw std::runtime_error("unexpected-eof"); return source[position++]; }
    bool consume(char expected) { whitespace(); if (position < source.size() && source[position] == expected) { ++position; return true; } return false; }
    std::string parseString() {
        if (take() != '"') throw std::runtime_error("expected-string");
        std::string result;
        while (position < source.size()) {
            unsigned char c = static_cast<unsigned char>(take());
            if (c == '"') return result;
            if (c < 0x20) throw std::runtime_error("control-in-string");
            if (c != '\\') { result += char(c); continue; }
            char escape = take();
            switch (escape) {
                case '"': result += '"'; break; case '\\': result += '\\'; break; case '/': result += '/'; break;
                case 'b': result += '\b'; break; case 'f': result += '\f'; break; case 'n': result += '\n'; break;
                case 'r': result += '\r'; break; case 't': result += '\t'; break;
                case 'u': {
                    uint32_t code = 0;
                    for (int i = 0; i < 4; ++i) {
                        char h = take(); code <<= 4;
                        if (h >= '0' && h <= '9') code |= h - '0';
                        else if (h >= 'a' && h <= 'f') code |= h - 'a' + 10;
                        else if (h >= 'A' && h <= 'F') code |= h - 'A' + 10;
                        else throw std::runtime_error("invalid-unicode-escape");
                    }
                    if (code >= 0xd800 && code <= 0xdfff) throw std::runtime_error("surrogate-not-supported");
                    if (code <= 0x7f) result += char(code);
                    else if (code <= 0x7ff) { result += char(0xc0 | (code >> 6)); result += char(0x80 | (code & 0x3f)); }
                    else { result += char(0xe0 | (code >> 12)); result += char(0x80 | ((code >> 6) & 0x3f)); result += char(0x80 | (code & 0x3f)); }
                    break;
                }
                default: throw std::runtime_error("invalid-escape");
            }
        }
        throw std::runtime_error("unterminated-string");
    }
    Json value(unsigned depth = 0) {
        if (depth > 32) throw std::runtime_error("json-depth-limit");
        whitespace(); if (position >= source.size()) throw std::runtime_error("unexpected-eof");
        if (source[position] == '{') return objectValue(depth);
        if (source[position] == '[') return arrayValue(depth);
        if (source[position] == '"') { Json v; v.type = Json::Type::String; v.string = parseString(); return v; }
        if (source.compare(position, 4, "true") == 0) { position += 4; Json v; v.type = Json::Type::Bool; v.boolean = true; return v; }
        if (source.compare(position, 5, "false") == 0) { position += 5; Json v; v.type = Json::Type::Bool; return v; }
        if (source.compare(position, 4, "null") == 0) { position += 4; return Json{}; }
        return numberValue();
    }
    Json numberValue() {
        size_t start = position;
        if (source[position] == '-') ++position;
        if (position >= source.size()) throw std::runtime_error("invalid-number");
        if (source[position] == '0') ++position;
        else { if (source[position] < '1' || source[position] > '9') throw std::runtime_error("invalid-number"); while (position < source.size() && std::isdigit(static_cast<unsigned char>(source[position]))) ++position; }
        if (position < source.size() && source[position] == '.') { ++position; if (position >= source.size() || !std::isdigit(static_cast<unsigned char>(source[position]))) throw std::runtime_error("invalid-number"); while (position < source.size() && std::isdigit(static_cast<unsigned char>(source[position]))) ++position; }
        if (position < source.size() && (source[position] == 'e' || source[position] == 'E')) { ++position; if (position < source.size() && (source[position] == '+' || source[position] == '-')) ++position; if (position >= source.size() || !std::isdigit(static_cast<unsigned char>(source[position]))) throw std::runtime_error("invalid-number"); while (position < source.size() && std::isdigit(static_cast<unsigned char>(source[position]))) ++position; }
        std::string token = source.substr(start, position - start); char* end = nullptr; double parsed = std::strtod(token.c_str(), &end);
        if (!end || *end || !std::isfinite(parsed)) throw std::runtime_error("invalid-number");
        Json v; v.type = Json::Type::Number; v.number = parsed; return v;
    }
    Json arrayValue(unsigned depth) {
        Json result; result.type = Json::Type::Array; take(); whitespace();
        if (consume(']')) return result;
        while (true) { result.array.push_back(value(depth + 1)); whitespace(); if (consume(']')) return result; if (!consume(',')) throw std::runtime_error("expected-comma"); }
    }
    Json objectValue(unsigned depth) {
        Json result; result.type = Json::Type::Object; take(); whitespace();
        if (consume('}')) return result;
        while (true) {
            whitespace(); if (position >= source.size() || source[position] != '"') throw std::runtime_error("expected-key");
            auto key = parseString(); if (result.object.count(key)) throw std::runtime_error("duplicate-key");
            if (!consume(':')) throw std::runtime_error("expected-colon");
            result.object.emplace(std::move(key), value(depth + 1));
            whitespace(); if (consume('}')) return result; if (!consume(',')) throw std::runtime_error("expected-comma");
        }
    }
public:
    explicit JsonParser(const std::string& input) : source(input) {}
    Json parse() { Json result = value(); whitespace(); if (position != source.size()) throw std::runtime_error("trailing-json"); return result; }
};

class WriterQueue {
    HANDLE output;
    std::mutex mutex; std::condition_variable available;
    std::deque<std::string> critical;
    std::map<std::string, std::string> coalesced;
    size_t pendingBytes = 0;
    std::thread writer;
    std::atomic<bool> stopping{false};
    std::atomic<bool> failed{false};
    std::atomic<uint64_t> writtenFrames{0}, writtenBytes{0}, coalescedReplaced{0}, coalescedDropped{0}, peakFrames{0}, peakBytes{0};

    static bool writeAll(HANDLE handle, const void* source, size_t bytes) {
        const auto* data = static_cast<const uint8_t*>(source);
        while (bytes) { DWORD wrote = 0; if (!WriteFile(handle, data, static_cast<DWORD>(std::min<size_t>(bytes, 65536)), &wrote, nullptr) || !wrote) return false; data += wrote; bytes -= wrote; }
        return true;
    }
    void run() {
        while (true) {
            std::string payload;
            {
                std::unique_lock<std::mutex> lock(mutex);
                available.wait(lock, [&] { return stopping || !critical.empty() || !coalesced.empty(); });
                if (critical.empty() && coalesced.empty() && stopping) break;
                if (!critical.empty()) { payload = std::move(critical.front()); critical.pop_front(); }
                else { auto item = coalesced.begin(); payload = std::move(item->second); coalesced.erase(item); }
                pendingBytes -= payload.size() + 4;
            }
            uint32_t length = static_cast<uint32_t>(payload.size());
            uint8_t header[4] = {uint8_t(length), uint8_t(length >> 8), uint8_t(length >> 16), uint8_t(length >> 24)};
            if (!writeAll(output, header, sizeof header) || !writeAll(output, payload.data(), payload.size())) { failed = true; stopping = true; available.notify_all(); break; }
            ++writtenFrames; writtenBytes += payload.size() + 4;
        }
    }
public:
    explicit WriterQueue(HANDLE handle) : output(handle), writer(&WriterQueue::run, this) {}
    ~WriterQueue() { close(); }
    bool enqueue(std::string payload, bool isCritical, const std::string& key = {}) {
        if (payload.empty() || payload.size() > MAX_FRAME_BYTES || stopping || failed) return false;
        std::lock_guard<std::mutex> lock(mutex);
        size_t existingBytes = 0;
        if (!isCritical && !key.empty()) { auto found = coalesced.find(key); if (found != coalesced.end()) existingBytes = found->second.size() + 4; }
        size_t frames = critical.size() + coalesced.size() - (existingBytes ? 1 : 0);
        size_t newBytes = pendingBytes - existingBytes + payload.size() + 4;
        if (frames + 1 > MAX_PENDING_FRAMES || newBytes > MAX_PENDING_BYTES) {
            if (!isCritical) { ++coalescedDropped; return true; }
            failed = true; stopping = true; available.notify_all(); return false;
        }
        if (isCritical) critical.push_back(std::move(payload));
        else {
            auto found = coalesced.find(key);
            if (found != coalesced.end()) { ++coalescedReplaced; found->second = std::move(payload); }
            else coalesced.emplace(key, std::move(payload));
        }
        pendingBytes = newBytes;
        peakFrames = std::max<uint64_t>(peakFrames, critical.size() + coalesced.size());
        peakBytes = std::max<uint64_t>(peakBytes, pendingBytes);
        available.notify_one(); return true;
    }
    void close() {
        if (!writer.joinable()) return;
        stopping = true; available.notify_all(); writer.join();
    }
    bool hasFailed() const { return failed; }
    std::string metricsJson() const {
        return "{\"maxPendingFrames\":" + std::to_string(MAX_PENDING_FRAMES) +
            ",\"maxPendingBytes\":" + std::to_string(MAX_PENDING_BYTES) +
            ",\"maxFrameBytes\":" + std::to_string(MAX_FRAME_BYTES) +
            ",\"maxReceiveBuffer\":" + std::to_string(MAX_RECEIVE_BUFFER) +
            ",\"writtenFrames\":" + std::to_string(writtenFrames.load()) +
            ",\"writtenBytes\":" + std::to_string(writtenBytes.load()) +
            ",\"coalescedReplaced\":" + std::to_string(coalescedReplaced.load()) +
            ",\"coalescedDropped\":" + std::to_string(coalescedDropped.load()) +
            ",\"peakFrames\":" + std::to_string(peakFrames.load()) +
            ",\"peakBytes\":" + std::to_string(peakBytes.load()) + '}';
    }
};

struct InboundMessage { Json json; size_t wireBytes; };

class InputReader {
    HANDLE input;
    std::mutex mutex; std::deque<InboundMessage> messages; size_t queuedBytes = 0;
    std::thread reader;
    std::atomic<bool> eof{false}, failed{false}, stopping{false};
    std::string failure;
    std::atomic<uint64_t> decodedFrames{0};

    void setFailure(const std::string& reason) { std::lock_guard<std::mutex> lock(mutex); failure = reason; failed = true; }
    void run() {
        std::vector<uint8_t> buffer; buffer.reserve(8192); uint8_t chunk[4096];
        while (!failed && !stopping) {
            DWORD availableBytes = 0;
            if (!PeekNamedPipe(input, nullptr, 0, nullptr, &availableBytes, nullptr)) {
                DWORD error = GetLastError();
                if (error == ERROR_BROKEN_PIPE) eof = true;
                else if (!stopping) setFailure("peek-error:" + std::to_string(error));
                break;
            }
            if (!availableBytes) { Sleep(1); continue; }
            DWORD read = 0;
            if (!ReadFile(input, chunk, static_cast<DWORD>(std::min<size_t>(sizeof chunk, availableBytes)), &read, nullptr)) { DWORD error = GetLastError(); if (error == ERROR_BROKEN_PIPE) eof = true; else if (!stopping) setFailure("read-error:" + std::to_string(error)); break; }
            if (!read) { eof = true; break; }
            if (buffer.size() + read > MAX_RECEIVE_BUFFER) { setFailure("receive-buffer-limit"); break; }
            buffer.insert(buffer.end(), chunk, chunk + read);
            while (buffer.size() >= 4) {
                uint32_t length = uint32_t(buffer[0]) | (uint32_t(buffer[1]) << 8) | (uint32_t(buffer[2]) << 16) | (uint32_t(buffer[3]) << 24);
                if (!length) { setFailure("zero-length-frame"); break; }
                if (length > MAX_FRAME_BYTES) { setFailure("oversized-frame"); break; }
                if (buffer.size() < size_t(length) + 4) break;
                std::string payload(reinterpret_cast<char*>(buffer.data() + 4), length);
                buffer.erase(buffer.begin(), buffer.begin() + 4 + length);
                try {
                    if (!validUtf8(payload)) throw std::runtime_error("invalid-utf8");
                    Json parsed = JsonParser(payload).parse();
                    if (parsed.type != Json::Type::Object) throw std::runtime_error("message-not-object");
                    bool queueExceeded = false;
                    {
                        std::lock_guard<std::mutex> lock(mutex);
                        size_t wireBytes = size_t(length) + 4;
                        if (messages.size() + 1 > MAX_INBOUND_FRAMES || queuedBytes + wireBytes > MAX_INBOUND_BYTES) queueExceeded = true;
                        else { messages.push_back({std::move(parsed), wireBytes}); queuedBytes += wireBytes; ++decodedFrames; }
                    }
                    if (queueExceeded) { setFailure("inbound-queue-limit"); break; }
                } catch (const std::exception& error) { setFailure(error.what()); break; }
            }
        }
    }
public:
    explicit InputReader(HANDLE handle) : input(handle), reader(&InputReader::run, this) {}
    ~InputReader() {
        if (reader.joinable()) {
            stopping = true;
            reader.join();
        }
    }
    bool pop(InboundMessage& message) { std::lock_guard<std::mutex> lock(mutex); if (messages.empty()) return false; message = std::move(messages.front()); queuedBytes -= message.wireBytes; messages.pop_front(); return true; }
    bool isEof() const { return eof; }
    bool hasFailed() const { return failed; }
    std::string failureReason() { std::lock_guard<std::mutex> lock(mutex); return failure; }
    uint64_t frameCount() const { return decodedFrames; }
};

#define MPV_FUNCTIONS(X) \
    X(mpv_create) X(mpv_initialize) X(mpv_set_option_string) X(mpv_observe_property) X(mpv_unobserve_property) \
    X(mpv_wait_event) X(mpv_terminate_destroy) X(mpv_command) X(mpv_command_async) X(mpv_get_property) X(mpv_set_property_string) \
    X(mpv_get_property_string) X(mpv_free) X(mpv_free_node_contents) X(mpv_client_api_version) X(mpv_error_string) X(mpv_event_name)

struct LoadCommand {
    uint64_t generationId;
    uint64_t requestId;
    uint64_t replyUserdata;
    std::vector<std::string> args;
    bool commandReplied = false;
    int commandError = 0;
    int64_t mediaIdentity = -1;
    uint64_t submittedAtMicros = 0;
};
struct AsyncCommand { uint64_t generationId; uint64_t requestId; std::string method; };
struct NativeRecord { int eventId; std::string eventName; int64_t mediaIdentity; std::string name; std::string valueJson; uint64_t replyUserdata; uint64_t timestamp; };

class Helper {
    std::string helperId; HMODULE library = nullptr; mpv_handle* mpv = nullptr; WriterQueue& writer;
#define FIELD(name) decltype(&name) p_##name = nullptr;
    MPV_FUNCTIONS(FIELD)
#undef FIELD
    std::deque<LoadCommand> loadQueue; bool loadInFlight = false; uint64_t nextReplyUserdata = 1;
    std::map<uint64_t, LoadCommand> loadReplies; std::map<uint64_t, AsyncCommand> commandReplies;
    std::map<int64_t, uint64_t> mediaToGeneration; std::map<uint64_t, int64_t> generationToMedia;
    std::map<int64_t, std::vector<NativeRecord>> quarantined;
    size_t quarantinedBytes = 0;
    std::map<uint64_t, std::pair<uint64_t, std::string>> observerTokens;
    std::vector<uint64_t> activeObserverTokens;
    std::set<std::string> observedProperties;
    std::set<int64_t> openMedia; uint64_t retiredThroughGeneration = 0; std::atomic<bool> requestedExit{false};
    HWND parent = nullptr;
    std::atomic<HWND> surfaceWindow{nullptr};
    std::thread surfaceThread;
    std::atomic<bool> closing{false};
    std::atomic<int> surfaceState{0};
#ifdef ETE_HELPER_TESTING
    std::string rejectNextOperation;
#endif

    static LRESULT CALLBACK surfaceWindowProc(HWND window, UINT message, WPARAM wparam, LPARAM lparam) {
        if (message == WM_NCHITTEST) return HTTRANSPARENT;
        return DefWindowProcW(window, message, wparam, lparam);
    }

    void surfaceLoop() {
        SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(parent));
        WNDCLASSW windowClass{};
        windowClass.style = CS_OWNDC;
        windowClass.lpfnWndProc = surfaceWindowProc;
        windowClass.hInstance = GetModuleHandleW(nullptr);
        windowClass.lpszClassName = L"ETEProductionMpvSurface";
        RegisterClassW(&windowClass);
        HWND createdWindow = CreateWindowExW(WS_EX_NOACTIVATE, windowClass.lpszClassName, L"",
            WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS | WS_CLIPCHILDREN,
            0, 0, 1, 1, parent, nullptr, windowClass.hInstance, nullptr);
        if (!createdWindow) { surfaceState = -1; return; }
        surfaceWindow.store(createdWindow, std::memory_order_release);
        surfaceState.store(1, std::memory_order_release);
        int oldWidth = 0, oldHeight = 0;
        while (!closing && IsWindow(parent)) {
            MSG message;
            while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            RECT bounds{};
            if (GetClientRect(parent, &bounds)) {
                int width = std::max<LONG>(1, bounds.right - bounds.left);
                int height = std::max<LONG>(1, bounds.bottom - bounds.top);
                if (width != oldWidth || height != oldHeight) {
                    SetWindowPos(createdWindow, HWND_TOP, 0, 0, width, height,
                        SWP_NOACTIVATE | SWP_NOOWNERZORDER);
                    oldWidth = width;
                    oldHeight = height;
                }
            }
            Sleep(8);
        }
        if (!IsWindow(parent)) requestedExit = true;
        if (IsWindow(createdWindow)) DestroyWindow(createdWindow);
        surfaceWindow.store(nullptr, std::memory_order_release);
    }

    static std::string jsonForNode(const mpv_node& node, unsigned depth = 0) {
        if (depth > 16) throw std::runtime_error("property-node-depth-limit");
        switch (node.format) {
            case MPV_FORMAT_NONE: return "null";
            case MPV_FORMAT_STRING:
            case MPV_FORMAT_OSD_STRING:
                if (node.u.string && std::strlen(node.u.string) > 8192) throw std::runtime_error("property-string-limit");
                return node.u.string ? quote(node.u.string) : "null";
            case MPV_FORMAT_FLAG: return node.u.flag ? "true" : "false";
            case MPV_FORMAT_INT64:
                if (node.u.int64 > 9007199254740991LL || node.u.int64 < -9007199254740991LL) return quote(std::to_string(node.u.int64));
                return std::to_string(node.u.int64);
            case MPV_FORMAT_DOUBLE: {
                if (!std::isfinite(node.u.double_)) return "null";
                std::ostringstream output; output << std::setprecision(17) << node.u.double_; return output.str();
            }
            case MPV_FORMAT_NODE_ARRAY: {
                std::string result = "[";
                if (node.u.list && node.u.list->num > 256) throw std::runtime_error("property-array-limit");
                if (node.u.list) for (int index = 0; index < node.u.list->num; ++index) {
                    if (index) result += ',';
                    result += jsonForNode(node.u.list->values[index], depth + 1);
                }
                return result + ']';
            }
            case MPV_FORMAT_NODE_MAP: {
                std::string result = "{";
                if (node.u.list && node.u.list->num > 256) throw std::runtime_error("property-map-limit");
                if (node.u.list) for (int index = 0; index < node.u.list->num; ++index) {
                    if (index) result += ',';
                    const char* key = node.u.list->keys[index] ? node.u.list->keys[index] : "";
                    if (std::strlen(key) > 256) throw std::runtime_error("property-key-limit");
                    result += quote(key) + ':' + jsonForNode(node.u.list->values[index], depth + 1);
                }
                return result + '}';
            }
            default: return "null";
        }
    }

    static std::string scalarText(const Json& value) {
        if (value.type == Json::Type::String) return value.string;
        if (value.type == Json::Type::Bool) return value.boolean ? "yes" : "no";
        if (value.type == Json::Type::Number) {
            std::ostringstream output; output << std::setprecision(17) << value.number; return output.str();
        }
        if (value.type == Json::Type::Null) return "";
        throw std::runtime_error("property-value-must-be-scalar");
    }

    static std::vector<std::string> stringArray(const Json& value, const std::string& field) {
        if (value.type != Json::Type::Array || value.array.empty() || value.array.size() > 16)
            throw std::runtime_error("invalid-array:" + field);
        std::vector<std::string> result;
        for (const auto& item : value.array) {
            if (item.type != Json::Type::String || item.string.size() > 8192)
                throw std::runtime_error("invalid-array-item:" + field);
            result.push_back(item.string);
        }
        return result;
    }

    int commandAsync(uint64_t replyUserdata, const std::vector<std::string>& args) {
        std::vector<const char*> pointers;
        pointers.reserve(args.size() + 1);
        for (const auto& value : args) pointers.push_back(value.c_str());
        pointers.push_back(nullptr);
        return p_mpv_command_async(mpv, replyUserdata, pointers.data());
    }

    int commandSync(const std::vector<std::string>& args) {
        std::vector<const char*> pointers;
        pointers.reserve(args.size() + 1);
        for (const auto& value : args) pointers.push_back(value.c_str());
        pointers.push_back(nullptr);
        return p_mpv_command(mpv, pointers.data());
    }

#ifdef ETE_HELPER_TESTING
    bool captureScreenBmp(const std::string& outputPath) {
        RECT rect{};
        if (!GetWindowRect(parent, &rect)) return false;
        int width = rect.right - rect.left, height = rect.bottom - rect.top;
        if (width <= 0 || height <= 0) return false;
        HDC screen = GetDC(nullptr);
        HDC memory = CreateCompatibleDC(screen);
        BITMAPINFO info{};
        info.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        info.bmiHeader.biWidth = width;
        info.bmiHeader.biHeight = height;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        void* pixels = nullptr;
        HBITMAP bitmap = CreateDIBSection(screen, &info, DIB_RGB_COLORS, &pixels, nullptr, 0);
        if (!bitmap || !pixels) { if (bitmap) DeleteObject(bitmap); DeleteDC(memory); ReleaseDC(nullptr, screen); return false; }
        HGDIOBJ previous = SelectObject(memory, bitmap);
        bool copied = BitBlt(memory, 0, 0, width, height, screen, rect.left, rect.top, SRCCOPY | CAPTUREBLT) != FALSE;
        BITMAPFILEHEADER fileHeader{};
        fileHeader.bfType = 0x4d42;
        fileHeader.bfOffBits = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);
        fileHeader.bfSize = fileHeader.bfOffBits + static_cast<DWORD>(width * height * 4);
        std::ofstream output(outputPath, std::ios::binary | std::ios::trunc);
        if (copied && output) {
            output.write(reinterpret_cast<const char*>(&fileHeader), sizeof fileHeader);
            output.write(reinterpret_cast<const char*>(&info.bmiHeader), sizeof info.bmiHeader);
            output.write(static_cast<const char*>(pixels), static_cast<std::streamsize>(width) * height * 4);
            copied = output.good();
        } else copied = false;
        SelectObject(memory, previous);
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(nullptr, screen);
        return copied;
    }
#endif

    std::string base(const std::string& type) const {
        return "{\"protocolVersion\":1,\"type\":" + quote(type) + ",\"helperInstanceId\":" + quote(helperId);
    }
    void emitResponse(uint64_t generation, uint64_t request, const std::string& resultJson) {
        writer.enqueue(base("response") + ",\"generationId\":" + std::to_string(generation) + ",\"requestId\":" + std::to_string(request) + ",\"result\":" + resultJson + '}', true);
    }
    void emitError(uint64_t generation, uint64_t request, const std::string& code) {
        writer.enqueue(base("error") + ",\"generationId\":" + std::to_string(generation) + ",\"requestId\":" + std::to_string(request) + ",\"code\":" + quote(code) + '}', true);
    }
    void emitOperationError(uint64_t generation, const std::string& operation, const std::string& property, int errorCode) {
        const char* description = p_mpv_error_string(errorCode);
        std::string payload = base("event") + ",\"scope\":\"generation\",\"generationId\":" + std::to_string(generation) +
            ",\"name\":\"operation-error\",\"operation\":" + quote(operation);
        if (!property.empty()) payload += ",\"property\":" + quote(property);
        payload += ",\"errorCode\":" + std::to_string(errorCode) + ",\"error\":" +
            quote(description ? description : "mpv-operation-failed") + ",\"fatal\":false}";
        writer.enqueue(std::move(payload), true);
    }
    void emitGlobal(const std::string& name, const std::string& detailJson = "null") {
        writer.enqueue(base("lifecycle") + ",\"scope\":\"helper\",\"name\":" + quote(name) + ",\"monotonicMicros\":" + std::to_string(monotonicMicros()) + ",\"detail\":" + detailJson + '}', true);
    }
    void emitUnattributed(const NativeRecord& record, const std::string& reason) {
        writer.enqueue(base("event") + ",\"scope\":\"helper\",\"name\":\"unattributed-native-event\",\"monotonicMicros\":" + std::to_string(record.timestamp) +
            ",\"rawEventId\":" + std::to_string(record.eventId) + ",\"rawEventName\":" + quote(record.eventName) +
            ",\"mediaIdentity\":" + (record.mediaIdentity >= 0 ? std::to_string(record.mediaIdentity) : "null") +
            ",\"nativeReplyUserdata\":" + std::to_string(record.replyUserdata) + ",\"reason\":" + quote(reason) + '}', true);
    }
    void emitAttributed(const NativeRecord& record, uint64_t generation) {
        std::string payload = base("event") + ",\"scope\":\"generation\",\"generationId\":" + std::to_string(generation) +
            ",\"name\":" + quote(record.name) + ",\"monotonicMicros\":" + std::to_string(record.timestamp) +
            ",\"rawEventId\":" + std::to_string(record.eventId) + ",\"rawEventName\":" + quote(record.eventName) +
            ",\"mediaIdentity\":" + std::to_string(record.mediaIdentity) + ",\"nativeReplyUserdata\":" + std::to_string(record.replyUserdata) +
            ",\"value\":" + record.valueJson + '}';
        bool coalescible = record.name == "time-pos" || record.name == "duration" || record.name == "pause" || record.name == "path";
        writer.enqueue(std::move(payload), !coalescible, coalescible ? std::to_string(generation) + ':' + record.name : std::string{});
    }
    void routeRecord(NativeRecord record) {
        if (record.mediaIdentity < 0) { emitUnattributed(record, "no-unique-open-media"); return; }
        auto mapped = mediaToGeneration.find(record.mediaIdentity);
        if (mapped == mediaToGeneration.end()) {
            if (quarantined.find(record.mediaIdentity) == quarantined.end() && quarantined.size() >= MAX_QUARANTINED_IDENTITIES) {
                emitUnattributed(record, "quarantine-identity-limit"); return;
            }
            auto& list = quarantined[record.mediaIdentity];
            if (list.size() >= MAX_QUARANTINED_EVENTS) { emitUnattributed(record, "quarantine-limit"); return; }
            size_t recordBytes = record.eventName.size() + record.name.size() + record.valueJson.size() + 64;
            if (recordBytes > MAX_PROPERTY_JSON_BYTES || quarantinedBytes + recordBytes > MAX_QUARANTINED_BYTES) {
                emitUnattributed(record, "quarantine-byte-limit"); return;
            }
            quarantinedBytes += recordBytes;
            list.push_back(std::move(record)); return;
        }
        emitAttributed(record, mapped->second);
    }
    void observeGeneration(uint64_t generation) {
        for (uint64_t token : activeObserverTokens) { p_mpv_unobserve_property(mpv, token); observerTokens.erase(token); }
        activeObserverTokens.clear();
        for (const auto& property : observedProperties) {
            uint64_t token = nextReplyUserdata++;
            if (p_mpv_observe_property(mpv, token, property.c_str(), MPV_FORMAT_NODE) < 0) throw std::runtime_error("observe-property-failed");
            observerTokens[token] = {generation, property}; activeObserverTokens.push_back(token);
        }
    }
    void mapMedia(int64_t mediaIdentity, uint64_t generation) {
        auto existing = mediaToGeneration.find(mediaIdentity);
        if (existing != mediaToGeneration.end() && existing->second != generation) throw std::runtime_error("media-identity-reused");
        if (existing == mediaToGeneration.end() && mediaToGeneration.size() >= MAX_TRACKED_MEDIA) throw std::runtime_error("tracked-media-limit");
        mediaToGeneration[mediaIdentity] = generation;
        generationToMedia[generation] = mediaIdentity;
        observeGeneration(generation);
        auto pending = quarantined.find(mediaIdentity);
        if (pending != quarantined.end()) {
            for (auto& record : pending->second) {
                size_t recordBytes = record.eventName.size() + record.name.size() + record.valueJson.size() + 64;
                quarantinedBytes = recordBytes > quarantinedBytes ? 0 : quarantinedBytes - recordBytes;
                emitAttributed(record, generation);
            }
            quarantined.erase(pending);
        }
    }
    int64_t uniqueOpenMedia() const { return openMedia.size() == 1 ? *openMedia.begin() : -1; }
    void submitNextLoad() {
        if (loadInFlight || loadQueue.empty()) return;
        while (!loadQueue.empty() && loadQueue.front().generationId <= retiredThroughGeneration) loadQueue.pop_front();
        if (loadQueue.empty()) return;
        auto command = std::move(loadQueue.front()); loadQueue.pop_front();
        int rc = commandAsync(command.replyUserdata, command.args);
        if (rc < 0) { emitError(command.generationId, command.requestId, "mpv-command-queue-failed"); submitNextLoad(); return; }
        command.submittedAtMicros = monotonicMicros();
        loadReplies.emplace(command.replyUserdata, std::move(command)); loadInFlight = true;
    }
    void completeLoad(std::map<uint64_t, LoadCommand>::iterator load) {
        auto command = std::move(load->second);
        loadReplies.erase(load); loadInFlight = false;
        if (command.commandError < 0 || command.mediaIdentity < 0) emitError(command.generationId, command.requestId, "load-command-failed-or-unattributed");
        else emitResponse(command.generationId, command.requestId, "{\"commandAccepted\":true,\"mediaIdentity\":" + std::to_string(command.mediaIdentity) + '}');
        submitNextLoad();
    }
    void handleCommandReply(mpv_event* event) {
        auto load = loadReplies.find(event->reply_userdata);
        if (load != loadReplies.end()) {
            load->second.commandReplied = true; load->second.commandError = event->error;
            if (event->error < 0 || load->second.mediaIdentity >= 0) completeLoad(load);
            return;
        }
        auto other = commandReplies.find(event->reply_userdata);
        if (other != commandReplies.end()) {
            auto command = other->second; commandReplies.erase(other);
            if (event->error < 0) emitError(command.generationId, command.requestId, command.method + "-failed");
            else emitResponse(command.generationId, command.requestId, "{\"commandAccepted\":true}");
        }
    }
    std::string eventName(int id) { const char* name = p_mpv_event_name(static_cast<mpv_event_id>(id)); return name ? name : "unknown"; }
    void handleEvent(mpv_event* event) {
        if (event->event_id == MPV_EVENT_COMMAND_REPLY) { handleCommandReply(event); return; }
        if (event->event_id == MPV_EVENT_START_FILE) {
            auto* data = static_cast<mpv_event_start_file*>(event->data); int64_t id = data ? data->playlist_entry_id : -1;
            if (id >= 0 && openMedia.find(id) == openMedia.end() && openMedia.size() >= MAX_TRACKED_MEDIA) throw std::runtime_error("open-media-limit");
            if (id >= 0) openMedia.insert(id);
            if (id >= 0 && mediaToGeneration.find(id) == mediaToGeneration.end() && loadReplies.size() == 1) {
                auto load = loadReplies.begin();
                if (load->second.mediaIdentity < 0) {
                    load->second.mediaIdentity = id; mapMedia(id, load->second.generationId);
                    if (load->second.commandReplied) completeLoad(load);
                }
            }
            routeRecord({int(event->event_id), eventName(event->event_id), id, "start-file", "null", event->reply_userdata, monotonicMicros()}); return;
        }
        if (event->event_id == MPV_EVENT_END_FILE) {
            auto* data = static_cast<mpv_event_end_file*>(event->data); int64_t id = data ? data->playlist_entry_id : -1;
            int reason = data ? int(data->reason) : -1; int error = data ? data->error : event->error;
            routeRecord({int(event->event_id), eventName(event->event_id), id, "end-file", "{\"reason\":" + std::to_string(reason) + ",\"error\":" + std::to_string(error) + '}', event->reply_userdata, monotonicMicros()});
            if (id >= 0) {
                openMedia.erase(id);
                auto pending = quarantined.find(id);
                if (pending != quarantined.end()) {
                    for (const auto& record : pending->second) {
                        size_t recordBytes = record.eventName.size() + record.name.size() + record.valueJson.size() + 64;
                        quarantinedBytes = recordBytes > quarantinedBytes ? 0 : quarantinedBytes - recordBytes;
                    }
                    quarantined.erase(pending);
                }
                auto mapped = mediaToGeneration.find(id);
                if (mapped != mediaToGeneration.end()) { generationToMedia.erase(mapped->second); mediaToGeneration.erase(mapped); }
            }
            return;
        }
        if (event->event_id == MPV_EVENT_FILE_LOADED) {
            routeRecord({int(event->event_id), eventName(event->event_id), uniqueOpenMedia(), "file-loaded", "null", event->reply_userdata, monotonicMicros()}); return;
        }
        if (event->event_id == MPV_EVENT_PROPERTY_CHANGE) {
            auto* property = static_cast<mpv_event_property*>(event->data); if (!property || !property->name) return;
            std::string value = "null";
            if (property->data && property->format == MPV_FORMAT_NODE) value = jsonForNode(*static_cast<mpv_node*>(property->data));
            else if (property->data && property->format == MPV_FORMAT_FLAG) value = *static_cast<int*>(property->data) ? "true" : "false";
            else if (property->data && property->format == MPV_FORMAT_DOUBLE) value = std::to_string(*static_cast<double*>(property->data));
            else if (property->data && property->format == MPV_FORMAT_STRING) value = quote(*static_cast<char**>(property->data));
            auto observer = observerTokens.find(event->reply_userdata);
            if (observer == observerTokens.end()) {
                emitUnattributed({int(event->event_id), eventName(event->event_id), -1, property->name, value, event->reply_userdata, monotonicMicros()}, "unknown-observer-token");
                return;
            }
            auto media = generationToMedia.find(observer->second.first);
            int64_t mediaIdentity = media == generationToMedia.end() ? -1 : media->second;
            NativeRecord record{int(event->event_id), eventName(event->event_id), mediaIdentity, property->name, value, event->reply_userdata, monotonicMicros()};
            if (mediaIdentity < 0) emitUnattributed(record, "observer-generation-has-no-unique-open-media");
            else emitAttributed(record, observer->second.first);
            return;
        }
        if (event->event_id == MPV_EVENT_QUEUE_OVERFLOW) emitGlobal("mpv-event-queue-overflow");
    }
    void validateEnvelope(const Json& message) const {
        if (message.integer("protocolVersion") != PROTOCOL_VERSION) throw std::runtime_error("unsupported-protocol-version");
        if (message.text("helperInstanceId") != helperId) throw std::runtime_error("helper-instance-mismatch");
        auto type = message.text("type"); if (type != "request" && type != "command") throw std::runtime_error("unknown-message-type");
        if (!message.has("generationId")) throw std::runtime_error("missing-generation-id");
        if (message.integer("generationId") <= 0) throw std::runtime_error("invalid-generation-id");
        if (type == "request" && message.integer("requestId") <= 0) throw std::runtime_error("invalid-request-id");
        message.text("method");
    }
public:
    Helper(std::string id, const std::wstring& dllPath, const std::wstring& parentHandle, WriterQueue& output) : helperId(std::move(id)), writer(output) {
        try {
        parent = reinterpret_cast<HWND>(static_cast<uintptr_t>(std::stoull(parentHandle)));
        if (!IsWindow(parent)) throw std::runtime_error("invalid-parent-window");
        SetThreadDpiAwarenessContext(GetWindowDpiAwarenessContext(parent));
        surfaceThread = std::thread(&Helper::surfaceLoop, this);
        for (int attempt = 0; surfaceState == 0 && attempt < 5000; ++attempt) Sleep(1);
        HWND attachedSurface = surfaceWindow.load(std::memory_order_acquire);
        if (surfaceState.load(std::memory_order_acquire) != 1 || !attachedSurface) throw std::runtime_error("surface-create-failed");
        library = LoadLibraryExW(dllPath.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (!library) throw std::runtime_error("dll-load-failed");
#define LOAD(name) p_##name = reinterpret_cast<decltype(p_##name)>(GetProcAddress(library, #name)); if (!p_##name) throw std::runtime_error("missing-export:" #name);
        MPV_FUNCTIONS(LOAD)
#undef LOAD
        mpv = p_mpv_create(); if (!mpv) throw std::runtime_error("mpv-create-failed");
        auto option = [&](const char* name, const char* value) { if (p_mpv_set_option_string(mpv, name, value) < 0) throw std::runtime_error(std::string("option-failed:") + name); };
        option("terminal", "no"); option("idle", "yes"); option("input-default-bindings", "no");
        option("input-vo-keyboard", "no"); option("osc", "no"); option("vo", "gpu-next"); option("gpu-api", "d3d11");
        option("gpu-context", "d3d11"); option("hwdec", "d3d11va"); option("audio-display", "no"); option("keep-open", "yes");
        std::string windowId = std::to_string(reinterpret_cast<uintptr_t>(attachedSurface));
        option("wid", windowId.c_str());
        if (p_mpv_initialize(mpv) < 0) throw std::runtime_error("mpv-initialize-failed");
        uint64_t api = p_mpv_client_api_version();
        char* version = p_mpv_get_property_string(mpv, "mpv-version");
        std::string versionJson = version ? quote(version) : "null";
        if (version) p_mpv_free(version);
        emitGlobal("ready", "{\"protocolVersion\":1,\"mpvClientApiVersion\":" + std::to_string(api) +
            ",\"helperVersion\":" + quote(HELPER_VERSION) + ",\"libmpvVersion\":" + versionJson +
            ",\"surfaceAttached\":true,\"capabilities\":[\"private-inherited-pipe\",\"native-child-hwnd\",\"gpu-next\",\"d3d11\",\"generation-attribution\"],\"queueLimits\":" + writer.metricsJson() + '}');
        } catch (...) {
            if (mpv) { p_mpv_terminate_destroy(mpv); mpv = nullptr; }
            closing = true;
            if (surfaceThread.joinable()) surfaceThread.join();
            if (library) { FreeLibrary(library); library = nullptr; }
            throw;
        }
    }
    ~Helper() {
        if (mpv) { p_mpv_terminate_destroy(mpv); mpv = nullptr; }
        closing = true;
        if (surfaceThread.joinable()) surfaceThread.join();
        if (library) FreeLibrary(library);
    }
    void process(const Json& message) {
        validateEnvelope(message); auto type = message.text("type"); auto method = message.text("method");
        uint64_t generation = static_cast<uint64_t>(message.integer("generationId"));
        uint64_t request = type == "request" ? static_cast<uint64_t>(message.integer("requestId")) : 0;
        if (method == "activate-generation") {
            if (type != "command") throw std::runtime_error("activate-generation-requires-command");
            const auto& properties = message.at("params").at("properties");
            if (properties.type != Json::Type::Array || properties.array.size() > 64) throw std::runtime_error("invalid-observed-properties");
            observedProperties.clear();
            for (const auto& property : properties.array) {
                if (property.type != Json::Type::String || property.string.empty() || property.string.size() > 128)
                    throw std::runtime_error("invalid-observed-property");
                observedProperties.insert(property.string);
            }
            return;
        }
        if (method == "load") {
            if (type != "request") throw std::runtime_error("load-requires-request");
            const auto& params = message.at("params"); if (params.type != Json::Type::Object) throw std::runtime_error("invalid-params");
            auto args = stringArray(params.at("args"), "args");
            if (args.front() != "loadfile") throw std::runtime_error("loadfile-required");
            loadQueue.push_back({generation, request, nextReplyUserdata++, std::move(args)}); return;
        }
        if (method == "retire-generation") {
            if (type != "command") throw std::runtime_error("retire-generation-requires-command");
            retiredThroughGeneration = std::max(retiredThroughGeneration, generation);
            loadQueue.erase(std::remove_if(loadQueue.begin(), loadQueue.end(), [&](const LoadCommand& load) {
                return load.generationId <= retiredThroughGeneration;
            }), loadQueue.end());
            return;
        }
        if (method == "stop") {
            if (type != "request") throw std::runtime_error("stop-requires-request");
            uint64_t userdata = nextReplyUserdata++;
            int rc = commandAsync(userdata, {"stop"}); if (rc < 0) { emitError(generation, request, "stop-queue-failed"); return; }
            commandReplies.emplace(userdata, AsyncCommand{generation, request, method}); return;
        }
        if (method == "command") {
            if (type != "command") throw std::runtime_error("command-requires-command");
            auto args = stringArray(message.at("params").at("args"), "args");
            int result;
#ifdef ETE_HELPER_TESTING
            if (rejectNextOperation == "command") { rejectNextOperation.clear(); result = MPV_ERROR_COMMAND; }
            else
#endif
            result = commandSync(args);
            if (result < 0) emitOperationError(generation, "command", "", result);
            return;
        }
        if (method == "set-property") {
            if (type != "command") throw std::runtime_error("set-property-requires-command");
            const auto& params = message.at("params");
            std::string name = params.text("name");
            if (name.empty() || name.size() > 128) throw std::runtime_error("invalid-property-name");
            std::string value = scalarText(params.at("value"));
            int result;
#ifdef ETE_HELPER_TESTING
            if (rejectNextOperation == "set-property") { rejectNextOperation.clear(); result = MPV_ERROR_PROPERTY_ERROR; }
            else
#endif
            result = p_mpv_set_property_string(mpv, name.c_str(), value.c_str());
            if (result < 0) emitOperationError(generation, "set-property", name, result);
            return;
        }
        if (method == "get-property") {
            if (type != "request") throw std::runtime_error("get-requires-request");
            std::string name = message.at("params").text("name");
            mpv_node value{};
            int result = p_mpv_get_property(mpv, name.c_str(), MPV_FORMAT_NODE, &value);
            if (result < 0) { emitError(generation, request, "property-unavailable"); return; }
            std::string valueJson;
            try { valueJson = jsonForNode(value); }
            catch (...) { p_mpv_free_node_contents(&value); emitError(generation, request, "property-value-limit"); return; }
            p_mpv_free_node_contents(&value);
            if (valueJson.size() > MAX_PROPERTY_JSON_BYTES) { emitError(generation, request, "property-value-limit"); return; }
            emitResponse(generation, request, "{\"value\":" + valueJson + '}' ); return;
        }
#ifdef ETE_HELPER_TESTING
        if (method == "reject-next-operation") {
            if (type != "request") throw std::runtime_error("reject-next-operation-requires-request");
            std::string operation = message.at("params").text("operation");
            if (operation != "set-property" && operation != "command") throw std::runtime_error("invalid-rejected-operation");
            rejectNextOperation = operation;
            emitResponse(generation, request, "{\"armed\":true}"); return;
        }
        if (method == "pending") return;
        if (method == "stderr-storm") {
            if (type != "request") throw std::runtime_error("stderr-storm-requires-request");
            int64_t bytes = message.at("params").integer("bytes"); std::string block(4096, 'D'); int64_t written = 0;
            while (written < bytes) { size_t count = size_t(std::min<int64_t>(block.size(), bytes - written)); std::cerr.write(block.data(), count); written += count; }
            std::cerr.flush(); emitResponse(generation, request, "{\"stderrBytes\":" + std::to_string(written) + '}'); return;
        }
        if (method == "block-main") {
            if (type != "request") throw std::runtime_error("block-main-requires-request");
            int64_t milliseconds = message.at("params").integer("milliseconds");
            if (milliseconds < 1 || milliseconds > 1000) throw std::runtime_error("invalid-block-duration");
            Sleep(static_cast<DWORD>(milliseconds)); emitResponse(generation, request, "{\"blocked\":true}"); return;
        }
        if (method == "transport-storm") {
            if (type != "request") throw std::runtime_error("transport-storm-requires-request");
            int64_t count = message.at("params").integer("count");
            for (int64_t index = 0; index < count; ++index) {
                NativeRecord record{int(MPV_EVENT_PROPERTY_CHANGE), "property-change", uniqueOpenMedia(), "time-pos", std::to_string(double(index) / 1000.0), 0, monotonicMicros()};
                routeRecord(std::move(record));
            }
            emitResponse(generation, request, "{\"submitted\":" + std::to_string(count) + ",\"queue\":" + writer.metricsJson() + '}'); return;
        }
        if (method == "queue-stats") { emitResponse(generation, request, writer.metricsJson()); return; }
        if (method == "emit-unknown-response") {
            uint64_t unknown = static_cast<uint64_t>(message.at("params").integer("requestId"));
            emitResponse(generation, unknown, "{\"injected\":true}");
            emitResponse(generation, request, "{\"emittedRequestId\":" + std::to_string(unknown) + '}');
            return;
        }
        if (method == "emit-malformed-response") {
            writer.enqueue("{\"type\":\"response\",\"helperInstanceId\":" + quote(helperId) +
                ",\"generationId\":" + std::to_string(generation) + ",\"requestId\":" + std::to_string(request) +
                ",\"result\":{\"malformed\":true}}", true);
            writer.enqueue(base("event") + ",\"scope\":\"generation\",\"generationId\":" + std::to_string(generation) +
                ",\"name\":\"core-idle\",\"rawEventId\":22,\"rawEventName\":\"property-change\",\"mediaIdentity\":999999,\"value\":false}", true);
            return;
        }
        if (method == "capture-screen") {
            if (type != "request") throw std::runtime_error("capture-screen-requires-request");
            std::string outputPath = message.at("params").text("path");
            if (outputPath.empty() || outputPath.size() > 4096 || !captureScreenBmp(outputPath)) {
                emitError(generation, request, "capture-screen-failed");
            } else emitResponse(generation, request, "{\"captured\":true}");
            return;
        }
        if (method == "normal-exit") { emitResponse(generation, request, "{\"exiting\":true}"); requestedExit = true; return; }
        if (method == "crash") { RaiseException(EXCEPTION_ACCESS_VIOLATION, EXCEPTION_NONCONTINUABLE, 0, nullptr); return; }
        if (method == "command-noop") return;
#endif
        if (method == "surface-status") {
            if (type != "request") throw std::runtime_error("surface-status-requires-request");
            RECT bounds{};
            HWND currentSurface = surfaceWindow.load(std::memory_order_acquire);
            bool valid = currentSurface && IsWindow(currentSurface) && GetClientRect(currentSurface, &bounds);
            emitResponse(generation, request, "{\"attached\":" + std::string(valid && GetParent(currentSurface) == parent ? "true" : "false") +
                ",\"width\":" + std::to_string(valid ? bounds.right - bounds.left : 0) +
                ",\"height\":" + std::to_string(valid ? bounds.bottom - bounds.top : 0) + '}');
            return;
        }
        throw std::runtime_error("unknown-method");
    }
    void poll() {
        submitNextLoad();
        for (int index = 0; index < 256; ++index) { mpv_event* event = p_mpv_wait_event(mpv, 0); if (!event || event->event_id == MPV_EVENT_NONE) break; handleEvent(event); }
        if (loadReplies.size() == 1) {
            auto load = loadReplies.begin();
            if (monotonicMicros() - load->second.submittedAtMicros > 2000000) {
                load->second.commandError = MPV_ERROR_LOADING_FAILED; completeLoad(load);
            }
        }
    }
    bool shouldExit() const { return requestedExit; }
    std::string mpvVersion() { char* value = p_mpv_get_property_string(mpv, "mpv-version"); std::string result = value ? value : "unavailable"; if (value) p_mpv_free(value); return result; }
};

} // namespace

int wmain(int argc, wchar_t** argv) {
    SetErrorMode(SEM_NOGPFAULTERRORBOX | SEM_FAILCRITICALERRORS);
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    if (argc == 5 && std::wcscmp(argv[1], L"--place-window-behind") == 0) return placeWindowBehind(argv[2], argv[3], argv[4]);
    if (argc != 4) return 2;
    HANDLE input = GetStdHandle(STD_INPUT_HANDLE), output = GetStdHandle(STD_OUTPUT_HANDLE);
    if (!input || input == INVALID_HANDLE_VALUE || !output || output == INVALID_HANDLE_VALUE) return 3;
    WriterQueue writer(output); int exitCode = 0;
    try {
        InputReader reader(input); Helper helper(wideToUtf8(argv[2]), argv[1], argv[3], writer);
        while (true) {
            InboundMessage message;
            while (reader.pop(message)) {
                try { helper.process(message.json); }
                catch (const std::exception& error) {
                    writer.enqueue("{\"protocolVersion\":1,\"type\":\"lifecycle\",\"scope\":\"helper\",\"helperInstanceId\":" + quote(wideToUtf8(argv[2])) +
                        ",\"name\":\"protocol-error\",\"reason\":" + quote(error.what()) + '}', true);
                    exitCode = 20; goto done;
                }
            }
            helper.poll();
            if (helper.shouldExit()) { exitCode = 0; break; }
            if (reader.hasFailed()) { exitCode = 21; break; }
            if (reader.isEof()) { exitCode = 0; break; }
            if (writer.hasFailed()) { exitCode = 22; break; }
            Sleep(1);
        }
done:
        if (reader.hasFailed()) std::cerr << "protocol-input-failure:" << reader.failureReason() << std::endl;
    } catch (const std::exception& error) { std::cerr << "helper-fatal:" << error.what() << std::endl; exitCode = 23; }
    writer.close(); return exitCode;
}
