# 统一修复候选与验收

日期：2026-10-10（UTC+8）。分支 `codex/integration-028-candidate`；固定候选sourceCommit为 `b139d87da06cfba153a828766926b78230be4a0f`。开工实时远端main为 `0b782ddec404f4148cb6c8c16f19bc22201d3252`，v0.2.7产品为 `d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0`；两者产品目录及package/lock一致。本次只整合已完成修复和补足组合验收，不改版本、不合入main。文档收尾HEAD与此固定产物来源分别记录。

## 整合顺序、来源与冲突

每项先核实完整SHA、父提交、涉及文件及实际diff，再从实时main独立cherry-pick `-x`，逐项检查diff；顺序如下。

| 顺序 | 原始提交 | 原始父提交 | 候选提交 | 归属 |
| --- | --- | --- | --- | --- |
| 1 | d875ba5 | 0b782dd | 4493939 | 独立审核报告，无产品代码 |
| 2 | 4683ca1 | d875ba5 | c09856c | SEC-01 外链允许HTTP(S)、错误收口 |
| 3 | 4d79411 | d875ba5 | 7fd893c | SEC-02 主frame/包内文档/导航门槛 |
| 4 | 100e658 | d875ba5 | 075b406 | LIFE-01 rejected退出后仍清理本地资源 |
| 5 | 0cd3e75 | 100e658 | 6601d5d | LIFE-02 terminal-owned退出加入pending集合 |
| 6 | 46d0668 | d875ba5 | 6bbe051 | CI-01 公开离线检查 |
| 7 | db8f017 | d875ba5 | 43e8158 | 文档、历史TODO、验收卡、只读snapshot工具及探针 |
| 8 | 1a62f3d | db8f017 | 331bb52 | PLAY-01 请求意图、换流owner及terminal屏障 |
| 9 | 777cbb5 | 1a62f3d | 8efa698 | PLAY-01 原始分支验收记录 |
| 10 | 本轮新增 | 8efa698 | c603251 | 两种Stop拒绝时序的公开Play结束/恢复测试，71行追加 |
| 11 | 本轮新增 | c603251 | b139d87 | 真实Next/Previous的两种迟到响应顺序，61行追加 |

人工冲突清单：**0**。Git自动合并了SEC01/SEC02共享的main与外置播放器测试，以及SEC02/LIFE01/LIFE02共享的service。主线程复核最终合并diff，独立review核对来源等价：七项普通patch-id一致；SEC02受SEC01相邻上下文影响，零上下文patch-id一致；db8f017中的四份相同专项文档已先存在，因此没有重复add增量，其全部21个源文件在对应候选提交的blob仍与原始提交相等。

PLAY01生成器canonical blob始终为 `3aebd838f5a3eec9195c77446cbaab0ca2b8e5c2`；canonical SHA256为 `1bc0075189cd0c2504ea337ab7c3eb45b5bb70d15d7fdbfd46dab7cd47495c9d`，Windows checkout CRLF SHA256为 `23f8860f2126be3f6a74c05632b7b93625310f4ccd047238fbc0d6d6f44d18bc`。区别仅为换行，产品修复没有在整合中改写。所有原测试保留，仅追加四项组合门控。

## 保持的contract与实际变化

Stop同步失效之前所有播放意图；公开Play在前置异步准备前领取独立request身份，换流各继续点检查捕获stream/sequence/owner。Stop后明确新Play可以启动；慢Stop期间等待其完成，拒绝时等待中的Play明确失败、屏障清空，后续新Play恢复。重复Stop共享原完成/拒绝并保留物理Stop错误对象。公开Play既有失败路径未承诺保留同一reason，本轮保持其行为。

真实队列Started索引在C metadata pending期间仍为B，Previous正确请求A。新增受控case分别释放C与Previous A，两者在Stop后均无新增load、Playing或Stopped；A/B/D各一次完整身份配对。Session、ItemId/MediaSourceId/PlaySessionId、STRM→DirectUrl/CD2→Mount→Native规则及同ID正常换流保持。

