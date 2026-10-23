# Windows 媒体控制与启动恢复

## 当前本地试验

本地试验提供 Windows 系统媒体卡片的数据与命令、任务栏播放/暂停和停止按钮、可选 DWM 视频预览。当前候选由 Native Helper 交付 owner 绑定的 libmpv 视频快照；缺少能力、owner或新帧时显示中性占位。Windows编译／真实可见验收仍待执行；当前保存源码及独立复现工具，尚未纳入正式构建或发行合同。

首页在同一 refresh epoch 内等待原 connection 的 client/server/user 就绪，绝对期限 3 秒、100ms 探测；pause/clear/dispose 取消等待。超时保留通用错误文字，失败或取消后的普通 resume 可以重新尝试，成功 active 状态继续去重。仍沿用原分区顺序与整页 fallback。启动身份竞态和失败 pending 锁存有离线复现；单个分区慢仍可能延迟整页，不能将修正解释为消除全部网络延迟。

## 归属与实现

- renderer 消费原 PlaybackManager/events。preload 提前捕获模块，由原 libmpv play 入口幂等绑定，避免异步晚 require 遭 Electron 限制。补充原 Web MediaSession 的状态、位置与实际倍速，metadata/action handler 仍属于原模块。
- 任务栏按钮在唯一主窗口使用 Electron `setThumbarButtons`。两布尔 IPC 只接受 canonical 应用 mainFrame；固定 playpause/stop 继续进入原 inputmanager。
- 注册只在窗口已显示且有真实按钮时首次执行；失败返回值与异常进入最多 3 次短重试，恢复可重新提交，退出取消等待。任务栏图标使用系统集成 UI 的主题，避免应用与 shell 主题不同步。
- `windows-native-media.js` 与 `native/windows-media/` 使用固定 Koffi 3.3.3 的 Windows x64 FFI，在 main 内通过 HWND interop 取得 SMTC；play/pause/stop 送回原 inputmanager。没有新增播放器、媒体源或 Session/WebSocket 链。
- 原生状态严格限制字段、长度与数值。main 发放文档 token 并校验单调 sequence；主文档导航/crash 旋转 token，子框架/同文档路由不重置。旧事件、旧媒体捕获和退出后的回调不能重新发布。
- 产品 DWM 预览只接收main服务验证的owner视频快照，不调用video host getter或PrintWindow。helper在原生FILE_LOADED／PLAYBACK_RESTART及唯一媒体映射后采集screenshot-raw video，回复时再验证generation；无法取得同owner像素时提交640×360中性占位。
- 同owner的已验证帧在最小化时保留，不在隐藏／最小化期间更新；换owner立刻清图，尚无该owner帧则中性。Audio、Stop、导航／crash 和退出撤销所属预览。SMTC 保留元数据与原命令，换代清旧封面，不从磁盘或 video surface 读取／设置媒体帧，也不把占位设为封面。
- 退出立即移除 IPC/图像请求并退休事件，等待所属队列与 WinRT 清理；按归属释放 GDI bitmap/DC、COM 与 callback。可选集成失败仅记录有限固定阶段，不输出异常负载，不使原 play 初始化失败。

Native Helper 二进制、libmpv、窗口 owner、Native 协议、认证和 Resolver 保持既有实现。模块通过本地试验开关启用，普通正式构建尚不装配 FFI 依赖。固定依赖、许可与复现见[原生模块说明](../native/windows-media/README.md)。

