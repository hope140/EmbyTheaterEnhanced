# 独立审核、安全加固与正式版准备交付

后续PLAY-01单独修复见 [Stop归属修复](PLAY01_STOP_BOUNDARY.md)。下文保持独立审核交付时的基线、RED及分支身份，不代表后续本地修复状态。

日期2026-10-10（UTC+8）。**当前结论：本地审核与局部修复可交审；下一正式版尚未达到发布条件。** PLAY-01仍可复现，SEC02完整隔离迁移及新候选运行/真实场景需要后续证据。

## 审核身份

- 唯一仓库 `hope140/EmbyTheaterEnhanced`；开工实时远端main/HEAD为 `0b782ddec404f4148cb6c8c16f19bc22201d3252`。
- 最新测试版v0.2.7 peeled tag为 `d8fcb0f9f9f0aac92b472386a8f29e1a8235cba0`，正式Latest为v0.2.2；GitHub Release只读核验。
- 上述main与v0.2.7的src/native/installer/package/lock相同，main多出公开文档和诊断工具测试收尾。历史651/42/53和十组隔离记录没有改标成本轮实测。
- 原主目录仍为旧Settings分支及用户改动；本轮所有修改在独立worktree，未覆盖原目录。下面各任务分支独立，没有合并后的组合产品SHA，也没有新版本号、安装包或runtime。

## 审核发现与处置

完整触发、实际/期望、精确基线位置、复现层级、影响、最小建议和回归要求见 [阶段一报告](INDEPENDENT_REVIEW_028.md)。

| 任务 | 状态与风险 | 结论 |
|---|---|---|
| A1–A4独立审核 | COMPLETE / STATIC及离线复现 | 覆盖播放/session、Native、renderer/权限、构建/材料；不是穷尽证明 |
| PLAY-01 P1 | CONFIRMED_OFFLINE / BLOCKS_STABLE | 换音轨/质量所需PlaybackInfo迟到，在Stop完成后再次load旧媒体。主线程复跑仍RED；core换流所有权contract未收敛，按停止条件不实施 |
| SEC-01 P1 | STATIC_VERIFIED / UNIT_VERIFIED | HTTP/HTTPS外链允许规则、两条动态入口与固定shader链接统一；原协议风险mock复现 |
| SEC-02 P1 | PARTIAL / STATIC_VERIFIED / UNIT_VERIFIED | 主frame/固定index与主导航边界完成；原fs/rawIPC、CSP/CORS/isolation/sandbox、自定义protocol授权仍需单独设计 |
| LIFE-01 P2 | STATIC_VERIFIED / UNIT_VERIFIED | allSettled后仍尝试解绑与surface释放；保持首要原始错误；默认controller.kill拒绝可达性UNKNOWN |
| LIFE-02 P1处置顺序 | STATIC_VERIFIED / UNIT_VERIFIED | terminal-owned child退出纳入同pending join；原worker评P2，主线程因违反完整退出等待不变量提升处理优先级，不声称已见真实用户泄漏 |
| CI-01 | STATIC_VERIFIED / UNIT_VERIFIED | 公开子集622/622，固定Node、syntax/diff/有限敏感扫描通过；Actions实跑NOT_EXECUTED |
| QA-01 | PREPARED | [播放矩阵](RELEASE_ACCEPTANCE_MATRIX.md)包括普通/STRM/DirectUrl/同源/fallback/控制/字幕章节/session/失败与网络异常 |
| INST-01 | PREPARED / 系统NOT_EXECUTED | [四阶段卡](INSTALLER_LIFECYCLE_CARD.md)、只读快照工具和合成验证；历史0.1.x安装脚本不冒充当前验收 |
| BUILD-01 | STATIC_REVIEWED / WAITING_EXTERNAL | 固定输入/provenance/材料清单复核；四类缺口保持，不重新检索或虚构许可结论 |
| DOC-01 | COMPLETE_LOCAL | ROADMAP唯一当前计划；TODO原文保存在archive，历史证据保留 |

