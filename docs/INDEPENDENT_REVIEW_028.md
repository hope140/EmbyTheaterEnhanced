# 独立审核与下一正式版准备

审核日期：2026-10-10（UTC+8）。阶段一固定 HEAD `0b782ddec404f4148cb6c8c16f19bc22201d3252`，远端 main/HEAD 同值。GitHub Release 只读核对：Latest 正式版 v0.2.2，最新 Pre-release v0.2.7；v0.2.7 peeled tag 为 `d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0`。`src/`、`native/`、`installer/`、package/lock 与该产品提交无差异；main 另含文档和诊断工具/测试收尾。本轮不改变版本号。

独立 worktree 从上述 main 创建，原工作目录的旧 Settings 分支和未提交文件保持。当前报告中的阶段一判断先于修复；后续验收另列，不覆盖失败记录。历史 651/42/53 与十组隔离运行仅作历史材料，没有改标成本轮通过。

## 阶段一发现与修复计划

行号绑定审核 HEAD；维护工具生成的 PlaybackManager 行号另作说明。严重度表示影响与处理顺序，不表示已在真实用户环境发生。

| 编号 | 严重度 | 结论 | 处理 |
|---|---|---|---|
| PLAY-01 | P1 | changeStream 的迟到 PlaybackInfo 在 terminal Stop 后重新 load 旧媒体；确定性 VM + 真实 libmpv 模块复现 | 核心换流所有权设计需单独收敛；本轮停止该项实现，正式版阻断 |
| SEC-01 | P1 | 两条外链入口将未验证协议交给系统 shell；mock 复现 | 独立分支：HTTP/HTTPS 允许规则、所有动态入口、拒绝与错误处理回归 |
| SEC-02 | P1 | 主窗口无导航边界；增强 IPC 只检查 webContents；preload 暴露完整 fs/ipc | 独立分支：主 frame/固定应用文档及导航局部加固；隔离架构迁移另行设计 |
| LIFE-02 | P1 | terminal callback 清空 client 后的 kill 未登记，完整 destroy 可早于旧 child 退出 | 独立分支：纳入既有 pending join；真实 controller + 私有假 child 验证 |
| LIFE-01 | P2 | allSettled 后拒绝先于解绑/销毁，留下窗口监听器和 carrier | 独立分支：全部 settled 后尽力释放，保留首要原始错误；生产 kill 拒绝可达性 UNKNOWN |
| CI-01 | P2 | 公开仓库没有 Actions；全量测试混有未公开固定输入依赖 | 独立分支：明确公开离线子集、语法/diff/敏感信息 gate；完整材料层单列 |

### PLAY-01：Stop 后的旧换流响应

- 文件：`tools/patch-playbackmanager.cjs:90` 的 stream-change 补丁只处理 superseded 错误，未保护 changeStream 的成功异步路径；固定 vendor 经当前补丁生成的 `changeStream` 约 441–510 行；`src/electronapp/plugins/libmpv.js:186` 的同 request ID 可开启后续播放。
- 触发：A 播放时 `setAudioStreamIndex` 进入 changeStream，挂起 PlaybackInfo，完成 `manager.stop()`，再交付旧 PlaybackInfo。
- 实际：Stop 后 currentItem=null、managerSequence=2；旧响应仍产生第二次 loadfile，streamRequest=1。期望：旧换流不得再控制播放器或创建新会话。
- 复现：真实当前 PlaybackManager transform + 真实 libmpv AMD 模块，fake API/native endpoint；安全断言 `2 !== 1`，UNIT 层失败。真实服务影响未执行，不能外推报告递送结果。
- 影响：需要重新请求 PlaybackInfo 的音轨/质量等换流路径；普通 Next 已修复的请求快照不覆盖此入口。
- 最小方向：为每次 changeStream 捕获流与请求所有权，在 PlaybackInfo、stopActiveEncodings、setSrcIntoPlayer 前后检查；需先定义 replacement/terminal/同流多次换流和编码清理规则。不能简单禁用相同 request ID，因为正常同流换轨也复用 ID。
- 回归：迟到成功/拒绝、Stop/Next/Previous 接管、并发换轨、旧编码清理只归属旧会话、Started/Stopped 身份完整。当前跨层 contract 未收敛，按任务停止条件不直接修复。

### SEC-01：外部协议

- 文件：`src/electronapp/main.js:374,1195`；`src/electronapp/apphost-command.js:35`。
- 触发：window.open 或 `electronapphost://openurl?url=...` 接受 `file:`、自定义系统协议等 renderer 数据。
- 实际：原值进入 shell.openExternal；窗口 deny 仅阻止 Electron 新窗口，未阻止系统协议处理。期望：只转交产品需要的有效浏览器 URL。
- 复现：提取真实 window handler 在 VM 中执行，file/custom 两例均调用 shell mock；未调用操作系统处理器，也未声称已实现任意代码执行。
- 产品需求核查：GitHub Releases、shader 文档、Emby Premiere 为 HTTPS；metadata URL 格式来自服务器，需支持普通 HTTP/HTTPS。未找到必须支持 file/mailto/magnet/自定义外部协议的产品契约。
- 最小修复与回归：统一边界，验证类型、空值、绝对 HTTP(S)、host、credentials、控制字符/反斜杠/异常编码，保留有效 query/fragment，处理同步 throw/Promise reject 且不记录 URL。测试真实两条动态入口及正常 GitHub 链接。

