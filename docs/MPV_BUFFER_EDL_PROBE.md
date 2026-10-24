# 有限缓存片段尾端接回：最小 EDL 实验

**本轮已收尾，停止新跑实验。** 最后写回调补证在Stop后的联合等待超时，字节测量未知；[完整结论、失败定位及后续最少工作](PLAYBACK_BUFFER_RETENTION_CLOSEOUT.md)保留此前AV/基本接续肯定结果，并明确不并入发行。下面的补证准备与调度说明仅是已执行过程记录，不是继续运行的安排。

## 单轮问题与范围

[固定 DLL 的无音和 PCM 双轨有限导出](MPV_BUFFER_EXPORT_RESULT.md)均已实测通过。EDL 第一轮也已完成下述时间轴/轨道观察；传输量仍需区分调度、底层写入和播放器消费。不增加用户入口、不保存新媒体范围、不改变生产内核或 Session。

## 首轮实际结果与解释

普通 GitHub 日志已核对 run `40112880704` / job `120928092858`（controls `e4498e5`）：时间轴/轨道接回通过，virtual duration 8 秒、回退 0、顶层 start-file 1、边界 1.6666667 秒、19 个时间样本；三个 helper 自然退出 0 且 stdio 关闭。仍无声音逐样本采集或视觉无缝验收。

第三 helper 共 8 请求：源文件 33,955,148 字节，实际使用的已存 payload 4,066,400 字节；scheduled 累计 16,920,584、去重 15,079,756，完整响应去重 6,152；已存 payload 的 scheduled 重叠 1,647,032，完整响应重叠 0。因此当时正确结论是 `SCHEDULED_SAVED_PAYLOAD_REREAD_DELIVERY_UNCERTAIN`。已调度的范围不足整个源/整个已存片段，不能说重下了整片；**响应未 finish 也绝不能解释成实际传输 0**。是否有净流量收益尚未与正常原源续播作同条件比较。

这证明一个低成本候选能维持简单源的基本时间轴/音轨，但不证明零重读、逐样本声音连续、真实影片或正常 Emby Session 可透明恢复。

## 最后一次小幅传输补证

保持同一 `buffer-export-edl` 和同一合成服务的 `Readable.pipe(response)`、返回值与背压，仅在 EDL 模式为 response.write 附加完成回调；不加代理、服务、节流、系统抓包或协议选项。每个已成功回调的 body 块按源偏移计数，失败块不作确认，待回调未结算/溢出时拒绝通过。Stop 后等待所属响应关闭且写回调结算；不增加现有时间上限。之前已通过的有限导出只作为 fresh 片段夹具的必要准备，不另重复研究导出能力。

依据 [Node HTTP write 合同](https://nodejs.org/docs/latest-v24.x/api/http.html#responsewritechunk-encoding-callback)，回调表示该块已刷向底层；它不等于 TCP 对端应用或 mpv 解复用器已经消费。日志新增 `callbackFlushedUniqueSourceBytes`、`callbackFlushedSavedPayloadBytes`、`callbackFlushedAllSavedPayload`、失败回调数及 transferAssessment；`clientConsumption` 永远明确为 NOT_MEASURED。旧回执没有这些计数时保持 null/NOT_MEASURED，不追认 0。

本地 Node24.18.1 的实际 loopback 取消对照已完成：受控客户端读 262,144 字节后取消，response finished=false，但 327,680 字节得到成功 write 回调；完整 128KiB Range 对照亦核对了全量回调。它直接证明未完成响应不等于零 body 写入，同时也显示回调数可高于客户端已消费量，不能拿它伪装 mpv 消费证据。这是传输观测器的验证，不是重跑固定 DLL。

该补证已执行 run `40114362940`，在 `edl-stop` 的10秒联合等待失败；网络及写回调字段全为null，不能解释成未发生传输。三个helper均正常退出、stdio关闭。具体 active/pending 分项未记录，当前只定位到观察合同未满足，不猜测是哪一项。本轮停止，不延长timeout、不新增 scope、不重打包，不再排相同输入或增加原生抓包/产品传输层。

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

本轮历史入口为同一 `Public offline CI`：分支 `experiment/playback-buffer-retention`，`range_smoke=buffer-export-edl`、`release_package=false`，只读权限/既有串行组/15分钟job、native120秒/worker100秒。现停止执行，保留代码和固定输入门禁供未来明确选择；不因artifact到期自行换来源或重建。

当前明确建议仍是不把片段当普通用户透明恢复功能。简单源的技术接续已可行；不以部分重读单项就断言完全无收益，但当前没有净收益、逐样本音频、压缩容器/字幕/切轨和真实重新鉴权/Session 的足够证据。若要保持用户期望的相同体验，这些是实际适配与维护矩阵，超出一个缓存开关。保留现有可回退实验，不为凑成功发展通用离线播放器；当前生产版本不纳入自动暂存/接续。媒体授权、server/account/MediaSource/版本变化必须先走已有可信播放路径；本匿名探针不假造这些认证，也不提供正常用户的离线授权入口。
