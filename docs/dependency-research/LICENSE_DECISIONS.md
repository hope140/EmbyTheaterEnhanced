# 来源与许可：现存范围和下一步决定

[研究索引](../DEPENDENCY_RESEARCH.md) · [历史证据与统计边界](ISSUES.md) · [本轮固定身份回执](evidence/license-checkpoint-20261022.json)

记录日期：2026-10-22。当前范围按 main `a33bd03685eb62b66c3c994cc3c4dfcfc89f5c49`（[PR69已合并](https://github.com/hope140/EmbyTheaterEnhanced/pull/69)）校准；历史函数比较仍固定 `6fee412`。**来源身份、许可适用、修改归属、通知交付和最终产物是不同证据。114等内容差异数不是许可缺口总数；当前没有可靠的全量许可未闭合文件总数。** 本文没有产品替换、项目改许可或新包发布结论。

## 先看三类结论

| 类别 | 当前能做什么 | 不意味着什么 |
|---|---|---|
| A：既有许可依据明确，维护通知与来源说明 | 沿固定包、明确文件头或既有组件材料保留准确版权、许可、来源和交付记录；不需要为寻找同hash而重写 | 不是整包组合或全部文件许可清零；已存在完整通知时，也不凭空新增“通知缺失” |
| B：实际授权适用或履行范围仍缺证据 | 只查表中一条有价值的一手线索；无新依据时结束该搜索，交给明确的保留、替代或授权决定 | 代码不同、没重编或没找准revision本身不等于无许可，不据此断言侵权 |
| C：固定许可来源或局部行为已验证，替换仍需适配 | 评审可解释的固定源码＋维护适配；区分函数验证、接口验证、整机验收 | 不是已批准或已完成替换；不能把未知代码逐字改写后称独立实现 |

对权限已明的MIT/BSD/ISC等组件，缺导入历史、README或逐字节重编通常属于复现层问题，不自动增加许可义务。反过来，公开下载、相同字节、同仓库或同名组件不能替代实际授权范围。

## A：可直接补齐或校准的说明

| 家族 | 已确认的依据与本轮说明 | 仍须保持的边界 |
|---|---|---|
| 锁定npm33包 | 当前锁/SRI与已验证来源包一致；声明为16 MIT、10 BSD-3-Clause、4 ISC、3 Apache-2.0。20文件仅退出runtime，完整1142文件来源和恢复输入保留 | 1122文件投影、版本/hash/差集合同见[投影说明](../SCOPED_RUNTIME_PROJECTION.md)。不得删LICENSE/NOTICE或由此宣称整个项目组合已完成 |
| npm许可文件计数 | 现有[投影回执](../evidence/npm-runtime-projection.json)列35条；按包含连字符名称的规则另有`node_modules/emoji-regex/LICENSE-MIT.txt`，1077bytes、SHA256 `483acb265f182907d1caf6cff9c16c96f31325ed23792832cc5d8b12d5f88c8a`，实际许可命名成员共36条 | 第36条不在20排除项内，仍按原字节保留；这是记录口径补充，**不是发现产物缺失了一份MIT许可**。原35条历史回执不改写 |
| 继承npm7包 | [官方e897adda来源与7份分别固定的声明](../INHERITED_NPM_INPUT.md)已经记录；来源换行变换与原registry比较分开 | 本轮未退役其中power/sleep包；CLI/API和完整声明仍保留。旧registry非逐字节相同不再作为单独授权缺口 |
| Electron44.4.2 | [固定官方73成员树](../../vendor/electron-runtime-manifest.json)与自带LICENSE、LICENSES.chromium.html沿已有合同保留 | 没有从Electron/Chromium源码重编，不自动新开许可阻塞，也不替全部内含组件作新认证 |
| SimpleInjector4.0.11 | [现有固定MIT通知与官方NuGet身份](../redistribution-notices/host/SOURCE_INDEX.md)已有单组件材料结论 | 不要求为这个MIT组件逐字节重建；不替Common、ServiceStack或Host整体作结论 |
| 现存39个shader | [snapshot-v2](../../vendor/compatibility-resources-manifest.json)逐个hash保持：**37份完整MIT头，2份AutoDownscalePre为完整Unlicense文本**。准确路径/版权行/许可分类见本轮回执 | 不笼统写成39份MIT；保留各自原头。准确旧revision未明不自动推翻文件中的明确许可声明，不恢复旧14项来源普查 |
| Roboto21份字体 | 既有字体nameID14给出Apache许可URL，完整版权与正文已在[Web通知](../redistribution-notices/web/INDEX.md)及THIRD_PARTY_NOTICES中保留 | 保留准确字体身份和通知；不由字体许可推导其它图片、图标或Web代码也有同样许可 |
| 当前小组件 | [维护合同](../MAINTAINED_SMALL_RUNTIME.md)明确配置5个旧字段/默认值，以及完整37-key中文文件：13项选定修订、24项继承值 | 配置生成、文件改路径或部分译文维护均不把历史表达重新归属ETE；24个继承值的来源边界仍需如实说明 |

本表只关闭“需要继续寻找某个已明确许可组件的字节原版才能保留”的错误待办；它不宣称所有产品级许可义务完成。**Apache代码与GPL-2.0-only维护层的具体组合范围须单列审查**，不能仅把风险写在VTT一项，也不能不区分字体、独立资源和代码结合方式。

## B：具体缺口、最后一条线索和退出条件

| 家族 | 目前具体缺口 | 下一条一手线索／搜索停止点 | 无有效依据时的选择与影响 |
|---|---|---|---|
| 较新Emby Web核心/页面/样式/语言/素材 | 特定官方Server有相同字节，不等于实际2022/2023 Web修订可拆取、修改、公开分发。旧GPL根文本不自动覆盖整个较新www；独立第三方另列 | 已查同版Debian条款、95行组件索引、官方许可历史和当前文件注释，未补出该grant。**现有历史包/版本搜索到此结束**；只由新的准确版本官方授权/源码分发记录重开 | 选择确认当前修订的授权范围，或评估明确许可前端/源码基线，分bootstrap、认证/API、播放适配、页面样式迁移。没有已验证的低成本官方直接替换件；不擅自启动全面Web重写 |
| ApiClient/ConnectionManager当前增量 | 已有MIT旧源，但不同/新增部分及闭包变化未全部解释；用户PR67补丁另算。与4.7.14仅4方法不同不是“相对MIT旧源也只差4方法” | 用已取得MIT源和当前消费合同核auth/cache、fetch/failover、WebSocket、批量/typed接口、地址/重连/locale及timeout；不再扫Server包 | 固定MIT底座＋明确维护的必要endpoint/兼容适配；保存服务器/用户状态与Session语义。不要按差异片段数安排逐字重写 |
| AppSettings/PlaybackManager当前增量 | 已有GPL旧源；存储key/默认码率/选项、stream/队列/report、字幕offset/rate与生命周期变化尚未完全解释 | 仅按已列具名增量分组；构造函数与内层函数重叠，不能当授权数量或工作量。当前层的自有请求/取消/WS补丁独立保留 | AppSettings可评估固定底座＋设置适配；PlaybackManager随整体Web路线决定，需完整会话、迟到回复、远控及队列回归，不先大改 |
| page.js | MIT原件已固定，当前Emby路由/历史接口的派生或自有增量未完整说明 | 不再猜小版本；见C类8个接口与10个不同片段，先核消费合同 | MIT底座＋明确路由适配或仅针对合同的独立实现；虽然文件小，返回/前进/深链影响广 |
| WebVTT及428bytes CSS | Apache原件/头已取得；当前解析/布局差异与通知、修改标记及组合范围须解释；CSS不能因同目录自动套Apache | 不扩版本；先按Parser/StringDecoder/parse/flush/oncue/onflush/processCues合同核JS，CSS单列 | 若当前grant/组合路径成立则保留并履行；否则选明确许可实现/浏览器原生track边界，需验认证/CORS/cue布局与样式，不涉及原生播放整体改造 |
| Material Icons两份字体 | 既有family/copyright/build信息与官方Apache正文，尚未固定历史导入关系 | 只查一条Google官方2022-04-11附近字体历史/许可记录；无实效停止，不扩图库 | 选择固定官方可授权导出并验codepoint、ligature、尺寸；不直接删语言/图标支持 |
| jQuery3.6.0 slim | 官方MIT正文和排除功能指纹已知，未宣称完整变换对应；缺banner/换标识符本身不自动缺授权 | 以已有MIT来源及实质增量边界为主；若仍不能接受当前来源证据，就结束匿名minifier输出搜索 | 评估固定官方3.6.0 slim与现有传统插件调用合同，而非强行独立重写整个jQuery |
| Host/Common/支持DLL | Host官方GPL参考源与发行件已定位；Common3.3.10匹配NuGet但nuspec无grant；Sharp旧源正文未绑；Socket当前MIT参考与目标修订未绑；System.Configuration的框架分发关系未绑 | Host/Common核同版source/project适用范围；Sharp只看固定0.10.3源/旧许可历史；Socket只看官方MIT源/ABI；System.Configuration只看官方同版pack条款和Windows实际绑定。不重下已比较NuGet | 分别选择有依据的源构建或兼容替代；若系统框架已提供DLL能否省私有副本必须实测。源码可见、版本相同、没bit-rebuild均不是自动许可结论 |
| ServiceStack.Text4.5.14 | 同版源码、AGPL/FOSS例外及全文取得已完成；现在缺的是实际Host/Additions履行与源码/通知交付范围 | 逐条把已有材料对照[同版例外](https://github.com/ServiceStack/ServiceStack.Text/blob/e5819a8de75a8bae64ddc7a64008613067893e32/license.txt)，不再找一份相同license | 条件能满足就记录保留路径；不能满足再决定serializer/Host替代。不默认商业路线，不联系权利人 |
| CEC/driver/RefreshRate | libCEC同版GPL和platform引用在；driver不能自动继承libCEC条款；RefreshRate固定源另在 | 只查既有同版源码/子模块/实际修改、driver静态内嵌或官方同版分发条款；不跑驱动、不扫版本 | 有依据的源构建/交付或另作可选CEC功能决定；刷新率单列。已证实cec.dll有原生消费者，不能因JS无引用删除 |
| 维护中文资源及短模板的继承说明 | 中文24个值仍继承；preload等短兼容模板已有功能来源记录，但不能把功能性短代码一概判无授权或称全新原创 | 沿[维护小组件](../MAINTAINED_SMALL_RUNTIME.md)和[模板合同](../RUNTIME_TEMPLATES.md)补准确继承/功能性表达说明；不为此重开旧包普查 | 若需要减少具体继承依赖，另评审窄接口的维护实现；不在许可文档任务中改IPC暴露、配置默认值或语言支持 |

GPL/Apache组合判断应以实际作品/接口/分发范围和适用许可为准。[ASF兼容性说明](https://www.apache.org/licenses/GPL-compatibility.html)区分GPLv2/GPLv3；[Apache正文](https://www.apache.org/licenses/LICENSE-2.0)规定许可、通知与修改标记等条件。这里不擅改项目GPL-2.0-only，也不提供绝对法律保证。

### 较新Web分支为何停止，而不是只写“待确认”

[官方4.7.6 Debian包](https://github.com/MediaBrowser/Emby.Releases/releases/download/4.7.6.0/emby-server-deb_4.7.6.0_arm64.deb)内license.docx为18373bytes，SHA256 `a6d7ea65dcb06392479a85e1a10a7aeb872d803da6f784f6935fcd4ee63008c6`，标注2018-04-11。它有限个人使用及附条件整个Server复制条款，不是本次已取得的较新Web拆取/修改/公开再分发grant；不因此抹去独立组件自身许可。95行组件索引未建立所查Web家族对应关系。官方webcomponents的较新bower元数据仍只是旧master/LICENSE链接；defaultskin所查包元数据无许可字段。当前投影注释检索也未补到有效声明，**缺注释不是无许可证明**。

因此，没有新的准确一手材料就不继续盲扫版本。获得适用授权确认是可供决定的一条路径，但本任务不联系他人。整体Web替换需另作范围决定；许可未知也不是强制逐字重写整个文件的结论。

## C：候选证据强度与接口适配

| 候选 | 已验证到哪一层 | 尚未验证／最小下一步 |
|---|---|---|
| playmethodhelper固定GPL源＋AMD桥接 | [2017原件及同提交GPLv2](https://github.com/MediaBrowser/emby-webcomponents/tree/93d3f89bd7d151d7bde09af6dffc0c627901831b)已固定；原函数逐字保留，草稿只加exports.default桥接。11个普通对象输入在旧源、草稿和现存函数之间输出/异常一致；当前main函数hash未变 | **这是可评审的局部行为候选，未替换产品。** 补源码/通知与桥接归属，核playerstats集成。标签显示不是播放地址选择；不需要继续找Server版本 |
| page.js1.8.3 MIT原件 | [来源及许可](https://github.com/visionmedia/page.js/tree/1bc93692b0924b686e2207a66e2e73a85e1ab058)已核，当前接口差异已列 | 不是已通过适配验收。重点getRoutes/getRoute/canGoBack/forward/restorePreviousState/pushState/handleAnchorClick/onpopstate、三参数注册与深链；先定合同再适配 |
| ApiClient/ConnectionManager MIT原件 | [固定官方源与许可](https://github.com/MediaBrowser/Emby.ApiClient.Javascript/tree/fdd0939ac596406ab92274f30fd83d226a677424)及片段关系已核 | 当前较新接口、认证/会话、存储和重连未作替换集成验收；不把“找到MIT源”写成可直接覆盖 |
| AppSettings/PlaybackManager GPL原件 | [删除许可证前固定官方源](https://github.com/MediaBrowser/emby-webcomponents/tree/cc087c2a93e74c3e35bd1cb4935ae472cff41a0e)及片段关系已核 | 设置和播放生命周期适配未完成。PlaybackManager风险高，应先决定整体Web授权路线 |
| WebVTT0.13.0 Apache原件 | [固定原件、文件头、LICENSE](https://github.com/mozilla/vtt.js/tree/f823de834bc23d65300e58a6d391916bc00bcb75)与当前片段关系已核 | 不是组合或替换验收通过；先定Apache/GPL实际范围、CSS及HTML字幕接口 |

helper源SHA256为`0221204ebc057328a6bcddfead924d9a3f96ba20738709e7930cc68a36ff41e4`，同提交GPL正文为`f371b80469fb235bc500ec29e0e85b682d4a6157a158567d828ff0be544d4f1d`。研究桥接草稿hash及11用例结果见[回执](evidence/license-checkpoint-20261022.json)。本PR只给建议和验证证据，不把JS草稿纳入运行代码。

## 比较数字只用于界定工程增量

下表针对6fee412的冻结基底，不包含PR67直接维护ApiClient/toast.css的自有增量，也不是a33全部最终runtime的权利审计。严格片段与编译规范化分开；外层构造函数/内层片段重叠，简单getter与空constructor也在内。

|家族|当前片段|严格对应|另有规范化对应|仍不同|当前独有|
|---|---:|---:|---:|---:|---:|
|ApiClient|319|18|47|185|69|
|ConnectionManager|66|10|17|32|7|
|AppSettings|22|1|7|7|7|
|PlaybackManager|181|7|54|92|28|
|page.js|19|1|0|10|8|
|WebVTT|34|9|11|14|0|

完整方法名、位置与hash在[既有片段证据](evidence/licensed-callable-mapping-20261022.json)。当前ApiClient实际维护源为`src/electronapp/www/modules/emby-apiclient/apiclient.js`，toast为`src/electronapp/www/modules/toast/toast.css`；两者均保留上游派生归属，不是全文件ETE原创。AppSettings与4.7.6较近的差异集中在3码率方法与autoplay；ApiClient与4.7.14较近的4方法差异不能覆盖其MIT历史源的全部增量问题。

## 推荐次序

1. 维护A类的准确许可/版权/来源记录和交付；无需产品替换的文档校准先完成。不要把已经退役的素材继续列活跃待办。
2. 评审helper的固定许可源＋桥接候选；实施和集成验收另定。本PR没有替换代码。
3. page/API/settings只做有界消费合同与增量适配评估；较新Web整体grant、PlaybackManager与Apache代码组合先作方向决定。
4. Host/ServiceStack/CEC/Material Icons只沿各自表内一条一手线索收口；无有效新增依据就转可比较的源构建/替代/授权决定，不循环搜索。

本文不恢复已取消的libmpv对应源码专项，不重开已关闭Model选择任务。既有文件、声明和历史记录没有被重新标为“许可清零”。