本地验收版使用独立 AUMID；Windows shell 通过一份专用的当前用户开始菜单快捷方式读取名称和图标，生成/回读工具见 `tools/windows-media-trial-identity.cjs`。只维护该试验入口，不改变原客户端入口或安装记录。清理试验时只移除此自有 `.lnk`，不要删除整个开始菜单目录。unpackaged SMTC 名称识别限制见 [Microsoft 讨论](https://github.com/microsoft/WindowsAppSDK/issues/127)。

## 预览可靠性候选

本修订仅作用于显式启用 `ETE_WINDOWS_NATIVE_TRIAL=1` 且独立装配固定 Koffi 的试验入口。普通构建仍只有现有任务栏播放/暂停、停止两按钮；透明主窗口与独立 `skipTaskbar` video host 的原生合成不因本修订改变。普通包看到控件但看不到视频，与试验入口的 DWM 捕获问题须分别记录，不能以本候选声称普通包已修复。

- metadata采用v3，增加只读endpointId／Native generation owner；renderer播放代次不是像素证明。helper把同一请求的owner和不可变视频快照一起返回，main／adapter在回复和DWM读缓存时复核归属；旧helper或迟到／结束响应仍中性。
- 视频快照来自libmpv而非窗口合成，最多160×90 BGR24，转为不透明BGRA。黑色但归属有效的首帧正常接受。它不含主页面、字幕或OSD；Peek放大的清晰度／比例／HDR仍需实机评价。
- 同时处理thumbnail `0x0323`与Peek `0x0326`，后者调用独立DwmSetIconicLivePreviewBitmap。保留两按钮和试验默认关闭，未变更播放命令／hold决策。
- 仅在显式trial中按需约1Hz请求，只允许一个所属物理快照；无首帧最多10次，restore／owner变化可以重试。退出等待所属请求，不把逻辑超时当物理释放。封面IO仍关闭，不把预览像素写磁盘或控制器history。

完整证据链、固定mpv源码依据、边界、独立提交冲突文件、自动Windows探针及测试包状态见[当前快照合同](WINDOWS_PREVIEW_SNAPSHOT_PROTOCOL.md)。此前中性保护与首帧预算记录均为对应历史阶段，不以占位宣称视频问题已修复完成。

接口依据：[BI_RGB 格式](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/ns-wingdi-bitmapinfoheader)、[Electron bitmap](https://www.electronjs.org/docs/latest/api/native-image#nativeimagecreatefrombitmapbuffer-options)、[Peek 消息](https://learn.microsoft.com/en-us/windows/win32/dwm/wm-dwmsendiconiclivepreviewbitmap)、[Peek bitmap](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/nf-dwmapi-dwmseticoniclivepreviewbitmap)。

### 首版候选离线验证

`node --test tests/windows-dwm.test.cjs tests/windows-native-media.test.cjs tests/windows-media-controls.test.cjs tests/windows-media-trial-bootstrap.test.cjs tests/windows-media-trial-identity.test.cjs tests/preload-preparation.test.cjs tests/app-shutdown-drain.test.cjs`：Linux / Node 24.18.1，68/68 通过，无跳过。相同的七个 DWM 测试在修前源码为 2 pass / 5 fail，修后 7/7；新增底层 FFI 替身模拟明确内存、彩色像素和返回值，执行真实转换/提交/释放代码，不加载 Windows DLL。控制器测试覆盖空首帧重试、最小化前无首帧、最小化换片/恢复、节流换代、失败及隐藏保帧、后续纯黑帧、所属窗口更换、导航及退出。

公开离线入口 `node tools/ci-public-tests.cjs`：1536项，1526 pass / 0 fail / 10项既有 Windows 平台 skip；固定六个材料测试文件按原入口排除，没有新增排除。JavaScript／PowerShell 语法与有限凭据模式检查通过。

### Windows 待复验

按[当前快照合同](WINDOWS_PREVIEW_SNAPSHOT_PROTOCOL.md#分层验证与集中-windows-清单)集中执行：先使用精确提交的生产helper与固定libmpv运行本地红／绿Y4M owner探针，再在完整隔离trial检查thumbnail／Peek及原两按钮。A→B、旧回复、同片重播、结束、最小化保帧／换片、恢复及pending退出必须分别核验。owner有效的预期是正确A/B视频，能力缺失或归属失效才是中性；不得把中性记作修复成功。

普通构建不装配Koffi，只作对照；Windows编译、真实D3D11、DWM可见效果、性能与安装本轮均未执行。合成／portable／程序返回／人工所见各自列证据，不使用旧包行为替代当前源码。

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
