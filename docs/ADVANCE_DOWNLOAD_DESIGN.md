# 完整提前下载：在线方案与独立核心候选

状态：在线提前下载的方向已明确，独立分支已实现取源、目录偏好与 HTTP 传输核心；尚未接入原下载按钮、生产 IPC 或 ETE 播放来源索引，不是客户端可用性验收包。

## 明确的产品范围

- 服务器在线时提前下载完整文件，之后在 ETE 中播放；不要求断网启动或离线浏览。
- 离线需要由使用者去下载目录找到视频文件，因此最终交付普通媒体文件，不做 ETE 专属封装。
- 沿用原下载按钮；第一次选择目录后记住，后续默认使用。
- 重点支持现有 STRM／CD2。可播放来源应尽可能下载，但必须测量影片本体、鉴权、换签和 Range；播放能力不自动证明完整下载能力。
- 不接管旧下载、不删除已下载文件，不修改预载／最后播放暂存的 M+P、归属和清理规则。

在线完整下载、真正离线客户端与 Emby Downloads & Sync 仍是不同层次。官方网页直接下载不属于 Downloads & Sync；Folder Sync 是服务端插件复制到服务端可访问目录。当前无需先将 ETE 广告为同步设备，也不创建服务端同步任务。来源：[Download Options](https://emby.media/support/articles/Sync.html)、[Offline Access](https://emby.media/support/articles/Offline-Access.html)、[Folder Sync](https://emby.media/support/articles/Folder-Sync.html)。

## 当前代码基线与隔离

基线为 main `2d0acf314cd58d7dcb8b61e0e95ac5d1647b3d96`；首轮无副作用合同提交为 `80a30acdd56f599b0a7631f2c4e13c24388b5e54`。当前维护 API 由 `src/web-api/src/apiclient.js` 继承固定 MIT 输入；`src/web-api/src/mit-apiclient.js#getItemDownloadUrl` 仍生成指定版本的原下载地址。原下载按钮与权限入口可复用，不能把 URL 生成成功当成影片下载成功。

共享缓存另外只读核对 `a668fcd030792a4f0e5f02797ea058198183f8ec` 的授权／适配器与合同；它不是本分支依赖，也不代表预载最终验收状态。本分支没有移动、合入或修改缓存分支，没有改 PlaybackManager、libmpv、resolver、CD2 service、main 或用户设置入口。

## 收敛的实现路径

目标数据流为原按钮 → mainFrame 校验 → 当前账户的下载取源会话 → 记忆目录选择 → 独占临时文件 → 完整校验与无覆盖提交 → 完成索引 → 原播放链按同版本选本地文件。当前完成中间的核心，首尾接线仍待完成。

### 取源会话

`src/electronapp/enhanced/advance-download/source-session.js`：

1. 接收服务器、账户、Item 和显式 MediaSource 身份，以及仅在内存使用的当前 Token。
2. 通过选定服务器 API 重新读取 Public Info、用户下载权限与 Item／MediaSources；不是直接信任 renderer DTO，也不借用播放或预载凭据。
3. 校验服务器 ID、用户和 Item 身份、视频类型、CanDownload 与下载权限。多个版本未选择时拒绝，不猜测首个版本；换签时不静默切版本。
4. 复用原 STRM resolver，采用公共 resolver 配置及另一个独立 CD2 service 的运行配置；下载拥有自己的 requestId、取消、连接和 close，不操作预载作业。
5. 候选依次来自解析结果、主进程获取的 HTTP MediaSource、直链失败后的 CD2 同源重取，以及原 Emby 下载接口。源提供者支持的额外请求头限 User-Agent；不将 Emby Token 转发到媒体 CDN。
6. 每次 acquire 都重新授权、取源和探测；签名 URL 变化可以接受，但已知强 ETag、长度或表示身份变化不能沿用原任务字节。close 退休任务并取消所属请求。

该模块尚未成为生产 IPC；未来必须由可信 mainFrame 的入口创建会话，不能把其输入直接开放给任意页面。请求总期限为 30 秒，单个 HTTP 探测期限 8 秒；不改变播放解析的原预算。

### 影片响应探测

`source-probe.js` 使用现有 Node HTTP(S)，在无临时视频文件的情况下最多缓冲 64KiB 首部；Range 探测遇到完整 200 时有界停止，不缓存整片。识别 Matroska／WebM、MP4／MOV、AVI、MPEG PS／TS／M2TS、FLV 和 ASF 容器标识，拒绝指针文本、HTML／JSON 和 HLS。

这验证容器标识、响应框架和已知大小，不保证任意文件的全部轨道或帧可解码；没有可信远端摘要时不声称字节与远端原件有独立密码学证明。首部探测会产生额外网络读取；不宣称源端传输恰好只有 64KiB。

首次 Range 正确后，具有强 ETag 时额外探测一个非零偏移的字节，并发送 If-Range；精确区间、长度、ETag 和消息结束均符合时，才标记 resumeVerified。源忽略 Range 可以从头下载，但不冒称可续传。已知 metadata Size 与响应总长不一致时拒绝。

元数据请求不跟随重定向。媒体探测最多受控跳转三次；跨 origin 清除认证头且不在返回原站时恢复，拒绝 HTTPS 降级。传输适配器只在当前最终 URL 发请求，后续实际传输重定向交回会话重新解析，不直接带认证跟随。

### 目录记忆

`directory-preferences.js` 沿用 ETE 自己的更新偏好原子写入与路径归属模式：

- 原生目录选择器由 main 注入；第一次选择保存目录字符串，重建 store 后继续默认使用。
- 取消、页面／任务退休与并发点击不覆盖已保存目录；force 接口允许未来明确的重新选择入口。
- 偏好写入只涉及 profile 中专属 JSON 与自身临时文件；不枚举、创建、迁移或清理媒体目录。
- 保护损坏／超大／重定向偏好文件，不覆盖它们；保存失败保留旧值。
- 选定目录要求可识别的实际目录，当前拒绝符号链接／junction 别名；网络盘、Windows 目录权限及原生选择器仍需实际平台验证。

### 文件传输

`transfer.js` 使用有背压的 HTTP 流写独占 `.ete-media-*.part`，不将整片装入内存。原生 DownloadItem 可以完成普通下载，但这里需要在追加前审核响应并在过期 URL 后重取源；当前先实现可测量的 HTTP 协议适配器，未新增下载依赖或改动已有下载库。

- 真实已写字节计进度，句柄短写循环推进，零进展失败。
- 使用 `response-contract.js` 在写入前校验状态、Content-Range、长度、编码及强 ETag；完整正文还要精确字节数和 clean end。
- 断流最多重试两次，每次重新取得会话来源；强校验器和非零 Range 已验证时才继续追加，否则截断自身临时文件后重新取完整响应。
- 即使全部字节已写入，消息未完整结束也不能当作成功，必须重新取得清洁响应。416 不能声明本地部分文件已完成。
- 完成后核文件大小、读回容器首部并 sync，再用 link 原子无覆盖提交；同名依次采用 `name (1).ext` 等，已有文件保持。
- 取消／失败只清理当前操作能证明归属的临时文件；交换过的路径不会被误删。没有删除、接管、搬迁或清理已有完整下载的接口。
- 当前没有跨应用重启的任务恢复；运行期间断流续传不能冒充持久任务续传。关闭应用的产品交互尚未接线。
- 当前发布依赖所选文件系统支持硬链接；不支持时失败，不退化成可能覆盖已有文件的 rename。FAT／exFAT／网络盘的提交兼容需要单独验证或增加严格的无覆盖复制适配器。

HTTP 条件请求与区间语义见 [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.5)。上述属于协议与文件归属实现，不授予额外服务器权限。

## 与预载和现有能力的关系

缓存的 M+P、实际播放归属、未播 next 退出丢弃及最后实际播放保留属于原功能；完整下载不占这些额度，不新增缓存角色。当前没有读取或提升缓存内容，重复首部探测不应统计成预载命中。

若后续复用缓存，只共用授权媒体描述与明确的读取租约；稀疏 coverage 数量不等于完整文件。提升须验证完整连续覆盖和相同表示，再建立独立下载所有权，不能挪用预载的文档／代次凭据或删除权限。

Emby SyncJobs 的看完删除、自动追更和取消任务删除，均不适用于当前的用户完整下载。[官方任务语义](https://emby.media/support/articles/Sync-Jobs.html)不能直接套用。

参考了 [Electron 44.4.2 下载接口](https://raw.githubusercontent.com/electron/electron/v44.4.2/docs/api/download-item.md)、[Session 接口](https://raw.githubusercontent.com/electron/electron/v44.4.2/docs/api/session.md)、[electron-dl](https://github.com/sindresorhus/electron-dl) 和 [Jellyfin MPV Shim 设计目标](https://github.com/jellyfin/jellyfin-mpv-shim/blob/3b2fcd8a7de923b1d9ce053a972010498884a51e/docs/offline-sync-goals.md)。electron-dl 为 MIT，明确不提供跨应用重启恢复；Shim 整体 GPLv3，当前 ETE 维护层 GPL-2.0-only，未复制其实现。目录偏好模式只复用本仓库已有维护代码。

## 验证与历史失败

公开定向命令：

```sh
node --test tests/advance-download-response-contract.test.cjs tests/advance-download-source-session.test.cjs tests/advance-download-directory-preferences.test.cjs tests/advance-download-transfer.test.cjs tests/strm-resolver.test.cjs tests/cd2-service.test.cjs tests/cd2-budget.test.cjs
```

当前 95/95 通过，零失败／跳过／取消，其中新增合同、取源、目录和传输测试共 39 项。采用回环 HTTP、真实 resolver／CD2 service、合成 gRPC transport 及独占临时目录；不是用户服务器或真实 CD2 gRPC 鉴权验证。

首轮取源 24/25，直链失败后的同源回退缺少规范化 sourcePath；补齐上下文后同组 25/25。扩大回归首次 93/94，原因是新工作树缺锁定 gRPC 依赖；使用原 lockfile 执行 npm ci --ignore-scripts 后，同组 94/94。未修改旧断言或降低门禁。随后增加异步 CD2 close 未结算时仍持有来源归属的回归，最终同组 95/95。

另外显式运行真实媒体自测，需要调用者指定已安装工具，缺参数直接失败，不计为平台 skip：

```sh
ETE_ADVANCE_DOWNLOAD_FFMPEG=/absolute/path/to/ffmpeg ETE_ADVANCE_DOWNLOAD_FFPROBE=/absolute/path/to/ffprobe node --test tests/advance-download-media-selftest.cjs
```

本轮 Linux 该自测 1/1 通过：生成两秒、64×64、10fps 的 FFV1／Matroska 视频，经取源、断流、重新授权、续传和真盘保存后，文件 SHA256 相同，FFprobe 识别成功，完整解码 20 帧的逐帧哈希一致。它证明这段自有测试视频的链路，不证明所有容器或实际片源。

没有访问真实 Emby／CD2 地址或真实用户目录；本环境没有附这些服务的可用连接信息。尚未验证 TLS／真实换签／第三方限流、Windows、外接盘或网络盘、原生文件选择器、完整客户端、原按钮、播放索引、预载组合、构建或用户验收。未操作前台、合 main、推送、发布或部署。

## 剩余实施与需要讨论的具体体验

已明确的在线范围、原按钮、目录记忆和 STRM／CD2 重点不再作为待确认问题重复提问。后续必要步骤是：

1. 通过已有授权的实测通道验证选定服务器版本的 DTO、CanDownload、STRM 真实响应、CD2 参数与换签；不为了通过而猜测／弱化权限。
2. 给原媒体下载按钮增加窄 overlay 和 mainFrame IPC；日志／字幕／非视频下载保持原入口。接入原生目录选择器、进度、失败提示和取消，避免静默回到浏览器下载 `.strm`。
3. 增加完成索引与原播放链的同版本本地来源选择：推荐完整且身份一致的本地副本优先，文件不存在或表示变更时回原来源；不改 Session、远控或 Together。
4. 实测 Windows 路径／提交语义和真实 ETE 启动／退出；结果与当前单元、回环和 Linux 解码证据分开。

仍值得单独讨论的体验是关闭应用时的任务行为（提示等待、后台继续，还是持久任务下次续传），以及更换默认目录入口放哪里。当前核心没有选择产品级退出策略，也未把 force 选目录接口擅自放进预载设置或打开官方 sync 能力。持续后台服务与跨重启续传会增加任务持久化范围，需要明确后再实现。
