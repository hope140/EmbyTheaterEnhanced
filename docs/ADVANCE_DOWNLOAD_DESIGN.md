# 完整提前下载：在线方案与接线候选

状态：独立分支已接入原视频下载按钮、mainFrame IPC、目录设置、持久任务及同版本本地播放来源。关闭时保留任务，重新打开并登录对应账户后恢复。当前为未合入／未发布候选；合成集成与实际子进程证据不能代替 Windows 完整客户端及真实 Emby／CD2 验收。

## 明确的产品范围

- 服务器在线时提前下载完整文件，之后在 ETE 中播放；不要求断网启动或离线浏览。
- 离线需要由使用者去下载目录找到视频文件，因此最终交付普通媒体文件，不做 ETE 专属封装。
- 沿用原下载按钮；第一次选择目录后记住，后续默认使用。
- 重点支持现有 STRM／CD2。可播放来源应尽可能下载，但必须测量影片本体、鉴权、换签和 Range；播放能力不自动证明完整下载能力。
- 关闭 ETE 停止传输并保留未完成任务，下次打开并登录原账户后继续；不做后台常驻。
- 设置中可改默认目录，仅新任务使用新目录，已有任务及文件不自动搬迁。
- 不接管旧下载、不删除已下载文件，不修改预载／最后播放暂存的 M+P、归属和清理规则。

