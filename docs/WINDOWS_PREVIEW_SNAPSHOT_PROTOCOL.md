# 原生预览 owner 快照候选

这是 v0.4.0 之后的独立候选，默认仍关闭，不合入正式版。此前中性保护只是失败路径；当前新增真正的视频像素来源与产品接线，Windows helper 编译／D3D11／DWM 可见验收尚未执行。

## 合成路径与必要影响面

普通主 BrowserWindow 透明，原生视频由独立 skipTaskbar carrier 内的 helper child HWND 绘制。Windows 对主窗口的默认缩略图不会自动把另一窗口的视频层合成进来。显式 trial 通过 DWM iconic thumbnail／Peek 自定义 bitmap 补足该层；现有两按钮独立保持。普通 build 仍未装配 Koffi，设置一个环境变量不能自动生成此能力。

PrintWindow 读取可变 HWND，可能取得旧持帧，即使之后附上新 generation 也不能证明图像归属。新方法由 **libmpv 当前视频帧的生产者** 返回不可变像素，不再用 PrintWindow 作产品源，也不清屏、seek、pause、重放 loadfile 或改变原呈现策略。

| 文件 | 本轮最小变化／冲突触点 |
| --- | --- |
| `native/mpv-helper/ete-mpv-helper.cpp` | 可选 preview-snapshot-v1 能力、只读方法、owner／单物理请求状态、缩图；不改原 hold／播放决策 |
| `src/electronapp/native-helper/controller.js` | 仅对 preview-snapshot 不保留 request history／timeline 像素；原终态／事件路由保持 |
| `src/electronapp/native-helper/client.js` | 只读 endpoint／generation 访问器，退休立即返回 null |
| `src/electronapp/plugins/libmpv.js` | 将上述访问器限于当前 Play request 的同 Item/Server identity；不发新播放命令 |
| `src/electronapp/native-helper/service.js`、`preview-snapshot.js` | main-only 单请求、capability、代次与结束检查、严格 DTO 解码；未开放 renderer 快照 IPC |
| `src/electronapp/main.js`、`enhanced/windows-media-renderer.js`、`enhanced/windows-native-media.js` | 显式 trial 的 v3 owner 元数据接线、按需快照、缓存撤销、最小化保帧及退出等待 |

controller／libmpv／service／client／helper 均可能与审查 fix 分支相交，应按独立提交逐块协调；本轮不修改对方分支。新 `preview-snapshot.js` 由原 tracked product source 复制合同进入 runtime；未引入额外 C++ include 或工具链变更。

## 像素归属合同

1. renderer 的只读 owner 为 `{endpointId,generationId}`，来自当前 libmpv endpoint；Item/Server 不匹配或 Play 已退休则 null。它不是由媒体标题、延时或任意布尔值产生的证明。v3 状态仍校验 canonical mainFrame、文档 token、sequence 与 playbackEpoch。
2. helper 仅在唯一 open media 已映射至当前未退休 Native generation、同一 media 已 FILE_LOADED 并收到 PLAYBACK_RESTART，且当前实际选中了 video track 后接受请求。START_FILE、activate 新 generation、retire、Stop、对应 END_FILE 均使旧 owner 失效；相同 generation 的重复 observe 不重置就绪。
3. 请求在 helper 内发 `screenshot-raw video bgr0`。固定 mpv 源的 video 模式从 VO 当前帧生成内存截图，不含 ETE 外部持帧 HWND、OSD 或字幕；截图实现等待 VO 帧，播放 restart 在音／视频就绪后通知。这是与独立 HWND 截屏不同的来源。推断前提是固定 libmpv 符合其源合同，真实驱动／DLL仍待实测，不能将源分析冒充 loaded-image 哈希证明。
4. 异步回复时再次检查 helper instance（既有 envelope）、generation、唯一 media 映射、就绪 owner 和绝对期限；像素从该回复节点复制，缩图和归属一起返回。迟到、结束、换代、失败或无视频均 unavailable，不以时间让未知帧“转正”。纯黑但 owner 有效的帧是有效视频帧。
5. main 在发送及收到响应时检查同一个 client 对象、endpoint、generationEpoch／Native generation 和 ended 状态；helper restart／退休后旧回复不能发布。adapter 还检查当前 renderer owner／playbackEpoch、自己的退休 revision 及可见状态。DWM 每次取缓存时再问 main owner；Native 结束／退休即使早于 renderer Stop，也只给中性图。

