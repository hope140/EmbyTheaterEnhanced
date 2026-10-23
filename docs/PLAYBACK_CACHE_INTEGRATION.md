# 播放缓存最小接线路线评估

后续已实现默认关闭、仅离线主进程配置可启用的完整source适配候选，见 [当前试验合同](PLAYBACK_CACHE_TRIAL.md)。下文保留前期路线评估及120项证据；其中“产品源码未改/尚未接线”描述其当时阶段。应用启动入口、真实鉴权provider及下载器仍未实现。

本轮只评估并验证离线协议合同。产品 `src`、Native Helper、依赖、播放默认值、STRM/Session/队列接线均未修改。新 HTTP 客户端仍在 `tools/prototypes`，缺省关闭，只能访问显式指定的 `http://127.0.0.1:<port>` 同源夹具，单对象上限 4096 bytes，无重定向、连接池或常驻服务。

## 路线比较与收益边界

| 路线 | 是否真正保留/消费媒体字节 | 对缓冲的实际作用 | 当前边界/成本 |
| --- | --- | --- | --- |
| 播放进度/元数据记录 | 仅记录时间、身份、校验信息 | 帮助定位，不能减少媒体读取量 | 不称为媒体缓存；原 Session/进度 owner 保持 |
| 现有 mpv 预读与统计 | 当前实例消费自己的包缓存 | 可覆盖实例内短时网络抖动 | 不代表重启后复用；不保存完整源文件 |
| mpv 磁盘包缓存或录制接口 | 上游有临时包缓存/封装输出能力 | 前者主要转移实例内存占用；后者不自动参与下次读取 | 不是 HTTP 原始字节续传对象；现 bridge 未开放这些入口 |
| 应用按 Range 下载到连续前缀 | 存储精确源字节，续传只下载缺失部分 | 减少下载器的重复传输；播放器若仍读原 URL，不会消费这些字节 | 部分本地文件不是通用可播放 source；尚不能据此宣称减少起播等待 |
| 完整文件就绪后替换最终 source | mpv 只读完整本地对象 | 命中时避免远端媒体正文读取，可能减少起播/seek等待 | 必须事先完整就绪；受容量/时间/带宽制约，本轮没有实播/延迟测量 |
| 部分字节缓存 + 本地 Range 代理或 helper 自定义 stream | 从命中的区间读取，缺失区间再回源 | 才有机会让不完整预加载直接帮助起播/seek，并边播边留存 | 新的传输生命周期、任意 seek/尾部读取、鉴权、取消和故障回退；非最小接线，本轮不实现 |

