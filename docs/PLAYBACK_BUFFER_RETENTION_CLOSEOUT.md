# 播放缓冲暂存独立实验：阶段收尾与继续验证

## Current result: exact-map experiment positive within explicit limits

A separate fixed-source Linux candidate now has the bounded metadata API, whole-packet sequence validation and positive new-process mapped reading/error/cancel evidence. [Actual source, identity and results](../native/experiments/buffer-retention/README.md) distinguish this from the original DLL and earlier synthetic hash-mapping stages. It supports continued restricted engineering; it is not a reason to enable arbitrary user-media retention or combine it with the preload release. Windows dependency/build/render acceptance and ordinary authenticated replay remain unimplemented. Earlier checkpoint recommendations retain their original timing.

## 当前阶段补充：状态短测通过；普通入口真实映射仍受限

实际run40161248912/job121073089323在a593607通过所述单窗口状态交接、manager重开、新helper读取、lease释放和manager关闭，nativeReaders0；五helper/driver退出及PCM接缝继续通过。该输入不再待测。下一步的普通入口上下文已在源码接到当前ApiClient和选中MediaSource/PlaySession，只做新鲜206鉴权版本及现有buffer观测；未保存/替换普通播放源。

固定mpv源码复核发现真实影片不能沿用合成payload求原偏移法：recorder重写时间基准但公开API不返回精确锚点。无需改内核的有限合成原型仍成立；**任意真实源的透明复用不可由当前结果推出**。不能猜时间轴，canReuse保持false。最小只读导出映射能力及其构建/维护代价见[当前入口合同](PLAYBACK_RETENTION_APP_CONTEXT.md)，须在原生实验范围单独确认后才构建，尚未修改内核。下文各时点结论保留原时点含义。

## 2026-10-25：合成音视频链成立，进入受限存取原型

亲自核对正常日志 run `40158786872` / job `121065729106`、controls `9d8f73a0dad4779abd2987b9aa63c49289b2c7a8`：PCM全局选项回读、两份捕获与比较均通过。baseline/seam各92,066B、45,999样本，起始源样本46,000，接缝80,000附近9,600样本精确一致，assessment=`exact-source-samples-through-seam`。真实取消/替代保持旧ACCEPT/旧Stop/晚字节0，新播放3→3.125秒；五helper和worker均exit0/stdio关闭，无timeout，四个临时文件清理通过。协调者独立artifact回读两WAV同SHA256 `87b42e8783b8f72c7b1b16e2343c136e3fdab45eae3f68c0594ccb8fbb226240`；ZIP artifact `12584793847` SHA256 `8201ef0f576b8d89fdc7425edca31f56ebc468c1fcf8051065395febaaca7745`。这证明固定raw视频/mono48k PCM和untimed文件输出的样本序列，不泛化声卡、任意影片或字幕。

**现在的决定：可继续做受限可用原型，无需改内核；普通产品入口仍不启用。** 有限已有buffer导出、不补抓、Stop与新helper解码、原时间映射/EDL接续、摘要失效回源、取消/替代、样本接缝和资源关闭都有具体肯定证据。不能再把它们统称为“尚待验证”。部分已存payload仍会被原源预取重发，没有同条件净流量收益保证。

新增单窗口状态适配器只接收已验证合成AVI/PCM身份，默认不打开。生产者退出后同文件系统rename收下已闭合export，消除源别名，不再复制媒体字节；原子last.json、同profile根/锁实体绑定、hash/version隔离、显式实际播放代次和可重试清理。Stop/正常关闭保留；另一身份的查询不清理，只有beginActual确认其他视频实际开始才失效旧pointer，活lease延迟删文件。已提交状态可在独立Node进程重开；异步提交过期或插入旧lease不得发布。崩溃遗留writer锁拒绝使用并回原链，不查PID或绕过权限。