SEC01仅收口外链协议及shell错误；SEC02只增加当前webContents的mainFrame/包内index权限及导航限制。webSecurity、contextIsolation、sandbox、nodeIntegration、宽preload与CSP的既有兼容性边界保持，完整隔离迁移仍待单独设计。LIFE01在所有owned退出settled后继续清理全部监听器/surface，再优先传播原owned错误；LIFE02覆盖terminal解绑先行的owned child。未改变kill策略或generation接口。

相较v0.2.7，产品diff仅为上述main/enhanced IPC/Helper service和PlaybackManager生成器；libmpv、Resolver、Session/WebSocket、Native C++、安装器、package/lock及固定vendor清单无变化。其它增量是CI、测试、snapshot工具和文档。四类第三方材料仍WAITING_EXTERNAL。

## 离线验证

| 验证 | 结果 | 输入与层级 |
| --- | --- | --- |
| 最终全量 `npm test -- --test-concurrency=1` | 723/723，失败/跳过/取消0 | b139d87；UNIT_VERIFIED |
| 独立核心定向 | 119/119，失败/跳过/取消0 | b139d87；UNIT_VERIFIED |
| 最终PM | 48/48 | b139d87；UNIT_VERIFIED |
| 构建产物中的PM直接门控 | 48/48 | 读取实际runtime的manager字节并核对manifest hash；UNIT_VERIFIED |
| 原PLAY01 load探针 | Stop及旧响应前后均1次load | b139d87；UNIT_VERIFIED |
| 公开CI本地runner | 652/652，失败/跳过/取消0 | 85文件发现、79执行、6材料文件NOT_EXECUTED |
| JS语法 / PowerShell语法 | 217 / 25文件通过 | STATIC_VERIFIED |
| 有限敏感模式 / diff | 265文件及main→候选diff通过 | STATIC_VERIFIED |

本机固定vendor/preload齐全，完整离线测试没有因缺材料漏跑。公开runner执行时HEAD为c603251；之后唯一增量是被明确排除的PM文件，79份selected文件与所有产品、工具、fixture输入均未改变，指纹单列于public-input-identity.json，未重复执行相同子集；最终完整全量以b139d87重新执行。早阶段721/721与117/117保留原身份，不混成最终计数。GitHub Actions实际托管运行NOT_EXECUTED。

```powershell
npm ci --ignore-scripts --no-audit --no-fund
node tools/ci-public-tests.cjs
npm test -- --test-concurrency=1
node --test tests/playbackmanager-request-session.test.cjs
node tests/review-probes/change-stream-stop.cjs
node tools/ci-syntax.cjs
pwsh -NoProfile -File tools/ci-powershell-syntax.ps1
node tools/ci-secret-scan.cjs
# 设置CI_PULL_REQUEST_BASE=0b782dd完整SHA及CI_EVENT_NAME=pull_request
node tools/ci-diff-check.cjs
```

核心119命令包含PM、review-probes/play01-native-gates、native-helper-service、native-helper-terminal-join、native-helper-lifecycle、external-url与renderer-boundary七个文件；原始命令见证据索引。诊断脱敏、DirectUrl header隔离、CD2同源及fallback、安装器来源检查均在最终全量执行。确定性门控使用deferred/gate，不以sleep构造竞态或删减失败断言。

## 构建、隔离runtime与最终结论

结论：**READY_FOR_USER_ACCEPTANCE**。运行产物固定为 `dist/INTEGRATION-028-b139d87`，sourceCommit为b139d87完整SHA；版本字段仍0.2.7，仅代表本地统一测试候选。来源不同的PLAY01/v0.2.7 runtime通过证据不用于本候选。

`pwsh -NoProfile -File tools/build.ps1 -OutputName INTEGRATION-028-b139d87` 正式构建exit0。34项构建输入、88项维护产品source、Electron44.4.2完整树、libmpv、原生工具链、精确依赖与通知来源通过。payload2,138文件，包含build-manifest共2,139；payload set SHA256为 `76a7db798219b1e2d706211fdac341df25ee2fde85b73d3b76097218c530ec11`。

