# 来源、许可与前端历史研究索引

记录日期：2026-10-22。**当前首要目标是在新功能前收口旧包来源和许可；构建能脱离旧整包、清理成功、源码公开或相同字节都不是许可清零。** 本页是当前范围、证据与后续决定的统一入口。

## 先查这几处

|要查的内容|入口|
|---|---|
|哪些仅需维护说明、哪些缺适用证据、哪些候选仍需适配|[三类许可决定与下一步](dependency-research/LICENSE_DECISIONS.md)|
|当前与历史分母、退役材料及问题边界|[问题清单](dependency-research/ISSUES.md)|
|main a33的路径/hash、许可命名成员、shader和helper证据|[当前检查回执](dependency-research/evidence/license-checkpoint-20261022.json)|
|网页版本的页面、交互、实现差异参考|[前端历史参考](dependency-research/FRONTEND_REFERENCE.md)|
|历史归档URL/hash、来源比较方法与具名差异|[6fee412历史证据](dependency-research/evidence/web-history-20261022.json) · [160条独立byte清单](dependency-research/evidence/web-476-byte-matches-20261022.csv)|
|旧许可源到局部片段的映射|[具名片段证据](dependency-research/evidence/licensed-callable-mapping-20261022.json)|
|既有材料、声明与固定输入|[源码材料索引](SOURCE_MATERIALS.md) · [许可说明](LICENSING.md) · [仓库输入](REPOSITORY_INPUTS.md)|

## 当前状态快照

当前范围固定 main [`a33bd03685eb62b66c3c994cc3c4dfcfc89f5c49`](https://github.com/hope140/EmbyTheaterEnhanced/commit/a33bd03685eb62b66c3c994cc3c4dfcfc89f5c49)，不是旧研究的6fee412。[研究文档PR70](https://github.com/hope140/EmbyTheaterEnhanced/pull/70)用于汇总研究，运行代码和广泛Web替换不在其范围；PR、CI后续状态以链接为准。

|工作项|已完成与下一步|
|---|---|
|PR69清理|[已合并](https://github.com/hope140/EmbyTheaterEnhanced/pull/69)。活动输入为Web713、兼容shader39、小组件2；20旧路径退出当前tree，历史manifest/hash和必要声明保留。见[快照迁移](SNAPSHOT_V2_MIGRATION.md)|
|3Web＋20npm精简|三Web残留已退出活动v2；npm来源33包/1142文件保持完整，runtime精确投影1122，所有保留字节身份不变。见[投影与验证边界](SCOPED_RUNTIME_PROJECTION.md)|
|用户Web增量|[PR67已合并](https://github.com/hope140/EmbyTheaterEnhanced/pull/67)，ApiClient与toast.css为直接维护的上游派生源；不称全文件ETE原创|
|历史来源研究|广泛版本取样结束，不继续盲扫Server或桌面版本。主体接近2022年8月4.7.6谱系，ApiClient更近4.7.14；不是整树准确revision或抓取日期证明|
|来源许可收口|A/B/C类见决定表。helper固定GPL源＋AMD桥接有11输入局部行为证据，仍只是建议；较新Web实际授权范围是主要方向决定|
|旧资源普查|旧14项来源普查维持停止；已退出素材不再列活动待办。39shader原头为37MIT＋2Unlicense，保留来源和通知，不继续找旧revision来替代明确许可判断|
|发行|[v0.3.16](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.16)仍对应6fee412的既有附件；main清理没有追溯重做它，也没有由本研究发布新包。见[发行核验](V0316_RELEASE_VERIFICATION.md)|

没有重开已关闭Model组件选择，也不恢复已取消的libmpv对应源码专项。当前没有可靠的全量许可未闭合文件数。

## 三个分母不要混用

|范围|含义|
|---|---|
|历史720 Web v1／6fee412|既有597官方byte＋6 JS AST＋1 CSS AST＋1空文件＋1规范化来源＋114内容差异。597全量归因引用原联合审计，本PR独立提供其中160条；不是720份都已有授权结论|
|当前713 Web v2／a33bd03|7旧路径退役，app/index有明确迁移变换；本轮逐路径/hash校准，不据此重新计算历史来源或许可总账|
|897历史物理来源账|原758/139及当时Model修正759/138只作日期引用；未因本次删除机械改成新总量，也不是许可缺口数|

所有数字的证据范围见[统计边界](dependency-research/ISSUES.md#先分清内容统计与许可审计)。未知差异不是某位社区作者修改量；公开下载或开源仓库印象不授予整棵Web统一许可。

## 本轮可直接收尾的文档事实

- 明确区分已退役材料和仍保留的语言、插件兼容、机器人元数据、CEC与电源包；不把旧用途pending当新待办。
- 39shader按原头分37MIT与2Unlicense；现有npm35条许可命名记录外另有保留的LICENSE-MIT.txt，补充实际36条口径，未发现该文件被排除。
- 维护中文资源保留13项选定修订与24项继承值的区别；维护配置不改变旧字段/默认值，不重新认领旧XML。
- 各家族明确实际缺口、一条可查一手线索与停止条件。没有有效新grant时不无限搜索，也不把整文件不同等同欠授权或必须重写。

## 历史参考怎样使用

[前端参考](dependency-research/FRONTEND_REFERENCE.md)和历史JSON保留4.6.7至4.7.14等有界取样、官方URL及hash。更早不意味着更接近；桌面3.0.x号、fallback和兼容阈值不能替代网页版本/日期。AST对应、BOM/换行对应、局部语义对应均与byte对应分开。

[606条历史用途CSV](dependency-research/evidence/known-web-usage-20261022.csv)与片段JSON保持原analysisRef，便于复查；不是当前713集合或许可完成清单。PR69现有[浏览器证据](evidence/web-residue-browser.json)和[npm运行投影证据](evidence/npm-runtime-projection.json)说明真实组件/模块覆盖，仍不等于Windows整机、真实服务、播放或安装验收。

下一步先维护明确许可的来源/通知说明，再评审helper小候选；page/API/settings按消费合同评估；较新Web整体授权、PlaybackManager及Apache代码组合先作方向决定。大范围更换Web、项目改许可或联系权利人均不是本研究文档的自动后续动作。
