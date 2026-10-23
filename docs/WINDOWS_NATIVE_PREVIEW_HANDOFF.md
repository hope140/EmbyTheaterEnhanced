# Windows 原生预览候选交接

此候选只供来源核验后的独立试验，不改变正式安装入口、两按钮或默认开关。Linux 离线验证不能替代 Windows 实机结果。严格的“新媒体画面已呈现”仍缺 Native Helper 提供的渲染代次／GPU fence 证据；当前 `PrintWindow` 成功和非零 BGR 只能说明拿到了像素，不能证明不是旧持帧。该项未闭合前，不应将本候选作为普通包视频预览已修复的依据。

## 最小源码集合

| 路径 | 交接用途 |
| --- | --- |
| `src/electronapp/enhanced/windows-media-renderer.js` | 原 PlaybackManager 订阅；v2 窄 IPC 与播放代次，Next 过渡也退休 native 状态 |
| `src/electronapp/enhanced/windows-native-media.js` | 缓存／封面归属、首帧预算、opaque video 捕获调用；须和上行 v2 一起更新 |
| `native/windows-media/dwm.cjs` | BGRX 转换、thumbnail／Peek、GDI 与消息清理 |
| `tools/windows-native-preview-probe.cjs` | 独立合成窗口探针；不装配依赖，不启动产品 |
| `tests/windows-dwm.test.cjs`、`tests/windows-native-media.test.cjs`、`tests/windows-media-controls.test.cjs`、`tests/windows-native-preview-probe.test.cjs` | 字节、资源、会话、预算和探针边界回归 |
| `docs/WINDOWS_MEDIA_CONTROLS.md`、本页 | 当前合同、历史证据和待测边界 |

前置源码与固定输入仍来自已验证基线；本轮不修改 main、preload 生成器、Native Helper C++、服务／认证、根依赖或 Koffi 锁。v2 上下行必须同步，禁止把新 controller 配旧 renderer 后把不发布状态误记为成功。`dwm.capture` 必须显式声明 `pixelFormat: 'opaque-video-bgrx'`；调用方禁止传主 UI／同 webContents，只从现有 service 的 `getVideoWindow()` 取所属 carrier。

普通 `tools/build.ps1` 目前不装配 `enhanced/native-media` 及 Koffi。用户设置 `ETE_WINDOWS_NATIVE_TRIAL=1` 不能使缺失依赖自动出现：main 的可选加载会失败并写固定 startup 诊断，现有任务栏两按钮仍走原实现。产品没有新增设置项；开关由 main/preload 在启动时读取。既有独立 trial bootstrap 才会显式设置开关并使用隔离 profile，仍需事先核验 payload、源覆盖和固定依赖。不能复制旧包黑箱替代当前源码、不能把覆盖后的字节归入旧 provenance。本轮未运行 npm、未装 Koffi、未构建或修改任何试验／正式 payload。

## alpha 与缓存约束

只将明确约定为 opaque video 的 top-down 32-bit BI_RGB/BGRX 转为 BGRA：清零目标 DIB，保留三个颜色字节，第四字节设 255。没有对这些像素做 unpremultiply；对真实不透明源，255 alpha 下 premultiplied 与 straight RGB 相同。输入若本来是带透明 UI 的 premultiplied BGRA，必须走独立的原字节提交路径，不能冒充 BGRX。回归覆盖非零彩色 BGRX 的零／非零 reserved byte，以及带 128／0 alpha 的 BGRA 在 thumbnail 提交时字节保持；这不等于 Windows 捕获 alpha 已验收。

缓存以文档 token、递增 playbackEpoch、媒体 key 和 main 内部代次共同退休。同媒体重播、player 替换、Stop（含 NextMediaType 过渡）、媒体变更、主导航和 crash 都清旧图；低 playbackEpoch 即使有更高 sequence 也拒绝。封面文件使用文档 token＋内部代次的新散列名，不再按媒体 ID 读回旧用户／旧播放的 PNG，换代同步清 SMTC 旧封面。缓存归属测试通过，不代表底层窗口当前像素已有正确媒体归属。

