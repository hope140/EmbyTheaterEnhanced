# 维护记录

## 2026-10-16 v0.3.5 测试版发行准备

2026-10-16：用户对cc7f542当前本地候选所测场景反馈“测试完成了，可以发布了”，记录为USER_REPORTED_TEST_COMPLETE，并明确授权v0.3.5 Pre-release发行。该反馈不补写未说明媒体、真实远控、系统安装或旧服务器矩阵逐项PASS。当前进入PR/门禁、最终main来源构建、标准安装器及公开回读流程；Stable保留v0.3.1。


## 2026-10-16 v0.3.5 搜索重复空态修正

用户截图发现同页两条无匹配提示。旧完整应用默认getRouteUrl已复现2条（维护eteSearchStatus与原ListController.setEmptyListState各一条），修前单测也失败。Model Tier: Tier 1；Model: 当前主线程，精确标识未由工具暴露；Reason: 单helper删除重复UI owner，播放影响0；Escalated: No。限定worker仅调整测试，主线程复核真实DOM。

产品来源cc7f542cf12a236bba22948030b5043a8a736e08，删除5行成功空态分支，原响应/原native空态/单字符提示保持，独立错误status保留。定向15/15、材料162/162、默认完整应用24项及390/800/1280恰好1条提示通过；VerifyOnly/完整2158文件/副本和启动隔离通过。未重复不相关全量公开套件，也未将旧来源结果记为新来源通过。新独立本地包身份与ZIP回读见V035_SEARCH_FEEDBACK_FIX；旧目录/ZIP/profile保留，未推送/PR/发布/安装，真实服务/前台/播放远控NOT_VERIFIED。

## 2026-10-16 v0.3.5 默认搜索入口P1修正

父审核复现并拒绝441eafb。主线程使用旧完整runtime与原getRouteUrl默认路由独立复现item or serverId cannot be null，显示/网络/Native均0；此前强加serverId的隐藏夹具未覆盖默认入口，旧结果不算本问题通过。Model Tier: Tier 1（明确局部合同）；Model: 当前主线程，精确标识未由工具暴露；Reason: 单helper客户端选择与回复归属，播放影响0；Escalated: No。GPT-6 Luna High只补限定测试，保留修改前失败日志。

产品只改list-search.js，来源2c9410c1bfd9ab27e7f3fe9943f9841b20494829；按owner.apiClient、显式serverId、canonical currentApiClient优先级选择，并在成功/错误提交前核对同一API对象和userid。测试提交8b484d2，定向15/15；默认原路由20、显式18、电视9、详情24/真实菜单取消、电影25、首页17及新来源材料162/162通过。2157 payload/2158完整runtime、VerifyOnly、独立SHA/交付副本与空profile启动隔离通过。公开首轮950/951，唯一临时Git fixture失败项保留原日志，隔离复验1/1通过；首次根因UNKNOWN；最终ZIP2162文件/234473398 bytes逐项回读通过，SHA 7f8a2b88d4c40d00391798209cd0fa055fa8c941b4c4164ac3c7fc93c35eab10；回执见V035_DEFAULT_SEARCH_FIX，未推送/PR/合并/发布或安装，真实服务器/前台/播放远控NOT_VERIFIED。

## 2026-10-16 v0.3.5 搜索与菜单合批

用户明确接受“继续进行吧，合进去一起”，新增标准/电视搜索与必要原生菜单取消修正；旧详情用户观察保留。Model Tier: Tier 2；Model: 当前Codex主线程，精确标识未由工具暴露；Reason: 两条搜索路由与异步提交/恢复，播放核心影响0；Escalated: No。GPT-6 Luna High worker只读盘点及限定测试，主线程保留产品设计与最终核对。

新增patcher均进入固定overlay哈希、INPUT_PATHS、防篡改集合和provenance fixture。旧完整应用复现迟到覆盖和异步template空节点；后续修正返回时新输入与已完成错误状态保留。产品source 441eafb5dd5434174bad739eb0e1ed01abb0ae4f，测试提交3b5520d；同来源标准18、电视9、详情24、原电影库/首页及实际菜单取消通过，材料162/162。真实点击/键盘取消保值且change=0，视频禁用控制不伪算可选菜单。来源runtime2157 payload/2158完整文件、VerifyOnly/独立SHA和空profile启动隔离通过。最终公开948/948通过，ZIP2162文件/234473141 bytes逐项流回读通过，SHA 6b85f003ff3d75831fc65d05924c37696e45e9565765edca74eba082cd8f200e；详见V035_BROWSE_CANDIDATE。未推送/PR/合并/发布或系统安装，真实服务/前台/播放远控NOT_VERIFIED。

## 2026-10-16 v0.3.5 详情事务候选

Model Tier: Tier 2；Model: 当前Codex会话，运行时未向任务提供精确模型标识；Reason: 详情AMD控制器异步/离页/返回的跨组件正确性；Escalated: No。明确测试任务委派worker，产品合同和实现由主线程负责。

基于实时main ef7a8d8建立独立工作树，保护原Settings工作区。核对Movie/Series/Season/Episode同一路由与类型分区，保留无问题证据的信息布局。旧完整应用隐藏探针在详情销毁后释放回复，复现null classList未处理拒绝；外网/显示/Native启动均0。增加固定源变换器，与既有item overlay串联，暂停/销毁/刷新失效旧事务，阻止旧主渲染、reload及选择回填；保持底层API和所有播放/Session owner。最终产品source 51ae2e4（1f0b58d后补齐构建输入与夹具并重建）；公开941/941、材料157/157、输入tamper专项19/19、隐藏完整应用24项与12组三视口、真实Tab/Shift+Tab及2157完整文件集/交付副本核对通过。启动隔离探针通过，profile已移出交付。初始两项provenance夹具失败、菜单取消undefined拒绝、菜单异步填充与Series按钮夹具修订均保留；取消诊断仍OBSERVED，前台/真实服务器/播放/远控/安装NOT_VERIFIED。最终ZIP2161文件完整流回读通过，SHA c16db379c003ce7ec1fad1cc8f4e0c297afe1187d530515fbbf8c7e8fd5efb16；旧.NET路径分隔符首次审计失败已保留并改用标准条目后通过。详细身份见V035_LOCAL_CANDIDATE；本轮没有push/PR/合并/发布/安装或真实服务器访问。

## 2026-10-16 v0.3.4测试版发行完成

## 2026-10-16 — 详情候选反馈与批次讨论

用户在收到51ae2e4本地候选及详情页测试说明后反馈“现在看起来没问题”。记录为当前已测场景USER_REPORTED_NO_ISSUE / MONITORING，不补写具体媒体、菜单取消、实际播放/远控/安装逐项通过。用户同时询问能否合并其他Web相关版本，当前仅进入批次调整讨论，尚未接受搜索或共享控件的新实施范围，也没有新的发布授权。

- PR #38的push与PR公开CI通过后合并，最终main源码及产品Tag固定为`98c26e4a123f0b8c623451ee7603fc431b28bddf`。独立工作树以该提交重新构建标准runtime和安装器，产品文件与最终本地候选一致；版本0.3.4，依赖、默认内核及播放核心不变。
- 最终主线公开CI940/940、固定材料156/156且无跳过。空profile和合成API的完整应用首页17项、电影库25项、390/800/1280视口通过；实际显示/外网/Node网络/Native启动0，所属进程退出，原file: Cache警告单列。首张电影1280截图早于隐藏窗口重绘，夹具在全新隔离目录强制尺寸变化并等待后重新截图核对，产品未改。
- VerifyOnly和独立复核确认2156项payload、2157项完整runtime；安装器完整性检查及解包后2157文件逐路径和SHA一致，保留12项锁定依赖原带测试文件，本轮profile、wrapper和验收脚本未入包。安装器175753774 bytes，SHA-256 `eedf03e83b0f4b2b2ef674134af4fefc5068573b5bb82466e3ad4191c46d0c3d`，NotSigned。manifest SHA `c8b37b4649327ee1f88a28dff34516073a1eeee4ca206d20d341ce3e9a4bcf74`，payload-set SHA `d5378284e15bc58be35b76679948a1f5ab5e06c886d1b6b33494fa6f7854ee4b`。
- v0.3.4以Pre-release且非Latest发布。安装器、provenance、单独SHA、RELEASE_NOTES及SHA256SUMS五项附件匿名完整回读通过；安装器按连续范围覆盖全部字节后顺序哈希，两份校验文件与来源关系一致，Release正文与说明附件内容一致。Stable/Latest仍v0.3.1，v0.3.3元数据和附件保持。后续仅同步状态文档，Tag和产品来源不随文档HEAD移动。
- Model Tier：Tier 1；主线程继承会话配置，GPT-6 Luna High执行只读累计源码及解包复核，均无明确问题，主线程核对真实报告、diff、门禁与远端状态。未执行系统安装、真实服务器业务、前台、播放或远控验收；没有启动后续版本。

## 2026-10-16 v0.3.4测试版发行准备

以下为发行准备时快照，当前发行结果见上方完成记录。

- 用户明确要求发测试包，批准本版主线集成、准确来源安装器、Pre-release发布与公开回读；当前核对main=6fb61e3、打开PR0、v0.3.4尚不存在。父会话已审核累计源码与本地候选，新增三文档有限用户反馈原样保留。
- 发行文本围绕浏览取消、迟到提交与焦点、电影分类入口及首页媒体库标题，保留USER_REPORTED_NO_ISSUE/MONITORING边界，不推断逐项人工或播放/安装通过。版本仍0.3.4，依赖和默认内核不变，完整Web迁移未实施。
- Model Tier：Tier 1（发行脚本/文档/已固定验证）；主线程继承当前会话模型，Luna worker做只读累计diff及包体复核；核心正确性与最终发布由主线程审核。新构建必须绑定最终主线提交，旧本地wrapper/profile不入发行包，所有旧候选继续保留。材料缺口与既有许可未决状态不因发布改写。

## 2026-10-16 — 用户反馈暂未发现问题

用户在收到ae245f6标题跳转候选后反馈“现在没看到有什么问题”。按上下文归属于当前v0.3.4候选的有限使用观察，记录为USER_REPORTED_NO_ISSUE / MONITORING；本次标题缺项转入观察。用户未逐项说明点击/Enter/See All/返回焦点、媒体类型或设备组合，不补写逐项PASS，也不扩大为真实播放、远控、旧服务器矩阵或安装验收。缓存继续不做，既有包体/sourceCommit保持，未因此发布或启动后续版本。

## 2026-10-16 首页分区标题跳转续办

