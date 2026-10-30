# 完整提前下载：最小方案与待决事项

状态：设计候选。下载产品范围、旧文件接管和删除策略尚未确定；没有下载 UI、真实传输、文件管理或播放接线。本页不是已交付功能说明。

## 核对的代码与已有能力

本轮基线为 main `2d0acf314cd58d7dcb8b61e0e95ac5d1647b3d96`。此前 `8a238f4` 快照的下载调查不能当作当前 API 层实现说明：当前维护 API 由 `src/web-api/src/apiclient.js` 继承固定 MIT 输入，`src/web-api/src/mit-apiclient.js#getItemDownloadUrl` 仍生成指定 `mediaSourceId` 的 `Items/{id}/Download` 地址。生成地址不证明响应是所选影片本体，也不证明可续传。

当前 `src/electronapp/apphost.js` 广告 `filedownload`；本地 `sync` 能力仍有条件。冻结 Web 的普通下载入口、同步任务界面和本地数据库代码不等于 ETE 已具有官方 Windows App 的下载后端。通用 `transfermanager` 与 `filerepository` 的下载／文件操作仍有占位实现，不能直接连接真实用户目录。

共享字节缓存另外只读核对 `a668fcd030792a4f0e5f02797ea058198183f8ec` 候选的 `preload-source-authority.js`、`shared-playback-cache/adapter.js`、`deferred-store.js` 与相关合同。该候选不是本分支依赖，也不表示预载最终验收状态。没有合入或修改缓存代码。

## 先区分三个产品层次

| 层次 | 具体行为 | 额外工作 |
| --- | --- | --- |
| 在线提前下载 | 联网进入媒体页，主动取回完整副本，后续在线播放可选择该副本 | 本地任务、来源匹配、完整性验证、播放源衔接 |
| 真正离线使用 | 无网络启动，浏览本地条目并播放，恢复网络后回传进度 | 离线目录、账户／权限模型、元数据和字幕、按账户归属的进度冲突处理 |
| Emby Downloads & Sync | ETE 作为服务器同步目标，接收服务器创建、转换、自动更新的任务 | 设备能力与身份、Premiere／权限、Ready／Transferred／移除协议、任务生命周期适配 |

