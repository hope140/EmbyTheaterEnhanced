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

## 验证与复现

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
