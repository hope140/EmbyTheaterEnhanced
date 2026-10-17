# v0.3.8 显示兼容范围与合同

## 当前阶段与来源

2026-10-17，当前为 `EVIDENCE_AND_SCOPE_REVIEW`。从已父验夜间文档 HEAD `e2b0eff8de31b51500af7adbf6e9e032cd4b5cb6` 建立独立本地分支 `codex/v038-display`，继承产品来源 `5341f32985aabefa03f789b1428d8dfa2be5ba06` 的菜单、刷新率 P1、诊断标签和 Movie 分块四项修正。本合同尚未批准新的产品实现；版本仍为 0.3.7。准确工作树、原始证据及恢复信息保存在被忽略的 `.work/V038_TASK_STATE.json`。

本轮继续用户已授权、可独立验证的本地工作。真实显示硬件与人工验收缺少条件时单列，不阻塞其他独立工作。新增跨层异步实现先经父会话审核；本合同中的候选细节不自动变成已接受方案。

## 调用图与既有行为

| 环节 | 当前实际入口 | 归属与需要保留的行为 |
| --- | --- | --- |
| Play 前置 | `libmpv.js` 的 `play` → `beginPlayRequest` → `playForRequest` → `displaySync` | 显示查询即使关闭 displaysync 仍执行，用于现有统计；查询后已有当前播放请求检查 |
| 查询与变更 | `getRefreshRateList` / `getRefreshRate` / `setRefreshRate` → POST `electronrefreshrate` | 三个原动作、固定工具路径与合法结果形状保持；现有网络错误拒绝不能被悄悄吞掉 |
| main 工具 | `main.js` 的 `registerFreshRate` | 三种动作均固定 `\\.\DISPLAY1`；P1 已有一次完成、unknown 不启动、spawn/error 空结果收口 |
| FPS | `_onEstimatedVfFpsChanged` | 现有设置、全屏条件与倍率选择；change 后原 3000ms 稳定等待；已有当前请求检查保护 unpause |
| 替换停止 | `stop(false)` | 保留原 Native presentation/stop 与实例；PlaybackManager 的替换停止仍由既有协调器拥有 |
| 终止停止 | `stop(true)` / `destroy` → `destroyInternal` | 先退休播放请求；当前恢复为 `org != cur` 时发出 change，未等待 |
| 应用退出 | AppHost exit → `closeWindow` → `onWindowClose` → `window-all-closed` → `before-quit` | 现有电源、Native/kernel shutdown 与退出 Promise；当前没有刷新率子进程回收或显示恢复合同 |
| 全屏 | `fullscreenmanager` → `appHost.setWindowState` → main 状态处理 | 透明窗口的已有全屏、最小化、恢复与 bounds 检查；不另建窗口状态机 |

终止停止与替换停止的调用依据为现有 `tools/patch-playbackmanager.cjs` 的 terminal completion fence / replacement coordinator；本轮不修改该生成器或 Session 报告归属。

## 已核实证据

### A：无终态的工具与 XHR

真实函数体在 VM 中使用假 child / XHR 复现：child 有 stdout、无 error/close 时保持 pending；三个 XHR helper 无任何事件时保持 pending；`displaySync` 卡在首个 list 请求。经自检的可控调度器实际推进 60000ms，生产函数创建的 deadline timer 为 0。child/error 无 close 已即时完成空结果，重复 close/error 仍只完成一次，不把这两条已修分支重新称为缺陷。

证据共 10 个目标场景与 1 个调度器自检；现有协议回归 16/16。最初仅计数时间的探针不足以证明虚拟时钟，原样保留为 first-attempt；当前结论采用注入计时器和 Date.now 的 v2。没有真实刷新率工具、Electron 协议栈或显示器执行证据。

### B：显示变更与恢复归属

完整 AMD 构造器的可控工具/XHR/endpoint/计时器夹具已复现以下行为；最终v3五个场景、146条trace通过，用现有getStats出口核对两种回包次序。旧v2四个场景、117条trace保留。全部属于合成证据。

| 场景 | Observed | Expected / 修正目标 |
| --- | --- | --- |
| 正常 FPS 对照 | 实际 setProperties 收到 pause:true，工具生效/回包，原 3000ms 后 pause:false | 保留正常恢复播放与原等待；该正例证明假出口确实接入 |
| 并发 FPS | 首个请求未回包时又发出另一 change，两次各自恢复播放。v3：工具按120→60生效、回包60→120时，getStats最终120 Hz而模拟物理60；反向次序时stats60、物理120 | 合并同 owner 的并发工作，使确认值和真实操作顺序一致；旧缓存不能抑制合法的新目标 |
| Stop(true) → Next → 旧 change | Stop 已结束并创建新 endpoint 后，旧工具仍可生效；没有安排恢复。旧 callback 没有向新 endpoint 增加 pause:false | 物理操作不能跨过终止完成边界；保留当前请求 guard 的有效防护 |
| 外部第三值 → destroy | 本轮先由 60 改 120，外部改 144 并关闭 displaysync；destroy 仍发 60 恢复且未等待 | 恢复前核对实际状态及持有权，保留较晚外部设置 |

