# 来源、许可与现存范围问题清单

> v0.4.0整合说明：以下研究保留PR70在2026-10-22／23、main `0a1dd654`／`a33bd03`时的证据范围，文中“当前”及候选／未替换状态均指该快照。后续CEC、旧Host自更新、Sharp／ServiceStack及私有配置运行副本已退役；维护API与源码Host／JSON／ZIP已按独立合同整合，Windows测试构建run39974691780通过。历史JSON／CSV的analysisRef与原始观察保持，不冒充新发行回执；v0.4.0正式构建／发布仍待完成。当前工程与验收边界以[发行核验](../V040_RELEASE_VERIFICATION.md)、[Host输入](../WINDOWS_HOST_INPUT.md)及[API维护](../INDEPENDENT_API_INPUT.md)为准。来源、必要原声明与未核实许可边界继续保留，退役不证明整体许可通过。

[研究索引](../DEPENDENCY_RESEARCH.md) · [三类许可决定](LICENSE_DECISIONS.md) · [当前身份回执](evidence/license-checkpoint-20261022.json)

本页校准日期2026-10-23，主线为`0a1dd6541d1327a19e7aed35d493b5e69b194b51`；其产品材料与a33bd03相同。PR69已合并；旧研究里的“尚未删除／未合并／桌面用途pending”只描述当时阶段，不再作为现存范围。本文汇总证据和待决定项，不替换运行代码、不宣称整体许可完成。

## 先分清内容统计与许可审计

**114是历史内容差异数，不是许可缺口总数。597 byte、6 JS AST、1 CSS AST也不是许可已闭合文件数。** 当前没有完成全部现存文件与准确许可版本、适用范围、修改和交付的全量权利映射，许可未闭合总数仍未统计。相似或官方下载不自动授予许可；不同字节也不自动证明没有授权或必须重写。

|范围／日期|可引用的结论|不能怎样使用|
|---|---|---|
|6fee412冻结Web v1，720文件|597官方byte、6 JS AST、1 CSS AST、1空文件、1规范化CustomCssJS、114非空差异；初始597来源总账引用既有联合审计，本PR只独立交付其中160条|不是当前main文件集合；不能相减得许可安全数，不能把未知差异归给特定作者|
|897历史物理来源账／2026-10-22|旧758/139；按当时Model官方身份修正为759/138，仅修正一项，未全量重算|不是现存文件数、许可缺口数，也不据清理条目机械扣减|
|a33bd03活动Web v2|713文件，21,962,068 bytes；7旧路径已移出当前tree；app/index各有明确迁移变换|本轮不更新v1归因总账，也没有以713重做全量许可统计|
|a33bd03 npm选定包|33完整来源包1142文件→精确runtime投影1122；仅20路径退出产物，完整恢复来源、声明保留|不能把20产物排除叫20份源码已删或20项许可问题已解决|

