# v0.2.9 诊断隐私、安全边界与生命周期审核

日期：2026-10-11（UTC+8）。审核基线为 `9774b73469dea9a3651f03737153c872947223ee`；诊断修复在独立 `codex/v029-privacy-redaction` 分支提交 `16ae6c26a1335981039ee3c7effc3309d771defe`。主维护树仅新增本报告；生产修改由主线程审核后整合。

Model Tier：Tier 2 安全边界审核，明确 contract 下的 Tier 1 局部执行。Reason：涉及日志出口、renderer/main 权限边界及既有生命周期合同；未设计新的播放架构，未升级范围。

## 结果与阻断处理

发现两类可复现的诊断隐私缺陷，均属于必须修复的发布阻断。

1. 自由 `message` / `userNote` 中的 `Authorization: Basic ...` 原来只隐藏 scheme；多项 `Cookie` 原来只隐藏第一项。用合成凭据生成的真实 collector ZIP 返回 `READY` / `redactionPassed=true`，回读 client log 仍包含 Basic 凭据和第二项 Cookie。最初六项扩展回归为 2 PASS / 4 FAIL。
2. 含空格的 Windows、UNC、POSIX 私有媒体路径在自由文本中只隐藏首段，可能留下媒体名称。原有 structured path 测试不覆盖这个边界。

局部修复只涉及 `src/electronapp/enhanced/diagnostics.js`、`tools/diagnostics-common.ps1` 和新增合成测试 `tests/v029-diagnostics-privacy.test.cjs`。四类 header（Authorization、Proxy-Authorization、Cookie、Set-Cookie）隐藏直到 CR/LF 的整个值；路径隐藏至 CR/LF、引号、尖括号或 pipe。URL 仍先于路径处理。后续诊断行保留，同一行在敏感值之后的额外诊断文字可能同时被隐藏，这是本次明确接受的保守取舍。

PowerShell 最终 gate 同时检查 header 的完整 placeholder 边界及对应 JSON key，拒绝 placeholder 后仍残留值。冒号后空白采用 atomic group，兼容 JSON 转义 tab；Windows drive gate 增加前边界，避免将 Authorization 后缀加转义 tab 误判为 drive path。调试期的误报与失败日志保留，没有删除旧断言。

独立候选通过新门禁后仍须主线程核对 diff、整合身份、全量回归及发布来源；本报告的局部结果不能替代最终 main CI。

## 诊断出口审查矩阵

| 项目 | 当前实现与本轮证据 | 边界 |
|---|---|---|
| URL query / 115 直链 / Emby API key | URL 以 scheme/host hash 摘要，结构化敏感 key 隐藏；合成 URL query 回归 | 不记录或请求真实媒体 URL |
| Authorization / Cookie | 原自由文本缺口有 RED 与真实合成 ZIP 证据；最小修复补全部 header value 与末端 gate | 只覆盖明确列出的 header 格式 |
| 自由备注 | reporter 通过共享 `Write-JsonFile` / `Protect-DiagnosticValue` 并执行 snapshot gate；新增实际 snapshot 与 ZIP 回读 | 无标签的任意秘密、自然语言私人身份和媒体标题不能保证识别 |
| 本地路径 / 私人媒体名 | 结构化路径摘要；补含空格 drive/UNC/POSIX 自由文本测试，保留后行 | 任意相对文件名或裸标题不是通用语义识别对象 |
| 新格式 secret | 合成 `sk-proj-...` 在 api_key/client-secret key 下隐藏 | 不声称所有未知秘密格式已覆盖 |
| ZIP 内容 | collector 对选定、限量日志重新脱敏后扫描，实际合成 ZIP 回读 | collector 并不自动发送或上传 ZIP |
| 标识与原始进程信息 | bundle 使用 HMAC 摘要；JS client 的设备/会话 key 使用既有 hash；process 投影白名单 | 不把摘要当完全匿名保证，不导出 commandline/environment |

本轮没有读取或上传用户真实凭据、媒体、服务器事件；合成黑盒均显式传入 fixture LogRoot/InstallRoot，并跳过 Windows Events。没有修改用户 profile、现用客户端或服务器配置。

## Renderer SEC-01/02 当前风险与最小兼容设计

