# 播放呈现还原

2026-10-08统一候选更新：`cc603ba`保留本文`6473ecb`原生持帧实现，并包含全屏修复与Settings。新隔离回归完成10次窗口/全屏切换、快速Next→Stop和终止Stop；H.264/H.265窗口两向各78帧、max49/52ms，所采无异常颜色；全屏Next77帧/max43ms通过，Previous73帧/max107ms保持INCONCLUSIVE。当前测试包及新证据统一见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)，下文旧路径与历史结论保留原归属。

2026-10-07（UTC+8），用户授权自行完成“还原表现”。目标保持 Electron 44，按升级前实际播放行为还原前后切集；窗口与全屏分别验收。原有队列、Session、Resolver、媒体身份和个人配置不变。现有 Settings 候选与本工作树分开，原工作区已有文档不覆盖。

本文所有 `dist/`、`.work/` 与源码相对路径均以 managed worktree `ete-night-nexttrack` 的项目根目录为基准；原工作区文档副本供集中阅读。

## 当前阶段

`LOCAL CANDIDATE READY / WINDOWED SYNTHETIC VERIFIED / FULLSCREEN INCONCLUSIVE / USER ACCEPTANCE PENDING`。当前交付 runtime 为 `dist/presentation-restore-6473ecb/`，源码 `6473ecb046b0621ca79282e0c0ed250e3848f2c5`，包含旧 token Stop 与较新 epoch retirement 的最终修正。Electron 44.4.2、原队列/Session/Resolver 保持；前后切集在 native 内存中保留旧画面，由新 generation 的一次性截图/合成栅栏撤下。没有把 `core-playing` 当成已显示新帧。

## 2026-10-08 交付与验收边界

程序入口为该 runtime 的 `Emby.Theater.exe`；构建、三层来源核对及 `package.ps1 -VerifyOnly` 均通过，payload 为 2140 个文件。默认 Helper SHA256 `28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`，libmpv 和 Electron 输入未升级。测试使用独立 profile、假服务、软件解码的合成媒体；没有安装、发布或触碰真实服务器。Settings 已验收候选仍独立。

最终全量 `npm test 401/401 PASS`；新fixture输入工具首轮单参校验失败已修正，完整复跑日志为 `.work/acceptance-20261007/presentation-6473ecb-final-tests-verified.log`。代码实现与自动化交付完成；画面衔接验收不等于旧版加载耗时完全一致，真实媒体与全屏短闪仍按下面边界保留。

| 证据层 | 当前结果 | 相对证据目录 |
|---|---|---|
| 完整候选窗口，H.264 720p/24fps+AAC ↔ H.265 1080p/60fps+AAC | Next/Previous 各81帧，最大间隔59/44ms；黑/紫/mixed均0，只有旧/新视频；正确选集、DOM海报未插入 | `.work/transition-compare-restore-codec-window-1baea6280f404ad19ad83264b8fe9f3b` |
| 同一候选全屏、同一媒体 | 66/48帧，最大间隔164/163ms；观察到的黑/紫/mixed均0、正确新视频；连续短闪结论仍INCONCLUSIVE | `.work/transition-compare-restore-codec-fullscreen-1b48e60c3ac24a6680a695cd7ad69dbc` |
| 原生生命周期七项 | 过时hold/release、seek不重复揭开、挂起HTTP取消、新旧prepare精确取消、缺失媒体和15秒未加载目标清理均通过；失败清理后实际屏幕为已停止视频黑色，bytes=0 | `.work/native-frame-boundaries-deadline-d9071c21a62d4a35ace237d13c7079c8` |
| Renderer/main定向回归 | controller 11项、service 26项、Endpoint与libmpv生命周期测试通过；包含准备中Stop、B→C和prepare失败 | `tests/nexttrack-native-transition.test.cjs`、`tests/native-helper-service.test.cjs`、`tests/native-helper-client.test.cjs`、`tests/native-helper-lifecycle.test.cjs` |

