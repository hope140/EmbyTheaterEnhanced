# Windows 原生媒体试验模块

此目录是 Windows x64 本地试验，调用系统 WinRT/SMTC 与 DWM，不安装服务或 Windows SDK。三个 `.cjs` 接受调用方注入的 Koffi，系统 DLL 只从操作系统目录加载。播放器与 Session 仍由既有链路拥有。当前产品适配器因无法证明像素媒体归属，仅提交中性 DWM 占位，不调用本目录的 raw capture，也不读写图片封面；raw capture 只供独立合成探针。

依赖固定 Koffi 3.3.3（MIT），npm integrity 见 `package-lock.json`。Windows x64 实际需要 `koffi` 与 `@koromix/koffi-win32-x64`，其 LICENSE 必须随 runtime 保留。未升级根目录依赖或 Electron。

向新建的项目内临时目录复制本目录 package.json/package-lock.json，再运行 `npm ci --prefix <临时目录> --ignore-scripts --no-audit --no-fund`。按当前 Windows x64 平台解析固定 optional 包，不复用未知 node_modules。试验装配器须核验输入与每个输出文件 SHA-256，把三个 `.cjs` 和固定 node_modules 放入 runtime 的 `electronapp/enhanced/native-media/`。

main/preload 的 `ETE_WINDOWS_NATIVE_TRIAL=1` 仅为试验开关。常规 `tools/build.ps1` 尚不装配这些原生依赖，不能据此发行或将覆盖字节归于旧 source-provenance。正式集成须扩充构建输入、依赖物化、来源与 payload 合同。

单元检查：`node --test tests/windows-native-media.test.cjs tests/windows-media-controls.test.cjs tests/preload-preparation.test.cjs tests/app-shutdown-drain.test.cjs`。真实检查分系统媒体会话/命令、任务栏 hover、最小化/恢复、换媒体和退出；详见[实现与验证边界](../../docs/WINDOWS_MEDIA_CONTROLS.md)。
