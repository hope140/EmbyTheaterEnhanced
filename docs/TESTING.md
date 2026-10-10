# 测试与验收

## 2026-10-10 — CI028 Hosted实际验收

固定db9ccde的push run38040747159：公开657/657（87文件发现81执行6材料NOT_EXECUTED），fail/cancel/skip/todo0；路径诊断、JS220、PS25、有限敏感268、diff均实际success而非skipped。Hosted5.1代码页1252旧无BOMParseFile21/执行1、BOM版两者0；PS7两个变体两者0；真实短名/物理差异及junction拒绝实测通过。新五case、旧排除、原RED、34产品输入及文档HEAD分层见 [远端记录](CI028_HOSTED_VALIDATION.md)。后续文档push/PR checks按各自HEAD回读，不重跑本地相同输入或重建b139runtime。

## 2026-10-10 — CI028 Windows兼容专项

代码固定 `5b1e092`：公开runner在仓库外真实8.3 TEMP中657/657（87文件发现、81执行，6份材料依赖NOT_EXECUTED），fail/cancel/skip/todo0，exit0；独立定向6/6，其余28项path case不计该pattern层已执行。JS220、PowerShell5.1与7各25、有限敏感268及diff通过。原Hosted626/652、原路径5/30、初步路径32/32以及实现期654/657均原样保留并区分输入，不能被最终GREEN覆盖。

旧reporter无BOM；本机PS5.1默认代码页936、PS7为65001，旧5.1成功只是locale观察。CP1252控制解码固定复现147:35失败，BOM后通过；两shell解析/合成执行及正文blob等价严格验证。两个生产validator未改变；真实junction仍拒绝。完整命令、原始结果、哈希和边界见 [CI028](CI028_WINDOWS_COMPAT.md)。新Hosted NOT_EXECUTED；34项构建输入和产品目录未变，不重建原b139d87 runtime。本轮未重新运行材料完整层、真实播放或安装专项，用户既有六项PASS保留USER_ACCEPTANCE_PASS。

## 2026-10-10 — 统一候选b139d87验收

最终完整离线723/723、独立核心119/119、实际构建manager字节48/48，均失败/跳过/取消0。公开CI本地652/652，85文件发现、79执行，6份材料依赖NOT_EXECUTED；新增PM测试位于原有排除文件，不改变selected输入，指纹明确，本机完整层均执行。JS217、PowerShell25、有限敏感265及diff通过，托管Actions未执行。

新固定来源构建、运行前后package VerifyOnly及八组隐藏隔离矩阵通过；自然退出/残留与阶段观察单列，五组pipeline共25对Session原始三元身份独立复算通过，2,138 payload文件运行后哈希一致。精确迟到门控仍为UNIT，普通Electron矩阵为ISOLATED_RUNTIME，实服/视觉/安装未执行。全部命令、旧/新输入层级、原始证据与READY边界见 [候选报告](INTEGRATION_028_CANDIDATE.md)。以下历史测试按原sourceCommit解读。

## 2026-10-10 — PLAY-01 固定源码验证

本地产品提交 `1a62f3d`：`node --test tests/playbackmanager-request-session.test.cjs tests/review-probes/play01-native-gates.cjs` 为46/46；`npm test -- --test-concurrency=1` 为681/681，无失败/取消/跳过。独立review另跑PM44、Native门控2、原Native lifecycle6通过。原探针修复前load2、修复后load1；Next/public Play、重叠请求、Stop后新Play、Session归属、Native创建/Resolver pending以及合法/迟到retry均使用受控gate验证。

本机已核验并准备固定vendor/preload，未缺材料跳过；Native门控探针在无输入时显式失败，单列于review-probes，未改变公开CI策略。固定源码构建通过，hit400/direct0/miss0三组隐藏隔离runtime均自然exit0/残留0，每组5对Session报告独立复算通过。精确迟到响应gate仍为UNIT_VERIFIED，真实服务/视觉/安装NOT_EXECUTED。完整命令、RED及实现期失败、输入hash、隔离runtime结果见 [PLAY-01报告](PLAY01_STOP_BOUNDARY.md)。下方上一轮RED及缺材料失败保持原基线事实，不能被本轮GREEN覆盖。

## 2026-10-10 — 独立审核的本地分支证据

测试输入与提交各自绑定，尚无组合候选：SEC01定向39/39（独立复核新12/12），SEC02定向148/148（独立复核新9/9），LIFE01 Native66/66，LIFE02 Native68/68（独立复核68/68与额外probe1/1）。PLAY-01独立安全断言保持RED（Stop后loadCount2而期望1），原公开checkout全量632项623通过/9缺材料失败，均未改标通过。初次工具/fixture失败另见 [交付记录](REVIEW_028_DELIVERY.md)。

公开CI层单列6份固定材料依赖文件；工程原始日志与最终CI计数见交付报告。快照工具仅合成目录测试通过，不等于系统四阶段验收。后续命令与逐场景标准见 [播放矩阵](RELEASE_ACCEPTANCE_MATRIX.md)、[安装卡](INSTALLER_LIFECYCLE_CARD.md)。新runtime、真实服务器、用户视觉与系统安装本轮均NOT_EXECUTED。

## 2026-10-10 — 0.2.7主线合并核验

PR #21已合入main，合并tree与获审阅发布HEAD一致；六棵产品/工具/测试目录树、34项构建输入与各自准确来源逐项核对，九份公开原始证据字节hash保持。详细身份见 [主线收尾](MAIN_CLOSEOUT_027.md)。本次没有新产品测试、runtime运行或构建；以下651/42/53及十组运行继续按原来源和层级记录。GitHub检查集合为空，不声称CI通过。

## 2026-10-10 — 0.2.7最终输入验证

产品sourceCommit d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0，最终夹具0e87d4f5b85ee136d1fe3d0ab47eaac25d64ac9d。完整单测651/651，工具42/42；八组新版本矩阵及两组最终隔离读回串行PASS，正常产品关闭均自然exit0/无强清理/残留0。原650/650与旧八组保持各自输入，新增MPV_HOME读回只对最终两组声明。准确命令/日志hash/来源/状态与各层边界见 [维护报告](MAINTENANCE_027.md) 和 [机器证据](evidence/maintenance-027-20261010.json)。

验证按变更范围和来源身份选择。纯文档审核只需核对事实、引用、diff、链接和敏感信息；产品、构建或测试输入变化时，执行受影响 gate。待复用证据所依赖的产品、构建和测试输入均未改变且身份已核对时，可按原 sourceCommit、实际输入、产物身份及原层级复用，保持原运行来源；源码/构建输入改变需新来源验证，测试输入改变需重新执行受影响 gate。静态、单测、隔离 runtime、真实服务、前台可见和系统安装各自记录，不能互相替代。

