# v0.3.10 后的用户文档与发行说明复核

## 基线与范围

复核基线为文档提交 `adec0303be1eca3c46f22223066b863da9e771cb`。当前测试版 [v0.3.10](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.10) 的产品来源仍为 `73a5379983e2be2a2bc0bdc8aec8f0fcb5f07d63`；正式版与 Latest 为 v0.3.1。复核时公开对象为 22 个 Release、79 个附件及 47 行 Tag 引用。

本轮只整理用户文档、导航及 Release 展示文字。安装器、源码行为、依赖、原始发行说明、附件、Tag 和发布渠道保持各自身份。文案整理不增加安装、前台、真实播放、远控或设备验收结论。

## 首轮发现与最小修正

| ID | 观察到的情况 | 期望与最小修正 | 依据与允许范围 |
| --- | --- | --- | --- |
| DOC-01 | README 的正式版下载与测试版入口分处不同章节；用户指南只有一段安装概述，缺少校验命令和卸载步骤 | 集中展示两条渠道；补充下载、哈希比较、同目录升级、失败处理及保留资料的卸载步骤 | README、USER_GUIDE；安装行为按现有 `installer/EmbyTheaterEnhanced.iss`，不追加系统操作 |
| DOC-02 | ROADMAP 与 NEXT_RELEASE_SCOPE 的当前章节仍指向 v0.3.9 或尚未发布的夜间维护 | 顶部补齐 v0.3.10 当前交付状态，旧日期段落作为历史保留 | 两页顶部当前说明；已延期主题和条件候选保持 |
| DOC-03 | 用户与开发者资料缺少按用途组织的统一入口 | 增加文档索引，分列用户说明、开发验证和历史来源 | `docs/README.md` 及相关导航 |
| REL-01 | v0.3.9 的安装结果入口指向验收合同；v0.3.1 的通用旧版提示让当前正式版用户再寻找较新正式版 | 链接准确核验结果，明确当前渠道；为主要下载入口补安装指南 | 仅经逐项核对的 Release `body`，标题已版本优先则保留 |
| REL-02 | 发布格式主要依靠既有样例，缺少可复用规则及展示文案后续维护的来源说明 | 增加规范与模板，要求真实附件链接、明确渠道、简洁摘要、已知问题与许可入口；记录展示文字与原始附件的区别 | 新增发行规范和模板；原有 `docs/RELEASE_NOTES.md` 不作模板覆盖 |
| DOC-04 | 诊断说明建议将 TXT“原样”交给分析工具，与检查脱敏的要求冲突；仓库采集工具也容易被当成安装用户的必经步骤 | 先给客户端导出与人工检查步骤，明确仓库工具受众；分享必要的已检查片段 | CLIENT_DIAGNOSTICS、USER_GUIDE，不运行采集工具 |
| DOC-05 | 已知问题仍称插件适配为本地候选，安装段只列 v0.3.9 结果 | 说明 v0.3.2 起已包含适配，同时保留真实插件前台缺口；区分旧安装证据和 v0.3.10 未追加系统安装 | KNOWN_ISSUES，引用对应发行核验，不追加通过结论 |

## 验证与回退方法

修改前保存完整 Release 对象及正文。每个拟修改对象单独列出原文、目标正文与理由；远端写入前核对对象没有漂移，只更新已审核的标题或正文。写入后按对象 ID 回读，比较渠道、时间、Tag、目标提交及全部附件身份；Latest 和 Tag 引用另行比较。展示正文修改不替换原始 `RELEASE_NOTES.md` 附件，也不宣称两者仍为相同字节。

本地检查改动范围、UTF-8、相对链接、下载链接与真实附件名称、渠道一致性及 GitHub Markdown 渲染结构。文档提交可通过反向补丁回退；Release 展示正文可按保存的原文恢复。正常仓库 CI 的结果与文档检查分别记录，不重复运行材料、构建或系统验收。