## 分支与本地提交

共同审核文档基线 `d875ba5b69ef75bcc6ba439182700f3fb865f70c`。

| 分支 | 提交 | 范围 |
|---|---|---|
| codex/independent-audit-20261010 | d875ba5 | 阶段一独立报告 |
| codex/sec01-external-links | 4683ca148a49ca53df3b0e91058df10729bad917 | main三处外链、external-url helper、入口测试、报告 |
| codex/sec02-frame-boundary | 4d79411 | renderer-boundary、增强IPC及旧snapshot、main导航、fixture/回归、报告 |
| codex/life01-cleanup | 100e65828be23abb2cdca64f9447fc32843afabf | service异常清理、回归、报告 |
| codex/life02-terminal-join | 0cd3e75b284ec412063702b2e578aee737f9a63c | 依赖LIFE01；terminal-owned join、真实controller私有Node假child回归 |
| codex/ci-public-offline | 46d066801b2cde9ef65a463b289b526790c8f2d6 | workflow、CI runner/static gates、回归 |
| codex/release-readiness-20261010 | 本报告所在提交 | QA/安装工具、PLAY-01独立探针、知识库/ROADMAP/证据索引 |

每个分支的完整改动文件列表与原始日志hash见 [机器清单](evidence/review-028/results.json)。SEC/LIFE/CI报告在本交付树中按原字节复制归档，产品及CI工具补丁仍只在各自分支；不表示已合并源码。机器清单的readiness observedHead是生成证据时的提交前基线，本交付提交身份以包含该文件的Git提交为准。

## 测试与原始失败

Node为v24.18.1。原始日志保留于各任务worktree的`.work`，机器清单记录所属分支、相对路径、字节数和SHA256；有路径/异常现场的原始文件不进入公开Git。以下均为本轮真实运行，非历史651项的复述。

| 输入/命令 | 原始结果 | 原始证据 |
|---|---|---|
| 公开基线 `npm test -- --test-concurrency=1` | 632项，623PASS/9FAIL，exit1 | audit主树 `.work/audit-a4/npm-test-serial.log` |
| A1定向：请求/STRM/CD2/预算/transition等 + player | 138+22=160PASS；PLAY-01另列 | `.work/audit-a1/targeted-tests.log`、`player-tests.log` |
| `node tests/review-probes/change-stream-stop.cjs`（固定vendor输入） | 期望1次load，实际2；exit1 | readiness树 `.work/readiness/play01-parent-red.log`；此前原审查RED亦保留 |
| SEC01 `node --test tests/external-url.test.cjs`（旧main） | 真实入口2项RED | SEC01树 `.work/sec01/red-final-fixture.log` |
| SEC01新源码外链/apphost/兼容/process/maintenance定向 | 39/39PASS；独立最终新测试12/12PASS | `.work/sec01/targeted.log`；最终12项为本会话工具回执 |
| SEC02 `node --test tests/renderer-boundary.test.cjs`（旧源码） | 5/5FAIL | audit主树 `.work/sec02/red.log` |
| SEC02八份相关suite | 148/148PASS；最终新测试9/9PASS | `.work/sec02/green.log`；最终9项为本会话工具回执 |
| LIFE01服务回归旧/新 | RED32PASS/8FAIL；Native GREEN66/66 | LIFE树 `.work/lifecycle-fixes/life01-red.log`、`life01-green.log` |
| LIFE02真实controller私有假child旧/新 | RED0PASS/2FAIL；Native GREEN68/68 | `.work/lifecycle-fixes/life02-red.log`、`life02-green.log` |
| LIFE最终独立六套suite | 68/68PASS；额外并发probe1/1PASS；假进程残留0 | `.work/parent-review/lifecycle-native-suite.log`及复核报告 |
| CI `node tools/ci-public-tests.cjs` | 81文件中75份公开测试，622/622PASS，0FAIL/取消/跳过，exit0 | CI树 `.work/ci/public-tests.log`、`public-tests-exit.txt`；6份材料依赖NOT_EXECUTED |
| CI JS/PowerShell语法、有限敏感扫描、diff | 分别206/25/253文件通过；提交后的base→HEAD diff通过 | CI树 `.work/ci/*syntax.log`、`secret-scan.log`、`diff-check.log` |
| `node --test tests/installer-lifecycle-snapshot.test.cjs tests/app-bootstrap.test.cjs` | 5/5PASS（快照2、bootstrap3） | readiness树 `.work/readiness/offline.log` |