## 2026-10-09 v0.2.6主线整合

整合树从完整发布HEAD4b24919建立；本轮重新执行 `node --test --test-concurrency=1 tests/*.test.cjs`，完整日志631/631、0失败/取消/跳过，约238.7秒。准确环境、退出码、日志hash与其它静态检查见 [主线整合报告](MAIN_INTEGRATION_026.md) 和 [机器证据](evidence/main-integration-026-20261009.json)。下文保留各早期候选的测试阶段，不能将历史FAIL或UNKNOWN静默改为当前PASS。

原355f4e6的产品/工具/测试Git tree及34项构建输入与整合树相同；本轮只读核对原runtime2136文件、安装器以及八组运行69份原始artifact。三场景正常关闭与五组完整pipeline均是该准确产品的历史运行，本轮没有重启客户端或生成新sourceCommit产物。16份旧harness精确匹配原hash；新checkout6份CRLF/LF差异另记，不冒充相同物理输入的新运行。

完整产品验收和直接app.exit UNKNOWN见 [本地包报告](LOCAL_PACKAGE_026.md)，公开身份见 [发布记录](RELEASE_026.md)。真实Emby/CD2/远控、可见首帧/连续性、HDR/多屏与系统安装生命周期仍未取得本次证据。

## 2026-10-09 Stop 归属与退出分层取证

当前本地产品sourceCommit为`68eb0249f8392480154513f3df267204a0f0eb74`，版本0.2.5。最终PlaybackManager VM同一16例在修改前8PASS/8FAIL、修复后16/16；全量608/608，0失败/取消/跳过。VM执行真实vendor overlay，并联用真实Native transition模块验证token准备、旧Stop排空、terminal overlap/reject、pending及三身份配对；无法据此声明可见画面或实服通过。

正式构建、package VerifyOnly、版本及source/runtime/native/Electron来源验证通过。运行前后各2136文件（含manifest自身）完整匹配；对d480eb8仅PlaybackManager与6份来源/清单记录改变，23二进制一致。新runtime五组miss400、hit0/400/800、direct400完整PASS，均自然exit0/残留0，普通/STRM/A-B-C每轮5对完整Started/Stopped，pending/重复/未配对为0，迟到metadata不额外play。DirectUrl专属UA匹配且普通请求无泄漏。

固定旧d480eb8 hit0对照播放断言PASS但OS退出FAIL：约11.7秒app.exit与Node/Electron退出回调已经返回，120秒归属核对后强清理，残留0。六次运行的14份harness输入完全同hash、隔离与真实About读回通过；退出根因UNKNOWN，正常产品before-quit链没有被本harness执行。完整矩阵、输入哈希和复算说明见 [报告](STOP_OWNERSHIP_EXIT_EVIDENCE.md) / [JSON](evidence/stop-ownership-exit-20261009.json)。

## 2026-10-09 固定 v0.2.5 的新隐藏 runner

工具全量580/580及后续Stop间隔专项3/3通过，0失败/跳过。同一3ab10c9产品与相同13份harness输入分别验证hit 0/400/800ms、DirectUrl 400ms、miss 400ms；前四组PASS，miss因迟到PlaybackInfo再次调用player而FAIL，整体仍FAIL。保留该断言，后续产品修复必须重跑此失败例。

每轮runner结果、诊断结果、来源/隔离证据分开：五轮均退出且残留0，诊断127/128/128/128/111条分别通过；miss的日志通过不覆盖runner失败。五轮pending Stop均存在空session/缺MediaSource身份，不能泛称所有队列报告完整。详细预算、失败历史、命令和证据见 [隐藏runner记录](RUNNER_DETERMINISM.md)。这些运行不等价于真实Emby/CD2、真实远控、安装或可见首帧验收。

## 2026-10-09 v0.2.5 / 3ab10c9

新sourceCommit重新执行`npm test`，535/535通过；writer定向17/17，均0失败/跳过。两个独立runtime各2136文件全路径/hash一致，两份原始安装器175631770 bytes且同SHA256；A完整性与解包2136/2136通过，B为同字节对照。34项提交输入、四层来源、精确33+7包/1171文件与4份通知通过；版本gate、PE和真实About IPC均为0.2.5/sourceCommit匹配。运行后再次package VerifyOnly通过。

隐藏假服务首轮在queue-play达到25秒超时。新profile复验完成pipeline，但完整runner因next.selected=false和fake CD2 cancelCount=1仍NOT_PASS；与读回3b158f6历史原始失败的向量/计数一致。普通/STRM控制和身份/Session报告、generation接管与Stop防迟到加载断言通过，123条诊断及12项请求关联、两类安全Renderer位置、raw canary排除分别PASS。appData/userData在bootstrap前固定并读回，两次残留均0。离线合成分析COMPLETE；这些结果不等价于真实服务、系统安装或屏幕首帧。完整证据与发布资产见 [0.2.5发布记录](RELEASE_025.md)。

## 2026-10-09 构建复核候选1a05f88

最终`node --test --test-concurrency=1 tests/*.test.cjs`为535/535 PASS、0失败、0跳过；writer定向17/17，审核前构建定向50/50。两次独立build及package、输入与各层provenance、精确依赖目录均通过。runtime各2136文件路径/hash相同，两个原始安装器也完全同SHA；A完整性及解包2136/2136通过，B通过字节一致性关联该证据。原source文件mtime保留，使用Inno官方notimestamp控制容器元数据；没有后处理EXE。本轮不运行客户端或系统安装，详见 [构建复核](BUILD_REVIEW.md)。

## 2026-10-09 构建输入审计

`node --test tests/build-input-audit.test.cjs tests/tracked-product-sources.test.cjs tests/electron-runtime-input.test.cjs`：19/19 PASS。新工具14项覆盖missing/mismatch分层、路径/链接边界、异常元数据脱敏、额外文件名隐藏、输出独占、退役目录、大小写与通知命名；Node syntax与diff检查通过。

只读复核P1 fb10f92的source/runtime/native-helper/Electron validators通过，机器导出核对3归档、1009/51 vendor文件、73文件Electron及2149项payload通过。fresh npm闭包1142文件均匹配，P1另有20个Carnival long旧路径；完整node_modules40包根。未准备vendor的独立工作树报告INCOMPLETE，缺失材料不当作PASS。详见 [构建输入审计](BUILD_INPUT_AUDIT.md) 和 [机器清单](evidence/build-input-inventory-20261009.json)。本轮不重建runtime或安装器，不把历史播放/安装证据当作本轮实测。

## 2026-10-09 P2 离线阶段统计

