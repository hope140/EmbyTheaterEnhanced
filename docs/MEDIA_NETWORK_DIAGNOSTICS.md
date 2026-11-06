# 媒体网络诊断

最初在 v0.4.15 基线的独立修复分支增加观察，诊断本身不改变来源选择、超时、mpv 缓冲、共享、自动恢复或播放结束策略。同包另含已授权的[完整下载本地优先](LOCAL_DOWNLOAD_PRIORITY.md)。本地验收版本与后续[测试版候选](V0416_REPAIR_TESTING.md)均为 0.4.16，已有同版本由用户关闭客户端后手动覆盖，包以源码提交与 SHA-256 区分。本分支没有下一集预载或播放暂存入口。

## 实际能力与归属

固定 libmpv 为 `v0.41.0-920-gdd5d17d32`、API 2.5，DLL SHA-256 为 `965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c`。本机合成 HTTP/TLS 实测使用 curl 后端。固定源码中的 [curl 日志格式](https://github.com/mpv-player/mpv/blob/dd5d17d32/stream/stream_curl.c)允许在 **debug** 级别观察最终响应探测的 `code`、错误状态与部分 curl 固定错误字符串。本轮不启用 trace；重定向中间状态、链及最终 host 不可采集。FFmpeg 后端、未知前缀／格式和候选内核未通过这些证据取得覆盖。

`mpv_event_log_message` 没有请求、媒体或 generation 标识。同一 helper 的字幕、附属资源、多个流和旧请求迟到日志不能安全归到当前播放。`media-network/engine-observation` 始终为 `association=helper-only`、`resourceRole=unknown`、`generationId=null`、`requestId=UNAVAILABLE`。它是实际引擎网络观察，不保证属于主媒体；不得自动关联到最后一次 load、当前 Item、CD2 RPC 或某个输入 host。时间和同一 helper 仅辅助人工排查。HTTP 状态不表示播放成功，传输截断也可能伴随正常 EOF。两条 HTTP-error／final-probe 记录不表示两次请求或两次失败。

`media-network/load-input` 由 main 在合法 loadfile 提交处记录，继承该 generation/request 的既有归属。`inputEndpointRef` 用 service 生命周期内随机256位密钥，对规范化 scheme、hostname、port 做分域 HMAC-SHA256，截取128位；不包含用户信息、路径、query 或签名。密钥不出内存。该引用只代表**提交的来源端点**，`endpointRole=input-only`、`finalEndpointRef=null`，不能当作重定向终点。原生／本地来源无法生成 HTTP 端点时为 null/unavailable。

## 字段与规则

引擎记录只接受 `kind`、`stage`、`networkError`、`httpStatus`、递增 `sequence`，并添加固定的 `evidenceSource=mpv-log`、`evidenceRule`。状态限 100–599 或 null。规则包括 curl 最终探测、明确 HTTP 错误、固定错误字符串、服务器拒绝 Range、mpv 自身已有重试观察，以及诊断可用性／溢出／抑制。阶段为 response、pre-response、transfer 或 unavailable；分类为固定枚举，未知文本直接丢弃。`retry` 仅报告原 mpv 的观察，没有新增重试。没有把 -13 映射为 DNS、TLS 或 HTTP；旧 playback-error 的输入详情不可归属时仍为 unavailable。

实测覆盖 HTTP 200/206/401/403/404/500、重定向后的最终 200、连接失败、空响应、TLS 证书失败、传输截断及取消销毁。DNS、TLS 握手、超时、发送／读取及 HTTP/2 字符串规则具有合成投影回归，未据此声称均已由真实故障触发。curl 数值错误码、操作系统底层原因、最终 host、完整重定向／请求计数、单条日志的资源身份不可取得。没有观察到状态或错误时保持未知，不补猜，也不能追溯历史故障原因。

## 保密与资源边界

诊断使用独立 libmpv client 队列，每次 poll 最多消费64个事件；不让 debug 日志占用权威媒体事件队列。helper 在原始文本尚未复制／保存前投影，模块限64字节、单行限4096字节，仅允许已核格式。URL、请求头、reason phrase、MIME、任意后缀及未知内容不出 helper。native 每分钟最多64条正常投影，另一次抑制标记；日志／事件队列溢出单独标记。网络帧为非关键且可合并，关键帧容量不足时优先丢弃此可选诊断，不能因诊断占位触发原生播放失败。sequence 的缺口、合并及限流都可能丢失观察，缺行不代表无错误。main 在 timeline 和 logger 之前再次做精确字段／类型／枚举检查，网络记录使用独立限流，避免吞掉原生命周期诊断。

保持 terminal=no，不配置原始 log-file。为覆盖第三方销毁时绕过 mpv logger 的 stderr 回退，helper 在加载库之前把 C stderr 和 Win32 标准错误句柄指向 NUL，失败则在初始化播放器前退出。命令异常不再把 what() 文本送进 protocol-error，而用固定拒绝原因；致命失败保留进程退出码。未增加文件、请求或探测流量。

合成材料测试编译生产 C++ 投影的相同字节，并加载准确 DLL，通过本机 HTTP/TLS 实际请求验证；断言没有额外探测请求，检查控制台／退出 stderr 金丝雀、伪造 URL／头／reason phrase、长文本、未知前缀、洪泛与溢出。`tools/media-network-helper-smoke.cjs` 另通过隐藏的全新 Electron 窗口运行完整生产 Helper，核实日志 client 的创建、poll、销毁及父端诊断接线，并在失败后验证正常播放、暂停／恢复、音量和停止退出。JS 回归检查 A→B／Stop 的迟到日志保持 helper 级、旧 helper 不认领新播放，且字段在日志与导出投影后无敏感金丝雀。完整客户端、真实 Emby/CD2、个人网络和系统安装仍未验收。

## 停止因果与输入地址诊断

播放行为保持原样：普通错误是否在提示后进入下一集、已有转码恢复、队列选择、停止／会话上报与取消顺序均不由诊断决定。`queue-decision` 记录现有自动下一集开关、是否允许 next、是否存在下一项、是否错误及是否返回错误 Promise。`ended-auto-next` 只表示非错误 stopped 分支选择 next，不单独证明 native EOF；须结合同 request/generation 的原生 EOF 记录。

`control-requested` 使用有限 `controlOrigin`、`controlReason`、`callSite` 和操作编号。来源标签包括 OSD、OSD 路由退出、通用输入、Windows 媒体命令、Host 命令、远端 Playstate、manager 和 queue。未携带上下文的调用明确 unknown；Host／通用输入不能反推最初的设备或用户。操作编号在 manager 模块或 adapter 实例内递增，仅在本次运行结合 request/generation 使用，不是跨启动全局 ID。Next 到替换停止、错误提示完成到自动 Next 通过闭包／参数传递，不使用跨异步共享的“当前来源”。其他播放器保持原参数合同。

`stop-requested`、`invalidation-requested` 与 `destroy-requested` 的 `latest-known-at-stop-request` 是失效前同步复制的已有观察：位置、时长、缓存、各自 generation／归属判定、观察时间及最近提交 seek。时间为 renderer 接收观察的墙钟时间，不是服务器或解码器采样时间。旧值仍可展示但归属为 false/unknown，不能用于推导当前剩余量；seek 仍只关联最近提交，不宣称底层确认。日志不发送查询、不 await，也不延后原取消流程。终止缓存观察绕过周期限频。完成记录保留首次实际销毁的快照；重复销毁请求可以有独立请求记录，但只有原物理销毁完成记录。

retire IPC 携带经过有限枚举投影的操作上下文。destroy IPC 的快照只作为诊断输入；main 以现有 endpoint 和保存的实际 retired client/generation 校验关联，无法核实的 claimed generation 保持未关联，不控制播放。`renderer-destroy` 表示 renderer 请求销毁，不表示 renderer 崩溃。完成表示现有销毁 Promise 完成，不扩大原退出保证。

`load-input` 新增可读 `inputHost`、`inputPort`、固定白名单路由段 `inputRoute`；其他路径段统一 `{segment}`，query、userinfo、签名和头不输出。以下引用使用与端点引用相同的 service 内存随机密钥及分域 HMAC，重启不可比较：

- `inputEndpointRef`：协议、规范化主机和端口；同域不同资源仍相同。
- `inputPathRef`：以上字段加规范化 pathname；同路径换 query 签名保持相同。它是路径分组，**不是完整媒体资源身份**：query 可选择不同媒体，path 中的签名变化也会改变该引用。
- `inputLocatorRef`：以上字段加完整 query；用于区别准确提交定位符，不含 userinfo／fragment。签名变化也会变化，不能解释为内容变化。
- `loadAttempt`：service 中每次合法 loadfile 诊断调用递增，结合 helperRun、generationId、requestId 区分尝试；不统计重定向或 mpv 内部请求。

允许字段经真实 logger、重读及导出保留。可读主机包含 IP／私有域名时也会显示，这是地址定位信息；不包含认证头、Cookie、完整链接或任意 path/query 值。`finalEndpointRef=null`，输入信息不能关联 helper-only HTTP 响应，也不能判断最终跳转主机。固定 curl debug 事件仍没有资源标识；本次不启用 trace、不改网络路由、不做代理播放，未做新的 Windows DLL 实验，沿用上文固定后端验证的能力边界。

## 2026-11-06 — 导航停止来源的有限因果诊断

输入 Back/Home 的有限来源按当前播放器与 stream 对象快照记录，参数、调用次数及取消路径不变。Home 的同步 route context 经 WeakMap 传递到异步 view request，仅在实际 viewbeforehide 的同步作用域内读取；请求取消、替换播放、stream 变化或已消费上下文一律 unknown。Stop 的 navigationId 与输入请求记录相连，有限字段经 manager、adapter、native 投影及真实 logger/export 保留；无路径、用户信息或命令原文落盘。

原生 history.back() 到 popstate 没有命令身份，无法可靠证明某次退栈由某个远端/本地命令发起。保留 navigation-requested（input-request-only）区分远端 GeneralCommand 与本地 Back；异步退栈的 Stop 明确 unknown，不用全局最后命令、时间接近、目的 URL 或 pending 队列伪造归属。正常 EOF 自动离开不新增主动 Stop。不改变历史状态、路由参数、播放/停止/取消顺序或版本；仍为 0.4.18。生成运行时测试覆盖取消、无退栈、多导航、晚到、A→B、EOF 及真实落盘/导出。此补足不声称查明历史提前停止的根因。
