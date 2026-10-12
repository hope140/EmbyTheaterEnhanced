# v0.3.0 Final Release Gate

2026-10-12最新解阻状态：**V030_FEATURE_FROZEN / ENGINEERING_READY_RELEASE_BLOCKED / RELEASE_BLOCKED_EXTERNAL_MATERIALS**。远端main基线 `72d4688821822860d20342ae8c784a279b06b4f5`。用户覆盖升级、升级后启动使用现已USER_REPORTED_PASS；配置/DeviceId等未确认。真实安装未覆盖项转为披露质量风险，本轮不再要求重复体验/优先四阶段自动化。发行材料新增闭合及仍有实质意义的阻断以[V030_RELEASE_UNBLOCK_PLAN](V030_RELEASE_UNBLOCK_PLAN.md)为准；下文旧工程证据不改写其历史身份。

## 1. 已完成

2026-10-12（UTC+8）项目状态 **V030_FEATURE_FROZEN / ENGINEERING_READY_RELEASE_BLOCKED**，工程收尾阶段已结束。PR28/29/30均MERGED；合并前main `89a0501f96eebdd7ee6952f594038bafe151eb43`、PR30 HEAD `6e9c644f1e8e6b3f6989ab5825ae1bc1272c3c16`。用户授权后于13:41:06通过Merge Commit `2de72919d114f053b15e1e747d26e641e764eaaa`合入main，父节点准确为89a0501/6e9c644，完整tree与已审查PR HEAD相同。20文件diff仅为发行文档/通知，冻结产品、installer/package/lock无变化，未增加功能或测试。

