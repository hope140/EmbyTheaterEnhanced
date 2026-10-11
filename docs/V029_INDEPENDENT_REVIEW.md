# v0.2.9 独立审查

日期：2026-10-11（UTC+8）。审查者未参与生产修复、版本更新或发布操作；仅修改本报告。开工审查基线为 `9774b73469dea9a3651f03737153c872947223ee`，维护版本提交为 `5e33d1f`。最终产品/构建来源为 `084554e07782ca6461b7ed67cadd298a92450b24`；本报告依次保留初审、候选门禁、最终主线构建与实际发布回读的独立证据。

当前审核状态：`POST_PUBLISH_READBACK_PASS`。PR/main CI、最终 main 重建、八组隔离 runtime、原始 Session 配对、安装器来源/版本/完整解包，以及 Release/tag 与三份实际下载资产均已核验。v0.2.9 Pre-release 已公开；文档主线身份另由包含本报告的 main revision 与最终精确回执确认，不能改变产品 sourceCommit 或重标已发布资产。

## 初审范围与发现

| 范围 | 独立结论 |
|---|---|
| 产品版本与依赖锁 | 三个版本字段均为 0.2.9；去除锁文件两处 version 后，与基线 JSON 完全相同，无依赖闭包变更 |
| 34 项固定构建输入 | 清单仍为 34 项；当前变更为 package.json、package-lock.json、docs/LICENSING.md；其余锁、vendor、构建器、安装器未改 |
| 播放与 Session 范围 | 相对本轮 main 基线，维护树没有新增播放逻辑；外挂字幕守卫已在基线 PR #25 中。隐私候选仅改诊断 sanitizer 与 PowerShell 收集共用层，不改变播放、缓存、IPC 或 Helper 生命周期 |
| 文档范围 | README、ROADMAP、PROJECT_STATUS、KNOWN_ISSUES、DEVELOPMENT_LOG、ARCHITECTURE、TESTING、PACKAGING、LICENSING、CHANGELOG 及独立报告；当前与历史证据分层，发布准备措辞仍需交付后同步 |
| 安装与材料 | 四阶段均 REAL_INSTALL_NOT_EXECUTED；材料 WAITING_EXTERNAL 保留，不把静态、解包或旧材料签名改为本轮系统/合规 PASS |
| 隐私发现 | 合成 Basic 凭据、多 Cookie 尾值与带空格绝对路径媒体名泄漏均已由最小候选修复；独立 34/34 focused GREEN。解除局部代码阻断，最终全集、CI/构建仍需完成 |
| Renderer 隔离 | 窄边界与兼容性设计范围；本轮候选未开启 contextIsolation/sandbox/webSecurity 等全量隔离迁移 |

本轮范围内未发现新增第三方组件或未经解释的依赖更换。该结论不认定既有材料缺口已经满足许可条件。

`docs/LICENSING.md` 是四份随包通知之一，也是固定构建输入。它必须在最终产品提交中确定；构建后若再修改此输入，不能继续复用原安装包并改变其 sourceCommit。

## 隐私修复独立复核

初版候选的独立 focused 运行 `node --test tests/v029-diagnostics-privacy.test.cjs tests/diagnostics.test.cjs` 得到 24 项、18 PASS、6 FAIL，fail/cancel/skip 分别为 6/0/0。失败来自最终 header_value 扫描对已脱敏值的误报，并使合成 ZIP probe 失败；该运行不能记为 GREEN。

另外独立合成自由文本验证发现空格路径只隐藏首个词，留下媒体名称尾部；原 structured path 测试不能证明此自由文本安全。主线程明确批准两处 sanitizer 保守消费同一行路径至换行、引号、尖括号或 pipe 边界的最小修复，保留后续诊断行。

更新候选的实际 diff 已复核：

- `src/electronapp/enhanced/diagnostics.js` 增加 Authorization、Proxy-Authorization、Cookie、Set-Cookie 全行值脱敏；Windows/UNC/POSIX 绝对路径匹配包括空格，URL 处理保持在路径处理之前。
- `tools/diagnostics-common.ps1` 应用同样头字段与路径规则；最终 gate 增加原始/部分脱敏头字段和 Proxy-Authorization/Set-Cookie key 拒绝，使用 .NET atomic 空白匹配避免回溯误报，同时识别 JSON 转义 tab；原 secret_assignment gate 也保持此完整占位符边界。Windows path gate 排除非路径字母数字前缀误报，实际原始驱动器/UNC 路径仍拒绝。
- 合成回归新增驱动器/UNC/POSIX 空格路径、后行保留、四种头字段、大小写、多 Cookie、完整 placeholder 与尾值拒绝、PowerShell 5.1/7、真实 collector ZIP 解包内容断言。没有实际用户凭据或真实媒体。

