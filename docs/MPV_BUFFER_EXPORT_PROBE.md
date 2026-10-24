# 固定 mpv 有限缓冲导出探针

## 目的与状态

检验生产 DLL 已有的 `dump-cache` 是否能把**已经在 RAM 缓冲内的一小段**写成可独立解码的文件：不补抓、Stop/退出后文件不变、新 helper 可以读取，并能给出限定合成源的时间轴映射。它不是恢复 `.dat`、原始 HTTP Range 或完整播放会话；不接普通用户播放，不修改生产 helper、内核、缓冲设置或下一集实现。

当前状态：首次固定 Windows DLL 已执行，停在输出检查；后续 Stop/退出一致性和第二 helper 解码尚未执行。只有 `mpv-buffer-export-summary` 的实际字段及两个 helper 退出回执可支持后续结论，不能只凭 workflow success。

首次 run `40106411567` / job `120908912553` 的正常 GitHub 日志已读取：`exportMs=27`、`clipBytes=4340662`，新增请求/新增 scheduled source bytes/完成字节变化均为 0。失败为 `export-inspect/export-packets-invalid`；原 helper 正常退出 0、streams closed，无 timeout。帧映射和三项文件一致性标记尚未测，不能称为可恢复或完整可解码。

检查器的一个可复现缺口是把所有 AVI 视频块视为 24fps 的完整 raw 帧。固定 [mpv timebase 选择](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/common/av_common.c#L126-L152)会把较粗时间基提高精度；24fps 路径可形成 1/1008。成熟上游 [FFmpeg AVI muxer](https://github.com/FFmpeg/FFmpeg/blob/n7.1.5/libavformat/avienc.c#L742-L762)会为 DTS 间隙写零长度视频块，且其 header 路径会将过细时间基限制为 600Hz。这些空块占时间刻度，不是被截短的像素帧。此 FFmpeg 来源是机制/本地对照依据，不是本 DLL 完整依赖重建证明。

本地红绿对照用现有 FFmpeg 的 `-bsf:v setts=time_base=1/1008:pts=PTS*42:dts=DTS*42:duration=DURATION*42` 产生真实可解码 AVI：4,167,286 字节、24 个完整包、576 个零长度块、600 个 600Hz 时间槽。旧解析器报 `export-packets-invalid`；新解析器显式保留空槽、逐帧 payload/顺序/时间位置校验后通过，仍准确映射源第 25–48 帧。未知时间基、非零短包、错位空槽、非连续源帧和超额槽数继续拒绝，不是跳过坏包。

**尚未直接取得首次 Windows 文件的空块/时间基明细，不能断言该文件必然只有这一问题。** 下一次正常日志同时输出 `clipFormat` 的刻度、非空/空块和总槽数；如仍失败，则给首个固定 reason 与数值 offset/actualBytes/expectedBytes/count/rate/scale，不输出路径、任意字符串或媒体数据。修正检查器不会把未执行的 native 解码升级为通过。

## 每轮实验合同

| 轮次 | 假设 / 输入 | 观测与否决条件 |
| --- | --- | --- |
| 本地解析器对照，已执行 | 现有 FFmpeg 7.1.5，192 帧、320×180、24fps、无音频 raw AVI。每帧一个独特标记；有限 stream-copy 一秒 | 实际输出 4,153,462 字节、24 帧，对应源第 25–48 帧（0 起算），逐帧 payload SHA 相同，全部可解码；源范围 1.0416667–2.0416667 秒。只证明解析/映射方法，可重封装帧不等于 mpv 导出通过 |
| 固定 DLL 单轮，待协调执行 | 原候选 `162dc69`、唯一锁定 loader 派生运行时；RAM 前 4 MiB / 后 2 MiB、donate=false，仅测试值。相同 192 帧标记 AVI 由 loopback 提供 | 播放至少 1 秒、暂停后连续源计数稳定，只选单个现存缓存范围内约 1 秒，有限 `dump-cache`。任何新请求或新增 scheduled source bytes 都否决“不补抓”；未知/多段/过短范围不猜测，停止并给固定原因 |
| 同轮 Stop / 新 helper，待执行 | 导出 AVI 的文件摘要、逐帧源索引及原缓存范围 | Stop、原 helper 退出、新 helper 播放后 SHA/大小均须不变；源 helper 和新 helper 均须实际退出 0 且 stdio closed。新 helper 须报告 320×180、gpu-next、播放时间推进及匹配帧数的 duration；任一缺失不记 PASS |

新 AVI 是探针独占目录里的合成输入：先调用现有 raw AVI 生成器，再写唯一帧标记，形成独立 fixture SHA/ETag 和生成关系。原候选、原派生清单、source plan 及其中原始 A/B 夹具均不修改。只有单视频轨、全关键帧、24fps 的这个输入允许按帧号建立 `sourceTime = localTime + sourceMinusLocalSeconds`；不外推到 B 帧、多轨、字幕、转码、变帧率或不连续时间轴。

## 固定输入与执行入口

沿用 [既有磁盘探针](MPV_DISK_CACHE_PROBE.md)和 [loader 派生合同](PLAYBACK_RANGE_LOADER_TRIAL.md)：完整校验原包、原 runtime 每个物理文件及“仅新增同包 loader”的关系，不重写原 manifest。原来源为 `162dc69f9c3438d99508c90321a889b693b6b10a`，artifact `12551020498`，ZIP 164,367,963 字节，SHA256 `b35d89c4d7070bc4e56223802b0db666befbc4623a43f18b8fee5a4ec67083cc`。

2026-10-24 通过正常 GitHub 只读元数据接口再次确认此 artifact 未过期，摘要/来源吻合，当前到期时间为 **2026-10-25 06:20:48 UTC**。调度时仍须重新核对；到期/缺件/拒绝则停，不换来源、不盲重建或重试被拒下载入口。

由父统一安排一次现有 `Public offline CI` 手动流程：

- 分支：`experiment/playback-buffer-retention`，先核精确提交。
- `range_smoke=buffer-export`，`release_package=false`。
- 保持现有 windows-2022、只读 contents/actions 权限、同一个串行组、cancel-in-progress=false，不创建另一并发组。
- 预计取得 runner 后约 3–5 分钟；整个 job 上限仍为 15 分钟，native coordinator 仍为 120 秒，worker 100 秒开始收尾。先跑固定 Electron entry，再只跑本探针，不跑四模式矩阵、不重新打安装包。

这是实验控件的分支入口，主线/default workflow 尚不新增产品能力。本分支没有自行 push 或 dispatch。

## 完成、失败与观察性

使用原 helper 的 generic command API；不向生产 service 白名单增加 `dump-cache`。`mpv_command` 同步完成后才处理随后 get-property，结合原生 [命令完成/关闭目标文件](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/player/command.c#L7295-L7335)合同构成串行屏障；再以 Stop/退出/重开摘要不变和真实读取检查，不能把“已发命令”计成功。始终用有限 end，目标 fresh；禁止 `end=no` 的继续录制。

原 [`dump_cache`](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/demux.c#L4365-L4520)从已有 packet 队列遍历且可能同步阻塞；本轮只测小窗口和耗时，不宣称可以无成本在退出时导出整个大缓冲。上游 [issue 18036](https://github.com/mpv-player/mpv/issues/18036)也记录过“命令报告完成但输出不可播放”的具体报告，因此保留真实解码/内容门禁；该报告不是本固定 DLL 的复现证据。

安全日志直接输出 `mpv-buffer-export-summary:`，包含固定 stage/error、源计数差、导出耗时/字节、帧映射及 helper 退出事实；早期错误从受限日志行投影，不打印原异常、URL、路径或 stderr。artifact 仅包含限量脱敏 JSON 和来源/发布摘要，不上传媒体、profile、环境、原始日志或缓存文件。APPDATA、LOCALAPPDATA、MPV_HOME、TEMP/TMP 都指向所属探针目录；使用 127.0.0.1 随机端口，拒绝带认证头的请求，不接触真实账号/NAS。

通过也只表示“已有缓冲的独立片段可暂存读取”。下一步如考虑替代体验，应明确展示这是片段及其可用范围；从片段缺失处接回原媒体、保留 Emby 会话和音画时间连续仍未验证，不能悄悄作为原视频无缝恢复。精确活跃队列恢复仍需另行评估内核修改的维护成本和授权。
