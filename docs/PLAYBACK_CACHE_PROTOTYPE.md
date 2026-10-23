# 播放缓存与下一集预加载准备

这是正式版之后的离线原型，不是已启用的用户功能。代码仅在 `tools/prototypes/playback-cache`，没有被产品源码、IPC、构建输入或播放器引用；配置缺省为关闭。缓存容量、过期时间、启用条件和下一集策略尚未决定；试验启用须显式提供全部策略参数。它不使用页面缓存数据层。

## 现有链路与可保留数据

`PlaybackManager` 持有 Item、MediaSource、PlaySession、Session、队列、远控和 Together 生命周期。`plugins/libmpv.js` 的 `playInternal` 取得原 `options.url`，仅对 STRM 调用身份恢复和 resolver，然后把最终 source 交给 helper 的 `loadfile`。STRM DirectUrl/CD2 HTTP/Mount/Native 的回退和取消归属保持原状。`cd2-service.js` 取得 URL、有限 file-local User-Agent 和映射结果，并未下载媒体正文。

`native/mpv-helper/ete-mpv-helper.cpp` 创建独立 mpv 实例，退出时销毁。现有 `demuxer-max-bytes`、`demuxer-readahead-secs`、`demuxer-cache-state` 与 `demuxer-cache-time` 负责实例内预读/统计；现有 bridge 没有导出缓存媒体字节、重开磁盘对象或任意 HTTP 下载命令。不能把播放进度、seekable 时间区间或这些统计称为可跨进程复用的磁盘媒体缓存。既有 helper 没有配置持久磁盘媒体缓存，本原型也不增加相关 mpv 选项。

下一集目前由原 `PlaybackManager` 根据用户的 `EnableNextEpisodeAutoPlay`、服务端返回和 `PlayQueue.getNextItemInfo()` 确定。`enhanced/nexttrack-transition.js` 只为既有 next/previous 提供呈现过渡。缓存或预加载不能自己推测下一集、推进队列、创建 Session 或抢先播放。

“最后一次播放暂存”要保留媒体字节，需要播放读取时的 tee、下载器或能读取持久缓存的传输层。当前 helper 不提供此能力，所以没有可无侵入直接截取的“已播放字节”。仅把 mpv 已加载 URL 再下载一次既不是复用已有缓存，也会争用播放带宽。当前交付先验证字节存储合同，没有宣称已经截取真实播放数据。

## 阶段一：磁盘字节与生命周期

`store.cjs` 的 `createStore()` 默认返回 `{enabled:false}`，不会读取文件系统。显式启用要求独占、物理父目录，以及 `maxBytes`、`maxEntries`、`ttlMs`、`minFreeBytes` 全部参数；没有产品默认策略。它创建专属 `playback-cache-prototype-v1` 目录和 owner 标记，拒绝无归属目录、未知成员、符号链接、硬链接和并发打开。文件权限在支持的系统上为目录 0700、文件 0600；这不代表 Windows ACL 加固。

- 身份覆盖 server/account/item/MediaSource/version/representation。必须使用能区分服务器实例、账号和真实对象版本的身份，不能只用路径或临时 URL；每个字段均参与复合 SHA256。长度和原始强 ETag 也参与身份。盘上仅保留复合 hash、字节 digest、长度和生命周期数值；不保留 URL、headers、账号 ID 原文、ETag 原文或凭据。hash 是隔离索引，不是匿名化或加密；磁盘媒体正文仍是明文。
- 调用者必须提供刚刚验证的授权、direct-file、Range 支持、完整长度、强 ETag 和授权有效期限。原型严格拒绝未知字段、弱 ETag、转码、HLS 和未知长度。该 proof 是调用合同，**本模块不验证 HTTP 或真实授权**；不能把测试输入当服务验证证据。
- 重新认证或 URL 续期后，只有在重新验证相同版本/representation/长度/强 ETag 时才能续用字节。更新后的 URL 和授权留在未来传输任务内存，不进入元数据；旧 lease 在授权到期时停止。退出登录、账号切换等仍需未来 owner 立即取消并释放 lease，不能只等到期。
- `begin` 给出连续前缀 offset，`append(offset, Buffer)` 仅接受精确接续。写正文、fsync 后，以临时元数据文件及同目录 rename 提交 checkpoint。恢复时校验已提交前缀 digest，截去未提交尾部，清理归属明确的孤儿/临时文件；缺字节或 digest 不符则删除该缓存。失败 checkpoint 不能让尾部变成命中。I/O 失败后必须关闭再打开；不会在未知状态继续写入。
- 部分前缀不能作为本地播放 source。只有完整字节对象有 `acquireComplete` 测试读取 lease；读取每次最多 64 KiB。没有生成 mpv 播放路径或 HTTP 响应，没有实现任意 seek 拼接。两个文件之间不构成数据库事务；恢复负责丢弃不一致对象。未实现跨系统断电持久性保证或目录 fsync 的 Windows 语义验证。
- 为每个对象预留完整逻辑长度，配额按所有对象的完整长度求和；另有条目数限额、TTL 和未 pin 的 LRU 清理。活动 writer/reader 都被 pin，不能被清理。当前播放的未来 owner 应持有 reader lease。过期即拒绝读写，释放 lease 后才删除，避免清理破坏活动 owner。
- `maxBytes` 是逻辑媒体配额，不等于文件系统块/元数据开销限额或物理预分配。写入前检查空闲下限，真实 ENOSPC/EIO 仍会失败并保留上个 checkpoint；不承诺与其他应用竞争空间时的硬预留。整个原型只适合本地可信单用户试验，不承诺抵御同权限进程的 TOCTOU 替换或媒体文件篡改。
- 独占 lock 不自动判死或删除。异常退出后，操作者须核对锁内 PID、所属进程和实际退出，再移除本专属目录中的 lock 后重开。不能仅以 PID 不存在的猜测跳过归属核对；自动陈旧锁恢复、跨进程协调尚未实现。