独立执行的内存矩阵为 JS 13/13（空格路径、pipe/换行边界、四种头字段）及 PowerShell 7 header gate 32/32（四字段、空白变体、完整 placeholder 接受与尾值拒绝）。保守路径投影可能隐藏同一行紧随路径的说明文字，这是本轮已明确接受的诊断精度取舍。

最终候选独立运行 `node --test tests/v029-diagnostics-privacy.test.cjs tests/client-diagnostics.test.cjs`：34/34 PASS（新隐私 18、既有 client 16），fail/cancel/skip/todo 均为 0，实际耗时 19.7 秒。包括 Windows PowerShell 5.1/7 头字段行为、原始/尾值 gate 拒绝、问题 snapshot 和 collector ZIP 内容读取；不是只检查扫描器返回 true。安全 Agent 的最终相关集合原始日志另有 47/47 GREEN，主线程最终全集记录单列。未修改或减弱已有断言。

独立 focused 结束后读取的候选文件 SHA256（实际 CRLF 工作文件字节，不替代最终 Git/source provenance）：

| 文件 | SHA256 |
|---|---|
| src/electronapp/enhanced/diagnostics.js | 48fcc086c7e36e24a0dee20b74d5cf3349d4097c0354426a70f56d5c97de555e |
| tools/diagnostics-common.ps1 | bd66da57135f818a357465445db29248aab434cebcf75ef1fe6f1d09b3ae643f |
| tests/v029-diagnostics-privacy.test.cjs | a63ac7ec46915bd5cead33e597e151ddb9b35d19b5569573b414e36b2e5f4e4b |

有限规则不保证识别裸露未知秘密、任意私人名称或所有秘密格式；未形成全量 Renderer 隔离或完整隐私认证。

## 原始证据审查

已读取主线程保留的原始输出，区分执行来源和验证层级：

| 原始证据 | 已读实际结果与解释 |
|---|---|
| `.work/v029-release/public-tests.log` | 668 项、667 PASS、1 FAIL、skip/cancel 为 0；existing build-input 正常写入 case 的 fixture Git ls-tree 失败，原因尚待调查。fixture 为独立临时 Git repo，不可直接归因为主工作树 dirty 版本；失败不能隐去或静默跳过 |
| `.work/v029-release/material-play01-tests.log` | 73 PASS、0 FAIL/SKIP/CANCEL；覆盖材料依赖与另外 PLAY-01 项，不能写为 Hosted 执行 |
| `.work/v029-release/js-syntax.log` | 当次 tracked JavaScript 223 文件语法检查通过；新测试纳入最终提交后数量和证据须重新确认 |
| `.work/v029-release/ps51-syntax.log`、`ps7-syntax.log` | 当次各 26 文件语法通过；不能替代最终隐私候选两种 shell 行为检查 |
| `.work/v029-release/secret-scan.log` | 当次 272 tracked 文本有限模式通过；明确不是完整 secret scan |
| `.work/v029-security/privacy-red.log`、`zip-red.log` | 旧实现的原始 RED 与实际 ZIP 中合成凭据残留；不能因为原扫描报告 redactionPassed=true 而声称内容安全 |
| `.work/v029-security/focused.log` | 旧既有安全/诊断集合 136 PASS、0 FAIL/SKIP/CANCEL；旧集合成功不覆盖新发现的泄漏 |

实际生产 build contract 对 dirty 的 `docs/LICENSING.md` 拒绝属于预期 fail-closed，和上述独立 fixture Git 失败是两种不同证据。后续必须从提交后的最终输入重跑适用全集，不删除断言、不扩大 CI 材料排除或降低 gate。

## 最终放行所需证据

1. 最终隐私生产/工具/测试 diff 与完整 GREEN；所有原始 RED、初跑失败和最终修正输出保留。
2. 最终提交的公开离线全集、六份材料依赖集合、PLAY-01 与所需静态门禁；对原 fixture Git 失败给出实际调查及重新执行结果。
3. PR HEAD、目标 main、CI 与 merge commit 身份；合并后 main CI 成功，远端无无法安全处理的变化。
4. 最终 main sourceCommit 的 34 项输入及所有 tracked 产品来源；runtime/package VerifyOnly、工具链、0.2.9 runtime/安装器版本、通知与精确 payload/hash 集合。
5. 安装器、SHA256、provenance 三资产相互绑定；公开 v0.2.9 为 Pre-release、Draft=false、Tag 指向核验提交，回读/下载大小、SHA256、来源与链接一致。
6. README、路线图、Known Issues、状态、开发日志、发布说明及综合收尾实际同步；相关相对链接存在，新增公开文本无私人路径、真实凭据或媒体 URL。真实安装、第三方材料、延迟专项与设备缺口保留准确状态。

