# v0.3.0 Stable readiness

日期：2026-10-12（UTC+8）。总体状态 **`BLOCKED_WITH_EVIDENCE`**。工程整合、独立审查、完整回归与内部候选已完成，可以执行隔离 Windows 和真实 Together 验收；分发材料及最终 Stable 放行门禁尚未闭合。

## 源码、PR 与 CI

| 身份 | 值 |
|---|---|
| 实际远端 main / PR28 merge | `a8ba606c0bb4d8c4540ff7f9ad17eccb3d35db50` |
| 原 Together 产品修复 / 整合提交 | `31d11073fb33dad17bbaefec37f7260dafb8d50e` → `5288fb9530ce389d0bf22bf431f01a76341cf928` |
| 原工具/证据收尾 / 整合提交 | `a31163bf68ba684c3e274a0be4f9e8a378be6c04` → `c27755cf6c5ccdef0246dcd822afaea2890c8e73` |
| 原分支与依赖 | 本地 `codex/p1-remote-presentation-20261011`；共同基线 `6eb11b9350889bc4152c22c68bf7e204f3c1bce5`；相对新 main 无其它前置产品提交 |
| Audio 边界修正 | `68a0026b6fa65e965aa5a7d6ce7cdf91f6de8545` |
| 准确内部候选 sourceCommit | `322a037cdccb39ad57923bcd7551d9954ba815bd` |
| 新分支与 PR | `codex/v030-stable-readiness-20261012`；[PR29](https://github.com/hope140/EmbyTheaterEnhanced/pull/29)，OPEN、未合并 |

两笔原提交均以 `cherry-pick -x` 保留身份映射；实际冲突仅为 PROJECT_STATUS/DEVELOPMENT_LOG 新增记录，双方内容保留。原工作区、旧隔离包和现用客户端保持原状态。

候选 sourceCommit 两次 Hosted `windows-public-offline` CI 为 SUCCESS：[push](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38158220590)、[PR](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38158231771)。收尾文档 HEAD 的最新 CI 以 [PR Checks](https://github.com/hope140/EmbyTheaterEnhanced/pull/29/checks) 和本地 `.work/v030-readiness/final-remote.json` 最终回执为准；候选产物始终绑定上表 sourceCommit。

## 修改和实测

生产改动仅 `nexttrack-transition.js`、`libmpv.js` 的 presentation hooks 与 `patch-playbackmanager.cjs` 统一替换 overlay：same-player Video 在物理 Stop 前准备持帧，公开 Play 接管已有意图，按 request/token 清理失败、取消及 prepared 阶段15秒期限。独立审查发现并关闭 B Video pending→C Audio 的继承持帧排除问题，Audio 在物理 Stop 前按自身 request ID 清理。Session/Item/MediaSource/PlaySessionId、Resolver、消息分流和 native one-shot reveal 合同沿用。installer、package/lock、Native C++、Helper service/client/controller、核心 build/package 相对 main 产品 diff 为0。

| 检查 | 实际结果 |
|---|---|
| 完整适用回归，`node --test --test-concurrency=2 tests/*.test.cjs` | **783/783**；fail/cancel/skip/todo 均0 |
| 核心四文件 / 独立七文件审查 | **126/126 / 138/138**；[独立报告](V030_INDEPENDENT_REVIEW.md)，无未关闭明确产品问题 |
| 新增实际分支 | Helper exit 清理、Helper rebuild 的旧 prepare 隔离、重叠 Video→Audio RED→GREEN |
| 本地/远控 Next/Previous、PlayNow、A→B、快速 A→B→C、旧 Stop 中新 Play、失败/超时/取消/用户 Stop/成功移交 | [覆盖表](V030_PRESENTATION_COVERAGE.md)，保持真实传输验收边界 |
| 合成 installer guard / Windows 原生语言初始化 | **12 项断言 / 7 场景**；中文/英文选择与升级保护合同通过 |
| JS / PS5.1 / PS7 语法、有限敏感模式扫描、diff check | **225 / 28 / 28 / 276 文件**通过 |
| 新候选隔离 runtime，假 DirectUrl 服务 | ordinary/STRM、Pause/Seek/Resume/Stop、Session/21条报告、serial/rapid Next、stale metadata、精确取消和 UA 隔离通过 |

像素观测使用合成Y4M、独立profile/appData/MPV_HOME，只记录 composited-screen-video-roi 色类/hash。A→B/B→A：PlayNow81/79帧、最大间隔39/59ms；远控Next/Previous74/78帧、46/60ms；本地79/75帧、45/60ms。三轮非旧/新视频样本均0，均 **WINDOWED_SYNTHETIC_VISUAL_PASS**。全屏47/48帧、409/386ms，所采非视频样本0，但仍 **INCONCLUSIVE**；100ms门槛不变，未扩大重试。四轮owned residual均0（本地轮清理1自有子进程）。有限采样不能证明所有现场无瞬态闪屏。

首个视觉命令因未显式给绝对fixture路径被preflight阻止、未启动Electron；修正调用后通过。验包辅助检查首次误将锁定npm原包tests归为项目harness，另一次混计Messages/CustomMessages；修正检查范围后通过，产物字节未改。原日志保留。最终产品/测试后重跑783整轮，旧轮781仅保留原身份。

## 内部候选与来源

从准确 `322a037…` 实际新构建 `dist/ETE-0.3.0-internal-20261012` 和 `dist/ETE-0.3.0-internal-322a037-win-x64-setup.exe`，不是正式 main 发行附件。

| 产物 | 身份 |
|---|---|
| Installer | 175,636,053 bytes；runtime/PE版本0.3.0；Authenticode **NotSigned** |
| Installer SHA256 | `dc3627ffc21d8560b3d9d03f64433fc628bfe5f5e2fb1cd5cc73adfc470c5eb0` |
| Build manifest SHA256 | `dcd94ea61592cbbd4cc1ad0a76a699b19169bfd3eaa00a7a4d1bb81f9707dc1f` |
| Payload set SHA256 | `2a9185188f296b3da0da4818041915ab869e3c3fae323a272a3afa53d0b8a38a` |
| 解包 | 2138 payload + manifest，完整 **2139 路径/hash 零差异** |
| 工具链 / Helper | Inno6.7.3、UCRT64 GCC16.1.0-5完整6990文件锁；正式Helper `testing=false`，SHA `28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc` |

39构建输入、4份项目通知、三层provenance、33个npm选择包+7个Carnival保留包、Electron44.4.2完整树、libmpv及Pepper exclusion通过。项目测试/视觉harness/调试工具未进入payload；锁定npm原包自带12项tests资产属于原依赖目录合同，生产依赖未新增或升级。包内两语言与14条自定义消息一致。配套 `.sha256`、`.provenance.json` 在installer同目录。[候选JSON](evidence/v030-readiness-candidate.json)记录通知及来源hash；[验证JSON](evidence/v030-readiness-validation.json)记录测试、ROI和日志hash。

## 剩余门禁

| 分类 | 状态与下一步 |
|---|---|
| 已关闭 | 来源与最小整合、冲突保护、新分支测试、独立审查、783回归、候选来源/版本/通知/payload；安装器三项既有用户UI PASS保留 |
| Codex独立工作 | 本轮工程、假服务、窗口/全屏有界观测、材料增量审查、Release Notes草案已完成；不继续扩展功能 |
| 真实Windows隔离系统 | **REAL_INSTALL_NOT_EXECUTED**：全新安装、v0.2.9升级、卸载/重装、运行中升级/静默失败、配置/DeviceId/登记/快捷方式、UAC/普通用户/英文OS/DPI；未发现直接可用VM/Sandbox，未启用系统功能或在现用系统安装 |
| 真实Together双端 | **PENDING_USER_ACCEPTANCE**：现场主控/被控、真实媒体、消息送达和呈现；全屏 **INCONCLUSIVE** |
| 提供者材料/授权 | [材料审查](V030_MATERIALS_GATE_REVIEW.md)：libmpv/链接依赖对应源码、构建选项/patch/通知履行路径未闭合；Host/部分DLL、CEC/driver/RefreshRate、Web/字体/图片精确来源/适用权利材料仍 WAITING_EXTERNAL/UNKNOWN。ServiceStack.Text FOSS exception包含GPL2，仍须核对Host/Additions源码及履行路径，不能仅按许可名称判兼容 |
| 单纯重建能力缺口 | Electron/Chromium未源码重建、部分MSYS2 recipe/bootstrap不齐属于复现限制，不自动追加法律阻断 |
| 用户决定 | 合并修复PR、最终main构建及Stable放行须后续明确授权；本轮未merge、未创建v0.3.0 Tag/Release |

工程候选可以进入真实使用验收；**Stable发行放行仍被材料证据缺口与未执行的系统/真实使用验收阻挡**，总体保留 `BLOCKED_WITH_EVIDENCE`。材料履行路径与验收闭合后，由用户作最终Stable决定。发行草案见 [V030_RELEASE_NOTES_DRAFT](V030_RELEASE_NOTES_DRAFT.md)。
