# 来源与许可问题清单

[返回统一索引](../DEPENDENCY_RESEARCH.md)。记录日期：2026-10-22；以来源/许可闭合为新功能前的首要目标。`byte相同`、`源码可得`、`适用许可明确`、`实际分发范围明确`和`自有修改边界明确`是不同结论。

## 先分清内容统计与许可审计

**114是内容来源或差异尚未充分解释的文件数，不是逐文件许可未闭合数；597 byte、6 JS AST、1 CSS AST也不是许可已闭合数。** 当前没有完成720份输入与“准确许可版本／适用范围／最终分发通知／维护增量”的全量映射，因此许可未闭合总数目前**未统计**，不能写成114、122、138，也不能用720减114算出606份许可安全。未验证不等于无授权或违法；找到来源也不等于只补一份声明即可。

| 内容分类 | 实际证明 | 本PR的许可核验状态与下一步 |
|---|---|---|
| 597份官方byte对应 | 特定官方发行物包含相同字节；完整台账引用既有联合审计，本PR只交付其中160份独立清单 | **未完成597条与适用许可的全量映射，已闭合数未知**。已有其他组件合同/notice可继续作为各自证据，不能由本表抹除；先把已有精确来源按许可族链接到原文和实际分发消费者，不重搜来源或直接要求597份全部替换 |
| 6份JS AST对应 | iap、soundeffectsmanager、selectserver、accesstab、通用Web apphost、virtual-scroller的代码语法树对应；非byte同 | **本PR未建立这6份实际Web版本的独立许可适用链**。公开旧repo或Server包中存在同逻辑不能代替授权范围；优先沿既定官方来源绑定许可，不把它们排除在许可问题之外 |
| 1份CSS AST对应 | virtual-scroller.css与4.7.6/4.7.8资源结构对应 | **适用许可未确认**；CSS结构同不是“只补notice”的依据 |
| 1份规范化CustomCssJS | 指定revision仅换行不同，GPLv3原文已取得 | 来源与许可文本已绑定；源码/通知、组合及实际退役范围未由本PR闭合，沿PR #69处理 |
| 114份非空内容差异 | 112份Server比较底稿、1份旧helper语义底稿、1份logo缺底稿；差异作者/引入revision未全解释 | 有来源差异问题，也可能有许可适用、修改授权或组合问题；不能仅凭“114”推断每份需要同一种处理。下表给代表家族的可选边界 |
| 1份空serviceworker | 文件为0字节 | 空字节没有可比代码内容，不构成“另一个需要找代码许可”的结论；占位用途与整体分发合同另核，亦不据此许可整个Web |

以上仍合计720；两份用户载体在其外。897的759/138也是历史**来源**分类的日期引用，不是许可问题数量。既有notice中的独立第三方权利不被Server总条款自动抹去；但本PR也没有据此认证全部当前分发内容。

## 按五个维度闭合

