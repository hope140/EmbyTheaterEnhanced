# FNID 第三方客户端证据与真实验证路线

核查日期：2026-10-23。状态为 `PUBLIC_IMPLEMENTATIONS_FOUND / ETE_CONNECTIVITY_NOT_VERIFIED`。第三方客户端支持 FNID 的线索成立，不能再把开发者站不可达作为唯一停点。本文基于项目自己的 README、发行记录、许可证和源码，不把论坛转述当接口合同。

## 有界候选清单

| 客户端 | 固定来源与一手证据 | 证据强度及适用边界 | 许可/复用判断 |
| --- | --- | --- | --- |
| 回声台 fn-music-tv | [README](https://github.com/QiaoKes/fn-music-tv/blob/f25f1aceb5617bf20e94f97190a0b6229083a5c1/README.md)、[ConnectionResolver](https://github.com/QiaoKes/fn-music-tv/blob/f25f1aceb5617bf20e94f97190a0b6229083a5c1/core/data/src/main/kotlin/com/fnmusic/tv/core/data/server/ConnectionResolver.kt) | 有 FNID 解析、候选直连/中继及访问码校验代码；媒体请求用音乐服务自己的 token。证明音乐集成，不证明 Emby 映射 | 根 [LICENSE](https://github.com/QiaoKes/fn-music-tv/blob/f25f1aceb5617bf20e94f97190a0b6229083a5c1/LICENSE)为 GPLv3；未复制源码 |
| FeiNiuMusic | [README](https://github.com/kuilei0926/FeiNiuMusic/blob/2f0f92398fc1a4b33ab953c574620dcb6546f1d8/README.md)、[连接探测](https://github.com/kuilei0926/FeiNiuMusic/blob/2f0f92398fc1a4b33ab953c574620dcb6546f1d8/lib/app/services/feiniu/fn_connection_probe_service.dart) | 作者明确支持 FNID 多链路，存在对应实现；仍是飞牛音乐客户端 | 根目录未见 LICENSE；README 指向上游许可但未独立闭合具体继承关系，不导入其源码或签名材料 |
| Ting Reader Flutter | [CHANGELOG](https://github.com/dqsq2e2/ting-reader-flutter/blob/92542cba52db5e0d40a83d89a689f87528aacb32/CHANGELOG.md)、[FNConnect 客户端](https://github.com/dqsq2e2/ting-reader-flutter/blob/92542cba52db5e0d40a83d89a689f87528aacb32/lib/src/core/auth/fn_connect_client.dart) | 实现 FNID 发现、fnOS WebSocket 登录/2FA、网关会话、应用入口探测；发行记录含网关重登、切集/流异常修复。**最有希望的服务映射参照** | [AGPL-3.0-only](https://github.com/dqsq2e2/ting-reader-flutter/blob/92542cba52db5e0d40a83d89a689f87528aacb32/README.md)，未复制实现 |
| NPMusic | [开发者 App Store 描述](https://apps.apple.com/cn/app/id6804971088)明确列 fnID、relay、自动探测和飞牛音乐服务前提 | 产品一手说明，未取得协议源码；不能由此推出通用隧道 SDK | 不下载/反编译其二进制，不推断源码许可 |
| LyraNest | [项目 README](https://github.com/WHWgogogo/LyraNest/)列 FNID 多端点及签名鉴权 | 保留为备选产品线索；本轮聚焦前三个可审实现，没有无界扩展 | 未导入代码，未完成许可与部署链核验 |

Infuse/VidHub 对飞牛影视的兼容、以及飞牛官方 App/TV，均不作为本表“第三方 FNID 认证连接实现”的替代证据。

## 已追到的连接边界

回声台的解析调用有签名要求，其[构建脚本](https://github.com/QiaoKes/fn-music-tv/blob/f25f1aceb5617bf20e94f97190a0b6229083a5c1/core/data/build.gradle.kts)从环境接收 FNConnect 签名配置，Release 缺配置会失败。公开其他项目含签名常量，并不证明该材料可供 ETE 使用。本轮没有复制、解密、生成或发送签名凭据，没有调用此服务接口；不能把“开源代码能找到”写成“已获官方客户端接入资格”。

Ting Reader 的[应用登录实现](https://github.com/dqsq2e2/ting-reader-flutter/blob/92542cba52db5e0d40a83d89a689f87528aacb32/lib/src/core/state/app/app_authentication.dart)明确先取得 fnOS 网关会话，再调用自己的应用登录；网关 Cookie 与应用 token 分开。这个双层认证模型符合 ETE 的目标方向：飞牛解决连接授权，Emby 继续负责账号和媒体权限。它没有证明两个账号可以或需要映射。

服务端的[原生 FPK UI 配置](https://github.com/dqsq2e2/ting-reader/blob/0a82790e6c3788f7343f165f564eb56f4cd513f7/.github/ting-reader-fpk-native/app/ui/config)声明 `gatewaySocket` 与 `gatewayPrefix`；[Docker FPK 配置](https://github.com/dqsq2e2/ting-reader/blob/0a82790e6c3788f7343f165f564eb56f4cd513f7/.github/ting-reader-fpk/app/ui/config)也有各自注册入口。其[启动脚本](https://github.com/dqsq2e2/ting-reader/blob/0a82790e6c3788f7343f165f564eb56f4cd513f7/.github/ting-reader-fpk-native/cmd/main)将应用 socket/prefix 交给服务。**这是已注册应用网关路线，不是 FNID 自动转发任意 TCP 端口**；Emby 是否已有等价映射仍未知。

## 更新后的能力结论

| 项目 | 新证据能说明什么 | ETE 仍需验证什么 |
| --- | --- | --- |
| 认证/授权 | 第三方源码有 fnOS 用户登录、2FA、网关会话；音乐认证又是另一层 | 正常浏览器登录复用是否足够；受支持的客户端授权及签名材料来源；不导入其他客户端凭据 |
| 续期/撤销 | Ting Reader 发行记录描述过期网关会话重新登录 | 不能由“重登”推出正式 refresh/revoke API、TTL 或主动撤销通知 |
| 多连接 | 客户端有候选链路选择 | 不能证明并发通道限额、资源隔离或流量聚合规则 |
| 服务映射 | Ting Reader FPK 有可审计 Unix socket/prefix 配置 | Emby 当前安装是否注册网关；若无，是否允许并支持单独伴随应用注册 |
| Range/seek/媒体 | 已有音频网关适配及异常修复记录 | 不等于 ETE/libmpv 的 206、seek、转码分片、字幕均可用 |
| WebSocket | fnOS 认证使用 WebSocket | 不证明网关允许 Emby `/socket` 的升级/帧/心跳和 Session 连续性 |
| 路由/TLS | 第三方源码能构建 LAN/公网/中继候选 | 不证明 P2P SDK；不采用未经验证路由、忽略证书或广域 Cookie 复制等实现选择 |

开发者站此前 403 路径没有重试，也没有通过代理更换、抓包、反编译或受限接口探测补齐未知项。

## 可执行的真实连通验证方案

提供 [mapped-emby-probe.js](../prototypes/fn-connect/mapped-emby-probe.js)。这是浏览器里显式开启的一次只读探针，**不是生产 transport，也不代表 FNID 已打通**。它不发现 FNID、不登录、不读取/导出 Cookie，不接受认证头；使用当前浏览器的正常同源会话，仅 GET 已明确注册入口下的 `System/Info/Public`。默认关闭，只允许 HTTPS 当前源及显式 `/app/...` 路径，不跟随登录跳转；响应限 64 KiB、请求/读取总计 5 秒，报告仅固定状态及布尔值，不输出服务器身份正文。

真实验证需具备的前提（本轮尚未执行）：

1. 用户确认一台有权测试的 fnOS NAS、版本、已启用 FNConnect，以及 Emby 的**实际已注册**网关路径。路径应从既有应用声明/管理员页面取得，不猜 `/app/emby`，也不安装软件来制造此前不存在的入口。
2. 用户在正常 HTTPS 浏览器页面自行登录 fnOS，完成其访问码/2FA。凭据不交给脚本或 ETE；不读取其他应用登录资料，不从浏览器导出 Cookie。
3. 在同一已登录源的 DevTools 执行经过审阅的探针正文，再显式调用如下方法。`apiBasePath` 必须换成已确认的 Emby API base，示例是占位值；是否需要末段 `/emby` 也须依据真实映射确认。可选 `expectedServerId` 由用户与本机 Emby 已知身份比对，只返回是否匹配。

```js
await ETE_FN_MAPPED_EMBY_PROBE.probe({
  enabled: true,
  apiBasePath: '/app/ACTUAL_REGISTERED_SERVICE/ACTUAL_API_BASE'
});
```

4. `INFO_REACHABLE` 仅表示收到类似 Emby 的公开身份 JSON，不能替代账号、媒体或 Session 验收；302/不透明跳转表示需登录或路由确认，401/403 表示拒绝，不重试绕过。仅分享脱敏后的固定报告。
5. 只有上述通过后，才在隔离 ETE profile 中使用原 Emby 登录，按固定自有测试媒体验证 Range 的前/中/尾与 416、前后 seek、原码/转码、字幕、原 `/socket` Session/远控、Stop/Next/退出、授权撤销和重新登录。当前尚无此产品接线，不能提前执行该阶段或称成功。

**准确外部阻塞**：还没有可确认的 Emby 已注册网关入口及获授权的隔离 NAS 会话；若不存在映射，则下一动作是设计并审批 fnOS 伴随应用注册/只转发既有 Emby 的最小方案，涉及 NAS 安装和权限，必须在执行前明确授权。若选择原生 FNID 自动发现路线，还缺 ETE 可用的正式接入/签名配置和支持合同。这些动作本轮均未执行，非自动审批拒绝；不通过复制其他客户端签名材料来消除阻塞。

## 本轮交付和测试包判断

16 项原内存契约加 9 项探针测试，均为本地合成验证；探针覆盖默认禁用、路径/源限制、登录页误判、身份比对、响应上限、取消清理、浏览器全局入口和超时。没有真实浏览器 fnOS/Emby 或官方网络验证。初轮探针取消测试暴露未取得 reader 前响应体未清理，已补所有返回路径的 body cancel，再完整复跑。

没有用户功能接线、NAS 伴随应用、正常 Emby/API 或 Native 媒体适配器，**当前不具备有意义的 ETE 功能测试包**。不为凑包触发构建；正常 v0.4.0 发布优先。后续获准接线后再提供隔离 profile、显式测试开关、固定分支 commit 和最短人工验收矩阵。