依据限于固定源码：[mpv dd5d17d32 screenshot.c](https://github.com/mpv-player/mpv/blob/dd5d17d32/player/screenshot.c)、[playloop.c](https://github.com/mpv-player/mpv/blob/dd5d17d32/player/playloop.c)、[video.c](https://github.com/mpv-player/mpv/blob/dd5d17d32/player/video.c)。它们不证明当前 Windows DLL 映像与源码完全重建一致。

## 有界协议和资源

既有 envelope／protocolVersion=1 不变。只有广告 `preview-snapshot-v1` 的 helper 才会被 main 请求；旧 helper 自动保持中性。

```json
{"method":"preview-snapshot","params":{},"generationId":123,"requestId":7}
```

成功 result 仅含 `ready=true,generationId,format="bgr24",width,height,pixels`（canonical base64）。最大160×90×3=43,200源字节、57,600 base64字符，加 envelope 仍在原64KiB限制内；不放宽任何队列限制。失败沿用 ready=false/unavailable 的固定 reason。main 严格拒绝额外字段、错误 owner／format／尺寸／长度／非canonical字节，转为 alpha=255 的 BGRA；不重读磁盘或 Windows surface。

helper 每次最多一个物理截图，约1Hz上限、1500ms逻辑期限；退休／超时只发一次终态，仍保留异步 slot 到 mpv callback，防止物理任务累积。main 等待1800ms，亦只允许一个所属请求。源码复制沿用64MiB／8192维度限制，输出仅一张小图；libmpv 内部截图分配与 GPU readback 性能尚未测量。controller 不把逐帧结果放入诊断／history，adapter 仅保留当前 owner 一张图，封面 IO 继续关闭。

产品 adapter 约1Hz按需更新；没有初帧最多尝试10次，restore／新 owner 可启动新一轮。最小化／隐藏不开始或提交新图，同 owner 的已验证图可保留；新 owner 清旧图。结束、Stop、导航、crash、退出立即退休缓存／hook；退出等待所属 snapshot 和 SMTC 清理，不强行释放 mpv 仍在使用的资源。固定 stage 日志只记首次 owner frame 的尺寸与退休，不记 pixels／媒体身份／URL。

该缩图是视频帧预览，不是主页面与字幕／OSD 的整窗截图；Peek 会放大最多160×90图像，清晰度、DPI、HDR及画面比例仍需 Windows 评价。

## 分层验证与集中 Windows 清单

Linux 的 `node tools/test-preview-owner-core.cjs` 用宿主 g++ 编译**从当前 C++ 实际提取**的 owner／pending-slot／缩图函数：25项状态／实际video track守卫检查及320×180彩色帧→160×90字节回读。此工具不是 Windows helper 编译，不执行 libmpv。公开 Node 回归覆盖严格 DTO、真实 controller framing／历史不留像素、service 同步失败／代次／结束／单请求、renderer owner 接线、libmpv Item/Server 和 Play 退休、adapter 旧回复／黑首帧／最小化／资源等待。不得用这些替代 Windows 结果。

准备了 `tools/windows-native-owner-probe.cjs`：只在固定 Windows Electron 44.4.2 x64 下显式运行，核验 checkout、生产 helper provenance／源码 SHA／EXE SHA、固定 libmpv DLL SHA，生成自身本地红／绿 Y4M，不用服务器、Koffi、账户或 NAS。它读取真实生产方法，自动检验 A/B、旧请求退休和 END_FILE 后 unavailable；只在探针自有实例把 keep-open 设false以测试自然结束，不改产品策略。结果文件只记固定阶段及哈希，只有 end/PASS 且 ownedExitConfirmed 才算此 helper 范围完成，DWM 可见结果始终 NOT_ASSESSED。

```powershell
$previewCommit = (git rev-parse HEAD).Trim()
.\Electron\electron.exe .\tools\windows-native-owner-probe.cjs C:\ETE-Probe\runtime C:\ETE-Probe\runs\owner-001 $previewCommit
```

先 `node tools/windows-native-owner-probe.cjs --describe` 可在 Linux 检查范围；真实 Windows probe 本轮未运行。

集中验收分两层：

1. 固定最终提交用原锁定 Windows 编译器编译生产 helper；运行上述本地 A/B 探针，确认非 Testing 二进制、capability、自然结束和进程退出。
2. 完整独立 trial（另有固定 Koffi 与明确覆盖/provenance）分别检查 taskbar thumbnail／Peek，A→B、同片重播、快速 Next/Stop、黑片头、首次即最小化、最小化切集恢复、pending snapshot退出。人工所见须与 owner-frame／captured／submitted、有限 stage 日志分开；普通包是对照。WinRT、两按钮和原播放／会话归属另验。

## 测试包状态

当前已具备真实产品 owner 快照接线，能力缺失仍中性；**尚未完成 Windows编译／运行，也未补齐常规构建的 Koffi物化／来源合同**。因此没有发布“已修复”包，也不将旧普通包或纯FFI合成窗口当新功能包。父线程可先用精确独立分支提交走现有 `ci-windows-test-package.ps1 -ReleasePackage:$false` 编译／标准包门禁；该标准载荷本身不装Koffi，不能据此宣称 taskbar视频可验收。后续全功能trial装配需独立来源回执和隔离profile／入口，由父线程协调云UI；不碰已拒入口、不覆盖正式安装或已有artifact、不合main或发正式Release。真实v0.4.0发布点确定后另重基。
