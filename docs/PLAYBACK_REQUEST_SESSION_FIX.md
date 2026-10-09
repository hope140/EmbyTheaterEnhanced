# PlaybackManager 请求与会话修复

日期：2026-10-09（UTC+8）。本地分支 `codex/playback-session-20261009`，准确基线 `af688c87126771e8e9252a51c514547178c7af58`，产品版本保持0.2.5。当前文件先记录修复 contract，候选 sourceCommit 与最终验收将在构建和矩阵完成后补充。

## 修复边界

产品只修改 `tools/patch-playbackmanager.cjs` 维护的覆盖器。每次请求持有独立 options 快照；队列 item 指向最新快照，旧请求不会被后续 Next 写入新 ID。既有 preplay、bitrate、device profile、PlaybackInfo 和 Stop 守卫继续负责失效处理。

临时 `onPlaybackRequested` 状态显式标记 pending，替换路径在调用 player.stop 前随 state 捕获标记；替换与 terminal Stop 仅抑制 pending 对象的报告，保留状态清空、事件、队列和真实会话的 Started/Stopped。未采用通用 started 守卫，以保留已开始会话在 changeStream 失败后的错误收尾。

隐藏 harness 增加基于实际 API records 的完整 ItemId/PlaySessionId/MediaSourceId 配对断言，由 main 重新计算核对。普通、STRM 和队列 A/B/C 均必须各有完整 Started/Stopped；pending、缺字段、重复、乱序、未配对报告均失败。原有双 Next 最终 B、顺序 C、迟到 metadata 不额外 play、精确 CD2 cancel、Seek/Stop 事件和有界预算保持。

## 修改前证据

本轮在固定 `3ab10c94d75659c0a421b729aac3147afa680751` 产品上运行新 harness 的 miss 400ms 对照，正常结束但整体 FAIL：`staleMetadataIgnored=false`、pending/incomplete Stop各1、重复 Started 1、未配对 Started 1，进程残留0。原始证据目录为 `.work/p1-runtime-70a9f3625291440abe8f4fd0dfcbe874`。历史五轮失败与成功样本保留在 [runner记录](RUNNER_DETERMINISM.md)。

新工作树首次全量测试在准备输入前为570/579、9失败、0跳过；缺少vendor/preload及grpc依赖，日志 `.work/tests-before-inputs.log` 保留。复制固定只读输入、生成preload并按锁文件安装项目依赖后，相关50/50通过；不是最终全量验收。

## 验收边界

待完成：针对性行为回归、最终全量测试、独立核心复核、正式来源与版本检查、新候选五组隐藏合成矩阵及诊断/进程收尾。真实 Emby/CD2、真实远控、可见首帧、HDR/多屏和系统安装未执行。fake API 接受 POST 不证明真实服务器处理结果。