首次实际可见捕获开始计算最多 10 次、15 秒预算，先到者停止自动首帧尝试；预算用单调时钟在开始／完成两侧检查。无帧时保留不透明黑色占位。最小化／隐藏不开始捕获；restore 在预算耗尽时授予新一轮有界预算并退休旧 attempt。换代、Stop、导航、退出取消所属结果发布。PrintWindow 系统调用没有安全物理取消：退出须等其 callback 后才恢复／释放 DC 和 bitmap，若系统调用长期不返回，关闭等待也可能长期不结算；不能用逻辑超时提前释放资源或声明成功退出。

## 独立合成探针

先用 `node tools/windows-native-preview-probe.cjs --describe` 查看范围；此命令在 Linux 也可运行，不加载 Electron／Koffi。

Windows 上，使用事先核验的 Electron 44.4.2 x64 和已存在的 Koffi 3.3.3 目录（含 Windows x64 optional 包与许可）。探针拒绝其它平台／版本、不下载／安装依赖，结果目录必须不存在。示意 PowerShell 命令：

```powershell
$previewCommit = (git rev-parse HEAD).Trim()
.\Electron\electron.exe .\tools\windows-native-preview-probe.cjs C:\ETE-Probe\fixed-ffi C:\ETE-Probe\runs\001 $previewCommit
```

探针只创建自身透明主窗口与不透明彩色窗口，用输出目录下的新 appData/userData/sessionData，最多 30 个捕获样本、约 30 秒；可以人工 hover thumbnail、Peek、最小化／恢复。`probe.jsonl` 记录脚本／DWM 源 SHA、所声明 commit、预期合成色、首像素 BGR、bitmap SHA、opaque、submitted、GDI 数量和 pending drain，不记录用户媒体／账户／URL，也不截图桌面或其它应用。记录 `end` 才表示本探针完成清理；`drain` 后缺 `end` 是待完成，不能伪造通过。所声明 commit 仍须与实际 checkout 回读核对。

这是 Electron 合成窗口＋真实 FFI 的探针方案，不运行 Native Helper 或视频解码，不检验产品的两按钮，也不证明用户可见画面。当前仅验证其描述／平台门禁，尚未在 Windows 执行。日志的 `visualAcceptance` 固定为 NOT_ASSESSED，人工可见证据必须单列。

## 产品复验与最小日志

先按 [实机检查清单](WINDOWS_MEDIA_CONTROLS.md#windows-待复验) 区分普通包／显式 trial，之后用允许的本地 A／B 合成色媒体检查同片重播、快速 Next、Stop、黑色片头、最小化前无首帧、最小化换片恢复及退出 pending。不要访问 NAS／服务器来准备这组夹具。

每个 case 只记录：准确 checkout／payload 覆盖及依赖 SHA、ordinary 或 trial、固定 case 名、expected=A/B/NONE、observed=A/B/BLACK/TRANSPARENT/UNKNOWN、previewReady／captured／submitted／firstFrameAttempts／firstFrameExhausted、GDI 前后、退出是否回读完成。原系统返回值、程序状态和人工所见分别列出，不抄真实标题、Item/User/Session ID、路径、URL、Token 或 profile 内容。建议人工记录模板：

```json
{"case":"minimized-switch","entry":"trial","expected":"B","observed":"UNKNOWN","programStatus":"NOT_RUN","visualAcceptance":"NOT_ASSESSED","ownedExitConfirmed":false}
```

若新捕获仍是 A，则本候选失败；不能以新 playbackEpoch 或非零像素给出“绝不显示旧媒体帧”的结论。现有生产 `surface-status` 只返回 attached／width／height，`test-frame-status` 又只在 ETE_HELPER_TESTING 内编译，不能将测试专用状态冒充正式协议证明。需要以 Native Helper 的媒体代次及实际新帧呈现／持帧释放 fence 绑定捕获源，再做有界设计；本轮没有为此新增协议或变更 Native Helper。真实 v0.4.0 发布点确定后还须重基，并重新校验以上来源与回归；不会自动合并或发布。
