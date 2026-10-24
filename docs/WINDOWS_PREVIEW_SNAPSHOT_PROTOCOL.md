# 原生预览 owner 快照候选

这是 v0.4.0 之后的独立候选，默认仍关闭，不合入正式版。独立分支已重基正式发布点 `88578c91ab19d44eecddcfae096d37dc917ef1f4`。此前中性保护只是失败路径；当前已有视频像素来源、产品接线和独立试验包装配源码。首轮 Windows helper 编译因预览终态参数类型错误失败，本次已修正，但修后完整编译／D3D11／DWM 可见验收仍须分别执行；4a9d4ee没有成功试验包，不可供验收。

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

Linux 的 `node tools/test-preview-owner-core.cjs` 用宿主 g++ 以 C++17／Wall／Wextra／Werror 编译**从当前 C++ 实际提取**的 owner／pending-slot、JSON quote、frameUnavailable、hasPreviewVideo、ownsPreview、finishPreview、uniqueOpenMedia及缩图函数：37项状态／终态调用边界检查、两条unavailable JSON解码及320×180彩色帧→160×90字节回读。扩展编译在修前复现了std::string不能传const char*的错误；修后显式c_str转换通过，重复finish不重复响应、物理slot仍保留，动态reason正确转义。提取上下文的transport／属性提供者为替身，此工具仍不是完整Windows helper编译，不执行libmpv。公开Node回归覆盖严格DTO、真实controller framing／历史不留像素、service同步失败／代次／结束／单请求、renderer owner接线、libmpv Item/Server和Play退休、adapter旧回复／黑首帧／最小化／资源等待。不得用这些替代Windows结果。

准备了 `tools/windows-native-owner-probe.cjs`：只在固定 Windows Electron 44.4.2 x64 下显式运行，核验 checkout、生产 helper provenance／源码 SHA／EXE SHA、固定 libmpv DLL SHA，生成自身本地红／绿 Y4M，不用服务器、账户或 NAS。快照本身不依赖Koffi；包内模式会先执行含Koffi实际加载的装配自检。它读取真实生产方法，自动检验 A/B、旧请求退休和 END_FILE 后 unavailable；仅在探针自有generation激活后把 keep-open 设false以测试自然结束，不改产品策略。诊断检查拒绝保留wire BGR24或解码BGRA的pixels字段，不比较两种不同编码。结果文件只记固定阶段及哈希，失败仅记固定stage；只有 end/PASS 且 ownedExitConfirmed 才算此 helper 范围完成，DWM 可见结果始终 NOT_ASSESSED。

```powershell
$previewCommit = (git rev-parse HEAD).Trim()
.\Electron\electron.exe .\tools\windows-native-owner-probe.cjs C:\ETE-Probe\runtime C:\ETE-Probe\runs\owner-001 $previewCommit
```

先 `node tools/windows-native-owner-probe.cjs --describe` 可在 Linux 检查范围；真实 Windows probe 本轮未运行。

集中验收分两层：

1. 固定最终提交用原锁定 Windows 编译器编译生产 helper；运行上述本地 A/B 探针，确认非 Testing 二进制、capability、自然结束和进程退出。
2. 完整独立 trial（另有固定 Koffi 与明确覆盖/provenance）分别检查 taskbar thumbnail／Peek，A→B、同片重播、快速 Next/Stop、黑片头、首次即最小化、最小化切集恢复、pending snapshot退出。人工所见须与 owner-frame／captured／submitted、有限 stage 日志分开；普通包是对照。WinRT、两按钮和原播放／会话归属另验。

## 测试包状态

旧镜像的System.Configuration构建阻碍按[Framework来源合同](FRAMEWORK_SERVICING_PROFILES.md)处理：原固定SHA保持，另一个精确候选须通过镜像／OS／程序集／物理系统路径／微软有效签名及复算哈希全部条件。只读预检在依赖下载前执行，成功包附runner-framework-profile.json，最终Host实际绑定与行为门禁保持。最近一次构建停在此门禁，尚未验证修后的Native；移植通用构建兼容不包含页面缓存产品功能，也不证明DWM可见效果。

手动 `public-ci.yml` 支持 `native_preview_trial=true`，同时必须 `release_package=false`；两个开关不能同时打开。保持固定 GCC 16.1.0、C++17、固定 mpv 2.5 header／DLL 和原 flags／链接库。新增快照调用使用既有动态加载的 libmpv 导出及 C++17 标准库，没有新增 Windows SDK 或链接依赖；源码／便携提取编译检查不能替代锁定 Windows 工具链实编。