没有独立系统、适当显示硬件或外部对应材料不是本次授权测试版的自动阻断。CI、来源、payload、明确隐私/安全问题或新增高风险发行问题仍是相应发布门禁。

## 固定候选本地门禁与 PR 审查结论

审核对象为 `0bac2e8b2294fb4011bb3f2cef0c48624a35a570`。整合修复 `1012dac20647a83e4e7853380d389e8eee040dd0` 与独立隐私提交 `16ae6c2` 的三个文件 Git blob 逐项完全相同；版本、通知和源码提交均已确定。相对本轮开工 main，最终修改范围为版本、必要诊断隐私修复及其测试、工程文档，未混入播放性能、Renderer 隔离迁移或其它功能。

| 最终实际证据 | 独立核验 |
|---|---|
| `.work/v029-release/public-final.log` | 89 test 文件发现、83 公开执行、精确排除原六份材料文件；686/686 PASS，fail/cancel/skip/todo=0。原失败的正常写入 fixture case 在本轮完整集合中通过，原断言未改，原失败继续保留，未知根因不写成已经修复 |
| `.work/v029-release/material-play01-final.log` | 六份材料文件及额外 PLAY-01 native gates 73/73 PASS，fail/cancel/skip/todo=0；其中 71 项属于发现全集、两项额外。合计发现全集 757 项，连额外两项为 759 次通过，材料不记为 Hosted 执行 |
| `js-final.log`、`ps51-final.log`、`ps7-final.log`、`scan-final.log` | JS 224、PowerShell 5.1/7 各 26、有限凭据模式 273 tracked 文本文件通过 |
| `docs-final-pre-pr.json` | 14 份当前文档、266 个相对链接、四种新增文本有限模式检查，无失败 |
| `candidate-build-fixed.log` | 最终候选从准确 `0bac2e8` 提交生成；source、Native Helper、build input 与 tracked product provenance 均通过；34 项固定输入、四份 notices、88 个 tracked product 文件；runtime 0.2.9 |
| `candidate-verify-fixed.log` | package VerifyOnly 通过；精确 npm 33 生产包/1142 文件与七个保留包/29 文件、退役 Pepper 缺席、全部 runtime payload 2138 文件通过；加 manifest 文件为 2139 |

已读取 `candidate-build.log` 的真实失败：sourceCommit=1012dac 时 HEAD 在构建期间前移，Native helper gate 拒绝 `source commit must equal HEAD`。这不是产物通过，原 partial 及日志保留。随后以固定 `0bac2e8` 独立新目录重建通过，不修改原失败身份。

PR 描述已独立阅读，产品范围、隐私收益、安装和外部材料缺口、版本及预发布目标准确。当前检查范围内无剩余明确代码/本地工程门禁阻断，独立意见为 `PREMERGE_REVIEW_PASS`。此结论支持进入 PR 并在远端条件全部满足后使用 Merge commit；不跳过 CI，不直接批准公开 Release。

本节之后若只提交审核/测试证据文档，必须逐项证明其不改 `src/`、`native/`、tools、tests、34 固定输入与四份随包 notices。candidate 产物的 sourceCommit 仍为 `0bac2e8`，不能改标为后续文档 HEAD。公开安装包必须按本次任务从最终通过 CI 的 main HEAD 重新构建。

## 最终 main 与预发布资产独立审核

产品与构建来源为 `084554e07782ca6461b7ed67cadd298a92450b24`。独立读取 Git 确认其为 PR #26 Merge commit，parents 为开工 main `9774b73469dea9a3651f03737153c872947223ee` 与已审查 PR HEAD `2a4ea1fb9830447d8372e6f46d6caef9c8c6f557`；独立实时 `gh` 回读 PR #26 为 MERGED、目标 main、mergeCommit 同上。

