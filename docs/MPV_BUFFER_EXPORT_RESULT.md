# 固定 DLL 有限缓冲导出：实测结果与下一步边界

## 已读回的真实结果

普通 GitHub job 日志已核对：run `40107582483` / job `120912370474`，controls `d7002d43e2fec6f17969ae227a7d8d8ff185d99c`；固定原候选 `162dc69` 加唯一锁定 loader 的派生运行时，原包清单不改。

| 项目 | 本次实际观察 |
| --- | --- |
| 导出 | 33 ms，4,340,662 字节，仅已有缓冲的有限范围 |
| 来源 | 新请求 0、新增 scheduled source bytes 0、completed bytes delta 0 |
| AVI 内容 | 600Hz，25 个非空帧包、599 个空时间槽，总 624 槽；非空 payload 与源逐帧一致 |
| 时间映射 | 源第 16–40 帧（0 起算），源范围 0.6666667–1.7083333 秒；片段起点 0，源偏移 +0.6666667 秒 |
| 生命周期 | Stop 后、原 helper 退出后、新 helper 读取后，文件大小及 SHA 均不变 |
| 解码/退出 | 新 helper 实际解码 320×180、gpu-next、时间推进；两个 helper 均自然退出 0 且 streams closed |

这是有用的肯定结果：**不改内核，现存缓冲能导出为新进程可读的有限媒体片段。** 它不保存原 demux 队列或 HTTP Range，也未证明自动恢复原视频。新 helper 是新的 libmpv 进程；不是整个 Electron 退出再重启、正常 Emby 播放会话、真实 NAS、带音影片或视觉无缝衔接的通过证据。单个约 1 秒/4.3MB 小片段的 33ms，不能外推为整个大缓冲的退出耗时承诺。

首次 run `40106411567` 在同级大小导出后被旧 AVI 检查器误拒；当前实测的 600Hz/空时间槽证实修正方向。首次结果仍保留为未完成，不追认为解码通过。详见[原探针及红绿对照](MPV_BUFFER_EXPORT_PROBE.md)。

## 最小带音轨实验，尚未完成固定 DLL 验证

增加明确的 `range_smoke=buffer-export-av`，仍只允许 `experiment/playback-buffer-retention`，`release_package=false`，相同原包、loader、只读权限、串行组、隔离 profile 和 120 秒 native 上限。原 `buffer-export` 无音模式保持。预计取得 runner 后仍约 3–5 分钟，不重新打包、不运行四模式矩阵。

新输入为 8 秒、320×180/24fps raw 视频 + 单轨单声道 48kHz/16bit PCM 的本地合成 AVI，33,955,148 字节；视频逐帧唯一，音频使用可定位的合成 chirp。只在所属目录生成，不修改原 source plan/原 A/B 夹具，不下载媒体。设置 `ao=null` 只用于该隐藏探针：验证音频解码参数而不依赖云 runner 的物理声卡，不修改系统音频配置。

新增观测：音频全部 PCM 必须是原输入连续样本；分别求音频/视频 source-local 偏移，并检查是否共用同一个偏移（仅允许一个音频样本的量化误差）。新 helper 须同时报告正确的视频及 48kHz 单声道音频解码/选轨；暂停后做一次片段内精确 seek，验证落点和源时间换算，再继续播放到 `eof-reached`，末位置须接近片段末端。偏移不一致、音频样本改变、轨道缺失或解码失败，都不能记成此窄范围成功。先完成文件一致性和新 helper 观测，再把偏移不一致记录为 `export-av-timeline-mismatch`。无音首轮只证实了解码启动和时间推进，未追加“整段 EOF”声称。

首次 AV run `40109620834` / job `120918421295` 的正常日志已读：在 `source-helper`、pendingOption=`ao` 处报 `export-command-failed`，helper 正常退出 0、stdio 关闭，无 timeout；尚未 loadfile、导出或解码，不能作为 dump-cache 失败的证据。旧诊断没有记录属性实际形状或原生错误码，不能反推它究竟是 setter 错误还是比较失败。

