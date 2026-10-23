# 来源与许可：现存范围和下一步决定

[研究索引](../DEPENDENCY_RESEARCH.md) · [历史统计](ISSUES.md) · [本轮证据](evidence/license-closure-20261023.json)

记录日期：2026-10-23。当前范围为 main `0a1dd6541d1327a19e7aed35d493b5e69b194b51`；产品材料与 a33bd03 相同，新增 main 变更仅为公共 CI 的 40 分钟时限。当前 Web713、兼容 shader39、小组件2；33 个 npm 完整来源1142文件，runtime投影1122。本文及通知更新不替换运行代码，不宣称全项目许可清零。

**优先沿用 Emby 官方明确提供的组件许可、版权和分发说明，再处理没有覆盖的具体部分。** 来源身份、授权范围、源码/通知交付、组合范围和运行兼容分别记录。没找到旧编译器、没有同字节重编、包版本与程序集版本不同，均不独立构成新的许可缺口。反之，公开下载、相同字节和“Emby 用过”也不代替条款。

## A：可沿用官方，补齐准确交付

|家族|确证依据与本次动作|保持的条件和边界|
|---|---|---|
|33锁定npm、7继承npm|33个官方包整体hash与原记录一致，name/version/license一致；36个LICENSE/NOTICE成员均存在，20项产物排除与通知零重叠。7个继承MIT通知保持各自固定身份|沿各包原声明，不把项目GPL套给所有依赖。旧35条回执漏计命名规则外的emoji-regex/LICENSE-MIT.txt，文件本身未丢；[投影边界](../SCOPED_RUNTIME_PROJECTION.md)不变|
|Electron44.4.2|实际官方归档及LICENSE、LICENSES.chromium.html已核，73成员复制合同保持|不拿旧Emby的Electron2.x通知代替当前版本，也不要求重编Chromium才能沿现有明确条款|
|39shader及字体|37份MIT、2份Unlicense完整原头；Roboto21份已有Apache和版权；Material Icons固定Google内容/许可已辨|保留各原文，Material Icons旧webfont导出工具未知不另立授权障碍；固定树NOTICE目录查询未完成，不能伪称有额外NOTICE缺失|
|ApiClient/ConnectionManager|[固定官方MIT源与LICENSE.md](https://github.com/MediaBrowser/Emby.ApiClient.Javascript/tree/fdd0939ac596406ab92274f30fd83d226a677424)；本次补Emby版权及完整1080-byte MIT|覆盖已辨原表达，后期独立增量另列；PR67五方法维护层与继承部分分开，不称全文件ETE原创|
|page.js|[1.8.3固定Readme许可段](https://github.com/visionmedia/page.js/blob/1bc93692b0924b686e2207a66e2e73a85e1ab058/Readme.md#license)；本次补TJ Holowaychuk版权及完整1104-byte MIT|该树没有独立LICENSE，不给错误链接；Emby已辨GPL阶段和后期路由增量分开|
|helper|[固定原件及GPLv2](https://github.com/MediaBrowser/emby-webcomponents/tree/93d3f89bd7d151d7bde09af6dffc0c627901831b)；当前656-byte可读模块的表示差异可解释，226组读取/返回/异常轨迹对应|补来源、完整GPL和表示说明；**未发现必须为了许可而替换当前函数的具体未知实现**。原11组普通对象测试保留为较早证据，不能代整播放器验收|
|AppSettings/PlaybackManager已辨部分|[固定GPL源与实际LICENSE.md](https://github.com/MediaBrowser/emby-webcomponents/tree/cc087c2a93e74c3e35bd1cb4935ae472cff41a0e)覆盖已辨表达；七AppSettings访问器均有完整旧函数骨架|key、分隔符和默认值变化明列，630轨迹与3负对照；不是七套未知算法，也不因此给整个较新Web赋GPL|
|VTT已辨Mozilla部分|[0.13.0固定源及Apache全文](https://github.com/mozilla/vtt.js/tree/f823de834bc23d65300e58a6d391916bc00bcb75)；本次补2013贡献者版权、固定来源及当前实际差异说明|固定树无NOTICE。原Apache全文保持；后期新增表达、428-byte CSS和组合范围不由这条署名自动解决|
|jQuery3.6.0 slim/Sizzle|主OpenJS MIT原已保留；本次补实际随包Sizzle2.3.6的1605-byte版权/许可全文|匿名旧优化器未知不算整库欠授权；不将开发包所有external目录都声称进入产物|
|Host/RefreshRate、CEC/platform|官方Host3.0.20发布件/固定源码、RefreshRate同树、libCEC/platformGPL已有依据；官方ZIP19/19选定成员身份核对|保留对应源码、构建资料和原许可；不默认需要社区build证明。driver已有内嵌COPYING/AUTHORS，但DPInst单列|
|Socket|官方组件MIT已明确，应保留原版权和完整许可；版本revision差异本身不使MIT基础失效|不以Emby根GPL抹去组件MIT，也不据此将全部集成增量自动标MIT。[a304集成源](https://github.com/MediaBrowser/Emby/tree/a304b3cd0a330bb34fd3606a6afb9cd3d80176e4/SocketHttpListener)的674方法声明与实际DLL对应是技术映射证据，不是重新授予许可|
|Common已辨部分|[a304官方GPL源](https://github.com/MediaBrowser/Emby/tree/a304b3cd0a330bb34fd3606a6afb9cd3d80176e4/MediaBrowser.Common)26编译输入齐全，421方法声明完整对应，297实际方法体符号IL同|SDK3.3.10/netstandard1.3与PCL发布构建映射和具体Updater差异单列，不再把全库称来源未知|
|Sharp已辨部分|[6d69791明确MIT源](https://github.com/adamhathcock/sharpcompress/tree/6d69791db191fc401752be2f4df66683a5f65723)及Emby固定Sharp0.14依赖包提供正向对应|必须保留Apache/MsPL/UnRAR等实际专项条款，不能只补MIT；旧59文件差异不是当前DLL缺口清单，详见下表|
|ServiceStack.Text4.5.14|[同版AGPL＋FOSS例外](https://github.com/ServiceStack/ServiceStack.Text/blob/e5819a8de75a8bae64ddc7a64008613067893e32/license.txt)与源已取得|符合条件的GPL2独立Additions有明确路线；不是ServiceStack改为GPL2。完成实际源码/通知交付和Additions范围判断，不默认商业授权|
|维护小组件/短模板|[小组件合同](../MAINTAINED_SMALL_RUNTIME.md)保留中文13项修订/24项继承及5个配置字段；[模板合同](../RUNTIME_TEMPLATES.md)保留来源与功能边界|不把旧表达认领为新原创，也不因短功能代码历史不完整就预判必须全部重写；本次不改默认值或语言支持|

通知交付合同实际为11个入口，见`tools/build-input-contract.cjs`的NOTICE_PATHS。本次把新原文放入已经会交付的THIRD_PARTY_NOTICES.md，把材料说明放入SOURCE_MATERIALS.md；**没有增加白名单或改组装代码**。研究文档不自动等于安装包附件，下一次选定发行仍须核实际payload和匹配源码可取得性。

## B：真正剩余的材料与决定

|有限边界|已经缩小到什么|最小下一步／停止依据|
|---|---|---|
|较新Web独立新增表达|API/ConnectionManager的auth/cache、fetch/failover、批量/typed、地址/重连/timeout；page三参数注册、元数据、前进/返回、query；PlaybackManager的stream/队列/report、offset/rate及生命周期。已有旧许可表达不重算未知|现有官方历史包、许可元数据及文件头路线已收束。只由准确适用声明/分发记录继续；无新材料时评审明确底座加最小维护适配或独立实现，不按整文件差异逐字重写、不自动换整个Web|
|AppSettings模块增量|七accessor的完整表达已定位；剩set/event的[name,value]、码率/Chromecast读写策略及AMD/serviceLocator层|现有受控轨迹共享存储stub，没有证明模块层全部等价。只核这些具体策略与适用条款；不再找七个新作者|
|VTT及428-byte CSS|cue词汇/default、plain/native桥、quot实体、Bidi/textStyle/forceLTR、92%几何和track叠放策略；CSS不因同目录自动Apache|28解析核心同、词汇规范化后26/28全对象同；带明示替换/排除的外层状态机对应。假DOM不是GUI，测试不证明权利；剩独立增量条款及实际组合边界|
|Common对应源码交付|实际GithubUpdater.IsAsset是“去扩展名加-前缀或精确名”，固定源是Contains；发布过滤/async生成代码仍有有限差异|需对应发布源或明确维护选择。实际446MethodDef中135无体、297符号IL同、10不同、4无精确key；这些不是许可数量。框架null判断/空params编译选择不算未知业务算法|
|Sharp专项条件与组合|当前DLL具有较新MIT树的写入、81920buffer、密码及接口；两组事件/ZIPUnicodePath亦有Emby官方0.14包对应，不等当前DLL就是0.14|沿MIT及实际专项原文履行，确认MsPL/UnRAR等与所选发行、ServiceStack Additions范围的关系。未知旧编译器/导入者不另立授权阻塞。用途收窄ZIP方案仅候选，没有替换|
|DPInst|driver声明不全缺，但安装器下游条件不能靠libCEC GPL代替|需要WinDDK7600.16385.1实际EULA/REDIST。既有官方ISO读取被拒，停止该路线；由已有合法材料或另行选择不带该安装器的发行方式推进，不运行安装器|
|ADL旧源码条款|动态调用系统AMD驱动本身不证明目标DLL欠授权；附带header/源码的条款需针对实际材料|需要对应旧SDK条款或另行评审明确许可实现/功能选择；不靠省略必须交付源码规避条件，不自动删除功能|
|System.Configuration私有参考副本|x86/x64各omitted/private-target四例配置合同均成功，实际绑定系统GAC而非参考副本；两候选例因不在本地未运行|若建议删私有副本，还需同输入成对的**真实固定Host**隔离验证：实际PID绑定、配置/序列化、本地8154及退出，并覆盖支持环境。合成探针通过不作删除验收，本次不删除或运行Host|
|最终源码/通知及组合范围|固定Host/RefreshRate/Common/Socket/ServiceStack源和项目材料已取得；不能把一条来源URL当成全部履行|所选发行绑定sourceCommit、最终成员/通知hash和实际源码可取得性，核GPL、AGPL＋例外及混合条款的具体作品范围。AMD导入、同进程或同包本身均不能独立代替范围判断|

[官方4.7.6 arm64 Debian包](https://github.com/MediaBrowser/Emby.Releases/releases/download/4.7.6.0/emby-server-deb_4.7.6.0_arm64.deb)中的license.docx为18373bytes、SHA256 `a6d7ea65dcb06392479a85e1a10a7aeb872d803da6f784f6935fcd4ee63008c6`。其个人使用及附条件整个Server复制条款不能直接作为独立Web拆改分发授权；95行组件索引未建立上述Web家族的适用关系。这也不取消独立组件原有许可。

Apache/GPL适用以实际版本和作品范围为准；[ASF说明](https://www.apache.org/licenses/GPL-compatibility.html)区分GPLv2/v3，不能把字体、独立资源和组合代码一刀切。本PR不改项目许可，不联系权利人，不作绝对法律保证。

## C：候选与验证边界

- helper固定GPL源加AMD桥有原11组局部用例；后续机械映射和226轨迹已支持保留当前已辨派生实现，**不再将替换helper作为必需下一步**。若以后重构，仍需playerstats/模块集成验收。
- page/API/settings可用固定明确许可源评估窄适配，尚未进行产品替换；保持深链/返回、认证、Session、远控、队列与迟到回复合同。
- VTT可评估明确许可实现或原生track边界，但需字幕认证/CORS、cue布局和样式验收；当前局部probe不是替换通过。
- Host、Sharp、System.Configuration候选没有因本次静态证据获得自动覆盖或删除批准；不执行驱动、硬件或安装器试验。

## 比较数字只界定工程增量

历史720范围仍是597 byte＋6 JS AST＋1 CSS AST＋1空＋1规范化来源＋114内容差异。当前713不能机械相减成许可已闭合数量。旧[具名片段JSON](evidence/licensed-callable-mapping-20261022.json)含嵌套、getter及编译表示差异，保留原analysisRef，不作为未知作者/欠授权方法数。新证据见[2026-10-23回执](evidence/license-closure-20261023.json)。

## 推荐次序

1. 本PR先补已明确原文/署名/来源与具体边界；不替换运行代码。已许可且仅旧build未复现的分支停止重复调查。
2. 为下一次明确发行落实匹配源码/构建材料的可取得性，以及实际11入口和组件原通知的payload核验；不是由文档更新追溯重做旧附件。
3. 剩余Web增量、Sharp/ServiceStack组合、DPInst/ADL材料和真实Host验证按上表分别处理；有材料先核，没有新证据就转具体选择，不无限扫历史。

旧14资源来源普查维持停止；已退役logo/CustomCssJS不列活动项。已关闭Model选择、已取消libmpv对应源码专项均未重开。