`node --test tests/playback-timing.test.cjs tests/p1-runtime-diagnostics.test.cjs`：24/24 PASS。新增工具只读显式输入，不启动runtime或读取默认profile；覆盖严格输入上限、UTF-8、重复/缺失/过期归属、Stop/retire、时钟回退、零值、限流、跨启动歧义、字段投影和输出防覆盖。Node语法与diff检查通过。现存P1合成日志110条已用最终工具分析，交付报告与复算结果一致，详见 [P2阶段观测](P2_TIMING_AND_CAPABILITY_REVIEW.md)。本轮没有产品改动，不重建或重复运行P1播放/安装器验收。

## 2026-10-09 P0/P1 本地诊断候选

当前产品 sourceCommit `fb10f920a39112ff72b0f82715da8345702f634b`，版本 0.2.4。该提交串行全量 `node --test --test-concurrency=1 tests/*.test.cjs` 为 455/455 PASS，后续 runtime validator 专项 8/8；正式构建/provenance、假 CD2/合成媒体 pipeline、真实 JSONL 安全调用位置、整包扫描和安装器 2150/2150 文件比对通过。各层准确证据与首轮隔离偏差见 [P0/P1 交付](P0_P1_DELIVERY.md)。下方较早 candidate 文本保留原证据归属，不作为当前待办。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/test-p1-diagnostics.ps1 -RuntimeName ETE-0.2.4-p1-fb10f92-win-x64
```

该入口在启动前校验 source/runtime/native/Electron tree，显式绑定临时 appData/userData、使用 runtime 版本元数据和假服务，再通过产品 preload/main/logger 验证两类标准浏览器错误事件。原始消息/stack 不进入产品日志；不可用位置保留 UNAVAILABLE。隐藏运行的 native file-loaded/core-playing 不证明首帧，持帧 arm/clear 的单元证据不冒充可见窗口验收。首轮 APPDATA-only 日志追加偏差已记录，修正后核对现有日志 hash/length 不变。

## NextTrack transition artwork candidate

此 candidate 的 focused Node contract 覆盖 Backdrop 优先、Primary poster fallback、纯黑 fallback、`libmpv.stop(false)` 隐藏 surface 前的 overlay paint gate、当前 request 的 `core-playing` fade、连续调用时 stale transition ownership 和失败清理。比例修复测试断言 overlay 填满区域、图片 100% 宽高及 `object-fit:cover`/居中裁切，并验证图片加载失败仍保持黑底。修复后 focused playback/window `43/43 PASS`，`npm test 325/325 PASS`，相关 JS syntax 与 `git diff --check` PASS。

前台客户端未由自动流程启动。只有用户实际检查 NextTrack 时覆盖层是否及时盖住透明播放区、下一集首帧是否出现后淡出，才能记录 foreground visual acceptance；隐藏 runtime、DOM/unit test 与 provenance 均不替代该层证据。

## Electron 44 post-freeze-fix final candidate

当前 final candidate 固定为 source commit `725d4c2284596b8ced749a3c8590180a1e6ed1a9`，runtime `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate`，installer `EmbyTheaterEnhanced-electron44-725d4c2-final-candidate-setup.exe`。production freeze root boundary 为 `APPHOST STARTUP COMMAND CANONICALIZATION`；不得添加 video workaround，也不得把 loaded chain 的单一 statement 写成独立充分原因。

自动化门禁：`npm test = 233/233 PASS`；Collector、Issue Snapshot、CD2 observer、redaction self-tests PASS；focused apphost/Electron/Native Helper/window ownership `55/55 PASS`；Native Helper handshake/service/race/UA isolation/parent-death PASS，residual `0`。transport stress 的 `transport:stdout-end` 在 Electron 18、旧 Electron 44 candidate 和当前 candidate 均复现，单独记为跨版本 harness/environment evidence gap。

formal ordinary 和 CD2 miss 必须保留 rapid NextTrack `selected=false` 的 Electron 18 baseline limitation；只有 `priorStopped`、`nextStarted`、`rapidNextSettled`、`rapidNewestLoaded` 及其它 playback/control/report assertions 同时通过时，才记为 `BASELINE-MATCHED LIMITATION / NO NEW REGRESSION`。Formal STRM/CD2、Formal DirectUrl 和 UA isolation 均已通过。

新 installer 已安装到正式 `Emby.Theater.exe` 目录并完成 payload/profile 保留性核对。用户完成 HUMAN-ASSISTED FOREGROUND ACCEPTANCE，确认 video continuously advancing、audio、OSD、Settings、Pause/Resume、Seek、Fullscreen、Alt-Tab、Minimize/Restore、Resize、Stop、Normal Exit PASS；freeze、seek black frame、stop/exit black frame 未观察到。installed playback machine-log evidence 为 `UNAVAILABLE`，按当前口径不是 blocker；machine crash/residual 仍必须单独检查。不得把缺失日志伪造为 playback PASS，也不得用 hidden smoke 代替用户视觉确认。

## Electron 44.4.2 background candidate

Every formal runtime command first validates the exact official Electron tree and then launches the candidate `electron.exe` with `ELECTRON_RUN_AS_NODE=1` to compare Electron/Chromium/Node/V8 with `source-provenance.json`. Only after this passes does the hidden BrowserWindow smoke start.

```powershell
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1 -RuntimeName <electron44-runtime> -VerifyOnly
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName <electron44-runtime>
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName <electron44-runtime> -TestPipeline
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName <electron44-runtime> -TestPipeline -TestCd2
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName <electron44-runtime> -TestPipeline -TestCd2Direct
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName <electron44-runtime> -TestPipeline -TestCd2Miss
```

Hidden smoke never captures the screen. Visible capture remains a separate foreground/visual acceptance. Formal ordinary and CD2 miss retain the known Electron 18 baseline rapid NextTrack `selected=false` result while all four adjacent NextTrack assertions and all playback/control/report assertions pass; record this as baseline-matched rather than changing product behavior. Exact Electron 44 contract and preflight evidence are in [ELECTRON_44_UPGRADE](ELECTRON_44_UPGRADE.md).

## Phase 2B Pepper retirement（当前）

当前生产桥接结论为：`Pepper / PPAPI bridge = RETIRED`，`Native Helper = ONLY production bridge`。以下命令和结果属于 retirement 当前证据；本文后面的 2026-09-14 Pepper readiness 段落只保留为 historical archaeology，不再定义当前 runtime contract。

静态与单元回归：

```powershell
npm test
node tests/acceptance-readiness-selftest.cjs
```

当前代码提交 `7e130c4` 的 `npm test` 为 `201/201 PASS`。retirement regression 覆盖默认 `native-helper`、旧 mode 的确定性 `legacy-mode-removed`、PPAPI registration/old `<embed>` entrypoint 缺失、runtime exclusion 和 bridge-neutral readiness。

正式 runtime 验证使用唯一输出目录 `EmbyTheaterEnhanced-0.1.1-pepper-retired-20260917-7e130c4`：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build.ps1 -OutputName EmbyTheaterEnhanced-0.1.1-pepper-retired-20260917-7e130c4
powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-pepper-retired-20260917-7e130c4 -VerifyOnly
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-pepper-retired-20260917-7e130c4 -TestMedia
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-pepper-retired-20260917-7e130c4 -TestPipeline -TestCd2
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-pepper-retired-20260917-7e130c4 -TestPipeline -TestCd2Direct
```

