# Windows 媒体控制与启动恢复

## 当前本地试验

本地试验提供 Windows 系统媒体卡片的数据与命令、任务栏播放/暂停和停止按钮、原生视频缩略图。当前保存源码及复现工具，尚未纳入正式构建或发行合同。

首页在同一 refresh epoch 内等待原 connection 的 client/server/user 就绪，绝对期限 3 秒、100ms 探测；pause/clear/dispose 取消等待。超时保留通用错误文字，失败或取消后的普通 resume 可以重新尝试，成功 active 状态继续去重。仍沿用原分区顺序与整页 fallback。启动身份竞态和失败 pending 锁存有离线复现；单个分区慢仍可能延迟整页，不能将修正解释为消除全部网络延迟。

## 归属与实现

- renderer 消费原 PlaybackManager/events。preload 提前捕获模块，由原 libmpv play 入口幂等绑定，避免异步晚 require 遭 Electron 限制。补充原 Web MediaSession 的状态、位置与实际倍速，metadata/action handler 仍属于原模块。
- 任务栏按钮在唯一主窗口使用 Electron `setThumbarButtons`。两布尔 IPC 只接受 canonical 应用 mainFrame；固定 playpause/stop 继续进入原 inputmanager。
- 注册只在窗口已显示且有真实按钮时首次执行；失败返回值与异常进入最多 3 次短重试，恢复可重新提交，退出取消等待。任务栏图标使用系统集成 UI 的主题，避免应用与 shell 主题不同步。
- `windows-native-media.js` 与 `native/windows-media/` 使用固定 Koffi 3.3.3 的 Windows x64 FFI，在 main 内通过 HWND interop 取得 SMTC；play/pause/stop 送回原 inputmanager。没有新增播放器、媒体源或 Session/WebSocket 链。
- 原生状态严格限制字段、长度与数值。main 发放文档 token 并校验单调 sequence；主文档导航/crash 旋转 token，子框架/同文档路由不重置。旧事件、旧媒体捕获和退出后的回调不能重新发布。
- DWM 只捕获 main 内部读取的所属 video host，验证进程归属。PrintWindow 在 FFI 工作线程运行，按请求约 1Hz 更新，缓存一张最大宽 640px 的图像。初始帧建立后，没有近期 DWM 请求时不持续捕获。未截取桌面或其他应用窗口。
- 隐藏/最小化 Native surface 实测可以返回黑帧，因此最小化保留最后有效图像，恢复后按请求更新，不保证最小化期间持续直播。系统封面取本媒体的本地帧，换媒体清旧图；最多缓存 16 张 PNG，原生侧只接收内部生成的路径。
- 退出立即移除 IPC/图像请求并退休事件，等待所属捕获、队列与 WinRT 清理；按归属释放 GDI bitmap/DC、COM 与 callback。可选集成失败仅记录有限固定阶段，不输出异常负载，不使原 play 初始化失败。

Native Helper 二进制、libmpv、窗口 owner、Native 协议、认证和 Resolver 保持既有实现。模块通过本地试验开关启用，普通正式构建尚不装配 FFI 依赖。固定依赖、许可与复现见[原生模块说明](../native/windows-media/README.md)。