| 内容 | 来源定位 | 许可文本与适用版本 | 实际使用及分发范围 | 自有修改边界 | 未闭合决策／最小下一步 |
|---|---|---|---|---|---|
| 597份已定位Web | 既有联合审计已确认官方发行物byte身份；本PR交付其中160份独立对应证据 | 仍须按组件与准确版本绑定文本；不能以官方归档或历史Emby GPL声明统一覆盖2022网页 | 清单是冻结输入，最终生成/替换/分发还须沿现有构建合同核对 | 相同输入不证明所有runtime输出未修改；overlay另列 | 优先把既有597证据映射到适用许可/notice及当前消费者；缺文本或适用范围时记录具体缺口 |
| 6份JS AST、1份CSS AST及114份非空未解释Web | AST对应保留独立等级；其余精确来源/引入revision未明 | 源码相似或AST同不补足许可、版权及版本适用证据 | 先核定哪些仍被复制/生成/实际分发，不按文件数假设必用 | 当前videoosd亮度/触控/倍速、码率默认值等有具体差异，作者未明 | 按原116清单扣除1份CSS结构对应及1份已定位CustomCssJS后的114清单定点追函数/补丁；无法闭合且仍需使用的，列明确替换或独立重写候选后另作决定，不直接替换 |
| 空serviceworker | 空文件身份可核对 | 空字节不作为作者或年代指纹，也不推导整包许可 | 核定是否仍为所需占位/构建输出 | 不将空文件算作社区修改成果 | 随用途核对处理，不扩大来源扫描 |
| 两份用户Web载体 | 冻结底稿及用户增量关系分开记录 | 用户修改不改变底稿及独立库的适用文本 | [PR #67](https://github.com/hope140/EmbyTheaterEnhanced/pull/67)提取增量，已合并；runtime关系以该PR合同为准 | ApiClient的openWebSocket/reportPlaybackProgress及toast既有块删除，不代表整文件用户原创 | 沿已合并PR核对生成合同、原作者通知及补丁边界；不由增量提取推导整文件作者或许可 |
| 官方Host/Model、继承npm等固定组件 | 依各组件manifest固定身份；当前Model已换官方字节 | 每个组件的准确许可/notice单列，不从Host或Electron根LICENSE覆盖全部DLL/npm/Web | 核对生产复制与随包通知，历史manifest记录不等于当前物理输入 | 维护源码、输入及生成关系按原合同区分 | 从[源码材料索引](../SOURCE_MATERIALS.md)、[Host输入](../WINDOWS_HOST_INPUT.md)、[Model输入](../MODEL_COMPATIBILITY_INPUT.md)、[继承npm](../INHERITED_NPM_INPUT.md)逐项引用已有材料，不重复宣称全部对应源码已重建 |
| 14项旧资源 | 来源普查停止；不继续扩大未知包检索 | 是否还需要取得或保留某条目通知，须结合准确用途/分发范围 | 转下节用途清理；保留未闭合消费者证据 | 不把名称相似、版本变体或旧包载体当作项目原创 | 先完成消费者清单，再决定保留、退役或另提替换；不擅自改固定输入 |

## 本PR实际观察到的许可材料边界

- 所取官方4.7.6 netcore ZIP的条目名中，`license|copying|notice`（不区分大小写）命中0；这是文件名盘点，**不是全内容许可审计，也不证明内容没有许可**。归档身份见[证据JSON](evidence/web-history-20261022.json)。
- 官方Electron 3.0.19 commit `915af80eeba533e3014192708ca3b722046fad03` 的[LICENSE.md](https://github.com/MediaBrowser/emby-theater-electron/blob/915af80eeba533e3014192708ca3b722046fad03/LICENSE.md)包含GNU GPL v2文本，SHA256 `f371b80469fb235bc500ec29e0e85b682d4a6157a158567d828ff0be544d4f1d`。该源码无www，并不因此确立另取2022 Web整树的适用许可。
- 所核对webcomponents/defaultskin tips未见根级license/copying/notice命名文件。历史声明或链接不能自动替代准确分发版本的文本与范围核对。已有文件内声明和通知须保留，不自行重归属。

## 固定版本许可新证据

官方[4.7.6 arm64 Debian包](https://github.com/MediaBrowser/Emby.Releases/releases/download/4.7.6.0/emby-server-deb_4.7.6.0_arm64.deb)为76,094,120 bytes，SHA256 `2a75311bb9c9e44fd2cb7d6e2fb1d7d55de8927213a7c30fa12d92fa196c0efe`。仅静态读取ar/tar/DOCX，不执行安装器或产品。

其中`data.tar.xz`内`opt/emby-server/licenses/license.docx`为18,373 bytes，SHA256 `a6d7ea65dcb06392479a85e1a10a7aeb872d803da6f784f6935fcd4ee63008c6`，文本标注更新于2018-04-11。其原文限制应分开理解：个人、非商业、可撤销、不可转让及不可再许可的使用授权；除下一节例外，限制复制、修改、分发、出售、出租及纳入其他产品，并保留法律禁止限制或书面许可等例外；复制例外仅指可安装Server整体、不得拆部分，不得收费或向公众提供下载（免费也包括），且须保留专有通知。文档还把文档规定的定制/修改作为有限例外，不能扩大为任意修改再分发的授权。本轮没有由此建立拆取Web、修改后公开分发的许可依据。原文也未出现GPL、LGPL、开源组件排除条款；同包独立组件通知另查，不把总条款覆盖到所有第三方权利。

同包有独立组件notice和95行组件索引，但未建立这些文本对当前剩余Web的逐文件适用关系。应先明确Web与独立组件的许可链，再判断需要哪些补充依据或替换候选，不能从Electron根GPL文本或官方托管印象覆盖整个Web。

另核对[现行Terms](https://emby.media/terms.html)，页面标注2026-08-16，含第三方组件独立条款；它不能替代4.7.6随包文本或证明2022适用关系。原始HTTP读取返回403，已用允许的网页读取取得内容；未伪造HTML原件hash。原包、DOCX、索引与解析边界均记录在证据JSON中。

## CustomCssJS固定来源

已按指定固定路径核对[Shurelol/Emby.CustomCssJS commit 6933b58](https://github.com/Shurelol/Emby.CustomCssJS/tree/6933b58c62f98b0919977e953f068b1a581a7a1c)，不继续扩搜作者。`Emby.CustomCssJS/CustomCssJS.js`为4,416 bytes、SHA256 `3eaec19e8a27ef2894d262d2b8569bb6b1275baca249b1457f6679474c856009`；冻结文件4,548 bytes、SHA256 `2177de28dcc4e715f07c63329dc361c5b4ddd37eb7e59f273830b22acea37912`。仅将CRLF改LF即逐字节一致，上游无末尾换行保持。组件版本1.0.0.2及历史0fee38fa同文本结论引用对应组件核对结果，未重搜历史。

同commit的[LICENSE](https://github.com/Shurelol/Emby.CustomCssJS/blob/6933b58c62f98b0919977e953f068b1a581a7a1c/LICENSE)含GPLv3全文，35,149 bytes、SHA256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`。这是固定来源与文本证据，不代表ETE整体许可、组合与分发范围已经闭合。[PR #69](https://github.com/hope140/EmbyTheaterEnhanced/pull/69)退役集成尚未合并，不将其计为已删除；后续仅跟随用途清理。

## 代表组件的许可链（有限核验）

下表针对原112份有比较底稿内容中的代表族，以及两项缺底稿内容；没有扩扫Server版本，也没有把“有开源上游”改写成当前修改版已获完整授权。固定文件、SHA256、函数比较结果和读取失败记录见[证据JSON](evidence/web-history-20261022.json)的`licenseApplicabilityFollowup`。

| 来源族／实际边界 | 固定来源及许可证据 | 对当前输入可以确认的事 | 保留条件／尚缺证据 |
|---|---|---|---|
| 独立第三方候选：page.js路由 | [visionmedia/page.js 1.8.3 commit 1bc9369](https://github.com/visionmedia/page.js/tree/1bc93692b0924b686e2207a66e2e73a85e1ab058)，2018-01-22；同revision的Readme含MIT全文，package.json标MIT | 当前`modules/pagejs/page.js`经approuter调用，但与固定上游非byte/整文件AST同；路由注册、回退状态及Emby dom依赖存在差异。3个同名声明仅作比较入口，不证明具体引入版本或作者 | 固定MIT原件本身提供使用/修改/分发许可，并要求保留版权和许可通知；当前定制路由新增部分的授权仍缺，不能补MIT就宣称全文件闭合。若另选原版，须验证路由注册/返回键适配及其依赖，不能直接覆盖 |
| 独立第三方族线索：WebVTT | [mozilla/vtt.js 0.13.0 commit f823de8](https://github.com/mozilla/vtt.js/tree/f823de834bc23d65300e58a6d391916bc00bcb75)，2016-12-01；lib/vtt.js文件头明确Apache-2.0，根LICENSE同版 | 当前`modules/webvtt/vtt.js`的解析/字幕布局接口和具名函数提供族线索；19个共同具名声明中4个AST同、15个不同（有嵌套重叠），不算整文件或版本对应。当前文件无这段上游版权/许可头 | 原版的再分发条件包括随附许可、保留相关通知、显著标明修改及适用NOTICE；当前派生链和新增部分授权未闭合。项目维护层GPL-2.0-only与Apache-2.0的组合也不能直接判可用：[GNU说明](https://www.gnu.org/licenses/license-compatibility.html)指出二者不兼容；是否构成同一组合及可选边界仍须具体核对，不改项目许可 |
| 早期官方GPL文本与播放方式标签 | [Emby 3.5.3 commit 1d7c2ab](https://github.com/MediaBrowser/Emby/tree/1d7c2ab4bfebdae31f89fdaabd3b68782ccf495a)含Dashboard的`bower_components/emby-webcomponents/playback/playmethodhelper.js`及根GPL v2文本；webcomponents固定tip中的文件最后改于2017-07-01 | 当前helper与2018压缩源码的5种分支输出可逐项对应：无当前项→null；IsVideoDirect→DirectStream；Transcode→Transcode；DirectStream/DirectPlay→DirectPlay；其余→undefined。这是静态语义对应，封装和条件表达式不同，byte/整文件AST均不同 | 同树GPL文本是早期来源证据，不能覆盖新版整树；嵌套bower元数据又指向独立LICENSE URL，而所核对webcomponents tip无该根文件，需补准确适用范围或采用有明确许可的独立实现。当前消费者为playerstats显示标签，未发现本helper作播放地址选择；仍未执行运行验收 |
| Emby发行Web核心／页面（独立第三方另列） | 官方4.7.6/4.7.14字节与函数比较底稿，加同版Debian随包license.docx；历史Electron GPL文本不含另取www | app.js、AppSettings、PlaybackManager、ApiClient和多数页面可以缩小来源差异，但没有取得覆盖这些实际2022/2023修订的独立开源授权链。webcomponents的bower许可URL不是许可正文 | 尚缺准确Web版本的许可声明/授权范围，不能用早期GPL或公开下载补足。按入口初始化、API/连接、播放状态、页面/样式族分别闭合；目前不能把这大片内容认定为“小补丁即可解决” |
| 指定CustomCssJS来源 | 上节固定revision、CRLF规范化对应、GPLv3原件 | 来源已定位；GPLv3通知/源码义务与项目组合范围另查 | 由PR #69用途退役集成处理，不重复追作者，不因有GPL文本便认定整体可组合 |

“可按现成许可保留”目前能直接落实到**已固定的MIT或Apache上游原件及其许可条件**，不能直接等同当前定制文件；GPL历史源码和CustomCssJS也须分别满足适用范围、对应源码/通知及组合条件。本轮没有新增可宣称整文件授权闭合的当前剩余文件，没有认定所有公开早期内容均受同一限制。

## 组件级决定、规模与行为边界

规模按研究ref `6fee412` 的冻结输入计算，**不是重写工期或最终runtime体积**。下列风险是静态消费者支持的工程推断，不是已发生故障或绝对法律保证；固定源URL、许可原文和差异证据见上表及证据JSON的`componentDecisions`。没有替换、重写、联系权利人或替用户选择授权方案。

| 家族／核对规模 | 已确认事实与具体缺口 | 能否只保留声明；剩余选择 | 行为影响与当前可做的最小下一步 |
|---|---|---|---|
| page.js：1份JS，6,028 bytes；approuter适配另计 | 固定MIT原件与当前整文件不对应。当前消费者要求三参数路由注册及getRoutes/getRoute/canGoBack/back/forward/restorePreviousState/pushState/handleAnchorClick等；不能把这些定制部分自动归入固定MIT版本 | **尚不能判定当前文件只补声明即可**。MIT覆盖的原始部分须保留版权/许可；保留当前版需补定制来源/授权依据，另一选择是明确许可的原件加独立适配。后者不是自动可用替换 | 文件小但承载广泛页面导航，行为回归范围较大。最小下一步是固定上述消费者合同和当前差异边界，再决定保留证据路线或独立适配路线；本轮停止再猜上游小版本 |
| WebVTT：1份JS 28,470 + 1份CSS 428，共28,898 bytes | JS有Mozilla vtt.js族线索与同版Apache-2.0原文，非整文件对应；当前缺上游头。CSS的独立来源/许可没有因此绑定，不能因同目录就套Apache | **尚不能只补Apache声明就结案**。需补当前JS引入/修改链、相关通知和GPL-2.0-only组合范围；CSS另核。可比较保留当前派生版的证据路线，或另选许可与组合范围明确的解析/布局实现，不默认Apache原件可以直接纳入当前组合 | HTML播放器外部VTT的解析、cue与布局，中等规模且行为面广；没有证明所有原生播放路径依赖它。最小下一步是固定Parser/StringDecoder/parse/flush/oncue/onflush接口及CSS边界，授权/组合依据无新线索则停止该搜索，交由替代边界决定 |
| playmethodhelper：1份JS，656 bytes | 旧官方416字节压缩底稿的5类输出与当前语义对应，wrapper/表达式不同；2018同树有GPL v2文本，嵌套组件许可范围仍需明确；不把此证据扩到新版整树 | **当前尚未认定只补GPL声明即可**。可以补旧源码对该组件的适用声明及当前变换链，或决定按已记录输入/输出合同独立实现；后者是候选，不是已经完成的独立创作 | 已定位消费者为playerstats标签，局部行为风险较低；不是播放地址选择器。最小下一步可直接就这一个显示函数作保留/独立实现决定，无须继续扫描整包年代；后续验5类输出即可开始，不能据此免除集成验证 |
| logo：1份透明PNG，1238×377，32,892 bytes | [固定原图](https://github.com/hope140/EmbyTheaterEnhanced/blob/6fee412ad68934d0194303916cfe346e6254a228/vendor/web-snapshot/www/modules/themes/logo.png)为绿色播放标志、白色emby及“by David & NoisyX”字样；署名不是已核实作者/许可。它原属通用index的启动画面，不是某个主题专属；维护overlay改用ETE startup.svg，manifest装配仍复制原图 | **没有可补的已确认声明**。选择是补该图片授权证据，或在消费者与分发边界确认后退役/换自有或明确许可资产；“画面未用”不等于“包内不发” | 正常桌面入口加载构建后的www/index.html；静态重做startup变换所得SHA256与合同18f777ee…相同，已无旧图引用。未做GUI/请求验收，仍不能只靠grep证明所有动态路径均不用；屏保用的是另一路logowhite.png。最小下一步沿装配/排除合同决定单图退役或保留证据；缺新线索就停止图片历史检索 |
| Web核心代表4份：app.js、AppSettings、PlaybackManager、ApiClient，共388,093 bytes；外围页面/样式不包含在此规模内 | app.js仅4个指定函数体外整树与4.7.6同；AppSettings仅3个码率方法体及autoplay外同；ApiClient仅4方法体外与4.7.14同；PlaybackManager有具名方法差异和重叠外层构造函数。已匹配的大量代码仍缺实际2022/2023 Web修订的许可适用链，未明修改不因较少就变成原创 | **不能以补Electron GPL或Server下载notice闭合**。可保留路线需要对实际Web修订有效的许可/授权依据及修改边界；若选择不再依赖未确认范围，则需按功能族选明确来源前端或独立实现。没有证据证明整个Web必须删除，也没有证据保证一两个小补丁即可解决 | 初始化/登录连接、设置持久化、播放会话/队列、API兼容和大量页面联动，行为风险高。最小下一步是先决定实际Web授权依据路线还是替代前端边界评估；无新固定声明/权利证据时停止历史包搜索。替代路线需先分入口/API/播放状态/页面样式合同，不进行整体自动移植 |

这些是**保留证据／适配或独立实现／局部退役**的工程选择，不是认定侵权、强制重写或合规保证。只补声明适用于“实际文件与许可适用范围、修改授权、组合和分发条件已经明确，剩余仅是通知交付”的情况；本轮没有把以上任何当前完整定制家族认定为该情况。对于597等已匹配集合，也必须先建立这种判断，不能直接套“只补声明”或“全部替换”。

本搜索窗口到此收束：page.js不再猜版本，WebVTT不扩大族版本遍历，helper不再扫Server，logo无新线索不普查图库，核心不再盲扩旧归档。已查来源和许可仍保留可复查证据；下一次继续应由新的固定来源/授权材料，或明确的保留、替代、独立实现、退役决定触发。

轻量缺底稿核对后，114项中仍有112项Server比较底稿、1项新增早期helper语义底稿、1项logo缺底稿；**byte/整文件AST新增仍为0，114差异未闭合总数不扣减**。logo没有扩大成图片资源库普查。

## 当前114差异清单的用途筛查

这是研究ref `6fee412` 的**内容差异清单**用途评估，不是全仓无用文件普查，也不是许可问题统计。扣除上节已看9文件，本轮目标为105；消费者索引限固定720 Web及定点维护层/装配合同。398份JS解析无误，注释不当作调用，单纯定义模块别名不算消费者；又在研究目录重做25项维护overlay并核验输出hash，没有运行产品或修改输入。

| 此轮105目标的类别 | 数量 | 含义 |
|---|---:|---|
| 仍有静态消费者（含条件模式） | 104 | 99项有直接路径、AMD别名消费者、路由或样式引用；另外5项补到了动态或维护层消费者。不是宣称104项在当前用户桌面都实际请求过 |
| 未判定／可能残留候选 | 1 | 仅`settings/cameraupload.js`，4,814 bytes；尚不作为已确认可删除内容 |
| 已确证所有受支持模式未使用 | 0 | 不把grep无命中或来源未明当作确证 |

合并前轮9项，固定114范围为112项仍有静态消费者、2项可能残留/未判定（旧logo与上述camera设置JS）、0项确证未用；尚未把PR #69计划中的删除计入结果。这个分母只覆盖114内容差异，不适用于597已对应文件或897总账；**许可未闭合数量仍未统计**。

唯一新增候选：[settings/cameraupload.js](https://github.com/hope140/EmbyTheaterEnhanced/blob/6fee412ad68934d0194303916cfe346e6254a228/vendor/web-snapshot/www/settings/cameraupload.js)，SHA256 `cab95e4f266d16c250930d6bb76fd07de18212f2bb777e141396ebdf3f3b6ea8`。[app.js的设置路由](https://github.com/hope140/EmbyTheaterEnhanced/blob/6fee412ad68934d0194303916cfe346e6254a228/vendor/web-snapshot/www/app.js#L691)处于注释块；当前生成overlay仍保留该注释。所取Web与定点维护层未找到活动消费者，仍随manifest复制。伴随的settings HTML存在但不在本轮目标内；`devices/cameraupload.js`另有活动管理路由，不能一并删除。其他自定义导入/模式尚未运行验证，故仅列候选，不并入PR #69已批准项，也不提出整目录删除。潜在4,814 bytes是输入原始大小，不是已实现的安装器节省。

| 初筛无直接路径的其余5项 | 补到的消费者／为何保留 |
|---|---|
| `modules/common/strings/zh-CN.json`、`strings/zh-CN.json` | app.js的sharedcomponents/core翻译列表均含zh-CN，按locale构造路径并由globalize选择加载 |
| `modules/themes/darkgradient/theme.css` | skinmanager从注册主题ID/baseThemeId构造theme.css路径，多个主题别名使用该底主题 |
| `users/profiletab.js` | users/user.js的profile tab ID与`./users/` + ID + `tab.js`动态导入对应 |
| `modules/genericedit/genericedit.js` | ETE维护的plugin-ui/genericui.js直接导入，调用renderForm/setFormValues/getItemValues；维护overlay增加对应配置路由 |

105条精确路径/hash、分类、消费者路径/行号/身份hash及动态说明见[证据JSON](evidence/web-history-20261022.json)的`usageScreen105`。本轮没有新的整目录退役证据。下一步若考虑camera候选，先独立决定保留或生产排除，再验隔离runtime的设置/管理相机上传区分、桌面/其他支持模式路由及请求失败；本PR不执行删除。许可适用可以依可靠版本/源码变换/授权范围等证据建立，不要求每个文件先找到同hash才可能有许可。

## 旧资源实际用途清理

14项（8变体、6旧包）不再列为活跃来源追溯。用途清理先为每项列出构建读取、runtime路径/加载方、安装器或手工分发消费者及现有通知；确认无消费者后才能提出退役候选。动态消费者或分发边界不明时保留问题，不因检索没有结果就删除。清理进展见[PR #69](https://github.com/hope140/EmbyTheaterEnhanced/pull/69)，尚未合并，不记录为已删除。

## 未闭合决定如何记录

每项仍使用的内容至少要有：准确路径/hash、已确认来源及范围、对应许可文本/版本或明确缺项、生产/分发消费者、维护补丁归属、选择理由与验证边界。可比较的选择包括继续取最小来源/许可证据、使用已有明确许可的等价候选，或独立重写；本PR不执行替换、不认定任一候选已经可发行。

v0.3.16已公开发布；发布或构建成功不表示许可清零或全部对应源码完成。已移除的libmpv对应源码覆盖专项不在本问题清单内；不因本页扩大总目标而自动恢复。
