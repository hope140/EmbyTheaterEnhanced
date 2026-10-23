# 来源、许可与前端历史研究索引

记录日期：2026-10-23。**当前首要目标是在新功能前收口旧包来源和许可；构建能脱离旧整包、清理成功、源码公开或相同字节都不是许可清零。** 本页是当前范围、证据与后续决定的统一入口。

## 先查这几处

|要查的内容|入口|
|---|---|
|哪些可沿官方条款补交付、哪些仍缺材料、哪些候选需适配|[三类许可决定与下一步](dependency-research/LICENSE_DECISIONS.md)|
|当前与历史分母、退役材料及问题边界|[问题清单](dependency-research/ISSUES.md)|
|本轮许可链、方法级缩减及交付范围|[2026-10-23统一证据](dependency-research/evidence/license-closure-20261023.json)；[a33身份检查回执](dependency-research/evidence/license-checkpoint-20261022.json)|
|网页版本的页面、交互、实现差异参考|[前端历史参考](dependency-research/FRONTEND_REFERENCE.md)|
|历史归档URL/hash、来源比较方法与具名差异|[6fee412历史证据](dependency-research/evidence/web-history-20261022.json) · [160条独立byte清单](dependency-research/evidence/web-476-byte-matches-20261022.csv)|
|旧许可源到局部片段的映射|[具名片段证据](dependency-research/evidence/licensed-callable-mapping-20261022.json)|
|既有材料、声明与固定输入|[源码材料索引](SOURCE_MATERIALS.md) · [许可说明](LICENSING.md) · [仓库输入](REPOSITORY_INPUTS.md)|

## 当前状态快照

当前范围固定 main [`0a1dd6541d1327a19e7aed35d493b5e69b194b51`](https://github.com/hope140/EmbyTheaterEnhanced/commit/0a1dd6541d1327a19e7aed35d493b5e69b194b51)。其产品材料与a33bd03相同，新增仅为公共CI的40分钟时限；本PR不带其它优化代码。不是旧研究的6fee412。[研究文档PR70](https://github.com/hope140/EmbyTheaterEnhanced/pull/70)用于汇总研究，运行代码和广泛Web替换不在其范围；PR、CI后续状态以链接为准。

|工作项|已完成与下一步|
|---|---|
|PR69清理|[已合并](https://github.com/hope140/EmbyTheaterEnhanced/pull/69)。活动输入为Web713、兼容shader39、小组件2；20旧路径退出当前tree，历史manifest/hash和必要声明保留。见[快照迁移](SNAPSHOT_V2_MIGRATION.md)|
|3Web＋20npm精简|三Web残留已退出活动v2；npm来源33包/1142文件保持完整，runtime精确投影1122，所有保留字节身份不变。见[投影与验证边界](SCOPED_RUNTIME_PROJECTION.md)|
|用户Web增量|[PR67已合并](https://github.com/hope140/EmbyTheaterEnhanced/pull/67)，ApiClient与toast.css为直接维护的上游派生源；不称全文件ETE原创|
|历史来源研究|广泛版本取样结束，不继续盲扫Server或桌面版本。主体接近2022年8月4.7.6谱系，ApiClient更近4.7.14；不是整树准确revision或抓取日期证明|
|来源许可收口|沿官方明确许可优先。通知原文已补；helper机械映射及226轨迹支持保留已辨派生实现，七AppSettings访问器已有完整GPL骨架；实际剩余见决定表|
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

## 本轮已补齐的文档事实

- 明确区分已退役材料和仍保留的语言、插件兼容、机器人元数据、CEC与电源包；不把旧用途pending当新待办。
- 39shader按原头分37MIT与2Unlicense；现有npm35条许可命名记录外另有保留的LICENSE-MIT.txt，补充实际36条口径，未发现该文件被排除。
- 维护中文资源保留13项选定修订与24项继承值的区别；维护配置不改变旧字段/默认值，不重新认领旧XML。
- API/page的完整MIT、Sizzle原文、VTT版权/固定来源/实际差异已补入THIRD_PARTY_NOTICES；没有虚构Mozilla NOTICE。
- Socket按组件MIT与集成表达分层，Sharp不再把旧59文件差异套到当前DLL；Common实际差异收窄到Updater。
- 各家族明确实际缺口、一条可查一手线索与停止条件。没有有效新grant时不无限搜索，也不把整文件不同等同欠授权或必须重写。

## 历史参考怎样使用

[前端参考](dependency-research/FRONTEND_REFERENCE.md)和历史JSON保留4.6.7至4.7.14等有界取样、官方URL及hash。更早不意味着更接近；桌面3.0.x号、fallback和兼容阈值不能替代网页版本/日期。AST对应、BOM/换行对应、局部语义对应均与byte对应分开。

[606条历史用途CSV](dependency-research/evidence/known-web-usage-20261022.csv)与片段JSON保持原analysisRef，便于复查；不是当前713集合或许可完成清单。PR69现有[浏览器证据](evidence/web-residue-browser.json)和[npm运行投影证据](evidence/npm-runtime-projection.json)说明真实组件/模块覆盖，仍不等于Windows整机、真实服务、播放或安装验收。

本次先补API/page/Sizzle通知与VTT版权/差异说明，沿现有11入口交付；接着落实匹配源码和最终payload核验。helper无需仅为寻找旧minifier而替换；Web具体增量、Sharp/ServiceStack组合和DPInst/ADL材料各按有限边界处理。大范围更换Web、项目改许可或联系权利人均不是本研究文档的自动后续动作。