明确的新输入`buffer-retention-state`在已有五helper流程中接该适配器：源helper真实退出后交接，manager关闭重开，再由原clip helper读取managed lease路径；后续EDL/PCM共用该lease，全部helper退出后才释放，父侧再次读状态/window/hash，保留一个managed片段，只删EDL/WAV。普通seam模式仍清理全部四个夹具。该新模式尚待固定Windows实测，不冒充完整应用重启：独立Node重开是存储证据，后续新native helper读取是另一项证据。移动后旧excerpt路径不存在，故本模式fallback兼含missing条件；原seam的stale-SHA独立证据保留。

### 距离正常产品还需完成的具体接线

| 工程项 | 当前状态与最小代价 |
| --- | --- |
| 应用播放/Stop归属 | 试验已接真实helper退出和下一helper读取，普通main/service/renderer未导入该Store。需窄主进程操作在当前generation仍有效时dump、保存后再Stop，并在可信core-idle实际播放事件绑定逻辑Item/MediaSource；浏览/准备不能clear。这是跨层顺序接线，不能用通用renderer命令替代 |
| 真实源身份与重新鉴权 | 本原型只承认已知本地合成源hash，不能为真实HTTP下载全片求hash。产品须从已有PlaybackManager/main可信路径取得server/user/MediaSource/版本校验和fresh source；token/URL不落盘，失效/302/转码未知回原链。该适配未完成，未伪造提供者 |
| 用户要的全部当时缓冲 | 现在只保存一个已验证有限窗口，绝不宣称已保存全部活跃packet队列。完整窗口/多范围、关键帧、超大同步导出成本与正常用户已有缓冲上限仍须接内核观测和原设置；不得换成累计下载或新总容量。原型34MiB文件界只是合成8秒输入合同，不是正式默认 |
| 正常退出与崩溃恢复 | 正常close/重开、lease/失败清理已有离线真文件和跨进程证据。stale锁保持fail-closed，正式启动需借已有应用单实例所有权恢复，不能通过任意PID探测/删锁绕过 |

因此最小可用范围是“明确试验开关、固定已知源/有限片段的受控保存与复用”。维护成本目前集中在一个小状态适配器和窄播放入口；若要求任意压缩格式/声卡实时无缝，则另有支持范围工作，不在本轮无上限铺矩阵。下一步只跑该一次状态交接短测，再接可信正常播放入口，不合main或发行。

## 2026-10-25：取消/替代已实证，PCM配置首错修正

实际正常日志 run `40158039095` / job `121063518680`、controls `98e431d3f18e12b9609ab5ef999637320abba573` 已核对。两个真实挂起GET场景均完成：cancel为GENERATION_RETIRED、replace为PROBE_CANCELLED，旧请求关闭、迟到字节0、旧ACCEPT0、旧Stop0；替代播放保留并从3秒推进至3.125秒。前序有限导出/EDL/摘要回退继续通过。四个已启动helper均正常exit0/stdio关闭，外层无timeout。

该次失败严格定位在第四helper的PCM配置：pcm-baseline/export-option-set-failed，pending ao，set-property原生码-9，AO回读空列表；第五helper未启动，WAV/声音样本未采集。安全artifact `12585697274`，ZIP SHA256 `845649feed2c11f898c3bd7b5e25c6f372b91f730b5e008b819ddc1db34c180c`。不能把配置失败归为音频不连续。

先前探针错误地把`pcm:file=...`子参数语法用于AO。固定mpv的ao_obj_list使用global options，并明确拒绝AO子选项；通用长度转义不能改变这条规则。正确链为首次媒体加载前设置/回读独立的ao-pcm-file（原样绝对路径）、ao-pcm-waveheader=true、ao-pcm-append=false，最后单独ao=pcm；getter只接受单个pcm且inline params为空。固定核心注册这些前缀全局选项，并把未标NOPROP的选项暴露为属性，PCM实例在初始化时读取该组；无须新helper命令、Node对象setter或协议/生产白名单扩展。

本次只修上述探针合同和脱敏选项名诊断。静态固定来源与红绿合同回归已核对；尚待下一次同一buffer-export-seam固定DLL确认全局选项实际回读及PCM文件采样。已过的取消/替代实现和证据保持不改；音频结论仍NOT_ASSESSED。