结果为 source/native/runtime provenance PASS、package verify PASS、payload `2135` entries（含 `build-manifest.json` 实际 `2136` files）；`electronapp/libmpv/x64/mpv-win32-x64.node` 不存在，`electronapp/native-helper/ete-mpv-helper.exe` 与 `electronapp/libmpv/x64/mpv-1.dll` 存在。普通 local media pipeline、CD2 hit pipeline、DirectUrl pipeline、Pause/Seek/Resume/Stop、getStats、generation、Session/report fixture 均 PASS。CD2 miss pipeline 的播放与控制通过，但保留既有 rapid NextTrack `selected=false` limitation，不纳入本轮修复。

独立 Native Helper Electron smoke 使用同一 runtime 通过：handshake、private pipe、native surface attach、`gpu-next/d3d11`、Pause/Unpause/Seek、generation accepted stale events `0`。REAL 最小 regression smoke 使用同一 product runtime，`inspect/select/play/pause/seek/resume/next/stop` 全部 PASS，readiness `class A`，bridge-ready observed，Session/report 与 WebSocket controls 通过，runner `completed`、`verified-clean`、owned residual `0`。

## Native helper bridge

纯 Node contract：

```powershell
node --test tests/native-helper-protocol.test.cjs tests/native-helper-client.test.cjs tests/native-helper-service.test.cjs
npm test
```

真实 native/Electron 测试使用 production source 编译的 helper、当前 candidate 锁定 Electron 44.4.2、锁定 libmpv 与生成媒体。Electron 18.3.15 的既有结果保留为 historical baseline。入口包括：

- `tools/native-helper-electron-smoke.cjs`：handshake、native HWND、structured property、gpu-next/D3D11/d3d11va、Pause/Unpause/Seek/Stop 与视觉 capture。
- `tools/native-helper-service-smoke.cjs`：main service 的 resize/maximize/restore/fullscreen/minimize、OSD mouse/focus。
- `tools/native-helper-race-smoke.cjs`：A→B、A→B→C、Stop during load、crash/recreate 各 20 iterations。
- `tools/native-helper-transport-smoke.cjs`：framing、backpressure、stderr、malformed input/output 与 pipe close。
- `tests/native-helper-parent-death.ps1`：exact Electron parent termination 与 helper EOF cleanup。
- `tools/native-helper-file-local-ua-smoke.cjs`：A UA→B UA→same-origin default，无跨媒体泄漏。

上述 synthetic/native gate 不替代正式 source-commit build、installer、REAL Emby playback、Session/reporting、remote control、NextTrack、10+ minute、HDR 或 mixed-DPI acceptance。

## Deterministic generation fixture

```powershell
node --test tests/generation-fixture-observer.test.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName <verified-runtime> -TestPipeline -TestCd2
```

observer unit 覆盖 listener+native-generation+pending overlap gate、settle-before-gate rejection、pre-generation listener gate，以及不改变 transport Promise 的 fake CD2 in-flight/cancel gate。formal fixture 关联 Play #1/2 requestId、generation retirement、PlaybackSuperseded、listener remove/callback-after-takeover、current-generation completion 与 Stop matching cancel；不使用固定 sleep 推断 overlap。Stop-barrier candidate 不属于该测试修复。

## Native ready diagnostics generation boundary

```powershell
node --test tests/native-helper-client.test.cjs tests/diagnostics.test.cjs tests/native-helper-diagnostics-playback.test.cjs
```

测试覆盖 generation=null skip、current-generation exact set/expand/read、stale/retire between awaits、non-generation error reject、legacy fallback，以及真实 libmpv Player + native client 的 delayed STRM/CD2 flow。integration case 要求 ready diagnostics 在 beginGeneration 前完成且无 mutation/bridge_error，随后 generation、fake CD2 HTTP load、current-generation core-idle=false 与 player ownership 全部通过。该规则不替代 protocol/helper crash、generation retirement 和 full runtime pipeline gate。

## Runtime BrowserWindow ownership

```powershell
node --test tests/runtime-window-ownership.test.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName <verified-runtime> -TestPipeline
```

ownership test 用 fake BrowserWindow 覆盖 exact packaged index identity、query/hash、file-other/data/http auxiliary、stable binding、destroy 后 replacement、application-only probe 与脱敏 classification。runtime report 的 `windowOwnership` 与 `harnessInjection` 必须显示 application owner/probe 1，允许 auxiliary 大于等于 0，但 auxiliary pipeline injection 必须为 0。Native helper surface 的创建与安全配置保持 production 原行为。

## Optional playback Stats targeted checks

```powershell
node --test tests/libmpv-stats.test.cjs
```

该测试加载真实 AMD `libmpv.js`/Player，确认一个 optional property 的精确 `property-unavailable` 只使对应 Stats field 缺失，其余 category 与 structured number/boolean/string/map/array/INT64 string 继续返回；非 `property-unavailable` 错误仍使 `getStats()` reject。它不改变或替代 direct/global `getProperty()`、helper transport/protocol/generation tests。

## [历史 Phase 1] 自动检查命令与结果

以下默认 runtime 路径和 152/152 属于该阶段，不是当前任务的固定入口或通过数量；开工时选择准确产物、目标版本和受影响测试。

```powershell
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1
python tools/probe-libmpv.py dist/EmbyTheaterEnhanced-win-x64/electronapp/libmpv/x64/mpv-1.dll
```

单元测试覆盖属性无回复、空值、桥接异常、监听器释放、日志脱敏与重复脱敏、外置插件读取旧配置/进程执行的封锁、External Player process-chain dead channel/helper absence 与 `shell.openUrl` protocol contract，以及 STRM/CD2 Resolver 的判定、Windows/UNC/POSIX mapping、DirectUrl/UA/header/expiry、RPC/transport reject、共享 deadline、Abort/cancel/late callback、DirectUrl → same-origin → Mount → Native、Transcode、POSIX candidate 不进入 Windows Mount、persistent profile inspect 安全枚举、prepared preload source-of-truth、readiness A/B/C/D/E 证据分类、persistent STRM config store、IPC trust boundary、secret redaction、longest-prefix、source identity precedence、legacy `ETE_CD2_ENABLED` 只迁移 `cd2.enabled`、AUTO/USER/DISABLED、per-rule strategy order、bounded authenticated connection probe，以及 CD2 client/Find/download 阶段 timing、各阶段 timeout 与 persistent CD2 miss → Mount 的 `cd2Reason` 保留。Phase 1 另外覆盖缺失 Web payload、base hash drift、canonical app transform、重复生成幂等、ignored source 不进入 tracked scope、prepared/runtime tamper、source provenance tamper、dirty tracked source 隔离、binary blob 原始字节和 LF/CRLF checkout 等价。当前为 152/152。全部 tracked JS/CJS 与 PowerShell 脚本执行 syntax check，并由实际 Windows PowerShell 5.1 build/package verify 验证。

