# 播放呈现还原

2026-10-07（UTC+8），用户授权自行完成“还原表现”。目标保持 Electron 44，按升级前实际播放行为还原前后切集；窗口与全屏分别验收。原有队列、Session、Resolver、媒体身份和个人配置不变。现有 Settings 候选与本工作树分开，原工作区已有文档不覆盖。

## 当前阶段

`BASELINE COMPARISON IN PROGRESS`。尚未修改生产源码；先取得旧版的合成画面。已有未通过的 NextTrack 用户验收保持有效，不由自动化逻辑 PASS 替代。

| 对照 | 来源提交 | 本地历史构建名 |
|---|---|---|
| Pepper / Electron 18 | `73eac9fa64c43804e9c5c53690ed087b2c5bb077` | `EmbyTheaterEnhanced-0.1.1-release-73eac9f` |
| Native Helper / Electron 18 | `569c8dfbcd18725bf41a323c49cdfa4d38c8fa6b` | `EmbyTheaterEnhanced-0.2.0-release-569c8df` |
| Native Helper / Electron 44 | `725d4c2284596b8ced749a3c8590180a1e6ed1a9` | `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate` |
| 当前切集过渡候选 | `456df8e756b1203f69ca8d40434196a719761f03` | `track-visual-diagnostic` |

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

- 旧 Pepper、Helper/E18、Helper/E44 的窗口与全屏对照。
- 依据最早出现的差异设计局部修复，审核临时 stop 与终止 stop、快速切集、失败和取消边界。
- 新源码的单元/集成检查、正式构建与来源验证、同条件可见对照。
- 有真实媒体证据后才关闭用户视觉失败；发布/安装仍独立。