固定 [ao.c](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/audio/out/ao.c#L143-L154)声明 `ao` 为 `OPT_SETTINGSLIST`、带 `UPDATE_AUDIO`；[command.c](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/player/command.c#L8292-L8293)处理更新。当前 helper 初始化后、空闲且首次 loadfile 前，通过现有 set-property 设置是可支持的时机，不需新启动协议、用户配置或生产白名单。[m_option.c 的原生 getter](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/options/m_option.c#L3836-L3862)回传的是对象列表：`[{name:"null",enabled:true,params:{}}]`；旧字符串列表比较器必然拒绝这个合法形状，已做修前失败/修后通过对照。

现有 `ete-mpv-helper` 普通启动只接收 DLL、helperId、HWND 三个位置参数，初始化选项在 helper 内固定；controller 没有开放通用 mpv 启动参数。因此不追加 `--ao=null` 到 argv、不开启用户配置或改 argc 门禁来解决探针问题。继续使用上面的现有运行时属性路径，并以真正的 `current-ao=null`、音频参数和 EOF 验证其效果。

修正只接受恰好一个 enabled 的 null driver 且无额外参数/label，仍拒绝其他输出、禁用项或 fallback 列表。新的 `optionStatus` 在普通 summary 直接区分 `set-property`、`get-property`、`readback-validation`、`confirmed`，给出实际类型、条目数、观察到的原生负错误码及固定请求码；未观察到原生码时写 null，不伪造成功 0。原生音频参数、共同时间偏移、seek、EOF 和完整退出门禁均保留，固定 DLL AV 仍待重新执行。

本地**辅助**对照已经执行，可复现：

```sh
node tools/playback-buffer-av-fixture.cjs --control
```

它只使用当前已有 FFmpeg 7.1.5，不安装依赖：输出 4,446,114 字节、视频第 16–40 帧和 50,000 个 PCM 样本，两轨均映射到源 0.6666667–1.7083333 秒，偏移差 0；所有音视频可解码。它证明夹具、解析和映射方法可用，**不能代替固定 DLL 的实际 dump-cache 结果**。默认运行脚本只显示用法；Windows 测试不需要 FFmpeg 可执行文件。

普通 CI 日志直接保留 `mpv-buffer-export-summary:`：variant、audioMapping 的样本数/两轨偏移差/共同映射标记、audioDecoded、clipFormat、文件一致性和进程退出事实。只收集脱敏 JSON，不上传媒体、profile、PCM 或原始日志。

## 重开与切回原源的可用性判断

| 边界 | 当前最小方案与限制 |
| --- | --- |
| 断点/seek | 只能使用音视频共同覆盖的半开区间 `[start,end)`；片段外、恰好末端、未知位置或两轨偏移不一致，返回原 source。实验数学函数不负责鉴权，也不接普通播放 |
| 切回边缘 | 必须把本地位置映射回源时间，不能从原视频 0 秒开始；解码 preroll/关键帧、音频延迟、重复/漏帧仍需实际边缘探针，文件可读并不证明无缝 |
| 音轨/字幕 | 固定 [recorder_create](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/demux.c#L2018-L2040)只选择当时 selected 的流。切其他音轨不能假定片段有对应内容；字幕、侧挂字幕、字体及稀疏 cue 的时间轴不在本 AVI 范围内，应使用原链并保留原 Item/sidecar identity |
| 源身份/版本 | 每次使用前仍须确认 server/account/item/MediaSource/表示版本一致；URL 相同不够。当前仅有探针独占的匿名 loopback/文件 SHA/ETag 身份，不是用户会话鉴权 |
| 权限/账号改变 | 不能凭文件、旧 token、旧 URL 或自行传入的布尔值授权。正常产品必须先走现有可信 PlaybackManager/ApiClient 来源与权限路径；权限未知/失败、账号或服务器切换、版本变化时不加载片段，继续原链允许的行为。尚未给正常 app 加入口，因此没有假造认证提供者来声称通过 |
| 转码/直播/302 | 不能拼接不同表示或把签名 URL 固化为长期索引；本探针不覆盖，正常播放保持原路径 |

可考虑的最低成本接续候选是固定 mpv 已有 [EDL](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/DOCS/edl-mpv.rst)虚拟时间轴，源码 Git blob `aeec4b7b4689679df42d274cda8f51166eab3d06`：原源前段 + 本地片段 + 原源后段有机会维持源时间轴。**尚未实现/执行**。它不是 packet restore，可能提前打开其他段，轨道兼容/媒体身份和 Session 接线仍需验证；不用不稳定的 `no_clip`/`delay_open` 特例去绕过。只有带音轨有限导出先通过，才值得再做一个小的 EDL 边缘探针，记录是否重读已存区间及音画连续性；否则及时停止此路线。

目前推荐：不将有限片段路径当作正常用户透明缓存恢复交付。可研究的替代体验是明确显示可用片段范围，再在边界回原源，但这改变体验，未经确认不增加入口。若要求无差别支持所有轨道/任意 seek/原 Session，现有命令并未提供这些保证；继续会产生每种容器/codec/切轨和版本的维护矩阵。无需因此修改正式内核或累计下载整片。
