# v0.3.0 公开发行解阻结果

专项已由维护者明确终止，当前 **LICENSE_GATE_WAIVED_BY_MAINTAINER**，不是合规验证通过。既有UNKNOWN、GPL组合和材料缺口作为公开前已知风险保留；本页后续补件/追溯/bit-exact方案不再主动执行，不再自动阻止工程准备。当前授权为PR31整合、合并main新构建/验包/Release Notes附件，公开权限尚未授予，详见[维护者决定](V030_MAINTAINER_RELEASE_DECISION.md)。下方原结论和事实不改写。

2026-10-12（UTC+8）。状态 **RELEASE_BLOCKED_EXTERNAL_MATERIALS**；项目保持 **V030_FEATURE_FROZEN / ENGINEERING_READY_RELEASE_BLOCKED**。

用户最新明确以官方Emby GPL-2.0上游为许可/来源基础，取消额外Carnival作者许可的默认门禁。当前审核优先级和最少放行项见[PR31 GPL发行审核](V030_PR31_GPL_RELEASE_REVIEW.md)：官方GPL代码/有效GPL修改无需重复索取授权；源码履行与真正未知独创/第三方条款分开。下表中来源未映射不再自动解释为整组无GPL授权；libmpv/Helper组合仍是第一优先阻断。

开工重新核对远端 main：`72d4688821822860d20342ae8c784a279b06b4f5`，PR28/29/30 已合并，公开版本仍为 v0.2.9 Pre-release。本分支只补发行文档、通知和证据；没有更换组件、修改冻结播放源码/安装器、新增生产依赖或测试。当前完整 Windows 安装包仍不具备公开分发条件。

## 1. 安装门禁：接受已发生的真实体验

用户补充确认昨天亲自在 Windows **覆盖升级安装成功，升级后启动及使用正常**。记录 `USER_INSTALL_ACCEPTANCE=PASS`，覆盖升级及升级后启动/使用为 `USER_REPORTED_PASS`；[回执](evidence/v030-user-install-acceptance.json)。这是两项真实体验证据，不能再将安装体验、覆盖升级和启动描述为完全未测试。

用户未报告旧版本、所用安装器 SHA/source、配置/DeviceId 比较、卸载、重装、静默升级/退出码及普通用户/UAC 条件，不推定这些通过。Codex 本轮系统生命周期仍 `REAL_INSTALL_NOT_EXECUTED`；四阶段自动化合同保留，但按用户调整不再优先执行，也不单凭未覆盖项目否定已接受的安装体验。未覆盖场景作为明确质量风险留给最终发布决定；没有在现用系统安装/卸载、启用虚拟化或公开上传安装包至 Actions。

Together 的 `REAL_TOGETHER_USER_ACCEPTANCE=PASS`、安装器三项用户 UI PASS 均保留。原 783/783 回归、138/138 独立审查、窗口合成视觉 PASS 和全屏采样 INCONCLUSIVE 保留原来源；本轮不重复。

## 2. 实际解阻成果

本轮关闭的是下面明确的材料层，不以“下载到 LICENSE”替代整组发行许可。

| 层级 | 实际结果 | 剩余边界 |
|---|---|---|
| Roboto 21 个目标字体 | 每个内嵌 Google 2011 / Version 2.137 / Apache 2.0 URL；取得完整 Apache 文本并加入既有随包通知入口 | 该字体组的许可及通知准备 `LICENSING_OBLIGATION_RESOLVED`；旧候选未重包 |
| jQuery 3.6.0 slim 已识别本体 | 准确 slim 版本特征 + 官方 registry 源包 MIT 全文/版权，完整加入通知 | MIT 不普遍要求对应源码；重新压缩的技术等价未证明，单列 `REPRODUCIBILITY_ONLY`；不覆盖其它 Web 代码 |
| ServiceStack.Text 4.5.14 Software | 官方 NuGet 成员与目标 DLL EXACT；固定官方 tag、完整源码、构建 stamping、AGPL/FOSS Exception 全文实际取得 | Software 的官方源码获取与通知文本闭合；Host/Additions 完整源码及对象代码源交付安排仍未闭合 |
| mpv / FFmpeg 固定材料 | 实际取得 mpv dd5d17d328 源、FFmpeg 2a20737f66 源、builder cd1edc11 源；找到实际成功发布 run 31285220366 和完整 job 日志 | workflow/发布配方身份、两份核心源获取及完整所列文本缺口关闭；缓存依赖锁/完整源和组合许可仍缺 |
| CEC driver 来源 | 从固定官方 libCEC 仓库重新下载，driver SHA 与目标 EXACT；取得 NSIS/INF 和 GPLv2-or-later 全文/作者 | 关闭原 driver 二进制获取入口未知；不自动授予其 DPInst 等内含组件的权利 |
| 思源字体许可身份 | 目标内嵌 OFL 1.1 和 Adobe 版权；取得固定官方 OFL 全文 | 关闭“许可名称未知”；修改版 RFN 条件仍待解决，OFL 不普遍要求源码交付 |
| 通知交付准备 | **22 份完整文本**整合进 `THIRD_PARTY_NOTICES.md`；原内容完整保留，原始快照及原/规范化 SHA 逐项记录 | 既有四文件 build notice contract 无修改；实际 materialize/hash 回读结果见验证回执。没有改旧安装包通知或宣称全闭包通知齐全 |