公开基线9FAIL全为6份测试文件的固定vendor/preload缺失，均保留ENOENT，不改为PASS。测试集数量会因文件初始化失败与材料就绪而变化，不能拿632直接与历史651做增减判断。公开CI验证详情见 [PUBLIC_CI](PUBLIC_CI.md)。

SEC02八套回归的完整命令（在SEC02工作树，固定prepared preload已就绪）：

```powershell
node --test tests/cd2-service.test.cjs tests/client-diagnostics.test.cjs tests/external-player-process-chain.test.cjs tests/p1-lifecycle-diagnostics.test.cjs tests/renderer-boundary.test.cjs tests/settings-visual-system.test.cjs tests/strm-mapping-assistant.test.cjs tests/strm-resolver-settings.test.cjs
```

工具/夹具失败也保留：初期安全探针相对require路径错误（修正后mock复现）；SEC02原fixture缺mainFrame URL/import导致定向失败，修正fixture建模后148项通过；A2初两次Windows stdout fixture不符合预期；最终退出复核探针初次沿用terminal-first错误断言，而destroy-first正确返回GENERATION_RETIRED，调整探针预期后通过。审核共享树在后续公开子集运行期间变化，该次612项/1FAIL作废，不作为固定SHA证据；CI转独立树重验。上述均没有降低产品安全断言、删除失败样本或增加sleep跑绿。

CI最终worker会话额度中断的一次运行只留下发现清单，保存为`public-tests-interrupted.log`且不计结果；主线程确认无残留测试进程后从相同固定源码完成上述622项。末次只读refs复核仍为开工main/tag，原Settings目录状态保持。

## 与v0.2.7的差异及未覆盖层级

产品候选只涉及main外链/导航、增强IPC授权和Native service退出清理。未改PlaybackManager/libmpv/Resolver/Session/Native C++、版本、固定依赖与第三方输入。常规路由/身份/header contract在相关单测层保持；PLAY-01当前仍违反Stop后的旧请求不可重新控制播放器，因此不宣称全部不变量已满足。

所有修复只达到STATIC_VERIFIED/UNIT_VERIFIED。新源码的ISOLATED_RUNTIME_VERIFIED、REAL_SERVER_VERIFIED、USER_VISUAL_ACCEPTED和四阶段系统安装均NOT_EXECUTED；独立Node子进程测试不冒充Electron/libmpv运行。未生成组合候选，历史v0.2.7产物验证不能覆盖新代码。历史app.exit原因UNKNOWN；显示/HDR/多屏/预热/Hydration/Forge等条件触发项未扩展实现。

## 后续PR与验收顺序

建议获授权后分别交审SEC01、LIFE01、依赖它的LIFE02、SEC02，CI可独立先行，最后整合文档。它们与已有main的共同产品基线相同；LIFE01/02与SEC02同改service的不同区段，SEC01/02同改main入口，仍须逐项检查合入diff并重跑组合门禁。当前没有创建或合并PR。

PLAY-01应单列核心设计/修复任务，先确认捕获流与请求代际、合法同流换轨、转码清理与报告归属，不能靠拒绝所有相同request ID修补。核心阻断修复后，从批准组合SHA构建一次新候选，执行隔离矩阵；再按单独授权完成真实服务与VM安装四阶段。材料/许可剩余状态需要发布范围决策，不能由静态测试替代。下一正式版本号与发布权限尚未决定。
