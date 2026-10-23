# Windows 媒体控制与启动恢复

## 当前本地试验

本地试验提供 Windows 系统媒体卡片的数据与命令、任务栏播放/暂停和停止按钮、中性 DWM 占位。原生视频像素尚无可证明的媒体归属，产品适配器已停止该采集／发布路径；当前保存源码及独立合成复现工具，尚未纳入正式构建或发行合同。

首页在同一 refresh epoch 内等待原 connection 的 client/server/user 就绪，绝对期限 3 秒、100ms 探测；pause/clear/dispose 取消等待。超时保留通用错误文字，失败或取消后的普通 resume 可以重新尝试，成功 active 状态继续去重。仍沿用原分区顺序与整页 fallback。启动身份竞态和失败 pending 锁存有离线复现；单个分区慢仍可能延迟整页，不能将修正解释为消除全部网络延迟。

## 归属与实现

- renderer 消费原 PlaybackManager/events。preload 提前捕获模块，由原 libmpv play 入口幂等绑定，避免异步晚 require 遭 Electron 限制。补充原 Web MediaSession 的状态、位置与实际倍速，metadata/action handler 仍属于原模块。
- 任务栏按钮在唯一主窗口使用 Electron `setThumbarButtons`。两布尔 IPC 只接受 canonical 应用 mainFrame；固定 playpause/stop 继续进入原 inputmanager。
- 注册只在窗口已显示且有真实按钮时首次执行；失败返回值与异常进入最多 3 次短重试，恢复可重新提交，退出取消等待。任务栏图标使用系统集成 UI 的主题，避免应用与 shell 主题不同步。
- `windows-native-media.js` 与 `native/windows-media/` 使用固定 Koffi 3.3.3 的 Windows x64 FFI，在 main 内通过 HWND interop 取得 SMTC；play/pause/stop 送回原 inputmanager。没有新增播放器、媒体源或 Session/WebSocket 链。
- 原生状态严格限制字段、长度与数值。main 发放文档 token 并校验单调 sequence；主文档导航/crash 旋转 token，子框架/同文档路由不重置。旧事件、旧媒体捕获和退出后的回调不能重新发布。
- 产品 DWM 预览只提交自己生成的 640×360 不透明黑色占位，不调用 video host getter、PrintWindow 或媒体图像缓存；没有捕获轮询、重试或环境开关旁路。独立合成探针仍可测试 FFI 捕获，但不是产品取帧通道。
- active Video 在最小化、恢复和换片时均为中性占位；Audio、Stop、导航／crash 和退出撤销所属预览。SMTC 保留元数据与原命令，换代清旧封面，不从磁盘或 video surface 读取／设置媒体帧，也不把占位设为封面。
- 退出立即移除 IPC/图像请求并退休事件，等待所属队列与 WinRT 清理；按归属释放 GDI bitmap/DC、COM 与 callback。可选集成失败仅记录有限固定阶段，不输出异常负载，不使原 play 初始化失败。

Native Helper 二进制、libmpv、窗口 owner、Native 协议、认证和 Resolver 保持既有实现。模块通过本地试验开关启用，普通正式构建尚不装配 FFI 依赖。固定依赖、许可与复现见[原生模块说明](../native/windows-media/README.md)。

