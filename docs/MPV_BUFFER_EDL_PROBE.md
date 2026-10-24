# 有限缓存片段尾端接回：最小 EDL 实验

## 单轮问题与范围

[固定 DLL 的无音和 PCM 双轨有限导出](MPV_BUFFER_EXPORT_RESULT.md)均已实测通过。现在只问：使用同一固定内核的现成 EDL，把已存片段放回原时间轴，能否跨到原来源尾段并保留音轨；是否仍重复请求已保存的媒体字节？本探针尚未运行，不增加用户入口、不保存新媒体范围、不改变生产内核或 Session。

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

父统一安排同一 `Public offline CI`：分支 `experiment/playback-buffer-retention`，精确提交，`range_smoke=buffer-export-edl`、`release_package=false`。同一只读权限/串行组/15分钟 job；native coordinator 120秒、worker100秒不变。约3–5分钟加原有排队，不重打包或编译内核。原 artifact 到期仍按既有门禁停止，不换来源。

当前明确建议仍是不把片段当普通用户透明恢复功能。若此最低成本 EDL 在合成源已出现时间/音轨问题或明显重读，停止自动接续路线，保留已证实的有限片段技术结论；不为凑成功发展通用离线播放器。若通过且读量有收益，再单独衡量容器、选轨、字幕及可信重新鉴权的接线成本。媒体授权、server/account/MediaSource/版本变化必须先走已有可信播放路径；本匿名探针不假造这些认证，也不提供正常用户的离线授权入口。