## 2026-10-25：原时间点回退已实证，继续取消与采样

实际正常日志 run `40156520323` / job `121058979516`、controls `0678b702546d15bb2c9639813c4b46acf6152670` 已核对。刻意陈旧片段摘要被拒绝，原目标0.9479167秒回源落在0.9583333秒并推进到1.0833333秒，原8秒时长、一个新start-file、7源请求及A/V解码门禁通过。三个helper正常exit0/stdio关闭，片段/EDL摘要与清理通过。EDL截止实际物理资源全0、closed callback3（历史2/本次1）；成功callback已存payload重叠仍1,581,512B，不追认零重读。音频只证明mono48k解码/轨道映射，取消与声音样本尚无此轮原生证据。安全artifact `12584424883`，ZIP SHA256 `1e82c53e7d8627682d35c65f1d498b772d8147b8bc3b03c43b93a75fb4e8cb3e`。

下一次明确输入`buffer-export-seam`把两个未测点限定为同一匿名合成源：第三helper通过实际挂起GET分别执行Stop与新generation替代，核旧连接关闭、迟到释放不发字节、旧事件不被接受、旧任务不发Stop，且替代播放在3秒处继续；再由两个新helper分别采原源及EDL的PCM文件。固定核心无需新增能力：已有ao_pcm和audio-format=s16可在独立进程内使用，前三helper仍null/volume0，后两helper仅PCM文件/volume100，不更改正式输出或用户配置。

PCM采样条件与普通输出不同：固定驱动是untimed，因此只能证明该解码输出路径的合成源样本序列。先暂停加载并等待FILE_LOADED/PCM AO/mono48k确认，再运行至所选终点EOF；helper实际退出/stdio关闭后才解析最终WAV头。两个捕获必须能唯一对齐原PCM，完整捕获序列保持连续，接缝两侧各至少4,800样本精确一致才记肯定；缺失/重复/改变或基线无法对齐均保留明确否定/不足结论。不能把流程PASS或轨道参数一致说成样本连续，更不能说声卡听觉无缝。

这一输入是准备好的独立实验，不是已完成产品；取消原生回执及PCM测量尚待协调者按精确提交运行。原120/100/10秒、只读权限、并发组、固定candidate/loader门禁不变；未扩大内核、代理或发行范围。

## 2026-10-25：固定Windows分项复验

实际读取 run `40155589157` / job `121056192702` 的正常日志，精确controls `5ec99bdc5c37ce0f5ec32bac897589c3829df008`。安全诊断artifact为`12583649783`，14,521B，ZIP SHA256 `a0630258231956d029f5016bf4a4b57b882cbf8d65ec52c48678d060fd03fc3b`（日志上传回执与协调者独立读取一致）。本次33ms导出4,268,642B，导出阶段三个新增源计数均0；原有PCM映射、seek/EOF、文件不变门禁继续通过。EDL总时长8秒、回退0、19样本、一个顶层start-file、边界1.6666667秒，三个helper全部exit0/stdio关闭。

Stop前响应/套接字/读取流各1；Stop返回及原10秒截止时均0。原始pending一直5，全部属于已关闭响应（历史2、本次3）。因此本次确切阻碍是旧联合条件把“物理资源关闭”和“已关闭响应callback交付”混为一谈，分项后记录为`PHYSICAL_CLOSED_CALLBACK_DELIVERY_UNKNOWN`，仍保留`legacyWaitTimedOut=true`。这复现并解释同类观察器卡点，但不倒填上一次缺分项运行的真实计数。

本次EDL源去重scheduled17,504,588B，成功callback去重17,307,980B；已存payload4,066,400B中，1,581,512B有成功callback，证明至少部分源字节又写向底层。另有3个本次closed callback未返回（其未知区间与saved payload相交0不等于所有流量已测）。客户端消费仍`NOT_MEASURED`，没有同条件原源基线，不能声称零重读或净收益。音频连续性仍`NOT_SAMPLE_CAPTURED`，透明恢复仍`NOT_ASSESSED`。

