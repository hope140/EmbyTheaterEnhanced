# v0.4.0 基线后的 FNConnect 准备结果

本功能分支已保全原 `511b00d72f65438a654ae79f3bd349dab7dbc22e`，并重基到用户指定的正式 v0.4.0 main 来源 `88578c91ab19d44eecddcfae096d37dc917ef1f4`。重基仅在两份状态文档出现冲突，双方有效内容保留；原功能的三项提交保持，生产 `src/native/tools/vendor/installer` 与版本/依赖相对该 main 来源没有功能差异。本分支不修改正式发行、main 或发布分支。

## 公开资料复核与准确边界

| 来源 | 本次可读内容 | 能/不能据此落实的合同 |
| --- | --- | --- |
| [fnnas-labs/fnos-cli-skill](https://github.com/fnnas-labs/fnos-cli-skill/tree/f288f89f094253e38ff0c8e2c2be38a473bb1b62) | 项目自行公开的集成说明和 MIT 声明；[OAuth 参考](https://github.com/fnnas-labs/fnos-cli-skill/blob/f288f89f094253e38ff0c8e2c2be38a473bb1b62/skills/fnos-cli/reference/oauth.md)描述浏览器授权、PKCE、过期刷新、Connect 目标处理及本地持久会话 | 这是该 CLI 的一手集成说明，说明不能再笼统声称没有公开授权流程；但未证明 ETE 可复用其 client ID、scope 或代理任意 Emby 路由。该流程还要求持久 access/refresh 会话，超出本轮“不创建凭据”的范围；未安装或执行 CLI、未授权、未复制身份参数 |
| [ckcoding/fnnas-docs 镜像](https://github.com/ckcoding/fnnas-docs/tree/a8a70503b5b3413f0a00f4b6db6cd62066639508) | 仓库自称同步开发者站；[网关页面](https://github.com/ckcoding/fnnas-docs/blob/a8a70503b5b3413f0a00f4b6db6cd62066639508/docs/core-concepts/gateway-registration.md)列 prefix/socket、会话与 X-Trim 身份头、WebSocket；[fnpack 页面](https://github.com/ckcoding/fnnas-docs/blob/a8a70503b5b3413f0a00f4b6db6cd62066639508/docs/cli/fnpack.md)列工具版本及检查项 | **二手镜像线索，未与官方原文独立核对**；不据此宣称平台版本、身份头可信边界或 fnpack 身份已验证。没有下载/执行工具或复制示例代码，也没有运行镜像抓取器去访问被拒绝的源站 |
| 已核对的 Ting Reader 两端源码 | 保留[客户端证据](FN_CONNECT_CLIENT_EVIDENCE.md)及[许可/方案核对](FN_CONNECT_COMPANION_PLAN.md)中的固定身份 | 可继续设计应用私有 socket 到单个 Emby 上游；不把第三方源代码的成功描述当作 ETE 或用户 NAS 的验收 |

开发者站既有 403 拒绝路径未重试，也未换代理或提取其他客户端的凭据。镜像不能代替所缺官方合同：**ETE 的客户端注册/最小 scope、Emby 注册应用是否可走 OAuth 代理、原生媒体请求授权、平台 socket 权限及网关覆盖/撤销语义、固定打包工具来源与哈希**。这些未明确前，继续拒绝生产 FPK 和自动发现/认证实现，不虚构服务接口。

## 这次实际新增的可运行实现

[local-unix-harness.cjs](../prototypes/fn-connect/companion/local-unix-harness.cjs)是独立的、默认关闭的 Linux 本地传输适配器，区别于之前仅传对象的内存 mock。它只在本任务私有临时目录监听 Unix socket，上游也必须是同目录的固定 fixture socket；没有任意主机/端口参数、TCP listener、真实 NAS 或凭据处理。授权函数为明确注入的测试替身，不是可部署的 fnOS 准入实现。

新增5项测试实际经过 Node HTTP parser 和 Unix I/O：默认关闭、Range/206/416 与 Emby 401 保留、缺少测试授权/映射外拒绝、HTTP 101 和双向合成二进制帧、客户端断开时取消上游流。测试使用 [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html)公开示例握手 nonce；它不是账户凭据。WebSocket 用例只验证有限握手/帧中继，不是协议栈完整兼容或远控验收。

原36项合成测试加本地 Unix I/O 5项共41项；结果按新回执记录。Windows 明确不支持本 Unix fixture，相关4项 I/O 测试按平台跳过；没有声称 Windows/真实 NAS/媒体/Session 或 FNConnect 已通过。本地服务器和 socket 均由测试创建并关闭，仅清理所属临时目录。

审阅生成器纳入本地适配器源文件的逐项 SHA256，输出仍是不可安装 JSON；FPK 启动 stub 仍退出78。没有产品 UI/IPC/API/Native 接线、官方 fnpack 或真实授权，因此没有有意义的 ETE 功能安装包，不触发云打包。

## 后续一次最小授权清单

以下供用户指定真实测试范围；现在没有执行这些操作，也不要求用户提供密码/token。

| 项目 | 一次性最小具体范围 |
| --- | --- |
| 设备 | 指定一台隔离 fnOS NAS（版本、架构）与一处测试 Emby 实例；确认其实际网关入口、上游本机地址及预期服务器身份。先只读核对，不猜正式部署或默认端口 |
| 操作 | 用户自行正常 HTTPS 登录 fnOS、完成访问码/2FA，再在专用临时 profile 执行同源公开身份探针。只有身份/映射通过后，使用原 Emby 登录并做短时播放、Range、seek、字幕、转码和原 Session/WebSocket/停止退出测试 |
| 数据 | 仅受限测试账号、用户指定自有测试媒体；允许该测试账号的登录/播放会话及进度写入，不改媒体库设置/文件或正式用户历史。回执只含脱敏结果与源码/包哈希，不上传账号、Cookie、URL、媒体身份或原始诊断 |
| 权限 | 若已有映射则不安装。若无映射，先补官方合同与可审阅真实包，再单独批准一个确切包 SHA256、独立 app ID/所属目录/账号/Unix socket及唯一 Emby 上游。不新增公网/TCP端口、路由、防火墙、全局服务或网络权限；不使用 root/system API 兜底，不扩大 OAuth scope |
| 凭据 | 本轮及上述浏览器路线不创建持久凭据、不导出 Cookie、不接收密码。若最终选择 OAuth，必须先获得 ETE 独立客户端及所需最小 scope 的合法合同，并另行明确是否允许持久令牌；不能复用现有 CLI 的身份或广权限 |
| 回退 | 退出专用会话；如安装了已批准的新伴随组件，仅停止/卸载该组件、删除核对归属的自有 socket/目录和临时 profile；既有 Emby/NAS服务、正式客户端和媒体保持。影响超过该范围则停止并报告差额 |

可独立完成的分支保全/重基、证据复核、默认关闭原型、本地真实 Unix 传输、审阅件和测试已完成。剩余真实部署与 FNConnect 实网验证受上述合同/设备授权条件限制，**未执行，非审批拒绝**。