运行前后均执行 `pwsh -NoProfile -File tools/package.ps1 -RuntimeName INTEGRATION-028-b139d87 -VerifyOnly`，来源/版本/依赖/路径集合及逐文件哈希通过，没有生成或执行安装器。所有case在bootstrap前核对独立appData、userData和MPV_HOME，使用既有隐藏runner与离线服务；测试未操作现用配置或前台客户端。

| 隔离case | 结果 | 原始Session独立复算 | 诊断记录 / 准确request关联 |
| --- | --- | --- | --- |
| idle | PASS，自然exit0、无强清理、残留0 | 不套用完整pipeline的5对门槛 | 不套用pipeline诊断门槛 |
| playing | 同上 | 正常关闭专用validator通过 | 同上 |
| stopped | 同上 | 正常关闭专用validator通过 | 同上 |
| miss400 | 同上 | 5对 | 99 / 10 |
| hit0 | 同上 | 5对 | 128 / 12 |
| hit400 | 同上 | 5对 | 128 / 12 |
| hit800 | 同上 | 5对 | 128 / 12 |
| direct400 | 同上 | 5对 | 129 / 12 |

矩阵使用既有 `tools/test-p1-diagnostics.ps1`：前三组 `-NormalClose <case>`，其余 `-ProductCloseAfterPipeline`；每组对应mode/delay并开启 `-AboutAsync`。准确八条命令和GUID证据目录见 [机器证据](evidence/integration-028-candidate.json)。真实mainFrame中的维护查询、复制/导出观察均PASS；copy/dialog/update transport使用固定隔离fixture。诊断canary由可信主frame发送并通过脱敏验证，不代表真实服务器或完整renderer隔离。

主线程从五组原始报告分别按ItemId/MediaSourceId/PlaySessionId独立分组，合计25对，均恰好一次Playing先于一次Stopped。运行后2,138个payload哈希及2,139文件总数一致，最终候选路径进程扫描残留0。独立source review与最终119项原始日志复核通过；主线程完成最终实际diff、来源关系、原始结果、Session和payload验收。本轮测试/构建/矩阵没有失败或跳过，早阶段通过记录及所有原分支失败证据保留原来源。

PLAY01精确迟到时序还对实际构建manager字节运行48项既有断言：source hook指向runtime，临时guard核对build-manifest的sourceCommit及manager hash，并保证复制字节与runtime相等，不重复patch，也不修改断言。此项为**UNIT_VERIFIED**，八组普通Electron运行记**ISOLATED_RUNTIME_VERIFIED**；没有声称在Electron内注入了迟到PlaybackInfo。Native异常退出/重复拒绝为生产service/client加受控owned假child的UNIT证据，真实Helper崩溃没有注入。

Node24.18.1、npm11.17.0、PowerShell7.6.5。全部原始日志/退出码/固定输入与原始报告保存在该独立工作树 `.work/integration/` 及各 `.work/p1-runtime-*`，公开索引仅列相对路径、字节数和SHA256。文档收尾不改变固定构建/产品/测试输入，因此不重建或再次执行相同全量。

收尾文档预检首次exit1：检查覆盖整个历史DEVELOPMENT_LOG，命中了原有绝对路径。未修改历史证据；新路径检查改为本轮增加内容，完整文档的250条本地链接与有限敏感模式仍核对，修正预检exit0。首次失败和修正日志分别保存在final-doc-check与final-doc-check-v2，没有覆盖失败记录；此项不是产品测试、构建或runtime失败。

需要回滚时，可在整合分支使用 `git revert` 回滚相应候选提交；LIFE02先于LIFE01回滚，SEC02移除后须同步其测试fixture，PLAY01与其组合测试按各自提交处理。原分支和所有原提交保留；未合入main时不采用此分支即可。此处仅说明方式，本轮未执行回滚。

最终范围：真实Emby/CD2、实际远控、字幕/章节内容、可见首帧/连续性、显示专项、安装/升级/卸载/重装均NOT_EXECUTED。安装器源与payload校验不等于安装生命周期验收。完整renderer隔离、材料缺口、历史app.exit UNKNOWN及显示DEFERRED保持原边界。候选只准备交用户实际验收；push/PR/main整合/Release/现用安装均未执行。
