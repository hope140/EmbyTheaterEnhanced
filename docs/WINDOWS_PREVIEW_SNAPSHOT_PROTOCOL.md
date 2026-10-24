# 原生预览 owner 快照候选

这是 v0.4.0 之后的独立候选，默认仍关闭，不合入正式版。独立分支已重基正式发布点 `88578c91ab19d44eecddcfae096d37dc917ef1f4`。e8e7f50的真实Windows运行已通过Host／生产Native编译、1689项回归、包内自检（ffiLoaded=true）和GUI入口smoke，2233文件四阶段全同。owner进入ready／窗口后在handshake阶段约1.5秒exit1；旧generic报告未保留helper首错，确切原因尚未证实。仍无验收包，D3D11／DWM可见结果未通过。

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

准备了 `tools/windows-native-owner-probe.cjs`：只在固定 Windows Electron 44.4.2 x64 下显式运行，核验 checkout、生产 helper provenance／源码 SHA／EXE SHA、固定 libmpv DLL SHA，生成自身本地红／绿 Y4M，不用服务器、账户或 NAS。快照本身不依赖Koffi；包内模式会先执行含Koffi实际加载的装配自检。它读取真实生产方法，自动检验 A/B、旧请求退休和 END_FILE 后 unavailable；仅在探针自有generation激活后把 keep-open 设false以测试自然结束，不改产品策略。诊断检查拒绝保留wire BGR24或解码BGRA的pixels字段，不比较两种不同编码。结果文件只记固定阶段及哈希，失败保留下述受限错误投影；end/PASS还必须满足新增的owned-shutdown-v1退出验收合同，DWM 可见结果始终 NOT_ASSESSED。

```powershell
$previewCommit = (git rev-parse HEAD).Trim()
.\Electron\electron.exe .\tools\windows-native-owner-probe.cjs C:\ETE-Probe\runtime C:\ETE-Probe\runs\owner-001 $previewCommit
```

先 `node tools/windows-native-owner-probe.cjs --describe` 可在 Linux 检查范围；真实 Windows probe 本轮未运行。

集中验收分两层：

1. 固定最终提交用原锁定 Windows 编译器编译生产 helper；运行上述本地 A/B 探针，确认非 Testing 二进制、capability、自然结束和进程退出。
2. 完整独立 trial（另有固定 Koffi 与明确覆盖/provenance）分别检查 taskbar thumbnail／Peek，A→B、同片重播、快速 Next/Stop、黑片头、首次即最小化、最小化切集恢复、pending snapshot退出。人工所见须与 owner-frame／captured／submitted、有限 stage 日志分开；普通包是对照。WinRT、两按钮和原播放／会话归属另验。

## 测试包状态

旧镜像的System.Configuration构建阻碍按[Framework来源合同](FRAMEWORK_SERVICING_PROFILES.md)处理：原固定SHA保持，另一个精确候选须通过镜像／OS／程序集／物理系统路径／微软有效签名及复算哈希全部条件。只读预检在依赖下载前执行，成功包附runner-framework-profile.json，最终Host实际绑定与行为门禁保持。后续d4f9d6b已推进通过Host／Native和基础安装器，失败转至试验自检／owner；不包含页面缓存产品功能，也不证明DWM可见效果。

手动 `public-ci.yml` 支持 `native_preview_trial=true`，同时必须 `release_package=false`；两个开关不能同时打开。保持固定 GCC 16.1.0、C++17、固定 mpv 2.5 header／DLL 和原 flags／链接库。新增快照调用使用既有动态加载的 libmpv 导出及 C++17 标准库，没有新增 Windows SDK 或链接依赖；源码／便携提取编译检查不能替代锁定 Windows 工具链实编。

构建先完成原来的全部 Windows 回归、源码 Host／生产 helper 编译、标准 runtime 验证、安装器完整性及解包对比。随后从官方 `registry.npmjs.org` 精确获取 Koffi 3.3.3 与 `@koromix/koffi-win32-x64` 3.3.3；版本元数据、锁文件 SRI、归档 SHA-256、92 个归档成员及 PE32+ x64 标识均需通过，不执行安装脚本。完整 MIT 与所含 Node API 许可随包保留。