SimpleInjector MIT、Electron 官方 archive 两份通知、既有七个继承 MIT npm 包及 33 个锁定生产 npm 包的已确认层级沿用 PR30 证据，不再重复收集。新增加的全文不会将 GPL/LGPL 等备选模式全部宣告为目标适用许可。各组件精确目标 SHA、实体大小、固定来源及查询失败均在下列机器回执，未知值仍保留。

## 3. 按组件执行 A / B / C

**A 为本轮推荐路径：保留已验收功能，先取得实际缺失材料。B/C 均为建议，当前实现数为 0；没有删除、改名或替换运行组件。**

| 组件与状态 | A：最少需要的材料 / 可独立做什么 | A 不成立后的 B / C 及功能约束 |
|---|---|---|
| Windows Host EXE `11abf75c…`；官方GPL grant已有，`CORRESPONDING_SOURCE_WAITING_EXTERNAL` | 按实际目标给出preferred source/patch，或固定 `708fadc…` 未修改源关系说明；编译/安装脚本、接口与源交付。官方部分不需重复作者许可；真实无授权独创增量另列，不从二进制差异推定。PDB/同字节重建不是门禁 | B 固定官方源重新构建，仅静态可行，实际编译未执行；独立DLL条款仍须处理。C 替代 Host/8154 服务会改变架构，不在本轮实施。必须保持四 argv、AppData、DeviceId/Session、单实例和退出链 |
| Common `8fc955…` / Model `f2eeca…` / SharpCompress `3c3413…` / SocketHttpListener `7d1e34…` / System.Configuration `3dba0c…`；`DISTRIBUTION_RIGHTS_UNKNOWN` | Common 官方 NuGet EXACT 但无 grant；Model 不匹配同包。Sharp/Socket 与官方 Host archive binary EXACT，仍需其适用授权/版权；仅实际 copyleft 时要求对应源。System.Configuration 要准确可再分发 package/Framework 条款，不能仅凭版本推定 | B 使用权利/版本清楚的官方依赖重建 Host，需兼容测试；不是换一个同名 DLL 就关闭。不能因 MIT 类库不能 bit-exact 重建而自动阻断，但本组目前缺的是适用依据 |
| ServiceStack.Text `2cc4fc…`；Software 层材料已补，Additions `CORRESPONDING_SOURCE_WAITING_EXTERNAL` | v4.5.14 官方 source/FOSS Exception 已可用，无需 Carnival 重供未修改的同一 DLL 源。仍需 Host/Additions 完整源码、各独立部分适用列表许可及实际源交付安排；商业路线需有效授权，不能推定 | B 替代 serializer 会涉及 Host 行为，不在冻结任务顺手改；不能将 FOSS Exception 误写成无条件 MIT |
| libmpv `965efde4…` / FFmpeg；`CORRESPONDING_SOURCE_WAITING_EXTERNAL`、依赖 `NOTICE_GAP`、组合许可待决 | 已定位实际发布者/run，最少补 **该 run 已解析依赖版本/源包 hash/实际 patches（含缓存库）**、完整 preferred source 和控制构建脚本；取得/恢复 configure/link 结果以确认实际组成，补必要 notices；建立与对象下载等效可用的完整源交付。配置结果是确认组成的手段，不把精确 Docker/PDB 当普遍法律要求 | B 项目自控固定源、依赖和许可模式构建兼容 libmpv，只是方案。GPLv2-compatible/LGPL 模式必须先核对能力与依赖，不得删 core 或倒退已验收播放能力。C 删除 libmpv 不可行 |
| GPLv3 与 Helper GPL-2.0-only 组合 | 官方 builder FFmpeg 有 `--enable-gpl --enable-version3`；Helper直接LoadLibraryEx/GetProcAddress，当前组合不能放行。优先核对项目新增Helper全部代码的授权能力及独立进程边界，评估仅对该组件给兼容v3授权；主GPL-2.0上游不默认升级。方案未实施，详见[审核](V030_PR31_GPL_RELEASE_REVIEW.md) | 若该小范围授权无法成立再B构建兼容依赖；根许可修改、动态加载、API头或IPC不能自动放行。没有改根LICENSE/SPDX，是实际发行待决，不是bit-exact问题 |
| CEC `6e2932…` / client `42f601…`；目标源对应仍待补 | 提供者补固定 libCEC/platform 的实际源/修改及编译脚本；官方 GPLv2-or-later 和作者已收集。源码完整后可独立准备交付，不要求同字节重建 | B 可从官方固定源构建。C 不带 CEC 是可选能力改变，源码存在“无 CEC 继续运行”路径，但尚未实际验证生产包，不能宣布安全排除 |
| driver `6e4d5a…`；内含组件 `DISTRIBUTION_RIGHTS_UNKNOWN` | 官方同字节入口已关闭，剩余准确内含组件与 DPInst/driver 再分发条款；NSIS 引用 GPL 不是 Microsoft DPInst 的自动授权。最少提供者材料为实际分发 grant/SDK条款与对应版权 | C 单独排除 driver 可研究，bootstrap 有 cancel 保护，但 Host driver/安装路径仍须验证；未实施，不指导用户自动获取权利未知包 |
| RefreshRate `c3ac38…`；目标源/grant 待确认 | 官方 Host reference 有 RefreshRate C# 项目/根 GPL，但目标 PE 为 DisplayChanger，未建立实际源码/修改关系；提供者补目标源/适用 grant 即可进入履行准备 | **不能直接 C 删除**：每次播放无条件 await displaySync；main 的 spawn 缺 error 清理，缺 EXE 可能影响正常播放。B 官方源编译替代只是方案，须核对 list/current/set 协议；本轮未改冻结链 |
| Web 核心/Octopus JS/WASM/overlay；官方GPL部分grant已有，其余来源/许可范围待确认 | 已有有效GPL修改重点补preferred source、变更/生成说明和通知，不重复作者许可；未映射部分按实际来源建立适用依据，不能整体称Carnival独创。独立JS/WASM依本身条款履行，minified与bit-exact不能自动成为门禁 | B 从已授权完整官方源组装需独立功能回归，已找到的部分 components/defaultskin 不能冒充当前完整源。C 删除客户端前端不可行 |
| 2 Material Icons Round / 19 图片；`DISTRIBUTION_RIGHTS_UNKNOWN` | 官方 Material Apache 文本已取得，但两字体无内嵌许可/导入说明；最少补原始 font/import/grant。图片按精确路径/hash 补原图来源、overlay 作者授权和必要归属；XMP/编辑软件不是 grant | B 官方字体或自制图形仅建议，需要 ligature/布局/用途检查；不以镜像、改名或自动下载绕过授权 |
| 思源 modified TTF `8cc4d2…`；OFL 身份已知、RFN 条件待决 | 目标英文 family 为 `Source Han Serif SC X120% Y120%`，FontCreator 2023；内嵌 RFN `Source`。最少补适用于本次再分发的 RFN 书面许可，或实施符合 OFL 的命名修复；不能仅补 OFL 就放行 | 可独立按 OFL 修改内部主名并保持字形/度量，需查字体选择/预设引用和验证。此修复未实施；若换官方原版需评估缩放/视觉影响，不能悄悄更换字体 |

