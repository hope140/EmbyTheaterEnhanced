# v0.2.9 外挂字幕竞态修复整合

日期：2026-10-11（UTC+8）。本记录仅覆盖 A 修复进入独立候选与 PR 的验证，不是版本发布记录。

## 来源与范围

Fetch 后 `origin/main` 仍为 `888310de8ebae941b407ae070102b84d4fec1e5e`。独立分支 `codex/v029-subtitle-integration` 以此为基准，执行 `cherry-pick -x 11a1c508c2942b0fca35f971f58c1eec16e6aa03`，得到修复提交 `100179cc794a866e54e4bd7318e673d1cb0a7371`。原提交父级为只含研究文档的 `a512a07429e7b5841eec0743b5a29e29b93b20a2`。

冲突仅在 PROJECT_STATUS 与 DEVELOPMENT_LOG 的顶部文档上下文。解决方式是把原提交新增的 A 段落应用到当前 main，保留 main 其它内容，未引入父提交的并行研究内容。源码、测试、探针与合成证据直接来自原提交。原研究和独立真实验收工作树及未提交材料继续保留。

产品 diff 仅为 `src/electronapp/plugins/libmpv.js` 的 5 行增加、1 行删除：每次真实字幕选择开始时递增序号并捕获 MediaSource；700ms 延迟结束后，仅在 Play、最新字幕选择和 MediaSource 三者同时匹配时提交原 `sub-add`。原等待、命令参数、内嵌字幕 sid、音轨 aid、PlaybackManager、Native Helper IPC、Session 和缓存参数保持原行为。旧命令一旦已提交给 Helper，不由此守卫撤回。

## 等价性与真实验收复用

原修复与整合提交所有 `docs/` 以外的受版本管理路径逐项 Git mode/type/blob/path 清单完全一致，不只比较单个函数。`libmpv.js` 的共同 blob 为 `e9968e9ff24c6099008f57dac7f56327f3e8e0ca`。原研究父级相对 main 只改文档，所以调用方、Native Helper、测试、依赖、锁定输入与构建生成器均保持原字节。匿名证明见 [整合证据](evidence/v029-subtitle-integration.json)。

据此复用独立工作树上 `11a1c50` 的真实 Emby 验收。它使用真实服务器与内容不同的 ASS 简/繁外挂字幕，相邻快速操作为 101.8–110.2ms：

| 真实场景 | 原候选结果 |
|---|---|
| A→B | PASS，最终 B |
| A→Off | PASS，最终无字幕 |
| A→B→A | PASS，最终 A |
| 快速 Stop | PASS，旧字幕命令未提交，Helper 退出、服务端播放项清空 |
| 换集并选择 B | PASS，旧集命令未覆盖新集 B，Item/MediaSource/PlaySession 归属更新 |

原独立代码审核 PASS；真实状态证据又由独立审核复核通过。五组 Playing/Stopped 身份配对、API/WebSocket 暂停/恢复/停止、内嵌字幕 Off/On、aid 1→2 与有限连续画面均通过。实体遥控器硬件、主观听感和长时逐帧稳定性未验收。真实媒体截图和原始本机回执保留在原验收树；公开证据仅保留匿名汇总及原报告哈希。

本轮不构建新 runtime，不把旧 runtime 改标为新提交。原实际运行产物的 sourceCommit 始终是 `11a1c50`，本轮结论是代码等价性支持复用历史真实验收，不是新提交的运行产物验收。后续若新构建，必须从其真实提交重建并生成新的 provenance。

## 回归验证

原 Phase 1 的 8 项未修复版为 4 PASS / 4 FAIL。本轮独立审核将基线 Git blob 在进程内替换到完整 11 项测试，得到 RED 4 PASS / 7 FAIL（预期 exit 1）；同一测试对应修复版 strict GREEN 11/11。磁盘源码没有为 RED 改写，未修改或削弱原断言。

本轮针对代码提交 `100179c` 完成公开离线 668/668、六个材料依赖文件 71/71，共覆盖全部 88 个测试文件（82+6）、739 个测试，最终 fail/cancel/skip/todo 均为 0。另行执行 PLAY-01 32/32、独立审核相关核心子集 99/99，均通过；Native Helper、Session 与受影响播放测试由上述全集覆盖。没有机械重复执行相同的 `npm test` 全集。

新工作树初跑缺少 ignored vendor/preload 输入的失败日志继续保留；固定 vendor 清单验证后，使用正式 `prepare-preload.cjs` 准备忽略输入，最终重跑全部通过。依赖锁安装与所用 Carnival、Patch、Electron、Native Header、33 个生产包输入审计通过。公开 CI 原有六个材料文件排除清单未改变，不能把仅在本机执行的材料项记为 Hosted PASS。

独立整合源码审核 PASS，无新增发现；所有非文档 Git 输入及 34/34 锁定构建输入与原修复一致。后续证据提交仅改文档，测试结果的执行来源保持 `100179c`。

静态检查：JavaScript 223 文件、PowerShell 7 与 Windows PowerShell 5.1 各 26 文件、有限凭据模式扫描 272 文本文件，以及工作区和分支 diff whitespace 均通过。有限模式扫描不宣称能识别所有秘密。

## 远端检查与剩余问题

最终远端状态以本 PR 当前 HEAD 的 Hosted checks 为准，本地通过不替代远端结果。PR 的代码与测试验证完毕后普通推送，Hosted 完成后回读最终 HEAD、基准与逐项检查；本轮不自动合并。

B 的内嵌字幕/音轨切换延迟尚未修复，本 PR 不含其性能实验代码。直接 Helper 的 1–15ms 不能作为用户体感数据；下一次真实 115 使用仍需匿名动作/来源路由、T0–T4（缺测为 UNAVAILABLE）、时钟误差、有限缓冲/错误数据与实际可见或可听变化。没有新增 B 网络实验。

产品版本仍为 0.2.8；v0.2.8 Tag 与 Release 保持原状态。本轮没有安装或覆盖现用客户端。