`tools/windows-native-preview-trial.cjs` 只读当前提交 Git blob，在全新独立目录复制标准载荷，再添加 native-media 模块／依赖、显式入口、探针和来源文件。标准文件字节与默认入口保持原样；独立 `native-preview-trial.json` 绑定源提交、标准 build-manifest、生成器、依赖与完整文件集合。它是额外覆盖来源合同，不将新文件冒充为标准构建输入。试验 ZIP 使用提交和 run 唯一名称，不覆盖正式安装或已有 artifact。

工作树的文本输入可有Git允许的CRLF转换；组装对照提交内容后，**输出和来源哈希一律绑定原Git blob字节**，不从工作树复制文本或在包校验时忽略换行。registry／lock的既有`-text`属性仍保持精确输入。跨平台夹具先用同一组文本输入及仓库属性创建临时提交，显式设本地LF或CRLF并真实重新checkout全部输入，再断言policy工作树换行、每个trial源输出及source hash、每个标准载荷副本的精确字节。标准载荷包含混合LF／CRLF／单CR及无末尾换行；输出仅换行漂移仍须触发原完整性拒绝，工作树的实质源码修改也须在组装前拒绝。d0dcb7d的两个Windows失败为测试误将blob LF与工作树CRLF相比；修后Linux覆盖不代替真实Windows重跑，也不解释旧Native handshake首错。

CI必须重新解包该ZIP，用**包内固定Electron44.4.2 x64**执行自检：完整文件与生产helper来源、固定DLL、Koffi实际载入／系统函数调用和DWM／WinRT FFI签名绑定。`windows-native-preview-process.cjs`逐个持有子进程，记录实际executable／argv及Node／GUI模式，等待真实close与输出排空后才读报告；自检45秒、GUI入口smoke15秒、完整owner90秒，超时仅终止所属子进程并记录结果。外层Electron exit0、自检回执的ffiLoaded=true／sourceCommit、GUI描述scope及后续唯一final end/PASS／ownedExitConfirmed／nativeExitAccepted和owned-shutdown-v1记录必须全部满足；描述通过不代替owner A/B，提前写PASS后Electron exit非零仍失败。成功外部回执包含ZIP SHA-256、独立manifest、自检JSON、GUI入口描述、进程完成后的acceptance JSON及owner JSONL；profile／媒体不进入分发包。

在解包后、自检后、入口smoke后、owner后分别保存物理文件清单、SHA及新增／缺失／改变的相对文件名，也记录与上一阶段的差异。每阶段重新运行原完整性检查；原固定两处小debug.log例外保持，原始诊断差异仍显示这些日志。stdout／stderr各最多8MiB，实际命令／PID／启动／exit／close／timeout另存；命令仅为受控本地探针，不记录产品播放URL或账户。若已有owner-probe.jsonl，则在成功或失败后额外保存其有界物理文件为owner-stages.jsonl（最多1MiB），不复制输出目录其他内容。失败仅上传独立diagnostics artifact（1天），不上传验收包，不生成替代owner PASS，不上传profile／Y4M。