构建先完成原来的全部 Windows 回归、源码 Host／生产 helper 编译、标准 runtime 验证、安装器完整性及解包对比。随后从官方 `registry.npmjs.org` 精确获取 Koffi 3.3.3 与 `@koromix/koffi-win32-x64` 3.3.3；版本元数据、锁文件 SRI、归档 SHA-256、92 个归档成员及 PE32+ x64 标识均需通过，不执行安装脚本。完整 MIT 与所含 Node API 许可随包保留。

`tools/windows-native-preview-trial.cjs` 只读当前提交 Git blob，在全新独立目录复制标准载荷，再添加 native-media 模块／依赖、显式入口、探针和来源文件。标准文件字节与默认入口保持原样；独立 `native-preview-trial.json` 绑定源提交、标准 build-manifest、生成器、依赖与完整文件集合。它是额外覆盖来源合同，不将新文件冒充为标准构建输入。试验 ZIP 使用提交和 run 唯一名称，不覆盖正式安装或已有 artifact。

CI 必须重新解包该 ZIP，用**包内固定 Electron 44.4.2 x64** 执行自检：完整文件与生产 helper 来源、固定 DLL、Koffi 实际载入／系统函数调用和 DWM／WinRT FFI 签名绑定。之后从解包副本执行本地红／绿 owner 探针，必须得到唯一 `end/PASS` 且 `ownedExitConfirmed=true`，否则不上传。外部回执包含 ZIP SHA-256、独立 manifest、自检 JSON 与 owner JSONL；探针 profile／媒体留在 artifact 外。自检和 helper A/B 不证明 DWM 可见效果。

Linux 可验证官方归档／装配来源、合成包正反例和便携C++调用边界。首次Windows helper编译已经失败，修后完整编译、自检、helper A/B及试验ZIP尚待重跑；原候选无成功包。该源码具备上述独立构建门禁，不宣称包已生成或视频问题已解决。不自行触发workflow，不合main，不发布正式Release。

## 解包后的最小 Windows 复验

先核对 artifact 的 sourceCommit 与 ZIP SHA-256，再将 ZIP 解到新的普通目录。保留现用正式安装；不导入已有 profile，不预置账户。下列父目录先手动建好，传入的 profile／output 子目录必须不存在且位于 bundle 外：

```powershell
# 单独执行包内自检（不启动完整客户端）
$previewCommit = (Get-Content -Raw .\native-preview-trial.json | ConvertFrom-Json).sourceCommit
$env:ELECTRON_RUN_AS_NODE = '1'
try { & .\x64\electron\electron.exe .\trial\verify.cjs $previewCommit }
finally { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
# 可重复的生产 helper 本地 A/B；每次换一个全新输出目录
.\Test-Owner.ps1 -OutputDirectory C:\ETE-Probe\runs\owner-001
# 完整产品显式 trial；每次换一个全新 profile
.\Launch-Trial.ps1 -ProfileRoot C:\ETE-Probe\profiles\trial-001
```

启动器先自检，设置独立 appData／userData／sessionData／temp 和试验 AppUserModelID，然后才启用环境开关。profile、认证信息和日志不入分发 ZIP；完整产品体验如需登录，由使用者在隔离 profile 自行操作。自检仅允许额外 `debug.log` 或 `x64/electron/debug.log`（各最多 8 MiB），其余新增／篡改文件均拒绝；测试输出放 bundle 外。

Work 需分别记录普通包对照与 trial 的 thumbnail／Peek：A→B 不残留旧帧、黑片头、Stop／结束、同片重播、快速 Next、首次即最小化、最小化换片再恢复、pending 退出与 GDI 资源。首帧未获证明时的中性占位只是保护，不能算视频修复通过；两按钮行为、WinRT 及原播放／Session 链另验。预览目前是最多 160×90 的纯视频图，不含页面／字幕／OSD，画面比例和放大清晰度必须人工评价。

## 独立分支兼容点

EWT 独立实现与本候选均改动 `native/mpv-helper/ete-mpv-helper.cpp` 的 `MPV_EVENT_PLAYBACK_RESTART`：后续协调必须同时保留本候选 `previewOwner.restart(uniqueOpenMedia())`、EWT seek landing／time-pos 采样、一次当前 generation 的 restart 转发，以及原 auto-hold 决策。不能用整块覆盖取代合并审查。

`src/electronapp/native-helper/service.js` 中 EWT 的 restart 特例需维持 currentGenerationId 检查，其他事件仍经过 observed 白名单；本候选增加 main-only capturePreview/isPreviewOwner。`src/electronapp/plugins/libmpv.js` 的 EWT seek/restart 消费与本候选只读 owner getter／previewItem 退休应分别保留。`controller.js`／`client.js` 也需逐块复核。本候选保持 protocolVersion=1，`preview-snapshot-v1` 是可选能力，旧 helper 不收到新方法；不要求 EWT 或旧端启用 native trial。本次未合并其他候选分支，真实集成需另跑 Windows 回归。