两次最终codec运行的7个owned进程均自行退出、残留0、身份冲突0；媒体输入SHA与工具SHA运行前后不变。七项原生边界使用同CPP的Testing helper，产品API另检查最小响应字段。HTTP旧请求被mpv主动取消，不能把这项说成已交付迟到body。全屏缺口集中在静态旧画面阶段，同色/hash端点不能证明期间没有极短闪烁。此前5ddeea8的Y4M窗口83/83帧、30/27ms结果保留为上一构建证据，不冒充当前revision。

后续验收：用当前入口在原问题媒体上确认窗口及全屏的Next/Previous、连续切集、停止返回；真实Emby/CD2、硬件解码、HDR、多显示器和全屏顶部细条仍独立。窗口合成媒体的通过没有关闭用户对旧88f56b7的视觉失败；新的用户观感结论等待记录。PR、合并与发布另行授权。

## 2026-10-08 阶段历史

隔离的 retired-control 窗口 probe 在两向准备窗口均采到 76 帧，最大间隔 53/61ms，black/purple/mixed 均为 0；真实 Stop 为 11ms，清理完整。证据位于 `.work/native-frame-retired-auto-window-f3d65a92d92d4699966de0eb909af25e`。这是停止前控制准备窗口的像素基线，不等于产品切集已恢复。

旧 Testing runtime `269bdcc` 的 native boundary probe 中，case 1–4 通过；T 的本地 HTTP gate 连接被 MPV 主动取消，因此 `lateBodyDelivered=false`，该次运行没有验证迟到 body 到达后对 C 的影响。case 5 在失败文件已触发 end-file 后仍观察到 auto lease `armed` 且 held frame 保留 `4,677,120` bytes，历史失败证据保留于 `.work/native-frame-boundaries-window-8709a44aaec24a11bbc8eda4c3e42b20`。

后续 Testing-only CPP `a2cf6af`，SHA256 `de43f1301f208106fd18291bef0690c2cb20f388dd7f7d4b737c99679ca15378`，六项窗口边界实跑通过，证据位于 `.work/native-frame-boundaries-fixed-window-b997f8307ce9428ab6812c1d6c4e8376`。缺失媒体 end-file 后 auto state 为 `unavailable`、active=false、bytes=0；production API 响应字段检查仅见 `ready/status/holdId/painted`，并验证 control-generation 取消不会影响新 hold、cancel-before-delayed-prepare 不会复活 hold。未在默认 Helper 上实跑 test alias 拒绝。T HTTP 请求仍被 MPV 主动取消，迟到 body 分支未实测；这项结果只说明取消分支下新 generation 保持独立。

在生产接入阶段实现窄范围的 presentation prepare/arm/release，保持同步 manager 与 retire-before-await，图像只留在 native。该阶段 controller 定向11/11、全量395/395，不含之后追加的lifecycle与fixture输入测试；最终构建和像素结果见上方交付表。

正式 runtime `presentation-restore-5ddeea8`（source commit prefix `5ddeea8`，ordinary Helper SHA256 prefix `28054c`）build 与 provenance 通过。窗口实际 manager Next/Previous 各 83 帧，最大间隔 30/27ms，black/purple/mixed 均为 0；当前队列选择正确，DOM overlay 未插入，cleanup 7 个 owned process exit、residual 0。证据 `.work/transition-compare-native-presentation-window-0f98061e6d35476c98df8d2179b823f1`。全屏各 55 帧，最大间隔 165/164ms，样本颜色只有目标新视频，但采样间隔不足以排除短闪，仍为 `INCONCLUSIVE`；cleanup 8 个退出、residual 0，证据 `.work/transition-compare-native-presentation-fullscreen-200d5d422f8941019a0382a0c5d43d11`。

5ddeea8构建后复核修复旧token Stop-to-C与高epoch retire/in-flight begin；修正已进入6473ecb正式构建，5ddeea8仅保留阶段对照。

