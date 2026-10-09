# Known Issues

2026-10-09 当前工程状态：产品仍为已发布的 v0.2.5/3ab10c9。发布时旧 runner 的 timeout / NOT_PASS 保留在 [发布记录](RELEASE_025.md)。新 runner 工具修正后，固定产品的隐藏矩阵为4 PASS / 1 FAIL，整体仍FAIL；全量580/580及后续Stop专项3/3通过。准确证据见 [runner记录](RUNNER_DETERMINISM.md)，诊断通过不自动关闭产品问题。

## 2026-10-09 — 两项待修产品异步身份问题

- **P1，CONFIRMED_LOCAL_BEHAVIOR：旧PlaybackInfo可再次调用播放器。** 同一待切入B的playOptions被两次Next复用，第二请求原地覆盖ID，旧请求守卫误过；miss场景在第二Next完成后释放旧响应，观察到额外embedded.play和重复Playing报告。这是共同PlaybackInfo阶段问题，不限于CD2 miss；hit/direct在更后面的CD2门槛通过不能排除它。
- **P1，CONFIRMED_LOCAL_BEHAVIOR：pending Stop报告缺少身份。** B尚未Playing即被替换时，Stopped中PlaySessionId=null且MediaSourceId缺失；新矩阵五轮和旧成功样本均存在。真实Emby处理及会话影响仍NOT_VERIFIED，不视为已接受的无害行为。
- 后续需分别固定不可共享改写的请求身份、定义pending清理与真实播放会话报告的归属，再做受限产品修复与新runtime验证。本轮只修测试工具，保留失败断言，未修改产品或重发安装包。


## 2026-10-09 — 设置页一致性修正通过用户验收

0.2.4/03a2e3b的三页左对齐、动态原生控件样式与重复标题修正，用户测试后明确反馈“可以了，我测过了”，记为 `USER ACCEPTANCE PASS / CLOSED WITH MONITORING`。本次只关闭此UI问题，未扩展到系统安装或其它专项；见[0.2.4验收记录](SETTINGS_UI_024_ACCEPTANCE.md)。

2026-10-08统一候选历史证据：`cc603ba`已补齐核心Settings、窗口、连续切集与Stop隔离回归；后续已由v0.2.4替代，其旧Release已删除，原tag与证据保留。全屏跨编码Previous为73帧/max107ms，所采无黑/紫/mixed但仍INCONCLUSIVE；窗口跨编码两向通过。旧rapid NextTrack夹具selected=false已与`1e86e51`同条件匹配，未修改断言。证据和专项未覆盖范围见 [统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

本页记录尚需诊断的问题与观察项。`OBSERVED` 表示已见现象，`SUSPECTED` 表示待验证解释，只有证据闭合后才使用 `CONFIRMED`。开发优先级见 [Development Roadmap](ROADMAP.md)。

## 2026-10-08 当前候选验收

### 全屏顶部细条

- 状态：`HUMAN-ASSISTED VISUAL PASS / USER_REPORTED_RESOLVED`。
- 用户在本会话候选交付后手动验证并明确反馈“现在没有那个条了”；对应本会话交付候选为 `1e86e51`，入口 `dist/fullscreen-state-final/Emby.Theater.exe`。
- 本机合成对照中，video carrier原生窗口框产生顶部两行灰色像素；carrier配置调整后恢复为视频色，renderer对应像素不变。用户视觉反馈与该证据分别保留。
- 范围：顶部细条已在本次用户所测场景消失；全屏窗口交互、最小化恢复、播放中进出全屏和最终切集/Stop仍按各自证据记录，见 [验收记录](FULLSCREEN_WINDOW_STATE.md)。

### 全屏缩放后状态脱节

- 状态：`FIXED IN LOCAL CANDIDATE / UNIFIED SYNTHETIC INTERACTION VERIFIED`。
- 旧候选实测拖动后bounds由2560x1440变为y=170、2560x1270，只出现resize/move，renderer仍为Fullscreen。
- `1e86e51` 增加全屏交互锁、原窗口状态恢复与几何失配退出；11项窗口状态回归通过。早期最终复测曾中断，后续统一候选已补齐边缘拖动、恢复尺寸、普通缩放、重复全屏、最小化恢复、关闭保存与播放切换，见[统一候选验收](UNIFIED_CANDIDATE_ACCEPTANCE.md)。

## Observe

### NextTrack 切集时视频区域瞬时白屏

- 状态：`USER_REPORTED_RESOLVED / MONITORING`。2026-10-08用户已反馈当前还原候选上一集/下一集问题基本解决；以下白屏描述为历史现象。
- 复现：播放过程中点击下一集。
- `OBSERVED`：视频区域变为全白，Emby UI / OSD 仍存在；等待后下一集自行正常播放，无需重试。
- 用户影响：切集过渡有明显视觉缺陷，播放可自动恢复。
- 当前证据：用户的真实播放观察；尚未定位暴露白色背景的具体 window / surface。
- 下一步：保持已验证呈现实现并观察；出现新的具体样本时再定位。全屏窗口修复未改变该实现。
- 区别：不是 Seek 或 Stop / Exit 的 transient black frame，也不是 rapid NextTrack `selected=false` 的既有夹具限制。

## Deferred

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
- 当前工程：P1 本地候选已增加有限错误类别和包内调用位置 observer，详见[诊断 contract](P1_DIAGNOSTICS_CONTRACT.md)。下一步在新样本出现时按脱敏位置定位；任意消息和原始 stack 不保存。
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
