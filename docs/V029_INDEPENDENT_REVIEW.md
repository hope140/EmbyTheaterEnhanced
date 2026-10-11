# v0.2.9 独立审查

日期：2026-10-11（UTC+8）。审查者未参与生产修复、版本更新或发布操作；仅修改本报告。审查基线为 `9774b73469dea9a3651f03737153c872947223ee`，维护版本提交为 `5e33d1f`；隐私候选按实际文件字节复核。最终 sourceCommit、远端 CI、runtime、安装器和下载资产仍须按后续实际证据确认。

当前审核状态：`PREMERGE_REVIEW_PASS / REMOTE_AND_RELEASE_GATES_PENDING`。本地固定候选的代码、完整回归、静态及 candidate build/VerifyOnly 均已核验；可以进入最小 PR。实际合并仍须 PR HEAD/目标 main/Hosted CI/无冲突门禁，公开发布仍须最终 main 构建及资产回读。

## 审查范围与发现

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
