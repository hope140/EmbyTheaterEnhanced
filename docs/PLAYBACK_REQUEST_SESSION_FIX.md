# PlaybackManager 请求与会话修复

日期：2026-10-09（UTC+8）。本地分支 `codex/playback-session-20261009`，准确基线 `af688c87126771e8e9252a51c514547178c7af58`，产品版本保持0.2.5。产品 sourceCommit 为 `d480eb800a8b809a0e470608f5f3da0d6d378de5`；后续测试与证据提交不替换该产物身份。

两项产品修复已通过针对性回归及五种场景的隐藏播放/会话断言。首轮完整runner矩阵为4 PASS / 1 FAIL：hit0在成功报告落盘后未自然退出，120秒时由精确PID清理，原因UNKNOWN。产品行为通过与进程退出失败分别保留，整体矩阵不改写为PASS。

## 修复边界

产品只修改 `tools/patch-playbackmanager.cjs` 维护的覆盖器。每次请求持有独立 options 快照；队列 item 指向最新快照，旧请求不会被后续 Next 写入新 ID。既有 preplay、bitrate、device profile、PlaybackInfo 和 Stop 守卫继续负责失效处理。

临时 `onPlaybackRequested` 状态显式标记 pending，替换路径在调用 player.stop 前随 state 捕获标记；替换与 terminal Stop 仅抑制 pending 对象的报告，保留状态清空、事件、队列和真实会话的 Started/Stopped。未采用通用 started 守卫，以保留已开始会话在 changeStream 失败后的错误收尾。

隐藏 harness 增加基于实际 API records 的完整 ItemId/PlaySessionId/MediaSourceId 配对断言，由 main 重新计算核对。普通、STRM 和队列 A/B/C 均必须各有完整 Started/Stopped；pending、缺字段、重复、乱序、未配对报告均失败。原有双 Next 最终 B、顺序 C、迟到 metadata 不额外 play、精确 CD2 cancel、Seek/Stop 事件和有界预算保持。

## 修改前证据

本轮在固定 `3ab10c94d75659c0a421b729aac3147afa680751` 产品上运行新 harness 的 miss 400ms 对照，正常结束但整体 FAIL：`staleMetadataIgnored=false`、pending/incomplete Stop各1、重复 Started 1、未配对 Started 1，进程残留0。原始证据目录为 `.work/p1-runtime-70a9f3625291440abe8f4fd0dfcbe874`。历史五轮失败与成功样本保留在 [runner记录](RUNNER_DETERMINISM.md)。

新工作树首次全量测试在准备输入前为570/579、9失败、0跳过；缺少vendor/preload及grpc依赖，日志 `.work/tests-before-inputs.log` 保留。复制固定只读输入、生成preload并按锁文件安装项目依赖后，相关50/50通过；不是最终全量验收。

## 回归与构建

新增AMD VM测试加载并执行真实PlaybackManager、真实覆盖器，I/O由fake player/API提供。基线2/7通过、5项行为失败；候选7/7通过，0跳过。覆盖共享B迟到成功/失败、terminal Stop、pending B被C替换、A/B/C完整三身份配对，以及已有换流失败的Stop报告。主线程读回diff和测试后，独立Sol High核心审查未发现新增确定性问题。

最终全量593/593通过，0失败/跳过。新增Session validator的负例先重算结果再验证失败，覆盖重复、缺字段、乱序、缺Started/Stop、错误Session/MediaSource和伪造记录，不能仅靠renderer布尔值通过。

正式 `tools/build.ps1` 从固定提交blob构建，完整GCC/Electron树、vendor、锁定生产依赖和source/runtime/native provenance通过；`package.ps1 -VerifyOnly`与版本一致性通过。新旧runtime各2,136文件（2,135清单项及清单自身），missing/extra/hashMismatch均0。相对固定3ab10c9，只有PlaybackManager和6份来源/清单文件改变，其他2,129文件字节一致，Native Helper/libmpv/Host/Electron二进制保持。构建后未修改runtime。

候选入口：`dist/ETE-0.2.5-session-fix-d480eb8-win-x64/Emby.Theater.exe`。构建清单SHA256为 `ba3a109870e0e3cfc62a1eb485866ae1e57a0056ab9608eb5ccdcfd20e939422`。本轮交付完整runtime，未构建新安装器或覆盖已发布产物。

## 五组隐藏矩阵

| 场景 | 播放/Session断言 | 完整runner | pipeline耗时 | 诊断记录 | 收尾残留 |
|---|---|---|---:|---:|---:|
| miss 400ms | PASS | PASS | 10,341ms | 98 PASS | 0 |
| hit 0ms | PASS | FAIL，成功落盘后退出超时 | 11,924ms | 127独立PASS | 强制清理后0 |
| hit 400ms | PASS | PASS | 13,186ms | 128 PASS | 0 |
| hit 800ms | PASS | PASS | 15,847ms | 128 PASS | 0 |
| direct 400ms | PASS | PASS | 14,092ms | 128 PASS | 0 |

每轮普通、STRM与队列A/B/C均有5组完整Started/Stopped，pending/incomplete/duplicate/unpaired/mismatched计数全部0。miss释放旧PlaybackInfo后无额外play；hit/direct精确的rapid-next和stop-before-load请求取消、重叠Next最终B及顺序Next到C均通过。Seek/Stop沿用事件、报告和既有1000ms输入冷却；未改变stage15s/startup15s/total90s、取证750ms、outer120s与读流边界。

五轮13个实际harness文件SHA一致且与交付树读回匹配。appData/userData隔离、真实About版本/source读回和应用窗口归属均通过；所记阶段document.hidden=true。DirectUrl专用User-Agent匹配且未泄漏到普通请求。诊断验证覆盖两类安全Renderer位置、request关联、合法结构和原始canary排除，未执行诊断ZIP整包验收。

## 退出异常与验收边界

hit0首轮smoke报告 `ok=true`、`pipeline-complete`，但Electron根进程在120秒仍存活；runner核对StartTime后终止所属进程树。profile在报告后仍有Chromium写入，不能把残留0当作自然退出成功。日志未见helper fatal/crash，disk cache错误与异常的因果关系未建立。没有持久化退出阶段的角色/线程证据，原因保持UNKNOWN，不能归因于并行单测或package校验。

在全量单测与package验证完成后，仅执行一次无其它验证任务并行的同参数hit0复验，使用同一runtime/harness和新隔离profile。结果完整PASS：11,366ms，smoke与Session/generation均通过、5对完整会话、pending Stop为0、127条诊断通过；自然exitCode=0、timedOut=false、残留0。sourceCommit、runtime provenance SHA及13个harness文件SHA与首轮逐项一致。证据目录 `.work/p1-runtime-c098b223cb43492180f11e07d4a98380`。

退出异常在这次独立运行中未复现，原因仍UNKNOWN；不能据此断言并行测试导致首轮停滞。首轮矩阵及失败目录原样保留，不覆盖上表。当前五种参数均取得完整通过样本，但退出稳定性继续列为观察项。

真实 Emby/CD2、真实远控、可见首帧、HDR/多屏和系统安装未执行。fake API接受POST不证明真实服务器处理结果；隐藏core-playing不代表可见首帧。准确目录、SHA、逐项向量和独立复验见 [结构化证据](evidence/playback-request-session-20261009.json)。本轮仅本地提交与验证。
