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

以下状态更新于2026-10-22；PR、CI和发行的后续状态以链接为准。[本轮研究文档PR #70](https://github.com/hope140/EmbyTheaterEnhanced/pull/70)已提交，尚未合并；后续结果继续追加同一PR。

| 工作项 | 当前状态与下一步 |
|---|---|
| 历史Web来源取样 | 广泛历史取样结束；剩余内容按精确清单定点核对，4.7.8/4.7.11窗口已收束，结果见下节 |
| 来源与许可闭合 | 首要进行项；按[五类问题](dependency-research/ISSUES.md)逐项取最小证据，仍在用的未闭合内容保留明确决定 |
| 用户Web增量提取 | [PR #67](https://github.com/hope140/EmbyTheaterEnhanced/pull/67)已合并；[当前检查](https://github.com/hope140/EmbyTheaterEnhanced/pull/67/checks)与可合并状态以PR为准。它不表示旧Web全部成为项目原创 |
| v0.3.16 | source `6fee412ad68934d0194303916cfe346e6254a228`的[Windows打包作业](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/39737710070/job/119687231702)成功；[v0.3.16](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.16)已于2026-10-22 08:35 UTC公开发布，不是许可清零结论。[发行核验入口](V0316_RELEASE_VERIFICATION.md)由发行任务另行更新 |
| 14项旧资源 | 来源普查已停止；8项变体与6项旧包转为[实际用途及分发清理](dependency-research/ISSUES.md#旧资源实际用途清理)，不列作活跃来源追溯。[PR #69](https://github.com/hope140/EmbyTheaterEnhanced/pull/69)退役集成进行中，尚未合并，不计作已删除 |
| 前端新功能 | 当前仅保存历史参考；来源、许可及仍用内容的决定闭合前，不由此自动启动移植或功能扩张 |

本页不恢复已移除的libmpv对应源码覆盖专项；现有固定归档/身份合同见[libmpv输入](LIBMPV_INPUT.md)。若另有具体阻塞，应单独说明证据与待决定项，不悄悄恢复旧待办。

## 两个统计口径

| 范围／日期 | 已有结论 | 本页证据边界 |
|---|---|---|
| 720份冻结Web／2026-10-22 | 597份官方byte对应、6份仅严格AST对应、1份空serviceworker、116份非空未解释 | 引用既有文件级联合审计《ROUND5-FINAL-UNION》；597完整来源台账未随本PR复制；116精确路径/hash清单已取得并核对，不冒称重跑597归因 |
| 897物理文件历史分类／同日 | 758固定上游、139其他；包含已被替换的Model身份 | 保留历史口径，不作为当前Model结论 |
| 同一897口径的当前Model修正／同日 | 759固定上游、138其他 | 仅按当前Model锁及实际文件核对后修正一项，未重跑897全量分类 |

Model当前为426,496 bytes、SHA256 `db22f8ea6cb6afdfab184f80d8b85a10d8a9f148ff4cae167db87ce9cd245153`，对应[官方组件合同](MODEL_COMPATIBILITY_INPUT.md)及清单。官方binary身份不等于对应源码重建或全部通知闭合。两个分母不可直接相减；160份及先前147份发现已包含在既有联合审计内，不再次相加。未知数量也不等于某位社区作者的修改量。

**来源数量不是许可数量。** 114表示内容来源/差异待解释，597 byte及6 JS AST、1 CSS AST不表示许可已经闭合；当前尚未完成720逐文件的许可适用、修改及分发映射，许可未闭合总数**未统计**，也不据此断言所有文件没有授权。组件级规模、行为风险和保留/替代选择见[决策表](dependency-research/ISSUES.md#组件级决定规模与行为边界)，统计边界见[许可审计说明](dependency-research/ISSUES.md#先分清内容统计与许可审计)。

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

## 剩余内容的定点结果

在原116项中排除转用途清理的CustomCssJS，只比较其余115项；未重扫已确认597来源。官方4.7.8（2022-10-01）和4.7.11（2022-12-15）新增byte、BOM/CRLF及整文件JS AST对应均为0。

新增1份**CSS结构对应**：`modules/virtual-scroller/virtual-scroller.css`与4.7.6/4.7.8的Emby.Web.dll资源经完整CSS语法树比较相同；保留选择器关系、声明顺序、important和值，未把任意空格删除当等价。它不是byte对应，也不闭合适用许可。

| 当前派生口径 | 分类 |
|---|---|
| 720冻结Web | 597官方byte + 6 JS AST + 1 CSS AST + 1空文件 + 1固定revision规范化CustomCssJS来源 + 114非空待解释 |
| 122 Web-pending | 6 JS AST + 1 CSS AST + 1空文件 + 114其他非空 |
| 123未计入官方byte对应 | 122 Web-pending + 1已定位规范化来源CustomCssJS |
| 114剩余非空 | 112有Server比较底稿 + 1项旧官方helper语义底稿 + 1项logo缺底稿；差异均未闭合 |

897的759/138保留为前述既有审计/当前Model修正的日期口径，本轮不默算整本台账，也不把未合并清理算作删除。两个用户carrier在720之外。精确剩余路径/hash、分组与具名函数差异见[证据JSON](dependency-research/evidence/web-history-20261022.json)的remainingAfterFollowup和namedFunctionDifferences；原116清单SHA256为`004481f14afde067c6a5ea398da23e855bb57b8d497f28b38de747746121bc09`。

75份JS与所取官方底稿有完整AST差异，22份CSS在4.7样本有结构差异；13份HTML尚无DOM/可见等价证据，2份JSON存在键或值差异。后续轻量核对找到2017/2018官方playmethodhelper.js的分支语义底稿，非byte或严格AST同；仅themes/logo.png在本次所取来源中仍缺底稿。结构差异不自动等于功能差异或作者归属。

已进一步证明差异边界：app.js遮去4个已列函数体后，其余整树与4.7.6相同；ApiClient遮去上传两处、Latest、搜索4个方法体后，其余整树与4.7.14相同；AppSettings遮去3个码率方法体并排除当前独有autoplay后，其余整树与4.7.6相同。这些不是整文件AST对应，也不证明修改作者。

许可主线另取得官方4.7.6 Debian包随带的2018-04-11许可文档原件与hash；其范围和限制及尚未建立的Web适用关系见[许可问题](dependency-research/ISSUES.md)。另有指定来源线索已按固定路径复核：CustomCssJS与Shurelol/Emby.CustomCssJS固定commit仅CRLF/LF不同，LICENSE为GPLv3文本，见[问题清单](dependency-research/ISSUES.md#customcssjs固定来源)。这不是官方byte对应或整体许可闭合；PR #69未合并前不减少使用/分发条目数。

本窗口停止继续扩版本。[许可族与最小候选边界](dependency-research/ISSUES.md#代表组件的许可链有限核验)已记录page.js的MIT原件、WebVTT的Apache-2.0原件、早期官方GPL范围缺口及2022 Web自有修订授权缺口；本轮新增当前整文件许可闭合为0。下一步针对仍用文件的适用许可/补丁证据或logo缺底稿作最小核对，不擅自替换。

用途筛查另已覆盖114内容差异范围：新查105项中104项仍有静态消费者、1项未判定候选（`settings/cameraupload.js`，4,814 bytes）；结合先前9项为112项有消费者、旧logo及camera设置JS两项可能残留、0项确证全模式未用。消费者包括条件模式，不等于桌面实际已加载；无整目录退役结论，未删除或把新候选并入PR #69。见[用途分类与清单](dependency-research/ISSUES.md#当前114差异清单的用途筛查)。来源不明不等于无用，许可未闭合数量仍未统计。

本轮定点核对已补[旧许可源到局部代码的映射](dependency-research/ISSUES.md#旧许可源到当前局部代码的定点映射)，区分严格片段AST、编译规范化及未覆盖增量；helper有同提交GPL源，ApiClient有固定MIT源，不能用tip缺LICENSE或byte不同推导无许可。另完成[606份已定位Web用途分类](dependency-research/ISSUES.md#已定位web用途扩展606项有限批次)：594有消费者或条件资源、1托管元数据、11未判定。桌面分层清单仍pending，许可问题数量仍未统计；没有新的移动端专用删除项交给PR #69。

## 维护方式

更新某项状态时写明日期、范围、实际证据与相关PR；没有复算的统计保留引用性质。下一步按问题清单和具体未闭合文件取证，或提出可比较的替换/重写候选；不因相似、官方托管或仓库开源印象赋予整棵Web某个许可证。
