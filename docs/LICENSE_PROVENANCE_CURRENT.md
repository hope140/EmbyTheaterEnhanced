# 当前来源与许可证据（2026-11-09）

本轮固定 main 与最新公开测试版，逐项判断 v0.4.7 审计证据能否继续适用，并重新只读提取两版安装器。**当前包的身份、本文明确列出的通知交付、官方输入继承关系已经核对；部分来源增量、对应源码交付及具体许可组合仍未闭合。**这是有界证据整理，不是全部许可义务已完成、SignPath 已获批或正式法律意见。没有执行安装器或产品，没有更换依赖、修改播放或发布流程。

## 固定基线和证据强度

| 对象 | 实际核对的准确身份 |
| --- | --- |
| 当前 main 快照 | [`f007802f3dcb0457091322644094981cdf5783ac`](https://github.com/hope140/EmbyTheaterEnhanced/tree/f007802f3dcb0457091322644094981cdf5783ac)；后续 main 移动不自动进入本结论 |
| 最新公开测试版 | [v0.4.19](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.19)，`f07bf1f575741fe9f33e7345a96c8f61e5e8bc9a`；API 标记 prerelease，发布时间 2026-11-08 10:03:03 UTC |
| 旧版 | [v0.4.7](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.7)，`5190a7020d0d00ea06776676921469736859bfbd` |
| 旧审计 | `audit/signpath-v0.4.7` 实际头为 [`8ffa74754783308172775f3ef8e64e738ce31c2d`](https://github.com/hope140/EmbyTheaterEnhanced/tree/8ffa74754783308172775f3ef8e64e738ce31c2d)，本轮实际读取原文与 JSON |

旧审计的[缺口表](https://github.com/hope140/EmbyTheaterEnhanced/blob/8ffa74754783308172775f3ef8e64e738ce31c2d/docs/SIGNPATH_V047_GAPS.md)、[历史追查与停止点](https://github.com/hope140/EmbyTheaterEnhanced/blob/8ffa74754783308172775f3ef8e64e738ce31c2d/docs/SIGNPATH_V047_HISTORY.md)、[安装包通知核对](https://github.com/hope140/EmbyTheaterEnhanced/blob/8ffa74754783308172775f3ef8e64e738ce31c2d/docs/SIGNPATH_V047_PAYLOAD_NOTICES.md)以不可变提交链接保留，不把旧分支内容合入 main，也不将旧日期结论改写成新测结果。[本轮机器回执](evidence/license-provenance-20261109.json)包含下载 URL/大小/SHA256、完整源码差异、组件 Git 对象、24 项原库存、通知逐项结果及安装包差异。

本文区分三种强度：**实测字节**是本轮下载/提取并比较；**继承核验**是固定旧回执已核上游、本轮确认输入不变及当前交付哈希相同；**来源参考**是官方源码、声明或构建配方存在，但尚不足以证明整个成品的对应范围。这些不是许可评级。优先沿用已确认的 Emby 官方分发、组件声明和 notices，不为每个已许可组件重新索取授权；无法精确重建历史字节不单独构成许可缺失。

## 当前与旧版的变化

源码 `v0.4.7 → main` 共 184 路径变化（54 新增、130 修改、0 删除）。机器回执逐路径列出。第三方固定输入及通知的 21 个重点目录/文件 Git 对象在 v0.4.7、v0.4.19 和所核 main 均一致；包括 Web、Model、官方 Host 清单与维护源、libmpv、继承 npm、Koffi registry/lock、API MIT 原件和 runtime 模板。Electron 清单与 Vulkan loader 身份另列变化。

| 组件 | 现状／相对 v0.4.7 的变化 | 证据继续适用的范围 |
| --- | --- | --- |
| Electron／Vulkan loader | 44.4.2 → **44.5.0**；官方 ZIP SHA256 `b3405d8847bc5054cd16272f538d22ba5b73032945e85cef26241f7135035278`。本轮重取 ZIP，73/73 成员与当前包一致；额外 loader 副本亦与同 ZIP 的 `vulkan-1.dll` 相同。 | 新版本须使用新归档证据；两份通知均与新归档一致，实际正文也与旧版相同。官方 [v44.5.0](https://github.com/electron/electron/releases/tag/v44.5.0) 的 annotated tag 解析到源码提交 `435b189742416c5a05019b72baf6313b328cdcd6`；不是自行重编 Chromium 的证明。 |
| 生产 npm／继承 npm／Koffi | 项目 lock 仅根项目版本改变；所有依赖项不变。继承输入及 Koffi 3.3.3 两包的 registry/lock 不变。 | 旧上游 tarball/SRI、固定官方 Git 与换行变换证据可继承；本轮当前包再次匹配 36＋7＋3 份通知。Koffi 两包均声明 MIT，原生子包定位为同版本 win32-x64 模块；主包三份原通知确实交付，子包上游没有独立 LICENSE，不能记作装配丢失。 |
| API | `licensed` 原件及 MIT 文本不变；维护的 apiclient、transport 源与 AMD 输出改变（POST deadline/body/cancellation），mit-apiclient 与 events 不变。 | 固定 [fdd0939 官方 MIT 源](https://github.com/MediaBrowser/Emby.ApiClient.Javascript/tree/fdd0939ac596406ab92274f30fd83d226a677424)仍适用；4 个所选输出全部匹配本版 selection 与实际包。保留 CM 的后期增量不因 API 维护变化重新扩大成整个 API 的未知授权。 |
| Web／字幕／preload | 固定 Web 基底和七行 preload 模板均未变；本版维护 overlay、生成 preload 改变。旧库存 7 个代码/模板与 17 个图像全部保持原 SHA。 | 已辨 GPL/MIT/Apache 原表达及通知继续保留；ETE 的生成器与修改可追至本版源码。生成输出变化不把未变基底的作者改成 ETE，也不使已确认许可失效。 |
| Model／Common | 未变；本轮同时匹配官方 Windows 3.0.20 ZIP 与官方 NuGet 3.3.10 的两个 DLL。 | 官方发行身份是实测证据；Model SHA `db22f8ea…45153`，Common SHA `8fc955a5…2657f`，全文见回执。缺的是发布源码关系和具体差异，不是两个 DLL 无官方来源。 |
| Host／RefreshRate／其他依赖 | 固定官方 19 成员归档核验通过；最终仍为 8 个未改官方成员、2 个源码派生 Host EXE/PDB、单独固定 Newtonsoft。本轮两版实际 Host EXE/PDB 未变。 | Host 已有 GPLv2 源及 ETE 修改/构建合同；Socket、SimpleInjector、Newtonsoft 的已有 MIT 依据保持。RefreshRate 与官方 ZIP 字节一致，不能以历史名称或未复现旧编译器推翻已确认来源。 |
| libmpv／FFmpeg | 原 7z 与输入清单未变；两版交付 DLL 相同，SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。 | mpv `dd5d17d328`、FFmpeg `2a20737`、builder `cd1edc11` 和原 run 证据继续适用；实际依赖锁、补丁/链接配置、必要 notices 和完整对应源码安排仍未闭合。 |
| ETE 新增及维护输出 | 实际包新增 7 个维护 JS/CSS：media-network-diagnostics、navigation-diagnostics、shutdown-drain、strm-playback-config、subtitle-appearance-dialog（JS/CSS）、update-handoff-outcome；Helper、维护模块和若干 Web 输出变化。 | 新路径均对应本版公开维护源码；不是新增第三方包。完整路径与变更 SHA 在回执，维护层继续按根 GPL-2.0-only 声明；本轮不扩大第三方许可范围。 |
| 已退役资源 | 两版包之间 **没有新删除文件**。CEC 五文件、SharpCompress、ServiceStack、私有 System.Configuration DLL、修改版思源字体、旧 `themes/logo.png` 和 Anime4K 已在旧审计基线前退役，当前仍不在包内。 | 保留历史来源与必要通知；其旧 SDK/RFN 等事项不当作当前包的活动补件。其他仍用的 logo/图片需按具体路径区分；不能说所有图像都退役或都未知。 |

main 比 v0.4.19 多出的产品差异限于诊断/Native-first 回退语义及测试，另有文档变化；第三方清单和本文已核组件不变。**安装包实测只证明 v0.4.19，不是尚未发行 main 的成品证明。**后续发行必须绑定自己的 sourceCommit 和最终 payload。

## 实际交付核对：已完成的有限集合

本轮重新取得 [v0.4.19 安装器](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.19/EmbyTheaterEnhanced-0.4.19-win-x64-setup.exe)：161,879,672 bytes，SHA256 `26a25bc30bd3750882bdd3d4f9ee27a1b97ff492ea2882867cc1e72a78aed2eb`；五个发行附件均按 API 摘要核对。使用 [innoextract v1.13.0 Linux amd64](https://github.com/crazy-max/innoextract/releases/tag/v1.13.0)，工具 SHA256 `c898db2ecc282ff8d943e9868d03dd6f1fc6069ddd40430341b211f93826b360`，只读解包返回 0。`Unexpected filetime: 0` 警告与旧审计相同，本轮不采用时间戳作为证据。

- **2232/2232 清单文件**存在、SHA256 全部相同；另一个文件是 manifest 自身，没有其他额外文件。manifest SHA256 `bf15d8e738a34ac6ca2d738fae64ce2a23a74a858451a85f3a9d358f25ea80ab` 与外置 provenance 一致。内外及五份来源记录的 sourceCommit 均为本版 `f07bf1f…`。
- 重新下载并提取旧 v0.4.7，其 **2225/2225** 清单文件再次通过，manifest 与旧回执一致。两版清单差异为 **7 新增、67 改变、2158 未变、0 删除**；比较不含 manifest 自身。来源记录、版本和文档变化也算文件变化，不等于 67 个依赖更新。
- **16 项项目通知/来源说明**均与 v0.4.19 准确 Git blob 相同；其中 15 项与旧回执相同，仅 `SOURCE_MATERIALS.md` 已随 Electron 更新改变。
- **36 项生产 npm、7 项继承 npm、3 项 Koffi 通知**逐项匹配旧版已独立核验的上游哈希；相关固定输入保持。此次没有重复下载这 33 个 npm tarball，不能写成新一轮上游 tarball 审计。
- **2 项 Electron 通知**与本轮新下载的 44.5.0 ZIP 字节相同：LICENSE 为 1096 bytes；LICENSES.chromium.html 为 20,472,830 bytes。与上述 62 项合计 **64 个明确比对路径**，未发现预期通知遗漏或修改。不是所有源码内头部/README/嵌入依赖或全部许可义务的穷尽检查。
- 官方 [Windows 3.0.20 ZIP](https://github.com/MediaBrowser/emby-theater-windows/releases/download/3.0.20/emby-theater-x64.zip)重新下载，111,318,728 bytes，SHA256 `3bc01d288d64046483ef12a8e5a70cc31b6d8b65ed9ee1837554ab7eba797c4c`，19 项原输入及独立 Model 匹配；派生 Host 与官方原 EXE/PDB不同是预期，不记作来源失配。
- 官方 [MediaBrowser.Common 3.3.10 NuGet](https://api.nuget.org/v3-flatcontainer/mediabrowser.common/3.3.10/mediabrowser.common.3.3.10.nupkg)重新下载，177,439 bytes，SHA256 `4d9bd3ed99e9b2b6cd22622018af5667246d8b866041f540afdb973b30d30d0b`。其中 Model 426,496 bytes、Common 44,032 bytes 与当前包相同。nuspec 指向官方 Emby，没有 license/repository revision 字段，`requireLicenseAcceptance=false` 不用作免除条件的依据。

## 已有许可依据与尚缺的最小材料

已确认的 [组件许可结论](dependency-research/LICENSE_DECISIONS.md)继续适用其明确范围：API/page MIT、helper 及已辨 Web GPL、Mozilla VTT Apache、jQuery/Sizzle MIT、Roboto Apache、Google Material Icons 内容与完整 Apache 文本、Socket/其他已辨 MIT。equalizer 已有官方字节来源；不把 17 张库存图片全部算作无依据。旧 minifier、字体导出器或 bit-exact 重建未知本身不生成新的授权要求。

| 未决边界 | 已尝试/已有证据 | 最小下一步及停止条件 |
| --- | --- | --- |
| 七行 preload 原表达 | 旧追查到首次模板入库 `d941bcd5`；当前模板同 SHA `2d1f39a8…bea38`。官方路径查询和定向搜索未确认更早来源。 | 只接受最初导入 URL/commit、原包适用声明或作者说明作为新线索。没有新线索就停止，不按短代码行数推断权利，不重新发明作者。 |
| 保留 Web/字幕增量 | 旧官方 4.7.6 与 4.7.14 两包的六输入比较、GPL/MIT/Apache 已辨表达仍有效；本轮基底 SHA 不变。 | 只补 CM auth/cache/failover、page 路由/元数据、PlaybackManager stream/队列/report、AppSettings set/event/码率、VTT 后期布局/桥接与 428-byte CSS 的具体来源和适用声明。ETE overlay 已在本版源码，不重复索取；没有新对应材料不再遍历旧包。 |
| 保留图像/继承小资源 | 24 项旧库存全部匹配；各图片、默认配置与 24 项继承译文保持既有记录。已退役字体不在当前包。 | 对未覆盖的评分徽标、主题背景、supporter badge、保留 icon/splash/logo 等，以具体文件寻找原图与再分发/修改/署名条件；已有官方匹配与许可不重复归零。不因品牌存在自动判有权或侵权。 |
| Model/Common 发布源码关系 | 官方 ZIP＋NuGet 双链本轮均匹配。旧 `a304` GPL 参考、Model Profile7 vs netstandard1.3、Common 已定位 Updater `IsAsset`/过滤差异保留；NuGet 未给准确 revision。 | 取得 3.3.10 实际发布源码/project/打包材料或明确对应说明，补具体差异与适用源码交付范围。不猜提交、不要求用户重交现成 DLL、不以不能同字节编译否定官方许可。 |
| libmpv/FFmpeg 对应源码与 notices 范围 | 固定原归档/现 DLL未变；旧原归档仅接口头/导入库/DLL，builder 有 GPL/version3 与 prefer-static，原 run artifact 索引未列源码专用产物。 | 有新的原 run 源锁、缓存源码快照、补丁/config/链接清单或发布者材料才继续；按实际所含组件补必要 notices 与可取得的完整对应源码。108 份 recipe 不等于全部实际链接；不重下同一主源码 ZIP充作闭环，不替换 DLL。 |
| 具体作品/组合判断 | 项目 GPL-2.0-only 与固定 GPL/version3 配方、Apache 代码等存在需按实际边界确认的问题；已取得许可文本不代替这一判断。 | 用已固定成品和实际链接/源范围作专门评审；不因同包或动态加载直接判兼容/不兼容，也不改根许可证来消除表面差异。 |

上述有限公开来源路线已收束。本轮未发现需要用户提供现有安装器、官方 ZIP、NuGet/npm 或通知副本；也没有通过联系第三方、签名申请或权限变更来填补资料。缺口是具体证据/履行范围未确定，不是违法结论。新的原始材料可在本工作线继续逐项核验；单纯重复既有搜索不增加证据强度。

## 复核方法

1. 固定上表四个 Git ref；读取旧三份文档及对应 JSON。用 `git diff --no-renames --name-status` 比较源码，用 `git rev-parse <commit>:<path>` 对照回执中的组件对象；对旧库存实际 Git blob 再算 SHA256。
2. 下载回执中的固定安装器、五附件、官方 Electron/Windows ZIP、NuGet 和解包工具，先核完整大小/SHA256。在两个全新目录分别执行 `innoextract --extract --output-dir <directory> <installer>`，不运行安装器或包内代码。
3. 遍历 `build-manifest.json.files`，独立计算每个实际文件 SHA256，检查文件集合并单列 manifest 自身；对比外置 provenance 与五份包内来源记录。按路径/hash 对两版清单做差集与交集比较。
4. 项目通知按包内 `build-input-provenance.json.notices` 对照本版 Git blob；npm/继承/Koffi 按旧回执的明确路径与哈希，并核固定输入未变；Electron 全树及两通知按新 ZIP 比。官方 Windows 保留成员及 NuGet 两 DLL直接比较字节；API 四输出按本版 selection 对 Git 与包。
5. 回执中的 `webOverlays`、`preparedArtifacts` 为包内来源声明，本轮核其最终输出 SHA；这不冒充重新执行全部生成器或重建 Windows 二进制。文档检查、固定输入验证、公开回归与最终 CI 结果另按准确审计分支提交记录，不把它们当成真实播放、安装或许可意见。