- 最终产品来源ae245f623fa32957c155cfb8b5dd1f1e7aa78987，依次保留4a9e4bc（标题接线）、eae49c6（返回焦点）和ae245f6（次级入口隐藏时回可见标题）三个小范围提交；起点b646374后的产品改动只在两个home模块，其他为直接相关测试/文档。
- 隐藏完整应用先验证native标题/See All及正确电影路由，发现返回重建DOM后焦点为BODY；修正仅保留分区标题Id/入口种类。早期See All焦点断言曾点击只有6项时原组件已隐藏的入口，改用12项可见输入，并补充隐藏入口回可见标题测试；不改变原数量门槛或组件。另保留新生custom元素的is声明属性，实际instanceof和原loader一并核对。
- 最终39项定向/材料、940项公开门禁通过；空profile+合成API完整应用17项、3视口通过，含真实Enter到tv suggestions、返回内容/标题/See All焦点、失效账号激活阻止及TV普通标题。实际show/浏览器外网/Node网络/Native启动0，非预期页面错误0，原file: Cache警告单列；未执行真实服务器/前台业务。requestWait/clear/refresh函数体与起点逐字一致，无缓存策略变化。
- 来源构建为EmbyTheaterEnhanced-v034-home-titles-ae245f6-20261016，2156 payload / 2157完整runtime逐路径及SHA通过，两个home模块匹配指定Git blob；manifest SHA b3cd0fe004b96ccaee8e3fe925579373f82cd1b86a4176a7c829d0c5445ad350，payload-set SHA acf43a44d4488ffa598d9101604c0cef47a6943dad0149c78211a8c96ca7442f。独立VerifyOnly及2169项包体断言通过。
- 新交付ETE-v0.3.4-home-titles-ae245f6-20261016与旧ed00a97目录/ZIP分开；启动wrapper隔离探针通过，生成profile移出交付。ZIP2161文件逐项回读通过（28个命名审计断言），SHA 6e4abb611e896af0de8ec232d6290043354cd58e4204b4d8233e50cca68c12c2；只保留12个与v0.3.3同字节的锁定依赖测试文件，没有本轮profile/harness/fixture。默认DLL哈希保持，未发布或安装。
- 本轮还发现旧电影库合成夹具只设置serverInfo.Version，原运行serverVersion未赋值，因此旧case当时仅证明缺版本提示的原查询可用。已在独立空profile目录、原ed00a97不变runtime上经setSystemInfo显式设置4.10.0.40→4.6.0.0→恢复，25项补证通过且显示/网络/Native0；旧回执不改写为当时已设置版本。真实旧服务器矩阵仍未验证。
- 以下为本批提交前记录；此后的文档HEAD不重标上述产品来源，不重跑已覆盖的无关门禁。旧产物和用户profile未被替换，没有远端写入或真实服务器业务操作。
- Model Tier：Tier 2；Model：主线程继承会话配置、provider测试worker为GPT-6 Luna High；Reason：服务端导航DTO与原native标题/router接线；Escalated：无。风险/不确定性中，模块范围为home provider/renderer和定向测试，Playback/Session影响NONE。
- 当前用户明确只补跳转，缓存先不做，保留现有搜索布局；本任务可回退本地提交/构建授权继续有效。起点b646374，旧产品ed00a97与其测试目录/ZIP保持，不能覆盖用户可能运行的产物。
- 已在旧ed00a97的真实main/app/router/原组件中，用空profile和合成API复现5个分区、30张卡片、标题/See All链接0。初次夹具未通过原setSystemInfo设置ApiClient运行版本，导致走旧首页回退；修正夹具后基线通过，产品未改。只读静态样本与原homesections确认桌面latest父库经原router进入suggestions，TV为h2。
- provider投影冻结的Id/CollectionType/owner ServerId，Type/IsFolder仅作可选一致性校验；路由/路径/命令不跨边界。renderer显式加载原native标题和canonical router，文本用textContent，保留原See All/键盘机制，局部capture仅拒绝失效owner/stage。
- provider17项、renderer16项、固定材料4项，共37项通过。材料用原getRouteUrl及原isLocalItem函数验证电影/电视剧latest路径；覆盖恶意URL/query/脚本、跨server、标题HTML、TV、旧owner激活、现有取消/清空与回退。没有改刷新清空、重试、时限或新增缓存；未更改vendor、媒体库/搜索/详情controller或播放核心。后续新来源构建/完整应用/ZIP结果另记。

## 2026-10-16 v0.3.4本地交付收尾

- 用户随后明确允许本批可回退操作，批准14文件本地提交、来源绑定构建、包体核对及隔离隐藏/视口验收。核对审核回执中的14项文件集合和SHA均未改变，在codex/v034-library提交为ed00a97c11490a36e2a844c531772750deb22524；本轮没有新的产品修正。
- 首次构建拒绝测试阶段的vendor目录联接，保留部分输出与日志；改用固定输入物理副本及项目内锁定工具链，在新r2输出完成构建。产品来源ed00a97，版本0.3.4，2156项payload和2157项runtime文件（含manifest）逐路径/SHA匹配；独立VerifyOnly和16项包体断言通过。manifest SHA 9cf1211f4c367f82445cac59883037b165c1cce18072a9c7383d5cfd811f577b，payload-set SHA 8a70575381f2ea59a64dab112b6a10d5d5bf19a7acd189bf948d9a33abcccbac。默认DLL仍为965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c。
- 完整隐藏应用使用真实main/入口/路由/原组件、空profile及合成ApiClient，阻止浏览器和Node外网、LAN发现与子进程。最终23项浏览检查通过，含真实详情页进入/返回、1460非零滚动位置和同一影片焦点恢复、分页、筛选排序、卡片/列表、重复刷新、离页迟到响应、失败恢复和合成旧版本提示。390/800/1280 CSS视口均无页面横向溢出；390采用夹具临时最小尺寸覆盖，未改产品窗口约束。已实际查看三种截图。show、外部请求、Node网络、Native启动和残余进程0，只有原file: Service Worker Cache警告，非预期页面错误0。
- 初期完整应用夹具缺electronfile本地协议allowlist、Prefixes应为数组、列表异步渲染需等待、虚拟卡片身份不能用缺失data-id，以及偏好保存应由合成API接收；对应失败与初步结果均保留，最终结论以修正后的完整夹具为准，不记作产品回归或借此改产品。真实服务器/个人profile/前台窗口均未参与。
- 本地交付使用独立test-profile入口；launch.cjs在require正式main前显式固定appData/userData/sessionData/logs/temp，避免只依赖环境变量推断隔离。隐藏探针确认appData/userData/config均隔离、版本0.3.4，show/网络/子进程0；生成profile移到交付目录之外的私有验证目录，不随包分发。runtime文件保持来源绑定字节；外层入口作为本地交付wrapper单独记录SHA。
- 最终r2 ZIP为2161文件（runtime2157+外层4），逐文件完整回读及4359项独立断言通过，SHA为81962ab3d5f521925408ecb07a89d14de27861735781dc65b727d8c1fdb8b735，与sidecar一致。12个上游protobufjs测试文件与v0.3.3 manifest/实际文件同SHA，9个对应锁定依赖记录一致；精确保留继承文件，不删除锁定依赖树，本轮profile/harness/fixture及非白名单测试文件0。
- 交付与实际验证见V034_LOCAL_CANDIDATE。本次只追加文档提交，不重跑无关全量门禁或重标产品来源。尚未执行真实服务器矩阵、前台键盘/遥控、播放/远控或安装验收，没有推送/PR/合并/发布/系统安装。

## 2026-10-16 v0.3.4电影库浏览候选（提交前快照）

- Model Tier：Tier 2；Model：主线程继承当前会话配置，测试worker为GPT-6 Luna High；Reason：浏览controller、容器及异步取消跨模块接线；Escalated：无。Task Risk/Uncertainty：中；Cross-module Scope：电影页及原共用列表的条件接线；Playback/Session Impact：NONE。主线程保留合同、取消归属与最终审核。
- 重新核对远端main为6fb61e3，从准确提交建立隔离工作树；读取原目录未提交的NEXT_STEPS_20261016完整计划，不覆盖原Settings分支与已有改动。电影试点范围已在当前任务接受，后续版本没有实施授权。
- 复用已完成Web评估及固定4.10.1.0私有静态样本，核对实际路由/API/分页/筛选排序/返回恢复，不引入新Web资产。电影库原功能继续由VideosTab→ItemsTab/ListController→itemscontainer/virtual-scroller提供。
- 冻结材料复现普通getItems丢失signal与迟到首屏覆盖。新增Movie专用维护模块，取消Promise与底层signal分开处理，刷新/离页/销毁及账号变化均阻止旧结果和旧焦点回调；普通失败保留原错误对象与页面错误路径。发送前账号切换也不发出旧页查询。电影类别的movies页签参数改为已有videos，收藏/合集参数保持。
- app与六个页面/共用模块输出纳入固定输入/输出SHA合同，新生成器加入build-input及provenance夹具。非Movie不安装维护层，其他页面的普通API调用仍保持原参数个数。版本与锁文件仅更新到0.3.4，无依赖升级。
- worker首先报告迟到失败未检查账号的有效失败，主线程修复后12/12 helper测试通过；材料10/10通过，覆盖冻结基线复现、真实default拆包、原controller/容器refresh、分页筛选、离页/重复刷新、失败恢复与缓存resume。主审核补齐首屏/分页最终提交和容器50ms延迟焦点/monitor回调归属检查，旧分页失败不得重置新query tracking，同query中断分页仍可重试。overlay/runtime provenance6/6及首轮构建输入/overlay23/23通过。
- 隔离Electron源预览用实际Alameda及原拆包函数加载维护模块和固定controller，canonical连接factory为1次，分页signal接线通过；显示、聚焦和外部请求0。首次夹具启动受ELECTRON_RUN_AS_NODE环境影响，随后页面相对路径配置错误，均保留失败现场；修正夹具后通过，不记作产品故障或完整应用/视觉验收。
- 新工作树首次公开门禁897/899通过，因锁定依赖尚未准备导致两个CD2测试入口失败；随后仅用离线缓存执行npm ci --ignore-scripts，相关两文件60/60通过，完整公开门禁复跑931/931通过，失败/跳过0。未修改CD2产品或测试、依赖版本和锁定内容。最终source冻结后的22项电影检查和6项overlay/runtime provenance夹具通过；283项tracked及新增/变更JS语法、334项tracked与全部14差异文本有限凭据模式和diff-check通过。来源绑定构建要求提交源码；本批没有提交授权，完成可审阅源码与验证后一次性请求本地提交/构建。尚无runtime包、完整应用、窄视口、真实服务器/媒体/远控或安装通过结论；未推送、创建PR、合并或发布。

## 2026-10-15 v0.3.3发布收尾

- PR #37已合入main，产品来源与v0.3.3 Tag均为11f29056c64abe2fb8133a409781a83e11cf9a60；最终主线公开CI919/919、材料144/144通过。材料测试已分离为显式selftest，原断言保留，不用跳过来制造通过。
- 最终来源重新构建并校验2155项payload；固定Inno编译安装器后经innounp测试/解包，2156文件（含manifest）逐路径/哈希与运行时匹配。安装器175696187 bytes，SHA-256 066143a7a89fbf56ad9009b27298c4eb4c1e63f51c20b7642f463d43cc635589，保持NotSigned。
- 最终运行时About原生组件18组状态及三视口检查通过；完整应用初始化中的合成四选择器均为真实EmbySelect并使用原ActionSheet，选择区宽度恢复，实际窗口显示/Native启动0。个人登录、配置及已导入内核仅用于独立本地入口，不进入公开安装器；新内核基本播放保留用户反馈身份。
- 已发布GitHub Pre-release并上传安装器、来源记录、单文件摘要、Release说明与SHA256SUMS五个附件；Stable/Latest保持v0.3.1，旧v0.3.2附件不变。产品Tag和包体由原提交固定，后续文档提交不重标产品源码。切轨延迟继续无限期延期。

## 2026-10-15 v0.3.3测试版发布范围

- 用户明确要求当前UI修复完成后发布测试版，并授权本任务可回退操作。版本推进为0.3.3，使用Pre-release，保留v0.3.1正式版/Latest及既有v0.3.2资产。
- 集成已审核的内核候选打包CLI参数修正及真实子进程回归，来源为独立已完成7d03bbb的两个工具/测试Git blobs；状态文档在当前分支统一记录，不覆盖新进度。暂停的离线延迟工具保留独立分支，不恢复采样、性能实施或前台操作。
- 详情新增生成器暴露runtime-provenance材料夹具遗漏：补入fixture固定文件清单后原两项正/负例通过，没有降低来源与tamper断言。3cddb46的材料失败保留，后续新来源重跑独立记录。
- 3cddb46公开925/925通过；实际完整应用初始化后，合成详情控件使用四个真实EmbySelect，原生ActionSheet生成两项、选择区宽度恢复，窗口显示/Native启动均0。实际详情路由在严格网络限制下未完成，记录为夹具限制，不记为真实详情验收；控件检查不执行原Item业务controller或改真实媒体选择。
- 发布安装器从最终main来源重新构建，校验版本/来源/完整payload及解包内容；发布后核对Tag、Pre-release/Latest与匿名下载字节。安装器保持NotSigned，来源许可等既有边界保留，不执行系统安装，不携带私有测试脚本、登录材料或用户导入的内核。

