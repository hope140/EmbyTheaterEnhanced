# Windows 原生预览候选交接

此候选只供来源核验后的独立试验，不改变正式安装入口、两按钮或默认开关。Linux 离线验证不能替代 Windows 实机结果。严格的“新媒体画面已呈现”仍缺原生像素归属证据。因此当前产品适配器 fail-closed：只显示中性黑色占位，不采集视频／持帧窗口、不发布媒体帧或封面，不提供临时绕过参数。此候选不是普通包视频预览修复完成。

## 最小源码集合

| 路径 | 交接用途 |
| --- | --- |
| `src/electronapp/enhanced/windows-media-renderer.js` | 原 PlaybackManager 订阅；v2 窄 IPC 与播放代次，Next 过渡也退休 native 状态 |
| `src/electronapp/enhanced/windows-native-media.js` | 中性预览、SMTC 元数据与所属清理；未证明媒体像素不进入产品；须和上行 v2 一起更新 |
| `native/windows-media/dwm.cjs` | BGRX 转换、thumbnail／Peek、GDI 与消息清理 |
| `tools/windows-native-preview-probe.cjs` | 独立合成窗口探针；不装配依赖，不启动产品 |
| `tests/windows-dwm.test.cjs`、`tests/windows-native-media.test.cjs`、`tests/windows-media-controls.test.cjs`、`tests/windows-native-preview-probe.test.cjs` | 字节、资源、会话、预算和探针边界回归 |
| `docs/WINDOWS_MEDIA_CONTROLS.md`、本页 | 当前合同、历史证据和待测边界 |

前置源码与固定输入仍来自已验证基线；本轮不修改 main、preload 生成器、Native Helper C++、服务／认证、根依赖或 Koffi 锁。v2 上下行必须同步，禁止把新 controller 配旧 renderer 后把不发布状态误记为成功。`dwm.capture` 必须显式声明 `pixelFormat: 'opaque-video-bgrx'`，当前只供独立合成探针调用。main 保留的 getVideoWindow／artworkDirectory 旧参数不再被适配器读取或调用，不构成隐藏取帧入口。

普通 `tools/build.ps1` 目前不装配 `enhanced/native-media` 及 Koffi。用户设置 `ETE_WINDOWS_NATIVE_TRIAL=1` 不能使缺失依赖自动出现：main 的可选加载会失败并写固定 startup 诊断，现有任务栏两按钮仍走原实现。产品没有新增设置项；开关由 main/preload 在启动时读取。既有独立 trial bootstrap 才会显式设置开关并使用隔离 profile，仍需事先核验 payload、源覆盖和固定依赖。不能复制旧包黑箱替代当前源码、不能把覆盖后的字节归入旧 provenance。本轮未运行 npm、未装 Koffi、未构建或修改任何试验／正式 payload。

## alpha 与缓存约束

只将明确约定为 opaque video 的 top-down 32-bit BI_RGB/BGRX 转为 BGRA：清零目标 DIB，保留三个颜色字节，第四字节设 255。没有对这些像素做 unpremultiply；对真实不透明源，255 alpha 下 premultiplied 与 straight RGB 相同。输入若本来是带透明 UI 的 premultiplied BGRA，必须走独立的原字节提交路径，不能冒充 BGRX。回归覆盖非零彩色 BGRX 的零／非零 reserved byte，以及带 128／0 alpha 的 BGRA 在 thumbnail 提交时字节保持；这不等于 Windows 捕获 alpha 已验收。

当前产品没有媒体图像缓存、磁盘封面 IO、first-frame 捕获 timer 或 retry。文档 token、playbackEpoch、media key、sequence 仍管理元数据／中性预览的退休；它们不再被用来给不受证明的像素贴上新媒体标签。同片重播、player 替换、Stop（含 NextMediaType 过渡）、导航／crash 都只清理／重建中性展示。status 单列 `previewMode=neutral-unverified` 与固定 blocked reason；captured、previewReady、firstFrameAttempts、artworkReady 保持0／false，保留这些字段仅为诊断兼容。

独立合成探针仍使用 PrintWindow：系统调用没有安全物理取消，必须等 callback 后才释放 DC／bitmap；卡住时探针退出可能不结算。产品适配器已无此 pending 捕获，不以逻辑超时假装释放原生资源。

## 当前像素与 generation 的可证明关系