合并前最新HEAD的[push CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38204599101)和[PR CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38204650512)均SUCCESS，独立只读审查PASS、未解决review threads为0（GitHub正式approval记录0）；全部diff及39项消费输入与已审候选对应。合并后main2de7291的[CI 38209020299](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38209020299)已 **SUCCESS / 702项 / fail0**。冻结状态同步后的最终main HEAD/CI由[main检查](https://github.com/hope140/EmbyTheaterEnhanced/actions?query=branch%3Amain)及本地 `.work/pr30-main-merge/final-main.json`记录。整合证据见[v030-pr30-main-closeout.json](evidence/v030-pr30-main-closeout.json)，不重新开展测试或材料审计。

复用PR29原完整 **783/783**、独立 **138/138**、窗口合成视觉PASS，分别保留原source32/独立代码68a0026身份。PR28安装器guard12项、语言7场景及中文默认/手动选择/升级目录页用户PASS按相同源码/工具链复用。本轮仅因随包通知补充执行受影响的构建输入/runtime provenance测试 **20/20，fail/cancel/skip/todo=0**；没有重复783/138或合成像素实验。新候选build/package/三层来源/全部manifest路径与hash验包通过，独立只读最终审查及PR/CI入口由本报告末尾的审核回执记录。

## 2. 用户验收

用户最新反馈 **“实测了一下没问题了。”**，记录 **REAL_TOGETHER_USER_ACCEPTANCE=PASS / USER_REPORTED_PASS**，透明屏专项按用户实际体验场景关闭。根因仍为Together1.6.0.5的PlayNow绕过本地NextTrack持帧入口，修复为统一same-player Video替换边界复用Native presentation hold。

历史窗口合成视觉PASS及全屏合成采样 **INCONCLUSIVE** 保留原证据身份。未报告的真实测试次数、媒体、硬件、全屏条件、客户端版本/sourceCommit均 **NOT_REPORTED**，不编造，也不扩大为所有组合通过。[用户反馈回执](evidence/v030-together-user-acceptance.json)与[专项关闭记录](SYNCPLAY_NEXT_TRANSPARENT_SCREEN_TASK.md)可追溯；不再要求重复已报告正常的Together体验。

## 3. 安装验收

只读环境探测未识别已获授权、可恢复快照的Windows测试目标：Hyper-V/Sandbox Disabled，相关管理命令及VMMS不可用，snapshot inventory UNAVAILABLE。已停止真实安装尝试，没有启用系统功能或覆盖现用客户端。

已完成：冻结安装器/guard/bootstrap/DeviceId静态合同核对、原生保护/语言证据复用、新0.3.0 installer编译与完整解包回读。用户另明确报告真实Windows覆盖升级成功、升级后正常启动及使用，记录 **USER_INSTALL_ACCEPTANCE=PASS / USER_REPORTED_PASS**，不再描述为完全未测试。未报告旧版本/安装包SHA，不扩大为已确认准确v0.2.9升级路径、配置/DeviceId保留或全部生命周期。全新、卸载/重装、运行中静默退出码、登记/权限/普通用户条件仍未确认；Codex系统测试仍REAL_INSTALL_NOT_EXECUTED。这些为披露质量风险，本轮按用户要求不重复安装体验或优先自动化；保留[V030_INSTALL_LIFECYCLE_FINAL](V030_INSTALL_LIFECYCLE_FINAL.md)合同。

## 4. 第三方发行材料

一次有界增量核查，准确组件SHA/来源/许可/通知/源码需求/最小缺口见[最终材料矩阵](V030_DISTRIBUTION_MATERIALS_FINAL.md)及其机器索引。未向提供者或他人发送索取请求。

| 组件/门禁 | 当前分类与实质影响 | 能否独立关闭 |
|---|---|---|
| SimpleInjector4.0.11 | 官方NuGet net45成员与目标DLL EXACT；固定官方MIT版权/许可全文已随THIRD_PARTY_NOTICES交付。LICENSING_OBLIGATION_RESOLVED；未精确源码重建仅REPRODUCIBILITY_ONLY | **已独立关闭该组件通知/许可路径**，不保证全bundle许可组合 |
| Electron、锁定33个npm包及7个继承MIT Node包 | 已固定来源及已交付包级通知；继承metadata/README/import差异、未从Electron源码重建单列REPRODUCIBILITY_ONLY。识别路径有限不自动等于发现NOTICE_GAP | 包级身份/可见通知已核对，不单独以未重建阻断；全包组合审查仍独立 |
| Windows Host、Model/SharpCompress/SocketHttpListener等未闭合DLL | DISTRIBUTION_RIGHTS_UNKNOWN / NOTICE_GAP，准确上游修改与许可绑定未闭合；确认适用copyleft后才要求对应source/patch/build scripts。SDK/PDB或bit-exact重建不普遍作为法律必备 | 已有官方ref/NuGet入口有界核查；剩余目标绑定/归属材料 **需提供者事实** |
| ServiceStack.Text / Host Additions | 官方4.5.14 DLL EXACT，固定AGPL/FOSS Exception文本明确包含GPL2；Software及Additions完整源码/获取和通知履行路径尚未闭合，CORRESPONDING_SOURCE_WAITING_EXTERNAL / NOTICE_GAP。商业授权证据未取得，不擅选路线 | 可取得官方文本，**不能独立证明Host/Additions完整对应关系或选择授权路径** |
| patched libmpv / FFmpeg及链接依赖 | DLL与固定dev归档EXACT；实际配置、patch、resolved dependency源码与完整notice集合不齐，CORRESPONDING_SOURCE_WAITING_EXTERNAL / NOTICE_GAP，许可组成未确定。历史版本/reference与一般官方说明不足以闭合最终DLL | 公共固定源码/归档入口已有；剩余 **需对应构建/依赖材料或履行安排** |
| CEC / driver / RefreshRate | DISTRIBUTION_RIGHTS_UNKNOWN / NOTICE_GAP；不能把libCEC许可自动套到driver。源码义务按实际copyleft路线条件化，技术重建另列 | **需各目标的许可/版权/来源绑定**；driver可能需要再分发依据而非源码 |
| 离线Web/字体/图片/overlay | DISTRIBUTION_RIGHTS_UNKNOWN / NOTICE_GAP，缺逐资产来源、许可、完整归属和overlay关系；不能凭文件名猜license | 现有公开组件参考不足，**需精确资产/导入材料** |

上述对应源码/通知履行或未知分发依据有实质阻断意义；历史Pre-release并不关闭义务。明确属于REPRODUCIBILITY_ONLY的项目不自动列为法律阻断；项目根GPL声明也不能统一覆盖第三方。本轮未删原归属、未改组件名规避义务。

## 5. 候选产物

这是 **v0.3.0-stable-rc / INTERNAL_ENGINEERING_CANDIDATE**，未获Stable发行批准。产品基线是main89a0501，审核构建提交包含新通知/收尾文档，冻结产品字节与main相同；原322a037包保持原样，未重命名复用。

| 身份 | 值 |
|---|---|
| 精确构建sourceCommit | `7827425e07024fcca3bf671aa4401bb3020291b0` |
| Installer | `dist/EmbyTheaterEnhanced-v0.3.0-stable-rc-7827425-internal-win-x64-setup.exe`，175643954bytes，PE/runtime版本0.3.0，**NotSigned** |
| Installer SHA256 | `3ab89708de4d3680c5b19605069af138f585b1baeb3bf4fbcc196daadf7e492f` |
| Build manifest SHA256 | `fd27dfea9418fed1a5eecef69af53624692847cdfa48ae53cea52af8444cac10` |
| Payload set SHA256 | `1353809d891dc8fed0cb8fc5318c801c2050380dcc2cbb9cf4c30527cd6df349` |
| 完整验包 | 候选自身manifest的2138条payload + manifest自身，实际runtime/解包2139文件；全部路径集合/hash相同，数量由manifest导出，零缺失/多余/不匹配 |
| provenance | inputs `cf95063bfaa5abbfce92e5bc03eb0e9ee3a621e2a225ec5730ecbc1b1bc61b12`；source `109525929cc15c6cd859067cb0ca3344100d08100837b3ad729fce24f8ffe25d`；runtime `9fd738552793a4b470dbd7ed50bac33f98d7568096c0c51f7a61e47b42c4089a` |
| 工具/组件 | Inno6.7.3完整锁；UCRT64 GCC16.1.0-5/6990文件锁；正式Helper testing=false、SHA28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc；libmpv固定SHA965efde4…；Electron44.4.2完整树 |

四份项目通知及Electron/npm通知实际存在，完整SimpleInjector MIT文本已回读；retired Pepper缺席，ETE测试/harness/调试工具未进入payload。锁定npm原包自带12项tests资产属于原依赖合同。两语言/14条自定义消息从installer解包匹配。机器完整回执见[v030-final-stable-rc.json](evidence/v030-final-stable-rc.json)；EXE旁 `.provenance.json` 和 `.sha256` 保留完整package来源/摘要。正式Stable放行后仍须按当时获授权的准确main身份构建发行附件。

## 6. 还需要用户做什么

1. 无需重复覆盖升级、启动使用或中文页面；未覆盖系统场景作为质量风险供最终发布决定，若后续选择验证再按四阶段卡在隔离环境执行。
2. 取得上述目标二进制/资产的许可、归属、对应源码/修改/构建配置或有效获取安排，供后续有界核验；本轮未代发外部联系。
3. 审核PR30已按本轮授权合并。安装与发行材料门禁闭合后，仅需对最终Stable发布作明确决定；已正常的Together体验和中文安装页面不重复要求验收。

## 7. 最终结论

**V030_FEATURE_FROZEN / ENGINEERING_READY_RELEASE_BLOCKED**。PR30主线整合和工程收尾已完成；REAL_TOGETHER_USER_ACCEPTANCE=PASS、安装器三项USER_UI_ACCEPTANCE=PASS及最新覆盖升级/启动USER_REPORTED_PASS保留，历史全屏合成采样仍INCONCLUSIVE。Codex四阶段系统测试REAL_INSTALL_NOT_EXECUTED，未覆盖场景披露为质量风险。第三方实质权利/完整源/组合许可未闭合，不能选择READY_FOR_STABLE_RELEASE_APPROVAL；最新解阻结论见[V030_RELEASE_UNBLOCK_PLAN](V030_RELEASE_UNBLOCK_PLAN.md)。未创建v0.3.0 Tag/Stable Release、变更v0.2.9资产、旧候选身份或现用客户端。

审核分支 `codex/v030-final-release-gate-20261012`保留，[PR30](https://github.com/hope140/EmbyTheaterEnhanced/pull/30) **MERGED**。独立只读最终审查PASS与[审查回执](evidence/v030-final-readonly-review.json)保留原身份；候选始终绑定7827425及既有SHA，不改为main正式产物。后续只处理上述实际发行门禁与发布决定；本轮工程收尾已关闭。
