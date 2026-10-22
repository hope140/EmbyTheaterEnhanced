# 来源与许可问题清单

[返回统一索引](../DEPENDENCY_RESEARCH.md)。记录日期：2026-10-22；以来源/许可闭合为新功能前的首要目标。`byte相同`、`源码可得`、`适用许可明确`、`实际分发范围明确`和`自有修改边界明确`是不同结论。

## 按五个维度闭合

| 内容 | 来源定位 | 许可文本与适用版本 | 实际使用及分发范围 | 自有修改边界 | 未闭合决策／最小下一步 |
|---|---|---|---|---|---|
| 597份已定位Web | 既有联合审计已确认官方发行物byte身份；本PR交付其中160份独立对应证据 | 仍须按组件与准确版本绑定文本；不能以官方归档或历史Emby GPL声明统一覆盖2022网页 | 清单是冻结输入，最终生成/替换/分发还须沿现有构建合同核对 | 相同输入不证明所有runtime输出未修改；overlay另列 | 优先把既有597证据映射到适用许可/notice及当前消费者；缺文本或适用范围时记录具体缺口 |
| 6份JS AST、1份CSS AST及114份非空未解释Web | AST对应保留独立等级；其余精确来源/引入revision未明 | 源码相似或AST同不补足许可、版权及版本适用证据 | 先核定哪些仍被复制/生成/实际分发，不按文件数假设必用 | 当前videoosd亮度/触控/倍速、码率默认值等有具体差异，作者未明 | 按原116清单扣除1份CSS结构对应及1份已定位CustomCssJS后的114清单定点追函数/补丁；无法闭合且仍需使用的，列明确替换或独立重写候选后另作决定，不直接替换 |
| 空serviceworker | 空文件身份可核对 | 空字节不作为作者或年代指纹，也不推导整包许可 | 核定是否仍为所需占位/构建输出 | 不将空文件算作社区修改成果 | 随用途核对处理，不扩大来源扫描 |
| 两份用户Web载体 | 冻结底稿及用户增量关系分开记录 | 用户修改不改变底稿及独立库的适用文本 | [PR #67](https://github.com/hope140/EmbyTheaterEnhanced/pull/67)提取增量，合并与runtime关系仍以该PR结果为准 | ApiClient的openWebSocket/reportPlaybackProgress及toast既有块删除，不代表整文件用户原创 | 核对提取后可重现输出、原作者通知和补丁边界；PR未合并前不写已交付 |
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
| Emby自有Web核心／页面 | 官方4.7.6/4.7.14字节与函数比较底稿，加同版Debian随包license.docx；历史Electron GPL文本不含另取www | app.js、AppSettings、PlaybackManager、ApiClient和多数页面可以缩小来源差异，但没有取得覆盖这些实际2022/2023修订的独立开源授权链。webcomponents的bower许可URL不是许可正文 | 尚缺准确Web版本的许可声明/授权范围，不能用早期GPL或公开下载补足。按入口初始化、API/连接、播放状态、页面/样式族分别闭合；目前不能把这大片内容认定为“小补丁即可解决” |
| 指定CustomCssJS来源 | 上节固定revision、CRLF规范化对应、GPLv3原件 | 来源已定位；GPLv3通知/源码义务与项目组合范围另查 | 由PR #69用途退役集成处理，不重复追作者，不因有GPL文本便认定整体可组合 |

“可按现成许可保留”目前能直接落实到**已固定的MIT或Apache上游原件及其许可条件**，不能直接等同当前定制文件；GPL历史源码和CustomCssJS也须分别满足适用范围、对应源码/通知及组合条件。本轮没有新增可宣称整文件授权闭合的当前剩余文件，没有认定所有公开早期内容均受同一限制。

## 最小替换／重写候选边界及影响

这里列的是证据仍缺时可供决定的边界，不是实施计划或已确认必须删除的内容。本PR没有替换、重写或联系权利人。

| 最小边界 | 静态消费者／功能影响 | 尚需的最小决定或验证 |
|---|---|---|
| `playmethodhelper.js`单一显示函数 | playerstats的播放方式标签；app.js注册模块 | 明确旧源码许可适用性，或另行决定独立实现5个输出分支；保持统计标签合同，勿扩大到播放核心 |
| `themes/logo.png`单一图片 | 冻结index使用；现有startup overlay已改指向ETE startup.svg，但快照装配仍复制manifest内原图 | 当前hash未找到所取官方底稿；未建立图片许可。后续可确认有无其他消费者后决定退役/自有图片，不把“首屏不用”写成“不分发” |
| page.js路由模块及approuter适配边界 | 页面跳转、历史回退、地址/路由状态 | 先区分MIT原始部分与未明新增部分；原版候选需适配现用注册/返回键合同，不自动移植 |
| WebVTT解析/布局模块及HTML视频播放器调用边界 | HTML播放器外部VTT解析、字幕cue与布局；不能推断所有原生播放路径都依赖它 | 固定来源/修改授权及GPL组合边界；若另选库或重写，另验字幕语法、时间轴、布局和渲染，不扩展为播放器整体替换 |
| Emby Web页面／核心族 | 初始化/连接、播放状态、卡片/列表、设置和OSD；不同族耦合实际存在 | 最小缺口是实际Web修订的授权范围，不是再找一个更早Server包。若无法取得证据，须按仍用功能族决定来源明确的替代前端或独立重写，现阶段不承诺能只替换某一个文件解决全部问题 |

轻量缺底稿核对后，114项中仍有112项Server比较底稿、1项新增早期helper语义底稿、1项logo缺底稿；**byte/整文件AST新增仍为0，114差异未闭合总数不扣减**。logo没有扩大成图片资源库普查。

## 旧资源实际用途清理

14项（8变体、6旧包）不再列为活跃来源追溯。用途清理先为每项列出构建读取、runtime路径/加载方、安装器或手工分发消费者及现有通知；确认无消费者后才能提出退役候选。动态消费者或分发边界不明时保留问题，不因检索没有结果就删除。清理进展见[PR #69](https://github.com/hope140/EmbyTheaterEnhanced/pull/69)，尚未合并，不记录为已删除。

## 未闭合决定如何记录

每项仍使用的内容至少要有：准确路径/hash、已确认来源及范围、对应许可文本/版本或明确缺项、生产/分发消费者、维护补丁归属、选择理由与验证边界。可比较的选择包括继续取最小来源/许可证据、使用已有明确许可的等价候选，或独立重写；本PR不执行替换、不认定任一候选已经可发行。

v0.3.16已公开发布；发布或构建成功不表示许可清零或全部对应源码完成。已移除的libmpv对应源码覆盖专项不在本问题清单内；不因本页扩大总目标而自动恢复。
