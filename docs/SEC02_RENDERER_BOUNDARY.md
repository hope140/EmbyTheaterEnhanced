# SEC-02 renderer 局部边界

基线 `d875ba5`（审核报告提交；产品等同 `0b782dd` / v0.2.7）。本地分支 `codex/sec02-frame-boundary`。

新增共享身份判断：仅当前 webContents、其实际 mainFrame、打包 `www/index.html` 文档可调用增强 IPC。query/hash 路由保留；missing/detached/child/foreign document/destroyed 拒绝。应用主导航和 redirect 拒绝离开该文档，原 bootstrap 的 loadURL 不变。CD2 resolve/cancel、STRM 设置、诊断、维护、Native call/notify 和旧 diagnostics snapshot 共用该 gate。

安全测试先在旧产品运行：5 个注册器全部失败，未批准的 sender 到达业务 handler；日志 `.work/sec02/red.log`。修复后相关八套回归148/148通过，0失败/取消/跳过，命令见总验收报告。旧正向 fake event 仅补齐 Electron 实际提供的 mainFrame/url，业务断言均保留。调试过程中缺 fixture URL/import 造成的失败保留在 `targeted.log`、`fixture-import-failure.log`，没有增加 sleep 或放宽权限判断。

| 配置/能力 | 当前事实 | 兼容性与处理 |
|---|---|---|
| nodeIntegration / worker | false | 保持；不是 preload 隔离证明 |
| contextIsolation | false | vendor preload 直接写 window.ipc/window.fs，需 contextBridge/窄接口设计后迁移 |
| sandbox | false；还有 no-sandbox 开关 | preload 使用完整 Node fs/os/crypto，不能直接整体开启 |
| webSecurity / insecure content | false / true | Emby HTTP/WebSocket、离线 file/custom XHR 和跨源资源需专门CORS验证 |
| preload | 完整 fs 和 raw IPC 可达 | 当前主文档 XSS 仍可访问宽权限；本次 gate 不能隔离同一主世界的恶意脚本 |
| CSP | 离线 index 无强 CSP | AMD、样式/媒体/连接源须完整盘点；未强行注入策略 |
| navigation | 原无主文档限制 | 本次限制固定文档；程序内部 loadURL 仍由代码审查负责 |
| IPC frame | 原仅 webContents | 本次 fail-closed frame/document gate；不是 server内容可信保证 |

`STATIC_VERIFIED`、`UNIT_VERIFIED`；新源码的 `ISOLATED_RUNTIME_VERIFIED`、`REAL_SERVER_VERIFIED`、`USER_VISUAL_ACCEPTED` 均 `NOT_EXECUTED`。需要在固定新候选 runtime 检查初始load、hash路由、设置四类IPC、Native/CD2请求和关闭；本轮没有更换现用客户端或profile。整个SEC-02任务为局部完成，preload/CSP/CORS/isolation/sandbox迁移继续待设计。
