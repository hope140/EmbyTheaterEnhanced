# P1 最小诊断 contract

2026-10-09，基于完整 v0.2.4 产品 03a2e3b、文档 HEAD ebcb655a。P0/P1 本地候选保持版本 0.2.4；发布身份由 sourceCommit 区分。

## 记录与边界

- 复用 enhanced logger、可信 `enhanced-diagnostics-log` IPC、sanitizer 和整包扫描。日志沿用单文件 2 MiB、3 个轮转文件；新增事件不写原始 source、URL、媒体/用户身份、凭据、错误消息或任意 stack。
- Native controller 在现有决策点旁路报告 generation begin/retire、start-file/file-loaded/end-file 的 ACCEPT 或 DROP disposition。仅安全整数 generation 和内部 `play-<sequence|local>-<generation>` 标签可关联，最多保留 64 个代次关联；缺失或淘汰后为 UNAVAILABLE。旧 helper 的事件不借用当前 helper 的归属。
- 原生事件、请求关联、持帧 prepare/arm/clear 和 surface hidden 共用每分钟 120 条上限；到限只记录一次 suppression 标记，下个时间窗恢复。关联更新不依赖日志写入是否成功。
- 每个新增 recorder 最多保留 32 个未完成写入，写入积压时丢弃新诊断而不等待；下一条可写记录携带有界 diagnosticPendingDrops 数量。没有下一条可写记录时，缺失证据保持不可用，不推断未发生事件。
- 仅记录已有持帧动作的观察结果，不发新 native 命令、不改变等待/取消/窗口时序、不扩展 Native Helper 协议。surface-z-order 和 visible=true 沿用既有记录，不重复新增。
- Renderer 全局 error/unhandledrejection 通过生成 preload 安装旁路 listener，不 preventDefault。错误类型采用固定枚举；source 和最多 8 个 stack frame 只允许实际包内 JS 文件的相对路径及有限行列值。未知消息和非包内位置为 UNAVAILABLE，不记录函数名或任意文本。
- Renderer 读取字符串先截断（stack 8 KiB、message 1 KiB、source 2 KiB），一分钟最多 20 条，安全内容相同则去重；去重缓存最多 64 项。main 收到后再次投影、校验并限频，拒绝非当前 application WebContents 的消息。
- 所有观察 callback、logger 同步异常和 Promise rejection 均隔离；不参与 PlaybackManager、Session、Resolver、source 决策或播放 Promise 结果。

## 验证要求

验证 A→B、旧 generation/helper 事件、retire、日志异常、限频/容量、恶意 error/stack/path/URL、可信 IPC、preload 重建与整包脱敏。新增日志证明收到 native 事件与执行了相应分支；file-loaded/core-playing 不能证明真实首帧。缺少事件不能推断播放失败，限流或关联淘汰可能导致证据不完整。

本轮使用临时 profile、假服务及合成媒体；静态/单元、隔离 runtime、payload/安装器解包与真实 Emby/CD2/安装验收分别报告。保留既有全屏 Previous max107ms INCONCLUSIVE 和 rapid fixture next.selected=false 的基线匹配结果。
