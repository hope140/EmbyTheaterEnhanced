# FNConnect 最小伴随组件方案与 mock 打包骨架

状态：`DESIGN_SELECTED / MOCK_ONLY / NOT_INSTALLABLE`。本轮完成不需要 NAS 权限的准备；没有真实连通、fnOS 打包器、安装包、服务端部署或 ETE 产品接线。独立范围仍为 v0.4.0 发布后的 FNConnect 连接认证，不改变 Emby 登录/权限，不实现缓存。

## 许可与来源核对

| 对象 | 固定身份和声明 | 本轮处理 |
| --- | --- | --- |
| Ting Reader 服务端 | commit `0a82790e6c3788f7343f165f564eb56f4cd513f7`；[根 README](https://github.com/dqsq2e2/ting-reader/blob/0a82790e6c3788f7343f165f564eb56f4cd513f7/README.md)、[Cargo 清单](https://github.com/dqsq2e2/ting-reader/blob/0a82790e6c3788f7343f165f564eb56f4cd513f7/backend/Cargo.toml)及 frontend/package.json 声明 AGPL-3.0-only；根 LICENSE 是 AGPLv3 | 阅读流程与字段，未复制 Rust/JS、安装/启停脚本或资源 |
| Ting Reader Flutter 客户端 | commit `92542cba52db5e0d40a83d89a689f87528aacb32`；[README](https://github.com/dqsq2e2/ting-reader-flutter/blob/92542cba52db5e0d40a83d89a689f87528aacb32/README.md)声明 AGPL-3.0-only，根 LICENSE 是 AGPLv3 | 未复制认证、加密、签名、凭据保存或登录 UI 实现 |
| FPK 附带用户许可 | 服务端的[FPK LICENSE 文本](https://github.com/dqsq2e2/ting-reader/blob/0a82790e6c3788f7343f165f564eb56f4cd513f7/.github/ting-reader-fpk-native/LICENSE)另有产品用户说明 | 不将其当 ETE 许可或再发布文本，不复用上游 FPK |
| ETE 新骨架 | `prototypes/fn-connect/companion` 原创本地模拟与模板，沿仓库现有许可证 | 打包审阅文件含仓库 LICENSE，不带上述第三方实现、签名常量、密钥或二进制。后续若要引入外部实现，须单独确定具体文件与许可；本轮没有作“整包许可已解决”的结论 |

以上是来源声明核对，不表示第三方持有的 FNConnect 接入资格、签名配置或服务授权可转给 ETE。既有开发者站 403 路径未重试，不寻找或提取发行包中的签名材料。

## 网关会话及映射流程

客户端的[双层登录](https://github.com/dqsq2e2/ting-reader-flutter/blob/92542cba52db5e0d40a83d89a689f87528aacb32/lib/src/core/state/app/app_authentication.dart)先建立 fnOS 会话，再登录 Ting Reader；这是保持传输认证与应用账号独立的公开例子。[FPK UI 配置](https://github.com/dqsq2e2/ting-reader/blob/0a82790e6c3788f7343f165f564eb56f4cd513f7/.github/ting-reader-fpk-native/app/ui/config)指定应用 socket 和 prefix；服务端 [server.rs](https://github.com/dqsq2e2/ting-reader/blob/0a82790e6c3788f7343f165f564eb56f4cd513f7/backend/src/api/server.rs)建立 Unix listener；[gateway.rs](https://github.com/dqsq2e2/ting-reader/blob/0a82790e6c3788f7343f165f564eb56f4cd513f7/backend/src/api/server/gateway.rs)处理 prefix 及应用页面资源。

据此选择的 ETE 候选流程为：用户正常 fnOS 登录 → FNConnect/fnOS 网关授权 → 已注册应用私有 Unix socket → 单一指定 Emby 服务 → 原 Emby 登录及媒体权限。网关登录失败不能转为匿名放行；Emby 返回 401/403 也不能被桥接组件改成登录成功。无需把 fnOS 用户映射成 Emby 用户。

公开示例的 socket mode、`allUsers`、运行账号、系统 API、页面重写等均不是 ETE 已获批准的配置。尤其原项目还监听 TCP、读媒体目录等，这些不属于本任务最小桥接需要，未复制到骨架。fnOS 具体网关访问控制、socket 所有者/组及最低支持版本仍需对应平台资料或隔离环境核验。

## 两种方案比较及选择

| 方案 | 能负责什么 | 不能单独解决什么 | 决策 |
| --- | --- | --- | --- |
| 独立 fnOS 伴随 FPK / 桥接 | 注册应用入口；管理所属 Unix socket；只转发到一个显式 Emby 上游；不改 Emby 进程 | 仍需 fnOS 正式映射/权限、用户网关登录、真实流和升级协议验证；不能自行生成官方授权或 FNID 签名 | **选择为缺少既有映射时的最小候选**；先提供 mock，未安装 |
| Emby 插件 | 可在 Emby 进程内提供配对或应用信息；未来有明确需求才考虑 | 单独插件无法完成 fnOS 应用安装/网关注册。若再配 FPK，就同时承担两份组件与 Emby 插件加载/升级范围；本任务不需要账号联动 | 不实现，不把配对功能擅自加入用户需求 |

若明天确认 Emby 已有合法可用的网关映射，优先复用该映射，**无需新增 FPK**。当前不猜 NAS 部署方式、Emby 端口、容器网络、应用 ID 或权限。

## 本地可运行骨架

源码见[companion 目录](../prototypes/fn-connect/companion/README.md)。计划 app ID/prefix/socket 名仅用于本地设计，明确 `registrationStatus=unverified`。配置的 `enabled=false`、`mode=mock`、上游为内存 fixture，拒绝生产 URL、账号/token、网络监听及权限扩展。`activateMock=true` 只是函数调用的本地测试开关，不能激活真实服务。

mock 演示 prefix 边界、查询/方法/请求体保留、Emby Authorization/Range 透传、网关 Cookie/header 和 hop-by-hop header 移除、Emby 拒绝保持、取消/关闭后迟到响应丢弃。`gatewayAuthorized` 是**合成输入**，没有任何真实身份校验效力。所有 Cookie 当前均不转发；真实 Emby Cookie 依赖尚未核实。响应对象原样返回，不做缓存、重试或响应 URL 重写，WebSocket upgrade 明确未实现。此模块不建立 listener/socket、HTTP 上游或持久存储，也没有卸载/删除 NAS 文件的代码。

打包骨架只产生 `NON_INSTALLABLE_MOCK_REVIEW` JSON 审阅件，含每份源码/配置/模板的 SHA256；FPK manifest、网关权限、socket 运行身份保留未替换字段，启动模板只退出 78。CLI 和 API 均拒绝实际 FPK target，不调用 fnpack，不生成可安装归档。可复现入口：

```sh
node prototypes/fn-connect/companion/prepare-review.cjs > /tmp/ete-fn-companion-review.json
node --test tests/fn-connect-contract.test.cjs tests/fn-connect-mapped-probe.test.cjs tests/fn-connect-companion.test.cjs
```

本轮新增11项 companion 测试，加原25项共36项本地合成测试。初轮新测试中绝对 URL 的拒绝分类与预期不同，随后将非 origin-form 路径明确判为映射外；最终结果另以测试回执为准。没有真实网络、fnOS、Emby、媒体解码或完整浏览器验收。

## 从骨架到真实包的必要工作

1. 对齐真实 v0.4.0 发布点；确认 fnOS 版本/架构、官方打包 schema、固定 fnpack 来源及网关权限字段，确定是否已有 Emby 映射。模板不冒充已验证 FPK 格式。
2. 如确需伴随应用，再确定包内独立桥接可执行组件和锁定工具链。仅监听所属 Unix socket，只连接一个经批准的既有 Emby 上游；明确 socket 归属/可访问账号及启停清理。未确认前不设 chmod、共享组、root 或系统 API 权限。
3. 接入真实的网关准入与失效语义；不能将 mock 布尔值部署为授权检查。保持 Emby 身份独立；不保存 fnOS/Emby 密码或复制其他客户端签名材料。
4. 验证 HTTP 流/Range/206/416、请求取消、双向 WebSocket、重定向、转码分片和字幕路径；确认网关凭据不会发给 Emby 或媒体外链。ETE 浏览器会话与 Native/libmpv 请求不会自动共享授权，客户端接线须另有窄合同，不能由本骨架推定完成。
5. 最后才生成真实独立测试包，绑定确切 commit/工具链/文件哈希、安装与回退清单；由父线程协调云构建。本轮不具备此条件，不打 ETE 功能安装包或发布新功能。

## 明天真实验证的一份最小授权清单

本清单供后续一次性明确范围，**当前未请求执行、未获实际 NAS 操作授权**。先完成1—2；若既有映射可用，就跳过3；只有真实包与具体目标可审阅后才批准3的安装动作。

| 项目 | 最小范围与前置条件 |
| --- | --- |
| 1. 目标与只读确认 | 用户指定一台隔离测试 NAS/系统版本/架构及一处既有 Emby 实例；允许查看该实例的应用入口声明和本机服务地址，确认网关映射与权限。无需账号密码、完整 NAS 配置、媒体目录清单或其他应用数据 |
| 2. 登录会话与身份 | 用户自行在正常 HTTPS 页面登录该 NAS，完成访问码/2FA；使用权限足够且受限的测试账号。允许在专用临时浏览器/ETE profile 中使用该会话和独立 Emby 测试账号；不索取/导出 Cookie、密码、长 token，不创建持久凭据。TLS 必须正常验证，不关证书校验 |
| 3. 可选伴随安装 | 仅在无既有映射、实际组件/权限已核对且用户批准具体包 SHA256 后，安装一个独立 app ID、所属目录、所属账号及 Unix socket，转发到用户指定的唯一 Emby 上游；允许该新增组件启停/卸载。不得修改正式 Emby 配置或插件，不新增公网/TCP listener、端口映射、防火墙、系统服务或全局网络权限。若平台要求额外系统权限，停止并说明具体差额 |
| 4. 测试动作与数据 | 首先只读公开身份探针并比对预期服务器；通过后仅使用用户指定的自有合成测试媒体。允许原 Emby 登录、测试账号的播放会话/进度写入以及 GET/HEAD/Range、短时原码/转码、seek、字幕、Session/WebSocket、Stop/Next/退出测试；不写正式用户历史、库设置或媒体文件。官方流量仍受当前权益限制，不购买升级 |
| 5. 失效与回退 | 允许用户手动退出该临时网关会话，验证失效后拒绝及重新登录；不撤销其他客户端会话。清理限新增组件及专用临时 profile 的准确路径，先核归属；既有 NAS/Emby 服务、正式客户端和媒体保持。若安装权限或影响超出本表，停止，不自动扩大范围 |
| 6. 回执 | 仅保留脱敏状态、测试矩阵、包/源码哈希与错误分类；不上传账户数据、原始 URL、Cookie、媒体身份或原始诊断。真实 NAS/媒体/浏览器结果与36项合成结果分开记录 |

当前准确阻塞为平台映射/准入/打包合同尚未闭合及无获授权隔离 NAS 会话；这些真实操作未执行，非自动审批拒绝。所有独立可做的本地准备已完成，不把此状态表述为 FNConnect 已打通。