| 现有观察 | 可以证明 | 无法证明 |
| --- | --- | --- |
| renderer playbackEpoch／媒体 key／文档 token | 当前状态消息及所属退休 | Native surface 中当前像素归属 |
| controller 的 start-file／file-loaded／core-idle | 已按 helperInstance／generation 过滤的加载或播放状态 | Electron 之后另取的 PrintWindow bitmap 是同一媒体帧 |
| 生产 surface-status | child HWND 挂接、尺寸 | presented generation、帧序号或采集图所有权 |
| 内部 screenshot／WM_FRAME_AUTO_RELEASE／DwmFlush | helper 内部特定 hold 的准备、释放流程 | 当前 main 取帧事务；它们没有给该消费者发原子像素归属回执 |
| PrintWindow success／非零 BGR／延时 | 调用返回及图像字节 | 新媒体已呈现；旧持帧同样可以非零 |

清应用缓存不清 Native 持帧／GPU surface；额外清 surface 会改现有播放呈现策略，故本轮不采用。`test-frame-status` 只在 ETE_HELPER_TESTING 中编译，不能用测试专用状态代替生产证明。

## 重新开放视频像素的最小前提

本轮不添加跨进程协议。若之后确需恢复视频，现有接口不足，最小设计必须让产生像素的 owner 交付**同一次事务的像素及不可分离的归属**，而不是新增一个“ready=true”后再任意 PrintWindow。至少包含以下约束，方案需先与 Native 审查分支协调：

1. 以当前 helper instance、Native media generation 和请求代次绑定采集；renderer playbackEpoch 与该 owner 的映射必须明确，重播、重启和换用户不能复用旧 owner。
2. owner 在原生新帧确认及所属持帧释放后取得快照；返回像素自身须属于该 owner。单独时间戳、file-loaded 或 DwmFlush 布尔值后再读可变窗口均不够。
3. 采集开始／完成都检查 owner，换代立即退休；迟到回复、未确认首帧、缺失／失败证明一律中性。缓冲大小、单请求并发、期限与退出归属必须有界。

以上只是恢复能力的必要合同，不是已实施／已验证协议，也不要求改播放策略。本轮选择移除不安全取帧，避免在 Windows 无法验证时扩大 helper 协议。

## 与审查 fix 分支的协调范围

- `src/electronapp/native-helper/controller.js`：本分支相对6858c711未修改；未来呈现代次／回复退休可能重叠，先协调。
- `src/electronapp/plugins/libmpv.js`：本分支未修改；未来 renderer playbackEpoch 到 Native generation 的映射可能与 Play/Stop 生命周期修复冲突。
- `src/electronapp/native-helper/service.js`、`src/electronapp/native-helper/client.js`、`native/mpv-helper/ete-mpv-helper.cpp`：本分支未修改；未来任何原生快照合同会接触这些共享归属，不能直接覆盖其它修复。
- 已修改的 `src/electronapp/enhanced/windows-media-renderer.js`（v2／Next native-only退休）和 `windows-native-media.js`（当前 fail-closed）须一起核对；main 和 preload 生成器本分支未修改。不操作对方分支。

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

先按 [实机检查清单](WINDOWS_MEDIA_CONTROLS.md#windows-待复验) 区分普通包／显式 trial。当前产品期望是 BLACK／NONE，不是 A/B；只有独立合成探针预期显示彩色。禁止把合成探针的颜色或原有旧包视频记成本候选的新媒体呈现证据。

每个 case 只记录：准确 checkout／覆盖和依赖 SHA、ordinary/trial/synthetic、固定 case 名、expected=BLACK/NONE、observed=BLACK/TRANSPARENT/A/B/UNKNOWN、previewMode／captureBlockedReason／captured／submitted、GDI 前后和退出回读。原系统返回值、程序状态与人工所见分别列出，不抄真实标题、媒体／用户 ID、路径、URL、Token 或 profile 内容。建议模板：

```json
{"case":"minimized-switch","entry":"trial","expected":"BLACK","observed":"UNKNOWN","previewMode":"neutral-unverified","captured":0,"visualAcceptance":"NOT_ASSESSED","ownedExitConfirmed":false}
```

## 测试包就绪判断

用户已授权完成且检查通过的新功能从独立分支打隔离测试包。本项目前**不具备视频预览功能包条件**：普通构建未装配固定 Koffi／FFI 来源与 payload 合同；产品 trial 虽接入中性保护，视频像素通道已移除，独立合成探针又不运行产品。没有可推荐的“视频预览修复验收包”构建参数；照常触发当前 build 只得到缺少该 FFI 能力的普通载荷，不能据此宣称该功能可验收。

因此本轮只交接精确 feature commit、源码及上述合成／中性检查清单，不触发云 UI、不使用已拒入口、不替换正式安装或覆盖已有 artifact。将来满足像素归属与正式装配合同后，父线程再协调独立来源的新包、隔离 profile／app identity 和人工清单。真实 v0.4.0 发布点确定后还须重基；不合 main 或发布新功能正式 Release。