外层确认worker退出0/stdio关闭后，验证三个helper退出和owner/文件摘要再清理excerpt及EDL；`nativeReaders=0`、两个固定文件已删除。原artifact身份和唯一同包loader派生未变，测试成功不等于产品生命周期已接线。

下一项最小验证仅检查片段失效的原时间点回退：保持canonical片段不变，故意提供陈旧摘要，加载前重验所属源/owner；拒绝片段后由第三helper新generation直接加载匿名原源的file-local start。验证路径、时间/推进、A/V轨道、一个新start-file、源请求和物理Stop，再沿用退出/清理门禁。它不伪造真实Emby重新授权；取消或代次替换不得停止新播放。原生尚未执行。

## 2026-10-25：恢复自主技术验证

下述2026-10-24收尾是历史记录。独立实验现继续排查工具观察合同，不要求用户承担技术验证；不改变“不并入发行”的当前产品结论。该恢复准备时尚无新原生结果；现已得到上节固定Windows分项复验，原失败历史不改写。

最短下一步仍是同一 `buffer-export-edl` 合成测试，不改内核、生产播放或媒体源：Stop前、请求返回后、原10秒观察截止分别记录物理响应/套接字/文件读取流，以及历史/当前响应的待写回调。关闭响应后没有返回的回调仍记为未知；不伪造成功/失败，不把它算作零传输。只有全部物理资源确实关闭，才允许把纯回调观察未结算与资源泄漏分开；活资源、观察溢出和其他错误继续拒绝通过。

Node确定性回归已复现“历史响应关闭、资源全关、回调未返回”会使旧条件超时；这是候选解释，不是对旧Windows运行的追认。新回执能区分这条路径和真正活跃资源。片段末端的半开时间映射另有帧/采样邻点测试；成功实验的临时片段及EDL只在worker和全部helper正常退出、stdio关闭且摘要/所有权复核后删除。该清理仅针对测试夹具，不是产品Stop后清缓存策略；失败证据保留。

Windows调度仍由协调者使用精确分支提交安排；原候选/唯一loader派生及完整性门禁不变，artifact失效必须停止，不能无声换源。后续仍须实际观察时间轴/轨道、写入未知量和资源退出，声音连续性目前仍是 `NOT_SAMPLE_CAPTURED`。

**决定：保留独立实验分支，本轮不并入发行，不开启用户透明暂存。** 基础导出成立；简单合成源有一次完整接续肯定结果，但净收益、完整生命周期稳定性及真实媒体/会话兼容证据不足。此结论不是“技术上永远不可能”，也不是已完成可用产品功能。

## 已成立与未成立的证据

| 固定 Windows 运行 | 实际结论 |
| --- | --- |
| AV `40110840330` / job `120922033457` | 固定 DLL 不补抓地导出约1秒片段；视频24包/PCM48,000样本共同偏移一致，暂停seek、EOF、Stop/退出/重开文件一致性及两个 helper 正常退出通过 |
| EDL `40112880704` / job `120928092858` | 基本原时间轴/轨道接回通过：总时长8秒、无时间回退、一个顶层start-file、三个 helper 正常退出；声音逐样本连续性与正常 Emby Session 未测 |
| 写回调补证 `40114362940` / job `120932483392` | 失败，`edl-stop/export-stage-timeout`；worker退出1/stdio关闭，无外层timeout，三个helper退出0/stdio关闭。前序AV标记仍全部通过；EDL停前8秒/回退0/18样本只是中间观察。网络/写回调数值全未采集，保持null/NOT_MEASURED，不能补成0或PASS |

前一次 EDL：源33,955,148B、使用的已存payload4,066,400B；scheduled累计16,920,584B/去重15,079,756B，已存区间scheduled重叠1,647,032B。完整响应去重只有6,152B/已存重叠0，无法代表取消响应实际传输。该次已调度范围不足整个源或整个已存段，因此也不声称重下整片；没有同条件原源续播基线，净收益未证实。详见[接续实验记录](MPV_BUFFER_EDL_PROBE.md)与[导出/AV结果](MPV_BUFFER_EXPORT_RESULT.md)。

