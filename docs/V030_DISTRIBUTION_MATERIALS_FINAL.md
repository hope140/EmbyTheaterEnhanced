# v0.3.0 Final Release Gate：分发材料有界增量核查

日期：2026-10-12（UTC+8）
审查基线：`main@89a0501f96eebdd7ee6952f594038bafe151eb43`
候选身份：`sourceCommit=322a037cdccb39ad57923bcd7551d9954ba815bd`，版本 `0.3.0`，内部 runtime 目录 `dist/ETE-0.3.0-internal-20261012`。该目录的 `build-manifest.json` 为 2138 个 payload 文件，`payloadSetSha256=2a9185188f296b3da0da4818041915ab869e3c3fae323a272a3afa53d0b8a38a`；构建清单 SHA256 为 `dcd94ea61592cbbd4cc1ad0a76a699b19169bfd3eaa00a7a4d1bb81f9707dc1f`。

## 结论

本轮确认候选包的文件身份、四份项目材料、Electron 许可文件、锁定 npm 闭包、Native Helper 输入以及历史材料审计中已经取得的固定 archive/NuGet/registry 入口。可闭合的是“准确 payload 身份”和“已有项目/可见依赖 notice 随包路径”；仍阻断 Stable 分发决定的是若干组件的对应源码、构建/链接输入、完整通知履行路径和权利事实未闭合。公开参考源码、NuGet 成员或版本字符串不自动等同于目标二进制的对应源码，也不据许可名称直接判定兼容性。

状态字段使用可多选值：`LICENSING_OBLIGATION_RESOLVED`、`DISTRIBUTION_RIGHTS_UNKNOWN`、`CORRESPONDING_SOURCE_WAITING_EXTERNAL`、`NOTICE_GAP`、`REPRODUCIBILITY_ONLY`、`NOT_APPLICABLE`。`USER_REPORTED_PASS` 只适用于用户已报告的前台体验，不改变本材料门禁；fullscreen 仍沿用历史 `INCONCLUSIVE`。

## 候选与通知身份

| 项目 | 准确身份 | 已随包材料 | 结果 |
|---|---|---|---|
| source / version | `322a037cdccb39ad57923bcd7551d9954ba815bd` / `0.3.0`；baseline 为 Carnival 3.0 / application 3.0.20-3.0 + combined patch | `source-provenance.json` SHA `a4e1d6fcaf2bab9bfbc9e1a5b2bf16207a6b0b44a1df5c8c71bbca7be9fd8de0`；`runtime-provenance.json` SHA `9ce7fefa5d02123c16ae9f80948513a5dd2d02e59d10623b4cd6b2aa489690c3`；`build-input-provenance.json` SHA `9d7ee4eaf35cbd407742d55c74f735392c0b1091bb145a6a3d7d95bb1eb7eb8c` | `LICENSING_OBLIGATION_RESOLVED` 仅指项目维护层声明和随包路径已绑定；不覆盖外部组件 |
| 四份项目材料 | `LICENSE` `2bdb13b91b9440dcfdf51b2f72e04e566c92eb50d48350ada10b30a1d37c3c05`；`THIRD_PARTY_NOTICES.md` `b0553d7741f08209087418d66204f509850fa0b6fd39e330b4679cb52cbe6bde`；`docs/LICENSING.md` `fa4a35b0847579137ea063840e22581ee6dbde579eefdfc8e491c89303393564`；`docs/SOURCE_MATERIALS.md` `cc4b71ec41454b8d26ec24926b74868e1c59f299efdcbfc46edc02ffe6933396` | 四项均为 sourceCommit Git blob copy，runtime path 与 hash 已固定 | 项目通知随包缺口已关闭；第三方对应义务仍按组件表判断 |
| visible third-party notices | Electron `LICENSE`、`LICENSES.chromium.html` 两项；npm 生产/继承目录中 43 个可见 license/notice 路径；合计 45 个可见第三方 notice 路径 | 依据既有 payload manifest 与 notice readback；不声称识别嵌入式或缺失命名的 notice | `NOTICE_GAP` 仍适用于没有独立组件通知或对应源码路径的组 |

## 逐组件材料矩阵