| 对照 | 来源提交 | 本地历史构建名 |
|---|---|---|
| Pepper / Electron 18 | `73eac9fa64c43804e9c5c53690ed087b2c5bb077` | `EmbyTheaterEnhanced-0.1.1-release-73eac9f` |
| Native Helper / Electron 18 | `569c8dfbcd18725bf41a323c49cdfa4d38c8fa6b` | `EmbyTheaterEnhanced-0.2.0-release-569c8df` |
| Native Helper / Electron 44 | `725d4c2284596b8ced749a3c8590180a1e6ed1a9` | `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate` |
| 历史切集观察工具输入 | `456df8e756b1203f69ca8d40434196a719761f03` | `track-visual-diagnostic` |

对照使用一致的合成 A/B 视频与 localhost 图像，不登录真实服务器。版本间 source/Helper 有其它差异，因此历史矩阵先定位阶段，不能单独证明 Electron 因果；需要时再缩小为同源码的单变量对照。旧 runtime 只读，工具通过独立入口注入。

## 观察合同

- 每次使用独立 profile、APPDATA、MPV_HOME；精确 runtime/source 身份先验证再运行。
- 同显示器、同窗口区域连续采样合成桌面，仅保留 ROI 颜色和帧哈希；无音频、无整屏录像。
- 先确实看到红 A，再执行 Next；确实看到绿 B，才执行 Previous。缺少前置像素时标 `OBSERVATION_BLOCKED / INCONCLUSIVE`，后续动作 `NOT_RUN`。
- `core-playing`、时间进度和 surface visible 仅作事件时间戳，不等价于呈现完成。
- 图片/背景、旧/新视频、黑色与透明空档按实际样本判断；未采到短黑不等于证明没有短黑。
- 保留默认正式测试的运行时验证；历史比较使用显式入口，不使正式验证接受任意旧 Electron。

## 初始证据

当前源码 `4f8a7f9` 的工具、`456df8e` runtime，窗口/图片延迟 0ms，本轮 fresh run 的 initialA 红、beforePrevious 绿均已观察到。Next 66 帧、Previous 69 帧，最大采样间隔各 50ms；紫色海报分别 19/21 帧，目标视频分别 46/46 帧，本次黑色为 0。此前失败的初始红色前置不是必现，未据此修改 GPU、激活、播放或采样架构。该记录是合成基线，不是真实媒体通过。

### 历史窗口对照（原 rVFC 观察器）

| 版本 | Next | Previous | 限制 |
|---|---|---|---|
| Pepper/E18 | 红 10 帧 → 绿 88 帧，新画首见 219ms | 绿 9 帧 → 红 89 帧，新画首见 189ms | 各 98 样本、最大间隔 34ms；黑/紫/mixed 均 0；进程清理通过 |
| Helper/E18 | 红 8 → mixed 11（203–387ms）→ 绿 75 | 绿 4 → mixed 12（153–402ms）→ 红 77 | 播放与像素观察成功；runner 有 2 个 ownership mismatch 计数，已记录进程均退出，计数原因待查 |
| Helper/E44 | 红 5 → mixed 9 → 绿 54 | 绿 7 → mixed 11 → 红 64 | 同样是播放/像素观察成功，runner 的 2 个 ownership mismatch 独立待查 |

此三组将差异定位到 Helper 迁移阶段之前/之后，尚不把 mixed 自动命名为桌面曝光。下一步在相同版本中进行只抑制 stop 隐藏的明确 test-only 单变量实验，单独标 `experimentalPresentation`；不能将实验视为已修改产品。

### 全屏与采样修正

当前 E44 窗口收到 `enter-full-screen`，renderer `document.windowState=Fullscreen`，bounds 精确覆盖显示器，但 `isFullScreen()` 为 false。工具保留四个独立值，并要求事件、renderer 状态与显示器 bounds 同时吻合才认可该全屏模式；生产窗口逻辑未改。