历史清单和比较方法保留于[来源JSON](evidence/web-history-20261022.json)、[160条独立byte清单](evidence/web-476-byte-matches-20261022.csv)及[旧报告固定提交](https://github.com/hope140/EmbyTheaterEnhanced/blob/1f22df8a6f81d0a3245b3ca314922a97f66eadf5/docs/dependency-research/ISSUES.md)。它们的analysisRef不改写成当前main；当前投影另见本轮回执。

## 当前已经退出的材料

|范围|main已完成的动作|历史记录与当前边界|
|---|---|---|
|CustomCssJS、旧themes/logo.png|模块、图片及消费者引用退出当前Web源/产物；插件专属生成器也已移除|固定来源/许可和旧图观察保留在历史证据；CustomCssJS GPLv3全文与出处仍在现有通知，不继续追作者或列活动授权待办|
|settings/cameraupload.js/.html|本地原生相机设置对退出；设备管理员页保留|`devices/cameraupload.js`不能一起删；共享触屏/响应式代码和语言支持不由此退役|
|directorybrowser.css、appstorage-cache.js、serviceworker-app.js|三项已退出活动v2，不再只是研究候选|保留目录共用样式、localstorage/memory adapters、空serviceworker.js和playqueueconfirmation；[运行选择与证据](../SCOPED_RUNTIME_PROJECTION.md)|
|旧手工脚本、备用主题、字体、preset、配置等|兼容48→39 shader；小组件4→2维护输出；20旧路径总体退出当前tree，其中18退役、2维护替换|旧v1 manifests/hash和Git历史保留；不把历史字体RFN/旧主题作者等恢复为当前素材待办，也不声称历史发布被追溯清理|

具体20路径、继承中文值、配置字段和迁移负例由[PR69迁移记录](../SNAPSHOT_V2_MIGRATION.md)及[机器回执](../evidence/legacy-snapshot-v2.json)负责。本报告没有重新执行安装器、修改旧tag或改变v0.3.16附件。

## 来源、许可与维护修改分别记录

- **已有来源**：官方4.7.6/4.7.14等提供字节、AST或局部函数底稿；对应文件未必全部具有已建立的实际许可适用链。
- **已有固定许可源**：MIT ApiClient/page.js、旧GPL webcomponents/helper、Apache VTT等，原件及许可可复查。较新修订／未知增量须具体分析，不按整文件不同全盘否定。
- **已有维护层**：PR67直接维护ApiClient与toast.css，自有修改和上游派生边界单列；不把整个文件归为ETE原创。PR69的app/index迁移与当前小组件维护另有明确合同。
- **已有条款但待履行决定**：ServiceStack同版FOSS例外等，不应再笼统写成缺license；要核实际Host/Additions与源码/通知交付范围。
- **已退役**：原件和声明可为历史分发保留，不继续作为新runtime的来源普查对象。

## 代表组件的许可链（有限核验）

本轮把现存材料分为[LICENSE_DECISIONS.md](LICENSE_DECISIONS.md)中的三类：A类直接维护准确声明/来源说明，B类具体授权适用或履行缺口，C类已核固定来源/局部行为但仍需接口适配的候选。对应完整文本、官方URL与hash仍沿既有证据保存；没有把整个Web套成同一许可证。

可直接校准的事实包括：39个shader为37MIT＋2Unlicense，而非全部MIT；npm现有35条notice回执之外还有保留的LICENSE-MIT.txt，完整命名成员为36而不是发现丢失notice；维护中文37-key内容中13项选定修订、24项继承值，不是37项新原创。

## 旧许可源到当前局部代码的定点映射

[片段证据JSON](evidence/licensed-callable-mapping-20261022.json)保留ApiClient、ConnectionManager、AppSettings、PlaybackManager、page.js、VTT的具名片段、hash及严格/规范化区别，基准为6fee412。片段包含嵌套重叠、简单getter和空constructor，不是代码覆盖率、作者或授权缺口计数；规范化不同也不自动证明行为不同。

helper的同提交GPL原函数与当前显示逻辑有完整机械映射，后续226组getter/read-trace用例对应；11个普通对象桥接用例是较早记录。未发现仅为取得明确许可而必须替换该函数的具体未知片段。本次补来源/表示说明，**没有替换runtime**。七AppSettings访问器的旧GPL完整骨架、Common/Socket完整声明及Sharp实际增量也已收窄，见[统一回执](evidence/license-closure-20261023.json)。

## 组件级决定、规模与行为边界

当前推荐顺序和最小接口范围见[决定表](LICENSE_DECISIONS.md#推荐次序)：先补已有明确许可组件的实际通知/源码交付；helper不再是必需替换项。page/API/settings的独立增量按消费合同处理，PlaybackManager和具体组合范围另列。大范围替换不是本PR行为。

较新Web的历史归档/文件头/现有许可元数据分支已收束；没有新的一手grant就不继续猜版本。Host和已许可外围组件不再因未复现旧build重复调查；具体剩余为Common源码交付/Updater差异、Sharp/ServiceStack混合条件、DPInst/ADL条款、Web后期增量与完整Host验证。无新材料则转具体选择，不扩大成整库欠授权。没有替用户选择联系权利人或商业路线。

## 当前114差异清单的用途筛查

标题中的114保留为历史固定范围。原审计114及其余606项的细分方法见固定历史报告和[606条用途CSV](evidence/known-web-usage-20261022.csv)；不将旧“pending”原封不动作为当前清理单，也不按删除7项直接推算新的全库用途或许可数量。

原12项复核（11未判定＋robots元数据）中，当前退出4项：三Web残留和camera HTML。另8项保留：5份语言文件、playqueueconfirmation、detailtable.css、robots.txt。旧logo和camera JS也已退役，但属于当时另外的差异范围，不能重复计数。语言先保留；es-US/et-EE的既有注册差异不是本任务自动停用语言或改功能的理由。

桌面33包/1142成员与另外123固定输入的用途分层已完成有限研究，现有主线已落实20项npm产物投影；不是仍有229项未分类。旧20＋10清单中的cec.dll已有原生消费者，CEC别名及8个电源包入口/metadata仍保留，没有由本报告新增删除范围。当前任务转来源许可收口，不继续用途扩扫。

## 旧资源实际用途清理

旧14项来源普查维持停止。PR69清理已合并，当前39shader、2小组件、713Web与runtime20npm排除分别由独立合同管理；历史来源账与当前投影分开。详细迁移/使用证据复用main已有文档，不复制另一套流水账。

## 未闭合决定如何记录

每项记录准确现存路径/hash、固定来源与许可范围、原声明交付位置、维护增量、还缺哪一条证据及停止条件。没有证据时明确未确认；存在明确许可时也不因字节不同强制重写。当前没有可靠的全量许可缺口总数。

Model沿已关闭的官方组件选择任务，不在本轮重开；已取消的libmpv对应源码专项不列为活跃待办。主线代码变化、发布状态、运行验收和许可结论分开记录。
