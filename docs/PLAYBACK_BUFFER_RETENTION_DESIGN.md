# 现有播放缓冲的暂存与恢复：源码核实

## 范围与当前结论

“最后播放缓存”指停止或退出时**仍在播放器缓冲中的内容**，沿用现有有界缓冲的淘汰范围；不是保存整个观看过程中读过的所有字节。停止前不补抓，退出时不继续下载。同一视频重新打开可复用；另一视频实际开始播放后才清旧，浏览和预加载不算播放。下一集仍独立采用 50/60/70/80/90%（默认 70%）与 100/300/500 MB（默认 300 MB），未播放的预载退出即丢弃。

因此不需要再选择一个独立“最后缓存容量”，也不把下一集预算映射成最后缓存大小。现有 Range 原型保存的是来源原始字节，未跟随 mpv packet 淘汰，不能作为上述需求已实现的证据。它继续保持普通启动禁用；正确的身份隔离、请求取消、前台抢占和生命周期测试保留。

以下是固定来源的静态核实和设计边界，不是新内核实现或用户运行环境实测。尚未修改 helper、libmpv、普通播放接线或现有缓冲设置。

## ETE 的现有设置实际控制什么

| 位置 | 已证实的行为 |
| --- | --- |
| `src/electronapp/plugins/mpvplayer/video.html`、`video.js` | Auto 或 300/600/900/3072 **MiB**；保存到 `mpv-demuxermaxbytes`。界面标签写 MB，实际选项带 MiB 后缀 |
| `src/electronapp/plugins/libmpv.js` | 非空值只设置 `demuxer-max-bytes`；未同时设置后向缓冲或磁盘缓存。`getBufferedRanges()` 读取时间范围，不取得 packet 内容或原文件字节映射 |
| `src/electronapp/native-helper/service.js` | 允许该前向上限设置；没有把现有设置变成磁盘配额或持久化接口 |
| `native/mpv-helper/ete-mpv-helper.cpp` | `mpv_create()` 后未启用 `config=yes`、`cache-on-disk`；Stop 使用原生 stop，进程退出销毁 mpv |

固定输入由 [libmpv manifest](../vendor/libmpv-input-manifest.json) 声明为 `dd5d17d3285a095a0f712fa9d116e22a076492de`，客户端 API 2.5，DLL SHA256 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。以下引用均固定到该源码提交；这不新增完整依赖源码重建的证明。

