# v0.4.7：具体缺什么、谁能补、补到什么程度

本轮继续核对公开 tag `5190a7020d0d00ea06776676921469736859bfbd`，日期 2026-10-31。以下按该版本构建选择整理，安装器内部成员尚未独立提取。该清单不是全部 713 个 Web 输入的完整权利审计，也不是“缺口总数”。已有通知、来源不因未知修改史而失效，公开下载或精确哈希也不自动补足授权。总体情况见[材料矩阵](SIGNPATH_V047_MATERIALS.md)。

后续的仓库历史、两版官方Web与原始libmpv归档实测见[有界追查与停止点](SIGNPATH_V047_HISTORY.md)。

## 本轮实际补上的证据

| 已完成核对 | 结果及其限度 |
|---|---|
| Model 的第二条官方来源链 | 下载 [MediaBrowser.Common 3.3.10 NuGet](https://api.nuget.org/v3-flatcontainer/mediabrowser.common/3.3.10/mediabrowser.common.3.3.10.nupkg)，包 SHA256 `4d9bd3ed99e9b2b6cd22622018af5667246d8b866041f540afdb973b30d30d0b`。其中 `lib/netstandard1.3/MediaBrowser.Model.dll` 为 426496 bytes、SHA256 `db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153`，与当前仓库 Model 字节完全相同。旧审计的“不匹配”针对已退役的另一 Model，不能套给本版。 |
| Model 的具体源码参考 | 官方 [Emby a304 Model 项目](https://github.com/MediaBrowser/Emby/blob/a304b3cd0a330bb34fd3606a6afb9cd3d80176e4/MediaBrowser.Model/MediaBrowser.Model.csproj)存在，根 [LICENSE.md](https://github.com/MediaBrowser/Emby/blob/a304b3cd0a330bb34fd3606a6afb9cd3d80176e4/LICENSE.md)给出 GPLv2 文本；项目为 v4.5/Profile7。NuGet 成员路径是 netstandard1.3，不能据相同项目名就认定这个项目/提交是该 DLL 的完整对应源码。NuGet nuspec 没有 licenseUrl/expression，包里未发现 license/notice/copying 命名成员；`requireLicenseAcceptance=false`不是免除版权条件。 |
| 当前 API 固定输入和输出 | 从官方固定 [fdd0939 API 源](https://github.com/MediaBrowser/Emby.ApiClient.Javascript/tree/fdd0939ac596406ab92274f30fd83d226a677424)重新取得 apiclient、connectionmanager、events 和 MIT 全文，四份字节与 `src/web-api/licensed` 完全一致。选择清单中的 apiclient、mit-apiclient、transport、events 四个输出也与当前源码 hash 一致。原生 CM 未替换为研究候选；见[维护合同](INDEPENDENT_API_INPUT.md)。 |
| Koffi 原始包与通知 | 从官方 npm 重新取得 [koffi 3.3.3](https://registry.npmjs.org/koffi/-/koffi-3.3.3.tgz)和 [win32-x64 3.3.3](https://registry.npmjs.org/@koromix/koffi-win32-x64/-/koffi-win32-x64-3.3.3.tgz)，两者 SHA256、SHA512 SRI、87+5 个完整成员均匹配锁定清单。两者元数据均声明 MIT；主包有 `LICENSE.txt`、`vendor/node-api-headers/LICENSE`、`vendor/node-addon-api/LICENSE.md`，原生子包没有单独 license 文件。子包 README 明确其为 Koffi 的 win32-x64 二进制。 |
| Host 和图标已有完整通知 | 重新取得官方固定 Host GPLv2 全文、Google 固定 Material Icons 全文，分别与仓库 18014-byte 和 11357-byte 文本完全相同。既有来源内容映射与历史导出配方未知应分开，不再泛称 Material Icons 缺许可证全文。 |

详细 URL、输入路径、大小、SHA256、比对结果和 24 项路径库存见 [机器回执](evidence/signpath-v047-followup.json)。库存包含七个重点代码/模板输入和十七个 Web 位图/GIF，仅作精确指代；其中 equalizer 已有官方字节来源记录，不能把十七个全部算成无授权资源。

## 可以自行继续完成的工作

这些是工程核对，不需要用户重新提供已有公开包，也不需要用户先作产品选择。

| 编号／对象 | 还缺的具体材料 | 下一步与完成标准 | 影响 |
|---|---|---|---|
| P1：最终安装包 | 已实算安装器总 SHA，但尚无本次独立提取的完整成员/hash、内置 build-manifest、三层 provenance、Windows 媒体 provenance 和 notice 实际副本。 | 在具有兼容 Inno 6.7.3 提取工具的受控环境，只读提取安装器；将每个成员与该提交和记录比较。检查 16 个 project notice 路径、Electron 两个 notice、npm/Koffi 原通知，以及退役 DLL 是否确实不在包内。输出提取工具身份和逐文件回执。既有日志 403 不重试或绕过。 | 阻碍宣称“本版实际交付了全部通知”；这属于证据/工具缺口，不是用户缺文件。 |
| P2：Koffi notice 覆盖 | 上游两包和主包三份全文已取得；还缺包内保留与原生模块覆盖关系的明确记录。 | 回读 P1 中主包三份文本；根据两个包相同项目、版本、MIT 声明和子包定位记录覆盖关系。若需要新增归属说明，先形成准确文本，不凭缺少子包独立 LICENSE 就认定它无授权。 | 需要更正旧文档“各包都有 LICENSE”的错误，并核对最终交付。 |
| P3：当前 API 与 Web 源码分界 | 四个新 API 模块有固定 MIT 来源；保留 CM 的具体后期表达仍未确认。 | 用 `src/web-api/selection.json` 和 `tools/patch-connectionmanager-transport.cjs` 标明当前实际四模块及 CM 输出。旧 ApiClient snapshot 仍是来源输入，不能当成当前执行模块重新列全文件授权缺口。 | 收窄索取范围，避免向用户重复索取已经独立维护的 API。 |
| P4：完整通知与源码可取得性 | 许可文本在仓库不等于每个成品已交付；源码 URL 也不等于覆盖了全部对象代码。 | 以 P1 的最终成员清单逐条登记版本、原声明、源位置、维护补丁/生成器与交付方式；验证公开源码链接可取。适用 copyleft 的完整源和构建脚本按实际条款安排，bit-exact 重编、PDB 不作为普遍前置。 | 为实际发行提供可复核交付清单；不会由文档盘点自动完成。 |

## 可能需要用户持有的原材料，或上游提供者补件

目前没有发现必须由用户本人才能提供的材料。下表列的是：如果用户还持有原提供者的导入记录、源码或授权，可显著推进的具体内容。只需原始公开地址或经允许提供的材料；不要提供账号、Token、用户媒体或私人服务器数据。没有这些材料也不认定违规，更不能用风险接受替代上游许可。

| 编号／准确对象 | 已有依据 | 真正还缺什么／什么材料足够推进 | 推荐材料持有人 |
|---|---|---|---|
| U1：`tools/templates/runtime/preload.js` | 207-byte LF 源 SHA256 `2d1f39a8771dfe6f4bfa03c13a98bc6a19e50f5b2e814721d33f56183fabea38`，生成 CRLF 为 214 bytes；原七行桥接公开在当前 tag。官方 Electron 仓库定向搜索 `window.appdata` 本轮未得到结果。 | 最早导入的上游 URL/commit 与适用许可证，或实际作者对该表达的许可说明；如有本地修改，提供对应 diff。没有搜索结果不能证明作者身份，短功能代码是否受保护也不能单凭行数判定。 | 原整包/桥接提供者；用户若保存过来源帖或原源码记录可提供。 |
| U2：保留的 CM/page/PlaybackManager/AppSettings | 本轮库存给出精确基底路径和 SHA；官方旧 GPL webcomponents 和 MIT page/API 的已辨表达继续有效。 | 对尚未覆盖的具体后期增量提供原发行、适用许可文件和修改来源：CM 的 auth/cache/failover/地址生命周期；page 的三参数路由/元数据/返回；PlaybackManager 的 stream/队列/report/offset/rate；AppSettings 的 set/event 与码率策略。ETE 已跟踪 overlay 不重新索要。 | 对应较新 Web 的发布者/修改者；原导入记录持有人。 |
| U3：`modules/webvtt/vtt.js` 和 `vtt.css` | vtt.js SHA256 `97bda9c48cf440809d6453c8e36229f2384ca706dc46fe562d73963fb02c6aee`；428-byte CSS SHA256 `8c5c30ea886110fde45511a37f9435fc2355b7c812e6dceb3cf98fa67f6b8317`。Mozilla 0.13.0 Apache 源和全文已有。 | 只补后续 cue default、native/plain 桥、Bidi/textStyle/forceLTR、布局策略及 CSS 的来源、修改和适用许可；不要要求 Mozilla 重新许可已经明确的原有代码。 | Web 修改提供者。 |
| U4：仍保留的图像 | 精确库存含 `fresh.png`、`rotten.png`、`blueradiance.jpg`、supporter badge、图标/splash 和三处 logo。已退役 `themes/logo.png` 不在库存。 | 各图原图出处、适用再分发/修改条款与必要署名；尤其评分徽标和主题背景。对精确匹配已明确授权的图像可复用现有证据。图像相同或有品牌标识不自动证明授权；不得沿用“19 图全部未知”的旧总数。 | 图像的原发布者/权利人或当初导入者。 |
| U5：官方 Model 与 Common | Model 现已精确匹配 NuGet；Common 3.3.10 已有官方 NuGet/hash和部分 Emby GPL 源映射。 | 该 NuGet 发布对应的源码 commit/branch、完整项目与构建脚本、真实修改，以及适用 GPL/组件条款的发布说明。Model 需解决 Profile7 参考与 netstandard1.3 发布的具体关系；Common 只补实际 Updater `IsAsset`/发布过滤等已定位差异，不能把整个库笼统称为无来源。 | Emby/该 SDK 发布维护者；用户无需重新提供现成 DLL。 |
| U6：固定 libmpv 二进制 | archive/DLL 身份、mpv `dd5d17d328`、FFmpeg `2a20737`、builder `cd1edc11` 和原构建 run 已有。 | 原 run 实际解析的依赖 revision/子模块、补丁、配置和链接集合、必要 notice 与完整对应源码获取安排。108 份 recipe 中出现某库不表示该 DLL 实际链接它。若发布者有该次源码快照/缓存锁，优先取得；单独再给一个 mpv 主源码 ZIP 不够关闭此项。 | 该次上游 Windows binary 构建/发布者。当前只列材料要求，不重开无限源码搜索，也不替换 DLL。 |

## 需要上游或专业审查确认的决定

| 对象 | 应回答的具体问题 | 不应怎样推断 |
|---|---|---|
| GPL 组合 | 固定 libmpv/FFmpeg 配方启用 GPL/version3，与 GPL-2.0-only Helper 的实际链接、派生范围及可用授权是否可兼容；若不兼容有哪些保留功能的可行方案。 | 不能因动态加载就自动判兼容，也不能把所有同包文件都算成一个派生作品。根许可证变更需要真实授权依据。 |
| Apache 与 GPLv2 | 对 VTT、gRPC 等实际使用方式、作品边界和许可版本作具体判断。[ASF 官方说明](https://www.apache.org/licenses/GPL-compatibility.html)说明 Apache-2.0 与 GPLv3 的关系及 GPLv2 不兼容立场。 | 不能仅凭字体与客户端装在一起就认定组合违规，或把所有 Apache 组件统一当成同一种边界。 |
| preload 短表达、图形、品牌 | 对缺少导入记录的表达是否受保护、现有许可覆盖范围、必要品牌条件作具体判断；有权利人说明时按真实声明处理。 | 不以七行或文件无头认定当然有权，也不以搜索无结果认定侵权。 |
| 旧 ADL 事项 | 本轮固定官方 RefreshRate `Program.cs` 只见 user32 导入，没有 ADL，完整官方树路径中亦无 ADL 命名。旧“Host/RefreshRate 需 AMD SDK”事项缺少当前具体路径依据。若该事项实际指 libmpv 内部代码，应先映射至实际依赖/源文件再定需要的条款。 | 不把泛称旧 ADL 风险列成用户必须找到一个 SDK 许可证的当前阻断。源码观察也不冒充 RefreshRate 二进制重建证明。 |
| SignPath 接受性 | 在前述来源/许可范围明确后，由 Foundation 评估信誉、上游二进制包含方式、签名对象与跨 run 复用的 origin policy；团队确认 MFA、角色和逐发行审批。 | 没有固定 star 门槛或必然通过结论；现有构建成功不等于签名接入完成。 |

本次仅取得公开上游输入并更新证据与文档。未联系任何权利人、未上传私有材料、未改运行代码、依赖、安全策略或发布流程，也未合 main 或申请 SignPath。
