# 有限缓存片段尾端接回：最小 EDL 实验

**2026-10-25固定Windows分项复验已完成，下一步为失效片段回退验证。** 2026-10-24收尾及失败证据保留在[阶段结论](PLAYBACK_BUFFER_RETENTION_CLOSEOUT.md)；继续工作只修观察/测试生命周期，不改生产内核、正常播放或既有缓存限额。

## 单轮问题与范围

[固定 DLL 的无音和 PCM 双轨有限导出](MPV_BUFFER_EXPORT_RESULT.md)均已实测通过。EDL 第一轮也已完成下述时间轴/轨道观察；传输量仍需区分调度、底层写入和播放器消费。不增加用户入口、不保存新媒体范围、不改变生产内核或 Session。

## 首轮实际结果与解释

普通 GitHub 日志已核对 run `40112880704` / job `120928092858`（controls `e4498e5`）：时间轴/轨道接回通过，virtual duration 8 秒、回退 0、顶层 start-file 1、边界 1.6666667 秒、19 个时间样本；三个 helper 自然退出 0 且 stdio 关闭。仍无声音逐样本采集或视觉无缝验收。

第三 helper 共 8 请求：源文件 33,955,148 字节，实际使用的已存 payload 4,066,400 字节；scheduled 累计 16,920,584、去重 15,079,756，完整响应去重 6,152；已存 payload 的 scheduled 重叠 1,647,032，完整响应重叠 0。因此当时正确结论是 `SCHEDULED_SAVED_PAYLOAD_REREAD_DELIVERY_UNCERTAIN`。已调度的范围不足整个源/整个已存片段，不能说重下了整片；**响应未 finish 也绝不能解释成实际传输 0**。是否有净流量收益尚未与正常原源续播作同条件比较。

这证明一个低成本候选能维持简单源的基本时间轴/音轨，但不证明零重读、逐样本声音连续、真实影片或正常 Emby Session 可透明恢复。

## 最后一次小幅传输补证

保持同一 `buffer-export-edl` 和同一合成服务的 `Readable.pipe(response)`、返回值与背压，仅在 EDL 模式为 response.write 附加完成回调；不加代理、服务、节流、系统抓包或协议选项。每个已成功回调的 body 块按源偏移计数，失败块不作确认，溢出或活响应待回调时拒绝通过。Stop后在原10秒内同时观察实际响应、套接字、读取流关闭与回调结算。若仅已关闭响应仍缺回调，标记物理资源已关/传输未知，不修改原始pending计数；不增加现有时间上限。之前已通过的有限导出只作为 fresh 片段夹具的必要准备，不另重复研究导出能力。

