# Windows 原生媒体试验模块

此目录是 Windows x64 本地试验，调用系统 WinRT/SMTC 与 DWM，不安装服务或 Windows SDK。三个 `.cjs` 接受调用方注入的 Koffi，系统 DLL 只从操作系统目录加载。播放器与 Session 仍由既有链路拥有。当前产品候选使用 Native Helper 的 owner 绑定视频快照，缺失证明时提交中性占位；不调用本目录的 PrintWindow raw capture，也不读写图片封面。raw capture 只供独立合成探针，当前协议与Windows边界见[快照合同](../../docs/WINDOWS_PREVIEW_SNAPSHOT_PROTOCOL.md)。

依赖固定 Koffi 3.3.3（MIT），npm integrity 见 `package-lock.json`。Windows x64 实际需要 `koffi` 与 `@koromix/koffi-win32-x64`，其 LICENSE 必须随 runtime 保留。未升级根目录依赖或 Electron。

独立测试装配使用 `registry-input.json`：仅获取官方注册表的两个精确归档，核对版本元数据、锁文件 SRI、归档 SHA-256 与全部 92 个文件的 SHA-256；不运行 npm install 脚本，不复用未知 node_modules。`tools/download-native-preview-deps.py` 使用宿主正常 HTTPS 信任，`tools/windows-native-preview-deps.cjs` 验证后物化依赖。锁文件与注册表合同保留精确字节，不受 Windows checkout 换行转换影响。

main/preload 的 `ETE_WINDOWS_NATIVE_TRIAL=1` 仅为试验开关。常规 `tools/build.ps1` 不装配这些原生依赖。独立试验 ZIP 在通过原构建／安装器解包检查的标准载荷副本上增加明确入口、固定依赖与独立 `native-preview-trial.json`，不修改标准 Host／main 入口，不把新增字节归于标准 provenance。`Launch-Trial.ps1` 自检后显式启用，要求 bundle 外全新 profile；普通启动仍默认关闭。完整步骤和 Windows 待验范围见[测试包合同](../../docs/WINDOWS_PREVIEW_SNAPSHOT_PROTOCOL.md)。

单元检查：`node --test tests/windows-native-media.test.cjs tests/windows-media-controls.test.cjs tests/preload-preparation.test.cjs tests/app-shutdown-drain.test.cjs`。真实检查分系统媒体会话/命令、任务栏 hover、最小化/恢复、换媒体和退出；详见[实现与验证边界](../../docs/WINDOWS_MEDIA_CONTROLS.md)。