同步磁盘 I/O 和每次追加重新 hash 前缀用于小型受控试验，性能不适合完整影片和生产 main 线程。迁入产品前需异步 worker、增量完整性校验及故障注入验证；现在不引入服务、代理或运行时依赖。

## 阶段二：下一集预加载调度原型

`prefetch.cjs` 同样默认关闭。显式启用须提供 `bytesPerSecond`、`burstBytes`、`maxBytes`、`maxDurationMs` 全部参数；burst 每次最多 64 KiB，这只是原型的有界单块限制，不是用户默认带宽策略。它不调用 Emby/CD2，不推测集号、不取 URL；调用者必须传入所属当前播放 owner、明确下一集 key、确认有效期及受信任的合成 `run` 任务。尚无产品 owner/队列事件接线，代码中的 `confirmed:true` 是合同输入，不能当真实服务返回的证据。

- 同时只运行一个任务；新确认取消旧任务，等待旧任务实际结算后仅执行最新 pending。旧任务即使忽略 AbortSignal，既不能通过 budget 写盘，也不能让新任务并发启动。相同 owner/key/有效期去重；确认消失、Stop/换代/退出等应由未来 owner 调用 `update(null)`/`cancel`/`close`。
- `setForegroundBusy(true)` 取消任务并清除旧确认；解除 busy 不会自动恢复该旧任务。busy 期间收到的新明确确认可等空闲槽，但启动时再次检查确认有效期。实际何时认为播放已稳定、缓冲是否充足、何时允许用户带宽做预加载，尚无产品策略，当前接口仅提供调用合同。
- token bucket 从零开始，任务要在读取前 `await budget.claim(bytes)`，总 claim 不超过任务 `maxBytes`；`budget.append` 再检查未消费额度、owner、取消和绝对期限，然后同步提交阶段一 writer。并发 claim 也不能超额。速率合同允许显式 burst 上限内的突发，不是任意网络流量的硬限速器；注入任务必须遵守先 claim 再有限读取，未受约束的网络调用不能被此模块限流。真实 transport、响应校验和当前播放网络竞争监测尚未实现。
- 任务最长执行时间及确认期限共同限定 deadline；timer 发出 AbortSignal，同时在授予额度/写盘时检查绝对时间，防止事件循环延迟导致过期提交。未来下载实现必须响应 signal、终止所属请求，并在 finally 释放 writer。关闭会等待实际任务结算；对于忽略取消且永不结算的注入任务，不谎称已停止，也不擅自强杀进程。
- 完成结果只留下固定 outcome，不保存 run 返回的 URL、原始异常或媒体身份。合成集成测试演示同一 store 的下一集字节写入后，由下一次显式、有效授权的读取 lease 续用；没有实际自动播放、Session 创建或播放器 source 替换。

## 后续集成方案与决策门槛

可先评估只对已授权 direct-file 做有限完整对象下载，再提供本地只读 source 的窄方案；这仍不能保留当前 mpv 已经读过的字节。若要边播边存并对部分缓存做 seek，需要本地 Range 代理或 helper 传输接口：必须独立设计绑定地址/访问控制、精确 Content-Range/If-Range 校验、重定向与鉴权更新、错误回退、worker/子进程退出归属、超时和带宽竞争。新增这种服务超出当前原型，未实现或启动。

生产传输层须在每次重连/续传确认 206 与起止/总长、同一强 ETag、同一 content-encoding/representation；200、416、弱/变更 validator、转码或容器变化必须停止复用。Range/seek 与转码输出不能普遍拼接；本地 mount 若没有可靠版本校验也不能套用本 HTTP proof。预加载仅使用明确的下一集确认与当前播放许可，不自动触发用户媒体访问。不绕过 DRM，不获取未授权媒体。

尚待决定：容量/TTL/空闲下限、启用和自动清理规则、网络计费/带宽策略、允许的 source 类别、下一集确认与用户设置语义、账号退出/版本变化的失效 owner、部分对象是否值得增加代理，以及 Windows 实际恢复/存储性能。最终正式版确定为 v0.4.0；本准备工作应在真实发布点确定后再 rebase，并重新验证，不能修改发布分支或自行发版。

## 可复现验证与范围

运行 `node --test tests/playback-cache-store.test.cjs tests/playback-cache-prefetch.test.cjs`。所有正文均为临时目录中的短合成 Buffer；注入时钟/磁盘失败，不访问 NAS、CD2、Emby、真实媒体或外部网络。测试覆盖真实字节续写、完整/部分边界、身份隔离、授权到期/续期、无原始敏感元数据、配额/pin/TTL、孤儿/尾部恢复、损坏、空闲空间/ENOSPC、checkpoint 失败及归属守卫；调度覆盖下一集确认/去重、并发额度、速率等待、当前播放优先、换代串行、迟到写入、截止期限、取消/关闭归属、错误收敛、真实可取消等待及同一字节 store 的离线消费。

最终范围回归为 Node24.18.1/Linux 的104项通过、0跳过，其中缓存/调度原型27项。补充真实 Node 子进程写入/退出→另一进程重开读取，以及精确已退出 child PID 的遗留锁核对/显式清理试验，证明的是原型磁盘字节跨进程恢复，仍不表示 mpv 已有这种能力。

这是 Node/Linux 离线单元、受控子进程及本地磁盘证据；不是 Windows 文件系统/ACL、mpv 实播、真实 Range 服务、CD2、播放器跨进程缓存消费、性能、客户端视觉或安装验收。现有播放回归的执行范围单独记录。