rVFC 全屏采样的新增诊断显示 document.visibilityState=hidden、focus/geometry stable=true、最后一帧过期 2356ms。这确认观察器会受被观察透明 renderer 绘制节奏影响。工具改用 `MediaStreamTrackProcessor` 消费桌面 stream VideoFrame，每帧关闭，保留原 ROI/focus/窗口/时间窗约束，并取消测试动作前的 rAF 等待。首轮全屏已取得真实红/绿前置与两次视频切换样本，但最大间隔 125/107ms 超过现有 100ms 门槛，仍记 INCONCLUSIVE。继续通过限制流分辨率减轻采样开销，不放宽门槛。

### 精简视频流与全屏复核

1280x720 stream 保持相同归一化 ROI、96x54 统计与 100ms 最大间隔门槛。三套历史 runtime 的全屏 getStats 均实际报告 `current-vo=gpu-next`，不是旧版走另一种默认 VO 导致的对比偏差。

| 全屏基线 | Next / Previous 样本数 | 最大间隔 | 中间画面 |
|---|---|---|---|
| Pepper/E18 | 115 / 115 | 24 / 22ms | 只有旧/新视频色，黑/紫/mixed 均 0 |
| Helper/E18 | 111 / 112 | 37 / 45ms | mixed 13 / 15 帧 |
| Helper/E44 | 61 / 59 | 77 / 93ms | mixed 4 / 4 帧 |

新 runner 记录 harness 五文件及 runner 本身 SHA256，并运行后核对未改变。CIM 返回路径暂时不可读与真实 PID/创建身份不符已分别处理；使用启动句柄、创建时间和父子关系交叉核验，未按名称清理。后续三组 owned residual=0，真实 ownership mismatch=0；旧两组报告保留，不覆盖历史。

### 只保留视频窗口的单变量实验

同一个 `725d4c2` runtime，默认控制组窗口 Next/Previous 分别 84/85 帧、最大间隔 25/26ms，mixed 8/11。实验仅在 `command stop` 调用期间抑制 surface hide，原始 mpv stop 与 generation 流程照常执行，并明确标 `experimentalPresentation=true`。

结果为 mixed 降至 0，但 Next/Previous 各出现 11 帧黑色；采样 82/83 帧、最大间隔 27/42ms。进程 9 个全部退出、残留 0。这说明保留 carrier 能消除该中间内容，但不能恢复旧版保留画面直至新画面的表现。没有将其实施为产品修复。下一步需验证视频输出层保留已显示帧的能力，保持真正的 Stop/retire/Session 顺序，不能把透明改成黑屏便宣告完成。

工具验证：完整 `npm test 362/362 PASS`，包括旧 runtime 参数/来源/隔离/进程身份、严格红/绿前置、帧流资源释放及窗口边界。产品源码仍未更改；该数字不是还原目标的完成状态。

## 待完成

- [x] 旧 Pepper、Helper/E18、Helper/E44 的窗口与全屏对照。
- [x] Testing-only 原生持帧截图、真实 Stop、显式释放与窗口/全屏合成颜色能力检查；全屏连续流长间隔仍为 `INCONCLUSIVE`。
- [x] 同CPP Testing helper七项生命周期边界；保留269bdcc历史失败，HTTP取消与迟到body严格分开。
- [x] 生产接入及临时/终止Stop、B→C和过期token/epoch隔离回归。
- [x] 6473ecb正式build/provenance/package与窗口/全屏跨编码对照。
- [ ] 全屏连续短闪与真实媒体用户观感验收；顶部细条仍独立跟踪。
- [ ] 获授权后的集成/发布；本候选不等于已发布。

## Testing 支路的原生能力入口

