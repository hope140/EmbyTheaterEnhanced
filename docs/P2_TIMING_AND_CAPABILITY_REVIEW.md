# P2 阶段耗时观测与能力核对

日期：2026-10-09（UTC+8）。从 P0/P1 交付 `7bee8db` 建立隔离分支 `codex/p2-performance-20261009`，交付离线分析工具、合成日志报告及后续能力结论。产品源码、版本与安装包保持 P1 的 `fb10f92`；本轮没有启动 Electron、访问真实服务或读写用户 profile。

## 交付与输入

- `tools/analyze-playback-timing.cjs`：读取显式指定的单个 JSONL，核对 app/start 和产品 sourceCommit，按 request/helper/generation 归属统计阶段。
- `tests/playback-timing.test.cjs`：16 项新增边界与 CLI 测试，与既有 P1 日志验证器 8 项合计 **24/24 PASS**；Node 语法与 diff 检查通过。
- [合成样本报告](evidence/p2-synthetic-timing-20261009.json)：仅固定枚举、样本序号、计数、时长和安全提交号，没有原始请求标签、时间戳、URL 或私人路径。

输入为 P0/P1 已通过隔离验证的 `p1-runtime-575f7b156cf643219a2de75b5f97048e` 合成运行 JSONL，生成过程见 [P0/P1 交付](P0_P1_DELIVERY.md)。输入 SHA256 为 `3dacbda642ff96cd398f33692934739c3bb3bbe918cc7d09b0ba03b13847ece9`，buildCommit 精确匹配 `fb10f920a39112ff72b0f82715da8345702f634b`。没有读取首轮隔离失败所影响的现有客户端日志。

`COMPLETE` 仅表示离线分析完成，`diagnosticCompleteness=NOT_VERIFIED`，不表示日志完整、播放验收通过或真实性能已测定。报告有110条记录、8个请求；6个有resolver-complete，5个有loadfile-requested、有效native file-loaded和core-playing。1条stale native被排除，缺失端点保持不可用。

## 合成样本结果

单位为毫秒，统计只纳入有效样本。偶数样本中位数取中间两项均值；少于20个有效样本不输出P95。

| 路由 | 阶段 | n | 最小 | 中位数 | 最大 |
|---|---|---:|---:|---:|---:|
| native | play-request → resolver-complete | 1 | 168 | 168 | 168 |
| native | loadfile-requested → core-playing | 1 | 225 | 225 | 225 |
| native | play-request → core-playing | 1 | 395 | 395 | 395 |
| fake cd2-http | play-request → resolver-complete | 5 | 489 | 527 | 538 |
| fake cd2-http | resolver-complete → loadfile-requested | 4 | 1 | 1 | 1 |
| fake cd2-http | loadfile-requested → core-playing | 4 | 195 | 221.5 | 224 |
| fake cd2-http | play-request → core-playing | 4 | 685 | 740.5 | 763 |
| fake cd2-http | loadfile-requested → file-loaded | 4 | 57 | 84 | 87 |
| fake cd2-http | native start-file → file-loaded | 4 | 52 | 79 | 80 |

`tools/smoke-electron.cjs` 的 fake CD2 service 显式设置 **400ms** 延迟。这些数字用于验证阶段统计方法，不能认定真实 CD2 慢、估算预热收益或声称版本性能改善。样本没有 `category=cd2` 记录，fake调用计数不能代替CD2阶段耗时。

## 计时与关联边界

`enhanced/diagnostics.js` 在调用logger时同步投影并生成timestamp，随后才排队写入文件。上述数字为main接收到记录时的墙钟差，包含renderer IPC/调度影响，不是写盘耗时或单调时钟测量。`play-request` 在libmpv插件入口，不覆盖用户点击到PlaybackManager前置准备；controller内部单调时钟未进入JSONL。