原夹具未记录实际 setProperties 出口，否定 unpause 的断言不足，v1 和尝试记录保留；采用加入 endpoint 身份、正常正向对照、真实到期调度与工具生效/回包分离的 v2。v2观察到后续第三请求不作为缓存值证据；v3逐回复读取现有stats，确认缓存120时后续24fps目标120被抑制，纠正该夹具时序假设，原失败保留。既有 mpv settings 装配测试 2/2 通过。

### C：设备映射与窗口

当前工具参数固定 DISPLAY1，而窗口 `getDisplayMatching(bounds)` 只用于几何比较。现有受查生产代码没有把 Electron display 对象转换为 Win32 device name 的实现。Electron display.id、截图 display_id、数组顺序都不能作为 DISPLAY 编号依据。

本轮实际读取固定 [Host 708fadc 的 Program.cs](https://github.com/MediaBrowser/emby-theater-windows/blob/708fadc068cbf66ced6aece4a32f3e12bb2c4e13/Emby.Theater.RefreshRate/Program.cs)，6044 bytes，SHA-256 `a9514afcd5e54dc938d3270f28ad2c526dae023723171592fc69963b8d49c009`。参考实现直接使用传入 device name 调用 EnumDisplaySettings / ChangeDisplaySettingsEx，频率为 DEVMODE 整数值，未提供窗口句柄映射入口；change 使用 CDS_TEST 后 CDS_UPDATEREGISTRY。此次只读源码，没有执行工具。固定 vendor 二进制本轮回读 SHA 与已登记 `c3ac38b3345d804afc4ba97f34f059d0c4294ac5f55f62a25948ee62975eaa81` 一致；参考源码与该二进制的可重复构建关系仍未建立。

因此不能靠现有参考工具补出可靠窗口映射。映射保持 UNKNOWN，需后续独立批准的可靠来源或桥接能力；本轮不改工具二进制或扩 Native 协议。旧材料目录缺失的调查记录保留，但不再用本地缺源码代表没有可核查公开参考。

既有全屏状态测试 11/11 通过，有限源码审查尚无新增确认缺陷。多屏、Mixed-DPI、HDR、实际显示器归属与物理刷新率行为为 NOT_VERIFIED；不运行旧可见 Win32 harness。

## 待父审的最小修正方向

### A 的候选技术合同

只改 main 刷新率工具生命周期、三个 XHR helper 及必要调用处与定向测试。候选不是新增公开协议或设置：

1. 每次原请求只完成一次；正常 close 保留 stdout，unknown/non-Windows/spawn-error 保留既有空结果。计时器和迟到事件都经过同一完成门。
2. 工具无终态时有明确 deadline，失败只终止该次确认归属的 child；kill 请求和已观察退出分开。未确认退出时记录不确定状态，禁止继续发出可能重叠的显示写入，不把 kill 返回成功当作退出证据。
3. main 退出先关闭新工具请求入口、完成所属 pending callback、尝试回收所属 child；接入原 before-quit Promise。没有显示 lease 的 main 清理不能冒称已恢复显示。
4. XHR 监听 load/error/abort/timeout，以一次完成门清理所属 timer 和监听。超时先封闭结果再 abort，迟到回调不能重新提交。取消后的 Play 继续由原 request / AbortSignal 检查拒绝。
5. helper 的正常解析与网络错误形状保持。显示查询失败不应无限阻塞播放；是否由 displaySync 在限定边界降级继续、并禁止该请求的自动切换，需要父审具体调用差异。

候选预算为工具 5000ms、终止确认窗口 1000ms、renderer 单请求及 Play 显示探测总预算 8000ms；原 FPS 稳定等待 3000ms 保留。5000ms 与现有 Native controller 默认请求上限一致，8000ms 与维护请求默认上限一致，均只是本轮技术上限候选，不是刷新率硬件耗时测量。1000ms 为新的有界清理假设；父审需要同时决定总预算扣减、排队时间计入和边界用例，未经审定不写入产品。

### B 的候选归属约束

- 同一显示目标的读、change 与恢复不能产生无归属的并行写入；同 owner 重复 FPS 合并，旧请求在队列执行前和每个 await 后检查归属。
- 已发出的物理 change 不能仅因 renderer request 退休而视为已取消。先确认工具结束及当前状态，再让终止恢复或新 owner 继续；禁止旧回复回写新播放的统计或 unpause。
- 恢复只针对实际确认改变且仍持有的状态。恢复前读取当前状态；与最后确认应用值不一致时保留后来的外部设置并释放旧归属。不可观测的相同值外部写入不能证明没有发生，必须注明限制。
- 新 Play 的优先级高于旧未开始的恢复；已经开始的物理操作必须结束后再接管。terminal Stop 需要在自己的恢复结束或有限失败后完成，不能让迟到旧 change 跨过完成边界。
- 设置关闭后的恢复应按是否持有实际 lease 判断，不能直接用开关值推断。应用退出若没有可靠的现有 renderer teardown 路径，先报告缺口并交父审；不自行增加 Native/IPC 或认证协议。

以上是验收约束；具体串行、继承/释放 lease 与 shutdown 接线待复现和父审后固化，尚未批准重写播放/恢复状态机。

供父审选择的局部实现形状为 adapter 内单条 refresh 操作队列与一个非持久 lease，而不是新增播放生命周期：队列中的读写使用原三个协议动作；排队前、执行前和每个await后核对原 request 与局部显示代次。同owner FPS保留最新一个待执行目标；稳定等待仍在原请求下执行且退休可结束等待，不让旧timer占用新owner的unpause权。

第一次实际change前查询current作为本次lease原值，完成后确认实际值；记录原值、最后确认值和归属，不能把仅发请求视为改变成功。已发出的旧change结束后仅更新物理操作账本，退休播放的cur/unpause保持封闭。新displaySync排在此前已发操作之后，并在仍为当前请求时接管lease或发现外部变化后放弃旧lease。Stop(false)沿用替换语义；terminal Stop/destroy排入有界恢复，恢复开始前再核对显示代次和current。新owner已经出现时跳过未开始的旧恢复；已经开始的物理恢复必须结束后新探测才能继续。以上不修改原PlaybackManager停止fence、Native销毁或Session报告。

现有工具没有原子比较后写入接口。即使恢复前current等于最后应用值，仍不能排除查询与change之间的外部写入，也无法辨认用户设置为相同整数值；只可承诺尊重已经观察到的第三值，不能宣称覆盖所有并发手动设置。应用退出跨renderer销毁的最终显示恢复尚缺可靠接线，第一阶段只请求批准有界工具关闭，不宣称整应用退出恢复已闭合。若父审认为该限制不满足本轮恢复合同，应缩小实现范围并保留UNKNOWN，不能自行扩大Native/IPC。

## 允许文件与不变量

候选产品文件限 `src/electronapp/main.js`、`src/electronapp/plugins/libmpv.js`；如需拆出独立工具生命周期 helper，先列准确新增路径、构建来源接线与理由再父审。测试限刷新率协议、完整 AMD 显示归属夹具及必要的现有 shutdown 测试；窗口文件仅有新复现和独立父审才修改。状态及开发记录同步本合同。版本字段待范围稳定后更新 0.3.8。

保持 PlaybackManager、Item/MediaSource/PlaySession 身份和单次报告、STRM 最终 source 与失败回退、Resolver/CD2/Mount/DirectUrl、Native/libmpv 二进制和协议、认证/IPC 边界、既有菜单及 Movie 组合输出。固定 vendor 只读，不升级依赖，不把显示兼容工作扩张为新播放器或窗口架构。

本轮只做本地可回退修改、必要本地提交、固定来源构建及新目录候选。远端写入、发行、系统安装、真实显示设置、个人 profile/凭据、真实服务器业务与前台操作均不在本轮范围。

## 验收与后续停点

1. 定向修前/修后覆盖 deadline 前一毫秒、边界与迟到 close/error/XHR；重复完成、callback 抛出、abort 重入、timer 归零、kill 失败/未退出及 shutdown 新请求关闭。
2. 完整 AMD 覆盖正常 FPS 正向恢复、并发相同/不同 FPS、Stop(false)/Stop(true)/Next/destroy、新旧 owner 交接、手动第三值与关闭设置；区分物理 apply 与 XHR reply 顺序，不用未接入的假出口作否定断言。
3. 适用的请求/Session、Native lifecycle、settings 与既有全屏回归。模拟窗口通过只代表状态模型，不替代多屏或硬件。
4. 具体实现父审后再运行最终公开/固定材料门禁、准确 sourceCommit 构建、隐藏组件和入口、provenance 与完整 runtime/payload/ZIP 回读；产品来源与后续文档 HEAD 分开。

当前尚无新增产品修正或 0.3.8 runtime。原候选、profile、失败记录及已发布 0.3.7 资产保持。