| 组件（覆盖范围） | 二进制/版本/来源身份 | licence / notice 事实 | 状态 | 对应源码义务、获取路径与 rights gap | 技术重建限制、现有材料能否履行、最小缺失材料 |
|---|---|---|---|---|---|
| Windows Host `Emby.Theater.exe` | SHA `11abf75c8f77ddb0078e7dd62a2eaae60dba244c113bc7893a7e56bc6527163e`；PE `3.0.20.0`；Carnival 输入。公开参考为 Windows Host commit `708fadc068cbf66ced6aece4a32f3e12bb2c4e13` | 项目 GPL-2.0-only 文本已随包；Host 二进制没有可将该 EXE 绑定到参考源码的独立 notice 集合 | `DISTRIBUTION_RIGHTS_UNKNOWN` + `CORRESPONDING_SOURCE_WAITING_EXTERNAL` + `NOTICE_GAP` | 公开参考仓库是 reference，不能证明 Carnival EXE 的精确 source tree、修改或发行权；获取路径为固定 Host reference/archive 与提供者材料索引 | 不能由程序集版本重建。最小缺失：精确 source tree/commit、相对参考源补丁、依赖/SDK/MSBuild、命令/日志和对应 notice。现有材料不能履行完整对应源码义务 |
| Host 托管 DLL：`MediaBrowser.Common.dll` | SHA `8fc955a5215e862f5bde882cedbe2be52e6a242d89d03406844993595d72657f`；PE `1.0.0.0`；历史 EXACT NuGet `MediaBrowser.Common 3.3.10` 成员 | NuGet package/项目 notice 路径随包事实已核对；精确 source/build 关系未建立 | `DISTRIBUTION_RIGHTS_UNKNOWN` + `CORRESPONDING_SOURCE_WAITING_EXTERNAL` | 既有 NuGet nupkg 可取得并与 DLL 成员 EXACT；这只关闭成员来源观察，不关闭 Host 构建/修改关系与完整通知 | 最小缺失：Host 组装关系、精确源码/修改记录、构建输入和 notice 交付映射 |
| Host 托管 DLL：`MediaBrowser.Model.dll` | SHA `f2eeca1c65e56e96340dc84ff91de6e4cc25bb2e510706748606f05c1e39ebaf`；PE `1.0.0.0`；同 Common 3.3.10 包成员不匹配 | 不能沿用 Common 结论；独立 notice/来源未闭合 | `DISTRIBUTION_RIGHTS_UNKNOWN` + `CORRESPONDING_SOURCE_WAITING_EXTERNAL` + `NOTICE_GAP` | 公开同名包仅为候选，不能改标为对应来源；需提供者精确包/commit 与二进制 hash 对照 | 最小缺失：匹配源包或 source tree、修改/构建记录、license/notice 路径 |
| Host 托管 DLL：`ServiceStack.Text.dll` | SHA `2cc4fc93be82d4818dc81beb9f5cd0e4f995c77e1725c129e4918e8aeaeb39c1`；PE `4.5.14.0`；`ServiceStack.Text 4.5.14` `lib/net45` 成员 EXACT | 固定源码 license 文本 commit `e5819a8de75a8bae64ddc7a64008613067893e32` 明确 AGPLv3、FOSS License Exception 和商业入口；NuGet 本身无独立 license 文件 | `DISTRIBUTION_RIGHTS_UNKNOWN` + `CORRESPONDING_SOURCE_WAITING_EXTERNAL` + `NOTICE_GAP` | FOSS exception 原文包含 GPL 2.0，但 Software 仍受 AGPL/additions 完整 source 等条件约束；本轮不选商业或 copyleft 路线。公开 license 文本可随材料提供，不能代替 Host/Additions 精确来源和履行安排 | 最小缺失：Host 中该 DLL 的精确构建/修改关系、Additions 完整源码和获取安排、适用 notice、责任人选择的许可路径 |
| Host 托管 DLL：`SharpCompress.dll` | SHA `3c34138417974ce215e5d1b5bdbb7abd578ce77420073ea9de3f46ccebe42b55`；PE `0.10.3.0`；SharpCompress 0.10.3 公开 NuGet DLL 候选均不匹配 | 不能从同名包或版本字段推断许可履行；独立 notice 未闭合 | `DISTRIBUTION_RIGHTS_UNKNOWN` + `CORRESPONDING_SOURCE_WAITING_EXTERNAL` + `NOTICE_GAP` | 现有 Host reference archive 仅提供精确 binary 入口；需准确源包/修改记录 | 最小缺失：匹配 source/commit、patch/build 记录、license/notice |
| Host 托管 DLL：`SimpleInjector.dll` | SHA `6a8e55d1f114fb579f4b92169af71dc197d86dd13a79199a4f047dc4b22bf0bc`；PE `4.0.11.0`；`SimpleInjector 4.0.11` 成员 EXACT | NuGet 4.0.11 元数据与官方项目 LICENSE 入口均标示 MIT；准确许可/notice 路径可单独履行，未从源码重建是另一层问题 | `LICENSING_OBLIGATION_RESOLVED` + `REPRODUCIBILITY_ONLY` | 公开 NuGet 4.0.11 与官方 LICENSE 足以关闭该组件的许可/可见 notice 事实；不把未重建或 Host 组装关系误写成许可阻断 | 若需技术复现，最小缺失为精确 source revision、Host modifications/build；这不再是该组件的发行权阻断 |
| Host 托管 DLL：`SocketHttpListener.dll` | SHA `7d1e347f1cb6ff10b011547665bcf13bb734306e8977e572021161f52a43f852`；PE `3.2.32.4`；公开 `SocketHttpListener 1.0.50` 成员不匹配 | 独立 notice 未闭合 | `DISTRIBUTION_RIGHTS_UNKNOWN` + `CORRESPONDING_SOURCE_WAITING_EXTERNAL` + `NOTICE_GAP` | Host reference archive 只关闭 binary source location 观察；需匹配 source/build 包 | 最小缺失：对应 source、依赖、构建记录、notice |
| `System.Configuration.dll` | SHA `3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf`；PE `4.0.30319.18020 built by: FX45RTMGDR` | Framework/targeting-pack 来源与 notice 未绑定到该文件 | `DISTRIBUTION_RIGHTS_UNKNOWN` + `NOTICE_GAP` + `REPRODUCIBILITY_ONLY` | 不从 FileVersion 推断 SDK 来源；若最终来源属于有对应源码义务的组件，再按该来源补齐；当前不预设源码义务 | 最小缺失：确切 framework source/package、targeting-pack/build identity、适用 notice |
| patched `libmpv` + FFmpeg 链接依赖 | `electronapp/libmpv/x64/mpv-1.dll` SHA `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`；历史 probe `v0.41.0-920-gdd5d17d32`、FFmpeg `N-125998-g2a20737f6`。SourceForge dev archive SHA `c6aebf40bb722efe79090bfeb61e68625f0837770347e5a8b610aef78900cf12`，归档成员与 DLL EXACT | mpv `Copyright` 说明 GPL/LGPL 模式取决于源码选择、`-Dgpl`、依赖和构建选项；FFmpeg commit `2a20737f662fd3f3f5999e873b9e7c90b5efc375` 和官方 `legal.html` 只有 reference/一般说明意义；archive 没有完整 build notices | `DISTRIBUTION_RIGHTS_UNKNOWN` + `CORRESPONDING_SOURCE_WAITING_EXTERNAL` + `NOTICE_GAP` + `REPRODUCIBILITY_ONLY` | archive/DLL 对应已关闭；不能据 header、mpv commit、字符串或 archive 单独决定 DLL 许可模式。获取路径为固定 archive、mpv commit、FFmpeg commit 和提供者 build records | 最小缺失：winbuild revision/workflow、resolved dependency sources、FFmpeg 配置/patch、mpv config、完整 toolchain、link flags、build log、全部 notices。现有材料不能完成对应源码履行或技术重建 |
| CEC / driver / RefreshRate | `cec/cec.dll` `6e2932ab53f4d05d5f815499786a48c3ccb8a60c527aa2f34e4abbf14dc66d04`；`cec-client(.x64).exe` `42f601278f82c37d0cc26460d4ac80e62f6cec5b84b2efb0ee8ed75c1cbc4519`；driver installer `6e4d5a091720cf5ad727896bbf3766e5529468e24849183439506130bde3546a`；RefreshRate `c3ac38b3345d804afc4ba97f34f059d0c4294ac5f55f62a25948ee62975eaa81`，FileVersion `1.0.0.0` | Host reference archive 中八项 binary identity 已匹配入口；libCEC 参考 commit `3dcc821c86576c94ac3b5b73fd764cc16dfe05b1` / platform gitlink `e237d8b3ab180ad85e3a944b275b297dd5cfa478` 不证明 DLL/driver 构建关系；独立 notice 未完整 | `DISTRIBUTION_RIGHTS_UNKNOWN` + `CORRESPONDING_SOURCE_WAITING_EXTERNAL` + `NOTICE_GAP` | RefreshRate 有公开源码入口但未重建；libCEC 源码不覆盖 USB-CEC driver installer；现有材料不能履行全部对应源码义务 | 最小缺失：CEC source/submodules/patch/dependency/build recipe/notice；driver 精确 source；RefreshRate 精确 project/toolchain/config/PDB（如适用） |
| 7 个 Carnival 保留 Node 包 | `detect-rpi@1.4.0`、`is-linux@1.0.1`、`is-osx@1.0.2`、`is-windows@1.0.2`、`power-off@1.1.2`、`sleep-mode@1.1.0`、嵌套 `is-windows@0.1.1`；29 files；聚合 tree `cbb82e43161547cb30509a4320e5b9847c0418580bb0acdcc4111647a55033c3` | 七份 registry tarball SRI 已核对；实际 license 文本与原包仅换行差异。`power-off/index.js` 存在 `stdout`/`stout` 差异；顶层 is-windows README 缺失；metadata/integrity 字段差异单独披露 | `LICENSING_OBLIGATION_RESOLVED`（随包 license 文本） + `DISTRIBUTION_RIGHTS_UNKNOWN`（继承/修改历史） + `NOTICE_GAP`（缺 README/原始导入记录） | registry tarball 与实际内容关系已足以支持可见 license 文件随包；不能声称完整原包 byte identity 或关闭修改/导入义务 | 最小缺失：Carnival 导入/修改记录、缺失 README/metadata 处理说明、完整 notice 映射；技术重建需原始导入 revision |
| 33 个 lock 生产 npm 包 | `package-lock.json` SHA `a9e5b13080b135b5182b3fa1dd21483207c862e0328aaa864a337f0e3863059b`；33 package selections；selected tree 1142 files，tree SHA `3d01be3560278303043d5513b4956162a397c0af91f981cfcca50a915c1528a5`，runtime selected tree `ca310c6c9e2d041a532dfc9737e1d6dacc73196c09c6b4b4d5b220bf6828a0a1` | lock resolved/integrity 与实际 selected tree 已绑定；可见 license/notice 路径已保留；notice 识别仍是路径级，不证明所有嵌入文本 | `LICENSING_OBLIGATION_RESOLVED`（已识别随包路径） + `NOTICE_GAP`（路径级完整性边界） | 现有材料可履行已识别 license 文本随包；不把 npm lock integrity 误写成对历史 overlay 的 source/build 证明 | 最小缺失：如需完整通知闭合，逐包 notice inventory 与未命名嵌入 notice 检查；如需 byte reproducibility，固定 npm cache/tarball 与环境 |
| 离线 Web、字体、图片与 overlay | Carnival Web base 761 files，tree SHA `e8a788166a6d0cdc8835f25b06f612196f9ae5d263bc783640bffa5025617b44`；runtime Web 720 files，tree SHA `cd928a06f8ce3b5381a3ca754e28548f67ec5b864b36b165abbb973357aa1df7`；23 fonts、19 images；runtime overlay 由 manifest 绑定 | 现有 payload 无精确 Web revision、逐资产 source notice 或完整 overlay attribution；资产名称不能推导许可 | `DISTRIBUTION_RIGHTS_UNKNOWN` + `CORRESPONDING_SOURCE_WAITING_EXTERNAL` + `NOTICE_GAP` + `REPRODUCIBILITY_ONLY` | 可从冻结 Carnival/patch 输入取得并重建既有变换关系；不能履行逐资产权利/notice 义务 | 最小缺失：Web 精确 source revision/归档、依赖锁、overlay/import 映射、字体/图片原始来源与 notice |
| Electron 44.4.2 全树 | official Windows x64 archive SHA `6aae435b6cd5c0eedf9fd38824bae4045ffdaecd029f0b8c8328bac3f5b71f03`；runtime `x64/electron/electron.exe` `0446040f3c63eb75d5b1e1663d5ef27f07730a82df3e4fa47ff77c1a33cef07c`；73-file tree `f9f14e4fe641b68296cf6d17357b4037a514c87ed8c83e91395de11d924c9030` | Electron `LICENSE` `5154e165bd6c2cc0cfbcd8916498c7abab0497923bafcd5cb07673fe8480087d` 与 `LICENSES.chromium.html` `7b328b8c7463ac9bfc7dc648c751533517c8441a0b5b21047d6c0b2620e60d70` 随包 | `LICENSING_OBLIGATION_RESOLVED`（archive notice） + `REPRODUCIBILITY_ONLY` | official archive→validated tree→payload 关系已闭合；未从 Chromium/Electron 源码重建，不因此声称源码重建 | 最小缺失：若发布策略要求完整源码重建，再补 Electron/Chromium/V8/Node 及依赖 build recipe；当前不自动升级为分发阻断 |
| Native Helper / mpv header / UCRT64 | Helper SHA `28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`；source `native/mpv-helper/ete-mpv-helper.cpp` SHA `7b7ae54af6ca292a40fc7fd8d315b12bc18599d9cd7cb23361d3671c80e459e4`；header SHA `1acf99ee77c8c2a6f1d1993bd81bbc8a91d27fb5924e80171670e6139a4bd353`；GCC `16.1.0 Rev5` driver SHA `798a6eb495b30cf771dc759b5508d269ecb0dddac739719e8b30fe0ac0744b69`；toolchain 6990 files / 553090415 bytes / tree SHA `5215ec9725ad0ef660064944eef6aba5106bd09044a0f70a6e37c4252815fab3` | 项目源和固定 header/工具链材料路径已记录；Helper 本身为源码构建；未将工具链或 libmpv 许可混成项目 GPL 结论 | `LICENSING_OBLIGATION_RESOLVED`（项目 helper 源路径） + `REPRODUCIBILITY_ONLY` | 现有材料足以支持 Helper 的源→输出关系与既有历史 build evidence；不等于完整产品重建或 libmpv 依赖 notice 已闭合 | 最小缺失：若要求完整 toolchain source/bootstrap/recipe 闭合，补剩余 MSYS2 recipe、bootstrap 与各第三方 notice；不影响已记录 Helper source identity |

