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
