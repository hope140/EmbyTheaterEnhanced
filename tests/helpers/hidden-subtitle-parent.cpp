#include <windows.h>
#include <iostream>

// Isolated native test parent: no WS_VISIBLE, ShowWindow or activation call.
int main() {
    WNDCLASSW wc{};
    wc.lpfnWndProc = DefWindowProcW;
    wc.hInstance = GetModuleHandleW(nullptr);
    wc.lpszClassName = L"EteIsolatedSubtitleParent";
    if (!RegisterClassW(&wc)) return 2;
    HWND window = CreateWindowExW(WS_EX_NOACTIVATE, wc.lpszClassName, L"Isolated subtitle test",
        WS_OVERLAPPEDWINDOW, 0, 0, 640, 360, nullptr, nullptr, wc.hInstance, nullptr);
    if (!window) return 3;
    std::cout << reinterpret_cast<uintptr_t>(window) << std::endl;
    SetTimer(window, 1, 90000, nullptr);
    MSG msg{};
    while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
        if (msg.message == WM_TIMER) break;
        TranslateMessage(&msg); DispatchMessageW(&msg);
    }
    DestroyWindow(window);
    return 0;
}