Phase 1 clean reproducibility 使用 normal 与 fresh detached worktree 分别执行相同 prepare/test/build 流程，tracked-source follow-up 后两个 runtime 的实际 2,131 个文件逐路径 SHA256 仍为 `missing=0`、`extra=0`、`mismatch=0`。另一次实际 dirty-worktree build 证明未提交的普通 `src/electronapp` bytes 被忽略，runtime 使用 HEAD blob。这里属于 build/provenance/package 静态与隔离 runtime 证据，不替代真实 Emby 播放、Session/WebSocket 或远控验收；本任务没有修改这些产品链路。

## STRM resolver settings targeted checks

```powershell
node --test tests/strm-resolver-settings.test.cjs
```

该 suite 覆盖 config schema/version、独立 secret 文件、legacy env bootstrap（包括 `ETE_CD2_ENABLED=0` 时 resolver enabled、CD2 disabled 与 Mount fallback）、USER persistent precedence、路径边界和大小写语义、最长前缀、mount replacement、cloud-first、mount-first、custom order、Native fallback、Abort、CD2 direct/same-origin mode reuse、规则测试、trusted renderer IPC 和 bounded read-only connection probe。测试只使用 synthetic paths/token，token 不进入测试输出。

## STRM settings runtime boundary

较早候选 HEAD `295626753089de9f70c2cb28b5c5954be51b3843` 已执行 synthetic Electron pipeline 并通过，覆盖 persistent config bootstrap 后的 DirectUrl fake hit、CD2 HTTP fake hit、CD2 miss → Mount/Native fallback、PlaybackManager/Session/controls/reporting/cleanup。source identity precedence 修复后的 final-head hidden Electron synthetic runtime smoke 因 timeout 未完成，记录为 `Final-head synthetic runtime smoke: NOT COMPLETED — hidden Electron smoke timeout`，按限制未重试；该 timeout 不判定产品功能失败。真实 settings page 的 native-window 自动化在当前环境不可用，真实服务器 cloud-first/mount-first 播放也不在本分支宣称范围内。

## Acceptance readiness harness

正式 runner 为 `tests/readiness-acceptance.ps1`，每次只启动一个属于本次 run 的 Electron root PID，并以 `ProcessStartInfo` 传入已隔离 runtime、acceptance profile 和 CEC 路径。runner 维护 wall-clock deadline，超时只清理 exact root process tree，不按进程名全局终止；无论 Electron 是否进入 harness、崩溃或超时，都在 `.work/readiness-runs/<run-id>/` 生成 `runner-result.json`、`stdout.txt` 和 `stderr.txt`。`acceptanceReportPresent=false` 只表示产品 acceptance report 缺失，不会让 runner 无限等待。