Electron会把ASAR暴露成虚拟目录，连其Node模式也启用此wrapper；普通Node构建清单和Electron的node:fs遍历因此可能看到不同集合。校验器只用Electron内置`original-fs`读取物理payload及归档字节，不全局关闭应用ASAR，不增加归档豁免。依据：[官方ASAR／original-fs说明](https://electronjs.org/docs/latest/tutorial/asar-archives)、[固定Node初始化](https://github.com/electron/electron/blob/v44.4.2/lib/node/init.ts)、[固定wrapper](https://github.com/electron/electron/blob/v44.4.2/lib/node/asar-fs-wrapper.ts)。同版官方LinuxElectron经发行SHA验证的真实复现为物理1个default_app.asar、旧视图13个虚拟成员，归档SHA不变，修后清单稳定；这是FS验证，不是Windows原生验收。旧Windows失败日志未保留逐项差异，不能宣称排除其他物理变化，新三阶段诊断用于确认。

d028f77的真实Windows自检和三阶段清单已确认通过；它的owner90秒超时仍使试验包不通过。入口修复后的实际Windows smoke／owner A/B及最终ZIP须重跑，DWM／Peek另验。不自行触发workflow，不合main，不发布正式Release。

## Electron默认启动器与探针入口

固定[default_app/main.ts](https://github.com/electron/electron/blob/v44.4.2/default_app/main.ts)设置process.defaultApp后，用await import加载应用入口；CJS被ESM导入时require.main不等于该模块。原脚本只检查require.main===module，可能仅导出函数而不启动run，Electron仍保持主循环。受控实测用同版真实LinuxElectron Node模式、按此defaultApp／argv合同导入旧源码，--describe静默；修后输出scope。该实验不使用GUI，也不声称复现了Windows桌面超时。

当前仅补认Electron defaultApp且argv[1]的物理路径等于当前脚本的直接调用；普通ESM库导入、argv不符均不执行。--describe在GUI模式先排空输出再明确exit0，不创建窗口或播放器。实际CI使用同一GUI默认启动路径先做该smoke，再执行完整owner；owner仍要求Windows x64固定Electron与browser进程。

stderr在入口分派前记录module-evaluated及判断结果，在调用run前记录entry及参数形状，随后依次记录预检、source-bound、profile-configured、app-ready-wait／app-ready、窗口、helper、采样、end-file和cleanup。日志不含像素／媒体身份／账户。结合实际argv和部分owner阶段报告，可以区分入口未触发、预检失败、ready未完成、helper启动／事件或退出等待；不得单凭无输出判定无交互桌面、GPU或DWM原因。修后Windows实际阶段尚待观察。

## 握手身份与最小后台核对

manifest的`libmpv.version`是组件版本（v0.41…），生产`service.EXPECTED_LIBMPV_VERSION`是ready消息的完整runtime版本（mpv v0.41…）。探针复用后者，同时核对固定DLL SHA及API2.5与manifest一致；保持严格比较，不接受未知版本或从观察值扩充名单。真实controller／受控管道回归证明旧组件值被拒绝、正确runtime值被接受；这不证明e8e7f50的generic错误就是版本问题。

启动诊断区分controller-start和preview-capability。保留固定错误码／已知消息及原cause；unknown文本只留摘要。ready只投影版本／API／surface／已知capability及队列上限，保留进程PID／退出码／signal／transport／protocol failure和末16条关闭事件。stderr仅检查末8192字节，保留已观察／保留长度、摘要及最多4条受限helper-fatal标签，不写原始URL／账户路径／像素。清理后最多等待1秒close，避免仅exit已发生却漏掉尾部stderr；流未确认或原启动失败仍失败，不能因此生成PASS。controller-ready与preview能力广告分开记录，完整A/B和退出门禁保持。

**零窗口的生产helper握手不可行。** 当前C++构造器先验证parent HWND，启动surface线程并调用CreateWindowExW建立两个子窗口，再加载／初始化mpv并发送ready。WS_EX_NOACTIVATE不等于没有窗口；不提供隐藏该事实的后台执行命令，不借桌面HWND或旧包替代。真实复现还必须有准确源提交绑定的helper／固定DLL／provenance；不能假定现有正式安装含相同SHA，当前失败artifact也不是完整trial。

### 预握手DLL加载与短云诊断

**依赖放置修复候选已据A/B接线。** 31372083的真实云诊断中A不可加载、B并置已验证Electron loader后可加载，成员SHA为`7611034fc1bc24fa103b4c6bf923974cdec46fa506952d6f82cfef836db99fd1`；此结果仍不是生产helper／DWM验收。试验组装新增`native/windows-media/loader-input.json`，绑定固定官方Electron44.4.2／原归档SHA／成员SHA。只从已验证标准载荷的`x64/electron/vulkan-1.dll`复制到`electronapp/libmpv/x64/vulkan-1.dll`；不改标准文件或主入口，不下载替代Vulkan、不安装驱动、不扩大搜索目录。原Electron许可／notice文件保留。

试验manifest的`runtimeCopies`严格记录源／目标／SHA／大小／归档和byte-identical关系；包内保留源锁及Electron源manifest。组装先拒绝源缺失／漂移及目标碰撞，验证同时要求源属于原standard build-manifest、目标与源及锁完全相同，重写trial inventory不能掩盖关系错误。原standard payload字节不变；新增条目按实际manifest计数，不使用历史2234硬编码。复制件是Vulkan loader，未改变固定D3D11呈现策略，也不等于安装Vulkan GPU驱动。

接下来的短验证只选择`native_helper_only=true`，其余release／trial／loader开关均false；默认关闭且不能混选。它先复用原加载A/B，再仅准备原锁定MSYS完整编译器前缀／mpv头和固定Electron，跳过Host、完整回归和安装器。实际编译非Testing生产helper，记录原source／compiler／helper provenance及独立loader-copy provenance，以45秒所属Electron进程执行`--handshake-only`。这会创建真实窗口／helper，仅限云Windows；不在Work后台／前台执行，不加载媒体。回执要求真实ready的协议1、固定runtime版本／API2.5、surface及完整六能力，随后确认所属退出及流close。独立scope为`production-helper-handshake-only`、snapshot／visible NOT_ASSESSED，不能作为owner PASS。

小验证成功后再安排完整trial：包内固定FFI、自检、入口smoke、生产helper握手、完整A/B／退休／EOF owner，最后真实DWM／Peek。完整流程现在也先做一次独立握手并记录其物理清单，再执行原90秒owner；两个scope及退出门禁均保留。新`ete-native-helper-startup-<sha>-<run>-<attempt>` artifact仅保留启动JSON、helper／loader provenance和有界日志，profile／媒体／DLL不进入artifact，保留1天。父统一排准确提交；当前修后真实编译／握手及最终owner尚未执行。

**正式产品影响单独处理。** 只读[v0.4.1 helper源](https://github.com/hope140/EmbyTheaterEnhanced/blob/44d524e4b5cfdd018e0da80cfa1e667e7f6751c7/native/mpv-helper/ete-mpv-helper.cpp)及其manifest可见相同固定libmpv和0x1100受限加载。系统没有可用loader且helper／libmpv相邻目录也无副本时，同类包也有启动风险；不能只按GPU驱动是否存在判断，D3D11选项不消除PE普通导入。这里不修改正式安装、main或Release；正式修复应在独立验证后协调。以下保留诊断引入时的证据状态和方法，不表示新A/B仍未完成。

edc58c76的实际helper stderr已给出dll-load-failed及exit23，handshake null；具体Win32码原未保存，不能将版本修复或FFI自检成功当加载首因证明。owner与生产service都用绝对DLL路径、同一controller和helper的`LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS`（0x1100）。owner在已验证文件SHA后记录absolute／physicalPathMatch／productionBaselinePathMatch及字符数；helper在加载失败的第一步保存GetLastError，再记录target-file／absolute／chars／forward-slashes固定投影，不写真实路径或本地化错误原文。依据为[LoadLibraryExW官方合同](https://learn.microsoft.com/en-us/windows/win32/api/libloaderapi/nf-libloaderapi-loadlibraryexw)：依赖加载失败也会使调用失败，当前目录和任意PATH不属于该受限搜索集合；本轮不改变搜索策略。

固定7z原SHA验证后读取的DLL为119725568字节、SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。objdump及独立PE32+解析均发现47项普通导入，含`vulkan-1.dll`；延迟导入RVA／size均为零。因此D3D11选项不会消除启动时Vulkan loader依赖。独立helper的应用目录及DLL目录与Electron目录不同；但缺少此CI的实际系统依赖与Win32码时，仍不能断言这就是当前首因或擅自安装Vulkan。

手动workflow新增默认false的`native_loader_only`。只选此项，保持`release_package=false`、`native_preview_trial=false`；父统一安排准确最终SHA，不自行dispatch。此路线在原提交归档验证后分流，跳过Host、完整回归、Native编译、runtime／安装器及owner组装；不会生成验收包。它只恢复原固定libmpv和官方锁定Electron44.4.2 ZIP，验证归档／73文件树后，在全新私有A／B目录复制材料，分别用两个新PowerShell7进程加载。A仅libmpv；B额外并置该已验证Electron中的Vulkan loader。两者均使用0x1100，不改PATH／全局DLL搜索或驱动，不调用mpv_create／mpv_initialize、不创建helper或完整客户端。LoadLibrary本身执行DLL初始化代码；这个模式仅限云Windows x64，不应在前台暂停的Work执行，也不将其称作生产helper握手。

每进程最多15秒，超时或退出失败保留状态且整次失败；实际加载模块须FreeLibrary成功，原进程error mode恢复。报告只含源SHA、材料SHA、导入名、Win32数值及存在性／来源类别，不含原始模块路径。仅在A失败126、两个进程均未预加载Vulkan、B成功且实际加载自并置位置、哈希等于原Electron成员时，assessment才标记`vulkanDependencyCauseSupported=true`。该字段支持依赖放置假设，仍不证明生产helper／D3D11／DWM通过；两边都成功、都失败、其他错误、未知来源或错误哈希均不能支持该结论。短job exit0只表示诊断已收集，完整源及视频验收仍须独立进行。

独立artifact名为`ete-native-loader-diagnostic-<sha>-<run>-<attempt>`，保存A／B JSON、有限stdout／stderr和summary，保留1天，不上传DLL、媒体或profile。此修订未将并置方案加入产品包；真实短A/B、Win32码及后续最小修复须先闭合，再重跑完整Windows生产helper及owner，最后集中验DWM／Peek。宿主C#实际编译及C++提取编译分别只验证声明／调用顺序，不是Windows加载证据。

可以在后台做以下**纯源合同核对**，所需输入是本分支精确源码checkout及已有Node.js；无需helper、DLL、服务器、profile或账户。代码只读manifest和生产常量，不启动子进程、不加载Electron／FFI／addon、不调用窗口API，不生成文件：

```powershell
node .\tools\windows-native-owner-probe.cjs --audit-contract
```

输出明确标为`scope=static-source-contract-only`、`nativeHelperStarted=false`、`dllLoaded=false`和DWM NOT_ASSESSED。这不是握手或二进制兼容验收；此命令通过不能解释本次丢失的Native首错，也不能替代需要另协调的实际窗口／视频验证。

## 退出验收强化与后续阶段诊断

这是P2验收强化，不是旧handshake失败的首因。旧合同只要求end/PASS和ownedExitConfirmed，并未承诺Native exit0；生产controller.kill也对任意已退出状态结算。新增独立`owned-shutdown-v1`报告合同，由探针和外部报告读取器共用同一源文件，随trial按源码哈希装配；原生产controller／helper关闭行为不变。

所有情形均须在探针主动关闭前没有意外transport终态，主动关闭后确认进程已退出、流已close、没有spawn／协议／transport错误。接受两种分别标记的结果：`graceful`为stdin EOF后的code=0、signal=null；`controller-terminated`为原controller等待2秒后确实调用所属child.kill(SIGTERM)成功，且得到code=null、signal=SIGTERM。探针仅在关闭期间透明记录该已有方法的调用／结果并恢复方法，不新增强退策略。未请求的signal、提前exit0、Native错误码20–23、错误／缺失状态、未关闭的流均失败；Native错误退出不能被末次有效snapshot或PASS文字掩盖。强制结束获接受仅说明原controller已完成所属关闭，不等于优雅退出或DWM成功。

固定Electron44.4.2实际携带Node24.21.0／libuv1.52.1。源码依据为[Node Windows process](https://github.com/nodejs/node/blob/v24.21.0/deps/uv/src/win/process.c)中成功kill设置exit_signal，以及[child_process](https://github.com/nodejs/node/blob/v24.21.0/lib/internal/child_process.js)在signal存在时上报null code／signal；不把底层TerminateProcess的退出值1当成JS code。Linux真实controller／受控进程和管道已覆盖EOF0、20–23、controller升级SIGTERM、未请求信号、提前exit0及错误，Windows同一回归已注册但尚未在本次提交运行；它仍需验证真实Windows映射，不能用源码或Linux结果替代。

sample-A／sample-B、retire-A、end-file及owned-exit失败统一保留`stageError`：小型固定reason名单区分快照不可用、A／B颜色不符、旧请求未退休、诊断残留pixels、结束后仍有快照、load归属失败和end-file超时；固定controller／探针code和请求state另投影。未知消息仅保留SHA256，不输出原始路径、URL、媒体标识或Token；原cause仍保留在进程内。handshake已保存的有界启动证据继续附在evidence中，后续错误不再全部退化为details:null／generic。该诊断不放宽采样、颜色、退休、EOF、退出或包完整性门禁。

## 解包后的最小 Windows 复验

先核对 artifact 的 sourceCommit 与 ZIP SHA-256，再将 ZIP 解到新的普通目录。保留现用正式安装；不导入已有 profile，不预置账户。下列父目录先手动建好，传入的 profile／output 子目录必须不存在且位于 bundle 外：

```powershell
# 单独执行包内自检（不启动完整客户端）
$previewCommit = (Get-Content -Raw .\native-preview-trial.json | ConvertFrom-Json).sourceCommit
$priorNode = $env:ELECTRON_RUN_AS_NODE
$env:ELECTRON_RUN_AS_NODE = '1'
$selfcheckArgs = @(('"' + (Join-Path $PWD 'trial/verify.cjs') + '"'), $previewCommit)
try {
    $check = Start-Process -FilePath (Join-Path $PWD 'x64/electron/electron.exe') -ArgumentList $selfcheckArgs -Wait -PassThru -NoNewWindow
    if ($check.ExitCode -ne 0) { throw 'Trial selfcheck failed.' }
} finally { $env:ELECTRON_RUN_AS_NODE = $priorNode }
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

## 隐藏窗口退出生命周期回归

`tools/windows-native-exit-probe.cjs`接受固定Electron路径、适配器源码绝对路径及全新输出目录。Node控制进程确认真实child close／exit0，再验证报告中的六个场景、固定44.4.2、适配器SHA和独立scope。Electron创建show:false／focusable:false／skipTaskbar窗口，独立临时profile，不加载产品页面、媒体或账户；真实Window／WebContents／nativeImage验证closed后的原生对象边界。SMTC、DWM、capture、capture-visibility和IPC sender认证使用明确测试替身，因此不是真实WinRT或DWM效果验收。对已销毁窗口再次读取webContents应抛错，但产品dispose须完成监听、thumbnail与SMTC释放，并等待晚到请求。

```powershell
# 精确源码checkout，使用已验证的固定Electron44.4.2；输出目录必须不存在。
node .	ools\windows-native-exit-probe.cjs C:\ETE-Probe\electron44\electron.exe C:\ETE-Probe\source\src\electronapp\enhanced\windows-native-media.js C:\ETE-Probeuns\exit-001
```

完整trial和native_helper_only都在生产owner前执行该回归。输出仅含受控fixture报告及其stdout／stderr／process记录，profile位于系统临时目录而非artifact树；不能从脚本存在、合成harness或Linux启动失败推断Windows结果。真实用户复验仍包括播放中退出、Stop后退出与捕获pending退出，确认没有JS弹窗且所属helper实际结束。

当前画面阶梯变化的源码原因是1000ms捕获timer／950ms冷却，已有帧且2.5秒无DWM请求时暂停刷新，隐藏／最小化不捕获。只有视频像素且最大160×90，不合成字幕／OSD。低成本改善应先测hover首次请求延迟与暂停时重复采集；提高持续频率会增加libmpv screenshot／读回与CPU缩放开销，160×90只约束输出而非原始读回成本。没有CPU／GPU实测，不能声称代价可忽略；本次不改刷新率、分辨率或字幕合成。