## 2026-10-15 详情选择器原生菜单与布局跟进

- 用户在About本地提交/构建授权后补充详情页UI差异，并明确本任务可回退操作直接推进。About九路径已单独提交59b34cd并构建，详情修复保持独立可回滚提交；不扩展为发布、安装或真实业务写入。
- Model Tier: Tier 1；Model: 明确规格实施GPT-6 Luna High，主线程沿用当前配置负责审核；Reason: 两个属性与详情局部样式，既有原生控件和构建合同明确；Escalated: no。
- 根因一：selectSource/selectVideo未指定data-menu=custom，桌面模式落入Windows原生菜单；selectAudio/selectSubtitles已使用Emby ActionSheet。仅在固定HTML overlay补两个属性，原Item controller、控件和菜单模块字节保持。
- 根因二：Carnival layout.css的宽屏附加规则将noScrollY详情选择区限为24em，并对label/select增加上边距。固定布局overlay保留原文，仅追加.itemView内80em以上的width:auto与margin-top:0；不修改其他页的选择器或整套主题。
- 新生成器进入build-input与runtime overlay来源合同，输入/输出SHA固定，重复或漂移锚点拒绝；HTML既有外置播放器退役变换链保留。执行冻结emby-select的pointer/Enter/change/disabled测试，以及5项定向与28项组合检查通过；父会话复读真实diff并重复5项通过。后续来源绑定构建、包体及原生控件隐藏验证独立记录，不宣称完整新版详情页已迁移。

## 2026-10-15 About原生界面整理候选

- Model Tier: Tier 1；Model: 主线程沿用当前配置，只读Web范围核对为GPT-6 Luna High；Reason: 已有界面与IPC合同明确，限定About三文件和回归/文档；Escalated: no。没有修改内核选择、启动、回退、播放或Session代码。
- 用户确认20261015候选可以播放，截图显示候选已通过启动握手；这分别是USER_REPORTED有限播放与截图证据，映像SHA仍UNKNOWN，其他媒体组合与回退未验收。
- 动态候选按钮使用document.createElement的原生emby-button注册并追加样式类，保留构造器的主题/焦点类；候选列表复用原listItem样式，不再使用独立边框卡片。默认显示本次/下次启动及简短状态，长哈希/PE/来源/许可声明收进技术详情，保持未知值和判断边界。
- About原生primary按钮沿用button-submit主题填充，不更改其他设置页；空状态行不保留高度，去除空白占位。版本信息与操作功能、原IPC及错误/取消状态保持。相关定向测试19/19通过；实际原生按钮/样式的隔离渲染与来源绑定构建分别记录。
- 只读复核Web范围：已做GenericUI/插件兼容与首页HomeSections接线；卡片、其他页族和共享播放组件主要沿用原有实现。Electron44.4.2是独立运行时升级，不能表述为整套新版Web迁移完成。路线图进度按已确认首页方向和延迟无限期延期同步。
- 定向19/19、公开920/920、JS280项及331文本有限凭据模式扫描通过。源预览使用真实Emby按钮/滚动元素与列表/主题样式、合成IPC；390/800/1280的18组状态、默认折叠/展开、选用按钮的原生实例/主题类和ID分派通过，截图已人工检查，无外部网络或真实窗口显示。首轮夹具用矩形尺寸误判闭合details的不可见后代，次轮试图点击已禁用的选中按钮，分别更正可见性与交互前置条件后通过；未为夹具错误修改产品。该证据不替代来源绑定包/安装或真实内核操作；用户随后明确授权本批9路径本地提交和继续构建，复核差异及已审核字节后执行。

## 2026-10-15 首页说明收敛与空收藏核对

- Model Tier: Tier 2；Model: 主线程沿用当前配置，独立内核材料任务为GPT-6 Luna High；Reason: 原生页签加载与接口/渲染证据需区分；Escalated: no。没有改变播放、Session、认证或公共组件归属。
- 移除成功首页顶部额外管理说明；回归改为要求stage直接由分区组成，显式空布局也不插入说明节点，28项定向检查通过。变更继续位于已授权的首页本地提交/后台构建范围。
- 完整应用隐藏切换可创建12个Favorites分区，原生getItems/getArtists/getPeople成功返回0条；只读核对Filters=IsFavorite、IsFavorite=true、Filters=IsFavoriteOrLikes同样为空。用户明确原网页也无收藏，所以保留原生收藏行为，不用合成内容冒充真实收藏，也不将空列表误记为加载失败。
- 独立材料任务准备20261015版shinchiro标准x64 libmpv ZIP，父会话使用产品worker重新验证四条目完整性、x64及必需导出通过。来源URL及下载摘要另行核对，候选DLL未加载、未替换基线；真实导入/启动/回退由用户后续单独测试。
- 产品提交44edab5完成来源绑定构建及2155项payload校验；公开918/918、材料82/82、JS280项通过。实际应用在只读服务/隔离profile中切换主页-喜欢-主页：首页13分区、说明节点0，真实空收藏页签可进入；另一次仅在内存中提供1条合成收藏，原Favorites组件生成卡片。窗口实际显示0、Native子进程启动0，网络限制引起的独立renderer拒绝保留，不宣称全部renderer异常为0。直接启动入口完整文件集合与哈希检查通过，登录与STRM配置复用，不带入候选内核选择；文档HEAD与44edab5产品来源分开。

## 2026-10-15 原生首页加载链验证收尾

- 产品来源f087a4e重新来源绑定构建，公开918/918、材料82/82、JS280/PowerShell28及331文本有限扫描通过；2155 payload完整校验。原生别名回归28/28，组件隐藏窗口800/1280各14项通过；夹具已使用原app.js的getDynamicImport及拆包函数。
- 完整应用检查直接运行实际main、app.js/router、HomeTab与BaseTab，使用隔离登录副本，只放行同一服务的元数据GET。实际构建出13个首页分区并出现卡片、布局有效，未再出现首页构造帧错误；禁止写入、WebSocket/其他网络与Native子进程，实际窗口显示0。观察到的卡片数是初始懒加载结果，不代表所有虚拟列表或前台交互完成验收。
- 完整应用夹具前两次因误拦本机electronfile协议未进入应用层，保留失败；放行既有本机协议后通过，没有为夹具错误修改产品。只读模式下的非首页网络拒绝单独保留，不宣称所有renderer异常为0。
- 新独立入口沿用已核对登录/连接配置，在新目录验证启动文件与payload，未覆盖用户正在运行的旧候选。f087a4e产物来源与后续文档HEAD分开；前台复测仍由用户完成，延迟项无限期延期。

## 2026-10-15 首页原生模块导出合同修正

- 用户实测be8e8c4首页空白。脱敏renderer日志定位到构造函数第1行669列；原生app.js的getDynamicImport经过returnFirstDependencyDefault返回controller本体，接线额外访问.default.create而中断，尚未进入服务端数据读取。
- 旧Node/隐藏夹具把别名等同于原AMD module对象，掩盖了正式加载链的拆包语义。回归改用原app.js两段实际函数生成别名：修改前复现相同TypeError，修改后28/28通过。接线直接消费controller.create，并重新固定HomeTab输出SHA；不改公共加载器或其他模块导出合同。
- 用户报告喜欢页可用、插件暂未发现问题、尝试播放暂时正常，只按各自有限反馈记录。切轨延迟无限期延期，后续不主动采集/优化；新内核导入因材料不足未验收。
- 修复继续限定在此前明确批准的首页文件范围，后续本地来源绑定构建和隐藏完整应用验证分别记录；没有前台输入、推送或安装。

## 2026-10-15 首页候选后台构建与验证收尾

- 用户明确授权13路径本地提交及隔离构建/隐藏验证，候选先提交5444670；真实组件验证促成同范围内的激活修正be8e8c4。最终runtime保持be8e8c4来源，版本0.3.2，2155项payload通过package VerifyOnly及完整集合/哈希核对。本地ZIP2156条目（含manifest）逐条目读回，SHA-256为5905cc86ea209c8263d07127c37913c55031ecfb23704f596b72c941970b70aa。
- 最终来源公开门禁918/918、材料门禁82/82，JS280项、PowerShell28项及331维护文本有限凭据模式检查通过。相对e15692e，产品文件仅新增两个首页模块、修改app.js与HomeTab；其余差异为来源/依赖记录，无payload移除，原Helper/DLL字节保持。
- 隐藏DOM用实际构建资产及原CardBuilder/itemscontainer/imageloader/scroller，在800和1280 CSS视口各14断言通过；标题转义、卡片输出、离页取消和旧服务器回退有受控证据。show/focus/外部请求0，无测试Electron残余。BaseTab、API数据及宿主业务服务为fixture；未执行真实播放、会话/远控、登录复用或安装。
- 保留所有首次失败：旧5444670卡片未激活，以及隐藏夹具缺input、图像辅助方法/样式alias、播放和菜单能力、shortcut服务等依赖。最终夹具改用原imageloader和shortcuts，补齐受控宿主服务，未为夹具失败修改生产公共组件。前台保持暂停；没有推送、PR或发行。
- 本条为文档收尾，最终包和来源回执仍绑定be8e8c4，不因后续doc-only提交重标或重建已验证产物。

## 2026-10-15 首次卡片容器激活修正

- 5444670来源runtime的隐藏真实CardBuilder/itemscontainer检查在卡片断言失败；受控BaseTab和API服务不包含真实播放。实际组件的refresh monitor初始为paused，直接refreshItems提前返回；改为公开resume({refresh:true})，不更改组件、播放或Session实现。
- Node fixture以真实paused初态建模，接口/生命周期28/28复核通过。保留第一次夹具模块依赖超时及第二次实际卡片失败，不把它们改成PASS；后续runtime按新提交单独构建/绑定。

## 2026-10-15 首页渲染与生命周期接线候选

- 已批准接口候选4d59329后继续本地接线：固定HomeTab/app.js overlay注册单一维护controller，沿用原BaseTab、ApiClient、CardBuilder、itemscontainer与焦点/播放owner。首批覆盖默认水平卡片布局，未支持视图、图像/尺寸或命令分区完整回旧首页。
- 刷新前清除旧stage；暂停、销毁、user/server/client变化和新轮次使旧响应失效。旧renderer的user及加载等待也可取消且有期限；卡片渲染异常会回退，回退仍失败只显示可重试的通用提示。标题使用textContent，原上下文操作与Item DTO不重建。
- 目标服务只读核对4.10.0.40：tv与mobile,desktop各13分区；resume/onnow/latestmedia三类条目API读取成功。仅保存脱敏schema摘要，无服务器写入、UI、原始响应或媒体内容落盘。
- 接口与Node DOM/生命周期测试28/28，构建输入与overlay23/23通过。来源绑定构建、隐藏实际DOM与前台结果仍待后续；当前不以这些检查宣称页面或播放已验收。
- Model Tier: Tier 2；Model: 主线程沿用当前会话模型；Reason: 页面事务、取消、fallback与来源生成关系；Escalated: no。真实服务摘要与原始试验过程保存在仓库外。

## 2026-10-15 服务端首页只读接口候选

- 用户选择跟随新版网页首页分区/顺序，保留旧版回退。自有适配模块复用当前ApiClient的getUrl/getJSON，不新建认证、播放或Session owner，不复制新版Web整树。
- GET HomeSections及Section Items保留服务端顺序与原Item DTO；ID按路径段编码，查询参数固定，禁止转发任意URL/命令。刷新/暂停/销毁取消请求，过期client/server/user响应丢弃；请求或不支持布局整体回退。
- 11项离线合同测试通过。版本门槛和DTO依据固定Web分析样本，不是目标服务器实测；尚未接到HomeTab或生成页面候选。接线/renderer与设置提示、真实服务、前台/播放验收分别保留待办。
- Model Tier: Tier 2；Model: 主线程当前模型；Reason: 首页请求归属与兼容回退；Escalated: no。普通工具和文档核对由独立worker完成。