| 边界 | 当前实际实现 | 后续设计与状态 |
|---|---|---|
| 主 Frame 导航 | `rendererBoundary.restrictNavigation` 在 load 前注册 will-navigate/will-redirect，限定 exact packaged index，保留 query/hash | 已有局部修复；程序内 loadURL 仍靠调用点审查 |
| 增强 IPC sender | 当前 webContents + 实际 mainFrame + fixed application document；child/missing/detached/foreign frame fail closed | 已有合同与离线回归；同一主世界 XSS 仍能作为合法 sender |
| 外链 | window-open 永远 deny，系统 shell 只接受有效 HTTP/HTTPS；apphost 与帮助入口复用 helper，错误不记录 URL | 已有局部修复；mock shell 成功不等于真实浏览器打开 |
| preload / fs / raw IPC | prepared preload 仍直接暴露 `window.fs` 与 `window.ipc`，生成器保留 vendor 基线 | 盘点真实消费者后，以 typed 窄接口替代 fs/raw IPC；明确批准前不迁移 |
| nodeIntegration / worker | 均 false | 保持；不等于 preload 或主世界隔离 |
| contextIsolation | false | 需 contextBridge 与旧前端消费者适配、frame/事件/error 回归后再切换 |
| sandbox | false，main 仍有 no-sandbox switch | preload Node fs/os/crypto、依赖和启动链须分阶段迁移；本轮未切换 |
| webSecurity / insecure content | false / allowDisplayingInsecureContent=true / allowRunningInsecureContent=true | 盘点 HTTP Emby、WebSocket、file/custom XHR、跨源媒体后做针对性策略及真实服务兼容验证 |
| CSP | 固定 vendor index 未提供强 CSP | 先报告模式盘点 AMD、inline/script/style/connect/media 需求，再限源；本轮不注入策略 |
| legacy fs/custom protocol | 不等同增强 IPC sender gate，当前旧前端依赖仍存在 | 将访问目标投影到授权文件/资源集合，禁止 renderer 任意 filesystem 路径；属于独立长期迁移 |

最小后续顺序是消费者盘点 → typed API 与双兼容验证 → 缩窄 fs/raw IPC → contextIsolation → CSP/CORS → sandbox。每一阶段分别验证正常启动、设置、Native/CD2 请求和关闭；不能由离线测试推导所有真实 Emby/HTTP/WebSocket 兼容。上述迁移均未混入本轮产品修改。

## Native Helper 生命周期

本轮复用 `native-helper-service`、`native-helper-protocol`、`native-helper-client`、`native-helper-lifecycle`、`native-helper-diagnostics-playback`、`native-helper-terminal-join` 与 `normal-close` 的离线测试。

- 覆盖正常关闭/停止、重复 destroy 共用 Promise、播放操作中的退出归属、owned current/pending 全部 settled、异常 helper/transport 退出、replacement identity 与 stale callback 保护。
- terminal join 使用 production Node controller/private pipes 与测试专用 Node fake child，测试收尾断言 owned fake child 已退出。
- 没有主动修改生命周期实现。无残留的结论仅适用于测试自有 fake child，不推广为本轮真实 libmpv/Electron 系统验收。
- 真实正常退出、播放中退出、Stop 后关闭、重复关闭、Helper 意外退出的 Windows 客户端验收本轮 `NOT_EXECUTED`。历史 app.exit 超时仍 `OBSERVATION_ONLY`，没有新真实可复现样本。

## 实际执行与证据

| 执行 | 结果 | 来源/日志 |
|---|---|---|
| 基线相关十五套离线测试 | 136/136 PASS，0 fail/cancel/skip | `.work/v029-security/focused.log`；基线产品，不能当修复后结果 |
| prepared preload / external-player 材料依赖与 renderer/external 回归 | 28/28 PASS，0 fail/cancel/skip | `.work/v029-security/renderer-material.log`；含现有四个 suite |
| 首次六例隐私扩展 | 2 PASS / 4 FAIL，0 cancel/skip | `.work/v029-security/privacy-red.log` |
| 原始合成 ZIP 回读 | READY 且 redactionPassed=true，但两种 synthetic secret 都残留 | `.work/v029-security/zip-red.log`；9 entries |
| 最终隐私扩展 | 18/18 PASS，属于下行最终 47 项运行的子集，不另行累加 | 独立隐私树 `.work/v029-security/privacy-release-final.log` |
| 最终诊断 focused 回归 | 47/47 PASS，0 fail/cancel/skip，exit 0；运行产品字节与 `16ae6c2` 相同 | 同上；Windows PowerShell 5.1.26100.9444 / PowerShell 7.6.5 编码与语义验证 |
| JS 语法与 diff | node --check 两个 JS/CJS 目标、git diff --check 实际通过 | 最终提交前复核 |

主要命令为 `node --test --test-concurrency=1` 后接相关 test 文件。新增隐私测试包含 structured credentials/new API key、URL、三种空格路径、四种 header 大小写/多行、raw/partial-placeholder 拒绝、空白/tab placeholder、PowerShell 7、敏感 JSON key，以及实际 reporter snapshot/collector ZIP 回读；没有跳过断言或使用真实媒体。

本报告不宣称 runtime、真实 Emby/115/CD2、远控、可见画面、真实安装或第三方分发许可通过。这些层级由主线程在综合收尾报告分别给出。

## 主线程后续交付层级

上述报告阶段之后，最终产品main084554e已完成八组隐藏 `ISOLATED_RUNTIME` 正常关闭/完整播放链、25对Session和无候选进程残留，随后完成 `INSTALLER_EXTRACTION` 与公开三个附件下载验证；完整原始来源见综合收尾。该补充不把旧fake-child测试改标成真实Helper验收，也不扩展为本轮实服、前台视觉或真实系统安装PASS。v0.2.9已随必要诊断隐私修复公开交付，有限格式覆盖边界保持。
