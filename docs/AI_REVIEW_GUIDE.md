# 整体项目审核入口：0.2.7

后续统一测试候选为 `b139d87da06cfba153a828766926b78230be4a0f`，已完成直接整合review、723项离线、119项独立核心及八组新隔离runtime，见 [候选报告](INTEGRATION_028_CANDIDATE.md)。该候选尚未进入main；下文历史产品、材料与证据表保持各自身份，不用旧runtime结果为新候选背书。

2026-10-10独立审核已固定main `0b782ddec404f4148cb6c8c16f19bc22201d3252`，结果见 [审核报告](INDEPENDENT_REVIEW_028.md) 与 [本地交付](REVIEW_028_DELIVERY.md)。其中修复属于独立本地分支，尚未合并或发布；原产品tag与下表历史审核对象不变。当前计划以 [ROADMAP](ROADMAP.md) 为唯一来源。

本页为外部AI或人工审核者提供准确的源码、产物和证据入口。现有报告中的PASS是待核对的证据，不是要求审核者同意的结论。

## 先固定审核对象

| 对象 | 身份 |
|---|---|
| 完整审核分支 | main；先记录实际HEAD，避免审核过程中分支变化 |
| 已审阅的维护交付HEAD | 0bcbfc74f2dbd9ed35bfb82eee719d25d2260b03；已随PR #21完整合入main |
| 安装包产品sourceCommit | d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0；v0.2.7 tag绑定此提交 |
| 最终隔离观测工具 | 0e87d4f5b85ee136d1fe3d0ab47eaac25d64ac9d |
| 本轮维护前比较基线 | bc50d181cd5cafd14b31e2c0d24cbf7fd73b0ee1；仅用于理解本轮增量，不是当前main |
| 维护整合提交 | ef4fcf58ec9fcfa4728ef42eba25911f8c0de7ab；PR #21 merge commit，后续文档收尾提交不改变产品身份 |
| Runtime manifest SHA256 | c6794efc6b69aeef67c3274903715e2483955a564dc9b2bc8a3e4cefd24ffe6c |
| 安装包SHA256 | 86bee55146714f4f7e493cadb8b483537644f513c92364df7fc0c18f5315f3db |

对整个项目做静态审核时使用 `main`；对安装包精确来源做核对时使用product sourceCommit。后续公开说明和证据提交不应被当作安装器的产品提交。发布与合并事实见 [发布记录](RELEASE_027.md) 和 [主线收尾](MAIN_CLOSEOUT_027.md)，剩余计划见 [路线图](ROADMAP.md)。

```powershell
git clone https://github.com/hope140/EmbyTheaterEnhanced.git
cd EmbyTheaterEnhanced
git fetch origin --tags
git checkout main
git rev-parse HEAD
git diff bc50d181cd5cafd14b31e2c0d24cbf7fd73b0ee1..HEAD --stat
```

## 建议的审核顺序

1. 阅读 [协作规范](../AGENTS.md)、[架构](ARCHITECTURE.md)、[当前状态](PROJECT_STATUS.md)、[已知问题](KNOWN_ISSUES.md)。历史文档中的“当前”按对应日期/提交理解；与新证据冲突时回到真实代码及输入身份。
2. 审核整个产品调用链，而不仅是本轮diff：PlaybackManager构建补丁到libmpv插件、Resolver/CD2、Native Helper、Session/远控、窗口和退出归属。特别检查late response、generation、Stop排空、只报告一次及失败传播。
3. 检查安全与维护边界：IPC sender、日志脱敏/限流、CD2凭据及DirectUrl headers隔离、About固定路径/manifest/hash校验、异步信息快照和错误恢复。
4. 检查构建与交付：Git blob输入、精确依赖目录、固定工具链、输出链接保护、版本来源、安装器payload与已发布EXE。不要将包内版本字符串、二进制hash或某份通知等同于完整对应源码可重建。
5. 对照下面的公开原始证据和未验证边界。能复现的问题提供最小case；缺固定输入/硬件时明确说明，不能把无法运行直接改写成产品故障，也不能自行填造私有输入。

## 关键源码位置

