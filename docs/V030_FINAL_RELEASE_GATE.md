# v0.3.0 Final Release Gate

## 1. 已完成

2026-10-12（UTC+8）进入 **V030_FEATURE_FREEZE**。开工及收尾核对远端main为 `89a0501f96eebdd7ee6952f594038bafe151eb43`；PR28/29均MERGED，包含安装器语言/升级保护与Together统一Video替换持帧修复。审核分支只改发行文档和通知，`src/tools/tests/installer/vendor/native/package/lock`相对main无diff，未增加功能或测试。

复用PR29原完整 **783/783**、独立 **138/138**、窗口合成视觉PASS，分别保留原source32/独立代码68a0026身份。PR28安装器guard12项、语言7场景及中文默认/手动选择/升级目录页用户PASS按相同源码/工具链复用。本轮仅因随包通知补充执行受影响的构建输入/runtime provenance测试 **20/20，fail/cancel/skip/todo=0**；没有重复783/138或合成像素实验。新候选build/package/三层来源/全部manifest路径与hash验包通过，独立只读最终审查及PR/CI入口由本报告末尾的审核回执记录。

## 2. 用户验收

用户最新反馈 **“实测了一下没问题了。”**，记录 **REAL_TOGETHER_USER_ACCEPTANCE=PASS / USER_REPORTED_PASS**，透明屏专项按用户实际体验场景关闭。根因仍为Together1.6.0.5的PlayNow绕过本地NextTrack持帧入口，修复为统一same-player Video替换边界复用Native presentation hold。

历史窗口合成视觉PASS及全屏合成采样 **INCONCLUSIVE** 保留原证据身份。未报告的真实测试次数、媒体、硬件、全屏条件、客户端版本/sourceCommit均 **NOT_REPORTED**，不编造，也不扩大为所有组合通过。[用户反馈回执](evidence/v030-together-user-acceptance.json)与[专项关闭记录](SYNCPLAY_NEXT_TRANSPARENT_SCREEN_TASK.md)可追溯；不再要求重复已报告正常的Together体验。

## 3. 安装验收

只读环境探测未识别已获授权、可恢复快照的Windows测试目标：Hyper-V/Sandbox Disabled，相关管理命令及VMMS不可用，snapshot inventory UNAVAILABLE。已停止真实安装尝试，没有启用系统功能或覆盖现用客户端。

已完成：冻结安装器/guard/bootstrap/DeviceId静态合同核对、原生保护/语言证据复用、新0.3.0 installer编译与完整解包回读；这些不替代系统验收。**全新安装、v0.2.9→v0.3.0升级、卸载、重装、运行中升级/静默退出码、配置/DeviceId保留、快捷方式/卸载登记/权限、普通用户启动全部 REAL_INSTALL_NOT_EXECUTED**。后续四阶段最短可执行方案与v0.2.9精确升级输入见[V030_INSTALL_LIFECYCLE_FINAL](V030_INSTALL_LIFECYCLE_FINAL.md)，已确认的中文安装页面不重复要求验收。

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

1. 后续提供已可用、获授权、可恢复的Windows环境，或安排操作员按四阶段卡完成必要系统生命周期；当前无需守在电脑前。
2. 取得上述目标二进制/资产的许可、归属、对应源码/修改/构建配置或有效获取安排，供后续有界核验；本轮未代发外部联系。
3. 安装与发行材料门禁闭合后，对审核PR和最终Stable发布作明确决定。已正常的Together体验和中文安装页面不重复要求验收。

## 7. 最终结论

**ENGINEERING_READY_RELEASE_BLOCKED**。冻结产品、用户已报告Together场景和新内部RC工程证据已收口；真实Windows安装生命周期及第三方分发/源码/通知门禁尚未满足，不能选择READY_FOR_STABLE_RELEASE_APPROVAL。未创建v0.3.0 Tag或GitHub Stable Release，未变更v0.2.9资产，未改现用客户端。

审核分支 `codex/v030-final-release-gate-20261012`，必要PR与CI由[本分支PR入口](https://github.com/hope140/EmbyTheaterEnhanced/pulls?q=is%3Apr+head%3Acodex%2Fv030-final-release-gate-20261012)和本地 `.work/v030-final/final-remote.json` 最终回执定位。独立只读最终审查 **PASS**，组件分类冲突已修正后复核关闭；[只读审查回执](evidence/v030-final-readonly-review.json)记录逐文件hash、完整通知、用户反馈边界和审查快照。原工程数字保留自身来源，不改标为本轮新测试。审核PR保持待用户决定，不自动合并或发布。