## 最后失败的只读定位

本次 controls 为 `10e0dab7281170116ea568a4639a474110aa1778`。依据正常 GitHub 日志正文和固定源码控制流核对；没有重新执行媒体实验。

固定代码在写入 `edl-stop` 检查点后先 `await client.stop()`，再等待：

```js
server.active.size === 0 && server.pendingWrites() === 0
```

`export-stage-timeout` 由探针10秒轮询期限产生；因此可定位为 Stop 请求返回后的联合等待未满足，不是100秒worker或120秒coordinator超时。`pendingWrites()`累加整场请求，可能包括先前已取消响应；每个计数只在写回调被调用时递减。代码不能把“响应close”自动等同于“每个回调已结算”，也不能把回调等待当作进程仍存活。

回执未分别保存 active数量、pending数量、所属请求以及变化过程，无法确定此次到底是响应仍活跃、取消后的回调未结算，还是组合条件的竞态。新增等待比上一轮更强，且仅这轮带写观测；目前应归类为**探针停止/传输观察合同未满足且诊断不充分**，不能宣称已证实 mpv Stop 或 EDL 核心不稳定。三个 helper 已正常退出，之后执行所属服务收尾路径并结束 worker；现有证据没有显示 native 进程泄漏，不把未结算计数当作活进程。

本地 Node24.18.1 的 HTTP取消测试确实通过，说明有一条取消路径可以观测写回调；它不能覆盖固定 Windows/Electron 的所有取消路径。保留本次失败，不延长timeout、不修改等待/传输代码、不继续调度或补跑，也不把此前的肯定结果撤销或扩大。

## 若未来继续，最少还有三类工作

| 必要事项 | 工作量依据与优先级 |
| --- | --- |
| 可靠观测与净收益 | 先以明确的响应/回调取消终态区分“测量未知”和“资源未释放”，补分项检查点，再与同条件原源续播比较。属于有界工具/生命周期收尾，较小但必须先完成；当前不足以给流量收益结论，不需要因此改内核或抓系统网络 |
| 真正的暂存生命周期和播放归属 | 现仅导出一小段，尚非保存全部当时仍存活的有界范围。需要多范围/时间映射、导出完成/取消与Stop竞争、正常/异常退出的原子提交、空间不足回退、租约保护，以及只在另一视频实际开始后清旧。大缓冲同步导出的阻塞成本未测；还须保留原PlaybackManager/Item/MediaSource/Session/字幕归属。这是跨模块实现，不是加几个设置项 |
| 原源透明兼容与授权 | 压缩视频/B帧/关键帧、AAC等音频延迟、字幕/字体/切轨、边界重复或丢失及真实server/account/媒体版本校验都未覆盖。必须从已有可信播放路径重新授权，不持久保存token/签名URL；302、换签、转码/直播和身份不明来源先回原链。它需要受控格式矩阵及明确产品支持范围，工作量明显高于当前探针 |

这些事项可以先按小范围逐项决定，不给未经依据的精确ETA。如果最终要求严格恢复内核包队列或控制 EDL 的源预取，而公开接口不足，则是另一项需单独批准的新内核/传输设计；本轮不走长期fork路线，也不回到累计整片下载原型。

对用户的可决定建议：下一集预加载继续独立推进；暂存保持研究原型、默认不接产品。若未来接受明确范围的“缓存片段回放”替代体验，可另行讨论；不得把它静默包装成原视频无差别透明恢复。现有mpv缓冲大小含义及用户设置保持，未要求新的总容量或限速参数。

本轮最后源码离线验证为1976项：1966通过、0失败、10平台跳过；它与最后固定Windows补证失败分开记录。此次收尾仅文档核对，没有重跑代码/Native/媒体实验或修改生产配置。