固定配方与发布日志将 libmpv 来源关联从日期猜测推进到直接发布证据；日志没有 dev archive SHA，仍标为**有直接发布链支持的推断**，不伪造密码学 attestation。目标 archive→DLL 的历史 EXACT 关系保持原证据身份。

GNU [GPLv3 指南](https://www.gnu.org/licenses/quick-guide-gplv3.html)说明 GPLv2 的 later-version 选择与兼容性；当前 Helper 明确 only，不能默认升级。OFL 的 [修改/再分发说明](https://openfontlicense.org/how-to-modify-ofl-fonts/)和[固定原文](https://raw.githubusercontent.com/adobe-fonts/source-han-serif/2.001R/LICENSE.txt)支持 RFN 判断；不宣称所有字体都须提供源文件。GPL 完整对应源涵盖修改首选形式、模块/接口及控制编译安装的脚本，不普遍以 bit-exact 重建为先决条件；有效公开源获取和对象交付安排仍需落实。

## 4. 最短材料请求与停止点

没有代发外部联系。维护者后续可只请求三组材料，不需重启全项目历史审计：

1. **Host/源材料持有者或公开上游**：Host实际源/patch/脚本、ServiceStack Additions完整源及许可；有效GPL部分无需Carnival作者额外授权。独立Model/Sharp/Socket/Common/System.Configuration条款按本身来源确认；RefreshRate/CEC补实际源关系，driver补DPInst条款。三个实际随包定制入口另按路径核对grant，不能由标题推定独创。精确SDK/PDB/旧机器不是普遍必需。
2. **libmpv 构建提供者**：run `31285220366` 缓存依赖完整 source lock/source bundle、实际 patches/编译安装脚本、组成/许可模式依据和全部 notices。已有 mpv/FFmpeg 官方源及 workflow 不重复索取。项目权利人另处理 GPLv3 组合路线；不能只让原提供者保证“以前发过”。
3. **Web/资产源材料持有者或公开上游**：有效GPL代码补当前实际源/修改/生成说明与通知，未映射部分建立适用来源；独立库通知、两项Material字体依据、19图原来源/必要归属及modified Source Han RFN条件独立处理。不要求整包取得统一Carnival作者许可。

无法独立取得的主要是私有/未知的实际修改、历史缓存锁和权利授予事实。能独立完成的全文通知、准确官方源入口、生产者工作流定位、字体内嵌许可和官方 driver 字节匹配，本轮已经完成；没有在相同失败路径无限重试。材料收到后只复核对应目标，不重复用户安装/Together体验。

## 5. 候选与最快公开形态

本轮**没有生成新 Windows 安装包**，没有公开上传受限二进制。旧内部 RC 保留 `sourceCommit=7827425e07024fcca3bf671aa4401bb3020291b0`、安装器 SHA256 `3ab89708de4d3680c5b19605069af138f585b1baeb3bf4fbcc196daadf7e492f`、`NotSigned`，不是本分支或最新 main 的新产物；其 2138 payload + manifest 文件及既有来源回执保持原身份。本轮补充的 notice 尚未进入它。

推荐完整客户端路线为 A：上述核心权利/完整源/组合许可闭合后，从届时审核通过的准确 main 重建，再核对新 manifest 全路径/hash、provenance、随包通知和所需兼容检查；最终公开操作仍需用户授权。当前不能选择 `PUBLIC_BINARY_RELEASE_READY`。

最快可公开的有限形态是本次**材料索引、原创治理文档和许可全文补件 PR**，它不包含未知运行二进制/字体/图形。若选择源码发行，需要额外形成权利已确认的维护源码白名单及许可证；当前完整 `src/` 含继承/导入代码，不能用 Git tracked 或现有公开状态替代许可判断，也不能直接将仓库 ZIP 宣称完整合规客户端源码。白名单源码包 **PROPOSED_NOT_IMPLEMENTED**，不称可安装 Windows 全客户端，不自动 Tag/Release。

## 6. 证据与实际验证

- [Host 回执](evidence/v030-host-unblock.json) / [组件结果](V030_HOST_UNBLOCK_RESULT.md)：NuGet EXACT、fixed source 与完整文本 hash；[来源索引](redistribution-notices/host/SOURCE_INDEX.md)。
- [mpv 回执](evidence/v030-mpv-unblock.json) / [组件结果](V030_MPV_UNBLOCK_RESULT.md)：固定源、官方 run/log、variant 与 archive 层级；[全文/来源](redistribution-notices/mpv/SOURCES.md)。
- [Web 回执](evidence/v030-web-unblock.json) / [组件结果](V030_WEB_UNBLOCK_RESULT.md)：720 文件、23 Web 字体、19 图片路径/hash；[通知索引](redistribution-notices/web/INDEX.md)。
- [CEC 回执](evidence/v030-cec-unblock.json)和[补充结果](V030_CEC_FONT_UNBLOCK_RESULT.md)、[思源回执](evidence/v030-source-han-font-unblock.json)：实际字节/metadata，未执行下载程序。
- [通知准备回执](evidence/v030-notice-delivery-preparation.json)：原通知前缀保留，22 完整文本、原始/规范化 hash；规范化换行及行末水平空白，段尾换行统一为一行，许可正文未省略。实际验证及只读 review 汇总见 [validation](evidence/v030-unblock-validation.json)。

本次结束点为按组件材料交付与审核 PR。完整公开二进制仍 **RELEASE_BLOCKED_EXTERNAL_MATERIALS**；已通过的用户体验不重测，也不替代未闭合的分发义务。
