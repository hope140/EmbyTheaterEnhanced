# 下一正式版验收矩阵

日期2026-10-10（UTC+8）。统一本地候选b139d87已完成723项离线、119项独立核心及八组新隔离runtime，READY_FOR_USER_ACCEPTANCE，见 [候选报告](INTEGRATION_028_CANDIDATE.md)。下方原阶段的“待构建/RED”按当时来源解读；精确PLAY01门控当前为UNIT_VERIFIED，真实场景仍未执行。原 [独立审核](INDEPENDENT_REVIEW_028.md)保留。

## 可执行离线层

在统一候选独立工作树运行，下列命令只运行 Node 测试。首次依赖准备为 `npm ci --ignore-scripts --no-audit --no-fund`；使用 package-lock，不升级依赖。缺少固定输入应报告缺失，不复制真实profile。

```powershell
node --test tests/strm-resolver.test.cjs tests/cd2-service.test.cjs tests/native-helper-lifecycle.test.cjs tests/product-session-identity.test.cjs
node --test tests/app-bootstrap.test.cjs tests/installer-lifecycle-snapshot.test.cjs
```

snapshot与CI入口已整合到本地候选，公开层见PUBLIC_CI.md。完整PlaybackManager VM需要manifest对应vendor Web输入；可设置进程内ETE_PLAYBACKMANAGER_SOURCE指定输入后运行。PLAY01原探针 `tests/review-probes/change-stream-stop.cjs` 在原基线为RED/exit1，在本候选为GREEN/exit0且load始终1；两个来源记录分别保留。

## 场景与通过标准

所有真实场景均按新候选独立执行，当前 `REAL_SERVER_VERIFIED=NOT_EXECUTED`、`USER_VISUAL_ACCEPTED=NOT_EXECUTED`。

| 场景 | 离线证据与下一步 | 真实步骤与必须记录的事实 |
|---|---|---|
| 普通媒体 | 统一离线回归及新runtime普通播放/关闭通过 | 普通文件媒体A播放/暂停/恢复/seek/停止；source保持原生，三身份全程一致 |
| STRM Native | STRM识别、非STRM与transcode保护单测 | 规则miss后正常Native播放；Item.Path仅sidecar，MediaSource.Path保持source identity |
| CD2 DirectUrl | service URL/expiry/headers/预算、file-local UA contract | A有UA、B不同UA、C普通媒体；C不能继承UA/header，验证真实网络和播放 |
| CD2同源 | same-origin/path校验与fallback单测 | Direct不可用走同源；token不进入renderer/log，响应与媒体可读分别记录 |
| Mount / Native fallback | miss/timeout/transport不阻断fallback | CD2 miss→Mount命中；Mount miss→Native；Abort停止整条旧请求 |
| Pause/Resume/Seek/Stop | libmpv lifecycle与捕获流Stop测试 | 逐项动作→画面/时间→状态报告；Stop完成后旧回调不得重载 |
| Next/Previous | 统一确定性双响应门控通过，新runtime快速切集/Stop与原始身份配对通过 | A→B→Previous A、rapid Next/Stop，Started/Stopped按Item/MediaSource/PlaySession配对 |
| 音轨/质量换流 | 源transform/构建manager门控GREEN；真实服务待验收 | 挂起换流PlaybackInfo→Stop→释放响应；必须零新增load/报告/控制 |
| 字幕与章节 | 当前只有命令/参数局部覆盖，端到端UNKNOWN | 内嵌/外置字幕选择/关闭，章节前后跳转；核对画面时间和同会话/合法换流身份 |
| Session与远控 | VM/fake消息与身份测试；新runtime原始Playing/Stopped独立复算25对 | 实服Session回读、WebSocket命令递送、客户端执行、进度服务端读回分别记录 |
| 播放失败 | 错误和fallback离线单测 | 不可读文件、404、拒绝/超时、断网恢复；不得重启旧请求或污染下一媒体 |
| 正常关闭/Helper异常 | LIFE01/02受控假child通过；新runtime idle/playing/stopped自然退出、残留0 | 真实helper异常，各child completion早于完整destroy；自然退出与残留单独验证 |
| 设置与IPC/外链 | SEC01/02定向通过 | 初始加载、设置路由、合法HTTP(S)、非法协议拒绝、frame/导航拒绝、关闭回归 |

## 新候选隔离runtime命令模板

需先从批准的新提交按现有固定输入构建唯一 runtime，并通过 provenance/package VerifyOnly。不要复用v0.2.7的运行结果给改变后的源码背书。以下是假服务隐藏运行模板，`candidate-runtime` 必须替换为验证过的目录名，并串行运行：

```powershell
powershell -NoProfile -File tools/test-p1-diagnostics.ps1 -RuntimeName candidate-runtime -Cd2Mode hit -Cd2DelayMs 400 -ProductCloseAfterPipeline -AboutAsync
powershell -NoProfile -File tools/test-p1-diagnostics.ps1 -RuntimeName candidate-runtime -Cd2Mode direct -Cd2DelayMs 400 -ProductCloseAfterPipeline -AboutAsync
powershell -NoProfile -File tools/test-p1-diagnostics.ps1 -RuntimeName candidate-runtime -Cd2Mode miss -Cd2DelayMs 400 -ProductCloseAfterPipeline -AboutAsync
```

以上为参数模板；本轮已执行候选b139d87的八组准确命令，见专项报告/证据索引。appData/userData/MPV_HOME均隔离读回；没有以时间推进声称可见首帧。

## 单独授权需求

真实验收需要指定候选、隔离登录profile、允许访问的Emby/CD2实例与样本、是否允许播放进度/Session写入和远控递送。凭据只能由获授权渠道在内存使用；报告只记录脱敏身份关联和结果。系统安装另需独立VM快照及安装/升级/卸载/重装范围授权。未获这些授权不执行真实服务、现用profile或安装脚本。

证据级别逐项使用 STATIC_VERIFIED、UNIT_VERIFIED、ISOLATED_RUNTIME_VERIFIED、REAL_SERVER_VERIFIED、USER_VISUAL_ACCEPTED、NOT_EXECUTED、UNKNOWN；FAIL须保存输入身份/退出码/日志，不用重跑成功覆盖失败。