Emby 官方明确区分网页直接下载与 Downloads & Sync。Folder Sync 则是服务端插件复制到服务器可访问的目录，不是自动写入 ETE 所在电脑。见 [Download Options](https://emby.media/support/articles/Sync.html)、[Offline Access](https://emby.media/support/articles/Offline-Access.html)、[Folder Sync](https://emby.media/support/articles/Folder-Sync.html)。

## 推荐的最小候选，等待范围确认

推荐先评估在线提前下载：从现有 Emby 媒体入口手动添加一个已选择版本的完整原文件任务，以 Electron 平台下载器传输，完成后仍沿原 PlaybackManager 播放。它不需要先重做离线浏览或官方同步客户端。以下是讨论用候选范围，尚未作为产品默认实现：

1. 查询当前用户权限与所选 Item／MediaSource，明确来源是普通 Emby 文件还是 STRM／CD2。确认返回的是影片本体，排除指针文本、登录页面、HLS 和直播。
2. 由主进程建立与服务器、账户、Item、MediaSource、资源表示绑定的任务；认证地址短期持有，不持久化 Token／Cookie／签名 URL。
3. 在用户确认的目录语义下预留独占任务位置，传输临时文件，显示真实已接收字节及可用的总长度。目录布局、命名和旧文件关系待决定，当前没有目录创建接口。
4. 校验 HTTP 终态、完整长度、表示身份及必要媒体信息，发布本地条目；下载器的 `done` 不单独等于可播放副本。
5. 用户发起播放时，核对同服务器、账户和媒体版本；下载副本的优先级及服务端不可访问时的行为待决定。继续沿原 Item／MediaSource／Session／远控／Together 生命周期，不绕过原权限。

如果实际目标主要是 STRM／CD2，应先完成该来源的影片本体与短链刷新验证，再决定首批范围。不能先做普通媒体下载后宣称覆盖 STRM。转码下载需要对应的本地 MediaSource／轨道信息，不能仅替换最终 URL；原画是否足够须由产品选择。

## 借用哪些成熟实现

| 参考 | 能借用的经验／能力 | 不能据此承诺 |
| --- | --- | --- |
| Electron 44.4.2 DownloadItem | 指定保存位置、进度、暂停、续传；Session 的 createInterruptedDownload 可重建中断任务 | API 存在不等于带认证的跨重启续传已跑通。文档要求 Range、Last-Modified 与 ETag，否则可能重下 |
| electron-dl | 下载与窗口／任务关联、进度、重名处理；MIT | 项目明确只在应用运行期间自动恢复，不提供跨重启任务持久化或媒体索引。当前不新增依赖 |
| Jellyfin MPV Shim | 主进程单一下载归属、部分文件、目录索引、离线进度的账户归属和用户文件保护案例 | Jellyfin API／Python 架构不能直接套入 ETE；整体 GPLv3，与当前 ETE GPL-2.0-only 不直接合并实现 |

来源：[固定 Electron 下载接口](https://raw.githubusercontent.com/electron/electron/v44.4.2/docs/api/download-item.md)、[固定 Session 接口](https://raw.githubusercontent.com/electron/electron/v44.4.2/docs/api/session.md)、[electron-dl](https://github.com/sindresorhus/electron-dl)、[其 MIT 许可](https://github.com/sindresorhus/electron-dl/blob/main/license)、[Shim 设计目标](https://github.com/jellyfin/jellyfin-mpv-shim/blob/3b2fcd8a7de923b1d9ce053a972010498884a51e/docs/offline-sync-goals.md)、[Shim 许可](https://github.com/jellyfin/jellyfin-mpv-shim/blob/3b2fcd8a7de923b1d9ce053a972010498884a51e/LICENSE.md)、[ETE 许可](LICENSING.md)。本分支没有复制这些项目的代码。

Electron 优先只是传输选型建议。正式接线前需要隔离真实 Electron 测试带认证请求、重定向隔离、强校验器及恢复，确认是否足够；若不够再比较受控 HTTP 传输，不放宽来源校验来迁就平台 API。文件断电持久性、来源的可信摘要和跨盘迁移均不由平台下载状态保证。

## 与预载／最后播放暂存的兼容合同

- 当前缓存的 M+P、实际播放归属、未播 next 退出丢弃及最后实际播放保留属于原任务；本分支不修改这些规则。
- 完整下载需要独立存储所有权，不能偷偷增加 current／next 角色或占用现有 M+P。下载是否保留、何时删除及是否自动腾空间均未定。
- 共用的是经授权的媒体／表示描述及验证观念，不共用可任意删除的目录。稀疏缓存的 coverage 数量不等于完整文件，必须核对连续覆盖、每块有效性与相同表示。
- 缓存提升为下载只能是后续显式事务：取得读取租约、验证所有数据、复制或转移到明确的下载所有权，成功前不释放原数据。当前不实现提升或硬链接。
- 当前 preload authority 的凭据绑定文档、代次和播放／next 角色。持久下载不能延长或挪用其凭据；应有独立账户归属与重新授权协议，不改变预载的失效守卫。
- 下载期间切换账户、登出或页面销毁，不得把旧任务改记为新账户。暂停／继续的产品行为仍须决定；任何恢复均核对原归属。
- 完整下载的播放优先级、离线播放和失败回源需单独接线，不修改原预载修复，也不由本分支猜测其最终接口。

## 本分支唯一基础接口

`src/electronapp/enhanced/advance-download/response-contract.js` 是未接线的纯函数模块，不导入网络、文件系统、Electron、缓存或播放器，不产生用户数据副作用。

```js
const {inspectResponse, finishResponse} = require('./response-contract');
const plan = inspectResponse(
    {offset: 4, total: 8, etag: '"original"'},
    {statusCode: 206, headers: {
        'content-range': 'bytes 4-7/8', 'content-length': '4', etag: '"original"'
    }}
);
// plan.action === 'receive': transport framing permits receiving these bytes.
const body = finishResponse(plan, {receivedBytes: 4, messageComplete: true});
// body.action === 'body-accepted'; this is not a file-completion record.
```

接口前提与结果：

- 调用者先绑定可信来源、原字节表示与已知正总长度；offset 为实际已验证的前缀长度。模块不授予访问权，也不能验证这些外部前提。
- offset > 0 必须具有强 ETag，传输端实际发送 Range 与该 If-Range。未知／弱校验器不允许追加。这里采用保守强校验，未决定所有下载源必须支持续传；不能续传的来源仍可另选完整重下。
- `receive` 返回该响应的接收区间和精确期望长度。允许有界 206 和无 Content-Length 的响应，但必须在清洁结束后检查实际字节。
- `restart-required` 只表达必须先明确重新传输；不会清空／覆盖已有部分文件，也不选择自动重试策略。
- 401／403、重定向、416、错区间、错长度、校验器改变、内容编码和 multipart 返回固定原因的拒绝结果。416 或 offset 等于总长均不当成文件已完成。
- `finishResponse` 只接受本模块产生的冻结 plan；拒绝短体、超长体和不完整 HTTP 消息。`representationEndReached` 只表示结构上到达末尾，磁盘验证、可信摘要、来源本体识别和完成发布另属后续实现。
- 严格 HTTP 解析器、响应流中及时限制超量字节、取消、超时、持久任务、路径安全与鉴权重定向仍属将来的 transport／store，不由这个纯接口提供。

HTTP 条件请求与区间语义参考 [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.5)。这里是 ETE 独立实现，不保证与 Chromium 内部下载决策一一对应；未来是否使用该模块需由选定传输适配器证明。

## 需要用户决定的产品问题

首先讨论三个会改变架构的问题，再讨论其余交互，不把所有问题一次抛给用户：

| 优先级 | 待决定问题 | 方案分歧与建议 |
| --- | --- | --- |
| 第一轮 | “提前下载”是否必须在完全断网时启动、浏览和播放？ | 推荐先做在线提前下载；若必须离线，目录／身份／进度同步进入首版规格，工作量和验收矩阵显著增加。尚未选择 |
| 第一轮 | 想利用的是现有下载按钮／目录设置，还是已经下载好的旧文件？ | 前者可补 ETE 后端；后者需要明确具体客户端、文件格式和可信映射。默认不扫描、不迁移、不删除现有目录；任何接管范围待授权与设计 |
| 第一轮 | 核心片源是普通 Emby 影片，还是 STRM／CD2 影片？ | 两者地址与认证不同；STRM 需验证拿到影片本体。若主要目标为 STRM，应优先验证它，不能用普通媒体成功代替 |
| 第二轮 | 手动单片还是整季／自动后续集？ | 推荐先单片，自动策略后置；这不是已批准范围 |
| 第二轮 | 只保留原画，还是要求转码质量选择？ | 推荐先原画；转换表示需独立媒体轨道与版本匹配 |
| 第二轮 | 完整下载属于长期用户文件还是可自动淘汰的副本？ | 推荐独立于 M+P、明确保留；具体额度／看完删除／空间不足行为待决定 |
| 第二轮 | “移除下载”删除文件、只移除记录，还是询问？ | 不能把 Emby SyncJobs 的删除协议直接套到用户已有文件；当前没有删除接口 |
| 第二轮 | 相同版本下载完成后自动优先，还是每次由用户选？ | 决定播放路由和 UI；服务端不可达时的行为也属于这个决定 |
| 第二轮 | 关闭 ETE／切换账户后任务怎样继续？ | 关闭后后台服务会增加部署与生命周期范围；推荐先研究应用内暂停／恢复，尚未确定 |

Emby SyncJobs 的自动下载、未观看筛选及任务移除可触发文件删除，与永久保留的用户下载存在产品语义差异，见 [Download Jobs](https://emby.media/support/articles/Sync-Jobs.html)。在决定前不广告 ETE 为原生同步目标、不创建服务端任务、不接管旧目录。

## 本轮验证与下一步

`node --test tests/advance-download-response-contract.test.cjs`：11/11 通过，0 fail／skip／cancel。使用合成状态、头部和字节计数，覆盖错误追加、同长度表示变化、弱／缺失校验器、短体／超长体、异常区间、认证／重定向和完成误判；无网络、媒体文件或真实目录操作。JavaScript 语法与 diff 检查通过。

没有运行真实 Electron／Emby／CD2、文件落盘或重启恢复、Windows、预载回归、完整构建和用户验收；没有接线变更，定向验证不冒充这些结果。产品方向明确后，下一步先对选定片源做隔离端点验证，再实现选定的 transport／store 与 UI；不先打包一个范围未定的下载功能。