上游 mpv 的 `cache-on-disk` 是临时包缓存，`stream-record`/`dump-cache` 属于封装输出且有 seek/完整性限制，不是可按原 HTTP offset 拼接的原文件缓存。现 helper 的 `SET_PROPERTIES`/`COMMANDS` 没有开放这些选项/命令，不能直接套用上游功能说明当现有产品能力。[mpv 0.41 稳定手册：缓存](https://mpv.io/manual/stable/#options-cache-on-disk)、[录制](https://mpv.io/manual/stable/#options-stream-record)、[dump-cache](https://mpv.io/manual/stable/#command-dump-cache)。

上游另有自定义只读 stream callback API，包含 read/seek/size/close/cancel，但要求处理阻塞与线程/生命周期；现 helper 没有绑定 `mpv_stream_cb_add_ro`。它是替代代理的研究方向，不是当前固定 DLL 已验证可用的接线；本轮未加载 DLL 或增加符号。[固定 v0.41.0 API 来源](https://github.com/mpv-player/mpv/blob/v0.41.0/include/mpv/stream_cb.h)。

## 推荐：先支持完整对象命中，部分对象继续只作下载准备

这是依据当前 source 替换架构、缺少部分缓存读取接口，以及本轮受控验证提出的最小方案，不是已完成的功能或缓冲收益承诺。

1. 保持默认关闭。用户确定容量/TTL/网络规则后，再设计 main 所属异步 worker，仅为明确下一集且满足规则的 direct-file 做有界下载。初版仅支持同源、无重定向、identity 编码、确定长度及强 ETag；能力不满足即跳过预加载。不能顺手增加任意 headers 或外部地址代理。
2. 复用原 PlaybackManager 的明确下一集确认，快照绑定服务器实例、账号、当前播放 owner、MediaSource/媒体版本及 representation；鉴权代次只控制在途任务。账号相同的凭据更新也要退休旧在途请求。新授权重新证明同一对象后才可接续已有字节，不把 token/URL 签名放进持久索引。
3. 下载前领取调度额度，实际取消时销毁所属请求，并在 finally 释放 writer。所有 chunk 的响应和正文完整验证后再提交 checkpoint。下载到完整长度后才成为可供播放器选择的对象；部分前缀不替换 source，未命中则继续既有原 source/STRM 回退，不等待预加载完成。
4. 每次播放命中仍取得新授权并确认版本/强 ETag/长度，例如通过当前解析出的已授权 URL 做有界 Range 探测。它仍有验证往返，不提供离线授权。401/403、身份不符或不可验证时不能使用缓存；原 resolver/native 链保持原来的错误/回退语义。
5. 在原最终 source 决定点之后、原 `loadfile` 之前，才选择经 main 核验的完整本地对象。Item.Path、MediaSource、PlaySession、队列和事件归属保持。需要单独实现有归属的本地文件 lease/路径接口并验证 helper 可读取，不把当前原型 `acquireComplete().read()` 冒充已接入 mpv。保持媒体字节原样，单独验收外部字幕/字体/sidecar 的原身份、音轨/字幕选择、进度/远控/Together。
6. pin 保持到该媒体真正退休/失败/Stop/helper销毁，避免播放时清理本地文件。既有原型的读取 lease 到 TTL/授权期限会拒绝新读；生产直接路径无法沿用这个逐读检查，必须先决定当前播放超期及撤权规则并专门实现。不能直接把测试 reader 公开为无期限路径。

此方案能保留“预加载完整 → 下一次播放消费 → 上次完整对象暂存”的单一链路。它**不会自动保存当前首次远程播放已读过的字节**。另开下载器镜像当前 mpv URL 会产生重复媒体传输，不作为本轮推荐。已有本地 mount 文件也不需要为了“缓存”再复制一份。

若用户的核心预期是大文件只预读少量也能明显减少下一集起播缓冲，完整文件方案可能命中率不足；此时应先确认接受新增 proxy/custom-stream 的复杂度，再做独立合同/原型，不能把当前下载前缀称作已经实现这种收益。

## HTTP 子集与离线证据

`fixture-http.cjs` 的每次请求只发送有限 Range 与内存中的合成 Authorization，要求精确 206、起止/总长、Content-Length、identity 编码及同一强 ETag。200 可能表示忽略 Range 或 If-Range 不匹配，不能拼到旧前缀；416/401/403/重定向立即拒绝，不自动重试/转发鉴权。每个 chunk 完整后才返回 Buffer，故中断不能提交半块；写入前仍需调用原调度 owner 检查，响应验证不能代替播放代次归属。

If-Range 支持强 ETag，日期作为 validator 另有强度前提。这里刻意拒绝弱 ETag 和 Last-Modified-only，包括理论上可证明强度的日期；这是保守的产品候选子集，不表示 HTTP 禁止日期续传。也不因服务宣称 Accept-Ranges 就信任续传；测试以实际 206 为准。[RFC 9110 §13.1.5](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.5)、[§8.8.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-8.8.2.2)、[§15.3.7](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.7)。

12项回环 HTTP 测试覆盖：正常206及Range/If-Range；URL签名更新后的精确字节续用；ETag/长度变化；弱校验器/仅日期；200/416；范围/编码/长度不符；401/403；禁止重定向；中断保留旧checkpoint后重试；在途鉴权代次改变；取消/关闭；总体超时。跨账号读取另以真实字节 store 拒绝验证。每例分别等待 client socket close、服务端 close 与其所属 socket close，确认零活动请求/遗留连接；不是依靠全局进程名或全局句柄列表推断。

资源/竞态复核另补4例并修正：完成任务的旧 budget 不能写入；遗留 claim 的等待 timer 被取消；取消监听器重入的新确认优先；创建本次 lock 后 fsync 失败关闭 fd 并清理该 lock。原型缓存/调度/HTTP合计43项，加既有 helper/STRM/切集范围共120项通过、0跳过。首次HTTP运行11/12通过，唯一失败是夹具只等待服务端close回调、没有等待所属socket的close事件；夹具修正后12/12及上述120项均通过。保留该失败，不改写为首次全绿。

复现：`node --test tests/playback-cache-store.test.cjs tests/playback-cache-prefetch.test.cjs tests/playback-cache-http.test.cjs tests/native-helper-protocol.test.cjs tests/native-helper-service.test.cjs tests/strm-resolver.test.cjs tests/nexttrack-transition.test.cjs`。仅 Node24.18.1/Linux、小型合成正文、临时目录与本进程回环夹具。未访问真实媒体、NAS/CD2/Emby、账户或付费网络；未验证公网HTTPS/代理/重定向、真实转码、Windows、固定DLL/完整客户端、seek体验、音字幕/Session、性能或安装。

## 用户仍须决定的策略

- **容量**：总逻辑媒体容量、单对象上限、保留几部/几集、最低空闲空间；完整对象方案是否接受超限媒体跳过。
- **期限**：TTL从下载完成还是播放结束起算、保留上次播放多久、正常退出/退出登录是否清理；已在播放的文件到TTL/授权期限后如何处理，撤权是否立即终止当前播放。
- **网络**：是否自动预加载或仅手动、是否限特定网络/禁计费网络、最大速率及突发/总字节、前台缓冲到何种状态才允许、是否允许后台/暂停/最小化时下载；不能假定操作系统能可靠识别所有计费网络。
- **范围与体验**：是否只支持明确下一集/direct-file、是否跟随服务端自动下一集开关、是否接受只在完整就绪时命中、是否值得增加支持部分缓存的传输层。

这些是需确认的产品取舍，不是本轮执行审批阻碍。确定前原型继续关闭，不对真实播放做试验。真实 v0.4.0 发布点及重基仍由发布收尾结果决定。