| 范围 | 入口 |
|---|---|
| PlaybackManager维护补丁 | tools/patch-playbackmanager.cjs；真实基线Web不直接纳入Git |
| Player/Resolver | src/electronapp/plugins/libmpv.js、resolvers/strm-resolver.js、resolvers/cd2-resolver.js及enhanced/cd2-service.js |
| Native生命周期/窗口 | src/electronapp/native-helper/、native/mpv-helper/、enhanced/nexttrack-transition.js及main.js |
| About与可信维护IPC | enhanced/bundled-versions.js、maintenance.js、maintenance-ipc.js、diagnostics-ipc.js、plugins/mpvplayer/about.js；均相对src/electronapp |
| 构建/打包/观测 | tools/build.ps1、package.ps1、build-input-contract.cjs、runtime-dependency-contract.cjs、about-version-observation.cjs、test-p1-diagnostics.ps1 |
| 测试与原始结果 | tests/；[测试说明](TESTING.md)；下列证据索引 |

## 可公开复核的证据

[证据索引](evidence/review-027/index.json)列出本轮允许公开的9个原始文件、原项目相对路径、字节数和SHA256。文件按原字节发布，Git对该目录禁用换行转换，外部审核者可自行计算hash。

- [651项完整单测原始日志](evidence/review-027/final-full-tests.txt)、[42项最终工具测试](evidence/review-027/final-tool-tests.txt)、[53项父会话复核](evidence/review-027/parent-targeted-tests.txt)。
- [依赖audit记录](evidence/review-027/npm-audit.json)、[打包前独立审阅回执](evidence/review-027/parent-review.json)、[最终安装包独立回读](evidence/review-027/parent-package-verification.json)。
- [Inno完整性日志](evidence/review-027/installer-integrity.txt)、[解包日志](evidence/review-027/installer-extraction.txt)、[2,137文件逐项对照](evidence/review-027/installer-verification.json)。
- [维护阶段完整结构化证据](evidence/maintenance-027-20261010.json)、[本地打包证据](evidence/local-package-027-20261010.json)及[交付副本记录](evidence/local-package-027-delivery-20261010.json)。

旧observer的FAIL、最初PE字符串检查误判、历史直接app.exit UNKNOWN仍在各阶段报告中，不能被本次最终PASS覆盖。原始profile和未经筛选的runner/客户日志不公开；公共JSON中其它.work路径仍是本地证据引用，不能假定这些文件也已上传。

## 可以运行什么、还有什么缺口

公开仓库提供维护源码、工具、测试和固定输入清单，但没有全部Carnival、综合补丁、离线Web、runtime和工具链原始二进制。完整构建/部分全量测试需要 [打包说明](PACKAGING.md)、[构建输入审计](BUILD_INPUT_AUDIT.md) 和 [来源索引](SOURCE_MATERIALS.md) 列出的固定材料。先核对测试依赖，再在隔离环境运行；不要执行原提供者的安装/恢复脚本或修改现用客户端。

十组隐藏隔离运行、About真实IPC和完整Session配对是本地模拟服务证据；系统安装四阶段、真实Emby/CD2/远控、可见首帧/连续性、HDR/多屏未在本轮验收。四类第三方对应源码/构建材料仍WAITING_EXTERNAL，见 [材料收尾](THIRD_PARTY_MATERIALS_CLOSEOUT_027.md)。

## 可直接交给另一个AI的任务

请以GitHub仓库 `main` 的实际HEAD为固定对象，对整个项目开展独立代码、架构、安全、测试与交付审核，并评估ROADMAP中剩余计划的优先级与完成条件。不要只复述已有报告，也不要把历史提案当当前实现。先给按严重度排序的可行动问题，包含文件/行号、触发条件、影响、证据和最小修复建议；区分已复现、静态确认和待验证。检查原始日志、源码/工具/runtime身份及构建输入边界。没有发现明确问题时直说，并列出本次覆盖和未覆盖范围。此次是审核任务，未经用户要求不修改代码、安装系统软件、启动真实客户端/服务或向外部发送内容。

本地旧分支和历史资料的取舍见 [同步范围](REMOTE_SYNC_027.md)。[2026-10-07上游切集研究](archive/UPSTREAM_TRANSITION_COMPARISON_20261007.md)仅作历史对照，不作为新修复指令。