合成生命周期检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/readiness-acceptance.ps1 -Synthetic -TimeoutMs 1200 -RunPrefix synthetic
node tests/acceptance-readiness-selftest.cjs
node tests/acceptance-terminal-race-selftest.cjs
node tests/acceptance-terminal-integration-selftest.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File tests/readiness-acceptance.ps1 -Synthetic -SyntheticResult success -RunPrefix synthetic-success
powershell -NoProfile -ExecutionPolicy Bypass -File tests/readiness-acceptance.ps1 -Synthetic -SyntheticResult failure -RunPrefix synthetic-failure
powershell -NoProfile -ExecutionPolicy Bypass -File tests/readiness-acceptance.ps1 -Synthetic -SyntheticResult identity-mismatch -RunPrefix synthetic-pid-mismatch
powershell -NoProfile -ExecutionPolicy Bypass -File tests/pid-reuse-descendant-selftest.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tests/readiness-acceptance.ps1 -Synthetic -SyntheticCimUnavailable -SyntheticResult cim-unavailable -RunPrefix synthetic-cim-unavailable
```

当前 observer 记录安装时间、Native Helper ready signal、`enhancedDiagnostics` wrapper/direct callback、prepared preload sticky state、native surface lifecycle、core-playing/video-progress、resolver console marker 与可观察到的 loadfile。bootstrap signal 不替代 authoritative `bridge-ready`；模块解析和 `play-called`、`surface-created`、manager/playback alternate evidence、`resolver-result` gate 由 `tests/live-acceptance-browser.js` 解释。`bridgeReadiness.status` 明确区分 `observed-ready`、`inferred-ready-from-authoritative-state`、`not-ready`、`observer-missing`、`unavailable`，A/B/C/D 和 stale-run synthetic 均通过。outgoing loadfile 继续如实记录为 unavailable，不降低 readiness 标准。

Clean-room 与 readiness 详细命令、source-of-truth、ignored input 分类和真实矩阵见 `docs/CLEANROOM_REPRODUCIBILITY.md`、`docs/READINESS_OBSERVABILITY.md`。

inspect acquisition 使用现有 `window.ConnectionManager.currentApiClient()`（必要时 `window.ApiClient`）、单次 canonical `require(['playbackManager'])` 和 `window.Events`，每个对象独立记录 source/result；不使用三模块 batch require、自动扫描或新的 AMD resolver。现有可重复 fixture 覆盖 profile inspect 的 client lookup；global API、single PlaybackManager require 与 PlaybackManager global fallback 是 acceptance flow 的受控代码路径和 real artifact 证据，不在文档中宣称有独立 fixture 覆盖。

2026-09-14 旧版 `module-acq-20260914-061651157-ec84996` iteration 中 `inspect=PASS`、`select=PASS`、`play-called=seen`；三项 acquisition 分别为 `window.ConnectionManager.currentApiClient/available`、`amd-require:playbackManager/available`、`window.Events/available`。后续观察到 embed、authoritative ready 和 manager-play resolved，但 flow 在 `resolver-entry-timeout` 停止，`loadfile` 未观察；因此没有新增完整 PlaybackManager/Session/WebSocket/远控或 DirectUrl 全链通过证据。该 iteration 的 runner 达到 240000ms deadline 后按 exact root process tree 清理，报告、stdout/stderr 存在，ownership inspection=ok，residual=0。

静态复核补充：该 run 的默认 runtime 是 `dist/EmbyTheaterEnhanced-0.1.1-final-win-x64`，其中实际 `libmpv.js` 没有 `strmResolver.resolveAsync` 或 resolver marker；当前 resolver-bearing runtime 为 `dist/EmbyTheaterEnhanced-0.1.1-readiness-b-main-20260914`，其 `libmpv.js` 与 `src/electronapp/plugins/libmpv.js` hash 一致。故该 run 的 resolver missing 首要归类为 runtime provenance，而不是产品 resolver regression。当前 source 的 resolver call 在 `libmpv.js:647`，decision log 在 `:677`，loadfile 在 `:788-790`；observer 把 decision log 命名为 `resolver-enter`，并因 `embed-command-hook-failed` 无法权威观察 outgoing loadfile。未执行第二次真实 acceptance。

current-main verification runtime：`dist/EmbyTheaterEnhanced-0.1.1-readiness-main-20260914` 从 HEAD `c880b97757be422ae818fe30b3a335003e41227b` 构建，`libmpv.js`、`strm-resolver.js`、`cd2-resolver.js`、`enhanced/cd2-service.js` 四项 source/runtime SHA256 均 MATCH，resolver directory 存在，`resolveAsync` 与 resolver-result marker 存在。runner 对旧 `final-win-x64` 的 fail-fast negative 已通过，未启动 Electron。`resolver-enter` 已更名为 `resolver-result`；loadfile observation 为 `unavailable`，不再作为硬 gate。

runner terminal lifecycle：以 `acceptance.json` 的 `completed=true` + terminal classification 作为唯一终态；terminal success/failure 后等待 300ms flush window 并清理 exact owned root tree，只有没有 terminal report 才到达 deadline。cleanup 先验证 root PID 的 CreationDate，再允许 observation/descendant registration；root missing、PID reuse 或 CIM unavailable 时不观察、不登记、不 kill descendants。synthetic success/failure/timeout 均通过，成功与明确失败为 `runnerResult=completed`、`timedOut=false`，真正 hang 为 `runnerResult=timeout`、`timedOut=true`，均 `cleanupStatus=verified-clean`、residual=0。PID CreationDate mismatch、PID-reuse-with-descendant 与 CIM unavailable 都 fail closed，后两者为 `cleanupStatus=unverified`、`ownershipVerified=false`、residual 未知，不能被记为完整 success。

旧 artifact `readiness-main-20260914-070236533-48d1e60e`：`inspect=PASS`、`select=PASS`、`isStrm=true`、`play-called`、`embed-created`、`pepper-ready`、`manager-play-resolved`、`resolver-result` 全部通过；`loadfileObservation=unavailable`，acceptance 结果为 `success`。该 run 使用旧 runner lifecycle，最终 `runnerResult=timeout`，总耗时 `242507ms`，residual=0。

较新的 artifact `terminal-real-20260914-073146032-27837240`：同一 acceptance 主链字段通过，`loadfileObservation=unavailable`，acceptance 结果为 `success`；terminal report 在约 `14150ms` 被识别，runner 总耗时 `15959ms`，`runnerResult=completed`、`timedOut=false`，exact root cleanup 后 residual=0。上述两个 artifact 属于不同 runner iteration；本轮 follow-up 不运行真实 acceptance。

follow-up 的静态 provenance/lifecycle 检查：full manifest 覆盖 `src/electronapp` 的 818 个文件与 2 个 Start wrapper，共 820 个 scope entries；`package.json` 与 PlaybackManager 的构建改写分别记录为明确 overlay，sourceCommit、validatedProductScope、baselineIdentity 分开保存，vendor baseline、node_modules production closure、Electron runtime binaries 与 native mpv 不纳入该 scope。`provenance3-20260914` positive validation、绑定旧 sourceCommit 的 `provenance2-20260914` partial-stale negative validation、terminal race、`inspectProfile` integration race、losing-writer、CIM unavailable、synthetic success/failure/timeout 与 PID mismatch 均通过；没有新增真实 acceptance。

## [HISTORICAL] CloudDrive2 PR #4 DirectUrl

安全门探针：

```powershell
旧 `tools/test-libmpv-file-local-ua.ps1` 已随 Pepper retirement 删除；当前 file-local UA contract 由 `tools/native-helper-file-local-ua-smoke.cjs` 覆盖。
```

该段是 historical Pepper probe 记录；当前 Native Helper smoke 继续验证 UA-A、UA-B 与无 file-local option 的 same-origin C 无跨 source 泄漏。

fake DirectUrl 产品链使用 `-Visible -TestPipeline -TestCd2Direct`。既有有效运行覆盖 DirectUrl source、required UA、普通媒体 same-origin/no-leak、Pause/Seek/Resume/NextTrack/Stop、generation/cancel 与 19 条模拟报告。本轮按当前源码重建的 runtime 已进入 resolver 并观察 DirectUrl 请求、UA 匹配和 no-leak，但在切换第二个 fixture source 时 UI smoke timeout；不把该次整体记为全链通过，项目继续把每次有效与失败 evidence 分开保留。

真实分层 smoke 使用 persistent profile 选择两个既有 STRM 样本，但只将一个 `MediaSource.Path` 在 renderer 内交给 trusted CD2 IPC，不输出路径、URL、query、UA 或 token。结果为 `sourceKind=direct-url`、returned UA present、expiry present、path accepted、format present、core-idle=false、time-pos advancing。`ETE_CD2_DIRECT_URL=0` 的 same-origin 重试两次均停在新 embed 的 `bridge-not-ready`，未发送 loadfile；same-origin fallback 继续由 unit/fake 与 PR #2 既有真实证据支持。

完整 `tools/accept-live.ps1 -AuthorizedLivePlayback` 复测多次在 `manager.play()` 45 秒界限内返回 `playback-not-started`，resolver 记录为 0；刷新率协议单独返回正常。这是 resolver 前阻塞，既不证明 DirectUrl/fallback 失败，也不构成本轮 Session/WebSocket/controls/reports 通过证据。

## CloudDrive2 PR #2

最终候选 runtime 为 `EmbyTheaterEnhanced-0.1.1-cd2-resolver-final-review`，重复构建为 `EmbyTheaterEnhanced-0.1.1-cd2-resolver-final-repeat`。依赖/transport smoke：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
dist/EmbyTheaterEnhanced-0.1.1-cd2-resolver-final-review/x64/electron/electron.exe tools/cd2-runtime-smoke.cjs dist/EmbyTheaterEnhanced-0.1.1-cd2-resolver-final-review
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

该 smoke 在 frozen Electron 18.3.15 / Node 16.13.2 中加载 grpc-js 1.14.4、proto-loader 0.8.1 和最小 proto，启动本地 fake gRPC server，验证 Bearer metadata、`FindFileByPath`、`GetDownloadUrlPath(false)`、deadline、URL result 与 0 native addon。

CD2 hit、Mount fallback 和 Native fallback 必须串行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-cd2-resolver-final-review -TestStopBeforePlayer
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-cd2-resolver-final-review -Visible -TestPipeline -TestMount -TestCd2
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-cd2-resolver-final-review -Visible -TestPipeline -TestMount -TestCd2Miss
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-cd2-resolver-final-review -Visible -TestPipeline -TestCd2Miss
```