## 现有材料能够关闭的范围

已实际关闭：候选 payload 的 2138 条路径/hash、source/runtime/build/native-helper provenance 的身份绑定；四份项目材料的随包路径；Electron archive、73 文件树和两份 Electron notice；libmpv dev archive 到 `mpv-1.dll` 的字节对应；三项 NuGet DLL 的成员 EXACT（Common、ServiceStack.Text、SimpleInjector）；七个继承 npm 包的 registry SRI 与可见 license 文件；Native Helper source/header/helper/toolchain identity；33 个 lock 生产包的选择与聚合文件树。

仍阻断 Stable 分发材料决定：Host EXE 与未匹配 DLL 的精确 source/build/notice 关系；ServiceStack.Text FOSS exception 下 Host/Additions 完整源码和责任人选择的履行路径；patched libmpv 的 winbuild、FFmpeg/其它链接依赖、patch/config/toolchain 和完整 notice 集合；CEC/driver/RefreshRate 的逐项构建来源；离线 Web、字体、图片及 overlay 的逐资产来源/通知。继承MIT/Apache包的导入/修改历史仅列复现限制，完整通知已保留；不单独因此阻断。`REPRODUCIBILITY_ONLY` 项（Electron 源码重建、部分工具链 bootstrap）单独记录，不被误写成许可判断。