依据 [Node HTTP write 合同](https://nodejs.org/docs/latest-v24.x/api/http.html#responsewritechunk-encoding-callback)，回调表示该块已刷向底层；它不等于 TCP 对端应用或 mpv 解复用器已经消费。日志新增 `callbackFlushedUniqueSourceBytes`、`callbackFlushedSavedPayloadBytes`、`callbackFlushedAllSavedPayload`、失败回调数及 transferAssessment；`clientConsumption` 永远明确为 NOT_MEASURED。旧回执没有这些计数时保持 null/NOT_MEASURED，不追认 0。

本地 Node24.18.1 的实际 loopback 取消对照已完成：受控客户端读 262,144 字节后取消，response finished=false，但 327,680 字节得到成功 write 回调；完整 128KiB Range 对照亦核对了全量回调。它直接证明未完成响应不等于零 body 写入，同时也显示回调数可高于客户端已消费量，不能拿它伪装 mpv 消费证据。这是传输观测器的验证，不是重跑固定 DLL。

该补证已执行 run `40114362940`，在 `edl-stop` 的10秒联合等待失败；网络及写回调字段全为null，不能解释成未发生传输。三个helper均正常退出、stdio关闭。具体 active/pending 分项未记录，当前只定位到观察合同未满足，不猜测是哪一项。当轮在此停止。2026-10-25继续验证仅补分项诊断与观察合同，不延长timeout、不新增scope、不重打包，也不增加原生抓包/产品传输层。

公开离线测试只能验证时间/字节算术、转义及验收合同；实际 EDL 协议、解码和网络行为必须由下一次固定 Windows 实测决定。现有 Linux 环境无对应 mpv 可执行内核，不以 FFmpeg 或 mock 播放器假冒此项通过。

## 最小接线

- 同一 8 秒 raw AVI + mono48kPCM 合成源，仍由所属 127.0.0.1 随机端口提供，拒绝鉴权头。原 candidate/loader/provenance/profile 门禁不变。
- 先完整复用已通过的有限导出、两轨映射、暂停 seek、EOF、文件一致性和两个 helper 正常退出门禁；导出失败不启动后续 helper。
- 仅为 `edl` 变体保留所属源服务，第三个全新 helper 加载一个 fresh 本地 EDL：原源 `[0,start)`、片段 `[start,end)`、原源 `[end,8)`。EDL 报告总时长应为 8 秒；通过固定 loadfile 的 file-local start 直接落在片段内，不先播放原源 0 秒。
- `end` 向前落在共同覆盖中的完整源视频帧边界，避免 AVI 末端刻度/EOF 舍入；最多放弃末端一个帧区间作接续裕量，不下载补齐。
- 原有 EDL 字节长度转义用于本地路径；只接受这一个匿名 loopback 路径，不接受账号、query/token、外部主机、重定向来源或任意媒体。EDL 文本只留在所属临时目录，不上传或进入长期索引。
- 不开启 `load-unsafe-playlists`，不改变协议/安全限制或使用不稳定的 no_clip/delay_open 特例。如果固定内核拒绝这条合法受控路径，就记录拒绝/失败，不绕过。

## 观测和判定

第三 helper 在片段内暂停落点，先验证源时间位置和 8 秒时长。音频开始解码后，在边界前后采样同一 load 的时间，检查不跳回 0、不发生超过一帧的后退；边界后到达 `end+0.25s`，前后均须为正确视频和 mono48k/null 音轨，且只有一次顶层 start-file。最后 Stop、进程自然退出及 stdio 关闭，片段摘要仍不变。不能把时钟/参数一致说成逐样本声音无缝；null 输出没有采集实际声音，也未进行视觉验收。

原合成文件解析器提供每个视频 payload 和 PCM 样本区间的真实文件偏移。只把 EDL 实际使用的缓存区间算作 saved payload，排除元数据和留给边界的末帧。网络统计仅包含第三 helper 的新增请求，区分：

| 字段 | 含义 |
| --- | --- |
| scheduledSourceBytes / scheduledUniqueSourceBytes | 测试源已读取并交给响应流的累计/去重字节；不冒称 mpv 已消费这些数据 |
| completedUniqueSourceBytes | 完成响应所覆盖的原源去重字节 |
| scheduledSavedPayloadBytes / completedSavedPayloadBytes | 上述区间与已存视频/音频 payload 的交集；不以请求的未发送尾部充数 |
| completedAllSavedPayloadReread / completedWholeSourceRead | 是否在完整响应中重发全部已存 payload / 整个合成文件 |

正常日志 `mpv-buffer-export-summary.edl` 直接给出时间轴、计数、上述网络数值及固定 assessment。`COMPLETED_SAVED_PAYLOAD_REREAD` 明确是已观察到重读；只有 scheduled 重叠则写 delivery uncertain；无重叠写 no reread observed。重复请求在累计字节中保留，在覆盖范围中去重。

本轮 workflow PASS 只表示三进程/解码/时间轴实验完整结束；**网络 assessment 允许给出否定结果**，否则会把一个有价值的失败路线藏成无法解读的通用错误。若时间轴可接续但完整重发已存区域，不能说它达到缓存复用效率目标。若仅在这个简单源中无重读，也不外推到转码、302、Matroska/B帧、多音轨/字幕、用户会话或整个软件重启。

## 调度与决策边界

本轮历史入口为同一 `Public offline CI`：分支 `experiment/playback-buffer-retention`，`range_smoke=buffer-export-edl`、`release_package=false`，只读权限/既有串行组/15分钟job、native120秒/worker100秒。继续验证沿用这一入口，由协调者安排精确提交；不自行dispatch，不因artifact到期自行换来源或重建。

当前明确建议仍是不把片段当普通用户透明恢复功能。简单源的技术接续已可行；不以部分重读单项就断言完全无收益，但当前没有净收益、逐样本音频、压缩容器/字幕/切轨和真实重新鉴权/Session 的足够证据。若要保持用户期望的相同体验，这些是实际适配与维护矩阵，超出一个缓存开关。保留现有可回退实验，不为凑成功发展通用离线播放器；当前生产版本不纳入自动暂存/接续。媒体授权、server/account/MediaSource/版本变化必须先走已有可信播放路径；本匿名探针不假造这些认证，也不提供正常用户的离线授权入口。


## 新 Stop 诊断与夹具清理合同

`edl.stop`保存`before-stop`、`stop-replied`及`settled`或`deadline`独立快照。安全CI摘要直接列出activeResponses/openSockets/openSourceStreams，allPending/livePending/closedPending及historyClosedPending/currentClosedPending；详细回执只含有界请求序号、字节区间和状态，不含URL、账号或任意路径。原请求pipe/背压不变。

- `PHYSICAL_AND_CALLBACKS_SETTLED`：资源及回调均结算。
- `PHYSICAL_CLOSED_CALLBACK_DELIVERY_UNKNOWN`：原10秒观察失败，但物理资源全关闭，仅已关闭响应缺回调。`legacyWaitTimedOut=true`保留这次等待失败；未知区间另计`callbackUnknownSavedPayloadBytes`，不并入成功flush或失败回调，播放器消费仍未测。
- 任何活响应、套接字、读取流或非观察超时错误继续失败，不能用未知标签掩盖泄漏。网络指标仅计本次EDL请求，历史请求只参与资源诊断。

即使某次观察中成功callback为0，也不宣称零传输；`callbackObservationsComplete=false`或unknown范围必须一并解释。确认成功的迟到回调可更新当前观测，不能改写关闭当时的冻结快照。

成功后由外层确认worker实际退出/stdio关闭，独立复核三个helper正常退出，再验证owner、普通物理文件、excerpt与EDL创建摘要/大小后删除两个固定夹具。所有文件先通过检查才开始删除；原合成输入保留。失败或未知运行不触发成功清理。`testExcerptRetirement`只是测试资源生命周期，绝不等于产品缓存保留功能已实现。


## 固定Windows复验与下一项回退边界

run40155589157/job121056192702，controls5ec99bd：Stop返回/10秒截止时实际响应、套接字、读取流全0，closed callback共5（历史2、本次3）；资源关闭与callback交付已分清，未知量仍保留。三个helper均正常退出0/stdio关闭，两个固定测试文件在全部读取者退出/摘要复核后删除。本次成功callback已覆盖1,581,512B已存payload，不能称零重读。完整数值与历史失败区别见[阶段结论](PLAYBACK_BUFFER_RETENTION_CLOSEOUT.md)。

继续沿用同一`buffer-export-edl`输入，仅在已完成EDL Stop后增加一个探针私有preflight fallback阶段，不新开helper/输出窗口、不改生产service的命令白名单。固定原片段/EDL保持不变，传入刻意陈旧的片段摘要，拒绝其作为播放候选；缺失/篡改/越界选择另有离线回归。加载前重新核owner、原合成源摘要及原位置，不接受外部主机、query、凭据或失效源身份。

第三helper开启新generation，通过既有file-local `start`直接加载原匿名源，验证实际path、8秒时长、接近原目标位置且继续前进、320×180视频及mono48k/null音轨、一个新顶层start-file和新增源请求。EDL的事件/网络回执在此前冻结，fallback不会混入其流量统计。每次异步属性返回和后续副作用前校验generation；替代代次出现时，旧finally不stop新播放。单纯取消但仍属于本代次则Stop并等待物理关闭；失败不伪报成功或删诊断。原120/100/10秒不变。新fallback原生行为待协调者按精确提交运行，离线fake只验证编排，不代替native。

PCM采样是另一项有界问题：固定[ao_pcm实现](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/audio/out/ao_pcm.c)可以写WAV/raw，但它标记untimed；现有null输出/volume0条件不能直接用于采集音频。若下一步采样，应单独受控PCM输出与同条件原源对照，核实际格式、截断、边缘样本及文件最终关闭，媒体不上传；该条件仍不等于普通输出的听觉无缝。本批不更改音频输出或内核。


## 下一项短测：buffer-export-seam

原时间点fallback已在run40156520323/job121058979516实测通过：目标0.9479167、落点0.9583333、推进1.0833333秒、原时长8秒、一顶层start-file、7源请求及三正常helper退出。取消/替代与样本连续性不由这次通过推导。

新显式输入仅在独立retention分支允许，release_package=false；旧buffer-export-edl保持原三helper语义。新输入先准备同一有限导出/EDL/fallback夹具，再在第三helper实际挂起一个GET，依次Stop取消与新generation替代到3秒。真实controller退休状态是GENERATION_RETIRED，绑定本次stop/superseded原因；观察从退休之前到全部收尾，拒绝旧代次ACCEPT、额外Stop、迟到发送字节或替代播放被停止。旧响应确已关闭才清理hold，保留原rows证据，不清pending计数。

最后两个独立helper分别对原匿名源与本地EDL运行同一start/end，PCM AO仅写所属baseline.wav/seam.wav。选项为audio-format=s16、volume100、单一pcm/file输出；固定helper只接受标量setter：使用独立ao-pcm-file原样绝对路径、ao-pcm-waveheader=true、ao-pcm-append=false，再ao=pcm；AO inline params必须为空，file另行逐项精确回读，无新协议；其他缓存/核心选项不改。先pause/load，load应答只代表命令/START_FILE，须明确等FILE_LOADED和PCM AO/mono48k后才能unpause至EOF。helper退出并关闭stdio后，严格核最终RIFF长度、mono48k/S16格式、固定PCM GUID、唯一fmt/data及4MiB文件读取上限；合成输入只有8秒，不循环，输出只选约1秒范围，采样不抓真实媒体或设备。

两份捕获各自以唯一512字节起始标记映射原始PCM；检查整份为连续原样本，并对接缝前后各0.1秒（共9,600样本）逐样本比较。基线不匹配不能归罪EDL，位置/覆盖不足不能冒充连续。untimed文件输出不证明普通声卡的实时听感。新PCM/cancel模块均实验私有，不接生产API；不改service白名单。

安全摘要`cancellation`明确phase/cases，`pcmAoSamples`给出限定assessment、源样本起点与数量/文件大小，五helper均须正常退出。比较否定结果允许作为完成测量发布，comparison.ok必须与成功assessment一致；流程PASS不表示接缝通过。WAV和媒体/EDL不进入artifact，只允许有界语义JSON；成功时四个固定临时文件均在五helper/worker实际退出、owner/实体文件/所有摘要检查后清理，任何重定向/改动在第一次删除前拒绝。artifact过期则停止，不换来源、不重打安装包。


## PCM全局选项修正与真实取消结果

run40158039095/job121063518680已实证Stop/替代两个挂起请求场景：旧连接关、晚字节/旧ACCEPT/旧Stop均0，新播放3→3.125秒保留，原四个helper正常退出。PCM尚未进入采样，在ao setter以-9失败，不能讨论接缝质量。

固定源码证据链：[AO列表与global模式](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/audio/out/ao.c)、[PCM前缀和文件初始化](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/audio/out/ao_pcm.c)、[前缀组选项注册](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/options/m_config_core.c)、[普通选项属性桥](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/player/command.c)、[AO子选项拒绝](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/options/m_option.c)。PCM的file/waveheader/append不带NOPROP或PRE_PARSE；全局file值由PCM实例初始化读取。通用子选项长度引用不适用于禁止子选项的AO。

修正仅限首次media前的现有标量属性：先配置全局路径和两个布尔开关，全部读取匹配后单独选择PCM。路径不加CLI引用/百分号转义，不作为AO子参数；冒号/逗号/Unicode由原样字符串传输。AO getter必须是单个启用pcm、空inline params；额外driver/inline file/错误全局路径均拒绝。任何setter错误或readback不符仍失败，不改核心，不静默退其他输出。独立mock红绿回归重现原-9并检查新顺序，不能代替固定DLL后续实测。


## 受限状态交接：buffer-retention-state

固定Windows run40158786872的PCM exact样本、真实取消/替代和五helper退出已通过，详见[肯定证据与产品差距](PLAYBACK_BUFFER_RETENTION_CLOSEOUT.md)。新模式沿用相同源/内核/权限/时间上限，不加格式矩阵或新helper。

只有该显式输入把retentionTrial=true写入精确工具绑定plan。源helper已退出/stdio闭合后，Store收下已验证export（rename，不copy/hardlink），关闭并重新读取原子manifest，以lease路径供后续clip/EDL/PCM。generation取真实NativeHelperClient返回值，源进度与解码门禁仍须先通过；逻辑源仍是同一A，未伪造另一个视频的实际播放事件。五helper全部退出后才释放和close，异常退出未确认则保持隔离不宣称已释放。coordinator再核Store identity/window/文件摘要后，只删除EDL及WAV，单份managed窗口留到所属试验目录结束，不上传媒体。

Store仅实验私有，不被正常应用导入。identity严格是已知合成source/core hash及size，不接URL/token；真实媒体不能靠新增全量hash下载提供该identity。查询miss不改变last，actual播放改变才失效；lease保护退休文件。单writer绑定根/锁实体，遗留锁拒绝且不查PID；原子发布和失败追踪覆盖待提交期间切源/插入lease、foreign owner/lock、next冲突、unlink重试。先验证输入文件只有一个link且导出者确已退出，rename后不保留外部可写别名。正常Stop/close保留，不新增TTL或用户盘额。

试验结果需分层读取：retention.stored/managerReopened/newHelperRead/leaseReleased/managerClosed和retainedWindows=1，仅证明受控有限窗口生命周期。另一个真实视频实际开始的应用事件接线、全当前buffer导出、可信Emby身份/重新鉴权和应用crash恢复仍是产品工程；不能把Node重开说成完整Electron重启，也不把该模式fallback说成纯stale-SHA（旧路径已被移动，missing亦成立）。
