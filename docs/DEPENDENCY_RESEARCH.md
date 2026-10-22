# 来源、许可与前端历史研究索引

记录日期：2026-10-22。**当前首要目标是在启动新功能前闭合旧包遗留的来源与许可问题。** 本页集中提供当前状态、可复查证据、问题清单和后续候选；不把出处确认写成许可可用，也不自动替换现有内容。

## 从这里查

| 要查的内容 | 入口 |
|---|---|
| 来源、适用许可、使用/分发范围和未闭合决定 | [问题清单](dependency-research/ISSUES.md) |
| 旧网页有哪些页面、交互和实现变化 | [前端版本参考](dependency-research/FRONTEND_REFERENCE.md) |
| 官方归档URL、大小、SHA256、比较方法和函数结果 | [历史来源证据JSON](dependency-research/evidence/web-history-20261022.json) |
| 160份官方4.7.6逐字节对应文件 | [路径、成员、大小、SHA256清单](dependency-research/evidence/web-476-byte-matches-20261022.csv) |
| 当前固定输入与已有材料边界 | [源码材料索引](SOURCE_MATERIALS.md) · [仓库输入](REPOSITORY_INPUTS.md) · [许可说明](LICENSING.md) |

## 当前状态快照

以下状态记录于2026-10-22 08:00 UTC；PR、CI和发行的后续状态以链接为准。研究文档本身尚待PR审阅，不能视作已合并。

| 工作项 | 当前状态与下一步 |
|---|---|
| 历史Web来源取样 | 本轮完成并停止扩版本；已验证内容见下表和证据清单 |
| 来源与许可闭合 | 首要进行项；按[五类问题](dependency-research/ISSUES.md)逐项取最小证据，仍在用的未闭合内容保留明确决定 |
| 用户Web增量提取 | [PR #67](https://github.com/hope140/EmbyTheaterEnhanced/pull/67)未合并；[该提交CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39743507521)当时进行中。它不表示旧Web全部成为项目原创 |
| v0.3.16 | source `6fee412ad68934d0194303916cfe346e6254a228`的[Windows打包作业](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39737710070/job/119687231702)成功，待发布；不是许可清零结论。[发行核验入口](V0316_RELEASE_VERIFICATION.md)由发行任务另行更新 |
| 14项旧资源 | 来源普查已停止；8项变体与6项旧包转为[实际用途及分发清理](dependency-research/ISSUES.md#旧资源实际用途清理)，不列作活跃来源追溯。该清理尚无仓库PR链接 |
| 前端新功能 | 当前仅保存历史参考；来源、许可及仍用内容的决定闭合前，不由此自动启动移植或功能扩张 |

本页不恢复已移除的libmpv对应源码覆盖专项；现有固定归档/身份合同见[libmpv输入](LIBMPV_INPUT.md)。若另有具体阻塞，应单独说明证据与待决定项，不悄悄恢复旧待办。

## 两个统计口径

| 范围／日期 | 已有结论 | 本页证据边界 |
|---|---|---|
| 720份冻结Web／2026-10-22 | 597份官方byte对应、6份仅严格AST对应、1份空serviceworker、116份非空未解释 | 引用既有文件级联合审计《ROUND5-FINAL-UNION》；完整597/116台账未随本PR复制，不冒称本轮全量复算 |
| 897物理文件历史分类／同日 | 758固定上游、139其他；包含已被替换的Model身份 | 保留历史口径，不作为当前Model结论 |
| 同一897口径的当前Model修正／同日 | 759固定上游、138其他 | 仅按当前Model锁及实际文件核对后修正一项，未重跑897全量分类 |

Model当前为426,496 bytes、SHA256 `db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153`，对应[官方组件合同](MODEL_COMPATIBILITY_INPUT.md)及清单。官方binary身份不等于对应源码重建或全部通知闭合。两个分母不可直接相减；160份及先前147份发现已包含在既有联合审计内，不再次相加。未知数量也不等于某位社区作者的修改量。

## 本轮可以独立复查的历史结果

研究基准为 `6fee412ad68934d0194303916cfe346e6254a228` 的720份冻结Web，排除两份user-patch载体及生成overlay。只对官方归档静态解包、校验和解析，没有执行下载产品、DLL或界面验收。

| 官方样本 | published UTC日期 | 同路径原始byte命中 | 仅BOM/CRLF不同 | 两者联合 |
|---|---|---:|---:|---:|
| [4.6.7.0](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.6.7.0) | 2021-11-21 | 29 | 10 | 39 |
| [4.7.0.60](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.0.60) | 2022-05-17 | 177 | 13 | 190 |
| [4.7.2.0](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.2.0) | 2022-06-03 | 181 | 56 | 237 |
| [4.7.4.0](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.4.0) | 2022-06-20 | 220 | 69 | 289 |
| [4.7.5.0](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.5.0) | 2022-06-26 | 220 | 72 | 292 |
| [4.7.6.0](https://github.com/MediaBrowser/Emby.Releases/releases/tag/4.7.6.0) | 2022-08-01 | 409 | 178 | 587 |

4.7各行原始byte命中含1份空文件；格式对应不是byte对应。Windows同路径精确对应的既有归因来自上述联合审计，本页仅复核netcore的格式差异数量。新增取样4.7.2、4.7.5对既有4.7.6联合均新增0份，未再增加总账。

更早样本没有更接近整棵快照。当前Web主体最接近2022年8月附近4.7.6谱系，但不能固定抓取日期或整树revision：app.js在4.7.4至4.7.6均27/31具名函数相同；PlaybackManager在4.7.5为54/74、4.7.6为65/74；AppSettings多数方法贯穿4.7区间；ApiClient却更接近4.7.14的280/284方法对应。具名声明含嵌套重叠，不能当代码覆盖率。

通用Web apphost在多个4.7样本与当前整文件严格AST相同；virtual-scroller在所取窗口仅4.7.6整文件AST相同。它们均非byte相同。AST保留标识符、字面值和控制流，只忽略位置、注释及literal原始写法。

官方桌面3.0.2、3.0.10、3.0.15、3.0.16、3.0.19等源码没有www，启动代码加载未固定网页版本的tv.emby.media。因此桌面版本号、appVersion fallback及兼容阈值都不能代替网页版本或日期证明。

## 维护方式

更新某项状态时写明日期、范围、实际证据与相关PR；没有复算的统计保留引用性质。下一步按问题清单和具体未闭合文件取证，或提出可比较的替换/重写候选；不因相似、官方托管或仓库开源印象赋予整棵Web某个许可证。