本地验收版使用独立 AUMID；Windows shell 通过一份专用的当前用户开始菜单快捷方式读取名称和图标，生成/回读工具见 `tools/windows-media-trial-identity.cjs`。只维护该试验入口，不改变原客户端入口或安装记录。清理试验时只移除此自有 `.lnk`，不要删除整个开始菜单目录。unpackaged SMTC 名称识别限制见 [Microsoft 讨论](https://github.com/microsoft/WindowsAppSDK/issues/127)。

## 预览可靠性候选

本修订仅作用于显式启用 `ETE_WINDOWS_NATIVE_TRIAL=1` 且独立装配固定 Koffi 的试验入口。普通构建仍只有现有任务栏播放/暂停、停止两按钮；透明主窗口与独立 `skipTaskbar` video host 的原生合成不因本修订改变。普通包看到控件但看不到视频，与试验入口的 DWM 捕获问题须分别记录，不能以本候选声称普通包已修复。

- 捕获的 top-down 32-bit BI_RGB DIB 在 `PrintWindow` 前清零，完成后保留 BGR 并将第四字节明确设为 255，再交给 Electron，避免把未定义的 alpha 当透明度。测试用非零彩色像素及不同第四字节检查实际转换代码；这是字节合同证据，不是 D3D 捕获成功证据。
- active Video 一到达就启用自定义预览。无缓存帧时使用不透明黑色占位，最小化前没有首帧、最小化期间换片均不再依赖透明窗口的默认图像。占位不计入 `captured`、不用于 SMTC artwork；`previewReady` 单独表示缓存帧已建立。
- 只有零 BGR 的首次捕获保持等待，并按原约 1Hz 定时器重试；`blankFirstFrames` 单列次数。合法纯黑片头同样显示黑色占位，直到出现非零 BGR。建立缓存后的纯黑帧仍允许更新。不以颜色启发式证明视频有效：有颜色的旧持帧/非视频内容也可能通过，仍须真实换片复验。
- 隐藏/最小化禁止开始捕获，完成时再次检查媒体代次、所属窗口和可见状态；本媒体的已有缓存继续保留。换片清缓存并重置节流，使新媒体可以立即尝试首帧；音频、Stop、主文档换代和退出移除预览。renderer 媒体身份校验不等于 Native Helper 当前画面已属于新媒体，原生持帧过渡仍待 Windows 对照。
- 同时处理 thumbnail `0x0323` 和 Peek/live-preview `0x0326`；后者使用独立的 `DwmSetIconicLivePreviewBitmap`，图像按客户端边界等比缩放，释放临时 DIB。两类请求在没有图像时也记录需求并请求捕获；退出注销两种消息。当前预览只展示 video host 图像，不合成主页面控件，Peek 由最多 640px 宽缓存放大，清晰度和布局待实机评估。

接口依据：[BI_RGB 格式](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader)、[Electron bitmap](https://www.electronjs.org/docs/latest/api/native-image#nativeimagecreatefrombitmapbuffer-options)、[Peek 消息](https://learn.microsoft.com/en-us/windows/win32/dwm/wm-dwmsendiconiclivepreviewbitmap)、[Peek bitmap](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmseticoniclivepreviewbitmap)。

### 本修订离线验证

`node --test tests/windows-dwm.test.cjs tests/windows-native-media.test.cjs tests/windows-media-controls.test.cjs tests/windows-media-trial-bootstrap.test.cjs tests/windows-media-trial-identity.test.cjs tests/preload-preparation.test.cjs tests/app-shutdown-drain.test.cjs`：Linux / Node 24.18.1，68/68 通过，无跳过。相同的七个 DWM 测试在修前源码为 2 pass / 5 fail，修后 7/7；新增底层 FFI 替身模拟明确内存、彩色像素和返回值，执行真实转换/提交/释放代码，不加载 Windows DLL。控制器测试覆盖空首帧重试、最小化前无首帧、最小化换片/恢复、节流换代、失败及隐藏保帧、后续纯黑帧、所属窗口更换、导航及退出。

公开离线入口 `node tools/ci-public-tests.cjs`：1536项，1526 pass / 0 fail / 10项既有 Windows 平台 skip；固定六个材料测试文件按原入口排除，没有新增排除。JavaScript／PowerShell 语法与有限凭据模式检查通过。

### Windows 待复验

本修订未在云 Linux 复现用户的真实任务栏现象，未运行 Windows DWM、Electron GUI、Native 播放、安装或真实服务器。以下检查须使用来源可核验的独立试验 payload，并保存源码、覆盖文件和固定依赖身份；不能借旧包行为替代本修订源码或完整 provenance。

1. 普通包与显式 native 试验入口分别确认开关、FFI 装配、两按钮、窗口透明与 surface 归属。普通包只作对照，不声称获得本候选修复。
2. 可见彩色视频下分别实际 hover thumbnail、Peek、Alt+Tab：同时记录可见结果、BGRA alpha、`previewReady`/`captured`/`submitted`；API 返回成功不能替代可见视频。
3. 播放后立即最小化（尚无首帧）、缓存建立后最小化、最小化换片后恢复：无首帧显示黑色占位，有缓存保本媒体帧，换片不重新显示已退休缓存，恢复后建立新帧。包含纯黑片头、暂停启动、seek、快速 Next/Stop、原生持帧过渡；确认新捕获没有把旧持帧标成新媒体。
4. 隐藏/恢复、全屏、DPI、多屏与高分辨率下检查 Peek 大小、缩放、视频纵横比和两按钮命令；不要求最小化持续直播，不增加新按钮。
5. 连续至少 30 次两类 DWM 请求记录图像变化、耗时、GDI 对象变化与错误；退出时在捕获 pending 状态关闭真实主 BrowserWindow，确认进程退出、两种 hook 退休和缓存不迟到发布。SMTC 会话/封面另核，黑色占位不得成为封面。

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