Stop-before-player 独立进程将 PlaybackInfo 保持 pending，terminal Stop 后释放，验证 `player.play` 未调用且没有 Playing report。CD2 hit 结果：普通视频保持 native；STRM source 切到 fake same-origin URL；Item/MediaSource/MediaSourceId/PlaySessionId、Pause/Seek/Unpause/NextTrack/Stop 与 19 条报告保持；7 次 resolve 中 3 次 active call 被新 Play/双 NextTrack/Stop 取消，退出时 0 active；旧请求、旧 `core-playing` listener、late result 与 unhandled rejection 均未影响最新 source。两个 miss 夹具分别验证 Mount 与 Native。

真实 CD2 smoke 只从本机既有配置在内存读取 token，并用临时环境变量提供一条 mapping。`tools/cd2-real-smoke.cjs` 仅调用两个 V1 RPC、HEAD 和单字节 Range；最终结果为 mapping hit、same-origin HTTP、HEAD 200、Range 206、无重定向。真实路径、URL、query、token、媒体名与账号不写入仓库或公开 evidence。

`tools/cd2-media-diagnostic.cjs` 使用有限候选独立验证真实 CD2 media。最终 `mkv-medium` 结果：pathAccepted、file-format=MKV、13 tracks（1 video/1 audio）、core-playing、core-idle=false、cache state/time 与 time-pos advancing，未观察 EOF/error。bridge 不直接暴露 start-file/file-loaded/end-file/log-message；file-loaded 由 format+track list 推断。2026-09-14 使用同一个 persistent acceptance profile 的 inspect 返回 `logged-in`，通过现有 `mapLocalPath` 和 CD2 只读 RPC 验证同一条 source-side mapping 后，两个真实 Emby POSIX STRM 样本均 `cd2_hit`；embedded libmpv/core-playing、Session/WebSocket/controls/reports 全部通过。

test-runtime 使用真实 frozen Electron，独立 profile 和 APPDATA，不读取现有客户端登录信息。检查 Web 应用就绪、libmpv 注册及 externalplayer 未注册。隐藏窗口可能不生成可用截图，因此脚本如实记录 screenshotAvailable，不将空 PNG 视为视觉验收。

可见合成视频测试入口：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -Visible -TestMedia
```

测试生成 64×64、30fps、5 秒 Y4M 样本，通过原 libmpv 插件独立实例检测播放推进、暂停、seek、恢复、停止。0.1.1 测试使用子进程 MPV_HOME，断言 bilinear 和 ETE-CONFIG-PROBE 标记实际生效，并逐项核对 900/2048/3072/4096/8192MiB 的 native 文本值。初版仅 APPDATA 隔离失败的结论已由此修正。测试不修改个人配置或系统环境变量。

## 本地播放链集成测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-strm-mount-resolver-final5 -Visible -TestPipeline
```

使用真实 PlaybackManager、已注册 libmpv、ApiClient 播放上报序列化与 input/api.js 消息分派；fixture 在 127.0.0.1 随机端口仅提供生成的 Y4M。服务器 API 响应、上报递送与 WebSocket 消息投递由内存 fixture 代替，OSD 路由因没有登录环境而单独替换为已完成 Promise。产品源码没有为测试跳过 PlaybackManager。

普通视频与 STRM 两种 Item 元数据均走 DirectPlay。默认夹具不提供 Mount sidecar，验证 STRM 的 native fallback；加 `-TestMount` 时生成同目录本地 Y4M 文件，检查插件 `currentSrc()` 已切换到确定性本地 source。两种模式都断言 Item/MediaSource 保留、开始/进度/停止报告、ItemId/MediaSourceId/PlaySessionId 一致，以及 Pause/Seek/Unpause/Stop 下行与对应状态上报。NextTrack 断言旧项停止、新项启动和新 PlaySessionId。该测试验证客户端链路，不代表真实服务器创建了 Session，也不是 WebSocket 网络或 WatchTogether 双端验收。

