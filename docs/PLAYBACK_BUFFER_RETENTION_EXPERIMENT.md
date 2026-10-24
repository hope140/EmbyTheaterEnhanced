# 播放缓冲暂存：独立可行性实验

## 分支与范围

本实验位于 `experiment/playback-buffer-retention`，起点为 `6f76954ea9710c1c87b987180d04d9a793fc0ed4`。起点保留既有研究、固定候选验证工具及预载源码，但本次不修改、集成或发布预载功能。生产 mpv 输入清单与核对时的 `origin/main` `ff92bead401a458f3cc83f3e450f48be97af31b2` 相同；helper 源码存在主线后续 seek 通知差异，本实验没有编译或运行该 helper，也不宣称整个分支等同主线。

目标是保存停止时**仍在原有有界缓冲里的数据**，同视频重开可复用；播放另一视频后才清旧。不补抓、不收集已淘汰数据、不新增用户容量。现有 mpv 前/后向预算语义保持，下一集由独立任务推进。这里没有产品接线、设置修改或新内核。

[已完成的固定内核磁盘实验](MPV_DISK_CACHE_RESULT.md)表明：在那次合成 AVI 中，`cache-on-disk=yes`、`demuxer-cache-unlink-files=no` 留住旧文件，但同/新 helper 重开均新建文件并重新回源。文件保留不等于恢复；磁盘模式的现有容量限制只计 metadata，不能直接照搬为媒体字节上限。

## 三条最低成本路径

| 路径 | 原始依据及能保留的语义 | 代价与缺口 |
| --- | --- | --- |
| 有限 `dump-cache` 导出已有 packet，再以独立片段验证读取 | 固定 mpv 已有命令，不需改内核。只请求有限时间范围，不用持续写入的 `end=no`；导出的是仍在缓存中的包，支持复用 packet payload 的方向 | 重新封装，非原始 Range；缺少透明 restore、原时间轴与缺段回源交接。导出时 RAM 与输出短暂并存，有封装开销；初始同步遍历可能阻塞。先做探针，不能直接交付为完整功能 |
| 来源字节层有界窗口/索引 | FFmpeg、Kodi 有成熟输入缓存结构可参考；无需内核补丁即可做独立来源缓存 | 不知道 mpv 已淘汰哪些 packet，不等于用户原缓冲。直接套用会成为另一缓存层，重复占用或漏掉初始化数据。本实验不重做此前 Range 累计路线 |
| 在 mpv packet owner 内保存/重建活跃队列 | 最接近原缓冲预算/淘汰语义，有机会避免长期重复 RAM 和磁盘层 | 公开 API 无队列恢复；需固定源码补丁、新内核构建和容器定位衔接，维护成本最高。没有获得此构建授权，当前只列边界，不实施 |

优先次序是先验证第一条的有限导出能力；如果它只能形成片段且切回原来源无法保持会话/时间连续，就归档局限，不自动升级到第三条。没有一种已证实可直接满足完整透明重开要求。

## 官方 API 与成熟实现核对

固定生产输入：mpv `dd5d17d3285a095a0f712fa9d116e22a076492de`、API 2.5，DLL SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。固定来源声明不等于完整依赖源码重建证明。