用户报告“实测了一下没问题了”只可作为 `USER_REPORTED_PASS` 的外部前台证据标签；本材料核查不重写真实 Together、Windows 安装生命周期或 fullscreen 历史状态。fullscreen 仍为 `INCONCLUSIVE`，真实 Together 和安装生命周期仍以现有状态文档为准。

## 有界公开补材料（最多 12 个固定入口）

以下入口只针对已有固定 revision/archive/package，不重复失败候选下载；它们是事实/候选材料入口，最终许可路径由 parent 决定。

1. [Windows Host reference `708fadc...`](https://github.com/MediaBrowser/emby-theater-windows/tree/708fadc068cbf66ced6aece4a32f3e12bb2c4e13) — 公开源码/reference；不证明 Carnival EXE 对应重建。
2. [MediaBrowser.Common 3.3.10 NuGet](https://www.nuget.org/packages/MediaBrowser.Common/3.3.10) — 既有 DLL member EXACT 的 package 入口。
3. [ServiceStack.Text 4.5.14 NuGet](https://www.nuget.org/packages/ServiceStack.Text/4.5.14) — 既有 DLL member EXACT 的 package 入口。
4. [SimpleInjector 4.0.11 NuGet](https://www.nuget.org/packages/SimpleInjector/4.0.11) 与[固定官方 MIT LICENSE](https://github.com/simpleinjector/SimpleInjector/blob/e3ce923d72bca2a5e1452725685b59b886c64bac/LICENSE) — 既有 DLL member EXACT 和许可 metadata/文本入口。
5. [ServiceStack license at `e5819a8...`](https://github.com/ServiceStack/ServiceStack.Text/blob/e5819a8de75a8bae64ddc7a64008613067893e32/license.txt) — 固定许可文本；不选择商业或 copyleft 路线。
6. [mpv dev archive record](https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20260809-git-dd5d17d328.7z/download) — 固定 archive/checksum 入口，历史已核对。
7. [mpv source `dd5d17d...`](https://github.com/mpv-player/mpv/tree/dd5d17d3285a095a0f712fa9d116e22a076492de) — 固定 source/header reference；不替代 winbuild/dependency closure。
8. [mpv `Copyright` at fixed revision](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/Copyright) — 构建选项/依赖影响许可模式的官方文本。
9. [FFmpeg fixed commit `2a20737...`](https://github.com/FFmpeg/FFmpeg/commit/2a20737f662fd3f3f5999e873b9e7c90b5efc375) — DLL 字符串定位到的源码 reference；不证明链接配置。
10. [Electron v44.4.2 release](https://github.com/electron/electron/releases/tag/v44.4.2) — official archive/SHASUMS 入口。
11. [npm `power-off@1.1.2` registry metadata](https://registry.npmjs.org/power-off/1.1.2) — 已核对继承包 SRI/版本入口。
12. [npm `sleep-mode@1.1.0` registry metadata](https://registry.npmjs.org/sleep-mode/1.1.0) — 已核对继承包 SRI/版本入口；其它五项沿用既有审计机器证据，不重复增加查询。

## 审查范围与验证

读取了项目 `AGENTS.md`、`docs/ARCHITECTURE.md`、`docs/PROJECT_STATUS.md`、`docs/LESSONS_LEARNED.md`、`docs/AI_MODEL_POLICY.md`，以及材料 gate、材料 request/closeout、`SOURCE_MATERIALS.md`、`LICENSING.md`、`THIRD_PARTY_NOTICES.md`、`BUILD_INPUT_AUDIT.md` 和 v0.3.0 readiness/candidate evidence。只读核对指定 readiness `vendor`、候选 `dist/.../build-manifest.json`、provenance 和明确的 `.work` 审计/解包输入；没有全量递归扫描私人目录，没有启动第三方程序、安装器、驱动、客户端或服务，也没有重跑测试。

本轮公开入口查询为 4 组定向 primary-source search，加上既有历史核实入口的固定复用；未下载新的程序、archive 或源码。机器明细见 [`v030-distribution-materials-final.json`](evidence/v030-distribution-materials-final.json)，其中保留候选 manifest 的每一项 file/hash，并给出按组件的聚合索引。该报告不修改原 `THIRD_PARTY_NOTICES.md`。

## 主线程最终复核增量

再次下载官方SimpleInjector4.0.11 nupkg，net45成员SHA与目标DLL完全一致；nuspec指向官方许可入口，固定MIT文本e3ce923d72bca2a5e1452725685b59b886c64bac已完整追加到THIRD_PARTY_NOTICES.md，原有通知保留。准确身份见[SimpleInjector回执](evidence/v030-simpleinjector-license.json)。该组件许可/通知履行已闭合；未精确重建只记REPRODUCIBILITY_ONLY，不为它要求对应源码。

其余matched或unknown组件的源码请求应按适用许可证条件判断；System.Configuration等许可证路径未确认时，CORRESPONDING_SOURCE_WAITING_EXTERNAL只作为条件性需求。已知存在再分发依据缺口或copyleft源码/通知履行路径缺口的组件继续阻断，PDB和bit-exact重建不是普遍法律必备材料。当前官方FFmpeg说明与固定mpv Copyright均要求按实际构建/链接组成判断；针对锁定DLL的静态ASCII扫描未发现configure flags，仅有Lavf63.5.101/Lavc63.7.100文字，不能据此绑定FFmpeg源码revision或许可模式。

本机器JSON是原322a037内部候选的历史材料身份索引，最终stable-rc完整payload以其自身manifest和最终门禁回执为准，不能把此旧集合改标为新产物。