Mount 命中夹具：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/test-runtime.ps1 -RuntimeName EmbyTheaterEnhanced-0.1.1-strm-mount-resolver-final5 -Visible -TestPipeline -TestMount
```

UI/runtime 测试必须串行执行。测试输出只保留在 `.work` 隔离目录，不进入公开 evidence；启动后应确认没有残留 Electron/host 进程。

构建和哈希检查可以独立执行。原有无服务器的 DirectStream fixture 和隐藏窗口超时记录保留，最新通过证据见状态文档。

## 历史第一轮验收分层

| 层级 | 第一轮结果 |
|---|---|
| 输入哈希与解包 | 通过 |
| 诊断/外置入口/STRM Resolver 单元测试 | 43/43 通过 |
| JS 语法与 PowerShell 构建 | 通过 |
| 两次独立 runtime 载荷一致性 | 1013 文件一致 |
| Inno 编译与载荷复核 | 通过，1012 载荷文件一致 |
| Electron UI 启动与插件注册 | 通过 |
| DLL 版本/API 查询 | 通过 |
| 隐藏窗口合成视频 | 超时，未取得 bridge ready；保留失败证据 |
| 可见窗口合成视频 | 5 项播放器动作通过，实际截图已检查 |
| Windows host 启动 | 通过：host 存活、4 Electron 进程、诊断日志 |
| 本地 PlaybackManager / 消息分派 / 上报集成 | 普通视频、STRM native fallback、NextTrack 通过；模拟服务器 API |
| 隔离 runtime Mount 命中 | 普通视频、STRM Mount、Session/control 通过；本地 Y4M fixture |
| 真实 Emby native fallback smoke | 非管理员登录、WebSocket、DirectStream native fallback、Pause/Seek/Unpause/NextTrack/Stop 和 10 条报告通过；real Emby Mount hit pending |
| 安装/升级/卸载 | 用户授权独立目录通过，快捷方式、注册表及载荷核验通过；卸载后清理核验通过 |
| 真实普通视频与 STRM Native | 两集 STRM DirectStream 通过，普通文件库内无样本 |
| 真实 Session/远控/WatchTogether | 实服命令、WebSocket、客户端与服务端回读通过；WatchTogether 按用户确认的后台控制口径 |
| 配置隔离、缓存诊断、GPU 输出 | MPV_HOME 标记与 5 档容量通过；gpu-next/D3D11 已取得，真实 shader/HDR 待验收 |
| CD2 unit/fake | 43/43；transport reject fallback、Abort、cloudPrefix root、POSIX mapping/candidate、POSIX 不进入 Windows Mount、profile inspect 安全枚举、fake gRPC/HTTP、deadline/cancel/late 与 URL 校验通过 |
| CD2 frozen runtime | grpc-js/proto-loader require、fake unary/metadata、CD2 hit、Mount/Native fallback、generation/controls/reports 通过 |
| CD2 可重复构建 | final/repeat 各 2156 个 manifest 载荷，逐文件 SHA256 0 差异；0 runtime native addon |
| CD2 installer payload | 隔离编译/解包，2157 个 `{app}` 文件与 runtime 逐哈希一致；setup SHA256 `6f908cd85945dcecf220f9841496d94e447f2848977cf80d03560b7567a5d351`；未执行系统安装 |
| 真实 CD2 只读 smoke | mapping/RPC/same-origin URL/HEAD 200/Range 206 通过；无 refresh 或设置修改 |
| 真实 Enhanced + CD2 media | 独立 MKV core-playing、tracks、cache 与 time-pos advancing 通过 |
| 真实 Emby + CD2 | inspect `logged-in`；两个样本均 `cd2_hit`/CD2 URL；embedded libmpv/core-playing 与 playback advancing、Session/WebSocket/Play/Pause/Seek/Resume/NextTrack/Stop、两个 Item/MediaSource/PlaySession identity 和 10 条报告全部通过 |
| PR #4 DirectUrl unit/fake | 56/56；DirectUrl/UA/header/expiry、一次 reacquire、timeout/Abort/late、same-origin fallback 通过 |
| PR #4 frozen file-local UA | UA-A → UA-B → same-origin C 均播放推进；NO LEAK |
| PR #4 real DirectUrl 分层 smoke | persistent-profile 真样本返回 required UA/expiry；embedded libmpv path/format/core-playing/time advancing 通过 |
| PR #4 real Emby 全链 | `manager.play()` 在 resolver 前 timeout；Session/WebSocket/controls/reports 未取得本轮通过证据 |
| Acceptance runner/observer | terminal success/failure/timeout synthetic 与 observer self-test 通过；current-main runtime validation 通过，inspect/select/play-called/resolver-result/manager-play-resolved 主链通过；loadfile observation unavailable，不作为 gate；runner completed/timedOut=false/residual=0 |

后续可见测试结果及最新状态以 PROJECT_STATUS 和 DEVELOPMENT_LOG 为准。隔离 runtime 的 Mount 命中不替代真实 Emby 服务器 Mount 验收。

## 最小真实 Emby Smoke

使用现有 Enhanced 登录态执行，不在命令行、仓库、文档、fixture 或公开 evidence 中保存服务器参数和认证信息。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/accept-live.ps1 -AuthorizedLivePlayback -RuntimeName EmbyTheaterEnhanced-0.1.1-strm-mount-resolver-final5
```

本次结果：登录态非管理员、WebSocket 在线；2 个 STRM 样本的 `Container=mp4`，`MediaSource.Path` 为当前规则不可解析的 other 形态；真实播放保持 `DirectStream` 和 URL native source，故 real Emby Mount hit pending。Play、Pause、Seek、Unpause、NextTrack、Stop 全部通过，10 条播放报告被服务器接受，停止后状态清理通过。没有修改服务器配置、媒体库、权限或元数据。

2026-09-14 PR #2 follow-up 使用新的 persistent profile inspect。检查只在 API client 存在且 `getCurrentUser()` 成功返回用户对象时报告 `loggedIn=true`；失败只返回 `logged-in`、`not-logged-in` 或 `inspection-error` 等安全枚举，不输出 server URL、账号、token、cookie、localStorage 或 raw exception。只读 mapping 诊断确认两个样本共享一条稳定 prefix mapping，relative suffix 保持，边界/`..`/POSIX case sensitivity 通过，两个 CD2 target 均为 regular file，HEAD 200、Range 206 且无重定向。随后真实验收两个样本均 `cd2_hit`，source kind 为 CD2 URL，embedded libmpv/core-playing、Play、Pause、Seek、Resume、NextTrack、Stop、Session/WebSocket 回读和 10 条播放报告全部通过。`Item.Path` 仅用于 sidecar identity，未用于替代 source mapping。

实际安装测试脚本 `tools/test-installer.ps1` 仅在用户授权后传 `-AuthorizedInstallTest`。它拒绝已有测试目录、安装记录、快捷方式、运行 host 或已有 Enhanced profile，以免污染已有数据；本次测试结束保留了 Enhanced profile，不能不经检查直接重复该脚本。没有自动删除 profile。安装过程使用当前已提权上下文，未验证 UAC 提示交互或 Program Files ACL。

## 真实 Emby 测试卡

2026-09-13 用户授权任意库内样本，说明全库 STRM，并将 WatchTogether 验收口径确认为后台控制正常。真实测试已通过，详见 LIVE_ACCEPTANCE.md。普通文件无库内样本，不伪装成已做实服验证；双客户端同步精度未单独测试。

## [HISTORICAL] 2026-09-14 Pepper readiness diagnosis

当前 main 的验证 runtime 为 `EmbyTheaterEnhanced-0.1.1-readiness-diagnosis-e9e2ad2`，由 HEAD `e9e2ad221ed5059574f830e9ffd9ef0dd5c8a22c` 构建，启动前 full provenance 校验通过（820/820 scope entries）。三次 timing run 使用同一 runtime 和同一 commit：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/readiness-acceptance.ps1 -AuthorizedLivePlayback -Methods inspect,select,play,stop -RuntimeName EmbyTheaterEnhanced-0.1.1-readiness-diagnosis-e9e2ad2 -RunPrefix readiness-A -TimeoutMs 180000
```

将 `RunPrefix` 改为 `readiness-B`、`readiness-C`，其余参数不变。三次均 provenance=passed、acceptance=success、runner=completed、cleanup=verified-clean、residual=0。observer 额外记录 embed creation observation、attached/disconnected、unique count、recreation/duplicate 以及 lifecycle timing；不修改产品 instrumentation。核心结论是 `play→embed=4535–5996ms`、`embed→authoritative ready=2–3ms`，所以当前只能确认主要抖动在 embed 前置层，不能确认其单一根因。loadfile outgoing 仍为 `unavailable` observability gap，不作为 gate。完整脱敏结果见 `docs/PEPPER_READINESS_DIAGNOSIS.md`。

## [HISTORICAL] 2026-09-14 Pepper ready listener race follow-up

在 `fix/pepper-ready-listener-race@731dc2a` 上执行：

```powershell
node --test tests/native-helper-lifecycle.test.cjs
```

该段只保留旧 listener race 的历史背景；当前回归使用 `native-helper-lifecycle.test.cjs`，不再创建旧 Pepper endpoint。历史 readiness root cause 不代表当前 production bridge。