### SEC-02：renderer 权限与兼容性

- 文件：`main.js:1155–1170,1193–1213,1056`；`enhanced/cd2-ipc.js:11`、`strm-config-ipc.js:47`、`diagnostics-ipc.js:29`、`maintenance-ipc.js:20`、`native-helper/service.js:734`（以上相对 `src/electronapp/`）。
- 触发：同 webContents 子 frame 调用增强 IPC；主文档若导航离开应用则仍使用相同 webContents/preload。CD2 mock 证明子 frame 可调用 service。未运行恶意真实网页。
- 实际/期望：webContents 身份没有区分主 frame 和当前应用文档；权限应只授予打包应用的主 frame，导航应受限制。受影响能力包括 CD2 调用、设置/token 写入、诊断清理/导出、维护和 Native endpoint。
- 现有依赖：vendor preload 直接 `window.fs = fs; window.ipc = ipcRenderer`，`tools/prepare-preload.cjs` 仅追加诊断；libmpv/STRM Mount 用 window.fs，Native/CD2/设置用 window.ipc。`webSecurity=false`、`contextIsolation=false`、`sandbox=false`，还存在 `no-sandbox` 开关。离线 index 没有 CSP；AMD/Web 与跨源 Emby HTTP/WebSocket、file/custom XHR 需要逐项兼容验证。
- 局部措施：共享 fail-closed 主 frame/本地 index 身份检查，导航/redirect 约束；保留 hash/query 路由。nodeIntegration 和 worker 均已 false，无需重复实现。
- 后续设计：迁移窄 preload API/contextBridge，替换公开 fs/raw IPC，盘点 CORS/CSP/custom schemes 后逐项启用 webSecurity/isolation/sandbox。此次不能据局部 gate 声称 renderer 已安全隔离或 XSS 风险消除。
- 参考核查：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[webContents API](https://www.electronjs.org/docs/latest/api/web-contents)。本地兼容性结论来自实际代码。

### LIFE-01 / LIFE-02：退出资源与归属

- LIFE-01 文件 `src/electronapp/native-helper/service.js:699–707`。一个 current/pending kill 拒绝时，allSettled 已正确等完所有 child，但立刻抛错跳过 12 个监听器解绑和 surface.destroy。fake 拒绝观察到 carrierDestroyed=false。应保留 current 优先/快照顺序的原错误，独立尝试所有资源清理，不增加 sleep/重试/强杀。正常重复 destroy 继续返回同一 Promise。默认 controller.kill 吞掉系统 kill 异常并等待 exit，生产 Promise 拒绝可达性 UNKNOWN；此项是已复现的条件性清理缺口。
- LIFE-02 文件 `service.js:455–466`。terminal callback 执行 client=null 与 owned.kill().catch，未加入 pendingClientDestructions。真实 NativeHelperClient 配合私有 Node 假 helper，关闭 read pipe 触发 stdout-close 后，service.destroy 已完成而 H1 仍活着；有/无 replacement H2 两例均失败。应将该 owned completion 加入同一 pending 集合，保持 terminal 通知和 generation 逻辑。
- 回归：正常退出、current 拒绝、多个 pending/current 拒绝、重复 destroy、renderer/main 同时退出、terminal 后重建再销毁；检查错误对象、child completion、listener/surface，不以零残留替代等待顺序。

## 审核覆盖与边界

A1 覆盖请求快照、pending 报告、replacement Stop、libmpv generation、STRM/CD2/Mount/Native fallback、DirectUrl file-local UA、取消和期限；历史已修问题不重报。A2 覆盖 handshake/controller/service/endpoint、私有 pipe、窗口/事件和 destroy。A3 覆盖窗口/preload/navigation、增强 IPC、CD2 token/headers、脱敏和更新入口。A4 覆盖固定构建输入、Git blob/source/runtime/payload 分层、锁定依赖、工具链与安装器。

目前未确认新的 DirectUrl header 污染或 CD2 miss 阻断 fallback；更新 URL 已有 GitHub Releases 限制。发现的宽权限 renderer 风险不能由这些局部门槛抵消。

完整公开构建所缺 Carnival/Web/二进制输入与四类第三方对应材料继续 `WAITING_EXTERNAL`，引用 [材料收尾](THIRD_PARTY_MATERIALS_CLOSEOUT_027.md)，不重新索取、不虚构许可闭合。系统四阶段安装、真实 Emby/CD2/远控、可见首帧与显示专项均 `NOT_EXECUTED`。历史 app.exit 为 `UNKNOWN`，本轮没有据此修复。报告不构成正式版发布通过。

## 后续执行记录

阶段二按 SEC-01、SEC-02、LIFE-01、LIFE-02 独立分支和提交实施；CI/QA/安装卡及 ROADMAP 收尾另立工程提交。各项 RED/GREEN 命令、原始结果、主线程复核与最终提交身份见后续追加的验收记录。
