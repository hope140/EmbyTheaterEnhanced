# Stop 收尾归属与退出取证

日期：2026-10-09（UTC+8）。本轮从 `60acba55f6058789004748bde3df3a10a2348d04` 建立独立 `codex/stop-ownership-20261009`，版本保持 0.2.5。产品 sourceCommit 为 `68eb0249f8392480154513f3df267204a0f0eb74`；后续文档提交不替换该runtime身份。原工作树与 d480eb8 / 3ab10c9 产物保持。

## 已固定的局部 contract

PlaybackManager 的 request identity 继续决定哪个播放可以进入 metadata / player.play；被停止的 stream 对象决定旧会话的清理与 Stopped 归属，两者不能互相替代。replacement Stop 以 player 与捕获的 streamInfo 建立局部收尾记录，同一记录的物理 Stop 顺序执行，尚未开始且已过期的请求跳过。当前执行与最新请求仍分别走真实 Stop，以保留 Native presentation preparation。record 排空后领取一次清理、事件与报告；清空当前状态须满足对象身份相同，pending 状态保留清理事件但没有 Stopped 报告。

terminal Stop 仍同步失效请求，存在 replacement record 时纳入其收尾。物理 stopped 事件在 record 排空之前保持解绑，排空后使用既有 terminal handler 完成 queue、报告与 player removal。没有全局串行播放，没有更改 Item / MediaSource / PlaySession / source 替换规则。

原审核复算脚本及结果已逐字节复制到 `.work/stop-ownership/original-review/`，原件保留。它们是受控 fake Stop 的可复算证据，不证明真实客户端乱序必现。回归还要模拟真实 libmpv 的 stopped-before-Promise-resolution 顺序。

## 预定退出观测计划

本节在 runtime 观测前固定。保留原 stage/startup/total 与 outer 120 秒边界，所有运行串行、每次使用新的 appData/userData/MPV_HOME，不与构建或全量测试同时执行。

1. 原 d480eb8 runtime 使用新观测 harness，执行一次 hit 0ms 对照。
2. 新来源绑定候选执行一次五组矩阵，顺序为 miss400、hit0、hit400、hit800、direct400。
3. 共六次预定启动；没有退出复现时结束观测，历史超时原因保持 UNKNOWN。若失败，保留原目录与输入哈希，不为取得 PASS 重复同组；根据具体阶段证据决定是否需要最小修正及独立后续计划。

main 旁路仅写最多 32 条白名单阶段：结果写入前/写入返回、harness cleanup 完成、app.exit 请求/实际返回、before-quit/will-quit/quit/process-exit 观察。writer 失败不影响原退出调用，不记录 raw path/URL/stack。outer 记录精确 root PID/StartTime、固定 2 秒子进程快照、自然退出或强制清理、输出收集及最终残留。CIM CreationDate 的微秒精度只用于子进程观察匹配，root 强制清理仍要求精确 StartTime。

child 证据是固定时点的已观察进程，覆盖标为 `FIXED_2S_SNAPSHOT_NOT_EXHAUSTIVE`；缺失不能解释为该角色从未启动。零残留与自然退出分列，强制清理不改写为 PASS。正常产品关闭使用 main.js 的 before-quit/unregister/native-shutdown/app.quit 链；本轮 P1 终态继续使用原 harness app.exit，不能把它冒充正常产品关闭验收。

## 验收状态

同一份最终 16 项真实 PlaybackManager VM 回归：修改前 8 PASS / 8 FAIL，修改后 16/16 PASS。测试同时覆盖 stopped-before-resolve、burst stale admission、pending B 双 Stop、Stop 拒绝与监听恢复、terminal pending → Next、重复 terminal 拒绝传播，以及真实 transition 模块的 token 1/2 准备与最新 B 使用 token 2。原顺序/乱序 fake probe 和最初 5 项失败日志保留；新实现从物理 Stop admission 阻止乱序，不再让 B 在旧物理 Stop 未完成时开始。

完整 `npm test` 为 608/608，0 fail / cancelled / skipped，耗时 187,065ms。独立 GPT-5.6 Sol High 对产品覆盖器和最终测试进行复核，当前范围无未解决阻断项。source-level nonlocal/self-managed 分支保持原始 IIFE；没有这些播放器的额外运行时验收。

## 正式构建与产物

候选入口为 `dist/ETE-0.2.5-stop-owner-68eb024-win-x64/Emby.Theater.exe`。从固定提交blob执行正式build，完整vendor / GCC / Electron / production dependency closure校验通过；source/runtime/native provenance、package VerifyOnly及版本一致性通过。新旧runtime在运行前后均有2135清单项，加清单自身共2136文件，missing/extra/hashMismatch均0。