`ETE_HELPER_TESTING` 内新增 `test-frame-hold/status/release`，不向 renderer service IPC 开放。hold 仅允许未退休且唯一打开媒体属于请求 generation，使用 libmpv `screenshot-raw window bgr0`，64 MiB/8192 尺寸上限、正 stride 验证并私有复制；负 stride 本阶段返回 unavailable。数据不出 native、不落盘，回包仅尺寸、耗时、均色、哈希、holdId 与 painted 状态。release 精确匹配 holdId；Stop 本身照旧，能力 probe 用显式 release 验证持帧。

测试专用 sibling child 属于既有 video host，由 surfaceThread 管理、绘制和销毁；paint ACK 最多等待 250ms，失败撤回新 hold。`painted` 只表示 WM_PAINT 完成，尚没有新视频帧的呈现 ACK或自动撤下策略。纯编译验证默认/Testing 均通过；默认 SHA256 为 `6f4d9c1459149c5a6325ebfc8dfe874b2d565c85fb9049053ce88ab47f6fef34`，与旧 production Helper 字节一致。实际窗口效果和截图耗时仍待独立 probe，不能据编译完成宣称还原。

### 2026-10-08 — 首次实际原生能力结果

CPP 能力入口已本地提交 `97fb2d4`，正式 `build-native-helper.ps1 -Testing` 绑定该 HEAD，Testing binary SHA256 为 `5336830532c1aa183a385d1638f221609aaba10ba2bbe3824ca573cca23367be`。独立 harness 在真实 Chromium/MPV 上完成初始红视频前置与截图：1440x812、4,677,120 bytes、capture 65ms、请求往返 74ms，snapshot 均色为红，WM_PAINT 回包成功。

正常 `client.stop()` 用时 14ms并完成原始 Stop request，但合成屏幕 ROI 随后为 fresh 纯黑（帧龄 16ms）；2 秒中采到红 5 帧、黑 71 帧。观测器稳定且 visible，排除了“静态持帧没有新采集帧”的假失败。该记录为明确的能力失败，正在增加已知父/子窗口的无 HWND 状态以核查层级/可见性/尺寸，尚未采用任何产品改动。测试后 reader/handler/helper/host 均清理完成。

此前独立 harness 的 Electron 入口识别、窗口 startup show 与 data URL 采集上下文问题已分别修正；不把这些启动失败归入 native 持帧效果。当前 harness 使用隔离 file 文档、显式可见启动，并在失败时保留部分采样与 safe 状态，仍仅处理合成媒体。

进一步查询确认 hold 前、Stop 后立即及 300ms 后，host/frame/video 都存在且可见，父级一致，frame sibling 位于 video 之上，client 尺寸均为1440x812；副本为红而合成图仍为纯黑。下一项单变量 Testing 实验仅把测试 child 设为 layered 并使用不透明 alpha 的绘制重定向，保持视频 child、host、Stop、窗口次序与GDI像素不变。依据为微软 [Window Features](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features) 的 child layered 支持说明；该 API 文档不是本组合的成功证据。默认编译字节仍与生产相同，等待同条件实际像素结果。

### Layered 子窗口的实测结果

`8c33096` 的正式 Testing build，窗口模式完成两方向能力检查：Stop仍为真实命令，旧画面持续显示，显式释放后为新视频；Next/Previous各80帧，最大间隔43/42ms，黑/紫/mixed均0。截图64/43ms，持帧在native内存、释放后bytes=0，所有进程/stream清理完成。

全屏3840x2160下截图94/96ms、每帧33,177,600 bytes。静止持帧时采集流可能不发送重复帧，因此仅在已知静态阶段增加一次精确display/ROI的新截图，前后窗口/显示器边界不变；内存红色PNG校准识别RGBA/BGRA通道，不假定平台格式，不保存图像。静态点分别确认为旧红/旧绿，显式释放后fresh stream确认新绿/新红。连续流因静止长间隔仍标INCONCLUSIVE，不以静态点否认瞬时黑帧。

### 自动衔接候选（Testing-only 基线）