真实`cd2-service.js`的resolve-start/terminal带requestId；可以观察同模式、唯一一次尝试的总elapsedMs，但它来自Date.now，生产端会将负差钳制为0。client-ready/find/download子阶段只有mode和elapsedMs，没有requestId，不能按时间接近强配。工具将多次尝试、零值和无法归属的子阶段保留为不可用。

file-loaded/core-playing不是可见首帧；元数据单段、可见首帧、目录冷热均有独立的不可用原因。没有drop标记不能证明没有丢记录或最终flush成功。

## 工具使用与限制

```powershell
node tools/analyze-playback-timing.cjs --log .work/isolated-run/appdata/EmbyTheaterEnhanced/logs/ete-client.jsonl --source-commit fb10f920a39112ff72b0f82715da8345702f634b --evidence synthetic --output .work/timing-report.json
node --test tests/playback-timing.test.cjs tests/p1-runtime-diagnostics.test.cjs
```

示例输入路径需替换为已有隔离日志。log/source-commit/output必须显式传入，没有默认profile、联网、窗口或播放控制；输出独占创建，不能覆盖已有输出或输入。未指定synthetic时只记为unspecified，不从路径猜测证据来源。

- 最多2MiB、4096物理行（末尾换行不另算一行）、每行64KiB、512请求；严格UTF-8/JSON/schema/timestamp检查，超限或损坏不输出部分统计。
- 必须包含一个app/start和匹配sourceCommit。多次app/start返回`MULTIPLE_APP_RUNS_UNVERIFIABLE`：现有日志无逐条writer/run身份，无法证明旧进程尾部记录未混入新启动。缺app/start返回`APP_START_REQUIRED`，不自动扫描轮转文件。
- Native需唯一begin、同helper/generation/request、ACCEPT、current generation且未退休；归属冲突、无归属与DROP记录不参与对应阶段计算。
- 重复/缺失端点、重复请求标签、Stop/retire之后的迟到端点、时钟回退、可见限流和pending-drop均保持UNAVAILABLE。0ms墙钟差不可分辨；CD2零值也可能被时钟钳制，不进入时长统计。
- 既有`observe-cd2-cold-warm.ps1`继续负责DirectUrl/Mount路由现场对照；本工具补充P1 native生命周期和单文件阶段统计，不改变旧observer的contract。

## 预热与Hydration结论

按用户“复杂就不做”的偏好，本轮结束预热研究，不制作产品原型。静态依据如下：

1. 固定Carnival详情页快照已查询一条Next Up元数据，并按需查询当前详情项媒体源；维护层可读取已选队列项。重复增加元数据预取尚无收益证据。此结论限于manifest固定快照，不外推其它Emby版本。
2. `cd2-service.js`的DirectUrl校验包含expiry、受限User-Agent、additionalHeaders和重新获取；URL当前属于一次播放请求。跨请求复用需要失效、取消、配置变化及generation归属策略，超出简单预取。
3. pinned proto只有FindFileByPath/GetDownloadUrlPath，未定义缓存控制；主动预读会新增HTTP行为与服务端副作用，获取URL不等于读取媒体。
4. 当前样本包含人为延迟，不能证明存在值得增加复杂度的真实瓶颈。

源码依据为`enhanced/cd2-service.js`的`validateDirectResponse`与`resolve`、`resolvers/cd2-resolver.js`的Abort逻辑、`enhanced/nexttrack-transition.js`的队列读取、pinned proto，以及固定vendor详情页快照的`setNextUpButtonText`/`getItemWithMediaSource`。本轮不增加缓存层、目录枚举或跨层生命周期。

Hydration维持EVIDENCE-GATED。现有错误分类包括not_found、timeout、cancelled、unavailable、rpc_error，无效/目录响应为invalid_file；not_found不能自动解释为冷目录。旧研究的GetSubFiles/refresh涉及未纳入当前协议的流式查询和重查，没有真实前后可见性样本时不实施恢复策略。

后续可独立开展构建输入、对应来源与可再构建范围清单审计。主线合入和发布仍单独决定；本轮不扩大真实服务、安装、HDR、多屏或107ms全屏短闪的验收结论。