相对旧d480eb8，仅PlaybackManager和6份来源/清单记录改变；另2129文件相同，23个二进制全部同hash，包括Host、Electron44.4.2、Native Helper和libmpv。候选build-manifest SHA256为 `10054d7de3035d752f2bc73bf348c5ba325b830f90cd8d9e3bc355124879e752`。ignored比较脚本首版遗漏内部hash map导致一次工具失败；修复后使用真实产物复算，原失败日志保留，没有把它计作产品失败或覆盖产物。

## 六次固定运行结果

| 运行 | 播放/Session | 完整runner | pipeline耗时 | runner总耗时 | 残留 |
|---|---|---|---:|---:|---:|
| 旧d480eb8 hit0 | PASS | FAIL，120s退出超时 | 11,678ms | 121,843ms | 强清理后0 |
| 新miss400 | PASS | PASS，自然exit0 | 10,685ms | 11,866ms | 0 |
| 新hit0 | PASS | PASS，自然exit0 | 11,419ms | 15,274ms | 0 |
| 新hit400 | PASS | PASS，自然exit0 | 13,720ms | 14,825ms | 0 |
| 新hit800 | PASS | PASS，自然exit0 | 14,884ms | 15,966ms | 0 |
| 新direct400 | PASS | PASS，自然exit0 | 14,205ms | 15,291ms | 0 |

六次均由主线程对API records重新计算pipeline/session结果，普通、STRM和queue A/B/C每次各一对Started/Stopped，共5对；pending/incomplete/duplicate/unpaired/mismatched指标均0。新五组Next overlap、迟到metadata不额外play、精确CD2取消、顺序C和generation断言均通过。DirectUrl专用UA匹配，普通请求没有UA泄漏。

14份实际harness文件六次hash一致，并与交付工作树再次核对。appData/userData隔离、真实About version/sourceCommit、应用renderer归属均通过，所有记录的stage document.hidden=true。每轮诊断结构、request关联、有限Renderer错误位置和canary排除独立PASS，记录数分别127/98/127/128/128/128。原旧候选退出FAIL仍是FAIL；新五组PASS不与旧样本合并成六次全绿。

## 退出结论与边界

旧d480eb8本次hit0明确复现：退出observer的相对时间为result-persisted 11,698ms，app-exit-requested 11,699ms，Node exit与Electron quit回调11,705ms，app-exit-returned 11,707ms。outer在12秒及120秒仍未观察到OS根进程退出，120秒时原PID+精确StartTime匹配后才执行taskkill，最终0残留。强清理后的exitCode=1不能冒充app.exit(0)自然完成。

本次没有before-quit/will-quit观察，符合[Electron app.exit文档](https://www.electronjs.org/docs/latest/api/app#appexitexitcode)的该API语义；它区别于产品正常app.quit/before-quit/native-shutdown链。Node exit、Electron quit、app.exit返回均是进程内事件，不能替代OS退出。故障边界已缩小到 `AFTER_APP_EXIT_RETURN / OS_EXIT_TIMEOUT`，但根因仍 `UNKNOWN`。

尝试额外线程快照时根进程已由原deadline收尾，结果为 `OWNER_NO_LONGER_PRESENT_OR_MATCHED / UNAVAILABLE`。普通pipeline fixtureServer未按transition模式关闭、产品正常native shutdown未进入，只是静态候选；没有线程/活资源因果证据，不实施猜测性关闭或强杀后判PASS。新五组自然退出只提供本次候选通过样本，不能证明旧退出原因消失。本轮严格结束于预定六次启动。

真实 Emby/CD2、真实远控、可见首帧/连续性、HDR/多屏、系统安装与正常产品窗口关闭均未执行。当前交付为播放修复可审阅本地候选与有界退出证据，退出根因继续保留观察项。

## 可复算入口

结构化索引为 [stop-ownership-exit-20261009.json](evidence/stop-ownership-exit-20261009.json)，包含产品/基线提交、版本、runtime路径、14份harness哈希、六个独立证据目录、回调阶段、强制/自然分类、Session与generation向量、raw artifact SHA256及完整payload比较。

在本工作树执行 `node --test tests/playbackmanager-request-session.test.cjs` 重算当前16例。修改前覆盖器保存在 `.work/stop-ownership/original-review/baseline-patch-playbackmanager.cjs`，设置进程环境 `ETE_PLAYBACKMANAGER_PATCH_TOOL` 指向该文件后运行相同测试即可得到原补丁的失败判别；完成后移除该环境变量。全量原始日志为 `.work/stop-ownership/full-tests.log`；原始review probe、最初五例失败与最终相同16例的前后日志分别保留。运行后payload比较日志为 `.work/stop-ownership/runtime-comparison-after-runs.log`，汇总脚本为 `.work/stop-ownership/summarize.cjs`，只读原始证据后生成JSON并重算pipeline与Session。