远端执行已独立实时回读，不依赖本地成功替代 CI：push [38133680652](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38133680652) 与 PR [38133686686](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38133686686) 均在 `2a4ea1fb` completed/success；合并后的 main [38134108870](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38134108870) 在 `084554e` completed/success。已读 PR/main 原始 CI 日志，686 项公开集合 PASS、fail/cancel/skip 为 0；六份材料文件仍只在本机层覆盖。

`0bac2e8` 至最终产品 main 只变更 DEVELOPMENT_LOG、独立审查和综合报告三份非构建文档。独立比较实际 provenance 的 34 项 path/blob/hash 数组完全一致；`src/`、`native/`、tools、tests 与四份 notices 均未改变。最终 `dist/RELEASE-029-084554e` 是从固定 main 重新运行构建产生，未使用 candidate 换身份；五份 source/build/native/runtime/dependency 来源记录指向真实 main。已读 `final-main-build.log` 和 `final-pre-run-verify.log`，34 输入/四份通知、88 tracked product、完整 Electron 73-file tree、Native Helper 与 package VerifyOnly 均通过。

### 隔离 runtime 与原始报告

`runtime-matrix.json` 包含 idle、playing、stopped、hit0、hit400、hit800、direct400、miss400 共八组，均在最终 main runtime 执行。独立逐组读取 `electron-smoke.json`、`runner-result.json`、`normal-close-result.json`：smoke.ok=true、正常关闭 PASS、exitCode=0、exitMode=NATURAL、timedOut=false、cleanupAttempted=false、candidateResidual=0、outputCapture=COMPLETE、realServiceAccess=false。没有以强清理后的零残留冒充自然退出。

runner 自己明确标注 `FIXED_2S_SNAPSHOT_NOT_EXHAUSTIVE`；观察到的子进程退出和末端残留检查有此采样边界。normal-close 仍将历史特殊 app.exit 根因保留 UNKNOWN、visibleAcceptance 保留 NOT_EXECUTED，不能扩大为所有退出路径彻底修复。

独立直接读取五个 hit/direct/miss 完整 pipeline 的原始 `records`，按 ItemId、MediaSourceId、PlaySessionId 三元组重新建立 Map，要求每组恰有五个身份、一条 Playing、一条 Stopped 且 start 索引早于 stop。五组分别 5/5，总 25/25 配对通过，不读取原 sessionChecks 结论作为证明；与 `session-pair-readback.json` 一致。八组均属于 `ISOLATED_RUNTIME`，不是本轮真实 Emby/115/CD2、实体远控或可见画面验收。

### 安装器及本地三份资产

安装器为 `EmbyTheaterEnhanced-0.2.9-win-x64-setup.exe`，175,650,591 bytes，独立重新计算 SHA256 为 `2f4fa378eb75f91f21a5163d4cdb01244621d6bb8144a12c84b81ee419c914a0`。PE ProductVersion/FileVersion 去掉固定字段 padding 后均为 0.2.9，数值文件/产品版本为 0.2.9.0；字符串无需错误地要求四段版本。早期 PE 探针对字符串的误要求不属于产品版本失败，实际静态字段与 `installer-pe.json` 一致。

`.sha256` 为 110 bytes，内容与实际 installer hash、文件名完全一致；`.provenance.json` 为 3,943 bytes，sourceCommit=084554e、version=0.2.9、installer size/hash 均匹配，固定 Inno 6.7.3 及 118-file compiler tree 门禁通过。runtime manifest SHA256 为 `3f93b40fa8ca2bdb5e0fc5c89072089c9432d46bb0737de9e60d52b82bae96ab`，runtime、解包内 manifest 与 installer provenance 一致。

已读完整性/解包尾部及 `installer-verification.json`。另外独立遍历 `.work/v029-release/unpack-final/{app}`，根据最终 manifest 加 manifest 自身重新逐文件哈希，而非只引用主线程 receipt：预期 2,139、实际 2,139，missing/extra/mismatch 均为 0。四份随包 notices 独立逐份与最终 main 的原始 Git blob SHA256 对比一致。固定第三方组件与通知集合没有新增风险；既有对应源码、构建和授权缺口仍 WAITING_EXTERNAL，真实安装四阶段仍 REAL_INSTALL_NOT_EXECUTED。

`release-notes.md` 已独立阅读，外挂字幕适用范围、已提交命令边界、必要隐私修复、内嵌字幕/音轨性能未修复、安装及材料限制、Pre-release 与 Latest v0.2.2 均准确。当前没有剩余明确 CI、回归、来源、payload、安全或新增发行阻断，独立意见为 `PRE_RELEASE_REVIEW_PASS`。此意见不提前断言 tag/Release 或公开三个附件已经创建、下载验证完成。