## 2026-10-15 主线集成与交付记录归属

- 用户明确授权已审核累计59路径推送、创建PR、检查通过后合入main及最终main来源测试包构建；已创建[PR #36](https://github.com/hope140/EmbyTheaterEnhanced/pull/36)。产品范围保持，补充的内核管理使用说明与状态同步只触及既有文档。具体合并状态、main构建sourceCommit/包体SHA及未验收范围写入PR最终收尾说明；不通过后续doc-only提交重标旧产物来源。
- 下面各条按原来源保留候选、本地构建和后台证据。本批不发布Release/Tag、不安装客户端，也不把合成DOM、fake-client或静态PE结果改称真实Native/播放/前台通过。首页迁移不启动，切轨延迟继续暂停。

## 2026-10-15 已完成批次整体收尾核对

- 用户纠正应先收尾已完成成果，首页迁移不进入本批；切轨延迟继续按用户要求暂停。逐项核对旧功能/M01、L02、M02及插件布局的累计59路径，17项产品源码与94dbcef runtime字节/manifest相符，未发现已完成提交遗漏或新首页/延迟产品混入。本条为远端操作前的本地审核记录；后续授权与集成归属见上条。
- 提交前门禁275JS/28PowerShell语法、326个维护文本的有限凭据模式扫描与累计diff-check通过。890/890公开、82/82材料及131项隐藏插件/12组静态几何保留本轮来源。固定94dbcef runtime生成本地验收ZIP，从ZIP内读回2154个文件全量SHA匹配；ZIP SHA为`b08a652e984c8623e96459bcdacdfd8ffe5eaa13a91c1a9a4280c4168062a74b`，未作为Release发布或安装。
- 旧About私有夹具的scope问题在新副本修正并预检查；唯一有效Electron运行通过8个合成状态和全部布局断言。内容窗口800（Electron坐标），125%缩放，实测CSS640×702、devicePixelRatio1.875；横溢出0，启用按钮可滚动/键盘到达。show/focus/activate为0，所属Electron退出且无残余，runtime仍2153项payload加manifest且无debug.log。保留启动前目录冲突及外层PowerShell变量命名错误；后者仅修正读回，没有重跑Electron。旧69e8141历史NOT_VERIFIED保持，新94dbcef合成DOM结果单列，不称真实Native/前台验收。
- 通用审计最初误将最新doc-only HEAD85c4243作为runtime源，得到来源MISMATCH；原结果保留。主线程用正式source-provenance/runtime-provenance CLI显式绑定真实产品提交94dbcef后均通过、errors为空，未修改或弱化validator。文档收尾不改变产品/runtime来源，不重新构建已验证包。
- Model Tier: Tier 1用于明确集成清单、既有私有fixture修正与包体验证；worker选择GPT-6 Luna High，主线程保留累计来源/最终结论审核。没有实施新首页、切轨性能变更、推送、PR、合并、发布、系统安装或现用profile操作。

## 2026-10-15 插件布局来源绑定构建收尾

- 用户明确批准本批9文件本地提交和后台构建。父核对准确allowlist、全部SHA、反向patch和空index后提交`94dbcef4b6f50469e535fb91fe86209d16670ae4`。Tier 1 GPT-6 Luna High任务负责固定输入复制/校验、锁文件依赖、构建及测试证据；主线程保留候选审查、最终runtime隐藏复验和完整payload读回。原主目录与M02产物保持。
- 固定Carnival/patch/Electron44.4.2完整树、mpv头文件与GCC UCRT64工具链由已验证M02材料复用并校验；`npm ci --ignore-scripts`使用原锁，不升级依赖。source-bound输出`dist/EmbyTheaterEnhanced-plugin-layout-94dbcef-20261015`共2153项payload；build-manifest SHA为`8b22c2110084946abfb955ae15666c6b11281e5bec884caaa076ad67e533b289`，payload-set SHA为`bf8ea4d3e2abee07e6084a786f804e64410d72202d767173f18a7bbf791715d7`。VerifyOnly和隐藏测试后的父逐SHA/完整集合复核均通过。
- 113个发现测试文件按原合同排除6项材料依赖，107文件公开门禁890/890。首次材料门禁并行启动过早，准备态preload尚未生成，统计77/78且4项未加载；保留失败后确认preload与本次runtime/manifest同SHA，在稳定准备态单次重试六项材料门禁82/82通过。没有改产品/测试来消除失败。
- 父的私有fixture从最终runtime读取实际维护模块、冻结Web模块和Electron执行131项隐藏合成检查；1次本地有效命令、外部请求/目录选择器请求/前台动作均为0。实际runtime CSS的静态模板三视口12组复验通过。最终runtime来源始终为94dbcef，后续文档收尾单列，不重新构建。没有执行真实插件脚本/业务、Helper/DLL、播放、现用profile、前台、安装器或发布。

## 2026-10-15 传统插件布局与基础编辑器验证

- 基于`dd34ac3`在独立工作树处理Chapter API宽度反馈。只读获取当前插件字节并通过PE元数据静态提取四页模板，未加载DLL或执行插件脚本。属性隔离复现传统表格`display:block`导致33%布局列坍缩；移除该display覆盖，保留原表格约束，由现有内容容器承接横向溢出。没有改插件模板、路由、业务命令、PlaybackManager、Session、Native Helper或现用profile。
- 同一实际CSS的四页、三视口共12组静态几何复核覆盖单层/嵌套百分比分栏、长合成行、目录滚动、窄Options输入焦点及外层纵向滚动。真实网页同尺寸矩形和前台仍未验收。原来仅恢复嵌套表布局的备选会遗漏单层分栏且窄Options仍整页溢出，未采用。
- 现有基础editor/source-ID差分转为测试覆盖补齐：新增四类editor、对象数组选项、过滤/分页、本地provider、显示转义及canonical命令值不变的断言。worker相关Node测试40/40，父会话扩大到相邻路由/关闭/订阅的55/55复核通过，两次不合并计数；隐藏Electron合成门禁131项通过，1次loopback命令，外部请求/目录选择器请求/前台动作均为0。首次新fixture漏了冻结GenericEdit必需的SelectOptions数组而失败，补齐后重跑；保留失败证据，未据此修改产品或vendor。
- Model Tier: Tier 1用于明确CSS和测试范围；Model: worker使用GPT-6 Luna High，主线程沿用当前会话配置并保留原因判定与最终审核；Reason: 局部布局及已确认控件合同，无播放/Session改动；Escalated: no。
- M02最终提交边界、完整2153项payload、manifest/provenance、公开888/888及材料82/82已独立读回；fake-client重启/回退不替代真实内核或播放验收。04下一步缺少旧目标内容录制，保留T4 NOT_OBSERVED和700ms既有等待；06首页新API/配置归属仍需具体设计。当时的新候选未提交或构建；后续94dbcef构建结果见本日收尾记录，未发布。

## 2026-10-14 M02 手动内核候选实施

- 用户已确认方案为手动导入完整候选ZIP、下次应用启动生效、候选启动验证失败一次回到固定baseline。隔离组合worktree基于`a820f5d5dfba35f1f52b93a6d7097af80552fb02`；保留旧M01候选、共享旧主目录与所有已有改动。产品变更28文件已按单独回滚范围提交为`8d06f0b53280a86c3b74c94c452cb6469d428312`（`feat: add manual mpv kernel candidates`）。随后两项test-only断言适配单独提交为`d894e4ea093af026f8e463aaeb12677f99dfd4cc`；runtime源身份仍绑定产品提交`8d06f0b`。未推送、创建PR、合并、发布或安装。
- 主线程保留`service.js`、`main.js`、窄IPC、startup effective target、退出确认和fallback；Luna worker分别负责纯ZIP/schema/PE parser及profile store测试。候选包只含`candidate.json`、`mpv-1.dll`、`SOURCE.txt`、`NOTICE.txt`；固定生产Helper SHA/API131077/protocol1/capabilities，不接收renderer任意路径/URL/command，不执行包内文件。大包解析/hash/Deflate/PE预检在本地worker_threads运行，关闭等待本任务worker退出。
- Profile状态以DLL SHA寻址、对象不可覆盖；导入不选择，选择仅为pendingRestart。Main在应用构造时冻结一次启动选择；无候选继续baseline lazy启动，候选才在renderer page load前启动前验证。失败候选仅在owned process exit确认后fallback一次；有效候选失败后本进程effective target锁存baseline，后续create或baseline crash重建不重新试候选。成功候选的显式recreate仍绑定同一candidate；播放中Helper crash不换库/重放session。损坏JSON/unknown schema和超限普通state仅由用户显式baseline选择原子修复，state link/directory拒绝并保留。
- About明确分开包/静态结果、pending/active、ready handshake和image SHA UNKNOWN；source/notice来自随包声明，releaseability NOT_ASSESSED。离线维护工具生成固定ZIP并在输出前用同一import validator readback。无可信候选来源、完整runtime build、Helper/DLL load、真实profile、播放器前台、Emby/服务器或业务播放验收。
- 定向矩阵：16个测试文件164/164，覆盖ZIP Store/Deflate尾流消费、CRC/schema/path/flags/Zip64/属性/重复名/offset重叠、PE架构/节表/RVA/导出、profile store取消/并发/原子性/state修复、窄IPC、About状态与错误反馈，以及baseline lazy启动、候选预热、exact-exit后单次fallback、effective target锁存和destroy/recreate/crash边界。固定baseline DLL只做匹配SHA的静态PE预检，未加载或执行。独立Astra复核的90/90绑定其精确sourceContentSet `7958559f3a917ec9adf7396688dc0ab2438e4b65be909f07eb156f8a2567c194`；父会话对后续main/IPC/About小差异实跑13/13。三组结果分别记录，不相加。
- 定向公开离线门禁：首次107个文件/888项中887通过、1失败，原因是`product-session-identity.test.cjs`只查找旧的`loadStartInfo().then(...)`语法；M02启动链改为`return loadStartInfo()`，identity先于该调用的产品不变量仍成立。test-only提交改为识别两种实际调用形式并保留原顺序断言，完整重跑107个文件、888/888通过、0跳过。六项material-required测试首次为81/82，唯一失败是旧`external-player-process-chain`把L02已退役的sleep命令当作正向保留项；test-only提交移除该过期正向项，保留并加强windowstate/exit/loaded/video/audio/openurl正向断言及sleep/shutdown/restart的禁用断言，之后82/82通过。
- 依赖按原`package-lock.json`执行`npm ci --ignore-scripts --no-audit --no-fund`，34个包安装成功。经已验证mainline输入复制并逐项重核：Carnival 1009文件、patch 51文件、Electron 44.4.2 73文件、固定GCC 6990文件/553090415 bytes及mpv头文件均匹配各自合同。产品提交`8d06f0b`上运行`tools/build.ps1 -OutputName EmbyTheaterEnhanced-m02-8d06f0b-20261014`，生成2153文件；build-manifest SHA-256 `b76274946b9012315eda1a5af181b59235c145c598f0130e51600200e0bad42f`，payload-set SHA-256 `5cf12c1679489cc5e4cc54af29c94e5779522619670fde7007238910747a98bd`。`tools/package.ps1 -RuntimeName EmbyTheaterEnhanced-m02-8d06f0b-20261014 -VerifyOnly`核验2153文件、逐文件哈希及provenance通过。source/runtime/input provenance均指向产品提交；Helper SHA为`28054c75551177f1109859d4f8793d45a4c731aba1e43ddab9bb2f1c5dc030dc`，baseline DLL SHA为`965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。未生成安装器。
- 使用构建runtime中的实际store/bootstrap/service代码和真实runtime身份、独立合成profile及Fake NativeHelperClient模拟baseline lazy启动、pending选择不改变当前target、重启冻结候选、坏SHA/API/version拒绝、候选exit receipt后一次baseline fallback、baseline失败停止重试；共三组模拟启动，不调用真实Helper进程或加载DLL，不创建真实BrowserWindow，不触发show/focus/activate、播放/Session/远控、真实profile或服务器。前三次模拟回执记录了夹具identity作用域、plan索引、事件索引及状态读取假设错误；修正夹具后第四次通过。全部尝试日志保留在仓库外`m02/build-validation/`。
- 静态检查：产品候选23个JS/CJS语法检查通过；两项test-only文件也分别通过`node --check`，差异`git diff --check`通过。未运行完整`npm test`、安装器/系统安装、真实候选或Helper/DLL、前台UI、Emby播放/远控或服务器访问；也未推送、创建PR或发布。完整检查回执见仓库外`M02_BUILD_RESULT.md/json`。
- Model Tier 3；Model为当前GPT-6主线程（运行时未显示更细模型别名），Reason为跨main/IPC/store/Native Helper的启动/退出/安全边界；Escalated为NO（从起始即按Tier 3）。Luna纯模块worker负责parser/store文件；Astra和父会话均只读复核。最终后台结果停在父会话payload/commit readback，不声称真实内核升级或播放验收。

## 2026-10-14 L02 停用旧 AppHost 系统动作

- 用户选择停用旧 sleep/shutdown/restart 协议动作。Web apphost 不再广告这三项能力或暴露对应方法；apphost-command 白名单及 main 协议分派不再接受和执行这些 token，删除专属系统动作函数。拒绝请求仍调用协议 callback 并返回空响应。apphost.js 是 source-maintained 的 src/electronapp 产品文件；基线提交 aab528b 的 Git blob 为 52614ee25e10d74df5da8d2583ed9955e455b677，输入字节 SHA-256 为 7087A292E7262131E0F1EA08716E257846B55FE23510302A7D6E6AC746DA6A21，直接修改受 sourceCommit 绑定，不需要 vendor overlay。
- 保持 APPHOST STARTUP COMMAND CANONICALIZATION、windowstate、exit、loaded、video/audio powerSaveBlocker 与 openurl 安全解析路径；未改变普通锁屏/播放电源阻止器。没有调用真实系统动作。
- 实际 main handler 对大小写、尾斜杠、双尾斜杠和编码变体合成请求逐一回调并验证零副作用；实际 apphost.js VM 核验 capability 与方法均关闭，正常 windowstate/exit 命令保留。定向22/22、相关 JS 语法与 diff-check通过。
- Task Risk/Uncertainty 与 Cross-module Scope 为 Tier 2；Playback/Session Impact 为 NONE。主线程保留协议/系统动作边界与最终审查，沿用当前会话模型，未升级。父会话最终审核通过并记录于私有 L02_FINAL_REVIEW.md；9路径 L02 变更另提交为69e8141，和30路径aab528b可分别回退。
- source-bound `tools/build.ps1` 以sourceCommit 69e8141abf61bd335ec58498937ce1689ff115e2完成。隔离runtime为dist/EmbyTheaterEnhanced-phase01-l02-20261014；build-manifest SHA-256 048eb6973d54de5d337f26e383ed1a556c1fcd707db1b53e07c632987b085580，payload 2147文件，canonical payload-set SHA-256 41b786dc862cab51d4a385b862f2de612831afc5e696d608ae1d77fac585a852。`tools/package.ps1 -VerifyOnly`完整文件集、逐文件hash、provenance、runtime exclusion和锁定依赖校验通过；未生成安装器。
- 通过实际构建产物的Web AppHost VM检查21项，主协议分派器从构建后的main.js执行合成测试13/13。父会话在仅含一项bundled identity测试调整的test-only HEAD cca8f52复跑公共离线门禁：98/98测试文件集，819/819 cases，0失败/跳过；JS语法259、PowerShell语法28、有限凭据扫描310及diff-check均PASS。340个tracked源文件hash汇总为e8d244b9a744375b8dfdd8ef2270b01b7188444df1c2441dde19c2634a9b310d。原先784/787那次门禁作为旧结果保留，未覆盖或合并到本次结果；runtime仍只绑定产品sourceCommit 69e8141。
- 隔离隐藏About DOM fixture直接加载生成runtime中的About.html、About.js、CSS及Babel/Emby button/scroller AMD模块；maintenance IPC仅返回合成状态，profile路径仅在私有fixture下，所有HTTP/HTTPS/WebSocket请求均被拦截。隔离窗的show/focus/activate均0，所有owned PID及子进程退出且无残留。run-20261014-06在私有几何回执生成器处因main harness作用域中缺少buildManifest而停止；父会话从独立run identity复核同一fixture也遇到相同缺项。800px/125%矩形及notReady/failed/missing完整DOM场景没有取得最终回执，状态明确保留NOT_VERIFIED；该fixture错误不能据此判定产品通过或产品失败。各run日志/回执保留于私有build-validation/hidden-about；没有产品源码或runtime变更，也未启动生产客户端、真实profile、服务器或系统动作。
- 文档后续提交只同步构建、公共门禁和隐藏fixture边界；runtime build-manifest的sourceCommit保持69e8141，公共测试所用HEAD为cca8f52，文档commit单独记录，不冒充runtime来源。前台、真实Emby/远控和安装验收仍未执行。

## 2026-10-14 M01 身份与配置候选整合

- 用户授权本地应用已审核的归一化 M01 补丁；在旧功能主线 managed worktree 使用 git apply --check 后应用9路径（6产品、3测试）。补丁 SHA-256 03DB9C95249D380BA8EA2790FFAB188A5BAA186681DE08DEE0FC4F3B449F7DCD；原始缺少终止换行的 M01_CANDIDATE.diff、M01 原 worktree 与两个早期 harness failure 记录均保留。
- About/maintenance 分开展示包内libmpv文件SHA、编译期预期身份、ready Helper 握手实际版本/API/capabilities；未ready信息为UNKNOWN/NOT AVAILABLE。包内SHA不冒充已加载映像哈希；实际映像SHA与属性回读仍UNKNOWN。固定render path与被忽略的UI值解释不改变Native路径。
- libmpv.js只对exclusiveAudio用规范UI键mpv-exclusiveAudio，缺失时兼容旧小写键；显式false优先，媒体类型仍限制为video。没有改PlaybackManager、Session、source/Resolver、generation、loadfile、Stop/Next、Helper协议或sender边界。
- M01定向Native状态、设置组装、About/维护测试72/72通过；定向语法/静态检查经父审核。应用后组合回归：L01 AMD/VM16/16、AppHost/外链18/18、L04+process-chain6/6、L05 item VM4/4、Next/Session76/76、overlay4/4、runtime provenance2/2、Pepper4/4、build-input audit20/20、public selector1/1。Full tools/build.ps1、真实Helper/DLL、MPV_HOME、前台、服务器和播放均未执行。
- Model Tier 2；主线程保留跨Native/renderer身份合同与最终审查，沿用会话模型。M01独立审查未发现产品越界；没有模型升级。source-bound全构建需要新增提交，本轮未提交/推送/PR/发布。

## 2026-10-14 批次01续办 L01 与 L03-L05 候选

- 在隔离 managed worktree 的 e862288 基线上继续。L01 的提示错误隔离与加载标记时机已修复：toast 缺失、抛错或 Promise rejection 都不阻断 CSS；JS 偏好解析失败只记录固定泛化信息，不输出配置或错误对象；加载成功后才置位 isCustomCssJSLoad。输入 CustomCssJS.js SHA-256 2177DE28DCC4E715F07C63329DC361C5B4DDD37EB7E59F273830B22ACEA37912；overlay 输出 SHA-256 B9F6268F3E3126426F189F38F1E57FF4CD03D8F9A213305157E1F6842F251103。旧 server/local 配置保留，CSS 保持选择链。
- 公开AMD/VM用例16/16、L01固定原件 material selftest、Web overlay生成4/4、build-input消费者/篡改测试1/1通过。新增两条overlay patcher直接依赖进入build-input contract，runtime provenance测试通过固定原件与generator绑定。
- L02新增真实main分派的合成非法scheme/编码command无动作检查以及windowstate、loaded、video/audio通知、openurl路径保持用例；共18/18通过。当前协议仍未验证sender/referrer，sleep/shutdown语义仍待决定；没有调用系统动作。
- L03核验manifest固定的Host SHA与BAT SHA，并用ilspycmd做静态托管IL检查，未发现两个BAT名称、.bat字样或直接启动调用。托管IL范围外的动态路径/组件消费者及手工用户依赖仍UNKNOWN；因此runtime exclusions和manifest保持未排除这两份BAT。没有执行Host或BAT，也未清理已有安装目录。
- L04移除onLoaded中的Anime4K before-input-event拦截、全局配置rename、隐式Stop及旧Notepad/Shader帮助对话框。新构建不重新分配按键，旧mpv配置不读写；用户指南增加兼容说明。合成按键归属及process-chain测试6/6通过，Next/Stop/Session owner相关回归76/76通过。
- L05通过固定hash item.js/item.html overlays移除旧详情按钮、appSettings.autoplay写入和fromPlayEnded timer；旧autoplay/externalplayers值保留并在存在旧设置时给一次提示。PlaybackManager/PlayQueue/Session/Together未改；item AMD/VM合成4/4、固定material selftest、playback queue/session 76/76通过。
- 任务 Tier 2；主线程保留权限/播放边界和最终审核，两名GPT-6 Luna worker提供只读AppHost及Host IL闭包材料。完整tools/build.ps1、客户端前台、真实Emby、安装、BAT/Host和系统动作均未执行。没有提交、推送、PR、合并或发布。

## 2026-10-14 批次01 CustomCssJS 信任边界候选

- 基线为实时远端 main e862288f10182e60ccb43128e71af755172210c1，在隔离 managed worktree 工作。新增 CustomCssJS.js 固定源哈希 overlay：CSS server/local 选择链保持；旧 JS forced_on、server/local 选择及本地存储数据保留但不执行；只在存在活动旧脚本或 JS 配置损坏时提示一次。JS 配置解析单独捕获，避免坏 JS 偏好阻断 CSS。未扩大到 preload、renderer sandbox、Native IPC 或播放模块重构。
- Task Risk Tier 2；Task Uncertainty：JS 执行入口及固定输入已锁定，Host 与旧用户行为仍有 UNKNOWN；Cross-module Scope：Web 模块、生成器、测试与维护文档；Playback/Session Impact：NONE。主线程沿用会话默认模型，任务接口未暴露具体子型号；两个独立只读闭包审核由 GPT-6 Luna worker 执行。Reason：可信 renderer 中的任意脚本可达 preload 文件/IPC 能力；主线程保留安全合同和最终审查。Escalated：NO。
- 输入 CustomCssJS.js SHA-256 2177DE28DCC4E715F07C63329DC361C5B4DDD37EB7E59F273830B22ACEA37912 与 e862288 runtime-manifest 一致；生成 overlay SHA-256 FD7B862359EB5E48C31A3759BC0B160DF127395B82291D4136B3FF869BC27D7B。定向变换3/3、全 Web overlay 构建准备4/4、AppHost 规范化合同5/5通过；变换输入以 manifest 锁定 vendor 文件验证。完整 runtime build、真实客户端、真实服务器、安装及用户脚本行为未执行。
- 其余批次01候选保持未实现：AppHost 的系统动作仍可由旧协议静态调用，需先确定 legacy 请求停用或显式用户确认合同；两份旧 BAT 的 Carnival Host 固定名依赖为 UNKNOWN，暂不从 runtime 排除；Anime4K 快捷键的按键传递/替代行为未定；外置播放器 timer 的运行时 owner、resume 路由及用户依赖未知。没有执行系统动作、旧 BAT、mpv 全局配置或真实播放。

## 2026-10-14 插件兼容与总排期主线集成

- 用户明确授权合并，范围为已发布插件兼容分支及本地总排期文档。基线为main 080d352、插件分支44816ad；产品源码保持373209b，当前新增提交仅整理状态、总排期和维护记录。经PR合并承接既有17个提交，不改变已发布Tag/附件身份或Stable渠道。
- 复核受影响源码与构建变换范围：维护插件模块、app/viewmanager/router overlay及来源合同；Native Helper、PlaybackManager、Session、CD2/Resolver和锁定依赖保持。历史分支审计只供集成范围判断，研究探针与窗口激活实验不纳入。
- Task Tier 1；主线程沿用用户配置并负责最终diff/核心边界核对，GPT-6 Luna High执行公开离线测试、语法和有限凭据扫描。新增文档执行diff/相对链接检查；已发布源码的923/923及隐藏/包体验证保留原修订归属，不重报为本轮执行。PR及main的实际公开CI结果以GitHub记录为准；未执行前台、系统安装或真实业务操作。

## 2026-10-14 核对主分支集成完整性

- 实时更新远端引用并核对34个PR及最近Release；远端main为080d352，v0.3.2测试版来源373209b，插件分支44816ad比main多17个提交且包含main全部历史。测试版发布不代表分支已合并，最新总排期文档也尚未提交。
- 对129个本地/远端引用进行祖先和patch等价扫描，重点补审生命周期、Stop、IPC边界、构建安全、deadline、CD2刷新、旧Settings、产品身份及远控presentation；CD2和presentation相关候选文件与main的blob一致，旧Settings与身份已由后续实现替代。未发现其他可确认的产品实现漏合；v029观测/延迟及窗口激活研究不整体并入，两个合成安装快照辅助文件的保留价值待判断。
- Task Tier 1，主线程沿用用户配置；只读引用/内容审计worker为GPT-6 Luna High，最终结论由主线程核对。只更新现有状态/维护文档及私有审计结果，保留其余改动；没有产品修改、提交、推送、合并或新发布。执行Git图关系、内容与diff检查，未运行无关产品回归。

## 2026-10-14 汇总整个项目并重排后续批次

- 读取已完成的固定v0.3.2 Web评估和测试版收尾记录，实时核对Release仍为Pre-release、Stable/Latest为v0.3.1；区分产品373209b与收尾文档44816ad。评估当前Web的720文件审计面和A/B/C工作包范围不是实际修改数量或工时。
- 用户澄清范围为整个ETE，不继续安排当前界面版单独验收。已发布修复移出待办，原未执行验证不改写PASS；旧审计L01–L11/M01–M02与已知字幕/音轨延迟、Web评估A/B/C一并纳入。主线调整为旧功能/信任边界 → mpv身份配置 → 内核管理升级 → 实证延迟修复 → Web底座/首页/媒体库/详情搜索；播放连接生命周期、显示硬件、CEC/WOL/发现/启动、安装配置回退与资源收口分批后置。旧v0.3.2清理/mpv建议的编号不再作为现发行范围。CustomCssJS动态执行路径在固定v0.3.2 runtime仍有静态证据，实际启用/执行不在本轮验证；优先复核边界，不推断已利用或运行。
- 计划将原生播放/Session、STRM/CD2和窗口归属保持为固定边界；不把新Web或内核升级视为字幕延迟改善。来源/ABI受阻有可独立推进的工作分支，相关核心区域串行，高风险变量分开候选；当前版不再重复排期，后续实际涉及内核/播放/硬件的改动保留必要回归。内核及控件/首页试点后再给时间区间，外部条件等待单独计入。原旧功能清理与可选能力均仍为候选，不把只读审计自动扩大为删除/改动授权。
- 本轮仅修改ROADMAP、PROJECT_STATUS与此记录，未改产品、vendor、版本或当前客户端，未提交/推送/发布。执行文档范围、相对链接和diff检查；没有重跑无关全量代码测试。Task Tier 1，Playback/Session实际影响NONE，沿用主线程配置。

## 2026-10-14 v0.3.2 测试版发布完成

- 产品来源固定为 `373209b641e966eb0672e54ceb415080cb5f126d`，包含测试材料分组修正；维护插件源码、8 个模块/模板及 3 项 Web 输出与 8d19eb8 完全一致。最终从该已提交源码生成独立 runtime，固定 Native Helper、完整 Electron 44.4.2 和锁定依赖保持。后续本项收尾只记录发布状态，不重标产品来源。
- 完整串行门禁覆盖 97 个常规测试文件及 5 个显式插件材料 selftest，923/923 通过、失败/跳过 0；最终源码[公开 CI](https://github.com/hope140/EmbyTheaterEnhanced/actions/runs/38521023162)的 91 个公开测试文件实测 788/788 通过。JavaScript 248 文件、PowerShell 28 文件、有限凭据模式扫描 299 文本文件和 v0.3.1 至候选完整 diff 检查通过。未将首次 CI 的材料缺失失败或中断运行改为 PASS。
- 最终实际 runtime 的 AMD/DOM 合成检查 104 项通过；连续三次隐藏产品 bootstrap 均加载产品入口，使用独立临时目录及不同新 DeviceId，前台动作 NONE。直接 Electron bootstrap 不是 Host、安装或用户视觉验收；修复基线私有入口另有三次 bootstrap 与三次启动前校验。
- 安装器为 `EmbyTheaterEnhanced-0.3.2-373209b-win-x64-setup.exe`，175700593 字节，SHA-256 `a4c83e3fae09f87da4a1090192096a6cd067cd515bda7e4819212294db05e872`，PE 0.3.2.0、Authenticode NotSigned。固定编译器、来源和 package 校验通过；解包的 2147 个 payload 文件加 manifest 共 2148 项，缺失/额外/哈希差异 0。私有 harness、种子、profile 和已知私人路径未进入公开 payload 或附件。
- Annotated Tag `v0.3.2` 解引用至准确产品提交，功能分支按正常推送更新。[GitHub Release](https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.3.2)为非 Draft、Pre-release，Latest 仍为 v0.3.1。五个附件均匿名 HTTP 200 下载，大小、逐附件 SHA-256 和 GitHub digest 相同；安装器、来源 sidecar、两种校验文件及 Release 正文/说明附件关系一致。v0.3.1 Release 元数据、附件身份和 Tag 保持。
- 前台显示 NOT_CHECKED；Host/系统安装、真实保存/备份/恢复、播放/远控 NOT_EXECUTED；实页未触发的分组说明和窄屏嵌套列表 NOT_EXERCISED。历史 114 次实页/模板/合成模态对照保持 8d19eb8 归属，504 次响应式工作对照保持 e248b59 归属。材料/许可 UNKNOWN 与既有风险状态保持，不把测试版发布当作新合规证明。
- Model Tier 2，Playback/Session Impact NONE，Escalated NO；主线程沿用用户配置保留最终审核/发布，两项审查及测试分组/回归按 GPT-6 Luna High 配置派发，子代理未独立暴露实际路由身份。主线程实际核对 worker diff、原断言保留、无 vendor 正反边界及最终日志后验收。

## 2026-10-14 插件兼容测试版收尾

- 首轮发行候选 5186e69 的本地 875/875 与正式 payload/隐藏门禁通过，但公开 CI 检出 5 项材料依赖测试误入离线集合（788/793，缺失未公开的 Alameda 与 app/view-manager 输入）。将完整 Alameda identity 测试及实际冻结材料的关闭别名顺序测试迁入显式 material-selftest，保留原断言，公开集合继续运行纯合成关闭测试；没有复制 vendor、跳过用例或弱化断言。该候选安装包未发布，后续从修正后的提交重新构建并重新核对门禁。
- 测试迁移定向 10/10 通过；无 vendor 的公开树纯关闭测试 5/5 通过，显式材料测试按预期因缺失输入失败而非跳过。公开选择器发现 97 个测试文件并选中 91 个，6 个既有材料排除合同保持；Alameda 全文件和关闭顺序用例按 Git 文本规范化核对，原断言保持。主线程复核 worker diff、门禁及范围后接管提交与最终发行来源绑定。

- 从 8d19eb8 的 clean 候选继续，核对远端 Stable/Latest 为 v0.3.1、未占用后续版本 v0.3.2。采用既有数字产品版本和 GitHub Pre-release 标记，内置 Stable 更新渠道保持；不增加 beta feed 或安装器版本规则。
- 主线程有界审核 GenericUI、导航事务、取消/代际/owner、受控 overlay 与来源合同；只读 worker 审核 schema/display/错误/关闭组件并执行公开离线回归及材料检查。最终安装器从版本化提交生成新 runtime，另执行来源校验、完整解包文件集合/哈希比较与公开匿名下载回读；准确提交、哈希和最终执行结果写入 Release 来源记录及收尾记录。
- 8d19eb8 正式来源回执包含 114 次后台对照、98/98 定向测试、104 项隐藏 DOM 和 2147 个 payload 文件。已核对四类回执的准确 sourceCommit、experimentalOverlay=false、前台动作 NONE、UI/Command=0 与非读取 HTTP=0。历史 e248b59 的 504 次工作对照/873 项回归不冒充新修订结果。
- 私有入口本轮连续三次隐藏 bootstrap 与三次启动前校验通过，不能记为前台启动 PASS。正式页面回执已核对；旧隐藏 fixture 的 CSS 原始哈希与正式 runtime 不同，因此发行前在新 runtime 上重新执行该门禁，不借用旧结果冒充发行产物。正常测试安装包不携带只读验收 harness、登录种子或 profile，不将私有命令限制混入产品。前台显示、真实业务命令、播放/远控和系统安装保持 NOT_CHECKED/NOT_EXECUTED；未触发的分组说明及窄屏嵌套列表保持 NOT_EXERCISED。
- Task Risk Tier 2；Task Uncertainty 有界；Cross-module Scope 为插件适配、受控构建 overlay 和发行身份；Playback/Session Impact NONE；Escalated NO。主线程沿用用户运行配置。两个只读 worker 按 GPT-6 Luna High 配置派发；worker 自报运行身份仅暴露 GPT-6，未独立确认子型号，因此不把派发配置当作其独立运行时身份认证。高风险正确性、修改、提交和发布由主线程保留。

## 2026-10-14 按钮主次、形状和布局集中核对

- 用户指出网页绿色全宽保存与客户端普通小按钮不同。真实神医页的RED为网页PageSave宽度比1、button-submit=true、胶囊；旧适配宽度比约0.079、普通背景、约0.6em圆角。源因为renderCommands丢失网页btnSave/block及主要动作类，之前组件数量/几何矩阵没有覆盖按钮主次，不能把差异仅归为主题。
- 依据当前网页普通页面DOM与公共Wizard模板映射：PageSave全宽胶囊、enabled时主色；DialogOk主要确认，WizardNext/Finish/Back/辅助步骤中性胶囊；DialogCancel/WizardCancel移到标题栏图标，保留原data-data1、命令、enabled、可访问名称及form验证，不换业务接口。禁用主要操作不保留button-submit。确认区仍位于滚动内容之外，长内容和命令区可达。
- 传统按钮核对另发现Backup主页及Restore/Extract模板保留旧小圆角。受控loader只给实际传统插件stage增加ete-plugin-legacy-page标记，已有维护关闭控件只给所属dialog增加标记；维护CSS限定这些区域的raised圆角，不改变普通设置或全局主题。viewmanager固定输出哈希为6C6A7315C74984F96171149AA2993ED9B276B9E92CBFFC6E1F78DBB8955513E6，冻结base/epoch/signal与owner校验保持。
- 工作按钮矩阵覆盖神医6页、Madby8页的正常/800px/125%，84次；传统7页及2个模板18次；30字段Dialog/WizardNext/WizardFinish的小窗/全屏12次合成对照。主操作宽度比、主色标记/计算颜色、圆角、禁用、普通操作/路径图标、标题栏取消与末字段/按钮可达均分别记录，真实UI/Command及非读取HTTP为0，不点击保存、确认或配置动作。此前响应式504次及873全套结果保持原来源，本次不冒充新源码的全套结果。
- 定向98/98、隐藏104项与语法/diff校验通过；新增保存启用/禁用角色转换、模态主次及取消归属测试、真实隐藏全宽/胶囊几何断言。只读按钮合同审计由GPT-6 Luna High执行，主线程负责接口/模板归属和交付审核；Task Tier 2，Playback/Session Impact NONE。后续严格source-bound构建与产物复验、重复入口验证另记私有回执。

## 2026-10-14 验收入口早期诊断日志合同修正

- 用户再次报告e248b59打不开。只读完整集合比对显示唯一extra为app/x64/electron/debug.log；缺失及哈希变化均0，原日志路径环境绑定仍存在。上次路由修复未覆盖早期诊断日志，不能将一次启动检查通过当成长期入口可用证据。
- 仅私有verify-bundle脚本将这一条已知非代码运行输出从静态集合比较中分离，要求实际为普通文件且路径祖先没有链接，manifest不得将其列为payload；不忽略其他日志/文件，不修改或删掉现场日志，所有2156个静态bundle条目及产品来源仍完整验证。脚本原哈希与manifest备份后精确修改，仅其harness哈希/size重绑定，product sourceCommit保持e248b59。
- 独立虚拟文件系统边界验证4项通过：真实已知日志不阻塞，额外程序文件拒绝、程序字节变化拒绝、日志链接拒绝；既有登录种子及产品字节不改。连续3次启动前检查通过，重复隐藏完整产品bootstrap证据以本轮私有回执固定；机器前台动作NONE，不记录用户已实际成功打开。
- Task Risk/Uncertainty为Tier 1，Playback/Session Impact NONE，主线程沿用现有配置处理这个局部入口修复。没有放宽业务命令、修改真实profile、修改构建来源、推送、发布或安装。

## 2026-10-14 响应式与长内容集中收口

- 用户反馈小窗下页签遮挡说明。真实同尺寸RED为网页首段在131px、旧适配在87px且与页签相交；维护端遗漏原生withTabs类，低于120em时仍用6em而非9em顶部占位。只同步实际导航组的所属view标记及清理，不添加固定像素补偿；保留安全筛选后仍有单个可用页签的既有行为。
- 长表单另确认缺陷：旧Dialog在30个字段时没有可滚动容器，末字段和命令按钮都不可达。维护模板增加独立内容滚动区与固定布局命令区，保留form、验证、ID、canonical object和事件归属；CSS限定维护对话框。公开网页模板与完整合成字段描述符作结构对照，普通/全屏、窄窗125%情况下字段及命令均可访问；没有运行真实保存或对话框业务控制器。
- 传统Chapter Options在部分窄视口的表格向页面外溢出约30–72px；表格组件内部承接固有宽度，保留字段和表格原始内容，整页不再横向溢出。仅传统插件加载前增加已维护CSS依赖；viewmanager输出固定哈希更新为531DA7726914BD3555BC0EC39B834BFCF1A4F4AB6C1F0AE29D000DA1A14305DA，冻结base哈希及epoch/signal/owner门禁保持。
- 当前神医6页、Madby8页、Backup/Chapter四页/Episode Refresh/TheIntroDB合计7个传统页面，按639/640/799/800/1055/1056/1919/1920/1921/2560窗口宽度和1280窗口125%/150%缩放作504次工作对照。核对实际CSS viewport、首文字片段与页签相交、字段几何、整页溢出及长页面滚动；部分系统最小尺寸会取整，报告保留请求尺寸与实际viewport。传统表格的局部滚动不当作整页溢出。
- 首次扩展probe误把容纳整页的分组盒当首文字，并未复位document滚动，导致双方大量伪失败。改用文字片段矩形、真实滚动祖先复位和隐藏绘制等待后重新执行；旧失败receipt保留，不并入绿色结果。只读源码审计另指出分组说明间距、窄屏嵌套列表两项候选，当前真实页面没有对应内容，记录NOT_EXERCISED，不凭静态样式推断视觉PASS。
- 公开873/873、材料48/48、定向50/50、隐藏101项通过，真实服务UI/Command及非读取HTTP均0。主线程处理布局与加载边界；两项明确只读审计由GPT-6 Luna High完成，Task Tier 2，Playback/Session Impact NONE。正式来源绑定构建、复验及独立客户端身份另由交付回执固定，未做前台或配置业务验收。

## 2026-10-14 普通页面返回控件与错误语义

- 真实网页仪表盘没有底部PageBack按钮，只有未显示的PageSave标准页面按钮；旧适配将元数据中的内部PageBack直接渲染为按钮，点击进入命令接口后被私有验收入口拦截，再显示通用加载失败。用户明确要求改成网页行为。
- 普通Page/RegularPage不再渲染PageBack底部按钮；Dialog/Wizard仍保留对应返回控件，无Caption时使用原Back本地化。页面读取与动作失败分别显示静态提示，后者有中文/默认英文，不含服务器响应详情。键盘PageBack协议的Data=null、ItemId=null保持；更新合成模态按钮测试继续验证该协议，增加普通页面不显示内部按钮的回归。
- 工作实验真实对照均为0个底部PageBack；点击实际顶栏返回箭头成功进入设置页、没有pluginError，UI/Command及非读取HTTP均0。曾研究只允许PageBack的私有守卫，但顶栏返回无需该接口，守卫及测试保存在私有研究目录而未进入产品或交付，原验收限制保持。
- 产品定向29/29、隐藏合成100项和语法通过。Task Risk/Uncertainty为Tier 1，Playback/Session Impact为NONE；明确私有守卫研究由GPT-6 Luna High执行，主线程核对固定Electron上传数据并作最终范围决策；无需改变共享导航、认证、窗口或播放链。来源绑定构建与新独立入口由私有交付回执固定，前台待确认。

## 2026-10-14 仪表盘刷新导航与离页标题

- 首次真实仪表盘协议含6项TabPageInfos；只读WebSocket观察复现5次同PageId/ViewId、IsPageChangeInfo=false且TabPageInfos为空的更新，旧适配顶部持续为0。网页组件对应分支只刷新内容，不清导航；没有执行业务命令，完成的非读取HTTP为0。
- 同一页面的增量通知在缺失/空导航时继承现有普通页面导航，不修改传入通知，不影响有内容的页签更新、Dialog/Wizard或显式页面切换清空。工作实验4次真实更新后导航始终6项。离页只在active且无其他页签owner时清理标题，重复pause不清新标题；迟到响应及新owner保护测试保持。
- 网页/候选对照确认Chapter API自带4个英文页签和传统原生表单，结构差异来自插件模板；ETE从Madby进入该页留下“运行状态”是另一个适配缺陷，已在当前离页清理中修正。保留传统插件布局及宿主主题，不强制改写插件HTML。
- 定向28/28、隐藏真实AMD合成100项及语法通过；Task Risk/Uncertainty为Tier 2，Playback/Session Impact为NONE，主线程沿用当前模型处理导航更新与owner边界，无架构或共享模块修改。正式来源绑定后台复验与独立客户端交付以私有回执固定，前台仍待用户确认。

## 2026-10-14 私有验收入口日志隔离修复

- 新入口启动失败已在同一私有客户端复现：完整集合比对仅多出runtime下debug.log，manifest规定的文件均存在且哈希匹配。用户启动记录为child-exit-failure，不能把此前隐藏启动及dry-run通过视作实际前台启动通过。
- 保留完整校验合同和product sourceCommit=25bef64，只为私有Start/Verify子进程环境显式设置ELECTRON_LOG_FILE，提前创建独立logs目录。原日志移至独立诊断目录；两个脚本经原manifest哈希核对后精确修改，只有对应harness条目的大小及哈希更新，product payload保持。
- 复验bundle完整性PASS、隐藏真实产品bootstrap PASS（授权登录副本已复制、前台动作NONE）、连续两次Start dry-run PASS。额外隐藏Electron探针强制产生固定日志标记，验证日志落入独立运行目录且runtime没有新debug.log，之后bundle再次PASS。入口和桌面目标保持，前台重新打开仍待用户确认。
- Task Risk/Uncertainty为Tier 1，Playback/Session Impact为NONE；沿用主线程运行配置，无架构或产品源码变化。未重新构建产品，私有harness修复以独立哈希回执记录，不更改25bef64产物来源或复用旧机器结果冒充前台证据。

## 2026-10-14 多选弹层高度修正

- 用户反馈五项语言菜单展开高度不一致。读取当前网页组件样式并进行后台绘制的同尺寸真实DOM对照，确认网页虚拟弹层max-height为min(30em,70vh)，旧客户端按calc(98% - top)指定高度且仅有84%上限。1280×900下原五项菜单约630px、网页约395px；工作实验新增限制后约394px，差额来自主题边框。
- 仅修改维护插件CSS，以当前可见插件页与虚拟itemsContainer限定body级弹层；排除全屏模式。没有修改共享actionsheet、选择控件、选项provider、选择值、事件、路由或播放链。隐藏合成100项通过，新增有效上限、离开插件页、普通菜单及全屏菜单的实际计算尺寸边界；定向32/32通过。
- Task Risk/Uncertainty与Cross-module Scope为Tier 1，Playback/Session Impact为NONE；主线程沿用当前运行配置，局部CSS与验收任务无需架构委派。真实非读取请求及UI/Command计数均0，后台结果不代替前台验收。准确提交、源码绑定构建、不同窗口复验及独立客户端交付由本轮私有回执固定。

## 2026-10-14 选择控件垂直几何修正

- 用户反馈选择值落到控件下方与说明重叠。真实神医元数据页及隐藏合成均有RED；旧native selectedName/arrow用隐藏占位行估计标签高度，空标签及换行会失准。
- display只给选择控件父层添加专属类，插件CSS将标签、输入、说明和覆盖层分配网格行；移除覆盖层的隐藏占位，不移动节点、不改选择值/provider/事件或共享vendor CSS。
- 隐藏Electron实际DOM检查选中值、箭头在输入边界内，空标签、180px长标签及原字段/命令契约继续通过，共96项；定向40/40。真实14个控件补齐几何与说明重叠门禁，并在正常、窄窗口、125%缩放对照。
- 保留此前整套证据身份，不将旧水平溢出PASS称为垂直布局PASS；新源码绑定产物以交付回执为准。没有前台自动操作、业务保存、推送、发布或安装。

## 2026-10-13 三插件显示整体收口

- 按用户要求集中对照全部14个GenericUI页、Backup主页与两对话框，以及6个邻接传统页面；真实网页与候选截图、计算样式分别核对，正常、窄窗口和125%缩放均有证据。私有值、服务端原始资源及截图不进提交或共享包。
- 窄display适配复用旧字段编辑器与原开关组件；纯文本和HTML消费者分别保持边界，状态和StandardIcon不解析任意HTML。修正父子图标归属、无标题父组说明、按钮组以及live Boolean替换后的状态Map；Boolean只读/隐藏实际RED后修正，当前隐藏合成92项通过。
- Backup真实模板声明的新关闭组件通过受控AMD别名和插件preparse加载补齐；保留epoch/signal门禁，只关闭所属dialog，不触发表单提交。隐藏动画验证通过后台绘制推进，前台动作NONE。
- 主会话接管模型容量中断后的收尾。定向测试42/42、公开787/787、材料54/54通过；GPT-6 Astra High只读生产审查无明确P1/P2。GPT-6 Luna High完成纯文本/动态来源DOM审计及关闭组件的隔离补丁，主会话核对真实diff和native行为。
- 生成器仅新增close组件加载；固定vendor输入不变，审核生成字节后同步app/viewmanager输出hash，未降低dirty generator、source/runtime provenance门禁。获授权本地提交和来源绑定构建，最终准确身份及回读结果由独立产物清单提供。
- 保留客户端宿主主题、字体与冻结核心。当前用户状态仍为DISPLAY_PARITY_NOT_ACCEPTED，后台检查不替代整体验收；没有发布、部署、安装、远端写入或业务操作。

## 2026-10-13 插件设置兼容候选

- 基线为 v0.3.1 / 080d352。主目录旧 Settings 支线及其已有改动未修改，候选使用独立 managed worktree / codex/plugin-settings-compat。
- Model Tier：Tier 2；Model：主线程用户配置，独立核心审核 GPT-5.6 Sol High，明确测试任务 GPT-6 Luna High；Reason：模块兼容与页面异步生命周期，播放/认证边界冻结；Escalated：无，未重开播放架构。
- 模型选型建议更新为 GPT-6 Luna / GPT-6.1 Sol / GPT-6 Astra，分别对应明确规格执行、跨模块实现与高风险设计/最终复核；既有完成审核保留实际型号。此前 GPT-5.6 Sol High 派发依据为原项目旧 Tier 2 推荐。
- 最终准确候选另交 GPT-6.1 Sol High 做只读审核，范围为本次源码/变换及取消、字段、通知、命令边界；这是一轮独立后续审核，不改写此前审核的型号或结果。
- 真实 frozen viewmanager 的确定性 RED 复现 controller reject 叠页及取消后迟到覆盖。受控变换增加隐藏暂存、取消/代际检查和安全失败清理；独立审核补齐普通/插件混合导航、权限/controller 前置迟到与当前页面 resume 的归属检查。router 仅添加该取消检查，原权限表达式、input/API 与播放模块保持。
- 新维护模块补齐传统两个依赖与 GenericUI 页面、页签、字段、命令、通知、Dialog/Wizard 生命周期。NAS 只读资源用于协议对照；没有复制其实现、执行 DLL、保存设置或触发命令。
- 首轮公开离线测试 741/741；后续公开集合一次运行 760 项，759 通过、1 项旧 transform 断言失败，该断言已同步并在增量集合复测通过。材料层完整适用测试 82/82，最后生成器变更再验 overlay/provenance fixture；最新插件相关增量集合 70/70。按收尾指示保留原始结果，不重复已完成矩阵或合并成一次准确候选全套绿色声明。
- 隐藏 Electron 44.4.2 合成 fixture 42 项通过，真实 AMD/字段编辑器与控件、13 组传统依赖 identity 均有机器证据，配置/命令只发往 loopback。最后取消入口先拒绝已 abort signal；子菜单显示副本安全转义，命令和确认由 canonical metadata 恢复，ItemList 动作提示补齐。真实三个插件前台结果仍待验收。
- 提交前源码绑定构建曾拒绝未提交生成器，门禁保持；该阶段实验未取得正式 package/provenance 通过证据。后续本地提交及构建结果见下方交付记录。

## 2026-10-13 最终审核两项 P2 收口

- 主会话对上一封存修订完成源码/构建差异/receipt 复核及准确公开回归 761/761；该结果保留原修订身份，不作为本次增量源码的全套回归声明。
- responseHelper 失败和取消统一拒绝清理后的 typed Error，只保留静态分类及安全 status；原 response 与 alert/module 错误不向下游传播。
- 插件导航与 GenericUI router 的错误 toast 在实际 AMD 回调执行时重新校验请求归属；新增 deferred 模块测试保留 RED 42/46、修复后 GREEN 46/46。当前有效失败提示及 signal 单独取消均有断言。
- 两项修复由主线程实现，明确 toast 测试由 GPT-6 Luna High 执行；冻结核心、依赖、认证与业务接口保持。后续证据与重新封存文件以本次 P2 报告为准。
- 收口定向 56/56，受影响 overlay/provenance fixture 6/6；隐藏 Electron 45 项通过，其中新增3项直接检查浏览器中的 typed rejection、敏感字段清理及 AbortError 静默。7个受影响脚本语法/有限凭据扫描与 diff-check 通过。旧761/761保持上一封存修订身份，未重复完整公开矩阵。

## 2026-10-13 本地提交与隔离验收交付

- 用户授权精确审核的31文件本地提交及必要状态同步、构建与后台验证。实现提交 d4440ed；仅整理7个测试文件末尾多余空行，保留代码逻辑与原换行。没有推送、PR、合并、Tag、Release、部署或系统安装。
- 提交后公开离线测试 764/764、材料层测试 130/130、隐藏 Electron 合成验证45项通过，前台动作为 NONE。旧761/761继续保留此前封存修订身份。
- 固定输入与完整工具链通过校验，源码绑定构建、2144项 payload 集合和三层 provenance 校验通过；native helper 为正常构建，testing=false。状态同步后从最终提交重新构建，准确交付身份见产物清单。
- 隔离入口在 bootstrap 前绑定 appData、userData、sessionData、temp、日志、crashDumps 与 MPV_HOME，生成新 DeviceId，不复制现用 profile 或凭据。后台探针加载实际主页面并抑制显示调用；启动 dry-run 通过。
- 明确脚本任务由 GPT-6 Luna High 执行，隔离脚本最终只读审核由 GPT-6 Astra High 完成。审核发现的状态文件链接写入、根目录父层重解析边界及 Electron ASAR 物理文件校验问题已修复；环境字典保持对象返回，避免 PowerShell 枚举破坏子进程隔离环境。
- 本验收包直接运行 Electron，不能称为 Host 或安装等价验证。HTTP(S) 护栏限定默认 Chromium session，拒绝 UI/Command 与非浏览请求（登录/能力注册除外）；不证明任意插件 GET 或其它协议都无副作用。真实三个插件视觉、播放及远控结果尚未执行。

## 2026-10-13 真实插件失败复现与修正

- 268598b 的前台三插件结果为 USER_REPORTED_FAIL，静态 fallback 提示不代表修复。旧764/764及合成45项继续保留原来源及覆盖范围。
- 初始授权登录种子与最新已关闭隔离会话的选择比较为 server MATCH、user DIFFERENT；最新副本经只读 API 验证为管理员。仅使用用户授权的登录副本，复制源文件前后哈希保持，不读取其他 profile，不输出身份、URL、凭据或配置值。
- 神医和 Madby 的真实 UI/View 均HTTP200，协议类型为 RegularPage；旧 schema 拒绝该类型，形成明确RED。维护schema仅增加该普通页面枚举并保留wire value，未知类型拒绝保持。
- 真实完整产品路由在 controller-import/view-load 阶段又复现失败。维护模块的 ../../www/modules 相对引用在 Alameda 中形成 ../www/modules 第二身份，得到未初始化的共享实例。仅将三个维护模块的共享依赖改为原 modules/... 身份，自有schema/helper仍使用相对引用；未修改共享模块、认证或播放链。
- 新增最小合成协议与真实 Alameda 身份回归，保留 RegularPage RED及三模块 identity RED。旧fake/hidden registry同步canonical身份，既有行为和安全断言保持。定向35/35、新合同6/6、公共770/770、材料130/130、隐藏45项通过；语法及有限凭据模式扫描通过。
- 工作实验只覆盖四个维护模块，完整产品其余字节保持。真实后台GREEN包括神医/Madby首载表单与各两个额外页签、Backup真实HTML/controller及BackupRestore/BackupInfo HTTP200、普通设置往返；controller和DOM均有证据，每次只有一个可见当前页。实验不冒充source-bound产物；最终提交重建与产物回执另行固定准确身份。
- 本轮风险/不确定性为Tier 2，Playback/Session影响为NONE。主线程沿用用户配置；明确测试及离线检查由GPT-6 Luna High执行，最终源码只读审核为GPT-6 Astra High，本次限定diff未发现明确P1/P2。没有扩大为架构重写。
- 新私有验收入口继续使用独立appData/userData/sessionData/temp/MPV_HOME和新DeviceId，只复制自身布置的已授权登录种子，提供Open.cmd。可分享ZIP不含登录种子或机器_state。所有机器操作均为后台，真实前台结果、Host/系统安装/播放/远控及业务命令仍未执行；没有推送、PR、合并、Tag、Release、部署或NAS业务写入。

## 2026-10-13 页签真实点击与标题修正

- 用户对ceba1fd反馈三个页面能打开，记录为PAGE_OPEN_PASS / TAB_UX_NOT_ACCEPTED；不推断保存、全部页签或视觉已通过。上一轮页签矩阵使用direct router.show，仅保留读取/渲染证据。
- 隐藏完整产品的HTMLElement.click复现RED：正文6个普通anchor，真实点击1次但tabchange/router/UI/View增量均0、目标和返回未提交；应用标题保持上一页。仅取得最小网页GenericUI模块的只读合同标识，未复制实现或私人截图。
- 维护GenericUI复用原maintabsmanager/appheader/approuter的canonical实例，原生居中按钮经tabchange送入原router；正文链接移除，沿用原胶囊与focus样式，不新增全局CSS或overlay。有效普通页面Caption同步页头；header输入转义，document.title为纯文本，Dialog/Wizard保留父页标题。
- 页签元素、异步路由恢复和标题依附controller/代际；通知只重建自己的元数据，pause/destroy不清理新owner。独立审核复现原selectedTabIndex同步派发tabchange导致失败恢复再导航，局部try/finally抑制重入，mock同步派发后原“只导航一次”断言通过。
- 工作实验真实后台点击覆盖神医5个额外页签往返10次、Madby7个往返14次，总24次HTMLElement.click、24次router、24次UI/View；每步PageId、Caption/页头、选中pill、居中及一页可见匹配，离开到普通设置时旧组已清理，业务命令及非只读HTTP为0。实验与后续来源绑定复验分别记录，不能记为前台视觉PASS。
- 定向28/28、公开773/773、材料130/130、隐藏合成45项通过；JS243文件/PS28文件语法、294个tracked文本的有限凭据扫描通过。CI diff wrapper首次缺环境参数属于harness输入错误，按既有合同与有效本地base重跑PASS；工作diff-check通过。
- Task Risk/Uncertainty为Tier 2，Playback/Session影响NONE。主线程沿用用户配置，明确测试由GPT-6 Luna High执行，最终源码只读审核由GPT-6 Astra High执行，恢复重入P2已关闭。没有修改普通设置、播放、认证、窗口、依赖或产品版本。
- 本地提交与来源绑定新产物仍采用独立路径，保留ceba客户端及授权登录副本。直接Electron入口和后台结果不代表Host、安装、真实播放或新修订视觉验收；没有推送、PR、合并、Tag、Release、部署或NAS业务写入。

## 2026-10-12

- 整理 README 与 CHANGELOG，更新 v0.3.0 下载和版本导航。
- 增加用户配置与贡献指南，分离历史内部迭代资料；原件已在仓库外逐文件校验归档。
- 保留版权、第三方通知、固定输入清单、必要技术合同和许可风险事实。Git 历史及既有发行附件保持。
- 验证结果由该文档 PR 的检查记录提供。真实播放、系统安装和完整发行重建不属于此次文档整理的验证范围。
- Release 正文及过时标题整理后，已回读确认附件和 Tag 保持；文档 PR #32 已以 Merge Commit 合并，main CI 通过。

## CD2 新资源整合与 v0.3.1

- PR #33 合入 PR #32 的真实 main，产品与已审核的 2b146ad / 4e183e9 保持；文档冲突沿用精简公开状态。
- 复核 Proto、取消、预算、单次重查、回退及 UA/header 边界；准确候选提交接受完整公开 CI 与独立复核。
- 增加首次冷资源、二次命中、Stop/Next、播放画面及 Session 的隔离验收步骤。六项真实 CD2 验收为 USER_REPORTED_PASS，工程测试与用户反馈保持各自证据边界。
- PR #32、#33 已合并，对应 main 公开 CI 成功。v0.3.1 同步产品版本、下载导航、更新说明和已知限制；运行公开离线测试、语法及凭据检查，结果以发布准备 PR 的 CI 为准。
- 正式产物从最终 main 使用原固定输入及工具链单独构建；发布身份与回读证据保存在 Release 附件及本地审计记录中。