该版本 `mpv_create()` 默认不读配置，需显式启用，见 [client.h L447–455](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/include/mpv/client.h#L447-L455)。结合当前 helper 初始化路径，默认维护链路使用 RAM 中的 demux packet 缓冲。不能依据旧 Pepper 配置搜索文档认定当前 helper 启用了磁盘缓存。

`demuxer-max-bytes` 是前向预读上限；后向已播数据另由 `demuxer-max-back-bytes` 控制。固定源码默认前向 150 MiB、后向 50 MiB，允许后向借用未用前向空间。网络缓存通常先碰字节限制；不是累计读取上限。数据随新读取按范围/关键帧等规则淘汰，已经淘汰的数据不应被“最后缓存”重新收集。见 [选项语义 L4250–4316](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/DOCS/man/options.rst#L4250-L4316)、[默认值 L139–146](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/demux.c#L139-L146)、[淘汰逻辑 L2395–2465](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/demux.c#L2395-L2465)。

例如所选 300 MiB 是前向值，不能把整个缓存精确说成 300 MiB；在上述默认后向配置下，两者名义预算合计约 350 MiB。它不是整个进程 RSS 的硬上限，另有解码器、元数据和技术性越界。实际有效属性本轮未向运行中的 DLL 查询。Auto 的空值路径只省略设置，未显式重置已启动 helper 的旧值；因此也不能把 Auto 一概等同于每次重用上游默认。这是独立配置语义观察，本次不顺带修正。

## 原生磁盘缓存和导出接口的限制

| 机制 | 能做什么 | 不能据此声称什么 |
| --- | --- | --- |
| `cache-on-disk` | 把 packet payload 放临时文件，packet 元数据仍在内存 | 不是可恢复快照。文件只追加，淘汰不回收文件空间；此模式下前/后向上限只计算元数据，不能把现有 RAM 数值直接用作磁盘上限 |
| 临时文件保留选项 | 可改变 unlink 时机 | 不会保存可重建的队列/解复用状态，不能靠保留 `.dat` 跨重启复用 |
| `demuxer-cache-state` | 暴露时间范围、大小等状态 | 不提供 packet 序列化、恢复或原始字节对应表 |
| `dump-cache` | 将当前指定时间范围内已有 packet 重新封装输出；有限 end 不等未来数据 | 输出片段不是原文件字节或内部快照，没有配套 restore-cache；不能直接接上原来源的缺失部分并保持原时间轴 |
| libmpv stream callbacks | 自定义输入的 read/seek/size/close/cancel | 不导出现有解复用缓存，也不把 packet 队列注入新会话 |

磁盘语义见 [options.rst L5513–5537](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/DOCS/man/options.rst#L5513-L5537) 与 [demux/cache.c](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/cache.c)。关闭 demux 会释放队列和 cache，见 [demux.c L1100–1133](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/demux.c#L1100-L1133)。

`dump-cache` 的 `end=no` 会持续追加未来读取，不用于本需求。有限导出仍有实验性封装、尾部不完整和大缓存冻结限制；初始遍历持 demux 锁，仅把客户端命令改成 async 不能保证它及时取消。当前 helper 没有专用导出请求/完成/取消协议，不能只放开命令白名单。依据：[命令说明 L1672–1719](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/DOCS/man/input.rst#L1672-L1719)、[初始导出 L4478 起](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/demux/demux.c#L4478)、[完成与取消 L7295 起](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/player/command.c#L7295)、[stream_cb.h](https://github.com/mpv-player/mpv/blob/dd5d17d3285a095a0f712fa9d116e22a076492de/include/mpv/stream_cb.h)。

## 推荐的真实实现方向：一个缓冲 owner，持久化现存 packet

若严格满足原缓冲复用，推荐先验证**固定内核的缓存持久化扩展**，不再扩展应用层累计原始字节缓存。它需要源码补丁和新内核构建身份，不是原 DLL 加一个设置就能完成，也尚未证明所有 demuxer 均可安全恢复。保留的只是当时仍在缓冲中的时间段：从其他位置重开可能仍需回源，不能保证整个开头或任意 seek 命中；原播放进度记录与媒体数据仍是两回事。

1. 现有 demux 缓冲仍是唯一 owner，沿用实际前/后向逻辑预算和淘汰。payload 使用可复用槽位/有界存储，避免完整 RAM packet 与另一份大磁盘原始媒体同时长期存在；不能直接启用上游只追加的 disk-cache。存储统计继续按原逻辑 packet 字节计量，元数据、写入暂存和恢复残留也须有明确工程边界，不能暗藏累计层。
2. Stop/退出只提交当时仍存活的 packet 和版本化索引，不取新媒体、不补齐文件。正常退出原子提交；异常退出最多恢复此前成功提交的快照，不能保证最后瞬间的数据。删除等待所有 reader/lease 释放。
3. 恢复需要流标识、codec 参数/extradata、packet side data、时间戳/时间基、关键帧、discontinuity、范围和 seek 状态等，不只是 packet 数据文件。解复用器的私有状态不能假定可序列化；应先限制明确支持的容器，失败正常打开原来源。
4. 时间 packet 缺段并非 HTTP 字节洞。需要核心与当前 demuxer 的定位/关键帧回退、重叠去重和时间轴连续性衔接；不能把现有 Range 缺块逻辑直接称为 packet 恢复。此项是首要可行性验证，不提前承诺透明续用。
5. 每次重开通过已有可信会话重新确认授权及 server/account/item/MediaSource/表示版本；同 URL、文件名、旧 token 或快照本身均不能证明可播放。快照不持久保存凭据、鉴权头或签名 URL。URL 换签、302、缺少版本证据、转码/直播和不支持的容器，先走原播放；不跨域传凭据、不混合不同表示。校验失败、空间不足或未知快照格式均放弃保存/恢复并继续原播放，不为保留缓存阻断播放。
6. 下一集预算独立。可保留原型中受限预载/取消/身份隔离的有用部分，但它不得顺带收集当前视频的所有读取。接管时还须避免“未播放的下一集”被提前当作最后实际播放。原 PlaybackManager/媒体版本/Session 与实际 core-playing 归属保持。

## 实施前的最小验证与交付门槛

先在隔离、固定 Windows/libmpv 与合成媒体中回读有效前/后向、donate、cache-on-disk 和缓存状态，分别验证预读、回退 seek、EOF 与 Stop 释放。有限 `dump-cache` 可验证“不多发网络请求地导出已有片段”，但该通过项不能代替透明恢复。

核心扩展首先只证明一种明确静态容器：缓存填满后持续播放磁盘不累计、淘汰 packet 不再恢复、Stop 不取新数据、跨进程恢复相同包/时间轴、缺段正确回源、版本变化拒绝快照、崩溃原子恢复及取消/退出无泄漏。必须给新内核完整来源/补丁/构建与许可材料；不替换旧固定 DLL 或篡改其清单。通过后再评估用户入口与自动下一集验收。

本轮仅源码审查：没有运行以上 native 验证，没有下载真实媒体、操作用户 profile/服务器、构建新包或调度 workflow。既有 Range 的合成 Windows 通过证据仍只证明原始字节复用，不升级为本方案的 packet 快照恢复证据。后续核心改动在具体技术方案复核后进行；当前阻塞是原生恢复能力缺口，不是等待用户另选缓存容量。