## 覆盖与实施前检查

已核对 README、USER_GUIDE、KNOWN_ISSUES、CLIENT_DIAGNOSTICS、CONTRIBUTING、PUBLIC_CI、PACKAGING、LICENSING、SOURCE_MATERIALS、ROADMAP、NEXT_RELEASE_SCOPE 和 CHANGELOG 共 12 份现有文档。基线 63 个相对链接目标均存在。全部 22 个 Release 的 API 标题均已版本优先，正文下载链接均对应各自实际附件；v0.2.0 至 v0.2.2 缺独立 SHA 附件的历史事实保留。没有重写准确的标题或其余历史正文。

本地整理覆盖 13 份文档，包含新增索引、规范、模板及本报告。检查了 130 个相对链接目标、3 个锚点、6 个下载链接与 2 个仓库文档 URL；UTF-8、有限隐私检查、改动范围和两份排期文档的历史正文后缀保持通过。README、用户指南、索引、已知问题、规范及模板已调用实际 GitHub GFM 渲染器检查标题、表格和代码块结构；这不是客户端前台验收。

PACKAGING 已有明确历史分区，旧 v0.3.9 段落按当时状态保留。许可、CHANGELOG、原始发行 notes 和产品文件不改。v0.3.10 的实现细节仍可在变更记录与核验文档追溯，不为统一文风删除已核事实。

实施前确定仅调整三个 Release 的展示正文：v0.3.1 明确其为当前正式版并补用户指南；v0.3.9 将结果入口改至发行与安装核验并补指南；v0.3.10 补指南，标题保持。执行顺序为先合并指南，再按已审核的逐对象原文/目标文字维护远端。此处保留实施前的检查范围，实际结果见下节。

## 已实施的公开调整

[PR #46](https://github.com/hope140/EmbyTheaterEnhanced/pull/46) 经实际文档和正文前后对照审核后正常合并，文档 main 为 `39f7cf22058a578423bb2c8ef2f913545f4452dd`，准确准备提交为 `8f991cd8cd115afdaaf82aa75e0faa859e71dca9`。分支 [CI 39104205558](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39104205558) 与 PR [CI 39104217501](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39104217501) 各 1119/1119，fail、cancelled、skipped、todo 均为 0。合并树与已审核文档树一致。

合并后 main [CI 39104724762](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39104724762) 的原日志核对为 1119/1119，fail、cancelled、skipped、todo 均为 0。此后的报告同步提交独立于产品来源，其最终 HEAD 与对应 CI 按准确提交另行回读。

确认公开指南的 Git blob 与合并提交一致后，仅更新以下展示正文：

| Release | 对象 ID | 实际调整 |
| --- | --- | --- |
| [v0.3.1](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.1) | 410723326 | 明确当前 Stable / Latest、手动安装及测试版入口，补用户指南 |
| [v0.3.9](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.9) | 415855401 | 核验结果直接链接 V039_RELEASE_VERIFICATION，补用户指南 |
| [v0.3.10](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.10) | 416257802 | 补安装校验、升级、卸载与反馈指南 |

三次请求均只包含 `body` 字段，写入前保存新鲜完整对象，写入后逐对象及全量回读通过。22 个标题、其余 19 份正文、原创建/发布时间、Tag、目标来源、发布标志及 79 个附件身份保持；47 行 Tag 引用及 Latest v0.3.1 保持。附件身份回读包括 ID、名称、大小、内容摘要与时间等字段，本轮未重复下载二进制；发行时的全字节证据仍见对应版本核验。

三版网页展示正文现已不同于本轮保存的原文；v0.3.9、v0.3.10 的原始 `RELEASE_NOTES.md` 附件和产品来源保持发行时身份。历史核验中的初始正文一致性结论仍描述发布当时，不用于声称当前网页正文与原始附件同字节。没有重传附件、重打 Tag 或更改产品版本。
