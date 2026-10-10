# 下一正式版验收矩阵

日期2026-10-10（UTC+8）。候选尚未合并、构建或定版。先读 [独立审核](INDEPENDENT_REVIEW_028.md)。PLAY-01 未关闭，禁止将本矩阵准备完成解释为发布通过。

## 可执行离线层

在对应独立分支运行，下列命令只运行 Node 测试。首次依赖准备为 `npm ci --ignore-scripts --no-audit --no-fund`；使用 package-lock，不升级依赖。缺少固定输入应报告缺失，不复制真实profile。

```powershell
node --test tests/strm-resolver.test.cjs tests/cd2-service.test.cjs tests/native-helper-lifecycle.test.cjs tests/product-session-identity.test.cjs
node --test tests/app-bootstrap.test.cjs tests/installer-lifecycle-snapshot.test.cjs
```

第二行 snapshot 测试属于 readiness 分支。CI 分支提供 `node tools/ci-public-tests.cjs`（实际入口以其 PUBLIC_CI.md 为准）。完整 PlaybackManager VM 需要 manifest 对应的 vendor Web 输入；可设置进程内 `ETE_PLAYBACKMANAGER_SOURCE` 到固定输入后运行 `node --test tests/playbackmanager-request-session.test.cjs`。PLAY-01 独立 RED 探针见 `tests/review-probes/change-stream-stop.cjs`，当前预期安全断言失败，应保留 exit1。

## 场景与通过标准

所有真实场景均按新候选独立执行，当前 `REAL_SERVER_VERIFIED=NOT_EXECUTED`、`USER_VISUAL_ACCEPTED=NOT_EXECUTED`。

| 场景 | 离线证据与下一步 | 真实步骤与必须记录的事实 |
|---|---|---|
| 普通媒体 | A1相关现有测试通过；新合并候选runtime待测 | 普通文件媒体A播放/暂停/恢复/seek/停止；source保持原生，三身份全程一致 |
| STRM Native | STRM识别、非STRM与transcode保护单测 | 规则miss后正常Native播放；Item.Path仅sidecar，MediaSource.Path保持source identity |
| CD2 DirectUrl | service URL/expiry/headers/预算、file-local UA contract | A有UA、B不同UA、C普通媒体；C不能继承UA/header，验证真实网络和播放 |
| CD2同源 | same-origin/path校验与fallback单测 | Direct不可用走同源；token不进入renderer/log，响应与媒体可读分别记录 |
| Mount / Native fallback | miss/timeout/transport不阻断fallback | CD2 miss→Mount命中；Mount miss→Native；Abort停止整条旧请求 |
| Pause/Resume/Seek/Stop | libmpv lifecycle与捕获流Stop测试 | 逐项动作→画面/时间→状态报告；Stop完成后旧回调不得重载 |
| Next/Previous | A1旧快照/pending/Stop排空回归通过 | A→B→Previous A、rapid Next/Stop，Started/Stopped按Item/MediaSource/PlaySession配对 |
| 音轨/质量换流 | PLAY-01 RED，正式版阻断 | 挂起换流PlaybackInfo→Stop→释放响应；修复后必须零新增load/报告/控制 |
| 字幕与章节 | 当前只有命令/参数局部覆盖，端到端UNKNOWN | 内嵌/外置字幕选择/关闭，章节前后跳转；核对画面时间和同会话/合法换流身份 |
| Session与远控 | 当前VM/fake消息和身份测试 | 实服Session回读、WebSocket命令递送、客户端执行、进度服务端读回分别记录 |
| 播放失败 | 错误和fallback离线单测 | 不可读文件、404、拒绝/超时、断网恢复；不得重启旧请求或污染下一媒体 |
| 正常关闭/Helper异常 | LIFE01/02新单测、私有假child通过 | idle/playing/stopped及真实helper异常，各child completion早于完整destroy；自然退出与残留单独验证 |
| 设置与IPC/外链 | SEC01/02定向通过 | 初始加载、设置路由、合法HTTP(S)、非法协议拒绝、frame/导航拒绝、关闭回归 |

## 新候选隔离runtime命令模板

需先从批准的新提交按现有固定输入构建唯一 runtime，并通过 provenance/package VerifyOnly。不要复用v0.2.7的运行结果给改变后的源码背书。以下是假服务隐藏运行模板，`candidate-runtime` 必须替换为验证过的目录名，并串行运行：

```powershell
powershell -NoProfile -File tools/test-p1-diagnostics.ps1 -RuntimeName candidate-runtime -Cd2Mode hit -Cd2DelayMs 400 -ProductCloseAfterPipeline -AboutAsync
powershell -NoProfile -File tools/test-p1-diagnostics.ps1 -RuntimeName candidate-runtime -Cd2Mode direct -Cd2DelayMs 400 -ProductCloseAfterPipeline -AboutAsync
powershell -NoProfile -File tools/test-p1-diagnostics.ps1 -RuntimeName candidate-runtime -Cd2Mode miss -Cd2DelayMs 400 -ProductCloseAfterPipeline -AboutAsync
```

本轮未构建该合并候选，以上命令 `NOT_EXECUTED`。必须读回 appData/userData/MPV_HOME隔离；不以时间推进代替可见首帧。

## 单独授权需求

真实验收需要指定候选、隔离登录profile、允许访问的Emby/CD2实例与样本、是否允许播放进度/Session写入和远控递送。凭据只能由获授权渠道在内存使用；报告只记录脱敏身份关联和结果。系统安装另需独立VM快照及安装/升级/卸载/重装范围授权。未获这些授权不执行真实服务、现用profile或安装脚本。

证据级别逐项使用 STATIC_VERIFIED、UNIT_VERIFIED、ISOLATED_RUNTIME_VERIFIED、REAL_SERVER_VERIFIED、USER_VISUAL_ACCEPTED、NOT_EXECUTED、UNKNOWN；FAIL须保存输入身份/退出码/日志，不用重跑成功覆盖失败。