本地验收版使用独立 AUMID；Windows shell 通过一份专用的当前用户开始菜单快捷方式读取名称和图标，生成/回读工具见 `tools/windows-media-trial-identity.cjs`。只维护该试验入口，不改变原客户端入口或安装记录。清理试验时只移除此自有 `.lnk`，不要删除整个开始菜单目录。unpackaged SMTC 名称识别限制见 [Microsoft 讨论](https://github.com/microsoft/WindowsAppSDK/issues/127)。

## 预览可靠性候选

本修订仅作用于显式启用 `ETE_WINDOWS_NATIVE_TRIAL=1` 且独立装配固定 Koffi 的试验入口。普通构建仍只有现有任务栏播放/暂停、停止两按钮；透明主窗口与独立 `skipTaskbar` video host 的原生合成不因本修订改变。普通包看到控件但看不到视频，与试验入口的 DWM 捕获问题须分别记录，不能以本候选声称普通包已修复。

- 目前不能把 renderer playbackEpoch、`file-loaded`、`core-idle`、非零像素或等待一定时间当作新媒体像素证明。`PrintWindow` 采集的是独立窗口，原持帧层／D3D surface 可在状态换代后仍显示旧内容；清 main 缓存不清这些层。
- 因此移除了产品适配器的 raw capture、媒体帧缓存、首帧重试和图片封面 IO。active Video 仅提交不透明黑色占位；thumbnail／Peek 都不会收到上个媒体的采集图像。`previewMode=neutral-unverified`、`captureBlockedReason=native-frame-ownership-unproven`，`previewReady=false`、`captured=0`、`firstFrameAttempts=0`、`artworkReady=false`，明确区别于已验收的视频预览。
- 同时处理 thumbnail `0x0323` 和 Peek `0x0326`，后者调用独立 `DwmSetIconicLivePreviewBitmap`。两个出口都只取当前中性图，退出退休两种消息；DWM 提交返回成功仍不代表实际可见验收。
- `native/windows-media/dwm.cjs` 的 BGRX→opaque BGRA 和 GDI 捕获资源代码仍保留供独立合成探针使用；已有 premultiplied BGRA 提交保留原字节。该探针不加载 ETE／Native Helper，不可将其彩色结果归为产品新媒体画面证明。

当前证明边界、后续最小设计条件、与 controller/libmpv 审查分支的潜在冲突及测试包就绪判断见[源码交接](WINDOWS_NATIVE_PREVIEW_HANDOFF.md)。本轮不新增 Native 协议、不改播放策略。此前首帧预算与媒体帧缓存的回归仅为历史候选证据，当前产品路径已移除，不把它们列为仍启用的功能。

接口依据：[BI_RGB 格式](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader)、[Electron bitmap](https://www.electronjs.org/docs/latest/api/native-image#nativeimagecreatefrombitmapbuffer-options)、[Peek 消息](https://learn.microsoft.com/en-us/windows/win32/dwm/wm-dwmsendiconiclivepreviewbitmap)、[Peek bitmap](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmseticoniclivepreviewbitmap)。

### 首版候选离线验证

`node --test tests/windows-dwm.test.cjs tests/windows-native-media.test.cjs tests/windows-media-controls.test.cjs tests/windows-media-trial-bootstrap.test.cjs tests/windows-media-trial-identity.test.cjs tests/preload-preparation.test.cjs tests/app-shutdown-drain.test.cjs`：Linux / Node 24.18.1，68/68 通过，无跳过。相同的七个 DWM 测试在修前源码为 2 pass / 5 fail，修后 7/7；新增底层 FFI 替身模拟明确内存、彩色像素和返回值，执行真实转换/提交/释放代码，不加载 Windows DLL。控制器测试覆盖空首帧重试、最小化前无首帧、最小化换片/恢复、节流换代、失败及隐藏保帧、后续纯黑帧、所属窗口更换、导航及退出。

公开离线入口 `node tools/ci-public-tests.cjs`：1536项，1526 pass / 0 fail / 10项既有 Windows 平台 skip；固定六个材料测试文件按原入口排除，没有新增排除。JavaScript／PowerShell 语法与有限凭据模式检查通过。

### Windows 待复验

当前 Linux 定向73/73通过；相同“提供成功非零旧图也必须中性”断言在 ff7b338 修前失败、修后通过。该结果是合成控制流／字节证据，不是 Windows 画面、播放或安装验收。

1. 普通构建不装配 Koffi；仅设置 trial 环境变量不能自动补依赖。普通包仍保留原两按钮，不宣称修复普通包视频预览。
2. 在来源可核验的隔离 trial 入口，使用允许的本地合成 A/B 媒体，分别 hover thumbnail／Peek／Alt+Tab；当前期望始终为 BLACK，`previewReady=false`、`captured=0`。出现 A/B 或透明均须记录失败／未知，不把黑色占位叫作视频通过。
3. 同片重播、快速 Next／Stop、首次即最小化、最小化换片恢复、暂停 seek、导航和退出都不得出现采集帧或图片封面；两按钮和 SMTC 原命令另验。
4. 连续两类 DWM 请求检查 GDI、错误与退出；独立合成探针可测 raw FFI，但其 pending PrintWindow／GDI 结果不替代产品路径证据。真实 Native 视频预览须先满足[后续设计条件](WINDOWS_NATIVE_PREVIEW_HANDOFF.md#重新开放视频像素的最小前提)，再另行验收。

## 既有版本的验证与复现

本节为此前试验的历史证据，不是本预览可靠性修订的 Windows 验收结果。

`node --test tests/windows-media-controls.test.cjs tests/windows-native-media.test.cjs tests/windows-media-trial-bootstrap.test.cjs tests/windows-media-trial-identity.test.cjs tests/app-shutdown-drain.test.cjs` 覆盖 sender/字段限制、文档换代、队列合并、旧事件/捕获退休、暂停 seek 末次同步、原实例绑定、有限重试、单实例唤回及退出等待，47/47 通过。preload 生成关系另由 `tests/preload-preparation.test.cjs` 验证。

首页同断言修前 17/24、修后 24/24；空设备菜单 32 组隔离几何对照通过。提交前完整后台回归数量见 [维护记录](DEVELOPMENT_LOG.md)。

隔离 runtime 已对真实服务和原 Native 播放检查以下行为：

- 冷启动认证恢复和首页首屏加载；首屏可见图片待加载数为 0。
- 唯一 SMTC 会话、标题/封面、时长/进度与 1.5x 倍速同步；系统 pause/play/stop 使原播放器状态相应变化。
- 最小化保帧与系统暂停；恢复后连续 30 次 128×72 DWM 提交成功，图像变化、错误 0、GDI 增量 0。
- 暂停 seek 的末次进度同步、换媒体后封面/新帧更新及单会话保持。
- 实际主 BrowserWindow 关闭、进程退出和再次打开；不能用单独的系统主窗口句柄推断退出完成。

用户已对最新身份和工具栏补丁完成有限人工接受。程序接口、真实播放、人工可见结果分别记录，不外推 DPI、多屏、长时运行、自动连播或正式安装验收。AppInfo 查询与开始菜单条目可读不直接证明 SMTC 抬头刷新；原版 Emby 的同条件对照尚未执行。

本地试验装配须使用可核验的基线 payload，并单列全部覆盖项；旧 About/provenance 只说明原基线。正式集成前仍须把固定原生依赖纳入 source/build-input、runtime provenance 和完整 payload 校验。当前没有为本次源码提交生成安装包。

接口依据：[Electron taskbar](https://www.electronjs.org/docs/latest/tutorial/windows-taskbar)、[SMTC HWND interop](https://learn.microsoft.com/en-us/windows/win32/api/systemmediatransportcontrolsinterop/nf-systemmediatransportcontrolsinterop-isystemmediatransportcontrolsinterop-getforwindow)、[DWM iconic thumbnail](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmseticonicthumbnail)。