在线完整下载、真正离线客户端与 Emby Downloads & Sync 仍是不同层次。官方网页直接下载不属于 Downloads & Sync；Folder Sync 是服务端插件复制到服务端可访问目录。当前无需先将 ETE 广告为同步设备，也不创建服务端同步任务。来源：[Download Options](https://emby.media/support/articles/Sync.html)、[Offline Access](https://emby.media/support/articles/Offline-Access.html)、[Folder Sync](https://emby.media/support/articles/Folder-Sync.html)。

## 当前代码基线与隔离

基线为 main `2d0acf314cd58d7dcb8b61e0e95ac5d1647b3d96`；首轮无副作用合同提交为 `80a30acdd56f599b0a7631f2c4e13c24388b5e54`。当前维护 API 由 `src/web-api/src/apiclient.js` 继承固定 MIT 输入；`src/web-api/src/mit-apiclient.js#getItemDownloadUrl` 仍生成指定版本的原下载地址。原下载按钮与权限入口可复用，不能把 URL 生成成功当成影片下载成功。

共享缓存另外只读核对 `a668fcd030792a4f0e5f02797ea058198183f8ec` 的授权／适配器与合同；它不是本分支依赖，也不代表预载最终验收状态。本分支没有移动、合入或修改缓存分支；未改 PlaybackManager、resolver 或 CD2 service 的共享源码。main 与 libmpv 仅增加独立下载服务和最终来源选择接线。

## 收敛的实现路径

数据流为原视频下载按钮 → mainFrame 校验 → 当前账户的下载取源会话 → 记忆目录选择 → 独占临时文件与持久检查点 → 完整校验与无覆盖提交 → 完成索引 → 原播放链按同版本选本地文件。生产接线已在独立分支完成，尚未经过完整客户端验收。

### 取源会话

`src/electronapp/enhanced/advance-download/source-session.js`：

1. 接收服务器、账户、Item 和显式 MediaSource 身份，以及仅在内存使用的当前 Token。
2. 通过选定服务器 API 重新读取 Public Info、用户下载权限与 Item／MediaSources；不是直接信任 renderer DTO，也不借用播放或预载凭据。
3. 校验服务器 ID、用户和 Item 身份、视频类型、CanDownload 与下载权限。多个版本未选择时拒绝，不猜测首个版本；换签时不静默切版本。
4. 复用原 STRM resolver，采用公共 resolver 配置及另一个独立 CD2 service 的运行配置；下载拥有自己的 requestId、取消、连接和 close，不操作预载作业。
5. 候选依次来自解析结果、主进程获取的 HTTP MediaSource、直链失败后的 CD2 同源重取，以及原 Emby 下载接口。源提供者支持的额外请求头限 User-Agent；不将 Emby Token 转发到媒体 CDN。
6. 每次 acquire 都重新授权、取源和探测；签名 URL 变化可以接受，但已知强 ETag、长度或表示身份变化不能沿用原任务字节。close 退休任务并取消所属请求。

`ipc.js` 只允许当前打包文档的 mainFrame 入口创建会话；忽略 renderer 指定的下载目录，目录只经主进程原生选择器取得。导航／崩溃／退出退休文档代次、停止传输并加入清理；不同账户互不接管。请求总期限为 30 秒，单个 HTTP 探测期限 8 秒；不改变播放解析的原预算。

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
- 持久任务取消／失败保留自身临时文件与检查点；不带持久任务的核心调用仍只清理其可证明归属的临时文件。交换过的路径不会被误删。没有删除、接管、搬迁或清理已有完整下载的接口。
- 跨应用重启先检查文件物理身份和已提交前缀摘要，再重新授权、取源；只有强 ETag、源身份与非零 Range 校验都一致时追加。不满足时明确提示并从头写自身临时文件；不能保证所有 STRM／CD2 可续。
- 支持硬链接时仍走原无覆盖link提交。Windows仅在硬链接能力错误时，先持久记录移动意图，再由独立隐藏助手锁定目录祖先和源文件句柄，核对物理身份／大小／修改时间，以`SetFileInformationByHandle(FileRenameInfo)`且`ReplaceIfExists=false`进行同目录提交；已有文件／目录原样保留并尝试编号名。没有整片复制、覆盖rename或删除目标的后备路径。

HTTP 条件请求与区间语义见 [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.5)。上述属于协议与文件归属实现，不授予额外服务器权限。

## 与预载和现有能力的关系

缓存的 M+P、实际播放归属、未播 next 退出丢弃及最后实际播放保留属于原功能；完整下载不占这些额度，不新增缓存角色。当前没有读取或提升缓存内容，重复首部探测不应统计成预载命中。

若后续复用缓存，只共用授权媒体描述与明确的读取租约；稀疏 coverage 数量不等于完整文件。提升须验证完整连续覆盖和相同表示，再建立独立下载所有权，不能挪用预载的文档／代次凭据或删除权限。

Emby SyncJobs 的看完删除、自动追更和取消任务删除，均不适用于当前的用户完整下载。[官方任务语义](https://emby.media/support/articles/Sync-Jobs.html)不能直接套用。

参考了 [Electron 44.4.2 下载接口](https://raw.githubusercontent.com/electron/electron/v44.4.2/docs/api/download-item.md)、[Session 接口](https://raw.githubusercontent.com/electron/electron/v44.4.2/docs/api/session.md)、[electron-dl](https://github.com/sindresorhus/electron-dl) 和 [Jellyfin MPV Shim 设计目标](https://github.com/jellyfin/jellyfin-mpv-shim/blob/3b2fcd8a7de923b1d9ce053a972010498884a51e/docs/offline-sync-goals.md)。electron-dl 为 MIT，明确不提供跨应用重启恢复；Shim 整体 GPLv3，当前 ETE 维护层 GPL-2.0-only，未复制其实现。目录偏好模式只复用本仓库已有维护代码。

## 持久化、界面与播放

`task-store.js` 仅在 profile 的 `advance-downloads/<UUID>.json` 保存白名单字段：服务器／账户／Item／版本身份、任务快照目录、固定临时文件名、文件与根目录物理身份、已提交偏移及 SHA256、clean end、最终文件身份和完整摘要。Token、URL 查询签名、请求头均不落盘；损坏或不符合 schema 的记录保留并拒绝接管，不扫描用户媒体目录认领文件。

`transfer.js` 每写入 8MiB 或有数据到来且超过一秒，先 sync 自身文件，再原子保存检查点。正常关闭保存最新进度；强制结束后仅信任已持久偏移，重新哈希该前缀，截断自身文件未提交尾部，再测 Range。物理文件被替换时停止，自己的字节损坏或来源变化时通知并重下。读完全部字节但消息未 clean end 不算完成。link 成功而完成索引尚未保存的崩溃窗口，通过 `publishing` 名称和同一物理文件恢复提交。无硬链接移动另先记录`publishMethod=move`；临时文件消失时，只有同一根目录／文件物理身份、完整长度、clean end及全文件SHA都与记录一致，才恢复索引。身份不稳定／文件被换过即停止，不能凭同名或相同内容接管旧文件。助手失去应答时保留意图和文件，重试先核验；关闭会等待这个有界提交助手退出，不遗留后台传输。sync 与进程重启证据不等于全部平台断电耐久保证。

`manager.js` 单任务顺序传输。当前登录凭据只在内存，重开后的对应账户 attach 才继续；来源版本变化的运行内重启次数有限，失败任务提供手动继续。未完成任务保持创建时目录。完成任务不进入缓存清理，也没有删除入口。

固定 Web commandprocessor 的窄 overlay 只接管视频按钮，音频／日志／字幕继续原实现；冻结输入保持只读，缺失／重复锚点拒绝生成。apphost 启动账户绑定；“下载”设置页可查看进度、实际保存目录、失败及继续、更改默认目录。任务标题和路径按文本渲染，旧刷新／页面退休后的回调不能回写。

播放优先级：非 Transcode 的已选版本，若有本账户完成记录，则重新授权和探测来源（查找最多五秒），核对记录、实际文件身份／大小／修改时间及首部摘要后使用本地文件；无记录时立即走原解析，不扫描媒体目录。失配／超时回原来源。下载查找取消或旧播放代次退休不能迟到启动播放器；PlaybackManager、Item、MediaSource、Session、远控及 Together 的所有权保持原链。Transcode 保持服务端转码。

无强 ETag 的完整文件可下载并用于同版本本地播放，但远端中段在长度／版本／首部都未变化时不能可靠发现变化；这不是全文件远端摘要证明。中断后的追加仍严格要求强 ETag。外部字幕、服务器离线登录／浏览和离线进度同步不属于本轮。

## 验证与边界

公开定向入口：

```sh
node --test tests/advance-download-*.test.cjs tests/native-helper-diagnostics-playback.test.cjs
```

测试使用回环 HTTP、实际 resolver／独立 CD2 service、合成 gRPC transport、实际文件系统和独占临时 profile。原按钮 → renderer → main IPC → 真实下载会话 → 本地文件／播放查找的集成覆盖目录记忆、换目录、源变更、旧文件保留；播放器测试使用实际 libmpv 模块与模拟 Native helper，覆盖命中、回退、转码和过时代次。

跨进程测试启动两个独立 Node 子进程：正常关闭后重开；以及下载超过 8MiB 检查点后强制结束，重开验证前缀、截去未提交尾部并从已提交偏移续传，最终字节完全一致。它验证实际进程重启和真盘协议，不是完整 Electron／Windows 或真实服务器验收。

首轮取源24/25，原因是直链失败后的同源回退缺少规范化 sourcePath；补齐后25/25。早期扩大回归93/94，原因是新工作树缺锁定gRPC依赖；按lock执行npm ci后通过。没有弱化权限／哈希断言。该核心阶段最终95/95，独立真实媒体自测1/1；后续接线的准确回归结果记录于[开发日志](DEVELOPMENT_LOG.md)，不把历史结果当作最终源码验收。

真实媒体自测显式选取已安装工具，不计为平台 skip：

```sh
ETE_ADVANCE_DOWNLOAD_FFMPEG=/absolute/path/to/ffmpeg ETE_ADVANCE_DOWNLOAD_FFPROBE=/absolute/path/to/ffprobe node --test tests/advance-download-media-selftest.cjs
```

自生成两秒64×64 FFV1／Matroska视频，经取源、断流、重授权、续传和真盘保存后，比对完整SHA256、FFprobe识别及20帧解码哈希。它只证明自有测试视频，不证明任意容器或实际片源。

本环境没有附真实 Emby／CD2 地址及凭据，未访问真实服务或用户目录。真实 DTO／下载权限、401 换签、TLS／限流、Windows 原生选择器与文件身份／硬链接语义、外接盘／网络盘和完整客户端仍需现有授权测试通道验收。Windows无硬链接提交已有独立候选；实际Windows结果按开发日志与准确CI记录。尚未在真实FAT／exFAT、网络盘或移动设备验证文件ID在重命名／重挂载后的稳定性；不能宣称任意目录可恢复，无法核验时保留文件并拒绝自动接管。FAT32单文件大小限制仍适用；写入返回EFBIG时明确说明限制并保留任务。没有操作 Work 前台、推送、合 main、发布或部署。

## Windows 无硬链接提交依据与验收范围

微软[文件系统比较](https://learn.microsoft.com/en-us/windows/win32/fileio/filesystem-functionality-comparison)列明FAT32／exFAT不支持硬链接；FAT32单文件限制与exFAT大文件能力必须分开。Win32[FILE_RENAME_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_rename_info)明确`ReplaceIfExists=false`在目标存在时返回错误；本实现用[SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileinformationbyhandle)修改已核验源句柄，保持同目录、锁住祖先、不跟随reparse。新代码为本仓库维护实现，没有复制外部项目实现。微软[文件身份说明](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/ns-fileapi-by_handle_file_information)明确FAT重命名为更长名称可能改变ID；新任务的独占临时文件名预留133个UTF-16单元，长于所有生成最终名及编号后缀，以减少目录项扩容导致的ID变化。仍从提交源句柄取得移动后的ID用于正常完成；旧短临时名记录继续可读。如果移动已成功但应答丢失且ID也变化，只保留文件并拒绝自动接管，不靠摘要猜测身份。

新增`advance-download-publication.test.cjs`进入现有自动Windows公开集，不改工作流／权限：便携测试验证意图顺序、不覆盖模型、助手未知结果清理和索引恢复；Windows专属项真正调用API，覆盖Unicode路径、同名文件／目录、错误物理身份／大小，以及强制模拟“硬链接不支持”的完整HTTP到磁盘链。模拟能力失败发生于Windows普通临时目录，不能冒充实际FAT／exFAT测试；Linux跳过Windows项不计为通过。


## 下载管理与来源核验失败

设置入口统一显示“下载管理”。保存位置卡片显示可选择复制的完整目录，任务显示自己的原目录；完成任务显示完整文件路径。默认目录及各任务提供“打开文件夹”，main只接受当前账户的任务ID或已保存默认目录，拒绝renderer指定路径，不打开视频或外部URL。轮询保留现有任务DOM和操作按钮。

原视频“下载”先选择／读取默认目录，再进行服务端身份、账户权限、条目和版本核验，最后解析／探测影片本体；选择目录不授予来源权限，不会提前写媒体文件。在设置取消首次目录选择不保存值，也不保留选择器busy状态；随后点击下载应重新选择。已有默认目录则自动使用，不重复弹框，覆盖安装不会自动清空已有偏好。

来源预检失败尚无可授权的source receipt，不构造伪造文件任务。当前进程为每个来源保留有界诊断行，记录固定失败原因和阶段，可在管理页重试，退出后这些预检诊断不保留；真正进入传输的任务仍按原合同持久化、重开续传。诊断不保存Token、解析URL或服务器错误正文，失败也不创建影片文件。

资料请求显式发送`Accept: application/json`。STRM身份按既有`Item.Path`／resolver合同判断，不能只用`Container`：即使Container为mkv，Size仍可能是sidecar值，故STRM不使用该Size推断影片长度，继续验证实际HTTP长度、首部、版本和Range。普通视频仍校验可信的Size提示。合成案例已复现这两类兼容问题；它们不证明任何具体真实服务的失败原因。

ETE单片和多选菜单overlay仅隐藏旧`sync`／`synclocal`设备同步入口，保留原`download`转交完整视频下载；服务器同步接口、已有同步任务与其他客户端不受更改。不编辑冻结vendor。
