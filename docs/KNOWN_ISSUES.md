# Known Issues

本页记录尚需诊断的问题与观察项。`OBSERVED` 表示已见现象，`SUSPECTED` 表示待验证解释，只有证据闭合后才使用 `CONFIRMED`。开发优先级见 [Development Roadmap](ROADMAP.md)。

## Reproducible

### NextTrack 切集时视频区域瞬时白屏

- 状态：`REPRODUCIBLE / USER-VISIBLE / NON-FATAL / SELF-RECOVERING`；按当前用户观察，播放中点击下一集的复现率为 100%。
- 复现：播放过程中点击下一集。
- `OBSERVED`：视频区域变为全白，Emby UI / OSD 仍存在；等待后下一集自行正常播放，无需重试。
- 用户影响：切集过渡有明显视觉缺陷，播放可自动恢复。
- 当前证据：用户的真实播放观察；尚未定位暴露白色背景的具体 window / surface。
- 下一步：沿 previous video teardown、播放面生命周期、next source resolve、helper / `loadfile`、first frame 取证，先确认白色背景来源。
- 区别：不是 Seek 或 Stop / Exit 的 transient black frame，也不是 rapid NextTrack `selected=false` 的既有夹具限制。

### 播放开始后 Fullscreen 圆角出现

- 状态：`REPRODUCIBLE / DEFERRED`。
- 复现：未播放时在 windowed 与 fullscreen 间切换，再开始播放并观察 fullscreen 窗口边角。
- `OBSERVED`：未播放时 windowed 有圆角、fullscreen 为直角；开始播放后 fullscreen 错误出现圆角。
- 用户影响：fullscreen 视觉状态不一致；当前没有播放中断证据。
- `SUSPECTED`：playback surface 的 top-level window 与 mainWindow fullscreen 状态的 DWM corner 同步可能不一致；根因尚未证实。
- 下一步：分别识别 mainWindow 与播放面的窗口、状态和 DWM corner policy；目标为 windowed 圆角、fullscreen 直角，播放面跟随 mainWindow。
- 区别：这是播放开始后的圆角状态问题，不等同于 `v0.2.2` 已修复的视频冻结。

## Observe

### Seek transient black frame

- 状态：`OBSERVE`；旧版本有观察，近期 `v0.2.2` 用户前台验收未稳定复现。
- 用户影响：若再现，会造成 Seek 时短暂黑帧；目前无法确认当前版本频率。
- 下一步：出现新样本时记录版本、媒体、操作时序和播放面证据，再判断是否进入修复。
- 区别：画面为黑色，发生在 Seek；与 NextTrack 白屏分开记录。

### Stop / Exit transient black frame

- 状态：`OBSERVE`；旧版本有观察，近期 `v0.2.2` 用户前台验收未稳定复现。
- 用户影响：若再现，会造成 Stop 或退出时短暂黑帧；目前无法确认当前版本频率。
- 下一步：有新样本时区分 Stop 与正常 Exit，记录窗口和播放面时序。
- 区别：发生在 Stop / Exit，不是切集后自动恢复的白屏。

### rapid NextTrack `selected=false`

- 状态：`BASELINE-MATCHED LIMITATION / OBSERVE`。
- `OBSERVED`：formal ordinary / CD2 miss 的 rapid NextTrack 夹具出现 `selected=false`；Electron 18 基线也有相同结果，相邻播放、控制、报告断言通过。
- 用户影响：该夹具结果本身尚不能证明当前 source 的真实用户回归。
- 下一步：只有新证据与基线断言向量不同，才重新定位客户端链路。
- 区别：它是夹具断言限制，不解释真实用户的 NextTrack 白屏。

### transport `stdout-end` stress

- 状态：`HARNESS / ENVIRONMENT GAP`。
- `OBSERVED`：同一 stress 在 Electron 18、旧 Electron 44 candidate 和 `v0.2.2` candidate 均复现。
- 用户影响：限制该 stress gate 的解释力；现有证据不能把它归为当前 source 回归。
- 下一步：需要独立、可复核的差异证据后再调查；不要仅为使夹具变绿改写 Native Helper。
- 区别：transport stress 与用户可见白屏或黑帧没有已证实的因果关系。

### Renderer `ReferenceError`

- 状态：`OBSERVE / NON-BLOCKING FOLLOW-UP`。
- `OBSERVED`：历史 focused real run 记录到 renderer `ReferenceError` event；未伴随 unhandled rejection、bridge / helper / Electron crash 或播放副作用，message / stack 缺失。
- 用户影响：现有证据未显示直接播放影响；缺少定位信息。
- 下一步：增加有界、脱敏的 message / stack observer，再按新证据分流。
- 区别：不将无堆栈事件直接归因于 NextTrack 白屏。

### Concurrent Remote NextTrack

- 状态：`OBSERVE / OUTSIDE ESTABLISHED CLIENT CONTRACT`。
- `OBSERVED`：历史 focused real run 中，立即并发的两个远程命令 HTTP fulfilled，但对应 WebSocket `NextTrack` delivery 为 `0/2`；普通单次远程 NextTrack 通过。
- 用户影响：并发远程命令语义尚未建立；当前没有客户端播放缺陷的直接证据。
- 下一步：若产品需要该并发语义，先取得服务器到 WebSocket 的端到端证据。
- 区别：与本页点击下一集时出现的白屏分别追踪。

### Ordinary real media coverage

- 状态：`N/A — ENVIRONMENTALLY UNAVAILABLE`；当前真实媒体库未提供普通文件样本。
- 用户影响：无法用该环境为 ordinary real media 单独取得实服验收证据。
- 当前证据：formal ordinary pipeline 与真实 STRM 生命周期已有各自记录，不能互相替代。
- 下一步：出现合适的普通文件样本时单独验收并更新 [测试记录](TESTING.md)。
- 区别：这是样本覆盖缺口，不是已确认的 ordinary playback 故障。

## Evidence-gated

### CD2 Path Hydration

- 状态：`EVIDENCE-GATED / DEFERRED`；等待真实 `FindFileByPath=not_found` 样本。
- 可复现性：当前发布基线没有足以确认该场景的真实样本与前后对照。
- 用户影响：若确认为目录尚未物化导致的 false negative，可能让可用 CD2 源暂时走既有 Mount / Native fallback；发生率未知。
- 当前证据：历史研究提出目录可见性假设，但不能据此确认当前故障。
- 下一步：先采集真实目标路径的脱敏、有限时序和人工浏览前后对照，再决定是否设计有界恢复。
- 区别：`not_found` 可见性问题不能与 timeout、transport、鉴权、DirectUrl、libmpv 或 Session 故障混同。
