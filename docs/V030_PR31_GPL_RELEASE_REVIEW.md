# PR31：GPL 来源与最小 Windows 发行门禁

后续维护者明确决定 **LICENSE_GATE_WAIVED_BY_MAINTAINER**，终止专项并接受风险。以下审核UNKNOWN/GPL组合事实与原未放行结论保留历史身份；其内部自动阻止构建/准备行为由[维护者决定（历史记录）](https://github.com/hope140/EmbyTheaterEnhanced/blob/v0.3.0/docs/V030_MAINTAINER_RELEASE_DECISION.md)豁免，不等于合规PASS。当前仅授权PR31整合及新main产物准备，公开上传/Stable仍待单独决定；不继续主动补件或新一轮法律审计。

2026-10-12（UTC+8）。审核对象 PR31 `94556b73ba6b5106d3ac87ed1b43a1bf9eb04862`，远端 main `72d4688821822860d20342ae8c784a279b06b4f5`。用户明确以官方 Emby Theater GPL-2.0 上游维护开源衍生项目，不以 Carnival 作者额外许可作为默认发布前提。本页修正前轮矩阵过宽的 rights-unknown 口径，保留原文件身份和历史回执。

**结论：当前完整 Windows 安装包仍不能批准公开发布。最先要解决的是 libmpv/FFmpeg 与 GPL-2.0-only Helper 的实际组合；另外两组是对应源码/通知交付，以及独立第三方授权或许可条件。状态 RELEASE_BLOCKED_EXTERNAL_MATERIALS，功能与已验收体验保持冻结。**

## 1. 取消哪些默认门禁

- 官方 Windows Host `708fadc068cbf66ced6aece4a32f3e12bb2c4e13` 和 Electron `db0f4c814ee1e7d9b5f50010065c5cb64a20357e` 的 GPL 源码已有依据。使用这些代码及具有有效 GPL 授权的修改，无需再向官方或 Carnival 作者重复申请同一授权。
- 官方 GPL 代码、实际修改的源码完整性、第三方独立许可分开判断。Host EXE 与参考源的关系待解释，是**对象代码对应源履行缺口**；不能因此将已经获得的官方 GPL 授权降为 UNKNOWN。未知独创增量另列，不覆盖已确认部分。
- GPL 对应源是实际修改首选形式、必要模块/接口及控制编译安装的脚本；修改文件保留变更和日期说明。GPLv2 §3 允许随对象提供完整源，或满足条款的源获取安排。没有普遍的 bit-exact、PDB、历史机器或完整编译器复刻门禁。版本/hash/构建记录用于识别真正对应的源，不能拿不相符的参考源冒充；无同字节重建本身不阻断。
- 若官方源及适用许可足以履行，不必只向 Carnival 索取。商业授权仅在选择商业条款时需要；当前不会将其加为 GPL 路线的默认要求。

## 2. libmpv/FFmpeg：关键事实与最小路线

| 证据 | 实际含义 |
|---|---|
| DLL SHA `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`；官方发布 run `31285220366` / builder `cd1edc11dc6887a50f705717619d879f5a93a488` | 上次取得的 dev archive→DLL EXACT 保留；run 名称/size/variant/直接上传链支持配方关联，但无目标 archive SHA attestation，不伪造密码学绑定 |
| 固定 `packages/ffmpeg.cmake:60-61` 有 `--enable-gpl --enable-version3`，并启用 openssl/x264/x265 等；mpv 配方 `--prefer-static`，未禁用 GPL | 对该配方适用 GPLv3 条件有具体证据，不能按 mpv 的 GPLv2-or-later默认或 ISC API header 推成整个 DLL GPLv2/LGPL |
| 固定 FFmpeg `LICENSE.md` 明确 version3 开关选用 v3；实际 run 记录 FFmpeg `2a20737f66` 更新与 No patch step | 官方核心源可获取，GPLv3判断不是泛化怀疑。完整缓存依赖组成/源与实际配置尚未齐全；静态 DLL 本轮未查到 enable-gpl/version3 字符串，**没有查到不等于禁用** |
| `native/mpv-helper/ete-mpv-helper.cpp:1` 明确 GPL-2.0-only；1370 起 LoadLibraryEx/GetProcAddress，调用 mpv API并共享 mpv_node/event 等结构 | Helper 与 libmpv 在同一进程内直接链接使用；不是隔着一个独立 CLI。GPLv2-only 与 GPLv3组合不能仅凭动态加载方式、全文通知或源公开自动放行 |

GNU [GPL FAQ 版本兼容说明](https://www.gnu.org/licenses/gpl-faq.html#v2v3Compatibility)与[模块/聚合说明](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)已实际取得并回读；FFmpeg准确版本的[许可原文](https://github.com/FFmpeg/FFmpeg/blob/2a20737f662fd3f3f5999e873b9e7c90b5efc375/LICENSE.md)已在PR保存全文。这支持直接链接组合必须解决的判断；不把“同一安装包包含GPLv2和GPLv3”本身当成违法组合。

### 最小优先路线：先核对 Helper 自身可用授权

Git历史显示该 C++ 文件由项目提交 `c5936760419395acc7dc2ee3941499f4f47b4bcf` 新增，最初即有 GPL-2.0-only 注释；该注释目前是可见授权。它不是官方 Emby Windows Host 的同名源文件；includes 是Windows/标准库和ISC client API header，没有在这次限定检查中找到Emby GPLv2-only源文件的直接include。**Git新增及提交署名不能证明全部版权归属或排除复制。**

因此有一条比重构/更换播放器更小的候选：由有权授予该 Helper 全部相关代码许可的权利人确认可用授权，给这一组件提供兼容 GPLv3 的授权及源/通知；主 Electron/Host 上游 GPL-2.0 保持。需要核对 Helper 输入的第三方代码和运行库条款，不能替无权更改的上游重新许可。此方案是 **PROPOSED_NOT_IMPLEMENTED**，本轮没有改 SPDX、根LICENSE或源码，没有称 Helper 已获 GPLv3授权。

Electron 到 Helper 使用 `controller.js:149-154` spawn/stdio pipes 与 length-prefixed JSON；它们不共享同一地址空间。消息是 command/property/media输入、generation/窗口等控制协议，未在此次检查发现跨边界传递 mpv 原始指针。但接口仍是专用控制协议，携带生命周期与属性结构。GNU FAQ 要求同时看通信语义；**这为分别授权的方案提供评估依据，不能只因存在进程边界就自动认定独立作品**。在应用候选授权前需形成该边界的明确判断；没有必要默认把整个Emby GPLv2上游升级成GPLv3。

若该最小授权路线无法成立，备选才是来源/依赖完整的 GPLv2-compatible 或 LGPL libmpv 构建；不能只删 `--enable-version3`，忽视启用库的实际许可和功能。现有能力须保留。此备选未构建，本轮不改变任何播放架构。两条路线都仍需完整对应源、修改/编译安装材料、依赖通知和实际交付安排；清楚公开的 GPL 组件不需另行购买再分发许可。

## 3. GPL 源履行与真正未知增量

| 范围 | 修正后的判断 | 最少剩余动作 |
|---|---|---|
| 官方 Host / 已识别 Electron GPL代码及有效GPL修改 | 官方 grant 已确认；取消额外作者许可默认门禁 | Host 实际 preferred source或固定源未修改说明/实际patch，必要脚本；已识别应用层交付维护源/变更说明，生成Web交付首选源/生成材料。技术关系未明不直接升级为grant未知 |
| ServiceStack4.5.14 | 官方 Software 源/AGPL/FOSS Exception 已取得；不要求 Carnival 重供同一官方源或默认商业授权 | 满足FOSS Exception的Host/Additions完整源、独立部分许可和本次源码获取安排 |
| 当前完整离线 Web | 可识别官方GPL部分不再索取额外许可；其它部分仍是**来源/修改映射未确认**，不是整体被证明Carnival独创 | 对仍未映射部分给实际首选源/来源说明；独立JS/WASM库依各自许可补notice/必要源，不普遍要求minified代码同字节重建 |
| Carnival 定制入口候选 | 现有资料没有证明整个B类是Carnival独创，也没有证明所有候选获得GPL。单列三个候选，不能因“作者不会追究”授予许可 | 当前内部RC确实包含 `CustomCssJS.js`、`Emby.ConfigureAndUninstall.bat`、`Emby.Dialog.bat`，见机器回执。核对这些具体增量的上游/修改来源和适用grant；若已有有效GPL只交付源码/通知。确属无授权独创才需要许可或评估可选排除，不扩大为整包作者许可 |

三个候选来自 manifest 的 `Carnival customization entry` 分类，而非作者版权鉴定；不能把与某个官方参考版本不一致等同独创。其它未匹配 DLL 也不自动成为 Carnival 独创。`docs/CARNIVAL_BASELINE.md` 原本就明确B类不证明作者权属。二进制实际差异仍须通过真正对应源/修改说明解释。

## 4. 第三方独立条款不被项目GPL覆盖

- SharpCompress / Socket / Common / Model / System.Configuration：现有准确来源事实继续有效，但适用的第三方grant/notice需要单独成立。根Host GPL不是给独立DLL自动换许可证；对应源只按适用条款要求。这里不是向Carnival默认索取额外项目许可。
- CEC：已有GPL-2.0-or-later授权路径，不需额外作者许可，目标库的实际源/修改交付仍缺。driver 内含DPInst的条款待确认；库GPL不能授予Microsoft组件的再分发权。RefreshRate官方项目GPL依据与目标实际源关系分开处理，不因 PE 名称差异自动判定无授权独创；不能直接删除其无条件播放等待依赖。
- Roboto、jQuery及已闭合MIT/Electron/npm层保持结论。两Material字体、19图形的grant/必要归属，思源OFL修改版RFN条件仍独立处理；“来自官方仓库”或“项目整体GPL”不能自动解决字体/图片/驱动许可。

## 5. 最少放行事项与本轮停止点

1. **确定兼容的 libmpv/Helper 授权组合。** 优先确认Helper全部代码授权能力及进程间独立边界，再实施最小许可补件；无法成立再考虑可兼容构建。不改官方GPLv2代码授权，不用IPC或API头作为自动免责。
2. **完成实际对象代码的对应源码和通知交付。** 主要为Host/Additions、实际Web源/变更、libmpv/FFmpeg含缓存链接依赖的完整源/patch/编译安装脚本。准确版本/材料必须能解释所交付对象，不要求bit-exact、旧机器、PDB或默认每个工具链从源自举。已取得的GPL许可不重复索取作者授权。
3. **闭合具体独立项。** 对三个定制入口先查实际来源/有效许可；第三方DLL、图形/字体、driver按自身许可处理，已闭合项不重新打开。若确认无grant再选择取得授权或功能可接受的替代/排除。

用户覆盖升级/升级后启动使用USER_REPORTED_PASS、Together PASS及安装器UI PASS保留；未确认的配置/DeviceId/其它系统场景仍如实披露。原全屏INCONCLUSIVE不改历史。审核只新增来源/条款/静态边界证据，没有运行播放器、安装器或重复通过的功能测试，没有创建Stable Tag/Release或公开上传安装包。

机器证据：[v030-pr31-gpl-review.json](evidence/v030-pr31-gpl-review.json)。本页是发行审核判断及未实施路线说明；当前旧候选仍不可冒充已获批准的公开Stable包。