新增 `test-frame-arm-next` 绑定已activate、尚未load的新generation和已有holdId。新文件完成媒体映射/FILE_LOADED后，只消费一次PLAYBACK_RESTART，异步请求mpv窗口图；成功解析新帧后，UI消息以generation/holdId授权前后复核，执行一次DwmFlush后尝试撤下旧frame。新图像只生成metadata后释放，未跨IPC传图。取消/替换/退休撤销旧授权；初始恢复播放的seek不被误当作禁止项，已消费后的seek不会重新触发。

该路径没有固定200ms延迟，但PLAYBACK_RESTART、截图成功、DwmFlush都不称为present ACK；没有媒体ID的restart事件仍存在极端归属限制，必须由已知fixture与独立屏幕边界实测判定。`--auto-release` harness明确区分此候选与旧的手动能力步骤。`269bdcc` 是 Testing-only 能力基线，不是正式修复或当前 production runtime。

### 自动候选的基础矩阵

`269bdcc` 正式 Testing build 已运行：窗口 Y4M、全屏 Y4M，以及窗口 H.264 720p/24fps+AAC → H.265 1080p/60fps+AAC 两方向均得到严格匹配的 generation/holdId、有效的新帧 metadata、自动释放后bytes=0和正确的新视频颜色。全程没有固定200ms或手动release。

跨编码窗口样本77/76帧，最大间隔55/72ms，只有旧/新视频色，黑/紫/mixed均0。原始Y4M窗口Next因128ms采样间隔仍INCONCLUSIVE，Previous满足间隔门槛；全屏持续持帧阶段长间隔仍保留INCONCLUSIVE，静态点与释放后新视频已分别确认。三轮清理均完成。这是进入生命周期边界检查的依据；生产接入另行实施并仍待验证。

## 生产接入 contract

边界补充：`.work/native-frame-boundaries-deadline-d9071c21a62d4a35ace237d13c7079c8` 在同一 `a2cf6af` Testing helper 上完成七项检查。缺失媒体和 15 秒未加载目标均已清除持帧，并通过 fresh screen ROI 确认撤下后为空视频黑色；deadline 实测 15028ms，资源清理完整。该失败恢复中的黑色不是正常切集短黑。main 收口旧 token Stop 的 no-op（包括 C 已激活的情况）和较新 renderer epoch 对尚未回包 begin 的退休权限；相关 service 行为测试 26/26 通过。

以下边界已进入6473ecb本地生产候选；代码、原生实验、完整runtime和用户视觉验收仍按独立层次记录。

- 继续使用原manager的同步Next/Previous调用与请求sequence；视觉controller不再操作海报DOM，而是拥有native presentation token。原来的临时stop与真正destroy区分不变。
- `invalidatePlayRequest` 仍同步执行在任何视觉等待之前。准备旧帧属于限定于已有视频窗口的presentation控制操作，不能恢复旧媒体generation，也不能发起旧source播放/查询服务器。
- main持有最后请求显示的generation、endpoint/helper实例、presentation epoch/token和holdId。只允许当前显示的视频场景准备；过时响应只可清理自己持有的hold，不能隐藏新视频或其它helper的同号hold。
- native准备时优先复用已经显示的暂存帧，保证快速跳过中间条目时不会把未显示的中间视频抓出来展示；没有暂存帧时，当前窗口媒体映射必须匹配main指定的源generation。像素始终留在native。
- 当前token确实取得hold后，临时stop保留surface并执行原mpv stop；其它stop、destroy、退出和helper失败沿终止清理流程。新generation必须在load之前绑定自动揭开；迟到的旧failure/capture不能改变新generation的surface。
- 截图、绘制、自动揭开失败必须fail-open释放视觉遮挡，不能把旧画面永远盖在已经播放的新视频上。当前prototype保留旧帧供诊断的策略不得原样进入产品。
- Testing helper七项边界通过；生产controller/Endpoint/main/player定向测试覆盖取消、旧响应、快速切换与终止，真实服务器、HDR和用户观感不由这些单测代替。版本升级/发布/安装仍独立。