发布后的最终门禁为准确 tag 指向、Pre-release=true/Draft=false、三个远端附件的实际下载大小/hash/来源及链接回读，以及后续文档 HEAD 与原产品提交的输入等价。所有最终文档结果须保持安装包/sourceCommit 原身份，不以文档 HEAD 替换产品提交。

## 发布后独立回读与文档交付

2026-10-11 发布后实时独立回读 GitHub：Release 标题为「Emby Theater Enhanced v0.2.9 测试版」、tagName=v0.2.9、Pre-release=true、Draft=false，公开入口为 [v0.2.9 Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.9)。发布时间为 19:22:17（UTC+8）。三个 assets 均 uploaded，实际名称、大小、digest 与预审资产相同。

独立读取 remote tag ref，确认为 annotated tag 对象 `b4ab009e03cab5afc9fa7407f719c24ede7a2e97`；再读取实际 tag object，指向 commit `084554e07782ca6461b7ed67cadd298a92450b24`。独立回读 tag push CI [38135277960](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38135277960) 为 completed/success，headSha 为上述产品提交。Latest API 仍返回 v0.2.2。

主线程用实际下载生成的 `.work/v029-release/downloaded` 三份文件已由独立审核重新逐份读取、计算 SHA256，并与本地原资产和远端 digest 交叉比较：

| 实际下载资产 | 大小 | 独立 SHA256 |
|---|---|---|
| setup.exe | 175,650,591 bytes | 2f4fa378eb75f91f21a5163d4cdb01244621d6bb8144a12c84b81ee419c914a0 |
| setup.exe.sha256 | 110 bytes | fd6be796cdf357bab53e3597655482cdfc3153eb9f6cca0bd10f70d438a8ca39 |
| setup.exe.provenance.json | 3,943 bytes | f2ddc77bfb15c54e3c6594554d632d21e30c451746d10e5aa3fc557a773bec1c |

下载的 SHA companion 内容、provenance sourceCommit/version/installer size/hash 与下载 EXE 再次一致。已读取 `public-links.json` 的三条实际公开下载 HTTP200 回执；链接对应 Release 中公开资产 URL。独立比较 v0.2.8 发布前/后的 Release、asset ID/name/size/digest/URL 与 tag 快照，全部完全相同，没有重写旧资产。

已独立阅读本轮发布后 README、CHANGELOG、ROADMAP、Known Issues、PROJECT_STATUS、PACKAGING、TESTING、DEVELOPMENT_LOG、安装材料补充和综合报告 diff。当前最新版/下载入口已回填 v0.2.9；外挂字幕与必要诊断修复已发布，延迟暂缓、圆角用户反馈、系统安装/实服/视觉未执行和材料缺口保持准确，原历史失败与 PASS 来源未改标。公开机器摘要 `docs/evidence/v029-maintenance-closeout.json` 的状态/产品来源/测试层级与实际证据相同，未引入原始媒体、用户身份或凭据。

独立文档检查最终实际读取 14 份文档、272 个相对链接，四种新增文本有限敏感模式无失败；机器摘要另以四种有限敏感模式检查，无命中。UTF-8 解码与 `git diff --check` 通过。上述是有限检查，不宣称识别所有未知秘密。

在尚未提交的文档交付状态，独立执行现有 build-input `inspect`，34 项工作输入仍与产品 HEAD 原始 Git 字节一致；查看相对产品提交的 diff，只有 README/CHANGELOG 与项目文档/匿名证据，未改变 34 输入、随包 notices、src/native/tools/tests/installer。此条件必须在最终仅文档 PR 合并后再次保持。产品 sourceCommit 永远为 `084554e`，最终文档 main HEAD 由包含本报告的 main revision 与主线程最终精确 SHA 回执单列，避免把文档提交当安装包源码。

独立结论为 `POST_PUBLISH_READBACK_PASS`，本节审查范围内未发现剩余发布后资产、来源、安全或文档事实阻断。本节记录的是最终文档 PR 创建前的审查时点：当时该文档 PR 的 CI/merge/main 回读尚未执行，因此未提前记为 PASS。最终文档整合结果以综合报告所在 main revision 与主线程最终精确 HEAD/CI 回执为准，不把本节原时点描述当作今天仍未完成的状态。系统四阶段安装 REAL_INSTALL_NOT_EXECUTED、外部材料 WAITING_EXTERNAL 及内嵌切轨性能 DEFERRED / USER_ACCEPTED 继续作为明确维护边界。