- [mpv 命令说明](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/DOCS/man/input.rst#L1672-L1719)与[缓存遍历](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/demux.c#L4365-L4520)：有限导出与继续录制不同；初始遍历持 demux 锁。现有原型不据此保证取消及时完成。
- [mpv recorder](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/common/recorder.c)：Git blob `1722887b6bdbc451afe2f7911025d17b19d0d0b2`。L244–265 重写 PTS/DTS 后交给 muxer，L288–326 处理不连续并重设基准，L329–350 写 trailer/关闭文件。独立片段不能当作保留原文件偏移的 `.dat`。
- [libmpv stream callbacks](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/include/mpv/stream_cb.h)：输入 read/seek/size/close/cancel，不提供已解复用 packet 队列导入。不能将此 API 当作 restore-cache。
- [FFmpeg n7.1.5 cache.c](https://github.com/FFmpeg/FFmpeg/blob/n7.1.5/libavformat/cache.c)，Git blob `5d71e56f3d7d14b54b53e2a9a9524cd55ae4003a`：逻辑/物理字节索引在内存，打开/关闭临时文件时删除；保留文件仍是 TODO。[官方协议说明](https://ffmpeg.org/ffmpeg-protocols.html#cache)中的 `read_ahead_limit` 限制不可 seek 时的向前读取，不能当作总盘限额或重启恢复接口。
- [Kodi 21.2-Omega FileCache.cpp](https://github.com/xbmc/xbmc/blob/21.2-Omega/xbmc/filesystem/FileCache.cpp)，Git blob `94f7bd966f0e57f6bf58cec5995a526d0d5bd8a0`：L138–188 区分磁盘 simple cache 与有界内存 circular cache；不能把内存环的上限套成磁盘实现。[CacheStrategy.cpp](https://github.com/xbmc/xbmc/blob/21.2-Omega/xbmc/filesystem/CacheStrategy.cpp)，Git blob `7aaeec9fde1c9d3c134ea6754b5e568c77616839`，L101–119 的 Close 删除文件。这些实现不是 mpv 包快照恢复模块。本次未复制其源码、引入新依赖或声称 SenPlayer 开源。

## 首个本地辅助实验：有限重新封装

运行：

```sh
node tools/playback-buffer-remux-experiment.cjs --run
```

脚本使用已有 FFmpeg/ffprobe，生成 8 秒、160×90、12fps MPEG-4 B-frame 视频及 PCM 音频；请求从 2.25 秒截取 2.5 秒并 stream-copy 到独立 Matroska。只读取自建本地文件，输入协议限 file/pipe，不使用账号、URL、真实媒体或网络服务。每个子进程至多 20 秒、总期限 90 秒；固定小输入、输出大小检查、独占临时目录，成功/失败均回收。无参数只报用法，不自动安装依赖。它不是 mpv `dump-cache` 的替代实现，也未构造真实“当时仍存活的包队列”；尤其不能由此证明原生导出不额外回源。

本次 Linux 辅助实验通过：

| 项 | 观察 |
| --- | --- |
| 输入 / 输出 | 535,918 / 205,637 字节；媒体文件 SHA 不同 |
| 视频包 | 原 96，保留 36；保留包 payload SHA 与原序列逐包相同；全部 36 个偏移及 PTS 改变 |
| 音频包 | 原 125，保留 47；payload SHA 与原序列逐包相同；全部 47 个偏移及 PTS 改变 |
| 起点 | 首个视频包源 PTS 2.000、输出 0.208；首个音频包源 PTS 1.792、输出 0.000。不是请求起点 2.25 秒精确切齐 |
| 读取 | 输出全部音视频可解码；未执行原来源缺段接管或 libmpv 恢复 |

工具为已有 `7.1.5-0+deb13u1`；ffmpeg 可执行文件 SHA256 `e8a8d46f5225f3062cec7c07fb145d58ae73c603cb740dcd5bad34bfb54e455a`，ffprobe `cefc5f81c0b18429cdbf8fa5a89e1e9c759235e10f93f9b329ff1b2fdff26f46`。这是辅助工具身份，不是生产 DLL 或全部动态依赖重建身份。不同运行的 Matroska UID 等可使文件 SHA 变化，不以本次输出文件 SHA 作为通过常量。

结论限于：有限片段可以保留压缩 payload 并独立解码，但仍须另存源时间映射、codec/轨道与关键帧边界。不能把片段字节交给原 Range 端点，也不能由解码成功推出无缝衔接、所有容器支持或旧权限仍有效。

## 下一步固定内核探针（未执行，须先由父协调）

只在原固定候选 `162dc69` 加唯一锁定 loader 的既有派生运行时中，沿用[原探针输入门禁](MPV_DISK_CACHE_PROBE.md)，先核对原 artifact 的来源、摘要与未过期状态。使用隔离 profile 与 loopback 小合成媒体；不替换原清单/候选、不编新内核、不重新打完整安装包。若输入过期则报告缺件，不自行换包。总实验保持原 120 秒，所属 helper 必须退出且 streams closed；超时停止后续启动，不以增大期限消除问题。

1. RAM 模式，以小的测试前/后向限额形成一段有效 `seekable-ranges`。不将测试数值设为产品默认。暂停并确认预读停止、源计数稳定；若无法形成稳定快照则失败停止，不把后续读取算成导出成功。
2. 选一个已存在的连续范围，执行**有限 end** 的 `dump-cache` 到 fresh 临时片段。原 helper 的 generic command 是同步/无成功回执，需验证其后属性回复的串行屏障及错误事件，并同时检查文件关闭/完整性，不能仅凭“命令已发”宣称成功；若屏障不足，先报告最小诊断协议需求，不绕过生产白名单。
3. 比较导出期间完成的源请求/字节，确认无额外来源数据；同时记录 packet 时间范围、文件字节和耗时。源码可能同步阻塞，这一项是成本实测，不承诺可用于正常退出。
4. Stop/退出后在新 helper 打开导出片段并验证实际解码/时间映射。此通过项只叫“已有缓存片段可读”，不是恢复原来源。缺段回源、会话保留及音画/字幕连续性单独未验证，不接普通播放入口。

任何将片段变成产品恢复源的后续设计，仍须用当前可信会话重新鉴权和确认 server/account/item/MediaSource/表示版本；不保存 token/签名 URL，不从旧缓存推断权限。未知版本、转码/直播、302 或容器不支持均保留原播放。没有新增用户设置待选；当前缺口是固定内核有限导出与透明衔接证据，而非容量答案。
