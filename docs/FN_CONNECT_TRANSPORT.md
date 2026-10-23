# FNConnect transport 可行性与本地契约

状态：`PROTOCOL_UNKNOWN / MOCK_ONLY`。本项是 v0.4.0 正式版之后的独立准备；不进入当前发布包。后续集成必须先对齐真实 v0.4.0 发布点，不能把开发基线或发布工作分支当作最终 Tag 来源。

目标是借飞牛服务的认证与连接授权，让客户端远程连接 NAS 上的 Emby。FNID、飞牛云账号、fnOS 本地账号、Emby 账号分别保有各自身份；Emby 登录、媒体权限、Session、PlaybackManager 和远控沿用原流程，不做用户映射。

## 官方公开证据

核查日期：2026-10-23。下表区分官方产品说明与第三方接入合同；没有查到合同不等于官方不支持。

| 项目 | 官方已说明 | ETE 接入结论及所缺资料 |
| --- | --- | --- |
| 认证及设备身份 | [远程访问帮助](https://help.fnnas.com/articles/v1/access/how-access)说明 FNID 标识 NAS，服务需飞牛账号；[账号区别](https://help.fnnas.com/articles/v1/contact/account-diff)区分云账号与本地用户；[App 连接](https://help.fnnas.com/articles/v1/start/install-app)说明 FNID 连接后输入 NAS 账号密码 | **未知**：第三方应用注册、受支持的用户授权流程、设备授权范围、回调与桌面平台 SDK。不能假定是 OAuth，也不能把飞牛认证换成 Emby 登录 |
| 连接授权、续期及撤销 | [权益管理](https://help.fnnas.com/articles/v1/access/how-to-set)提供权益绑定/解绑/换绑说明 | **未知**：隧道授权凭证、TTL、续期协议、撤销通知及在途连接终止语义。权益解绑不证明认证凭证撤销 API |
| 多连接 | [服务介绍](https://fnnas.com/fn-connect)标注不限制连接终端设备数 | **部分已知**：不能推断并发隧道/流数、每设备限额、账号并发和限速共享方式；需开发者合同 |
| HTTP Range / 206 / seek | 上述页面未规定任意第三方服务的 HTTP 透明性 | **未知**：Range、If-Range、206/416、Content-Range、流式响应、长连接/超时、字节完整性；媒体 seek 须另以真实 Emby/libmpv 验证 |
| 转码及字幕 | 官方远程观影产品说明不是 Emby 兼容保证 | **未知**：任意 Emby HTTP 方法、请求体、转码分片/停止、字幕流/外挂字幕路径是否可达及限制 |
| WebSocket | 未取得第三方隧道升级或双向通道文档 | **未知**：握手、双向帧、心跳、关闭码、重连与认证边界；不能只代理 REST 后宣布 Session/远控兼容 |
| 直连 / P2P / 中继切换 | [远程访问帮助](https://help.fnnas.com/articles/v1/access/how-access)描述自动选择、App P2P 及不稳定时回退中继 | **产品能力已知，接入未知**：第三方 SDK 能否使用同一路由、路由变化事件及在途流连续性尚无合同；不自行重放 POST 或播放请求 |
| 流量和限制 | [服务介绍](https://fnnas.com/fn-connect)列基础 2 Mbps、高级 12 Mbps/500 GB、专业 40 Mbps/1000 GB；仅中继计量，周期 31 天，额度耗尽回基础带宽；带宽为理论峰值 | **部分已知**：这是查阅当日产品说明，不写死为 ETE 能力；需要可读路由/额度/限速状态、错误码、第三方用途许可及适用版本 |
| 任意服务映射 / 伴随应用 | 没有取得允许 ETE 客户端访问 NAS 上 Emby 服务的正式接口 | **未知**：服务注册、目标端口/路径授权、TLS/证书信任、SDK 分发许可及 fnOS 应用权限。不能由 FNID 子域名证书推出任意 Emby 端口可访问 |

[开发者站](https://developer.fnnas.com/)本次未能读取：网页工具不可达，环境普通 HTTPS 请求在代理 CONNECT 阶段返回 403。没有绕过访问限制、登录、探测私有 API 或联系官方；这只说明本次资料获取失败。未使用论坛方案、抓包、旧客户端黑箱或猜测 URL 作为依据。

## 路线决策与准确停点

**能做**：明确认证与媒体权限边界，准备 ETE 自有抽象契约，以全内存 provider 验证局部生命周期和透明传递需求。

**当前不能交付**：真实 FNConnect 认证、连接授权、任意 Emby 服务穿透或生产 transport 适配器。没有官方协议时不能编造服务端 URL、凭证结构、路由或刷新方法。

**仍未知**：官方是否提供桌面第三方隧道 SDK/API；单客户端是否足够；是否必须注册 fnOS 伴随应用。Emby 插件运行在 Emby 服务内，不能自行解决尚未建立的 NAS 远程连接；它只是后续可能的配对辅助，当前不安装或实现插件。

继续接入所需的最小资料包：

1. 官方公开或明确授权的 SDK/API、适用 fnOS/桌面版本、来源与再分发条款，第三方接入资格及服务用途限制。
2. 应用/设备/服务授权流程、TLS 信任、生命周期、撤销及错误码的协议；确认目标为 NAS 上 Emby 服务且授权粒度足够。
3. HTTP streaming/Range/WebSocket 能力矩阵、并发/带宽/流量规则、路由切换事件与在途请求处理要求。
4. 若官方要求伴随应用：服务注册与 fnOS 应用权限文档。真实验收前再准备经用户授权的隔离测试 NAS；本轮不索取或生成任何凭据。

## 可运行成果

[内存契约](../prototypes/fn-connect/transport-contract.cjs)是 ETE 自有设计草案，**不是官方 SDK 接口**。它位于产品 `src/electronapp` 之外，没有 runtime 导入、UI、配置、IPC、依赖或构建接线。默认 `disabled`；仅显式 `mock` 配合注入的 provider 可运行，`production` 模式直接拒绝。

内部 provider 设计为 `open({deviceRef, signal}) → lease`，lease 必须具备本地合成的 `expiresAt`、`close()`，可声明 `http/range/websocket` 能力及 `exchange(kind, opaqueMessage, {signal})`。缺失能力是 `unknown` 并拒绝调用。它没有认证、续期或远程撤销 API；`invalidate()` 仅使本地租约不可用，不能冒称飞牛服务端授权已撤销。

每次连接独立拥有取消 signal；close 幂等，close 失败可由调用者等待并观察。到期在调用和结果提交时核对绝对时间；过期、取消或关闭后的迟到结果不提交。provider 收到取消但不遵守时，操作仍等待 provider 结算；本草案不保证物理中断或有界清理，不含生产超时/重试策略，也不主动轮询到期。未来真实实现必须明确到期推送、流中断及 drain 截止时间。

`exchange` 只传递不解释的消息/响应。Range fixture 验证请求对象、206/416、头及字节不被修改；WebSocket fixture 只传递内存帧对象，不建立真实握手、socket 或持续流。合成的转码/字幕消息并未调用 Emby，不能证明解码、seek、转码、字幕或远控可用。不实现缓存策略、自动重连或直连/中继切换。

从仓库根目录运行（使用仓库约定的 Node 24.18.1）：

```sh
node --test tests/fn-connect-contract.test.cjs
```

本轮：16 个全内存契约测试通过，0 失败/取消/跳过。未执行官方服务、真实 NAS/Emby、Electron/Windows、播放器、安装器、GUI 或网络协议验收。后续真实接口明确后，必须增加实际传输、媒体及 Session 验收，不能沿用本地 mock 的结果宣传已打通 FNConnect。
